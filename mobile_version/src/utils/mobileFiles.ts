/**
 * mobileFiles.ts — app-private .flourish project storage for the mobile editor.
 *
 * `.flourish` files are binary ZIPs (see projectPackager.exportProject). On the
 * packaged Android app these live in the app's private files dir via the native
 * `window.FlourishMobile` bridge. In a desktop browser (mobile-layout preview)
 * we fall back to a dedicated IndexedDB store so the in-app file manager still
 * works for testing — same API, no APK required.
 *
 * This is editor-only (NOT bundled into the game engine).
 */

export interface ProjectFileEntry {
  name: string;     // e.g. "my_game.flourish"
  size: number;     // bytes
  modified: number; // epoch ms
}

interface NativeBridge {
  native: true;
  list(): Promise<ProjectFileEntry[]>;
  read(name: string): Promise<string | null>;          // base64
  write(name: string, base64: string): Promise<string | null>;
  remove(name: string): Promise<boolean>;
  share(name: string): void;
}

function bridge(): NativeBridge | null {
  const b = (typeof window !== 'undefined' ? (window as any).FlourishMobile : null) as NativeBridge | null;
  return b && b.native ? b : null;
}

/** True when running inside the packaged Android app (native file bridge present). */
export function hasNativeFiles(): boolean {
  return !!bridge();
}

// ── base64 <-> bytes ──
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(bin);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function ensureFlourishExt(name: string): string {
  const n = (name || 'project').trim();
  return n.toLowerCase().endsWith('.flourish') ? n : `${n}.flourish`;
}

// ── IndexedDB fallback (browser preview) ──
const FB_DB = 'flourish-mobile-files';
const FB_STORE = 'files';

function fbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FB_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FB_STORE)) db.createObjectStore(FB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function fbList(): Promise<ProjectFileEntry[]> {
  const db = await fbOpen();
  return new Promise((resolve) => {
    const tx = db.transaction(FB_STORE, 'readonly');
    const store = tx.objectStore(FB_STORE);
    const out: ProjectFileEntry[] = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        const v = cur.value as { data: ArrayBuffer; modified: number };
        out.push({ name: String(cur.key), size: v.data?.byteLength ?? 0, modified: v.modified ?? 0 });
        cur.continue();
      } else resolve(out);
    };
    req.onerror = () => resolve(out);
  });
}

async function fbRead(name: string): Promise<Uint8Array | null> {
  const db = await fbOpen();
  return new Promise((resolve) => {
    const tx = db.transaction(FB_STORE, 'readonly');
    const req = tx.objectStore(FB_STORE).get(name);
    req.onsuccess = () => {
      const v = req.result as { data: ArrayBuffer } | undefined;
      resolve(v?.data ? new Uint8Array(v.data) : null);
    };
    req.onerror = () => resolve(null);
  });
}

async function fbWrite(name: string, data: Uint8Array): Promise<string> {
  const db = await fbOpen();
  // copy into a standalone ArrayBuffer for structured-clone storage
  const buf = data.slice().buffer;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FB_STORE, 'readwrite');
    tx.objectStore(FB_STORE).put({ data: buf, modified: Date.now() }, name);
    tx.oncomplete = () => resolve(name);
    tx.onerror = () => reject(tx.error);
  });
}

async function fbDelete(name: string): Promise<boolean> {
  const db = await fbOpen();
  return new Promise((resolve) => {
    const tx = db.transaction(FB_STORE, 'readwrite');
    tx.objectStore(FB_STORE).delete(name);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

// ── public API (native first, IndexedDB fallback) ──

export async function listProjectFiles(): Promise<ProjectFileEntry[]> {
  const b = bridge();
  if (b) { try { return await b.list(); } catch { return []; } }
  return fbList();
}

export async function readProjectFile(name: string): Promise<Uint8Array | null> {
  const b = bridge();
  if (b) {
    const b64 = await b.read(name);
    return b64 ? base64ToBytes(b64) : null;
  }
  return fbRead(name);
}

/** Returns the stored (possibly sanitized) filename. */
export async function writeProjectFile(name: string, data: Uint8Array): Promise<string> {
  const stored = ensureFlourishExt(name);
  const b = bridge();
  if (b) {
    const res = await b.write(stored, bytesToBase64(data));
    return res || stored;
  }
  return fbWrite(stored, data);
}

export async function deleteProjectFile(name: string): Promise<boolean> {
  const b = bridge();
  if (b) { try { return await b.remove(name); } catch { return false; } }
  return fbDelete(name);
}

/** Share the project out (system sheet on device; download in browser preview). */
export async function shareProjectFile(name: string): Promise<void> {
  const b = bridge();
  if (b) { b.share(name); return; }
  // Browser fallback: read + trigger a download.
  const bytes = await readProjectFile(name);
  if (!bytes) return;
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = ensureFlourishExt(name);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Register a callback fired when a .flourish file is opened/shared INTO the app
 * (native only). Returns an unsubscribe fn.
 */
export function onProjectImported(cb: (name: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  (window as any).__onProjectImported = cb;
  return () => { if ((window as any).__onProjectImported === cb) (window as any).__onProjectImported = undefined; };
}
