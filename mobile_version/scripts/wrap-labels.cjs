/* Wrap hardcoded label="..." / hint="..." props in t('hc.<slug>', 'English').
 *
 * Deliberately ONE FILE AT A TIME (path as argv[2]) with a typecheck between runs: a blind
 * sweep across everything is how the earlier codemods produced breakage that only surfaced later.
 *
 * SKIPS are exact English strings that are DATA, not prose — translating them would corrupt
 * behaviour (a CSS keyword, a format example, sample content). Add to SKIP rather than special-
 * casing at the call site.
 *
 *   node wrap-labels.cjs <relative-file> [--write]
 */
const fs = require('fs');
const path = require('path');
const ROOT = process.env.WRAP_ROOT || 'c:/Users/Mrand/Downloads/FlourishVNE Official/FlourishVNE';

// Never wrap these: they are values the user must type literally, or demo content.
const SKIP = new Set([
    'center top',                       // a CSS object-position example
    'alo tudo bom, onde vc esta?',      // sample chat bubble text in the phone preview
    'a caminho!',
]);

// Engine files are i18n-free by design and must never gain a t() call.
const ENGINE = /(components[\\/]LivePreview\.tsx|components[\\/]live-preview[\\/]|StandalonePlayer\.tsx|utils[\\/]gameEngineBundle)/;

const rel = process.argv[2];
const WRITE = process.argv.includes('--write');
if (!rel) { console.error('usage: wrap-labels.cjs <relative-file> [--write]'); process.exit(2); }
if (ENGINE.test(rel)) { console.error('REFUSED: engine file — the engine does not use react-i18next.'); process.exit(2); }

const file = path.join(ROOT, rel);
let src = fs.readFileSync(file, 'utf8');
if (!src.includes('useTranslation')) { console.error('REFUSED: file has no useTranslation.'); process.exit(2); }

const slug = (s) => {
    const w = s.replace(/[^A-Za-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 5);
    if (!w.length) return 'label';
    return w[0].toLowerCase() + w.slice(1).map(x => x[0].toUpperCase() + x.slice(1).toLowerCase()).join('');
};

// Reuse a key when the same English already has one anywhere in the file (and across earlier runs).
const byText = new Map();
const usedKeys = new Set();
for (const m of src.matchAll(/t\('(hc\.[A-Za-z0-9]+)',\s*'((?:\\.|[^'\\])*)'/g)) {
    usedKeys.add(m[1]);
    byText.set(m[2].replace(/\\'/g, "'"), m[1]);
}

const RE = /\b(label|hint)="([^"]{4,})"/g;
let wrapped = 0, skipped = 0;
src = src.replace(RE, (whole, attr, text) => {
    if (SKIP.has(text)) { skipped++; return whole; }
    // Same prose filter the checker uses, so the two agree on what counts.
    if (!/[a-z]/.test(text) || !/\s/.test(text) || /^[a-z-]+$/.test(text) || /^\d/.test(text)) return whole;
    let key = byText.get(text);
    if (!key) {
        key = 'hc.' + slug(text);
        let n = 2;
        while (usedKeys.has(key)) key = 'hc.' + slug(text) + n++;
        usedKeys.add(key);
        byText.set(text, key);
    }
    wrapped++;
    return `${attr}={t('${key}', '${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')}`;
});

console.log(`${rel}: ${WRITE ? 'wrapped' : 'would wrap'} ${wrapped}, skipped ${skipped} data value(s)`);
if (WRITE) fs.writeFileSync(file, src);
