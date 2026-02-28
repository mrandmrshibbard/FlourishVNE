import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { VNProject, CGGalleryEntry, CGGalleryConfig } from '../../types/project';
import { VNID } from '../../types';
import { VNBackground, VNImage } from '../../features/assets/types';
import { UIElementType, UICGGalleryElement } from '../../features/ui/types';
import { createUIElement } from '../../utils/uiElementFactory';
import { SparklesIcon, CheckIcon, ChevronRightIcon, XMarkIcon } from '../icons';

/* ------------------------------------------------------------------ */
/*  Public contract                                                    */
/* ------------------------------------------------------------------ */

export interface CGGalleryGeneratedConfig {
    /** The full CGGalleryConfig to set on the project */
    galleryConfig: CGGalleryConfig;
    /** Pre-configured CG Gallery UI element to place on the screen */
    galleryElement: UICGGalleryElement;
    /** Variables to create for unlock tracking (one per locked entry) */
    unlockVariables: { id: VNID; name: string }[];
}

interface WizardProps {
    isOpen: boolean;
    onClose: () => void;
    project: VNProject;
    screenId: VNID;
    onGenerate: (config: CGGalleryGeneratedConfig) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const generateId = (prefix: string): VNID =>
    `${prefix}-${Math.random().toString(36).substring(2, 9)}` as VNID;

type Step = 'settings' | 'select-images' | 'review';

interface SelectedAsset {
    id: VNID;
    name: string;
    url: string;
    source: 'background' | 'image';
    category: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const CGGalleryWizard: React.FC<WizardProps> = ({
    isOpen,
    onClose,
    project,
    screenId,
    onGenerate,
}) => {
    /* ----- state ----- */
    const [step, setStep] = useState<Step>('settings');

    // Settings
    const [columns, setColumns] = useState(4);
    const [unlockScope, setUnlockScope] = useState<'global' | 'per-save'>('global');
    const [showNames, setShowNames] = useState(true);
    const [unlockableByDefault, setUnlockableByDefault] = useState(false);

    // Selected assets
    const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([]);
    const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
    const [searchTerm, setSearchTerm] = useState('');

    /* ----- derived ----- */
    const availableAssets = useMemo(() => {
        const assets: SelectedAsset[] = [];

        // Backgrounds
        Object.entries(project.backgrounds).forEach(([id, bg]) => {
            const bgTyped = bg as VNBackground;
            assets.push({
                id: id as VNID,
                name: bgTyped.name,
                url: bgTyped.imageUrl || '',
                source: 'background',
                category: 'Backgrounds',
            });
        });

        // Images
        Object.entries(project.images).forEach(([id, img]) => {
            const imgTyped = img as VNImage;
            assets.push({
                id: id as VNID,
                name: imgTyped.name,
                url: imgTyped.imageUrl || '',
                source: 'image',
                category: 'Images',
            });
        });

        return assets;
    }, [project.backgrounds, project.images]);

    const filteredAssets = useMemo(() => {
        if (!searchTerm) return availableAssets;
        const lower = searchTerm.toLowerCase();
        return availableAssets.filter(a => a.name.toLowerCase().includes(lower));
    }, [availableAssets, searchTerm]);

    const isSelected = (id: VNID) => selectedAssets.some(a => a.id === id);

    /* ----- handlers ----- */
    const toggleAsset = (asset: SelectedAsset) => {
        setSelectedAssets(prev =>
            isSelected(asset.id)
                ? prev.filter(a => a.id !== asset.id)
                : [...prev, asset],
        );
    };

    const selectAll = () => setSelectedAssets([...availableAssets]);
    const deselectAll = () => setSelectedAssets([]);

    const updateCategory = (assetId: VNID, category: string) => {
        setCategoryMap(prev => ({ ...prev, [assetId]: category }));
    };

    const reset = () => {
        setStep('settings');
        setColumns(4);
        setUnlockScope('global');
        setShowNames(true);
        setUnlockableByDefault(false);
        setSelectedAssets([]);
        setCategoryMap({});
        setSearchTerm('');
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleGenerate = () => {
        // Build entries and optional unlock variables
        const entries: Record<VNID, CGGalleryEntry> = {};
        const unlockVariables: { id: VNID; name: string }[] = [];

        selectedAssets.forEach((asset, index) => {
            const entryId = generateId('cg');
            let unlockVariableId: VNID | null = null;

            if (unlockableByDefault) {
                // Create an unlock variable for this entry
                const varId = generateId('cg_unlock');
                const safeName = asset.name.replace(/[^a-zA-Z0-9 _-]/g, '').substring(0, 30);
                unlockVariables.push({ id: varId, name: `CG Unlock: ${safeName}` });
                unlockVariableId = varId;
            }

            entries[entryId] = {
                id: entryId,
                name: asset.name,
                assetId: asset.id,
                thumbnailAssetId: null,
                unlockable: unlockableByDefault,
                unlockVariableId,
                category: categoryMap[asset.id] || '',
                order: index,
            };
        });

        const galleryConfig: CGGalleryConfig = {
            entries,
            unlockScope,
            columns,
            lockedPlaceholderAssetId: null,
            viewerBackgroundColor: '#0f172a',
        };

        // Build UIElement
        const galleryElement = createUIElement(UIElementType.CGGallery, project) as UICGGalleryElement;
        galleryElement.columns = columns;
        galleryElement.showNames = showNames;

        onGenerate({ galleryConfig, galleryElement, unlockVariables });
        handleClose();
    };

    /* ----- render helpers ----- */
    if (!isOpen) return null;

    const stepIndex = step === 'settings' ? 0 : step === 'select-images' ? 1 : 2;

    const renderStepIndicator = () => (
        <div className="flex items-center justify-center gap-2 mb-6">
            {(['Settings', 'Select Images', 'Review'] as const).map((label, i) => (
                <React.Fragment key={label}>
                    {i > 0 && <div className="w-8 h-px bg-slate-600" />}
                    <div className="flex items-center gap-1.5">
                        <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                i < stepIndex
                                    ? 'bg-green-500 text-white'
                                    : i === stepIndex
                                    ? 'bg-purple-500 text-white'
                                    : 'bg-slate-700 text-slate-400'
                            }`}
                        >
                            {i < stepIndex ? <CheckIcon /> : i + 1}
                        </div>
                        <span className={`text-xs ${i === stepIndex ? 'text-white' : 'text-slate-500'}`}>
                            {label}
                        </span>
                    </div>
                </React.Fragment>
            ))}
        </div>
    );

    /* ----- Step 1: Settings ----- */
    const renderSettings = () => (
        <div className="space-y-5">
            <div>
                <label className="block text-sm font-medium mb-1">Grid Columns</label>
                <div className="flex gap-2">
                    {[2, 3, 4, 5, 6].map(n => (
                        <button
                            key={n}
                            onClick={() => setColumns(n)}
                            className={`w-10 h-10 rounded-lg font-bold text-sm border ${
                                columns === n
                                    ? 'bg-purple-600 border-purple-400 text-white'
                                    : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
                            }`}
                        >
                            {n}
                        </button>
                    ))}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                    How many thumbnails per row in the gallery grid
                </p>
            </div>

            <div>
                <label className="block text-sm font-medium mb-1">Unlock Scope</label>
                <div className="flex gap-2">
                    <button
                        onClick={() => setUnlockScope('global')}
                        className={`flex-1 p-3 rounded-lg border text-sm ${
                            unlockScope === 'global'
                                ? 'bg-purple-600 border-purple-400'
                                : 'bg-slate-800 border-slate-600 hover:bg-slate-700'
                        }`}
                    >
                        <div className="font-semibold">Global</div>
                        <div className="text-xs opacity-70">
                            Unlocked CGs persist across all save slots
                        </div>
                    </button>
                    <button
                        onClick={() => setUnlockScope('per-save')}
                        className={`flex-1 p-3 rounded-lg border text-sm ${
                            unlockScope === 'per-save'
                                ? 'bg-purple-600 border-purple-400'
                                : 'bg-slate-800 border-slate-600 hover:bg-slate-700'
                        }`}
                    >
                        <div className="font-semibold">Per Save</div>
                        <div className="text-xs opacity-70">
                            Unlocked CGs are tied to individual saves
                        </div>
                    </button>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div>
                    <label className="block text-sm font-medium">Show Names</label>
                    <p className="text-xs text-slate-500">Display entry names beneath thumbnails</p>
                </div>
                <button
                    onClick={() => setShowNames(!showNames)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                        showNames ? 'bg-purple-500' : 'bg-slate-600'
                    }`}
                >
                    <div
                        className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            showNames ? 'translate-x-6' : 'translate-x-0.5'
                        }`}
                    />
                </button>
            </div>

            <div className="flex items-center justify-between">
                <div>
                    <label className="block text-sm font-medium">Locked By Default</label>
                    <p className="text-xs text-slate-500">
                        Entries start locked and require unlocking via variables
                    </p>
                </div>
                <button
                    onClick={() => setUnlockableByDefault(!unlockableByDefault)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                        unlockableByDefault ? 'bg-purple-500' : 'bg-slate-600'
                    }`}
                >
                    <div
                        className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            unlockableByDefault ? 'translate-x-6' : 'translate-x-0.5'
                        }`}
                    />
                </button>
            </div>
        </div>
    );

    /* ----- Step 2: Select Images ----- */
    const renderSelectImages = () => (
        <div className="space-y-3">
            {availableAssets.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                    <p className="text-lg mb-1">No images or backgrounds found</p>
                    <p className="text-sm">
                        Add some images or backgrounds to your project first, then come back.
                    </p>
                </div>
            ) : (
                <>
                    {/* Search + bulk actions */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Search assets…"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500"
                        />
                        <button
                            onClick={selectAll}
                            className="text-xs text-purple-400 hover:text-purple-300 whitespace-nowrap"
                        >
                            Select All
                        </button>
                        <button
                            onClick={deselectAll}
                            className="text-xs text-slate-400 hover:text-slate-300 whitespace-nowrap"
                        >
                            Clear
                        </button>
                    </div>

                    {/* Asset grid */}
                    <div className="grid grid-cols-3 gap-2 max-h-[350px] overflow-y-auto pr-1">
                        {filteredAssets.map(asset => (
                            <button
                                key={asset.id}
                                onClick={() => toggleAsset(asset)}
                                className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-video ${
                                    isSelected(asset.id)
                                        ? 'border-purple-500 ring-2 ring-purple-500/30'
                                        : 'border-slate-700 hover:border-slate-500'
                                }`}
                            >
                                <img
                                    src={asset.url}
                                    alt={asset.name}
                                    className="w-full h-full object-cover"
                                />
                                {isSelected(asset.id) && (
                                    <div className="absolute top-1 right-1 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                                        <CheckIcon />
                                    </div>
                                )}
                                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                                    <div className="text-[10px] truncate">{asset.name}</div>
                                    <div className="text-[8px] text-slate-400">{asset.source}</div>
                                </div>
                            </button>
                        ))}
                    </div>

                    <p className="text-xs text-slate-500 text-center">
                        {selectedAssets.length} of {availableAssets.length} selected
                    </p>
                </>
            )}
        </div>
    );

    /* ----- Step 3: Review ----- */
    const renderReview = () => {
        // Gather unique categories
        const categories = [...new Set(selectedAssets.map(a => categoryMap[a.id] || ''))];

        return (
            <div className="space-y-4">
                <div className="bg-slate-800/60 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-slate-400">Columns</span>
                        <span className="font-medium">{columns}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-400">Unlock Scope</span>
                        <span className="font-medium capitalize">{unlockScope}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-400">Show Names</span>
                        <span className="font-medium">{showNames ? 'Yes' : 'No'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-400">Locked By Default</span>
                        <span className="font-medium">{unlockableByDefault ? 'Yes' : 'No'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-400">Entries</span>
                        <span className="font-medium">{selectedAssets.length}</span>
                    </div>
                    {unlockableByDefault && (
                        <div className="flex justify-between">
                            <span className="text-slate-400">Unlock Variables</span>
                            <span className="font-medium text-purple-400">{selectedAssets.length} will be created</span>
                        </div>
                    )}
                </div>

                {/* Unlock variable info */}
                {unlockableByDefault && selectedAssets.length > 0 && (
                    <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3">
                        <div className="text-xs font-medium text-purple-300 mb-2">
                            🔒 Unlock Variables
                        </div>
                        <p className="text-[11px] text-slate-400 mb-2">
                            A boolean variable will be created for each entry. Set the variable to <span className="text-green-400 font-mono">true</span> in your scenes to unlock the CG.
                        </p>
                        <div className="max-h-[100px] overflow-y-auto space-y-0.5">
                            {selectedAssets.map(asset => {
                                const safeName = asset.name.replace(/[^a-zA-Z0-9 _-]/g, '').substring(0, 30);
                                return (
                                    <div key={asset.id} className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                        <span className="text-purple-400 font-mono">var</span>
                                        <span className="truncate">CG Unlock: {safeName}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Optional per-entry category editing */}
                {selectedAssets.length > 0 && (
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Entry Categories{' '}
                            <span className="text-slate-500 font-normal">(optional)</span>
                        </label>
                        <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1">
                            {selectedAssets.map(asset => (
                                <div key={asset.id} className="flex items-center gap-2">
                                    <img
                                        src={asset.url}
                                        alt={asset.name}
                                        className="w-8 h-8 rounded object-cover flex-shrink-0"
                                    />
                                    <span className="text-xs truncate flex-1">{asset.name}</span>
                                    <input
                                        type="text"
                                        placeholder="Category"
                                        value={categoryMap[asset.id] || ''}
                                        onChange={e => updateCategory(asset.id, e.target.value)}
                                        className="bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-xs w-28 focus:outline-none focus:border-purple-500"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Preview grid */}
                <div>
                    <label className="block text-sm font-medium mb-2">Preview</label>
                    <div
                        className="bg-[#0f172a] rounded-lg p-3"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${columns}, 1fr)`,
                            gap: '8px',
                        }}
                    >
                        {selectedAssets.map(asset => (
                            <div
                                key={asset.id}
                                className="rounded-lg overflow-hidden border border-purple-800/50 aspect-video"
                            >
                                <img
                                    src={asset.url}
                                    alt={asset.name}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    /* ----- main render ----- */
    return createPortal(
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={e => e.target === e.currentTarget && handleClose()}
        >
            <div className="bg-gradient-to-b from-[var(--bg-tertiary)] to-[var(--bg-secondary)] rounded-xl shadow-2xl w-full max-w-lg p-6 m-4 border border-[var(--border-default)] max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5 text-purple-400" />
                        CG Gallery Wizard
                    </h2>
                    <button
                        onClick={handleClose}
                        className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
                <p className="text-sm text-slate-400 mb-4">
                    Create a CG art gallery from your project assets
                </p>

                {renderStepIndicator()}

                {/* Body */}
                <div className="flex-1 overflow-y-auto min-h-0">
                    {step === 'settings' && renderSettings()}
                    {step === 'select-images' && renderSelectImages()}
                    {step === 'review' && renderReview()}
                </div>

                {/* Footer nav */}
                <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-700">
                    {step !== 'settings' ? (
                        <button
                            onClick={() =>
                                setStep(step === 'review' ? 'select-images' : 'settings')
                            }
                            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            ← Back
                        </button>
                    ) : (
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                    )}

                    {step === 'review' ? (
                        <button
                            onClick={handleGenerate}
                            disabled={selectedAssets.length === 0}
                            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-all"
                        >
                            <SparklesIcon className="w-4 h-4" /> Generate Gallery
                        </button>
                    ) : (
                        <button
                            onClick={() =>
                                setStep(step === 'settings' ? 'select-images' : 'review')
                            }
                            className="bg-purple-600 hover:bg-purple-500 px-6 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-colors"
                        >
                            Next <ChevronRightIcon className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default CGGalleryWizard;
