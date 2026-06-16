/**
 * Android build toolchain manager (first-run download).
 *
 * Unlike the desktop build — whose toolchain (Node + electron-builder + offline
 * caches) ships *inside* Flourish under build-tools/ (~519 MB) — the Android
 * toolchain (a JDK, the Android SDK, Gradle and the AGP/Maven dependency graph) is
 * far too large (~3 GB on disk) to bundle in the installer. Instead it is
 * downloaded once, on the user's first Android build, into the user-data folder
 * and reused forever after. Every build after the first is fully offline.
 *
 * Lives in:  <userData>/android-toolchain/
 *   jdk/                          – Temurin JDK 17 (host OS/arch)
 *   sdk/                          – Android SDK (cmdline-tools/latest, platform-tools,
 *                                   platforms;android-34, build-tools;34.0.0)
 *   gradle-dist/gradle-<ver>/     – Gradle distribution (invoked directly; no wrapper)
 *   gradle-home/                  – GRADLE_USER_HOME (AGP/Maven caches)
 *   keystore/flourish.keystore    – persistent app-signing key (created on first build)
 *   .ready                        – marker written only after a successful seed build
 *
 * Dependency-free (plain Node + the bundled 7-Zip that already ships with the
 * desktop toolchain) so it works in the packaged app with no npm install and no
 * system tools beyond what the OS already provides.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

// ── Pinned versions ──────────────────────────────────────────────────────────
// Pinned so the download is deterministic and we can state a size we can stand
// behind. Bumping any of these is a deliberate, tested change.
const PINNED = {
  jdkVersion: 'jdk-17.0.13+11', // Adoptium Temurin 17 LTS
  cmdlineToolsBuild: '11076708', // Android command-line tools (stable)
  platform: 'android-34',
  buildTools: '34.0.0',
  gradleVersion: '8.7', // compatible with Android Gradle Plugin 8.5.x
  agpVersion: '8.5.2',
};

// Conservative, rounded-UP per-component download sizes (MB) for the pre-download
// confirmation modal. Live progress shows the real bytes; these only drive the
// "this will download about N GB" figure so we never *understate* it.
const SIZE_ESTIMATE_MB = {
  jdk: 200,
  cmdlineTools: 150,
  gradle: 140,
  platformTools: 60,
  platform: 90,
  buildTools: 60,
  agpAndDeps: 700, // AGP + Maven deps pulled during the seed build
};

function hostOs() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}
function hostArch() {
  return process.arch === 'arm64' ? 'aarch64' : 'x64';
}
const isWin = process.platform === 'win32';

/** Download URLs for the directly-fetched archives. */
function downloadUrls() {
  const o = hostOs();
  const a = hostArch();
  // Google command-line tools use the OS token win/mac/linux (NOT "windows" like
  // the Adoptium API does).
  const ctOs = o === 'windows' ? 'win' : o;
  return {
    // Adoptium binary API 302-redirects to the GitHub release asset.
    jdk: `https://api.adoptium.net/v3/binary/version/${encodeURIComponent(PINNED.jdkVersion)}/${o}/${a}/jdk/hotspot/normal/eclipse?project=jdk`,
    cmdlineTools: `https://dl.google.com/android/repository/commandlinetools-${ctOs}-${PINNED.cmdlineToolsBuild}_latest.zip`,
    // downloads.gradle.org serves the distribution directly (services.gradle.org only
    // 307-redirects via GitHub, an extra host that can fail DNS / be filtered).
    gradle: `https://downloads.gradle.org/distributions/gradle-${PINNED.gradleVersion}-bin.zip`,
  };
}

// ── Path layout ──────────────────────────────────────────────────────────────
function getAndroidPaths(root) {
  const bat = (n) => (isWin ? `${n}.bat` : n);
  const sdkRoot = path.join(root, 'sdk');
  const cmdlineToolsBin = path.join(sdkRoot, 'cmdline-tools', 'latest', 'bin');
  return {
    root,
    jdkDir: path.join(root, 'jdk'),
    sdkRoot,
    gradleDistDir: path.join(root, 'gradle-dist'),
    gradleBin: path.join(root, 'gradle-dist', `gradle-${PINNED.gradleVersion}`, 'bin', bat('gradle')),
    gradleHome: path.join(root, 'gradle-home'),
    keystoreDir: path.join(root, 'keystore'),
    keystorePath: path.join(root, 'keystore', 'flourish.keystore'),
    readyMarker: path.join(root, '.ready'),
    tmpDir: path.join(root, 'tmp'),
    cmdlineToolsBin,
    sdkmanager: path.join(cmdlineToolsBin, bat('sdkmanager')),
  };
}

/** Find the JDK home (the folder containing bin/java) under jdkDir. */
function resolveJavaHome(jdkDir) {
  if (!fs.existsSync(jdkDir)) return null;
  const exe = isWin ? 'java.exe' : 'java';
  if (fs.existsSync(path.join(jdkDir, 'bin', exe))) return jdkDir;
  for (const entry of fs.readdirSync(jdkDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(jdkDir, entry.name);
    if (fs.existsSync(path.join(candidate, 'bin', exe))) return candidate;
    const macHome = path.join(candidate, 'Contents', 'Home'); // macOS bundle layout
    if (fs.existsSync(path.join(macHome, 'bin', exe))) return macHome;
  }
  return null;
}

function binIn(home, name) {
  const exe = isWin ? `${name}.exe` : name;
  return home ? path.join(home, 'bin', exe) : null;
}

/** Locate the bundled 7-Zip executable that ships with the desktop toolchain. */
function find7za() {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'build-tools'));
  candidates.push(path.join(__dirname, '..', 'build-tools'));
  const archDir = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'ia32' : 'x64';
  const osDir = isWin ? 'win' : hostOs() === 'mac' ? 'mac' : 'linux';
  const rel = path.join('node_modules', '7zip-bin', osDir, archDir, isWin ? '7za.exe' : '7za');
  for (const base of candidates) {
    const p = path.join(base, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ── Readiness + estimate ─────────────────────────────────────────────────────
function isAndroidToolchainReady(root) {
  try {
    const p = getAndroidPaths(root);
    if (!fs.existsSync(p.readyMarker)) return false;
    const javaHome = resolveJavaHome(p.jdkDir);
    const javaExe = binIn(javaHome, 'java');
    if (!javaExe || !fs.existsSync(javaExe)) return false;
    if (!fs.existsSync(p.sdkmanager)) return false;
    if (!fs.existsSync(p.gradleBin)) return false;
    if (!fs.existsSync(path.join(p.sdkRoot, 'platforms', PINNED.platform))) return false;
    if (!fs.existsSync(path.join(p.sdkRoot, 'build-tools', PINNED.buildTools))) return false;
    return true;
  } catch {
    return false;
  }
}

function getDownloadEstimate() {
  const breakdown = { ...SIZE_ESTIMATE_MB };
  const totalMB = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return {
    totalMB,
    totalGB: +(totalMB / 1024).toFixed(1),
    diskGB: +((totalMB * 2.1) / 1024).toFixed(1), // extracted footprint ≈ 2x download
    breakdown,
    pinned: { ...PINNED },
  };
}

// ── Low-level helpers ────────────────────────────────────────────────────────
function httpsGetFollow(url, onResponse, onError, redirects = 0) {
  if (redirects > 6) return onError(new Error('Too many redirects'));
  https
    .get(url, { headers: { 'User-Agent': 'FlourishVNE-AndroidBuild' } }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return httpsGetFollow(next, onResponse, onError, redirects + 1);
      }
      if (status !== 200) {
        res.resume();
        return onError(new Error(`HTTP ${status} for ${url}`));
      }
      onResponse(res);
    })
    .on('error', onError);
}

const NETWORK_ERROR_CODES = ['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE'];
function isRetryableNetworkError(err) {
  const code = err && err.code;
  const msg = (err && err.message) || '';
  return NETWORK_ERROR_CODES.includes(code) || /getaddrinfo|socket hang up|network|timed? ?out|ECONNRESET/i.test(msg);
}
function friendlyNetworkError(url, err) {
  let host = url;
  try { host = new URL(url).host; } catch {}
  return new Error(
    `Couldn't reach ${host} to download part of the Android tools (${(err && err.message) || err}). ` +
    `This is usually a network/DNS issue — check your internet connection (and any VPN, firewall, or proxy), then run the setup again. ` +
    `Already-downloaded parts are kept, so it will resume.`
  );
}

/** One download attempt: url → destFile, reporting cumulative bytes via onBytes. */
function downloadOnce(url, destFile, onBytes) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    const out = fs.createWriteStream(destFile);
    let received = 0;
    let settled = false;
    const fail = (e) => { if (settled) return; settled = true; try { out.close(); } catch {} reject(e); };
    httpsGetFollow(
      url,
      (res) => {
        const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
        res.on('data', (chunk) => { received += chunk.length; if (onBytes) onBytes(received, total); });
        res.pipe(out);
        out.on('finish', () => { if (settled) return; settled = true; out.close(() => resolve({ bytes: received })); });
        res.on('error', fail);
        out.on('error', fail);
      },
      fail
    );
  });
}

/** Download with retry/backoff on transient network errors. */
async function downloadFile(url, destFile, onBytes, onRetry) {
  const maxAttempts = 4;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await downloadOnce(url, destFile, onBytes);
    } catch (err) {
      lastErr = err;
      try { fs.rmSync(destFile, { force: true }); } catch {}
      if (attempt < maxAttempts && isRetryableNetworkError(err)) {
        const waitMs = 1500 * attempt;
        if (onRetry) onRetry(attempt, waitMs, err);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      break;
    }
  }
  throw isRetryableNetworkError(lastErr) ? friendlyNetworkError(url, lastErr) : lastErr;
}

/** Run a process, streaming stdout/stderr lines to onLine. Optionally feed stdin. */
function run(command, args, options, onLine, stdinText) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { ...options, windowsHide: true });
    let tail = '';
    const handle = (buf) => {
      const text = buf.toString();
      tail = (tail + text).slice(-6000);
      text.split(/\r?\n/).forEach((line) => { if (line.trim() && onLine) onLine(line.trim()); });
    };
    if (proc.stdout) proc.stdout.on('data', handle);
    if (proc.stderr) proc.stderr.on('data', handle);
    if (stdinText && proc.stdin) {
      try { proc.stdin.write(stdinText); proc.stdin.end(); } catch {}
    }
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} exited with code ${code}${tail ? '\n' + tail : ''}`));
    });
  });
}

/** Extract a .zip using the bundled 7-Zip. */
async function extractZip(sevenZa, archive, destDir, onLine) {
  fs.mkdirSync(destDir, { recursive: true });
  await run(sevenZa, ['x', '-y', `-o${destDir}`, archive], {}, onLine);
}

/** Extract a .tar.gz: 7-Zip gunzips to a .tar, then untars. */
async function extractTarGz(sevenZa, archive, destDir, onLine) {
  fs.mkdirSync(destDir, { recursive: true });
  await run(sevenZa, ['x', '-y', `-o${destDir}`, archive], {}, onLine);
  const tar = fs
    .readdirSync(destDir)
    .map((f) => path.join(destDir, f))
    .find((f) => f.toLowerCase().endsWith('.tar'));
  if (!tar) throw new Error('tar.gz extraction did not yield a .tar');
  await run(sevenZa, ['x', '-y', `-o${destDir}`, tar], {}, onLine);
  try { fs.rmSync(tar, { force: true }); } catch {}
}

/** Move the single top-level folder inside `from` to `to`. */
function moveSingleChild(from, to) {
  const entries = fs.readdirSync(from, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  const src = dirs.length === 1 && entries.length === 1 ? path.join(from, dirs[0].name) : from;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
  fs.renameSync(src, to);
}

// ── Install orchestration ────────────────────────────────────────────────────
/**
 * Download + set up the full Android toolchain. Reports progress via
 * onProgress({ phase, pct, message }) where pct is overall 0..100. Throws on
 * failure (caller maps to a user-facing error).
 */
async function installToolchain(root, onProgress) {
  const p = getAndroidPaths(root);
  const sevenZa = find7za();
  if (!sevenZa) {
    throw new Error('The bundled archive tool (7-Zip) was not found. Try reinstalling Flourish VNE.');
  }
  const report = (phase, pct, message) => {
    try { onProgress && onProgress({ phase, pct: Math.round(pct), message }); } catch {}
  };

  fs.mkdirSync(p.root, { recursive: true });
  fs.mkdirSync(p.tmpDir, { recursive: true });
  fs.mkdirSync(p.gradleHome, { recursive: true });

  const urls = downloadUrls();
  const est = getDownloadEstimate();
  const onDl = (base, span, label) => (received, total) => {
    const frac = total > 0 ? received / total : 0;
    report(
      'download',
      base + span * frac,
      `${label} — ${(received / 1048576).toFixed(0)} MB${total ? ' / ' + (total / 1048576).toFixed(0) + ' MB' : ''}`
    );
  };

  // Steps are individually resumable: if a previous run already completed a piece
  // (e.g. the JDK + tools downloaded, then the Gradle download failed on a network
  // blip), retrying skips what's done and only re-fetches what's missing.
  const onRetry = (label, basePct) => (attempt, waitMs, err) =>
    report('download', basePct, `${label}: network hiccup (${(err && err.code) || 'error'}) — retrying (${attempt}/3)…`);

  // 1. JDK (1–16%)
  let javaHome = resolveJavaHome(p.jdkDir);
  if (javaHome) {
    report('download', 16, 'Java runtime already downloaded — skipping.');
  } else {
    report('download', 1, 'Downloading Java runtime (JDK 17)…');
    const jdkArchive = path.join(p.tmpDir, isWin ? 'jdk.zip' : 'jdk.tar.gz');
    await downloadFile(urls.jdk, jdkArchive, onDl(1, 13, 'Java runtime'), onRetry('Java runtime', 1));
    report('extract', 16, 'Extracting Java runtime…');
    const jdkExtract = path.join(p.tmpDir, 'jdk-extract');
    fs.rmSync(jdkExtract, { recursive: true, force: true });
    if (isWin) await extractZip(sevenZa, jdkArchive, jdkExtract);
    else await extractTarGz(sevenZa, jdkArchive, jdkExtract);
    if (fs.existsSync(p.jdkDir)) fs.rmSync(p.jdkDir, { recursive: true, force: true });
    fs.renameSync(jdkExtract, p.jdkDir);
    fs.rmSync(jdkArchive, { force: true });
    javaHome = resolveJavaHome(p.jdkDir);
    if (!javaHome) throw new Error('JDK extraction failed: java executable not found.');
  }

  // 2. Android command-line tools (16–26%)
  if (fs.existsSync(p.sdkmanager)) {
    report('download', 26, 'Android command-line tools already downloaded — skipping.');
  } else {
    report('download', 17, 'Downloading Android command-line tools…');
    const ctArchive = path.join(p.tmpDir, 'cmdline-tools.zip');
    await downloadFile(urls.cmdlineTools, ctArchive, onDl(17, 7, 'Android tools'), onRetry('Android tools', 17));
    report('extract', 25, 'Extracting Android command-line tools…');
    const ctExtract = path.join(p.tmpDir, 'ct-extract');
    fs.rmSync(ctExtract, { recursive: true, force: true });
    await extractZip(sevenZa, ctArchive, ctExtract);
    // The zip contains a top-level cmdline-tools/ — Android requires it at
    // <sdkRoot>/cmdline-tools/latest/.
    const innerCt = path.join(ctExtract, 'cmdline-tools');
    moveSingleChild(fs.existsSync(innerCt) ? innerCt : ctExtract, path.join(p.sdkRoot, 'cmdline-tools', 'latest'));
    fs.rmSync(ctArchive, { force: true });
    if (!fs.existsSync(p.sdkmanager)) throw new Error('sdkmanager not found after extracting command-line tools.');
  }

  // 3. Gradle distribution (26–34%)
  if (fs.existsSync(p.gradleBin)) {
    report('download', 34, 'Gradle already downloaded — skipping.');
  } else {
    report('download', 27, 'Downloading Gradle…');
    const gradleArchive = path.join(p.tmpDir, 'gradle.zip');
    await downloadFile(urls.gradle, gradleArchive, onDl(27, 6, 'Gradle'), onRetry('Gradle', 27));
    report('extract', 33, 'Extracting Gradle…');
    fs.mkdirSync(p.gradleDistDir, { recursive: true });
    await extractZip(sevenZa, gradleArchive, p.gradleDistDir); // → gradle-dist/gradle-<ver>/
    fs.rmSync(gradleArchive, { force: true });
    if (!fs.existsSync(p.gradleBin)) throw new Error('Gradle launcher not found after extraction.');
  }

  // 4. SDK licenses + packages (34–62%)
  const sdkEnv = {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_SDK_ROOT: p.sdkRoot,
    ANDROID_HOME: p.sdkRoot,
    PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH || ''}`,
  };
  const havePlatform = fs.existsSync(path.join(p.sdkRoot, 'platforms', PINNED.platform));
  const haveBuildTools = fs.existsSync(path.join(p.sdkRoot, 'build-tools', PINNED.buildTools));
  if (havePlatform && haveBuildTools) {
    report('install', 62, 'Android SDK packages already installed — skipping.');
  } else {
    report('install', 35, 'Accepting Android SDK licenses…');
    await run(p.sdkmanager, [`--sdk_root=${p.sdkRoot}`, '--licenses'], { env: sdkEnv }, null, 'y\n'.repeat(50)).catch((e) => {
      console.warn('[android] --licenses returned non-zero:', e && e.message);
    });
    report('install', 40, 'Installing Android SDK packages…');
    await run(
      p.sdkmanager,
      [`--sdk_root=${p.sdkRoot}`, 'platform-tools', `platforms;${PINNED.platform}`, `build-tools;${PINNED.buildTools}`],
      { env: sdkEnv },
      (line) => {
        const m = /(\d+)%/.exec(line);
        const frac = m ? Math.min(parseInt(m[1], 10) / 100, 1) : 0;
        report('install', 40 + 22 * frac, 'Installing Android SDK packages…');
      },
      'y\n'.repeat(50)
    );
  }

  // 5. Seed build (62–98%) — a throwaway minimal Android project pulls the Android
  //    Gradle Plugin and all Maven deps into gradle-home so every later build is
  //    offline. Same idea as scripts/stage-build-tools.cjs for the desktop build.
  report('seed', 64, 'Downloading build dependencies (one-time)…');
  await runSeedBuild(p, javaHome, sdkEnv, (line) => {
    const lower = line.toLowerCase();
    let pct = 64;
    if (lower.includes('starting a gradle daemon') || lower.includes('welcome to gradle')) pct = 74;
    else if (lower.includes('configure project') || lower.includes('> task')) pct = 88;
    else if (lower.includes('build successful')) pct = 97;
    report('seed', pct, 'Downloading build dependencies (one-time)…');
  });

  // 6. Mark ready.
  fs.writeFileSync(p.readyMarker, JSON.stringify({ installedAt: new Date().toISOString(), pinned: PINNED }, null, 2));
  try { fs.rmSync(p.tmpDir, { recursive: true, force: true }); } catch {}
  report('done', 100, 'Android toolchain ready.');
  return { success: true };
}

/**
 * Build a minimal throwaway Android project to seed the Gradle/AGP/Maven caches.
 * Invokes the downloaded Gradle launcher directly (no wrapper jar needed).
 */
async function runSeedBuild(p, javaHome, sdkEnv, onLine) {
  const dir = path.join(p.tmpDir, 'seed');
  fs.rmSync(dir, { recursive: true, force: true });
  writeSeedProject(dir);
  const env = { ...sdkEnv, GRADLE_USER_HOME: p.gradleHome, JAVA_HOME: javaHome };
  await run(
    p.gradleBin,
    ['assembleDebug', '--no-daemon', '--console=plain', `--gradle-user-home=${p.gradleHome}`],
    { cwd: dir, env },
    onLine
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Write the files for the tiny seed project (mirrors the real template, minimal). */
function writeSeedProject(dir) {
  const w = (rel, content) => {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  };
  w('settings.gradle', `pluginManagement {\n  repositories { google(); mavenCentral(); gradlePluginPortal() }\n}\ndependencyResolutionManagement {\n  repositories { google(); mavenCentral() }\n}\nrootProject.name = "seed"\ninclude ":app"\n`);
  w('build.gradle', `plugins {\n  id 'com.android.application' version '${PINNED.agpVersion}' apply false\n}\n`);
  w('gradle.properties', `org.gradle.jvmargs=-Xmx1536m\nandroid.useAndroidX=true\norg.gradle.caching=true\norg.gradle.internal.repository.max.retries=4\norg.gradle.internal.repository.initial.backoff=1000\nsystemProp.org.gradle.internal.http.connectionTimeout=60000\nsystemProp.org.gradle.internal.http.socketTimeout=60000\n`);
  w('app/build.gradle', `plugins { id 'com.android.application' }\nandroid {\n  namespace 'com.flourish.seed'\n  compileSdk 34\n  defaultConfig {\n    applicationId 'com.flourish.seed'\n    minSdk 24\n    targetSdk 34\n    versionCode 1\n    versionName '1.0'\n  }\n}\n`);
  w('app/src/main/AndroidManifest.xml', `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n  <application android:label="seed" />\n</manifest>\n`);
}

module.exports = {
  PINNED,
  getAndroidPaths,
  resolveJavaHome,
  binIn,
  find7za,
  isAndroidToolchainReady,
  getDownloadEstimate,
  installToolchain,
  downloadUrls,
};
