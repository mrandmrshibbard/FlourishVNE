/**
 * Stable identifiers for every translatable string in a project.
 *
 * 🔴 The whole design rests on this: a key is built from the **stable VNIDs** the project already
 * carries, never from the text and never from a position. That matters because the alternative is
 * what Ren'Py does — it hashes the label and the statement, so editing a line changes its id and
 * orphans the translation, and authors have to remember to pin a manual `id` clause to avoid it.
 * Here, an author can fix a typo, reword a line, or reorder an entire scene and every translation
 * stays attached.
 *
 * It also replaces the previous scheme (`sceneId_cmd_3` — a POSITION), where inserting one command
 * silently shifted every translation below it onto the wrong line.
 *
 * Format: `scope:id[:sub:id…]:field`. VNIDs contain no colons, so `:` is a safe separator.
 */
import { VNID } from '../../types';

export type TranslationKey = string;

/** Which part of the game a string belongs to — becomes the sheet name in an exported workbook. */
export type TranslationGroup =
    | 'Dialogue'
    | 'Choices'
    | 'Characters'
    | 'Items'
    | 'Screens'
    | 'Phone'
    | 'Mini-games'
    | 'Glossary'
    | 'Map'
    | 'Credits'
    | 'Other';

const join = (...parts: (string | number)[]): TranslationKey => parts.join(':');

export const translationKey = {
    /** A field on a scene or common-event command, e.g. `cmd:a3f9:text`. */
    command: (commandId: VNID, field = 'text') => join('cmd', commandId, field),
    /** One option of a Choice, keyed by the option's own id — reordering options is safe. */
    choiceOption: (commandId: VNID, optionId: VNID, field = 'text') =>
        join('cmd', commandId, 'option', optionId, field),
    /** A repeated sub-entry that has no id of its own (credit lines, phone replies). Index is
     *  used only as a last resort; see `indexedNote` for why that's acceptable here. */
    commandEntry: (commandId: VNID, entry: string, index: number, field: string) =>
        join('cmd', commandId, entry, index, field),
    character: (characterId: VNID, field = 'name') => join('char', characterId, field),
    item: (itemId: VNID, field: string) => join('item', itemId, field),
    itemCollection: (collectionId: VNID, field: string) => join('coll', collectionId, field),
    screenElement: (screenId: VNID, elementId: VNID, field: string) =>
        join('screen', screenId, 'el', elementId, field),
    dropdownOption: (screenId: VNID, elementId: VNID, optionId: VNID) =>
        join('screen', screenId, 'el', elementId, 'opt', optionId, 'label'),
    glossary: (entryId: VNID, field: string) => join('glossary', entryId, field),
    glossaryAlternative: (entryId: VNID, index: number) => join('glossary', entryId, 'alt', index),
    mapLocation: (mapId: VNID, locationId: VNID, field: string) =>
        join('map', mapId, 'loc', locationId, field),
    miniGame: (gameId: VNID, field: string) => join('minigame', gameId, field),
    miniGameStage: (gameId: VNID, stageId: VNID, field: string) =>
        join('minigame', gameId, 'stage', stageId, field),
};

/**
 * A few structures repeat without ids of their own — credit lines, phone replies, glossary
 * alternatives. Those fall back to an index, which means reordering them detaches their
 * translation. It's a deliberately contained compromise: they're short, flat, rarely reordered
 * lists, and the alternative (minting ids into existing project data) would be a migration that
 * touches saves. If it becomes a real problem, give those entries ids and bump the key scheme.
 */
export const indexedNote = 'Reordering these detaches their translation; ids are used everywhere else.';

/** The scope segment, for grouping/filtering without re-deriving the key. */
export function keyScope(key: TranslationKey): string {
    return key.split(':', 1)[0] ?? '';
}
