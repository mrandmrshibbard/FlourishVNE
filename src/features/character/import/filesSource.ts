/**
 * Bulk sprite importer — source: many loose image files dropped at once.
 *
 * This is the case that helps everyone TODAY: artists already export their layers to PNG by hand,
 * they just have to upload them one at a time. Here they drop all 30 and we group them by filename.
 */
import { ImportedDoc, ImportedLayer, ImportWarning } from './types';

const isImage = (f: File) => f.type.startsWith('image/') || /\.(png|webp|jpe?g|gif)$/i.test(f.name);

/** Path from a FOLDER drop (`webkitRelativePath`), minus the shared root dir. */
function groupPathOf(f: File, rootPrefix: string): string[] {
    const rel: string = (f as any).webkitRelativePath || '';
    if (!rel) return [];
    const segs = rel.split('/').slice(0, -1);          // drop the filename
    if (rootPrefix && segs[0] === rootPrefix) segs.shift();
    return segs;
}

async function probeSize(file: File): Promise<{ w: number; h: number }> {
    const bmp = await createImageBitmap(file);
    const out = { w: bmp.width, h: bmp.height };
    bmp.close();
    return out;
}

export async function readFilesSource(input: File[]): Promise<ImportedDoc> {
    const files = input.filter(isImage);
    const warnings: ImportWarning[] = [];
    if (!files.length) throw new Error('None of those files are images.');

    // Strip a shared root folder so `MyChar/eyes/happy.png` groups as `eyes`, not `MyChar`.
    const firstRel: string = (files[0] as any).webkitRelativePath || '';
    const rootPrefix = firstRel.includes('/') ? firstRel.split('/')[0] : '';

    const sizes = await Promise.all(files.map(probeSize));

    // Doc size = the MODAL size across the drop (the size most files agree on).
    const tally = new Map<string, number>();
    sizes.forEach(s => tally.set(`${s.w}x${s.h}`, (tally.get(`${s.w}x${s.h}`) ?? 0) + 1));
    const [modal] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const [docW, docH] = modal[0].split('x').map(Number);

    const thumbUrls: string[] = [];   // tracked so dispose() can revoke every one

    const layers: ImportedLayer[] = files.map((file, i) => {
        const size = sizes[i];
        const w: ImportWarning[] = [];

        if (/^image\/jpe?g$/.test(file.type)) {
            w.push({
                code: 'no-alpha', severity: 'warn', layerName: file.name,
                message: `"${file.name}" is a JPEG, which can't have transparency — it will import as a solid rectangle and hide everything behind it. Save it as a PNG.`,
            });
        }
        // Different ASPECT is the one that actually misplaces art (the engine fits each layer by its
        // own aspect). A different size at the same aspect is harmless — we pad it to the doc anyway.
        const aspect = size.w / size.h, docAspect = docW / docH;
        if (Math.abs(aspect - docAspect) / docAspect > 0.01) {
            w.push({
                code: 'size-mismatch', severity: 'warn', layerName: file.name,
                message: `"${file.name}" is ${size.w}×${size.h}, a different shape from the rest (${docW}×${docH}). It may not line up with the other layers.`,
            });
        }

        let thumb: string | null = null;
        return {
            key: `f${i}`,
            name: file.name,
            groupPath: groupPathOf(file, rootPrefix),
            visible: true,
            opacity: 1,
            blendMode: 'normal',
            rect: { x: 0, y: 0, w: size.w, h: size.h },
            order: i,
            getSource: () => createImageBitmap(file),
            getThumbnail: async () => {
                if (!thumb) { thumb = URL.createObjectURL(file); thumbUrls.push(thumb); }
                return thumb;
            },
            originalFile: file,
            release: () => { /* nothing retained — the File is owned by the drop */ },
            warnings: w,
        } satisfies ImportedLayer;
    });

    return {
        kind: 'files',
        width: docW,
        height: docH,
        layers,
        warnings,
        // Thumbnails are object URLs onto the Files — revoke them or they leak for the session.
        dispose: () => { thumbUrls.forEach(URL.revokeObjectURL); thumbUrls.length = 0; },
    };
}
