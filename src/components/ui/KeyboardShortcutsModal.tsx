import React from 'react';

interface ShortcutCategory {
    title: string;
    shortcuts: { keys: string; description: string }[];
}

const shortcutCategories: ShortcutCategory[] = [
    {
        title: 'Navigation',
        shortcuts: [
            { keys: 'Shift + 1', description: 'Go to Scenes tab' },
            { keys: 'Shift + 2', description: 'Go to Characters tab' },
            { keys: 'Shift + 3', description: 'Go to Assets tab' },
            { keys: 'Shift + 4', description: 'Go to Variables tab' },
            { keys: 'Shift + 5', description: 'Go to UI Editor tab' },
            { keys: 'Shift + 6', description: 'Go to Settings tab' },
            { keys: 'Shift + 7', description: 'Go to Templates tab' },
            { keys: 'Esc', description: 'Deselect / Close panels' },
        ]
    },
    {
        title: 'Commands (Scene Editor)',
        shortcuts: [
            { keys: 'Ctrl + C', description: 'Copy selected commands' },
            { keys: 'Ctrl + V', description: 'Paste commands' },
            { keys: 'Ctrl + A', description: 'Select all commands' },
            { keys: 'Delete', description: 'Delete selected commands' },
            { keys: 'Click', description: 'Select single command' },
            { keys: 'Shift + Click', description: 'Select range of commands' },
            { keys: 'Ctrl + Click', description: 'Add/remove from selection' },
        ]
    },
    {
        title: 'History',
        shortcuts: [
            { keys: 'Ctrl + Z', description: 'Undo last action' },
            { keys: 'Ctrl + Shift + Z', description: 'Redo action' },
            { keys: 'Ctrl + Y', description: 'Redo action (alternate)' },
        ]
    },
    {
        title: 'General',
        shortcuts: [
            { keys: '?', description: 'Show this help panel' },
            { keys: 'Ctrl + D', description: 'Duplicate character (in Character Editor)' },
        ]
    }
];

interface KeyboardShortcutsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70"
            onClick={handleBackdropClick}
        >
            <div className="bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-lg shadow-xl w-full max-w-2xl p-6 m-4 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <span>⌨️</span> Keyboard Shortcuts
                    </h2>
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                        ✕
                    </button>
                </div>

                <div className="space-y-6">
                    {shortcutCategories.map((category, categoryIndex) => (
                        <div key={categoryIndex}>
                            <h3 className="text-lg font-semibold text-[var(--accent-cyan)] mb-3 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-[var(--accent-cyan)]"></span>
                                {category.title}
                            </h3>
                            <div className="grid gap-2">
                                {category.shortcuts.map((shortcut, shortcutIndex) => (
                                    <div 
                                        key={shortcutIndex}
                                        className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80"
                                    >
                                        <span className="text-[var(--text-secondary)]">
                                            {shortcut.description}
                                        </span>
                                        <kbd className="px-3 py-1.5 rounded-md bg-[var(--bg-primary)] text-[var(--text-primary)] font-mono text-sm border border-[var(--border-color)] shadow-sm min-w-[80px] text-center">
                                            {shortcut.keys}
                                        </kbd>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-6 pt-4 border-t border-[var(--border-color)] text-center text-sm text-[var(--text-secondary)]">
                    Press <kbd className="px-2 py-0.5 rounded bg-[var(--bg-tertiary)] font-mono text-xs">?</kbd> anytime to show this panel
                </div>
            </div>
        </div>
    );
};

export default KeyboardShortcutsModal;
