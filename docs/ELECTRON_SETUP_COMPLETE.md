# Flourish VNE - Electron Desktop App Setup ✅

## What We've Done

Your Flourish Visual Novel Engine is now ready to be packaged as a **native desktop application** (.exe for Windows, .dmg for macOS, .AppImage for Linux)!

## 📁 Files Created

### Electron Core
- **`electron/main.cjs`** - Electron main process (app entry point)
  - Creates the application window
  - Loads your React app
  - Handles menus (File, Edit, View, Help)
  - Sets up window properties (size, title, icon)

### Configuration
- **`package.json`** - Updated with:
  - Electron dependencies (`electron`, `electron-builder`)
  - Build scripts (`electron:dev`, `electron:build:win`, `dist`)
  - Electron-builder configuration (app name, icons, output format)
  - Main entry point: `electron/main.cjs`

### Documentation
- **`ELECTRON_BUILD.md`** - Complete guide with:
  - Prerequisites and installation
  - Build commands for all platforms
  - Troubleshooting section
  - Publishing to itch.io instructions
  - Code signing information
  - Customization options

- **`ELECTRON_QUICK_START.md`** - Quick reference card:
  - Command cheat sheet
  - Build outputs explained
  - File sizes and what's included
  - Troubleshooting table

- **`BUILD_EXE.bat`** - One-click Windows builder:
  - Builds React app
  - Packages Electron app
  - Shows success message with file location

### Updated Files
- **`README.md`** - Added Desktop Application section
- **`package.json`** - Version updated to 2.0.0, added Electron config

## 🚀 How to Build Your .exe

### Method 1: Simple (Double-click)
```
1. Double-click BUILD_EXE.bat
2. Wait 2-5 minutes
3. Find your .exe in release/ folder
```

### Method 2: Command Line
```bash
npm install              # First time only
npm run dist             # Build Windows .exe
```

### Method 3: All Platforms
```bash
npm run electron:build:win    # Windows
npm run electron:build:mac    # macOS
npm run electron:build:linux  # Linux
npm run electron:build        # All platforms
```

## 📦 What You Get

### Build Output Location
```
FlourishVNE/
└── release/
    ├── Flourish Visual Novel Engine-2.0.0-x64.exe  (Portable)
    ├── Flourish Visual Novel Engine Setup 2.0.0.exe (Installer)
    └── builder-effective-config.yaml
```

### File Sizes
- **Portable .exe**: ~250MB (everything in one file)
- **Installer**: ~250MB (NSIS installer with shortcuts)

### What's Inside?
- ✅ Electron runtime (Node.js + Chromium)
- ✅ Your complete React app (Flourish VNE)
- ✅ All documentation (docs/ folder)
- ✅ Everything needed to run

## 👥 User Experience

### Before (Current Browser Method)
```
User downloads folder
↓
Installs Node.js or Python
↓
Runs start script
↓
Opens in browser
```

### After (Desktop App)
```
User downloads .exe
↓
Double-clicks
↓
App opens - DONE! ✨
```

**No dependencies, no browser, no installation required!**

## 🎯 Distribution Options

### 1. itch.io (Recommended)
- Upload: `release/Flourish Visual Novel Engine-2.0.0-x64.exe`
- Category: Tools → Game Development
- Classification: Tools
- Platform: Windows
- Users download and run directly

### 2. Your Website
- Host the .exe file
- Provide download link
- Users get ~250MB file

### 3. GitHub Releases
- Upload to GitHub releases
- Users download from releases page
- Automatic version tracking

### 4. Both Versions
Offer both options:
- **Desktop App**: Single .exe download
- **Browser Version**: ZIP with start scripts (current method)

## ⚙️ Configuration

### App Identity
Edit `package.json`:
```json
{
  "name": "flourish-visual-novel-engine",
  "version": "2.0.0",
  "productName": "Flourish Visual Novel Engine",
  "description": "A browser-based visual novel engine",
  "author": "Your Name",
  "build": {
    "appId": "com.flourish.vne"
  }
}
```

### Window Settings
Edit `electron/main.cjs`:
```javascript
width: 1400,    // Window width
height: 900,    // Window height
minWidth: 1024, // Minimum width
minHeight: 768  // Minimum height
```

### App Icon
Replace `docs/Flourish.png` with your icon (512x512px recommended)

## 🧪 Testing

### Test in Electron Window (Development)
```bash
npm run electron:dev
```
Opens the app in an Electron window for testing.

### Test Built .exe
```bash
npm run dist
cd release
./Flourish Visual Novel Engine-2.0.0-x64.exe
```

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| **"npm install" fails** | Delete `node_modules/` and `package-lock.json`, try again |
| **Build fails** | Make sure `dist/` folder exists (run `npm run build`) |
| **Blank Electron window** | Check DevTools (F12) for errors |
| **Large file size** | Normal! Includes Electron (~150MB) + your app |
| **"Not signed" warning** | Expected for development. Need code signing cert for production |

## 📚 Documentation Links

- [Complete Build Guide](ELECTRON_BUILD.md) - Detailed instructions
- [Quick Reference](ELECTRON_QUICK_START.md) - Command cheat sheet
- [Running Locally](RUN_LOCALLY.md) - Browser version instructions
- [Main README](README.md) - Project overview

## 🎨 Customization Ideas

### Add Custom Menu Items
Edit `electron/main.cjs` → `template` array

### Change Startup Window
Modify `createWindow()` function in `electron/main.cjs`

### Add Auto-Updates
Install `electron-updater` and configure update server

### Reduce File Size
- Remove unused assets from `docs/`
- Optimize images
- Consider Tauri instead of Electron (smaller builds)

## 🔐 Code Signing (Optional)

For production apps without security warnings:

### Windows
1. Buy certificate from DigiCert/Sectigo (~$100/year)
2. Add to `package.json`:
```json
"win": {
  "certificateFile": "cert.pfx",
  "certificatePassword": "password"
}
```

### macOS
1. Join Apple Developer Program ($99/year)
2. Get Developer ID certificate
3. Configure in package.json

**Benefits**: No security warnings, auto-updates work, professional appearance

## 📊 Comparison

### Browser Version (Current)
- ✅ Smaller download (~5-10MB)
- ✅ Works on any OS with browser
- ❌ Requires Node.js or Python
- ❌ Requires running start script
- ❌ Uses user's browser

### Desktop App (New)
- ✅ One-click run
- ✅ No dependencies needed
- ✅ Native desktop experience
- ✅ Professional appearance
- ❌ Larger download (~250MB)
- ❌ Separate builds for each OS

**Recommendation**: Offer both! Let users choose their preference.

## ✅ Next Steps

1. **Build your first .exe**
   ```bash
   npm install
   npm run dist
   ```

2. **Test it**
   - Find in `release/` folder
   - Double-click to run
   - Verify everything works

3. **Distribute it**
   - Upload to itch.io
   - Share on your website
   - Post in communities

4. **Get feedback**
   - Test on other Windows computers
   - Ask users about their experience
   - Iterate and improve

## 🎉 You're Ready!

Your Flourish Visual Novel Engine can now be distributed as a professional desktop application. Users can download a single file and start creating visual novels immediately - no technical knowledge required!

### Questions?
- Check [ELECTRON_BUILD.md](ELECTRON_BUILD.md) for detailed docs
- Open an issue on GitHub
- Contact support

### Want to Build Now?
```bash
# Quick build
npm run dist

# Result in: release/Flourish Visual Novel Engine-2.0.0-x64.exe
```

---

**Version 2.0** • Electron Desktop App • Built with ❤️ for storytellers
