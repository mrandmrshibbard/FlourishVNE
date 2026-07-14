import { describe, it, expect } from 'vitest';
import {
    splitNameTokens, stripOrderPrefix, orderHintFor,
    groupSpriteNames, deriveExpressions, defaultVariantOf, partLayerName,
    NameEntry, PlannedLayer,
} from '../nameGrouping';

const files = (...names: string[]): NameEntry[] => names.map((name, i) => ({ key: `k${i}`, name }));
const layer = (ls: PlannedLayer[], name: string) => ls.find(l => l.name.toLowerCase() === name.toLowerCase());
const variantNames = (l?: PlannedLayer) => (l?.variants ?? []).map(v => v.name).sort();

describe('splitNameTokens — keeps what outfitRules deliberately drops', () => {
    it('keeps SHORT tokens (mouth_a / mouth_b is a real naming scheme)', () => {
        expect(splitNameTokens('mouth_a')).toEqual(['mouth', 'a']);
    });
    it('keeps NUMERIC tokens (body-01 / body-02 is a real naming scheme)', () => {
        expect(splitNameTokens('body-01')).toEqual(['body', '01']);
    });
    it('splits on underscore, dash, space and dot', () => {
        expect(splitNameTokens('Left-Eye_Happy 2')).toEqual(['left', 'eye', 'happy', '2']);
    });
});

describe('stripOrderPrefix', () => {
    it('pulls a numeric z-order prefix off the name', () => {
        expect(stripOrderPrefix('01_body')).toEqual({ order: 1, name: 'body' });
        expect(stripOrderPrefix('02-hair')).toEqual({ order: 2, name: 'hair' });
    });
    it('leaves a normal name alone', () => {
        expect(stripOrderPrefix('body')).toEqual({ order: null, name: 'body' });
    });
});

describe('groupSpriteNames', () => {
    it('groups eyes_happy / eyes_sad into ONE layer with two variants', () => {
        const ls = groupSpriteNames(files('eyes_happy.png', 'eyes_sad.png'));
        expect(ls).toHaveLength(1);
        expect(variantNames(layer(ls, 'eyes'))).toEqual(['happy', 'sad']);
    });

    it('does NOT split left_eye_* / right_eye_* into layers "left" and "right"', () => {
        // The naive "first token is the layer" heuristic gets this wrong. We use the longest
        // shared prefix instead.
        const ls = groupSpriteNames(files('left_eye_happy.png', 'left_eye_sad.png', 'right_eye_happy.png', 'right_eye_sad.png'));
        expect(layer(ls, 'left')).toBeUndefined();
        expect(layer(ls, 'right')).toBeUndefined();
        expect(variantNames(layer(ls, 'left eye'))).toEqual(['happy', 'sad']);
        expect(variantNames(layer(ls, 'right eye'))).toEqual(['happy', 'sad']);
    });

    it('keeps numbered variants (body-01 / body-02)', () => {
        const ls = groupSpriteNames(files('body-01.png', 'body-02.png'));
        expect(variantNames(layer(ls, 'body'))).toEqual(['01', '02']);
    });

    it('a lone file becomes its own single-variant layer', () => {
        const ls = groupSpriteNames(files('body.png'));
        expect(variantNames(layer(ls, 'body'))).toEqual(['default']);
    });

    it('a SINGLE file for a known body part still splits (mouth_sad → layer "mouth", variant "sad")', () => {
        // The shared-prefix rule alone can't tell this from a layer literally called "mouth sad".
        // Knowing `mouth` is a body part resolves it.
        const ls = groupSpriteNames(files('mouth_sad.png'));
        expect(variantNames(layer(ls, 'mouth'))).toEqual(['sad']);
    });

    it('but an UNKNOWN single name stays whole (dragon_wing → one layer, not layer "dragon")', () => {
        const ls = groupSpriteNames(files('dragon_wing.png'));
        expect(layer(ls, 'dragon wing')).toBeDefined();
        expect(layer(ls, 'dragon')).toBeUndefined();
    });

    it('an explicit folder path WINS over any guessing', () => {
        const entries: NameEntry[] = [
            { key: 'a', name: 'happy.png', groupPath: ['char', 'eyes'] },
            { key: 'b', name: 'sad.png', groupPath: ['char', 'eyes'] },
        ];
        const ls = groupSpriteNames(entries);
        expect(variantNames(layer(ls, 'eyes'))).toEqual(['happy', 'sad']);
    });

    it('flags duplicate variant names as ambiguous for review', () => {
        const entries: NameEntry[] = [
            { key: 'a', name: 'x.png', groupPath: ['eyes'] },
            { key: 'b', name: 'x.png', groupPath: ['eyes'] },
        ];
        expect(layer(groupSpriteNames(entries), 'eyes')?.ambiguous).toBe(true);
    });
});

describe('PARTS vs ALTERNATIVES (the eye-whites/iris/pupil problem)', () => {
    // In a PSD, the artist already told us which it is: parts are all VISIBLE at once; alternatives
    // have one visible and the rest hidden.
    const psd = (...ls: { name: string; group: string; visible: boolean }[]): NameEntry[] =>
        ls.map((l, i) => ({ key: `k${i}`, name: l.name, groupPath: [l.group], sourceOrder: i, visible: l.visible }));

    it('an Eyes group with whites+iris+pupil ALL VISIBLE = parts (each gets its own layer)', () => {
        const ls = groupSpriteNames(psd(
            { name: 'whites', group: 'Eyes', visible: true },
            { name: 'iris', group: 'Eyes', visible: true },
            { name: 'pupil', group: 'Eyes', visible: true },
        ), { useVisibility: true });
        expect(layer(ls, 'eyes')!.mode).toBe('parts');
    });

    it('an Eyes group with only ONE visible = alternatives (the player picks one)', () => {
        const ls = groupSpriteNames(psd(
            { name: 'happy', group: 'Eyes', visible: true },
            { name: 'sad', group: 'Eyes', visible: false },
        ), { useVisibility: true });
        expect(layer(ls, 'eyes')!.mode).toBe('variants');
    });

    it('LOOSE PNGs never auto-split — every dropped file is "visible", so the signal is meaningless', () => {
        // Without this guard, dropping eyes_happy.png + eyes_sad.png would split them into two
        // layers that BOTH always show — a character with two sets of eyes.
        const ls = groupSpriteNames(files('eyes_happy.png', 'eyes_sad.png'));
        expect(layer(ls, 'eyes')!.mode).toBe('variants');
    });

    it('names split-out parts as "Group Part" so two groups can both own a "shadow"', () => {
        expect(partLayerName('Eyes', 'whites')).toBe('Eyes Whites');
        expect(partLayerName('Hair', 'shadow')).toBe('Hair Shadow');
    });

    it("doesn't stutter when the part name already contains the group name", () => {
        expect(partLayerName('Eyes', 'eye whites')).toBe('Eye Whites');
    });
});

describe('z-order (bottom-first)', () => {
    it('puts BACK-HAIR behind the body — the classic trap', () => {
        expect(orderHintFor('hair_back')).toBeLessThan(orderHintFor('body'));
        expect(orderHintFor('body')).toBeLessThan(orderHintFor('hair'));
    });

    it('orders a typical character bottom-up: body → outfit → face → eyes → hair → hat', () => {
        const ls = groupSpriteNames(files('hat.png', 'eyes_a.png', 'eyes_b.png', 'body.png', 'hair.png', 'outfit.png'));
        const names = ls.map(l => l.name.toLowerCase());
        expect(names.indexOf('body')).toBeLessThan(names.indexOf('outfit'));
        expect(names.indexOf('outfit')).toBeLessThan(names.indexOf('eyes'));
        expect(names.indexOf('eyes')).toBeLessThan(names.indexOf('hair'));
        expect(names.indexOf('hair')).toBeLessThan(names.indexOf('hat'));
    });

    it('a numeric prefix overrides the name table', () => {
        // The artist explicitly numbered them — that beats our guesses.
        const ls = groupSpriteNames(files('01_hat.png', '02_body.png'));
        expect(ls.map(l => l.name.toLowerCase())).toEqual(['hat', 'body']);
    });

    it('PSD/ORA sourceOrder is authoritative (file order beats every heuristic)', () => {
        const entries: NameEntry[] = [
            { key: 'a', name: 'hat', groupPath: ['hat'], sourceOrder: 0 },
            { key: 'b', name: 'body', groupPath: ['body'], sourceOrder: 1 },
        ];
        expect(groupSpriteNames(entries).map(l => l.name.toLowerCase())).toEqual(['hat', 'body']);
    });
});

describe('deriveExpressions', () => {
    const built = () => groupSpriteNames(files(
        'body.png', 'eyes_happy.png', 'eyes_sad.png', 'mouth_happy.png', 'mouth_sad.png',
    ));

    it('proposes "Happy" from eyes_happy + mouth_happy (a token spanning ≥2 layers)', () => {
        const exprs = deriveExpressions(built());
        expect(exprs.map(e => e.name)).toContain('Happy');
        expect(exprs.map(e => e.name)).toContain('Sad');
    });

    it('always emits a Default expression', () => {
        expect(deriveExpressions(built())[0].name).toBe('Default');
    });

    it('a Happy character is still WEARING A BODY (non-matching layers fall back to their default, not null)', () => {
        const ls = built();
        const happy = deriveExpressions(ls).find(e => e.name === 'Happy')!;
        const body = layer(ls, 'body')!;
        // "body" has no `happy` variant — it must still be selected, not left empty.
        expect(happy.selection['Body']).toBe(defaultVariantOf(body)!.key);
        expect(happy.selection['Body']).not.toBeNull();
    });

    it('ignores a token that only appears in ONE layer', () => {
        // `wink` exists only on eyes → tells us nothing about the whole face → no expression.
        const ls = groupSpriteNames(files('body.png', 'eyes_wink.png', 'eyes_sad.png', 'mouth_sad.png'));
        const names = deriveExpressions(ls).map(e => e.name);
        expect(names).toContain('Sad');
        expect(names).not.toContain('Wink');
    });

    it('strips a character-name prefix shared by every file', () => {
        // yuki_ is on everything → it is not an expression.
        const ls = groupSpriteNames(files('yuki_eyes_happy.png', 'yuki_eyes_sad.png', 'yuki_mouth_happy.png', 'yuki_mouth_sad.png'));
        expect(deriveExpressions(ls).map(e => e.name)).not.toContain('Yuki');
    });
});
