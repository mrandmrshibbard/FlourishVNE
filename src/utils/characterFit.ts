/**
 * characterFit — compute the `scale` that makes a character sprite fit the screen.
 *
 * The runtime (and StagingArea) render a character as `height: 90%` of the stage,
 * width auto with `aspect-ratio: 3/4`, transform-origin center-bottom, sized only by
 * `transform: scale(...)`. So "fit to screen" resolves entirely to the existing
 * `scale` field — no engine change, no new schema.
 *
 * Pure / testable.
 */

export interface FitSize { width: number; height: number; }

export interface ContentBoxInsets { left: number; top: number; right: number; bottom: number; }

/**
 * Scale that makes the WHOLE sprite fit the screen, anchored at its bottom. Sizes the full sprite
 * frame (not the trimmed visible region) on purpose: "fit to visible content" over-scales when the
 * content box trims a lot — and "fit width" of a tall 3:4 sprite to a wide screen needs ~2.6×, which
 * pushes the sprite off the top. Predictable "as tall as the screen" ≈ 1.11× and always stays on screen.
 *
 * @param mode   'height' → sprite frame fills the full stage height; 'width' → spans the width but is
 *               capped so it's never TALLER than the screen (so it can't fly off the top).
 * @param stage  the rendered stage size in px (only the aspect matters for 'width').
 * @param _box   accepted for call-site compatibility; intentionally NOT used (see above).
 */
export interface FitPlacement { scale: number; x: number; y: number; }

/**
 * Fit the VISIBLE content (content box) of a character to the screen AND reposition it so it stays on
 * screen — planted with the visible content's bottom at the stage floor and centred horizontally.
 * Returns scale + a custom {x,y} position (the caller commits all three). Repositioning is what keeps
 * a trimmed sprite from floating off the top: scaling alone (around the bottom-centre) pushed the
 * visible content up by the box's bottom padding.
 *
 * Derivation (custom render: left:x%, top:y%, height:90%, transform-origin centre-bottom, scale):
 *   scaledFrameBottom = y+90 (origin is the bottom edge, so it's fixed under scale)
 *   visibleBottom = (y+90) − bottom·(90·scale);  set = 100 (floor) → y = 10 + 90·bottom·scale
 *   frame width wL% (of stage width) = (0.9·stageH·0.75)/stageW·100; centre fixed at x+wL/2
 *   visibleCentreX = (x+wL/2) + wL·scale·(left−right)/2;  set = 50 → x = 50 − wL/2 − wL·scale·(left−right)/2
 */
export function computeCharacterFitPlacement(mode: 'height' | 'width', stage: FitSize, box?: ContentBoxInsets): FitPlacement {
    const top = box?.top ?? 0, bottom = box?.bottom ?? 0, left = box?.left ?? 0, right = box?.right ?? 0;
    const visH = Math.max(0.05, 1 - top - bottom);
    const visW = Math.max(0.05, 1 - left - right);
    const sw = stage.width || 1, sh = stage.height || 1;
    const wL = ((0.9 * sh * 0.75) / sw) * 100; // frame layout width, % of stage width
    const heightScale = 1 / (0.9 * visH);      // fill stage height with the visible content
    let scale = mode === 'height' ? heightScale : Math.min(100 / (visW * wL), heightScale);
    scale = Math.max(0.1, Math.min(3, scale));
    const y = 10 + 90 * bottom * scale;                       // plant visible bottom at the floor
    const x = 50 - wL / 2 - (wL * scale * (left - right)) / 2; // centre visible content horizontally
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return { scale: r2(scale), x: r2(x), y: r2(y) };
}

export function computeCharacterFitScale(mode: 'height' | 'width', stage: FitSize, _box?: ContentBoxInsets): number {
    const clamp = (s: number) => Math.round(Math.max(0.1, Math.min(3, s)) * 100) / 100;
    // The sprite frame is 90% of stage height at scale 1, so 1/0.9 ≈ 1.11 makes it the full height.
    const heightScale = 1 / 0.9;
    if (mode === 'height') return clamp(heightScale);
    // 'width': frame width = (0.9 * stageH) * (3/4); scale so it reaches stageW, but never let it
    // exceed the height fit (otherwise a portrait sprite balloons taller than the screen).
    const sw = stage.width || 1;
    const sh = stage.height || 1;
    const baseWidthPx = 0.9 * sh * (3 / 4);
    const widthScale = baseWidthPx > 0 ? sw / baseWidthPx : 1;
    return clamp(Math.min(widthScale, heightScale));
}
