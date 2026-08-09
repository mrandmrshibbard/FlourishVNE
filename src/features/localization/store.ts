/**
 * Reading and writing `project.localization` — the one place translations are stored.
 *
 * Everything here returns a NEW object and mutates nothing, because these run through the reducer.
 * That is the fix for the bug this whole feature exists to correct: the old Localization panel kept
 * its translations in component state, so closing the tab threw the work away.
 */
import { VNProject, VNLocalization, VNTranslatedString } from '../../types/project';
import { collectTranslatableText } from './walkTranslatable';
import { ImportChange, ImportResult } from './translationSheet';

/**
 * A short, stable fingerprint of the source text a translation was made from.
 *
 * Not a cryptographic hash and doesn't need to be — its only job is to change when the author edits
 * the English, so the translation can be shown as out of date instead of shipping as though it
 * still matched. FNV-1a: a few lines, no dependency, and stable across sessions and machines
 * (which `String.hashCode`-style shortcuts and anything involving object order are not).
 */
export function hashSource(text: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36);
}

export const emptyLocalization = (sourceLanguage = 'en'): VNLocalization =>
    ({ sourceLanguage, languages: [], strings: {} });

/** Never mutates: returns a localization with one translation written in. */
export function upsertTranslation(
    localization: VNLocalization | undefined,
    key: string,
    language: string,
    entry: VNTranslatedString,
): VNLocalization {
    const base = localization || emptyLocalization();
    return {
        ...base,
        strings: {
            ...base.strings,
            [key]: { ...(base.strings?.[key] || {}), [language]: entry },
        },
    };
}

export interface ApplyOptions {
    language: string;
    /** Machine drafts arrive flagged; a person typing in the workspace does not. */
    origin?: 'human' | 'machine';
}

/**
 * Write validated changes into the project.
 *
 * 🔴 A row imported from a STALE export is stored with the hash of the text the translator actually
 * worked from (`translatedFrom`) — not the current English. Storing the current hash would make it
 * look freshly checked, which is precisely the lie `sourceHash` exists to prevent; storing the old
 * one means the workspace shows it as out of date the moment it lands, which is the truth.
 */
export function applyTranslations(project: VNProject, changes: ImportChange[], options: ApplyOptions): VNProject {
    if (!changes.length) return project;
    let localization = project.localization || emptyLocalization();

    for (const change of changes) {
        localization = upsertTranslation(localization, change.key, options.language, {
            text: change.after,
            origin: options.origin || 'human',
            needsReview: options.origin === 'machine' || change.stale,
            sourceHash: hashSource(change.translatedFrom ?? change.source),
        });
    }
    return { ...project, localization };
}

/** Convenience for the import flow: apply everything the validator accepted. */
export function applyImportResult(project: VNProject, result: ImportResult): VNProject {
    return applyTranslations(project, result.changes, { language: result.language });
}

export interface LanguageProgress {
    language: string;
    total: number;
    translated: number;
    /** Machine drafts nobody has approved yet. */
    needsReview: number;
    /** Translated, but the English has changed since. */
    stale: number;
    /** 0–100, rounded. */
    percent: number;
}

/**
 * How far along a language is — the number the workspace shows and the build validator warns on.
 * Walks the project rather than counting stored strings, so keys left behind by deleted scenes
 * can't inflate the total into a permanently unfinishable 103%.
 */
export function languageProgress(project: VNProject, language: string): LanguageProgress {
    const sites = collectTranslatableText(project);
    const strings = project.localization?.strings || {};
    let translated = 0, needsReview = 0, stale = 0;

    for (const site of sites) {
        const entry = strings[site.key]?.[language];
        if (!entry?.text) continue;
        translated++;
        if (entry.needsReview) needsReview++;
        if (entry.sourceHash && entry.sourceHash !== hashSource(site.value)) stale++;
    }

    return {
        language,
        total: sites.length,
        translated,
        needsReview,
        stale,
        percent: sites.length ? Math.round((translated / sites.length) * 100) : 0,
    };
}

/** Keys stored for lines that no longer exist — offered as cleanup, never removed behind the author's back. */
export function orphanedKeys(project: VNProject): string[] {
    const live = new Set(collectTranslatableText(project).map(s => s.key));
    return Object.keys(project.localization?.strings || {}).filter(key => !live.has(key));
}
