/**
 * The autosave checkpoint — the second copy that a fresh mangling cannot touch.
 * Runs on fake-indexeddb: the checkpoint logic chains requests inside ONE transaction, and real
 * IDB auto-commits a transaction the moment no requests are pending — a hand-rolled shim would
 * not enforce that and could pass while the real thing broke.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { saveProjectToIDB, loadProjectFromIDB, loadProjectByKey, getAutoSaveMetadata, deleteAutoSave } from '../storage';

const proj = (id: string, title: string) => ({ id, title, scenes: {}, variables: {} } as any);

describe('autosave checkpoint generations', () => {
    it('keeps an OLDER copy that a fresh (possibly mangled) save does not overwrite', async () => {
        await deleteAutoSave('p1' as any).catch(() => {});
        await saveProjectToIDB(proj('p1', 'Good v1'));
        // Second save: the previous stored copy gets promoted to the checkpoint slot first.
        await saveProjectToIDB(proj('p1', 'MANGLED v2'));

        const live = await loadProjectFromIDB('p1' as any);
        expect(live!.title).toBe('MANGLED v2');

        const checkpoint = await loadProjectByKey('autosave:p1:checkpoint');
        expect(checkpoint).not.toBeNull();
        expect(checkpoint!.title).toBe('Good v1');      // ← the way back
    });

    it('the checkpoint is promoted from DISK, never from the incoming project', async () => {
        await deleteAutoSave('p2' as any).catch(() => {});
        await saveProjectToIDB(proj('p2', 'A'));
        await saveProjectToIDB(proj('p2', 'B'));
        await saveProjectToIDB(proj('p2', 'C'));   // within the 10-min window → checkpoint stays 'A'
        const checkpoint = await loadProjectByKey('autosave:p2:checkpoint');
        expect(checkpoint!.title).toBe('A');
    });

    it('metadata lists the checkpoint, labeled', async () => {
        await deleteAutoSave('p3' as any).catch(() => {});
        await saveProjectToIDB(proj('p3', 'One'));
        await saveProjectToIDB(proj('p3', 'Two'));
        const metas = await getAutoSaveMetadata();
        const mine = metas.filter(m => m.projectId === 'p3');
        expect(mine.some(m => m.isCheckpoint)).toBe(true);
        expect(mine.some(m => !m.isCheckpoint)).toBe(true);
    });

    it('deleteAutoSave removes BOTH generations', async () => {
        await deleteAutoSave('p4' as any).catch(() => {});
        await saveProjectToIDB(proj('p4', 'X'));
        await saveProjectToIDB(proj('p4', 'Y'));
        await deleteAutoSave('p4' as any);
        expect(await loadProjectFromIDB('p4' as any)).toBeNull();
        expect(await loadProjectByKey('autosave:p4:checkpoint')).toBeNull();
    });
});
