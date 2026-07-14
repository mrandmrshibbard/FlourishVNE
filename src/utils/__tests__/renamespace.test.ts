import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { renamespaceOnCollision } from '../projectPackager';

const proj = (id: string, title: string) => ({ id, title } as any);
beforeEach(() => localStorage.clear());

describe('import id-collision re-namespace', () => {
    it('a SAME-id, DIFFERENT-title import gets a fresh id (template derivatives must not clobber each other)', async () => {
        localStorage.setItem('flourish:recentProjects', JSON.stringify([{ id: 'proj-123', title: 'My Existing Game' }]));
        const p = proj('proj-123', 'Totally Different Story');
        await renamespaceOnCollision(p);
        expect(p.id).not.toBe('proj-123');
        expect(p.id).toMatch(/^proj-\d+-[a-z0-9]{6}$/);
    });

    it('re-opening YOUR OWN project (same id, same title) keeps its id — continuity of saves/recents/autosave', async () => {
        localStorage.setItem('flourish:recentProjects', JSON.stringify([{ id: 'proj-123', title: 'My Game' }]));
        const p = proj('proj-123', 'My Game');
        await renamespaceOnCollision(p);
        expect(p.id).toBe('proj-123');
    });

    it('no local project with that id → untouched', async () => {
        const p = proj('proj-999', 'Anything');
        await renamespaceOnCollision(p);
        expect(p.id).toBe('proj-999');
    });

    it('unreadable recents store never blocks an import', async () => {
        localStorage.setItem('flourish:recentProjects', '{{{corrupt');
        const p = proj('proj-1', 'X');
        await expect(renamespaceOnCollision(p)).resolves.toBeUndefined();
        expect(p.id).toBe('proj-1');
    });
});
