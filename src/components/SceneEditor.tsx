import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useProject } from '../contexts/ProjectContext';
// FIX: VNID is not exported from scene/types. Imported from ../types instead.
import { VNID } from '../types';
import { CommandType, VNCommand, ShowCharacterCommand, FlashScreenCommand, ShowTextCommand, ShowImageCommand, ShowButtonCommand, VNScene, BranchStartCommand, BranchEndCommand, GroupCommand } from '../features/scene/types';
import { VNProject } from '../types/project';
import { VNImage } from '../features/assets/types';
import Panel from './ui/Panel';
import { PlusIcon, GripVerticalIcon, ChevronDownIcon, Cog6ToothIcon, FolderIcon } from './icons';
import { createCommand } from '../utils/commandFactory';
import { 
    groupCommandsIntoStacks, 
    stackCommands, 
    unstackCommand, 
    canStackCommands,
    isCommandStacked
} from '../features/scene/commandStackUtils';
import { CommandStackRow, DragDropIndicator } from './CommandStackComponents';
import { getCommandColorScheme, getCommandLabel } from '../utils/commandColors';

const CommandItem: React.FC<{ 
    command: VNCommand, 
    project: VNProject, 
    isSelected: boolean, 
    depth: number, 
    onToggleCollapse?: () => void,
    onRename?: (newName: string) => void,
    collapsedBranches?: Set<string>
}> = ({ command, project, isSelected, depth, onToggleCollapse, onRename, collapsedBranches }) => {
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

    // Special styling for Groups and Branches
    const isGroup = command.type === CommandType.Group;
    const isBranch = command.type === CommandType.BranchStart;
    const groupCmd = isGroup ? command as GroupCommand : null;
    const branchCmd = isBranch ? command as BranchStartCommand : null;
    
    // Get color scheme for this command type
    const colors = getCommandColorScheme(command.type);
    
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
    
    return (
        <div 
            className={`py-1 px-2 rounded flex items-center gap-1.5 ${groupClasses} ${branchClasses} ${isSelected ? 'ring-2 ring-sky-500' : ''} ${isGroup || isBranch ? '' : `${colors.bg} border ${colors.border} ${colors.hover}`}`}
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
                            className={`font-bold text-xs flex-shrink-0 ${isGroup ? 'text-amber-500' : isBranch ? '' : colors.text}`}
                            onDoubleClick={isGroup && onRename ? handleStartEdit : undefined}
                            style={{ 
                                cursor: isGroup && onRename ? 'text' : 'default',
                                color: isBranch ? branchColor : undefined
                            }}
                        >
                            {getCommandLabel(command.type)}
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
            className="fixed bg-[var(--bg-secondary)] rounded-md shadow-lg z-50 border border-[var(--bg-tertiary)] max-h-60 overflow-y-auto"
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
                    <button key={type} onClick={() => handleSelect(type)} className="block w-full text-left px-4 py-2 hover:bg-[var(--accent-purple)] capitalize">
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
    const dragItem = useRef<{ id: string; index: number; groupId?: string } | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(new Set());
    const [draggedCommandId, setDraggedCommandId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ commandId: string; position: 'before' | 'inside' | 'after' } | null>(null);
    const [selectedCommands, setSelectedCommands] = useState<Set<string>>(new Set());
    const [warningModal, setWarningModal] = useState<{ message: string } | null>(null);
    const [clipboard, setClipboard] = useState<VNCommand[]>([]);
    const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

    // Keyboard shortcuts for copy/paste/delete
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input
            if ((e.target as HTMLElement).tagName === 'INPUT' || 
                (e.target as HTMLElement).tagName === 'TEXTAREA') {
                return;
            }

            // Copy: Ctrl+C
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedCommands.size > 0) {
                e.preventDefault();
                const commandsToCopy = activeScene.commands.filter(cmd => selectedCommands.has(cmd.id));
                setClipboard(commandsToCopy);
                console.log(`Copied ${commandsToCopy.length} command(s)`);
            }

            // Paste: Ctrl+V
            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard.length > 0) {
                e.preventDefault();
                handlePaste();
            }

            // Delete: Delete or Backspace
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCommands.size > 0) {
                e.preventDefault();
                handleBatchDelete();
            }

            // Select All: Ctrl+A
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                const allIds = new Set(activeScene.commands.map(cmd => cmd.id));
                setSelectedCommands(allIds);
            }

            // Deselect: Escape
            if (e.key === 'Escape') {
                setSelectedCommands(new Set());
                setLastClickedIndex(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedCommands, clipboard, activeScene.commands]);

    const handleCommandClick = (commandId: string, index: number, e: React.MouseEvent) => {
        if (e.ctrlKey || e.metaKey) {
            // Ctrl+Click: Toggle selection
            const newSelection = new Set(selectedCommands);
            if (newSelection.has(commandId)) {
                newSelection.delete(commandId);
            } else {
                newSelection.add(commandId);
            }
            setSelectedCommands(newSelection);
            setLastClickedIndex(index);
        } else if (e.shiftKey && lastClickedIndex !== null) {
            // Shift+Click: Select range
            const start = Math.min(lastClickedIndex, index);
            const end = Math.max(lastClickedIndex, index);
            const newSelection = new Set<string>();
            for (let i = start; i <= end; i++) {
                if (activeScene.commands[i]) {
                    newSelection.add(activeScene.commands[i].id);
                }
            }
            setSelectedCommands(newSelection);
        } else {
            // Normal click: Clear selection and select current command
            setSelectedCommands(new Set([commandId]));
            setSelectedCommandIndex(index);
            setSelectedVariableId(null);
            setLastClickedIndex(index);
        }
    };

    const handlePaste = () => {
        if (clipboard.length === 0) return;

        // Find insertion point (after selected command, or at end if none selected)
        let insertIndex = activeScene.commands.length;
        if (selectedCommandIndex !== null) {
            insertIndex = selectedCommandIndex + 1;
        }

        // Create copies of commands with new IDs
        const newCommands = clipboard.map(cmd => ({
            ...cmd,
            id: `cmd-${Math.random().toString(36).substr(2, 9)}` as VNID
        }));

        const updatedCommands = [...activeScene.commands];
        updatedCommands.splice(insertIndex, 0, ...newCommands);

        dispatch({
            type: 'UPDATE_SCENE_COMMANDS',
            payload: {
                sceneId: activeSceneId,
                commands: updatedCommands
            }
        });

        // Select the newly pasted commands
        const newIds = new Set(newCommands.map(cmd => cmd.id));
        setSelectedCommands(newIds);
        console.log(`Pasted ${newCommands.length} command(s)`);
    };

    const handleBatchDelete = () => {
        if (selectedCommands.size === 0) return;

        const confirmMsg = `Delete ${selectedCommands.size} selected command(s)? This cannot be undone.`;
        if (!confirm(confirmMsg)) return;

        const updatedCommands = activeScene.commands.filter(cmd => !selectedCommands.has(cmd.id));

        dispatch({
            type: 'UPDATE_SCENE_COMMANDS',
            payload: {
                sceneId: activeSceneId,
                commands: updatedCommands
            }
        });

        setSelectedCommands(new Set());
        setSelectedCommandIndex(null);
        console.log(`Deleted ${selectedCommands.size} command(s)`);
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, commandId: string, index: number) => {
        dragItem.current = { id: commandId, index };
        setDraggedCommandId(commandId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', commandId);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetCommandId: string, position: 'before' | 'inside' | 'after') => {
        e.preventDefault();
        // Allow drops from CommandPalette even if draggedCommandId is not set
        const commandTypeFromPalette = e.dataTransfer.types.includes('commandtype');
        if (isCollapsed || (!draggedCommandId && !commandTypeFromPalette)) return;
        
        setDropTarget({ commandId: targetCommandId, position });
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDropTarget(null);
    };
    
    const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetCommandId: string, position: 'before' | 'inside' | 'after') => {
        e.preventDefault();
        
        // Check if this is a new command from the palette
        const commandTypeFromPalette = e.dataTransfer.getData('commandType');
        if (commandTypeFromPalette) {
            // This is a new command being added from the palette
            const targetCommand = activeScene.commands.find(cmd => cmd.id === targetCommandId);
            const targetIndex = activeScene.commands.findIndex(cmd => cmd.id === targetCommandId);
            
            if (!targetCommand || targetIndex === -1) return;
            
            // Create the new command using the factory
            const newCommandData = createCommand(commandTypeFromPalette as CommandType, project);
            if (!newCommandData) return; // Handle null case
            
            const newCommand: VNCommand = {
                ...newCommandData,
                id: `cmd-${Math.random().toString(36).substring(2, 9)}`
            } as VNCommand;
            
            // Determine where to insert
            let insertIndex = targetIndex;
            if (position === 'after') {
                insertIndex = targetIndex + 1;
            } else if (position === 'inside') {
                // If dropping inside a Group or Branch, handle appropriately
                if (targetCommand.type === CommandType.Group) {
                    dispatch({
                        type: 'ADD_COMMAND_TO_GROUP',
                        payload: {
                            sceneId: activeSceneId,
                            groupId: targetCommandId,
                            commandId: newCommand.id
                        }
                    });
                    // First add the command to the scene
                    dispatch({
                        type: 'ADD_COMMAND',
                        payload: {
                            sceneId: activeSceneId,
                            command: newCommand
                        }
                    });
                    return;
                } else if (targetCommand.type === CommandType.BranchStart) {
                    // Add before the BranchEnd
                    const branchCmd = targetCommand as BranchStartCommand;
                    const branchEndIndex = activeScene.commands.findIndex((c, i) => 
                        i > targetIndex && 
                        c.type === CommandType.BranchEnd && 
                        (c as BranchEndCommand).branchId === branchCmd.branchId
                    );
                    if (branchEndIndex !== -1) {
                        insertIndex = branchEndIndex;
                    }
                }
            }
            
            // Insert the command at the specified position
            const newCommands = [...activeScene.commands];
            newCommands.splice(insertIndex, 0, newCommand);
            
            dispatch({
                type: 'UPDATE_SCENE_COMMANDS',
                payload: {
                    sceneId: activeSceneId,
                    commands: newCommands
                }
            });
            
            return;
        }
        
        // Original logic for reordering existing commands
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
                const branchCmd = targetCommand as BranchStartCommand;
                const branchEndIndex = activeScene.commands.findIndex((c, i) => 
                    i > targetIndex && 
                    c.type === CommandType.BranchEnd && 
                    (c as BranchEndCommand).branchId === branchCmd.branchId
                );
                
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

    const handleInsertTemplate = (templateCommands: Omit<VNCommand, 'id'>[]) => {
        // Add each command from the template
        templateCommands.forEach((cmdTemplate) => {
            const newCommand = { ...cmdTemplate, id: `cmd-${Math.random().toString(36).substring(2, 9)}` } as VNCommand;
            dispatch({ type: 'ADD_COMMAND', payload: { sceneId: activeSceneId, command: newCommand } });
        });
        setSelectedCommandIndex(activeScene.commands.length + templateCommands.length - 1);
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
                // Find matching BranchEnd and hide everything between (including BranchEnd)
                for (let j = i + 1; j < activeScene.commands.length; j++) {
                    const endCmd = activeScene.commands[j];
                    if (endCmd.type === CommandType.BranchEnd && (endCmd as BranchEndCommand).branchId === branchCmd.branchId) {
                        // Hide BranchEnd
                        commandsInBranches.add(endCmd.id);
                        // Hide all commands between BranchStart and BranchEnd (they'll render inside the branch container)
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
        >
            <div className="flex flex-col h-full min-h-0">
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
                {selectedCommands.size > 0 && (
                    <div className="mb-2 p-2 bg-sky-500/10 border border-sky-500/30 rounded-md text-sm">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[var(--text-primary)] font-medium">
                                {selectedCommands.size} command{selectedCommands.size !== 1 ? 's' : ''} selected
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => {
                                        const commandsToCopy = activeScene.commands.filter(cmd => selectedCommands.has(cmd.id));
                                        setClipboard(commandsToCopy);
                                    }}
                                    className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded transition-colors"
                                    title="Copy (Ctrl+C)"
                                >
                                    Copy
                                </button>
                                {clipboard.length > 0 && (
                                    <button
                                        onClick={handlePaste}
                                        className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded transition-colors"
                                        title={`Paste ${clipboard.length} command(s) (Ctrl+V)`}
                                    >
                                        Paste ({clipboard.length})
                                    </button>
                                )}
                                <button
                                    onClick={handleBatchDelete}
                                    className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded transition-colors"
                                    title="Delete (Del)"
                                >
                                    Delete
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedCommands(new Set());
                                        setLastClickedIndex(null);
                                    }}
                                    className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded transition-colors"
                                    title="Clear selection (Esc)"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                <div 
                    className="flex-grow space-y-1 overflow-y-auto pr-2 relative min-h-0"
                    onDragLeave={(e) => {
                        // Only clear drop target if leaving the main container
                        if (e.currentTarget === e.target) {
                            setDropTarget(null);
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
                                // Find matching BranchEnd and hide everything between (including BranchEnd)
                                for (let j = i + 1; j < activeScene.commands.length; j++) {
                                    const endCmd = activeScene.commands[j];
                                    if (endCmd.type === CommandType.BranchEnd && (endCmd as BranchEndCommand).branchId === branchCmd.branchId) {
                                        // Hide BranchEnd
                                        commandsInBranches.add(endCmd.id);
                                        // Hide all commands between BranchStart and BranchEnd
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
                                            onClick={(e) => handleCommandClick(cmd.id, index, e)}
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
                                            className={`cursor-pointer ${selectedCommands.has(cmd.id) ? 'ring-2 ring-sky-500 rounded' : ''}`}
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
                                            
                                            return (
                                                <div 
                                                    className="ml-6 mt-2 space-y-2 border-l-2 pl-2 min-h-[40px]" 
                                                    style={{ borderColor: `${branchColor}4d` }}
                                                    onDragOver={(e) => {
                                                        if (branchCommands.length === 0) {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                        }
                                                    }}
                                                    onDrop={(e) => {
                                                        if (branchCommands.length === 0 && draggedCommandId) {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            // Drop into empty branch
                                                            const draggedIndex = activeScene.commands.findIndex(c => c.id === draggedCommandId);
                                                            if (draggedIndex !== -1) {
                                                                const insertIndex = draggedIndex < branchEndIndex ? branchEndIndex - 1 : branchEndIndex;
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
                                                            }
                                                        }
                                                    }}
                                                >
                                                    {branchCommands.length === 0 ? (
                                                        <div className="text-[var(--text-secondary)] text-sm italic py-2">
                                                            Drag commands here...
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {branchCommands.map((branchChildCmd) => {
                                                                const childIndex = activeScene.commands.findIndex(c => c.id === branchChildCmd.id);
                                                                if (childIndex === -1) return null;
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
                                                                            setSelectedCommandIndex(childIndex);
                                                                            setSelectedVariableId(null);
                                                                        }}
                                                                        className="cursor-pointer relative"
                                                                    >
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
                                                                            depth={1}
                                                                            collapsedBranches={collapsedBranches}
                                                                        />
                                                                    </div>
                                                                );
                                                            })}
                                                            {/* Bottom drop zone for branches */}
                                                            <div
                                                                className="min-h-[40px] border-2 border-dashed rounded flex items-center justify-center text-[var(--text-secondary)] text-sm"
                                                                style={{ 
                                                                    borderColor: `${branchColor}4d`,
                                                                    opacity: dropTarget?.commandId === `branch-bottom-${branchCmd.branchId}` ? 1 : 0.3
                                                                }}
                                                                onDragOver={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    setDropTarget({ commandId: `branch-bottom-${branchCmd.branchId}`, position: 'after' });
                                                                }}
                                                                onDragLeave={handleDragLeave}
                                                                onDrop={(e) => {
                                                                    if (draggedCommandId && branchCommands.length > 0) {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        // Drop after the last command in the branch
                                                                        const lastBranchCmd = branchCommands[branchCommands.length - 1];
                                                                        handleDrop(e, lastBranchCmd.id, 'after');
                                                                    }
                                                                }}
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
                    
                    {/* Drop zone for empty scene or end of commands list */}
                    <div
                        className="min-h-[100px] border-2 border-dashed rounded-lg flex items-center justify-center text-[var(--text-secondary)] text-sm mt-2 transition-all"
                        style={{
                            borderColor: dropTarget?.commandId === 'scene-bottom' ? 'var(--accent-cyan)' : 'var(--border)',
                            backgroundColor: dropTarget?.commandId === 'scene-bottom' ? 'var(--accent-cyan)/10' : 'transparent',
                            opacity: dropTarget?.commandId === 'scene-bottom' ? 1 : (activeScene.commands.length === 0 ? 0.5 : 0.3)
                        }}
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const commandTypeFromPalette = e.dataTransfer.types.includes('commandtype');
                            if (commandTypeFromPalette || draggedCommandId) {
                                setDropTarget({ commandId: 'scene-bottom', position: 'after' });
                            }
                        }}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            // Check if dropping from CommandPalette
                            const commandTypeFromPalette = e.dataTransfer.getData('commandType');
                            if (commandTypeFromPalette) {
                                // Create new command at the end
                                const newCommandData = createCommand(commandTypeFromPalette as CommandType, project);
                                if (!newCommandData) return;
                                
                                const newCommand = {
                                    ...newCommandData,
                                    id: `cmd-${Math.random().toString(36).substr(2, 9)}` as VNID
                                } as VNCommand;
                                
                                const commands = [...activeScene.commands, newCommand];
                                
                                dispatch({
                                    type: 'UPDATE_SCENE_COMMANDS',
                                    payload: {
                                        sceneId: activeSceneId,
                                        commands
                                    }
                                });
                                
                                // Select the newly added command
                                setSelectedCommandIndex(commands.length - 1);
                            } else if (draggedCommandId && activeScene.commands.length > 0) {
                                // Move existing command to end
                                const lastCmd = activeScene.commands[activeScene.commands.length - 1];
                                handleDrop(e, lastCmd.id, 'after');
                            }
                            
                            setDropTarget(null);
                        }}
                    >
                        {dropTarget?.commandId === 'scene-bottom' 
                            ? '⬇ Drop Here' 
                            : activeScene.commands.length === 0 
                                ? 'Drag commands here to start' 
                                : 'Drop zone'}
                    </div>
                </div>
                <div className="pt-4 mt-auto space-y-2">
                    <button
                        onClick={() => handleAddCommand(CommandType.Group)}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                        <FolderIcon /> Create Group
                    </button>
                    <AddCommandMenu onAdd={handleAddCommand}/>
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