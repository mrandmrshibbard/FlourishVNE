import React from 'react';
import { BookOpenIcon, SparkleIcon, BookmarkSquareIcon, PhotoIcon, Cog6ToothIcon } from './icons';

export type NavigationTab = 'scenes' | 'characters' | 'ui' | 'assets' | 'variables' | 'settings';

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
            icon: <BookOpenIcon className="w-4 h-4" />,
            count: sceneCount,
            tooltip: 'Create and edit story scenes with dialogue, choices, and commands'
        },
        {
            id: 'characters' as NavigationTab,
            label: 'Chars',
            icon: <SparkleIcon className="w-4 h-4" />,
            count: characterCount,
            tooltip: 'Design characters with layered sprites and expressions'
        },
        {
            id: 'ui' as NavigationTab,
            label: 'UI',
            icon: <BookmarkSquareIcon className="w-4 h-4" />,
            count: uiScreenCount,
            tooltip: 'Create menus, title screens, and interactive UI elements'
        },
        {
            id: 'assets' as NavigationTab,
            label: 'Assets',
            icon: <PhotoIcon className="w-4 h-4" />,
            count: assetCount,
            tooltip: 'Manage images, audio, and video files'
        },
        {
            id: 'variables' as NavigationTab,
            label: 'Vars',
            icon: <Cog6ToothIcon className="w-4 h-4" />,
            count: variableCount,
            tooltip: 'Create and manage story variables and game state'
        },
        {
            id: 'settings' as NavigationTab,
            label: 'Settings',
            icon: <Cog6ToothIcon className="w-4 h-4" />,
            count: 0,
            tooltip: 'Configure project settings and preferences'
        }
    ];

    return (
        <div className="flex items-center gap-2 p-2 panel">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                        activeTab === tab.id
                            ? 'bg-sky-500 text-white shadow-lg scale-105'
                            : 'text-slate-300 hover:text-white hover:bg-slate-700 hover:scale-102'
                    }`}
                    title={tab.tooltip}
                >
                    <span className={activeTab === tab.id ? 'text-white' : 'text-sky-400'}>{tab.icon}</span>
                    <span>{tab.label}</span>
                    {tab.count > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            activeTab === tab.id
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-600/70 text-slate-300'
                        }`}>
                            {tab.count}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
};

export default NavigationTabs;
