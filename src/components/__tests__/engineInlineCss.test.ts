/**
 * The engine's inline CSS is load-bearing and FRAGILE.
 *
 * Every screen transition, element entrance, and vnfx-* overlay class lives in <style> template
 * literals inside LivePreview.tsx. CSS has a brutal failure mode: ONE unbalanced brace kills every
 * rule after it in the same block — silently. That exact accident shipped once: a patch script
 * leaked a placeholder into a keyframe, and screen transitions, button animations and the screen
 * glitch all died at once while tsc stayed green (it's just a string to TypeScript).
 *
 * This test parses the actual source: every <style>{`…`}</style> block must be brace-balanced,
 * contain no leftover editing artifacts, and the animation names the engine references must exist.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// The engine's rendering source is LivePreview.tsx PLUS every module its game-facing UI was
// extracted into (the choice renderer moved to components/choice/ — its keyframes and
// animation references must stay under this contract or the test goes silently vacuous).
const ENGINE_SOURCE_FILES = [
    path.join(__dirname, '..', 'LivePreview.tsx'),
    path.join(__dirname, '..', 'choice', 'ChoiceButtonsView.tsx'),
];
const src = ENGINE_SOURCE_FILES.map(p => fs.readFileSync(p, 'utf8')).join('\n');

/** Every inline <style> template-literal block in the file. */
function styleBlocks(code: string): string[] {
    const blocks: string[] = [];
    const re = /<style>\{`([\s\S]*?)`\}<\/style>/g;
    for (const m of code.matchAll(re)) blocks.push(m[1]);
    return blocks;
}

describe('engine inline CSS integrity', () => {
    const blocks = styleBlocks(src);

    it('finds the style blocks at all (if this fails, the extraction regex rotted, not the CSS)', () => {
        expect(blocks.length).toBeGreaterThan(0);
    });

    it('every block is brace-balanced — one unbalanced brace silently kills all rules after it', () => {
        for (const [i, css] of blocks.entries()) {
            let depth = 0;
            let line = 1;
            for (const ch of css) {
                if (ch === '\n') line++;
                if (ch === '{') depth++;
                if (ch === '}') depth--;
                expect(depth, `style block #${i}: negative brace depth at line ${line}`).toBeGreaterThanOrEqual(0);
            }
            expect(depth, `style block #${i}: ${depth} unclosed brace(s)`).toBe(0);
        }
    });

    it('contains no leftover editing artifacts', () => {
        const all = blocks.join('\n');
        for (const junk of ['PLACEHOLDER', 'TODO_', 'XXX_', 'undefined%', 'NaN']) {
            expect(all.includes(junk), `found "${junk}" inside engine CSS`).toBe(false);
        }
    });

    it('every animation name the engine REFERENCES is DEFINED somewhere', () => {
        // Names used in animation shorthand / animationName strings in the source…
        const used = new Set<string>();
        for (const m of src.matchAll(/animation(?:Name)?[:=]?\s*[`'"]?\$?\{?`?(vnfx-[\w-]+|elementTransition|screenTransition|vnChar[A-Za-z]+|vnImg[A-Za-z]+|vnTextGlitch)/g)) {
            used.add(m[1]);
        }
        // …must resolve to @keyframes in the style blocks (or the known external homes).
        const cssAll = blocks.join('\n');
        const defined = new Set([...cssAll.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]));
        // Character/text keyframes live in index.html / AnimatedDialogueText — checked separately below.
        const externallyDefined = (n: string) => n.startsWith('vnChar') || n === 'vnTextGlitch';

        for (const name of used) {
            if (externallyDefined(name)) continue;
            if (name === 'elementTransition' || name === 'screenTransition') continue;   // dynamic suffix — covered next
            expect(defined.has(name), `animation "${name}" is referenced but its @keyframes is missing`).toBe(true);
        }

        // The dynamically-suffixed families: every variant the engine can produce must exist.
        for (const t of ['fade', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'scale']) {
            expect(defined.has(`elementTransition${t}`), `missing @keyframes elementTransition${t}`).toBe(true);
            if (t !== 'fade') {
                expect(defined.has(`elementTransition${t}NoFade`), `missing @keyframes elementTransition${t}NoFade`).toBe(true);
            }
        }
        for (const t of ['fade', 'slideUp', 'slideDown', 'slideLeft', 'slideRight']) {
            expect(defined.has(`screenTransition${t}`), `missing @keyframes screenTransition${t}`).toBe(true);
        }
    });

    it('the character glitch keyframes exist in index.html and the game bundler template', () => {
        const indexHtml = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'index.html'), 'utf8');
        const bundler = fs.readFileSync(path.join(__dirname, '..', '..', 'utils', 'gameBundler.ts'), 'utf8');
        for (const [name, content] of [['index.html', indexHtml], ['gameBundler.ts', bundler]] as const) {
            expect(content.includes('@keyframes vnCharGlitchJitter'), `vnCharGlitchJitter missing from ${name}`).toBe(true);
            expect(content.includes('@keyframes vnCharShake'), `vnCharShake missing from ${name}`).toBe(true);
        }
    });

    /* ── Built-game self-sufficiency ─────────────────────────────────────────────────────────
       PARITY HARD RULE: what a user sees in test play MUST appear in built games on every
       platform. Test play runs inside the editor page (index.html supplies extra CSS); built
       games only get the gameBundler template + the engine itself. Templates go stale — a
       build made with an old template shipped characters that popped in with the transition
       class set but no animation. The engine therefore carries its OWN copy of every
       game-facing class and keyframe, and these tests make that a compile-time contract. */
    describe('built-game self-sufficiency', () => {
        const cssAll = blocks.join('\n');
        const engineKeyframes = new Set([...cssAll.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]));
        const engineClasses = new Set([...cssAll.matchAll(/\.([a-zA-Z][\w-]{2,})\s*[{,]/g)].map(m => m[1]));

        it('every transition class transitionUtils can return is defined in the ENGINE inline CSS', () => {
            const utilsSrc = fs.readFileSync(path.join(__dirname, '..', 'live-preview', 'systems', 'transitionUtils.ts'), 'utf8');
            const classNames = new Set([...utilsSrc.matchAll(/'(transition-[\w-]+)'/g)].map(m => m[1]));
            expect(classNames.size, 'transitionUtils class extraction rotted').toBeGreaterThan(5);
            classNames.add('transition-base'); // applied alongside the mapped class at every call site
            for (const cls of classNames) {
                expect(engineClasses.has(cls), `.${cls} is used by transitionUtils but not defined in engine inline CSS — built games with a stale template lose this transition`).toBe(true);
            }
        });

        it('every literal animation name the engine references resolves to ENGINE-inline keyframes', () => {
            const used = new Set<string>();
            // quoted / template-literal starts: animation: 'name …' | animationName: `name …` | .animation = `name …`
            for (const m of src.matchAll(/animation(?:Name)?:\s*['"`]([A-Za-z][\w-]{3,})/g)) used.add(m[1]);
            for (const m of src.matchAll(/\.animation\s*=\s*['"`]([A-Za-z][\w-]{3,})/g)) used.add(m[1]);
            expect(used.size, 'animation-name extraction rotted').toBeGreaterThan(10);
            // Dynamic-suffix families asserted explicitly elsewhere (elementTransition*/screenTransition*).
            const dynamicFamilies = ['elementTransition', 'screenTransition'];
            for (const name of used) {
                if (dynamicFamilies.some(p => name.startsWith(p))) continue;
                if (name.endsWith('-')) continue; // dynamic suffix follows (e.g. vn-lightning-${n}) — variants asserted below
                if (name === 'none' || name === 'inherit') continue;
                expect(engineKeyframes.has(name), `animation "${name}" is referenced but has no ENGINE-inline @keyframes — built games with a stale template lose it`).toBe(true);
            }
            // The lightning flash picks vn-lightning-{1..3} at runtime: all variants must exist.
            for (const n of [1, 2, 3]) {
                expect(engineKeyframes.has(`vn-lightning-${n}`), `missing @keyframes vn-lightning-${n}`).toBe(true);
            }
        });

        it('the character keyframes are ENGINE-inline (not just in index.html/template)', () => {
            for (const kf of ['vnCharShake', 'vnCharBounce', 'vnCharFloat', 'vnCharPulse', 'vnCharGlow', 'vnCharBreathing', 'vnCharFlicker', 'vnCharGlitchJitter']) {
                expect(engineKeyframes.has(kf), `@keyframes ${kf} missing from engine inline CSS`).toBe(true);
            }
        });
    });
});
