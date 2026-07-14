import { describe, it, expect, beforeEach } from 'vitest';
import {
    SlotStorage, readAllSaves, writeSlot, deleteSlot, migrateLegacySaves,
    legacyKeyOf, slotKeyOf,
} from '../saveSlotStore';

/** In-memory adapter mimicking a STRING backend (localStorage): values round-trip through JSON. */
function stringBackend(seed: Record<string, string> = {}) {
    const map = new Map<string, string>(Object.entries(seed));
    const storage: SlotStorage = {
        getItem: async k => (map.has(k) ? map.get(k)! : null),
        setItem: async (k, v) => { map.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
        removeItem: async k => { map.delete(k); },
        listKeys: async prefix => [...map.keys()].filter(k => k.startsWith(prefix)),
    };
    return { storage, map };
}

/** Adapter mimicking an OBJECT backend (electron-store / Android bridge): no enumeration. */
function objectBackend(seed: Record<string, unknown> = {}) {
    const map = new Map<string, unknown>(Object.entries(seed));
    const storage: SlotStorage = {
        getItem: async k => (map.has(k) ? map.get(k)! : null),
        setItem: async (k, v) => { map.set(k, v); },
        removeItem: async k => { map.delete(k); },
        listKeys: async () => null,                       // ← can't enumerate; index must carry it
    };
    return { storage, map };
}

const PID = 'game1';
const save = (label: string) => ({ label, variables: { hp: 10 } });

describe('per-slot basics', () => {
    it('writes, reads and deletes slots independently', async () => {
        const { storage } = stringBackend();
        await writeSlot(storage, PID, 0, save('auto'));
        await writeSlot(storage, PID, 3, save('manual'));
        expect(Object.keys(await readAllSaves(storage, PID)).sort()).toEqual(['0', '3']);
        await deleteSlot(storage, PID, 0);
        const after = await readAllSaves<any>(storage, PID);
        expect(after[0]).toBeUndefined();
        expect(after[3].label).toBe('manual');
    });

    it('works on a backend with NO key enumeration (the index carries slot discovery)', async () => {
        const { storage } = objectBackend();
        await writeSlot(storage, PID, 2, save('two'));
        await writeSlot(storage, PID, 7, save('seven'));
        const all = await readAllSaves<any>(storage, PID);
        expect(Object.keys(all).sort()).toEqual(['2', '7']);
    });

    it('a lost index self-heals by probing (index is a cache, not an authority)', async () => {
        const { storage, map } = objectBackend();
        await writeSlot(storage, PID, 1, save('one'));
        map.delete(`vn-saves-${PID}-slots`);              // index gone
        const all = await readAllSaves<any>(storage, PID);
        expect(all[1].label).toBe('one');
    });
});

describe('THE POINT: one corrupt slot no longer kills the collection', () => {
    it('quarantines the bad slot and returns the good ones', async () => {
        const { storage, map } = stringBackend();
        await writeSlot(storage, PID, 1, save('good'));
        await writeSlot(storage, PID, 2, save('also good'));
        map.set(slotKeyOf(PID, 2), '{corrupt!!!');

        const all = await readAllSaves<any>(storage, PID);
        expect(all[1].label).toBe('good');                 // survived
        expect(all[2]).toBeUndefined();                    // lost — but ONLY this one
        expect(map.get(`${slotKeyOf(PID, 2)}-corrupt`)).toBe('{corrupt!!!');   // evidence preserved
    });
});

describe('legacy migration — must never eat a player\'s saves', () => {
    const legacyBlob = JSON.stringify({ 0: save('auto'), 1: save('ch1'), 5: save('ch5') });

    it('splits the old all-in-one blob into per-slot keys and keeps a backup', async () => {
        const { storage, map } = stringBackend({ [legacyKeyOf(PID)]: legacyBlob });
        const all = await readAllSaves<any>(storage, PID);
        expect(Object.keys(all).sort()).toEqual(['0', '1', '5']);
        expect(all[5].label).toBe('ch5');
        expect(map.has(legacyKeyOf(PID))).toBe(false);                      // moved…
        expect(map.has(`${legacyKeyOf(PID)}-legacy-backup`)).toBe(true);    // …not deleted
    });

    it('is idempotent — reading twice migrates once and loses nothing', async () => {
        const { storage } = stringBackend({ [legacyKeyOf(PID)]: legacyBlob });
        await readAllSaves(storage, PID);
        const again = await readAllSaves<any>(storage, PID);
        expect(Object.keys(again).sort()).toEqual(['0', '1', '5']);
    });

    it('a FAILED migration leaves the legacy blob authoritative and still serves the saves', async () => {
        // Backend that dies on the second write — mid-migration, like a quota hit.
        const { storage, map } = stringBackend({ [legacyKeyOf(PID)]: legacyBlob });
        let writes = 0;
        const flaky: SlotStorage = {
            ...storage,
            setItem: async (k, v) => {
                if (++writes >= 2) throw new Error('QuotaExceeded');
                await storage.setItem(k, v);
            },
        };
        const all = await readAllSaves<any>(flaky, PID);
        expect(Object.keys(all).sort()).toEqual(['0', '1', '5']);           // served from legacy
        expect(map.has(legacyKeyOf(PID))).toBe(true);                       // untouched, will retry
    });

    it('an unparseable legacy blob is quarantined, not overwritten', async () => {
        const { storage, map } = stringBackend({ [legacyKeyOf(PID)]: 'PK\x03\x04 not json' });
        const all = await readAllSaves(storage, PID);
        expect(all).toEqual({});
        expect(map.get(`${legacyKeyOf(PID)}-corrupt`)).toBe('PK\x03\x04 not json');
    });

    it('migrates OBJECT backends too (electron-store stores real objects, not JSON strings)', async () => {
        const { storage, map } = objectBackend({ [legacyKeyOf(PID)]: { 0: save('auto'), 2: save('two') } });
        const all = await readAllSaves<any>(storage, PID);
        expect(Object.keys(all).sort()).toEqual(['0', '2']);
        expect(map.has(`${legacyKeyOf(PID)}-legacy-backup`)).toBe(true);
    });
});

describe('write failure is LOUD', () => {
    it('writeSlot propagates the storage error — no more silent false success', async () => {
        const { storage } = stringBackend();
        const full: SlotStorage = { ...storage, setItem: async () => { throw new Error('QuotaExceeded'); } };
        await expect(writeSlot(full, PID, 1, save('x'))).rejects.toThrow('QuotaExceeded');
    });
});
