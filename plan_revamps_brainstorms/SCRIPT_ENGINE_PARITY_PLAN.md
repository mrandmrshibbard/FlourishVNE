# Script → Engine Parity — Build Plan

> Goal (Brad, power-user/coder feature): **anything you can do with a visual command, you can do from a
> script** — imperatively, in order, awaiting results — fully functioning, and fully documented. This is
> the existing roadmap's §7 #1 ("biggest gap, highest value"). Benchmark: Ren'Py/VN Maker script power,
> but in our offline no-network sandbox.

## Current state (verified)
- Scripts run as an **AsyncFunction** with a `game` API (`ScriptExecutor.ts`): variables, inventory,
  flow (jump/runScript/callCommonEvent/wait), audio, **one** `showDialogue` line, notify, math.
- The RunScript handler (`scriptHandler.ts`) uses an **accumulator** model: script side-effects pile into
  one `CommandResult` (last-write-wins dialogue, one music state, one navigation). It does NOT run
  commands in order. The only real "run real commands" bridge is `callCommonEvent`, which delegates to
  the command stack (script returns `advance:false`; the CE runs via the normal loop).
- Presentation commands are real handlers in `live-preview/command-handlers/*` (characterHandler,
  backgroundHandler.tsx, choiceHandler, overlayHandler, audioHandler, effectsHandler, tweenHandler,
  particleHandler, controlFlowHandler) + some inline in `LivePreview.tsx` (Wait, Shake, Flash, Tint,
  PanZoom, lights, fireworks). Each returns `CommandResult { advance, updates, stagePatch, delay, callback }`
  consumed by `applyResult` (LivePreview ~7486).
- **Blocking commands** (Dialogue, Choice, TextInput, Wait-for-input) return `advance:false` and resume on
  an EXTERNAL event (advance click / choice select / submit). There is no completion callback today.

## The architecture decision — Imperative Promise-bridge (true parity)
The accumulator model can't express `await game.dialogue(); const c = await game.choice([...]); if (c===0) …`.
For real parity the **script becomes the driver**: it stays running and issues commands one-by-one,
awaiting each. So we add ONE new runtime primitive and reuse every existing handler:

```
runtime.runCommand(cmd: VNCommand): Promise<CommandOutcome>
```
- Synthesizes nothing new in the handlers — it calls the SAME handler for `cmd.type`, applies the result
  via the existing `applyResult` path (so timing/transitions/stage state are identical to the visual
  command), then:
  - **Non-blocking** (ShowCharacter, SetBackground, ShowImage/Text/Button, screen FX, audio, tween,
    particles, lights, fireworks): resolve after the result applies (+ any transition `delay`).
  - **Blocking** (Dialogue, Choice, TextInput, Wait/Wait-for-input): set the UI/stage state as usual, then
    register a **resolver** in a ref; the existing input handlers resolve it —
    advance-click → resolve dialogue/wait; `handleChoiceSelect` → resolve with the chosen **index**;
    TextInput submit → resolve with the **string**.
- The script (AsyncFunction) `await`s each `game.*` method (which calls `runtime.runCommand` under the
  hood). When the script finishes, `handleRunScript` returns `advance:true` and the scene continues.
- **Additive / low-risk:** the normal pointer loop is untouched; `runCommand` is a NEW path used only by a
  foreground script. The resolver ref is the only new hook into the input handlers.

Key subtlety: while a foreground script is driving, the main loop must stay parked on the RunScript command
(it already does — `handleRunScript` is awaited). Sub-commands run via `runCommand`, NOT by advancing
`currentIndex`. Navigation (`jumpToScene`) from a script still ends the script then applies (existing
behavior); document that visual changes after a scene jump are no-ops.

## The `game` API additions (full surface)
Grouped; all `async` (return Promise) so they can be awaited:
- **Characters:** `showCharacter(idOrName, {expression, position, transition, duration, effects})`,
  `hideCharacter(idOrName, {transition,duration})`, `setCharacterLayer(idOrName, layer, value)`.
- **Background:** `setBackground(idOrName, {transition, duration, stack?})`.
- **Overlays:** `showImage/hideImage`, `showText/hideText`, `showButton/hideButton`.
- **Dialogue & input:** `dialogue(speaker, text, {voice?})` (blocking), `choice(options[]) → index`
  (blocking), `textInput(prompt, {variable?}) → string` (blocking). (`showDialogue` kept as a non-awaiting
  alias for back-compat.)
- **Screen FX:** `shakeScreen`, `flashScreen`, `tintScreen`, `panZoom`, `screenOverlayEffect`,
  `lightning`, `flashlight`, `resetScreenEffects`.
- **Atmosphere:** `spawnParticles/stopParticles`, `placeLights/clearLights`, `fireworks`, `tween(...)`.
- **Media/flow:** `playMovie(idOrName, {loop,skippable})`, `goToScreen(idOrName)`, `save(slot)`,
  `load(slot)`, `exitGame()`.
Each maps 1:1 to a `CommandType` + builds the command via the existing `commandFactory` defaults, then
`runtime.runCommand`. No new command behavior is written — pure reuse.

## Phases (each: wire + verify tsc/vite/build:engine + re-export note + doc section)
- **P1 — Bridge + core, incl. blocking.** Build `runtime.runCommand` + the resolver wiring (dialogue,
  choice, wait). Ship: characters, background, overlays, `dialogue`, `choice`, screen FX. This proves the
  model end-to-end (await a choice result, branch, continue). Highest value.
- **P2 — Remaining commands.** textInput, particles/lights/fireworks/tween, playMovie, goToScreen,
  save/load, exitGame, resetScreenEffects.
- **P3 — Author experience + docs.** Lightweight autocomplete/signatures + click-to-insert for every new
  method (extend the existing ScriptEditor API panel), richer test runner, and the full docs rewrite.

## Docs (first-class deliverable, not an afterthought)
- Rewrite the Scripting half of `docs/scripting-and-plugins.md` (+ regenerate `.html` via `npm run
  build:docs` — edit the `.md`, never the HTML): a complete `game` API reference (every method, args,
  return, blocking/non-blocking), runnable examples (a fully scripted scene: background → characters →
  dialogue → choice → branch → effect), the await/timing model, the sandbox limits, and the
  script↔commonEvent↔plugin relationship.
- Update the in-app **ScriptEditor API reference panel** (📖) so every new method is click-to-insert with a
  one-line signature — the offline autocomplete substitute.
- Add a HelpPanel pointer if relevant.

## Hard parts / risks (watch these)
- **Core engine surface.** All of this lives in `LivePreview.tsx` + handlers → bundled into
  `public/game-engine.js` via `npm run build:engine`; **every exported game must be re-exported** to gain
  it. Verify `node --check public/game-engine.js` each phase.
- **Blocking resolver lifetime.** A pending resolver must be cleared on scene jump / preview close / skip
  so a script can't hang. Tie cleanup to the existing scene-exit/cleanup paths.
- **Save/load.** Scripts are pure runtime; no schema change → save/load safe. The mid-script state is NOT
  serialized (consistent with how RunScript works now); a save during a long blocking script resumes at the
  RunScript command, re-running it — document this.
- **Re-entrancy.** Guard against a script calling a presentation method after a scene jump; no-op + warn.
- **Mobile fork:** mirror ScriptExecutor / scriptHandler / LivePreview changes.

## Implementation design — nailed to the real code (read 2026-06-25)
Confirmed integration points so the build is mechanical:
- `commandContext: CommandContext` is built fresh **every tick** at `LivePreview.tsx:7463-7480` (has
  `setPlayerState: updatePlayerState`, all audio refs, `advance`, `notify`, `evaluateConditions`).
- `applyResult` (`LivePreview.tsx:7486-7574`) is **tick-scoped** — it closes over the current `command`
  and `playerState`. So `runCommand` CANNOT reuse it; it needs its own **decoupled imperative applier**
  that merges `result.updates` (stageState via `stagePatch` against LATEST `p.stageState`, uiState,
  musicState, variables) through `updatePlayerState(p => …)`. Scene-change cleanup is NOT needed
  (script scene-jumps already go through the existing navigation path in scriptHandler).
- `handleRunScript(cmd, commandContext)` is invoked at `LivePreview.tsx:8261`. The script bridge
  (`scriptHandler.ts`) builds a `ScriptRuntimeContext` with callbacks. **Add `onRunCommand(type, params)`
  to that context**, delegating to a new `commandContext.runCommand(type, params)`.
- Presentation handlers are pure + exported in `command-handlers/*` (characterHandler, backgroundHandler.tsx,
  overlayHandler, …) returning `CommandResult`; **a contained switch in `runCommand` calls them** (only the
  script-exposed commands — NOT the whole main-loop switch). Inline ones (shake/flash/tint/panzoom/lights/
  fireworks) get small extracted helpers when their slice lands.
- Build each command via `commandFactory(type)` defaults + the script's params (resolving name→id with the
  project lookups already in scriptHandler).

### Blocking-command resolvers (the careful part)
`game.dialogue/choice/textInput` set uiState as usual, then register a resolver in a ref (e.g.
`scriptCommandResolverRef`). The existing input paths fire it: the advance handler resolves a pending
dialogue/wait; `handleChoiceSelect` (`LivePreview.tsx:~8404`) resolves with the chosen index; TextInput
submit resolves with the string. Cleared on scene-jump / preview-close / skip so a script can never hang.

### Build slices (each: engine rebuild + runtime click-through before the next)
1. **Bridge + non-blocking visuals:** `runCommand` + decoupled applier; methods showCharacter/hideCharacter/
   setCharacterLayer, setBackground, showImage/hideImage/showText/hideText/showButton/hideButton. (Pure
   handlers, no input hooks → lowest risk; proves the bridge.)
2. **Screen FX:** extract shake/flash/tint/panzoom/resetScreenEffects/particles/lights/tween/fireworks.
3. **Blocking:** dialogue/choice/textInput + the resolver registry wired to input/choiceSelect/submit.
4. **Media/flow:** playMovie, goToScreen, save/load, exitGame.
Then P3 author-experience + full docs.

## Verification per phase
tsc (baseline) + `vite build` + `npm run build:engine` + `node --check public/game-engine.js`, BOTH forks.
Runtime: a test script that drives a full scene (the docs example) in `electron:dev` — owed each phase.
