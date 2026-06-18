import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

interface ContextMenuOption {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    warning?: string;
}

interface ContextMenuProps {
    x: number;
    y: number;
    options: ContextMenuOption[];
    onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, options, onClose }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    return ReactDOM.createPortal(
        <div
            ref={menuRef}
            className="fixed bg-slate-800 border border-slate-700 rounded-md shadow-xl z-[9999] min-w-48 overflow-hidden"
            style={{
                left: `${x}px`,
                top: `${y}px`,
            }}
        >
            {options.map((option, index) => (
                <button
                    key={index}
                    onClick={() => {
                        if (!option.disabled) {
                            option.onClick();
                            onClose();
                        }
                    }}
                    disabled={option.disabled}
                    className={`
                        w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors
                        ${option.disabled 
                            ? 'text-slate-500 cursor-not-allowed' 
                            : 'text-slate-200 hover:bg-sky-500/20 hover:text-sky-300'
                        }
                    `}
                    title={option.warning}
                >
                    {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                    <span className="flex-1">{option.label}</span>
                    {option.warning && (
                        <span className="text-amber-400 text-xs">⚠</span>
                    )}
                </button>
            ))}
        </div>,
        document.body
    );
};
