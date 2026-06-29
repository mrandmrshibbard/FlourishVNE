import React, { useRef, useState } from 'react';
import { VNContentBox } from '../../types';

/**
 * On-canvas editor for an element's content box (the visible/interactive sub-region used for snapping,
 * fit-to-screen, the guide, and — for buttons — the in-game click hit-area). Renders an amber dashed
 * rectangle inset by the box fractions, four mid-edge drag handles, and a tiny Trim/Reset toolbar.
 *
 * Place as a child of the element's box (it positions `absolute inset-0`). Drags commit once on
 * release (single undo step). `onTrim` computes the box from non-transparent pixels (alpha bounds).
 */
const ContentBoxEditor: React.FC<{
    box?: VNContentBox;
    onChange: (b: VNContentBox) => void;
    /** Auto-trim. Receives the element box's measured aspect (w/h) so the trim can account for the
     *  object-contain letterbox and hug the visible art on both axes. */
    onTrim?: (boxAspect: number) => void;
    onReset?: () => void;
    trimLabel?: string;
    resetLabel?: string;
}> = ({ box, onChange, onTrim, onReset, trimLabel = '✂ Trim', resetLabel = 'Reset' }) => {
    const base: VNContentBox = box || { left: 0, top: 0, right: 0, bottom: 0 };
    const rootRef = useRef<HTMLDivElement>(null);
    const [live, setLive] = useState<VNContentBox | null>(null);
    const eff = live || base;

    const startEdge = (edge: 'l' | 'r' | 't' | 'b') => (e: React.PointerEvent) => {
        e.stopPropagation(); e.preventDefault();
        const root = rootRef.current; if (!root) return;
        const rect = root.getBoundingClientRect();
        const move = (ev: PointerEvent) => {
            const fx = Math.min(1, Math.max(0, (ev.clientX - rect.left) / (rect.width || 1)));
            const fy = Math.min(1, Math.max(0, (ev.clientY - rect.top) / (rect.height || 1)));
            setLive(prev => {
                const cur = prev || eff;
                const n = { ...cur };
                if (edge === 'l') n.left = Math.max(0, Math.min(fx, 1 - cur.right - 0.02));
                if (edge === 'r') n.right = Math.max(0, Math.min(1 - fx, 1 - cur.left - 0.02));
                if (edge === 't') n.top = Math.max(0, Math.min(fy, 1 - cur.bottom - 0.02));
                if (edge === 'b') n.bottom = Math.max(0, Math.min(1 - fy, 1 - cur.top - 0.02));
                return n;
            });
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            setLive(l => { if (l) onChange(l); return null; });
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };

    const cx = (eff.left + (1 - eff.right)) / 2;
    const cy = (eff.top + (1 - eff.bottom)) / 2;
    const handlePts: Array<{ edge: 'l' | 'r' | 't' | 'b'; x: number; y: number; cursor: string }> = [
        { edge: 'l', x: eff.left, y: cy, cursor: 'ew-resize' },
        { edge: 'r', x: 1 - eff.right, y: cy, cursor: 'ew-resize' },
        { edge: 't', x: cx, y: eff.top, cursor: 'ns-resize' },
        { edge: 'b', x: cx, y: 1 - eff.bottom, cursor: 'ns-resize' },
    ];

    return (
        <div ref={rootRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 61 }}>
            <div style={{
                position: 'absolute',
                left: `${eff.left * 100}%`, top: `${eff.top * 100}%`,
                right: `${eff.right * 100}%`, bottom: `${eff.bottom * 100}%`,
                border: '1px dashed #f59e0b', pointerEvents: 'none',
            }} />
            {handlePts.map(h => (
                <div key={h.edge}
                    onPointerDown={startEdge(h.edge)}
                    title="Drag to set the content box edge"
                    style={{
                        position: 'absolute', left: `${h.x * 100}%`, top: `${h.y * 100}%`,
                        transform: 'translate(-50%, -50%)', width: 12, height: 12,
                        background: '#f59e0b', border: '2px solid #fff', borderRadius: 3,
                        boxShadow: '0 0 3px rgba(0,0,0,0.6)', cursor: h.cursor, pointerEvents: 'auto', zIndex: 62,
                    }}
                />
            ))}
            {(onTrim || onReset) && (
                <div style={{ position: 'absolute', left: `${eff.left * 100}%`, top: `calc(${eff.top * 100}% - 22px)`, display: 'flex', gap: 4, pointerEvents: 'auto' }}>
                    {onTrim && <button onMouseDown={e => { e.stopPropagation(); }} onClick={e => {
                        e.stopPropagation();
                        const r = rootRef.current?.getBoundingClientRect();
                        onTrim(r && r.height > 0 ? r.width / r.height : 0);
                    }}
                        style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#0ea5e9', color: '#fff', whiteSpace: 'nowrap' }}>{trimLabel}</button>}
                    {onReset && <button onMouseDown={e => { e.stopPropagation(); }} onClick={e => { e.stopPropagation(); onReset(); }}
                        style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.6)', color: '#fff' }}>{resetLabel}</button>}
                </div>
            )}
        </div>
    );
};

export default ContentBoxEditor;
