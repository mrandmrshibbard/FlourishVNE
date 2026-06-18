import { VNVariable } from './types';

/**
 * Resolves the display labels for a boolean variable's two values. A variable's own
 * `trueLabel`/`falseLabel` win when set; otherwise the caller's fallbacks (the global
 * "Yes"/"No", pulled from each surface's own i18n namespace) are used.
 *
 * This is the SINGLE place boolean labels are resolved — every surface (condition editor,
 * Set Variable, action editors, trackers, etc.) calls it so the labels can never drift.
 * It is a plain function (not a hook) so it can be called per-row inside `.map()`.
 */
export function resolveBoolLabels(
    variable: VNVariable | undefined | null,
    fallbackTrue: string,
    fallbackFalse: string,
): { yes: string; no: string } {
    return {
        yes: (variable?.trueLabel ?? '').trim() || fallbackTrue,
        no: (variable?.falseLabel ?? '').trim() || fallbackFalse,
    };
}
