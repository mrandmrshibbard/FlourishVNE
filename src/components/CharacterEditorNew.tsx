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
import { VNCharacter, VNCharacterExpression, VNCharacterLayer, VNCharacterPose, VNLayerAsset, VNCharacterTextbox } from '../features/character/types';
import { assetArtForPose, assetHasPoseArt, characterBaseArtForPose } from '../features/character/poseArt';
import { layerBoxStyle, layerOrderForPose, poseHiddenLayerIds, resolveLayerBox } from '../features/character/layout';
import MatchPoseArtModal from './character-poses/MatchPoseArtModal';
import PoseStudio from './character-poses/PoseStudio';
import AnimationStudio from './character-anim/AnimationStudio';
import { fileToBase64 } from '../utils/file';
import { ingestUpload, resolveFieldUrl } from '../utils/assetStore';
import { PlusIcon, TrashIcon, UploadIcon, PencilIcon } from './icons';
import { FormField, TextInput, Select, ColorInput } from './ui/Form';
import VideoTrimFields from './ui/VideoTrimFields';
import TrimmedVideo from './ui/TrimmedVideo';
import TextboxStyleFields from './ui/TextboxStyleFields';
import { popularFonts as _sharedFonts } from './ui/FontEditor';
import ConfirmationModal from './ui/ConfirmationModal';
import SpriteImportModal from './character-import/SpriteImportModal';
import { partLayerName } from '../features/character/import/nameGrouping';
import VariableTokenButton from './variables/VariableTokenButton';
import { characterNameInitial } from '../utils/variableInterpolation';
import { sanitizeFontFamily, analyzeFontComplexity, rendererFreezesOnComplexFonts } from '../utils/styleUtils';
import TypingBlipFields from './ui/TypingBlipFields';
import TextboxThemeSummary from './character/TextboxThemeSummary';
import { stepLayer } from '../utils/layerReorder';

type EditorArea = 'appearance' | 'voice';

const popularFonts = ['Default (Use Project Settings)', ..._sharedFonts];

/* ───── Merged layer card (assets + per-expression assignment in one place) ───── */

const AppearanceLayerCard: React.FC<{
    characterId: VNID;
    layer: VNCharacterLayer;
    activeAssetId: VNID | null;
    onPick: (assetId: VNID | null) => void;
    /** When set, thumbnails show THIS pose's art and uploads target the pose (null = Default). */
    activePoseId?: VNID | null;
    /** Multi-select: ticked state, plus click handling that honours ctrl/shift. */
    selected?: boolean;
    onToggleSelect?: (e: React.MouseEvent) => void;
    /** Stacking order controls. Disabled at the ends. */
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
}> = ({ characterId, layer, activeAssetId, onPick, activePoseId, selected, onToggleSelect, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) => {
    const { t } = useTranslation('characters');
    const { project, dispatch } = useProject();
    const toast = useToast();
    const [isRenaming, setIsRenaming] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Per-asset pose-art upload: remembers which asset the hidden input is uploading for.
    const poseArtInputRef = useRef<HTMLInputElement>(null);
    const poseArtTargetRef = useRef<VNID | null>(null);
    const handlePoseArtUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const assetId = poseArtTargetRef.current;
        if (!file || !assetId || !activePoseId) return;
        const isVideo = file.type.startsWith('video/');
        // Fresh id per upload: replacing art must produce a NEW file/URL. Reusing the old id keeps
        // the old URL, and the browser's image cache then shows the previous bytes (stale art).
        const url = await ingestUpload(project.id, 'characters', `${characterId}-pose-${activePoseId}-${assetId}-${Math.random().toString(36).substring(2, 9)}` as any, file);
        dispatch({ type: 'SET_ASSET_POSE_ART', payload: { characterId, layerId: layer.id, assetId, poseId: activePoseId, art: isVideo ? { videoUrl: url, isVideo: true, loop: true } : { imageUrl: url } } });
        if (poseArtInputRef.current) poseArtInputRef.current.value = '';
        poseArtTargetRef.current = null;
    };

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
        // WYSIWYG pose scoping: with a pose ACTIVE, the new piece's art belongs to that pose only —
        // otherwise it would silently appear in EVERY pose (Brad's "other pose's sprite showing
        // through" bug). With no pose active it's normal default art shared by all poses.
        const art = isVideo ? { videoUrl: url, isVideo: true, loop: true } : { imageUrl: url };
        dispatch({
            type: 'ADD_LAYER_ASSET',
            payload: {
                characterId, layerId: layer.id, id, name: file.name.split('.')[0],
                ...(activePoseId ? { poseArt: { [activePoseId]: art } } : art),
            },
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

    /**
     * "Give this sprite its own layer."
     *
     * Sprites inside one layer are ALTERNATIVES — the character shows one of them. But a PSD group
     * often holds PIECES that stack (the whites, iris and pupil of an eye). This moves one sprite out
     * into a layer of its own, so it always shows instead of being one of the choices.
     *
     * Rebuilds the whole layers record in ONE dispatch, because layer key insertion order IS the
     * paint order — the new layer must land directly on top of the one it came from.
     */
    const handleSplitAsset = (asset: VNLayerAsset) => {
        const character = project.characters[characterId];
        if (!character) return;
        const newLayerId = `layer-${Math.random().toString(36).substring(2, 9)}` as VNID;
        const newLayerName = partLayerName(layer.name, asset.name);

        const layers: Record<VNID, VNCharacterLayer> = {};
        for (const [id, l] of Object.entries(character.layers) as [VNID, VNCharacterLayer][]) {
            if (id === layer.id) {
                // The source layer keeps everything EXCEPT the sprite we're moving out.
                const rest = { ...l.assets };
                delete rest[asset.id];
                layers[id] = { ...l, assets: rest };
                // Insert the new layer immediately above it, preserving the stacking.
                layers[newLayerId] = { id: newLayerId, name: newLayerName, assets: { [asset.id]: asset } };
            } else {
                layers[id] = l;
            }
        }

        // A split-out piece ALWAYS shows — select it in every expression. And any expression that was
        // showing it from the old layer must stop pointing at a sprite that no longer lives there.
        const expressions: Record<VNID, VNCharacterExpression> = {};
        for (const [id, e] of Object.entries(character.expressions) as [VNID, VNCharacterExpression][]) {
            const cfg = { ...e.layerConfiguration };
            if (cfg[layer.id] === asset.id) cfg[layer.id] = null;
            cfg[newLayerId] = asset.id;
            expressions[id] = { ...e, layerConfiguration: cfg };
        }

        dispatch({ type: 'UPDATE_CHARACTER', payload: { characterId, updates: { layers, expressions } } });
        toast.success(t('editor.splitAssetDone', '"{{sprite}}" now has its own layer — "{{layer}}".', { sprite: asset.name, layer: newLayerName }));
    };

    const assets = Object.values(layer.assets) as VNLayerAsset[];
    const activeName = activeAssetId ? layer.assets[activeAssetId]?.name : null;
    const tile = (selected: boolean) => `relative rounded-md overflow-hidden aspect-square cursor-pointer transition-all ${selected ? 'ring-2 ring-[var(--accent-cyan)]' : 'ring-1 ring-[var(--border-subtle)] hover:ring-[var(--accent-cyan)]/50'}`;

    return (
        <div className="rounded-lg border" style={{ borderColor: selected ? 'var(--accent-cyan)' : 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                {onToggleSelect && (
                    <input
                        type="checkbox"
                        checked={!!selected}
                        onChange={() => { /* click handler below carries the ctrl/shift state */ }}
                        onClick={onToggleSelect}
                        className="cursor-pointer flex-shrink-0"
                        title={t('editor.selectLayer', 'Select this piece (Shift-click to select a run)')}
                    />
                )}
                {isRenaming ? (
                    <input {...renameProps} className="bg-slate-900 text-white px-2 py-0.5 rounded text-sm outline-none ring-1 ring-sky-500 flex-1" />
                ) : (
                    <span className="text-sm font-semibold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{layer.name}</span>
                )}
                <span className="text-[10px] px-1.5 py-0.5 rounded-full truncate max-w-[8rem]" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }} title={activeName || t('editor.none')}>
                    {activeName || t('editor.none')}
                </span>
                {onMoveUp && (
                    <button onClick={onMoveUp} disabled={!canMoveUp} className="p-1 text-slate-500 hover:text-sky-400 disabled:opacity-25" title={t('editor.layerUp', 'Move up — draws further BACK, behind the pieces below it')}>▲</button>
                )}
                {onMoveDown && (
                    <button onClick={onMoveDown} disabled={!canMoveDown} className="p-1 text-slate-500 hover:text-sky-400 disabled:opacity-25" title={t('editor.layerDown', 'Move down — draws further FORWARD, over the pieces above it')}>▼</button>
                )}
                <button onClick={() => setIsRenaming(true)} className="p-1 text-slate-500 hover:text-sky-400" title={t('editor.renameLayer')}><PencilIcon className="w-3 h-3" /></button>
                <button onClick={handleDeleteLayer} className="p-1 text-slate-500 hover:text-red-400" title={t('editor.deleteLayer')}><TrashIcon className="w-3 h-3" /></button>
            </div>
            <div className="p-2 grid grid-cols-4 gap-1.5">
                {/* "None" tile — leave this layer empty for the selected expression */}
                <div className={tile(!activeAssetId)} onClick={() => onPick(null)} title={t('editor.none')}>
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-center px-1" style={{ color: 'var(--text-muted)', background: 'var(--bg-tertiary)' }}>{t('editor.none')}</div>
                </div>
                {assets.map(asset => {
                    const art = assetArtForPose(asset, activePoseId || undefined);
                    const missingPoseArt = !!activePoseId && !assetHasPoseArt(asset, activePoseId);
                    // A piece with pose-only art has nothing to fall back on elsewhere — say so.
                    const hasDefaultArt = !!(asset.imageUrl || asset.videoUrl);
                    return (
                    <div key={asset.id} className={`group ${tile(activeAssetId === asset.id)}`} onClick={() => onPick(asset.id)} title={asset.name}>
                        {art.videoUrl ? (
                            <video src={resolveFieldUrl(project.id, art.videoUrl) || undefined} muted loop playsInline className="w-full h-full object-contain bg-slate-800" />
                        ) : art.imageUrl ? (
                            <img src={resolveFieldUrl(project.id, art.imageUrl) || undefined} alt={asset.name} className="w-full h-full object-contain bg-slate-800" />
                        ) : <div className="w-full h-full bg-slate-800" />}
                        {/* Pose-art controls (only while editing a pose): upload art for THIS piece in
                            this pose, and a warning badge when the piece has none yet. */}
                        {activePoseId && (
                            missingPoseArt ? (
                                <button
                                    onClick={e => { e.stopPropagation(); poseArtTargetRef.current = asset.id; poseArtInputRef.current?.click(); }}
                                    title={hasDefaultArt
                                        ? t('poses.usesDefaultArt', 'No art for this pose yet — the normal art will show. Click to upload this piece for this pose.')
                                        : t('poses.noArtHere', 'This piece has no art for this pose, so it won’t show here. Click to upload art for this pose.')}
                                    className="absolute bottom-4 right-0.5 px-1 py-0.5 rounded text-[9px] font-bold text-black opacity-90 hover:opacity-100"
                                    style={{ background: '#f59e0b' }}
                                >
                                    !
                                </button>
                            ) : (
                                <button
                                    onClick={e => { e.stopPropagation(); if (confirm(t('poses.removePoseArtConfirm', 'Remove this piece’s art for this pose? The normal art will show instead.'))) dispatch({ type: 'SET_ASSET_POSE_ART', payload: { characterId, layerId: layer.id, assetId: asset.id, poseId: activePoseId, art: null } }); }}
                                    title={t('poses.removePoseArt', 'This piece has its own art for this pose — click to remove it')}
                                    className="absolute bottom-4 right-0.5 px-1 py-0.5 rounded text-[9px] font-bold text-white opacity-0 group-hover:opacity-90"
                                    style={{ background: 'var(--accent-lavender)' }}
                                >
                                    ✓
                                </button>
                            )
                        )}
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
                        {/* Give this sprite its own layer (so it STACKS instead of being one of the
                            choices). Top-LEFT so it can never sit under the delete button, and always
                            visible — it's the fix for a PSD group of eye pieces. */}
                        {assets.length > 1 && (
                            <button
                                onClick={e => { e.stopPropagation(); handleSplitAsset(asset); }}
                                title={t('editor.splitAssetHint', 'Give this sprite its own layer, so it always shows instead of being one of the choices (e.g. the whites, iris and pupil of an eye)')}
                                className="absolute top-0.5 left-0.5 px-1 py-0.5 rounded text-[9px] font-bold text-white opacity-80 group-hover:opacity-100 transition-opacity"
                                style={{ background: 'color-mix(in srgb, var(--accent-mint) 80%, black)' }}
                            >
                                ⤴
                            </button>
                        )}
                        <button onClick={e => { e.stopPropagation(); handleDeleteAsset(asset.id, asset.name); }} className="absolute top-0.5 right-0.5 p-0.5 bg-red-600/80 hover:bg-red-500 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon className="w-2.5 h-2.5" /></button>
                    </div>
                    );
                })}
                {/* Upload tile */}
                <button onClick={() => fileInputRef.current?.click()} className="rounded-md aspect-square flex flex-col items-center justify-center gap-0.5 border-2 border-dashed transition-colors hover:border-[var(--accent-cyan)]/60" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' }}>
                    <UploadIcon /><span className="text-[9px]">{t('editor.upload')}</span>
                </button>
                <input type="file" ref={fileInputRef} onChange={handleUpload} accept="image/*,video/*" className="hidden" />
                <input type="file" ref={poseArtInputRef} onChange={handlePoseArtUpload} accept="image/*,video/*" className="hidden" />
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
    // Bulk sprite import (many PNGs / .psd / .ora)
    const [importOpen, setImportOpen] = useState(false);
    const [importFiles, setImportFiles] = useState<File[] | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const spriteInputRef = useRef<HTMLInputElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const [renamingExprId, setRenamingExprId] = useState<VNID | null>(null);
    const [confirmDeleteExpr, setConfirmDeleteExpr] = useState<VNCharacterExpression | null>(null);
    const baseImageInputRef = useRef<HTMLInputElement>(null);
    const fontFileInputRef = useRef<HTMLInputElement>(null);
    // ── Poses: which VIEW of the character the whole Appearance area is editing.
    // null = the Default pose (the character's normal base/asset art).
    const [activePoseId, setActivePoseId] = useState<VNID | null>(null);
    const [renamingPoseId, setRenamingPoseId] = useState<VNID | null>(null);
    const [confirmDeletePose, setConfirmDeletePose] = useState<VNCharacterPose | null>(null);
    const [matchPoseOpen, setMatchPoseOpen] = useState(false);
    const [poseStudioOpen, setPoseStudioOpen] = useState(false);
    const [animationsOpen, setAnimationsOpen] = useState(false);
    const poseBaseInputRef = useRef<HTMLInputElement>(null);

    const expressionsArray = useMemo(
        () => character ? Object.values(character.expressions) as VNCharacterExpression[] : [],
        [character?.expressions]
    );
    const layersArray = useMemo(
        () => character ? Object.values(character.layers) as VNCharacterLayer[] : [],
        [character?.layers]
    );
    const posesArray = useMemo(
        () => character ? Object.values(character.poses || {}) as VNCharacterPose[] : [],
        [character?.poses]
    );
    // Deleted pose / switched character → back to Default so the editor never shows a ghost pose.
    useEffect(() => {
        if (activePoseId && !character?.poses?.[activePoseId]) setActivePoseId(null);
    }, [activePoseId, character?.poses]);

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

    const updateCharacter = (updates: Partial<Pick<VNCharacter, 'name' | 'color' | 'fontFamily' | 'fontUrl' | 'fontSize' | 'fontWeight' | 'fontItalic' | 'baseImageUrl' | 'baseVideoUrl' | 'isBaseVideo' | 'baseVideoLoop' | 'baseVideoTrimStart' | 'baseVideoTrimEnd' | 'textbox' | 'textboxThemeId' | 'defaultVoiceId' | 'phoneRingtoneAudioId' | 'textEffect' | 'dialogueTextColorMode' | 'dialogueTextColor' | 'typingBlip'>>) => {
        dispatch({ type: 'UPDATE_CHARACTER', payload: { characterId: activeCharacterId, updates } });
    };
    const updateTextbox = (patch: Partial<VNCharacterTextbox>) => {
        updateCharacter({ textbox: { ...character.textbox, ...patch } });
    };

    const handleBaseImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const isVideo = file.type.startsWith('video/');
        // Fresh id per upload — a reused id keeps the same URL and the image cache shows stale art.
        const url = await ingestUpload(project.id, 'characters', `${character.id}-base-${Math.random().toString(36).substring(2, 9)}` as any, file);
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
    // Multi-select for bulk actions on the layer list; the ref anchors Shift-click runs.
    const [selectedLayerIds, setSelectedLayerIds] = useState<Set<VNID>>(new Set());
    const lastLayerClickRef = useRef<number | null>(null);
    // Switching character must drop the selection — otherwise the batch bar would offer to delete
    // ids belonging to somebody else (they'd be filtered out, so it would silently do nothing).
    useEffect(() => {
        setSelectedLayerIds(new Set());
        lastLayerClickRef.current = null;
    }, [activeCharacterId]);

    const handleAddLayer = () => {
        dispatch({ type: 'ADD_CHARACTER_LAYER', payload: { characterId: activeCharacterId, name: t('editor.newLayerName', { n: layersArray.length + 1 }) } });
    };

    /* ── Layer multi-select + stacking order ── */

    /** Ctrl/⌘-click adds one; Shift-click takes the run since the last click; a plain click picks one. */
    const handleToggleLayerSelect = (layerId: VNID, index: number, e: React.MouseEvent) => {
        setSelectedLayerIds(prev => {
            const next = new Set(prev);
            if (e.shiftKey && lastLayerClickRef.current !== null) {
                const [from, to] = [lastLayerClickRef.current, index].sort((a, b) => a - b);
                for (let i = from; i <= to; i++) next.add(layersArray[i].id);
            } else if (e.ctrlKey || e.metaKey) {
                next.has(layerId) ? next.delete(layerId) : next.add(layerId);
            } else {
                next.has(layerId) ? next.delete(layerId) : next.add(layerId);
            }
            return next;
        });
        lastLayerClickRef.current = index;
    };

    const handleDeleteSelectedLayers = () => {
        const ids = layersArray.filter(l => selectedLayerIds.has(l.id)).map(l => l.id);
        if (ids.length === 0) return;
        const names = ids.map(id => character.layers[id]?.name).filter(Boolean).join(', ');
        if (!confirm(t('editor.deleteLayersConfirm', 'Delete these pieces and their art from every expression and pose?\n\n{{names}}').replace('{{names}}', names))) return;
        // ONE dispatch — see DELETE_CHARACTER_LAYERS in the reducer.
        dispatch({ type: 'DELETE_CHARACTER_LAYERS', payload: { characterId: activeCharacterId, layerIds: ids } });
        setSelectedLayerIds(new Set());
        lastLayerClickRef.current = null;
    };

    /**
     * Reorder the BASE stacking order. Reuses APPLY_CHARACTER_LAYOUT's `baseLayerOrder`, which is
     * the same path the Pose Studio uses — the order lives in the `layers` Record's key order and
     * that action already knows how to rebuild it safely.
     */
    const handleMoveLayer = (index: number, dir: -1 | 1) => {
        const order = layersArray.map(l => l.id);
        const next = stepLayer(order, index, dir);
        if (!next) return;
        dispatch({ type: 'APPLY_CHARACTER_LAYOUT', payload: { characterId: activeCharacterId, baseLayerOrder: next } });
    };

    /* ── Pose handlers ── */
    const handleAddPose = () => {
        dispatch({ type: 'ADD_POSE', payload: { characterId: activeCharacterId, name: t('poses.newPoseName', 'Pose {{n}}', { n: posesArray.length + 1 }) } });
    };
    const handleCommitPoseRename = (poseId: VNID, name: string) => {
        dispatch({ type: 'UPDATE_POSE', payload: { characterId: activeCharacterId, poseId, updates: { name } } });
        setRenamingPoseId(null);
    };
    const handleConfirmDeletePose = () => {
        if (!confirmDeletePose) return;
        dispatch({ type: 'DELETE_POSE', payload: { characterId: activeCharacterId, poseId: confirmDeletePose.id } });
        if (activePoseId === confirmDeletePose.id) setActivePoseId(null);
        setConfirmDeletePose(null);
    };
    const handleDuplicatePose = (poseId: VNID) => {
        // Id generated here (not in the reducer) so we can select the copy right away.
        const newPoseId = `pose-${Math.random().toString(36).substring(2, 9)}` as VNID;
        dispatch({ type: 'DUPLICATE_POSE', payload: { characterId: activeCharacterId, poseId, newPoseId } });
        setActivePoseId(newPoseId);
    };
    const handlePoseBaseUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !activePoseId) return;
        const isVideo = file.type.startsWith('video/');
        // Fresh id per upload — a reused id keeps the same URL and the image cache shows stale art
        // (Brad hit this: delete a pose base, re-upload, the previously-uploaded art showed instead).
        const url = await ingestUpload(project.id, 'characters', `${character.id}-pose-${activePoseId}-base-${Math.random().toString(36).substring(2, 9)}` as any, file);
        dispatch({ type: 'UPDATE_POSE', payload: { characterId: activeCharacterId, poseId: activePoseId, updates: isVideo
            ? { baseVideoUrl: url, baseImageUrl: null, isBaseVideo: true, baseVideoLoop: true }
            : { baseImageUrl: url, baseVideoUrl: null, isBaseVideo: false } } });
        if (poseBaseInputRef.current) poseBaseInputRef.current.value = '';
    };
    const activePose = activePoseId ? character.poses?.[activePoseId] : null;

    /* ── Shared preview ── */

    // Pose-aware preview — composites through the SAME resolver the engine uses, in the pose
    // being edited, so what the author sees here is exactly what plays.
    const previewBaseArt = characterBaseArtForPose(character, activePoseId || undefined);
    const renderPreview = () => (
        <div className="flex-1 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)' }}>
            <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-conic-gradient(#fff 0% 25%, transparent 0% 50%)', backgroundSize: '16px 16px' }} />
            {previewBaseArt.videoUrl ? (
                <TrimmedVideo src={resolveFieldUrl(project.id, previewBaseArt.videoUrl) || undefined} autoPlay muted loop={previewBaseArt.loop} trimStart={previewBaseArt.trimStart} trimEnd={previewBaseArt.trimEnd} playsInline className="absolute inset-0 w-full h-full object-contain" />
            ) : previewBaseArt.imageUrl ? (
                <img src={resolveFieldUrl(project.id, previewBaseArt.imageUrl) || undefined} alt="Base" className="absolute inset-0 w-full h-full object-contain" />
            ) : null}
            {selectedExpression && (() => {
                // Pose Studio order + hidden + boxes (shared resolvers — mirrors every runtime surface).
                const hidden = poseHiddenLayerIds(character, activePoseId || undefined);
                return layerOrderForPose(character, activePoseId || undefined).map((layer: VNCharacterLayer, stackIdx: number) => {
                    if (hidden.has(layer.id)) return null;
                    const assetId = selectedExpression.layerConfiguration[layer.id];
                    if (!assetId) return null;
                    const asset = layer.assets[assetId];
                    if (!asset) return null;
                    const art = assetArtForPose(asset, activePoseId || undefined);
                    const boxStyle = { zIndex: stackIdx + 1, ...layerBoxStyle(resolveLayerBox(layer, asset, activePoseId || undefined)) };
                    if (art.videoUrl) return <video key={layer.id} src={resolveFieldUrl(project.id, art.videoUrl) || undefined} autoPlay muted loop={art.loop} playsInline className="absolute inset-0 w-full h-full object-contain" style={boxStyle} />;
                    if (art.imageUrl) return <img key={layer.id} src={resolveFieldUrl(project.id, art.imageUrl) || undefined} alt={asset.name} className="absolute inset-0 w-full h-full object-contain" style={boxStyle} />;
                    return null;
                });
            })()}
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
        <div
            className="flex-1 flex flex-col min-w-0 min-h-0 relative"
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
            onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
            onDrop={e => {
                if (!e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
                setDragOver(false);
                const files = Array.from(e.dataTransfer.files);
                if (files.length) { setImportFiles(files); setImportOpen(true); }
            }}
        >
            {dragOver && (
                <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none rounded-lg"
                    style={{ background: 'color-mix(in srgb, var(--accent-lavender) 18%, transparent)', border: '2px dashed var(--accent-lavender)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {t('spriteImport.dropHere', 'Drop your layers here — PNGs, or a .psd / .ora file')}
                    </span>
                </div>
            )}
            {importOpen && (
                <SpriteImportModal
                    isOpen={importOpen}
                    onClose={() => { setImportOpen(false); setImportFiles(null); }}
                    character={character}
                    initialFiles={importFiles}
                />
            )}
            {/* Header: avatar, name, color, area tabs, view toggle */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                <div className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden bg-slate-700/50 flex items-center justify-center">
                    {character.baseVideoUrl ? (
                        <video src={resolveFieldUrl(project.id, character.baseVideoUrl) || undefined} muted loop playsInline className="w-full h-full object-cover" />
                    ) : character.baseImageUrl ? (
                        <img src={resolveFieldUrl(project.id, character.baseImageUrl) || undefined} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-lg font-bold" style={{ color: character.color }}>{characterNameInitial(character.name)}</span>
                    )}
                </div>
                <input
                    ref={nameInputRef}
                    type="text"
                    value={character.name}
                    onChange={e => updateCharacter({ name: e.target.value })}
                    className="bg-transparent text-base font-bold outline-none border-b border-transparent hover:border-[var(--border-subtle)] focus:border-[var(--accent-cyan)] transition-colors min-w-0"
                    style={{ color: 'var(--text-primary)', maxWidth: '180px' }}
                    title={t('editor.nameTokenHint', 'Names can show a variable — pick { } to make the name change during the story')}
                />
                {/* Names can hold {Variable} tokens — "???" until the reveal, nicknames, etc. */}
                <VariableTokenButton targetRef={nameInputRef} value={character.name} onChange={name => updateCharacter({ name })} />
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <ColorInput value={character.color} onChange={v => updateCharacter({ color: v })} />
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t('editor.color')}</span>
                </div>

                {/* Bulk sprite import — many PNGs at once, or a layered .psd / .ora */}
                <button
                    onClick={() => { setImportFiles(null); setImportOpen(true); spriteInputRef.current?.click(); }}
                    title={t('spriteImport.buttonHint', 'Import all your layers at once — drop many PNGs, or a Photoshop (.psd) / Krita (.ora) file')}
                    className="text-[11px] px-2 py-1 rounded-md border flex items-center gap-1 flex-shrink-0 hover:bg-[var(--bg-tertiary)] transition-colors"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                    <UploadIcon className="w-3 h-3" /> {t('spriteImport.button', 'Import sprites')}
                </button>
                <input
                    ref={spriteInputRef}
                    type="file"
                    multiple
                    accept="image/*,.psd,.ora"
                    className="hidden"
                    onChange={e => {
                        const files = Array.from(e.target.files || []);
                        if (files.length) { setImportFiles(files); setImportOpen(true); }
                        e.target.value = '';
                    }}
                />

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
                            {/* Pose chips — which VIEW of the character the whole area edits. Outfits and
                                expressions are shared across poses; a pose only changes the pictures. */}
                            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider mr-1" style={{ color: 'var(--text-muted)' }} title={t('poses.hint', 'Different stances or angles of this character — like facing sideways or crossing their arms. Outfits automatically carry over between poses.')}>{t('poses.title', 'Poses')}</span>
                                <button
                                    onClick={() => setActivePoseId(null)}
                                    className={`px-2.5 py-1 rounded-full text-xs transition-colors ${!activePoseId ? 'bg-[var(--accent-lavender)]/20 ring-1 ring-[var(--accent-lavender)]/50 text-[var(--accent-lavender)]' : 'hover:bg-[var(--bg-tertiary)]'}`}
                                    style={{ color: !activePoseId ? undefined : 'var(--text-secondary)' }}
                                >
                                    {t('poses.default', 'Default')}
                                </button>
                                {posesArray.map(pose => {
                                    const selected = activePoseId === pose.id;
                                    return (
                                        <div
                                            key={pose.id}
                                            onClick={() => setActivePoseId(pose.id)}
                                            className={`group flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full cursor-pointer text-xs transition-colors ${selected ? 'bg-[var(--accent-lavender)]/20 ring-1 ring-[var(--accent-lavender)]/50' : 'hover:bg-[var(--bg-tertiary)]'}`}
                                            style={{ color: selected ? 'var(--accent-lavender)' : 'var(--text-secondary)' }}
                                        >
                                            {renamingPoseId === pose.id ? (
                                                <input
                                                    autoFocus
                                                    defaultValue={pose.name}
                                                    onClick={e => e.stopPropagation()}
                                                    onBlur={e => handleCommitPoseRename(pose.id, e.target.value.trim() || pose.name)}
                                                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingPoseId(null); }}
                                                    className="bg-slate-900 text-white px-1.5 py-0.5 rounded text-xs outline-none ring-1 ring-[var(--accent-lavender)] w-24"
                                                />
                                            ) : (
                                                <span className="truncate max-w-[10rem]">{pose.name}</span>
                                            )}
                                            <button onClick={e => { e.stopPropagation(); setRenamingPoseId(pose.id); }} className="p-0.5 text-slate-500 hover:text-[var(--accent-lavender)] opacity-0 group-hover:opacity-100 transition-opacity" title={t('editor.rename')}><PencilIcon className="w-2.5 h-2.5" /></button>
                                            <button onClick={e => { e.stopPropagation(); handleDuplicatePose(pose.id); }} className="p-0.5 text-slate-500 hover:text-[var(--accent-cyan)] opacity-0 group-hover:opacity-100 transition-opacity" title={t('poses.duplicate', 'Duplicate pose (art + layout)')}>⧉</button>
                                            <button onClick={e => { e.stopPropagation(); setConfirmDeletePose(pose); }} className="p-0.5 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" title={t('editor.delete')}><TrashIcon className="w-2.5 h-2.5" /></button>
                                        </div>
                                    );
                                })}
                                <button onClick={handleAddPose} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-[var(--accent-lavender)]/10 hover:bg-[var(--accent-lavender)]/20 text-[var(--accent-lavender)]" title={t('poses.addHint', 'Add another stance or angle of this character (e.g. side view, arms crossed)')}>
                                    <PlusIcon className="w-3 h-3" /> {t('poses.add', 'Add pose')}
                                </button>
                                {activePoseId && (
                                    <button onClick={() => setMatchPoseOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs border hover:bg-[var(--bg-tertiary)]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }} title={t('poses.matchByNameHint', 'Drop many files at once — they are matched to your pieces by file name')}>
                                        <UploadIcon className="w-3 h-3" /> {t('poses.matchByName', 'Match art by file name')}
                                    </button>
                                )}
                                <button onClick={() => setPoseStudioOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs border hover:bg-[var(--bg-tertiary)]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }} title={t('poses.arrangeHint', 'Move, resize, tilt, reorder, or hide each piece of this character — per pose')}>
                                    🧍 {t('poses.arrange', 'Pose Studio')}
                                </button>
                                <button onClick={() => setAnimationsOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs border hover:bg-[var(--bg-tertiary)]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }} title={t('anim.openHint', 'Make this character blink, talk, or move pieces on a loop — using their existing pieces as frames')}>
                                    🎞️ {t('anim.open', 'Animations')}
                                </button>
                            </div>
                        </div>

                        {/* Scrollable: base sprite + layers */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-3">
                            {/* Base sprite — edits the ACTIVE pose's base when a pose is selected. */}
                            <div className="flex items-center gap-2 rounded-lg border p-2" style={{ borderColor: activePoseId ? 'color-mix(in srgb, var(--accent-lavender) 45%, transparent)' : 'var(--border-subtle)', background: 'var(--bg-primary)' }}>
                                {previewBaseArt.videoUrl ? (
                                    <video src={resolveFieldUrl(project.id, previewBaseArt.videoUrl) || undefined} muted loop playsInline className="w-12 h-12 object-contain rounded-md bg-slate-700 flex-shrink-0" />
                                ) : previewBaseArt.imageUrl ? (
                                    <img src={resolveFieldUrl(project.id, previewBaseArt.imageUrl) || undefined} alt="Base" className="w-12 h-12 object-contain rounded-md bg-slate-700 flex-shrink-0" />
                                ) : (
                                    <div className="w-12 h-12 rounded-md bg-slate-700/50 flex items-center justify-center flex-shrink-0" style={{ color: 'var(--text-muted)' }}><span className="text-lg">👤</span></div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                        {activePose ? t('poses.baseFor', 'Base sprite for "{{pose}}"', { pose: activePose.name }) : t('editor.baseSprite')}
                                    </p>
                                    <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                                        {activePose
                                            ? (activePose.baseImageUrl || activePose.baseVideoUrl
                                                ? t('poses.baseOwnArt', 'This pose has its own base art.')
                                                : t('poses.baseUsesDefault', 'No base art for this pose yet — the normal base shows.'))
                                            : t('editor.baseSpriteHint')}
                                    </p>
                                </div>
                                <div className="flex flex-col gap-1 flex-shrink-0">
                                    {activePoseId ? (
                                        <>
                                            <button onClick={() => poseBaseInputRef.current?.click()} className="text-xs px-2 py-1 rounded-md flex items-center justify-center gap-1" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                                                <UploadIcon /> {(activePose?.baseImageUrl || activePose?.baseVideoUrl) ? t('editor.change') : t('editor.upload')}
                                            </button>
                                            {(activePose?.baseImageUrl || activePose?.baseVideoUrl) && (
                                                <button onClick={() => dispatch({ type: 'UPDATE_POSE', payload: { characterId: activeCharacterId, poseId: activePoseId, updates: { baseImageUrl: null, baseVideoUrl: null, isBaseVideo: false } } })} className="text-xs px-2 py-0.5 rounded-md text-red-400 hover:bg-red-500/10">{t('editor.remove')}</button>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={() => baseImageInputRef.current?.click()} className="text-xs px-2 py-1 rounded-md flex items-center justify-center gap-1" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                                                <UploadIcon /> {(character.baseImageUrl || character.baseVideoUrl) ? t('editor.change') : t('editor.upload')}
                                            </button>
                                            {(character.baseImageUrl || character.baseVideoUrl) && (
                                                <button onClick={() => updateCharacter({ baseImageUrl: null, baseVideoUrl: null, isBaseVideo: false })} className="text-xs px-2 py-0.5 rounded-md text-red-400 hover:bg-red-500/10">{t('editor.remove')}</button>
                                            )}
                                        </>
                                    )}
                                </div>
                                <input type="file" ref={baseImageInputRef} onChange={handleBaseImageUpload} accept="image/*,video/*" className="hidden" />
                                <input type="file" ref={poseBaseInputRef} onChange={handlePoseBaseUpload} accept="image/*,video/*" className="hidden" />
                            </div>
                            {!activePoseId && character.baseVideoUrl && (
                                <VideoTrimFields className="mt-2" start={(character as any).baseVideoTrimStart} end={(character as any).baseVideoTrimEnd}
                                    onChange={patch => updateCharacter({ baseVideoTrimStart: patch.trimStart, baseVideoTrimEnd: patch.trimEnd } as any)} />
                            )}
                            {activePoseId && activePose?.baseVideoUrl && (
                                <VideoTrimFields className="mt-2" start={activePose.baseVideoTrimStart} end={activePose.baseVideoTrimEnd}
                                    onChange={patch => dispatch({ type: 'UPDATE_POSE', payload: { characterId: activeCharacterId, poseId: activePoseId, updates: { baseVideoTrimStart: patch.trimStart, baseVideoTrimEnd: patch.trimEnd } } })} />
                            )}

                            {/* This character's dialogue box, mirrored here from "Dialogue & Voice".
                                It already existed — but only on the other tab, so people building a
                                character never found it and set the theme line-by-line instead.
                                Read-only on purpose: one place still owns the editing. */}
                            <TextboxThemeSummary character={character} project={project} onEdit={() => setArea('voice')} />

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

                            {/* Batch bar — appears once more than one piece is ticked, mirroring
                                the Asset Manager. One dispatch removes them all (see the reducer). */}
                            {selectedLayerIds.size > 1 && (
                                <div className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--accent-cyan)', background: 'color-mix(in srgb, var(--accent-cyan) 8%, transparent)' }}>
                                    <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>
                                        {t('editor.layersSelected', '{{count}} pieces selected').replace('{{count}}', String(selectedLayerIds.size))}
                                    </span>
                                    <button onClick={() => setSelectedLayerIds(new Set())} className="text-xs px-2 py-1 rounded-md" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                                        {t('editor.clearSelection', 'Clear')}
                                    </button>
                                    <button onClick={handleDeleteSelectedLayers} className="text-xs px-2 py-1 rounded-md text-red-400 hover:bg-red-500/10">
                                        {t('editor.deleteSelected', 'Delete these')}
                                    </button>
                                </div>
                            )}

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
                                    {layersArray.map((layer, index) => (
                                        <AppearanceLayerCard
                                            key={layer.id}
                                            characterId={character.id}
                                            layer={layer}
                                            activeAssetId={selectedExpression.layerConfiguration[layer.id] || null}
                                            onPick={(assetId) => handleLayerAssetChange(layer.id, assetId)}
                                            activePoseId={activePoseId}
                                            selected={selectedLayerIds.has(layer.id)}
                                            onToggleSelect={(e) => handleToggleLayerSelect(layer.id, index, e)}
                                            onMoveUp={() => handleMoveLayer(index, -1)}
                                            onMoveDown={() => handleMoveLayer(index, 1)}
                                            canMoveUp={index > 0}
                                            canMoveDown={index < layersArray.length - 1}
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
                            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>{t('hc.dialogueTextbox', 'Dialogue Textbox')}</h3>
                            <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>{t('hc.pickAReusableThemeAnd', 'Pick a reusable theme and/or set a custom look. Anything left blank uses your project\'s default dialogue UI.')}</p>
                            <FormField label="Textbox theme">
                                <Select value={character.textboxThemeId || ''} onChange={e => updateCharacter({ textboxThemeId: e.target.value || undefined })}>
                                    <option value="">{t('hc.noneUseProjectDefault', 'None (use project default)')}</option>
                                    {Object.values(project.textboxThemes || {}).map((th: any) => (<option key={th.id} value={th.id}>{th.name}</option>))}
                                </Select>
                            </FormField>
                            <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>{t('hc.createAndEditThemesIn', 'Create and edit themes in the In-Game UI Editor → Textbox Themes.')}</p>
                            <FormField label="Speak in color">
                                <Select value={character.dialogueTextColorMode || 'off'} onChange={e => updateCharacter({ dialogueTextColorMode: (e.target.value === 'off' ? undefined : e.target.value) as any })}>
                                    <option value="off">{t('hc.offUseTheTextboxText', 'Off — use the textbox text color')}</option>
                                    <option value="character">My name color ({character.color})</option>
                                    <option value="custom">{t('hc.aCustomColor', 'A custom color…')}</option>
                                </Select>
                            </FormField>
                            {character.dialogueTextColorMode === 'custom' && (
                                <FormField label="Dialogue text color">
                                    <ColorInput value={character.dialogueTextColor || character.color} onChange={(v: string) => updateCharacter({ dialogueTextColor: v })} />
                                </FormField>
                            )}
                            {(character.dialogueTextColorMode === 'character' || character.dialogueTextColorMode === 'custom') && (
                                <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>{t('hc.everyLineThisCharacterSpeaks', 'Every line this character speaks renders in this color — an instant “who’s talking” cue.')}</p>
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
                </div>
            )}

            <ConfirmationModal isOpen={!!confirmDeleteExpr} onClose={() => setConfirmDeleteExpr(null)} onConfirm={handleConfirmDeleteExpr} title={t('editor.deleteExpression')}>
                {t('editor.deleteExpressionConfirm', { name: confirmDeleteExpr?.name })}
            </ConfirmationModal>
            <ConfirmationModal isOpen={!!confirmDeletePose} onClose={() => setConfirmDeletePose(null)} onConfirm={handleConfirmDeletePose} title={t('poses.delete', 'Delete pose')}>
                {t('poses.deleteConfirm', 'Delete the pose "{{name}}"? Art you added for this pose will be removed. Story commands that used it will show the Default pose.', { name: confirmDeletePose?.name })}
            </ConfirmationModal>
            {matchPoseOpen && activePoseId && character.poses?.[activePoseId] && (
                <MatchPoseArtModal
                    character={character}
                    pose={character.poses[activePoseId]}
                    onClose={() => setMatchPoseOpen(false)}
                />
            )}
            {poseStudioOpen && (
                <PoseStudio
                    character={character}
                    project={project}
                    initialPoseId={activePoseId}
                    onClose={() => setPoseStudioOpen(false)}
                />
            )}
            {animationsOpen && (
                <AnimationStudio
                    character={character}
                    projectId={project.id}
                    onClose={() => setAnimationsOpen(false)}
                />
            )}
        </div>
    );
};

export default CharacterEditorNew;
