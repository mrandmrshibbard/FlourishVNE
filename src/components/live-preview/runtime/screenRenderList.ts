/**
 * Which screens render, in what order, from a screen stack. Engine code (ships in built games).
 *
 * The stacks (`screenStack`, `hudStack`) are navigation HISTORY — before this helper, the JSX
 * rendered only the top entry, so opening a screen visually replaced the one beneath even though
 * Return To Previous Screen still worked. `showScreensBeneath` turns a screen into a popup: the
 * screens under it keep rendering, inert, until it closes.
 *
 * 🔴 With no screen flagged, every branch here reproduces the OLD inline JSX logic exactly —
 * including the pop-close crossfade ordering and unrelated mid-close screens. The baseline-parity
 * tests pin that; existing projects must render pixel-identically.
 *
 * Pulled out as a pure function because the same rules serve both stacks (menu + HUD, which
 * differ only in the implied base) and because "which screens are visible" is exactly the kind of
 * logic that silently regresses when it lives inline in a 17k-line component.
 */
import { VNID } from '../../../types';

export interface RenderableScreen {
    id: VNID;
    /** Mid fade-out. The renderer keys on this so the transitionOut animation reliably plays. */
    isClosing: boolean;
    /** Rendered but not interactive — a screen showing beneath a popup, or a popup fading out
     *  ABOVE the screen the player is returning to. The renderer applies `inert`. */
    inert: boolean;
}

export interface ScreenRenderListInput {
    /** The navigation stack, bottom → top. */
    stack: readonly VNID[];
    /** What renders when the stack runs out beneath a popup chain: the default Game HUD id for
     *  the HUD block, null for the menu block. */
    impliedBaseId?: VNID | null;
    /** Screens by id; only `showScreensBeneath` is read. Missing id = deleted screen. */
    screens: Record<string, { showScreensBeneath?: boolean } | undefined>;
    closingScreens: ReadonlySet<VNID>;
    /** Safety cap on rendered screens (popup chains shouldn't be bottomless). Includes the top. */
    maxDepth?: number;
}

/**
 * The screens to render, bottom → top (DOM order = stacking order).
 *
 * Rules, in author language:
 * - Normally only the top screen shows (plus any screens mid fade-out, beneath it).
 * - A screen with "Keep screens beneath visible" shows the screens under it too — walking down
 *   until a normal screen forms the opaque base. On the HUD stack, running out of screens while
 *   still on popups reveals the default Game HUD as the floor.
 * - Only the top screen is clickable; everything shown beneath it is inert.
 * - When a popup CLOSES, it fades out above the still-visible base (a popup dismissing) — unlike
 *   normal navigation, where the revealed screen fades in on top (a crossfade).
 */
export function computeScreenRenderList(input: ScreenRenderListInput): RenderableScreen[] {
    const { stack, impliedBaseId = null, screens, closingScreens } = input;
    const maxDepth = Math.max(1, input.maxDepth ?? 4);

    const showsBeneath = (id: VNID | null | undefined): boolean =>
        !!(id && screens[id]?.showScreensBeneath);

    /** Bottom→top chain ending at `top`: walk down while screens are flagged, skipping deleted
     *  ids and repeats, closing with one unflagged base (or the implied base off the stack end). */
    const chainEndingAt = (top: VNID, topIndexInStack: number): VNID[] => {
        const collected: VNID[] = [top];
        let current: VNID = top;
        let index = topIndexInStack;
        while (showsBeneath(current) && collected.length < maxDepth) {
            let next: VNID | null = null;
            for (let i = index - 1; i >= 0; i--) {
                const candidate = stack[i];
                if (!screens[candidate]) continue;               // deleted — keep walking down
                if (collected.includes(candidate)) continue;     // the stack can repeat ids
                next = candidate;
                index = i;
                break;
            }
            if (next === null) {
                // Ran out of stack still on popups: the implied base (default Game HUD) is the floor.
                if (impliedBaseId && screens[impliedBaseId] && !collected.includes(impliedBaseId)) {
                    collected.push(impliedBaseId);
                }
                break;
            }
            collected.push(next);
            current = next;
        }
        return collected.reverse();
    };

    const top: VNID | null = stack.length > 0 ? stack[stack.length - 1] : (impliedBaseId ?? null);
    if (!top) return [];

    const topClosing = closingScreens.has(top);

    if (topClosing && stack.length >= 2) {
        if (showsBeneath(top)) {
            /* Popup close: the chain that was visible beneath stays exactly where it is (stable
             * keys keep it mounted, so nothing replays a transition), and the popup fades out ON
             * TOP. The fading popup must not eat clicks — nothing on a dismissing popup should be
             * pressable — so it renders inert; the revealed chain-top is live immediately. */
            const beneathChain = chainEndingAt(stack[stack.length - 2], stack.length - 2);
            const entries: RenderableScreen[] = beneathChain.map((id, i) => ({
                id,
                isClosing: false,
                inert: i < beneathChain.length - 1,
            }));
            entries.push({ id: top, isClosing: true, inert: true });
            return entries;
        }
        // Normal pop close (crossfade): leaving screen below, revealed screen entering on top —
        // same ordering as a forward navigation, so the fade works in both directions.
        const revealedChain = chainEndingAt(stack[stack.length - 2], stack.length - 2);
        return [
            { id: top, isClosing: true, inert: false },
            ...revealedChain.map((id, i) => ({
                id,
                isClosing: false,
                inert: i < revealedChain.length - 1,
            })),
        ];
    }

    const entries: RenderableScreen[] = [];
    // Unrelated screens mid fade-out render first (earlier in DOM = beneath).
    for (const id of stack) {
        if (id !== top && closingScreens.has(id)) {
            entries.push({ id, isClosing: true, inert: false });
        }
    }
    const chain = chainEndingAt(top, stack.length - 1);
    for (let i = 0; i < chain.length; i++) {
        const id = chain[i];
        const isTop = i === chain.length - 1;
        entries.push({
            id,
            isClosing: isTop ? closingScreens.has(id) : false,
            inert: !isTop,
        });
    }
    return entries;
}
