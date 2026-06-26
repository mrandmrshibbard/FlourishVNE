/**
 * Effective video trim resolution: a per-use override (on a command / UIAsset / bg ref)
 * wins over the asset's own default trim, field-by-field. Either may be partial (e.g. a
 * use sets only a start). Returns `{ start, end }` in seconds (undefined = no bound).
 */
export interface ResolvedVideoTrim { start?: number; end?: number; }

type TrimSource = { trimStart?: number; trimEnd?: number } | null | undefined;

export function resolveVideoTrim(perUse?: TrimSource, asset?: TrimSource): ResolvedVideoTrim {
    return {
        start: perUse?.trimStart ?? asset?.trimStart,
        end: perUse?.trimEnd ?? asset?.trimEnd,
    };
}
