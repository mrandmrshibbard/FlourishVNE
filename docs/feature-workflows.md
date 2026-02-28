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

## 4. Character Customization System

**Tabs involved:** Assets → Characters → Variables → UI Screens → Scenes

This is the most complex multi-step workflow. It creates a screen where players customize their character's appearance by cycling through sprite parts.

### Step 1: Upload character parts (Assets tab)

1. Upload all character sprite parts organized by category:
   - Hair styles: hair_1.png, hair_2.png, hair_3.png
   - Eye types: eyes_1.png, eyes_2.png, eyes_3.png
   - Outfit options: outfit_1.png, outfit_2.png, outfit_3.png

### Step 2: Create the character with layers (Characters tab)

1. Create a new character (e.g., "Player Character")
2. Add layers matching your categories:
   - Layer: "Hair" → add all hair assets
   - Layer: "Eyes" → add all eye assets
   - Layer: "Outfit" → add all outfit assets
3. Create a default expression that uses one asset from each layer

### Step 3: Create selection variables (Variables tab)

1. Create a **String** variable for each customizable layer:
   - `selected_hair` (String, Global)
   - `selected_eyes` (String, Global)
   - `selected_outfit` (String, Global)

### Step 4: Build the customization screen (UI Screens tab)

**Option A: Use the Character Customization Wizard**
1. Click the **Character Customization Wizard** button
2. Follow the guided steps — the wizard automatically creates the screen, elements, and variable bindings

**Option B: Manual setup**
1. Create a new UI screen (e.g., "Character Creator")
2. Add **AssetCycler** elements for each customizable layer:
   - Set the **Layer** to the character layer (e.g., "Hair")
   - Set the **Variable** to the tracking variable (e.g., `selected_hair`)
   - Each AssetCycler shows left/right arrows to browse layer assets
3. Add a **CharacterPreview** element:
   - Assign the **Character**
   - Set the **Default Expression**
   - Map each layer to its corresponding variable (Hair → `selected_hair`, Eyes → `selected_eyes`, etc.)
   - The preview updates in real-time as the player cycles through assets
4. Add a **Button** to proceed (e.g., "Confirm" → action: JumpToScene → "Chapter 1")

### Step 5: Show the creator from a scene (Scenes tab)

1. In your starting scene, add a **ShowScreen** command
2. Set it to show your character creator screen
3. The player interacts with the creator, then the button's action jumps them into the story

### Step 6: Use the customized character in scenes

When you use **ShowCharacter** in later scenes, the character will display with the assets the player selected, because the character's layers are bound to the selection variables.

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
| **TintScreen** | Color overlay | Color, Duration |
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
