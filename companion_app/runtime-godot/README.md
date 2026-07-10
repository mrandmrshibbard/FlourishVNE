# Component A — VN Runtime (Godot 4.3)

The **stock-Godot** runtime that reads a `.vnbundle` (the format in [`../format/`](../format/)) and
plays it as a visual novel. This is Phase 2 of [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md).

**Boundary reminder:** this targets *stock* Godot only. No console SDK, no W4 middleware or export
templates live here — the user layers their own W4-licensed templates on top in their own environment.
Nothing in this project needs to change for that to work.

## Structure

```
runtime-godot/
├── project.godot
├── src/
│   ├── BundleLoader.gd   # reads manifest + script/characters/ui/save-format JSON; resolves assets
│   ├── GameState.gd      # variables, the condition model, var-set ops, save snapshot
│   ├── Interpreter.gd    # walks command nodes; pauses on say/choice/textInput; branch/jump/label/CE
│   ├── VNPlayer.gd       # the visual layer: background, character, dialogue box, choices, input
│   └── VNPlayer.tscn     # main scene (a Control that VNPlayer.gd builds the UI into)
└── tests/
    ├── run_tests.gd      # headless acceptance test — drives all 3 sample bundles, asserts behavior
    └── gen_assets.gd     # regenerates sample 01's placeholder images (dev utility)
```

The loader/state/interpreter are **pure logic** (no rendering), so the exact same code is exercised by
the headless tests and by the visual player — what the tests prove is what plays.

## Run it

The Godot 4.3 binary lives one level up (`../Godot_v4.3-stable_win64.exe`, console variant
`..._console.exe`). First run must import once to build Godot's class cache:

```bash
# from companion_app/
GODOT=./Godot_v4.3-stable_win64_console.exe

$GODOT --headless --path runtime-godot --import                         # once (or after adding scripts)

# Headless acceptance test (dialogue, choices, conditions, branch, jumpToLabel, vars, save/load):
$GODOT --headless --path runtime-godot --script res://tests/run_tests.gd

# Play a bundle in a window (defaults to the hello-dialogue sample):
$GODOT --path runtime-godot -- ../format/samples/02-branching-variables

# Visual self-check: render one frame to runtime-godot/shot.png and quit:
$GODOT --path runtime-godot -- --shot
```

Pass a `.vnbundle` **folder** path after `--` to play any bundle.

## Phase-2 status

**Covered (Tier 1 — verified):** scene playback, dialogue with speaker name plates, choices with
condition-gating, `set`/variable math, `jump`/`label`/`jumpToLabel`, nested `branch` (if/else),
`callCommonEvent`, `textInput`, `{var}` interpolation, background + **layered** character sprites,
music (ogg/mp3), and **native save/load** (declared schema → `user://saves/slot_N.json`).
`tests/run_tests.gd` passes on all three sample bundles; the visual player renders them.

**"Feel" pass (verified):** typewriter dialogue reveal (first accept/click completes it, next
advances), background **crossfades** and character **fade-in** honoring the bundle's transition data.

**Custom UI screens (verified):** the game launches on its **title/main menu** (`ui.titleScreen`)
and renders screen elements — background, images, text, and **buttons** (custom fonts + button art,
controller-focusable). Button actions dispatch: `startNewGame`, `goToScreen`, `back`, `returnToGame`,
`quitToTitle`, `openUrl`, `setVar`, `jumpToScene`, `quit`. `src/ScreenView.gd` renders a screen;
`VNPlayer` owns the flow.

**Save / Load / Settings widgets (verified):** `saveSlotGrid` renders a slot grid (reads `user://saves`,
shows the saved scene per slot), clicking saves or loads by the screen's role (save vs load) and a load
resumes the story; `settingsSlider` drives volume live (music/master bus); `settingsToggle` is a
check button. (Galleries / character previews aren't rendered yet.)

**Element fidelity:** elements honor `layer` (z-order), `opacity`, font weight/italic/**align**, **text
outline** (`textBorder`) and **shadow** (`textShadow`), button `backgroundColor`/`borderRadius`, and
image color backgrounds. (Text uses a clip-to-box, no-autowrap Label — Godot's autowrap inflates a
Label's min-height and would push vertically-centered text off its designed position.)

**Particles (verified):** `SpawnParticles`/`StopParticles` render the engine's 9 presets (confetti,
fireflies, sparks, bubbles, embers, dust, petals, magic, stars) via `src/ParticleFx.gd` (a
`CPUParticles2D` per color, grouped by tag). The exporter resolves the preset → a full config so the
runtime stays generic.

**Screen FX (verified):** `ShakeScreen`, `FlashScreen`, `TintScreen`, `PanZoomScreen`,
`ResetScreenEffects`. The scene (bg + characters + particles) lives under a transformable `stage` node
that pan/zoom scale and shake jitter; flash/tint are full-screen overlays above the scene, below the
dialogue box.

**Atmosphere (verified):** `SetScreenOverlayEffect` for **rain / snowAsh** (screen-space particles),
**fog / haze / smoke** (tint overlays) and **sunbeams / shimmer** (additive light); `Lightning`
(color/intensity/flashes flicker); `Flashlight` (a shader that darkens the screen except a soft circle
following the pointer). All clear on new game / load / `ResetScreenEffects`.

**Not yet (later phases):** overlay `crtScanlines`/`chromaticGlitch` (shaders), `Fireworks`,
`PlaceLights`, video (`PlayMovie`), element tweens/text-effects, and day/night grading are received as
`stage` events but not yet rendered; controller-input polish, memory/perf, and save-integrity hardening
are the Phase-6 pass. Tier-3/X (mini-games, phone, inline scripts) are gated by capability flags.
