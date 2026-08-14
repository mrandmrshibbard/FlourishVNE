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

/** Which commands can offer the Enhanced style (round 1: lighting trio + atmosphere;
 *  round 2 adds every weather/light overlay type the Set Screen Effect command can set). */
export function commandHasEnhancedStyle(command: VNCommand): boolean {
    switch (command.type) {
        case CommandType.PlaceLights:
        case CommandType.Flashlight:
        case CommandType.Spotlight:
            return true;
        case CommandType.SetScreenOverlayEffect: {
            const t = (command as any).effectType;
            return typeof t === 'string' && ENHANCED_OVERLAY_TYPES.has(t);
        }
        default:
            return false;
    }
}

/** Screen-attached effect rows that can offer the Enhanced style.
 *  Round 1: the lighting trio + atmosphere. Round 2: rain, snow/ash, sunbeams, shimmer,
 *  fireworks, lightning, CRT scanlines. Deliberately NOT here: 'glitch' and
 *  'chromaticGlitch' — their real pixel tear is a displacement filter applied to the game
 *  container itself, which an overlay canvas cannot reproduce or improve on. */
export const ENHANCED_OVERLAY_TYPES: ReadonlySet<string> = new Set([
    'fog', 'haze', 'smoke', 'lights', 'spotlight', 'flashlight',
    'rain', 'snowAsh', 'sunbeams', 'shimmer', 'fireworks', 'lightning', 'crtScanlines',
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

// ── Round 2 shaders — weather, light shows, and the CRT mask ────────────────────────────
// Same rules as round 1: WebGL1 mediump fullscreen quads, hash-dither everywhere, the
// pixel-space y-flip (`vec2(vUv.x, 1.0 - vUv.y)`), premultiplied output, PURE mappers.

/** Shared value-noise chunk (same as ATMOS_FS's — each shader carries its own copy because
 *  WebGL1 has no includes). */
const NOISE = `
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
`;

// ── Rain — three parallax layers of real streaks with per-drop stagger ──────────────────

export const RAIN_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;  // 0..1 — density AND opacity
uniform vec3 uColor;
uniform float uFall;       // fall speed (cells/sec)
uniform float uSlant;      // sideways drift (uv per unit height)
uniform float uLen;        // streak length multiplier ~0.4..1.6
${DITHER}
float rainLayer(vec2 uv, float scale, float speed, float w, float seed) {
    // Slanted, tall cells: one potential drop per cell, staggered per column.
    uv.x += uv.y * uSlant;
    vec2 p = vec2(uv.x * scale, uv.y * scale / (10.0 * uLen));
    p.y += uTime * speed + seed * 37.7;
    vec2 id = floor(p);
    float h = vnHash(id + seed);
    vec2 f = fract(p);
    // Only a portion of cells carry a drop — density rides intensity.
    if (h > 0.25 + uIntensity * 0.65) return 0.0;
    float x = f.x - 0.5 + (h - 0.5) * 0.55;
    // Streak: bright head fading up its tail.
    float streak = smoothstep(w, w * 0.25, abs(x))
                 * smoothstep(0.0, 0.25, f.y) * smoothstep(1.0, 0.55, f.y);
    return streak;
}
void main() {
    vec2 frag = vec2(vUv.x, 1.0 - vUv.y);
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 uv = vec2(frag.x * aspect, frag.y);
    // Three depths: near (fast, bold), mid, far (slow, faint) — parallax Classic can't do.
    float a = 0.0;
    a += rainLayer(uv, 22.0, uFall * 1.25, 0.085, 1.0) * 0.5;
    a += rainLayer(uv, 34.0, uFall,        0.075, 2.0) * 0.34;
    a += rainLayer(uv, 52.0, uFall * 0.8,  0.065, 3.0) * 0.2;
    a *= uIntensity * 0.9;
    float dith = (vnHash(vUv * uResolution + uTime) - 0.5) / 255.0;
    a = clamp(a + dith, 0.0, 1.0);
    gl_FragColor = vec4(uColor * a, a);
}
`;

export interface RainConfig { fall: number; slant: number; len: number; defaultColor: string; }
/** PURE: rain params → shader knobs. Semantics mirror the Classic sim: speed scales fall
 *  rate, windStrength slants the streaks, dropLength stretches them. */
export function rainConfig(speed = 0.5, wind = 0.5, dropLength = 0.5): RainConfig {
    return {
        fall: 2.6 * (0.3 + speed * 1.4),
        slant: (wind - 0.5) * 0.9,          // centred: 0.5 = straight down, matches calm default
        len: 0.4 + dropLength * 1.2,        // the Classic lenMul range exactly
        defaultColor: '#b4d2ff',
    };
}

// ── Snow / Ash — soft drifting flakes with wobble, three parallax depths ────────────────

export const SNOW_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform vec3 uColor;
uniform float uFall;       // fall speed
uniform float uDrift;      // sideways wind
uniform float uSize;       // flake size multiplier
uniform float uWobble;     // sway amplitude
uniform float uAsh;        // 0 = snow (bright, soft), 1 = ash (small, dimmer, tumbling)
${DITHER}
float flakeLayer(vec2 uv, float scale, float speed, float seed) {
    vec2 p = uv * scale;
    p.y += uTime * speed + seed * 19.1;
    p.x += uTime * uDrift * speed * 0.45;
    vec2 id = floor(p);
    float h = vnHash(id + seed);
    if (h > 0.20 + uIntensity * 0.5) return 0.0;
    vec2 f = fract(p);
    // Per-flake wobble: each sways on its own phase; ash tumbles faster and smaller.
    float sway = sin(uTime * (0.8 + h * 1.6) * (1.0 + uAsh * 0.8) + h * 40.0) * uWobble;
    vec2 center = vec2(0.25 + h * 0.5 + sway, 0.25 + fract(h * 7.3) * 0.5);
    float r = (0.05 + fract(h * 13.7) * 0.06) * uSize * (1.0 - uAsh * 0.35);
    float d = distance(f, center);
    // Soft-edged disc with a faint halo (snow) or a harder small mote (ash).
    float body = smoothstep(r, r * mix(0.35, 0.75, uAsh), d);
    float halo = (1.0 - uAsh) * 0.25 * smoothstep(r * 2.4, r, d);
    // Gentle per-flake twinkle so the field feels alive.
    float tw = 0.8 + 0.2 * sin(uTime * (1.0 + h * 2.0) + h * 90.0);
    return (body + halo) * tw;
}
void main() {
    vec2 frag = vec2(vUv.x, 1.0 - vUv.y);
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 uv = vec2(frag.x * aspect, frag.y);
    float a = 0.0;
    a += flakeLayer(uv, 7.0,  uFall,        1.0) * 0.55;
    a += flakeLayer(uv, 11.0, uFall * 0.75, 2.0) * 0.35;
    a += flakeLayer(uv, 17.0, uFall * 0.55, 3.0) * 0.22;
    a *= uIntensity * mix(0.85, 0.6, uAsh);
    float dith = (vnHash(vUv * uResolution + uTime) - 0.5) / 255.0;
    a = clamp(a + dith, 0.0, 1.0);
    gl_FragColor = vec4(uColor * a, a);
}
`;

export interface SnowConfig { fall: number; drift: number; size: number; wobble: number; ash: number; defaultColor: string; }
/** PURE: snow/ash params → shader knobs, mirroring the Classic particle ranges (ash falls
 *  faster, smaller, dimmer, and swings less than snow). */
export function snowConfig(variant: 'snow' | 'ash', speed = 0.5, wind = 0.5, particleSize = 0.5): SnowConfig {
    const ash = variant === 'ash' ? 1 : 0;
    return {
        fall: (variant === 'ash' ? 0.34 : 0.22) * (0.4 + speed * 1.4),
        drift: (wind - 0.5) * 2.2,
        size: 0.55 + particleSize * 1.1,
        wobble: (variant === 'ash' ? 0.06 : 0.11) * (0.5 + wind),
        ash,
        defaultColor: variant === 'ash' ? '#b0a89e' : '#ffffff',
    };
}

// ── Sunbeams — volumetric god rays with slow fbm shafts ─────────────────────────────────

export const SUNBEAMS_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform vec3 uColor;
uniform float uRayFreq;    // shafts around the arc (spread: wide rays = low freq)
uniform float uSway;       // shaft drift speed
${DITHER}
${NOISE}
void main() {
    vec2 frag = vec2(vUv.x, 1.0 - vUv.y);
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    // Light source just above the top centre — rays fan down across the scene.
    vec2 src = vec2(0.5 * aspect, -0.15);
    vec2 p = vec2(frag.x * aspect, frag.y);
    vec2 rel = p - src;
    float ang = atan(rel.x, rel.y);           // 0 = straight down
    float dist = length(rel);
    // Shafts: two drifting noise bands over the angle — broad structure + fine detail.
    float shaft = fbm(vec2(ang * uRayFreq, uTime * uSway))
                * (0.6 + 0.4 * vnNoise(vec2(ang * uRayFreq * 2.7 + 13.1, uTime * uSway * 0.6)));
    shaft = pow(clamp(shaft * 1.5, 0.0, 1.0), 2.2);
    // Fade with distance from the source and toward the bottom (light dies in the depth).
    float reach = smoothstep(1.65, 0.15, dist);
    float depthFade = smoothstep(1.05, 0.25, frag.y);
    // A soft ambient glow near the source so the fan has a bright origin.
    float glow = 0.35 * smoothstep(0.9, 0.0, dist);
    float a = (shaft * reach * depthFade + glow) * uIntensity * 0.55;
    float dith = (vnHash(vUv * uResolution) - 0.5) / 255.0;
    a = clamp(a + dith, 0.0, 0.85);
    gl_FragColor = vec4(uColor * a, a);
}
`;

export interface SunbeamsConfig { rayFreq: number; sway: number; defaultColor: string; }
/** PURE: sunbeams params → shader knobs. `spread` widens the shafts (fewer, fatter rays);
 *  `speed` drifts them. */
export function sunbeamsConfig(spread = 0.5, speed = 0.5): SunbeamsConfig {
    return {
        rayFreq: 9.0 - spread * 6.0,       // wide spread = broad soft rays
        sway: 0.05 + speed * 0.22,
        defaultColor: '#ffe9b8',
    };
}

// ── Shimmer — rising light curtains + twinkling motes ───────────────────────────────────

export const SHIMMER_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform vec3 uColor;
uniform float uDriftDir;   // -1 = up (default), 1 = down
uniform float uDensity;    // particle density 0..1
uniform float uSpeed;
uniform float uSideMin;    // horizontal window (uv) the waves live in
uniform float uSideMax;
uniform float uWavesOn;    // 0 = particles only
${DITHER}
${NOISE}
void main() {
    vec2 frag = vec2(vUv.x, 1.0 - vUv.y);
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    float a = 0.0;
    // Light curtains: slow vertical waves warped by fbm, masked to the chosen side.
    if (uWavesOn > 0.5) {
        float sideMask = smoothstep(uSideMin - 0.12, uSideMin + 0.08, frag.x)
                       * smoothstep(uSideMax + 0.12, uSideMax - 0.08, frag.x);
        vec2 wp = vec2(frag.x * aspect * 2.2, frag.y * 1.1 + uDriftDir * uTime * uSpeed * 0.4);
        float w1 = fbm(wp + vec2(0.0, uTime * uSpeed * 0.13));
        float w2 = fbm(wp * 1.9 + vec2(7.7, uTime * uSpeed * 0.21));
        float waves = pow(clamp(w1 * 0.7 + w2 * 0.5, 0.0, 1.0), 2.6);
        a += waves * sideMask * 0.5;
    }
    // Motes: three drifting cell layers of soft twinkling particles.
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float scale = 9.0 + fi * 7.0;
        vec2 p = vec2(frag.x * aspect, frag.y + uDriftDir * uTime * uSpeed * (0.05 + fi * 0.03)) * scale;
        p.x += sin(uTime * (0.3 + fi * 0.2) + fi * 5.0) * 0.35;
        vec2 id = floor(p);
        float h = vnHash(id + fi * 31.0);
        if (h > uDensity * 0.55) continue;
        vec2 f = fract(p);
        vec2 c = vec2(0.3 + h * 0.4, 0.3 + fract(h * 9.7) * 0.4);
        float d = distance(f, c);
        float tw = 0.5 + 0.5 * sin(uTime * (1.5 + h * 3.0) + h * 80.0);
        a += smoothstep(0.09, 0.01, d) * tw * (0.5 - fi * 0.12);
    }
    a *= uIntensity;
    float dith = (vnHash(vUv * uResolution) - 0.5) / 255.0;
    a = clamp(a + dith, 0.0, 0.9);
    gl_FragColor = vec4(uColor * a, a);
}
`;

export interface ShimmerConfig { sideMin: number; sideMax: number; driftDir: number; speed: number; density: number; wavesOn: number; defaultColor: string; }
/** PURE: shimmer params → shader knobs (side window, drift direction, waves on/off). */
export function shimmerConfig(
    side: 'left' | 'right' | 'full' = 'full',
    direction: 'up' | 'down' = 'up',
    particlesOnly = false,
    density = 0.5,
    speed = 0.5,
): ShimmerConfig {
    return {
        sideMin: side === 'right' ? 0.55 : 0.0,
        sideMax: side === 'left' ? 0.45 : 1.0,
        driftDir: direction === 'down' ? 1 : -1,
        speed: 0.4 + speed * 1.6,
        density: Math.max(0.05, density),
        wavesOn: particlesOnly ? 0 : 1,
        defaultColor: '#ffe9c9',
    };
}

// ── Fireworks — procedural bursts with gravity, trails, and twinkle ─────────────────────

export const FIREWORKS_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uRate;       // bursts per second (per slot)
uniform vec3 uTint;        // author colour; uTintOn 0 = per-burst hues
uniform float uTintOn;
${DITHER}
vec2 vnHash2(float n) {
    return fract(sin(vec2(n, n * 1.61)) * vec2(43758.5453, 22578.1459));
}
vec3 burstColor(float seed) {
    // Cheerful saturated hues via a cosine palette.
    return 0.55 + 0.45 * cos(6.2831 * (seed + vec3(0.0, 0.33, 0.67)));
}
void main() {
    vec2 frag = vec2(vUv.x, 1.0 - vUv.y);
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = vec2(frag.x * aspect, frag.y);
    vec3 acc = vec3(0.0);
    // Three staggered burst slots, each on its own clock.
    for (int b = 0; b < 3; b++) {
        float fb = float(b);
        float t = uTime * uRate + fb * 0.37;
        float cyc = floor(t);
        float tc = fract(t);                     // 0..1 through this burst's life
        float seed = cyc * 7.13 + fb * 131.7;
        vec2 center = vec2((0.15 + vnHash2(seed).x * 0.7) * aspect, 0.12 + vnHash2(seed).y * 0.38);
        vec3 col = uTintOn > 0.5 ? uTint : burstColor(vnHash2(seed + 3.0).x);
        // Expansion eases out; sparks droop under gravity as they age.
        float r = 0.28 * (1.0 - pow(1.0 - min(tc * 1.25, 1.0), 2.2));
        float fade = smoothstep(1.0, 0.35, tc);
        float grav = tc * tc * 0.14;
        for (int s = 0; s < 24; s++) {
            float fs = float(s);
            float ha = vnHash(vec2(seed, fs));
            float ang = (fs + ha * 0.9) * (6.2831 / 24.0);
            float rr = r * (0.75 + ha * 0.35);
            vec2 sp = center + vec2(cos(ang), sin(ang)) * rr + vec2(0.0, grav);
            float d = distance(p, sp);
            // Spark point + a short trail back along its path.
            float pt = exp(-d * d * 5200.0) * 1.1;
            vec2 tp = center + vec2(cos(ang), sin(ang)) * rr * 0.82 + vec2(0.0, grav * 0.8);
            float trail = exp(-distance(p, tp) * distance(p, tp) * 2600.0) * 0.35;
            float tw = 0.7 + 0.3 * sin(uTime * 24.0 + ha * 50.0);   // sparkle
            acc += col * (pt + trail) * fade * tw;
        }
        // Rocket streak rising before the burst (first 20% of the cycle shows the tail end).
        if (tc < 0.18) {
            float rise = tc / 0.18;
            vec2 rp = vec2(center.x, mix(1.05, center.y, rise));
            float d = distance(p, rp);
            acc += vec3(1.0, 0.9, 0.7) * exp(-d * d * 4200.0) * 0.8 * (1.0 - rise * 0.5);
        }
    }
    acc *= uIntensity;
    float dith = (vnHash(vUv * uResolution + uTime) - 0.5) / 255.0;
    acc = clamp(acc + dith, 0.0, 1.0);
    float a = clamp(max(acc.r, max(acc.g, acc.b)), 0.0, 1.0);
    gl_FragColor = vec4(acc * a, a);
}
`;

export interface FireworksConfig { rate: number; }
/** PURE: fireworks speed → burst rate (matches the Classic sim's launch cadence feel). */
export function fireworksConfig(speed = 0.5): FireworksConfig {
    return { rate: 0.25 + speed * 0.55 };
}

// ── Lightning — storm cycle with a real procedural bolt ─────────────────────────────────

export const LIGHTNING_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform vec3 uColor;
uniform float uCycle;      // seconds per strike cycle (Classic: 3..14)
${DITHER}
${NOISE}
void main() {
    vec2 frag = vec2(vUv.x, 1.0 - vUv.y);
    float t = uTime / uCycle;
    float cyc = floor(t);
    float tc = fract(t);
    float seed = vnHash(vec2(cyc, 7.0));
    // Flash envelope — the Classic double-flash timing (quick hit, dip, second hit),
    // plus the faint mid-cycle echo at ~55%.
    float f1 = smoothstep(0.0, 0.012, tc) * smoothstep(0.024, 0.012, tc);
    float f2 = smoothstep(0.024, 0.036, tc) * smoothstep(0.065, 0.040, tc) * 0.85;
    float f3 = smoothstep(0.54, 0.55, tc) * smoothstep(0.565, 0.555, tc) * 0.55;
    float flash = max(max(f1, f2), f3);
    // The bolt: a jagged noise-displaced path from the top, alive only during the strike.
    float boltLife = smoothstep(0.0, 0.004, tc) * smoothstep(0.05, 0.02, tc);
    float a = flash * 0.55;
    if (boltLife > 0.001) {
        float bx = 0.18 + seed * 0.64;                       // strike position per cycle
        float wob = (fbm(vec2(frag.y * 3.5 + cyc * 17.0, cyc * 3.1)) - 0.5) * 0.34
                  + (vnNoise(vec2(frag.y * 14.0, cyc * 9.0)) - 0.5) * 0.08;
        float path = bx + wob * (0.25 + frag.y);             // wanders more as it descends
        float d = abs(frag.x - path);
        float core = smoothstep(0.004, 0.0005, d) * 1.4;
        float glow = exp(-d * 26.0) * 0.5;
        // A fainter branch splitting off partway down.
        float branch = 0.0;
        if (frag.y > 0.25 + seed * 0.3) {
            float bpath = path + (frag.y - (0.25 + seed * 0.3)) * (seed > 0.5 ? 0.35 : -0.35);
            float bd = abs(frag.x - bpath);
            branch = (smoothstep(0.002, 0.0004, bd) * 0.8 + exp(-bd * 34.0) * 0.3)
                   * smoothstep(0.85, 0.4, frag.y);
        }
        float ground = smoothstep(1.0, 0.85, frag.y);        // bolt fades before the floor
        a += (core + glow + branch) * boltLife * ground;
    }
    a *= uIntensity;
    float dith = (vnHash(vUv * uResolution + uTime) - 0.5) / 255.0;
    a = clamp(a + dith, 0.0, 1.0);
    gl_FragColor = vec4(uColor * a, a);
}
`;

/** PURE: lightning speed → cycle seconds. EXACTLY the Classic keyframe formula. */
export function lightningCycleSeconds(speed = 0.5): number {
    return 14 - speed * 11;
}

// ── CRT scanlines — mask, aperture grille, rolling refresh bar, vignette, flicker ───────

export const CRT_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uSpacing;    // scanline period, CSS px
uniform float uRoll;       // rolling-bar cycle seconds
uniform float uDpr;
${DITHER}
void main() {
    vec2 frag = vec2(vUv.x, 1.0 - vUv.y) * uResolution;
    vec2 css = frag / uDpr;
    // Scanline mask — soft sine stripes at the authored spacing (Classic's hard 2px lines).
    float scan = 0.5 + 0.5 * cos(css.y * 6.2831 / max(uSpacing, 2.0));
    float dark = scan * scan * 0.5;
    // Aperture grille: faint RGB triads across x — the colour fringe of a real tube.
    float triad = mod(floor(css.x / max(uDpr, 1.0)), 3.0);
    vec3 grille = vec3(0.0);
    if (triad < 0.5) grille = vec3(0.05, 0.0, 0.0);
    else if (triad < 1.5) grille = vec3(0.0, 0.05, 0.0);
    else grille = vec3(0.0, 0.0, 0.05);
    // Rolling refresh bar: a soft bright band sweeping down.
    float rollY = fract(uTime / max(uRoll, 0.5));
    float bar = smoothstep(0.09, 0.0, abs(1.0 - vUv.y - rollY)) * 0.055;
    // Vignette + a whisper of mains flicker.
    vec2 v = vUv - 0.5;
    float vig = smoothstep(0.85, 0.25, length(v) * 1.35);
    float flick = 0.97 + 0.03 * sin(uTime * 11.0);
    float darkA = clamp((dark + (1.0 - vig) * 0.35) * uIntensity * flick, 0.0, 0.85);
    vec3 add = (grille + vec3(bar)) * uIntensity * flick;
    float dith = (vnHash(vUv * uResolution) - 0.5) / 255.0;
    darkA = clamp(darkA + dith, 0.0, 1.0);
    // Darkness (premultiplied black) with a small additive tint on top.
    vec3 col = add * (1.0 - darkA);
    float a = clamp(darkA + max(add.r, max(add.g, add.b)), 0.0, 1.0);
    gl_FragColor = vec4(col, a);
}
`;

export interface CrtConfig { spacing: number; roll: number; }
/** PURE: CRT params → shader knobs. lineSpacing maps to the Classic px range (gap 2..10px
 *  plus its 2px dark line); speed drives the rolling refresh bar (fast = quick sweep). */
export function crtConfig(lineSpacing = 0.5, speed = 0.5): CrtConfig {
    return {
        spacing: 2 + Math.round(lineSpacing * 8) + 2,
        roll: 9 - speed * 7.5,
    };
}
