import React from 'react';
import { VNMiniGameStageType } from '../../../types/miniGames';
import { MiniGameDef, MiniGameRenderCtx } from './types';
import WipeGameSurface from './WipeGame';
import MemoryGameSurface from './MemoryGame';
import HiddenObjectGameSurface from './HiddenObjectGame';
import SlidingGameSurface from './SlidingGame';
import AssembleGameSurface from './AssembleGame';
import PaintGameSurface from './PaintGame';
import QteGameSurface from './QteGame';

/**
 * Stage-type registry (PHONE_APPS pattern): MiniGameFrame renders
 * `MINI_GAMES[stage.stageType].Surface`. Types that aren't built yet get a stub surface
 * that lets the player tap through — an unknown/unbuilt stage must never brick a
 * playthrough (e.g. an old exported engine running a newer project).
 */

const StubSurface: React.FC<{ ctx: MiniGameRenderCtx }> = ({ ctx }) => (
    <button
        onClick={() => ctx.reportWin()}
        style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
            color: 'rgba(255,255,255,0.85)', fontSize: 15,
        }}
    >
        <span style={{ fontSize: 32 }}>🚧</span>
        <span>This mini game isn't available in this version.</span>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Tap to continue</span>
    </button>
);

const stub = (label: string): MiniGameDef => ({ label, Surface: StubSurface });

export const MINI_GAMES: Record<VNMiniGameStageType, MiniGameDef> = {
    wipe: { label: 'Wipe away', Surface: WipeGameSurface },
    assemble: { label: 'Assemble the pieces', Surface: AssembleGameSurface },
    paint: { label: 'Painting', Surface: PaintGameSurface },
    memory: { label: 'Memory match', Surface: MemoryGameSurface },
    hidden: { label: 'Hidden objects', Surface: HiddenObjectGameSurface },
    sliding: { label: 'Sliding puzzle', Surface: SlidingGameSurface },
    qte: { label: 'Quick taps', Surface: QteGameSurface },
};

/** Unknown stage types (projects newer than this engine) also resolve to a playable stub. */
export function resolveMiniGameDef(stageType: string): MiniGameDef {
    return (MINI_GAMES as any)[stageType] || stub('Mini game');
}
