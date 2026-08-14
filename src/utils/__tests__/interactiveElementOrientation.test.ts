/**
 * 🔴 Rotation and flip must survive the runtime shim.
 *
 * Interactive elements — hot spots, draggables, Interactive Images — are converted into a legacy
 * runtime shape by hand-written field lists, and those lists predate rotation/flip. Anything a
 * player could drag therefore lost its rotation on the way to the game: reported as "items with
 * 'Players can drag it onto hot spots' don't obey rotation commands".
 *
 * The lesson these tests encode is the one that bit the poses feature too: a typed field list is a
 * place new properties go to die. The fix merges orientation in ONE place; these tests make sure it
 * covers every kind of interactive element, including ones added later.
 */
import { describe, it, expect } from 'vitest';
import { deriveHotSpotsFromScreen, deriveInteractiveElementsFromScreen } from '../interactiveElements';
import { UIElementType } from '../../features/ui/types';

const base = { x: 10, y: 20, width: 30, height: 40, anchorX: 0.5, anchorY: 0.5, visible: true };
const orientation = { rotation: 45, flipX: true, flipY: false };

const screen = (elements: Record<string, any>): any => ({ id: 'scr', name: 'S', elements });

describe('orientation survives the conversion to the runtime shape', () => {
    it('on a hot spot', () => {
        // Returns a Record keyed by id, not an array.
        const spots = deriveHotSpotsFromScreen(screen({
            h1: { id: 'h1', name: 'Spot', type: UIElementType.HotSpot, shape: 'rect', ...base, ...orientation },
        }) as any);
        expect(Object.values(spots)).toHaveLength(1);
        expect(Object.values(spots)[0]).toMatchObject(orientation);
    });

    it('🔴 on a draggable image — the case that was reported', () => {
        const els = deriveInteractiveElementsFromScreen(screen({
            d1: {
                id: 'd1', name: 'Coin', type: UIElementType.draggableImageElement,
                image: { type: 'image', id: 'img1' }, draggable: true, ...base, ...orientation,
            },
        }) as any);
        expect(Object.values(els)).toHaveLength(1);
        expect(Object.values(els)[0]).toMatchObject(orientation);
    });

    it('on an ordinary element made draggable', () => {
        const els = deriveInteractiveElementsFromScreen(screen({
            i1: {
                id: 'i1', name: 'Photo', type: UIElementType.Image,
                image: { type: 'image', id: 'img2' }, draggable: true, ...base, ...orientation,
            },
        }) as any);
        expect(Object.values(els)[0]).toMatchObject(orientation);
    });

    it('on a draggable text element', () => {
        const els = deriveInteractiveElementsFromScreen(screen({
            t1: {
                id: 't1', name: 'Label', type: UIElementType.Text, text: 'Hi',
                draggable: true, ...base, ...orientation,
            },
        }) as any);
        expect(Object.values(els)[0]).toMatchObject(orientation);
    });

    it('leaves an element with no orientation exactly as it was', () => {
        // Absent stays absent — we must not stamp `rotation: undefined` onto everything and make
        // every element look modified to code that checks for the property.
        const els = deriveInteractiveElementsFromScreen(screen({
            d2: {
                id: 'd2', name: 'Plain', type: UIElementType.draggableImageElement,
                image: { type: 'image', id: 'img3' }, draggable: true, ...base,
            },
        }) as any);
        const converted: any = Object.values(els)[0];
        expect('rotation' in converted).toBe(false);
    });

    it('carries a rotation of 0 rather than treating it as "unset"', () => {
        const els = deriveInteractiveElementsFromScreen(screen({
            d3: {
                id: 'd3', name: 'Zero', type: UIElementType.draggableImageElement,
                image: { type: 'image', id: 'img4' }, draggable: true, ...base,
                rotation: 0, flipX: true, flipY: true,
            },
        }) as any);
        const converted: any = Object.values(els)[0];
        expect(converted.rotation).toBe(0);
        expect(converted.flipX).toBe(true);
        expect(converted.flipY).toBe(true);
    });
});

describe('🔴 layer survives too — a hot spot under an image was unclickable', () => {
    /* Screens had no layering for interactive elements: they rendered at a fixed z-index, so an
     * image on any higher layer covered them and swallowed the click. Scenes already handled this.
     * The runtime now uses `1 + layer * 100`, the same formula as ordinary screen elements — but
     * only if the shim actually carries `layer` across, which is what these pin. */

    it('carries the layer on a hot spot', () => {
        const spots = deriveHotSpotsFromScreen(screen({
            h1: { id: 'h1', name: 'Spot', type: UIElementType.HotSpot, shape: 'rect', ...base, layer: 3 },
        }) as any);
        expect((Object.values(spots)[0] as any).layer).toBe(3);
    });

    it('carries the layer on a draggable', () => {
        const els = deriveInteractiveElementsFromScreen(screen({
            d1: {
                id: 'd1', name: 'Coin', type: UIElementType.draggableImageElement,
                image: { type: 'image', id: 'img1' }, draggable: true, ...base, layer: 2,
            },
        }) as any);
        expect((Object.values(els)[0] as any).layer).toBe(2);
    });

    it('carries layer 0 rather than dropping it as falsy', () => {
        const els = deriveInteractiveElementsFromScreen(screen({
            d2: {
                id: 'd2', name: 'Base', type: UIElementType.draggableImageElement,
                image: { type: 'image', id: 'img2' }, draggable: true, ...base, layer: 0,
            },
        }) as any);
        expect((Object.values(els)[0] as any).layer).toBe(0);
    });

    it('carries the "Drawn shape" points on a poly hot spot', () => {
        // points joined CARRIED_THROUGH with the freehand feature — same typed-field-list trap.
        const points = [50, 0, 100, 50, 50, 100, 0, 50];
        const spots = deriveHotSpotsFromScreen(screen({
            h2: { id: 'h2', name: 'Blob', type: UIElementType.HotSpot, shape: 'poly', points, ...base },
        }) as any);
        expect((Object.values(spots)[0] as any).shape).toBe('poly');
        expect((Object.values(spots)[0] as any).points).toEqual(points);
    });

    it('puts a higher-layer hot spot above a lower-layer image, using the shared formula', () => {
        // The renderer's rule: honor the band ONLY when a layer is set; an unset layer keeps the
        // legacy fixed z (10). 🔴 The first version computed `1 + (layer ?? 0) * 100`, which
        // silently moved every existing hot spot from 10 down to 1 — behind ordinary elements it
        // had always beaten. Unset must stay 10, matching the scene hot spots' `: 8` fallback.
        const z = (layer?: number) => (layer != null ? 1 + layer * 100 : 10);
        expect(z(undefined)).toBe(10);                    // untouched projects keep today's stacking
        expect(z(0)).toBeLessThan(z(1));
        expect(z(2)).toBeGreaterThan(z(1));
        // A hot spot deliberately placed above layer-1 artwork wins.
        expect(z(3)).toBeGreaterThan(z(1));
        // ...and the legacy default still beats a layer-0 image (1), as it always did.
        expect(z(undefined)).toBeGreaterThan(1);
    });
});
