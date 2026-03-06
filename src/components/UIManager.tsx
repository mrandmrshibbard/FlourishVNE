import React, { useEffect, useState, useMemo } from 'react';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNUIScreen } from '../features/ui/types';
import { useProject } from '../contexts/ProjectContext';
import MenuEditor from './menu-editor/MenuEditor';
import InGameUIEditor from './InGameUIEditor';
import HotZoneEditor from './HotZoneEditor';
import { PlusIcon, TrashIcon, BookmarkSquareIcon, PencilIcon, DuplicateIcon, LockClosedIcon, ChatBubbleIcon } from './icons';
import ConfirmationModal from './ui/ConfirmationModal';
import UIScreenThemeSelector from './UIScreenThemeSelector';

type UIEditorMode = 'screens' | 'ingame';

interface UIManagerProps {
    project: VNProject;
    activeMenuScreenId: VNID | null;
    setActiveMenuScreenId: (id: VNID | null) => void;
    selectedUIElementIds: VNID[];
    setSelectedUIElementIds: (ids: VNID[]) => void;
    onEditorModeChange?: (mode: UIEditorMode) => void;
}

const UIManager: React.FC<UIManagerProps> = ({
    project,
    activeMenuScreenId,
    setActiveMenuScreenId,
    selectedUIElementIds,
    setSelectedUIElementIds,
    onEditorModeChange
}) => {
    const { dispatch } = useProject();
    const [editorMode, setEditorModeLocal] = useState<UIEditorMode>('screens');
    // Keep parent in sync when component mounts/remounts
    useEffect(() => { onEditorModeChange?.(editorMode); }, []);
    const setEditorMode = (mode: UIEditorMode) => { setEditorModeLocal(mode); onEditorModeChange?.(mode); };
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

    const addUIScreen = (screenType?: 'standard' | 'hotzone') => {
        const prefix = screenType === 'hotzone' ? 'Hot Zone' : 'New Screen';
        const name = `${prefix} ${Object.keys(project.uiScreens).length + 1}`;
        dispatch({ type: 'ADD_UI_SCREEN', payload: { name, screenType } });
    };

    const handleDeleteUIScreen = (screenId: VNID) => {
        // Clear active selection if deleting the currently active screen
        if (activeMenuScreenId === screenId) {
            setActiveMenuScreenId(null);
            setSelectedUIElementIds([]);
        }
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
        setSelectedUIElementIds([]);
        setPendingRestore(false);
    }, [pendingRestore, project.ui.titleScreenId, project.uiScreens, setActiveMenuScreenId, setSelectedUIElementIds]);

    return (
        <div className="flex flex-col h-full">
            {/* Mode toggle bar */}
            <div className="flex items-center gap-1 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] px-3 py-1.5 flex-shrink-0">
                <button
                    onClick={() => { setEditorMode('screens'); }}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        editorMode === 'screens'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-white'
                    }`}
                >
                    <BookmarkSquareIcon className="w-4 h-4" />
                    UI Screens
                </button>
                <button
                    onClick={() => { setEditorMode('ingame'); }}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        editorMode === 'ingame'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-white'
                    }`}
                >
                    <ChatBubbleIcon className="w-4 h-4" />
                    In-Game UI
                </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 min-h-0">
                {editorMode === 'ingame' ? (
                    <InGameUIEditor project={project} />
                ) : (
                    <div className="flex h-full">
                        {/* UI Screen List Sidebar */}
                        <div className="bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] flex flex-col" style={{ width: 'var(--sidebar-width)' }}>
                            <div className="p-4 border-b border-[var(--border-subtle)]">
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

                            <div className="p-2 border-t border-[var(--border-subtle)] space-y-2">
                                <button
                                    onClick={() => addUIScreen()}
                                    className="w-full bg-sky-500 hover:bg-sky-600 text-white p-2 rounded-md flex items-center justify-center gap-2 font-bold transition-colors"
                                >
                                    <PlusIcon className="w-4 h-4" />
                                    Add UI Screen
                                </button>
                                <button
                                    onClick={() => addUIScreen('hotzone')}
                                    className="w-full bg-purple-500 hover:bg-purple-600 text-white p-2 rounded-md flex items-center justify-center gap-2 font-bold transition-colors"
                                >
                                    <PlusIcon className="w-4 h-4" />
                                    Add Hot Zone Screen
                                </button>
                                <UIScreenThemeSelector label="Apply Theme to All" className="w-full [&>button]:w-full [&>button]:justify-center" />
                                <button
                                    onClick={openRestoreModal}
                                    className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-red-300 hover:text-red-200 p-2 rounded-md flex items-center justify-center gap-2 text-sm transition-colors border border-red-500/30"
                                >
                                    Restore Default Screens
                                </button>
                            </div>
                        </div>

                        {/* UI Editor */}
                        <div className="flex-1 flex flex-col min-w-0">
                            {activeMenuScreenId ? (
                                project.uiScreens[activeMenuScreenId]?.screenType === 'hotzone' ? (
                                    <HotZoneEditor screenId={activeMenuScreenId} />
                                ) : (
                                    <MenuEditor
                                        activeScreenId={activeMenuScreenId}
                                        selectedElementIds={selectedUIElementIds}
                                        setSelectedElementIds={setSelectedUIElementIds}
                                    />
                                )
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
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
                )}
            </div>
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
                    : 'hover:bg-[var(--bg-secondary)]'
            }`}
        >
            <BookmarkSquareIcon className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" />

            <div className="flex-grow truncate">
                {isRenaming && !isSpecial ? (
                    <input
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={handleRenameBlur}
                        onKeyDown={handleRenameKeyDown}
                        className="w-full bg-[var(--bg-primary)] text-white p-1 rounded text-sm outline-none ring-1 ring-sky-500"
                        onClick={e => e.stopPropagation()}
                        autoFocus
                    />
                ) : (
                    <span className="text-sm flex items-center gap-1">
                        {screen.name}
                        {screen.screenType === 'hotzone' && (
                            <span className="text-[10px] bg-purple-500/30 text-purple-300 px-1 rounded">HZ</span>
                        )}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                {isSpecial && (
                    <LockClosedIcon className="w-4 h-4 text-[var(--text-muted)]" title="This screen is essential and cannot be deleted or renamed." />
                )}

                <button
                    onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                    className="p-1 text-sky-400 hover:text-sky-300 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                    title="Duplicate"
                >
                    <DuplicateIcon className="w-3 h-3" />
                </button>

                {!isSpecial && (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); onStartRenaming(); }}
                            className="p-1 text-[var(--text-secondary)] hover:text-sky-400 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                            title="Rename"
                        >
                            <PencilIcon className="w-3 h-3" />
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            className="p-1 text-[var(--text-secondary)] hover:text-red-400 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
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