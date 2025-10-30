# Desktop Build System - Complete Implementation Guide

## Overview

The FlourishVNE Desktop Build System allows users to create standalone desktop applications with **persistent save/load functionality**. This is a major feature that distinguishes desktop builds from web builds.

## What's Been Implemented

### 1. Save/Load System (`src/utils/saveSystem.ts`)
A complete save/load API that works in both browser and Electron environments:

- **10 Save Slots** + 1 Auto-Save slot
- **Save Data Structure**: Includes scene position, variables, visited scenes, play time
- **Import/Export**: Backup saves to files or share between devices
- **Version Control**: Save file versioning for future compatibility
- **Auto-Detection**: Automatically uses localStorage (browser) or Electron store (desktop)

### 2. Electron Integration
- **`electron/preload-game.js`**: Secure bridge between Electron and game
- **`electron/main-game.js`**: Main process for desktop game window
- Uses `electron-store` for persistent, encrypted save storage

### 3. Build Type Selector (GameBuilder UI)
- **Web Build**: Browser-based, no saves persist
- **Desktop Build**: Electron app with full save system
- Clear UI showing trade-offs (size vs features)

## How the Save System Works

### For Players (In-Game)

When a desktop game is running, the save system automatically:

1. **Auto-Save**: Periodically saves progress to slot 0
2. **Manual Save**: Players can save to slots 1-10
3. **Quick Save**: Keyboard shortcut (F5) for instant save
4. **Quick Load**: Keyboard shortcut (F9) for instant load

### For Developers (Integration)

To integrate the save system into your game runtime (LivePreview), you would:

```typescript
import { saveGame, loadGame, autoSave, getAllSaveSlots } from '../utils/saveSystem';

// Auto-save every 2 minutes
setInterval(() => {
  autoSave({
    currentSceneId: currentScene.id,
    currentCommandIndex: commandIndex,
    variables: currentVariables,
    visitedScenes: visitedScenesList,
    playTime: totalPlayTime,
    autoSaveEnabled: true
  });
}, 120000);

// Manual save
function handleSaveToSlot(slotId: number) {
  const success = saveGame(slotId, {
    currentSceneId: currentScene.id,
    currentCommandIndex: commandIndex,
    variables: currentVariables,
    visitedScenes: visitedScenesList,
    playTime: totalPlayTime,
    autoSaveEnabled: settings.autoSave
  }, `My Save ${new Date().toLocaleString()}`);
  
  if (success) {
    showNotification('Game Saved!');
  }
}

// Load game
function handleLoadFromSlot(slotId: number) {
  const saveData = loadGame(slotId);
  if (saveData) {
    // Restore game state
    setCurrentScene(saveData.currentSceneId);
    setCommandIndex(saveData.currentCommandIndex);
    setVariables(saveData.variables);
    setVisitedScenes(saveData.visitedScenes);
    setPlayTime(saveData.playTime);
  }
}
```

## Desktop Build Process (To Be Completed)

### What's Needed

The desktop build process requires:

1. **Electron Builder Configuration** (`electron-builder.yml`)
2. **Package Script** to bundle game + Electron
3. **Platform-Specific Builds** (Windows .exe, Mac .app, Linux .AppImage)
4. **Icon Assets** for each platform
5. **Build Server** or local Electron Packager setup

### Recommended Approach

#### Option 1: electron-builder (Recommended)
```json
{
  "build": {
    "appId": "com.flourishvne.game",
    "productName": "MyVisualNovel",
    "directories": {
      "output": "desktop-build"
    },
    "files": [
      "index.html",
      "assets/**/*",
      "electron/main-game.js",
      "electron/preload-game.js"
    ],
    "win": {
      "target": ["nsis", "portable"],
      "icon": "icon.ico"
    },
    "mac": {
      "target": ["dmg", "zip"],
      "icon": "icon.icns"
    },
    "linux": {
      "target": ["AppImage", "deb"],
      "icon": "icon.png"
    }
  }
}
```

#### Option 2: Cloud Build Service
Use a service like:
- **Electron Forge** with GitHub Actions
- **ToDesktop** (easiest, but paid)
- **Electron Builder** with CI/CD

### Build Steps (Manual Process)

1. **Prepare Game Files**
   ```bash
   npm run build  # Build web game first
   ```

2. **Copy to Electron Template**
   ```bash
   cp -r dist/* electron-template/
   ```

3. **Install Dependencies**
   ```bash
   cd electron-template
   npm install electron electron-builder electron-store
   ```

4. **Configure package.json**
   ```json
   {
     "name": "my-visual-novel",
     "version": "1.0.0",
     "main": "electron/main-game.js",
     "scripts": {
       "start": "electron .",
       "build:win": "electron-builder --win",
       "build:mac": "electron-builder --mac",
       "build:linux": "electron-builder --linux"
     }
   }
   ```

5. **Build for Platforms**
   ```bash
   npm run build:win    # Windows
   npm run build:mac    # macOS
   npm run build:linux  # Linux
   ```

## Integration with LivePreview

To make the save system work in the actual game, you need to add UI elements and logic to `LivePreview.tsx`:

### 1. Save/Load Menu

Add a save/load menu overlay:

```tsx
const [showSaveMenu, setShowSaveMenu] = useState(false);
const [saveSlots, setSaveSlots] = useState<SaveSlot[]>([]);

useEffect(() => {
  setSaveSlots(getAllSaveSlots());
}, [showSaveMenu]);

// Render save menu
{showSaveMenu && (
  <div className="save-menu-overlay">
    <div className="save-menu">
      <h2>Save/Load Game</h2>
      {saveSlots.map(slot => (
        <div key={slot.id} className="save-slot">
          <button onClick={() => handleSave(slot.id)}>
            Save to Slot {slot.id}
          </button>
          {slot.data && (
            <button onClick={() => handleLoad(slot.id)}>
              Load ({new Date(slot.data.timestamp).toLocaleString()})
            </button>
          )}
        </div>
      ))}
    </div>
  </div>
)}
```

### 2. Keyboard Shortcuts

```tsx
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'F5') {
      // Quick save
      autoSave(getCurrentGameState());
    }
    if (e.key === 'F9') {
      // Quick load
      const save = loadAutoSave();
      if (save) restoreGameState(save);
    }
    if (e.key === 'Escape') {
      setShowSaveMenu(prev => !prev);
    }
  };

  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, []);
```

### 3. Auto-Save Timer

```tsx
useEffect(() => {
  const autoSaveInterval = setInterval(() => {
    if (isDesktopBuild()) {
      autoSave(getCurrentGameState());
      console.log('Auto-saved');
    }
  }, 120000); // Every 2 minutes

  return () => clearInterval(autoSaveInterval);
}, []);
```

## Testing

### Browser Testing
1. Open game in browser
2. Use browser DevTools → Application → Local Storage
3. Verify saves appear as `vn_save_*` keys

### Desktop Testing
1. Run with Electron: `npm start` in electron-template
2. Play game and save
3. Close and reopen - save should persist
4. Check `~/.config/game-saves/` (Linux/Mac) or `%APPDATA%/game-saves/` (Windows)

## File Size Comparison

| Build Type | Base Size | With Assets | Notes |
|-----------|-----------|-------------|-------|
| Web Build | ~1-5 MB | Varies | Lightweight, instant load |
| Desktop Build | ~150-200 MB | Varies | Includes Electron runtime |

## Distribution

### Web Build
- Upload to itch.io as HTML5 game
- Host on any static site (Netlify, GitHub Pages)
- Single ZIP file

### Desktop Build  
- Distribute on itch.io as downloadable
- Steam (requires Steamworks SDK)
- Direct download from your website
- Separate installers per platform

## Next Steps for Full Implementation

1. **Create build script** in `scripts/build-desktop.js`
2. **Set up electron-builder** config
3. **Add save/load UI** to LivePreview
4. **Test on all platforms**
5. **Create installer graphics** and icons
6. **Write player documentation**

## Benefits of Desktop Builds

✅ **Save Progress**: Players can save and resume anytime  
✅ **Offline Play**: No internet required  
✅ **Better Performance**: Native app performance  
✅ **Professional**: Feels like a "real" game  
✅ **Steam Ready**: Can be published on Steam  
✅ **Auto-Updates**: Can add auto-update functionality  

## Limitations

⚠️ **Large File Size**: 150-200MB vs 1-5MB for web  
⚠️ **Platform-Specific**: Need separate builds for Windows/Mac/Linux  
⚠️ **Build Time**: Takes longer to build than web version  
⚠️ **Code Signing**: May need certificates for distribution  

## Resources

- [Electron Documentation](https://www.electronjs.org/docs/latest/)
- [electron-builder](https://www.electron.build/)
- [electron-store](https://github.com/sindresorhus/electron-store)
- [Publishing on Steam](https://partner.steamgames.com/)

---

**Status**: Framework complete, UI implemented, full build pipeline needs setup
**Priority**: High - Players frequently request save functionality
**Difficulty**: Medium - Requires Electron knowledge and build infrastructure
