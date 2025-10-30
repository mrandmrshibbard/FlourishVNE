import React, { useState } from 'react';
import { CommandType } from '../features/scene/types';
import { ChevronDownIcon, ChevronRightIcon } from './icons';

interface CommandGroup {
    name: string;
    color: string;
    bgColor: string;
    commands: {
        type: CommandType;
        label: string;
        description: string;
    }[];
}

const commandGroups: CommandGroup[] = [
    {
        name: 'Dialogue & Text',
        color: 'text-blue-300',
        bgColor: 'bg-blue-900/30',
        commands: [
            { type: CommandType.Dialogue, label: 'Show Dialogue', description: 'Display character dialogue' },
            { type: CommandType.ShowText, label: 'Show Text', description: 'Display text overlay' },
            { type: CommandType.HideText, label: 'Hide Text', description: 'Remove text overlay' },
        ]
    },
    {
        name: 'Characters',
        color: 'text-purple-300',
        bgColor: 'bg-purple-900/30',
        commands: [
            { type: CommandType.ShowCharacter, label: 'Show Character', description: 'Display a character' },
            { type: CommandType.HideCharacter, label: 'Hide Character', description: 'Remove a character' },
        ]
    },
    {
        name: 'Scenes & Backgrounds',
        color: 'text-green-300',
        bgColor: 'bg-green-900/30',
        commands: [
            { type: CommandType.SetBackground, label: 'Set Background', description: 'Change scene background' },
            { type: CommandType.Jump, label: 'Go To Scene', description: 'Jump to another scene' },
            { type: CommandType.Label, label: 'Label', description: 'Create a label marker' },
            { type: CommandType.JumpToLabel, label: 'Jump To Label', description: 'Jump to a label' },
        ]
    },
    {
        name: 'Audio',
        color: 'text-pink-300',
        bgColor: 'bg-pink-900/30',
        commands: [
            { type: CommandType.PlayMusic, label: 'Play Music', description: 'Play background music' },
            { type: CommandType.StopMusic, label: 'Stop Music', description: 'Stop background music' },
            { type: CommandType.PlaySoundEffect, label: 'Play Sound', description: 'Play sound effect' },
        ]
    },
    {
        name: 'Images & Media',
        color: 'text-orange-300',
        bgColor: 'bg-orange-900/30',
        commands: [
            { type: CommandType.ShowImage, label: 'Show Image', description: 'Display an image' },
            { type: CommandType.HideImage, label: 'Hide Image', description: 'Remove an image' },
            { type: CommandType.PlayMovie, label: 'Play Video', description: 'Play a video' },
        ]
    },
    {
        name: 'Effects & Transitions',
        color: 'text-cyan-300',
        bgColor: 'bg-cyan-900/30',
        commands: [
            { type: CommandType.ShakeScreen, label: 'Shake Screen', description: 'Screen shake effect' },
            { type: CommandType.FlashScreen, label: 'Flash', description: 'Flash screen effect' },
            { type: CommandType.TintScreen, label: 'Tint Screen', description: 'Apply color tint' },
            { type: CommandType.PanZoomScreen, label: 'Pan/Zoom', description: 'Pan and zoom screen' },
            { type: CommandType.ResetScreenEffects, label: 'Reset Effects', description: 'Reset all screen effects' },
        ]
    },
    {
        name: 'Choices & Branching',
        color: 'text-yellow-300',
        bgColor: 'bg-yellow-900/30',
        commands: [
            { type: CommandType.Choice, label: 'Show Choices', description: 'Display choice menu' },
            { type: CommandType.BranchStart, label: 'Branch Start', description: 'Start a conditional branch' },
            { type: CommandType.BranchEnd, label: 'Branch End', description: 'End a conditional branch' },
        ]
    },
    {
        name: 'Variables & Logic',
        color: 'text-indigo-300',
        bgColor: 'bg-indigo-900/30',
        commands: [
            { type: CommandType.SetVariable, label: 'Set Variable', description: 'Set variable value' },
            { type: CommandType.TextInput, label: 'Text Input', description: 'Get text input from player' },
        ]
    },
    {
        name: 'UI & Interaction',
        color: 'text-red-300',
        bgColor: 'bg-red-900/30',
        commands: [
            { type: CommandType.ShowButton, label: 'Show Button', description: 'Display interactive button' },
            { type: CommandType.HideButton, label: 'Hide Button', description: 'Remove button' },
            { type: CommandType.ShowScreen, label: 'Show UI Screen', description: 'Display custom UI screen' },
        ]
    },
    {
        name: 'Flow Control',
        color: 'text-slate-300',
        bgColor: 'bg-slate-700/30',
        commands: [
            { type: CommandType.Wait, label: 'Wait', description: 'Pause execution' },
            { type: CommandType.Group, label: 'Group', description: 'Visual command grouping' },
        ]
    },
];

interface CommandPaletteProps {
    onCommandSelect: (commandType: CommandType) => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ onCommandSelect }) => {
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Dialogue & Text']));

    const toggleGroup = (groupName: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupName)) {
                next.delete(groupName);
            } else {
                next.add(groupName);
            }
            return next;
        });
    };

    return (
        <div className="flex flex-col h-full">
            <div className="p-2 border-b border-slate-700 bg-slate-800/50 flex-shrink-0">
                <h3 className="text-xs font-bold text-slate-200">Command Palette</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Drag commands to add</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
                {commandGroups.map(group => {
                    const isExpanded = expandedGroups.has(group.name);
                    return (
                        <div key={group.name} className="rounded-md overflow-hidden border border-slate-700">
                            <button
                                onClick={() => toggleGroup(group.name)}
                                className={`w-full flex items-center justify-between p-2 ${group.bgColor} hover:brightness-110 transition-all`}
                            >
                                <span className={`text-xs font-semibold ${group.color} flex items-center gap-1.5`}>
                                    {isExpanded ? (
                                        <ChevronDownIcon className="w-3.5 h-3.5" />
                                    ) : (
                                        <ChevronRightIcon className="w-3.5 h-3.5" />
                                    )}
                                    {group.name}
                                </span>
                                <span className="text-xs text-slate-400">{group.commands.length}</span>
                            </button>
                            
                            {isExpanded && (
                                <div className="bg-slate-900/50 p-1 space-y-0.5">
                                    {group.commands.map(cmd => (
                                        <div
                                            key={cmd.type}
                                            draggable
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData('commandType', cmd.type);
                                                e.dataTransfer.effectAllowed = 'copy';
                                            }}
                                            onClick={() => onCommandSelect(cmd.type)}
                                            className={`p-2 rounded cursor-pointer ${group.bgColor} hover:brightness-125 transition-all border border-slate-700/50 hover:border-slate-600`}
                                            title={cmd.description}
                                        >
                                            <div className={`text-xs font-medium ${group.color}`}>
                                                {cmd.label}
                                            </div>
                                            <div className="text-[10px] text-slate-500 mt-0.5">
                                                {cmd.description}
                                            </div>
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
