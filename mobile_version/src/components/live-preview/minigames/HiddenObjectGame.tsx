import React, { useEffect, useRef, useState } from 'react';
import { VNHiddenObjectStage } from '../../../types/miniGames';
import { MiniGameRenderCtx } from './types';
import { useImageBox } from './useImageBox';

/**
 * Hidden object: find every hotspot in a busy scene image.
 *
 * The image contain-fits the surface (useImageBox) and hotspots live in IMAGE-% space
 * (x/y = top-left, w/h = size — the same convention the placement editor writes), so what
 * the author places is exactly what players tap at any screen size. Finds swap to the
 * hotspot's found art (or a ✓ ring), misses ripple, and the optional hint button pulses one
 * unfound spot with a cooldown.
 */

export const HiddenObjectGameSurface: React.FC<{ ctx: MiniGameRenderCtx }> = ({ ctx }) => {
    const stage = ctx.stage as VNHiddenObjectStage;
    const hotspots = stage.hotspots || [];
    const url = stage.sceneImageId ? ctx.assetResolver(stage.sceneImageId, 'image') : null;

    const hostRef = useRef<HTMLDivElement>(null);
    const box = useImageBox(hostRef, url);
    const [found, setFound] = useState<Set<string>>(new Set());
    const [miss, setMiss] = useState<{ x: number; y: number; key: number } | null>(null);
    const [hintId, setHintId] = useState<string | null>(null);
    const [hintReadyAt, setHintReadyAt] = useState(0);
    const [nowTick, setNowTick] = useState(0);
    const timersRef = useRef<number[]>([]);
    const wonRef = useRef(false);

    useEffect(() => () => { timersRef.current.forEach(id => clearTimeout(id)); }, []);
    const pushTimer = (fn: () => void, ms: number) => { const id = window.setTimeout(fn, ms); timersRef.current.push(id); };

    // Half-configured stage (no image / no objects): never brick — tap through.
    if (!url || !hotspots.length) {
        return (
            <button onClick={() => ctx.reportWin()} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.85)', fontSize: 15 }}>
                <span style={{ fontSize: 32 }}>🔍</span>
                <span>{!url ? 'No scene image yet — pick one in the Mini Games tab.' : 'No objects placed yet — place them in the Mini Games tab.'}</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Tap to continue</span>
            </button>
        );
    }

    const hit = (h: VNHiddenObjectStage['hotspots'][number], px: number, py: number) => {
        // px/py are image-% points; hotspot x/y = top-left, w/h = size (image-%).
        if ((h.shape || 'circle') === 'rect') {
            return px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h;
        }
        const cx = h.x + h.w / 2, cy = h.y + h.h / 2;
        const dx = (px - cx) / (h.w / 2), dy = (py - cy) / (h.h / 2);
        return dx * dx + dy * dy <= 1;
    };

    const tap = (e: React.PointerEvent) => {
        if (wonRef.current || !box.width || !box.height) return;
        const rect = (hostRef.current as HTMLDivElement).getBoundingClientRect();
        const ix = e.clientX - rect.left - box.left;
        const iy = e.clientY - rect.top - box.top;
        if (ix < 0 || iy < 0 || ix > box.width || iy > box.height) return;
        const px = (ix / box.width) * 100, py = (iy / box.height) * 100;
        const target = hotspots.find(h => !found.has(h.id) && hit(h, px, py));
        if (target) {
            ctx.playInteractSound();
            ctx.reportHit(); // a found object is a correct move: counts a hit + drives the character + hit feedback
            const next = new Set(found); next.add(target.id);
            setFound(next);
            setHintId(cur => (cur === target.id ? null : cur));
            ctx.reportProgress?.(next.size / hotspots.length);
            if (next.size === hotspots.length && !wonRef.current) {
                wonRef.current = true;
                pushTimer(() => ctx.reportWin(), 450);
            }
        } else {
            ctx.reportMistake();
            setMiss({ x: px, y: py, key: Date.now() });
            pushTimer(() => setMiss(m => (m && Date.now() - m.key >= 550 ? null : m)), 600);
        }
    };

    const hintCooldownMs = Math.max(1, stage.hintCooldownSec ?? 10) * 1000;
    const hintRemaining = Math.max(0, hintReadyAt - nowTick);
    const useHint = () => {
        const unfound = hotspots.filter(h => !found.has(h.id));
        if (!unfound.length || hintRemaining > 0) return;
        ctx.playInteractSound();
        const pick = unfound[Math.floor(Math.random() * unfound.length)];
        setHintId(pick.id);
        setHintReadyAt(Date.now() + hintCooldownMs);
        pushTimer(() => setHintId(cur => (cur === pick.id ? null : cur)), 1800);
    };
    // Cooldown countdown display tick (only while cooling down).
    useEffect(() => {
        if (!stage.hintButton || hintReadyAt <= Date.now()) return;
        const id = window.setInterval(() => setNowTick(Date.now()), 500);
        setNowTick(Date.now());
        return () => clearInterval(id);
    }, [hintReadyAt, stage.hintButton]);

    const pctRect = (h: VNHiddenObjectStage['hotspots'][number]): React.CSSProperties => ({
        position: 'absolute',
        left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%`,
    });

    return (
        <div ref={hostRef} style={{ position: 'absolute', inset: 0, touchAction: 'manipulation' }} onPointerDown={tap}>
            <style>{'@keyframes mgMissRipple{0%{transform:scale(0.4);opacity:0.9}100%{transform:scale(1.6);opacity:0}}@keyframes mgHintPulse{0%,100%{transform:scale(1);opacity:0.9}50%{transform:scale(1.25);opacity:0.4}}@keyframes mgFoundPop{0%{transform:scale(0.5);opacity:0}70%{transform:scale(1.15);opacity:1}100%{transform:scale(1)}}'}</style>
            <img src={url} alt="" draggable={false}
                style={{ position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height, pointerEvents: 'none' }} />
            {/* Overlay layer aligned to the IMAGE box (marker % = image %) */}
            <div style={{ position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height, pointerEvents: 'none' }}>
                {stage.showFoundMarkers !== false && hotspots.filter(h => found.has(h.id)).map(h => {
                    const foundUrl = h.foundImageId ? ctx.assetResolver(h.foundImageId, 'image') : null;
                    return (
                        <div key={h.id} style={{ ...pctRect(h), animation: 'mgFoundPop 0.3s ease-out' }}>
                            {foundUrl
                                ? <img src={foundUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                : <div style={{ width: '100%', height: '100%', border: '3px solid rgba(52,211,153,0.95)', borderRadius: (h.shape || 'circle') === 'circle' ? '50%' : 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399', fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.8)', fontSize: 'min(4vmin, 22px)' }}>✓</div>}
                        </div>
                    );
                })}
                {hintId && (() => {
                    const h = hotspots.find(x => x.id === hintId);
                    if (!h) return null;
                    return <div style={{ ...pctRect(h), border: '3px solid rgba(250,204,21,0.95)', borderRadius: (h.shape || 'circle') === 'circle' ? '50%' : 8, animation: 'mgHintPulse 0.6s ease-in-out infinite' }} />;
                })()}
                {miss && (
                    <div key={miss.key} style={{ position: 'absolute', left: `${miss.x}%`, top: `${miss.y}%`, width: '6%', aspectRatio: '1', transform: 'translate(-50%, -50%)', border: '3px solid rgba(248,113,113,0.9)', borderRadius: '50%', animation: 'mgMissRipple 0.55s ease-out forwards' }} />
                )}
            </div>
            {/* Counter */}
            {stage.showCounter !== false && (
                <div style={{ position: 'absolute', top: 8, right: 10, padding: '3px 12px', borderRadius: 999, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 14, fontWeight: 600, pointerEvents: 'none' }}>
                    {found.size} / {hotspots.length}
                </div>
            )}
            {/* Hint button */}
            {!!stage.hintButton && found.size < hotspots.length && (
                <button onClick={e => { e.stopPropagation(); useHint(); }} onPointerDown={e => e.stopPropagation()} disabled={hintRemaining > 0}
                    style={{ position: 'absolute', left: 10, bottom: 10, padding: '7px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 13, cursor: hintRemaining > 0 ? 'default' : 'pointer', opacity: hintRemaining > 0 ? 0.55 : 1 }}>
                    {hintRemaining > 0 ? `${stage.hintLabel || '💡 Hint'} (${Math.ceil(hintRemaining / 1000)})` : (stage.hintLabel || '💡 Hint')}
                </button>
            )}
        </div>
    );
};

export default HiddenObjectGameSurface;
