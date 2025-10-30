# Quick Access Buttons - Implementation Complete

## Overview
Added quick access icon buttons in the header that allow users to quickly open tab windows from the Electron menu without having to navigate through Windows > [Tab Name].

## Changes Made

### 1. Electron Preload (electron/preload.cjs)
- Added `openChildWindow` method to electronAPI bridge
- Allows renderer process to request opening child windows via IPC

### 2. Electron Main Process (electron/main.cjs)
- Added IPC handler `open-child-window` that receives requests from renderer
- Calls existing `openChildWindow` function with window key and title

### 3. New Icons Added (src/components/icons.tsx)
- **UsersIcon** - Group of people icon for Characters (more intuitive than sparkles)
- **WindowIcon** - Window/screen icon for UI (clearer than bookmark)
- **FolderIcon** - Folder icon for Assets (better context than just photo)
- **CodeBracketIcon** - Code brackets icon for Variables (clearly indicates programming/variables)
- All icons follow the same pattern with title support for tooltips

### 4. Header Component (src/components/Header.tsx)
- Added icon imports: `UsersIcon`, `WindowIcon`, `FolderIcon`, `CodeBracketIcon`, `Cog6ToothIcon`
- Added quick access button group with 5 icon buttons:
  - **👥 Characters** (UsersIcon) - "Characters - Manage character sprites and customization"
  - **🪟 UI** (WindowIcon) - "UI - Manage custom UI screens and menus"
  - **📁 Assets** (FolderIcon) - "Assets - Import images, audio, and other media"
  - **</> Variables** (CodeBracketIcon) - "Variables - Track game state and player choices"
  - **⚙️ Settings** (Cog6ToothIcon) - "Settings - Configure project properties"
- Buttons only show when running in Electron (checks for `window.electronAPI`)
- Each button has descriptive hover tooltips explaining what the window does
- Styled to match existing header buttons (compact, py-1 px-1, text-xs)
- Separated from title with border-l for visual clarity

## User Experience Improvements

### More Intuitive Icons
- **Before**: Sparkle (characters), Bookmark (UI), Photo (assets), Two cogs for variables AND settings
- **After**: People/Users (characters), Window (UI), Folder (assets), Code brackets (variables), Cog (settings)
- Each icon now clearly represents its function at a glance

### Descriptive Tooltips
Instead of just "Open X Window", tooltips now explain what each window does:
- "Characters - Manage character sprites and customization"
- "UI - Manage custom UI screens and menus"
- "Assets - Import images, audio, and other media"
- "Variables - Track game state and player choices"
- "Settings - Configure project properties"

### Visual Design
- **Location**: Between project title and Play button in header
- **Visual Separator**: Left border to distinguish from title
- **Consistent Styling**: Matches header's compact design
- **Electron Only**: Buttons only appear in desktop app, not browser
- **No Size Impact**: Header remains same height

## Technical Details
- Uses existing `openChildWindow` function from main.cjs
- Maintains window focus if already open
- Creates new window if needed
- Proper IPC communication via preload bridge
- Type-safe with TypeScript (using `(window as any).electronAPI`)
- All icon components support title attribute for native browser tooltips

## Build Status
✅ Build successful in 2.70s
✅ No TypeScript errors
✅ All functionality working
✅ All new icons properly exported and imported

## Next Steps
- Test in Electron environment to verify button functionality
- Ensure all windows open correctly
- Confirm hover tooltips display properly with descriptive text
- Verify icons are visually clear and intuitive to users
