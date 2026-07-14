/**
 * Bulk sprite importer — the commit.
 *
 * Two invariants live here:
 *
 *  1. ONE DISPATCH. `useProject().dispatch` is history-wrapped, so 40 `ADD_LAYER_ASSET` calls would
 *     be 40 undo steps. We build the whole layers/expressions tree in memory and fire a single
 *     `UPDATE_CHARACTER` → one Ctrl+Z undoes the entire import.
 *
 *  2. LAYER KEY INSERTION ORDER *IS* Z-ORDER. The runtime paints `Object.values(char.layers)` in
 *     order (characterHandler.ts). So we rebuild the record deliberately, bottom-first.
 *
 * Everything we write is an ORDINARY `VNLayerAsset` produced by the ORDINARY `ingestUpload` path —
 * an imported sprite is indistinguishable from a hand-uploaded one. That's what makes project
 * export/import and built games keep working with zero changes.
 */
import { VNID } from '../../../types';
import { VNProject } from '../../../types/project';
import { VNCharacter, VNCharacterLayer, VNCharacterExpression, VNLayerAsset } from '../types';
import { ingestUpload, deleteAsset, refToRelPath } from '../../../utils/assetStore';
import { ImportPlan, ImportedLayer } from './types';
import { rasterizeLayers } from './raster';
import { partLayerName } from './nameGrouping';

const gid = () => Math.random().toString(36).substring(2, 9);

export interface CommitResult {
    layers: Record<VNID, VNCharacterLayer>;
    expressions: Record<VNID, VNCharacterExpression>;
    layerCount: number;
    assetCount: number;
    expressionCount: number;
}

export interface CommitOptions {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number, name: string) => void;
}

/**
 * Rasterize + ingest every included variant, then build the merged character tree.
 * Does NOT dispatch — it returns the tree so the caller can fire exactly one action.
 * On failure/abort it deletes every file it already wrote (the project itself is never touched
 * until the caller dispatches, so there is nothing to roll back there).
 */
export async function runSpriteImport(
    project: VNProject,
    character: VNCharacter,
    plan: ImportPlan,
    opts: CommitOptions = {},
): Promise<CommitResult> {
    const written: string[] = [];                    // managed refs, for rollback
    /** ImportedLayer.key → the VNLayerAsset we created for it. */
    const assetByKey = new Map<string, { id: VNID; asset: VNLayerAsset }>();

    // Which ImportedLayers are actually included?
    const included: ImportedLayer[] = [];
    const layerOfKey = new Map<string, string>();    // importedLayer.key → planned layer name
    for (const pl of plan.layers) {
        for (const v of pl.variants) {
            if (!v.include) continue;
            const src = plan.doc.layers.find(l => l.key === v.key);
            if (src) { included.push(src); layerOfKey.set(v.key, pl.name); }
        }
    }

    try {
        await rasterizeLayers(plan.doc, included, {
            resizeTo: plan.resizeTo,
            signal: opts.signal,
            onProgress: opts.onProgress,
        }, async (layer, file) => {
            const id = `asset-${gid()}` as VNID;
            // The SAME ingest path every hand-uploaded sprite uses: on desktop this writes the file
            // to the managed asset store and returns a flourish-asset:// ref; on web it falls back
            // to a data URL. Either way it's a normal asset from here on.
            const url = await ingestUpload(project.id, 'characters', id, file);
            const rel = refToRelPath(url);
            if (rel) written.push(rel);

            const planned = plan.layers.find(l => l.name === layerOfKey.get(layer.key));
            const variant = planned?.variants.find(v => v.key === layer.key);
            assetByKey.set(layer.key, {
                id,
                asset: { id, name: variant?.name || layer.name, imageUrl: url },
            });
        });
    } catch (err) {
        // Roll back the files we already wrote to disk. Nothing was dispatched, so the project is clean.
        await Promise.allSettled(written.map(rel => deleteAsset(project.id, rel)));
        throw err;
    }

    // ── build the merged layer record — BOTTOM-FIRST (insertion order = paint order) ──
    const existing = character.layers ?? {};
    const layers: Record<VNID, VNCharacterLayer> = {};
    /** planned layer name → the layer id it ended up as (new or reused). */
    const layerIdByName = new Map<string, VNID>();
    /** Layers created from a 'parts' group — they hold exactly one sprite and must ALWAYS show. */
    const partLayerIds = new Set<VNID>();

    // Keep every existing layer, in its existing order — never reshuffle art that already works.
    for (const [id, l] of Object.entries(existing)) {
        layers[id] = { ...l, assets: { ...l.assets } };
        layerIdByName.set(l.name.trim().toLowerCase(), id as VNID);
    }

    /** Get-or-create a layer by name, reusing an existing id so bindings keep resolving. */
    const layerFor = (name: string): VNID => {
        const nameKey = name.trim().toLowerCase();
        let id = layerIdByName.get(nameKey);
        if (!id) {
            id = `layer-${gid()}` as VNID;
            layers[id] = { id, name, assets: {} };
            layerIdByName.set(nameKey, id);
        }
        return id;
    };

    for (const pl of plan.layers) {
        const includedVariants = pl.variants.filter(v => v.include && assetByKey.has(v.key));
        if (!includedVariants.length) continue;

        if (pl.mode === 'parts') {
            // PARTS: `Eyes > [whites, iris, pupil]` are COMPONENTS, not alternatives — they stack to
            // make one eye. Each becomes its OWN layer holding a single sprite. The variants are
            // already in source (bottom-first) order, so creating them in order preserves the
            // artist's stacking.
            for (const v of includedVariants) {
                const { id, asset } = assetByKey.get(v.key)!;
                const lid = layerFor(partLayerName(pl.name, v.name));
                layers[lid].assets[id] = asset;
                partLayerIds.add(lid);
            }
            continue;
        }

        // ALTERNATIVES: one layer, many sprites, the player sees one of them.
        const layerId = layerFor(pl.name);
        for (const v of includedVariants) {
            const { id, asset } = assetByKey.get(v.key)!;
            layers[layerId].assets[id] = asset;
        }
    }

    // ── expressions ──
    const expressions: Record<VNID, VNCharacterExpression> = {};
    for (const [id, e] of Object.entries(character.expressions ?? {})) {
        expressions[id] = { ...e, layerConfiguration: { ...e.layerConfiguration } };
    }

    /** A layer's fallback asset — used so a new layer never renders as nothing. */
    const defaultAssetOf = (layerId: VNID): VNID | null => {
        const ids = Object.keys(layers[layerId]?.assets ?? {});
        return (ids[0] as VNID) ?? null;
    };

    // Newly-created layers are unknown to the character's PRE-EXISTING expressions, so those would
    // render the new body as nothing. Fill them in (one checkbox, default on).
    if (plan.addLayersToExistingExpressions) {
        const newLayerIds = Object.keys(layers).filter(id => !(id in existing)) as VNID[];
        for (const e of Object.values(expressions)) {
            for (const lid of newLayerIds) {
                if (e.layerConfiguration[lid] === undefined) e.layerConfiguration[lid] = defaultAssetOf(lid);
            }
        }
    }

    for (const pe of plan.expressions) {
        if (!pe.include) continue;
        const config: Record<VNID, VNID | null> = {};
        for (const [layerId] of Object.entries(layers)) config[layerId as VNID] = null;

        for (const [layerName, importKey] of Object.entries(pe.selection)) {
            const lid = layerIdByName.get(layerName.trim().toLowerCase());
            if (!lid) continue;
            config[lid] = importKey ? (assetByKey.get(importKey)?.id ?? null) : null;
        }
        // PARTS ALWAYS SHOW. The expression's `selection` still refers to the ORIGINAL group name
        // ("Eyes"), which no longer exists once it was split — so select each part's single sprite
        // explicitly. Otherwise every expression would render an eye with no iris.
        for (const lid of partLayerIds) config[lid] = defaultAssetOf(lid);

        // Any layer this expression says nothing about (e.g. one the character already had) keeps
        // its default, so an expression is never wearing "nothing".
        for (const lid of Object.keys(layers) as VNID[]) {
            if (config[lid] == null && !(lid in existing)) config[lid] = defaultAssetOf(lid);
        }

        // Merge by NAME: re-importing a revised file updates the expression rather than duplicating it.
        const hit = Object.values(expressions).find(e => e.name.trim().toLowerCase() === pe.name.trim().toLowerCase());
        if (hit) {
            hit.layerConfiguration = { ...hit.layerConfiguration, ...config };
        } else {
            const id = `expr-${gid()}` as VNID;
            expressions[id] = { id, name: pe.name, layerConfiguration: config };
        }
    }

    return {
        layers,
        expressions,
        layerCount: Object.keys(layers).length,
        assetCount: assetByKey.size,
        expressionCount: Object.keys(expressions).length,
    };
}
