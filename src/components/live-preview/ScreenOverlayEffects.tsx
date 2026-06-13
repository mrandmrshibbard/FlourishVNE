import React, { useEffect, useMemo, useRef } from 'react';
import {
  clamp01,
  normalizeOverlayEffects,
  BUILTIN_OVERLAY_EFFECT_TYPES,
  type VNScreenOverlayEffect,
  type VNScreenOverlayEffectType,
  type VNEffectParams,
} from '../../types';
import { pluginManager } from '../../features/plugins/PluginManagerService';
import type { CustomEffectDefinition } from '../../types/plugins';

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
  const sunbeams = getEffect(normalized, 'sunbeams');
  const shimmer = getEffect(normalized, 'shimmer');
  const rain = getEffect(normalized, 'rain');
  const snowAsh = getEffect(normalized, 'snowAsh');
  const fog = getEffect(normalized, 'fog');
  const haze = getEffect(normalized, 'haze');
  const smoke = getEffect(normalized, 'smoke');

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
  const minDim = Math.min(safeWidth, safeHeight);

  // Fog — thick, low, slow horizontal banks (light grey).
  useEffect(() => {
    const intensity = clamp01(fog?.intensity ?? 0);
    const c = fogCanvasRef.current;
    if (!c || intensity <= 0 || safeWidth <= 0 || safeHeight <= 0) return;
    const color = parseColor(fog?.color, { r: 205, g: 210, b: 216 });
    const speed = 0.3 + ep(fog?.params, 'speed') * 1.4;
    return runCloudSim(c, safeWidth, safeHeight, {
      intensity, color, blobCount: 16, sizeMin: minDim * 0.28, sizeMax: minDim * 0.55,
      vx: 16, vy: 0, vRand: 10, baseOpacity: 0.5, swirl: 6, speedMul: speed,
    });
  }, [fog?.intensity, fog?.color, fog?.params?.speed, safeWidth, safeHeight, minDim]);

  // Haze — a faint, slow, near-uniform veil (warm/neutral tint).
  useEffect(() => {
    const intensity = clamp01(haze?.intensity ?? 0);
    const c = hazeCanvasRef.current;
    if (!c || intensity <= 0 || safeWidth <= 0 || safeHeight <= 0) return;
    const color = parseColor(haze?.color, { r: 225, g: 222, b: 210 });
    const speed = 0.3 + ep(haze?.params, 'speed') * 1.4;
    return runCloudSim(c, safeWidth, safeHeight, {
      intensity, color, blobCount: 10, sizeMin: minDim * 0.45, sizeMax: minDim * 0.8,
      vx: 7, vy: 0, vRand: 4, baseOpacity: 0.22, swirl: 3, speedMul: speed,
    });
  }, [haze?.intensity, haze?.color, haze?.params?.speed, safeWidth, safeHeight, minDim]);

  // Smoke — darker, rising, swirling wisps.
  useEffect(() => {
    const intensity = clamp01(smoke?.intensity ?? 0);
    const c = smokeCanvasRef.current;
    if (!c || intensity <= 0 || safeWidth <= 0 || safeHeight <= 0) return;
    const color = parseColor(smoke?.color, { r: 70, g: 72, b: 76 });
    const speed = 0.3 + ep(smoke?.params, 'speed') * 1.4;
    return runCloudSim(c, safeWidth, safeHeight, {
      intensity, color, blobCount: 14, sizeMin: minDim * 0.18, sizeMax: minDim * 0.42,
      vx: 6, vy: -26, vRand: 14, baseOpacity: 0.42, swirl: 16, speedMul: speed,
    });
  }, [smoke?.intensity, smoke?.color, smoke?.params?.speed, safeWidth, safeHeight, minDim]);

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
  }, [rain?.intensity, rain?.color, rain?.params?.windStrength, rain?.params?.dropLength, rain?.params?.speed, safeWidth, safeHeight]);

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
  }, [snowAsh?.intensity, snowAsh?.variant, snowAsh?.color, snowAsh?.params?.particleSize, snowAsh?.params?.windStrength, snowAsh?.params?.speed, safeWidth, safeHeight]);

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
  }, [sunbeams?.intensity, sunbeams?.color, sunbeams?.params?.speed, sunbeams?.params?.spread, safeWidth, safeHeight]);

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
  }, [shimmer?.intensity, shimmer?.color, shimmer?.params?.speed, shimmer?.params?.particleDensity, shimmer?.params?.shimmerSide, shimmer?.params?.shimmerDirection, shimmer?.params?.shimmerParticlesOnly, safeWidth, safeHeight]);

  const scanlinesOpacity = clamp01(scanlines?.intensity ?? 0) * 0.65;
  const chromaOpacity = clamp01(chroma?.intensity ?? 0);

  // CRT Scanlines params
  const slLineSpacing = 2 + ep(scanlines?.params, 'lineSpacing') * 6;   // 2..8 px gap
  const slSpeed = 2 + (1 - ep(scanlines?.params, 'speed')) * 10;         // 2..12 s duration (inverted so 1 = fast)
  
  // Chromatic Glitch params
  const cgSpread = 2 + ep(chroma?.params, 'chromaticSpread') * 8;       // 2..10 px offset
  const cgSpeed = 0.3 + (1 - ep(chroma?.params, 'speed')) * 1.4;         // 0.3..1.7 s (inverted)

  // Resolve blend modes for canvas effects
  const sunbeamsBlend = (sunbeams?.params?.blendMode || 'screen') as React.CSSProperties['mixBlendMode'];
  const shimmerBlend = (shimmer?.params?.blendMode || 'overlay') as React.CSSProperties['mixBlendMode'];

  return (
    <div className={className}>
      {/* CRT Scanlines */}
      {scanlinesOpacity > 0 && (
        <div
          className="vnfx-scanlines"
          style={{
            opacity: scanlinesOpacity,
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent ${slLineSpacing}px, rgba(0,0,0,0.4) ${slLineSpacing}px, rgba(0,0,0,0.4) ${slLineSpacing + 2}px)`,
            animationDuration: `${slSpeed}s`,
          }}
        />
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

      {/* Sunbeams - canvas-based with configurable blend mode */}
      {sunbeams && clamp01(sunbeams.intensity) > 0 && (
        <canvas
          ref={sunbeamsCanvasRef}
          className="vnfx-canvas"
          style={{ mixBlendMode: sunbeamsBlend }}
          aria-hidden
        />
      )}

      {/* Shimmer - canvas-based with configurable blend mode */}
      {shimmer && clamp01(shimmer.intensity) > 0 && (
        <canvas
          ref={shimmerCanvasRef}
          className="vnfx-canvas"
          style={{ mixBlendMode: shimmerBlend }}
          aria-hidden
        />
      )}

      {/* Rain */}
      {rain && clamp01(rain.intensity) > 0 && (
        <canvas
          ref={rainCanvasRef}
          className="vnfx-canvas"
          aria-hidden
        />
      )}

      {/* Snow / Ash */}
      {snowAsh && clamp01(snowAsh.intensity) > 0 && (
        <canvas
          ref={snowCanvasRef}
          className="vnfx-canvas"
          aria-hidden
        />
      )}

      {/* Haze (drawn under fog/smoke as a faint veil) */}
      {haze && clamp01(haze.intensity) > 0 && (
        <canvas ref={hazeCanvasRef} className="vnfx-canvas" aria-hidden />
      )}

      {/* Fog */}
      {fog && clamp01(fog.intensity) > 0 && (
        <canvas ref={fogCanvasRef} className="vnfx-canvas" aria-hidden />
      )}

      {/* Smoke */}
      {smoke && clamp01(smoke.intensity) > 0 && (
        <canvas ref={smokeCanvasRef} className="vnfx-canvas" aria-hidden />
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
