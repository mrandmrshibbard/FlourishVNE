/**
 * dayNightGrade — pure math for the time-of-day color grade.
 *
 * Given the current hour (0–24) and the project's phases, interpolate a grade for the BACKGROUND and
 * for the SPRITES (each can be tinted/dimmed independently). Reuses `lerpColor`/`lerp`. The background
 * grade renders as a tint overlay + a brightness/saturate filter on the bg layer; the sprite grade
 * folds into each character's CSS filter (a brightness/saturate + sepia/hue-rotate tint, matching the
 * existing character "tint" visual effect). Pure — no React, no DOM.
 */
import { lerp, lerpColor } from './easingFunctions';
import { VNDayNightCycle, VNDayNightPhase, VNGradeLayer } from '../../../types/project';

export interface ResolvedGrade { enabled: boolean; tint: string; tintOpacity: number; brightness: number; saturation: number; }
export interface GradeResult { background: ResolvedGrade; sprites: ResolvedGrade; }

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || '#ffffff').trim());
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 255, g: 255, b: 255 };
}

export function hexToRgba(hex: string, alpha: number): string {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${r3(Math.max(0, Math.min(1, alpha)))})`;
}

// A disabled layer contributes nothing (neutral): no tint, brightness/saturation = 1.
function effOpacity(l: VNGradeLayer) { return l.enabled ? (l.tintOpacity ?? 0) : 0; }
function effBrightness(l: VNGradeLayer) { return l.enabled ? (l.brightness ?? 1) : 1; }
function effSaturation(l: VNGradeLayer) { return l.enabled ? (l.saturation ?? 1) : 1; }

function lerpLayer(a: VNGradeLayer, b: VNGradeLayer, t: number): ResolvedGrade {
    return {
        enabled: a.enabled || b.enabled,
        tint: lerpColor(a.tint || '#ffffff', b.tint || '#ffffff', t),
        tintOpacity: r3(lerp(effOpacity(a), effOpacity(b), t)),
        brightness: r3(lerp(effBrightness(a), effBrightness(b), t)),
        saturation: r3(lerp(effSaturation(a), effSaturation(b), t)),
    };
}

/** Interpolate the grade for an hour (0–24) across the phases, wrapping past midnight. */
export function computeGrade(hour: number, phases: VNDayNightPhase[]): GradeResult | null {
    if (!phases || phases.length === 0) return null;
    const h = ((hour % 24) + 24) % 24;
    const sorted = [...phases].sort((p, q) => p.atHour - q.atHour);
    if (sorted.length === 1) return { background: lerpLayer(sorted[0].background, sorted[0].background, 0), sprites: lerpLayer(sorted[0].sprites, sorted[0].sprites, 0) };
    // Find the bracketing phases (lo ≤ h < hi), wrapping the last→first pair across the 24→0 seam.
    let lo = sorted[sorted.length - 1], hi = sorted[0];
    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].atHour <= h && (i === sorted.length - 1 || sorted[i + 1].atHour > h)) {
            lo = sorted[i]; hi = sorted[(i + 1) % sorted.length]; break;
        }
    }
    let span = hi.atHour - lo.atHour; if (span <= 0) span += 24;
    let pos = h - lo.atHour; if (pos < 0) pos += 24;
    const t = span > 0 ? Math.min(1, Math.max(0, pos / span)) : 0;
    return { background: lerpLayer(lo.background, hi.background, t), sprites: lerpLayer(lo.sprites, hi.sprites, t) };
}

/** Background: a tint overlay color + a brightness/saturate filter for the bg layer. */
export function gradeToBackgroundStyle(g: ResolvedGrade): { overlayColor: string; filter: string } {
    return {
        overlayColor: g.tintOpacity > 0.001 ? hexToRgba(g.tint, g.tintOpacity) : 'transparent',
        filter: `brightness(${g.brightness}) saturate(${g.saturation})`,
    };
}

const mkLayer = (enabled: boolean, tint: string, tintOpacity: number, brightness: number, saturation: number): VNGradeLayer => ({ enabled, tint, tintOpacity, brightness, saturation });

/** Seed a recolorable warm→cold cycle. `timeVariableId` is assigned by the caller (which also creates
 *  the managed variable). Phases: Dawn / Noon / Dusk / Night, wrapping through midnight. */
export function createDefaultDayNightCycle(): VNDayNightCycle {
    const id = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dn_${Math.round(performance.now())}_${Math.floor(Math.random() * 1e6)}`);
    return {
        enabled: true,
        autoAdvance: { enabled: false, secondsPerHour: 60 },
        phases: [
            { id: id(), name: 'Dawn', atHour: 6, background: mkLayer(true, '#ffb27a', 0.18, 1.0, 1.05), sprites: mkLayer(true, '#ffd9b0', 0.12, 1.0, 1.0) },
            { id: id(), name: 'Noon', atHour: 12, background: mkLayer(true, '#ffffff', 0.0, 1.0, 1.0), sprites: mkLayer(true, '#ffffff', 0.0, 1.0, 1.0) },
            { id: id(), name: 'Dusk', atHour: 18, background: mkLayer(true, '#ff7a3c', 0.28, 0.92, 1.05), sprites: mkLayer(true, '#ffae7a', 0.18, 0.95, 1.0) },
            { id: id(), name: 'Night', atHour: 22, background: mkLayer(true, '#2a3a6a', 0.45, 0.6, 0.7), sprites: mkLayer(true, '#3a4e84', 0.3, 0.65, 0.75) },
        ],
    };
}

/** Sprites: brightness/saturate filter ONLY (the tint is a true masked color overlay — gradeToSpriteTint).
 *  Accurate part of the grade; pairs with the overlay so the sprite shows the real tint color. */
export function gradeToCharacterFilter(g: ResolvedGrade): string {
    if (!g.enabled) return '';
    const parts: string[] = [];
    if (g.brightness !== 1) parts.push(`brightness(${g.brightness})`);
    if (g.saturation !== 1) parts.push(`saturate(${g.saturation})`);
    return parts.join(' ');
}

/** Sprites: the TRUE tint — a color overlay masked to the sprite's pixels (multiply-blended at opacity).
 *  Returns null when there's nothing to tint. Render as a div masked by the sprite image. */
export function gradeToSpriteTint(g: ResolvedGrade): { color: string; opacity: number } | null {
    if (!g.enabled || g.tintOpacity <= 0.001) return null;
    return { color: g.tint, opacity: Math.min(1, g.tintOpacity) };
}
