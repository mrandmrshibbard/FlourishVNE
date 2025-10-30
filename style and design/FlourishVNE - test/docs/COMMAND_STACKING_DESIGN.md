# Command Stacking & Parallel Execution - Feature Design

## 🎯 **Overview**

This feature allows commands to execute in parallel (simultaneously) rather than sequentially. Commands can be visually "stacked" on the same line in the Scene Editor, making it easy to see which commands run together.

## 🔧 **Technical Implementation**

### **1. Command Modifiers System**

Added optional `modifiers` property to all commands:

```typescript
interface CommandModifiers {
    runAsync?: boolean;    // Don't wait for completion
    stackId?: string;      // Visual grouping identifier
    stackOrder?: number;   // Order within stack
}
```

### **2. Safety System**

**Blocking Commands** (Cannot run async):
- Dialogue
- Choice
- TextInput
- BranchStart/BranchEnd
- Jump/JumpToLabel
- ShowScreen

**Unpredictable Commands** (Can run async but may have issues):
- PlayMovie
- Wait

These restrictions ensure the app remains user-friendly and prevents confusing behavior.

### **3. Visual Stacking**

Commands with the same `stackId` are displayed side-by-side:

```
┌─────────────────┬─────────────────┬─────────────────┐
│ Play Music      │ Show Character  │ Tint Screen     │
│ ♪ Battle Theme  │ Show: Hero      │ Tint           │
└─────────────────┴─────────────────┴─────────────────┘
```

## 🎨 **User Interface**

### **Command Stack Item**
- **Purple border**: Indicates command is part of a stack
- **Sparkle icon (✨)**: Shows command runs asynchronously
- **Warning icon (⚠)**: Appears for unpredictable async commands
- **Stack count badge**: Shows total commands in stack
- **Remove button**: Unstack individual commands

### **Drag & Drop System**

**Drop Zones:**
1. **Before Command**: Drop above to place before
2. **Inside Stack**: Drop on stacked commands to add to group
3. **After Command**: Drop below to place after

**Visual Feedback:**
- **Purple line**: Valid drop location
- **Red line**: Invalid drop (e.g., trying to stack blocking commands)
- **Tooltip**: Explains why drop is invalid

### **Breadcrumb System**

When dragging a command, breadcrumbs appear showing:
- ⬆ **Place Above**
- ⊕ **Add to Stack** (only if compatible)
- ⬇ **Place Below**

## 📋 **Workflow Examples**

### **Example 1: Cinematic Entrance**

Stack these commands to create a dramatic character entrance:

```
Play Music (Battle Theme) + Show Character (Hero) + Flash Screen (White)
```

All three happen simultaneously for maximum impact!

### **Example 2: Environmental Ambiance**

Create rich atmosphere:

```
Set Background (Forest) + Play SFX (Birds) + Tint Screen (Green)
```

### **Example 3: Multi-Character Scene**

Show multiple characters at once:

```
Show Character (Hero, Left) + Show Character (Villain, Right) + Shake Screen
```

## ⚠️ **User-Friendly Warnings**

### **Blocking Command Warning**
> "This command cannot run asynchronously as it blocks execution by design."

Shown when trying to stack:
- Dialogue boxes
- Player choices
- Text input
- Scene jumps

### **Unpredictable Behavior Warning**
> "Running this command asynchronously may produce unpredictable results. Use with caution."

Shown for:
- Play Movie (timing may vary)
- Wait (duration may conflict)

## 🚀 **Implementation Status**

### **Phase 1: Type System** ✅
- [x] Command modifiers interface
- [x] Blocking command types list
- [x] Unpredictable command types list
- [x] Safety validation functions

### **Phase 2: Utility Functions** ✅
- [x] `canRunAsync()` - Check if command can be async
- [x] `hasUnpredictableAsyncBehavior()` - Check for warnings
- [x] `getAsyncWarning()` - Get warning message
- [x] `groupCommandsIntoStacks()` - Group by stackId
- [x] `stackCommands()` - Create stack from commands
- [x] `unstackCommand()` - Remove from stack
- [x] `generateStackId()` - Unique ID generator

### **Phase 3: UI Components** ✅
- [x] CommandStackItem - Individual command display
- [x] CommandStackRow - Horizontal stack container
- [x] DragDropIndicator - Visual drop feedback
- [x] Warning tooltips
- [x] Stack badges and indicators

### **Phase 4: Scene Editor Integration** ✅
- [x] Replace CommandItem with CommandStackItem
- [x] Implement drag & drop handlers
- [x] Add stack/unstack actions
- [x] Update command list rendering
- [x] Add breadcrumb drop zone system
- [x] Visual feedback for drop targets
- [x] Context menu for stacking operations

### **Phase 5: Execution Engine** ✅
- [x] Update LivePreview command processing
- [x] Implement async command execution
- [x] Add parallel command tracking
- [x] Handle command completion synchronization

### **Phase 6: Properties Inspector** ✅
- [x] Add "Run Async" checkbox
- [x] Show async warnings in inspector
- [x] Display stack membership
- [x] Add stack management controls

## 🎓 **User Documentation**

### **How to Stack Commands**

1. **Create Your Commands**: Add all commands you want to stack
2. **Select Multiple**: Click and drag to select multiple commands
3. **Stack Them**: Right-click → "Stack Commands" or drag one onto another
4. **Verify**: Stacked commands appear side-by-side with purple borders

### **How to Unstack Commands**

1. **Hover Over Command**: Purple border appears
2. **Click X Button**: Removes command from stack
3. **Alternative**: Select command → Right-click → "Unstack"

### **Best Practices**

✅ **Good Stacking:**
- Visual effects (flash, shake, tint) with actions
- Multiple character appearances
- Audio + visual combinations
- Non-blocking animations

❌ **Avoid Stacking:**
- Dialogue commands
- Player choice commands
- Scene transitions
- Blocking input commands

## 🔮 **Future Enhancements**

1. **Timeline View**: Visual timeline showing parallel execution
2. **Templates**: Pre-made stacked command templates
3. **Smart Stacking**: Auto-suggest compatible commands
4. **Preview Mode**: Test stacked commands in real-time
5. **Export Optimization**: Bundle stacked commands for performance

## 📊 **Technical Notes**

### **Performance Considerations**
- Maximum 10 commands per stack (recommended)
- Async commands use `Promise.all()` for parallel execution
- Visual transitions may overlap - use duration carefully

### **Compatibility**
- Fully backward compatible (modifiers are optional)
- Existing projects work without modification
- Opt-in feature with safe defaults

### **Storage**
- Modifiers stored in command JSON
- Minimal storage overhead (~50 bytes per stack)
- No performance impact when not used

---

**This feature transforms Flourish from sequential to parallel storytelling, enabling richer, more dynamic visual novel experiences while maintaining user-friendliness through smart warnings and intuitive UI!** 🎬✨
