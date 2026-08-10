/**
 * 🔴 No keyboard shortcut may fire while the player is typing.
 *
 * Reported from a real game: a player naming their character could not type the letter "h" — it
 * opened the dialogue history instead. The built-in shortcuts only checked the engine's own
 * text-input overlay, so a Text Input element on a UI screen (a character creator reached by Show
 * Screen) wasn't covered.
 *
 * This is a SOURCE scan rather than a behavioural test, on purpose. The failure mode isn't "the
 * guard is wrong" — it's "someone added a sixth keydown listener and forgot it", which is exactly
 * what happened here. `LivePreview.tsx` is 17k lines with no render harness, so a source-level
 * invariant is the honest way to hold this. If it ever gets in the way, delete it — but read this
 * first and make sure the thing it protects is protected some other way.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ENGINE = resolve(__dirname, '../../LivePreview.tsx');
const source = readFileSync(ENGINE, 'utf8');

/**
 * Handlers that legitimately have no guard, with the reason. Anything else must guard.
 * Keyed by a distinctive snippet so the list can't silently match the wrong handler.
 */
const ALLOWED_WITHOUT_GUARD: { snippet: string; why: string }[] = [
    {
        snippet: "if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setCarriedItemId(null); }",
        why: 'Escape only — it types nothing, and it is the universal way out.',
    },
];

describe('every keydown listener in the engine', () => {
    const listenerCount = (source.match(/addEventListener\('keydown'/g) || []).length;

    it('is a set we actually know about', () => {
        // If this number moves, a listener was added or removed — go and check it guards.
        expect(listenerCount).toBe(6);
    });

    it('🔴 checks isTypingTarget() before acting (or is an allowed exception)', () => {
        const lines = source.split('\n');
        const unguarded: string[] = [];

        lines.forEach((line, i) => {
            const registration = line.match(/addEventListener\('keydown',\s*(\w+)/);
            if (!registration) return;
            const handlerName = registration[1];

            /* Resolve the handler by NAME and read from its declaration to here. A fixed lookback
             * window isn't enough: the main handler declares its guard on the first line and
             * registers ~100 lines later. */
            const declaration = lines.findIndex(l => l.includes(`const ${handlerName} = `));
            const from = declaration >= 0 && declaration < i ? declaration : Math.max(0, i - 30);
            const body = lines.slice(from, i + 1).join('\n');

            if (body.includes('isTypingTarget()')) return;
            if (ALLOWED_WITHOUT_GUARD.some(a => body.includes(a.snippet))) return;
            unguarded.push(`line ${i + 1}: ${line.trim()}`);
        });

        expect(unguarded).toEqual([]);
    });

    it('has exactly one definition of the guard, so it cannot drift', () => {
        expect((source.match(/const isTypingTarget = /g) || []).length).toBe(1);
    });
});

describe('the guard itself', () => {
    /* Re-implemented from the source so the expectations are pinned somewhere readable; the real
     * one is module-private to the engine. */
    const guard = (el: any): boolean =>
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

    it('catches the places a player can type', () => {
        expect(guard({ tagName: 'INPUT' })).toBe(true);
        expect(guard({ tagName: 'TEXTAREA' })).toBe(true);
        expect(guard({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    });

    it('leaves ordinary focus alone, so shortcuts still work in the game', () => {
        // Real elements always carry `isContentEditable`; these fakes spell it out so the
        // expectation is about the logic rather than about a missing property.
        expect(guard({ tagName: 'BUTTON', isContentEditable: false })).toBe(false);
        expect(guard({ tagName: 'BODY', isContentEditable: false })).toBe(false);
        expect(guard(null)).toBe(false);
    });

    it('matches the engine source exactly', () => {
        const definition = source.slice(source.indexOf('const isTypingTarget = '));
        expect(definition).toContain("el.tagName === 'INPUT'");
        expect(definition).toContain("el.tagName === 'TEXTAREA'");
        expect(definition).toContain('el.isContentEditable');
    });
});
