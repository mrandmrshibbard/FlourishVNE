/**
 * Assemble emitted commands into scenes.
 *
 * 🔴 The whole prologue is ONE scene holding its 10 labels, NOT ten scenes. In Flourish a
 * same-scene `JumpToLabel` keeps the stage exactly as it is, while a cross-scene jump wipes stage
 * and UI state and stops the music (see `freshSceneStage` in controlFlowHandler). Ren'Py's `jump`
 * does none of that, and all of the prologue's internal jumps land mid-story with sprites up - so
 * splitting labels into scenes would blank the screen at every one of them.
 *
 * Two more rules the engine forces:
 *  - **Every scene needs an explicit terminator.** With none, the runtime falls through to the
 *    next scene in `Object.keys(project.scenes)` order, which is insertion order and not a story
 *    decision. 31 of 48 scenes in the old build had no terminator.
 *  - **Every jump must resolve.** The prologue jumps to five labels (`boating`, `happiness`,
 *    `late_shift`, `reflection`, `serendipity`) that are defined NOWHERE in `game/*.rpy` - they
 *    belong to later Steps. Each gets a labelled marker in `sc_out_of_scope`, so the jump lands
 *    on something unmistakable instead of dangling.
 */
import type { VNCommand, VNScene } from '../ir/engineContract';
import { CT } from '../ir/engineContract';

export const PROLOGUE_SCENE_ID = 'sc_prologue';
export const OUT_OF_SCOPE_SCENE_ID = 'sc_out_of_scope';

export interface SceneAssembly {
    scenes: Record<string, VNScene>;
    startSceneId: string;
    /** Labels referenced by a jump but defined nowhere in the converted source. */
    externalTargets: string[];
}

const isLabel = (c: VNCommand): boolean => (c as unknown as { type: string }).type === CT.Label;
const labelId = (c: VNCommand): string => (c as unknown as { labelId: string }).labelId;

/** Every label defined in a command list. */
export function definedLabels(commands: VNCommand[]): Set<string> {
    return new Set(commands.filter(isLabel).map(labelId));
}

/** Every label a `JumpToLabel` targets. */
export function jumpTargets(commands: VNCommand[]): Set<string> {
    const out = new Set<string>();
    for (const c of commands) {
        const cc = c as unknown as { type: string; labelId?: string };
        if (cc.type === CT.JumpToLabel && cc.labelId) out.add(cc.labelId);
    }
    return out;
}

export interface AssembleOptions {
    /** Deterministic id generator. */
    nextId(prefix: string): string;
    /** Scene name shown in the editor. */
    sceneName?: string;
}

export function assembleScenes(commands: VNCommand[], opts: AssembleOptions): SceneAssembly {
    const defined = definedLabels(commands);
    const external = [...jumpTargets(commands)].filter(t => !defined.has(t)).sort();

    const body = [...commands];

    // An explicit terminator, so the end of the prologue is a decision rather than whatever scene
    // happens to be next in insertion order.
    if (external.length) {
        body.push({
            id: opts.nextId('cmd'), type: CT.Group,
            name: 'END OF CONVERTED CONTENT - the story continues in a later Step',
            commandIds: [], collapsed: true,
        } as unknown as VNCommand);
    }
    body.push({
        id: opts.nextId('cmd'), type: CT.Jump, targetSceneId: OUT_OF_SCOPE_SCENE_ID,
    } as unknown as VNCommand);

    // One labelled marker per unresolved target: the jump resolves, and the player lands on a
    // marker that says exactly what is missing instead of on a dead end.
    const outOfScope: VNCommand[] = [];
    for (const target of external) {
        outOfScope.push({ id: opts.nextId('cmd'), type: CT.Label, labelId: target } as unknown as VNCommand);
        outOfScope.push({
            id: opts.nextId('cmd'), type: CT.Group,
            // No quote characters: a marker name must never look like story text (linter L10).
            name: `NOT CONVERTED - ${target} belongs to a later Step`,
            commandIds: [], collapsed: true,
        } as unknown as VNCommand);
        outOfScope.push({
            id: opts.nextId('cmd'), type: CT.Wait, duration: 0, waitIndefinitelyForInput: true,
        } as unknown as VNCommand);
    }
    // The out-of-scope scene terminates too - into itself, so it can never fall through.
    outOfScope.push({
        id: opts.nextId('cmd'), type: CT.Wait, duration: 0, waitIndefinitelyForInput: true,
    } as unknown as VNCommand);

    const scenes: Record<string, VNScene> = {
        [PROLOGUE_SCENE_ID]: {
            id: PROLOGUE_SCENE_ID,
            name: opts.sceneName ?? 'Prologue',
            commands: body,
        } as unknown as VNScene,
        [OUT_OF_SCOPE_SCENE_ID]: {
            id: OUT_OF_SCOPE_SCENE_ID,
            name: 'Not yet converted',
            commands: outOfScope,
        } as unknown as VNScene,
    };

    return { scenes, startSceneId: PROLOGUE_SCENE_ID, externalTargets: external };
}
