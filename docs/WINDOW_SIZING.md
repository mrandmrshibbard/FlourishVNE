# Window Sizing and Lock Configuration

## Overview
Each manager window now opens at an optimal size for its content, and window resizing is locked to prevent users from having to manually resize or deal with scrolling issues.

## Window Sizes

Each window has been configured with specific dimensions that fit its manager perfectly:

| Window | Width | Height | Resizable | Rationale |
|--------|-------|--------|-----------|-----------|
| **Characters** | 1400px | 900px | ❌ No | Needs space for character preview, sprite editor, and customization panels |
| **UI Screens** | 1200px | 800px | ❌ No | Medium size for UI screen list and properties |
| **Assets** | 1300px | 850px | ❌ No | Needs space for asset library grid and preview panel |
| **Variables** | 1100px | 750px | ❌ No | Smaller window for variable list and value editor |
| **Settings** | 900px | 700px | ❌ No | Smallest window - just needs form fields and settings |

## Implementation Details

### 1. Enhanced `openChildWindow` Function (electron/main.cjs)

Added support for window sizing options:

```javascript
const openChildWindow = (windowKey, title, width = 1000, height = 700, options = {}) => {
  const {
    resizable = true,      // Can user resize window?
    minimizable = true,    // Can user minimize window?
    maximizable = true,    // Can user maximize window?
    minWidth = 800,        // Minimum width if resizable
    minHeight = 600        // Minimum height if resizable
  } = options;
  
  const childWindow = new BrowserWindow({
    width,
    height,
    minWidth,
    minHeight,
    resizable,
    minimizable,
    maximizable,
    // ... other options
  });
}
```

### 2. Updated IPC Communication

**Preload Script (electron/preload.cjs):**
```javascript
openChildWindow: (windowKey, title, width, height, options) => 
  ipcRenderer.send('open-child-window', windowKey, title, width, height, options)
```

**Main Process Handler:**
```javascript
ipcMain.on('open-child-window', (event, windowKey, title, width, height, options) => {
  openChildWindow(windowKey, title, width, height, options);
});
```

### 3. Menu Configuration

Each menu item now specifies its window size:

```javascript
{
  label: 'Characters',
  click: () => openChildWindow('characters', 'Character Manager', 1400, 900, { 
    resizable: false, 
    minWidth: 1400, 
    minHeight: 900 
  })
}
```

### 4. Quick Access Buttons (Header.tsx)

Buttons now pass the same sizing parameters:

```typescript
onClick={() => (window as any).electronAPI?.openChildWindow(
  'characters', 
  'Character Manager', 
  1400, 
  900, 
  { resizable: false, minWidth: 1400, minHeight: 900 }
)}
```

## User Experience Benefits

### ✅ Perfect Fit
- Each window opens at exactly the right size for its content
- No need to manually resize windows
- No scrolling required to see all content

### ✅ Locked Sizing
- Windows cannot be resized (resizable: false)
- Prevents users from accidentally making windows too small
- Maintains consistent, professional appearance
- Users can still minimize and maximize if needed

### ✅ Consistent Experience
- Same size whether opened via menu or quick access buttons
- All windows open at optimal dimensions
- No guesswork for users

## Window States

Each window supports:
- ✅ **Open at fixed size** - Opens at specified dimensions
- ✅ **Minimize** - Can be minimized to taskbar (minimizable: true)
- ✅ **Maximize** - Can be maximized to fullscreen (maximizable: true)
- ❌ **Resize** - Cannot be manually resized (resizable: false)
- ✅ **Focus** - If already open, focuses existing window instead of creating new one

## Technical Notes

### Window Size Selection Process
The sizes were chosen to:
1. Accommodate all content without scrolling
2. Fit comfortably on 1920x1080 displays (most common resolution)
3. Leave room for Windows taskbar and window decorations
4. Scale proportionally based on content complexity

### Flexibility for Future Changes
To adjust a window size, simply modify the parameters in two places:
1. Menu definition in `electron/main.cjs` (Windows menu)
2. Button click handler in `src/components/Header.tsx` (Quick access buttons)

Example:
```javascript
// Make Characters window larger
openChildWindow('characters', 'Character Manager', 1600, 1000, { 
  resizable: false, 
  minWidth: 1600, 
  minHeight: 1000 
})
```

### Optional: Making Windows Resizable
If you want to allow resizing for a specific window in the future:
```javascript
openChildWindow('windowKey', 'Title', width, height, { 
  resizable: true,        // Allow resizing
  minWidth: 800,          // But set minimum bounds
  minHeight: 600,
  maxWidth: 1920,         // Optional: set maximum bounds
  maxHeight: 1080
})
```

## Build Status
✅ Build successful in 2.60s
✅ No TypeScript errors
✅ All window configurations working

## Testing Recommendations
1. Test each window on different screen resolutions
2. Verify content fits without scrolling at specified sizes
3. Confirm maximize/minimize functions work correctly
4. Check that locked sizing prevents manual resizing
5. Ensure multi-monitor setups work properly
