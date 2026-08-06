/**
 * Character layout resolvers — THE single source of truth for WHERE a character's layer
 * pieces sit, in WHAT order they stack, and WHICH are hidden, per pose.
 *
 * Contract split with poseArt.ts: poseArt answers "which picture does this piece show in
 * this pose?"; layout.ts answers "where does it sit / what order / is it visible?". Every
 * render surface (engine stage, staging area, CharacterPreview, Customizer, menu previews,
 * character editor, Pose Studio) must resolve through here — never re-derive.
 *
 * Byte-identity rule: a full box (0/0/100/100, no rotation, no flip) is NEVER stored — it
 * normalizes back to `undefined`, which both keeps project JSON byte-identical for projects
 * that never used the Pose Studio and keeps rendering on the legacy full-box path.
 *
 * Pure and React-type-only (CSSProperties) — safe for the engine bundle and unit tests.
 */
import type React from 'react';
import { VNID } from '../../types';
import { VNCharacter, VNCharacterLayer, VNLayerAsset, VNLayerBox } from './types';

const EPS = 0.005; // 2-decimal storage → anything closer than this is "equal"

const near = (a: number, b: number): boolean => Math.abs(a - b) < EPS;

/** Is this (possibly partial) box the whole sprite box with no rotation/flip? */
export function isFullBox(box: VNLayerBox): boolean {
    return near(box.x, 0) && near(box.y, 0) && near(box.width, 100) && near(box.height, 100)
        && !box.rotation && !box.flipH;
}

/**
 * The byte-identity guard: full box → undefined (stored as ABSENCE, not data); otherwise a
 * clean copy with the default subfields (rotation 0 / flipH false) stripped.
 */
export function normalizeLayerBox(box?: VNLayerBox | null): VNLayerBox | undefined {
    if (!box) return undefined;
    if (isFullBox(box)) return undefined;
    const out: VNLayerBox = { x: box.x, y: box.y, width: box.width, height: box.height };
    if (box.rotation) out.rotation = box.rotation;
    if (box.flipH) out.flipH = true;
    return out;
}

/**
 * Where does this piece sit? Most-specific wins:
 *   asset.poseBoxes[pose] → asset.box → layer.poseBoxes[pose] → layer.box → undefined (whole box)
 */
export function resolveLayerBox(
    layer: VNCharacterLayer,
    asset?: VNLayerAsset | null,
    poseId?: VNID | null
): VNLayerBox | undefined {
    if (poseId && asset?.poseBoxes?.[poseId]) return asset.poseBoxes[poseId];
    if (asset?.box) return asset.box;
    if (poseId && layer.poseBoxes?.[poseId]) return layer.poseBoxes[poseId];
    if (layer.box) return layer.box;
    return undefined;
}

/**
 * The layers in stacking order (back → front) for a pose. A pose's `layerOrder` wins,
 * dangling-safe: ids of deleted layers are skipped, layers missing from the list are
 * APPENDED in base order (a newly added layer shows up instead of vanishing). Default
 * pose / no order = the layers Record's key-insertion order (today's behavior).
 * Hidden layers are NOT filtered here — callers that skip them use poseHiddenLayerIds
 * (runtime skips; editors dim instead, so authors can un-hide).
 */
export function layerOrderForPose(
    char: Pick<VNCharacter, 'layers' | 'poses'>,
    poseId?: VNID | null
): VNCharacterLayer[] {
    const base = Object.values(char.layers || {});
    const order = poseId ? char.poses?.[poseId]?.layerOrder : undefined;
    if (!order || order.length === 0) return base;
    const byId = char.layers || {};
    const listed = order.map(id => byId[id]).filter((l): l is VNCharacterLayer => !!l);
    const listedIds = new Set(order);
    const appended = base.filter(l => !listedIds.has(l.id));
    return [...listed, ...appended];
}

/** Layer ids hidden in this pose. Default / unknown pose → empty set. */
export function poseHiddenLayerIds(
    char: Pick<VNCharacter, 'poses'>,
    poseId?: VNID | null
): ReadonlySet<VNID> {
    const hidden = poseId ? char.poses?.[poseId]?.hiddenLayers : undefined;
    return new Set(hidden || []);
}

/**
 * Inline style for a piece's box. `undefined` → `{}` — the caller's existing Tailwind
 * `inset-0 w-full h-full` classes win and rendering is pixel-identical to before. With a
 * box, the inline left/top/width/height override those classes; `object-contain` then
 * letterboxes the art INSIDE the box; rotation/flip pivot at the box center (default
 * transform-origin).
 */
export function layerBoxStyle(box?: VNLayerBox | null): React.CSSProperties {
    if (!box) return {};
    const style: React.CSSProperties = {
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.width}%`,
        height: `${box.height}%`,
    };
    const transform = layerBoxTransform(box);
    if (transform) style.transform = transform;
    return style;
}

/** Just the transform part ("rotate(10deg) scaleX(-1)") — for surfaces that must COMPOSE
 *  it with their own transforms (glitch push/scale ghosts). '' when none. */
export function layerBoxTransform(box?: VNLayerBox | null): string {
    if (!box) return '';
    const parts: string[] = [];
    if (box.rotation) parts.push(`rotate(${box.rotation}deg)`);
    if (box.flipH) parts.push('scaleX(-1)');
    return parts.join(' ');
}
