/**
 * Where one sprite piece sits inside Flourish's fixed 3:4 sprite box.
 *
 * Verified against the game's own compositor (`Portrait.render` in portrait.rpy): it allocates a
 * canvas of exactly the `Portrait(width, height)` kwargs and blits EVERY part at `(0, 0)`. Parts
 * are canvas-width, top-aligned crops - `cove_8`'s canvas is 615x1439 and its eye art is 615x516.
 *
 * So the mapping is two steps:
 *   1. The canvas is `object-contain`-fitted into the 3:4 element box, which pillarboxes a tall
 *      canvas (centred horizontally) or letterboxes a wide one (centred vertically).
 *   2. Each piece takes the top-left corner of that canvas rect, scaled by its own pixel size.
 *
 * 🔴 The canvas comes from the `Portrait(...)` kwargs, NEVER from `base.png`. Reading it from art
 * is defect 5: `none.png` - the CLEAR sentinel, not a real layer - is a 30x54 stub, and using it
 * as the canvas made boxes roughly 64x oversized.
 *
 * A `VNLayerBox` is percent of the sprite box and renders as `left/top/width/height` with the
 * image `object-contain` inside it, so the box's pixel aspect must equal the art's aspect for the
 * result to be exact. It does: for a tall canvas the box is `W_e*cW*pw/(100*Wc)` wide and
 * `(4/3)*W_e*ph/Hc` tall, whose ratio reduces to `pw/ph`.
 */
import { SPRITE_FRAME } from '../ir/engineContract';
import type { Size } from '../model/imageSize';

export interface Rect { x: number; y: number; width: number; height: number }

/** The 3:4 box's aspect as width/height (0.75). */
const FRAME_ASPECT = SPRITE_FRAME.aspect;

/**
 * Where the canvas lands inside the 3:4 element box, in percent.
 * Tall canvas -> full height, pillarboxed. Wide canvas -> full width, letterboxed.
 */
export function canvasRect(canvas: Size): Rect {
    const a = canvas.width / canvas.height;
    if (a <= FRAME_ASPECT) {
        const width = 100 * (a / FRAME_ASPECT);
        return { x: (100 - width) / 2, y: 0, width, height: 100 };
    }
    const height = 100 * (FRAME_ASPECT / a);
    return { x: 0, y: (100 - height) / 2, width: 100, height };
}

/** True for a box that covers the whole sprite box, which the engine stores as ABSENT. */
export function isFullRect(r: Rect, epsilon = 1e-9): boolean {
    return Math.abs(r.x) < epsilon && Math.abs(r.y) < epsilon
        && Math.abs(r.width - 100) < epsilon && Math.abs(r.height - 100) < epsilon;
}

/**
 * The box for one piece. Returns undefined when the piece fills the sprite box exactly, because
 * `normalizeLayerBox` turns a full box back into absence - storing one would be a no-op that
 * differs from every project the engine already has.
 */
export function pieceBox(canvas: Size, piece: Size): Rect | undefined {
    const c = canvasRect(canvas);
    const box: Rect = {
        x: c.x,
        y: c.y,
        width: c.width * (piece.width / canvas.width),
        height: c.height * (piece.height / canvas.height),
    };
    return isFullRect(box) ? undefined : box;
}

/** Round for storage without letting a rounding step break the aspect match. */
export function roundBox(r: Rect, dp = 4): Rect {
    const f = (n: number) => Number(n.toFixed(dp));
    return { x: f(r.x), y: f(r.y), width: f(r.width), height: f(r.height) };
}
