/**
 * Custom mouse-pointer builder — THE single place cursor CSS values are made.
 *
 * A CSS `cursor: url(...)` has hard browser rules: images over 128px are ignored
 * outright (and Windows can degrade anything over ~32px), the image can't be scaled
 * by CSS, and an out-of-bounds hot spot rejects the whole cursor. So each author
 * image is downscaled ONCE through an offscreen canvas to the chosen size and
 * baked into a data URL — which also erases the desktop/web scheme differences
 * (flourish-asset:// vs relative assets/ paths) so built games behave identically.
 *
 * Failure ladder (a broken image must NEVER break the game):
 *   canvas data URL → raw url() with keyword fallback → bare keyword.
 */
import { VNID } from '../types';
import type { VNProject } from '../types/project';
import type { VNCursorSlot } from '../features/ui/types';

export const CURSOR_MAX_SIZE = 128;
export const CURSOR_DEFAULT_SIZE = 32;

const cache = new Map<string, string>();

/** Resolve a cursor image ref to its raw URL (images first, then backgrounds). */
export function resolveCursorAssetUrl(project: VNProject, ref: { id: VNID } | null | undefined): string | null {
    if (!ref?.id) return null;
    const rec: any = (project.images as any)?.[ref.id] || (project.backgrounds as any)?.[ref.id];
    return rec?.imageUrl || null;
}

/** Build a full CSS cursor value: `url(data:...) hx hy, fallback`. */
export async function buildCursorValue(
    url: string,
    size: number | undefined,
    hotPreset: 'tip' | 'center' | undefined,
    hotX: number | undefined,
    hotY: number | undefined,
    fallback: string,
    cacheKey?: string,
): Promise<string> {
    const px = Math.max(8, Math.min(CURSOR_MAX_SIZE, size || CURSOR_DEFAULT_SIZE));
    const key = cacheKey ? `${cacheKey}|${px}|${hotPreset}|${hotX}|${hotY}` : '';
    if (key && cache.has(key)) return cache.get(key)!;
    const finish = (v: string): string => { if (key) cache.set(key, v); return v; };
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error('cursor image failed to load'));
            im.src = url;
        });
        const scale = px / Math.max(1, img.naturalWidth);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const cvs = document.createElement('canvas');
        cvs.width = w; cvs.height = h;
        const ctx = cvs.getContext('2d');
        if (!ctx) return finish(`url(${JSON.stringify(url)}) 0 0, ${fallback}`);
        ctx.drawImage(img, 0, 0, w, h);
        let hx = hotPreset === 'center' ? Math.round(w / 2) : 0;
        let hy = hotPreset === 'center' ? Math.round(h / 2) : 0;
        if (typeof hotX === 'number') hx = Math.round(hotX);
        if (typeof hotY === 'number') hy = Math.round(hotY);
        // An out-of-bounds hot spot makes browsers reject the cursor entirely — clamp.
        hx = Math.max(0, Math.min(w - 1, hx));
        hy = Math.max(0, Math.min(h - 1, hy));
        const dataUrl = cvs.toDataURL('image/png');
        return finish(`url(${dataUrl}) ${hx} ${hy}, ${fallback}`);
    } catch {
        try {
            return finish(`url(${JSON.stringify(url)}) 0 0, ${fallback}`);
        } catch {
            return finish(fallback);
        }
    }
}

/** Build one game-wide slot's value, or null when the slot has no image. */
export async function buildSlotValue(
    project: VNProject,
    slot: VNCursorSlot | undefined,
    fallback: string,
): Promise<string | null> {
    const url = resolveCursorAssetUrl(project, slot?.image || null);
    if (!url) return null;
    return buildCursorValue(url, slot?.size, slot?.hotPreset, slot?.hotX, slot?.hotY, fallback, slot?.image?.id);
}

/** Every custom cursor image ref used anywhere in the project (for the boot prebuild). */
export function collectCursorAssetRefs(project: VNProject): Array<{ id: VNID }> {
    const out: Array<{ id: VNID }> = [];
    const push = (ref: any) => { if (ref?.id) out.push({ id: ref.id }); };
    const cur: any = (project.ui as any)?.cursors;
    if (cur) { push(cur.normal?.image); push(cur.hand?.image); push(cur.drag?.image); }
    Object.values(project.uiScreens || {}).forEach((screen: any) => {
        Object.values(screen.elements || {}).forEach((el: any) => {
            push(el.hoverCursorImage);
            (el.draggableImageElementRegions || []).forEach((r: any) => push(r.cursorImage));
        });
    });
    Object.values(project.scenes || {}).forEach((scene: any) => {
        (scene.commands || []).forEach((cmd: any) => {
            push(cmd.hoverCursorImage);
            (cmd.draggableImageElementRegions || []).forEach((r: any) => push(r.cursorImage));
        });
    });
    return out;
}
