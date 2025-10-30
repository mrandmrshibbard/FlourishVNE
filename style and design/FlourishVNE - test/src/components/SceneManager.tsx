import React, { useState } from 'react';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNScene } from '../features/scene/types';
import { useProject } from '../contexts/ProjectContext';
import SceneEditor from './SceneEditor';
import StagingArea from './StagingArea';
import CommandPalette from './CommandPalette';
import { PlusIcon, TrashIcon, BookOpenIcon, PencilIcon, SparkleIcon, DuplicateIcon, FilmIcon } from './icons';
import { ContextMenu } from './ui/ContextMenu';

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
    const [renamingId, setRenamingId] = useState<VNID | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sceneId: VNID } | null>(null);
    const [draggedSceneId, setDraggedSceneId] = useState<VNID | null>(null);
    const [dropTargetId, setDropTargetId] = useState<VNID | null>(null);
    const [selectedScenes, setSelectedScenes] = useState<Set<VNID>>(new Set());
    const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

    const scenesArray = Object.values(project.scenes) as VNScene[];

    const addScene = () => {
        const name = `New Scene ${Object.keys(project.scenes).length + 1}`;
        dispatch({ type: 'ADD_SCENE', payload: { name } });
    };

    const handleDeleteScene = (sceneId: VNID) => {
        if (Object.keys(project.scenes).length <= 1) {
            alert("You cannot delete the last scene.");
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

    const toggleMultiSelect = () => {
        setIsMultiSelectMode(!isMultiSelectMode);
        setSelectedScenes(new Set());
    };

    const toggleSceneSelection = (sceneId: VNID) => {
        if (!isMultiSelectMode) return;
        
        const newSelected = new Set(selectedScenes);
        if (newSelected.has(sceneId)) {
            newSelected.delete(sceneId);
        } else {
            newSelected.add(sceneId);
        }
        setSelectedScenes(newSelected);
    };

    const selectAllScenes = () => {
        setSelectedScenes(new Set(scenesArray.map(scene => scene.id)));
    };

    const clearSelection = () => {
        setSelectedScenes(new Set());
    };

    const bulkDeleteScenes = () => {
        if (selectedScenes.size === 0) return;
        
        const remainingScenes = Object.keys(project.scenes).length - selectedScenes.size;
        if (remainingScenes < 1) {
            alert("You cannot delete all scenes. At least one scene must remain.");
            return;
        }

        if (confirm(`Delete ${selectedScenes.size} selected scene(s)? This action cannot be undone.`)) {
            selectedScenes.forEach(sceneId => {
                dispatch({ type: 'DELETE_SCENE', payload: { sceneId } });
            });
            setSelectedScenes(new Set());
            
            // If active scene was deleted, switch to another scene
            if (selectedScenes.has(activeSceneId)) {
                const remainingSceneIds = Object.keys(project.scenes).filter(id => !selectedScenes.has(id));
                if (remainingSceneIds.length > 0) {
                    setActiveSceneId(remainingSceneIds[0]);
                }
            }
        }
    };

    const bulkDuplicateScenes = () => {
        if (selectedScenes.size === 0) return;
        
        selectedScenes.forEach(sceneId => {
            handleDuplicateScene(sceneId);
        });
        setSelectedScenes(new Set());
    };

    return (
        <div className="flex h-full overflow-hidden">
            {/* Left Sidebar - Split: Scenes (top) + Commands (bottom) */}
            <div className="w-64 min-w-[240px] max-w-[280px] panel border-r-2 flex flex-col flex-shrink-0">
                {/* Scenes Section - Top - Shortened */}
                <div className="flex-[0.6] flex flex-col border-b-2 border-slate-700 min-h-0">
                    <div className="p-2 border-b border-slate-700 flex-shrink-0">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                <BookOpenIcon className="w-4 h-4" />
                                Scenes
                            </h2>
                            <button
                                onClick={toggleMultiSelect}
                                className={`px-2 py-0.5 text-[10px] rounded ${isMultiSelectMode ? 'bg-sky-500 text-white' : 'bg-slate-600 text-gray-300 hover:bg-slate-500'}`}
                            >
                                {isMultiSelectMode ? 'Cancel' : 'Select'}
                            </button>
                        </div>
                        
                        {isMultiSelectMode && (
                            <div className="flex gap-1">
                                <button
                                    onClick={selectAllScenes}
                                    className="px-2 py-0.5 text-[10px] bg-slate-600 text-gray-300 hover:bg-slate-500 rounded"
                                >
                                    All
                                </button>
                                <button
                                    onClick={clearSelection}
                                    className="px-2 py-0.5 text-[10px] bg-slate-600 text-gray-300 hover:bg-slate-500 rounded"
                                >
                                    None
                                </button>
                                {selectedScenes.size > 0 && (
                                    <>
                                        <button
                                            onClick={bulkDuplicateScenes}
                                            className="px-2 py-0.5 text-[10px] bg-green-600 text-white hover:bg-green-500 rounded"
                                        >
                                            Dup ({selectedScenes.size})
                                        </button>
                                        <button
                                            onClick={bulkDeleteScenes}
                                            className="px-2 py-0.5 text-[10px] bg-red-600 text-white hover:bg-red-500 rounded"
                                        >
                                            Del ({selectedScenes.size})
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
                        {scenesArray.map(scene => (
                            <SceneItem
                                key={scene.id}
                                scene={scene}
                                isSelected={activeSceneId === scene.id}
                                isStartScene={project.startSceneId === scene.id}
                                isRenaming={renamingId === scene.id}
                                isDragging={draggedSceneId === scene.id}
                                isDropTarget={dropTargetId === scene.id}
                                isMultiSelectMode={isMultiSelectMode}
                                isSceneSelected={selectedScenes.has(scene.id)}
                                onSelect={() => setActiveSceneId(scene.id)}
                                onToggleSelection={() => toggleSceneSelection(scene.id)}
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

                    <div className="p-2 border-t border-slate-700">
                        <button
                            onClick={addScene}
                            className="w-full bg-sky-500 hover:bg-sky-600 text-white py-1.5 px-2 rounded text-xs flex items-center justify-center gap-1.5 font-bold transition-colors"
                        >
                            <PlusIcon className="w-3.5 h-3.5" />
                            Add Scene
                        </button>
                    </div>
                </div>

                {/* Commands Section - Bottom - Expanded */}
                <div className="flex-[1.4] overflow-hidden min-h-0">
                    <CommandPalette onCommandSelect={(commandType) => {
                        // Add command at the end of the scene
                        // This will be handled by passing dispatch to CommandPalette or handling here
                        console.log('Add command:', commandType);
                    }} />
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
                            label: 'Rename',
                            icon: <PencilIcon className="w-4 h-4" />,
                            onClick: () => setRenamingId(contextMenu.sceneId)
                        },
                        {
                            label: 'Duplicate',
                            icon: <DuplicateIcon className="w-4 h-4" />,
                            onClick: () => handleDuplicateScene(contextMenu.sceneId)
                        },
                        {
                            label: project.startSceneId === contextMenu.sceneId ? 'Start Scene ✓' : 'Set as Start Scene',
                            icon: <SparkleIcon className="w-4 h-4" />,
                            onClick: () => handleSetStartScene(contextMenu.sceneId)
                        },
                        {
                            label: 'Delete',
                            icon: <TrashIcon className="w-4 h-4" />,
                            onClick: () => handleDeleteScene(contextMenu.sceneId),
                            disabled: Object.keys(project.scenes).length <= 1,
                            warning: Object.keys(project.scenes).length <= 1 ? 'Cannot delete the last scene' : undefined
                        }
                    ]}
                />
            )}

            {/* Center - Staging Area (top) + Scene Editor (bottom) */}
            <div className="flex-1 flex flex-col min-w-[600px] panel border-r-2">
                {/* Staging Area - Top - Taller for better visibility */}
                <div className="flex-[1.1] flex flex-col border-b-2 border-slate-700 min-h-0">
                    <div className="flex-1 p-2 overflow-hidden min-h-0">
                        <StagingArea
                            project={project}
                            activeSceneId={activeSceneId}
                            selectedCommandIndex={selectedCommandIndex}
                            className="h-full w-full border-2 border-slate-700 rounded-lg"
                        />
                    </div>
                </div>

                {/* Scene Editor - Bottom - Adjusted */}
                <div className="flex-[1.1] flex flex-col overflow-hidden min-h-0">
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
    );
};

interface SceneItemProps {
    scene: VNScene;
    isSelected: boolean;
    isStartScene: boolean;
    isRenaming: boolean;
    isDragging: boolean;
    isDropTarget: boolean;
    isMultiSelectMode: boolean;
    isSceneSelected: boolean;
    onSelect: () => void;
    onToggleSelection: () => void;
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
    isMultiSelectMode,
    isSceneSelected,
    onSelect,
    onToggleSelection,
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
    const [renameValue, setRenameValue] = useState(scene.name);

    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onCommitRename(renameValue);
        } else if (e.key === 'Escape') {
            setRenameValue(scene.name);
            onStartRenaming(); // This will cancel renaming
        }
    };

    const handleRenameBlur = () => {
        onCommitRename(renameValue);
    };

    return (
        <div
            draggable={!isRenaming}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={isMultiSelectMode ? onToggleSelection : onSelect}
            onDoubleClick={isMultiSelectMode ? undefined : onStartRenaming}
            onContextMenu={onContextMenu}
            className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-all ${
                isDragging
                    ? 'opacity-40'
                    : isDropTarget
                    ? 'border-2 border-sky-400 bg-sky-500/10'
                    : isSelected
                    ? 'bg-sky-500/20 border border-sky-500/50'
                    : isSceneSelected
                    ? 'bg-green-500/20 border border-green-500/50'
                    : 'hover:bg-slate-700'
            }`}
        >
            {isMultiSelectMode && (
                <input
                    type="checkbox"
                    checked={isSceneSelected}
                    onChange={() => {}} // Handled by onClick
                    className="w-4 h-4 text-green-600 bg-slate-700 border-slate-500 rounded focus:ring-green-500"
                    onClick={(e) => e.stopPropagation()}
                />
            )}
            <BookOpenIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />

            <div className="flex-grow truncate">
                {isRenaming ? (
                    <input
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={handleRenameBlur}
                        onKeyDown={handleRenameKeyDown}
                        className="w-full bg-slate-900 text-white p-1 rounded text-sm outline-none ring-1 ring-sky-500"
                        onClick={e => e.stopPropagation()}
                        autoFocus
                    />
                ) : (
                    <span className="text-sm">{scene.name}</span>
                )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                {isStartScene && (
                    <SparkleIcon className="w-4 h-4 text-yellow-400" title="Start Scene" />
                )}

                <button
                    onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                    className="p-1 text-slate-500 hover:text-green-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Duplicate Scene"
                >
                    <DuplicateIcon className="w-3 h-3" />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onSetStartScene(); }}
                    className={`p-1 rounded text-xs transition-colors ${
                        isStartScene
                            ? 'text-yellow-400 hover:text-yellow-300'
                            : 'text-slate-500 hover:text-yellow-400 opacity-0 group-hover:opacity-100'
                    }`}
                    title="Set as Start Scene"
                >
                    <SparkleIcon className="w-3 h-3" />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onStartRenaming(); }}
                    className="p-1 text-slate-500 hover:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Rename"
                >
                    <PencilIcon className="w-3 h-3" />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete"
                >
                    <TrashIcon className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
};

export default SceneManager;
