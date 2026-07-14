import { describe, it, expect } from 'vitest';
import { buildVariableUsageIndex, countUsages } from '../variableUsage';
import { VNProject } from '../../types/project';
import { CommandType } from '../../features/scene/types';
import { UIActionType } from '../../types/shared';

const base = (over: any = {}): VNProject => ({
    id: 'p', name: 'p',
    variables: {
        aff: { id: 'aff', name: 'Affection', type: 'number', defaultValue: 0, min: 0, max: 100 },
        gold: { id: 'gold', name: 'Gold', type: 'number', defaultValue: 0 },
        door: { id: 'door', name: 'Front Door', type: 'boolean', defaultValue: false },
    },
    scenes: {}, uiScreens: {}, commonEvents: {}, maps: {}, miniGames: {},
    items: {}, itemCollections: {}, stats: {}, scripts: {}, ui: {},
    ...over,
} as unknown as VNProject);

const usagesFor = (project: VNProject, id: string) => buildVariableUsageIndex(project).byVariable.get(id as any) ?? [];

describe('THE BUG THIS REPLACES: UI screens were never walked at all', () => {
    // The old findVariableUsages guarded with `Array.isArray(screen.elements)` — but `elements` is a
    // RECORD. So the whole UI branch was dead, and the delete confirmation ("used in N places")
    // undercounted every UI usage to zero. An author could delete a variable their entire UI depended
    // on and be told it was used nowhere.
    const project = base({
        uiScreens: {
            s1: {
                id: 's1', name: 'Status', elements: {
                    e1: { id: 'e1', type: 'Meter', name: 'Love bar', variableId: 'aff' },
                    e2: { id: 'e2', type: 'Text', name: 'Readout', text: 'Gold: {Gold}' },
                    e3: {
                        id: 'e3', type: 'Button', name: 'Bribe',
                        action: { type: UIActionType.SetVariable, variableId: 'gold', operator: 'subtract', value: 10 },
                        conditions: [{ variableId: 'gold', operator: '>=', value: 10 }],
                    },
                },
            },
        },
    });

    it('finds a variable bound to a Meter', () => {
        expect(usagesFor(project, 'aff').some(u => u.kind === 'show' && u.location.elementId === 'e1')).toBe(true);
    });

    it('finds {Gold} inside a UI text element — the old walker looked for `.content`, which is not a field', () => {
        expect(usagesFor(project, 'gold').some(u => u.kind === 'show' && u.location.elementId === 'e2')).toBe(true);
    });

    it('finds a button’s SINGLE `action` field (not an array — the classic miss)', () => {
        const u = usagesFor(project, 'gold');
        expect(u.some(x => x.kind === 'set' && x.direction === 'down')).toBe(true);
        expect(u.some(x => x.kind === 'check')).toBe(true);      // the element's own conditions
    });
});

describe('scenes', () => {
    const project = base({
        scenes: {
            sc1: {
                id: 'sc1', name: 'Chapter 1',
                commands: [
                    { id: 'c0', type: CommandType.Dialogue, text: 'She likes you {Affection} much.' },
                    { id: 'c1', type: CommandType.SetVariable, variableId: 'aff', operator: 'add', value: 5 },
                    {
                        id: 'c2', type: CommandType.Choice, options: [
                            {
                                text: 'Bribe her',
                                conditions: [{ variableId: 'gold', operator: '>=', value: 10 }],
                                actions: [{ type: UIActionType.SetVariable, variableId: 'gold', operator: 'subtract', value: 10 }],
                            },
                        ],
                    },
                    { id: 'c3', type: CommandType.SetVariable, variableId: 'aff', operator: 'subtract', value: 2 },
                ],
            },
        },
    });

    it('records the step index so the author can be taken there', () => {
        const set = usagesFor(project, 'aff').find(u => u.kind === 'set' && u.direction === 'up')!;
        expect(set.location).toMatchObject({ area: 'scene', sceneId: 'sc1', commandIndex: 1 });
        expect(set.canJump).toBe(true);
        expect(set.what).toBe('Increase Affection by 5');
    });

    it('summarises the way a writer thinks: up in N, down in N, checked in N', () => {
        const c = countUsages(usagesFor(project, 'aff'));
        expect(c.up).toBe(1);
        expect(c.down).toBe(1);
        expect(c.show).toBe(1);      // the {Affection} in dialogue
    });

    it('walks INSIDE a choice option — both its conditions and its actions', () => {
        const gold = usagesFor(project, 'gold');
        expect(gold.some(u => u.kind === 'check' && u.where.includes('option 1'))).toBe(true);
        expect(gold.some(u => u.kind === 'set' && u.direction === 'down')).toBe(true);
    });
});

describe('the long tail — nested actions and conditions', () => {
    it('follows a timer’s on-finish actions', () => {
        const project = base({
            scenes: {
                sc: {
                    id: 'sc', name: 'S', commands: [{
                        id: 'c', type: CommandType.StartTimer, timerId: 't', variableId: 'gold',
                        onComplete: [{ type: UIActionType.SetVariable, variableId: 'aff', operator: 'add', value: 1 }],
                    }],
                },
            },
        });
        expect(usagesFor(project, 'aff').some(u => u.where.includes('timer finishes'))).toBe(true);
        expect(usagesFor(project, 'gold').some(u => u.kind === 'set')).toBe(true);
    });

    it('follows a mini-game’s score exports and its outcome tiers', () => {
        const project = base({
            miniGames: {
                g: {
                    id: 'g', name: 'Catch', score: {
                        accuracyVariableId: 'gold',
                        tiers: [{ name: 'Great', actions: [{ type: UIActionType.SetVariable, variableId: 'aff', operator: 'add', value: 10 }] }],
                    },
                },
            },
        });
        expect(usagesFor(project, 'gold').some(u => u.kind === 'set')).toBe(true);
        expect(usagesFor(project, 'aff').some(u => u.where.includes('Great'))).toBe(true);
    });

    it('follows a common event’s commands', () => {
        const project = base({
            commonEvents: {
                ce: { id: 'ce', name: 'Daily', commands: [{ id: 'x', type: CommandType.SetVariable, variableId: 'gold', operator: 'add', value: 1 }] },
            },
        });
        const u = usagesFor(project, 'gold')[0];
        expect(u.location).toMatchObject({ area: 'commonEvent', commonEventId: 'ce', commandIndex: 0 });
    });

    it('follows a map location’s unlock conditions and actions', () => {
        const project = base({
            maps: {
                m: {
                    id: 'm', name: 'Town', locations: [{
                        label: 'The Inn',
                        conditions: [{ variableId: 'gold', operator: '>=', value: 5 }],
                        actions: [{ type: UIActionType.SetVariable, variableId: 'gold', operator: 'subtract', value: 5 }],
                    }],
                },
            },
        });
        expect(countUsages(usagesFor(project, 'gold'))).toMatchObject({ check: 1, down: 1 });
    });

    it('finds a variable referenced by NAME in a script', () => {
        const project = base({ scripts: { s: { id: 's', name: 'Boot', code: `game.setVariable('Gold', 10); if (game.getVariable('Affection') > 3) {}` } } });
        expect(usagesFor(project, 'gold').some(u => u.kind === 'set')).toBe(true);
        expect(usagesFor(project, 'aff').some(u => u.kind === 'check')).toBe(true);
    });

    it('follows an FX field that is driven by a variable', () => {
        const project = base({
            scenes: { sc: { id: 'sc', name: 'S', commands: [{ id: 'c', type: CommandType.ShakeScreen, intensityVariableId: 'aff' }] } },
        });
        expect(usagesFor(project, 'aff')[0].what).toContain('intensity');
    });
});

describe('health — the warnings that stop an author distrusting variables', () => {
    it('flags a variable nothing ever changes', () => {
        const project = base({
            scenes: { sc: { id: 'sc', name: 'S', commands: [{ id: 'c', type: CommandType.Dialogue, text: 'You have {Gold}.', conditions: [{ variableId: 'gold', operator: '>', value: 0 }] }] } },
        });
        const h = buildVariableUsageIndex(project).health.get('gold' as any)!;
        expect(h.neverChanged).toBe(true);      // checked and shown, but nothing sets it → stuck at 0 forever
        expect(h.neverUsed).toBe(false);
    });

    it('flags a variable nothing ever looks at', () => {
        const project = base({
            scenes: { sc: { id: 'sc', name: 'S', commands: [{ id: 'c', type: CommandType.SetVariable, variableId: 'gold', operator: 'add', value: 1 }] } },
        });
        const h = buildVariableUsageIndex(project).health.get('gold' as any)!;
        expect(h.neverUsed).toBe(true);         // set, but never checked or shown → can't affect anything
        expect(h.neverChanged).toBe(false);
    });

    it('flags an orphan', () => {
        expect(buildVariableUsageIndex(base()).health.get('door' as any)!.orphan).toBe(true);
    });

    it('flags a condition that can NEVER be true — the silent branch-killer', () => {
        // Affection is capped at 100, so "> 100" is a branch the player can never reach, and the author
        // gets no error anywhere — they just conclude variables are broken.
        const project = base({
            scenes: { sc: { id: 'sc', name: 'S', commands: [{ id: 'c', type: CommandType.Dialogue, text: 'hi', conditions: [{ variableId: 'aff', operator: '>', value: 100 }] }] } },
        });
        const h = buildVariableUsageIndex(project).health.get('aff' as any)!;
        expect(h.impossible.length).toBe(1);
        expect(h.impossible[0]).toContain('never be true');
    });

    it('does not cry wolf on a reachable check', () => {
        const project = base({
            scenes: { sc: { id: 'sc', name: 'S', commands: [{ id: 'c', type: CommandType.Dialogue, text: 'hi', conditions: [{ variableId: 'aff', operator: '>=', value: 100 }] }] } },
        });
        expect(buildVariableUsageIndex(project).health.get('aff' as any)!.impossible).toEqual([]);
    });

    it('flags a band that sits above the ceiling', () => {
        const project = base({
            variables: {
                aff: {
                    id: 'aff', name: 'Affection', type: 'number', defaultValue: 0, min: 0, max: 50,
                    bands: [{ id: 'b', name: 'In love', min: 80 }],
                },
            },
        });
        expect(buildVariableUsageIndex(project).health.get('aff' as any)!.impossible[0]).toContain('In love');
    });
});

describe('robustness — the schema is NOT consistent about arrays vs keyed objects', () => {
    it('survives cgGallery.entries being a RECORD (it is, in real projects — this crashed the tab)', () => {
        // Reported by Brad: "object is not iterable" the moment the Variables tab opened. The type says
        // `entries: CGGalleryEntry[]`, but real saved projects store it as a Record. A bare
        // `for (const e of (entries ?? []))` over an object throws and takes the whole panel down.
        const project = base({
            cgGallery: { entries: { cg1: { id: 'cg1', name: 'Kiss', unlockVariableId: 'door' } } },
        });
        expect(() => buildVariableUsageIndex(project)).not.toThrow();
        expect(usagesFor(project, 'door').some(u => u.what.includes('Kiss'))).toBe(true);
    });

    it('survives ANY of the list-shaped fields arriving as a keyed object', () => {
        const project = base({
            maps: { m: { id: 'm', name: 'Town', locations: { a: { label: 'Inn', conditions: [{ variableId: 'gold', operator: '>=', value: 5 }] } } } },
            miniGames: { g: { id: 'g', name: 'G', score: { tiers: { t: { name: 'Great', actions: [{ type: UIActionType.SetVariable, variableId: 'aff', operator: 'add', value: 1 }] } } } } },
            scenes: { s: { id: 's', name: 'S', commands: { c0: { id: 'c0', type: CommandType.SetVariable, variableId: 'gold', operator: 'add', value: 1 } } } },
        });
        expect(() => buildVariableUsageIndex(project)).not.toThrow();
        expect(usagesFor(project, 'gold').length).toBeGreaterThan(0);
        expect(usagesFor(project, 'aff').length).toBeGreaterThan(0);
    });

    it('still treats a SINGLE action object as one action, not as a bag of fields', () => {
        // The counterpart trap: `UIButtonElement.action` is ONE action, not a list. If we ran asList()
        // over it we would iterate its VALUES ('SetVariable', 'gold', 'add', 1) and find nothing.
        const project = base({
            uiScreens: {
                s: { id: 's', name: 'S', elements: { e: { id: 'e', type: 'Button', name: 'B', action: { type: UIActionType.SetVariable, variableId: 'gold', operator: 'add', value: 1 } } } },
            },
        });
        expect(usagesFor(project, 'gold').filter(u => u.kind === 'set')).toHaveLength(1);
    });

    it('survives an empty project', () => {
        expect(() => buildVariableUsageIndex(base())).not.toThrow();
    });

    it('lists every variable, even ones with no usages', () => {
        const idx = buildVariableUsageIndex(base());
        expect([...idx.byVariable.keys()].sort()).toEqual(['aff', 'door', 'gold']);
    });

    it('ignores a token that is not a variable', () => {
        const project = base({ scenes: { sc: { id: 'sc', name: 'S', commands: [{ id: 'c', type: CommandType.Dialogue, text: 'Hello {not_a_variable}!' }] } } });
        const all = [...buildVariableUsageIndex(project).byVariable.values()].flat();
        expect(all).toEqual([]);
    });
});
