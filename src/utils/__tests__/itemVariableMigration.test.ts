import { describe, it, expect } from 'vitest';
import { migrateItemCountVariableBounds, migrateStatVariables } from '../itemVariableMigration';
import { VNProject } from '../../types/project';

// Minimal project containing only what the migration touches.
const makeProject = (over: Partial<VNProject>): VNProject => ({
    variables: {},
    items: {},
    itemCollections: {},
    ...over,
} as unknown as VNProject);

describe('migrateItemCountVariableBounds', () => {
    it('backfills min:0 on an item count variable that lacks a lower bound', () => {
        const project = makeProject({
            variables: { potionCount: { id: 'potionCount', name: 'Potion', type: 'number', defaultValue: 0 } },
            items: { potion: { id: 'potion', name: 'Potion', countVariableId: 'potionCount' } as any },
        });
        const out = migrateItemCountVariableBounds(project);
        expect((out.variables.potionCount as any).min).toBe(0);
    });

    it('leaves an explicitly-authored min untouched (even a negative one)', () => {
        const project = makeProject({
            variables: { balance: { id: 'balance', name: 'Balance', type: 'number', defaultValue: 0, min: -100 } },
            items: { debt: { id: 'debt', name: 'Debt', countVariableId: 'balance' } as any },
        });
        const out = migrateItemCountVariableBounds(project);
        expect((out.variables.balance as any).min).toBe(-100);
    });

    it('backfills collection-entry stock variables too', () => {
        const project = makeProject({
            variables: { stock: { id: 'stock', name: 'Stock', type: 'number', defaultValue: 5 } },
            items: {},
            itemCollections: { shop: { id: 'shop', name: 'Shop', entries: [{ itemId: 'x', countVariableId: 'stock' }] } as any },
        });
        const out = migrateItemCountVariableBounds(project);
        expect((out.variables.stock as any).min).toBe(0);
    });

    it('is idempotent and returns the same reference when nothing changes', () => {
        const project = makeProject({
            variables: { c: { id: 'c', name: 'C', type: 'number', defaultValue: 0, min: 0 } },
            items: { i: { id: 'i', name: 'I', countVariableId: 'c' } as any },
        });
        const out = migrateItemCountVariableBounds(project);
        expect(out).toBe(project);
    });

    it('does not touch non-item variables', () => {
        const project = makeProject({
            variables: { hp: { id: 'hp', name: 'HP', type: 'number', defaultValue: 100 } },
            items: {},
        });
        const out = migrateItemCountVariableBounds(project);
        expect((out.variables.hp as any).min).toBeUndefined();
    });

    it('recreates a dangling item count variable (deleted / lost reference)', () => {
        const project = makeProject({
            variables: {}, // the count variable is MISSING
            items: { key: { id: 'key', name: 'Brass Key', countVariableId: 'var-key' } as any },
        });
        const out = migrateItemCountVariableBounds(project);
        const recreated = out.variables['var-key'] as any;
        expect(recreated).toBeDefined();
        expect(recreated.type).toBe('number');
        expect(recreated.min).toBe(0);
        expect(recreated.defaultValue).toBe(0);
        expect(recreated.name).toBe('Brass Key');
    });

    it('recreates a dangling collection-entry stock variable as internal', () => {
        const project = makeProject({
            variables: {},
            items: { apple: { id: 'apple', name: 'Apple', countVariableId: 'apple-owned' } as any },
            itemCollections: { shop: { id: 'shop', name: 'Market', entries: [{ itemId: 'apple', countVariableId: 'apple-stock' }] } as any },
        });
        const out = migrateItemCountVariableBounds(project);
        const stock = out.variables['apple-stock'] as any;
        expect(stock).toBeDefined();
        expect(stock.min).toBe(0);
        expect(stock.isInternal).toBe(true);
        // The item's own count var is also recreated (public, not internal).
        expect((out.variables['apple-owned'] as any).isInternal).toBeUndefined();
    });
});

describe('migrateStatVariables', () => {
    const makeStatProject = (over: Partial<VNProject>): VNProject => ({
        variables: {},
        characters: { alice: { id: 'alice', name: 'Alice' } },
        stats: {},
        ...over,
    } as unknown as VNProject);

    it('recreates a dangling stat variable at the same id with the stat range', () => {
        const project = makeStatProject({
            stats: { s1: { id: 's1', name: 'Affection', min: 0, max: 100, defaultValue: 5, appliesTo: 'characters', characterIds: ['alice'], variableIds: { alice: 'var-a' } } as any },
        });
        const out = migrateStatVariables(project);
        const v = out.variables['var-a'] as any;
        expect(v).toBeDefined();
        expect(v.name).toBe('Alice — Affection');
        expect(v.min).toBe(0);
        expect(v.max).toBe(100);
        expect(v.defaultValue).toBe(5);
    });

    it('prunes dead characters: drops the backlink, characterIds entry, and backing variable', () => {
        const project = makeStatProject({
            variables: { 'var-ghost': { id: 'var-ghost', name: 'Ghost — Affection', type: 'number', defaultValue: 0 } as any },
            stats: { s1: { id: 's1', name: 'Affection', min: 0, max: 100, defaultValue: 0, appliesTo: 'characters', characterIds: ['alice', 'ghost'], variableIds: { alice: 'var-a', ghost: 'var-ghost' } } as any },
        });
        const out = migrateStatVariables(project);
        const stat = out.stats!.s1 as any;
        expect(stat.variableIds.ghost).toBeUndefined();
        expect(stat.characterIds).toEqual(['alice']);
        expect(out.variables['var-ghost']).toBeUndefined();
    });

    it('does NOT clobber a manually-renamed stat variable on load (the auto-name is creation-only)', () => {
        const project = makeStatProject({
            // Author renamed the backing variable in the Variables manager; it must persist across loads.
            variables: { 'var-a': { id: 'var-a', name: 'akari_affection', type: 'number', defaultValue: 0, min: 0, max: 100 } as any },
            stats: { s1: { id: 's1', name: 'Affection', min: 0, max: 100, defaultValue: 0, appliesTo: 'characters', characterIds: ['alice'], variableIds: { alice: 'var-a' } } as any },
        });
        const out = migrateStatVariables(project);
        // No re-sync to "Alice — Affection"; the manual name stays, and nothing changed → same ref.
        expect((out.variables['var-a'] as any).name).toBe('akari_affection');
        expect(out).toBe(project);
    });

    it('is idempotent: returns the same reference when nothing needs healing', () => {
        const project = makeStatProject({
            variables: { 'var-a': { id: 'var-a', name: 'Alice — Affection', type: 'number', defaultValue: 0, min: 0, max: 100 } as any },
            stats: { s1: { id: 's1', name: 'Affection', min: 0, max: 100, defaultValue: 0, appliesTo: 'characters', characterIds: ['alice'], variableIds: { alice: 'var-a' } } as any },
        });
        expect(migrateStatVariables(project)).toBe(project);
    });

    it('no-ops on projects without stats', () => {
        const project = makeStatProject({ stats: undefined });
        expect(migrateStatVariables(project)).toBe(project);
    });
});
