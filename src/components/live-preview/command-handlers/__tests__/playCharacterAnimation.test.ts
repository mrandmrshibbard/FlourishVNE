/**
 * Play Character Animation (R2c): starts/stops a manual frame animation by writing
 * `activeManualAnimationId` into the stage entry via stagePatch. Stop and unknown ids
 * must serialize to a MISSING field (absence is data); off-stage characters are no-ops.
 */
import { describe, it, expect } from 'vitest';
import { handlePlayCharacterAnimation } from '../characterHandler';
import { CommandType } from '../../../../features/scene/types';
import { createCommand } from '../../../../utils/commandFactory';

const project: any = {
    id: 'proj',
    variables: {},
    backgrounds: {}, images: {}, audio: {}, videos: {}, scenes: {}, uiScreens: {},
    characters: {
        mia: {
            id: 'mia', name: 'Mia', color: '#fff', layers: {}, expressions: {},
            animations: { wave: { id: 'wave', name: 'Wave', durationMs: 400, loop: true, tracks: [] } },
        },
    },
    ui: {},
};
const stageChar = (over: any = {}): any => ({
    charId: 'mia', position: 'center', imageUrls: ['a.png'], expressionId: 'e1', transition: null, ...over,
});
const ctx = (chars: any): any => ({
    project,
    playerState: { variables: {}, uiState: {}, stageState: { characters: chars } },
});
const cmd = (over: any = {}): any => ({ id: 'c1', type: CommandType.PlayCharacterAnimation, characterId: 'mia', animationId: 'wave', ...over });

describe('commandFactory pin', () => {
    it('creates the exact minimal shape', () => {
        const created = createCommand(CommandType.PlayCharacterAnimation, project);
        expect(created).toEqual({ type: CommandType.PlayCharacterAnimation, characterId: 'mia', animationId: null });
    });
});

describe('handlePlayCharacterAnimation', () => {
    it('starts a manual animation on the on-stage character', () => {
        const chars = { mia: stageChar() };
        const r = handlePlayCharacterAnimation(cmd(), ctx(chars));
        expect(r.advance).toBe(true);
        const patch = r.stagePatch!({ characters: chars } as any);
        expect((patch.characters as any).mia.activeManualAnimationId).toBe('wave');
    });

    it('stop (null) clears the field ENTIRELY — absence is data', () => {
        const chars = { mia: stageChar({ activeManualAnimationId: 'wave' }) };
        const r = handlePlayCharacterAnimation(cmd({ animationId: null }), ctx(chars));
        const out = (r.stagePatch!({ characters: chars } as any).characters as any).mia;
        expect(out.activeManualAnimationId).toBeUndefined();
        expect(JSON.stringify(out)).not.toContain('activeManualAnimationId');
    });

    it('an unknown/deleted animation id degrades to stop, never breaks', () => {
        const chars = { mia: stageChar() };
        const r = handlePlayCharacterAnimation(cmd({ animationId: 'gone' }), ctx(chars));
        const out = (r.stagePatch!({ characters: chars } as any).characters as any).mia;
        expect(JSON.stringify(out)).not.toContain('activeManualAnimationId');
    });

    it('character not on stage → plain advance, no patch', () => {
        const r = handlePlayCharacterAnimation(cmd(), ctx({}));
        expect(r).toEqual({ advance: true });
    });

    it('character gone from stage by patch time → empty patch (stacked-command safe)', () => {
        const chars = { mia: stageChar() };
        const r = handlePlayCharacterAnimation(cmd(), ctx(chars));
        expect(r.stagePatch!({ characters: {} } as any)).toEqual({});
    });
});
