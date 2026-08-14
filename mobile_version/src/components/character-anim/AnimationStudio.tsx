/**
 * Animation Studio — the full editor for character frame animations (Round 2b).
 * Left: animation list + settings. Center: live preview with play / scrub.
 * Bottom: multi-track timeline — one row per layer, draggable step-key chips,
 * click an empty spot to add a frame change, snap grid (default 1/12 s) + zoom.
 *
 * All edits dispatch UPDATE_CHARACTER_ANIMATION immediately (the reducer keeps keys
 * sorted); play/scrub/zoom/snap are purely local. The stage's own clock in LivePreview
 * is untouched — this preview ticks only while the studio is open.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../contexts/ProjectContext';
import { VNID } from '../../types';
import { VNCharacter, VNCharacterAnimation, VNAnimationTrack } from '../../features/character/types';
import { applyAnimationFrame, rotationAt, layerAdjustAt } from '../../features/character/spriteAnim';
import { layerBoxStyle, layerBoxTransform } from '../../features/character/layout';
import { buildCharacterMedia } from '../live-preview/command-handlers/characterHandler';
import { resolveFieldUrl } from '../../utils/assetStore';
import { PlusIcon, TrashIcon, XMarkIcon } from '../icons';

const inputCls = 'bg-[var(--bg-primary)] text-white p-1 rounded-md border border-[var(--border-default)] text-xs min-w-0';

/** Snap choices in ms. 1/12 s is the classic animation-frame grid. */
export const SNAP_OPTIONS: Array<{ ms: number; label: string }> = [
    { ms: Math.round(1000 / 24), label: '1/24 s' },
    { ms: Math.round(1000 / 12), label: '1/12 s' },
    { ms: 100, label: '1/10 s' },
    { ms: 250, label: '1/4 s' },
    { ms: 0, label: 'Free' },
];
export const DEFAULT_SNAP_MS = Math.round(1000 / 12);

/** Snap a time to the grid (0 = free). Always clamped into [0, max]. */
export const snapTo = (ms: number, snap: number, max: number): number => {
    const v = snap > 0 ? Math.round(ms / snap) * snap : Math.round(ms);
    return Math.min(Math.max(0, v), max);
};

/** Ruler label spacing that keeps labels ≥ ~60px apart at the current zoom. */
export const rulerStepMs = (pxPerMs: number): number => {
    for (const step of [50, 100, 250, 500, 1000, 2000, 5000]) {
        if (step * pxPerMs >= 60) return step;
    }
    return 10000;
};

type PickerState = {
    trackIndex: number;
    atMs: number;
    /** Editing an existing key (index into the track's keys) instead of adding. */
    keyIndex?: number;
};

export const AnimationStudio: React.FC<{
    character: VNCharacter;
    projectId: string;
    onClose: () => void;
}> = ({ character, projectId, onClose }) => {
    const { t } = useTranslation('characters');
    const { dispatch } = useProject();
    const anims = Object.values(character.animations || {}) as VNCharacterAnimation[];
    const [selectedId, setSelectedId] = useState<VNID | null>(anims[0]?.id ?? null);
    const anim = selectedId ? character.animations?.[selectedId] : undefined;

    const [timeMs, setTimeMs] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [pxPerMs, setPxPerMs] = useState(0.6);
    const [snapMs, setSnapMs] = useState(DEFAULT_SNAP_MS);
    const [picker, setPicker] = useState<PickerState | null>(null);
    // Live drag: chip follows the pointer locally; the UPDATE dispatch lands on release.
    // atMs ALSO lives in a ref: the pointerup listener is registered once per drag (the effect
    // deliberately doesn't re-run per move), so reading state there would see the POSITION FROM
    // POINTERDOWN — the commit compared old-vs-old and silently dropped every drag.
    const [drag, setDrag] = useState<{ trackIndex: number; keyIndex: number; atMs: number } | null>(null);
    const dragAtMsRef = useRef(0);
    const dragMovedRef = useRef(false);
    // Spin/Tilt lane: its own drag + editor state, mirroring the frame-key discipline
    // (live position local, ONE dispatch on release; a click opens the degree editor).
    const [rotDrag, setRotDrag] = useState<{ trackIndex: number; keyIndex: number; atMs: number } | null>(null);
    const rotDragAtMsRef = useRef(0);
    const rotDragMovedRef = useRef(false);
    const [rotPicker, setRotPicker] = useState<{ trackIndex: number; atMs: number; keyIndex?: number; deg: number } | null>(null);
    // Move & pivot editor (per track): offset while the animation plays + the spin pivot point.
    const [adjPicker, setAdjPicker] = useState<number | null>(null);

    const update = (updates: Partial<VNCharacterAnimation>) =>
        anim && dispatch({ type: 'UPDATE_CHARACTER_ANIMATION', payload: { characterId: character.id, animationId: anim.id, updates } });

    const setTrack = (i: number, track: VNAnimationTrack | null) => {
        if (!anim) return;
        const tracks = track === null ? anim.tracks.filter((_, j) => j !== i) : anim.tracks.map((tr, j) => (j === i ? track : tr));
        update({ tracks });
    };

    const layers = Object.values(character.layers || {}) as any[];
    const duration = Math.max(1, anim?.durationMs || 1);

    // ── Play clock (studio-local) ──
    useEffect(() => {
        if (!playing || !anim) return;
        let raf = 0;
        const start = performance.now() - timeMs;
        const tick = (now: number) => {
            raf = requestAnimationFrame(tick);
            const t = now - start;
            if (anim.loop) setTimeMs(((t % duration) + duration) % duration);
            else if (t >= duration) { setTimeMs(duration); setPlaying(false); }
            else setTimeMs(t);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, anim?.id, anim?.loop, duration]);

    // ── Preview composition at the scrub time ──
    const preview = useMemo(() => {
        const firstExpr = (Object.values(character.expressions || {}) as any[])[0];
        const baseSel = firstExpr?.layerConfiguration ?? {};
        const sel = anim ? applyAnimationFrame(baseSel, anim, timeMs) : baseSel;
        const wrap = (u: string) => resolveFieldUrl(projectId, u) || u;
        const media = buildCharacterMedia(character as any, sel, wrap, undefined);
        // Spin/Tilt + move/pivot: the same resolver the runtime clock uses.
        return { ...media, adjust: anim ? layerAdjustAt(anim, timeMs) : {} };
    }, [character, anim, timeMs, projectId]);

    // ── Drag handling (window-level listeners while a chip is held) ──
    const laneRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    useEffect(() => {
        if (!drag || !anim) return;
        const lane = laneRefs.current.get(drag.trackIndex);
        const onMove = (e: PointerEvent) => {
            if (!lane) return;
            const rect = lane.getBoundingClientRect();
            const ms = snapTo((e.clientX - rect.left) / pxPerMs, snapMs, duration);
            dragMovedRef.current = true;
            dragAtMsRef.current = ms;                      // the release handler reads THIS
            setDrag(d => (d ? { ...d, atMs: ms } : d));    // state only drives the visual
        };
        const onUp = () => {
            const finalAtMs = dragAtMsRef.current;
            const track = anim.tracks[drag.trackIndex];
            if (track && dragMovedRef.current && track.keys[drag.keyIndex]?.atMs !== finalAtMs) {
                setTrack(drag.trackIndex, {
                    ...track,
                    keys: track.keys.map((k, j) => (j === drag.keyIndex ? { ...k, atMs: finalAtMs } : k)),
                });
            } else if (!dragMovedRef.current) {
                // A click (no movement): open the picker to change this key's frame.
                setPicker({ trackIndex: drag.trackIndex, atMs: drag.atMs, keyIndex: drag.keyIndex });
            }
            setDrag(null);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drag?.trackIndex, drag?.keyIndex, pxPerMs, snapMs, duration, anim]);

    // Spin/Tilt keys: write helper (sorted; empty lane drops the field so the JSON stays minimal).
    const setRotKeys = (ti: number, keys: Array<{ atMs: number; deg: number }>) => {
        if (!anim) return;
        const track = anim.tracks[ti];
        if (!track) return;
        setTrack(ti, { ...track, rotationKeys: keys.length ? [...keys].sort((a, b) => a.atMs - b.atMs) : undefined });
    };

    // Move & pivot: write helper. Defaults (zero offset / centre pivot) are DROPPED so an
    // untouched track's JSON stays byte-identical.
    const setTrackAdjust = (ti: number, patch: { offsetX?: number; offsetY?: number; pivotX?: number; pivotY?: number }) => {
        if (!anim) return;
        const track = anim.tracks[ti];
        if (!track) return;
        const next: any = { ...track, ...patch };
        if (!next.offsetX) delete next.offsetX;
        if (!next.offsetY) delete next.offsetY;
        if (next.pivotX === 50 || next.pivotX === undefined || !Number.isFinite(next.pivotX)) delete next.pivotX;
        if (next.pivotY === 50 || next.pivotY === undefined || !Number.isFinite(next.pivotY)) delete next.pivotY;
        setTrack(ti, next);
    };

    // ── Spin/Tilt drag (mirrors the frame-key drag above) ──
    const rotLaneRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    useEffect(() => {
        if (!rotDrag || !anim) return;
        const lane = rotLaneRefs.current.get(rotDrag.trackIndex);
        const onMove = (e: PointerEvent) => {
            if (!lane) return;
            const rect = lane.getBoundingClientRect();
            const ms = snapTo((e.clientX - rect.left) / pxPerMs, snapMs, duration);
            rotDragMovedRef.current = true;
            rotDragAtMsRef.current = ms;
            setRotDrag(d => (d ? { ...d, atMs: ms } : d));
        };
        const onUp = () => {
            const finalAtMs = rotDragAtMsRef.current;
            const track = anim.tracks[rotDrag.trackIndex];
            const keys = track?.rotationKeys || [];
            if (track && rotDragMovedRef.current && keys[rotDrag.keyIndex]?.atMs !== finalAtMs) {
                setRotKeys(rotDrag.trackIndex, keys.map((k, j) => (j === rotDrag.keyIndex ? { ...k, atMs: finalAtMs } : k)));
            } else if (!rotDragMovedRef.current) {
                const k = keys[rotDrag.keyIndex];
                if (k) setRotPicker({ trackIndex: rotDrag.trackIndex, atMs: k.atMs, keyIndex: rotDrag.keyIndex, deg: k.deg });
            }
            setRotDrag(null);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rotDrag?.trackIndex, rotDrag?.keyIndex, pxPerMs, snapMs, duration, anim]);

    const assetsOf = (layerId: VNID) => {
        const layer = character.layers?.[layerId];
        return layer ? (Object.values(layer.assets || {}) as any[]).filter(a => !a.videoUrl && !a.isVideo) : [];
    };
    const thumbOf = (layerId: VNID, assetId: VNID | null): string | null => {
        if (!assetId) return null;
        const asset = character.layers?.[layerId]?.assets?.[assetId];
        const url = asset?.imageUrl;
        return url ? (resolveFieldUrl(projectId, url) || url) : null;
    };

    const commitPickerChoice = (assetId: VNID | null) => {
        if (!picker || !anim) return;
        const track = anim.tracks[picker.trackIndex];
        if (!track) { setPicker(null); return; }
        const keys = picker.keyIndex != null
            ? track.keys.map((k, j) => (j === picker.keyIndex ? { ...k, assetId } : k))
            : [...track.keys, { atMs: picker.atMs, assetId }];
        setTrack(picker.trackIndex, { ...track, keys });
        setPicker(null);
    };
    const deletePickedKey = () => {
        if (!picker || picker.keyIndex == null || !anim) return;
        const track = anim.tracks[picker.trackIndex];
        if (track) setTrack(picker.trackIndex, { ...track, keys: track.keys.filter((_, j) => j !== picker.keyIndex) });
        setPicker(null);
    };

    const timelineWidth = Math.max(200, duration * pxPerMs);
    const step = rulerStepMs(pxPerMs);
    const rulerMarks: number[] = [];
    for (let m = 0; m <= duration; m += step) rulerMarks.push(m);

    return (
        <div className="fixed inset-0 z-[10000] bg-black/70 flex items-center justify-center p-4">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl w-[96vw] max-w-[1700px] h-[92vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)]">
                    <h2 className="text-sm font-bold text-white">{t('anim.title', 'Animations')} — {character.name}</h2>
                    <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-white" title={t('anim.close', 'Close')}><XMarkIcon className="w-4 h-4" /></button>
                </div>
                <div className="flex flex-1 min-h-0">
                    {/* ── Animation list ── */}
                    <div className="w-48 border-r border-[var(--border-subtle)] p-2 space-y-1 overflow-y-auto flex-shrink-0">
                        {anims.map(a => (
                            <button key={a.id} onClick={() => { setSelectedId(a.id); setTimeMs(0); setPlaying(false); }}
                                className={`w-full text-left px-2 py-1 rounded text-xs truncate ${a.id === selectedId ? 'bg-[var(--accent-cyan)]/15 text-white ring-1 ring-[var(--accent-cyan)]/40' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'}`}>
                                {a.name}
                            </button>
                        ))}
                        <button onClick={() => dispatch({ type: 'ADD_CHARACTER_ANIMATION', payload: { characterId: character.id, name: t('anim.newName', 'New animation') } })}
                            className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-1 mt-1">
                            <PlusIcon className="w-4 h-4" />{t('anim.add', 'Add animation')}
                        </button>
                        {anim && <>
                            <div className="pt-2 mt-2 border-t border-[var(--border-subtle)] space-y-2">
                                <div className="flex items-center gap-1">
                                    <input value={anim.name} onChange={e => update({ name: e.target.value })} className={`${inputCls} flex-1 font-bold w-full`} />
                                    <button onClick={() => { dispatch({ type: 'DELETE_CHARACTER_ANIMATION', payload: { characterId: character.id, animationId: anim.id } }); setSelectedId(null); }}
                                        className="p-1 text-red-500 hover:text-red-400" title={t('anim.delete', 'Delete this animation')}>
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                <label className="block text-[10px] text-[var(--text-muted)]">
                                    {t('anim.trigger', 'When does it play?')}
                                    <select value={anim.trigger ?? 'manual'} onChange={e => update({ trigger: e.target.value as any })} className={`${inputCls} w-full mt-0.5`}>
                                        <option value="manual">{t('anim.triggerManual', 'When told to (command)')}</option>
                                        <option value="always">{t('anim.triggerAlways', 'All the time')}</option>
                                        <option value="idle">{t('anim.triggerIdle', 'Now and then (blinking)')}</option>
                                        <option value="speaking">{t('anim.triggerSpeaking', 'While they speak (talking)')}</option>
                                    </select>
                                </label>
                                <label className="block text-[10px] text-[var(--text-muted)]">
                                    {t('anim.duration', 'Length (ms)')}
                                    <input type="number" min="50" step="50" value={anim.durationMs}
                                        onChange={e => { const n = parseInt(e.target.value, 10); if (Number.isFinite(n) && n > 0) update({ durationMs: n }); }}
                                        className={`${inputCls} w-full mt-0.5`} />
                                </label>
                                <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                                    <input type="checkbox" checked={!!anim.loop} onChange={e => update({ loop: e.target.checked || undefined })} className="w-4 h-4" />
                                    {t('anim.loop', 'Repeat')}
                                </label>
                                {anim.trigger === 'idle' && <>
                                    <label className="block text-[10px] text-[var(--text-muted)]">
                                        {t('anim.idleMin', 'Wait at least (ms)')}
                                        <input type="number" min="100" step="100" value={anim.idleMinMs ?? 2000}
                                            onChange={e => { const n = parseInt(e.target.value, 10); update({ idleMinMs: Number.isFinite(n) && n >= 0 ? n : undefined }); }}
                                            className={`${inputCls} w-full mt-0.5`} />
                                    </label>
                                    <label className="block text-[10px] text-[var(--text-muted)]">
                                        {t('anim.idleMax', 'At most (ms)')}
                                        <input type="number" min="100" step="100" value={anim.idleMaxMs ?? 6000}
                                            onChange={e => { const n = parseInt(e.target.value, 10); update({ idleMaxMs: Number.isFinite(n) && n >= 0 ? n : undefined }); }}
                                            className={`${inputCls} w-full mt-0.5`} />
                                    </label>
                                </>}
                            </div>
                        </>}
                    </div>

                    {/* ── Preview + timeline ── */}
                    <div className="flex-1 min-w-0 flex flex-col">
                        {!anim ? (
                            <p className="text-xs text-[var(--text-muted)] p-4">{t('anim.empty', 'Add an animation to get started — a blink, a talking mouth, a floating strand of hair…')}</p>
                        ) : <>
                            {/* Preview */}
                            <div className="flex-1 min-h-0 flex items-center justify-center p-3">
                                <div className="relative h-full aspect-[3/4] max-h-[46vh] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] overflow-hidden" data-testid="anim-preview">
                                    {preview.imageUrls.map((url, i) => {
                                        const base: React.CSSProperties = preview.imageBoxes[i]
                                            ? { position: 'absolute', inset: 'auto', objectFit: 'fill', ...layerBoxStyle(preview.imageBoxes[i]) }
                                            : {};
                                        // Spin/Tilt + move/pivot preview — same composition rule as
                                        // the stage: move (frame-% → element-%), authored box
                                        // transform, then rotation about the track's pivot.
                                        const lid = preview.imageLayerIds?.[i];
                                        const a = lid != null ? preview.adjust[lid] : undefined;
                                        if (a) {
                                            const box = preview.imageBoxes[i];
                                            const bw = box?.width || 100;
                                            const bh = box?.height || 100;
                                            const pre = (a.dx || a.dy) ? `translate(${((a.dx / bw) * 100).toFixed(2)}%, ${((a.dy / bh) * 100).toFixed(2)}%) ` : '';
                                            const rot = (a.deg !== undefined && a.deg !== 0) ? `rotate(${a.deg.toFixed(2)}deg)` : '';
                                            const boxTf = layerBoxTransform(box);
                                            if (pre || rot) base.transform = `${pre}${boxTf ? boxTf + ' ' : ''}${rot}`.trim();
                                            if (a.pivotX !== 50 || a.pivotY !== 50) base.transformOrigin = `${a.pivotX}% ${a.pivotY}%`;
                                        }
                                        return (
                                            <img key={`${i}-${url}`} src={url} alt="" draggable={false}
                                                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                                                style={Object.keys(base).length ? base : undefined} />
                                        );
                                    })}
                                </div>
                            </div>
                            {/* Transport */}
                            <div className="flex items-center gap-2 px-3 pb-2">
                                <button onClick={() => setPlaying(p => !p)}
                                    className="px-2.5 py-1 rounded-md text-xs font-semibold bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/25"
                                    title={playing ? t('anim.pause', 'Pause') : t('anim.play', 'Play the animation')}>
                                    {playing ? '⏸' : '▶'}
                                </button>
                                <input type="range" min={0} max={duration} step={1} value={Math.round(timeMs)}
                                    onChange={e => { setPlaying(false); setTimeMs(parseInt(e.target.value, 10) || 0); }}
                                    className="flex-1" aria-label={t('anim.scrub', 'Scrub through the animation')} />
                                <span className="text-[10px] tabular-nums text-[var(--text-muted)] w-20 text-right">{(timeMs / 1000).toFixed(2)} s / {(duration / 1000).toFixed(2)} s</span>
                            </div>
                            {/* Timeline controls */}
                            <div className="flex items-center gap-4 px-3 py-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]">
                                <label className="flex items-center gap-1.5">
                                    {t('anim.snap', 'Snap to')}
                                    <select value={snapMs} onChange={e => setSnapMs(parseInt(e.target.value, 10))} className={inputCls} data-testid="anim-snap">
                                        {SNAP_OPTIONS.map(o => <option key={o.label} value={o.ms}>{o.label === 'Free' ? t('anim.snapFree', 'Free') : o.label}</option>)}
                                    </select>
                                </label>
                                <div className="flex items-center gap-1.5">
                                    <button onClick={() => setPxPerMs(z => Math.max(0.04, z / 1.5))}
                                        className="px-2.5 py-1 rounded-md border border-[var(--border-default)] font-semibold hover:bg-[var(--bg-tertiary)] hover:text-white"
                                        title={t('anim.zoomOut', 'Zoom out')}>
                                        🔍−
                                    </button>
                                    <span className="tabular-nums w-12 text-center" title={t('anim.zoom', 'Zoom')}>{Math.round((pxPerMs / 0.6) * 100)}%</span>
                                    <button onClick={() => setPxPerMs(z => Math.min(4, z * 1.5))}
                                        className="px-2.5 py-1 rounded-md border border-[var(--border-default)] font-semibold hover:bg-[var(--bg-tertiary)] hover:text-white"
                                        title={t('anim.zoomIn', 'Zoom in')}>
                                        🔍+
                                    </button>
                                </div>
                                <span className="italic text-[10px] text-[var(--text-muted)]">{t('anim.timelineHint', 'Click an empty spot on a row to add a frame change · drag a chip to move it · click a chip to change or remove it')}</span>
                            </div>
                            {/* Timeline */}
                            <div className="overflow-x-auto overflow-y-auto max-h-[38vh] border-t border-[var(--border-subtle)]">
                                <div style={{ width: timelineWidth + 176 }}>
                                    {/* Ruler */}
                                    <div className="flex sticky top-0 bg-[var(--bg-secondary)] z-10">
                                        <div className="w-44 flex-shrink-0" />
                                        <div className="relative h-7" style={{ width: timelineWidth }}>
                                            {rulerMarks.map(m => (
                                                <div key={m} className="absolute top-0 h-full border-l border-[var(--border-subtle)] pl-0.5 text-[10px] text-[var(--text-muted)]" style={{ left: m * pxPerMs }}>
                                                    {m >= 1000 ? `${(m / 1000).toFixed(m % 1000 ? 2 : 0)}s` : `${m}`}
                                                </div>
                                            ))}
                                            {/* Playhead */}
                                            <div className="absolute top-0 bottom-0 w-px bg-[var(--accent-cyan)]" style={{ left: timeMs * pxPerMs }} />
                                        </div>
                                    </div>
                                    {/* Track rows */}
                                    {anim.tracks.map((track, ti) => {
                                        const layer = character.layers?.[track.layerId];
                                        return (
                                            <div key={ti} className="flex items-stretch border-t border-[var(--border-subtle)]/50">
                                                <div className="w-44 flex-shrink-0 flex flex-col justify-center gap-0.5 px-2 py-1">
                                                    <div className="flex items-center gap-1">
                                                        <select value={track.layerId} onChange={e => setTrack(ti, { ...track, layerId: e.target.value as VNID })} className={`${inputCls} flex-1`}>
                                                            <option value="">{t('anim.pickLayer', 'Pick a layer…')}</option>
                                                            {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                                        </select>
                                                        <button onClick={() => setTrack(ti, null)} className="p-0.5 text-red-500 hover:text-red-400" title={t('anim.removeTrack', 'Remove this row')}>
                                                            <XMarkIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="text-[11px] font-semibold text-amber-300/90 flex items-center gap-1" title={t('anim.rotLaneTip', 'The thin strip is the Spin/Tilt lane — click it to add a rotation key. The piece turns smoothly between keys, around the middle of its box, and never moves its real position.')}>
                                                            <span className="text-sm">↻</span> {t('anim.rotLane', 'Spin / Tilt')}
                                                        </span>
                                                        <button
                                                            onClick={() => setAdjPicker(ti)}
                                                            className={`flex-shrink-0 w-9 h-8 flex items-center justify-center gap-0.5 rounded-md border-2 text-base font-bold ${(track.offsetX || track.offsetY || (track.pivotX != null && track.pivotX !== 50) || (track.pivotY != null && track.pivotY !== 50)) ? 'border-amber-400/80 text-amber-300 bg-amber-500/10' : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-tertiary)]'}`}
                                                            title={t('anim.adjustOpen', 'Move & pivot — move this piece while the animation plays, and choose the point it spins around')}
                                                        >
                                                            ⌖
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col">
                                                <div
                                                    ref={el => { if (el) laneRefs.current.set(ti, el); else laneRefs.current.delete(ti); }}
                                                    className="relative h-16 bg-[var(--bg-primary)]/40 cursor-copy"
                                                    style={{
                                                        width: timelineWidth,
                                                        // Snap-grid markers: a faint line at every snap step, so authors can SEE
                                                        // where a chip will land. Pure CSS (zero DOM nodes), tracks zoom + snap;
                                                        // hidden when Free or when steps would smear together.
                                                        ...(snapMs > 0 && snapMs * pxPerMs >= 5 ? {
                                                            backgroundImage: 'repeating-linear-gradient(90deg, color-mix(in srgb, var(--accent-cyan) 22%, transparent) 0px, color-mix(in srgb, var(--accent-cyan) 22%, transparent) 1px, transparent 1px, transparent ' + (snapMs * pxPerMs) + 'px)',
                                                        } : {}),
                                                    }}
                                                    data-testid={`anim-lane-${ti}`}
                                                    onClick={e => {
                                                        if ((e.target as HTMLElement).closest('[data-chip]')) return;
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        const ms = snapTo((e.clientX - rect.left) / pxPerMs, snapMs, duration);
                                                        setPicker({ trackIndex: ti, atMs: ms });
                                                    }}
                                                >
                                                    {!layer && <span className="absolute inset-0 flex items-center text-[9px] text-[var(--text-muted)] pl-2">{t('anim.laneNoLayer', 'Pick a layer for this row first')}</span>}
                                                    {track.keys.map((key, ki) => {
                                                        const at = drag && drag.trackIndex === ti && drag.keyIndex === ki ? drag.atMs : key.atMs;
                                                        const thumb = thumbOf(track.layerId, key.assetId);
                                                        return (
                                                            <div key={ki} data-chip
                                                                className="absolute top-2 h-12 w-12 -ml-6 rounded-md border-2 border-[var(--accent-cyan)]/60 bg-[var(--bg-secondary)] shadow cursor-grab active:cursor-grabbing flex items-center justify-center overflow-hidden"
                                                                // Same clamp as the Spin/Tilt chips: keep the centred chip (-ml-6 = 24px)
                                                                // inside the lane so a 0 ms frame never covers the layer column.
                                                                style={{ left: Math.max(24, Math.min(at * pxPerMs, timelineWidth - 24)) }}
                                                                title={`${at} ms — ${key.assetId ? (character.layers?.[track.layerId]?.assets?.[key.assetId]?.name ?? key.assetId) : t('anim.keyHidden', '(hidden)')}`}
                                                                onPointerDown={e => {
                                                                    e.preventDefault(); e.stopPropagation();
                                                                    dragMovedRef.current = false;
                                                                    dragAtMsRef.current = key.atMs;
                                                                    setDrag({ trackIndex: ti, keyIndex: ki, atMs: key.atMs });
                                                                }}
                                                            >
                                                                {thumb ? <img src={thumb} alt="" className="w-full h-full object-contain pointer-events-none" draggable={false} />
                                                                    : <span className="text-[10px] text-[var(--text-muted)]">∅</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {/* Spin/Tilt lane — thin strip under the frame lane. Click adds a
                                                    rotation key (degrees editor opens); the piece turns SMOOTHLY
                                                    between keys, unlike the step frame keys above. */}
                                                <div
                                                    ref={el => { if (el) rotLaneRefs.current.set(ti, el); else rotLaneRefs.current.delete(ti); }}
                                                    className="relative h-12 bg-amber-500/5 cursor-copy border-t border-dashed border-amber-400/30"
                                                    style={{ width: timelineWidth }}
                                                    data-testid={`anim-rotlane-${ti}`}
                                                    title={t('anim.rotLaneTip', 'The thin strip is the Spin/Tilt lane — click it to add a rotation key. The piece turns smoothly between keys, around the middle of its box, and never moves its real position.')}
                                                    onClick={e => {
                                                        if ((e.target as HTMLElement).closest('[data-rotchip]')) return;
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        const ms = snapTo((e.clientX - rect.left) / pxPerMs, snapMs, duration);
                                                        // Seed with the CURRENT interpolated angle at that time, so
                                                        // inserting a key mid-motion doesn't jerk the curve.
                                                        const cur = anim ? rotationAt(anim, ms)[track.layerId] : undefined;
                                                        setRotPicker({ trackIndex: ti, atMs: ms, deg: Math.round(cur ?? 0) });
                                                    }}
                                                >
                                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-sm text-amber-300/60 pointer-events-none">↻</span>
                                                    {(track.rotationKeys || []).map((rk, ki) => {
                                                        const at = rotDrag && rotDrag.trackIndex === ti && rotDrag.keyIndex === ki ? rotDrag.atMs : rk.atMs;
                                                        return (
                                                            <div key={ki} data-rotchip
                                                                className="absolute top-1 h-10 min-w-14 px-2 -ml-7 rounded-lg border-2 border-amber-400/80 bg-[var(--bg-secondary)] text-amber-300 text-sm font-bold shadow cursor-grab active:cursor-grabbing flex items-center justify-center gap-0.5 tabular-nums"
                                                                // Clamp the chip INSIDE the lane: it's centred on its time (-ml-7 = 28px),
                                                                // so a key at 0 ms would overhang the lane's left edge and cover the
                                                                // layer column (including the ⌖ button). Visual only — the stored time
                                                                // and the drag math are untouched.
                                                                style={{ left: Math.max(28, Math.min(at * pxPerMs, timelineWidth - 28)) }}
                                                                title={`${at} ms — ${rk.deg}°`}
                                                                onPointerDown={e => {
                                                                    e.preventDefault(); e.stopPropagation();
                                                                    rotDragMovedRef.current = false;
                                                                    rotDragAtMsRef.current = rk.atMs;
                                                                    setRotDrag({ trackIndex: ti, keyIndex: ki, atMs: rk.atMs });
                                                                }}
                                                            >
                                                                <span className="text-amber-400/80 text-xs">↻</span>{rk.deg}°
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div className="flex items-center border-t border-[var(--border-subtle)]/50">
                                        <div className="w-44 flex-shrink-0 px-2 py-1.5">
                                            <button onClick={() => update({ tracks: [...anim.tracks, { layerId: (layers[0]?.id ?? '') as VNID, keys: [] }] })}
                                                className="text-sky-400 hover:text-sky-300 text-[11px] flex items-center gap-1">
                                                <PlusIcon className="w-3.5 h-3.5" />{t('anim.addTrack', 'Add a layer row')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>}
                    </div>
                </div>
            </div>

            {/* ── Move & pivot editor (per track) ── */}
            {adjPicker != null && anim && (() => {
                const track = anim.tracks[adjPicker];
                if (!track) return null;
                const layerName = character.layers?.[track.layerId]?.name || '';
                const px = track.pivotX ?? 50;
                const py = track.pivotY ?? 50;
                return (
                    <div className="fixed inset-0 z-[10001] bg-black/50 flex items-center justify-center p-6" onMouseDown={e => { if (e.target === e.currentTarget) setAdjPicker(null); }}>
                        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 w-96" onClick={e => e.stopPropagation()}>
                            <p className="text-sm font-bold text-white mb-0.5">⌖ {t('anim.adjustTitle', 'Move & pivot')}{layerName ? ` — ${layerName}` : ''}</p>
                            <p className="text-[11px] text-[var(--text-muted)] mb-3">{t('anim.adjustHint', 'Only while this animation plays — the layer’s real position never changes. Press ▶ to watch it live while you adjust.')}</p>

                            <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('anim.adjustMove', 'Move the piece while it plays')}</p>
                            <div className="grid grid-cols-2 gap-2 mb-1">
                                <label className="block text-[11px] text-[var(--text-muted)]">
                                    {t('anim.adjustX', 'Sideways (%)')}
                                    <input type="number" step="0.5" value={track.offsetX ?? 0}
                                        onChange={e => { const n = parseFloat(e.target.value); setTrackAdjust(adjPicker, { offsetX: Number.isFinite(n) ? n : 0 }); }}
                                        className={`${inputCls} w-full mt-0.5 text-sm p-1.5`} />
                                </label>
                                <label className="block text-[11px] text-[var(--text-muted)]">
                                    {t('anim.adjustY', 'Up / down (%)')}
                                    <input type="number" step="0.5" value={track.offsetY ?? 0}
                                        onChange={e => { const n = parseFloat(e.target.value); setTrackAdjust(adjPicker, { offsetY: Number.isFinite(n) ? n : 0 }); }}
                                        className={`${inputCls} w-full mt-0.5 text-sm p-1.5`} />
                                </label>
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] mb-3">{t('anim.adjustMoveHint', 'Negative sideways = left, negative up/down = up.')}</p>

                            <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('anim.adjustPivot', 'Spins around this point')}</p>
                            <p className="text-[10px] text-[var(--text-muted)] mb-2">{t('anim.adjustPivotHint', 'If the drawing sits off-centre in its box, move the pivot onto the drawing so a spin doesn’t swing it sideways.')}</p>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="grid grid-cols-3 gap-1 flex-shrink-0">
                                    {[0, 50, 100].map(gy => [0, 50, 100].map(gx => (
                                        <button key={`${gx}-${gy}`}
                                            onClick={() => setTrackAdjust(adjPicker, { pivotX: gx, pivotY: gy })}
                                            className={`w-8 h-8 rounded border flex items-center justify-center text-sm ${px === gx && py === gy ? 'border-amber-400 bg-amber-500/20 text-amber-300' : 'border-[var(--border-default)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-white'}`}
                                            title={`${gx}% , ${gy}%`}
                                        >
                                            {px === gx && py === gy ? '●' : '○'}
                                        </button>
                                    )))}
                                </div>
                                <div className="flex-1 space-y-1.5">
                                    <label className="block text-[11px] text-[var(--text-muted)]">
                                        {t('anim.adjustPivotX', 'Across (%)')}
                                        <input type="number" step="5" min="0" max="100" value={px}
                                            onChange={e => { const n = parseFloat(e.target.value); setTrackAdjust(adjPicker, { pivotX: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50 }); }}
                                            className={`${inputCls} w-full mt-0.5 text-sm p-1.5`} />
                                    </label>
                                    <label className="block text-[11px] text-[var(--text-muted)]">
                                        {t('anim.adjustPivotY', 'Down (%)')}
                                        <input type="number" step="5" min="0" max="100" value={py}
                                            onChange={e => { const n = parseFloat(e.target.value); setTrackAdjust(adjPicker, { pivotY: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50 }); }}
                                            className={`${inputCls} w-full mt-0.5 text-sm p-1.5`} />
                                    </label>
                                </div>
                            </div>

                            <div className="flex justify-between items-center">
                                <button onClick={() => setTrackAdjust(adjPicker, { offsetX: 0, offsetY: 0, pivotX: 50, pivotY: 50 })}
                                    className="text-xs text-[var(--text-muted)] hover:text-white">{t('anim.adjustReset', 'Reset')}</button>
                                <button onClick={() => setAdjPicker(null)}
                                    className="text-sm font-semibold px-3 py-1.5 rounded bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/25">{t('anim.adjustDone', 'Done')}</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Spin/Tilt key editor ── */}
            {rotPicker && anim && (
                <div className="fixed inset-0 z-[10001] bg-black/50 flex items-center justify-center p-6" onMouseDown={e => { if (e.target === e.currentTarget) setRotPicker(null); }}>
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-3 w-72" onClick={e => e.stopPropagation()}>
                        <p className="text-xs font-bold text-white mb-1">
                            {rotPicker.keyIndex != null
                                ? t('anim.rotChange', 'Change the turn at {{ms}} ms', { ms: rotPicker.atMs })
                                : t('anim.rotAdd', 'Add a turn at {{ms}} ms', { ms: rotPicker.atMs })}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)] mb-2">{t('anim.rotHint', 'The piece turns smoothly to this angle, spinning around the middle of its box. 360 = one full spin. Its real position never changes.')}</p>
                        <label className="block text-[10px] text-[var(--text-muted)]">
                            {t('anim.rotDegrees', 'Angle (degrees)')}
                            <input type="number" step="5" value={rotPicker.deg} autoFocus
                                onChange={e => { const n = parseFloat(e.target.value); setRotPicker(p => p ? { ...p, deg: Number.isFinite(n) ? n : 0 } : p); }}
                                className={`${inputCls} w-full mt-0.5`} />
                        </label>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {[-90, -45, 0, 45, 90, 180, 360].map(q => (
                                <button key={q} onClick={() => setRotPicker(p => p ? { ...p, deg: q } : p)}
                                    className="px-1.5 py-0.5 rounded border border-[var(--border-default)] text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-white tabular-nums">{q}°</button>
                            ))}
                        </div>
                        <div className="flex justify-between items-center mt-3">
                            {rotPicker.keyIndex != null ? (
                                <button onClick={() => {
                                    const track = anim.tracks[rotPicker.trackIndex];
                                    if (track) setRotKeys(rotPicker.trackIndex, (track.rotationKeys || []).filter((_, j) => j !== rotPicker.keyIndex));
                                    setRotPicker(null);
                                }} className="text-red-500 hover:text-red-400 text-xs flex items-center gap-1">
                                    <TrashIcon className="w-3.5 h-3.5" />{t('anim.rotRemove', 'Remove this turn')}
                                </button>
                            ) : <span />}
                            <div className="flex gap-2">
                                <button onClick={() => setRotPicker(null)} className="text-xs text-[var(--text-muted)] hover:text-white">{t('anim.cancel', 'Cancel')}</button>
                                <button onClick={() => {
                                    const track = anim.tracks[rotPicker.trackIndex];
                                    if (track) {
                                        const keys = [...(track.rotationKeys || [])];
                                        if (rotPicker.keyIndex != null) keys[rotPicker.keyIndex] = { atMs: rotPicker.atMs, deg: rotPicker.deg };
                                        else keys.push({ atMs: rotPicker.atMs, deg: rotPicker.deg });
                                        setRotKeys(rotPicker.trackIndex, keys);
                                    }
                                    setRotPicker(null);
                                }} className="text-xs font-semibold px-2.5 py-1 rounded bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/25">{t('anim.rotSave', 'Save')}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Frame picker ── */}
            {picker && anim && (
                <div className="fixed inset-0 z-[10001] bg-black/50 flex items-center justify-center p-6" onMouseDown={e => { if (e.target === e.currentTarget) setPicker(null); }}>
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-3 w-80 max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <p className="text-xs font-bold text-white mb-2">
                            {picker.keyIndex != null
                                ? t('anim.pickChange', 'Change this frame ({{ms}} ms)', { ms: picker.atMs })
                                : t('anim.pickAdd', 'Add a frame change at {{ms}} ms', { ms: picker.atMs })}
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => commitPickerChoice(null)}
                                className="h-20 rounded-md border border-dashed border-[var(--border-default)] text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] flex items-center justify-center">
                                {t('anim.keyHidden', '(hidden)')}
                            </button>
                            {assetsOf(anim.tracks[picker.trackIndex]?.layerId).map((a: any) => {
                                const url = a.imageUrl ? (resolveFieldUrl(projectId, a.imageUrl) || a.imageUrl) : null;
                                return (
                                    <button key={a.id} onClick={() => commitPickerChoice(a.id)}
                                        className="h-20 rounded-md border border-[var(--border-subtle)] hover:border-[var(--accent-cyan)]/60 hover:bg-[var(--bg-tertiary)] p-1 flex flex-col items-center justify-center gap-1">
                                        {url ? <img src={url} alt="" className="flex-1 min-h-0 w-full object-contain" draggable={false} /> : <span className="text-lg">🖼️</span>}
                                        <span className="text-[9px] text-[var(--text-secondary)] truncate w-full text-center">{a.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex justify-between mt-3">
                            {picker.keyIndex != null ? (
                                <button onClick={deletePickedKey} className="text-red-500 hover:text-red-400 text-xs flex items-center gap-1">
                                    <TrashIcon className="w-3.5 h-3.5" />{t('anim.removeKey', 'Remove this frame change')}
                                </button>
                            ) : <span />}
                            <button onClick={() => setPicker(null)} className="text-xs text-[var(--text-muted)] hover:text-white">{t('anim.cancel', 'Cancel')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnimationStudio;
