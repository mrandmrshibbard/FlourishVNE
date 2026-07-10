import { VNProject } from '../types/project';
import { UIActionType } from '../types/shared';

/**
 * Map locations used to travel via a single `targetSceneId` (an implicit "jump to scene" that ran
 * AFTER any extra `actions`). Locations now carry a full ordered `actions` list where the scene
 * jump is just one entry, so authors can add/reorder button actions on a tap.
 *
 * This migration folds each location's legacy `targetSceneId` into its `actions` as a TRAILING
 * `JumpToScene` (preserving the old "extra actions, then jump last" order) and clears the legacy
 * field. It is:
 *   - additive/lossless — the same travel still happens, in the same order;
 *   - idempotent — once `targetSceneId` is cleared there is nothing left to fold, and it returns
 *     the original project reference when nothing changed (cheap to run on every load).
 * The runtime keeps honouring a leftover `targetSceneId` too, so an un-migrated project still works.
 */
export function migrateMapLocationActions(project: VNProject): VNProject {
    const maps = project.maps;
    if (!maps) return project;
    let anyChanged = false;
    const nextMaps: Record<string, any> = {};
    for (const [mapId, map] of Object.entries(maps)) {
        const locations = (map as any)?.locations;
        if (!Array.isArray(locations)) { nextMaps[mapId] = map; continue; }
        let mapChanged = false;
        const nextLocations = locations.map((loc: any) => {
            if (!loc || !loc.targetSceneId) return loc;
            const actions = Array.isArray(loc.actions) ? [...loc.actions] : [];
            const alreadyJumps = actions.some((a: any) => a && a.type === UIActionType.JumpToScene && a.targetSceneId === loc.targetSceneId);
            if (!alreadyJumps) actions.push({ type: UIActionType.JumpToScene, targetSceneId: loc.targetSceneId });
            mapChanged = true;
            const { targetSceneId, ...rest } = loc;
            return { ...rest, actions };
        });
        if (mapChanged) { anyChanged = true; nextMaps[mapId] = { ...(map as any), locations: nextLocations }; }
        else nextMaps[mapId] = map;
    }
    return anyChanged ? ({ ...project, maps: nextMaps } as VNProject) : project;
}
