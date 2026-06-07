import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useInlineRename } from '../hooks/useInlineRename';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNUIScreen, VNUIElement, UIElementType } from '../features/ui/types';
import { useProject } from '../contexts/ProjectContext';
import MenuEditor from './menu-editor/MenuEditor';
import InGameUIEditor from './InGameUIEditor';
import { ElementRadialProvider, useElementRadial } from './menu-editor/ElementRadialContext';
import { PlusIcon, TrashIcon, BookmarkSquareIcon, PencilIcon, DuplicateIcon, LockClosedIcon, ChatBubbleIcon, ChevronRightIcon, ChevronDownIcon } from './icons';
import ConfirmationModal from './ui/ConfirmationModal';
import UIScreenThemeSelector from './UIScreenThemeSelector';

const EXPANDED_SCREENS_STORAGE_KEY = 'flourish.uiManager.expandedScreens';

// Short type label shown next to each child element in the screen tree
const ELEMENT_TYPE_LABEL: Record<string, string> = {
    [UIElementType.Button]: 'BTN',
    [UIElementType.Text]: 'TXT',
    [UIElementType.Image]: 'IMG',
    [UIElementType.SaveSlotGrid]: 'SAV',
    [UIElementType.SettingsSlider]: 'SLI',
    [UIElementType.SettingsToggle]: 'TGL',
    [UIElementType.CharacterPreview]: 'CHR',
    [UIElementType.TextInput]: 'INP',
    [UIElementType.Dropdown]: 'DRP',
    [UIElementType.Checkbox]: 'CHK',
    [UIElementType.AssetCycler]: 'AST',
    [UIElementType.CGGallery]: 'CG',
};

type UIEditorMode = 'screens' | 'ingame';

interface UIManagerProps {
    project: VNProject;
    activeMenuScreenId: VNID | null;
    setActiveMenuScreenId: (id: VNID | null) => void;
    selectedUIElementIds: VNID[];
    setSelectedUIElementIds: (ids: VNID[]) => void;
    onEditorModeChange?: (mode: UIEditorMode) => void;
    /** True while the Live Preview overlay is open — the canvas drops its <video> backgrounds
     *  then (they're covered anyway) and remounts them fresh on return, avoiding the evicted/
     *  broken video state the browser leaves behind a fullscreen overlay. */
    isPlaying?: boolean;
}

const UIManager: React.FC<UIManagerProps> = ({
    project,
    activeMenuScreenId,
    setActiveMenuScreenId,
    selectedUIElementIds,
    setSelectedUIElementIds,
    onEditorModeChange,
    isPlaying
}) => {
    const { dispatch } = useProject();
    const { t } = useTranslation('ui');
    const [editorMode, setEditorModeLocal] = useState<UIEditorMode>('screens');
    // Keep parent in sync when component mounts/remounts
    useEffect(() => { onEditorModeChange?.(editorMode); }, []);
    const setEditorMode = (mode: UIEditorMode) => { setEditorModeLocal(mode); onEditorModeChange?.(mode); };
    const [renamingId, setRenamingId] = useState<VNID | null>(null);
    const [pendingRestore, setPendingRestore] = useState(false);
    const [restoreModalOpen, setRestoreModalOpen] = useState(false);

    // Expansion state for the screen tree — persisted so it survives reloads
    const [expandedScreens, setExpandedScreens] = useState<Set<VNID>>(() => {
        try {
            const raw = localStorage.getItem(EXPANDED_SCREENS_STORAGE_KEY);
            if (!raw) return new Set();
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? new Set(parsed as VNID[]) : new Set();
        } catch {
            return new Set();
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(EXPANDED_SCREENS_STORAGE_KEY, JSON.stringify(Array.from(expandedScreens)));
        } catch { /* ignore storage failures */ }
    }, [expandedScreens]);

    const toggleScreenExpanded = useCallback((screenId: VNID) => {
        setExpandedScreens(prev => {
            const next = new Set(prev);
            if (next.has(screenId)) next.delete(screenId);
            else next.add(screenId);
            return next;
        });
    }, []);

    const handleSelectChildElement = useCallback((screenId: VNID, elementId: VNID) => {
        setActiveMenuScreenId(screenId);
        setSelectedUIElementIds([elementId]);
    }, [setActiveMenuScreenId, setSelectedUIElementIds]);

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
        const name = t('manager.newScreenName', { n: Object.keys(project.uiScreens).length + 1 });
        dispatch({ type: 'ADD_UI_SCREEN', payload: { name } });
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
        <ElementRadialProvider activeScreenId={activeMenuScreenId} selectElement={(id) => setSelectedUIElementIds(id ? [id] : [])}>
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
                    {t('manager.uiScreens')}
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
                    {t('manager.inGameUi')}
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
                                    {t('manager.uiScreens')}
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
                                            isExpanded={expandedScreens.has(screen.id)}
                                            selectedElementIds={activeMenuScreenId === screen.id ? selectedUIElementIds : []}
                                            onToggleExpanded={() => toggleScreenExpanded(screen.id)}
                                            onSelect={() => setActiveMenuScreenId(screen.id)}
                                            onSelectChild={(elementId) => handleSelectChildElement(screen.id, elementId)}
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
                                    {t('manager.addScreen')}
                                </button>
                                <UIScreenThemeSelector label={t('manager.applyThemeAll')} className="w-full [&>button]:w-full [&>button]:justify-center" />
                                <button
                                    onClick={openRestoreModal}
                                    className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-red-300 hover:text-red-200 p-2 rounded-md flex items-center justify-center gap-2 text-sm transition-colors border border-red-500/30"
                                >
                                    {t('manager.restoreDefaults')}
                                </button>
                            </div>
                        </div>

                        {/* UI Editor — MenuEditor handles every screen. Hot spots, draggable
                            elements, and image maps render as overlays on the canvas; the inspector
                            dispatcher routes selection to the right panel via the hot zone shim. */}
                        <div className="flex-1 flex flex-col min-w-0">
                            {activeMenuScreenId ? (
                                <MenuEditor
                                    activeScreenId={activeMenuScreenId}
                                    selectedElementIds={selectedUIElementIds}
                                    setSelectedElementIds={setSelectedUIElementIds}
                                    isPlaying={isPlaying}
                                />
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
                                    <div className="text-center">
                                        <BookmarkSquareIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                        <p className="text-lg">{t('manager.selectScreenToEdit')}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <ConfirmationModal
                            isOpen={restoreModalOpen}
                            onClose={() => setRestoreModalOpen(false)}
                            onConfirm={handleConfirmRestore}
                            title={t('manager.restoreDefaults')}
                            confirmLabel={t('manager.restoreConfirm')}
                        >
                            {t('manager.restoreBody')}
                        </ConfirmationModal>
                    </div>
                )}
            </div>
        </div>
        </ElementRadialProvider>
    );
};

interface UIScreenItemProps {
    screen: VNUIScreen;
    isSelected: boolean;
    isSpecial: boolean;
    isRenaming: boolean;
    isExpanded: boolean;
    selectedElementIds: VNID[];
    onToggleExpanded: () => void;
    onSelect: () => void;
    onSelectChild: (elementId: VNID) => void;
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
    isExpanded,
    selectedElementIds,
    onToggleExpanded,
    onSelect,
    onSelectChild,
    onStartRenaming,
    onCommitRename,
    onDelete,
    onDuplicate
}) => {
    const { t } = useTranslation('ui');
    const { inputProps: renameInputProps } = useInlineRename(screen.name, onCommitRename);
    const elementRadial = useElementRadial();

    // Unified schema: every screen keeps all its widgets (incl. hot spots, image maps,
    // draggable elements) in `screen.elements`. The legacy `screenType: 'hotzone'` split
    // was retired and migrated away, so there's a single element list here.
    const elements = Object.values(screen.elements || {}) as VNUIElement[];
    const childCount = elements.length + (screen.winCondition ? 1 : 0);
    const hasChildren = childCount > 0;

    return (
        <div>
            <div
                onClick={onSelect}
                onDoubleClick={!isSpecial ? onStartRenaming : undefined}
                className={`group flex items-center gap-1.5 p-2 rounded-md cursor-pointer transition-colors ${
                    isSelected
                        ? 'bg-sky-500/20 border border-sky-500/50'
                        : 'hover:bg-[var(--bg-secondary)]'
                }`}
            >
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleExpanded(); }}
                    className={`p-0.5 rounded flex-shrink-0 transition-colors ${
                        hasChildren ? 'text-[var(--text-secondary)] hover:text-white' : 'text-[var(--text-muted)] opacity-30 cursor-default'
                    }`}
                    title={hasChildren ? (isExpanded ? t('manager.collapse') : t('manager.expand')) : t('manager.noElements')}
                    disabled={!hasChildren}
                >
                    {isExpanded
                        ? <ChevronDownIcon className="w-3 h-3" />
                        : <ChevronRightIcon className="w-3 h-3" />}
                </button>

                <BookmarkSquareIcon className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" />

                <div className="flex-grow truncate">
                    {isRenaming && !isSpecial ? (
                        <input
                            type="text"
                            {...renameInputProps}
                            className="w-full bg-[var(--bg-primary)] text-white p-1 rounded text-sm outline-none ring-1 ring-sky-500"
                        />
                    ) : (
                        <span className="text-sm flex items-center gap-1">
                            {screen.name}
                            {hasChildren && (
                                <span className="text-[10px] text-[var(--text-muted)] ml-1">{childCount}</span>
                            )}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                    {isSpecial && (
                        <LockClosedIcon className="w-4 h-4 text-[var(--text-muted)]" title={t('manager.essentialScreen')} />
                    )}

                    <button
                        onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                        className="p-1 text-sky-400 hover:text-sky-300 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                        title={t('manager.duplicate')}
                    >
                        <DuplicateIcon className="w-3 h-3" />
                    </button>

                    {!isSpecial && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); onStartRenaming(); }}
                                className="p-1 text-[var(--text-secondary)] hover:text-sky-400 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                                title={t('manager.rename')}
                            >
                                <PencilIcon className="w-3 h-3" />
                            </button>

                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                className="p-1 text-[var(--text-secondary)] hover:text-red-400 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                                title={t('manager.delete')}
                            >
                                <TrashIcon className="w-3 h-3" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {isExpanded && hasChildren && (
                <div className="ml-6 mt-0.5 mb-1 border-l border-[var(--border-subtle)] pl-2 space-y-0.5">
                    {elements.map(el => (
                        <ScreenChildRow
                            key={el.id}
                            name={el.name || t('manager.unnamed')}
                            typeLabel={ELEMENT_TYPE_LABEL[el.type] || el.type.slice(0, 3).toUpperCase()}
                            badgeClass="bg-sky-500/20 text-sky-300"
                            isSelected={selectedElementIds.includes(el.id)}
                            onClick={() => onSelectChild(el.id)}
                            onContextMenu={isSelected ? (e) => { e.preventDefault(); onSelectChild(el.id); elementRadial?.openByElementId(el.id, e.clientX, e.clientY); } : undefined}
                        />
                    ))}
                    {screen.winCondition && (
                        <ScreenChildRow
                            key="__winCondition"
                            name={t('manager.win', { type: screen.winCondition.type === 'allPlaced' ? t('manager.winAllPlaced') : t('manager.winVariableCheck') })}
                            typeLabel="WIN"
                            badgeClass="bg-amber-500/20 text-amber-300"
                            isSelected={false}
                            onClick={onSelect}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

interface ScreenChildRowProps {
    name: string;
    typeLabel: string;
    badgeClass: string;
    isSelected: boolean;
    onClick: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
}

const ScreenChildRow: React.FC<ScreenChildRowProps> = ({ name, typeLabel, badgeClass, isSelected, onClick, onContextMenu }) => (
    <div
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onContextMenu={onContextMenu}
        className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-xs transition-colors ${
            isSelected
                ? 'bg-sky-500/20 text-sky-200'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-white'
        }`}
    >
        <span className={`text-[9px] font-mono px-1 rounded ${badgeClass}`}>{typeLabel}</span>
        <span className="truncate flex-grow">{name}</span>
    </div>
);

export default React.memo(UIManager);