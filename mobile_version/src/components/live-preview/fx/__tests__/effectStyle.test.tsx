/**
 * Enhanced effects — the "absence is data" guarantees, the pure shader-param mappers, and
 * the jsdom fallback (null WebGL context → Classic children render).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
    isEnhanced, commandHasEnhancedStyle, ENHANCED_OVERLAY_TYPES,
    lightsToUniforms, lightBatches, beamsToUniforms, flashlightToUniforms, atmosphereConfig,
    MAX_LIGHTS_PER_PASS,
} from '../glFx';
import GlFxCanvas from '../GlFxCanvas';
import { createCommand } from '../../../../utils/commandFactory';
import { CommandType } from '../../../../features/scene/types';
import { normalizeOverlayEffects, upsertOverlayEffect } from '../../../../types/screen-effects';

describe('absence is data', () => {
    it('isEnhanced accepts only the literal "enhanced"', () => {
        expect(isEnhanced('enhanced')).toBe(true);
        expect(isEnhanced('classic')).toBe(false);
        expect(isEnhanced(undefined)).toBe(false);
        expect(isEnhanced(null)).toBe(false);
        expect(isEnhanced('Enhanced')).toBe(false);
    });
    it('the command factory never writes effectStyle (byte-identity)', () => {
        const project: any = { characters: {}, backgrounds: {}, images: {}, audio: {}, videos: {}, items: {}, scenes: {}, variables: {}, uiScreens: {}, commonEvents: {} };
        for (const type of [CommandType.PlaceLights, CommandType.Flashlight, CommandType.Spotlight, CommandType.SetScreenOverlayEffect]) {
            const cmd = createCommand(type as any, project) as any;
            expect(cmd).toBeTruthy();
            expect(JSON.stringify(cmd)).not.toContain('effectStyle');
        }
    });
    it('normalize/upsert carry effectStyle untouched (spread-based)', () => {
        const list = upsertOverlayEffect([], { type: 'fog', intensity: 0.5, effectStyle: 'enhanced' } as any);
        expect((list[0] as any).effectStyle).toBe('enhanced');
        const normalized = normalizeOverlayEffects(list);
        expect((normalized[0] as any).effectStyle).toBe('enhanced');
        // An ordinary intensity update through upsert keeps the field when re-supplied…
        const updated = upsertOverlayEffect(list, { type: 'fog', intensity: 0.8, effectStyle: 'enhanced' } as any);
        expect((updated[0] as any).effectStyle).toBe('enhanced');
        expect(updated[0].intensity).toBe(0.8);
    });
    it('commandHasEnhancedStyle gates by command + atmosphere effectType', () => {
        expect(commandHasEnhancedStyle({ type: CommandType.PlaceLights } as any)).toBe(true);
        expect(commandHasEnhancedStyle({ type: CommandType.Flashlight } as any)).toBe(true);
        expect(commandHasEnhancedStyle({ type: CommandType.Spotlight } as any)).toBe(true);
        expect(commandHasEnhancedStyle({ type: CommandType.SetScreenOverlayEffect, effectType: 'fog' } as any)).toBe(true);
        expect(commandHasEnhancedStyle({ type: CommandType.SetScreenOverlayEffect, effectType: 'rain' } as any)).toBe(false);
        expect(commandHasEnhancedStyle({ type: CommandType.Lightning } as any)).toBe(false);
        expect(commandHasEnhancedStyle({ type: CommandType.Fireworks } as any)).toBe(false);
        expect(ENHANCED_OVERLAY_TYPES.has('lights')).toBe(true);
        expect(ENHANCED_OVERLAY_TYPES.has('rain')).toBe(false);
    });
});

describe('pure mappers', () => {
    it('lightsToUniforms: % → px geometry matches LightsLayer, phases use the classic formulas', () => {
        const lights: any[] = [
            { id: 'a', type: 'candle', x: 50, y: 25, size: 2, brightness: 0.5 },
            { id: 'b', type: 'christmas', x: 10, y: 10, twinkle: 'chase', twinkleSpeed: 2 },
        ];
        const u = lightsToUniforms(lights, 1000, 500, 1);
        expect(u.count).toBe(2);
        expect(u.posSize[0]).toBe(500);                       // 50% of 1000
        expect(u.posSize[1]).toBe(125);                       // 25% of 500
        expect(u.posSize[2]).toBeCloseTo(Math.max(6, 500 * 0.05 * 2) * 0.9); // LightsLayer sizePx * 0.9
        expect(u.posSize[3]).toBe(0.5);
        // chase phase = (i%5) * 0.32/speed with GLOBAL index 1 → 0.16
        expect(u.twinkle[4]).toBe(2);                         // mode chase
        expect(u.twinkle[6]).toBeCloseTo(0.16);
    });
    it('lightsToUniforms keeps GLOBAL indices across batches (phases stable)', () => {
        const many: any[] = Array.from({ length: 20 }, (_, i) => ({ id: String(i), type: 'star', x: 0, y: 0 }));
        const batch2 = lightsToUniforms(many, 100, 100, 1, 1, MAX_LIGHTS_PER_PASS);
        expect(batch2.count).toBe(4);
        // Light 17 → phase (17%7)*0.13 = 0.39
        expect(batch2.twinkle[1 * 4 + 2]).toBeCloseTo((17 % 7) * 0.13);
    });
    it('lightBatches: spec-minimum devices still render everything in more passes', () => {
        expect(lightBatches(10, 1024)).toEqual({ perPass: 16, passes: 1 });
        expect(lightBatches(40, 1024)).toEqual({ perPass: 16, passes: 3 });
        const tiny = lightBatches(10, 16);   // WebGL1 spec minimum
        expect(tiny.perPass).toBeGreaterThanOrEqual(1);
        expect(tiny.perPass * tiny.passes).toBeGreaterThanOrEqual(10);
    });
    it('beamsToUniforms: percent geometry → px, angle → radians', () => {
        const u = beamsToUniforms([{ sourceX: 50, sourceY: 0, aimAngle: 90, beamWidth: 40, sourceWidth: 10, height: 50, falloff: 0.3, color: '#ff0000' }], 1000, 500, 1);
        expect(u.count).toBe(1);
        expect(u.beamA[0]).toBe(500);
        expect(u.beamA[2]).toBeCloseTo(Math.PI / 2);
        expect(u.beamB[0]).toBe(50);    // half sourceWidth% of stage width
        expect(u.beamB[1]).toBe(200);   // half beamWidth%
        expect(u.beamB[2]).toBe(250);   // height% of stage height
        expect(u.beamCol[0]).toBeCloseTo(1);
        expect(u.beamCol[1]).toBeCloseTo(0);
    });
    it('flashlightToUniforms: radius% of min dimension, softness spreads inner/outer', () => {
        const u = flashlightToUniforms({ mouseX: 10, mouseY: 20, radius: 20, softness: 0.5, darkness: 0.8, on: true }, 1000, 500, 1);
        const lit = (20 / 100) * 500;
        expect(u.innerR).toBeLessThan(lit);
        expect(u.outerR).toBeGreaterThan(lit);
        expect(u.darkness).toBe(0.8);
        expect(u.hole).toBe(1);
        expect(flashlightToUniforms({ mouseX: 0, mouseY: 0, radius: 20, softness: 0.5, darkness: 0.8, on: false }, 1000, 500).hole).toBe(0);
    });
    it('atmosphereConfig: three distinct characters (fog low, haze veil, smoke rises)', () => {
        const fog = atmosphereConfig('fog');
        const haze = atmosphereConfig('haze');
        const smoke = atmosphereConfig('smoke');
        expect(fog.bandY).toBeLessThan(haze.bandY);      // fog hugs the ground
        expect(haze.bandSoft).toBe(1.0);                 // haze fills the screen
        expect(smoke.drift[1]).toBeLessThan(0);          // smoke rises
        expect(smoke.contrast).toBeGreaterThan(haze.contrast);
    });
});

describe('GlFxCanvas fallback (jsdom has no WebGL)', () => {
    it('renders the Classic children when a context cannot be created', () => {
        render(
            <GlFxCanvas kind="lights" width={800} height={600} getParams={() => ({ kind: 'lights', lights: [], stageW: 800, stageH: 600 })}>
                <div data-testid="classic-fallback">classic</div>
            </GlFxCanvas>
        );
        expect(screen.getByTestId('classic-fallback')).toBeTruthy();
        expect(document.querySelector('canvas')).toBeNull();
    });
    it('with zero size it renders an inert canvas and no fallback (waits for a measured stage)', () => {
        render(
            <GlFxCanvas kind="lights" width={0} height={0} getParams={() => ({ kind: 'lights', lights: [], stageW: 0, stageH: 0 })}>
                <div data-testid="classic-fallback">classic</div>
            </GlFxCanvas>
        );
        expect(document.querySelector('canvas')).toBeTruthy();
        expect(screen.queryByTestId('classic-fallback')).toBeNull();
    });
});
