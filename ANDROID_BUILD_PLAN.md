# Android Build — Implementation Plan

Status: IMPLEMENTED (2026-06-15), pending real-machine end-to-end verification (the ~1.4 GB
toolchain download + actual APK build + install + save-persistence test — owner will run).
All code written + statically verified: download URLs HEAD-checked live (JDK 182 MB,
cmdline-tools 146 MB, Gradle 128 MB), `node --check` on all electron files, `tsc` 0 errors,
`vite build` clean, en/pt i18n parity (2834 keys, 0 gaps), and the Android build UI + the
one-time download gate verified rendering correctly in the running app.

Scope: add an **Android (APK)** target to the game build system, as complete as the existing
Web and Desktop targets. Editor-only changes — the game engine and exported-game format do
**not** change.

## Implemented files (for the record)
- `electron/androidToolchain.cjs` (NEW) — first-run toolchain manager. Pinned JDK 17 +
  cmdline-tools + Gradle 8.7 (downloaded directly, no wrapper jar), sdkmanager installs
  platform-tools/android-34/build-tools 34.0.0 + licenses, then a throwaway seed build pulls
  AGP/Maven into gradle-home. Reuses bundled build-tools 7-Zip for extraction. Exports
  isAndroidToolchainReady / getDownloadEstimate / installToolchain.
- `electron/main.cjs` — IPC: android-toolchain-status, android-toolchain-install
  (streams android-toolchain-progress), build-android-game (streams android-build-progress) +
  ensureAndroidKeystore (persistent PKCS12 via keytool). buildsAndroid dir + get-user-data-paths.
  Generalized spawnWithProgress error text (was hardcoded "electron-builder").
- `electron/preload.cjs` — androidToolchainStatus / installAndroidToolchain /
  onAndroidToolchainProgress / buildAndroidGame / onAndroidBuildProgress.
- `src/utils/androidGameBundler.ts` (NEW) — reuses the web bundle pipeline, wraps it in a
  minimal WebView Gradle project (MainActivity.java + manifest + res + assets/www), injects
  the bridge script, generates a default icon, calls IPC. defaultPackageName/isValidPackageName.
- `src/components/GameBuilder.tsx` — Android target button, config (app name/package/version/
  orientation/icon), the one-time download gate modal, progress steps, success + next-steps.
- `src/i18n/locales/{en,pt}/gameBuilder.json` — androidBuild/androidConfig/androidGate +
  buildBtn.buildAndroid + progress.android + success.android* + nextSteps.android.

## Verification still owed (owner machine)
First Android build: confirm the gate → ~1.4 GB download/extract/sdkmanager/seed succeeds →
a real signed APK is produced → installs on a device → saves persist across app restarts
(file-based bridge). If the seed/Gradle step needs network the first time, that's expected;
it's offline thereafter.

## Owner decisions (locked)
1. **Toolchain delivery = first-run auto-download** (not bundled in the installer).
   - Before the first download, a **blocking confirmation modal** must state: the feature
     automates everything, but this is a **one-time download of the *full* Android
     toolchain**; the **actual size**; that it is downloaded (not bundled) **to keep the
     Flourish installer small**; and a **Continue / Cancel**. Only state a size we can
     guarantee (pinned versions; show real live progress).
2. **Output = installable, auto-signed APK** as the default deliverable; bundler/signing
   architected so an automated store-bundle (AAB) export can be added later.
   - **No app-store / "Google Play" names anywhere user-facing.** Any forward-looking copy
     says only "more publishing options coming later."
3. **Persistence = desktop-style, file-system-backed** (owner requirement): an Android game
   behaves like the Windows build (a packaged native app with private storage), just with
   taps instead of clicks. Saves/loads + persistent variables must be written to files via
   a native bridge — NOT browser localStorage (avoids size caps / OS eviction).

## Why this fits cleanly
- An exported game is already a self-contained static web app (`index.html` + `assets/`),
  produced by `generateStandaloneHTML()` + `collectAllAssets()` + lean-project logic
  (`src/utils/gameBundler.ts`). The desktop target wraps that exact bundle in Electron and
  compiles with a pre-bundled offline toolchain (`build-tools/`, ~519 MB) via the
  `build-desktop-game` IPC handler in `electron/main.cjs`.
- Android = the **same** web bundle dropped into a minimal native **WebView** app, compiled
  by Gradle + the Android SDK. Hand-rolled (one `MainActivity`), matching Flourish's
  no-heavy-framework philosophy — **no Capacitor/Cordova, no npm-at-runtime**.
- Runs **only in the Flourish desktop app** (like the desktop build; the web editor can't
  spawn build processes).

## Save/load contract to mirror (verified)
The engine (`src/components/LivePreview.tsx`, which is what the engine bundle is built from)
persists via `window.electronAPI.storage` when present, else `localStorage`:
- saves: `getGameSaves`/`saveGameSaves` → `electronAPI.storage.getItem(savesKey)` /
  `setItem(savesKey, savesObject)` (LivePreview.tsx ~:4881-4917). Stores the **object
  directly** (no JSON string).
- persistent variables: same `electronAPI.storage.getItem/setItem` (LivePreview.tsx ~:169-185).
- `ExitGame` → `electronAPI.quitApp()` (LivePreview.tsx ~:8265).
Canonical desktop implementation = `electron/preload-game.js`: `electronAPI.storage` =
`{ setItem, getItem, removeItem, clear, keys }` (all async), backed by `electron-store`
(a JSON file in `userData`).

**Android bridge must present the identical `electronAPI.storage` interface**, backed by the
app's internal files dir → file-based persistence with zero engine changes.
(Note/finding: the inline preload generated in `desktopGameBundler.ts` exposes the older
`save/load/listKeys` + `__electronStorage` shim, which the engine does NOT read — that path
is effectively dead; the canonical `preload-game.js` is the one to mirror. Out of scope to
change desktop, but recorded.)

## New / changed files
- `electron/androidToolchain.cjs` (new) — first-run toolchain manager: download/extract a
  pinned JDK 17 (Adoptium Temurin, host-OS), Android cmdline-tools; run `sdkmanager` to
  install `platform-tools`, `platforms;android-34`, `build-tools;34.0.0` + accept licenses;
  point `GRADLE_USER_HOME` into the toolchain dir; run a one-time **seed build** of a
  throwaway project so Gradle/AGP/Maven caches are populated (→ later builds fully offline,
  same trick as `scripts/stage-build-tools.cjs`). Plus `isAndroidToolchainReady()` +
  size/progress reporting. Toolchain root: `userData/android-toolchain/` (persists across
  Flourish updates; never shipped).
- `electron/main.cjs` (edit) — IPC: `android-toolchain-status`, `android-toolchain-install`
  (streams `android-toolchain-progress`), `build-android-game` (streams progress); add
  `buildsAndroid` to `get-user-data-paths`.
- `electron/preload.cjs` (edit) — expose the above methods on `window.electronAPI`.
- `src/utils/androidGameBundler.ts` (new) — renderer side, mirrors `desktopGameBundler.ts`:
  build the web bundle, assemble the Android project file map (Gradle template +
  `AndroidManifest.xml` + `MainActivity` + bridge script + icon + `assets/www/`), call IPC.
- `src/components/GameBuilder.tsx` (edit) — Android target + config (app name, package name,
  version, icon, orientation), the download-confirm modal, progress, success screen.
- `src/utils/buildValidator.ts` (edit) — Android validation (reverse-DNS package name, etc.).
- Android project template (in `androidGameBundler.ts` as strings, like the desktop main.js):
  `settings.gradle`, root `build.gradle`, `app/build.gradle` (applicationId, versionCode/Name,
  minSdk 24, compile/targetSdk 34, release signingConfig), `gradle.properties`, Gradle wrapper,
  `AndroidManifest.xml`, `MainActivity.java`, `res/` (icon mipmaps, theme), `assets/www/*`.

## The WebView app (persistence + input)
- One full-screen `MainActivity` WebView: `javaScriptEnabled`, `domStorageEnabled`,
  `databaseEnabled`, `allowFileAccess`, `mediaPlaybackRequiresUserGesture=false`, immersive
  fullscreen, hardware accel, back-button handling. Loads `file:///android_asset/www/index.html`.
- Taps → click events automatically (no engine change).
- **Native storage bridge:** `addJavascriptInterface(StorageBridge, "AndroidStorage")` +
  `"AndroidApp"`. `StorageBridge` (Java) reads/writes `getFilesDir()/saves/<sanitizedKey>.json`
  (sync String API: `getItem`→JSON string|null, `setItem(key,json)`, `removeItem`, `keys`→JSON).
  A bridge `<script>` is prepended (first script) into the Android `index.html` defining:
  `window.electronAPI = { storage: { getItem: async k => JSON.parse-or-null, setItem: async (k,v)=>..., removeItem, clear, keys }, quitApp: ()=>AndroidApp.quit() }`
  → exact engine contract, file-backed.

## Signing
- Generate a **persistent app keystore once** (stored in `userData`, reused on every rebuild
  so updates keep a stable signature). Release-sign the APK via Gradle `signingConfigs`.
  Default flow asks the user nothing. (Same keystore reused for future AAB export.)

## Output
- `Documents/Flourish VNE/Builds/Android/<AppName>.apk`, with reveal-in-folder (like desktop).

## Phases & checkpoints
- **P0** — Toolchain manager + first-run download + confirmation gate. Check: gate → install →
  `isAndroidToolchainReady()` true.
- **P1** — Android project template + bundler + `build-android-game` handler + signing →
  installable APK. Check: install on device/emulator and play; saves persist across restart.
- **P2** — GameBuilder UI: Android target, config, download-confirm modal, progress, success.
- **P3** — Polish: validator rules, icon densities, orientation, error surfacing, docs/i18n
  (en+pt), `buildsAndroid` path.
- Later (not now): automated store-bundle (AAB) + keystore management UI. No store names.

## Honesty / risk
- First-run download realistically ~1–1.5 GB (JDK ~180 MB, cmdline-tools ~120 MB, SDK
  platform/build-tools ~170 MB, Gradle ~130 MB, AGP/Maven deps ~300–500 MB) → ~2.5–3.5 GB on
  disk. Pin versions; the modal states the guaranteed pinned total + live progress.
- Offline-Gradle seed (P0 tail) is the trickiest part; precedent = desktop winCodeSign/cache
  seeding in `scripts/stage-build-tools.cjs`.
- Validate on Windows host first (matches how the editor ships: `dist` = `--win --x64`);
  toolchain manager is host-OS-aware so Mac/Linux hosts can follow.

## Pinned versions (to confirm exact sizes during impl)
JDK: Temurin 17 (LTS). Android: compileSdk/targetSdk 34, build-tools 34.0.0, minSdk 24,
cmdline-tools latest, platform-tools latest-pinned. Gradle: 8.x compatible with AGP 8.x.
