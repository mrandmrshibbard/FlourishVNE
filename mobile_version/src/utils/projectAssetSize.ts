// Estimate how much embedded media a project carries. Used to warn creators BEFORE an export gets
// too large (the .flourish bundles every asset, and very large bundles are slow / memory-heavy).
// We only count `data:` URLs — those are the bytes actually held in the project; file-path / remote
// refs don't bloat it.
import { VNProject } from '../types/project';

/** Approximate decoded byte size of a data: URL (base64 payload length × 3/4). 0 for non-data URLs. */
export function dataUrlBytes(url: string | null | undefined): number {
    if (!url || !url.startsWith('data:')) return 0;
    const comma = url.indexOf(',');
    if (comma < 0) return 0;
    const meta = url.slice(0, comma);
    const payload = url.length - comma - 1;
    if (meta.includes(';base64')) return Math.floor(payload * 0.75);
    // URL-encoded (rare): rough — assume ~1 byte per char.
    return payload;
}

export interface AssetSizeEntry { name: string; bytes: number; kind: string; }
export interface ProjectAssetSize { total: number; largest: AssetSizeEntry[]; embeddedCount: number; }

/** Total embedded-media bytes in the project + the biggest individual assets (for a warning list). */
export function estimateProjectAssetBytes(project: VNProject): ProjectAssetSize {
    const entries: AssetSizeEntry[] = [];
    const add = (name: string, kind: string, url: string | null | undefined) => {
        const bytes = dataUrlBytes(url);
        if (bytes > 0) entries.push({ name: name || kind, kind, bytes });
    };

    for (const a of Object.values(project.images || {}) as any[]) add(a.name, 'image', a.imageUrl);
    for (const a of Object.values(project.backgrounds || {}) as any[]) add(a.name, 'background', a.imageUrl);
    for (const a of Object.values(project.audio || {}) as any[]) add(a.name, 'audio', a.audioUrl);
    for (const a of Object.values(project.videos || {}) as any[]) add(a.name, 'video', a.videoUrl);
    for (const f of Object.values((project as any).fonts || {}) as any[]) add(f.name || f.family, 'font', f.url || f.dataUrl);
    for (const c of Object.values(project.characters || {}) as any[]) {
        add(`${c.name} (base)`, 'character', c.baseImageUrl);
        add(`${c.name} (base video)`, 'character', c.baseVideoUrl);
        add(`${c.name} (font)`, 'font', c.fontUrl);
        for (const layer of Object.values(c.layers || {}) as any[]) {
            for (const asset of Object.values(layer.assets || {}) as any[]) {
                add(`${c.name} · ${asset.name || layer.name}`, 'character', asset.imageUrl || asset.videoUrl);
            }
        }
    }

    const total = entries.reduce((s, e) => s + e.bytes, 0);
    const largest = entries.sort((a, b) => b.bytes - a.bytes).slice(0, 6);
    return { total, largest, embeddedCount: entries.length };
}

/** Human-readable byte size (e.g. "1.4 GB"). */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let v = bytes / 1024;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Soft threshold (bytes) above which we warn before export. ~600MB: exports work well past this
 *  (streaming removes the old ~2GB ceiling) but they get slow + produce big distributables. */
export const LARGE_PROJECT_WARN_BYTES = 600 * 1024 * 1024;

/** Per-file threshold (bytes) for the "this asset is large" import warning. */
export const LARGE_ASSET_WARN_BYTES = 25 * 1024 * 1024;
