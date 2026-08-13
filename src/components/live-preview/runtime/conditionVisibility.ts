/**
 * How a screen element hides when its visibility conditions say so. Engine code.
 *
 * The default is a hard unmount — the element is simply not rendered, exactly as it always was
 * (a hidden video stops, a hidden input drops focus; systems depend on the immediate pop).
 *
 * 🔴 With `conditionTransition: 'fade'` the element instead STAYS MOUNTED and fades its opacity,
 * because CSS can only transition something that exists on both sides of the change. Staying
 * mounted is exactly why fade is opt-in rather than the new default: a mounted-but-invisible
 * video keeps playing and a mounted input keeps its state, which would change existing games.
 * While hidden it must be inert (pointer-events none), or an invisible button is still clickable.
 */
export interface ConditionVisibility {
    /** False = don't render at all (the legacy hard unmount). */
    mount: boolean;
    /** Styles to merge onto the element wrapper when mounted. */
    style: {
        opacity?: number;
        pointerEvents?: 'none';
        transition?: string;
    };
}

export function conditionVisibilityOf(
    conditionsMet: boolean,
    element: { conditionTransition?: 'fade'; conditionTransitionDuration?: number },
): ConditionVisibility {
    if (element.conditionTransition !== 'fade') {
        return { mount: conditionsMet, style: {} };
    }
    const seconds = element.conditionTransitionDuration ?? 0.3;
    return {
        mount: true,
        style: {
            opacity: conditionsMet ? undefined : 0,
            ...(conditionsMet ? {} : { pointerEvents: 'none' as const }),
            transition: `opacity ${seconds}s ease`,
        },
    };
}
