# Build Specification: Scripting, Plugins & Extensions System (Visual Novel Maker–Inspired) for a React/Electron/TypeScript App

## TL;DR
- Replicate VNM's THREE-layer extensibility model: (1) a **visual command-based Scripting system** for non-coders (event command lists organized into scenes/pages, with variables, switches, conditional branches, loops, labels/jumps, and a raw "Script" command); (2) a **Plugins system** (runtime/game-engine JavaScript that hooks the running experience via class aliasing/subclassing and adds new event commands); and (3) an **Extensions system** (editor-facing add-ons that add database categories, scene commands, custom views/panels, menu "script agents," and language bundles, packaged as installable zip archives with a manifest).
- The decisive architectural distinction VNM draws — which you must preserve — is **Plugin = extends the GAME ENGINE/runtime; Extension = the packaged unit that modifies the EDITOR (and can bundle game-engine scripts too)**. In VNM both are authored as JSON-defined UI + JS/CoffeeScript logic and shipped through an Extension Composer that emits a `.zip`; the editor's Extension/Plugin Manager installs them.
- For your full-trust-but-no-cross-user-poisoning constraint, adopt the **Obsidian/RPG Maker model for local power (unsandboxed local code is fine)** but add the **Figma/VS Code model for shared channels (manual review + isolation of update/sync/marketplace pipelines)**: never let a plugin write to the app's own update feed, auto-distribute itself, or mutate shared/synced infrastructure. Run plugin JS in an isolated Electron renderer world reached only through an audited `contextBridge` API; keep the auto-updater and any marketplace/sync service unreachable from plugin code.

## Key Findings

### The three layers and how they relate
Visual Novel Maker (VNM) is, per its Steam store page, "developed by André Radomski" and published by Degica/KOMODO/KADOKAWA. It is built on web technology (originally NW.js, later migrated to Electron) and renders with a PIXI-style scene graph. It exposes three distinct but interlocking extensibility layers:

1. **Scripting (authoring layer for non-coders).** The Scene Editor presents a visual, drag-and-drop **command list** ("Scene Content") organized into Chapters → Scenes → (sub-scenes) with a Live Preview. Commands are grouped into categories (Message, Basic, System, etc.). This is what VNM calls scripting for VN authors. Crucially, VNM's documentation explicitly redefines "scripting" to ALSO mean engine-level coding: "In VN Maker, scripting means to modify and extend the actual VN game engine and not to script your VN scenes line by line." So there are two senses: (a) the visual command flow, and (b) the Game Script layer (CoffeeScript/JavaScript) editable in the Script Editor.

2. **Plugins (game-engine/runtime layer).** Game Scripts authored in the Script Editor (View → Script) define the entire VN engine as editable classes. Plugins extend the runtime by subclassing/aliasing these classes (e.g., subclass `gs.Component_CommandInterpreter`, override `assignCommand`, then reassign the global class). This is how new event commands get their in-game behavior and how engine behavior is monkey-patched.

3. **Extensions (editor layer + packaging).** The Extension Editor (View → Extension) lets developers modify the EDITOR: add Data Record Views (database categories), Scene Commands (toolbox commands with JSON-defined config UI), Custom Views, JavaScript files, Objective-J files (custom controls/resource processors/script agents), and Language Bundles. An **Extension** is the packaged, shareable unit (a `.zip` produced by the Extension Composer) that can contain BOTH editor documents AND game-engine scripts. As Pete Davison's hands-on "Visual Novel Maker: First Look" (MoeGamer, Nov 6, 2017) put it: "This is something new to Visual Novel Maker that wasn't found in RPG Maker; it allows you to actually fiddle around with how the editor works… This helps get around the issues that RPG Maker had with plugins, which often had to rely on peculiar workarounds such as 'notetags'… With the addition of this Extensions feature, anyone who creates a plugin for Visual Novel Maker games can also add interface elements to the editor itself."

### Scripting system specifics
- **Data model / hierarchy:** Chapters contain Scenes; Scenes contain Scene Content (an ordered command list) and may contain sub-scenes. Commands can be indented (tabbed) under control commands (e.g., Condition) and disabled. Each command serializes to JSON with an `id` (e.g., `gs.ShowMessage`), a `params` object, and presentation hints. The Message Batcher reveals the on-disk shape: `{ "id": "gs.ShowMessage", "params": { "waitForCompletion": 1, "duration": 15, "expressionId": null, "custom": {...}, "message": { "lcId": null, "defaultText": "..." } } }`.
- **Variables & flow control:** Three scopes — **Local** (per-scene, stored by scene UID), **Global** (whole game, bound to a save), **Persistent** (independent of saves). Four data types — **Strings, Numbers, Booleans (called "Switches"), Lists** (lists can nest). Numbers vs. Decimals (rounding control). Flow control commands: **Condition / Else / Else If**, **Loop / Break Loop**, **Label / Jump to Label**, number/text/switch conditional jumps, **Wait**, **Wait for Input**, **Idle**, **Comment**, timers (Start/Pause/Resume/Stop Timer), references/pointers. Variables are addressed by number within a **domain** (e.g., `com.example.game`) to avoid collisions when sharing content.
- **The Script command:** A built-in event command (`commandScript`) lets authors drop raw CoffeeScript/JavaScript into the visual flow. Authors can also use external editors / any language that compiles to JS (TypeScript, etc.).
- **Expression/interpolation language — "Text Codes":** Inline codes inside message text, delimited by curly braces. Examples: `{C:index}` (color from System colors, or hex), `{SZ:50}` (size), `{Y:N}` (style toggles), `{W:A}` (wait for click), `{P}` (page break), `{SP:1}`–`{SP:8}` (sounds), `{CR:Name}` (character name in their color), and variable interpolation by scope/type prefix: `GT`/`GN`/`GS`/`GL` (global text/number/switch/list), `LT`/`LN`/`LS`/`LL` (local), `PT`/`PN`/`PS`/`PL` (persistent), e.g., `{GT:3}`. **Text Macros** offer three modes: Text Code (a compressed shortcut), Placeholder Script (executes JS and substitutes the return value), and Script (executes JS, return ignored).
- **Game-object commands** address characters, backgrounds, pictures, text, video, hotspots, image-maps, messages/message-areas, audio (music/sound/voice with layered audio), choices (Add Choice / Show Choices with On-Select actions: Jump To, Call Common Event, Bind To switch, Call Scene), Live2D, screen effects/transitions, and save/load. Objects can be grouped via an `@default`/named group to separate author objects from extension-managed ones.

### Plugin/Extension authoring model (VNM specifics)
- **Authoring surfaces:** Script Editor (game engine) and Extension Editor (editor). Both use the ACE code editor. Saving compiles CoffeeScript→JS (or compiles extension documents to an internal JS object) and reports syntax errors.
- **Data Record View JSON** (database category): `{ "category": "cards", "descriptor": { "name": "Cards", "attribute": "cards", "sections": [ { "name": "General", "items": [ ... ] } ] } }`. Items are typed UI controls (`GSLabel`, `GSTextField` with `multiline`, `GSImageView` with `folder`, etc.), each with `type` (required), `attribute` (backend field), `frame` ([x, y, w, h], -1 = auto), `defaultValue`, plus type-specific fields. Data is read at runtime via `RecordManager.<attribute>`.
- **Scene Command JSON:** `{ "id": "ext.ShowCard", "group": "Custom", "defaultValue": {}, "quickItems": [ ... ] }`. `id` convention `<module>.<name>` (built-ins reserve `gs.` and `vn.`). `quickItems`/`fullSizeItems` hold controls like `GSQDataRecordField` (with `dataSource`), `GSQStepper` (with `minimum`/`maximum` using `GS.CONST.MAX_NUMBER_VALUE`), `GSQTextArea`. Each item has `attribute`, `valueFormula` (JS returning display text, using helpers like `fmtRecord`, `fmtNumVar`), `label`, and optional `variableButton` ({ dataSource }) enabling variable-driven values. Real built-in commands (Show Message) also carry `displayName`, `windowTitle`, `windowSize`, `expanded`, `inlineImage` (formula), `valueTranslator`, and `localizable`.
- **Script-side command implementation:** subclass the interpreter and reassign the global class:
```coffeescript
class Component_CommandInterpreterCardExtension extends gs.Component_CommandInterpreter
    assignCommand: (command) ->
        super(command)
        switch command.id
            when "ext.ShowCard" then command.execute = @commandExtShowCard
    commandExtShowCard: ->
        card = RecordManager.cards[@interpreter.numberValueOf(@params.cardId)]
        # ...command logic...
gs.Component_CommandInterpreter = Component_CommandInterpreterCardExtension
```
The doc stresses creating a NEW script (not editing core) and reassigning the class so "multiple extensions can add new commands independent from each other."
- **Extension manifest fields (Extension Composer):** unique **Identifier** (reverse-domain, e.g., `com.degica.ExampleCardExtension`), Company/Organization, Name, Version (e.g., `1.0.0.0`), Author, Author Website, optional **Install Script** (data migrations across versions), optional **Uninstall Script** (cleanup), Description, and License text the user must accept before install. The Composer bundles selected Documents (data record views, scene commands, game scripts, resources) and emits a `.zip`.
- **In-Game UI (IGUI) system:** Menus/HUD/title/message boxes are defined as JSON **layouts** in Script Editor → Layouts (e.g., `Layout_Title`, `Template_MessageBox` with `ui.MessageBoxNVL`). Layouts contain controls (images, buttons, texts) arranged by layout type (grid, stack, free, spread); support **styles** (centralized reusable props via `ui.UIManager.styles`), **templates**, **actions** (e.g., Switch To Layout), **animations**, and **data binding** to in-game settings.

### Engine API surface (what plugins hook)
Confirmed from the Game Script API docs (module prefixes are significant): **`gs.`** = engine core, **`vn.`** = the 7 VN-specific classes, **`ui.`** = UI/message objects.
- **`gs` managers:** `GameManager` (settings, save/load, `newGame()`, `load(slot)`, `save(slot, thumbWidth, thumbHeight)`, `update()`, plus state props `tempFields`, `sceneData`, `sceneViewport`, `backlog`, `globalData`, `saveGameSlots`, `saveSlotCount` (default 100), `characterParams`, `commonEvents`, `chapters`, `messages`, `defaults`, `inLivePreview`); `SceneManager` (`switchTo(scene, savePrevious, callback)`, `returnToPrevious(callback)`, `clear()`, `update()`, props `scene`, `nextScene`, `previousScenes`, `transitionData`); `AudioManager` (`playMusic`, `playMusicRandom`, `playSound`, `playVoice`, `stopMusic`, `stopAllSounds`, `changeMusic`, layered audio with per-layer buffers); `DataManager`, `ResourceManager`/`ResourceLoader`, `RecordManager` (database access by attribute), `ObjectManager`, `UIManager`, `LanguageManager`, `VariableStore`, `GameTemp`, `InterpreterContext`, plus value classes `Formula`, `Helper`, `Style`, `MessageSettings`, `Colors`, `Easings`.
- **`vn` module (only 7 classes):** `Object_Character`, `Object_Background`, `Object_Scene`, `Component_CharacterBehavior`, `Component_GameSceneBehavior`, `Component_Live2D`, `Component_MessageBehavior`. (Everything else — managers, interpreter, base objects — is in `gs`.)
- **Object/Component system:** `gs.Object_Base` is the root game object; objects (`vn.Object_Character`, `vn.Object_Background`, `vn.Object_Scene`, `gs.Object_Picture`, `gs.Object_Text`, `gs.Object_Message`, `gs.Object_Video`, `gs.Object_Hotspot`, `gs.Object_ImageMap`, `gs.Object_Live2DCharacter`, layout objects) are composed of **components** (`Component_Sprite`/`Component_Visual` for rendering, `Component_Animator` + many `*Animation` components for tweens, `Component_*Behavior` for logic, `Component_CommandInterpreter` for command processing). Serialization is uniform: `toDataBundle()` / `restore(data)`. `vn.Object_Character` adds properties `animator`, `behavior`, `expression`, `image`, `mask`, `mirror`, `rid`, `srcRect`, `tone`, `visual`, `zIndex`.
- **Command interpreter internals:** `assignCommand()` is the override point; execution loop is `update()` → `executeCommand()` (runs command at `pointer`, increments it); flow via `pointer`, `indent`, `skip(indent, backward)`, `loops`, `conditions`, `waitCounter`, `subInterpreter`. Helpers: `numberValueOf` / `stringValueOf` / `booleanValueOf` / `listObjectOf` (resolve constant-or-variable), setters by index/scope, `compare(a, b, operation)` (0=Equal … 5=Less-or-Equal), `callCommonEvent(id, params, wait)`, `callScene(uid)`, generic object manipulators (`moveObject`, `showObject`, `tintObject`, `zoomObject`, `blendObject`, `flashObject`, `maskObject`, etc.). There is roughly one `command*` method per built-in editor command (≈200: `commandShowMessage`, `commandShowChoices`, `commandPlayMusic`, `commandChangeScene`, `commandCondition`, `commandLoop`, `commandScript`, `commandJumpToLabel`, the `commandList*` family, the Live2D `commandL2D*` family, etc.).
- **Per-frame loop:** `GameManager.update()`, `SceneManager.update()`, `AudioManager.update()`, and `Component_CommandInterpreter.update()` are each called once per frame.

### Tech stack & lineage
- VNM shares clear DNA with **RPG Maker MV/MZ** (same publisher, same forum community, comparable event-command model and plugin philosophy). RPG Maker MV/MZ plugin conventions are the best-documented reference for parameter UIs: plugins are `.js` files in `js/plugins`, registered in `js/plugins.js` (name + parameters), wrapped in IIFEs, with metadata in `/*: ... */` header comments using annotations `@param`, `@text`, `@desc`, `@default`, `@type` (number, boolean, string, file, struct, select with `@option`, variable, actor, etc.), `@parent`, `@command`, `@arg`, plus MZ additions `@target`, `@base`, `@orderAfter`, `@orderBefore`, `@url`. Parameters are read via `PluginManager.parameters(name)` (all strings; convert as needed). Engine state lives in globals like `$gameVariables`, `$dataMap`; plugins extend behavior by **aliasing** prototype methods (`var _old = Class.prototype.m; Class.prototype.m = function(){ _old.call(this); /* ... */ }`).
- **Runtime migration:** VNM moved its game runtime from NW.js to Electron "for better startup time, memory usage, performance and Apple M1/Big Sur+ support," warning that NW.js-specific commands/extensions may break and that AppData save location changed from Local to Roaming.
- **Export/deploy:** A platform-independent export step (non-customizable) followed by per-platform build phases (customizable via command lines with variables like `$(NODE)`, `APP_DIR`, `PROJECT_DIR`, `OUTPUT_DIR`, `PACKAGE_ID`). Targets: Windows, macOS, Linux, Android (Cordova / Play Store), iOS, SteamOS, Web. The desktop package ships the full NW.js/Electron runtime plus an `index.html` entry point and a `package.json`; "all games are digitally signed."

### Security model lessons from comparable systems
- **Obsidian:** Plugins are NOT sandboxed; they "inherit Obsidian's access levels" — full filesystem, network, and ability to install programs. Defaults: **Restricted Mode** (community plugins off until the user explicitly enables them). Manifest (`manifest.json`) declares `id`, `name`, `author`, `version`, `minAppVersion`, `description`, `isDesktopOnly`. Per Obsidian Help (Plugin security): "Obsidian automatically scans every plugin version for security vulnerabilities, code quality issues, and malware. Each plugin's page in the plugin directory displays the results as a safety scorecard. Manual reviews continue for popular, featured, and flagged plugins." The 2026 **PHANTOMPULSE** RAT campaign (Elastic Security Labs, campaign REF6598, "Phantom in the vault") weaponized the **plugin-sync feature**: a synced `data.json` for the "Shell Commands" plugin at `.obsidian\plugins\obsidian-shellcommands\data.json` — Elastic reports "Once those steps were completed, the Shell Commands plugin and its data.json configuration synced automatically, and on the next configured trigger, the payload executed without any further interaction." This is the canonical proof that the SHARING/SYNC channel, not local execution, is the real cross-user vector.
- **VS Code:** Extensions run in a separate **Extension Host** process (isolation so they can't crash the editor); declare contributions statically in `package.json` (`contributes`, `activationEvents`, `engines.vscode`); `<publisher>.<name>` IDs; activation is lazy (e.g., `onCommand:`, `onLanguage:`, `onView:`). The DOM is deliberately NOT exposed; the API surface is small and controlled.
- **Figma:** Per the Figma Blog ("An update on plugin security"), after Sept 2019 Realms-shim sandbox-escape vulnerabilities (disclosed by Agoric), Figma "disabled publishing updates to existing plugins" on Sept 18 and shipped a new runtime Sept 25, 2019: "We no longer use the Realms shim at all. We now use QuickJS, a JavaScript VM written in C and cross-compiled to WebAssembly… it's not possible to confuse objects from outside with objects from inside because the object representations are too different." UI runs in a null-origin `<iframe>` communicating via message passing; network access is gated by a manifest `networkAccess.allowedDomains` (CSP-enforced). Figma also notes: "all new Figma plugins have to be manually reviewed and approved by us before they appear in the community hub… plugin code in Figma is live, which means updates to existing plugins instantly propagate to all open clients" — so Figma halts reviews/updates as an incident lever.
- **Electron:** Per the official docs, "Context Isolation is the default behavior in Electron since 12.0.0." Best practice is `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and exposing only a narrow API through `contextBridge.exposeInMainWorld` using "one method per IPC message." Never expose raw `ipcRenderer`; whitelist channels and validate all arguments in both preload and main. The v8 "patch gap" means context isolation is not a hard security boundary against native memory-corruption exploits.

## Details: Functional Requirements

### A. Scripting system (visual command layer)
- **A1.** Provide a hierarchical project model: `Project → Chapters → Scenes → SceneContent[] (commands)`, with sub-scene nesting and per-scene properties (including a Live-Preview toggle).
- **A2.** Provide a command **toolbox** with categories (Message, Basic, System, Objects, Audio, Flow, Custom, plus any plugin-contributed categories). Support click-to-add, drag-and-drop, keyboard auto-complete by typing a command name, insert-before/after, indent/outdent (tabbing under control commands), and disable/enable of commands.
- **A3.** Implement the variable system: scopes Local/Global/Persistent; types String/Number/Boolean(Switch)/List(+Decimal handling); domains for namespacing; references/pointers; reset/range operations.
- **A4.** Implement flow control commands: Condition/Else/Else-If, Loop/Break-Loop, Loop-For (iterate a list), Label/Jump-to-Label, value-conditional jumps, Wait, Wait-for-Input, Idle, Comment, timers.
- **A5.** Implement the **Script command** for inline TypeScript/JavaScript with access to the engine API (see E).
- **A6.** Implement **Text Codes** (inline interpolation/markup) and **Text Macros** (TextCode / PlaceholderScript / Script modes). Provide a documented, namespaced, escapable syntax.
- **A7.** Implement Common Events (callable/parallel/auto-trigger event lists with optional parameters).
- **A8.** Serialize each command as `{ id, params, ...presentation }` and each scene/chapter as JSON (see schemas in D).

### B. Plugins system (runtime/game-engine layer)
- **B1.** Ship the game runtime as a set of **editable/overridable engine modules** (TypeScript classes) with stable names mirroring VNM's role split (managers, objects, components, interpreter).
- **B2.** A plugin is a folder + manifest (see D) whose entry module is loaded into the running game. Support **load order**, enable/disable, and **dependencies** (`@base`/`orderAfter`/`orderBefore` equivalents).
- **B3.** Provide a **parameter system**: plugins declare typed, default-valued parameters; the editor renders a config UI from that metadata; values are persisted per-project and read at runtime via a typed API (your TS equivalent of `PluginManager.parameters`). Support types: number, boolean, string, multiline text, file/resource, color, select(options), variable-reference, struct, and arrays of these.
- **B4.** Provide lifecycle hooks: `onLoad`/`activate`, `onGameStart`, `onSceneCreate`/`onSceneStart`, per-frame `onUpdate`, `onSaveBundle`/`onRestoreBundle`, `onUnload`/`deactivate`.
- **B5.** Provide first-class **command registration** so a plugin adds both the editor command (config UI) AND its runtime behavior without monkey-patching a central interpreter (improve on VNM's class-reassignment pattern with a registry; see E3).
- **B6.** Expose the rendering layer (PIXI-style scene graph), audio (layered music/sound/voice), and input through the engine API.

### C. Extensions system (editor layer + packaging)
- **C1.** Provide an **Extension Editor** where developers create: Data Record Views (database categories), Scene Commands, Custom Views (reusable/partial/popup UI), JS/TS files, custom UI controls (VNM's Objective-J analog), Script Agents (menu-bar tools), and Language Bundles.
- **C2.** Define views/commands declaratively (JSON/TSX) with typed items, `attribute` data binding, `valueFormula` display logic, sections/frames/label-groups, and Preview.
- **C3.** Provide an **Extension Composer**: select documents + game-engine scripts + resources, fill manifest (identifier, company, name, version, author, URL, install script, uninstall script, description, license), emit an installable package (`.zip`/your format).
- **C4.** Provide install/uninstall scripts for data migrations and cleanup, and an **Extension/Plugin Manager UI** to install (from file), enable/disable, order, and configure.
- **C5.** Editor extensions must be able to add: panels, menu commands, toolbar tools, custom database tabs, custom resource types, and dialogs.

### D. Data models / schemas (recommended TS shapes)

```typescript
// ---- Scene / command model ----
interface Project { id: string; chapters: Chapter[]; database: Record<string, DataRecord[]>; settings: ProjectSettings; }
interface Chapter { uid: string; name: string; scenes: Scene[]; }
interface Scene { uid: string; name: string; content: Command[]; subScenes?: Scene[]; properties: SceneProperties; }
interface Command {
  id: string;            // e.g. "core.showMessage" or "ext.showCard"
  params: Record<string, unknown>;
  indent?: number;       // nesting under control commands
  disabled?: boolean;
  group?: string;        // object group namespace, default "@default"
}

// ---- Variable model ----
type VarScope = "local" | "global" | "persistent";
type VarType  = "string" | "number" | "boolean" | "list";
interface VariableRef { scope: VarScope; type: VarType; index: number; domain?: string; }

// ---- Plugin manifest (package.json-style) ----
interface PluginManifest {
  id: string;                 // reverse-domain unique id
  name: string; version: string; author: string; url?: string; description?: string;
  engineVersion: string;      // semver compat range
  main: string;               // entry module
  target: "runtime" | "editor" | "both";
  dependencies?: { id: string; version?: string }[];
  orderAfter?: string[]; orderBefore?: string[];
  parameters?: ParamSpec[];
  contributes?: {
    commands?: CommandContribution[];
    databaseCategories?: DataRecordViewSpec[];
    panels?: PanelContribution[];
    menus?: MenuContribution[];
    resourceTypes?: ResourceTypeSpec[];
    languageBundles?: string[];
  };
  permissions?: PluginPermissions;   // see security section
  license?: string;
}

interface ParamSpec {
  key: string; type: ParamType; label?: string; desc?: string;
  default?: unknown; min?: number; max?: number; decimals?: number;
  options?: { label: string; value: unknown }[];   // for "select"
  struct?: ParamSpec[];                              // for "struct"
  itemType?: ParamType;                              // for arrays
  parent?: string;                                   // grouping
}
type ParamType = "number"|"boolean"|"string"|"text"|"file"|"color"|"select"|"variable"|"struct"|"array";

// ---- Scene command contribution ----
interface CommandContribution {
  id: string; group: string; displayName: string; windowTitle?: string;
  defaultValue: Record<string, unknown>;
  quickItems?: ViewItem[]; fullSizeItems?: ViewItem[];
  runtime: string;   // module path/export implementing the command behavior
}
interface ViewItem {
  type: string; attribute?: string; label?: string;
  valueFormula?: string;            // JS/TS returning display text
  frame?: [number, number, number?, number?];
  dataSource?: string; min?: number; max?: number; multiline?: boolean;
  variableButton?: { dataSource: string };
  defaultValue?: unknown;
}

// ---- Database category (Data Record View) ----
interface DataRecordViewSpec {
  category: string;
  descriptor: { name: string; attribute: string; sections: { name: string; items: ViewItem[] }[] };
}
```

### E. API surface to expose to plugins & extensions
- **E1. Managers (runtime):** `game` (GameManager: settings, save/load, `newGame`, `save(slot, w, h)`, `load(slot)`, state bags `tempFields`, `sceneData`, `backlog`, `globalData`), `scenes` (SceneManager: `switchTo(scene, savePrevious, cb)`, `returnToPrevious`, `clear`), `audio` (AudioManager: `playMusic`/`playSound`/`playVoice`/`stop*`, layered), `resources`, `records` (database by attribute), `objects`, `ui` (UIManager + layouts/styles), `language`, `variables` (VariableStore). Each `update()`-driven manager runs once per frame.
- **E2. Lifecycle hooks** (see B4) registered via a typed `EnginePlugin` interface; an `EditorExtension` interface for editor-side `activate(ctx)`/`deactivate()` receiving an editor context object (the VS Code `ExtensionContext` analog).
- **E3. Command registry (improve on VNM):** `engine.commands.register({ id, runtime })` and `editor.commands.register(contribution)` instead of reassigning a global interpreter class. Internally the interpreter dispatches by `command.id` to the registry; flow primitives (`pointer`, `indent`, `skip`, `loops`, `conditions`, `waitCounter`, sub-interpreters) remain engine-owned. Provide value resolvers (`numberValueOf`/`stringValueOf`/`booleanValueOf`/`listObjectOf`), `compare(a,b,op)`, `callCommonEvent`, `callScene`, and object manipulators.
- **E4. Editor registration:** `registerDatabaseCategory`, `registerSceneCommand`, `registerPanel`, `registerMenuCommand`, `registerToolbarTool`, `registerResourceType`, `registerCustomView`, `registerScriptAgent`, `registerLanguageBundle`.
- **E5. Object/Component model:** expose `Object_Base` + component composition with uniform `toDataBundle()`/`restore()` serialization so plugin objects participate in save/load.

### F. Parameter / config UI system
- Render editor config forms automatically from `ParamSpec[]` (B3) and from scene-command `quickItems`/`fullSizeItems` (`ViewItem`). Support label groups, frames/auto-sizing (-1), `valueFormula` live display text, and the **variable button** affordance (any field can be driven by a variable: number/string/switch/list data sources). Persist plugin parameter values per-project (analogous to VNM's `plugins.js`/internal JSON). Provide a Preview for views and commands.

### G. Distribution / packaging
- Package an extension as a signed archive containing: `manifest.json`, editor documents (views/commands/custom views), runtime modules, resources, language bundles, optional install/uninstall scripts. The Extension/Plugin Manager installs from file, verifies signature/manifest, runs the install script, and registers contributions. On export, bundle enabled plugins/extensions into the deployed game (runtime modules + parameters) the way VNM ships engine scripts inside the exported package alongside `index.html` and the Electron runtime.

### H. Recommended architecture on React + Electron + TypeScript
- **Editor app:** React/TSX renderer. Editor extensions contribute UI via a contribution registry; render extension panels/views from declarative specs (preferred) or from sandboxed extension React components. Mirror VS Code: keep your own core DOM/component library; extensions contribute through typed registration, not raw DOM surgery, to keep the app evolvable.
- **Extension host isolation:** Run editor-extension JS in a dedicated context (a hidden `BrowserWindow`/`utilityProcess` "extension host," or a separate renderer world) that talks to the editor through an audited IPC/`contextBridge` API — the VS Code Extension-Host pattern. This isolates crashes and centralizes the API surface.
- **Game runtime:** A React/Canvas (PIXI) renderer window. Plugin runtime modules load into the game context. Because your trust model is FULL local trust, you MAY allow plugin code Node/file access locally — but route it through a preload `contextBridge` with **per-method** functions and argument validation rather than exposing raw `ipcRenderer`/`require`.
- **Per-frame loop & registries:** central `update()` loop drives managers and the interpreter; command dispatch via the registry (E3).

## Recommendations (staged)

**Stage 1 — Core scripting MVP (no third-party code yet).**
Build the project/chapter/scene/command model (D), the visual command toolbox with categories + indent/disable, the variable system (3 scopes × 4 types + domains), flow control (Condition/Loop/Label/Wait), Text Codes + Macros, and the built-in command set (message, choices, objects, audio, scene/flow). Ship the Script command wired to the engine API (E1). Benchmark to advance: a non-coder can build a branching, variable-driven VN entirely in the GUI, and a coder can drop inline TS that reads/writes variables and moves objects.

**Stage 2 — Runtime plugins + parameter UI.**
Implement `EnginePlugin` interface, lifecycle hooks (B4), the command **registry** (E3 — do NOT copy VNM's global-class-reassignment; use a registry), and the parameter system + auto-generated config UI (F). Define `PluginManifest`. Benchmark: a third-party plugin can add a new scene command (editor UI + runtime behavior) and expose typed parameters that render in the editor and are readable at runtime.

**Stage 3 — Editor extensions + Composer + Manager.**
Add the Extension Editor (data record views, scene commands, custom views, panels, menus, script agents, language bundles), the Extension Composer (manifest + packaging to signed archive), install/uninstall scripts, and the Extension/Plugin Manager UI (install-from-file, enable/disable, order, configure). Benchmark: a user installs a `.zip` extension that adds a database category + a scene command + an editor panel, then exports a game that bundles it.

**Stage 4 — Security hardening & (optional) sharing channel.**
Lock down the cross-user vectors (next section). Only after that, consider an optional marketplace/sync. Benchmark to ship a marketplace: manual review pipeline live, plugin code provably unable to reach the updater/marketplace/sync APIs, signed packages, and an incident "kill switch" (halt reviews/updates) exists.

**Thresholds that change the plan:** If you ever enable plugin auto-update or vault/project sync of plugin code/config (the Obsidian PHANTOMPULSE vector), you MUST add manual review + signing + provenance BEFORE enabling it. If you decide to weaken the full-trust model (e.g., for a web build), adopt Figma's QuickJS-in-WASM + null-origin iframe + `networkAccess.allowedDomains` model for true sandboxing.

## Security / Sandboxing: the full-trust-but-no-cross-user-poisoning model
Your constraint: local arbitrary code is fine; the app must never become a vector to harm OTHER users. Concrete requirements:

1. **Local execution = full trust, explicit opt-in.** Like Obsidian, allow plugins full local capability but keep third-party plugins **disabled by default** (Restricted-Mode analog) with a clear trust prompt and per-plugin enable. Show provenance (author, source, version, signature status).
2. **Isolate the app's own shared infrastructure from plugin reach.** This is the crux. The **auto-updater, any cloud sync/backup of projects, any marketplace/publish API, telemetry, and any "share to other users" channel** must live behind IPC/main-process boundaries that are NOT exposed to plugin code. Plugins get a `contextBridge` API that deliberately omits: update-feed writes, marketplace publish, sync-config mutation, and any method that could auto-distribute the plugin or alter what other users receive. (Direct lesson from Obsidian's PHANTOMPULSE/REF6598: the synced `data.json` config channel — not local code — was the weapon.)
3. **No self-propagation.** A plugin must not be able to write into the install/update directory, modify other installed plugins, register itself for auto-distribution, or inject content into shared/synced project data that auto-executes on another user's machine. Treat any project/plugin data that can be shared as **untrusted on import**: never auto-run install scripts or plugin config from imported/synced projects without explicit user consent (Obsidian's mistake was the synced plugin config applying automatically on the next trigger).
4. **Electron hardening.** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for any window that can render untrusted content; expose only **per-method, argument-validated** functions via `contextBridge` ("one method per IPC message"); never pass raw `ipcRenderer`; whitelist IPC channels; validate in preload AND main. Be aware context isolation is not a hard boundary against native v8 exploits — so the real guarantee is architectural (no shared-channel reach), not VM-level.
5. **Signing + review only for shared channels.** Local sideloaded plugins need no review (full trust). But ANY plugin that flows through an app-operated channel (marketplace, featured list, sync) must be **signed**, **manually reviewed** (Figma/Obsidian model), and **scanned** (Obsidian's automated malware/vuln scan + safety scorecard). Keep an incident kill-switch: halt publishing/updates instantly (Figma's lever — it disabled plugin updates within days of the 2019 disclosure), since shared-channel updates can propagate live.
6. **Provenance & integrity.** Sign packages; verify signature + manifest on install; record a content hash; surface "this plugin can run arbitrary code on your machine" at install. For the optional marketplace, require a security-disclosure form (Figma model) describing data/network practices.

## Comparisons & lessons (condensed)
- **RPG Maker MV/MZ** → best blueprint for the **parameter/annotation UI** and the **alias/override** runtime pattern; but its central-class monkey-patching and "notetag" workarounds are anti-patterns — replace with a typed command registry and first-class editor contributions (which is exactly what VNM's Extensions improved on, per MoeGamer).
- **VS Code** → adopt the **Extension Host process isolation**, **declarative `contributes` manifest**, **lazy activation events**, and **"don't expose the DOM; expose a controlled API"** discipline.
- **Obsidian** → validates the **full-trust local model with opt-in Restricted Mode + automated scanning + scorecards**; its PHANTOMPULSE incident (Elastic REF6598) is the canonical warning that the **sync/sharing channel** is the cross-user vector you must wall off.
- **Figma** → if you ever need true sandboxing (web build or untrusted marketplace execution), use **QuickJS-in-WASM + null-origin iframe UI + manifest-gated network allowlist + mandatory pre-publish review + live-update kill-switch**.

## Caveats
- VNM's editor extensions use **Objective-J** and a bespoke JSON view system; this spec maps those concepts onto React/TSX rather than reproducing Objective-J. Some VNM internals (exact serialization of the entire project, full IGUI control catalog, complete Text Code list) are only partially documented publicly; treat the schemas here as faithful reconstructions, not byte-exact replicas — and since you do not need VNM compatibility, that is acceptable.
- VNM's documentation predates its NW.js→Electron migration in places; some references (e.g., NW.js `package.json`, digital signing specifics) reflect the older runtime. Validate against current Electron APIs when implementing.
- The "≈200 commands" figure is a count observed in VNM's published `Component_CommandInterpreter` API docs and may include documentation-generation duplicates; use it as a scale indicator, not an exact total.
- The full-trust model means you are accepting that a malicious local plugin CAN harm the local user's machine — by design. The spec only guarantees the app won't amplify that harm to OTHER users. Make this trade-off explicit to users at install time.