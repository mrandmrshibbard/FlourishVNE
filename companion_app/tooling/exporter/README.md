# flourish-export — `.flourish` → `.vnbundle`

Phase 3 of [`../../IMPLEMENTATION_PLAN.md`](../../IMPLEMENTATION_PLAN.md). Reads a Flourish project
(the engine's existing `.flourish` export, or an extracted folder) and emits a runtime-agnostic
[`.vnbundle`](../../format/) — the format the Godot runtime plays.

It **never touches the engine** (reads its output only) and **never touches any console SDK**.

## Build & run

```bash
npm install
npm run build                       # tsc → dist/
node dist/cli.js <input.flourish|folder> [outDir]
# default outDir = ./out/<game-id>.vnbundle
```

Then validate + play the result:

```bash
node ../../format/validate.mjs out/<game>.vnbundle          # referential-integrity check
../../Godot_v4.3-stable_win64_console.exe --path ../../runtime-godot -- <abs path to out/<game>.vnbundle>
```

## What it does

- **Decomposes** `project.json` into the bundle's split files (manifest / scenes / variables /
  characters / ui / save-format) and **copies only the referenced assets** (paths are already
  relative `assets/...`, so no rewriting — just a de-web-ify check that rejects `data:`/`flourish-asset://`).
- **Normalizes** the command model: PascalCase `CommandType` → camelCase nodes; flat
  `BranchStart/ElseIf/Else/End` markers (paired by `branchId`) → one **nested `branch`** node; choice
  option `actions` → the normalized action set (a lone `JumpToScene` becomes `goto` sugar).
- **Flattens layered characters**: each expression → a sprite state whose `layers` are the base image
  plus its configured layer assets (drawn bottom-to-top). Player-created characters (empty layer
  config, `{name}` placeholder) are dropped with a warning.
- **Detects capabilities & warns**: sets `manifest.capabilities` and prints plain-language warnings for
  anything deferred (particles/video are Tier-2 kept; mini-games/phone/inventory/maps/scripts are
  dropped + flagged not-yet-console-portable).

## Source

`src/read.ts` (open .flourish zip or folder) · `src/context.ts` (asset-id → path resolution, warnings,
capabilities) · `src/commands.ts` (per-command mapping + branch folding) · `src/map.ts` (project →
bundle files) · `src/write.ts` (write + copy assets) · `src/cli.ts`.

## Proven

Round-tripped a real project (`always_and_forever.flourish`, 2 scenes / 7 variables / layered
characters / particles): export → `validate.mjs` passes → the Godot runtime renders it (background +
composited character + dialogue). See the plan doc for the full pipeline status.
