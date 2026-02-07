# Flourish Visual Novel Engine

## Overview
A browser-based visual novel engine with a layered character system. Built with React, TypeScript, and Vite. Originally includes Electron support for desktop builds, but runs as a web app in Replit. Version 2.1.0.

## Recent Changes
- 2026-02-07: Phase 0 & 1 stability/polish improvements:
  - Auto-save to IndexedDB every 2 minutes with crash recovery dialog in ProjectHub
  - Undo memory fix: reduced history 50→20, 300ms action coalescing, NON_UNDOABLE_ACTIONS set
  - ErrorBoundary with "Copy Error Report" wrapping all major panels
  - Pre-build validation (buildValidator.ts): checks start scene, broken refs, empty branches, orphaned jumps
  - Logger utility (logger.ts): environment-aware log levels, production filters to warn+
  - Game resolution settings: 5 presets (16:9, 4:3, 9:16), custom width/height, aspect ratio calculation
  - Author/description/version metadata fields in SettingsManager
  - Fixed silent empty catch blocks with proper logging in ProjectContext
  - Fixed metadata.json project name, removed duplicate jszip, added __APP_VERSION__ global

## Project Architecture
- **Frontend**: React 19 + TypeScript + Vite 6
- **Styling**: Tailwind CSS (via CDN), custom CSS variables for theming
- **Entry point**: `index.html` → `src/index.tsx` → `src/App.tsx`
- **Components**: `src/components/` — editor panels, game preview, asset management
- **State**: `src/state/` — reducer-based state management with undo/redo
- **Contexts**: `src/contexts/` — React contexts for project, theme, toast, UI themes
- **Utils**: `src/utils/` — logger, storage (IndexedDB), buildValidator, gameBundler
- **Build output**: `dist/` (standard Vite build)
- **Standalone player**: `vite.config.standalone.ts` builds a standalone game engine bundle

## Key Files
- `vite.config.ts` — Main Vite config (port 5000, host 0.0.0.0)
- `src/contexts/ProjectContext.tsx` — Project state, undo/redo, auto-save
- `src/utils/storage.ts` — IndexedDB persistence layer
- `src/utils/buildValidator.ts` — Pre-build validation checks
- `src/utils/logger.ts` — Gated logging utility
- `src/components/ErrorBoundary.tsx` — Error boundary with copy report
- `src/components/SettingsManager.tsx` — Project settings including resolution
- `src/components/GameBuilder.tsx` — Build dialog with validation integration
- `src/types/project.ts` — VNProject type with gameResolution, version, author fields

## User Preferences
- Follow assessment report's Phase 0 (Critical Stability) and Phase 1 (Production Polish) action items
- Competitive with VN Maker, TyranoBuilder, Naninovel
