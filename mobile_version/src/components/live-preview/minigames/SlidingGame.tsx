import React, { useEffect, useMemo, useRef, useState } from 'react';
import { VNSlidingStage } from '../../../types/miniGames';
import { MiniGameRenderCtx } from './types';
import { useImageBox } from './useImageBox';
import { sliceCellStyle } from './sliceStyles';

/**
 * Sliding puzzle: the image auto-slices into an N×N grid with one blank; tap a tile next to
 * the blank to slide it (tap-only by design — identical on touch). The scramble applies
 * `shuffleMoves` LEGAL random moves from the solved state, so every board is solvable with
 * no parity math. Solving fades the blank's cell back in to complete the picture.
 *
 * Non-adjacent taps are ignored, not mistakes — there is no wrong move in a sliding puzzle.
 */

export const SlidingGameSurface: React.FC<{ ctx: MiniGameRenderCtx }> = ({ ctx }) => {
    const stage = ctx.stage as VNSlidingStage;
    const url = stage.imageId ? ctx.assetResolver(stage.imageId, 'image') : null;
    const n = Math.max(3, Math.min(5, stage.gridSize || 3));
    const cellCount = n * n;
    const blankTile = cellCount - 1;

    const hostRef = useRef<HTMLDivElement>(null);
    const box = useImageBox(hostRef, url);
    const [won, setWon] = useState(false);
    const wonRef = useRef(false);
    const timerRef = useRef<number | null>(null);

    // pos[tile] = cell it currently occupies. Scrambled once per stage mount via legal moves
    // (never undoing the previous move, so the walk actually wanders).
    const initialPos = useMemo(() => {
        const pos = Array.from({ length: cellCount }, (_, i) => i);
        const cellOf = (tile: number) => pos[tile];
        const tileAt = (cell: number) => pos.indexOf(cell);
        let prevBlankCell = -1;
        const moves = Math.max(10, stage.shuffleMoves ?? 80);
        for (let m = 0; m < moves; m++) {
            const b = cellOf(blankTile);
            const r = Math.floor(b / n), c = b % n;
            const neighbors = [
                r > 0 ? b - n : -1, r < n - 1 ? b + n : -1,
                c > 0 ? b - 1 : -1, c < n - 1 ? b + 1 : -1,
            ].filter(x => x >= 0 && x !== prevBlankCell);
            const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
            const t = tileAt(pick);
            pos[t] = b;
            pos[blankTile] = pick;
            prevBlankCell = b;
        }
        // A scramble that happens to land solved would win instantly — nudge it once.
        if (pos.every((cell, tile) => cell === tile)) {
            const b = pos[blankTile];
            const swap = b % n > 0 ? b - 1 : b + 1;
            const t = pos.indexOf(swap);
            pos[t] = b; pos[blankTile] = swap;
        }
        return pos;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage.id, n]);
    const [pos, setPos] = useState<number[]>(initialPos);

    useEffect(() => () => { if (timerRef.current != null) clearTimeout(timerRef.current); }, []);

    if (!url) {
        return (
            <button onClick={() => ctx.reportWin()} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.85)', fontSize: 15 }}>
                <span style={{ fontSize: 32 }}>🔢</span>
                <span>No puzzle image yet — pick one in the Mini Games tab.</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Tap to continue</span>
            </button>
        );
    }

    const tap = (tile: number) => {
        if (wonRef.current || won) return;
        const cell = pos[tile], blank = pos[blankTile];
        const sameRow = Math.floor(cell / n) === Math.floor(blank / n) && Math.abs(cell - blank) === 1;
        const sameCol = cell % n === blank % n && Math.abs(cell - blank) === n;
        if (!sameRow && !sameCol) return;
        ctx.playInteractSound();
        const next = [...pos];
        next[tile] = blank;
        next[blankTile] = cell;
        setPos(next);
        const correct = next.reduce((acc, c, t) => acc + (c === t ? 1 : 0), 0);
        ctx.reportProgress?.(correct / cellCount);
        if (next.every((c, t) => c === t)) {
            wonRef.current = true;
            setWon(true);
            timerRef.current = window.setTimeout(() => ctx.reportWin(), 650);
        }
    };

    const cellPct = 100 / n;
    const gapPx = 2;

    return (
        <div ref={hostRef} style={{ position: 'absolute', inset: 0 }}>
            {/* Board = the contain-fit image box */}
            <div style={{ position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height, background: 'rgba(0,0,0,0.45)', borderRadius: 6, overflow: 'hidden' }}>
                {Array.from({ length: cellCount }, (_, tile) => {
                    if (tile === blankTile && !won) return null;
                    const cell = pos[tile];
                    const col = tile % n, row = Math.floor(tile / n);
                    return (
                        <button key={tile} onClick={() => tap(tile)}
                            style={{
                                position: 'absolute',
                                left: `${(cell % n) * cellPct}%`, top: `${Math.floor(cell / n) * cellPct}%`,
                                width: `${cellPct}%`, height: `${cellPct}%`,
                                padding: 0, border: 'none', cursor: won ? 'default' : 'pointer',
                                transition: 'left 0.16s ease, top 0.16s ease, opacity 0.4s ease',
                                boxSizing: 'border-box',
                                boxShadow: won ? 'none' : `inset 0 0 0 ${gapPx}px rgba(0,0,0,0.55)`,
                                touchAction: 'manipulation',
                                ...(tile === blankTile ? { opacity: won ? 1 : 0, animation: 'fade-in 0.5s ease-out' } : {}),
                                ...sliceCellStyle(url, n, n, col, row),
                            }}>
                            {stage.showNumbers && !won && tile !== blankTile && (
                                <span style={{ position: 'absolute', left: 4, top: 2, fontSize: 'max(11px, 1.6vmin)', fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>{tile + 1}</span>
                            )}
                        </button>
                    );
                })}
            </div>
            {/* Solved-picture reference */}
            {stage.showReference !== false && !won && (
                <img src={url} alt="" draggable={false}
                    style={{ position: 'absolute', top: 6, left: 6, width: '16%', maxHeight: '22%', objectFit: 'contain', borderRadius: 4, border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 2px 8px rgba(0,0,0,0.6)', pointerEvents: 'none', opacity: 0.9 }} />
            )}
        </div>
    );
};

export default SlidingGameSurface;
