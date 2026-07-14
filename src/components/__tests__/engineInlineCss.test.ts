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

const src = fs.readFileSync(path.join(__dirname, '..', 'LivePreview.tsx'), 'utf8');

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
});
