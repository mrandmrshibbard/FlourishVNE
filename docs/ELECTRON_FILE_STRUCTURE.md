# Electron File Structure Guide

## Complete Project Structure

```
FlourishVNE/
│
├── 📱 ELECTRON FILES (New!)
│   └── electron/
│       └── main.cjs              # Electron entry point (window creation, menus)
│
├── 🔨 BUILD SCRIPTS
│   ├── BUILD_EXE.bat             # Double-click to build Windows .exe
│   ├── Flourish(run_me).bat      # Original browser version launcher
│   └── start.ps1                 # PowerShell launcher
│
├── 📦 BUILD OUTPUT
│   ├── dist/                     # Built React app (Vite output)
│   │   ├── index.html
│   │   └── assets/
│   │       └── index-[hash].js   # Your bundled React app (~710KB)
│   │
│   └── release/                  # Electron builds go here
│       ├── Flourish Visual Novel Engine-2.0.0-x64.exe    (Portable)
│       └── Flourish Visual Novel Engine Setup 2.0.0.exe  (Installer)
│
├── 📚 DOCUMENTATION
│   ├── docs/                     # User documentation (included in builds)
│   │   ├── index.html
│   │   ├── getting-started.html
│   │   ├── character-quick-guide.html
│   │   └── troubleshooting.html
│   │
│   ├── README.md                 # Main project documentation
│   ├── RUN_LOCALLY.md            # Browser version instructions
│   ├── ELECTRON_BUILD.md         # Complete Electron build guide
│   ├── ELECTRON_QUICK_START.md   # Quick reference for building
│   ├── ELECTRON_SETUP_COMPLETE.md # This setup summary
│   ├── ELECTRON_FILE_STRUCTURE.md # You are here!
│   ├── ITCH_IO_DESCRIPTION.md    # Marketing content for itch.io
│   └── [other guides...]
│
├── ⚙️ CONFIGURATION
│   ├── package.json              # NPM config + Electron-builder settings
│   ├── tsconfig.json             # TypeScript configuration
│   ├── vite.config.ts            # Vite build config (editor)
│   └── vite.config.standalone.ts # Vite build config (game player)
│
├── 💻 SOURCE CODE
│   └── src/
│       ├── App.tsx               # Main React component
│       ├── index.tsx             # React entry point
│       ├── components/           # UI components
│       ├── contexts/             # React contexts
│       ├── features/             # Feature modules
│       ├── state/                # State management
│       ├── types/                # TypeScript types
│       └── utils/                # Utility functions
│
└── 🔧 SCRIPTS
    ├── build-player.js
    └── generate-engine-bundle.js

```

## Key Files Explained

### 🔵 Electron Main Process
**`electron/main.cjs`**
- Creates the application window
- Loads `dist/index.html` into Electron
- Handles native menus (File, Edit, View, Help)
- Manages window lifecycle (close, minimize, etc.)
- Uses `.cjs` extension for CommonJS format

### 🔵 Package Configuration
**`package.json`**
```json
{
  "main": "electron/main.cjs",           // Electron entry point
  "scripts": {
    "electron:dev": "...",               // Test in Electron
    "electron:build:win": "...",         // Build Windows .exe
    "dist": "npm run build && electron-builder --win"
  },
  "build": {                             // Electron-builder config
    "appId": "com.flourish.vne",
    "productName": "Flourish Visual Novel Engine",
    "files": ["dist/**/*", "electron/**/*"],
    "win": { /* Windows settings */ }
  }
}
```

### 🔵 Build Output
**`dist/`** - Built by Vite
- Your React app compiled and bundled
- Electron loads this folder
- Created by: `npm run build`

**`release/`** - Built by electron-builder
- Final .exe files for distribution
- Created by: `npm run dist`
- ~250MB per file (includes Electron runtime)

## Build Process Flow

```
Source Code (src/)
        ↓
   npm run build
        ↓
    Vite builds
        ↓
   dist/ folder
        ↓
npm run electron:build
        ↓
  electron-builder packages
        ↓
   release/*.exe
```

## What Gets Included in .exe?

When you build with `npm run dist`, the final .exe includes:

```
Flourish Visual Novel Engine.exe (~250MB)
│
├── Electron Runtime (~150MB)
│   ├── Node.js
│   ├── Chromium browser engine
│   └── Native OS bindings
│
├── Your React App (~710KB bundled)
│   └── dist/
│       ├── index.html
│       └── assets/index-[hash].js
│
└── Documentation & Assets
    └── docs/
        └── [all HTML guides]
```

## Development vs Production

### Development (npm run dev)
```
Vite Dev Server
↓
localhost:3000
↓
Live reload, hot module replacement
↓
Source maps, unminified
```

### Electron Development (npm run electron:dev)
```
Build React app
↓
dist/ folder
↓
Launch Electron
↓
Native window with React app
↓
Can use DevTools (F12)
```

### Production Build (npm run dist)
```
Build React app (minified)
↓
dist/ folder
↓
electron-builder packages
↓
release/*.exe
↓
Single executable file
↓
No dependencies needed
```

## File Sizes

| Component | Size | Notes |
|-----------|------|-------|
| Source code (src/) | ~2MB | TypeScript + React components |
| Built React app (dist/) | ~710KB | Minified bundle |
| Electron runtime | ~150MB | Node.js + Chromium |
| Documentation (docs/) | ~5MB | HTML guides and assets |
| **Final .exe** | **~250MB** | Everything combined |

## Configuration Files

### vite.config.ts
```typescript
export default defineConfig({
  base: './',  // Use relative paths for Electron
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
```

### package.json (build section)
```json
"build": {
  "files": [
    "dist/**/*",      // Built React app
    "electron/**/*",  // Electron main process
    "docs/**/*",      // Documentation
    "package.json"
  ],
  "directories": {
    "output": "release"  // Where .exe goes
  }
}
```

## Common Operations

### Build for Testing
```bash
npm run build          # Build React app
npm run electron:dev   # Test in Electron
```

### Build for Distribution
```bash
npm run dist           # Full Windows build
```

### Clean Build
```bash
# Delete old builds
Remove-Item -Recurse -Force dist, release

# Rebuild everything
npm run build
npm run dist
```

### Update Dependencies
```bash
npm install            # Update all packages
npm run dist           # Rebuild with new packages
```

## Troubleshooting File Issues

### "Cannot find module 'electron'"
**Problem**: Electron not installed
**Solution**: `npm install`

### "dist/index.html not found"
**Problem**: React app not built
**Solution**: `npm run build`

### "Module format mismatch"
**Problem**: Using .js instead of .cjs for Electron main
**Solution**: Ensure `electron/main.cjs` (not .js)

### "Release folder is empty"
**Problem**: electron-builder failed
**Solution**: Check console for errors, ensure `dist/` exists

## Best Practices

### ✅ Do This
- Run `npm run build` before `npm run dist`
- Use `.cjs` for CommonJS files when package.json has `"type": "module"`
- Keep `docs/` folder for included documentation
- Test with `npm run electron:dev` before building

### ❌ Don't Do This
- Don't modify `dist/` or `release/` manually (they're auto-generated)
- Don't mix CommonJS and ES modules in Electron main
- Don't forget to rebuild after code changes
- Don't delete `node_modules/` unless troubleshooting

## Directory Permissions

### Windows
- `release/` - Read/Write (build output)
- `dist/` - Read/Write (build output)
- `electron/` - Read only (source)
- `src/` - Read only (source)

## File Watchers

Vite watches these during `npm run dev`:
- `src/**/*.tsx`
- `src/**/*.ts`
- `src/**/*.css`
- `index.html`

Electron does NOT watch files - rebuild required for changes.

## Summary

```
📁 Project Files
  ├── 🔧 electron/main.cjs      ← Electron window code
  ├── 📦 package.json           ← Dependencies + build config
  └── 💻 src/                   ← Your React app
           ↓
       npm run build
           ↓
  ├── 📤 dist/                  ← Built React app
           ↓
       npm run dist
           ↓
  └── 🎁 release/*.exe          ← Final desktop app
```

**Total Setup**: 5 new files
**Total Build Time**: 2-5 minutes
**Final Output**: Single .exe file (~250MB)
**User Experience**: Download → Double-click → Create visual novels! ✨

---

**Questions?** Check [ELECTRON_BUILD.md](ELECTRON_BUILD.md) for detailed instructions.
