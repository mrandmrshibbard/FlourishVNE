import { VNID } from './index';

/** The six built-in screen-overlay effects. */
export type VNKnownScreenOverlayEffectType =
  | 'crtScanlines'
  | 'chromaticGlitch'
  | 'sunbeams'
  | 'shimmer'
  | 'rain'
  | 'snowAsh';

/** Effect type: a built-in name OR a plugin-registered effect id (e.g. "myPlugin.glow").
 *  Widened to `string` (additive) so plugin custom effects are valid effect types. */
export type VNScreenOverlayEffectType = VNKnownScreenOverlayEffectType | (string & {});

/** The set of built-in effect type names (used to separate built-ins from plugin effects). */
export const BUILTIN_OVERLAY_EFFECT_TYPES: readonly VNKnownScreenOverlayEffectType[] = [
  'crtScanlines', 'chromaticGlitch', 'sunbeams', 'shimmer', 'rain', 'snowAsh',
];

export type VNSnowAshVariant = 'snow' | 'ash';

/**
 * Per-effect granular parameters beyond the universal `intensity`.
 * All values are 0..1 normalised; renderers map them to concrete ranges.
 */
export interface VNEffectParams {
  /** Animation / scroll speed (0 = frozen, 1 = fastest). Default ≈ 0.5 */
  speed?: number;
  /** Blend / compositing mode override */
  blendMode?: 'screen' | 'overlay' | 'soft-light' | 'normal';
  // --- Sunbeams ---
  /** Angular spread of each ray (0 = narrow, 1 = very wide). Default ≈ 0.5 */
  spread?: number;
  // --- Shimmer ---
  /** Relative floating-particle density (0 = few, 1 = many). Default ≈ 0.5 */
  particleDensity?: number;
  /** Which side the shimmer light emits from: 'left' | 'right' | 'full'. Default 'full' */
  shimmerSide?: 'left' | 'right' | 'full';
  /** Direction the shimmer/particles drift: 'up' | 'down'. Default 'up' */
  shimmerDirection?: 'up' | 'down';
  /** When true, disable the shimmer light waves and only show floating particles. Default false */
  shimmerParticlesOnly?: boolean;
  // --- Rain ---
  /** Wind force applied to drops (0 = calm, 1 = strong). Default ≈ 0.5 */
  windStrength?: number;
  /** Raindrop streak length (0 = short, 1 = long). Default ≈ 0.5 */
  dropLength?: number;
  // --- Snow / Ash ---
  /** Individual particle radius (0 = tiny, 1 = large). Default ≈ 0.5 */
  particleSize?: number;
  // --- CRT Scanlines ---
  /** Gap between scan-line stripes (0 = tight, 1 = wide). Default ≈ 0.5 */
  lineSpacing?: number;
  // --- Chromatic Glitch ---
  /** Colour-channel offset amount (0 = subtle, 1 = extreme). Default ≈ 0.5 */
  chromaticSpread?: number;
}

export interface VNScreenOverlayEffect {
  id?: VNID;
  type: VNScreenOverlayEffectType;
  /** 0..1 (0 disables) */
  intensity: number;
  /** Only used for snowAsh */
  variant?: VNSnowAshVariant;
  /** Optional color for the effect (hex string like #FFAA00) */
  color?: string;
  /** Optional per-effect fine-tuning parameters */
  params?: VNEffectParams;
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function normalizeOverlayEffects(
  effects: VNScreenOverlayEffect[] | undefined
): VNScreenOverlayEffect[] {
  if (!effects || effects.length === 0) return [];

  const byType = new Map<VNScreenOverlayEffectType, VNScreenOverlayEffect>();
  for (const effect of effects) {
    const intensity = clamp01(effect.intensity ?? 0);
    if (intensity <= 0) continue;
    byType.set(effect.type, {
      ...effect,
      intensity,
      variant:
        effect.type === 'snowAsh'
          ? (effect.variant ?? 'snow')
          : effect.variant,
    });
  }

  return Array.from(byType.values());
}

export function upsertOverlayEffect(
  effects: VNScreenOverlayEffect[] | undefined,
  next: VNScreenOverlayEffect
): VNScreenOverlayEffect[] {
  const normalized = normalizeOverlayEffects(effects);
  const intensity = clamp01(next.intensity ?? 0);

  const without = normalized.filter((e) => e.type !== next.type);
  if (intensity <= 0) return without;

  return normalizeOverlayEffects([
    ...without,
    {
      ...next,
      intensity,
      variant:
        next.type === 'snowAsh' ? (next.variant ?? 'snow') : next.variant,
      color: next.color,
      params: next.params,
    },
  ]);
}
