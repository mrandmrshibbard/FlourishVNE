/**
 * Global "is test-play open" flag (per-window singleton). Editor previews that render a <video>
 * use this to UNMOUNT the video while the full-screen test-play overlay is up — the browser evicts
 * a video that sits behind a full-screen element and won't auto-resume, leaving it blank on return.
 * Gating render on `!useTestPlayActive()` guarantees the video mounts FRESH (and autoplays) once
 * test-play closes. Set from VisualNovelEditor whenever its `isPlaying` changes.
 */
import React from 'react';

let active = false;
const listeners = new Set<() => void>();

export const testPlayState = {
    get(): boolean { return active; },
    set(v: boolean) { if (v !== active) { active = v; listeners.forEach(l => l()); } },
    subscribe(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; },
};

/** React hook: true while the test-play overlay is open; re-renders on change. */
export function useTestPlayActive(): boolean {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => testPlayState.subscribe(force), []);
    return active;
}
