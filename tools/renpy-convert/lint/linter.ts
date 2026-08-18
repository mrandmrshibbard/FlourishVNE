/**
 * Structural checks over the emitted project.
 *
 * Every rule here exists because the previous build shipped a project that violated it while
 * looking fine: the operators were invented, the hides pointed at nothing, the overlays all sat
 * at one default position, and most of the art was a 64x64 tinted square. A converter that cannot
 * fail is a converter that ships those silently, so these run on every conversion and an error is
 * fatal.
 *
 * CONTENT RULE: findings carry command ids, types and counts - never dialogue text.
 */
import type { VNCommand, VNProject, VNScene } from '../ir/engineContract';
import { CT, OPERATORS } from '../ir/engineContract';
import { jumpTargets } from '../emit/scenes';

export interface Finding {
    rule: string;
    severity: 'error' | 'warning';
    message: string;
}

const VALID_OPERATORS = new Set<string>(Object.values(OPERATORS as Record<string, string>));
const VALID_TYPES = new Set<string>(Object.values(CT as Record<string, string>));

/** Command types that end a scene rather than falling through to the next one. */
const TERMINATORS = new Set<string>([CT.Jump, CT.JumpToLabel, CT.Choice]);

type AnyCmd = Record<string, unknown> & { id: string; type: string };

const allCommands = (project: VNProject): AnyCmd[] => {
    const out: AnyCmd[] = [];
    for (const scene of Object.values(project.scenes ?? {}) as VNScene[]) {
        out.push(...(scene.commands as unknown as AnyCmd[]));
    }
    return out;
};

export function lintProject(project: VNProject): Finding[] {
    const findings: Finding[] = [];
    const err = (rule: string, message: string) => findings.push({ rule, severity: 'error', message });
    const warn = (rule: string, message: string) => findings.push({ rule, severity: 'warning', message });

    const scenes = Object.values(project.scenes ?? {}) as VNScene[];
    const commands = allCommands(project);

    // L1 - every command has a unique id and a type the engine knows.
    const seen = new Set<string>();
    for (const c of commands) {
        if (!c.id) { err('L1', `command of type ${c.type} has no id`); continue; }
        if (seen.has(c.id)) err('L1', `duplicate command id ${c.id}`);
        seen.add(c.id);
        if (!VALID_TYPES.has(c.type)) err('L1', `unknown command type ${c.type} (${c.id})`);
    }

    // L2 - every condition uses an operator from the engine union and names a real variable.
    // This is defect 2's guard: invented names evaluated to false and skipped most of the game.
    for (const c of commands) {
        for (const cond of (c.conditions as { operator: string; variableId: string }[] | undefined) ?? []) {
            if (!VALID_OPERATORS.has(cond.operator)) {
                err('L2', `command ${c.id} uses operator "${cond.operator}", which the engine cannot evaluate`);
            }
            if (!cond.variableId) err('L2', `command ${c.id} has a condition with no variable`);
            else if (project.variables && !(cond.variableId in project.variables)) {
                err('L2', `command ${c.id} conditions on unknown variable ${cond.variableId}`);
            }
        }
    }

    // L5 - every HideImage/HideText points at a Show command that precedes it in the same scene.
    // The old build emitted `elementId`, which the engine never reads, so all 73 were no-ops.
    for (const scene of scenes) {
        const shownBefore = new Set<string>();
        for (const raw of scene.commands as unknown as AnyCmd[]) {
            if (raw.type === CT.ShowImage || raw.type === CT.ShowText) shownBefore.add(raw.id);
            if (raw.type !== CT.HideImage && raw.type !== CT.HideText) continue;
            const target = raw.targetCommandId as string | undefined;
            if (!target) { err('L5', `${raw.type} ${raw.id} has no targetCommandId`); continue; }
            if (!shownBefore.has(target)) {
                err('L5', `${raw.type} ${raw.id} targets ${target}, which no preceding Show in scene ${scene.id} created`);
            }
            if ('elementId' in raw) err('L5', `${raw.type} ${raw.id} carries elementId, which the engine ignores`);
        }
    }

    // L6 - every scene ends in something that decides where to go next.
    for (const scene of scenes) {
        const cmds = scene.commands as unknown as AnyCmd[];
        const last = cmds[cmds.length - 1];
        if (!last) { err('L6', `scene ${scene.id} has no commands`); continue; }
        const terminated = TERMINATORS.has(last.type)
            || (last.type === CT.Wait && last.waitIndefinitelyForInput === true);
        if (!terminated) {
            err('L6', `scene ${scene.id} ends with ${last.type}; it would fall through to whichever scene is next in insertion order`);
        }
    }

    // L7 - every jump resolves, and no label id is defined twice.
    // Count RAW label occurrences, not the per-scene deduped set - two labels with the same id in
    // ONE scene is the case that actually misroutes a jump, and a Set would hide it.
    const defined = new Map<string, number>();
    for (const c of commands) {
        if (c.type !== CT.Label) continue;
        const id = c.labelId as string;
        if (id) defined.set(id, (defined.get(id) ?? 0) + 1);
    }
    for (const [label, count] of defined) {
        if (count > 1) err('L7', `label "${label}" is defined ${count} times; JumpToLabel would resolve to the first`);
    }
    for (const scene of scenes) {
        for (const target of jumpTargets(scene.commands as VNCommand[])) {
            if (!defined.has(target)) err('L7', `scene ${scene.id} jumps to label "${target}", which nothing defines`);
        }
    }
    for (const c of commands) {
        if (c.type !== CT.Jump) continue;
        const target = c.targetSceneId as string | undefined;
        if (!target || !(target in (project.scenes ?? {}))) {
            err('L7', `Jump ${c.id} targets scene "${target}", which does not exist`);
        }
    }
    if (project.startSceneId && !(project.startSceneId in (project.scenes ?? {}))) {
        err('L7', `startSceneId "${project.startSceneId}" is not a scene`);
    }

    // L8 - geometry stays in range, and no overlay is left at the tell-tale default.
    // 233 of 235 ShowImage commands sat at exactly 50/50/100/100 in the old build.
    let defaults = 0;
    for (const c of commands) {
        if (c.type === CT.ShowImage) {
            const { x, y, width, height } = c as unknown as { x: number; y: number; width: number; height: number };
            if (x === 50 && y === 50 && width === 100 && height === 100) defaults++;
            if (!(x >= -200 && x <= 300) || !(y >= -200 && y <= 300)) {
                err('L8', `ShowImage ${c.id} is positioned off-stage at ${x}/${y}`);
            }
        }
        if (c.type === CT.ShowCharacter) {
            const scale = (c.scale as number | undefined) ?? 1;
            if (!(scale >= 0.05 && scale <= 8)) err('L8', `ShowCharacter ${c.id} has scale ${scale}`);
            const pos = c.position as { x?: number; y?: number } | string | undefined;
            if (pos && typeof pos === 'object') {
                const { x = 0, y = 0 } = pos;
                if (!(x >= -200 && x <= 300) || !(y >= -200 && y <= 300)) {
                    err('L8', `ShowCharacter ${c.id} is positioned off-stage at ${x}/${y}`);
                }
            }
        }
    }
    if (defaults > 0) {
        err('L8', `${defaults} ShowImage commands sit at the untouched default 50/50/100/100`);
    }

    // L10 - a marker is a Group and never carries story text.
    for (const c of commands) {
        if (c.type !== CT.Group) continue;
        const name = (c.name as string) ?? '';
        if (name.startsWith('UNCONVERTED [') && !/^UNCONVERTED \[G\d{4}\] [a-z-]+ - [\w.]+:\d+$/.test(name)) {
            err('L10', `marker ${c.id} is not in the expected form: ${name}`);
        }
        if (name.includes('"')) err('L10', `marker ${c.id} contains a quoted string`);
    }

    // L11 - nothing references an asset id the project does not carry.
    const pools: Record<string, Set<string>> = {
        imageId: new Set([
            ...Object.keys(project.images ?? {}),
            ...Object.keys(project.backgrounds ?? {}),
            ...Object.keys(project.videos ?? {}),
        ]),
        audioId: new Set(Object.keys(project.audio ?? {})),
        characterId: new Set(Object.keys(project.characters ?? {})),
        variableId: new Set(Object.keys(project.variables ?? {})),
    };
    for (const c of commands) {
        for (const [field, pool] of Object.entries(pools)) {
            const value = c[field];
            if (typeof value !== 'string' || !value) continue;
            if (!pool.has(value)) err('L11', `${c.type} ${c.id} references missing ${field} "${value}"`);
        }
    }

    // L12 - no data: URL anywhere. The old archive base64'd every asset into project.json and
    // reached 229.9 MB, which is also what made the export path fragile.
    const scan = (value: unknown, path: string): void => {
        if (typeof value === 'string') {
            if (value.startsWith('data:')) err('L12', `data: URL at ${path}`);
            return;
        }
        if (Array.isArray(value)) { value.forEach((v, i) => scan(v, `${path}[${i}]`)); return; }
        if (value && typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) scan(v, `${path}.${k}`);
        }
    };
    scan(project.scenes, 'scenes');

    // A project with no story at all is a failure, not an empty success.
    if (!commands.length) err('L0', 'the project contains no commands');
    if (!scenes.length) err('L0', 'the project contains no scenes');

    return findings;
}

export function formatFindings(findings: Finding[]): string {
    if (!findings.length) return 'lint: clean';
    const byRule = new Map<string, number>();
    for (const f of findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
    const summary = [...byRule.entries()].sort().map(([r, n]) => `${r}=${n}`).join(' ');
    return [`lint: ${findings.length} findings (${summary})`, ...findings.map(f => `  [${f.rule}] ${f.message}`)].join('\n');
}
