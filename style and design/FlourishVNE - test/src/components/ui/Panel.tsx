import React from 'react';

const Panel: React.FC<{
    title: string;
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
    rightHeaderContent?: React.ReactNode;
}> = ({ title, children, className, style, isCollapsed, onToggleCollapse, rightHeaderContent }) => (
    <div className={`panel flex flex-col ${className || ''}`} style={style}>
        <div 
            className={`panel-header rounded-t-lg flex items-center justify-between ${onToggleCollapse ? 'cursor-pointer hover:bg-[var(--accent-purple)] hover:text-[var(--text-primary)] transition-colors' : ''}`}
        >
            <h2 className="font-bold text-base" onClick={onToggleCollapse}>{title}</h2>
            <div className="flex items-center gap-2">
                {rightHeaderContent}
                {onToggleCollapse && (
                    <button onClick={onToggleCollapse} className="transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 transform ${!isCollapsed ? 'rotate-180' : ''}`}>
                            <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
        {!isCollapsed && (
            <div className="p-4 flex-grow flex flex-col overflow-hidden">{children}</div>
        )}
    </div>
);

export default Panel;
