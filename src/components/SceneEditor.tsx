import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useProject } from '../contexts/ProjectContext';
import { useToast } from '../contexts/ToastContext';
// FIX: VNID is not exported from scene/types. Imported from ../types instead.
import { VNID } from '../types';
import { CommandType, VNCommand, ShowCharacterCommand, SetCharacterLayerCommand, FlashScreenCommand, ShowTextCommand, ShowImageCommand, ShowButtonCommand, VNScene, BranchStartCommand, BranchElseIfCommand, BranchElseCommand, BranchEndCommand, GroupCommand } from '../features/scene/types';
import { VNProject } from '../types/project';
import { VNImage } from '../features/assets/types';
import Panel from './ui/Panel';
import { PlusIcon, GripVerticalIcon, ChevronDownIcon, AdjustmentsIcon, FolderIcon } from './icons';
import { createCommand } from '../utils/commandFactory';
import { describeConditions } from '../utils/conditionLogic';
import { getCommandColor } from './CommandPalette';
import { 
    groupCommandsIntoStacks,
    stackCommands,
    unstackCommand,
    canStackCommands,
    isCommandStacked,
    generateStackId,
    canRunAsync
} from '../features/scene/commandStackUtils';
import { CommandStackRow, DragDropIndicator } from './CommandStackComponents';
import { useCommandRadial } from './inspector/CommandRadialContext';

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
    const { t } = useTranslation('commands');
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const leftPadding = depth > 0 ? `${depth * 20 + 8}px` : '8px';
    
    const getCommandSummary = () => {
        switch (command.type) {
            case CommandType.Group:
                const groupCmd = command as import('../features/scene/types').GroupCommand;
                const count = groupCmd.commandIds?.length || 0;
                return `${groupCmd.name} (${count} command${count !== 1 ? 's' : ''})`;
            case CommandType.BranchStart: {
                const branchCmd = command as BranchStartCommand;
                const desc = describeConditions(branchCmd.conditions, project.variables);
                const namePart = branchCmd.name ? ` · ${branchCmd.name}` : '';
                return `${desc || t('branchAlwaysRuns')}${namePart}`;
            }
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
            case CommandType.SetCharacterLayer: {
                const slc = command as SetCharacterLayerCommand;
                const cn = project.characters[slc.characterId]?.name || 'N/A';
                const n = (slc.layers || []).length;
                return `Set Layers: ${cn} (${n} ${n === 1 ? 'layer' : 'layers'})`;
            }
            case CommandType.Choice:
                return `Choice: ${command.options.length} options`;
            case CommandType.PlayMusic:
                 return `Play Music: ${project.audio[command.audioId]?.name || 'N/A'}`;
            case CommandType.StopMusic:
                return `Stop Music`;
            case CommandType.PlaySoundEffect:
                return `Play SFX: ${project.audio[command.audioId]?.name || 'N/A'}`;
            case CommandType.PlayMovie:
                return `Play Movie: ${(project.videos[command.videoId] || (project.backgrounds as any)[command.videoId] || (project.images as any)?.[command.videoId])?.name || 'N/A'}${command.displayMode === 'overlay' ? ' (overlay)' : ''}`;
            case CommandType.StopMovie:
                return `Stop Movie`;
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
            case CommandType.ShowItem: {
                const itemName = project.items?.[command.itemId]?.name || 'Unknown Item';
                return `Show Item: ${itemName} at (${command.x}%, ${command.y}%)`;
            }
            case CommandType.ShowHotSpot:
                return `Show Hot Spot: ${command.name?.trim() || 'Unnamed'}`;
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
            case CommandType.RunScript: {
                const scriptId = (command as any).scriptId;
                const script = scriptId ? (project.scripts || {})[scriptId] : null;
                return `Run Script: ${(script as any)?.name || 'No Script'}`;
            }
            case CommandType.SpawnParticles: {
                const tag = (command as any).particleTag || 'particles';
                const preset = (command as any).config?.preset;
                return `Spawn Particles: ${preset && preset !== 'none' ? preset : tag}`;
            }
            case CommandType.StopParticles: {
                const tag = (command as any).particleTag;
                return `Stop Particles${tag ? `: ${tag}` : ' (all)'}`;
            }
            case CommandType.TweenElement: {
                const tweenCmd = command as any;
                const props = [tweenCmd.x !== undefined && 'x', tweenCmd.y !== undefined && 'y', tweenCmd.opacity !== undefined && 'opacity', tweenCmd.scale !== undefined && 'scale', tweenCmd.zoom !== undefined && 'zoom'].filter(Boolean);
                return `Tween ${tweenCmd.targetType}: ${tweenCmd.targetId || '?'} (${props.length > 0 ? props.join(', ') : 'no props'}, ${tweenCmd.duration}s)`;
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
    
    // Multi-selection styling — bright ring + glow so it stands out over any command color.
    const multiSelectClass = isInMultiSelection ? 'ring-2 ring-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.55)] z-10' : '';
    const selectedClass = 'ring-2 ring-sky-300 shadow-[0_0_14px_rgba(125,211,252,0.75)] brightness-110 z-10';

    return (
        <div
            data-command-id={command.id}
            className={`py-1 px-2 rounded flex items-center gap-1.5 border ${groupClasses} ${branchClasses} ${isSelected ? selectedClass : multiSelectClass} ${isGroup || isBranch ? '' : commandColor || 'bg-[var(--bg-secondary)] border-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]'}`}
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
            <span className="cursor-grab text-[var(--text-secondary)] flex-shrink-0"><GripVerticalIcon className="w-3 h-3" /></span>
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
                        className="bg-[var(--bg-primary)] text-amber-500 font-bold px-2 py-1 rounded border border-amber-500 w-full text-xs"
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
                            {isBranch ? t('branchIf') : t(`names.${command.type}`, { defaultValue: command.type.replace(/([A-Z])/g, ' $1').trim() })}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] truncate flex-1">{getCommandSummary()}</p>
                    </>
                )}
            </div>
        </div>
    );
};

const AddCommandMenu: React.FC<{ onAdd: (type: CommandType) => void }> = ({ onAdd }) => {
    const { t } = useTranslation(['commands', 'common']);
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
                const displayName = t(`names.${type}`, { defaultValue: type.replace(/([A-Z])/g, ' $1').trim() });

                return (
                    <button key={type} onClick={() => handleSelect(type)} className="block w-full text-left px-2 py-1 hover:bg-[var(--accent-purple)] text-[10px]">
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
                    <PlusIcon className="w-3 h-3" /> {t('common:add')}
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
    const { t } = useTranslation(['scenes', 'common']);
    const commandRadial = useCommandRadial();
    const activeScene = project.scenes[activeSceneId];
    // Right-click a command row → open the group radial (only for migrated command types).
    const handleCommandContextMenu = (index: number, e: React.MouseEvent) => {
        const cmd = activeScene?.commands[index];
        if (commandRadial && commandRadial.isGrouped(cmd)) {
            e.preventDefault();
            commandRadial.openByIndex(index, e.clientX, e.clientY);
        }
    };
    const dragItem = useRef<{ id: string; index: number; groupId?: string } | null>(null);
    const dragOverItem = useRef<number | null>(null);
    // Branch collapse is persisted on each BranchStart's `isCollapsed` field (survives reopening
    // the scene), so this set is derived from the scene rather than held in ephemeral local state.
    const collapsedBranches = useMemo(() => {
        const s = new Set<string>();
        (activeScene?.commands || []).forEach(c => {
            if (c.type === CommandType.BranchStart && (c as BranchStartCommand).isCollapsed) {
                s.add((c as BranchStartCommand).branchId);
            }
        });
        return s;
    }, [activeScene]);
    const [draggedCommandId, setDraggedCommandId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ commandId: string; position: 'before' | 'inside' | 'after' } | null>(null);
    const [selectedCommands, setSelectedCommands] = useState<Set<string>>(new Set());
    const [warningModal, setWarningModal] = useState<{ message: string } | null>(null);
    const [clipboard, setClipboard] = useState<VNCommand[]>([]);
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

    // ===== Custom pointer-based reorder drag (top-level rows + stacks) =====
    // Native HTML5 drag suppresses the mouse wheel mid-drag, so the top-level list
    // uses pointer events instead — the wheel + edge auto-scroll work while dragging,
    // and a "make room" gap shows exactly where the command will land.
    const commandListRef = useRef<HTMLDivElement | null>(null);
    const pointerDrag = useRef<null | {
        id: string;
        startX: number;
        startY: number;
        active: boolean;
        drop: null | { targetId: string; position: 'before' | 'inside' | 'after'; kind: 'command' | 'branch' | 'group' };
    }>(null);
    const justDraggedRef = useRef(false);
    const autoScrollRef = useRef<{ vel: number; raf: number | null }>({ vel: 0, raf: null });
    // Stable snapshot of top-level row geometry captured at drag start. Drop detection runs
    // against this (in scroll-independent "content space") instead of the live DOM, so the
    // "make room" gap shifting the layout can't move the zones it's trying to detect.
    const dragSnapshotRef = useRef<null | { items: Array<{ id: string; top: number; height: number; inside: string | null }> }>(null);
    const [dragGhost, setDragGhost] = useState<{ x: number; y: number; label: string } | null>(null);

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

    // Shared selection logic so stacked commands and regular commands behave identically
    // (plain click = single, Shift = range, Ctrl/Cmd = toggle).
    const handleCommandSelect = useCallback((index: number, e: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => {
        // The click that follows a pointer-drag should not also change the selection.
        if (justDraggedRef.current) {
            return;
        }
        const latestScene = project.scenes[activeSceneId];
        const cmd = latestScene?.commands[index];
        if (!cmd) {
            return;
        }
        if (e.shiftKey && lastSelectedIndex !== null) {
            // Shift-click: select range
            const start = Math.min(lastSelectedIndex, index);
            const end = Math.max(lastSelectedIndex, index);
            const rangeIds = latestScene.commands.slice(start, end + 1).map(c => c.id);
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
    }, [project, activeSceneId, lastSelectedIndex, selectedCommands, setSelectedCommandIndex, setSelectedVariableId]);

    // Double-clicking a command in a parallel stack selects the whole stack as a unit.
    const handleSelectWholeStack = useCallback((anchorCommandId: string) => {
        const latestScene = project.scenes[activeSceneId];
        if (!latestScene) {
            return;
        }
        const anchor = latestScene.commands.find(c => c.id === anchorCommandId);
        const stackId = anchor?.modifiers?.stackId;
        const anchorIndex = latestScene.commands.findIndex(c => c.id === anchorCommandId);
        if (!stackId) {
            // Not stacked — fall back to a single selection.
            setSelectedCommands(new Set(anchorCommandId ? [anchorCommandId] : []));
        } else {
            const stackIds = latestScene.commands
                .filter(c => c.modifiers?.stackId === stackId)
                .map(c => c.id);
            setSelectedCommands(new Set(stackIds));
        }
        if (anchorIndex !== -1) {
            setSelectedCommandIndex(anchorIndex);
            setLastSelectedIndex(anchorIndex);
        }
        setSelectedVariableId(null);
    }, [project, activeSceneId, setSelectedCommandIndex, setSelectedVariableId]);

    // --- Edge auto-scroll while pointer-dragging ---
    const stopAutoScroll = useCallback(() => {
        const a = autoScrollRef.current;
        if (a.raf != null) { cancelAnimationFrame(a.raf); a.raf = null; }
        a.vel = 0;
    }, []);
    const runAutoScroll = useCallback(() => {
        const a = autoScrollRef.current;
        const el = commandListRef.current;
        if (!el || a.vel === 0) { a.raf = null; return; }
        el.scrollTop += a.vel;
        a.raf = requestAnimationFrame(runAutoScroll);
    }, []);
    const updateAutoScroll = useCallback((clientY: number) => {
        const el = commandListRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const EDGE = 60;
        const MAX = 18;
        let vel = 0;
        if (clientY < rect.top + EDGE) {
            vel = -MAX * Math.min(1, (rect.top + EDGE - clientY) / EDGE);
        } else if (clientY > rect.bottom - EDGE) {
            vel = MAX * Math.min(1, (clientY - (rect.bottom - EDGE)) / EDGE);
        }
        const a = autoScrollRef.current;
        a.vel = vel;
        if (vel !== 0) {
            if (a.raf == null) a.raf = requestAnimationFrame(runAutoScroll);
        } else {
            stopAutoScroll();
        }
    }, [runAutoScroll, stopAutoScroll]);

    // --- Commit a pointer-drag reorder (move / stack / into-branch / into-group) ---
    const commitReorder = useCallback((draggedCommandId: string, targetCommandId: string, position: 'before' | 'inside' | 'after') => {
        const scene = project.scenes[activeSceneId];
        if (!scene) return;
        const cmds = scene.commands;
        const draggedCommand = cmds.find(c => c.id === draggedCommandId);
        const targetCommand = cmds.find(c => c.id === targetCommandId);
        const draggedIndex = cmds.findIndex(c => c.id === draggedCommandId);
        const targetIndex = cmds.findIndex(c => c.id === targetCommandId);
        if (!draggedCommand || !targetCommand || draggedIndex === -1 || targetIndex === -1) return;
        if (draggedCommandId === targetCommandId) return;

        if (position === 'inside') {
            // Drop onto a Group → add to group.
            if (targetCommand.type === CommandType.Group) {
                dispatch({ type: 'ADD_COMMAND_TO_GROUP', payload: { sceneId: activeSceneId, groupId: targetCommandId, commandId: draggedCommandId } });
                return;
            }
            // Drop onto a BranchStart → move inside the branch (before its BranchEnd).
            if (targetCommand.type === CommandType.BranchStart) {
                const branchCmd = targetCommand as BranchStartCommand;
                const branchEndIndex = cmds.findIndex((c, i) => i > targetIndex && c.type === CommandType.BranchEnd && (c as BranchEndCommand).branchId === branchCmd.branchId);
                if (branchEndIndex !== -1) {
                    const insertIndex = draggedIndex < branchEndIndex ? branchEndIndex - 1 : branchEndIndex;
                    dispatch({ type: 'MOVE_COMMAND', payload: { sceneId: activeSceneId, fromIndex: draggedIndex, toIndex: insertIndex } });
                    // Auto-expand a collapsed branch so the dropped command is visible.
                    if (branchCmd.isCollapsed) {
                        dispatch({ type: 'TOGGLE_BRANCH_COLLAPSE', payload: { sceneId: activeSceneId, branchId: branchCmd.branchId } });
                    }
                }
                return;
            }
            // Otherwise → stack the two commands.
            const commandsToStack = [targetCommand, draggedCommand];
            const validation = canStackCommands(commandsToStack);
            if (!validation.canStack) {
                setWarningModal({ message: validation.reason || t('editor.cannotStackDefault') });
                return;
            }
            const existingStackId = targetCommand.modifiers?.stackId;
            const stackedCommands = stackCommands(commandsToStack, existingStackId);
            // Apply both stack updates AND make them contiguous in ONE action, so undo/redo
            // treats the whole stack as a single step (no half-stacked intermediate state).
            const stackedCmds = [...cmds];
            stackedCmds[targetIndex] = stackedCommands[0];
            stackedCmds[draggedIndex] = stackedCommands[1];
            const [draggedItem] = stackedCmds.splice(draggedIndex, 1);
            const tIdx = stackedCmds.findIndex(c => c.id === stackedCommands[0].id);
            stackedCmds.splice(tIdx + 1, 0, draggedItem);
            dispatch({ type: 'UPDATE_SCENE_COMMANDS', payload: { sceneId: activeSceneId, commands: stackedCmds } });
            return;
        }

        // before / after — move the whole stack as a block if the dragged command is stacked.
        const draggedStackId = draggedCommand.modifiers?.stackId;
        const blockIds = draggedStackId
            ? cmds.filter((c: VNCommand) => c.modifiers?.stackId === draggedStackId).map((c: VNCommand) => c.id)
            : [draggedCommand.id];

        if (blockIds.length > 1) {
            const blockIdSet = new Set(blockIds);
            if (blockIdSet.has(targetCommandId)) return;
            const block = cmds.filter((c: VNCommand) => blockIdSet.has(c.id));
            const remaining = cmds.filter((c: VNCommand) => !blockIdSet.has(c.id));
            const targetStackId = targetCommand.modifiers?.stackId;
            let insertAt: number;
            if (position === 'before') {
                insertAt = remaining.findIndex((c: VNCommand) => c.id === targetCommandId);
            } else if (targetStackId) {
                let lastIdx = -1;
                remaining.forEach((c: VNCommand, i: number) => { if (c.modifiers?.stackId === targetStackId) lastIdx = i; });
                insertAt = lastIdx + 1;
            } else {
                insertAt = remaining.findIndex((c: VNCommand) => c.id === targetCommandId) + 1;
            }
            if (insertAt < 0) insertAt = remaining.length;
            const newCommands = [...remaining.slice(0, insertAt), ...block, ...remaining.slice(insertAt)];
            dispatch({ type: 'UPDATE_SCENE_COMMANDS', payload: { sceneId: activeSceneId, commands: newCommands } });
        } else {
            // MOVE_COMMAND removes the item first, so when dragging DOWNWARD the target's index
            // shifts back by one — adjust so the command lands exactly where the gap showed.
            let newIndex = position === 'before' ? targetIndex : targetIndex + 1;
            if (draggedCommand.type !== CommandType.BranchStart && draggedIndex < targetIndex) {
                newIndex -= 1;
            }
            dispatch({ type: 'MOVE_COMMAND', payload: { sceneId: activeSceneId, fromIndex: draggedIndex, toIndex: newIndex } });
        }
    }, [project, activeSceneId, dispatch, setWarningModal, t]);

    // Capture top-level row geometry in scroll-independent content space at drag start.
    const buildDragSnapshot = useCallback(() => {
        const el = commandListRef.current;
        if (!el) { dragSnapshotRef.current = null; return; }
        const cTop = el.getBoundingClientRect().top;
        const rows = Array.from(el.querySelectorAll('[data-drop-id]')) as HTMLElement[];
        const items = rows.map(r => {
            const rect = r.getBoundingClientRect();
            return {
                id: r.getAttribute('data-drop-id') as string,
                top: rect.top - cTop + el.scrollTop,
                height: rect.height,
                inside: r.getAttribute('data-drop-inside'),
            };
        });
        dragSnapshotRef.current = { items };
    }, []);

    // --- Figure out the drop target under the pointer during a pointer-drag ---
    // The "stack" (inside) zone is the comfortable middle 50% of a stackable row so it's
    // easy to hit; the outer 25% top/bottom are the before/after insert zones.
    const STACK_ZONE = 0.25;
    const computePointerDropTarget = useCallback((clientX: number, clientY: number): { targetId: string; position: 'before' | 'inside' | 'after'; kind: 'command' | 'branch' | 'group' } | null => {
        const drag = pointerDrag.current;
        if (!drag) return null;
        const el = commandListRef.current;
        const snap = dragSnapshotRef.current;

        // 0) LIVE hit-test for a branch HEADER row first. The snapshot geometry is
        //    captured at drag-start and goes stale once the "make-room" gap resizes
        //    rows, which made dropping INSIDE a branch resolve to before/after (the
        //    command landed OUTSIDE the branch). Using the LIVE rect of the branch
        //    header is immune to that drift. We resolve the FULL before/inside/after
        //    here (top 30% = before, middle 40% = inside, bottom 30% = after) so the
        //    branch still gets the normal make-room GAP for before/after — only the
        //    middle drops INTO it. Inner child rows aren't `data-drop-inside="branch"`,
        //    so reordering within a branch is unaffected.
        const liveEls = document.elementsFromPoint(clientX, clientY) as HTMLElement[];
        const branchHeader = liveEls.find(e =>
            e.getAttribute && e.getAttribute('data-drop-inside') === 'branch' && e.getAttribute('data-drop-id') !== drag.id
        );
        if (branchHeader) {
            const r = branchHeader.getBoundingClientRect();
            const rel = r.height > 0 ? (clientY - r.top) / r.height : 0.5;
            const id = branchHeader.getAttribute('data-drop-id') as string;
            if (rel >= 0.3 && rel <= 0.7) {
                return { targetId: id, position: 'inside', kind: 'branch' };
            }
            // top/bottom thirds → before/after the branch, with the normal gap.
            return { targetId: id, position: rel < 0.5 ? 'before' : 'after', kind: 'command' };
        }

        if (el && snap) {
            const cTop = el.getBoundingClientRect().top;
            const contentY = clientY - cTop + el.scrollTop;
            const rows = snap.items.filter(it => it.id !== drag.id);

            // 1) Directly over a top-level row → before / inside / after (stable: snapshot geometry).
            const within = rows.find(it => contentY >= it.top && contentY <= it.top + it.height);
            if (within) {
                const rel = within.height > 0 ? (contentY - within.top) / within.height : 0.5;
                let position: 'before' | 'inside' | 'after';
                // Middle 50% = inside (stack/group); top/bottom 25% = before/after.
                // (Branch headers are fully resolved in step 0 above via live geometry.)
                if (within.inside && rel >= STACK_ZONE && rel <= 1 - STACK_ZONE) {
                    position = 'inside';
                } else {
                    position = rel < 0.5 ? 'before' : 'after';
                }
                return { targetId: within.id, position, kind: 'command' };
            }

            // 2) In the gutter between rows / above the first → use elementsFromPoint for
            //    branch/group containers (drop inside nested lists) before falling back.
            const els = document.elementsFromPoint(clientX, clientY) as HTMLElement[];
            const containerEl = els.find(e => e.getAttribute && (e.getAttribute('data-branch-container') || e.getAttribute('data-group-container')));
            if (containerEl) {
                const branchTarget = containerEl.getAttribute('data-branch-container');
                if (branchTarget && branchTarget !== drag.id) return { targetId: branchTarget, position: 'inside', kind: 'branch' };
                const groupTarget = containerEl.getAttribute('data-group-container');
                if (groupTarget && groupTarget !== drag.id) return { targetId: groupTarget, position: 'inside', kind: 'group' };
            }

            // 3) Between two rows → insert before the lower one; above the first → before it.
            if (rows.length) {
                if (contentY < rows[0].top) return { targetId: rows[0].id, position: 'before', kind: 'command' };
                for (let i = 0; i < rows.length - 1; i++) {
                    if (contentY > rows[i].top + rows[i].height && contentY < rows[i + 1].top) {
                        return { targetId: rows[i + 1].id, position: 'before', kind: 'command' };
                    }
                }
                const last = rows[rows.length - 1];
                if (contentY > last.top + last.height) {
                    return { targetId: last.id, position: 'after', kind: 'command' };
                }
            }
        }

        // Fallback (no snapshot): scene-bottom drop zone → move to the end.
        const els = document.elementsFromPoint(clientX, clientY) as HTMLElement[];
        const bottomEl = els.find(e => e.getAttribute && e.getAttribute('data-scene-bottom'));
        if (bottomEl) {
            const scene = project.scenes[activeSceneId];
            const lastCmd = scene?.commands[scene.commands.length - 1];
            if (lastCmd && lastCmd.id !== drag.id) return { targetId: lastCmd.id, position: 'after', kind: 'command' };
        }
        return null;
    }, [project, activeSceneId]);

    const handleReorderPointerMove = useCallback((e: PointerEvent) => {
        const drag = pointerDrag.current;
        if (!drag) return;
        if (!drag.active) {
            const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
            if (dist < 5) return; // treat as a click until the pointer moves enough
            drag.active = true;
            justDraggedRef.current = true;
            buildDragSnapshot(); // capture clean geometry before any gap appears
            setDraggedCommandId(drag.id);
            document.body.style.userSelect = 'none';
        }
        const scene = project.scenes[activeSceneId];
        const draggedCmd = scene?.commands.find(c => c.id === drag.id);
        setDragGhost({
            x: e.clientX,
            y: e.clientY,
            label: draggedCmd ? t(`commands:names.${draggedCmd.type}`, { defaultValue: draggedCmd.type.replace(/([A-Z])/g, ' $1').trim() }) : ''
        });
        const drop = computePointerDropTarget(e.clientX, e.clientY);
        drag.drop = drop;
        setDropTarget(drop ? { commandId: drop.targetId, position: drop.position } : null);
        updateAutoScroll(e.clientY);
    }, [project, activeSceneId, t, computePointerDropTarget, updateAutoScroll, buildDragSnapshot]);

    const handleReorderPointerUp = useCallback(() => {
        window.removeEventListener('pointermove', handleReorderPointerMove);
        window.removeEventListener('pointerup', handleReorderPointerUp);
        const drag = pointerDrag.current;
        pointerDrag.current = null;
        dragSnapshotRef.current = null;
        stopAutoScroll();
        setDragGhost(null);
        document.body.style.userSelect = '';
        if (drag?.active && drag.drop) {
            const { targetId, position, kind } = drag.drop;
            if (kind === 'group') {
                dispatch({ type: 'ADD_COMMAND_TO_GROUP', payload: { sceneId: activeSceneId, groupId: targetId, commandId: drag.id } });
            } else if (kind === 'branch') {
                commitReorder(drag.id, targetId, 'inside');
            } else {
                commitReorder(drag.id, targetId, position);
            }
        }
        setDraggedCommandId(null);
        setDropTarget(null);
        // Let the click that follows pointerup know it was a drag (skip re-selecting).
        if (drag?.active) {
            setTimeout(() => { justDraggedRef.current = false; }, 0);
        }
    }, [handleReorderPointerMove, stopAutoScroll, dispatch, activeSceneId, commitReorder]);

    const beginReorderPointerDrag = useCallback((e: React.PointerEvent, commandId: string) => {
        if (e.button !== 0) return;
        // Ignore drags that start on interactive controls (buttons, inputs, the collapse caret, etc.)
        const target = e.target as HTMLElement;
        if (target.closest('button, input, textarea, select, [contenteditable="true"]')) return;
        pointerDrag.current = { id: commandId, startX: e.clientX, startY: e.clientY, active: false, drop: null };
        window.addEventListener('pointermove', handleReorderPointerMove);
        window.addEventListener('pointerup', handleReorderPointerUp);
    }, [handleReorderPointerMove, handleReorderPointerUp]);

    // The "make room" gap shown at the drop point during a pointer-drag (before/after only —
    // an 'inside' drop shows the stack/branch/group highlight instead, so the two read differently).
    const renderReorderGap = (rowId: string, side: 'before' | 'after') => {
        if (!draggedCommandId) return null;
        if (dropTarget?.commandId !== rowId || dropTarget.position !== side) return null;
        return <div className="h-10 my-1 rounded-md border-2 border-dashed border-sky-400 bg-sky-500/15 transition-all duration-150" />;
    };

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
                    toast.success(t('editor.copied', { count: commandsToCopy.length }));
                }
            }

            // Paste (Ctrl+V)
            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard.length > 0 && activeScene) {
                e.preventDefault();
                const currentCommands = activeScene.commands;
                const insertIndex = selectedCommandIndex !== null ? selectedCommandIndex + 1 : currentCommands.length;
                const branchIdRemap = new Map<string, string>();
                const stackIdRemap = new Map<string, string>();
                let insertedCommands = clipboard.map((cmd) => {
                    const cloned = cloneCommand(cmd);
                    cloned.id = generateCommandId();

                    // Remap branchId on EVERY branch marker (start / otherwise-if / otherwise / end)
                    // so a pasted branch + its segments stay one independent group.
                    const originalBranchId = (cmd as { branchId?: string }).branchId;
                    if (originalBranchId && (
                        cloned.type === CommandType.BranchStart ||
                        cloned.type === CommandType.BranchElseIf ||
                        cloned.type === CommandType.BranchElse ||
                        cloned.type === CommandType.BranchEnd
                    )) {
                        let mapped = branchIdRemap.get(originalBranchId);
                        if (!mapped) { mapped = generateBranchId(); branchIdRemap.set(originalBranchId, mapped); }
                        (cloned as { branchId?: string }).branchId = mapped;
                    }

                    // Give pasted parallel stacks fresh stackIds so they don't merge with
                    // the original stack (commands sharing a stackId render as one group).
                    const originalStackId = cmd.modifiers?.stackId;
                    if (originalStackId && cloned.modifiers) {
                        let newStackId = stackIdRemap.get(originalStackId);
                        if (!newStackId) {
                            newStackId = generateStackId();
                            stackIdRemap.set(originalStackId, newStackId);
                        }
                        cloned.modifiers = { ...cloned.modifiers, stackId: newStackId };
                    }

                    return cloned;
                });

                if (insertedCommands.length === 0) {
                    return;
                }

                // A stack needs 2+ members; if only part of a stack was copied, the
                // pasted fragment is a lone "stack of one" — unstack it back to a normal command.
                const pastedStackCounts = new Map<string, number>();
                insertedCommands.forEach(cmd => {
                    const sid = cmd.modifiers?.stackId;
                    if (sid) {
                        pastedStackCounts.set(sid, (pastedStackCounts.get(sid) || 0) + 1);
                    }
                });
                insertedCommands = insertedCommands.map(cmd => {
                    const sid = cmd.modifiers?.stackId;
                    if (sid && pastedStackCounts.get(sid) === 1) {
                        return unstackCommand(cmd);
                    }
                    return cmd;
                });

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
                toast.success(t('editor.pasted', { count: insertedCommands.length }));
            }

            // Delete selected commands (Delete key) — atomic, so non-adjacent
            // selections delete correctly (per-item index dispatches would shift
            // indices mid-loop and remove the wrong commands).
            if (e.key === 'Delete' && selectedCommands.size > 0 && activeScene) {
                e.preventDefault();
                const commands = activeScene.commands;
                const idsToDelete = new Set<VNID>();
                commands.forEach((cmd, index) => {
                    if (!selectedCommands.has(cmd.id)) {
                        return;
                    }
                    if (cmd.type === CommandType.BranchEnd) {
                        // A BranchEnd can't be deleted on its own — only via its BranchStart.
                        return;
                    }
                    idsToDelete.add(cmd.id);
                    if (cmd.type === CommandType.BranchStart) {
                        // Deleting a branch removes ALL its markers (start, otherwise-if/otherwise,
                        // end) and keeps the contents, matching the single-delete reducer behavior.
                        const branchId = (cmd as BranchStartCommand).branchId;
                        commands.forEach(c => {
                            if ((c.type === CommandType.BranchElseIf ||
                                 c.type === CommandType.BranchElse ||
                                 c.type === CommandType.BranchEnd) &&
                                (c as BranchEndCommand).branchId === branchId) {
                                idsToDelete.add(c.id);
                            }
                        });
                    }
                });

                if (idsToDelete.size > 0) {
                    const deleteCount = idsToDelete.size;
                    dispatch({
                        type: 'UPDATE_SCENE_COMMANDS',
                        payload: {
                            sceneId: activeSceneId,
                            commands: commands.filter(c => !idsToDelete.has(c.id))
                        }
                    });
                    setSelectedCommands(new Set());
                    setSelectedCommandIndex(null);
                    setLastSelectedIndex(null);
                    toast.info(t('editor.deleted', { count: deleteCount }));
                }
            }

            // Select All (Ctrl+A)
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                const allIds = new Set(activeScene.commands.map(cmd => cmd.id));
                setSelectedCommands(allIds);
            }

            // Move the selected command(s) up/down WITHOUT dragging (PageUp/PageDown, or Alt+Arrow).
            // Reorders by rebuilding the array (no gap, no drop math). Supports BATCH selection:
            // top-level rows move as a group (a branch travels as one block); commands inside a branch
            // move only within that branch. A selection split across a branch boundary is NOT moved as a
            // unit — the inside-the-branch commands are de-selected so only the outside ones move.
            if (activeScene &&
                (e.key === 'PageUp' || e.key === 'PageDown' || (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')))) {
                const dir = (e.key === 'PageUp' || e.key === 'ArrowUp') ? -1 : 1;
                const cmds = activeScene.commands;
                // Current selection (multi via selectedCommands; fall back to the single anchor index).
                const selIds = selectedCommands.size > 0
                    ? [...selectedCommands]
                    : (selectedCommandIndex !== null && cmds[selectedCommandIndex] ? [cmds[selectedCommandIndex].id] : []);
                if (selIds.length === 0) return;
                // Groups are retired and can use a non-contiguous layout — skip to avoid corrupting them.
                if (cmds.some(c => c.type === CommandType.Group)) return;

                // Top-level slots: a branch is ONE block (BranchStart..BranchEnd); everything else is a single row.
                const slots: Array<[number, number]> = [];
                for (let i = 0; i < cmds.length; i++) {
                    const c = cmds[i];
                    if (c.type === CommandType.BranchStart) {
                        const end = cmds.findIndex((x, j) => j > i && x.type === CommandType.BranchEnd && (x as BranchEndCommand).branchId === (c as BranchStartCommand).branchId);
                        const e2 = end >= 0 ? end : i;
                        slots.push([i, e2]); i = e2;
                    } else {
                        slots.push([i, i]);
                    }
                }
                // For an index, which branch (its BranchStart index) is it strictly inside? null = top-level.
                const branchOf = (i: number): number | null => {
                    for (const [s, en] of slots) { if (en > s && i > s && i < en) return s; }
                    return null;
                };

                // Resolve selected ids → indices, dropping branch markers (they can't move independently).
                const selIndices = selIds
                    .map(id => cmds.findIndex(c => c.id === id))
                    .filter(i => i >= 0 && cmds[i].type !== CommandType.BranchEnd && cmds[i].type !== CommandType.BranchElseIf && cmds[i].type !== CommandType.BranchElse);
                if (selIndices.length === 0) return;

                const topLevelSel = selIndices.filter(i => branchOf(i) === null);
                const interiorSel = selIndices.filter(i => branchOf(i) !== null);

                e.preventDefault();
                let arr: VNCommand[] = cmds;
                let keepIds: string[];
                let deselectedInside = false;

                if (topLevelSel.length > 0) {
                    // A split selection favors the OUTSIDE: drop the inside-a-branch commands.
                    if (interiorSel.length > 0) deselectedInside = true;
                    keepIds = topLevelSel.map(i => cmds[i].id);
                    // Move selected top-level slots as a group (preserving relative order).
                    const headSelected = new Set(topLevelSel);
                    const blocks = slots.map(([a, b]) => cmds.slice(a, b + 1));
                    const selB = slots.map(([a]) => headSelected.has(a));
                    if (dir === -1) {
                        for (let i = 1; i < blocks.length; i++) {
                            if (selB[i] && !selB[i - 1]) {
                                [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]];
                                [selB[i - 1], selB[i]] = [selB[i], selB[i - 1]];
                            }
                        }
                    } else {
                        for (let i = blocks.length - 2; i >= 0; i--) {
                            if (selB[i] && !selB[i + 1]) {
                                [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]];
                                [selB[i + 1], selB[i]] = [selB[i], selB[i + 1]];
                            }
                        }
                    }
                    arr = blocks.flat();
                } else {
                    // All selected commands are inside a branch. Keep one branch only (the anchor's, or the first).
                    const branches = [...new Set(interiorSel.map(i => branchOf(i)!))];
                    const anchorBranch = selectedCommandIndex !== null ? branchOf(selectedCommandIndex) : null;
                    const bs = (anchorBranch !== null && branches.includes(anchorBranch)) ? anchorBranch : branches[0];
                    const keep = interiorSel.filter(i => branchOf(i) === bs);
                    if (keep.length < interiorSel.length) deselectedInside = true;
                    keepIds = keep.map(i => cmds[i].id);
                    const slot = slots.find(([a]) => a === bs)!;
                    const [s, en] = slot;
                    const idsToMove = new Set(keepIds);
                    arr = [...cmds];
                    const isSel = (i: number) => idsToMove.has(arr[i].id);
                    if (dir === -1) {
                        for (let i = s + 1; i <= en - 1; i++) {
                            if (isSel(i) && i - 1 >= s + 1 && !isSel(i - 1)) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; }
                        }
                    } else {
                        for (let i = en - 1; i >= s + 1; i--) {
                            if (isSel(i) && i + 1 <= en - 1 && !isSel(i + 1)) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; }
                        }
                    }
                }

                const changed = arr.length !== cmds.length || arr.some((c, i) => c.id !== cmds[i].id);
                if (changed) {
                    dispatch({ type: 'UPDATE_SCENE_COMMANDS', payload: { sceneId: activeSceneId, commands: arr } });
                }
                // Selection follows the moved commands (and drops anything we de-selected).
                const keepSet = new Set(keepIds);
                setSelectedCommands(keepSet);
                const anchorId = (selectedCommandIndex !== null && cmds[selectedCommandIndex] && keepSet.has(cmds[selectedCommandIndex].id))
                    ? cmds[selectedCommandIndex].id
                    : keepIds[0];
                const newAnchor = arr.findIndex(c => c.id === anchorId);
                setSelectedCommandIndex(newAnchor >= 0 ? newAnchor : null);
                setLastSelectedIndex(newAnchor >= 0 ? newAnchor : null);
                if (deselectedInside) {
                    toast.info(t('editor.branchSelectionTrimmed', { defaultValue: "Commands inside a branch can't move with the others — they were de-selected." }));
                }
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
                // If the command was dropped INTO a collapsed branch, expand it so the
                // user sees where it landed (mirrors the pointer-drag behaviour).
                if (branchMeta && (position === 'inside' || (position === 'after' && branchMeta.isEmpty))
                    && (targetCommand as BranchStartCommand)?.isCollapsed) {
                    dispatch({ type: 'TOGGLE_BRANCH_COLLAPSE', payload: { sceneId: activeSceneId, branchId: (targetCommand as BranchStartCommand).branchId } });
                }
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
                    setWarningModal({ message: validation.reason || t('editor.cannotStackDefault') });
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

                // CRITICAL: stacked commands must be CONTIGUOUS for the runtime to run them in
                // parallel — a `runAsync` command advances immediately to the very NEXT command,
                // so anything between them runs (and may block) before the rest of the stack.
                // Move the dragged command to sit right after the target. (toIndex is applied
                // after the from-removal splice, hence the from<target adjustment.)
                const contiguousIndex = draggedIndex < targetIndex ? targetIndex : targetIndex + 1;
                if (draggedIndex !== contiguousIndex) {
                    dispatch({
                        type: 'MOVE_COMMAND',
                        payload: { sceneId: activeSceneId, fromIndex: draggedIndex, toIndex: contiguousIndex },
                    });
                }
            }
        } else {
            // Move command. If the dragged command belongs to a parallel stack, move the
            // ENTIRE stack as one contiguous block (otherwise only its first member would
            // move and the stack would split).
            const draggedStackId = draggedCommand.modifiers?.stackId;
            const blockIds = draggedStackId
                ? activeScene.commands.filter((c: VNCommand) => c.modifiers?.stackId === draggedStackId).map((c: VNCommand) => c.id)
                : [draggedCommand.id];

            if (blockIds.length > 1) {
                const blockIdSet = new Set(blockIds);

                // Can't drop a stack onto itself.
                if (blockIdSet.has(targetCommandId)) {
                    dragItem.current = null;
                    setDraggedCommandId(null);
                    setDropTarget(null);
                    return;
                }

                const block = activeScene.commands.filter((c: VNCommand) => blockIdSet.has(c.id));
                const remaining = activeScene.commands.filter((c: VNCommand) => !blockIdSet.has(c.id));

                // Insert relative to the WHOLE target stack (if the target is itself stacked),
                // so we never land between another stack's members.
                const targetStackId = targetCommand.modifiers?.stackId;
                let insertAt: number;
                if (position === 'before') {
                    insertAt = remaining.findIndex((c: VNCommand) => c.id === targetCommandId);
                } else if (targetStackId) {
                    let lastIdx = -1;
                    remaining.forEach((c: VNCommand, i: number) => { if (c.modifiers?.stackId === targetStackId) lastIdx = i; });
                    insertAt = lastIdx + 1;
                } else {
                    insertAt = remaining.findIndex((c: VNCommand) => c.id === targetCommandId) + 1;
                }
                if (insertAt < 0) {
                    insertAt = remaining.length;
                }

                const newCommands = [
                    ...remaining.slice(0, insertAt),
                    ...block,
                    ...remaining.slice(insertAt)
                ];
                dispatch({
                    type: 'UPDATE_SCENE_COMMANDS',
                    payload: { sceneId: activeSceneId, commands: newCommands }
                });
            } else {
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
        const scene = project.scenes[activeSceneId];
        if (!scene) return;
        const command = scene.commands.find(cmd => cmd.id === commandId);
        if (!command) return;

        const stackId = command.modifiers?.stackId;
        let newCommands = scene.commands.map(c => c.id === commandId ? unstackCommand(c) : c);
        // A stack needs 2+ members — if only one is left, unstack it too.
        if (stackId) {
            const remaining = newCommands.filter(c => c.modifiers?.stackId === stackId);
            if (remaining.length === 1) {
                newCommands = newCommands.map(c => c.id === remaining[0].id ? unstackCommand(c) : c);
            }
        }
        // Single action → one clean undo/redo step (and unlike before, this actually applies:
        // the old UPDATE_COMMAND payload used `commandId`/`updates`, which the reducer ignored).
        dispatch({ type: 'UPDATE_SCENE_COMMANDS', payload: { sceneId: activeSceneId, commands: newCommands } });
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
        dispatch({ type: 'TOGGLE_BRANCH_COLLAPSE', payload: { sceneId: activeSceneId, branchId } });
    };

    // Add an "Otherwise if" / "Otherwise" segment to a branch. Markers share the branch's id.
    // Otherwise-if is inserted before any Otherwise; Otherwise is inserted just before End.
    const handleAddBranchSegment = (branchId: string, segType: CommandType.BranchElseIf | CommandType.BranchElse) => {
        const scene = project.scenes[activeSceneId];
        if (!scene) return;
        const branchEndIndex = scene.commands.findIndex(c => c.type === CommandType.BranchEnd && (c as BranchEndCommand).branchId === branchId);
        if (branchEndIndex === -1) return;
        let insertAt = branchEndIndex;
        if (segType === CommandType.BranchElseIf) {
            const elseIdx = scene.commands.findIndex(c => c.type === CommandType.BranchElse && (c as BranchElseCommand).branchId === branchId);
            if (elseIdx !== -1) insertAt = elseIdx;
        }
        const marker = createCommandWithId(segType, { branchId });
        if (marker) {
            insertCommandsIntoScene([marker], insertAt);
        }
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
            title={t('editor.title')}
            className={className}
            isCollapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
        >
            <p>{t('editor.selectToStart')}</p>
        </Panel>
    );

    const visibleCommands = getVisibleCommands();

    const hasConditions = activeScene.conditions && activeScene.conditions.length > 0;
    const hasCustomTransition = activeScene.outTransition && activeScene.outTransition !== 'fade';

    return (
        <Panel 
            title={t('editor.titleNamed', { name: activeScene.name })}
            className={`flex-grow min-h-0 ${className || ''}`}
            isCollapsed={isCollapsed} 
            onToggleCollapse={onToggleCollapse}
            rightHeaderContent={
                <button
                    onClick={onConfigureScene}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                        hasConditions || hasCustomTransition
                            ? 'bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30 hover:bg-[var(--accent-cyan)]/25'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/40'
                    }`}
                    title={t('editor.configureSettings')}
                >
                    <AdjustmentsIcon className="w-4 h-4" />
                    <span>{t('editor.settings')}</span>
                </button>
            }
        >
            <div className="flex flex-col h-full">
                {hasConditions && (
                    <div className="mb-2 p-2 bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/30 rounded-md text-sm">
                        <div className="flex items-center gap-1">
                            <AdjustmentsIcon className="w-4 h-4 text-[var(--accent-cyan)]" />
                            <span className="text-[var(--text-secondary)]">
                                {t('editor.hasConditions', { count: activeScene.conditions.length })}
                            </span>
                        </div>
                    </div>
                )}
                <div
                    ref={commandListRef}
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
                            const stackCommands = stack.commands;
                            globalIndex += stackCommands.length;
                            
                            // Get the real index from the original commands array
                            const realCommandIndex = activeScene.commands.findIndex(c => c.id === stackCommands[0].id);

                            if (stack.isStacked) {
                                // Render stacked commands horizontally
                                return (
                                    <div
                                        key={stack.stackId || stackCommands[0].id}
                                        className={`relative ${draggedCommandId && dropTarget?.commandId === stackCommands[0].id && dropTarget.position === 'inside' ? 'rounded-lg ring-2 ring-purple-500 ring-offset-2 ring-offset-[var(--bg-primary)]' : ''}`}
                                        data-drop-id={stackCommands[0].id}
                                        data-drop-inside="stack"
                                        onPointerDown={(e) => beginReorderPointerDrag(e, stackCommands[0].id)}
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
                                    >
                                        {renderReorderGap(stackCommands[0].id, 'before')}
                                        {dropTarget?.commandId === stackCommands[0].id && (!draggedCommandId || dropTarget.position === 'inside') && (
                                            <DragDropIndicator
                                                position={dropTarget.position}
                                                canDrop={true}
                                                message={
                                                    dropTarget.position === 'inside'
                                                        ? '⊕ Add to Stack'
                                                        : dropTarget.position === 'before'
                                                            ? '↑ Place Above'
                                                            : '↓ Place Below'
                                                }
                                            />
                                        )}
                                        <CommandStackRow
                                            commands={stackCommands}
                                            project={project}
                                            selectedCommandIndex={selectedCommandIndex}
                                            selectedCommands={selectedCommands}
                                            startIndex={realCommandIndex}
                                            allCommands={activeScene.commands}
                                            onSelectCommand={handleCommandSelect}
                                            onSelectStack={handleSelectWholeStack}
                                            onUnstackCommand={handleUnstackCommand}
                                            onCommandContextMenu={handleCommandContextMenu}
                                        />
                                        {renderReorderGap(stackCommands[0].id, 'after')}
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
                                const canStackThis = !isGroup && !isBranchStart && canRunAsync(cmd.type);
                                const insideKind = isGroup ? 'group' : isBranchStart ? 'branch' : (canStackThis ? 'stack' : undefined);

                                return (
                                    <div key={cmd.id} className="relative">
                                        <div
                                            onClick={(e) => handleCommandSelect(index, e)}
                                            onContextMenu={(e) => handleCommandContextMenu(index, e)}
                                            data-drop-id={cmd.id}
                                            {...(insideKind ? { 'data-drop-inside': insideKind } : {})}
                                            onPointerDown={(e) => beginReorderPointerDrag(e, cmd.id)}
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
                                            className={`cursor-pointer ${draggedCommandId && dropTarget?.commandId === cmd.id && dropTarget.position === 'inside' ? 'rounded-lg ring-2 ring-purple-500 ring-offset-2 ring-offset-[var(--bg-primary)]' : ''}`}
                                        >
                                            {renderReorderGap(cmd.id, 'before')}
                                            {dropTarget?.commandId === cmd.id && (!draggedCommandId || dropTarget.position === 'inside') && (
                                                <DragDropIndicator
                                                    position={dropTarget.position}
                                                    canDrop={dropTarget.position !== 'inside' || (isGroup || isBranchStart ? true : canStackThis)}
                                                    message={
                                                        dropTarget.position === 'inside'
                                                            ? isGroup
                                                                ? '⊞ Add to Group'
                                                                : isBranchStart
                                                                    ? '⤙ Add to Branch'
                                                                    : canStackThis
                                                                        ? '⊕ Stack Here'
                                                                        : `✗ Can't stack here`
                                                            : dropTarget.position === 'before'
                                                                ? '↑ Place Above'
                                                                : '↓ Place Below'
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
                                            {renderReorderGap(cmd.id, 'after')}
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
                                                    data-branch-container={cmd.id}
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
                                                    <div className="flex justify-end items-center gap-1 mb-2">
                                                        <button
                                                            onClick={() => handleAddBranchSegment(branchCmd.branchId, CommandType.BranchElseIf)}
                                                            className="px-2 py-1 rounded text-[10px] font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/50"
                                                            title={t('branch.addOtherwiseIfTitle')}
                                                        >
                                                            {t('branch.addOtherwiseIf')}
                                                        </button>
                                                        {!branchCommands.some(c => c.type === CommandType.BranchElse) && (
                                                            <button
                                                                onClick={() => handleAddBranchSegment(branchCmd.branchId, CommandType.BranchElse)}
                                                                className="px-2 py-1 rounded text-[10px] font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/50"
                                                                title={t('branch.addOtherwiseTitle')}
                                                            >
                                                                {t('branch.addOtherwise')}
                                                            </button>
                                                        )}
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

                                                                // "Otherwise if" / "Otherwise" segment headers (split the branch body into segments)
                                                                if (branchChildCmd.type === CommandType.BranchElseIf || branchChildCmd.type === CommandType.BranchElse) {
                                                                    const isElseIf = branchChildCmd.type === CommandType.BranchElseIf;
                                                                    const segConds = (branchChildCmd as BranchElseIfCommand).conditions;
                                                                    const segSelected = childIndex === selectedCommandIndex;
                                                                    return (
                                                                        <div key={branchChildCmd.id} className="relative">
                                                                            <div className="absolute -left-[21px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 pointer-events-none" style={{ borderColor: branchColor, backgroundColor: segSelected ? branchColor : 'var(--bg-primary)' }} />
                                                                            <div className="absolute -left-[14px] top-1/2 w-[10px] h-[2px] pointer-events-none" style={{ backgroundColor: branchColor }} />
                                                                            <div
                                                                                onClick={(e) => { e.stopPropagation(); setSelectedCommands(new Set([branchChildCmd.id])); setLastSelectedIndex(childIndex); setSelectedCommandIndex(childIndex); setSelectedVariableId(null); }}
                                                                                className={`group flex items-center gap-2 py-1 px-2 rounded cursor-pointer border-2 border-dashed ${segSelected ? 'ring-2 ring-sky-400' : ''}`}
                                                                                style={{ borderColor: branchColor, backgroundColor: `${branchColor}1a` }}
                                                                                title={isElseIf ? t('branch.segElseIfTitle') : t('branch.segElseTitle')}
                                                                            >
                                                                                <span className="text-xs font-bold" style={{ color: branchColor }}>{isElseIf ? t('branch.otherwiseIf') : t('branch.otherwise')}</span>
                                                                                {isElseIf && (
                                                                                    <span className="text-xs text-[var(--text-secondary)] truncate">
                                                                                        {segConds && segConds.length > 0 ? describeConditions(segConds, project.variables) : t('branch.setCondition')}
                                                                                    </span>
                                                                                )}
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); dispatch({ type: 'DELETE_COMMAND', payload: { sceneId: activeSceneId, commandIndex: childIndex } }); }}
                                                                                    className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded flex-shrink-0"
                                                                                    title={t('branch.removeSegment')}
                                                                                >
                                                                                    <span className="text-red-400 text-xs">✕</span>
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }
                                                                return (
                                                                    <div key={branchChildCmd.id} className="relative">
                                                                        {renderReorderGap(branchChildCmd.id, 'before')}
                                                                        <div
                                                                            data-drop-id={branchChildCmd.id}
                                                                            onPointerDown={(e) => beginReorderPointerDrag(e, branchChildCmd.id)}
                                                                            onClick={(e) => { e.stopPropagation(); handleCommandSelect(childIndex, e); }}
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
                                                                            <CommandItem
                                                                                command={branchChildCmd}
                                                                                project={project}
                                                                                isSelected={childIndex === selectedCommandIndex}
                                                                                isInMultiSelection={selectedCommands.has(branchChildCmd.id) && selectedCommands.size > 1}
                                                                                depth={1}
                                                                                collapsedBranches={collapsedBranches}
                                                                            />
                                                                        </div>
                                                                        {renderReorderGap(branchChildCmd.id, 'after')}
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
                                                                {dropTarget?.commandId === `branch-bottom-${branchCmd.branchId}` ? '↓ Drop at End' : 'Drop zone'}
                                                            </div>
                                                        </>
                                                    )}
                                                    {/* Clear visual end-of-branch marker */}
                                                    <div className="pt-1 text-[10px] uppercase tracking-wide font-semibold opacity-60 select-none" style={{ color: branchColor }}>
                                                        {t('branch.endOf', { name: branchCmd.name || t('branch.unnamed') })}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        {/* Render group contents if it's a group and not collapsed */}
                                        {isGroup && groupCmd && !groupCmd.collapsed && (
                                            <div className="ml-6 mt-2 space-y-2 border-l-2 border-amber-500/30 pl-2" data-group-container={cmd.id}>
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
                                                                            ? '↑ Place Above' 
                                                                            : '↓ Place Below'
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
                                                        {dropTarget?.commandId === `group-bottom-${cmd.id}` ? '↓ Drop at End' : 'Drop zone'}
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
                        data-scene-bottom="1"
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
                                // A Branch MUST be created as a BranchStart + BranchEnd pair, or it
                                // renders with no body (no Add menu, rejects drops). The scene-bottom
                                // zone previously added a lone BranchStart — the bug behind "branches
                                // only work when dropped into the first spot". Mirror the row-drop path.
                                if (paletteCommandType === CommandType.BranchStart) {
                                    const branchId = generateBranchId();
                                    const branchStart = createCommandWithId(CommandType.BranchStart, { branchId });
                                    const branchEnd = createCommandWithId(CommandType.BranchEnd, { branchId });
                                    if (branchStart && branchEnd) {
                                        insertCommandsIntoScene([branchStart, branchEnd], activeScene.commands.length);
                                    }
                                } else {
                                    const newCommand = createCommandWithId(paletteCommandType as CommandType);
                                    if (newCommand) {
                                        insertCommandsIntoScene([newCommand], activeScene.commands.length);
                                    }
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
                        <p className="text-[var(--text-muted)] text-xs italic">
                            {dropTarget?.commandId === 'scene-bottom' 
                                ? '↓ Drop here to add command' 
                                : activeScene.commands.length === 0 
                                    ? 'Drag commands here to start' 
                                    : 'Drop zone'
                            }
                        </p>
                    </div>
                </div>
            </div>

            {/* Floating ghost that follows the cursor while pointer-dragging a command */}
            {dragGhost && (
                <div
                    className="fixed z-[10000] pointer-events-none px-3 py-1.5 rounded-md bg-sky-500 text-white text-xs font-bold shadow-lg shadow-sky-500/50 translate-x-3 -translate-y-1/2 max-w-[200px] truncate"
                    style={{ left: dragGhost.x, top: dragGhost.y }}
                >
                    {dragGhost.label}
                </div>
            )}

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
                        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-4">{t('editor.cannotStackTitle')}</h3>
                        <p className="text-[var(--text-secondary)] mb-6">{warningModal.message}</p>
                        <button
                            onClick={() => setWarningModal(null)}
                            className="w-full bg-[var(--accent-cyan)] hover:opacity-80 text-white font-bold py-2 px-4 rounded-lg transition-opacity"
                        >
                            {t('common:ok')}
                        </button>
                    </div>
                </div>
            )}
        </Panel>
    );
};

export default SceneEditor;