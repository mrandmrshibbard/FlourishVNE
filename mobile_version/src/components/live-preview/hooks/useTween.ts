/**
 * useTween - React hook to subscribe to TweenManager updates for a specific target.
 * Returns the current interpolated property values, or null if no tween is active.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { TweenManager, TweenableProperties, TweenTargetType } from '../systems/tweenManager';

/**
 * Subscribe to tween interpolation values for a specific target element.
 * Re-renders the component each frame while a tween is active for this target.
 */
export function useTween(
    targetId: string,
    targetType: TweenTargetType
): TweenableProperties | null {
    const [values, setValues] = useState<TweenableProperties | null>(
        () => TweenManager.getCurrentValues(targetId, targetType)
    );
    const targetIdRef = useRef(targetId);
    const targetTypeRef = useRef(targetType);
    targetIdRef.current = targetId;
    targetTypeRef.current = targetType;

    useEffect(() => {
        const unsubscribe = TweenManager.subscribe((tweens) => {
            let found: TweenableProperties | null = null;
            for (const tween of tweens.values()) {
                if (tween.targetId === targetIdRef.current && tween.targetType === targetTypeRef.current && !tween.finished) {
                    found = tween.current;
                    break;
                }
            }
            // When no active tween, fall back to resting (post-tween) values so the
            // element holds its final tweened state instead of snapping back to base.
            if (found === null) {
                found = TweenManager.getCurrentValues(targetIdRef.current, targetTypeRef.current);
            }
            // Only update if values changed or tween ended
            setValues((prev) => {
                if (found === null && prev === null) return prev;
                return found;
            });
        });

        return unsubscribe;
    }, []);

    // Re-sync when the target changes (keeps resting values if present)
    useEffect(() => {
        setValues(TweenManager.getCurrentValues(targetId, targetType));
    }, [targetId, targetType]);

    return values;
}
