import { VNID } from '../../../types';
import { VNProject } from '../../../types/project';
import { VNMiniGameConfig, VNMiniGameStage, VNMiniGameMessage } from '../../../types/miniGames';

/** Where a feedback flash should appear, as % of the play surface (QTE passes the tapped target's
 *  position so the flash lands on it; other surfaces omit it → the flash centers). */
export interface FeedbackPos { x: number; y: number; }

/**
 * Context handed to every mini-game stage surface by MiniGameFrame.
 * The SAME components render inside the editor's live preview (isEditorPreview) and the
 * running engine — MapSurface-style parity: what the author sees is what players get.
 * NOTE: engine module — keep i18n-free (author-typed strings render verbatim).
 */
export interface MiniGameRenderCtx {
    /** The ACTIVE stage's config (the frame runs the stage sequencer). */
    stage: VNMiniGameStage;
    game: VNMiniGameConfig;
    project: VNProject;
    variables: Record<VNID, string | number | boolean>;
    assetResolver: (id: VNID | null, type: 'audio' | 'video' | 'image') => string | null;
    /** Small interaction sound (already resolved to the game's interact SFX by the frame). */
    playInteractSound: () => void;
    /** Play any audio asset by id (per-stage sounds like memory's match SFX). */
    playSound: (id: import('../../../types').VNID | null) => void;
    /** The stage is complete. The frame sequences to the next stage — or wins the game. */
    reportWin: () => void;
    /** The player made a wrong move (failed pair, miss-tap, missed prompt…). Counts against
     *  the game's mistakeLimit when one is set; drives the reacting character's MISS expression
     *  and the score's miss count, and flashes the stage's on-screen miss feedback. Optional
     *  per-item expression + feedback overrides, and a position for where the flash lands. */
    reportMistake: (expressionOverrideId?: VNID | null, feedbackOverride?: VNMiniGameMessage | null, pos?: FeedbackPos) => void;
    /** The player made a CORRECT move (caught a QTE prompt, matched a pair, found an object…).
     *  Drives the reacting character's HIT expression, the score's hit count, and the stage's
     *  on-screen hit feedback. Optional per-item expression + feedback overrides + flash position. */
    reportHit: (expressionOverrideId?: VNID | null, feedbackOverride?: VNMiniGameMessage | null, pos?: FeedbackPos) => void;
    /** Swap the play-surface backdrop (per-prompt background change). null = the game default. */
    setBackground: (imageId: import('../../../types').VNID | null) => void;
    /** Hard fail regardless of mistakeLimit (QTE's onMiss:'fail'). Runs the game's fail exit. */
    reportFail: () => void;
    /** Optional 0–1 progress for the frame's progress readout. */
    reportProgress?: (fraction: number) => void;
    /** Coloring surfaces report the color left in each named slot (paint regions / assemble
     *  pieces with a colorSlot). The frame accumulates them across stages; on win they feed
     *  the game's palette→UI mapping + {slot} variables. Merge semantics (last write wins). */
    reportColors?: (slots: Record<string, string>) => void;
    isEditorPreview?: boolean;
}

export interface MiniGameDef {
    /** Short human label for stubs/editor badges (English by design — engine is i18n-free). */
    label: string;
    /** Component rendering the stage's play surface (typed loosely — no @types/react in this repo). */
    Surface: (props: { ctx: MiniGameRenderCtx }) => any;
}
