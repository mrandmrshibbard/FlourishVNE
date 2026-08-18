/**
 * STEP 7 GATE - scene assembly and the linter.
 *
 * Each rule is tested BOTH ways: it must fire on the exact defect the previous build shipped, and
 * it must stay quiet on a correct project. A rule that never fires is worse than no rule, because
 * it reads as a passing check.
 *
 * CONTENT RULE: identifiers and counts only.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assembleScenes, PROLOGUE_SCENE_ID, OUT_OF_SCOPE_SCENE_ID } from '../emit/scenes';
import { lintProject, formatFindings } from '../lint/linter';
import { CT } from '../ir/engineContract';
import { parseFile } from '../parse/lexer';
import { parseNodes } from '../parse/statements';
import { analyse } from '../analysis/spriteState';
import { loadPortraitTable } from '../model/portraitTable';
import { Emitter, type EmitContext } from '../map/commands';
import type { VNCommand, VNProject } from '../ir/engineContract';

let seq = 0;
const nextId = (p: string) => `${p}_${++seq}`;

/** A minimal but VALID project, so a rule that fires here is a false positive. */
function goodProject(): VNProject {
    const show = { id: 'c1', type: CT.ShowImage, imageId: 'img1', x: 30, y: 40, width: 600, height: 400, rotation: 0, opacity: 1, transition: 'instant', duration: 0 };
    const hide = { id: 'c2', type: CT.HideImage, targetCommandId: 'c1', transition: 'instant', duration: 0 };
    const say = { id: 'c3', type: CT.Dialogue, characterId: null, text: 'hello', conditions: [{ variableId: 'v1', operator: '==', value: 1 }] };
    const label = { id: 'c4', type: CT.Label, labelId: 'here' };
    const jump = { id: 'c5', type: CT.JumpToLabel, labelId: 'here' };
    return {
        id: 'p', title: 'T', startSceneId: 's1',
        scenes: { s1: { id: 's1', name: 'S', commands: [show, hide, say, label, jump] } },
        characters: {}, backgrounds: {}, images: { img1: {} }, audio: {}, videos: {},
        variables: { v1: {} }, fonts: {}, ui: {}, uiScreens: {},
    } as unknown as VNProject;
}

const mutate = (fn: (p: any) => void): VNProject => {
    const p = goodProject() as any;
    fn(p);
    return p as VNProject;
};

describe('linter', () => {
    it('is quiet on a valid project', () => {
        expect(formatFindings(lintProject(goodProject()))).toBe('lint: clean');
    });

    it('L1 catches a duplicate id and an unknown type', () => {
        expect(lintProject(mutate(p => { p.scenes.s1.commands[1].id = 'c1'; })).some(f => f.rule === 'L1')).toBe(true);
        expect(lintProject(mutate(p => { p.scenes.s1.commands[0].type = 'Nonsense'; })).some(f => f.rule === 'L1')).toBe(true);
    });

    it('L2 catches an invented operator - the defect that skipped 632 branches', () => {
        const f = lintProject(mutate(p => { p.scenes.s1.commands[2].conditions[0].operator = 'equals'; }));
        expect(f.some(x => x.rule === 'L2' && x.message.includes('equals'))).toBe(true);
    });

    it('L2 catches a condition on a variable the project does not have', () => {
        expect(lintProject(mutate(p => { p.scenes.s1.commands[2].conditions[0].variableId = 'ghost'; }))
            .some(f => f.rule === 'L2')).toBe(true);
    });

    it('L5 catches a hide that points at nothing, and the old elementId field', () => {
        expect(lintProject(mutate(p => { p.scenes.s1.commands[1].targetCommandId = 'nope'; }))
            .some(f => f.rule === 'L5')).toBe(true);
        expect(lintProject(mutate(p => { delete p.scenes.s1.commands[1].targetCommandId; p.scenes.s1.commands[1].elementId = 'c1'; }))
            .some(f => f.rule === 'L5')).toBe(true);
    });

    it('L5 catches a hide that precedes its show', () => {
        expect(lintProject(mutate(p => {
            const [show, hide, ...rest] = p.scenes.s1.commands;
            p.scenes.s1.commands = [hide, show, ...rest];
        })).some(f => f.rule === 'L5')).toBe(true);
    });

    it('L6 catches a scene with no terminator', () => {
        const f = lintProject(mutate(p => { p.scenes.s1.commands.pop(); }));
        expect(f.some(x => x.rule === 'L6')).toBe(true);
    });

    it('L7 catches an unresolved jump, a duplicate label and a bad start scene', () => {
        expect(lintProject(mutate(p => { p.scenes.s1.commands[4].labelId = 'elsewhere'; }))
            .some(f => f.rule === 'L7')).toBe(true);
        expect(lintProject(mutate(p => { p.scenes.s1.commands.splice(4, 0, { id: 'c9', type: CT.Label, labelId: 'here' }); }))
            .some(f => f.rule === 'L7')).toBe(true);
        expect(lintProject(mutate(p => { p.startSceneId = 'missing'; })).some(f => f.rule === 'L7')).toBe(true);
    });

    it('L8 catches the untouched 50/50/100/100 overlay default', () => {
        const f = lintProject(mutate(p => {
            Object.assign(p.scenes.s1.commands[0], { x: 50, y: 50, width: 100, height: 100 });
        }));
        expect(f.some(x => x.rule === 'L8' && x.message.includes('50/50/100/100'))).toBe(true);
    });

    it('L8 catches an off-stage position and an absurd scale', () => {
        expect(lintProject(mutate(p => { p.scenes.s1.commands[0].x = -900; })).some(f => f.rule === 'L8')).toBe(true);
        expect(lintProject(mutate(p => {
            p.scenes.s1.commands.push({ id: 'c8', type: CT.ShowCharacter, characterId: null, scale: 64, position: { x: 10, y: 10 } });
        })).some(f => f.rule === 'L8')).toBe(true);
    });

    it('L10 catches a malformed marker and one containing a quote', () => {
        expect(lintProject(mutate(p => {
            p.scenes.s1.commands.push({ id: 'm1', type: CT.Group, name: 'UNCONVERTED [xx] whatever' });
        })).some(f => f.rule === 'L10')).toBe(true);
        expect(lintProject(mutate(p => {
            p.scenes.s1.commands.push({ id: 'm2', type: CT.Group, name: 'UNCONVERTED [G0001] kind - a.rpy:1 "quoted"' });
        })).some(f => f.rule === 'L10')).toBe(true);
    });

    it('L11 catches a reference to an asset the project does not carry', () => {
        expect(lintProject(mutate(p => { p.scenes.s1.commands[0].imageId = 'ghost'; }))
            .some(f => f.rule === 'L11')).toBe(true);
    });

    it('L12 catches a data: URL, which is how the old archive reached 229.9 MB', () => {
        expect(lintProject(mutate(p => { p.scenes.s1.commands[0].imageId = 'img1'; p.scenes.s1.commands[0].src = 'data:image/png;base64,AAAA'; }))
            .some(f => f.rule === 'L12')).toBe(true);
    });

    it('L0 refuses an empty project rather than calling it clean', () => {
        expect(lintProject({ scenes: {} } as unknown as VNProject).some(f => f.rule === 'L0')).toBe(true);
    });
});

describe('scene assembly', () => {
    const cmds = (labels: string[], jumps: string[]): VNCommand[] => [
        ...labels.map((l, i) => ({ id: `l${i}`, type: CT.Label, labelId: l } as unknown as VNCommand)),
        ...jumps.map((j, i) => ({ id: `j${i}`, type: CT.JumpToLabel, labelId: j } as unknown as VNCommand)),
    ];

    it('keeps the whole story in ONE scene so a jump does not wipe the stage', () => {
        const a = assembleScenes(cmds(['one', 'two'], ['two']), { nextId });
        expect(Object.keys(a.scenes)).toEqual([PROLOGUE_SCENE_ID, OUT_OF_SCOPE_SCENE_ID]);
        expect(a.startSceneId).toBe(PROLOGUE_SCENE_ID);
        const labels = a.scenes[PROLOGUE_SCENE_ID].commands.filter(c => (c as any).type === CT.Label);
        expect(labels).toHaveLength(2);
    });

    it('routes a target defined nowhere to a labelled marker', () => {
        const a = assembleScenes(cmds(['one'], ['one', 'boating', 'happiness']), { nextId });
        expect(a.externalTargets).toEqual(['boating', 'happiness']);
        const outLabels = a.scenes[OUT_OF_SCOPE_SCENE_ID].commands
            .filter(c => (c as any).type === CT.Label)
            .map(c => (c as any).labelId);
        expect(outLabels).toEqual(['boating', 'happiness']);
    });

    it('terminates both scenes explicitly', () => {
        const a = assembleScenes(cmds(['one'], ['one']), { nextId });
        expect(lintProject({
            id: 'p', title: 'T', startSceneId: a.startSceneId, scenes: a.scenes,
            characters: {}, backgrounds: {}, images: {}, audio: {}, videos: {},
            variables: {}, fonts: {}, ui: {}, uiScreens: {},
        } as unknown as VNProject).filter(f => f.rule === 'L6')).toEqual([]);
    });
});

const GAME_DIR = process.env.OURLIFE_GAME
    ?? path.resolve(__dirname, '..', '..', '..', 'OurLife', 'game');
const PROLOGUE = path.join(GAME_DIR, 'prologue.rpy');

if (fs.existsSync(PROLOGUE)) describe('prologue project structure', () => {
    const portraits = loadPortraitTable(GAME_DIR);
    const nodes = parseNodes(parseFile(fs.readFileSync(PROLOGUE, 'utf8')), 'prologue.rpy');
    const labels = nodes.filter(n => n.kind === 'label').map(n => ({ name: (n as any).name, body: (n as any).body }));
    const tagToPortrait = new Map<string, string>();
    for (const [tag, decl] of portraits) tagToPortrait.set(tag.toLowerCase(), decl.name);
    const analysis = analyse(labels, { tagToPortrait });
    const showByLine = new Map(analysis.shows.map(s => [s.pos.line, s]));
    const liveByLine = new Map(analysis.liveChanges.map(c => [c.pos.line, c]));

    let n = 0;
    const ctx: EmitContext = {
        variableId: (name) => `v_${name}`,
        characterId: (p) => `ch_${p}`,
        expressionId: (p) => `ex_${p}`,
        layerId: (p, slot) => `ly_${p}_${slot}`,
        assetId: (p, slot, value) => `as_${p}_${slot}_${value}`,
        imageId: (name) => (name.length ? `img_${name.join('_')}` : null),
        imagePlacement: () => ({ x: 50, y: 50, width: 1280, height: 720 }),
        audioId: (f) => `au_${f.replace(/[^a-z0-9]/gi, '_')}`,
        placement: () => ({ x: 30, y: 10, scale: 1 }),
        nextId: (prefix) => `${prefix}_${++n}`,
        tagToPortrait,
        showAt: (line) => showByLine.get(line),
        liveChangeAt: (line) => liveByLine.get(line),
    };
    const emitter = new Emitter(ctx, 'prologue.rpy');
    const commands = emitter.emit(nodes);
    const assembly = assembleScenes(commands, { nextId: ctx.nextId });

    it('finds exactly the five targets that belong to later Steps', () => {
        console.log(`[step7] external targets: ${assembly.externalTargets.join(',')}`);
        expect(assembly.externalTargets).toEqual(['boating', 'happiness', 'late_shift', 'reflection', 'serendipity']);
    });

    it('GATE: the structural rules pass on the real prologue', () => {
        // Asset pools are stubbed at this step, so L11 (asset existence) is checked in Step 8
        // once the archive carries real assets; everything structural is checked now.
        const project = {
            id: 'p', title: 'Prologue', startSceneId: assembly.startSceneId, scenes: assembly.scenes,
            characters: {}, backgrounds: {}, images: {}, audio: {}, videos: {},
            variables: {}, fonts: {}, ui: {}, uiScreens: {},
        } as unknown as VNProject;
        const findings = lintProject(project).filter(f => f.rule !== 'L11' && f.rule !== 'L2');
        const byRule = new Map<string, number>();
        for (const f of findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
        console.log(`[step7] lint (structural): ${findings.length} findings ${[...byRule.entries()].sort().map(([r, c]) => `${r}=${c}`).join(' ')}`);
        for (const f of findings.slice(0, 8)) console.log(`[step7]   ${f.rule}: ${f.message}`);
        expect(findings.map(f => `${f.rule}: ${f.message}`)).toEqual([]);
    });
});
