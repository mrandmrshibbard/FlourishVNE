/**
 * Music Gallery — shared pure logic (editor previews + engine + tests).
 *
 * Unlocking mirrors the CG Gallery exactly: a song is unlocked when its boolean
 * unlock variable is true. The wizard/settings create those variables with
 * scope:'persistent', so unlocks survive New Game and app restarts via the
 * existing vn-persistent-vars storage — no gallery-specific persistence exists.
 */
import { VNID } from '../types';
import { MusicGalleryConfig, MusicGalleryEntry } from '../types/project';
import { UIMusicGalleryElement, UIMusicPlayerPart } from '../features/ui/types';

/** Same unlock truth table as the CG Gallery (LivePreview isEntryUnlocked). */
export function isSongUnlocked(entry: MusicGalleryEntry, variables: Record<string, any>): boolean {
    if (!entry.unlockable) return true;
    if (!entry.unlockVariableId) return true;
    const val = variables[entry.unlockVariableId];
    return val === true || val === 'true' || val === 1;
}

export interface VisibleSong extends MusicGalleryEntry {
    unlocked: boolean;
}

/** Category-filtered, order/name-sorted songs with unlock state; optionally drops locked ones. */
export function visibleSongs(
    config: MusicGalleryConfig | undefined,
    element: Pick<UIMusicGalleryElement, 'categoryFilter' | 'hideLockedSongs'>,
    variables: Record<string, any>
): VisibleSong[] {
    const entries = Object.values(config?.entries || {});
    const filtered = element.categoryFilter
        ? entries.filter(e => (e.category || '') === element.categoryFilter)
        : entries;
    const sorted = filtered.slice().sort((a, b) =>
        (a.order ?? 0) - (b.order ?? 0) || (a.name || '').localeCompare(b.name || ''));
    const withState = sorted.map(e => ({ ...e, unlocked: isSongUnlocked(e, variables) }));
    return element.hideLockedSongs ? withState.filter(s => s.unlocked) : withState;
}

/** 83 → "1:23". Bad input (NaN/Infinity/negative) → "0:00" so the UI never shows garbage. */
export function formatPlayTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** "1:23 / 3:45" (duration hidden while unknown — before metadata loads). */
export function formatTimeLabel(currentTime: number, duration: number): string {
    const cur = formatPlayTime(currentTime);
    return isFinite(duration) && duration > 0 ? `${cur} / ${formatPlayTime(duration)}` : cur;
}

/** Play order over the given song ids. Shuffled = Fisher-Yates permutation with the current
 *  song kept first (so "shuffle on" never restarts what's playing); plain = the given order. */
export function buildPlayOrder(ids: VNID[], shuffle: boolean, currentId?: VNID | null): VNID[] {
    if (!shuffle) return ids.slice();
    const rest = ids.filter(id => id !== currentId);
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return currentId && ids.includes(currentId) ? [currentId, ...rest] : rest;
}

/** Index of the next/previous song in the order, wrapping at the ends. -1 when empty. */
export function stepIndex(order: VNID[], currentId: VNID | null, delta: 1 | -1): number {
    if (!order.length) return -1;
    const cur = currentId ? order.indexOf(currentId) : -1;
    if (cur === -1) return 0;
    return (cur + delta + order.length) % order.length;
}

/** DOM event the module-scoped gallery player fires whenever its state changes
 *  (mounted Music Gallery elements listen to re-render). */
export const GALLERY_PLAYER_EVENT = 'vn-music-gallery';

let partSeq = 0;
const pid = (type: string) => `mgpart_${type}_${++partSeq}`;

/** The out-of-the-box player layout: artwork left; title/artist/list right; seek + time +
 *  transport along the bottom-left. Positions are % of the element box. Every control ships
 *  visible so the element looks like a finished player the moment it's dropped on a screen. */
export function defaultMusicPlayerParts(): UIMusicPlayerPart[] {
    return [
        { id: pid('artwork'), partType: 'artwork', x: 4, y: 6, width: 40, height: 48, objectFit: 'cover', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.35)' },
        { id: pid('songTitle'), partType: 'songTitle', x: 48, y: 7, width: 48, height: 9 },
        { id: pid('artistName'), partType: 'artistName', x: 48, y: 16, width: 48, height: 6 },
        { id: pid('songList'), partType: 'songList', x: 48, y: 25, width: 48, height: 68, rowGap: 4 },
        { id: pid('seekBar'), partType: 'seekBar', x: 4, y: 59, width: 40, height: 4 },
        { id: pid('timeLabel'), partType: 'timeLabel', x: 4, y: 64, width: 40, height: 6 },
        { id: pid('prevButton'), partType: 'prevButton', x: 7, y: 74, width: 8, height: 13 },
        { id: pid('playPause'), partType: 'playPause', x: 18, y: 71, width: 12, height: 19 },
        { id: pid('nextButton'), partType: 'nextButton', x: 33, y: 74, width: 8, height: 13 },
        { id: pid('loopToggle'), partType: 'loopToggle', x: 60, y: 75, width: 7, height: 11 },
        { id: pid('shuffleToggle'), partType: 'shuffleToggle', x: 71, y: 75, width: 7, height: 11 },
    ];
}

/** Built-in glyphs per control (used when the author hasn't set a custom picture). */
export const MUSIC_CONTROL_GLYPHS: Record<string, { normal: string; active?: string }> = {
    playPause: { normal: '▶', active: '⏸' },
    prevButton: { normal: '⏮' },
    nextButton: { normal: '⏭' },
    loopToggle: { normal: '🔁' },
    shuffleToggle: { normal: '🔀' },
};

/** Stable sample songs for editor previews (the designer + canvas mock). */
export const SAMPLE_SONGS: Array<{ name: string; artist: string; locked?: boolean }> = [
    { name: 'Title Theme', artist: 'Your Composer' },
    { name: 'Rainy Streets', artist: 'Your Composer' },
    { name: 'Battle of Wits', artist: 'Your Composer', locked: true },
];
