# FlourishVNE — Getting Started Guide

Welcome to **FlourishVNE**, a visual novel engine built for creators. This guide walks you through creating your first visual novel project from scratch.

---

## Table of Contents

1. [Launching Flourish](#1-launching-flourish)
2. [The Project Hub](#2-the-project-hub)
3. [Creating Your First Project](#3-creating-your-first-project)
4. [Understanding the Editor Layout](#4-understanding-the-editor-layout)
5. [Adding Your First Scene](#5-adding-your-first-scene)
6. [Adding Dialogue](#6-adding-dialogue)
7. [Uploading Assets](#7-uploading-assets)
8. [Setting a Background](#8-setting-a-background)
9. [Creating a Character](#9-creating-a-character)
10. [Showing a Character in a Scene](#10-showing-a-character-in-a-scene)
11. [Adding Player Choices](#11-adding-player-choices)
12. [Using Variables](#12-using-variables)
13. [Previewing Your Game](#13-previewing-your-game)
14. [Saving Your Project](#14-saving-your-project)
15. [Building & Exporting](#15-building--exporting)
16. [Keyboard Shortcuts](#16-keyboard-shortcuts)
17. [Next Steps](#17-next-steps)

---

## 1. Launching Flourish

**Desktop (Electron):** Run `Flourish(run_me).bat` or launch the executable (the rainbow icon).

**Browser:** Open the app in any modern web browser — no installation required.

When the program loads, you'll arrive at the **Project Hub**.

---

## 2. The Project Hub

The Project Hub is your home screen. From here you can:

- **Create New Project** — starts a fresh project with a default scene and built-in UI screens
- **Import Project** — open a previously saved `.flourish` file
- **Recent Projects** — quickly reopen one of your last 5 projects
- **Music Player** — a dockable mini music player that runs in the background (click the speaker icon)

If this is your first time, you'll see a **Guided Tour** overlay that walks you through the editor in 7 steps. You can dismiss it and re-access it later from the Help menu.

---

## 3. Creating Your First Project

1. Click **Create New Project**
2. You'll be taken directly into the main editor with a starter scene called "Scene 1"
3. The project automatically includes default UI screens (Title Screen, Save Screen, Load Screen, Settings Screen, Pause Menu)

> **Tip:** You can change your project's title, author, and description later in the **Settings** tab.

---

## 4. Understanding the Editor Layout

The editor has **8 main tabs** across the top. You can switch between them by clicking or pressing **Shift+1** through **Shift+8**:

| Tab | Shortcut | Purpose |
|-----|----------|---------|
| **Scenes** | Shift+1 | Build your story — add dialogue, commands, and scene flow |
| **Characters** | Shift+2 | Create and manage characters, sprite layers, and expressions |
| **UI Screens** | Shift+3 | Design menus, title screens, and in-game UI with a visual editor |
| **Assets** | Shift+4 | Upload and organize backgrounds, images, audio, and video files |
| **Variables** | Shift+5 | Create variables for tracking player choices, stats, and state |
| **Events** | Shift+6 | Build reusable command sequences (Common Events) callable from any scene |
| **Systems** | Shift+7 | Opt-in gameplay systems — the item registry, inventories, and shops |
| **Settings** | Shift+8 | Configure project settings, dialogue box styling, fonts, and build options |

> **Tip:** New to the inventory, shop, choice-styling, layering, and other advanced features? They each have a full walkthrough in the **Feature Workflows Guide** — start there once you're comfortable with the basics below.

### Header Toolbar

The toolbar at the top of every tab contains:

- **Home** button — return to the Project Hub
- **Save** button — save your project (Ctrl+S)
- **Undo / Redo** buttons (Ctrl+Z / Ctrl+Shift+Z)
- **Play** button — toggle the Live Preview
- **Keyboard Shortcuts** button (also available via **?** key)
- **Theme Selector** — switch between 6 editor color themes
- **Tools** menu — access Localization, Script Editor, Plugin Manager, and Help & Docs

> **Tip:** Right-click any tab to open it in a **separate window**. This lets you view multiple tabs side by side.

---

## 5. Adding Your First Scene

You start on the **Scenes** tab. The layout has three main areas:

- **Left panel — Resource Tree:** Your scene list and the Command Palette (color-coded command categories)
- **Center — Staging Area & Scene Editor:** The live preview on top, and the command timeline below
- **Right panel — Properties Inspector:** Edit the selected command's properties

### Creating a new scene

1. Look at the **Scenes** section in the left panel
2. Click the **+ (plus)** button next to the "Scenes" header
3. A new scene appears in the list — click on it to select it
4. You can rename it by double-clicking the scene name

### Setting the start scene

Your project needs a **starting scene** — the first scene players see when they launch the game.

1. Go to the **Settings** tab (Shift+6)
2. Under **General**, find **Starting Scene**
3. Select your desired scene from the dropdown

---

## 6. Adding Dialogue

Dialogue is the core of any visual novel. Here's how to add it:

1. Make sure you're on the **Scenes** tab with a scene selected
2. In the **Command Palette** (bottom-left), find the **Story** category
3. **Drag** the **Dialogue** command into the **Scene Editor** (center-bottom area)
4. Click on the Dialogue command you just added — the **Properties Inspector** (right panel) will show its settings
5. Choose a **Speaker** (select a character or leave blank for Narrator)
6. Type your **dialogue text** in the text field
7. The **Staging Area** (center-top) will update in real-time as you edit

### Variable interpolation in dialogue

You can insert variable values into dialogue text using curly braces:

```
Hello, {playerName}! You have {gold} gold coins.
```

This will display the current values of the `playerName` and `gold` variables at runtime.

---

## 7. Uploading Assets

Before you can use backgrounds, character sprites, music, or sound effects, you need to upload them.

1. Go to the **Assets** tab (Shift+4)
2. Select a category on the left: **Backgrounds**, **Images**, **Audio**, or **Videos**
3. Click the **Upload** button (top-right) or **drag and drop** files into the asset area
4. Your assets will appear in the grid/list view
5. Use the **search bar** to find assets, or create **folders** to organize them

### Supported formats

| Type | Formats |
|------|---------|
| Images | PNG, JPG, JPEG, GIF, WebP, BMP, SVG |
| Audio | MP3, WAV, OGG, M4A, FLAC, AAC, WMA |
| Video | MP4, WebM, MOV, AVI, MKV |
| Fonts | TTF, OTF |

---

## 8. Setting a Background

1. Go to the **Scenes** tab
2. From the **Command Palette**, find **Scenes** → **SetBackground**
3. Drag it into your scene timeline
4. Click on the command
5. In the **Properties Inspector**, select an image (or video) from your uploaded backgrounds
6. Choose a **transition** (fade, dissolve, etc.) and set the **duration**
7. The Staging Area will preview the background immediately

---

## 9. Creating a Character

Characters require setup across multiple tabs. Here's the workflow:

### Step 1: Upload character sprites (Assets tab)

1. Go to **Assets** → **Images**
2. Upload your character sprite images (e.g., different expressions, poses, clothing layers)
3. Organize them in folders if you have many sprites (e.g., "Luna/happy.png", "Luna/sad.png")

### Step 2: Create the character (Characters tab)

1. Go to the **Characters** tab (Shift+2)
2. Click the **+ Add Character** button
3. Enter the character's **name**
4. Set the **name color** (used on the dialogue nameplate)

### Step 3: Add layers

Flourish uses a **multi-layer sprite system**. Each layer represents a compositable part of the character (e.g., body, eyes, mouth, hair, outfit).

1. In the character editor, go to the **Layers** tab
2. Click **Add Layer**
3. Name the layer (e.g., "Body", "Eyes", "Mouth")
4. Upload or assign image/video assets to the layer — each asset gets a name (e.g., "eyes_happy", "eyes_sad")

> **Simple characters:** If your character uses single full-body images per expression, you only need one layer (e.g., "Base") with multiple assets.

### Step 4: Create expressions

Expressions map layer assets to a named pose (e.g., "Happy", "Sad", "Angry").

1. Go to the **Expressions** tab
2. Click **Add Expression** and name it (e.g., "Happy")
3. For each layer, select which asset should display in this expression
4. The **Character Preview** on the left will show the composited result

### Step 5: Style (optional)

1. Go to the **Style** tab
2. Set a custom **font** for this character's nameplate (family, size, weight, italic)

---

## 10. Showing a Character in a Scene

1. Go to the **Scenes** tab
2. From the **Command Palette**, find **Characters** → **ShowCharacter**
3. Drag it into your scene timeline
4. In the **Properties Inspector**:
   - Select the **Character**
   - Choose an **Expression** (e.g., "Happy")
   - Set the **Position** (left, center, right, off-left, off-right, or custom X,Y%)
   - Choose a **Transition** (fade, slide, dissolve, etc.) and **Duration**
5. The character will appear in the Staging Area

To remove a character, use the **HideCharacter** command with a transition.

---

## 11. Adding Player Choices

Choices let players make decisions that affect the story.

1. From the **Command Palette**, find **Story** → **Choice**
2. Drag it into your scene timeline
3. In the Properties Inspector, you'll see a list of choice options
4. For each option:
   - Enter the **display text** (what the player sees)
   - Add one or more **actions** (what happens when they click):
     - **JumpToScene** — go to a different scene
     - **JumpToLabel** — jump to a label in the current scene
     - **SetVariable** — change a variable value
     - **GoToScreen** — show a UI screen
     - And more (14 action types total)
   - Optionally add **conditions** so the choice only appears when certain variables are set

### Using Labels for branching

Instead of creating separate scenes for every branch, you can use **Labels**:

1. Add a **Label** command in your scene (Story → Label) and name it (e.g., "path_a")
2. In a Choice action, set **JumpToLabel** → "path_a"
3. The story will jump to that label's position in the scene

---

## 12. Using Variables

Variables track player state — names, stats, flags, choices, and more.

### Creating variables

1. Go to the **Variables** tab (Shift+5)
2. Click **Add Variable**
3. Set the **name**, **type** (String, Number, or Boolean), and **scope**:
   - **Local** — resets when the scene changes
   - **Global** — persists across scenes within a playthrough
   - **Persistent** — survives across play sessions (e.g., CG gallery unlocks)
4. Set a **default value**

### Using variables in scenes

- **SetVariable command** — set, add, subtract, or randomize a variable
- **Conditions** — any command can have conditions that check variable values (10 operators: ==, !=, >, <, >=, <=, is true, is false, contains, startsWith)
- **Dialogue text** — insert values using `{variableName}` syntax
- **Choice conditions** — show/hide choices based on variables

### Finding where a variable is used

Click a variable in the Variables tab and use the **Usage Tracker** to see every command, condition, UI element, and dialogue line that references it.

---

## 13. Previewing Your Game

The **Live Preview** (Staging Area) shows your game in real-time as you edit.

### Quick preview

The staging area at the top of the Scenes tab always shows the current scene state. Click on any command in the timeline to see it rendered instantly.

### Full play mode

1. Click the **Play** button in the header toolbar (or toggle it)
2. The game will start from the beginning of the current scene
3. Click to advance dialogue, make choices, and interact with the game
4. Use the in-game controls:
   - **Skip** — fast-forward through dialogue
   - **Auto** — auto-advance dialogue at a configurable speed
   - **History/Backlog** — view past dialogue
   - **Settings** — adjust volume, text speed
   - **Save/Load** — save and load game state (desktop only, 10 slots)

---

## 14. Saving Your Project

### Manual save

- Click the **Save** button in the header, or press **Ctrl+S**
- Choose a location to save your `.flourish` project file

### Auto-save

- Flourish automatically saves your project to IndexedDB in the background
- If the app crashes, you can recover from auto-save when you reopen

### Import/Export

- **Export**: Your project is saved as a `.flourish` file (a ZIP containing JSON data and embedded assets)
- **Import**: Open any `.flourish` file from the Project Hub

---

## 15. Building & Exporting

When your game is ready to share:

1. Go to the **Settings** tab (Shift+6)
2. Scroll down to find the **Build** section, or look for the Build panel
3. Choose your build target:
   - **Web (HTML)** — a single HTML file you can host anywhere or upload to itch.io
   - **Desktop (EXE)** — a standalone Windows executable
   - **Installer** — an NSIS installer with desktop shortcut
4. Click **Validate** to check for missing assets or broken references
5. Click **Build** and wait for the progress indicator
6. Download your built game

> **Tip:** For itch.io, use the Web build — it generates an itch.io-ready ZIP package.

---

## 16. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Shift+1 through Shift+6 | Switch tabs (Scenes, Characters, UI, Assets, Variables, Settings) |
| Ctrl+S | Save project |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Redo |
| Ctrl+C | Copy selected commands |
| Ctrl+V | Paste commands |
| Ctrl+A | Select all commands in scene |
| Delete | Delete selected commands |
| Esc | Deselect / close panels |
| ? | Show keyboard shortcuts panel |
| Click | Select command |
| Shift+Click | Range select commands |
| Ctrl+Click | Toggle select commands |

---

## 17. Next Steps

Now that you've created your first scene, here are the next things to explore:

- **UI Screens** — customize your title screen, save/load screens, and pause menu in the UI tab
- **Audio** — add background music (PlayMusic) and sound effects (PlaySoundEffect) to your scenes
- **Video** — embed cutscenes or animated backgrounds with the PlayMovie command
- **Screen Effects** — add dramatic flair with ShakeScreen, FlashScreen, TintScreen, PanZoomScreen, and 6 overlay effects (rain, snow, sunbeams, etc.)
- **Templates** — browse the Template Gallery in the Settings tab for pre-built systems (character creator, shop, combat, etc.)
- **Scripting** — write custom JavaScript logic via Tools → Script Editor
- **Localization** — translate your game into multiple languages via Tools → Localization
- **Branching** — use BranchStart/BranchEnd commands for complex story paths with visual color coding

For detailed workflow guides covering multi-step features, see the **Feature Workflows Guide**.
