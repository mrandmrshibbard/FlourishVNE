import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useProject } from '../contexts/ProjectContext';
import { useToast } from '../contexts/ToastContext';
// FIX: VNID is not exported from scene/types. Imported from ../types instead.
import { VNID } from '../types';
import { CommandType, VNCommand, ShowCharacterCommand, FlashScreenCommand, ShowTextCommand, ShowImageCommand, ShowButtonCommand, VNScene, BranchStartCommand, BranchEndCommand, GroupCommand } from '../features/scene/types';
import { VNProject } from '../types/project';
import { VNImage } from '../features/assets/types';
import Panel from './ui/Panel';
import { PlusIcon, GripVerticalIcon, ChevronDownIcon, Cog6ToothIcon, FolderIcon } from './icons';
import { createCommand } from '../utils/commandFactory';
import { getCommandColor } from './CommandPalette';
import { 
    groupCommandsIntoStacks, 
    stackCommands, 
    unstackCommand, 
    canStackCommands,
    isCommandStacked
} from '../features/scene/commandStackUtils';
import { CommandStackRow, DragDropIndicator } from './CommandStackComponents';

const generateCommandId = () => `cmd-${Math.random().toString(36).substring(2, 9)}`;
const generateBranchId = () => `branch-${Math.random().toString(36).substring(2, 9)}`;

const cloneCommand = <T extends VNCommand>(command: T): T => {
    const globalStructuredClone = (globalThis as unknown as { structuredClone?: <K>(value: K) => K }).structuredClone;
    if (typeof globalStructuredClone === 'function') {
        return globalStructuredClone(command);
    }
    return JSON.parse(JSON.stringify(command)) as T;
};

const CommandItem: React.FC<{ 
    command: VNCommand, 
    project: VNProject, 
    isSelected: boolean,
    isInMultiSelection?: boolean,
    depth: number, 
    onToggleCollapse?: () => void,
    onRename?: (newName: string) => void,
    collapsedBranches?: Set<string>
}> = ({ command, project, isSelected, isInMultiSelection, depth, onToggleCollapse, onRename, collapsedBranches }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const leftPadding = depth > 0 ? `${depth * 20 + 8}px` : '8px';
    
    const getCommandSummary = () => {
        switch (command.type) {
            case CommandType.Group:
                const groupCmd = command as import('../features/scene/types').GroupCommand;
                const count = groupCmd.commandIds?.length || 0;
                return `${groupCmd.name} (${count} command${count !== 1 ? 's' : ''})`;
            case CommandType.BranchStart:
                const branchCmd = command as BranchStartCommand;
                return `Branch: ${branchCmd.name}`;
            case CommandType.BranchEnd:
                return `End Branch`;
            case CommandType.Dialogue:
                const char = command.characterId ? project.characters[command.characterId]?.name : 'Narrator';
                return `${char}: "${command.text.substring(0, 30)}..."`;
            case CommandType.SetBackground:
                return `Set BG: ${project.backgrounds[command.backgroundId]?.name || project.images?.[command.backgroundId]?.name || 'N/A'}`;
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
            case CommandType.SetScreenOverlayEffect:
                return `Screen Overlay: ${command.effectType} (${Math.round((command.intensity ?? 0) * 100)}%)`;
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

    // Special styling for Groups and Branches
    const isGroup = command.type === CommandType.Group;
    const isBranch = command.type === CommandType.BranchStart;
    const groupCmd = isGroup ? command as GroupCommand : null;
    const branchCmd = isBranch ? command as BranchStartCommand : null;
    
    const groupClasses = isGroup 
        ? 'bg-amber-500/10 border-dashed border-amber-500' 
        : '';
    
    const branchClasses = isBranch
        ? 'border-2 border-solid'
        : '';
    
    const branchColor = isBranch ? (branchCmd?.color || '#6366f1') : '';
    const branchBgColor = isBranch ? `${branchColor}1a` : ''; // 10% opacity
    
    const handleStartEdit = ()=> {
        if (isGroup && groupCmd && onRename) {
            setEditName(groupCmd.name);
            setIsEditing(true);
        }
    };
    
    const handleFinishEdit = () => {
        if (editName.trim() && onRename) {
            onRename(editName.trim());
        }
        setIsEditing(false);
    };
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleFinishEdit();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
        }
    };
    
    // Get command color from palette
    const commandColor = !isGroup && !isBranch ? getCommandColor(command.type) : '';
    
    // Multi-selection styling
    const multiSelectClass = isInMultiSelection ? 'ring-1 ring-sky-400 bg-sky-500/10' : '';
    
    return (
        <div 
            data-command-id={command.id}
            className={`py-1 px-2 rounded flex items-center gap-1.5 border ${groupClasses} ${branchClasses} ${isSelected ? 'ring-2 ring-sky-500' : multiSelectClass} ${isGroup || isBranch ? '' : commandColor || 'bg-[var(--bg-secondary)] border-[var(--bg-tertiary)] hover:bg-slate-700'}`}
            style={{ 
                paddingLeft: leftPadding,
                borderColor: isGroup ? 'rgb(245, 158, 11)' : isBranch ? branchColor : undefined,
                backgroundColor: isBranch && !isSelected ? branchBgColor : undefined
            }}
        >
            {(isGroup || isBranch) && onToggleCollapse && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleCollapse();
                    }}
                    className={`${isGroup ? 'text-amber-500 hover:text-amber-400' : 'hover:opacity-70'} transition-transform flex-shrink-0`}
                    style={{ 
                        transform: (isGroup && groupCmd?.collapsed) || (isBranch && branchCmd && collapsedBranches?.has(branchCmd.branchId)) ? 'rotate(-90deg)' : '',
                        color: isBranch ? branchColor : undefined
                    }}
                >
                    <ChevronDownIcon className="w-3 h-3" />
                </button>
            )}
            <span className="cursor-grab text-slate-400 flex-shrink-0"><GripVerticalIcon className="w-3 h-3" /></span>
            {isGroup && <FolderIcon className="text-amber-500 w-4 h-4 flex-shrink-0" />}
            <div className="flex-1 flex items-center gap-2 min-w-0">
                {isEditing && isGroup ? (
                    <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleFinishEdit}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        className="bg-slate-900 text-amber-500 font-bold px-2 py-1 rounded border border-amber-500 w-full text-xs"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <>
                        <p 
                            className={`font-bold text-xs flex-shrink-0 ${isGroup ? 'text-amber-500' : isBranch ? '' : 'text-[var(--accent-cyan)]'}`}
                            onDoubleClick={isGroup && onRename ? handleStartEdit : undefined}
                            style={{ 
                                cursor: isGroup && onRename ? 'text' : 'default',
                                color: isBranch ? branchColor : undefined
                            }}
                        >
                            {command.type === CommandType.BranchStart ? 'Branch' : command.type.replace(/([A-Z])/g, ' $1').trim()}
                        </p>
                        <p className="text-xs text-slate-400 truncate flex-1">{getCommandSummary()}</p>
                    </>
                )}
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
            className="fixed bg-[var(--bg-secondary)] rounded shadow-lg z-50 border border-[var(--bg-tertiary)] max-h-48 overflow-y-auto"
            style={{
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
                transform: 'translateY(-100%)' // Position above the button
            }}
        >
            {Object.values(CommandType).filter(type => type !== CommandType.Group && type !== CommandType.BranchEnd).map((type: CommandType) => {
                // Rename "Branch Start" to just "Branch" in the menu
                const displayName = type === CommandType.BranchStart 
                    ? 'Branch' 
                    : type.replace(/([A-Z])/g, ' $1').trim();
                
                return (
                    <button key={type} onClick={() => handleSelect(type)} className="block w-full text-left px-2 py-1 hover:bg-[var(--accent-purple)] capitalize text-[10px]">
                        {displayName}
                    </button>
                );
            })}
        </div>
    );

    return (
        <>
            <div className="relative">
                <button
                    ref={buttonRef}
                    onClick={handleButtonClick}
                    className="btn-primary-gradient w-full text-white font-bold py-1 px-2 rounded text-[10px] flex items-center justify-center gap-1"
                >
                    <PlusIcon className="w-3 h-3" /> Add
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
    const toast = useToast();
    const activeScene = project.scenes[activeSceneId];
    const dragItem = useRef<{ id: string; index: number; groupId?: string } | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(new Set());
    const [draggedCommandId, setDraggedCommandId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ commandId: string; position: 'before' | 'inside' | 'after' } | null>(null);
    const [selectedCommands, setSelectedCommands] = useState<Set<string>>(new Set());
    const [warningModal, setWarningModal] = useState<{ message: string } | null>(null);
    const [clipboard, setClipboard] = useState<VNCommand[]>([]);
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

    const createCommandWithId = useCallback((type: CommandType, options: { branchId?: string } = {}) => {
        const commandData = createCommand(type, project, options);
        if (!commandData) {
            return null;
        }
        return { ...commandData, id: generateCommandId() } as VNCommand;
    }, [project]);

    const insertCommandsIntoScene = useCallback((commandsToInsert: VNCommand[], insertIndex: number) => {
        const latestScene = project.scenes[activeSceneId];
        if (!latestScene) {
            return;
        }

        const clampedIndex = Math.max(0, Math.min(insertIndex, latestScene.commands.length));
        const newCommands = [
            ...latestScene.commands.slice(0, clampedIndex),
            ...commandsToInsert,
            ...latestScene.commands.slice(clampedIndex)
        ];

        dispatch({
            type: 'UPDATE_SCENE_COMMANDS',
            payload: {
                sceneId: activeSceneId,
                commands: newCommands
            }
        });

        if (commandsToInsert.length > 0) {
            setSelectedCommands(new Set(commandsToInsert.map(cmd => cmd.id)));
        } else {
            setSelectedCommands(new Set());
        }

        setSelectedCommandIndex(clampedIndex);
        setLastSelectedIndex(clampedIndex);
        setSelectedVariableId(null);
    }, [project, activeSceneId, dispatch, setSelectedCommandIndex, setSelectedVariableId, setSelectedCommands, setLastSelectedIndex]);

    const handleAddCommandToBranch = useCallback((branchId: string, type: CommandType) => {
        if (!activeScene) {
            return;
        }

        const branchStartIndex = activeScene.commands.findIndex(cmd => 
            cmd.type === CommandType.BranchStart &&
            (cmd as BranchStartCommand).branchId === branchId
        );
        if (branchStartIndex === -1) {
            return;
        }

        const branchEndIndex = activeScene.commands.findIndex((cmd, index) =>
            index > branchStartIndex &&
            cmd.type === CommandType.BranchEnd &&
            (cmd as BranchEndCommand).branchId === branchId
        );
        if (branchEndIndex === -1) {
            return;
        }

        if (type === CommandType.BranchStart) {
            const nestedBranchId = generateBranchId();
            const branchStart = createCommandWithId(CommandType.BranchStart, { branchId: nestedBranchId });
            const branchEnd = createCommandWithId(CommandType.BranchEnd, { branchId: nestedBranchId });

            if (branchStart && branchEnd) {
                insertCommandsIntoScene([branchStart, branchEnd], branchEndIndex);
            }
            return;
        }

        const newCommand = createCommandWithId(type);
        if (!newCommand) {
            return;
        }

        insertCommandsIntoScene([newCommand], branchEndIndex);
    }, [activeScene, createCommandWithId, insertCommandsIntoScene]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check if we're in an input/textarea
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
                return;
            }

            // Copy (Ctrl+C)
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedCommands.size > 0 && activeScene) {
                e.preventDefault();
                const selectedIds = new Set(selectedCommands);
                const addedIds = new Set<VNID>();
                const commandsToCopy: VNCommand[] = [];

                for (let i = 0; i < activeScene.commands.length; i++) {
                    const cmd = activeScene.commands[i];
                    if (!selectedIds.has(cmd.id) || addedIds.has(cmd.id)) {
                        continue;
                    }

                    if (cmd.type === CommandType.BranchStart) {
                        const branchCmd = cmd as BranchStartCommand;
                        const branchEndIndex = activeScene.commands.findIndex((candidate, index) =>
                            index > i &&
                            candidate.type === CommandType.BranchEnd &&
                            (candidate as BranchEndCommand).branchId === branchCmd.branchId
                        );

                        commandsToCopy.push(cmd);
                        addedIds.add(cmd.id);

                        if (branchEndIndex !== -1) {
                            for (let j = i + 1; j <= branchEndIndex; j++) {
                                const nestedCmd = activeScene.commands[j];
                                if (!addedIds.has(nestedCmd.id)) {
                                    commandsToCopy.push(nestedCmd);
                                    addedIds.add(nestedCmd.id);
                                }
                            }
                            i = branchEndIndex;
                        }
                    } else {
                        commandsToCopy.push(cmd);
                        addedIds.add(cmd.id);
                    }
                }

                if (commandsToCopy.length > 0) {
                    setClipboard(commandsToCopy.map(cloneCommand));
                    toast.success(`Copied ${commandsToCopy.length} command${commandsToCopy.length > 1 ? 's' : ''}`);
                }
            }

            // Paste (Ctrl+V)
            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard.length > 0 && activeScene) {
                e.preventDefault();
                const currentCommands = activeScene.commands;
                const insertIndex = selectedCommandIndex !== null ? selectedCommandIndex + 1 : currentCommands.length;
                const branchIdRemap = new Map<string, string>();
                const insertedCommands = clipboard.map((cmd) => {
                    const cloned = cloneCommand(cmd);
                    cloned.id = generateCommandId();

                    if (cloned.type === CommandType.BranchStart) {
                        const originalBranchId = (cmd as BranchStartCommand).branchId;
                        const newBranchId = generateBranchId();
                        (cloned as BranchStartCommand).branchId = newBranchId;
                        branchIdRemap.set(originalBranchId, newBranchId);
                    } else if (cloned.type === CommandType.BranchEnd) {
                        const originalBranchId = (cmd as BranchEndCommand).branchId;
                        const mappedBranchId = branchIdRemap.get(originalBranchId) || originalBranchId;
                        (cloned as BranchEndCommand).branchId = mappedBranchId;
                    }

                    return cloned;
                });

                if (insertedCommands.length === 0) {
                    return;
                }

                const updatedCommands = [
                    ...currentCommands.slice(0, insertIndex),
                    ...insertedCommands,
                    ...currentCommands.slice(insertIndex)
                ];

                dispatch({
                    type: 'UPDATE_SCENE_COMMANDS',
                    payload: {
                        sceneId: activeSceneId,
                        commands: updatedCommands
                    }
                });

                const lastInsertedIndex = insertIndex + insertedCommands.length - 1;
                setSelectedCommandIndex(lastInsertedIndex);
                setSelectedCommands(new Set(insertedCommands.map(cmd => cmd.id)));
                setLastSelectedIndex(lastInsertedIndex);
                setSelectedVariableId(null);
                toast.success(`Pasted ${insertedCommands.length} command${insertedCommands.length > 1 ? 's' : ''}`);
            }

            // Delete selected commands (Delete key)
            if (e.key === 'Delete' && selectedCommands.size > 0) {
                e.preventDefault();
                const deleteCount = selectedCommands.size;
                selectedCommands.forEach(cmdId => {
                    const index = activeScene.commands.findIndex(c => c.id === cmdId);
                    if (index !== -1) {
                        dispatch({
                            type: 'DELETE_COMMAND',
                            payload: { sceneId: activeSceneId, commandIndex: index }
                        });
                    }
                });
                setSelectedCommands(new Set());
                setSelectedCommandIndex(null);
                toast.info(`Deleted ${deleteCount} command${deleteCount > 1 ? 's' : ''}`);
            }

            // Select All (Ctrl+A)
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                const allIds = new Set(activeScene.commands.map(cmd => cmd.id));
                setSelectedCommands(allIds);
            }

            // Deselect All (Escape)
            if (e.key === 'Escape') {
                setSelectedCommands(new Set());
                setSelectedCommandIndex(null);
                setLastSelectedIndex(null);
                setSelectedVariableId(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        activeScene,
        selectedCommands,
        selectedCommandIndex,
        clipboard,
        dispatch,
        activeSceneId,
        setSelectedCommandIndex,
        setSelectedCommands,
        setLastSelectedIndex,
        setSelectedVariableId,
        toast
    ]);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, commandId: string, index: number) => {
        const command = activeScene.commands.find(c => c.id === commandId);
        console.log('[handleDragStart] Started dragging:', { commandId, index, commandType: command?.type });
        dragItem.current = { id: commandId, index };
        setDraggedCommandId(commandId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', commandId);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetCommandId: string, position: 'before' | 'inside' | 'after') => {
        e.preventDefault();
        e.stopPropagation();
        
        // Check if dragging from palette
        const paletteCommandType = e.dataTransfer.types.includes('application/vn-command-type');
        
        if (isCollapsed || (!draggedCommandId && !paletteCommandType)) return;
        
        // Set drop effect
        e.dataTransfer.dropEffect = paletteCommandType ? 'copy' : 'move';
        
        setDropTarget({ commandId: targetCommandId, position });
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDropTarget(null);
    };
    
    const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetCommandId: string, position: 'before' | 'inside' | 'after') => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[handleDrop] Drop triggered:', { targetCommandId, position, draggedCommandId });
        
        // Check if dropping a command from palette
        const paletteCommandType = e.dataTransfer.getData('application/vn-command-type');
        if (paletteCommandType) {
            const targetIndex = activeScene.commands.findIndex(cmd => cmd.id === targetCommandId);
            const targetCommand = activeScene.commands[targetIndex];

            if (targetIndex === -1) {
                setDropTarget(null);
                return;
            }

            const branchMeta = targetCommand?.type === CommandType.BranchStart
                ? (() => {
                    const branchCmd = targetCommand as BranchStartCommand;
                    const branchEndIndex = activeScene.commands.findIndex((cmd, idx) =>
                        idx > targetIndex &&
                        cmd.type === CommandType.BranchEnd &&
                        (cmd as BranchEndCommand).branchId === branchCmd.branchId
                    );
                    return {
                        branchEndIndex,
                        isEmpty: branchEndIndex === targetIndex + 1
                    };
                })()
                : null;

            const resolveInsertIndex = () => {
                if (position === 'before') {
                    return targetIndex;
                }

                if (branchMeta) {
                    const { branchEndIndex, isEmpty } = branchMeta;
                    const safeBranchEndIndex = branchEndIndex !== -1 ? branchEndIndex : targetIndex + 1;

                    if (position === 'inside' || (position === 'after' && isEmpty)) {
                        return safeBranchEndIndex;
                    }

                    if (position === 'after') {
                        return safeBranchEndIndex + 1;
                    }
                }

                if (position === 'inside' && targetCommand?.type === CommandType.BranchEnd) {
                    return targetIndex;
                }

                return targetIndex + 1;
            };

            const insertIndex = resolveInsertIndex();

            // Special handling for BranchStart - create both BranchStart and BranchEnd
            if (paletteCommandType === CommandType.BranchStart) {
                const branchId = generateBranchId();
                const branchStart = createCommandWithId(CommandType.BranchStart, { branchId });
                const branchEnd = createCommandWithId(CommandType.BranchEnd, { branchId });

                if (branchStart && branchEnd) {
                    insertCommandsIntoScene([branchStart, branchEnd], insertIndex);
                }

                setDropTarget(null);
                return;
            }

            // Create new command from palette (non-branch commands)
            const newCommand = createCommandWithId(paletteCommandType as CommandType);
            if (newCommand) {
                insertCommandsIntoScene([newCommand], insertIndex);
            }

            setDropTarget(null);
            return;
        }
        
        if (!draggedCommandId || dragItem.current === null) return;

        // Find dragged command by ID (not by index, since grouping changes indices)
        const draggedCommand = activeScene.commands.find(cmd => cmd.id === draggedCommandId);
        const targetCommand = activeScene.commands.find(cmd => cmd.id === targetCommandId);
        const draggedIndex = activeScene.commands.findIndex(cmd => cmd.id === draggedCommandId);
        const targetIndex = activeScene.commands.findIndex(cmd => cmd.id === targetCommandId);
        
        if (!draggedCommand || !targetCommand || targetIndex === -1 || draggedIndex === -1) return;

        // Check if command is being dragged from a group
        const sourceGroupId = (dragItem.current as any).groupId;
        if (sourceGroupId) {
            // Remove from source group first
            dispatch({
                type: 'REMOVE_COMMAND_FROM_GROUP',
                payload: {
                    sceneId: activeSceneId,
                    groupId: sourceGroupId,
                    commandId: draggedCommandId
                }
            });
        }

        if (position === 'inside') {
            // Check if target is a Group - add command to group instead of stacking
            if (targetCommand.type === CommandType.Group) {
                dispatch({
                    type: 'ADD_COMMAND_TO_GROUP',
                    payload: {
                        sceneId: activeSceneId,
                        groupId: targetCommandId,
                        commandId: draggedCommandId
                    }
                });
            } else if (targetCommand.type === CommandType.BranchStart) {
                // Add command to branch - insert before the BranchEnd
                console.log('[handleDrop] Dropping on BranchStart command');
                const branchCmd = targetCommand as BranchStartCommand;
                
                // Log all commands to debug
                console.log('[handleDrop] All commands:', activeScene.commands.map((c, i) => ({
                    index: i,
                    id: c.id,
                    type: c.type,
                    branchId: c.type === CommandType.BranchEnd ? (c as BranchEndCommand).branchId : 
                              c.type === CommandType.BranchStart ? (c as BranchStartCommand).branchId : null
                })));
                
                console.log('[handleDrop] Looking for BranchEnd with branchId:', branchCmd.branchId);
                
                const branchEndIndex = activeScene.commands.findIndex((c, i) => 
                    i > targetIndex && 
                    c.type === CommandType.BranchEnd && 
                    (c as BranchEndCommand).branchId === branchCmd.branchId
                );
                
                console.log('[handleDrop] Branch info:', { branchId: branchCmd.branchId, branchEndIndex, draggedIndex, targetIndex });
                
                if (branchEndIndex !== -1) {
                    // Calculate the correct insertion index
                    // If dragging from before the BranchEnd, after removal indices shift down
                    const insertIndex = draggedIndex < branchEndIndex ? branchEndIndex - 1 : branchEndIndex;
                    
                    dispatch({ 
                        type: 'MOVE_COMMAND', 
                        payload: { 
                            sceneId: activeSceneId, 
                            fromIndex: draggedIndex, 
                            toIndex: insertIndex 
                        } 
                    });
                }
                
                // Reset drag state and return
                dragItem.current = null;
                setDraggedCommandId(null);
                setDropTarget(null);
                return;
            } else {
                // Stack commands together
                // Filter out any undefined/null values that might have snuck in
                const commandsToStack = [targetCommand, draggedCommand].filter(cmd => cmd != null);
                
                const validation = canStackCommands(commandsToStack);
                
                if (!validation.canStack) {
                    setWarningModal({ message: validation.reason || 'Cannot stack these commands' });
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
            }
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
            const branchId = generateBranchId();
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

        // Build set of command IDs that are inside groups
        const commandsInGroups = new Set<VNID>();
        for (const cmd of activeScene.commands) {
            if (cmd.type === CommandType.Group) {
                const groupCmd = cmd as GroupCommand;
                groupCmd.commandIds.forEach(id => commandsInGroups.add(id));
            }
        }

        // Build set of command IDs that are inside branches (to hide BranchEnd and contents)
        const commandsInBranches = new Set<VNID>();
        for (let i = 0; i < activeScene.commands.length; i++) {
            const cmd = activeScene.commands[i];
            if (cmd.type === CommandType.BranchStart) {
                const branchCmd = cmd as BranchStartCommand;
                // Find matching BranchEnd and hide everything between (including BranchEnd) only when collapsed
                for (let j = i + 1; j < activeScene.commands.length; j++) {
                    const endCmd = activeScene.commands[j];
                    if (endCmd.type === CommandType.BranchEnd && (endCmd as BranchEndCommand).branchId === branchCmd.branchId) {
                        // Hide BranchEnd marker and all inner commands; rendering handles expanded display
                        commandsInBranches.add(endCmd.id);
                        for (let k = i + 1; k < j; k++) {
                            commandsInBranches.add(activeScene.commands[k].id);
                        }
                        break;
                    }
                }
            }
        }

        for (let i = 0; i < activeScene.commands.length; i++) {
            const cmd = activeScene.commands[i];
            
            // Skip commands that are inside groups (they'll be rendered within the group)
            if (commandsInGroups.has(cmd.id)) {
                continue;
            }
            
            // Skip commands that are inside branches (including BranchEnd)
            if (commandsInBranches.has(cmd.id)) {
                continue;
            }
            
            // Only show BranchStart commands
            visible.push({ command: cmd, index: i, depth });
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
                <div 
                    className="flex-grow space-y-2 overflow-y-auto pr-2 relative"
                    onDragLeave={(e) => {
                        // Only clear drop target if leaving the main container
                        if (e.currentTarget === e.target) {
                            setDropTarget(null);
                        }
                    }}
                    onMouseDown={(e) => {
                        const target = e.target as HTMLElement;
                        if (!target.closest('[data-command-id]')) {
                            setSelectedCommands(new Set());
                            setSelectedCommandIndex(null);
                            setLastSelectedIndex(null);
                            setSelectedVariableId(null);
                        }
                    }}
                >
                    {(() => {
                        // Build set of command IDs that are inside groups
                        const commandsInGroups = new Set<VNID>();
                        for (const cmd of activeScene.commands) {
                            if (cmd.type === CommandType.Group) {
                                const groupCmd = cmd as GroupCommand;
                                groupCmd.commandIds.forEach(id => commandsInGroups.add(id));
                            }
                        }
                        
                        // Build set of command IDs that are inside branches (to hide BranchEnd and contents)
                        const commandsInBranches = new Set<VNID>();
                        for (let i = 0; i < activeScene.commands.length; i++) {
                            const cmd = activeScene.commands[i];
                            if (cmd.type === CommandType.BranchStart) {
                                const branchCmd = cmd as BranchStartCommand;
                                // Find matching BranchEnd and hide markers + collapsed contents
                                for (let j = i + 1; j < activeScene.commands.length; j++) {
                                    const endCmd = activeScene.commands[j];
                                    if (endCmd.type === CommandType.BranchEnd && (endCmd as BranchEndCommand).branchId === branchCmd.branchId) {
                                        // Hide BranchEnd marker
                                        commandsInBranches.add(endCmd.id);
                                        // Hide all commands between BranchStart and BranchEnd (rendered separately)
                                        for (let k = i + 1; k < j; k++) {
                                            commandsInBranches.add(activeScene.commands[k].id);
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                        
                        // Filter out commands that are inside groups or branches
                        const filteredCommands = activeScene.commands.filter(cmd => 
                            !commandsInGroups.has(cmd.id) && !commandsInBranches.has(cmd.id)
                        );
                        
                        // Group commands into stacks for rendering
                        const commandStacks = groupCommandsIntoStacks(filteredCommands);
                        let globalIndex = 0;

                        return commandStacks.map((stack) => {
                            const stackStartIndex = globalIndex;
                            const stackCommands = stack.commands;
                            globalIndex += stackCommands.length;
                            
                            // Get the real index from the original commands array
                            const realCommandIndex = activeScene.commands.findIndex(c => c.id === stackCommands[0].id);

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
                                            startIndex={realCommandIndex}
                                            allCommands={activeScene.commands}
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
                                const index = realCommandIndex;
                                const isBranchStart = cmd.type === CommandType.BranchStart;
                                const isGroup = cmd.type === CommandType.Group;
                                const branchCmd = isBranchStart ? cmd as BranchStartCommand : null;
                                const groupCmd = isGroup ? cmd as GroupCommand : null;
                                const isBranchCollapsed = branchCmd ? collapsedBranches.has(branchCmd.branchId) : false;

                                return (
                                    <div key={cmd.id} className="relative">
                                        <div
                                            onClick={(e) => {
                                                if (e.shiftKey && lastSelectedIndex !== null) {
                                                    // Shift-click: select range
                                                    const start = Math.min(lastSelectedIndex, index);
                                                    const end = Math.max(lastSelectedIndex, index);
                                                    const rangeIds = activeScene.commands.slice(start, end + 1).map(c => c.id);
                                                    setSelectedCommands(new Set([...selectedCommands, ...rangeIds]));
                                                } else if (e.ctrlKey || e.metaKey) {
                                                    // Ctrl-click: toggle selection
                                                    const newSelected = new Set(selectedCommands);
                                                    if (newSelected.has(cmd.id)) {
                                                        newSelected.delete(cmd.id);
                                                    } else {
                                                        newSelected.add(cmd.id);
                                                    }
                                                    setSelectedCommands(newSelected);
                                                } else {
                                                    // Regular click: select single
                                                    setSelectedCommands(new Set([cmd.id]));
                                                }
                                                setLastSelectedIndex(index);
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
                                                    canDrop={dropTarget.position !== 'inside' || (isGroup || isBranchStart ? true : canStackCommands([cmd]).canStack)}
                                                    message={
                                                        dropTarget.position === 'inside' 
                                                            ? isGroup 
                                                                ? '📁 Add to Group'
                                                                : isBranchStart
                                                                    ? '🔀 Add to Branch'
                                                                    : canStackCommands([cmd]).canStack 
                                                                        ? '⊕ Stack Here' 
                                                                        : `❌ ${canStackCommands([cmd]).reason}`
                                                            : dropTarget.position === 'before' 
                                                                ? '⬆ Place Above' 
                                                                : '⬇ Place Below'
                                                    }
                                                />
                                            )}
                                            <CommandItem 
                                                command={cmd} 
                                                project={project} 
                                                isSelected={index === selectedCommandIndex}
                                                isInMultiSelection={selectedCommands.has(cmd.id) && selectedCommands.size > 1}
                                                depth={0}
                                                collapsedBranches={collapsedBranches}
                                                onToggleCollapse={(isGroup || isBranchStart) ? () => {
                                                    if (isGroup) {
                                                        dispatch({
                                                            type: 'TOGGLE_GROUP_COLLAPSE',
                                                            payload: {
                                                                sceneId: activeSceneId,
                                                                groupId: cmd.id
                                                            }
                                                        });
                                                    } else if (isBranchStart && branchCmd) {
                                                        toggleBranchCollapse(branchCmd.branchId);
                                                    }
                                                } : undefined}
                                                onRename={isGroup ? (newName: string) => {
                                                    dispatch({
                                                        type: 'RENAME_GROUP',
                                                        payload: {
                                                            sceneId: activeSceneId,
                                                            groupId: cmd.id,
                                                            name: newName
                                                        }
                                                    });
                                                } : undefined}
                                            />
                                        </div>
                                        {/* Render branch contents if it's a branch and not collapsed */}
                                        {isBranchStart && branchCmd && !isBranchCollapsed && (() => {
                                            // Find all commands between BranchStart and BranchEnd
                                            const branchStartIndex = activeScene.commands.findIndex(c => c.id === cmd.id);
                                            const branchEndIndex = activeScene.commands.findIndex((c, i) => 
                                                i > branchStartIndex && 
                                                c.type === CommandType.BranchEnd && 
                                                (c as BranchEndCommand).branchId === branchCmd.branchId
                                            );
                                            
                                            if (branchEndIndex === -1) return null;
                                            
                                            const branchCommands = activeScene.commands.slice(branchStartIndex + 1, branchEndIndex);
                                            const branchColor = branchCmd.color || '#6366f1';
                                            
                                            const branchDropTargetId = `branch-container-${branchCmd.branchId}`;

                                            const handleBranchDrop = (event: React.DragEvent<HTMLDivElement>) => {
                                                event.preventDefault();
                                                event.stopPropagation();

                                                const paletteCommandType = event.dataTransfer.getData('application/vn-command-type');
                                                if (paletteCommandType) {
                                                    const typedCommand = paletteCommandType as CommandType;

                                                    if (typedCommand === CommandType.BranchStart) {
                                                        const nestedBranchId = generateBranchId();
                                                        const branchStart = createCommandWithId(CommandType.BranchStart, { branchId: nestedBranchId });
                                                        const branchEnd = createCommandWithId(CommandType.BranchEnd, { branchId: nestedBranchId });

                                                        if (branchStart && branchEnd) {
                                                            insertCommandsIntoScene([branchStart, branchEnd], branchEndIndex);
                                                        }
                                                        setDropTarget(null);
                                                        return;
                                                    }

                                                    const newCommand = createCommandWithId(typedCommand);
                                                    if (newCommand) {
                                                        insertCommandsIntoScene([newCommand], branchEndIndex);
                                                    }
                                                    setDropTarget(null);
                                                    return;
                                                }

                                                // Get the dragged command ID from dataTransfer (more reliable than state)
                                                const droppedCommandId = event.dataTransfer.getData('text/plain') || draggedCommandId;
                                                if (!droppedCommandId) {
                                                    console.warn('[Branch Drop] No command ID found');
                                                    setDropTarget(null);
                                                    return;
                                                }

                                                const draggedIndex = activeScene.commands.findIndex(c => c.id === droppedCommandId);
                                                if (draggedIndex === -1) {
                                                    console.warn('[Branch Drop] Could not find dragged command index');
                                                    setDropTarget(null);
                                                    return;
                                                }

                                                const currentBranchEndIndex = activeScene.commands.findIndex((c, i) => 
                                                    i > branchStartIndex && 
                                                    c.type === CommandType.BranchEnd && 
                                                    (c as BranchEndCommand).branchId === branchCmd.branchId
                                                );

                                                if (currentBranchEndIndex === -1) {
                                                    console.warn('[Branch Drop] Missing BranchEnd command');
                                                    setDropTarget(null);
                                                    return;
                                                }

                                                const insertIndex = draggedIndex < currentBranchEndIndex ? currentBranchEndIndex - 1 : currentBranchEndIndex;

                                                dispatch({ 
                                                    type: 'MOVE_COMMAND', 
                                                    payload: { 
                                                        sceneId: activeSceneId, 
                                                        fromIndex: draggedIndex, 
                                                        toIndex: insertIndex 
                                                    } 
                                                });

                                                setDropTarget(null);
                                                setDraggedCommandId(null);
                                            };

                                            return (
                                                <div 
                                                    className="ml-6 mt-2 space-y-2 pl-4 min-h-[40px] relative" 
                                                    style={{ 
                                                        borderLeft: `3px solid ${branchColor}`,
                                                        borderRadius: '0 0 0 8px'
                                                    }}
                                                    onDragOver={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const paletteDrag = e.dataTransfer.types.includes('application/vn-command-type');
                                                        e.dataTransfer.dropEffect = paletteDrag ? 'copy' : 'move';
                                                        setDropTarget({ commandId: branchDropTargetId, position: 'inside' });
                                                    }}
                                                    onDrop={handleBranchDrop}
                                                >
                                                    <div className="flex justify-end mb-2">
                                                        <AddCommandMenu onAdd={(type) => handleAddCommandToBranch(branchCmd.branchId, type)} />
                                                    </div>
                                                    {branchCommands.length === 0 ? (
                                                        <div
                                                            className={`min-h-[60px] border-2 border-dashed rounded flex flex-col items-center justify-center gap-1 text-[var(--text-secondary)] text-sm transition-colors ${dropTarget?.commandId === branchDropTargetId ? 'border-[var(--accent-purple)] text-[var(--accent-purple)]/80 bg-[var(--accent-purple)]/10' : ''}`}
                                                            onDragOver={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                const paletteDrag = e.dataTransfer.types.includes('application/vn-command-type');
                                                                e.dataTransfer.dropEffect = paletteDrag ? 'copy' : 'move';
                                                                setDropTarget({ commandId: branchDropTargetId, position: 'inside' });
                                                            }}
                                                            onDragLeave={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                                    setDropTarget(null);
                                                                }
                                                            }}
                                                            onDrop={handleBranchDrop}
                                                        >
                                                            {dropTarget?.commandId === branchDropTargetId ? 'Release to drop' : 'Drag commands here...'}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {branchCommands.map((branchChildCmd, branchChildIndex) => {
                                                                const childIndex = activeScene.commands.findIndex(c => c.id === branchChildCmd.id);
                                                                if (childIndex === -1) return null;
                                                                const isLastChild = branchChildIndex === branchCommands.length - 1;
                                                                return (
                                                                    <div 
                                                                        key={branchChildCmd.id}
                                                                        draggable
                                                                        onDragStart={(e) => handleDragStart(e, branchChildCmd.id, childIndex)}
                                                                        onDragOver={(e) => {
                                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                                            const y = e.clientY - rect.top;
                                                                            // Only allow before/after drops inside branches, not "inside" (no stacking)
                                                                            if (y < rect.height * 0.5) {
                                                                                handleDragOver(e, branchChildCmd.id, 'before');
                                                                            } else {
                                                                                handleDragOver(e, branchChildCmd.id, 'after');
                                                                            }
                                                                        }}
                                                                        onDragLeave={handleDragLeave}
                                                                        onDrop={(e) => {
                                                                            if (dropTarget?.commandId === branchChildCmd.id) {
                                                                                handleDrop(e, dropTarget.commandId, dropTarget.position);
                                                                            }
                                                                        }}
                                                                        onDragEnd={handleDragEnd}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            
                                                                            if (e.shiftKey && lastSelectedIndex !== null) {
                                                                                // Shift-click: select range
                                                                                const start = Math.min(lastSelectedIndex, childIndex);
                                                                                const end = Math.max(lastSelectedIndex, childIndex);
                                                                                const rangeIds = activeScene.commands.slice(start, end + 1).map(c => c.id);
                                                                                setSelectedCommands(new Set([...selectedCommands, ...rangeIds]));
                                                                            } else if (e.ctrlKey || e.metaKey) {
                                                                                // Ctrl-click: toggle selection
                                                                                const newSelected = new Set(selectedCommands);
                                                                                if (newSelected.has(branchChildCmd.id)) {
                                                                                    newSelected.delete(branchChildCmd.id);
                                                                                } else {
                                                                                    newSelected.add(branchChildCmd.id);
                                                                                }
                                                                                setSelectedCommands(newSelected);
                                                                            } else {
                                                                                // Regular click: select single
                                                                                setSelectedCommands(new Set([branchChildCmd.id]));
                                                                            }
                                                                            
                                                                            setLastSelectedIndex(childIndex);
                                                                            setSelectedCommandIndex(childIndex);
                                                                            setSelectedVariableId(null);
                                                                        }}
                                                                        className="cursor-pointer relative"
                                                                    >
                                                                        {/* Connector dot */}
                                                                        <div 
                                                                            className="absolute -left-[21px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 pointer-events-none"
                                                                            style={{ 
                                                                                borderColor: branchColor,
                                                                                backgroundColor: childIndex === selectedCommandIndex ? branchColor : 'var(--bg-primary)'
                                                                            }}
                                                                        />
                                                                        {/* Horizontal connector line */}
                                                                        <div 
                                                                            className="absolute -left-[14px] top-1/2 w-[10px] h-[2px] pointer-events-none"
                                                                            style={{ backgroundColor: branchColor }}
                                                                        />
                                                                        {dropTarget?.commandId === branchChildCmd.id && (
                                                                            <DragDropIndicator 
                                                                                position={dropTarget.position} 
                                                                                canDrop={true}
                                                                                message={
                                                                                    dropTarget.position === 'before' 
                                                                                        ? '⬆ Place Above' 
                                                                                        : '⬇ Place Below'
                                                                                }
                                                                            />
                                                                        )}
                                                                        <CommandItem 
                                                                            command={branchChildCmd} 
                                                                            project={project} 
                                                                            isSelected={childIndex === selectedCommandIndex}
                                                                            isInMultiSelection={selectedCommands.has(branchChildCmd.id) && selectedCommands.size > 1}
                                                                            depth={1}
                                                                            collapsedBranches={collapsedBranches}
                                                                        />
                                                                    </div>
                                                                );
                                                            })}
                                                            {/* Bottom drop zone for branches */}
                                                            <div
                                                                className={`min-h-[40px] border-2 border-dashed rounded flex items-center justify-center text-[var(--text-secondary)] text-sm transition-colors ${dropTarget?.commandId === `branch-bottom-${branchCmd.branchId}` ? 'border-[var(--accent-purple)] text-[var(--accent-purple)]/80 bg-[var(--accent-purple)]/10' : ''}`}
                                                                style={{ 
                                                                    borderColor: `${branchColor}4d`,
                                                                    opacity: dropTarget?.commandId === `branch-bottom-${branchCmd.branchId}` ? 1 : 0.3
                                                                }}
                                                                onDragOver={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    const paletteDrag = e.dataTransfer.types.includes('application/vn-command-type');
                                                                    e.dataTransfer.dropEffect = paletteDrag ? 'copy' : 'move';
                                                                    setDropTarget({ commandId: `branch-bottom-${branchCmd.branchId}`, position: 'after' });
                                                                }}
                                                                onDragLeave={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                                        setDropTarget(null);
                                                                    }
                                                                }}
                                                                onDrop={handleBranchDrop}
                                                            >
                                                                {dropTarget?.commandId === `branch-bottom-${branchCmd.branchId}` ? '⬇ Drop at End' : 'Drop zone'}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {/* Render group contents if it's a group and not collapsed */}
                                        {isGroup && groupCmd && !groupCmd.collapsed && (
                                            <div className="ml-6 mt-2 space-y-2 border-l-2 border-amber-500/30 pl-2">
                                                {groupCmd.commandIds.map((cmdId, groupIndex) => {
                                                    const childCmd = activeScene.commands.find(c => c.id === cmdId);
                                                    const childIndex = activeScene.commands.findIndex(c => c.id === cmdId);
                                                    if (!childCmd) return null;
                                                    return (
                                                        <div 
                                                            key={cmdId}
                                                            draggable
                                                            onDragStart={(e) => {
                                                                e.stopPropagation();
                                                                setDraggedCommandId(cmdId);
                                                                dragItem.current = { id: cmdId, index: groupIndex, groupId: cmd.id };
                                                            }}
                                                            onDragOver={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                // Allow reordering within group
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                const y = e.clientY - rect.top;
                                                                if (y < rect.height / 2) {
                                                                    setDropTarget({ commandId: cmdId, position: 'before' });
                                                                } else {
                                                                    setDropTarget({ commandId: cmdId, position: 'after' });
                                                                }
                                                            }}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                
                                                                if (!draggedCommandId || !dragItem.current) return;
                                                                
                                                                // Check if dragging within the same group
                                                                if ((dragItem.current as any).groupId === cmd.id) {
                                                                    const draggedGroupIndex = groupCmd.commandIds.indexOf(draggedCommandId);
                                                                    const targetGroupIndex = groupCmd.commandIds.indexOf(cmdId);
                                                                    
                                                                    if (draggedGroupIndex === -1 || targetGroupIndex === -1) return;
                                                                    
                                                                    const newCommandIds = [...groupCmd.commandIds];
                                                                    newCommandIds.splice(draggedGroupIndex, 1);
                                                                    
                                                                    const insertIndex = dropTarget?.position === 'before' 
                                                                        ? targetGroupIndex - (draggedGroupIndex < targetGroupIndex ? 1 : 0)
                                                                        : targetGroupIndex + (draggedGroupIndex < targetGroupIndex ? 0 : 1);
                                                                    
                                                                    newCommandIds.splice(insertIndex, 0, draggedCommandId);
                                                                    
                                                                    dispatch({
                                                                        type: 'REORDER_COMMANDS_IN_GROUP',
                                                                        payload: {
                                                                            sceneId: activeSceneId,
                                                                            groupId: cmd.id,
                                                                            commandIds: newCommandIds
                                                                        }
                                                                    });
                                                                }
                                                                
                                                                setDraggedCommandId(null);
                                                                dragItem.current = null;
                                                                setDropTarget(null);
                                                            }}
                                                            onDragEnd={(e) => {
                                                                e.stopPropagation();
                                                                setDraggedCommandId(null);
                                                                dragItem.current = null;
                                                                setDropTarget(null);
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                
                                                                if (e.shiftKey && lastSelectedIndex !== null) {
                                                                    // Shift-click: select range
                                                                    const start = Math.min(lastSelectedIndex, childIndex);
                                                                    const end = Math.max(lastSelectedIndex, childIndex);
                                                                    const rangeIds = activeScene.commands.slice(start, end + 1).map(c => c.id);
                                                                    setSelectedCommands(new Set([...selectedCommands, ...rangeIds]));
                                                                } else if (e.ctrlKey || e.metaKey) {
                                                                    // Ctrl-click: toggle selection
                                                                    const newSelected = new Set(selectedCommands);
                                                                    const groupChildId = activeScene.commands[childIndex].id;
                                                                    if (newSelected.has(groupChildId)) {
                                                                        newSelected.delete(groupChildId);
                                                                    } else {
                                                                        newSelected.add(groupChildId);
                                                                    }
                                                                    setSelectedCommands(newSelected);
                                                                } else {
                                                                    // Regular click: select single
                                                                    setSelectedCommands(new Set([activeScene.commands[childIndex].id]));
                                                                }
                                                                
                                                                setLastSelectedIndex(childIndex);
                                                                setSelectedCommandIndex(childIndex);
                                                                setSelectedVariableId(null);
                                                            }}
                                                            className="cursor-pointer relative"
                                                        >
                                                            {dropTarget?.commandId === cmdId && dragItem.current?.groupId === cmd.id && (
                                                                <DragDropIndicator 
                                                                    position={dropTarget.position} 
                                                                    canDrop={true}
                                                                    message={
                                                                        dropTarget.position === 'before' 
                                                                            ? '⬆ Place Above' 
                                                                            : '⬇ Place Below'
                                                                    }
                                                                />
                                                            )}
                                                            <CommandItem 
                                                                command={childCmd} 
                                                                project={project} 
                                                                isSelected={childIndex === selectedCommandIndex}
                                                                isInMultiSelection={selectedCommands.has(childCmd.id) && selectedCommands.size > 1}
                                                                depth={1}
                                                                collapsedBranches={collapsedBranches}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                                {/* Bottom drop zone for groups */}
                                                {groupCmd.commandIds.length > 0 && (
                                                    <div
                                                        className="min-h-[40px] border-2 border-dashed border-amber-500/30 rounded flex items-center justify-center text-[var(--text-secondary)] text-sm"
                                                        style={{ 
                                                            opacity: dropTarget?.commandId === `group-bottom-${cmd.id}` ? 1 : 0.3
                                                        }}
                                                        onDragOver={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setDropTarget({ commandId: `group-bottom-${cmd.id}`, position: 'after' });
                                                        }}
                                                        onDragLeave={handleDragLeave}
                                                        onDrop={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            
                                                            if (!draggedCommandId || !dragItem.current) return;
                                                            
                                                            // Check if dragging within the same group
                                                            if ((dragItem.current as any).groupId === cmd.id && groupCmd.commandIds.length > 0) {
                                                                const draggedGroupIndex = groupCmd.commandIds.indexOf(draggedCommandId);
                                                                
                                                                if (draggedGroupIndex === -1) return;
                                                                
                                                                const newCommandIds = [...groupCmd.commandIds];
                                                                newCommandIds.splice(draggedGroupIndex, 1);
                                                                newCommandIds.push(draggedCommandId); // Add to end
                                                                
                                                                dispatch({
                                                                    type: 'REORDER_COMMANDS_IN_GROUP',
                                                                    payload: {
                                                                        sceneId: activeSceneId,
                                                                        groupId: cmd.id,
                                                                        commandIds: newCommandIds
                                                                    }
                                                                });
                                                            }
                                                            
                                                            setDraggedCommandId(null);
                                                            dragItem.current = null;
                                                            setDropTarget(null);
                                                        }}
                                                        onDragEnd={(e) => {
                                                            e.stopPropagation();
                                                            setDraggedCommandId(null);
                                                            dragItem.current = null;
                                                            setDropTarget(null);
                                                        }}
                                                    >
                                                        {dropTarget?.commandId === `group-bottom-${cmd.id}` ? '⬇ Drop at End' : 'Drop zone'}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            }
                        });
                    })()}
                    
                    {/* Bottom Drop Zone */}
                    <div
                        className="min-h-[60px] flex-1 border-2 border-dashed rounded mt-2 flex items-center justify-center transition-all"
                        style={{
                            borderColor: dropTarget?.commandId === 'scene-bottom' ? 'var(--accent-cyan)' : 'var(--border)',
                            backgroundColor: dropTarget?.commandId === 'scene-bottom' ? 'var(--accent-cyan)/10' : 'transparent',
                            opacity: dropTarget?.commandId === 'scene-bottom' ? 1 : (activeScene.commands.length === 0 ? 0.5 : 0.3)
                        }}
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            // Check if dragging from palette
                            const paletteCommandType = e.dataTransfer.types.includes('application/vn-command-type');
                            if (paletteCommandType || draggedCommandId) {
                                e.dataTransfer.dropEffect = paletteCommandType ? 'copy' : 'move';
                                setDropTarget({ commandId: 'scene-bottom', position: 'after' });
                            }
                        }}
                        onDragLeave={(e) => {
                            e.preventDefault();
                            if (e.currentTarget === e.target) {
                                setDropTarget(null);
                            }
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            // Check if dropping a command from palette
                            const paletteCommandType = e.dataTransfer.getData('application/vn-command-type');
                            if (paletteCommandType) {
                                const newCommandData = createCommand(paletteCommandType as CommandType, project);
                                if (newCommandData) {
                                    const newCommand = { ...newCommandData, id: `cmd-${Math.random().toString(36).substring(2, 9)}` } as VNCommand;
                                    dispatch({
                                        type: 'ADD_COMMAND',
                                        payload: {
                                            sceneId: activeSceneId,
                                            command: newCommand
                                        }
                                    });
                                    setSelectedCommandIndex(activeScene.commands.length);
                                }
                            } else if (draggedCommandId && dragItem.current) {
                                // Move existing command to bottom
                                const draggedIndex = activeScene.commands.findIndex(c => c.id === draggedCommandId);
                                if (draggedIndex !== -1 && draggedIndex !== activeScene.commands.length - 1) {
                                    dispatch({
                                        type: 'MOVE_COMMAND',
                                        payload: {
                                            sceneId: activeSceneId,
                                            fromIndex: draggedIndex,
                                            toIndex: activeScene.commands.length - 1
                                        }
                                    });
                                    setSelectedCommandIndex(activeScene.commands.length - 1);
                                }
                            }
                            
                            setDropTarget(null);
                            setDraggedCommandId(null);
                            dragItem.current = null;
                        }}
                    >
                        <p className="text-slate-500 text-xs italic">
                            {dropTarget?.commandId === 'scene-bottom' 
                                ? '⬇ Drop here to add command' 
                                : activeScene.commands.length === 0 
                                    ? 'Drag commands here to start' 
                                    : 'Drop zone'
                            }
                        </p>
                    </div>
                </div>
            </div>

            {/* Warning Modal */}
            {warningModal && (
                <div 
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                    onClick={() => setWarningModal(null)}
                >
                    <div 
                        className="bg-[var(--bg-secondary)] border-2 border-[var(--accent-cyan)] rounded-lg p-6 max-w-md mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-4">⚠️ Cannot Stack Commands</h3>
                        <p className="text-[var(--text-secondary)] mb-6">{warningModal.message}</p>
                        <button
                            onClick={() => setWarningModal(null)}
                            className="w-full bg-[var(--accent-cyan)] hover:opacity-80 text-white font-bold py-2 px-4 rounded-lg transition-opacity"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </Panel>
    );
};

export default SceneEditor;