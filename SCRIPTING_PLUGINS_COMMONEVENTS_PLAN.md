# Scripting · Plugins · Common Events — Audit & Improvement Plan

> Status: **ALL PHASES DONE (2026-06-07).** P1 Scripting · P2 Common Events · P3 Plugins · P4 polish (offline subset).
> **Phase 4 shipped (offline, low-risk subset):** richer script `game` API — **inventory** (`getItemCount`/
> `hasItem`/`addItem`/`removeItem`/`getItems`, sugar over each item's count variable via the existing
> `project.items`/`itemReducer`) + `getCharacters()`; **cross-project Common Event library** (Export/Import
> JSON in `CommonEventsManager`, fresh CE ids on import, internal command/param ids preserved); **ScriptEditor
> API reference panel** (📖 API toggle → click-to-insert snippets at the cursor — a lightweight, dependency-free
> autocomplete substitute); docs updated (md+html). **Deliberately skipped from P4 (out of scope for an
> offline/bundled build):** Monaco/CodeMirror (heavy dep), plugin marketplace + permission model (needs
> network — we settled on no-network), custom-effect visual pipeline (deferred in P3). Verified tsc 35 / vite
> / build:engine (676 KB) green.
> **Phase 3 shipped:** rebuilt `PluginManagerService` around the UI's actual call contract (the old
> service↔UI signatures were fully mismatched → install was broken). New `setHost(bridge)` (project/
> dispatch/toast, set in `ProjectContext`) + `setRuntime(bridge)` (live getVariable/setVariable/notify,
> set by `LivePreview` during play). `loadPlugin(source, project, dispatch)` validates + checks
> engineVersion/dependencies + dispatches INSTALL + loads hooks; `enable/disable/uninstall(…, project,
> dispatch)`; `ensureLoaded(project)` loads enabled + unloads stale (project-switch safe). Hooks actually
> fire: `onBeforeCommand`/`onAfterCommand` (around the main switch), `onSceneChange` (lifecycle effect),
> `onVariableChange` (applyResult diff + bridge setVariable), `onRuntimeInit` (play start); added hook
> types `onVariableChange`/`onSave`/`onLoadAfterSave` (killed the doc's duplicate-`onLoad`). `registerCommand`
> → custom commands appear in the Command Palette "🧩 Plugins" group, are created by `commandFactory`
> (params defaults), edited by a generic param editor in `PropertiesInspector`, and RUN via a default case
> in the LivePreview command switch (handler may return `{advance:false}`). `registerEffect` registered +
> listed (full visual pipeline deferred). Storage moved to `project.pluginStorage` via `SET_PLUGIN_STORAGE`
> (travels with the project; localStorage gone). Plugin settings form (from optional `manifest.settings`),
> dep/engine enforcement, export (`.plugin.js`) + import-from-file in `PluginManagerUI`. Sandbox hardened
> to script parity (timers + `.constructor` blocked). Plugin doc half rewritten (md + html) to the TYPED
> command shape (`type/displayName/parameters/handler`). Canonical-shape decision: typed shape, handler
> uses `api.*` + optional `{advance}`. Network decision: no network (integration category documented as
> such). Verified tsc 35 / vite / build:engine (674 KB) green.
> **Phase 2 shipped:** CE parameter variable-leak fixed (stack frame now stores `savedVariables`/
> `clearedVariables` + `commonEventId`; both pop sites in `LivePreview` restore on return — true local
> param scope); `MAX_CALL_DEPTH=32` + cycle detection (target already on the stack) in `commonEventHandler`
> (+ enforced in the script bridge and the new UI action); `auto` trigger runs once at scene start via a
> **race-free injection at the top of the main command loop** (`autoRanSceneRef`, condition-gated, top
> scene level only, re-entry re-runs); `parallel` trigger via a `setInterval(~120ms)` scheduler in
> `LivePreview` (per-CE PC + `waitUntil`, condition-gated, advances one **background-safe** command/tick:
> SetVariable/RunScript/Wait/audio — presentation-takeover commands skipped with a one-time warn; pure
> runtime, nothing serialized); param **type coercion** (`coerceParam`) at every call site + **dangling
> arg-ref cleanup** in `commonEventReducer` `DELETE_COMMON_EVENT_PARAMETER` (sweeps scenes + CEs);
> `CallCommonEvent` exposed as a `VNUIAction` (handled in `LivePreview` action chain with depth/cycle
> guard + param save/restore; pickable + arg inputs in the shared `menu-editor/ActionEditor`, so buttons,
> ShowButton commands, and choices all get it; en/pt i18n added); Common Events doc section added to
> `docs/scripting-and-plugins.md` (+ `.html`). Verified tsc 35 / vite / build:engine green. Parallel
> mini-spec recorded below. Agreed direction (2026-06-06):
> do the **full roadmap, phased**, and **build the half-wired features rather than hiding them**.
> Read this before touching any of the three systems.
>
> **Phase 1 shipped:** real `showDialogue`/`playMusic` + `notify`→toast (via new `CommandContext.notify`,
> sourced from `ToastContext` in `LivePreview`); `getScenes()`/`getVariables()`/`getAllVariables` alias;
> top-level `game.clamp`/`game.lerp` (kept `game.math.*`); `notify` `'success'`; `onSceneEnter`/`onSceneExit`
> fired via a `currentSceneId`-watching effect in `LivePreview` (global hooks, navigation ignored to avoid
> loops); `global` scripts runnable via `game.runScript(nameOrId, args?)` (recursive, depth-guarded);
> script **params** (`VNScript.params`) + **args** (`RunScriptCommand.arguments`) exposed as read-only
> `game.args` (NO variable leak — never written to the store); `game.callCommonEvent(nameOrId, args?)`
> bridges to the command-stack; sandbox hardening (block timers + reject `.constructor`); errors surfaced
> as toasts + in the ScriptEditor console; ScriptEditor params panel + RunScript Arguments inspector;
> Scripting half of `docs/scripting-and-plugins.md` (+ `.html`) rewritten to match. Schema additions are
> additive-optional (round-trip safe both directions) — no MigrationService entry needed (that framework is
> for structural 1.0→2.0 jumps). Verified: tsc 35 baseline, vite build, build:engine green.

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

#### Parallel scheduler mini-spec (settled 2026-06-07)
- **Activation:** while `mode==='playing'`, active set = enabled CEs with `trigger==='parallel'` whose
  `conditionVariableId` is unset OR resolves truthy. Re-evaluated each tick (cheap), so toggling the
  condition variable starts/stops the CE. State per CE: `{ index, waitUntil? }`, reset when it leaves the
  active set so it restarts cleanly next activation.
- **Tick:** one `setInterval` (~120ms) gated on `mode==='playing' && !paused && hudStack.length===0`.
  Each tick, each active CE advances **one** command from its own PC; at end-of-list it loops to 0
  (parallel events are looping background logic). `Wait` sets `waitUntil = now + secs*1000` and the PC
  pauses until then.
- **Allowed commands (background-safe only):** `SetVariable`, `RunScript`, `Wait`,
  `PlayMusic`/`StopMusic`/`PlaySoundEffect`/`StopSoundEffect`, `CallCommonEvent` (called events, depth-
  guarded). **Skipped (with a one-time warn):** anything that takes over the main presentation —
  Dialogue, Choice, ShowText/Image/Character, SetBackground, TextInput, Jump/JumpToLabel, CreditRoll,
  screen effects, particles, tweens. Rationale: parallel events must never hijack the dialogue flow; this
  keeps them safe and is documented as a known limitation.
- **Variable sharing:** writes go to the same global store; flushed to `playerState.variables` once per
  tick. **Bounds:** per-tick per-CE = 1 command; this naturally rate-limits. No save-state change — the
  scheduler is pure runtime (PCs are not serialized; parallel CEs simply restart on load). Honors
  [[feedback-never-break-saveload]].

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
