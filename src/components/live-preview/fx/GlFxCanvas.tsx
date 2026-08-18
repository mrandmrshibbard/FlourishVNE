import React, { useEffect, useRef, useState } from 'react';
import {
    createGlContext, compileProgram, makeQuad, sizeCanvas,
    QUAD_VS, LIGHTS_FS, BEAMS_FS, FLASHLIGHT_FS, ATMOS_FS,
    RAIN_FS, SNOW_FS, SUNBEAMS_FS, SHIMMER_FS, FIREWORKS_FS, LIGHTNING_FS, CRT_FS,
    MAX_LIGHTS_PER_PASS, MAX_BEAMS_PER_PASS,
    lightsToUniforms, lightBatches, beamsToUniforms, flashlightToUniforms, atmosphereConfig,
    rainConfig, snowConfig, sunbeamsConfig, shimmerConfig, fireworksConfig, lightningCycleSeconds, crtConfig,
    BeamLike, FlashlightUniformsInput,
} from './glFx';
import { VNScreenLight } from '../../../types/screen-effects';

/**
 * GlFxCanvas — mounts one WebGL canvas for one Enhanced effect. The Classic JSX is passed as
 * `children` and rendered VERBATIM whenever WebGL is unavailable (no context, compile failure,
 * unrecovered context loss) — the silent per-effect fallback. `getParams` is read every frame
 * through a ref, so live variables / mouse movement never cause React re-renders.
 */

export interface LightsParams {
    kind: 'lights';
    lights: VNScreenLight[];
    stageW: number;
    stageH: number;
}
export interface BeamsParams {
    kind: 'beams';
    beams: BeamLike[];
    stageW: number;
    stageH: number;
}
export interface FlashlightParams extends FlashlightUniformsInput {
    kind: 'flashlight';
    stageW: number;
    stageH: number;
}
export interface AtmosphereParams {
    kind: 'atmosphere';
    type: 'fog' | 'haze' | 'smoke';
    intensity: number;      // 0..1, ⚡-resolved by the caller
    color?: string;
    speed?: number;
    wind?: number;
    /** 0..1, default 0.5 = the pre-density look exactly (maps to `particleDensity`). */
    density?: number;
}
// ── Round 2 param shapes — all values 0..1 authored params, resolved by the caller ──────
export interface RainParams {
    kind: 'rain';
    intensity: number;
    color?: string;
    speed?: number;
    wind?: number;
    dropLength?: number;
}
export interface SnowParams {
    kind: 'snow';
    variant: 'snow' | 'ash';
    intensity: number;
    color?: string;
    speed?: number;
    wind?: number;
    particleSize?: number;
}
export interface SunbeamsParams {
    kind: 'sunbeams';
    intensity: number;
    color?: string;
    speed?: number;
    spread?: number;
}
export interface ShimmerParams {
    kind: 'shimmer';
    intensity: number;
    color?: string;
    speed?: number;
    density?: number;
    side?: 'left' | 'right' | 'full';
    direction?: 'up' | 'down';
    particlesOnly?: boolean;
}
export interface FireworksParams {
    kind: 'fireworks';
    intensity: number;
    /** Author colour tints every burst; absent = per-burst festive hues. */
    color?: string;
    speed?: number;
}
export interface LightningParams {
    kind: 'lightning';
    intensity: number;
    color?: string;
    speed?: number;
}
export interface CrtParams {
    kind: 'crt';
    intensity: number;
    lineSpacing?: number;
    speed?: number;
}

export type GlFxParams =
    | LightsParams | BeamsParams | FlashlightParams | AtmosphereParams
    | RainParams | SnowParams | SunbeamsParams | ShimmerParams
    | FireworksParams | LightningParams | CrtParams;

const FS_BY_KIND: Record<GlFxParams['kind'], string> = {
    lights: LIGHTS_FS,
    beams: BEAMS_FS,
    flashlight: FLASHLIGHT_FS,
    atmosphere: ATMOS_FS,
    rain: RAIN_FS,
    snow: SNOW_FS,
    sunbeams: SUNBEAMS_FS,
    shimmer: SHIMMER_FS,
    fireworks: FIREWORKS_FS,
    lightning: LIGHTNING_FS,
    crt: CRT_FS,
};

const hexToRgb01 = (hex: string, fallback: [number, number, number]): [number, number, number] => {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    if (!m) return fallback;
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const GlFxCanvas: React.FC<{
    kind: GlFxParams['kind'];
    getParams: () => GlFxParams;
    width: number;
    height: number;
    className?: string;
    style?: React.CSSProperties;
    /** The Classic rendering — shown whenever the shaders can't run. */
    children?: React.ReactNode;
    /** Fired once when this effect gives up on WebGL, so the host can re-arm its Classic sims. */
    onFallback?: () => void;
}> = ({ kind, getParams, width, height, className, style, children, onFallback }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const paramsRef = useRef(getParams);
    paramsRef.current = getParams;
    /* The draw loop reads the live size through a ref, and size is NOT an effect dependency.
     * It used to be — and because the teardown called loseContext(), the FIRST resize after mount
     * permanently killed the context (getContext then hands back the same dead object, so the
     * null-guard misses and the shader compile fails). Overlays mount at a placeholder size and
     * flip to the measured one within ~100ms, so every Enhanced effect died on startup.
     * Resizing is now just sizeCanvas + viewport inside frame(). */
    const sizeRef = useRef({ width, height });
    sizeRef.current = { width, height };
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const [failed, setFailed] = useState(false);
    const failOver = (reason: string) => {
        // eslint-disable-next-line no-console
        console.warn(`[glFx] Enhanced effect "${kind}" fell back to Classic: ${reason}`);
        setFailed(true);
    };

    // Only the ARRIVAL of a real size may (re)create the context — not every size change.
    const hasSize = width > 0 && height > 0;

    /* True unmount only: hand the context slot back (browsers cap live WebGL contexts ~16).
     * Deliberately its own effect so no dependency change can ever destroy a live context. */
    useEffect(() => () => {
        try { glRef.current?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* already gone */ }
        glRef.current = null;
    }, []);

    useEffect(() => {
        if (failed) return;
        const canvas = canvasRef.current;
        // 0×0 first frames (useStageSize starts empty) — wait for a real size (FireworksBurst rule).
        if (!canvas || !hasSize) return;

        const gl = createGlContext(canvas);
        if (!gl) { failOver('no WebGL context'); return; }
        if (gl.isContextLost()) { failOver('WebGL context is lost'); return; }
        glRef.current = gl;
        // Queried BEFORE compiling: the lights shader sizes its uniform arrays from this, so
        // asking afterwards could never prevent the link failure it exists to guard against.
        const maxVectors = (gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number) || 64;
        const prog = compileProgram(gl, QUAD_VS, FS_BY_KIND[kind]);
        if (!prog) { failOver('shader compile/link failed'); return; }
        const bindQuad = makeQuad(gl, prog);
        const loc = (name: string) => gl.getUniformLocation(prog, name);

        let raf = 0;
        let disposed = false;
        let lost = false;
        const started = performance.now();

        const frame = () => {
            if (disposed || lost) return;
            const { w, h, dpr } = sizeCanvas(canvas, sizeRef.current.width, sizeRef.current.height);
            gl.viewport(0, 0, w, h);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(prog);
            bindQuad();
            gl.enable(gl.BLEND);
            const t = (performance.now() - started) / 1000;
            const p = paramsRef.current();

            if (p.kind === 'lights') {
                gl.blendFunc(gl.ONE, gl.ONE); // additive across overflow batches
                gl.uniform2f(loc('uResolution'), w, h);
                gl.uniform1f(loc('uTime'), t);
                const { perPass, passes } = lightBatches(p.lights.length, Math.min(maxVectors, MAX_LIGHTS_PER_PASS * 3 + 8));
                for (let pass = 0; pass < passes; pass++) {
                    const u = lightsToUniforms(p.lights, p.stageW, p.stageH, dpr, 1, pass * perPass);
                    if (u.count === 0) continue;
                    gl.uniform1i(loc('uLightCount'), u.count);
                    gl.uniform4fv(loc('uPosSize'), u.posSize);
                    gl.uniform4fv(loc('uColorType'), u.colorType);
                    gl.uniform4fv(loc('uTwinkle'), u.twinkle);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                }
            } else if (p.kind === 'beams') {
                gl.blendFunc(gl.ONE, gl.ONE);
                gl.uniform2f(loc('uResolution'), w, h);
                gl.uniform1f(loc('uTime'), t);
                const passes = Math.max(1, Math.ceil(p.beams.length / MAX_BEAMS_PER_PASS));
                for (let pass = 0; pass < passes; pass++) {
                    const u = beamsToUniforms(p.beams, p.stageW, p.stageH, dpr, pass * MAX_BEAMS_PER_PASS);
                    if (u.count === 0) continue;
                    gl.uniform1i(loc('uBeamCount'), u.count);
                    gl.uniform4fv(loc('uBeamA'), u.beamA);
                    gl.uniform4fv(loc('uBeamB'), u.beamB);
                    gl.uniform3fv(loc('uBeamCol'), u.beamCol);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                }
            } else if (p.kind === 'flashlight') {
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied over
                const u = flashlightToUniforms(p, p.stageW, p.stageH, dpr);
                gl.uniform2f(loc('uResolution'), w, h);
                gl.uniform1f(loc('uTime'), t);
                gl.uniform2f(loc('uMouse'), u.mouse[0], u.mouse[1]);
                gl.uniform1f(loc('uInnerR'), u.innerR);
                gl.uniform1f(loc('uOuterR'), u.outerR);
                gl.uniform1f(loc('uDarkness'), u.darkness);
                gl.uniform3f(loc('uDarkColor'), u.darkColor[0], u.darkColor[1], u.darkColor[2]);
                gl.uniform1f(loc('uHole'), u.hole);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            } else if (p.kind === 'atmosphere') {
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                const cfg = atmosphereConfig(p.type, p.speed ?? 1, p.wind ?? 0.5, p.density ?? 0.5);
                const col = hexToRgb01(p.color || cfg.defaultColor, [0.8, 0.84, 0.88]);
                gl.uniform2f(loc('uResolution'), w, h);
                gl.uniform1f(loc('uTime'), t);
                gl.uniform1f(loc('uIntensity'), Math.max(0, Math.min(1, p.intensity)) * cfg.baseAlpha);
                gl.uniform3f(loc('uColor'), col[0], col[1], col[2]);
                gl.uniform2f(loc('uDrift'), cfg.drift[0], cfg.drift[1]);
                gl.uniform1f(loc('uScale'), cfg.scale);
                gl.uniform1f(loc('uContrast'), cfg.contrast);
                gl.uniform1f(loc('uBandY'), cfg.bandY);
                gl.uniform1f(loc('uBandSoft'), cfg.bandSoft);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            } else if (p.kind === 'rain') {
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                const cfg = rainConfig(p.speed ?? 0.5, p.wind ?? 0.5, p.dropLength ?? 0.5);
                const col = hexToRgb01(p.color || cfg.defaultColor, [0.7, 0.82, 1.0]);
                gl.uniform2f(loc('uResolution'), w, h);
                gl.uniform1f(loc('uTime'), t);
                gl.uniform1f(loc('uIntensity'), Math.max(0, Math.min(1, p.intensity)));
                gl.uniform3f(loc('uColor'), col[0], col[1], col[2]);
                gl.uniform1f(loc('uFall'), cfg.fall);
                gl.uniform1f(loc('uSlant'), cfg.slant);
                gl.uniform1f(loc('uLen'), cfg.len);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            } else if (p.kind === 'snow') {
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                const cfg = snowConfig(p.variant, p.speed ?? 0.5, p.wind ?? 0.5, p.particleSize ?? 0.5);
                const col = hexToRgb01(p.color || cfg.defaultColor, [1, 1, 1]);
                gl.uniform2f(loc('uResolution'), w, h);
                gl.uniform1f(loc('uTime'), t);
                gl.uniform1f(loc('uIntensity'), Math.max(0, Math.min(1, p.intensity)));
                gl.uniform3f(loc('uColor'), col[0], col[1], col[2]);
                gl.uniform1f(loc('uFall'), cfg.fall);
                gl.uniform1f(loc('uDrift'), cfg.drift);
                gl.uniform1f(loc('uSize'), cfg.size);
                gl.uniform1f(loc('uWobble'), cfg.wobble);
                gl.uniform1f(loc('uAsh'), cfg.ash);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            } else if (p.kind === 'sunbeams') {
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                const cfg = sunbeamsConfig(p.spread ?? 0.5, p.speed ?? 0.5);
                const col = hexToRgb01(p.color || cfg.defaultColor, [1, 0.91, 0.72]);
                gl.uniform2f(loc('uResolution'), w, h);
                gl.uniform1f(loc('uTime'), t);
                gl.uniform1f(loc('uIntensity'), Math.max(0, Math.min(1, p.intensity)));
                gl.uniform3f(loc('uColor'), col[0], col[1], col[2]);
                gl.uniform1f(loc('uRayFreq'), cfg.rayFreq);
                gl.uniform1f(loc('uSway'), cfg.sway);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            } else if (p.kind === 'shimmer') {
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                const cfg = shimmerConfig(p.side ?? 'full', p.direction ?? 'up', !!p.particlesOnly, p.density ?? 0.5, p.speed ?? 0.5);
                const col = hexToRgb01(p.color || cfg.defaultColor, [1, 0.91, 0.79]);
                gl.uniform2f(loc('uResolution'), w, h);
                gl.uniform1f(loc('uTime'), t);
                gl.uniform1f(loc('uIntensity'), Math.max(0, Math.min(1, p.intensity)));
                gl.uniform3f(loc('uColor'), col[0], col[1], col[2]);
                gl.uniform1f(loc('uDriftDir'), cfg.driftDir);
                gl.uniform1f(loc('uDensity'), cfg.density);
                gl.uniform1f(loc('uSpeed'), cfg.speed);
                gl.uniform1f(loc('uSideMin'), cfg.sideMin);
                gl.uniform1f(loc('uSideMax'), cfg.sideMax);
                gl.uniform1f(loc('uWavesOn'), cfg.wavesOn);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            } else if (p.kind === 'fireworks') {
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                const cfg = fireworksConfig(p.speed ?? 0.5);
                const tinted = !!p.color;
                const col = hexToRgb01(p.color || '#ffffff', [1, 1, 1]);
                gl.uniform2f(loc('uResolution'), w, h);
                gl.uniform1f(loc('uTime'), t);
                gl.uniform1f(loc('uIntensity'), Math.max(0, Math.min(1, p.intensity)));
                gl.uniform1f(loc('uRate'), cfg.rate);
                gl.uniform3f(loc('uTint'), col[0], col[1], col[2]);
                gl.uniform1f(loc('uTintOn'), tinted ? 1 : 0);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            } else if (p.kind === 'lightning') {
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                const col = hexToRgb01(p.color || '#eaf2ff', [0.92, 0.95, 1]);
                gl.uniform2f(loc('uResolution'), w, h);
                gl.uniform1f(loc('uTime'), t);
                gl.uniform1f(loc('uIntensity'), Math.max(0, Math.min(1, p.intensity)));
                gl.uniform3f(loc('uColor'), col[0], col[1], col[2]);
                gl.uniform1f(loc('uCycle'), lightningCycleSeconds(p.speed ?? 0.5));
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            } else {
                // crt
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                const cfg = crtConfig(p.lineSpacing ?? 0.5, p.speed ?? 0.5);
                const dprNow = Math.max(1, Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
                gl.uniform2f(loc('uResolution'), w, h);
                gl.uniform1f(loc('uTime'), t);
                gl.uniform1f(loc('uIntensity'), Math.max(0, Math.min(1, p.intensity)));
                gl.uniform1f(loc('uSpacing'), cfg.spacing);
                gl.uniform1f(loc('uRoll'), cfg.roll);
                gl.uniform1f(loc('uDpr'), dprNow);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            }
            raf = requestAnimationFrame(frame);
        };

        const onLost = (e: Event) => {
            e.preventDefault();
            lost = true;
            cancelAnimationFrame(raf);
            // Hand over to Classic immediately — a lost context that is never restored used to
            // leave a permanently blank canvas with no fallback.
            failOver('WebGL context lost');
        };
        const onRestored = () => {
            // A restore invalidates all GL objects — simplest correct handling is to fail over
            // to Classic; the next mount (scene change / toggle) tries WebGL again.
            setFailed(true);
        };
        canvas.addEventListener('webglcontextlost', onLost);
        canvas.addEventListener('webglcontextrestored', onRestored);
        raf = requestAnimationFrame(frame);

        return () => {
            disposed = true;
            cancelAnimationFrame(raf);
            canvas.removeEventListener('webglcontextlost', onLost);
            canvas.removeEventListener('webglcontextrestored', onRestored);
            /* Free what we allocated, but NEVER loseContext() here: this cleanup also runs on a
             * plain dependency change, and a lost context can't be revived on the same canvas.
             * The context itself is released by the unmount-only effect above. */
            try { gl.deleteProgram(prog); } catch { /* context already gone */ }
        };
    }, [kind, hasSize, failed]);

    // Tell the host once, so it can re-arm the Classic simulations it owns.
    useEffect(() => { if (failed) onFallback?.(); }, [failed]);

    if (failed) return <>{children}</>;
    return (
        <canvas
            key={kind}
            ref={canvasRef}
            aria-hidden
            className={className || 'vnfx-canvas'}
            style={style}
        />
    );
};

export default GlFxCanvas;
