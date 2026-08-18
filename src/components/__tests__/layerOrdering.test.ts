/**
 * Layer stacking contract.
 *
 * Backgrounds used to default to z-index 0 — the same level as an element with no layer set —
 * so anything an author sent below 0 ("⤓ Back" produces −1 on an all-default screen) slid under
 * the background and vanished. Nothing filtered or clamped the value; the element was drawn and
 * then painted over. These tests pin the two properties that fix it WITHOUT reordering anything
 * that already worked:
 *   1. backgrounds default below the whole authorable range,
 *   2. an explicitly authored background layer is still honoured (that's a deliberate
 *      "background above some elements" choice),
 *   3. the scene backdrop COLOUR is a positioned plane, not an in-flow block background —
 *      CSS paints negative-z descendants before in-flow block backgrounds, which is the
 *      mechanism that hid them.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const livePreview = fs.readFileSync(path.join(__dirname, '..', 'LivePreview.tsx'), 'utf8');
const staging = fs.readFileSync(path.join(__dirname, '..', 'StagingArea.tsx'), 'utf8');

/** Element z formulas in the engine, so the test reasons about real numbers. */
const screenElementZ = (layer?: number) => layer ?? 0;
const sceneOverlayZ = (layer?: number) => 1 + (layer ?? 0) * 100;
const sceneCharacterZ = (layer?: number) => 5 + (layer ?? 0) * 100;
const DEFAULT_BACKGROUND_LAYER = -1000;

describe('negative layers stay visible', () => {
    it('the engine defines a background layer below the authorable range', () => {
        expect(livePreview).toMatch(/const DEFAULT_BACKGROUND_LAYER = -1000/);
        expect(livePreview).toMatch(/const STAGE_BACKDROP_LAYER = DEFAULT_BACKGROUND_LAYER - 1/);
    });

    it('every background render site defaults below the range instead of to 0', () => {
        // Screen backgrounds (main + additional planes) and the scene background/stacked planes.
        expect(livePreview).not.toMatch(/screen\.backgroundLayer \?\? 0/);
        expect(livePreview).not.toMatch(/b\.layer \?\? 0,/);
        expect(livePreview).not.toMatch(/zIndex: plane\.layer \?\? 0/);
        expect(livePreview).toMatch(/screen\.backgroundLayer \?\? DEFAULT_BACKGROUND_LAYER/);
        expect(livePreview).toMatch(/zIndex: plane\.layer \?\? DEFAULT_BACKGROUND_LAYER/);
    });

    it('the scene backdrop colour is a positioned plane, not the wrapper background', () => {
        // The old form painted over negative-z children; catching it by shape is the only way,
        // since the bug is a CSS paint-order property rather than a value.
        expect(livePreview).not.toMatch(/shakeIntensityStyle, backgroundColor: effBgColor/);
        expect(livePreview).toMatch(/zIndex: STAGE_BACKDROP_LAYER, backgroundColor: effBgColor/);
    });

    it('the staging canvas matches the engine, so the editor does not over-promise', () => {
        expect(staging).toMatch(/const STAGING_BACKGROUND_LAYER = -1000/);
        expect(staging).toMatch(/zIndex: plane\.layer \?\? STAGING_BACKGROUND_LAYER/);
    });

    it('a layer of -1 now sits above the background on every surface', () => {
        expect(screenElementZ(-1)).toBeGreaterThan(DEFAULT_BACKGROUND_LAYER);
        expect(sceneOverlayZ(-1)).toBeGreaterThan(DEFAULT_BACKGROUND_LAYER);   // -99
        expect(sceneCharacterZ(-1)).toBeGreaterThan(DEFAULT_BACKGROUND_LAYER); // -95
    });

    it('EXISTING order is untouched: layer >= 0 still beats a default background', () => {
        for (const layer of [0, 1, 5, 50]) {
            expect(screenElementZ(layer)).toBeGreaterThan(DEFAULT_BACKGROUND_LAYER);
            expect(sceneOverlayZ(layer)).toBeGreaterThan(DEFAULT_BACKGROUND_LAYER);
        }
        // …and relative order among elements is unchanged by the fix.
        expect(sceneCharacterZ(0)).toBeGreaterThan(sceneOverlayZ(0));
        expect(sceneOverlayZ(1)).toBeGreaterThan(sceneCharacterZ(0));
    });
});

describe('hot spots honour their layer', () => {
    it('the screen hot spot renderer sets a z-index from the layer', () => {
        expect(livePreview).toMatch(/zIndex: \(spot as any\)\.layer != null \? \(1 \+ \(spot as any\)\.layer \* 100\) : undefined/);
    });

    it('unset hot spots keep their current stacking (no z-index forced on them)', () => {
        // The `!= null` guard is load-bearing: `?? 0` would move every existing project's spots.
        expect(livePreview).not.toMatch(/zIndex: \(spot as any\)\.layer \?\? 0/);
    });
});
