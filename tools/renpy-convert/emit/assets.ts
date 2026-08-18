/**
 * The asset registry: every file that will live in the archive, keyed by its final path.
 *
 * 🔴 Assets are registered with their ARCHIVE-RELATIVE path from the start - `assets/images/...` -
 * and the bytes are carried separately. Nothing is ever base64'd into a URL. The old build put
 * every asset in a `data:` URL inside `project.json` and reached **229.9 MB**, which is both the
 * size problem and the reason the export path was fragile.
 *
 * Paths and filenames mirror `src/utils/projectPackager.ts` exactly (`<id>_<sanitised name>.<ext>`,
 * lower-cased, non-alphanumerics collapsed to `_`), so an archive written here is indistinguishable
 * from one the editor exported.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Verbatim port of the packager's `sanitizeFilename`. */
export function sanitizeFilename(name: string, fallback: string): string {
    if (!name || name.trim() === '') return fallback;
    return name.replace(/[^a-z0-9_.\-]/gi, '_').replace(/_{2,}/g, '_').toLowerCase();
}

export type AssetGroup = 'backgrounds' | 'images' | 'audio' | 'videos' | 'characters' | 'fonts';

export interface RegisteredAsset {
    id: string;
    name: string;
    /** Archive-relative path, e.g. `assets/images/img_1_hill.png`. */
    relPath: string;
    group: AssetGroup;
    bytes: number;
}

export class AssetRegistry {
    /** Archive path -> the bytes to write, or the file to read them from. */
    readonly files = new Map<string, { file?: string; data?: Buffer }>();
    private byId = new Map<string, RegisteredAsset>();
    /** Source path (lower-cased) -> asset id, so the same file is never packed twice. */
    private bySource = new Map<string, string>();
    private seq = 0;

    private nextId(prefix: string): string { return `${prefix}_${++this.seq}`; }

    private record(id: string, name: string, relPath: string, group: AssetGroup, bytes: number): RegisteredAsset {
        const asset: RegisteredAsset = { id, name, relPath, group, bytes };
        this.byId.set(id, asset);
        return asset;
    }

    /**
     * Register a file from disk. The same source path returns the SAME asset - the old build keyed
     * audio by BASENAME, so 218 distinct paths collapsed onto 131 names and roughly 87 lines played
     * the wrong clip. Keying on the full path makes that impossible.
     */
    addFile(srcFile: string, group: AssetGroup, name: string, idPrefix: string): RegisteredAsset {
        const key = srcFile.toLowerCase();
        const existing = this.bySource.get(key);
        if (existing) return this.byId.get(existing)!;

        const id = this.nextId(idPrefix);
        const ext = path.extname(srcFile).slice(1).toLowerCase() || 'bin';
        const relPath = `assets/${group}/${id}_${sanitizeFilename(name, group)}.${ext}`;
        this.files.set(relPath, { file: srcFile });
        this.bySource.set(key, id);
        return this.record(id, name, relPath, group, fs.statSync(srcFile).size);
    }

    /** Register bytes produced by the converter itself (a baked colour grade). */
    addBuffer(data: Buffer, group: AssetGroup, name: string, idPrefix: string, ext = 'png'): RegisteredAsset {
        const id = this.nextId(idPrefix);
        const relPath = `assets/${group}/${id}_${sanitizeFilename(name, group)}.${ext}`;
        this.files.set(relPath, { data });
        return this.record(id, name, relPath, group, data.length);
    }

    /**
     * Character layer art, which the packager nests per character and layer:
     * `assets/characters/<charId>/<layerId>/<assetId>_<name>.<ext>`.
     */
    addCharacterArt(
        charId: string, layerId: string, name: string,
        source: { file?: string; data?: Buffer }, ext = 'png',
    ): RegisteredAsset {
        if (source.file) {
            const key = `${charId}|${layerId}|${source.file.toLowerCase()}`;
            const existing = this.bySource.get(key);
            if (existing) return this.byId.get(existing)!;
            const id = this.nextId('la');
            const relPath = `assets/characters/${charId}/${layerId}/${id}_${sanitizeFilename(name, 'asset')}.${ext}`;
            this.files.set(relPath, { file: source.file });
            this.bySource.set(key, id);
            return this.record(id, name, relPath, 'characters', fs.statSync(source.file).size);
        }
        const id = this.nextId('la');
        const relPath = `assets/characters/${charId}/${layerId}/${id}_${sanitizeFilename(name, 'asset')}.${ext}`;
        this.files.set(relPath, { data: source.data! });
        return this.record(id, name, relPath, 'characters', source.data!.length);
    }

    get(id: string): RegisteredAsset | undefined { return this.byId.get(id); }
    all(): RegisteredAsset[] { return [...this.byId.values()]; }

    /** Total bytes the archive will carry, before compression. */
    totalBytes(): number {
        let n = 0;
        for (const asset of this.byId.values()) n += asset.bytes;
        return n;
    }
}
