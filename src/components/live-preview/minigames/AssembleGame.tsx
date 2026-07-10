import React, { useEffect, useMemo, useRef, useState } from 'react';
import { VNAssembleStage } from '../../../types/miniGames';
import { MiniGameRenderCtx } from './types';
import { useImageBox } from './useImageBox';
import { sliceCellStyle } from './sliceStyles';
import { ColorableRegion, RegionPulseStyle, StrokeApi, SwatchBar, resolvePalettes } from './coloring';

/**
 * Assemble-from-pieces: drag pieces out of a tray onto their spots on the board.
 *
 * Drag is LOCAL pointer capture only — never dropTargetRegistry (that's a coordinate-space
 * singleton shared with surfaces underneath the overlay; using it would cross-fire drops
 * into the scene). Release within snapTolerancePct of the piece's own target = snap + lock;
 * near a DIFFERENT piece's target = a mistake (wrong placement) + back to the tray; empty
 * space = just back to the tray, no penalty.
 *
 * Two sources: 'slice' auto-cuts one image into cols×rows (targets = the grid, faint full
 * image as the guide) and 'pieces' uses author piece images + placed targets (per-piece
 * ghost silhouettes).
 *
 * BUILD & COLOR (stage.coloring.enabled): placed pieces become colorable — tap-fill with
 * the swatch bar's color (and optionally brush strokes clipped to the piece's own art).
 * `freeOrder` colors while building; otherwise coloring unlocks once everything is placed.
 * Pieces with a colorSlot report their final color for palette→UI / {slot} variables.
 */

type PieceDef = {
    key: string;
    /** Target rect in % of the BOARD box (x/y = top-left). */
    target: { x: number; y: number; w: number; h: number };
    /** Style painting this piece's art (sliced background or an <img> url). */
    imgUrl?: string | null;
    sliceStyle?: React.CSSProperties;
    showGhost: boolean;
    colorSlot?: string;
};

const TAP_SLOP_PX = 7;

export const AssembleGameSurface: React.FC<{ ctx: MiniGameRenderCtx }> = ({ ctx }) => {
    const stage = ctx.stage as VNAssembleStage;
    const mode = stage.sourceMode || (stage.sliceImageId ? 'slice' : 'pieces');
    const sliceUrl = stage.sliceImageId ? ctx.assetResolver(stage.sliceImageId, 'image') : null;
    const baseUrl = stage.baseImageId ? ctx.assetResolver(stage.baseImageId, 'image') : null;
    const trayRight = stage.trayPosition === 'right';
    const tolerance = Math.max(2, stage.snapTolerancePct ?? 8);

    const boardRef = useRef<HTMLDivElement>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);
    // Board space: the base image's contain box (pieces mode) or the sliced image's (slice mode).
    const box = useImageBox(boardRef, mode === 'slice' ? sliceUrl : baseUrl);

    const pieces: PieceDef[] = useMemo(() => {
        if (mode === 'slice' && sliceUrl) {
            const cols = Math.max(2, Math.min(8, stage.sliceCols ?? 3));
            const rows = Math.max(2, Math.min(8, stage.sliceRows ?? 3));
            const list: PieceDef[] = [];
            for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
                list.push({
                    key: `cell-${c}-${r}`,
                    target: { x: (c * 100) / cols, y: (r * 100) / rows, w: 100 / cols, h: 100 / rows },
                    sliceStyle: sliceCellStyle(sliceUrl, cols, rows, c, r),
                    showGhost: false, // slice mode's guide is the faint full image
                });
            }
            return list;
        }
        return (stage.pieces || []).map(p => ({
            key: p.id,
            target: p.target,
            imgUrl: p.imageId ? ctx.assetResolver(p.imageId, 'image') : null,
            showGhost: p.showGhost !== false,
            colorSlot: p.colorSlot,
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage.id, sliceUrl, mode]);

    // Tray order is shuffled once per mount so slice pieces don't come out pre-solved.
    const trayOrder = useMemo(() => {
        const order = pieces.map(p => p.key);
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        return order;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pieces]);

    const [placed, setPlaced] = useState<Set<string>>(new Set());
    const [drag, setDrag] = useState<{ key: string; x: number; y: number } | null>(null);
    const wonRef = useRef(false);
    const timerRef = useRef<number | null>(null);
    useEffect(() => () => { if (timerRef.current != null) clearTimeout(timerRef.current); }, []);

    // ── Build & Color (stage.coloring) ──
    const coloring = stage.coloring;
    const coloringOn = !!coloring?.enabled;
    const needAllColored = coloringOn && coloring!.requireAllColored !== false;
    const allowBrush = coloringOn && !!coloring!.allowBrush;
    const brushSizePct = Math.max(2, Math.min(20, coloring?.brushSizePct ?? 7));
    const colorPalettes = useMemo(
        () => (coloringOn ? resolvePalettes(coloring!.palettes, coloring!.paletteIds, ctx.project) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [stage.id, coloringOn, ctx.project],
    );
    const [activeColor, setActiveColor] = useState<string>(colorPalettes[0]?.colors[0] || '#ef4444');
    const [fills, setFills] = useState<Record<string, string>>({});
    const coloredRef = useRef<Set<string>>(new Set());
    const strokeApisRef = useRef<Record<string, StrokeApi | null>>({});
    const colorDragRef = useRef<{ key: string; startX: number; startY: number; moved: boolean } | null>(null);
    const allPlaced = placed.size >= pieces.length && pieces.length > 0;
    /** Coloring is live for a given piece: it's placed, and (freeOrder | everything's built). */
    const canColorNow = coloringOn && (coloring!.freeOrder ? true : allPlaced);

    const reportCombinedProgress = (placedCount: number, coloredCount: number) => {
        ctx.reportProgress?.(coloringOn && needAllColored
            ? (placedCount + coloredCount) / (pieces.length * 2)
            : placedCount / pieces.length);
    };

    /** Single win gate: assembly done + (when coloring is required) everything colored. */
    const maybeWin = (placedCount: number, coloredCount: number) => {
        if (wonRef.current || placedCount < pieces.length) return;
        if (needAllColored && coloredCount < pieces.length) return;
        if (coloringOn && !needAllColored) return; // optional coloring ends via the Done button
        wonRef.current = true;
        timerRef.current = window.setTimeout(() => ctx.reportWin(), 500);
    };

    const markColored = (key: string, color: string) => {
        coloredRef.current.add(key);
        const piece = pieces.find(p => p.key === key);
        if (piece?.colorSlot) ctx.reportColors?.({ [piece.colorSlot]: color });
        reportCombinedProgress(placed.size, coloredRef.current.size);
        maybeWin(placed.size, coloredRef.current.size);
    };

    const empty = mode === 'slice' ? !sliceUrl : !(stage.pieces || []).length;
    if (empty) {
        return (
            <button onClick={() => ctx.reportWin()} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.85)', fontSize: 15 }}>
                <span style={{ fontSize: 32 }}>🧩</span>
                <span>{mode === 'slice' ? 'No puzzle image yet — pick one in the Mini Games tab.' : 'No pieces yet — add them in the Mini Games tab.'}</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Tap to continue</span>
            </button>
        );
    }

    const surfacePoint = (e: React.PointerEvent) => {
        const rect = (surfaceRef.current as HTMLDivElement).getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const startDrag = (key: string) => (e: React.PointerEvent) => {
        if (wonRef.current || placed.has(key)) return;
        // Capture on the SURFACE, not the tray piece — the tray piece unmounts as the drag
        // starts (it turns into the floating piece), which would release its capture mid-drag.
        (surfaceRef.current as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
        setDrag({ key, ...surfacePoint(e) });
    };
    const moveDrag = (e: React.PointerEvent) => {
        if (!drag) return;
        const p = surfacePoint(e);
        setDrag(d => (d ? { ...d, x: p.x, y: p.y } : d));
    };
    const endDrag = (e: React.PointerEvent) => {
        if (!drag) return;
        const piece = pieces.find(p => p.key === drag.key);
        setDrag(null);
        if (!piece || !box.width || !box.height) return;
        // Pointer position → board-% point; compare against target CENTERS in board %.
        const boardRect = (boardRef.current as HTMLDivElement).getBoundingClientRect();
        const surfRect = (surfaceRef.current as HTMLDivElement).getBoundingClientRect();
        const bx = ((drag.x + surfRect.left - boardRect.left - box.left) / box.width) * 100;
        const by = ((drag.y + surfRect.top - boardRect.top - box.top) / box.height) * 100;
        const distTo = (p: PieceDef) => {
            const cx = p.target.x + p.target.w / 2, cy = p.target.y + p.target.h / 2;
            return Math.hypot(bx - cx, by - cy);
        };
        if (distTo(piece) <= tolerance) {
            ctx.playInteractSound();
            ctx.reportHit(); // snapping a piece into place is a correct move: hit + character + hit feedback
            const next = new Set(placed); next.add(piece.key);
            setPlaced(next);
            reportCombinedProgress(next.size, coloredRef.current.size);
            maybeWin(next.size, coloredRef.current.size);
            return;
        }
        // Near someone ELSE's empty spot = a wrong placement (a mistake); empty space = free.
        const wrong = pieces.find(p => p.key !== piece.key && !placed.has(p.key) && distTo(p) <= tolerance);
        if (wrong) ctx.reportMistake();
    };

    // ── coloring interaction (board taps/strokes on PLACED pieces; local capture only) ──
    const boardPct = (e: React.PointerEvent) => {
        const host = boardRef.current;
        if (!host || !box.width || !box.height) return null;
        const rect = host.getBoundingClientRect();
        return { x: ((e.clientX - rect.left - box.left) / box.width) * 100, y: ((e.clientY - rect.top - box.top) / box.height) * 100 };
    };
    const hitPlacedPiece = (bx: number, by: number): string | null => {
        for (let i = pieces.length - 1; i >= 0; i--) {
            const p = pieces[i];
            if (!placed.has(p.key)) continue;
            const t = p.target;
            if (bx >= t.x && bx <= t.x + t.w && by >= t.y && by <= t.y + t.h) return p.key;
        }
        return null;
    };
    const fillPiece = (key: string) => {
        setFills(f => ({ ...f, [key]: activeColor }));
        strokeApisRef.current[key]?.clear(); // a fresh fill replaces earlier brushwork
        ctx.playInteractSound();
        markColored(key, activeColor);
    };
    const colorPointerDown = (e: React.PointerEvent) => {
        if (!canColorNow || wonRef.current || drag) return;
        const p = boardPct(e);
        if (!p) return;
        const key = hitPlacedPiece(p.x, p.y);
        if (!key) return;
        (surfaceRef.current as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
        colorDragRef.current = { key, startX: e.clientX, startY: e.clientY, moved: false };
    };
    const colorPointerMove = (e: React.PointerEvent) => {
        const d = colorDragRef.current;
        if (!d || !allowBrush) return;
        if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < TAP_SLOP_PX) return;
        d.moved = true;
        const p = boardPct(e);
        if (!p) return;
        const t = pieces.find(x => x.key === d.key)?.target;
        if (!t) return;
        // Strokes stay in the piece the stroke STARTED on (coloring-book behavior);
        // stamp coords are % of the piece's own rect (its canvas clips to the art).
        strokeApisRef.current[d.key]?.stamp(((p.x - t.x) / t.w) * 100, ((p.y - t.y) / t.h) * 100, activeColor, brushSizePct * (100 / Math.max(1, t.w)));
    };
    const colorPointerUp = () => {
        const d = colorDragRef.current;
        colorDragRef.current = null;
        if (!d || wonRef.current) return;
        if (d.moved) { ctx.playInteractSound(); markColored(d.key, activeColor); }
        else fillPiece(d.key);
    };

    const pieceArt = (p: PieceDef, style: React.CSSProperties) => (
        p.sliceStyle
            ? <div style={{ ...style, ...p.sliceStyle }} />
            : p.imgUrl
                ? <img src={p.imgUrl} alt="" draggable={false} style={{ ...style, objectFit: 'contain' }} />
                : <div style={{ ...style, background: '#334155', borderRadius: 6 }} />
    );

    const trayPieces = trayOrder.filter(k => !placed.has(k) && drag?.key !== k);
    const dragPiece = drag ? pieces.find(p => p.key === drag.key) : null;
    // The floating piece renders at its FINAL board size, so what you hold matches the hole.
    const dragW = dragPiece && box.width ? (dragPiece.target.w / 100) * box.width : 60;
    const dragH = dragPiece && box.height ? (dragPiece.target.h / 100) * box.height : 60;

    const showSwatches = coloringOn && canColorNow;

    return (
        <div ref={surfaceRef}
            onPointerMove={e => { moveDrag(e); colorPointerMove(e); }}
            onPointerUp={e => { endDrag(e); colorPointerUp(); }}
            onPointerCancel={e => { endDrag(e); colorPointerUp(); }}
            style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', touchAction: 'none' }}>
            <RegionPulseStyle />
            <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: trayRight ? 'row' : 'column' }}>
            {/* board */}
            <div ref={boardRef} onPointerDown={colorPointerDown}
                style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, cursor: showSwatches ? 'crosshair' : undefined }}>
                {baseUrl && mode !== 'slice' && (
                    <img src={baseUrl} alt="" draggable={false} style={{ position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height, pointerEvents: 'none' }} />
                )}
                <div style={{ position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height }}>
                    {/* slice mode's guide: the faint finished picture */}
                    {mode === 'slice' && sliceUrl && (
                        <img src={sliceUrl} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.15, pointerEvents: 'none' }} />
                    )}
                    {pieces.map(p => {
                        const rect: React.CSSProperties = { position: 'absolute', left: `${p.target.x}%`, top: `${p.target.y}%`, width: `${p.target.w}%`, height: `${p.target.h}%` };
                        if (placed.has(p.key)) {
                            return (
                                <div key={p.key} style={{ ...rect, animation: 'fade-in 0.2s ease-out' }}>
                                    {pieceArt(p, { width: '100%', height: '100%' })}
                                    {coloringOn && (
                                        <ColorableRegion
                                            // piece art clips the tint (contain, like the <img>); slice cells tint whole
                                            clip={p.imgUrl ? { maskUrl: p.imgUrl, maskFit: 'contain' } : {}}
                                            fillColor={fills[p.key] || null}
                                            tintMode={coloring?.tintMode || 'multiply'}
                                            pulse={canColorNow && !coloredRef.current.has(p.key)}
                                            strokeApiRef={allowBrush ? (api => { strokeApisRef.current[p.key] = api; }) : undefined}
                                        />
                                    )}
                                </div>
                            );
                        }
                        if (p.showGhost && p.imgUrl) {
                            return (
                                <div key={p.key} style={{ ...rect, opacity: 0.28, filter: 'grayscale(1)', pointerEvents: 'none' }}>
                                    <img src={p.imgUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </div>
                            );
                        }
                        if (mode === 'slice') {
                            return <div key={p.key} style={{ ...rect, border: '1px dashed rgba(255,255,255,0.25)', boxSizing: 'border-box', pointerEvents: 'none' }} />;
                        }
                        return <div key={p.key} style={{ ...rect, border: '2px dashed rgba(255,255,255,0.35)', borderRadius: 8, boxSizing: 'border-box', pointerEvents: 'none' }} />;
                    })}
                </div>
            </div>
            {/* tray */}
            <div style={{
                flexShrink: 0, display: 'flex', gap: 8, padding: 8, alignItems: 'center',
                background: 'rgba(0,0,0,0.5)', borderRadius: 10, margin: 4,
                ...(trayRight ? { flexDirection: 'column', width: '18%', minWidth: 84, overflowY: 'auto' } : { flexDirection: 'row', height: '20%', minHeight: 72, overflowX: 'auto' }),
            }}>
                {trayPieces.map(k => {
                    const p = pieces.find(x => x.key === k)!;
                    return (
                        <div key={k} onPointerDown={startDrag(k)}
                            style={{ flexShrink: 0, cursor: 'grab', touchAction: 'none', ...(trayRight ? { width: '84%' } : { height: '84%' }), aspectRatio: `${Math.max(0.2, p.target.w / Math.max(0.1, p.target.h))}` }}>
                            {pieceArt(p, { width: '100%', height: '100%', pointerEvents: 'none' })}
                        </div>
                    );
                })}
                {trayPieces.length === 0 && !drag && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: 'auto' }}>—</span>}
            </div>
            </div>
            {/* Build & Color: swatch bar appears when coloring is live (freeOrder = right away,
                guided = once everything is assembled). Optional coloring ends via Done. */}
            {showSwatches && (
                <SwatchBar
                    palettes={colorPalettes}
                    activeColor={activeColor}
                    onPick={c => { setActiveColor(c); ctx.playInteractSound(); }}
                    trailing={!needAllColored && allPlaced ? (
                        <button
                            onClick={() => { if (!wonRef.current) { wonRef.current = true; ctx.reportWin(); } }}
                            style={{ flexShrink: 0, marginLeft: 6, padding: '6px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(16,185,129,0.85)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                            ✓ Done
                        </button>
                    ) : undefined}
                />
            )}
            {/* floating dragged piece */}
            {drag && dragPiece && (
                <div style={{ position: 'absolute', left: drag.x, top: drag.y, width: dragW, height: dragH, transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 20, filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.6))' }}>
                    {pieceArt(dragPiece, { width: '100%', height: '100%' })}
                </div>
            )}
        </div>
    );
};

export default AssembleGameSurface;
