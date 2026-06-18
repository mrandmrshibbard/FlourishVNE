import { VNPosition, VNPositionPreset } from '../types';

/** Preset position base X coordinates */
const PRESET_X: Record<VNPositionPreset, number> = {
    'left': 25,
    'center': 50,
    'right': 75,
    'off-left': -25,
    'off-right': 125,
};

/** Spacing between characters sharing a position (percentage points) */
const SPREAD = 15;

/** Minimum X% to keep characters within the visible stage */
const MIN_X = 5;
/** Maximum X% to keep characters within the visible stage */
const MAX_X = 95;

/**
 * Given an array of characters (id + position), returns a map from character ID
 * to an adjusted X coordinate.  Characters that use a preset position and share
 * the same preset are evenly spread around the preset's base X, clamped to
 * [MIN_X, MAX_X] so nothing is pushed off-screen.
 *
 * Characters with custom {x,y} positions or off-screen presets are left alone
 * (not included in the returned map).
 */
export function computeArrangedPositions(
    characters: { id: string; position: VNPosition }[]
): Map<string, number> {
    // Group characters by preset position (skip custom and off-screen presets)
    const groups = new Map<VNPositionPreset, string[]>();
    for (const char of characters) {
        if (typeof char.position === 'string') {
            const preset = char.position as VNPositionPreset;
            // Only rearrange on-screen presets
            if (preset === 'off-left' || preset === 'off-right') continue;
            let arr = groups.get(preset);
            if (!arr) { arr = []; groups.set(preset, arr); }
            arr.push(char.id);
        }
    }

    const result = new Map<string, number>();

    for (const [preset, ids] of groups) {
        if (ids.length <= 1) continue; // No conflict — nothing to adjust

        const baseX = PRESET_X[preset];
        const count = ids.length;
        // Total width the group occupies
        const totalWidth = (count - 1) * SPREAD;
        const startX = baseX - totalWidth / 2;

        for (let i = 0; i < count; i++) {
            const rawX = startX + i * SPREAD;
            // Clamp to keep within visible bounds
            const clampedX = Math.max(MIN_X, Math.min(MAX_X, rawX));
            result.set(ids[i], clampedX);
        }
    }

    return result;
}
