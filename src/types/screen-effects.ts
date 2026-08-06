import { VNID } from './index';
// Type-only (erased at runtime) — avoids a module cycle: shared → index → screen-effects.
import type { VNCondition } from './shared';

/** The built-in screen-overlay effects. */
export type VNKnownScreenOverlayEffectType =
  | 'crtScanlines'
  | 'chromaticGlitch'
  | 'glitch'
  | 'sunbeams'
  | 'shimmer'
  | 'rain'
  | 'snowAsh'
  | 'fog'
  | 'haze'
  | 'smoke'
  | 'fireworks'
  | 'lightning'
  | 'flashlight'
  | 'spotlight'
  | 'lights';

/** Effect type: a built-in name OR a plugin-registered effect id (e.g. "myPlugin.glow").
 *  Widened to `string` (additive) so plugin custom effects are valid effect types. */
export type VNScreenOverlayEffectType = VNKnownScreenOverlayEffectType | (string & {});

/** The set of built-in effect type names (used to separate built-ins from plugin effects). */
export const BUILTIN_OVERLAY_EFFECT_TYPES: readonly VNKnownScreenOverlayEffectType[] = [
  'crtScanlines', 'chromaticGlitch', 'glitch', 'sunbeams', 'shimmer', 'rain', 'snowAsh', 'fog', 'haze', 'smoke', 'fireworks',
  'lightning', 'flashlight', 'spotlight', 'lights',
];

/** One positionable beam of a screen-attached 'spotlight' effect. Field names deliberately match
 *  the Spotlight COMMAND's config so the same placement picker (click to place, drag to aim)
 *  serves both. All positions are % of the screen. */
export interface VNScreenBeam {
  id: string;
  sourceX: number;
  sourceY: number;
  aimAngle: number;      // degrees, 0 = straight down
  beamWidth?: number;    // far-end width, % (default 45)
  sourceWidth?: number;  // source slit width, % (default 8)
  height?: number;       // beam length, % (default 100)
  falloff?: number;      // 0..1 glow falloff (default 0.5)
  color?: string;        // beam colour (default warm white)
}

/** One placed light point of a screen-attached 'lights' effect. Structurally identical to the
 *  scene command's VNLight (defined here too because scene/types imports from this file). */
export interface VNScreenLight {
  id: string;
  /** 'christmas' = a coloured string-light bulb (matches the scene command's VNLightType). */
  type: 'candle' | 'star' | 'christmas';
  x: number;             // % of the screen
  y: number;             // % of the screen
  size?: number;         // relative size multiplier (~0.5..3, default 1)
  color?: string;        // bulb/star colour (candle is always warm)
  twinkle?: 'fade' | 'blink' | 'chase' | 'steady';
  twinkleSpeed?: number; // speed multiplier (default 1)
  brightness?: number;   // 0..1 (default 1)
}

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
  // --- Chromatic Glitch + Glitch ---
  /** Colour-channel offset amount (0 = subtle, 1 = extreme). Default ≈ 0.5 */
  chromaticSpread?: number;
  // --- Glitch (the FNF-style corruption: displaced pixel bands + discolour bursts) ---
  /** How chunky the displaced bands are (0 = fine tearing, 1 = big fat blocks). Default ≈ 0.5 */
  blockiness?: number;
  /** Discolour band colours, alternated through the stripes. Unset → [effect.color ?? green]. */
  colors?: string[];
  // --- Fog / Haze / Smoke ---
  /** Render this atmospheric layer IN FRONT OF character sprites (foreground). Default (false) =
   *  behind characters, so they stand within the fog. Only meaningful for fog/haze/smoke. */
  aboveCharacters?: boolean;
  // --- Flashlight (mouse-following darkness with a clear circle at the cursor) ---
  /** Size of the lit circle (0 = small, 1 = large). Default ≈ 0.5. Intensity = darkness. */
  radius?: number;
  /** Feathering of the lit circle's edge (0 = hard rim, 1 = very soft). Default ≈ 0.5 */
  softness?: number;
  // --- Spotlight (positionable stage beams; intensity = how dark the rest of the screen goes) ---
  beams?: VNScreenBeam[];
  // --- Lights (placed twinkling light points; intensity = master brightness) ---
  lights?: VNScreenLight[];
}

export interface VNScreenOverlayEffect {
  id?: VNID;
  type: VNScreenOverlayEffectType;
  /** 0..1 (0 disables) */
  intensity: number;
  /** LIVE binding: a number variable that drives intensity while the effect is active (0..1,
   *  clamped). The static `intensity` is the fallback when the variable is missing/non-numeric.
   *  Additive-optional. */
  intensityVariableId?: VNID | null;
  /** Live-evaluated show conditions — present only when a Set Screen Effect command opted into
   *  Live Evaluation. The effect stays registered; it renders only while these hold (re-checked
   *  every render as variables change). Additive-optional. */
  conditions?: VNCondition[];
  /** Only used for snowAsh */
  variant?: VNSnowAshVariant;
  /** Optional color for the effect (hex string like #FFAA00) */
  color?: string;
  /** Optional per-effect fine-tuning parameters */
  params?: VNEffectParams;
  /** Effect style: only 'enhanced' (WebGL rendering) is ever stored; ABSENT = Classic =
   *  exactly today's rendering. Honored in round 1 by fog/haze/smoke/lights/spotlight/
   *  flashlight; other types ignore it. Additive-optional. */
  effectStyle?: 'enhanced';
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
    // Variable-bound effects survive a 0 base intensity — the variable drives them live.
    if (intensity <= 0 && !effect.intensityVariableId) continue;
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
  if (intensity <= 0 && !next.intensityVariableId) return without;

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
