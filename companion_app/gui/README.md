# Flourish → Godot (desktop GUI)

The non-coder friendly app: pick a `.flourish` game, click one button, and get a **ready-to-open Godot
4.3 project** you can play on your PC. It wraps the export + convert tools (`../tooling/`) with a friendly
window — no command line.

**Boundary reminder (spec §1):** this only produces a *stock* Godot project. It never bundles or fetches a
console SDK, touches signing keys, performs a console build, or bundles W4 Consoles templates. Shipping to a
console is done by the user, on their machine, with their own platform approval + W4 license.

## Run it (dev)

```bash
cd companion_app/tooling/exporter && npm install && npm run build   # once
cd ../converter && npm install && npm run build                     # once
cd ../../gui && npm install && npm start
```

Then: **drop your `.flourish` file** on the window (or click to pick it) → **Make my Godot game** → open the
generated folder and double-click `project.godot` in Godot 4.3, press **Play**.

## How it works

- `pipeline.mjs` — the orchestration. Runs `exporter` (`.flourish → .vnbundle`) then `converter`
  (`.vnbundle → Godot project`) **in-process** and returns a structured result (title, scene/character/
  variable counts, capabilities used, warnings, output path). Testable with plain Node:
  ```bash
  node -e 'import("./pipeline.mjs").then(m=>m.runPipeline("<file.flourish>","<outFolder>",console.log))'
  ```
- `main.cjs` — Electron main process. File/folder pickers, runs the pipeline, streams progress, opens the
  output folder. All privileged work is here (renderer is sandboxed: `contextIsolation`, no `nodeIntegration`).
- `preload.cjs` — the safe bridge (`window.companion.*`).
- `index.html` + `renderer.js` — the one-window UI: drop zone, one primary button, plain-language result
  with capability notes, "not fully carried over" warnings, and the play-it-now steps.

## Notes

- The generated project embeds the runtime (`../runtime-godot`) + your game at `res://bundle/`, so it's
  self-contained and needs no arguments — just open and Play.
- Output defaults next to your `.flourish` file; use **Choose output folder…** to change it.
- Packaging into a single double-clickable `.exe` (electron-builder, offline, like the main app) is a
  follow-up; for now `npm start` runs it.
