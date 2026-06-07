# FlourishVNE Scripting System

The Scripting System lets you write custom JavaScript logic that runs inside your visual novel. Scripts can manipulate variables, trigger scene jumps, play audio, show dialogue, and much more — all through a safe, sandboxed API.

---

## Getting Started

1. Open the **Script Editor** from the **Tools** menu in the header toolbar
2. Click **New Script** to create a script
3. Write your logic using the `game` API object
4. Save with **Ctrl+S** and test with the **▶ Test Run** button
5. Use the **Run Script** command in your scene timeline to execute a script during gameplay
6. Click **📖 API** in the editor toolbar for a clickable reference of every `game` method

> **About Test Run:** it executes your script against a *mock* game — variables start at their
> defaults and side-effects (dialogue, audio, navigation, `runScript`/`callCommonEvent`) are **printed
> to the console instead of actually happening**. It's for checking logic and catching errors. To see a
> script truly affect the game, run it from a **Run Script** command in **Test Play**.

---

## Script Triggers

Each script has a **trigger** that determines when it can run:

| Trigger | Description |
|---------|-------------|
| `command` | Runs when a **RunScript** command executes in the scene timeline. |
| `onSceneEnter` | Runs automatically **on every scene change, as the new scene begins**. These are *global* lifecycle hooks — they are not bound to a specific scene, so use `game.currentScene` / `game.currentSceneId` inside the script if you only want to act on certain scenes. Navigation calls (`jumpToScene`/`jumpToLabel`) from these scripts are ignored to prevent scene-change loops. |
| `onSceneExit` | Runs automatically **as you leave a scene** (just before the next one's enter hooks). Same global, not-scene-bound behavior as `onSceneEnter`. |
| `global` | Utility script — never runs on its own. Call it from another script with `game.runScript("Name")`. |

---

## The `game` API

Inside every script, a `game` object is available with the following methods and properties:

### Variables

```javascript
// Get a variable value by name or ID
let hp = game.getVariable("playerHP");

// Set a variable value
game.setVariable("playerHP", 100);
game.setVariable("playerName", "Alex");
game.setVariable("hasKey", true);
```

### Navigation

```javascript
// Jump to a different scene by name (or ID)
game.jumpToScene("Chapter 2");

// Jump to a label within the current scene
game.jumpToLabel("battle_start");
```

> Note: navigation is applied **after** the script finishes. Calling `jumpToScene`
> twice means the last call wins. Navigation from `onSceneEnter`/`onSceneExit`
> scripts is ignored (to avoid infinite scene-change loops).

### Calling Other Scripts & Common Events

```javascript
// Run another script (by name or ID). The 'global' trigger exists for exactly this.
game.runScript("ApplyDamage");

// Pass arguments — they arrive in the other script as game.args (see Parameters below)
game.runScript("ApplyDamage", { amount: 12, crit: true });

// Invoke a Common Event (by name or ID), optionally with arguments.
// When a script calls a Common Event, the event's command list runs next,
// then execution returns to where you were.
game.callCommonEvent("ShowQuestComplete", { questId: "q_07" });
```

### Dialogue & Notifications

```javascript
// Show a dialogue box (character name, text)
game.showDialogue("Narrator", "The adventure begins...");
game.showDialogue("Luna", "Watch out!");

// Show a notification toast
game.notify("Auto-saved!", "info");      // types: "info", "warning", "error", "success"
```

### Audio

```javascript
// Play a sound effect (name, optional volume 0-1)
game.playSFX("sword_clash", 0.8);

// Play background music (name, loop, optional volume)
game.playMusic("battle_theme", true, 0.5);

// Stop all music (optional fade duration in seconds)
game.stopMusic(2);
```

### Project Info (Read-Only)

```javascript
// The current scene's name and ID
let name = game.currentScene;     // e.g. "Chapter 1"
let sceneId = game.currentSceneId;

// A list of all scene names in the project
let scenes = game.getScenes();
// Returns: ["Chapter 1", "Chapter 2", ...]

// All variables as a { name: value } map (current values)
let vars = game.getVariables();
// Returns: { playerHP: 100, hasKey: false, ... }
// game.getAllVariables() is an alias of game.getVariables().
```

### Parameters (`game.args`)

A script can declare **parameters** in the Script Editor (name, type, default). When the
script is invoked — via a **RunScript** command, or `game.runScript(name, args)` — the
supplied arguments are exposed as a **read-only** `game.args` map (keyed by parameter name),
with defaults filled in for anything not supplied:

```javascript
// Script "ApplyDamage" declares params: amount (number, default 0), crit (boolean, default false)
let dmg = game.args.amount;
if (game.args.crit) dmg *= 2;

let hp = game.getVariable("enemyHP") - dmg;
game.setVariable("enemyHP", hp);
```

Arguments are **never** written into your project's variables, so there is no leakage
between calls — `game.args` is local to each invocation.

### Waiting

```javascript
// Pause this script for a number of seconds (returns a Promise).
// Note: native setTimeout/setInterval are blocked — use game.wait().
await game.wait(1.5);
```

### Inventory

If your project has **Items**, scripts can read and change the player's inventory. Items are created
by the **Shop / Inventory System Wizard** (In‑Game UI editor → "Generate Shop/Inventory System"), which
registers each item with a backing number "count" variable. These helpers are just sugar over
`getVariable`/`setVariable` on that count, so they're a no-op if no items exist yet:

```javascript
let potions = game.getItemCount("Potion");   // by item name or id
if (game.hasItem("Key")) game.jumpToScene("Locked Room");

game.addItem("Potion", 3);    // give 3 (unique items cap at 1)
game.removeItem("Potion");    // take 1 (never below 0)

let all = game.getItems();    // [{ id, name, count }, ...]
```

### Characters

```javascript
let chars = game.getCharacters();   // [{ id, name }, ...]
```

### Math Utilities

```javascript
let r = game.random(1, 10);        // random integer between 1 and 10 (inclusive)
let c = game.clamp(value, 0, 100); // clamp value between min and max
let l = game.lerp(0, 100, 0.5);    // linear interpolation → 50

// The same helpers also live under game.math, plus randomFloat:
game.math.clamp(v, 0, 1);
game.math.lerp(a, b, t);
game.math.randomFloat(0, 1);       // random float in [0, 1)
```

### Logging

```javascript
game.log("Debug message");          // appears in the console output
game.log("HP:", game.getVariable("playerHP"));
```

---

## Examples

### Damage Calculation

```javascript
// Calculate damage with randomness
let attack = game.getVariable("playerAttack");
let defense = game.getVariable("enemyDefense");
let baseDamage = Math.max(1, attack - defense);
let finalDamage = baseDamage + game.random(0, 5);

game.setVariable("lastDamage", finalDamage);

let enemyHP = game.getVariable("enemyHP");
enemyHP -= finalDamage;
game.setVariable("enemyHP", enemyHP);

game.showDialogue("System", `You deal ${finalDamage} damage!`);

if (enemyHP <= 0) {
    game.notify("Enemy defeated!", "success");
    game.jumpToScene("Victory");
}
```

### Day/Night Cycle

```javascript
let hour = game.getVariable("gameHour");
hour += 1;

if (hour >= 24) {
    hour = 0;
    let day = game.getVariable("gameDay");
    game.setVariable("gameDay", day + 1);
}

game.setVariable("gameHour", hour);

if (hour >= 6 && hour < 18) {
    game.setVariable("timeOfDay", "day");
} else {
    game.setVariable("timeOfDay", "night");
}
```

### Inventory Check

```javascript
let hasKey = game.getVariable("hasKey");
let hasMap = game.getVariable("hasMap");

if (hasKey && hasMap) {
    game.jumpToScene("Secret Room");
} else if (hasKey) {
    game.showDialogue("Narrator", "You have the key, but you need a map to find the door.");
} else {
    game.showDialogue("Narrator", "The path forward is blocked.");
}
```

---

## Using RunScript in Scenes

1. In the **Command Palette**, open the **Flow Control** category
2. Drag **Run Script** into your scene timeline
3. In the **Properties Inspector**, select which script to run
4. If the chosen script declares **parameters**, an **Arguments** section appears — fill in the values to pass (anything left blank uses the parameter's default)
5. Toggle **Wait for Completion** to control whether the engine pauses until the script finishes

---

## Security & Sandbox

Scripts run in a sandboxed `Function`-constructor environment (not `eval`). The following are
**blocked**:

- `document`, `window`, `globalThis`, `self`
- `fetch`, `XMLHttpRequest`, `WebSocket`
- `eval`, `Function`
- `localStorage`, `sessionStorage`, `indexedDB`
- `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `requestAnimationFrame`, `queueMicrotask` — use `await game.wait(seconds)` for timed delays
- `.constructor` access (the classic prototype-chain escape to `Function`) is rejected before the script runs

Scripts can only interact with the game through the `game` API object.

> Heads-up: this is a *practical* sandbox, not a hardened security boundary. Only run scripts
> you trust (yours or from sources you trust). Stronger isolation is on the roadmap.

---

## Validation

Click **Validate** in the Script Editor to check for:
- **Syntax errors** — invalid JavaScript
- **Blocked API usage** — references to restricted globals
- **Best practices** — warnings about potentially unsafe patterns

---

## Where errors show up

- **Test Run / Validate:** errors and `game.log()` output appear in the Script Editor's **Console** panel.
- **During play (Test Play or exported game):** a script error pops a red toast (e.g. *Script "X" error: …*)
  and the full stack is written to the browser/dev console. The rest of the scene keeps running.

---

## Tips

- Scripts operate on **variables you've already created** in the Variables manager — define them first.
- Use `game.log()` instead of `console.log()` for debugging — output appears in the Script Editor console
- Keep scripts focused — one script per gameplay mechanic
- Test scripts with **▶ Test Run** before using them in scenes
- Disable scripts you're not using to prevent accidental execution


---

# FlourishVNE Common Events

**Common Events** are reusable command sequences you author once and invoke from anywhere — like
functions for your story. Open the **Common Events** manager from the editor's navigation bar to create them.

---

## Building a Common Event

1. In the **Common Events** manager, click **New Event** and give it a name.
2. Pick its **trigger** (`called` / `auto` / `parallel`) — see below.
3. Add commands to the event's list (the same commands you use in scenes).
4. (Optional) For a `called` event, add **parameters** — typed inputs (string/number/boolean with a
   default) that callers fill in; read them inside the event like any variable (by the parameter's id).
5. (Optional) For `auto` / `parallel`, set a **condition variable** to gate when it runs.

Use the **Export / Import** buttons to move events between projects (see *Sharing across projects*).

---

## Triggers

Each Common Event has a **trigger** that decides how it runs:

| Trigger | Behavior |
|---------|----------|
| `called` | Runs only when explicitly invoked — by a **Call Common Event** command, a button/choice **Call Common Event** action, or a script's `game.callCommonEvent()`. Can declare **parameters**. |
| `auto` | Runs **once automatically at the start of every scene**, *before* the scene's own commands. Optional **condition variable**: if set, it only runs when that variable is truthy. (Re-entering a scene after visiting another one runs it again.) |
| `parallel` | Runs **continuously in the background** alongside the scene, looping its command list. Optional **condition variable** gates it on/off live. |

---

## Calling a Common Event

There are four ways to invoke a `called` event:

1. **Call Common Event command** — add it to a scene timeline; pick the event and fill in any arguments.
2. **Button / choice action** — choose **Call Common Event** as a UI action and select the event (+ arguments).
3. **From a script** — `game.callCommonEvent("Event Name", { arg: value })`.
4. **Nested** — a Common Event can call another Common Event.

When the event finishes, execution returns to right after the call (a call stack handles nesting).

---

## Parameters (local scope)

A `called` event can declare typed **parameters** (string / number / boolean, each with a default).
Arguments you pass at the call site are injected as variables **only for the duration of that call**,
and the previous values are **restored when the event returns** — so parameters don't leak into the rest
of your game. Arguments are coerced to the parameter's declared type. Deleting a parameter automatically
cleans up any now-dangling arguments on existing Call Common Event commands.

---

## Safety limits

- **Call depth** is capped (32 levels). Exceeding it is blocked with an on-screen error rather than
  freezing the game.
- **Cycles are detected**: if event A is already running and something tries to call A again (A → B → A),
  the re-entry is blocked (a normal sequential call of the same event twice is fine).

---

## Parallel events — what they can do

Parallel events are for **background logic** (timers, ambient flags, looping music logic). To keep them
from hijacking the main flow, each tick advances **one** command per active parallel event, and only
**background-safe** commands run:

- ✅ Set Variable, Run Script, Wait, Play/Stop Music, Play/Stop Sound Effect, Call Common Event
- ❌ **Skipped:** Dialogue, Choice, Show Text/Image/Character, Set Background, Jump, Text Input, Credit
  Roll, screen effects, particles, tweens — anything that would take over the main presentation.

Use `Wait` inside a parallel event to pace it (e.g., increment a clock every few seconds). Parallel
events restart from the top when their condition turns on again, and they are not part of save data
(they simply resume based on the loaded variable state).

---

## Sharing across projects

The Common Events manager has **Export** and **Import** buttons. Export writes all your common events to
a `common-events.json` file; Import adds them to another project (each gets a fresh id). Note: commands
inside an imported event that reference *variables* by id won't automatically resolve in a different
project — re-point them after importing.

---

## Tips

- Put shared logic (stat changes, quest checks, flag toggles) in a `called` event and invoke it from
  many places instead of copy-pasting commands.
- Use `auto` + a condition variable for "first time entering any scene after X happened" setup.
- Keep `parallel` events small and `Wait`-paced; they share your variables with the main scene.


---

# FlourishVNE Plugin / Extension System

The Plugin System lets you extend FlourishVNE with custom functionality. Plugins can register new commands, effects, hook into lifecycle events, and modify engine behavior.

---

## Getting Started

1. Open the **Plugin Manager** from the **Tools** menu
2. Click the **Install Plugin** tab
3. Paste your plugin source code
4. Click **Install Plugin**
5. Enable/disable plugins from the **Installed** tab

---

## Plugin Structure

Every plugin must define a `manifest` object and a `plugin` variable that bundles the manifest with hook functions:

```javascript
// Required: Plugin manifest
const manifest = {
    id: 'my-plugin',              // unique identifier (lowercase, hyphens)
    name: 'My Plugin',            // display name
    version: '1.0.0',             // semver version string
    description: 'What this plugin does',
    author: 'Your Name',          // optional
    category: 'utility',          // see categories below
    capabilities: [],             // reserved for future use
    dependencies: [],             // other plugin IDs this depends on
};

// Lifecycle hooks (all optional)
function onLoad(api) {
    // Called when the plugin is first loaded
}

function onEnable(api) {
    // Called when the plugin is enabled
}

function onDisable(api) {
    // Called when the plugin is disabled
}

function onBeforeCommand(api, command) {
    // Called before each command executes
    // Return modified command or undefined
}

function onAfterCommand(api, command, result) {
    // Called after each command executes
}

function onSceneChange(api, fromSceneId, toSceneId) {
    // Called when the scene changes
}

function onVariableChange(api, variableId, oldValue, newValue) {
    // Called when a variable changes
}

function onSave(api, saveData) {
    // Called before the game state is saved (may mutate saveData)
}

function onLoadAfterSave(api, saveData) {
    // Called after a save is loaded
}

function onRuntimeInit(api) {
    // Called once when a play session starts (LivePreview / exported game)
}

// Required: Export the plugin (bundles the manifest + hooks)
const plugin = {
    manifest,
    onLoad,
    onEnable,
    onDisable,
    onBeforeCommand,
    onAfterCommand,
    onSceneChange,
    onVariableChange,
    onSave,
    onLoadAfterSave,
    onRuntimeInit,
};
```

> Note: hooks fire only while a play session is active (Test Play or an exported game).
> `onBeforeCommand` / `onAfterCommand` are observe-only in this version (returning a modified
> command is not yet applied). Variable reads/writes via `api` are **live** during play.

---

## Plugin Categories

| Category | Description |
|----------|-------------|
| `commands` | Adds new command types |
| `effects` | Adds custom visual/audio effects |
| `ui` | Modifies or extends the UI |
| `assets` | Adds asset processing pipelines |
| `gameplay` | Extends gameplay mechanics |
| `integration` | Reserved. **Note:** the sandbox has no network access (`fetch`/XHR/WebSocket are blocked), so true external integrations aren't possible yet. |
| `utility` | General-purpose utilities |

---

## Plugin API (`api`)

Every hook function receives an `api` object with these methods:

### Variables

```javascript
// During play these read & write the LIVE game variable store (by name or id).
// In the editor (not playing), getVariable returns the variable's default and
// setVariable is a no-op (with a console warning).
let hp = api.getVariable('playerHP');
api.setVariable('playerHP', 100);
```

### Project Info

```javascript
api.getProjectInfo();
// Returns: { title, version, sceneCount, characterCount }

api.getScenes();      // Returns: [{ id, name }, ...]
api.getCharacters();  // Returns: [{ id, name }, ...]
```

### Custom Commands & Effects

Register these from `onLoad` / `onEnable`. A registered command appears in the
**Command Palette** under a "🧩 Plugins" group and runs your `handler` during play.

```javascript
// Register a custom command. The full type becomes "<pluginId>.<type>".
api.registerCommand({
    type: 'rollDice',                // unique within your plugin
    displayName: 'Roll Dice',        // shown in the palette
    category: 'RPG',
    description: 'Roll dice and store the result',
    parameters: [
        { name: 'sides', label: 'Sides', type: 'number', defaultValue: 6 },
        { name: 'target', label: 'Result Variable', type: 'variable' },
    ],
    // Use api.* for effects. Optionally return { advance: false } to NOT auto-advance.
    handler: (params, api) => {
        const roll = Math.floor(Math.random() * params.sides) + 1;
        if (params.target) api.setVariable(params.target, roll);
    },
});

// Register a custom effect (registered + listed in the plugin's Details view).
api.registerEffect({
    type: 'myEffect',
    displayName: 'My Effect',
    description: 'A cool effect',
    parameters: [{ name: 'intensity', label: 'Intensity', type: 'number', defaultValue: 0.5 }],
    apply: (params, api) => { /* ... */ },
    remove: (api) => { /* ... */ },
});
```

Parameter `type` is one of: `string`, `number`, `boolean`, `select` (with `options`),
`color`, `variable` (a variable picker), or `asset`.

### Settings

Declare a `settings` array on the manifest to give your plugin a configuration form. It renders in the
plugin's **Details** view, and the values are read at runtime with `api.getConfig()`:

```javascript
const manifest = {
    id: 'my-plugin', name: 'My Plugin', version: '1.0.0',
    description: '…', author: 'You', category: 'utility', capabilities: [],
    settings: [
        { name: 'difficulty', label: 'Difficulty', type: 'select',
          defaultValue: 'normal',
          options: [{ label: 'Easy', value: 'easy' }, { label: 'Normal', value: 'normal' }] },
        { name: 'showHints', label: 'Show hints', type: 'boolean', defaultValue: true },
    ],
};

function onRuntimeInit(api) {
    const cfg = api.getConfig();        // { difficulty, showHints } (defaults merged with user overrides)
    if (cfg.showHints) api.notify('Hints are on');
}
```

Setting `type` is one of `string`, `number`, `boolean`, or `select` (with `options`).

### Plugin-Scoped Storage

```javascript
// Persists in the PROJECT (travels with .flourish exports — not browser localStorage).
api.setStorage('key', value);
let value = api.getStorage('key');
```

### Logging

```javascript
api.log('Plugin message');    // prefixed with [PluginName]
```

---

## Example Plugins

### Auto-Save Plugin

```javascript
const manifest = {
    id: 'auto-save',
    name: 'Auto Save',
    version: '1.0.0',
    description: 'Automatically saves progress at scene transitions',
    author: 'FlourishVNE',
    category: 'utility',
    capabilities: [],
};

let saveCount = 0;

function onEnable(api) {
    saveCount = api.getStorage('saveCount') || 0;
    api.log(`Auto-save enabled. ${saveCount} saves so far.`);
}

function onSceneChange(api, fromSceneId, toSceneId) {
    saveCount++;
    api.setStorage('saveCount', saveCount);
    api.log(`Auto-saving at scene change #${saveCount}`);
}

const plugin = { manifest, onEnable, onSceneChange };
```

### Variable Logger Plugin

```javascript
const manifest = {
    id: 'var-logger',
    name: 'Variable Logger',
    version: '1.0.0',
    description: 'Logs all variable changes to the console',
    category: 'utility',
    capabilities: [],
};

function onVariableChange(api, variableId, oldValue, newValue) {
    api.log(`Variable changed: ${variableId} = ${oldValue} → ${newValue}`);
}

const plugin = { manifest, onVariableChange };
```

### Custom Dice Roll Command

```javascript
const manifest = {
    id: 'dice-roller',
    name: 'Dice Roller',
    version: '1.0.0',
    description: 'Adds a dice roll command for RPG mechanics',
    category: 'commands',
    capabilities: [],
};

function onEnable(api) {
    api.registerCommand({
        type: 'rollDice',
        displayName: 'Roll Dice',
        description: 'Roll dice and store the result in a variable',
        category: 'RPG',
        parameters: [
            { name: 'sides', label: 'Sides', type: 'number', defaultValue: 6 },
            { name: 'count', label: 'Count', type: 'number', defaultValue: 1 },
            { name: 'target', label: 'Result Variable', type: 'variable' },
        ],
        handler: (params, api) => {
            let total = 0;
            for (let i = 0; i < params.count; i++) {
                total += Math.floor(Math.random() * params.sides) + 1;
            }
            if (params.target) api.setVariable(params.target, total);
        },
    });
}

const plugin = { manifest, onEnable };
```

> Drag **Roll Dice** from the palette's 🧩 Plugins group into a scene; its parameters appear
> in the Properties inspector, and the handler runs (rolling + storing) when the command executes.

---

## Plugin Lifecycle

1. **Install** — Plugin source is parsed and validated
2. **Load** — `onLoad()` is called, plugin is in `loaded` state
3. **Enable** — `onEnable()` is called, hooks become active
4. **Disable** — `onDisable()` is called, hooks are deactivated
5. **Uninstall** — Plugin is removed from the project

---

## Plugin Details View

From the **Installed** tab, click **Details** on any plugin to see:
- Manifest information (ID, version, author, category)
- Registered custom commands
- Registered custom effects
- Plugin configuration
- Enable/disable/uninstall controls

---

## Tips

- Keep plugin IDs unique and lowercase (e.g., `my-cool-plugin`)
- Use `api.log()` for debugging — output goes to the Plugin Manager console
- Use scoped storage (`api.setStorage`) instead of global state — it travels with the project
- Share plugins via **Export** (Details view) → a `.plugin.js` file; install it elsewhere with **Import from file…**
- Declare `dependencies` / `engineVersion` in the manifest — install is blocked if a dependency is missing or the engine is too old
- Plugins run in the same hardened sandbox as scripts (no `document`/`window`/`fetch`/timers/`.constructor`). This is a practical sandbox, not a security boundary — only install plugins you trust.
