import React, { useState } from 'react';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNScene } from '../features/scene/types';
import { useProject } from '../contexts/ProjectContext';
import SceneEditor from './SceneEditor';
import StagingArea from './StagingArea';
import { PlusIcon, TrashIcon, BookOpenIcon, PencilIcon, SparkleIcon } from './icons';

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

    const handleRenameScene = (sceneId: VNID, name: string) => {
        dispatch({ type: 'UPDATE_SCENE', payload: { sceneId, name } });
        setRenamingId(null);
    };

    const handleSetStartScene = (sceneId: VNID) => {
        dispatch({ type: 'SET_START_SCENE', payload: { sceneId } });
    };

    return (
        <div className="flex h-full">
            {/* Scene List Sidebar */}
            <div className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col">
                <div className="p-4 border-b border-slate-700">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <BookOpenIcon className="w-5 h-5" />
                        Scenes
                    </h2>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {scenesArray.map(scene => (
                        <SceneItem
                            key={scene.id}
                            scene={scene}
                            isSelected={activeSceneId === scene.id}
                            isStartScene={project.startSceneId === scene.id}
                            isRenaming={renamingId === scene.id}
                            onSelect={() => setActiveSceneId(scene.id)}
                            onStartRenaming={() => setRenamingId(scene.id)}
                            onCommitRename={(name) => handleRenameScene(scene.id, name)}
                            onDelete={() => handleDeleteScene(scene.id)}
                            onSetStartScene={() => handleSetStartScene(scene.id)}
                        />
                    ))}
                </div>

                <div className="p-2 border-t border-slate-700">
                    <button
                        onClick={addScene}
                        className="w-full bg-sky-500 hover:bg-sky-600 text-white p-2 rounded-md flex items-center justify-center gap-2 font-bold transition-colors"
                    >
                        <PlusIcon className="w-4 h-4" />
                        Add Scene
                    </button>
                </div>
            </div>

            {/* Scene Editor with Staging Area */}
            <div className="flex-1 flex flex-col min-w-0 relative">
                <div 
                    className="absolute top-0 left-0 right-0 transition-all duration-300 ease-in-out"
                    style={{ height: isCollapsed ? 'calc(100% - 44px)' : '0%' }}
                >
                    <StagingArea
                        project={project}
                        activeSceneId={activeSceneId}
                        selectedCommandIndex={selectedCommandIndex}
                        className="h-full w-full"
                    />
                </div>
                <div 
                    className="absolute bottom-0 left-0 right-0 transition-all duration-300 ease-in-out z-30"
                    style={{ height: isCollapsed ? '44px' : '100%' }}
                >
                    <SceneEditor
                        activeSceneId={activeSceneId}
                        selectedCommandIndex={selectedCommandIndex}
                        setSelectedCommandIndex={setSelectedCommandIndex}
                        setSelectedVariableId={setSelectedVariableId}
                        onConfigureScene={onConfigureScene}
                        isCollapsed={isCollapsed}
                        onToggleCollapse={onToggleCollapse}
                        className="h-full"
                    />
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
    onSelect: () => void;
    onStartRenaming: () => void;
    onCommitRename: (name: string) => void;
    onDelete: () => void;
    onSetStartScene: () => void;
}

const SceneItem: React.FC<SceneItemProps> = ({
    scene,
    isSelected,
    isStartScene,
    isRenaming,
    onSelect,
    onStartRenaming,
    onCommitRename,
    onDelete,
    onSetStartScene
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
            onClick={onSelect}
            onDoubleClick={onStartRenaming}
            className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                isSelected
                    ? 'bg-sky-500/20 border border-sky-500/50'
                    : 'hover:bg-slate-700'
            }`}
        >
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