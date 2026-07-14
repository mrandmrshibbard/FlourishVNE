import { VNID } from '../types';
import { VNProject } from '../types/project';

const DB_NAME = 'flourish-vne';
const DB_VERSION = 1;
const PROJECT_STORE = 'projects';
const META_STORE = 'metadata';

export interface RecentProjectInfo {
    id: VNID;
    title: string;
    lastOpened: number;
}

export interface AutoSaveMeta {
    key: string;
    projectId: VNID;
    title: string;
    savedAt: number;
    isAutoSave: boolean;
    /** An older, deliberately-lagging copy — see the checkpoint note on saveProjectToIDB. */
    isCheckpoint?: boolean;
}

/**
 * How far the checkpoint copy is allowed to lag behind the live autosave.
 *
 * The live autosave is rewritten ~1.2 seconds after ANY change. That makes it a terrible last line
 * of defence on its own: if something mangles the in-memory project (a bad migration, a reducer
 * bug, a plugin), the mangled state is faithfully persisted over the only backup about a second
 * later. The checkpoint is the answer — a second copy that is only refreshed from the CURRENT
 * stored autosave (not from memory) at most once per this interval, so there is always a copy at
 * least a few minutes upstream of whatever just went wrong.
 */
const CHECKPOINT_INTERVAL_MS = 10 * 60 * 1000;

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(PROJECT_STORE)) {
                db.createObjectStore(PROJECT_STORE);
            }
            if (!db.objectStoreNames.contains(META_STORE)) {
                db.createObjectStore(META_STORE);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveProjectToIDB(project: VNProject): Promise<void> {
    const db = await openDB();
    const tx = db.transaction([PROJECT_STORE, META_STORE], 'readwrite');
    const projectStore = tx.objectStore(PROJECT_STORE);
    const metaStore = tx.objectStore(META_STORE);

    const key = `autosave:${project.id}`;
    const checkpointKey = `${key}:checkpoint`;

    // ── Promote a checkpoint BEFORE overwriting the live slot ──────────────────────────────────
    // The copy promoted is the one already ON DISK (the previous autosave), never the incoming
    // in-memory project — so even if what we're about to write is mangled, the checkpoint holds a
    // state from before the damage. All inside this one transaction: either everything commits or
    // nothing does.
    const metaReq = metaStore.get(checkpointKey);
    metaReq.onsuccess = () => {
        const existing = metaReq.result as AutoSaveMeta | undefined;
        if (existing && Date.now() - existing.savedAt < CHECKPOINT_INTERVAL_MS) return;
        const prevReq = projectStore.get(key);
        prevReq.onsuccess = () => {
            const prevProject = prevReq.result as VNProject | undefined;
            if (!prevProject) return;                     // first save ever — nothing to promote yet
            const prevMetaReq = metaStore.get(key);
            prevMetaReq.onsuccess = () => {
                const prevMeta = prevMetaReq.result as AutoSaveMeta | undefined;
                projectStore.put(prevProject, checkpointKey);
                metaStore.put({
                    key: checkpointKey,
                    projectId: project.id,
                    title: prevProject.title || 'Untitled Project',
                    savedAt: prevMeta?.savedAt ?? Date.now(),   // when that copy was really made
                    isAutoSave: true,
                    isCheckpoint: true,
                } satisfies AutoSaveMeta, checkpointKey);
            };
        };
    };

    projectStore.put(project, key);

    const meta: AutoSaveMeta = {
        key,
        projectId: project.id,
        title: project.title || 'Untitled Project',
        savedAt: Date.now(),
        isAutoSave: true
    };
    metaStore.put(meta, key);

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

/** Load a stored copy by its exact meta key — the recovery panel uses this so a CHECKPOINT entry
 *  loads the checkpoint, not the (possibly poisoned) live slot. */
export async function loadProjectByKey(key: string): Promise<VNProject | null> {
    const db = await openDB();
    const tx = db.transaction(PROJECT_STORE, 'readonly');
    const request = tx.objectStore(PROJECT_STORE).get(key);
    return new Promise((resolve, reject) => {
        request.onsuccess = () => { db.close(); resolve(request.result || null); };
        request.onerror = () => { db.close(); reject(request.error); };
    });
}

export async function loadProjectFromIDB(projectId: VNID): Promise<VNProject | null> {
    const db = await openDB();
    const tx = db.transaction(PROJECT_STORE, 'readonly');
    const store = tx.objectStore(PROJECT_STORE);
    const key = `autosave:${projectId}`;
    const request = store.get(key);

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            db.close();
            resolve(request.result || null);
        };
        request.onerror = () => {
            db.close();
            reject(request.error);
        };
    });
}

export async function getAutoSaveMetadata(): Promise<AutoSaveMeta[]> {
    const db = await openDB();
    const tx = db.transaction(META_STORE, 'readonly');
    const store = tx.objectStore(META_STORE);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            db.close();
            const metas = (request.result as AutoSaveMeta[]).filter(m => m.isAutoSave);
            metas.sort((a, b) => b.savedAt - a.savedAt);
            resolve(metas);
        };
        request.onerror = () => {
            db.close();
            reject(request.error);
        };
    });
}

export async function deleteAutoSave(projectId: VNID): Promise<void> {
    const db = await openDB();
    const tx = db.transaction([PROJECT_STORE, META_STORE], 'readwrite');
    const key = `autosave:${projectId}`;
    for (const k of [key, `${key}:checkpoint`]) {
        tx.objectStore(PROJECT_STORE).delete(k);
        tx.objectStore(META_STORE).delete(k);
    }

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

export async function getAllAutoSavedProjects(): Promise<Array<{ meta: AutoSaveMeta; project: VNProject }>> {
    const db = await openDB();
    const tx = db.transaction([PROJECT_STORE, META_STORE], 'readonly');
    const metaStore = tx.objectStore(META_STORE);
    const projectStore = tx.objectStore(PROJECT_STORE);

    const metaRequest = metaStore.getAll();
    const metaKeysRequest = metaStore.getAllKeys();

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
            db.close();

            const metas = metaRequest.result as AutoSaveMeta[];
            const keys = metaKeysRequest.result as IDBValidKey[];
            const results: Array<{ meta: AutoSaveMeta; project: VNProject }> = [];

            const loadPromises = metas
                .filter(m => m.isAutoSave)
                .map(async (meta) => {
                    const project = await loadProjectFromIDB(meta.projectId);
                    if (project) {
                        results.push({ meta, project });
                    }
                });

            Promise.all(loadPromises).then(() => {
                results.sort((a, b) => b.meta.savedAt - a.meta.savedAt);
                resolve(results);
            });
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}
