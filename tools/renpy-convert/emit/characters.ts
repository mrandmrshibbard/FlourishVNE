/**
 * Build one `VNCharacter` per Portrait the story shows.
 *
 * The design mirrors Ren'Py's own model rather than fighting it:
 *
 *  - **Layers follow the 62-slot global z-order**, restricted to the slots this portrait uses, and
 *    `Record` key order is preserved because `layerOrderForPose` falls back to it. Slots the game
 *    declares but never puts in that order (`sweat`, `eye_glow`) are dead art in Ren'Py itself and
 *    are skipped, so the recreation cannot show something the original never shows.
 *  - **One expression with an EMPTY `layerConfiguration`.** The engine's resolver order is
 *    `layerOverrides` -> variable -> expression -> existing selections -> null, so an empty
 *    expression makes "whatever was last set persists" the default - which is exactly Ren'Py's
 *    persistent `spriteParts` dict.
 *  - **Every piece gets a box** computed from the `Portrait(width,height)` canvas, because the
 *    compositor blits each part at (0,0) on that canvas.
 *  - **Blink becomes an idle animation** from the `<mood>_eyes0/1/2` frame set the art already has.
 *
 * CONTENT RULE: identifiers and geometry only.
 */
import path from 'node:path';
import type { VNCharacter, VNCharacterLayer, VNLayerAsset, VNCharacterAnimation } from '../ir/engineContract';
import type { PortraitDecl } from '../model/portraitTable';
import type { SlotOrder } from '../model/slotOrder';
import type { AssetIndex } from '../model/assetIndex';
import { resolveSprite, resolveFrames, folderFor, CLEAR_VALUE, FRAME_SLOTS } from '../model/spriteResolver';
import { measureOrThrow } from '../model/imageSize';
import { pieceBox, roundBox } from '../map/layerBox';
import type { Affine } from '../map/colorGrade';
import { gradeKey } from '../map/colorGrade';
import { decodePng, encodePng, applyGrade } from './bakeGrade';
import type { AssetRegistry } from './assets';
import fs from 'node:fs';

/** Which (portrait, slot, value, grade) combinations the story actually needs. */
export interface PieceRequest {
    portrait: string;
    slot: string;
    value: string;
    /** null = ungraded. */
    grade: Affine | null;
}

export interface BuiltCharacters {
    characters: Record<string, VNCharacter>;
    /** portrait name -> character id. */
    characterIdByPortrait: Map<string, string>;
    /** `${portrait}|${slot}` -> layer id. */
    layerIdBySlot: Map<string, string>;
    /** `${portrait}|${slot}|${value}|${gradeKey ?? ''}` -> layer asset id. */
    assetIdByPiece: Map<string, string>;
    /** portrait name -> its single expression id. */
    expressionIdByPortrait: Map<string, string>;
    /** Pieces requested but not resolvable - a hard failure for the caller. */
    unresolved: string[];
    bakedCount: number;
}

const pieceKey = (r: { portrait: string; slot: string; value: string; grade: Affine | null }): string =>
    `${r.portrait}|${r.slot}|${r.value}|${r.grade ? gradeKey(r.grade) : ''}`;

export interface BuildOptions {
    gameDir: string;
    slots: SlotOrder;
    portraits: Map<string, PortraitDecl>;
    index: AssetIndex;
    registry: AssetRegistry;
    /** Deterministic ids. */
    nextId(prefix: string): string;
    /** Speaker colour, per character. Defaults to a neutral. */
    colorFor?(portrait: string): string;
}

export function buildCharacters(requests: PieceRequest[], opts: BuildOptions): BuiltCharacters {
    const { slots, portraits, index, registry } = opts;
    const declByName = new Map<string, PortraitDecl>();
    for (const decl of portraits.values()) if (!declByName.has(decl.name)) declByName.set(decl.name, decl);

    // Group the requests by portrait and slot so each layer is built once.
    const byPortrait = new Map<string, Map<string, PieceRequest[]>>();
    for (const req of requests) {
        if (req.value === CLEAR_VALUE) continue;                 // the clear sentinel is never art
        if (slots.orphans.has(req.slot)) continue;               // never rendered by Ren'Py either
        let slotMap = byPortrait.get(req.portrait);
        if (!slotMap) { slotMap = new Map(); byPortrait.set(req.portrait, slotMap); }
        const list = slotMap.get(req.slot) ?? [];
        list.push(req);
        slotMap.set(req.slot, list);
    }

    const characters: Record<string, VNCharacter> = {};
    const characterIdByPortrait = new Map<string, string>();
    const layerIdBySlot = new Map<string, string>();
    const assetIdByPiece = new Map<string, string>();
    const expressionIdByPortrait = new Map<string, string>();
    const unresolved: string[] = [];
    let bakedCount = 0;

    for (const [portraitName, slotMap] of byPortrait) {
        const decl = declByName.get(portraitName);
        if (!decl) { unresolved.push(`${portraitName}: no Portrait() declaration`); continue; }

        const charId = opts.nextId('char');
        characterIdByPortrait.set(portraitName, charId);
        const canvas = { width: decl.width, height: decl.height };

        // 🔴 Slot order comes from the GLOBAL list, not from the order requests happened to arrive
        // in - Record key order is the engine's layer z-order fallback.
        const usedSlots = slots.order.filter(slot => slotMap.has(slot));
        const layers: Record<string, VNCharacterLayer> = {};

        for (const slot of usedSlots) {
            const layerId = opts.nextId('layer');
            layerIdBySlot.set(`${portraitName}|${slot}`, layerId);
            const assets: Record<string, VNLayerAsset> = {};

            const seen = new Set<string>();
            for (const req of slotMap.get(slot)!) {
                const key = pieceKey(req);
                if (seen.has(key)) continue;
                seen.add(key);

                const ref = resolveSprite(index, slots, decl, slot, req.value);
                if (!ref || ref.kind !== 'asset' || !ref.file) {
                    unresolved.push(`${portraitName}/${slot}=${req.value}`);
                    continue;
                }
                const size = measureOrThrow(ref.file);
                const box = pieceBox(canvas, size);
                const label = `${slot}_${req.value}${req.grade ? '_graded' : ''}`;

                let asset;
                if (req.grade) {
                    // Bake the grade into real pixels: Ren'Py's brightness is ADDITIVE and no CSS
                    // filter can express it.
                    const baked = encodePng(applyGrade(decodePng(fs.readFileSync(ref.file)), req.grade));
                    asset = registry.addCharacterArt(charId, layerId, label, { data: baked });
                    bakedCount++;
                } else {
                    asset = registry.addCharacterArt(charId, layerId, label, { file: ref.file });
                }

                assetIdByPiece.set(key, asset.id);
                assets[asset.id] = {
                    id: asset.id,
                    name: label,
                    imageUrl: asset.relPath,
                    ...(box ? { box: roundBox(box) } : {}),
                } as unknown as VNLayerAsset;
            }

            layers[layerId] = { id: layerId, name: slot, assets } as unknown as VNCharacterLayer;
        }

        // One expression, deliberately EMPTY: the resolver then falls through to whatever was last
        // set, which is how Ren'Py's persistent dict behaves.
        const expressionId = opts.nextId('expr');
        expressionIdByPortrait.set(portraitName, expressionId);

        const animations = buildBlink(portraitName, decl, slots, index, layers, layerIdBySlot, registry, charId, opts);

        characters[charId] = {
            id: charId,
            name: portraitName,
            color: opts.colorFor?.(portraitName) ?? '#e0def4',
            layers,
            expressions: { [expressionId]: { id: expressionId, name: 'Default', layerConfiguration: {} } },
            ...(animations.length ? { animations } : {}),
        } as unknown as VNCharacter;
    }

    return {
        characters, characterIdByPortrait, layerIdBySlot, assetIdByPiece,
        expressionIdByPortrait, unresolved, bakedCount,
    };
}

/**
 * Blink, rebuilt from the art the game already ships.
 *
 * `<mood>_eyes0/1/2.png` is a real frame set (0 open, 1 mid, 2 closed), and the engine's blink is a
 * random-interval replay - so `trigger: 'idle'` with a 0-1-2-1-0 timeline is a literal match rather
 * than an approximation. A mood with no full frame set simply gets no animation.
 */
function buildBlink(
    portraitName: string,
    decl: PortraitDecl,
    slots: SlotOrder,
    index: AssetIndex,
    layers: Record<string, VNCharacterLayer>,
    layerIdBySlot: Map<string, string>,
    registry: AssetRegistry,
    charId: string,
    opts: BuildOptions,
): VNCharacterAnimation[] {
    if (!decl.animateEyes) return [];
    const eyesLayerId = layerIdBySlot.get(`${portraitName}|eyes`);
    if (!eyesLayerId) return [];
    const eyesLayer = layers[eyesLayerId];
    if (!eyesLayer) return [];

    const out: VNCharacterAnimation[] = [];
    for (const asset of Object.values(eyesLayer.assets) as VNLayerAsset[]) {
        // The resting asset is frame 0; its name carries the mood.
        const mood = /^eyes_([^_]+(?:_[^_]+)*?)(?:_graded)?$/.exec(asset.name)?.[1];
        if (!mood) continue;
        const frames = resolveFrames(index, decl, 'eyes', mood);
        if (!frames) continue;                                   // static mood, not a broken blink

        const frameAssetIds: string[] = [];
        for (const [i, frame] of frames.entries()) {
            if (i === 0) { frameAssetIds.push(asset.id); continue; }   // frame 0 IS the resting art
            const reg = registry.addCharacterArt(charId, eyesLayerId, `eyes_${mood}_f${i}`, { file: frame.file });
            frameAssetIds.push(reg.id);
            if (!eyesLayer.assets[reg.id]) {
                const size = measureOrThrow(frame.file);
                const box = pieceBox({ width: decl.width, height: decl.height }, size);
                eyesLayer.assets[reg.id] = {
                    id: reg.id, name: `eyes_${mood}_f${i}`, imageUrl: reg.relPath,
                    ...(box ? { box: roundBox(box) } : {}),
                } as unknown as VNLayerAsset;
            }
        }

        out.push({
            id: opts.nextId('anim'),
            name: `Blink (${mood})`,
            durationMs: 400,
            trigger: 'idle',
            idleMinMs: 2000,
            idleMaxMs: 5000,
            tracks: [{
                layerId: eyesLayerId,
                keys: [
                    { atMs: 0, assetId: frameAssetIds[0] },
                    { atMs: 100, assetId: frameAssetIds[1] },
                    { atMs: 200, assetId: frameAssetIds[2] },
                    { atMs: 300, assetId: frameAssetIds[1] },
                    { atMs: 400, assetId: frameAssetIds[0] },
                ],
            }],
        } as unknown as VNCharacterAnimation);
    }
    return out;
}
