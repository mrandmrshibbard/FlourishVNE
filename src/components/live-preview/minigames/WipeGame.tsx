import React, { useEffect, useMemo, useRef, useState } from 'react';
import { VNWipeStage } from '../../../types/miniGames';
import { MiniGameRenderCtx } from './types';

/**
 * Wipe-away reveal: a cover (color / image / frost) is drawn onto a canvas and the player
 * scrubs it off with `destination-out` brush stamps. Winning = clearing ≥ winRevealPercent.
 *
 * Progress is measured on a ≤128px offscreen sample canvas (getImageData alpha count),
 * throttled to ≥300ms and pointer-up — NEVER per pointermove (a full-res readback per move
 * melts low-end devices). If the cover image taints the canvas (getImageData throws), a
 * coarse visited-grid fallback keeps the game winnable: every stamped cell counts.
 */

const SAMPLE_MAX = 128;      // longest side of the progress sample canvas
const SAMPLE_MIN_MS = 300;   // min interval between mid-stroke samples
const GRID_COLS = 24;        // taint-fallback visited grid
const GRID_ROWS = 14;

/** Cached brush stamp (white shape on transparency; drawn with destination-out so alpha = erase). */
function buildStamp(style: string, sizePx: number, customImg: HTMLImageElement | null): HTMLCanvasElement {
    const d = Math.max(4, Math.ceil(sizePx));
    const c = document.createElement('canvas');
    c.width = d; c.height = d;
    const ctx = c.getContext('2d');
    if (!ctx) return c;
    const r = d / 2;
    if (style === 'custom' && customImg) {
        ctx.drawImage(customImg, 0, 0, d, d);
    } else if (style === 'hardRound') {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
    } else if (style === 'sponge') {
        // Noise blob: many small soft circles jittered inside the radius.
        for (let i = 0; i < 46; i++) {
            const a = Math.random() * Math.PI * 2;
            const rr = Math.sqrt(Math.random()) * r * 0.9;
            const cr = r * (0.08 + Math.random() * 0.16);
            const g = ctx.createRadialGradient(r + Math.cos(a) * rr, r + Math.sin(a) * rr, 0, r + Math.cos(a) * rr, r + Math.sin(a) * rr, cr);
            g.addColorStop(0, 'rgba(255,255,255,0.85)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(r + Math.cos(a) * rr, r + Math.sin(a) * rr, cr, 0, Math.PI * 2); ctx.fill();
        }
    } else {
        // softRound (default): radial falloff.
        const g = ctx.createRadialGradient(r, r, 0, r, r, r);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.65, 'rgba(255,255,255,0.9)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, d, d);
    }
    return c;
}

export const WipeGameSurface: React.FC<{ ctx: MiniGameRenderCtx }> = ({ ctx }) => {
    const stage = ctx.stage as VNWipeStage;
    const { assetResolver } = ctx;

    const hostRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [box, setBox] = useState({ w: 0, h: 0 });
    const [won, setWon] = useState(false);
    const [clearing, setClearing] = useState(false);

    // Mutable stroke/progress state (never re-renders mid-stroke).
    const drawRef = useRef<{
        ctx2d: CanvasRenderingContext2D | null;
        dpr: number;
        stamp: HTMLCanvasElement | null;
        brushPx: number;
        last: { x: number; y: number } | null;
        initialOpaque: number;      // sample-canvas denominator (0 = not measured yet)
        lastSampleAt: number;
        tainted: boolean;
        visited: Set<number>;       // taint-fallback grid cells
        stamped: boolean;
        wonReported: boolean;
    }>({ ctx2d: null, dpr: 1, stamp: null, brushPx: 0, last: null, initialOpaque: 0, lastSampleAt: 0, tainted: false, visited: new Set(), stamped: false, wonReported: false });

    const coverType = stage.coverType || 'color';
    const coverUrl = coverType === 'image' && stage.coverImageId ? assetResolver(stage.coverImageId, 'image') : null;
    const coverMaskUrl = stage.coverMaskImageId ? assetResolver(stage.coverMaskImageId, 'image') : null;
    const revealUrl = stage.revealImageId ? assetResolver(stage.revealImageId, 'image') : null;
    const customBrushUrl = (stage.brushStyle === 'custom' && stage.customBrushImageId) ? assetResolver(stage.customBrushImageId, 'image') : null;
    const winFrac = Math.min(100, Math.max(1, stage.winRevealPercent ?? 70)) / 100;

    // Measure the host box.
    useEffect(() => {
        const el = hostRef.current;
        if (!el) return;
        const obs = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
        obs.observe(el);
        setBox({ w: el.clientWidth, h: el.clientHeight });
        return () => obs.disconnect();
    }, []);

    // (Re)draw the cover + reset progress whenever geometry or the cover config changes.
    // Deliberately NOT resilient to mid-game resizes beyond redrawing — the cover repaints
    // fully (progress restarts), which is the least surprising behavior for a window drag.
    useEffect(() => {
        const canvas = canvasRef.current;
        const d = drawRef.current;
        if (!canvas || box.w <= 0 || box.h <= 0) return;
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        canvas.width = Math.floor(box.w * dpr);
        canvas.height = Math.floor(box.h * dpr);
        const c2d = canvas.getContext('2d');
        if (!c2d) return;
        c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        d.ctx2d = c2d;
        d.dpr = dpr;
        d.last = null;
        d.initialOpaque = 0;
        d.lastSampleAt = 0;
        d.tainted = false;
        d.visited = new Set();
        d.stamped = false;
        d.wonReported = false;
        setWon(false);
        setClearing(false);

        // Brush stamp: size is % of the smaller box dimension.
        const brushPct = Math.min(25, Math.max(4, stage.brushSize ?? 10));
        d.brushPx = Math.max(8, (Math.min(box.w, box.h) * brushPct) / 100);

        const finishSetup = (customImg: HTMLImageElement | null) => {
            d.stamp = buildStamp(stage.brushStyle || 'softRound', d.brushPx * dpr, customImg);
        };
        if (customBrushUrl) {
            const img = new Image();
            img.onload = () => finishSetup(img);
            img.onerror = () => finishSetup(null);
            img.src = customBrushUrl;
        } else finishSetup(null);

        const measureBaseline = () => {
            const s = sampleOpaque(canvas);
            if (s == null) { d.tainted = true; d.initialOpaque = 0; }
            else d.initialOpaque = s;
        };
        // Author-drawn cover area: clip the cover to the mask's alpha (destination-in), THEN
        // measure — the denominator becomes the drawn area, so the win % is "% of the drawn
        // cover wiped". An unreadable mask falls back to the whole-surface cover (winnable).
        const applyMaskThenMeasure = () => {
            if (!coverMaskUrl) { measureBaseline(); return; }
            const m = new Image();
            m.onload = () => {
                c2d.save();
                c2d.globalCompositeOperation = 'destination-in';
                c2d.drawImage(m, 0, 0, box.w, box.h);
                c2d.restore();
                measureBaseline();
            };
            m.onerror = () => measureBaseline();
            m.src = coverMaskUrl;
        };

        c2d.globalCompositeOperation = 'source-over';
        c2d.clearRect(0, 0, box.w, box.h);
        if (coverType === 'image' && coverUrl) {
            const img = new Image();
            img.onload = () => {
                // cover-fit the image over the whole canvas
                const scale = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight);
                const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
                c2d.drawImage(img, (box.w - w) / 2, (box.h - h) / 2, w, h);
                applyMaskThenMeasure();
            };
            img.onerror = () => { c2d.fillStyle = stage.coverColor || '#9ca3af'; c2d.fillRect(0, 0, box.w, box.h); applyMaskThenMeasure(); };
            img.src = coverUrl;
        } else if (coverType === 'frost') {
            // Icy haze: pale fill + speckle noise. Drawn (not backdrop-filter: that blurs the
            // element's whole box, so wiped-clear areas would stay blurry).
            c2d.fillStyle = 'rgba(226, 236, 244, 0.94)';
            c2d.fillRect(0, 0, box.w, box.h);
            c2d.fillStyle = 'rgba(255,255,255,0.5)';
            for (let i = 0; i < 900; i++) {
                c2d.globalAlpha = 0.15 + Math.random() * 0.5;
                c2d.fillRect(Math.random() * box.w, Math.random() * box.h, 1 + Math.random() * 2, 1 + Math.random() * 2);
            }
            c2d.globalAlpha = 1;
            applyMaskThenMeasure();
        } else {
            c2d.fillStyle = stage.coverColor || '#9ca3af';
            c2d.fillRect(0, 0, box.w, box.h);
            applyMaskThenMeasure();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [box.w, box.h, coverType, coverUrl, coverMaskUrl, stage.coverColor, stage.brushStyle, stage.brushSize, customBrushUrl, stage.id]);

    /** Count opaque pixels on a ≤128px downscale of the canvas; null = tainted. */
    const sampleOpaque = (canvas: HTMLCanvasElement): number | null => {
        try {
            const scale = SAMPLE_MAX / Math.max(canvas.width, canvas.height);
            const sw = Math.max(1, Math.floor(canvas.width * scale));
            const sh = Math.max(1, Math.floor(canvas.height * scale));
            const sc = document.createElement('canvas');
            sc.width = sw; sc.height = sh;
            const sctx = sc.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
            if (!sctx) return null;
            sctx.drawImage(canvas, 0, 0, sw, sh);
            const data = sctx.getImageData(0, 0, sw, sh).data;
            let opaque = 0;
            for (let i = 3; i < data.length; i += 4) if (data[i] > 128) opaque++;
            return opaque;
        } catch {
            return null; // tainted (cross-origin cover art) → grid fallback
        }
    };

    const checkProgress = (force: boolean) => {
        const d = drawRef.current;
        const canvas = canvasRef.current;
        if (!canvas || d.wonReported || !d.stamped) return;
        const now = performance.now();
        if (!force && now - d.lastSampleAt < SAMPLE_MIN_MS) return;
        d.lastSampleAt = now;

        let frac = 0;
        if (!d.tainted && d.initialOpaque > 0) {
            const s = sampleOpaque(canvas);
            if (s == null) d.tainted = true;
            else frac = 1 - s / d.initialOpaque;
        }
        if (d.tainted || d.initialOpaque === 0) {
            frac = d.visited.size / (GRID_COLS * GRID_ROWS);
        }
        ctx.reportProgress?.(Math.min(1, frac));
        if (frac >= winFrac) {
            d.wonReported = true;
            setWon(true);
            if (stage.autoClearOnWin !== false) {
                setClearing(true);
                window.setTimeout(() => ctx.reportWin(), 450);
            } else {
                ctx.reportWin();
            }
        }
    };

    const stampAt = (x: number, y: number, angle: number) => {
        const d = drawRef.current;
        const c2d = d.ctx2d;
        if (!c2d) return;
        c2d.save();
        c2d.globalCompositeOperation = 'destination-out';
        if ((ctx.stage as VNWipeStage).brushStyle === 'scratch') {
            // Thin jittered slivers aligned to the stroke direction.
            c2d.translate(x, y);
            c2d.rotate(angle);
            c2d.fillStyle = '#fff';
            for (let i = 0; i < 3; i++) {
                const off = (i - 1) * d.brushPx * 0.18 + (Math.random() - 0.5) * d.brushPx * 0.1;
                c2d.fillRect(-d.brushPx / 2, off - d.brushPx * 0.045, d.brushPx, d.brushPx * 0.09);
            }
        } else if (d.stamp) {
            const s = d.brushPx;
            c2d.drawImage(d.stamp, x - s / 2, y - s / 2, s, s);
        }
        c2d.restore();
        d.stamped = true;
        // Taint-fallback coverage grid.
        const gx = Math.min(GRID_COLS - 1, Math.max(0, Math.floor((x / Math.max(1, box.w)) * GRID_COLS)));
        const gy = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor((y / Math.max(1, box.h)) * GRID_ROWS)));
        d.visited.add(gy * GRID_COLS + gx);
    };

    const pointFrom = (e: React.PointerEvent): { x: number; y: number } => {
        const rect = (canvasRef.current as HTMLCanvasElement).getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onPointerDown = (e: React.PointerEvent) => {
        if (won) return;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        const p = pointFrom(e);
        drawRef.current.last = p;
        stampAt(p.x, p.y, 0);
        ctx.playInteractSound();
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const d = drawRef.current;
        if (won || !d.last) return;
        const p = pointFrom(e);
        const dx = p.x - d.last.x, dy = p.y - d.last.y;
        const dist = Math.hypot(dx, dy);
        const step = Math.max(2, d.brushPx / 3);
        const angle = Math.atan2(dy, dx);
        for (let t = step; t <= dist; t += step) {
            stampAt(d.last.x + (dx * t) / dist, d.last.y + (dy * t) / dist, angle);
        }
        if (dist >= step) d.last = p;
        checkProgress(false);
    };
    const endStroke = () => {
        drawRef.current.last = null;
        checkProgress(true);
    };

    return (
        <div ref={hostRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            {/* What's underneath: the reveal art (contain-fit), or nothing = the scene shows through. */}
            {revealUrl && (
                <img src={revealUrl} alt="" draggable={false}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
            )}
            <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endStroke}
                onPointerCancel={endStroke}
                onPointerLeave={endStroke}
                style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    touchAction: 'none',
                    opacity: clearing ? 0 : 1,
                    transition: clearing ? 'opacity 0.4s ease-out' : undefined,
                }}
            />
        </div>
    );
};

export default WipeGameSurface;
