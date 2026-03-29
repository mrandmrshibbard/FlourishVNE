/**
 * TweenManager - Manages interpolation of stage element properties over time.
 * 
 * Runs a single requestAnimationFrame loop that drives all active tweens.
 * Each tween targets a specific overlay/character by ID and animates
 * numeric properties with configurable easing.
 */

import { applyEasing, lerp, lerpColor, EasingType } from './easingFunctions';

/** Numeric properties that can be tweened on any overlay/character */
export interface TweenableProperties {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    opacity?: number;
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
    fontSize?: number;
    borderRadius?: number;
    scale?: number; // character scale
    // Color properties
    color?: string;
    backgroundColor?: string;
    tintColor?: string;
}

export type TweenTargetType = 'character' | 'image' | 'text' | 'button' | 'imageMap' | 'screen';

export interface ActiveTween {
    /** Unique tween ID */
    id: string;
    /** ID of the target element (characterId, overlay id, etc.) */
    targetId: string;
    /** Type of target element */
    targetType: TweenTargetType;
    /** Starting property values (captured at tween start) */
    from: TweenableProperties;
    /** Target property values */
    to: TweenableProperties;
    /** Easing function to use */
    easing: EasingType;
    /** Duration in milliseconds */
    duration: number;
    /** Timestamp when the tween started */
    startTime: number;
    /** Current interpolated values */
    current: TweenableProperties;
    /** Callback when tween completes */
    onComplete?: () => void;
    /** Whether this tween has finished */
    finished: boolean;
}

type TweenUpdateCallback = (tweens: Map<string, ActiveTween>) => void;

let nextTweenId = 0;

class TweenManagerImpl {
    private tweens = new Map<string, ActiveTween>();
    /** Stores final tween values after completion so they persist visually without mutating stage state */
    private restingValues = new Map<string, TweenableProperties>();
    private rafId: number | null = null;
    private listeners = new Set<TweenUpdateCallback>();
    private lastFrameTime = 0;

    private static restingKey(targetId: string, targetType: TweenTargetType): string {
        return `${targetType}:${targetId}`;
    }

    /**
     * Start a new tween. Replaces any existing tween on the same target+property set.
     */
    start(config: {
        targetId: string;
        targetType: TweenTargetType;
        from: TweenableProperties;
        to: TweenableProperties;
        easing?: EasingType;
        duration: number; // seconds
        onComplete?: () => void;
    }): string {
        const id = `tween_${++nextTweenId}`;

        // Cancel any existing tween on the same target
        const rkey = TweenManagerImpl.restingKey(config.targetId, config.targetType);
        for (const [existingId, existing] of this.tweens) {
            if (existing.targetId === config.targetId && existing.targetType === config.targetType) {
                existing.finished = true;
                this.tweens.delete(existingId);
            }
        }
        // Clear resting values since a new tween is starting
        this.restingValues.delete(rkey);

        const tween: ActiveTween = {
            id,
            targetId: config.targetId,
            targetType: config.targetType,
            from: { ...config.from },
            to: { ...config.to },
            easing: config.easing || 'easeInOutCubic',
            duration: config.duration * 1000,
            startTime: performance.now(),
            current: { ...config.from },
            onComplete: config.onComplete,
            finished: false,
        };

        this.tweens.set(id, tween);
        this.ensureRunning();
        return id;
    }

    /**
     * Cancel a tween by ID.
     */
    cancel(tweenId: string): void {
        this.tweens.delete(tweenId);
        if (this.tweens.size === 0) this.stop();
    }

    /**
     * Cancel all tweens for a specific target.
     */
    cancelForTarget(targetId: string, targetType?: TweenTargetType): void {
        for (const [id, tween] of this.tweens) {
            if (tween.targetId === targetId && (!targetType || tween.targetType === targetType)) {
                this.tweens.delete(id);
            }
        }
        // Also clear resting values
        if (targetType) {
            this.restingValues.delete(TweenManagerImpl.restingKey(targetId, targetType));
        } else {
            for (const key of this.restingValues.keys()) {
                if (key.endsWith(`:${targetId}`)) this.restingValues.delete(key);
            }
        }
        if (this.tweens.size === 0) this.stop();
    }

    /**
     * Cancel all active tweens.
     */
    cancelAll(): void {
        this.tweens.clear();
        this.restingValues.clear();
        this.stop();
    }

    /**
     * Get the current interpolated values for a target, or null if no tween is active.
     */
    getCurrentValues(targetId: string, targetType: TweenTargetType): TweenableProperties | null {
        // Active tween takes priority
        for (const tween of this.tweens.values()) {
            if (tween.targetId === targetId && tween.targetType === targetType && !tween.finished) {
                return tween.current;
            }
        }
        // Then check resting values from completed tweens
        return this.restingValues.get(TweenManagerImpl.restingKey(targetId, targetType)) ?? null;
    }

    /**
     * Get resting (post-tween) values for a target, ignoring active tweens.
     * Used by captureCurrentValues to chain tweens correctly.
     */
    getRestingValues(targetId: string, targetType: TweenTargetType): TweenableProperties | null {
        return this.restingValues.get(TweenManagerImpl.restingKey(targetId, targetType)) ?? null;
    }

    /**
     * Check if a target has an active tween.
     */
    hasTween(targetId: string, targetType?: TweenTargetType): boolean {
        for (const tween of this.tweens.values()) {
            if (tween.targetId === targetId && (!targetType || tween.targetType === targetType) && !tween.finished) {
                return true;
            }
        }
        return false;
    }

    /**
     * Subscribe to tween updates (called every frame while tweens are active).
     */
    subscribe(callback: TweenUpdateCallback): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Get count of active tweens.
     */
    get activeCount(): number {
        return this.tweens.size;
    }

    private ensureRunning(): void {
        if (this.rafId !== null) return;
        this.lastFrameTime = performance.now();
        this.tick();
    }

    private stop(): void {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    private tick = (): void => {
        this.rafId = requestAnimationFrame(this.tick);
        const now = performance.now();
        this.lastFrameTime = now;

        let hasChanges = false;
        const completed: ActiveTween[] = [];

        for (const [id, tween] of this.tweens) {
            const elapsed = now - tween.startTime;
            const rawProgress = Math.min(elapsed / tween.duration, 1);
            const easedProgress = applyEasing(rawProgress, tween.easing);

            // Interpolate each property
            const newCurrent: TweenableProperties = {};

            for (const key of Object.keys(tween.to) as (keyof TweenableProperties)[]) {
                const fromVal = tween.from[key];
                const toVal = tween.to[key];

                if (fromVal === undefined || toVal === undefined) continue;

                if (typeof fromVal === 'number' && typeof toVal === 'number') {
                    (newCurrent as any)[key] = lerp(fromVal, toVal, easedProgress);
                } else if (typeof fromVal === 'string' && typeof toVal === 'string') {
                    // Color interpolation
                    (newCurrent as any)[key] = lerpColor(fromVal, toVal, easedProgress);
                }
            }

            tween.current = newCurrent;
            hasChanges = true;

            if (rawProgress >= 1) {
                tween.finished = true;
                // Store final values as resting so they persist visually
                this.restingValues.set(
                    TweenManagerImpl.restingKey(tween.targetId, tween.targetType),
                    { ...tween.to }
                );
                completed.push(tween);
                this.tweens.delete(id);
            }
        }

        if (hasChanges) {
            this.notifyListeners();
        }

        // Fire completion callbacks after notifying (so final values are applied)
        for (const tween of completed) {
            tween.onComplete?.();
        }

        if (this.tweens.size === 0) {
            this.stop();
        }
    };

    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener(this.tweens);
        }
    }
}

/** Singleton TweenManager instance */
export const TweenManager = new TweenManagerImpl();
