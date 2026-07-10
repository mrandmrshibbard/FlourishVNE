/**
 * "Player's Character" resolution.
 *
 * A Character Creator lets the player choose one of several characters, customize its outfit, and
 * name it. Those choices live in two persistent string variables pointed to by the project:
 *   - project.ui.playerCharacterVarId     → the chosen base character's id
 *   - project.ui.playerCharacterNameVarId → the player-entered display name
 *
 * Commands/elements with `characterSource === 'player'` resolve the character (and speaker name)
 * through these helpers instead of a hard-coded id. Everything is defensive: if nothing has been
 * chosen yet, or the pointers/variables are missing, the helpers return null so callers can fall
 * back gracefully. Additive-optional — projects without a Character Creator never touch this.
 */
import { VNProject } from '../types/project';
import { VNID } from '../types';

type VarStore = Record<string, string | number | boolean>;

/** The character id the player chose, or null if unset / invalid / no creator configured. */
export function resolvePlayerCharacterId(project: VNProject, variables: VarStore): VNID | null {
    const varId = project.ui?.playerCharacterVarId;
    if (!varId) return null;
    const raw = variables?.[varId];
    const id = raw == null ? '' : String(raw);
    return id && project.characters[id] ? id : null;
}

/** The player-entered name, or null if unset / empty / no creator configured. */
export function resolvePlayerCharacterName(project: VNProject, variables: VarStore): string | null {
    const varId = project.ui?.playerCharacterNameVarId;
    if (!varId) return null;
    const raw = variables?.[varId];
    const name = raw == null ? '' : String(raw);
    return name.trim() ? name : null;
}

/** Resolve the effective character id for a command, honoring `characterSource: 'player'`.
 *  Returns null only when 'player' is requested but nothing valid is chosen yet. */
export function resolveCommandCharacterId(
    command: { characterId: VNID | null; characterSource?: 'fixed' | 'player' },
    project: VNProject,
    variables: VarStore,
): VNID | null {
    if (command.characterSource === 'player') {
        return resolvePlayerCharacterId(project, variables);
    }
    return command.characterId ?? null;
}
