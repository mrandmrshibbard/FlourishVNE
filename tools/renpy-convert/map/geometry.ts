/**
 * Ren'Py virtual pixels -> Flourish stage geometry.
 *
 * Every constant here is DERIVED from how the engine actually renders, verified against
 * LivePreview.tsx rather than assumed:
 *
 *  - A character sprite lives in a box that is `h-[90%]` of the stage and `aspect-[3/4]`, and its
 *    layer images are `w-full h-full object-contain` - so the art is fitted and CENTRED in that
 *    box on both axes.
 *  - `scale` is a CSS `transform: scale()` on that box with `transformOrigin: center bottom`, so
 *    scaling pins the bottom edge and leaves the horizontal centre where it is.
 *  - A custom `{x, y}` position renders as `left: x%, top: y%` with `translate(0, 0)` - the box's
 *    LEFT-TOP corner, NOT its centre. (Presets are centre-anchored; we never emit those, because
 *    they also hard-code `top: 10%`.)
 *
 * The 3:4 box is 0.9 * (3/4) = 0.675 stage-heights wide, and the stage is 16:9, so the box is
 * 0.675 * 9/16 = 37.96875% of stage WIDTH - half of it, 18.984375, is the constant below.
 *
 * Ren'Py's own convention: a transform with the default anchor (0,0) places the art's TOP-LEFT at
 * (xpos, ypos) and `zoom` scales about that same corner.
 */
import { RENPY, OVERLAY_REFERENCE, SPRITE_FRAME } from '../ir/engineContract';

/** Half the character frame's width, as a percentage of stage width. */
export const HALF_FRAME_W_PCT = 100 * SPRITE_FRAME.heightFraction * SPRITE_FRAME.aspect * (RENPY.height / RENPY.width) / 2;

/** Percent of stage per Ren'Py virtual pixel. */
const PCT_PER_PX_X = 100 / RENPY.width;      // 1/19.2
const PCT_PER_PX_Y = 100 / RENPY.height;     // 1/10.8

/** Overlay sizes are authored in px against a 1280x720 reference; 1280/1920 === 720/1080. */
export const OVERLAY_PX_PER_RENPY_PX = OVERLAY_REFERENCE.width / RENPY.width;   // 2/3

export interface Canvas { width: number; height: number }
export interface Placement { xpos: number; ypos: number; zoom: number }

export interface CharacterGeometry {
    /** Flourish `scale` for the ShowCharacter command. */
    scale: number;
    /** Custom position, percent of stage, LEFT-TOP of the unscaled sprite frame. */
    x: number;
    y: number;
}

/**
 * The scale that makes the contained art render at exactly `canvas * zoom` Ren'Py pixels.
 *
 * `object-contain` fits by whichever axis runs out first, so the branch is decided by comparing
 * the art's aspect to the box's 3:4. `max` selects the binding axis without a conditional: the
 * fit-by-height case needs `Hc/972`, the fit-by-width case needs `Wc/729`, and for any given
 * canvas exactly one of those is the larger.
 */
export function characterScale(canvas: Canvas, zoom: number): number {
    return zoom * Math.max(canvas.height / SPRITE_FRAME.heightPx, canvas.width / SPRITE_FRAME.widthPx);
}

export function characterGeometry(canvas: Canvas, place: Placement): CharacterGeometry {
    const scale = characterScale(canvas, place.zoom);
    // Centre of the art in Ren'Py px -> percent of stage.
    const cxPct = (place.xpos + canvas.width * place.zoom / 2) * PCT_PER_PX_X;
    const cyPct = (place.ypos + canvas.height * place.zoom / 2) * PCT_PER_PX_Y;
    // Horizontal: the frame's centre is its left edge + half its width, and scaling does not move it.
    const x = cxPct - HALF_FRAME_W_PCT;
    // Vertical: scaling pins the bottom (y + 90), so the scaled centre sits at y + 90 - 45*scale.
    const y = cyPct - 100 * SPRITE_FRAME.heightFraction + (100 * SPRITE_FRAME.heightFraction / 2) * scale;
    return { scale, x, y };
}

/** Exact inverse of `characterGeometry`, for the round-trip property test. */
export function characterPlacement(canvas: Canvas, geo: CharacterGeometry): Placement {
    const zoom = geo.scale / Math.max(canvas.height / SPRITE_FRAME.heightPx, canvas.width / SPRITE_FRAME.widthPx);
    const cxPct = geo.x + HALF_FRAME_W_PCT;
    const cyPct = geo.y + 100 * SPRITE_FRAME.heightFraction - (100 * SPRITE_FRAME.heightFraction / 2) * geo.scale;
    return {
        zoom,
        xpos: cxPct / PCT_PER_PX_X - canvas.width * zoom / 2,
        ypos: cyPct / PCT_PER_PX_Y - canvas.height * zoom / 2,
    };
}

export interface ImageGeometry {
    /** Centre of the overlay, percent of stage. */
    x: number;
    y: number;
    /** Size in design px against the 1280x720 overlay reference. */
    width: number;
    height: number;
}

/**
 * A Show Image overlay: centre-anchored percent position, size in 1280x720-referenced px.
 * Because 1280/1920 and 720/1080 are the same ratio, ONE scalar covers both axes - there is no
 * pillarbox or letterbox case to handle.
 */
export function imageGeometry(canvas: Canvas, place: Placement): ImageGeometry {
    return {
        x: (place.xpos + canvas.width * place.zoom / 2) * PCT_PER_PX_X,
        y: (place.ypos + canvas.height * place.zoom / 2) * PCT_PER_PX_Y,
        width: canvas.width * place.zoom * OVERLAY_PX_PER_RENPY_PX,
        height: canvas.height * place.zoom * OVERLAY_PX_PER_RENPY_PX,
    };
}

/** Exact inverse of `imageGeometry`. */
export function imagePlacement(canvas: Canvas, geo: ImageGeometry): Placement {
    const zoom = geo.width / (canvas.width * OVERLAY_PX_PER_RENPY_PX);
    return {
        zoom,
        xpos: geo.x / PCT_PER_PX_X - canvas.width * zoom / 2,
        ypos: geo.y / PCT_PER_PX_Y - canvas.height * zoom / 2,
    };
}
