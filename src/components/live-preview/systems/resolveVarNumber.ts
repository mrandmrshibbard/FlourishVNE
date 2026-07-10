/**
 * resolveVarNumber — turn a "follow this number variable" FX binding into a usable number.
 *
 * The variable's RAW value is used (optionally scaled), clamped into the param's range; a
 * missing / non-numeric variable falls back to the command's static value, so unbound or
 * broken bindings behave exactly like today. Engine code (ships in the game bundle).
 */
import { VNID } from '../../../types';

export function resolveVarNumber(
    variables: Record<VNID, string | number | boolean> | undefined,
    variableId: VNID | null | undefined,
    fallback: number,
    opts?: { min?: number; max?: number; scale?: number },
): number {
    let value = fallback;
    if (variableId && variables) {
        const raw = variables[variableId];
        const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
        if (Number.isFinite(n)) value = n * (opts?.scale ?? 1);
    }
    if (opts?.min !== undefined) value = Math.max(opts.min, value);
    if (opts?.max !== undefined) value = Math.min(opts.max, value);
    return value;
}
