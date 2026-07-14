/**
 * Named value bands — "boolean labels, but for numbers".
 *
 * An author names the ranges of a number variable once (0 → Stranger, 21 → Friend, 51 → Close) and
 * from then on the whole app can speak in WORDS instead of arithmetic: conditions read "when Yuki is
 * Friend or better", {Yuki} in dialogue can print "Friend", the live tracker shows "Friend (34)", and
 * a meter can tint itself with the band's colour as it fills.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ARCHITECTURAL BET: bands are AUTHORING SUGAR THAT COMPILES TO NUMBERS.
 * "Yuki is Friend or better" is stored as the ordinary condition `>= 21`. Nothing downstream — no
 * save file, no engine comparison, no existing project — has to know bands exist. That is what makes
 * this safe to add to a shipped engine.
 *
 * The ONE exception is "is exactly Friend", which cannot be one numeric comparison (it means
 * `>= 21 AND < 51`). That, and only that, needs the `inBand` operator, whose value is a BAND ID.
 * Every condition evaluator in the app must therefore handle `inBand` — miss one and conditions
 * silently evaluate false in that surface. They all delegate here, to `valueIsInBand`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pure — no React, no DOM. Lives in the engine bundle via the evaluators.
 */
import { VNVariable, VNVariableBand } from './types';

/** Bands sorted ascending by `min`. Always go through this — stored order is not guaranteed. */
export function sortedBands(variable: VNVariable | undefined): VNVariableBand[] {
    if (!variable?.bands?.length) return [];
    return [...variable.bands].sort((a, b) => a.min - b.min);
}

export function hasBands(variable: VNVariable | undefined): boolean {
    return variable?.type === 'number' && !!variable.bands?.length;
}

/**
 * The band a value falls in: the one with the greatest `min` that is still <= value.
 * A value below every band (the author started their bands at 10 but the value is 3) has NO band —
 * we return null rather than inventing one, so the UI can fall back to showing the number.
 */
export function resolveBand(variable: VNVariable | undefined, value: unknown): VNVariableBand | null {
    const bands = sortedBands(variable);
    if (!bands.length) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    let found: VNVariableBand | null = null;
    for (const b of bands) {
        if (n >= b.min) found = b;
        else break;
    }
    return found;
}

/** The band directly above this one, or null if it's the top band. */
export function nextBand(variable: VNVariable | undefined, band: VNVariableBand): VNVariableBand | null {
    const bands = sortedBands(variable);
    const i = bands.findIndex(b => b.id === band.id);
    return i >= 0 && i < bands.length - 1 ? bands[i + 1] : null;
}

/** The three band operators, as understood by every condition evaluator. */
export type BandComparison = 'inBand' | 'atLeastBand' | 'belowBand';

/**
 * Answer a band condition. THE ONE PLACE that does — all four condition evaluators call through
 * here, so band semantics can never drift between the engine, the editor canvas and the previews.
 *
 * A band runs from its own `min` up to, but NOT including, the next band's `min`.
 *   inBand      — the value is inside this band              ("Yuki is a Friend")
 *   atLeastBand — the value is in this band or any above it   ("Yuki is a Friend or better")
 *   belowBand   — the value is beneath this band's floor      ("Yuki is below Friend")
 *
 * An unknown band id (the author deleted it) reads FALSE rather than throwing — a broken condition
 * must not take down a playthrough.
 */
export function compareBand(
    variable: VNVariable | undefined,
    value: unknown,
    bandId: string,
    op: BandComparison,
): boolean {
    const band = sortedBands(variable).find(b => b.id === bandId);
    if (!band) return false;
    const n = Number(value);
    if (!Number.isFinite(n)) return false;

    if (op === 'belowBand') return n < band.min;
    if (op === 'atLeastBand') return n >= band.min;

    if (n < band.min) return false;
    const above = nextBand(variable, band);
    return above ? n < above.min : true;
}

/** Convenience for the common case. */
export function valueIsInBand(variable: VNVariable | undefined, value: unknown, bandId: string): boolean {
    return compareBand(variable, value, bandId, 'inBand');
}

/** True for the three operators whose `value` is a band id rather than a literal. */
export function isBandOperator(op: string): op is BandComparison {
    return op === 'inBand' || op === 'atLeastBand' || op === 'belowBand';
}

/**
 * The inclusive display range of a band, e.g. { from: 21, to: 50 }. `to` is null for the top band
 * (it runs to the variable's max, or to infinity).
 *
 * NOTE the deliberate integer check: the band above starting at 51 means this one ends "just under
 * 51", which is 50 for whole numbers but is NOT expressible for fractional bands. Rather than print
 * a lie like "20.5 – 20.5", we return null and let the caller show "21 and up".
 */
export function bandRange(variable: VNVariable | undefined, band: VNVariableBand): { from: number; to: number | null } {
    const above = nextBand(variable, band);
    if (above) {
        const to = above.min - 1;
        return { from: band.min, to: Number.isInteger(above.min) && Number.isInteger(band.min) ? to : null };
    }
    return { from: band.min, to: variable?.max ?? null };
}

/** "Friend (21–50)" / "In love (81 and up)" — for dropdowns and the band editor. */
export function describeBand(variable: VNVariable | undefined, band: VNVariableBand, andUpLabel = 'and up'): string {
    const { from, to } = bandRange(variable, band);
    const icon = band.icon ? `${band.icon} ` : '';
    return to === null ? `${icon}${band.name} (${from} ${andUpLabel})` : `${icon}${band.name} (${from}–${to})`;
}

/**
 * How a value should READ, honouring the variable's `showAs`. Unset/'number' → unchanged, which is
 * why adding bands to an existing project changes nothing until the author asks for it.
 */
export function formatBandedValue(variable: VNVariable | undefined, value: unknown): string {
    const raw = String(value);
    if (!hasBands(variable) || !variable?.showAs || variable.showAs === 'number') return raw;
    const band = resolveBand(variable, value);
    if (!band) return raw;                                   // below every band → the number is all we have
    return variable.showAs === 'both' ? `${band.name} (${raw})` : band.name;
}

/** The band a condition points at, or undefined if it was deleted. */
export function bandById(variable: VNVariable | undefined, bandId: unknown): VNVariableBand | undefined {
    return sortedBands(variable).find(b => b.id === String(bandId));
}

/** A fresh band, slotted above the current top one. */
export function makeBand(variable: VNVariable | undefined, id: string): VNVariableBand {
    const bands = sortedBands(variable);
    const top = bands[bands.length - 1];
    const min = top ? top.min + 10 : (variable?.min ?? 0);
    return { id, name: '', min };
}

/**
 * Problems an author would otherwise only discover at runtime. Returned as plain sentences —
 * these are shown, not thrown.
 */
export function validateBands(variable: VNVariable | undefined): string[] {
    const bands = sortedBands(variable);
    if (!bands.length) return [];
    const problems: string[] = [];

    for (let i = 1; i < bands.length; i++) {
        if (bands[i].min === bands[i - 1].min) {
            problems.push(`"${bands[i].name || '…'}" and "${bands[i - 1].name || '…'}" both start at ${bands[i].min}. Give one of them a different starting number.`);
        }
    }
    if (variable?.max !== undefined && bands[bands.length - 1].min > variable.max) {
        problems.push(`"${bands[bands.length - 1].name || '…'}" starts at ${bands[bands.length - 1].min}, but this variable can never go above ${variable.max}, so it can never be reached.`);
    }
    if (variable?.min !== undefined && bands[0].min > variable.min) {
        problems.push(`Values from ${variable.min} to ${bands[0].min - 1} have no name yet — they will show as a plain number.`);
    }
    for (const b of bands) {
        if (!b.name.trim()) problems.push(`One band (starting at ${b.min}) has no name yet.`);
    }
    return problems;
}
