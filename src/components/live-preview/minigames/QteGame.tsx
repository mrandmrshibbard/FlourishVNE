import React, { useEffect, useRef, useState } from 'react';
import { VNQteStage } from '../../../types/miniGames';
import { MiniGameRenderCtx } from './types';

/**
 * Sequence / quick-time events: one prompt at a time with a shrinking ring; hit it inside
 * its window. Key prompts listen on window keydown in the CAPTURE phase (beats the engine's
 * global advance handler); button prompts are pointer targets at xPct/yPct (center default).
 *
 * A miss counts a mistake (the game's mistakeLimit hearts). onMiss 'retry' restarts the
 * sequence from the top; 'fail' hard-fails the whole game (ctx.reportFail). The ring is
 * driven by rAF writing transforms straight to the DOM — no per-frame React state.
 */

type PromptPhase = 'active' | 'gap' | 'hitFlash' | 'missFlash';

/** Normalize a key value (stored config OR a live e.key) to a canonical, case-insensitive token,
 *  so arrow keys / space / friendly aliases all match regardless of how they were entered. */
const normKey = (raw: string): string => {
    const l = (raw || '').toLowerCase().trim();
    if (l === ' ' || l === 'space' || l === 'spacebar') return ' ';
    if (l === 'up' || l === 'arrowup') return 'arrowup';
    if (l === 'down' || l === 'arrowdown') return 'arrowdown';
    if (l === 'left' || l === 'arrowleft') return 'arrowleft';
    if (l === 'right' || l === 'arrowright') return 'arrowright';
    if (l === 'esc' || l === 'escape') return 'escape';
    if (l === 'return' || l === 'enter') return 'enter';
    return l;
};

/** Player-facing keycap label — arrows become glyphs, space/enter read as words. */
export const keyCapLabel = (raw?: string): string => {
    switch (normKey(raw || ' ')) {
        case ' ': return 'SPACE';
        case 'arrowup': return '↑';
        case 'arrowdown': return '↓';
        case 'arrowleft': return '←';
        case 'arrowright': return '→';
        case 'enter': return '⏎';
        case 'escape': return 'ESC';
        default: return (raw || '?').toUpperCase();
    }
};

export const QteGameSurface: React.FC<{ ctx: MiniGameRenderCtx }> = ({ ctx }) => {
    const stage = ctx.stage as VNQteStage;
    const prompts = stage.prompts || [];
    const gapMs = Math.max(0, stage.gapMs ?? 400);
    const onMiss = stage.onMiss || 'retry';
    const showPips = stage.showProgressPips !== false;

    const [idx, setIdx] = useState(0);
    const [phase, setPhase] = useState<PromptPhase>('gap');
    const doneRef = useRef(false);
    const idxRef = useRef(0);
    const phaseRef = useRef<PromptPhase>('gap');
    phaseRef.current = phase;
    idxRef.current = idx;

    const ringRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);
    const timerRef = useRef<number | null>(null);
    const deadlineRef = useRef(0);
    const windowMsRef = useRef(1500);

    const prompt = prompts[idx];

    const clearTimers = () => {
        if (timerRef.current != null) { clearTimeout(timerRef.current); timerRef.current = null; }
        if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };

    const schedule = (fn: () => void, ms: number) => {
        if (timerRef.current != null) clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(fn, ms);
    };

    /** Start prompt i: arm the deadline, animate the ring closing onto the target. */
    const startPrompt = (i: number) => {
        if (doneRef.current) return;
        const p = prompts[i];
        if (!p) return;
        const windowMs = Math.max(300, p.windowMs ?? 1500);
        windowMsRef.current = windowMs;
        deadlineRef.current = performance.now() + windowMs;
        // Per-prompt background swap (per-action background change). null-safe: undefined leaves it.
        if (p.bgImageId !== undefined) ctx.setBackground(p.bgImageId ?? null);
        setIdx(i); setPhase('active');
        const tick = () => {
            if (doneRef.current || phaseRef.current !== 'active' || idxRef.current !== i) return;
            const left = deadlineRef.current - performance.now();
            const ring = ringRef.current;
            if (ring) {
                const frac = Math.max(0, left / windowMsRef.current);
                ring.style.transform = `translate(-50%, -50%) scale(${1 + frac * 0.9})`;
                ring.style.opacity = String(0.35 + (1 - frac) * 0.65);
                ring.style.borderColor = frac < 0.25 ? '#ef4444' : '#facc15';
            }
            if (left <= 0) { miss(i); return; }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        // Backstop for the deadline as well (rAF pauses in background tabs).
        schedule(() => { if (!doneRef.current && phaseRef.current === 'active' && idxRef.current === i) miss(i); }, windowMs + 40);
    };

    const hit = (i: number) => {
        if (doneRef.current || phaseRef.current !== 'active' || idxRef.current !== i) return;
        clearTimers();
        ctx.playInteractSound();
        // counts a hit + drives the character + flashes hit feedback (per-tap override → stage default),
        // landed on the tapped target's position.
        ctx.reportHit(prompts[i]?.hitExpressionId ?? null, prompts[i]?.hitFeedback ?? null, { x: prompts[i]?.xPct ?? 50, y: prompts[i]?.yPct ?? 50 });
        setPhase('hitFlash');
        const isLast = i >= prompts.length - 1;
        schedule(() => {
            if (doneRef.current) return;
            if (isLast) { doneRef.current = true; ctx.reportWin(); return; }
            setPhase('gap');
            schedule(() => startPrompt(i + 1), gapMs);
        }, 160);
    };

    const miss = (i: number) => {
        if (doneRef.current || phaseRef.current !== 'active' || idxRef.current !== i) return;
        clearTimers();
        // counts a miss + drives the character + flashes miss feedback (per-tap override → stage default).
        ctx.reportMistake(prompts[i]?.missExpressionId ?? null, prompts[i]?.missFeedback ?? null, { x: prompts[i]?.xPct ?? 50, y: prompts[i]?.yPct ?? 50 });
        setPhase('missFlash');
        if (onMiss === 'fail') {
            doneRef.current = true;
            schedule(() => ctx.reportFail(), 350);
            return;
        }
        // 'retryPrompt' re-arms the SAME prompt (stay in place); 'retry' (default) restarts from the top.
        const restartIdx = onMiss === 'retryPrompt' ? i : 0;
        schedule(() => { if (!doneRef.current) { setPhase('gap'); schedule(() => startPrompt(restartIdx), Math.max(350, gapMs)); } }, 420);
    };

    // Kick off + cleanup (the frame remounts the surface per stage).
    useEffect(() => {
        if (!prompts.length) return;
        // Reset the done gate on (re)mount — StrictMode's dev double-invoke runs the cleanup
        // (which sets doneRef=true) between the two effect passes, which would otherwise leave
        // startPrompt permanently short-circuited and no prompt would ever appear.
        doneRef.current = false;
        schedule(() => startPrompt(0), 350);
        return () => { doneRef.current = true; clearTimers(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage.id]);

    // Key prompts: CAPTURE-phase window keydown beats the engine's global advance handler.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (doneRef.current || phaseRef.current !== 'active') return;
            const p = prompts[idxRef.current];
            if (!p || p.kind !== 'key') return;
            const want = normKey(p.key || ' ');
            const got = normKey(e.key);
            if (got === want) {
                e.preventDefault(); e.stopPropagation();
                hit(idxRef.current);
            }
        };
        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage.id]);

    if (!prompts.length) {
        return (
            <button onClick={() => ctx.reportWin()} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.85)', fontSize: 15 }}>
                <span style={{ fontSize: 32 }}>⚡</span>
                <span>No prompts yet — add them in the Mini Games tab.</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Tap to continue</span>
            </button>
        );
    }

    const px = prompt?.xPct ?? 50, py = prompt?.yPct ?? 50;
    const imgUrl = prompt?.imageId ? ctx.assetResolver(prompt.imageId, 'image') : null;
    const isKey = prompt?.kind === 'key';
    const keyLabel = isKey ? keyCapLabel(prompt.key) : '';
    const showTarget = phase === 'active' || phase === 'hitFlash' || phase === 'missFlash';
    // When the author set custom miss feedback (per-tap override → stage default), the frame flashes
    // it instead of our built-in "Try again! / From the top!" cue — so suppress the built-in text.
    const effMissFb = prompt?.missFeedback ?? stage.missFeedback;
    const customMissShown = !!effMissFb && effMissFb.enabled !== false && !!(effMissFb.text || effMissFb.imageId);

    return (
        <div style={{ position: 'absolute', inset: 0, touchAction: 'none', userSelect: 'none' }}>
            {/* self-contained keyframes (exported games don't depend on app CSS) */}
            <style>{'@keyframes mgQtePop{0%{transform:translate(-50%,-50%) scale(0.5);opacity:0}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}'}</style>

            {showTarget && prompt && (
                <div style={{ position: 'absolute', left: `${px}%`, top: `${py}%`, width: 0, height: 0 }}>
                    {/* shrinking ring (rAF-driven transforms) */}
                    {phase === 'active' && (
                        <div ref={ringRef} style={{
                            position: 'absolute', left: 0, top: 0, width: 108, height: 108, borderRadius: '50%',
                            border: '4px solid #facc15', transform: 'translate(-50%, -50%) scale(1.9)', opacity: 0.35,
                            pointerEvents: 'none', boxShadow: '0 0 14px rgba(250,204,21,0.35)',
                        }} />
                    )}
                    {/* the target itself */}
                    <button
                        onPointerDown={e => { e.preventDefault(); if (!isKey) hit(idxRef.current); }}
                        style={{
                            position: 'absolute', left: 0, top: 0, transform: 'translate(-50%, -50%)',
                            width: 88, height: 88, borderRadius: '50%', cursor: isKey ? 'default' : 'pointer',
                            border: `4px solid ${phase === 'hitFlash' ? '#34d399' : phase === 'missFlash' ? '#ef4444' : 'rgba(255,255,255,0.9)'}`,
                            background: imgUrl ? 'rgba(0,0,0,0.35)' : 'rgba(15,23,42,0.85)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                            color: '#fff', animation: 'mgQtePop 0.18s ease-out',
                            boxShadow: phase === 'hitFlash' ? '0 0 22px rgba(52,211,153,0.8)' : phase === 'missFlash' ? '0 0 22px rgba(239,68,68,0.8)' : '0 2px 12px rgba(0,0,0,0.6)',
                            touchAction: 'none',
                        }}>
                        {imgUrl
                            ? <img src={imgUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                            : isKey
                                ? <span style={{ fontSize: keyLabel.length > 2 ? 15 : 26, fontWeight: 800, letterSpacing: 1 }}>{keyLabel}</span>
                                : <span style={{ fontSize: prompt.label && prompt.label.length > 3 ? 14 : 22, fontWeight: 800, padding: '0 6px', textAlign: 'center', lineHeight: 1.15 }}>{prompt.label || '👆'}</span>}
                    </button>
                    {/* key prompts show a "press" hint under the keycap */}
                    {isKey && phase === 'active' && (
                        <div style={{ position: 'absolute', left: 0, top: 56, transform: 'translateX(-50%)', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.75)', fontSize: 12, textShadow: '0 1px 3px rgba(0,0,0,0.8)', pointerEvents: 'none' }}>
                            {prompt.label || 'Press the key!'}
                        </div>
                    )}
                    {phase === 'missFlash' && onMiss !== 'fail' && !customMissShown && (
                        <div style={{ position: 'absolute', left: 0, top: -68, transform: 'translateX(-50%)', whiteSpace: 'nowrap', color: '#fca5a5', fontSize: 15, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.8)', pointerEvents: 'none' }}>
                            ↺ {onMiss === 'retryPrompt' ? 'Try again!' : 'From the top!'}
                        </div>
                    )}
                </div>
            )}

            {/* progress pips */}
            {showPips && prompts.length > 1 && (
                <div style={{ position: 'absolute', left: '50%', bottom: 8, transform: 'translateX(-50%)', display: 'flex', gap: 7, pointerEvents: 'none' }}>
                    {prompts.map((p, i) => {
                        const done = i < idx || (i === idx && (phase === 'hitFlash' && i === prompts.length - 1));
                        const current = i === idx && phase !== 'gap';
                        return (
                            <span key={p.id} style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: done ? '#34d399' : current ? '#facc15' : 'rgba(255,255,255,0.25)',
                                boxShadow: current ? '0 0 8px rgba(250,204,21,0.7)' : undefined,
                                transition: 'background 0.2s',
                            }} />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default QteGameSurface;
