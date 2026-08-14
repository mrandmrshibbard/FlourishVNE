/**
 * HotSpotDrawTools — the shared pieces behind "Drawn shape" hot spots.
 *
 *  - PolygonShapeSVG: static outline+fill preview of a drawn shape (viewBox 0-100,
 *    non-uniform scale), rendered INSIDE whatever wrapper carries the element's
 *    rotation/flips so the preview matches the runtime clip-path exactly.
 *  - PolygonVertexEditor: the generic vertex editor extracted from PolyRegionOverlay —
 *    per-vertex drag, optional body drag, double-click an edge to add a point,
 *    double-click/right-click a point to remove it (min 3), commit-on-release so a
 *    reshape is ONE dispatch / ONE undo step.
 *  - PolygonTraceOverlay: the full-canvas freehand trace surface ("✏ Draw it").
 *
 * Points are flat [x1,y1,x2,y2,…] pairs. The vertex editor and shape SVG use
 * percent-of-the-element's-own-box (0-100); the trace overlay captures in canvas %
 * and normalizes into the traced bounding box on commit.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { simplifyPath, polygonBounds } from '../../utils/polygon';

/** Default shape seeded when an author picks "Drawn shape": a diamond, visibly NOT the
 *  rect they started from, with room to grab every vertex. */
export const DEFAULT_POLY_POINTS: number[] = [50, 0, 100, 50, 50, 100, 0, 50];

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Static drawn-shape preview. Fills the parent box; stroke stays hairline under any scale. */
export const PolygonShapeSVG: React.FC<{
    points: number[];
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    dashed?: boolean;
}> = ({ points, fill = 'rgba(59,130,246,0.3)', stroke = 'rgb(59,130,246)', strokeWidth = 2, dashed = true }) => {
    const pts: string[] = [];
    for (let i = 0; i + 1 < points.length; i += 2) pts.push(`${points[i]},${points[i + 1]}`);
    if (pts.length < 3) return null;
    return (
        <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: '100%', height: '100%', overflow: 'visible' }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
        >
            <polygon
                points={pts.join(' ')}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeDasharray={dashed ? '6 3' : undefined}
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
};

export interface PolygonVertexEditorProps {
    /** Flat pairs, 0-100 percent of the element's own box. */
    points: number[];
    /** The ELEMENT's pixel size on the canvas (for pointer-delta → % math). */
    parentSize: { width: number; height: number };
    /** Show the vertex handles (and enable editing). */
    selected: boolean;
    fill?: string;
    stroke?: string;
    /** Optional floating name label anchored to the first point. */
    label?: string;
    tooltip?: string;
    /** The element's visual rotation/flips — pointer deltas are mapped back into the
     *  element's local space so handles track the cursor however the box is turned. */
    rotationDeg?: number;
    flipX?: boolean;
    flipY?: boolean;
    /** Regions: dragging the polygon body moves the whole shape. Hot spots: OFF —
     *  the element box drag already moves the spot. */
    allowBodyDrag?: boolean;
    minPoints?: number;
    onSelect?: () => void;
    /** Fired ONCE per gesture, on release (one dispatch, one undo step). */
    onCommit: (points: number[]) => void;
}

/** Generic polygon vertex editor (extraction of the old PolyRegionOverlay guts). */
export const PolygonVertexEditor: React.FC<PolygonVertexEditorProps> = ({
    points, parentSize, selected, fill = 'rgba(16,185,129,0.25)', stroke = 'rgba(16,185,129,0.7)',
    label, tooltip, rotationDeg, flipX, flipY, allowBodyDrag, minPoints = 3, onSelect, onCommit,
}) => {
    const [vertexDrag, setVertexDrag] = useState<{ idx: number; startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
    const [bodyDrag, setBodyDrag] = useState<{ startClientX: number; startClientY: number; startPoints: number[] } | null>(null);
    // Live points during a drag, rendered locally so only this shape re-renders per move;
    // onCommit (a full project dispatch) fires once on release.
    const [livePoints, setLivePoints] = useState<number[] | null>(null);
    const livePointsRef = useRef<number[] | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Map a client-pixel delta into the element's LOCAL box-% space: undo the visual
    // rotation, then undo the flips (this overlay is expected to sit inside the same
    // flip wrapper as the content, so a flipped shape drags naturally too).
    const deltaToLocal = useCallback((dxPx: number, dyPx: number) => {
        const pw = Math.max(1, parentSize.width);
        const ph = Math.max(1, parentSize.height);
        let dx = dxPx, dy = dyPx;
        if (rotationDeg) {
            const rad = (-rotationDeg * Math.PI) / 180;
            const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
            const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
            dx = rx; dy = ry;
        }
        if (flipX) dx = -dx;
        if (flipY) dy = -dy;
        return { dx: (dx / pw) * 100, dy: (dy / ph) * 100 };
    }, [parentSize.width, parentSize.height, rotationDeg, flipX, flipY]);

    useEffect(() => {
        if (!vertexDrag && !bodyDrag) return;
        const onMove = (e: PointerEvent) => {
            if (vertexDrag) {
                const { dx, dy } = deltaToLocal(e.clientX - vertexDrag.startClientX, e.clientY - vertexDrag.startClientY);
                const nx = Math.max(0, Math.min(100, round1(vertexDrag.startX + dx)));
                const ny = Math.max(0, Math.min(100, round1(vertexDrag.startY + dy)));
                const next = [...points];
                next[vertexDrag.idx * 2] = nx;
                next[vertexDrag.idx * 2 + 1] = ny;
                livePointsRef.current = next;
                setLivePoints(next);
            } else if (bodyDrag) {
                const { dx, dy } = deltaToLocal(e.clientX - bodyDrag.startClientX, e.clientY - bodyDrag.startClientY);
                const next = bodyDrag.startPoints.map((c, i) => round1(c + (i % 2 === 0 ? dx : dy)));
                livePointsRef.current = next;
                setLivePoints(next);
            }
        };
        const onUp = () => {
            setVertexDrag(null);
            setBodyDrag(null);
            const final = livePointsRef.current;
            livePointsRef.current = null;
            setLivePoints(null);
            if (final) onCommit(final);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
    }, [vertexDrag, bodyDrag, points, deltaToLocal, onCommit]);

    // Client point → local box-% (for edge double-click insert). The container's centre is
    // rotation-invariant, so we measure from it and inverse-transform the offset.
    const clientToLocal = useCallback((clientX: number, clientY: number) => {
        const el = containerRef.current;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const { dx, dy } = deltaToLocal(clientX - cx, clientY - cy);
        return { x: dx + 50, y: dy + 50 };
    }, [deltaToLocal]);

    const insertPointAt = useCallback((clientX: number, clientY: number) => {
        const local = clientToLocal(clientX, clientY);
        if (!local) return;
        const n = Math.floor(points.length / 2);
        if (n < 2) return;
        // Find the nearest edge (segment i → i+1, wrapping) to the click.
        let bestEdge = 0;
        let bestDist = Infinity;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const ax = points[i * 2], ay = points[i * 2 + 1];
            const bx = points[j * 2], by = points[j * 2 + 1];
            const abx = bx - ax, aby = by - ay;
            const lenSq = abx * abx + aby * aby || 1;
            const t = Math.max(0, Math.min(1, ((local.x - ax) * abx + (local.y - ay) * aby) / lenSq));
            const px = ax + t * abx, py = ay + t * aby;
            const d = Math.hypot(local.x - px, local.y - py);
            if (d < bestDist) { bestDist = d; bestEdge = i; }
        }
        const next = [...points];
        next.splice((bestEdge + 1) * 2, 0, Math.max(0, Math.min(100, round1(local.x))), Math.max(0, Math.min(100, round1(local.y))));
        onCommit(next);
    }, [points, clientToLocal, onCommit]);

    const removePoint = useCallback((idx: number) => {
        if (Math.floor(points.length / 2) <= minPoints) return;
        const next = [...points];
        next.splice(idx * 2, 2);
        onCommit(next);
    }, [points, minPoints, onCommit]);

    const effPoints = livePoints ?? points;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < effPoints.length; i += 2) {
        pts.push({ x: effPoints[i] ?? 0, y: effPoints[i + 1] ?? 0 });
    }
    const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');

    return (
        <div ref={containerRef} className="absolute inset-0" style={{ pointerEvents: 'none' }}>
            <svg
                className="absolute inset-0"
                style={{ width: '100%', height: '100%', overflow: 'visible' }}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
            >
                <polygon
                    points={pointsStr}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={selected ? 2 : 1.5}
                    vectorEffect="non-scaling-stroke"
                    style={{ pointerEvents: selected || onSelect ? 'auto' : 'none', cursor: allowBodyDrag ? 'move' : 'default' }}
                    // Block the compatibility mouse event too — host canvases start their own
                    // box drags from onMouseDown, and stopping only the pointer event would let
                    // a vertex/body drag ALSO drag the whole element.
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        e.stopPropagation();
                        onSelect?.();
                        // Start the drag immediately (even when this pointer-down is also the
                        // select) — matching the original PolyRegionOverlay's grab-and-go feel.
                        if (allowBodyDrag) {
                            setBodyDrag({ startClientX: e.clientX, startClientY: e.clientY, startPoints: [...points] });
                        }
                    }}
                    onDoubleClick={selected ? (e) => { e.preventDefault(); e.stopPropagation(); insertPointAt(e.clientX, e.clientY); } : undefined}
                >
                    {tooltip ? <title>{tooltip}</title> : null}
                </polygon>
            </svg>
            {label && pts[0] && (
                <span
                    className="absolute text-[7px] text-emerald-300 bg-emerald-800/70 px-0.5 rounded pointer-events-none"
                    style={{ left: `${pts[0].x}%`, top: `${pts[0].y}%`, transform: 'translate(4px, -100%)', whiteSpace: 'nowrap' }}
                >
                    {label}
                </span>
            )}
            {selected && pts.map((pt, pi) => (
                <div
                    key={pi}
                    title={`Point ${pi + 1}`}
                    style={{
                        position: 'absolute',
                        left: `${pt.x}%`,
                        top: `${pt.y}%`,
                        transform: 'translate(-50%, -50%)',
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: '#06b6d4',
                        border: '2px solid white',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                        cursor: 'crosshair',
                        pointerEvents: 'auto',
                        zIndex: 10,
                        touchAction: 'none',
                    }}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        e.stopPropagation();
                        onSelect?.();
                        setVertexDrag({ idx: pi, startClientX: e.clientX, startClientY: e.clientY, startX: pt.x, startY: pt.y });
                    }}
                    onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); removePoint(pi); }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); removePoint(pi); }}
                />
            ))}
        </div>
    );
};

export interface TraceCommitResult {
    /** Bounding box of the trace in canvas % (top-left anchored). */
    x: number;
    y: number;
    width: number;
    height: number;
    /** Simplified vertices, percent of that box. */
    points: number[];
}

/** RDP tolerance in CANVAS-% units (simplify before normalizing, so the smoothing is
 *  visually constant however small the traced area is). ≈10px on a 1280px canvas. */
const TRACE_TOLERANCE = 0.75;
const TRACE_MAX_POINTS = 64;
/** Ignore pointer moves under this canvas-% distance — cheap live dedupe. */
const TRACE_MIN_STEP = 0.5;
/** A trace with a bounding box under this (canvas %) is an accidental tap. */
const TRACE_MIN_SIZE = 2;

/**
 * Full-canvas freehand trace surface. Mount it as the LAST child of the stage div
 * (absolute inset-0); it captures the pointer, draws the live stroke, and commits the
 * simplified shape + auto-fitted box on release.
 */
export const PolygonTraceOverlay: React.FC<{
    /** The stage element's DOMRect (zoom is already baked into its pixel size). */
    getStageRect: () => DOMRect | null;
    onCommit: (result: TraceCommitResult) => void;
    onCancel: () => void;
    /** Above everything on the stage (canvas chrome caps at 8000; test-play sits at 9000). */
    zIndex?: number;
}> = ({ getStageRect, onCommit, onCancel, zIndex = 8500 }) => {
    const { t } = useTranslation('ui');
    const [stroke, setStroke] = useState<number[]>([]);
    const [tooSmall, setTooSmall] = useState(false);
    const drawingRef = useRef(false);
    const strokeRef = useRef<number[]>([]);

    // Esc cancels — capture phase so the engine's/editor's own key handlers don't race us.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onCancel();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onCancel]);

    const toCanvasPct = useCallback((clientX: number, clientY: number) => {
        const rect = getStageRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return null;
        return {
            x: ((clientX - rect.left) / rect.width) * 100,
            y: ((clientY - rect.top) / rect.height) * 100,
        };
    }, [getStageRect]);

    const finish = useCallback(() => {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        const raw = strokeRef.current;
        strokeRef.current = [];
        setStroke([]);

        // Simplify in canvas space; loosen the tolerance until under the cap.
        let simplified = simplifyPath(raw, TRACE_TOLERANCE);
        let tol = TRACE_TOLERANCE;
        while (simplified.length / 2 > TRACE_MAX_POINTS) {
            tol *= 1.5;
            simplified = simplifyPath(simplified, tol);
        }
        const bounds = polygonBounds(simplified);
        if (simplified.length < 6 || !bounds ||
            (bounds.maxX - bounds.minX) < TRACE_MIN_SIZE || (bounds.maxY - bounds.minY) < TRACE_MIN_SIZE) {
            // Accidental tap — stay in trace mode and coach.
            setTooSmall(true);
            return;
        }
        const w = Math.max(bounds.maxX - bounds.minX, TRACE_MIN_SIZE);
        const h = Math.max(bounds.maxY - bounds.minY, TRACE_MIN_SIZE);
        const points: number[] = [];
        for (let i = 0; i + 1 < simplified.length; i += 2) {
            points.push(round1(((simplified[i] - bounds.minX) / w) * 100));
            points.push(round1(((simplified[i + 1] - bounds.minY) / h) * 100));
        }
        onCommit({
            x: round1(bounds.minX),
            y: round1(bounds.minY),
            width: round1(w),
            height: round1(h),
            points,
        });
    }, [onCommit]);

    return (
        <div
            className="absolute inset-0"
            style={{ zIndex, cursor: 'crosshair', background: 'rgba(15,23,42,0.35)', touchAction: 'none', pointerEvents: 'auto' }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                const p = toCanvasPct(e.clientX, e.clientY);
                if (!p) return;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                drawingRef.current = true;
                setTooSmall(false);
                strokeRef.current = [p.x, p.y];
                setStroke([p.x, p.y]);
            }}
            onPointerMove={(e) => {
                if (!drawingRef.current) return;
                const p = toCanvasPct(e.clientX, e.clientY);
                if (!p) return;
                const s = strokeRef.current;
                const lx = s[s.length - 2], ly = s[s.length - 1];
                if (Math.hypot(p.x - lx, p.y - ly) < TRACE_MIN_STEP) return;
                strokeRef.current = [...s, p.x, p.y];
                setStroke(strokeRef.current);
            }}
            onPointerUp={finish}
            onPointerCancel={() => { drawingRef.current = false; strokeRef.current = []; setStroke([]); onCancel(); }}
        >
            {/* Live stroke */}
            {stroke.length >= 4 && (
                <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polyline
                        points={(() => { const p: string[] = []; for (let i = 0; i + 1 < stroke.length; i += 2) p.push(`${stroke[i]},${stroke[i + 1]}`); return p.join(' '); })()}
                        fill="rgba(59,130,246,0.15)"
                        stroke="rgb(96,165,250)"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                    />
                </svg>
            )}
            {/* Instruction pill */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/90 text-slate-100 text-xs px-3 py-1.5 rounded-full shadow-lg pointer-events-none" style={{ zIndex: 2 }}>
                <span>
                    {tooSmall
                        ? t('hotZone.drawTooSmall', 'Keep the button held down and draw around the area.')
                        : t('hotZone.drawInstruction', 'Draw around the area you want. Let go to finish.')}
                </span>
                <span className="text-slate-400">{t('hotZone.drawCancelHint', 'Esc to cancel')}</span>
                <button
                    type="button"
                    className="pointer-events-auto text-slate-300 hover:text-white font-bold px-1"
                    onPointerDown={(e) => { e.stopPropagation(); }}
                    onClick={(e) => { e.stopPropagation(); onCancel(); }}
                    title={t('common.cancel', 'Cancel')}
                >
                    ✕
                </button>
            </div>
        </div>
    );
};
