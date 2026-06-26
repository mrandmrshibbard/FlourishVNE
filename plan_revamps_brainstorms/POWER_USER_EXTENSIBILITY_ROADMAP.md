# Power-User Extensibility — Combined Roadmap (Scripting · UI control · Plugins · Extensions · Project API)

> Brad's questions that frame this: **Why would anyone script instead of using the editor? What do they
> get that the editor can't? Is this worth building? Will coders actually WANT it?** This doc answers
> those first (the "should we"), then lays out the "how" across all layers + the documentation plan.

## 1. The value question — is this worth it, and why?

**Honest framing: the editor is the product for 95% of users (artists/writers). Code is the escape hatch
and the ecosystem engine for the other 5% — and that 5% multiplies value for everyone.**

### Why a power user would choose code over the editor (what code gives that clicking can't)
- **Real logic & math:** loops, multi-variable conditionals, computed values, algorithms (stat systems,
  procedural text, RNG tables, a minigame). The visual branch UI gets unwieldy past a few conditions; code stays concise.
- **Generated / data-driven content:** build 50 cards from a table, loop over a list, template scenes.
  The editor is one-manual-item-at-a-time.
- **Reuse & maintainability:** a function reused everywhere; text that diffs/version-controls/find-replaces.
- **Speed for fluent coders:** typing a branching sequence beats dragging commands — for someone who codes.
- **Capabilities the editor has NO command for:** bespoke systems, (allow-listed) integrations — added via
  Plugins/Extensions, not just inline scripts.

### The honest caveat
You generally would **not** script a whole VN instead of using the editor — most coders still use the
editor for the bulk and **drop to code only for the parts the editor can't express.** Script→engine parity
matters precisely so that drop-down is never a dead end ("anything a command can do, a script can").

### The real payoff (the strongest reason to build this)
**Ecosystem, not solo scripting.** The RPG Maker / VN Maker / Ren'Py model: a FEW power users build
plugins/extensions; THOUSANDS of non-coders install and use them. So the highest-leverage outcome isn't
"coders script their game" — it's **power users extending the editor/engine with reusable
plugins/extensions that your non-coder majority consumes no-code.** That multiplies the app's capabilities
without you building every feature yourself. It also channels the "the source is open, do what you want"
energy into *clean, shareable, in-app* extensions instead of source forks.

### When it's worth it (the conditions — this is the risk)
Deep extensibility is worth it **only if it's polished, documented, and genuinely powerful.** A half-built
scripting surface (the prior "API documented but not wired" state) actively *hurts* credibility — a coder
who hits a broken example leaves. So the bar is: working parity + first-class docs + discoverability + real
extension power. Done below that bar, skip it. Done above it, it's a genuine differentiator (an offline,
no-code VN tool with deep clean extensibility is rare).

**Recommendation: yes — but sequence for the ecosystem.** Finish runtime scripting + full UI control (so
the escape hatch is real), document it to a high bar, then build Extensions (so power users can ship
editor/UI add-ons non-coders use). The project/asset API is the most niche; do it last or on demand.

## 2. The layers (status + what each is for)

| Layer | For | Status |
|---|---|---|
| **Runtime scripting (`game.*`)** | logic + presentation DURING play | Slices 1-3 DONE (chars/bg/image, effects, dialogue/choice/textInput); ~half the commands remain |
| **Runtime UI control from scripts** | drive screens/elements/save/load at play time | NOT yet — but cheap: bridge the single `handleUIAction` (covers every UIActionType) |
| **Plugins** | extend the ENGINE (custom commands, effects, hooks) | BUILT (works for its scope) |
| **Extensions** | extend the EDITOR (custom UI element types, panels, DB categories, commands w/ config UI, packaged add-ons) | **NOT BUILT — the spec's marquee gap** |
| **Project / asset API** | build a whole project (assets, scenes, screens) BY CODE | Implicit today (project is open JSON → external generation + import works, undocumented); no in-app API |

## 3. Sequenced plan

### Phase A — Finish runtime scripting + FULL UI control (complete the escape hatch)
- Remaining scene commands as `game.*`: SetCharacterLayer, StopSoundEffect, ShowText/HideText/HideImage,
  ShowButton/HideButton, StopMovie, SetScreenOverlayEffect, Lightning/Flashlight/Fireworks/PlaceLights/
  ClearLights, ShowItem, CreditRoll, ShowHotSpot/HideHotSpot, item commands, phone commands, PlayMovie
  (blocking, needs a movie-end resolver), ShowScreen.
- **UI bridge:** expose `handleUIAction` → `game.goToScreen()`, `game.showElement()`, `game.hideElement()`,
  `game.changeImage()`, `game.playAnimation()`, `game.save()`, `game.load()`, `game.exitGame()`, `game.quitToTitle()`,
  + a general `game.ui(actionType, params)` so **anything a UI button does, a script can.** (One bridge,
  like runCommand, since `handleUIAction` already dispatches every UIActionType.)
- Keep the safety rule: additive; authored/non-coder playback untouched.

### Phase B — Documentation to a high bar (Brad: "document all terminology, language, syntax")
This is a first-class deliverable, not an afterthought. Produce:
- **Glossary / terminology** — script vs command vs Common Event vs plugin vs extension; runtime vs editor;
  scene/chapter; variable scopes; "blocking" vs "non-blocking"; what `await` means here.
- **Language & syntax reference** — it's JavaScript (async): the sandbox (what's blocked + why), `await`,
  the `game` object, error handling, the timing model.
- **Full `game.*` API reference** — every method: signature, args, return, blocking/non-blocking, example.
- **Worked tutorials** — a fully scripted scene; a script-driven minigame; a stat system; driving UI.
- **"When to use code vs the editor" guide** — directly answers Brad's value question for users.
- **Plugin authoring guide** + (later) **Extension authoring guide**.
- Surfaces: `docs/scripting-and-plugins.md` (+ generated `.html` via `npm run build:docs`), the in-app
  ScriptEditor 📖 panel (click-to-insert for every method), in-app HelpPanel pointers.

### Phase C — Extensions system (the "build the UI/editor pieces themselves" answer)
The spec's Stage 3 (see "Visual Novel Maker-like…md"). Multi-phase: contribution registry → custom scene
commands (JSON/TSX config UI) → custom DB categories → custom panels/menus → custom UI element types →
Composer (package an installable add-on) → Manager (install/enable/configure) → security model (the
full-trust-but-no-cross-user-poisoning rules already in the spec). This is the biggest build; plan it as
its own roadmap when we start.

### Phase D — Project / asset API (optional / on demand)
Documented programmatic building: import assets by code, create scenes/screens/characters, assemble +
round-trip a project. Lowest priority (the open JSON format already enables external generation for the
determined; this just makes it first-class/supported).

## 3b. Honesty check — which "why script" examples are REAL today vs need the unbuilt layers

Brad rightly insisted the value-prop examples must be things users can ACTUALLY do. Verified against the
current script sandbox (`ScriptExecutor.ts`):

**Live now (runtime scripting, Slices 1-3):** loops, multi-variable conditionals, computed values, full
`Math` + `game.random`/`clamp`/`lerp`, stat systems (variables + math), procedural/computed text shown via
`game.dialogue`, runtime data-driven *presentation* (loop presenting N dialogues/choices), reuse via
`runScript`/`callCommonEvent`, plus show character/bg/image, screen effects, particles, tweens, SFX/music,
and blocking dialogue/choice/textInput.

**NOT yet (needs the unbuilt layers) — so don't pitch these as available:**
- **Authoring-time generation** ("build 50 cards/scenes from a table" as actual project DATA) → needs the
  **project/asset API (Phase D)**. (Runtime *presentation* of 50 items already works; generating saved
  project content does not.)
- **Real-time / arcade minigames** (custom render loop, `requestAnimationFrame`, custom canvas/widgets) →
  blocked in the sandbox by design; needs **custom UI element types / plugins (Phase C)**. Choice- and
  stat-based "minigames" already work.
- **Network / integrations** (`fetch` etc.) → intentionally blocked in inline game scripts (offline-first).
  Lives in the **Extensions/Plugins layer (Phase C)**, not inline scripts.

This gap IS the roadmap: finishing Phase A + building Phase C/D is what makes every example true.

## 3c. "Anything goes" principle for Extensions/Plugins (Brad)

Power users must be able to do **literally anything** with Plugins/Extensions — including non-VN/whimsical
add-ons (Brad's example: an embedded YouTube/TV panel in the editor to watch while working). Boundary:
**inline game scripts stay sandboxed + offline; the Extensions/Plugins layer is the unrestricted, full-trust
escape hatch** (arbitrary UI, opt-in network/fs). Sharing a high-capability plugin should disclose those
capabilities at install time, but a user's own machine has no ceiling. See
`feedback_extensions_can_do_anything` in memory.

## 4. Guiding rules (unchanged)
- **Never break save/load** (additive-optional + MigrationService).
- **Never affect the non-coder majority** — all power features are additive escape hatches; authored
  playback stays byte-identical (proven by the Slice-3 inert-guard pattern).
- **Offline-first** — network is opt-in only.
- **Don't ship a half-wired surface** — wired + documented or not at all (the credibility rule).
