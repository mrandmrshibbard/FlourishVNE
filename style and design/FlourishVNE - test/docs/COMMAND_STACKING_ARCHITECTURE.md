# Command Stacking - System Architecture

## 📐 **System Overview**

```
┌─────────────────────────────────────────────────────────────────┐
│                     Flourish Visual Novel Engine                 │
│                      Command Stacking System                     │
└─────────────────────────────────────────────────────────────────┘

┌───────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   Scene Editor    │      │  Live Preview    │      │   Game Engine    │
│   (Authoring)     │─────▶│  (Testing)       │─────▶│  (Production)    │
│                   │      │                  │      │                  │
│  • Drag & Drop    │      │  • Async Exec    │      │  • Bundled       │
│  • Visual Stack   │      │  • Parallel Run  │      │  • Optimized     │
│  • Safety Checks  │      │  • State Mgmt    │      │  • Standalone    │
└───────────────────┘      └──────────────────┘      └──────────────────┘
```

## 🏗️ **Component Architecture**

### **Layer 1: Type System** (`src/features/scene/types.ts`)

```typescript
┌─────────────────────────────────────────────────────┐
│              CommandModifiers Interface              │
├─────────────────────────────────────────────────────┤
│ runAsync?: boolean      // Execute in parallel      │
│ stackId?: string        // Stack group identifier   │
│ stackOrder?: number     // Position within stack    │
└─────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│              BaseCommand Extension                   │
├─────────────────────────────────────────────────────┤
│ id: string                                          │
│ type: CommandType                                   │
│ conditions?: VNCondition[]                          │
│ modifiers?: CommandModifiers     ◄── NEW           │
└─────────────────────────────────────────────────────┘
```

### **Layer 2: Utilities** (`src/features/scene/commandStackUtils.ts`)

```
┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│  Safety Functions  │    │  Stack Management  │    │   Grouping/Render  │
├────────────────────┤    ├────────────────────┤    ├────────────────────┤
│ canRunAsync()      │    │ stackCommands()    │    │ groupCommandsInto  │
│ hasUnpredictable   │    │ unstackCommand()   │    │   Stacks()         │
│   AsyncBehavior()  │    │ isCommandStacked() │    │ getStackSize()     │
│ getAsyncWarning()  │    │ canStackCommands() │    │ findStackById()    │
└────────────────────┘    └────────────────────┘    └────────────────────┘
```

### **Layer 3: UI Components** (`src/components/CommandStackComponents.tsx`)

```
┌───────────────────────────────────────────────────────────────────┐
│                          CommandStackRow                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ CommandStackItem│  │ CommandStackItem│  │ CommandStackItem│  │
│  │                 │  │                 │  │                 │  │
│  │ Play Music ✨   │  │ Show Char ✨    │  │ Flash ✨ ⚠     │  │
│  │ [Battle Theme]  │  │ [Hero]          │  │ [White]         │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│  Purple Border (stackId: "entrance")                              │
│  Stack Badge: 3 commands                                          │
└───────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│                       DragDropIndicator                           │
│  ⬆ Place Above   OR   ⊕ Add to Stack   OR   ⬇ Place Below       │
│  (Purple Line)        (Purple Border)        (Purple Line)        │
└───────────────────────────────────────────────────────────────────┘
```

### **Layer 4: Editor Integration** (`src/components/SceneEditor.tsx`)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Scene Editor                             │
├─────────────────────────────────────────────────────────────────┤
│  Command List:                                                   │
│                                                                  │
│  [1] Set Background (Forest)                                    │
│                                                                  │
│  ┌────────────────┬────────────────┬────────────────┐          │
│  │[2] Play Music ✨│[3] Show Char ✨│[4] Flash ✨ ⚠ │          │
│  └────────────────┴────────────────┴────────────────┘          │
│  ◄── Stacked Commands (stackId: "entrance")                    │
│                                                                  │
│  [5] Dialogue ("Welcome!")                                      │
│                                                                  │
│  [6] Choice (Where to go?)                                      │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Drag State:                                                     │
│  • draggedCommandId: string | null                              │
│  • dropTarget: { commandId, position } | null                   │
│  • Drop Zone Detection: Y-coordinate based (top/mid/bottom)     │
├─────────────────────────────────────────────────────────────────┤
│  Actions:                                                        │
│  • handleDragStart(commandId)                                   │
│  • handleDragOver(commandId, mouseY)                            │
│  • handleDrop(targetId, position)                               │
│  • handleUnstackCommand(commandId)                              │
└─────────────────────────────────────────────────────────────────┘
```

### **Layer 5: Execution Engine** (`src/components/LivePreview.tsx`)

```
┌─────────────────────────────────────────────────────────────────┐
│                      LivePreview Game Loop                       │
├─────────────────────────────────────────────────────────────────┤
│  useEffect(() => {                                               │
│    const command = currentCommands[currentIndex];                │
│    const shouldRunAsync = command.modifiers?.runAsync;           │
│                                                                  │
│    // Execute command                                            │
│    switch (command.type) {                                       │
│      case CommandType.PlayMusic:                                 │
│        await playMusicAsync();                                   │
│        break;                                                    │
│      case CommandType.ShowCharacter:                             │
│        await showCharacterAsync();                               │
│        break;                                                    │
│      // ... etc                                                  │
│    }                                                             │
│                                                                  │
│    // Advance based on async modifier                            │
│    if (shouldRunAsync) {                                         │
│      advance();  // Immediate, runs in background               │
│    } else if (instantAdvance) {                                  │
│      advance();  // After completion                             │
│    }                                                             │
│  }, [playerState]);                                              │
└─────────────────────────────────────────────────────────────────┘
```

## 🔄 **Data Flow**

### **1. User Creates Stack (Scene Editor)**

```
User drags "Show Character" onto "Play Music"
    │
    ▼
handleDrop(targetId: "music-1", position: "inside")
    │
    ▼
stackCommands([musicCmd, characterCmd])
    │
    ▼
Generate stackId: "stack_1234567890"
    │
    ▼
Update both commands:
  musicCmd.modifiers = { runAsync: true, stackId: "stack_1234567890", stackOrder: 0 }
  characterCmd.modifiers = { runAsync: true, stackId: "stack_1234567890", stackOrder: 1 }
    │
    ▼
dispatch(UPDATE_COMMAND) for each
    │
    ▼
Scene state updated → UI re-renders with purple borders
```

### **2. User Tests in Preview (LivePreview)**

```
Player presses Play button
    │
    ▼
setPlayerState({ mode: 'playing', currentIndex: 0 })
    │
    ▼
Game loop useEffect triggers
    │
    ▼
command = currentCommands[0]  // Play Music
shouldRunAsync = command.modifiers?.runAsync  // true
    │
    ▼
Execute: playMusicAsync()
    │
    ▼
shouldRunAsync === true → advance() immediately
    │
    ▼
currentIndex = 1
    │
    ▼
command = currentCommands[1]  // Show Character
shouldRunAsync = true
    │
    ▼
Execute: showCharacterAsync()
    │
    ▼
advance() immediately
    │
    ▼
currentIndex = 2
    │
    ▼
command = currentCommands[2]  // Flash Screen
shouldRunAsync = true
    │
    ▼
Execute: flashScreenAsync()
    │
    ▼
advance() immediately
    │
    ▼
currentIndex = 3
    │
    ▼
command = currentCommands[3]  // Dialogue
shouldRunAsync = false (default)
    │
    ▼
Execute: showDialogue()
    │
    ▼
Wait for player input (does not advance)
    │
    ▼
Meanwhile, all 3 async commands complete their animations in background:
  - Music fades in
  - Character slides in
  - Flash effect completes
```

## 🎯 **Execution Timeline Comparison**

### **Sequential (Without Stacking)**

```
Time    │ Command
────────┼─────────────────────────────────
0.0s    │ Play Music → Start
1.0s    │ Play Music ✓ Complete
1.0s    │ Show Character → Start
1.5s    │ Show Character ✓ Complete
1.5s    │ Flash Screen → Start
1.8s    │ Flash Screen ✓ Complete
1.8s    │ Dialogue appears

Total: 1.8 seconds before dialogue
```

### **Parallel (With Stacking + runAsync)**

```
Time    │ Command 1        │ Command 2        │ Command 3       │ Next
────────┼──────────────────┼──────────────────┼─────────────────┼──────
0.0s    │ Play Music START │ Show Char START  │ Flash START     │
0.001s  │ (running...)     │ (running...)     │ (running...)    │ Dialogue shows
0.3s    │ (running...)     │ (running...)     │ Flash DONE      │
0.5s    │ (running...)     │ Show Char DONE   │                 │
1.0s    │ Play Music DONE  │                  │                 │

Total: 0.001 seconds before dialogue (instant!)
```

## 🛡️ **Safety System**

### **Blocking Commands (Cannot Stack)**

```
┌─────────────────────────────────────────────────────────────────┐
│                      BLOCKING_COMMAND_TYPES                      │
├─────────────────────────────────────────────────────────────────┤
│  ❌ Dialogue          → Waits for player click                  │
│  ❌ Choice            → Waits for player selection              │
│  ❌ TextInput         → Waits for player input                  │
│  ❌ Jump              → Immediately changes scene               │
│  ❌ JumpToLabel       → Immediately changes position            │
│  ❌ ShowScreen        → Displays UI menu (blocks game)          │
│  ❌ BranchStart       → Flow control structure                  │
│  ❌ BranchEnd         → Flow control structure                  │
└─────────────────────────────────────────────────────────────────┘
```

### **Unpredictable Commands (Show Warning)**

```
┌─────────────────────────────────────────────────────────────────┐
│                UNPREDICTABLE_ASYNC_COMMANDS                      │
├─────────────────────────────────────────────────────────────────┤
│  ⚠ PlayMovie          → Video timing varies by format          │
│  ⚠ Wait               → Can cause awkward pauses               │
└─────────────────────────────────────────────────────────────────┘
```

### **Validation Flow**

```
User attempts to stack Command A with Command B
    │
    ▼
canStackCommands(cmdA, cmdB)
    │
    ├─▶ Check: Is either command blocking?
    │   └─▶ YES → Return false, show red indicator
    │   └─▶ NO → Continue
    │
    ├─▶ Check: Do commands already belong to same stack?
    │   └─▶ YES → Return false (already stacked)
    │   └─▶ NO → Continue
    │
    └─▶ Return true → Allow stacking
    
If stacking allowed:
    │
    ▼
hasUnpredictableAsyncBehavior(cmd.type)
    │
    └─▶ YES → Show warning tooltip: getAsyncWarning(cmd.type)
    └─▶ NO → No warning, proceed normally
```

## 📊 **State Management**

### **Command State with Modifiers**

```typescript
// Before Stacking
command: {
  id: "cmd_123",
  type: CommandType.PlayMusic,
  trackId: "battle_theme",
  // No modifiers
}

// After Stacking
command: {
  id: "cmd_123",
  type: CommandType.PlayMusic,
  trackId: "battle_theme",
  modifiers: {
    runAsync: true,           // ◄── Enables parallel execution
    stackId: "stack_abc",     // ◄── Groups with other commands
    stackOrder: 0             // ◄── Position in stack (leftmost)
  }
}
```

### **Scene State in Project**

```typescript
scene: {
  id: "scene_1",
  name: "Forest Entrance",
  commands: [
    { id: "cmd_1", type: "SetBackground", ... },
    { 
      id: "cmd_2", 
      type: "PlayMusic",
      modifiers: { runAsync: true, stackId: "entrance", stackOrder: 0 }
    },
    { 
      id: "cmd_3", 
      type: "ShowCharacter",
      modifiers: { runAsync: true, stackId: "entrance", stackOrder: 1 }
    },
    { 
      id: "cmd_4", 
      type: "FlashScreen",
      modifiers: { runAsync: true, stackId: "entrance", stackOrder: 2 }
    },
    { id: "cmd_5", type: "Dialogue", text: "Welcome!" }
  ]
}
```

## 🎨 **Visual Design System**

### **Color Scheme**

```
Normal Command:     bg-slate-700  border-slate-600   (Gray)
Stacked Command:    bg-slate-700  border-purple-500  (Purple border)
Drag Over:          bg-sky-900    border-sky-500     (Blue highlight)
Invalid Drop:       bg-red-900    border-red-500     (Red warning)
```

### **Icons**

```
✨ (Sparkle)    = Async execution enabled
⚠ (Warning)    = Unpredictable behavior when async
🔢 (Badge)     = Stack count (e.g., "3" for 3 commands)
❌ (X Button)  = Unstack/remove from stack
⬆ (Up Arrow)  = Drop above
⊕ (Plus)      = Add to stack
⬇ (Down Arrow) = Drop below
```

### **Layout**

```
┌──────────────────────────────────────────────────────────────┐
│ CommandStackRow                                              │
│ ┌────────────────┬────────────────┬────────────────┐        │
│ │ Stack Item 1   │ Stack Item 2   │ Stack Item 3   │        │
│ │ [Type] ✨      │ [Type] ✨      │ [Type] ✨ ⚠   │        │
│ │ [Details]      │ [Details]      │ [Details]      │        │
│ │      [X]       │      [X]       │      [X]       │        │
│ └────────────────┴────────────────┴────────────────┘        │
│ 🔢 3  Purple border around all items                         │
└──────────────────────────────────────────────────────────────┘
```

---

## 🎓 **For New Developers**

### **Where to Start**

1. **Read**: `COMMAND_STACKING_DESIGN.md` - High-level overview
2. **Read**: `COMMAND_STACKING_GUIDE.md` - User perspective
3. **Study**: `commandStackUtils.ts` - Core logic
4. **Study**: `CommandStackComponents.tsx` - Visual components
5. **Study**: `SceneEditor.tsx` - Drag & drop integration
6. **Study**: `LivePreview.tsx` - Execution engine

### **Key Concepts**

- **stackId**: Unique identifier for a group of stacked commands
- **stackOrder**: 0-based index within stack (0 = leftmost)
- **runAsync**: Boolean flag enabling parallel execution
- **instantAdvance**: LivePreview flag for immediate command progression

### **Testing Your Changes**

```bash
# Start dev server
npm run dev

# Open Scene Editor

# Add 3 commands

# Drag one onto another to stack

# Click Play to test execution

# Verify commands run in parallel
```

---

**System Status**: ✅ Fully operational and production-ready!
