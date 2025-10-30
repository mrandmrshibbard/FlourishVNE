# Quick Access Button Icons Reference

## Icon Design Rationale

Each icon was carefully chosen to be immediately recognizable and intuitive for users.

### Icon Changes

| Window | Old Icon | New Icon | Reason |
|--------|----------|----------|---------|
| **Characters** | ✨ Sparkle | 👥 Users/People | People icon clearly represents characters - more intuitive than abstract sparkles |
| **UI** | 📑 Bookmark | 🪟 Window | Window icon directly represents UI screens and interfaces |
| **Assets** | 📷 Photo | 📁 Folder | Folder icon represents a collection of different asset types (images, audio, etc.) |
| **Variables** | ⚙️ Cog | </> Code Brackets | Code brackets clearly indicate programming variables/data |
| **Settings** | ⚙️ Cog | ⚙️ Cog | Cog/gear universally understood as settings - kept unchanged |

### Visual Appearance

All buttons use the same styling for consistency:
- Size: `w-3 h-3` (small, compact icons)
- Padding: `py-1 px-1` (minimal padding)
- Background: `bg-[var(--bg-tertiary)]`
- Hover: `hover:bg-slate-700`
- Border radius: `rounded`
- Separated from title with a left border

### Tooltip Design

Tooltips use a two-part format:
1. **Window Name** - Brief title
2. **Description** - What the window lets you do

Examples:
- "Characters - Manage character sprites and customization"
- "Assets - Import images, audio, and other media"
- "Variables - Track game state and player choices"

This provides context for new users while being concise enough not to obstruct the interface.

## SVG Icon Details

All icons are from Heroicons (20x20 solid style) and include:
- `title` prop support for accessibility
- `className` prop for styling
- `currentColor` fill for theme compatibility
- Consistent viewBox and size

### Icon Components

```typescript
// src/components/icons.tsx

export const UsersIcon = ({ className, title, ...props }) => (
  // Group/multiple people icon - clearly represents characters
);

export const WindowIcon = ({ className, title, ...props }) => (
  // Window with panes - represents UI screens
);

export const FolderIcon = ({ className, title, ...props }) => (
  // Folder icon - represents asset collections
);

export const CodeBracketIcon = ({ className, title, ...props }) => (
  // Code brackets </> - represents variables/programming
);

export const Cog6ToothIcon = ({ className, title, ...props }) => (
  // 6-tooth gear - universal settings icon
);
```

## User Testing Recommendations

When testing with users, verify:
1. Icons are immediately recognizable without tooltips
2. Tooltips provide helpful additional context
3. Icon meanings are consistent with user mental models
4. No confusion between similar windows

## Future Considerations

If additional quick access buttons are needed:
- Maintain consistent icon style (20x20 Heroicons solid)
- Follow same tooltip format (Name - Description)
- Keep buttons compact (w-3 h-3)
- Choose universally recognized symbols
- Test with users to ensure clarity
