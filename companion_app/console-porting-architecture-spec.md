# Console Porting Companion — Architecture Spec

> **Purpose of this document.** This is a guardrail spec to hand to a coding agent (GitHub Copilot in VS Code). It defines *what to build*, *what must never be built*, and *how the pieces connect*. The legal boundaries in Section 1 are non-negotiable and must be preserved through every iteration. If the agent proposes anything that crosses them, that proposal is wrong regardless of how the code looks.

---

## 0. Context

We have an existing **visual-novel engine**: a no-code, visual editor that lets users build VN games without programming. It currently exports to:

- Electron desktop apps / installers
- HTML web games
- Android APK (unsigned)

We want to add a **path to consoles** (Xbox Series X|S, PlayStation 5, Nintendo Switch). This document specifies how — and, just as importantly, how *not* — to do that.

The chosen approach is a **two-component system**: a Godot-based runtime that plays our VN format, and a converter that packages a user's game into a Godot project targeting that runtime. The actual console SDK, signing, and certification steps happen entirely in the *user's own* licensed environment and are out of scope for our software to perform.

This model has a direct precedent: **Action Game Maker** (a no-code visual game maker built on Godot) reaches consoles by integrating **W4 Consoles** from W4 Games. We are following that same pattern.

---

## 1. Hard Boundaries (NON-NEGOTIABLE)

These exist because console platforms are closed systems governed by NDAs and per-developer licensing. Crossing any of these lines makes the product unshippable — legally, not just technically.

**1.1 — Never bundle, embed, download, or fetch any console SDK.**
No Xbox GDK, no PlayStation SDK, no Switch SDK. Not as a dependency, not as a plugin, not fetched at runtime, not vendored into a repo. These are NDA-protected and cannot legally ship inside our product.

**1.2 — Never handle, store, proxy, or generate console signing certificates or keys.**
Signing is issued per-developer-account by the platform holder. Our software must never touch it. No "sign for the user" feature can ever exist.

**1.3 — Never perform the final console build.**
Our software produces a *project*. The user builds and signs it themselves, inside their own licensed toolchain (their Godot + their W4 Consoles license + their platform certification).

**1.4 — Never bundle the W4 Consoles middleware or its private export templates.**
W4 access is gated: users get a private repository *after purchase*, restricted to authorized team members. We cannot redistribute it. Our converter targets stock/open Godot; the user swaps in their W4-licensed export templates on their own machine.

**1.5 — Each user brings their own access.**
Every user who wants a console build needs, independently: (a) platform-holder developer approval/certification, and (b) their own W4 Consoles license (or their own custom-built export templates). Our app assumes nothing and provides none of this.

> **Litmus test for any proposed feature:** *Does this feature cause our software to possess, transmit, or execute anything that legally belongs behind a platform NDA or a per-developer license?* If yes → it violates the boundaries. Redesign so the restricted step happens only on the user's machine, under the user's own credentials.

---

## 2. System Overview

```
┌─────────────────────┐
│  Existing VN Engine │  (already built)
│  (visual editor)    │
└──────────┬──────────┘
           │  exports
           ▼
┌─────────────────────┐
│  VN Export Bundle   │  ← runtime-agnostic data format (Section 4)
│  (.vnbundle)        │    story logic, assets, config — NO engine code
└──────────┬──────────┘
           │  consumed by
           ▼
┌─────────────────────┐        ┌──────────────────────────┐
│  Converter          │───────▶│  Generated Godot Project │
│  (companion app)    │ writes │  = VN Runtime + user data│
│  Component B        │        └────────────┬─────────────┘
└─────────────────────┘                     │
                                             │  user opens in THEIR Godot
                                             ▼
                              ┌──────────────────────────────┐
                              │  USER'S OWN ENVIRONMENT       │
                              │  • their Godot install        │
                              │  • their W4 export templates  │
                              │  • their platform cert        │
                              │  → they build + sign + certify│
                              └──────────────────────────────┘
                                   (entirely out of our scope)
```

Two things we build:

- **Component A — VN Runtime (in Godot):** a Godot project/package that reads a `.vnbundle` and *plays* the visual novel. This is the real engineering effort.
- **Component B — Converter (companion app):** takes a user's `.vnbundle` and emits a ready-to-open Godot project that embeds Component A plus the user's data. This is the easier, agent-friendly part.

The bridge between them — and the thing that keeps the whole design clean — is the **VN Export Bundle** data format (Section 4).

---

## 3. Why Godot (decision record)

Recorded so the decision isn't silently re-litigated later.

- **Godot** is MIT-licensed and free. Console support is real but deliberately kept outside the engine core: export templates must be built with official SDKs and shared only privately with approved devs. The middleware gap is filled by **W4 Consoles** (Switch, PS5, Xbox Series; Godot 4.3+).
- **Unity** also works but is heavier for a hobbyist audience: it requires a paid **Unity Pro** subscription (~$1,800/yr/seat) plus platform approval, and Xbox specifically has no free platform key from Microsoft, so that cost is unavoidable for Xbox.
- **Precedent:** Action Game Maker (no-code, Godot-based) ships to console via W4 — essentially our product's twin.

**Decision: target Godot 4.x as the runtime.** Keeps per-user cost low, matches the proven precedent, and keeps the console gate cleanly on the user's side.

---

## 4. The VN Export Bundle (data-format handoff)

This is the contract between the VN engine and everything downstream. Get this right and both components stay decoupled and testable.

**4.1 — Core principle: data, not engine.**
The bundle contains *only* the game's content and logic as **declarative data**. It must contain **no** Electron code, no JavaScript runtime behavior, no web-stack assumptions, and no engine binaries. If the format leans on "the browser will do X," that logic has to be lifted out into explicit data the Godot runtime can interpret. This decoupling is the single most important design property of the whole system.

**4.2 — Container.**
A `.vnbundle` is a zip archive (or a plain folder during development) with a fixed internal layout:

```
mygame.vnbundle/
├── manifest.json        # format version, game metadata, entry point
├── script/
│   ├── scenes.json      # scene graph: nodes, dialogue, choices, jumps
│   ├── variables.json   # declared variables + initial values
│   └── logic.json       # conditions, flags, branching rules (declarative)
├── assets/
│   ├── images/          # backgrounds, sprites, CGs
│   ├── audio/           # music, SFX, voice
│   └── fonts/
├── ui/
│   └── layout.json      # UI definitions: textbox, menus, HUD (declarative)
├── characters/
│   └── characters.json  # character defs, sprite states, name colors
└── save-format.json     # declarative save schema (see 4.4)
```

**4.3 — Everything branching is declarative.**
Dialogue, choices, jumps, conditionals, variable math, and flag checks are expressed as data structures the runtime *interprets* — never as embedded scripts in a language tied to the web build. Example shape (illustrative, not final):

```json
{
  "scene_id": "ch1_intro",
  "nodes": [
    { "type": "say", "character": "yuki", "text": "It's you again." },
    { "type": "set", "var": "met_yuki", "value": true },
    { "type": "choice", "options": [
        { "text": "Say hi",   "goto": "ch1_greet" },
        { "text": "Walk away", "goto": "ch1_leave", "if": "brave > 2" }
    ]}
  ]
}
```

**4.4 — Save format is declared, not inherited.**
Console certification has strict save-data integrity requirements, and the web build's save mechanism (e.g. localStorage) does not exist on console. So the bundle declares a **save schema** as data (what variables/flags/progress persist), and each runtime target implements persistence natively against that schema. The VN engine must never assume a browser storage model.

**4.5 — Versioned.**
`manifest.json` carries a `bundle_format_version`. The runtime and converter both check it and fail loudly on mismatch. This lets the format evolve without silently breaking old exports.

**4.6 — This format is reusable beyond console.**
Because it's runtime-agnostic, the same `.vnbundle` could later drive *other* runtimes (a cleaner web player, a mobile-native player, etc.). Console is the first consumer, not the only possible one. Design it as a general contract.

---

## 5. Component A — VN Runtime (Godot)

**Role:** a Godot 4.x project that loads a `.vnbundle` and plays it as a functioning visual novel.

**Responsibilities:**
- Parse and validate the bundle (honor `bundle_format_version`).
- Scene playback: dialogue flow, character sprites, backgrounds, transitions.
- Interpret the declarative logic: choices, branches, variables, flags, conditionals.
- Render UI from `ui/layout.json` (textbox, choice menus, backlog, settings).
- Audio: BGM, SFX, voice with appropriate channels.
- **Native save/load** implementing the declared save schema (per-platform-appropriate persistence).
- **Console-conscious input:** controller-first navigation (not mouse/keyboard-only), because console certification requires full controller support and button-label conventions differ per platform (e.g. Nintendo's A/B layout differs from Xbox).
- **Console-conscious performance:** respect tighter memory limits, avoid blocking asset loads, stream where sensible — these are common certification pain points.

**Explicitly NOT responsible for:**
- Anything platform-SDK-specific. The runtime targets *stock Godot*. Console specifics come from the user's own W4 export templates layered on top in their environment. The runtime should be written so that swapping in W4-licensed templates "just works" without runtime code changes.

**Deliverable:** a maintained Godot project (Component A) that we develop and version independently, with a test suite of sample `.vnbundle`s covering dialogue, branching, variables, saves, and controller nav.

---

## 6. Component B — Converter (Companion App)

**Role:** take a user's `.vnbundle` and produce a ready-to-open Godot project = Component A wired to that user's data.

**Responsibilities:**
- Accept a `.vnbundle` (file or folder).
- Validate it against the format version; report problems in plain language.
- Scaffold a Godot project directory: drop in the Component A runtime, copy the user's assets/script/ui data into the expected locations, and generate Godot project config (`project.godot`, import settings, etc.).
- Produce a project the user can open directly in *their* Godot editor.
- Provide clear, non-technical **next-step guidance** in output: "Open this in Godot 4.x. To build for console, you'll need your own platform developer approval and a W4 Consoles license — see [pointers]." (Guidance only. The converter performs none of those steps.)

**Explicitly NOT responsible for:**
- Building, exporting, signing, or anything console-SDK-related (Boundaries 1.1–1.4).
- Bundling Godot itself, or bundling W4 templates. It generates a project *for* the user's Godot; whether it downloads stock open-source Godot for convenience is an open question (Section 8), but it must never touch W4/SDK material.

**Deliverable:** the companion app (this is the part best suited to your Copilot-driven workflow), plus a documented mapping from `.vnbundle` layout → generated Godot project layout.

---

## 7. Build Order (suggested)

Each step is gated on your go-ahead before implementation begins.

1. **Lock the `.vnbundle` format (Section 4).** Write the spec + JSON schemas + 2–3 hand-authored sample bundles. Nothing downstream is stable until this is.
2. **Prototype Component A** against the sample bundles — dialogue + choices + variables + one save. Prove the format plays back in Godot before scaling features.
3. **Add an exporter to the VN engine** that emits `.vnbundle` from real user projects.
4. **Build Component B** (converter) to scaffold Godot projects from bundles.
5. **Round-trip test:** real VN project → export → convert → open in Godot → plays. On desktop Godot first (no console needed to validate the whole chain).
6. **Console-readiness pass on Component A:** controller nav, memory/perf, save integrity — so a user's eventual W4 build has the best shot at certification.

Note: steps 1–5 need *no* console access at all — they're fully testable on open Godot. Console licensing only enters at the very end, on the user's side.

---

## 8. Open Questions (decide before or during build)

- **Godot version target:** pin to a specific 4.x (W4 supports 4.3+; newer stable is generally better). Decide and lock.
- **Godot bundling:** does the converter fetch stock open-source Godot for user convenience, or just tell the user to install it? (Stock Godot is fine to distribute; W4 templates are not.)
- **Feature parity scope:** which VN engine features are v1 vs. later? Some web-specific effects may not map cleanly and need redesign as declarative data.
- **Converter form factor:** standalone desktop app, VS Code-adjacent tool, or a mode inside the existing engine? 
- **Save persistence strategy per platform:** how the declared schema maps to each target's native storage (finalized later, but keep it in mind in Component A's design).

---

## 9. One Realistic Expectation

Even with this pipeline, a Godot console port typically takes an indie team **~3–5 months** per game (controller polish, performance profiling, memory limits, certification). Our software removes the *project-setup* friction and improves certification odds — it does **not** make a game auto-pass certification. That per-game human work stays on the user's side, by design. Set user expectations accordingly.

---

*End of spec. Boundaries in Section 1 govern everything; when in doubt, keep the restricted step on the user's machine under the user's own credentials.*
