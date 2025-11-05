# Runtime Logic Stabilization Research

## Decision 1: Centralize command execution in a deterministic scheduler

- **Rationale**: Current `LivePreview` effect runs asynchronous handlers that close over stale `playerState` values, allowing race conditions when commands update variables and then immediately inspect them (e.g., conditional jumps, `Wait` with early advance). The exported `public/game-engine.js` mirrors the same pattern, so issues propagate to shipped builds. A dedicated scheduler module that owns the execution pointer, serializes async completions, and emits state diffs to React/Electron consumers removes dependence on closure state while keeping command order authoritative.
- **Alternatives considered**:
  - *Keep React state as the source of truth and add more guards*: rejected because guard logic already exists (`lastProcessedCommandRef`) yet still allows advances to run on stale indices when multiple `setPlayerState` calls batch together.
  - *Wrap every command handler with `flushSync`*: rejected due to performance overhead and because it does not solve exported/standalone parity problems where React is not present.

## Decision 2: Share runtime logic between editor preview and exported engine

- **Rationale**: Today the runtime logic is duplicated—`src/components/LivePreview.tsx` for the editor and compiled copies inside `public/` and `dist-standalone/`. Divergent fixes are likely to regress parity. By extracting scheduler, variable store, and command handlers into `src/features/runtime/` and bundling that module for both preview and export, we ensure bug fixes apply everywhere and simplify testing.
- **Alternatives considered**:
  - *Continue copying fixes into generated bundles manually*: rejected because it is error-prone and violates Constitution Principle VI (export parity) by risking drift.
  - *Refactor only the exported bundle*: rejected as it would leave the editor preview unreliable, defeating the purpose of rapid iteration.

## Decision 3: Introduce scene lifecycle management for cleanup

- **Rationale**: Scene transitions currently clear some state inside the `advance()` helper, but ad-hoc cleanup (timeouts, audio refs, effect refs) is scattered. When scenes restart quickly, timers and audio can leak, leading to double playback or stale overlays. A lifecycle manager that tracks disposables (audio handles, timeouts, overlay keys) ensures cleanup runs before the next scene begins and provides a single surface for future resources (e.g., shaders).
- **Alternatives considered**:
  - *Continue manual cleanup in each command handler*: rejected because failures are already visible (e.g., timers left in `activeEffectTimeoutsRef`). Centralizing cleanup improves reliability and satisfies Principle I (Feature Completeness & Reliability).
