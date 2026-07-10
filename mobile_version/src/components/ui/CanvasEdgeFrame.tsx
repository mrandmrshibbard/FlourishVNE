import React from 'react';

/**
 * CanvasEdgeFrame — a crisp, non-interactive boundary drawn at the exact edge of an editor
 * canvas, marking where the player's screen stops. The canvases letterbox to the game's
 * aspect ratio and clip content (`overflow: hidden`), but against a similar-colored editor
 * backdrop the cut-off point wasn't obvious — art placed half off-screen just looked like
 * art. A dark+light double ring reads on any content (bright or dark) without tinting it.
 *
 * Render it as the LAST child of the canvas so it sits above stage content (it's
 * pointer-events: none, so it never affects clicks/drags).
 */
// Default z: far above any canvas content (element layers reach z-100+), but BELOW the
// test-play overlay (z-[9000]) — the editor canvases don't create stacking contexts, so
// this ring lives at root level and a bigger z would draw over the running game.
const CanvasEdgeFrame: React.FC<{ zIndex?: number }> = ({ zIndex = 8000 }) => (
    <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
            zIndex,
            // Outer dark line + inner light line: visible over any artwork.
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(255,255,255,0.38)',
            borderRadius: 'inherit',
        }}
    />
);

export default CanvasEdgeFrame;
