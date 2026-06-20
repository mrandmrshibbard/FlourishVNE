import React, { useState } from 'react';
import { ColorInput } from '../ui/Form';
import { createPortal } from 'react-dom';
import { VNProject } from '../../types/project';
import { VNID } from '../../types';
import { VNItem } from '../../features/items/types';
import { InteractionMode } from '../../features/systems/systemBuilder';
import { SystemWizardResult, WizardItemSpec } from '../../features/systems/applySystem';
import AssetSelector from '../ui/AssetSelector';
import { SparklesIcon, CheckIcon, ChevronRightIcon, XMarkIcon, PlusIcon, TrashIcon } from '../icons';

interface Props {
    isOpen: boolean;
    kind: 'shop' | 'inventory';
    project: VNProject;
    onClose: () => void;
    onGenerate: (result: SystemWizardResult) => void;
}

type Step = 'basics' | 'items' | 'review';

interface ItemRow extends WizardItemSpec { _rowId: string; }

const rid = () => Math.random().toString(36).substring(2, 9);

const MODE_LABELS: Record<InteractionMode, string> = {
    buttonGrid: 'Button grid — cards with click buttons',
    imageMap: 'Image map — clickable regions over one artwork',
    dragDrop: 'Drag & drop — drag items onto a target',
};

const SystemWizard: React.FC<Props> = ({ isOpen, kind, project, onClose, onGenerate }) => {
    const isShop = kind === 'shop';
    const [step, setStep] = useState<Step>('basics');
    const [screenName, setScreenName] = useState(isShop ? 'Shop' : 'Inventory');
    const [backgroundColor, setBackgroundColor] = useState('#1a102c');
    const [mode, setMode] = useState<InteractionMode>('buttonGrid');
    const [columns, setColumns] = useState(isShop ? 3 : 4);
    const [boardImageAssetId, setBoardImageAssetId] = useState<VNID | null>(null);
    const [hideUnowned, setHideUnowned] = useState(true);
    const [addHudButton, setAddHudButton] = useState(false);
    const [inventoryOutput, setInventoryOutput] = useState<'screen' | 'hud' | 'both'>('both');
    const [currencyName, setCurrencyName] = useState('Gold');
    const [currencyIcon, setCurrencyIcon] = useState('💰');
    const [startAmount, setStartAmount] = useState(100);
    const [items, setItems] = useState<ItemRow[]>([
        { _rowId: rid(), name: isShop ? 'Health Potion' : 'Key', iconAssetId: null, price: 50, usable: !isShop, unique: false },
    ]);

    const registryItems = Object.values(project.items || {}) as VNItem[];

    const reset = () => {
        setStep('basics'); setItems([{ _rowId: rid(), name: isShop ? 'Health Potion' : 'Key', iconAssetId: null, price: 50, usable: !isShop, unique: false }]);
    };

    const addNewItem = () => setItems(prev => [...prev, { _rowId: rid(), name: `Item ${prev.length + 1}`, iconAssetId: null, price: isShop ? 50 : undefined, usable: !isShop, unique: false }]);
    const addExisting = (itemId: VNID) => {
        const it = project.items?.[itemId];
        if (!it) return;
        setItems(prev => [...prev, { _rowId: rid(), itemId, name: it.name, iconAssetId: it.icon?.id ?? null, price: it.price ?? (isShop ? 50 : undefined), usable: it.usable, unique: it.unique }]);
    };
    const updateItem = (rowId: string, patch: Partial<ItemRow>) => setItems(prev => prev.map(r => r._rowId === rowId ? { ...r, ...patch } : r));
    const removeItem = (rowId: string) => setItems(prev => prev.filter(r => r._rowId !== rowId));

    const handleGenerate = () => {
        const result: SystemWizardResult = {
            kind, screenName, backgroundColor, mode, columns,
            boardImageAssetId: (mode === 'imageMap' || mode === 'dragDrop') ? boardImageAssetId : null,
            hideUnowned: !isShop ? hideUnowned : undefined,
            inventoryOutput: !isShop ? inventoryOutput : undefined,
            currency: isShop ? { name: currencyName, icon: currencyIcon, startAmount } : undefined,
            items: items.map(({ _rowId, ...spec }) => spec),
            addHudButton,
        };
        onGenerate(result);
        onClose();
        reset();
    };

    if (!isOpen) return null;
    const backdrop = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); };

    const renderBasics = () => (
        <div className="space-y-4">
            <label className="block">
                <span className="text-sm text-slate-300">Screen name</span>
                <input value={screenName} onChange={e => setScreenName(e.target.value)} className="mt-1 w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 outline-none focus:border-purple-500" />
            </label>

            {isShop && (
                <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                    <label className="block col-span-1"><span className="text-xs text-slate-400">Currency name</span>
                        <input value={currencyName} onChange={e => setCurrencyName(e.target.value)} className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 outline-none" /></label>
                    <label className="block col-span-1"><span className="text-xs text-slate-400">Icon (emoji)</span>
                        <input value={currencyIcon} onChange={e => setCurrencyIcon(e.target.value)} className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 outline-none" /></label>
                    <label className="block col-span-1"><span className="text-xs text-slate-400">Starting amount</span>
                        <input type="number" value={startAmount} onChange={e => setStartAmount(parseInt(e.target.value) || 0)} className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 outline-none" /></label>
                </div>
            )}

            <div>
                <span className="text-sm text-slate-300">Interaction style</span>
                <div className="mt-1 space-y-2">
                    {(Object.keys(MODE_LABELS) as InteractionMode[]).map(m => (
                        <label key={m} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${mode === m ? 'border-purple-500 bg-purple-500/10' : 'border-slate-700 hover:border-slate-500'}`}>
                            <input type="radio" checked={mode === m} onChange={() => setMode(m)} className="w-4 h-4" />
                            <span className="text-sm">{MODE_LABELS[m]}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-xs text-slate-400">Columns</span>
                    <input type="number" min={1} max={8} value={columns} onChange={e => setColumns(Math.max(1, parseInt(e.target.value) || 1))} className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 outline-none" /></label>
                <label className="block"><span className="text-xs text-slate-400">Background color</span>
                    <ColorInput value={backgroundColor} onChange={v => setBackgroundColor(v)} /></label>
            </div>

            {(mode === 'imageMap' || mode === 'dragDrop') && (
                <AssetSelector label={mode === 'imageMap' ? 'Board artwork (regions overlay this)' : 'Board artwork (optional backdrop)'} assetType="images" value={boardImageAssetId} onChange={setBoardImageAssetId} />
            )}

            {!isShop && (
                <div>
                    <span className="text-sm text-slate-300">Where does the inventory live?</span>
                    <div className="mt-1 grid grid-cols-3 gap-2">
                        {([
                            { v: 'screen' as const, t: 'Full screen', d: 'Open a dedicated inventory screen' },
                            { v: 'hud' as const, t: 'HUD bar', d: 'Always-on quick-use strip during play' },
                            { v: 'both' as const, t: 'Both', d: 'Screen + HUD bar' },
                        ]).map(o => (
                            <button key={o.v} type="button" onClick={() => setInventoryOutput(o.v)}
                                className={`p-2 rounded-lg border text-left ${inventoryOutput === o.v ? 'border-purple-500 bg-purple-500/10' : 'border-slate-700 hover:border-slate-500'}`}>
                                <div className="text-sm font-medium">{o.t}</div>
                                <div className="text-[10px] text-slate-400">{o.d}</div>
                            </button>
                        ))}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">The HUD bar shows owned items during gameplay; usable items are clickable to consume. It's added to a pass-through Game HUD screen (created if needed).</p>
                </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-700">
                <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600">Cancel</button>
                <button onClick={() => setStep('items')} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 flex items-center gap-2">Next <ChevronRightIcon className="w-4 h-4" /></button>
            </div>
        </div>
    );

    const renderItems = () => (
        <div className="space-y-3">
            <p className="text-sm text-slate-400">Define the items. Each becomes a registry item backed by a count variable you can edit later, plus assets you can swap. {isShop ? 'Prices are paid in your currency.' : 'Usable items get a "Use" control that consumes one and runs its effect.'}</p>
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {items.map((row, i) => (
                    <div key={row._rowId} className="p-3 rounded-lg border border-slate-700 bg-slate-800/50 space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 w-5">{i + 1}</span>
                            <input value={row.name} onChange={e => updateItem(row._rowId, { name: e.target.value })} placeholder="Item name" className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 outline-none" />
                            {row.itemId && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-700/40 text-emerald-300">registry</span>}
                            <button onClick={() => removeItem(row._rowId)} className="p-1 text-slate-500 hover:text-red-400"><TrashIcon className="w-4 h-4" /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pl-7">
                            <AssetSelector label="Icon" assetType="images" value={row.iconAssetId ?? null} onChange={id => updateItem(row._rowId, { iconAssetId: id })} />
                            {isShop && (
                                <label className="block"><span className="text-xs text-slate-400">Price</span>
                                    <input type="number" value={row.price ?? 0} onChange={e => updateItem(row._rowId, { price: parseInt(e.target.value) || 0 })} className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 outline-none" /></label>
                            )}
                        </div>
                        <div className="flex gap-4 pl-7 text-sm">
                            {!isShop && (
                                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={!!row.usable} onChange={e => updateItem(row._rowId, { usable: e.target.checked })} /> Usable (consumable)</label>
                            )}
                            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={!!row.unique} onChange={e => updateItem(row._rowId, { unique: e.target.checked })} /> One-of (unique)</label>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex flex-wrap gap-2">
                <button onClick={addNewItem} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm flex items-center gap-1"><PlusIcon className="w-4 h-4" /> New item</button>
                {registryItems.length > 0 && (
                    <select onChange={e => { if (e.target.value) { addExisting(e.target.value as VNID); e.target.value = ''; } }} defaultValue="" className="px-2 py-1.5 rounded-lg bg-slate-700 text-sm border border-slate-600">
                        <option value="">+ Add existing item…</option>
                        {registryItems.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                    </select>
                )}
            </div>
            <div className="flex justify-between gap-3 pt-3 border-t border-slate-700">
                <button onClick={() => setStep('basics')} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600">Back</button>
                <button onClick={() => setStep('review')} disabled={items.length === 0} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 flex items-center gap-2">Next <ChevronRightIcon className="w-4 h-4" /></button>
            </div>
        </div>
    );

    const renderReview = () => (
        <div className="space-y-4">
            <p className="text-sm text-slate-400">Everything below is generated as ordinary screen elements + variables you can freely edit afterward.</p>
            <div className="bg-slate-900 rounded-lg p-4 space-y-2 text-sm">
                <Row ok label={`Screen "${screenName}" (${MODE_LABELS[mode].split(' — ')[0]})`} />
                {isShop && <Row ok label={`Currency "${currencyName}" starting at ${startAmount}`} />}
                <Row ok label={`${items.length} item${items.length === 1 ? '' : 's'} → ${items.filter(r => !r.itemId).length} new registry item(s)`} />
                {!isShop && <Row ok label={hideUnowned ? 'Only owned items shown' : 'All item slots shown'} />}
                {addHudButton && <Row ok label="Open-button added to the game HUD" />}
            </div>
            {!isShop && (
                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={hideUnowned} onChange={e => setHideUnowned(e.target.checked)} /> Hide items the player doesn't own</label>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={addHudButton} onChange={e => setAddHudButton(e.target.checked)} disabled={!project.ui.gameHudScreenId} /> Add an "Open {screenName}" button to the game HUD {!project.ui.gameHudScreenId && <span className="text-[10px] text-amber-400">(set a Game HUD screen first)</span>}</label>
            <div className="flex justify-between gap-3 pt-3 border-t border-slate-700">
                <button onClick={() => setStep('items')} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600">Back</button>
                <button onClick={handleGenerate} className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 font-semibold flex items-center gap-2"><SparklesIcon className="w-4 h-4" /> Generate {isShop ? 'Shop' : 'Inventory'}</button>
            </div>
        </div>
    );

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={backdrop}>
            <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl shadow-2xl w-full max-w-2xl m-4 border border-slate-700">
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg"><SparklesIcon className="w-6 h-6 text-purple-400" /></div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">{isShop ? 'Shop' : 'Inventory'} Wizard</h2>
                            <p className="text-sm text-slate-400">
                                {step === 'basics' && 'Step 1: Basics & style'}
                                {step === 'items' && 'Step 2: Items'}
                                {step === 'review' && 'Step 3: Review & generate'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg"><XMarkIcon className="w-5 h-5 text-slate-400" /></button>
                </div>
                <div className="p-6">
                    {step === 'basics' && renderBasics()}
                    {step === 'items' && renderItems()}
                    {step === 'review' && renderReview()}
                </div>
            </div>
        </div>,
        document.body,
    );
};

const Row: React.FC<{ ok?: boolean; label: string }> = ({ label }) => (
    <div className="flex items-center gap-2 text-slate-200"><CheckIcon className="w-4 h-4 text-green-400" /><span>{label}</span></div>
);

export default SystemWizard;
