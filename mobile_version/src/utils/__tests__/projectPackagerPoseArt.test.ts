/**
 * Character Poses × .flourish save/load: pose bases and per-asset pose art must survive
 * a full export → import round trip. They didn't (both the save walk and the import
 * hydration list were typed field lists that predate poses) — a project reopened after
 * saving showed every posed sprite broken.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { exportProject, importProject } from '../projectPackager';
import JSZipLib from 'jszip';

// The app loads JSZip as a global (script tag); provide it for the test environment.
beforeAll(() => { (globalThis as any).JSZip = JSZipLib; });

// Valid base64 payloads (decodable) so dataUrlToBlob round-trips the exact bytes.
const marker = (n: number) => btoa(`pose-art-payload-number-${n}-pose-art-payload`);
const png = (n: number) => `data:image/png;base64,${marker(n)}`;

const makeProject = (): any => ({
    id: 'proj-test-poses', title: 'PoseRoundTrip', version: '1.0',
    startSceneId: 'scene1',
    scenes: { scene1: { id: 'scene1', name: 'Scene 1', commands: [] } },
    variables: {}, items: {}, backgrounds: {}, images: {}, audio: {}, videos: {}, fonts: {},
    uiScreens: {}, ui: {},
    characters: {
        mia: {
            id: 'mia', name: 'Mia',
            baseImageUrl: png(1),
            expressions: {},
            poses: { side: { id: 'side', name: 'Side', baseImageUrl: png(2) } },
            layers: {
                outfit: {
                    id: 'outfit', name: 'Outfit',
                    assets: {
                        dress: { id: 'dress', name: 'Dress', imageUrl: png(3), poseArt: { side: { imageUrl: png(4) } } },
                        // Pose-scoped upload: pose art only, no default art.
                        boots: { id: 'boots', name: 'Boots', poseArt: { side: { imageUrl: png(5) } } },
                    },
                },
            },
        },
    },
});

describe('.flourish round trip preserves Character Poses art', () => {
    it('export packs pose art and import hydrates it back', async () => {
        let captured: Uint8Array | null = null;
        (window as any).electronAPI = {
            saveProjectExport: async (data: Uint8Array) => { captured = data; return { success: true, filePath: 'test.flourish' }; },
        };
        try {
            const result = await exportProject(makeProject());
            expect(result.saved).toBe(true);
            expect(result.missingAssets).toBeUndefined(); // health check found no dangling refs
            expect(captured).not.toBeNull();

            const { project: loaded } = await importProject(captured! as any);
            const char: any = loaded.characters.mia;
            // Every art field returns as an inline data URL carrying the ORIGINAL bytes.
            expect(char.baseImageUrl).toContain(marker(1));
            expect(char.poses.side.baseImageUrl).toContain(marker(2));
            expect(char.layers.outfit.assets.dress.imageUrl).toContain(marker(3));
            expect(char.layers.outfit.assets.dress.poseArt.side.imageUrl).toContain(marker(4));
            expect(char.layers.outfit.assets.boots.poseArt.side.imageUrl).toContain(marker(5));
        } finally {
            delete (window as any).electronAPI;
        }
    });

    it('a pose-less (pre-poses) project round-trips exactly as before — no new files, no failures', async () => {
        const project = makeProject();
        delete project.characters.mia.poses;
        delete project.characters.mia.layers.outfit.assets.dress.poseArt;
        delete project.characters.mia.layers.outfit.assets.boots; // pose-only piece gone too
        let captured: Uint8Array | null = null;
        (window as any).electronAPI = {
            saveProjectExport: async (data: Uint8Array) => { captured = data; return { success: true, filePath: 'test.flourish' }; },
        };
        try {
            const result = await exportProject(project);
            expect(result.saved).toBe(true);
            expect(result.missingAssets).toBeUndefined();

            // No pose-named files may appear in the archive of a pose-less project.
            const zip = await JSZipLib.loadAsync(captured!);
            const names = Object.keys(zip.files);
            expect(names.some(n => n.includes('pose_') || n.includes('_pose'))).toBe(false);

            const { project: loaded } = await importProject(captured! as any);
            const char: any = loaded.characters.mia;
            expect(char.baseImageUrl).toContain(marker(1));
            expect(char.layers.outfit.assets.dress.imageUrl).toContain(marker(3));
            expect(char.poses).toBeUndefined(); // nothing invented the field
        } finally {
            delete (window as any).electronAPI;
        }
    });
});
