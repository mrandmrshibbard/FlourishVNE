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

interface AutoSaveMeta {
    key: string;
    projectId: VNID;
    title: string;
    savedAt: number;
    isAutoSave: boolean;
}

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
    tx.objectStore(PROJECT_STORE).delete(key);
    tx.objectStore(META_STORE).delete(key);

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
