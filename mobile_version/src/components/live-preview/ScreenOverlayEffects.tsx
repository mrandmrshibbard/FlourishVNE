import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clamp01,
  normalizeOverlayEffects,
  BUILTIN_OVERLAY_EFFECT_TYPES,
  type VNScreenOverlayEffect,
  type VNScreenOverlayEffectType,
  type VNEffectParams,
  type VNScreenLight,
} from '../../types';
import { pluginManager } from '../../features/plugins/PluginManagerService';
import type { CustomEffectDefinition } from '../../types/plugins';
import { isEnhanced, webglLikelyAvailable } from './fx/glFx';
import GlFxCanvas from './fx/GlFxCanvas';

export interface ScreenOverlayEffectsProps {
  effects?: VNScreenOverlayEffect[];
  width: number;
  height: number;
  className?: string;
}

function getEffect(
  effects: VNScreenOverlayEffect[],
  type: VNScreenOverlayEffectType
): VNScreenOverlayEffect | undefined {
  return effects.find((e) => e.type === type);
}

/** Read a numeric param with a default (all params are 0..1). */
function ep(params: VNEffectParams | undefined, key: keyof VNEffectParams, fallback = 0.5): number {
  if (!params) return fallback;
  const v = params[key];
  if (typeof v !== 'number') return fallback;
  return clamp01(v);
}

// Parse hex color to RGB
function parseColor(hex: string | undefined, defaultColor: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  if (!hex) return defaultColor;
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return defaultColor;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

// Perlin-like noise for organic movement
function createNoise() {
  const permutation = Array.from({ length: 256 }, () => Math.floor(Math.random() * 256));
  const p = [...permutation, ...permutation];
  
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  const grad = (hash: number, x: number) => (hash & 1 ? x : -x);
  
  return (x: number): number => {
    const X = Math.floor(x) & 255;
    x -= Math.floor(x);
    const u = fade(x);
    return lerp(grad(p[X], x), grad(p[X + 1], x - 1), u);
  };
}

/**
 * Renders one plugin-registered custom effect through its per-frame `render` callback — the
 * visual pipeline for `api.registerEffect(...)`. Isolated: render errors are caught (and stop the
 * loop), the canvas is cleared each frame, and the rAF loop stops on unmount / intensity 0.
 */
const PluginEffectCanvas: React.FC<{
  def: CustomEffectDefinition;
  effect: VNScreenOverlayEffect;
  width: number;
  height: number;
}> = ({ def, effect, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intensity = clamp01(effect.intensity ?? 0);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !def.render || intensity <= 0 || width <= 0 || height <= 0) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const start = performance.now();
    let raf = 0;
    let stopped = false;
    const loop = () => {
      if (stopped) return;
      ctx.clearRect(0, 0, width, height);
      try {
        def.render!(ctx, { width, height, intensity, color: effect.color, params: effect.params, timeMs: performance.now() - start });
      } catch (e) {
        console.error(`[Plugin effect "${def.type}"] render error (stopping):`, e);
        stopped = true;
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [def, intensity, width, height, effect.color, effect.params]);
  if (intensity <= 0) return null;
  return <canvas ref={canvasRef} className="vnfx-canvas" aria-hidden />;
};

/**
 * Shared drifting-cloud simulation used by the fog / haze / smoke overlay effects. Renders N soft
 * radial-gradient blobs that drift + gently swirl, wrapping at the edges. Each effect passes its own
 * config (blob count/size, drift, opacity, vertical bias) so they read distinctly: fog = thick low
 * horizontal banks, haze = a faint slow veil, smoke = darker rising wisps. Returns a cancel fn.
 */
function runCloudSim(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  o: {
    intensity: number;
    color: { r: number; g: number; b: number };
    blobCount: number;
    sizeMin: number;
    sizeMax: number;
    vx: number;
    vy: number;
    vRand: number;
    baseOpacity: number;
    swirl: number;
    speedMul: number;
  }
): () => void {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const count = Math.max(4, Math.floor(o.blobCount * (0.5 + o.intensity)));
  const blobs = Array.from({ length: count }).map(() => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: o.sizeMin + Math.random() * (o.sizeMax - o.sizeMin),
    vx: (o.vx + (Math.random() * 2 - 1) * o.vRand) * o.speedMul,
    vy: (o.vy + (Math.random() * 2 - 1) * o.vRand * 0.6) * o.speedMul,
    phase: Math.random() * Math.PI * 2,
    phaseSpeed: 0.15 + Math.random() * 0.35,
    op: o.baseOpacity * (0.55 + Math.random() * 0.45),
  }));

  let raf = 0;
  let last = performance.now();
  const draw = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, w, h);
    for (const b of blobs) {
      b.phase += dt * b.phaseSpeed;
      b.x += (b.vx + Math.sin(b.phase) * o.swirl) * dt;
      b.y += (b.vy + Math.cos(b.phase * 0.7) * o.swirl * 0.5) * dt;
      if (b.x - b.r > w) b.x = -b.r;
      if (b.x + b.r < 0) b.x = w + b.r;
      if (b.y - b.r > h) b.y = -b.r;
      if (b.y + b.r < 0) b.y = h + b.r;
      const a = b.op * o.intensity;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, `rgba(${o.color.r}, ${o.color.g}, ${o.color.b}, ${a})`);
      g.addColorStop(0.6, `rgba(${o.color.r}, ${o.color.g}, ${o.color.b}, ${a * 0.5})`);
      g.addColorStop(1, `rgba(${o.color.r}, ${o.color.g}, ${o.color.b}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(raf);
}

/**
 * Fireworks simulation (canvas). Rockets rise from the bottom and explode into a fading, gravity-
 * pulled spray of glowing particles (additive blend). Used by BOTH the one-shot Fireworks command
 * (continuous:false, maxBursts, onIdle to self-clear, onExplode to sync a boom SFX) and the
 * continuous 'fireworks' overlay effect (continuous:true). Returns a cancel fn.
 */
export function runFireworksSim(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  o: {
    colors: string[];
    intensity: number;
    speedMul?: number;
    continuous: boolean;
    maxBursts?: number;
    heightFrac?: number; // 0 = bursts low, 1 = near the top (default 0.7)
    onExplode?: () => void;
    onIdle?: () => void;
  }
): () => void {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const palette = (o.colors && o.colors.length ? o.colors : ['#ff3b3b', '#ffd23b', '#3bff6b', '#3b9bff', '#ff7bef', '#ffffff'])
    .map(c => parseColor(c, { r: 255, g: 255, b: 255 }));
  const pick = () => palette[Math.floor(Math.random() * palette.length)];
  const intensity = clamp01(o.intensity ?? 1);
  const speedMul = o.speedMul ?? 1;
  const maxBursts = o.maxBursts ?? 3;

  type Rocket = { x: number; y: number; vy: number; targetY: number; color: { r: number; g: number; b: number } };
  type Part = { x: number; y: number; vx: number; vy: number; life: number; decay: number; size: number; color: { r: number; g: number; b: number } };
  let rockets: Rocket[] = [];
  let parts: Part[] = [];
  let launched = 0;
  let acc = 0;
  let nextLaunch = 0;
  const launchGap = () => ((o.continuous ? 520 : 300) + Math.random() * 260) / speedMul;

  const hf = clamp01(o.heightFrac ?? 0.7);
  const launch = () => {
    const tx = w * (0.12 + Math.random() * 0.76);
    // hf 0 → bursts near the bottom (~0.85h); hf 1 → near the top (~0.13h).
    const ty = Math.max(h * 0.06, h * (0.85 - hf * 0.72) + (Math.random() - 0.5) * h * 0.1);
    // Give higher targets more upward speed so the rocket actually reaches them before its apex.
    const vy = -(h * (0.7 + hf * 0.5 + Math.random() * 0.15));
    rockets.push({ x: tx, y: h + 4, vy, targetY: ty, color: pick() });
    launched++;
  };
  const explode = (x: number, y: number, color: { r: number; g: number; b: number }) => {
    const n = 46 + Math.floor(Math.random() * 42);
    const base = Math.min(w, h);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.18 + Math.random() * 0.55) * base;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: 0.45 + Math.random() * 0.55, size: 1.2 + Math.random() * 1.8, color });
    }
    o.onExplode?.();
  };

  let raf = 0;
  let stopped = false;
  let idleCalled = false;
  let last = performance.now();
  const draw = (now: number) => {
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt * 1000;
    if (acc >= nextLaunch && (o.continuous || launched < maxBursts)) {
      launch();
      nextLaunch = acc + launchGap();
    }
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    // Rockets
    rockets = rockets.filter(r => {
      r.vy += h * 0.45 * dt; // gravity decelerates the climb
      r.y += r.vy * dt;
      ctx.fillStyle = `rgba(${r.color.r}, ${r.color.g}, ${r.color.b}, ${0.85 * intensity})`;
      ctx.fillRect(r.x - 1, r.y, 2, 7);
      if (r.y <= r.targetY || r.vy >= 0) { explode(r.x, r.y, r.color); return false; }
      return true;
    });
    // Particles
    parts = parts.filter(p => {
      p.vy += h * 0.32 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) return false;
      const a = clamp01(p.life) * intensity;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.2);
      g.addColorStop(0, `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${a})`);
      g.addColorStop(1, `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });
    ctx.globalCompositeOperation = 'source-over';
    if (!o.continuous && launched >= maxBursts && rockets.length === 0 && parts.length === 0) {
      if (!idleCalled) { idleCalled = true; o.onIdle?.(); }
      return; // one-shot volley finished
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}

// --- Dead-pixel tile for the character glitch ---
// A small SVG of THRESHOLDED noise: most of the tile is transparent, a scattering of hard opaque
// cells survive — dead pixels. Discrete alpha steps (no anti-aliasing) + `image-rendering: pixelated`
// at render time keep them square and crunchy. Deterministic per (colour, seed): the same character
// shows the same constellation every frame, which reads as "stuck pixels", not TV static.
export const deadPixelTile = (color: string, seed: number): string => {
    const hex = color.replace('#', '');
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex.padEnd(6, '0');
    const r = (parseInt(full.slice(0, 2), 16) / 255).toFixed(3);
    const g = (parseInt(full.slice(2, 4), 16) / 255).toFixed(3);
    const b = (parseInt(full.slice(4, 6), 16) / 255).toFixed(3);
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">` +
        `<filter id="d" x="0" y="0" width="100%" height="100%">` +
        // Low frequency, so the surviving pixels CLUSTER instead of scattering evenly.
        `<feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="1" seed="${seed}"/>` +
        // Keep only the brightest ~1/8 of the noise, as hard-edged alpha.
        `<feComponentTransfer><feFuncA type="discrete" tableValues="0 0 0 0 0 0 0 1"/></feComponentTransfer>` +
        // Paint every surviving pixel in the glitch colour.
        `<feColorMatrix type="matrix" values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 1 0"/>` +
        `</filter><rect width="64" height="64" filter="url(#d)"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

const hexToRgbStr = (hex: string): string => {
  const m = (hex || '').match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return '255, 255, 255';
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
};

/** Renders placed twinkling lights (candle flicker / star sparkle / christmas bulb blink styles).
 *  Moved here from LivePreview so BOTH the PlaceLights command and the screen-attached 'lights'
 *  effect share one renderer (LivePreview imports it back). The vnfx-candle/star/bulb keyframes
 *  live in LivePreview's inline style block, which is always present at runtime. */
export const LightsLayer: React.FC<{ lights: VNScreenLight[]; stageW: number; stageH: number }> = ({ lights, stageW, stageH }) => {
    const base = Math.min(stageW || 800, stageH || 600);
    return <>{lights.map((l, i) => {
        const sizePx = Math.max(6, base * 0.05 * (l.size ?? 1));
        const bright = Math.max(0, Math.min(1, l.brightness ?? 1));
        const spd = l.twinkleSpeed && l.twinkleSpeed > 0 ? l.twinkleSpeed : 1;
        // Every light is a pure point of light: a tight bright center that drops off through one
        // continuous radial gradient to FULLY transparent at the edge — no boxShadow (its spread
        // left a visible halo ring/boundary) and a box large enough to hold the whole soft glow.
        let background = '';
        let animation: string | undefined;
        let delay = `${(i % 7) * 0.13}s`;
        const wPx = sizePx * 1.8;
        const hPx = sizePx * 1.8;
        if (l.type === 'candle') {
            background = `radial-gradient(circle at 50% 45%, rgba(255,250,220,${0.97 * bright}) 0%, rgba(255,185,75,${0.8 * bright}) 9%, rgba(255,135,45,${0.4 * bright}) 24%, rgba(255,105,25,${0.14 * bright}) 46%, rgba(255,95,15,${0.04 * bright}) 70%, rgba(255,95,15,0) 100%)`;
            animation = `vnfx-candle ${(1.1 / spd).toFixed(2)}s ease-in-out infinite`;
        } else if (l.type === 'star') {
            const rgb = hexToRgbStr(l.color || '#ffffff');
            background = `radial-gradient(circle, rgba(255,255,255,${0.98 * bright}) 0%, rgba(${rgb},${0.85 * bright}) 8%, rgba(${rgb},${0.4 * bright}) 22%, rgba(${rgb},${0.14 * bright}) 44%, rgba(${rgb},${0.04 * bright}) 68%, rgba(${rgb},0) 100%)`;
            animation = `vnfx-star ${(2.2 / spd).toFixed(2)}s ease-in-out infinite`;
        } else {
            const rgb = hexToRgbStr(l.color || '#ff3b3b');
            background = `radial-gradient(circle, rgba(255,255,255,${0.98 * bright}) 0%, rgba(${rgb},${0.95 * bright}) 5%, rgba(${rgb},${0.5 * bright}) 13%, rgba(${rgb},${0.26 * bright}) 26%, rgba(${rgb},${0.1 * bright}) 44%, rgba(${rgb},${0.03 * bright}) 66%, rgba(${rgb},0) 100%)`;
            const tw = l.twinkle ?? 'fade';
            if (tw === 'fade') animation = `vnfx-bulb-fade ${(1.6 / spd).toFixed(2)}s ease-in-out infinite`;
            else if (tw === 'blink') animation = `vnfx-bulb-blink ${(1.0 / spd).toFixed(2)}s steps(1, end) infinite`;
            else if (tw === 'chase') { animation = `vnfx-bulb-fade ${(1.6 / spd).toFixed(2)}s ease-in-out infinite`; delay = `${(i % 5) * (0.32 / spd)}s`; }
            // 'steady' → no animation
        }
        return <div key={l.id} data-vnlight={l.type} className="absolute pointer-events-none" style={{
            left: `${l.x}%`, top: `${l.y}%`, width: wPx, height: hPx,
            transform: 'translate(-50%, -50%)', borderRadius: '50%', background,
            animation, animationDelay: animation ? delay : undefined,
            mixBlendMode: 'screen',
        }} />;
    })}</>;
};

/** Mouse-following darkness with a clear circle at the cursor — the screen-attached version of the
 *  scene Flashlight. Intensity = darkness; params.radius sizes the lit circle, params.softness
 *  feathers its edge. Listens on window (the overlay itself is pointer-events: none). */
/** Enhanced (WebGL) variant of the screen-attached flashlight: same params, shader-drawn
 *  darkness + dithered hole + warm rim; mouse rides a ref (no repaints). Only mounted when
 *  the module probe says WebGL exists, so no fallback children are needed here. */
const EnhancedFlashlightOverlay: React.FC<{ effect: VNScreenOverlayEffect; width: number; height: number; onFallback?: () => void }> = ({ effect, width, height, onFallback }) => {
    const mouseRef = useRef<{ x: number; y: number } | null>(null);
    const hostRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const rect = hostRef.current?.getBoundingClientRect();
            if (!rect) return;
            mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };
        window.addEventListener('pointermove', onMove);
        return () => window.removeEventListener('pointermove', onMove);
    }, []);
    const darkness = clamp01(effect.intensity ?? 0);
    if (darkness <= 0) return null;
    // Classic radius semantics: lit radius = minDim*(0.12 + radius01*0.38) → express as the
    // scene-flashlight percent so flashlightToUniforms reproduces it.
    const radius01 = ep(effect.params, 'radius');
    const radiusPct = (0.12 + radius01 * 0.38) * 100;
    const softness = ep(effect.params, 'softness');
    return (
        <div ref={hostRef} className="absolute inset-0">
            <GlFxCanvas
                kind="flashlight"
                onFallback={onFallback}
                width={width}
                height={height}
                getParams={() => {
                    const m = mouseRef.current || { x: width / 2, y: height / 2 };
                    return {
                        kind: 'flashlight', stageW: width, stageH: height,
                        mouseX: m.x, mouseY: m.y,
                        radius: radiusPct, softness, darkness,
                        on: true, color: effect.color || '#000000',
                    };
                }}
            />
        </div>
    );
};

const FlashlightOverlay: React.FC<{ effect: VNScreenOverlayEffect; minDim: number }> = ({ effect, minDim }) => {
    const ref = useRef<HTMLDivElement | null>(null);
    const darkness = clamp01(effect.intensity ?? 0);
    const radius01 = ep(effect.params, 'radius');
    const softness = ep(effect.params, 'softness');
    const { r, g, b } = parseColor(effect.color, { r: 0, g: 0, b: 0 });
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const paint = (mx: number, my: number) => {
            const radiusPx = Math.max(20, minDim * (0.12 + radius01 * 0.38));
            const inner = Math.round(Math.max(0, Math.min(1, 1 - softness)) * 100);
            el.style.background = `radial-gradient(circle ${radiusPx}px at ${mx}px ${my}px, transparent 0%, transparent ${inner}%, rgba(${r},${g},${b},${darkness}) 100%)`;
        };
        // Until the pointer moves, light the middle of the screen.
        const rect0 = el.getBoundingClientRect();
        paint(rect0.width / 2, rect0.height / 2);
        const onMove = (e: PointerEvent) => {
            const rect = el.getBoundingClientRect();
            paint(e.clientX - rect.left, e.clientY - rect.top);
        };
        window.addEventListener('pointermove', onMove);
        return () => window.removeEventListener('pointermove', onMove);
    }, [darkness, radius01, softness, r, g, b, minDim]);
    if (darkness <= 0) return null;
    return <div ref={ref} className="absolute inset-0" />;
};

export const ScreenOverlayEffects: React.FC<ScreenOverlayEffectsProps> = ({
  effects,
  width,
  height,
  className,
}) => {
  const normalized = useMemo(() => normalizeOverlayEffects(effects), [effects]);

  // Defensive: avoid massive canvas allocations
  const safeWidth = Math.max(0, Math.min(width, 4096));
  const safeHeight = Math.max(0, Math.min(height, 4096));

  const scanlines = getEffect(normalized, 'crtScanlines');
  const chroma = getEffect(normalized, 'chromaticGlitch');
  const glitch = getEffect(normalized, 'glitch');
  const sunbeams = getEffect(normalized, 'sunbeams');
  const shimmer = getEffect(normalized, 'shimmer');
  const rain = getEffect(normalized, 'rain');
  const snowAsh = getEffect(normalized, 'snowAsh');
  const fog = getEffect(normalized, 'fog');
  const haze = getEffect(normalized, 'haze');
  const smoke = getEffect(normalized, 'smoke');
  const fireworks = getEffect(normalized, 'fireworks');
  const lightning = getEffect(normalized, 'lightning');
  const flashlight = getEffect(normalized, 'flashlight');
  const spotlight = getEffect(normalized, 'spotlight');
  const lightsFx = getEffect(normalized, 'lights');

  // Plugin-registered custom effects: any active effect whose type isn't a built-in and whose
  // plugin provides a `render` callback. These render through PluginEffectCanvas.
  const pluginEffects = useMemo(() => {
    const builtins = new Set<string>(BUILTIN_OVERLAY_EFFECT_TYPES);
    return normalized
      .filter((e) => !builtins.has(e.type) && clamp01(e.intensity) > 0)
      .map((e) => ({ effect: e, def: pluginManager.getEffect(e.type) }))
      .filter((x): x is { effect: VNScreenOverlayEffect; def: CustomEffectDefinition } =>
        !!x.def && typeof x.def.render === 'function');
  }, [normalized]);

  const rainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const snowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sunbeamsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const shimmerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hazeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const smokeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fireworksCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const minDim = Math.min(safeWidth, safeHeight);

  /* Bumped whenever an Enhanced effect gives up on WebGL. Every classic simulation below lists
   * it as a dependency, so the sims re-attach to the canvases that GlFxCanvas has just revealed
   * as its fallback children. Without this the sims — which attach in effects keyed on their own
   * params — would never run for a LATE failover, which is why the enhanced branches used to be
   * gated on a mount-time probe alone (and rendered nothing at all when that probe was wrong). */
  const [fxGeneration, setFxGeneration] = useState(0);

  /* Gate-level failover. `glDead` records which effect kinds have given up on WebGL this mount,
   * so `useGl(...)` flips that effect back to its Classic branch — which is how the effects whose
   * Classic markup can't be nested inside GlFxCanvas (scanlines, beams, lightning, flashlight)
   * still get a fallback. Nesting + gating are belt-and-braces: nesting covers the frame before
   * the parent re-renders, the gate covers everything after. */
  const [glDead, setGlDead] = useState<Record<string, boolean>>({});
  const markGlDead = useCallback((key: string) => {
    setGlDead(m => (m[key] ? m : { ...m, [key]: true }));
    setFxGeneration(n => n + 1);
  }, []);
  const useGl = (key: string, style?: string) => isEnhanced(style) && webglLikelyAvailable() && !glDead[key];

  // Fog — thick, low, slow horizontal banks (light grey).
  useEffect(() => {
    const intensity = clamp01(fog?.intensity ?? 0);
    const c = fogCanvasRef.current;
    if (!c || intensity <= 0 || safeWidth <= 0 || safeHeight <= 0) return;
    const color = parseColor(fog?.color, { r: 205, g: 210, b: 216 });
    const speed = 0.3 + ep(fog?.params, 'speed') * 1.4;
    // Density scales the blob count around today's default (unset = 0.5 = ×1.0, byte-identical).
    const densityFog = 0.5 + ep(fog?.params, 'particleDensity');
    return runCloudSim(c, safeWidth, safeHeight, {
      intensity, color, blobCount: Math.round(16 * densityFog), sizeMin: minDim * 0.28, sizeMax: minDim * 0.55,
      vx: 16, vy: 0, vRand: 10, baseOpacity: 0.5, swirl: 6, speedMul: speed,
    });
  }, [fog?.intensity, fog?.color, fog?.params?.speed, fog?.params?.particleDensity, safeWidth, safeHeight, minDim, fxGeneration]);

  // Haze — a faint, slow, near-uniform veil (warm/neutral tint).
  useEffect(() => {
    const intensity = clamp01(haze?.intensity ?? 0);
    const c = hazeCanvasRef.current;
    if (!c || intensity <= 0 || safeWidth <= 0 || safeHeight <= 0) return;
    const color = parseColor(haze?.color, { r: 225, g: 222, b: 210 });
    const speed = 0.3 + ep(haze?.params, 'speed') * 1.4;
    // Density scales the blob count around today's default (unset = 0.5 = ×1.0, byte-identical).
    const densityHaze = 0.5 + ep(haze?.params, 'particleDensity');
    return runCloudSim(c, safeWidth, safeHeight, {
      intensity, color, blobCount: Math.round(10 * densityHaze), sizeMin: minDim * 0.45, sizeMax: minDim * 0.8,
      vx: 7, vy: 0, vRand: 4, baseOpacity: 0.22, swirl: 3, speedMul: speed,
    });
  }, [haze?.intensity, haze?.color, haze?.params?.speed, haze?.params?.particleDensity, safeWidth, safeHeight, minDim, fxGeneration]);

  // Smoke — darker, rising, swirling wisps.
  useEffect(() => {
    const intensity = clamp01(smoke?.intensity ?? 0);
    const c = smokeCanvasRef.current;
    if (!c || intensity <= 0 || safeWidth <= 0 || safeHeight <= 0) return;
    const color = parseColor(smoke?.color, { r: 70, g: 72, b: 76 });
    const speed = 0.3 + ep(smoke?.params, 'speed') * 1.4;
    // Density scales the blob count around today's default (unset = 0.5 = ×1.0, byte-identical).
    const densitySmoke = 0.5 + ep(smoke?.params, 'particleDensity');
    return runCloudSim(c, safeWidth, safeHeight, {
      intensity, color, blobCount: Math.round(14 * densitySmoke), sizeMin: minDim * 0.18, sizeMax: minDim * 0.42,
      vx: 6, vy: -26, vRand: 14, baseOpacity: 0.42, swirl: 16, speedMul: speed,
    });
  }, [smoke?.intensity, smoke?.color, smoke?.params?.speed, smoke?.params?.particleDensity, safeWidth, safeHeight, minDim, fxGeneration]);

  // Rain effect
  useEffect(() => {
    const intensity = clamp01(rain?.intensity ?? 0);
    const canvas = rainCanvasRef.current;
    if (!canvas || intensity <= 0 || safeWidth <= 0 || safeHeight <= 0) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(safeWidth * dpr);
    canvas.height = Math.floor(safeHeight * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Parse custom color or use blue-ish default
    const baseColor = parseColor(rain?.color, { r: 180, g: 210, b: 255 });

    const p = rain?.params;
    const windMul = 0.2 + ep(p, 'windStrength') * 1.8;   // 0.2..2.0×
    const lenMul = 0.4 + ep(p, 'dropLength') * 1.2;       // 0.4..1.6×
    const speedMul = 0.3 + ep(p, 'speed') * 1.4;          // 0.3..1.7×

    const dropCount = Math.floor(100 + intensity * 600);
    const drops = Array.from({ length: dropCount }).map(() => ({
      x: Math.random() * safeWidth,
      y: Math.random() * safeHeight,
      len: (12 + Math.random() * 22) * lenMul,
      speed: (600 + Math.random() * 1000) * speedMul,
      thickness: 1 + Math.random() * 1.8,
      wind: (-80 + Math.random() * 160) * windMul,
      splashTime: 0,
      splashX: 0,
      splashY: 0,
    }));

    let raf = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      ctx.clearRect(0, 0, safeWidth, safeHeight);
      ctx.lineCap = 'round';

      // Draw rain streaks
      for (const d of drops) {
        d.x += d.wind * dt;
        d.y += d.speed * dt;

        // Create splash when hitting bottom
        if (d.y - d.len > safeHeight) {
          d.splashTime = 0.15;
          d.splashX = d.x;
          d.splashY = safeHeight - 5;
          d.y = -Math.random() * safeHeight * 0.3;
          d.x = Math.random() * safeWidth;
        }
        if (d.x < -50) d.x = safeWidth + 50;
        if (d.x > safeWidth + 50) d.x = -50;

        // Draw streak
        const alpha = 0.1 + intensity * 0.25;
        ctx.strokeStyle = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${alpha})`;
        ctx.lineWidth = d.thickness;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.wind * 0.025, d.y + d.len);
        ctx.stroke();

        // Draw splash
        if (d.splashTime > 0) {
          d.splashTime -= dt;
          const splashProgress = 1 - d.splashTime / 0.15;
          const splashAlpha = (1 - splashProgress) * alpha * 0.8;
          const splashSize = 3 + splashProgress * 8;
          
          ctx.fillStyle = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${splashAlpha})`;
          ctx.beginPath();
          ctx.arc(d.splashX - splashSize, d.splashY, 1.5, 0, Math.PI * 2);
          ctx.arc(d.splashX + splashSize, d.splashY, 1.5, 0, Math.PI * 2);
          ctx.arc(d.splashX, d.splashY - splashSize * 0.5, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [rain?.intensity, rain?.color, rain?.params?.windStrength, rain?.params?.dropLength, rain?.params?.speed, safeWidth, safeHeight, fxGeneration]);

  // Snow/Ash effect
  useEffect(() => {
    const intensity = clamp01(snowAsh?.intensity ?? 0);
    const canvas = snowCanvasRef.current;
    if (!canvas || intensity <= 0 || safeWidth <= 0 || safeHeight <= 0) return;

    const variant = snowAsh?.variant ?? 'snow';
    
    // Parse custom color or use defaults
    const defaultSnowColor = { r: 255, g: 255, b: 255 };
    const defaultAshColor = { r: 120, g: 115, b: 110 };
    const baseColor = parseColor(snowAsh?.color, variant === 'snow' ? defaultSnowColor : defaultAshColor);

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(safeWidth * dpr);
    canvas.height = Math.floor(safeHeight * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sp = snowAsh?.params;
    const sizeMul = 0.4 + ep(sp, 'particleSize') * 1.2;     // 0.4..1.6×
    const sWindMul = 0.2 + ep(sp, 'windStrength') * 1.8;    // 0.2..2.0×
    const sSpeedMul = 0.3 + ep(sp, 'speed') * 1.4;          // 0.3..1.7×

    const count = Math.floor(80 + intensity * 420);
    const particles = Array.from({ length: count }).map(() => ({
      x: Math.random() * safeWidth,
      y: Math.random() * safeHeight,
      r: (variant === 'snow' ? 1.2 + Math.random() * 2.8 : 0.8 + Math.random() * 1.8) * sizeMul,
      vx: ((variant === 'snow' ? -25 : -40) + Math.random() * 80) * sWindMul,
      vy: ((variant === 'snow' ? 25 : 55) + Math.random() * (variant === 'snow' ? 70 : 130)) * sSpeedMul,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 1.5 + Math.random() * 2.5,
      wobbleAmp: (variant === 'snow' ? 15 + Math.random() * 20 : 8 + Math.random() * 12) * sWindMul,
      rotPhase: Math.random() * Math.PI * 2,
      opacity: 0.4 + Math.random() * 0.6,
    }));

    let raf = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      ctx.clearRect(0, 0, safeWidth, safeHeight);

      for (const p of particles) {
        p.wobblePhase += dt * p.wobbleSpeed;
        p.rotPhase += dt * 1.2;
        const wobbleX = Math.sin(p.wobblePhase) * p.wobbleAmp;

        p.x += (p.vx + wobbleX) * dt;
        p.y += p.vy * dt;

        if (p.y - p.r > safeHeight) {
          p.y = -Math.random() * safeHeight * 0.25;
          p.x = Math.random() * safeWidth;
        }
        if (p.x < -50) p.x = safeWidth + 50;
        if (p.x > safeWidth + 50) p.x = -50;

        const alpha = p.opacity * intensity * (variant === 'snow' ? 0.85 : 0.6);
        
        if (variant === 'snow') {
          // Draw snowflake with slight glow
          const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 1.5);
          gradient.addColorStop(0, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${alpha})`);
          gradient.addColorStop(0.5, `rgba(${Math.floor(baseColor.r * 0.86)}, ${Math.floor(baseColor.g * 0.92)}, ${baseColor.b}, ${alpha * 0.7})`);
          gradient.addColorStop(1, `rgba(${Math.floor(baseColor.r * 0.78)}, ${Math.floor(baseColor.g * 0.86)}, ${baseColor.b}, 0)`);
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 1.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Ash - irregular shapes
          ctx.fillStyle = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${alpha})`;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotPhase);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [snowAsh?.intensity, snowAsh?.variant, snowAsh?.color, snowAsh?.params?.particleSize, snowAsh?.params?.windStrength, snowAsh?.params?.speed, safeWidth, safeHeight, fxGeneration]);

  // Dynamic Sunbeams - soft undulating blanket of light
  useEffect(() => {
    const intensity = clamp01(sunbeams?.intensity ?? 0);
    const canvas = sunbeamsCanvasRef.current;
    if (!canvas || intensity <= 0 || safeWidth <= 0 || safeHeight <= 0) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(safeWidth * dpr);
    canvas.height = Math.floor(safeHeight * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Parse custom color or use warm golden default
    const baseColor = parseColor(sunbeams?.color, { r: 255, g: 220, b: 140 });

    const sbp = sunbeams?.params;
    const sbSpeedMul = 0.3 + ep(sbp, 'speed') * 1.4;        // 0.3..1.7×
    const sbSpreadMul = 0.4 + ep(sbp, 'spread') * 1.2;      // 0.4..1.6×

    // Create multiple noise functions for complex organic movement
    const noises = Array.from({ length: 4 }, () => createNoise());
    
    let raf = 0;
    let time = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt * sbSpeedMul;

      ctx.clearRect(0, 0, safeWidth, safeHeight);
      
      // Light source position
      const centerX = safeWidth * 0.3;
      const centerY = -safeHeight * 0.1;
      
      // Use lighter blend for natural light accumulation
      ctx.globalCompositeOperation = 'lighter';

      // Create soft base radial glow first
      const baseGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, safeWidth * 1.2);
      baseGlow.addColorStop(0, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${intensity * 0.25})`);
      baseGlow.addColorStop(0.2, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${intensity * 0.15})`);
      baseGlow.addColorStop(0.5, `rgba(${baseColor.r}, ${Math.floor(baseColor.g * 0.9)}, ${Math.floor(baseColor.b * 0.8)}, ${intensity * 0.06})`);
      baseGlow.addColorStop(1, `rgba(${baseColor.r}, ${Math.floor(baseColor.g * 0.8)}, ${Math.floor(baseColor.b * 0.6)}, 0)`);
      ctx.fillStyle = baseGlow;
      ctx.fillRect(0, 0, safeWidth, safeHeight);

      // Draw multiple soft, overlapping light waves that create undulating effect
      const waveCount = 6;
      for (let w = 0; w < waveCount; w++) {
        const wavePhase = (w / waveCount) * Math.PI * 2;
        
        // Each wave has its own noise-driven animation
        const n1 = noises[0](time * 0.08 + w * 10) * 0.5 + 0.5;
        const n2 = noises[1](time * 0.12 + w * 7) * 0.5 + 0.5;
        const n3 = noises[2](time * 0.06 + w * 13) * 0.5 + 0.5;
        
        // Wave parameters that shift smoothly over time
        const waveAngle = wavePhase + Math.sin(time * 0.1 + w) * 0.3 + n1 * 0.4;
        const waveWidth = (0.8 + n2 * 0.6) * sbSpreadMul; // Spread-adjusted wave width
        const waveBrightness = (0.3 + n3 * 0.4) * intensity * 0.15;
        
        // Create a very soft angular gradient
        const maxRadius = Math.max(safeWidth, safeHeight) * 2;
        
        // Draw multiple overlapping arcs for extra softness
        for (let sub = 0; sub < 3; sub++) {
          const subOffset = (sub - 1) * 0.15;
          const subAngle = waveAngle + subOffset;
          const subBrightness = waveBrightness * (1 - Math.abs(sub - 1) * 0.3);
          
          const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius);
          gradient.addColorStop(0, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${subBrightness * 0.6})`);
          gradient.addColorStop(0.1, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${subBrightness * 0.4})`);
          gradient.addColorStop(0.3, `rgba(${baseColor.r}, ${Math.floor(baseColor.g * 0.95)}, ${Math.floor(baseColor.b * 0.85)}, ${subBrightness * 0.2})`);
          gradient.addColorStop(0.6, `rgba(${baseColor.r}, ${Math.floor(baseColor.g * 0.9)}, ${Math.floor(baseColor.b * 0.7)}, ${subBrightness * 0.05})`);
          gradient.addColorStop(1, `rgba(${baseColor.r}, ${Math.floor(baseColor.g * 0.85)}, ${Math.floor(baseColor.b * 0.6)}, 0)`);
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.arc(centerX, centerY, maxRadius, subAngle - waveWidth, subAngle + waveWidth);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Add animated brightness variation across the whole effect
      const pulseIntensity = 0.85 + Math.sin(time * 0.5) * 0.1 + noises[3](time * 0.15) * 0.05;
      
      // Final atmospheric haze layer
      const hazeGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, safeWidth);
      hazeGradient.addColorStop(0, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${intensity * pulseIntensity * 0.12})`);
      hazeGradient.addColorStop(0.4, `rgba(${baseColor.r}, ${Math.floor(baseColor.g * 0.95)}, ${Math.floor(baseColor.b * 0.9)}, ${intensity * pulseIntensity * 0.05})`);
      hazeGradient.addColorStop(1, `rgba(${baseColor.r}, ${Math.floor(baseColor.g * 0.9)}, ${Math.floor(baseColor.b * 0.8)}, 0)`);
      ctx.fillStyle = hazeGradient;
      ctx.fillRect(0, 0, safeWidth, safeHeight);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [sunbeams?.intensity, sunbeams?.color, sunbeams?.params?.speed, sunbeams?.params?.spread, safeWidth, safeHeight, fxGeneration]);

  // Dynamic Shimmer - organic light waves + floating particles
  useEffect(() => {
    const intensity = clamp01(shimmer?.intensity ?? 0);
    const canvas = shimmerCanvasRef.current;
    if (!canvas || intensity <= 0 || safeWidth <= 0 || safeHeight <= 0) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(safeWidth * dpr);
    canvas.height = Math.floor(safeHeight * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Parse custom color or use white default
    const baseColor = parseColor(shimmer?.color, { r: 255, g: 255, b: 255 });

    const shp = shimmer?.params;
    const shSpeedMul = 0.3 + ep(shp, 'speed') * 1.4;             // 0.3..1.7×
    const shDensityMul = 0.3 + ep(shp, 'particleDensity') * 1.4; // 0.3..1.7×
    const shimmerSide: string = (shp as any)?.shimmerSide || 'full';
    const shimmerDir: string = (shp as any)?.shimmerDirection || 'up';
    const particlesOnly: boolean = !!(shp as any)?.shimmerParticlesOnly;

    const noise = createNoise();

    // Compute horizontal bounds for waves based on shimmerSide
    let waveMinX = 0;
    let waveMaxX = safeWidth;
    if (shimmerSide === 'left') { waveMaxX = safeWidth * 0.45; }
    else if (shimmerSide === 'right') { waveMinX = safeWidth * 0.55; }
    const waveRegionW = waveMaxX - waveMinX;

    // Multiple shimmer waves with different properties
    const waves = particlesOnly ? [] : Array.from({ length: 5 }).map((_, i) => ({
      phase: Math.random() * Math.PI * 2,
      speed: (0.4 + Math.random() * 0.6) * shSpeedMul,
      amplitude: 0.15 + Math.random() * 0.2,
      frequency: 0.5 + Math.random() * 1.5,
      yOffset: (i / 5) * safeHeight,
      noiseOffset: Math.random() * 1000,
      width: waveRegionW * (0.3 + Math.random() * 0.4),
    }));

    // Floating light particles
    const pCount = Math.floor((20 + intensity * 30) * shDensityMul);
    const dirSign = shimmerDir === 'down' ? 1 : -1;
    const particles = Array.from({ length: pCount }).map(() => ({
      x: Math.random() * safeWidth,
      y: Math.random() * safeHeight,
      vx: (-15 + Math.random() * 30) * shSpeedMul,
      vy: (5 + Math.random() * 15) * shSpeedMul * dirSign,
      size: 2 + Math.random() * 6,
      brightness: 0.3 + Math.random() * 0.7,
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: 1 + Math.random() * 2,
    }));

    let raf = 0;
    let time = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;

      ctx.clearRect(0, 0, safeWidth, safeHeight);
      ctx.globalCompositeOperation = 'lighter';

      // Draw shimmer waves (unless particles-only mode)
      for (const wave of waves) {
        wave.phase += dt * wave.speed;
        
        const noiseVal = noise(time * 0.2 + wave.noiseOffset);
        const xCenter = waveMinX + waveRegionW * 0.5;
        const xOffset = xCenter + (Math.sin(wave.phase) + noiseVal * 0.5) * waveRegionW * wave.amplitude;
        const yPos = wave.yOffset + Math.sin(time * 0.3 + wave.noiseOffset) * 50;

        const gradient = ctx.createLinearGradient(
          xOffset - wave.width / 2, yPos,
          xOffset + wave.width / 2, yPos
        );
        gradient.addColorStop(0, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0)`);
        gradient.addColorStop(0.3, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${intensity * 0.08})`);
        gradient.addColorStop(0.5, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${intensity * 0.15})`);
        gradient.addColorStop(0.7, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${intensity * 0.08})`);
        gradient.addColorStop(1, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.fillRect(xOffset - wave.width / 2, 0, wave.width, safeHeight);
      }

      // Draw floating light particles
      for (const p of particles) {
        p.pulsePhase += dt * p.pulseSpeed;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Wrap around
        if (p.x < -20) p.x = safeWidth + 20;
        if (p.x > safeWidth + 20) p.x = -20;
        if (p.y < -20) p.y = safeHeight + 20;
        if (p.y > safeHeight + 20) p.y = -20;

        const pulse = 0.5 + Math.sin(p.pulsePhase) * 0.5;
        const alpha = p.brightness * pulse * intensity * 0.4;

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
        gradient.addColorStop(0, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${alpha})`);
        gradient.addColorStop(0.4, `rgba(${Math.floor(baseColor.r * 0.9)}, ${Math.floor(baseColor.g * 0.95)}, ${baseColor.b}, ${alpha * 0.6})`);
        gradient.addColorStop(1, `rgba(${Math.floor(baseColor.r * 0.8)}, ${Math.floor(baseColor.g * 0.9)}, ${baseColor.b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [shimmer?.intensity, shimmer?.color, shimmer?.params?.speed, shimmer?.params?.particleDensity, shimmer?.params?.shimmerSide, shimmer?.params?.shimmerDirection, shimmer?.params?.shimmerParticlesOnly, safeWidth, safeHeight, fxGeneration]);

  // Continuous fireworks show (the persistent overlay variant; the one-shot burst is its own command).
  useEffect(() => {
    const canvas = fireworksCanvasRef.current;
    if (!canvas || !fireworks || clamp01(fireworks.intensity) <= 0 || safeWidth <= 0 || safeHeight <= 0) return;
    return runFireworksSim(canvas, safeWidth, safeHeight, {
      colors: fireworks.color ? [fireworks.color] : [],
      intensity: clamp01(fireworks.intensity),
      speedMul: 0.5 + ep(fireworks.params, 'speed', 0.5) * 1.6,
      continuous: true,
    });
  }, [fireworks?.intensity, fireworks?.color, fireworks?.params?.speed, safeWidth, safeHeight, fxGeneration]);

  const scanlinesOpacity = clamp01(scanlines?.intensity ?? 0) * 0.65;
  const chromaOpacity = clamp01(chroma?.intensity ?? 0);

  // CRT Scanlines params
  const slLineSpacing = 2 + ep(scanlines?.params, 'lineSpacing') * 6;   // 2..8 px gap
  const slSpeed = 2 + (1 - ep(scanlines?.params, 'speed')) * 10;         // 2..12 s duration (inverted so 1 = fast)
  
  // Chromatic Glitch params
  const cgSpread = 2 + ep(chroma?.params, 'chromaticSpread') * 8;       // 2..10 px offset
  const cgSpeed = 0.3 + (1 - ep(chroma?.params, 'speed')) * 1.4;         // 0.3..1.7 s (inverted)

  // ── Glitch (FNF-style corruption) params ───────────────────────────────────────────────────────
  // The look: horizontal SLICES of the actual picture tear sideways in bursts, with colour-channel
  // fringing and discoloured bands (green by default, any colour). Three layers make it:
  //  1. An SVG displacement filter applied via `backdrop-filter: url(#…)` — this is what actually
  //     tears the REAL pixels underneath (a plain overlay can only draw on top; it can't move what's
  //     below). Band shape comes from thresholded turbulence; burstiness is SMIL-animated on the
  //     displacement scale, so it costs nothing while "calm" and needs no JS per frame.
  //  2. Channel-split fringing (R vs GB offset + screen blend) inside the same filter.
  //  3. A coloured band overlay (the discolouration) — a stepped gradient flickering in the author's
  //     chosen colour.
  const glitchOpacity = clamp01(glitch?.intensity ?? 0);
  const glColor = glitch?.color || '#33ff66';
  const glBlockiness = ep(glitch?.params, 'blockiness');                 // 0..1
  // Band height: fine tearing (~3px) → fat blocks (~60px). Frequency is per-pixel.
  const glBandFreq = 0.012 + Math.pow(1 - glBlockiness, 2) * 0.3;
  const glScale = 8 + glitchOpacity * 72;                                // max sideways tear, px
  const glAberration = 1 + ep(glitch?.params, 'chromaticSpread') * 10;   // channel offset, px
  const glDur = Math.max(0.4, 2.2 - ep(glitch?.params, 'speed') * 1.8);  // burst cycle, s

  // Resolve blend modes for canvas effects
  const sunbeamsBlend = (sunbeams?.params?.blendMode || 'screen') as React.CSSProperties['mixBlendMode'];
  const shimmerBlend = (shimmer?.params?.blendMode || 'overlay') as React.CSSProperties['mixBlendMode'];

  return (
    <div className={className}>
      {/* CRT Scanlines. Enhanced = scanline mask + RGB aperture grille + rolling refresh
          bar + vignette + mains flicker — a real tube, not just stripes. */}
      {scanlinesOpacity > 0 && (
        (scanlines && useGl('crt', scanlines.effectStyle)) ? (
          <GlFxCanvas kind="crt" width={safeWidth} height={safeHeight} onFallback={() => markGlDead('crt')}
            getParams={() => ({ kind: 'crt', intensity: clamp01(scanlines.intensity), lineSpacing: ep(scanlines.params, 'lineSpacing'), speed: ep(scanlines.params, 'speed') })} />
        ) : (
          <div
            className="vnfx-scanlines"
            style={{
              opacity: scanlinesOpacity,
              backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent ${slLineSpacing}px, rgba(0,0,0,0.4) ${slLineSpacing}px, rgba(0,0,0,0.4) ${slLineSpacing + 2}px)`,
              animationDuration: `${slSpeed}s`,
            }}
          />
        )
      )}

      {/* Chromatic glitch */}
      {chromaOpacity > 0 && (
        <div 
          className="vnfx-chromatic" 
          style={{ 
            opacity: chromaOpacity,
            animationDuration: `${cgSpeed}s`,
            backgroundImage: `radial-gradient(ellipse at 20% 50%, rgba(255,0,0,0.15) 0%, transparent ${cgSpread * 4}%), radial-gradient(ellipse at 80% 50%, rgba(0,255,255,0.12) 0%, transparent ${cgSpread * 4}%), repeating-linear-gradient(0deg, transparent 0px, transparent ${cgSpread}px, rgba(255,255,255,0.03) ${cgSpread}px, rgba(255,255,255,0.03) ${cgSpread + 1}px)`,
          }}
        />
      )}

      {/* Glitch decorations. The actual pixel TEAR is not here: an overlay can only draw on top,
          and Chromium ignores SVG reference filters in backdrop-filter — so the displacement filter
          is applied by LivePreview directly to the game container (see StageGlitchFilterDef). This
          layer contributes the corruption DRESSING: coloured slices, dead-pixel debris, and a hard
          horizontal jitter, all flickering in steps. */}
      {glitchOpacity > 0 && (
        <>
          {/* Dead-pixel debris: sparse clustered squares in each colour, different constellation and
              flicker phase per colour. */}
          {(glitch?.params?.colors?.length ? glitch.params.colors : [glColor]).map((c, ci, all) => (
            <div
              key={`glitch-debris-${ci}`}
              className="vnfx-glitch-bands"
              style={{
                backgroundImage: deadPixelTile(c, 29 + ci * 41),
                backgroundSize: `${Math.round(44 + glBlockiness * 40)}px ${Math.round(44 + glBlockiness * 40)}px`,
                imageRendering: 'pixelated' as const,
                opacity: undefined,
                animationDuration: `${(glDur * 0.7).toFixed(2)}s`,
                animationDelay: `${((glDur * 0.7 / all.length) * ci).toFixed(2)}s`,
              }}
            />
          ))}
          <div
            className="vnfx-glitch-bands"
            style={{
              animationDuration: `${glDur.toFixed(2)}s`,
              // Discoloured slices, ALTERNATING through the author's colour list (a single colour is
              // just a list of one). Intensity lives in each band's ALPHA (via color-mix), NOT the
              // element opacity — the flicker keyframes animate opacity, and a CSS animation
              // overrides an inline opacity, which would have eaten the intensity.
              backgroundImage: (() => {
                const colors = (glitch?.params?.colors?.length ? glitch.params.colors : [glColor]);
                const alpha = Math.round(55 * glitchOpacity);
                const bandStart = Math.round(26 + glBlockiness * 60);
                const bandEnd = Math.round(30 + glBlockiness * 78);
                const cycle = Math.round(90 + glBlockiness * 140);
                // One stop-run per colour, stacked end to end; the whole thing then repeats.
                const stops: string[] = [];
                colors.forEach((c, i) => {
                    const base = i * cycle;
                    const band = `color-mix(in srgb, ${c} ${alpha}%, transparent)`;
                    stops.push(`transparent ${base}px`, `transparent ${base + bandStart}px`,
                        `${band} ${base + bandStart}px`, `${band} ${base + bandEnd}px`,
                        `transparent ${base + bandEnd}px`, `transparent ${base + cycle}px`);
                });
                return `repeating-linear-gradient(0deg, ${stops.join(', ')})`;
              })(),
            }}
          />
        </>
      )}

      {/* Sunbeams - canvas-based with configurable blend mode. Enhanced = volumetric fbm god
          rays. Same probe-at-mount rule as atmosphere: the classic sims attach in effects that
          would not re-run after a late fallback. */}
      {sunbeams && clamp01(sunbeams.intensity) > 0 && (
        useGl('sunbeams', sunbeams.effectStyle) ? (
          <GlFxCanvas kind="sunbeams" width={safeWidth} height={safeHeight} style={{ mixBlendMode: sunbeamsBlend }} onFallback={() => markGlDead('sunbeams')}
            getParams={() => ({ kind: 'sunbeams', intensity: clamp01(sunbeams.intensity), color: sunbeams.color, speed: ep(sunbeams.params, 'speed'), spread: ep(sunbeams.params, 'spread') })}>
            <canvas ref={sunbeamsCanvasRef} className="vnfx-canvas" style={{ mixBlendMode: sunbeamsBlend }} aria-hidden />
          </GlFxCanvas>
        ) : (
          <canvas
            ref={sunbeamsCanvasRef}
            className="vnfx-canvas"
            style={{ mixBlendMode: sunbeamsBlend }}
            aria-hidden
          />
        )
      )}

      {/* Shimmer - canvas-based with configurable blend mode. Enhanced = light curtains + motes. */}
      {shimmer && clamp01(shimmer.intensity) > 0 && (
        useGl('shimmer', shimmer.effectStyle) ? (
          <GlFxCanvas kind="shimmer" width={safeWidth} height={safeHeight} style={{ mixBlendMode: shimmerBlend }} onFallback={() => markGlDead('shimmer')}
            getParams={() => ({
              kind: 'shimmer', intensity: clamp01(shimmer.intensity), color: shimmer.color,
              speed: ep(shimmer.params, 'speed'), density: ep(shimmer.params, 'particleDensity'),
              side: shimmer.params?.shimmerSide ?? 'full', direction: shimmer.params?.shimmerDirection ?? 'up',
              particlesOnly: !!shimmer.params?.shimmerParticlesOnly,
            })}>
            <canvas ref={shimmerCanvasRef} className="vnfx-canvas" style={{ mixBlendMode: shimmerBlend }} aria-hidden />
          </GlFxCanvas>
        ) : (
          <canvas
            ref={shimmerCanvasRef}
            className="vnfx-canvas"
            style={{ mixBlendMode: shimmerBlend }}
            aria-hidden
          />
        )
      )}

      {/* Rain. Enhanced = three parallax streak layers. */}
      {rain && clamp01(rain.intensity) > 0 && (
        useGl('rain', rain.effectStyle) ? (
          <GlFxCanvas kind="rain" width={safeWidth} height={safeHeight} onFallback={() => markGlDead('rain')}
            getParams={() => ({ kind: 'rain', intensity: clamp01(rain.intensity), color: rain.color, speed: ep(rain.params, 'speed'), wind: ep(rain.params, 'windStrength'), dropLength: ep(rain.params, 'dropLength') })}>
            <canvas ref={rainCanvasRef} className="vnfx-canvas" aria-hidden />
          </GlFxCanvas>
        ) : (
          <canvas
            ref={rainCanvasRef}
            className="vnfx-canvas"
            aria-hidden
          />
        )
      )}

      {/* Snow / Ash. Enhanced = soft parallax flakes with wobble + twinkle. */}
      {snowAsh && clamp01(snowAsh.intensity) > 0 && (
        useGl('snow', snowAsh.effectStyle) ? (
          <GlFxCanvas kind="snow" width={safeWidth} height={safeHeight} onFallback={() => markGlDead('snow')}
            getParams={() => ({ kind: 'snow', variant: snowAsh.variant === 'ash' ? 'ash' : 'snow', intensity: clamp01(snowAsh.intensity), color: snowAsh.color, speed: ep(snowAsh.params, 'speed'), wind: ep(snowAsh.params, 'windStrength'), particleSize: ep(snowAsh.params, 'particleSize') })}>
            <canvas ref={snowCanvasRef} className="vnfx-canvas" aria-hidden />
          </GlFxCanvas>
        ) : (
          <canvas
            ref={snowCanvasRef}
            className="vnfx-canvas"
            aria-hidden
          />
        )
      )}

      {/* Haze / Fog / Smoke. Enhanced = fbm shader. NOTE: the enhanced↔classic choice is made
          per MOUNT with the module WebGL probe (not GlFxCanvas's children fallback) because
          the classic cloud sims attach to their canvases in effects that would not re-run
          after a late fallback — the probe guarantees the classic canvas + sim mount together. */}
      {haze && clamp01(haze.intensity) > 0 && (
        useGl('atmosphere', haze.effectStyle) ? (
          <GlFxCanvas kind="atmosphere" width={safeWidth} height={safeHeight} onFallback={() => markGlDead('atmosphere')}
            style={haze.params?.blendMode && haze.params.blendMode !== 'normal' ? { mixBlendMode: haze.params.blendMode } : undefined}
            getParams={() => ({ kind: 'atmosphere', type: 'haze', intensity: clamp01(haze.intensity), color: haze.color, speed: ep(haze.params, 'speed', 1), wind: ep(haze.params, 'windStrength'), density: ep(haze.params, 'particleDensity') })}>
            <canvas ref={hazeCanvasRef} className="vnfx-canvas" aria-hidden />
          </GlFxCanvas>
        ) : (
          <canvas ref={hazeCanvasRef} className="vnfx-canvas" aria-hidden />
        )
      )}

      {/* Fog */}
      {fog && clamp01(fog.intensity) > 0 && (
        useGl('atmosphere', fog.effectStyle) ? (
          <GlFxCanvas kind="atmosphere" width={safeWidth} height={safeHeight} onFallback={() => markGlDead('atmosphere')}
            style={fog.params?.blendMode && fog.params.blendMode !== 'normal' ? { mixBlendMode: fog.params.blendMode } : undefined}
            getParams={() => ({ kind: 'atmosphere', type: 'fog', intensity: clamp01(fog.intensity), color: fog.color, speed: ep(fog.params, 'speed', 1), wind: ep(fog.params, 'windStrength'), density: ep(fog.params, 'particleDensity') })}>
            <canvas ref={fogCanvasRef} className="vnfx-canvas" aria-hidden />
          </GlFxCanvas>
        ) : (
          <canvas ref={fogCanvasRef} className="vnfx-canvas" aria-hidden />
        )
      )}

      {/* Smoke */}
      {smoke && clamp01(smoke.intensity) > 0 && (
        useGl('atmosphere', smoke.effectStyle) ? (
          <GlFxCanvas kind="atmosphere" width={safeWidth} height={safeHeight} onFallback={() => markGlDead('atmosphere')}
            style={smoke.params?.blendMode && smoke.params.blendMode !== 'normal' ? { mixBlendMode: smoke.params.blendMode } : undefined}
            getParams={() => ({ kind: 'atmosphere', type: 'smoke', intensity: clamp01(smoke.intensity), color: smoke.color, speed: ep(smoke.params, 'speed', 1), wind: ep(smoke.params, 'windStrength'), density: ep(smoke.params, 'particleDensity') })}>
            <canvas ref={smokeCanvasRef} className="vnfx-canvas" aria-hidden />
          </GlFxCanvas>
        ) : (
          <canvas ref={smokeCanvasRef} className="vnfx-canvas" aria-hidden />
        )
      )}

      {/* Fireworks (continuous show) — additive glow. Enhanced = procedural bursts with
          gravity droop, rising rockets, trails, and sparkle. */}
      {fireworks && clamp01(fireworks.intensity) > 0 && (
        useGl('fireworks', fireworks.effectStyle) ? (
          <GlFxCanvas kind="fireworks" width={safeWidth} height={safeHeight} style={{ mixBlendMode: 'screen' }} onFallback={() => markGlDead('fireworks')}
            getParams={() => ({ kind: 'fireworks', intensity: clamp01(fireworks.intensity), color: fireworks.color, speed: ep(fireworks.params, 'speed') })}>
            <canvas ref={fireworksCanvasRef} className="vnfx-canvas" style={{ mixBlendMode: 'screen' }} aria-hidden />
          </GlFxCanvas>
        ) : (
          <canvas ref={fireworksCanvasRef} className="vnfx-canvas" style={{ mixBlendMode: 'screen' }} aria-hidden />
        )
      )}

      {/* Spotlight — positionable stage beams over a darkened screen. Same geometry as the scene
          Spotlight command / its placement picker: clipPath trapezoid + radial glow, rotated
          around the source point. Intensity = how dark the rest of the screen goes. */}
      {spotlight && clamp01(spotlight.intensity) > 0 && (() => {
        const darkness = clamp01(spotlight.intensity);
        const beams = spotlight.params?.beams ?? [];
        const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, isNaN(v) ? lo : v));
        if (useGl('beams', spotlight.effectStyle)) {
          return (
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${darkness})` }} />
              <GlFxCanvas kind="beams" width={safeWidth} height={safeHeight} style={{ mixBlendMode: 'screen' }} onFallback={() => markGlDead('beams')}
                getParams={() => ({
                  kind: 'beams', stageW: safeWidth, stageH: safeHeight,
                  beams: (spotlight.params?.beams ?? []).map(bm => ({
                    sourceX: cl(bm.sourceX, 0, 100), sourceY: cl(bm.sourceY, 0, 100), aimAngle: bm.aimAngle ?? 0,
                    intensity: 0.9, beamWidth: bm.beamWidth ?? 45, sourceWidth: bm.sourceWidth ?? 8,
                    height: bm.height ?? 100, falloff: bm.falloff ?? 0.5, color: bm.color,
                  })),
                })} />
            </div>
          );
        }
        return (
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${darkness})` }} />
            {beams.map(bm => {
              const half = cl(bm.beamWidth ?? 45, 5, 100) / 2;
              const len = cl(bm.height ?? 100, 10, 200);
              const srcHalf = cl(bm.sourceWidth ?? 8, 0, 60) / 2;
              const inner = Math.round(cl(1 - (bm.falloff ?? 0.5), 0, 1) * 100);
              const { r, g, b } = parseColor(bm.color, { r: 255, g: 243, b: 214 });
              const sx = cl(bm.sourceX, 0, 100), sy = cl(bm.sourceY, 0, 100);
              return (
                <div key={bm.id} className="absolute inset-0" style={{ mixBlendMode: 'screen', transformOrigin: `${sx}% ${sy}%`, transform: `rotate(${-(bm.aimAngle ?? 0)}deg)`, filter: `blur(${Math.max(3, minDim * 0.012)}px)`, willChange: 'transform' }}>
                  <div className="absolute inset-0" style={{
                    clipPath: `polygon(${sx - srcHalf}% ${sy}%, ${sx + srcHalf}% ${sy}%, ${sx + half}% ${sy + len}%, ${sx - half}% ${sy + len}%)`,
                    background: `radial-gradient(120% ${len}% at ${sx}% ${sy}%, rgba(${r},${g},${b},0.95) 0%, rgba(${r},${g},${b},0.55) ${inner}%, rgba(${r},${g},${b},0) 100%)`,
                  }} />
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Placed lights — twinkling light points; intensity = master brightness (⚡-dimmable). */}
      {lightsFx && clamp01(lightsFx.intensity) > 0 && (() => {
        const scaled = (lightsFx.params?.lights ?? []).map(l => ({ ...l, brightness: (l.brightness ?? 1) * clamp01(lightsFx.intensity) }));
        return (
          <div className="absolute inset-0 overflow-hidden">
            {useGl('lights', lightsFx.effectStyle) ? (
              <GlFxCanvas kind="lights" width={safeWidth} height={safeHeight} style={{ mixBlendMode: 'screen' }} onFallback={() => markGlDead('lights')}
                getParams={() => ({ kind: 'lights', lights: scaled, stageW: safeWidth, stageH: safeHeight })}>
                <LightsLayer lights={scaled} stageW={safeWidth} stageH={safeHeight} />
              </GlFxCanvas>
            ) : (
              <LightsLayer lights={scaled} stageW={safeWidth} stageH={safeHeight} />
            )}
          </div>
        );
      })()}

      {/* Lightning — a continuous storm: long dark gaps broken by quick double-flashes. The outer
          div scales the peak by intensity (the keyframes own the element opacity — same trap as
          the glitch bands); speed sets how often it strikes. Keyframes are defined here, NOT in
          LivePreview's style block, so the effect is self-contained wherever this renders. */}
      {lightning && clamp01(lightning.intensity) > 0 && (() => {
        // Enhanced = the same storm cadence plus a real procedural bolt with branches.
        if (useGl('lightning', lightning.effectStyle)) {
          return (
            <GlFxCanvas kind="lightning" width={safeWidth} height={safeHeight} style={{ mixBlendMode: 'screen' }} onFallback={() => markGlDead('lightning')}
              getParams={() => ({ kind: 'lightning', intensity: clamp01(lightning.intensity), color: lightning.color, speed: ep(lightning.params, 'speed') })} />
          );
        }
        const cycle = (14 - ep(lightning.params, 'speed') * 11).toFixed(2);
        const { r, g, b } = parseColor(lightning.color, { r: 234, g: 242, b: 255 });
        return (
          <div className="absolute inset-0" style={{ opacity: clamp01(lightning.intensity), mixBlendMode: 'screen' }}>
            <style>{`
                @keyframes vnsfx-lightning {
                    0% { opacity: 0; }
                    1.2% { opacity: 1; }
                    2.4% { opacity: 0.12; }
                    3.6% { opacity: 0.85; }
                    6.5% { opacity: 0; }
                    54% { opacity: 0; }
                    55% { opacity: 0.55; }
                    56.5% { opacity: 0; }
                    100% { opacity: 0; }
                }
            `}</style>
            <div className="absolute inset-0" style={{ backgroundColor: `rgb(${r},${g},${b})`, opacity: 0, animation: `vnsfx-lightning ${cycle}s linear infinite` }} />
          </div>
        );
      })()}

      {/* Flashlight — mouse-following darkness with a lit circle at the cursor. Above everything
          so the darkness swallows the other effects too, exactly like the scene version. */}
      {flashlight && clamp01(flashlight.intensity) > 0 && (
        useGl('flashlight', flashlight.effectStyle)
          ? <EnhancedFlashlightOverlay effect={flashlight} width={safeWidth} height={safeHeight} onFallback={() => markGlDead('flashlight')} />
          : <FlashlightOverlay effect={flashlight} minDim={minDim} />
      )}

      {/* Plugin-registered custom effects (visual pipeline) */}
      {pluginEffects.map(({ effect, def }) => (
        <PluginEffectCanvas
          key={effect.id || def.type}
          def={def}
          effect={effect}
          width={safeWidth}
          height={safeHeight}
        />
      ))}
    </div>
  );
};
