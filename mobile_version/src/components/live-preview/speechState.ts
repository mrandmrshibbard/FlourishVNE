/**
 * Who is speaking RIGHT NOW, letter by letter. Engine code (ships in built games).
 *
 * The dialogue typewriter notes each newly typed letter here (via its existing onReveal hook);
 * 'speaking'-triggered character animations read it to run a talking mouth EXACTLY while text
 * types — pausing at [pause] codes, punctuation pauses and append gaps automatically, because
 * the signal decays ~150ms after the last letter.
 *
 * Module-level on purpose (the vnGalleryPlayer pattern): the DialogueBox and the stage
 * character renders are sibling trees; a singleton avoids threading props through both, never
 * enters saves, and survives remounts.
 */

const state = { characterId: null as string | null, lastRevealAt: 0 };

/** How long after the last typed letter a character still counts as speaking. */
export const SPEECH_DECAY_MS = 150;

export const noteSpeechReveal = (characterId: string | null | undefined): void => {
    state.characterId = characterId ?? null;
    state.lastRevealAt = performance.now();
};

/** Clear when a line finishes or the box closes (id given = only if it still matches). */
export const clearSpeech = (characterId?: string | null): void => {
    if (characterId === undefined || state.characterId === characterId) {
        state.characterId = null;
        state.lastRevealAt = 0;
    }
};

export const isSpeakingNow = (characterId: string, now: number = performance.now()): boolean =>
    state.characterId === characterId && now - state.lastRevealAt < SPEECH_DECAY_MS;
