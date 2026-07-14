/**
 * Smart outfit-rule detection ("smart fit rules").
 *
 * Ported + upgraded from the legacy CharacterCustomizationWizard's filename analysis. Authors who
 * name their art with shared tokens (e.g. `jacket_slim` / `body_slim`) get auto-suggested rules
 * like "Show 'jacket_slim' only when Body is 'body_slim'", presented as plain-language checkbox
 * sentences in the unified wizard. Accepted rules are written to the Customizer element's
 * per-option gating (`optionMeta[assetId].conditions`, whenUnmet 'hide') — the modern superset of
 * the old AssetCycler `assetConditions`.
 *
 * Upgrades over the legacy analyzer:
 *  - tokenization on `_ - space` (legacy: `_` only), tokens < 3 chars or purely numeric dropped;
 *  - a token only links layers when it appears in SOME but not ALL of the depends-layer's assets
 *    (kills noise like a shared character-name prefix), order-independent (legacy relied on
 *    underscore POSITIONS);
 *  - one rule per (target asset × depends layer) holding ALL matching depends-assets as an OR
 *    group — the legacy emitted them as separate AND conditions, which could never all be true.
 *
 * Pure functions, no dispatch — testable and shared by wizard preview + generation.
 */
import { VNID } from '../../types';
import { VNCondition } from '../../types/shared';
import { VNCharacter, VNCharacterLayer, VNLayerAsset } from '../character/types';
import { UICustomizerOptionMeta } from '../ui/types';
import { splitNameTokens } from '../character/import/nameGrouping';

export interface DetectedOutfitRule {
    /** Stable key for the wizard's checkbox list. */
    id: string;
    targetLayerId: VNID;
    targetLayerName: string;
    targetAssetId: VNID;
    targetAssetName: string;
    dependsLayerId: VNID;
    dependsLayerName: string;
    /** The depends-layer assets this piece fits (OR group — any of them unlocks it). */
    dependsAssetIds: VNID[];
    dependsAssetNames: string[];
    /** The (longest) shared filename token that produced the match — for display/debugging. */
    token: string;
}

/** Lowercased name tokens, split on underscore/dash/space; short + numeric tokens dropped.
 *  Shares the raw splitter with the sprite importer (`character/import/nameGrouping.ts`) but keeps
 *  its OWN filter: outfit rules want meaningful words, whereas the importer must KEEP short/numeric
 *  tokens (`mouth_a`, `body-01` are variant names). One splitter, two policies. */
const tokenize = (name: string): string[] =>
    splitNameTokens(name).filter(tk => tk.length >= 3 && !/^\d+$/.test(tk));

/**
 * Scan a character's layers for filename-token relationships and suggest fit rules.
 * A rule is only suggested when it actually discriminates: the token must appear in some but not
 * all of the depends-layer's assets, and the matched set must not cover the whole depends layer.
 */
export function detectOutfitRules(character: VNCharacter): DetectedOutfitRule[] {
    const layers = Object.values(character.layers) as VNCharacterLayer[];
    const rules: DetectedOutfitRule[] = [];

    // Pre-tokenize every asset once.
    const layerAssets = new Map<VNID, { asset: VNLayerAsset; tokens: Set<string> }[]>();
    layers.forEach(layer => {
        layerAssets.set(layer.id, (Object.values(layer.assets) as VNLayerAsset[])
            .map(asset => ({ asset, tokens: new Set(tokenize(asset.name)) })));
    });

    layers.forEach((target, targetIdx) => {
        const targetAssets = layerAssets.get(target.id)!;
        layers.forEach((depends, dependsIdx) => {
            if (depends.id === target.id) return;
            // DIRECTIONAL: only gate a LATER layer on an EARLIER one (character layer order =
            // bottom-up: base/body first, clothing/accessories after). Shared tokens like 'slim'
            // discriminate in BOTH layers, so a symmetric scan would emit the reverse rule too
            // ("show body_slim only when Jacket is jacket_slim") — the two categories then hide
            // each other's alternatives and the pickers DEADLOCK (arrows can't cycle). Keeping
            // edges one-way makes the dependency graph a cycle-free chain.
            if (targetIdx <= dependsIdx) return;
            const depAssets = layerAssets.get(depends.id)!;
            if (depAssets.length < 2) return; // nothing to discriminate against

            // Discriminating tokens of the depends layer: in SOME but not ALL of its assets.
            const tokenCount = new Map<string, number>();
            depAssets.forEach(({ tokens }) => tokens.forEach(tk => tokenCount.set(tk, (tokenCount.get(tk) || 0) + 1)));
            const discriminating = new Set(
                [...tokenCount.entries()].filter(([, n]) => n > 0 && n < depAssets.length).map(([tk]) => tk)
            );
            if (discriminating.size === 0) return;

            targetAssets.forEach(({ asset, tokens }) => {
                // Which depends-assets share a discriminating token with this piece?
                const matched: { id: VNID; name: string; token: string }[] = [];
                depAssets.forEach(dep => {
                    let best = '';
                    dep.tokens.forEach(tk => {
                        if (discriminating.has(tk) && tokens.has(tk) && tk.length > best.length) best = tk;
                    });
                    if (best) matched.push({ id: dep.asset.id, name: dep.asset.name, token: best });
                });
                // No match, or the piece "fits everything" → no rule to suggest.
                if (matched.length === 0 || matched.length >= depAssets.length) return;
                const longest = matched.reduce((a, b) => (b.token.length > a.token.length ? b : a));
                rules.push({
                    id: `${asset.id}::${depends.id}`,
                    targetLayerId: target.id,
                    targetLayerName: target.name,
                    targetAssetId: asset.id,
                    targetAssetName: asset.name,
                    dependsLayerId: depends.id,
                    dependsLayerName: depends.name,
                    dependsAssetIds: matched.map(m => m.id),
                    dependsAssetNames: matched.map(m => m.name),
                    token: longest.token,
                });
            });
        });
    });
    return rules;
}

/**
 * Convert accepted rules into Customizer per-option gating.
 * `layerVarMap` maps layerId → the category's backing variable id; rules whose depends-layer isn't
 * in the map (layer not included in this customizer) are skipped.
 *
 * VNCondition lists evaluate LEFT-TO-RIGHT with no precedence, so per asset we order the one
 * multi-value OR group first, then AND-join the remaining layers' single best condition:
 * [A or B and C] ⇒ ((A or B) and C). If a SECOND depends layer also matched multiple assets, it
 * is collapsed to its best single match (rare; the author can refine per-option rules in the
 * Customizer's Properties).
 */
export function rulesToOptionMeta(
    rules: DetectedOutfitRule[],
    layerVarMap: Record<VNID, VNID>,
): Record<VNID, UICustomizerOptionMeta> {
    const byAsset = new Map<VNID, DetectedOutfitRule[]>();
    rules.forEach(r => {
        if (!layerVarMap[r.dependsLayerId]) return;
        const list = byAsset.get(r.targetAssetId) || [];
        list.push(r);
        byAsset.set(r.targetAssetId, list);
    });

    const meta: Record<VNID, UICustomizerOptionMeta> = {};
    byAsset.forEach((assetRules, assetId) => {
        // The (single) multi-value group leads so its ORs bind before the ANDs.
        const sorted = [...assetRules].sort((a, b) => b.dependsAssetIds.length - a.dependsAssetIds.length);
        const conditions: VNCondition[] = [];
        sorted.forEach((rule, ruleIdx) => {
            const variableId = layerVarMap[rule.dependsLayerId];
            const ids = ruleIdx === 0 ? rule.dependsAssetIds : [rule.dependsAssetIds[0]];
            ids.forEach((depAssetId, i) => {
                conditions.push({
                    variableId,
                    operator: '==',
                    value: depAssetId,
                    ...(conditions.length > 0 ? { connector: (ruleIdx === 0 && i > 0 ? 'or' : 'and') as 'or' | 'and' } : {}),
                });
            });
        });
        if (conditions.length > 0) meta[assetId] = { conditions, whenUnmet: 'hide' };
    });
    return meta;
}
