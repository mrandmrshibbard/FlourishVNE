/**
 * The single traversal over everything a player can read.
 *
 * 🔴 One walker, two behaviours. The extractor (what the translator sees) and the applier (what
 * the running game reads) MUST agree about what is translatable and what its key is — if they
 * drift, a string is either untranslatable or, worse, translated into a key nothing reads. So
 * there is exactly one traversal here and both callers drive it with a visitor.
 *
 * Each site reports a `path` rather than a setter, so the applier can rebuild the project with
 * structural sharing — copying only the objects along each changed path. A project can hold
 * megabytes of embedded media, so deep-cloning it on every language switch is not an option.
 *
 * Adding a newly translatable field should be a one-line change to a table in this file.
 */
import { VNID } from '../../types';
import { CommandType } from '../../features/scene/types';
import { translationKey, TranslationGroup, TranslationKey } from './translationKeys';

/** One translatable string found in the project. */
export interface TextSite {
    key: TranslationKey;
    /** The author's original text. */
    value: string;
    /** Where it lives, in words a translator can use to judge tone — "Scene "Rooftop" · Mia". */
    where: string;
    group: TranslationGroup;
    /** Property path from the project root, for structural-sharing writes. */
    path: (string | number)[];
}

export type TextVisitor = (site: TextSite) => void;

/* ── What counts as translatable, per command type ──────────────────────────────────────────
 * Deliberately a table: adding a field is one line, and it's obvious at a glance what is and
 * isn't shown to players. Editor-only labels (a Group's name, a scene's name) are NOT here. */
const COMMAND_TEXT_FIELDS: Partial<Record<string, string[]>> = {
    [CommandType.Dialogue]: ['text'],
    [CommandType.ShowText]: ['text'],
    [CommandType.ShowButton]: ['text'],
    [CommandType.TextInput]: ['prompt', 'placeholder'],
    [CommandType.ShowPhoneText]: ['text'],
    [CommandType.PhoneIncomingText]: ['text'],
    [CommandType.PhoneNotify]: ['title', 'text'],
};

/** Which sheet a command's strings belong on. */
const commandGroup = (type: string): TranslationGroup => {
    if (type === CommandType.Choice) return 'Choices';
    if (type === CommandType.CreditRoll) return 'Credits';
    if (typeof type === 'string' && type.startsWith('Phone')) return 'Phone';
    if (type === CommandType.ShowPhoneText) return 'Phone';
    return 'Dialogue';
};

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/**
 * Walk every player-facing string in the project.
 *
 * `visit` is called once per string, in a stable order (scenes in project order, commands in
 * scene order), so an exported spreadsheet reads like the story rather than like a hash dump.
 */
export function visitTranslatableText(project: any, visit: TextVisitor): void {
    if (!project) return;

    const characterName = (id: VNID | null | undefined): string =>
        (id && project.characters?.[id]?.name) || '';

    /** Commands live in scenes and in common events; both are walked the same way. */
    const walkCommands = (commands: any[], basePath: (string | number)[], context: string) => {
        (commands || []).forEach((cmd, index) => {
            if (!cmd?.id) return;
            const at = [...basePath, index];
            const speaker = cmd.characterId ? characterName(cmd.characterId) : '';
            const where = speaker ? `${context} · ${speaker}` : context;
            const group = commandGroup(cmd.type);

            for (const field of COMMAND_TEXT_FIELDS[cmd.type] || []) {
                if (isText(cmd[field])) {
                    visit({ key: translationKey.command(cmd.id, field), value: cmd[field], where, group, path: [...at, field] });
                }
            }

            if (cmd.type === CommandType.Choice) {
                (cmd.options || []).forEach((opt: any, oi: number) => {
                    if (!opt?.id || !isText(opt.text)) return;
                    visit({
                        key: translationKey.choiceOption(cmd.id, opt.id),
                        value: opt.text, where: `${context} · choice`, group: 'Choices',
                        path: [...at, 'options', oi, 'text'],
                    });
                });
            }

            if (cmd.type === CommandType.CreditRoll) {
                (cmd.entries || []).forEach((entry: any, ei: number) => {
                    for (const field of ['label', 'value']) {
                        if (!isText(entry?.[field])) continue;
                        visit({
                            key: translationKey.commandEntry(cmd.id, 'credit', ei, field),
                            value: entry[field], where: `${context} · credits`, group: 'Credits',
                            path: [...at, 'entries', ei, field],
                        });
                    }
                });
            }

            // Phone replies and follow-ups: short lists without ids of their own.
            for (const listName of ['replies', 'followUps', 'lines']) {
                (cmd[listName] || []).forEach((entry: any, ei: number) => {
                    if (!isText(entry?.text)) return;
                    visit({
                        key: translationKey.commandEntry(cmd.id, listName, ei, 'text'),
                        value: entry.text, where: `${context} · phone`, group: 'Phone',
                        path: [...at, listName, ei, 'text'],
                    });
                });
            }
        });
    };

    for (const [sceneId, scene] of Object.entries<any>(project.scenes || {})) {
        walkCommands(scene?.commands, ['scenes', sceneId, 'commands'], `Scene "${scene?.name || sceneId}"`);
    }
    for (const [eventId, event] of Object.entries<any>(project.commonEvents || {})) {
        walkCommands(event?.commands, ['commonEvents', eventId, 'commands'], `Event "${event?.name || eventId}"`);
    }

    // Characters are referenced by id everywhere, so their name is translated ONCE here and the
    // whole game follows — the one place the data model already gave us translate-once for free.
    for (const [id, character] of Object.entries<any>(project.characters || {})) {
        if (isText(character?.name)) {
            visit({ key: translationKey.character(id), value: character.name, where: 'Character', group: 'Characters', path: ['characters', id, 'name'] });
        }
    }

    for (const [id, item] of Object.entries<any>(project.items || {})) {
        for (const field of ['name', 'description']) {
            if (isText(item?.[field])) {
                visit({ key: translationKey.item(id, field), value: item[field], where: `Item "${item.name || id}"`, group: 'Items', path: ['items', id, field] });
            }
        }
    }
    for (const [id, collection] of Object.entries<any>(project.itemCollections || {})) {
        for (const field of ['name', 'description']) {
            if (isText(collection?.[field])) {
                visit({ key: translationKey.itemCollection(id, field), value: collection[field], where: `Item list "${collection.name || id}"`, group: 'Items', path: ['itemCollections', id, field] });
            }
        }
    }

    /* Screen elements each name their text differently; listing the fields is clearer than
     * trying to be clever, and it keeps editor-only properties out by construction. */
    const ELEMENT_TEXT_FIELDS = ['text', 'label', 'placeholder', 'emptyText', 'emptySlotText',
        'prevButtonText', 'nextButtonText', 'prevPageText', 'nextPageText', 'useButtonText',
        'randomizeLabel', 'resetLabel', 'noSongText'];
    for (const [screenId, screen] of Object.entries<any>(project.uiScreens || {})) {
        const where = `Screen "${screen?.name || screenId}"`;
        for (const [elementId, element] of Object.entries<any>(screen?.elements || {})) {
            for (const field of ELEMENT_TEXT_FIELDS) {
                if (isText(element?.[field])) {
                    visit({ key: translationKey.screenElement(screenId, elementId, field), value: element[field], where, group: 'Screens', path: ['uiScreens', screenId, 'elements', elementId, field] });
                }
            }
            (element?.options || []).forEach((opt: any, oi: number) => {
                if (!opt?.id || !isText(opt.label)) return;
                visit({ key: translationKey.dropdownOption(screenId, elementId, opt.id), value: opt.label, where, group: 'Screens', path: ['uiScreens', screenId, 'elements', elementId, 'options', oi, 'label'] });
            });
        }
    }

    // ⚠ `project.glossary` is NOT a flat record — it's `{ entries, settings }`. Walking it as a
    // record would treat `settings` as a glossary entry. (Caught by running this against a real
    // project; a hand-written fixture had the wrong shape and happily passed.)
    for (const [id, entry] of Object.entries<any>(project.glossary?.entries || {})) {
        for (const field of ['term', 'title', 'description', 'extra']) {
            if (isText(entry?.[field])) {
                visit({ key: translationKey.glossary(id, field), value: entry[field], where: `Glossary "${entry.term || id}"`, group: 'Glossary', path: ['glossary', 'entries', id, field] });
            }
        }
        (entry?.alternatives || []).forEach((alt: string, ai: number) => {
            if (!isText(alt)) return;
            visit({ key: translationKey.glossaryAlternative(id, ai), value: alt, where: `Glossary "${entry.term || id}"`, group: 'Glossary', path: ['glossary', 'entries', id, 'alternatives', ai] });
        });
    }

    // Locations are an ARRAY, but each carries its own id — so the key stays id-based (stable
    // across reordering) while the path stays index-based (that's where the value lives).
    for (const [mapId, map] of Object.entries<any>(project.maps || {})) {
        (map?.locations || []).forEach((loc: any, li: number) => {
            if (!loc?.id) return;
            for (const field of ['name', 'label']) {
                if (isText(loc?.[field])) {
                    visit({ key: translationKey.mapLocation(mapId, loc.id, field), value: loc[field], where: `Map "${map.name || mapId}"`, group: 'Map', path: ['maps', mapId, 'locations', li, field] });
                }
            }
        });
    }

    for (const [gameId, game] of Object.entries<any>(project.miniGames || {})) {
        const where = `Mini-game "${game?.name || gameId}"`;
        for (const field of ['title', 'instructions', 'introText']) {
            if (isText(game?.[field])) {
                visit({ key: translationKey.miniGame(gameId, field), value: game[field], where, group: 'Mini-games', path: ['miniGames', gameId, field] });
            }
        }
        (game?.stages || []).forEach((stage: any, si: number) => {
            if (!stage?.id || !isText(stage.instructions)) return;
            visit({ key: translationKey.miniGameStage(gameId, stage.id, 'instructions'), value: stage.instructions, where, group: 'Mini-games', path: ['miniGames', gameId, 'stages', si, 'instructions'] });
        });
    }
}

/** Everything translatable, in reading order. Drives the workspace table and the export. */
export function collectTranslatableText(project: any): TextSite[] {
    const sites: TextSite[] = [];
    visitTranslatableText(project, site => sites.push(site));
    return sites;
}

/**
 * Immutable set along a path, copying ONLY the objects on that path — everything else stays
 * referentially identical. This is what lets a language switch avoid deep-cloning a project
 * that may hold megabytes of embedded media.
 */
export function setIn<T>(root: T, path: (string | number)[], value: unknown): T {
    if (path.length === 0) return value as T;
    const [head, ...rest] = path;
    const node: any = root;
    if (node == null) return root;
    const child = setIn(node[head as any], rest, value);
    if (child === node[head as any]) return root;                 // nothing changed — share it
    if (Array.isArray(node)) {
        const copy = node.slice();
        copy[head as number] = child;
        return copy as unknown as T;
    }
    return { ...node, [head]: child };
}
