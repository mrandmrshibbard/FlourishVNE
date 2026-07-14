/**
 * Bulk sprite importer — the normalized intermediate.
 *
 * All three sources (loose PNGs / .ora / .psd) produce an `ImportedDoc`, and everything downstream
 * (review screen, raster pipeline, commit) only ever sees this. Add a fourth format later and
 * nothing but a new `*Source.ts` has to change.
 */

export type ImportSourceKind = 'files' | 'ora' | 'psd';

export interface Rect { x: number; y: number; w: number; h: number }

export type WarnCode =
    | 'color-mode' | 'bit-depth'          // document-level, usually fatal
    | 'layer-effects' | 'adjustment-layer' | 'blend-mode' | 'clipping-mask' | 'layer-mask'
    | 'no-alpha' | 'size-mismatch' | 'aspect-mismatch' | 'empty-layer' | 'parse';

export interface ImportWarning {
    code: WarnCode;
    /** 'error' blocks the import; 'warn'/'info' are shown but don't block. */
    severity: 'info' | 'warn' | 'error';
    /** Already-interpolated PLAIN LANGUAGE. Never jargon — the reader is an artist, not a coder. */
    message: string;
    layerName?: string;
}

export interface ImportedLayer {
    /** Stable within one parse — React key, and how the plan refers back to the pixels. */
    key: string;
    /** Leaf name (order-prefix already stripped). */
    name: string;
    /** Folder / PSD group path. Empty for loose files with no folders. */
    groupPath: string[];
    /** EFFECTIVE — the parser has already folded in every ancestor group's state. */
    visible: boolean;
    /** EFFECTIVE, 0..1. Baked into the pixels at raster time (VNLayerAsset has no opacity field). */
    opacity: number;
    /** Anything other than 'normal' gets a warning — the engine stacks layers normally. */
    blendMode: string;
    /** Position in DOC coordinates. May be negative or overflow the doc; drawImage clips naturally. */
    rect: Rect;
    /** Bottom-first index. 0 = furthest back. */
    order: number;

    /** LAZY. Returns an ImageBitmap the caller MUST `.close()`. */
    getSource(): Promise<CanvasImageSource>;
    /** LAZY + cached object URL for the review tile. Freed by `doc.dispose()`. */
    getThumbnail(maxPx?: number): Promise<string>;
    /** PSD only: a layer mask / clipping base to intersect into this layer's alpha. */
    getAlphaMask?(): Promise<AlphaMask | null>;
    /** FAST PATH: the untouched original, when it's already a full-canvas PNG (loose files only). */
    originalFile?: File;
    /** Drop any retained raster for this layer once the commit loop is done with it. */
    release(): void;

    warnings: ImportWarning[];
}

export interface AlphaMask {
    src: CanvasImageSource;
    rect: Rect;
    /** 'luminance' = a PSD mask (grey → alpha). 'alpha' = a clipping base (use its alpha directly). */
    kind: 'luminance' | 'alpha';
    /** PSD masks: what applies OUTSIDE the mask rect. Getting this wrong erases the whole layer. */
    defaultColor?: 0 | 255;
}

export interface ImportedDoc {
    kind: ImportSourceKind;
    width: number;
    height: number;
    /** ALWAYS bottom-first. Each parser normalizes; nothing downstream re-sorts. */
    layers: ImportedLayer[];
    warnings: ImportWarning[];
    /** Release zip handles, retained canvases and thumbnail object URLs. */
    dispose(): void;
}

// ── the reviewed, ready-to-commit plan ───────────────────────────────────────

export interface PlanVariant {
    /** Points back at ImportedLayer.key */
    key: string;
    name: string;
    include: boolean;
}

export interface PlanLayer {
    name: string;
    variants: PlanVariant[];
    /**
     * 'variants' → ALTERNATIVES: one layer, the player sees one of them (Hair: long OR short).
     * 'parts'    → COMPONENTS: this becomes ONE LAYER PER VARIANT, all stacked, all shown together
     *               (Eyes: whites + iris + pupil). Expanded at commit time.
     */
    mode: 'variants' | 'parts';
    /** Existing layer this merges into (matched by name) — reuse its id so bindings keep resolving. */
    existingLayerId?: string;
    ambiguous?: boolean;
}

export interface PlanExpression {
    name: string;
    include: boolean;
    /** layerName → ImportedLayer.key (or null for "leave this layer empty"). */
    selection: Record<string, string | null>;
}

export interface ImportPlan {
    doc: ImportedDoc;
    layers: PlanLayer[];
    expressions: PlanExpression[];
    /** Downscale target. null = import at full size. */
    resizeTo: { width: number; height: number } | null;
    /** Fill newly-added layers into the character's PRE-EXISTING expressions. */
    addLayersToExistingExpressions: boolean;
}
