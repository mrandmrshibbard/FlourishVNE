import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useInlineRename } from '../hooks/useInlineRename';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNUIScreen, VNUIElement, UIElementType } from '../features/ui/types';
import { getScreenCategory, SCREEN_CATEGORY_COLORS, SCREEN_CATEGORY_LABEL_KEY } from '../utils/screenCategory';
import { useProject } from '../contexts/ProjectContext';
import MenuEditor from './menu-editor/MenuEditor';
import InGameUIEditor from './InGameUIEditor';
import { ElementRadialProvider, useElementRadial } from './menu-editor/ElementRadialContext';
import { isManagerWindow, isMultiWindowSupported, openManagerWindow, onPanelWindowState } from '../utils/windowManager';
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
    [UIElementType.HotSpot]: 'HOT',
    [UIElementType.draggableImageElement]: 'DRAG',
    [UIElementType.Inventory]: 'INV',
    [UIElementType.Meter]: 'MTR',
    [UIElementType.Customizer]: 'CUS',
    [UIElementType.Timer]: 'TMR',
    [UIElementType.Item]: 'ITM',
};

/** Interactive elements (hot spots, draggables) get an amber badge so they stand out in the tree. */
const INTERACTIVE_TYPES = new Set<string>([UIElementType.HotSpot, UIElementType.draggableImageElement]);

type UIEditorMode = 'screens' | 'ingame';

interface UIManagerProps {
    project: VNProject;
    activeMenuScreenId: VNID | null;
    setActiveMenuScreenId: (id: VNID | null) => void;
    selectedUIElementIds: VNID[];
    setSelectedUIElementIds: (ids: VNID[]) => void;
    onEditorModeChange?: (mode: UIEditorMode) => void;
    /** Mode to open in when (re)mounted — lets deep links (e.g. Systems → "Style it: In-Game UI")
     *  land directly on the In-Game UI editor, and preserves the last mode across tab switches. */
    initialEditorMode?: UIEditorMode;
    /** True while the Live Preview overlay is open — the canvas drops its <video> backgrounds
     *  then (they're covered anyway) and remounts them fresh on return, avoiding the evicted/
     *  broken video state the browser leaves behind a fullscreen overlay. */
    isPlaying?: boolean;
    /** "Test this screen": launch test play booted straight into the given screen (no need to
     *  navigate to it in-game). Wired by VisualNovelEditor to the Live Preview overlay. */
    onTestScreen?: (screenId: VNID) => void;
}

const UIManager: React.FC<UIManagerProps> = ({
    project,
    activeMenuScreenId,
    setActiveMenuScreenId,
    selectedUIElementIds,
    setSelectedUIElementIds,
    onEditorModeChange,
    initialEditorMode,
    isPlaying,
    onTestScreen
}) => {
    const { dispatch } = useProject();
    const { t } = useTranslation('ui');
    const [editorMode, setEditorModeLocal] = useState<UIEditorMode>(initialEditorMode || 'screens');
    // Keep parent in sync when component mounts/remounts
    useEffect(() => { onEditorModeChange?.(editorMode); }, []);
    const setEditorMode = (mode: UIEditorMode) => { setEditorModeLocal(mode); onEditorModeChange?.(mode); };
    const [renamingId, setRenamingId] = useState<VNID | null>(null);
    const [pendingRestore, setPendingRestore] = useState(false);
    const [restoreModalOpen, setRestoreModalOpen] = useState(false);
    // Eye toggles: EDITOR-ONLY canvas visibility (declutter while designing). Never saved, never
    // affects the game — hidden elements still exist and still render in test play / builds.
    const [hiddenPreviewIds, setHiddenPreviewIds] = useState<Set<VNID>>(new Set());
    const togglePreviewHidden = useCallback((elementId: VNID) => {
        setHiddenPreviewIds(prev => {
            const next = new Set(prev);
            if (next.has(elementId)) next.delete(elementId); else next.add(elementId);
            return next;
        });
    }, []);

    // When the (adaptive) canvas is popped into its own window, hide the inline UI canvas so the screen
    // list gets the full width (the floating canvas docks beside the editor instead).
    const [canvasPoppedOut, setCanvasPoppedOut] = useState<boolean>(() => !!((window as any).__FLOURISH_PANELS_OPEN__?.canvas));
    const [inspectorPoppedOut, setInspectorPoppedOut] = useState<boolean>(() => !!((window as any).__FLOURISH_PANELS_OPEN__?.inspector));
    useEffect(() => {
        onPanelWindowState((panels) => {
            setCanvasPoppedOut(!!panels?.canvas);
            setInspectorPoppedOut(!!panels?.inspector);
        });
    }, []);

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
                    // In-Game UI editor; its canvas hides when the shared Canvas window is open and its
                    // properties hide when the shared Properties window is open (the tree stays so you can
                    // still pick which surface to edit).
                    <InGameUIEditor project={project} showCanvas={!canvasPoppedOut} showProperties={!inspectorPoppedOut} />
                ) : (
                    <div className="flex h-full">
                        {/* UI Screen List Sidebar (grows to fill when the canvas is popped out) */}
                        <div
                            className={`bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] flex flex-col ${canvasPoppedOut ? 'flex-1' : ''}`}
                            style={canvasPoppedOut ? undefined : { width: 'var(--sidebar-width)' }}
                        >
                            <div className="p-4 border-b border-[var(--border-subtle)]">
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <BookmarkSquareIcon className="w-5 h-5" />
                                    {t('manager.uiScreens')}
                                </h2>
                            </div>

                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                {uiScreensArray.map(screen => {
                                    const isSpecial = specialScreenIds.includes(screen.id);
                                    const cat = getScreenCategory(screen, project);
                                    return (
                                        <UIScreenItem
                                            key={screen.id}
                                            screen={screen}
                                            isSelected={activeMenuScreenId === screen.id}
                                            isSpecial={isSpecial}
                                            categoryColor={SCREEN_CATEGORY_COLORS[cat]}
                                            categoryLabel={t(SCREEN_CATEGORY_LABEL_KEY[cat])}
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
                                            onTest={onTestScreen ? () => onTestScreen(screen.id) : undefined}
                                            onReorderElement={(elementId, direction) => dispatch({ type: 'REORDER_UI_ELEMENT', payload: { screenId: screen.id, elementId, direction } })}
                                            onReorderElements={(elementIds) => dispatch({ type: 'REORDER_UI_ELEMENTS', payload: { screenId: screen.id, elementIds } })}
                                            hiddenPreviewIds={hiddenPreviewIds}
                                            onTogglePreviewHidden={togglePreviewHidden}
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
                            dispatcher routes selection to the right panel via the hot zone shim.
                            Hidden while the canvas is popped out into its own window. */}
                        {!canvasPoppedOut && (
                            <div className="relative flex-1 flex flex-col min-w-0">
                                {isMultiWindowSupported() && !isManagerWindow() && (
                                    <button
                                        onClick={() => openManagerWindow('canvas')}
                                        title={t('manager.popOutCanvas', { defaultValue: 'Open the canvas in its own window' })}
                                        className="absolute top-2 right-2 z-20 w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-black/30 hover:bg-black/50 border border-[var(--border-subtle)] transition-all"
                                    >
                                        ⧉
                                    </button>
                                )}
                                {activeMenuScreenId ? (
                                    <MenuEditor
                                        activeScreenId={activeMenuScreenId}
                                        selectedElementIds={selectedUIElementIds}
                                        setSelectedElementIds={setSelectedUIElementIds}
                                        isPlaying={isPlaying}
                                        onNavigateToScreen={(id) => { setActiveMenuScreenId(id); setSelectedUIElementIds([]); }}
                                        hiddenElementIds={hiddenPreviewIds}
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
                        )}

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
    categoryColor: string;
    categoryLabel: string;
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
    onTest?: () => void;
    onReorderElement: (elementId: VNID, direction: -1 | 1) => void;
    onReorderElements: (elementIds: VNID[]) => void;
    hiddenPreviewIds: Set<VNID>;
    onTogglePreviewHidden: (elementId: VNID) => void;
}

const UIScreenItem: React.FC<UIScreenItemProps> = ({
    screen,
    isSelected,
    isSpecial,
    categoryColor,
    categoryLabel,
    isRenaming,
    isExpanded,
    selectedElementIds,
    onToggleExpanded,
    onSelect,
    onSelectChild,
    onStartRenaming,
    onCommitRename,
    onDelete,
    onDuplicate,
    onTest,
    onReorderElement,
    onReorderElements,
    hiddenPreviewIds,
    onTogglePreviewHidden
}) => {
    const { t } = useTranslation('ui');
    const { inputProps: renameInputProps } = useInlineRename(screen.name, onCommitRename);
    const elementRadial = useElementRadial();

    // Drag & drop reorder within this screen's element list (same pattern as the scene tree).
    const [draggedElId, setDraggedElId] = useState<VNID | null>(null);
    const [dropElId, setDropElId] = useState<VNID | null>(null);
    const handleElementDrop = (targetId: VNID) => {
        if (!draggedElId || draggedElId === targetId) { setDraggedElId(null); setDropElId(null); return; }
        const ids = (Object.keys(screen.elements || {}) as VNID[]);
        const from = ids.indexOf(draggedElId);
        const to = ids.indexOf(targetId);
        if (from !== -1 && to !== -1) {
            const next = [...ids];
            next.splice(from, 1);
            next.splice(to, 0, draggedElId);
            onReorderElements(next);
        }
        setDraggedElId(null);
        setDropElId(null);
    };

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

                <BookmarkSquareIcon className="w-4 h-4 flex-shrink-0" style={{ color: categoryColor }} title={categoryLabel} />

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

                    {onTest && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onTest(); }}
                            className="p-1 text-emerald-400 hover:text-emerald-300 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                            title={t('manager.testScreen', 'Test this screen (opens it directly, no need to reach it in-game)')}
                        >
                            <span className="block w-3 h-3 text-[10px] leading-3 text-center">▶</span>
                        </button>
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
                    {elements.map((el, i) => (
                        <ScreenChildRow
                            key={el.id}
                            name={el.name || t('manager.unnamed')}
                            typeLabel={ELEMENT_TYPE_LABEL[el.type] || el.type.slice(0, 3).toUpperCase()}
                            badgeClass={INTERACTIVE_TYPES.has(el.type) ? 'bg-amber-500/20 text-amber-300' : 'bg-sky-500/20 text-sky-300'}
                            isPreviewHidden={hiddenPreviewIds.has(el.id)}
                            onTogglePreviewHidden={() => onTogglePreviewHidden(el.id)}
                            isSelected={selectedElementIds.includes(el.id)}
                            onClick={() => onSelectChild(el.id)}
                            onContextMenu={isSelected ? (e) => { e.preventDefault(); onSelectChild(el.id); elementRadial?.openByElementId(el.id, e.clientX, e.clientY); } : undefined}
                            onMoveUp={i > 0 ? () => onReorderElement(el.id, -1) : undefined}
                            onMoveDown={i < elements.length - 1 ? () => onReorderElement(el.id, 1) : undefined}
                            isDragging={draggedElId === el.id}
                            isDropTarget={dropElId === el.id}
                            onDragStart={() => setDraggedElId(el.id)}
                            onDragOver={(e) => { e.preventDefault(); if (draggedElId && draggedElId !== el.id) setDropElId(el.id); }}
                            onDragLeave={() => setDropElId(null)}
                            onDrop={(e) => { e.preventDefault(); handleElementDrop(el.id); }}
                            onDragEnd={() => { setDraggedElId(null); setDropElId(null); }}
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
    /** Reorder within the screen (tree order = base stacking order). Hidden at the list ends. */
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    /** Drag & drop reorder (same pattern as the scene tree). */
    isDragging?: boolean;
    isDropTarget?: boolean;
    onDragStart?: () => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDragLeave?: () => void;
    onDrop?: (e: React.DragEvent) => void;
    onDragEnd?: () => void;
    /** Eye toggle: hide this element on the EDITOR canvas only (never affects the game). */
    isPreviewHidden?: boolean;
    onTogglePreviewHidden?: () => void;
}

const ScreenChildRow: React.FC<ScreenChildRowProps> = ({ name, typeLabel, badgeClass, isSelected, onClick, onContextMenu, onMoveUp, onMoveDown, isDragging, isDropTarget, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, isPreviewHidden, onTogglePreviewHidden }) => {
    const { t } = useTranslation('ui');
    return (
    <div
        draggable={!!onDragStart}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onContextMenu={onContextMenu}
        className={`group/child flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-xs transition-colors ${
            isDragging
                ? 'opacity-40'
                : isDropTarget
                ? 'border border-sky-400 bg-sky-500/10 text-sky-200'
                : isSelected
                ? 'bg-sky-500/20 text-sky-200'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-white'
        }`}
    >
        <span className={`text-[9px] font-mono px-1 rounded ${badgeClass}`}>{typeLabel}</span>
        <span className={`truncate flex-grow ${isPreviewHidden ? 'opacity-40 line-through decoration-1' : ''}`}>{name}</span>
        {onTogglePreviewHidden && (
            <button
                onClick={(e) => { e.stopPropagation(); onTogglePreviewHidden(); }}
                className={`px-0.5 rounded text-[11px] leading-3 flex-shrink-0 transition-opacity ${isPreviewHidden ? 'opacity-100' : 'opacity-0 group-hover/child:opacity-100'} text-[var(--text-secondary)] hover:text-white`}
                title={isPreviewHidden
                    ? t('manager.showOnCanvas', 'Show on the canvas again')
                    : t('manager.hideOnCanvas', 'Hide on the canvas while editing (never affects the game)')}
            >
                {isPreviewHidden ? '🚫' : '👁'}
            </button>
        )}
        {(onMoveUp || onMoveDown) && (
            <span className="flex items-center gap-0.5 opacity-0 group-hover/child:opacity-100 transition-opacity flex-shrink-0">
                <button
                    onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
                    disabled={!onMoveUp}
                    className="px-0.5 rounded text-[10px] leading-3 text-[var(--text-secondary)] hover:text-white disabled:opacity-25"
                    title={t('manager.moveElementUp', 'Move up (drawn earlier — further back)')}
                >↑</button>
                <button
                    onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
                    disabled={!onMoveDown}
                    className="px-0.5 rounded text-[10px] leading-3 text-[var(--text-secondary)] hover:text-white disabled:opacity-25"
                    title={t('manager.moveElementDown', 'Move down (drawn later — further in front)')}
                >↓</button>
            </span>
        )}
    </div>
    );
};

export default React.memo(UIManager);