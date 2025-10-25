# Transition Effects Fix

## Problem
Character transition effects and background transition effects were NOT working in built/exported games, even though they worked correctly in the development editor.

## Root Cause
The CSS animation definitions for transitions were missing from the exported game files. The animations were defined in `index.html` (used by the development environment) but were NOT included in:
1. `src/utils/gameBundler.ts` - Used for browser-based game exports
2. `player-template.html` - Used for Node.js-based build script exports

## Solution
Added all transition animation CSS to both export templates:

### Animations Added:
- **dissolve-in** - Fade in effect
- **fade-out** - Fade out effect
- **iris-in** - Circular reveal effect
- **iris-out** - Circular hide effect
- **wipe-right** - Wipe from left to right
- **wipe-out-right** - Wipe out to the right
- **slide-in-left** - Slide in from left
- **slide-in-right** - Slide in from right
- **slide-out-left** - Slide out to left
- **slide-out-right** - Slide out to right
- **slide** - Custom slide with CSS variables
- **flash-anim** - Flash screen effect
- **scroll-up** - Credits scroll effect
- **shake** - Screen shake effect

### Transition Classes Added:
- `.transition-base` - Base transition settings
- `.transition-fast` - Fast transition variant
- `.transition-dissolve` - Dissolve/fade in
- `.transition-dissolve-out` - Dissolve/fade out
- `.transition-fade-out` - Fade out
- `.transition-iris-in` - Iris in
- `.transition-iris-out` - Iris out
- `.transition-wipe-right` - Wipe right
- `.transition-wipe-out-right` - Wipe out right
- `.transition-slide-in-right` - Slide in from right
- `.transition-slide-in-left` - Slide in from left
- `.transition-slide-out-left` - Slide out to left
- `.transition-slide-out-right` - Slide out to right
- `.transition-slide` - Slide with custom positioning
- `.shake` - Shake effect
- `.credits-scroll` - Credits scroll

## Files Modified:
1. **src/utils/gameBundler.ts** - Added all transition animations to the `generateStandaloneHTML()` function
2. **player-template.html** - Added all transition animations to the template used by the Node.js build script

## Testing:
After this fix, the following transitions should work correctly in exported games:
- ✅ Character show/hide with fade, dissolve, slide, iris, and wipe effects
- ✅ Background changes with all transition types
- ✅ Text/Image overlays with transitions
- ✅ Screen effects (shake, flash)
- ✅ Credits scroll animation

## How to Verify:
1. Export a game using the "Export Game" feature in the editor
2. Open the exported game in a browser
3. Test character transitions (show/hide with different effects)
4. Test background transitions (change backgrounds with different effects)
5. All transition effects should now animate properly

## Date Fixed:
October 20, 2025
