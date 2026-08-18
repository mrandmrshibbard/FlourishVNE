import { VNID } from '../../../types';

/** Extra context a UI action can carry from wherever it was fired. */
export interface UIActionOpts {
    /** CallCommonEvent only: the caller already advanced currentIndex, so return to it, not past it. */
    resumeAtCurrent?: boolean;
    /** The screen the button that fired this action lives on. Injected by UIScreenRenderer. */
    ownerScreenId?: VNID;
}

/**
 * Which screen a "Close Screen" action should close.
 *
 * The editor's "the screen this button is on" option is stored as the ABSENCE of a target, and
 * the runtime used to resolve that to whatever screen was topmost. That is right only while the
 * button's own screen happens to be on top — with a popup over it, or the button sitting on the
 * game HUD, it closed the wrong screen and the button's own screen stayed put (which then read
 * as the screen "toggling" or refusing to close).
 *
 * Order: an explicitly chosen screen wins; otherwise the screen the button lives on; otherwise
 * the old topmost behavior, which still covers scene hot-spots, stage buttons, timers and
 * plugin-driven actions — none of which live on a screen. That tail keeps every project that
 * never hit the ambiguity byte-identical.
 */
export function resolveCloseTarget(args: {
    explicit?: VNID;
    ownerScreenId?: VNID;
    hudStack: VNID[];
    screenStack: VNID[];
}): VNID | undefined {
    const { explicit, ownerScreenId, hudStack, screenStack } = args;
    if (explicit) return explicit;
    if (ownerScreenId && (hudStack.includes(ownerScreenId) || screenStack.includes(ownerScreenId))) {
        return ownerScreenId;
    }
    return hudStack[hudStack.length - 1] ?? screenStack[screenStack.length - 1];
}
