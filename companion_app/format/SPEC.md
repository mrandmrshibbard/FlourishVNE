# The `.vnbundle` Format — Specification

**`bundle_format_version`: `0.1.0`** (pre-1.0: the format may still change between minor versions; the
version gate exists so old bundles fail loudly instead of silently misbehaving.)

This is the **contract** between the FlourishVNE authoring engine and every downstream runtime (the
Godot console runtime first; potentially a cleaner web/mobile player later). It is **declarative data
only** — no engine code, no JavaScript behavior, no web-stack assumptions. A runtime *interprets* this
data; it never executes anything from the bundle.

Governed by [`console-porting-architecture-spec.md`](../console-porting-architecture-spec.md) §4 and
scoped by [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md). Where this and the guardrail spec
disagree, the guardrail spec's §1 boundaries win.

> **Design principle.** The FlourishVNE `.flourish` file already contains a declarative IR
> (`project.json`). The `.vnbundle` is a **normalized, de-web-ified projection** of it: web/Electron
> assumptions (data-URLs, `flourish-asset://`, `localStorage`, DOM/CSS) are lifted out into explicit
> data or real files. This spec defines the *target* shape; the exporter (a later phase) produces it.

---

## 1. Container & layout

A `.vnbundle` is a **ZIP archive** (or a plain folder during development) with this fixed layout:

```
mygame.vnbundle/
├── manifest.json              # format version, metadata, entry point, capability flags, file map
├── script/
│   ├── scenes.json            # the scene graph: commands (nodes) per scene
│   ├── variables.json         # declared variables + initial values
│   └── logic.json             # reusable command sequences (common events)
├── characters/
│   └── characters.json        # character defs: sprite states, name color, per-character font/box
├── ui/
│   └── layout.json            # UI: dialogue box, choice menu, backlog, settings, custom screens
├── assets/
│   ├── images/                # backgrounds, sprites, CGs, UI art
│   ├── audio/                 # music, SFX, voice
│   ├── video/                 # movies / video backgrounds (Tier 2)
│   └── fonts/                 # .ttf/.otf/.woff
└── save-format.json           # DECLARED save schema (what persists) — not a runtime snapshot
```

- **Asset references** everywhere are **relative POSIX paths** rooted at the bundle (e.g.
  `assets/images/yuki_neutral.png`). Never `data:` URLs, never `flourish-asset://`, never absolute or
  remote URLs. A runtime maps them to its own scheme (Godot: `res://`).
- All JSON is UTF-8, no BOM.
- IDs are stable strings (`^[A-Za-z0-9_\-]+$`), unique within their collection.

---

## 2. `manifest.json`

The single entry point. A runtime reads this first, checks the version, then loads the referenced files.

```json
{
  "bundle_format_version": "0.1.0",
  "generator": { "name": "hand-authored", "version": "0" },
  "game": {
    "id": "hello_world",
    "title": "Hello World",
    "author": "Brad",
    "version": "1.0.0",
    "description": "A tiny sample."
  },
  "entry": { "scene": "start" },
  "resolution": { "width": 1280, "height": 720 },
  "capabilities": {
    "scripts": false, "plugins": false,
    "miniGames": false, "phone": false, "inventory": false, "maps": false,
    "video": false, "particles": false
  },
  "files": {
    "scenes": "script/scenes.json",
    "variables": "script/variables.json",
    "logic": "script/logic.json",
    "characters": "characters/characters.json",
    "ui": "ui/layout.json",
    "save": "save-format.json"
  }
}
```

- **`entry.scene`** must be an id present in `scenes.json`.
- **`capabilities`** declares which optional subsystems the game actually uses. This lets a runtime or
  the converter say, in plain language, "this game uses [X], which the console runtime doesn't cover
  yet." For the **v1 console target**, `scripts`, `plugins`, `miniGames`, `phone`, `inventory`, and
  `maps` **must be `false`** — a bundle that sets any of them `true` is a valid bundle but is flagged
  **not-yet-console-portable** (see §9). `video` and `particles` are Tier-2 features that v1 supports.
- **`files`** maps logical roles to paths (all relative). Absent optional files (e.g. no common events)
  may be omitted from the map.

---

## 3. Variables — `script/variables.json`

```json
{
  "variables": [
    { "id": "met_yuki", "name": "met_yuki", "type": "boolean", "default": false, "scope": "global",
      "trueLabel": "Met", "falseLabel": "Not met" },
    { "id": "brave", "name": "brave", "type": "number", "default": 0, "scope": "global", "min": 0, "max": 10 },
    { "id": "player_name", "name": "player_name", "type": "string", "default": "", "scope": "persistent" }
  ]
}
```

- **`type`**: `"string" | "number" | "boolean"`.
- **`scope`**: `"local"` (reset per scene) · `"global"` (persists across the playthrough) ·
  `"persistent"` (survives new-game; stored separately — see §7).
- `min`/`max` apply to numbers; `trueLabel`/`falseLabel` are display aliases for booleans.
- `default` type must match `type`.

Text shown to the player may interpolate variables with `{name}` (e.g. `"Hi, {player_name}!"`).

---

## 4. Scenes & command nodes — `script/scenes.json`

```json
{
  "scenes": [
    {
      "id": "start",
      "name": "Opening",
      "commands": [ /* nodes, executed top-to-bottom */ ],
      "outTransition": { "type": "fade", "durationMs": 500 }
    }
  ]
}
```

A scene's `commands` is an ordered list of **nodes**. Every node has:

```
{ "id": "<unique-in-scene>", "type": "<nodeType>", "if": [ <condition>… ], ...typeSpecificFields }
```

- **`id`** — unique within the scene.
- **`if`** — optional condition list (§5). Absent/empty = always runs. A node whose `if` is false is
  skipped.
- Unknown/spec-reserved `type`s are a validation error in v1 (except where a capability flag admits
  them — see §9).

### 4.1 Conditions (§5) and inline var-sets

See §5 for the condition model and §6 for the action/var-set model, both referenced throughout.

### 4.2 Core control-flow nodes (Tier 1 — fully specified, must be supported)

| `type` | Fields | Meaning |
|---|---|---|
| `say` | `speaker?` (characterId or null for narration), `name?` (override displayed name), `text` (string, `{var}` ok), `voice?` (audio path), `effects?` (§4.4) | A line of dialogue/narration. |
| `choice` | `prompt?`, `options: [ Option ]` | Present choices. **Option** = `{ text, if?: [cond], goto?: sceneId, gotoLabel?: label, set?: [VarSet], actions?: [Action] }`. `goto`/`gotoLabel` are shorthand jumps; `set` applies var changes; `actions` (§6) covers the long tail. An option with none of goto/gotoLabel/actions simply continues. |
| `set` | `var`, `op?` (default `"set"`), `value?` | Change a variable (§6 VarSet ops). |
| `jump` | `scene`, `atLabel?` | Jump to another scene (optionally at a label). |
| `label` | `name` | A named jump target within a scene. |
| `jumpToLabel` | `label` | Jump to a label in the current scene. |
| `branch` | `branches: [ { if?: [cond], else?: true, commands: [node] } ]` | If/else-if/else. First branch whose `if` passes (or the `else`) runs its nested `commands`. |
| `callCommonEvent` | `event` (id in `logic.json`) | Run a reusable command sequence, then continue. |
| `wait` | `ms?`, `forCondition?: [cond]` | Pause for a duration, or until a condition becomes true. |
| `group` | `name?`, `commands: [node]` | Visual grouping only; the runtime executes the children in order. |
| `textInput` | `var`, `prompt?`, `maxLength?` | Prompt the player for text; store into `var`. |

### 4.3 Core stage nodes (Tier 1 — fully specified)

| `type` | Fields |
|---|---|
| `showCharacter` | `character`, `sprite?` (defaults to the character's default), `position?` (`{ x, y }` in 0..1 or a named slot), `transition?` |
| `hideCharacter` | `character`, `transition?` |
| `setCharacterSprite` | `character`, `sprite` |
| `moveCharacter` | `character`, `to: { x, y }`, `durationMs?`, `easing?` |
| `setBackground` | `image` (asset path) or `null`, `transition?` |
| `playMusic` | `audio`, `loop?` (default true), `fadeMs?`, `volume?` (0..1) |
| `stopMusic` | `fadeMs?` |
| `playSound` | `audio`, `volume?` |
| `stopSound` | `audio?` (absent = all SFX) |

A **`transition`** is `{ "type": "cut" | "fade" | "dissolve" | "slide…", "durationMs"?: number }`.

### 4.4 Text effects (Tier 2)

`say.effects` is an optional list of per-span or whole-line effects:
`[ { "effect": "shake" | "wave" | "rainbow" | "glitch" | "fade" | …, "from"?, "to"?, "params"?: {} } ]`.
Runtimes implement the effects they support and ignore unknown ones (forward-compatible).

### 4.5 Tier-2 presentation nodes (enumerated; `params` passthrough)

These are **valid in v1** but their detailed `params` are refined as the runtime implements each one.
Shape: `{ id, type, if?, ...knownFields, params?: {} }`.

`showImage` · `hideImage` · `showText` · `hideText` · `showButton` · `hideButton` · `showHotSpot` ·
`hideHotSpot` · `tween` (`target`, `to`, `durationMs`, `easing?`) · `creditRoll` · `playMovie`
(`video`, `loop?`) · `stopMovie` · `shakeScreen` · `tintScreen` · `panZoomScreen` ·
`resetScreenEffects` · `flashScreen` · `setScreenOverlay` (`effect`, `params?`) · `spawnParticles` ·
`stopParticles` · `lightning` · `flashlight` · `fireworks` · `placeLights` · `clearLights` ·
`showScreen` (`screen`) · `setTimeOfDay` (`params?`).

### 4.6 Reserved node types (NOT valid in a v1 bundle)

Deferred subsystems. A v1 bundle must not contain these; they're reserved so the format can grow
without renumbering. Their presence requires the matching capability flag and marks the bundle
not-yet-console-portable (§9):

- **Tier 3 (deferred):** `showItem`, `giveItem`, `useItem`, `destroyItem`, `restockCollection`,
  `buyItem`, `sellItem`, all `phone*` nodes, `showMap`, `showMiniGame`, `startTimer`, `stopTimer`.
- **Tier X (no clean mapping):** `runScript` (inline JS) and any plugin-provided node.

---

## 5. Condition model

A condition list is evaluated **left-to-right with no operator precedence** (mirrors the engine).
Each item after the first carries a `join` telling how it combines with the running result.

```json
"if": [
  { "var": "brave", "op": ">", "value": 2 },
  { "join": "and", "var": "met_yuki", "op": "is true" }
]
```

- **`op`**: `"==" | "!=" | ">" | "<" | ">=" | "<=" | "is true" | "is false" | "contains" | "startsWith"`.
- `value` is required for all ops **except** `"is true"` / `"is false"`.
- **`join`**: `"and" | "or"`; ignored on the first item.
- `var` must reference a declared variable id.

---

## 6. Action & var-set model

**VarSet** (used by `set` nodes and choice `set`):
`{ "var": "<id>", "op"?: "set" | "add" | "subtract" | "multiply" | "divide" | "toggle", "value"?: <literal> }`
— `op` defaults to `"set"`; `toggle` (booleans) takes no `value`.

**Action** (choice `actions`, and reused by UI later). v1 supports this normalized subset; each action
may carry its own `if`:

| `action` | Fields |
|---|---|
| `setVar` | `var`, `op?`, `value?` |
| `resetVar` | `var` |
| `jumpToScene` | `scene`, `atLabel?` |
| `jumpToLabel` | `label` |
| `playMusic`/`stopMusic`/`playSound`/`stopSound` | as §4.3 |
| `showScreen` | `screen` |
| `save`/`load`/`deleteSave` | `slot?` |

Actions outside this subset (inventory, phone, timers, script) are **reserved** and gated by
capabilities (§9), exactly like the reserved nodes.

---

## 7. Save schema — `save-format.json`

Declares **what persists**, so each runtime implements native persistence against it (console
certification forbids the web's `localStorage`). This is a *schema*, never a runtime snapshot.

```json
{
  "save_schema_version": "0.1.0",
  "persist": {
    "position": true,
    "variables": { "scopes": ["global", "persistent"] },
    "visitedScenes": true,
    "playTime": true,
    "stage": true,
    "music": true
  },
  "persistentVariablesSeparate": true,
  "slots": { "count": 10, "autosave": true }
}
```

- **`position`** — current scene id + command index + the common-event call stack, so a load resumes
  exactly. (Local-scope variables ride the scene; they are *not* persisted independently.)
- **`variables.scopes`** — which scopes are written into a save. `persistent`-scope variables are also
  stored separately (`persistentVariablesSeparate: true`) so they survive starting a new game.
- **`stage`** — background + on-screen characters + basic stage state, so a load restores the scene
  visually.
- **Deliberately transient (never saved), matching the engine:** mini-game / map / choice progress —
  a save taken mid-choice re-presents that choice on load rather than storing partial state. (These are
  Tier-3/deferred in v1 anyway.)

---

## 8. Characters — `characters/characters.json`

```json
{
  "characters": [
    {
      "id": "yuki",
      "name": "Yuki",
      "nameColor": "#ee2299",
      "defaultSprite": "neutral",
      "sprites": [
        { "id": "neutral", "image": "assets/images/yuki_neutral.png" },
        { "id": "smile",   "image": "assets/images/yuki_smile.png" }
      ],
      "font": "assets/fonts/yuki.ttf",
      "textbox": null
    }
  ]
}
```

- Each expression becomes a **named sprite state**. A sprite is either a single flat `image`, or a
  `layers` array of image paths drawn **bottom-to-top** (base first) — the engine's characters are
  layered (a base + configured layer assets per expression), and `layers` preserves that losslessly
  without pre-compositing. `defaultSprite` must be one of `sprites[].id`.
- `nameColor`, `font`, and per-character `textbox` overrides are optional.

---

## 8b. Custom UI screens — `ui/layout.json`

Besides the dialogue box + choice menu, a game can have **custom screens** (title / main menu, pause,
save, load…). `ui.titleScreen` is the screen id shown **on launch** (the main menu); `saveScreen`,
`loadScreen`, `settingsScreen`, `pauseScreen` name the others. `ui.screens` is the list:

```json
{
  "titleScreen": "screen-title",
  "screens": [{
    "id": "screen-title", "name": "Title Screen",
    "background": "assets/backgrounds/menu.png", "backgroundColor": "#000000", "music": "assets/audio/theme.mp3",
    "elements": [
      { "type": "image",  "x": 5, "y": 6, "w": 90, "h": 40, "anchorX": 0, "anchorY": 0, "image": "assets/images/logo.png" },
      { "type": "text",   "x": 50, "y": 20, "w": 60, "h": 10, "anchorX": 0.5, "anchorY": 0.5, "text": "My Game", "font": "assets/fonts/title.ttf", "fontSize": 48, "color": "#ffffff" },
      { "type": "button", "x": 50, "y": 55, "w": 20, "h": 8, "anchorX": 0.5, "anchorY": 0.5, "text": "New Game", "image": "assets/images/btn.png", "hoverImage": "assets/images/btn_hover.png", "action": { "action": "startNewGame" } }
    ]
  }]
}
```

- **Position** is `x`/`y`/`w`/`h` in **percent of the screen**, with `anchorX`/`anchorY` (0..1) the
  element's own pivot placed at (x, y).
- **Element types (v1):** `image` (`image` path, `objectFit`), `text` (`text` + optional `font`/
  `fontSize`/`color`), `button` (`text` + optional `image`/`hoverImage` + `font…` + one `action`),
  `saveSlotGrid` (`mode` save|load, `slotCount`, `emptySlotText`), `settingsSlider` (`setting`,
  `thumbColor`/`trackColor`), `settingsToggle` (`setting`, `text`). Galleries / character previews /
  hot zones aren't rendered in v1 and are dropped.
- **Button actions:** `startNewGame` · `goToScreen`(`screen`) · `back` · `returnToGame` ·
  `quitToTitle` · `quit` · `openUrl`(`url`) · `setVar`(`var`,`op`,`value`) · `jumpToScene`(`scene`) ·
  `none`.

---

## 9. Capabilities, versioning & validation rules

- **Version gate.** Runtime and converter both read `bundle_format_version` and **fail loudly** on a
  major/minor mismatch they don't support. `save_format.json` carries its own `save_schema_version`.
- **Capability gate.** If any `capabilities.*` for a deferred/Tier-X subsystem is `true` (or a reserved
  node/action appears), the bundle is still *structurally valid*, but tools must surface a plain-language
  warning: *"This game uses [scripts/mini-games/phone/…], which the console runtime doesn't support yet;
  those parts won't play. Remove or redesign them for a console build."* A console-targeted v1 export
  should have all deferred/Tier-X capabilities `false`.
- **Referential integrity** (checked by tooling): `entry.scene` exists; every `goto`/`jump`/`jumpToLabel`
  target resolves; every `character`/`var`/`audio`/`image`/`event` reference resolves; every asset path
  exists in `assets/`; ids are unique within their collection.

---

## 10. What this format intentionally is *not*

- Not a program. No embedded JS, no expressions beyond the declared condition/action model.
- Not web-shaped. No `data:`/`flourish-asset://`/`localStorage`/DOM assumptions survive export.
- Not the engine's save snapshot. Saves are declared as a schema; runtimes persist natively.
- Not console-specific. It targets *stock* runtimes; console specifics live entirely in the user's own
  Godot + W4 environment.

---

*End of `.vnbundle` v0.1.0 spec. Companion artifacts: `schemas/` (machine-checkable) and `samples/`
(hand-authored, validated by `validate.mjs`).*
