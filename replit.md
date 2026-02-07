# Flourish Visual Novel Engine

## Overview
A browser-based visual novel engine with a layered character system. Built with React, TypeScript, and Vite. Originally includes Electron support for desktop builds, but runs as a web app in Replit. Version 2.1.0.

## Recent Changes
- 2026-02-07: Phase 2 (Competitive Features) implementation:
  - Visual Logic Canvas: full node-graph UI with drag-drop nodes, SVG connections, zoom/pan, export to VNCondition
  - Localization system: LocalizationService + LocalizationPanel with string table, CSV export/import, multi-language support
  - Template expansion: Stat Tracker, Dating Sim, Inventory System templates added to TemplateService/TemplateGenerator
  - In-app help panel: HelpPanel with 31 documented commands, searchable reference, keyboard shortcuts, tips
  - Test suite: Vitest configured with 59 passing tests (reducer, buildValidator, logger, LocalizationService)
- 2026-02-07: Phase 1 (Production Polish) implementation:
  - Start Tutorial button in ProjectHub loading welcome onboarding project
  - GuidedTour overlay with 7-step walkthrough for first-time users
  - MigrationService wired into project import flow (auto-detect + execute migrations)
  - ContentWizardModal with step-based Character Creator and Scene Builder wizards
  - Accessibility settings panel (high contrast, reduced motion, large text, keyboard nav, screen reader)
  - WorkflowTracker instrumented into editor dispatch with Analytics tab in Settings
- 2026-02-07: Phase 0 (Critical Stability) improvements:
  - Auto-save to IndexedDB every 2 minutes with crash recovery dialog in ProjectHub
  - Undo memory fix: reduced history 50->20, 300ms action coalescing, NON_UNDOABLE_ACTIONS set
  - ErrorBoundary with "Copy Error Report" wrapping all major panels
  - Pre-build validation (buildValidator.ts): checks start scene, broken refs, empty branches, orphaned jumps
  - Logger utility (logger.ts): environment-aware log levels, production filters to warn+
  - Game resolution settings: 5 presets (16:9, 4:3, 9:16), custom width/height, aspect ratio calculation
  - Author/description/version metadata fields in SettingsManager
  - Offline web builds: React 18, ReactDOM, and Tailwind CSS inlined at build time (no CDN dependencies)

## Project Architecture
- **Frontend**: React 19 + TypeScript + Vite 6
- **Styling**: Tailwind CSS (via CDN in dev), custom CSS variables for theming
- **Entry point**: `index.html` -> `src/index.tsx` -> `src/App.tsx`
- **Components**: `src/components/` -- editor panels, game preview, asset management
- **State**: `src/state/` -- reducer-based state management with undo/redo
- **Contexts**: `src/contexts/` -- React contexts for project, theme, toast, UI themes
- **Utils**: `src/utils/` -- logger, storage (IndexedDB), buildValidator, gameBundler
- **Features**: `src/features/` -- modular feature systems:
  - `visual-logic/` -- VisualLogicService for node-graph logic editing
  - `localization/` -- LocalizationService for multi-language support
  - `templates/` -- TemplateService, TemplateLibrary, TemplateGenerator
  - `migration/` -- MigrationService for project format upgrades
  - `accessibility/` -- AccessibilityManager for a11y preferences
  - `analytics/` -- WorkflowTracker for usage statistics
  - `content-wizards/` -- ContentWizardService for guided content creation
- **Tests**: `src/**/__tests__/` -- Vitest unit tests (59 tests, 4 files)
- **Build output**: `dist/` (standard Vite build)
- **Standalone player**: `vite.config.standalone.ts` builds a standalone game engine bundle

## Key Files
- `vite.config.ts` -- Main Vite config (port 5000, host 0.0.0.0)
- `vitest.config.ts` -- Test configuration (jsdom, globals)
- `src/contexts/ProjectContext.tsx` -- Project state, undo/redo, auto-save, WorkflowTracker integration
- `src/components/ProjectHub.tsx` -- Landing page with Create/Tutorial/Import cards
- `src/components/GuidedTour.tsx` -- 7-step guided tour overlay
- `src/components/VisualLogicCanvas.tsx` -- Node graph editor for visual scripting
- `src/components/LocalizationPanel.tsx` -- Translation management panel
- `src/components/ContentWizardModal.tsx` -- Step-based content creation wizards
- `src/components/HelpPanel.tsx` -- Searchable in-app documentation
- `src/components/SettingsManager.tsx` -- Project settings, accessibility, analytics
- `src/components/Header.tsx` -- Top bar with Wizards, Logic Canvas, Localization, Help buttons
- `src/utils/buildValidator.ts` -- Pre-build validation checks
- `src/utils/gameBundler.ts` -- Game build with inlined dependencies
- `src/features/localization/LocalizationService.ts` -- String extraction, CSV export/import
- `src/features/templates/TemplateService.ts` -- Template definitions (Shop, Stats, Dating, Inventory)

## User Preferences
- Follow assessment report's Phase 0, 1, 2 action items
- Competitive with VN Maker, TyranoBuilder, Naninovel
