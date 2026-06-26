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

## Terminology (quick glossary)

| Term | What it means |
|------|----------------|
| **Script** | A block of JavaScript you write in the Script Editor. It talks to the game through the safe `game` API. |
| **Command** | One step in a scene's timeline (Show Character, Dialogue, …) — the no-code building block. |
| **RunScript command** | The scene command that runs one of your scripts during play. |
| **Common Event** | A reusable list of commands you can call from anywhere (a "function" for the no-code editor). |
| **Plugin** | Code that extends the game **engine** — new commands / effects / hooks available at runtime. |
| **Extension** | Code that extends the **editor** itself — panels, tools, database tables, custom UI elements. See *Extensions System* below. |
| **Trigger** | When a script runs: *only when called* (default), or *auto on every scene start/end*. |
| **`game`** | The object your script uses to talk to the visual novel (`game.setVariable(...)`, etc.). |
| **`await`** | Put it before a `game.x()` that takes time (dialogue, wait, transitions) so the next line waits for it to finish. |
| **Sandbox** | The safety box scripts run in — no internet, files, or timers. Pure game logic only. |
| **Runtime vs editor** | "Runtime" = while the game is being *played*; "editor" = while you're *building* it. Scripts run at runtime. |

---

## When should I use a script instead of the editor?

The visual editor handles the vast majority of a visual novel with **no code**, and for most scenes it's the better tool. Reach for a **script** when you hit something the editor can't express neatly:

- **Real logic & math** — loops, several conditions at once, calculations, a stat system, random tables, a small minigame. Visual branches get unwieldy past a few conditions; code stays short.
- **Doing the same thing many times** — loop to show 10 lines or check a list, instead of placing each by hand.
- **Computed text** — build a sentence out of variables, then show it.
- **Reuse** — write a helper script once and call it anywhere with `game.runScript(...)`.

You don't have to choose all-or-nothing: most creators build the bulk in the editor and **drop into a script only for the tricky part** (via a RunScript command). Everything the editor's commands do, a script can do too — see `game.runCommand` / `game.ui` below — so you're never stuck.

What scripts **can't** do (by design): reach the internet, touch files, or set timers — the sandbox blocks these. Those capabilities belong to **Plugins/Extensions**, not in-game scripts.

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

### Showing characters, backgrounds & images

These run the **real** engine commands, so transitions and timing match the editor exactly. `await` them so they happen in order. (Characters/backgrounds/images/effects are referenced by **name or id**.)

```javascript
// Show a character. opts: expression (name/id), position ("left"|"center"|"right" or {x,y} 0–100%),
// transition (e.g. "fade"), duration (seconds).
await game.showCharacter("Luna", { expression: "happy", position: "center", transition: "fade" });

// Hide a character.
await game.hideCharacter("Luna", { transition: "fade" });

// Change the scene background.
await game.setBackground("Forest", { transition: "fade", duration: 1 });

// Show / hide an image overlay (x,y in 0–100% of the screen).
await game.showImage("Sign", { x: 50, y: 40, width: 30 });
await game.hideImage("Sign");
```

### On-screen text, dress-up & credits

```javascript
await game.showText("Chapter One", { x: 50, y: 20, fontSize: 48, color: "#ffffff" });
await game.hideText();

await game.setCharacterLayer("Hero", { layers: [ /* dress-up layer ids */ ] });
await game.creditRoll();
```

### Screen effects & weather

```javascript
await game.shakeScreen({ intensity: 5, duration: 0.5 });
await game.flashScreen({ color: "#ffffff", duration: 0.4 });
await game.tintScreen("#00000080", { duration: 1 });        // hex + alpha
await game.panZoom({ zoom: 1.2, panX: 10, panY: 0, duration: 1 });
await game.resetScreenEffects({ duration: 1 });             // clear tint/pan/zoom/overlays

await game.lightning({ flashes: 2 });
await game.fireworks({ bursts: 3 });
await game.flashlight({ radius: 22 });   await game.flashlightOff();
await game.screenOverlay("fog", { intensity: 0.5 });        // fog / haze / smoke / CRT…
await game.spawnParticles({ /* … */ });  await game.stopParticles();
await game.tween({ /* … */ });   // animate a screen element's properties (opts map to the Tween command)
await game.stopSFX("rain");
```

### Ask the player & wait (`await`)

These **pause the script until the player responds** — the heart of branching logic in code.

```javascript
// Show one line and wait for the player to advance. "" = Narrator.
await game.dialogue("Luna", "Are you ready?");

// Show choices; get the chosen index back (0-based).
const pick = await game.choice(["Fight", "Run", "Talk"]);
if (pick === 0) { await game.dialogue("", "You raise your sword."); }

// Ask for typed text (optionally store it in a variable too).
const name = await game.textInput("What's your name?", { variable: "playerName" });
await game.dialogue("", "Hello, " + name + "!");

// Pause without input:
await game.wait(1.5);   // seconds

// Play a movie/video and WAIT for it to finish (fullscreen; the player can click to skip):
await game.playMovie("Intro Cutscene");
await game.playMovie("Logo", { waitsForCompletion: false });   // fire-and-forget
await game.playMovie("Rain", { displayMode: "overlay", loop: true });  // non-blocking overlay
game.stopMovie();   // stop the fullscreen movie + clear overlays
```

> **`game.dialogue` vs `game.showDialogue`:** `dialogue` (with `await`) shows ONE line and waits for a
> click; `showDialogue` just drops text in the box and continues immediately (fire-and-forget).

### Controlling the UI (screens, elements, save / load)

Anything a UI button can do, a script can do.

```javascript
game.goToScreen("Pause Menu");      // open a screen by name or id
game.toggleScreen("Map");
game.returnToGame();                // close screens, back to gameplay

game.showElement("portrait");       // reveal / hide a screen element by id
game.hideElement("portrait");
game.changeImage("portrait", "Portrait_Sad");
game.playAnimation("title", "shake", 0.5);

game.saveGame(0);                   // 0 = the auto-save slot
game.loadGame(1);
game.quitToTitle();
game.exitGame();                    // desktop; no-op on web
game.openURL("https://example.com");
```

### Run ANY command or UI action (advanced)

Every scene command and UI action is reachable, even ones without a named helper above:

```javascript
// Run any scene command by type (the fields match the editor's command):
await game.runCommand("ShowCharacter", { characterId: "Luna", transition: "fade" });
await game.runCommand("PlayMusic", { audioId: "Theme", loop: true });

// Fire any UI action by type:
game.ui("GoToScreen", { targetScreenId: "Pause Menu" });
game.ui("SaveGame", { slotNumber: 0 });
```

> The `type` / `actionType` strings match the names in the editor (Show Character → `"ShowCharacter"`,
> Go To Screen → `"GoToScreen"`). Every built-in command is reachable this way.

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

### A fully-scripted scene (stage + ask the player)

Shows the newer `await` API driving the whole scene — background, character, branching choice, and a follow-up — all from one script run by a single RunScript command.

```javascript
await game.setBackground("Throne Room", { transition: "fade" });
await game.showCharacter("Queen", { expression: "stern", position: "center" });

await game.dialogue("Queen", "You stand accused. How do you plead?");

const plea = await game.choice(["Guilty", "Innocent", "Say nothing"]);

if (plea === 0) {
    game.setVariable("reputation", game.getVariable("reputation") - 10);
    await game.dialogue("Queen", "At least you are honest.");
} else if (plea === 1) {
    await game.shakeScreen({ intensity: 4, duration: 0.4 });
    await game.dialogue("Queen", "We shall see about that.");
} else {
    await game.dialogue("Queen", "Silence will not save you.");
}

await game.hideCharacter("Queen", { transition: "fade" });
game.jumpToScene("The Verdict");
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
- Plugins run in the same hardened sandbox as scripts (no `document`/`window`/`fetch`/timers/`.constructor`). This is a practical sandbox, not a security boundary — only install plugins you trust. (Editor **Extensions** — see below — run with full trust instead.)

---

# FlourishVNE Extensions System

Where a **Plugin** extends the *game engine* (custom commands/effects that run during play), an **Extension** extends the **editor itself** — adding panels, tools, database tables, and custom screen widgets. Both are authored the same way (a `manifest` + a `plugin` object) and installed through the same Plugin Manager; what differs is the manifest's **`target`** and which `api.register*` methods you call.

## The `target` field — the most important choice

```javascript
const manifest = {
  id: 'com.you.my-addon', name: 'My Add-on', version: '1.0.0',
  description: '...', author: 'You', category: 'utility',
  target: 'editor',   // 'runtime' (default) | 'editor' | 'both'
};
```

| `target` | Runs… | Sandbox | Shipped in exported games? | Use for |
|---|---|---|---|---|
| `'runtime'` *(default)* | inside the game | **sandboxed** (no DOM/network/timers) | **yes** | custom commands/effects (Plugins) |
| `'editor'` | in the editor only | **full trust** (DOM, network, timers OK) | **no — stripped from builds** | panels, tools, database tables |
| `'both'` | editor *and* game | full trust | **yes** | **custom UI element types** (their renderer must ship) |

Two rules follow from this table:
- **Editor extensions run on your own machine with full trust** — they can use `document`, `fetch`, timers, anything. They are **never bundled into exported games**, so they can't affect players.
- **A custom UI element type must use `target: 'both'`** (or `'runtime'`) — otherwise its renderer is stripped from the build and the element won't appear in the finished game.

## Anatomy of an extension

```javascript
const manifest = {
  id: 'com.you.my-addon',
  name: 'My Add-on',
  version: '1.0.0',           // semver
  description: 'What it does.',
  author: 'You',
  category: 'utility',        // commands | effects | ui | assets | gameplay | integration | utility
  target: 'editor',
  capabilities: ['ui-panels'],
};

const plugin = {
  manifest,
  onEnable(api) {
    // Register your contributions here (see below). onEnable runs when the
    // extension loads/enables AND on every project load — keep it idempotent.
  },
  onDisable(api) { /* tear down anything you created (DOM you added, timers) */ },
};
```

> `onEnable` is also where you keep a reference for cleanup. If your extension creates its own floating
> DOM (a button, a window), remove it in `onDisable` so the "Hide during test play" / disable / uninstall
> flows can take it down cleanly.

## Contribution 1 — Panels  (`api.registerPanel`)

A free-form floating window opened from **Tools ▸ Extension Panels**.

```javascript
api.registerPanel({
  id: 'notes',
  title: 'Notepad',
  icon: '📝',
  // `container` is a real DOM element; `ctx` is the editor context (below). Render anything.
  // Return an optional cleanup function (called when the panel window closes).
  render: (container, ctx) => {
    const ta = document.createElement('textarea');
    ta.value = ctx.getStorage('notes') || '';
    ta.addEventListener('input', () => ctx.setStorage('notes', ta.value));
    container.appendChild(ta);
    return () => { /* cleanup */ };
  },
});
```

## Contribution 2 — Menu tools  (`api.registerMenuItem`)

A one-shot action under **Tools ▸ Extension Tools** (generators, importers, validators).

```javascript
api.registerMenuItem({
  id: 'wordcount', label: 'Word count', icon: '🔢',
  run: (ctx) => {
    const scenes = Object.values(ctx.getProject().scenes || {});
    ctx.notify('You have ' + scenes.length + ' scenes.', 'info');
  },
});
```

## Contribution 3 — Database categories  (`api.registerDatabaseCategory`)

A new data table the user fills in. The editor **generates the list + add/edit form** from your `fields`; records save with the project and are readable at runtime via `api.getRecords(categoryId)`. Opens from **Tools ▸ Extension Data**.

```javascript
api.registerDatabaseCategory({
  id: 'cards', name: 'Cards', icon: '🃏', recordLabel: 'Card', titleField: 'name',
  fields: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'cost', label: 'Cost', type: 'number', default: 1 },
    { key: 'rarity', label: 'Rarity', type: 'select', options: [
      { label: 'Common', value: 'common' }, { label: 'Rare', value: 'rare' },
    ] },
    { key: 'art', label: 'Art', type: 'asset' },         // picks a project image/background
    { key: 'text', label: 'Card text', type: 'textarea' },
  ],
});

// Later, at runtime (or in a tool):
const cards = api.getRecords('cards');   // → [{ id, name, cost, rarity, art, text }, …]
```

## Contribution 4 — Custom UI element types  (`api.registerUIElementType`)

A new screen widget that appears in the menu / In-Game UI editor palette and renders on the canvas **and** in the shipped game. **Use `target: 'both'`** so the renderer ships.

```javascript
api.registerUIElementType({
  type: 'statBar', displayName: 'Stat Bar', icon: '📊',
  defaultProps: { label: 'HP', variable: '', max: 100, color: '#22c55e' },
  defaultSize: { width: 32, height: 7 },   // screen-%
  inspector: [                              // generates the element's property form
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'variable', label: 'Variable (name)', type: 'text' },
    { key: 'max', label: 'Max', type: 'number', default: 100 },
    { key: 'color', label: 'Fill', type: 'color', default: '#22c55e' },
  ],
  // Return an HTML STRING (you're sandboxed if target:'runtime'/'both' — build a string, no DOM).
  // It fills the element's positioned box. ctx.getVariable reads the live value (or default in editor).
  render: (props, ctx) => {
    const cur = Number(ctx.getVariable(props.variable)) || 0;
    const pct = Math.min(100, (cur / (props.max || 100)) * 100);
    return '<div style="width:100%;height:100%;background:#1f2937;border-radius:6px;overflow:hidden">' +
           '<div style="height:100%;width:' + pct + '%;background:' + props.color + '"></div></div>';
  },
});
```

> **Always escape user text** you put into an HTML string (e.g. a label) to avoid breaking the markup.

## Resources & the `.flourishext` bundle

For code-only extensions, a single `.js` file is enough (Export → **Export `.plugin.js`**, install with **Import from file…**). To ship **images or other binary assets**, package a **`.flourishext` bundle** — a ZIP containing:

```
manifest.json     ← the manifest (metadata, for preview)
entry.js          ← your extension source (the manifest + plugin code)
resources/        ← any files (icon.png, sfx.mp3, …)
```

- **Build one:** in an installed extension's **Details**, attach files under **Resources**, then **Export `.flourishext`**.
- **Install one:** **Import from file…** accepts `.flourishext` / `.zip` (then confirm the trust prompt).
- **Use a resource at runtime:** `api.getResource('icon.png')` returns its data URL. Because a custom element's `render` is defined inside `onEnable(api)`, it can use it via closure:

```javascript
render: (props) => '<img src="' + api.getResource('icon.png') + '" style="width:100%;height:100%">'
```

## The editor context (`ctx`) — panels & tools

Passed to `panel.render(container, ctx)` and `menuItem.run(ctx)`:

| Member | What it does |
|---|---|
| `ctx.getProject()` | The current project (read-only snapshot). |
| `ctx.dispatch(action)` | Dispatch an editor action (advanced — same actions the editor uses). |
| `ctx.notify(msg, type?)` | Toast: `'info' \| 'success' \| 'warning' \| 'error'`. |
| `ctx.getStorage(key)` / `ctx.setStorage(key, value)` | This extension's persistent, project-scoped storage. |

Custom UI element renderers instead get `ctx = { getVariable(nameOrId), isEditor }`.

## Field types (database categories & element inspectors)

`text` · `textarea` · `number` · `boolean` · `select` (needs `options: [{label, value}]`) · `color` · `asset` (project image/background picker). Each field: `{ key, label, type, default?, placeholder?, options? }`.

## Installing, trust & build options

- **Trust prompt:** every install shows the name, author, version, type (editor/game/both) and capabilities, with a "this runs code on your machine" warning. Nothing runs until you confirm.
- **Per-plugin Details controls:** *Include in exported games* (runtime plugins), *Hide during test play* (editor extensions whose floating UI would overlap the preview), *Resources*, *Export `.plugin.js`* / *Export `.flourishext`*, enable/disable/uninstall.

## Ready-to-try samples (`docs/examples/`)

| File | Shows |
|---|---|
| `project-stats-panel.plugin.js` | A panel (live project stats). |
| `story-bible.plugin.js` | A self-managed floating button + a draggable window with nested sections. |
| `custom-elements.plugin.js` | Custom UI element types (a variable-bound Stat Bar + a Nameplate). |

Import any of them via **Plugin Manager ▸ Import from file…**.

## Security model (full-trust local, no cross-user harm)

- Local install is **full trust but explicit opt-in** — third-party add-ons are disabled until you install + confirm them, and the prompt shows provenance. A malicious *local* extension can harm *your* machine; that is the accepted trade-off of full trust.
- The app never lets extension code reach the **auto-updater or any sync/share channel**, and **install scripts from an imported project never auto-run** — so an add-on can't silently propagate to other users.
- Runtime plugins (shipped to players) stay **sandboxed**; only editor/both extensions (which run on the author's machine) get full trust.
