/**
 * STEP 7 GATE - command emission.
 *
 * Asset resolution is stubbed here so the emitter can be tested on its own; the real wiring
 * lands with the archive in Step 8. What matters at this stage is the SHAPE of what comes out:
 * the right command types, the right field names, conditions that the engine can evaluate, and
 * one visible marker for anything untranslatable.
 *
 * CONTENT RULE: fixtures are written from scratch; the real-data pass reports counts only.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Emitter, mapTransition, literalValue, type EmitContext } from '../map/commands';
import { CT, OPERATORS } from '../ir/engineContract';
import { parseFile } from '../parse/lexer';
import { parseNodes } from '../parse/statements';
import { analyse } from '../analysis/spriteState';
import { loadPortraitTable } from '../model/portraitTable';
import type { Node } from '../ir/nodes';

/** Everything resolves; ids are deterministic so a run is reproducible. */
function makeCtx(overrides: Partial<EmitContext> = {}): EmitContext {
    let n = 0;
    return {
        variableId: (name) => `v_${name}`,
        characterId: (p) => `ch_${p}`,
        expressionId: (p) => `ex_${p}`,
        layerId: (p, slot) => `ly_${p}_${slot}`,
        assetId: (p, slot, value, grade) => `as_${p}_${slot}_${value}${grade ? '_g' : ''}`,
        imageId: (name) => (name.length ? `img_${name.join('_')}` : null),
        imagePlacement: () => ({ x: 50, y: 50, width: 1280, height: 720 }),
        audioId: (f) => `au_${f.replace(/[^a-z0-9]/gi, '_')}`,
        placement: () => ({ x: 30, y: 10, scale: 1 }),
        nextId: (prefix) => `${prefix}_${++n}`,
        tagToPortrait: new Map([['cove_8', 'Cove_8']]),
        showAt: () => undefined,
        liveChangeAt: () => undefined,
        ...overrides,
    };
}

const ir = (src: string): Node[] => parseNodes(parseFile(src), 'test.rpy');
const emit = (src: string, ctx: EmitContext = makeCtx()) => {
    const e = new Emitter(ctx, 'test.rpy');
    return { commands: e.emit(ir(src)), gaps: e.getGaps() };
};

describe('transitions', () => {
    it('maps the two the game uses, with the right durations', () => {
        // `slowdissolve = Dissolve(1.0)` in the game's script.rpy; Ren'Py's dissolve is 0.5.
        expect(mapTransition('dissolve')).toEqual({ transition: 'dissolve', duration: 0.5 });
        expect(mapTransition('slowdissolve')).toEqual({ transition: 'dissolve', duration: 1.0 });
        expect(mapTransition(null)).toEqual({ transition: 'instant', duration: 0 });
    });

    it('applies a standalone `with` to everything staged since the last interaction', () => {
        // Ren'Py applies one `with` to all pending changes, not just the previous statement.
        const r = emit(['scene bg hill', 'show cove_8 at pos_c8', 'with dissolve'].join('\n'));
        const staged = r.commands.filter(c => (c as any).transition !== undefined);
        expect(staged.length).toBe(2);
        for (const c of staged) {
            expect((c as any).transition).toBe('dissolve');
            expect((c as any).duration).toBe(0.5);
        }
    });
});

describe('dialogue', () => {
    it('emits a Dialogue with the speaker resolved and delimiters swapped', () => {
        const r = emit('c "Hi [first_name]."');
        expect(r.commands).toHaveLength(1);
        expect(r.commands[0]).toMatchObject({
            type: CT.Dialogue, characterId: 'ch_c', text: 'Hi {first_name}.',
        });
    });

    it('emits a narrator line with a null character', () => {
        expect((emit('"Just narration."').commands[0] as any).characterId).toBeNull();
    });
});

describe('variables', () => {
    it('maps = and += onto the engine operators', () => {
        const r = emit(['$ comfort = 2', '$ interest += 1'].join('\n'));
        expect(r.commands[0]).toMatchObject({ type: CT.SetVariable, variableId: 'v_comfort', operator: 'set', value: 2 });
        expect(r.commands[1]).toMatchObject({ operator: 'add', value: 1 });
    });

    it('reads Ren\'Py\'s translation wrapper as a plain string', () => {
        expect(literalValue('_("Jamie")')).toBe('Jamie');
    });

    it('marks an unknown variable instead of inventing an id', () => {
        const r = emit('$ mystery = 1', makeCtx({ variableId: () => null }));
        expect((r.commands[0] as any).type).toBe(CT.Group);
        expect(r.gaps[0]).toMatchObject({ kind: 'unknown-variable', severity: 'blocker' });
    });
});

describe('branches', () => {
    it('emits a full branch with engine operators', () => {
        const r = emit([
            'if comfort == 1:', '    "a"',
            'elif comfort > 2:', '    "b"',
            'else:', '    "c"',
        ].join('\n'));
        const types = r.commands.map(c => c.type);
        expect(types).toEqual([
            CT.BranchStart, CT.Dialogue, CT.BranchElseIf, CT.Dialogue, CT.BranchElse, CT.Dialogue, CT.BranchEnd,
        ]);
        expect((r.commands[0] as any).conditions[0]).toMatchObject({ operator: '==', value: 1 });
        expect((r.commands[2] as any).conditions[0]).toMatchObject({ operator: '>', value: 2 });
        // Every segment of one if shares a branchId.
        const ids = new Set([0, 2, 4, 6].map(i => (r.commands[i] as any).branchId));
        expect(ids.size).toBe(1);
    });

    it('SKIPS the body of an untranslatable condition rather than running it unguarded', () => {
        const r = emit(['if len(x) > 0:', '    "secret"'].join('\n'));
        expect(r.commands.some(c => c.type === CT.Dialogue)).toBe(false);
        expect(r.gaps[0]).toMatchObject({ kind: 'untranslatable-condition', severity: 'blocker' });
    });
});

describe('menus', () => {
    it('turns options into a Choice plus per-option labels', () => {
        const r = emit([
            'menu:', '    "one":', '        "did one"', '    "two":', '        "did two"',
        ].join('\n'));
        const choice = r.commands[0] as any;
        expect(choice.type).toBe(CT.Choice);
        expect(choice.options).toHaveLength(2);
        expect(choice.options[0].actions[0].type).toBe('jumpToLabel');
        // Each body ends by jumping to the shared end label, so options do not fall into each other.
        const labels = r.commands.filter(c => c.type === CT.Label).length;
        const jumps = r.commands.filter(c => c.type === CT.JumpToLabel).length;
        expect(labels).toBe(3);          // two option labels + the end label
        expect(jumps).toBe(2);
    });

    it('carries an option condition through', () => {
        const r = emit(['menu:', '    "take" if tookmoney == True:', '        "took"'].join('\n'));
        expect((r.commands[0] as any).options[0].conditions[0]).toMatchObject({ operator: 'is true' });
    });
});

describe('sprites', () => {
    it('shows a character with layerOverrides from the dataflow', () => {
        const ctx = makeCtx({
            showAt: () => ({
                pos: { line: 1, file: 'test.rpy' }, tag: 'cove_8',
                determinate: { base: 'base', eyes: 'a', glasses: 'none' },
                indeterminate: [], afterHide: false, matrix: null,
            }),
        });
        const r = emit('show cove_8 at pos_c8', ctx);
        const cmd = r.commands[0] as any;
        expect(cmd.type).toBe(CT.ShowCharacter);
        expect(cmd.position).toEqual({ x: 30, y: 10 });
        expect(cmd.layerOverrides['ly_Cove_8_base']).toBe('as_Cove_8_base_base');
        // `none` is the CLEAR sentinel: it must null the layer, never resolve to the 30x54 stub.
        expect(cmd.layerOverrides['ly_Cove_8_glasses']).toBeNull();
    });

    it('emits SetCharacterLayer for an on-stage change and NOTHING when off stage', () => {
        const onStage = makeCtx({
            liveChangeAt: () => ({
                pos: { line: 1, file: 'test.rpy' }, portrait: 'Cove_8', tag: 'cove_8',
                slots: { eyes: 'h' }, determinate: { eyes: 'h' }, matrix: null,
            }),
        });
        const live = emit('$ ChangePortrait(chara="Cove_8", eyes="h")', onStage);
        expect(live.commands[0]).toMatchObject({ type: CT.SetCharacterLayer, characterId: 'ch_Cove_8' });

        // Off stage the call only seeds Ren'Py's dict - emitting a command here is what produced
        // 355 silent no-ops in the previous build.
        const off = emit('$ ChangePortrait(chara="Cove_8", eyes="h")', makeCtx());
        expect(off.commands).toHaveLength(0);
    });
});

describe('markers', () => {
    it('uses a Group, never a Dialogue, and numbers it', () => {
        const r = emit('call some_label');
        expect(r.commands[0].type).toBe(CT.Group);
        expect((r.commands[0] as any).name).toMatch(/^UNCONVERTED \[G0001\] call-label - test\.rpy:1$/);
        expect(r.gaps[0].commandId).toBe((r.commands[0] as any).id);
    });

    it('never emits a Dialogue for an unconvertible construct', () => {
        const r = emit(['call screen relationship(True)', 'nvl clear', 'return'].join('\n'));
        expect(r.commands.every(c => c.type === CT.Group)).toBe(true);
        expect(r.gaps).toHaveLength(3);
    });
});

const GAME_DIR = process.env.OURLIFE_GAME
    ?? path.resolve(__dirname, '..', '..', '..', 'OurLife', 'game');
const PROLOGUE = path.join(GAME_DIR, 'prologue.rpy');

if (fs.existsSync(PROLOGUE)) describe('prologue emission', () => {
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
        assetId: (p, slot, value, grade) => `as_${p}_${slot}_${value}${grade ? '_graded' : ''}`,
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
    const gaps = emitter.getGaps();

    it('emits commands for the whole prologue', () => {
        const byType = new Map<string, number>();
        const walk = (cs: any[]) => { for (const c of cs) byType.set(c.type, (byType.get(c.type) ?? 0) + 1); };
        walk(commands);
        const summary = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ');
        console.log(`[step7] commands=${commands.length} ${summary}`);
        expect(commands.length).toBeGreaterThan(1000);
    });

    it('GATE: every command carries an id and a known type', () => {
        const valid = new Set(Object.values(CT as Record<string, string>));
        const ids = new Set<string>();
        for (const c of commands as any[]) {
            expect(typeof c.id).toBe('string');
            expect(c.id.length).toBeGreaterThan(0);
            expect(ids.has(c.id), `duplicate command id ${c.id}`).toBe(false);
            ids.add(c.id);
            expect(valid.has(c.type), `unknown command type ${c.type}`).toBe(true);
        }
    });

    it('GATE: no branch condition uses an operator outside the engine union', () => {
        const valid = new Set(Object.values(OPERATORS as Record<string, string>));
        let checked = 0;
        for (const c of commands as any[]) {
            for (const cond of c.conditions ?? []) {
                checked++;
                expect(valid.has(cond.operator), `bad operator ${cond.operator}`).toBe(true);
                expect(typeof cond.variableId).toBe('string');
            }
        }
        console.log(`[step7] conditions emitted=${checked}`);
        expect(checked).toBeGreaterThan(0);
    });

    it('targets a HideImage at the Show that created the overlay', () => {
        const hides = (commands as any[]).filter(c => c.type === CT.HideImage);
        const showIds = new Set((commands as any[]).filter(c => c.type === CT.ShowImage).map(c => c.id));
        console.log(`[step7] HideImage=${hides.length} all-resolve=${hides.every(h => showIds.has(h.targetCommandId))}`);
        for (const h of hides) {
            expect(h.targetCommandId, 'HideImage must name a real ShowImage').toBeTruthy();
            expect(showIds.has(h.targetCommandId)).toBe(true);
            // The old build emitted `elementId`, which the engine never reads.
            expect((h as any).elementId).toBeUndefined();
        }
    });

    it('reports its gaps by severity, with no dialogue in a marker', () => {
        const bySeverity = new Map<string, number>();
        const byKind = new Map<string, number>();
        for (const g of gaps) {
            bySeverity.set(g.severity, (bySeverity.get(g.severity) ?? 0) + 1);
            byKind.set(g.kind, (byKind.get(g.kind) ?? 0) + 1);
        }
        console.log(`[step7] gaps=${gaps.length} ${[...bySeverity.entries()].map(([k, v]) => `${k}=${v}`).join(' ')}`);
        console.log(`[step7] gap kinds: ${[...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`);
        // A marker names a construct and a position - never a quoted string from the game.
        for (const c of commands as any[]) {
            if (c.type !== CT.Group) continue;
            expect(c.name).not.toContain('"');
            expect(c.name).toMatch(/^UNCONVERTED \[G\d{4}\] [a-z-]+ - [\w.]+:\d+$/);
        }
    });

    it('emits SetCharacterLayer only for on-stage changes', () => {
        const setLayer = (commands as any[]).filter(c => c.type === CT.SetCharacterLayer).length;
        console.log(`[step7] SetCharacterLayer=${setLayer} (live changes found=${analysis.liveChanges.length})`);
        expect(setLayer).toBeLessThanOrEqual(analysis.liveChanges.length);
        expect(setLayer).toBeGreaterThan(0);
    });
});
