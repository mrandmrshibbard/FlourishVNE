/**
 * Bulk sprite importer — source: Photoshop (.psd), also what Clip Studio exports.
 *
 * Uses `ag-psd`, loaded with a DYNAMIC import so ~250KB of PSD parser never lands in the startup
 * bundle (see the `manualChunks` rule in vite.config.ts).
 *
 * ⚠️ Z-ORDER: PSD stores layers BOTTOM-first (the opposite of ORA — see oraSource.ts). ag-psd
 * preserves file order, so `children[0]` is the bottom layer and our array is already bottom-first.
 *
 * WHAT WE CANNOT IMPORT — and say so plainly rather than corrupting silently:
 *  • Layer EFFECTS (drop shadow, stroke, glow). Photoshop draws these live; they are NOT part of the
 *    layer's pixels, so they simply won't come across. This is the #1 "why does my import look
 *    wrong". Tell the artist to Rasterize Layer Style.
 *  • Adjustment layers — they recolour what's beneath them; they aren't sprites.
 *  • Blend modes — the engine stacks layers normally.
 *  • Layer MASKS and CLIPPING masks we DO honour (see raster.ts) — ignoring those is silent
 *    corruption (a hair layer that should be cut off would render in full).
 */
import { AlphaMask, ImportedDoc, ImportedLayer, ImportWarning } from './types';

/** ag-psd preserves PSD file order, and PSD stores layers bottom-first. */
const PSD_CHILDREN_BOTTOM_FIRST = true;

interface Node {
    l: any; groupPath: string[]; visible: boolean; opacity: number;
    rect: { x: number; y: number; w: number; h: number };
}

function walk(nodes: any[], path: string[], visible: boolean, opacity: number, out: Node[]) {
    const list = PSD_CHILDREN_BOTTOM_FIRST ? nodes : [...nodes].reverse();
    for (const l of list) {
        const v = visible && !l.hidden;
        const o = opacity * (typeof l.opacity === 'number' ? l.opacity : 1);
        if (l.children) {                                  // a GROUP → becomes a layer name
            walk(l.children, [...path, l.name || 'Group'], v, o, out);
            continue;
        }
        const w = (l.right ?? 0) - (l.left ?? 0);
        const h = (l.bottom ?? 0) - (l.top ?? 0);
        if (w <= 0 || h <= 0) continue;                    // empty layer / section divider
        out.push({ l, groupPath: path, visible: v, opacity: o, rect: { x: l.left, y: l.top, w, h } });
    }
}

export async function readPsdSource(file: File): Promise<ImportedDoc> {
    const { readPsd } = await import('ag-psd');
    const buf = await file.arrayBuffer();

    // PHASE 1 — structure only. No pixel decode, so the review screen opens instantly even on a
    // very large file.
    const structure: any = readPsd(buf, {
        skipLayerImageData: true,
        skipCompositeImageData: true,
        skipThumbnail: true,
        skipLinkedFilesData: true,
    });

    const width = structure.width, height = structure.height;
    const warnings: ImportWarning[] = [];

    // colorMode 3 = RGB. Anything else won't give us usable sprite pixels.
    if (typeof structure.colorMode === 'number' && structure.colorMode !== 3) {
        throw new Error('This PSD is not in RGB colour. In Photoshop: Image → Mode → RGB Color, then save again.');
    }
    if (structure.bitsPerChannel && structure.bitsPerChannel !== 8) {
        warnings.push({
            code: 'bit-depth', severity: 'warn',
            message: `This PSD is ${structure.bitsPerChannel} bits per channel. Colours may come out wrong — in Photoshop use Image → Mode → 8 Bits/Channel and save again.`,
        });
    }

    // PHASE 2 — decode pixels, once, on first access.
    let hydrated: any = null;
    const hydrate = (): any => {
        if (hydrated) return hydrated;
        hydrated = readPsd(buf, {
            skipCompositeImageData: true,     // we never want the flattened composite
            skipThumbnail: true,
            skipLinkedFilesData: true,
            useImageData: false,              // give us layer.canvas — drawImage-able
        });
        return hydrated;
    };

    const structNodes: Node[] = [];
    walk(structure.children ?? [], [], true, 1, structNodes);
    if (!structNodes.length) throw new Error('That PSD has no layers we can import.');

    /** Same walk over the hydrated tree, so index N lines up with index N of the structure walk. */
    let hydratedNodes: Node[] | null = null;
    const hydratedAt = (i: number): any => {
        if (!hydratedNodes) {
            const out: Node[] = [];
            walk(hydrate().children ?? [], [], true, 1, out);
            hydratedNodes = out;
        }
        return hydratedNodes[i]?.l;
    };

    const thumbUrls: string[] = [];

    const layers: ImportedLayer[] = structNodes.map((n, i) => {
        const w: ImportWarning[] = [];
        const name = n.l.name || `Layer ${i + 1}`;

        if (n.l.effects) {
            w.push({
                code: 'layer-effects', severity: 'warn', layerName: name,
                message: `"${name}" has a layer style (drop shadow / stroke / glow). Photoshop draws those live — they aren't part of the layer's image, so they won't be imported. Right-click the layer → Rasterize Layer Style, then save again.`,
            });
        }
        if (n.l.adjustment) {
            w.push({
                code: 'adjustment-layer', severity: 'warn', layerName: name,
                message: `"${name}" is an adjustment layer — it recolours the layers below it, so it can't come across as a sprite. Flatten it into your art first.`,
            });
        }
        if (n.l.blendMode && n.l.blendMode !== 'normal') {
            w.push({
                code: 'blend-mode', severity: 'warn', layerName: name,
                message: `"${name}" uses the "${n.l.blendMode}" blend mode. The game stacks layers normally, so it will look different here.`,
            });
        }

        let thumb: string | null = null;

        const sourceCanvas = (): HTMLCanvasElement => {
            const hl = hydratedAt(i);
            const c = hl?.canvas;
            if (!c) throw new Error(`Photoshop didn't store any pixels for the layer "${name}".`);
            return c;
        };

        return {
            key: `p${i}`,
            name,
            groupPath: n.groupPath,
            visible: n.visible,
            opacity: n.opacity,
            blendMode: n.l.blendMode || 'normal',
            rect: n.rect,
            order: i,                                   // bottom-first (see the constant above)
            getSource: async () => sourceCanvas(),
            getThumbnail: async () => {
                if (thumb) return thumb;
                const c = sourceCanvas();
                const max = 96;
                const s = Math.min(1, max / Math.max(c.width, c.height));
                const t = document.createElement('canvas');
                t.width = Math.max(1, Math.round(c.width * s));
                t.height = Math.max(1, Math.round(c.height * s));
                t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height);
                const blob = await new Promise<Blob | null>(r => t.toBlob(r, 'image/png'));
                t.width = t.height = 0;
                thumb = blob ? URL.createObjectURL(blob) : '';
                if (thumb) thumbUrls.push(thumb);
                return thumb;
            },
            // Layer masks / clipping masks are NOT baked into layer.canvas. Skipping them would
            // silently render a layer that should have been cut off.
            getAlphaMask: async (): Promise<AlphaMask | null> => {
                const hl = hydratedAt(i);
                if (hl?.mask && !hl.mask.disabled && hl.mask.canvas) {
                    return {
                        src: hl.mask.canvas,
                        rect: { x: hl.mask.left ?? 0, y: hl.mask.top ?? 0, w: 0, h: 0 },
                        kind: 'luminance',
                        defaultColor: (hl.mask.defaultColor === 255 ? 255 : 0),
                    };
                }
                if (hl?.clipping) {
                    // Clipped to the nearest NON-clipping layer beneath it (blush clipped to skin).
                    for (let j = i - 1; j >= 0; j--) {
                        const base = hydratedAt(j);
                        if (base && !base.clipping && base.canvas) {
                            const bn = structNodes[j];
                            return { src: base.canvas, rect: { ...bn.rect }, kind: 'alpha' };
                        }
                    }
                }
                return null;
            },
            release: () => {
                const hl = hydratedNodes?.[i]?.l;
                if (hl?.canvas) { hl.canvas.width = 0; hl.canvas.height = 0; hl.canvas = undefined; }
                hl && (hl.imageData = undefined);
            },
            warnings: w,
        } satisfies ImportedLayer;
    });

    return {
        kind: 'psd',
        width, height, layers, warnings,
        dispose: () => {
            thumbUrls.forEach(URL.revokeObjectURL);
            thumbUrls.length = 0;
            hydrated = null;
            hydratedNodes = null;
        },
    };
}
