# 🔧 Component Refactoring Plan

## Overview
This document outlines the strategy to break down large components (1000+ lines) into smaller, more maintainable modules without affecting functionality.

---

## 📊 Current State

### Large Components Identified:
1. **LivePreview.tsx** - 4,280 lines
2. **PropertiesInspector.tsx** - 1,286 lines  
3. **SceneEditor.tsx** - 1,090 lines
4. **UIElementInspector.tsx** - 1,221 lines

**Total: 7,877 lines** to refactor

---

## 🎯 Phase 1: LivePreview Refactoring

### Current Structure:
- Monolithic component with game engine, rendering, audio, save/load all in one file
- Multiple state managers and effect hooks
- Complex rendering logic mixed with business logic

### New Structure:

```
src/components/live-preview/
├── LivePreview.tsx (Main orchestrator - ~200 lines)
├── hooks/
│   ├── useGameEngine.ts (Game state & command processing - ~300 lines)
│   ├── useAudioManager.ts (Music & SFX - ~150 lines)
│   ├── useSaveLoadSystem.ts (Persistence - ~200 lines)
│   └── useUIScreenManager.ts (UI screen navigation - ~150 lines)
├── renderers/
│   ├── DialogueRenderer.tsx (Dialogue box - ~100 lines)
│   ├── ChoiceMenuRenderer.tsx (Choice menus - ~100 lines)
│   ├── CharacterRenderer.tsx (Character sprites - ~100 lines)
│   ├── UIElementRenderer.tsx (UI elements - ~300 lines)
│   └── ScreenEffectsRenderer.tsx (Tints, shakes, etc - ~100 lines)
├── systems/
│   ├── commandProcessor.ts (Command execution logic - ~400 lines)
│   ├── conditionEvaluator.ts (Condition checking - ~100 lines)
│   └── variableInterpolation.ts (Already exists, reuse)
└── types/
    └── gameState.ts (Shared types - ~100 lines)
```

**Benefits:**
- Each file < 400 lines
- Clear separation of concerns
- Easier testing
- Better code reusability

---

## 🎯 Phase 2: PropertiesInspector Refactoring

### New Structure:

```
src/components/properties-inspector/
├── PropertiesInspector.tsx (Router component - ~100 lines)
├── shared/
│   ├── PositionInputs.tsx (Position selector - ~80 lines)
│   ├── ConditionsEditor.tsx (Condition builder - ~150 lines)
│   ├── TransitionInputs.tsx (Transition controls - ~60 lines)
│   └── CommonProperties.tsx (ID, stack info - ~50 lines)
└── inspectors/
    ├── DialogueInspector.tsx (~80 lines)
    ├── CharacterInspector.tsx (~120 lines)
    ├── ChoiceInspector.tsx (~150 lines)
    ├── VariableInspector.tsx (~100 lines)
    ├── JumpInspector.tsx (~80 lines)
    ├── AudioInspector.tsx (~100 lines)
    ├── ScreenEffectsInspector.tsx (~120 lines)
    ├── TextOverlayInspector.tsx (~100 lines)
    ├── ButtonInspector.tsx (~120 lines)
    └── SceneConfigInspector.tsx (~100 lines)
```

**Benefits:**
- Each inspector is independent
- Shared components reduce duplication
- Easy to add new command types
- Can lazy-load inspectors

---

## 🎯 Phase 3: SceneEditor Refactoring

### New Structure:

```
src/components/scene-editor/
├── SceneEditor.tsx (Main container - ~150 lines)
├── components/
│   ├── CommandList.tsx (Command rendering - ~200 lines)
│   ├── CommandItem.tsx (Single command display - ~150 lines)
│   ├── DragDropManager.tsx (Drag & drop logic - ~200 lines)
│   ├── CommandContextMenu.tsx (Right-click menu - ~100 lines)
│   └── CommandToolbar.tsx (Add command buttons - ~100 lines)
└── hooks/
    ├── useCommandSelection.ts (~80 lines)
    ├── useCommandDragDrop.ts (~150 lines)
    └── useCommandOperations.ts (CRUD ops - ~100 lines)
```

**Benefits:**
- Drag & drop logic isolated
- Command operations testable
- Context menu reusable
- Better performance with memoization

---

## 🎯 Phase 4: UIElementInspector Refactoring

### New Structure:

```
src/components/ui-element-inspector/
├── UIElementInspector.tsx (Router - ~100 lines)
├── common/
│   ├── CommonProperties.tsx (Position, size, anchor - ~80 lines)
│   ├── TransitionProperties.tsx (Transitions - ~60 lines)
│   └── DeleteButton.tsx (Delete UI - ~30 lines)
└── element-inspectors/
    ├── ButtonInspector.tsx (~200 lines)
    ├── TextInspector.tsx (~80 lines)
    ├── ImageInspector.tsx (~120 lines)
    ├── CharacterPreviewInspector.tsx (~150 lines)
    ├── TextInputInspector.tsx (~100 lines)
    ├── DropdownInspector.tsx (~200 lines)
    ├── CheckboxInspector.tsx (~150 lines)
    ├── SliderInspector.tsx (~200 lines)
    ├── ToggleInspector.tsx (~200 lines)
    └── AssetCyclerInspector.tsx (~250 lines)
```

**Benefits:**
- Each element type is self-contained
- Common properties don't repeat
- Easier to add new UI elements
- Better code organization

---

## 📝 Implementation Steps

### Step 1: Create Directory Structure
```bash
mkdir -p src/components/live-preview/{hooks,renderers,systems,types}
mkdir -p src/components/properties-inspector/{shared,inspectors}
mkdir -p src/components/scene-editor/{components,hooks}
mkdir -p src/components/ui-element-inspector/{common,element-inspectors}
```

### Step 2: Extract Shared Types
- Move interfaces to dedicated type files
- Ensure imports don't break

### Step 3: Extract Utilities First
- Start with pure functions (conditionEvaluator, commandProcessor)
- These have no React dependencies

### Step 4: Extract Custom Hooks
- Move useState/useEffect logic into custom hooks
- Maintain same API

### Step 5: Extract Render Components
- Split JSX into smaller components
- Pass data via props

### Step 6: Update Main Component
- Import and compose new modules
- Verify functionality

### Step 7: Test Thoroughly
- Run dev server
- Test all workflows
- Check for regressions

---

## ⚠️ Migration Strategy

### Rules:
1. **One file at a time** - Don't refactor multiple components simultaneously
2. **Maintain exports** - Keep public APIs identical
3. **Test after each change** - Ensure app still works
4. **Git commits** - Commit after each successful extraction
5. **Documentation** - Add JSDoc to new modules

### Priority Order:
1. **LivePreview** (Most complex, biggest win)
2. **UIElementInspector** (Clear separation of concerns)
3. **PropertiesInspector** (Similar pattern to UIElementInspector)
4. **SceneEditor** (Depends on the others being stable)

---

## 🎨 Code Style Guidelines

### Custom Hooks:
```typescript
// Good: Clear, single responsibility
export const useGameEngine = (project: VNProject) => {
  const [gameState, setGameState] = useState<GameState>(initialState);
  // ... logic
  return { gameState, processCommand, reset };
};
```

### Renderer Components:
```typescript
// Good: Pure, focused component
export const DialogueRenderer: React.FC<DialogueProps> = ({ 
  dialogue, 
  font, 
  onAdvance 
}) => {
  // ... rendering logic
};
```

### Utility Modules:
```typescript
// Good: Pure functions, easy to test
export const evaluateConditions = (
  conditions: VNCondition[],
  variables: Record<string, any>
): boolean => {
  // ... logic
};
```

---

## 📈 Expected Outcomes

### Before:
- 4 files with 1000+ lines each
- Hard to navigate and understand
- Difficult to test individual features
- Merge conflicts common

### After:
- ~40 focused modules
- Each file < 300 lines
- Clear responsibility boundaries
- Easy to test and maintain
- Reduced merge conflicts
- Better performance (lazy loading potential)

---

## 🚀 Next Steps

Would you like me to:
1. **Start with LivePreview** - Begin extracting the game engine hooks?
2. **Create scaffolding** - Set up all directory structures first?
3. **Extract one specific module** - Like the audio manager or save system?
4. **Different approach** - Have another strategy in mind?

Let me know which approach you prefer and I'll begin the refactoring! 🎯
