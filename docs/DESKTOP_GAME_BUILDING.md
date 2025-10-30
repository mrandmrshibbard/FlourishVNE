# Desktop Game Building - File System Save Support

## Overview
Flourish now supports building your visual novels as standalone desktop applications with native file system save support. This allows players to save their progress and return later, just like professional games!

## Features

### 💾 File System Saves
- **Persistent Storage**: Saves are stored on the user's computer
- **Multiple Save Slots**: Support for unlimited save slots
- **Automatic Saves**: Auto-save functionality
- **Save Metadata**: Timestamps, screenshots, and progress tracking

### 🖥️ Desktop Application
- **Standalone Executable**: No installation required
- **Native Window**: Professional desktop app experience
- **Offline Play**: No internet connection needed
- **Cross-Platform**: Windows (with Mac/Linux support coming)

## How to Build a Desktop Game

### Step 1: Export Your Project
1. Open your project in Flourish
2. Click the **"Build"** button (🎮) in the header
3. Select **"Desktop App"** as the build type
4. Click **"Build Desktop App"**
5. Download the export package (ZIP file)

### Step 2: Run the Build Script
1. Extract the downloaded ZIP to a folder
2. Open Command Prompt or PowerShell
3. Navigate to your Flourish installation folder
4. Run the build command:

```powershell
npm run build:desktop-game -- --input "path/to/your_game_export.zip" --name "My Game Title"
```

**Example:**
```powershell
npm run build:desktop-game -- --input "C:\Downloads\my_visual_novel_export.zip" --name "My Visual Novel"
```

### Step 3: Find Your Executable
After the build completes (may take a few minutes), your game will be in:
```
game-builds/My Game Title/My Game Title.exe
```

## Build Script Options

```bash
node scripts/build-desktop-game.js [options]
```

### Required Options
- `--input <file>` - Path to exported project ZIP
- `--name <name>` - Name of your game

### Optional Options
- `--output <dir>` - Output directory (default: `game-builds`)

### Full Example
```powershell
node scripts/build-desktop-game.js --input "C:\exports\mygame.zip" --name "My Amazing Game" --output "C:\Builds"
```

## Save System API

The desktop build includes a save system API that's automatically available to your game.

### Save Game
```javascript
await window.saveAPI.saveGame(slot, {
  sceneId: 'current-scene',
  variables: { health: 100, name: 'Player' },
  timestamp: Date.now(),
  preview: {
    sceneName: 'Chapter 1',
    thumbnail: 'screenshot-url'
  }
});
```

### Load Game
```javascript
const result = await window.saveAPI.loadGame(slot);
if (result.success) {
  const saveData = result.data;
  // Restore game state
}
```

### List Saves
```javascript
const result = await window.saveAPI.listSaves();
if (result.success) {
  result.saves.forEach(save => {
    console.log(`Slot ${save.slot}: ${save.preview.sceneName}`);
  });
}
```

### Delete Save
```javascript
await window.saveAPI.deleteSave(slot);
```

## Save File Location

Saves are stored in the user's AppData directory:
```
Windows: C:\Users\<Username>\AppData\Roaming\<GameName>\saves\
```

Save files are named: `save-1.json`, `save-2.json`, etc.

## Distribution

### Distributing Your Game

After building, you can distribute your game by:

1. **Direct Download**: Zip the entire output folder and share
2. **Installer**: Use NSIS or similar to create an installer
3. **Steam**: Package for Steam distribution
4. **itch.io**: Upload as a downloadable Windows game

### File Size

Desktop apps are larger than web builds:
- **Base App**: ~150-200 MB (includes Electron runtime)
- **+ Your Assets**: Depends on images/audio/video
- **Total**: Usually 200-500 MB

### System Requirements

**Minimum:**
- Windows 10 or later
- 4 GB RAM
- 500 MB free disk space

**Recommended:**
- Windows 11
- 8 GB RAM
- 1 GB free disk space

## Technical Details

### Architecture

```
MyGame.exe
├── main.js (Electron main process)
├── preload.js (Security bridge)
├── game/
│   ├── index.html (Game entry point)
│   ├── game-engine.js (Flourish engine)
│   ├── project.json (Your game data)
│   └── assets/ (All game assets)
└── node_modules/ (Electron runtime)
```

### Save System Implementation

The save system uses Node.js `fs` module for file operations:

**Main Process (main.js):**
- Handles IPC requests from renderer
- Performs file I/O operations
- Manages save directory

**Preload Script (preload.js):**
- Exposes safe save API to renderer
- Prevents direct filesystem access
- Maintains security through context isolation

**Renderer (game):**
- Calls save API through bridge
- Receives save/load results
- Updates game state accordingly

### Security

- **Context Isolation**: Enabled
- **Node Integration**: Disabled in renderer
- **Preload Script**: Only exposes necessary APIs
- **File Access**: Restricted to saves directory

## Build Process

### What the Script Does

1. **Extract Project**: Unpacks your exported game
2. **Copy Engine**: Includes Flourish game engine
3. **Create Electron App**: Generates main process and preload script
4. **Install Dependencies**: Adds Electron and required packages
5. **Build Executable**: Uses electron-builder to create .exe
6. **Package Assets**: Bundles everything into distributable app

### Build Time

- **First Build**: 5-10 minutes (downloads Electron)
- **Subsequent Builds**: 2-5 minutes

### Build Requirements

**Development Machine:**
- Node.js 16+ installed
- npm installed
- 2 GB free disk space (for Electron cache)
- Internet connection (first build only)

## Troubleshooting

### Build Fails

**"Input file not found"**
- Check the path to your export ZIP
- Use absolute paths or check your current directory

**"Game engine not found"**
- Run `npm run build:engine` first
- Ensure dist-standalone/game-engine.js exists

**"npm install failed"**
- Check internet connection
- Try deleting node_modules and reinstalling
- Update npm: `npm install -g npm@latest`

### Save System Issues

**Saves not persisting:**
- Check app has write permissions
- Look in AppData folder for save files
- Check console for error messages

**Can't find saves:**
- Saves are per-user, per-machine
- Check correct AppData\Roaming\<GameName> folder
- Verify game name matches exactly

### Performance Issues

**Slow startup:**
- Normal for first launch (Electron initialization)
- Subsequent launches should be faster

**High memory usage:**
- Electron apps use more RAM than web browsers
- 200-400 MB is normal

## Future Enhancements

Planned features for desktop builds:

- [ ] **Mac/Linux Support**: Build for all platforms
- [ ] **Auto-Updates**: Built-in update system
- [ ] **Cloud Saves**: Optional cloud sync
- [ ] **Achievements**: Native achievement system
- [ ] **Controller Support**: Gamepad input
- [ ] **Screen Recording**: Built-in recording/screenshots
- [ ] **Modding Support**: Allow user modifications

## Example Game Structure

```javascript
// Your game can use saves like this:
const GameSaveManager = {
  async save(slot) {
    const saveData = {
      sceneId: currentScene.id,
      variables: gameVariables,
      timestamp: Date.now(),
      preview: {
        sceneName: currentScene.name,
        playTime: getTotalPlayTime()
      }
    };
    
    const result = await window.saveAPI.saveGame(slot, saveData);
    if (result.success) {
      showMessage('Game saved!');
    }
  },
  
  async load(slot) {
    const result = await window.saveAPI.loadGame(slot);
    if (result.success) {
      restoreGameState(result.data);
      showMessage('Game loaded!');
    }
  },
  
  async listSaves() {
    const result = await window.saveAPI.listSaves();
    if (result.success) {
      displaySaveSlots(result.saves);
    }
  }
};
```

## Support

For issues or questions:
1. Check this documentation first
2. Look in the `docs/` folder for more guides
3. Check the console for error messages
4. Report bugs with log files attached

---

## Quick Reference

### Build Command
```powershell
npm run build:desktop-game -- --input "export.zip" --name "Game"
```

### Save API
```javascript
window.saveAPI.saveGame(slot, data)
window.saveAPI.loadGame(slot)
window.saveAPI.listSaves()
window.saveAPI.deleteSave(slot)
```

### File Locations
- **Saves**: `%APPDATA%\<GameName>\saves\`
- **Output**: `game-builds\<GameName>\`
- **Executable**: `<GameName>.exe`
