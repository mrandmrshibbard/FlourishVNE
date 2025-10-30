# Electron Desktop App - Quick Reference

## Build Commands

| Command | Description | Output |
|---------|-------------|--------|
| `npm run dist` | Build Windows portable .exe | `release/*.exe` |
| `npm run electron:build:win` | Build Windows (installer + portable) | `release/*.exe` |
| `npm run electron:build:mac` | Build macOS .dmg and .app | `release/*.dmg` |
| `npm run electron:build:linux` | Build Linux AppImage and .deb | `release/*.AppImage` |
| `npm run electron:build` | Build for all platforms | `release/*` |
| `npm run electron:dev` | Test in Electron (development) | Opens window |

## Quick Build (Windows)

```bash
# 1. Install dependencies (first time only)
npm install

# 2. Build the .exe
npm run dist

# 3. Find your app
# Look in: release/Flourish Visual Novel Engine-2.0.0-x64.exe
```

## What You Get

### Windows
- **Portable .exe**: ~250MB standalone executable
- **Installer**: NSIS wizard with shortcuts
- **Works on**: Windows 10/11 (64-bit)

### macOS  
- **DMG file**: Drag-and-drop installer
- **Works on**: macOS 10.13+

### Linux
- **AppImage**: Universal binary (no install needed)
- **DEB package**: For Debian/Ubuntu
- **Works on**: Most Linux distributions

## Distribution

### Upload to itch.io
1. Build: `npm run dist`
2. Upload: `release/Flourish Visual Novel Engine-2.0.0-x64.exe`
3. Category: Tools → Game Development
4. Done! Users download and run directly

### File Sizes
- Windows: ~200-300MB (includes Electron runtime)
- macOS: ~250-350MB
- Linux: ~200-300MB

### What's Included?
- Complete Electron runtime
- Chromium browser engine
- Your React app (Flourish VNE)
- All documentation
- Everything users need to run it

## User Experience

### Before (Browser-based)
1. Download folder
2. Install Node.js or Python
3. Run start script
4. Opens in browser

### After (Desktop App)
1. Download .exe
2. Double-click
3. Done! ✨

No installation, no dependencies, no browser needed!

## File Structure

```
FlourishVNE/
├── electron/
│   └── main.cjs         # Electron entry point (CommonJS)
├── dist/                # Built React app (created by npm run build)
│   └── index.html
├── docs/                # Documentation included in app
├── release/             # Built desktop apps go here
│   ├── *.exe           # Windows executables
│   ├── *.dmg           # macOS installers
│   └── *.AppImage      # Linux binaries
└── package.json         # Includes electron-builder config
```

## Customization

### Change App Name
Edit `package.json`:
```json
{
  "name": "your-app-name",
  "productName": "Your App Name",
  "version": "2.0.0"
}
```

### Change Window Size
Edit `electron/main.cjs`:
```javascript
width: 1400,  // Change this
height: 900,  // And this
```

### Change App Icon
Replace `docs/Flourish.png` with your 512x512px icon

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Build fails | Run `npm install` first |
| Blank window | Check dist/ folder exists (run `npm run build`) |
| Large file size | Normal! Includes Electron runtime (~150MB) |
| "Not signed" warning | Normal for development. Need code signing cert for production |

## Next Steps

1. ✅ Build your first .exe: `npm run dist`
2. ✅ Test it: Double-click the .exe in `release/`
3. ✅ Share it: Upload to itch.io or your website
4. 📖 Read full guide: [ELECTRON_BUILD.md](ELECTRON_BUILD.md)

---

**🎉 That's it!** You now have a native desktop application that users can download and run directly.

**Questions?** Check the [full Electron build guide](ELECTRON_BUILD.md) or open an issue.
