/**
 * Switching the game into another language.
 *
 * 🔴 The whole design in one idea: instead of teaching every render site to look up a translation,
 * we build a COPY of the project with the translated text already in place, and the engine renders
 * that. Dialogue, choices, names, items, screens, phone, mini-games and credits then work in every
 * language without a single change at the point of use — and any render site added later is
 * translated the day it ships, because it never knew about languages to begin with.
 *
 * It's affordable because of `setIn`: only the objects along a changed path are copied, so
 * everything untouched — including the megabytes of embedded media — stays the same reference.
 *
 * Absent or unknown language ⇒ the project is returned UNCHANGED, by identity. That's what keeps
 * an untranslated game byte-for-byte what it is today.
 */
import { VNProject } from '../../types/project';
import { visitTranslatableText, setIn } from './walkTranslatable';

/** Art fields a localized replacement can stand in for. Same list the bundler's walks care about. */
const ASSET_URL_FIELDS = ['imageUrl', 'audioUrl', 'videoUrl'];
const ASSET_COLLECTIONS = ['images', 'backgrounds', 'audio', 'videos'] as const;

/**
 * Point an asset id at another asset's file, keeping the ORIGINAL id.
 *
 * Deliberately copies the replacement's URL onto the original entry rather than rewriting every
 * reference in the project: an asset id can be referenced from dozens of places (commands, screen
 * elements, characters, phone contacts), and finding them all is exactly the kind of exhaustive
 * walk that quietly misses one. Repointing in place means every existing reference just works.
 */
const repointAssets = (project: any, overrides: Record<string, string>): any => {
    let next = project;
    for (const [originalId, replacementId] of Object.entries(overrides || {})) {
        if (!originalId || !replacementId || originalId === replacementId) continue;
        for (const collection of ASSET_COLLECTIONS) {
            const original = next[collection]?.[originalId];
            const replacement = next[collection]?.[replacementId];
            if (!original || !replacement) continue;
            for (const field of ASSET_URL_FIELDS) {
                if (replacement[field] !== undefined && replacement[field] !== original[field]) {
                    next = setIn(next, [collection, originalId, field], replacement[field]);
                }
            }
        }
    }
    return next;
};

/**
 * The project as it should be played in `language`.
 *
 * Untranslated lines keep their original text, so a half-finished language is playable rather than
 * full of blanks — the behaviour a solo author actually needs while the work is in progress.
 */
export function applyGameLanguage(project: VNProject | null | undefined, language: string): VNProject | null | undefined {
    if (!project) return project;
    const localization: any = (project as any).localization;
    if (!localization || !language) return project;
    if (language === localization.sourceLanguage) return project;

    const strings = localization.strings || {};
    let next: any = project;

    visitTranslatableText(project, site => {
        const text = strings[site.key]?.[language]?.text;
        if (typeof text === 'string' && text !== '' && text !== site.value) {
            next = setIn(next, site.path, text);
        }
    });

    const overrides = localization.assetOverrides?.[language];
    if (overrides) next = repointAssets(next, overrides);

    return next;
}

/** The languages a finished game actually offers, in the order the author listed them. */
export function playableLanguages(project: VNProject | null | undefined): { code: string; name: string }[] {
    const localization: any = (project as any)?.localization;
    if (!localization?.languages?.length) return [];
    return localization.languages
        .filter((l: any) => l?.enabled && l.code)
        .map((l: any) => ({ code: l.code, name: l.name || l.code }));
}

/**
 * Whether to open on the language screen instead of the title.
 *
 * `firstRun` (the default) shows it once and then never again, because the player's choice is
 * remembered — so it's a one-time question, not a toll booth on every launch. A player whose
 * device already matches one of the game's languages is never asked at all: `detectStartLanguage`
 * has already put them somewhere sensible, and asking would be a worse experience than just
 * starting. That's the behaviour Ren'Py settled on too.
 */
export function shouldShowLanguageScreen(
    project: VNProject | null | undefined,
    options: { saved?: string | null; deviceLanguages?: string[] } = {},
): boolean {
    const localization: any = (project as any)?.localization;
    if (!localization) return false;
    if (!(project as any)?.ui?.languageScreenId) return false;
    if (!playableLanguages(project).length) return false;

    const mode = localization.showLanguageScreen ?? 'firstRun';
    if (mode === 'never') return false;
    if (mode === 'everyBoot') return true;

    // firstRun: only if they haven't chosen before AND we couldn't match their device.
    if (options.saved) return false;
    const detected = detectStartLanguage(project, options);
    return detected === (localization.sourceLanguage || 'en');
}

/**
 * Which language to start in.
 *
 * Order: what the player chose last time · their device's language (if the game has it and the
 * author allowed matching) · the language the game was written in. Matching is generous about
 * region — a player whose device says `pt-BR` should get `pt` rather than falling back to English,
 * and `es-419` should find `es`.
 */
export function detectStartLanguage(
    project: VNProject | null | undefined,
    options: { saved?: string | null; deviceLanguages?: string[] } = {},
): string {
    const localization: any = (project as any)?.localization;
    const source = localization?.sourceLanguage || 'en';
    const available = playableLanguages(project).map(l => l.code);
    if (!available.length) return source;

    if (options.saved && (available.includes(options.saved) || options.saved === source)) return options.saved;
    if (localization?.autoDetectLanguage === false) return source;

    const candidates = options.deviceLanguages
        || (typeof navigator !== 'undefined' ? (navigator.languages || [navigator.language]) : [])
        || [];

    for (const raw of candidates) {
        if (!raw) continue;
        const wanted = String(raw);
        const exact = available.find(code => code.toLowerCase() === wanted.toLowerCase());
        if (exact) return exact;
        if (wanted.toLowerCase() === source.toLowerCase()) return source;
        const base = wanted.split('-')[0].toLowerCase();
        const loose = available.find(code => code.split('-')[0].toLowerCase() === base);
        if (loose) return loose;
        if (source.split('-')[0].toLowerCase() === base) return source;
    }
    return source;
}
