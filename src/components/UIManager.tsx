import React, { useEffect, useState, useMemo } from 'react';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNUIScreen } from '../features/ui/types';
import { useProject } from '../contexts/ProjectContext';
import MenuEditor from './menu-editor/MenuEditor';
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

    const uiScreensArray = useMemo(() => Object.values(project.uiScreens) as VNUIScreen[], [project.uiScreens]);

    const specialScreenIds = useMemo(
        () => [
            project.ui.titleScreenId,
            project.ui.settingsScreenId,
            project.ui.saveScreenId,
            project.ui.loadScreenId,
            project.ui.pauseScreenId,
        ].filter((id): id is VNID => Boolean(id)),
        [
            project.ui.titleScreenId,
            project.ui.settingsScreenId,
            project.ui.saveScreenId,
            project.ui.loadScreenId,
            project.ui.pauseScreenId,
        ]
    );

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
        <div className="flex h-full">
            {/* UI Screen List Sidebar */}
            <div className="bg-slate-800 border-r border-slate-700 flex flex-col" style={{ width: 'var(--sidebar-width)' }}>
                <div className="p-4 border-b border-slate-700">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <BookmarkSquareIcon className="w-5 h-5" />
                        UI Screens
                    </h2>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
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

                <div className="p-2 border-t border-slate-700 space-y-2">
                    <button
                        onClick={addUIScreen}
                        className="w-full bg-sky-500 hover:bg-sky-600 text-white p-2 rounded-md flex items-center justify-center gap-2 font-bold transition-colors"
                    >
                        <PlusIcon className="w-4 h-4" />
                        Add UI Screen
                    </button>
                    <button
                        onClick={openRestoreModal}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-red-300 hover:text-red-200 p-2 rounded-md flex items-center justify-center gap-2 text-sm transition-colors border border-red-500/30"
                    >
                        Restore Default Screens
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
            className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                isSelected
                    ? 'bg-sky-500/20 border border-sky-500/50'
                    : 'hover:bg-slate-700'
            }`}
        >
            <BookmarkSquareIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />

            <div className="flex-grow truncate">
                {isRenaming && !isSpecial ? (
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
                    <span className="text-sm">{screen.name}</span>
                )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                {isSpecial && (
                    <LockClosedIcon className="w-4 h-4 text-slate-500" title="This screen is essential and cannot be deleted or renamed." />
                )}

                <button
                    onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                    className="p-1 text-sky-400 hover:text-sky-300 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                    title="Duplicate"
                >
                    <DuplicateIcon className="w-3 h-3" />
                </button>

                {!isSpecial && (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); onStartRenaming(); }}
                            className="p-1 text-slate-400 hover:text-sky-400 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                            title="Rename"
                        >
                            <PencilIcon className="w-3 h-3" />
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            className="p-1 text-slate-400 hover:text-red-400 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
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

export default React.memo(UIManager);