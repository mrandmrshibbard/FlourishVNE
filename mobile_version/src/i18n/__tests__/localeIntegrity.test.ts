/**
 * Guard rails for the translation files.
 *
 * These check the SHAPE of every locale — that each language has every namespace file, that the
 * files parse, and that translated strings keep the same {{placeholders}} as the English ones (a
 * dropped or renamed placeholder shows up in-game as literal "{{name}}" text).
 *
 * Coverage — whether every English string actually HAS a translation — is a separate report,
 * because a chunk of the English text lives inline in the source as t('key', 'English') rather
 * than in en/*.json. Run `npm run i18n:check` for that.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = path.resolve(here, '..', 'locales');
const BASE = 'en';

const flatten = (obj: unknown, prefix = '', out: Record<string, unknown> = {}) => {
    for (const [k, v] of Object.entries((obj ?? {}) as Record<string, unknown>)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
        else out[key] = v;
    }
    return out;
};

const placeholdersIn = (value: unknown): Set<string> => {
    const found = new Set<string>();
    if (typeof value !== 'string') return found;
    const re = /\{\{\s*([^}\s,]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) found.add(m[1]);
    return found;
};

const namespaces = fs.readdirSync(path.join(LOCALES, BASE))
    .filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort();
const languages = fs.readdirSync(LOCALES, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name).sort();

describe('locale files', () => {
    it('ships more than one language and a full set of namespaces', () => {
        expect(languages).toContain(BASE);
        expect(languages.length).toBeGreaterThan(1);
        expect(namespaces.length).toBeGreaterThan(0);
    });

    it.each(languages)('%s has every namespace file and they all parse', (lang) => {
        const missingFiles: string[] = [];
        const unparsable: string[] = [];
        for (const ns of namespaces) {
            const file = path.join(LOCALES, lang, `${ns}.json`);
            if (!fs.existsSync(file)) { missingFiles.push(ns); continue; }
            try {
                const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
                expect(parsed, `${lang}/${ns}.json should be an object`).toBeTypeOf('object');
            } catch (err) {
                unparsable.push(`${ns}: ${(err as Error).message}`);
            }
        }
        expect(missingFiles, `${lang} is missing namespace files`).toEqual([]);
        expect(unparsable, `${lang} has unparsable files`).toEqual([]);
    });

    it.each(languages.filter(l => l !== BASE))('%s keeps the same {{placeholders}} as English', (lang) => {
        const mismatches: string[] = [];
        for (const ns of namespaces) {
            const file = path.join(LOCALES, lang, `${ns}.json`);
            if (!fs.existsSync(file)) continue;
            const english = flatten(JSON.parse(fs.readFileSync(path.join(LOCALES, BASE, `${ns}.json`), 'utf8')));
            const translated = flatten(JSON.parse(fs.readFileSync(file, 'utf8')));
            for (const [key, value] of Object.entries(translated)) {
                // Plural variants (key_one / key_few / key_many) share the base key's placeholders.
                const baseKey = key.replace(/_(zero|one|two|few|many|other)$/, '');
                const source = key in english ? english[key] : english[baseKey];
                if (source === undefined) continue;
                const want = placeholdersIn(source);
                const got = placeholdersIn(value);
                const lost = [...want].filter(p => !got.has(p));
                const extra = [...got].filter(p => !want.has(p));
                if (lost.length || extra.length) {
                    mismatches.push(`${ns}:${key}${lost.length ? ` missing {{${lost.join('}}, {{')}}}` : ''}${extra.length ? ` unexpected {{${extra.join('}}, {{')}}}` : ''}`);
                }
            }
        }
        expect(mismatches, `${lang} placeholder mismatches`).toEqual([]);
    });
});
