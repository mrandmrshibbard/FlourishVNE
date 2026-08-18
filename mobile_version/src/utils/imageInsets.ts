/**
 * Transparent-margin measurement for UI art (choice buttons).
 *
 * Imported button images often carry baked-in transparent margins — frequently ASYMMETRIC
 * (Ren'Py GUI art reserves focus-offset space on one side; measured real case: a 1330×125
 * choice background with a 163px transparent LEFT margin and 7px right). Under 'stretch'
 * those margins scale with the button, so text aligned to the layout box drifts off the
 * VISIBLE art — centered text can cross its edge. The choice renderer uses these insets to
 * align text to the art's visible region instead.
 *
 * `getImageContentInsets(url, onReady)` returns the transparent margins as fractions of the
 * image size, null when the art is opaque edge-to-edge or unreadable (cross-origin, decode
 * failure — callers keep classic behavior), or undefined while the async scan is running
 * (onReady fires when the answer lands so callers can re-render). Cached per URL.
 */

export interface ImageContentInsets {
    left: number;   // fraction of image width  (0..1)
    right: number;
    top: number;    // fraction of image height (0..1)
    bottom: number;
}

// Insets smaller than this (per side) are treated as "opaque enough" — the default
// rendering path stays byte-identical for normal full-bleed art.
const SIGNIFICANT = 0.01;

// Downscale target for the alpha scan — fraction accuracy ~1/160 at trivial decode cost.
const SCAN_MAX = 160;

const cache = new Map<string, ImageContentInsets | null>();
const listeners = new Map<string, Array<() => void>>();

function computeInsets(img: HTMLImageElement): ImageContentInsets | null {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) return null;
    const scale = Math.min(1, SCAN_MAX / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    // getImageData throws on tainted canvases (cross-origin art) — caller catches.
    const data = ctx.getImageData(0, 0, w, h).data;
    let minX = w, maxX = -1, minY = h, maxY = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > 8) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) return null; // fully transparent — nothing sensible to align to
    const insets: ImageContentInsets = {
        left: minX / w,
        right: (w - 1 - maxX) / w,
        top: minY / h,
        bottom: (h - 1 - maxY) / h,
    };
    if (insets.left < SIGNIFICANT && insets.right < SIGNIFICANT && insets.top < SIGNIFICANT && insets.bottom < SIGNIFICANT) {
        return null; // effectively full-bleed — keep the classic path
    }
    return insets;
}

export function getImageContentInsets(url: string, onReady?: () => void): ImageContentInsets | null | undefined {
    if (cache.has(url)) return cache.get(url);
    if (listeners.has(url)) {
        if (onReady) listeners.get(url)!.push(onReady);
        return undefined;
    }
    listeners.set(url, onReady ? [onReady] : []);
    const settle = (result: ImageContentInsets | null) => {
        cache.set(url, result);
        const ls = listeners.get(url) || [];
        listeners.delete(url);
        ls.forEach(l => { try { l(); } catch { /* listener errors must not break others */ } });
    };
    try {
        const img = new Image();
        img.onload = () => { try { settle(computeInsets(img)); } catch { settle(null); } };
        img.onerror = () => settle(null);
        img.src = url;
    } catch {
        settle(null);
    }
    return undefined;
}
