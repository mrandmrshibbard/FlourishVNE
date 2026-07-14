/**
 * Bulk sprite importer — the PURE heuristics.
 *
 * No canvas, no DOM, no React: given a list of names (from dropped files, or from a PSD/ORA layer
 * tree), work out the character's LAYERS, their VARIANTS, the bottom-up z-order, and a set of
 * proposed EXPRESSIONS. Everything here is a guess the author reviews and can correct before we
 * commit anything — so we favour a confident-but-simple heuristic over a clever one.
 *
 * (Pure by necessity as well as design: vitest runs in jsdom, which has no canvas — so all the
 * decision-making has to live somewhere testable, and this is it.)
 */

/**
 * Raw name splitter. Shared with `features/systems/outfitRules.ts`, which layers its OWN filter on
 * top (it drops short + numeric tokens — correct for outfit rules, WRONG here: that would delete
 * `mouth_a`/`mouth_b` and `body-01`/`body-02`, the two commonest variant-naming schemes there are).
 * One splitter, two policies.
 */
export const splitNameTokens = (name: string): string[] =>
    name.toLowerCase().split(/[_\-\s.]+/).filter(Boolean);

export const stripExtension = (name: string): string => name.replace(/\.[^/.]+$/, '');

/** `01_body.png` → { order: 1, name: 'body' }. A numeric prefix is an explicit z-order opt-in. */
export function stripOrderPrefix(name: string): { order: number | null; name: string } {
    const m = name.match(/^(\d{1,3})[_\-.\s]+(.+)$/);
    return m ? { order: parseInt(m[1], 10), name: m[2] } : { order: null, name };
}

/**
 * Bottom-up paint order for LOOSE files with no folder structure and no numeric prefixes.
 * Lower number = further BACK. Deliberately short; it will be wrong for someone, and the review
 * screen lets them drag. First substring match wins, so order matters within this table.
 *
 * The famous trap is first: BACK-HAIR sits BEHIND the body.
 */
export const LAYER_ORDER_HINTS: { match: string[]; order: number }[] = [
    { match: ['hairback', 'backhair', 'hair_back', 'hair back', 'hair-b'], order: 50 },
    { match: ['base', 'body', 'skin', 'torso'], order: 100 },
    { match: ['leg', 'pant', 'bottom', 'skirt'], order: 200 },
    { match: ['feet', 'shoe', 'sock', 'boot'], order: 220 },
    { match: ['shirt', 'top', 'dress', 'outfit', 'cloth'], order: 300 },
    { match: ['jacket', 'coat', 'vest', 'cape', 'cloak'], order: 350 },
    { match: ['arm', 'hand'], order: 380 },
    { match: ['neck', 'collar', 'tie', 'scarf'], order: 400 },
    { match: ['face', 'head'], order: 500 },
    { match: ['blush', 'shadow', 'shading'], order: 520 },
    { match: ['brow', 'eyebrow'], order: 540 },
    { match: ['eye', 'pupil', 'sclera'], order: 560 },
    { match: ['nose'], order: 570 },
    { match: ['mouth', 'lip'], order: 580 },
    { match: ['ear'], order: 590 },
    { match: ['hair', 'bang', 'fringe'], order: 600 },
    { match: ['glasses'], order: 620 },
    { match: ['hat', 'cap', 'crown', 'horn'], order: 700 },
    { match: ['acc', 'prop', 'wing', 'tail'], order: 750 },
    { match: ['fx', 'effect', 'glow', 'highlight', 'shine'], order: 900 },
];
const UNKNOWN_ORDER = 800;

export function orderHintFor(layerName: string): number {
    const n = layerName.toLowerCase().replace(/[_\-\s]/g, '');
    for (const { match, order } of LAYER_ORDER_HINTS) {
        if (match.some(m => n.includes(m.replace(/[_\-\s]/g, '')))) return order;
    }
    return UNKNOWN_ORDER;
}

/**
 * Is this token a body part we recognise? Used as a second grouping signal: with only ONE file
 * called `mouth_sad.png` the "shared prefix" rule can't tell layer=mouth/variant=sad apart from a
 * layer literally named "mouth sad" — but we KNOW `mouth` is a layer, so we can.
 */
export const isKnownLayerName = (name: string): boolean => orderHintFor(name) !== UNKNOWN_ORDER;

// ── input / output ───────────────────────────────────────────────────────────

export interface NameEntry {
    /** Stable key back to the source (file index / psd layer key). */
    key: string;
    /** File name (with or without extension) OR a PSD/ORA leaf layer name. */
    name: string;
    /** Folder path from a folder-drop (webkitRelativePath) or the PSD/ORA group path. Explicit wins. */
    groupPath?: string[];
    /** PSD/ORA: the layer's own file order (bottom-first). When present it is AUTHORITATIVE. */
    sourceOrder?: number;
    /** PSD/ORA: was this variant visible in the source file? Seeds the "Default" expression. */
    visible?: boolean;
}

export interface PlannedVariant { key: string; name: string }

/**
 * What a group's children MEAN. This is the difference between an eye that works and an eye that
 * makes you pick one third of itself:
 *  • 'variants' — ALTERNATIVES. `Hair > [long, short]` → the player sees ONE of them.
 *  • 'parts'    — COMPONENTS.   `Eyes > [whites, iris, pupil]` → they all STACK to make the eye.
 */
export type LayerMode = 'variants' | 'parts';

export interface PlannedLayer {
    name: string;
    order: number;
    variants: PlannedVariant[];
    mode: LayerMode;
    /** Grouping was uncertain — the review UI highlights these rows. */
    ambiguous?: boolean;
}
export interface PlannedExpression {
    name: string;
    /** layerName → variant key (or null to leave the layer empty). */
    selection: Record<string, string | null>;
}

export interface GroupOptions {
    /**
     * Only true for LAYERED files (.psd/.ora), where "visible" is a real authored decision.
     * A folder of loose PNGs has every file "visible", so using it there would split every group.
     */
    useVisibility?: boolean;
}

/** Crude singular stem, so "eyes" and "eye" compare equal. */
const stem = (s: string) => s.toLowerCase().replace(/s$/, '');

/** "Eyes" + "whites" → "Eyes Whites". Group-qualified so two groups can both own a "shadow". */
export function partLayerName(groupName: string, variantName: string): string {
    const g = groupName.trim();
    const v = titleCase(variantName.trim());
    if (!v || /^default$/i.test(v)) return g;
    // Don't stutter: a part already called "Eye Whites" inside a group called "Eyes" stays as-is.
    // Compare word STEMS, or the singular/plural mismatch (eye vs eyes) misses every time.
    const gStem = stem(g);
    if (splitNameTokens(v).some(tk => stem(tk) === gStem)) return v;
    return `${g} ${v}`;
}

// ── grouping ─────────────────────────────────────────────────────────────────

const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());

/**
 * Group names into layers + variants.
 *
 * Rules, in priority order:
 *  1. An explicit groupPath (a folder, or a PSD/ORA group) WINS. Explicit beats clever.
 *  2. Otherwise: longest common token-PREFIX shared by ≥2 names becomes the layer; the remaining
 *     tokens are the variant. (Naive "first token = the layer" turns `left_eye_happy` and
 *     `right_eye_happy` into layers `left` and `right` — this doesn't.)
 *  3. A name matching no ≥2-member prefix becomes its own single-variant layer.
 */
export function groupSpriteNames(entries: NameEntry[], opts?: GroupOptions): PlannedLayer[] {
    // Visibility only MEANS something in a layered file. In a folder of loose PNGs every file is
    // "visible", so using it there would call every group `parts` and split everything apart.
    const useVisibility = !!opts?.useVisibility;

    const byLayer = new Map<string, { variants: PlannedVariant[]; orders: number[]; ambiguous: boolean; visibleCount: number }>();

    const add = (layerName: string, variantName: string, key: string, order: number | null, visible: boolean, ambiguous = false) => {
        const k = layerName.trim() || 'Layer';
        const cur = byLayer.get(k) ?? { variants: [], orders: [], ambiguous: false, visibleCount: 0 };
        cur.variants.push({ key, name: variantName.trim() || 'default' });
        if (order !== null) cur.orders.push(order);
        if (visible) cur.visibleCount++;
        cur.ambiguous = cur.ambiguous || ambiguous;
        byLayer.set(k, cur);
    };

    // 1. Explicit group paths first — they need no guessing at all.
    const implicit: { key: string; tokens: string[]; order: number | null; raw: string; visible: boolean }[] = [];
    for (const e of entries) {
        const explicitGroup = e.groupPath?.length ? e.groupPath[e.groupPath.length - 1] : null;
        const base = stripExtension(e.name);
        const { order, name } = stripOrderPrefix(base);
        const visible = e.visible !== false;

        if (explicitGroup) {
            add(explicitGroup, name, e.key, e.sourceOrder ?? order, visible);
            continue;
        }
        const tokens = splitNameTokens(name);
        if (!tokens.length) { add(name || 'Layer', 'default', e.key, e.sourceOrder ?? order, visible); continue; }
        implicit.push({ key: e.key, tokens, order: e.sourceOrder ?? order, raw: name, visible });
    }

    // 2. Longest common token-prefix with ≥2 members.
    // Count every prefix that still leaves ≥1 token over for the variant.
    const prefixCount = new Map<string, number>();
    for (const it of implicit) {
        for (let n = 1; n < it.tokens.length; n++) {
            const p = it.tokens.slice(0, n).join(' ');
            prefixCount.set(p, (prefixCount.get(p) ?? 0) + 1);
        }
    }
    for (const it of implicit) {
        let best: string | null = null;
        for (let n = it.tokens.length - 1; n >= 1; n--) {       // longest first
            const p = it.tokens.slice(0, n).join(' ');
            // Accept a prefix if it's SHARED (≥2 files) or if it's a body part we recognise —
            // a lone `mouth_sad.png` is still layer `mouth`, variant `sad`.
            if ((prefixCount.get(p) ?? 0) >= 2 || isKnownLayerName(p)) { best = p; break; }
        }
        if (best) {
            const variant = it.tokens.slice(best.split(' ').length).join(' ');
            add(best, variant, it.key, it.order, it.visible);
        } else {
            // 3. No shared prefix → its own layer, one variant.
            add(it.tokens.join(' '), 'default', it.key, it.order, it.visible);
        }
    }

    const layers: PlannedLayer[] = [];
    for (const [name, v] of byLayer) {
        // Duplicate or empty variant names inside one layer → flag for review.
        const names = v.variants.map(x => x.name);
        const ambiguous = v.ambiguous || new Set(names).size !== names.length;

        // PARTS vs ALTERNATIVES. The artist already told us, in the file: if they left two or more
        // of a group's layers VISIBLE at the same time (whites + iris + pupil), those layers stack
        // to make one thing. If only one is visible (happy, with sad hidden), they're alternatives.
        const mode: LayerMode = useVisibility && v.variants.length > 1 && v.visibleCount >= 2 ? 'parts' : 'variants';

        layers.push({
            name: titleCase(name),
            // A source/prefix order wins; otherwise fall back to the name table.
            order: v.orders.length ? Math.min(...v.orders) : orderHintFor(name),
            variants: v.variants,
            mode,
            ...(ambiguous ? { ambiguous: true } : {}),
        });
    }

    // Bottom-first. Stable on ties (insertion order preserved by the sort being stable in V8).
    return layers.sort((a, b) => a.order - b.order);
}

// ── expressions ──────────────────────────────────────────────────────────────

const STOP_TOKENS = new Set(['default', 'base', 'normal', 'neutral', 'layer', 'copy', 'png', 'psd']);

/** The layer's fallback variant: one literally called default/base/neutral, else the first. */
export function defaultVariantOf(layer: PlannedLayer): PlannedVariant | undefined {
    return layer.variants.find(v => /^(default|base|neutral|normal)$/i.test(v.name)) ?? layer.variants[0];
}

/**
 * Propose expressions from variant names shared ACROSS layers:
 *   eyes_happy + mouth_happy  →  an expression called "Happy".
 *
 * A token has to show up in ≥2 DIFFERENT layers to count — one layer having a `happy` variant tells
 * us nothing about the character's face as a whole.
 *
 * CRUCIAL: layers that have no matching variant fall back to their DEFAULT variant, not to null.
 * A "Happy" expression must still be wearing a body.
 */
export function deriveExpressions(layers: PlannedLayer[], opts?: { max?: number }): PlannedExpression[] {
    const max = opts?.max ?? 12;
    const out: PlannedExpression[] = [];

    // "Default": every layer's fallback. For PSD/ORA the caller can pre-mark the source-visible
    // variants as the layer's first, so this becomes "the character as it looked in the file".
    const defaultSel: Record<string, string | null> = {};
    for (const l of layers) defaultSel[l.name] = defaultVariantOf(l)?.key ?? null;
    out.push({ name: 'Default', selection: defaultSel });

    // A token that appears in EVERY name is a character prefix (`yuki_`), not an expression.
    const allVariantTokens = layers.flatMap(l => l.variants.map(v => splitNameTokens(v.name)));
    const ubiquitous = new Set<string>();
    if (allVariantTokens.length > 1) {
        for (const tk of allVariantTokens[0] ?? []) {
            if (allVariantTokens.every(list => list.includes(tk))) ubiquitous.add(tk);
        }
    }

    // token → the layers it appears in
    const layersByToken = new Map<string, Map<string, string>>();   // token → (layerName → variantKey)
    for (const l of layers) {
        for (const v of l.variants) {
            for (const tk of splitNameTokens(v.name)) {
                if (STOP_TOKENS.has(tk) || ubiquitous.has(tk) || /^\d+$/.test(tk)) continue;
                const m = layersByToken.get(tk) ?? new Map<string, string>();
                if (!m.has(l.name)) m.set(l.name, v.key);   // first match in that layer wins
                layersByToken.set(tk, m);
            }
        }
    }

    const candidates = [...layersByToken.entries()]
        .filter(([, m]) => m.size >= 2)                        // must span ≥2 layers
        .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));

    for (const [token, hits] of candidates.slice(0, max)) {
        const selection: Record<string, string | null> = {};
        for (const l of layers) {
            // The matching variant, else this layer's default — never null.
            selection[l.name] = hits.get(l.name) ?? defaultVariantOf(l)?.key ?? null;
        }
        out.push({ name: titleCase(token), selection });
    }

    return out;
}
