# flourish-convert — `.vnbundle` → ready-to-open Godot project (Component B)

Phase 4 of [`../../IMPLEMENTATION_PLAN.md`](../../IMPLEMENTATION_PLAN.md). Takes a
[`.vnbundle`](../../format/) and scaffolds a **stock-Godot 4.3 project** the user can open and play,
with the game embedded and plain-language next-step guidance.

**Boundary:** it copies files and writes docs — it performs **no** build, **no** signing, and touches
**no** console SDK or W4 material. Those stay entirely with the user, under their own licenses.

## Build & run

```bash
npm install
npm run build                                   # tsc → dist/
node dist/cli.js <input.vnbundle|folder> [outDir]
# default outDir = ./out/<game-id>-godot
```

Then just open the generated `project.godot` in Godot 4.3 and press Play.

## What it generates

```
<out>/
├── project.godot        # patched with the game's name + resolution; main scene = the runtime
├── src/                 # the Component-A runtime (copied from ../../runtime-godot/src)
├── bundle/              # the user's game (the .vnbundle) — the runtime auto-loads res://bundle/
├── OPEN_ME_FIRST.md     # plain-language: play on desktop now; console needs YOUR approval + W4 license
└── .gitignore           # ignores Godot's .godot/ cache
```

The runtime defaults to loading `res://bundle/`, so the generated project is **self-contained** — no
command-line arguments, no wiring. (It finds the runtime at `../../runtime-godot` by default; override
with `FLOURISH_RUNTIME_DIR`.)

## Capability warnings

If the bundle declares a deferred subsystem (mini-games, phone, inventory, maps, scripts, plugins), the
converter prints a heads-up and repeats it in `OPEN_ME_FIRST.md` so the user knows those parts won't
play in the console runtime yet.

## Proven

Converted the exported `always_and_forever` bundle → the generated project **opened and rendered the
real game in Godot with zero arguments** (auto-loaded `res://bundle/`). Full chain: `.flourish` →
`flourish-export` → `.vnbundle` → `flourish-convert` → Godot project → plays.
