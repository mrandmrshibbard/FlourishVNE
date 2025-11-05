# Data Model – Runtime Logic Stabilization

## CommandExecutionContext

- **Purpose**: Owns sequential execution of VN commands for the active session.
- **Fields**:
  - `sceneId: VNID` – Identifier for the scene currently being processed.
  - `commandList: VNCommand[]` – Immutable snapshot of commands for the scene.
  - `cursor: number` – Zero-based pointer to the next command to execute; must stay within `[0, commandList.length]`.
  - `stack: Array<{ sceneId: VNID; cursor: number; commandList: VNCommand[] }>` – Call stack for jumps and branch returns.
  - `pendingAsync: Set<string>` – Command IDs awaiting completion callbacks.
  - `history: Array<{ commandId: string; timestamp: number; status: 'completed' | 'skipped' | 'errored' }>` – Ordered audit trail for diagnostics.
- **Validation Rules**:
  - Cursor advances only via scheduler API; direct mutation prohibited.
  - When `pendingAsync` is non-empty, scheduler must not tick the same command twice.
  - Stack pushes require storing the pre-jump cursor/state for deterministic returns.
- **State Transitions**:
  - `advance()` increments `cursor` if no async blockers remain and the current command finished.
  - `jump(sceneId, cursor)` swaps `commandList` and `cursor`, pushing previous context onto `stack`.
  - `return()` pops from `stack` and restores previous context.

## RuntimeVariableStore

- **Purpose**: Maintains global, scene, and transient variables with deterministic write order.
- **Fields**:
  - `globals: Record<VNID, Primitive>` – Values persisted across scenes and saves.
  - `sceneScope: Record<VNID, Primitive>` – Values reset at every scene start.
  - `transient: Record<string, Primitive>` – One-frame command scratchpad cleared after command completes.
  - `lastWriteOrder: string[]` – Command IDs in the order they modified variables (for debugging parity).
- **Validation Rules**:
  - Writes always log to `lastWriteOrder`; read operations reference the latest value.
  - Scene transitions must call `resetSceneScope()` before executing the first command in the new scene.
  - Only known variables (from project schema) may exist in `globals`; others trigger descriptive errors.
- **State Transitions**:
  - `applyCommandWrites(commandId, patch)` merges updates atomically and records order.
  - `commitScene()` persists any scene-to-global promotions, then resets `sceneScope` and `transient`.

## SceneSessionState

- **Purpose**: Tracks visual/audio resources that need cleanup during transitions.
- **Fields**:
  - `audioChannels: Map<'music' | 'sfx' | 'ambient', PlaybackHandle>` – Active audio refs plus fade timers.
  - `overlays: { text: TextOverlay[]; images: ImageOverlay[]; buttons: ButtonOverlay[] }` – Presentational state on stage.
  - `effects: { shake?: EffectHandle; tint?: EffectHandle; flash?: EffectHandle; panZoom?: EffectHandle }` – Timed visual effects.
  - `uiStacks: { screens: VNID[]; hud: VNID[] }` – Menu stacks tied to the session.
  - `disposables: Set<number>` – Timeout/interval IDs registered by commands.
- **Validation Rules**:
  - Every entry added to `disposables` must be removed during cleanup; failure is surfaced as a warning.
  - Overlay additions must include unique IDs to prevent duplicate rendering across reruns.
- **State Transitions**:
  - `registerDisposable(id)` adds timer handles.
  - `clearForScene(sceneId)` stops audio, clears overlays, empties stacks, and cancels timers before switching contexts.

## SceneLifecycleManager

- **Purpose**: Coordinates between `CommandExecutionContext`, `RuntimeVariableStore`, and `SceneSessionState` to guarantee clean transitions.
- **Fields**:
  - `currentScene: VNID | null`
  - `cleanupCallbacks: Array<() => void>` – Registered by command handlers when they allocate resources.
  - `eventBus: EventEmitter` – Emits `sceneWillEnter`, `sceneDidExit`, `commandCompleted`, etc., for diagnostics UI.
- **Validation Rules**:
  - Any `cleanupCallback` registered must succeed (no thrown errors); failures bubble up as blocking runtime errors.
  - Entering a new scene automatically triggers `flushCleanup()` before new commands run.
- **State Transitions**:
  - `onSceneChange(nextSceneId)` executes cleanup, resets scene-scoped variables, and primes the scheduler with the new command list.
  - `onSessionEnd()` clears all managers and returns control to title screen logic.

## RuntimeDiagnosticsFeed

- **Purpose**: Surfaces command order, variable writes, and cleanup events for QA tooling defined in FR-008.
- **Fields**:
  - `events: Array<{ timestamp: number; type: 'command-start' | 'command-finish' | 'branch-path' | 'cleanup-done'; payload: any }>`
  - `subscribers: Set<(event) => void>` – Observer callbacks for UI overlays.
- **Validation Rules**:
  - All events must include `timestamp` derived from a shared monotonic clock to compare across environments.
  - Payloads reference stable IDs (sceneId, commandId) instead of mutable indexes.
- **State Transitions**:
  - `emit(event)` notifies subscribers in insertion order and stores the event for replay.
  - `rewind()` clears transient events when sessions restart to avoid mixing logs between runs.
