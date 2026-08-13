/**
 * glFx — the engine's lean WebGL layer for "Enhanced" effect styles. Zero dependencies.
 *
 * Design rules (see plan "Enhanced Effects"):
 *  - WebGL1 only, mediump, fullscreen-quad fragment shaders — maximum WebView compatibility.
 *  - Every shader ends with a hash-noise dither (±1/255) so soft gradients don't band.
 *  - Absence is data: `effectStyle` is only ever stored as 'enhanced'; anything else = Classic.
 *  - All param→uniform mappers are PURE and exported for unit tests.
 *  - Failure anywhere (no WebGL, context loss) → the caller renders the Classic JSX instead.
 */
import { VNScreenLight } from '../../../types/screen-effects';
import { CommandType, VNCommand } from '../../../features/scene/types';

/** The single style predicate: only the literal 'enhanced' turns the shaders on. */
export function isEnhanced(style?: string | null): boolean {
    return style === 'enhanced';
}

/** Which commands can offer the Enhanced style (round 1: lighting trio + atmosphere). */
export function commandHasEnhancedStyle(command: VNCommand): boolean {
    switch (command.type) {
        case CommandType.PlaceLights:
        case CommandType.Flashlight:
        case CommandType.Spotlight:
            return true;
        case CommandType.SetScreenOverlayEffect: {
            const t = (command as any).effectType;
            return t === 'fog' || t === 'haze' || t === 'smoke';
        }
        default:
            return false;
    }
}

/** Screen-attached effect rows that can offer the Enhanced style (round 1). */
export const ENHANCED_OVERLAY_TYPES: ReadonlySet<string> = new Set([
    'fog', 'haze', 'smoke', 'lights', 'spotlight', 'flashlight',
]);

// ── Context / program plumbing ──────────────────────────────────────────────────────────

let webglProbe: boolean | null = null;
/** Cheap memoized probe so we don't create-and-fail a context per effect per scene. */
export function webglLikelyAvailable(): boolean {
    if (webglProbe !== null) return webglProbe;
    try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
        webglProbe = !!gl;
        if (gl) (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
        webglProbe = false;
    }
    return webglProbe;
}

export function createGlContext(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
    const opts: WebGLContextAttributes = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false };
    try {
        return (canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts)) as WebGLRenderingContext | null;
    } catch {
        return null;
    }
}

export function compileProgram(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
    const make = (type: number, src: string): WebGLShader | null => {
        const sh = gl.createShader(type);
        if (!sh) return null;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            // eslint-disable-next-line no-console
            console.warn('[glFx] shader compile failed:', gl.getShaderInfoLog(sh));
            gl.deleteShader(sh);
            return null;
        }
        return sh;
    };
    const vs = make(gl.VERTEX_SHADER, vsSrc);
    const fs = make(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        // eslint-disable-next-line no-console
        console.warn('[glFx] program link failed:', gl.getProgramInfoLog(prog));
        return null;
    }
    return prog;
}

/** Fullscreen clip-space quad; returns the attribute setup fn. */
export function makeQuad(gl: WebGLRenderingContext, prog: WebGLProgram): () => void {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    return () => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    };
}

/** DPR-clamped backing-store sizing — the exact pattern of the existing 2D canvases. */
export function sizeCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): { w: number; h: number; dpr: number } {
    const dpr = Math.max(1, Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    return { w, h, dpr };
}

// ── Shared shader sources ───────────────────────────────────────────────────────────────

export const QUAD_VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/** Hash-noise dither shared chunk (±1/255) — kills gradient banding on 8-bit surfaces. */
const DITHER = `
float vnHash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
`;

// ── Lights (Placed Lights + the screen 'lights' row) ────────────────────────────────────

/** Compile-time light slots per draw call; device capacity may lower the per-pass batch. */
export const MAX_LIGHTS_PER_PASS = 16;

export const LIGHTS_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uResolution;   // backing-store px
uniform float uTime;        // seconds
uniform int uLightCount;
uniform vec4 uPosSize[${MAX_LIGHTS_PER_PASS}];   // x,y (px), radius (px), brightness 0..1
uniform vec4 uColorType[${MAX_LIGHTS_PER_PASS}]; // r,g,b, typeId (0 candle, 1 star, 2 bulb)
uniform vec4 uTwinkle[${MAX_LIGHTS_PER_PASS}];   // mode (0 fade,1 blink,2 chase,3 steady), speed, phase, 0
${DITHER}
void main() {
    // CSS-space pixels: y runs DOWN (vUv.y is up in GL's framebuffer, so flip it).
    vec2 frag = vec2(vUv.x, 1.0 - vUv.y) * uResolution;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < ${MAX_LIGHTS_PER_PASS}; i++) {
        if (i >= uLightCount) break;
        vec2 center = uPosSize[i].xy;
        float radius = max(uPosSize[i].z, 1.0);
        float bright = uPosSize[i].w;
        vec3 color = uColorType[i].rgb;
        float typeId = uColorType[i].w;
        float mode = uTwinkle[i].x;
        float speed = max(uTwinkle[i].y, 0.001);
        float phase = uTwinkle[i].z;

        // Twinkle — matches the Classic keyframe rhythms per light type.
        float t = uTime;
        float tw = 1.0;
        if (typeId < 0.5) {
            // candle: organic flicker (two incommensurate sines + a touch of hash jitter)
            float w = 6.283 / (1.1 / speed);
            tw = 0.86 + 0.10 * sin(t * w + phase * 7.0) + 0.06 * sin(t * w * 1.73 + phase * 13.0);
            center += vec2(sin(t * w * 1.31 + phase * 5.0), cos(t * w * 0.87 + phase * 3.0)) * radius * 0.015;
        } else if (typeId < 1.5) {
            // star: slow sparkle
            float w = 6.283 / (2.2 / speed);
            tw = 0.72 + 0.28 * sin(t * w + phase * 9.0);
        } else {
            // bulb: fade / blink / chase / steady
            if (mode < 0.5) { float w = 6.283 / (1.6 / speed); tw = 0.62 + 0.38 * sin(t * w + phase * 6.283); }
            else if (mode < 1.5) { float w = 1.0 / speed; tw = step(0.5, fract(t / w + phase)) * 0.75 + 0.25; }
            else if (mode < 2.5) { float w = 6.283 / (1.6 / speed); tw = 0.62 + 0.38 * sin(t * w - phase * 6.283); }
            /* steady: tw = 1 */
        }
        float b = bright * tw;

        float d = distance(frag, center) / radius;
        // Hot core + inverse-square-ish body that smoothsteps to TRUE zero at the radius
        // (the Classic gradients' "no halo ring" rule), plus a faint wide bloom Classic can't do.
        float core = exp(-d * d * 34.0) * 1.35;
        float body = (1.0 / (1.0 + 9.0 * d * d) - 0.1) * smoothstep(1.0, 0.55, d);
        float glow = max(core, 0.0) + max(body, 0.0);
        float bloom = 0.05 * max(0.0, 1.0 - d * 0.5);   // reaches ~2× radius, very faint
        float intensity = b * (glow + bloom);

        vec3 lightCol = mix(vec3(1.0), color, clamp(d * 2.2, 0.0, 1.0)); // white-hot center → color
        acc += lightCol * intensity;
    }
    // Dither, clamp, premultiplied output (canvas is screen-blended by CSS like Classic).
    float dith = (vnHash(vUv * uResolution) - 0.5) / 255.0;
    acc = clamp(acc + dith, 0.0, 1.0);
    float a = clamp(max(acc.r, max(acc.g, acc.b)), 0.0, 1.0);
    gl_FragColor = vec4(acc * a, a);
}
`;

/** Default light colors per type (mirrors LightsLayer's Classic defaults). */
export const LIGHT_DEFAULT_COLORS: Record<string, string> = {
    candle: '#ffb94b',
    star: '#ffffff',
    christmas: '#ff3b3b',
};

const hexToRgb01 = (hex: string): [number, number, number] => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return [1, 1, 1];
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export interface LightsUniforms {
    count: number;
    posSize: Float32Array;   // 4 per light
    colorType: Float32Array; // 4 per light
    twinkle: Float32Array;   // 4 per light
}

/** PURE: VNScreenLight[] → shader uniform arrays for ONE pass (≤ MAX_LIGHTS_PER_PASS lights).
 *  Geometry matches LightsLayer exactly: sizePx = max(6, min(W,H)*0.05*size); the shader's
 *  radius is the Classic glow box half-width (sizePx*0.9). Phases reuse the Classic per-index
 *  delay formulas so Enhanced keeps the authored twinkle rhythm. `brightnessScale` is the live
 *  ⚡ brightness multiplier applied upstream in Classic. */
export function lightsToUniforms(
    lights: VNScreenLight[],
    stageW: number,
    stageH: number,
    dpr = 1,
    brightnessScale = 1,
    startIndex = 0,
): LightsUniforms {
    const slice = lights.slice(startIndex, startIndex + MAX_LIGHTS_PER_PASS);
    const base = Math.min(stageW || 800, stageH || 600);
    const posSize = new Float32Array(MAX_LIGHTS_PER_PASS * 4);
    const colorType = new Float32Array(MAX_LIGHTS_PER_PASS * 4);
    const twinkle = new Float32Array(MAX_LIGHTS_PER_PASS * 4);
    slice.forEach((l, k) => {
        const i = startIndex + k; // GLOBAL index — phases must not change across batches
        const sizePx = Math.max(6, base * 0.05 * (l.size ?? 1));
        const spd = l.twinkleSpeed && l.twinkleSpeed > 0 ? l.twinkleSpeed : 1;
        const tw = l.twinkle ?? 'fade';
        const mode = tw === 'fade' ? 0 : tw === 'blink' ? 1 : tw === 'chase' ? 2 : 3;
        const phase = tw === 'chase' ? (i % 5) * (0.32 / spd) : (i % 7) * 0.13;
        const [r, g, b] = hexToRgb01(l.color || LIGHT_DEFAULT_COLORS[l.type] || '#ffffff');
        posSize[k * 4] = (l.x / 100) * stageW * dpr;
        posSize[k * 4 + 1] = (l.y / 100) * stageH * dpr;
        posSize[k * 4 + 2] = sizePx * 0.9 * dpr;
        posSize[k * 4 + 3] = Math.max(0, Math.min(1, (l.brightness ?? 1) * brightnessScale));
        colorType[k * 4] = r; colorType[k * 4 + 1] = g; colorType[k * 4 + 2] = b;
        colorType[k * 4 + 3] = l.type === 'candle' ? 0 : l.type === 'star' ? 1 : 2;
        twinkle[k * 4] = mode; twinkle[k * 4 + 1] = spd; twinkle[k * 4 + 2] = phase;
    });
    return { count: slice.length, posSize, colorType, twinkle };
}

/** PURE: how many additive passes a light list needs on a device with the given uniform
 *  capacity (spec minimum is 16 vec4s — even that renders everything, just in more passes). */
export function lightBatches(lightCount: number, maxFragmentUniformVectors: number): { perPass: number; passes: number } {
    // Reserve ~8 vectors for uResolution/uTime/count/etc.; each light costs 3 vec4s.
    const capacity = Math.max(1, Math.min(MAX_LIGHTS_PER_PASS, Math.floor((maxFragmentUniformVectors - 8) / 3)));
    return { perPass: capacity, passes: Math.max(1, Math.ceil(lightCount / capacity)) };
}

// ── Spotlight beams ─────────────────────────────────────────────────────────────────────

export const MAX_BEAMS_PER_PASS = 8;

export const BEAMS_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform int uBeamCount;
uniform vec4 uBeamA[${MAX_BEAMS_PER_PASS}]; // sourceX,sourceY (px), aimAngle (rad), intensity
uniform vec4 uBeamB[${MAX_BEAMS_PER_PASS}]; // halfSourceW, halfEndW, lengthPx, falloff 0..1
uniform vec3 uBeamCol[${MAX_BEAMS_PER_PASS}];
${DITHER}
void main() {
    // CSS-space pixels: y runs DOWN (vUv.y is up in GL's framebuffer, so flip it).
    vec2 frag = vec2(vUv.x, 1.0 - vUv.y) * uResolution;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < ${MAX_BEAMS_PER_PASS}; i++) {
        if (i >= uBeamCount) break;
        vec2 src = uBeamA[i].xy;
        float ang = uBeamA[i].z;
        float inten = uBeamA[i].w;
        float halfSrc = uBeamB[i].x;
        float halfEnd = uBeamB[i].y;
        float len = max(uBeamB[i].z, 1.0);
        float falloff = clamp(uBeamB[i].w, 0.02, 1.0);
        // Into beam space: +y runs DOWN the beam (screen-down when angle 0 — matches Classic).
        vec2 rel = frag - src;
        float c = cos(ang), s = sin(ang);
        vec2 p = vec2(c * rel.x - s * rel.y, s * rel.x + c * rel.y);
        float along = p.y / len;                 // 0 at source → 1 at end
        if (along < -0.02) continue;
        // Cone half-width at this depth; soft penumbra scaled by falloff.
        float halfW = mix(halfSrc, halfEnd, clamp(along, 0.0, 1.0));
        float edge = abs(p.x) / max(halfW, 1.0);
        float penumbra = smoothstep(1.0, 1.0 - 0.75 * falloff, edge);
        // Length falloff mirrors the Classic radial: full → soft → zero past the end.
        float lengthFade = smoothstep(1.05, 0.55, along) * smoothstep(-0.02, 0.03, along);
        // A touch brighter along the beam's core axis (volumetric read).
        float core = 1.0 + 0.35 * (1.0 - edge) * (1.0 - along);
        acc += uBeamCol[i] * (inten * penumbra * lengthFade * core * 0.85);
    }
    float dith = (vnHash(vUv * uResolution + uTime) - 0.5) / 255.0;
    acc = clamp(acc + dith, 0.0, 1.0);
    float a = clamp(max(acc.r, max(acc.g, acc.b)), 0.0, 1.0);
    gl_FragColor = vec4(acc * a, a);
}
`;

export interface BeamLike {
    sourceX: number; sourceY: number; aimAngle: number; intensity?: number;
    beamWidth?: number; sourceWidth?: number; height?: number; falloff?: number; color?: string;
}

export interface BeamsUniforms {
    count: number;
    beamA: Float32Array;
    beamB: Float32Array;
    beamCol: Float32Array;
}

/** PURE: beam states → shader uniforms. Percent geometry matches the Classic clipPath cone:
 *  source at (sourceX%, sourceY%), aimed aimAngle° clockwise from straight down, widths as
 *  % of stage width, length as % of stage height. */
export function beamsToUniforms(beams: BeamLike[], stageW: number, stageH: number, dpr = 1, startIndex = 0): BeamsUniforms {
    const slice = beams.slice(startIndex, startIndex + MAX_BEAMS_PER_PASS);
    const beamA = new Float32Array(MAX_BEAMS_PER_PASS * 4);
    const beamB = new Float32Array(MAX_BEAMS_PER_PASS * 4);
    const beamCol = new Float32Array(MAX_BEAMS_PER_PASS * 3);
    slice.forEach((b, k) => {
        const [r, g, bl] = (() => {
            const m = /^#?([0-9a-f]{6})$/i.exec((b.color || '#fff3d6').trim());
            if (!m) return [1, 0.95, 0.84];
            const n = parseInt(m[1], 16);
            return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
        })();
        beamA[k * 4] = (b.sourceX / 100) * stageW * dpr;
        beamA[k * 4 + 1] = (b.sourceY / 100) * stageH * dpr;
        beamA[k * 4 + 2] = ((b.aimAngle ?? 0) * Math.PI) / 180;
        beamA[k * 4 + 3] = Math.max(0, Math.min(1, b.intensity ?? 0.85));
        beamB[k * 4] = (((b.sourceWidth ?? 8) / 2) / 100) * stageW * dpr;
        beamB[k * 4 + 1] = (((b.beamWidth ?? 45) / 2) / 100) * stageW * dpr;
        beamB[k * 4 + 2] = (((b.height ?? 100)) / 100) * stageH * dpr;
        beamB[k * 4 + 3] = b.falloff ?? 0.5;
        beamCol[k * 3] = r; beamCol[k * 3 + 1] = g; beamCol[k * 3 + 2] = bl;
    });
    return { count: slice.length, beamA, beamB, beamCol };
}

// ── Flashlight ──────────────────────────────────────────────────────────────────────────

export const FLASHLIGHT_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uMouse;      // px
uniform float uInnerR;    // px — fully lit
uniform float uOuterR;    // px — darkness begins
uniform float uDarkness;  // 0..1
uniform vec3 uDarkColor;
uniform float uHole;      // 1 = flashlight on (hole visible), 0 = off (solid darkness)
${DITHER}
void main() {
    // CSS-space pixels: y runs DOWN (vUv.y is up in GL's framebuffer, so flip it).
    vec2 frag = vec2(vUv.x, 1.0 - vUv.y) * uResolution;
    float d = distance(frag, uMouse);
    // Dithered soft penumbra between inner (clear) and outer (fully dark).
    float dark = smoothstep(uInnerR, uOuterR, d);
    // A faint warm rim just inside the light's edge — the "torch glow" Classic can't do.
    float rim = smoothstep(uOuterR, uInnerR, d) * smoothstep(uInnerR * 0.35, uInnerR, d) * 0.12;
    float a = uDarkness * mix(1.0, dark, uHole);
    float dith = (vnHash(vUv * uResolution) - 0.5) / 255.0;
    a = clamp(a + dith, 0.0, 1.0);
    vec3 col = uDarkColor * a + vec3(1.0, 0.82, 0.5) * rim * uHole * (1.0 - a);
    gl_FragColor = vec4(col, a);
}
`;

export interface FlashlightUniformsInput {
    mouseX: number; mouseY: number;   // px (CSS)
    radius: number;                    // 5..60 (% of min stage dimension, Classic semantics)
    softness: number;                  // 0..1
    darkness: number;                  // 0..1
    on: boolean;
    color?: string;                    // darkness color
}

/** PURE: flashlight params → uniforms. Radius semantics mirror the Classic gradient:
 *  lit radius = radius% of min(stageW,stageH); softness feathers the edge outward. */
export function flashlightToUniforms(p: FlashlightUniformsInput, stageW: number, stageH: number, dpr = 1) {
    const base = Math.min(stageW || 800, stageH || 600);
    const litR = (Math.max(2, p.radius) / 100) * base;
    const soft = Math.max(0.02, Math.min(1, p.softness));
    const inner = litR * (1 - soft * 0.55);
    const outer = litR * (1 + soft * 0.9);
    const m = /^#?([0-9a-f]{6})$/i.exec((p.color || '#000000').trim());
    const n = m ? parseInt(m[1], 16) : 0;
    return {
        mouse: [p.mouseX * dpr, p.mouseY * dpr] as [number, number],
        innerR: inner * dpr,
        outerR: outer * dpr,
        darkness: Math.max(0, Math.min(1, p.darkness)),
        darkColor: [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as [number, number, number],
        hole: p.on ? 1 : 0,
    };
}

// ── Atmosphere (fog / haze / smoke) ─────────────────────────────────────────────────────

export const ATMOS_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;   // 0..1
uniform vec3 uColor;
uniform vec2 uDrift;        // uv/sec
uniform float uScale;       // noise cells across the width
uniform float uContrast;    // shaping exponent
uniform float uBandY;       // 0..1 — vertical center of the band (fog sits low)
uniform float uBandSoft;    // band softness (1 = no banding, fills screen)
${DITHER}
float vnNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = vnHash(i);
    float b = vnHash(i + vec2(1.0, 0.0));
    float c = vnHash(i + vec2(0.0, 1.0));
    float d = vnHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.55;
    for (int i = 0; i < 3; i++) {
        v += amp * vnNoise(p);
        p = p * 2.03 + vec2(17.7, 9.2);
        amp *= 0.5;
    }
    return v;
}
void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = vec2(uv.x * aspect, 1.0 - uv.y) * uScale + uDrift * uTime;
    // Mild domain warp for billowy shapes.
    float w = fbm(p * 0.5 + vec2(uTime * 0.02, 0.0));
    float n = fbm(p + vec2(w * 1.6, w * 0.8));
    n = pow(clamp(n * 1.25, 0.0, 1.0), uContrast);
    // Vertical band shaping (fog hugs the ground; haze fills; smoke rises).
    float band = 1.0 - clamp(abs((1.0 - uv.y) - uBandY) / max(uBandSoft, 0.05), 0.0, 1.0);
    band = band * band * (3.0 - 2.0 * band);
    float a = clamp(n * band * uIntensity, 0.0, 0.92);
    float dith = (vnHash(uv * uResolution) - 0.5) / 255.0;
    a = clamp(a + dith, 0.0, 1.0);
    gl_FragColor = vec4(uColor * a, a);
}
`;

export interface AtmosConfig {
    drift: [number, number];
    scale: number;
    contrast: number;
    bandY: number;
    bandSoft: number;
    baseAlpha: number;
    defaultColor: string;
}

/** PURE: per-type presets mirroring runCloudSim's three characters — fog = low slow banks,
 *  haze = faint full-screen veil, smoke = darker rising wisps. `speed`/`windStrength` come
 *  from the effect's existing params (no new authoring fields). */
export function atmosphereConfig(type: 'fog' | 'haze' | 'smoke', speed = 1, wind = 0.5, density = 0.5): AtmosConfig {
    /* Density (authorable, 0..1, default 0.5 = today's look exactly): thickens or thins the
     * cover. Alpha carries most of it; contrast moves the opposite way slightly so thin smoke
     * breaks into wisps rather than becoming a uniform grey film. */
    const dAlpha = 0.5 + density;               // ×0.5 .. ×1.5
    const dContrast = 1.25 - density * 0.5;     // ×1.0 at default; thin → crisper wisps
    const drift = 0.012 * speed * (0.5 + wind);
    if (type === 'fog') return { drift: [drift, 0.002 * speed], scale: 3.2, contrast: 1.35 * dContrast, bandY: 0.16, bandSoft: 0.55, baseAlpha: Math.min(1, 0.8 * dAlpha), defaultColor: '#cdd6e0' };
    if (type === 'haze') return { drift: [drift * 0.6, 0.0], scale: 2.2, contrast: 1.0 * dContrast, bandY: 0.5, bandSoft: 1.0, baseAlpha: Math.min(1, 0.55 * dAlpha), defaultColor: '#c9cfd8' };
    return { drift: [drift * 0.8, -0.01 * speed], scale: 4.0, contrast: 1.7 * dContrast, bandY: 0.3, bandSoft: 0.8, baseAlpha: Math.min(1, 0.85 * dAlpha), defaultColor: '#4a4a52' };
}
