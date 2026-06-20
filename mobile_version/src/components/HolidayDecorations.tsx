import React, { useEffect, useRef } from 'react';
import { runFireworksSim } from './live-preview/ScreenOverlayEffects';

/**
 * Decorative, non-interactive holiday overlay for the Project Hub. Renders behind the hub UI
 * (pointer-events: none) and is gated by the active theme being a holiday theme.
 *
 * `usa-fireworks` = gentle red/white/blue fireworks (reusing the engine's runFireworksSim) plus a
 * slow patriotic gradient "flash" wash. Tuned soft so it's ambient, not distracting.
 */
const HolidayDecorations: React.FC<{ decoration: 'usa-fireworks' }> = ({ decoration }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    </div>
  );
};

export default HolidayDecorations;
