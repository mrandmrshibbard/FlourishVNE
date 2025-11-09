import React from 'react';
import { BookOpenIcon, SparkleIcon, BookmarkSquareIcon, PhotoIcon, Cog6ToothIcon } from './icons';
import { isMultiWindowSupported, openManagerWindow, isManagerWindow, focusMainWindow, focusManagerWindow, type ManagerWindowType } from '../utils/windowManager';

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
    const tabs = [
        {
            id: 'scenes' as NavigationTab,
            label: 'Scenes',
            icon: <BookOpenIcon className="w-3.5 h-3.5" />,
            count: sceneCount,
            tooltip: 'Create and edit story scenes with dialogue, choices, and commands (Press 1)'
        },
        {
            id: 'characters' as NavigationTab,
            label: 'Chars',
            icon: <SparkleIcon className="w-3.5 h-3.5" />,
            count: characterCount,
            tooltip: 'Design characters with layered sprites and expressions (Press 2)'
        },
        {
            id: 'ui' as NavigationTab,
            label: 'UI',
            icon: <BookmarkSquareIcon className="w-3.5 h-3.5" />,
            count: uiScreenCount,
            tooltip: 'Create menus, title screens, and interactive UI elements (Press 3)'
        },
        {
            id: 'assets' as NavigationTab,
            label: 'Assets',
            icon: <PhotoIcon className="w-3.5 h-3.5" />,
            count: assetCount,
            tooltip: 'Manage images, audio, and video files (Press 4)'
        },
        {
            id: 'variables' as NavigationTab,
            label: 'Vars',
            icon: <Cog6ToothIcon className="w-3.5 h-3.5" />,
            count: variableCount,
            tooltip: 'Create and manage story variables and game state (Press 5)'
        },
        {
            id: 'settings' as NavigationTab,
            label: 'Settings',
            icon: <Cog6ToothIcon className="w-3.5 h-3.5" />,
            count: 0,
            tooltip: 'Configure project settings and preferences (Press 6)'
        },
        {
            id: 'templates' as NavigationTab,
            label: 'Templates',
            icon: <SparkleIcon className="w-3.5 h-3.5" />,
            count: 0,
            tooltip: 'Browse and apply pre-built templates to your project (Press 7)'
        }
    ];

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

    const isChildWindow = isManagerWindow();

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
            {tabs.map((tab) => (
                <div key={tab.id} className="relative group">
                    <button
                        onClick={() => onTabChange(tab.id)}
                        onContextMenu={(e) => handleRightClick(tab.id, e)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            activeTab === tab.id
                                ? 'bg-sky-500 text-white shadow-lg scale-105'
                                : 'text-slate-300 hover:text-white hover:bg-slate-700 hover:scale-102'
                        }`}
                        title={tab.tooltip + (isMultiWindowSupported() && !isChildWindow && tab.id !== 'settings' && tab.id !== 'templates' ? ' | Right-click to focus manager window' : '')}
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
            ))}
        </div>
    );
};

export default NavigationTabs;