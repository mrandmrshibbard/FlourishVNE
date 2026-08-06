/**
 * Character font import collision (user report 2026-08-05: "fonts broke and all show as the
 * exact same [font]"). Old archives store every character's font as
 * `assets/characters/<charId>/font.ttf`; the desktop import derived the managed-store id from
 * the BASENAME alone, so every character's font landed on ONE store file (last writer wins).
 * The store id now comes from the full sub-path — these tests pin that, for both the old
 * (fixed-basename) and new (id-prefixed) archive layouts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import JSZip from 'jszip';
import { importProject } from '../projectPackager';

// projectPackager uses the page-global JSZip (CDN script tag in index.html).
(globalThis as any).JSZip = JSZip;

const makeZip = async (fontPaths: Record<string, string>, project: any): Promise<Uint8Array> => {
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project));
    for (const [path, contents] of Object.entries(fontPaths)) {
        zip.file(path, contents);
    }
    return zip.generateAsync({ type: 'uint8array' });
};

const baseProject = (fontUrlA: string, fontUrlB: string): any => ({
    id: 'proj1', title: 'P', startSceneId: 's1',
    scenes: { s1: { id: 's1', name: 'S', commands: [] } },
    variables: {}, backgrounds: {}, images: {}, audio: {}, videos: {}, uiScreens: undefined,
    characters: {
        yuki: { id: 'yuki', name: 'Yuki', color: '#fff', fontUrl: fontUrlA, fontFamily: 'YukiFont', layers: {}, expressions: {} },
        bob: { id: 'bob', name: 'Bob', color: '#fff', fontUrl: fontUrlB, fontFamily: 'BobFont', layers: {}, expressions: {} },
    },
    fonts: {},
});

describe('character font import — no store collisions', () => {
    const written: Array<{ type: string; id: string; ext: string; bytes: Uint8Array }> = [];

    beforeEach(() => {
        written.length = 0;
        (window as any).electronAPI = {
            writeProjectAsset: async (_pid: string, type: string, id: string, ext: string, bytes: Uint8Array) => {
                written.push({ type, id, ext, bytes });
                return { success: true, relPath: `assets/${type}/${id}.${ext}` };
            },
        };
    });
    afterEach(() => { delete (window as any).electronAPI; });

    it('OLD archives (fixed basename font.ttf per character folder) import to DISTINCT store files', async () => {
        const zipBytes = await makeZip({
            'assets/characters/yuki/font.ttf': 'YUKI-FONT-BYTES',
            'assets/characters/bob/font.ttf': 'BOB-FONT-BYTES',
        }, baseProject('assets/characters/yuki/font.ttf', 'assets/characters/bob/font.ttf'));

        const { project } = await importProject(zipBytes);

        const fontWrites = written.filter(w => w.id.includes('font'));
        expect(fontWrites.length).toBe(2);
        const ids = new Set(fontWrites.map(w => w.id));
        expect(ids.size).toBe(2); // the collision: both used to be id 'font'
        expect(ids.has('yuki_font')).toBe(true);
        expect(ids.has('bob_font')).toBe(true);
        // And the two characters point at different store files.
        expect(project.characters.yuki.fontUrl).not.toBe(project.characters.bob.fontUrl);
        expect(project.characters.yuki.fontUrl).toContain('yuki_font');
        expect(project.characters.bob.fontUrl).toContain('bob_font');
    });

    it('NEW archives (id-prefixed filenames) import cleanly too', async () => {
        const zipBytes = await makeZip({
            'assets/characters/yuki/yuki_font.ttf': 'YUKI-FONT-BYTES',
            'assets/characters/bob/bob_font.ttf': 'BOB-FONT-BYTES',
        }, baseProject('assets/characters/yuki/yuki_font.ttf', 'assets/characters/bob/bob_font.ttf'));

        const { project } = await importProject(zipBytes);
        expect(project.characters.yuki.fontUrl).not.toBe(project.characters.bob.fontUrl);
    });

    it('flat project-library font paths keep their exact ids (no behavior change)', async () => {
        const proj = baseProject('', '');
        proj.fonts = { f1: { id: 'f1', name: 'Fancy', fontFamily: 'Fancy', fontUrl: 'assets/fonts/f1_Fancy.ttf' } };
        const zipBytes = await makeZip({ 'assets/fonts/f1_Fancy.ttf': 'FANCY-BYTES' }, proj);

        await importProject(zipBytes);
        const w = written.find(x => x.type === 'fonts');
        expect(w).toBeTruthy();
        expect(w!.id).toBe('f1_Fancy');
    });

    it('web fallback (no electron) inlines each font separately as base64', async () => {
        delete (window as any).electronAPI;
        const zipBytes = await makeZip({
            'assets/characters/yuki/font.ttf': 'YUKI-FONT-BYTES',
            'assets/characters/bob/font.ttf': 'BOB-FONT-BYTES',
        }, baseProject('assets/characters/yuki/font.ttf', 'assets/characters/bob/font.ttf'));

        const { project } = await importProject(zipBytes);
        expect(project.characters.yuki.fontUrl.startsWith('data:')).toBe(true);
        expect(project.characters.bob.fontUrl.startsWith('data:')).toBe(true);
        expect(project.characters.yuki.fontUrl).not.toBe(project.characters.bob.fontUrl);
    });
});
