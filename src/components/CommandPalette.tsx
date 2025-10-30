import React, { useState } from 'react';
import { CommandType } from '../features/scene/types';
import { ChevronDownIcon, ChevronRightIcon } from './icons';

// Command category definitions with color coding
export const COMMAND_CATEGORIES = {
    'Story': {
        color: 'bg-purple-500/20 border-purple-500 text-purple-300',
        headerColor: 'bg-purple-600/30 text-purple-200',
        commands: [CommandType.Dialogue, CommandType.Choice, CommandType.Label, CommandType.Jump, CommandType.JumpToLabel]
    },
    'Characters': {
        color: 'bg-blue-500/20 border-blue-500 text-blue-300',
        headerColor: 'bg-blue-600/30 text-blue-200',
        commands: [CommandType.ShowCharacter, CommandType.HideCharacter]
    },
    'Scenes': {
        color: 'bg-green-500/20 border-green-500 text-green-300',
        headerColor: 'bg-green-600/30 text-green-200',
        commands: [CommandType.SetBackground]
    },
    'Audio': {
        color: 'bg-yellow-500/20 border-yellow-500 text-yellow-300',
        headerColor: 'bg-yellow-600/30 text-yellow-200',
        commands: [CommandType.PlayMusic, CommandType.StopMusic, CommandType.PlaySoundEffect]
    },
    'Variables': {
        color: 'bg-pink-500/20 border-pink-500 text-pink-300',
        headerColor: 'bg-pink-600/30 text-pink-200',
        commands: [CommandType.SetVariable, CommandType.TextInput]
    },
    'Screen FX': {
        color: 'bg-orange-500/20 border-orange-500 text-orange-300',
        headerColor: 'bg-orange-600/30 text-orange-200',
        commands: [CommandType.ShakeScreen, CommandType.TintScreen, CommandType.PanZoomScreen, CommandType.FlashScreen, CommandType.ResetScreenEffects]
    },
    'UI Elements': {
        color: 'bg-cyan-500/20 border-cyan-500 text-cyan-300',
        headerColor: 'bg-cyan-600/30 text-cyan-200',
        commands: [CommandType.ShowText, CommandType.HideText, CommandType.ShowImage, CommandType.HideImage, CommandType.ShowButton, CommandType.HideButton, CommandType.ShowScreen]
    },
    'Media': {
        color: 'bg-red-500/20 border-red-500 text-red-300',
        headerColor: 'bg-red-600/30 text-red-200',
        commands: [CommandType.PlayMovie]
    },
    'Flow Control': {
        color: 'bg-indigo-500/20 border-indigo-500 text-indigo-300',
        headerColor: 'bg-indigo-600/30 text-indigo-200',
        commands: [CommandType.BranchStart, CommandType.BranchEnd, CommandType.Wait]
    }
} as const;

// Helper function to get command color
export const getCommandColor = (commandType: CommandType): string => {
    for (const [_, category] of Object.entries(COMMAND_CATEGORIES)) {
        if (category.commands.includes(commandType as any)) {
            return category.color;
        }
    }
    return 'bg-slate-500/20 border-slate-500 text-slate-300'; // default
};

// Helper function to format command display name
const formatCommandName = (commandType: CommandType): string => {
    return commandType.replace(/([A-Z])/g, ' $1').trim();
};

interface CommandPaletteProps {
    onDragStart: (commandType: CommandType) => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ onDragStart }) => {
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

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
            <div className="px-1.5 py-1 border-b border-slate-700 flex-shrink-0">
                <h2 className="text-xs font-bold text-white">Commands</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto px-1 py-1 space-y-1">
                {Object.entries(COMMAND_CATEGORIES).map(([categoryName, category]) => {
                    const isCollapsed = collapsedCategories.has(categoryName);
                    
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
                                {categoryName}
                            </button>

                            {/* Commands in Category */}
                            {!isCollapsed && (
                                <div className="space-y-0.5 pl-2">
                                    {category.commands.map(commandType => (
                                        <div
                                            key={commandType}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, commandType)}
                                            className={`px-1.5 py-0.5 rounded text-xs border cursor-move ${category.color} hover:opacity-80 transition-opacity`}
                                            title={`Drag to add ${formatCommandName(commandType)}`}
                                        >
                                            {formatCommandName(commandType)}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CommandPalette;
