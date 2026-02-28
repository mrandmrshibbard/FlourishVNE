# FlourishVNE Scripting System

The Scripting System lets you write custom JavaScript logic that runs inside your visual novel. Scripts can manipulate variables, trigger scene jumps, play audio, show dialogue, and much more — all through a safe, sandboxed API.

---

## Getting Started

1. Open the **Script Editor** from the **Tools** menu in the header toolbar
2. Click **New Script** to create a script
3. Write your logic using the `game` API object
4. Save with **Ctrl+S** and test with the **▶ Test Run** button
5. Use the **RunScript** command in your scene timeline to execute a script during gameplay

---

## Script Triggers

Each script has a **trigger** that determines when it can run:

| Trigger | Description |
|---------|-------------|
| `command` | Runs when a **RunScript** command executes in the scene timeline |
| `onSceneEnter` | Runs automatically when a scene is entered |
| `onSceneExit` | Runs automatically when a scene is exited |
| `global` | Utility script — can only be called explicitly via RunScript |

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
// Jump to a different scene by name
game.jumpToScene("Chapter 2");

// Jump to a label within the current scene
game.jumpToLabel("battle_start");
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
// Get the current scene ID
let sceneId = game.currentSceneId;

// Get a list of all scenes
let scenes = game.getScenes();
// Returns: [{ id: "...", name: "Chapter 1" }, ...]

// Get all variables in the project
let vars = game.getVariables();
// Returns: [{ id: "...", name: "playerHP", type: "number", defaultValue: 100 }, ...]
```

### Math Utilities

```javascript
let r = game.random(1, 10);      // random integer between 1 and 10
let c = game.clamp(value, 0, 100); // clamp value between min and max
let l = game.lerp(0, 100, 0.5);    // linear interpolation → 50
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

1. Open the **Command Palette** and find the **Scripting** category
2. Drag **RunScript** into your scene timeline
3. In the **Properties Inspector**, select which script to run
4. Toggle **Wait for Completion** to control whether the engine pauses until the script finishes

---

## Security & Sandbox

Scripts run in a sandboxed environment. The following are **blocked** for security:

- `document`, `window`, `globalThis`
- `fetch`, `XMLHttpRequest`, `WebSocket`
- `eval`, `Function`
- `localStorage`, `sessionStorage`
- `setTimeout`, `setInterval`
- `importScripts`, `require`, `import`

Scripts can only interact with the game through the `game` API object.

---

## Validation

Click **Validate** in the Script Editor to check for:
- **Syntax errors** — invalid JavaScript
- **Blocked API usage** — references to restricted globals
- **Best practices** — warnings about potentially unsafe patterns

---

## Tips

- Use `game.log()` instead of `console.log()` for debugging — output appears in the Script Editor console
- Keep scripts focused — one script per gameplay mechanic
- Test scripts with **▶ Test Run** before using them in scenes
- Disable scripts you're not using to prevent accidental execution


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
    // Called before the game state is saved
    // Can modify saveData
}

function onLoad2(api, saveData) {
    // Called after a save is loaded
}

// Required: Export the plugin
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
    onLoad: onLoad2   // note: use different function names to avoid conflicts
};
```

---

## Plugin Categories

| Category | Description |
|----------|-------------|
| `commands` | Adds new command types |
| `effects` | Adds custom visual/audio effects |
| `ui` | Modifies or extends the UI |
| `assets` | Adds asset processing pipelines |
| `gameplay` | Extends gameplay mechanics |
| `integration` | Connects to external services |
| `utility` | General-purpose utilities |

---

## Plugin API (`api`)

Every hook function receives an `api` object with these methods:

### Variables

```javascript
api.getVariable(name);            // get variable value by name
api.setVariable(name, value);     // set variable value
```

### Project Info

```javascript
api.getProjectInfo();
// Returns: { id, title, version, author, scenesCount, charactersCount }

api.getScenes();
// Returns: [{ id, name, commandCount }, ...]
```

### Custom Commands & Effects

```javascript
// Register a custom command type
api.registerCommand({
    id: 'my-command',
    name: 'My Custom Command',
    description: 'Does something special',
    category: 'My Plugin',
    defaultProperties: { speed: 1.0 },
    execute: (props, context) => {
        // Command execution logic
        return { advance: true };
    },
    renderProperties: (props) => {
        // Return property editor config (optional)
        return null;
    }
});

// Register a custom visual effect
api.registerEffect({
    id: 'my-effect',
    name: 'My Custom Effect',
    description: 'A cool visual effect',
    category: 'My Plugin',
    defaultConfig: { intensity: 0.5 },
    apply: (config, context) => {
        // Apply the effect
    },
    remove: (context) => {
        // Clean up the effect
    }
});
```

### Plugin-Scoped Storage

```javascript
// Store data that persists across sessions (uses localStorage)
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
        id: 'roll-dice',
        name: 'Roll Dice',
        description: 'Roll dice and store the result in a variable',
        category: 'RPG',
        defaultProperties: {
            sides: 6,
            count: 1,
            targetVariable: '',
        },
        execute: (props, context) => {
            let total = 0;
            for (let i = 0; i < props.count; i++) {
                total += Math.floor(Math.random() * props.sides) + 1;
            }
            if (props.targetVariable) {
                api.setVariable(props.targetVariable, total);
            }
            return { advance: true };
        }
    });
}

const plugin = { manifest, onEnable };
```

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
- Use scoped storage (`api.setStorage`) instead of global state
- Test plugins in isolation before combining multiple plugins
- Plugins run in a sandboxed environment similar to scripts
