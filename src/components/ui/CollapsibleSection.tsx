import React from 'react';

/**
 * Shared collapsible/accordion section. Promoted from UIElementInspector's local
 * version and extended with an optional `summary` — a one-line state preview shown
 * on the header while collapsed (the "less overwhelming" lever from the inspector
 * revamp). Visuals match the original so the menu editor can adopt it unchanged.
 */
export const CollapsibleSection: React.FC<{
    title: string;
    defaultOpen?: boolean;
    badge?: string;
    /** One-line state preview shown (right-aligned, muted) while collapsed. */
    summary?: string;
    /** Optional leading glyph/icon. */
    glyph?: React.ReactNode;
    hint?: string;
    children: React.ReactNode;
}> = ({ title, defaultOpen = false, badge, summary, glyph, hint, children }) => {
    const [isOpen, setIsOpen] = React.useState(defaultOpen);
    return (
        <div className="rounded-lg overflow-hidden border border-slate-700/60">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-700/30 transition-colors text-left"
            >
                <span className={`text-[10px] text-slate-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                {glyph && <span className="text-xs">{glyph}</span>}
                <span className="text-xs font-semibold text-slate-300 flex-shrink-0">{title}</span>
                {!isOpen && summary && (
                    <span className="text-[10px] text-slate-500 truncate ml-auto pl-2">{summary}</span>
                )}
                {badge && <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400 ${(!isOpen && summary) ? '' : 'ml-auto'}`}>{badge}</span>}
            </button>
            {hint && !isOpen && <p className="text-[10px] text-slate-500 px-3 pb-2 -mt-1">{hint}</p>}
            {isOpen && <div className="px-3 pb-3 border-t border-slate-700/40 pt-2">{children}</div>}
        </div>
    );
};

export default CollapsibleSection;
