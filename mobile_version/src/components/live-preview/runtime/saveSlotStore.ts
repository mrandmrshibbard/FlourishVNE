/**
 * Player saves v2 — one key per slot, instead of every slot in one basket.
 *
 * v1 stored ALL of a game's save slots as a single storage entry (`vn-saves-<gameId>`): the
 * autosave, every manual slot, each with an embedded screenshot. That design had two failure modes,
 * both discovered by auditing after a real data-loss incident:
 *
 *   • One bad byte killed everything. A torn write or browser-store corruption made the single
 *     entry unparseable → every slot vanished from the load screen at once — and the next save
 *     overwrote the wreckage with a fresh single-slot object, destroying the evidence.
 *   • Every save rewrote every slot. Saving slot 3 re-serialized slots 1–8 too, so writes grew
 *     with playtime and each one re-risked the whole collection.
 *
 * v2: each slot lives under its own key (`vn-saves-<gameId>-slot-<n>`). A corrupt slot costs that
 * slot; the others load fine. A small index key remembers which slots exist for backends that
 * can't enumerate keys — the index is a CACHE, not an authority: it is rebuilt from scanning
 * whenever possible, and losing it loses nothing.
 *
 * MIGRATION (the part that must never eat a player's saves): on first read, a legacy blob is split
 * into per-slot keys, each write is READ BACK AND VERIFIED, and only then is the legacy blob moved
 * aside to `…-legacy-backup` — moved, never deleted. If anything fails mid-way (quota, crash), the
 * legacy blob is still in place and the next read simply tries again; re-splitting the same data is
 * idempotent. An unparseable legacy blob is quarantined to `…-corrupt`, untouched, exactly as v1's
 * fix did.
 *
 * Pure logic over a storage adapter — no React, no window. LivePreview provides the adapter
 * (localStorage in shipped web/desktop games, the electron-store bridge in editor preview, the
 * Android native bridge in APKs). This module ships INSIDE the game engine bundle.
 */

/** What a backend must provide. `setItem` MUST throw/reject on failure — a silent false "success"
 *  upstream is precisely the bug (Android) this rewrite exists to kill. */
export interface SlotStorage {
    /** Returns the stored value: a parsed object, a JSON string (string backends), or null. */
    getItem(key: string): Promise<unknown>;
    setItem(key: string, value: unknown): Promise<void>;
    removeItem(key: string): Promise<void>;
    /** Every stored key that starts with `prefix`, or null if this backend can't enumerate. */
    listKeys(prefix: string): Promise<string[] | null>;
}

export const legacyKeyOf = (projectId: string) => `vn-saves-${projectId}`;
export const slotKeyOf = (projectId: string, slot: number) => `vn-saves-${projectId}-slot-${slot}`;
export const indexKeyOf = (projectId: string) => `vn-saves-${projectId}-slots`;

/** Last-resort probe range when there's no enumeration and no index. Save UIs offer far fewer. */
const PROBE_MAX_SLOT = 40;

const SLOT_KEY_RE = /-slot-(\d+)$/;

/** Normalize whatever the backend returned into an object (or null). Strings get parsed;
 *  unparseable strings return undefined so the caller can quarantine the raw text. */
type Normalized = { ok: true; data: any; raw?: undefined } | { ok: false; raw: string; data?: undefined };
function normalize(value: unknown): Normalized | null {
    if (value == null) return null;
    if (typeof value !== 'string') return { ok: true, data: value };
    try {
        return { ok: true, data: JSON.parse(value) };
    } catch {
        return { ok: false, raw: value };
    }
}

/** Park damaged data under a side key so nothing ever overwrites the evidence. Best-effort. */
async function quarantine(storage: SlotStorage, key: string, raw: string): Promise<void> {
    try {
        const qKey = `${key}-corrupt`;
        if ((await storage.getItem(qKey)) == null) await storage.setItem(qKey, raw);
    } catch { /* quota — at least we didn't destroy anything */ }
}

/**
 * Split a legacy all-slots blob into per-slot keys. Crash-safe by ordering:
 * write slots → verify each by reading back → write index → move legacy aside.
 * Any failure leaves the legacy blob authoritative and the next call retries.
 */
export async function migrateLegacySaves(storage: SlotStorage, projectId: string): Promise<void> {
    const legacyKey = legacyKeyOf(projectId);
    const rawValue = await storage.getItem(legacyKey);
    if (rawValue == null) return;

    const parsed = normalize(rawValue);
    if (!parsed) return;
    if (!parsed.ok) {
        await quarantine(storage, legacyKey, parsed.raw);
        await storage.removeItem(legacyKey);       // the bytes live on under -corrupt
        return;
    }

    const saves = parsed.data as Record<string, unknown>;
    const slots = Object.keys(saves).filter(k => /^\d+$/.test(k));

    for (const slot of slots) {
        const key = slotKeyOf(projectId, Number(slot));
        await storage.setItem(key, saves[slot]);
        if ((await storage.getItem(key)) == null) {
            // Verification failed — abort with the legacy blob untouched. Nothing is lost;
            // the next read attempts the migration again.
            throw new Error(`Save migration: slot ${slot} did not read back; keeping legacy data.`);
        }
    }
    await storage.setItem(indexKeyOf(projectId), slots.map(Number));

    // All slots verified — NOW the legacy blob can step aside. Moved, not deleted: it is the
    // player's save history and storage is cheap.
    await storage.setItem(`${legacyKey}-legacy-backup`, parsed.data);
    await storage.removeItem(legacyKey);
}

/** Which slots exist? Enumeration when the backend supports it (self-healing), else the index,
 *  else a bounded probe. */
async function discoverSlots(storage: SlotStorage, projectId: string): Promise<number[]> {
    const prefix = `vn-saves-${projectId}-slot-`;
    const keys = await storage.listKeys(prefix);
    if (keys) {
        return keys
            .map(k => SLOT_KEY_RE.exec(k)?.[1])
            .filter((m): m is string => m != null)
            .map(Number);
    }
    const idx = normalize(await storage.getItem(indexKeyOf(projectId)));
    if (idx?.ok && Array.isArray(idx.data)) {
        return (idx.data as unknown[]).filter((n): n is number => typeof n === 'number');
    }
    const found: number[] = [];
    for (let n = 0; n <= PROBE_MAX_SLOT; n++) {
        if ((await storage.getItem(slotKeyOf(projectId, n))) != null) found.push(n);
    }
    return found;
}

/**
 * Read every slot. A corrupt slot is quarantined and SKIPPED — it costs that one slot, never the
 * collection. Runs the legacy migration first, so callers never think about formats.
 */
export async function readAllSaves<T>(storage: SlotStorage, projectId: string): Promise<Record<number, T>> {
    try {
        await migrateLegacySaves(storage, projectId);
    } catch (e) {
        // Migration couldn't complete (e.g. quota). The legacy blob is still authoritative — serve
        // saves from IT so the player sees their slots even though the split hasn't happened yet.
        const legacy = normalize(await storage.getItem(legacyKeyOf(projectId)));
        if (legacy?.ok) return legacy.data as Record<number, T>;
        return {};
    }

    const out: Record<number, T> = {};
    for (const slot of await discoverSlots(storage, projectId)) {
        const key = slotKeyOf(projectId, slot);
        const value = normalize(await storage.getItem(key));
        if (!value) continue;
        if (!value.ok) {
            await quarantine(storage, key, value.raw);
            await storage.removeItem(key);
            continue;                                   // this slot is lost; its neighbours are not
        }
        out[slot] = value.data as T;
    }
    return out;
}

/** Write ONE slot. Throws on failure — the caller decides how to tell the player. */
export async function writeSlot<T>(storage: SlotStorage, projectId: string, slot: number, save: T): Promise<void> {
    await storage.setItem(slotKeyOf(projectId, slot), save);
    // Keep the index in step for backends that can't enumerate. Best-effort: the index is a cache.
    try {
        const slots = new Set(await discoverSlots(storage, projectId));
        slots.add(slot);
        await storage.setItem(indexKeyOf(projectId), [...slots].sort((a, b) => a - b));
    } catch { /* index refresh is not worth failing a successful save over */ }
}

export async function deleteSlot(storage: SlotStorage, projectId: string, slot: number): Promise<void> {
    await storage.removeItem(slotKeyOf(projectId, slot));
    try {
        const slots = new Set(await discoverSlots(storage, projectId));
        slots.delete(slot);
        await storage.setItem(indexKeyOf(projectId), [...slots].sort((a, b) => a - b));
    } catch { /* cache */ }
}
