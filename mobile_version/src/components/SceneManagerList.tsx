import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useInlineRename } from '../hooks/useInlineRename';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNScene, VNCommand, CommandType } from '../features/scene/types';
import { useProject } from '../contexts/ProjectContext';
import { useToast } from '../contexts/ToastContext';
import SceneEditor from './SceneEditor';
import StagingArea from './StagingArea';
import CommandPalette, { getCommandColor } from './CommandPalette';
import { PlusIcon, TrashIcon, BookOpenIcon, PencilIcon, SparkleIcon, DuplicateIcon, ChevronRightIcon, ChevronDownIcon } from './icons';
import { ContextMenu } from './ui/ContextMenu';
import { CommandRadialProvider } from './inspector/CommandRadialContext';
import { isManagerWindow, isMultiWindowSupported, openManagerWindow, onPanelWindowState } from '../utils/windowManager';

const EXPANDED_SCENES_STORAGE_KEY = 'flourish.sceneManager.expandedScenes';

// Short type chip shown next to each command in the scene tree (fallback: initials from the type name).
const COMMAND_CHIP: Partial<Record<string, string>> = {
    [CommandType.Dialogue]: 'DLG', [CommandType.Choice]: 'CHO',
    [CommandType.ShowCharacter]: 'CHR', [CommandType.HideCharacter]: 'CHR', [CommandType.MoveCharacter]: 'CHR',
    [CommandType.SetBackground]: 'BG', [CommandType.ShowImage]: 'IMG', [CommandType.HideImage]: 'IMG',
    [CommandType.ShowText]: 'TXT', [CommandType.HideText]: 'TXT',
    [CommandType.ShowButton]: 'BTN', [CommandType.HideButton]: 'BTN', [CommandType.ShowItem]: 'ITM',
    [CommandType.PlayMusic]: 'MUS', [CommandType.StopMusic]: 'MUS',
    [CommandType.PlaySoundEffect]: 'SFX', [CommandType.StopSoundEffect]: 'SFX',
    [CommandType.PlayMovie]: 'MOV', [CommandType.StopMovie]: 'MOV',
    [CommandType.Jump]: 'JMP', [CommandType.Label]: 'LBL', [CommandType.JumpToLabel]: 'LBL',
    [CommandType.SetVariable]: 'VAR', [CommandType.TextInput]: 'INP', [CommandType.Wait]: 'WAI',
    [CommandType.BranchStart]: 'IF', [CommandType.BranchElseIf]: 'IF', [CommandType.BranchElse]: 'IF', [CommandType.BranchEnd]: 'IF',
    [CommandType.ShowScreen]: 'SCR', [CommandType.HideScreen]: 'SCR', [CommandType.CallCommonEvent]: 'EVT',
};
const commandChip = (type: string): string =>
    COMMAND_CHIP[type] || (type.replace(/[a-z]/g, '').slice(0, 3) || type.slice(0, 3)).toUpperCase();

/** Compact one-line description of a command for the scene tree — the key content only
 *  (the full plain-language summaries live on the command rows in the scene editor). */
const commandTreeSummary = (cmd: any, project: VNProject): string => {
    switch (cmd.type as CommandType) {
        case CommandType.Dialogue: {
            const speaker = cmd.characterId ? (project.characters[cmd.characterId]?.name || '') : '';
            return `${speaker ? speaker + ': ' : ''}${cmd.text || ''}`;
        }
        case CommandType.Choice:
            return cmd.prompt || (cmd.options || []).map((o: any) => o.text).filter(Boolean).join(' / ');
        case CommandType.ShowCharacter:
        case CommandType.HideCharacter:
        case CommandType.MoveCharacter:
            return project.characters[cmd.characterId]?.name || '';
        case CommandType.SetBackground:
            return project.backgrounds[cmd.backgroundId]?.name || project.images?.[cmd.backgroundId]?.name || '';
        case CommandType.ShowImage:
            return project.images?.[cmd.imageId]?.name || project.backgrounds[cmd.imageId]?.name || '';
        case CommandType.ShowText:
        case CommandType.ShowButton:
            return cmd.text || '';
        case CommandType.PlayMusic:
        case CommandType.PlaySoundEffect:
            return project.audio[cmd.audioId]?.name || '';
        case CommandType.PlayMovie:
            return project.videos[cmd.videoId]?.name || '';
        case CommandType.Jump:
            return project.scenes[cmd.targetSceneId]?.name || '';
        case CommandType.Label:
        case CommandType.JumpToLabel:
            return cmd.labelId || '';
        case CommandType.SetVariable:
            return project.variables[cmd.variableId]?.name || '';
        case CommandType.ShowScreen:
        case CommandType.HideScreen:
            return project.uiScreens[cmd.screenId]?.name || '';
        case CommandType.CallCommonEvent:
            return project.commonEvents?.[cmd.commonEventId]?.name || '';
        default:
            return '';
    }
};

/** One node of the scene-tree command outline: a command + its flat index (for jump-to) and, for
 *  branches, the nested commands inside the IF…End Branch span. */
type CmdTreeNode = { cmd: VNCommand; index: number; children: CmdTreeNode[] };

/** Nest BranchStart…BranchEnd spans so branches expand in the tree. Else-if/Else stay as section
 *  rows INSIDE the branch (they're real, clickable commands); End Branch rows are structural noise
 *  and dropped from the outline. Handles nested branches; an unclosed branch swallows to the end. */
const buildCommandTree = (commands: VNCommand[]): CmdTreeNode[] => {
    let i = 0;
    const walk = (isTop: boolean): CmdTreeNode[] => {
        const nodes: CmdTreeNode[] = [];
        while (i < commands.length) {
            const cmd = commands[i];
            if (cmd.type === CommandType.BranchEnd) {
                if (isTop) { i++; continue; } // stray end with no open branch — skip the row
                return nodes; // the caller consumes the matching End
            }
            if (cmd.type === CommandType.BranchStart) {
                const index = i;
                i++;
                const children = walk(false);
                if (i < commands.length && commands[i].type === CommandType.BranchEnd) i++;
                nodes.push({ cmd, index, children });
                continue;
            }
            nodes.push({ cmd, index: i, children: [] });
            i++;
        }
        return nodes;
    };
    return walk(true);
};

export interface SceneManagerProps {
    project: VNProject;
    activeSceneId: VNID;
    setActiveSceneId: (id: VNID) => void;
    selectedCommandIndex: number | null;
    setSelectedCommandIndex: (index: number | null) => void;
    setSelectedVariableId: (id: VNID | null) => void;
    onConfigureScene: () => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    /** "Play from here": start test play at this command index in the active scene. */
    onPlayFromHere?: (index: number) => void;
    /** The List ⇄ Map view toggle, rendered by the SceneManager router. */
    headerSlot?: React.ReactNode;
}

const SceneManagerList: React.FC<SceneManagerProps> = ({
    project,
    activeSceneId,
    setActiveSceneId,
    selectedCommandIndex,
    setSelectedCommandIndex,
    setSelectedVariableId,
    onConfigureScene,
    isCollapsed,
    onToggleCollapse,
    onPlayFromHere,
    headerSlot
}) => {
    const { dispatch } = useProject();
    const toast = useToast();
    const { t } = useTranslation(['scenes', 'common']);
    const [renamingId, setRenamingId] = useState<VNID | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sceneId: VNID } | null>(null);
    const [draggedSceneId, setDraggedSceneId] = useState<VNID | null>(null);
    const [dropTargetId, setDropTargetId] = useState<VNID | null>(null);

    // Expansion state for the scene tree (command children) — persisted like the screen tree's.
    const [expandedScenes, setExpandedScenes] = useState<Set<VNID>>(() => {
        try {
            const raw = localStorage.getItem(EXPANDED_SCENES_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return Array.isArray(parsed) ? new Set(parsed as VNID[]) : new Set();
        } catch { return new Set(); }
    });
    useEffect(() => {
        try { localStorage.setItem(EXPANDED_SCENES_STORAGE_KEY, JSON.stringify(Array.from(expandedScenes))); } catch { /* ignore */ }
    }, [expandedScenes]);
    const toggleSceneExpanded = (sceneId: VNID) => {
        setExpandedScenes(prev => {
            const next = new Set(prev);
            if (next.has(sceneId)) next.delete(sceneId); else next.add(sceneId);
            return next;
        });
    };

    // When the scene canvas is popped into its own window, hide the inline staging area so the command
    // list gets the full center column (the floating canvas docks beside the editor instead).
    const [canvasPoppedOut, setCanvasPoppedOut] = useState<boolean>(() => !!((window as any).__FLOURISH_PANELS_OPEN__?.canvas));
    useEffect(() => {
        onPanelWindowState((panels) => setCanvasPoppedOut(!!panels?.canvas));
    }, []);

    const scenesArray = useMemo(() => Object.values(project.scenes) as VNScene[], [project.scenes]);

    const addScene = () => {
        const name = t('newSceneName', { n: Object.keys(project.scenes).length + 1 });
        dispatch({ type: 'ADD_SCENE', payload: { name } });
    };

    const handleDeleteScene = (sceneId: VNID) => {
        if (Object.keys(project.scenes).length <= 1) {
            toast.warning(t('cannotDeleteLast'));
            return;
        }
        dispatch({ type: 'DELETE_SCENE', payload: { sceneId } });
    };

    const handleDuplicateScene = (sceneId: VNID) => {
        dispatch({ type: 'DUPLICATE_SCENE', payload: { sceneId } });
    };

    const handleRenameScene = (sceneId: VNID, name: string) => {
        dispatch({ type: 'UPDATE_SCENE', payload: { sceneId, name } });
        setRenamingId(null);
    };

    const handleSetStartScene = (sceneId: VNID) => {
        dispatch({ type: 'SET_START_SCENE', payload: { sceneId } });
    };

    const handleDragStart = (sceneId: VNID) => {
        setDraggedSceneId(sceneId);
    };

    const handleDragOver = (e: React.DragEvent, sceneId: VNID) => {
        e.preventDefault();
        if (draggedSceneId && draggedSceneId !== sceneId) {
            setDropTargetId(sceneId);
        }
    };

    const handleDragLeave = () => {
        setDropTargetId(null);
    };

    const handleDrop = (e: React.DragEvent, targetSceneId: VNID) => {
        e.preventDefault();
        if (!draggedSceneId || draggedSceneId === targetSceneId) {
            setDraggedSceneId(null);
            setDropTargetId(null);
            return;
        }

        const sceneIds = scenesArray.map(s => s.id);
        const fromIndex = sceneIds.indexOf(draggedSceneId);
        const toIndex = sceneIds.indexOf(targetSceneId);

        if (fromIndex !== -1 && toIndex !== -1) {
            const newSceneIds = [...sceneIds];
            newSceneIds.splice(fromIndex, 1);
            newSceneIds.splice(toIndex, 0, draggedSceneId);
            dispatch({ type: 'REORDER_SCENES', payload: { sceneIds: newSceneIds } });
        }

        setDraggedSceneId(null);
        setDropTargetId(null);
    };

    const handleContextMenu = (e: React.MouseEvent, sceneId: VNID) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, sceneId });
    };

    return (
        <CommandRadialProvider activeSceneId={activeSceneId} setSelectedCommandIndex={setSelectedCommandIndex}>
        <div className="flex h-full overflow-hidden">
            {/* Left Sidebar - Scene List (2/3) + Command Palette (1/3) */}
            <div className="panel border-r-2 border-[var(--border-subtle)] flex flex-col flex-shrink-0" style={{ width: 'var(--sidebar-width)', minWidth: '240px', maxWidth: '320px' }}>
                {/* Scene List - 2/3 */}
                <div className="flex-[2] flex flex-col border-b-2 border-[var(--border-subtle)] min-h-0">
                    <div className="px-1.5 py-1 border-b border-[var(--border-subtle)] flex-shrink-0 flex items-center justify-between gap-1">
                        <h2 className="text-xs font-bold text-white flex items-center gap-1">
                            <BookOpenIcon className="w-3 h-3" />
                            {t('listTitle')}
                        </h2>
                        {headerSlot}
                    </div>

                    <div className="flex-1 overflow-y-auto px-1.5 py-1 space-y-0.5 min-h-0">
                        {scenesArray.map(scene => (
                            <SceneItem
                                key={scene.id}
                                scene={scene}
                                isSelected={activeSceneId === scene.id}
                                isStartScene={project.startSceneId === scene.id}
                                isRenaming={renamingId === scene.id}
                                isDragging={draggedSceneId === scene.id}
                                isDropTarget={dropTargetId === scene.id}
                                onSelect={() => setActiveSceneId(scene.id)}
                                onStartRenaming={() => setRenamingId(scene.id)}
                                onCommitRename={(name) => handleRenameScene(scene.id, name)}
                                onDelete={() => handleDeleteScene(scene.id)}
                                onDuplicate={() => handleDuplicateScene(scene.id)}
                                onSetStartScene={() => handleSetStartScene(scene.id)}
                                onDragStart={() => handleDragStart(scene.id)}
                                onDragOver={(e) => handleDragOver(e, scene.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, scene.id)}
                                onContextMenu={(e) => handleContextMenu(e, scene.id)}
                                isExpanded={expandedScenes.has(scene.id)}
                                onToggleExpanded={() => toggleSceneExpanded(scene.id)}
                                selectedCommandIndex={activeSceneId === scene.id ? selectedCommandIndex : null}
                                project={project}
                                onSelectCommand={(index) => {
                                    // ORDER MATTERS: selecting the scene clears the command index,
                                    // so set the index AFTER (same as the variable X-ray jump).
                                    setActiveSceneId(scene.id);
                                    setSelectedCommandIndex(index);
                                }}
                            />
                        ))}
                    </div>

                    <div className="px-1.5 py-1 border-t border-[var(--border-subtle)] flex-shrink-0">
                        <button
                            onClick={addScene}
                            className="w-full bg-sky-500 hover:bg-sky-600 text-white py-1 px-1.5 rounded text-xs flex items-center justify-center gap-1 font-bold transition-colors"
                        >
                            <PlusIcon className="w-3 h-3" />
                            {t('common:add')}
                        </button>
                    </div>
                </div>

                {/* Command Palette - 1/3 */}
                <div className="flex-[1] flex flex-col min-h-0">
                    <CommandPalette onDragStart={(commandType) => console.log('Dragging:', commandType)} />
                </div>
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    options={[
                        {
                            label: t('common:rename'),
                            icon: <PencilIcon className="w-4 h-4" />,
                            onClick: () => setRenamingId(contextMenu.sceneId)
                        },
                        {
                            label: t('common:duplicate'),
                            icon: <DuplicateIcon className="w-4 h-4" />,
                            onClick: () => handleDuplicateScene(contextMenu.sceneId)
                        },
                        {
                            label: project.startSceneId === contextMenu.sceneId ? t('startSceneMarked') : t('setAsStartScene'),
                            icon: <SparkleIcon className="w-4 h-4" />,
                            onClick: () => handleSetStartScene(contextMenu.sceneId)
                        },
                        {
                            label: t('common:delete'),
                            icon: <TrashIcon className="w-4 h-4" />,
                            onClick: () => handleDeleteScene(contextMenu.sceneId),
                            disabled: Object.keys(project.scenes).length <= 1,
                            warning: Object.keys(project.scenes).length <= 1 ? t('cannotDeleteLastShort') : undefined
                        }
                    ]}
                />
            )}

            {/* Center - Staging Area (top) + Scene Editor (bottom) */}
            <div className="flex-1 flex flex-col min-w-[600px] panel border-r-2 overflow-hidden">
                {/* Staging Area - Top - 60% (hidden while the canvas is popped out into its own window) */}
                {!canvasPoppedOut && (
                    <div className="flex-[3] flex flex-col border-b-2 border-[var(--border-subtle)] min-h-0 overflow-hidden">
                        <div className="relative h-full p-2 overflow-hidden">
                            {isMultiWindowSupported() && !isManagerWindow() && (
                                <button
                                    onClick={() => openManagerWindow('canvas')}
                                    title={t('common:popOutCanvas', { defaultValue: 'Open the canvas in its own window' })}
                                    className="absolute top-3.5 right-3.5 z-20 w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-black/30 hover:bg-black/50 border border-[var(--border-subtle)] transition-all"
                                >
                                    ⧉
                                </button>
                            )}
                            <StagingArea
                                project={project}
                                activeSceneId={activeSceneId}
                                selectedCommandIndex={selectedCommandIndex}
                                onSelectCommand={setSelectedCommandIndex}
                                className="h-full w-full border-2 border-[var(--border-subtle)] rounded-lg"
                                style={{ height: '100%' }}
                            />
                        </div>
                    </div>
                )}

                {/* Scene Editor - Bottom - 40% */}
                <div className="flex-[2] flex flex-col overflow-hidden min-h-0">
                    <div className="flex-1 overflow-y-auto min-h-0">
                        <SceneEditor
                            activeSceneId={activeSceneId}
                            selectedCommandIndex={selectedCommandIndex}
                            setSelectedCommandIndex={setSelectedCommandIndex}
                            setSelectedVariableId={setSelectedVariableId}
                            onConfigureScene={onConfigureScene}
                            isCollapsed={false}
                            onToggleCollapse={onToggleCollapse}
                            onPlayFromHere={onPlayFromHere}
                            className="h-full"
                        />
                    </div>
                </div>
            </div>
        </div>
        </CommandRadialProvider>
    );
};

interface SceneItemProps {
    scene: VNScene;
    isSelected: boolean;
    isStartScene: boolean;
    isRenaming: boolean;
    isDragging: boolean;
    isDropTarget: boolean;
    onSelect: () => void;
    onStartRenaming: () => void;
    onCommitRename: (name: string) => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onSetStartScene: () => void;
    onDragStart: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    /** Command children (like the screen tree's elements): expand to list this scene's commands;
     *  clicking one selects that command in the scene editor. */
    isExpanded: boolean;
    onToggleExpanded: () => void;
    selectedCommandIndex: number | null;
    project: VNProject;
    onSelectCommand: (index: number) => void;
}

const SceneItem: React.FC<SceneItemProps> = ({
    scene,
    isSelected,
    isStartScene,
    isRenaming,
    isDragging,
    isDropTarget,
    onSelect,
    onStartRenaming,
    onCommitRename,
    onDelete,
    onDuplicate,
    onSetStartScene,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onContextMenu,
    isExpanded,
    onToggleExpanded,
    selectedCommandIndex,
    project,
    onSelectCommand
}) => {
    const { t } = useTranslation(['scenes', 'common']);
    const { inputProps: renameInputProps } = useInlineRename(scene.name, onCommitRename);
    const commands = (scene.commands || []) as VNCommand[];
    const hasCommands = commands.length > 0;
    const commandTree = useMemo(() => buildCommandTree(commands), [commands]);
    // Branch nodes collapse individually (default open — the outline should read like the story).
    const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(new Set());
    const toggleBranch = (cmdId: string) => setCollapsedBranches(prev => {
        const next = new Set(prev);
        if (next.has(cmdId)) next.delete(cmdId); else next.add(cmdId);
        return next;
    });

    return (
        <div>
        <div
            draggable={!isRenaming}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={onSelect}
            onDoubleClick={onStartRenaming}
            onContextMenu={onContextMenu}
            className={`group flex items-center gap-1 px-1 py-1 rounded cursor-pointer transition-all ${
                isDragging
                    ? 'opacity-40'
                    : isDropTarget
                    ? 'border-2 border-sky-400 bg-sky-500/10'
                    : isSelected
                    ? 'bg-sky-500/20 border border-sky-500/50'
                    : 'hover:bg-[var(--bg-secondary)]'
            }`}
        >
            <button
                onClick={(e) => { e.stopPropagation(); onToggleExpanded(); }}
                className={`p-0.5 rounded flex-shrink-0 transition-colors ${
                    hasCommands ? 'text-[var(--text-secondary)] hover:text-white' : 'text-[var(--text-muted)] opacity-30 cursor-default'
                }`}
                title={hasCommands ? (isExpanded ? t('collapseCommands', 'Hide commands') : t('expandCommands', 'Show commands')) : t('noCommands', 'No commands yet')}
                disabled={!hasCommands}
            >
                {isExpanded ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
            </button>

            <BookOpenIcon className="w-3 h-3 text-[var(--text-secondary)] flex-shrink-0" />

            <div className="flex-1 min-w-0 overflow-hidden">
                {isRenaming ? (
                    <input
                        type="text"
                        {...renameInputProps}
                        className="w-full bg-[var(--bg-primary)] text-white px-1 py-0.5 rounded text-xs outline-none ring-1 ring-sky-500"
                    />
                ) : (
                    <span className="text-xs block overflow-hidden text-ellipsis whitespace-nowrap" title={scene.name}>{scene.name}</span>
                )}
            </div>

            <div className="flex items-center gap-0.5 flex-shrink-0">
                {isStartScene && (
                    <SparkleIcon className="w-3 h-3 text-yellow-400" title={t('startScene')} />
                )}

                <button
                    onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                    className="p-0.5 text-[var(--text-muted)] hover:text-green-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={t('duplicateScene')}
                >
                    <DuplicateIcon className="w-3 h-3" />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onSetStartScene(); }}
                    className={`p-0.5 rounded transition-colors ${
                        isStartScene
                            ? 'text-yellow-400 hover:text-yellow-300'
                            : 'text-[var(--text-muted)] hover:text-yellow-400 opacity-0 group-hover:opacity-100'
                    }`}
                    title={t('setAsStartScene')}
                >
                    <SparkleIcon className="w-3 h-3" />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onStartRenaming(); }}
                    className="p-0.5 text-[var(--text-muted)] hover:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={t('common:rename')}
                >
                    <PencilIcon className="w-3 h-3" />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-0.5 text-[var(--text-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={t('common:delete')}
                >
                    <TrashIcon className="w-3 h-3" />
                </button>
            </div>
        </div>

        {/* Command children — click one to select that command in the scene editor (which scrolls
            to it and opens its properties, same as the variable X-ray jump). Branches nest and
            collapse; chips carry the same colours as the command picker. */}
        {isExpanded && hasCommands && (
            <div className="ml-5 mt-0.5 mb-1 border-l border-[var(--border-subtle)] pl-1.5 space-y-px">
                {(function renderNodes(nodes: CmdTreeNode[], depth: number): React.ReactNode {
                    return nodes.map(({ cmd, index, children }) => {
                        const isBranch = cmd.type === CommandType.BranchStart;
                        const isCollapsed = collapsedBranches.has(cmd.id);
                        const summary = commandTreeSummary(cmd, project);
                        const typeName = t(`names.${cmd.type}`, { defaultValue: (cmd.type as string).replace(/([A-Z])/g, ' $1').trim() });
                        return (
                            <React.Fragment key={cmd.id || index}>
                                <div
                                    onClick={(e) => { e.stopPropagation(); onSelectCommand(index); }}
                                    style={depth > 0 ? { marginLeft: depth * 10 } : undefined}
                                    className={`flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer text-[11px] transition-colors ${
                                        selectedCommandIndex === index
                                            ? 'bg-sky-500/20 text-sky-200'
                                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-white'
                                    }`}
                                    title={`${typeName}${summary ? ` — ${summary}` : ''}`}
                                >
                                    {isBranch && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleBranch(cmd.id); }}
                                            className="p-0 text-[var(--text-secondary)] hover:text-white flex-shrink-0"
                                            title={isCollapsed ? t('expandCommands', 'Show commands') : t('collapseCommands', 'Hide commands')}
                                        >
                                            {isCollapsed ? <ChevronRightIcon className="w-2.5 h-2.5" /> : <ChevronDownIcon className="w-2.5 h-2.5" />}
                                        </button>
                                    )}
                                    <span className={`text-[8px] font-mono px-1 rounded border flex-shrink-0 w-8 text-center ${getCommandColor(cmd.type)}`}>{commandChip(cmd.type)}</span>
                                    <span className="truncate flex-grow">{summary || typeName}</span>
                                    {isBranch && isCollapsed && children.length > 0 && (
                                        <span className="text-[9px] text-[var(--text-muted)] flex-shrink-0">{children.length}</span>
                                    )}
                                </div>
                                {isBranch && !isCollapsed && children.length > 0 && renderNodes(children, depth + 1)}
                            </React.Fragment>
                        );
                    });
                })(commandTree, 0)}
            </div>
        )}
        </div>
    );
};

export default React.memo(SceneManagerList);