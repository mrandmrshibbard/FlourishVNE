import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useProject } from '../contexts/ProjectContext';
// FIX: VNID is not exported from scene/types. Imported from ../types instead.
import { VNID } from '../types';
import { CommandType, VNCommand, ShowCharacterCommand, FlashScreenCommand, ShowTextCommand, ShowImageCommand, ShowButtonCommand, VNScene, BranchStartCommand, BranchEndCommand } from '../features/scene/types';
import { VNProject } from '../types/project';
import { VNImage } from '../features/assets/types';
import Panel from './ui/Panel';
import { PlusIcon, GripVerticalIcon, ChevronDownIcon, Cog6ToothIcon } from './icons';
import { createCommand } from '../utils/commandFactory';
import { 
    groupCommandsIntoStacks, 
    stackCommands, 
    unstackCommand, 
    canStackCommands,
    isCommandStacked
} from '../features/scene/commandStackUtils';
import { CommandStackRow, DragDropIndicator } from './CommandStackComponents';

const CommandItem: React.FC<{ command: VNCommand; project: VNProject; isSelected: boolean; depth?: number; }> = ({ command, project, isSelected, depth = 0 }) => {
    const leftPadding = depth > 0 ? `${depth * 20 + 8}px` : '8px';
    
    const getCommandSummary = () => {
        switch (command.type) {
            case CommandType.BranchStart:
                const branchCmd = command as BranchStartCommand;
                return `Branch: ${branchCmd.name}`;
            case CommandType.BranchEnd:
                return `End Branch`;
            case CommandType.Dialogue:
                const char = command.characterId ? project.characters[command.characterId]?.name : 'Narrator';
                return `${char}: "${command.text.substring(0, 30)}..."`;
            case CommandType.SetBackground:
                return `Set BG: ${project.backgrounds[command.backgroundId]?.name || 'N/A'}`;
            case CommandType.ShowCharacter:
                const showCmd = command as ShowCharacterCommand;
                const charName = project.characters[showCmd.characterId]?.name || 'N/A';
                const exprName = project.characters[showCmd.characterId]?.expressions[showCmd.expressionId]?.name || 'N/A';
                return `Show: ${charName} (${exprName}) at ${showCmd.position}`;
            case CommandType.HideCharacter:
                return `Hide: ${project.characters[command.characterId]?.name || 'N/A'}`;
            case CommandType.Choice:
                return `Choice: ${command.options.length} options`;
            case CommandType.PlayMusic:
                 return `Play Music: ${project.audio[command.audioId]?.name || 'N/A'}`;
            case CommandType.StopMusic:
                return `Stop Music`;
            case CommandType.PlaySoundEffect:
                return `Play SFX: ${project.audio[command.audioId]?.name || 'N/A'}`;
            case CommandType.PlayMovie:
                return `Play Movie: ${project.videos[command.videoId]?.name || 'N/A'}`;
            case CommandType.SetVariable:
                 const varName = project.variables[command.variableId]?.name || 'Unknown Variable';
                 return `Set ${varName} ${command.operator} ${command.value}`;
            case CommandType.TextInput:
                const inputVarName = project.variables[command.variableId]?.name || 'Unknown Variable';
                return `Text Input: "${command.prompt}" → ${inputVarName}`;
            case CommandType.Jump:
                const sceneName = project.scenes[command.targetSceneId]?.name || 'Unknown Scene';
                const conditionText = command.conditions && command.conditions.length > 0 ? `IF [...]` : '';
                return `Jump to: ${sceneName} ${conditionText}`;
            case CommandType.Wait:
                return `Wait for ${command.duration} seconds`;
            case CommandType.ShakeScreen:
                return `Shake Screen (Intensity: ${command.intensity}, Duration: ${command.duration}s)`;
            case CommandType.TintScreen:
                return `Tint Screen: Color ${command.color}, Duration ${command.duration}s`;
            case CommandType.PanZoomScreen:
                return `Pan/Zoom: ${command.zoom}x at (${command.panX}%, ${command.panY}%) over ${command.duration}s`;
            case CommandType.ResetScreenEffects:
                return `Reset Screen Effects over ${command.duration}s`;
            case CommandType.FlashScreen:
                const flashCmd = command as FlashScreenCommand;
                return `Flash Screen: Color ${flashCmd.color}, Duration ${flashCmd.duration}s`;
            case CommandType.ShowScreen:
                 const screenName = project.uiScreens[command.screenId]?.name || 'Unknown Screen';
                 return `Show UI Screen: ${screenName}`;
            case CommandType.Label:
                return `Label: ${command.labelId}`;
            case CommandType.JumpToLabel:
                return `Jump to Label: ${command.labelId}`;
            case CommandType.ShowText:
                return `Show Text: "${command.text.substring(0, 20)}..." at (${command.x}%, ${command.y}%) (${command.transition}, ${command.duration}s)`;
            case CommandType.ShowImage:
                const image = (project.images || {})[command.imageId] as VNImage | undefined;
                const bgForImage = project.backgrounds[command.imageId];
                const bgName = image?.name || bgForImage?.name || 'Unknown Image';
                return `Show Image: ${bgName} at (${command.x}%, ${command.y}%) (${command.transition}, ${command.duration}s)`;
            case CommandType.HideText: {
                let targetCmd: ShowTextCommand | undefined;
                for (const scene of Object.values(project.scenes) as VNScene[]) {
                    const found = scene.commands.find(c => c.id === command.targetCommandId && c.type === CommandType.ShowText);
                    if (found) {
                        targetCmd = found as ShowTextCommand;
                        break;
                    }
                }
                return `Hide Text: "${targetCmd?.text.substring(0, 20) ?? '...'}" (${command.transition}, ${command.duration}s)`;
            }
            case CommandType.HideImage: {
                let targetCmd: ShowImageCommand | undefined;
                for (const scene of Object.values(project.scenes) as VNScene[]) {
                    const found = scene.commands.find(c => c.id === command.targetCommandId && c.type === CommandType.ShowImage);
                    if (found) {
                        targetCmd = found as ShowImageCommand;
                        break;
                    }
                }
                const imageName = targetCmd ? (project.images?.[targetCmd.imageId]?.name || project.backgrounds[targetCmd.imageId]?.name || 'Unknown') : 'Unknown';
                return `Hide Image: ${imageName} (${command.transition}, ${command.duration}s)`;
            }
            case CommandType.ShowButton:
                return `Show Button: "${command.text}" at (${command.x}%, ${command.y}%) → ${command.onClick.type}`;
            case CommandType.HideButton: {
                let targetCmd: ShowButtonCommand | undefined;
                for (const scene of Object.values(project.scenes) as VNScene[]) {
                    const found = scene.commands.find(c => c.id === command.targetCommandId && c.type === CommandType.ShowButton);
                    if (found) {
                        targetCmd = found as ShowButtonCommand;
                        break;
                    }
                }
                return `Hide Button: "${targetCmd?.text ?? 'Unknown'}" (${command.transition}, ${command.duration}s)`;
            }
            default: return (command as any).type;
        }
    };

    const getBorderColor = () => {
        if (command.type === CommandType.BranchStart) {
            return (command as BranchStartCommand).color || 'var(--bg-tertiary)';
        }
        if (command.type === CommandType.BranchEnd) {
            return 'var(--bg-tertiary)';
        }
        return 'var(--bg-tertiary)';
    };

    return (
        <div 
            className={`p-2 border-2 rounded-md flex items-center gap-2 ${isSelected ? 'bg-[var(--bg-tertiary)] ring-2 ring-[var(--accent-cyan)]' : 'bg-[var(--bg-secondary)]'}`}
            style={{ 
                paddingLeft: leftPadding,
                borderColor: getBorderColor()
            }}
        >
            <span className="cursor-grab text-[var(--text-secondary)]"><GripVerticalIcon/></span>
            <div className="flex-grow">
                <p className="font-bold text-[var(--accent-cyan)] capitalize">{command.type.replace(/([A-Z])/g, ' $1').trim()}</p>
                <p className="text-sm text-[var(--text-secondary)]">{getCommandSummary()}</p>
            </div>
        </div>
    );
};

const AddCommandMenu: React.FC<{ onAdd: (type: CommandType) => void }> = ({ onAdd }) => {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                buttonRef.current && 
                !buttonRef.current.contains(event.target as Node) &&
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
                setDropdownPosition(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (type: CommandType) => {
        onAdd(type);
        setIsOpen(false);
        setDropdownPosition(null);
    };

    const handleButtonClick = () => {
        if (!isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownPosition({
                top: rect.top - 8, // 8px margin above
                left: rect.left,
                width: rect.width
            });
        }
        setIsOpen(!isOpen);
    };

    const dropdownContent = isOpen && dropdownPosition && (
        <div
            ref={dropdownRef}
            className="fixed bg-[var(--bg-secondary)] rounded-md shadow-lg z-50 border border-[var(--bg-tertiary)] max-h-60 overflow-y-auto"
            style={{
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
                transform: 'translateY(-100%)' // Position above the button
            }}
        >
            {Object.values(CommandType).map((type: CommandType) => (
                <button key={type} onClick={() => handleSelect(type)} className="block w-full text-left px-4 py-2 hover:bg-[var(--accent-purple)] capitalize">
                    {type.replace(/([A-Z])/g, ' $1').trim()}
                </button>
            ))}
        </div>
    );

    return (
        <>
            <div className="relative">
                <button
                    ref={buttonRef}
                    onClick={handleButtonClick}
                    className="btn-primary-gradient w-full text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2"
                >
                    <PlusIcon /> Add Command
                </button>
            </div>
            {ReactDOM.createPortal(dropdownContent, document.body)}
        </>
    );
};


const SceneEditor: React.FC<{
    activeSceneId: VNID;
    selectedCommandIndex: number | null;
    setSelectedCommandIndex: (index: number | null) => void;
    setSelectedVariableId: (id: VNID | null) => void;
    onConfigureScene?: () => void;
    className?: string;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}> = ({ activeSceneId, selectedCommandIndex, setSelectedCommandIndex, setSelectedVariableId, onConfigureScene, className, isCollapsed, onToggleCollapse }) => {
    const { project, dispatch } = useProject();
    const activeScene = project.scenes[activeSceneId];
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(new Set());
    const [draggedCommandId, setDraggedCommandId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ commandId: string; position: 'before' | 'inside' | 'after' } | null>(null);
    const [selectedCommands, setSelectedCommands] = useState<Set<string>>(new Set());

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, commandId: string, index: number) => {
        dragItem.current = index;
        setDraggedCommandId(commandId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', commandId);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetCommandId: string, position: 'before' | 'inside' | 'after') => {
        e.preventDefault();
        if (isCollapsed || !draggedCommandId) return;
        
        setDropTarget({ commandId: targetCommandId, position });
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDropTarget(null);
    };
    
    const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetCommandId: string, position: 'before' | 'inside' | 'after') => {
        e.preventDefault();
        if (!draggedCommandId || dragItem.current === null) return;

        // Find dragged command by ID (not by index, since grouping changes indices)
        const draggedCommand = activeScene.commands.find(cmd => cmd.id === draggedCommandId);
        const targetCommand = activeScene.commands.find(cmd => cmd.id === targetCommandId);
        const draggedIndex = activeScene.commands.findIndex(cmd => cmd.id === draggedCommandId);
        const targetIndex = activeScene.commands.findIndex(cmd => cmd.id === targetCommandId);
        
        if (!draggedCommand || !targetCommand || targetIndex === -1 || draggedIndex === -1) return;

        if (position === 'inside') {
            // Stack commands together
            // Filter out any undefined/null values that might have snuck in
            const commandsToStack = [targetCommand, draggedCommand].filter(cmd => cmd != null);
            
            const validation = canStackCommands(commandsToStack);
            
            if (!validation.canStack) {
                alert(validation.reason || 'Cannot stack these commands');
                return;
            }

            // Create stacked commands
            const existingStackId = targetCommand.modifiers?.stackId;
            const stackedCommands = stackCommands(commandsToStack, existingStackId);
            
            // Update both commands with full command objects
            dispatch({ 
                type: 'UPDATE_COMMAND', 
                payload: { 
                    sceneId: activeSceneId, 
                    commandIndex: targetIndex, 
                    command: stackedCommands[0]
                } 
            });
            dispatch({ 
                type: 'UPDATE_COMMAND', 
                payload: { 
                    sceneId: activeSceneId, 
                    commandIndex: draggedIndex, 
                    command: stackedCommands[1]
                } 
            });
        } else {
            // Move command
            const newIndex = position === 'before' ? targetIndex : targetIndex + 1;
            dispatch({ 
                type: 'MOVE_COMMAND', 
                payload: { 
                    sceneId: activeSceneId, 
                    fromIndex: draggedIndex, 
                    toIndex: newIndex 
                } 
            });
        }

        // Reset drag state
        dragItem.current = null;
        setDraggedCommandId(null);
        setDropTarget(null);
    };
    
    const handleDragEnd = () => {
        dragItem.current = null;
        setDraggedCommandId(null);
        setDropTarget(null);
    };

    const handleUnstackCommand = (commandId: string) => {
        const command = activeScene.commands.find(cmd => cmd.id === commandId);
        if (!command) return;

        const unstakedCommand = unstackCommand(command);
        dispatch({ 
            type: 'UPDATE_COMMAND', 
            payload: { 
                sceneId: activeSceneId, 
                commandId, 
                updates: { modifiers: unstakedCommand.modifiers } 
            } 
        });
    };
    
    const handleAddCommand = (type: CommandType) => {
        if (type === CommandType.BranchStart) {
            // When adding BranchStart, automatically add BranchEnd
            const branchId = `branch-${Math.random().toString(36).substring(2, 9)}`;
            const branchStart = createCommand(type, project, { branchId });
            const branchEnd = createCommand(CommandType.BranchEnd, project, { branchId });
            
            if (branchStart && branchEnd) {
                dispatch({ type: 'ADD_COMMAND', payload: { sceneId: activeSceneId, command: { ...branchStart, id: `cmd-${Math.random().toString(36).substring(2, 9)}` } as VNCommand } });
                dispatch({ type: 'ADD_COMMAND', payload: { sceneId: activeSceneId, command: { ...branchEnd, id: `cmd-${Math.random().toString(36).substring(2, 9)}` } as VNCommand } });
                setSelectedCommandIndex(activeScene.commands.length);
            }
        } else {
            const newCommand = createCommand(type, project);
            if (newCommand) {
                dispatch({ type: 'ADD_COMMAND', payload: { sceneId: activeSceneId, command: newCommand as VNCommand } });
                setSelectedCommandIndex(activeScene.commands.length);
            }
        }
    };

    const toggleBranchCollapse = (branchId: string) => {
        setCollapsedBranches(prev => {
            const newSet = new Set(prev);
            if (newSet.has(branchId)) {
                newSet.delete(branchId);
            } else {
                newSet.add(branchId);
            }
            return newSet;
        });
    };

    const getVisibleCommands = () => {
        const visible: Array<{ command: VNCommand; index: number; depth: number }> = [];
        let depth = 0;
        const branchStack: Array<{ branchId: string; isCollapsed: boolean }> = [];

        for (let i = 0; i < activeScene.commands.length; i++) {
            const cmd = activeScene.commands[i];
            
            if (cmd.type === CommandType.BranchStart) {
                const branchCmd = cmd as BranchStartCommand;
                const isCollapsed = collapsedBranches.has(branchCmd.branchId);
                visible.push({ command: cmd, index: i, depth });
                branchStack.push({ branchId: branchCmd.branchId, isCollapsed });
                if (!isCollapsed) {
                    depth++;
                }
            } else if (cmd.type === CommandType.BranchEnd) {
                const branchCmd = cmd as BranchEndCommand;
                const branch = branchStack.find(b => b.branchId === branchCmd.branchId);
                
                if (branch) {
                    if (!branch.isCollapsed) {
                        depth = Math.max(0, depth - 1);
                    }
                    if (!branch.isCollapsed || branchStack[branchStack.length - 1]?.branchId === branchCmd.branchId) {
                        visible.push({ command: cmd, index: i, depth });
                    }
                    branchStack.pop();
                } else {
                    visible.push({ command: cmd, index: i, depth });
                }
            } else {
                // Check if inside a collapsed branch
                const isInCollapsedBranch = branchStack.some(b => b.isCollapsed);
                if (!isInCollapsedBranch) {
                    visible.push({ command: cmd, index: i, depth });
                }
            }
        }

        return visible;
    };

    if (!activeScene) return (
        <Panel 
            title="Scene Editor" 
            className={className}
            isCollapsed={isCollapsed} 
            onToggleCollapse={onToggleCollapse}
        >
            <p>Select a scene to start.</p>
        </Panel>
    );

    const visibleCommands = getVisibleCommands();

    const hasConditions = activeScene.conditions && activeScene.conditions.length > 0;

    return (
        <Panel 
            title={`Scene: ${activeScene.name}`} 
            className={`flex-grow min-h-0 ${className || ''}`} 
            isCollapsed={isCollapsed} 
            onToggleCollapse={onToggleCollapse}
            rightHeaderContent={
                <button
                    onClick={onConfigureScene}
                    className={`p-1 rounded ${hasConditions ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-secondary)]'} hover:text-[var(--text-primary)]`}
                    title="Configure Scene Conditions"
                >
                    <Cog6ToothIcon className="w-5 h-5" />
                </button>
            }
        >
            <div className="flex flex-col h-full">
                {hasConditions && (
                    <div className="mb-2 p-2 bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/30 rounded-md text-sm">
                        <div className="flex items-center gap-1">
                            <Cog6ToothIcon className="w-4 h-4 text-[var(--accent-cyan)]" />
                            <span className="text-[var(--text-secondary)]">
                                This scene has {activeScene.conditions.length} condition{activeScene.conditions.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>
                )}
                <div className="flex-grow space-y-2 overflow-y-auto pr-2">
                    {(() => {
                        // Group commands into stacks for rendering
                        const commandStacks = groupCommandsIntoStacks(activeScene.commands);
                        let globalIndex = 0;

                        return commandStacks.map((stack) => {
                            const stackStartIndex = globalIndex;
                            const stackCommands = stack.commands;
                            globalIndex += stackCommands.length;

                            if (stack.isStacked) {
                                // Render stacked commands horizontally
                                return (
                                    <div 
                                        key={stack.stackId || stackCommands[0].id} 
                                        className="relative"
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, stackCommands[0].id, stackStartIndex)}
                                        onDragOver={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const y = e.clientY - rect.top;
                                            if (y < rect.height * 0.33) {
                                                handleDragOver(e, stackCommands[0].id, 'before');
                                            } else if (y > rect.height * 0.67) {
                                                handleDragOver(e, stackCommands[0].id, 'after');
                                            } else {
                                                handleDragOver(e, stackCommands[0].id, 'inside');
                                            }
                                        }}
                                        onDragLeave={handleDragLeave}
                                        onDrop={(e) => {
                                            if (dropTarget?.commandId === stackCommands[0].id) {
                                                handleDrop(e, dropTarget.commandId, dropTarget.position);
                                            }
                                        }}
                                        onDragEnd={handleDragEnd}
                                    >
                                        {dropTarget?.commandId === stackCommands[0].id && (
                                            <DragDropIndicator 
                                                position={dropTarget.position} 
                                                canDrop={true}
                                                message={
                                                    dropTarget.position === 'inside' 
                                                        ? '⊕ Add to Stack' 
                                                        : dropTarget.position === 'before' 
                                                            ? '⬆ Place Above' 
                                                            : '⬇ Place Below'
                                                }
                                            />
                                        )}
                                        <CommandStackRow
                                            commands={stackCommands}
                                            project={project}
                                            selectedCommandIndex={selectedCommandIndex}
                                            startIndex={stackStartIndex}
                                            onSelectCommand={(idx) => {
                                                setSelectedCommandIndex(idx);
                                                setSelectedVariableId(null);
                                            }}
                                            onUnstackCommand={handleUnstackCommand}
                                        />
                                    </div>
                                );
                            } else {
                                // Render single command (use legacy CommandItem for now)
                                const cmd = stackCommands[0];
                                const index = stackStartIndex;
                                const isBranchStart = cmd.type === CommandType.BranchStart;
                                const branchCmd = isBranchStart ? cmd as BranchStartCommand : null;
                                const isBranchCollapsed = branchCmd ? collapsedBranches.has(branchCmd.branchId) : false;

                                return (
                                    <div key={cmd.id} className="relative">
                                        {isBranchStart && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (branchCmd) toggleBranchCollapse(branchCmd.branchId);
                                                }}
                                                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-transform"
                                                style={{ transform: `translateY(-50%) ${isBranchCollapsed ? 'rotate(-90deg)' : ''}` }}
                                            >
                                                <ChevronDownIcon className="w-4 h-4" />
                                            </button>
                                        )}
                                        <div
                                            onClick={() => {
                                                setSelectedCommandIndex(index);
                                                setSelectedVariableId(null);
                                            }}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, cmd.id, index)}
                                            onDragOver={(e) => {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const y = e.clientY - rect.top;
                                                if (y < rect.height * 0.33) {
                                                    handleDragOver(e, cmd.id, 'before');
                                                } else if (y > rect.height * 0.67) {
                                                    handleDragOver(e, cmd.id, 'after');
                                                } else {
                                                    handleDragOver(e, cmd.id, 'inside');
                                                }
                                            }}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => {
                                                if (dropTarget?.commandId === cmd.id) {
                                                    handleDrop(e, dropTarget.commandId, dropTarget.position);
                                                }
                                            }}
                                            onDragEnd={handleDragEnd}
                                            className="cursor-pointer"
                                        >
                                            {dropTarget?.commandId === cmd.id && (
                                                <DragDropIndicator 
                                                    position={dropTarget.position} 
                                                    canDrop={dropTarget.position !== 'inside' || canStackCommands([cmd]).canStack}
                                                    message={
                                                        dropTarget.position === 'inside' 
                                                            ? canStackCommands([cmd]).canStack 
                                                                ? '⊕ Stack Here' 
                                                                : `❌ ${canStackCommands([cmd]).reason}`
                                                            : dropTarget.position === 'before' 
                                                                ? '⬆ Place Above' 
                                                                : '⬇ Place Below'
                                                    }
                                                />
                                            )}
                                            <CommandItem command={cmd} project={project} isSelected={index === selectedCommandIndex} depth={0} />
                                        </div>
                                    </div>
                                );
                            }
                        });
                    })()}
                </div>
                <div className="pt-4 mt-auto">
                    <AddCommandMenu onAdd={handleAddCommand}/>
                </div>
            </div>
        </Panel>
    );
};

export default SceneEditor;