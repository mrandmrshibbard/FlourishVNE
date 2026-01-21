import React from 'react';
import { ScenesIcon, CharactersIcon, UIScreensIcon, AssetsIcon, VariablesIcon, SettingsIcon, TemplatesIcon } from './icons';
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

// Rainbow colors for each tab
const tabColors: Record<NavigationTab, { base: string; glow: string; pastel: string }> = {
    scenes: { base: 'var(--accent-pink)', glow: 'var(--shadow-glow-pink)', pastel: 'var(--pastel-pink)' },
    characters: { base: 'var(--accent-peach)', glow: 'var(--shadow-glow-peach)', pastel: 'var(--pastel-peach)' },
    ui: { base: 'var(--accent-yellow)', glow: '0 0 20px rgba(255, 224, 102, 0.35)', pastel: 'var(--pastel-yellow)' },
    assets: { base: 'var(--accent-mint)', glow: 'var(--shadow-glow-mint)', pastel: 'var(--pastel-mint)' },
    variables: { base: 'var(--accent-cyan)', glow: 'var(--shadow-glow-cyan)', pastel: 'var(--pastel-cyan)' },
    settings: { base: 'var(--accent-sky)', glow: '0 0 20px rgba(102, 179, 255, 0.35)', pastel: 'var(--pastel-sky)' },
    templates: { base: 'var(--accent-lavender)', glow: 'var(--shadow-glow-purple)', pastel: 'var(--pastel-lavender)' },
};

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
                icon: <ScenesIcon className="w-4 h-4" />,
                count: sceneCount,
                description: 'Create and edit story scenes with dialogue, choices, and commands'
            });
        }

        list.push(
            {
                id: 'characters',
                label: 'Characters',
                icon: <CharactersIcon className="w-4 h-4" />,
                count: characterCount,
                description: 'Design characters with layered sprites and expressions'
            },
            {
                id: 'ui',
                label: 'UI Screens',
                icon: <UIScreensIcon className="w-4 h-4" />,
                count: uiScreenCount,
                description: 'Create menus, title screens, and interactive UI elements'
            },
            {
                id: 'assets',
                label: 'Assets',
                icon: <AssetsIcon className="w-4 h-4" />,
                count: assetCount,
                description: 'Manage images, audio, and video files'
            },
            {
                id: 'variables',
                label: 'Variables',
                icon: <VariablesIcon className="w-4 h-4" />,
                count: variableCount,
                description: 'Create and manage story variables and game state'
            },
            {
                id: 'settings',
                label: 'Settings',
                icon: <SettingsIcon className="w-4 h-4" />,
                count: 0,
                description: 'Configure project settings and preferences'
            },
            {
                id: 'templates',
                label: 'Templates',
                icon: <TemplatesIcon className="w-4 h-4" />,
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
        <div 
            className="flex items-center gap-2 p-2 rounded-2xl relative overflow-hidden"
            style={{
                background: `linear-gradient(135deg, 
                    color-mix(in srgb, var(--bg-secondary) 90%, var(--accent-pink) 10%) 0%,
                    color-mix(in srgb, var(--bg-secondary) 90%, var(--accent-cyan) 10%) 50%,
                    color-mix(in srgb, var(--bg-secondary) 90%, var(--accent-lavender) 10%) 100%
                )`,
                border: '1px solid var(--border-subtle)',
                boxShadow: `
                    inset 0 1px 0 rgba(255, 255, 255, 0.05),
                    0 4px 20px rgba(0, 0, 0, 0.3),
                    0 0 40px color-mix(in srgb, var(--accent-pink) 10%, transparent)
                `
            }}
        >
            {/* Rainbow shimmer line at the top */}
            <div 
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{
                    background: 'linear-gradient(90deg, var(--accent-pink), var(--accent-peach), var(--accent-yellow), var(--accent-mint), var(--accent-cyan), var(--accent-lavender), var(--accent-pink))',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 3s linear infinite'
                }}
            />
            
            {tabs.map((tab, index) => {
                const shortcut = getShortcutLabel(tab.id);
                const baseTooltip = shortcut ? `${tab.description} (${shortcut})` : tab.description;
                const rightClickHint = isMultiWindowSupported() && !isChildWindow && tab.id !== 'settings' && tab.id !== 'templates'
                    ? ' | Right-click to focus manager window'
                    : '';
                const tooltip = `${baseTooltip}${rightClickHint}`;
                const colors = tabColors[tab.id];
                const isActive = activeTab === tab.id;

                return (
                    <div key={tab.id} className="relative group">
                        <button
                            onClick={() => onTabChange(tab.id)}
                            onContextMenu={(e) => handleRightClick(tab.id, e)}
                            className={`relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 ${
                                isActive
                                    ? 'text-white scale-[1.02]'
                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:scale-[1.02]'
                            }`}
                            style={isActive ? {
                                background: `linear-gradient(135deg, ${colors.base} 0%, ${colors.pastel} 100%)`,
                                boxShadow: `
                                    0 0 20px color-mix(in srgb, ${colors.base} 50%, transparent),
                                    0 4px 15px color-mix(in srgb, ${colors.base} 30%, transparent),
                                    inset 0 1px 0 rgba(255, 255, 255, 0.25)
                                `,
                                border: '1px solid rgba(255, 255, 255, 0.2)'
                            } : {
                                background: 'transparent',
                                border: '1px solid transparent'
                            }}
                            title={tooltip}
                        >
                            {/* Inactive tab subtle hover glow */}
                            {!isActive && (
                                <div 
                                    className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                    style={{
                                        background: `linear-gradient(135deg, color-mix(in srgb, ${colors.base} 15%, transparent), color-mix(in srgb, ${colors.pastel} 10%, transparent))`,
                                        border: `1px solid color-mix(in srgb, ${colors.base} 30%, transparent)`
                                    }}
                                />
                            )}
                            
                            {/* Icon with colored glow effect */}
                            <span 
                                className="relative z-10 transition-all duration-300"
                                style={{ 
                                    color: isActive ? 'white' : colors.base,
                                    filter: isActive ? 'drop-shadow(0 0 4px rgba(255,255,255,0.5))' : 'none'
                                }}
                            >
                                {tab.icon}
                            </span>
                            
                            {/* Label */}
                            <span className="relative z-10">{tab.label}</span>
                            
                            {/* Count badge with fun styling */}
                            {tab.count > 0 && (
                                <span 
                                    className={`relative z-10 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all duration-300 ${
                                        isActive
                                            ? 'bg-white/30 text-white shadow-sm'
                                            : 'text-[var(--text-secondary)]'
                                    }`}
                                    style={!isActive ? { 
                                        backgroundColor: `color-mix(in srgb, ${colors.base} 25%, transparent)`,
                                        border: `1px solid color-mix(in srgb, ${colors.base} 20%, transparent)`
                                    } : {
                                        backdropFilter: 'blur(4px)'
                                    }}
                                >
                                    {tab.count}
                                </span>
                            )}
                            
                            {/* Active indicator dot */}
                            {isActive && (
                                <span 
                                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white"
                                    style={{
                                        boxShadow: '0 0 8px rgba(255,255,255,0.8)'
                                    }}
                                />
                            )}
                        </button>
                    
                        {/* Pop-out Window Button - Only show in main window */}
                        {!isChildWindow && isMultiWindowSupported() && tab.id !== 'settings' && tab.id !== 'templates' && (
                            <button
                                onClick={(e) => handleOpenInWindow(tab.id, e)}
                                className="absolute -top-2 -right-2 w-6 h-6 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110"
                                style={{ 
                                    background: `linear-gradient(135deg, ${colors.base}, ${colors.pastel})`,
                                    boxShadow: `0 2px 12px color-mix(in srgb, ${colors.base} 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.3)`,
                                    border: '1px solid rgba(255, 255, 255, 0.2)'
                                }}
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