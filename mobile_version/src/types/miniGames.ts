import { VNID } from './';
import { VNUIAction } from './shared';

/**
 * Mini Games — author-built playable overlays (Show Mini Game command / button action).
 *
 * A mini game is a SEQUENCE OF STAGES so authors can mix mechanics ("wipe the dust →
 * assemble the pieces → paint them"); a single-mechanic game is simply stages.length === 1.
 * Winning the LAST stage wins the game (runs winActions); Skip and the time limit are
 * GAME-level and span all stages. Everything here is additive-optional — old projects
 * load unchanged (`project.miniGames || {}`), and mini-game progress is deliberately
 * TRANSIENT (never serialized into saves; a save taken mid-game re-presents the paused
 * Show Mini Game command on load, exactly like Show Map).
 */

export type VNMiniGameStageType = 'wipe' | 'assemble' | 'paint' | 'memory' | 'hidden' | 'sliding' | 'qte';

/** A named color scheme (Art Studio swatches; offered to paint/coloring stages; the palette a
 *  player picks can later restyle the in-game UI). Lives at project.artPalettes. */
export interface VNArtPalette {
    id: VNID;
    name: string;
    colors: string[];
}

/** Fields shared by every stage regardless of mechanic. */
export interface VNMiniGameStageBase {
    id: VNID;
    stageType: VNMiniGameStageType;
    /** Shown when this stage begins (each stage may re-instruct: "Now assemble the pieces!"). */
    instructions?: string;
    /** Per-stage ✓ sound when the stage is completed (falls back to the game's interact SFX). */
    stageWinSfxId?: VNID | null;
    /** Custom player cursor while this stage runs — rendered as a pointer-following sprite
     *  (not a CSS cursor: no browser size cap, and it doubles as touch feedback on mobile). */
    cursorImageId?: VNID | null;
    /** Cursor sprite size as % of the stage's smaller dimension (default 6). */
    cursorSizePct?: number;
    /** Between-stage cutscene: shown AFTER this stage completes, before the next begins (or, on
     *  the last stage, before the win banner) — a tap-to-continue beat for leveled mini games.
     *  Absent = the plain ✓ beat. All additive-optional. */
    cutscene?: VNMiniGameCutscene;
    /** On-screen feedback flashed when the player makes a CORRECT (hitFeedback) or WRONG
     *  (missFeedback) move in this stage — a caught QTE tap, a matched pair, a found object /
     *  a miss-tap. Reuses the win/lose message config so it's EQUALLY customizable (own text +
     *  {variable} interpolation + custom art + font/color/panel/entrance/duration). Absent =
     *  the surface's built-in cue (e.g. QTE's "Try again!"); a per-tap override can replace it. */
    hitFeedback?: VNMiniGameMessage;
    missFeedback?: VNMiniGameMessage;
}

/** A between-stage story beat (reuses the intro-splash presentation). */
export interface VNMiniGameCutscene {
    text?: string;                 // supports {variable} interpolation
    imageId?: VNID | null;         // art shown above the text
    characterId?: VNID | null;     // optional character sprite alongside
    expressionId?: VNID | null;
    backgroundColor?: string;      // scrim behind the beat (default a dark scrim)
    /** Auto-advance after this many ms; 0/absent = wait for a tap. */
    durationMs?: number;
}

/** Wipe-away reveal: scrub off a cover (color / image / frost) to expose what's underneath. */
export interface VNWipeStage extends VNMiniGameStageBase {
    stageType: 'wipe';
    /** Image revealed under the cover. Null/absent = transparent — the running scene shows through. */
    revealImageId?: VNID | null;
    coverType?: 'color' | 'image' | 'frost';
    /** Cover fill when coverType is 'color' (default '#9ca3af'). */
    coverColor?: string;
    /** Cover art when coverType is 'image' (dust, fog art, a curtain…). */
    coverImageId?: VNID | null;
    /** Where the cover exists. Absent = the whole surface. When set (an alpha-mask image the
     *  author airbrushes in the editor), the cover is clipped to the drawn area — e.g. one
     *  grimy smudge on a window — and the win % counts only that drawn area. */
    coverMaskImageId?: VNID | null;
    /** Brush look while scrubbing. 'custom' stamps the author's own PNG. */
    brushStyle?: 'softRound' | 'hardRound' | 'scratch' | 'sponge' | 'custom';
    /** Brush diameter as % of the stage's smaller dimension, 4–25 (default 10). */
    brushSize?: number;
    customBrushImageId?: VNID | null;
    /** % of the cover that must be cleared to win (default 70). */
    winRevealPercent?: number;
    /** Fade out whatever cover remains once the target % is reached (default true). */
    autoClearOnWin?: boolean;
}

/** Memory match: N face images → 2N shuffled cards; find every pair. */
export interface VNMemoryStage extends VNMiniGameStageBase {
    stageType: 'memory';
    faces: { id: VNID; imageId: VNID | null }[];
    /** Card back art; absent = a generated patterned back. */
    cardBackImageId?: VNID | null;
    /** Grid columns; absent = auto from the card count. */
    cols?: number;
    /** How long a failed pair stays face-up before flipping back (default 900). */
    flipBackDelayMs?: number;
    matchSfxId?: VNID | null;
}

/** Hidden object: find every hotspot in a busy scene image. */
export interface VNHiddenObjectStage extends VNMiniGameStageBase {
    stageType: 'hidden';
    sceneImageId: VNID | null;
    /** Positions/sizes are % of the IMAGE box (contain-fit both in editor and runtime). */
    hotspots: { id: VNID; name?: string; shape: 'circle' | 'rect'; x: number; y: number; w: number; h: number; foundImageId?: VNID | null }[];
    showFoundMarkers?: boolean;   // default true
    showCounter?: boolean;        // default true
    hintButton?: boolean;
    hintLabel?: string;
    hintCooldownSec?: number;
}

/** Sliding puzzle: an image auto-sliced into an N×N grid with one blank; restore the picture. */
export interface VNSlidingStage extends VNMiniGameStageBase {
    stageType: 'sliding';
    imageId: VNID | null;
    gridSize?: 3 | 4 | 5;         // default 3
    showNumbers?: boolean;
    showReference?: boolean;      // small solved thumbnail, default true
    /** Scramble depth — applied as LEGAL random moves so the puzzle is always solvable (default 80). */
    shuffleMoves?: number;
}

/** Build & Color: an assemble stage can ALSO be colorable — the same object gets built and
 *  then (or while, `freeOrder`) painted with the player's palette picks. All additive. */
export interface VNAssembleColoring {
    enabled?: boolean;
    /** true = pieces are colorable as soon as they're placed (color while building);
     *  false/absent = coloring unlocks once EVERYTHING is assembled (guided two-step). */
    freeOrder?: boolean;
    /** Inline color schemes offered to the player. */
    palettes?: { id: VNID; name: string; colors: string[] }[];
    /** ALSO offer these project.artPalettes (Art Studio) schemes. */
    paletteIds?: VNID[];
    /** 'multiply' keeps the piece art's shading; 'replace' paints flat color. */
    tintMode?: 'multiply' | 'replace';
    /** True (default) = every piece must be colored to win; false = a Done button appears
     *  once everything is assembled. */
    requireAllColored?: boolean;
    /** Let the player PAINT strokes too (clipped to the piece under the brush). */
    allowBrush?: boolean;
    /** Player brush diameter as % of the stage's smaller dimension (default 7). */
    brushSizePct?: number;
}

/** Assemble-from-pieces: drag pieces from a tray onto their target spots. */
export interface VNAssembleStage extends VNMiniGameStageBase {
    stageType: 'assemble';
    /** Optional board/backdrop art the pieces land on. */
    baseImageId?: VNID | null;
    /** 'pieces' = author-provided piece images + targets; 'slice' = auto-slice one image. */
    sourceMode?: 'pieces' | 'slice';
    /** `colorSlot` names a piece for palette→UI capture (see VNPaintStage.regions). */
    pieces?: { id: VNID; name?: string; imageId: VNID | null; target: { x: number; y: number; w: number; h: number }; showGhost?: boolean; colorSlot?: string }[];
    sliceImageId?: VNID | null;
    sliceCols?: number;
    sliceRows?: number;
    /** Snap distance (piece center → target center) as % of the stage width (default 8). */
    snapTolerancePct?: number;
    trayPosition?: 'bottom' | 'right';
    /** Build & Color workshop: make the assembled object colorable too. */
    coloring?: VNAssembleColoring;
}

/** Painting/coloring: tap a swatch, then tap a region to fill it. Mask-driven (no flood fill). */
export interface VNPaintStage extends VNMiniGameStageBase {
    stageType: 'paint';
    baseImageId: VNID | null;
    /** A region is either a mask PNG (white-on-transparent, made in the Art Studio) or a plain
     *  shape. `colorSlot` names the region for palette→UI capture ({slot} variables + the
     *  game's paletteToUi mapping pick up the color the player leaves it with). */
    regions: { id: VNID; name?: string; maskImageId?: VNID | null; shape?: 'rect' | 'ellipse'; x?: number; y?: number; w?: number; h?: number; colorSlot?: string }[];
    /** Color schemes offered to the player (shares project.artPalettes entries when picked there). */
    palettes: { id: VNID; name: string; colors: string[] }[];
    /** ALSO offer these project.artPalettes (Art Studio) schemes — additive to inline palettes. */
    paletteIds?: VNID[];
    /** 'multiply' keeps the base art's shading; 'replace' paints flat color. */
    tintMode?: 'multiply' | 'replace';
    /** True (default) = every region must be painted to win; false = a Done button ends the stage. */
    requireAllRegions?: boolean;
    /** Let the player PAINT strokes too (clipped to the region under the brush), not just tap-fill. */
    allowBrush?: boolean;
    /** Player brush diameter as % of the stage's smaller dimension (default 7). */
    brushSizePct?: number;
}

/** Sequence / quick-time events: hit each prompt inside its shrinking time window.
 *  Per-prompt reactions/background (additive): when a prompt is active it can swap the play
 *  backdrop (`bgImageId`) and, on hit/miss, drive the game's reacting character to a specific
 *  expression (`hitExpressionId`/`missExpressionId`, overriding the character's defaults). */
export interface VNQteStage extends VNMiniGameStageBase {
    stageType: 'qte';
    prompts: {
        id: VNID; kind: 'key' | 'button'; key?: string; label?: string; imageId?: VNID | null;
        windowMs?: number; xPct?: number; yPct?: number;
        /** Character expression to show when THIS prompt is hit / missed (overrides the game defaults). */
        hitExpressionId?: VNID | null;
        missExpressionId?: VNID | null;
        /** Per-tap OVERRIDE of the stage's on-screen hit/miss feedback (message + art). Absent = the
         *  stage default (VNMiniGameStageBase.hitFeedback/missFeedback), then the built-in cue. */
        hitFeedback?: VNMiniGameMessage;
        missFeedback?: VNMiniGameMessage;
        /** Swap the play-surface backdrop while this prompt is active (per-action background change). */
        bgImageId?: VNID | null;
    }[];
    /** Pause between prompts (default 400). */
    gapMs?: number;
    /** What a missed prompt does: 'retry' (default) = restart the whole prompt sequence from the
     *  top; 'retryPrompt' = re-arm just the SAME prompt (stay in place, keep earlier progress);
     *  'fail' = the game's fail exit fires. A miss still counts a mistake either way (mistakeLimit). */
    onMiss?: 'retry' | 'retryPrompt' | 'fail';
    showProgressPips?: boolean;   // default true
}

export type VNMiniGameStage =
    | VNWipeStage | VNMemoryStage | VNHiddenObjectStage | VNSlidingStage
    | VNAssembleStage | VNPaintStage | VNQteStage;

/** Customizable end-of-game banner. Absent = the built-in ✓ beat; `enabled:false` = no banner
 *  at all (the exit runs right away). Everything is optional-additive. */
export interface VNMiniGameMessage {
    /** false = show nothing on win (skip the beat entirely). Default true. */
    enabled?: boolean;
    /** Banner text — supports {variable} interpolation at runtime. */
    text?: string;
    /** Optional art shown above the text (sticker, stamp, trophy…). */
    imageId?: VNID | null;
    fontFamily?: string;
    /** Px (same raw-px convention as the rest of the mini-game chrome). Default 48. */
    fontSize?: number;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    /** Rounded panel behind the message; '' /absent = no panel. Any CSS color. */
    panelColor?: string;
    /** How long the banner shows before the win exit runs (ms, default 1200). */
    durationMs?: number;
    animation?: 'pop' | 'fade' | 'none';
    /** Dim the play surface behind the banner (default true). */
    dimBackground?: boolean;
}

/** In-game UI surfaces a captured color slot can restyle (palette→UI). */
export type VNUiPaletteTarget =
    | 'dialogueBg' | 'dialogueBorder' | 'dialogueText' | 'dialogueName'
    | 'choiceBg' | 'choiceBorder' | 'choiceText';

/** One slot→target wire: "whatever color the player left in `slot` becomes `target`". */
export interface VNPaletteToUiEntry {
    /** A colorSlot named on a paint region / assemble piece. */
    slot: string;
    target: VNUiPaletteTarget;
}

/** A character that REACTS while the mini game plays (idle → hit/miss → win/fail). General:
 *  any mini game can show one; QTE and memory drive hit/miss, all games drive win/fail.
 *  Reuses a project Character's expressions (assetResolver renders the sprite). Additive. */
export interface VNMiniGameCharacter {
    characterId: VNID;
    /** Placement as % of the play surface (x/y = top-left of the sprite box; size = % of height). */
    x?: number; y?: number; size?: number;
    flipX?: boolean;
    /** Expression per reaction state (falls back to the character's first expression / idle). */
    idleExpressionId?: VNID | null;
    hitExpressionId?: VNID | null;
    missExpressionId?: VNID | null;
    winExpressionId?: VNID | null;
    failExpressionId?: VNID | null;
    /** How long a hit/miss reaction holds before returning to idle (ms, default 500). */
    reactMs?: number;
}

/** Score export + performance-based outcomes. On finish the frame counts hits (correct moves)
 *  and misses (wrong moves) across the whole game → accuracy %. The named variables receive the
 *  final numbers (like palette→UI slots), and on a WIN the best matching tier's actions run after
 *  winActions ("do well → this scene, poorly → that one"). All additive-optional. */
export interface VNMiniGameScore {
    hitsVariableId?: VNID | null;
    missesVariableId?: VNID | null;
    accuracyVariableId?: VNID | null;   // 0–100
    /** Outcome tiers, evaluated best-first: the highest tier whose minAccuracy ≤ accuracy wins
     *  and its actions run (in addition to the game's winActions). */
    tiers?: { id: VNID; name: string; minAccuracy: number; actions: VNUIAction[]; message?: VNMiniGameMessage }[];
}

/** One authored mini game (project.miniGames). */
export interface VNMiniGameConfig {
    id: VNID;
    name: string;
    /** Big heading shown above the play surface. */
    title?: string;
    /** Game-level instruction line (each stage can add its own). */
    instructions?: string;
    /** When set, a tap-to-start splash shows this text first — the timer starts after the tap. */
    introText?: string;
    /** Backdrop behind the play surface (default rgba(0,0,0,0.75) scrim over the scene). */
    backgroundColor?: string;
    backgroundImage?: VNID | null;
    /** Font applied to ALL of this game's on-screen text (title, instructions, stage labels, QTE
     *  target text/keycaps, cutscenes, Skip button, progress readouts…) — pick a project custom
     *  font (imported .ttf) or a generic family. Individual messages can still override it. The
     *  runtime loads project.fonts via FontFace, so it works in test-play AND exported games.
     *  Absent = the editor/app default font. Additive-optional. */
    fontFamily?: string;
    /** Ordered stages; ≥1. Winning the last stage wins the game. */
    stages: VNMiniGameStage[];
    /** Optional character that reacts to hits/misses/win/fail while playing (general). */
    character?: VNMiniGameCharacter;
    /** Optional score export + performance-based outcome tiers. */
    score?: VNMiniGameScore;
    /** Runs when the game is WON. */
    winActions: VNUIAction[];
    /** Palette→UI: on win, colors the player left in named slots restyle the in-game UI
     *  (dialogue box, choice buttons) via playerState.uiPaletteOverride, and every captured
     *  slot is ALSO written to a same-named string variable ({slot} interpolation). */
    paletteToUi?: VNPaletteToUiEntry[];
    /** Optional custom win banner (absent = the default ✓ beat; enabled:false = none). */
    winMessage?: VNMiniGameMessage;
    /** Optional Skip button — skips the whole game and runs its own actions. */
    skippable?: boolean;
    skipLabel?: string;
    skipActions?: VNUIAction[];
    /** Optional single time limit spanning ALL stages; expiry runs failActions. */
    timeLimitSec?: number;
    showTimer?: boolean;
    /** Optional mistake allowance spanning ALL stages: wrong moves (a failed memory pair, a
     *  hidden-object miss-tap, a QTE miss…) use up tries; running out runs failActions.
     *  0/absent = mistakes are free. */
    mistakeLimit?: number;
    /** Show remaining tries as hearts (default true when mistakeLimit is set). */
    showMistakes?: boolean;
    /** When true, the try counter refills at the start of each stage ("3 tries per puzzle")
     *  instead of one pool spanning the whole game. */
    mistakesPerStage?: boolean;
    /** What happens when the player WOULD lose (time up / out of tries / a hard QTE miss):
     *  'end' (default) runs failActions and closes; 'retry' restarts instead — a "keep trying"
     *  gate that never game-overs (unlimited fails). Additive-optional. */
    failMode?: 'end' | 'retry';
    /** For failMode 'retry': restart the whole game from stage 1 (default 'game') or just re-play
     *  the current stage, keeping earlier stages cleared ('stage'). */
    retryScope?: 'game' | 'stage';
    /** Runs when the game is LOST (time up OR out of tries). Ignored when failMode is 'retry'. */
    failActions?: VNUIAction[];
    /** Optional custom lose banner (absent = the default ⏰/✖ beat; enabled:false = none). */
    failMessage?: VNMiniGameMessage;
    winSfxId?: VNID | null;
    failSfxId?: VNID | null;
    /** Small tick/pop for taps, matches, snaps… (stages may override their ✓ sound). */
    interactSfxId?: VNID | null;
}
