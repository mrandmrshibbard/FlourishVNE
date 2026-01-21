# FlourishVNE Updates

This file tracks user-visible improvements for each update drop.

## How to Use
- Add new releases at the top.
- Keep entries user-facing (what changed, why it matters).
- If an update requires user action, include it under **Migration / Action Required**.
- Link to specs or PRs when available.

---

## Unreleased

**Highlights**
- 

**Editor**
- 

**Runtime / Player**
- 

**Export / Build**
- 

**Bug Fixes**
- 

**Performance**
- 

**Accessibility**
- 

**DevEx**
- 

**Migration / Action Required**
- 

---

## 2.0.0 — 2025-??-??

**Highlights**
- Initial 2.0 release.

**Notes**
- Replace this with your real 2.0.0 changelog as desired.


## 2.1.0 - 1/21/2026
- Major Updates to the application
    1. Keyboard Shortcuts Help Panel (Issue #4)
    Created KeyboardShortcutsModal.tsx - full help panel with all shortcuts
    Added ? key shortcut to open help from anywhere in the editor
    Added ? button in the header toolbar next to undo/redo
    Shows shortcuts for: Navigation (Shift+1-7), Commands (Ctrl+C/V/A, Delete, Shift+Click), History (Ctrl+Z/Y)
    
    2. Loading States for Operations (Issue #5)
    Created LoadingOverlay.tsx - reusable loading overlay with progress
    Added loading state to ProjectHub when importing projects
    Added loading state to Header when exporting projects
    GameBuilder already has progress - no changes needed

    3. Variable Delete Impact Warnings (Issue #6)
    Added findVariableUsages() function in VariableManager.tsx
    Scans all scenes, commands, conditions, UI screens, and text references
    Shows detailed confirmation modal listing all places the variable is used
    Warns users they may break their game before deleting

    4. Recent Projects List (Issue #7)
    Added recent projects section to ProjectHub.tsx
    Stores project metadata (title, scene/character counts, last opened time) in localStorage
    Shows up to 5 recent projects with relative timestamps
    Users can remove individual projects from the list
    Projects are saved when created or imported

    5. Searchable Dropdowns
    Created SearchableSelect.tsx - reusable searchable dropdown component with:
    Type-to-filter functionality (auto-shows when >5 options)
    Option grouping support
    Keyboard navigation (arrow keys + Enter)
    Auto-scroll to selected item
    Integrated into PropertiesInspector for:
    Character selection (Dialogue, ShowCharacter, HideCharacter)
    Expression selection (ShowCharacter)
    Background/Image selection (SetBackground)

    6. Transition Previews
    Created TransitionPreview.tsx - animated preview component showing:
    Visual animation of each transition type (fade, dissolve, slide, iris-in, wipe-right, instant)
    Click-to-replay functionality
    Respects duration setting
    Integrated into all transition fields via the TransitionFields component

    7. Asset Upload UX Improvements
    Enhanced AssetManager.tsx with:
    Drag-and-drop on empty state: Drop files directly onto the empty area
    Visual progress bar: Shows animated fill during multi-file uploads
    Spinner animation: Visual feedback during upload
    Better empty state messaging: "Drag & drop files here, or use the Upload button"
    Drag highlight effect: Visual feedback when dragging over drop zone

    8. Branch Connector Lines
    Enhanced SceneEditor.tsx branch visualization:
    Thicker border: 3px solid colored line for better visibility
    Rounded corner: Bottom-left radius for visual hierarchy
    Connector dots: Circular dots on each branch child (filled when selected)
    Horizontal connector lines: Lines connecting dots to commands
    Dynamic coloring: Uses branch color for all connector elements