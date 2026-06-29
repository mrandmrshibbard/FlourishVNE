/**
 * alphaBounds — compute the tight bounding box around the VISIBLE (non-transparent) pixels of an
 * image, returned as normalized inset fractions (a VNContentBox: left/top/right/bottom in 0–1 of the
 * full image). Used by the "Trim to visible edges" action so snapping/fit/guide/hit-area can ignore
 * the transparent padding around a sprite, image, or image button.
 *
 * Runs entirely in the editor via an offscreen <canvas>. CAVEAT: reading pixels requires a readable
 * (untainted) canvas — local / data: / flourish-asset:// assets are fine; a cross-origin remote URL
 * can taint the canvas and throw on getImageData. We set crossOrigin='anonymous' (works when the host
 * sends CORS headers) and resolve to `null` on any failure so the caller can fall back gracefully.
 *
 * Results are cached per (url, alphaThreshold) — alpha scanning is O(w·h), so we only do it once.
 */
import { VNContentBox } from '../types';

const cache = new Map<string, VNContentBox | null>();

/** Largest dimension we rasterize to before scanning (keeps a 4K asset fast; sub-pixel precision is
 *  irrelevant for a normalized box). */
const MAX_SAMPLE = 512;

export interface AlphaBoundsOptions {
    /** Alpha (0–255) above which a pixel counts as visible. Default 10. */
    alphaThreshold?: number;
    /**
     * The element box's aspect ratio (width / height) that the image is `object-contain`'d into.
     * When provided, the returned insets are expressed relative to the ELEMENT BOX (not the image),
     * accounting for the letterbox gap — so the content box hugs the visible art on BOTH axes even
     * when the sprite is letterboxed (e.g. a character in a fixed 3:4 frame). Omit when the element
     * box already hugs the image (e.g. an image button with height:auto), where it would be identity.
     */
    boxAspect?: number;
}

export async function computeAlphaBounds(url: string, opts: AlphaBoundsOptions = {}): Promise<VNContentBox | null> {
    const alphaThreshold = opts.alphaThreshold ?? 10;
    const boxAspect = opts.boxAspect;
    if (!url) return null;
    const key = `${alphaThreshold}|${boxAspect ?? 'img'}|${url}`;
    if (cache.has(key)) return cache.get(key) ?? null;

    const result = await new Promise<VNContentBox | null>((resolve) => {
        const img = new Image();
        // Best-effort CORS so remote assets with proper headers stay readable.
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const iw = img.naturalWidth || img.width;
                const ih = img.naturalHeight || img.height;
                if (!iw || !ih) { resolve(null); return; }
                const scale = Math.min(1, MAX_SAMPLE / Math.max(iw, ih));
                const w = Math.max(1, Math.round(iw * scale));
                const h = Math.max(1, Math.round(ih * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) { resolve(null); return; }
                ctx.drawImage(img, 0, 0, w, h);
                const data = ctx.getImageData(0, 0, w, h).data; // may throw if tainted
                let minX = w, minY = h, maxX = -1, maxY = -1;
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const a = data[(y * w + x) * 4 + 3];
                        if (a > alphaThreshold) {
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                        }
                    }
                }
                if (maxX < 0) { resolve(null); return; } // fully transparent
                // Image-relative inset fractions. +1 on the far edges (inclusive pixel indices).
                const imgBox = {
                    left: minX / w,
                    top: minY / h,
                    right: 1 - (maxX + 1) / w,
                    bottom: 1 - (maxY + 1) / h,
                };
                if (!boxAspect || boxAspect <= 0) { resolve(imgBox); return; }
                // Convert image-space insets → element-box-space, accounting for the object-contain
                // letterbox. imageAspect = iw/ih; the image is fit inside a box of aspect `boxAspect`.
                const imageAspect = iw / ih;
                let rWFrac: number, rHFrac: number; // rendered image size as a fraction of the element box
                if (imageAspect > boxAspect) { rWFrac = 1; rHFrac = boxAspect / imageAspect; } // fills width
                else { rHFrac = 1; rWFrac = imageAspect / boxAspect; }                          // fills height
                const offX = (1 - rWFrac) / 2; // symmetric letterbox gap on each side
                const offY = (1 - rHFrac) / 2;
                resolve({
                    left: offX + imgBox.left * rWFrac,
                    right: offX + imgBox.right * rWFrac,
                    top: offY + imgBox.top * rHFrac,
                    bottom: offY + imgBox.bottom * rHFrac,
                });
            } catch {
                resolve(null); // tainted canvas / read blocked
            }
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });

    cache.set(key, result);
    return result;
}

/** True when the box meaningfully trims the image (any edge inset more than ~0.5%). */
export function isMeaningfulBox(b: VNContentBox | null | undefined): boolean {
    if (!b) return false;
    return b.left > 0.005 || b.top > 0.005 || b.right > 0.005 || b.bottom > 0.005;
}
