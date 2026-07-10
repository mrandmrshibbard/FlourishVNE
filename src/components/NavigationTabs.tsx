import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScenesIcon, CharactersIcon, UIScreensIcon, AssetsIcon, VariablesIcon, SettingsIcon, CommonEventsIcon, ArchiveBoxIcon, GamepadIcon } from './icons';
import { isMultiWindowSupported, openManagerWindow, isManagerWindow, focusManagerWindow, type ManagerWindowType } from '../utils/windowManager';

export type NavigationTab = 'scenes' | 'characters' | 'ui' | 'assets' | 'variables' | 'commonEvents' | 'systems' | 'miniGames' | 'settings';

interface NavigationTabsProps {
    activeTab: NavigationTab;
    onTabChange: (tab: NavigationTab) => void;
    sceneCount: number;
    characterCount: number;
    uiScreenCount: number;
    assetCount: number;
    variableCount: number;
    commonEventCount: number;
    systemItemCount: number;
    miniGameCount: number;
}

// Rainbow colors for each tab
const tabColors: Record<NavigationTab, { base: string; glow: string; pastel: string }> = {
    scenes: { base: 'var(--accent-pink)', glow: 'var(--shadow-glow-pink)', pastel: 'var(--pastel-pink)' },
    characters: { base: 'var(--accent-peach)', glow: 'var(--shadow-glow-peach)', pastel: 'var(--pastel-peach)' },
    ui: { base: 'var(--accent-yellow)', glow: '0 0 20px rgba(255, 224, 102, 0.35)', pastel: 'var(--pastel-yellow)' },
    assets: { base: 'var(--accent-mint)', glow: 'var(--shadow-glow-mint)', pastel: 'var(--pastel-mint)' },
    variables: { base: 'var(--accent-cyan)', glow: 'var(--shadow-glow-cyan)', pastel: 'var(--pastel-cyan)' },
    commonEvents: { base: '#f59e0b', glow: '0 0 20px rgba(245, 158, 11, 0.35)', pastel: '#fbbf24' },
    systems: { base: 'var(--accent-lavender)', glow: '0 0 20px rgba(167, 139, 250, 0.35)', pastel: 'var(--pastel-lavender)' },
    miniGames: { base: '#34d399', glow: '0 0 20px rgba(52, 211, 153, 0.35)', pastel: '#6ee7b7' },
    settings: { base: 'var(--accent-sky)', glow: '0 0 20px rgba(102, 179, 255, 0.35)', pastel: 'var(--pastel-sky)' },
};

const NavigationTabs: React.FC<NavigationTabsProps> = ({
    activeTab,
    onTabChange,
    sceneCount,
    characterCount,
    uiScreenCount,
    assetCount,
    variableCount,
    commonEventCount,
    systemItemCount,
    miniGameCount
}) => {
    const isChildWindow = isManagerWindow();
    const { t } = useTranslation('nav');

    // Tab-label display mode. Default (compact) = icon-only, with the label springing open only for
    // the active tab (the space-saving redesign). Expanded = ALL tabs show their labels (the older,
    // roomier look) — a per-user choice persisted across sessions.
    const [labelsExpanded, setLabelsExpanded] = React.useState<boolean>(() => {
        try { return localStorage.getItem('flourish-nav-tabs-expanded') === '1'; } catch { return false; }
    });
    const toggleLabelsExpanded = React.useCallback(() => {
        setLabelsExpanded(prev => {
            const next = !prev;
            try { localStorage.setItem('flourish-nav-tabs-expanded', next ? '1' : '0'); } catch { /* ignore */ }
            return next;
        });
    }, []);

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
                label: 'UI / Screens',
                icon: <UIScreensIcon className="w-4 h-4" />,
                count: uiScreenCount,
                description: 'Design in-game UI elements and menu screens'
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
                id: 'commonEvents',
                label: 'Events',
                icon: <CommonEventsIcon className="w-4 h-4" />,
                count: commonEventCount,
                description: 'Reusable command sequences triggered from scenes'
            },
            {
                id: 'systems',
                label: 'Systems',
                icon: <ArchiveBoxIcon className="w-4 h-4" />,
                count: systemItemCount,
                description: 'Opt-in gameplay systems like Inventory, and the item registry'
            },
            {
                id: 'miniGames',
                label: 'Mini Games',
                icon: <GamepadIcon className="w-4 h-4" />,
                count: miniGameCount,
                description: 'Build playable mini games shown by the Show Mini Game command'
            },
            {
                id: 'settings',
                label: 'Settings',
                icon: <SettingsIcon className="w-4 h-4" />,
                count: 0,
                description: 'Configure project settings and preferences'
            }
        );

        return list;
    }, [
        isChildWindow,
        sceneCount,
        characterCount,
        uiScreenCount,
        assetCount,
        variableCount,
        commonEventCount,
        systemItemCount,
        miniGameCount
    ]);

    const handleOpenInWindow = (tabId: NavigationTab, event: React.MouseEvent) => {
        event.stopPropagation();
        openManagerWindow(tabId as ManagerWindowType);
    };

    const handleRightClick = (tabId: NavigationTab, event: React.MouseEvent) => {
        if (!isChildWindow && isMultiWindowSupported() && tabId !== 'settings' && tabId !== 'systems' && tabId !== 'miniGames') {
            event.preventDefault();
            event.stopPropagation();
            focusManagerWindow(tabId as ManagerWindowType);
        }
    };

    const focusableTabs = React.useMemo(
        () => tabs.filter(tab => tab.id !== 'settings' && tab.id !== 'systems' && tab.id !== 'miniGames'),
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
                targetTab.id !== 'settings'
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
            className="flex flex-wrap items-center gap-0.5 xl:gap-1 2xl:gap-2 p-1 xl:p-1.5 2xl:p-2 rounded-2xl relative min-w-0 max-w-full"
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

            {/* Expand / collapse all tab labels — lets users pick the roomy labeled look or the
                compact icon-only one. Preference persists (localStorage). */}
            <button
                onClick={toggleLabelsExpanded}
                aria-pressed={labelsExpanded}
                title={labelsExpanded ? t('collapseLabels', 'Collapse tabs to icons') : t('expandLabels', 'Show all tab labels')}
                className="relative z-10 flex-shrink-0 flex items-center justify-center w-7 h-7 xl:w-8 xl:h-8 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-all duration-300"
                style={{ border: '1px solid var(--border-subtle)' }}
            >
                <svg className={`w-4 h-4 transition-transform duration-300 ${labelsExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 4l6 6-6 6" />
                    <path d="M3 4l6 6-6 6" opacity="0.5" />
                </svg>
            </button>

            {tabs.map((tab, index) => {
                const label = t(`tabs.${tab.id}`);
                const description = t(`desc.${tab.id}`);
                const shortcut = getShortcutLabel(tab.id);
                const baseTooltip = shortcut ? `${description} (${shortcut})` : description;
                const rightClickHint = isMultiWindowSupported() && !isChildWindow && tab.id !== 'settings'
                    ? t('rightClickHint')
                    : '';
                const tooltip = `${baseTooltip}${rightClickHint}`;
                const colors = tabColors[tab.id];
                const isActive = activeTab === tab.id;

                return (
                    <div key={tab.id} className="relative group flex-shrink-0">
                        <button
                            onClick={() => onTabChange(tab.id)}
                            onContextMenu={(e) => handleRightClick(tab.id, e)}
                            className={`relative flex items-center px-2 xl:px-2.5 2xl:px-4 py-1.5 2xl:py-2.5 rounded-xl text-[11px] xl:text-xs font-semibold transition-all duration-300 ${
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
                            
                            {/* Label — tabs are icon-only by default so the bar stays compact and
                                left-packed (it can never clip under the right-hand controls). The name
                                SPRINGS open ONLY for the ACTIVE ("highlighted") tab (animates
                                max-width/opacity/margin + an overshooting translateX for the bounce) and
                                springs closed when it's deselected. Inactive tabs deliberately do NOT
                                expand on hover: an inline hover-reveal pushed every neighbouring tab
                                sideways, so sweeping the mouse across the bar made the whole row jitter
                                ("shake"). The name is still surfaced on hover via the button's title
                                tooltip, with zero layout shift. */}
                            <span
                                className={`relative z-10 whitespace-nowrap overflow-hidden transition-all duration-300 ${
                                    (isActive || labelsExpanded)
                                        ? 'max-w-[10rem] opacity-100 ml-2 translate-x-0'
                                        : 'max-w-0 opacity-0 ml-0 -translate-x-2'
                                }`}
                                style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                            >{label}</span>

                            {/* Count badge — shown on the active tab, or on every tab when labels are
                                expanded (the roomy look has space for it without reflow jitter). */}
                            {tab.count > 0 && (
                                <span
                                    className={`${(isActive || labelsExpanded) ? 'inline-block ml-1.5' : 'hidden'} relative z-10 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all duration-300 ${
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
                        {!isChildWindow && isMultiWindowSupported() && tab.id !== 'settings' && tab.id !== 'systems' && tab.id !== 'miniGames' && (
                            <button
                                onClick={(e) => handleOpenInWindow(tab.id, e)}
                                className="absolute -top-2 -right-2 w-6 h-6 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110"
                                style={{ 
                                    background: `linear-gradient(135deg, ${colors.base}, ${colors.pastel})`,
                                    boxShadow: `0 2px 12px color-mix(in srgb, ${colors.base} 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.3)`,
                                    border: '1px solid rgba(255, 255, 255, 0.2)'
                                }}
                                title={t('openInWindow', { label })}
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