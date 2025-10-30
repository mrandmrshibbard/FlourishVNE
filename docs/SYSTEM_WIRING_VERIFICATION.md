# System Wiring Verification - Complete

## Overview
This document verifies that all window management systems are properly wired and integrated throughout the application.

## ✅ Main Window Configuration

**File:** `electron/main.cjs` (Lines 7-33)

```javascript
mainWindow = new BrowserWindow({
  width: 1400,
  height: 900,
  minWidth: 1024,
  minHeight: 768,
  // ... other config
});

mainWindow.once('ready-to-show', () => {
  mainWindow.maximize(); // ✅ Opens maximized
  mainWindow.show();
});
```

**Status:** ✅ Main window opens maximized

---

## ✅ Child Window Function

**File:** `electron/main.cjs` (Lines 36-96)

```javascript
const openChildWindow = (windowKey, title, width = 1000, height = 700, options = {}) => {
  // Extracts options
  const {
    resizable = true,
    minimizable = true,
    maximizable = true,
    minWidth = 800,
    minHeight = 600
  } = options;
  
  // Creates window with custom sizing
  const childWindow = new BrowserWindow({
    width, height, minWidth, minHeight,
    resizable, minimizable, maximizable,
    // ... other config
  });
  
  // Handles focus if already open
  // Tracks in childWindows object
  // Sends 'switch-tab' message to renderer
}
```

**Status:** ✅ Function properly accepts all parameters

---

## ✅ IPC Communication Layer

### Preload Script
**File:** `electron/preload.cjs` (Lines 5-13)

```javascript
contextBridge.exposeInMainWorld('electronAPI', {
  onSwitchTab: (callback) => ipcRenderer.on('switch-tab', ...),
  onTriggerPlay: (callback) => ipcRenderer.on('trigger-play', ...),
  onTriggerBuild: (callback) => ipcRenderer.on('trigger-build', ...),
  onTriggerExport: (callback) => ipcRenderer.on('trigger-export', ...),
  onTriggerImport: (callback) => ipcRenderer.on('trigger-import', ...),
  openChildWindow: (windowKey, title, width, height, options) => 
    ipcRenderer.send('open-child-window', windowKey, title, width, height, options),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
```

**Status:** ✅ All 5 parameters properly passed to IPC

### Main Process Handler
**File:** `electron/main.cjs` (Lines 98-100)

```javascript
ipcMain.on('open-child-window', (event, windowKey, title, width, height, options) => {
  openChildWindow(windowKey, title, width, height, options);
});
```

**Status:** ✅ IPC handler receives all parameters and forwards them

---

## ✅ Electron Menu Integration

**File:** `electron/main.cjs` (Lines 164-208)

All menu items properly configured with correct parameters:

| Menu Item | Keyboard | Window Key | Size | Options |
|-----------|----------|------------|------|---------|
| Characters | Ctrl+1 | `characters` | 1400×900 | `{ resizable: false, minWidth: 1400, minHeight: 900 }` |
| UI Screens | Ctrl+2 | `ui` | 1200×800 | `{ resizable: false, minWidth: 1200, minHeight: 800 }` |
| Assets | Ctrl+3 | `assets` | 1300×850 | `{ resizable: false, minWidth: 1300, minHeight: 850 }` |
| Variables | Ctrl+4 | `variables` | 1100×750 | `{ resizable: false, minWidth: 1100, minHeight: 750 }` |
| Settings | Ctrl+5 | `settings` | 900×700 | `{ resizable: false, minWidth: 900, minHeight: 700 }` |

**Status:** ✅ All 5 menu items correctly configured

---

## ✅ Quick Access Buttons Integration

**File:** `src/components/Header.tsx` (Lines 122-188)

All buttons properly configured with matching parameters:

### Characters Button
```typescript
onClick={() => (window as any).electronAPI?.openChildWindow(
  'characters', 'Character Manager', 1400, 900, 
  { resizable: false, minWidth: 1400, minHeight: 900 }
)}
```
✅ Matches menu configuration

### UI Button
```typescript
onClick={() => (window as any).electronAPI?.openChildWindow(
  'ui', 'UI Screen Manager', 1200, 800, 
  { resizable: false, minWidth: 1200, minHeight: 800 }
)}
```
✅ Matches menu configuration

### Assets Button
```typescript
onClick={() => (window as any).electronAPI?.openChildWindow(
  'assets', 'Asset Manager', 1300, 850, 
  { resizable: false, minWidth: 1300, minHeight: 850 }
)}
```
✅ Matches menu configuration

### Variables Button
```typescript
onClick={() => (window as any).electronAPI?.openChildWindow(
  'variables', 'Variable Manager', 1100, 750, 
  { resizable: false, minWidth: 1100, minHeight: 750 }
)}
```
✅ Matches menu configuration

### Settings Button
```typescript
onClick={() => (window as any).electronAPI?.openChildWindow(
  'settings', 'Project Settings', 900, 700, 
  { resizable: false, minWidth: 900, minHeight: 700 }
)}
```
✅ Matches menu configuration

**Status:** ✅ All 5 buttons match menu items exactly

---

## ✅ Data Flow Verification

### Opening a Window (Complete Flow)

1. **User Action** → Clicks quick access button OR presses keyboard shortcut OR clicks menu item

2. **Renderer Process** (Header.tsx or Menu):
   ```typescript
   electronAPI.openChildWindow(windowKey, title, width, height, options)
   ```

3. **Preload Bridge** (preload.cjs):
   ```javascript
   ipcRenderer.send('open-child-window', windowKey, title, width, height, options)
   ```

4. **IPC Channel** → Electron IPC sends message to main process

5. **Main Process Handler** (main.cjs):
   ```javascript
   ipcMain.on('open-child-window', (event, windowKey, title, width, height, options) => {
     openChildWindow(windowKey, title, width, height, options);
   })
   ```

6. **Window Creation** (main.cjs):
   ```javascript
   const childWindow = new BrowserWindow({
     width, height, minWidth, minHeight,
     resizable, minimizable, maximizable,
     ...
   });
   ```

7. **Window Display** → Window opens at exact size, locked from resizing

**Status:** ✅ Complete flow verified

---

## ✅ Consistency Check

### Parameters Match Across All Systems

| Window | Menu Size | Button Size | Menu Options | Button Options |
|--------|-----------|-------------|--------------|----------------|
| Characters | 1400×900 | 1400×900 ✅ | resizable: false | resizable: false ✅ |
| UI | 1200×800 | 1200×800 ✅ | resizable: false | resizable: false ✅ |
| Assets | 1300×850 | 1300×850 ✅ | resizable: false | resizable: false ✅ |
| Variables | 1100×750 | 1100×750 ✅ | resizable: false | resizable: false ✅ |
| Settings | 900×700 | 900×700 ✅ | resizable: false | resizable: false ✅ |

**Status:** ✅ 100% consistency across all systems

---

## ✅ Build Verification

**Command:** `npm run build`
**Result:** ✓ built in 3.35s
**Status:** ✅ No TypeScript errors, no compilation issues

---

## 🎯 Final Verification Summary

| System Component | Status | Notes |
|------------------|--------|-------|
| Main Window Maximized | ✅ | Opens maximized on launch |
| Child Window Function | ✅ | Accepts all 5 parameters |
| IPC Preload Bridge | ✅ | Passes all parameters correctly |
| IPC Main Handler | ✅ | Receives and forwards all parameters |
| Electron Menu (5 items) | ✅ | All configured with correct sizes |
| Quick Access Buttons (5) | ✅ | All match menu configurations |
| Parameter Consistency | ✅ | 100% match across all systems |
| Window Size Locking | ✅ | All windows set to resizable: false |
| Build Success | ✅ | No errors or warnings |
| TypeScript Types | ✅ | All casts properly handled |

---

## 🚀 Testing Checklist

To verify everything works in the Electron app:

### Main Window
- [ ] App opens maximized
- [ ] Window title shows "Flourish Visual Novel Engine"
- [ ] Quick access buttons visible in header

### Menu Items (Windows Menu)
- [ ] Ctrl+1 opens Characters at 1400×900 (locked)
- [ ] Ctrl+2 opens UI at 1200×800 (locked)
- [ ] Ctrl+3 opens Assets at 1300×850 (locked)
- [ ] Ctrl+4 opens Variables at 1100×750 (locked)
- [ ] Ctrl+5 opens Settings at 900×700 (locked)

### Quick Access Buttons
- [ ] 👥 button opens Characters at 1400×900 (locked)
- [ ] 🪟 button opens UI at 1200×800 (locked)
- [ ] 📁 button opens Assets at 1300×850 (locked)
- [ ] </> button opens Variables at 1100×750 (locked)
- [ ] ⚙️ button opens Settings at 900×700 (locked)

### Window Behavior
- [ ] Windows cannot be manually resized
- [ ] Windows can be minimized
- [ ] Windows can be maximized
- [ ] Clicking button when window open focuses existing window
- [ ] Each window shows correct tab content

---

## 📋 Maintenance Notes

### To Change a Window Size:
1. Update `electron/main.cjs` menu item (Lines 164-208)
2. Update `src/components/Header.tsx` button (Lines 122-188)
3. Keep both in sync

### To Add a New Window:
1. Add menu item in `electron/main.cjs` with `openChildWindow` call
2. Add button in `src/components/Header.tsx` with same parameters
3. Ensure window key, title, size, and options match exactly

### To Make a Window Resizable:
Change `resizable: false` to `resizable: true` in both locations

---

## ✅ VERIFICATION COMPLETE

All systems are properly wired and integrated. The application is ready for testing in Electron.
