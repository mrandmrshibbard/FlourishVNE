/**
 * projectMerge.ts — Phase 2 of Compare & Merge (see COLLAB_MERGE_PLAN.md): selectively
 * IMPORT entities from a collaborator's project into yours. Phase 2 is ADDITIVE only —
 * it brings in entities that are NEW (present in theirs, absent in yours) plus their
 * dependency closure. It never overwrites your existing entities (changed-in-both is
 * Phase 3) and never deletes anything.
 *
 * Dependency closure is computed by scanning an entity for id-strings that match known
 * entity ids (entity ids ARE the record keys, so any stored structural reference is just
 * that id). A referenced id already in YOUR project is satisfied; one that's NEW in theirs
 * is pulled in too (recursively); one in neither is flagged as a broken reference.
 *
 * Editor-only (not bundled into the game engine).
 */
import { VNProject } from '../types/project';
import { CATEGORIES } from './projectDiff';

export interface EntityRef { category: string; id: string; }
/** 'add' = new to your project; 'replace' = exists in yours and will be OVERWRITTEN with theirs. */
export type ImportMode = 'add' | 'replace';
export interface ImportItem extends EntityRef { name: string; pulledIn: boolean; mode: ImportMode; }
export interface ImportPlan {
    /** Everything that will be brought in: the user's picks + pulled-in dependencies. */
    toImport: ImportItem[];
    /** References (id-strings) found in imported entities that exist in NEITHER project. */
    broken: Array<{ fromName: string; refId: string }>;
}

const recordFor = (project: VNProject, key: string): Record<string, any> | undefined => {
    const def = CATEGORIES.find(c => c.key === key);
    return def?.get(project);
};

const nameOf = (entity: any, id: string): string => {
    for (const f of ['name', 'title', 'label']) if (typeof entity?.[f] === 'string' && entity[f].trim()) return entity[f];
    return id;
};

/** Map every entity id → its category, across all collections of a project. */
export function buildIdIndex(project: VNProject): Map<string, string> {
    const idx = new Map<string, string>();
    for (const def of CATEGORIES) {
        const rec = def.get(project);
        if (!rec) continue;
        for (const id of Object.keys(rec)) if (!idx.has(id)) idx.set(id, def.key);
    }
    return idx;
}

/** Recursively collect every string value in an entity (candidate references). */
function collectStrings(value: any, out: Set<string>): void {
    if (value == null) return;
    if (typeof value === 'string') { if (value.length < 80) out.add(value); return; } // ids are short; skip data-URLs/long text
    if (Array.isArray(value)) { for (const v of value) collectStrings(v, out); return; }
    if (typeof value === 'object') { for (const v of Object.values(value)) collectStrings(v, out); }
}

/**
 * Given the user's selected NEW entities, compute the full set to import (selection +
 * dependency closure that is itself new in theirs) plus any broken references.
 */
export function computeImportPlan(yours: VNProject, theirs: VNProject, selected: EntityRef[]): ImportPlan {
    const yoursIdx = buildIdIndex(yours);
    const theirsIdx = buildIdIndex(theirs);

    const toImport = new Map<string, ImportItem>();
    const broken: Array<{ fromName: string; refId: string }> = [];
    const seenBroken = new Set<string>();
    const queue: Array<EntityRef & { pulledIn: boolean }> = selected.map(s => ({ ...s, pulledIn: false }));

    while (queue.length) {
        const ref = queue.shift()!;
        if (toImport.has(ref.id)) continue;
        const rec = recordFor(theirs, ref.category);
        const entity = rec?.[ref.id];
        if (!entity) continue; // not actually in theirs (shouldn't happen for a valid pick)
        const name = nameOf(entity, ref.id);
        // 'replace' if your project already has this id (a changed-in-both conflict you chose to
        // take from theirs); otherwise 'add'. Pulled-in dependencies are always new ('add').
        const mode: ImportMode = yoursIdx.has(ref.id) ? 'replace' : 'add';
        toImport.set(ref.id, { category: ref.category, id: ref.id, name, pulledIn: ref.pulledIn, mode });

        // Scan this entity for references to other entities.
        const strings = new Set<string>();
        collectStrings(entity, strings);
        for (const s of strings) {
            if (s === ref.id) continue;
            if (yoursIdx.has(s)) continue;            // already in your project → satisfied
            if (theirsIdx.has(s)) {                   // new dependency → pull it in
                if (!toImport.has(s)) queue.push({ category: theirsIdx.get(s)!, id: s, pulledIn: true });
            } else if (/^[a-z]+-[a-z0-9]{4,}$/i.test(s) && !seenBroken.has(ref.id + '|' + s)) {
                // An id-shaped reference (e.g. "char-ab12cd") in NEITHER project → broken.
                seenBroken.add(ref.id + '|' + s);
                broken.push({ fromName: name, refId: s });
            }
        }
    }

    return { toImport: Array.from(toImport.values()), broken };
}

const writableRecord = (project: VNProject, key: string): Record<string, any> => {
    if (key === 'cgGallery') {
        const p = project as any;
        if (!p.cgGallery) p.cgGallery = { entries: {}, unlockScope: 'global', columns: 4 };
        if (!p.cgGallery.entries) p.cgGallery.entries = {};
        return p.cgGallery.entries;
    }
    if (key === 'musicGallery') {
        const p = project as any;
        if (!p.musicGallery) p.musicGallery = { entries: {} };
        if (!p.musicGallery.entries) p.musicGallery.entries = {};
        return p.musicGallery.entries;
    }
    const p = project as any;
    if (!p[key]) p[key] = {};
    return p[key];
};

/** Return a NEW project with the given entities (deep-copied from theirs) added. Additive. */
export function applyImport(yours: VNProject, theirs: VNProject, toImport: EntityRef[]): VNProject {
    const merged: VNProject = JSON.parse(JSON.stringify(yours));
    for (const { category, id } of toImport) {
        const src = recordFor(theirs, category)?.[id];
        if (src === undefined) continue;
        writableRecord(merged, category)[id] = JSON.parse(JSON.stringify(src));
    }
    return merged;
}
