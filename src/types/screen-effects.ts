import { VNID } from './index';

export type VNScreenOverlayEffectType =
  | 'crtScanlines'
  | 'chromaticGlitch'
  | 'sunbeams'
  | 'shimmer'
  | 'rain'
  | 'snowAsh';

export type VNSnowAshVariant = 'snow' | 'ash';

export interface VNScreenOverlayEffect {
  id?: VNID;
  type: VNScreenOverlayEffectType;
  /** 0..1 (0 disables) */
  intensity: number;
  /** Only used for snowAsh */
  variant?: VNSnowAshVariant;
  /** Optional color for the effect (hex string like #FFAA00) */
  color?: string;
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
    },
  ]);
}
