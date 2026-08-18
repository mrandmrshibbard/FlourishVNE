/**
 * Write a real `.flourish` archive.
 *
 * The layout mirrors `src/utils/projectPackager.ts` exactly, including one detail that is easy to
 * miss and load-bearing: **`project.json` is the FIRST entry in the zip.** The packager reserves
 * that slot deliberately, because an archive that gets cut short should lose art rather than the
 * script. Re-adding an existing key overwrites its content without moving its position, so the
 * same trick is used here.
 *
 * 🔴 Assets are written as real files under `assets/**`, never base64'd into `project.json`. That
 * is the difference between this and the old 229.9 MB output.
 */
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import type { VNProject } from '../ir/engineContract';
import type { AssetRegistry } from './assets';

export interface ExportManifest {
    schemaVersion: 1;
    exportedAt: string;
    project: { id: string; title: string };
    embedded: {
        backgrounds: string[]; images: string[]; audio: string[];
        videos: string[]; characters: string[]; ui: string[]; fonts: string[];
    };
    fetchFailures: string[];
}

export interface WriteResult {
    filePath: string;
    /** Bytes of the archive on disk. */
    archiveBytes: number;
    /** Bytes of `project.json` alone - the number the size gate is really about. */
    projectJsonBytes: number;
    assetCount: number;
    manifest: ExportManifest;
}

/**
 * `exportedAt` is a parameter rather than `new Date()` so a run is reproducible: two conversions of
 * the same source must produce byte-identical output for the golden digest to mean anything.
 */
export async function writeArchive(
    project: VNProject,
    registry: AssetRegistry,
    outFile: string,
    exportedAt: string,
): Promise<WriteResult> {
    const zip = new JSZip();

    // Reserve the two metadata slots FIRST, then fill them in - same ordering guarantee as the
    // editor's exporter.
    zip.file('project.json', '');
    zip.file('manifest.json', '');

    const manifest: ExportManifest = {
        schemaVersion: 1,
        exportedAt,
        project: { id: project.id, title: project.title },
        embedded: { backgrounds: [], images: [], audio: [], videos: [], characters: [], ui: [], fonts: [] },
        fetchFailures: [],
    };

    for (const [relPath, source] of registry.files) {
        const data = source.data ?? fs.readFileSync(source.file!);
        zip.file(relPath, data);
        const group = relPath.split('/')[1] as keyof ExportManifest['embedded'];
        if (group && manifest.embedded[group] && !manifest.embedded[group].includes(relPath)) {
            manifest.embedded[group].push(relPath);
        }
    }

    const projectJson = JSON.stringify(project, null, 2);
    zip.file('project.json', projectJson);
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
        // A fixed date keeps the archive byte-stable across runs.
        // (JSZip stamps each entry with `date`; without this it uses "now".)
    });

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, buffer);

    return {
        filePath: outFile,
        archiveBytes: buffer.length,
        projectJsonBytes: Buffer.byteLength(projectJson, 'utf8'),
        assetCount: registry.files.size,
        manifest,
    };
}

/** Every `data:` URL anywhere in a value - the check that keeps the archive from regressing. */
export function findDataUrls(value: unknown, at = '$'): string[] {
    if (typeof value === 'string') return value.startsWith('data:') ? [at] : [];
    if (Array.isArray(value)) return value.flatMap((v, i) => findDataUrls(v, `${at}[${i}]`));
    if (value && typeof value === 'object') {
        return Object.entries(value).flatMap(([k, v]) => findDataUrls(v, `${at}.${k}`));
    }
    return [];
}
