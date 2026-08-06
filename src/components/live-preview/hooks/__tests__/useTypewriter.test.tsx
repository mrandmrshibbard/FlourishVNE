/**
 * The extended typewriter: prefix reveal (append), initial delay (append pause), inline
 * [pause] holds, and the per-letter onReveal hook (blips). Fake timers throughout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTypewriter } from '../useTypewriter';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const MS = 10; // speed 100 → 10ms per char

describe('useTypewriter (extended)', () => {
    it('base behavior unchanged: types one char per tick, hasFinished at the end', () => {
        const { result } = renderHook(() => useTypewriter('abc', 100));
        expect(result.current.displayText).toBe('');
        act(() => { vi.advanceTimersByTime(MS); });
        expect(result.current.displayText).toBe('a');
        act(() => { vi.advanceTimersByTime(2 * MS); });
        expect(result.current.displayText).toBe('abc');
        expect(result.current.hasFinished).toBe(true);
    });

    it('startAt reveals the prefix instantly and types only the new part', () => {
        const onReveal = vi.fn();
        const { result } = renderHook(() =>
            useTypewriter('HelloWorld', 100, undefined, { startAt: 5, onReveal }));
        expect(result.current.displayText).toBe('Hello');
        expect(result.current.hasFinished).toBe(false);
        act(() => { vi.advanceTimersByTime(5 * MS); });
        expect(result.current.displayText).toBe('HelloWorld');
        // onReveal only for the typed part, indices 5..9
        expect(onReveal.mock.calls.map(c => c[0])).toEqual([5, 6, 7, 8, 9]);
    });

    it('initialDelayMs holds before the first new char; hasFinished false during the wait', () => {
        const { result } = renderHook(() =>
            useTypewriter('HelloWorld', 100, undefined, { startAt: 5, initialDelayMs: 500 }));
        act(() => { vi.advanceTimersByTime(400); });
        expect(result.current.displayText).toBe('Hello');
        expect(result.current.hasFinished).toBe(false);
        act(() => { vi.advanceTimersByTime(110 + 4 * MS); });
        expect(result.current.displayText).toBe('HelloWorld');
    });

    it('inline pauses hold before the character at the given index', () => {
        const { result } = renderHook(() =>
            useTypewriter('abcd', 100, undefined, { pauses: [{ index: 2, ms: 300 }] }));
        act(() => { vi.advanceTimersByTime(2 * MS); });
        expect(result.current.displayText).toBe('ab');
        act(() => { vi.advanceTimersByTime(MS + 100); });
        expect(result.current.displayText).toBe('ab'); // still holding
        act(() => { vi.advanceTimersByTime(200); });
        expect(result.current.displayText).toBe('abc');
        act(() => { vi.advanceTimersByTime(MS); });
        expect(result.current.displayText).toBe('abcd');
        expect(result.current.hasFinished).toBe(true);
    });

    it('first click during the append pause cancels the pause and typing STARTS; a second click reveals', () => {
        const { result } = renderHook(() =>
            useTypewriter('HelloWorld', 100, undefined, { startAt: 5, initialDelayMs: 5000 }));
        act(() => { vi.advanceTimersByTime(100); });
        act(() => { result.current.skip(); });      // cancels the pause
        act(() => { vi.advanceTimersByTime(1); });  // first new char types immediately
        expect(result.current.displayText).toBe('HelloW');
        expect(result.current.hasFinished).toBe(false);
        act(() => { result.current.skip(); });      // second click = full reveal
        expect(result.current.displayText).toBe('HelloWorld');
        expect(result.current.hasFinished).toBe(true);
    });

    it('a normal line (no append pause) keeps the classic click-to-reveal', () => {
        const { result } = renderHook(() => useTypewriter('abcdef', 100));
        act(() => { vi.advanceTimersByTime(1); });  // inside the first char delay
        act(() => { result.current.skip(); });
        expect(result.current.displayText).toBe('abcdef');
    });

    it('skip mid-typing reveals the rest without further onReveal calls', () => {
        const onReveal = vi.fn();
        const { result } = renderHook(() => useTypewriter('abcdef', 100, undefined, { onReveal }));
        act(() => { vi.advanceTimersByTime(2 * MS); });
        expect(result.current.displayText).toBe('ab');
        const calls = onReveal.mock.calls.length;
        act(() => { result.current.skip(); });
        expect(result.current.displayText).toBe('abcdef');
        act(() => { vi.advanceTimersByTime(1000); });
        expect(onReveal.mock.calls.length).toBe(calls);
    });

    it('an onReveal that throws never breaks typing', () => {
        const { result } = renderHook(() =>
            useTypewriter('abc', 100, undefined, { onReveal: () => { throw new Error('boom'); } }));
        act(() => { vi.advanceTimersByTime(3 * MS); });
        expect(result.current.displayText).toBe('abc');
    });

    it('msPerCharOverride still drives pace (voice-paced reveal)', () => {
        const { result } = renderHook(() => useTypewriter('ab', 100, 50));
        act(() => { vi.advanceTimersByTime(49); });
        expect(result.current.displayText).toBe('');
        act(() => { vi.advanceTimersByTime(2); }); // t=51: first char typed at t=50, second waits until t=100
        expect(result.current.displayText).toBe('a');
        act(() => { vi.advanceTimersByTime(50); });
        expect(result.current.displayText).toBe('ab');
    });
});
