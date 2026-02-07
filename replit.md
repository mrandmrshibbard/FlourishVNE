# Flourish Visual Novel Engine

## Overview
A browser-based visual novel engine with a layered character system. Built with React, TypeScript, and Vite. Originally includes Electron support for desktop builds, but runs as a web app in Replit.

## Recent Changes
- 2026-02-07: Initial Replit setup — configured Vite to run on port 5000 with all hosts allowed for Replit proxy compatibility. Set up static deployment.

## Project Architecture
- **Frontend**: React 19 + TypeScript + Vite 6
- **Styling**: Tailwind CSS (via CDN), custom CSS variables for theming
- **Entry point**: `index.html` → `src/index.tsx` → `src/App.tsx`
- **Components**: `src/components/` — editor panels, game preview, asset management
- **State**: `src/state/` — reducer-based state management
- **Contexts**: `src/contexts/` — React contexts for project, theme, toast, UI themes
- **Build output**: `dist/` (standard Vite build)
- **Standalone player**: `vite.config.standalone.ts` builds a standalone game engine bundle

## Key Files
- `vite.config.ts` — Main Vite config (port 5000, host 0.0.0.0)
- `vite.config.standalone.ts` — Standalone player build config
- `package.json` — Dependencies and scripts
- `index.html` — HTML entry with inline styles and Tailwind config

## User Preferences
- None recorded yet
