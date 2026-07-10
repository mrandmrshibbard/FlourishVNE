import React, { useEffect, useMemo, useRef, useState } from 'react';
import { VNID } from '../../../types';
import { VNProject } from '../../../types/project';
import { VNArtPalette } from '../../../types/miniGames';

/**
 * Shared coloring machinery for the paint stage AND the assemble stage's Build & Color
 * block: palette resolution, the player swatch bar, mask-clipped fill/stroke rendering,
 * and mask alpha hit-testing. Engine module — i18n-free, pointer events + touch-action
 * none everywhere (Android WebView parity), no dropTargetRegistry.
 *
 * Rendering is pure CSS mask-image + backgroundColor (+ mix-blend-mode multiply when the
 * tint mode keeps shading) — the base art itself is never read back, so there's no canvas
 * taint risk on the FILL path. The optional player brush draws on a per-region canvas that
 * is itself CSS-masked/clipped, so strokes can never escape the region.
 */

/** Fallback swatches so a coloring surface with no configured palette never bricks. */
export const DEFAULT_COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#8d5524', '#ffffff', '#1e293b'];

/** Inline stage palettes + referenced Art Studio (project.artPalettes) schemes, in that
 *  order; falls back to one default scheme when nothing usable is configured. */
export function resolvePalettes(
    inline: { id: VNID; name: string; colors: string[] }[] | undefined,
    paletteIds: VNID[] | undefined,
    project: VNProject,
): VNArtPalette[] {
    const out: VNArtPalette[] = [];
    (inline || []).forEach(p => { if (p.colors?.length) out.push(p); });
    const shared = (project as any).artPalettes as VNArtPalette[] | undefined;
    (paletteIds || []).forEach(id => {
        const p = (shared || []).find(x => x.id === id);
        if (p && p.colors?.length && !out.some(x => x.id === p.id)) out.push(p);
    });
    if (!out.length) out.push({ id: 'default' as VNID, name: 'Colors', colors: DEFAULT_COLORS });
    return out;
}

/** The player's color picker: palette tabs (when >1 scheme) + big tap-friendly swatches. */
export const SwatchBar: React.FC<{
    palettes: VNArtPalette[];
    activeColor: string;
    onPick: (color: string) => void;
    /** Optional trailing slot (the paint stage's Done button). */
    trailing?: any;
}> = ({ palettes, activeColor, onPick, trailing }) => {
    const [paletteIdx, setPaletteIdx] = useState(0);
    const palette = palettes[Math.min(paletteIdx, palettes.length - 1)] || palettes[0];
    return (
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 8px', margin: 4, borderRadius: 10, background: 'rgba(0,0,0,0.55)' }}>
            {palettes.length > 1 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {palettes.map((p, i) => (
                        <button key={p.id} onClick={() => setPaletteIdx(i)}
                            style={{
                                padding: '2px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
                                border: `1px solid ${i === paletteIdx ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)'}`,
                                background: i === paletteIdx ? 'rgba(255,255,255,0.18)' : 'transparent',
                                color: i === paletteIdx ? '#fff' : 'rgba(255,255,255,0.65)',
                            }}>{p.name || `Palette ${i + 1}`}</button>
                    ))}
                </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
                {(palette?.colors || DEFAULT_COLORS).map((c, i) => {
                    const active = c.toLowerCase() === activeColor.toLowerCase();
                    return (
                        <button key={`${c}-${i}`} onClick={() => onPick(c)} aria-label={c}
                            style={{
                                flexShrink: 0, width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', background: c,
                                border: active ? '3px solid #fff' : '2px solid rgba(255,255,255,0.35)',
                                boxShadow: active ? '0 0 0 2px rgba(0,0,0,0.5), 0 0 10px rgba(255,255,255,0.4)' : '0 1px 3px rgba(0,0,0,0.5)',
                                transform: active ? 'scale(1.12)' : undefined, transition: 'transform 0.12s, border 0.12s',
                            }} />
                    );
                })}
                {trailing}
            </div>
        </div>
    );
};

/** Mask/clip description for one colorable region. Exactly one of maskUrl / shapeClip set. */
export interface RegionClip {
    /** Alpha-mask image URL (paint-region mask PNG, or a piece's own art). */
    maskUrl?: string | null;
    /** 'stretch' = the mask spans the whole container (paint-stage full-image masks);
     *  'contain' = mask keeps its aspect, centered (matches an objectFit:'contain' piece). */
    maskFit?: 'stretch' | 'contain';
    /** CSS clip-path for plain shapes (rect/ellipse regions, slice-mode cells). */
    shapeClip?: string;
}

const maskStyles = (clip: RegionClip): React.CSSProperties => {
    if (clip.maskUrl) {
        const size = clip.maskFit === 'contain' ? 'contain' : '100% 100%';
        return {
            WebkitMaskImage: `url("${clip.maskUrl}")`, maskImage: `url("${clip.maskUrl}")`,
            WebkitMaskSize: size, maskSize: size,
            WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center', maskPosition: 'center',
        } as React.CSSProperties;
    }
    if (clip.shapeClip) return { clipPath: clip.shapeClip, WebkitClipPath: clip.shapeClip } as React.CSSProperties;
    return {};
};

/** Imperative stroke API a parent uses to draw brush dabs onto a region's canvas. */
export interface StrokeApi {
    /** Stamp a soft dab at (xPct,yPct) of the region container; size = % of container width. */
    stamp: (xPct: number, yPct: number, color: string, sizePct: number) => void;
    clear: () => void;
}

/**
 * One colorable region: tap-fill color layer + optional brush-stroke canvas, both clipped
 * to the region's mask/shape. Fill + strokes multiply over the art underneath when
 * `tintMode` is 'multiply' (keeps shading), or paint flat when 'replace'.
 */
export const ColorableRegion: React.FC<{
    clip: RegionClip;
    fillColor?: string | null;
    tintMode?: 'multiply' | 'replace';
    /** Gentle pulse marking a not-yet-painted region (colorable affordance). */
    pulse?: boolean;
    /** Mount a stroke canvas and hand back its imperative API (player brush enabled). */
    strokeApiRef?: (api: StrokeApi | null) => void;
}> = ({ clip, fillColor, tintMode, pulse, strokeApiRef }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const blend = (tintMode || 'multiply') === 'multiply' ? 'multiply' : 'normal';
    const clipCss = useMemo(() => maskStyles(clip), [clip.maskUrl, clip.maskFit, clip.shapeClip]);

    // Size the stroke canvas to the container once (cap 768 wide — dabs scale fine).
    useEffect(() => {
        if (!strokeApiRef) return;
        const host = hostRef.current, canvas = canvasRef.current;
        if (!host || !canvas) return;
        const rect = host.getBoundingClientRect();
        const w = Math.max(2, Math.min(768, Math.round(rect.width || 512)));
        const h = Math.max(2, Math.round(w * ((rect.height || 288) / Math.max(1, rect.width || 512))));
        canvas.width = w; canvas.height = h;
        const g = canvas.getContext('2d');
        const api: StrokeApi = {
            stamp: (xPct, yPct, color, sizePct) => {
                if (!g) return;
                const r = Math.max(2, (sizePct / 100) * w) / 2;
                const x = (xPct / 100) * w, y = (yPct / 100) * h;
                const grad = g.createRadialGradient(x, y, r * 0.25, x, y, r);
                grad.addColorStop(0, color);
                grad.addColorStop(1, `${color}00`); // hex+alpha — swatches are hex colors
                g.fillStyle = grad;
                g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
            },
            clear: () => { g?.clearRect(0, 0, canvas.width, canvas.height); },
        };
        strokeApiRef(api);
        return () => strokeApiRef(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [!!strokeApiRef]);

    return (
        <div ref={hostRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {fillColor && (
                <div style={{ position: 'absolute', inset: 0, background: fillColor, mixBlendMode: blend as any, ...clipCss, transition: 'background 0.2s' }} />
            )}
            {strokeApiRef && (
                <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: blend as any, ...clipCss }} />
            )}
            {pulse && (
                <div style={{ position: 'absolute', inset: 0, background: '#ffffff', ...clipCss, animation: 'mgRegionPulse 1.6s ease-in-out infinite', pointerEvents: 'none' }} />
            )}
        </div>
    );
};

/** Keyframes for the unpainted-region pulse (self-contained — no app CSS in exports). */
export const RegionPulseStyle: React.FC = () => (
    <style>{'@keyframes mgRegionPulse{0%,100%{opacity:0.04}50%{opacity:0.16}}'}</style>
);

/**
 * Alpha hit-tester for mask regions: samples the mask on a small offscreen canvas
 * (≤160px, willReadFrequently) and answers point-in-mask in container-% space.
 * Taint/failure fallback: report HIT (a broken mask must never make a region untappable).
 */
export function useMaskHitTesters(urls: (string | null | undefined)[]) {
    const testersRef = useRef<Record<string, (xPct: number, yPct: number) => boolean>>({});
    useEffect(() => {
        let alive = true;
        urls.forEach(url => {
            if (!url || testersRef.current[url]) return;
            const img = new Image();
            img.onload = () => {
                if (!alive) return;
                try {
                    const w = Math.max(8, Math.min(160, img.naturalWidth || 160));
                    const h = Math.max(8, Math.round(w * ((img.naturalHeight || 90) / Math.max(1, img.naturalWidth || 160))));
                    const c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    const g = c.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
                    if (!g) throw new Error('no ctx');
                    g.drawImage(img, 0, 0, w, h);
                    const data = g.getImageData(0, 0, w, h).data;
                    testersRef.current[url] = (xPct, yPct) => {
                        const x = Math.max(0, Math.min(w - 1, Math.round((xPct / 100) * w)));
                        const y = Math.max(0, Math.min(h - 1, Math.round((yPct / 100) * h)));
                        return data[(y * w + x) * 4 + 3] > 25;
                    };
                } catch {
                    // Tainted/unreadable mask: accept any point (never brick a region).
                    testersRef.current[url] = () => true;
                }
            };
            img.onerror = () => { if (alive) testersRef.current[url] = () => true; };
            img.src = url;
        });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urls.filter(Boolean).join('|')]);
    return testersRef;
}
