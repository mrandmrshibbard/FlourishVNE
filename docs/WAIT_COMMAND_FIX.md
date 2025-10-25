# Wait Command Fix

## Problem
The Wait command was causing scenes to become unresponsive, especially when placed at the beginning of a scene. Users were unable to advance past Wait commands, making scenes unplayable.

## Root Cause
The Wait command was incorrectly using the `isWaitingForInput` flag when `waitForInput` was enabled. This flag is used by the game loop to pause command processing and is intended for dialogue, text input, and movies where the UI displays something the user needs to interact with.

When a Wait command set `isWaitingForInput = true`, the game loop would block at line 1622:
```typescript
if (playerState.uiState.isWaitingForInput || playerState.uiState.isTransitioning || playerState.uiState.choices) {
    return; // Blocks all command processing
}
```

This created a deadlock:
1. Wait command sets `isWaitingForInput = true`
2. Wait command registers event listeners to call `advance()`
3. Game loop sees `isWaitingForInput = true` and stops processing
4. User input calls `advance()` but no new commands execute
5. Scene becomes stuck

## Solution
Removed the `isWaitingForInput` flag from Wait command logic. The Wait command now:
- Registers event listeners directly (for `waitForInput: true`)
- Uses setTimeout for timed waits
- Calls `advance()` directly without manipulating the game loop state
- Does not block the game loop

### Changes Made:

**LivePreview.tsx** (Editor):
- Removed `setPlayerState(p => p ? { ...p, uiState: { ...p.uiState, isWaitingForInput: true }} : null)`
- Removed state updates for `isWaitingForInput: false` in cleanup
- Wait command now relies solely on event listeners and setTimeout

**gameEngineBundle.ts** (Exported Games):
- Applied the same fix to ensure exported games work correctly
- Removed all `isWaitingForInput` state manipulation from Wait command

## Technical Details

### Before (Broken):
```typescript
case CommandType.Wait: {
    instantAdvance = false;
    if (cmd.waitForInput) {
        setPlayerState(p => p ? { ...p, uiState: { ...p.uiState, isWaitingForInput: true }} : null);
        // ... event listeners that try to advance
        // But game loop is blocked!
    }
}
```

### After (Fixed):
```typescript
case CommandType.Wait: {
    instantAdvance = false;
    if (cmd.waitForInput) {
        // Don't set isWaitingForInput - just use event listeners
        let timeoutId = window.setTimeout(() => {
            advance();
            removeListeners();
        }, durationMs);
        // ... event listeners work normally
    } else {
        setTimeout(() => advance(), durationMs);
    }
}
```

## Testing
The Wait command should now work correctly in these scenarios:

✅ Wait at the beginning of a scene
✅ Wait with `waitForInput: true` (can skip with click/space/enter)
✅ Wait with `waitForInput: false` (waits full duration)
✅ Multiple Wait commands in sequence
✅ Wait commands mixed with other commands
✅ Works in both editor preview and exported games

## Files Modified:
1. `src/components/LivePreview.tsx` - Fixed Wait command in editor
2. `src/utils/gameEngineBundle.ts` - Fixed Wait command in exported games

## Date Fixed:
October 20, 2025
