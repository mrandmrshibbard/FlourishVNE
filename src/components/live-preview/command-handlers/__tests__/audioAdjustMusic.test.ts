/**
 * Play Music + sound shaping (R3): the music channel takes speed/keep-pitch, REFUSES reverse,
 * persists the shaping in MusicState.adjust for every resume path — and an untouched command
 * produces a byte-identical MusicState (no `adjust` key at all).
 */
import { describe, it, expect, vi } from 'vitest';
import { handlePlayMusic, musicChannelAdjust } from '../audioHandler';
import { CommandType } from '../../../../features/scene/types';

const fakeAudio = (): any => ({
    src: '', paused: true, loop: false, volume: 1,
    playbackRate: 1, defaultPlaybackRate: 1, preservesPitch: true,
    load: vi.fn(), play: vi.fn(() => Promise.resolve()), pause: vi.fn(), addEventListener: vi.fn(),
});

const makeCtx = (audio: any): any => ({
    project: { id: 'p', audio: { song: { id: 'song', name: 'Song', audioUrl: 'data:audio/wav;base64,AAAA' } } },
    assetResolver: () => 'data:audio/wav;base64,AAAA',
    musicAudioRef: { current: audio },
    fadeAudio: vi.fn(),
    settings: { musicVolume: 0.8 },
    playerState: { musicState: { audioId: null, loop: false, currentTime: 0, isPlaying: false } },
    setPlayerState: vi.fn(),
});

const cmd = (over: any = {}): any => ({ id: 'm1', type: CommandType.PlayMusic, audioId: 'song', loop: true, fadeDuration: 1, ...over });

describe('musicChannelAdjust', () => {
    it('keeps speed/keepPitch, drops reverse; reverse-only → null', () => {
        expect(musicChannelAdjust({ speed: 2, reverse: true, keepPitch: true })).toEqual({ speed: 2, keepPitch: true });
        expect(musicChannelAdjust({ reverse: true })).toBeNull();
        expect(musicChannelAdjust(null)).toBeNull();
    });
});

describe('handlePlayMusic + audioAdjust', () => {
    it('BYTE PIN: an untouched command yields a MusicState with NO adjust key', () => {
        const audio = fakeAudio();
        const r = handlePlayMusic(cmd(), makeCtx(audio));
        const ms: any = r.updates!.musicState;
        expect('adjust' in ms).toBe(false);
        expect(JSON.stringify(ms)).not.toContain('adjust');
        expect(audio.playbackRate).toBe(1);   // reset applied on the new-track path
    });

    it('speed + keepPitch land on the element AND in MusicState.adjust (reverse refused)', () => {
        const audio = fakeAudio();
        const r = handlePlayMusic(cmd({ audioAdjust: { speed: 1.5, reverse: true, keepPitch: true } }), makeCtx(audio));
        expect((r.updates!.musicState as any).adjust).toEqual({ speed: 1.5, keepPitch: true });
        expect(audio.playbackRate).toBe(1.5);
        expect(audio.defaultPlaybackRate).toBe(1.5);
        expect(audio.preservesPitch).toBe(true);
    });

    it('the ASSET default applies when the command has none', () => {
        const audio = fakeAudio();
        const ctx = makeCtx(audio);
        ctx.project.audio.song.audioAdjust = { speed: 0.5 };
        const r = handlePlayMusic(cmd(), ctx);
        expect((r.updates!.musicState as any).adjust).toEqual({ speed: 0.5 });
        expect(audio.playbackRate).toBe(0.5);
        expect(audio.preservesPitch).toBe(false);   // tape-style by default
    });
});

describe('handlePlayMusic — crossfade (fade set + different track playing)', () => {
    const playingAudio = (): any => ({
        ...fakeAudio(), paused: false, src: 'data:audio/wav;base64,OLD',
        currentTime: 12, volume: 0.7, loop: true, playbackRate: 1.25, preservesPitch: false,
    });

    it('moves the outgoing song onto a fading clone carrying volume/loop/rate/pitch-mode', () => {
        const clone: any = {
            loop: false, volume: 1, playbackRate: 1, preservesPitch: true, readyState: 0, src: '',
            addEventListener: vi.fn(), play: vi.fn(() => Promise.resolve()), pause: vi.fn(),
        };
        // Constructor mock must be a REAL function — `new` on an arrow impl throws.
        const AudioSpy = vi.fn(function (this: any) { return clone; });
        vi.stubGlobal('Audio', AudioSpy);
        handlePlayMusic(cmd({ fadeDuration: 2 }), makeCtx(playingAudio()));
        expect(AudioSpy).toHaveBeenCalledWith('data:audio/wav;base64,OLD');
        expect(clone.volume).toBe(0.7);
        expect(clone.loop).toBe(true);
        expect(clone.playbackRate).toBe(1.25);
        expect(clone.preservesPitch).toBe(false);
        // Metadata not ready in the fake — playback is armed via loadedmetadata, once.
        expect(clone.addEventListener).toHaveBeenCalledWith('loadedmetadata', expect.any(Function), { once: true });
        vi.unstubAllGlobals();
    });

    it('creates NO clone without a fade, when nothing is playing, or on the same track', () => {
        const AudioSpy = vi.fn(function (this: any) { return { addEventListener: vi.fn() }; });
        vi.stubGlobal('Audio', AudioSpy);
        handlePlayMusic(cmd({ fadeDuration: 0 }), makeCtx(playingAudio()));      // no fade
        handlePlayMusic(cmd({ fadeDuration: 2 }), makeCtx(fakeAudio()));         // paused/empty
        const same = playingAudio(); same.src = 'data:audio/wav;base64,AAAA';    // same track
        handlePlayMusic(cmd({ fadeDuration: 2 }), makeCtx(same));
        expect(AudioSpy).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});
