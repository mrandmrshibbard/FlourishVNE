# FlourishVNE — Deep Audit Report

---

## 1. High-Level Architecture

The app has **6 main tabs** (Scenes, Characters, UI/Screens, Assets, Variables, Settings) plus a **Tools dropdown** (Localization, Script Editor, Common Events, Plugins, Help). There's a **Project Hub** landing page, **Live Preview** panel, and a **Properties Inspector** sidebar. Multi-window pop-out is supported for all tabs.

---

## 2. Redundant Features & Code Duplication

### 2A. Conditions Editor — Duplicated 3 Times

Identical conditions-editing logic (variable-based if/then with operators) exists in:

- `PropertiesInspector.tsx` — scene command conditions  
- `UIElementInspector.tsx` — UI element visibility  
- `HotZoneEditor.tsx` — hot spot conditions  

All three implement the same `getOperatorsForType()`, `handleAddCondition()`, `handleUpdateCondition()`, `handleRemoveCondition()` logic. **Should be a single shared component.**

---

### 2B. CharacterEditor vs CharacterInspector — Near-Duplicate

| Feature                  | CharacterEditor      | CharacterInspector   |
|--------------------------|:--------------------:|:--------------------:|
| Name editing             | ✅ Yes               | ✅ Yes               |
| Dialogue color           | ✅ Yes               | ✅ Yes               |
| Font management          | ✅ Yes *(Style tab)* | ✅ Yes *(Font section)* |
| Expression list + config | ✅ Yes *(full tab)*  | ✅ Yes *(compact)*   |
| Base image upload        | ✅ Yes               | ✅ Yes               |
| Layer editing            | ✅ Yes *(dedicated tab)* | ❌ No            |
| Live preview             | ✅ Yes *(left pane)* | ❌ No                |

CharacterInspector is a slimmed-down duplicate of CharacterEditor minus layers and preview. The font management, expression editing, and base image upload use **separate implementations** of the same logic.

---

### 2C. Renderer Components — Duplicated in LivePreview.tsx

Renderer components (`TextOverlayElement`, `ImageOverlayElement`, `ButtonOverlayElement`) are defined as extracted modules in `live-preview/renderers/` but are **also redefined locally** inside `LivePreview.tsx`. The imports are commented out with TODOs. Two copies are being maintained.

---

### 2D. Feature Directories with Duplicate/Empty Files

- `scene-editor/state/sceneReducer.ts` **duplicates** `scene/state/sceneReducer.ts`  
- `ui-editor/state/uiReducer.ts` **duplicates** `ui/state/uiReducer.ts`  
- `character-editor/types.ts`, `scene-editor/types.ts`, `ui-editor/types.ts` are **all empty files**

---

### 2E. AssetManager vs ResourceManager Overlap

- **AssetManager** — full-featured asset library with folders, search, sorting, bulk operations, multi-select, drag-drop upload, usage detection  
- **ResourceManager** — unified resource browser covering *scenes, characters, variables, UI screens, AND assets* in one panel, with simpler asset management  

Both provide independent asset upload/rename/delete/management UIs. ResourceManager is a lighter "everything in one place" alternative.

---

### 2F. Rename Logic — Reimplemented Everywhere

The `double-click → inline input → Enter/Escape` rename pattern is independently implemented in:  
SceneManager, CharacterManager, SceneEditor (groups), CharacterEditor, VariableManager, CommonEventsManager, AssetManager, UIManager.  

**No shared component exists.**

---

### 2G. Font Editor — Duplicated

Font family dropdown + custom font upload + size/weight/italic controls are separately implemented in:  
CharacterEditor, CharacterInspector, InGameUIEditor *(multiple times per element type)*, and UIElementInspector.

---

### 2H. Context Panel System — Dead Code

`ContextPanelManager.tsx` and `ContextualToolbar.tsx` (~700 lines combined) are **virtually unused** — only 4 import references found, not integrated into any active workflow.

---

## 3. Features & Workflows That Could Be Simplified

### 3A. PropertiesInspector — 2,700-Line God Object

This single component handles **4 distinct editing contexts** via a large if/else chain:

1. Scene configuration (exit transitions, conditions, fallback scenes)  
2. Variable editing (type, scope, default value)  
3. Command properties (12+ command type editors)  
4. Empty state  

> **Simplification:** Split into `CommandPropertiesEditor`, `VariablePropertiesEditor`, `SceneConfigEditor` with a thin routing component.

***User Calrification**
    - There should be properties inspectors for the UI screens and in-game UI
    - Ensure these are not forgotten or left behind and are cared for properly to retain their function

---

### 3B. LivePreview.tsx — 8,300-Line Monolith

The main runtime orchestrator. While command handlers and some renderers have been extracted to subdirectories, the core component still contains locally-redefined renderer duplicates and the entire game execution loop.

***User Clarification**
    - Leave this alone for now so we don't break the engine

---

### 3C. Six Main Tabs + Hidden Tools = Cognitive Overload

- **6 tabs** always visible — Scenes, Characters, UI/Screens, Assets, Variables, Settings  
- **5 additional tools** hidden in a dropdown — Localization, Script Editor, Common Events, Plugin Manager, Help  
- Beginner confusion: *what goes where?* Why are Common Events hidden but Variables have a tab?  

> **Simplification options:**
> - Group secondary tabs: Assets + Variables + Settings could become a "Project" super-tab with sub-tabs  
> - Promote Common Events to a visible tab (or nest it under Scenes)  
> - Show only core tabs (Scenes, Characters, UI) by default; unlock the rest progressively 

***User Clarifications**
    - Grouping and Common Events promotion sounds good
    - Don't lock tabs or features behind progression

---

### 3D. Two Script Editors with Confusing Names

- **ScriptEditor** — TypeScript/JavaScript code editor for custom game logic (triggers, validation, test execution)  
- **ScriptingEditor** — JSON inspector/editor for raw project data (tree view + raw JSON)  

Both live under "Tools" → unclear which to use. Naming doesn't distinguish purpose. *"Script Editor"* vs *"Scripting Editor"* is a 3-letter suffix difference.

> **Simplification:** Rename ScriptingEditor to "Project Data Inspector" or "JSON Inspector" and make it a developer/debug tool rather than a user-facing feature.

---

### 3E. Template System vs Content Wizard System

Two parallel content-generation systems:

- **Templates** — Gallery → Preview → Configurator → Generator pipeline *(4 service files)*  
- **Content Wizards** — Step-by-step wizard modal with conditional forms *(separate service)*  

Both scaffold content into the project. Different lifecycle phases (templates for initial setup, wizards for in-project creation) but the distinction isn't obvious to users.

> **Simplification:** Unify under a single "Create Content" flow that intelligently chooses wizard-style vs template-style based on complexity.

---

### 3F. UI/Screens Tab Has Three Distinct Modes

The UI/Screens tab switches between:

1. **MenuEditor** — visual canvas for UI screen elements (drag-drop buttons, text, images)  
2. **InGameUIEditor** — styling for in-game dialogue boxes, choice buttons, quick menu, etc.  
3. **HotZoneEditor** — interactive game zone editor with hot spots  

These are fundamentally different editors sharing one tab. A beginner might not understand the "UI Screens" vs "In-Game UI" toggle, or know that "Hot Zone" screens are a separate screen type.

---

### 3G. Settings Manager Has 6 Sections

General, Fonts, Screens, Accessibility, Analytics, CG Gallery — some quite technical. A beginner creating their first visual novel probably doesn't need CG Gallery or Analytics settings upfront.

> **Simplification:** Progressive disclosure — show General + Fonts by default, collapse the rest under "Advanced Settings."

---

### 3H. Command Palette Has 39 Commands Across 9 Categories

All 39 commands are visible at once in the palette. For a beginner, many commands (`SpawnParticles`, `PanZoomScreen`, `ShowImageMap`, `CreditRoll`, `RunScript`) are advanced and intimidating.

> **Simplification:**
> - Default view: show "Essential" commands — Dialogue, Choice, SetBackground, ShowCharacter, HideCharacter, PlayMusic, Jump, Wait  
> - Expandable "Advanced" section for the rest  
> - Or implement the existing `ProgressiveDisclosure` feature from `features/ui/ProgressiveDisclosure.ts` which already defines proficiency levels (beginner → expert) but **appears unused in the UI**

---

### 3I. Variable System: Basic vs Enhanced

Two separate systems exist:

- `features/variables/` — basic `VNVariable` (type, scope, default value)  
- `features/enhanced-variables/` — `EnhancedVariable` with relationships, dependency graphs, performance tracking, debugging breakpoints, validation rules  

The enhanced system appears to be a power-user layer, but the types file for enhanced variables is **350+ lines** combining 8 different concerns (type system, validation, performance, history, display, relationships). It's unclear if the enhanced features are actually surfaced in the UI or are purely backend infrastructure.

> **Simplification:** If enhanced features aren't user-visible, they're dead weight. If they are, they should be opt-in behind an advanced toggle.

---

## 4. Beginner-Friendliness Improvements

### 4A. Progressive Disclosure Already Designed But Not Wired Up

`ProgressiveDisclosure.ts` defines proficiency levels and feature gating but **is not connected to any UI**. Wiring this up would solve multiple beginner UX problems at once.

---

### 4B. Tools Dropdown is Hard to Discover

Critical features (Localization, Script Editor, Common Events) are buried behind a small "Tools" sparkle button. No visual cue that important tools live here. First-time users will miss this entirely.

---

### 4C. Pop-Out Buttons Only Visible on Hover

Multi-window pop-out (⧉) buttons appear only on tab hover — invisible to beginners. This feature is power-user territory and shouldn't distract beginners, but currently it's both hidden AND confusing when accidentally discovered.

---

### 4D. No Auto-Save Indicator

Auto-save occurs every 2 minutes to IndexedDB, but there's no visual indicator of save status. Users might be anxious about losing work or confused about whether they need to manually save. The dirty-tracking flag exists but its representation is unclear.

---

### 4E. Guided Tour Covers UI Locations But Not Workflows

The 7-step GuidedTour tells users *where* things are, but not *how* to do basic tasks (create a character, write dialogue, test a scene). The HelpPanel has a "Getting Started" section but it's separate from the tour.

---

## 5. Grouping & Consolidation Opportunities

| What to Consolidate              | Current State                            | Proposed                                                        |
|----------------------------------|------------------------------------------|-----------------------------------------------------------------|
| **Conditions Editor**            | 3 separate implementations              | 1 shared `<ConditionsEditor>` component                         |
| **Font Editor**                  | 4+ separate implementations             | 1 shared `<FontEditor>` component                               |
| **Rename Logic**                 | 8+ separate implementations             | 1 shared `<InlineRename>` component or hook                     |
| **CharacterEditor + Inspector**  | 2 near-duplicates                        | Keep Editor as primary; Inspector calls shared sub-components    |
| **AssetManager + ResourceManager** | 2 overlapping asset UIs                | Merge ResourceManager assets into AssetManager, or remove it    |
| **scene/ + scene-editor/ dirs**  | Duplicate reducers + empty types         | Merge into single directory                                     |
| **ui/ + ui-editor/ dirs**        | Duplicate reducers + empty types         | Merge into single directory                                     |
| **character/ + character-editor/** | Empty editor types                     | Merge into single directory                                     |
| **Renderer duplicates**          | LivePreview.tsx + live-preview/renderers/ | Remove local redefinitions, use extracted modules               |
| **Context Panels**               | Defined but unused                       | Either integrate or remove                                      |
| **ProgressiveDisclosure**        | Defined but unwired                      | Connect to UI to gate advanced features for beginners           |

---

## 6. Summary Scorecard

| Area                        | Score  | Key Issue                                                          |
|-----------------------------|:------:|--------------------------------------------------------------------|
| **Feature Completeness**    | 9/10   | Extremely comprehensive — rivals Ren'Py / TyranoBuilder            |
| **Code DRY-ness**           | 4/10   | Major duplication (conditions, fonts, rename, renderers)           |
| **Beginner Friendliness**   | 5/10   | Too many features visible at once; progressive disclosure unused   |
| **Navigation Clarity**      | 5/10   | Tools menu hidden; confusing editor names; 3 UI editing modes      |
| **Component Architecture**  | 5/10   | Two 2,700+ and 8,300+ line monoliths; dead code                   |
| **Feature Directory Structure** | 4/10 | Duplicate reducers, empty type files, unclear `-editor` pattern  |
| **State Management**        | 6/10   | Clean action unions but anti-pattern sequential reducer            |

---

> **Overall:** The engine is feature-rich and production-capable, but shows clear signs of organic growth. The primary improvements would come from consolidating duplicated components, wiring up the existing progressive disclosure system, simplifying navigation, and breaking up the two monolithic components.