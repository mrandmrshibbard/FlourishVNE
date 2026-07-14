/**
 * Bulk sprite importer — the raster pipeline.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY WE PAD EVERY LAYER TO THE FULL CANVAS (this is the whole ball game)
 *
 * The engine draws each character layer as its own <img class="w-full h-full object-contain">
 * inside a shared aspect-[3/4] frame (LivePreview ~4412). Each image is fitted BY ITS OWN ASPECT
 * RATIO, independently. So the alignment invariant is ASPECT RATIO, not pixel size.
 *
 * PSD/ORA store each layer trimmed to its own bounding box with an (x,y) offset. If we exported
 * those trimmed rasters as-is, a trimmed `eyes` layer would have a different aspect than a trimmed
 * `body`, get a different contain-scale, and land in the wrong place on stage. And VNLayerAsset has
 * no offset field to correct it with. So: ALWAYS pad back to the full doc canvas. (It costs almost
 * nothing on disk — transparent margins deflate to noise.)
 *
 * AND WHY WE RESAMPLE EXACTLY ONCE, AT THE END:
 * Scale-then-pad would round each layer's offset independently → up to 1px of per-layer drift →
 * visible seams between hair and head. Padding at full resolution keeps every offset an exact
 * integer, and the single trailing resample applies the identical transform to all layers.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { AlphaMask, ImportedDoc, ImportedLayer } from './types';

/** Above this many megapixels we resize each layer BEFORE padding, to avoid OOM on huge docs. */
const LOW_MEMORY_MPIX = 30;

/** Never upscale. Fit the doc inside the game resolution (times an optional headroom multiplier). */
export function computeResizeTarget(
    docW: number, docH: number,
    game: { width: number; height: number } | undefined,
    headroom = 1,
): { width: number; height: number } | null {
    if (!game?.width || !game?.height) return null;
    const s = Math.min(1, (game.width * headroom) / docW, (game.height * headroom) / docH);
    if (s >= 1) return null;                       // already smaller than the game — leave it alone
    const width = Math.max(2, Math.round(docW * s / 2) * 2);   // even numbers
    const height = Math.max(2, Math.round(docH * s / 2) * 2);
    return { width, height };
}

/**
 * Intersect a mask into the padded layer's alpha.
 * Handles BOTH a PSD layer mask (grey → alpha) and a clipping mask (use the base layer's alpha).
 * Ignoring these is silent corruption — a hair layer that should be cut off would render in full.
 */
function applyAlphaIntersect(pctx: CanvasRenderingContext2D, w: number, h: number, m: AlphaMask): void {
    const s = document.createElement('canvas');
    s.width = w; s.height = h;
    const sctx = s.getContext('2d', { willReadFrequently: m.kind === 'luminance' })!;

    if (m.kind === 'luminance') {
        // `defaultColor` applies OUTSIDE the mask rect. Skipping this pre-fill is the classic bug:
        // a mask with defaultColor 255 would erase everything beyond its own bounds.
        sctx.fillStyle = m.defaultColor === 255 ? '#fff' : '#000';
        sctx.fillRect(0, 0, w, h);
        sctx.drawImage(m.src, m.rect.x, m.rect.y);
        const id = sctx.getImageData(0, 0, w, h);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) d[i + 3] = d[i];   // luminance → alpha
        sctx.putImageData(id, 0, 0);
    } else {
        sctx.drawImage(m.src, m.rect.x, m.rect.y);               // clipping base: alpha is already right
    }

    pctx.globalCompositeOperation = 'destination-in';            // keep only where the mask is opaque
    pctx.drawImage(s, 0, 0);
    pctx.globalCompositeOperation = 'source-over';
    s.width = s.height = 0;                                      // free NOW (see note in rasterizeLayers)
}

export interface RasterOptions {
    resizeTo: { width: number; height: number } | null;
    applyMasks?: boolean;                       // default true
    signal?: AbortSignal;
    onProgress?: (done: number, total: number, name: string) => void;
}

/**
 * Rasterize the chosen layers, one at a time, handing each finished PNG to `emit`.
 *
 * Strictly sequential on purpose: that's what bounds memory. Peak is ONE pad canvas + ONE out
 * canvas + ONE bitmap (~80MB on a 4096² doc), not 40 × 64MB — and it goes DOWN as the run proceeds,
 * because each layer's source raster is released the moment it's been drawn.
 */
export async function rasterizeLayers(
    doc: ImportedDoc,
    layers: ImportedLayer[],
    opts: RasterOptions,
    emit: (layer: ImportedLayer, file: File) => Promise<void>,
): Promise<void> {
    const applyMasks = opts.applyMasks !== false;
    const target = opts.resizeTo;
    const scale = target ? target.width / doc.width : 1;
    const lowMem = (doc.width * doc.height) / 1e6 > LOW_MEMORY_MPIX;

    const padW = lowMem && target ? target.width : doc.width;
    const padH = lowMem && target ? target.height : doc.height;

    const pad = document.createElement('canvas');
    pad.width = padW; pad.height = padH;
    const pctx = pad.getContext('2d', { alpha: true })!;

    // Only allocate the second canvas when we're actually downscaling from a full-res pad.
    const needsOut = !!target && !lowMem;
    const out = needsOut ? document.createElement('canvas') : null;
    if (out && target) { out.width = target.width; out.height = target.height; }
    const octx = out?.getContext('2d') ?? null;
    if (octx) octx.imageSmoothingQuality = 'high';

    try {
        let done = 0;
        for (const layer of layers) {
            if (opts.signal?.aborted) throw new DOMException('Import cancelled', 'AbortError');
            opts.onProgress?.(done, layers.length, layer.name);

            // FAST PATH: a loose PNG that's already full-canvas and needs no resize — don't touch a
            // canvas at all. Zero decode, zero re-encode, zero quality loss.
            if (layer.originalFile && !target
                && layer.rect.x === 0 && layer.rect.y === 0
                && layer.rect.w === doc.width && layer.rect.h === doc.height
                && layer.opacity === 1) {
                await emit(layer, layer.originalFile);
                layer.release();
                done++;
                continue;
            }

            const bmp = await layer.getSource();

            pctx.setTransform(1, 0, 0, 1, 0, 0);
            pctx.clearRect(0, 0, padW, padH);            // REUSE the canvas — never reallocate
            pctx.globalCompositeOperation = 'source-over';
            pctx.globalAlpha = layer.opacity;            // BAKE opacity: VNLayerAsset has no opacity field

            if (lowMem && target) {
                // Huge doc: resize each layer before placing it, so we never hold a full-res canvas.
                // Costs sub-pixel phase differences between layers — invisible on sprite art, and
                // it's the difference between working and running out of memory on an 8000² PSD.
                const sw = Math.max(1, Math.round(layer.rect.w * scale));
                const sh = Math.max(1, Math.round(layer.rect.h * scale));
                const small = await createImageBitmap(bmp as any, { resizeWidth: sw, resizeHeight: sh, resizeQuality: 'high' });
                pctx.drawImage(small, layer.rect.x * scale, layer.rect.y * scale);   // sub-pixel placement is fine
                small.close();
            } else {
                pctx.drawImage(bmp, layer.rect.x, layer.rect.y);   // integer offsets; clips naturally
            }

            pctx.globalAlpha = 1;
            if (typeof ImageBitmap !== 'undefined' && bmp instanceof ImageBitmap) bmp.close();

            if (applyMasks && layer.getAlphaMask) {
                const m = await layer.getAlphaMask();
                if (m) applyAlphaIntersect(pctx, padW, padH, m);
            }
            layer.release();                              // drop the parser's retained raster NOW

            let encodeFrom: HTMLCanvasElement = pad;
            if (out && octx && target) {
                // THE ONE AND ONLY RESAMPLE. createImageBitmap resamples on PREMULTIPLIED data, so
                // there's no dark/white halo around soft edges (a hand-rolled ImageData average WOULD
                // produce one, by dragging the RGB of transparent pixels into their neighbours).
                const small = await createImageBitmap(pad, {
                    resizeWidth: target.width, resizeHeight: target.height, resizeQuality: 'high',
                });
                octx.clearRect(0, 0, out.width, out.height);
                octx.drawImage(small, 0, 0);              // 1:1 blit — no second resample
                small.close();
                encodeFrom = out;
            }

            const blob = await new Promise<Blob | null>(r => encodeFrom.toBlob(r, 'image/png'));
            if (!blob) throw new Error(`Could not save the layer "${layer.name}".`);
            // ingestUpload reads file.name for the extension, so a bare Blob won't do.
            await emit(layer, new File([blob], `${layer.key}.png`, { type: 'image/png' }));

            done++;
            opts.onProgress?.(done, layers.length, layer.name);
        }
    } finally {
        // Load-bearing: nulling the JS reference leaves a 67MB backing store alive until GC feels
        // like running. Setting width/height to 0 frees it immediately.
        pad.width = pad.height = 0;
        if (out) { out.width = out.height = 0; }
    }
}
