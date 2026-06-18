import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Generic radial (pie) menu rendered at a screen position (typically the cursor
 * on right-click). Presentation-only: it knows nothing about inspectors — callers
 * pass a list of items (e.g. property groups) and handle `onSelect`.
 *
 * Closes on Escape, outside click, or right-click elsewhere. A linear list of the
 * same items is the accessible fallback callers can offer separately.
 */
export interface RadialMenuItem {
    id: string;
    label: string;
    /** Short glyph/emoji or any node shown in the wedge. */
    glyph?: React.ReactNode;
    /** Optional badge text (e.g. a count) shown on the wedge. */
    badge?: string | number;
    disabled?: boolean;
}

interface RadialMenuProps {
    x: number;
    y: number;
    items: RadialMenuItem[];
    onSelect: (id: string) => void;
    onClose: () => void;
    /** Center label (e.g. element/command name). */
    centerLabel?: string;
    centerGlyph?: React.ReactNode;
    /** Clicking the center (e.g. "open full inspector"). */
    onCenter?: () => void;
}

const RADIUS = 92;       // distance from center to each wedge
const WEDGE = 58;        // wedge button diameter
const CENTER = 64;       // center button diameter
const PAD = 12;          // viewport clamp padding

export const RadialMenu: React.FC<RadialMenuProps> = ({
    x, y, items, onSelect, onClose, centerLabel, centerGlyph, onCenter,
}) => {
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('keydown', onKey);
        // capture phase so we beat other handlers; covers both left and right press
        document.addEventListener('mousedown', onDown, true);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onDown, true);
        };
    }, [onClose]);

    // Clamp the center so the whole wheel stays on screen.
    const half = RADIUS + WEDGE / 2 + PAD;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const cx = Math.max(half, Math.min(vw - half, x));
    const cy = Math.max(half, Math.min(vh - half, y));

    const n = Math.max(items.length, 1);

    const content = (
        <div
            ref={rootRef}
            className="fixed inset-0 z-[10000]"
            style={{ animation: 'fade-in 0.12s ease-out' }}
            onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        >
            {/* Center hub */}
            <button
                onClick={() => onCenter?.()}
                title={centerLabel}
                className="absolute flex flex-col items-center justify-center rounded-full text-[10px] font-semibold text-[var(--text-primary)] shadow-xl transition-transform hover:scale-105"
                style={{
                    left: cx - CENTER / 2, top: cy - CENTER / 2, width: CENTER, height: CENTER,
                    background: 'linear-gradient(135deg, var(--bg-tertiary), var(--bg-secondary))',
                    border: '1px solid var(--border-default)',
                    cursor: onCenter ? 'pointer' : 'default',
                }}
            >
                {centerGlyph && <span className="text-base leading-none">{centerGlyph}</span>}
                {centerLabel && <span className="px-1 truncate max-w-[58px] leading-tight">{centerLabel}</span>}
            </button>

            {/* Wedges */}
            {items.map((item, i) => {
                // Start at top (12 o'clock), go clockwise.
                const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / n;
                const ix = cx + RADIUS * Math.cos(angle) - WEDGE / 2;
                const iy = cy + RADIUS * Math.sin(angle) - WEDGE / 2;
                return (
                    <button
                        key={item.id}
                        disabled={item.disabled}
                        onClick={() => { if (!item.disabled) onSelect(item.id); }}
                        title={item.label}
                        className={`absolute flex flex-col items-center justify-center rounded-full text-[10px] font-medium shadow-lg transition-all
                            ${item.disabled
                                ? 'opacity-40 cursor-not-allowed text-[var(--text-muted)]'
                                : 'text-[var(--text-primary)] hover:scale-110 hover:text-sky-300'}`}
                        style={{
                            left: ix, top: iy, width: WEDGE, height: WEDGE,
                            background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-primary))',
                            border: '1px solid var(--border-default)',
                        }}
                    >
                        {item.glyph && <span className="text-sm leading-none mb-0.5">{item.glyph}</span>}
                        <span className="px-0.5 truncate max-w-[52px] leading-tight">{item.label}</span>
                        {item.badge !== undefined && item.badge !== '' && (
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-sky-500 text-white text-[9px] font-bold flex items-center justify-center">
                                {item.badge}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );

    return createPortal(content, document.body);
};

export default RadialMenu;
