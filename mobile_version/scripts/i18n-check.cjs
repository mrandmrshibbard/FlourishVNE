/* Translation coverage report.
 *
 *   npm run i18n:check          human-readable report, exits 1 if anything is missing
 *   npm run i18n:check -- --json    machine-readable gaps (for tooling)
 *
 * The list of strings that need translating is NOT just en/*.json. About a quarter of the
 * editor's English text lives inline in the source as t('some.key', 'The English text') —
 * i18next uses that second argument as the English value, so the key never has to appear in
 * en/*.json. Both halves together are the source of truth, and this script rebuilds that union
 * the same way i18next resolves it at runtime.
 *
 * Namespace rule: a t() call resolves against the namespace its `t` was created with — the
 * CALLING FILE's first useTranslation(...). Sub-components that receive `t` as a prop therefore
 * belong to their parent's namespace. When the same key is called from files with different
 * namespaces it is registered under each of them (duplicating a short string is harmless;
 * guessing wrong would silently leave a screen untranslated).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const LOC = path.join(SRC, 'i18n', 'locales');
const BASE = 'en';

const flatten = (obj, prefix = '', out = {}) => {
    for (const [k, v] of Object.entries(obj || {})) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
        else out[key] = v;
    }
    return out;
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const walkSource = (dir, acc = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'locales' || entry.name === '__tests__') continue;
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walkSource(p, acc);
        else if (/\.(tsx?|jsx?)$/.test(entry.name)) acc.push(p);
    }
    return acc;
};

// t('key', 'Fallback' ...) — single or double quoted, fallback must be a plain string literal.
const CALL_RE = /\bt\(\s*(['"])((?:\\.|(?!\1)[^\\])*?)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\])*?)\3/g;
const FIRST_NS_RE = /useTranslation\(\s*(?:\[([^\]]*)\]|(['"])([^'"]+)\2)/;
const unescape = (s, quote) =>
    s.replace(new RegExp('\\\\' + quote, 'g'), quote).replace(/\\n/g, '\n').replace(/\\\\/g, '\\');

/** Every English string the app can show, as { namespace: { key: english } }. */
function buildEnglishTruth() {
    const namespaces = fs.readdirSync(path.join(LOC, BASE))
        .filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort();
    const known = new Set(namespaces);

    const truth = {};
    for (const ns of namespaces) truth[ns] = flatten(readJson(path.join(LOC, BASE, ns + '.json')));

    let inlineOnly = 0;
    for (const file of walkSource(SRC)) {
        const src = fs.readFileSync(file, 'utf8');
        if (!src.includes('useTranslation')) continue;
        const m = src.match(FIRST_NS_RE);
        let fileNs = 'common';
        if (m) {
            if (m[1]) {
                const first = m[1].split(',')[0].trim().replace(/^['"]|['"]$/g, '');
                if (first) fileNs = first;
            } else if (m[3]) fileNs = m[3];
        }
        let call;
        CALL_RE.lastIndex = 0;
        while ((call = CALL_RE.exec(src)) !== null) {
            const rawKey = unescape(call[2], call[1]);
            const english = unescape(call[4], call[3]);
            if (!rawKey || /[${}]/.test(rawKey)) continue;   // dynamic key — can't be checked statically
            let ns = fileNs, key = rawKey;
            const colon = rawKey.indexOf(':');
            if (colon > 0 && known.has(rawKey.slice(0, colon))) {
                ns = rawKey.slice(0, colon);
                key = rawKey.slice(colon + 1);
            }
            if (!known.has(ns) || key in truth[ns]) continue;
            truth[ns][key] = english;
            inlineOnly++;
        }
    }
    return { namespaces, truth, inlineOnly };
}

/* ── Untranslatable English ────────────────────────────────────────────────────
 * A string only gets translated if it goes through t(). Text typed straight into JSX is
 * invisible to the coverage report above — it will stay English in every language. This pass
 * finds those, so they can be wrapped in t('key', 'English') like the rest.
 */
const ATTR_LITERAL_RE = /\b(title|placeholder|aria-label|alt)\s*=\s*"([^"]{4,})"/g;
const TEXT_NODE_RE = />([^<>{}\n]{6,})</g;

const isProse = (s) => {
    const text = s.trim();
    if (text.length < 6 || !/[A-Za-z]/.test(text)) return false;
    if (text.split(/\s+/).filter(w => /[A-Za-z]{2,}/.test(w)).length < 2) return false;
    if (/^[a-z-]+$/.test(text)) return false;                       // css keyword
    if (/https?:|\.(png|jpg|svg|json|tsx?)\b/.test(text)) return false;
    if (/[=<>]=|=>|\breturn\b|\bconst\b|\bnew \w+\(/.test(text)) return false;   // sliced-up code, not copy
    return true;
};

function findUntranslatable() {
    const rows = [];
    for (const file of walkSource(SRC)) {
        if (!file.endsWith('.tsx')) continue;
        const src = fs.readFileSync(file, 'utf8');
        if (!src.includes('useTranslation')) continue;              // not a localized screen
        const rel = path.relative(ROOT, file).replace(/\\/g, '/');
        const at = (index) => src.slice(0, index).split('\n').length;
        let m;
        ATTR_LITERAL_RE.lastIndex = 0;
        while ((m = ATTR_LITERAL_RE.exec(src)) !== null) {
            if (/[a-z]/.test(m[2]) && /\s/.test(m[2]) && !/^[a-z-]+$/.test(m[2]) && !/^\d/.test(m[2]))
                rows.push({ file: rel, line: at(m.index), kind: m[1], text: m[2] });
        }
        TEXT_NODE_RE.lastIndex = 0;
        while ((m = TEXT_NODE_RE.exec(src)) !== null) {
            if (isProse(m[1])) rows.push({ file: rel, line: at(m.index), kind: 'text', text: m[1].trim() });
        }
    }
    return rows;
}

const PLACEHOLDER_RE = /\{\{\s*([^}\s,]+)/g;
const placeholders = (value) => {
    const out = new Set();
    if (typeof value !== 'string') return out;
    let m;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((m = PLACEHOLDER_RE.exec(value)) !== null) out.add(m[1]);
    return out;
};

function reportUntranslatable(asJson) {
    const rows = findUntranslatable();
    if (asJson) {
        process.stdout.write(JSON.stringify(rows, null, 1) + '\n');
        process.exit(rows.length ? 1 : 0);
    }
    const byFile = {};
    for (const r of rows) (byFile[r.file] = byFile[r.file] || []).push(r);
    const files = Object.entries(byFile).sort((a, b) => b[1].length - a[1].length);
    console.log(`${rows.length} English strings that never reach t() — these stay English in every language.\n`);
    for (const [file, list] of files) {
        console.log(`${file}  (${list.length})`);
        for (const r of list.slice(0, 6)) console.log(`   :${r.line} ${r.kind}  "${r.text.slice(0, 90)}"`);
        if (list.length > 6) console.log(`   … +${list.length - 6} more`);
    }
    console.log(rows.length ? '\nWrap each in t(\'some.key\', \'The English text\'), then re-run without --hardcoded to translate them.' : '\nNothing hardcoded.');
    process.exit(rows.length ? 1 : 0);
}

function run() {
    const asJson = process.argv.includes('--json');
    if (process.argv.includes('--hardcoded')) return reportUntranslatable(asJson);
    const { namespaces, truth, inlineOnly } = buildEnglishTruth();
    const languages = fs.readdirSync(LOC, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== BASE).map(d => d.name).sort();

    const report = {};
    let problems = 0;
    for (const lang of languages) {
        const missing = {}, brokenPlaceholders = [], unreadable = [];
        for (const ns of namespaces) {
            const file = path.join(LOC, lang, ns + '.json');
            let translated = {};
            if (!fs.existsSync(file)) {
                unreadable.push({ namespace: ns, reason: 'file missing' });
            } else {
                try {
                    translated = flatten(readJson(file));
                } catch (err) {
                    unreadable.push({ namespace: ns, reason: err.message });
                }
            }
            for (const [key, english] of Object.entries(truth[ns])) {
                if (!(key in translated)) {
                    (missing[ns] = missing[ns] || {})[key] = english;
                    continue;
                }
                const want = placeholders(english);
                const got = placeholders(translated[key]);
                const lost = [...want].filter(p => !got.has(p));
                const extra = [...got].filter(p => !want.has(p));
                if (lost.length || extra.length) brokenPlaceholders.push({ namespace: ns, key, lost, extra });
            }
        }
        const missingCount = Object.values(missing).reduce((n, m) => n + Object.keys(m).length, 0);
        report[lang] = { missingCount, missing, brokenPlaceholders, unreadable };
        problems += missingCount + brokenPlaceholders.length + unreadable.length;
    }

    if (asJson) {
        process.stdout.write(JSON.stringify(report, null, 1) + '\n');
        process.exit(problems ? 1 : 0);
    }

    const total = namespaces.reduce((n, ns) => n + Object.keys(truth[ns]).length, 0);
    console.log(`English strings to cover: ${total} across ${namespaces.length} namespaces (${inlineOnly} of them written inline in the source).`);
    for (const lang of languages) {
        const r = report[lang];
        const bits = [];
        if (r.missingCount) bits.push(`${r.missingCount} untranslated`);
        if (r.brokenPlaceholders.length) bits.push(`${r.brokenPlaceholders.length} with wrong {{placeholders}}`);
        if (r.unreadable.length) bits.push(`${r.unreadable.length} unreadable files`);
        console.log(`  ${lang.padEnd(6)} ${bits.length ? bits.join(', ') : 'complete'}`);
        for (const u of r.unreadable) console.log(`      ! ${u.namespace}: ${u.reason}`);
        for (const b of r.brokenPlaceholders.slice(0, 10)) {
            const lost = b.lost.length ? ` missing {{${b.lost.join('}}, {{')}}}` : '';
            const extra = b.extra.length ? ` unexpected {{${b.extra.join('}}, {{')}}}` : '';
            console.log(`      ! ${b.namespace}:${b.key}${lost}${extra}`);
        }
        for (const [ns, m] of Object.entries(r.missing)) {
            const keys = Object.keys(m);
            console.log(`      ${ns}: ${keys.slice(0, 8).join(', ')}${keys.length > 8 ? `, +${keys.length - 8} more` : ''}`);
        }
    }
    console.log(problems ? `\n${problems} problem(s) found.` : '\nAll languages are complete.');
    process.exit(problems ? 1 : 0);
}

module.exports = { buildEnglishTruth, flatten, placeholders, LOC, BASE };

if (require.main === module) run();
