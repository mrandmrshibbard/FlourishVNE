#!/usr/bin/env node
/**
 * sync-android-www.cjs
 *
 * Copies the built editor web app (dist/) into the Android wrapper's
 * assets/www and injects the native bridge as the first script in <head>.
 *
 * The bridge maps the native @JavascriptInterface objects onto the same
 * web-facing APIs the editor already uses:
 *   AndroidStorage → window.electronAPI.storage  (engine saves, desktop-style)
 *   FlourishFiles  → window.FlourishMobile        (app-private .flourish files)
 *   AndroidApp     → window.electronAPI.quitApp
 *
 * Run after `vite build`:  npm run android:sync   (or npm run android:build)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const WWW = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'www');

const BRIDGE = `<script>(function(){
  // ── key/value storage → window.electronAPI.storage (engine test-play saves) ──
  if (typeof AndroidStorage !== 'undefined') {
    window.electronAPI = window.electronAPI || {};
    window.electronAPI.isAndroid = true;
    window.electronAPI.storage = {
      getItem: function(k){ return new Promise(function(res){ try { var s = AndroidStorage.getItem(k); res(s == null ? null : JSON.parse(s)); } catch(e){ res(null); } }); },
      setItem: function(k,v){ return new Promise(function(res){ try { AndroidStorage.setItem(k, JSON.stringify(v)); } catch(e){} res(); }); },
      removeItem: function(k){ return new Promise(function(res){ try { AndroidStorage.removeItem(k); } catch(e){} res(); }); },
      clear: function(){ return new Promise(function(res){ try { AndroidStorage.clear(); } catch(e){} res(); }); },
      keys: function(){ return new Promise(function(res){ try { res(JSON.parse(AndroidStorage.keys() || '[]')); } catch(e){ res([]); } }); }
    };
    window.electronAPI.quitApp = function(){ try { AndroidApp.quit(); } catch(e){} };
  }
  // ── app-private .flourish project files → window.FlourishMobile ──
  if (typeof FlourishFiles !== 'undefined') {
    window.FlourishMobile = {
      native: true,
      list: function(){ return new Promise(function(res){ try { res(JSON.parse(FlourishFiles.list() || '[]')); } catch(e){ res([]); } }); },
      read: function(name){ return new Promise(function(res){ try { res(FlourishFiles.read(name)); } catch(e){ res(null); } }); },
      write: function(name, base64){ return new Promise(function(res){ try { res(FlourishFiles.write(name, base64)); } catch(e){ res(null); } }); },
      remove: function(name){ return new Promise(function(res){ try { res(FlourishFiles.delete(name)); } catch(e){ res(false); } }); },
      share: function(name){ try { FlourishFiles.share(name); } catch(e){} }
    };
  }
})();</script>`;

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function main() {
  if (!fs.existsSync(DIST) || !fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('[android:sync] dist/ not found. Run `npm run build` (or build:full) first.');
    process.exit(1);
  }
  // Fresh www
  fs.rmSync(WWW, { recursive: true, force: true });
  copyDir(DIST, WWW);

  // Inject the bridge as the first thing in <head>.
  const indexPath = path.join(WWW, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf-8');
  if (html.includes('<head>')) html = html.replace('<head>', '<head>\n' + BRIDGE);
  else if (/<head[^>]*>/.test(html)) html = html.replace(/<head([^>]*)>/, '<head$1>\n' + BRIDGE);
  else html = BRIDGE + html;
  fs.writeFileSync(indexPath, html, 'utf-8');

  console.log('[android:sync] Synced dist → ' + path.relative(ROOT, WWW) + ' and injected native bridge.');
}

main();
