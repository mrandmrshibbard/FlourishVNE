/**
 * Credit Roll Command Handler
 * Handles the CreditRoll command by signalling LivePreview to show scroll overlay
 */

import { CreditRollCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';

/**
 * Handles the CreditRoll command.
 * Returns advance: false so LivePreview blocks until the overlay animation completes.
 * The actual rendering is done by LivePreview's credit-roll overlay.
 */
export function handleCreditRoll(
    command: CreditRollCommand,
    _ctx: CommandContext
): CommandResult {
    // Do not auto-advance – LivePreview will render the overlay and
    // call advance() when the animation ends or the player skips.
    return { advance: false };
}
