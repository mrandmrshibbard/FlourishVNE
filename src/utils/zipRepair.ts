/**
 * Salvage a truncated .flourish.
 *
 * A zip is read BACKWARDS: the reader looks at the end of the file for the "end of central directory"
 * record, which points at the index of everything inside. So a file that was cut short — the writer
 * died before it wrote that index — is unopenable by any normal zip library, even though every byte
 * of the author's work that DID land on disk is sitting right there, perfectly intact.
 *
 * That is what happened to a real user: an interrupted save left them with
 * "Corrupt Zip: can't find end of central directory" and, as far as the app was concerned, nothing.
 *
 * This reads the file FORWARDS instead. Zip entries are self-describing — each is preceded by a local
 * file header with a magic number, the name, and how it was compressed — so we can walk from the front,
 * pull out every entry that made it, and rebuild a valid archive from the wreckage. Whatever was
 * written is recovered; only what never reached the disk is lost.
 *
 * The write path no longer produces these files (saves are written to a sidecar and renamed into
 * place, so the real file is never half-written). This exists for the ones already out there.
 */

const LOCAL_HEADER = 0x04034b50;      // PK\x03\x04 — starts every entry
const DATA_DESCRIPTOR = 0x08074b50;   // PK\x07\x08 — follows entry data when its size wasn't known upfront
const CENTRAL_HEADER = 0x02014b50;    // PK\x01\x02 — the index; if we reach it, the file wasn't truncated

export interface RepairedEntry { name: string; data: Uint8Array }

export interface RepairResult {
    entries: RepairedEntry[];
    /** True if we hit the end of the data before a clean finish — i.e. the file really was cut short. */
    truncated: boolean;
    /** Entries whose bytes were present but could not be decompressed (cut mid-stream). */
    lost: string[];
}

/**
 * Raw DEFLATE, via the platform. Chromium 120 (Electron 28) has this natively — no new dependency.
 *
 * Uses the streams API directly rather than the tidier `new Response(new Blob([data]).stream())`,
 * because `Blob.stream()` doesn't exist under the test runner and the recovery would then be
 * untestable — which, for code whose whole job is to rescue a user's lost work, is not acceptable.
 */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
    const ds = new DecompressionStream('deflate-raw');

    // Feed and read CONCURRENTLY. Awaiting the write first would deadlock on any data big enough to
    // fill the stream's internal buffer — i.e. on exactly the large projects this exists for.
    const writer = ds.writable.getWriter();
    const pump = (async () => {
        await writer.write(data as unknown as Uint8Array<ArrayBuffer>);
        await writer.close();
    })();

    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
    }
    await pump;                       // surfaces a bad-stream error rather than swallowing it

    const out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
}

/**
 * Walk the archive from the front and recover every entry that fully landed.
 *
 * ── The awkward part, and why this is a search rather than a walk ────────────────────────────────
 * A streaming writer doesn't know an entry's compressed size until it has finished compressing it, so
 * it writes 0 in the header and appends the real sizes AFTER the data, in a "data descriptor". The zip
 * spec says that descriptor MAY carry a magic number to mark itself — and **JSZip does not write one**.
 * (I assumed it did; the recovery silently found nothing until a test caught it.)
 *
 * So there is no marker saying "the data ends here". Instead we gather candidate end positions — the
 * next entry's header, the central directory, the end of the file — and then simply TRY each one: the
 * correct end is the one whose bytes actually inflate. Deflate streams are self-checking, so a wrong
 * guess reliably fails rather than yielding plausible garbage. That also protects us from the other
 * hazard here: compressed data can contain the bytes "PK\x03\x04" by pure chance, and a naive scan
 * would happily cut an entry in half at one.
 */
export async function recoverZipEntries(bytes: Uint8Array): Promise<RepairResult> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const entries: RepairedEntry[] = [];
    const lost: string[] = [];
    let truncated = true;
    let offset = 0;

    while (offset + 30 <= bytes.length) {
        const sig = view.getUint32(offset, true);

        // Reached the index → the archive was actually complete after all.
        if (sig === CENTRAL_HEADER) { truncated = false; break; }
        if (sig !== LOCAL_HEADER) break;                       // garbage → stop, keep what we have

        const flags = view.getUint16(offset + 6, true);
        const method = view.getUint16(offset + 8, true);
        const declaredSize = view.getUint32(offset + 18, true);
        const nameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);
        const dataStart = offset + 30 + nameLen + extraLen;
        if (dataStart > bytes.length) break;                   // the header itself was cut

        const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
        const isDir = !name || name.endsWith('/');

        // A FOLDER entry ("assets/") carries no data. Treating it as "size unknown" and then hunting
        // for where its data ends sends the walk skidding past every real entry — and since folders come
        // FIRST in a .flourish, that made the recovery find nothing at all in a real file. The tests
        // missed it because their fixtures happened to put project.json first.
        if (isDir) { offset = dataStart; continue; }

        // "Size unknown" is a FLAG, not an absence — a zero size can legitimately mean an empty file.
        const sizeUnknown = (flags & 0x08) !== 0;

        // ── The simple case: the header told us how big the data is.
        if (!sizeUnknown) {
            const dataEnd = dataStart + declaredSize;
            if (dataEnd > bytes.length) { lost.push(name); break; }
            await take(name, bytes.subarray(dataStart, dataEnd), method, entries, lost);
            offset = dataEnd;
            continue;
        }

        // ── The streamed case: find the end by trying the plausible ones.
        let decoded: Uint8Array | null = null;
        let dataEnd = -1;
        for (const end of candidateEnds(view, bytes.length, dataStart)) {
            if (end <= dataStart) continue;
            try {
                const raw = bytes.subarray(dataStart, end);
                decoded = method === 0 ? raw.slice() : await inflateRaw(raw);
                dataEnd = end;
                break;
            } catch { /* wrong end — try the next candidate */ }
        }

        if (dataEnd < 0) {                                     // this entry never fully landed
            lost.push(name);
            break;
        }
        if (decoded) entries.push({ name, data: decoded });

        // Step over the data and its descriptor (12 bytes, or 16 when it carries the optional marker).
        const hasMarker = dataEnd + 4 <= bytes.length && view.getUint32(dataEnd, true) === DATA_DESCRIPTOR;
        offset = dataEnd + (hasMarker ? 16 : 12);
    }

    return { entries, truncated, lost };
}

async function take(
    name: string, raw: Uint8Array, method: number, entries: RepairedEntry[], lost: string[],
): Promise<void> {
    try {
        entries.push({ name, data: method === 0 ? raw.slice() : await inflateRaw(raw) });
    } catch {
        lost.push(name);                                       // bytes present, but cut mid-stream
    }
}

/**
 * Where this entry's data could plausibly end, nearest first: just before the next header (allowing
 * for a 12- or 16-byte descriptor), at an explicit descriptor marker, or at the end of the file
 * (for the last entry in a truncated archive, whose descriptor may itself be missing).
 */
function candidateEnds(view: DataView, length: number, from: number): number[] {
    const out: number[] = [];
    const seen = new Set<number>();
    const push = (n: number) => { if (n > from && n <= length && !seen.has(n)) { seen.add(n); out.push(n); } };

    for (let i = from; i + 4 <= length && out.length < 24; i++) {
        const sig = view.getUint32(i, true);
        if (sig === DATA_DESCRIPTOR) push(i);
        else if (sig === LOCAL_HEADER || sig === CENTRAL_HEADER) { push(i - 12); push(i - 16); }
    }
    // The file simply ran out — the last entry's data may run right to the end, or stop just short of
    // a descriptor that did get written.
    push(length - 12);
    push(length - 16);
    push(length);

    return out.sort((a, b) => a - b);
}

/**
 * Rebuild a valid zip out of whatever survived, so the ordinary importer can open it.
 * Returns null when the story itself (project.json) didn't make it — there is nothing to salvage then,
 * and pretending otherwise would just hand the author an empty project.
 */
export async function repairFlourishArchive(
    bytes: Uint8Array,
): Promise<{ archive: Uint8Array; recovered: string[]; lost: string[] } | null> {
    const JSZip = (await import('jszip')).default;
    const { entries, lost } = await recoverZipEntries(bytes);
    if (!entries.some(e => e.name === 'project.json')) return null;

    const zip = new JSZip();
    for (const e of entries) zip.file(e.name, e.data as any);
    const archive = await zip.generateAsync({ type: 'uint8array' });
    return { archive, recovered: entries.map(e => e.name), lost };
}
