import React from 'react';

const Panel: React.FC<{
    title: string;
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
    rightHeaderContent?: React.ReactNode;
    accentColor?: 'pink' | 'cyan' | 'mint' | 'lavender' | 'peach' | 'rainbow';
}> = ({ title, children, className, style, isCollapsed, onToggleCollapse, rightHeaderContent, accentColor = 'lavender' }) => {
    const accentColors = {
        pink: { border: 'var(--accent-pink)', glow: 'rgba(255, 126, 179, 0.15)', gradient: 'linear-gradient(90deg, rgba(255, 126, 179, 0.12) 0%, transparent 100%)' },
        cyan: { border: 'var(--accent-cyan)', glow: 'rgba(126, 255, 255, 0.15)', gradient: 'linear-gradient(90deg, rgba(126, 255, 255, 0.12) 0%, transparent 100%)' },
        mint: { border: 'var(--accent-mint)', glow: 'rgba(126, 255, 184, 0.15)', gradient: 'linear-gradient(90deg, rgba(126, 255, 184, 0.12) 0%, transparent 100%)' },
        lavender: { border: 'var(--accent-lavender)', glow: 'rgba(184, 126, 255, 0.15)', gradient: 'linear-gradient(90deg, rgba(184, 126, 255, 0.12) 0%, transparent 100%)' },
        peach: { border: 'var(--accent-peach)', glow: 'rgba(255, 184, 126, 0.15)', gradient: 'linear-gradient(90deg, rgba(255, 184, 126, 0.12) 0%, transparent 100%)' },
        rainbow: { border: 'var(--accent-lavender)', glow: 'rgba(184, 126, 255, 0.1)', gradient: 'var(--gradient-panel-header)' },
    };
    
    const colors = accentColors[accentColor];
    
    return (
        <div 
            className={`panel-container rounded-2xl shadow-lg flex flex-col overflow-hidden ${className}`} 
            style={{
                background: 'linear-gradient(180deg, var(--bg-tertiary) 0%, var(--bg-secondary) 100%)',
                border: '1px solid var(--border-subtle)',
                boxShadow: `var(--shadow-md), inset 0 1px 0 rgba(255, 255, 255, 0.03)`,
                ...style
            }}
        >
            {/* Rainbow accent line at top */}
            <div 
                className="h-[2px] w-full"
                style={{
                    background: accentColor === 'rainbow' 
                        ? 'linear-gradient(90deg, var(--accent-pink), var(--accent-peach), var(--accent-yellow), var(--accent-mint), var(--accent-cyan), var(--accent-lavender))'
                        : `linear-gradient(90deg, ${colors.border}, transparent)`,
                }}
            />
            
            <div 
                className={`panel-header px-4 py-2.5 text-[var(--text-secondary)] flex items-center justify-between transition-all duration-200 ${onToggleCollapse ? 'cursor-pointer hover:text-[var(--text-primary)]' : ''}`}
                style={{
                    background: colors.gradient,
                }}
                onClick={onToggleCollapse}
            >
                <h2 
                    className="font-semibold text-xs uppercase tracking-wider flex items-center gap-2"
                    style={{ color: colors.border }}
                >
                    <span 
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ 
                            background: colors.border,
                            boxShadow: `0 0 8px ${colors.border}`
                        }}
                    />
                    {title}
                </h2>
                <div className="flex items-center gap-2">
                    {rightHeaderContent}
                    {onToggleCollapse && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
                            className="p-1 rounded-lg hover:bg-[var(--bg-elevated)] transition-all duration-200"
                            style={{ color: colors.border }}
                        >
                            <svg 
                                xmlns="http://www.w3.org/2000/svg" 
                                viewBox="0 0 20 20" 
                                fill="currentColor" 
                                className={`w-4 h-4 transform transition-transform duration-300 ${!isCollapsed ? 'rotate-180' : ''}`}
                            >
                                <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
            <div 
                className={`panel-content p-3 flex-grow flex flex-col overflow-hidden transition-all duration-300 ease-out ${isCollapsed ? 'h-0 p-0 opacity-0' : 'opacity-100'}`}
            >
                {children}
            </div>
        </div>
    );
};

export default Panel;
