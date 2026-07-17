import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { VNCustomTransition, VNTransitionAnimation } from '../../features/scene/types';
import { transitionHalfDuration, transitionHalfHasContent } from '../../utils/sceneTransition';
import { useProject } from '../../contexts/ProjectContext';
import { FormField, Select, TextInput } from './Form';
import AssetSelector from './AssetSelector';
import { resolveFieldUrl } from '../../utils/assetStore';
import { TrashIcon, PlusIcon } from '../icons';

const genId = () => `ctrans-${Math.random().toString(36).slice(2, 9)}`;

/** Resolve an asset id to a playable URL, looking across images/backgrounds/videos (an animated
 *  file can live in any of them depending on which Asset Manager tab uploaded it). */
export function resolveTransitionMediaUrl(project: VNProject, assetId: VNID | null | undefined): { url: string | null; isVideo: boolean } {
    if (!assetId) return { url: null, isVideo: false };
    const bg = project.backgrounds?.[assetId] as any;
    const img = project.images?.[assetId] as any;
    const vid = project.videos?.[assetId] as any;
    const rawVideo = vid?.videoUrl || bg?.videoUrl || img?.videoUrl || null;
    if (rawVideo) return { url: resolveFieldUrl(project.id, rawVideo), isVideo: true };
    const rawImage = bg?.imageUrl || img?.imageUrl || null;
    return { url: resolveFieldUrl(project.id, rawImage), isVideo: false };
}

/* ------------------------------------------------------------------ */
/*  Canvas preview — plays close → (swap) → open over two sample scenes */
/* ------------------------------------------------------------------ */

/** Renders one half's media, mirroring the engine's CustomTransitionOverlay behaviour:
 *  an animated file plays once from mount and holds its last frame; a frame sequence steps
 *  at the author's fps and holds the last frame. */
const HalfMedia: React.FC<{ project: VNProject; half: VNTransitionAnimation; fit: VNCustomTransition['fit'] }> = ({ project, half, fit }) => {
    const frameUrls = (half.frameIds && half.frameIds.length > 0)
        ? half.frameIds.map(id => resolveTransitionMediaUrl(project, id).url).filter((u): u is string => !!u)
        : null;
    const [frameIdx, setFrameIdx] = useState(0);
    useEffect(() => {
        if (!frameUrls || frameUrls.length <= 1) return;
        const fps = Math.max(1, Math.min(60, half.fps ?? 12));
        const iv = window.setInterval(() => setFrameIdx(i => Math.min(i + 1, frameUrls.length - 1)), 1000 / fps);
        return () => window.clearInterval(iv);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const objectFit: React.CSSProperties['objectFit'] = (fit ?? 'stretch') === 'stretch' ? 'fill' : (fit as 'cover' | 'contain');
    const style: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit };
    if (frameUrls && frameUrls.length > 0) {
        return <img src={frameUrls[Math.min(frameIdx, frameUrls.length - 1)]} alt="" style={style} draggable={false} />;
    }
    const media = resolveTransitionMediaUrl(project, half.assetId);
    if (!media.url) return null;
    return media.isVideo
        ? <video src={media.url} autoPlay muted playsInline style={style} />
        : <img src={media.url} alt="" style={style} draggable={false} />;
};

/** Full-canvas preview for the In-Game UI editor: two fake scenes with the transition between
 *  them. Bump `nonce` to (re)play; 0 shows the idle hint. */
export const SceneTransitionCanvasPreview: React.FC<{
    project: VNProject;
    def: VNCustomTransition;
    nonce: number;
}> = ({ project, def, nonce }) => {
    const { t } = useTranslation('ui');
    const [stage, setStage] = useState<'idle' | 'closing' | 'opening'>('idle');
    const [sceneB, setSceneB] = useState(false);
    const timeoutsRef = useRef<number[]>([]);
    useEffect(() => {
        timeoutsRef.current.forEach(id => window.clearTimeout(id));
        timeoutsRef.current = [];
        if (nonce <= 0) { setStage('idle'); setSceneB(false); return; }
        const hasClose = transitionHalfHasContent(def.close);
        const hasOpen = transitionHalfHasContent(def.open);
        const closeS = hasClose ? transitionHalfDuration(def.close) : 0;
        const openS = hasOpen ? transitionHalfDuration(def.open) : 0;
        const holdS = Math.max(0, def.holdDuration ?? 0);
        setSceneB(false);
        const swap = () => {
            setSceneB(true);
            if (hasOpen) {
                setStage('opening');
                timeoutsRef.current.push(window.setTimeout(() => setStage('idle'), openS * 1000));
            } else {
                setStage('idle');
            }
        };
        if (hasClose) {
            setStage('closing');
            timeoutsRef.current.push(window.setTimeout(swap, (closeS + holdS) * 1000));
        } else {
            swap();
        }
        return () => { timeoutsRef.current.forEach(id => window.clearTimeout(id)); timeoutsRef.current = []; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nonce]);

    return (
        <div className="absolute inset-0 overflow-hidden">
            {/* Fake scenes so the reveal is visible */}
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: sceneB ? 'linear-gradient(135deg,#134e4a,#1e3a8a)' : 'linear-gradient(135deg,#7c2d12,#831843)' }}>
                <span className="text-white/60 text-3xl font-bold select-none">
                    {sceneB ? t('sceneTransitions.previewSceneB', 'Next scene') : t('sceneTransitions.previewSceneA', 'Current scene')}
                </span>
            </div>
            {stage !== 'idle' && (
                <HalfMedia key={`${stage}-${nonce}`} project={project} half={stage === 'closing' ? def.close : def.open} fit={def.fit} />
            )}
        </div>
    );
};

/* ------------------------------------------------------------------ */
/*  Half editor (Closing / Opening)                                    */
/* ------------------------------------------------------------------ */

const HalfEditor: React.FC<{
    project: VNProject;
    title: string;
    hint: string;
    half: VNTransitionAnimation;
    onChange: (patch: Partial<VNTransitionAnimation>) => void;
}> = ({ project, title, hint, half, onChange }) => {
    const { t } = useTranslation('ui');
    const isSequence = half.frameIds !== undefined;
    const assetName = (id: VNID) => (project.images?.[id] as any)?.name || (project.backgrounds?.[id] as any)?.name || (project.videos?.[id] as any)?.name || t('sceneTransitions.missingFrame', 'Missing image');
    const frames = half.frameIds ?? [];
    const moveFrame = (idx: number, dir: -1 | 1) => {
        const next = [...frames];
        const j = idx + dir;
        if (j < 0 || j >= next.length) return;
        [next[idx], next[j]] = [next[j], next[idx]];
        onChange({ frameIds: next });
    };
    const seconds = transitionHalfDuration(half);
    return (
        <div className="p-2 border border-[var(--border-subtle)] rounded space-y-2">
            <h4 className="text-xs font-bold text-[var(--accent-cyan)]">{title}</h4>
            <p className="text-[10px] text-[var(--text-muted)]">{hint}</p>
            <div className="flex gap-3 text-xs text-[var(--text-primary)]">
                <label className="flex items-center gap-1">
                    <input type="radio" checked={!isSequence} onChange={() => onChange({ frameIds: undefined })} />
                    {t('sceneTransitions.oneFile', 'One animated file')}
                </label>
                <label className="flex items-center gap-1">
                    <input type="radio" checked={isSequence} onChange={() => onChange({ assetId: null, frameIds: [] })} />
                    {t('sceneTransitions.frameSequence', 'Frame sequence')}
                </label>
            </div>
            {!isSequence && <>
                <AssetSelector label={t('sceneTransitions.animationFile', 'Animation')} assetType="images" allowVideo value={half.assetId ?? null} onChange={id => onChange({ assetId: id })} />
                <p className="text-[10px] text-[var(--text-muted)]">{t('sceneTransitions.oneFileHint', 'An animated PNG / animated WebP / GIF set to play once, or a video. It stays on its final image when it finishes.')}</p>
                <FormField label={t('sceneTransitions.halfDuration', 'How long it plays (seconds)')}>
                    <TextInput type="number" min={0.1} max={30} step={0.1} value={half.duration ?? 1}
                        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) onChange({ duration: v }); }} />
                </FormField>
                <p className="text-[10px] text-[var(--text-muted)]">{t('sceneTransitions.halfDurationHint', 'Set this to match the animation’s own length.')}</p>
            </>}
            {isSequence && <>
                {frames.length === 0 && <p className="text-xs text-[var(--text-muted)] italic">{t('sceneTransitions.noFrames', 'No frames yet — add your images in play order.')}</p>}
                <div className="space-y-1">
                    {frames.map((fid, i) => (
                        <div key={`${fid}-${i}`} className="flex items-center gap-1 text-xs bg-[var(--bg-secondary)] rounded px-2 py-1">
                            <span className="text-[var(--text-muted)] w-5 text-right">{i + 1}.</span>
                            <span className="flex-1 truncate text-[var(--text-primary)]">{assetName(fid)}</span>
                            <button onClick={() => moveFrame(i, -1)} disabled={i === 0} className="px-1 text-[var(--text-muted)] hover:text-white disabled:opacity-30" title={t('sceneTransitions.moveUp', 'Earlier')}>↑</button>
                            <button onClick={() => moveFrame(i, 1)} disabled={i === frames.length - 1} className="px-1 text-[var(--text-muted)] hover:text-white disabled:opacity-30" title={t('sceneTransitions.moveDown', 'Later')}>↓</button>
                            <button onClick={() => onChange({ frameIds: frames.filter((_, j) => j !== i) })} className="p-0.5 text-red-400 hover:text-red-300" title={t('sceneTransitions.removeFrame', 'Remove frame')}>
                                <TrashIcon className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
                <AssetSelector label={t('sceneTransitions.addFrame', 'Add a frame')} assetType="images" value={null} onChange={id => { if (id) onChange({ frameIds: [...frames, id] }); }} />
                <FormField label={t('sceneTransitions.fps', 'Speed (frames per second)')}>
                    <TextInput type="number" min={1} max={60} step={1} value={half.fps ?? 12}
                        onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 1 && v <= 60) onChange({ fps: v }); }} />
                </FormField>
                {frames.length > 0 && (
                    <p className="text-[10px] text-[var(--text-muted)]">{t('sceneTransitions.sequenceLength', 'Plays for about {{seconds}}s, then holds the last frame.', { seconds: seconds.toFixed(1) })}</p>
                )}
            </>}
            <AssetSelector label={t('sceneTransitions.sound', 'Sound effect (optional)')} assetType="audio" value={half.sfxId ?? null} onChange={id => onChange({ sfxId: id })} />
        </div>
    );
};

/* ------------------------------------------------------------------ */
/*  Manager (right panel)                                              */
/* ------------------------------------------------------------------ */

/**
 * Manager for author-made scene transitions (project.customTransitions): a closing animation that
 * covers the screen, then an opening animation that reveals the next scene — like a theatre
 * curtain. Same shape as TextboxThemeManager: list + selected editor; the selected id is lifted
 * to the In-Game UI editor so its canvas can play the preview.
 */
const SceneTransitionManager: React.FC<{
    project: VNProject;
    selectedId: VNID | null;
    onSelect: (id: VNID | null) => void;
    onPreview: () => void;
}> = ({ project, selectedId, onSelect, onPreview }) => {
    const { t } = useTranslation('ui');
    const { dispatch } = useProject();
    const transitions = Object.values(project.customTransitions || {}) as VNCustomTransition[];
    const selected = selectedId ? project.customTransitions?.[selectedId] : undefined;

    const add = () => {
        const id = genId();
        dispatch({ type: 'ADD_CUSTOM_TRANSITION', payload: { id, name: t('sceneTransitions.defaultName', 'Transition {{n}}', { n: transitions.length + 1 }) } });
        onSelect(id);
    };
    const update = (updates: Partial<VNCustomTransition>) => {
        if (selected) dispatch({ type: 'UPDATE_CUSTOM_TRANSITION', payload: { transitionId: selected.id, updates } });
    };

    return (
        <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">{t('sceneTransitions.title', 'Scene Transitions')}</h3>
                <button onClick={add} className="text-xs px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white flex items-center gap-1">
                    <PlusIcon className="w-3 h-3" /> {t('sceneTransitions.new', 'New')}
                </button>
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">
                {t('sceneTransitions.intro', 'Your own scene-change animations — like a theatre curtain. The closing animation covers the screen, the scene switches while it’s covered, then the opening animation reveals the new scene. Pick one in a scene’s Scene Settings, or on a single Jump / choice.')}
            </p>

            {transitions.length === 0 && (
                <p className="text-xs text-[var(--text-muted)] italic py-2">{t('sceneTransitions.empty', 'None yet. Click “New” to make one.')}</p>
            )}

            <div className="space-y-1">
                {transitions.map(tr => (
                    <div
                        key={tr.id}
                        onClick={() => onSelect(tr.id)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${selectedId === tr.id ? 'bg-sky-500/20 border border-sky-500/40' : 'hover:bg-[var(--bg-secondary)] border border-transparent'}`}
                    >
                        <span className="flex-1 text-xs text-[var(--text-primary)] truncate">{tr.name}</span>
                        <button
                            onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_CUSTOM_TRANSITION', payload: { transitionId: tr.id } }); if (selectedId === tr.id) onSelect(null); }}
                            className="text-red-400 hover:text-red-300 p-0.5"
                            title={t('sceneTransitions.delete', 'Delete transition')}
                        >
                            <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}
            </div>

            {selected && (
                <div className="pt-2 border-t border-[var(--border-subtle)] space-y-3">
                    <FormField label={t('sceneTransitions.name', 'Name')}>
                        <TextInput value={selected.name} onChange={e => update({ name: e.target.value })} />
                    </FormField>
                    <button
                        onClick={onPreview}
                        disabled={!transitionHalfHasContent(selected.close) && !transitionHalfHasContent(selected.open)}
                        className="w-full text-xs px-2 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium"
                    >
                        ▶ {t('sceneTransitions.preview', 'Preview on the canvas')}
                    </button>
                    <HalfEditor
                        project={project}
                        title={t('sceneTransitions.closing', 'Closing animation')}
                        hint={t('sceneTransitions.closingHint', 'Plays over the current scene. Its final image should cover the whole screen — that’s when the scene switches.')}
                        half={selected.close || {}}
                        onChange={patch => update({ close: { ...(selected.close || {}), ...patch } })}
                    />
                    <HalfEditor
                        project={project}
                        title={t('sceneTransitions.opening', 'Opening animation')}
                        hint={t('sceneTransitions.openingHint', 'Plays over the new scene, revealing it. Its first image should cover the whole screen; its last should show the scene fully.')}
                        half={selected.open || {}}
                        onChange={patch => update({ open: { ...(selected.open || {}), ...patch } })}
                    />
                    <FormField label={t('sceneTransitions.hold', 'Pause while covered (seconds)')}>
                        <TextInput type="number" min={0} max={10} step={0.1} value={selected.holdDuration ?? 0}
                            onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) update({ holdDuration: v }); }} />
                    </FormField>
                    <FormField label={t('sceneTransitions.fit', 'How it fills the screen')}>
                        <Select value={selected.fit ?? 'stretch'} onChange={e => update({ fit: e.target.value as VNCustomTransition['fit'] })}>
                            <option value="stretch">{t('sceneTransitions.fitStretch', 'Stretch to fill')}</option>
                            <option value="cover">{t('sceneTransitions.fitCover', 'Fill (crop edges if needed)')}</option>
                            <option value="contain">{t('sceneTransitions.fitContain', 'Fit inside (may leave gaps)')}</option>
                        </Select>
                    </FormField>
                </div>
            )}
        </div>
    );
};

export default SceneTransitionManager;
