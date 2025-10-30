# 🎯 LivePreview Refactoring - Phase 2 Status

## ✅ Completed Work

### Phase 1: Foundation & Simple Renderers ✓
**11 modules created, 834 lines extracted**

1. **Type Definitions** (`types/gameState.ts`) - 170 lines
2. **Transition Utilities** (`systems/transitionUtils.ts`) - 80 lines  
3. **Typewriter Hook** (`hooks/useTypewriter.ts`) - 32 lines
4. **Stage Size Hook** (`hooks/useStageSize.ts`) - 32 lines
5. **Text Overlay Renderer** (`renderers/TextOverlayRenderer.tsx`) - 100 lines
6. **Image Overlay Renderer** (`renderers/ImageOverlayRenderer.tsx`) - 110 lines
7. **Button Overlay Renderer** (`renderers/ButtonOverlayRenderer.tsx`) - 155 lines
8. **Dialogue Renderer** (`renderers/DialogueRenderer.tsx`) - 85 lines
9. **Choice Menu Renderer** (`renderers/ChoiceMenuRenderer.tsx`) - 70 lines
10-11. **Index files** for clean exports

### Phase 2: Condition Evaluator ✓
**1 module created, 46 lines extracted**

12. **Condition Evaluator** (`systems/conditionEvaluator.ts`) - 46 lines
    - Pure function for evaluating command conditions
    - Handles all operators: ==, !=, >, <, >=, <=, contains, startsWith, is true/false
    - Reusable across the codebase

---

## 📊 Current Statistics

**Original File:** 4,280 lines (LivePreview.tsx)  
**Extracted:** 880 lines (20.6%)  
**Modules Created:** 12  
**Average Module Size:** 73 lines  
**Largest Module:** 170 lines (types)  
**All Modules:** Under 300 lines ✅  
**TypeScript Errors:** 0 ✅

---

## 🎯 Next Phase: Command Processor

The command processor is the heart of the game engine (~1000 lines, lines 2400-3400+). It's a massive switch statement that needs to be broken into focused handlers.

### Proposed Structure:

```
src/components/live-preview/command-handlers/
├── dialogueHandler.ts        - Dialogue processing
├── characterHandler.ts       - Show/Hide characters with transitions
├── backgroundHandler.ts      - Background transitions
├── variableHandler.ts        - Variable operations (set, add, subtract, random)
├── audioHandler.ts          - Music & SFX management
├── controlFlowHandler.ts    - Jumps, choices, branches, labels
├── effectsHandler.ts        - Screen effects (shake, tint, pan/zoom, flash)
├── overlayHandler.ts        - Text/Image/Button overlays
├── index.ts                 - Main processor that routes commands to handlers
└── types.ts                 - Shared types for handlers
```

### Benefits:
- Each handler: ~100-150 lines
- Single responsibility
- Easy to test independently
- Easy to add new command types
- Clear separation of concerns

### Implementation Strategy:
1. Create command handler types/interfaces
2. Extract dialogue handler (simplest)
3. Extract character handler (complex transitions)
4. Extract background handler (similar to character)
5. Extract variable handler (straightforward)
6. Extract audio handler (music + SFX)
7. Extract control flow handler (jumps, choices, branches)
8. Extract effects handler (screen effects)
9. Extract overlay handler (show/hide text/images/buttons)
10. Create main processor that routes to handlers
11. Update LivePreview to use new processor

---

## 🔄 Testing Strategy

### After Each Extraction:
1. Run TypeScript compiler
2. Check for import errors
3. Verify no runtime errors
4. Test specific feature in game preview

### Final Integration:
1. Update LivePreview.tsx imports
2. Replace switch statement with handler calls
3. Run full game preview test
4. Test all command types
5. Verify save/load still works
6. Check transitions and effects

---

## 📝 Code Quality Guidelines

### Handler Pattern:
```typescript
// Good: Focused, single responsibility
export const handleDialogue = (
  command: DialogueCommand,
  context: CommandContext
): CommandResult => {
  // ... processing logic
  return { advance: false, updates: { ... } };
};
```

### Return Types:
```typescript
interface CommandResult {
  advance: boolean;          // Should auto-advance?
  updates?: Partial<PlayerState>;  // State updates
  delay?: number;           // Delay before next command
  callback?: () => void;    // Async callback
}
```

### Error Handling:
```typescript
// Always handle missing resources gracefully
const url = assetResolver(command.audioId, 'audio');
if (!url) {
  console.warn(`Audio not found: ${command.audioId}`);
  return { advance: true };  // Skip and continue
}
```

---

## 🚀 Ready to Continue

The foundation is solid! Next steps:

1. **Create command handler directory**
2. **Extract dialogue handler** (easiest, good starting point)
3. **Extract character handler** (most complex, good test)
4. **Continue with remaining handlers**
5. **Wire everything together**

**Estimated Completion:** 
- Phase 3 (Command Handlers): 1-2 hours
- Phase 4 (Integration): 30 minutes
- Total Refactoring: ~90% complete after Phase 3

---

## 💪 Progress So Far

✅ **Foundation Complete** - Types, utilities, hooks  
✅ **Renderers Complete** - UI components extracted  
✅ **Condition Logic Complete** - Evaluation system ready  
⏳ **Command Processing** - Next major milestone  
⏳ **Audio System** - Will extract with command handlers  
⏳ **Save/Load System** - Final piece  
⏳ **Main Component Refactor** - Final integration  

**We're 20% done with the refactoring and have built a solid foundation!** 🎉

The hardest part (command processing) is next, but with our modular approach, it'll be manageable.
