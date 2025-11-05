# Quickstart – Runtime Logic Stabilization

1. **Create the shared runtime module**
   - Add `src/features/runtime/` with the scheduler, variable store, lifecycle manager, and diagnostics feed described in `data-model.md`.
   - Port existing command handlers from `components/live-preview/command-handlers` into reusable functions that operate on the new context.
   - Ensure exports expose a thin adapter for React preview and for the standalone bundle builder.

2. **Integrate with the editor preview**
   - Replace the command execution effect in `src/components/LivePreview.tsx` with the scheduler API (`advance`, `dispatchAsync`, `onSceneChange`).
   - Wire diagnostics events to the existing debug overlays so QA can observe command order and variable writes.

3. **Update standalone build pipeline**
   - Adjust `scripts/generate-engine-bundle.js` to bundle the new runtime module instead of copying the preview logic verbatim.
   - Regenerate `public/game-engine.js` and `dist-standalone/game-engine.js`, confirming the command scheduler code path matches the editor integration.

4. **Harden scene cleanup flows**
   - Register audio handles, timeouts, and overlay allocations with the lifecycle manager; invoke `flushCleanup()` on scene exit and session end.
   - Add parity checks ensuring new scenes start with empty scene-scoped variables and no leftover timers.

5. **Verify parity and reliability**
   - Run the branching regression harness (planned under Functional Requirements) across editor preview, test play, and exported build.
   - Perform manual QA on rapid scene restarts, choice-heavy scripts, and long-running effects to ensure no leaks or duplicate commands remain.
