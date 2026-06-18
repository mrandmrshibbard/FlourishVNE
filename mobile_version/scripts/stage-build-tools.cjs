#!/usr/bin/env node
/**
 * Stage the bundled desktop-build toolchain into <repo>/build-tools.
 *
 * This is what makes "Build Desktop Game" work on an end user's machine with no
 * Node, no npm, and no internet. It is run once before packaging Flourish (and
 * is wired into the build via `npm run stage:build-tools`). The resulting
 * build-tools/ folder is shipped inside the app as electron-builder
 * extraResources (-> resources/build-tools).
 *
 * It produces:
 *   build-tools/
 *     node(.exe)                – copy of the Node runtime running this script
 *     package.json              – pins electron + electron-builder
 *     node_modules/             – electron + electron-builder, installed
 *     cache/electron/           – pre-seeded Electron binary (offline)
 *     cache/electron-builder/   – pre-seeded NSIS / winCodeSign tools (offline)
 *
 * The final step runs a throwaway electron-builder build of a tiny app, which
 * (a) seeds the NSIS/winCodeSign/Electron caches and (b) proves the toolchain
 * actually produces an executable.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ELECTRON_VERSION = '28.3.3';
const ELECTRON_BUILDER_VERSION = '24.13.3';

const repoRoot = path.resolve(__dirname, '..');
const toolsDir = path.join(repoRoot, 'build-tools');
const nodeModulesDir = path.join(toolsDir, 'node_modules');
const cacheDir = path.join(toolsDir, 'cache');
const electronCache = path.join(cacheDir, 'electron');
const builderCache = path.join(cacheDir, 'electron-builder');

const isWin = process.platform === 'win32';
const log = (...a) => console.log('[stage]', ...a);

function run(cmd, args, opts = {}) {
  log('>', cmd, args.join(' '));
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`${cmd} exited with code ${res.status}`);
}

function main() {
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.mkdirSync(electronCache, { recursive: true });
  fs.mkdirSync(builderCache, { recursive: true });

  // 1. Copy the Node runtime that is running this script.
  const nodeName = isWin ? 'node.exe' : 'node';
  const destNode = path.join(toolsDir, nodeName);
  if (!fs.existsSync(destNode)) {
    log('Copying Node runtime from', process.execPath);
    fs.copyFileSync(process.execPath, destNode);
  } else {
    log('Node runtime already present');
  }

  // 2. Write the toolchain package.json.
  fs.writeFileSync(
    path.join(toolsDir, 'package.json'),
    JSON.stringify(
      {
        name: 'flourish-build-tools',
        private: true,
        version: '1.0.0',
        description: 'Bundled desktop-build toolchain for  (do not edit).',
        dependencies: {
          electron: ELECTRON_VERSION,
          'electron-builder': ELECTRON_BUILDER_VERSION,
        },
      },
      null,
      2
    )
  );

  // 3. Install electron + electron-builder into build-tools/node_modules,
  //    seeding the Electron binary into our bundled cache.
  // Run npm via its CLI script with the current Node binary — avoids the
  // Windows "cannot spawn .cmd without a shell" issue and handles spaced paths.
  const npmCliJs = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  // ELECTRON_SKIP_BINARY_DOWNLOAD: don't unpack a 250MB Electron into
  // node_modules/electron/dist — electron-builder builds from the cached zip
  // (seeded below), so dist is dead weight in the shipped bundle.
  const installEnv = {
    ...process.env,
    ELECTRON_CACHE: electronCache,
    electron_config_cache: electronCache,
    ELECTRON_SKIP_BINARY_DOWNLOAD: '1',
  };
  if (!fs.existsSync(path.join(nodeModulesDir, 'electron-builder'))) {
    log('Installing electron + electron-builder...');
    run(process.execPath, [npmCliJs, 'install', '--no-audit', '--no-fund', '--omit=dev'], { cwd: toolsDir, env: installEnv });
  } else {
    log('node_modules already present — skipping npm install');
  }

  // Drop the redundant unpacked Electron runtime (~250MB) if a previous install
  // created it. The Electron binary used for builds lives in cache/electron.
  const electronDist = path.join(nodeModulesDir, 'electron', 'dist');
  if (fs.existsSync(electronDist)) {
    log('Removing redundant node_modules/electron/dist (~250MB)...');
    fs.rmSync(electronDist, { recursive: true, force: true });
  }

  // 4. Seed the Electron / NSIS / winCodeSign caches and verify the toolchain by
  //    building a tiny throwaway app with the BUNDLED node + electron-builder.
  //    Skipped on repeat runs once everything is cached (pass --verify to force).
  const forceVerify = process.argv.includes('--verify');
  if (!forceVerify && cachesSeeded()) {
    log('Offline caches already seeded — skipping verification build.');
  } else {
    seedAndVerify();
  }

  log('DONE. build-tools is staged at', toolsDir);
}

/** True when the Electron binary, NSIS, and winCodeSign caches are all present. */
function cachesSeeded() {
  const wcs = path.join(builderCache, 'winCodeSign');
  const hasWcs = fs.existsSync(wcs) && fs.readdirSync(wcs).some((n) => fs.existsSync(path.join(wcs, n, 'rcedit-x64.exe')));
  const nsis = path.join(builderCache, 'nsis');
  const hasNsis = fs.existsSync(nsis) && fs.readdirSync(nsis).length > 0;
  let hasElectron = false;
  if (fs.existsSync(electronCache)) {
    const stack = [electronCache];
    while (stack.length && !hasElectron) {
      const dir = stack.pop();
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) stack.push(path.join(dir, e.name));
        else if (e.name.toLowerCase().endsWith('.zip')) { hasElectron = true; break; }
      }
    }
  }
  return hasWcs && hasNsis && hasElectron;
}

function seedAndVerify() {
  const sample = fs.mkdtempSync(path.join(os.tmpdir(), 'flourish-stage-verify-'));
  log('Verification build in', sample);

  fs.writeFileSync(
    path.join(sample, 'package.json'),
    JSON.stringify(
      {
        name: 'stage-check',
        productName: 'StageCheck',
        version: '1.0.0',
        main: 'main.js',
        build: {
          appId: 'com.flourish.stagecheck',
          electronVersion: ELECTRON_VERSION,
          npmRebuild: false,
          directories: { output: 'dist' },
          files: ['main.js', 'index.html'],
          // Build BOTH outputs so the NSIS toolchain is downloaded + cached too.
          win: { target: ['portable', 'nsis'] },
          nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true },
        },
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(sample, 'main.js'),
    "const{app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({show:false});w.loadFile('index.html');setTimeout(()=>app.quit(),100);});"
  );
  fs.writeFileSync(path.join(sample, 'index.html'), '<!doctype html><title>ok</title>ok');

  // Link the bundled deps in (junction on Windows, symlink elsewhere).
  const nmLink = path.join(sample, 'node_modules');
  try {
    fs.symlinkSync(nodeModulesDir, nmLink, isWin ? 'junction' : 'dir');
  } catch (e) {
    log('symlink failed, copying node_modules instead:', e.message);
    fs.cpSync(nodeModulesDir, nmLink, { recursive: true });
  }

  const bundledNode = path.join(toolsDir, isWin ? 'node.exe' : 'node');
  const ebCli = path.join(nmLink, 'electron-builder', 'out', 'cli', 'cli.js');
  const platformFlag = isWin ? '--win' : process.platform === 'darwin' ? '--mac' : '--linux';
  const env = {
    ...process.env,
    ELECTRON_CACHE: electronCache,
    electron_config_cache: electronCache,
    ELECTRON_BUILDER_CACHE: builderCache,
    CI: 'true',
  };

  // electron-builder extracts winCodeSign on Windows, which contains macOS
  // symlinks that can't be created without elevated privilege. The real files
  // still extract — only the rename-to-canonical step is skipped. We repair the
  // cache so the canonical folder exists, then (re)try. Shipping the repaired
  // cache means end users never extract it and never hit this at all.
  let built = false;
  let lastErr;
  for (let attempt = 1; attempt <= 3 && !built; attempt++) {
    try {
      run(bundledNode, [ebCli, platformFlag], { cwd: sample, env });
      built = true;
    } catch (e) {
      lastErr = e;
      log(`Build attempt ${attempt} failed; repairing winCodeSign cache and retrying...`);
      repairWinCodeSign();
    }
  }

  const distFiles = fs.existsSync(path.join(sample, 'dist')) ? fs.readdirSync(path.join(sample, 'dist')) : [];
  // clean up link first so rmSync doesn't recurse into node_modules
  try { const s = fs.lstatSync(nmLink); if (s.isSymbolicLink()) fs.unlinkSync(nmLink); } catch {}
  fs.rmSync(sample, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });

  if (!built) throw lastErr;

  const portable = distFiles.find((f) => f.toLowerCase().endsWith('.exe') && !/setup/i.test(f));
  const installer = distFiles.find((f) => /setup/i.test(f) && f.toLowerCase().endsWith('.exe'));
  if (!portable && !installer) {
    throw new Error('Verification build produced no .exe. dist contained: ' + distFiles.join(', '));
  }
  log('Verification build OK — portable:', portable || '(none)', '| installer:', installer || '(none)');
}

/**
 * Synthesize the canonical winCodeSign-<ver> cache folder from a completed-but-
 * not-renamed extraction (the macOS .dylib symlinks fail to create on Windows,
 * which aborts electron-builder's rename step, but every real file is present).
 */
function repairWinCodeSign() {
  const wcs = path.join(builderCache, 'winCodeSign');
  if (!fs.existsSync(wcs)) return;
  const entries = fs.readdirSync(wcs);
  const canonical = entries.find((n) => /^winCodeSign-/.test(n));
  const hasTools = (n) => fs.existsSync(path.join(wcs, n, 'rcedit-x64.exe'));
  if (canonical && hasTools(canonical)) return; // already good

  const temp = entries.find((n) => hasTools(n));
  if (!temp) return;
  const dest = path.join(wcs, 'winCodeSign-2.6.0');
  if (!fs.existsSync(dest)) {
    log('  repairing winCodeSign cache from extraction', temp);
    fs.cpSync(path.join(wcs, temp), dest, { recursive: true });
  }
  // Remove leftover numeric temp extractions and archives to keep the cache lean.
  for (const n of fs.readdirSync(wcs)) {
    if (n === 'winCodeSign-2.6.0') continue;
    try { fs.rmSync(path.join(wcs, n), { recursive: true, force: true }); } catch {}
  }
}

try {
  main();
} catch (err) {
  console.error('[stage] FAILED:', err && err.message ? err.message : err);
  process.exit(1);
}
