# FlourishVNE - Quick Start Tutorial

> For comprehensive documentation, see:
> - **[Getting Started Guide](../docs/getting-started.md)** - full beginner walkthrough
> - **[Feature Workflows Guide](../docs/feature-workflows.md)** - detailed multi-step workflows for every feature
> - **[Codebase Audit & VNM Comparison](../docs/audit-vs-visual-novel-maker.md)** - full feature inventory
> - **[Scripting & Plugins](../docs/scripting-and-plugins.md)** - JavaScript scripting system

---

## Getting Started

1. Download the zip file and extract the folder
2. Launch the executable (the rainbow icon) or run Flourish(run_me).bat
3. When the program loads, you'll be in the **Project Hub**
4. Click **Create New Project** or import a saved .flourish file

---

## The Main Editor

Click **Create New Project** and you'll be taken to the main **Scenes** editor.

- **Left panel**: Scene tree and color-coded Command Palette
- **Center top**: The **Staging Area** - a live preview that updates in real-time as you add and edit commands
- **Center bottom**: The **Scene Editor** - drag and drop commands here to build your scene
- **Right panel**: The **Properties Inspector** - click any command to edit its text, images, conditions, and more

---

## Navigation

There are several ways to get around in Flourish:

| Method | How |
|--------|-----|
| Click tabs | Click the 6 tabs at the top of the page |
| Keyboard | **Shift+1** through **Shift+6** to switch tabs |
| Pop-out windows | Right-click a tab to open it in a separate OS window |
| Alt+Tab | Switch between the main editor and pop-out windows |

The 6 tabs: **Scenes** - **Characters** - **UI Screens** - **Assets** - **Variables** - **Settings**

---

## Characters Tab

1. Click **+ Add Character** to create a character
2. Add **layers** for compositable sprite parts (body, eyes, mouth, hair, etc.)
3. Upload image or video assets to each layer
4. Go to the **Expressions** tab and create named expressions (Happy, Sad, Angry, etc.)
5. For each expression, select which asset to display on each layer
6. The **Character Preview** on the left shows the composited result in real-time
7. Use the **Style** tab for custom fonts on the character's nameplate

---

## UI Screens Tab

1. Every project starts with 5 default screens (Title, Save, Load, Settings, Pause Menu)
2. All screens are fully customizable - drag and resize elements on the visual canvas
3. Click **Restore Default Screens** at the bottom to add fresh defaults (doesn't delete existing screens)
4. The center shows the **WYSIWYG Editor** for drag-and-drop screen design
5. Below the canvas: buttons to add 12 element types (Button, Text, Image, SaveSlotGrid, SettingsSlider, and more)
6. Click any element to edit its properties in the right panel

---

## Assets Tab

1. Select a category on the left: **Backgrounds**, **Images**, **Audio**, or **Videos**
2. **Upload** button is in the top-right - or drag and drop files directly
3. Search through assets with the search bar
4. Create **folders** to organize
5. Switch between **grid** and **list** view
6. Supported: PNG, JPG, GIF, WebP, SVG, MP3, WAV, OGG, MP4, WebM, TTF, OTF, and more

---

## Variables Tab

Variables allow the creation of advanced systems and branching conditional paths.

1. Click **Add Variable**
2. Choose type: **String**, **Number**, or **Boolean**
3. Choose scope: **Local** (resets per scene), **Global** (per playthrough), or **Persistent** (cross-session)
4. Set a default value
5. Reference in dialogue using curly braces: `{variableName}`
6. Use the **Usage Tracker** to find all references across your project

---

## Settings Tab

- Change the **project name**, **author**, and **starting scene**
- Customize **dialogue box** and **choice button** images and fonts
- Set **game resolution** (1920x1080, 1280x720, etc.)
- Configure **default volumes** and **text speed**
- Manage **screen assignments** (Title, Save, Load, Settings, Pause, Game HUD)
- Upload **custom fonts**

---

## Templates

Browse the **Template Gallery** in Settings for pre-built systems:
- Character creator, outfit picker, shop system, stat tracker
- Dating sim, combat, inventory, mini-game, and more
- Each template generates the needed variables, UI screens, and elements automatically

---

## Tools Menu

Access advanced tools from the **Tools** button in the header toolbar:

- **Localization** - translate your game into multiple languages, export/import CSV
- **Script Editor** - write custom JavaScript logic with the sandboxed game API
- **Plugin Manager** - install and manage plugins
- **Help & Docs** - in-app help and documentation

---

## Tips

- You can add music and SFX to UI screens, plus set playback policies for seamless transitions
- Buttons can navigate between screens - use ShowScreen command in scenes or Button actions in UI
- Add **conditions** to any command to make it run only when variable criteria are met
- Use **BranchStart/BranchEnd** commands for visual, collapsible story branches
- Use **command stacking** (Run Async flag) to run multiple commands simultaneously
- The **CreditRoll** command creates a full credit sequence with slideshow backgrounds
- Press **?** at any time to see keyboard shortcuts
- Enable **flourish:editorDebug** in localStorage for verbose editor logging

---

## Building Your Game

1. Go to **Settings** tab
2. Click **Build**
3. Choose: **Web (HTML)** for browser/itch.io or **Desktop (EXE)** for standalone
4. Click **Validate** to check for issues
5. Click **Build** and download your game
