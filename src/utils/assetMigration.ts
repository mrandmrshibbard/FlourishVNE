// Transparent migration that moves a project's media into the managed file store (desktop only) and
// keeps every asset field as a directly-usable `flourish-asset://` URL. Idempotent + upgrading:
//  • base64 `data:` field      → write the file + store the flourish-asset:// URL
//  • bare "assets/…" ref       → upgrade to the flourish-asset:// URL (no file write; covers projects
//                                migrated by the first, bare-ref version of this feature)
//  • already a flourish-asset: URL or empty → left alone
// On web/mobile (no store) it's a no-op, so those projects keep working as base64.
import { VNProject } from '../types/project';
import { isElectronAssetStore, writeAssetDataUrl, assetUrl } from './assetStore';
import { VNID } from '../types';

/** True once a project's media has been externalized to the file store. */
export const isAssetsExternalized = (project: VNProject): boolean =>
    (project as any).assetStorage === 'external';

/** Progress for the on-load asset migration, so the editor can surface a status bar. */
export interface MigrationProgress {
    done: number;          // assets processed so far
    total: number;         // assets that need work (base64 to write OR bare ref to upgrade)
    bytes: number;         // running total of bytes written to the file store
    label: string;         // friendly name of the asset just processed
}

// One field that holds an asset URL, located for migration.
interface FieldRef { type: StoreType; id: VNID; obj: any; key: string; label: string }
type StoreType = 'images' | 'backgrounds' | 'audio' | 'videos' | 'fonts' | 'characters';

/** Walk the project and collect every asset-URL field (regardless of its current value). */
function collectAssetFields(p: any): FieldRef[] {
    const refs: FieldRef[] = [];
    const pushColl = (coll: any, type: StoreType, keys: string[]) => {
        if (!coll) return;
        for (const a of Object.values(coll) as any[]) {
            for (const key of keys) {
                if (typeof a[key] === 'string' && a[key]) refs.push({ type, id: a.id, obj: a, key, label: a.name || a.id });
            }
        }
    };
    pushColl(p.images, 'images', ['imageUrl', 'videoUrl']);
    pushColl(p.backgrounds, 'backgrounds', ['imageUrl', 'videoUrl']);
    pushColl(p.audio, 'audio', ['audioUrl']);
    pushColl(p.videos, 'videos', ['videoUrl']);
    pushColl(p.fonts, 'fonts', ['fontUrl']);
    for (const c of Object.values((p.characters || {}) as Record<string, any>)) {
        const cl = c.name || c.id;
        if (typeof c.baseImageUrl === 'string' && c.baseImageUrl) refs.push({ type: 'characters', id: `${c.id}-base`, obj: c, key: 'baseImageUrl', label: cl });
        if (typeof c.baseVideoUrl === 'string' && c.baseVideoUrl) refs.push({ type: 'characters', id: `${c.id}-base`, obj: c, key: 'baseVideoUrl', label: cl });
        if (typeof c.fontUrl === 'string' && c.fontUrl) refs.push({ type: 'characters', id: `${c.id}-font`, obj: c, key: 'fontUrl', label: `${cl} font` });
        for (const layer of Object.values((c.layers || {}) as Record<string, any>)) {
            for (const asset of Object.values((layer.assets || {}) as Record<string, any>)) {
                if (typeof asset.imageUrl === 'string' && asset.imageUrl) refs.push({ type: 'characters', id: asset.id, obj: asset, key: 'imageUrl', label: cl });
                if (typeof asset.videoUrl === 'string' && asset.videoUrl) refs.push({ type: 'characters', id: asset.id, obj: asset, key: 'videoUrl', label: cl });
            }
        }
    }
    return refs;
}

const isBase64 = (v: string) => v.startsWith('data:');
const isBareRef = (v: string) => /^assets\//.test(v) && !v.startsWith('data:');
/** Rough decoded size of a base64 data: URL (for the progress byte counter). */
const dataUrlBytes = (v: string): number => { const i = v.indexOf(','); return i < 0 ? 0 : Math.floor((v.length - i - 1) * 0.75); };

/**
 * Normalize all asset fields to flourish-asset:// URLs (writing base64 to files as needed). Safe to
 * call on EVERY load: a no-op without the desktop store, cheap when fields are already URLs, and it
 * upgrades older bare-ref projects. Reports progress via `onProgress` (only fields that actually need
 * work count toward the total — already-migrated projects report nothing). Returns the (mutated)
 * project, whether anything changed, and how many files were written. Never throws on one asset.
 */
export async function externalizeProjectAssets(
    project: VNProject,
    onProgress?: (p: MigrationProgress) => void,
): Promise<{ project: VNProject; changed: boolean; migratedCount: number }> {
    if (!isElectronAssetStore()) return { project, changed: false, migratedCount: 0 };
    const pid = project.id;
    const p = project as any;

    // Only base64 (must write a file) or bare "assets/…" (must upgrade the ref) need work. Already a
    // flourish-asset:// URL or http(s)/blob → skip, so they never appear in the progress total.
    const pending = collectAssetFields(p).filter(r => { const v = r.obj[r.key]; return isBase64(v) || isBareRef(v); });
    const total = pending.length;
    let changed = false;
    let migratedCount = 0;
    let bytes = 0;
    let done = 0;

    if (total > 0) onProgress?.({ done: 0, total, bytes: 0, label: '' });

    for (const r of pending) {
        const v = r.obj[r.key];
        try {
            if (isBase64(v)) {
                const rel = await writeAssetDataUrl(pid, r.type, r.id, v);
                if (rel) { r.obj[r.key] = assetUrl(pid, rel); changed = true; migratedCount++; bytes += dataUrlBytes(v); }
            } else if (isBareRef(v)) {
                r.obj[r.key] = assetUrl(pid, v); changed = true; // upgrade bare ref (no file write)
            }
        } catch (e) { console.warn('[assetMigration] write failed for', r.type, r.id, e); }
        done++;
        onProgress?.({ done, total, bytes, label: r.label });
    }

    if (changed || !isAssetsExternalized(project)) { p.assetStorage = 'external'; }
    return { project: p as VNProject, changed, migratedCount };
}
