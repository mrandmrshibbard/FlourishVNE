/**
 * THE pose-art resolver — the single source of truth for "which picture does this piece use
 * in this pose?". Every surface that draws a character (the game engine's characterHandler,
 * the CharacterPreview and Customizer elements, the scene canvas, the menu-editor previews,
 * the character editor) MUST resolve art through these helpers so they can never disagree.
 *
 * Design rules (fixed with Brad):
 *  - Outfit/expression SELECTION is by asset id and is pose-agnostic — poses only change ART.
 *  - Missing pose art falls back to the asset's/character's default art (never hide a piece);
 *    the editor shows a warning badge instead.
 *  - Unknown/deleted pose ids resolve to the Default pose everywhere (dangling-safe: old
 *    saves, hand-edited JSON, and deleted poses degrade gracefully, no migrations needed).
 *
 * Pure and React-free on purpose: unit-testable, and importable by both the engine bundle
 * and editor canvases without dragging UI code along.
 */
import { VNID } from '../../types';
import { VNCharacter, VNCharacterPose, VNLayerAsset } from './types';

/** The resolved art slice every renderer consumes — default OR pose art, one shape. */
export interface ResolvedArt {
    imageUrl?: string | null;
    videoUrl?: string | null;
    isVideo?: boolean;
    loop?: boolean;
    trimStart?: number;
    trimEnd?: number;
}

/** True when this asset has dedicated art for `poseId` (drives the editor's warning badges). */
export function assetHasPoseArt(asset: VNLayerAsset, poseId: VNID): boolean {
    const art = asset.poseArt?.[poseId];
    return !!art && !!(art.imageUrl || art.videoUrl);
}

/** Art for a layer asset in a pose. No/unknown poseId — or a pose entry with neither image
 *  nor video — returns the asset's OWN default art, field-for-field (identical to today). */
export function assetArtForPose(asset: VNLayerAsset, poseId?: VNID | null): ResolvedArt {
    if (poseId && assetHasPoseArt(asset, poseId)) {
        const art = asset.poseArt![poseId];
        return {
            imageUrl: art.imageUrl,
            videoUrl: art.videoUrl,
            isVideo: art.isVideo,
            loop: art.loop,
            trimStart: art.trimStart,
            trimEnd: art.trimEnd,
        };
    }
    return {
        imageUrl: asset.imageUrl,
        videoUrl: asset.videoUrl,
        isVideo: asset.isVideo,
        loop: asset.loop,
        trimStart: asset.trimStart,
        trimEnd: asset.trimEnd,
    };
}

/** Base sprite art for a pose. No/unknown poseId — or a pose that has no base art of its
 *  own — returns the character's default base fields, field-for-field. */
export function characterBaseArtForPose(
    char: Pick<VNCharacter, 'baseImageUrl' | 'baseVideoUrl' | 'isBaseVideo' | 'baseVideoLoop'
        | 'baseVideoTrimStart' | 'baseVideoTrimEnd' | 'poses'>,
    poseId?: VNID | null,
): ResolvedArt {
    const pose = poseId ? char.poses?.[poseId] : undefined;
    if (pose && (pose.baseImageUrl || pose.baseVideoUrl)) {
        return {
            imageUrl: pose.baseImageUrl,
            videoUrl: pose.baseVideoUrl,
            isVideo: pose.isBaseVideo,
            loop: pose.baseVideoLoop,
            trimStart: pose.baseVideoTrimStart,
            trimEnd: pose.baseVideoTrimEnd,
        };
    }
    return {
        imageUrl: char.baseImageUrl,
        videoUrl: char.baseVideoUrl,
        isVideo: char.isBaseVideo,
        loop: char.baseVideoLoop,
        trimStart: char.baseVideoTrimStart,
        trimEnd: char.baseVideoTrimEnd,
    };
}

/** The command/element-facing guard: a poseId is honored only if the character defines it.
 *  Unknown/deleted ids resolve to undefined = the Default pose. Use this at EVERY point a
 *  poseId enters the render path. */
export function resolvePoseId(
    char: { poses?: Record<VNID, VNCharacterPose> } | null | undefined,
    poseId?: VNID | null,
): VNID | undefined {
    if (!poseId || !char?.poses?.[poseId]) return undefined;
    return poseId;
}
