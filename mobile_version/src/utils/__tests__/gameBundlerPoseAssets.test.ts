/**
 * Character Poses × game export: pose base sprites and per-asset pose art MUST be
 * collected into the build's asset map and rewritten to packed paths — missing them
 * shipped broken images on itch (refs with no packed file behind them).
 */
import { describe, it, expect } from 'vitest';
import { collectAllAssets, buildLeanProject } from '../gameBundler';

// Long enough to pass buildLeanProject's data-URL fast-path length check (>32 chars).
const png = (n: number) => `data:image/png;base64,${'A'.repeat(40)}${n}`;

const project: any = {
    backgrounds: {}, images: {}, audio: {}, videos: {}, fonts: {},
    ui: {},
    scenes: {}, variables: {}, items: {}, uiScreens: {},
    characters: {
        mia: {
            id: 'mia', name: 'Mia',
            baseImageUrl: png(1),
            poses: {
                side: { id: 'side', name: 'Side', baseImageUrl: png(2) },
            },
            layers: {
                outfit: {
                    id: 'outfit', name: 'Outfit',
                    assets: {
                        dress: {
                            id: 'dress', name: 'Dress', imageUrl: png(3),
                            poseArt: { side: { imageUrl: png(4) } },
                        },
                        // Pose-scoped upload: NO default art, pose art only.
                        boots: {
                            id: 'boots', name: 'Boots',
                            poseArt: { side: { imageUrl: png(5) } },
                        },
                    },
                },
            },
        },
    },
};

describe('game export packs Character Poses art', () => {
    it('collectAllAssets includes pose bases and per-asset pose art', () => {
        const map = collectAllAssets(project);
        const urls = new Set(Object.values(map));
        expect(urls.has(png(1))).toBe(true); // default base
        expect(urls.has(png(2))).toBe(true); // pose base
        expect(urls.has(png(3))).toBe(true); // asset default art
        expect(urls.has(png(4))).toBe(true); // asset pose art
        expect(urls.has(png(5))).toBe(true); // pose-only asset art (no default)
    });

    it('buildLeanProject rewrites every pose art field to its packed path', () => {
        const map = collectAllAssets(project);
        const lean: any = buildLeanProject(project, map);
        const char = lean.characters.mia;
        expect(char.poses.side.baseImageUrl.startsWith('assets/')).toBe(true);
        expect(char.layers.outfit.assets.dress.poseArt.side.imageUrl.startsWith('assets/')).toBe(true);
        expect(char.layers.outfit.assets.boots.poseArt.side.imageUrl.startsWith('assets/')).toBe(true);
        // No data URLs left anywhere in the character
        expect(JSON.stringify(char)).not.toContain('data:image');
    });
});
