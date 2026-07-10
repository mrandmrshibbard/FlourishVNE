import React, { useEffect, useRef } from 'react';
import { runFireworksSim } from './live-preview/ScreenOverlayEffects';

/**
 * Decorative, non-interactive holiday overlay for the Project Hub. Renders behind the hub UI
 * (pointer-events: none) and is gated by the active theme being a holiday theme.
 *
 * `usa-fireworks` = gentle red/white/blue fireworks (reusing the engine's runFireworksSim) plus a
 * slow patriotic gradient "flash" wash. Tuned soft so it's ambient, not distracting.
 */
/** The recurring spark-text banner. Kept to celebratory, non-targeted wording.
 *  Split into parts anchored at fractions of the screen width so the center stays clear
 *  (the hub's title/buttons live there). */
const SPARK_PARTS: { text: string; xFrac: number }[] = [
    { text: 'Happy', xFrac: 0.18 },
    { text: '4th!', xFrac: 0.82 },
];
const SPARK_COLORS = ['#ff2d4e', '#ffffff', '#2f6bff', '#ffd34d'];
const SPARK_SHOW_MS = 6600;   // how long one banner lives
const SPARK_EVERY_MS = 5000; // gap between banners — frequent enough that nobody misses it

const HolidayDecorations: React.FC<{ decoration: 'usa-fireworks' }> = ({ decoration }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);

  // "Message written in fireworks": every SPARK_EVERY_MS the banner text is rasterized to
  // points and each point becomes a twinkling red/white/blue spark that pops in staggered,
  // shimmers, and burns out — like a firework that happens to spell something.
  useEffect(() => {
    if (decoration !== 'usa-fireworks') return;
    const canvas = textCanvasRef.current;
    if (!canvas) return;
    let alive = true;
    let raf = 0;
    let timer: number | null = null;

    const runCycle = () => {
      if (!alive) return;
      const w = (canvas.width = window.innerWidth);
      const h = (canvas.height = window.innerHeight);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // Rasterize the message → spark points.
      const fs = Math.min(w, h) * 0.13;
      const off = document.createElement('canvas');
      off.width = w; off.height = Math.ceil(fs * 1.7);
      const octx = off.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
      if (!octx) return;
      octx.font = `900 ${fs}px system-ui, sans-serif`;
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';
      octx.fillStyle = '#fff';
      for (const part of SPARK_PARTS) octx.fillText(part.text, off.width * part.xFrac, off.height / 2);
      const data = octx.getImageData(0, 0, off.width, off.height).data;
      const step = Math.max(4, Math.round(fs / 20));
      const yBase = h * 0.24 - off.height / 2; // banner band ~quarter down the screen
      const pts: { x: number; y: number; delay: number; color: string; phase: number }[] = [];
      for (let y = 0; y < off.height; y += step) {
        for (let x = 0; x < off.width; x += step) {
          if (data[(y * off.width + x) * 4 + 3] > 128) {
            pts.push({ x, y: y + yBase, delay: Math.random() * 450, color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)], phase: Math.random() * Math.PI * 2 });
          }
        }
      }
      const t0 = performance.now();
      const r = Math.max(1.5, step * 0.34);
      const tick = () => {
        if (!alive) return;
        const t = performance.now() - t0;
        ctx.clearRect(0, 0, w, h);
        if (t > SPARK_SHOW_MS) {
          timer = window.setTimeout(runCycle, SPARK_EVERY_MS - SPARK_SHOW_MS);
          return;
        }
        for (const p of pts) {
          const lt = t - p.delay;
          if (lt < 0) continue;
          const fadeIn = Math.min(1, lt / 220);
          const fadeOut = Math.max(0, Math.min(1, (SPARK_SHOW_MS - 800 - t + p.delay) / 800 + 1));
          const twinkle = 0.55 + 0.45 * Math.sin(p.phase + lt / 85);
          const a = fadeIn * Math.min(1, fadeOut) * twinkle;
          if (a <= 0.02) continue;
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y + Math.sin(p.phase + lt / 650) * 2, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    timer = window.setTimeout(runCycle, 3500); // first banner shortly after the hub opens
    return () => { alive = false; if (timer != null) clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [decoration]);

  useEffect(() => {
    if (decoration !== 'usa-fireworks') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stop: (() => void) | null = null;
    const start = () => {
      stop?.();
      const w = window.innerWidth;
      const h = window.innerHeight;
      stop = runFireworksSim(canvas, w, h, {
        colors: ['#ff2d4e', '#ffffff', '#2f6bff', '#ff5d7a', '#7fb0ff', '#ffd34d'],
        intensity: 0.9,      // bold and lively — clearly a celebration
        speedMul: 1,
        continuous: true,
        maxBursts: 7,
        heightFrac: 0.66,
      });
    };
    start();
    // Re-fit the canvas to the window on resize (debounced via rAF).
    let raf = 0;
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(start); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(raf); stop?.(); };
  }, [decoration]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
      {/* Bold patriotic gradient flash wash */}
      <style>{`
        @keyframes holidayUsaFlash {
          0%, 100% { opacity: 0.22; }
          50%      { opacity: 0.55; }
        }
      `}</style>
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `
            radial-gradient(ellipse at 16% 20%, rgba(255, 45, 78, 0.7) 0%, transparent 46%),
            radial-gradient(ellipse at 84% 24%, rgba(47, 107, 255, 0.7) 0%, transparent 46%),
            radial-gradient(ellipse at 50% 98%, rgba(255, 255, 255, 0.5) 0%, transparent 42%)
          `,
          animation: 'holidayUsaFlash 5.5s ease-in-out infinite',
          mixBlendMode: 'screen',
        }}
      />
      {/* Fireworks canvas */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 1 }} />
      {/* Spark-text banner canvas (message written in fireworks) */}
      <canvas ref={textCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
};

export default HolidayDecorations;
