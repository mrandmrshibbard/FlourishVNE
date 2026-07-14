import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the two impure edges: the canvas raster pipeline and the on-disk asset store.
// What we're testing is the TREE we hand to the reducer — merge, id reuse, z-order, expressions.
const written: string[] = [];
const deleted: string[] = [];

vi.mock('../raster', () => ({
    rasterizeLayers: async (_doc: any, layers: any[], _opts: any, emit: any) => {
        for (const l of layers) await emit(l, new File([new Uint8Array([1])], `${l.key}.png`, { type: 'image/png' }));
    },
    computeResizeTarget: () => null,
}));

vi.mock('../../../../utils/assetStore', () => ({
    ingestUpload: async (_p: string, _t: string, id: string) => { written.push(id); return `flourish-asset://p/assets/characters/${id}.png`; },
    refToRelPath: (url: string) => url.replace('flourish-asset://p/', ''),
    deleteAsset: async (_p: string, rel: string) => { deleted.push(rel); },
}));

import { runSpriteImport } from '../commit';
import { ImportPlan } from '../types';

const importedLayer = (key: string, name: string, order: number): any => ({
    key, name, groupPath: [], visible: true, opacity: 1, blendMode: 'normal',
    rect: { x: 0, y: 0, w: 10, h: 10 }, order,
    getSource: async () => ({} as any), getThumbnail: async () => '', release: () => {}, warnings: [],
});

const project: any = { id: 'p' };

function makePlan(over: Partial<ImportPlan> = {}): ImportPlan {
    const docLayers = [
        importedLayer('k_body', 'body', 0),
        importedLayer('k_eyes_happy', 'eyes_happy', 1),
        importedLayer('k_eyes_sad', 'eyes_sad', 2),
    ];
    return {
        doc: { kind: 'files', width: 10, height: 10, layers: docLayers, warnings: [], dispose: () => {} } as any,
        layers: [
            { name: 'Body', mode: 'variants', variants: [{ key: 'k_body', name: 'default', include: true }] },
            { name: 'Eyes', mode: 'variants', variants: [
                { key: 'k_eyes_happy', name: 'happy', include: true },
                { key: 'k_eyes_sad', name: 'sad', include: true },
            ] },
        ],
        expressions: [
            { name: 'Happy', include: true, selection: { Body: 'k_body', Eyes: 'k_eyes_happy' } },
        ],
        resizeTo: null,
        addLayersToExistingExpressions: true,
        ...over,
    };
}

const emptyChar: any = { id: 'c1', name: 'Yuki', color: '#fff', layers: {}, expressions: {} };

beforeEach(() => { written.length = 0; deleted.length = 0; });

describe('runSpriteImport — the tree handed to the reducer', () => {
    it('creates layers and their variants', async () => {
        const r = await runSpriteImport(project, emptyChar, makePlan());
        const layers = Object.values(r.layers) as any[];
        expect(layers.map(l => l.name)).toEqual(['Body', 'Eyes']);
        expect(Object.keys(layers[1].assets)).toHaveLength(2);   // happy + sad
        expect(r.assetCount).toBe(3);
    });

    it('preserves bottom-first z-order (insertion order IS paint order in the engine)', async () => {
        const r = await runSpriteImport(project, emptyChar, makePlan());
        // Body was planned first → must come out first, because the runtime paints
        // Object.values(layers) in order.
        expect((Object.values(r.layers) as any[])[0].name).toBe('Body');
    });

    it('an imported sprite is an ORDINARY VNLayerAsset (so export/build keep working)', async () => {
        const r = await runSpriteImport(project, emptyChar, makePlan());
        const asset = Object.values((Object.values(r.layers) as any[])[0].assets)[0] as any;
        expect(asset).toMatchObject({ name: 'default' });
        expect(asset.imageUrl).toMatch(/^flourish-asset:\/\//);   // the normal managed-asset ref
        expect(Object.keys(asset).sort()).toEqual(['id', 'imageUrl', 'name']);   // nothing exotic
    });

    it('a "Happy" character is still WEARING A BODY (no layer is left empty)', async () => {
        const r = await runSpriteImport(project, emptyChar, makePlan());
        const happy = (Object.values(r.expressions) as any[]).find(e => e.name === 'Happy')!;
        const bodyLayerId = (Object.entries(r.layers) as [string, any][]).find(([, l]) => l.name === 'Body')![0];
        expect(happy.layerConfiguration[bodyLayerId]).toBeTruthy();
        expect(happy.layerConfiguration[bodyLayerId]).not.toBeNull();
    });
});

describe('runSpriteImport — PARTS expand into stacked layers', () => {
    // The bug Brad hit: a PSD "Eyes" group holding whites/iris/pupil was imported as ONE layer with
    // three alternatives, forcing him to pick a third of an eye.
    const partsPlan = (): ImportPlan => {
        const docLayers = [
            importedLayer('k_body', 'body', 0),
            importedLayer('k_whites', 'whites', 1),
            importedLayer('k_iris', 'iris', 2),
            importedLayer('k_pupil', 'pupil', 3),
        ];
        return {
            doc: { kind: 'psd', width: 10, height: 10, layers: docLayers, warnings: [], dispose: () => {} } as any,
            layers: [
                { name: 'Body', mode: 'variants', variants: [{ key: 'k_body', name: 'default', include: true }] },
                { name: 'Eyes', mode: 'parts', variants: [
                    { key: 'k_whites', name: 'whites', include: true },
                    { key: 'k_iris', name: 'iris', include: true },
                    { key: 'k_pupil', name: 'pupil', include: true },
                ] },
            ],
            expressions: [{ name: 'Default', include: true, selection: { Body: 'k_body', Eyes: 'k_whites' } }],
            resizeTo: null,
            addLayersToExistingExpressions: true,
        };
    };

    it('turns one "parts" group into ONE LAYER PER PIECE (not one layer of alternatives)', async () => {
        const r = await runSpriteImport(project, emptyChar, partsPlan());
        const names = (Object.values(r.layers) as any[]).map(l => l.name);
        expect(names).toEqual(['Body', 'Eyes Whites', 'Eyes Iris', 'Eyes Pupil']);
        // Each piece is alone in its layer → nothing to "choose" between.
        for (const n of ['Eyes Whites', 'Eyes Iris', 'Eyes Pupil']) {
            const l = (Object.values(r.layers) as any[]).find(x => x.name === n);
            expect(Object.keys(l.assets)).toHaveLength(1);
        }
    });

    it('keeps the artist\'s stacking order (whites under iris under pupil)', async () => {
        const r = await runSpriteImport(project, emptyChar, partsPlan());
        // Insertion order IS paint order in the engine.
        const names = (Object.values(r.layers) as any[]).map(l => l.name);
        expect(names.indexOf('Eyes Whites')).toBeLessThan(names.indexOf('Eyes Iris'));
        expect(names.indexOf('Eyes Iris')).toBeLessThan(names.indexOf('Eyes Pupil'));
    });

    it('EVERY expression shows EVERY piece — an eye is never missing its iris', async () => {
        const r = await runSpriteImport(project, emptyChar, partsPlan());
        const expr = (Object.values(r.expressions) as any[])[0];
        for (const n of ['Eyes Whites', 'Eyes Iris', 'Eyes Pupil']) {
            const [lid] = (Object.entries(r.layers) as [string, any][]).find(([, l]) => l.name === n)!;
            expect(expr.layerConfiguration[lid]).toBeTruthy();   // selected, not null
        }
    });
});

describe('runSpriteImport — MERGE never destroys', () => {
    const existingChar: any = {
        id: 'c1', name: 'Yuki', color: '#fff',
        layers: {
            'layer-old': { id: 'layer-old', name: 'Body', assets: { 'asset-old': { id: 'asset-old', name: 'old', imageUrl: 'x' } } },
        },
        expressions: {
            'expr-old': { id: 'expr-old', name: 'Neutral', layerConfiguration: { 'layer-old': 'asset-old' } },
        },
    };

    it('keeps the existing layer + its existing sprites', async () => {
        const r = await runSpriteImport(project, existingChar, makePlan());
        expect(r.layers['layer-old']).toBeDefined();
        expect(r.layers['layer-old'].assets['asset-old']).toBeDefined();   // nothing destroyed
    });

    it('REUSES the existing layer id when the name matches (so expressions keep resolving)', async () => {
        const r = await runSpriteImport(project, existingChar, makePlan());
        // "Body" matched the existing layer → the new sprite is added to it, not to a duplicate layer.
        const bodyLayers = (Object.values(r.layers) as any[]).filter(l => l.name === 'Body');
        expect(bodyLayers).toHaveLength(1);
        expect(Object.keys(r.layers['layer-old'].assets)).toHaveLength(2);   // old + newly imported
        expect(r.expressions['expr-old'].layerConfiguration['layer-old']).toBe('asset-old');   // still resolves
    });

    it('fills NEW layers into the character\'s pre-existing expressions (else they render as nothing)', async () => {
        const r = await runSpriteImport(project, existingChar, makePlan());
        const eyesId = (Object.entries(r.layers) as [string, any][]).find(([, l]) => l.name === 'Eyes')![0];
        // "Neutral" existed before Eyes did — it must now be wearing eyes.
        expect(r.expressions['expr-old'].layerConfiguration[eyesId]).toBeTruthy();
    });

    it('respects turning that off', async () => {
        const r = await runSpriteImport(project, existingChar, makePlan({ addLayersToExistingExpressions: false }));
        const eyesId = (Object.entries(r.layers) as [string, any][]).find(([, l]) => l.name === 'Eyes')![0];
        expect(r.expressions['expr-old'].layerConfiguration[eyesId]).toBeUndefined();
    });
});

describe('runSpriteImport — rollback', () => {
    it('deletes every file it already wrote when the import fails part-way', async () => {
        const plan = makePlan();
        // Blow up on the LAST layer, after two files are already on disk.
        (plan.doc.layers[2] as any).getSource = () => { throw new Error('boom'); };
        const raster = await import('../raster');
        vi.spyOn(raster, 'rasterizeLayers').mockImplementation(async (_d: any, layers: any[], _o: any, emit: any) => {
            for (const l of layers) {
                if (l.key === 'k_eyes_sad') throw new Error('boom');
                await emit(l, new File([new Uint8Array([1])], `${l.key}.png`, { type: 'image/png' }));
            }
        });

        await expect(runSpriteImport(project, emptyChar, plan)).rejects.toThrow('boom');
        expect(written.length).toBeGreaterThan(0);
        expect(deleted.length).toBe(written.length);   // every orphan file cleaned up
    });
});
