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
    /** Optional node rendered on the far right of the header, OUTSIDE the toggle button
     *  (so it can host its own button, e.g. a remove/delete, without nesting <button>s). */
    action?: React.ReactNode;
    children: React.ReactNode;
}> = ({ title, defaultOpen = false, badge, summary, glyph, hint, action, children }) => {
    const [isOpen, setIsOpen] = React.useState(defaultOpen);
    return (
        <div className="rounded-lg overflow-hidden border border-slate-700/60">
            <div className="flex items-center">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 hover:bg-slate-700/30 transition-colors text-left"
                >
                    <span className={`text-[10px] text-slate-500 transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                    {glyph && <span className="text-xs flex-shrink-0">{glyph}</span>}
                    {/* Title ellipsizes rather than pushing the badge/summary/action out of the header
                        (long titles in narrow panels were overflowing the section boundary). */}
                    <span className="text-xs font-semibold text-slate-300 truncate">{title}</span>
                    {!isOpen && summary && (
                        <span className="text-[10px] text-slate-500 truncate ml-auto pl-2">{summary}</span>
                    )}
                    {badge && <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400 ${(!isOpen && summary) ? '' : 'ml-auto'}`}>{badge}</span>}
                </button>
                {action && <div className="flex-shrink-0 pr-2 pl-1">{action}</div>}
            </div>
            {hint && !isOpen && <p className="text-[10px] text-slate-500 px-3 pb-2 -mt-1">{hint}</p>}
            {isOpen && <div className="px-3 pb-3 border-t border-slate-700/40 pt-2">{children}</div>}
        </div>
    );
};

export default CollapsibleSection;
