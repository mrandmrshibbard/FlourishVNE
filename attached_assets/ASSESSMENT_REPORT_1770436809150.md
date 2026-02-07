# FlourishVNE — Comprehensive Assessment & Strategic Action Plan

**Date:** February 6, 2026  
**Version Assessed:** 2.1.0  
**Assessor:** GitHub Copilot (Deep Code Audit)

---

## Executive Summary

FlourishVNE is a **remarkably ambitious and feature-rich** visual novel engine that already exceeds several commercial competitors in key areas — particularly its WYSIWYG UI editor, layered character sprite system, and in-editor live preview. The codebase totals ~20,000+ lines of TypeScript/React with 30 command types, 12 runtime handlers, 6 canvas-rendered screen effects, and a full Electron desktop export pipeline.

However, several **critical issues** threaten both user experience and commercial viability. The most severe is the **complete absence of auto-save or persistent storage** — a crash or accidental tab close destroys all work since the last manual ZIP export. Combined with **zero test coverage**, **266 unguarded console statements**, and **3 major features that are fully coded but completely inaccessible to users**, the engine sits at roughly **70% of production readiness**.

**The good news:** The architecture is sound, the feature set is competitive, and the visual polish is already commercial-grade. With focused effort on the issues identified below, FlourishVNE can become a **legitimate top-tier competitor** to Ren'Py, TyranoBuilder, and Visual Novel Maker.

---

## Part 1: Issues Affecting User Experience & Finished Products

### 🔴 CRITICAL — Will Cause Data Loss or Broken Outputs

#### 1.1 No Auto-Save or Persistent Storage
- **Impact:** If the app crashes, the browser tab closes, or Electron dies, **ALL work since the last manual .zip export is lost**
- **Current state:** `src/utils/storage.ts` is a stub — all localStorage functions have been removed. The only persistence is manual ZIP export via the Header toolbar
- **User impact:** Devastating. Users creating hour-long projects will lose everything on a single crash
- **Location:** `src/contexts/ProjectContext.tsx`, `src/utils/storage.ts`

#### 1.2 Undo/Redo Memory Explosion
- **Impact:** The undo system stores up to **50 full deep-copies** of the entire `VNProject` including base64-encoded asset data URLs
- **Risk:** A project with 10MB of assets = **500MB+ of RAM** just for undo history. This will cause browser tab crashes on mid-to-large projects, especially on lower-end machines
- **Location:** `src/contexts/ProjectContext.tsx` (MAX_UNDO_HISTORY = 50)

#### 1.3 Web Builds Are Not Truly Offline
- **Impact:** The standalone HTML game loads React 18 from `unpkg.com` CDN and Tailwind from `cdn.tailwindcss.com`. First play requires internet
- **Additional issue:** The editor uses **React 19.2** but builds bundle **React 18** from CDN — potential runtime behavior mismatches
- **User impact:** Players receiving web builds may see broken games without internet. Itch.io desktop wrappers may fail
- **Location:** `src/utils/gameBundler.ts`

#### 1.4 No Pre-Build Validation
- **Impact:** Users can build a game with missing start scenes, broken character references, orphaned variables, or incomplete branches
- **User impact:** Shipped games may crash or show blank screens with no indication of what's wrong
- **Location:** `src/components/GameBuilder.tsx`

#### 1.5 Recent Projects Cannot Be Re-Opened
- **Impact:** The "Recent Projects" list in ProjectHub stores metadata but clicking one just opens the file picker — it doesn't actually load the project
- **User impact:** Confusing UX; users expect to click a recent project and open it
- **Location:** `src/components/ProjectHub.tsx`

---

### 🟠 HIGH — Degrades User Experience Significantly

#### 1.6 ErrorBoundary Coverage is Minimal
- **Impact:** The `ErrorBoundary` component only wraps `UIManager`. If LivePreview, SceneEditor, CharacterEditor, or any other panel crashes, the **entire application goes down**
- **User impact:** A bug in one panel takes out the whole editor instead of gracefully recovering
- **Location:** `src/components/VisualNovelEditor.tsx`

#### 1.7 No Game Resolution / Aspect Ratio Settings
- **Impact:** There is no way to configure the game's target resolution or aspect ratio (e.g., 1920×1080, 1280×720, 16:9, 4:3)
- **User impact:** Games may render at unexpected sizes on different screens. This is a fundamental setting in every VN engine
- **Location:** Missing from `src/components/SettingsManager.tsx` and `src/types/project.ts`

#### 1.8 Silent Error Swallowing
- **Impact:** 14 instances of empty `catch(e) {}` blocks across the codebase that silently swallow errors
- **Key locations:** `src/components/live-preview/systems/`, `src/utils/saveSystem.ts`, `src/components/menu-editor/`
- **User impact:** Bugs occur invisibly — users see symptoms (missing audio, broken animations) with no indication of the cause

#### 1.9 266 Console Statements in Production
- **Impact:** 125 `console.log`, 93 `console.warn`, 48 `console.error` statements ship in production builds
- **User impact:** Clutters browser DevTools, exposes internal state to players in web builds, unprofessional for a commercial product
- **Worst offenders:** LivePreview (~100 instances), SceneEditor (~10), reducers (~7)

#### 1.10 Electron Sync Broadcasts Entire Project
- **Impact:** Every state change in Electron sends the **entire serialized VNProject** to all windows via IPC
- **User impact:** Multi-window editing becomes sluggish on larger projects. Could cause UI freezes
- **Location:** `src/contexts/ProjectContext.tsx`

---

### 🟡 MEDIUM — Noticeable Quality Gaps

#### 1.11 No Onboarding or First-Run Experience
- A `welcome_onboarding_export` folder exists on disk but is never surfaced to users
- No tutorial wizard, guided tour, or sample project quick-start

#### 1.12 Migration System Not Connected
- A full migration framework exists (`src/features/migration/`) but is **not wired into the import pipeline**
- Projects from older versions may silently fail or load with missing data

#### 1.13 Three Major Features Are Dead Code
- **Content Wizards** (1,119 lines): Full wizard framework with Character Creator and Scene Builder wizards — no UI component renders them
- **Workflow Tracker** (173 lines): Analytics and optimization suggestions — never called from any component  
- **Accessibility Manager** (134 lines): WCAG preference toggles — no settings panel exposes them

#### 1.14 Standalone Player Version Hardcoded
- `FlourishEngine.version` returns hardcoded `'1.0.0'` instead of reading from `package.json`
- Players/developers can't verify which engine version built their game

#### 1.15 100+ `as any` Type Casts
- Pervasive type safety bypasses including in the root reducer (`action as any`), Electron API access, and font property access
- Risk of runtime type errors that TypeScript should catch at compile time

---

## Part 2: Competitive Analysis vs. Industry Leaders

### Feature Matrix

| Category | FlourishVNE | Ren'Py | TyranoBuilder | VN Maker | Naninovel |
|----------|------------|--------|---------------|----------|-----------|
| **Visual Editor** | ⭐⭐⭐⭐⭐ | ❌ Code-only | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ Unity |
| **Scene Commands** | 30 types | Unlimited (code) | ~20 types | ~15 types | Unlimited (code) |
| **Character Layers** | ⭐⭐⭐⭐⭐ Visual composer | ⭐⭐⭐⭐ Code | ⭐⭐ Basic | ⭐⭐ Basic | ⭐⭐⭐ Code |
| **UI/Menu Editor** | ⭐⭐⭐⭐⭐ WYSIWYG | ❌ Code | ⭐⭐ Basic | ⭐⭐⭐ | ❌ Code |
| **Live Preview** | ⭐⭐⭐⭐⭐ In-editor | ❌ Separate | ⭐⭐⭐ Split | ⭐⭐⭐ | ⭐⭐⭐ Unity |
| **Screen Effects** | 6 canvas FX | Plugin | ❌ | ❌ | Plugin |
| **Visual Scripting** | ⭐⭐ Backend only | ❌ | ❌ | ❌ | ❌ |
| **Templates/Wizards** | ⭐⭐⭐ 1 working | ❌ | ⭐⭐ | ⭐⭐ | ❌ |
| **Build Targets** | Web + Desktop | Web + Desktop + Mobile | Web + Desktop | Desktop | Unity platforms |
| **Auto-Save** | ❌ None | ✅ File-based | ✅ | ✅ | ✅ Unity |
| **Test Coverage** | ❌ 0% | Community | Basic | Basic | Unity tests |
| **Documentation** | ⭐⭐ Partial | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Plugin/Extension System** | ❌ None | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Localization** | ❌ None | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **Mobile Export** | ❌ | ✅ | ❌ | ❌ | ✅ (Unity) |
| **Pricing** | Free | Free | $14.99 | $59.99 | $152 (Unity) |

### Where FlourishVNE Already Wins
1. **Best-in-class WYSIWYG UI/Menu Editor** — no competitor offers drag-resize with 11 element types, conditional visibility, and template wizards
2. **Best visual character layer system** — live composite preview with video assets surpasses every visual editor competitor
3. **Most complete in-editor preview** — 5,000+ line runtime with save/load, canvas effects, and all UI elements interactive
4. **Command stacking for parallel execution** — unique feature not found in any competitor
5. **Distinctive visual identity** — the pastel rainbow design system is polished and memorable

### Where FlourishVNE Falls Behind
1. **No persistent save system** — every competitor has this; it's table stakes
2. **No plugin/extension ecosystem** — Ren'Py's community plugins are its biggest moat
3. **No localization/translation support** — critical for the global VN market
4. **No mobile export** — limits the addressable market significantly
5. **No visual scripting UI** — the backend exists but the node canvas is unbuilt
6. **No documentation/tutorial portal** — Ren'Py and TyranoBuilder have extensive docs
7. **No animation system** — no Spine, Live2D, or keyframe animation support


---

## Part 3: Strategic Action Plan — Road to Profitability

### Phase 0: Critical Stability "Stop the Bleeding"
*Goal: Eliminate data loss risks and ship-breaking bugs*

| # | Task | Priority | Est. Effort | Impact |
|---|------|----------|-------------|--------|
| 0.1 | **Implement auto-save system** — Periodic checkpoint saves to IndexedDB (not localStorage) with configurable interval (default 2min). Add crash recovery on next launch | P0 | 3-4 days | Eliminates #1 user pain point |
| 0.2 | **Fix undo memory explosion** — Replace deep-copy undo with structural sharing (Immer.js patches or command-based undo). Cap memory at 50MB, not 50 snapshots | P0 | 2-3 days | Prevents crash on medium projects |
| 0.3 | **Bundle React into web builds** — Inline React 19 into the standalone HTML instead of CDN. Remove Tailwind CDN dependency. True offline play | P0 | 1-2 days | Fixes broken offline games |
| 0.4 | **Add pre-build validation** — Check for: start scene exists, no broken character/asset references, no empty branches, no orphaned jumps. Show warnings before build | P1 | 2-3 days | Prevents broken shipped games |
| 0.5 | **Expand ErrorBoundary coverage** — Wrap every major panel (SceneEditor, LivePreview, CharacterEditor, etc.) with ErrorBoundary. Add "Copy Error Report" button | P1 | 1 day | Prevents full-app crashes |
| 0.6 | **Gate console statements** — Create a `Logger` utility with debug/info/warn/error levels. Replace all 266 raw console calls. Production builds strip debug/info | P1 | 2 days | Professional output |

### Phase 1: Production Polish "First Impressions"
*Goal: Make the first-run and core workflow feel professional*

| # | Task | Priority | Est. Effort | Impact |
|---|------|----------|-------------|--------|
| 1.1 | **Onboarding experience** — Surface the `welcome_onboarding_export` as a "Start Tutorial" option. Add a guided tour overlay for first-time users (5-7 steps highlighting key areas) | P1 | 3-4 days | Reduces churn for new users |
| 1.2 | **Fix Recent Projects** — Store project file paths (Electron) or IndexedDB references (web). Enable one-click re-open from ProjectHub | P1 | 2 days | Expected behavior |
| 1.3 | **Add game resolution settings** — Width, height, aspect ratio picker (16:9, 4:3, custom) in SettingsManager. Enforce in LivePreview and builds | P1 | 2-3 days | Fundamental VN feature |
| 1.4 | **Project metadata expansion** — Add author, description, version, icon/splash image fields. Include in builds and export metadata | P2 | 1-2 days | Professional output |
| 1.5 | **Wire up migration system** — Call MigrationService during project import. Show migration report to users. Add `version` field to VNProject type | P2 | 2 days | Prevents silent data loss |
| 1.6 | **Activate dead features** — Build React UI for Content Wizards (Character Creator, Scene Builder). Add Accessibility toggle panel to Settings. Wire WorkflowTracker to editor actions | P2 | 4-5 days | Unlocks 1,400+ lines of working code |
| 1.7 | **Fix silent catches** — Add proper error logging/user notification to all 14 empty catch blocks | P2 | 1 day | Debuggability |

### Phase 2: Competitive Features  "Close the Gaps"
*Goal: Reach feature parity with paid competitors*

| # | Task | Priority | Est. Effort | Impact |
|---|------|----------|-------------|--------|
| 2.1 | **Visual Logic Canvas** — Build the React node-graph UI for the existing LogicCanvas service (862 lines of backend ready). Drag-drop condition nodes, visual if/then/else flows, connection wires | P1 | 2-3 weeks | Flagship differentiator for no-code users |
| 2.2 | **Localization system** — Multi-language text support with language switcher. String table export/import (CSV/JSON). Variable interpolation per-language | P1 | 1-2 weeks | Opens global market |
| 2.3 | **Template expansion** — Build out Shop System, Stat Tracker, Dating Sim, and Inventory templates using the existing TemplateService infrastructure | P2 | 2-3 weeks | Massive time-saving for users |
| 2.4 | **Comprehensive documentation** — In-app help panel, searchable docs site (Docusaurus/VitePress), video tutorials for key workflows, command reference | P1 | 2-3 weeks | Reduces support burden, builds trust |
| 2.5 | **Test suite foundation** — Set up Vitest, write unit tests for all reducers, command handlers, and utility functions. Add integration tests for build pipeline. Target 60% coverage | P1 | 2-3 weeks | Prevents regressions, enables confident shipping |
| 2.6 | **Type safety cleanup** — Eliminate all `as any` casts. Add `Window.electronAPI` type declaration. Properly type all action dispatches and command discriminated unions | P2 | 1 week | Catches bugs at compile time |




### Competitive Pricing Rationale
- TyranoBuilder is $14.99 one-time
- VN Maker is $59.99 one-time 
- Naninovel is $152 one-time (Unity)
- Flourish will remain free and available to everyone.

---

## Part 5: Priority Roadmap Summary

```
 ████████████████  Phase 0 — Critical Stability
          Auto-save, memory fix, offline builds, validation, error boundaries

 ████████████████  Phase 1 — Production Polish  
          Onboarding, resolution settings, metadata, migration, dead code activation

 ████████████████  Phase 2 — Competitive Features
          Visual logic canvas, localization, templates, docs, test suite

```

---

## Part 6: Quick Wins

These can be done immediately for disproportionate impact:

1. ✅ Fix `FlourishEngine.version` to read from package.json instead of hardcoded `'1.0.0'`
2. ✅ Change `metadata.json` author from "Your Name" to actual author name
3. ✅ Fix `metadata.json` name from "Copy of Copy of Flourish Visual Novel Engine" 
4. ✅ Add ErrorBoundary wrapping around LivePreview and SceneEditor
5. ✅ Wire migration system into project import flow
6. ✅ Add `version` field to VNProject type
7. ✅ Remove `jszip` duplicate from both dependencies and devDependencies in package.json

---

## Appendix A: Codebase Health Metrics

| Metric | Value | Assessment |
|--------|-------|------------|
| Total components | 35+ | Good — well-decomposed |
| Total lines (estimated) | 20,000+ | Substantial codebase |
| Command types | 30 | Competitive |
| Runtime handlers | 12 | Comprehensive |
| Screen effects | 6 canvas-rendered | Best-in-class for visual editors |
| Test files | 0 actual tests | 🔴 Critical gap |
| `as any` casts | 100+ | 🟠 High type safety risk |
| Console statements | 266 | 🟠 Needs debug gating |
| Empty catch blocks | 14 | 🟡 Needs fixes |
| Dead code features | 3 (1,426 lines) | 🟡 Wasted effort until activated |
| Undo max history | 50 full snapshots | 🔴 Memory bomb |
| Dependencies | 4 runtime, 6 dev | ✅ Minimal — good |
| Design system | Full CSS variable tokens | ✅ Professional |
| Build targets | Web HTML + Desktop EXE | Good — needs mobile |

## Appendix B: File-Specific Technical Debt

| File | Issue | Severity |
|------|-------|----------|
| `src/contexts/ProjectContext.tsx` | Deep-copy undo, `action as any` cast, full-project IPC sync | 🔴 |
| `src/utils/storage.ts` | Stub file — no persistence | 🔴 |
| `src/utils/gameBundler.ts` | CDN dependencies, React version mismatch | 🔴 |
| `src/components/LivePreview.tsx` | 5,141-line monolith, ~100 console statements | 🟠 |
| `src/components/GameBuilder.tsx` | No pre-build validation, inline styles | 🟠 |
| `src/components/ProjectHub.tsx` | Recent projects non-functional | 🟠 |
| `src/StandalonePlayer.tsx` | Hardcoded version, no error boundary, bare catch | 🟡 |
| `src/features/migration/MigrationService.ts` | Not connected to import pipeline | 🟡 |
| `src/features/content-wizards/ContentWizardService.ts` | 1,119 lines of unreachable code | 🟡 |
| `src/features/analytics/WorkflowTracker.ts` | 173 lines of unreachable code | 🟡 |
| `src/features/accessibility/AccessibilityManager.ts` | 134 lines of unreachable code | 🟡 |
| `package.json` | Duplicate jszip, author = "Your Name" | 🟡 |

---

## Conclusion

FlourishVNE has **exceptional foundations**. The visual editor, character system, UI editor, and runtime engine are genuinely best-in-class among visual VN editors. The visual polish and design system rival commercial products.

The path ahead:
1. **First:** Make it reliable (auto-save, memory, error handling)
2. **Then:** Make it complete (visual logic, localization, docs, tests)

