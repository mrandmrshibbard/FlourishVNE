#!/usr/bin/env node
/**
 * Rescue a damaged .flourish file.
 *
 *     node recover-flourish.cjs "C:\path\to\broken.flourish"
 *
 * WHY A NORMAL ZIP TOOL CAN'T DO THIS
 * A zip is read BACKWARDS: the reader looks at the very end of the file for an index of everything
 * inside. If a save was interrupted, that index was never written — so every zip tool says the file is
 * corrupt and gives you nothing, even though all the bytes that DID reach the disk are sitting right
 * there, perfectly readable.
 *
 * This reads the file FORWARDS instead. Zip entries each begin with their own little header saying what
 * they are, so we can walk from the front, pull out everything that survived, and write a fresh, valid
 * .flourish from the wreckage.
 *
 * No dependencies — plain Node (zlib is built in). Never modifies the original file.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LOCAL = 0x04034b50;   // PK\x03\x04 — starts every entry
const CENTRAL = 0x02014b50; // PK\x01\x02 — the index (if we reach it, the file wasn't truncated)
const DESC = 0x08074b50;    // PK\x07\x08 — optional marker after an entry's data

function recover(buf) {
    const entries = [];
    const lost = [];
    let truncated = true;
    let off = 0;

    while (off + 30 <= buf.length) {
        const sig = buf.readUInt32LE(off);
        if (sig === CENTRAL) { truncated = false; break; }
        if (sig !== LOCAL) break;

        const flags = buf.readUInt16LE(off + 6);
        const method = buf.readUInt16LE(off + 8);
        const declared = buf.readUInt32LE(off + 18);
        const nameLen = buf.readUInt16LE(off + 26);
        const extraLen = buf.readUInt16LE(off + 28);
        const dataStart = off + 30 + nameLen + extraLen;
        if (dataStart > buf.length) break;

        const name = buf.toString('utf8', off + 30, off + 30 + nameLen);
        const isDir = !name || name.endsWith('/');

        // A FOLDER entry carries no data at all. Treating one as "size unknown" and hunting for where
        // its data ends sends the walk skidding past the real entries — which is exactly what made an
        // earlier version of this script find nothing in a real .flourish (folders come first).
        if (isDir) { off = dataStart; continue; }

        // "Size unknown" is a FLAG, not an absence. A zero size can legitimately mean an empty file.
        const unknownSize = (flags & 0x08) !== 0;

        // Simple case: the header told us the size.
        if (!unknownSize) {
            const end = dataStart + declared;
            if (end > buf.length) { if (!isDir) lost.push(name); break; }
            if (!isDir) push(name, buf.subarray(dataStart, end), method, entries, lost);
            off = end;
            continue;
        }

        // Streamed case: the size was written AFTER the data and there is no reliable marker for where
        // the data ends. So try the plausible endings — the right one is the one that decompresses.
        // (Deflate is self-checking, so a wrong guess fails rather than yielding believable garbage.)
        let data = null, end = -1;
        for (const cand of candidates(buf, dataStart)) {
            try {
                const raw = buf.subarray(dataStart, cand);
                data = method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);
                end = cand;
                break;
            } catch { /* wrong ending — try the next */ }
        }
        if (end < 0) { if (!isDir) lost.push(name); break; }
        if (!isDir) entries.push({ name, data });

        const hasMarker = end + 4 <= buf.length && buf.readUInt32LE(end) === DESC;
        off = end + (hasMarker ? 16 : 12);
    }
    return { entries, lost, truncated };
}

function push(name, raw, method, entries, lost) {
    try { entries.push({ name, data: method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw) }); }
    catch { lost.push(name); }
}

function candidates(buf, from) {
    const out = [];
    const seen = new Set();
    const add = n => { if (n > from && n <= buf.length && !seen.has(n)) { seen.add(n); out.push(n); } };
    for (let i = from; i + 4 <= buf.length && out.length < 24; i++) {
        const sig = buf.readUInt32LE(i);
        if (sig === DESC) add(i);
        else if (sig === LOCAL || sig === CENTRAL) { add(i - 12); add(i - 16); }
    }
    add(buf.length - 12); add(buf.length - 16); add(buf.length);
    return out.sort((a, b) => a - b);
}

// ── minimal zip WRITER (stored, no compression — any zip reader accepts it) ──────────────────────
function writeZip(entries) {
    const crcTable = (() => {
        const t = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c;
        }
        return t;
    })();
    const crc32 = b => {
        let c = -1;
        for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
        return (c ^ -1) >>> 0;
    };

    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const e of entries) {
        const name = Buffer.from(e.name, 'utf8');
        const crc = crc32(e.data);
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(LOCAL, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
        lh.writeUInt16LE(0, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
        lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(e.data.length, 18); lh.writeUInt32LE(e.data.length, 22);
        lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
        locals.push(lh, name, e.data);

        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(CENTRAL, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
        ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14);
        ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(e.data.length, 20); ch.writeUInt32LE(e.data.length, 24);
        ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
        ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38);
        ch.writeUInt32LE(offset, 42);
        centrals.push(ch, name);

        offset += 30 + name.length + e.data.length;
    }
    const central = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, central, eocd]);
}

// ── run ──────────────────────────────────────────────────────────────────────
const input = process.argv[2];
if (!input) {
    console.error('Usage: node recover-flourish.cjs "path/to/broken.flourish"');
    process.exit(1);
}
if (!fs.existsSync(input)) { console.error(`Not found: ${input}`); process.exit(1); }

const buf = fs.readFileSync(input);
console.log(`Reading ${path.basename(input)} (${(buf.length / 1048576).toFixed(1)} MB)…\n`);

const { entries, lost, truncated } = recover(buf);

if (!truncated) console.log('This archive looks COMPLETE — the damage may be elsewhere.\n');

const story = entries.find(e => e.name === 'project.json');
if (!story) {
    console.error('❌ Could not recover project.json — the story never reached the disk before the save');
    console.error('   was cut short. This file cannot be recovered.');
    console.error('   Try the Recovery panel in Flourish instead (it autosaves separately, every 2 minutes).');
    process.exit(2);
}

try {
    const parsed = JSON.parse(story.data.toString('utf8'));
    console.log(`✅ Recovered the story: "${parsed.title || 'Untitled'}" — ${Object.keys(parsed.scenes || {}).length} scenes.`);
} catch {
    console.error('❌ project.json was found but is itself incomplete. This file cannot be recovered.');
    process.exit(2);
}

const media = entries.filter(e => e.name.startsWith('assets/')).length;
console.log(`✅ Recovered ${media} media file(s).`);
if (lost.length) console.log(`⚠️  ${lost.length} file(s) were cut off and could not be recovered:\n   - ${lost.slice(0, 10).join('\n   - ')}`);

const out = input.replace(/\.flourish$/i, '') + '.recovered.flourish';
fs.writeFileSync(out, writeZip(entries));
console.log(`\n💾 Wrote: ${out}`);
console.log('   Open that file in Flourish. Your original was not modified.');
