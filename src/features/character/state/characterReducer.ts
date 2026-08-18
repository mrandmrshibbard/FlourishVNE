import { VNID } from '../../../types';
import { VNProject } from '../../../types/project';
import { VNCommand, CommandType } from '../../scene/types';
import { VNCharacter, VNCharacterAnimation, VNCharacterExpression, VNCharacterLayer, VNCharacterPose, VNLayerAsset, VNLayerBox, VNPoseArt } from '../types';
import { normalizeLayerBox } from '../layout';

const generateId = () => Math.random().toString(36).substring(2, 9);

/** Normalize an animation: every lane's keys sorted by time so consumers can rely on order;
 *  an absent lane stays absent (minimal JSON). The UPDATE/IMPORT contract. */
const sortAnimationKeys = (anim: VNCharacterAnimation): VNCharacterAnimation => {
    const next: VNCharacterAnimation = { ...anim };
    next.tracks = (next.tracks || []).map(tr => ({
        ...tr,
        keys: [...(tr.keys || [])].sort((a, b) => a.atMs - b.atMs),
        ...(tr.rotationKeys ? { rotationKeys: [...tr.rotationKeys].sort((a, b) => a.atMs - b.atMs) } : {}),
        ...(tr.scaleKeys ? { scaleKeys: [...tr.scaleKeys].sort((a, b) => a.atMs - b.atMs) } : {}),
        ...(tr.moveKeys ? { moveKeys: [...tr.moveKeys].sort((a, b) => a.atMs - b.atMs) } : {}),
    }));
    if (next.motionKeys) next.motionKeys = [...next.motionKeys].sort((a, b) => a.atMs - b.atMs);
    return next;
};

export type CharacterAction =
    | { type: 'ADD_CHARACTER'; payload: { name: string; color: string } }
    | { type: 'DELETE_CHARACTER'; payload: { characterId: VNID } }
    | { type: 'UPDATE_CHARACTER'; payload: { characterId: VNID; updates: Partial<VNCharacter> } }
    | { type: 'ADD_CHARACTER_LAYER', payload: { characterId: VNID, name: string } }
    | { type: 'UPDATE_CHARACTER_LAYER', payload: { characterId: VNID, layerId: VNID, name: string } }
    | { type: 'DELETE_CHARACTER_LAYER', payload: { characterId: VNID, layerId: VNID } }
    /** Bulk delete from the layer list's multi-select — one atomic dispatch, see the case. */
    | { type: 'DELETE_CHARACTER_LAYERS', payload: { characterId: VNID, layerIds: VNID[] } }
    | { type: 'ADD_LAYER_ASSET', payload: { characterId: VNID, layerId: VNID, name: string } & Partial<VNLayerAsset> }
    | { type: 'DELETE_LAYER_ASSET', payload: { characterId: VNID, layerId: VNID, assetId: VNID } }
    | { type: 'UPDATE_LAYER_ASSET', payload: { characterId: VNID, layerId: VNID, assetId: VNID, updates: Partial<VNLayerAsset> } }
    | { type: 'ADD_EXPRESSION', payload: { characterId: VNID, name: string } }
    | { type: 'UPDATE_EXPRESSION', payload: { characterId: VNID, expressionId: VNID, updates: Partial<VNCharacterExpression> } }
    | { type: 'DELETE_EXPRESSION', payload: { characterId: VNID, expressionId: VNID } }
    | { type: 'REORDER_CHARACTERS', payload: { characterIds: VNID[] } }
    | { type: 'ADD_POSE', payload: { characterId: VNID, name: string } }
    | { type: 'UPDATE_POSE', payload: { characterId: VNID, poseId: VNID, updates: Partial<VNCharacterPose> } }
    | { type: 'DELETE_POSE', payload: { characterId: VNID, poseId: VNID } }
    | { type: 'SET_ASSET_POSE_ART', payload: { characterId: VNID, layerId: VNID, assetId: VNID, poseId: VNID, art: VNPoseArt | null } }
    /** The Pose Studio's single Done commit (one undo step). Every map is a sparse PATCH:
     *  only mentioned keys change; a null/full box deletes the entry (normalizeLayerBox). */
    | { type: 'APPLY_CHARACTER_LAYOUT', payload: {
        characterId: VNID,
        layerBoxes?: Record<VNID, VNLayerBox | null>,
        layerPoseBoxes?: Record<VNID, Record<VNID, VNLayerBox | null>>,
        assetBoxes?: Record<VNID, Record<VNID, VNLayerBox | null>>,
        assetPoseBoxes?: Record<VNID, Record<VNID, Record<VNID, VNLayerBox | null>>>,
        poseLayerOrders?: Record<VNID, VNID[] | null>,
        poseHiddenLayers?: Record<VNID, VNID[] | null>,
        baseLayerOrder?: VNID[],
      } }
    /** Copy a pose: record fields (incl. layout/order/hidden + base-art URLS by reference),
     *  every asset's poseArt[src], and every layer/asset poseBoxes[src] → the new pose id.
     *  Caller may supply newPoseId so the UI can select the copy. */
    | { type: 'DUPLICATE_POSE', payload: { characterId: VNID, poseId: VNID, newPoseId?: VNID, newName?: string } }
    | { type: 'ADD_CHARACTER_ANIMATION', payload: { characterId: VNID, name: string } }
    | { type: 'UPDATE_CHARACTER_ANIMATION', payload: { characterId: VNID, animationId: VNID, updates: Partial<VNCharacterAnimation> } }
    /** Copy an animation on the same character (deep copy — tracks/keys are nested arrays that
     *  must not be shared with the undo history). Caller may supply newAnimationId so the UI
     *  can select the copy (the DUPLICATE_POSE convention). */
    | { type: 'DUPLICATE_CHARACTER_ANIMATION', payload: { characterId: VNID, animationId: VNID, newAnimationId?: VNID, newName?: string } }
    /** Land a FULLY-FORMED animation on a character (the paste path — the caller has already
     *  remapped layer/asset ids for this character and supplied a fresh id). Collision-guarded;
     *  keys are normalized (sorted) like UPDATE does. */
    | { type: 'IMPORT_CHARACTER_ANIMATION', payload: { characterId: VNID, animation: VNCharacterAnimation } }
    | { type: 'DELETE_CHARACTER_ANIMATION', payload: { characterId: VNID, animationId: VNID } };

/**
 * Remove one or more layers from a character, cleaning up everywhere they're referenced.
 *
 * Shared by the single-layer and bulk delete actions so the cleanup can never drift between
 * them: a layer also lives in every expression's `layerConfiguration` and in each pose's
 * `layerOrder` / `hiddenLayers`, and leaving it behind in any of those leaves a dangling id
 * that the layout resolver has to keep stepping around.
 *
 * All updates are immutable — an earlier in-place delete here mutated expression objects that
 * the undo history still shared.
 */
const removeLayersFromCharacter = (character: VNCharacter, layerIds: Set<VNID>): VNCharacter => {
    const remainingLayers: Record<VNID, VNCharacterLayer> = {};
    for (const [id, layer] of Object.entries(character.layers)) {
        if (!layerIds.has(id)) remainingLayers[id] = layer;
    }

    const newExpressions: Record<VNID, VNCharacterExpression> = {};
    for (const [exprId, expr] of Object.entries(character.expressions)) {
        const touched = Object.keys(expr.layerConfiguration).some(id => layerIds.has(id));
        if (!touched) { newExpressions[exprId] = expr; continue; }
        const restCfg: Record<VNID, VNID> = {};
        for (const [id, assetId] of Object.entries(expr.layerConfiguration)) {
            if (!layerIds.has(id)) restCfg[id] = assetId as VNID;
        }
        newExpressions[exprId] = { ...expr, layerConfiguration: restCfg };
    }

    // Drop the fields entirely once they empty, matching how poses store "nothing special here".
    let newPoses = character.poses;
    if (character.poses) {
        const posesNext: Record<VNID, VNCharacterPose> = {};
        for (const [poseId, pose] of Object.entries(character.poses)) {
            let p = pose;
            if (p.layerOrder?.some(id => layerIds.has(id))) {
                const filtered = p.layerOrder.filter(id => !layerIds.has(id));
                const { layerOrder: _lo, ...rest } = p;
                p = filtered.length ? { ...rest, layerOrder: filtered } : rest as VNCharacterPose;
            }
            if (p.hiddenLayers?.some(id => layerIds.has(id))) {
                const filtered = p.hiddenLayers.filter(id => !layerIds.has(id));
                const { hiddenLayers: _hl, ...rest } = p;
                p = filtered.length ? { ...rest, hiddenLayers: filtered } : rest as VNCharacterPose;
            }
            posesNext[poseId] = p;
        }
        newPoses = posesNext;
    }

    return newPoses !== character.poses
        ? { ...character, layers: remainingLayers, expressions: newExpressions, poses: newPoses }
        : { ...character, layers: remainingLayers, expressions: newExpressions };
};

export const characterReducer = (state: VNProject, action: CharacterAction): VNProject => {
  switch (action.type) {
    case 'ADD_CHARACTER': {
        const { name, color } = action.payload;
        const newId = `char-${generateId()}`;
        const newExprId = `expr-${generateId()}`;
        const newExpression: VNCharacterExpression = { id: newExprId, name: 'Default', layerConfiguration: {} };
        const newCharacter: VNCharacter = { 
            id: newId, 
            name, 
            color, 
            baseImageUrl: null, 
            layers: {}, 
            expressions: { [newExprId]: newExpression } 
        };
        return {
            ...state,
            characters: {
                ...state.characters,
                [newId]: newCharacter
            }
        };
    }

    case 'DELETE_CHARACTER': {
        const { characterId } = action.payload;
        const { [characterId]: _, ...remaining } = state.characters;
        const fallbackId = Object.keys(remaining)[0]; // undefined if empty
        
        const newScenes = JSON.parse(JSON.stringify(state.scenes));
        for (const sceneId in newScenes) {
            newScenes[sceneId].commands = newScenes[sceneId].commands.map((cmd: VNCommand) => {
                if (cmd.type === CommandType.Dialogue && cmd.characterId === characterId) {
                    return { ...cmd, characterId: null };
                }
                if ((cmd.type === CommandType.ShowCharacter || cmd.type === CommandType.HideCharacter) && cmd.characterId === characterId) {
                    if (fallbackId) {
                        return { ...cmd, characterId: fallbackId };
                    }
                }
                return cmd;
            }).filter(Boolean);
        }
        
        return {
            ...state,
            characters: remaining,
            scenes: newScenes,
        };
    }
    
    case 'UPDATE_CHARACTER': {
        const { characterId, updates } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const updatedCharacter = { ...character, ...updates };
        return {
            ...state,
            characters: {
                ...state.characters,
                [characterId]: updatedCharacter
            }
        };
    }

    case 'ADD_CHARACTER_LAYER': {
        const { characterId, name } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const newLayerId = `layer-${generateId()}`;
        const newLayer: VNCharacterLayer = { id: newLayerId, name, assets: {} };
        const newLayers = { ...character.layers, [newLayerId]: newLayer };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: newLayers } } };
    }

    case 'UPDATE_CHARACTER_LAYER': {
        const { characterId, layerId, name } = action.payload;
        const character = state.characters[characterId];
        if (!character?.layers[layerId]) return state;
        const updatedLayer = { ...character.layers[layerId], name };
        const newLayers = { ...character.layers, [layerId]: updatedLayer };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: newLayers } } };
    }

    case 'DELETE_CHARACTER_LAYER': {
        const { characterId, layerId } = action.payload;
        const character = state.characters[characterId];
        if (!character?.layers[layerId]) return state;
        const updatedChar = removeLayersFromCharacter(character, new Set([layerId]));
        return { ...state, characters: { ...state.characters, [characterId]: updatedChar } };
    }

    /**
     * Bulk delete. ONE dispatch on purpose: deleting selected layers one at a time would make
     * each removal re-render and re-resolve against a character that has already changed — the
     * same class of bug the scene editor's multi-delete comment warns about with indices.
     */
    case 'DELETE_CHARACTER_LAYERS': {
        const { characterId, layerIds } = action.payload;
        const character = state.characters[characterId];
        if (!character || !layerIds?.length) return state;
        const wanted = new Set(layerIds.filter(id => character.layers[id]));
        if (wanted.size === 0) return state;
        const updatedChar = removeLayersFromCharacter(character, wanted);
        return { ...state, characters: { ...state.characters, [characterId]: updatedChar } };
    }

    case 'ADD_LAYER_ASSET': {
        const { characterId, layerId, name, imageUrl, videoUrl, isVideo, loop, autoplay, poseArt } = action.payload;
        const character = state.characters[characterId];
        if (!character?.layers[layerId]) return state;
        // Honor a caller-supplied id so the file-store filename matches the asset (file-backed assets).
        const newAssetId = (action.payload as any).id || `asset-${generateId()}`;
        const newAsset: VNLayerAsset = {
            id: newAssetId,
            name,
            imageUrl,
            videoUrl,
            isVideo,
            loop,
            autoplay,
            // Pose-scoped upload: art added while a pose is active belongs to THAT pose only.
            ...(poseArt ? { poseArt } : {}),
        };
        const newAssets = { ...character.layers[layerId].assets, [newAssetId]: newAsset };
        const newLayers = { ...character.layers, [layerId]: { ...character.layers[layerId], assets: newAssets } };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: newLayers } } };
    }

    case 'DELETE_LAYER_ASSET': {
        const { characterId, layerId, assetId } = action.payload;
        const character = state.characters[characterId];
        if (!character?.layers[layerId]?.assets[assetId]) return state;
        const { [assetId]: _, ...remainingAssets } = character.layers[layerId].assets;
        const newLayers = { ...character.layers, [layerId]: { ...character.layers[layerId], assets: remainingAssets } };
        // Also remove this asset from any expressions using it
        const newExpressions = { ...character.expressions };
        for (const exprId in newExpressions) {
            if (newExpressions[exprId].layerConfiguration[layerId] === assetId) {
                newExpressions[exprId].layerConfiguration[layerId] = null;
            }
        }
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: newLayers, expressions: newExpressions } } };
    }

    case 'UPDATE_LAYER_ASSET': {
        // Rename (or otherwise patch) a layer asset. The asset id is unchanged, so expressions and
        // customizer/variable references that point at it keep working.
        const { characterId, layerId, assetId, updates } = action.payload;
        const character = state.characters[characterId];
        const asset = character?.layers[layerId]?.assets[assetId];
        if (!asset) return state;
        const newAssets = { ...character.layers[layerId].assets, [assetId]: { ...asset, ...updates } };
        const newLayers = { ...character.layers, [layerId]: { ...character.layers[layerId], assets: newAssets } };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: newLayers } } };
    }

    case 'ADD_EXPRESSION': {
        const { characterId, name } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const newExprId = `expr-${generateId()}`;
        const newExpression: VNCharacterExpression = { id: newExprId, name, layerConfiguration: {} };
        // Initialize with null for all layers
        Object.keys(character.layers).forEach(layerId => {
            newExpression.layerConfiguration[layerId] = null;
        });
        const newExpressions = { ...character.expressions, [newExprId]: newExpression };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, expressions: newExpressions } } };
    }

    case 'UPDATE_EXPRESSION': {
        const { characterId, expressionId, updates } = action.payload;
        const character = state.characters[characterId];
        if (!character?.expressions[expressionId]) return state;
        const newExpression = { ...character.expressions[expressionId], ...updates };
        const newExpressions = { ...character.expressions, [expressionId]: newExpression };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, expressions: newExpressions } } };
    }

    case 'DELETE_EXPRESSION': {
        const { characterId, expressionId } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const { [expressionId]: _, ...remainingExpressions } = character.expressions;
        // Also update any commands that were using this expression
        const newScenes = JSON.parse(JSON.stringify(state.scenes));
        const firstExprId = Object.keys(remainingExpressions)[0];
        for (const sceneId in newScenes) {
            newScenes[sceneId].commands.forEach((cmd: VNCommand) => {
                if (cmd.type === CommandType.ShowCharacter && cmd.expressionId === expressionId) {
                    cmd.expressionId = firstExprId || '';
                }
            });
        }
        return { ...state, scenes: newScenes, characters: { ...state.characters, [characterId]: { ...character, expressions: remainingExpressions } } };
    }

    case 'ADD_POSE': {
        const { characterId, name } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const newPoseId = `pose-${generateId()}`;
        const newPose: VNCharacterPose = { id: newPoseId, name };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, poses: { ...(character.poses || {}), [newPoseId]: newPose } } } };
    }

    case 'UPDATE_POSE': {
        const { characterId, poseId, updates } = action.payload;
        const character = state.characters[characterId];
        const pose = character?.poses?.[poseId];
        if (!character || !pose) return state;
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, poses: { ...character.poses, [poseId]: { ...pose, ...updates } } } } };
    }

    case 'DELETE_POSE': {
        const { characterId, poseId } = action.payload;
        const character = state.characters[characterId];
        if (!character?.poses?.[poseId]) return state;
        const { [poseId]: _removed, ...remainingPoses } = character.poses;
        // Strip this pose's art AND layout boxes from every layer + asset (drop emptied
        // Records entirely so untouched-project JSON stays minimal). The pose's own
        // layerOrder/hiddenLayers die with its record.
        const stripPoseBoxes = <T extends { poseBoxes?: Record<VNID, VNLayerBox> }>(owner: T): T => {
            if (!owner.poseBoxes || !(poseId in owner.poseBoxes)) return owner;
            const { [poseId]: _box, ...restBoxes } = owner.poseBoxes;
            if (Object.keys(restBoxes).length) return { ...owner, poseBoxes: restBoxes };
            const { poseBoxes: _pb, ...rest } = owner;
            return rest as T;
        };
        const newLayers: Record<VNID, VNCharacterLayer> = {};
        for (const [layerId, layer] of Object.entries(character.layers)) {
            const newAssets: Record<VNID, VNLayerAsset> = {};
            for (const [assetId, asset] of Object.entries(layer.assets)) {
                let a = asset;
                if (a.poseArt && poseId in a.poseArt) {
                    const { [poseId]: _art, ...restArt } = a.poseArt;
                    a = Object.keys(restArt).length
                        ? { ...a, poseArt: restArt }
                        : (() => { const { poseArt: _pa, ...rest } = a; return rest as VNLayerAsset; })();
                }
                newAssets[assetId] = stripPoseBoxes(a);
            }
            newLayers[layerId] = stripPoseBoxes({ ...layer, assets: newAssets });
        }
        // Scene hygiene (mirrors DELETE_EXPRESSION): drop references to the deleted pose from
        // Show Character and Change Pose commands. Runtime stays dangling-safe regardless.
        const newScenes = JSON.parse(JSON.stringify(state.scenes));
        for (const sceneId in newScenes) {
            newScenes[sceneId].commands = newScenes[sceneId].commands.map((cmd: VNCommand) => {
                if ((cmd.type === CommandType.ShowCharacter || cmd.type === CommandType.SetCharacterPose)
                    && (cmd as any).characterId === characterId && (cmd as any).poseId === poseId) {
                    const { poseId: _p, ...rest } = cmd as any;
                    return rest;
                }
                return cmd;
            });
        }
        const updatedChar: VNCharacter = Object.keys(remainingPoses).length
            ? { ...character, poses: remainingPoses, layers: newLayers }
            : (() => { const { poses: _po, ...rest } = character; return { ...rest, layers: newLayers } as VNCharacter; })();
        return { ...state, characters: { ...state.characters, [characterId]: updatedChar }, scenes: newScenes };
    }

    case 'ADD_CHARACTER_ANIMATION': {
        const { characterId, name } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const id = `anim-${generateId()}`;
        const anim: VNCharacterAnimation = { id, name, durationMs: 1000, tracks: [], loop: false };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, animations: { ...(character.animations || {}), [id]: anim } } } };
    }

    case 'UPDATE_CHARACTER_ANIMATION': {
        const { characterId, animationId, updates } = action.payload;
        const character = state.characters[characterId];
        const anim = character?.animations?.[animationId];
        if (!character || !anim) return state;
        const next = sortAnimationKeys({ ...anim, ...updates });
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, animations: { ...character.animations, [animationId]: next } } } };
    }

    case 'DUPLICATE_CHARACTER_ANIMATION': {
        const { characterId, animationId, newAnimationId, newName } = action.payload;
        const character = state.characters[characterId];
        const src = character?.animations?.[animationId];
        if (!character || !src) return state;
        const newId = newAnimationId || `anim-${generateId()}`;
        if (character.animations![newId]) return state;
        // Deep copy — tracks/keys are nested arrays; sharing them with the source would let
        // edits to the copy mutate the original inside the undo history.
        const copy: VNCharacterAnimation = { ...JSON.parse(JSON.stringify(src)), id: newId, name: newName || `${src.name} (copy)` };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, animations: { ...character.animations, [newId]: copy } } } };
    }

    case 'IMPORT_CHARACTER_ANIMATION': {
        const { characterId, animation } = action.payload;
        const character = state.characters[characterId];
        if (!character || !animation?.id) return state;
        if (character.animations?.[animation.id]) return state;
        const stored = sortAnimationKeys(JSON.parse(JSON.stringify(animation)));
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, animations: { ...(character.animations || {}), [animation.id]: stored } } } };
    }

    case 'DELETE_CHARACTER_ANIMATION': {
        const { characterId, animationId } = action.payload;
        const character = state.characters[characterId];
        if (!character?.animations?.[animationId]) return state;
        const { [animationId]: _gone, ...rest } = character.animations;
        // Drop the emptied Record entirely — untouched-project JSON stays minimal.
        const nextChar = { ...character } as any;
        if (Object.keys(rest).length) nextChar.animations = rest; else delete nextChar.animations;
        return { ...state, characters: { ...state.characters, [characterId]: nextChar } };
    }

    case 'SET_ASSET_POSE_ART': {
        const { characterId, layerId, assetId, poseId, art } = action.payload;
        const character = state.characters[characterId];
        const asset = character?.layers[layerId]?.assets[assetId];
        if (!character || !asset) return state;
        let newAsset: VNLayerAsset;
        if (art === null) {
            if (!asset.poseArt || !(poseId in asset.poseArt)) return state;
            const { [poseId]: _art, ...restArt } = asset.poseArt;
            newAsset = Object.keys(restArt).length
                ? { ...asset, poseArt: restArt }
                : (() => { const { poseArt: _pa, ...rest } = asset; return rest as VNLayerAsset; })();
        } else {
            newAsset = { ...asset, poseArt: { ...(asset.poseArt || {}), [poseId]: art } };
        }
        const newAssets = { ...character.layers[layerId].assets, [assetId]: newAsset };
        const newLayers = { ...character.layers, [layerId]: { ...character.layers[layerId], assets: newAssets } };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: newLayers } } };
    }

    case 'APPLY_CHARACTER_LAYOUT': {
        const { characterId, layerBoxes, layerPoseBoxes, assetBoxes, assetPoseBoxes, poseLayerOrders, poseHiddenLayers, baseLayerOrder } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;

        // Patch a poseId→box Record: normalized boxes land, null/full boxes delete their key,
        // and an emptied Record disappears entirely (the SET_ASSET_POSE_ART idiom).
        const patchBoxRecord = (
            existing: Record<VNID, VNLayerBox> | undefined,
            patch: Record<VNID, VNLayerBox | null>
        ): Record<VNID, VNLayerBox> | undefined => {
            const next: Record<VNID, VNLayerBox> = { ...(existing || {}) };
            for (const [key, value] of Object.entries(patch)) {
                const norm = normalizeLayerBox(value || undefined);
                if (norm) next[key] = norm; else delete next[key];
            }
            return Object.keys(next).length ? next : undefined;
        };
        // Set-or-REMOVE an optional field (undefined must delete the key, never store it —
        // the byte-identity rule).
        const withOpt = <T extends object>(obj: T, key: keyof T & string, val: unknown): T => {
            const { [key]: _drop, ...rest } = obj as Record<string, unknown>;
            return (val === undefined ? rest : { ...rest, [key]: val }) as T;
        };

        // 1) Layer + asset boxes
        let newLayers: Record<VNID, VNCharacterLayer> = {};
        for (const [layerId, layer] of Object.entries(character.layers)) {
            let l = layer;
            if (layerBoxes && layerId in layerBoxes) {
                l = withOpt(l, 'box', normalizeLayerBox(layerBoxes[layerId] || undefined));
            }
            if (layerPoseBoxes?.[layerId]) {
                l = withOpt(l, 'poseBoxes', patchBoxRecord(l.poseBoxes, layerPoseBoxes[layerId]));
            }
            const assetBoxPatch = assetBoxes?.[layerId];
            const assetPosePatch = assetPoseBoxes?.[layerId];
            if (assetBoxPatch || assetPosePatch) {
                const newAssets: Record<VNID, VNLayerAsset> = {};
                for (const [assetId, asset] of Object.entries(l.assets)) {
                    let a = asset;
                    if (assetBoxPatch && assetId in assetBoxPatch) {
                        a = withOpt(a, 'box', normalizeLayerBox(assetBoxPatch[assetId] || undefined));
                    }
                    if (assetPosePatch?.[assetId]) {
                        a = withOpt(a, 'poseBoxes', patchBoxRecord(a.poseBoxes, assetPosePatch[assetId]));
                    }
                    newAssets[assetId] = a;
                }
                l = { ...l, assets: newAssets };
            }
            newLayers[layerId] = l;
        }

        // 2) Base stacking order — rebuild the Record's key order (REORDER_CHARACTERS safety
        //    tail: unknown ids skipped, missing layers appended — never drop data).
        if (baseLayerOrder) {
            const ordered: Record<VNID, VNCharacterLayer> = {};
            baseLayerOrder.forEach(id => { if (newLayers[id]) ordered[id] = newLayers[id]; });
            for (const id in newLayers) {
                if (!ordered[id]) ordered[id] = newLayers[id];
            }
            newLayers = ordered;
        }

        // 3) Per-pose order + hidden lists. An order identical to the base order and an empty
        //    hidden list are stored as ABSENCE.
        let newPoses = character.poses;
        if ((poseLayerOrders || poseHiddenLayers) && character.poses) {
            const baseOrder = Object.keys(newLayers);
            const posesNext: Record<VNID, VNCharacterPose> = {};
            for (const [poseId, pose] of Object.entries(character.poses)) {
                let p = pose;
                if (poseLayerOrders && poseId in poseLayerOrders) {
                    const requested = poseLayerOrders[poseId];
                    const cleaned = requested ? requested.filter(id => !!newLayers[id]) : null;
                    const sameAsBase = !!cleaned && cleaned.length === baseOrder.length && cleaned.every((id, i) => id === baseOrder[i]);
                    p = withOpt(p, 'layerOrder', (!cleaned || sameAsBase) ? undefined : cleaned);
                }
                if (poseHiddenLayers && poseId in poseHiddenLayers) {
                    const requested = poseHiddenLayers[poseId];
                    const cleaned = requested ? requested.filter(id => !!newLayers[id]) : null;
                    p = withOpt(p, 'hiddenLayers', (!cleaned || cleaned.length === 0) ? undefined : cleaned);
                }
                posesNext[poseId] = p;
            }
            newPoses = posesNext;
        }

        const updatedChar: VNCharacter = newPoses !== character.poses
            ? { ...character, layers: newLayers, poses: newPoses }
            : { ...character, layers: newLayers };
        return { ...state, characters: { ...state.characters, [characterId]: updatedChar } };
    }

    case 'DUPLICATE_POSE': {
        const { characterId, poseId, newPoseId, newName } = action.payload;
        const character = state.characters[characterId];
        const src = character?.poses?.[poseId];
        if (!character || !src) return state;
        const newId = newPoseId || `pose-${generateId()}`;
        if (character.poses![newId]) return state;
        // Spread carries layerOrder/hiddenLayers AND base-art URL fields BY REFERENCE — a
        // duplicate never copies files, only pointers.
        const copy: VNCharacterPose = { ...src, id: newId, name: newName || `${src.name} (copy)` };
        const newLayers: Record<VNID, VNCharacterLayer> = {};
        for (const [layerId, layer] of Object.entries(character.layers)) {
            let l = layer;
            if (layer.poseBoxes?.[poseId]) {
                l = { ...l, poseBoxes: { ...l.poseBoxes, [newId]: { ...layer.poseBoxes[poseId] } } };
            }
            if (Object.values(l.assets).some(a => a.poseArt?.[poseId] || a.poseBoxes?.[poseId])) {
                const newAssets: Record<VNID, VNLayerAsset> = {};
                for (const [assetId, asset] of Object.entries(l.assets)) {
                    let a = asset;
                    if (asset.poseArt?.[poseId]) {
                        a = { ...a, poseArt: { ...a.poseArt, [newId]: { ...asset.poseArt[poseId] } } };
                    }
                    if (asset.poseBoxes?.[poseId]) {
                        a = { ...a, poseBoxes: { ...a.poseBoxes, [newId]: { ...asset.poseBoxes[poseId] } } };
                    }
                    newAssets[assetId] = a;
                }
                l = { ...l, assets: newAssets };
            }
            newLayers[layerId] = l;
        }
        return {
            ...state,
            characters: {
                ...state.characters,
                [characterId]: { ...character, layers: newLayers, poses: { ...character.poses, [newId]: copy } },
            },
        };
    }

    case 'REORDER_CHARACTERS': {
        // Editor-only display order: rebuild the characters object in the new key
        // order (mirrors REORDER_SCENES). Engine never dispatches this.
        const { characterIds } = action.payload;
        const newCharacters: Record<VNID, VNCharacter> = {};
        characterIds.forEach(id => {
            if (state.characters[id]) newCharacters[id] = state.characters[id];
        });
        // Safety: keep any character not present in the provided list (shouldn't
        // happen, but never drop data on a reorder).
        for (const id in state.characters) {
            if (!newCharacters[id]) newCharacters[id] = state.characters[id];
        }
        return { ...state, characters: newCharacters };
    }

    default:
      return state;
  }
};
