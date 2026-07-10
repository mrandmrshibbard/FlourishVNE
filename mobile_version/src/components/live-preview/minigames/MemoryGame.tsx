import React, { useEffect, useMemo, useRef, useState } from 'react';
import { VNMemoryStage } from '../../../types/miniGames';
import { MiniGameRenderCtx } from './types';

/**
 * Memory match: N author faces → 2N shuffled cards; find every pair.
 *
 * Rules of the surface: input LOCKS while a failed pair flips back (flipBackDelayMs), matched
 * pairs stay face-up, and the stage is won when every pair is matched. Faces with no image get
 * a numbered placeholder so a half-configured game is still playable in the editor preview.
 * Card geometry is computed from the measured host (cards shrink to always fit — no scrolling
 * mid-game on any screen).
 */

const CARD_ASPECT = 4 / 3; // height / width

export const MemoryGameSurface: React.FC<{ ctx: MiniGameRenderCtx }> = ({ ctx }) => {
    const stage = ctx.stage as VNMemoryStage;
    const faces = stage.faces || [];

    const hostRef = useRef<HTMLDivElement>(null);
    const [host, setHost] = useState({ w: 0, h: 0 });
    const [flipped, setFlipped] = useState<number[]>([]);
    const [matched, setMatched] = useState<Set<number>>(new Set());
    const lockRef = useRef(false);
    const timerRef = useRef<number | null>(null);
    const wonRef = useRef(false);

    // Shuffled deck: two cards per face, keyed by card index. Reshuffles only when the stage
    // remounts (the frame keys the surface by stage id).
    const deck = useMemo(() => {
        const cards = faces.flatMap((f, fi) => [{ faceId: f.id, faceIndex: fi }, { faceId: f.id, faceIndex: fi }]);
        for (let i = cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }
        return cards;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage.id]);

    useEffect(() => {
        const el = hostRef.current;
        if (!el) return;
        const obs = new ResizeObserver(() => setHost({ w: el.clientWidth, h: el.clientHeight }));
        obs.observe(el);
        setHost({ w: el.clientWidth, h: el.clientHeight });
        return () => obs.disconnect();
    }, []);

    useEffect(() => () => { if (timerRef.current != null) clearTimeout(timerRef.current); }, []);

    const backUrl = stage.cardBackImageId ? ctx.assetResolver(stage.cardBackImageId, 'image') : null;

    // Half-configured game (no faces): never brick — tap through.
    if (!faces.length) {
        return (
            <button onClick={() => ctx.reportWin()} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.85)', fontSize: 15 }}>
                <span style={{ fontSize: 32 }}>🃏</span>
                <span>No card faces yet — add them in the Mini Games tab.</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Tap to continue</span>
            </button>
        );
    }

    const count = deck.length;
    const cols = Math.min(count, Math.max(2, stage.cols || Math.ceil(Math.sqrt(count))));
    const rows = Math.ceil(count / cols);
    const gap = 8;
    const cardW = host.w && host.h
        ? Math.max(24, Math.min((host.w - (cols - 1) * gap) / cols, ((host.h - (rows - 1) * gap) / rows) / CARD_ASPECT))
        : 0;
    const cardH = cardW * CARD_ASPECT;

    const tap = (idx: number) => {
        if (lockRef.current || wonRef.current || matched.has(idx) || flipped.includes(idx)) return;
        ctx.playInteractSound();
        const next = [...flipped, idx];
        setFlipped(next);
        if (next.length < 2) return;
        const [a, b] = next;
        if (deck[a].faceId === deck[b].faceId) {
            ctx.playSound(stage.matchSfxId ?? null);
            ctx.reportHit(); // a correct move — counts a hit + drives the reacting character
            const m = new Set(matched); m.add(a); m.add(b);
            setMatched(m);
            setFlipped([]);
            ctx.reportProgress?.(m.size / count);
            if (m.size === count && !wonRef.current) {
                wonRef.current = true;
                timerRef.current = window.setTimeout(() => ctx.reportWin(), 450);
            }
        } else {
            ctx.reportMistake();
            lockRef.current = true;
            timerRef.current = window.setTimeout(() => {
                setFlipped([]);
                lockRef.current = false;
            }, Math.max(200, stage.flipBackDelayMs ?? 900));
        }
    };

    return (
        <div ref={hostRef} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${cardW}px)`, gridAutoRows: `${cardH}px`, gap }}>
                {deck.map((card, idx) => {
                    const up = matched.has(idx) || flipped.includes(idx);
                    const face = faces[card.faceIndex];
                    const faceUrl = face?.imageId ? ctx.assetResolver(face.imageId, 'image') : null;
                    return (
                        <button key={idx} onClick={() => tap(idx)}
                            style={{ position: 'relative', width: cardW, height: cardH, padding: 0, border: 'none', background: 'transparent', cursor: up ? 'default' : 'pointer', perspective: '600px', touchAction: 'manipulation' }}>
                            <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transition: 'transform 0.35s ease', transform: up ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                                {/* back */}
                                <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', borderRadius: Math.max(4, cardW * 0.08), overflow: 'hidden', border: '1px solid rgba(255,255,255,0.25)', background: backUrl ? undefined : 'linear-gradient(135deg,#334155,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {backUrl
                                        ? <img src={backUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                                        : <span style={{ fontSize: cardW * 0.4, opacity: 0.5 }}>✦</span>}
                                </div>
                                {/* face */}
                                <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderRadius: Math.max(4, cardW * 0.08), overflow: 'hidden', border: matched.has(idx) ? '2px solid rgba(52,211,153,0.9)' : '1px solid rgba(255,255,255,0.35)', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {faceUrl
                                        ? <img src={faceUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                                        : <span style={{ fontSize: cardW * 0.35, color: '#94a3b8' }}>{card.faceIndex + 1}</span>}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default MemoryGameSurface;
