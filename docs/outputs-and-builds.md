# Outputs & Builds (Do Not Mix These Up)

FlourishVNE has **three different “output” systems** that can look similar in code and UI. Keeping them separate prevents accidental regressions.

## 1) Project Export/Import (Save / Load for Authors)

**What it is:** The editor’s *save/load* mechanism for **editable project source**.

**Output format:** A `.zip` containing:
- `project.json` (the full editable VNProject)
- `assets/` (embedded/copied assets referenced by the project)
- `manifest.json` (export metadata)

**Primary entrypoints:**
- Export: `exportProject(project)` in `src/utils/projectPackager.ts`
- Import: `importProject(file)` in `src/utils/projectPackager.ts`

**Where it’s used (UI):**
- Project Hub import button → calls `importProject`
- Header “Export Project as .zip” → calls `exportProject`

**Important:** This is **not** a playable game build. It’s the authoring project.

---

## 2) Game Build (HTML/Web Playable)

**What it is:** Produces a **playable HTML game package** for browsers (itch.io, Netlify, local unzip + open).

**Output format:** A `.zip` containing:
- `index.html` (self-contained page that bootstraps the runtime)
- `assets/` (game assets)
- `README.txt` (player instructions)

**Primary entrypoints:**
- Build ZIP: `buildStandaloneGame(project, onProgress?)` in `src/utils/gameBundler.ts`
- Generate HTML: `generateStandaloneHTML(project)` in `src/utils/gameBundler.ts`

**Where it’s used (UI):**
- `src/components/GameBuilder.tsx` with buildType `web`

**Important:** This does **not** create an Electron executable.

---

## 3) Game Build (Desktop Electron Executable)

**What it is:** Produces a **playable desktop executable** (Electron wrapper) with file-based saves.

**How it works:**
- Generates `index.html` + `assets/` similarly to the web build
- Generates `main.js`, `preload.js`, `package.json` with `electron-builder` config
- Asks the *editor’s* Electron main process to run `electron-builder` via IPC

**Primary entrypoints:**
- Renderer-side orchestrator: `buildDesktopGame(project, onProgress)` in `src/utils/desktopGameBundler.ts`
- Main-process IPC handler: `ipcMain.handle('build-desktop-game', ...)` in `electron/main.cjs`

**Where it’s used (UI):**
- `src/components/GameBuilder.tsx` with buildType `desktop`

**Important:** This is **not** the project save/load zip.

---

## Quick mental model

- **Project export/import** = “Save my authoring file”
- **HTML build** = “Publish my game to web”
- **Desktop build** = “Publish my game as an .exe”
