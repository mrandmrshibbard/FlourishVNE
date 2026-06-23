// File-backed asset store (desktop/Electron). Asset binaries live in a managed per-project folder on
// disk (userData/projectAssets/<projectId>/assets/<type>/<id>.<ext>) and are served to the editor via
// the custom `flourish-asset://` protocol — so the project object holds only lightweight references
// (e.g. "assets/videos/<id>.mp4"), never gigabytes of base64.
//
// On web/mobile there is no electron bridge, so `isElectronAssetStore()` is false and callers fall
// back to base64 (data: URLs), exactly as before.
import { VNID } from '../types';
import { fileToBase64 } from './file';

export const ASSET_SCHEME = 'flourish-asset';

type StoreType = 'images' | 'backgrounds' | 'audio' | 'videos' | 'fonts' | 'characters';

const api = (): any => (typeof window !== 'undefined' ? (window as any).electronAPI : undefined);

/** True when the desktop file-backed asset store is available. */
export const isElectronAssetStore = (): boolean => !!api()?.writeProjectAsset;

/** Whether a stored field value is a managed reference (relative `assets/…` path) vs a usable URL. */
export const isExternalRef = (value: string | null | undefined): boolean =>
    !!value && !/^(data:|https?:|blob:|flourish-asset:|file:)/i.test(value) && value.includes('assets/');

/** Build the protocol URL the browser can load for a managed reference. */
export const assetUrl = (projectId: VNID, relPath: string): string =>
    `${ASSET_SCHEME}://${projectId}/${relPath.replace(/^\/+/, '')}`;

/** True for any managed-asset field value: a flourish-asset:// URL OR a bare "assets/…" path. */
export const isManagedRef = (value: string | null | undefined): boolean =>
    !!value && (value.startsWith(`${ASSET_SCHEME}:`) || (/^assets\//.test(value) && !value.startsWith('data:')));

/** Normalize a managed field value to its project-relative path ("assets/…"). null if not managed. */
export const refToRelPath = (value: string | null | undefined): string | null => {
    if (!value) return null;
    if (value.startsWith(`${ASSET_SCHEME}:`)) {
        try { return new URL(value).pathname.replace(/^\/+/, ''); } catch { return null; }
    }
    if (/^assets\//.test(value) && !value.startsWith('data:')) return value;
    return null;
};

/** Resolve a raw asset-field value to a usable URL: data:/http/blob/file as-is; managed ref → protocol.
 *  CRITICAL: only synthesize a flourish-asset:// URL when the editor's protocol actually exists
 *  (isElectronAssetStore). This same code is bundled into the GAME ENGINE, where built games hold bare
 *  "assets/…" paths and have NO flourish-asset protocol — there the bare path must pass through so it
 *  loads relative to index.html. (Without this guard, built web/desktop/android games rewrite every
 *  asset to a flourish-asset:// URL with no handler → broken images/audio/fonts.) */
export const resolveFieldUrl = (projectId: VNID, value: string | null | undefined): string | null => {
    if (!value) return null;
    if (isExternalRef(value)) return isElectronAssetStore() ? assetUrl(projectId, value) : value;
    return value; // data: / http(s): / blob: / already a flourish-asset: URL
};

const extFromFile = (file: File): string => {
    const fromName = file.name.includes('.') ? file.name.split('.').pop()! : '';
    if (fromName) return fromName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const m = (file.type || '').split('/')[1];
    return (m || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
};

const extFromDataUrl = (dataUrl: string): string => {
    const m = dataUrl.match(/^data:([^;,]+)/);
    const mime = m ? m[1] : '';
    const sub = mime.split('/')[1] || 'bin';
    const map: Record<string, string> = { jpeg: 'jpg', 'svg+xml': 'svg', mpeg: 'mp3', quicktime: 'mov', 'x-wav': 'wav' };
    return (map[sub] || sub).toLowerCase().replace(/[^a-z0-9]/g, '');
};

const fileToArrayBuffer = (file: File): Promise<ArrayBuffer> =>
    new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as ArrayBuffer);
        r.onerror = () => reject(r.error || new Error('read failed'));
        r.readAsArrayBuffer(file);
    });

/** Decode a base64/`data:` URL to raw bytes (for migrating embedded media to files). */
export const dataUrlToBytes = (dataUrl: string): Uint8Array => {
    const comma = dataUrl.indexOf(',');
    const b64 = dataUrl.slice(comma + 1);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
};

/** Write an uploaded File to the store; returns the project-relative ref (or null on failure). */
export async function writeAsset(projectId: VNID, type: StoreType, id: VNID, file: File): Promise<string | null> {
    const a = api();
    if (!a?.writeProjectAsset) return null;
    const buf = await fileToArrayBuffer(file);
    const res = await a.writeProjectAsset(projectId, type, id, extFromFile(file), buf);
    return res?.success ? res.relPath : null;
}

/** Write raw bytes (migration path) — caller supplies the extension. Returns the ref or null. */
export async function writeAssetBytes(projectId: VNID, type: StoreType, id: VNID, ext: string, bytes: Uint8Array): Promise<string | null> {
    const a = api();
    if (!a?.writeProjectAsset) return null;
    const res = await a.writeProjectAsset(projectId, type, id, ext, bytes);
    return res?.success ? res.relPath : null;
}

/** Write a base64/data: URL to the store (migration convenience). */
export async function writeAssetDataUrl(projectId: VNID, type: StoreType, id: VNID, dataUrl: string): Promise<string | null> {
    return writeAssetBytes(projectId, type, id, extFromDataUrl(dataUrl), dataUrlToBytes(dataUrl));
}

/** Ingest an uploaded file: write it to the managed store and return its ref (desktop), or fall back
 *  to a base64 data: URL (web/mobile, or if the write fails). The caller pre-generates `id` so the
 *  stored filename matches the asset id. */
export async function ingestUpload(projectId: VNID, type: StoreType, id: VNID, file: File): Promise<string> {
    if (isElectronAssetStore()) {
        const rel = await writeAsset(projectId, type, id, file);
        if (rel) return assetUrl(projectId, rel); // store a directly-usable URL (editor + engine)
    }
    return fileToBase64(file);
}

export async function readAssetBytes(projectId: VNID, relPath: string): Promise<Uint8Array | null> {
    const a = api();
    if (!a?.readProjectAsset) return null;
    const res = await a.readProjectAsset(projectId, relPath);
    return res?.success ? new Uint8Array(res.data) : null;
}

export async function deleteAsset(projectId: VNID, relPath: string): Promise<void> {
    const a = api();
    if (a?.deleteProjectAsset && isExternalRef(relPath)) { try { await a.deleteProjectAsset(projectId, relPath); } catch { /* best-effort */ } }
}

export async function deleteAssetFolder(projectId: VNID): Promise<void> {
    const a = api();
    if (a?.deleteProjectAssetFolder) { try { await a.deleteProjectAssetFolder(projectId); } catch { /* best-effort */ } }
}

export async function copyAssetFolder(fromProjectId: VNID, toProjectId: VNID): Promise<void> {
    const a = api();
    if (a?.copyProjectAssetFolder) { try { await a.copyProjectAssetFolder(fromProjectId, toProjectId); } catch { /* best-effort */ } }
}

export async function listAssets(projectId: VNID): Promise<string[]> {
    const a = api();
    if (!a?.listProjectAssets) return [];
    const res = await a.listProjectAssets(projectId);
    return res?.success ? res.files : [];
}

/** Total bytes + per-relPath sizes of the project's managed asset folder (for size display). */
export async function getProjectAssetSizes(projectId: VNID): Promise<{ total: number; sizes: Record<string, number> }> {
    const a = api();
    if (!a?.getProjectAssetSizes) return { total: 0, sizes: {} };
    try {
        const res = await a.getProjectAssetSizes(projectId);
        if (res?.success) return { total: res.total, sizes: res.sizes };
    } catch { /* ignore */ }
    return { total: 0, sizes: {} };
}
