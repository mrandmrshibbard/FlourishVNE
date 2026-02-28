/**
 * CharacterEditor — Unified character editing component
 * 
 * Consolidates preview, identity, expressions, layers, and style settings
 * into a single tabbed interface to eliminate the scattered multi-panel layout.
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { useToast } from '../contexts/ToastContext';
import { VNID } from '../types';
import { VNCharacter, VNCharacterExpression, VNCharacterLayer, VNLayerAsset } from '../features/character/types';
import { fileToBase64 } from '../utils/file';
import { PlusIcon, TrashIcon, UploadIcon, PencilIcon } from './icons';
import { FormField, TextInput, Select, ColorInput } from './ui/Form';
import ConfirmationModal from './ui/ConfirmationModal';

type EditorTab = 'expressions' | 'layers' | 'style';

// Popular fonts for visual novels
const popularFonts = [
    'Default (Use Project Settings)',
    'Poppins, sans-serif',
    'Arial, sans-serif',
    'Helvetica, sans-serif',
    'Verdana, sans-serif',
    'Times New Roman, serif',
    'Georgia, serif',
    'Courier New, monospace',
    'Pacifico, cursive',
    'Lato, sans-serif',
    'Merriweather, serif',
    'Oswald, sans-serif',
    'Playfair Display, serif',
    'Roboto, sans-serif',
    'Caveat, cursive',
];

/* ───── Sub-components ───── */

const ExpressionListItem: React.FC<{
    expr: VNCharacterExpression;
    isSelected: boolean;
    isRenaming: boolean;
    layers: Record<VNID, VNCharacterLayer>;
    onSelect: () => void;
    onStartRename: () => void;
    onCommitRename: (name: string) => void;
    onDeleteRequest: () => void;
}> = ({ expr, isSelected, isRenaming, layers, onSelect, onStartRename, onCommitRename, onDeleteRequest }) => {
    const [name, setName] = useState(expr.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setName(expr.name); }, [expr.name]);
    useEffect(() => {
        if (isRenaming) { inputRef.current?.focus(); inputRef.current?.select(); }
    }, [isRenaming]);

    const handleBlur = () => {
        if (name.trim()) onCommitRename(name.trim());
        else { setName(expr.name); onCommitRename(expr.name); }
    };

    // Count configured layers for this expression
    const configuredCount = Object.values(expr.layerConfiguration).filter(Boolean).length;
    const totalLayers = Object.keys(layers).length;

    return (
        <div
            onClick={onSelect}
            className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
                isSelected
                    ? 'bg-[var(--accent-cyan)]/15 ring-1 ring-[var(--accent-cyan)]/40'
                    : 'hover:bg-[var(--bg-tertiary)]'
            }`}
        >
            {/* Expression thumbnail — shows first layer asset or icon */}
            <div className={`w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                isSelected ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
            }`}>
                {expr.name.charAt(0).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
                {isRenaming ? (
                    <input
                        ref={inputRef}
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onBlur={handleBlur}
                        onKeyDown={e => { if (e.key === 'Enter') inputRef.current?.blur(); if (e.key === 'Escape') { setName(expr.name); onCommitRename(expr.name); } }}
                        onClick={e => e.stopPropagation()}
                        className="w-full bg-slate-900 text-white px-2 py-0.5 rounded text-sm outline-none ring-1 ring-[var(--accent-cyan)]"
                    />
                ) : (
                    <>
                        <span className="text-sm block truncate" style={{ color: 'var(--text-primary)' }}>{expr.name}</span>
                        {totalLayers > 0 && (
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                {configuredCount}/{totalLayers} layers
                            </span>
                        )}
                    </>
                )}
            </div>

            <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={e => { e.stopPropagation(); onStartRename(); }} className="p-1 text-slate-500 hover:text-[var(--accent-cyan)]" title="Rename">
                    <PencilIcon className="w-3 h-3" />
                </button>
                <button onClick={e => { e.stopPropagation(); onDeleteRequest(); }} className="p-1 text-slate-500 hover:text-red-400" title="Delete">
                    <TrashIcon className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
};

const LayerCard: React.FC<{
    characterId: VNID;
    layer: VNCharacterLayer;
}> = ({ characterId, layer }) => {
    const { dispatch } = useProject();
    const [isRenaming, setIsRenaming] = useState(false);
    const [name, setName] = useState(layer.name);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleRenameCommit = () => {
        if (name.trim()) {
            dispatch({ type: 'UPDATE_CHARACTER_LAYER', payload: { characterId, layerId: layer.id, name: name.trim() } });
        }
        setIsRenaming(false);
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const dataUrl = await fileToBase64(file);
        const isVideo = file.type.startsWith('video/');
        dispatch({
            type: 'ADD_LAYER_ASSET',
            payload: {
                characterId,
                layerId: layer.id,
                name: file.name.split('.')[0],
                ...(isVideo ? { videoUrl: dataUrl, isVideo: true, loop: true } : { imageUrl: dataUrl })
            }
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDeleteLayer = () => {
        if (confirm(`Delete layer "${layer.name}"? This removes it from all expressions.`)) {
            dispatch({ type: 'DELETE_CHARACTER_LAYER', payload: { characterId, layerId: layer.id } });
        }
    };

    const handleDeleteAsset = (assetId: VNID, assetName: string) => {
        if (confirm(`Delete asset "${assetName}"?`)) {
            dispatch({ type: 'DELETE_LAYER_ASSET', payload: { characterId, layerId: layer.id, assetId } });
        }
    };

    const assetCount = Object.keys(layer.assets).length;

    return (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
            {/* Layer Header */}
            <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-[var(--bg-tertiary)] transition-colors"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <span className={`text-[10px] transition-transform ${isCollapsed ? '' : 'rotate-90'}`} style={{ color: 'var(--text-muted)' }}>▶</span>
                {isRenaming ? (
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onBlur={handleRenameCommit}
                        onKeyDown={e => { if (e.key === 'Enter') handleRenameCommit(); }}
                        onClick={e => e.stopPropagation()}
                        className="bg-slate-900 text-white px-2 py-0.5 rounded text-sm outline-none ring-1 ring-sky-500 flex-1"
                        autoFocus
                    />
                ) : (
                    <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>{layer.name}</span>
                )}
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                    {assetCount} asset{assetCount !== 1 ? 's' : ''}
                </span>
                <button onClick={e => { e.stopPropagation(); setIsRenaming(true); }} className="p-1 text-slate-500 hover:text-sky-400" title="Rename layer">
                    <PencilIcon className="w-3 h-3" />
                </button>
                <button onClick={e => { e.stopPropagation(); handleDeleteLayer(); }} className="p-1 text-slate-500 hover:text-red-400" title="Delete layer">
                    <TrashIcon className="w-3 h-3" />
                </button>
            </div>

            {/* Layer Content */}
            {!isCollapsed && (
                <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    {assetCount === 0 ? (
                        <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>No assets yet. Upload images for this layer.</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-1.5 mb-2">
                            {Object.values(layer.assets).map((asset: VNLayerAsset) => (
                                <div key={asset.id} className="group relative rounded-md overflow-hidden bg-slate-800 aspect-square">
                                    {asset.videoUrl ? (
                                        <video src={asset.videoUrl} muted loop playsInline className="w-full h-full object-contain" />
                                    ) : asset.imageUrl ? (
                                        <img src={asset.imageUrl} alt={asset.name} className="w-full h-full object-contain" />
                                    ) : null}
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
                                        <span className="text-[10px] text-white truncate block">{asset.name}</span>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteAsset(asset.id, asset.name)}
                                        className="absolute top-1 right-1 p-0.5 bg-red-600/80 hover:bg-red-500 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <TrashIcon className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full text-xs py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors"
                        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                    >
                        <UploadIcon /> Upload Asset
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleUpload} accept="image/*,video/*" className="hidden" />
                </div>
            )}
        </div>
    );
};

/* ───── Main Component ───── */

const CharacterEditor: React.FC<{
    activeCharacterId: VNID;
    selectedExpressionId: VNID | null;
    setSelectedExpressionId: (id: VNID | null) => void;
}> = ({ activeCharacterId, selectedExpressionId, setSelectedExpressionId }) => {
    const { project, dispatch } = useProject();
    const toast = useToast();
    const character = project.characters[activeCharacterId];
    const [activeTab, setActiveTab] = useState<EditorTab>('expressions');
    const [renamingExprId, setRenamingExprId] = useState<VNID | null>(null);
    const [confirmDeleteExpr, setConfirmDeleteExpr] = useState<VNCharacterExpression | null>(null);
    const baseImageInputRef = useRef<HTMLInputElement>(null);
    const fontFileInputRef = useRef<HTMLInputElement>(null);

    const expressionsArray = useMemo(
        () => character ? Object.values(character.expressions) as VNCharacterExpression[] : [],
        [character?.expressions]
    );
    const layersArray = useMemo(
        () => character ? Object.values(character.layers) as VNCharacterLayer[] : [],
        [character?.layers]
    );

    // Auto-select first expression if none selected
    useEffect(() => {
        if (character && !selectedExpressionId && expressionsArray.length > 0) {
            setSelectedExpressionId(expressionsArray[0].id);
        }
    }, [character, selectedExpressionId, expressionsArray, setSelectedExpressionId]);

    if (!character) return (
        <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
            <p>Select a character to begin editing.</p>
        </div>
    );

    const selectedExpression = selectedExpressionId ? character.expressions[selectedExpressionId] : null;

    /* ── Handlers ── */

    const updateCharacter = (updates: Partial<Pick<VNCharacter, 'name' | 'color' | 'fontFamily' | 'fontUrl' | 'fontSize' | 'fontWeight' | 'fontItalic' | 'baseImageUrl' | 'baseVideoUrl' | 'isBaseVideo' | 'baseVideoLoop'>>) => {
        dispatch({ type: 'UPDATE_CHARACTER', payload: { characterId: activeCharacterId, updates } });
    };

    const handleBaseImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const dataUrl = await fileToBase64(file);
        const isVideo = file.type.startsWith('video/');
        if (isVideo) {
            updateCharacter({ baseVideoUrl: dataUrl, baseImageUrl: null, isBaseVideo: true, baseVideoLoop: true });
        } else {
            updateCharacter({ baseImageUrl: dataUrl, baseVideoUrl: null, isBaseVideo: false });
        }
    };

    const handleFontUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.ttf') && !file.name.toLowerCase().endsWith('.otf')) {
            toast.warning('Please upload a TTF or OTF font file.');
            return;
        }
        const dataUrl = await fileToBase64(file);
        const fontName = file.name.replace(/\.(ttf|otf)$/i, '');
        updateCharacter({ fontUrl: dataUrl, fontFamily: fontName });
    };

    const handleAddExpression = () => {
        const name = `Expression ${expressionsArray.length + 1}`;
        dispatch({ type: 'ADD_EXPRESSION', payload: { characterId: activeCharacterId, name } });
    };

    const handleCommitExprRename = (exprId: VNID, name: string) => {
        dispatch({ type: 'UPDATE_EXPRESSION', payload: { characterId: activeCharacterId, expressionId: exprId, updates: { name } } });
        setRenamingExprId(null);
    };

    const handleDeleteExprRequest = (expr: VNCharacterExpression) => {
        if (expressionsArray.length <= 1) {
            toast.warning("Cannot delete the last expression.");
            return;
        }
        setConfirmDeleteExpr(expr);
    };

    const handleConfirmDeleteExpr = () => {
        if (!confirmDeleteExpr) return;
        dispatch({ type: 'DELETE_EXPRESSION', payload: { characterId: activeCharacterId, expressionId: confirmDeleteExpr.id } });
        if (selectedExpressionId === confirmDeleteExpr.id) {
            const remaining = expressionsArray.filter(e => e.id !== confirmDeleteExpr.id);
            setSelectedExpressionId(remaining[0]?.id || null);
        }
        setConfirmDeleteExpr(null);
    };

    const handleLayerAssetChange = (layerId: VNID, assetId: VNID | null) => {
        if (!selectedExpression) return;
        const newConfig = { ...selectedExpression.layerConfiguration, [layerId]: assetId };
        dispatch({ type: 'UPDATE_EXPRESSION', payload: { characterId: activeCharacterId, expressionId: selectedExpression.id, updates: { layerConfiguration: newConfig } } });
    };

    const handleAddLayer = () => {
        const name = `Layer ${layersArray.length + 1}`;
        dispatch({ type: 'ADD_CHARACTER_LAYER', payload: { characterId: activeCharacterId, name } });
    };

    /* ── Tab definitions ── */

    const tabs: { key: EditorTab; label: string; icon: string }[] = [
        { key: 'expressions', label: 'Expressions', icon: '🎭' },
        { key: 'layers', label: 'Sprite Layers', icon: '🖼️' },
        { key: 'style', label: 'Style', icon: '🎨' },
    ];

    /* ── Render ── */

    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* ─── Character Header Bar ─── */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                {/* Avatar / Base Image Thumbnail */}
                <div className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden bg-slate-700/50 flex items-center justify-center">
                    {character.baseVideoUrl ? (
                        <video src={character.baseVideoUrl} muted loop playsInline className="w-full h-full object-cover" />
                    ) : character.baseImageUrl ? (
                        <img src={character.baseImageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-lg font-bold" style={{ color: character.color }}>{character.name.charAt(0)}</span>
                    )}
                </div>

                {/* Name & Color */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                        type="text"
                        value={character.name}
                        onChange={e => updateCharacter({ name: e.target.value })}
                        className="bg-transparent text-base font-bold outline-none border-b border-transparent hover:border-[var(--border-subtle)] focus:border-[var(--accent-cyan)] transition-colors min-w-0 flex-shrink"
                        style={{ color: 'var(--text-primary)', maxWidth: '200px' }}
                    />
                    <div className="flex items-center gap-1.5">
                        <input
                            type="color"
                            value={character.color}
                            onChange={e => updateCharacter({ color: e.target.value })}
                            className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                            title="Dialogue color"
                        />
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>color</span>
                    </div>
                </div>

                {/* Expression Quick Switcher */}
                {expressionsArray.length > 0 && (
                    <select
                        value={selectedExpressionId || ''}
                        onChange={e => setSelectedExpressionId(e.target.value || null)}
                        className="text-xs rounded-md px-2 py-1 border"
                        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    >
                        {expressionsArray.map(expr => (
                            <option key={expr.id} value={expr.id}>{expr.name}</option>
                        ))}
                    </select>
                )}
            </div>

            {/* ─── Main Content: Preview + Tabbed Editor ─── */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Left: Preview */}
                <div className="w-2/5 flex flex-col border-r" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="px-3 py-1.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                            Preview
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {selectedExpression?.name || 'No expression'}
                        </span>
                    </div>
                    <div className="flex-1 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)' }}>
                        {/* Subtle checkerboard to indicate transparency */}
                        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-conic-gradient(#fff 0% 25%, transparent 0% 50%)', backgroundSize: '16px 16px' }} />
                        
                        {/* Base Image */}
                        {character.baseVideoUrl ? (
                            <video src={character.baseVideoUrl} autoPlay muted loop={character.baseVideoLoop} playsInline className="absolute inset-0 w-full h-full object-contain" />
                        ) : character.baseImageUrl ? (
                            <img src={character.baseImageUrl} alt="Base" className="absolute inset-0 w-full h-full object-contain" />
                        ) : null}

                        {/* Expression Layers */}
                        {selectedExpression && layersArray.map((layer: VNCharacterLayer) => {
                            const assetId = selectedExpression.layerConfiguration[layer.id];
                            if (!assetId) return null;
                            const asset = layer.assets[assetId];
                            if (!asset) return null;
                            if (asset.videoUrl) {
                                return <video key={layer.id} src={asset.videoUrl} autoPlay muted loop={asset.loop} playsInline className="absolute inset-0 w-full h-full object-contain" />;
                            } else if (asset.imageUrl) {
                                return <img key={layer.id} src={asset.imageUrl} alt={asset.name} className="absolute inset-0 w-full h-full object-contain" />;
                            }
                            return null;
                        })}

                        {/* Empty state */}
                        {!character.baseImageUrl && !character.baseVideoUrl && layersArray.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-center" style={{ color: 'var(--text-muted)' }}>
                                    <span className="text-3xl block mb-2">👤</span>
                                    <p className="text-xs">Upload a base sprite or add layers</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Tabbed Work Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Tab Bar */}
                    <div className="flex border-b flex-shrink-0" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                        {tabs.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 ${
                                    activeTab === tab.key
                                        ? 'border-[var(--accent-cyan)] text-[var(--accent-cyan)]'
                                        : 'border-transparent hover:text-white'
                                }`}
                                style={{ color: activeTab === tab.key ? undefined : 'var(--text-secondary)' }}
                            >
                                <span className="mr-1.5">{tab.icon}</span>{tab.label}
                                {tab.key === 'expressions' && (
                                    <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded-full" style={{ background: 'var(--bg-tertiary)' }}>
                                        {expressionsArray.length}
                                    </span>
                                )}
                                {tab.key === 'layers' && (
                                    <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded-full" style={{ background: 'var(--bg-tertiary)' }}>
                                        {layersArray.length}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {activeTab === 'expressions' && renderExpressionsTab()}
                        {activeTab === 'layers' && renderLayersTab()}
                        {activeTab === 'style' && renderStyleTab()}
                    </div>
                </div>
            </div>

            <ConfirmationModal isOpen={!!confirmDeleteExpr} onClose={() => setConfirmDeleteExpr(null)} onConfirm={handleConfirmDeleteExpr} title="Delete Expression">
                Are you sure you want to delete the expression &ldquo;{confirmDeleteExpr?.name}&rdquo;?
            </ConfirmationModal>
        </div>
    );

    /* ── Tab Renderers ── */

    function renderExpressionsTab() {
        return (
            <div className="space-y-4">
                {/* Expression List */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                            Expressions
                        </h3>
                        <button
                            onClick={handleAddExpression}
                            className="text-xs px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors bg-[var(--accent-cyan)]/10 hover:bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                        >
                            <PlusIcon className="w-3 h-3" /> Add
                        </button>
                    </div>
                    <div className="space-y-1">
                        {expressionsArray.map(expr => (
                            <ExpressionListItem
                                key={expr.id}
                                expr={expr}
                                isSelected={selectedExpressionId === expr.id}
                                isRenaming={renamingExprId === expr.id}
                                layers={character.layers}
                                onSelect={() => setSelectedExpressionId(expr.id)}
                                onStartRename={() => setRenamingExprId(expr.id)}
                                onCommitRename={name => handleCommitExprRename(expr.id, name)}
                                onDeleteRequest={() => handleDeleteExprRequest(expr)}
                            />
                        ))}
                    </div>
                </div>

                {/* Expression Layer Configuration */}
                {selectedExpression && layersArray.length > 0 && (
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                            Layer Config: <span style={{ color: 'var(--accent-cyan)' }}>{selectedExpression.name}</span>
                        </h3>
                        <p className="text-[10px] mb-3" style={{ color: 'var(--text-muted)' }}>
                            Choose which asset from each layer is visible for this expression.
                        </p>
                        <div className="space-y-2">
                            {layersArray.map((layer: VNCharacterLayer) => (
                                <div key={layer.id} className="flex items-center gap-2">
                                    <span className="text-xs font-medium w-24 truncate flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                        {layer.name}
                                    </span>
                                    <select
                                        value={selectedExpression.layerConfiguration[layer.id] || ''}
                                        onChange={e => handleLayerAssetChange(layer.id, e.target.value || null)}
                                        className="flex-1 text-xs rounded-md px-2 py-1.5 border"
                                        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                                    >
                                        <option value="">(None)</option>
                                        {Object.values(layer.assets).map((asset: VNLayerAsset) => (
                                            <option key={asset.id} value={asset.id}>{asset.name}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {selectedExpression && layersArray.length === 0 && (
                    <div className="text-center py-4 rounded-lg border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            No sprite layers defined yet.
                        </p>
                        <button
                            onClick={() => setActiveTab('layers')}
                            className="text-xs text-[var(--accent-cyan)] hover:underline mt-1"
                        >
                            Go to Sprite Layers →
                        </button>
                    </div>
                )}
            </div>
        );
    }

    function renderLayersTab() {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                            Sprite Layers
                        </h3>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            Layers stack on top of each other. Upload assets, then assign them per-expression.
                        </p>
                    </div>
                    <button
                        onClick={handleAddLayer}
                        className="text-xs px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors bg-sky-500/10 hover:bg-sky-500/20 text-sky-400"
                    >
                        <PlusIcon className="w-3 h-3" /> Add Layer
                    </button>
                </div>

                {layersArray.length === 0 ? (
                    <div className="text-center py-8 rounded-lg border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                        <span className="text-3xl block mb-2">🖼️</span>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            No layers yet. Layers let you build composite sprites<br />
                            (e.g., separate body, face, accessories).
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {layersArray.map(layer => (
                            <LayerCard key={layer.id} characterId={character.id} layer={layer} />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    function renderStyleTab() {
        return (
            <div className="space-y-5 max-w-md">
                {/* Base Image Section */}
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                        Base Sprite
                    </h3>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                        Optional base image/video shown behind all layers for every expression.
                    </p>
                    <div className="flex items-center gap-2">
                        {character.baseVideoUrl ? (
                            <video src={character.baseVideoUrl} muted loop playsInline className="w-14 h-14 object-contain rounded-md bg-slate-700" />
                        ) : character.baseImageUrl ? (
                            <img src={character.baseImageUrl} alt="Base" className="w-14 h-14 object-contain rounded-md bg-slate-700" />
                        ) : (
                            <div className="w-14 h-14 rounded-md bg-slate-700/50 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                                <span className="text-lg">👤</span>
                            </div>
                        )}
                        <div className="flex-1 flex flex-col gap-1">
                            <button
                                onClick={() => baseImageInputRef.current?.click()}
                                className="text-xs py-1.5 rounded-md flex items-center justify-center gap-1 transition-colors"
                                style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                            >
                                <UploadIcon /> {(character.baseImageUrl || character.baseVideoUrl) ? 'Change...' : 'Upload...'}
                            </button>
                            {(character.baseImageUrl || character.baseVideoUrl) && (
                                <button
                                    onClick={() => updateCharacter({ baseImageUrl: null, baseVideoUrl: null, isBaseVideo: false })}
                                    className="text-xs py-1 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                        <input type="file" ref={baseImageInputRef} onChange={handleBaseImageUpload} accept="image/*,video/*" className="hidden" />
                    </div>
                </div>

                <hr style={{ borderColor: 'var(--border-subtle)' }} />

                {/* Font Settings */}
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                        Dialogue Font
                    </h3>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                        Override the project default for this character's dialogue text.
                    </p>

                    <FormField label="Font Family">
                        <Select
                            value={character.fontFamily || ''}
                            onChange={e => updateCharacter({ fontFamily: e.target.value || undefined })}
                        >
                            {popularFonts.map(f => (
                                <option key={f} value={f === 'Default (Use Project Settings)' ? '' : f}>
                                    {f.split(',')[0]}
                                </option>
                            ))}
                        </Select>
                    </FormField>

                    {/* Custom font upload */}
                    <div className="flex items-center gap-2 mb-3">
                        <button
                            onClick={() => fontFileInputRef.current?.click()}
                            className="flex-1 text-xs py-1.5 rounded-md flex items-center justify-center gap-1 transition-colors"
                            style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                        >
                            <UploadIcon /> {character.fontUrl ? 'Change Font File...' : 'Upload TTF/OTF...'}
                        </button>
                        {character.fontUrl && (
                            <button
                                onClick={() => updateCharacter({ fontUrl: undefined, fontFamily: '' })}
                                className="p-1.5 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                                <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                        )}
                        <input type="file" ref={fontFileInputRef} onChange={handleFontUpload} accept=".ttf,.otf" className="hidden" />
                    </div>
                    {character.fontUrl && (
                        <p className="text-[10px] text-[var(--accent-cyan)] mb-3">✓ Custom font: {character.fontFamily}</p>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <FormField label="Font Size (px)">
                            <TextInput
                                type="number"
                                value={character.fontSize || ''}
                                onChange={e => updateCharacter({ fontSize: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                                placeholder="Default"
                            />
                        </FormField>
                        <FormField label="Weight">
                            <Select
                                value={character.fontWeight || 'normal'}
                                onChange={e => updateCharacter({ fontWeight: e.target.value as 'normal' | 'bold' })}
                            >
                                <option value="normal">Normal</option>
                                <option value="bold">Bold</option>
                            </Select>
                        </FormField>
                    </div>

                    <label className="flex items-center gap-2 text-xs cursor-pointer mt-1" style={{ color: 'var(--text-secondary)' }}>
                        <input
                            type="checkbox"
                            checked={character.fontItalic || false}
                            onChange={e => updateCharacter({ fontItalic: e.target.checked })}
                            className="accent-[var(--accent-cyan)]"
                        />
                        Italic
                    </label>
                </div>
            </div>
        );
    }
};

export default CharacterEditor;