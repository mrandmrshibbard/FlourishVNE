/**
 * Animation Studio (R2b): list + settings dispatch the reducer actions, the timeline lane
 * click opens the frame picker and a choice commits a NEW key, chip click edits/removes an
 * existing key, video assets never appear as frames, and the snap/ruler math holds.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const dispatch = vi.fn();
vi.mock('../../../contexts/ProjectContext', () => ({ useProject: () => ({ dispatch }) }));
// The Studio toasts on copy/paste; render outside the app shell needs the hook stubbed.
vi.mock('../../../contexts/ToastContext', () => ({
    useToast: () => ({ addToast: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_k: string, d?: any, o?: any) => {
            const s = typeof d === 'string' ? d : _k;
            return s.replace('{{ms}}', String(o?.ms ?? ''));
        },
    }),
}));

import { AnimationStudio, snapTo, rulerStepMs, SNAP_OPTIONS, DEFAULT_SNAP_MS } from '../AnimationStudio';

const makeCharacter = (): any => ({
    id: 'c1', name: 'Mia', color: '#fff',
    layers: {
        eyes: {
            id: 'eyes', name: 'Eyes', assets: {
                open: { id: 'open', name: 'Open', imageUrl: 'data:x' },
                closed: { id: 'closed', name: 'Closed', imageUrl: 'data:y' },
                vid: { id: 'vid', name: 'Vid', videoUrl: 'data:v', isVideo: true },
            },
        },
    },
    expressions: { e1: { id: 'e1', name: 'Default', layerConfiguration: { eyes: 'open' } } },
    animations: {
        'anim-1': {
            id: 'anim-1', name: 'Blink', durationMs: 300, loop: false, trigger: 'idle',
            tracks: [{ layerId: 'eyes', keys: [{ atMs: 0, assetId: 'open' }, { atMs: 100, assetId: 'closed' }] }],
        },
    },
});

const renderStudio = (character = makeCharacter()) => {
    const onClose = vi.fn();
    render(<AnimationStudio character={character} projectId="proj" onClose={onClose} />);
    return { character, onClose };
};

beforeEach(() => dispatch.mockClear());

describe('snap + ruler math', () => {
    it('snaps to the grid and clamps into range', () => {
        expect(snapTo(120, 83, 1000)).toBe(83);
        expect(snapTo(130, 83, 1000)).toBe(166);
        expect(snapTo(-40, 83, 1000)).toBe(0);
        expect(snapTo(5000, 83, 300)).toBe(300);
        expect(snapTo(123.4, 0, 1000)).toBe(123);   // free = round to 1 ms
    });
    it('default snap is 1/12 s and the options include Free', () => {
        expect(DEFAULT_SNAP_MS).toBe(83);
        expect(SNAP_OPTIONS.some(o => o.ms === 0)).toBe(true);
    });
    it('ruler steps keep labels ≥60 px apart', () => {
        expect(rulerStepMs(1)).toBe(100);      // 100ms * 1px/ms = 100px
        expect(rulerStepMs(0.25)).toBe(250);   // 250 * 0.25 = 62.5px
        expect(rulerStepMs(0.05)).toBe(2000);  // 2000 * 0.05 = 100px
    });
});

describe('AnimationStudio', () => {
    it('lists animations, shows settings with idle timing for the idle trigger', () => {
        renderStudio();
        expect(screen.getByDisplayValue('Blink')).toBeTruthy();
        expect(screen.getByText('Wait at least (ms)')).toBeTruthy();
        expect(screen.getByText('At most (ms)')).toBeTruthy();
    });

    it('Add animation dispatches ADD_CHARACTER_ANIMATION', () => {
        renderStudio();
        fireEvent.click(screen.getByText('Add animation'));
        expect(dispatch).toHaveBeenCalledWith({
            type: 'ADD_CHARACTER_ANIMATION',
            payload: { characterId: 'c1', name: 'New animation' },
        });
    });

    it('changing the trigger dispatches UPDATE_CHARACTER_ANIMATION', () => {
        renderStudio();
        const select = screen.getByText('When does it play?').querySelector('select')!;
        fireEvent.change(select, { target: { value: 'speaking' } });
        expect(dispatch).toHaveBeenCalledWith({
            type: 'UPDATE_CHARACTER_ANIMATION',
            payload: { characterId: 'c1', animationId: 'anim-1', updates: { trigger: 'speaking' } },
        });
    });

    it('clicking an empty lane spot opens the picker; choosing a frame commits a NEW key', () => {
        renderStudio();
        fireEvent.click(screen.getByTestId('anim-lane-0'));   // jsdom rect → 0 ms
        expect(screen.getByText(/Add a frame change at 0 ms/)).toBeTruthy();
        fireEvent.click(screen.getByText('Closed'));
        expect(dispatch).toHaveBeenCalledTimes(1);
        const action = dispatch.mock.calls[0][0];
        expect(action.type).toBe('UPDATE_CHARACTER_ANIMATION');
        const keys = action.payload.updates.tracks[0].keys;
        expect(keys).toHaveLength(3);
        expect(keys[2]).toEqual({ atMs: 0, assetId: 'closed' });
    });

    it('the picker offers (hidden) and never offers video assets', () => {
        renderStudio();
        fireEvent.click(screen.getByTestId('anim-lane-0'));
        expect(screen.getByText('(hidden)')).toBeTruthy();
        expect(screen.queryByText('Vid')).toBeNull();
    });

    it('DRAGGING a chip commits the key at the RELEASE position (regression: stale-closure drop)', () => {
        renderStudio();
        const lane = screen.getByTestId('anim-lane-0');
        const chip = lane.querySelector('[data-chip]')!;   // the key at 0ms
        fireEvent.pointerDown(chip);
        // jsdom lane rect starts at x=0; pxPerMs default 0.6 → clientX 120 → 200ms → snaps to 1/12s grid.
        fireEvent.pointerMove(window, { clientX: 120 });
        fireEvent.pointerUp(window);
        expect(dispatch).toHaveBeenCalledTimes(1);
        const keys = dispatch.mock.calls[0][0].payload.updates.tracks[0].keys;
        expect(keys[0].atMs).toBe(166);                    // snapTo(200, 83, 300) = 166
        expect(keys[1].atMs).toBe(100);                    // the other key untouched
    });

    it('clicking a chip (no drag) opens the edit picker; Remove deletes that key', () => {
        renderStudio();
        const lane = screen.getByTestId('anim-lane-0');
        const chip = lane.querySelector('[data-chip]')!;
        fireEvent.pointerDown(chip);
        fireEvent.pointerUp(window);
        expect(screen.getByText(/Change this frame/)).toBeTruthy();
        fireEvent.click(screen.getByText('Remove this frame change'));
        expect(dispatch).toHaveBeenCalledTimes(1);
        const keys = dispatch.mock.calls[0][0].payload.updates.tracks[0].keys;
        expect(keys).toHaveLength(1);
        expect(keys[0].atMs).toBe(100);
    });

    it('Add a layer row appends an empty track; Delete animation dispatches DELETE', () => {
        renderStudio();
        fireEvent.click(screen.getByText('Add a layer row'));
        expect(dispatch.mock.calls[0][0].payload.updates.tracks).toHaveLength(2);
        dispatch.mockClear();
        fireEvent.click(screen.getByTitle('Delete this animation'));
        expect(dispatch).toHaveBeenCalledWith({
            type: 'DELETE_CHARACTER_ANIMATION',
            payload: { characterId: 'c1', animationId: 'anim-1' },
        });
    });

    it('empty state invites adding an animation', () => {
        const bare = makeCharacter();
        delete bare.animations;
        render(<AnimationStudio character={bare} projectId="proj" onClose={vi.fn()} />);
        expect(screen.getByText(/Add an animation to get started/)).toBeTruthy();
    });
});
