# Asset Manager Revamp

## Overview
Complete redesign of the Asset Manager with modern UI and sub-directory organization support.

## Key Features

### 1. Modern UI Design
- **Sleek Category Sidebar**: Color-coded icons for each asset type (backgrounds, images, audio, videos)
- **Grid/List View Toggle**: Switch between card-based grid view and compact list view
- **Card-Based Layout**: Beautiful asset cards with hover effects and thumbnails
- **Gradient Upload Button**: Eye-catching upload button with progress indicator
- **Empty States**: Helpful empty state designs for better UX

### 2. Sub-Directory Organization
- **Virtual Folders**: Organize assets using path-based folders (e.g., "Characters/Heroes", "UI/Icons")
- **Breadcrumb Navigation**: Easy navigation through folder hierarchy
- **Folder Cards**: Visual representation of folders with item counts
- **Automatic Organization**: Folders are created implicitly when assets have paths
- **Delete Folders**: Remove folders and all their contents

### 3. Advanced Features
- **Search**: Real-time search filtering within current directory
- **Thumbnails**: Preview images and videos directly in cards
- **Hover Actions**: Rename and delete buttons appear on hover
- **Responsive Inspector**: Detailed asset properties panel on the right
- **Multi-Asset Upload**: Batch upload with progress tracking

### 4. Technical Implementation
- **Optional Path Field**: Added `path?: string` to all asset types
- **Backward Compatible**: Old projects without paths work seamlessly
- **ID-Based References**: Asset references use IDs, not paths
- **Export/Import Safe**: Paths are preserved but don't affect builds

## Asset Types Enhanced

All asset types now support the optional `path` field:

```typescript
interface VNBackground {
    id: VNID;
    name: string;
    imageUrl?: string;
    videoUrl?: string;
    isVideo?: boolean;
    loop?: boolean;
    autoplay?: boolean;
    path?: string; // NEW: e.g., "Characters/Heroes" or "" for root
}
```

Same for `VNImage`, `VNAudio`, and `VNVideo`.

## UI Components

### Category Sidebar
- Fixed width using `var(--sidebar-width)`
- Color-coded icons (purple, blue, green, pink)
- Shows asset count per category
- Gradient selection indicator

### Breadcrumbs
- Shows current location in folder hierarchy
- Clickable navigation to parent folders
- Folder icon for root directory

### Toolbar
- Search bar with icon
- Grid/List view toggle
- Upload button

### Asset Display
- Folders section (when sub-directories exist)
- Assets section (files in current directory)
- Responsive grid (4 columns) or list layout

### Asset Cards (Grid View)
- Square aspect ratio
- Full thumbnail preview
- Asset name below
- Hover actions (rename, delete)
- Selection indicator

### Asset Cards (List View)
- Thumbnail on left (16x16)
- Asset name and type
- Hover actions on right
- Chevron for navigation

### Folder Cards
- Yellow folder icon
- Folder name
- Total item count
- Delete button on hover
- Click to navigate

## Usage

### Creating Folders
1. Click the **"New Folder"** button in the toolbar (folder icon with plus sign)
2. A folder creation card appears in the grid/list view
3. Type the folder name (cannot contain / or \ characters)
4. Press **Enter** to create or **Escape** to cancel
5. The folder is created with a hidden placeholder asset

Folders can also be created implicitly when you move or upload assets with a path.

### Moving Assets to Folders
1. Hover over an asset card to reveal action buttons
2. Click the **yellow folder icon** to move the asset
3. A dialog shows all existing folders with numbers
4. Either:
   - Enter a folder number to select an existing folder
   - Type a custom path to create a new location (e.g., "Characters/Heroes/Main")
5. The asset is moved to the selected folder

### Navigating
- Click folder cards to enter
- Use breadcrumbs to go back
- Root is the top-level directory

### Searching
Search bar filters assets in the current directory. Clear search to see all assets.

### View Modes
- **Grid View**: Best for visual browsing with thumbnails
- **List View**: Best for scanning names and types

## CSS Variables Used
- `--sidebar-width`: Category sidebar width
- `--inspector-width`: Properties panel width

## Future Enhancements
- Drag-and-drop to move assets between folders
- Right-click context menus
- Folder rename
- Create empty folders
- Bulk asset operations
- Copy/Move assets
- Folder color labels

## Migration Notes
- No migration needed for existing projects
- Path field is optional and defaults to empty string (root)
- All existing assets work without modification
- Export/import maintains paths for editor use
- Desktop builds and standalone player unaffected
