/**
 * CharacterEditorNew — redesigned character editor (default view).
 *
 * Two clear areas instead of three confusing tabs:
 *  • Appearance — always-on live preview + base sprite + expression chips + a merged layer list
 *    where each layer shows its asset thumbnails inline. Clicking a thumbnail sets that layer for
 *    the SELECTED expression — no more building assets in one tab and assigning them in another.
 *  • Dialogue & Voice — color, dialogue font, textbox theme, default voice, phone ringtone.
 *
 * IMPORTANT: this is purely a friendlier front-end over the SAME data the Classic editor uses
 * (layers / assets / expressions.layerConfiguration). Nothing here changes the schema, so the
 * Classic ⇄ New switch is lossless. See CHARACTER_SYSTEM_REVAMP_PLAN.md.
 */

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useInlineRename } from '../hooks/useInlineRename';
import { useProject } from '../contexts/ProjectContext';
import { useToast } from '../contexts/ToastContext';
import { VNID } from '../types';
import { VNCharacter, VNCharacterExpression, VNCharacterLayer, VNLayerAsset, VNCharacterTextbox } from '../features/character/types';
import { fileToBase64 } from '../utils/file';
import { ingestUpload, resolveFieldUrl } from '../utils/assetStore';
import { PlusIcon, TrashIcon, UploadIcon, PencilIcon } from './icons';
import { FormField, TextInput, Select, ColorInput } from './ui/Form';
import VideoTrimFields from './ui/VideoTrimFields';
import TrimmedVideo from './ui/TrimmedVideo';
import TextboxStyleFields from './ui/TextboxStyleFields';
import { popularFonts as _sharedFonts } from './ui/FontEditor';
import ConfirmationModal from './ui/ConfirmationModal';

type EditorArea = 'appearance' | 'voice';

const popularFonts = ['Default (Use Project Settings)', ..._sharedFonts];

/* ───── Merged layer card (assets + per-expression assignment in one place) ───── */

const AppearanceLayerCard: React.FC<{
    characterId: VNID;
    layer: VNCharacterLayer;
    activeAssetId: VNID | null;
    onPick: (assetId: VNID | null) => void;
}> = ({ characterId, layer, activeAssetId, onPick }) => {
    const { t } = useTranslation('characters');
    const { project, dispatch } = useProject();
    const [isRenaming, setIsRenaming] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { inputProps: renameProps } = useInlineRename(layer.name, (newName) => {
        if (newName.trim()) dispatch({ type: 'UPDATE_CHARACTER_LAYER', payload: { characterId, layerId: layer.id, name: newName.trim() } });
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
            payload: { characterId, layerId: layer.id, id, name: file.name.split('.')[0], ...(isVideo ? { videoUrl: url, isVideo: true, loop: true } : { imageUrl: url }) },
        });
        // Instant feedback: show the freshly-uploaded asset on the current expression.
        onPick(id as any);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDeleteLayer = () => {
        if (confirm(t('editor.deleteLayerConfirm', { name: layer.name }))) dispatch({ type: 'DELETE_CHARACTER_LAYER', payload: { characterId, layerId: layer.id } });
    };
    const handleDeleteAsset = (assetId: VNID, name: string) => {
        if (confirm(t('editor.deleteAssetConfirm', { name }))) dispatch({ type: 'DELETE_LAYER_ASSET', payload: { characterId, layerId: layer.id, assetId } });
    };

    const assets = Object.values(layer.assets) as VNLayerAsset[];
    const activeName = activeAssetId ? layer.assets[activeAssetId]?.name : null;
    const tile = (selected: boolean) => `relative rounded-md overflow-hidden aspect-square cursor-pointer transition-all ${selected ? 'ring-2 ring-[var(--accent-cyan)]' : 'ring-1 ring-[var(--border-subtle)] hover:ring-[var(--accent-cyan)]/50'}`;

    return (
        <div className="rounded-lg border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                {isRenaming ? (
                    <input {...renameProps} className="bg-slate-900 text-white px-2 py-0.5 rounded text-sm outline-none ring-1 ring-sky-500 flex-1" />
                ) : (
                    <span className="text-sm font-semibold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{layer.name}</span>
                )}
                <span className="text-[10px] px-1.5 py-0.5 rounded-full truncate max-w-[8rem]" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }} title={activeName || t('editor.none')}>
                    {activeName || t('editor.none')}
                </span>
                <button onClick={() => setIsRenaming(true)} className="p-1 text-slate-500 hover:text-sky-400" title={t('editor.renameLayer')}><PencilIcon className="w-3 h-3" /></button>
                <button onClick={handleDeleteLayer} className="p-1 text-slate-500 hover:text-red-400" title={t('editor.deleteLayer')}><TrashIcon className="w-3 h-3" /></button>
            </div>
            <div className="p-2 grid grid-cols-4 gap-1.5">
                {/* "None" tile — leave this layer empty for the selected expression */}
                <div className={tile(!activeAssetId)} onClick={() => onPick(null)} title={t('editor.none')}>
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-center px-1" style={{ color: 'var(--text-muted)', background: 'var(--bg-tertiary)' }}>{t('editor.none')}</div>
                </div>
                {assets.map(asset => (
                    <div key={asset.id} className={`group ${tile(activeAssetId === asset.id)}`} onClick={() => onPick(asset.id)} title={asset.name}>
                        {asset.videoUrl ? (
                            <video src={resolveFieldUrl(project.id, asset.videoUrl) || undefined} muted loop playsInline className="w-full h-full object-contain bg-slate-800" />
                        ) : asset.imageUrl ? (
                            <img src={resolveFieldUrl(project.id, asset.imageUrl) || undefined} alt={asset.name} className="w-full h-full object-contain bg-slate-800" />
                        ) : <div className="w-full h-full bg-slate-800" />}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 py-0.5">
                            {/* Editable sprite name — rename freely after upload (id is unchanged, so
                                expressions/customizer/variable refs keep working). */}
                            <input
                                value={asset.name}
                                onChange={e => dispatch({ type: 'UPDATE_LAYER_ASSET', payload: { characterId, layerId: layer.id, assetId: asset.id, updates: { name: e.target.value } } })}
                                onClick={e => e.stopPropagation()}
                                onPointerDown={e => e.stopPropagation()}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                title={t('editor.renameSprite', 'Rename this sprite')}
                                className="text-[9px] text-white truncate block w-full bg-transparent outline-none rounded px-0.5 focus:bg-black/70 focus:ring-1 focus:ring-sky-500"
                            />
                        </div>
                        <button onClick={e => { e.stopPropagation(); handleDeleteAsset(asset.id, asset.name); }} className="absolute top-0.5 right-0.5 p-0.5 bg-red-600/80 hover:bg-red-500 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon className="w-2.5 h-2.5" /></button>
                    </div>
                ))}
                {/* Upload tile */}
                <button onClick={() => fileInputRef.current?.click()} className="rounded-md aspect-square flex flex-col items-center justify-center gap-0.5 border-2 border-dashed transition-colors hover:border-[var(--accent-cyan)]/60" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' }}>
                    <UploadIcon /><span className="text-[9px]">{t('editor.upload')}</span>
                </button>
                <input type="file" ref={fileInputRef} onChange={handleUpload} accept="image/*,video/*" className="hidden" />
            </div>
        </div>
    );
};

/* ───── Main Component ───── */

const CharacterEditorNew: React.FC<{
    activeCharacterId: VNID;
    selectedExpressionId: VNID | null;
    setSelectedExpressionId: (id: VNID | null) => void;
    headerSlot?: React.ReactNode;
}> = ({ activeCharacterId, selectedExpressionId, setSelectedExpressionId, headerSlot }) => {
    const { t } = useTranslation('characters');
    const { project, dispatch } = useProject();
    const toast = useToast();
    const character = project.characters[activeCharacterId];
    const [area, setArea] = useState<EditorArea>('appearance');
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

    /* ── Handlers (same dispatches as the Classic editor) ── */

    const updateCharacter = (updates: Partial<Pick<VNCharacter, 'name' | 'color' | 'fontFamily' | 'fontUrl' | 'fontSize' | 'fontWeight' | 'fontItalic' | 'baseImageUrl' | 'baseVideoUrl' | 'isBaseVideo' | 'baseVideoLoop' | 'baseVideoTrimStart' | 'baseVideoTrimEnd' | 'textbox' | 'textboxThemeId' | 'defaultVoiceId' | 'phoneRingtoneAudioId' | 'textEffect' | 'dialogueTextColorMode' | 'dialogueTextColor'>>) => {
        dispatch({ type: 'UPDATE_CHARACTER', payload: { characterId: activeCharacterId, updates } });
    };
    const updateTextbox = (patch: Partial<VNCharacterTextbox>) => {
        updateCharacter({ textbox: { ...character.textbox, ...patch } });
    };

    const handleBaseImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const isVideo = file.type.startsWith('video/');
        const url = await ingestUpload(project.id, 'characters', `${character.id}-base` as any, file);
        if (isVideo) updateCharacter({ baseVideoUrl: url, baseImageUrl: null, isBaseVideo: true, baseVideoLoop: true });
        else updateCharacter({ baseImageUrl: url, baseVideoUrl: null, isBaseVideo: false });
    };

    const handleFontUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.ttf') && !file.name.toLowerCase().endsWith('.otf')) {
            toast.warning(t('editor.fontUploadWarning'));
            return;
        }
        const dataUrl = await fileToBase64(file);
        const fontName = file.name.replace(/\.(ttf|otf)$/i, '');
        updateCharacter({ fontUrl: dataUrl, fontFamily: fontName });
    };

    const handleAddExpression = () => {
        dispatch({ type: 'ADD_EXPRESSION', payload: { characterId: activeCharacterId, name: t('editor.newExpressionName', { n: expressionsArray.length + 1 }) } });
    };
    const handleCommitExprRename = (exprId: VNID, name: string) => {
        dispatch({ type: 'UPDATE_EXPRESSION', payload: { characterId: activeCharacterId, expressionId: exprId, updates: { name } } });
        setRenamingExprId(null);
    };
    const handleDeleteExprRequest = (expr: VNCharacterExpression) => {
        if (expressionsArray.length <= 1) { toast.warning(t('editor.cannotDeleteLast')); return; }
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
        dispatch({ type: 'ADD_CHARACTER_LAYER', payload: { characterId: activeCharacterId, name: t('editor.newLayerName', { n: layersArray.length + 1 }) } });
    };

    /* ── Shared preview ── */

    const renderPreview = () => (
        <div className="flex-1 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)' }}>
            <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-conic-gradient(#fff 0% 25%, transparent 0% 50%)', backgroundSize: '16px 16px' }} />
            {character.baseVideoUrl ? (
                <TrimmedVideo src={resolveFieldUrl(project.id, character.baseVideoUrl) || undefined} autoPlay muted loop={character.baseVideoLoop} trimStart={(character as any).baseVideoTrimStart} trimEnd={(character as any).baseVideoTrimEnd} playsInline className="absolute inset-0 w-full h-full object-contain" />
            ) : character.baseImageUrl ? (
                <img src={resolveFieldUrl(project.id, character.baseImageUrl) || undefined} alt="Base" className="absolute inset-0 w-full h-full object-contain" />
            ) : null}
            {selectedExpression && layersArray.map((layer: VNCharacterLayer) => {
                const assetId = selectedExpression.layerConfiguration[layer.id];
                if (!assetId) return null;
                const asset = layer.assets[assetId];
                if (!asset) return null;
                if (asset.videoUrl) return <video key={layer.id} src={resolveFieldUrl(project.id, asset.videoUrl) || undefined} autoPlay muted loop={asset.loop} playsInline className="absolute inset-0 w-full h-full object-contain" />;
                if (asset.imageUrl) return <img key={layer.id} src={resolveFieldUrl(project.id, asset.imageUrl) || undefined} alt={asset.name} className="absolute inset-0 w-full h-full object-contain" />;
                return null;
            })}
            {!character.baseImageUrl && !character.baseVideoUrl && layersArray.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center" style={{ color: 'var(--text-muted)' }}>
                        <span className="text-3xl block mb-2">👤</span>
                        <p className="text-xs">{t('editor.uploadBaseHint')}</p>
                    </div>
                </div>
            )}
        </div>
    );

    /* ── Render ── */

    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Header: avatar, name, color, area tabs, view toggle */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                <div className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden bg-slate-700/50 flex items-center justify-center">
                    {character.baseVideoUrl ? (
                        <video src={resolveFieldUrl(project.id, character.baseVideoUrl) || undefined} muted loop playsInline className="w-full h-full object-cover" />
                    ) : character.baseImageUrl ? (
                        <img src={resolveFieldUrl(project.id, character.baseImageUrl) || undefined} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-lg font-bold" style={{ color: character.color }}>{character.name.charAt(0)}</span>
                    )}
                </div>
                <input
                    type="text"
                    value={character.name}
                    onChange={e => updateCharacter({ name: e.target.value })}
                    className="bg-transparent text-base font-bold outline-none border-b border-transparent hover:border-[var(--border-subtle)] focus:border-[var(--accent-cyan)] transition-colors min-w-0"
                    style={{ color: 'var(--text-primary)', maxWidth: '180px' }}
                />
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <ColorInput value={character.color} onChange={v => updateCharacter({ color: v })} />
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t('editor.color')}</span>
                </div>

                {/* Area switch */}
                <div className="flex items-center gap-1 ml-auto rounded-lg p-0.5 flex-shrink-0" style={{ background: 'var(--bg-primary)' }}>
                    {([['appearance', t('editor.areaAppearance', 'Appearance')], ['voice', t('editor.areaDialogueVoice', 'Dialogue & Voice')]] as const).map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setArea(key as EditorArea)}
                            className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${area === key ? 'bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]' : 'hover:text-white'}`}
                            style={{ color: area === key ? undefined : 'var(--text-secondary)' }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {headerSlot}
            </div>

            {/* Body */}
            {area === 'appearance' ? (
                <div className="flex-1 flex min-h-0 overflow-hidden">
                    {/* Left: live preview */}
                    <div className="w-2/5 flex flex-col border-r" style={{ borderColor: 'var(--border-subtle)' }}>
                        <div className="px-3 py-1.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('editor.preview')}</span>
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{selectedExpression?.name || t('editor.noExpression')}</span>
                        </div>
                        {renderPreview()}
                    </div>

                    {/* Right: expressions + base sprite + merged layers */}
                    <div className="flex-1 flex flex-col min-w-0">
                        {/* Expression chips */}
                        <div className="px-3 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-bold uppercase tracking-wider mr-1" style={{ color: 'var(--text-muted)' }}>{t('editor.expressions')}</span>
                                {expressionsArray.map(expr => {
                                    const selected = selectedExpressionId === expr.id;
                                    return (
                                        <div
                                            key={expr.id}
                                            onClick={() => setSelectedExpressionId(expr.id)}
                                            className={`group flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full cursor-pointer text-xs transition-colors ${selected ? 'bg-[var(--accent-cyan)]/15 ring-1 ring-[var(--accent-cyan)]/40' : 'hover:bg-[var(--bg-tertiary)]'}`}
                                            style={{ color: selected ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}
                                        >
                                            {renamingExprId === expr.id ? (
                                                <input
                                                    autoFocus
                                                    defaultValue={expr.name}
                                                    onClick={e => e.stopPropagation()}
                                                    onBlur={e => handleCommitExprRename(expr.id, e.target.value.trim() || expr.name)}
                                                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingExprId(null); }}
                                                    className="bg-slate-900 text-white px-1.5 py-0.5 rounded text-xs outline-none ring-1 ring-[var(--accent-cyan)] w-24"
                                                />
                                            ) : (
                                                <span className="truncate max-w-[10rem]">{expr.name}</span>
                                            )}
                                            <button onClick={e => { e.stopPropagation(); setRenamingExprId(expr.id); }} className="p-0.5 text-slate-500 hover:text-[var(--accent-cyan)] opacity-0 group-hover:opacity-100 transition-opacity" title={t('editor.rename')}><PencilIcon className="w-2.5 h-2.5" /></button>
                                            <button onClick={e => { e.stopPropagation(); handleDeleteExprRequest(expr); }} className="p-0.5 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" title={t('editor.delete')}><TrashIcon className="w-2.5 h-2.5" /></button>
                                        </div>
                                    );
                                })}
                                <button onClick={handleAddExpression} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-[var(--accent-cyan)]/10 hover:bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]" title={t('editor.add')}>
                                    <PlusIcon className="w-3 h-3" /> {t('editor.add')}
                                </button>
                            </div>
                        </div>

                        {/* Scrollable: base sprite + layers */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-3">
                            {/* Base sprite */}
                            <div className="flex items-center gap-2 rounded-lg border p-2" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                                {character.baseVideoUrl ? (
                                    <video src={resolveFieldUrl(project.id, character.baseVideoUrl) || undefined} muted loop playsInline className="w-12 h-12 object-contain rounded-md bg-slate-700 flex-shrink-0" />
                                ) : character.baseImageUrl ? (
                                    <img src={resolveFieldUrl(project.id, character.baseImageUrl) || undefined} alt="Base" className="w-12 h-12 object-contain rounded-md bg-slate-700 flex-shrink-0" />
                                ) : (
                                    <div className="w-12 h-12 rounded-md bg-slate-700/50 flex items-center justify-center flex-shrink-0" style={{ color: 'var(--text-muted)' }}><span className="text-lg">👤</span></div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('editor.baseSprite')}</p>
                                    <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{t('editor.baseSpriteHint')}</p>
                                </div>
                                <div className="flex flex-col gap-1 flex-shrink-0">
                                    <button onClick={() => baseImageInputRef.current?.click()} className="text-xs px-2 py-1 rounded-md flex items-center justify-center gap-1" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                                        <UploadIcon /> {(character.baseImageUrl || character.baseVideoUrl) ? t('editor.change') : t('editor.upload')}
                                    </button>
                                    {(character.baseImageUrl || character.baseVideoUrl) && (
                                        <button onClick={() => updateCharacter({ baseImageUrl: null, baseVideoUrl: null, isBaseVideo: false })} className="text-xs px-2 py-0.5 rounded-md text-red-400 hover:bg-red-500/10">{t('editor.remove')}</button>
                                    )}
                                </div>
                                <input type="file" ref={baseImageInputRef} onChange={handleBaseImageUpload} accept="image/*,video/*" className="hidden" />
                            </div>
                            {character.baseVideoUrl && (
                                <VideoTrimFields className="mt-2" start={(character as any).baseVideoTrimStart} end={(character as any).baseVideoTrimEnd}
                                    onChange={patch => updateCharacter({ baseVideoTrimStart: patch.trimStart, baseVideoTrimEnd: patch.trimEnd } as any)} />
                            )}

                            {/* Layers */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{t('editor.spriteLayers')}</h3>
                                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                        {selectedExpression ? t('editor.pickAssetHint', 'Click a thumbnail to set this layer for the selected expression.') : t('editor.spriteLayersHint')}
                                    </p>
                                </div>
                                <button onClick={handleAddLayer} className="text-xs px-2.5 py-1 rounded-md flex items-center gap-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 flex-shrink-0"><PlusIcon className="w-3 h-3" /> {t('editor.addLayer')}</button>
                            </div>

                            {layersArray.length === 0 ? (
                                <div className="text-center py-8 rounded-lg border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                                    <span className="text-3xl block mb-2">🖼️</span>
                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('editor.noLayersComposite')}</p>
                                </div>
                            ) : !selectedExpression ? (
                                <div className="text-center py-4 rounded-lg border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('editor.noExpression')}</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {layersArray.map(layer => (
                                        <AppearanceLayerCard
                                            key={layer.id}
                                            characterId={character.id}
                                            layer={layer}
                                            activeAssetId={selectedExpression.layerConfiguration[layer.id] || null}
                                            onPick={(assetId) => handleLayerAssetChange(layer.id, assetId)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* Dialogue & Voice */
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="space-y-5 max-w-md">
                        {/* Font */}
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>{t('editor.dialogueFont')}</h3>
                            <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>{t('editor.dialogueFontHint')}</p>
                            <FormField label={t('editor.fontFamily')}>
                                <Select value={character.fontFamily || ''} onChange={e => updateCharacter({ fontFamily: e.target.value || undefined })}>
                                    {popularFonts.map(f => (
                                        <option key={f} value={f === 'Default (Use Project Settings)' ? '' : f}>{f === 'Default (Use Project Settings)' ? t('editor.fontDefault') : f.split(',')[0]}</option>
                                    ))}
                                </Select>
                            </FormField>
                            <div className="flex items-center gap-2 mb-3">
                                <button onClick={() => fontFileInputRef.current?.click()} className="flex-1 text-xs py-1.5 rounded-md flex items-center justify-center gap-1" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                                    <UploadIcon /> {character.fontUrl ? t('editor.changeFontFile') : t('editor.uploadFontFile')}
                                </button>
                                {character.fontUrl && (
                                    <button onClick={() => updateCharacter({ fontUrl: undefined, fontFamily: '' })} className="p-1.5 rounded text-red-400 hover:bg-red-500/10"><TrashIcon className="w-3.5 h-3.5" /></button>
                                )}
                                <input type="file" ref={fontFileInputRef} onChange={handleFontUpload} accept=".ttf,.otf" className="hidden" />
                            </div>
                            {character.fontUrl && <p className="text-[10px] text-[var(--accent-cyan)] mb-3">{t('editor.customFont', { name: character.fontFamily })}</p>}
                            <div className="grid grid-cols-2 gap-3">
                                <FormField label={t('editor.fontSize')}>
                                    <TextInput type="number" value={character.fontSize || ''} onChange={e => updateCharacter({ fontSize: e.target.value ? parseInt(e.target.value, 10) : undefined })} placeholder={t('editor.fontSizeDefault')} />
                                </FormField>
                                <FormField label={t('editor.weight')}>
                                    <Select value={character.fontWeight || 'normal'} onChange={e => updateCharacter({ fontWeight: e.target.value as 'normal' | 'bold' })}>
                                        <option value="normal">{t('editor.normal')}</option>
                                        <option value="bold">{t('editor.bold')}</option>
                                    </Select>
                                </FormField>
                            </div>
                            <label className="flex items-center gap-2 text-xs cursor-pointer mt-1" style={{ color: 'var(--text-secondary)' }}>
                                <input type="checkbox" checked={character.fontItalic || false} onChange={e => updateCharacter({ fontItalic: e.target.checked })} className="accent-[var(--accent-cyan)]" />
                                {t('editor.italic')}
                            </label>
                        </div>

                        <hr style={{ borderColor: 'var(--border-subtle)' }} />

                        {/* Textbox */}
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>Dialogue Textbox</h3>
                            <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>Pick a reusable theme and/or set a custom look. Anything left blank uses your project's default dialogue UI.</p>
                            <FormField label="Textbox theme">
                                <Select value={character.textboxThemeId || ''} onChange={e => updateCharacter({ textboxThemeId: e.target.value || undefined })}>
                                    <option value="">None (use project default)</option>
                                    {Object.values(project.textboxThemes || {}).map((th: any) => (<option key={th.id} value={th.id}>{th.name}</option>))}
                                </Select>
                            </FormField>
                            <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>Create and edit themes in the In-Game UI Editor → Textbox Themes.</p>
                            <FormField label="Speak in color">
                                <Select value={character.dialogueTextColorMode || 'off'} onChange={e => updateCharacter({ dialogueTextColorMode: (e.target.value === 'off' ? undefined : e.target.value) as any })}>
                                    <option value="off">Off — use the textbox text color</option>
                                    <option value="character">My name color ({character.color})</option>
                                    <option value="custom">A custom color…</option>
                                </Select>
                            </FormField>
                            {character.dialogueTextColorMode === 'custom' && (
                                <FormField label="Dialogue text color">
                                    <ColorInput value={character.dialogueTextColor || character.color} onChange={(v: string) => updateCharacter({ dialogueTextColor: v })} />
                                </FormField>
                            )}
                            {(character.dialogueTextColorMode === 'character' || character.dialogueTextColorMode === 'custom') && (
                                <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>Every line this character speaks renders in this color — an instant “who’s talking” cue.</p>
                            )}
                            <label className="flex items-center gap-2 text-xs cursor-pointer mb-2" style={{ color: 'var(--text-secondary)' }}>
                                <input type="checkbox" checked={!!character.textbox} onChange={e => updateCharacter({ textbox: e.target.checked ? (character.textbox ?? {}) : undefined })} className="accent-[var(--accent-cyan)]" />
                                Custom override for this character {character.textboxThemeId ? '(layers on top of the theme)' : ''}
                            </label>
                            {character.textbox && <TextboxStyleFields value={character.textbox} onChange={updateTextbox} />}
                        </div>

                        <hr style={{ borderColor: 'var(--border-subtle)' }} />

                        {/* Voice */}
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>{t('editor.defaultVoice')}</h3>
                            <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>{t('editor.defaultVoiceHint')}</p>
                            <FormField label={t('editor.voiceClip')}>
                                <Select value={character.defaultVoiceId || ''} onChange={e => updateCharacter({ defaultVoiceId: e.target.value || null })}>
                                    <option value="">{t('editor.voiceNone')}</option>
                                    {Object.values(project.audio || {}).map((a: any) => (<option key={a.id} value={a.id}>{a.name || a.id}</option>))}
                                </Select>
                            </FormField>
                            <FormField label={t('editor.phoneRingtone', 'Phone ringtone')}>
                                <Select value={character.phoneRingtoneAudioId || ''} onChange={e => updateCharacter({ phoneRingtoneAudioId: e.target.value || null })}>
                                    <option value="">{t('editor.voiceNone')}</option>
                                    {Object.values(project.audio || {}).map((a: any) => (<option key={a.id} value={a.id}>{a.name || a.id}</option>))}
                                </Select>
                                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{t('editor.phoneRingtoneHint', 'Default ringtone when this character calls (an Incoming Call command can override it).')}</p>
                            </FormField>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmationModal isOpen={!!confirmDeleteExpr} onClose={() => setConfirmDeleteExpr(null)} onConfirm={handleConfirmDeleteExpr} title={t('editor.deleteExpression')}>
                {t('editor.deleteExpressionConfirm', { name: confirmDeleteExpr?.name })}
            </ConfirmationModal>
        </div>
    );
};

export default CharacterEditorNew;
