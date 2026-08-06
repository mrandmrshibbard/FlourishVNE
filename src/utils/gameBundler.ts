/**
 * Game Bundler - Browser-based game packaging
 * Creates standalone, distributable HTML5 games entirely in the browser
 * NO command line or Node.js required!
 */

import JSZip from 'jszip';
import { VNProject } from '../types/project';
import { VNPlugin } from '../types/plugins';
import { UIActionType } from '../types/shared';
import { getGameEngineCode } from './gameEngineBundle';

export interface BuildProgress {
  step: string;
  progress: number; // 0-100
  message: string;
}

export type ProgressCallback = (progress: BuildProgress) => void;

/**
 * Fetches a URL and returns it as a base64 data URL.
 * Works for both relative file paths and absolute URLs.
 */
// ext → mime for reconstructing a data: URL from raw file bytes.
function extToMime(ext: string): string {
  const e = ext.toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
    mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', m4v: 'video/x-m4v',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
    ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  };
  return map[e] || 'application/octet-stream';
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

async function fetchAsDataURL(url: string): Promise<string> {
  // Managed file-backed assets: read via the IPC bridge (a cross-origin fetch() of flourish-asset://
  // from the editor page is CORS-blocked, which would silently leave the URL unresolved in builds).
  if (url.startsWith('flourish-asset:')) {
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : undefined;
    if (api?.readProjectAsset) {
      try {
        const u = new URL(url);
        const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
        const res = await api.readProjectAsset(u.hostname, rel);
        if (res?.success) return bytesToDataUrl(new Uint8Array(res.data), extToMime(rel.split('.').pop() || 'bin'));
      } catch (e) { console.warn(`Failed to read managed asset: ${url}`, e); }
    }
    return url;
  }
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn(`Failed to fetch asset: ${url}`, e);
    return url; // Return original URL as fallback
  }
}

/**
 * Resolves all file-path asset URLs in the project to inline data URLs.
 * This ensures the project is fully self-contained for export.
 * Data URLs and empty strings are left unchanged.
 */
export async function resolveProjectAssets(
  project: VNProject,
  onProgress?: ProgressCallback
): Promise<VNProject> {
  // Deep-clone the project so we don't mutate the original in-memory state
  const resolved: VNProject = JSON.parse(JSON.stringify(project));

  const isFilePath = (url: string | undefined | null): url is string =>
    !!url && !url.startsWith('data:') && !url.startsWith('blob:') && !url.startsWith('http')
    && !url.startsWith('assets/') /* already a bundled relative path (managed assets) */ && url.length > 0;

  // Collect all URL fields that need resolving
  const tasks: { obj: any; key: string; url: string }[] = [];

  // Backgrounds
  Object.values(resolved.backgrounds || {}).forEach(bg => {
    if (isFilePath(bg.imageUrl)) tasks.push({ obj: bg, key: 'imageUrl', url: bg.imageUrl });
    if (isFilePath((bg as any).videoUrl)) tasks.push({ obj: bg, key: 'videoUrl', url: (bg as any).videoUrl });
  });

  // Images
  Object.values(resolved.images || {}).forEach(img => {
    if (isFilePath(img.imageUrl)) tasks.push({ obj: img, key: 'imageUrl', url: img.imageUrl });
    if (isFilePath((img as any).videoUrl)) tasks.push({ obj: img, key: 'videoUrl', url: (img as any).videoUrl });
  });

  // Audio
  Object.values(resolved.audio || {}).forEach(audio => {
    if (isFilePath(audio.audioUrl)) tasks.push({ obj: audio, key: 'audioUrl', url: audio.audioUrl });
  });

  // Videos
  Object.values(resolved.videos || {}).forEach(video => {
    if (isFilePath(video.videoUrl)) tasks.push({ obj: video, key: 'videoUrl', url: video.videoUrl });
  });

  // Characters: base assets, layer assets, fonts
  Object.values(resolved.characters || {}).forEach(char => {
    if (isFilePath(char.baseImageUrl)) tasks.push({ obj: char, key: 'baseImageUrl', url: char.baseImageUrl });
    if (isFilePath((char as any).baseVideoUrl)) tasks.push({ obj: char, key: 'baseVideoUrl', url: (char as any).baseVideoUrl });
    if (isFilePath(char.fontUrl)) tasks.push({ obj: char, key: 'fontUrl', url: char.fontUrl });
    Object.values(char.layers || {}).forEach(layer => {
      Object.values(layer.assets || {}).forEach(asset => {
        if (isFilePath(asset.imageUrl)) tasks.push({ obj: asset, key: 'imageUrl', url: asset.imageUrl });
        if (isFilePath((asset as any).videoUrl)) tasks.push({ obj: asset, key: 'videoUrl', url: (asset as any).videoUrl });
        // Character Poses: a piece's per-pose pictures live in poseArt — miss these and
        // pose art ships broken (exactly what happened on itch: refs with no packed file).
        Object.values((asset as any).poseArt || {}).forEach((art: any) => {
          if (isFilePath(art.imageUrl)) tasks.push({ obj: art, key: 'imageUrl', url: art.imageUrl });
          if (isFilePath(art.videoUrl)) tasks.push({ obj: art, key: 'videoUrl', url: art.videoUrl });
        });
      });
    });
    // Character Poses: each pose's own base sprite.
    Object.values((char as any).poses || {}).forEach((pose: any) => {
      if (isFilePath(pose.baseImageUrl)) tasks.push({ obj: pose, key: 'baseImageUrl', url: pose.baseImageUrl });
      if (isFilePath(pose.baseVideoUrl)) tasks.push({ obj: pose, key: 'baseVideoUrl', url: pose.baseVideoUrl });
    });
  });

  // Project-level fonts
  Object.values((resolved as any).fonts || {}).forEach((font: any) => {
    if (font && isFilePath(font.fontUrl)) tasks.push({ obj: font, key: 'fontUrl', url: font.fontUrl });
  });

  if (tasks.length === 0) return resolved;

  onProgress?.({
    step: 'resolve-assets',
    progress: 5,
    message: `Resolving ${tasks.length} asset(s)...`
  });

  // Fetch all assets in parallel (batched to avoid overwhelming the browser)
  const BATCH = 10;
  for (let i = 0; i < tasks.length; i += BATCH) {
    const batch = tasks.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(t => fetchAsDataURL(t.url)));
    batch.forEach((t, idx) => {
      t.obj[t.key] = results[idx];
    });
    onProgress?.({
      step: 'resolve-assets',
      progress: 5 + ((i + batch.length) / tasks.length) * 5,
      message: `Resolved ${Math.min(i + BATCH, tasks.length)}/${tasks.length} assets...`
    });
  }

  return resolved;
}

/**
 * Stream every file-backed asset (flourish-asset:// URL) straight from the managed store into the
 * build via `addFile(relPath, bytes)`, and rewrite each field to its relative `assets/…` path. This
 * bundles them WITHOUT re-inlining to base64 — so even multi-GB projects build without blowing memory,
 * and EVERY asset (images, video, audio, character sprites, custom TTF/OTF fonts, …) is accounted for.
 * Returns the rewritten project (refs → relative paths). No-op without the desktop store.
 */
export async function streamManagedAssets(
  project: VNProject,
  addFile: (relPath: string, bytes: Uint8Array) => void,
): Promise<VNProject> {
  const api = typeof window !== 'undefined' ? (window as any).electronAPI : undefined;
  if (!api?.readProjectAsset) return project;
  const clone: VNProject = JSON.parse(JSON.stringify(project)); // small — fields are refs, not bytes
  const written = new Set<string>();
  const handle = async (val: string): Promise<string> => {
    if (!val.startsWith('flourish-asset:')) return val;
    try {
      const u = new URL(val);
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      if (!written.has(rel)) {
        const res = await api.readProjectAsset(u.hostname, rel);
        if (res?.success) { addFile(rel, new Uint8Array(res.data)); written.add(rel); }
        else { console.warn('streamManagedAssets: missing', val); return val; }
      }
      return rel; // relative path the game loads from its assets/ folder
    } catch (e) { console.warn('streamManagedAssets failed', val, e); return val; }
  };
  const walk = async (node: any): Promise<void> => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (typeof node[i] === 'string') node[i] = await handle(node[i]);
        else if (node[i] && typeof node[i] === 'object') await walk(node[i]);
      }
    } else if (node && typeof node === 'object') {
      for (const k in node) {
        if (typeof node[k] === 'string') node[k] = await handle(node[k]);
        else if (node[k] && typeof node[k] === 'object') await walk(node[k]);
      }
    }
  };
  await walk(clone);
  return clone;
}

/**
 * Bundles the entire game into a single downloadable ZIP file
 * that can be uploaded directly to itch.io or any web host
 */
export async function buildStandaloneGame(
  project: VNProject,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const zip = new JSZip();

  // Step 0: Leave unused library assets behind — anything no command/screen/character/item
  // references stays out of the build entirely (both the streamed and data-URL paths below
  // only see the pruned project).
  const pruneResult = pruneUnusedAssets(project);
  if (pruneResult.pruned > 0) {
    console.log(`[Build] Skipped ${pruneResult.pruned} unused asset(s):`, pruneResult.prunedNames.slice(0, 20).join(', '));
  }
  project = pruneResult.project;

  // Step 0a: Stream file-backed (flourish-asset://) media straight into the zip's assets/ folder
  // (no base64 re-inline → handles huge projects + guarantees every asset incl. fonts is bundled).
  const streamedProject = await streamManagedAssets(project, (rel, bytes) => { zip.file(rel, bytes); });

  // Step 0b: Resolve any remaining file-path / base64 assets to data URLs (5-10%)
  const resolvedProject = await resolveProjectAssets(streamedProject, onProgress);

  // Step 1: Prepare project data (10%)
  onProgress?.({
    step: 'prepare',
    progress: 10,
    message: 'Preparing game data...'
  });

  // Build the asset map ONCE and strip data URLs from the project before
  // inlining it. The HTML used to contain the full project (data URLs and all),
  // which doubled the download/parse cost; the lean copy holds only filename
  // references and the runtime loads each asset from the `assets/` folder on
  // demand via the standard image / video / audio resolvers.
  const assetUrls = collectAllAssets(resolvedProject);
  const leanProject = buildLeanProject(resolvedProject, assetUrls);
  // (projectData was previously stringified here for legacy logging — the
  // lean copy is now serialized inside generateStandaloneHTML.)

  // Step 2: Generate game files (30%)
  onProgress?.({
    step: 'generate',
    progress: 30,
    message: 'Generating game files...'
  });

  const htmlContent = await generateStandaloneHTML(leanProject, {
    // The floating fullscreen chip is a web-build nicety — desktop/android builds
    // call generateStandaloneHTML directly and never pass this.
    fullscreenButton: project.buildOptions?.webFullscreenButton
      ? { corner: project.buildOptions.webFullscreenCorner }
      : null,
  });
  zip.file('index.html', htmlContent);

  // Step 3: Copy all assets (50%)
  onProgress?.({
    step: 'assets',
    progress: 50,
    message: 'Bundling assets...'
  });

  // Create assets directory and copy all referenced assets
  const assetsFolder = zip.folder('assets');
  if (!assetsFolder) throw new Error('Failed to create assets folder');
  let assetCount = 0;
  
  for (const [name, dataUrl] of Object.entries(assetUrls)) {
    assetCount++;
    const progressPercent = 50 + (assetCount / Object.keys(assetUrls).length) * 30;
    
    onProgress?.({
      step: 'assets',
      progress: progressPercent,
      message: `Copying asset ${assetCount}/${Object.keys(assetUrls).length}...`
    });

    // Convert data URL to blob
    if (dataUrl.startsWith('data:')) {
      const blob = dataURLToBlob(dataUrl);
      assetsFolder.file(name, blob);
    }
  }

  // Step 4: Add README for players (90%)
  onProgress?.({
    step: 'finalize',
    progress: 90,
    message: 'Creating player guide...'
  });

  const readmeContent = generatePlayerReadme(project);
  zip.file('README.txt', readmeContent);

  // Step 5: Generate final ZIP (100%)
  onProgress?.({
    step: 'complete',
    progress: 100,
    message: 'Building game package...'
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  return blob;
}

const vendorCache: Record<string, string> = {};

async function fetchVendorScript(url: string): Promise<string> {
  if (vendorCache[url]) return vendorCache[url];
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    vendorCache[url] = text;
    return text;
  } catch {
    return '';
  }
}

async function fetchVendorScripts(): Promise<{ react: string; reactDom: string; tailwind: string }> {
  const [react, reactDom, tailwind] = await Promise.all([
    fetchVendorScript('https://unpkg.com/react@18/umd/react.production.min.js'),
    fetchVendorScript('https://unpkg.com/react-dom@18/umd/react-dom.production.min.js'),
    fetchVendorScript('https://cdn.tailwindcss.com'),
  ]);
  return { react, reactDom, tailwind };
}

/**
 * Generates a self-contained HTML file with the game engine embedded
 * Fetches React/ReactDOM/Tailwind at build time and inlines them for true offline play
 */
/**
 * Remove add-ons that must NOT ship inside a playable game build:
 *  - Editor extensions (`manifest.target === 'editor'`) — they only extend the editor and run unsandboxed.
 *  - Any plugin the user opted out of via `includeInBuild === false`.
 * Their plugin-scoped storage is dropped too (e.g. a Story Bible's notes don't belong in the game).
 * Runtime plugins (the default) are kept so games that intentionally use a plugin still work.
 * The built-in Story Bible (`project.storyBible`) is stripped for the same reason — private
 * writer's notes never ship. The glossary intentionally SHIPS (players hover its terms).
 */
export function stripBuildExcludedPlugins(project: VNProject): VNProject {
  const plugins = (project.plugins || {}) as Record<string, VNPlugin>;
  const keptPlugins: Record<string, VNPlugin> = {};
  const keptStorage: Record<string, any> = {};
  for (const [id, p] of Object.entries(plugins)) {
    const editorOnly = p?.manifest?.target === 'editor';
    const optedOut = (p as VNPlugin).includeInBuild === false;
    if (editorOnly || optedOut) continue;
    keptPlugins[id] = p;
    if (project.pluginStorage && project.pluginStorage[id] !== undefined) keptStorage[id] = project.pluginStorage[id];
  }
  const { storyBible: _privateNotes, ...rest } = project;
  return { ...rest, plugins: keptPlugins, pluginStorage: keptStorage };
}

/** Where the optional web-build fullscreen button sits. */
export type FullscreenCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface StandaloneHtmlOptions {
  /** When set, a floating fullscreen toggle button is injected (web builds only). */
  fullscreenButton?: { corner?: FullscreenCorner } | null;
}

/**
 * Markup + script for the optional fullscreen toggle chip on web builds.
 * Self-contained (no engine involvement): hides itself where the browser
 * forbids fullscreen (e.g. iPhones), swaps icon on state change.
 */
export function buildFullscreenButtonHtml(corner: FullscreenCorner = 'top-right'): string {
  const pos: Record<FullscreenCorner, string> = {
    'top-left': 'top: 12px; left: 12px;',
    'top-right': 'top: 12px; right: 12px;',
    'bottom-left': 'bottom: 12px; left: 12px;',
    'bottom-right': 'bottom: 12px; right: 12px;',
  };
  const place = pos[corner] || pos['top-right'];
  return `
  <button id="vn-fullscreen-btn" type="button" title="Fullscreen" aria-label="Fullscreen"
    style="position: fixed; ${place} z-index: 100000; width: 40px; height: 40px; padding: 8px; border: none; border-radius: 8px; background: rgba(0,0,0,0.45); color: #fff; cursor: pointer; display: none; align-items: center; justify-content: center; transition: opacity 0.2s, background 0.2s; opacity: 0.55;"
    onmouseenter="this.style.opacity='1'; this.style.background='rgba(0,0,0,0.7)';"
    onmouseleave="this.style.opacity='0.55'; this.style.background='rgba(0,0,0,0.45)';">
    <svg id="vn-fs-icon-expand" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
    <svg id="vn-fs-icon-compress" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
  </button>
  <script>
    (function () {
      var btn = document.getElementById('vn-fullscreen-btn');
      if (!btn) return;
      var doc = document;
      var canFullscreen = doc.fullscreenEnabled || doc.webkitFullscreenEnabled;
      if (!canFullscreen) return; // stays display:none where the browser forbids it
      btn.style.display = 'flex';
      function isFullscreen() {
        return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
      }
      function updateIcon() {
        var full = isFullscreen();
        document.getElementById('vn-fs-icon-expand').style.display = full ? 'none' : 'block';
        document.getElementById('vn-fs-icon-compress').style.display = full ? 'block' : 'none';
        btn.title = full ? 'Exit fullscreen' : 'Fullscreen';
        btn.setAttribute('aria-label', btn.title);
      }
      btn.addEventListener('click', function () {
        try {
          if (isFullscreen()) {
            (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
          } else {
            var root = doc.documentElement;
            (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
          }
        } catch (e) { /* never break the game over a fullscreen refusal */ }
      });
      doc.addEventListener('fullscreenchange', updateIcon);
      doc.addEventListener('webkitfullscreenchange', updateIcon);
      updateIcon();
    })();
  </script>`;
}

export async function generateStandaloneHTML(project: VNProject, options?: StandaloneHtmlOptions): Promise<string> {
  const gameEngineCode = getMinimalGameEngine();
  // Never ship editor-only extensions (or plugins the user excluded) inside a playable game.
  const projectData = JSON.stringify(stripBuildExcludedPlugins(project));

  const vendor = await fetchVendorScripts();
  const hasInlinedReact = vendor.react.length > 0 && vendor.reactDom.length > 0;
  const hasInlinedTailwind = vendor.tailwind.length > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(project.title || 'Visual Novel')}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: var(--font-body);
      background: #000;
      overflow: hidden;
      overscroll-behavior: none;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
    }
    
    /* Allow text selection in input elements */
    input, textarea, [contenteditable="true"] {
      user-select: text;
      -webkit-user-select: text;
      -moz-user-select: text;
      -ms-user-select: text;
    }
    
    #game-container {
      width: 100vw;
      height: 100vh;
      position: relative;
      overflow: hidden;
    }
    
    #loading-screen {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      transition: opacity 0.5s;
    }
    
    #loading-screen.hidden {
      opacity: 0;
      pointer-events: none;
    }
    
    .spinner {
      width: 50px;
      height: 50px;
      border: 4px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .loading-text {
      color: white;
      margin-top: 20px;
      font-size: 18px;
    }
    
    .error-screen {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #1a1a1a;
      color: white;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      text-align: center;
    }
    
    .error-screen.visible {
      display: flex;
    }
    
    /* CSS Variables and Theme */
    :root {
      --bg-primary: #1a102c;
      --bg-secondary: #2a1a45;
      --bg-tertiary: #4D3273;
      --accent-pink: #ff00a5;
      --accent-cyan: #00f2ea;
      --accent-purple: #8a2be2;
      --accent-sky: #0ea5e9;
      --accent-blue: #3b82f6;
      --accent-yellow: #fbbf24;
      --accent-red: #ef4444;
      --accent-green: #10b981;
      --text-primary: #f0e6ff;
      --text-secondary: #c0b4d4;
      --text-tertiary: #94a3b8;
      --text-muted: #64748b;
      --slate-900: #0f172a;
      --slate-800: #1e293b;
      --slate-700: #334155;
      --slate-600: #475569;
      --slate-500: #64748b;
      --slate-400: #94a3b8;
      --font-heading: 'Poppins', sans-serif;
      --font-body: 'Poppins', sans-serif;
    }
    
    /* Animations */
    @keyframes shake {
      0%, 100% { transform: translate(0, 0); }
      25% { transform: translate(var(--shake-intensity-x, 5px), var(--shake-intensity-y, 5px)); }
      50% { transform: translate(calc(-1 * var(--shake-intensity-x, 5px)), calc(-1 * var(--shake-intensity-y, 5px))); }
      75% { transform: translate(var(--shake-intensity-x, 5px), calc(-1 * var(--shake-intensity-y, 5px))); }
    }
    .shake {
      animation: shake 0.2s ease-in-out infinite;
    }
    
    /* Transition Animations */
    @keyframes dissolve-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fade-out { from { opacity: 1; } to { opacity: 0; } }

    @keyframes iris-in {
      from { clip-path: circle(0%); }
      to { clip-path: circle(150%); }
    }

    @keyframes iris-out {
      from { clip-path: circle(150%); }
      to { clip-path: circle(0%); }
    }

    @keyframes wipe-right {
      from { clip-path: polygon(0 0, 0 0, 0 100%, 0% 100%); }
      to { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
    }

    @keyframes wipe-out-right {
      from { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
      to { clip-path: polygon(100% 0, 100% 0, 100% 100%, 100% 100%); }
    }
    
    @keyframes slide-in-left {
      from { transform: translateX(var(--slide-start, -100%)) translateY(var(--slide-start-y, 0%)); }
      to { transform: translateX(var(--slide-end, 0)) translateY(var(--slide-end-y, 0%)); }
    }

    @keyframes slide-in-right {
      from { transform: translateX(var(--slide-start, 100%)) translateY(var(--slide-start-y, 0%)); }
      to { transform: translateX(var(--slide-end, 0)) translateY(var(--slide-end-y, 0%)); }
    }

    @keyframes slide-out-left {
      from { transform: translateX(var(--slide-end, 0)) translateY(var(--slide-end-y, 0%)); }
      to { transform: translateX(var(--slide-start, -100%)) translateY(var(--slide-start-y, 0%)); }
    }

    @keyframes slide-out-right {
      from { transform: translateX(var(--slide-end, 0)) translateY(var(--slide-end-y, 0%)); }
      to { transform: translateX(var(--slide-start, 100%)) translateY(var(--slide-start-y, 0%)); }
    }

    @keyframes slide {
      from { 
        transform: translate3d(calc(-50% + var(--slide-start-px, var(--slide-start-x, 0%))), var(--slide-start-py, var(--slide-start-y, 0%)), 0); 
      }
      to { 
        transform: translate3d(calc(-50% + var(--slide-end-px, var(--slide-end-x, 0%))), var(--slide-end-py, var(--slide-end-y, 0%)), 0); 
      }
    }

    @keyframes flash-anim {
      0%, 100% { opacity: 0; }
      50% { opacity: 0.9; }
    }

    .transition-base {
      animation-duration: 1s;
      animation-fill-mode: forwards;
    }
    .transition-fast {
      animation-duration: 0.5s;
    }
    .transition-dissolve { animation-name: dissolve-in; }
    .transition-dissolve-out { animation-name: fade-out; }
    .transition-fade-out { animation-name: fade-out; }
    .transition-iris-in { animation-name: iris-in; }
    .transition-iris-out { animation-name: iris-out; }
    .transition-wipe-right { animation-name: wipe-right; }
    .transition-wipe-out-right { animation-name: wipe-out-right; }
    .transition-slide-in-right { animation-name: slide-in-right; }
    .transition-slide-in-left { animation-name: slide-in-left; }
    .transition-slide-out-left { animation-name: slide-out-left; }
    .transition-slide-out-right { animation-name: slide-out-right; }
    .transition-slide { animation-name: slide; }

    /* Character Visual Effects */

    /* Character glitch: bursty positional snaps. steps(1) on purpose — a glitch TELEPORTS, it
       never glides. Distance rides --char-glitch-px (set from the effect's intensity). */
    @keyframes vnCharGlitchJitter {
      0%   { transform: translate3d(0, 0, 0); }
      37%  { transform: translate3d(0, 0, 0); }
      40%  { transform: translate3d(calc(var(--char-glitch-px, 4px) * -1), 1px, 0) skewX(-1.5deg); }
      45%  { transform: translate3d(var(--char-glitch-px, 4px), -1px, 0) skewX(1deg); }
      50%  { transform: translate3d(0, 0, 0) skewX(0deg); }
      71%  { transform: translate3d(0, 0, 0); }
      74%  { transform: translate3d(calc(var(--char-glitch-px, 4px) * 0.7), 2px, 0); }
      79%  { transform: translate3d(0, 0, 0); }
      100% { transform: translate3d(0, 0, 0); }
    }
    @keyframes vnCharShake {
        0%, 100% { transform: translate(0, 0); }
        10% { transform: translate(calc(-1 * var(--char-shake-px, 2px)), calc(-1 * var(--char-shake-px, 2px))); }
        20% { transform: translate(var(--char-shake-px, 2px), 0); }
        30% { transform: translate(calc(-1 * var(--char-shake-px, 2px)), var(--char-shake-px, 2px)); }
        40% { transform: translate(var(--char-shake-px, 2px), calc(-1 * var(--char-shake-px, 2px))); }
        50% { transform: translate(calc(-1 * var(--char-shake-px, 2px)), 0); }
        60% { transform: translate(var(--char-shake-px, 2px), var(--char-shake-px, 2px)); }
        70% { transform: translate(0, calc(-1 * var(--char-shake-px, 2px))); }
        80% { transform: translate(calc(-1 * var(--char-shake-px, 2px)), var(--char-shake-px, 2px)); }
        90% { transform: translate(var(--char-shake-px, 2px), 0); }
    }
    @keyframes vnCharBounce {
        0%, 100% { transform: translateY(0); }
        30% { transform: translateY(var(--char-bounce-h, -8px)); }
        50% { transform: translateY(0); }
        70% { transform: translateY(calc(var(--char-bounce-h, -8px) / 2)); }
    }
    @keyframes vnCharFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(var(--char-float-h, -10px)); }
    }
    @keyframes vnCharPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(var(--char-pulse-scale, 1.05)); }
    }
    @keyframes vnCharGlow {
        0%, 100% { filter: drop-shadow(0 0 var(--char-glow-size, 8px) var(--char-glow-color, #FFFFFF)); }
        50% { filter: drop-shadow(0 0 var(--char-glow-size-max, 14px) var(--char-glow-color, #FFFFFF)); }
    }
    @keyframes vnCharBreathing {
        0%, 100% { transform: scaleY(1); }
        50% { transform: scaleY(var(--char-breathe-scale, 1.02)); }
    }
    @keyframes vnCharFlicker {
        0% { opacity: 1; }
        5% { opacity: 0.2; }
        10% { opacity: 1; }
        15% { opacity: 0.5; }
        20% { opacity: 1; }
        80% { opacity: 1; }
        85% { opacity: 0.3; }
        90% { opacity: 1; }
    }
    
    /* Range Input Styling */
    input[type=range] {
      -webkit-appearance: none;
      appearance: none;
      background: transparent;
      cursor: pointer;
      width: 100%;
    }
    input[type=range]:focus {
      outline: none;
    }
    /* Thumb - default styling */
    input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      margin-top: -6px;
      background-color: var(--slider-thumb-color, var(--accent-pink));
      height: 20px;
      width: 20px;
      border-radius: 99px;
    }
    input[type=range]::-moz-range-thumb {
      border: none;
      border-radius: 99px;
      background-color: var(--slider-thumb-color, var(--accent-pink));
      height: 20px;
      width: 20px;
    }
    /* Track - default styling */
    input[type=range]::-webkit-slider-runnable-track {
      background-color: var(--slider-track-color, var(--bg-tertiary));
      border-radius: 0.5rem;
      height: 8px;
    }
    input[type=range]::-moz-range-track {
      background-color: var(--slider-track-color, var(--bg-tertiary));
      border-radius: 0.5rem;
      height: 8px;
    }
    
    /* Custom slider with images */
    input[type=range].custom-slider::-webkit-slider-thumb {
      background-image: var(--slider-thumb-bg, none);
      background-size: cover;
      background-position: center;
      background-color: var(--slider-thumb-color, var(--accent-pink));
    }
    input[type=range].custom-slider::-moz-range-thumb {
      background-image: var(--slider-thumb-bg, none);
      background-size: cover;
      background-position: center;
      background-color: var(--slider-thumb-color, var(--accent-pink));
    }
    input[type=range].custom-slider::-webkit-slider-runnable-track {
      background-image: var(--slider-track-bg, none);
      background-size: cover;
      background-position: center;
      background-color: var(--slider-track-color, var(--bg-tertiary));
    }
    input[type=range].custom-slider::-moz-range-track {
      background-image: var(--slider-track-bg, none);
      background-size: cover;
      background-position: center;
      background-color: var(--slider-track-color, var(--bg-tertiary));
    }
  </style>
  
  <!-- Tailwind CSS (inlined for offline play) -->
  ${hasInlinedTailwind 
    ? `<script>${vendor.tailwind}</script>` 
    : `<script src="https://cdn.tailwindcss.com"></script>`}
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            slate: {
              400: 'var(--slate-400)',
              500: 'var(--slate-500)',
              600: 'var(--slate-600)',
              700: 'var(--slate-700)',
              800: 'var(--slate-800)',
              900: 'var(--slate-900)',
            }
          }
        }
      }
    }
  </script>
  
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat&family=Lato&family=Merriweather&family=Oswald&family=Pacifico&family=Playfair+Display&family=Poppins:ital,wght@0,400;0,700;1,400&family=Roboto&display=swap" rel="stylesheet">
</head>
<body>
  <div id="loading-screen">
    <div class="spinner"></div>
    <div class="loading-text">Loading Game...</div>
  </div>
  
  <div class="error-screen" id="error-screen">
    <h1>🎮 Unable to Start Game</h1>
    <p id="error-message" style="margin-top: 20px;"></p>
    <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; font-size: 16px; cursor: pointer;">
      Retry
    </button>
  </div>
  
  <div id="game-container"></div>
${options?.fullscreenButton ? buildFullscreenButtonHtml(options.fullscreenButton.corner) : ''}
  <!-- React (inlined for offline play) -->
  ${hasInlinedReact
    ? `<script>${vendor.react}</script>\n  <script>${vendor.reactDom}</script>`
    : `<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>\n  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>`}
  
  <!-- JSX Runtime and React DOM Client for the game engine -->
  <script>
    function __flourishRuntimeDebugEnabled() {
      try {
        return localStorage.getItem('flourish:runtimeDebug') === '1';
      } catch (e) {
        return false;
      }
    }
    function __flourishRuntimeDebugLog() {
      if (!__flourishRuntimeDebugEnabled()) return;
      console.log.apply(console, arguments);
    }

    // Verify React loaded
    if (typeof React === 'undefined') {
      alert('React failed to load! Check your internet connection.');
      throw new Error('React not loaded');
    }
    if (typeof ReactDOM === 'undefined') {
      alert('ReactDOM failed to load! Check your internet connection.');
      throw new Error('ReactDOM not loaded');
    }
    
    __flourishRuntimeDebugLog('✅ React version:', React.version);
    __flourishRuntimeDebugLog('✅ ReactDOM available');
    __flourishRuntimeDebugLog('✅ ReactDOM.createRoot:', typeof ReactDOM.createRoot);
    
    // Provide jsx-runtime for the game engine bundle
    // The new JSX transform expects jsx(type, props, key) where props includes children
    window.jsxRuntime = {
      jsx: (type, props, key) => {
        const { children, ...rest } = props || {};
        return React.createElement(type, { ...rest, key }, children);
      },
      jsxs: (type, props, key) => {
        const { children, ...rest } = props || {};
        return React.createElement(type, { ...rest, key }, children);
      },
      Fragment: React.Fragment
    };
    
    __flourishRuntimeDebugLog('✅ jsxRuntime configured');
  </script>

  <!-- Game Data -->
  <script>
    window.GAME_PROJECT = ${projectData};
    __flourishRuntimeDebugLog('✅ Game project data loaded:', window.GAME_PROJECT.title);
  </script>

  <!-- Game Engine -->
  <script>
    try {
      __flourishRuntimeDebugLog('Loading game engine bundle...');
      ${gameEngineCode}
      __flourishRuntimeDebugLog('Game engine script executed');
      __flourishRuntimeDebugLog('window.GameEngine:', window.GameEngine);
      __flourishRuntimeDebugLog('typeof window.GameEngine:', typeof window.GameEngine);
      if (window.GameEngine) {
        __flourishRuntimeDebugLog('GameEngine.mount:', window.GameEngine.mount);
        __flourishRuntimeDebugLog('typeof GameEngine.mount:', typeof window.GameEngine.mount);
      }
    } catch (err) {
      console.error('Error loading game engine:', err);
      document.getElementById('error-screen').classList.add('visible');
      document.getElementById('error-message').textContent = 'Engine load error: ' + err.message;
      throw err;
    }
  </script>

  <!-- Bootstrap -->
  <script>
    (function() {
      try {
        __flourishRuntimeDebugLog('Bootstrap: Starting game initialization...');
        __flourishRuntimeDebugLog('React available:', typeof React !== 'undefined');
        __flourishRuntimeDebugLog('ReactDOM available:', typeof ReactDOM !== 'undefined');
        __flourishRuntimeDebugLog('GameEngine (var):', typeof GameEngine !== 'undefined');
        __flourishRuntimeDebugLog('window.GameEngine:', typeof window.GameEngine !== 'undefined');
        __flourishRuntimeDebugLog('GAME_PROJECT available:', typeof window.GAME_PROJECT !== 'undefined');
        
        const container = document.getElementById('game-container');
        const loadingScreen = document.getElementById('loading-screen');
        
        if (typeof React === 'undefined') {
          throw new Error('React library failed to load from CDN. Check your internet connection.');
        }
        
        if (typeof ReactDOM === 'undefined') {
          throw new Error('ReactDOM library failed to load from CDN. Check your internet connection.');
        }
        
        // The bundle exports GameEngine as a module property
        // Check both window.GameEngine and window.GameEngine.GameEngine
        let gameEngine;
        if (window.GameEngine && window.GameEngine.GameEngine) {
          // It's the Module object, get the actual GameEngine from it
          gameEngine = window.GameEngine.GameEngine;
          __flourishRuntimeDebugLog('Found GameEngine in Module.GameEngine');
        } else if (window.GameEngine && typeof window.GameEngine.mount === 'function') {
          // It's the actual GameEngine object
          gameEngine = window.GameEngine;
          __flourishRuntimeDebugLog('Found GameEngine directly on window');
        } else {
          throw new Error('Game engine failed to load. The bundle may be corrupted.');
        }
        
        if (typeof gameEngine.mount !== 'function') {
          throw new Error('GameEngine.mount is not a function. Bundle may be incorrect.');
        }
        
        if (!window.GAME_PROJECT) {
          throw new Error('Game data is missing');
        }
        
        __flourishRuntimeDebugLog('All dependencies loaded successfully');
        __flourishRuntimeDebugLog('GameEngine:', gameEngine);
        __flourishRuntimeDebugLog('GameEngine.mount:', gameEngine.mount);
        __flourishRuntimeDebugLog('Mounting game engine...');

        // Load project-level custom fonts before mount so UI/menu text renders correctly.
        (async function() {
          try {
            const fonts = (window.GAME_PROJECT && window.GAME_PROJECT.fonts) ? window.GAME_PROJECT.fonts : {};
            const entries = Object.values(fonts);
            for (const f of entries) {
              if (!f || !f.fontUrl || !f.fontFamily) continue;
              try {
                const fontFace = new FontFace(f.fontFamily, 'url(' + f.fontUrl + ')');
                await fontFace.load();
                document.fonts.add(fontFace);
              } catch (e) {
                console.warn('Failed to load project font:', f && (f.name || f.fontFamily), e);
              }
            }
          } catch (e) {
            console.warn('Project font loading failed:', e);
          }

          // Initialize game using the resolved gameEngine
          gameEngine.mount(container, window.GAME_PROJECT);
        })();
        
        __flourishRuntimeDebugLog('Game mounted successfully');
        
        // Hide loading screen
        setTimeout(() => {
          loadingScreen.classList.add('hidden');
        }, 500);
        
      } catch (error) {
        console.error('Game initialization error:', error);
        document.getElementById('error-screen').classList.add('visible');
        document.getElementById('error-message').textContent = error.message;
        document.getElementById('loading-screen').classList.add('hidden');
      }
    })();
  </script>
</body>
</html>`;
}

/**
 * Returns the embedded game engine code
 * This uses the pre-built standalone game engine bundle
 */
function getMinimalGameEngine(): string {
  // Load the pre-built game engine (generated by npm run build:engine)
  return getGameEngineCode();
}

/**
 * Collects all asset URLs from the project
 * Returns a map of filename -> data URL
 */
/**
 * Drop library assets nothing in the game references — unused uploads used to ship in EVERY
 * build (a project with abandoned test images/audio carried all of them forever).
 *
 * CONSERVATIVE by design: an asset is kept when its id appears ANYWHERE in the project JSON
 * outside the four asset libraries themselves (commands, screens, characters, items, UI chrome,
 * plugin storage, …all of it). Only assets whose id appears in no other corner of the project
 * are pruned — when in doubt, ship it. Operates on a shallow clone; never touches the caller's
 * project. Characters and fonts are never pruned (structural, small, and name-referenced).
 */
export function pruneUnusedAssets(project: VNProject): { project: VNProject; pruned: number; prunedNames: string[] } {
  const collections = ['backgrounds', 'images', 'audio', 'videos'] as const;
  const skeleton: any = { ...project };
  for (const c of collections) skeleton[c] = {};
  const corpus = JSON.stringify(skeleton);

  const out: any = { ...project };
  let pruned = 0;
  const prunedNames: string[] = [];
  for (const c of collections) {
    const src = (project as any)[c] || {};
    const kept: Record<string, unknown> = {};
    for (const [id, asset] of Object.entries(src)) {
      if (corpus.includes(`"${id}"`)) {
        kept[id] = asset;
      } else {
        pruned++;
        prunedNames.push((asset as any)?.name || id);
      }
    }
    out[c] = kept;
  }
  return { project: out as VNProject, pruned, prunedNames };
}

export function collectAllAssets(project: VNProject): Record<string, string> {
  const assets: Record<string, string> = {};
  let assetCounter = 0;

  const addAsset = (url: string | undefined, prefix: string) => {
    if (!url || !url.startsWith('data:')) return;
    
    const extension = getExtensionFromDataURL(url);
    const filename = `${prefix}_${++assetCounter}${extension}`;
    assets[filename] = url;
  };

  // Collect backgrounds
  Object.values(project.backgrounds || {}).forEach(bg => {
    addAsset(bg.imageUrl, 'bg');
    addAsset(bg.videoUrl, 'bg');
  });

  // Collect images
  Object.values(project.images || {}).forEach(img => {
    addAsset(img.imageUrl, 'img');
    addAsset(img.videoUrl, 'img');
  });

  // Collect character sprites
  Object.values(project.characters || {}).forEach(char => {
    addAsset(char.baseImageUrl, `char_${char.id}`);
    addAsset(char.baseVideoUrl, `char_${char.id}`);
    addAsset(char.fontUrl, `char_${char.id}_font`);
    
    // Collect layer assets (incl. Character Poses per-pose art)
    Object.values(char.layers || {}).forEach(layer => {
      Object.values(layer.assets || {}).forEach(asset => {
        addAsset(asset.imageUrl, `char_${char.id}_layer`);
        addAsset(asset.videoUrl, `char_${char.id}_layer`);
        Object.values((asset as any).poseArt || {}).forEach((art: any) => {
          addAsset(art.imageUrl, `char_${char.id}_pose`);
          addAsset(art.videoUrl, `char_${char.id}_pose`);
        });
      });
    });
    // Character Poses: pose base sprites
    Object.values((char as any).poses || {}).forEach((pose: any) => {
      addAsset(pose.baseImageUrl, `char_${char.id}_pose`);
      addAsset(pose.baseVideoUrl, `char_${char.id}_pose`);
    });
  });

  // Collect project font library
  Object.values((project as any).fonts || {}).forEach((font: any) => {
    addAsset(font?.fontUrl, `font_${font?.id || 'project'}`);
  });

  // Collect audio
  Object.values(project.audio || {}).forEach(audio => {
    addAsset(audio.audioUrl, 'audio');
  });

  // Collect videos
  Object.values(project.videos || {}).forEach(video => {
    addAsset(video.videoUrl, 'video');
  });

  // Collect dialogue box and choice button assets
  if (project.ui.dialogueBoxImage) {
    const assetId = project.ui.dialogueBoxImage.id;
    if (project.ui.dialogueBoxImage.type === 'image') {
      const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
      if (bg) addAsset(bg.imageUrl || bg.videoUrl, 'ui');
    } else if (project.ui.dialogueBoxImage.type === 'video') {
      const video = project.videos?.[assetId];
      if (video) addAsset(video.videoUrl, 'ui');
    }
  }
  
  if (project.ui.choiceButtonImage) {
    const assetId = project.ui.choiceButtonImage.id;
    if (project.ui.choiceButtonImage.type === 'image') {
      const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
      if (bg) addAsset(bg.imageUrl || bg.videoUrl, 'ui');
    } else if (project.ui.choiceButtonImage.type === 'video') {
      const video = project.videos?.[assetId];
      if (video) addAsset(video.videoUrl, 'ui');
    }
  }

  // Collect dialogue box and choice button border image assets
  if (project.ui.dialogueBoxBorderImage) {
    const assetId = project.ui.dialogueBoxBorderImage.id;
    const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
    if (bg) addAsset(bg.imageUrl, 'ui');
  }

  if (project.ui.choiceButtonBorderImage) {
    const assetId = project.ui.choiceButtonBorderImage.id;
    const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
    if (bg) addAsset(bg.imageUrl, 'ui');
  }

  // Collect input box border image
  if (project.ui.inputBoxBorderImage) {
    const assetId = project.ui.inputBoxBorderImage.id;
    const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
    if (bg) addAsset(bg.imageUrl, 'ui');
  }

  // Collect choice hover image
  if (project.ui.choiceHoverImage) {
    const assetId = project.ui.choiceHoverImage.id;
    const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
    if (bg) addAsset(bg.imageUrl, 'ui');
  }

  // Collect namebox image
  if (project.ui.nameboxImage) {
    const assetId = project.ui.nameboxImage.id;
    const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
    if (bg) addAsset(bg.imageUrl, 'ui');
  }

  // Collect custom mouse-pointer images (Character Poses export-gap lesson: every new
  // art field must be added to BOTH typed walks or it ships broken in built games).
  const cursorSlots: any = (project.ui as any).cursors;
  for (const slot of [cursorSlots?.normal, cursorSlots?.hand, cursorSlots?.drag]) {
    const assetId = slot?.image?.id;
    if (!assetId) continue;
    const bg = project.images?.[assetId] || project.backgrounds?.[assetId];
    if (bg) addAsset((bg as any).imageUrl, 'ui');
  }

  // Collect input box image
  if (project.ui.inputBoxImage) {
    const assetId = project.ui.inputBoxImage.id;
    const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
    if (bg) addAsset(bg.imageUrl, 'ui');
  }

  // Collect confirm dialog image assets
  const cd = project.ui.confirmDialogs;
  if (cd) {
    const cdImageFields: (keyof typeof cd)[] = [
      'backgroundImage', 'borderImage',
      'confirmButtonImage', 'cancelButtonImage',
      'confirmHoverImage', 'cancelHoverImage',
    ];
    for (const field of cdImageFields) {
      const asset = cd[field] as { id: string } | null | undefined;
      if (asset?.id) {
        const bg = project.backgrounds?.[asset.id] || project.images?.[asset.id];
        if (bg) addAsset((bg as any).imageUrl, 'ui');
      }
    }
  }

  // Collect UI screens and elements
  Object.values(project.uiScreens || {}).forEach(screen => {
    // Collect screen-level background
    if (screen.background && (screen.background.type === 'image' || screen.background.type === 'video') && screen.background.assetId) {
      if (screen.background.type === 'image') {
        const bg = project.backgrounds?.[screen.background.assetId] || project.images?.[screen.background.assetId];
        if (bg) addAsset(bg.imageUrl, 'ui');
      } else {
        const vid = project.videos?.[screen.background.assetId];
        if (vid) addAsset(vid.videoUrl, 'ui');
      }
    }
    // Collect screen-level music
    if (screen.music?.audioId) {
      const audio = project.audio?.[screen.music.audioId];
      if (audio) addAsset(audio.audioUrl, 'audio');
    }
    // Collect screen-level ambient noise
    if (screen.ambientNoise?.audioId) {
      const audio = project.audio?.[screen.ambientNoise.audioId];
      if (audio) addAsset(audio.audioUrl, 'audio');
    }
    Object.values(screen.elements || {}).forEach(element => {
      // Check for image/video assets in UI elements
      if ('image' in element && element.image) {
        // UIButtonElement or UIImageElement with asset
        const assetId = element.image.id;
        if (element.image.type === 'image') {
          const imageAsset = project.images?.[assetId];
          if (imageAsset) {
            addAsset(imageAsset.imageUrl, 'ui');
            addAsset(imageAsset.videoUrl, 'ui');
          }
        } else if (element.image.type === 'video') {
          const videoAsset = project.videos?.[assetId];
          if (videoAsset) {
            addAsset(videoAsset.videoUrl, 'ui');
          }
        }
      }
      // UIImageElement.background (image/video from assets or solid color)
      if ('background' in element && element.background && typeof element.background === 'object' && 'assetId' in element.background && element.background.assetId) {
        if (element.background.type === 'image') {
          const bg = project.backgrounds?.[element.background.assetId] || project.images?.[element.background.assetId];
          if (bg) addAsset(bg.imageUrl, 'ui');
        } else if (element.background.type === 'video') {
          const vid = project.videos?.[element.background.assetId];
          if (vid) addAsset(vid.videoUrl, 'ui');
        }
      }
      if ('hoverImage' in element && element.hoverImage) {
        const assetId = element.hoverImage.id;
        if (element.hoverImage.type === 'image') {
          const imageAsset = project.images?.[assetId];
          if (imageAsset) {
            addAsset(imageAsset.imageUrl, 'ui');
            addAsset(imageAsset.videoUrl, 'ui');
          }
        }
      }
      // Slider images
      if ('thumbImage' in element && element.thumbImage) {
        const assetId = element.thumbImage.id;
        if (element.thumbImage.type === 'image') {
          const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
          if (bg) addAsset(bg.imageUrl || bg.videoUrl, 'ui');
        } else if (element.thumbImage.type === 'video') {
          const video = project.videos?.[assetId];
          if (video) addAsset(video.videoUrl, 'ui');
        }
      }
      if ('trackImage' in element && element.trackImage) {
        const assetId = element.trackImage.id;
        if (element.trackImage.type === 'image') {
          const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
          if (bg) addAsset(bg.imageUrl || bg.videoUrl, 'ui');
        } else if (element.trackImage.type === 'video') {
          const video = project.videos?.[assetId];
          if (video) addAsset(video.videoUrl, 'ui');
        }
      }
      // Toggle checkbox images
      if ('checkedImage' in element && element.checkedImage) {
        const assetId = element.checkedImage.id;
        if (element.checkedImage.type === 'image') {
          const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
          if (bg) addAsset(bg.imageUrl || bg.videoUrl, 'ui');
        } else if (element.checkedImage.type === 'video') {
          const video = project.videos?.[assetId];
          if (video) addAsset(video.videoUrl, 'ui');
        }
      }
      if ('uncheckedImage' in element && element.uncheckedImage) {
        const assetId = element.uncheckedImage.id;
        if (element.uncheckedImage.type === 'image') {
          const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
          if (bg) addAsset(bg.imageUrl || bg.videoUrl, 'ui');
        } else if (element.uncheckedImage.type === 'video') {
          const video = project.videos?.[assetId];
          if (video) addAsset(video.videoUrl, 'ui');
        }
      }
      // Meter art (fill + track)
      (['fillImage', 'backgroundImage'] as const).forEach(key => {
        const asset = (element as any)[key];
        if (!asset?.id) return;
        if (asset.type === 'image') {
          const img = project.backgrounds?.[asset.id] || project.images?.[asset.id];
          if (img) addAsset(img.imageUrl || img.videoUrl, 'ui');
        } else if (asset.type === 'video') {
          const video = project.videos?.[asset.id];
          if (video) addAsset(video.videoUrl, 'ui');
        }
      });
    });

    // Legacy hot zone asset collection — post-Phase-3 these fields are migrated
    // into `screen.elements` and the standard walk below picks them up. These
    // branches survive only for projects that haven't been loaded through the
    // migration yet (e.g. raw .flourish files passed straight to the bundler).
    Object.values((screen as any).hotZoneElements || {}).forEach((el: any) => {
      if (el.imageId) {
        const img = project.images?.[el.imageId];
        if (img) addAsset(img.imageUrl, 'ui');
      }
      if (el.videoId) {
        const vid = project.videos?.[el.videoId];
        if (vid) addAsset(vid.videoUrl, 'ui');
      }
      if (el.clickSoundId) {
        const audio = project.audio?.[el.clickSoundId];
        if (audio) addAsset(audio.audioUrl, 'audio');
      }
      if (el.hoverSoundId) {
        const audio = project.audio?.[el.hoverSoundId];
        if (audio) addAsset(audio.audioUrl, 'audio');
      }
    });
    Object.values((screen as any).hotSpots || {}).forEach((spot: any) => {
      if (spot.imageId) {
        const img = project.images?.[spot.imageId];
        if (img) addAsset(img.imageUrl, 'ui');
      }
    });

    // Post-unification: walk `screen.elements` for the asset references that
    // used to live on `hotZoneElements` / `hotSpots`. UIdraggableImageElementElement gets
    // its image / hoverImage / per-region actions; UIHotSpotElement gets its
    // actions; any element with clickSoundId / hoverSoundId gets those.
    Object.values(screen.elements || {}).forEach((element: any) => {
      if (element.clickSoundId) {
        const audio = project.audio?.[element.clickSoundId];
        if (audio) addAsset(audio.audioUrl, 'audio');
      }
      if (element.hoverSoundId) {
        const audio = project.audio?.[element.hoverSoundId];
        if (audio) addAsset(audio.audioUrl, 'audio');
      }
      if (element.type === 'draggableImageElement') {
        if (element.image?.id) {
          const img = project.images?.[element.image.id];
          if (img) addAsset(img.imageUrl, 'ui');
        }
        if (element.hoverImage?.id) {
          const img = project.images?.[element.hoverImage.id];
          if (img) addAsset(img.imageUrl, 'ui');
        }
      }
    });

    // Collect ChangeImage action assets from all action arrays
    const collectActionAssets = (actions: any[]) => {
      for (const action of actions) {
        if (action.type === UIActionType.ChangeImage && action.newImageId) {
          const img = project.images?.[action.newImageId];
          if (img) addAsset(img.imageUrl, 'ui');
        }
      }
    };
    // Element actions (buttons, sliders, toggles, dropdowns, checkboxes)
    Object.values(screen.elements || {}).forEach((element: any) => {
      if (element.action) collectActionAssets([element.action]);
      if (Array.isArray(element.actions)) collectActionAssets(element.actions);
    });
    // Legacy hot zone action collection (see note above). Unified actions on
    // the migrated typed elements (HotSpot, draggableImageElement, draggable images) are
    // already picked up by the standard `screen.elements` walk a few lines up.
    Object.values((screen as any).hotZoneElements || {}).forEach((el: any) => {
      if (Array.isArray(el.actions)) collectActionAssets(el.actions);
    });
    Object.values((screen as any).hotSpots || {}).forEach((spot: any) => {
      if (Array.isArray(spot.actions)) collectActionAssets(spot.actions);
    });
    // Image-map region actions (for migrated UIdraggableImageElementElement entries)
    Object.values(screen.elements || {}).forEach((element: any) => {
      if (element.type === 'draggableImageElement' && Array.isArray(element.draggableImageElementRegions)) {
        for (const region of element.draggableImageElementRegions) {
          if (Array.isArray(region.actions)) collectActionAssets(region.actions);
        }
      }
    });
    // Win condition actions
    if (screen.winCondition?.actions) {
      collectActionAssets(screen.winCondition.actions);
    }
  });

  return assets;
}

/**
 * Walks the project tree once and returns a copy with every embedded data URL
 * replaced by a relative path into the `assets/` folder, using filenames that
 * match what `collectAllAssets` produced.
 *
 * Why this matters: previously the export pipeline inlined the FULL project
 * (including every data URL) into `window.GAME_PROJECT = ...` AND wrote the
 * same data out to disk in the `assets/` folder. The HTML therefore ended up
 * containing roughly all of the project's binary asset weight, doubling the
 * download/parse cost and — for large projects — bloating the HTML to the
 * point that browsers and Electron took a long time (or sometimes failed) to
 * load it. This helper produces a "lean" copy of the project to inline; assets
 * are loaded lazily from disk on demand by the runtime's standard image /
 * video / audio resolvers, which just feed `imageUrl` straight into <img src>.
 */
export function buildLeanProject(project: VNProject, assetMap: Record<string, string>): VNProject {
  // Build the reverse lookup: dataURL → "assets/<filename>"
  const urlToPath = new Map<string, string>();
  for (const [filename, dataUrl] of Object.entries(assetMap)) {
    if (dataUrl) urlToPath.set(dataUrl, `assets/${filename}`);
  }
  if (urlToPath.size === 0) return project;

  const visit = (value: any): any => {
    if (typeof value === 'string') {
      // Hot path: only check strings that look like data URLs
      if (value.length > 32 && value.startsWith('data:')) {
        const replaced = urlToPath.get(value);
        return replaced ?? value;
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(visit);
    }
    if (value && typeof value === 'object') {
      const out: Record<string, any> = {};
      for (const k of Object.keys(value)) {
        out[k] = visit(value[k]);
      }
      return out;
    }
    return value;
  };

  return visit(project) as VNProject;
}

/**
 * Converts a data URL to a Blob
 */
export function dataURLToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  
  return new Blob([u8arr], { type: mime });
}

/**
 * Gets file extension from data URL
 */
function getExtensionFromDataURL(dataUrl: string): string {
  const mimeMatch = dataUrl.match(/data:(.*?);/);
  if (!mimeMatch) return '.bin';
  
  const mime = mimeMatch[1];
  const extensionMap: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav'
  };
  
  return extensionMap[mime] || '.bin';
}

/**
 * Generates a README file for players
 */
function generatePlayerReadme(project: VNProject): string {
  return `${project.title || 'Visual Novel Game'}

HOW TO PLAY:
============

ONLINE:
1. Upload the entire folder to itch.io, Netlify, or any web host
2. Make sure index.html and the assets/ folder are together
3. Share the URL with players!

OFFLINE:
1. Open index.html in any modern web browser
2. Chrome, Firefox, Safari, or Edge recommended
3. No installation needed!

CONTROLS:
=========
- Click or press SPACE to advance dialogue
- Use UI buttons for choices and navigation
- Press F11 for fullscreen (recommended)

REQUIREMENTS:
=============
- Modern web browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- JavaScript enabled
- Internet connection (first load only, for React library)

TROUBLESHOOTING:
================
- If the game doesn't load, make sure all files are in the same folder
- Check that your browser allows JavaScript
- Try a different browser if issues persist

---
Created with Flourish Visual Novel Engine
Visit https://github.com/your-repo for more information
`;
}

/**
 * Escapes HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Downloads a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Estimates the size of the final build in MB
 */
export function estimateBuildSize(project: VNProject): number {
  const projectJson = JSON.stringify(project);
  const jsonSize = new Blob([projectJson]).size;
  
  // Estimate asset sizes
  let assetSize = 0;
  const assets = collectAllAssets(project);
  Object.values(assets).forEach(dataUrl => {
    // Base64 is ~33% larger than binary, so divide by 1.33
    const base64Length = dataUrl.split(',')[1]?.length || 0;
    assetSize += base64Length / 1.33;
  });
  
  // Add ~500KB for game engine code
  const engineSize = 500 * 1024;
  
  const totalBytes = jsonSize + assetSize + engineSize;
  const totalMB = totalBytes / (1024 * 1024);
  
  return Math.ceil(totalMB * 10) / 10; // Round to 1 decimal
}
