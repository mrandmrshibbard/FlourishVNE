import React from 'react';
import { useTranslation, Trans } from 'react-i18next';

interface ShortcutCategory {
    title: string;
    shortcuts: { keys: string; description: string }[];
}

interface KeyboardShortcutsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation('components');

    const shortcutCategories: ShortcutCategory[] = [
        {
            title: t('keyboardShortcuts.categories.navigation'),
            shortcuts: [
                { keys: 'Shift + 1', description: t('keyboardShortcuts.items.goScenes') },
                { keys: 'Shift + 2', description: t('keyboardShortcuts.items.goCharacters') },
                { keys: 'Shift + 3', description: t('keyboardShortcuts.items.goUiScreens') },
                { keys: 'Shift + 4', description: t('keyboardShortcuts.items.goAssets') },
                { keys: 'Shift + 5', description: t('keyboardShortcuts.items.goVariables') },
                { keys: 'Shift + 6', description: t('keyboardShortcuts.items.goSettings') },
                { keys: 'Esc', description: t('keyboardShortcuts.items.deselect') },
            ]
        },
        {
            title: t('keyboardShortcuts.categories.events'),
            shortcuts: [
                { keys: 'Ctrl + C', description: t('keyboardShortcuts.items.copyEvents') },
                { keys: 'Ctrl + V', description: t('keyboardShortcuts.items.pasteEvents') },
                { keys: 'Ctrl + A', description: t('keyboardShortcuts.items.selectAllEvents') },
                { keys: 'Delete', description: t('keyboardShortcuts.items.deleteEvents') },
                { keys: 'Click', description: t('keyboardShortcuts.items.selectSingle') },
                { keys: 'Shift + Click', description: t('keyboardShortcuts.items.selectRange') },
                { keys: 'Ctrl + Click', description: t('keyboardShortcuts.items.addRemoveSelection') },
            ]
        },
        {
            title: t('keyboardShortcuts.categories.history'),
            shortcuts: [
                { keys: 'Ctrl + Z', description: t('keyboardShortcuts.items.undo') },
                { keys: 'Ctrl + Shift + Z', description: t('keyboardShortcuts.items.redo') },
                { keys: 'Ctrl + Y', description: t('keyboardShortcuts.items.redoAlt') },
            ]
        },
        {
            title: t('keyboardShortcuts.categories.general'),
            shortcuts: [
                { keys: '?', description: t('keyboardShortcuts.items.showHelp') },
                { keys: 'Ctrl + D', description: t('keyboardShortcuts.items.duplicateCharacter') },
            ]
        }
    ];

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
                        <span>⌨️</span> {t('keyboardShortcuts.title')}
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
                    <Trans i18nKey="keyboardShortcuts.footer" t={t} components={{ k: <kbd className="px-2 py-0.5 rounded bg-[var(--bg-tertiary)] font-mono text-xs" /> }} />
                </div>
            </div>
        </div>
    );
};

export default KeyboardShortcutsModal;
