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
import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../contexts/ProjectContext';
import { useToast } from '../../contexts/ToastContext';
import {
    AnimLaneKind, getAnimClipboard, setAnimClipboard,
    copyAnimationToClipboard, copyLaneToClipboard,
    remapAnimationForCharacter, remapLaneKeysForLayer,
    lanesCompatible, keysPastDuration,
} from './animClipboard';
import { VNID } from '../../types';
import { VNCharacter, VNCharacterAnimation, VNAnimationTrack } from '../../features/character/types';
import { applyAnimationFrame, rotationAt, layerAdjustAt, characterMotionAt } from '../../features/character/spriteAnim';
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
    // Squash & Stretch lane: same discipline as Spin/Tilt (live drag local, one dispatch on
    // release; a click opens the size editor).
    const [sclDrag, setSclDrag] = useState<{ trackIndex: number; keyIndex: number; atMs: number } | null>(null);
    const sclDragAtMsRef = useRef(0);
    const sclDragMovedRef = useRef(false);
    const [sclPicker, setSclPicker] = useState<{ trackIndex: number; atMs: number; keyIndex?: number; sx: number; sy: number } | null>(null);
    // Glide lane (tweened movement): same discipline again.
    const [movDrag, setMovDrag] = useState<{ trackIndex: number; keyIndex: number; atMs: number } | null>(null);
    const movDragAtMsRef = useRef(0);
    const movDragMovedRef = useRef(false);
    const [movPicker, setMovPicker] = useState<{ trackIndex: number; atMs: number; keyIndex?: number; dx: number; dy: number } | null>(null);
    // Glide drag-to-place: while the Glide editor is open, dragging the piece in the
    // preview writes the picker's dx/dy (local state only; the dispatch lands on Save).
    const [movPlaceDrag, setMovPlaceDrag] = useState<{ startX: number; startY: number; baseDx: number; baseDy: number } | null>(null);
    // Whole-character motion lane (animation-level, ONE lane above the track rows): moves the
    // ENTIRE sprite with tweened keys. Same drag/editor discipline as the per-layer lanes.
    const [motDrag, setMotDrag] = useState<{ keyIndex: number; atMs: number } | null>(null);
    const motDragAtMsRef = useRef(0);
    const motDragMovedRef = useRef(false);
    const [motPicker, setMotPicker] = useState<{ atMs: number; keyIndex?: number; dx: number; dy: number } | null>(null);
    const [motPlaceDrag, setMotPlaceDrag] = useState<{ startX: number; startY: number; baseDx: number; baseDy: number } | null>(null);
    // Move & pivot editor (per track): offset while the animation plays + the spin pivot point.
    const [adjPicker, setAdjPicker] = useState<number | null>(null);
    // The editors dock to the right with NO backdrop, so nothing stops a click on another
    // lane while one is open — every open site closes the rest first or panels would stack.
    const closeEditors = () => {
        setPicker(null); setRotPicker(null); setSclPicker(null);
        setMovPicker(null); setMotPicker(null); setAdjPicker(null);
    };

    // ── Duplicate / copy / paste (module-scoped clipboard survives closing the Studio,
    //    so an animation copied here can be pasted in another character's Studio) ──
    const toast = useToast();
    // The clipboard lives outside React; bump after writes so Paste buttons appear.
    const [, bumpClip] = useReducer((x: number) => x + 1, 0);
    const clip = getAnimClipboard();
    const newAnimId = () => `anim-${Math.random().toString(36).substring(2, 9)}` as VNID;

    const duplicateAnim = () => {
        if (!anim) return;
        const newId = newAnimId();
        dispatch({ type: 'DUPLICATE_CHARACTER_ANIMATION', payload: { characterId: character.id, animationId: anim.id, newAnimationId: newId } });
        setSelectedId(newId);
    };
    const copyAnim = () => {
        if (!anim) return;
        setAnimClipboard(copyAnimationToClipboard(character, anim));
        bumpClip();
        toast.success(t('anim.copied', 'Copied — open any character’s Animation Studio and press Paste'));
    };
    const pasteAnim = () => {
        const c = getAnimClipboard();
        if (c?.kind !== 'animation') return;
        const newId = newAnimId();
        const { animation, matchedTracks, totalTracks } = remapAnimationForCharacter(c, character, newId);
        // Pasting back onto the source character duplicates it — suffix so the list stays legible.
        if (c.sourceCharacterId === character.id) animation.name = `${animation.name} (copy)`;
        dispatch({ type: 'IMPORT_CHARACTER_ANIMATION', payload: { characterId: character.id, animation } });
        setSelectedId(newId);
        if (matchedTracks < totalTracks) {
            toast.info(t('anim.pasteMatched', 'Matched {{m}} of {{n}} rows by layer name — unmatched rows say “Pick a layer…”', { m: matchedTracks, n: totalTracks }));
        } else {
            toast.success(t('anim.pasted', 'Pasted'));
        }
    };
    const copyLane = (lane: AnimLaneKind, keys: Array<{ atMs: number }> | undefined, layerId?: VNID) => {
        if (!keys?.length) return;
        setAnimClipboard(copyLaneToClipboard(character, lane, keys as any, layerId));
        bumpClip();
        toast.success(t('anim.laneCopied', 'Keys copied — a Paste button appears on matching strips'));
    };
    const pasteLane = (lane: AnimLaneKind, ti: number, layerId?: VNID) => {
        const c = getAnimClipboard();
        if (c?.kind !== 'lane' || !anim || !lanesCompatible(c.lane, lane)) return;
        const keys = remapLaneKeysForLayer(c, character, layerId) as any[];
        const track = anim.tracks[ti];
        if (lane === 'frames') { if (track) setTrack(ti, { ...track, keys: [...keys].sort((a, b) => a.atMs - b.atMs) }); }
        else if (lane === 'rot') setRotKeys(ti, keys);
        else if (lane === 'scl') setSclKeys(ti, keys);
        else if (lane === 'mov') setMovKeys(ti, keys);
        else setMotKeys(keys);
        if (keysPastDuration(keys, duration)) {
            toast.info(t('anim.pasteLate', 'Some keys sit after {{ms}} ms — lengthen the animation to play them', { ms: duration }));
        } else {
            toast.success(t('anim.lanePasted', 'Keys pasted'));
        }
    };
    /** Tiny per-lane ⧉ copy button (tooltip carries the words; ⌖ set the icon precedent). */
    const laneCopyBtn = (lane: AnimLaneKind, keys: Array<{ atMs: number }> | undefined, layerId?: VNID) => (
        <button
            onClick={e => { e.stopPropagation(); copyLane(lane, keys, layerId); }}
            disabled={!keys?.length}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded border border-[var(--border-default)] text-[10px] text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-tertiary)] disabled:opacity-30"
            title={t('anim.laneCopy', 'Copy this strip’s keys — paste them on any matching strip, even another character’s')}
        >⧉</button>
    );
    /** Paste chip — appears ONLY while the clipboard holds a compatible lane. */
    const lanePasteBtn = (lane: AnimLaneKind, ti: number, layerId?: VNID) => {
        const c = getAnimClipboard();
        if (c?.kind !== 'lane' || !lanesCompatible(c.lane, lane)) return null;
        return (
            <button
                onClick={e => { e.stopPropagation(); pasteLane(lane, ti, layerId); }}
                className="flex-shrink-0 h-5 px-1 flex items-center justify-center rounded border border-fuchsia-400/60 bg-fuchsia-500/10 text-[10px] text-fuchsia-300 hover:bg-fuchsia-500/20"
                title={t('anim.lanePaste', 'Paste {{n}} copied keys here — replaces this strip’s keys (undo brings them back)', { n: c.keys.length })}
            >⤓{c.keys.length}</button>
        );
    };

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

    // ── Live-edit splice ──
    // While a Spin/Tilt, Squash/Stretch or Glide key editor is open, the preview renders
    // the animation WITH the in-flight value spliced in — moving a slider moves the piece
    // immediately, and ▶ plays the whole motion with the pending change. Project data
    // still updates only on Save (the lane discipline).
    const previewAnim = useMemo(() => {
        if (!anim) return anim;
        const splice = <K extends { atMs: number }>(keys: K[] | undefined, entry: K, keyIndex: number | null | undefined): K[] => {
            const arr = [...(keys || [])];
            if (keyIndex != null) arr[keyIndex] = entry; else arr.push(entry);
            return arr.sort((a, b) => a.atMs - b.atMs);
        };
        const patchTrack = (ti: number, patch: (tr: VNAnimationTrack) => VNAnimationTrack): VNCharacterAnimation =>
            ({ ...anim, tracks: anim.tracks.map((tr, i) => (i === ti ? patch(tr) : tr)) });
        if (rotPicker && anim.tracks[rotPicker.trackIndex]) {
            return patchTrack(rotPicker.trackIndex, tr => ({ ...tr, rotationKeys: splice(tr.rotationKeys, { atMs: rotPicker.atMs, deg: rotPicker.deg }, rotPicker.keyIndex) }));
        }
        if (sclPicker && anim.tracks[sclPicker.trackIndex]) {
            return patchTrack(sclPicker.trackIndex, tr => ({ ...tr, scaleKeys: splice(tr.scaleKeys, { atMs: sclPicker.atMs, sx: sclPicker.sx, sy: sclPicker.sy }, sclPicker.keyIndex) }));
        }
        if (movPicker && anim.tracks[movPicker.trackIndex]) {
            return patchTrack(movPicker.trackIndex, tr => ({ ...tr, moveKeys: splice(tr.moveKeys, { atMs: movPicker.atMs, dx: movPicker.dx, dy: movPicker.dy }, movPicker.keyIndex) }));
        }
        if (motPicker) {
            return { ...anim, motionKeys: splice(anim.motionKeys, { atMs: motPicker.atMs, dx: motPicker.dx, dy: motPicker.dy }, motPicker.keyIndex) };
        }
        return anim;
    }, [anim, rotPicker, sclPicker, movPicker, motPicker]);

    // ── Preview composition at the scrub time ──
    const preview = useMemo(() => {
        const firstExpr = (Object.values(character.expressions || {}) as any[])[0];
        const baseSel = firstExpr?.layerConfiguration ?? {};
        const sel = previewAnim ? applyAnimationFrame(baseSel, previewAnim, timeMs) : baseSel;
        const wrap = (u: string) => resolveFieldUrl(projectId, u) || u;
        const media = buildCharacterMedia(character as any, sel, wrap, undefined);
        // Spin/Tilt + move/pivot: the same resolver the runtime clock uses.
        return {
            ...media,
            adjust: previewAnim ? layerAdjustAt(previewAnim, timeMs) : {},
            // Whole-character motion — applied as one translate around the whole image stack.
            motion: previewAnim ? characterMotionAt(previewAnim, timeMs) : null,
        };
    }, [character, previewAnim, timeMs, projectId]);

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
                // A click (no movement): open the frame editor for this key — and scrub the
                // playhead to it, so the author is looking at the exact frame they're editing.
                closeEditors();
                setPlaying(false);
                setTimeMs(track?.keys[drag.keyIndex]?.atMs ?? drag.atMs);
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

    // Squash & Stretch keys: write helper (sorted; empty lane drops the field — minimal JSON).
    const setSclKeys = (ti: number, keys: Array<{ atMs: number; sx: number; sy: number }>) => {
        if (!anim) return;
        const track = anim.tracks[ti];
        if (!track) return;
        setTrack(ti, { ...track, scaleKeys: keys.length ? [...keys].sort((a, b) => a.atMs - b.atMs) : undefined });
    };

    // ── Squash & Stretch drag (mirrors the Spin/Tilt drag above) ──
    const sclLaneRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    useEffect(() => {
        if (!sclDrag || !anim) return;
        const lane = sclLaneRefs.current.get(sclDrag.trackIndex);
        const onMove = (e: PointerEvent) => {
            if (!lane) return;
            const rect = lane.getBoundingClientRect();
            const ms = snapTo((e.clientX - rect.left) / pxPerMs, snapMs, duration);
            sclDragMovedRef.current = true;
            sclDragAtMsRef.current = ms;
            setSclDrag(d => (d ? { ...d, atMs: ms } : d));
        };
        const onUp = () => {
            const finalAtMs = sclDragAtMsRef.current;
            const track = anim.tracks[sclDrag.trackIndex];
            const keys = track?.scaleKeys || [];
            if (track && sclDragMovedRef.current && keys[sclDrag.keyIndex]?.atMs !== finalAtMs) {
                setSclKeys(sclDrag.trackIndex, keys.map((k, j) => (j === sclDrag.keyIndex ? { ...k, atMs: finalAtMs } : k)));
            } else if (!sclDragMovedRef.current) {
                const k = keys[sclDrag.keyIndex];
                // Scrub to the key so the author is LOOKING at the moment they're editing.
                if (k) { closeEditors(); setPlaying(false); setTimeMs(k.atMs); setSclPicker({ trackIndex: sclDrag.trackIndex, atMs: k.atMs, keyIndex: sclDrag.keyIndex, sx: k.sx ?? 1, sy: k.sy ?? 1 }); }
            }
            setSclDrag(null);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sclDrag?.trackIndex, sclDrag?.keyIndex, pxPerMs, snapMs, duration, anim]);

    // Glide keys: write helper (sorted; empty lane drops the field — minimal JSON).
    const setMovKeys = (ti: number, keys: Array<{ atMs: number; dx: number; dy: number }>) => {
        if (!anim) return;
        const track = anim.tracks[ti];
        if (!track) return;
        setTrack(ti, { ...track, moveKeys: keys.length ? [...keys].sort((a, b) => a.atMs - b.atMs) : undefined });
    };

    // ── Glide drag (mirrors the Spin/Tilt drag above) ──
    const movLaneRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    useEffect(() => {
        if (!movDrag || !anim) return;
        const lane = movLaneRefs.current.get(movDrag.trackIndex);
        const onMove = (e: PointerEvent) => {
            if (!lane) return;
            const rect = lane.getBoundingClientRect();
            const ms = snapTo((e.clientX - rect.left) / pxPerMs, snapMs, duration);
            movDragMovedRef.current = true;
            movDragAtMsRef.current = ms;
            setMovDrag(d => (d ? { ...d, atMs: ms } : d));
        };
        const onUp = () => {
            const finalAtMs = movDragAtMsRef.current;
            const track = anim.tracks[movDrag.trackIndex];
            const keys = track?.moveKeys || [];
            if (track && movDragMovedRef.current && keys[movDrag.keyIndex]?.atMs !== finalAtMs) {
                setMovKeys(movDrag.trackIndex, keys.map((k, j) => (j === movDrag.keyIndex ? { ...k, atMs: finalAtMs } : k)));
            } else if (!movDragMovedRef.current) {
                const k = keys[movDrag.keyIndex];
                // Scrub to the key so the author is LOOKING at the moment they're editing.
                if (k) { closeEditors(); setPlaying(false); setTimeMs(k.atMs); setMovPicker({ trackIndex: movDrag.trackIndex, atMs: k.atMs, keyIndex: movDrag.keyIndex, dx: k.dx ?? 0, dy: k.dy ?? 0 }); }
            }
            setMovDrag(null);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [movDrag?.trackIndex, movDrag?.keyIndex, pxPerMs, snapMs, duration, anim]);

    // Whole-character motion keys: write helper (sorted; empty lane drops the field).
    const setMotKeys = (keys: Array<{ atMs: number; dx: number; dy: number }>) => {
        if (!anim) return;
        update({ motionKeys: keys.length ? [...keys].sort((a, b) => a.atMs - b.atMs) : undefined });
    };

    // ── Whole-character motion drag (mirrors the per-layer lane drags) ──
    const motLaneRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!motDrag || !anim) return;
        const lane = motLaneRef.current;
        const onMove = (e: PointerEvent) => {
            if (!lane) return;
            const rect = lane.getBoundingClientRect();
            const ms = snapTo((e.clientX - rect.left) / pxPerMs, snapMs, duration);
            motDragMovedRef.current = true;
            motDragAtMsRef.current = ms;
            setMotDrag(d => (d ? { ...d, atMs: ms } : d));
        };
        const onUp = () => {
            const finalAtMs = motDragAtMsRef.current;
            const keys = anim.motionKeys || [];
            if (motDragMovedRef.current && keys[motDrag.keyIndex]?.atMs !== finalAtMs) {
                setMotKeys(keys.map((k, j) => (j === motDrag.keyIndex ? { ...k, atMs: finalAtMs } : k)));
            } else if (!motDragMovedRef.current) {
                const k = keys[motDrag.keyIndex];
                // Scrub to the key so the author is LOOKING at the moment they're editing.
                if (k) { closeEditors(); setPlaying(false); setTimeMs(k.atMs); setMotPicker({ atMs: k.atMs, keyIndex: motDrag.keyIndex, dx: k.dx ?? 0, dy: k.dy ?? 0 }); }
            }
            setMotDrag(null);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [motDrag?.keyIndex, pxPerMs, snapMs, duration, anim]);

    // ── Per-frame nudge (drag-to-align) ─────────────────────────────────────────────
    // The frame editor is a docked side panel (no backdrop), so the PREVIEW stays live:
    // drag the piece in the preview to write the key's dx/dy, arrow keys for fine steps.
    // Live position is local per move; ONE dispatch on release (the lane discipline).
    const previewRef = useRef<HTMLDivElement | null>(null);
    const [liveNudge, setLiveNudge] = useState<{ dx: number; dy: number } | null>(null);
    const liveNudgeRef = useRef<{ dx: number; dy: number } | null>(null);
    const [nudgeDrag, setNudgeDrag] = useState<{ startX: number; startY: number; baseDx: number; baseDy: number } | null>(null);

    // What the editor is pointed at (only when editing an EXISTING frame key).
    const editedTrack = picker && picker.keyIndex != null && anim ? anim.tracks[picker.trackIndex] : undefined;
    const editedKey = editedTrack && picker?.keyIndex != null ? editedTrack.keys[picker.keyIndex] : undefined;
    const editedLayerId = editedTrack?.layerId;

    const setKeyNudge = (ti: number, ki: number, dx: number, dy: number) => {
        if (!anim) return;
        const track = anim.tracks[ti];
        if (!track) return;
        const r = (v: number) => Math.round(v * 10) / 10;
        setTrack(ti, {
            ...track,
            // Zero → field dropped, so untouched keys stay byte-identical.
            keys: track.keys.map((k, j) => (j === ki ? { ...k, dx: r(dx) || undefined, dy: r(dy) || undefined } : k)),
        });
    };

    // Frame-nudge sliders: while sliding, the value rides liveNudge (the same preview
    // override the drag uses) — the piece moves live; ONE dispatch lands on release.
    const slideNudge = (dx: number, dy: number) => {
        const next = { dx, dy };
        liveNudgeRef.current = next;
        setLiveNudge(next);
    };
    const commitSlideNudge = () => {
        const final = liveNudgeRef.current;
        liveNudgeRef.current = null;
        setLiveNudge(null);
        if (final && picker && picker.keyIndex != null) setKeyNudge(picker.trackIndex, picker.keyIndex, final.dx, final.dy);
    };

    // Drag the piece in the preview → nudge. Deltas are % of the character frame (the
    // preview box IS the frame), matching the runtime's units exactly.
    useEffect(() => {
        if (!nudgeDrag || !picker || picker.keyIndex == null) return;
        const box = previewRef.current?.getBoundingClientRect();
        const onMove = (e: PointerEvent) => {
            if (!box || box.width <= 0) return;
            const next = {
                dx: nudgeDrag.baseDx + ((e.clientX - nudgeDrag.startX) / box.width) * 100,
                dy: nudgeDrag.baseDy + ((e.clientY - nudgeDrag.startY) / box.height) * 100,
            };
            liveNudgeRef.current = next;
            setLiveNudge(next);
        };
        const onUp = () => {
            const final = liveNudgeRef.current;
            liveNudgeRef.current = null;
            setLiveNudge(null);
            setNudgeDrag(null);
            if (final && picker.keyIndex != null) setKeyNudge(picker.trackIndex, picker.keyIndex, final.dx, final.dy);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nudgeDrag]);

    // Arrow keys nudge while the frame editor is open (0.5% / press, Shift = 2%); Esc closes.
    useEffect(() => {
        if (!picker || picker.keyIndex == null) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { setPicker(null); return; }
            if (!e.key.startsWith('Arrow')) return;
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
            e.preventDefault();
            const step = e.shiftKey ? 2 : 0.5;
            const dx = (editedKey?.dx ?? 0) + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0);
            const dy = (editedKey?.dy ?? 0) + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
            setKeyNudge(picker.trackIndex, picker.keyIndex!, dx, dy);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [picker?.trackIndex, picker?.keyIndex, editedKey?.dx, editedKey?.dy]);

    // Ghost of the PREVIOUS frame (35% opacity) while aligning — the reference the player
    // just saw, which is exactly what a sway frame must line up against.
    const alignGhost = useMemo(() => {
        if (!picker || picker.keyIndex == null || !editedTrack || !editedLayerId) return null;
        const prev = editedTrack.keys[picker.keyIndex - 1];
        if (!prev?.assetId) return null;
        const wrap = (u: string) => resolveFieldUrl(projectId, u) || u;
        const media = buildCharacterMedia(character as any, { [editedLayerId]: prev.assetId } as any, wrap, undefined);
        const idx = (media.imageLayerIds as Array<string | null>).findIndex(l => l === editedLayerId);
        if (idx < 0) return null;
        return {
            url: media.imageUrls[idx],
            box: media.imageBoxes[idx],
            dx: prev.dx ?? 0,
            dy: prev.dy ?? 0,
        };
    }, [picker, editedTrack, editedLayerId, character, projectId]);

    // Glide drag-to-place: dragging the piece in the preview writes the OPEN Glide
    // editor's dx/dy live (the preview follows via the live-edit splice). Same units as
    // the frame nudge drag — the preview box IS the character frame.
    useEffect(() => {
        if (!movPlaceDrag) return;
        const box = previewRef.current?.getBoundingClientRect();
        const r = (v: number) => Math.round(v * 10) / 10;
        const onMove = (e: PointerEvent) => {
            if (!box || box.width <= 0) return;
            setMovPicker(p => p ? {
                ...p,
                dx: r(movPlaceDrag.baseDx + ((e.clientX - movPlaceDrag.startX) / box.width) * 100),
                dy: r(movPlaceDrag.baseDy + ((e.clientY - movPlaceDrag.startY) / box.height) * 100),
            } : p);
        };
        const onUp = () => setMovPlaceDrag(null);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    }, [movPlaceDrag]);

    // Motion drag-to-place: same as the Glide one, but writes the whole-character editor.
    useEffect(() => {
        if (!motPlaceDrag) return;
        const box = previewRef.current?.getBoundingClientRect();
        const r = (v: number) => Math.round(v * 10) / 10;
        const onMove = (e: PointerEvent) => {
            if (!box || box.width <= 0) return;
            setMotPicker(p => p ? {
                ...p,
                dx: r(motPlaceDrag.baseDx + ((e.clientX - motPlaceDrag.startX) / box.width) * 100),
                dy: r(motPlaceDrag.baseDy + ((e.clientY - motPlaceDrag.startY) / box.height) * 100),
            } : p);
        };
        const onUp = () => setMotPlaceDrag(null);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    }, [motPlaceDrag]);

    // The lane editors dock to the side with NO backdrop (the preview must stay visible),
    // so there's no click-outside to close them — Esc does it instead.
    useEffect(() => {
        if (!rotPicker && !sclPicker && !movPicker && !motPicker && adjPicker == null) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            setRotPicker(null); setSclPicker(null); setMovPicker(null); setMotPicker(null); setAdjPicker(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [!!rotPicker, !!sclPicker, !!movPicker, !!motPicker, adjPicker != null]);

    // ⌖ marker on the preview while a turn/size/pivot editor is open — shows the exact
    // point the piece spins and sizes around, on the layer's own box.
    const pivotMarker = useMemo(() => {
        const ti = rotPicker?.trackIndex ?? sclPicker?.trackIndex ?? adjPicker;
        if (ti == null || !anim) return null;
        const track = anim.tracks[ti];
        if (!track) return null;
        const idx = ((preview.imageLayerIds ?? []) as Array<string | null>).findIndex(l => l === track.layerId);
        const box = (idx >= 0 ? preview.imageBoxes[idx] : undefined) ?? { x: 0, y: 0, width: 100, height: 100 };
        const px = track.pivotX ?? 50;
        const py = track.pivotY ?? 50;
        return { left: box.x + (box.width * px) / 100, top: box.y + (box.height * py) / 100 };
    }, [rotPicker?.trackIndex, sclPicker?.trackIndex, adjPicker, anim, preview]);

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
                // Scrub to the key so the author is LOOKING at the moment they're editing.
                if (k) { closeEditors(); setPlaying(false); setTimeMs(k.atMs); setRotPicker({ trackIndex: rotDrag.trackIndex, atMs: k.atMs, keyIndex: rotDrag.keyIndex, deg: k.deg }); }
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
                        {clip?.kind === 'animation' && (
                            <button onClick={pasteAnim}
                                className="text-fuchsia-300 hover:text-fuchsia-200 text-xs flex items-center gap-1 mt-1 text-left"
                                title={t('anim.pasteTip', 'Pastes the copied animation onto THIS character. Rows land on layers with the same name; the rest say “Pick a layer…”.')}>
                                ⎘ {t('anim.pasteAnim', 'Paste “{{name}}”', { name: clip.anim.name })}
                            </button>
                        )}
                        {anim && <>
                            <div className="pt-2 mt-2 border-t border-[var(--border-subtle)] space-y-2">
                                <div className="flex items-center gap-1">
                                    <input value={anim.name} onChange={e => update({ name: e.target.value })} className={`${inputCls} flex-1 font-bold w-full`} />
                                    <button onClick={() => { dispatch({ type: 'DELETE_CHARACTER_ANIMATION', payload: { characterId: character.id, animationId: anim.id } }); setSelectedId(null); }}
                                        className="p-1 text-red-500 hover:text-red-400" title={t('anim.delete', 'Delete this animation')}>
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={duplicateAnim}
                                        className="flex-1 text-[10px] py-1 rounded border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-white"
                                        title={t('anim.duplicateTip', 'Make a same-character copy of this animation to tweak')}>
                                        ⧉ {t('anim.duplicate', 'Duplicate')}
                                    </button>
                                    <button onClick={copyAnim}
                                        className="flex-1 text-[10px] py-1 rounded border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-white"
                                        title={t('anim.copyTip', 'Copy this animation — then open any character’s Animation Studio and press Paste. Rows land on layers with the same name.')}>
                                        ⎘ {t('anim.copy', 'Copy')}
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
                            {/* Preview. While the frame editor is open (docked panel, no backdrop),
                                the preview is the ALIGNMENT surface: drag the piece to nudge the
                                edited frame; the previous frame ghosts underneath as the reference. */}
                            <div className="flex-1 min-h-0 flex items-center justify-center p-3">
                                <div
                                    ref={previewRef}
                                    className="relative h-full aspect-[3/4] max-h-[46vh] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] overflow-hidden"
                                    data-testid="anim-preview"
                                    style={(editedKey || movPicker || motPicker) ? { cursor: 'move', touchAction: 'none' } : undefined}
                                    onPointerDown={(editedKey || movPicker || motPicker) ? (e => {
                                        if (e.button !== 0) return;
                                        e.preventDefault();
                                        if (editedKey) setNudgeDrag({ startX: e.clientX, startY: e.clientY, baseDx: editedKey.dx ?? 0, baseDy: editedKey.dy ?? 0 });
                                        else if (movPicker) setMovPlaceDrag({ startX: e.clientX, startY: e.clientY, baseDx: movPicker.dx, baseDy: movPicker.dy });
                                        else if (motPicker) setMotPlaceDrag({ startX: e.clientX, startY: e.clientY, baseDx: motPicker.dx, baseDy: motPicker.dy });
                                    }) : undefined}
                                >
                                    {/* Whole-character motion — one translate around the whole image
                                        stack (ghost included), mirroring the runtime's inner wrapper. */}
                                    <div className="absolute inset-0" style={preview.motion ? {
                                        transform: `translate(${preview.motion.dx.toFixed(2)}%, ${preview.motion.dy.toFixed(2)}%)`,
                                        transition: 'transform 40ms linear',
                                    } : undefined}>
                                    {/* Ghost of the previous frame — what the player just saw. */}
                                    {alignGhost && (
                                        <img src={alignGhost.url} alt="" draggable={false} aria-hidden
                                            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                                            style={{
                                                opacity: 0.35,
                                                filter: 'grayscale(0.6)',
                                                ...(alignGhost.box ? { position: 'absolute', inset: 'auto', objectFit: 'fill', ...layerBoxStyle(alignGhost.box) } : {}),
                                                ...((alignGhost.dx || alignGhost.dy) ? {
                                                    transform: `translate(${((alignGhost.dx / (alignGhost.box?.width || 100)) * 100).toFixed(2)}%, ${((alignGhost.dy / (alignGhost.box?.height || 100)) * 100).toFixed(2)}%) ${layerBoxTransform(alignGhost.box)}`.trim(),
                                                } : {}),
                                            }} />
                                    )}
                                    {preview.imageUrls.map((url, i) => {
                                        const base: React.CSSProperties = preview.imageBoxes[i]
                                            ? { position: 'absolute', inset: 'auto', objectFit: 'fill', ...layerBoxStyle(preview.imageBoxes[i]) }
                                            : {};
                                        // Spin/Tilt + Squash/Stretch + move/pivot preview — same
                                        // composition rule as the stage: move (frame-% → element-%),
                                        // authored box transform, then rotate then scale about the
                                        // track's pivot (scale innermost = local-axes squash).
                                        const lid = preview.imageLayerIds?.[i];
                                        let a = lid != null ? preview.adjust[lid] : undefined;
                                        // Live drag-to-align: swap the edited key's STORED nudge for the
                                        // in-flight one on its layer (project data updates on release).
                                        if (liveNudge && editedKey && lid === editedLayerId) {
                                            const b = a ?? { dx: 0, dy: 0, pivotX: 50, pivotY: 50 };
                                            a = { ...b, dx: b.dx - (editedKey.dx ?? 0) + liveNudge.dx, dy: b.dy - (editedKey.dy ?? 0) + liveNudge.dy };
                                        }
                                        if (a) {
                                            const box = preview.imageBoxes[i];
                                            const bw = box?.width || 100;
                                            const bh = box?.height || 100;
                                            const pre = (a.dx || a.dy) ? `translate(${((a.dx / bw) * 100).toFixed(2)}%, ${((a.dy / bh) * 100).toFixed(2)}%) ` : '';
                                            const rot = (a.deg !== undefined && a.deg !== 0) ? `rotate(${a.deg.toFixed(2)}deg) ` : '';
                                            const scl = (a.sx !== undefined && (a.sx !== 1 || a.sy !== 1)) ? `scale(${(a.sx ?? 1).toFixed(3)}, ${(a.sy ?? 1).toFixed(3)})` : '';
                                            const boxTf = layerBoxTransform(box);
                                            if (pre || rot || scl) base.transform = `${pre}${boxTf ? boxTf + ' ' : ''}${rot}${scl}`.trim();
                                            if (a.pivotX !== 50 || a.pivotY !== 50) base.transformOrigin = `${a.pivotX}% ${a.pivotY}%`;
                                        }
                                        return (
                                            <img key={`${i}-${url}`} src={url} alt="" draggable={false}
                                                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                                                style={Object.keys(base).length ? base : undefined} />
                                        );
                                    })}
                                    </div>
                                    {/* ⌖ pivot marker while a turn/size/pivot editor is open. */}
                                    {pivotMarker && (
                                        <div className="absolute pointer-events-none" style={{ left: `${pivotMarker.left}%`, top: `${pivotMarker.top}%` }}>
                                            <span className="block -translate-x-1/2 -translate-y-1/2 text-amber-300 text-xl font-bold leading-none select-none" style={{ textShadow: '0 0 4px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.8)' }}>⌖</span>
                                        </div>
                                    )}
                                    {/* Plain-words pill while aligning. */}
                                    {editedKey && (
                                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-slate-900/85 text-slate-200 text-[10px] px-2 py-1 rounded-full whitespace-nowrap pointer-events-none">
                                            {t('anim.nudgeDragHint', 'Drag the piece into place — arrow keys for tiny steps')}
                                        </div>
                                    )}
                                    {!editedKey && movPicker && (
                                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-slate-900/85 text-emerald-200 text-[10px] px-2 py-1 rounded-full whitespace-nowrap pointer-events-none">
                                            {t('anim.movDragHint', 'Drag the piece to where it should glide — or use the sliders')}
                                        </div>
                                    )}
                                    {!editedKey && !movPicker && motPicker && (
                                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-slate-900/85 text-fuchsia-200 text-[10px] px-2 py-1 rounded-full whitespace-nowrap pointer-events-none">
                                            {t('anim.motDragHint', 'Drag the character to where it should move — or use the sliders')}
                                        </div>
                                    )}
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
                                    {/* Whole-character motion lane — ONE row for the entire sprite
                                        (every layer moves together, base-image characters included).
                                        Tweened keys, % of the character frame; the sprite's real
                                        stage position never changes. */}
                                    <div className="flex items-stretch border-t border-[var(--border-subtle)]/50">
                                        <div className="w-44 flex-shrink-0 flex items-center justify-between gap-1 px-2 py-1">
                                            <span className="text-[11px] font-semibold text-fuchsia-300/90 flex items-center gap-1" title={t('anim.motLaneTip', 'This strip moves the WHOLE character — every piece together. Click it to add a movement key; the character slides smoothly between keys. Great for hops, leans, walks in place and full-body bobs. Their real spot on stage never changes.')}>
                                                <span className="text-sm">⇱</span> {t('anim.motLane', 'Move whole character')}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                {laneCopyBtn('motion', anim.motionKeys)}
                                                {lanePasteBtn('motion', -1)}
                                            </span>
                                        </div>
                                        <div
                                            ref={motLaneRef}
                                            className="relative h-12 bg-fuchsia-500/5 cursor-copy border-l border-[var(--border-subtle)]/30"
                                            style={{ width: timelineWidth }}
                                            data-testid="anim-motlane"
                                            title={t('anim.motLaneTip', 'This strip moves the WHOLE character — every piece together. Click it to add a movement key; the character slides smoothly between keys. Great for hops, leans, walks in place and full-body bobs. Their real spot on stage never changes.')}
                                            onClick={e => {
                                                if ((e.target as HTMLElement).closest('[data-motchip]')) return;
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const ms = snapTo((e.clientX - rect.left) / pxPerMs, snapMs, duration);
                                                // Seed with the CURRENT interpolated motion at that time, so
                                                // inserting a key mid-motion doesn't jerk the curve.
                                                const cur = anim ? characterMotionAt(anim, ms) : null;
                                                closeEditors();
                                                setPlaying(false);
                                                setTimeMs(ms);
                                                setMotPicker({ atMs: ms, dx: Math.round((cur?.dx ?? 0) * 10) / 10, dy: Math.round((cur?.dy ?? 0) * 10) / 10 });
                                            }}
                                        >
                                            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-sm text-fuchsia-300/60 pointer-events-none">⇱</span>
                                            {(anim.motionKeys || []).map((mk, ki) => {
                                                const at = motDrag && motDrag.keyIndex === ki ? motDrag.atMs : mk.atMs;
                                                return (
                                                    <div key={ki} data-motchip
                                                        className="absolute top-1 h-10 min-w-16 px-2 -ml-8 rounded-lg border-2 border-fuchsia-400/80 bg-[var(--bg-secondary)] text-fuchsia-300 text-xs font-bold shadow cursor-grab active:cursor-grabbing flex items-center justify-center gap-0.5 tabular-nums"
                                                        style={{ left: Math.max(32, Math.min(at * pxPerMs, timelineWidth - 32)) }}
                                                        title={`${at} ms — ${mk.dx ?? 0}, ${mk.dy ?? 0}%`}
                                                        onPointerDown={e => {
                                                            e.preventDefault(); e.stopPropagation();
                                                            motDragMovedRef.current = false;
                                                            motDragAtMsRef.current = mk.atMs;
                                                            setMotDrag({ keyIndex: ki, atMs: mk.atMs });
                                                        }}
                                                    >
                                                        {mk.dx ?? 0},{mk.dy ?? 0}%
                                                    </div>
                                                );
                                            })}
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
                                                        {laneCopyBtn('frames', track.keys, track.layerId)}
                                                        {lanePasteBtn('frames', ti, track.layerId)}
                                                        <button onClick={() => setTrack(ti, null)} className="p-0.5 text-red-500 hover:text-red-400" title={t('anim.removeTrack', 'Remove this row')}>
                                                            <XMarkIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="text-[11px] font-semibold text-amber-300/90 flex items-center gap-1" title={t('anim.rotLaneTip', 'The thin strip is the Spin/Tilt lane — click it to add a rotation key. The piece turns smoothly between keys, around the middle of its box, and never moves its real position.')}>
                                                            <span className="text-sm">↻</span> {t('anim.rotLane', 'Spin / Tilt')}
                                                        </span>
                                                        {laneCopyBtn('rot', track.rotationKeys)}
                                                        {lanePasteBtn('rot', ti)}
                                                        <button
                                                            onClick={() => { closeEditors(); setAdjPicker(ti); }}
                                                            className={`flex-shrink-0 w-9 h-8 flex items-center justify-center gap-0.5 rounded-md border-2 text-base font-bold ${(track.offsetX || track.offsetY || (track.pivotX != null && track.pivotX !== 50) || (track.pivotY != null && track.pivotY !== 50)) ? 'border-amber-400/80 text-amber-300 bg-amber-500/10' : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-tertiary)]'}`}
                                                            title={t('anim.adjustOpen', 'Move & pivot — move this piece while the animation plays, and choose the point it spins around')}
                                                        >
                                                            ⌖
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="text-[11px] font-semibold text-cyan-300/90 flex items-center gap-1" title={t('anim.sclLaneTip', 'The lower strip is the Squash/Stretch lane — click it to add a size key. Width and height can differ, so the piece can squash flat or stretch tall. It sizes smoothly between keys, around the same pivot point as the spin.')}>
                                                            <span className="text-sm">⇕</span> {t('anim.sclLane', 'Squash / Stretch')}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            {laneCopyBtn('scl', track.scaleKeys)}
                                                            {lanePasteBtn('scl', ti)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="text-[11px] font-semibold text-emerald-300/90 flex items-center gap-1" title={t('anim.movLaneTip', 'The bottom strip is the Glide lane — click it to add a movement key. The piece slides SMOOTHLY between keys (unlike frame nudges, which snap with their frame). Great for sways, bobs and drifts.')}>
                                                            <span className="text-sm">⇄</span> {t('anim.movLane', 'Glide (smooth move)')}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            {laneCopyBtn('mov', track.moveKeys)}
                                                            {lanePasteBtn('mov', ti)}
                                                        </span>
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
                                                        closeEditors();
                                                        setPlaying(false);
                                                        setTimeMs(ms);
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
                                                                title={`${at} ms — ${key.assetId ? (character.layers?.[track.layerId]?.assets?.[key.assetId]?.name ?? key.assetId) : t('anim.keyHidden', '(hidden)')}${(key.dx || key.dy) ? ` · ${t('anim.nudgeShort', 'nudged')} ${key.dx ?? 0}, ${key.dy ?? 0}%` : ''}`}
                                                                onPointerDown={e => {
                                                                    e.preventDefault(); e.stopPropagation();
                                                                    dragMovedRef.current = false;
                                                                    dragAtMsRef.current = key.atMs;
                                                                    setDrag({ trackIndex: ti, keyIndex: ki, atMs: key.atMs });
                                                                }}
                                                            >
                                                                {thumb ? <img src={thumb} alt="" className="w-full h-full object-contain pointer-events-none" draggable={false} />
                                                                    : <span className="text-[10px] text-[var(--text-muted)]">∅</span>}
                                                                {(key.dx || key.dy) ? (
                                                                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent-cyan)] text-slate-900 text-[9px] font-bold flex items-center justify-center pointer-events-none">⊹</span>
                                                                ) : null}
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
                                                        closeEditors();
                                                        setPlaying(false);
                                                        setTimeMs(ms);
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
                                                {/* Squash & Stretch lane — size keys (width × height %). Non-uniform
                                                    on purpose: 120×80 squashes, 85×115 stretches. Sizes smoothly
                                                    between keys around the track's Move & pivot point. */}
                                                <div
                                                    ref={el => { if (el) sclLaneRefs.current.set(ti, el); else sclLaneRefs.current.delete(ti); }}
                                                    className="relative h-12 bg-cyan-500/5 cursor-copy border-t border-dashed border-cyan-400/30"
                                                    style={{ width: timelineWidth }}
                                                    data-testid={`anim-scllane-${ti}`}
                                                    title={t('anim.sclLaneTip', 'The lower strip is the Squash/Stretch lane — click it to add a size key. Width and height can differ, so the piece can squash flat or stretch tall. It sizes smoothly between keys, around the same pivot point as the spin.')}
                                                    onClick={e => {
                                                        if ((e.target as HTMLElement).closest('[data-sclchip]')) return;
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        const ms = snapTo((e.clientX - rect.left) / pxPerMs, snapMs, duration);
                                                        // Seed with the CURRENT interpolated size at that time, so
                                                        // inserting a key mid-motion doesn't jerk the curve.
                                                        const cur = anim ? layerAdjustAt(anim, ms)[track.layerId] : undefined;
                                                        closeEditors();
                                                        setPlaying(false);
                                                        setTimeMs(ms);
                                                        setSclPicker({ trackIndex: ti, atMs: ms, sx: Math.round((cur?.sx ?? 1) * 100) / 100, sy: Math.round((cur?.sy ?? 1) * 100) / 100 });
                                                    }}
                                                >
                                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-sm text-cyan-300/60 pointer-events-none">⇕</span>
                                                    {(track.scaleKeys || []).map((sk, ki) => {
                                                        const at = sclDrag && sclDrag.trackIndex === ti && sclDrag.keyIndex === ki ? sclDrag.atMs : sk.atMs;
                                                        return (
                                                            <div key={ki} data-sclchip
                                                                className="absolute top-1 h-10 min-w-16 px-2 -ml-8 rounded-lg border-2 border-cyan-400/80 bg-[var(--bg-secondary)] text-cyan-300 text-xs font-bold shadow cursor-grab active:cursor-grabbing flex items-center justify-center gap-0.5 tabular-nums"
                                                                // Clamp inside the lane like every other chip (-ml-8 = 32px).
                                                                style={{ left: Math.max(32, Math.min(at * pxPerMs, timelineWidth - 32)) }}
                                                                title={`${at} ms — ${Math.round((sk.sx ?? 1) * 100)}% × ${Math.round((sk.sy ?? 1) * 100)}%`}
                                                                onPointerDown={e => {
                                                                    e.preventDefault(); e.stopPropagation();
                                                                    sclDragMovedRef.current = false;
                                                                    sclDragAtMsRef.current = sk.atMs;
                                                                    setSclDrag({ trackIndex: ti, keyIndex: ki, atMs: sk.atMs });
                                                                }}
                                                            >
                                                                {Math.round((sk.sx ?? 1) * 100)}×{Math.round((sk.sy ?? 1) * 100)}%
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {/* Glide lane — TWEENED movement keys. The piece slides smoothly
                                                    between them (frame nudges snap; this one flows). */}
                                                <div
                                                    ref={el => { if (el) movLaneRefs.current.set(ti, el); else movLaneRefs.current.delete(ti); }}
                                                    className="relative h-12 bg-emerald-500/5 cursor-copy border-t border-dashed border-emerald-400/30"
                                                    style={{ width: timelineWidth }}
                                                    data-testid={`anim-movlane-${ti}`}
                                                    title={t('anim.movLaneTip', 'The bottom strip is the Glide lane — click it to add a movement key. The piece slides SMOOTHLY between keys (unlike frame nudges, which snap with their frame). Great for sways, bobs and drifts.')}
                                                    onClick={e => {
                                                        if ((e.target as HTMLElement).closest('[data-movchip]')) return;
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        const ms = snapTo((e.clientX - rect.left) / pxPerMs, snapMs, duration);
                                                        // Seed with the CURRENT glide at that time (minus static offset
                                                        // and frame nudge — this lane owns only the tweened part).
                                                        const keys = track.moveKeys || [];
                                                        let seedDx = 0, seedDy = 0;
                                                        if (keys.length && anim) {
                                                            const withOnlyGlide = { ...anim, tracks: [{ layerId: track.layerId, keys: [], moveKeys: keys }] } as any;
                                                            const cur = layerAdjustAt(withOnlyGlide, ms)[track.layerId];
                                                            seedDx = Math.round((cur?.dx ?? 0) * 10) / 10;
                                                            seedDy = Math.round((cur?.dy ?? 0) * 10) / 10;
                                                        }
                                                        closeEditors();
                                                        setPlaying(false);
                                                        setTimeMs(ms);
                                                        setMovPicker({ trackIndex: ti, atMs: ms, dx: seedDx, dy: seedDy });
                                                    }}
                                                >
                                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-sm text-emerald-300/60 pointer-events-none">⇄</span>
                                                    {(track.moveKeys || []).map((mk, ki) => {
                                                        const at = movDrag && movDrag.trackIndex === ti && movDrag.keyIndex === ki ? movDrag.atMs : mk.atMs;
                                                        return (
                                                            <div key={ki} data-movchip
                                                                className="absolute top-1 h-10 min-w-16 px-2 -ml-8 rounded-lg border-2 border-emerald-400/80 bg-[var(--bg-secondary)] text-emerald-300 text-xs font-bold shadow cursor-grab active:cursor-grabbing flex items-center justify-center gap-0.5 tabular-nums"
                                                                style={{ left: Math.max(32, Math.min(at * pxPerMs, timelineWidth - 32)) }}
                                                                title={`${at} ms — ${mk.dx ?? 0}, ${mk.dy ?? 0}%`}
                                                                onPointerDown={e => {
                                                                    e.preventDefault(); e.stopPropagation();
                                                                    movDragMovedRef.current = false;
                                                                    movDragAtMsRef.current = mk.atMs;
                                                                    setMovDrag({ trackIndex: ti, keyIndex: ki, atMs: mk.atMs });
                                                                }}
                                                            >
                                                                {mk.dx ?? 0},{mk.dy ?? 0}%
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
                    <div className="fixed inset-y-0 right-4 z-[10001] flex items-center pointer-events-none">
                        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 w-96 max-h-[85vh] overflow-y-auto shadow-2xl pointer-events-auto">
                            <p className="text-sm font-bold text-white mb-0.5">⌖ {t('anim.adjustTitle', 'Move & pivot')}{layerName ? ` — ${layerName}` : ''}</p>
                            <p className="text-[11px] text-[var(--text-muted)] mb-3">{t('anim.adjustHint', 'Only while this animation plays — the layer’s real position never changes. Press ▶ to watch it live while you adjust.')}</p>

                            <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('anim.adjustMove', 'Move the piece while it plays')}</p>
                            <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                                {t('anim.adjustX', 'Sideways (%)')}
                                <div className="flex items-center gap-2 mt-0.5">
                                    <input type="range" min={-50} max={50} step={0.5} value={Math.max(-50, Math.min(50, track.offsetX ?? 0))}
                                        onChange={e => { const n = parseFloat(e.target.value); setTrackAdjust(adjPicker, { offsetX: Number.isFinite(n) ? n : 0 }); }}
                                        className="flex-1 accent-amber-400" />
                                    <input type="number" step="0.5" value={track.offsetX ?? 0}
                                        onChange={e => { const n = parseFloat(e.target.value); setTrackAdjust(adjPicker, { offsetX: Number.isFinite(n) ? n : 0 }); }}
                                        className={`${inputCls} w-16 text-sm p-1.5`} />
                                </div>
                            </label>
                            <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                                {t('anim.adjustY', 'Up / down (%)')}
                                <div className="flex items-center gap-2 mt-0.5">
                                    <input type="range" min={-50} max={50} step={0.5} value={Math.max(-50, Math.min(50, track.offsetY ?? 0))}
                                        onChange={e => { const n = parseFloat(e.target.value); setTrackAdjust(adjPicker, { offsetY: Number.isFinite(n) ? n : 0 }); }}
                                        className="flex-1 accent-amber-400" />
                                    <input type="number" step="0.5" value={track.offsetY ?? 0}
                                        onChange={e => { const n = parseFloat(e.target.value); setTrackAdjust(adjPicker, { offsetY: Number.isFinite(n) ? n : 0 }); }}
                                        className={`${inputCls} w-16 text-sm p-1.5`} />
                                </div>
                            </label>
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
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <input type="range" min={0} max={100} step={1} value={px}
                                                onChange={e => { const n = parseFloat(e.target.value); setTrackAdjust(adjPicker, { pivotX: Number.isFinite(n) ? n : 50 }); }}
                                                className="flex-1 accent-amber-400" />
                                            <input type="number" step="5" min="0" max="100" value={px}
                                                onChange={e => { const n = parseFloat(e.target.value); setTrackAdjust(adjPicker, { pivotX: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50 }); }}
                                                className={`${inputCls} w-14 text-sm p-1.5`} />
                                        </div>
                                    </label>
                                    <label className="block text-[11px] text-[var(--text-muted)]">
                                        {t('anim.adjustPivotY', 'Down (%)')}
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <input type="range" min={0} max={100} step={1} value={py}
                                                onChange={e => { const n = parseFloat(e.target.value); setTrackAdjust(adjPicker, { pivotY: Number.isFinite(n) ? n : 50 }); }}
                                                className="flex-1 accent-amber-400" />
                                            <input type="number" step="5" min="0" max="100" value={py}
                                                onChange={e => { const n = parseFloat(e.target.value); setTrackAdjust(adjPicker, { pivotY: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50 }); }}
                                                className={`${inputCls} w-14 text-sm p-1.5`} />
                                        </div>
                                    </label>
                                </div>
                            </div>
                            <p className="text-[10px] text-amber-300/80 mb-3">{t('anim.pivotShown', 'The ⌖ mark on the preview is the point the piece turns and sizes around.')}</p>

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

            {/* ── Glide key editor ── */}
            {movPicker && anim && (
                <div className="fixed inset-y-0 right-4 z-[10001] flex items-center pointer-events-none">
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-3 w-80 max-h-[85vh] overflow-y-auto shadow-2xl pointer-events-auto">
                        <p className="text-xs font-bold text-white mb-1">
                            {movPicker.keyIndex != null
                                ? t('anim.movChange', 'Change the glide at {{ms}} ms', { ms: movPicker.atMs })
                                : t('anim.movAdd', 'Add a glide key at {{ms}} ms', { ms: movPicker.atMs })}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('anim.movHint', 'The piece slides smoothly to this position (percent of the character frame; negative = left/up). Unlike a frame nudge, this FLOWS between keys — perfect for sways and bobs. The layer’s real position never changes.')}</p>
                        <p className="text-[10px] text-emerald-300/80 mb-2">{t('anim.liveHint', 'The preview follows as you slide — press ▶ to watch the whole motion with this change.')}</p>
                        <label className="block text-[10px] text-[var(--text-muted)] mb-1">
                            {t('anim.adjustX', 'Sideways (%)')}
                            <div className="flex items-center gap-2 mt-0.5">
                                <input type="range" min={-50} max={50} step={0.5} value={Math.max(-50, Math.min(50, movPicker.dx))}
                                    onChange={e => { const n = parseFloat(e.target.value); setMovPicker(p => p ? { ...p, dx: Number.isFinite(n) ? n : 0 } : p); }}
                                    className="flex-1 accent-emerald-400" />
                                <input type="number" step="0.5" value={movPicker.dx}
                                    onChange={e => { const n = parseFloat(e.target.value); setMovPicker(p => p ? { ...p, dx: Number.isFinite(n) ? n : 0 } : p); }}
                                    className={`${inputCls} w-16`} />
                            </div>
                        </label>
                        <label className="block text-[10px] text-[var(--text-muted)]">
                            {t('anim.adjustY', 'Up / down (%)')}
                            <div className="flex items-center gap-2 mt-0.5">
                                <input type="range" min={-50} max={50} step={0.5} value={Math.max(-50, Math.min(50, movPicker.dy))}
                                    onChange={e => { const n = parseFloat(e.target.value); setMovPicker(p => p ? { ...p, dy: Number.isFinite(n) ? n : 0 } : p); }}
                                    className="flex-1 accent-emerald-400" />
                                <input type="number" step="0.5" value={movPicker.dy}
                                    onChange={e => { const n = parseFloat(e.target.value); setMovPicker(p => p ? { ...p, dy: Number.isFinite(n) ? n : 0 } : p); }}
                                    className={`${inputCls} w-16`} />
                            </div>
                        </label>
                        <div className="flex justify-between items-center mt-3">
                            {movPicker.keyIndex != null ? (
                                <button onClick={() => {
                                    const track = anim.tracks[movPicker.trackIndex];
                                    if (track) setMovKeys(movPicker.trackIndex, (track.moveKeys || []).filter((_, j) => j !== movPicker.keyIndex));
                                    setMovPicker(null);
                                }} className="text-red-500 hover:text-red-400 text-xs flex items-center gap-1">
                                    <TrashIcon className="w-3.5 h-3.5" />{t('anim.movRemove', 'Remove this glide key')}
                                </button>
                            ) : <span />}
                            <div className="flex gap-2">
                                <button onClick={() => setMovPicker(null)} className="text-xs text-[var(--text-muted)] hover:text-white">{t('anim.cancel', 'Cancel')}</button>
                                <button onClick={() => {
                                    const track = anim.tracks[movPicker.trackIndex];
                                    if (track) {
                                        const keys = [...(track.moveKeys || [])];
                                        const entry = { atMs: movPicker.atMs, dx: movPicker.dx, dy: movPicker.dy };
                                        if (movPicker.keyIndex != null) keys[movPicker.keyIndex] = entry;
                                        else keys.push(entry);
                                        setMovKeys(movPicker.trackIndex, keys);
                                    }
                                    setMovPicker(null);
                                }} className="text-xs font-semibold px-2.5 py-1 rounded bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/25">{t('anim.rotSave', 'Save')}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Whole-character motion key editor ── */}
            {motPicker && anim && (
                <div className="fixed inset-y-0 right-4 z-[10001] flex items-center pointer-events-none">
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-3 w-80 max-h-[85vh] overflow-y-auto shadow-2xl pointer-events-auto">
                        <p className="text-xs font-bold text-white mb-1">
                            {motPicker.keyIndex != null
                                ? t('anim.motChange', 'Change the whole-character move at {{ms}} ms', { ms: motPicker.atMs })
                                : t('anim.motAdd', 'Add a whole-character move at {{ms}} ms', { ms: motPicker.atMs })}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('anim.motHint', 'The WHOLE character slides smoothly to this position — every piece together (percent of the character frame; negative = left/up). Great for hops, leans and full-body bobs. Their real spot on stage never changes.')}</p>
                        <p className="text-[10px] text-fuchsia-300/80 mb-2">{t('anim.liveHint', 'The preview follows as you slide — press ▶ to watch the whole motion with this change.')}</p>
                        <label className="block text-[10px] text-[var(--text-muted)] mb-1">
                            {t('anim.adjustX', 'Sideways (%)')}
                            <div className="flex items-center gap-2 mt-0.5">
                                <input type="range" min={-50} max={50} step={0.5} value={Math.max(-50, Math.min(50, motPicker.dx))}
                                    onChange={e => { const n = parseFloat(e.target.value); setMotPicker(p => p ? { ...p, dx: Number.isFinite(n) ? n : 0 } : p); }}
                                    className="flex-1 accent-fuchsia-400" />
                                <input type="number" step="0.5" value={motPicker.dx}
                                    onChange={e => { const n = parseFloat(e.target.value); setMotPicker(p => p ? { ...p, dx: Number.isFinite(n) ? n : 0 } : p); }}
                                    className={`${inputCls} w-16`} />
                            </div>
                        </label>
                        <label className="block text-[10px] text-[var(--text-muted)]">
                            {t('anim.adjustY', 'Up / down (%)')}
                            <div className="flex items-center gap-2 mt-0.5">
                                <input type="range" min={-50} max={50} step={0.5} value={Math.max(-50, Math.min(50, motPicker.dy))}
                                    onChange={e => { const n = parseFloat(e.target.value); setMotPicker(p => p ? { ...p, dy: Number.isFinite(n) ? n : 0 } : p); }}
                                    className="flex-1 accent-fuchsia-400" />
                                <input type="number" step="0.5" value={motPicker.dy}
                                    onChange={e => { const n = parseFloat(e.target.value); setMotPicker(p => p ? { ...p, dy: Number.isFinite(n) ? n : 0 } : p); }}
                                    className={`${inputCls} w-16`} />
                            </div>
                        </label>
                        <div className="flex justify-between items-center mt-3">
                            {motPicker.keyIndex != null ? (
                                <button onClick={() => {
                                    setMotKeys((anim.motionKeys || []).filter((_, j) => j !== motPicker.keyIndex));
                                    setMotPicker(null);
                                }} className="text-red-500 hover:text-red-400 text-xs flex items-center gap-1">
                                    <TrashIcon className="w-3.5 h-3.5" />{t('anim.motRemove', 'Remove this move key')}
                                </button>
                            ) : <span />}
                            <div className="flex gap-2">
                                <button onClick={() => setMotPicker(null)} className="text-xs text-[var(--text-muted)] hover:text-white">{t('anim.cancel', 'Cancel')}</button>
                                <button onClick={() => {
                                    const keys = [...(anim.motionKeys || [])];
                                    const entry = { atMs: motPicker.atMs, dx: motPicker.dx, dy: motPicker.dy };
                                    if (motPicker.keyIndex != null) keys[motPicker.keyIndex] = entry;
                                    else keys.push(entry);
                                    setMotKeys(keys);
                                    setMotPicker(null);
                                }} className="text-xs font-semibold px-2.5 py-1 rounded bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/25">{t('anim.rotSave', 'Save')}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Squash & Stretch key editor ── */}
            {sclPicker && anim && (
                <div className="fixed inset-y-0 right-4 z-[10001] flex items-center pointer-events-none">
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-3 w-80 max-h-[85vh] overflow-y-auto shadow-2xl pointer-events-auto">
                        <p className="text-xs font-bold text-white mb-1">
                            {sclPicker.keyIndex != null
                                ? t('anim.sclChange', 'Change the size at {{ms}} ms', { ms: sclPicker.atMs })
                                : t('anim.sclAdd', 'Add a size change at {{ms}} ms', { ms: sclPicker.atMs })}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('anim.sclHint', 'The piece sizes smoothly to this width and height. Make them DIFFERENT for a squash (wider + flatter) or a stretch (narrower + taller). It sizes around the same pivot point as the spin (the ⌖ button). The layer’s real size never changes.')}</p>
                        <p className="text-[10px] text-cyan-300/80 mb-2">{t('anim.liveHint', 'The preview follows as you slide — press ▶ to watch the whole motion with this change.')}</p>
                        <label className="block text-[10px] text-[var(--text-muted)] mb-1">
                            {t('anim.sclWidth', 'Width (%)')}
                            <div className="flex items-center gap-2 mt-0.5">
                                <input type="range" min={25} max={250} step={5} value={Math.max(25, Math.min(250, Math.round(sclPicker.sx * 100)))}
                                    onChange={e => { const n = parseFloat(e.target.value); setSclPicker(p => p ? { ...p, sx: Number.isFinite(n) ? n / 100 : 1 } : p); }}
                                    className="flex-1 accent-cyan-400" />
                                <input type="number" step="5" min="5" max="400" value={Math.round(sclPicker.sx * 100)}
                                    onChange={e => { const n = parseFloat(e.target.value); setSclPicker(p => p ? { ...p, sx: Number.isFinite(n) ? Math.max(0.05, Math.min(4, n / 100)) : 1 } : p); }}
                                    className={`${inputCls} w-16`} />
                            </div>
                        </label>
                        <label className="block text-[10px] text-[var(--text-muted)]">
                            {t('anim.sclHeight', 'Height (%)')}
                            <div className="flex items-center gap-2 mt-0.5">
                                <input type="range" min={25} max={250} step={5} value={Math.max(25, Math.min(250, Math.round(sclPicker.sy * 100)))}
                                    onChange={e => { const n = parseFloat(e.target.value); setSclPicker(p => p ? { ...p, sy: Number.isFinite(n) ? n / 100 : 1 } : p); }}
                                    className="flex-1 accent-cyan-400" />
                                <input type="number" step="5" min="5" max="400" value={Math.round(sclPicker.sy * 100)}
                                    onChange={e => { const n = parseFloat(e.target.value); setSclPicker(p => p ? { ...p, sy: Number.isFinite(n) ? Math.max(0.05, Math.min(4, n / 100)) : 1 } : p); }}
                                    className={`${inputCls} w-16`} />
                            </div>
                        </label>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {([
                                [t('anim.sclPresetNormal', 'Normal'), 1, 1],
                                [t('anim.sclPresetSquash', 'Squash'), 1.2, 0.8],
                                [t('anim.sclPresetStretch', 'Stretch'), 0.85, 1.15],
                                ['125%', 1.25, 1.25],
                                ['80%', 0.8, 0.8],
                            ] as Array<[string, number, number]>).map(([label, sx, sy]) => (
                                <button key={label} onClick={() => setSclPicker(p => p ? { ...p, sx, sy } : p)}
                                    className="px-1.5 py-0.5 rounded border border-[var(--border-default)] text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-white">{label}</button>
                            ))}
                        </div>
                        <div className="flex justify-between items-center mt-3">
                            {sclPicker.keyIndex != null ? (
                                <button onClick={() => {
                                    const track = anim.tracks[sclPicker.trackIndex];
                                    if (track) setSclKeys(sclPicker.trackIndex, (track.scaleKeys || []).filter((_, j) => j !== sclPicker.keyIndex));
                                    setSclPicker(null);
                                }} className="text-red-500 hover:text-red-400 text-xs flex items-center gap-1">
                                    <TrashIcon className="w-3.5 h-3.5" />{t('anim.sclRemove', 'Remove this size change')}
                                </button>
                            ) : <span />}
                            <div className="flex gap-2">
                                <button onClick={() => setSclPicker(null)} className="text-xs text-[var(--text-muted)] hover:text-white">{t('anim.cancel', 'Cancel')}</button>
                                <button onClick={() => {
                                    const track = anim.tracks[sclPicker.trackIndex];
                                    if (track) {
                                        const keys = [...(track.scaleKeys || [])];
                                        const entry = { atMs: sclPicker.atMs, sx: sclPicker.sx, sy: sclPicker.sy };
                                        if (sclPicker.keyIndex != null) keys[sclPicker.keyIndex] = entry;
                                        else keys.push(entry);
                                        setSclKeys(sclPicker.trackIndex, keys);
                                    }
                                    setSclPicker(null);
                                }} className="text-xs font-semibold px-2.5 py-1 rounded bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/25">{t('anim.rotSave', 'Save')}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Spin/Tilt key editor ── */}
            {rotPicker && anim && (
                <div className="fixed inset-y-0 right-4 z-[10001] flex items-center pointer-events-none">
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-3 w-80 max-h-[85vh] overflow-y-auto shadow-2xl pointer-events-auto">
                        <p className="text-xs font-bold text-white mb-1">
                            {rotPicker.keyIndex != null
                                ? t('anim.rotChange', 'Change the turn at {{ms}} ms', { ms: rotPicker.atMs })
                                : t('anim.rotAdd', 'Add a turn at {{ms}} ms', { ms: rotPicker.atMs })}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('anim.rotHint', 'The piece turns smoothly to this angle, spinning around the middle of its box. 360 = one full spin. Its real position never changes.')}</p>
                        <p className="text-[10px] text-amber-300/80 mb-2">{t('anim.liveHint', 'The preview follows as you slide — press ▶ to watch the whole motion with this change.')} {t('anim.pivotShown', 'The ⌖ mark on the preview is the point the piece turns and sizes around.')}</p>
                        <label className="block text-[10px] text-[var(--text-muted)]">
                            {t('anim.rotDegrees', 'Angle (degrees)')}
                            <div className="flex items-center gap-2 mt-0.5">
                                <input type="range" min={-180} max={180} step={1} value={Math.max(-180, Math.min(180, rotPicker.deg))}
                                    onChange={e => { const n = parseFloat(e.target.value); setRotPicker(p => p ? { ...p, deg: Number.isFinite(n) ? n : 0 } : p); }}
                                    className="flex-1 accent-amber-400" />
                                <input type="number" step="5" value={rotPicker.deg}
                                    onChange={e => { const n = parseFloat(e.target.value); setRotPicker(p => p ? { ...p, deg: Number.isFinite(n) ? n : 0 } : p); }}
                                    className={`${inputCls} w-16`} />
                                <span className="text-sm font-bold text-amber-300 tabular-nums">°</span>
                            </div>
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

            {/* ── Frame picker / editor ──
                ADD mode: centered modal with backdrop (choose art, done).
                EDIT mode: DOCKED side panel with NO backdrop — the preview stays live, so the
                author drags the piece into place while this panel shows the numbers. */}
            {picker && anim && (() => {
                const editing = picker.keyIndex != null;
                const body = (
                    <div className={`bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-3 w-80 max-h-[70vh] overflow-y-auto ${editing ? 'shadow-2xl pointer-events-auto' : ''}`} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-white">
                                {editing
                                    ? t('anim.pickChange', 'Change this frame ({{ms}} ms)', { ms: picker.atMs })
                                    : t('anim.pickAdd', 'Add a frame change at {{ms}} ms', { ms: picker.atMs })}
                            </p>
                            {editing && (
                                <button onClick={() => setPicker(null)} className="p-0.5 text-[var(--text-muted)] hover:text-white" title={t('anim.done', 'Done')}>
                                    <XMarkIcon className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        {editing && (
                            <div className="mb-2 p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]/50">
                                <p className="text-[10px] font-semibold text-[var(--text-secondary)] mb-1">{t('anim.nudgeLabel', 'Nudge this frame (%)')}</p>
                                <p className="text-[10px] text-[var(--text-muted)] mb-1.5">{t('anim.nudgeHint', 'Lines this frame up with the others — drag the piece in the preview, or type. The faded copy is the previous frame. Only this animation moves; the layer itself stays put.')}</p>
                                <label className="block text-[10px] text-[var(--text-muted)] mb-1">
                                    {t('anim.adjustX', 'Sideways (%)')}
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <input type="range" min={-50} max={50} step={0.5}
                                            value={Math.max(-50, Math.min(50, liveNudge ? liveNudge.dx : (editedKey?.dx ?? 0)))}
                                            onChange={e => { const n = parseFloat(e.target.value); slideNudge(Number.isFinite(n) ? n : 0, liveNudgeRef.current?.dy ?? (editedKey?.dy ?? 0)); }}
                                            onPointerUp={commitSlideNudge} onKeyUp={commitSlideNudge} onBlur={commitSlideNudge}
                                            className="flex-1 accent-[var(--accent-cyan)]" />
                                        <input type="number" step="0.5" value={liveNudge ? Math.round(liveNudge.dx * 10) / 10 : (editedKey?.dx ?? 0)}
                                            onChange={e => { const n = parseFloat(e.target.value); if (picker.keyIndex != null) setKeyNudge(picker.trackIndex, picker.keyIndex, Number.isFinite(n) ? n : 0, editedKey?.dy ?? 0); }}
                                            className={`${inputCls} w-16`} />
                                    </div>
                                </label>
                                <label className="block text-[10px] text-[var(--text-muted)]">
                                    {t('anim.adjustY', 'Up / down (%)')}
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <input type="range" min={-50} max={50} step={0.5}
                                            value={Math.max(-50, Math.min(50, liveNudge ? liveNudge.dy : (editedKey?.dy ?? 0)))}
                                            onChange={e => { const n = parseFloat(e.target.value); slideNudge(liveNudgeRef.current?.dx ?? (editedKey?.dx ?? 0), Number.isFinite(n) ? n : 0); }}
                                            onPointerUp={commitSlideNudge} onKeyUp={commitSlideNudge} onBlur={commitSlideNudge}
                                            className="flex-1 accent-[var(--accent-cyan)]" />
                                        <input type="number" step="0.5" value={liveNudge ? Math.round(liveNudge.dy * 10) / 10 : (editedKey?.dy ?? 0)}
                                            onChange={e => { const n = parseFloat(e.target.value); if (picker.keyIndex != null) setKeyNudge(picker.trackIndex, picker.keyIndex, editedKey?.dx ?? 0, Number.isFinite(n) ? n : 0); }}
                                            className={`${inputCls} w-16`} />
                                    </div>
                                </label>
                            </div>
                        )}
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
                            {editing ? (
                                <button onClick={deletePickedKey} className="text-red-500 hover:text-red-400 text-xs flex items-center gap-1">
                                    <TrashIcon className="w-3.5 h-3.5" />{t('anim.removeKey', 'Remove this frame change')}
                                </button>
                            ) : <span />}
                            <button onClick={() => setPicker(null)} className="text-xs text-[var(--text-muted)] hover:text-white">
                                {editing ? t('anim.done', 'Done') : t('anim.cancel', 'Cancel')}
                            </button>
                        </div>
                    </div>
                );
                return editing ? (
                    // Docked, backdrop-free: the rest of the studio (especially the preview) stays interactive.
                    <div className="fixed inset-y-0 right-4 z-[10001] flex items-center pointer-events-none">
                        {body}
                    </div>
                ) : (
                    <div className="fixed inset-0 z-[10001] bg-black/50 flex items-center justify-center p-6" onMouseDown={e => { if (e.target === e.currentTarget) setPicker(null); }}>
                        {body}
                    </div>
                );
            })()}
        </div>
    );
};

export default AnimationStudio;
