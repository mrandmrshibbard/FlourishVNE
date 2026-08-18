/**
 * Animation clipboard — module-scoped singleton shared by every Animation Studio instance.
 * The Studio unmounts between characters (one modal at a time), so a component-local
 * clipboard could never paste across characters; module scope survives for the session.
 * Deliberately NOT localStorage: a stale cross-session clipboard full of ids that no
 * longer exist would be a footgun.
 *
 * Cross-character remapping: only `track.layerId` and frame-key `assetId` are character-
 * specific, so their human NAMES are snapshotted at copy time and re-matched by name on
 * paste (trim + case-insensitive). Everything else (rotation/scale/glide/motion keys,
 * offsets, pivots, duration/loop/trigger) is pure numbers and copies verbatim.
 */
import { VNID } from '../../types';
import { VNCharacter, VNCharacterAnimation, VNAnimationTrack } from '../../features/character/types';

export type AnimLaneKind = 'frames' | 'rot' | 'scl' | 'mov' | 'motion';

type FrameKey = { atMs: number; assetId: VNID | null; dx?: number; dy?: number };
type MoveLikeKey = { atMs: number; dx: number; dy: number };

export interface AnimClipboardAnimation {
    kind: 'animation';
    sourceCharacterId: VNID;
    /** Deep clone taken at copy time. */
    anim: VNCharacterAnimation;
    /** Name snapshots (the source character may be edited or deleted before paste). */
    layerNames: Record<VNID, string>;
    assetNames: Record<VNID, Record<VNID, string>>;
}

export interface AnimClipboardLane {
    kind: 'lane';
    lane: AnimLaneKind;
    sourceCharacterId: VNID;
    /** frames lane: which layer the keys came from (verbatim paste within the same layer). */
    sourceLayerId?: VNID;
    /** Human label for toasts/buttons ('' for the whole-character motion lane). */
    sourceLayerName: string;
    /** Deep clone of the lane's keys (shape depends on the lane). */
    keys: Array<{ atMs: number } & Record<string, unknown>>;
    /** frames lane only: assetId → name snapshot for cross-character/layer re-match. */
    assetNames?: Record<VNID, string>;
}

export type AnimClipboardEntry = AnimClipboardAnimation | AnimClipboardLane;

let clipboard: AnimClipboardEntry | null = null;
export const setAnimClipboard = (entry: AnimClipboardEntry | null): void => { clipboard = entry; };
export const getAnimClipboard = (): AnimClipboardEntry | null => clipboard;

const deep = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const norm = (s: string): string => s.trim().toLowerCase();

/** mov (per-layer Glide) and motion (whole character) share the {atMs,dx,dy} shape, so a
 *  tuned glide can become whole-body motion and vice versa. Everything else is exact-match. */
export const lanesCompatible = (a: AnimLaneKind, b: AnimLaneKind): boolean =>
    a === b || (['mov', 'motion'].includes(a) && ['mov', 'motion'].includes(b));

/** Snapshot an animation for the clipboard: deep clone + the layer/asset names its tracks
 *  reference (only what the animation touches — the clipboard stays small). */
export function copyAnimationToClipboard(character: VNCharacter, anim: VNCharacterAnimation): AnimClipboardAnimation {
    const layerNames: Record<VNID, string> = {};
    const assetNames: Record<VNID, Record<VNID, string>> = {};
    for (const track of anim.tracks || []) {
        if (!track?.layerId) continue;
        const layer = character.layers?.[track.layerId];
        if (!layer) continue;
        layerNames[track.layerId] = layer.name;
        for (const key of track.keys || []) {
            if (!key?.assetId) continue;
            const asset = layer.assets?.[key.assetId];
            if (!asset) continue;
            (assetNames[track.layerId] ??= {})[key.assetId] = asset.name;
        }
    }
    return { kind: 'animation', sourceCharacterId: character.id, anim: deep(anim), layerNames, assetNames };
}

/** Snapshot one lane's keys. For the frames lane, pass the track's layer so asset names
 *  can be re-matched on a cross-character/cross-layer paste. */
export function copyLaneToClipboard(
    character: VNCharacter,
    lane: AnimLaneKind,
    keys: Array<{ atMs: number } & Record<string, unknown>>,
    layerId?: VNID,
): AnimClipboardLane {
    const layer = layerId ? character.layers?.[layerId] : undefined;
    const assetNames: Record<VNID, string> = {};
    if (lane === 'frames' && layer) {
        for (const key of keys as FrameKey[]) {
            if (!key?.assetId) continue;
            const asset = layer.assets?.[key.assetId];
            if (asset) assetNames[key.assetId] = asset.name;
        }
    }
    return {
        kind: 'lane', lane,
        sourceCharacterId: character.id,
        sourceLayerId: layerId,
        sourceLayerName: layer?.name ?? '',
        keys: deep(keys),
        ...(lane === 'frames' ? { assetNames } : {}),
    };
}

/**
 * Rebuild a copied animation for a target character. Same-character paste keeps every id
 * verbatim (they're valid). Cross-character: layers matched by name (trim, case-insensitive);
 * an unmatched track keeps its keys but gets layerId '' (the Studio's "Pick a layer…" state)
 * with frame assetIds nulled; a matched track re-matches each frame assetId by name (unmatched
 * → null, chip shows ∅ — a key is never silently dropped). Id-free lanes ride verbatim.
 */
export function remapAnimationForCharacter(
    entry: AnimClipboardAnimation,
    target: VNCharacter,
    newId: VNID,
): { animation: VNCharacterAnimation; matchedTracks: number; totalTracks: number } {
    const anim = deep(entry.anim);
    anim.id = newId;
    const withLayer = (anim.tracks || []).filter(tr => tr?.layerId);
    if (target.id === entry.sourceCharacterId) {
        return { animation: anim, matchedTracks: withLayer.length, totalTracks: withLayer.length };
    }
    const layerByName = new Map<string, { id: VNID; assetsByName: Map<string, VNID> }>();
    for (const layer of Object.values(target.layers || {})) {
        const assetsByName = new Map<string, VNID>();
        for (const asset of Object.values(layer.assets || {})) assetsByName.set(norm(asset.name), asset.id);
        layerByName.set(norm(layer.name), { id: layer.id, assetsByName });
    }
    let matched = 0;
    anim.tracks = (anim.tracks || []).map((track: VNAnimationTrack) => {
        if (!track?.layerId) return track;
        const srcName = entry.layerNames[track.layerId];
        const hit = srcName !== undefined ? layerByName.get(norm(srcName)) : undefined;
        if (!hit) {
            // No layer with that name here — keep the keys, let the author pick a layer.
            return { ...track, layerId: '' as VNID, keys: (track.keys || []).map(k => ({ ...k, assetId: null })) };
        }
        matched++;
        const srcAssets = entry.assetNames[track.layerId] || {};
        return {
            ...track,
            layerId: hit.id,
            keys: (track.keys || []).map(k => {
                if (!k?.assetId) return k;
                const name = srcAssets[k.assetId];
                const id = name !== undefined ? hit.assetsByName.get(norm(name)) : undefined;
                return { ...k, assetId: id ?? null };
            }),
        };
    });
    return { animation: anim, matchedTracks: matched, totalTracks: withLayer.length };
}

/**
 * Rebuild copied lane keys for a target row. Only the frames lane holds ids: verbatim when
 * pasting back onto the SAME character's SAME layer, otherwise assetIds re-match by name
 * against the target layer's assets (unmatched → null). Every other lane copies verbatim.
 */
export function remapLaneKeysForLayer(
    entry: AnimClipboardLane,
    target: VNCharacter,
    targetLayerId?: VNID,
): Array<{ atMs: number } & Record<string, unknown>> {
    const keys = deep(entry.keys);
    if (entry.lane !== 'frames') return keys;
    if (target.id === entry.sourceCharacterId && targetLayerId && targetLayerId === entry.sourceLayerId) return keys;
    const layer = targetLayerId ? target.layers?.[targetLayerId] : undefined;
    const assetsByName = new Map<string, VNID>();
    for (const asset of Object.values(layer?.assets || {})) assetsByName.set(norm(asset.name), asset.id);
    return (keys as FrameKey[]).map(k => {
        if (!k?.assetId) return k;
        const name = entry.assetNames?.[k.assetId];
        const id = name !== undefined ? assetsByName.get(norm(name)) : undefined;
        return { ...k, assetId: id ?? null };
    }) as Array<{ atMs: number } & Record<string, unknown>>;
}

/** True when any pasted key sits past the animation's length (it would never play). */
export const keysPastDuration = (keys: Array<{ atMs: number }>, durationMs: number): boolean =>
    keys.some(k => k.atMs > durationMs);

export type { MoveLikeKey };
