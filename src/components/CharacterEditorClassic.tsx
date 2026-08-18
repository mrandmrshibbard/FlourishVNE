/**
 * CharacterEditor — Unified character editing component
 * 
 * Consolidates preview, identity, expressions, layers, and style settings
 * into a single tabbed interface to eliminate the scattered multi-panel layout.
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useInlineRename } from '../hooks/useInlineRename';
import { useProject } from '../contexts/ProjectContext';
import { useToast } from '../contexts/ToastContext';
import { VNID } from '../types';
import { VNCharacter, VNCharacterExpression, VNCharacterLayer, VNLayerAsset, VNCharacterTextbox } from '../features/character/types';
import type { VNDialogueTextEffect } from '../features/scene/types';
import { layerBoxStyle, layerOrderForPose, poseHiddenLayerIds, resolveLayerBox } from '../features/character/layout';
import { fileToBase64 } from '../utils/file';
import { ingestUpload, resolveFieldUrl } from '../utils/assetStore';
import { PlusIcon, TrashIcon, UploadIcon, PencilIcon } from './icons';
import { FormField, TextInput, Select, ColorInput } from './ui/Form';
import VideoTrimFields from './ui/VideoTrimFields';
import TrimmedVideo from './ui/TrimmedVideo';
import TextboxStyleFields from './ui/TextboxStyleFields';
import { popularFonts as _sharedFonts } from './ui/FontEditor';
import ConfirmationModal from './ui/ConfirmationModal';
import VariableTokenButton from './variables/VariableTokenButton';
import { characterNameInitial } from '../utils/variableInterpolation';
import { sanitizeFontFamily, analyzeFontComplexity, rendererFreezesOnComplexFonts } from '../utils/styleUtils';
import TypingBlipFields from './ui/TypingBlipFields';
import AnimationStudio from './character-anim/AnimationStudio';
import TextboxThemeSummary from './character/TextboxThemeSummary';

type EditorTab = 'expressions' | 'layers' | 'style';

const popularFonts = ['Default (Use Project Settings)', ..._sharedFonts];

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
    const { t } = useTranslation('characters');
    const { inputProps: renameInputProps } = useInlineRename(expr.name, (newName) => {
        const trimmed = newName.trim();
        onCommitRename(trimmed || expr.name);
    });

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
                        {...renameInputProps}
                        onFocus={e => e.target.select()}
                        className="w-full bg-slate-900 text-white px-2 py-0.5 rounded text-sm outline-none ring-1 ring-[var(--accent-cyan)]"
                    />
                ) : (
                    <>
                        <span className="text-sm block truncate" style={{ color: 'var(--text-primary)' }}>{expr.name}</span>
                        {totalLayers > 0 && (
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                {t('editor.layersCount', { configured: configuredCount, total: totalLayers })}
                            </span>
                        )}
                    </>
                )}
            </div>

            <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={e => { e.stopPropagation(); onStartRename(); }} className="p-1 text-slate-500 hover:text-[var(--accent-cyan)]" title={t('editor.rename')}>
                    <PencilIcon className="w-3 h-3" />
                </button>
                <button onClick={e => { e.stopPropagation(); onDeleteRequest(); }} className="p-1 text-slate-500 hover:text-red-400" title={t('editor.delete')}>
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
    const { t } = useTranslation('characters');
    const { project, dispatch } = useProject();
    const [isRenaming, setIsRenaming] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { inputProps: layerRenameInputProps } = useInlineRename(layer.name, (newName) => {
        if (newName.trim()) {
            dispatch({ type: 'UPDATE_CHARACTER_LAYER', payload: { characterId, layerId: layer.id, name: newName.trim() } });
        }
        setIsRenaming(false);
    });

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const isVideo = file.type.startsWith('video/');
        const id = `asset-${Math.random().toString(36).substring(2, 9)}`;
        const url = await ingestUpload(project.id, 'characters', id as any, file);
        dispatch({
            type: 'ADD_LAYER_ASSET',
            payload: {
                characterId,
                layerId: layer.id,
                id,
                name: file.name.split('.')[0],
                ...(isVideo ? { videoUrl: url, isVideo: true, loop: true } : { imageUrl: url })
            }
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDeleteLayer = () => {
        if (confirm(t('editor.deleteLayerConfirm', { name: layer.name }))) {
            dispatch({ type: 'DELETE_CHARACTER_LAYER', payload: { characterId, layerId: layer.id } });
        }
    };

    const handleDeleteAsset = (assetId: VNID, assetName: string) => {
        if (confirm(t('editor.deleteAssetConfirm', { name: assetName }))) {
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
                        {...layerRenameInputProps}
                        className="bg-slate-900 text-white px-2 py-0.5 rounded text-sm outline-none ring-1 ring-sky-500 flex-1"
                    />
                ) : (
                    <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>{layer.name}</span>
                )}
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                    {t('editor.assetsCount', { count: assetCount })}
                </span>
                <button onClick={e => { e.stopPropagation(); setIsRenaming(true); }} className="p-1 text-slate-500 hover:text-sky-400" title={t('editor.renameLayer')}>
                    <PencilIcon className="w-3 h-3" />
                </button>
                <button onClick={e => { e.stopPropagation(); handleDeleteLayer(); }} className="p-1 text-slate-500 hover:text-red-400" title={t('editor.deleteLayer')}>
                    <TrashIcon className="w-3 h-3" />
                </button>
            </div>

            {/* Layer Content */}
            {!isCollapsed && (
                <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    {assetCount === 0 ? (
                        <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>{t('editor.noAssetsYet')}</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-1.5 mb-2">
                            {Object.values(layer.assets).map((asset: VNLayerAsset) => (
                                <div key={asset.id} className="group relative rounded-md overflow-hidden bg-slate-800 aspect-square">
                                    {asset.videoUrl ? (
                                        <video src={resolveFieldUrl(project.id, asset.videoUrl) || undefined} muted loop playsInline className="w-full h-full object-contain" />
                                    ) : asset.imageUrl ? (
                                        <img src={resolveFieldUrl(project.id, asset.imageUrl) || undefined} alt={asset.name} className="w-full h-full object-contain" />
                                    ) : null}
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
                                        {/* Editable sprite name — rename freely after upload (id unchanged). */}
                                        <input
                                            value={asset.name}
                                            onChange={e => dispatch({ type: 'UPDATE_LAYER_ASSET', payload: { characterId, layerId: layer.id, assetId: asset.id, updates: { name: e.target.value } } })}
                                            onClick={e => e.stopPropagation()}
                                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                            title={t('editor.renameSprite', 'Rename this sprite')}
                                            className="text-[10px] text-white truncate block w-full bg-transparent outline-none rounded px-0.5 focus:bg-black/70 focus:ring-1 focus:ring-sky-500"
                                        />
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
                        <UploadIcon /> {t('editor.uploadAsset')}
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleUpload} accept="image/*,video/*" className="hidden" />
                </div>
            )}
        </div>
    );
};

/* ───── Main Component ───── */

const CharacterEditorClassic: React.FC<{
    activeCharacterId: VNID;
    selectedExpressionId: VNID | null;
    setSelectedExpressionId: (id: VNID | null) => void;
    headerSlot?: React.ReactNode;
}> = ({ activeCharacterId, selectedExpressionId, setSelectedExpressionId, headerSlot }) => {
    const { t } = useTranslation('characters');
    const { project, dispatch } = useProject();
    const toast = useToast();
    const character = project.characters[activeCharacterId];
    const [activeTab, setActiveTab] = useState<EditorTab>('expressions');
    const [renamingExprId, setRenamingExprId] = useState<VNID | null>(null);
    const [confirmDeleteExpr, setConfirmDeleteExpr] = useState<VNCharacterExpression | null>(null);
    const [animationsOpen, setAnimationsOpen] = useState(false);
    const baseImageInputRef = useRef<HTMLInputElement>(null);
    const fontFileInputRef = useRef<HTMLInputElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);

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
            <p>{t('editor.selectCharacter')}</p>
        </div>
    );

    const selectedExpression = selectedExpressionId ? character.expressions[selectedExpressionId] : null;

    /* ── Handlers ── */

    const updateCharacter = (updates: Partial<Pick<VNCharacter, 'name' | 'color' | 'fontFamily' | 'fontUrl' | 'fontSize' | 'fontWeight' | 'fontItalic' | 'baseImageUrl' | 'baseVideoUrl' | 'isBaseVideo' | 'baseVideoLoop' | 'baseVideoTrimStart' | 'baseVideoTrimEnd' | 'textbox' | 'textboxThemeId' | 'defaultVoiceId' | 'phoneRingtoneAudioId' | 'textEffect' | 'nameTextEffect' | 'dialogueTextColorMode' | 'dialogueTextColor' | 'typingBlip'>>) => {
        dispatch({ type: 'UPDATE_CHARACTER', payload: { characterId: activeCharacterId, updates } });
    };

    /** Patch one per-character textbox override field (merges into the existing textbox).
     *  Passing undefined clears that field so it falls back to the project-global look. */
    const updateTextbox = (patch: Partial<VNCharacterTextbox>) => {
        updateCharacter({ textbox: { ...character.textbox, ...patch } });
    };

    const handleBaseImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const isVideo = file.type.startsWith('video/');
        // Fresh id per upload — a reused id keeps the same URL and the image cache shows stale art.
        const url = await ingestUpload(project.id, 'characters', `${character.id}-base-${Math.random().toString(36).substring(2, 9)}` as any, file);
        if (isVideo) {
            updateCharacter({ baseVideoUrl: url, baseImageUrl: null, isBaseVideo: true, baseVideoLoop: true });
        } else {
            updateCharacter({ baseImageUrl: url, baseVideoUrl: null, isBaseVideo: false });
        }
    };

    const handleFontUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.ttf') && !file.name.toLowerCase().endsWith('.otf')) {
            toast.warning(t('editor.fontUploadWarning'));
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            toast.warning(t('editor.fontSizeWarning', 'This font is very large ({{mb}} MB) — it will make your project file much bigger and saving slower. A subsetted version of the font would work better.', { mb: Math.round(file.size / 1024 / 1024) }));
        }
        const complexity = analyzeFontComplexity(await file.arrayBuffer());
        if (complexity?.tooComplex && rendererFreezesOnComplexFonts()) {
            toast.error(t('editor.fontTooComplex', "This font can't be used — its letters are drawn with extremely detailed outlines (about {{kb}} KB per letter) that would freeze the app. If the font has a simpler version, use that one.", { kb: Math.round(complexity.avgGlyphBytes / 1024) }));
            return;
        }
        const dataUrl = await fileToBase64(file);
        // CSS-safe family: dots/parentheses in a filename make new FontFace() throw,
        // so the font would silently never load and text falls back to the default face.
        const fontName = sanitizeFontFamily(file.name.replace(/\.(ttf|otf)$/i, ''));
        updateCharacter({ fontUrl: dataUrl, fontFamily: fontName });
    };

    const handleAddExpression = () => {
        const name = t('editor.newExpressionName', { n: expressionsArray.length + 1 });
        dispatch({ type: 'ADD_EXPRESSION', payload: { characterId: activeCharacterId, name } });
    };

    const handleCommitExprRename = (exprId: VNID, name: string) => {
        dispatch({ type: 'UPDATE_EXPRESSION', payload: { characterId: activeCharacterId, expressionId: exprId, updates: { name } } });
        setRenamingExprId(null);
    };

    const handleDeleteExprRequest = (expr: VNCharacterExpression) => {
        if (expressionsArray.length <= 1) {
            toast.warning(t('editor.cannotDeleteLast'));
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
        const name = t('editor.newLayerName', { n: layersArray.length + 1 });
        dispatch({ type: 'ADD_CHARACTER_LAYER', payload: { characterId: activeCharacterId, name } });
    };

    /* ── Tab definitions ── */

    const tabs: { key: EditorTab; label: string; icon: string }[] = [
        { key: 'expressions', label: t('editor.tabExpressions'), icon: '🎭' },
        { key: 'layers', label: t('editor.tabLayers'), icon: '🖼️' },
        { key: 'style', label: t('editor.tabStyle'), icon: '🎨' },
    ];

    /* ── Render ── */

    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* ─── Character Header Bar ─── */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                {/* Avatar / Base Image Thumbnail */}
                <div className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden bg-slate-700/50 flex items-center justify-center">
                    {character.baseVideoUrl ? (
                        <video src={resolveFieldUrl(project.id, character.baseVideoUrl) || undefined} muted loop playsInline className="w-full h-full object-cover" />
                    ) : character.baseImageUrl ? (
                        <img src={resolveFieldUrl(project.id, character.baseImageUrl) || undefined} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-lg font-bold" style={{ color: character.color }}>{characterNameInitial(character.name)}</span>
                    )}
                </div>

                {/* Name & Color */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                        ref={nameInputRef}
                        type="text"
                        value={character.name}
                        onChange={e => updateCharacter({ name: e.target.value })}
                        className="bg-transparent text-base font-bold outline-none border-b border-transparent hover:border-[var(--border-subtle)] focus:border-[var(--accent-cyan)] transition-colors min-w-0 flex-shrink"
                        style={{ color: 'var(--text-primary)', maxWidth: '200px' }}
                    />
                    {/* Names can hold {Variable} tokens — "???" until the reveal, nicknames, etc. */}
                    <VariableTokenButton targetRef={nameInputRef} value={character.name} onChange={name => updateCharacter({ name })} />
                    <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {t('editor.nameTokenHint', 'Names can show a variable — pick { } to make the name change during the story')}
                    </span>
                    <div className="flex items-center gap-1.5">
                        <ColorInput value={character.color} onChange={v => updateCharacter({ color: v })} />
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t('editor.color')}</span>
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
                {headerSlot}
            </div>

            {/* ─── Main Content: Preview + Tabbed Editor ─── */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Left: Preview */}
                <div className="w-2/5 flex flex-col border-r" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="px-3 py-1.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                            {t('editor.preview')}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {selectedExpression?.name || t('editor.noExpression')}
                        </span>
                    </div>
                    <div className="flex-1 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)' }}>
                        {/* Subtle checkerboard to indicate transparency */}
                        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-conic-gradient(#fff 0% 25%, transparent 0% 50%)', backgroundSize: '16px 16px' }} />

                        {/* The sprite composes inside a strict 3:4 frame through the SHARED layout
                            resolvers (boxes, stacking order, hidden layers) — the same contract as
                            the stage / Pose Studio / New editor. Composing against the raw panel
                            with no boxes made Pose Studio adjustments look wrong here. */}
                        <div className="absolute inset-0 flex items-center justify-center p-2" style={{ containerType: 'size' } as React.CSSProperties}>
                        <div className="relative" style={{ width: 'min(100cqw, 75cqh)', aspectRatio: '3 / 4', outline: '1px dashed rgba(148,163,184,0.15)' }}>
                        {/* Base Image */}
                        {character.baseVideoUrl ? (
                            <TrimmedVideo src={resolveFieldUrl(project.id, character.baseVideoUrl) || undefined} autoPlay muted loop={character.baseVideoLoop} trimStart={(character as any).baseVideoTrimStart} trimEnd={(character as any).baseVideoTrimEnd} playsInline className="absolute inset-0 w-full h-full object-contain" />
                        ) : character.baseImageUrl ? (
                            <img src={resolveFieldUrl(project.id, character.baseImageUrl) || undefined} alt="Base" className="absolute inset-0 w-full h-full object-contain" />
                        ) : null}

                        {/* Expression Layers — shared resolvers: order + hidden + boxes */}
                        {selectedExpression && (() => {
                            const hidden = poseHiddenLayerIds(character, undefined);
                            return layerOrderForPose(character, undefined).map((layer: VNCharacterLayer, stackIdx: number) => {
                                if (hidden.has(layer.id)) return null;
                                const assetId = selectedExpression.layerConfiguration[layer.id];
                                if (!assetId) return null;
                                const asset = layer.assets[assetId];
                                if (!asset) return null;
                                const boxStyle = { zIndex: stackIdx + 1, ...layerBoxStyle(resolveLayerBox(layer, asset, undefined)) };
                                if (asset.videoUrl) {
                                    return <video key={layer.id} src={resolveFieldUrl(project.id, asset.videoUrl) || undefined} autoPlay muted loop={asset.loop} playsInline className="absolute inset-0 w-full h-full object-contain" style={boxStyle} />;
                                } else if (asset.imageUrl) {
                                    return <img key={layer.id} src={resolveFieldUrl(project.id, asset.imageUrl) || undefined} alt={asset.name} className="absolute inset-0 w-full h-full object-contain" style={boxStyle} />;
                                }
                                return null;
                            });
                        })()}
                        </div>
                        </div>

                        {/* Empty state */}
                        {!character.baseImageUrl && !character.baseVideoUrl && layersArray.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-center" style={{ color: 'var(--text-muted)' }}>
                                    <span className="text-3xl block mb-2">👤</span>
                                    <p className="text-xs">{t('editor.uploadBaseHint')}</p>
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

            <ConfirmationModal isOpen={!!confirmDeleteExpr} onClose={() => setConfirmDeleteExpr(null)} onConfirm={handleConfirmDeleteExpr} title={t('editor.deleteExpression')}>
                {t('editor.deleteExpressionConfirm', { name: confirmDeleteExpr?.name })}
            </ConfirmationModal>
            {animationsOpen && (
                <AnimationStudio
                    character={character}
                    projectId={project.id}
                    onClose={() => setAnimationsOpen(false)}
                />
            )}
        </div>
    );

    /* ── Tab Renderers ── */

    function renderExpressionsTab() {
        return (
            <div className="space-y-4">
                {/* Mirrored from the Style tab — see TextboxThemeSummary for why it's surfaced here. */}
                <TextboxThemeSummary character={character} project={project} onEdit={() => setActiveTab('style')} />

                {/* Expression List */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                            {t('editor.expressions')}
                        </h3>
                        <button
                            onClick={handleAddExpression}
                            className="text-xs px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors bg-[var(--accent-cyan)]/10 hover:bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                        >
                            <PlusIcon className="w-3 h-3" /> {t('editor.add')}
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
                            {t('editor.layerConfig')} <span style={{ color: 'var(--accent-cyan)' }}>{selectedExpression.name}</span>
                        </h3>
                        <p className="text-[10px] mb-3" style={{ color: 'var(--text-muted)' }}>
                            {t('editor.layerConfigHint')}
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
                                        <option value="">{t('editor.none')}</option>
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
                            {t('editor.noLayersYet')}
                        </p>
                        <button
                            onClick={() => setActiveTab('layers')}
                            className="text-xs text-[var(--accent-cyan)] hover:underline mt-1"
                        >
                            {t('editor.goToLayers')}
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
                            {t('editor.spriteLayers')}
                        </h3>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {t('editor.spriteLayersHint')}
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setAnimationsOpen(true)}
                            className="text-xs px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors border hover:bg-[var(--bg-tertiary)]"
                            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                            title={t('anim.openHint', 'Make this character blink, talk, or move pieces on a loop — using their existing pieces as frames')}
                        >
                            🎞️ {t('anim.open', 'Animations')}
                        </button>
                        <button
                            onClick={handleAddLayer}
                            className="text-xs px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors bg-sky-500/10 hover:bg-sky-500/20 text-sky-400"
                        >
                            <PlusIcon className="w-3 h-3" /> {t('editor.addLayer')}
                        </button>
                    </div>
                </div>

                {layersArray.length === 0 ? (
                    <div className="text-center py-8 rounded-lg border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                        <span className="text-3xl block mb-2">🖼️</span>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {t('editor.noLayersComposite')}
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
                        {t('editor.baseSprite')}
                    </h3>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                        {t('editor.baseSpriteHint')}
                    </p>
                    {Object.keys((character as any).poses || {}).length > 0 && (
                        <p className="text-[10px] mb-2 text-amber-400/80">{t('poses.classicPointer', 'This character has poses — manage them in the New character editor (switch views at the top).')}</p>
                    )}
                    <div className="flex items-center gap-2">
                        {character.baseVideoUrl ? (
                            <video src={resolveFieldUrl(project.id, character.baseVideoUrl) || undefined} muted loop playsInline className="w-14 h-14 object-contain rounded-md bg-slate-700" />
                        ) : character.baseImageUrl ? (
                            <img src={resolveFieldUrl(project.id, character.baseImageUrl) || undefined} alt="Base" className="w-14 h-14 object-contain rounded-md bg-slate-700" />
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
                                <UploadIcon /> {(character.baseImageUrl || character.baseVideoUrl) ? t('editor.change') : t('editor.upload')}
                            </button>
                            {(character.baseImageUrl || character.baseVideoUrl) && (
                                <button
                                    onClick={() => updateCharacter({ baseImageUrl: null, baseVideoUrl: null, isBaseVideo: false })}
                                    className="text-xs py-1 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                    {t('editor.remove')}
                                </button>
                            )}
                        </div>
                        <input type="file" ref={baseImageInputRef} onChange={handleBaseImageUpload} accept="image/*,video/*" className="hidden" />
                    </div>
                    {character.baseVideoUrl && (
                        <VideoTrimFields className="mt-2" start={(character as any).baseVideoTrimStart} end={(character as any).baseVideoTrimEnd}
                            onChange={patch => updateCharacter({ baseVideoTrimStart: patch.trimStart, baseVideoTrimEnd: patch.trimEnd } as any)} />
                    )}
                </div>

                <hr style={{ borderColor: 'var(--border-subtle)' }} />

                {/* Font Settings */}
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                        {t('editor.dialogueFont')}
                    </h3>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                        {t('editor.dialogueFontHint')}
                    </p>

                    <FormField label={t('editor.fontFamily')}>
                        <Select
                            value={character.fontFamily || ''}
                            onChange={e => updateCharacter({ fontFamily: e.target.value || undefined })}
                        >
                            {popularFonts.map(f => (
                                <option key={f} value={f === 'Default (Use Project Settings)' ? '' : f}>
                                    {f === 'Default (Use Project Settings)' ? t('editor.fontDefault') : f.split(',')[0]}
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
                            <UploadIcon /> {character.fontUrl ? t('editor.changeFontFile') : t('editor.uploadFontFile')}
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
                        <p className="text-[10px] text-[var(--accent-cyan)] mb-3">{t('editor.customFont', { name: character.fontFamily })}</p>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <FormField label={t('editor.fontSize')}>
                            <TextInput
                                type="number"
                                value={character.fontSize || ''}
                                onChange={e => updateCharacter({ fontSize: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                                placeholder={t('editor.fontSizeDefault')}
                            />
                        </FormField>
                        <FormField label={t('editor.weight')}>
                            <Select
                                value={character.fontWeight || 'normal'}
                                onChange={e => updateCharacter({ fontWeight: e.target.value as 'normal' | 'bold' })}
                            >
                                <option value="normal">{t('editor.normal')}</option>
                                <option value="bold">{t('editor.bold')}</option>
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
                        {t('editor.italic')}
                    </label>

                    {/* Text effects — dialogue-line default + name-box effect (twin of CharacterEditorNew). */}
                    <div className="mt-3">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>{t('fx.title', 'Text effects')}</h4>
                        <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>{t('fx.hint', 'Make their words or their name move. You can also wrap part of a name in tags like [wave]…[/wave] right in the name field.')}</p>
                        {([
                            ['textEffect', t('fx.lines', 'Their lines (dialogue text)')],
                            ['nameTextEffect', t('fx.name', 'Their name (in the name box)')],
                        ] as Array<['textEffect' | 'nameTextEffect', string]>).map(([field, label]) => {
                            const cur = character[field] as VNDialogueTextEffect | undefined;
                            const setEff = (eff?: VNDialogueTextEffect) => updateCharacter({ [field]: eff } as any);
                            return (
                                <div key={field} className="mb-2">
                                    <FormField label={label}>
                                        <Select value={cur?.type ?? 'none'} onChange={e => {
                                            const type = e.target.value;
                                            if (type === 'none') setEff(undefined);
                                            else setEff({ type: type as VNDialogueTextEffect['type'], speed: cur?.speed ?? 1, intensity: cur?.intensity ?? 1 });
                                        }}>
                                            {(['none', 'shake', 'wave', 'rainbow', 'glitch', 'pulse', 'fade-in', 'bounce', 'typewriter-bounce'] as const).map(v => (
                                                <option key={v} value={v}>{t(`fx.opt.${v}`, { defaultValue: { none: 'None', shake: 'Shake', wave: 'Wave', rainbow: 'Rainbow', glitch: 'Glitch', pulse: 'Pulse', 'fade-in': 'Fade in', bounce: 'Bounce', 'typewriter-bounce': 'Typewriter bounce' }[v] })}</option>
                                            ))}
                                        </Select>
                                    </FormField>
                                    {cur && (
                                        <div className="grid grid-cols-2 gap-3 mt-1">
                                            <label className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                {t('fx.speed', 'Speed')} — {(cur.speed ?? 1).toFixed(1)}x
                                                <input type="range" min={0.1} max={5} step={0.1} value={cur.speed ?? 1}
                                                    onChange={e => setEff({ ...cur, speed: parseFloat(e.target.value) })}
                                                    className="w-full accent-[var(--accent-cyan)]" />
                                            </label>
                                            <label className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                {t('fx.strength', 'Strength')} — {(cur.intensity ?? 1).toFixed(1)}x
                                                <input type="range" min={0.1} max={3} step={0.1} value={cur.intensity ?? 1}
                                                    onChange={e => setEff({ ...cur, intensity: parseFloat(e.target.value) })}
                                                    className="w-full accent-[var(--accent-cyan)]" />
                                            </label>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <hr style={{ borderColor: 'var(--border-subtle)' }} />

                {/* Dialogue Textbox (per-character override) */}
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                        {t('hc.dialogueTextbox', 'Dialogue Textbox')}
                    </h3>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                        {t('hc.pickAReusableThemeAnd', 'Pick a reusable theme and/or set a custom look. Anything left blank uses your project\'s default dialogue UI.')}
                    </p>
                    <FormField label={t('hc.textboxTheme', 'Textbox theme')}>
                        <Select value={character.textboxThemeId || ''} onChange={e => updateCharacter({ textboxThemeId: e.target.value || undefined })}>
                            <option value="">{t('hc.noneUseProjectDefault', 'None (use project default)')}</option>
                            {Object.values(project.textboxThemes || {}).map((th: any) => (
                                <option key={th.id} value={th.id}>{th.name}</option>
                            ))}
                        </Select>
                    </FormField>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                        {t('hc.createAndEditThemesIn', 'Create and edit themes in the In-Game UI Editor → Textbox Themes.')}
                    </p>
                    <FormField label={t('hc.speakInColor', 'Speak in color')}>
                        <Select value={character.dialogueTextColorMode || 'off'} onChange={e => updateCharacter({ dialogueTextColorMode: (e.target.value === 'off' ? undefined : e.target.value) as any })}>
                            <option value="off">{t('hc.offUseTheTextboxText', 'Off — use the textbox text color')}</option>
                            <option value="character">My name color ({character.color})</option>
                            <option value="custom">{t('hc.aCustomColor', 'A custom color…')}</option>
                        </Select>
                    </FormField>
                    {character.dialogueTextColorMode === 'custom' && (
                        <FormField label={t('hc.dialogueTextColor', 'Dialogue text color')}>
                            <ColorInput value={character.dialogueTextColor || character.color} onChange={(v: string) => updateCharacter({ dialogueTextColor: v })} />
                        </FormField>
                    )}
                    {(character.dialogueTextColorMode === 'character' || character.dialogueTextColorMode === 'custom') && (
                        <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                            {t('hc.everyLineThisCharacterSpeaks', 'Every line this character speaks renders in this color — an instant “who’s talking” cue.')}
                        </p>
                    )}
                    <label className="flex items-center gap-2 text-xs cursor-pointer mb-2" style={{ color: 'var(--text-secondary)' }}>
                        <input
                            type="checkbox"
                            checked={!!character.textbox}
                            onChange={e => updateCharacter({ textbox: e.target.checked ? (character.textbox ?? {}) : undefined })}
                            className="accent-[var(--accent-cyan)]"
                        />
                        Custom override for this character {character.textboxThemeId ? '(layers on top of the theme)' : ''}
                    </label>
                    {character.textbox && <TextboxStyleFields value={character.textbox} onChange={updateTextbox} />}
                </div>

                <hr style={{ borderColor: 'var(--border-subtle)' }} />

                {/* Default Voice */}
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                        {t('editor.defaultVoice')}
                    </h3>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                        {t('editor.defaultVoiceHint')}
                    </p>
                    <FormField label={t('editor.voiceClip')}>
                        <Select
                            value={character.defaultVoiceId || ''}
                            onChange={e => updateCharacter({ defaultVoiceId: e.target.value || null })}
                        >
                            <option value="">{t('editor.voiceNone')}</option>
                            {Object.values(project.audio || {}).map((a: any) => (
                                <option key={a.id} value={a.id}>{a.name || a.id}</option>
                            ))}
                        </Select>
                    </FormField>
                    <FormField label={t('editor.phoneRingtone', 'Phone ringtone')}>
                        <Select
                            value={character.phoneRingtoneAudioId || ''}
                            onChange={e => updateCharacter({ phoneRingtoneAudioId: e.target.value || null })}
                        >
                            <option value="">{t('editor.voiceNone')}</option>
                            {Object.values(project.audio || {}).map((a: any) => (
                                <option key={a.id} value={a.id}>{a.name || a.id}</option>
                            ))}
                        </Select>
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{t('editor.phoneRingtoneHint', 'Default ringtone when this character calls (an Incoming Call command can override it).')}</p>
                    </FormField>
                    {/* Typing sound (Undertale-style letter blips) */}
                    <FormField label={t('editor.typingBlip', 'Typing sound (letter blips)')}>
                        <label className="flex items-center gap-1.5 mb-1.5">
                            <input type="checkbox" checked={!!character.typingBlip}
                                onChange={e => updateCharacter({ typingBlip: e.target.checked ? { audioId: null } : undefined })}
                                className="w-4 h-4" />
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('editor.typingBlipEnable', 'Play a little sound as their words type out')}</span>
                        </label>
                        {character.typingBlip && (
                            <TypingBlipFields value={character.typingBlip} onChange={blip => updateCharacter({ typingBlip: blip })} project={project} />
                        )}
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{t('editor.typingBlipHint', 'Plays on every line this character speaks. Lines with a voice clip stay silent unless the line sets its own typing sound.')}</p>
                    </FormField>
                </div>
            </div>
        );
    }
};

export default CharacterEditorClassic;