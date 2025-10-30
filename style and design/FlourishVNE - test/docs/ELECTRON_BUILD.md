# Building Flourish as Desktop Application

This guide explains how to package Flourish Visual Novel Engine as a native desktop application for Windows, macOS, and Linux.

## Prerequisites

- Node.js 18+ installed
- Git (optional)
- All npm dependencies installed

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This will install all required dependencies including Electron and electron-builder.

### 2. Build the Desktop App

**For Windows (.exe):**
```bash
npm run dist
```
or
```bash
npm run electron:build:win
```

**For macOS (.dmg/.app):**
```bash
npm run electron:build:mac
```

**For Linux (AppImage/deb):**
```bash
npm run electron:build:linux
```

**For all platforms:**
```bash
npm run electron:build
```

### 3. Find Your Built Application

After building, look in the `release/` folder:

- **Windows**: `release/Flourish Visual Novel Engine-2.0.0-x64.exe` (portable) or installer
- **macOS**: `release/Flourish Visual Novel Engine-2.0.0.dmg`
- **Linux**: `release/Flourish Visual Novel Engine-2.0.0.AppImage`

## Development

### Run in Electron During Development

```bash
npm run electron:dev
```

This will:
1. Build the React app
2. Launch Electron window with the built app

### Test the Web Version

```bash
npm run dev
```

Opens at http://localhost:3000/

## Distribution

### What Users Get

Users download a single file:
- **Windows**: `.exe` file (portable) or installer that installs to Program Files
- **macOS**: `.dmg` file they drag to Applications folder
- **Linux**: `.AppImage` file they can run directly

### No Installation Required (Portable)

The Windows portable `.exe` contains everything needed. Users just:
1. Download the `.exe`
2. Double-click to run
3. Start creating visual novels!

### Installer Version (Windows)

The NSIS installer provides:
- Desktop shortcut
- Start menu entry
- Clean uninstall option
- Professional installation experience

## Build Output Details

### Windows Build
- **Portable EXE**: ~200-300MB standalone executable
- **Installer**: NSIS installer with wizard
- **Target**: 64-bit Windows 10/11

### macOS Build
- **DMG**: Drag-and-drop installer
- **ZIP**: Compressed .app bundle
- **Target**: macOS 10.13+

### Linux Build
- **AppImage**: Universal Linux binary (no installation)
- **DEB**: Debian/Ubuntu package
- **Target**: Most Linux distributions

## Customization

### Change App Icon

Replace `docs/Flourish.png` with your custom icon (512x512px recommended).

### Update App Information

Edit `package.json`:
```json
{
  "name": "flourish-visual-novel-engine",
  "version": "2.0.0",
  "description": "Your description",
  "author": "Your Name",
  "build": {
    "appId": "com.yourcompany.flourish"
  }
}
```

### Configure Window Size

Edit `electron/main.cjs`:
```javascript
const mainWindow = new BrowserWindow({
  width: 1400,  // Change width
  height: 900,  // Change height
  minWidth: 1024,
  minHeight: 768
});
```

### Add Auto-Updates (Optional)

For auto-update functionality, you'll need:
1. Code signing certificate (for Windows/macOS)
2. Update server to host new releases
3. Add `electron-updater` package

## Troubleshooting

### Build Fails on Windows

**Error**: `electron-builder not found`
**Solution**: Run `npm install` first

**Error**: `ENOENT: no such file or directory, open 'dist/index.html'`
**Solution**: Run `npm run build` before `npm run electron:build:win`

### Build Fails on macOS

**Error**: Code signing issues
**Solution**: For development, disable signing in package.json:
```json
"mac": {
  "identity": null
}
```

### Electron Window Shows Blank Screen

**Solution**: Make sure Vite build uses relative paths. Check `vite.config.ts` has:
```typescript
base: './'
```

### App Works in Browser but Not in Electron

**Solution**: Check browser console in Electron:
- Press F12 to open DevTools
- Look for CORS or file loading errors
- Ensure all assets use relative paths

## Publishing to itch.io

1. Build the Windows portable version:
   ```bash
   npm run dist
   ```

2. Upload `release/Flourish Visual Novel Engine-2.0.0-x64.exe` to itch.io

3. In itch.io settings:
   - **Kind of project**: Tool
   - **Classification**: Tools > Game development
   - **Platforms**: Windows
   - **This file will be played**: ❌ (it's a downloadable tool)

4. Users download and run - no browser needed!

## File Size Optimization

Current build is ~200-300MB due to:
- Electron runtime (~150MB)
- Chromium engine
- React bundle
- Your app assets

To reduce size:
- Use `electron-builder` compression
- Remove unused dependencies
- Optimize images in `docs/` folder
- Consider electron alternatives (Tauri) for smaller builds

## Advanced: Code Signing

For production distribution, sign your apps:

### Windows
1. Get a code signing certificate from DigiCert, Sectigo, etc.
2. Add to `package.json`:
```json
"win": {
  "certificateFile": "path/to/cert.pfx",
  "certificatePassword": "your-password"
}
```

### macOS
1. Join Apple Developer Program ($99/year)
2. Get Developer ID certificate
3. Add to `package.json`:
```json
"mac": {
  "identity": "Developer ID Application: Your Name (TEAM_ID)"
}
```

### Benefits
- No security warnings for users
- Required for auto-updates
- Professional appearance

## Support

For issues:
1. Check the [Troubleshooting Guide](docs/troubleshooting.html)
2. Open an issue on GitHub
3. Contact support

## Summary

**Quick Build**: `npm install && npm run dist`
**Result**: Native desktop app in `release/` folder
**User Experience**: Download → Double-click → Create visual novels!

No Node.js, Python, or browser required for end users! 🎉
