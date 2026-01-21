import React, { useEffect, useMemo, useRef } from 'react';
import {
  clamp01,
  normalizeOverlayEffects,
  type VNScreenOverlayEffect,
  type VNScreenOverlayEffectType,
} from '../../types';

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

  const rainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const snowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sunbeamsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const shimmerCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

    const dropCount = Math.floor(100 + intensity * 600);
    const drops = Array.from({ length: dropCount }).map(() => ({
      x: Math.random() * safeWidth,
      y: Math.random() * safeHeight,
      len: 12 + Math.random() * 22,
      speed: 600 + Math.random() * 1000,
      thickness: 1 + Math.random() * 1.8,
      wind: -80 + Math.random() * 160,
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
  }, [rain?.intensity, rain?.color, safeWidth, safeHeight]);

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

    const count = Math.floor(80 + intensity * 420);
    const particles = Array.from({ length: count }).map(() => ({
      x: Math.random() * safeWidth,
      y: Math.random() * safeHeight,
      r: variant === 'snow' ? 1.2 + Math.random() * 2.8 : 0.8 + Math.random() * 1.8,
      vx: (variant === 'snow' ? -25 : -40) + Math.random() * 80,
      vy: (variant === 'snow' ? 25 : 55) + Math.random() * (variant === 'snow' ? 70 : 130),
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 1.5 + Math.random() * 2.5,
      wobbleAmp: variant === 'snow' ? 15 + Math.random() * 20 : 8 + Math.random() * 12,
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
  }, [snowAsh?.intensity, snowAsh?.variant, snowAsh?.color, safeWidth, safeHeight]);

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

    // Create multiple noise functions for complex organic movement
    const noises = Array.from({ length: 4 }, () => createNoise());
    
    let raf = 0;
    let time = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;

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
        const waveWidth = 0.8 + n2 * 0.6; // Very wide, overlapping waves
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
  }, [sunbeams?.intensity, sunbeams?.color, safeWidth, safeHeight]);

  // Dynamic Shimmer - organic light waves
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

    const noise = createNoise();
    
    // Multiple shimmer waves with different properties
    const waves = Array.from({ length: 5 }).map((_, i) => ({
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.6,
      amplitude: 0.15 + Math.random() * 0.2,
      frequency: 0.5 + Math.random() * 1.5,
      yOffset: (i / 5) * safeHeight,
      noiseOffset: Math.random() * 1000,
      width: safeWidth * (0.3 + Math.random() * 0.4),
    }));

    // Floating light particles
    const particles = Array.from({ length: 20 + Math.floor(intensity * 30) }).map(() => ({
      x: Math.random() * safeWidth,
      y: Math.random() * safeHeight,
      vx: -15 + Math.random() * 30,
      vy: -10 + Math.random() * 20,
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

      // Draw shimmer waves
      for (const wave of waves) {
        wave.phase += dt * wave.speed;
        
        const noiseVal = noise(time * 0.2 + wave.noiseOffset);
        const xOffset = (Math.sin(wave.phase) + noiseVal * 0.5) * safeWidth * wave.amplitude;
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
  }, [shimmer?.intensity, shimmer?.color, safeWidth, safeHeight]);

  const scanlinesOpacity = clamp01(scanlines?.intensity ?? 0) * 0.65;
  const chromaOpacity = clamp01(chroma?.intensity ?? 0);

  return (
    <div className={className}>
      {/* CRT Scanlines */}
      {scanlinesOpacity > 0 && (
        <div
          className="vnfx-scanlines"
          style={{ opacity: scanlinesOpacity }}
        />
      )}

      {/* Chromatic glitch */}
      {chromaOpacity > 0 && (
        <div className="vnfx-chromatic" style={{ opacity: chromaOpacity }} />
      )}

      {/* Sunbeams - now canvas-based */}
      {sunbeams && clamp01(sunbeams.intensity) > 0 && (
        <canvas
          ref={sunbeamsCanvasRef}
          className="vnfx-canvas"
          style={{ mixBlendMode: 'screen' }}
          aria-hidden
        />
      )}

      {/* Shimmer - now canvas-based */}
      {shimmer && clamp01(shimmer.intensity) > 0 && (
        <canvas
          ref={shimmerCanvasRef}
          className="vnfx-canvas"
          style={{ mixBlendMode: 'overlay' }}
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
    </div>
  );
};
