/**
 * ParticleSystem - Canvas-based particle renderer for visual novel stage effects
 * Supports configurable emitters with presets for common effects
 */
import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import type { VNParticleConfig } from '../../features/scene/types';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    life: number;
    maxLife: number;
    rotation: number;
    rotationSpeed: number;
    shape: string;
    opacity: number;
}

interface ParticleEmitter {
    tag: string;
    config: VNParticleConfig;
    particles: Particle[];
    accumulatedEmit: number;
    fadingOut: boolean;
    fadeOpacity: number;
    fadeOutDuration: number;
}

export interface ParticleSystemProps {
    effects: Record<string, {
        tag: string;
        config: VNParticleConfig;
        startTime: number;
        duration: number;
        fadingOut?: boolean;
        fadeOutDuration?: number;
    }>;
    width: number;
    height: number;
    className?: string;
    assetResolver?: (assetId: string | null, type: 'image') => string | null;
}

/** Built-in particle presets */
const PARTICLE_PRESETS: Record<string, Partial<VNParticleConfig>> = {
    fireflies: {
        shape: 'circle',
        colors: ['#FFFF66', '#CCFF33', '#FFCC00'],
        emitRate: 8,
        lifetime: 4,
        speedMin: 5,
        speedMax: 20,
        sizeMin: 2,
        sizeMax: 5,
        gravity: -2,
        wind: 0,
        directionMin: 0,
        directionMax: 360,
        emitterX: 50,
        emitterY: 50,
        emitterWidth: 100,
        emitterHeight: 100,
        fadeOut: true,
        shrink: false,
        rotationSpeed: 0,
        opacity: 0.9,
        blendMode: 'lighter',
    },
    sparks: {
        shape: 'circle',
        colors: ['#FF6600', '#FFAA00', '#FFCC44', '#FF4400'],
        emitRate: 30,
        lifetime: 1.5,
        speedMin: 50,
        speedMax: 150,
        sizeMin: 1,
        sizeMax: 4,
        gravity: 40,
        wind: 0,
        directionMin: 45,
        directionMax: 135,
        emitterX: 50,
        emitterY: 70,
        emitterWidth: 60,
        emitterHeight: 5,
        fadeOut: true,
        shrink: true,
        rotationSpeed: 0,
        opacity: 1,
        blendMode: 'lighter',
    },
    bubbles: {
        shape: 'circle',
        colors: ['rgba(150,220,255,0.4)', 'rgba(200,240,255,0.3)', 'rgba(180,230,255,0.5)'],
        emitRate: 10,
        lifetime: 5,
        speedMin: 15,
        speedMax: 40,
        sizeMin: 4,
        sizeMax: 15,
        gravity: -15,
        wind: 3,
        directionMin: 70,
        directionMax: 110,
        emitterX: 50,
        emitterY: 100,
        emitterWidth: 80,
        emitterHeight: 5,
        fadeOut: true,
        shrink: false,
        rotationSpeed: 0,
        opacity: 0.6,
        blendMode: 'source-over',
    },
    confetti: {
        shape: 'square',
        colors: ['#FF3366', '#33CCFF', '#FFCC00', '#66FF66', '#CC66FF', '#FF6633'],
        emitRate: 40,
        lifetime: 4,
        speedMin: 30,
        speedMax: 100,
        sizeMin: 4,
        sizeMax: 10,
        gravity: 30,
        wind: 5,
        directionMin: 45,
        directionMax: 135,
        emitterX: 50,
        emitterY: 0,
        emitterWidth: 100,
        emitterHeight: 5,
        fadeOut: false,
        shrink: false,
        rotationSpeed: 180,
        opacity: 0.9,
        blendMode: 'source-over',
    },
    embers: {
        shape: 'circle',
        colors: ['#FF4400', '#FF6600', '#FF8800', '#FFAA00'],
        emitRate: 15,
        lifetime: 3,
        speedMin: 10,
        speedMax: 40,
        sizeMin: 1,
        sizeMax: 4,
        gravity: -20,
        wind: 8,
        directionMin: 60,
        directionMax: 120,
        emitterX: 50,
        emitterY: 100,
        emitterWidth: 80,
        emitterHeight: 10,
        fadeOut: true,
        shrink: true,
        rotationSpeed: 0,
        opacity: 0.8,
        blendMode: 'lighter',
    },
    dust: {
        shape: 'circle',
        colors: ['rgba(200,180,150,0.4)', 'rgba(180,160,130,0.3)', 'rgba(220,200,170,0.5)'],
        emitRate: 12,
        lifetime: 6,
        speedMin: 3,
        speedMax: 12,
        sizeMin: 1,
        sizeMax: 4,
        gravity: 2,
        wind: 5,
        directionMin: 0,
        directionMax: 360,
        emitterX: 50,
        emitterY: 50,
        emitterWidth: 100,
        emitterHeight: 100,
        fadeOut: true,
        shrink: false,
        rotationSpeed: 0,
        opacity: 0.5,
        blendMode: 'source-over',
    },
    petals: {
        shape: 'heart',
        colors: ['#FFAABB', '#FF88AA', '#FFCCDD', '#FF99BB'],
        emitRate: 8,
        lifetime: 6,
        speedMin: 10,
        speedMax: 30,
        sizeMin: 5,
        sizeMax: 12,
        gravity: 10,
        wind: 15,
        directionMin: 200,
        directionMax: 280,
        emitterX: 50,
        emitterY: 0,
        emitterWidth: 100,
        emitterHeight: 5,
        fadeOut: true,
        shrink: false,
        rotationSpeed: 90,
        opacity: 0.8,
        blendMode: 'source-over',
    },
    magic: {
        shape: 'sparkle',
        colors: ['#AA66FF', '#6699FF', '#FF66CC', '#66FFCC', '#FFFFFF'],
        emitRate: 20,
        lifetime: 2,
        speedMin: 20,
        speedMax: 60,
        sizeMin: 2,
        sizeMax: 8,
        gravity: -5,
        wind: 0,
        directionMin: 0,
        directionMax: 360,
        emitterX: 50,
        emitterY: 50,
        emitterWidth: 60,
        emitterHeight: 60,
        fadeOut: true,
        shrink: true,
        rotationSpeed: 120,
        opacity: 0.9,
        blendMode: 'lighter',
    },
    stars: {
        shape: 'star',
        colors: ['#FFFFFF', '#FFFFCC', '#CCCCFF', '#FFCCFF'],
        emitRate: 5,
        lifetime: 3,
        speedMin: 5,
        speedMax: 15,
        sizeMin: 3,
        sizeMax: 8,
        gravity: 0,
        wind: 0,
        directionMin: 0,
        directionMax: 360,
        emitterX: 50,
        emitterY: 50,
        emitterWidth: 100,
        emitterHeight: 100,
        fadeOut: true,
        shrink: false,
        rotationSpeed: 30,
        opacity: 0.8,
        blendMode: 'lighter',
    },
};

function resolveConfig(config: VNParticleConfig): VNParticleConfig {
    let resolved = config;
    if (config.preset && config.preset !== 'none' && PARTICLE_PRESETS[config.preset]) {
        resolved = { ...PARTICLE_PRESETS[config.preset], ...config } as VNParticleConfig;
    }
    // Ensure all required numeric fields have valid defaults to prevent NaN
    return {
        ...resolved,
        emitRate: resolved.emitRate ?? 10,
        lifetime: resolved.lifetime ?? 3,
        speedMin: resolved.speedMin ?? 5,
        speedMax: resolved.speedMax ?? 30,
        sizeMin: resolved.sizeMin ?? 2,
        sizeMax: resolved.sizeMax ?? 8,
        gravity: resolved.gravity ?? 0,
        wind: resolved.wind ?? 0,
        directionMin: resolved.directionMin ?? 0,
        directionMax: resolved.directionMax ?? 360,
        emitterX: resolved.emitterX ?? 50,
        emitterY: resolved.emitterY ?? 50,
        emitterWidth: resolved.emitterWidth ?? 100,
        emitterHeight: resolved.emitterHeight ?? 100,
        opacity: resolved.opacity ?? 1,
        rotationSpeed: resolved.rotationSpeed ?? 0,
        fadeOut: resolved.fadeOut ?? true,
        shrink: resolved.shrink ?? false,
        shape: resolved.shape || 'circle',
        colors: (resolved.colors && resolved.colors.length > 0) ? resolved.colors : ['#FFFFFF'],
    };
}

function drawShape(ctx: CanvasRenderingContext2D, shape: string, x: number, y: number, size: number, rotation: number, color: string, opacity: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;

    switch (shape) {
        case 'circle':
            ctx.beginPath();
            ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'square':
            ctx.fillRect(-size / 2, -size / 2, size, size);
            break;
        case 'star': {
            const spikes = 5;
            const outerRadius = size / 2;
            const innerRadius = size / 4;
            ctx.beginPath();
            for (let i = 0; i < spikes * 2; i++) {
                const r = i % 2 === 0 ? outerRadius : innerRadius;
                const angle = (i * Math.PI) / spikes - Math.PI / 2;
                if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
                else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
            }
            ctx.closePath();
            ctx.fill();
            break;
        }
        case 'heart': {
            const s = size / 2;
            ctx.beginPath();
            ctx.moveTo(0, s * 0.4);
            ctx.bezierCurveTo(-s, -s * 0.3, -s * 0.5, -s, 0, -s * 0.4);
            ctx.bezierCurveTo(s * 0.5, -s, s, -s * 0.3, 0, s * 0.4);
            ctx.fill();
            break;
        }
        case 'sparkle': {
            const r = size / 2;
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI) / 2;
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
                ctx.lineTo(Math.cos(angle + Math.PI / 4) * r * 0.3, Math.sin(angle + Math.PI / 4) * r * 0.3);
            }
            ctx.closePath();
            ctx.fill();
            break;
        }
        default:
            ctx.beginPath();
            ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
            ctx.fill();
    }
    ctx.restore();
}

export const ParticleSystem: React.FC<ParticleSystemProps> = ({
    effects,
    width,
    height,
    className,
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const emittersRef = useRef<Map<string, ParticleEmitter>>(new Map());
    const animFrameRef = useRef<number>(0);
    const debugLoggedRef = useRef(false);

    const safeWidth = Math.max(0, Math.min(width, 4096));
    const safeHeight = Math.max(0, Math.min(height, 4096));

    const effectKeys = useMemo(() => Object.keys(effects).sort().join(','), [effects]);

    // Debug: log mount and dimensions
    if (!debugLoggedRef.current && safeWidth > 0 && safeHeight > 0) {
        console.log('[ParticleSystem] Mounted with', Object.keys(effects).length, 'effects, dimensions:', safeWidth, 'x', safeHeight);
        debugLoggedRef.current = true;
    }

    // Sync emitters with effects
    useEffect(() => {
        const currentTags = new Set(Object.keys(effects));
        const emitters = emittersRef.current;

        // Remove old emitters
        for (const tag of emitters.keys()) {
            if (!currentTags.has(tag)) {
                emitters.delete(tag);
            }
        }

        // Add/update emitters
        for (const [tag, effect] of Object.entries(effects) as [string, ParticleSystemProps['effects'][string]][]) {
            const existing = emitters.get(tag);
            if (existing) {
                existing.config = resolveConfig(effect.config);
                existing.fadingOut = !!effect.fadingOut;
                existing.fadeOutDuration = effect.fadeOutDuration || 1;
            } else {
                emitters.set(tag, {
                    tag,
                    config: resolveConfig(effect.config),
                    particles: [],
                    accumulatedEmit: 0,
                    fadingOut: !!effect.fadingOut,
                    fadeOpacity: 1,
                    fadeOutDuration: effect.fadeOutDuration || 1,
                });
                console.log('[ParticleSystem] Added emitter:', tag, 'preset:', effect.config?.preset, 'emitRate:', resolveConfig(effect.config).emitRate);
            }
        }
    }, [effectKeys, effects]);

    // Animation loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || safeWidth <= 0 || safeHeight <= 0) {
            console.log('[ParticleSystem] Animation loop skipped: canvas=', !!canvas, 'dimensions:', safeWidth, 'x', safeHeight);
            return;
        }

        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        canvas.width = Math.floor(safeWidth * dpr);
        canvas.height = Math.floor(safeHeight * dpr);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('[ParticleSystem] Failed to get 2D context');
            return;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        let lastTime = performance.now();
        let frameCount = 0;

        console.log('[ParticleSystem] Animation loop started. Canvas:', canvas.width, 'x', canvas.height, 'DPR:', dpr);

        const loop = (now: number) => {
            try {
            const dt = Math.min((now - lastTime) / 1000, 0.1); // cap at 100ms
            lastTime = now;
            frameCount++;

            ctx.clearRect(0, 0, safeWidth, safeHeight);

            const emitters = emittersRef.current;
            
            // Debug: log emitter state every 60 frames (~1 second)
            if (frameCount % 60 === 1) {
                let totalParticles = 0;
                for (const em of emitters.values()) {
                    totalParticles += em.particles.length;
                }
                if (emitters.size > 0 || totalParticles > 0) {
                    console.log('[ParticleSystem] Frame', frameCount, '| Emitters:', emitters.size, '| Total particles:', totalParticles);
                }
            }
            
            for (const emitter of emitters.values()) {
                const config = emitter.config;
                const blendMode = config.blendMode || 'source-over';

                // Update fade
                if (emitter.fadingOut) {
                    emitter.fadeOpacity = Math.max(0, emitter.fadeOpacity - dt / emitter.fadeOutDuration);
                }

                // Emit new particles (only if not fading out)
                if (!emitter.fadingOut) {
                    emitter.accumulatedEmit += (config.emitRate || 10) * dt;
                    while (emitter.accumulatedEmit >= 1) {
                        emitter.accumulatedEmit -= 1;
                        const angle = config.directionMin + Math.random() * (config.directionMax - config.directionMin);
                        const rad = (angle * Math.PI) / 180;
                        const speed = config.speedMin + Math.random() * (config.speedMax - config.speedMin);
                        const emitX = ((config.emitterX - config.emitterWidth / 2) + Math.random() * config.emitterWidth) / 100 * safeWidth;
                        const emitY = ((config.emitterY - config.emitterHeight / 2) + Math.random() * config.emitterHeight) / 100 * safeHeight;

                        emitter.particles.push({
                            x: emitX,
                            y: emitY,
                            vx: Math.cos(rad) * speed,
                            vy: -Math.sin(rad) * speed,
                            size: config.sizeMin + Math.random() * (config.sizeMax - config.sizeMin),
                            color: config.colors[Math.floor(Math.random() * config.colors.length)] || '#FFFFFF',
                            life: config.lifetime,
                            maxLife: config.lifetime,
                            rotation: Math.random() * 360,
                            rotationSpeed: config.rotationSpeed * (Math.random() > 0.5 ? 1 : -1),
                            shape: config.shape || 'circle',
                            opacity: config.opacity ?? 1,
                        });
                    }
                }

                // Update and draw particles
                ctx.globalCompositeOperation = blendMode as GlobalCompositeOperation;
                emitter.particles = emitter.particles.filter(p => {
                    p.life -= dt;
                    if (p.life <= 0) return false;

                    p.vy += (config.gravity || 0) * dt;
                    p.vx += (config.wind || 0) * dt;
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.rotation += p.rotationSpeed * dt;

                    const lifeRatio = p.life / p.maxLife;
                    let opacity = p.opacity * emitter.fadeOpacity;
                    let size = p.size;

                    if (config.fadeOut) {
                        opacity *= lifeRatio;
                    }
                    if (config.shrink) {
                        size *= lifeRatio;
                    }

                    if (opacity > 0.01 && size > 0.1) {
                        drawShape(ctx, p.shape, p.x, p.y, size, p.rotation, p.color, opacity);
                    }

                    return true;
                });
                ctx.globalCompositeOperation = 'source-over';
            }

            } catch (err) {
                console.error('[ParticleSystem] Error in animation loop:', err);
            }
            animFrameRef.current = requestAnimationFrame(loop);
        };

        animFrameRef.current = requestAnimationFrame(loop);
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [safeWidth, safeHeight]);

    if (safeWidth <= 0 || safeHeight <= 0 || Object.keys(effects).length === 0) return null;

    return (
        <canvas
            ref={canvasRef}
            className={className}
            style={{
                position: 'absolute',
                inset: 0,
                width: safeWidth,
                height: safeHeight,
                pointerEvents: 'none',
                zIndex: 6, // above characters (z-5), below dialogue (z-20)
            }}
        />
    );
};
