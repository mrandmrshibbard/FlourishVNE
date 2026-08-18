/**
 * Character animation CRUD: ADD/UPDATE/DELETE_CHARACTER_ANIMATION. Absence is data —
 * a character with no animations must have NO `animations` key (factory pin + emptied
 * Record cleanup), and UPDATE must normalize track keys sorted by time.
 */
import { describe, it, expect } from 'vitest';
import { characterReducer } from '../state/characterReducer';

const makeState = (): any => ({
    characters: {
        c1: {
            id: 'c1', name: 'Mia', color: '#fff',
            layers: { eyes: { id: 'eyes', name: 'Eyes', assets: { open: { id: 'open', name: 'Open', imageUrl: 'o.png' }, closed: { id: 'closed', name: 'Closed', imageUrl: 'c.png' } } } },
            expressions: { e1: { id: 'e1', name: 'Default', layerConfiguration: { eyes: 'open' } } },
        },
    },
    scenes: {},
});

describe('character animations CRUD', () => {
    it('factory pin: a brand-new character has NO animations key', () => {
        const state = characterReducer({ characters: {}, scenes: {} } as any, { type: 'ADD_CHARACTER', payload: { name: 'Neo', color: '#abc' } } as any);
        const char: any = Object.values(state.characters)[0];
        expect('animations' in char).toBe(false);
        expect(JSON.stringify(char)).not.toContain('animations');
    });

    it('ADD creates a named empty animation; other characters untouched', () => {
        const state = characterReducer(makeState(), { type: 'ADD_CHARACTER_ANIMATION', payload: { characterId: 'c1', name: 'Blink' } } as any);
        const anims = Object.values(state.characters.c1.animations) as any[];
        expect(anims).toHaveLength(1);
        expect(anims[0]).toMatchObject({ name: 'Blink', durationMs: 1000, tracks: [], loop: false });
        expect(anims[0].id).toMatch(/^anim-/);
    });

    it('UPDATE merges fields and sorts track keys by time', () => {
        let state = characterReducer(makeState(), { type: 'ADD_CHARACTER_ANIMATION', payload: { characterId: 'c1', name: 'Blink' } } as any);
        const id = Object.keys(state.characters.c1.animations)[0];
        state = characterReducer(state, { type: 'UPDATE_CHARACTER_ANIMATION', payload: { characterId: 'c1', animationId: id, updates: {
            trigger: 'idle',
            tracks: [{ layerId: 'eyes', keys: [{ atMs: 200, assetId: 'open' }, { atMs: 0, assetId: 'open' }, { atMs: 100, assetId: 'closed' }] }],
        } } } as any);
        const anim = state.characters.c1.animations[id];
        expect(anim.trigger).toBe('idle');
        expect(anim.tracks[0].keys.map((k: any) => k.atMs)).toEqual([0, 100, 200]);
    });

    it('DELETE drops the animation; the LAST delete removes the whole Record', () => {
        let state = characterReducer(makeState(), { type: 'ADD_CHARACTER_ANIMATION', payload: { characterId: 'c1', name: 'A' } } as any);
        state = characterReducer(state, { type: 'ADD_CHARACTER_ANIMATION', payload: { characterId: 'c1', name: 'B' } } as any);
        const [id1, id2] = Object.keys(state.characters.c1.animations);
        state = characterReducer(state, { type: 'DELETE_CHARACTER_ANIMATION', payload: { characterId: 'c1', animationId: id1 } } as any);
        expect(Object.keys(state.characters.c1.animations)).toEqual([id2]);
        state = characterReducer(state, { type: 'DELETE_CHARACTER_ANIMATION', payload: { characterId: 'c1', animationId: id2 } } as any);
        expect('animations' in state.characters.c1).toBe(false);
    });

    it('unknown character / animation ids are no-ops returning the same state', () => {
        const state = makeState();
        expect(characterReducer(state, { type: 'ADD_CHARACTER_ANIMATION', payload: { characterId: 'ghost', name: 'X' } } as any)).toBe(state);
        expect(characterReducer(state, { type: 'UPDATE_CHARACTER_ANIMATION', payload: { characterId: 'c1', animationId: 'ghost', updates: { name: 'Y' } } } as any)).toBe(state);
        expect(characterReducer(state, { type: 'DELETE_CHARACTER_ANIMATION', payload: { characterId: 'c1', animationId: 'ghost' } } as any)).toBe(state);
    });
});

describe('DUPLICATE_CHARACTER_ANIMATION', () => {
    const withAnim = () => {
        let state = characterReducer(makeState(), { type: 'ADD_CHARACTER_ANIMATION', payload: { characterId: 'c1', name: 'Blink' } } as any);
        const id = Object.keys(state.characters.c1.animations)[0];
        state = characterReducer(state, { type: 'UPDATE_CHARACTER_ANIMATION', payload: { characterId: 'c1', animationId: id, updates: {
            tracks: [{ layerId: 'eyes', keys: [{ atMs: 0, assetId: 'open' }, { atMs: 100, assetId: 'closed' }], rotationKeys: [{ atMs: 0, deg: 5 }] }],
            motionKeys: [{ atMs: 0, dx: 1, dy: 0 }],
        } } } as any);
        return { state, id };
    };

    it('deep-copies with a caller-supplied id and "(copy)" name; mutating the copy leaves the source alone', () => {
        const { state, id } = withAnim();
        const next = characterReducer(state, { type: 'DUPLICATE_CHARACTER_ANIMATION', payload: { characterId: 'c1', animationId: id, newAnimationId: 'anim-copy1' } } as any);
        const copy = next.characters.c1.animations['anim-copy1'];
        expect(copy.name).toBe('Blink (copy)');
        expect(copy.tracks).toEqual(next.characters.c1.animations[id].tracks);
        expect(copy.motionKeys).toEqual([{ atMs: 0, dx: 1, dy: 0 }]);
        // Deep copy — no shared nested arrays with the source.
        copy.tracks[0].keys.push({ atMs: 999, assetId: null });
        copy.motionKeys.push({ atMs: 999, dx: 0, dy: 0 });
        expect(next.characters.c1.animations[id].tracks[0].keys).toHaveLength(2);
        expect(next.characters.c1.animations[id].motionKeys).toHaveLength(1);
    });

    it('generates an anim- id when none supplied; honors newName', () => {
        const { state, id } = withAnim();
        const next = characterReducer(state, { type: 'DUPLICATE_CHARACTER_ANIMATION', payload: { characterId: 'c1', animationId: id, newName: 'Blink 2' } } as any);
        const ids = Object.keys(next.characters.c1.animations).filter(k => k !== id);
        expect(ids).toHaveLength(1);
        expect(ids[0]).toMatch(/^anim-/);
        expect(next.characters.c1.animations[ids[0]].name).toBe('Blink 2');
    });

    it('collision / unknown ids are identity no-ops', () => {
        const { state, id } = withAnim();
        expect(characterReducer(state, { type: 'DUPLICATE_CHARACTER_ANIMATION', payload: { characterId: 'c1', animationId: id, newAnimationId: id } } as any)).toBe(state);
        expect(characterReducer(state, { type: 'DUPLICATE_CHARACTER_ANIMATION', payload: { characterId: 'c1', animationId: 'ghost' } } as any)).toBe(state);
        expect(characterReducer(state, { type: 'DUPLICATE_CHARACTER_ANIMATION', payload: { characterId: 'ghost', animationId: id } } as any)).toBe(state);
    });
});

describe('IMPORT_CHARACTER_ANIMATION', () => {
    const pasted = (): any => ({
        id: 'anim-pasted', name: 'Sway', durationMs: 800, loop: true,
        tracks: [{ layerId: 'eyes', keys: [{ atMs: 200, assetId: 'open' }, { atMs: 0, assetId: 'closed' }], moveKeys: [{ atMs: 400, dx: 1, dy: 0 }, { atMs: 0, dx: -1, dy: 0 }] }],
        motionKeys: [{ atMs: 300, dx: 2, dy: 0 }, { atMs: 0, dx: 0, dy: 0 }],
    });

    it('lands a fully-formed animation, sorting every lane by time', () => {
        const state = characterReducer(makeState(), { type: 'IMPORT_CHARACTER_ANIMATION', payload: { characterId: 'c1', animation: pasted() } } as any);
        const anim = state.characters.c1.animations['anim-pasted'];
        expect(anim.name).toBe('Sway');
        expect(anim.tracks[0].keys.map((k: any) => k.atMs)).toEqual([0, 200]);
        expect(anim.tracks[0].moveKeys.map((k: any) => k.atMs)).toEqual([0, 400]);
        expect(anim.motionKeys.map((k: any) => k.atMs)).toEqual([0, 300]);
    });

    it('id collision / missing id / unknown character are identity no-ops', () => {
        let state = characterReducer(makeState(), { type: 'IMPORT_CHARACTER_ANIMATION', payload: { characterId: 'c1', animation: pasted() } } as any);
        expect(characterReducer(state, { type: 'IMPORT_CHARACTER_ANIMATION', payload: { characterId: 'c1', animation: pasted() } } as any)).toBe(state);
        expect(characterReducer(state, { type: 'IMPORT_CHARACTER_ANIMATION', payload: { characterId: 'c1', animation: { ...pasted(), id: '' } } } as any)).toBe(state);
        expect(characterReducer(state, { type: 'IMPORT_CHARACTER_ANIMATION', payload: { characterId: 'ghost', animation: pasted() } } as any)).toBe(state);
    });

    it('stores a deep copy — later payload mutation cannot reach state', () => {
        const payload = pasted();
        const state = characterReducer(makeState(), { type: 'IMPORT_CHARACTER_ANIMATION', payload: { characterId: 'c1', animation: payload } } as any);
        payload.tracks[0].keys.push({ atMs: 999, assetId: null });
        expect(state.characters.c1.animations['anim-pasted'].tracks[0].keys).toHaveLength(2);
    });
});
