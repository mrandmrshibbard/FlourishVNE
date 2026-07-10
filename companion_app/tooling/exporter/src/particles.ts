// Particle presets (transcribed from the engine's ParticleSystem PARTICLE_PRESETS). SpawnParticles
// carries { preset } (+ optional overrides); we resolve it to a full config here so the runtime stays
// generic (it just reads numbers). Emitter x/y/width/height are % of the screen; direction is degrees
// (0°=right, 90°=down, screen y-down); speeds px/s; gravity px/s²; wind horizontal px/s².
export interface ParticleConfig {
  shape: string;
  colors: string[];
  emitRate: number; lifetime: number;
  speedMin: number; speedMax: number;
  sizeMin: number; sizeMax: number;
  gravity: number; wind: number;
  directionMin: number; directionMax: number;
  emitterX: number; emitterY: number; emitterWidth: number; emitterHeight: number;
  fadeOut: boolean; shrink: boolean; rotationSpeed: number; opacity: number;
  blendMode: string;
}

export const PARTICLE_PRESETS: Record<string, ParticleConfig> = {
  fireflies: { shape: 'circle', colors: ['#FFFF66', '#CCFF33', '#FFCC00'], emitRate: 8, lifetime: 4, speedMin: 5, speedMax: 20, sizeMin: 2, sizeMax: 5, gravity: -2, wind: 0, directionMin: 0, directionMax: 360, emitterX: 50, emitterY: 50, emitterWidth: 100, emitterHeight: 100, fadeOut: true, shrink: false, rotationSpeed: 0, opacity: 0.9, blendMode: 'lighter' },
  sparks: { shape: 'circle', colors: ['#FF6600', '#FFAA00', '#FFCC44', '#FF4400'], emitRate: 30, lifetime: 1.5, speedMin: 50, speedMax: 150, sizeMin: 1, sizeMax: 4, gravity: 40, wind: 0, directionMin: 45, directionMax: 135, emitterX: 50, emitterY: 70, emitterWidth: 60, emitterHeight: 5, fadeOut: true, shrink: true, rotationSpeed: 0, opacity: 1, blendMode: 'lighter' },
  bubbles: { shape: 'circle', colors: ['rgba(150,220,255,0.4)', 'rgba(200,240,255,0.3)', 'rgba(180,230,255,0.5)'], emitRate: 10, lifetime: 5, speedMin: 15, speedMax: 40, sizeMin: 4, sizeMax: 15, gravity: -15, wind: 3, directionMin: 70, directionMax: 110, emitterX: 50, emitterY: 100, emitterWidth: 80, emitterHeight: 5, fadeOut: true, shrink: false, rotationSpeed: 0, opacity: 0.6, blendMode: 'source-over' },
  confetti: { shape: 'square', colors: ['#FF3366', '#33CCFF', '#FFCC00', '#66FF66', '#CC66FF', '#FF6633'], emitRate: 40, lifetime: 4, speedMin: 30, speedMax: 100, sizeMin: 4, sizeMax: 10, gravity: 30, wind: 5, directionMin: 45, directionMax: 135, emitterX: 50, emitterY: 0, emitterWidth: 100, emitterHeight: 5, fadeOut: false, shrink: false, rotationSpeed: 180, opacity: 0.9, blendMode: 'source-over' },
  embers: { shape: 'circle', colors: ['#FF4400', '#FF6600', '#FF8800', '#FFAA00'], emitRate: 15, lifetime: 3, speedMin: 10, speedMax: 40, sizeMin: 1, sizeMax: 4, gravity: -20, wind: 8, directionMin: 60, directionMax: 120, emitterX: 50, emitterY: 100, emitterWidth: 80, emitterHeight: 10, fadeOut: true, shrink: true, rotationSpeed: 0, opacity: 0.8, blendMode: 'lighter' },
  dust: { shape: 'circle', colors: ['rgba(200,180,150,0.4)', 'rgba(180,160,130,0.3)', 'rgba(220,200,170,0.5)'], emitRate: 12, lifetime: 6, speedMin: 3, speedMax: 12, sizeMin: 1, sizeMax: 4, gravity: 2, wind: 5, directionMin: 0, directionMax: 360, emitterX: 50, emitterY: 50, emitterWidth: 100, emitterHeight: 100, fadeOut: true, shrink: false, rotationSpeed: 0, opacity: 0.5, blendMode: 'source-over' },
  petals: { shape: 'heart', colors: ['#FFAABB', '#FF88AA', '#FFCCDD', '#FF99BB'], emitRate: 8, lifetime: 6, speedMin: 10, speedMax: 30, sizeMin: 5, sizeMax: 12, gravity: 10, wind: 15, directionMin: 200, directionMax: 280, emitterX: 50, emitterY: 0, emitterWidth: 100, emitterHeight: 5, fadeOut: true, shrink: false, rotationSpeed: 90, opacity: 0.8, blendMode: 'source-over' },
  magic: { shape: 'sparkle', colors: ['#AA66FF', '#6699FF', '#FF66CC', '#66FFCC', '#FFFFFF'], emitRate: 20, lifetime: 2, speedMin: 20, speedMax: 60, sizeMin: 2, sizeMax: 8, gravity: -5, wind: 0, directionMin: 0, directionMax: 360, emitterX: 50, emitterY: 50, emitterWidth: 60, emitterHeight: 60, fadeOut: true, shrink: true, rotationSpeed: 120, opacity: 0.9, blendMode: 'lighter' },
  stars: { shape: 'star', colors: ['#FFFFFF', '#FFFFCC', '#CCCCFF', '#FFCCFF'], emitRate: 5, lifetime: 3, speedMin: 5, speedMax: 15, sizeMin: 3, sizeMax: 8, gravity: 0, wind: 0, directionMin: 0, directionMax: 360, emitterX: 50, emitterY: 50, emitterWidth: 100, emitterHeight: 100, fadeOut: true, shrink: false, rotationSpeed: 30, opacity: 0.8, blendMode: 'lighter' },
};

// Resolve a SpawnParticles.config (preset name + any overrides) → a full config, or null if unknown.
export function resolveParticleConfig(config: any): ParticleConfig | null {
  const preset = config?.preset;
  const base = preset && preset !== 'none' ? PARTICLE_PRESETS[preset] : undefined;
  if (!base) return null; // 'none'/custom-only configs aren't rendered in v1
  const { preset: _p, ...overrides } = config;
  return { ...base, ...overrides };
}
