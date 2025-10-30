# Transitions Quick Reference

## Screen Transitions

### Adding Transition to a Screen
1. Open **UI Manager** tab
2. Select a screen
3. Find **Screen Transitions** section
4. Set:
   - **Transition In**: How screen appears (`fade`, `slideUp`, `slideDown`, `slideLeft`, `slideRight`, `none`)
   - **Transition Out**: How screen disappears (same options, **FULLY IMPLEMENTED**)
   - **Duration (ms)**: Animation time in milliseconds (default: 300)

### Example: Character Creation Screen
```
Transition In: slideUp (screen rises from bottom)
Transition Out: slideDown (screen drops away)
Duration: 400ms
Effect: Natural panel open/close feel
```

### Best Practices for Transitions
- **Match directions**: If screen slides up, it should slide down when closing
- **Use fade for overlays**: Fade in/out works well for popups and dialogs
- **Side panels**: slideLeft in + slideRight out (or vice versa)

---

## Element Transitions

### Adding Transition to an Element
1. Select any UI element (Button, Text, Image, etc.)
2. Find **Element Transition** section (after position/size fields)
3. Set:
   - **Transition In**: Animation type
   - **Duration (ms)**: How long (default: 300)
   - **Delay (ms)**: Wait before starting (default: 0)

### Transition Types
| Type | Effect | Best For |
|------|--------|----------|
| `fade` | Fades in from transparent | Text, general purpose |
| `slideUp` | Slides in from below | Bottom panels, buttons |
| `slideDown` | Slides in from above | Top banners, titles |
| `slideLeft` | Slides in from right | Right-side menus |
| `slideRight` | Slides in from left | Left-side menus |
| `scale` | Grows from small to full size | Icons, portraits, emphasis |

### Staggered Animation Example
Create a sequence of 4 buttons appearing one after another:

```
Button 1: transition=fade, duration=300, delay=0
Button 2: transition=fade, duration=300, delay=100
Button 3: transition=fade, duration=300, delay=200
Button 4: transition=fade, duration=300, delay=300
```

**Result**: Buttons fade in one at a time with 100ms gap between each.

---

## Image Element Backgrounds

### Old Way (still works):
- Type: `image` or `video`
- Asset: Select from dropdown

### New Way (recommended):
1. Select Image element
2. **Background Type** dropdown:
   - **Color**: Use color picker for solid background
   - **Image**: Select from image assets
   - **Video**: Select from video assets
3. For images/videos, choose **Fit Mode**:
   - **Contain**: Show full image, may have borders
   - **Cover**: Fill entire area, may crop edges
   - **Fill**: Stretch to fit exactly

---

## Dialogue on Screens

### Enable Dialogue Box
1. Open screen in UI Manager
2. Find **Dialogue Box** section
3. Check **Show Dialogue**

**How It Works:**
- When checked: Game dialogue appears on top of your custom screen
- When unchecked: Dialogue is hidden while screen is displayed
- Perfect for HUD overlays that need to show dialogue

**Example Use Cases:**
- Phone interface that shows text messages (dialogue)
- In-game computer screen displaying emails
- Custom HUD with dialogue visible
- Status overlay that doesn't block dialogue

**Status**: ✅ **FULLY IMPLEMENTED** - Works seamlessly with game dialogue system

---

## Common Patterns

### Title Screen
```
Screen: transitionIn=fade, transitionOut=fade, duration=500
Logo: transitionIn=scale, duration=600, delay=200
Buttons: transitionIn=fade, duration=400, delays staggered (0, 150, 300)
```

### Pause Menu
```
Screen: transitionIn=fade, transitionOut=fade, duration=200
Background Panel: transitionIn=fade, duration=300
Buttons: transitionIn=slideUp, duration=400, delays staggered
```

### Character Customization
```
Screen: transitionIn=slideUp, transitionOut=slideDown, duration=400
Character Preview: transitionIn=scale, duration=500, delay=100
Cycler Buttons: transitionIn=fade, duration=300, delays staggered
```

### Settings Panel
```
Screen: transitionIn=slideLeft, transitionOut=slideRight, duration=350
Title: transitionIn=fade, duration=300, delay=100
Sliders: transitionIn=slideRight, duration=400, delays staggered
```

### In-Game HUD with Dialogue
```
Screen: transitionIn=fade, transitionOut=fade, duration=250
Show Dialogue: CHECKED (dialogue appears on top of HUD)
Health Bar: transitionIn=slideDown, duration=300
Menu Button: transitionIn=fade, duration=200, delay=100
```

---

## Timing Guidelines

| Duration | Feel | Best For |
|----------|------|----------|
| 150-250ms | Snappy | Quick menus, subtle effects |
| 300-400ms | Smooth | General purpose (recommended) |
| 500-700ms | Relaxed | Title screens, dramatic reveals |
| 800ms+ | Slow | Special moments only |

**Delay Stagger**: Use 50-150ms gaps for smooth sequential animations

---

## Troubleshooting

### Transition Not Visible
- Check duration isn't 0
- Ensure transition type isn't `none`
- Verify screen is actually showing (check ShowScreen command)

### Elements Appear Too Fast/Slow
- Adjust duration: 300ms is standard
- For multiple elements, use delays to control timing

### Transitions Feel Choppy
- Reduce number of animated elements
- Use simpler transitions (fade instead of slide)
- Test on target hardware

---

## Default Values

If you don't set transition properties:
- `transitionIn`: `fade`
- `transitionDuration`: `300` (milliseconds)
- `transitionDelay`: `0` (milliseconds)
- `showDialogue`: `false`

**Old projects work without changes!** Defaults kick in automatically.
