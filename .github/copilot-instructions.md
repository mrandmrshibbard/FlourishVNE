# FlourishVNE Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-11-02

## Active Technologies
- Local JSON project files, in-memory React state for runtime variables (002-fix-conditional-execution)
- TypeScript 5.8, React 19.2 (Vite toolchain) + React Context state, custom command queue modules, internal audio/asset managers (no new third-party libs) (002-fix-conditional-execution)
- Local JSON project files with in-memory runtime state (002-fix-conditional-execution)
- TypeScript 5.8, React 19.2, Electron 28.x shell for desktop exports + React runtime, internal command handler modules (`src/components/live-preview/command-handlers`), Vite build toolchain (001-fix-runtime-logic)
- Local JSON project files and in-memory variable stores (no remote persistence) (001-fix-runtime-logic)
- TypeScript 5.8, React 19.2 + React Context, Vite toolchain, Electron 28.x for desktop exports (001-streamline-ux-logic)
- Local JSON project files with in-memory runtime state (no remote persistence) (001-streamline-ux-logic)

- TypeScript 5.x (React 18) + React, Vite, Electron, Zustand/Context state, Node tooling (001-stabilize-engine)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test; npm run lint

## Code Style

TypeScript 5.x (React 18): Follow standard conventions

## Recent Changes
- 001-streamline-ux-logic: Added TypeScript 5.8, React 19.2 + React Context, Vite toolchain, Electron 28.x for desktop exports
- 001-fix-runtime-logic: Added TypeScript 5.8, React 19.2, Electron 28.x shell for desktop exports + React runtime, internal command handler modules (`src/components/live-preview/command-handlers`), Vite build toolchain
- 002-fix-conditional-execution: Added TypeScript 5.8, React 19.2 (Vite toolchain) + React Context state, custom command queue modules, internal audio/asset managers (no new third-party libs)


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
