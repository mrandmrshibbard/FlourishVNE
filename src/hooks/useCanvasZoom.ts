/**
 * Canvas zoom shared by the scene canvas (StagingArea) and the screens canvas (MenuEditor).
 *
 * 🔴 Zoom is applied by MULTIPLYING the stage's pixel width/height — never a CSS
 * `transform: scale()`. `ResizableDraggable` converts drag/resize deltas to percentages by
 * dividing by the stage's on-screen size (`parentSize`), so a stage whose real pixel size
 * already includes the zoom keeps dragging accurate for free. A transform would leave the
 * element's layout size unzoomed, and every drag would be wrong by exactly the zoom factor.
 * Whatever else changes here, keep multiplying the size.
 *
 * The wheel listener is attached natively with `passive: false` on purpose: React's synthetic
 * onWheel is passive, so `preventDefault()` there is ignored and the browser page-zooms instead.
 */
import { useCallback, useEffect, useState, RefObject } from 'react';

export const CANVAS_ZOOM_MIN = 0.5;
export const CANVAS_ZOOM_MAX = 4;
/** Wheel notch step. Buttons use a coarser step so clicking feels like a real jump. */
const WHEEL_STEP = 1.15;
const BUTTON_STEP = 1.25;

const clamp = (z: number) => Math.max(CANVAS_ZOOM_MIN, Math.min(CANVAS_ZOOM_MAX, Math.round(z * 100) / 100));

export interface CanvasZoom {
    /** 1 = fit the panel. >1 overflows, and the scroll container pans. */
    zoom: number;
    zoomIn: () => void;
    zoomOut: () => void;
    /** Back to fit. */
    reset: () => void;
    /** For the middle button's label, e.g. "150%". */
    percent: number;
}

/**
 * @param containerRef the SCROLL container (the element that overflows when zoomed in), which
 *                     is also where Ctrl+wheel is captured.
 */
export function useCanvasZoom(containerRef: RefObject<HTMLElement>): CanvasZoom {
    const [zoom, setZoom] = useState(1);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey) return;                 // plain scrolling still scrolls the panel
            e.preventDefault();
            setZoom(z => clamp(z * (e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP)));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [containerRef]);

    const zoomIn = useCallback(() => setZoom(z => clamp(z * BUTTON_STEP)), []);
    const zoomOut = useCallback(() => setZoom(z => clamp(z / BUTTON_STEP)), []);
    const reset = useCallback(() => setZoom(1), []);

    return { zoom, zoomIn, zoomOut, reset, percent: Math.round(zoom * 100) };
}
