# Scripting · Plugins · Common Events — Audit & Improvement Plan

> Status: **PLAN / not started.** Agreed direction (2026-06-06): do the **full roadmap, phased**, and
> **build the half-wired features rather than hiding them**. Paused before kickoff to fix unrelated bugs first.
> Read this before touching any of the three systems.

## One-sentence diagnosis

Across all three systems the **surface was built ahead of the engine** — UI controls, TypeScript
types, and `docs/scripting-and-plugins.md` describe capabilities the runtime never wires up. So the
doc isn't just stale; it documents an API that was never finished, and a user following it hits broken
examples on the first try. This is a **credibility** problem as much as a missing-features problem.

Same failure mode three times: **selectable options that silently do nothing**, and **a doc describing
an aspirational API**.

---

## 1. Audit findings

Verified by reading the code (file:line cited). Headline stubs were spot-confirmed directly:
`scriptHandler.ts:70-91` and `PluginManagerService.ts:224-233`.

### 1a. Scripting — ~60% real

Works: variables (get/set), scene/label navigation, `playSFX`, `stopMusic`, `random`, `wait`, `log`.

Broken / missing / mis-documented:
- `showDialogue()` and `playMusic()` are `console.log` **stubs** — `scriptHandler.ts:70-91` (SFX + stopMusic do work).
- `getScenes()` / `getVariables()` are in the doc but **don't exist** in code. `getAllVariables()` exists but is undocumented.
- Triggers: only `command` (RunScript) fires. `onSceneEnter`, `onSceneExit`, `global` are selectable in the editor but **never invoked at runtime** (`scripting.ts:40` type only).
- Doc errors: `clamp`/`lerp` are actually `game.math.*` (`ScriptExecutor.ts:132-133`); `notify` types are `info|warning|error` only (doc claims `success`, `ScriptExecutor.ts:116`); the "blocked APIs" list claims `setTimeout`/`setInterval` are blocked but they are **not** (`wait()` relies on `setTimeout`).
- Sandbox = Function-constructor + global shadowing (`ScriptExecutor.ts:159`); bypassable via prototype chain (`({}).constructor.constructor`). Regex-only validation.
- No script params/args, no script-to-script calls, errors only go to `console.error` (`scriptHandler.ts:107-109`), plain-textarea editor (no highlight/autocomplete).

### 1b. Plugins — designed, mostly NOT wired (weakest system)

- `api.getVariable()` always returns `undefined`; `api.setVariable()` only logs — `PluginManagerService.ts:224-233`. The API is built at *load* time with no runtime state.
- `registerCommand()` / `registerEffect()` store defs that **nothing ever reads** — custom commands never appear in the palette or execute (`getRegisteredCommands()` has zero call sites).
- `invokeHook()` exists (`PluginManagerService.ts:141-152`) but is **never called** → `onBeforeCommand`/`onAfterCommand`/`onSceneChange` can never fire.
- Hook drift: doc documents `onVariableChange`/`onSave`/`onLoad-after-save` which are **not in the types**; types define `onPreBuild`/`onPostBuild`/`onRuntimeInit`/`onRuntimeTick`/`onUninstall` which are **undocumented**.
- Plugin storage → browser **localStorage** (`PluginManagerService.ts:270`), so it does **not** travel with an exported project (portability + save/load hard-rule concern).
- Doc examples use `id/name/defaultProperties/execute`; the real type wants `type/displayName/parameters/handler` (`src/types/plugins.ts:152-167`) → **every plugin example in the doc fails**.
- `integration` category implies external services, but the sandbox blocks `fetch`/XHR/WebSocket → integration is architecturally impossible today.
- Doc says `author` optional; validator requires it (`PluginManagerService.ts:326`). `getProjectInfo()` returns `sceneCount`/`characterCount` (doc says `scenesCount`, and omits `id`/`author`). `PluginManagerUI` ↔ service method signatures don't match.

### 1c. Common Events — ~50% real (working half is the important half)

- Call-with-parameters, return-to-caller, and nesting genuinely work via a command stack — `commonEventHandler.ts:17-79`; stack pop at `LivePreview.tsx:5115-5122`. Data model at `src/types/commonEvents.ts:51-75`.
- `parallel` and `auto` triggers are fully editable in the UI (`CommonEventsManager.tsx:500`) but **completely ignored** at runtime (scene init never reads `trigger`).
- **Variable leak:** parameter args are injected into **global** variables and never restored on return (`commonEventHandler.ts:74-76`) — they bleed into later scenes/calls.
- No recursion/cycle depth limit (`commonEventHandler.ts:58-65`) — A→B→A runs until the browser dies.
- No parameter type coercion; dangling arg refs not cleaned when a param is renamed/deleted.
- Callable only from scenes — **not** from scripts, UI actions, or choices (no `CallCommonEvent` in `VNUIAction`).

---

## 2. Roadmap (chosen: full, phased; build don't hide)

Per-phase **definition of done** = feature wired + UI honest + **that doc section rewritten to match** +
tsc (35 baseline) / vite / `build:engine` green. All schema additions additive-optional + `MigrationService`.

### Phase 1 — Scripting completeness
- Wire real `showDialogue` + `playMusic` (route through real handlers) in `scriptHandler.ts`.
- Add `getScenes()` / `getVariables()`; reconcile `getAllVariables()`.
- Add top-level `game.clamp`/`game.lerp` aliases (keep `game.math.*`); add `'success'` to `notify` + route to real toast.
- Fire `onSceneEnter` / `onSceneExit` at scene transitions; make `global` runnable via `game.runScript(nameOrId, args?)` (script-to-script).
- Script **params/args**: `params` on `VNScript` + `arguments` on `RunScriptCommand`, scoped injection.
- `game.callCommonEvent(id, args?)` (bridges to Phase 2).
- Surface script errors in the preview UI (toast + script console), not just console.
- Sandbox quick-hardening: block `setTimeout`/`setInterval` (keep `wait()` via an internal timer), close prototype-chain escape.
- Rewrite the Scripting half of the doc.

### Phase 2 — Common Events completeness
- Fix the variable leak: snapshot variable store on call, restore on stack-pop return (true local param scope).
- `MAX_CALL_DEPTH` + cycle detection (warn in editor, fail safe at runtime).
- Implement `auto` (run once on scene enter, optional `conditionVariableId` gate) and `parallel` (lightweight parallel scheduler ticking parallel CE command lists alongside the main loop, sharing the variable store, re-evaluated by condition). **Parallel is the riskiest item in the whole roadmap — write a mini-spec before coding.**
- Parameter type coercion + validation; clean dangling arg refs on param rename/delete.
- Expose CallCommonEvent as a `VNUIAction` + choice action (script path covered in Phase 1).
- Add a Common Events section to the doc (currently undocumented).

### Phase 3 — Plugin runtime (biggest hole)
- Move `PluginAPI` creation into the runtime context so `getVariable`/`setVariable` read/write live state.
- Actually call `invokeHook()` at real lifecycle points (before/after command, scene change, variable change); add missing hook types (`onVariableChange`, `onSave`, `onLoadAfterSave`); rename the doc's duplicate-`onLoad`.
- Wire `registerCommand` into command palette + inspector + executor (appear AND run); wire `registerEffect` into the effect pipeline.
- Move plugin storage out of `localStorage` into project/save data via `MigrationService`.
- Plugin settings UI (param schema → form); version/`engineVersion`/dependency enforcement; reconcile `author`; fix `PluginManagerUI`↔service signature mismatches.
- Plugin export/import as a file.
- Rewrite the Plugin half of the doc.

### Phase 4 — Reach & polish (optional)
- Monaco/CodeMirror script editor + generated `game`/`api` typings + autocomplete.
- Plugin sharing/marketplace + permission model.
- Cross-project common-event library.
- Richer `game` API: read choices, query stage/character state, and **inventory** (ties to the planned item registry — see `ITEM_REGISTRY_BRAINSTORM.md`).

---

## 3. Open design decisions (settle before Phase 1/3 coding)

1. **Canonical custom-command shape (Phase 3):** doc (`id/name/defaultProperties/execute→{advance}`) vs
   types (`type/displayName/parameters/handler→void`). Recommendation: extend the *typed* shape so
   `handler` returns a `CommandResult` ({advance, updates}) like built-in commands, then rewrite the doc to it.
2. **Network / "integration" posture (Phase 3):** keep the sandbox network-free (rename/repurpose the
   `integration` category) vs add a deliberate **allowlisted `fetch`** with per-plugin permission prompt.
   Default: no network now, design an allowlist in Phase 3.
3. **Sandbox depth:** quick-hardening now (block timers + prototype escape); revisit Web-Worker isolation
   only if untrusted third-party plugins become a goal.
4. **Doc timing:** rewrite per-phase (doc stays wrong for a system until its phase ships) vs a fast
   up-front "stop the bleeding" correction of the worst broken examples. Lean: quick up-front correction,
   since the doc actively misleads users today.

---

## 4. Source-of-truth files

- Scripting: `src/features/scripting/ScriptExecutor.ts`, `state/scriptReducer.ts`,
  `src/components/live-preview/command-handlers/scriptHandler.ts`, `src/components/.../ScriptEditor.tsx`,
  `RunScriptCommand` in `src/features/scene/types.ts`.
- Plugins: `src/features/plugins/PluginManagerService.ts`, `state/pluginReducer.ts`,
  `src/types/plugins.ts`, `src/components/PluginManagerUI.tsx`, `VNProject.plugins`/`pluginRegistry` in `src/types/project.ts`.
- Common Events: `src/types/commonEvents.ts`, `src/components/CommonEventsManager.tsx`,
  `src/features/common-events/state/commonEventReducer.ts`,
  `src/components/live-preview/command-handlers/commonEventHandler.ts`, stack pop at `LivePreview.tsx:5115-5122`.
- Doc to rewrite: `docs/scripting-and-plugins.md` (+ `.html` sibling). No Common Events doc exists yet.
