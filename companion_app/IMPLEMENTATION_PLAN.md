# Console Porting Companion — Implementation Plan

> **Status:** planning only. Nothing here is built yet. Each phase is gated on Brad's go-ahead
> (per the spec, §7). This document is the *grounded* plan; the authoritative guardrails live in
> [`console-porting-architecture-spec.md`](./console-porting-architecture-spec.md) and govern
> everything below. Where this plan and the spec ever disagree, the spec's **§1 boundaries win**.

---

## 0. Two things that frame this whole plan

**(A) The existing app is untouched.** Brad's constraint: we do **not** alter FlourishVNE. This forces
one deliberate deviation from the spec: the spec's §7 step 3 ("add an exporter to the VN engine")
cannot happen inside the engine. Instead the **`.flourish → .vnbundle` exporter lives entirely inside
the companion app** and reads the `.flourish` file the engine *already* produces. Same result, boundary
respected, and arguably cleaner (the engine stays a pure authoring tool).

**(B) The source is already a data IR.** Investigation of the codebase found that a `.flourish` file is
a **ZIP** containing `project.json` (the full `VNProject`, serialized declarative data) + a real
`assets/` file tree. The story model is a flat **command array** of ~90 discriminated node types;
conditions and actions are already **declarative data** (`{variableId, operator, value}` /
`VNUIAction[]`), not code. So the `.vnbundle` is not a from-scratch format — it is a **normalized,
de-web-ified projection** of `project.json`. The exporter's real job is to *lift out the web/Electron
assumptions* (§4 below), not to reinvent the data.

---

## 1. Governing boundaries (restated, so they're never re-litigated)

The companion app will **never**: bundle/fetch/execute any console SDK (Xbox GDK / PS5 / Switch);
touch signing certs or keys; perform the final console build; bundle W4 Consoles middleware or its
private export templates. It emits a **stock-Godot project**; every restricted step happens on the
user's machine, under the user's own platform approval + their own W4 license. Litmus test for any
feature I propose: *does it make our software possess, transmit, or execute anything behind a platform
NDA or per-developer license?* If yes, it's wrong — redesign so the restricted step is user-side.

---

## 2. What we build (three artifacts + the format contract)

```
.flourish  ──(exporter)──▶  .vnbundle  ──(converter)──▶  ready-to-open Godot project
 (engine's        │          (neutral IR)      │           = Component A runtime + user data
  existing         │                             │
  export)          └── both tools = companion app (TypeScript/Node)   Component A = Godot 4.x project
```

- **The `.vnbundle` format** — the contract (§3). JSON schemas + hand-authored sample bundles. The
  spine; nothing downstream is stable until this is locked.
- **Exporter** (`.flourish → .vnbundle`) — companion-app tool. Reads the engine's zip, decomposes
  `project.json` into the bundle layout, and **lifts web assumptions out** (§4).
- **Component B — Converter** (`.vnbundle → Godot project`) — scaffolds a project = the runtime +
  the user's data + plain-language "here's what *you* need next" guidance. Never builds/signs.
- **Component A — VN Runtime (Godot 4.x)** — reads a `.vnbundle` and *plays* it. The bulk of the
  engineering. Targets **stock Godot**; the user layers their own W4 templates on top with no runtime
  code changes.

### Proposed `companion_app/` repo layout
```
companion_app/
├── console-porting-architecture-spec.md   # Brad's guardrail spec (governs)
├── IMPLEMENTATION_PLAN.md                  # this file
├── format/                                 # Phase 1 — the contract
│   ├── SPEC.md                             #   human-readable format spec
│   ├── schemas/                            #   JSON Schema per bundle file
│   └── samples/                            #   2–3 hand-authored sample .vnbundle folders
├── tooling/                                # TypeScript/Node — Components' non-Godot half
│   ├── exporter/                           #   .flourish → .vnbundle  (de-web-ifies project.json)
│   └── converter/                          #   .vnbundle → Godot project (Component B)
└── runtime-godot/                          # Component A — the Godot 4.x VN runtime project
```

---

## 3. The `.vnbundle` format (target shape)

Follows the spec's §4.2 split layout (not a monolithic `project.json`) — the decomposition is what
forces web logic to be lifted into explicit data, and per-concern files are Godot-friendlier and more
memory-conscious (a console requirement, spec §5). Derived mechanically from `project.json`:

```
mygame.vnbundle/            (zip, or plain folder in dev)
├── manifest.json           # bundle_format_version, game metadata, startSceneId, gameResolution,
│                           #   capability flags (declares which optional subsystems this game uses)
├── script/
│   ├── scenes.json         # from project.scenes — the command graph (see mapping §5)
│   ├── variables.json      # from project.variables — id/name/type/default/scope/min/max
│   └── logic.json          # commonEvents + any cross-scene logic (declarative)
├── characters/characters.json   # from project.characters — layered sprite states, name colors, fonts
├── ui/layout.json          # from project.ui + project.uiScreens — textbox/menus/HUD/screens (declarative)
├── assets/{images,audio,video,fonts}/   # real files — data:/flourish-asset:// rewritten to relative paths
└── save-format.json        # DECLARED save schema (what persists) — not the web localStorage snapshot
```

- **Versioned** (`bundle_format_version`); runtime + converter both check and fail loudly on mismatch.
- **Capability flags** in `manifest.json` let the runtime + converter say, in plain language, "this
  game uses [mini-games / phone / inline scripts], which are not in the console runtime yet."
- **Reusable beyond console** (spec §4.6): the same bundle could later drive a cleaner web/mobile
  player. It's a general contract, console is just the first consumer.

---

## 4. The real work: lifting web/Electron assumptions out (the exporter's core job)

These are the concrete things `project.json` assumes that **do not exist on Godot/console**. Each is a
required transform in the exporter and/or a runtime responsibility:

| Web/Electron assumption (today) | Console/Godot reality | Where handled |
|---|---|---|
| `data:` URLs / base64-inlined media | real files under `res://` | exporter writes `assets/` tree, rewrites refs |
| `flourish-asset://` privileged scheme | won't resolve in Godot | exporter rewrites → relative `assets/...` |
| `localStorage` saves + persistent vars | native save API (`user://`, later console storage) | **declared** `save-format.json`; runtime persists natively |
| HTML `<video>`/`<audio>`, Web Audio | Godot `VideoStreamPlayer`/`AudioStreamPlayer` | runtime; **codec risk** (webm/vp8-9 vs mp4/H.264 — flag in exporter) |
| DOM/CSS stage & UI, CSS animations, CSS filters | Godot Control nodes, Tween/AnimationPlayer, shaders | runtime (UI-layer translation) |
| `PlayAnimation` = named CSS animations | Godot animation resources | runtime + a small mapping table |
| `window.electronAPI` (save/load/exit/asset IO) | Godot OS/FileAccess | runtime |
| `fetch` / remote-URL assets | no network on console | exporter resolves/embeds at export time, or errors |
| Canvas particles / screen FX | Godot GPUParticles2D + shaders | runtime (FX tier) |

**Controller-first input & console memory/perf** (spec §5) are Component-A design constraints from day
one — not a bolt-on — because certification requires full controller support and tighter budgets.

---

## 5. Feature-parity tiers (grounded in the actual feature surface)

The engine's runtime is large. Porting it whole is not a v1. Proposed tiers — **the format (§3) is
designed to express all tiers from the start** (so old bundles never break), but the **runtime**
implements them in order, and the **exporter validates + warns** (plain language) when a game uses a
subsystem the target runtime doesn't yet cover.

**Tier 1 — Core VN (the v1 target).** Ports cleanly; it's already declarative data.
- Dialogue, Choice, TextInput, Jump/Label/JumpToLabel, Branch (if/elseif/else), SetVariable,
  CallCommonEvent, Group.
- Characters (layered sprites, expressions, show/hide/move/layer), backgrounds, scene transitions.
- Variables + conditions + the `VNUIAction` set that's non-web (jump scene, set/reset var, save/load).
- Audio: music + SFX (native streams).
- Core UI: dialogue box, choice menu, name plate, backlog, basic settings — **controller-navigable**.
- **Native save/load** against the declared schema.

**Tier 2 — Visual polish.** Moderate; mostly runtime shaders/tweens.
- Text effects (shake/wave/rainbow/glitch…), TweenElement/MoveCharacter easing.
- Day/night grading (clean: a shader driven by a time variable).
- Screen FX (shake/tint/pan-zoom/flash), overlay effects (fog/rain/snow/CRT), particles, lightning/
  fireworks/flashlight/placed-lights.
- Video playback (subject to codec conversion at export).
- Custom `uiScreens` (title/menu/save/load) as Godot Control scenes.

**Tier 3 — Big subsystems (later, or explicitly out-of-scope for console).**
- **Mini-games** — 7 bespoke interactive mechanics; each becomes its own Godot minigame scene. Large.
- **In-game phone system** — effectively a sub-application (apps, live text/call convos, camera roll,
  notifications) fully serialized into saves. Large.
- **Inventory/shop, stats, maps, CG gallery** — data-backed; portable but each is real work.

**Tier X — No clean mapping (needs a policy decision, not just effort).**
- **Inline user scripts** (`project.scripts`: raw JS via `AsyncFunction`) and **plugins/extensions**
  (JS with their own storage). Godot has no JS equivalent. Options, roughly:
  (a) console builds simply **don't support** inline scripts/plugins — the exporter **flags** any game
      that uses them ("this game won't fully port to console until these are removed/redesigned");
  (b) later, a constrained expression sandbox or a JS VM in Godot (heavy, risky).
  **Recommendation: (a) for v1** — validate-and-warn, keep console to script-free games first.

---

## 6. Build order (phases — each gated on go-ahead)

Mirrors spec §7, adjusted for "exporter lives in the companion app." **Steps 1–5 need zero console
access** — the whole chain is testable on stock desktop Godot.

- **Phase 1 — Lock the format.** Write `format/SPEC.md` + JSON schemas + 2–3 hand-authored sample
  `.vnbundle`s (a "hello dialogue", a "branching + variables", a "save/load" sample). *Deliverable a
  human can review before any runtime exists.*
- **Phase 2 — Prototype Component A** (Godot) against the hand-authored samples: dialogue + choices +
  variables + one native save. Prove the format plays back before scaling.
- **Phase 3 — Exporter** (`.flourish → .vnbundle`) in `tooling/exporter`, run on a **real** exported
  Flourish project (e.g. the existing `The_Hollow_House.flourish` demo). Validate + warn on Tier 3/X
  usage.
- **Phase 4 — Component B converter** — scaffold a Godot project from a bundle (drop in Component A,
  copy user data, generate `project.godot`/import settings), plus the plain-language next-steps output.
- **Phase 5 — Round-trip test** — real Flourish project → export → convert → open in desktop Godot →
  plays. This is the milestone that proves the architecture.
- **Phase 6 — Console-readiness pass on Component A** — controller nav polish, memory/perf, save
  integrity, so the user's eventual W4 build has the best certification odds. (Still no console SDK on
  our side.)

Tiers 2/3 are added to Component A + the format iteratively **after** Phase 5 proves the core.

- **Phase 7 — non-coder GUI (planned, Brad).** The exporter + converter are a CLI-core today (Copilot-
  friendly, testable). Flourish's audience is non-coders, so wrap the whole chain in a **friendly
  desktop GUI**: pick a `.flourish` → one "Make console-ready Godot project" button → runs
  export→validate→convert → shows a plain-language result + the capability warnings + "what you need
  next" (platform approval + W4). No terminal. Same boundaries — it still performs no build/signing and
  bundles no SDK/W4. Likely an Electron/Tauri shell over the existing TS core (which is already
  library-shaped for exactly this). Sequence after the core is solid; format/runtime stay the engine.

---

## 7. Decisions (LOCKED — Brad, 2026-07-06)

1. **Companion-app stack / form factor → TypeScript/Node, CLI-core first.** The exporter + converter
   are a headless TS library + CLI (Copilot-friendly, trivially testable, direct reuse of the JSON/TS
   knowledge). A friendly GUI can wrap it later. The Godot runtime (Component A) is separate, in GDScript.
2. **v1 parity scope → Core VN + visual polish (Tier 1 + Tier 2).** v1 ships dialogue/choices/branching/
   variables/characters/backgrounds/transitions/audio/native-save **plus** text effects, tweens,
   day/night grading, screen FX/particles, video, and custom UI screens. **Deferred to later:** Tier 3
   (mini-games, phone system, inventory/shop/stats/maps/CG gallery). **Validate-and-warn:** Tier X
   (inline scripts + plugins) — the exporter flags any game that uses them as not-yet-console-portable.
   *Build note:* we still prototype **core-first** (Phase 2 proves dialogue/choices/vars/save before
   polish); Tier 2 is layered in after Phase 5 proves the round-trip.
3. **Godot version → pin 4.3** (W4 Consoles' proven floor). Bump later once the chain is stable.
4. **Godot bundling → instruct + link only.** The converter emits a ready project + plain-language
   steps ("install Godot 4.3 here, then open this"); it never fetches Godot. (Auto-fetching *stock*
   Godot stays a legal, optional future convenience.)

---

## 8. Risks / watch-items

- **Inline scripts/plugins (Tier X)** are the true blocker for full parity — set expectations that
  script-heavy games are not v1 console candidates.
- **Save-state fidelity** — the engine's real save is a large `PlayerState` snapshot with subtle
  transient-vs-persisted rules (mini-game/map/choice progress re-presents on load; phone fully
  serialized). The declared `save-format.json` must replicate those rules exactly, or loads diverge.
- **Video codecs** — webm/VP8-9 (web) vs what Godot/console decode; exporter must transcode or flag.
- **Per-game human cost stays user-side** (spec §9): even with this pipeline, a Godot console port is
  ~3–5 months of controller/perf/cert work per game. We remove setup friction and improve odds; we do
  not auto-pass certification. Say so in the converter's output.

---

*This plan complies with the guardrail spec; §1 boundaries are absolute. No implementation begins
until Brad okays Phase 1.*
