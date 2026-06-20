/**
 * SystemsManager — the "Systems" hub. Houses opt-in gameplay systems (Inventory first)
 * and the item registry. Items are sugar over a backing count variable (see itemReducer),
 * so everything an item drives — conditions, {name} interpolation, SetVariable — works with
 * the existing tooling. This screen is the front door the pre-built systems were missing.
 *
 * Layout: 3 panes — [systems list] · [item list] · [selected item details].
 */
import React, { useMemo, useState } from 'react';
import { VNProject } from '../types/project';
import { VNItem, VNItemCollection, RestockAmountMode, RestockTrigger } from '../features/items/types';
import { VNStat } from '../features/stats/types';
import { useProject } from '../contexts/ProjectContext';
import { getScreenCategory } from '../utils/screenCategory';
import { createUIElement } from '../utils/uiElementFactory';
import { UIElementType, UIInventoryGridElement, UIMeterElement } from '../features/ui/types';
import { findSystemScreenLinks, SystemScreenLink } from '../utils/systemScreenLinks';
import SystemWizard from './menu-editor/SystemWizard';
import { applySystemWizardResult } from '../features/systems/applySystem';
import { UIActionType, VNCondition } from '../types/shared';
import { VNID } from '../types';
import { FormField, TextInput, TextArea, Select, ColorInput } from './ui/Form';
import AssetSelector from './ui/AssetSelector';
import UIActionsListEditor from './ui/UIActionsListEditor';
import ConditionsEditor from './ui/ConditionsEditor';
import { PlusIcon, TrashIcon, SparklesIcon, ArchiveBoxIcon, GridIcon, PencilIcon, ChevronDownIcon, ChevronRightIcon, AdjustmentsIcon } from './icons';

type SystemId = 'inventory' | 'items' | 'stats';

interface SystemsManagerProps {
    project?: VNProject;
    /** Jump to the UI editor with a screen (and optionally an element) selected. */
    onOpenScreenInEditor?: (screenId: VNID, elementId?: VNID) => void;
    /** One-shot deep link from the UI editor ("Manage in Systems" on a grid/meter). */
    initialSelection?: { system: SystemId; id?: VNID } | null;
    onSelectionConsumed?: () => void;
}

const SystemsManager: React.FC<SystemsManagerProps> = ({ project: projectProp, onOpenScreenInEditor, initialSelection, onSelectionConsumed }) => {
    const { project: ctxProject, dispatch } = useProject();
    const project = projectProp || ctxProject;
    const [selectedSystem, setSelectedSystem] = useState<SystemId>('items');
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [selectedListId, setSelectedListId] = useState<VNID | null>(null);
    const [selectedStatId, setSelectedStatId] = useState<VNID | null>(null);
    const [inventoryExpanded, setInventoryExpanded] = useState(true);
    const [wizardKind, setWizardKind] = useState<'shop' | 'inventory' | null>(null);

    // Consume a deep link from the UI editor exactly once, then clear it so it
    // can't fight subsequent user clicks.
    React.useEffect(() => {
        if (!initialSelection) return;
        setSelectedSystem(initialSelection.system);
        if (initialSelection.system === 'inventory') { setSelectedListId(initialSelection.id || null); setInventoryExpanded(true); }
        else if (initialSelection.system === 'items') setSelectedItemId(initialSelection.id || null);
        else if (initialSelection.system === 'stats') setSelectedStatId(initialSelection.id || null);
        onSelectionConsumed?.();
    }, [initialSelection]);

    const items = useMemo(() => (Object.values(project.items || {}) as VNItem[]).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [project.items]);
    const selected = selectedItemId ? project.items?.[selectedItemId] : null;
    const collections = useMemo(() => (Object.values(project.itemCollections || {}) as VNItemCollection[]).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [project.itemCollections]);
    const selectedList = selectedListId ? project.itemCollections?.[selectedListId] : null;

    // ── Item list (collection) CRUD ──
    const addList = () => {
        const id = `coll-${Math.random().toString(36).substring(2, 9)}`;
        dispatch({ type: 'ADD_ITEM_COLLECTION', payload: { id, name: `List ${collections.length + 1}` } });
        setSelectedSystem('inventory');
        setSelectedListId(id);
        setInventoryExpanded(true);
    };
    const updateList = (collectionId: VNID, updates: Partial<VNItemCollection>) => dispatch({ type: 'UPDATE_ITEM_COLLECTION', payload: { collectionId, updates } });
    const removeList = (collectionId: VNID) => {
        dispatch({ type: 'DELETE_ITEM_COLLECTION', payload: { collectionId, deleteCountVariables: true } });
        if (selectedListId === collectionId) setSelectedListId(null);
    };
    const addEntry = (collectionId: VNID, itemId: VNID) => dispatch({ type: 'ADD_COLLECTION_ENTRY', payload: { collectionId, itemId, startQty: 0 } });
    const updateEntry = (collectionId: VNID, itemId: VNID, updates: { startQty?: number; restockTo?: number; restockMin?: number; price?: number; infiniteStock?: boolean }) => dispatch({ type: 'UPDATE_COLLECTION_ENTRY', payload: { collectionId, itemId, updates } });
    const removeEntry = (collectionId: VNID, itemId: VNID) => dispatch({ type: 'REMOVE_COLLECTION_ENTRY', payload: { collectionId, itemId } });

    // Screens already categorized as "system" (the inventory/shop screens) — connects the hub to
    // the new screen-category system.
    const systemScreens = useMemo(
        () => Object.values(project.uiScreens || {}).filter(s => getScreenCategory(s as any, project) === 'system'),
        [project.uiScreens]
    );
    const systemScreenCount = systemScreens.length;

    // Create a System-categorized screen pre-loaded with an Inventory grid, then jump to the UI editor
    // to arrange it. The inventory opens as a paused, dimmed modal overlay (Phase 0 behaviors).
    const createInventoryScreen = (collectionId?: VNID, screenName = 'Inventory') => {
        const screenId: VNID = `screen-${Math.random().toString(36).substring(2, 9)}`;
        dispatch({ type: 'ADD_UI_SCREEN', payload: { id: screenId, name: screenName } });
        dispatch({ type: 'UPDATE_UI_SCREEN', payload: { screenId, updates: { category: 'system', showDialogue: false, pauseSceneWhileOpen: true, backdropOpacity: 0.6 } } });
        const grid = createUIElement(UIElementType.Inventory, project) as UIInventoryGridElement | null;
        // Bind the grid to a specific list (shop/library/…); unset = the player's own inventory.
        if (grid && collectionId) { grid.collectionId = collectionId; grid.hideUnowned = false; }
        if (grid) dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId, element: grid } });
        // Top-right exit button that returns to the game when clicked.
        const closeBtn = createUIElement(UIElementType.Button, project) as any;
        if (closeBtn) {
            closeBtn.name = 'Close'; closeBtn.text = '✕';
            closeBtn.x = 94; closeBtn.y = 6; closeBtn.width = 7; closeBtn.height = 7; closeBtn.anchorX = 0.5; closeBtn.anchorY = 0.5;
            closeBtn.action = { type: UIActionType.ReturnToGame };
            closeBtn.actions = [{ type: UIActionType.ReturnToGame }];
            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId, element: closeBtn } });
        }
        onOpenScreenInEditor?.(screenId, grid?.id);
    };

    // Drop a Meter for this stat onto the game HUD-style screen: a small overlay screen with one
    // meter per target (per character, or the single global bar), then jump to the UI editor.
    const createStatMeterScreen = (stat: VNStat) => {
        const screenId: VNID = `screen-${Math.random().toString(36).substring(2, 9)}`;
        dispatch({ type: 'ADD_UI_SCREEN', payload: { id: screenId, name: `${stat.name} Meters` } });
        dispatch({ type: 'UPDATE_UI_SCREEN', payload: { screenId, updates: { category: 'system', showDialogue: false, pauseSceneWhileOpen: true, backdropOpacity: 0.6 } } });
        const targets = Object.entries(stat.variableIds);
        let firstMeterId: VNID | undefined;
        targets.forEach(([target, varId], i) => {
            const meter = createUIElement(UIElementType.Meter, project) as UIMeterElement | null;
            if (!meter) return;
            meter.variableId = varId;
            meter.fillColor = stat.color || meter.fillColor;
            meter.name = target === 'global' ? stat.name : (project.characters[target]?.name || stat.name);
            meter.x = 35; meter.y = 15 + i * 10; meter.width = 30; meter.height = 6;
            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId, element: meter } });
            if (!firstMeterId) firstMeterId = meter.id;
        });
        const closeBtn = createUIElement(UIElementType.Button, project) as any;
        if (closeBtn) {
            closeBtn.name = 'Close'; closeBtn.text = '✕';
            closeBtn.x = 94; closeBtn.y = 6; closeBtn.width = 7; closeBtn.height = 7; closeBtn.anchorX = 0.5; closeBtn.anchorY = 0.5;
            closeBtn.action = { type: UIActionType.ReturnToGame };
            closeBtn.actions = [{ type: UIActionType.ReturnToGame }];
            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId, element: closeBtn } });
        }
        onOpenScreenInEditor?.(screenId, firstMeterId);
    };

    // "Shown on these screens" — the workflow bridge back to the UI editor.
    const ConnectedScreens: React.FC<{ links: SystemScreenLink[]; emptyHint: string }> = ({ links, emptyHint }) => (
        <div className="mt-3">
            <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Shown on these screens</h4>
            {links.length === 0
                ? <p className="text-[11px] text-[var(--text-muted)] italic">{emptyHint}</p>
                : <div className="space-y-1">
                    {links.map(l => (
                        <div key={`${l.screenId}-${l.elementId}`} className="flex items-center gap-2 bg-[var(--bg-secondary)]/40 rounded-lg p-2 border border-transparent hover:border-[var(--border-default)]">
                            <GridIcon className="w-4 h-4 text-[var(--accent-mint)] flex-shrink-0" />
                            <span className="text-sm text-white truncate flex-1">{l.screenName}</span>
                            <button onClick={() => onOpenScreenInEditor?.(l.screenId, l.elementId)} className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"><PencilIcon className="w-3.5 h-3.5" /> Edit screen</button>
                        </div>
                    ))}
                </div>}
        </div>
    );

    const addItem = () => {
        const id = `item-${Math.random().toString(36).substring(2, 9)}`;
        dispatch({ type: 'ADD_ITEM', payload: { id, name: `Item ${items.length + 1}`, scope: 'global', usable: false } });
        setSelectedSystem('items');
        setSelectedItemId(id);
    };
    const update = (itemId: string, updates: Partial<VNItem>) => dispatch({ type: 'UPDATE_ITEM', payload: { itemId, updates } });
    const remove = (itemId: string) => {
        dispatch({ type: 'DELETE_ITEM', payload: { itemId, deleteCountVariable: true } });
        if (selectedItemId === itemId) setSelectedItemId(null);
    };
    // Reorder the registry by rewriting every item's `order` to its new index — this is the default
    // order the inventory grid uses (players can further rearrange their own copy in-game).
    const moveItem = (itemId: string, dir: -1 | 1) => {
        const arr = [...items];
        const i = arr.findIndex(x => x.id === itemId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        arr.forEach((it, idx) => { if ((it.order ?? -1) !== idx) dispatch({ type: 'UPDATE_ITEM', payload: { itemId: it.id, updates: { order: idx } } }); });
    };

    // ── Stats CRUD ──
    const stats = useMemo(() => (Object.values(project.stats || {}) as VNStat[]).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [project.stats]);
    const selectedStat = selectedStatId ? project.stats?.[selectedStatId] : null;
    const addStat = () => {
        const id = `stat-${Math.random().toString(36).substring(2, 9)}`;
        dispatch({ type: 'ADD_STAT', payload: { id, name: `Stat ${stats.length + 1}`, min: 0, max: 100, defaultValue: 0 } });
        setSelectedSystem('stats');
        setSelectedStatId(id);
    };
    const updateStat = (statId: VNID, updates: Partial<VNStat>) => dispatch({ type: 'UPDATE_STAT', payload: { statId, updates } });
    const removeStat = (statId: VNID) => {
        dispatch({ type: 'DELETE_STAT', payload: { statId, deleteVariables: true } });
        if (selectedStatId === statId) setSelectedStatId(null);
    };
    const setStatCharacters = (statId: VNID, characterIds: VNID[]) => dispatch({ type: 'SET_STAT_CHARACTERS', payload: { statId, characterIds } });
    const allCharacters = useMemo(() => Object.values(project.characters || {}) as any[], [project.characters]);

    const countVar = selected ? project.variables[selected.countVariableId] : null;
    const countVarName = countVar?.name || selected?.name || '';
    const startQty = Number(countVar?.defaultValue ?? 0);
    const setStartQty = (n: number) => {
        if (selected) dispatch({ type: 'UPDATE_VARIABLE', payload: { variableId: selected.countVariableId, updates: { defaultValue: Math.max(0, Math.floor(n) || 0) } } });
    };

    const iconUrlFor = (it: VNItem): string | null =>
        it.icon?.id ? ((project.images[it.icon.id] as any)?.imageUrl || (project.videos?.[it.icon.id] as any)?.videoUrl || null) : null;

    const sysBtn = (id: SystemId, icon: React.ReactNode, label: string, badge?: React.ReactNode) => (
        <button onClick={() => { setSelectedSystem(id); setSelectedListId(null); }}
            className={`w-full flex items-center gap-2.5 p-3 rounded-lg text-left transition-all border ${selectedSystem === id ? 'bg-gradient-to-r from-[var(--accent-lavender)]/20 to-transparent border-[var(--accent-lavender)]/50' : 'bg-[var(--bg-secondary)]/40 border-transparent hover:bg-[var(--bg-secondary)]'}`}>
            <span className="text-[var(--accent-lavender)]">{icon}</span>
            <span className="font-medium text-white text-sm flex-1">{label}</span>
            {badge}
        </button>
    );

    return (
        <div className="flex h-full">
            {/* ── Pane 1: Systems ── */}
            <div style={{ width: 'var(--sidebar-width)' }} className="bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] flex flex-col">
                <div className="p-4 border-b border-[var(--border-subtle)]">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2"><SparklesIcon className="w-5 h-5 text-[var(--accent-lavender)]" /> Systems</h2>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">Opt-in gameplay mechanics for your project.</p>
                </div>
                <div className="p-3 space-y-2 overflow-y-auto">
                    {/* Inventory — expandable into its nested item lists */}
                    <div>
                        <div className={`w-full flex items-center gap-1.5 p-3 rounded-lg text-left transition-all border ${selectedSystem === 'inventory' && !selectedListId ? 'bg-gradient-to-r from-[var(--accent-lavender)]/20 to-transparent border-[var(--accent-lavender)]/50' : 'bg-[var(--bg-secondary)]/40 border-transparent hover:bg-[var(--bg-secondary)]'}`}>
                            <button onClick={() => setInventoryExpanded(e => !e)} className="text-[var(--text-muted)] hover:text-white flex-shrink-0" title={inventoryExpanded ? 'Collapse' : 'Expand'}>
                                {inventoryExpanded ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => { setSelectedSystem('inventory'); setSelectedListId(null); }} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                                <span className="text-[var(--accent-lavender)]"><ArchiveBoxIcon className="w-5 h-5" /></span>
                                <span className="font-medium text-white text-sm flex-1">Inventory</span>
                                {systemScreenCount > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)]">{systemScreenCount} screen{systemScreenCount === 1 ? '' : 's'}</span>}
                            </button>
                        </div>
                        {inventoryExpanded && (
                            <div className="mt-1 ml-3 pl-2 border-l border-[var(--border-subtle)] space-y-0.5">
                                {/* Built-in player inventory = the global item counts (not a collection) */}
                                <button onClick={() => { setSelectedSystem('inventory'); setSelectedListId(null); }}
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors ${selectedSystem === 'inventory' && !selectedListId ? 'bg-[var(--accent-lavender)]/15 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}>
                                    🎒 <span className="flex-1 truncate">Player Inventory</span>
                                    <span className="text-[9px] text-[var(--text-muted)]">built-in</span>
                                </button>
                                {collections.map(col => (
                                    <button key={col.id} onClick={() => { setSelectedSystem('inventory'); setSelectedListId(col.id); }}
                                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors ${selectedListId === col.id ? 'bg-[var(--accent-lavender)]/15 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}>
                                        🗃️ <span className="flex-1 truncate">{col.name}</span>
                                        <span className="text-[9px] text-[var(--text-muted)]">{col.entries.length}</span>
                                    </button>
                                ))}
                                <button onClick={addList} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left text-xs text-sky-400 hover:bg-[var(--bg-secondary)]">
                                    <PlusIcon className="w-3.5 h-3.5" /> New list
                                </button>
                            </div>
                        )}
                    </div>
                    {sysBtn('items', <GridIcon className="w-5 h-5" />, 'Items',
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)]">{items.length}</span>)}
                    {sysBtn('stats', <AdjustmentsIcon className="w-5 h-5" />, 'Stats',
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)]">{stats.length}</span>)}
                </div>
            </div>

            {selectedSystem === 'items' ? (
                <>
                    {/* ── Pane 2: item list ── */}
                    <div className="w-72 flex-shrink-0 bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] flex flex-col">
                        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-subtle)]">
                            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Items</span>
                            <button onClick={addItem} className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-1"><PlusIcon className="w-4 h-4" /> Add</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {items.length === 0 && <p className="text-xs text-[var(--text-muted)] italic px-1 py-2">No items yet. Click "Add" to create one.</p>}
                            {items.map((it, idx) => {
                                const url = iconUrlFor(it);
                                return (
                                    <div key={it.id}
                                        className={`group w-full flex items-center gap-1 p-2 rounded-lg transition-colors border ${selectedItemId === it.id ? 'bg-sky-500/15 border-sky-500/50' : 'bg-[var(--bg-secondary)]/40 border-transparent hover:bg-[var(--bg-secondary)]'}`}>
                                        <button onClick={() => setSelectedItemId(it.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                                            <div className="w-8 h-8 rounded bg-[var(--bg-secondary)] flex-shrink-0 overflow-hidden flex items-center justify-center">
                                                {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <ArchiveBoxIcon className="w-4 h-4 text-[var(--text-muted)]" />}
                                            </div>
                                            <span className="text-sm text-white truncate flex-1">{it.name}</span>
                                            {it.usable && <span className="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-300">usable</span>}
                                        </button>
                                        <div className="flex flex-col flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => moveItem(it.id, -1)} disabled={idx === 0} title="Move up" className="text-[var(--text-muted)] hover:text-white disabled:opacity-20 leading-none text-[10px] px-1">▲</button>
                                            <button onClick={() => moveItem(it.id, 1)} disabled={idx === items.length - 1} title="Move down" className="text-[var(--text-muted)] hover:text-white disabled:opacity-20 leading-none text-[10px] px-1">▼</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Pane 3: item details ── */}
                    <div className="flex-1 overflow-y-auto bg-[var(--bg-primary)]">
                        {!selected ? (
                            <div className="h-full flex items-center justify-center text-center p-8">
                                <div className="max-w-sm">
                                    <ArchiveBoxIcon className="w-14 h-14 text-slate-700 mx-auto mb-3" />
                                    <h3 className="text-white font-bold mb-1">Select or add an item</h3>
                                    <p className="text-sm text-[var(--text-secondary)]">Items can be given, removed, checked in conditions, and shown in an inventory.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="max-w-2xl mx-auto p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                                    <button onClick={() => remove(selected.id)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 font-medium"><TrashIcon className="w-4 h-4" /> Delete</button>
                                </div>

                                <FormField label="Name"><TextInput value={selected.name} onChange={e => update(selected.id, { name: e.target.value })} /></FormField>
                                <FormField label="Description (optional)"><TextArea value={selected.description || ''} onChange={e => update(selected.id, { description: e.target.value })} placeholder="Shown in tooltips / detail panes." /></FormField>
                                <AssetSelector label="Icon" assetType="images" allowVideo value={selected.icon?.id || null}
                                    onChange={id => update(selected.id, { icon: id ? { type: 'image', id } : null })} />

                                <div className="grid grid-cols-3 gap-3">
                                    <FormField label="Category (optional)"><TextInput value={selected.category || ''} onChange={e => update(selected.id, { category: e.target.value })} placeholder="e.g. Consumables" /></FormField>
                                    <FormField label="Shop price (optional)"><TextInput type="number" value={selected.price ?? ''} onChange={e => update(selected.id, { price: e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0) })} /></FormField>
                                    <FormField label="Starts with"><TextInput type="number" min={0} value={startQty} onChange={e => setStartQty(parseFloat(e.target.value))} /></FormField>
                                </div>
                                <p className="text-[10px] text-[var(--text-muted)] -mt-2">"Starts with" is how many the player begins a new game holding (0 = not in their inventory at the start).</p>

                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!selected.unique} onChange={e => update(selected.id, { unique: e.target.checked || undefined })} className="w-4 h-4" />
                                    <span className="text-sm text-[var(--text-primary)]">Unique (owned 0 or 1 — a key item, not stackable)</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!selected.usable} onChange={e => update(selected.id, { usable: e.target.checked })} className="w-4 h-4" />
                                    <span className="text-sm text-[var(--text-primary)]">Usable (player can "Use" it from an inventory)</span>
                                </label>

                                {selected.usable && (
                                    <div className="pl-2 border-l-2 border-[var(--accent-lavender)]/40 space-y-2">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={selected.consumeOnUse !== false} onChange={e => update(selected.id, { consumeOnUse: e.target.checked ? undefined : false })} className="w-4 h-4" />
                                            <span className="text-sm text-[var(--text-primary)]">Using decreases the count by one (consumable)</span>
                                        </label>
                                        <p className="text-[11px] text-[var(--text-muted)] -mt-1">Uncheck for a reusable item (a tool/key) that runs its effect without being spent.</p>
                                        <p className="text-[11px] text-[var(--text-muted)] mb-1">Extra actions when used{selected.consumeOnUse !== false ? ' (the count is decremented automatically on use)' : ''}:</p>
                                        <UIActionsListEditor actions={selected.useEffect || []} project={project} onChange={acts => update(selected.id, { useEffect: acts })} label="Use effect" />

                                        {/* Carry-to-use: point-and-click "pick up and click a spot" usage */}
                                        <label className="flex items-center gap-2 cursor-pointer pt-1">
                                            <input type="checkbox" checked={!!selected.carryToUse} onChange={e => update(selected.id, { carryToUse: e.target.checked || undefined })} className="w-4 h-4" />
                                            <span className="text-sm text-[var(--text-primary)]">Click and drag to use </span>
                                        </label>
                                        <p className="text-[11px] text-[var(--text-muted)] -mt-1">When on, pressing “Use” picks the item up onto the cursor and closes the inventory. The player then clicks a drop-zone hot spot to use it there (the effect above + consume happen on a successful drop). Great for keys, tools, etc.</p>
                                        {selected.carryToUse && (
                                            <label className="block">
                                                <span className="text-xs font-semibold text-[var(--text-secondary)]">Drag tag</span>
                                                <input
                                                    type="text"
                                                    value={selected.dragTag || ''}
                                                    placeholder="e.g. key"
                                                    onChange={e => update(selected.id, { dragTag: e.target.value || undefined })}
                                                    className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                                                />
                                                <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">A drop-zone hot spot accepts this item when its “Accept objects tagged” matches this word. Give several items the same tag to make them interchangeable (e.g. all keys “key”).</span>
                                            </label>
                                        )}
                                    </div>
                                )}

                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!selected.hideWhenEmpty} onChange={e => update(selected.id, { hideWhenEmpty: e.target.checked || undefined })} className="w-4 h-4" />
                                    <span className="text-sm text-[var(--text-primary)]">Hide from inventory when the count reaches 0</span>
                                </label>
                                <p className="text-[11px] text-[var(--text-muted)] -mt-1">Vanishes this item from an inventory grid once the player runs out — even on a grid that otherwise shows empty/unowned slots. (Grids set to "hide unowned items" already hide every 0-count item.)</p>


                                <div className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-secondary)]/40 rounded-lg p-2.5 mt-2">
                                    Quantity is tracked by the number variable <span className="font-mono text-[var(--text-secondary)]">{countVarName}</span>. Use <span className="font-mono">{'{'}{countVarName}{'}'}</span> in any text to show how many the player owns, or check it in conditions.
                                </div>
                            </div>
                        )}
                    </div>
                </>
            ) : selectedSystem === 'stats' ? (
                <>
                    {/* ── Pane 2: stat list ── */}
                    <div className="w-72 flex-shrink-0 bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] flex flex-col">
                        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-subtle)]">
                            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Stats</span>
                            <button onClick={addStat} className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-1"><PlusIcon className="w-4 h-4" /> Add</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {stats.length === 0 && (
                                <div className="text-xs text-[var(--text-muted)] px-1 py-2 space-y-1.5">
                                    <p className="italic">No stats yet.</p>
                                    <p>Stats track gameplay numbers — affection, health, XP, reputation. Define one once and it works in conditions, choices, and meters.</p>
                                </div>
                            )}
                            {stats.map(st => (
                                <button key={st.id} onClick={() => setSelectedStatId(st.id)}
                                    className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors border ${selectedStatId === st.id ? 'bg-sky-500/15 border-sky-500/50' : 'bg-[var(--bg-secondary)]/40 border-transparent hover:bg-[var(--bg-secondary)]'}`}>
                                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: st.color || 'var(--accent-lavender)' }} />
                                    <span className="text-sm text-white truncate flex-1">{st.name}</span>
                                    <span className="text-[9px] text-[var(--text-muted)]">{st.appliesTo === 'characters' ? `${(st.characterIds || []).length} char${(st.characterIds || []).length === 1 ? '' : 's'}` : 'global'}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Pane 3: stat details ── */}
                    <div className="flex-1 overflow-y-auto bg-[var(--bg-primary)]">
                        {!selectedStat ? (
                            <div className="h-full flex items-center justify-center text-center p-8">
                                <div className="max-w-sm">
                                    <AdjustmentsIcon className="w-14 h-14 text-slate-700 mx-auto mb-3" />
                                    <h3 className="text-white font-bold mb-1">Select or add a stat</h3>
                                    <p className="text-sm text-[var(--text-secondary)]">A stat is a tracked number — affection, health, XP. Global, or one value per character ("Alice — Affection"). Change it from choices, check it in conditions, and show it with a Meter.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="max-w-2xl mx-auto p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xl font-bold text-white">{selectedStat.name}</h3>
                                    <button onClick={() => removeStat(selectedStat.id)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 font-medium"><TrashIcon className="w-4 h-4" /> Delete</button>
                                </div>

                                <FormField label="Name"><TextInput value={selectedStat.name} onChange={e => updateStat(selectedStat.id, { name: e.target.value })} /></FormField>
                                <FormField label="Description (optional)"><TextArea value={selectedStat.description || ''} onChange={e => updateStat(selectedStat.id, { description: e.target.value })} placeholder="What this stat means in your story." /></FormField>
                                <AssetSelector label="Icon (optional)" assetType="images" allowVideo value={selectedStat.icon?.id || null}
                                    onChange={id => updateStat(selectedStat.id, { icon: id ? { type: 'image', id } : null })} />

                                <div className="grid grid-cols-4 gap-3">
                                    <FormField label="Minimum"><TextInput type="number" value={selectedStat.min} onChange={e => updateStat(selectedStat.id, { min: parseFloat(e.target.value) || 0 })} /></FormField>
                                    <FormField label="Maximum"><TextInput type="number" value={selectedStat.max} onChange={e => updateStat(selectedStat.id, { max: parseFloat(e.target.value) || 0 })} /></FormField>
                                    <FormField label="Starts at"><TextInput type="number" value={selectedStat.defaultValue} onChange={e => updateStat(selectedStat.id, { defaultValue: parseFloat(e.target.value) || 0 })} /></FormField>
                                    <FormField label="Meter color">
                                        <ColorInput value={selectedStat.color || '#a78bfa'} onChange={v => updateStat(selectedStat.id, { color: v })} />
                                    </FormField>
                                </div>

                                <FormField label="Who has this stat?">
                                    <Select value={selectedStat.appliesTo} onChange={e => {
                                        const appliesTo = e.target.value as 'global' | 'characters';
                                        if (appliesTo === selectedStat.appliesTo) return;
                                        // Switching modes re-materializes the backing variables: drop the old
                                        // ones and create the new set (delete+add keeps the reducer simple).
                                        dispatch({ type: 'DELETE_STAT', payload: { statId: selectedStat.id, deleteVariables: true } });
                                        dispatch({ type: 'ADD_STAT', payload: { id: selectedStat.id, name: selectedStat.name, description: selectedStat.description, icon: selectedStat.icon, min: selectedStat.min, max: selectedStat.max, defaultValue: selectedStat.defaultValue, color: selectedStat.color, appliesTo, characterIds: appliesTo === 'characters' ? [] : undefined, order: selectedStat.order } });
                                    }}>
                                        <option value="global">One shared value (e.g. money, reputation)</option>
                                        <option value="characters">One value per character (e.g. affection)</option>
                                    </Select>
                                </FormField>

                                {selectedStat.appliesTo === 'characters' && (
                                    <div className="pl-2 border-l-2 border-[var(--accent-lavender)]/40 space-y-1.5">
                                        <p className="text-xs font-semibold text-[var(--text-secondary)]">Characters with this stat:</p>
                                        {allCharacters.length === 0 && <p className="text-xs text-[var(--text-muted)] italic">No characters in the project yet — add some in the Characters tab first.</p>}
                                        {allCharacters.map(ch => {
                                            const has = (selectedStat.characterIds || []).includes(ch.id);
                                            return (
                                                <label key={ch.id} className="flex items-center gap-2 cursor-pointer">
                                                    <input type="checkbox" checked={has} onChange={e => {
                                                        const cur = selectedStat.characterIds || [];
                                                        setStatCharacters(selectedStat.id, e.target.checked ? [...cur, ch.id] : cur.filter(id => id !== ch.id));
                                                    }} className="w-4 h-4" />
                                                    <span className="text-sm text-[var(--text-primary)]">{ch.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}

                                <div className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-secondary)]/40 rounded-lg p-2.5 mt-2">
                                    {selectedStat.appliesTo === 'global' ? (
                                        <>Tracked by the number variable <span className="font-mono text-[var(--text-secondary)]">{project.variables[selectedStat.variableIds.global]?.name || selectedStat.name}</span>. Use <span className="font-mono">{'{'}{project.variables[selectedStat.variableIds.global]?.name || selectedStat.name}{'}'}</span> in any text, change it with Set Variable, check it in conditions, or show it with a Meter element.</>
                                    ) : (
                                        <>Each character gets their own number variable (e.g. <span className="font-mono text-[var(--text-secondary)]">{allCharacters[0]?.name || 'Alice'} — {selectedStat.name}</span>). Use <span className="font-mono">{'{'}{allCharacters[0]?.name || 'Alice'} — {selectedStat.name}{'}'}</span> in text, change them with Set Variable in choices, check them in conditions, or show them with Meter elements.</>
                                    )}
                                </div>

                                <button onClick={() => createStatMeterScreen(selectedStat)}
                                    disabled={Object.keys(selectedStat.variableIds).length === 0}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--accent-mint)]/20 hover:bg-[var(--accent-mint)]/30 text-[var(--accent-mint)] rounded-lg font-medium transition-all border border-[var(--accent-mint)]/40 disabled:opacity-40 disabled:cursor-not-allowed">
                                    <PlusIcon className="w-4 h-4" /> Create meter screen
                                </button>
                                <p className="text-[11px] text-[var(--text-muted)] -mt-2">Creates a screen with one bar per {selectedStat.appliesTo === 'characters' ? 'character' : 'value'} and takes you to the UI editor to style it. You can also add a single <span className="font-mono">Meter</span> element to any existing screen.</p>

                                <ConnectedScreens links={findSystemScreenLinks(project, { kind: 'stat', id: selectedStat.id })}
                                    emptyHint="Not displayed anywhere yet — create a meter screen above, or add a Meter element to any screen in the UI editor." />
                            </div>
                        )}
                    </div>
                </>
            ) : selectedList ? (
                /* ── Item list (collection) editor ── */
                <div className="flex-1 overflow-y-auto bg-[var(--bg-primary)] p-6">
                    <div className="max-w-2xl space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">🗃️</span>
                                <h3 className="text-xl font-bold text-white">{selectedList.name}</h3>
                            </div>
                            <button onClick={() => removeList(selectedList!.id)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 font-medium"><TrashIcon className="w-4 h-4" /> Delete list</button>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] -mt-2">{selectedList.tracksOwnedItems
                            ? "The player's inventory: shows the items they actually own (in sync with Give/Buy/Use/Sell). Leave items empty to show everything they own, or add items to curate which appear."
                            : "An independent stockpile (shop, library, chest…). Each item below has its own quantity for this list, separate from the player's inventory. Bind a screen's item grid to this list to show it in-game."}</p>

                        <FormField label="List name"><TextInput value={selectedList.name} onChange={e => updateList(selectedList!.id, { name: e.target.value })} /></FormField>
                        <FormField label="Description (optional)"><TextArea value={selectedList.description || ''} onChange={e => updateList(selectedList!.id, { description: e.target.value })} placeholder="A note for yourself." /></FormField>

                        <label className={`flex items-center gap-2 ${selectedList.entries.length === 0 ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`} title={selectedList.entries.length === 0 ? '' : 'Remove all items first to change this'}>
                            <input type="checkbox" checked={!!selectedList.tracksOwnedItems} disabled={selectedList.entries.length > 0} onChange={e => updateList(selectedList!.id, { tracksOwnedItems: e.target.checked || undefined })} className="w-4 h-4" />
                            <span className="text-sm text-[var(--text-primary)]">This is the player's inventory (tracks owned items, not a separate shop stock)</span>
                        </label>

                        <button onClick={() => createInventoryScreen(selectedList!.id, selectedList!.name)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--accent-mint)]/20 hover:bg-[var(--accent-mint)]/30 text-[var(--accent-mint)] rounded-lg font-medium transition-all border border-[var(--accent-mint)]/40">
                            <PlusIcon className="w-4 h-4" /> Create screen for this list
                        </button>

                        {/* ── Items in this list ── */}
                        <div>
                            <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Items in this list</h4>
                            <div className="space-y-1.5">
                                {selectedList.entries.length === 0 && <p className="text-xs text-[var(--text-muted)] italic">No items yet. Add one below.</p>}
                                {selectedList.entries.map(entry => {
                                    const it = project.items?.[entry.itemId];
                                    const isRandom = selectedList!.restock?.amount === 'randomRange';
                                    return (
                                        <div key={entry.itemId} className="flex items-center gap-2 bg-[var(--bg-secondary)]/40 rounded-lg p-2">
                                            <span className="text-sm text-white truncate flex-1">{it?.name || '(deleted item)'}</span>
                                            {!selectedList!.tracksOwnedItems && <>
                                                <label className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">Start
                                                    <input type="number" min={0} value={entry.startQty ?? 0} onChange={e => updateEntry(selectedList!.id, entry.itemId, { startQty: Math.max(0, parseInt(e.target.value, 10) || 0) })} className="w-14 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded px-1 py-0.5 text-white" />
                                                </label>
                                                <label className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">{isRandom ? 'Max' : 'Restock'}
                                                    <input type="number" min={0} value={entry.restockTo ?? entry.startQty ?? 0} onChange={e => updateEntry(selectedList!.id, entry.itemId, { restockTo: Math.max(0, parseInt(e.target.value, 10) || 0) })} className="w-14 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded px-1 py-0.5 text-white" />
                                                </label>
                                                {isRandom && (
                                                    <label className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">Min
                                                        <input type="number" min={0} value={entry.restockMin ?? 0} onChange={e => updateEntry(selectedList!.id, entry.itemId, { restockMin: Math.max(0, parseInt(e.target.value, 10) || 0) })} className="w-14 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded px-1 py-0.5 text-white" />
                                                    </label>
                                                )}
                                                <label className="text-[10px] text-[var(--text-muted)] flex items-center gap-1" title="Price in this shop (blank = the item's base price)">Price
                                                    <input type="number" min={0} value={entry.price ?? ''} placeholder={String(it?.price ?? 0)} onChange={e => updateEntry(selectedList!.id, entry.itemId, { price: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0) })} className="w-14 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded px-1 py-0.5 text-white" />
                                                </label>
                                                <label className="text-[10px] text-[var(--text-muted)] flex items-center gap-1" title="Never runs out — buying doesn't reduce stock">
                                                    <input type="checkbox" checked={!!entry.infiniteStock} onChange={e => updateEntry(selectedList!.id, entry.itemId, { infiniteStock: e.target.checked || undefined })} />∞
                                                </label>
                                            </>}
                                            <button onClick={() => removeEntry(selectedList!.id, entry.itemId)} className="text-red-400 hover:text-red-300 flex-shrink-0"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                    );
                                })}
                            </div>
                            {(() => {
                                const available = items.filter(it => !selectedList!.entries.some(e => e.itemId === it.id));
                                return (
                                    <div className="mt-2">
                                        <Select value="" onChange={e => { if (e.target.value) addEntry(selectedList!.id, e.target.value); }}>
                                            <option value="">{available.length ? '+ Add item to this list…' : 'All items already added'}</option>
                                            {available.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                                        </Select>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* ── Restock rule (shops/storage only) ── */}
                        {!selectedList.tracksOwnedItems && (
                        <div className="border-t border-[var(--border-subtle)] pt-3">
                            <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Restock</h4>
                            {!selectedList.restock ? (
                                <button onClick={() => updateList(selectedList!.id, { restock: { amount: 'reset', trigger: 'manual' } })} className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"><PlusIcon className="w-3.5 h-3.5" /> Add a restock rule</button>
                            ) : (
                                <div className="space-y-3 bg-[var(--bg-secondary)]/40 rounded-lg p-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormField label="Amount">
                                            <Select value={selectedList.restock.amount} onChange={e => updateList(selectedList!.id, { restock: { ...selectedList!.restock!, amount: e.target.value as RestockAmountMode } })}>
                                                <option value="reset">Reset to restock amount</option>
                                                <option value="randomRange">Random (min–max per item)</option>
                                            </Select>
                                        </FormField>
                                        <FormField label="Trigger">
                                            <Select value={selectedList.restock.trigger} onChange={e => updateList(selectedList!.id, { restock: { ...selectedList!.restock!, trigger: e.target.value as RestockTrigger } })}>
                                                <option value="manual">Manual (command / button)</option>
                                                <option value="condition">Auto when a condition is true</option>
                                                <option value="variableChange">When a variable changes</option>
                                            </Select>
                                        </FormField>
                                    </div>
                                    {selectedList.restock.trigger === 'condition' && (
                                        <div>
                                            <p className="text-[11px] text-[var(--text-muted)] mb-1">Restocks once each time these conditions become true:</p>
                                            <ConditionsEditor conditions={selectedList.restock.condition} project={project} onChange={(conds: VNCondition[] | undefined) => updateList(selectedList!.id, { restock: { ...selectedList!.restock!, condition: conds } })} />
                                        </div>
                                    )}
                                    {selectedList.restock.trigger === 'variableChange' && (
                                        <FormField label="Watch variable">
                                            <Select value={selectedList.restock.watchVariableId || ''} onChange={e => updateList(selectedList!.id, { restock: { ...selectedList!.restock!, watchVariableId: e.target.value } })}>
                                                <option value="">Select a variable…</option>
                                                {Object.values(project.variables).filter((v: any) => !v.isInternal).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                                            </Select>
                                        </FormField>
                                    )}
                                    <div className="flex justify-between items-center">
                                        <p className="text-[10px] text-[var(--text-muted)]">Manual lists restock via the <span className="font-mono">Restock Item List</span> command/action.</p>
                                        <button onClick={() => updateList(selectedList!.id, { restock: undefined })} className="text-[11px] text-red-400 hover:text-red-300">Remove rule</button>
                                    </div>
                                </div>
                            )}
                        </div>
                        )}

                        {/* ── Shop settings (shops/storage only) ── */}
                        {!selectedList.tracksOwnedItems && (
                        <div className="border-t border-[var(--border-subtle)] pt-3">
                            <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Shop (buy / sell)</h4>
                            <p className="text-[11px] text-[var(--text-muted)] mb-2">Set a currency to make this list a shop. On a screen, give the shop's grid a <span className="font-mono">Buy</span> slot button, and a player-inventory grid a <span className="font-mono">Sell</span> button pointed at this list. Item prices: each item's base "Shop price", overridable per-item above.</p>
                            <div className="grid grid-cols-2 gap-3">
                                <FormField label="Currency variable">
                                    <Select value={selectedList.currencyVariableId || ''} onChange={e => updateList(selectedList!.id, { currencyVariableId: e.target.value || undefined })}>
                                        <option value="">None (free / not a shop)</option>
                                        {(Object.values(project.variables) as any[]).filter(v => v.type === 'number' && !v.isInternal).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </Select>
                                </FormField>
                                <FormField label="Sell rate (× price)">
                                    <TextInput type="number" min={0} max={2} step={0.05} value={selectedList.sellMultiplier ?? 0.5} onChange={e => updateList(selectedList!.id, { sellMultiplier: Math.max(0, parseFloat(e.target.value) || 0) })} />
                                </FormField>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer mt-2">
                                <input type="checkbox" checked={!!selectedList.sellRestocksShop} onChange={e => updateList(selectedList!.id, { sellRestocksShop: e.target.checked || undefined })} className="w-4 h-4" />
                                <span className="text-xs text-[var(--text-primary)]">Sold items go back into this shop's stock</span>
                            </label>
                        </div>
                        )}

                        <ConnectedScreens links={findSystemScreenLinks(project, { kind: 'collection', id: selectedList.id })}
                            emptyHint="Not displayed anywhere yet — use the create-screen button above, or bind an existing Inventory grid to this list in the UI editor." />
                    </div>
                </div>
            ) : (
                /* ── Inventory system overview ── */
                <div className="flex-1 overflow-y-auto bg-[var(--bg-primary)] p-6">
                    <div className="max-w-2xl">
                        <div className="flex items-center gap-2 mb-2">
                            <ArchiveBoxIcon className="w-6 h-6 text-[var(--accent-mint)]" />
                            <h3 className="text-xl font-bold text-white">Inventory</h3>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] mb-4">Show the player the items they're carrying. An inventory is a regular screen (color-coded <span className="text-[var(--accent-mint)]">System</span> in the UI editor) holding an auto-laid-out item grid — so you arrange it exactly like any other screen.</p>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-[var(--bg-secondary)]/40 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-[var(--accent-mint)]">{items.length}</div>
                                <div className="text-xs text-[var(--text-secondary)] mt-0.5">item{items.length === 1 ? '' : 's'} defined</div>
                            </div>
                            <div className="bg-[var(--bg-secondary)]/40 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-[var(--accent-mint)]">{systemScreenCount}</div>
                                <div className="text-xs text-[var(--text-secondary)] mt-0.5">inventory screen{systemScreenCount === 1 ? '' : 's'}</div>
                            </div>
                        </div>
                        <button onClick={() => createInventoryScreen()}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--accent-mint)]/20 hover:bg-[var(--accent-mint)]/30 text-[var(--accent-mint)] rounded-lg font-medium transition-all border border-[var(--accent-mint)]/40">
                            <PlusIcon className="w-4 h-4" /> Create inventory screen
                        </button>
                        <p className="text-[11px] text-[var(--text-muted)] mt-1.5">Creates a System-categorized screen with an item grid (opens paused + dimmed over the scene) and takes you to the UI editor to arrange it. Open it in-game with a button's <span className="font-mono">Toggle Screen</span> action.</p>

                        {/* Guided setup — the wizards walk through items, currency, and layout in 3 steps. */}
                        <div className="grid grid-cols-2 gap-2 mt-3">
                            <button onClick={() => setWizardKind('inventory')}
                                className="flex items-center justify-center gap-2 px-3 py-2 bg-[var(--accent-lavender)]/15 hover:bg-[var(--accent-lavender)]/25 text-[var(--accent-lavender)] rounded-lg font-medium transition-all border border-[var(--accent-lavender)]/40 text-sm">
                                <SparklesIcon className="w-4 h-4" /> Inventory wizard
                            </button>
                            <button onClick={() => setWizardKind('shop')}
                                className="flex items-center justify-center gap-2 px-3 py-2 bg-[var(--accent-lavender)]/15 hover:bg-[var(--accent-lavender)]/25 text-[var(--accent-lavender)] rounded-lg font-medium transition-all border border-[var(--accent-lavender)]/40 text-sm">
                                <SparklesIcon className="w-4 h-4" /> Shop wizard
                            </button>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] mt-1">New here? The wizards set up items, currency, and a finished screen in three guided steps — everything they generate is a normal screen you can re-style afterwards.</p>

                        {systemScreens.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Inventory screens</h4>
                                <div className="space-y-1.5">
                                    {systemScreens.map(s => (
                                        <div key={s.id} className="flex items-center gap-2 bg-[var(--bg-secondary)]/40 rounded-lg p-2 border border-transparent hover:border-[var(--border-default)]">
                                            <ArchiveBoxIcon className="w-4 h-4 text-[var(--accent-mint)] flex-shrink-0" />
                                            <span className="text-sm text-white truncate flex-1">{s.name}</span>
                                            <button onClick={() => onOpenScreenInEditor?.(s.id)} className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"><PencilIcon className="w-3.5 h-3.5" /> Edit</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Guided 3-step setup (items → currency/layout → review). Generates ordinary screens +
                variables, then jumps straight to the UI editor on the fresh screen. */}
            {wizardKind && (
                <SystemWizard
                    isOpen
                    kind={wizardKind}
                    project={project}
                    onClose={() => setWizardKind(null)}
                    onGenerate={(result) => {
                        const { screenId } = applySystemWizardResult(result, project, dispatch);
                        setWizardKind(null);
                        if (screenId) onOpenScreenInEditor?.(screenId);
                    }}
                />
            )}
        </div>
    );
};

export default SystemsManager;
