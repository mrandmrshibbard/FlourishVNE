# Phase C — Extensions System (editor extensibility) — PLAN

> Goal: let power users extend the **editor itself** (panels, database tabs, UI element types, menu tools)
> and package those add-ons so **non-coders can install and use them** — the ecosystem layer. Includes
> Brad's "anything goes" stance (e.g. a goofy embedded-YouTube panel in the editor). Plan only — no code
> until Brad signs off on scope + starting point. Honors: never break save/load; opt-in; no surprise builds.

## 0. The key insight — build ON the Plugin system, don't fork it

The **Plugin** system is already built and solid (`PluginManagerService` + `types/plugins.ts`): manifest,
install-from-file, enable/disable/uninstall, per-project registry (`project.pluginStorage` /
`PluginRegistryEntry`), runtime + host bridges, lifecycle hooks, **and `registerCommand` already adds an
editor command with a parameter UI + runtime handler**. So a "Plugin" today already does engine work AND a
bit of editor work.

**Extensions = the same unit, extended with EDITOR contribution points.** We add an *editor contribution
registry* alongside the existing engine one, a manifest `contributes` block + `target` field, contribution
hosts (React mount points), and packaging. One manager, one install flow, one storage model — a plugin that
contributes editor UI simply shows as an "Extension." This avoids a parallel system and keeps save/load and
install logic untouched.

**Trust model (from the spec, matched to Brad's stance):** full local trust, **opt-in enable** (already how
plugins work), a trust prompt at install that discloses capabilities (incl. network for a YouTube panel).
We are NOT building a marketplace/sync, so the spec's heavy extension-host isolation (separate Electron
process / QuickJS) is **deferred** — extension code runs in-renderer like plugins do now. The one hard rule
we keep from day one: the auto-updater and any future sync channel stay unreachable from extension code, and
install/migration scripts from an **imported project** never auto-run without explicit consent (the Obsidian
PHANTOMPULSE lesson).

## 1. Manifest + registry foundations (Phase C0)

Additive, back-compat (existing plugins: no `target`/`contributes` → behave exactly as today).

- Extend `PluginManifest`: `target?: 'runtime' | 'editor' | 'both'` (default `'runtime'`); `contributes?: {
  panels?; databaseCategories?; uiElementTypes?; menus?; toolbarTools?; resourceTypes? }`.
- `PluginManagerService`: add an **editor contribution registry** (parallel to `registeredCommands`/
  `registeredEffects`): `registerPanel/DatabaseCategory/UIElementType/Menu/...`, `getRegistered*`,
  unregister-on-disable in `unregisterFor`. Add `setEditorHost(bridge)` (project read, guarded dispatch,
  notify, navigate-to-tab) set in `ProjectContext`, mirroring `setHost`.
- New `EditorExtensionAPI` (the editor-side analog of `PluginAPI`) passed to contribution render/activate:
  read project, dispatch through guarded actions, notify, extension-scoped storage, open windows.
- A React `<ExtensionSlot location="..."/>` that renders contributed UI at named mount points (sidebar,
  tools menu, database tabs, screen-element palette…). Lazy: only enabled extensions contribute.
- Effort: **M**. Touches `types/plugins.ts`, `PluginManagerService`, `ProjectContext`, one new slot component.

## 2. Contribution points (each is independently shippable)

### C1 — Editor Panels  ★ recommended first (highest visible value; delivers the YouTube example)
- `contributes.panels: [{ id, title, icon, location: 'sidebar'|'tools'|'window', render(container, ctx) }]`.
- A panel host mounts the panel as a tab and/or a pop-out window (reuses the existing multi-window system).
- `ctx` = `EditorExtensionAPI`. Because `render` gets a raw container, an extension can do **anything** —
  including an `<iframe>` to YouTube. (Free-form render = Brad's "anything goes". A declarative form
  renderer also exists for structured config, see C3.)
- Effort: **M**. New panel host + slot wiring + 1 sample extension.

### C2 — Custom Scene Commands  (mostly DONE — upgrade only)
- Already shipped via `registerCommand` (palette entry + param UI + runtime handler). Upgrade param types to
  the spec's richer set: `struct`, `array`, `variable` (variable-button), `valueFormula` display text,
  param grouping. Effort: **S–M**.

### C3 — Custom Database categories (Data Record Views)
- `contributes.databaseCategories: [{ category, name, attribute, sections:[{name, items:[ViewItem]}] }]`.
- Generic list+form UI rendered from the spec (the `ViewItem` typed-control system); records stored in a
  namespaced project bag (additive, save/load-safe via MigrationService-free optional field). Runtime read
  via `api.records.<attribute>`. Lets an extension add e.g. a "Cards" or "Quests" database tab.
- Effort: **L** (generic typed-form renderer is the bulk).

### C4 — Custom UI element types (screen / In-Game UI widgets)  ★ the "build the UI themselves" answer
- `contributes.uiElementTypes: [{ type, displayName, defaultProps, inspectorSchema, render(props, ctx) }]`.
- New widget types appear in the MenuEditor/InGameUIEditor element palette + render in the engine
  (LivePreview/VNUIElements). This is the deepest one — it touches the screen-element model (editor
  inspector + canvas + engine renderer) and must stay save/load-safe (unknown element type degrades
  gracefully if its extension is missing).
- Effort: **L–XL**. Highest power, highest risk; do after C1/C3 prove the registry.

### C5 — Menu items / toolbar tools (script agents)
- `contributes.menus / toolbarTools: [{ id, label, icon, run(ctx) }]` → entries in the Tools menu / header.
- Effort: **S**.

### C6 — Custom resource types
- Lower priority; lets an extension register a new asset kind + importer. Effort: **M**. Defer.

## 3. Packaging + Manager (Phase C7)

- **Bundle format:** evolve today's single-file `.plugin.js` (manifest embedded as an export) into an
  optional `.flourishext` zip = `manifest.json` + `entry.js` + `resources/`. Keep single-file supported for
  simple extensions (no zip needed). Composer UI: pick contributions + fill manifest (id, name, version,
  author, url, license, description, optional install/uninstall script) → emit the bundle.
- **Manager:** the existing `PluginManagerUI` already does install-from-file / enable / disable / configure.
  Add: a **trust prompt** at install that lists capabilities + network/file use; contribution list in the
  details view; enable/disable per-contribution-group; optional load order.
- Effort: **L** (zip read/write + Composer UI). Single-file path is **S** and could ship first.

## 4. Security + docs (Phase C8)

- Trust prompt + capability disclosure at install; "this can run code on your machine" notice.
- Updater/any-future-sync unreachable from extension code; **install/uninstall/migration scripts never
  auto-run from an imported project** without explicit consent.
- **Extension authoring guide** in `docs/` (+ the in-app reference): manifest, contribution schemas, the
  `EditorExtensionAPI`, the sample extensions, the "anything goes but disclose capabilities when sharing"
  rule. (Pairs with the Phase B scripting docs.)
- Deferred (only if a marketplace/sharing channel is ever added): extension-host process isolation,
  QuickJS/iframe sandboxing, signing + manual review + kill-switch (spec Stage 4).

## 5. Recommended sequencing

1. **C0 foundations** (manifest + editor registry + slot + EditorExtensionAPI) — prerequisite for everything.
2. **C1 Panels** — fastest path to a visible, "anything goes" win (YouTube-panel demo) + validates the registry.
3. **C5 Menus/tools** — cheap, rides on C0.
4. **C3 Database categories** — first big structured contribution (generic form renderer, reused later).
5. **C7 Composer/Manager + C8 trust/docs** — make it shareable + safe + documented (the ecosystem unlock).
6. **C4 UI element types** — deepest/most powerful; do once the registry + packaging are proven.
7. C2 upgrade and C6 resources slot in opportunistically.

Each step ships independently (additive, save/load-safe, both forks, tsc+build+build:engine green where the
engine is touched — only C2/C4 touch the engine; C1/C3/C5/C7 are editor-only).

## 6. Open decisions for Brad
- **Start with C1 Panels?** (recommended — visible + delivers the YouTube example.)
- **Free-form render (full power, incl. iframes) vs declarative-only for v1 panels?** Brad's "anything goes"
  → recommend free-form `render(container, ctx)`, with declarative forms reserved for config/DB.
- **Bundle format now or later?** Recommend: ship contributions first as single-file extensions (reuse the
  current `.plugin.js` path); add the `.flourishext` zip + Composer once 2-3 contribution types exist.
