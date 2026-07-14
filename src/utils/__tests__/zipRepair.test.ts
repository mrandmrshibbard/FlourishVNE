import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { recoverZipEntries, repairFlourishArchive } from '../zipRepair';

/** Build an archive the way exportProject does: streamed, so entries carry data descriptors. */
async function makeArchive(files: Record<string, string>): Promise<Uint8Array> {
    const zip = new JSZip();
    for (const [name, content] of Object.entries(files)) zip.file(name, content);
    return zip.generateAsync({ type: 'uint8array', streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 1 } });
}

/** Cut the file short — exactly what an interrupted save leaves behind. */
const truncate = (bytes: Uint8Array, fraction: number) => bytes.slice(0, Math.floor(bytes.length * fraction));

const findSig = (bytes: Uint8Array, sig: number, from = 0) => {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = from; i + 4 <= bytes.length; i++) if (v.getUint32(i, true) === sig) return i;
    return -1;
};

/**
 * Chop the file off right where the index begins — the exact shape of a save that died just before it
 * wrote the central directory. (Cutting at "75% of the file" is NOT this: these fixtures compress so
 * hard that 75% can still be past the start of the index, and the test then quietly proves nothing.)
 */
const cutBeforeIndex = (bytes: Uint8Array) => bytes.slice(0, findSig(bytes, 0x02014b50));

/** Offset of a named entry's local header. */
function findEntryHeader(bytes: Uint8Array, name: string): number {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const target = new TextEncoder().encode(name);
    for (let i = 0; i + 30 <= bytes.length; i++) {
        if (v.getUint32(i, true) !== 0x04034b50) continue;
        const nameLen = v.getUint16(i + 26, true);
        if (nameLen !== target.length) continue;
        const got = bytes.subarray(i + 30, i + 30 + nameLen);
        if (target.every((b, k) => got[k] === b)) return i;
    }
    return -1;
}

describe('recovering a truncated .flourish', () => {
    it('a complete archive is recognised as complete', async () => {
        const bytes = await makeArchive({ 'project.json': '{"title":"Hi"}' });
        const r = await recoverZipEntries(bytes);
        expect(r.truncated).toBe(false);
        expect(r.entries.map(e => e.name)).toContain('project.json');
    });

    it('reads the story back out of a file with NO central directory', async () => {
        // This is the user's file: the writer died before it wrote the index, so every zip library
        // says "can't find end of central directory" — even though the bytes are all there.
        const story = JSON.stringify({ title: 'The Hollow House', scenes: { a: { id: 'a' } } });
        const full = await makeArchive({ 'project.json': story, 'assets/images/a.png': 'x'.repeat(500) });

        const cut = cutBeforeIndex(full);
        await expect(JSZip.loadAsync(cut)).rejects.toThrow();     // proves the normal reader can't

        const r = await recoverZipEntries(cut);
        expect(r.truncated).toBe(true);
        const recovered = r.entries.find(e => e.name === 'project.json')!;
        expect(JSON.parse(new TextDecoder().decode(recovered.data)).title).toBe('The Hollow House');
    });

    it('rebuilds a VALID archive from the wreckage, which the ordinary importer can open', async () => {
        const story = JSON.stringify({ title: 'Recovered' });
        const full = await makeArchive({ 'project.json': story, 'assets/images/a.png': 'y'.repeat(400) });
        const repaired = await repairFlourishArchive(truncate(full, 0.8));
        expect(repaired).not.toBeNull();

        const zip = await JSZip.loadAsync(repaired!.archive);      // it opens — that's the whole point
        expect(JSON.parse(await zip.file('project.json')!.async('string')).title).toBe('Recovered');
        expect(repaired!.recovered).toContain('project.json');
    });

    it('gives up honestly when the story itself never reached the disk', async () => {
        // Nothing to salvage → null, so the caller shows the real error instead of handing the author
        // a plausible-looking empty project.
        const full = await makeArchive({ 'project.json': JSON.stringify({ title: 'x' }) });
        expect(await repairFlourishArchive(truncate(full, 0.05))).toBeNull();
    });

    it('reports which files were lost, rather than pretending everything came back', async () => {
        // INCOMPRESSIBLE bytes, so the cut really does land inside the image's data. ('z'.repeat(4000)
        // deflates to a handful of bytes — a "half the file" cut would sail right past it and the test
        // would pass while proving nothing.)
        const noise = Array.from({ length: 4000 }, (_, i) => String.fromCharCode(32 + ((i * 7919) % 90))).join('');
        const full = await makeArchive({
            'project.json': JSON.stringify({ title: 'Partial' }),
            'assets/images/big.png': noise,
        });
        // Cut just inside the IMAGE's compressed data: past project.json, short of the image's end.
        // (Find it by NAME — scanning for "the next local header" lands on the `assets/` folder entry.)
        const imageHeader = findEntryHeader(full, 'assets/images/big.png');
        const r = await recoverZipEntries(full.slice(0, imageHeader + 80));

        expect(r.entries.some(e => e.name === 'project.json')).toBe(true);      // the story survived
        expect(r.entries.some(e => e.name === 'assets/images/big.png')).toBe(false);
        expect(r.lost).toContain('assets/images/big.png');                      // and we SAY it didn't
    });
});

describe('a REAL damaged .flourish (the layout the reporting user actually has)', () => {
    // Everything above builds fixtures with project.json first. The user's file was written by the OLD
    // exporter: real FOLDER entries, all the media, and project.json LAST. That layout broke the
    // recovery — a folder entry has no data, and treating it as "size unknown" sent the walk skidding
    // straight past every real entry. It found nothing. This is the test that would have caught it.
    async function realExport(): Promise<Uint8Array> {
        const zip = new JSZip();
        zip.folder('assets')!.folder('images')!.file('bg.png', 'A'.repeat(20000));
        zip.folder('assets')!.folder('audio')!.file('theme.mp3', 'B'.repeat(30000));
        zip.file('project.json', JSON.stringify({ title: 'My Big Story', scenes: { s1: {}, s2: {}, s3: {} } }));
        zip.file('manifest.json', JSON.stringify({ schemaVersion: 1 }));
        return zip.generateAsync({ type: 'uint8array', streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 1 } });
    }

    it('recovers the story from a file whose central directory was chopped off', async () => {
        const full = await realExport();
        const broken = full.slice(0, full.length - 80);      // the index never got written
        await expect(JSZip.loadAsync(broken)).rejects.toThrow(/central directory/i);

        const repaired = await repairFlourishArchive(broken);
        expect(repaired).not.toBeNull();

        const zip = await JSZip.loadAsync(repaired!.archive);
        const story = JSON.parse(await zip.file('project.json')!.async('string'));
        expect(story.title).toBe('My Big Story');
        expect(Object.keys(story.scenes)).toHaveLength(3);
        // …and the artwork came back too.
        expect(repaired!.recovered).toContain('assets/images/bg.png');
        expect(repaired!.recovered).toContain('assets/audio/theme.mp3');
    });

    it('folder entries do not derail the walk', async () => {
        const r = await recoverZipEntries(await realExport());
        expect(r.truncated).toBe(false);
        expect(r.entries.map(e => e.name)).toEqual(
            expect.arrayContaining(['assets/images/bg.png', 'assets/audio/theme.mp3', 'project.json', 'manifest.json']),
        );
    });
});

describe('the archive ordering the recovery depends on', () => {
    it('project.json is written FIRST, so a cut-short save still contains the story', async () => {
        // exportProject reserves the slot up front and fills it in later. This pins the JSZip
        // behaviour that makes that work: re-adding an existing key replaces its CONTENT without
        // moving its POSITION. If this ever changed, a truncated save would lose the script and keep
        // the artwork — exactly backwards.
        const zip = new JSZip();
        zip.file('project.json', '');
        zip.file('manifest.json', '');
        zip.folder('assets')?.file('big.png', 'x'.repeat(1000));
        zip.file('project.json', '{"real":true}');

        expect(Object.keys(zip.files)[0]).toBe('project.json');

        const bytes = await zip.generateAsync({ type: 'uint8array', streamFiles: true });
        const first = (await recoverZipEntries(bytes)).entries[0];
        expect(first.name).toBe('project.json');
        expect(new TextDecoder().decode(first.data)).toBe('{"real":true}');
    });
});
