/**
 * Scene-change teardown invariants.
 *
 * `applyResult` MERGES `updates.stageState` / `updates.uiState` over the live state, so any key a
 * jump handler forgets SURVIVES the jump. That is how the previous scene's particles, placed
 * lights, hot-spots, background colour/video flags, conditional background layers and parallax
 * planes kept rendering in the scene you jumped to — and how a full-screen Map or Mini-Game
 * overlay stayed mounted over it. Neither of these files had a single test before.
 */
import { describe, it, expect } from 'vitest';
import { freshSceneStage, freshSceneUiState } from '../controlFlowHandler';
import { CommandScheduler } from '../../runtime/commandScheduler';

/** Every optional key a stale scene could leak through the merge. */
const LEAKABLE_STAGE_KEYS = [
    'backgroundUrl', 'backgroundIsVideo', 'backgroundLoop', 'backgroundTrimStart', 'backgroundTrimEnd',
    'backgroundColor', 'backgroundParallaxDepth', 'backgroundLayer', 'backgroundLayers', 'backgroundStack',
    'characters', 'textOverlays', 'imageOverlays', 'buttonOverlays', 'movieOverlays', 'hotSpotOverlays',
    'lights', 'lightsAbove', 'lightsBrightnessVariableId', 'lightsStyle', 'particleEffects', 'screen',
] as const;

const LEAKABLE_UI_KEYS = [
    'dialogue', 'choices', 'textInput', 'movieUrl', 'movieLoop', 'mapOverlay', 'miniGameOverlay',
    'isSkipping', 'isWaitingForInput', 'isTransitioning', 'flash', 'showHistory', 'screenSceneId',
] as const;

describe('fresh scene state', () => {
    it('names every stage key, so nothing from the old scene can survive the merge', () => {
        const stage = freshSceneStage() as unknown as Record<string, unknown>;
        for (const key of LEAKABLE_STAGE_KEYS) {
            expect(Object.prototype.hasOwnProperty.call(stage, key), `freshSceneStage() is missing "${key}" — it would survive a Jump`).toBe(true);
        }
    });

    it('clears the visuals that used to leak into the jumped-to scene', () => {
        const stage = freshSceneStage();
        expect(stage.particleEffects).toEqual({});
        expect(stage.hotSpotOverlays).toEqual([]);   // invisible but clickable if leaked
        expect(stage.lights).toEqual([]);
        expect(stage.backgroundLayers).toBeUndefined();  // a live layer used to beat backgroundUrl: null
        expect(stage.backgroundStack).toBeUndefined();
        expect(stage.backgroundColor).toBeUndefined();
        expect(stage.backgroundUrl).toBeNull();
        expect(stage.characters).toEqual({});
        expect(stage.screen.overlayEffects).toEqual([]);
    });

    it('names every ui key that could keep an overlay mounted over the new scene', () => {
        const ui = freshSceneUiState() as unknown as Record<string, unknown>;
        for (const key of LEAKABLE_UI_KEYS) {
            expect(Object.prototype.hasOwnProperty.call(ui, key), `freshSceneUiState() is missing "${key}"`).toBe(true);
        }
        expect(ui.mapOverlay).toBeNull();
        expect(ui.miniGameOverlay).toBeNull();
        expect(ui.dialogue).toBeNull();
    });
});

describe('CommandScheduler epoch', () => {
    it('voids callbacks captured before a scene change', () => {
        const s = new CommandScheduler();
        const epoch = s.currentEpoch();
        expect(s.isStaleEpoch(epoch)).toBe(false);
        s.reset();                                   // a scene change
        expect(s.isStaleEpoch(epoch)).toBe(true);    // the old scene's advance() must not fire
        expect(s.isStaleEpoch(s.currentEpoch())).toBe(false);
    });

    it('reset still clears the processed signature (unchanged behavior)', () => {
        const s = new CommandScheduler();
        s.markProcessed({ sceneId: 'a', commandId: 'c1', index: 3 });
        expect(s.shouldProcess({ sceneId: 'a', commandId: 'c1', index: 3 })).toBe(false);
        s.reset();
        expect(s.shouldProcess({ sceneId: 'a', commandId: 'c1', index: 3 })).toBe(true);
        expect(s.getLastProcessed()).toBeNull();
    });

    it('alreadyAdvancedPast is scene-blind, which is why the epoch guard exists', () => {
        // Documents the trap: after reset() this guard returns false for EVERYTHING, so a stale
        // advance() from the old scene would sail through and stomp the new scene's index.
        const s = new CommandScheduler();
        s.markProcessed({ sceneId: 'a', commandId: 'c1', index: 14 });
        expect(s.alreadyAdvancedPast(3)).toBe(true);
        s.reset();
        expect(s.alreadyAdvancedPast(3)).toBe(false);
    });
});
