import React, { useEffect, useRef, useState } from 'react';
import { VNID } from '../../../types';
import { VNProject } from '../../../types/project';
import { VNMiniGameConfig, VNMiniGameMessage } from '../../../types/miniGames';
import { MiniGameRenderCtx, FeedbackPos } from './types';
import { resolveMiniGameDef } from './registry';
import { interpolateVariables } from '../../../utils/variableInterpolation';
import { resolveFieldUrl } from '../../../utils/assetStore';
import { cssFontFamily } from '../../../utils/styleUtils';

/** Compose a project character's sprite for a given expression → stacked image URLs
 *  (base image, then each configured layer asset). Used by the reacting-character overlay. */
function characterExpressionUrls(project: VNProject, characterId: VNID, expressionId: VNID | null): string[] {
    const ch: any = (project.characters as any)?.[characterId];
    if (!ch) return [];
    const urls: string[] = [];
    if (ch.baseImageUrl) urls.push(resolveFieldUrl(project.id, ch.baseImageUrl) || ch.baseImageUrl);
    const expr = expressionId ? ch.expressions?.[expressionId] : Object.values(ch.expressions || {})[0];
    const cfg = (expr as any)?.layerConfiguration;
    if (cfg) {
        for (const layerId of Object.keys(cfg)) {
            const assetId = cfg[layerId];
            if (!assetId) continue;
            const asset = ch.layers?.[layerId]?.assets?.[assetId];
            if (asset?.imageUrl) urls.push(resolveFieldUrl(project.id, asset.imageUrl) || asset.imageUrl);
        }
    }
    return urls;
}

/** Shared renderer for a VNMiniGameMessage's content — art + styled text + optional rounded panel.
 *  Used by BOTH the win/lose banner AND the transient hit/miss feedback flash, so all four are
 *  styled from the exact same config (that's what makes them "equally customizable"). `scale`
 *  shrinks everything for the smaller inline feedback flash. i18n-free (author text renders verbatim,
 *  with {variable} interpolation). */
const MessageBody: React.FC<{
    cfg: VNMiniGameMessage;
    variables: Record<VNID, string | number | boolean>;
    project: VNProject;
    assetResolver: (id: VNID | null, type: 'audio' | 'video' | 'image') => string | null;
    scale?: number;
}> = ({ cfg, variables, project, assetResolver, scale = 1 }) => {
    const imgUrl = cfg.imageId ? assetResolver(cfg.imageId, 'image') : null;
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 * scale,
            maxWidth: '80%', padding: cfg.panelColor ? `${18 * scale}px ${32 * scale}px` : 0, borderRadius: 16 * scale,
            background: cfg.panelColor || 'transparent',
        }}>
            {imgUrl && <img src={imgUrl} alt="" draggable={false} style={{ maxWidth: `${40 * scale}vmin`, maxHeight: `${30 * scale}vmin`, objectFit: 'contain', pointerEvents: 'none' }} />}
            {cfg.text && (
                <div style={{
                    fontSize: (cfg.fontSize ?? 48) * scale,
                    fontFamily: cssFontFamily(cfg.fontFamily) || undefined,
                    color: cfg.color || '#ffffff',
                    fontWeight: cfg.bold === false ? 'normal' : 'bold',
                    fontStyle: cfg.italic ? 'italic' : 'normal',
                    textAlign: 'center', whiteSpace: 'pre-wrap',
                    textShadow: '0 2px 10px rgba(0,0,0,0.7)',
                }}>{interpolateVariables(cfg.text, variables, project)}</div>
            )}
        </div>
    );
};

/**
 * MiniGameFrame — ALL shared mini-game chrome + the STAGE SEQUENCER.
 *
 * Runs game.stages in order (each stage's surface comes from the registry and is remounted
 * per stage); completing a stage shows a short ✓ beat, winning the LAST stage wins the game.
 * The Skip button and the time limit are GAME-level (one timer spans all stages).
 *
 * `resolvedRef` is the single-resolution gate: a stage win racing the timer (or a double
 * reportWin from a surface) must never fire two exits.
 *
 * Rendered by the engine (Show Mini Game command/action) AND by the Mini Games tab's live
 * preview (isEditorPreview) — same component, MapSurface-parity. Engine module: i18n-free.
 */

type Phase = 'intro' | 'play' | 'stageWon' | 'cutscene' | 'won' | 'failed';

const MiniGameFrame: React.FC<{
    game: VNMiniGameConfig;
    project: VNProject;
    variables: Record<VNID, string | number | boolean>;
    assetResolver: (id: VNID | null, type: 'audio' | 'video' | 'image') => string | null;
    playSound: (id: VNID | null) => void;
    /** Fires ONCE with the exit taken; the host runs that exit's actions (and advances).
     *  On 'win', `slotColors` carries the colors coloring stages left in named slots
     *  (paint regions / assemble pieces with a colorSlot) for palette→UI + {slot} variables.
     *  `score` (hits/misses/accuracy) is passed on every exit for score→variables + outcome tiers. */
    onResolve: (kind: 'win' | 'skip' | 'fail', slotColors?: Record<string, string>, score?: { hits: number; misses: number; accuracy: number }) => void;
    isEditorPreview?: boolean;
}> = ({ game, project, variables, assetResolver, playSound, onResolve, isEditorPreview }) => {
    const stages = game.stages || [];
    const [stageIndex, setStageIndex] = useState(0);
    // Bumped on a "keep trying" retry so the play surface remounts (fresh puzzle/QTE) and the
    // game timer restarts (it's a dep of the timer effect).
    const [attempt, setAttempt] = useState(0);
    const [phase, setPhase] = useState<Phase>(game.introText ? 'intro' : 'play');
    const [progress, setProgress] = useState(0);
    const [remainingMs, setRemainingMs] = useState<number | null>(null);
    const [mistakes, setMistakes] = useState(0);
    const mistakesRef = useRef(0);
    const failCauseRef = useRef<'time' | 'mistakes'>('time');
    const resolvedRef = useRef(false);
    const timersRef = useRef<number[]>([]);
    const deadlineRef = useRef<number | null>(null);
    const rafRef = useRef<number | null>(null);
    // ── reacting character + scoring + per-prompt background ──
    const [reaction, setReaction] = useState<'idle' | 'hit' | 'miss' | 'win' | 'fail'>('idle');
    const reactionOverrideRef = useRef<VNID | null>(null);
    const reactionTimerRef = useRef<number | null>(null);
    const hitsRef = useRef(0);
    const missesRef = useRef(0);
    const [bgOverride, setBgOverride] = useState<VNID | null>(null);
    const cutsceneNextRef = useRef<'nextStage' | 'win'>('nextStage');
    // Transient on-screen hit/miss feedback flash (author message + art). nonce forces the pop
    // animation to replay when the same feedback fires twice in a row.
    const [feedbackFlash, setFeedbackFlash] = useState<{ cfg: VNMiniGameMessage; pos?: FeedbackPos; nonce: number } | null>(null);
    const feedbackTimerRef = useRef<number | null>(null);
    const feedbackNonceRef = useRef(0);

    const stage = stages[stageIndex];
    const timeLimitMs = (game.timeLimitSec ?? 0) > 0 ? (game.timeLimitSec as number) * 1000 : 0;

    const pushTimer = (fn: () => void, ms: number) => { const id = window.setTimeout(fn, ms); timersRef.current.push(id); };

    // Phase mirror for the timer closure (it must see the LATEST phase, not its capture).
    const phaseRef = useRef(phase);
    phaseRef.current = phase;

    // Colors coloring stages leave in named slots, accumulated across ALL stages of the game.
    const slotColorsRef = useRef<Record<string, string>>({});

    const computeScore = () => {
        const hits = hitsRef.current, misses = missesRef.current, total = hits + misses;
        return { hits, misses, accuracy: total > 0 ? Math.round((hits / total) * 100) : 100 };
    };

    const resolve = (kind: 'win' | 'skip' | 'fail') => {
        if (resolvedRef.current) return;
        resolvedRef.current = true;
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        onResolve(kind, kind === 'win' ? { ...slotColorsRef.current } : undefined, computeScore());
    };

    /** Flash the reacting character to a hit/miss expression, then return to idle after reactMs.
     *  `override` (per-prompt) wins over the character's default hit/miss expression. */
    const flashReaction = (kind: 'hit' | 'miss', override?: VNID | null) => {
        if (!game.character || phaseRef.current === 'won' || phaseRef.current === 'failed') return;
        reactionOverrideRef.current = override ?? null;
        setReaction(kind);
        if (reactionTimerRef.current != null) clearTimeout(reactionTimerRef.current);
        reactionTimerRef.current = window.setTimeout(() => { setReaction('idle'); reactionOverrideRef.current = null; }, Math.max(120, game.character.reactMs ?? 500));
        timersRef.current.push(reactionTimerRef.current);
    };

    /** "Keep trying" retry: reset the attempt instead of ending the game. Scope 'stage' replays
     *  the current stage (earlier stages stay cleared); 'game' (default) starts from stage 1.
     *  Bumping `attempt` remounts the surface and restarts the game timer (a timer-effect dep). */
    const retryAttempt = () => {
        resolvedRef.current = false;
        mistakesRef.current = 0; setMistakes(0);
        hitsRef.current = 0; missesRef.current = 0;
        setProgress(0); setBgOverride(null); setReaction('idle'); setFeedbackFlash(null);
        if (game.retryScope !== 'stage') setStageIndex(0);
        setAttempt(a => a + 1);
        setPhase('play');
    };

    /** Shared lose path (timer expiry AND out-of-tries): fail banner timing mirrors the win
     *  banner — none = short settle, custom = author's duration, absent = built-in beat. When
     *  failMode is 'retry' the beat is a "try again" flash and we restart instead of resolving. */
    const triggerFail = (cause: 'time' | 'mistakes') => {
        if (resolvedRef.current || phaseRef.current === 'won' || phaseRef.current === 'failed') return;
        failCauseRef.current = cause;
        setPhase('failed');
        setReaction('fail');
        playSound(game.failSfxId ?? null);
        const retry = game.failMode === 'retry';
        const fm = game.failMessage;
        const banner = fm && fm.enabled !== false && (fm.text || fm.imageId);
        // Retry mode shows a short "try again" beat unless the author set a custom message.
        const holdMs = fm?.enabled === false ? 150 : banner ? Math.max(150, fm!.durationMs ?? 1200) : retry ? 650 : 750;
        pushTimer(() => { if (retry) retryAttempt(); else resolve('fail'); }, holdMs);
    };

    /** Flash the stage's on-screen hit/miss feedback (author message + art), reusing the win/lose
     *  message styling so it's equally customizable. `override` (per-tap) wins over the stage
     *  default; `pos` lands the flash on the spot (else centered). Pointer-through, auto-dismisses.
     *  Absent/disabled config = nothing (the surface's own built-in cue stands). */
    const showFeedback = (kind: 'hit' | 'miss', override?: VNMiniGameMessage | null, pos?: FeedbackPos) => {
        const cfg = override ?? (kind === 'hit' ? stage?.hitFeedback : stage?.missFeedback);
        if (!cfg || cfg.enabled === false || !(cfg.text || cfg.imageId)) return;
        if (feedbackTimerRef.current != null) clearTimeout(feedbackTimerRef.current);
        feedbackNonceRef.current = (feedbackNonceRef.current + 1) | 0;
        setFeedbackFlash({ cfg, pos, nonce: feedbackNonceRef.current });
        feedbackTimerRef.current = window.setTimeout(() => setFeedbackFlash(null), Math.max(250, cfg.durationMs ?? 900));
        timersRef.current.push(feedbackTimerRef.current);
    };

    /** Wrong move from a surface (failed pair, miss-tap…). Always counted for the score + drives
     *  the character's MISS reaction + on-screen miss feedback; only spends a heart when mistakeLimit is set. */
    const handleMistake = (override?: VNID | null, feedbackOverride?: VNMiniGameMessage | null, pos?: FeedbackPos) => {
        if (resolvedRef.current || phaseRef.current !== 'play') return;
        missesRef.current += 1;
        flashReaction('miss', override);
        showFeedback('miss', feedbackOverride, pos);
        const limit = game.mistakeLimit ?? 0;
        if (limit <= 0) return;
        mistakesRef.current += 1;
        setMistakes(mistakesRef.current);
        if (mistakesRef.current >= limit) triggerFail('mistakes');
    };

    /** Correct move from a surface (caught a prompt, matched a pair, found an object…): counts a
     *  hit + HIT reaction + on-screen hit feedback. */
    const handleHit = (override?: VNID | null, feedbackOverride?: VNMiniGameMessage | null, pos?: FeedbackPos) => {
        if (resolvedRef.current || phaseRef.current !== 'play') return;
        hitsRef.current += 1;
        flashReaction('hit', override);
        showFeedback('hit', feedbackOverride, pos);
    };

    // One game-level countdown across all stages; starts when the intro splash is dismissed.
    // The effect re-runs only at genuine (re)start moments — initial play, intro→play, and (in
    // the editor preview) when the author edits the time limit — so ALWAYS compute a fresh
    // deadline here. (The old `== null` guard left a stale deadline after an edit: the timer
    // then counted to the OLD expiry, breaking until a full remount / project reload.) It does
    // NOT re-run between stages (dep is the `intro` boolean), so one timer still spans them.
    useEffect(() => {
        if (!timeLimitMs || phase === 'intro') return;
        deadlineRef.current = performance.now() + timeLimitMs;
        setRemainingMs(timeLimitMs);
        const tick = () => {
            if (resolvedRef.current) return;
            const left = (deadlineRef.current as number) - performance.now();
            setRemainingMs(Math.max(0, left));
            if (left <= 0) {
                // Winning banners already in flight beat the clock (resolvedRef guards the race,
                // and a fully-won game showing its ✓ beat shouldn't fail on a photo finish).
                triggerFail('time');
                return;
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
        // `attempt` restarts the clock on a keep-trying retry (a time-out stops the rAF loop).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeLimitMs, phase === 'intro', attempt]);

    useEffect(() => () => { timersRef.current.forEach(id => clearTimeout(id)); }, []);

    const enterWin = () => {
        setPhase('won');
        setReaction('win');
        playSound(game.winSfxId ?? null);
        // Win banner timing: none = a short settle beat only; custom = author's duration;
        // absent config = the built-in ✓ beat (unchanged default).
        const wm = game.winMessage;
        const banner = wm && wm.enabled !== false && (wm.text || wm.imageId);
        const holdMs = wm?.enabled === false ? 150 : banner ? Math.max(150, wm!.durationMs ?? 1200) : 750;
        pushTimer(() => resolve('win'), holdMs);
    };

    const advanceToNextStage = () => {
        // "N tries per puzzle": the mistake pool refills as the next stage begins.
        if (game.mistakesPerStage) { mistakesRef.current = 0; setMistakes(0); }
        setStageIndex(i => i + 1); setProgress(0); setBgOverride(null); setReaction('idle'); setFeedbackFlash(null); setPhase('play');
    };

    /** Dismiss the between-stage cutscene → proceed to the win banner or the next stage. */
    const dismissCutscene = () => {
        if (phaseRef.current !== 'cutscene') return;
        if (cutsceneNextRef.current === 'win') enterWin(); else advanceToNextStage();
    };

    const handleStageWin = () => {
        if (resolvedRef.current || phaseRef.current === 'stageWon' || phaseRef.current === 'cutscene' || phaseRef.current === 'won' || phaseRef.current === 'failed') return;
        const isLast = stageIndex >= stages.length - 1;
        const cut = stage?.cutscene;
        const hasCut = !!cut && !!(cut.text || cut.imageId || cut.characterId);
        playSound(stage?.stageWinSfxId ?? game.interactSfxId ?? null);
        if (hasCut) {
            // Between-stage (or pre-win) cutscene: tap-to-continue, or auto after durationMs.
            cutsceneNextRef.current = isLast ? 'win' : 'nextStage';
            setPhase('cutscene');
            if (cut!.durationMs && cut!.durationMs > 0) pushTimer(dismissCutscene, cut!.durationMs);
            return;
        }
        if (isLast) enterWin();
        else { setPhase('stageWon'); pushTimer(advanceToNextStage, 750); }
    };

    // ── per-stage player cursor: sprite follows the pointer (works for touch too) ──
    const cursorUrl = stage?.cursorImageId ? assetResolver(stage.cursorImageId, 'image') : null;
    const cursorRef = useRef<HTMLImageElement>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const moveCursor = (e: React.PointerEvent) => {
        const el = cursorRef.current, host = surfaceRef.current;
        if (!el || !host) return;
        const rect = host.getBoundingClientRect();
        el.style.transform = `translate3d(${e.clientX - rect.left}px, ${e.clientY - rect.top}px, 0) translate(-50%, -50%)`;
        el.style.opacity = '1';
    };
    const hideCursor = () => { if (cursorRef.current) cursorRef.current.style.opacity = '0'; };
    const cursorSizePct = Math.min(30, Math.max(2, stage?.cursorSizePct ?? 6));

    if (!stage) return null;
    const def = resolveMiniGameDef(stage.stageType);
    const Surface = def.Surface as any; // cast for JSX `key` (no @types/react in this repo)
    // Per-prompt background override wins over the game default (reset on each new stage).
    const activeBgId = bgOverride ?? game.backgroundImage ?? null;
    const bgUrl = activeBgId ? assetResolver(activeBgId, 'image') : null;

    // ── reacting character sprite: expression follows the reaction state ──
    const char = game.character;
    const reactionExprId = char ? (
        reaction === 'hit' ? (reactionOverrideRef.current || char.hitExpressionId || char.idleExpressionId || null)
        : reaction === 'miss' ? (reactionOverrideRef.current || char.missExpressionId || char.idleExpressionId || null)
        : reaction === 'win' ? (char.winExpressionId || char.idleExpressionId || null)
        : reaction === 'fail' ? (char.failExpressionId || char.idleExpressionId || null)
        : (char.idleExpressionId || null)
    ) : null;
    const charUrls = char ? characterExpressionUrls(project, char.characterId, reactionExprId) : [];

    const ctx: MiniGameRenderCtx = {
        stage, game, project, variables, assetResolver,
        playInteractSound: () => playSound(game.interactSfxId ?? null),
        playSound,
        reportWin: handleStageWin,
        reportMistake: handleMistake,
        reportHit: handleHit,
        setBackground: (id) => setBgOverride(id),
        reportFail: () => triggerFail('mistakes'),
        reportProgress: setProgress,
        reportColors: slots => { Object.assign(slotColorsRef.current, slots); },
        isEditorPreview,
    };

    const timerFrac = timeLimitMs && remainingMs != null ? remainingMs / timeLimitMs : 1;
    const blocking = phase !== 'play';

    return (
        // game.fontFamily cascades to ALL mini-game text (title/instructions/labels/keycaps/cutscene/
        // Skip/pips…); per-message fonts still override via MessageBody. Absent = inherit app default.
        <div style={{ position: 'absolute', inset: 0, background: game.backgroundColor || 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column', userSelect: 'none', fontFamily: cssFontFamily(game.fontFamily) || undefined }}>
            {bgUrl && <img src={bgUrl} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />}

            {/* Header: title / instructions / step counter */}
            <div style={{ position: 'relative', zIndex: 2, padding: '14px 18px 8px', textAlign: 'center', color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.8)', pointerEvents: 'none' }}>
                {(game.title || game.name) && <div style={{ fontSize: 22, fontWeight: 700 }}>{game.title || game.name}</div>}
                {game.instructions && <div style={{ fontSize: 14, opacity: 0.9, marginTop: 2 }}>{game.instructions}</div>}
                {stage.instructions && phase !== 'intro' && <div style={{ fontSize: 14, opacity: 0.95, marginTop: 4, fontStyle: 'italic' }}>{stage.instructions}</div>}
                {stages.length > 1 && phase !== 'intro' && (
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{`Step ${Math.min(stageIndex + 1, stages.length)} of ${stages.length}`}</div>
                )}
                {/* Time-limit bar (game-level, spans all stages) */}
                {timeLimitMs > 0 && game.showTimer !== false && phase !== 'intro' && (
                    <div style={{ margin: '8px auto 0', width: 'min(420px, 70%)', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(0, Math.min(1, timerFrac)) * 100}%`, height: '100%', borderRadius: 3, background: timerFrac < 0.25 ? '#ef4444' : '#facc15', transition: 'width 0.1s linear' }} />
                    </div>
                )}
                {/* Remaining tries as hearts (game-level, spans all stages) */}
                {(game.mistakeLimit ?? 0) > 0 && game.showMistakes !== false && phase !== 'intro' && (
                    <div style={{ marginTop: 5, fontSize: 17, letterSpacing: 3, lineHeight: 1 }}>
                        {Array.from({ length: game.mistakeLimit as number }).map((_, i) => (
                            <span key={i} style={{ color: '#f87171', opacity: i < (game.mistakeLimit as number) - mistakes ? 1 : 0.22, transition: 'opacity 0.25s' }}>♥</span>
                        ))}
                    </div>
                )}
            </div>

            {/* Play surface (remounted per stage) + pointer-following cursor sprite */}
            <div
                ref={surfaceRef}
                style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, margin: '4px 4% 12px', cursor: cursorUrl ? 'none' : undefined }}
                onPointerMove={cursorUrl ? moveCursor : undefined}
                onPointerDown={cursorUrl ? moveCursor : undefined}
                onPointerLeave={cursorUrl ? hideCursor : undefined}
                onPointerUp={cursorUrl ? (e => { if (e.pointerType !== 'mouse') hideCursor(); }) : undefined}
            >
                <Surface key={`${stage.id}-${attempt}`} ctx={ctx} />
                {/* Reacting character: swaps expression on hit/miss/win/fail (pointer-through). */}
                {char && charUrls.length > 0 && (
                    <div style={{
                        position: 'absolute',
                        left: `${char.x ?? 22}%`, top: `${char.y ?? 8}%`,
                        height: `${char.size ?? 62}%`, aspectRatio: '3 / 4',
                        transform: char.flipX ? 'scaleX(-1)' : undefined,
                        pointerEvents: 'none', zIndex: 15,
                        transition: 'transform 0.12s ease-out',
                    }}>
                        {charUrls.map((u, i) => (
                            <img key={i} src={u} alt="" draggable={false}
                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
                        ))}
                    </div>
                )}
                {cursorUrl && (
                    <img ref={cursorRef} src={cursorUrl} alt="" draggable={false}
                        style={{ position: 'absolute', left: 0, top: 0, width: `${cursorSizePct}%`, opacity: 0, pointerEvents: 'none', zIndex: 30, willChange: 'transform' }} />
                )}
                {/* Subtle progress chip when a surface reports fractional progress */}
                {phase === 'play' && progress > 0 && progress < 1 && (
                    <div style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 20, padding: '2px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 12, pointerEvents: 'none' }}>
                        {Math.round(progress * 100)}%
                    </div>
                )}
                {/* Transient hit/miss feedback flash (author message + art). Lands on the tapped
                    spot when a surface passes a position (QTE), else centered. Pointer-through. */}
                {feedbackFlash && phase === 'play' && (
                    <div style={{
                        position: 'absolute',
                        left: feedbackFlash.pos ? `${feedbackFlash.pos.x}%` : '50%',
                        top: feedbackFlash.pos ? `${feedbackFlash.pos.y}%` : '40%',
                        transform: 'translate(-50%, -50%)', zIndex: 22, pointerEvents: 'none',
                    }}>
                        <style>{'@keyframes mgPopIn{0%{transform:scale(0.6);opacity:0}70%{transform:scale(1.06);opacity:1}100%{transform:scale(1)}}'}</style>
                        <div key={feedbackFlash.nonce} style={{
                            animation: (feedbackFlash.cfg.animation ?? 'pop') === 'pop' ? 'mgPopIn 0.3s ease-out'
                                : (feedbackFlash.cfg.animation ?? 'pop') === 'fade' ? 'fade-in 0.25s ease-out' : undefined,
                        }}>
                            <MessageBody cfg={feedbackFlash.cfg} variables={variables} project={project} assetResolver={assetResolver} scale={0.6} />
                        </div>
                    </div>
                )}
                {/* Input blocker + beat overlays. WIN and LOSE banners are both authorable:
                    absent config = built-in glyph (✓ / ⏰ time-up / ✖ out-of-tries); a message
                    config = custom text/art/style; enabled:false = nothing shows (the
                    transparent blocker still eats input until the exit runs). */}
                {blocking && phase !== 'intro' && (() => {
                    const isWin = phase === 'won';
                    const isFail = phase === 'failed';
                    const cfg = isWin ? game.winMessage : isFail ? game.failMessage : undefined;
                    const msgHidden = (isWin || isFail) && cfg?.enabled === false;
                    const custom = (isWin || isFail) && !msgHidden && cfg && (cfg.text || cfg.imageId) ? cfg : null;
                    const dim = msgHidden ? false : custom ? custom.dimBackground !== false : true;
                    const anim = custom ? (custom.animation ?? 'pop') : 'fade';
                    return (
                        <div style={{ position: 'absolute', inset: 0, zIndex: 25, display: 'flex', alignItems: 'center', justifyContent: 'center', background: dim ? 'rgba(0,0,0,0.35)' : 'transparent', animation: 'fade-in 0.15s ease-out' }}>
                            {/* self-contained keyframes so exported games don't depend on app CSS */}
                            <style>{'@keyframes mgPopIn{0%{transform:scale(0.6);opacity:0}70%{transform:scale(1.06);opacity:1}100%{transform:scale(1)}}'}</style>
                            {msgHidden ? null : custom ? (
                                <div style={{ animation: anim === 'pop' ? 'mgPopIn 0.35s ease-out' : anim === 'fade' ? 'fade-in 0.3s ease-out' : undefined }}>
                                    <MessageBody cfg={custom} variables={variables} project={project} assetResolver={assetResolver} />
                                </div>
                            ) : (
                                <div style={{ fontSize: 72, textShadow: '0 2px 12px rgba(0,0,0,0.7)' }}>
                                    {isFail ? (game.failMode === 'retry' ? '↻' : failCauseRef.current === 'mistakes' ? '✖' : '⏰') : '✓'}
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>

            {/* Skip (the authored cancel — skips the WHOLE game) */}
            {!!game.skippable && phase !== 'won' && phase !== 'failed' && (
                <button
                    onClick={() => { playSound(game.interactSfxId ?? null); resolve('skip'); }}
                    style={{ position: 'absolute', right: 14, bottom: 12, zIndex: 3, padding: '7px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                    {game.skipLabel || 'Skip'}
                </button>
            )}

            {/* Between-stage cutscene (leveled mini games): tap-to-continue, or auto after durationMs. */}
            {phase === 'cutscene' && stage.cutscene && (() => {
                const cut = stage.cutscene;
                const cutImg = cut.imageId ? assetResolver(cut.imageId, 'image') : null;
                const cutCharUrls = cut.characterId ? characterExpressionUrls(project, cut.characterId, cut.expressionId ?? null) : [];
                return (
                    <button
                        onClick={() => { playSound(game.interactSfxId ?? null); dismissCutscene(); }}
                        style={{ position: 'absolute', inset: 0, zIndex: 26, background: cut.backgroundColor || 'rgba(0,0,0,0.82)', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: '#fff', animation: 'fade-in 0.25s ease-out' }}>
                        {cutCharUrls.length > 0 && (
                            <div style={{ position: 'relative', height: '46%', aspectRatio: '3 / 4' }}>
                                {cutCharUrls.map((u, i) => <img key={i} src={u} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />)}
                            </div>
                        )}
                        {cutImg && <img src={cutImg} alt="" draggable={false} style={{ maxWidth: '50vmin', maxHeight: '34vmin', objectFit: 'contain' }} />}
                        {cut.text && <span style={{ fontSize: 19, maxWidth: '74%', whiteSpace: 'pre-wrap', textAlign: 'center', textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>{interpolateVariables(cut.text, variables, project)}</span>}
                        {!cut.durationMs && <span style={{ fontSize: 13, opacity: 0.8 }}>▶ Tap to continue</span>}
                    </button>
                );
            })()}

            {/* Intro splash: tap to start (the timer starts after the tap) */}
            {phase === 'intro' && (
                <button
                    onClick={() => { playSound(game.interactSfxId ?? null); setPhase('play'); }}
                    style={{ position: 'absolute', inset: 0, zIndex: 4, background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#fff' }}>
                    <span style={{ fontSize: 18, maxWidth: '70%', whiteSpace: 'pre-wrap', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{game.introText}</span>
                    <span style={{ fontSize: 13, opacity: 0.8 }}>▶ Tap to start</span>
                </button>
            )}
        </div>
    );
};

export default MiniGameFrame;
