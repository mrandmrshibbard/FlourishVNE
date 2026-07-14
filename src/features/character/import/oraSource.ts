/**
 * Bulk sprite importer — source: OpenRaster (.ora) — Krita, GIMP, MyPaint, Pencil2D.
 *
 * An .ora is just a ZIP: `stack.xml` describing the layer tree + one PNG per layer under `data/`.
 * jszip is already a dependency, so this costs us nothing.
 *
 * ⚠️ Z-ORDER IS THE OPPOSITE OF PSD. Per the OpenRaster spec the FIRST child element is the TOPMOST
 * layer. PSD stores layers bottom-first. Both parsers must hand downstream code a BOTTOM-FIRST list,
 * or characters come out inside-out (hair behind the head, body over the face). Hence the loud
 * constant below.
 */
import JSZip from 'jszip';   // ESM import — NOT the CDN global that projectPackager.ts uses (that
                             // won't exist in a packaged offline build).
import { ImportedDoc, ImportedLayer, ImportWarning } from './types';

/** OpenRaster spec: first child = topmost. We reverse to get bottom-first. */
const ORA_CHILDREN_TOP_FIRST = true;

interface OraNode {
    src: string; name: string; groupPath: string[];
    x: number; y: number; visible: boolean; opacity: number; composite: string;
}

function walk(el: Element, path: string[], off: { x: number; y: number }, vis: boolean, op: number, out: OraNode[]) {
    const kids = Array.from(el.children);
    // Reverse so the array we build is BOTTOM-first.
    for (const k of (ORA_CHILDREN_TOP_FIRST ? [...kids].reverse() : kids)) {
        const x = off.x + Number(k.getAttribute('x') || 0);
        const y = off.y + Number(k.getAttribute('y') || 0);
        const visible = vis && (k.getAttribute('visibility') ?? 'visible') !== 'hidden';
        const opacity = op * (k.hasAttribute('opacity') ? Number(k.getAttribute('opacity')) : 1);
        const name = k.getAttribute('name') || 'Layer';

        if (k.tagName === 'stack') {
            // A stack's x/y offsets ALL of its children (additive down the tree).
            walk(k, [...path, name], { x, y }, visible, opacity, out);
            continue;
        }
        if (k.tagName !== 'layer') continue;
        const src = k.getAttribute('src');
        if (!src) continue;
        out.push({
            src, name, groupPath: path, x, y, visible, opacity,
            composite: k.getAttribute('composite-op') || 'svg:src-over',
        });
    }
}

export async function readOraSource(file: File): Promise<ImportedDoc> {
    const zip = await JSZip.loadAsync(file);
    const stackFile = zip.file('stack.xml');
    if (!stackFile) throw new Error("That .ora file has no stack.xml — it may be corrupt.");

    const xml = await stackFile.async('string');
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    if (parsed.querySelector('parsererror')) throw new Error("That .ora file's layer list is corrupt.");

    const image = parsed.documentElement;                 // <image w= h=>
    const width = Number(image.getAttribute('w') || 0);
    const height = Number(image.getAttribute('h') || 0);
    if (!width || !height) throw new Error("That .ora file doesn't say how big it is.");

    const nodes: OraNode[] = [];
    const rootStack = image.querySelector('stack');
    if (rootStack) walk(rootStack, [], { x: 0, y: 0 }, true, 1, nodes);
    if (!nodes.length) throw new Error('That .ora file has no layers.');

    const warnings: ImportWarning[] = [];
    const thumbUrls: string[] = [];

    const layers: ImportedLayer[] = nodes.map((n, i) => {
        const w: ImportWarning[] = [];
        if (n.composite !== 'svg:src-over') {
            w.push({
                code: 'blend-mode', severity: 'warn', layerName: n.name,
                message: `"${n.name}" uses a blend mode. The game stacks layers normally, so it will look different here.`,
            });
        }

        let thumb: string | null = null;
        const blobOf = async () => {
            const f = zip.file(n.src);
            if (!f) throw new Error(`"${n.name}" is missing its image inside the .ora file.`);
            return f.async('blob');
        };

        return {
            key: `o${i}`,
            name: n.name,
            groupPath: n.groupPath,
            visible: n.visible,
            opacity: n.opacity,
            blendMode: n.composite === 'svg:src-over' ? 'normal' : n.composite,
            // ORA layer PNGs are trimmed with x/y offsets, exactly like PSD → the same padding path.
            // We don't know w/h until the PNG is decoded, and drawImage(bmp, x, y) doesn't need them.
            rect: { x: n.x, y: n.y, w: 0, h: 0 },
            order: i,                                    // already bottom-first
            getSource: async () => createImageBitmap(await blobOf()),
            getThumbnail: async () => {
                if (!thumb) { thumb = URL.createObjectURL(await blobOf()); thumbUrls.push(thumb); }
                return thumb;
            },
            release: () => { /* nothing retained — pixels are pulled from the zip on demand */ },
            warnings: w,
        } satisfies ImportedLayer;
    });

    return {
        kind: 'ora',
        width, height, layers, warnings,
        dispose: () => { thumbUrls.forEach(URL.revokeObjectURL); thumbUrls.length = 0; },
    };
}
