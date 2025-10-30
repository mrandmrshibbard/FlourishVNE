import React, { useEffect, useState } from 'react';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNUIScreen } from '../features/ui/types';
import { useProject } from '../contexts/ProjectContext';
import MenuEditor from './menu-editor/MenuEditor';
import UIElementInspector from './menu-editor/UIElementInspector';
import ScreenInspector from './menu-editor/ScreenInspector';
import { PlusIcon, TrashIcon, BookmarkSquareIcon, PencilIcon, DuplicateIcon, LockClosedIcon } from './icons';
import ConfirmationModal from './ui/ConfirmationModal';

interface UIManagerProps {
    project: VNProject;
    activeMenuScreenId: VNID | null;
    setActiveMenuScreenId: (id: VNID | null) => void;
    selectedUIElementId: VNID | null;
    setSelectedUIElementId: (id: VNID | null) => void;
}

const UIManager: React.FC<UIManagerProps> = ({
    project,
    activeMenuScreenId,
    setActiveMenuScreenId,
    selectedUIElementId,
    setSelectedUIElementId
}) => {
    const { dispatch } = useProject();
    const [renamingId, setRenamingId] = useState<VNID | null>(null);
    const [pendingRestore, setPendingRestore] = useState(false);
    const [restoreModalOpen, setRestoreModalOpen] = useState(false);

    const uiScreensArray = Object.values(project.uiScreens) as VNUIScreen[];

    const specialScreenIds = [
        project.ui.titleScreenId,
        project.ui.settingsScreenId,
        project.ui.saveScreenId,
        project.ui.loadScreenId,
        project.ui.pauseScreenId,
    ].filter((id): id is VNID => Boolean(id));

    const addUIScreen = () => {
        const name = `New Screen ${Object.keys(project.uiScreens).length + 1}`;
        dispatch({ type: 'ADD_UI_SCREEN', payload: { name } });
    };

    const handleDeleteUIScreen = (screenId: VNID) => {
        dispatch({ type: 'DELETE_UI_SCREEN', payload: { screenId } });
    };

    const handleRenameUIScreen = (screenId: VNID, name: string) => {
        dispatch({ type: 'UPDATE_UI_SCREEN', payload: { screenId, updates: { name } } });
        setRenamingId(null);
    };

    const handleDuplicateUIScreen = (screenId: VNID) => {
        dispatch({ type: 'DUPLICATE_UI_SCREEN', payload: { screenId } });
    };

    const openRestoreModal = () => {
        setRestoreModalOpen(true);
    };

    const handleConfirmRestore = () => {
        setRestoreModalOpen(false);
        setPendingRestore(true);
        dispatch({ type: 'RESTORE_DEFAULT_UI_SCREENS' });
    };

    useEffect(() => {
        if (!pendingRestore) {
            return;
        }

        const newTitleId = project.ui.titleScreenId;
        if (newTitleId && project.uiScreens[newTitleId]) {
            setActiveMenuScreenId(newTitleId);
        } else {
            setActiveMenuScreenId(null);
        }
        setSelectedUIElementId(null);
        setPendingRestore(false);
    }, [pendingRestore, project.ui.titleScreenId, project.uiScreens, setActiveMenuScreenId, setSelectedUIElementId]);

    return (
        <div className="flex h-full min-w-[1500px] max-w-[1500px] min-h-[850px] max-h-[850px] gap-6 p-4 overflow-hidden">
            {/* UI Screens List Sidebar */}
            <div className="w-48 panel flex flex-col flex-shrink-0 max-h-full">
                <div className="p-3 border-b-2 border-slate-700 flex-shrink-0">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <BookmarkSquareIcon className="w-4 h-4 text-purple-400" />
                        Screens
                    </h2>
                </div>

                <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
                    {uiScreensArray.map(screen => {
                        const isSpecial = specialScreenIds.includes(screen.id);
                        return (
                            <UIScreenItem
                                key={screen.id}
                                screen={screen}
                                isSelected={activeMenuScreenId === screen.id}
                                isSpecial={isSpecial}
                                isRenaming={renamingId === screen.id}
                                onSelect={() => setActiveMenuScreenId(screen.id)}
                                onStartRenaming={() => setRenamingId(screen.id)}
                                onCommitRename={(name) => handleRenameUIScreen(screen.id, name)}
                                onDelete={() => handleDeleteUIScreen(screen.id)}
                                onDuplicate={() => handleDuplicateUIScreen(screen.id)}
                            />
                        );
                    })}
                </div>

                <div className="p-3 border-t-2 border-slate-700 space-y-2 flex-shrink-0 panel-header">
                    <button
                        onClick={addUIScreen}
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] border border-purple-400/50"
                    >
                        <PlusIcon className="w-4 h-4" />
                        Add
                    </button>
                    <button
                        onClick={openRestoreModal}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-red-300 hover:text-red-200 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 text-xs transition-all border-2 border-red-500/30 hover:border-red-500/50 hover:scale-[1.02]"
                    >
                        Restore Defaults
                    </button>
                </div>
            </div>

            {/* UI Editor */}
            <div className="flex-1 flex flex-col min-w-0">
                {activeMenuScreenId ? (
                    <MenuEditor
                        activeScreenId={activeMenuScreenId}
                        selectedElementId={selectedUIElementId}
                        setSelectedElementId={setSelectedUIElementId}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-400">
                        <div className="text-center">
                            <BookmarkSquareIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p className="text-lg">Select a UI screen to edit</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Properties Inspector */}
            {activeMenuScreenId && (
                selectedUIElementId ? (
                    <UIElementInspector 
                        screenId={activeMenuScreenId} 
                        elementId={selectedUIElementId} 
                        setSelectedElementId={setSelectedUIElementId} 
                    />
                ) : (
                    <ScreenInspector screenId={activeMenuScreenId} />
                )
            )}

            <ConfirmationModal
                isOpen={restoreModalOpen}
                onClose={() => setRestoreModalOpen(false)}
                onConfirm={handleConfirmRestore}
                title="Restore Default Screens"
                confirmLabel="Restore"
            >
                Restoring defaults will add brand-new versions of the title, pause, save, load, and settings screens. Your existing custom screens will remain untouched, but the new defaults will become the active selections. Continue?
            </ConfirmationModal>
        </div>
    );
};

interface UIScreenItemProps {
    screen: VNUIScreen;
    isSelected: boolean;
    isSpecial: boolean;
    isRenaming: boolean;
    onSelect: () => void;
    onStartRenaming: () => void;
    onCommitRename: (name: string) => void;
    onDelete: () => void;
    onDuplicate: () => void;
}

const UIScreenItem: React.FC<UIScreenItemProps> = ({
    screen,
    isSelected,
    isSpecial,
    isRenaming,
    onSelect,
    onStartRenaming,
    onCommitRename,
    onDelete,
    onDuplicate
}) => {
    const [renameValue, setRenameValue] = useState(screen.name);

    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onCommitRename(renameValue);
        } else if (e.key === 'Escape') {
            setRenameValue(screen.name);
            onStartRenaming(); // This will cancel renaming
        }
    };

    const handleRenameBlur = () => {
        onCommitRename(renameValue);
    };

    return (
        <div
            onClick={onSelect}
            onDoubleClick={!isSpecial ? onStartRenaming : undefined}
            className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-all ${
                isSelected
                    ? 'bg-sky-500/20 border border-sky-500/50 shadow-md'
                    : 'hover:bg-slate-700/70 border border-transparent'
            }`}
        >
            <BookmarkSquareIcon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-sky-400' : 'text-slate-400'}`} />

            <div className="flex-grow truncate min-w-0">
                {isRenaming && !isSpecial ? (
                    <input
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={handleRenameBlur}
                        onKeyDown={handleRenameKeyDown}
                        className="w-full bg-slate-900 text-white py-1 px-1.5 rounded text-xs outline-none ring-2 ring-sky-500"
                        onClick={e => e.stopPropagation()}
                        autoFocus
                    />
                ) : (
                    <span className="text-xs font-medium">{screen.name}</span>
                )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {isSpecial && (
                    <LockClosedIcon className="w-3 h-3 text-yellow-500/70 opacity-100" title="Essential screen" />
                )}

                <button
                    onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                    className="p-1 text-sky-400 hover:text-sky-300 bg-slate-700 hover:bg-slate-600 rounded transition-all"
                    title="Duplicate"
                >
                    <DuplicateIcon className="w-3 h-3" />
                </button>

                {!isSpecial && (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); onStartRenaming(); }}
                            className="p-1 text-slate-400 hover:text-sky-400 bg-slate-700 hover:bg-slate-600 rounded transition-all"
                            title="Rename"
                        >
                            <PencilIcon className="w-3 h-3" />
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            className="p-1 text-slate-400 hover:text-red-400 bg-slate-700 hover:bg-slate-600 rounded transition-all"
                            title="Delete"
                        >
                            <TrashIcon className="w-3 h-3" />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default UIManager;
