/**
 * Enhanced effects — the "absence is data" guarantees, the pure shader-param mappers, and
 * the jsdom fallback (null WebGL context → Classic children render).
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
    isEnhanced, commandHasEnhancedStyle, ENHANCED_OVERLAY_TYPES,
    lightsToUniforms, lightBatches, beamsToUniforms, flashlightToUniforms, atmosphereConfig,
    rainConfig, snowConfig, sunbeamsConfig, shimmerConfig, fireworksConfig, lightningCycleSeconds, crtConfig,
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
    it('commandHasEnhancedStyle gates by command + overlay effectType (round 2 widened)', () => {
        expect(commandHasEnhancedStyle({ type: CommandType.PlaceLights } as any)).toBe(true);
        expect(commandHasEnhancedStyle({ type: CommandType.Flashlight } as any)).toBe(true);
        expect(commandHasEnhancedStyle({ type: CommandType.Spotlight } as any)).toBe(true);
        expect(commandHasEnhancedStyle({ type: CommandType.SetScreenOverlayEffect, effectType: 'fog' } as any)).toBe(true);
        // Round 2: the weather/light-show overlays qualify too.
        for (const t of ['rain', 'snowAsh', 'sunbeams', 'shimmer', 'fireworks', 'crtScanlines']) {
            expect(commandHasEnhancedStyle({ type: CommandType.SetScreenOverlayEffect, effectType: t } as any)).toBe(true);
        }
        // The glitch pair stays Classic-only: its real tear is a displacement filter on the
        // game container, which an overlay canvas cannot reproduce.
        expect(commandHasEnhancedStyle({ type: CommandType.SetScreenOverlayEffect, effectType: 'glitch' } as any)).toBe(false);
        expect(commandHasEnhancedStyle({ type: CommandType.SetScreenOverlayEffect, effectType: 'chromaticGlitch' } as any)).toBe(false);
        expect(commandHasEnhancedStyle({ type: CommandType.Lightning } as any)).toBe(false);
        expect(commandHasEnhancedStyle({ type: CommandType.Fireworks } as any)).toBe(false);
        expect(ENHANCED_OVERLAY_TYPES.has('lights')).toBe(true);
        expect(ENHANCED_OVERLAY_TYPES.has('rain')).toBe(true);
        expect(ENHANCED_OVERLAY_TYPES.has('lightning')).toBe(true);
        expect(ENHANCED_OVERLAY_TYPES.has('glitch')).toBe(false);
        expect(ENHANCED_OVERLAY_TYPES.has('chromaticGlitch')).toBe(false);
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
    it('round-2 mappers: semantics track the Classic sims', () => {
        // Rain: wind slants around the calm 0.5 centre; dropLength = the classic lenMul range.
        expect(rainConfig(0.5, 0.5, 0.5).slant).toBeCloseTo(0);
        expect(rainConfig(0.5, 1, 0.5).slant).toBeGreaterThan(0);
        expect(rainConfig(0.5, 0, 0.5).slant).toBeLessThan(0);
        expect(rainConfig(0.5, 0.5, 0).len).toBeCloseTo(0.4);
        expect(rainConfig(0.5, 0.5, 1).len).toBeCloseTo(1.6);
        expect(rainConfig(1, 0.5, 0.5).fall).toBeGreaterThan(rainConfig(0, 0.5, 0.5).fall);
        // Snow vs ash: ash falls faster, smaller flakes, dimmer handled in-shader via ash flag.
        expect(snowConfig('ash', 0.5, 0.5, 0.5).fall).toBeGreaterThan(snowConfig('snow', 0.5, 0.5, 0.5).fall);
        expect(snowConfig('ash', 0.5, 0.5, 0.5).ash).toBe(1);
        expect(snowConfig('snow', 0.5, 0.5, 0.5).ash).toBe(0);
        expect(snowConfig('snow', 0.5, 0.5, 1).size).toBeGreaterThan(snowConfig('snow', 0.5, 0.5, 0).size);
        // Sunbeams: wider spread = fewer/fatter shafts (lower ray frequency).
        expect(sunbeamsConfig(1, 0.5).rayFreq).toBeLessThan(sunbeamsConfig(0, 0.5).rayFreq);
        // Shimmer: side masks the wave window; particlesOnly kills the waves.
        expect(shimmerConfig('left').sideMax).toBeLessThan(0.5);
        expect(shimmerConfig('right').sideMin).toBeGreaterThan(0.5);
        expect(shimmerConfig('full').sideMin).toBe(0);
        expect(shimmerConfig('full').sideMax).toBe(1);
        expect(shimmerConfig('full', 'down').driftDir).toBe(1);
        expect(shimmerConfig('full', 'up').driftDir).toBe(-1);
        expect(shimmerConfig('full', 'up', true).wavesOn).toBe(0);
        // Fireworks: faster = more bursts.
        expect(fireworksConfig(1).rate).toBeGreaterThan(fireworksConfig(0).rate);
        // Lightning: EXACTLY the Classic keyframe cycle formula (14 - speed*11).
        expect(lightningCycleSeconds(0)).toBe(14);
        expect(lightningCycleSeconds(1)).toBe(3);
        expect(lightningCycleSeconds(0.5)).toBeCloseTo(8.5);
        // CRT: spacing covers the Classic px range (gap + its 2px line); fast = quick roll.
        expect(crtConfig(0, 0.5).spacing).toBe(4);
        expect(crtConfig(1, 0.5).spacing).toBe(12);
        expect(crtConfig(0.5, 1).roll).toBeLessThan(crtConfig(0.5, 0).roll);
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
    it('at zero size it waits for a measured stage: inert canvas, Classic not yet needed', () => {
        // NOT a statement that "no fallback" is correct in general — the effect simply hasn't
        // tried WebGL yet. Every real failure path must fall back (see the lifecycle suite).
        render(
            <GlFxCanvas kind="lights" width={0} height={0} getParams={() => ({ kind: 'lights', lights: [], stageW: 0, stageH: 0 })}>
                <div data-testid="classic-fallback">classic</div>
            </GlFxCanvas>
        );
        expect(document.querySelector('canvas')).toBeTruthy();
        expect(screen.queryByTestId('classic-fallback')).toBeNull();
    });
});

/**
 * Lifecycle — the regression that silently disabled EVERY Enhanced effect: the GL context
 * used to be re-created on each width/height change, and its teardown called loseContext(),
 * which cannot be undone on the same canvas. Overlays mount at a placeholder size and flip to
 * the measured one within ~100ms, so the context died on startup, every time.
 * jsdom has no WebGL, so these tests install a fake context.
 */
describe('GlFxCanvas GL lifecycle', () => {
    const installFakeGl = () => {
        const loseContext = vi.fn();
        const gl: any = {
            isContextLost: () => false,
            getExtension: (n: string) => (n === 'WEBGL_lose_context' ? { loseContext } : null),
            getParameter: () => 64,
            createShader: () => ({}), shaderSource: vi.fn(), compileShader: vi.fn(),
            getShaderParameter: () => true, deleteShader: vi.fn(),
            createProgram: () => ({}), attachShader: vi.fn(), linkProgram: vi.fn(),
            getProgramParameter: () => true, deleteProgram: vi.fn(), useProgram: vi.fn(),
            createBuffer: () => ({}), bindBuffer: vi.fn(), bufferData: vi.fn(),
            getAttribLocation: () => 0, enableVertexAttribArray: vi.fn(), vertexAttribPointer: vi.fn(),
            getUniformLocation: () => ({}),
            uniform1f: vi.fn(), uniform2f: vi.fn(), uniform3f: vi.fn(), uniform4f: vi.fn(),
            uniform1i: vi.fn(), uniform4fv: vi.fn(), uniform2fv: vi.fn(), uniform3fv: vi.fn(),
            viewport: vi.fn(), clearColor: vi.fn(), clear: vi.fn(), enable: vi.fn(),
            blendFunc: vi.fn(), drawArrays: vi.fn(),
            COLOR_BUFFER_BIT: 1, BLEND: 1, ARRAY_BUFFER: 1, STATIC_DRAW: 1, FLOAT: 1,
            TRIANGLES: 1, VERTEX_SHADER: 1, FRAGMENT_SHADER: 1, COMPILE_STATUS: 1, LINK_STATUS: 1,
            ONE: 1, ONE_MINUS_SRC_ALPHA: 1, SRC_ALPHA: 1, MAX_FRAGMENT_UNIFORM_VECTORS: 1,
        };
        const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
            .mockImplementation(((type: string) => (type === 'webgl' || type === 'experimental-webgl' ? gl : null)) as any);
        return { gl, loseContext, restore: () => spy.mockRestore() };
    };

    it('SURVIVES resizes: the context is never destroyed and Classic never takes over', () => {
        const { loseContext, restore } = installFakeGl();
        try {
            const params = () => ({ kind: 'rain' as const, intensity: 0.5 });
            const { rerender } = render(
                <GlFxCanvas kind="rain" width={1280} height={720} getParams={params}>
                    <div data-testid="classic-fallback">classic</div>
                </GlFxCanvas>
            );
            expect(document.querySelector('canvas')).toBeTruthy();
            // The exact startup sequence: placeholder size → measured size → a later resize.
            rerender(
                <GlFxCanvas kind="rain" width={1920} height={1080} getParams={params}>
                    <div data-testid="classic-fallback">classic</div>
                </GlFxCanvas>
            );
            rerender(
                <GlFxCanvas kind="rain" width={800} height={600} getParams={params}>
                    <div data-testid="classic-fallback">classic</div>
                </GlFxCanvas>
            );
            expect(loseContext).not.toHaveBeenCalled();
            expect(screen.queryByTestId('classic-fallback')).toBeNull();
            expect(document.querySelector('canvas')).toBeTruthy();
        } finally { restore(); }
    });

    /* The original bug shipped because 12 of 16 Enhanced branches had no Classic counterpart,
     * so any WebGL failure rendered nothing at all. Every Enhanced branch must be reachable
     * back to Classic — via the failover gate, or by nesting the Classic markup as children. */
    it('every Enhanced screen-FX branch has a Classic failover', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', '..', 'ScreenOverlayEffects.tsx'), 'utf8');
        const gates = (src.match(/useGl\('/g) || []).length;
        const marks = (src.match(/markGlDead\('/g) || []).length;
        expect(gates).toBeGreaterThan(10);
        expect(marks).toBe(gates);                       // one failover per gate
        // No branch may test WebGL directly any more — that path can't fall back.
        expect(src).not.toMatch(/isEnhanced\([a-zA-Z]+\.effectStyle\)\s*&&\s*webglLikelyAvailable\(\)/);
    });

    it('a lost context falls over to Classic instead of leaving a blank canvas', () => {
        const { restore } = installFakeGl();
        try {
            render(
                <GlFxCanvas kind="rain" width={1280} height={720} getParams={() => ({ kind: 'rain', intensity: 0.5 })}>
                    <div data-testid="classic-fallback">classic</div>
                </GlFxCanvas>
            );
            const canvas = document.querySelector('canvas')!;
            act(() => { canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })); });
            expect(screen.getByTestId('classic-fallback')).toBeTruthy();
        } finally { restore(); }
    });
});
