import React from 'react';
import { BookOpenIcon, SparkleIcon, BookmarkSquareIcon, PhotoIcon, Cog6ToothIcon } from './icons';
import { isMultiWindowSupported, openManagerWindow, isManagerWindow, focusManagerWindow, type ManagerWindowType } from '../utils/windowManager';

export type NavigationTab = 'scenes' | 'characters' | 'ui' | 'assets' | 'variables' | 'settings' | 'templates';

interface NavigationTabsProps {
    activeTab: NavigationTab;
    onTabChange: (tab: NavigationTab) => void;
    sceneCount: number;
    characterCount: number;
    uiScreenCount: number;
    assetCount: number;
    variableCount: number;
}

const NavigationTabs: React.FC<NavigationTabsProps> = ({
    activeTab,
    onTabChange,
    sceneCount,
    characterCount,
    uiScreenCount,
    assetCount,
    variableCount
}) => {
    const isChildWindow = isManagerWindow();

    type TabConfig = {
        id: NavigationTab;
        label: string;
        icon: React.ReactNode;
        count: number;
        description: string;
    };

    const tabs = React.useMemo<TabConfig[]>(() => {
        const list: TabConfig[] = [];

        if (!isChildWindow) {
            list.push({
                id: 'scenes',
                label: 'Scenes',
                icon: <BookOpenIcon className="w-3.5 h-3.5" />,
                count: sceneCount,
                description: 'Create and edit story scenes with dialogue, choices, and commands'
            });
        }

        list.push(
            {
                id: 'characters',
                label: 'Chars',
                icon: <SparkleIcon className="w-3.5 h-3.5" />,
                count: characterCount,
                description: 'Design characters with layered sprites and expressions'
            },
            {
                id: 'ui',
                label: 'UI',
                icon: <BookmarkSquareIcon className="w-3.5 h-3.5" />,
                count: uiScreenCount,
                description: 'Create menus, title screens, and interactive UI elements'
            },
            {
                id: 'assets',
                label: 'Assets',
                icon: <PhotoIcon className="w-3.5 h-3.5" />,
                count: assetCount,
                description: 'Manage images, audio, and video files'
            },
            {
                id: 'variables',
                label: 'Vars',
                icon: <Cog6ToothIcon className="w-3.5 h-3.5" />,
                count: variableCount,
                description: 'Create and manage story variables and game state'
            },
            {
                id: 'settings',
                label: 'Settings',
                icon: <Cog6ToothIcon className="w-3.5 h-3.5" />,
                count: 0,
                description: 'Configure project settings and preferences'
            },
            {
                id: 'templates',
                label: 'Templates',
                icon: <SparkleIcon className="w-3.5 h-3.5" />,
                count: 0,
                description: 'Browse and apply pre-built templates to your project'
            }
        );

        return list;
    }, [
        isChildWindow,
        sceneCount,
        characterCount,
        uiScreenCount,
        assetCount,
        variableCount
    ]);

    const handleOpenInWindow = (tabId: NavigationTab, event: React.MouseEvent) => {
        event.stopPropagation();
        openManagerWindow(tabId as ManagerWindowType);
    };

    const handleRightClick = (tabId: NavigationTab, event: React.MouseEvent) => {
        if (!isChildWindow && isMultiWindowSupported() && tabId !== 'settings' && tabId !== 'templates') {
            event.preventDefault();
            event.stopPropagation();
            focusManagerWindow(tabId as ManagerWindowType);
        }
    };

    const focusableTabs = React.useMemo(
        () => tabs.filter(tab => tab.id !== 'settings' && tab.id !== 'templates'),
        [tabs]
    );

    const getShortcutLabel = React.useCallback(
        (tabId: NavigationTab) => {
            const index = focusableTabs.findIndex(tab => tab.id === tabId);
            return index === -1 ? null : `Shift+${index + 1}`;
        },
        [focusableTabs]
    );

    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) {
                return;
            }

            const target = event.target as HTMLElement | null;
            if (target) {
                const tag = target.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
                    return;
                }
            }

            let numericKey: number | null = null;

            if (/^Digit[0-9]$/.test(event.code)) {
                numericKey = parseInt(event.code.replace('Digit', ''), 10);
            } else if (/^Numpad[0-9]$/.test(event.code)) {
                numericKey = parseInt(event.code.replace('Numpad', ''), 10);
            } else if (/^[0-9]$/.test(event.key)) {
                numericKey = parseInt(event.key, 10);
            }

            if (numericKey === null || Number.isNaN(numericKey)) {
                return;
            }

            const targetTab = focusableTabs[numericKey - 1];
            if (!targetTab) {
                return;
            }

            event.preventDefault();

            if (isChildWindow) {
                onTabChange(targetTab.id);
                return;
            }

            if (
                isMultiWindowSupported() &&
                targetTab.id !== 'settings' &&
                targetTab.id !== 'templates'
            ) {
                openManagerWindow(targetTab.id as ManagerWindowType);
            }
        };

        document.addEventListener('keydown', handleKeyDown, { passive: false });
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [focusableTabs, onTabChange, isChildWindow]);

    // Handle ESC key in manager windows to close them
    React.useEffect(() => {
        if (!isChildWindow) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                window.close();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isChildWindow]);

    return (
        <div className="flex items-center gap-1.5 p-1.5 panel">
            {tabs.map((tab) => {
                const shortcut = getShortcutLabel(tab.id);
                const baseTooltip = shortcut ? `${tab.description} (${shortcut})` : tab.description;
                const rightClickHint = isMultiWindowSupported() && !isChildWindow && tab.id !== 'settings' && tab.id !== 'templates'
                    ? ' | Right-click to focus manager window'
                    : '';
                const tooltip = `${baseTooltip}${rightClickHint}`;

                return (
                    <div key={tab.id} className="relative group">
                    <button
                        onClick={() => onTabChange(tab.id)}
                        onContextMenu={(e) => handleRightClick(tab.id, e)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            activeTab === tab.id
                                ? 'bg-sky-500 text-white shadow-lg scale-105'
                                : 'text-slate-300 hover:text-white hover:bg-slate-700 hover:scale-102'
                        }`}
                        title={tooltip}
                    >
                        <span className={activeTab === tab.id ? 'text-white' : 'text-sky-400'}>{tab.icon}</span>
                        <span>{tab.label}</span>
                        {tab.count > 0 && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                activeTab === tab.id
                                    ? 'bg-white/20 text-white'
                                    : 'bg-slate-600/70 text-slate-300'
                            }`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                    
                    {/* Pop-out Window Button - Only show in main window */}
                    {!isChildWindow && isMultiWindowSupported() && tab.id !== 'settings' && tab.id !== 'templates' && (
                        <button
                            onClick={(e) => handleOpenInWindow(tab.id, e)}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-purple-500 hover:bg-purple-600 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                            title={`Open or focus ${tab.label} in separate window`}
                        >
                            ⧉
                        </button>
                    )}
                </div>
                );
            })}
        </div>
    );
};

export default NavigationTabs;