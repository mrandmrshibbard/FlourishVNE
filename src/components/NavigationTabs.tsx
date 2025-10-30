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
            count: sceneCount
        },
        {
            id: 'characters' as NavigationTab,
            label: 'Chars',
            icon: <SparkleIcon className="w-4 h-4" />,
            count: characterCount
        },
        {
            id: 'ui' as NavigationTab,
            label: 'UI',
            icon: <BookmarkSquareIcon className="w-4 h-4" />,
            count: uiScreenCount
        },
        {
            id: 'assets' as NavigationTab,
            label: 'Assets',
            icon: <PhotoIcon className="w-4 h-4" />,
            count: assetCount
        },
        {
            id: 'variables' as NavigationTab,
            label: 'Vars',
            icon: <Cog6ToothIcon className="w-4 h-4" />,
            count: variableCount
        },
        {
            id: 'settings' as NavigationTab,
            label: 'Settings',
            icon: <Cog6ToothIcon className="w-4 h-4" />,
            count: 0
        }
    ];

    return (
        <div className="flex items-center gap-1">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === tab.id
                            ? 'bg-sky-500 text-white'
                            : 'text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                    title={`${tab.label} (${tab.count})`}
                >
                    {tab.icon}
                    <span>{tab.label}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                        activeTab === tab.id
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-600 text-slate-400'
                    }`}>
                        {tab.count}
                    </span>
                </button>
            ))}
        </div>
    );
};

export default NavigationTabs;