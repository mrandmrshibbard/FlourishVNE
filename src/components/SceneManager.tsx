import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useInlineRename } from '../hooks/useInlineRename';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNScene } from '../features/scene/types';
import { useProject } from '../contexts/ProjectContext';
import { useToast } from '../contexts/ToastContext';
import SceneEditor from './SceneEditor';
import StagingArea from './StagingArea';
import CommandPalette from './CommandPalette';
import { PlusIcon, TrashIcon, BookOpenIcon, PencilIcon, SparkleIcon, DuplicateIcon } from './icons';
import { ContextMenu } from './ui/ContextMenu';
import { CommandRadialProvider } from './inspector/CommandRadialContext';

interface SceneManagerProps {
    project: VNProject;
    activeSceneId: VNID;
    setActiveSceneId: (id: VNID) => void;
    selectedCommandIndex: number | null;
    setSelectedCommandIndex: (index: number | null) => void;
    setSelectedVariableId: (id: VNID | null) => void;
    onConfigureScene: () => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
}

const SceneManager: React.FC<SceneManagerProps> = ({
    project,
    activeSceneId,
    setActiveSceneId,
    selectedCommandIndex,
    setSelectedCommandIndex,
    setSelectedVariableId,
    onConfigureScene,
    isCollapsed,
    onToggleCollapse
}) => {
    const { dispatch } = useProject();
    const toast = useToast();
    const { t } = useTranslation(['scenes', 'common']);
    const [renamingId, setRenamingId] = useState<VNID | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sceneId: VNID } | null>(null);
    const [draggedSceneId, setDraggedSceneId] = useState<VNID | null>(null);
    const [dropTargetId, setDropTargetId] = useState<VNID | null>(null);

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
                    <div className="px-1.5 py-1 border-b border-[var(--border-subtle)] flex-shrink-0">
                        <h2 className="text-xs font-bold text-white flex items-center gap-1">
                            <BookOpenIcon className="w-3 h-3" />
                            {t('listTitle')}
                        </h2>
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
                {/* Staging Area - Top - 60% */}
                <div className="flex-[3] flex flex-col border-b-2 border-[var(--border-subtle)] min-h-0 overflow-hidden">
                    <div className="h-full p-2 overflow-hidden">
                        <StagingArea
                            project={project}
                            activeSceneId={activeSceneId}
                            selectedCommandIndex={selectedCommandIndex}
                            className="h-full w-full border-2 border-[var(--border-subtle)] rounded-lg"
                            style={{ height: '100%' }}
                        />
                    </div>
                </div>

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
    onContextMenu
}) => {
    const { t } = useTranslation(['scenes', 'common']);
    const { inputProps: renameInputProps } = useInlineRename(scene.name, onCommitRename);

    return (
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
    );
};

export default React.memo(SceneManager);