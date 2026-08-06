import React, { useEffect, useRef, useState } from 'react';
import {
    createGlContext, compileProgram, makeQuad, sizeCanvas,
    QUAD_VS, LIGHTS_FS, BEAMS_FS, FLASHLIGHT_FS, ATMOS_FS,
    MAX_LIGHTS_PER_PASS, MAX_BEAMS_PER_PASS,
    lightsToUniforms, lightBatches, beamsToUniforms, flashlightToUniforms, atmosphereConfig,
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
}
export type GlFxParams = LightsParams | BeamsParams | FlashlightParams | AtmosphereParams;

const FS_BY_KIND: Record<GlFxParams['kind'], string> = {
    lights: LIGHTS_FS,
    beams: BEAMS_FS,
    flashlight: FLASHLIGHT_FS,
    atmosphere: ATMOS_FS,
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
}> = ({ kind, getParams, width, height, className, style, children }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const paramsRef = useRef(getParams);
    paramsRef.current = getParams;
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (failed) return;
        const canvas = canvasRef.current;
        // 0×0 first frames (useStageSize starts empty) — wait for a real size (FireworksBurst rule).
        if (!canvas || width <= 0 || height <= 0) return;

        const gl = createGlContext(canvas);
        if (!gl) { setFailed(true); return; }
        const prog = compileProgram(gl, QUAD_VS, FS_BY_KIND[kind]);
        if (!prog) { setFailed(true); return; }
        const bindQuad = makeQuad(gl, prog);
        const loc = (name: string) => gl.getUniformLocation(prog, name);
        const maxVectors = (gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number) || 64;

        let raf = 0;
        let disposed = false;
        let lost = false;
        const started = performance.now();

        const frame = () => {
            if (disposed || lost) return;
            const { w, h, dpr } = sizeCanvas(canvas, width, height);
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
            } else {
                // atmosphere
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                const cfg = atmosphereConfig(p.type, p.speed ?? 1, p.wind ?? 0.5);
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
            }
            raf = requestAnimationFrame(frame);
        };

        const onLost = (e: Event) => { e.preventDefault(); lost = true; cancelAnimationFrame(raf); };
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
            try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* already gone */ }
        };
    }, [kind, width, height, failed]);

    if (failed) return <>{children}</>;
    return (
        <canvas
            ref={canvasRef}
            aria-hidden
            className={className || 'vnfx-canvas'}
            style={style}
        />
    );
};

export default GlFxCanvas;
