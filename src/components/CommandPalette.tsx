import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CommandType } from '../features/scene/types';
import { ChevronDownIcon, ChevronRightIcon } from './icons';
import { pluginManager } from '../features/plugins/PluginManagerService';

// Command category definitions with color coding
export const COMMAND_CATEGORIES = {
    'Story': {
        color: 'bg-purple-500/20 border-purple-500 text-purple-300',
        headerColor: 'bg-purple-600/30 text-purple-200',
        commands: [CommandType.Dialogue, CommandType.Choice, CommandType.Label, CommandType.Jump, CommandType.JumpToLabel, CommandType.ShowMap, CommandType.ShowMiniGame]
    },
    'Characters': {
        color: 'bg-blue-500/20 border-blue-500 text-blue-300',
        headerColor: 'bg-blue-600/30 text-blue-200',
        commands: [CommandType.ShowCharacter, CommandType.HideCharacter, CommandType.SetCharacterLayer, CommandType.SetCharacterPose, CommandType.MoveCharacter]
    },
    'Scenes': {
        color: 'bg-green-500/20 border-green-500 text-green-300',
        headerColor: 'bg-green-600/30 text-green-200',
        commands: [CommandType.SetBackground]
    },
    'Audio': {
        color: 'bg-yellow-500/20 border-yellow-500 text-yellow-300',
        headerColor: 'bg-yellow-600/30 text-yellow-200',
        commands: [CommandType.PlayMusic, CommandType.StopMusic, CommandType.PlaySoundEffect, CommandType.StopSoundEffect]
    },
    'Variables': {
        color: 'bg-pink-500/20 border-pink-500 text-pink-300',
        headerColor: 'bg-pink-600/30 text-pink-200',
        commands: [CommandType.SetVariable, CommandType.TextInput]
    },
    'Items': {
        color: 'bg-emerald-500/20 border-emerald-500 text-emerald-300',
        headerColor: 'bg-emerald-600/30 text-emerald-200',
        commands: [CommandType.ShowItem, CommandType.GiveItem, CommandType.UseItem, CommandType.DestroyItem, CommandType.RestockCollection, CommandType.BuyItem, CommandType.SellItem]
    },
    'Screen FX': {
        color: 'bg-orange-500/20 border-orange-500 text-orange-300',
        headerColor: 'bg-orange-600/30 text-orange-200',
        commands: [CommandType.ShakeScreen, CommandType.TintScreen, CommandType.PanZoomScreen, CommandType.FlashScreen, CommandType.Lightning, CommandType.Flashlight, CommandType.Spotlight, CommandType.Fireworks, CommandType.PlaceLights, CommandType.ClearLights, CommandType.SetScreenOverlayEffect, CommandType.SetTimeOfDay, CommandType.ResetScreenEffects, CommandType.SpawnParticles, CommandType.StopParticles, CommandType.TweenElement]
    },
    'UI Elements': {
        color: 'bg-cyan-500/20 border-cyan-500 text-cyan-300',
        headerColor: 'bg-cyan-600/30 text-cyan-200',
        commands: [CommandType.ShowText, CommandType.HideText, CommandType.ShowImage, CommandType.HideImage, CommandType.ShowButton, CommandType.HideButton, CommandType.ShowHotSpot, CommandType.HideHotSpot, CommandType.ShowScreen, CommandType.HideScreen]
    },
    'Media': {
        color: 'bg-red-500/20 border-red-500 text-red-300',
        headerColor: 'bg-red-600/30 text-red-200',
        commands: [CommandType.PlayMovie, CommandType.StopMovie, CommandType.CreditRoll]
    },
    'Flow Control': {
        color: 'bg-indigo-500/20 border-indigo-500 text-indigo-300',
        headerColor: 'bg-indigo-600/30 text-indigo-200',
        commands: [CommandType.BranchStart, CommandType.BranchEnd, CommandType.Wait, CommandType.StartTimer, CommandType.StopTimer, CommandType.RunScript, CommandType.CallCommonEvent]
    },
    'Phone': {
        color: 'bg-rose-500/20 border-rose-500 text-rose-300',
        headerColor: 'bg-rose-600/30 text-rose-200',
        commands: [CommandType.PhoneIncomingText, CommandType.PhoneIncomingCall, CommandType.StartPhoneCall, CommandType.PhoneNotify, CommandType.ShowPhone, CommandType.HidePhone, CommandType.ShowPhoneText, CommandType.HidePhoneText]
    }
} as const;

const HIDDEN_COMMANDS = new Set<CommandType>([CommandType.BranchEnd]);

// Helper function to get command color
export const getCommandColor = (commandType: CommandType): string => {
    for (const [_, category] of Object.entries(COMMAND_CATEGORIES)) {
        const commands = category.commands as readonly CommandType[];
        if (commands.includes(commandType as CommandType)) {
            return category.color;
        }
    }
    return 'bg-slate-500/20 border-[var(--border-default)] text-[var(--text-primary)]'; // default
};

interface CommandPaletteProps {
    onDragStart: (commandType: CommandType) => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ onDragStart }) => {
    const { t } = useTranslation('commands');
    // Localized command display name, falling back to a camelCase-split of the type.
    const formatCommandName = (commandType: CommandType): string =>
        t(`names.${commandType}`, { defaultValue: commandType.replace(/([A-Z])/g, ' $1').trim() });
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set(Object.keys(COMMAND_CATEGORIES)));
    const [search, setSearch] = useState('');
    // Re-render when plugins register/unregister custom commands.
    const [, forceTick] = useState(0);
    useEffect(() => {
        const cb = () => forceTick(t => t + 1);
        pluginManager.addListener(cb);
        return () => pluginManager.removeListener(cb);
    }, []);
    const customCommands = pluginManager.getRegisteredCommands();

    const toggleCategory = (category: string) => {
        setCollapsedCategories(prev => {
            const next = new Set(prev);
            if (next.has(category)) {
                next.delete(category);
            } else {
                next.add(category);
            }
            return next;
        });
    };

    const handleDragStart = (e: React.DragEvent, commandType: CommandType) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/vn-command-type', commandType);
        onDragStart(commandType);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="px-1.5 py-1 border-b border-[var(--border-subtle)] flex-shrink-0 space-y-1">
                <h2 className="text-xs font-bold text-white">{t('paletteTitle')}</h2>
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    autoFocus
                    placeholder={t('searchCommands', { defaultValue: 'Search commands…' })}
                    className="w-full text-xs px-2 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)]"
                />
            </div>

            <div className="flex-1 overflow-y-auto px-1 py-1 space-y-1">
                {Object.entries(COMMAND_CATEGORIES).map(([categoryName, category]) => {
                    const q = search.trim().toLowerCase();
                    const cmds = category.commands.filter(ct => !HIDDEN_COMMANDS.has(ct) && (!q || formatCommandName(ct).toLowerCase().includes(q) || String(ct).toLowerCase().includes(q)));
                    if (q && cmds.length === 0) return null;
                    const isCollapsed = q ? false : collapsedCategories.has(categoryName);

                    return (
                        <div key={categoryName} className="space-y-0.5">
                            {/* Category Header */}
                            <button
                                onClick={() => toggleCategory(categoryName)}
                                className={`w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold ${category.headerColor} hover:opacity-80 transition-opacity`}
                            >
                                {isCollapsed ? (
                                    <ChevronRightIcon className="w-3 h-3" />
                                ) : (
                                    <ChevronDownIcon className="w-3 h-3" />
                                )}
                                {t(`categories.${categoryName}`)}
                            </button>

                            {/* Commands in Category */}
                            {!isCollapsed && (
                                <div className="space-y-0.5 pl-2">
                                    {cmds
                                        .map(commandType => (
                                            <div
                                                key={commandType}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, commandType)}
                                                className={`px-1.5 py-0.5 rounded text-xs border cursor-move ${category.color} hover:opacity-80 transition-opacity`}
                                                title={t('dragToAdd', { name: formatCommandName(commandType) })}
                                            >
                                                {formatCommandName(commandType)}
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Plugin-provided custom commands */}
                {(() => {
                    const q = search.trim().toLowerCase();
                    const filtered = customCommands.filter(c => !q || (c.displayName || '').toLowerCase().includes(q) || String(c.type || '').toLowerCase().includes(q));
                    if (filtered.length === 0) return null;
                    const isCollapsed = q ? false : collapsedCategories.has('Plugins');
                    return (
                        <div key="Plugins" className="space-y-0.5">
                            <button
                                onClick={() => toggleCategory('Plugins')}
                                className="w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-violet-600/30 text-violet-200 hover:opacity-80 transition-opacity"
                            >
                                {isCollapsed ? <ChevronRightIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
                                🧩 Plugins
                            </button>
                            {!isCollapsed && (
                                <div className="space-y-0.5 pl-2">
                                    {filtered.map(cmd => (
                                        <div
                                            key={cmd.type}
                                            draggable
                                            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('application/vn-command-type', cmd.type); onDragStart(cmd.type as unknown as CommandType); }}
                                            className="px-1.5 py-0.5 rounded text-xs border cursor-move bg-violet-500/20 border-violet-500 text-violet-300 hover:opacity-80 transition-opacity"
                                            title={cmd.description || cmd.displayName}
                                        >
                                            {cmd.displayName}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>
        </div>
    );
};

export default CommandPalette;
