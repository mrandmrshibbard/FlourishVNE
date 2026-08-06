/**
 * projectDiff.ts — entity-level diff between two VNProjects, for the Compare & Merge
 * (collaborative authoring) feature. Phase 1: read-only.
 *
 * Diff is computed PER ENTITY, matched by stable id, within each category (scenes,
 * characters, assets, screens, variables, …). It is NEVER a raw JSON/text diff — the
 * UI renders the entities in human terms. This module only classifies and pairs them.
 *
 * Matching by id is meaningful when the two projects share an ancestor (one person
 * created + shared the project, both edited copies). Independent projects share no
 * ids, so everything reads as "new" — which degrades gracefully into an import picker.
 *
 * Editor-only (not bundled into the game engine).
 */
import { VNProject } from '../types/project';

export type DiffStatus = 'new' | 'changed' | 'identical' | 'yoursOnly';

/** Render hint so the detail view can show each entity the friendly way. */
export type EntityKind =
    | 'scene' | 'character' | 'imageAsset' | 'audioAsset' | 'videoAsset'
    | 'screen' | 'variable' | 'commonEvent' | 'generic';

export interface DiffEntry {
    id: string;
    name: string;
    status: DiffStatus;
    theirs?: any; // entity object from the collaborator's project
    yours?: any;  // entity object from your project
}

export interface DiffCategory {
    key: string;
    label: string;
    kind: EntityKind;
    entries: DiffEntry[];
    counts: { new: number; changed: number; identical: number; yoursOnly: number };
}

export interface ProjectDiff {
    categories: DiffCategory[];
    totals: { new: number; changed: number; identical: number; yoursOnly: number };
}

/** Stable stringify (recursively sorted keys) so key-order never causes a false "changed". */
function stableStringify(value: any): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function entityName(entity: any, id: string): string {
    if (entity && typeof entity === 'object') {
        for (const f of ['name', 'title', 'label']) {
            if (typeof entity[f] === 'string' && entity[f].trim()) return entity[f];
        }
    }
    return id;
}

export type CatDef = { key: string; label: string; kind: EntityKind; get: (p: VNProject) => Record<string, any> | undefined };

export const CATEGORIES: CatDef[] = [
    { key: 'scenes', label: 'Scenes', kind: 'scene', get: p => p.scenes },
    { key: 'characters', label: 'Characters', kind: 'character', get: p => p.characters },
    { key: 'backgrounds', label: 'Backgrounds', kind: 'imageAsset', get: p => p.backgrounds },
    { key: 'images', label: 'Images', kind: 'imageAsset', get: p => p.images },
    { key: 'audio', label: 'Audio', kind: 'audioAsset', get: p => p.audio },
    { key: 'videos', label: 'Videos', kind: 'videoAsset', get: p => p.videos },
    { key: 'uiScreens', label: 'UI Screens', kind: 'screen', get: p => p.uiScreens },
    { key: 'variables', label: 'Variables', kind: 'variable', get: p => p.variables },
    { key: 'commonEvents', label: 'Common Events', kind: 'commonEvent', get: p => p.commonEvents },
    { key: 'items', label: 'Items', kind: 'generic', get: p => p.items },
    { key: 'itemCollections', label: 'Item Collections', kind: 'generic', get: p => p.itemCollections },
    { key: 'stats', label: 'Stats', kind: 'generic', get: p => p.stats },
    { key: 'textboxThemes', label: 'Textbox Themes', kind: 'generic', get: p => p.textboxThemes },
    { key: 'fonts', label: 'Fonts', kind: 'generic', get: p => p.fonts },
    { key: 'cgGallery', label: 'CG Gallery', kind: 'generic', get: p => p.cgGallery?.entries },
    { key: 'musicGallery', label: 'Music Gallery', kind: 'generic', get: p => p.musicGallery?.entries },
];

function diffCategory(def: CatDef, yours: VNProject, theirs: VNProject): DiffCategory {
    const yourRec = def.get(yours) || {};
    const theirRec = def.get(theirs) || {};
    const ids = new Set<string>([...Object.keys(yourRec), ...Object.keys(theirRec)]);
    const entries: DiffEntry[] = [];
    const counts = { new: 0, changed: 0, identical: 0, yoursOnly: 0 };

    for (const id of ids) {
        const y = yourRec[id];
        const t = theirRec[id];
        let status: DiffStatus;
        if (y === undefined && t !== undefined) status = 'new';
        else if (y !== undefined && t === undefined) status = 'yoursOnly';
        else status = stableStringify(y) === stableStringify(t) ? 'identical' : 'changed';
        counts[status]++;
        entries.push({ id, name: entityName(t ?? y, id), status, theirs: t, yours: y });
    }

    // Sort: changed → new → yoursOnly → identical, then by name.
    const order: Record<DiffStatus, number> = { changed: 0, new: 1, yoursOnly: 2, identical: 3 };
    entries.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));

    return { key: def.key, label: def.label, kind: def.kind, entries, counts };
}

/** Compare the collaborator's project (`theirs`) against your open project (`yours`). */
export function diffProjects(yours: VNProject, theirs: VNProject): ProjectDiff {
    const categories = CATEGORIES.map(def => diffCategory(def, yours, theirs))
        // Drop categories that are empty in both projects.
        .filter(c => c.entries.length > 0);

    const totals = { new: 0, changed: 0, identical: 0, yoursOnly: 0 };
    for (const c of categories) {
        totals.new += c.counts.new;
        totals.changed += c.counts.changed;
        totals.identical += c.counts.identical;
        totals.yoursOnly += c.counts.yoursOnly;
    }
    return { categories, totals };
}

/** True when the two projects appear to share an ancestor (any matching entity ids). */
export function sharesAncestry(diff: ProjectDiff): boolean {
    return diff.totals.changed + diff.totals.identical > 0;
}
