# FlourishVNE — Feature Workflows Guide

This guide covers **multi-step workflows** — features that require working across multiple tabs or sections of the editor. Each workflow is a complete walkthrough from start to finish.

---

## Table of Contents

1. [Character Setup & Scene Usage](#1-character-setup--scene-usage)
2. [Branching Story Paths with Variables](#2-branching-story-paths-with-variables)
3. [Customizing UI Screens](#3-customizing-ui-screens)
4. [Character Customization System](#4-character-customization-system)
5. [CG Gallery System](#5-cg-gallery-system)
6. [Audio & Music Workflow](#6-audio--music-workflow)
7. [Screen Effects & Overlay Effects](#7-screen-effects--overlay-effects)
8. [Video & Movie Integration](#8-video--movie-integration)
9. [In-Scene Overlays (Text, Images, Buttons)](#9-in-scene-overlays-text-images-buttons)
10. [Scripting System](#10-scripting-system)
11. [Localization Workflow](#11-localization-workflow)
12. [Build & Export Workflow](#12-build--export-workflow)
13. [Template Systems](#13-template-systems)
14. [Dialogue Box & Choice Styling](#14-dialogue-box--choice-styling)
15. [Save/Load System Setup](#15-saveload-system-setup)
16. [Credit Roll System](#16-credit-roll-system)
17. [Command Stacking (Parallel Execution)](#17-command-stacking-parallel-execution)
18. [Scene Conditions & Gating](#18-scene-conditions--gating)
19. [Voice Sync & Lip Sync](#19-voice-sync--lip-sync)
20. [Dialogue Text Effects](#20-dialogue-text-effects)
21. [Character Visual Effects](#21-character-visual-effects)
22. [Particle System (Spawn & Stop Particles)](#22-particle-system-spawn--stop-particles)
23. [Inventory Items with the Systems Hub](#23-inventory-items-with-the-systems-hub)
24. [Building an Inventory Screen (the Inventory Grid)](#24-building-an-inventory-screen-the-inventory-grid)
25. [Item Lists & Collections (Shops, Libraries, Chests) and Restock](#25-item-lists--collections-shops-libraries-chests-and-restock)
26. [Making a Shop (Buy, Sell, and Currency)](#26-making-a-shop-buy-sell-and-currency)
27. [Screen Categories, Overlay Behavior & Open Hotkeys](#27-screen-categories-overlay-behavior--open-hotkeys)
28. [Customizing the In-Game Quick Menu](#28-customizing-the-in-game-quick-menu)
29. [Customizing Choice Buttons](#29-customizing-choice-buttons)
30. [Layering & Parallax Depth](#30-layering--parallax-depth)
31. [Keep Character Expressions in Place](#31-keep-character-expressions-in-place)
32. [Variables, Conditions & the Live Variable Tracker](#32-variables-conditions--the-live-variable-tracker)
33. [Interactive Hot Spots (Scenes & Screens)](#33-interactive-hot-spots-scenes--screens)
34. [Inventory, Items & Stats — the Systems Hub](#34-inventory-items--stats--the-systems-hub)
35. [The In-Game Phone (Texting, Calls, Map, Gallery, Notifications)](#35-the-in-game-phone-texting-calls-map-gallery-notifications)
36. [Interactive Elements (Clickable & Draggable Images, Buttons & Regions)](#36-interactive-elements-clickable--draggable-images-buttons--regions)

---

## 1. Character Setup & Scene Usage

**Tabs involved:** Assets → Characters → Scenes

This is the most common multi-step workflow. Characters need sprites uploaded, layers configured, and expressions defined before they can appear in scenes.

### Step 1: Upload sprites (Assets tab)

1. Go to **Assets** (Shift+4)
2. Select the **Images** category
3. Click **Upload** or drag-and-drop your character sprite files
4. Optionally create a folder for the character (e.g., "Luna") to keep files organized

### Step 2: Create the character (Characters tab)

1. Go to **Characters** (Shift+2)
2. Click **+ Add Character**
3. Set the character **name** and **name color** (shown on the dialogue nameplate)

### Step 3: Add layers

1. In the character editor, select the **Layers** tab
2. Click **Add Layer** for each compositable part:
   - Simple characters: one layer (e.g., "Base") is enough
   - Complex characters: separate layers for body, eyes, mouth, hair, outfit, accessories
3. For each layer, add assets by selecting from your uploaded images
4. Give each asset a descriptive name (e.g., "eyes_happy", "eyes_sad")

> **Tip:** Layers can also use video files for animated parts (e.g., blinking eyes, flowing hair).

### Step 4: Define expressions

1. Switch to the **Expressions** tab
2. Click **Add Expression** and name it (e.g., "Happy", "Sad", "Angry", "Surprised")
3. For each expression, select which asset to display on each layer:
   - "Happy" → Body: default, Eyes: eyes_happy, Mouth: mouth_smile
   - "Sad" → Body: default, Eyes: eyes_sad, Mouth: mouth_frown
4. The **Character Preview** (left side) shows the composited result in real-time

### Step 5: Customize style (optional)

1. Switch to the **Style** tab
2. Set a custom font for this character's name display (family, size, weight, italic)
3. Optionally set a base image or video for the character

### Step 6: Use in scenes (Scenes tab)

1. Go to **Scenes** (Shift+1)
2. Drag **ShowCharacter** from the Command Palette (Characters category) into your scene
3. In the Properties Inspector:
   - Select the **Character** you created
   - Choose an **Expression** (e.g., "Happy")
   - Set **Position**: left, center, right, off-left, off-right, or custom X/Y%
   - Set **Transition**: fade, slide, dissolve, iris-in, wipe-right, instant, cross-fade
   - Set **Duration** for the transition
4. To change expressions mid-scene, add another **ShowCharacter** command with a different expression
5. To remove the character, use **HideCharacter** with a transition

---

## 2. Branching Story Paths with Variables

**Tabs involved:** Variables → Scenes

This workflow creates story branches where player choices affect what happens next.

### Step 1: Create tracking variables (Variables tab)

1. Go to **Variables** (Shift+5)
2. Create variables to track player decisions:
   - Example: `relationship_luna` (Number, Global, default: 0)
   - Example: `chose_sword` (Boolean, Global, default: false)
   - Example: `playerName` (String, Global, default: "")

### Step 2: Set variables via choices (Scenes tab)

1. Go to **Scenes** (Shift+1)
2. Add a **Choice** command to your scene
3. For each choice option, add a **SetVariable** action:
   - "Be kind to Luna" → SetVariable: `relationship_luna` add 1
   - "Ignore Luna" → SetVariable: `relationship_luna` subtract 1

### Step 3: Use conditions on commands

1. Select any command in your scene timeline
2. In the Properties Inspector, scroll to **Conditions**
3. Click **Add Condition**
4. Set: Variable → Operator → Value
   - Example: `relationship_luna` >= 3
5. This command will only execute when the condition is met

### Step 4: Create branches (visual grouping)

1. Drag **BranchStart** from the Command Palette (Flow Control category)
2. Name the branch (e.g., "Luna's Good Ending")
3. Add commands inside the branch that should only run conditionally
4. Add conditions to the BranchStart command
5. Close with **BranchEnd**
6. Branches are color-coded and collapsible for easy visualization

### Step 5: Jump between scenes/labels

- **Jump** command: go to a different scene entirely
- **JumpToLabel** command: jump to a **Label** within the current scene
- Both support conditions, so jumps can be conditional

### Variable interpolation

Insert variable values into dialogue text:
```
{playerName}, Luna's affection is at {relationship_luna} points.
```

### Usage tracking

In the Variables tab, click any variable and use the **Usage Tracker** to see every place it's referenced — across all scenes, commands, conditions, UI elements, and dialogue text.

---

## 3. Customizing UI Screens

**Tabs involved:** Assets → UI Screens → Settings

Flourish comes with 5 default screens (Title, Save, Load, Settings, Pause Menu). You can customize them or create new ones.

### Step 1: Upload UI assets (Assets tab)

1. Go to **Assets** (Shift+4)
2. Upload any images you want to use for backgrounds, buttons, or decorative elements
3. Upload audio files for screen background music

### Step 2: Edit screens (UI Screens tab)

1. Go to **UI Screens** (Shift+3)
2. Select a screen from the list on the left (e.g., "Title Screen")
3. The center area shows the **Visual Editor** — a WYSIWYG canvas where you can drag and resize elements
4. Below the canvas, you'll find buttons to add elements

### Step 3: Configure screen properties

Click the screen background (not an element) to see screen-level properties:
- **Background**: solid color, image, or video
- **Music**: audio asset + playback policy (continue playing, restart, stop)
- **Ambient noise**: secondary audio layer
- **Overlay effects**: CRT, Glitch, Sunbeams, Shimmer, Rain, Snow/Ash
- **Transitions**: in/out animations (fade, slide, crossfade, etc.)

### Step 4: Add and edit UI elements

Click the **Add** buttons below the canvas to add elements:

| Element | Use Case |
|---------|----------|
| **Button** | Navigation, actions (Start Game, Load, Quit, etc.) |
| **Text** | Titles, labels, descriptions |
| **Image** | Logos, decorations, backgrounds |
| **SaveSlotGrid** | Grid of save/load slots |
| **SettingsSlider** | Volume controls, text speed |
| **SettingsToggle** | On/off settings (Skip, Auto-advance) |
| **CharacterPreview** | Live character preview (for character creators) |
| **TextInput** | Player name entry fields |
| **Dropdown** | Selection lists |
| **Checkbox** | Toggle options |
| **AssetCycler** | Browse character layer assets with arrows |
| **CGGallery** | Gallery grid with unlock tracking |

### Step 5: Configure element properties

Click any element in the canvas to see its properties in the right panel:
- **Position & Size**: drag to move, resize handles to resize; or set exact values
- **Styling**: colors, fonts, images, opacity, border radius
- **Actions**: what happens on click (buttons) — 14 action types available
- **Conditions**: show/hide based on variables
- **Transitions**: entry animations with duration and delay

### Step 6: Assign screens to roles (Settings tab)

1. Go to **Settings** (Shift+6)
2. Under **Screen Configuration**, assign screens to their roles:
   - Title Screen → which screen shows when the game starts
   - Save Screen → which screen shows when the player saves
   - Load Screen → which screen shows when the player loads
   - Settings Screen → which screen shows for game settings
   - Pause Menu → which screen shows when the player pauses
   - Game HUD → optional always-visible overlay during gameplay

### Restoring defaults

If you accidentally break a built-in screen, click **Restore Default Screens** at the bottom of the screen list. This adds fresh default screens without deleting your existing ones.

---

## 4. Character Creator & Dress-Up

**Tabs involved:** Assets → Characters → Systems (or UI Screens) → Scenes

One unified tool covers both jobs:
- **Player character creator** — players choose who they'll play as, dress them up, and type a name. Your story then shows them (and speaks as them) anywhere via the **⟨ Player's Character ⟩** option on Show Character, Dialogue, Move, Hide, and the Character screen element.
- **Story-character dress-up** — a dress-up screen for any character. Players change hair, outfits and more, and the character wears their new look in your scenes automatically.

### Step 1: Upload character parts (Assets tab)

1. Upload all character sprite parts organized by category:
   - Hair styles: hair_1.png, hair_2.png, hair_3.png
   - Outfit options: outfit_slim.png, outfit_curvy.png
   > **Tip:** name related pieces with shared words (e.g. `jacket_slim` and `body_slim`). The wizard reads these names and offers **smart fit rules** — automatically hiding pieces that don't fit the player's other choices.

### Step 2: Create the character with layers (Characters tab)

1. Create the character (e.g., "Player Character" or the cast member to dress up)
2. Add layers matching your categories (Hair, Eyes, Outfit…) and put each category's art in its layer
3. Create a default expression that uses one asset from each layer

### Step 3: Run the wizard (Systems tab → Character Creator & Dress-Up)

1. Open the **Systems** tab → **Character Creator & Dress-Up** (or, in the UI editor, **Template Wizard → Character Creator & Dress-Up**)
2. Choose who it's for:
   - **🎮 The player's own character** — pick which character(s) the player can choose from, whether they can customize the outfit and type a name, and Generate. ⟨Player's Character⟩ is wired up automatically.
   - **🧥 A story character (dress-up)** — pick the character, choose which parts players can change (with the picker style for each), review the suggested **smart fit rules**, and choose where it goes: a new ready-to-use screen, or dropped onto the screen you're editing.
3. Everything it makes is an ordinary screen with a Customizer element — restyle or rearrange it freely afterwards. The Systems hub lists every creator/dress-up screen in your project with an Edit link.

### Step 4: Open it from your story (Scenes tab)

1. Add a **Show Screen** command pointing at the generated screen (e.g., at the very start of your first scene, or from a wardrobe hotspot)
2. The player makes their choices; the **Start / Done** button closes the screen and the story continues

### Step 5: The look carries into scenes automatically

**Show Character** automatically displays whatever the player picked — the outfit choices live in variables the engine detects on its own. For the player's own character, use the **⟨ Player's Character ⟩** option in any character dropdown.

### Legacy: AssetCycler elements

Older projects built with the previous Character Customization Wizard use **AssetCycler** + **CharacterPreview** elements bound to selection variables. Those keep working exactly as before (and can still be configured in the Properties inspector) — but new dress-ups are built on the one-element **Customizer**, which bundles the preview and all pickers with zero manual wiring.

---

## 5. CG Gallery System

**Tabs involved:** Variables → Assets → UI Screens → Settings → Scenes

### Step 1: Upload CG images (Assets tab)

1. Upload all gallery images to **Images** category
2. Optionally create a "CG" folder for organization

### Step 2: Create unlock variables (Variables tab)

1. Create a **Boolean** variable for each CG (e.g., `cg_beach_unlocked`, `cg_festival_unlocked`)
2. Set scope to **Persistent** (so unlocks survive across play sessions) or **Global** (per-playthrough)
3. Default value: `false`

### Step 3: Configure CG Gallery entries (Settings tab)

1. Go to **Settings** (Shift+6)
2. Find the **CG Gallery** section
3. Add entries:
   - **Name**: display name for the CG
   - **Asset**: the full gallery image
   - **Thumbnail**: smaller preview image (optional — uses asset if not set)
   - **Category**: group CGs into categories
   - **Unlock Variable**: the boolean variable that controls unlock state
4. Set grid configuration (columns, locked placeholder image)

### Step 4: Build the gallery screen (UI Screens tab)

**Option A: Use the CG Gallery Wizard**
1. Click the **CG Gallery Wizard** button
2. Follow the guided steps

**Option B: Manual setup**
1. Create a new UI screen (e.g., "Gallery")
2. Add a **CGGallery** element
3. The element automatically connects to your CG Gallery settings
4. Add a navigation button to return to the title screen

### Step 5: Unlock CGs during gameplay (Scenes tab)

1. At the point in your story where a CG should be revealed, add a **SetVariable** command
2. Set the unlock variable to `true` (e.g., `cg_beach_unlocked` = true)
3. Optionally add a **ShowImage** command to display the CG at that moment

### Step 6: Link gallery from title screen

1. In your **Title Screen** (UI Screens tab), add a **Button**
2. Set its action to **GoToScreen** → your Gallery screen
3. Optionally add a **Condition** so the button only appears after at least one CG is unlocked

---

## 6. Audio & Music Workflow

**Tabs involved:** Assets → Scenes → UI Screens → Settings

### Step 1: Upload audio (Assets tab)

1. Go to **Assets** (Shift+4) → **Audio** category
2. Upload your music tracks, sound effects, and ambient sounds
3. Organize into folders (e.g., "Music/", "SFX/", "Ambient/")

### Step 2: Add music to scenes (Scenes tab)

1. Drag **PlayMusic** from the Command Palette (Audio category) into your scene
2. In Properties Inspector:
   - Select the audio **Asset**
   - Toggle **Loop** on/off
   - Set **Fade-in duration** (seconds)
   - Set **Volume** (0-1) for this specific music command
3. To stop music: add **StopMusic** with fade-out duration
4. To layer sound effects: add **PlaySoundEffect** (plays alongside music)

### Step 3: Add music to UI screens (UI Screens tab)

1. Select a screen and view its properties (click background area)
2. Set **Music**: choose an audio asset
3. Set **Playback Policy**:
   - **Restart** — restart the track when entering this screen
   - **Continue** — keep playing if the same track is already playing
   - **Stop** — stop all music when entering this screen
4. Set **Ambient**: add a second audio layer (e.g., rain sounds, crowd noise)

### Step 4: Configure default volumes (Settings tab)

1. Go to **Settings** (Shift+6)
2. Set default values for:
   - **Music Volume** (0-100%)
   - **SFX Volume** (0-100%)
   - **Ambient Volume** (0-100%)
3. These are the starting volumes — players can adjust them via the Settings screen in-game

### Audio channels

Flourish supports 3 independent audio channels:
- **Music** — background music (one track at a time)
- **SFX** — sound effects (multiple can play simultaneously)
- **Ambient** — environmental audio (one track at a time)

---

## 7. Screen Effects & Overlay Effects

**Tabs involved:** Scenes

All screen effects are commands added to scene timelines.

### Basic screen effects

Drag these from **Screen FX** in the Command Palette:

| Command | What it does | Key properties |
|---------|-------------|----------------|
| **ShakeScreen** | Camera shake | Duration, Intensity |
| **FlashScreen** | Brief color flash | Color, Duration |
| **TintScreen** | Color overlay | Color, Opacity (how strongly it covers the screen), Duration |
| **PanZoomScreen** | Camera movement | Zoom level, Pan X/Y (%), Duration |
| **ResetScreenEffects** | Clear all effects | Duration (transition time) |

### Overlay effects (particle/shader system)

1. Drag **SetScreenOverlayEffect** from Screen FX
2. Choose an **Effect Type**:

| Effect | Key Parameters |
|--------|---------------|
| **CRT Scanlines** | Line spacing |
| **Chromatic Glitch** | Chromatic spread |
| **Sunbeams** | Spread, color, blend mode |
| **Shimmer** | Particle density, shimmer side (left/right/full), shimmer direction |
| **Rain** | Wind strength, drop length |
| **Snow/Ash** | Variant (snow or ash), particle size |

3. All effects share: Intensity (0-1), Speed, Blend mode (screen/overlay/soft-light/normal), Color, Duration (0 = persistent)

### Driving effects with variables (⚡ Follow a variable)

Every Screen FX command has small **⚡ "Follow a number variable"** pickers under its strength
fields. Bind one and the variable controls the value:

- **Live effects** react **while on screen** — tint opacity, overlay intensity (rain/fog/snow…),
  flashlight radius & darkness, **particle density/wind/gravity/opacity** (Spawn Particles), and
  placed-lights brightness (a 0–2 multiplier). E.g. bind rain intensity to a `storm` variable
  and every Set Variable (or a settings slider) thickens or calms the rain in real time; bind
  particle density to `snowfall` and the blizzard grows as the variable climbs.
- **One-shot effects** read the variable **when the command runs** — shake intensity, lightning
  brightness, fireworks intensity/bursts/burst height, flash duration, pan/zoom level & position.
  E.g. a shake whose strength is the player's `fear` at that moment.

The manual slider value stays as the fallback when the variable is missing. Each field's hint
shows the expected range (e.g. 0–1 or 0–100).

### Combining effects

- Effects can stack — multiple overlays active simultaneously
- Use **command stacking** (async execution) to trigger multiple effects at the same time
- Use **ResetScreenEffects** to clear all active effects with a smooth transition

---

## 8. Video & Movie Integration

**Tabs involved:** Assets → Scenes

### Step 1: Upload videos (Assets tab)

1. Go to **Assets** (Shift+4) → **Videos** category
2. Upload video files (MP4, WebM, MOV, AVI, MKV)

### Step 2: Use videos in scenes

**As a background:**
1. Drag **SetBackground** to your scene
2. Select a video file instead of an image
3. The video will loop as the scene background

**As a cutscene:**
1. Drag **PlayMovie** from Media in the Command Palette
2. Configure in Properties Inspector:
   - **Asset**: select the video
   - **Display mode**: Fullscreen (opaque overlay) or Overlay (over existing stage)
   - **Position/Size**: X, Y, Width, Height (0-100%)
   - **Object fit**: cover, contain, fill, or custom
   - **Loop**: toggle on/off
   - **Opacity**: 0-1
   - **Wait for completion**: toggle — if on, the game pauses until the video finishes
3. Add **StopMovie** to end video playback

**As a character layer:**
1. In the Characters tab, add a video asset to a character layer
2. Set loop/autoplay options
3. The video will play as part of the character's sprite composite

---

## 9. In-Scene Overlays (Text, Images, Buttons)

**Tabs involved:** Assets → Scenes

These commands place persistent visual elements on the stage that remain until explicitly hidden.

### ShowText / HideText

1. Drag **ShowText** from UI Elements in the Command Palette
2. Configure:
   - **Text content** (supports `{variable}` interpolation)
   - **Position**: X, Y (%)
   - **Size**: Width, Height
   - **Font**: family, size, color, weight, style
   - **Alignment**: horizontal + vertical
   - **Text effects**: shadow (offset, blur, color), gradient (linear/radial), border (width, color)
   - **Transition**: entry animation + duration
3. The text stays on screen until a **HideText** command removes it

### ShowImage / HideImage

1. Drag **ShowImage** from UI Elements
2. Configure: asset, position, dimensions, rotation, opacity, scaleX/Y, transition
3. Stays visible until **HideImage**

### ShowButton / HideButton

1. Drag **ShowButton** from UI Elements
2. Configure:
   - **Text**, **Position**, **Size**, **Styling** (background, text color, font, border radius)
   - **Images**: button image + hover image
   - **Sounds**: click sound
   - **Actions**: onClick array (14 action types)
   - **waitForClick**: pause the game until the player clicks this button
   - **Conditions**: only show when variable conditions are met
3. Stays visible until **HideButton**

### Common patterns

- **UI prompts**: ShowButton with waitForClick to create interactive moments
- **Persistent labels**: ShowText for HUD-like info (HP, score, time)
- **Clickable images**: ShowImage + ShowButton (invisible) layered for image-based interaction
- **Narrative moments**: ShowImage for CG/flashback scenes

---

## 10. Scripting System

**Tabs involved:** Tools menu → Script Editor → Scenes

### Step 1: Open the Script Editor

1. Click **Tools** in the header toolbar
2. Select **Script Editor**

### Step 2: Create a script

1. Click **New Script**
2. Enter a **name** and optional **description**
3. Select a **trigger**:
   - `command` — runs when called by a RunScript command in a scene
   - `onSceneEnter` — runs automatically when entering a scene
   - `onSceneExit` — runs automatically when leaving a scene
   - `global` — utility script, only runs when explicitly called

### Step 3: Write your script

Use the `game` API object:

```javascript
// Variables
let hp = game.getVariable("playerHP");
game.setVariable("playerHP", hp - 10);

// Navigation
game.jumpToScene("Game Over");
game.jumpToLabel("battle_start");

// Dialogue
game.showDialogue("System", "You lost 10 HP!");

// Audio
game.playSFX("hit_sound", 0.8);
game.playMusic("battle_theme", true);

// Utility
let roll = game.random(1, 20);
game.log("Debug:", roll);
game.notify("Critical hit!", "success");
```

### Step 4: Validate and test

1. Click **Validate** to check for syntax errors (shows line-level error/warning reports)
2. Click **Test Run** to execute in a sandboxed mock context and see console output

### Step 5: Use in scenes (Scenes tab)

1. Drag **RunScript** from the Scripting category in the Command Palette
2. In the Properties Inspector:
   - Select which **Script** to run
   - Toggle **Wait for Completion** — if on, the game pauses until the script finishes

### Security

Scripts run in a sandbox. Blocked: `document`, `window`, `fetch`, `eval`, `localStorage`, `setTimeout`, and all network/DOM access. Scripts can only interact through the `game` API.

---

## 11. Localization Workflow

**Tabs involved:** Tools menu → Localization → Assets

### Step 1: Open the Localization Panel

1. Click **Tools** in the header toolbar
2. Select **Localization**

### Step 2: Add languages

1. Choose from 10 preset languages: English, Japanese, Spanish, French, German, Korean, Chinese, Portuguese, Russian, Arabic
2. Click to add each language you want to support

### Step 3: Extract strings

The panel automatically scans your project and extracts all translatable text:
- Dialogue text
- Choice option text
- UI element text
- Button labels

### Step 4: Translate

1. Use the **inline translation editor** to enter translations for each string in each language
2. Use **Search** to find specific strings
3. Use **tag filtering** to filter by category

### Step 5: Export/Import for collaboration

- **Export CSV**: download a spreadsheet of all strings for professional translators
- **Import CSV**: upload completed translations back into the project

---

## 12. Build & Export Workflow

**Tabs involved:** Settings → Build

### Step 1: Configure project settings (Settings tab)

1. Go to **Settings** (Shift+6)
2. Set your **project title**, **author**, **description**, and **version**
3. Set the **starting scene**
4. Configure **game resolution** (1920×1080, 1280×720, etc. or custom)

### Step 2: Configure UI screens

1. Ensure your Title Screen, Save/Load screens, and Pause Menu are set up properly
2. Assign screens to roles in Settings → Screen Configuration

### Step 3: Validate

1. Open the **Build** panel (in Settings or via the Build button)
2. Click **Validate** to run pre-build checks:
   - Missing assets referenced by commands
   - Broken scene/label references
   - Unresolved variable references
3. Review and fix any warnings before building

### Step 4: Build

1. Select your **build target**:
   - **Web (HTML)**: single self-contained HTML file — works in any browser
   - **Desktop (Standalone EXE)**: a portable executable
   - **Desktop (Installer)**: an NSIS installer with desktop shortcut
2. Click **Build**
3. Watch the visual progress indicator
4. The estimated file size is shown before building

### Step 5: Download

1. When the build completes, click **Download**
2. For web builds: you get an HTML file (or ZIP for itch.io upload)
3. For desktop builds: you get an EXE or installer

### Deploying to itch.io

1. Build as **Web (HTML)**
2. Go to [itch.io](https://itch.io) → create a new project
3. Upload the HTML file (or ZIP if generated)
4. Set the project type to "HTML" and enable "This file will be played in the browser"
5. Publish

---

## 13. Template Systems

**Tabs involved:** Settings (Templates section) → Variables → UI Screens → Scenes

### Browsing templates

1. Go to **Settings** (Shift+6)
2. Find the **Templates** section
3. Browse available templates by category:
   - Character creation, outfit picker, shop system, stat tracker
   - Dating sim, mini-game, dialogue system, inventory
   - Combat, exploration, and more

### Applying a template

1. Select a template and click to configure
2. The **Template Config UI** provides a no-code form with validation
3. Fill in the configuration (e.g., stat names, shop items, character layers)
4. Click **Generate**
5. The template automatically creates:
   - Required **variables** (in the Variables tab)
   - A pre-built **UI screen** (in the UI Screens tab)
   - All necessary **UI elements** with proper bindings
6. You can then customize the generated screen and variables as needed

### Using the generated system in scenes

1. Add a **ShowScreen** command in your scene to display the template's screen
2. The screen's buttons and elements handle the logic through variable bindings
3. Use conditions on scene commands to react to variable changes made by the template system

---

## 14. Dialogue Box & Choice Styling

**Tabs involved:** Assets → Settings

### Step 1: Create styling assets (Assets tab)

1. Upload your dialogue box background image (often a semi-transparent PNG)
2. Upload a border image for 9-slice scaling (optional — for resizable borders)
3. Upload choice button images (normal + hover states)
4. Upload input box images (if using TextInput commands)

### Step 2: Configure styling (Settings tab)

1. Go to **Settings** (Shift+6)
2. Find the **UI Assets** section
3. Set:
   - **Dialogue box image** and **border image** (with border padding for 9-slice)
   - **Dialogue box width** (%), **height**, **bottom margin**, **inner padding**
   - **Choice button image** and **border image**
   - **Choice button width/height**, **inner padding**
   - **Input box image** and **border image** (for TextInput commands)

### Step 3: Configure fonts

In the same Settings section:
- **Dialogue name font**: family, size, color, weight, italic, alignment
- **Dialogue text font**: family, size, color, weight, italic, alignment, letter spacing
- **Choice text font**: family, size, color, weight, italic, alignment
- **Input fonts**: prompt font, field font, submit button font

Each font setting supports:
- Text shadow (X/Y offset, blur, color)
- Text gradient (linear/radial, angle, color stops)
- Text border (width, color)

### Step 4: Upload custom fonts

1. In the Settings font manager, click to upload custom font files (TTF/OTF)
2. The fonts become available in all font family dropdowns throughout the editor
3. Fonts are embedded in your project and included in builds

### Reset to defaults

If you want to start over, click **Reset to Defaults** in the UI Assets section.

### Timed dialogue (per-line time limit)

Any Dialogue command can carry a **Time limit (seconds)** — once the text finishes typing, the countdown runs and the story **moves on by itself**. Great for letting the novel "play itself" during dream sequences, panic moments, or unreliable-narrator tricks.

- **"Players can still click ahead"** (default on): the timer is just a maximum — clicking still advances early. Untick it to **lock** the line: clicking only reveals the text, and ONLY the timer moves the story (skip mode stops on these lines too).
- **"Show countdown bar"** draws a shrinking strip along the top of the dialogue box (same style as timed choices).
- A short limit can cut off a long voice clip — time the limit to the clip when the line is voiced.

---

## 15. Save/Load System Setup

**Tabs involved:** UI Screens → Settings

The save/load system works automatically in desktop builds with 10 save slots. To customize the UI:

### Step 1: Edit the Save and Load screens (UI Screens tab)

1. Go to **UI Screens** (Shift+3)
2. Select your **Save Screen**
3. Ensure it has a **SaveSlotGrid** element — this displays the grid of save slots
4. Configure the grid:
   - Number of visible slots
   - Grid styling (colors, borders, fonts)
   - Slot metadata display (timestamp, scene name, playtime)
5. Repeat for the **Load Screen** (can be the same screen or separate)

### Step 2: Assign screens to roles (Settings tab)

1. Go to **Settings** (Shift+6)
2. Under **Screen Configuration**:
   - Set **Save Screen** → your save screen
   - Set **Load Screen** → your load screen

### Step 3: Access from menus

1. In your **Pause Menu** (UI Screens tab), add buttons with actions:
   - Save button → **SaveGame** action
   - Load button → **GoToScreen** → Load Screen
   - Or use **LoadGame** action for direct load
2. In your **Title Screen**, add a "Load Game" button → **GoToScreen** → Load Screen

### What gets saved

Each save slot stores:
- Current scene and command index
- All variable values (Global + Persistent scopes)
- Stage state (background, visible characters, screen effects, overlays)
- Visited scenes list
- Playtime counter
- Timestamp

---

## 16. Credit Roll System

**Tabs involved:** Assets → Scenes

### Step 1: Upload assets (Assets tab)

1. Upload any background images for a slideshow behind the credits
2. Upload any foreground images/videos (logos, artwork)

### Step 2: Add the CreditRoll command (Scenes tab)

1. Drag **CreditRoll** from Media in the Command Palette
2. Configure in Properties Inspector:

**Credit entries:**
- Add **Headings** (section titles like "Director", "Art", "Music")
- Add **Credit** pairs (role + name, like "Lead Artist: Jane Doe")

**Customization:**
- **Duration**: total scroll time
- **Background color** and **Text color**
- **Skip control**: allow or prevent skipping
- **On complete**: advance to next command or return to title screen

**Slideshow backgrounds:**
- Add multiple background images
- They cycle automatically during the credit roll with transitions

**Foreground media:**
- Add images or videos with positioning, opacity, and timing
- Control when they appear and disappear during the credits

---

## 17. Command Stacking (Parallel Execution)

**Tabs involved:** Scenes

Command stacking lets multiple commands execute simultaneously instead of sequentially.

### How it works

1. Select a command in your scene timeline
2. In the Properties Inspector, enable **Run Async** (the `runAsync` flag)
3. Set a **Stack ID** — commands with the same Stack ID run in parallel
4. Set **Stack Order** to control the visual grouping

### Example: Character enters while music starts and screen fades

Without stacking (sequential):
```
1. PlayMusic "dramatic_theme"      (waits for music to start)
2. ShowCharacter Luna "Angry"       (waits for character animation)
3. TintScreen red                   (then tints screen)
```

With stacking (parallel — all happen at once):
```
Stack "entrance_moment":
  PlayMusic "dramatic_theme"        ┐
  ShowCharacter Luna "Angry"        ├── All execute simultaneously
  TintScreen red                    ┘
```

### Visual representation

Stacked commands appear grouped on the same line in the Scene Editor with a visual indicator showing they're parallel.

---

## 18. Scene Conditions & Gating

**Tabs involved:** Variables → Scenes → Settings

Scene conditions prevent players from accessing scenes until criteria are met.

### Step 1: Create gate variables (Variables tab)

1. Create boolean or number variables that track prerequisites:
   - `has_key` (Boolean, Global)
   - `completed_tutorial` (Boolean, Global)
   - `player_level` (Number, Global)

### Step 2: Add conditions to scenes

1. In the **Scenes** tab, select a scene in the scene list
2. In the scene properties, find **Conditions**
3. Add conditions that must be met to enter this scene:
   - Example: `has_key` is true AND `player_level` >= 5
4. Set a **Fallback Scene** — where the player goes if conditions aren't met

### Step 3: Set conditions via gameplay

1. Use **SetVariable** commands in other scenes to set gate variables
2. Use **Choice** actions to set variables
3. When a **Jump** command tries to enter a gated scene:
   - If conditions pass → player enters the scene
   - If conditions fail → player is sent to the fallback scene

---

## 19. Voice Sync & Lip Sync

**Tabs involved:** Assets → Characters → Scenes → Settings

Attach voice audio clips to dialogue lines so they play automatically the moment the line appears on screen. You can set a per-character default voice (great for "voice grunt" styles) or override it on individual lines for fully-voiced games. Flourish does not auto-animate a character's mouth — "lip sync" is achieved by swapping mouth expressions yourself (see Step 5).

### Step 1: Upload voice files (Assets tab)

1. Go to **Assets** (`Shift+4`).
2. Select the **Audio** category.
3. Upload your voice clips (WAV, MP3, OGG). Organize them into folders per character for clarity — e.g., "Luna/line_001.mp3".

> **Tip:** Voice clips live in the same Audio library as music and sound effects, so any audio asset can be used as a voice line.

### Step 2: Set a default voice (Characters tab — optional)

1. Go to **Characters** (`Shift+2`) and select a character.
2. Open the **Style** tab.
3. Under **Default Voice**, use the **Voice Clip** dropdown to choose an audio clip. This clip plays for every dialogue line spoken by this character unless a line overrides it. Leave it on **None** for no default.

> **Tip:** A default voice is perfect for a short "blip" that sounds on every line. For fully-voiced games, leave the default empty and assign a unique clip per line instead (Step 3).

### Step 3: Assign voice clips per line (Scenes tab)

1. Go to **Scenes** (`Shift+1`).
2. Select a **Dialogue** command in your scene timeline.
3. In the Properties Inspector, find the **Voice Clip** field (under the Content/Dialogue group).
4. Search and select the audio clip for this specific line.
5. The voice clip plays automatically as soon as the dialogue line appears.

**Which voice plays?** Flourish resolves the voice in this order:

1. **Per-line Voice Clip** — set on the Dialogue command (highest priority).
2. **Character Default Voice** — set on the character's Style tab.
3. **None** — no voice plays.

### Step 4: Set the voice volume (Settings tab)

1. Go to **Settings** (`Shift+8`).
2. Adjust the **Voice Volume** slider (0–100%). This is the default in-game volume for all voice clips; players can also change it from the in-game settings menu.

> **Tip:** Voice Volume is separate from Music, Sound Effects, and Ambient volume, so you can balance voices independently of your soundtrack.

### Step 5: "Lip sync" the mouth manually (optional)

Flourish does not move a character's mouth automatically while a voice clip plays. To simulate talking, animate the mouth yourself:

1. In the **Characters** tab, give the character a separate **mouth** layer with open/closed (or several) mouth assets, and create expressions that use them (e.g., "talk_open", "talk_closed"). See the **Character Setup** workflow for the layer/expression steps.
2. In the **Scenes** tab, add extra **ShowCharacter** commands (with **Keep Position** on, so only the expression changes) to switch between the open and closed mouth expressions across consecutive dialogue lines or with short **Wait** commands.

> **Tip:** For a hands-off "talking" look, use a short looping **video** asset as the mouth layer (configured in the character's Layers tab) instead of hand-swapping expressions.

---

## 20. Dialogue Text Effects

**Tabs involved:** Scenes (with the Properties panel), Settings

FlourishVNE can make your dialogue text come alive: letters can shake, ripple in a wave, cycle through rainbow colors, glitch, pulse, fade in, or bounce. There are two separate things you control here. The **typewriter reveal** (how fast letters appear one-by-one) is a global game setting, while **text effects** (shake, wave, rainbow, and so on) are chosen per dialogue line. Neither one requires any code.

### Step 1: Set the typewriter reveal speed

Dialogue in FlourishVNE always types out one character at a time. To change how fast that happens for the whole game:

1. Open the **Settings** tab.
2. Scroll to the **Default Game Settings** section.
3. Drag the **Text Speed** slider (range **Slow** to **Fast**, 1-100). Higher is faster; the lower end reveals letters more slowly for a deliberate, dramatic feel.

This is the default speed your players start with. A blinking cursor shows while the line is still typing, and clicking advances/finishes the line instantly.

> **Tip:** If you add a Text Speed control to one of your in-game menus (UI/Screens), players can adjust this themselves while playing — your Settings value is just the starting point.

### Step 2: Pick a text effect for a dialogue line

Text effects are applied to individual **Dialogue** commands, so you can use them sparingly for emphasis (an angry shout, a magical whisper) rather than on every line.

1. In the **Scenes** tab, click the Dialogue command you want to animate so it opens in the **Properties** panel on the right.
2. Find the **Effects** group (open it if the section is collapsed).
3. Use the **Text Effect** dropdown to choose one of:
   - **None** — plain text (the default).
   - **Shake** — letters jitter in place. Great for fear, anger, or impact.
   - **Wave** — letters rise and fall in a flowing ripple.
   - **Rainbow** — letters cycle through shifting colors.
   - **Glitch** — letters jolt and skew with a digital, corrupted look.
   - **Pulse** — letters gently grow and shrink in a heartbeat rhythm.
   - **Fade In** — letters softly fade and drift into place as they appear.
   - **Bounce** — letters bob up and down playfully.
   - **Typewriter Bounce** — each letter pops in with a springy bounce as it's revealed.

### Step 3: Fine-tune speed and intensity

When you choose any effect other than **None**, two sliders appear beneath the dropdown:

- **Effect Speed** (0.1x to 5x) — how quickly the animation cycles. Lower is slower and calmer; higher is faster and more frantic.
- **Effect Intensity** (0.1x to 3x) — how strong the movement is, such as how far letters shake, wave, or bounce.

The current value is shown next to each slider (for example, "1.0x").

> **Tip:** Subtlety reads better than chaos. For most lines, an Intensity around 1x with a moderate Speed feels natural. Save high-intensity Shake or Glitch for big dramatic moments.

> **Tip:** Effects animate the letters *after* they finish typing in. So a slow Text Speed (Step 1) paired with an effect like Wave gives a calm, steady reveal followed by a gentle motion — the two settings work together.

### Step 4: Preview your effect

Use **Test Play** / the live preview to watch the line in motion. Text effects don't show as movement in the static editor canvas, so previewing is the best way to judge whether the speed and intensity feel right. Adjust the sliders and preview again until you're happy.

---

## 21. Character Visual Effects

**Tabs involved:** Scenes

Visual effects bring a character sprite to life while it is on stage — a gentle breathing idle, a nervous shake, a magical glow, and more. Effects are attached to the **ShowCharacter** command, so the same character can have different effects in different moments of a scene. You can stack several effects on one character, and each effect has its own speed and strength sliders.

### Step 1: Select a ShowCharacter command

1. Go to **Scenes** (Shift+1) and open the scene you are working on.
2. Click the **ShowCharacter** command for the character you want to animate (or drag a new one in from the Command Palette, Characters category, and pick the character and expression first).
3. In the **Properties Inspector** on the right, open the **Effects** group (marked with the ✦ glyph).

> **Tip:** Effects belong to the moment, not the character. If you want a character to keep an effect after changing expression or position, add the same effect to the next ShowCharacter command too.

### Step 2: Add a visual effect

1. In the Effects group, click **+ Add Visual Effect**.
2. A new effect card appears (it starts as **Breathing**). Use the dropdown at the top of the card to choose the effect type:
   - **Shake** — rapid jitter, good for fear, cold, or impact.
   - **Bounce** — an up-and-down hop.
   - **Float** — a slow, drifting hover.
   - **Pulse** — a rhythmic scale in and out.
   - **Glow** — a colored halo around the sprite.
   - **Tint** — washes the sprite in a color.
   - **Silhouette** — fills the sprite with a solid color (a shadowy/blacked-out look).
   - **Breathing** — a subtle idle rise and fall, like calm breathing.
   - **Flicker** — flickers the character's opacity on and off.

> **Tip:** When the card's dropdown is empty, it shows **No effects applied.** Choosing **Remove…** in the dropdown (or clicking the ✕ on the card) deletes that effect.

### Step 3: Tune speed and power

Each effect card has two sliders:

1. **Speed** — how fast the effect plays (0.1x to 5.0x, default 1.0x). Lower is slower and calmer; higher is quicker and more energetic.
2. **Power** — the effect's strength or amplitude (0.1x to 3.0x, default 1.0x). Lower is subtle; higher is dramatic.

The value to the right of each slider shows the current multiplier (for example, **1.5x**).

### Step 4: Pick a color (color effects only)

For **Glow**, **Tint**, and **Silhouette**, a **Color** swatch appears below the sliders. Click it to open the color picker and choose the effect's color (white by default). The Color control is hidden for all other effect types because they do not use a color.

### Step 5: Stack multiple effects (optional)

1. Click **+ Add Visual Effect** again to add another card.
2. The effects combine on the same character — for example, **Breathing** for a calm idle plus a soft **Glow** for a magical aura.
3. Re-order is by add order; to remove one, click the ✕ on its card or set its dropdown to **Remove…**.

> **Tip:** Stacking is additive, so start light. Two strong effects (high Power) can fight each other visually — pair a subtle idle like Breathing or Float with a single accent like Glow or Tint for the cleanest look.

Use **Test Play** to preview the effects in motion, since the sliders animate over time and are easiest to judge while the scene is running.

---

## 22. Particle System (Spawn & Stop Particles)

**Tabs involved:** Scenes

Particles let you sprinkle atmospheric effects across the stage — drifting fireflies, falling confetti, rising embers, floating bubbles, and more. You add a **Spawn Particles** command where you want the effect to begin, then (optionally) a **Stop Particles** command later to clear it. Pick a ready-made preset for instant results, or switch to **Custom** to design your own emitter. Everything is no-code: presets, sliders, and dropdowns.

### Step 1: Add a Spawn Particles command

1. Open the **Scenes** tab and select the scene you want to add the effect to.
2. In the command list, add a new command and open the **Command Palette**.
3. Find the **Screen FX** group and choose **Spawn Particles**.

The command is added with the **Fireflies** preset by default, so you will see particles immediately when you test-play.

> **Tip:** Particles render on the stage above your characters but below the dialogue box, so they never cover up the text.

### Step 2: Choose a preset (the easy way)

With the Spawn Particles command selected, open the inspector and look in the **Content** group:

- **Particle Tag** — an optional name for this effect (for example `firefly_glow`). Leave it blank and the editor gives it a unique tag automatically. You only need a tag if you plan to stop this specific effect later (see Step 5).
- **Preset** — pick a built-in look:
  - **Fireflies** — soft glowing dots drifting upward
  - **Sparks** — fast orange sparks shooting up
  - **Bubbles** — light bubbles rising from the bottom
  - **Confetti** — colorful squares falling and spinning
  - **Embers** — glowing embers rising on the wind
  - **Dust** — slow drifting dust motes
  - **Petals** — heart-shaped petals blowing sideways
  - **Magic** — sparkly multicolor magic dust
  - **Stars** — slow twinkling stars
  - **Custom** — design your own (see Step 4)
- **Duration (sec)** — how long the effect runs before it stops on its own. Set it to **0** to keep it going until you stop it with a Stop Particles command.

> **Tip:** Presets already include their own colors, shape, gravity, and motion. When a preset (anything other than Custom) is selected, the shape/color/gravity/wind fields are hidden — the preset controls them for you.

### Step 3: Adjust the spread and intensity

Open the **Effects** group in the inspector to fine-tune any preset:

- **Density (emit rate)** — a slider for how many particles spawn per second (1–200). The hint shows the current value.
- **Speed (min / max)** — the starting speed range of each particle, in pixels per second.
- **Size (min / max)** — the size range of each particle, in pixels.
- **Emission Area** — a quick dropdown for where particles spawn from:
  - **Full Screen**, **Top Edge**, **Bottom Edge**, **Horizontal Line (center)**, **Point Source**, or **Custom Area**.
- **Emitter Center (X% / Y%)** — the center of the spawn area as a percentage of the stage (0 = left/top, 100 = right/bottom).
- **Emitter Spread (W% / H%)** — how wide and tall the spawn area is. 0 = a single point, 100 = the full width/height.

> **Tip:** Use **Top Edge** for falling effects (confetti, petals, snow-like dust) and **Bottom Edge** for rising effects (bubbles, embers, sparks).

### Step 4: Build a Custom effect

Set **Preset** to **Custom** in the **Content** group, and the **Effects** group reveals extra controls so you can design the look yourself:

- **Shape** — Circle, Square, Star, Heart, or Sparkle.
- **Lifetime (sec)** — how long each particle lives before disappearing.
- **Gravity** — a slider from -100 to 100. Negative pulls particles up, positive pulls them down. The hint reminds you which is which.
- **Wind** — a slider from -50 to 50 for sideways drift.
- **Color(s)** — a comma-separated list of hex colors (for example `#FF0000, #00FF00, #0000FF`). Each particle randomly picks one of the colors you list.
- **Options** — checkboxes for **Fade out** (particles fade as they age) and **Shrink over lifetime** (particles shrink as they age).

> **Tip:** List several colors in **Color(s)** for a livelier, varied effect — great for magic or confetti looks.

### Step 5: Stop the particles

If you set **Duration** to 0 (persistent), add a **Stop Particles** command later in the scene to clear the effect:

1. Add a command, open the **Command Palette**, and from the **Screen FX** group choose **Stop Particles**.
2. In the inspector, set the **Particle Tag**:
   - Choose **All particle effects** to clear everything currently on screen, or
   - Pick a specific emitter from the list (this is where naming your effect's Particle Tag in Step 2 pays off).
3. Set **Fade Duration (sec)** for how long the effect takes to fade away. Use **0** for an instant cut.

> **Tip:** Persistent effects (Duration 0) carry on until you stop them — including across dialogue lines and choices — so remember to add a Stop Particles command when the mood changes.

---

## 23. Inventory Items with the Systems Hub

**Tabs involved:** Systems → Items / Inventory (plus Scenes and UI/Screens to use items)

FlourishVNE collects opt-in gameplay mechanics under the new **Systems** top tab. The first system is **Inventory**, and it works through an **item registry** you manage in **Systems → Items**. Each item is really just a number variable in disguise: the item's quantity is stored in a backing number variable, so everything you already know — conditions, `{name}` text, the Set Variable command — works on it automatically. You never have to write any code.

### Step 1: Open the Systems tab and create an item

1. Click the **Systems** tab in the top navigation.
2. In the left pane you'll see your systems. Click **Items** (it shows a count badge of how many items exist).
3. In the middle **Items** column, click **Add** to create a new item. It's named `Item 1` by default and is automatically selected.

> **Tip:** Creating an item silently creates a matching number variable that tracks how many the player owns. You don't manage that variable by hand — editing the item keeps it in sync.

### Step 2: Fill in the item details

In the right-hand details pane, set up your item:

- **Name** — the item's label (also the name of its backing count variable).
- **Description (optional)** — shown in tooltips / detail panes.
- **Icon** — click to pick a project image (videos are allowed too) for inventory and shop slots.
- **Category (optional)** — a grouping label, e.g. `Consumables` or `Key Items`.
- **Shop price (optional)** — leave blank for items you never sell.
- **Starts with** — how many the player begins a new game holding. `0` means it isn't in their inventory at the start.

> **Tip:** Quantity is tracked by a number variable named after the item. Type `{ItemName}` in any dialogue, screen text, or condition to show or check how many the player owns.

### Step 3: Mark special item behavior

Two checkboxes change how the item behaves:

- **Unique (owned 0 or 1 — a key item, not stackable)** — turns the item into a one-of flag. Giving it sets the count to 1 instead of stacking.
- **Usable (player can "Use" it from an inventory)** — lets the player consume/use the item from an inventory screen.

When you tick **Usable**, an extra panel appears:

- **Using decreases the count by one (consumable)** — on by default. Leave it checked for consumables (a potion). Uncheck it for a reusable item like a tool or key that fires its effect without being spent.
- **Use effect** — add actions (e.g. Set Variable to raise health) that run when the item is used. If the item is consumable, its count is decremented automatically alongside these actions.

### Step 4: Order your items

Hover an item in the middle column and use the ▲ / ▼ arrows to move it up or down. This sets the default order used by the in-game inventory grid.

### Step 5: Use items in your story

You give, spend, and remove items from your scenes using three scene commands. In the **Scenes** tab, drag one of these into your command list:

- **Give Item** — adds to the player's count (sets it to 1 for Unique items). Optional **quantity** (defaults to 1).
- **Use Item** — runs the item's Use effect and, if the item is consumable, decreases its count by one.
- **Destroy Item** — removes some or all of the item. Set a **quantity** to remove, or turn on **all** to clear it entirely. Counts never drop below zero.

> **Tip:** These same three actions are also available as button actions in the **UI/Screens** editor — so an inventory screen's "Use" button can run **Use Item** directly, and a story event can hand out loot with **Give Item**.

### Step 6: Show an inventory in-game

1. In **Systems**, click **Inventory** (or the **Player Inventory** entry beneath it).
2. Click **Create inventory screen**. This builds a System-categorized screen pre-loaded with an item grid and a Close button, then opens the **UI/Screens** editor so you can arrange it.
3. The inventory opens in-game as a paused, dimmed overlay. Open it from any button using the **Toggle Screen** action.

---

## 24. Building an Inventory Screen (the Inventory Grid)

**Tabs involved:** Systems → UI/Screens

An inventory in FlourishVNE is just a normal screen that holds one special **Inventory** grid element. The grid automatically lays your items out into slots — you pick how many columns, and it fills the rest. The fastest way to make one is from the **Systems** tab, which builds the screen, drops in the grid, adds a close button, and opens it in the UI editor for you to arrange.

### Step 1: Create the inventory screen from Systems

1. Open the **Systems** tab and select **Inventory**.
2. To show the items the player owns, click **Create inventory screen**. To show a specific stockpile (a shop, chest, or library), open that item list first and click **Create screen for this list** instead.
3. The new screen is added as a **System**-category screen. It opens paused and dimmed over the scene, comes with an **Inventory** grid element, and includes a top-right **✕ Close** button that returns to the game. You are taken straight to the **UI/Screens** editor to position everything.

> **Tip:** Items themselves (names, icons, categories, "usable" flag, starting quantity) and item lists are all managed under **Systems → Inventory**. Build at least one item there first, or the grid will be empty.

### Step 2: Choose what the grid shows (Data source)

Click the Inventory grid on the canvas to open its Inspector, then look at the **Data source** group:

- **Bound list** — leave on **Player inventory (owned items)** to show what the player is carrying, or pick a named item list to show a shop/chest/library's own separate stock.

> **Tip:** A bound list always shows its full stock (an item at 0 reads as sold out). The **Hide unowned items** option only appears for the player's own inventory.

### Step 3: Lay out the grid

In the Inspector's layout group:

- **Columns** — how many slots across (1–10).
- **Rows** — the minimum number of slot rows. Leave this **blank (Auto)** and the grid auto-fills the element's box with empty slots — a clean "backpack" look where the whole grid is always visible. Set a number to pin a fixed grid (it pads with empty slots up to columns × rows).
- **Column spacing** / **Row spacing** — the gap in pixels between slots.
- **Category filter** — choose **All categories**, or limit the grid to one item category.

> **Tip:** Because blank Rows fills the element box, just resize the grid element on the canvas to control how many slots appear — make it taller for more rows.

### Step 4: Decide what shows in each slot (Display)

- **Hide unowned items** (player inventory only) — hides anything the player has none of.
- **Show item names** — the label under each icon.
- **Show quantity badge** — a ×N badge, shown only when the count is above 1.
- **Empty text** — the message shown when there's nothing to display (e.g. "Your bag is empty").
- **Player can rearrange** — when on, players can drag items between slots in-game, and their order is saved per save file.

### Step 5: Pick the Slot button mode

The **Slot button** dropdown sets what the little button on each slot does:

- **None** — no button; items are display-only (or selectable, see Step 6).
- **Use (consume the item)** — appears on items marked usable; consumes one and runs its use-effect.
- **Buy (from this list — a shop)** — turns the grid into a shop; price and currency come from the bound list's shop settings.
- **Sell (player's items → a shop)** — shows the player's items for selling; pick the receiving shop in **Sell to shop**.

The button is fully customizable in the Inspector's appearance group: **Button text**, **Button art** and **Hover art**, **BG / Hover / Text** colors, **Corner radius (px)**, and an optional **Button font**.

### Step 6: Style the slots

In the appearance group (the **Slot styling** section):

- **Slot background**, **Border color**, **Border radius (px)** — the look of each slot.
- **Selected ring** — the highlight color around the slot the player has clicked to select (each grid tracks its own selection).
- **Background color** — the color behind the whole grid area.
- **Name font** — when **Show item names** is on, customize the label font here.

> **Tip:** Clicking a slot in-game selects it (with the Selected ring highlight); selection is per-grid, so you can pair a grid with commands or actions that act on the selected item.

### Step 7: Open the inventory in-game

The screen exists, but the player needs a way to open it:

- **From a button:** add a button (on your HUD or a menu) and give it a **Toggle Screen** action pointing at the inventory screen. Toggling shows it as a paused, dimmed overlay; toggling again closes it.
- **With a keyboard shortcut:** select the inventory screen, and in its Screen inspector use the **Keyboard shortcut** field — click **Set shortcut** and press a key (e.g. "I"). That key toggles the screen open/closed during play. Built-in keys (Space/Enter, H, Ctrl, Esc) always take priority.

> **Tip:** The auto-created close button uses **Return to Game**. You can restyle or move it like any other button in the UI editor.

---

## 25. Item Lists & Collections (Shops, Libraries, Chests) and Restock

**Tabs involved:** Systems → Inventory, UI/Screens, Scenes

An item list (collection) is an independent stockpile — a shop, a library, a treasure chest — that holds its OWN per-item quantities, kept completely separate from what the player is carrying. The same item can live in many lists at once, each with its own stock. You can also flag one list as the player's actual inventory so it stays in sync with Give/Buy/Use/Sell. This section covers creating lists, setting per-item starting stock, restock rules, and showing a list in-game.

### Step 1: Create an item list
1. Open the **Systems** tab and choose **Inventory**.
2. In the lists column, click **New list**.
3. Select the new list to open its editor. Set the **List name** and an optional **Description (optional)** (just a note for yourself).

> **Tip:** Define your items first (also under Systems → Inventory). A list only references items that already exist — you add them from a dropdown, you don't create them inside the list.

### Step 2: Add items and set starting stock
1. Under **Items in this list**, open the **+ Add item to this list...** dropdown and pick an item. Repeat for each item the list should carry.
2. For each item you'll see a **Start** field — the quantity this list begins a new game with. (This stock is its own count, separate from the player's owned amount.)
3. The **Restock** field next to it sets the refill target (see Step 4). There's also a per-item **Price** (blank = the item's base Shop price) and an **∞** checkbox for stock that never runs out.
4. Use the trash icon to remove an item from the list.

### Step 3: (Optional) Make a list the player's inventory
1. Tick **This is the player's inventory (tracks owned items, not a separate shop stock)**.
2. When this is on, the list's counts ARE the player's owned counts — it stays in sync with Give, Buy, Use, and Sell. Leave its items empty to show everything the player owns, or add specific items to curate which ones appear.

> **Tip:** You can only toggle "This is the player's inventory" while the list has no items in it. Remove all items first if you need to change it. A player-inventory list hides the Start/Restock/Price columns and the Restock and Shop sections, because its stock is the player's owned counts.

### Step 4: (Optional) Add a restock rule
Restock only applies to stockpile lists (not the player-inventory one). Under **Restock**, click **Add a restock rule**, then set:
- **Amount**:
  - **Reset to restock amount** — each item refills to its **Restock** value.
  - **Random (min–max per item)** — each item refills to a random number between its **Min** and **Max** values (the **Restock** column becomes **Max**, and a **Min** field appears per item).
- **Trigger**:
  - **Manual (command / button)** — only refills when you run the Restock Item List command or button action (Step 5).
  - **Auto when a condition is true** — refills once each time the conditions you set become true (uses the Conditions editor).
  - **When a variable changes** — pick a **Watch variable**; the list refills every time that variable's value changes.

> **Tip:** Restock respects each backing count's own min/max bounds, so a refill never pushes a stock above a limit you've set on its variable.

### Step 5: Restock on demand (Manual lists)
For a **Manual** restock rule, trigger the refill yourself in two ways:
- **As a scene command:** in the **Scenes** tab, drag in the **Restock Item List** command (RestockCollection) and choose the list in its **Item list** field. Great for "the shop restocks overnight" between scenes.
- **As a button action:** on a screen in **UI/Screens**, give a button the **Restock Item List** action and point it at the same list.

### Step 6: Show a list in-game (bind a grid)
1. The fastest way: in the list editor, click **Create screen for this list**. This builds a System-categorized screen with an item grid already bound to this list and opens the UI editor.
2. To bind manually, select an item grid on a screen in **UI/Screens** and, under **Data source**, set the **Bound list** dropdown:
   - **Player inventory (owned items)** — shows what the player owns.
   - Any list name — shows that shop/library/chest's own separate stock.

> **Tip:** A bound list always shows its full stock (0 means sold out). The **Hide unowned items** option only applies to the player's inventory grid, not to a bound list.

---

## 26. Making a Shop (Buy, Sell, and Currency)

**Tabs involved:** Systems → Variables → UI/Screens → Scenes

A shop in FlourishVNE is just an item list with a money variable attached. You build it on a dedicated screen that shows two item grids side by side: the shop's stock (where the player taps to **Buy**) and the player's own inventory (where they tap to **Sell**). Buying spends the currency variable and moves a unit of stock to the player; selling removes it from the player and pays the currency back. Buttons automatically dim and disable when the player can't afford an item, it's out of stock, or they don't own it. Nothing here requires code.

### Step 1: Create the money variable

1. Open the **Variables** tab.
2. Add a new variable of type **Number** — for example, name it **Gold** and give it a starting value (e.g. 100).
3. This is the player's wallet. Buy will subtract from it; Sell will add to it.

> **Tip:** Use a plain, readable name like *Gold* or *Coins* — you'll show it to the player later with text interpolation (Step 6).

### Step 2: Define your items and base prices

1. Open the **Systems** tab and go to **Items**.
2. Create each item you want to sell. For each one set:
   - **Name** and an **Icon** (an image or video asset).
   - **Shop price (optional)** — the item's base price in the shop's currency.
   - **Starts with** — how many the player begins a new game holding (0 = not in their bag at the start).
   - **Unique (owned 0 or 1 — a key item, not stackable)** if it should be a one-of item; shops mark it sold-out once bought.

### Step 3: Turn an item list into a shop

1. Still in **Systems**, go to **Inventory** and create a new item list — for example **General Store**.
2. Add the items you want this shop to carry as entries.
3. Scroll to the **Shop (buy / sell)** section and set:
   - **Currency variable** — choose your **Gold** variable. (Leaving this on *None (free / not a shop)* means it isn't a shop.)
   - **Sell rate (× price)** — the fraction of an item's price the player gets back when selling here. Default is **0.5** (half price).
   - **Sold items go back into this shop's stock** — tick this if you want items the player sells to reappear on the shelf; leave it off and sold items simply vanish.
4. Per item in the list you can also set a **Price** override (falls back to the item's base Shop price) and an **Infinite stock** toggle so that item never runs out and buying it doesn't decrement the shelf.

> **Tip:** A Sell rate of 1 means the player gets the full price back; anything above 1 means they profit from reselling. Keep it below 1 (the default 0.5 is typical) so trading isn't free money.

### Step 4: Build the shop screen with two grids

A shop is a screen with **two item grids**.

1. Open the **UI/Screens** tab and create a new screen (e.g. *Shop*).
2. Add an **Item Grid** element for the shop's stock. In its inspector under **Data source**, set **Bound list** to your shop list (**General Store**). Then set **Slot button** to **Buy (from this list — a shop)**. Each slot now shows a Buy button that uses the bound list's currency and prices.
3. Add a second **Item Grid** for the player's inventory. Leave its **Bound list** on **Player inventory (owned items)**. Set its **Slot button** to **Sell (player's items → a shop)**, then set the **Sell to shop** field to your shop list (**General Store**) so sales are credited to the right currency and sell rate.

> **Tip:** The Buy/Sell button on each slot disables itself automatically — greyed out when the player can't afford it, the shelf is out of stock, or they don't own the item. You don't have to script any of that.

### Step 5: (Optional) Selected-item or single-item buttons

If you'd rather have one shared button instead of a button on every slot, you have two approaches.

- **Selected-item buttons:** Add a regular **Button** element and give it the action **Buy Selected Item** or **Sell Selected Item**, pointing it at your shop list. The player taps an item in the grid to select it, then taps the button. (It's a no-op if nothing is selected or the trade is blocked.)
- **Fixed single-item buttons:** Give a Button the action **Buy Item** or **Sell Item** and choose a specific **Item** plus the **Shop list to buy from / sell to**. Good for a "Buy this one special item" button.

These same trades also exist as **scene commands** — **Buy Item** and **Sell Item** in the **Items** command category — so an event in the **Scenes** tab can run a purchase or sale during the story (for example, a forced plot purchase).

### Step 6: Show the player's money

1. On the shop screen, add a **Text** element.
2. Type something like `Gold: {Gold}` — wrap the variable's exact name in curly braces. FlourishVNE replaces `{Gold}` with the live value, so the wallet updates as the player buys and sells.

> **Tip:** The name inside the braces must match the variable's name exactly. If you rename the variable later, update the text too — interpolation is matched by name, not by ID.

### Step 7: Open the shop and test

1. From a scene in the **Scenes** tab, use a command that shows your shop screen so the player can reach it.
2. Press test-play and try buying and selling. Watch the **Gold** text change, the stock counts go down as you buy, and buttons disable when you're broke or out of stock.

---

## 27. Screen Categories, Overlay Behavior & Open Hotkeys

**Tabs involved:** UI/Screens (Screen Properties inspector) → Scenes / Events (for the Toggle Screen button action)

Every screen in FlourishVNE can be tagged with a category for tidy organization, and screens used as in-game overlays (like a HUD, inventory, or stats popup) get extra behavior controls: pause the scene while open, dim or blur what's behind, choose what happens when the overlay closes, and bind a single keyboard key that toggles the screen on and off during play. None of these settings require any code.

### Step 1: Pick a Category for the screen

1. Open the **UI/Screens** tab and select a screen to open the **Screen Properties** inspector on the right.
2. Find the **Category** field near the top. Open the dropdown and choose one of: **Menu**, **HUD**, **Overlay**, **System**, or **Screen**.
3. Leave it on the **Auto (...)** option to let the editor guess the category from the screen's role — your Title, Pause, Save, Load, and Settings screens are auto-tagged **Menu**, and your Game HUD screen is auto-tagged **HUD**.

A small colored dot next to the dropdown shows the category's color: Menu is sky blue, HUD is amber, Overlay is lavender, System is mint green, and Screen is neutral slate. These colors and labels are an editor-only organization aid that color-codes the screen list and filters in the Systems hub.

> **Tip:** The category has no effect on the game itself — it only changes how the screen looks in the editor. Tagging a screen as **HUD** or **Overlay** also unlocks the Overlay Behavior section described below.

### Step 2: Set up Overlay Behavior (HUD & Overlay screens)

The **Overlay Behavior** section appears in the inspector once a screen's category is **HUD** or **Overlay** (or if it already has any overlay setting saved). Inside it you can configure:

- **Pass-through clicks** — When on, empty areas let clicks reach the scene beneath, so only your visible buttons capture input. The Game HUD screen defaults to on. (When pass-through is on, a **Show above dialogue & choices** checkbox appears so the overlay can render on top of the dialogue box, letting players open and use it mid-dialogue.)
- **Pause scene while open** — Freezes the scene behind the screen while it's open: no auto-advance, no skip, and no clicking past. The scene stays visible but paused. Ideal for an inventory or stats popup opened during dialogue.
- **Backdrop dim (0–1)** — Draws a dark layer between the scene and your overlay. Enter a value from 0 (none) to 1 (fully black) to "dim the room" behind the popup.
- **Backdrop blur (px)** — Blurs everything behind the overlay by the number of pixels you enter (0 = none).

### Step 3: Choose what happens when the overlay closes

Still in **Overlay Behavior**, use the **When this screen closes** dropdown to decide what the game does after the overlay is dismissed (via a Return button, the toggle key, or going back):

- **Default** — Keeps the existing behavior.
- **Resume (don't advance)** — Returns to the story without moving it forward (best for an inventory you just glance at).
- **Advance the story** — Moves the story forward one step on close.
- **Run actions** — Reveals an **On-close actions** list; the actions you add there run when the overlay closes, then the story resumes.

> **Tip:** Pair **Pause scene while open** with a small **Backdrop dim** for a classic "modal popup" feel — the scene freezes and darkens, your overlay stands out, and **Resume (don't advance)** sends the player right back where they were.

### Step 4: Add a keyboard shortcut that toggles the screen

This is the per-screen **Keyboard shortcut** mapper near the top of the inspector — perfect for an inventory key:

1. In the **Keyboard shortcut** field, click **Set shortcut**.
2. The button changes to **Press a key…** — now press the key you want, for example **I** for an inventory.
3. The captured key is shown as **Key: I**. To remove it, click **Clear**. (To cancel while listening, press **Esc**.)

In-game, pressing that key toggles the screen open and closed. The match is case-insensitive.

> **Tip:** Built-in keys always win: **Space/Enter** (advance), **H** (history/log), **Ctrl** (skip), and **Esc** (pause) take priority, so don't map those. Your shortcut is also ignored while the player is typing in a text field or while another overlay or the history log is open.

### Step 5: Open or toggle a screen from a button

To open these screens during play, add a button action — there is no new scene command for this:

1. On any button (in a screen or HUD), open its actions and add a **Toggle Screen** action, then pick the target screen. This opens the screen if closed and closes it if already open — a great match for a screen that also has a toggle hotkey.
2. To bring a screen up from the story timeline, drag a **Show Screen** command (which already exists) into a scene in the **Scenes** tab.

> **Tip:** Give an inventory both a **Toggle Screen** button on the HUD and an **I** keyboard shortcut, so players can open it however they prefer — both routes respect the same Overlay Behavior and on-close settings.

---

## 28. Customizing the In-Game Quick Menu

**Tabs involved:** UI/Screens → In-Game UI → Quick Menu

The quick menu is the little bar of buttons that floats during dialogue, letting the player Skip, Auto-advance, open the Log, jump Back, and Save/Load. You can reposition it, restyle it, hide buttons you don't want, give each button your own artwork, and even add your own extra buttons that run any action. It's all no-code: you edit it visually and the changes show up live.

### Step 1: Open the Quick Menu editor

1. Go to the **UI/Screens** tab.
2. At the top, switch the mode toggle from **UI Screens** to **In-Game UI**.
3. In the element list, choose **Quick Menu** (described as "Skip, Auto, Log, Back buttons"). The canvas shows a dimmed dialogue box so you can see where the menu sits, and the properties panel on the side fills with Quick Menu settings.

> **Tip:** The canvas preview is a real layout preview. Whatever position, color, or art you set here is exactly what the player sees mid-dialogue.

### Step 2: Place the bar with a Position Preset

1. Open the **Position Preset** dropdown and pick one:
   - **Above Dialogue** (the default) — sits just above the dialogue box.
   - **Top Right** / **Top Left** — pins it to a corner of the screen.
   - **Bottom Right (pushes dialogue up)** / **Bottom Left (pushes dialogue up)** — sits at the bottom edge; the dialogue box is nudged up to make room.
   - **Hidden** — removes the quick menu entirely.
2. To nudge it more precisely, drag the menu on the canvas. Once you've dragged it, a **Reset to Preset Position** button appears — click it to snap back to the clean preset placement.

> **Tip:** If you choose a bottom preset but don't want the dialogue box to move, turn on **Float Over Dialogue** (next step). The menu will then sit on top of the dialogue instead of pushing it up.

### Step 3: Style the buttons

In the properties panel:

1. **Button Color** — the background color of the button pills.
2. **Opacity** — how see-through the buttons are (default 75).
3. **Border Radius** — how rounded the button corners are (default 4).
4. **Float Over Dialogue** — when checked, the menu floats over the dialogue box instead of reserving space and pushing it up.

### Step 4: Show or hide the built-in buttons

Under the **Buttons** header you'll find the six built-ins, each with its own checkbox: **Back**, **Log**, **Auto**, **Skip**, **Save**, and **Load**.

1. Uncheck any button you don't want the player to see.
2. The Skip button only appears in-game when skipping is allowed in your game settings, so leaving it on is safe.

### Step 5: Give a button custom artwork

For each visible built-in button you can replace the plain pill with your own image:

1. **Image** — pick an uploaded image to use as the button. Leave it on **None (use default style)** to keep the built-in icon look.
2. **Hover Image** — pick a second image shown when the player's mouse is over the button.

> **Tip:** Button art always keeps its aspect ratio (object-contain), so your images are never stretched or squished. Upload your button art on the **Assets** tab first so it shows up in these dropdowns.

You can also override what a built-in button *does*: under **Custom action** for that button, set an action. This overrides the button's built-in behavior (so, for example, the Save button could open your own custom save screen instead). Leave it as **None** to keep the default behavior.

### Step 6: Add your own Custom Buttons

Under the **Custom Buttons** header you can create extra buttons beyond the six built-ins:

1. Click **+ Add custom button**.
2. Type a **Button label**.
3. Set its **Action** — this is what the button does when clicked (e.g. open a screen, set a variable). A button with no action does nothing.
4. Optionally give it an **Image** and **Hover Image** just like the built-ins.
5. Use the checkbox beside the label to toggle the button **Visible**, or the ✕ to remove it.

In the default grouped layout, custom buttons appear inline right after the built-ins.

### Step 7: Switch to Independent Button Layout (optional)

By default all buttons render as one tidy bar. If you'd rather place each button on its own:

1. Check **Independent Button Layout**. The hint reads: "Place each button anywhere on the canvas, independent of the others. When off, the buttons form a single bar."
2. Now each button (built-in and custom) can be dragged and resized individually on the canvas, or given an exact **Width** and **Height** in its panel.
3. **Fit clickable area to the art (trim empty space)** — check this on a button to shrink both the visible art and the clickable area down to the fitted image, so there's no oversized invisible hitbox or empty margin around a small icon.

> **Tip:** Independent layout is perfect for scattering stylized buttons around a themed HUD. Grouped layout is best when you just want a clean, evenly-spaced toolbar.

---

## 29. Customizing Choice Buttons

**Tabs involved:** Scenes (Properties Inspector + Staging Area)

The **Choice** command shows the player a set of buttons to pick from. By default those buttons use your global, centered choice style (set under Settings / In-Game UI). But you can override the look of any single Choice command — and even hand-place each button on the stage — right from the **Properties Inspector**, without touching that global style. Anything you leave blank simply falls back to the global look, so you only customize what you want.

### Step 1: Select your Choice command

1. Open the **Scenes** tab and click the scene that holds your choice.
2. In the command list, click the **Choice** command to select it. Its settings open in the **Properties Inspector** on the right (under the **Content** group).
3. You'll see your list of options, each with its **Option N Text**, **Conditions**, **Actions**, and an **Appearance** section.

> **Tip:** If you haven't added a Choice command yet, drag one in from the command palette first, then add options with **Add Option**.

### Step 2: Pick a layout

At the top of the Choice settings, set the **Layout** field. There are three choices:

- **Vertical** — the classic centered stack of buttons. This is the default; leaving it on Vertical keeps the global centered style untouched.
- **Horizontal** — the buttons sit in a centered row instead of a column.
- **Free** — each button is positioned individually by its own X / Y / Width / Height (you place them anywhere on the stage).

> **Tip:** Only switch to **Free** when you want buttons in unusual spots (for example, hot-spot style choices placed over parts of the artwork). Vertical and Horizontal handle most visual novels.

### Step 3: Style each option's appearance

Scroll to the **Appearance** section under any option. Every field here is optional — leave it empty to inherit the global choice style. You can set:

- **Image** — custom button art (an image asset) for the normal state.
- **Hover Image** — art shown while the player hovers over that button.
- **Background Color**, **Hover Background Color**, **Text Color** — the button's fill, its hover fill, and the label color.
- **Font Size** — the option's text size in pixels.
- **Corner Radius** — how rounded the button corners are, in pixels.

> **Tip:** Mixing custom art with a background color works well — the color shows through where the art is transparent, and acts as a fallback if the image is missing.

### Step 4: Position buttons in Free layout

When **Layout** is set to **Free**, each option also gets **X (%)**, **Y (%)**, **Width (%)**, and **Height (%)** fields, all measured as a percentage of the stage. You can either type exact numbers here, or arrange the buttons visually:

1. With the Choice command still selected, look at the **Staging Area** canvas. Each option appears as a draggable, labeled box ("Choice 1", "Choice 2", and so on).
2. **Drag** a button to move it anywhere on the stage.
3. **Drag a corner/edge handle** to resize it.

The canvas and the X / Y / Width / Height fields stay in sync — drag updates the numbers, and editing the numbers moves the button.

> **Tip:** Buttons only become draggable on the canvas while their Choice command is the selected command. If you can't grab them, re-select the Choice command in the Scenes command list.

### Step 5: Preview and reset

- Use test-play / preview to confirm the buttons look right, including hover art and hover colors.
- To go back to the global look for a field, just clear it (leave it blank) — that option falls back to your project's In-Game UI choice style again.

> **Tip:** Customizations live on each individual Choice command and each individual option, so you can give one scene flashy custom buttons while every other choice in the game keeps the shared default style.

---

## 30. Layering & Parallax Depth

**Tabs involved:** Scenes · UI/Screens (Inspector → Transform group, plus the scene/screen Parallax settings)

FlourishVNE lets you control exactly what draws in front of what — for both scene visuals and UI screen elements — and add a sense of depth so layers drift as the player moves the mouse or as the camera pans. Everything here is optional: leave the controls untouched and your project looks exactly as it always has. There are no new scene commands to learn; the controls live in the Inspector and the scene/screen settings panels.

### Step 1: Set a visual's stacking order (Layer)

Every stage visual (background, character, image, text, button, placed video) and every UI screen element has a **Layer (stacking order)** control. Higher numbers draw nearer the viewer; lower numbers sit behind.

1. In the **Scenes** tab, click a visual command (for example **ShowCharacter** or **ShowImage**) to open its Inspector, then open the **Transform** group. For a UI element, do the same in the **UI/Screens** tab.
2. Find **Layer (stacking order)**. You can type a number directly, or use the buttons:
   - **⤒ Front** — bring this in front of everything else on the same surface.
   - **↑** — move forward one step.
   - **↓** — move back one step.
   - **⤓ Back** — send behind everything else.

The Front/Back buttons do the math for you against the other items on the same scene or screen, so you never need to memorize z-numbers.

> **Tip:** Layer lets a character move in front of an image, or an image slide behind a character — something insertion order alone could never do. If you never touch Layer, items stack in their old default order.

> **Tip:** Layer only orders *stage content* and screen elements. The dialogue box, name box, quick menu and confirm dialogs always stay on top, so you can't accidentally hide the player's controls behind artwork.

### Step 2: Build multi-plane parallax backgrounds

A single backdrop can be split into several stacked planes, each drifting at its own speed for a true sense of depth.

**In a scene (SetBackground command):**
1. In the **Scenes** tab, select your **SetBackground** command and open the **Content** group.
2. Tick **Stack (don't replace)**. Instead of replacing the current background, this adds the image/video as its own backdrop plane.
3. Set its **Layer** with the ↓ / number / ↑ row (default 0 = just above the base background; raise it to sit in front of stage visuals, use a negative number to push it further back).
4. Add several stacked SetBackground commands at different layers and depths to build the scene.

**On a UI screen (UI/Screens tab → Background section):**
1. The main background has its own **Layer** and **Depth** controls.
2. Under **Additional backgrounds**, click **+ Add** to create extra backdrop planes ("Plane 1", "Plane 2", …). For each plane choose a **Type** (Color / Image / Video), pick the asset, and set its own **Layer** and **Depth**.

> **Tip:** Give a distant sky plane a low Depth (it barely moves) and a near foreground plane a higher Depth (it moves more) — the difference between them is what reads as depth.

### Step 3: Give each visual a Parallax depth

**Parallax depth** decides how much an individual item drifts. It composes independently of Layer, so changing one never affects the other.

1. Open a visual command or UI element Inspector and go to the **Transform** group.
2. Drag the **Parallax depth** slider: **0** means locked in place (no drift); higher values (up to 2.00) drift more.
3. Placed (overlay) videos also have a Parallax depth in their movie settings — a fullscreen movie has no margin to drift into, so depth is best used on placed videos.

Parallax depth only has a visible effect once you turn on a Parallax **Mode** for the scene or screen (Step 4).

### Step 4: Turn on Parallax for the scene or screen

Parallax depth does nothing until you pick a driver in the scene's or screen's **Parallax** settings.

**For a scene:** open the scene configuration panel and find the **Parallax** section. **For a UI screen:** open the **UI/Screens** Inspector and expand the **Parallax** section.

Set **Mode** to one of:
- **Off** — no parallax (the default; identical to old behavior).
- **Follow mouse** — visuals drift toward the pointer's offset from center.
- **Camera (pan/zoom)** — visuals shift as **Pan/Zoom Screen** camera moves play; nearer/higher-depth layers sweep past farther ones.
- **Both** — combines mouse and camera.

When a mode other than Off is active, an **Intensity** slider appears (0–3×) as a global multiplier on every item's drift.

> **Tip:** Screens have no camera (Pan/Zoom is a scene-only feature), so **Camera** mode has no effect on a UI screen — use **Follow mouse** for title screens and menus that should react to the cursor.

> **Tip:** Camera parallax is powered by your existing **Pan/Zoom Screen** commands — depth-0 layers travel with the camera and higher-depth layers move more, so add some pan to the scene to see it in action.

### Step 5: Backward compatibility

Layer, Parallax depth, the SetBackground **Stack** option, additional backgrounds, and the scene/screen Parallax **Mode** are all optional additions. Any project made before these existed loads with them unset and looks pixel-identical, and your saves and exports stay fully compatible.

---

## 31. Keep Character Expressions in Place

**Tabs involved:** Scenes (with Characters for setup)

Normally, every Show Character command places the sprite at the position you choose (often the center). That means changing only a character's expression or pose can make them jump back to center even if they were standing off to one side. The new **Keep current position (expression change only)** option fixes this: when the character is already on stage, the next Show Character command swaps the expression while leaving the sprite exactly where it is.

### Step 1: Place the character the first time

1. Open the **Scenes** tab and select your scene.
2. Drag in a **Show Character** command.
3. Pick the character and an expression, then set the **Position** under the transform group as usual (for example, off to the left or right).

This first command is what actually positions the character on stage. Leave **Keep current position** unchecked here.

### Step 2: Add a follow-up Show Character to change the expression

1. Later in the same scene, drag in another **Show Character** command for the *same* character.
2. Choose the new expression or pose you want.
3. In the command's transform group, tick the checkbox **Keep current position (expression change only)**.

When this box is checked, the **Position** (and slide Start/End position) fields are hidden, because position is no longer used — the sprite simply stays where it already is.

> **Tip:** The on-canvas hint confirms it: "The character stays where it already is on stage; only its expression/pose changes." The new expression, pose, scale, and visual effects still apply — only the position is left untouched.

### Step 3: Preview it on the Staging Area

You don't have to test-play to check this. The editor's Staging Area canvas previews the same behavior: with **Keep current position** turned on, the character shown in the canvas keeps its existing spot instead of snapping back to center.

> **Tip:** If the character is *not* already on stage when this command runs, Keep current position has nothing to keep, so the sprite appears at the command's normal Position. Use it only for follow-up expression or pose changes on a character that's already visible.

---

## 32. Variables, Conditions & the Live Variable Tracker

**Tabs involved:** Variables → Scenes / UI/Screens

Variables are the memory of your story: a number that tracks affection, a yes/no flag for whether a door is unlocked, or a piece of text like the player's name. Once you have variables, you can use plain-language **conditions** to gate dialogue, choices, and button actions, and you can watch every value change in real time with the editor-only **Variable Tracker** while you test-play.

### Step 1: Create a variable

1. Open the **Variables** tab.
2. Click **Add Variable** at the bottom of the list. A new variable is created (named automatically — for example "Variable 1") as a **Number** with a default of 0.
3. Double-click the new entry (or use the pencil icon) to rename it to something meaningful, like "Affection" or "PlayerName".
4. Each row shows a small **type icon** (`#` number, `Aa` string, `✓` boolean) and a colored **scope** badge so you can scan the list at a glance.

> **Tip:** Keep variable names short and clear. You'll reference them later in conditions and in text using curly braces, like `{Affection}`.

### Step 2: Set its type, default value, and scope

Select the variable to open the inspector on the right, then set:

- **Type** — choose **Number**, **Text** (string), or **Yes/No** (boolean).
- **Default value** — the starting value when a new game begins. For Number you type a number, for Text you type words, for Yes/No you pick from a dropdown.
- **Scope** — how long the value lives:
  - **Local** — resets every time the scene changes (good for one-scene counters).
  - **Global** — persists across scenes within a single playthrough but resets on a new game. This is the default.
  - **Persistent** — saved between play sessions and survives a new game (good for CG Gallery unlocks and "have you ever..." flags).

> **Tip:** For Yes/No variables you can set custom on/off labels (for example "Locked" / "Unlocked" instead of "Yes" / "No"). Those labels show up everywhere the value is displayed, while the stored value stays a true/false.

### Step 3: Clamp number variables with Min and Max (optional)

Number variables can have an inclusive **Min** and/or **Max** bound. When set, every write is clamped so the value can never go below the minimum or above the maximum.

- Set **Min** to 0 to stop a stat like affection from ever going negative.
- Set **Max** to cap a meter (for example a relationship value that tops out at 100).

You don't have to fill both — set only the one you need, or neither.

### Step 4: Gate commands and choices with plain-language conditions

Conditions decide whether something happens. They appear on scene commands, on individual **Choice** options, and on screen elements/button actions in **UI/Screens**.

1. Find the **Conditions** section on a command, choice option, or screen element (it may be a collapsible panel with a count badge).
2. Click **Add Condition**.
3. Pick the **Variable**, then an **Operator**, then (when needed) a **Value**:
   - **Number** operators read as plain English: *is*, *is not*, *is greater than*, *is less than*, *is at least*, *is at most*.
   - **Text** operators: *is*, *is not*, *contains*, *starts with*.
   - **Yes/No** operators: *is on* / *is off* — these need no value box, because the operator already says it.
4. A small italic preview line under each condition restates it in plain words (for example "Affection is at least 5") so you can confirm it reads correctly.
5. Add more than one condition to combine them. A connector dropdown (**AND** / **OR**) appears between conditions so you can build rules like "Affection is at least 5 AND DoorUnlocked is on."

> **Tip:** Item quantities are ordinary Number variables. That means you can write a condition like "Potions is at least 1" to only show a "Drink potion" choice when the player actually has one — and you can show the live count in any dialogue or label by typing `{Potions}`.

### Step 5: Watch values live with the Variable Tracker (test-play only)

While you test-play your project inside the editor, a **Variables** button sits in the top-left corner of the preview.

1. Click **Variables** to open the tracker panel.
2. Every variable is listed with its **name**, a small **scope dot** (green = Local, blue = Global, amber = Persistent), and its **current live value**.
3. Play through your scene and watch values update in real time as commands run and choices fire — perfect for confirming an affection gain or an item count changed as expected.

This tracker is an editor-only helper. It is never shown in your exported or standalone game.

> **Tip:** If the tracker says "No variables yet," head back to the **Variables** tab and add one. Note that some auto-managed variables (like a shop's stock count) are hidden from the Variables list to keep it tidy, but they still appear in the live tracker so you can debug them.

### A note on hidden (internal) variables

Some variables are created and managed automatically by other systems — for example the per-list stock count behind a shop. These are flagged as internal and are **hidden from the Variables list** so it stays calm. They still work everywhere by name: you can reference them in conditions, show them in text with `{name}`, and change them with Set Variable. You'll also see them in the live Variable Tracker during test-play.

### Test play from any line (▶ Play from here)

Hover any command row in the Scenes tab and a small **▶** button appears — click it to launch test play **starting at that exact line**, skipping the title screen. The scene's visual setup (background, characters on stage, music, lights, overlays) up to that point is applied automatically so the stage looks right.

Two things to know:

- It's a **fresh run with default variables** — anything a player would normally set on the title screen (like a created character) uses defaults. For testing deep story state, combine it with the Variable Tracker's −/＋ buttons.
- Only **this scene's** setup is replayed; story flow (variables set in earlier scenes, jumps) is not simulated.

The popped-out Test Play window's **⟲ Reload to line** does the opposite job: it jumps an *already-running* game to the line you're editing while keeping your variables.

---

## 33. Interactive Hot Spots (Scenes & Screens)

**Tabs involved:** Scenes (Show Hot Spot command) and/or UI/Screens (Screen Properties → Interactivity)

A **Hot Spot** is an invisible (or lightly highlighted) region you place on top of a background or screen. When the player **clicks**, **hovers**, or **drops something onto** that region, it runs the actions you choose. Hot Spots are FlourishVNE's point-and-click tool — they are how you make a "click the door to go inside," "hover the painting for a hint," or "drag the key onto the lock" interaction.

> **Tip:** A Hot Spot is an *invisible* region. If you instead want a **visible** clickable or draggable thing — an image, a button, or one picture with many clickable areas — use an **Interactive Element** (see [section 36](#36-interactive-elements-clickable--draggable-images-buttons--regions)).

There are **two kinds**, and they work the same way:

- **Scene Hot Spot** — a temporary spot that lives in the story timeline. Use it when a spot should appear at a certain moment and go away later.
- **Screen Hot Spot** — a permanent spot that's part of a UI screen. Use it for map screens, inventory backdrops, or any always-present clickable area.

### Step 1: Add a Hot Spot

**On a scene (story timeline):**

1. Open the **Scenes** tab and select the scene.
2. In the command palette, open the **UI Elements** category and drag **Show Hot Spot** into your command list.
3. Position and size it on the stage canvas, or with the X / Y / Width / Height fields in its properties.
4. Add a **Hide Hot Spot** command later if you want to remove it (it targets the Show Hot Spot by its command).

**On a UI screen (permanent):**

1. Open the **UI/Screens** tab and select a screen.
2. In the **Screen Properties** inspector on the right, open the **Interactivity** section and click **Add Hot Spot**.
3. Drag and resize the new spot on the screen canvas.

### Step 2: Choose its shape, visibility, and trigger

In the Hot Spot's properties you can set:

- **Shape** — **Rectangle** or **Circle**.
- **Visible / highlight** — by default a Hot Spot is **invisible** in the game (the player just sees the background). Turn on its highlight and pick a **highlight color** if you want the region to be visibly tinted (handy for accessibility or a "things you can click glow" style). Invisible spots still show on the editor canvas so you can position them.
- **Trigger** — what activates it:
  - **Click** — fires when the player clicks the region (the most common).
  - **Hover** — fires when the pointer moves over it (good for tooltips/peeks).
  - **Drop** — fires when the player **drops a dragged object or carried item** onto it (see Step 4).
- **Advance on trigger** (scene Hot Spots) — when on, activating the spot also advances the story to the next command.

### Step 3: Give it actions (and optional conditions)

1. Open the Hot Spot's **Actions** list and add one or more actions — the same action set buttons use: **Jump to Scene**, **Set Variable**, **Give Item**, **Show Screen**, **Play Sound**, **Call Common Event**, and so on.
2. (Optional) Add **Conditions** so the spot only works when they're met — for example, a door spot that only opens once `HasKey is on`.

> **Tip:** Because Hot Spots run the full action list, one spot can do several things at once — e.g. *Set Variable `DoorOpen` = on*, *Play Sound (creak)*, then *Jump to Scene (Hallway)*.

### Step 4: Drag-and-drop interactions (tags & carried items)

Hot Spots with the **Drop** trigger are drop zones. There are three ways to deliver something to them, all matched by a shared **tag** system so the right object lands on the right spot:

- **Drag a screen object onto a spot** — give a draggable screen element a **Drag tag** (in its Behavior section), and give the drop-zone Hot Spot an **Accept objects tagged** value. A drop only succeeds when the tags match (or when you list the specific element in the spot's *Accepted Elements*). Example: tag every key element `key` and set the lock spot to accept `key`, so any key works; tag only the correct key to make just that one work.
- **Carry an item from the inventory** — mark an item **"Use by carrying it onto the scene"** (Systems → Items) and give it a **Drag tag**. In-game, the player clicks the item's **Use**, the item attaches to the cursor (the inventory closes), and they click a Hot Spot to use it there. If the item's tag matches the spot, the item is consumed (unless you made it reusable) and the spot's drop actions run.
- **Drag a scene item icon** — a **Show Item** command can be marked **"Player can drag it onto a hot spot"**, letting the on-scene item be dragged straight onto a matching drop zone.

> **Tip:** Tags are free text with autocomplete — the editor remembers tags already in use so you don't introduce typos. Keep them simple, like `key`, `coin`, or `tool`.

### Hot Spot vs. Interactive Element — which do I use?

- Use a **Hot Spot** when you want an **invisible (or highlighted) region** over a background — the player can't "see" it, they just click/hover/drop where you tell them to.
- Use an **Interactive Element** when you want a **visible thing** the player interacts with — a clickable image or button, a draggable object, or a single picture with many clickable areas (regions). That's covered next, in [section 36](#36-interactive-elements-clickable--draggable-images-buttons--regions).

---

## 34. Inventory, Items & Stats — the Systems Hub

**Tabs involved:** Systems (Items / Inventory / Stats) → UI/Screens (to show them) → Scenes (to change them)

FlourishVNE keeps its RPG / dating-sim mechanics under one **Systems** top tab. Three of them work together and share one idea: **everything is built on plain number variables**, so conditions, `{name}` text, and the Set Variable command all work on them with no code.

- **Items** — things the player can carry, give, use, buy, and sell.
- **Inventory** — the screens (grids) that show owned items, shops, chests, and libraries.
- **Stats** — named values like Affection, Health, or Reputation (global, or per-character).

This section is the map. The detailed click-by-click for Items, the Inventory grid, item lists, and shops lives in **sections 23–26** above; this one orients you, covers **Stats** in full, and then highlights the two things that make inventories and shops actually behave: **overlay behavior** and **hotkeys**.

### Items, Inventory, and Shops at a glance

1. **Items** — open **Systems → Items** and click **Add**. Give it a name, icon, "Starts with" quantity, and (optionally) mark it **Usable**. Each item is secretly a number variable, so `{ItemName}` shows the count anywhere. *(Full walkthrough: section 23.)*
2. **Inventory grids** — a screen holding one **Inventory** grid element auto-arranges owned items into slots. The quickest path is **Systems → Inventory → Create inventory screen**. *(Full walkthrough: section 24.)*
3. **Item lists & shops** — separate stockpiles (a shop, chest, or library) are **item lists**; a shop adds a currency variable and per-slot **Buy** / **Sell** buttons. *(Full walkthroughs: sections 25 and 26.)*

### The Stats system (Affection, Health, Reputation…)

A **stat** is sugar over number variables, with a friendly editor and the option to track one value **per character**.

#### Step 1: Create a stat

1. Open the **Systems** tab and select **Stats**.
2. Click **Add** to create a stat. Give it a **name** (e.g. "Affection"), a **Min** / **Max** range, a **default** value, and a **color** (used by meters).
3. Choose **Applies to**:
   - **Global** — one shared value for the whole game (e.g. "Reputation"). The backing variable is named exactly like the stat, so `{Reputation}` works directly.
   - **Characters** — a *separate* value for each character you tick. The editor creates one variable per character, auto-named `Character — Stat` (for example `Mira — Affection`).

#### Step 2: Pick which characters have the stat (per-character stats)

When **Applies to** is **Characters**, a checklist of your characters appears. Tick each character that should have this stat — the editor instantly creates (or removes) their backing variable. You can rename those variables later in the **Variables** tab and the name will stick.

> **Tip:** Want a plain, un-prefixed variable name? Use a **Global** stat — its variable is named exactly like the stat (no `Character —` prefix).

#### Step 3: Change a stat during play

Stats are number variables, so you change them the usual ways — no special command:

- **Set Variable** (scene command or button action) → pick the stat's variable → **Add**, **Subtract**, or **Set**. For a per-character stat, pick `Mira — Affection`.
- Use them in **conditions** ("`Mira — Affection` is at least 10") and in **text** (`Affection: {Mira — Affection}`).

#### Step 4: Show a stat with a Meter

The **Meter** element draws a stat as a bar (or battery, or segments):

1. In the **UI/Screens** editor, add a **Meter** element to a screen (or use **Systems → Stats → Create meter screen** for a quick start).
2. In the Meter's inspector, bind it to the stat's **variable**. It uses the variable's Min/Max for the fill, and you can reuse the stat's color, add a label, and show the value as a number or percentage.

> **Tip:** A Meter bound to a countdown **timer** variable makes a live countdown bar — the same element works for health, affection, XP, or time.

### ⚠️ Overlay behavior — this is what makes inventories & shops work

An inventory, shop, or stats popup is just a **UI screen** that you open *on top of* the story. How it opens is controlled by the screen's **Overlay Behavior** — and getting this right is essential:

- **Pause scene while open** — freezes the story behind the popup (no advancing, no skipping) so the player can browse safely. Almost always what you want for an inventory or shop.
- **Pass-through clicks** — lets clicks in empty areas reach the scene beneath (used by always-on HUDs), with an option to show the overlay **above the dialogue box** so it can be opened mid-line.
- **Backdrop dim / blur** — darkens or blurs the scene behind the popup so it stands out.
- **When this screen closes** — choose **Resume (don't advance)** for a glance-and-return inventory, **Advance the story**, or **Run actions**.

Screens you create from **Systems → Create inventory screen** are pre-configured as a paused, dimmed **System** overlay — but any inventory/shop/stat screen you build by hand needs these set. **The full, step-by-step guide to Overlay Behavior is section 27 — read it before shipping an inventory or shop.**

### Hotkeys — let players open it with a key

Every screen can be bound to a single keyboard key that **toggles it open and closed**:

1. In **UI/Screens**, select the screen and find the **Keyboard shortcut** mapper near the top of the **Screen Properties** inspector.
2. Click **Set shortcut**, then press the key — for example **I** for inventory or **C** for a character/stats screen.
3. In-game, that key opens and closes the screen.

You can also open these screens from a button using the **Toggle Screen** action, or from the story with the **Show Screen** command. **Full details (and which built-in keys to avoid) are in section 27, Steps 4–5.**

> **Tip:** Give an inventory both an **I** hotkey *and* a **Toggle Screen** button on your HUD, so players can open it whichever way they like — both respect the same Overlay Behavior.

---

## 35. The In-Game Phone (Texting, Calls, Map, Gallery, Notifications)

**Tabs involved:** Systems (Phone quick setup) → UI/Screens → In-Game UI (Phone panel) → Scenes (Phone commands) → buttons (Phone actions)

The **Phone** is a full, built-in, themeable cellphone your players use inside the story — texting (with photos), voiced calls, a contacts roster, a travel map, a photo/CG gallery, notifications, and a player-customizable home screen. It is **not** a screen you assemble yourself; like the Quick Menu and confirmation dialogs, it's built-in **chrome** you style in one place and drive from the story.

### The fast way: the Phone quick setup

Open the **Systems** tab and choose **📱 Phone**. The quick setup walks you through: pick a **look** (or keep your current styling), choose which **apps** go on the home screen, seed **contacts** from your characters, and offer starter **wallpapers**. It's safe to re-run — it only fills gaps and never overwrites what you've already customized. The done screen links straight to the deep editors.

### Where everything lives

- **Style it:** open the **UI/Screens** tab, switch to the **In-Game UI** editor, and choose **Phone** in the left sidebar — accordions for the **shell & position**, **status bar**, **header & bubbles**, **app buttons & home grid**, **fonts**, **incoming text/call theming**, **call transcripts**, **Contacts**, **Wallpapers & Settings app**, **Home widgets**, **Map app**, **Gallery app**, **backgrounds**, and **sounds**, with a live preview (use the **Phone / Banner / Badge / Call / Contacts** view switcher on the canvas to style each state).
- **Script it:** in the **Scenes** tab, the command palette's **Phone** category has the phone commands.
- **Drive it from buttons:** any button can use the phone **actions** (Show Phone, Open Phone App, Show Map, etc.).

### The apps

The phone's home screen holds **app icons** (bottom bar, free-placed, or a real-phone **home grid**). Each icon opens a built-in app — or runs a custom action:

- **Messages** — story-scripted chat threads. **Show Text** appends a bubble (text and/or a **photo**) and can pause for tappable **replies**; **Incoming Text** arrives as a banner + ding or auto-opens the phone. Received photos collect into the Gallery automatically.
- **Contacts** — a roster of characters with per-contact **Call**/**Message** buttons, status lines that interpolate variables, and unlock conditions.
- **Calls** — incoming calls ring with accept/decline; accepted calls (and outgoing **Make Phone Call** commands or a contact's Call button) can play a **scripted, voiced conversation**: chat-style transcript lines with per-line voice clips, conditions that react to variables, tappable replies that steer later lines, and an End Call flow. Missed calls notify.
- **Recents** — the notification center + call log (who called, direction, duration).
- **Gallery** — two tabs: **Photos** the player received in texts, and your project's **CG collection** (same unlocks as the CG Gallery screen), with albums by category.
- **Map** — assign a travel map (built in the **Systems → Maps & Travel** editor) as the phone's Map app for **free-roam travel**: players tap an unlocked location to travel there. Gate free-roam with conditions (e.g. only between story beats). For story moments, use the **Show Map** command instead — it pauses the scene until the player picks a destination.
- **Settings** — the player picks their own **wallpaper** from options you provide (choice persists in saves; entries can unlock over the story).

### Notifications

The **Phone Notification** command posts a banner + badge + an entry in the Recents notification list — with an icon, optional custom sound, silent mode (badge/list only), and **tap actions**. Incoming texts and missed calls notify automatically. The unread **badge** can show a live count.

### How to open the phone (and the phone hotkey)

- From the **story**: drag a **Show Phone** command into a scene (or any **Show Text** command, which opens it automatically).
- From a **button**: add a **Show Phone** or **Open Phone App** action (the latter deep-links an app, e.g. straight into the Gallery).
- With a **key**: in the **In-Game UI → Phone** panel's **Shell & position** section, set the **Open hotkey**. Pressing that key in-game toggles the phone open and closed. (This is the phone's *own* hotkey field — separate from the per-screen keyboard shortcut described in section 27, because the phone is built-in chrome, not a normal screen.)

Everything saves with the game: open chats, messages, photos, the call log, notifications, the player's wallpaper, and even a call in progress persist through save/load.

> **Tip:** The phone lives inside the game engine — after updating the editor, **re-export** your game so exported builds pick up the newest phone.

---

## 36. Interactive Elements (Clickable & Draggable Images, Buttons & Regions)

**Tabs involved:** UI/Screens (Screen Properties → Interactivity)

Where a **Hot Spot** (section 33) is an *invisible* region, an **Interactive Element** is a **visible** element on a screen that the player can **click** or **drag**. It can be an image, a button, text, a video, a text input, or a single image carrying many independently-clickable **regions**. Use it for clickable map pins, a draggable puzzle piece or key, a "drag this onto that" interaction, or one big picture (a control panel, a world map) with lots of clickable areas.

### Step 1: Add an interactive element

1. Open the **UI/Screens** tab and select a screen.
2. In the **Screen Properties** inspector, open the **Interactivity** section and click **Add interactive element**.
3. A new element appears on the screen canvas (a transparent box to start). Drag and resize it like any element.

### Step 2: Pick what kind of element it is

In the element's inspector, set the **Element Type**:

- **Image** — show a picture (pick the asset). The most common choice for clickable/draggable objects.
- **Button** — a button with text and/or an image and a background color.
- **Text** — a styled text label.
- **Video** — a looping video.
- **Text input** — a field the player types into (bound to a variable).
- **Image with regions** — one image split into several clickable areas (see Step 5).

> **Tip:** Whatever type you choose, the element is still a normal screen element — it honors **Conditions** (only shows when met), **Start hidden**, and the **Show Element / Hide Element** button actions, so you can reveal or hide it during play.

### Step 3: Make it clickable

1. Open the element's **Actions** list and add the actions to run when it's clicked — the full action set: **Jump to Scene**, **Set Variable**, **Give Item**, **Toggle Screen**, **Play Sound**, **Call Common Event**, and so on.
2. (Optional) Set a **Click sound** and/or **Hover sound**.
3. (Optional) Add **Conditions** so it only reacts when they're met.

### Step 4: Make it draggable

In the element's **Behavior** section, turn on **Draggable**. Then choose how the drag resolves:

- **Drag tag** — a label (like `key` or `piece1`) used to match drop zones. The player can drop this element onto any **Hot Spot** with the **Drop** trigger that **accepts that tag** (see section 33, Step 4).
- **Snap back** — if the player releases it somewhere that isn't a valid drop zone, it springs back to its starting spot.
- **Snap to hot spot** — when dropped on a matching zone, it locks neatly onto that zone.
- **Hide on drop** — the element disappears once it's been successfully dropped (great for "the piece is now placed").
- **This object is an item** (bound item) — link the element to an inventory item; dropping it on a matching zone **consumes that item** and runs its use-effect, so a draggable object and an inventory item stay in sync.

> **Tip:** Dragging is a two-part setup: the **Interactive Element** is the thing being dragged (give it a Drag tag here), and a **Hot Spot** with the **Drop** trigger is the place it goes (set its *Accept objects tagged* to the same tag). Matching tags = a successful drop.

### Step 5: One image, many clickable areas (regions)

Set the **Element Type** to **Image with regions** for a picture that needs several separate clickable spots:

1. Pick the image asset.
2. Click **Add region** for each area. For each region set:
   - a **shape** — rectangle, circle, or polygon — and its position/size,
   - its own **Actions** (what happens when that area is clicked),
   - optional **Conditions** (the region only works when met),
   - an optional **tooltip** and a **hover highlight** color.
3. Add as many regions as you need — each is scripted independently on the same image.

This is ideal for a world map (each location is a region that jumps to a scene) or a control panel (each switch is a region that sets a variable).

> **Tip:** Regions and a draggable image are two different jobs: **regions** = many click targets on one static picture; **draggable** = the whole element moves. Pick the one that matches what the player does.

## 37. Mini Games (Wipe-Away Reveals & More)

Mini games are playable moments that pop up over your story — wipe dust off an old photograph, assemble the torn pieces, color them in, match cards, find hidden things, race a quick-tap sequence. Build them in the **Mini Games** tab; show them with the **Show Mini Game** command (scenes) or the **Show Mini Game** action (buttons).

### Step 1: Create a mini game

1. Open the **Mini Games** tab and click **New Mini Game**.
2. Pick a game type — all seven are live: **Wipe away**, **Assemble**, **Painting**, **Memory match**, **Hidden objects**, **Sliding puzzle**, and **Quick taps**.
3. Play it immediately in the **live preview** on the right — it's the real game engine, so what you play there is exactly what players get. Use **⟲ Replay** to restart.

### Step 2: Set up a wipe-away game

In the stage settings:

- **Picture underneath** — the image revealed by wiping. Leave it empty and the *running scene itself* shows through the cleared areas.
- **Cover** — what gets wiped off: a solid color, your own image (dust, grime, fog art), or a frost/steam haze.
- **Where is the cover?** — by default the whole area is covered. Click **Draw the covered area…** to airbrush exactly where the dirt sits instead — even one small smudge. You get an **airbrush** (soft, buildable — light passes make thinner cover), a **marker** (solid), and an **eraser**, drawn right over your reveal image. The win % then counts only the area you drew, so "clear 70%" means 70% *of the smudge*.
- **Brush feel** — soft cloth, hard squeegee, thin scratcher streaks, dabby sponge, or your own custom brush image.
- **Brush size** and **Cleared % needed to win** — how big each swipe is, and how much must be cleared.
- **Player cursor** — give the stage a custom cursor image (a rag, a sponge…) that follows the pointer while playing. Per stage, so a wipe stage can show a rag while a later paint stage shows a brush.

### Step 2b: Set up a memory match game

1. Add **card faces** — each face appears twice in the shuffled deck (3 faces = 6 cards, 6 = 12). Faces without an image show a number, so you can test before the art is ready.
2. Optional: a **card back** image (default is a generated pattern), a fixed **column count** (default auto), the **flip-back delay** for failed pairs, and a **pair-matched sound**.
3. Cards always shrink to fit the screen — no scrolling mid-game.

### Step 2c: Set up a hidden objects game

1. Pick the **busy scene image** players will search.
2. Click **Place objects…** — drag and resize each object's tap area straight onto the image (circle/oval or rectangle; bigger = easier). Name them for yourself, and optionally give each one **found art** (default is a ✓ ring).
3. Optional: toggle the found markers and the "3 / 5" counter, and enable a **Hint button** (custom label + cooldown) that pulses one unfound object.

### Step 2d: Set up a sliding puzzle

1. Pick the **puzzle image** and a **grid size** (3×3 easy → 5×5 hard). The image auto-slices; one corner is the gap.
2. Tap a tile next to the gap to slide it. The scramble uses only legal moves, so **every board is solvable**.
3. Optional: **number the tiles**, show the **finished picture** in the corner, and tune the **shuffle strength**. Solving fades the missing tile back in to complete the picture.

### Step 2e: Set up an assemble game

1. Choose the piece source:
   - **Cut one image into a grid** — pick the image and columns/rows; the editor shows the cut instantly and pieces come out shuffled in play. A faint finished picture guides the player.
   - **My own piece images** — add each piece's art, then click **Place where each piece lands…** to drag/resize the landing spots on the board image (optional faint silhouettes mark the spots).
2. Players drag pieces from a **tray** (bottom or right) onto the board. Dropping near a piece's own spot snaps and locks it; dropping on the *wrong* spot counts as a mistake (see Losing); dropping in empty space is free.
3. Tune the **snap distance** (bigger = more forgiving).
4. **Build & Color** (optional) turns the stage into a workshop: players also *color* what they build. Choose **after it's built** (guided two-step — assemble first, then a swatch bar appears) or **while building** (freeform). Pick the color schemes (inline palettes and/or Art Studio palettes), whether coloring keeps the art's shading or paints flat, whether *every* piece must be colored to win (off = a Done button), and optionally let players **paint brush strokes** — strokes are clipped to each piece's own art, so nothing goes outside the lines.

### Step 2f: Set up a painting game

1. Pick the **picture to color in**, then add **paintable areas**:
   - **Mask areas** follow curvy outlines exactly — a white-on-transparent PNG made in the **Art Studio's mask mode** ("the dress", "the sky"). Their painted pixels *are* the tappable area.
   - **Shape areas** are simple rectangles/ovals you drag into place with **Place the shape areas…**.
2. Pick the **color choices** players get: quick inline palettes and/or your saved **Art Studio palettes** (no palette = a default rainbow set). Players tap a swatch, then tap an area — areas stay recolorable until the stage ends.
3. Choose the **paint style** — keep the art's shading (multiply) or flat color — and whether **every area must be painted** to win (off = a Done button).
4. Optional: allow **brush strokes** (clipped to the area the stroke starts in) with a size you pick, and give each area a **color slot** name for the palette→UI feature below.

### Step 2g: Set up a quick-taps (QTE) game

1. Add **prompts** — hit each one, in order, before its shrinking ring closes:
   - **Tap target** — a circle at a screen position you choose (works everywhere, including phones).
   - **Keyboard key** — press a key (E, Space…). The editor flags these: phones have no keyboard, so prefer tap targets for mobile builds.
2. Each prompt can carry its own **art**, **label**, **time window**, and **position**; tune the **pause between prompts**.
3. Choose what a **miss** does: **restart the sequence** (and spend a try, if the game has a mistake limit) or **lose the game** outright. Progress dots show how far along the player is.

### Step 3b: Player colors → story UI (palette→UI)

A coloring game can leave a permanent mark on your story's look:

1. Give paint areas / Build & Color pieces a **color slot** name (e.g. `dress`, `sky`).
2. In the game's **Player colors → story UI** section, map each slot to a UI target — dialogue box background/border/text, name box, or choice button background/border/text.
3. When the game is **won**, the color the player left in each slot restyles that part of the in-game UI — and it **persists**, across scenes *and* saves. Every captured slot also lands in a **text variable with the same name** (`{dress}` interpolates the hex color, and conditions can read it).
4. To undo the restyle, run the **Reset UI Colors** action from any button or event.

> **Note:** the restyle recolors the *default* dialogue/choice look. Boxes skinned with your own images keep their art — those are your authored pixels.

### Step 3: Choose the exits

- **Winning** — actions that run when the game is won (give an item, set a variable, jump somewhere…). From a scene command the story also continues on its own.
- **Win message** — what the player sees at the moment of victory. Three modes: the **default** big ✓, a **custom message** — your own text (with `{variable}` interpolation), optional art above it (sticker, trophy), font, size, color, bold/italic, an optional panel behind it, how long it stays, and a pop/fade entrance — or **none**, where the game simply continues instantly.
- **Skip button** — optional. Shows a skip button with its own label and actions, for players who'd rather not play.
- **Losing** — two optional lose conditions, each with its own display:
  - a **time limit** (one countdown across the whole game, with a hideable bar), and
  - an **allowed-mistakes limit** — a failed card pair, a wrong tap, or a wrong piece placement uses up one try, shown as hearts ♥ that dim as they're spent. Run out and the game is lost. By default one pool spans the whole game; tick **"Tries refill on each stage"** for a per-puzzle allowance instead.
  Either one triggers the **lose actions**, a **lose sound**, and a **lose message** that's just as customizable as the win message (default ⏰/✖ glyph, fully custom text + art + style, or none).

### Step 4: Mix game types with stages

A mini game is a **sequence of stages** — each stage is its own mechanic with its own settings. "Wipe the dust away → assemble the torn photo → color it in." Use **+ Add another stage** in the Stages strip, reorder with ◀ ▶, and give each stage its own instructions line. One timer and one Skip cover the whole sequence; winning the **last** stage wins the game.

### Step 5: Show it in your story

- **In a scene:** drag in a **Show Mini Game** command. The story pauses (like a Choice) until the player wins, skips, or fails — then that exit's actions run and the story continues.
- **From a button:** add a **Show Mini Game** action to any button or hot spot. The game plays as an overlay and simply closes when resolved.

> **Note:** Mini-game progress is intentionally **not saved**. If the player saves mid-game and loads later, the game re-presents fresh — no half-wiped covers in save files.

> **Tip:** An intro splash (in *How it looks*) shows tap-to-start text first — handy with a time limit, since the timer only starts after the tap.

## 38. Art Studio (Draw Your Own Game Art)

The **Art Studio** (Mini Games tab → 🎨 Art Studio) is a built-in drawing surface for making game art without leaving FlourishVNE — touch-up art, wipe-game cover areas, paint-region masks, stamps, and scribbles.

### Step 1: Start a canvas

- Pick a size — **1280×720** (scene-sized), **1024×1024** (square), or custom — for a blank transparent canvas, **or**
- **Open one of your images as a base.** The base stays locked underneath; you paint on a layer above it, and your original asset is never modified.

### Step 2: Paint

- **🖌️ Brush** (soft or hard edge), **💨 Airbrush** (soft spray that builds up while held), **🪣 Paint can** (flood-fills a same-colored area — line art on the base bounds the fill), **🧼 Eraser**, and **💉 Pick color** (eyedropper).
- Size and opacity sliders, unlimited-ish **undo/redo**, and Clear.

### Step 3: Color palettes

Build named **color palettes** (swatch chips; click to pick, + to capture the current color). Palettes are saved with the project — painting and Build & Color mini games offer them to players as their swatch bar, and through **Player colors → story UI** the player's picks can restyle your dialogue and choice buttons (see the Mini Games section).

### Step 4: Mask mode

Toggle **Mask mode** to paint pure white on transparency with the base image dimmed for tracing — exactly the format wipe-game cover areas and paint-region masks expect.

### Step 5: Save

**Save to Assets** exports a PNG into Assets → Images — flattened with the base, or the drawing alone (default for masks). Every save is a new asset; nothing is overwritten.
