# Interactive Images & Auto-Advance with History System

## Overview
This document describes the interactive images, auto-advance, and dialogue history features added to Flourish Visual Novel Engine.

## Features Implemented

### 1. Interactive Images
Images in scenes can now act like buttons with full interaction support:

#### New ShowImageCommand Properties
- **`onClick?: VNUIAction`** - Action to trigger when image is clicked (e.g., JumpToScene, SetVariable, etc.)
- **`hoverImageId?: VNID`** - Alternative image to show when hovering over the image
- **`waitForClick?: boolean`** - Pauses game progression until the image is clicked

#### Visual Feedback
- Cursor changes to pointer when hovering over clickable images
- Smooth opacity transitions when switching between normal and hover images
- Click propagation is stopped to prevent triggering stage click-advance

#### Usage Example
```typescript
{
  type: 'ShowImage',
  imageId: 'my-button-image',
  onClick: { type: UIActionType.JumpToScene, targetSceneId: 'scene-2' },
  hoverImageId: 'my-button-hover-image',
  waitForClick: true,
  // ... other ShowImage properties
}
```

### 2. Auto-Advance System
Automatically advance dialogue after a configurable delay:

#### GameSettings Properties
- **`autoAdvance: boolean`** - Enable/disable auto-advance (default: `false`)
- **`autoAdvanceDelay: number`** - Delay in seconds before advancing (default: `3`, range: `1-10`)

#### Behavior
- Only triggers when dialogue is shown and waiting for input
- Does NOT auto-advance when choices are presented
- Does NOT auto-advance during movies or other non-dialogue states
- Respects game state (only works in 'playing' mode)
- Timer resets whenever dialogue changes

#### Settings UI Components
Two new UI element options added:

**SettingsToggle:**
- Setting: "Auto-Advance" - Boolean toggle for enabling/disabling

**SettingsSlider:**
- Setting: "Auto-Advance Delay" - Range 1-10 seconds with 0.5 step increments

### 3. Dialogue History System
Complete history tracking of all dialogue and player choices:

#### PlayerState Properties
- **`dialogueHistory: Array`** - Records every dialogue line shown
  ```typescript
  {
    characterName: string;
    characterColor: string;
    text: string;
    timestamp: number;
  }
  ```

- **`choiceHistory: Array`** - Records every choice made by the player
  ```typescript
  {
    choiceText: string;
    timestamp: number;
  }
  ```

#### History Viewer UI
Press **H** during gameplay to open the history viewer modal:
- Shows merged timeline of dialogue and choices sorted by timestamp
- Dialogue entries display character name (colored) and text
- Choice entries display with arrow indicator and highlighted styling
- Scrollable interface for reviewing entire conversation
- Shows entry count at the bottom
- Close with X button or **Escape** key

#### Keyboard Shortcuts
- **H** - Toggle history viewer (during gameplay)
- **Escape** - Close history viewer
- **Spacebar** - Advance dialogue/movies (existing)

## Implementation Details

### File Changes

#### Type Definitions
- `src/types/scene/types.ts` - Updated ShowImageCommand interface
- `src/components/live-preview/types/gameState.ts` - Updated GameSettings and PlayerState
- `src/features/ui/types.ts` - Added 'autoAdvanceDelay' to GameSetting and 'autoAdvance' to GameToggleSetting

#### Command Handlers
- `src/components/live-preview/command-handlers/overlayHandler.ts` - Resolves hover images and includes interactive properties
- `src/components/live-preview/command-handlers/dialogueHandler.ts` - Records dialogue to history

#### UI Components
- `src/components/LivePreview.tsx`:
  - Added `HistoryViewer` component for displaying logs
  - Added `showHistory` state and keyboard handler
  - Updated `ImageOverlayElement` with hover state and click handlers
  - Added auto-advance useEffect timer
  - Updated settings slider ranges for autoAdvanceDelay
  - Updated choice handler to record choice history

#### Inspector UI
- `src/components/menu-editor/UIElementInspector.tsx` - Added auto-advance options to settings dropdowns

### Technical Notes

#### Auto-Advance Timer Dependencies
The auto-advance useEffect depends on:
- `playerState?.uiState.dialogue` - Current dialogue text
- `playerState?.uiState.isWaitingForInput` - Whether waiting for player input
- `settings.autoAdvance` - Auto-advance enabled state
- `settings.autoAdvanceDelay` - Delay duration
- `playerState?.mode` - Game mode (must be 'playing')

#### History Recording
- Dialogue is recorded when `handleDialogue` is called via CommandResult.updates
- Choices are recorded immediately before processing choice actions
- All timestamps use `Date.now()` for consistency

#### Interactive Image Click Handling
- Uses `stopPropagation()` to prevent stage click-through
- Only triggers action if onClick is defined
- Calls `handleDialogueAdvance()` if waitForClick is true

## User Experience

### For Players
- **Interactive Images**: Click on images to trigger actions (like menu buttons)
- **Hover Effects**: See visual feedback when hovering over clickable elements
- **Auto-Advance**: Set dialogue to automatically progress (useful for readers)
- **History Review**: Press H to review previous dialogue and choices made

### For Developers
- **Easy Setup**: Add interactive properties to ShowImageCommand
- **Flexible Actions**: Use any VNUIAction for onClick (jump, set variable, etc.)
- **UI Components**: Drag and drop SettingsToggle/SettingsSlider elements for player controls
- **No Migration Needed**: All new properties are optional, existing projects continue working

## Future Enhancements
Potential improvements:
- Voice-over auto-advance timing based on audio duration
- History search/filter functionality
- Export history as text file
- Different auto-advance delays per character
- Configurable history UI styling via project settings
