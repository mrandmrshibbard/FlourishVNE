import React, { useMemo, useRef, useState } from 'react';
import { VNPaintStage } from '../../../types/miniGames';
import { MiniGameRenderCtx } from './types';
import { useImageBox } from './useImageBox';
import { ColorableRegion, RegionPulseStyle, RegionClip, StrokeApi, SwatchBar, resolvePalettes, useMaskHitTesters } from './coloring';

/**
 * Painting/coloring: tap a swatch, then tap a region to fill it — plus an optional
 * author-enabled player BRUSH (strokes clipped to the region the stroke starts in, so
 * paint can never bleed outside the lines). Mask-driven CSS fills (no canvas readback of
 * the art = no taint risk); regions are recolorable until the stage ends.
 *
 * Regions carrying a `colorSlot` report the color they're left with (last write wins) —
 * that's what feeds the game's palette→UI restyle and the {slot} variables on win.
 */

const TAP_SLOP_PX = 7;

export const PaintGameSurface: React.FC<{ ctx: MiniGameRenderCtx }> = ({ ctx }) => {
    const stage = ctx.stage as VNPaintStage;
    const regions = stage.regions || [];
    const baseUrl = stage.baseImageId ? ctx.assetResolver(stage.baseImageId, 'image') : null;
    const tintMode = stage.tintMode || 'multiply';
    const allowBrush = !!stage.allowBrush;
    const requireAll = stage.requireAllRegions !== false;

    const palettes = useMemo(() => resolvePalettes(stage.palettes, stage.paletteIds, ctx.project), [stage.id, ctx.project]);
    const [activeColor, setActiveColor] = useState<string>(palettes[0]?.colors[0] || '#ef4444');

    const boardRef = useRef<HTMLDivElement>(null);
    const box = useImageBox(boardRef, baseUrl);

    const maskUrl = (r: (typeof regions)[number]) => (r.maskImageId ? ctx.assetResolver(r.maskImageId, 'image') : null);
    const maskUrls = useMemo(() => regions.map(maskUrl), [stage.id, ctx.project]);
    const testers = useMaskHitTesters(maskUrls);

    const [fills, setFills] = useState<Record<string, string>>({});
    const paintedRef = useRef<Set<string>>(new Set());
    const strokeApisRef = useRef<Record<string, StrokeApi | null>>({});
    const wonRef = useRef(false);
    const dragRef = useRef<{ regionKey: string | null; startX: number; startY: number; moved: boolean } | null>(null);

    if (!regions.length) {
        return (
            <button onClick={() => ctx.reportWin()} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.85)', fontSize: 15 }}>
                <span style={{ fontSize: 32 }}>🎨</span>
                <span>No paint regions yet — add them in the Mini Games tab.</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Tap to continue</span>
            </button>
        );
    }

    /** Region's clip description (mask PNG spans the whole image box; shapes are clip-paths). */
    const clipFor = (r: (typeof regions)[number], i: number): RegionClip => {
        const u = maskUrls[i];
        if (u) return { maskUrl: u, maskFit: 'stretch' };
        const x = r.x ?? 30, y = r.y ?? 30, w = r.w ?? 40, h = r.h ?? 40;
        if ((r.shape || 'rect') === 'ellipse') {
            return { shapeClip: `ellipse(${w / 2}% ${h / 2}% at ${x + w / 2}% ${y + h / 2}%)` };
        }
        return { shapeClip: `inset(${y}% ${Math.max(0, 100 - x - w)}% ${Math.max(0, 100 - y - h)}% ${x}%)` };
    };

    /** Topmost region under an image-% point (later regions render on top). */
    const hitRegion = (xPct: number, yPct: number): string | null => {
        for (let i = regions.length - 1; i >= 0; i--) {
            const r = regions[i];
            const u = maskUrls[i];
            if (u) {
                const test = testers.current[u];
                if (test ? test(xPct, yPct) : false) return r.id;
            } else {
                const x = r.x ?? 30, y = r.y ?? 30, w = r.w ?? 40, h = r.h ?? 40;
                if ((r.shape || 'rect') === 'ellipse') {
                    const dx = (xPct - (x + w / 2)) / (w / 2), dy = (yPct - (y + h / 2)) / (h / 2);
                    if (dx * dx + dy * dy <= 1) return r.id;
                } else if (xPct >= x && xPct <= x + w && yPct >= y && yPct <= y + h) return r.id;
            }
        }
        return null;
    };

    const boardPct = (e: React.PointerEvent) => {
        const host = boardRef.current;
        if (!host || !box.width || !box.height) return null;
        const rect = host.getBoundingClientRect();
        return {
            x: ((e.clientX - rect.left - box.left) / box.width) * 100,
            y: ((e.clientY - rect.top - box.top) / box.height) * 100,
        };
    };

    const markPainted = (key: string, color: string) => {
        paintedRef.current.add(key);
        const r = regions.find(x => x.id === key);
        if (r?.colorSlot) ctx.reportColors?.({ [r.colorSlot]: color });
        ctx.reportProgress?.(paintedRef.current.size / regions.length);
        if (requireAll && paintedRef.current.size >= regions.length && !wonRef.current) {
            wonRef.current = true;
            window.setTimeout(() => ctx.reportWin(), 450);
        }
    };

    const fillRegion = (key: string) => {
        setFills(f => ({ ...f, [key]: activeColor }));
        strokeApisRef.current[key]?.clear(); // a fresh fill replaces earlier brushwork
        ctx.playInteractSound();
        markPainted(key, activeColor);
    };

    const brushSizePct = Math.max(2, Math.min(20, stage.brushSizePct ?? 7));

    const onPointerDown = (e: React.PointerEvent) => {
        if (wonRef.current) return;
        const p = boardPct(e);
        if (!p) return;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        const key = hitRegion(p.x, p.y);
        dragRef.current = { regionKey: key, startX: e.clientX, startY: e.clientY, moved: false };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d || !allowBrush || !d.regionKey) return;
        if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < TAP_SLOP_PX) return;
        d.moved = true;
        const p = boardPct(e);
        if (!p) return;
        // Strokes stay in the region the stroke STARTED in (coloring-book behavior).
        strokeApisRef.current[d.regionKey]?.stamp(p.x, p.y, activeColor, brushSizePct);
    };
    const onPointerUp = () => {
        const d = dragRef.current;
        dragRef.current = null;
        if (!d || wonRef.current || !d.regionKey) return;
        if (d.moved) {
            // A brush stroke marks the region painted with the brush color.
            ctx.playInteractSound();
            markPainted(d.regionKey, activeColor);
        } else {
            fillRegion(d.regionKey);
        }
    };

    return (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
            <RegionPulseStyle />
            <div
                ref={boardRef}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
                style={{ position: 'relative', flex: 1, minHeight: 0, touchAction: 'none', cursor: 'crosshair' }}
            >
                <div style={{ position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height, pointerEvents: 'none' }}>
                    {baseUrl && <img src={baseUrl} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />}
                    {regions.map((r, i) => (
                        <ColorableRegion
                            key={r.id}
                            clip={clipFor(r, i)}
                            fillColor={fills[r.id] || null}
                            tintMode={tintMode}
                            pulse={!paintedRef.current.has(r.id)}
                            strokeApiRef={allowBrush ? (api => { strokeApisRef.current[r.id] = api; }) : undefined}
                        />
                    ))}
                </div>
            </div>
            <SwatchBar
                palettes={palettes}
                activeColor={activeColor}
                onPick={c => { setActiveColor(c); ctx.playInteractSound(); }}
                trailing={!requireAll ? (
                    <button
                        onClick={() => { if (!wonRef.current) { wonRef.current = true; ctx.reportWin(); } }}
                        style={{ flexShrink: 0, marginLeft: 6, padding: '6px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(16,185,129,0.85)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        ✓ Done
                    </button>
                ) : undefined}
            />
        </div>
    );
};

export default PaintGameSurface;
