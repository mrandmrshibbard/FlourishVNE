/**
 * Typewriter effect hook for dialogue text. Engine code (ships in built games).
 *
 * Extended (2026-08) for dialogue APPEND + inline [pause] codes + letter blips:
 *   - `startAt`: a prefix revealed instantly — an appended part types only its NEW text.
 *   - `initialDelayMs`: the append pause before the first new letter.
 *   - `pauses`: mid-text holds ([pause 0.5] codes), by clean-text index.
 *   - `onReveal(index)`: fires once per newly TYPED character (never for the prefix, never on
 *     skip) — the letter-blip hook.
 *
 * `hasFinished` stays derived from lengths, so every consumer gate (auto-advance timer, cursor,
 * click indicator, karaoke) keeps working: during a pause the text simply isn't finished yet.
 *
 * Implementation notes: a self-scheduling setTimeout chain (not setInterval) so per-letter
 * delays can vary; `onReveal` fires from the timeout body — NEVER inside the setState updater,
 * which must stay pure (StrictMode double-invokes it). Options are read through a ref so the
 * effect restarts only on [text, speed, msPerCharOverride] — exactly like before.
 */
import { useState, useEffect, useRef } from 'react';

export interface TypewriterOptions {
    /** Clean-text index revealed instantly at start (the already-shown appended prefix). */
    startAt?: number;
    /** Extra delay before the FIRST new character types (the append pause). */
    initialDelayMs?: number;
    /** Mid-text holds: before typing the character at `index`, wait `ms`. */
    pauses?: Array<{ index: number; ms: number }>;
    /** Called once per newly typed character with its clean-text index. */
    onReveal?: (index: number) => void;
}

export const useTypewriter = (
    text: string,
    speed: number,
    msPerCharOverride?: number | null,
    opts?: TypewriterOptions
) => {
    const [displayText, setDisplayText] = useState('');
    const hasFinished = displayText.length === text.length;

    // Latest options without restarting the effect (append merges change `text`, which restarts
    // the effect and re-reads these).
    const optsRef = useRef<TypewriterOptions | undefined>(opts);
    optsRef.current = opts;
    // Set by skip(): jump to the full text and stop the chain.
    const skipRef = useRef<() => void>(() => {});

    useEffect(() => {
        const startAt = Math.max(0, Math.min(optsRef.current?.startAt ?? 0, text.length));
        setDisplayText(text.substring(0, startAt));
        if (!text || startAt >= text.length) return;

        const pauseAt = new Map<number, number>();
        for (const p of optsRef.current?.pauses ?? []) {
            pauseAt.set(p.index, (pauseAt.get(p.index) ?? 0) + p.ms);
        }

        let pos = startAt;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let stopped = false;
        // True until the first NEW character types. With an append pause pending, the first
        // click cancels the pause and typing begins; only a second click fully reveals.
        const hadInitialDelay = (optsRef.current?.initialDelayMs ?? 0) > 0;
        let inInitialDelay = true;

        const step = () => {
            if (stopped || pos >= text.length) return;
            inInitialDelay = false;
            const revealIndex = pos;
            pos++;
            setDisplayText(text.substring(0, pos));
            try { optsRef.current?.onReveal?.(revealIndex); } catch { /* a blip must never break typing */ }
            if (pos < text.length) timer = setTimeout(step, delayFor(pos));
        };
        const delayFor = (index: number): number =>
            (msPerCharOverride ?? (1000 / speed)) + (pauseAt.get(index) ?? 0);

        skipRef.current = () => {
            if (hadInitialDelay && inInitialDelay && !stopped) {
                // Cancel the append pause — typing starts now.
                if (timer) clearTimeout(timer);
                inInitialDelay = false;
                timer = setTimeout(step, 0);
                return;
            }
            stopped = true;
            if (timer) clearTimeout(timer);
            setDisplayText(text);
        };

        // First new character: base delay + any [pause] at the boundary + the append pause.
        timer = setTimeout(step, delayFor(startAt) + (optsRef.current?.initialDelayMs ?? 0));

        return () => {
            stopped = true;
            if (timer) clearTimeout(timer);
        };
    }, [text, speed, msPerCharOverride]);

    const skip = () => skipRef.current();

    return { displayText, skip, hasFinished };
};

export default useTypewriter;
