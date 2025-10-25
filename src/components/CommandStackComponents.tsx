import React, { useState } from 'react';
import { VNCommand } from '../features/scene/types';
import { VNProject } from '../types/project';
import { 
    canRunAsync, 
    hasUnpredictableAsyncBehavior, 
    getAsyncWarning,
    isCommandStacked 
} from '../features/scene/commandStackUtils';
import { GripVerticalIcon, XMarkIcon, SparkleIcon } from './icons';

interface CommandStackItemProps {
    command: VNCommand;
    project: VNProject;
    isSelected: boolean;
    isStacked: boolean;
    isFirstInStack?: boolean;
    isLastInStack?: boolean;
    stackSize?: number;
    onSelect: () => void;
    onUnstack?: () => void;
}

export const CommandStackItem: React.FC<CommandStackItemProps> = ({
    command,
    project,
    isSelected,
    isStacked,
    isFirstInStack,
    isLastInStack,
    stackSize = 1,
    onSelect,
    onUnstack,
}) => {
    const [showWarning, setShowWarning] = useState(false);
    
    const getCommandSummary = () => {
        switch (command.type) {
            case 'Dialogue':
                const char = command.characterId ? project.characters[command.characterId]?.name : 'Narrator';
                return `${char}: "${command.text.substring(0, 20)}..."`;
            case 'SetBackground':
                return `BG: ${project.backgrounds[command.backgroundId]?.name || 'N/A'}`;
            case 'ShowCharacter':
                const charName = project.characters[command.characterId]?.name || 'N/A';
                return `Show: ${charName}`;
            case 'HideCharacter':
                return `Hide: ${project.characters[command.characterId]?.name || 'N/A'}`;
            case 'PlayMusic':
                return `♪ ${project.audio[command.audioId]?.name || 'N/A'}`;
            case 'PlaySoundEffect':
                return `♫ ${project.audio[command.audioId]?.name || 'N/A'}`;
            case 'SetVariable':
                const varName = project.variables[command.variableId]?.name || 'Var';
                return `Set ${varName}`;
            case 'ShakeScreen':
                return `Shake`;
            case 'TintScreen':
                return `Tint`;
            case 'FlashScreen':
                return `Flash`;
            default:
                return command.type.replace(/([A-Z])/g, ' $1').trim();
        }
    };

    const isAsync = command.modifiers?.runAsync;
    const canBeAsync = canRunAsync(command.type);
    const hasWarning = hasUnpredictableAsyncBehavior(command.type);
    const warning = getAsyncWarning(command.type);

    return (
        <div className="relative group">
            <div
                onClick={onSelect}
                className={`
                    relative flex items-center gap-2 p-2 rounded-md cursor-pointer transition-all
                    ${isSelected ? 'bg-sky-500/20 ring-2 ring-sky-500' : 'bg-slate-700 hover:bg-slate-600'}
                    ${isStacked ? 'border-2 border-purple-500' : 'border border-slate-600'}
                    ${isFirstInStack && !isLastInStack ? 'rounded-r-none border-r-0' : ''}
                    ${isLastInStack && !isFirstInStack ? 'rounded-l-none border-l-0' : ''}
                    ${!isFirstInStack && !isLastInStack && isStacked ? 'rounded-none border-x-0' : ''}
                `}
            >
                {/* Drag Handle */}
                <span className="cursor-grab text-slate-400 flex-shrink-0">
                    <GripVerticalIcon className="w-4 h-4" />
                </span>

                {/* Command Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-sky-400 truncate">
                            {command.type.replace(/([A-Z])/g, ' $1').trim()}
                        </p>
                        {isAsync && canBeAsync && (
                            <span 
                                className="text-xs bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded flex items-center gap-1"
                                onMouseEnter={() => hasWarning && setShowWarning(true)}
                                onMouseLeave={() => setShowWarning(false)}
                                title={isAsync ? 'Runs in parallel' : undefined}
                            >
                                <SparkleIcon className="w-3 h-3" />
                                {hasWarning && '⚠'}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">{getCommandSummary()}</p>
                </div>

                {/* Stack Size Badge */}
                {isStacked && isFirstInStack && stackSize && stackSize > 1 && (
                    <div className="absolute -top-2 -right-2 bg-purple-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center z-10">
                        {stackSize}
                    </div>
                )}

                {/* Unstack Button */}
                {isStacked && onUnstack && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onUnstack();
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-1 hover:bg-red-500/20 rounded"
                        title="Remove from stack"
                    >
                        <XMarkIcon className="w-4 h-4 text-red-400" />
                    </button>
                )}
            </div>

            {/* Warning Tooltip */}
            {showWarning && warning && (
                <div className="absolute bottom-full left-0 mb-2 p-2 bg-amber-900 text-amber-200 text-xs rounded shadow-lg max-w-xs z-50 border border-amber-700">
                    <div className="flex items-start gap-2">
                        <span className="text-amber-400">⚠</span>
                        <p>{warning}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

interface CommandStackRowProps {
    commands: VNCommand[];
    project: VNProject;
    selectedCommandIndex: number | null;
    startIndex: number;
    allCommands?: VNCommand[]; // Full command array for proper index calculation
    onSelectCommand: (index: number) => void;
    onUnstackCommand: (commandId: string) => void;
}

export const CommandStackRow: React.FC<CommandStackRowProps> = ({
    commands,
    project,
    selectedCommandIndex,
    startIndex,
    allCommands,
    onSelectCommand,
    onUnstackCommand,
}) => {
    const isStacked = commands.length > 1;

    if (commands.length === 1) {
        const command = commands[0];
        const globalIndex = startIndex;
        
        return (
            <CommandStackItem
                command={command}
                project={project}
                isSelected={selectedCommandIndex === globalIndex}
                isStacked={false}
                onSelect={() => onSelectCommand(globalIndex)}
            />
        );
    }

    return (
        <div className="flex gap-0">
            {commands.map((command, localIndex) => {
                // Calculate the real index from the full command array if available
                const globalIndex = allCommands 
                    ? allCommands.findIndex(c => c.id === command.id)
                    : startIndex + localIndex;
                
                return (
                    <div key={command.id} className="flex-1 min-w-0">
                        <CommandStackItem
                            command={command}
                            project={project}
                            isSelected={selectedCommandIndex === globalIndex}
                            isStacked={isStacked}
                            isFirstInStack={localIndex === 0}
                            isLastInStack={localIndex === commands.length - 1}
                            stackSize={commands.length}
                            onSelect={() => onSelectCommand(globalIndex)}
                            onUnstack={() => onUnstackCommand(command.id)}
                        />
                    </div>
                );
            })}
        </div>
    );
};

interface DragDropIndicatorProps {
    position: 'before' | 'inside' | 'after';
    canDrop: boolean;
    message?: string;
}

export const DragDropIndicator: React.FC<DragDropIndicatorProps> = ({ position, canDrop, message }) => {
    if (!canDrop && !message) return null;

    const getPositionStyles = () => {
        switch (position) {
            case 'before':
                return 'top-0 -translate-y-1/2 h-1';
            case 'inside':
                return 'inset-0 border-4';
            case 'after':
                return 'bottom-0 translate-y-1/2 h-1';
        }
    };

    const getColorStyles = () => {
        if (!canDrop) return 'bg-red-500 border-red-500';
        if (position === 'inside') return 'border-purple-500 bg-purple-500/10';
        return 'bg-purple-500';
    };

    return (
        <div className={`absolute left-0 right-0 ${getPositionStyles()} ${getColorStyles()} rounded-full z-10 pointer-events-none`}>
            {message && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 bg-slate-900 text-white text-xs rounded shadow-lg whitespace-nowrap">
                    {message}
                </div>
            )}
        </div>
    );
};
