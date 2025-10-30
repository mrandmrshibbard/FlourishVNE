# Command Stacking - User Guide

## 🎬 **What is Command Stacking?**

Command Stacking allows multiple commands to execute simultaneously (in parallel) rather than one after another. This creates more dynamic, cinematic scenes by layering effects, character movements, music, and visual changes all at once!

## ✨ **Visual Example**

### **Without Stacking** (Sequential):
```
1. Play Music (Battle Theme)     ⏱ Wait 1s
2. Show Character (Hero, Left)   ⏱ Wait 0.5s
3. Flash Screen (White)          ⏱ Wait 0.3s
Total Time: 1.8 seconds
```

### **With Stacking** (Parallel):
```
┌────────────────────┬────────────────────┬──────────────────┐
│ Play Music         │ Show Character     │ Flash Screen     │
│ (Battle Theme)     │ (Hero, Left)       │ (White)          │
└────────────────────┴────────────────────┴──────────────────┘
Total Time: 1.0 second (all at once!)
```

## 🎯 **How to Stack Commands**

### **Method 1: Drag & Drop**

1. **Select a command** you want to stack
2. **Drag it onto another command**
3. **Drop in the middle** of the command (purple indicator appears)
4. **Done!** Commands are now stacked side-by-side

### **Method 2: Multi-Select (Coming Soon)**

1. **Shift-click** or **Ctrl-click** multiple commands
2. **Right-click** on selection
3. Choose **"Stack Selected Commands"**
4. **Done!** All selected commands stack together

## 🎨 **Visual Indicators**

### **Purple Border**
- Indicates command is part of a stack
- All stacked commands have matching purple borders

### **Sparkle Icon (✨)**
- Shows command will run asynchronously (in parallel)
- Appears next to command type

### **Warning Icon (⚠)**
- Appears for commands that may behave unpredictably when stacked
- Hover to see warning message

### **Stack Count Badge**
- Shows total number of commands in stack
- Appears on first command in stack

### **Drop Zone Indicators**

When dragging a command, colored lines show where you can drop:

- **Purple Line Above**: ⬆ Place Above - Inserts command before target
- **Purple Border**: ⊕ Add to Stack - Adds to existing stack
- **Purple Line Below**: ⬇ Place Below - Inserts command after target
- **Red Line**: ❌ Invalid - Cannot stack these commands together

## ✅ **Commands That Can Stack**

These commands work great when stacked:

### **Visual Effects**
- ✅ Set Background
- ✅ Show/Hide Character
- ✅ Show/Hide Image
- ✅ Show/Hide Text
- ✅ Flash Screen
- ✅ Shake Screen
- ✅ Tint Screen
- ✅ Pan/Zoom Screen

### **Audio**
- ✅ Play Music
- ✅ Play Sound Effect
- ⚠️ Play Movie (may be unpredictable)

### **Variables**
- ✅ Set Variable

### **Other**
- ⚠️ Wait (may cause timing issues)

## ❌ **Commands That Cannot Stack**

These commands block execution and **cannot** be stacked:

- ❌ Dialogue (must wait for player)
- ❌ Choice (must wait for player selection)
- ❌ Text Input (must wait for player input)
- ❌ Jump (immediately changes scene)
- ❌ Jump to Label (immediately changes position)
- ❌ Show Screen (displays UI menu)
- ❌ Branch Start/End (controls flow structure)

**Why?** These commands need to wait for player input or control the story flow. Stacking them would create confusing or broken behavior.

## 🎭 **Example Scenarios**

### **Scenario 1: Dramatic Character Entrance**

**Goal**: Hero bursts onto screen with flash and music

**Commands to Stack:**
```
┌──────────────────┬──────────────────┬──────────────────┐
│ Play Music       │ Show Character   │ Flash Screen     │
│ Battle Theme     │ Hero (Center)    │ White, 0.2s      │
│ Loop: true       │ Fade, 0.5s       │                  │
└──────────────────┴──────────────────┴──────────────────┘
```

**Result**: Music, character, and flash all happen simultaneously for maximum impact!

### **Scenario 2: Environmental Setup**

**Goal**: Create a forest atmosphere with ambient sounds

**Commands to Stack:**
```
┌──────────────────┬──────────────────┬──────────────────┐
│ Set Background   │ Play SFX         │ Tint Screen      │
│ Forest           │ Birds Chirping   │ Green, 1s        │
│ Fade, 1s         │                  │ (75% opacity)    │
└──────────────────┴──────────────────┴──────────────────┘
```

**Result**: Instant atmosphere with layered audio-visual effects!

### **Scenario 3: Multi-Character Reveal**

**Goal**: Show multiple characters entering from different sides

**Commands to Stack:**
```
┌──────────────────┬──────────────────┬──────────────────┐
│ Show Character   │ Show Character   │ Shake Screen     │
│ Hero (Left)      │ Villain (Right)  │ Intensity: 3     │
│ Slide, 0.8s      │ Slide, 0.8s      │ Duration: 0.5s   │
└──────────────────┴──────────────────┴──────────────────┘
```

**Result**: Both characters appear at once with screen shake for emphasis!

## 🔧 **How to Unstack Commands**

### **Method 1: Remove Button**

1. **Hover** over stacked command
2. **Click X button** that appears
3. Command is removed from stack

### **Method 2: Drag Out**

1. **Drag** command out of stack
2. **Drop** it above or below stack
3. Command becomes independent

## ⚠️ **Warnings & Best Practices**

### **Timing Conflicts**

When stacking commands with different durations:
- Commands start together
- They finish at different times
- Use similar durations for synchronized effects

**Example:**
```
✅ Good: Flash (0.3s) + Shake (0.3s) = Synchronized
⚠️ Okay: Music (instant) + Show Character (1s) = Character fades while music plays
❌ Confusing: Wait (5s) + Dialogue = Dialogue appears, then 5s pause
```

### **Audio Layering**

Stacking multiple audio commands:
- Music tracks will overlap
- Sound effects will play simultaneously
- May create audio clutter

**Tip:** Use one music command per stack, multiple SFX are fine.

### **Visual Overload**

Too many visual effects at once can overwhelm:
- ✅ 2-3 stacked commands = Clear and impactful
- ⚠️ 4-5 stacked commands = Busy but manageable
- ❌ 6+ stacked commands = Chaotic and confusing

### **Unpredictable Commands**

Commands marked with ⚠️ may behave unexpectedly:

**Play Movie** - Video timing varies by format/size
- May finish at different times
- Use with caution in stacks

**Wait** - Can cause awkward pauses
- Dialogue appears then waits
- Better used alone

## 💡 **Pro Tips**

### **Tip 1: Start Simple**
Begin with 2-3 commands per stack, add more as you get comfortable.

### **Tip 2: Use Complementary Effects**
Stack commands that enhance each other:
- Visual + Audio (flash + sound effect)
- Character + Background (show character + set background)
- Multiple Characters (show hero + show companion)

### **Tip 3: Test Early**
Use the Play button to preview stacked commands immediately.

### **Tip 4: Create Templates**
Once you find good combinations, note them down for reuse:
- "Dramatic Entrance" = Music + Character + Flash
- "Scene Transition" = Background + Tint + Characters
- "Battle Start" = Music + Shake + Multiple Characters

### **Tip 5: Consider Player Experience**
Too much happening at once can confuse players. Balance impact with clarity.

## 🎓 **Tutorial: Your First Stacked Command**

Let's create a simple dramatic entrance!

**Step 1**: Add three commands:
1. Click **"+ Add Command"**
2. Select **"Play Music"** → Choose "Battle Theme"
3. Click **"+ Add Command"**  
4. Select **"Show Character"** → Choose "Hero", Position "Center"
5. Click **"+ Add Command"**
6. Select **"Flash Screen"** → Color "White", Duration 0.3s

**Step 2**: Stack them together:
1. **Drag** "Show Character" command
2. **Drop** it onto "Play Music" (middle of command)
3. **Drag** "Flash Screen" command
4. **Drop** it onto the now-stacked group

**Step 3**: Test it!
1. Click **Play button** (▶)
2. Watch all three effects happen at once!
3. Adjust timing as needed

**Congratulations!** You've created your first stacked command! 🎉

## 🔮 **Coming Soon**

Features planned for future updates:

- **Command Templates**: Pre-made stacked combinations
- **Timeline View**: Visual representation of parallel execution
- **Smart Stacking**: Auto-suggest compatible commands
- **Multi-Select**: Select and stack multiple commands at once
- **Copy/Paste Stacks**: Reuse successful combinations
- **Stack Presets**: Save your favorite combinations

## ❓ **FAQ**

**Q: Can I stack more than 3 commands?**  
A: Yes! You can stack up to 10 commands, but 2-4 is recommended for clarity.

**Q: What happens if I stack incompatible commands?**  
A: The editor will show a red indicator and explain why they can't be stacked.

**Q: Can I stack dialogue commands?**  
A: No, dialogue must wait for player interaction and cannot run in parallel.

**Q: Will stacking affect game performance?**  
A: No, stacked commands are optimized and have minimal performance impact.

**Q: Can I export/import stacked commands?**  
A: Yes! Stacked commands are fully preserved when exporting projects.

**Q: What if I change my mind?**  
A: Simply click the X button on any stacked command to unstack it.

---

**Happy Stacking!** Create more dynamic, cinematic visual novel experiences! 🎬✨
