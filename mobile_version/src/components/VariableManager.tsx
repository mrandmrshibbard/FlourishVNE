import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useInlineRename } from '../hooks/useInlineRename';
import { VNProject } from '../types/project';
import { VNVariable, VNVariableScope } from '../features/variables/types';
import { resolveBoolLabels } from '../features/variables/booleanLabels';
import { useProject } from '../contexts/ProjectContext';
import BooleanLabelEditor from './BooleanLabelEditor';
import BandEditor from './variables/BandEditor';
import VariableMeaningFields from './variables/VariableMeaningFields';
import VariableXray from './variables/VariableXray';
import { PlusIcon, TrashIcon, Cog6ToothIcon, PencilIcon } from './icons';
import { buildVariableUsageIndex, UsageLocation, VariableUsage } from '../utils/variableUsage';
import ConfirmationModal from './ui/ConfirmationModal';

interface VariableManagerProps {
    project: VNProject;
    selectedVariableId?: string | null;
    setSelectedVariableId?: (id: string | null) => void;
    /** Take the author to a place a variable is used (see VisualNovelEditor's jump handler). */
    onJumpToUsage?: (location: UsageLocation) => void;
}

const VariableManager: React.FC<VariableManagerProps> = ({
    project,
    selectedVariableId: controlledSelectedId,
    setSelectedVariableId: setControlledSelectedId,
    onJumpToUsage,
}) => {
    const { dispatch } = useProject();
    const { t } = useTranslation(['variables', 'common']);
    const [internalSelectedVariableId, setInternalSelectedVariableId] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ variableId: string; usages: VariableUsage[] } | null>(null);

    // ONE walk of the project, shared by the row badges and the delete confirmation.
    const usageIndex = useMemo(
        () => buildVariableUsageIndex(project),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [project.scenes, project.uiScreens, project.commonEvents, project.maps, project.miniGames,
         project.items, (project as any).itemCollections, (project as any).stats, (project as any).scripts,
         (project as any).cgGallery, (project as any).ui, project.variables],
    );

    const isControlledSelection = controlledSelectedId !== undefined && typeof setControlledSelectedId === 'function';
    const selectedVariableId = isControlledSelection ? controlledSelectedId ?? null : internalSelectedVariableId;

    const setSelectedVariableId = (id: string | null) => {
        if (isControlledSelection && setControlledSelectedId) {
            setControlledSelectedId(id);
        } else {
            setInternalSelectedVariableId(id);
        }
    };

    const variablesArray = useMemo(
        // Hide system-managed variables (e.g. item-list stock counts, flagged isInternal) to keep this
        // list calm — they still work everywhere by id (conditions, {name}, SetVariable).
        () => (Object.values(project.variables || {}) as VNVariable[]).filter(v => !v.isInternal),
        [project.variables]
    );

    // List controls (persisted): search filter, sort order, and automatic prefix grouping —
    // "halloway_door" / "halloway_key" group under a "halloway" header with zero setup,
    // because prefix naming is how authors already organise big variable sets.
    const [variableSearch, setVariableSearch] = useState('');
    const [sortMode, setSortMode] = useState<'project' | 'az' | 'type'>(() =>
        (localStorage.getItem('flourish.variableManager.sort') as 'project' | 'az' | 'type') || 'project');
    const [groupByPrefix, setGroupByPrefix] = useState<boolean>(() =>
        localStorage.getItem('flourish.variableManager.group') === '1');
    useEffect(() => { try { localStorage.setItem('flourish.variableManager.sort', sortMode); } catch { /* ignore */ } }, [sortMode]);
    useEffect(() => { try { localStorage.setItem('flourish.variableManager.group', groupByPrefix ? '1' : '0'); } catch { /* ignore */ } }, [groupByPrefix]);

    /** Prefix = text before the first '_' or '-' (only when something follows it). */
    const prefixOf = (name: string): string | null => {
        const m = /^([^_\-\s]+)[_-]./.exec(name || '');
        return m ? m[1] : null;
    };

    // Folders: real, author-created sections (project.variableFolders + variable.folderId) that
    // variables are DRAGGED into. Collapse state persists; drag state drives drop highlights.
    const folders = useMemo(
        () => (Object.values(project.variableFolders || {}) as { id: string; name: string }[])
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
        [project.variableFolders]
    );
    const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => {
        try {
            const raw = localStorage.getItem('flourish.variableManager.collapsedFolders');
            const parsed = raw ? JSON.parse(raw) : null;
            return Array.isArray(parsed) ? new Set(parsed) : new Set();
        } catch { return new Set(); }
    });
    useEffect(() => {
        try { localStorage.setItem('flourish.variableManager.collapsedFolders', JSON.stringify(Array.from(collapsedFolders))); } catch { /* ignore */ }
    }, [collapsedFolders]);
    const toggleFolder = (id: string) => setCollapsedFolders(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
    const [dragVarId, setDragVarId] = useState<string | null>(null);
    /** Current drop target while dragging: a folder id, 'loose' (remove from folder), or null. */
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    const dropVariable = (target: string) => {
        if (dragVarId && project.variables[dragVarId]) {
            const folderId = target === 'loose' ? undefined : target;
            if (project.variables[dragVarId].folderId !== folderId) {
                dispatch({ type: 'UPDATE_VARIABLE', payload: { variableId: dragVarId, updates: { folderId } } });
            }
        }
        setDragVarId(null);
        setDropTarget(null);
    };
    const addFolder = () => {
        const name = t('list.newFolderName', 'New folder');
        dispatch({ type: 'ADD_VARIABLE_FOLDER', payload: { name } });
    };
    const deleteFolder = (folderId: string) => {
        // Members go loose; nothing is deleted but the header itself.
        dispatch({ type: 'DELETE_VARIABLE_FOLDER', payload: { folderId } });
    };

    const visibleList = useMemo(() => {
        const q = variableSearch.trim().toLowerCase();
        const list = q
            ? variablesArray.filter(v => v.name.toLowerCase().includes(q) || (v.description || '').toLowerCase().includes(q))
            : variablesArray.slice();
        if (sortMode === 'az') list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        else if (sortMode === 'type') list.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        // 'project' keeps creation order.
        return list;
    }, [variablesArray, variableSearch, sortMode]);

    /** Folder sections first (only members), then the loose list. */
    const { folderSections, looseVariables } = useMemo(() => {
        const validFolderIds = new Set(folders.map(f => f.id));
        const byFolder = new Map<string, VNVariable[]>();
        const loose: VNVariable[] = [];
        for (const v of visibleList) {
            if (v.folderId && validFolderIds.has(v.folderId)) {
                const g = byFolder.get(v.folderId) || [];
                g.push(v);
                byFolder.set(v.folderId, g);
            } else {
                loose.push(v); // dangling folderId = loose (never hide a variable)
            }
        }
        return {
            folderSections: folders.map(f => ({ folder: f, items: byFolder.get(f.id) || [] })),
            looseVariables: loose,
        };
    }, [folders, visibleList]);

    /** Prefix auto-grouping applies to the LOOSE variables only (folders are explicit). */
    const looseGroups = useMemo(() => {
        if (!groupByPrefix) return [{ label: null as string | null, items: looseVariables }];
        const groups = new Map<string, VNVariable[]>();
        const loose: VNVariable[] = [];
        for (const v of looseVariables) {
            const p = prefixOf(v.name);
            if (p) { const g = groups.get(p) || []; g.push(v); groups.set(p, g); }
            else loose.push(v);
        }
        // Only groups with 2+ members earn a header; singletons stay with the loose ones.
        const out: { label: string | null; items: VNVariable[] }[] = [];
        const looseAll = [...loose];
        for (const [label, items] of Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
            if (items.length >= 2) out.push({ label, items });
            else looseAll.push(...items);
        }
        if (looseAll.length) {
            if (sortMode !== 'project') looseAll.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
            out.push({ label: null, items: looseAll });
        }
        return out;
    }, [looseVariables, groupByPrefix, sortMode]);

    const addVariable = () => {
        const name = t('newVariableName', { n: Object.keys(project.variables || {}).length + 1 });
        dispatch({ type: 'ADD_VARIABLE', payload: { name, type: 'number', defaultValue: 0 } });
    };

    const handleRequestDelete = (variableId: string) => {
        if (!project.variables[variableId]) return;
        // The REAL usage count. The old findVariableUsages guarded its UI branch with
        // `Array.isArray(screen.elements)` — but elements is a Record, so it never walked a single UI
        // screen, and this dialog cheerfully told authors a variable their whole UI depended on was
        // used nowhere.
        setDeleteConfirm({ variableId, usages: usageIndex.byVariable.get(variableId as any) ?? [] });
    };

    const handleDeleteVariable = (variableId: string) => {
        dispatch({ type: 'DELETE_VARIABLE', payload: { variableId } });
        if (selectedVariableId === variableId) {
            setSelectedVariableId(null);
        }
        setDeleteConfirm(null);
    };

    const handleRenameVariable = (variableId: string, name: string) => {
        dispatch({ type: 'UPDATE_VARIABLE', payload: { variableId, updates: { name } } });
        setRenamingId(null);
    };

    const handleUpdateVariable = (variableId: string, updates: Partial<VNVariable>) => {
        dispatch({ type: 'UPDATE_VARIABLE', payload: { variableId, updates } });
    };

    return (
        <div className="flex h-full">
            {/* Variables List Sidebar */}
            <div className="w-80 bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] flex flex-col">
                <div className="p-4 border-b border-[var(--border-subtle)] space-y-2">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Cog6ToothIcon className="w-5 h-5" />
                        {t('listTitle')}
                    </h2>
                    <input
                        type="text"
                        value={variableSearch}
                        onChange={e => setVariableSearch(e.target.value)}
                        autoFocus
                        placeholder={t('list.searchPlaceholder', 'Search variables…')}
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded px-2 py-1 text-sm text-white outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    <div className="flex items-center gap-2">
                        <select
                            value={sortMode}
                            onChange={e => setSortMode(e.target.value as 'project' | 'az' | 'type')}
                            className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded px-1.5 py-1 text-xs text-white"
                            title={t('list.sortTitle', 'How the list is ordered')}
                        >
                            <option value="project">{t('list.sortProject', 'Creation order')}</option>
                            <option value="az">{t('list.sortAz', 'A → Z')}</option>
                            <option value="type">{t('list.sortType', 'By type')}</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)] cursor-pointer whitespace-nowrap" title={t('list.groupHint', 'Variables named like "hero_gold" and "hero_trust" group under a "hero" heading')}>
                            <input type="checkbox" checked={groupByPrefix} onChange={e => setGroupByPrefix(e.target.checked)} />
                            {t('list.group', 'Group')}
                        </label>
                        <button
                            onClick={addFolder}
                            className="px-1.5 py-1 rounded text-xs bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white hover:border-sky-500/50 whitespace-nowrap"
                            title={t('list.newFolder', 'New folder — drag variables into it to organise them')}
                        >
                            📁+
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {(() => {
                        const renderVariableRow = (variable: VNVariable) => {
                            const health = usageIndex.health.get(variable.id as any);
                            return (
                                <VariableItem
                                    key={variable.id}
                                    variable={variable}
                                    usageCount={(usageIndex.byVariable.get(variable.id as any) ?? []).length}
                                    hasProblem={!!health && (health.orphan || health.neverChanged || health.neverUsed || health.impossible.length > 0)}
                                    isSelected={selectedVariableId === variable.id}
                                    isRenaming={renamingId === variable.id}
                                    onSelect={() => setSelectedVariableId(variable.id)}
                                    onStartRenaming={() => setRenamingId(variable.id)}
                                    onCommitRename={(name) => handleRenameVariable(variable.id, name)}
                                    onDelete={() => handleRequestDelete(variable.id)}
                                    onDragStartRow={() => setDragVarId(variable.id)}
                                    onDragEndRow={() => { setDragVarId(null); setDropTarget(null); }}
                                />
                            );
                        };
                        const searching = !!variableSearch.trim();
                        const empty = folderSections.every(s => s.items.length === 0) && looseVariables.length === 0;
                        return <>
                            {/* Author-made folders — whole section is a drop target while dragging. */}
                            {folderSections.map(({ folder, items }) => {
                                const collapsed = collapsedFolders.has(folder.id) && !searching;
                                const isTarget = dropTarget === folder.id && !!dragVarId;
                                return (
                                    <div
                                        key={folder.id}
                                        onDragOver={(e) => { if (dragVarId) { e.preventDefault(); if (dropTarget !== folder.id) setDropTarget(folder.id); } }}
                                        onDragLeave={() => setDropTarget(prev => prev === folder.id ? null : prev)}
                                        onDrop={(e) => { e.preventDefault(); dropVariable(folder.id); }}
                                        className={`rounded-md transition-colors ${isTarget ? 'ring-1 ring-sky-400 bg-sky-500/10' : ''}`}
                                    >
                                        <VariableFolderHeader
                                            folder={folder}
                                            count={items.length}
                                            collapsed={collapsed}
                                            isRenaming={renamingFolderId === folder.id}
                                            onToggle={() => toggleFolder(folder.id)}
                                            onStartRename={() => setRenamingFolderId(folder.id)}
                                            onCommitRename={(name) => { if (name.trim()) dispatch({ type: 'RENAME_VARIABLE_FOLDER', payload: { folderId: folder.id, name: name.trim() } }); setRenamingFolderId(null); }}
                                            onDelete={() => deleteFolder(folder.id)}
                                        />
                                        {!collapsed && items.map(renderVariableRow)}
                                        {!collapsed && items.length === 0 && !searching && (
                                            <p className="pl-7 pb-1 text-[10px] text-[var(--text-muted)] italic">{t('list.dragHere', 'Drag variables here')}</p>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Loose variables — dropping here takes a variable OUT of its folder. */}
                            <div
                                onDragOver={(e) => { if (dragVarId) { e.preventDefault(); if (dropTarget !== 'loose') setDropTarget('loose'); } }}
                                onDragLeave={() => setDropTarget(prev => prev === 'loose' ? null : prev)}
                                onDrop={(e) => { e.preventDefault(); dropVariable('loose'); }}
                                className={`rounded-md transition-colors min-h-[2rem] ${dropTarget === 'loose' && dragVarId ? 'ring-1 ring-sky-400 bg-sky-500/10' : ''}`}
                            >
                                {folderSections.length > 0 && looseVariables.length > 0 && (
                                    <div className="px-1 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                                        {t('list.noFolder', 'Not in a folder')}
                                    </div>
                                )}
                                {looseGroups.map((group, gi) => (
                                    <React.Fragment key={group.label ?? `loose-${gi}`}>
                                        {group.label && (
                                            <div className="px-1 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] flex items-center gap-1">
                                                <span className="truncate">{group.label}</span>
                                                <span className="font-normal">({group.items.length})</span>
                                            </div>
                                        )}
                                        {group.items.map(renderVariableRow)}
                                    </React.Fragment>
                                ))}
                            </div>
                            {empty && (
                                <p className="text-xs text-[var(--text-muted)] italic p-2">{t('list.noResults', 'No variables match your search.')}</p>
                            )}
                        </>;
                    })()}
                </div>

                <div className="p-2 border-t border-[var(--border-subtle)]">
                    <button
                        onClick={addVariable}
                        className="w-full bg-sky-500 hover:bg-sky-600 text-white p-2 rounded-md flex items-center justify-center gap-2 font-bold transition-colors"
                    >
                        <PlusIcon className="w-4 h-4" />
                        {t('addVariable')}
                    </button>
                </div>
            </div>

            {/* Variable Inspector */}
            <div className="flex-1 flex flex-col min-w-0">
                {selectedVariableId ? (
                    <VariableInspector
                        variableId={selectedVariableId}
                        project={project}
                        onUpdate={(updates) => handleUpdateVariable(selectedVariableId, updates)}
                        onJumpToUsage={onJumpToUsage}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
                        <div className="text-center">
                            <Cog6ToothIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p className="text-lg">{t('selectToInspect')}</p>
                            <p className="text-sm">{t('selectToInspectHint')}</p>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Delete Confirmation Modal with Usage Info */}
            {deleteConfirm && (
                <ConfirmationModal
                    isOpen={true}
                    onClose={() => setDeleteConfirm(null)}
                    onConfirm={() => handleDeleteVariable(deleteConfirm.variableId)}
                    title={deleteConfirm.usages.length > 0 ? t('delete.inUseTitle') : t('delete.deleteTitle')}
                    confirmLabel={deleteConfirm.usages.length > 0 ? t('delete.deleteAnyway') : t('common:delete')}
                >
                    {deleteConfirm.usages.length > 0 ? (
                        <div className="space-y-3">
                            <p className="text-[var(--text-primary)]">
                                {t('delete.inUseBody', { count: deleteConfirm.usages.length })}
                            </p>
                            <div className="max-h-48 overflow-y-auto bg-[var(--bg-tertiary)] rounded-lg p-3">
                                <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">{t('delete.usagesFound')}</p>
                                <ul className="space-y-1.5 text-sm">
                                    {deleteConfirm.usages.slice(0, 10).map((usage, i) => (
                                        <li key={i} className="flex items-start gap-2 text-[var(--text-secondary)]">
                                            <span className="flex-shrink-0 text-xs font-mono">
                                                {usage.kind === 'set' && '✎'}
                                                {usage.kind === 'ask' && '⌨'}
                                                {usage.kind === 'check' && '?'}
                                                {usage.kind === 'show' && '👁'}
                                            </span>
                                            <span>
                                                <strong>{usage.where}</strong>
                                                <br />
                                                <span className="text-xs opacity-75">{usage.what}</span>
                                            </span>
                                        </li>
                                    ))}
                                    {deleteConfirm.usages.length > 10 && (
                                        <li className="text-xs text-[var(--text-secondary)] italic pt-1">
                                            {t('delete.andMore', { count: deleteConfirm.usages.length - 10 })}
                                        </li>
                                    )}
                            </ul>
                        </div>
                    </div>
                    ) : (
                        <p className="text-[var(--text-primary)]">
                            {t('delete.confirmBody')}
                        </p>
                    )}
                </ConfirmationModal>
            )}
        </div>
    );
};

interface VariableItemProps {
    variable: VNVariable;
    /** How many places in the whole project touch this. */
    usageCount: number;
    /** Never changed / never read / an impossible check — anything worth a second look. */
    hasProblem: boolean;
    isSelected: boolean;
    isRenaming: boolean;
    onSelect: () => void;
    onStartRenaming: () => void;
    onCommitRename: (name: string) => void;
    onDelete: () => void;
    /** Drag-to-folder support (folders are the drop targets in the parent list). */
    onDragStartRow?: () => void;
    onDragEndRow?: () => void;
}

/** A folder's header row: chevron + name (double-click / pencil to rename) + count + delete.
 *  The parent wraps it (plus the member rows) in the drag-and-drop target. */
const VariableFolderHeader: React.FC<{
    folder: { id: string; name: string };
    count: number;
    collapsed: boolean;
    isRenaming: boolean;
    onToggle: () => void;
    onStartRename: () => void;
    onCommitRename: (name: string) => void;
    onDelete: () => void;
}> = ({ folder, count, collapsed, isRenaming, onToggle, onStartRename, onCommitRename, onDelete }) => {
    const { t } = useTranslation(['variables', 'common']);
    const { inputProps: renameInputProps } = useInlineRename(folder.name, onCommitRename);
    return (
        <div
            onClick={onToggle}
            onDoubleClick={(e) => { e.stopPropagation(); onStartRename(); }}
            className="group/folder flex items-center gap-1 px-1 py-1 rounded cursor-pointer text-xs font-bold text-[var(--text-secondary)] hover:text-white"
        >
            <span className="text-[9px] w-3 text-center">{collapsed ? '▶' : '▼'}</span>
            <span>📁</span>
            {isRenaming ? (
                <input
                    type="text"
                    {...renameInputProps}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-[var(--bg-primary)] text-white px-1 py-0.5 rounded text-xs outline-none ring-1 ring-sky-500 font-normal"
                />
            ) : (
                <span className="flex-1 min-w-0 truncate uppercase tracking-wide">{folder.name}</span>
            )}
            <span className="font-normal text-[var(--text-muted)]">({count})</span>
            <button
                onClick={(e) => { e.stopPropagation(); onStartRename(); }}
                className="p-0.5 opacity-0 group-hover/folder:opacity-100 text-[var(--text-muted)] hover:text-sky-400"
                title={t('common:rename')}
            >
                <PencilIcon className="w-3 h-3" />
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); if (window.confirm(t('list.deleteFolderConfirm', 'Delete the folder "{{name}}"? The variables inside are kept — they just leave the folder.', { name: folder.name }))) onDelete(); }}
                className="p-0.5 opacity-0 group-hover/folder:opacity-100 text-[var(--text-muted)] hover:text-red-400"
                title={t('common:delete')}
            >
                <TrashIcon className="w-3 h-3" />
            </button>
        </div>
    );
};

const VariableItem: React.FC<VariableItemProps> = ({
    variable,
    usageCount,
    hasProblem,
    isSelected,
    isRenaming,
    onSelect,
    onStartRenaming,
    onCommitRename,
    onDelete,
    onDragStartRow,
    onDragEndRow
}) => {
    const { t } = useTranslation(['variables', 'common']);
    const { inputProps: renameInputProps } = useInlineRename(variable.name, onCommitRename);

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'number': return '#';
            case 'string': return 'Aa';
            case 'boolean': return '✓';
            default: return '?';
        }
    };

    const scope: VNVariableScope = variable.scope || 'global';
    const scopeColors: Record<VNVariableScope, { bg: string; border: string; text: string; label: string }> = {
        local: { bg: 'bg-emerald-600/20', border: 'border-emerald-500/50', text: 'text-emerald-400', label: 'Local' },
        global: { bg: 'bg-sky-600/20', border: 'border-sky-500/50', text: 'text-sky-400', label: 'Global' },
        persistent: { bg: 'bg-amber-600/20', border: 'border-amber-500/50', text: 'text-amber-400', label: 'Persistent' },
    };
    const sc = scopeColors[scope];

    return (
        <div
            onClick={onSelect}
            onDoubleClick={onStartRenaming}
            draggable={!!onDragStartRow && !isRenaming}
            onDragStart={onDragStartRow}
            onDragEnd={onDragEndRow}
            className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                isSelected
                    ? `${sc.bg} border ${sc.border}`
                    : 'hover:bg-[var(--bg-secondary)]'
            }`}
        >
            {/* The author's own icon/colour if they gave one — recognised by shape, not read.
                Doubles as the row's TYPE indicator (glyph + hover tooltip), so the list needs
                no separate type badge. */}
            <div
                className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-sm border ${variable.icon || variable.color ? '' : `${sc.bg} ${sc.border}`}`}
                title={t(`types.${variable.type}`)}
                style={variable.icon || variable.color ? {
                    background: `color-mix(in srgb, ${variable.color ?? 'var(--accent-sky)'} 22%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${variable.color ?? 'var(--accent-sky)'} 50%, transparent)`,
                } : undefined}
            >
                {variable.icon || getTypeIcon(variable.type)}
            </div>

            <div className="flex-grow min-w-0">
                {isRenaming ? (
                    <input
                        type="text"
                        {...renameInputProps}
                        className="w-full bg-[var(--bg-primary)] text-white p-1 rounded text-sm outline-none ring-1 ring-sky-500"
                    />
                ) : (
                    <>
                        {/* Full name, wrapping to two lines — a single truncated line made
                            "halloway_door" / "halloway_key" / "halloway_safe" all read "hallo…"
                            (user report). Clamped at 2 lines; the hover title has the rest. */}
                        {/* Keep the row to the essentials: name + scope + type. Bands, description
                            and usage details live in the inspector after clicking (the hover title
                            still carries the description for a quick peek). */}
                        <span
                            className="text-sm block leading-tight"
                            title={variable.description ? `${variable.name} — ${variable.description}` : variable.name}
                            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden', wordBreak: 'break-word' }}
                        >
                            {variable.name}
                        </span>
                    </>
                )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                {/* Health warnings still surface at a glance, but ONLY when something's wrong —
                    the always-on usage-count badge moved into the inspector (X-ray). */}
                {hasProblem && (
                    <span
                        className="text-[10px] px-1 py-0.5 rounded"
                        style={{ background: 'var(--bg-tertiary)', color: 'var(--accent-yellow)' }}
                        title={usageCount === 0
                            ? t('xray.rowNone', 'Nothing uses this yet')
                            : t('xray.rowCount', 'Used in {{count}} places', { count: usageCount })}
                    >
                        ⚠
                    </span>
                )}
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${sc.bg} ${sc.text} border ${sc.border}`}>
                    {t(`scopes.${scope}`)}
                </span>

                <button
                    onClick={(e) => { e.stopPropagation(); onStartRenaming(); }}
                    className="p-1 text-[var(--text-muted)] hover:text-sky-400 transition-opacity"
                    title={t('common:rename')}
                >
                    <PencilIcon className="w-3 h-3" />
                </button>

                <button
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        console.log('[VariableItem] Delete button clicked for:', variable.id);
                        onDelete(); 
                    }}
                    className="p-1 text-red-500 hover:text-red-400 transition-opacity"
                    title={t('common:delete')}
                >
                    <TrashIcon className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
};

interface VariableInspectorProps {
    variableId: string;
    project: VNProject;
    onUpdate: (updates: Partial<VNVariable>) => void;
    onJumpToUsage?: (location: UsageLocation) => void;
}

const VariableInspector: React.FC<VariableInspectorProps> = ({ variableId, project, onUpdate, onJumpToUsage }) => {
    const { t } = useTranslation('variables');
    const variable = project.variables?.[variableId];

    if (!variable) {
        return (
            <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
                <p>{t('notFound')}</p>
            </div>
        );
    }

    const handleTypeChange = (type: 'number' | 'string' | 'boolean') => {
        let defaultValue: any = variable.defaultValue;

        // Convert default value to new type
        switch (type) {
            case 'number':
                defaultValue = typeof variable.defaultValue === 'number' ? variable.defaultValue : 0;
                break;
            case 'string':
                defaultValue = String(variable.defaultValue);
                break;
            case 'boolean':
                defaultValue = Boolean(variable.defaultValue);
                break;
        }

        // min/max only apply to number variables — drop any stale bounds when leaving that type.
        onUpdate({ type, defaultValue, ...(type !== 'number' ? { min: undefined, max: undefined } : {}) });
    };

    const handleDefaultValueChange = (value: any) => {
        onUpdate({ defaultValue: value });
    };

    const currentScope: VNVariableScope = variable.scope || 'global';
    const boolLbls = resolveBoolLabels(variable, t('boolean.true'), t('boolean.false'));

    return (
        <div className="flex-1 p-4 overflow-y-auto">
            <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                {variable.icon && <span>{variable.icon}</span>}
                <span>{variable.name}</span>
            </h3>
            <div className="mb-4">
                <VariableMeaningFields variable={variable} onChange={onUpdate} />
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('scopeLabel')}</label>
                    <select
                        value={currentScope}
                        onChange={(e) => onUpdate({ scope: e.target.value as VNVariableScope })}
                        className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="local">{t('scopeOptions.local')}</option>
                        <option value="global">{t('scopeOptions.global')}</option>
                        <option value="persistent">{t('scopeOptions.persistent')}</option>
                    </select>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{t(`scopeDesc.${currentScope}`)}</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('typeLabel')}</label>
                    <select
                        value={variable.type}
                        onChange={(e) => handleTypeChange(e.target.value as 'number' | 'string' | 'boolean')}
                        className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="number">{t('types.number')}</option>
                        <option value="string">{t('types.string')}</option>
                        <option value="boolean">{t('types.boolean')}</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('defaultValue')}</label>
                    {variable.type === 'boolean' ? (
                        <select
                            value={variable.defaultValue ? 'true' : 'false'}
                            onChange={(e) => handleDefaultValueChange(e.target.value === 'true')}
                            className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        >
                            <option value="false">{boolLbls.no}</option>
                            <option value="true">{boolLbls.yes}</option>
                        </select>
                    ) : variable.type === 'number' ? (
                        <input
                            type="number"
                            value={variable.defaultValue}
                            onChange={(e) => handleDefaultValueChange(parseFloat(e.target.value) || 0)}
                            className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        />
                    ) : (
                        <input
                            type="text"
                            value={variable.defaultValue}
                            onChange={(e) => handleDefaultValueChange(e.target.value)}
                            className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        />
                    )}
                </div>

                {variable.type === 'number' && (
                    <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('valueBounds', 'Value range (optional)')}</label>
                        <div className="grid grid-cols-2 gap-3">
                            <input
                                type="number"
                                placeholder={t('noMin', 'No minimum')}
                                value={variable.min ?? ''}
                                onChange={(e) => onUpdate({ min: e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0) })}
                                className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                            />
                            <input
                                type="number"
                                placeholder={t('noMax', 'No maximum')}
                                value={variable.max ?? ''}
                                onChange={(e) => onUpdate({ max: e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0) })}
                                className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                            />
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">{t('valueBoundsHint', 'Every change (Set Variable from commands, buttons, or choices) is clamped to this range, so a value can never overshoot what you intend (e.g. keep affection between 0 and 100).')}</p>
                    </div>
                )}

                {variable.type === 'boolean' && (
                    <BooleanLabelEditor trueLabel={variable.trueLabel} falseLabel={variable.falseLabel}
                        onChange={updates => onUpdate(updates)} />
                )}

                {/* Named ranges — "boolean labels, but for numbers". */}
                {variable.type === 'number' && (
                    <BandEditor variable={variable} onChange={onUpdate} />
                )}

                {/* Where this is used — the answer to "what is this thing even doing any more?" */}
                <VariableXray project={project} variableId={variable.id} onJump={onJumpToUsage} />

                <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t border-[var(--border-subtle)]">
                    <div>
                        <span className="text-[var(--text-secondary)]">{t('idLabel')}</span>
                        <span className="text-white ml-2 font-mono text-xs">{variable.id}</span>
                    </div>
                    <div>
                        <span className="text-[var(--text-secondary)]">{t('typeColon')}</span>
                        <span className="text-white ml-2">{t(`types.${variable.type}`)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(VariableManager);