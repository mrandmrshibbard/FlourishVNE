import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { VNGlossaryEntry } from '../../types/project';

/**
 * The glossary hover tooltip — a cursor-anchored dark pill showing a term's title,
 * description, and optional footnote. Mirrors the engine's other cursor-follow overlays
 * (item drag ghost / carry hint): position:fixed, high z, pointer-events:none so it can
 * never eat the click that advances dialogue.
 *
 * PORTALED to document.body — this is LOAD-BEARING, not cosmetic. The dialogue box uses
 * `backdrop-filter` (and image-skinned boxes `overflow:hidden`), which makes it the
 * containing block for position:fixed children: rendered in place, the tooltip lands at
 * viewport coordinates RELATIVE TO THE BOX and gets clipped — cursor changes, nothing
 * visible (Brad hit this live). The portal also sidesteps the scene-glitch filter's
 * containing-block quirk on the game container.
 *
 * Placement: prefers below-right of the cursor; measures itself and flips left/up when it
 * would leave the viewport, then clamps. Hidden until measured (no first-frame jump).
 */
export const GlossaryTooltip: React.FC<{
    entry: VNGlossaryEntry;
    accentColor: string;
    x: number;
    y: number;
}> = ({ entry, accentColor, x, y }) => {
    const ref = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = x + 14;
        let top = y + 18;
        if (left + w > vw - 8) left = x - w - 14;
        if (top + h > vh - 8) top = y - h - 14;
        setPos({ left: Math.max(8, left), top: Math.max(8, top) });
    }, [x, y, entry.id]);

    return createPortal(
        <div
            ref={ref}
            className="fixed z-[10060] pointer-events-none select-none rounded-lg px-3 py-2 shadow-xl border border-white/15 bg-black/85"
            style={{
                left: pos?.left ?? x + 14,
                top: pos?.top ?? y + 18,
                maxWidth: 280,
                visibility: pos ? 'visible' : 'hidden',
            }}
        >
            <div className="text-sm font-semibold leading-snug" style={{ color: accentColor }}>
                {entry.title?.trim() || entry.term}
            </div>
            {!!entry.description?.trim() && (
                <div className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed mt-1">{entry.description}</div>
            )}
            {!!entry.extra?.trim() && (
                <div className="text-[11px] text-slate-400 italic mt-1">{entry.extra}</div>
            )}
        </div>,
        document.body
    );
};

export default GlossaryTooltip;
