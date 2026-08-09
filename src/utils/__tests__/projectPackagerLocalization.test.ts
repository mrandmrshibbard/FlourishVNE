/**
 * Translations × .flourish save/load.
 *
 * `project.localization` is where an author's translation work lives — potentially months of it,
 * and unlike art it cannot be re-imported from a folder if it's lost. So the round trip is pinned
 * here rather than trusted to "it's only JSON": the poses feature made exactly that assumption and
 * lost data to a typed field list that predated it (see projectPackagerPoseArt.test.ts).
 *
 * The second test is the additive-optional half of the hard rule: a project that has never been
 * translated must come back with no `localization` key at all, not an empty one.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { exportProject, importProject } from '../projectPackager';
import JSZipLib from 'jszip';

beforeAll(() => { (globalThis as any).JSZip = JSZipLib; });

const makeProject = (): any => ({
    id: 'proj-loc', title: 'LocRoundTrip', version: '1.0',
    startSceneId: 'scene1',
    scenes: { scene1: { id: 'scene1', name: 'Scene 1', commands: [
        { id: 'c1', type: 'Dialogue', characterId: 'mia', text: 'I said [shake]NO[/shake], {Nickname}.' },
    ] } },
    variables: {}, items: {}, backgrounds: {}, images: {}, audio: {}, videos: {}, fonts: {},
    uiScreens: {}, ui: {},
    characters: { mia: { id: 'mia', name: 'Mia', expressions: {} } },
});

const withTranslations = () => {
    const p = makeProject();
    p.localization = {
        sourceLanguage: 'en',
        languages: [
            { code: 'es', name: 'Español', enabled: true },
            { code: 'ja', name: '日本語', enabled: false },
        ],
        strings: {
            'cmd:c1:text': {
                es: { text: 'Dije [shake]NO[/shake], {Nickname}.', origin: 'human' },
                ja: { text: '[shake]ダメ[/shake]って言ったでしょ、{Nickname}。', origin: 'machine', needsReview: true, sourceHash: 'abc123' },
            },
            'char:mia:name': { es: { text: 'Mía', origin: 'human' } },
        },
        assetOverrides: { es: { img_sign: 'img_sign_es' } },
        showLanguageScreen: 'firstRun',
        autoDetectLanguage: true,
    };
    return p;
};

const roundTrip = async (project: any) => {
    let captured: Uint8Array | null = null;
    (window as any).electronAPI = {
        saveProjectExport: async (data: Uint8Array) => { captured = data; return { success: true, filePath: 'test.flourish' }; },
    };
    try {
        const result = await exportProject(project);
        expect(result.saved).toBe(true);
        const { project: loaded } = await importProject(captured! as any);
        return loaded as any;
    } finally {
        delete (window as any).electronAPI;
    }
};

describe('.flourish round trip preserves translations', () => {
    it('brings back every translation, flag and language setting', async () => {
        const loaded = await roundTrip(withTranslations());
        const loc = loaded.localization;
        expect(loc.sourceLanguage).toBe('en');
        expect(loc.languages).toEqual([
            { code: 'es', name: 'Español', enabled: true },
            { code: 'ja', name: '日本語', enabled: false },
        ]);
        expect(loc.strings['char:mia:name'].es.text).toBe('Mía');
        expect(loc.assetOverrides.es.img_sign).toBe('img_sign_es');
        expect(loc.showLanguageScreen).toBe('firstRun');
        expect(loc.autoDetectLanguage).toBe(true);
    });

    it('🔴 keeps the review flags — a machine draft must never come back looking approved', async () => {
        const ja = (await roundTrip(withTranslations())).localization.strings['cmd:c1:text'].ja;
        expect(ja.origin).toBe('machine');
        expect(ja.needsReview).toBe(true);
        expect(ja.sourceHash).toBe('abc123');
    });

    it('keeps inline markup and non-Latin text byte-for-byte through the zip', async () => {
        const strings = (await roundTrip(withTranslations())).localization.strings;
        expect(strings['cmd:c1:text'].es.text).toBe('Dije [shake]NO[/shake], {Nickname}.');
        expect(strings['cmd:c1:text'].ja.text).toBe('[shake]ダメ[/shake]って言ったでしょ、{Nickname}。');
    });

    it('an untranslated project round-trips with NO localization field invented', async () => {
        const loaded = await roundTrip(makeProject());
        expect('localization' in loaded).toBe(false);
        expect(loaded.scenes.scene1.commands[0].text).toBe('I said [shake]NO[/shake], {Nickname}.');
    });
});
