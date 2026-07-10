# Console Porting Companion

A **separate** application that ports FlourishVNE games to consoles (Xbox / PlayStation / Switch) via a
Godot runtime. It does **not** change the FlourishVNE engine — it reads the engine's existing
`.flourish` export.

> **The rules that govern everything here:** never bundle/fetch/execute a console SDK; never touch
> signing keys or certificates; never perform the final console build; never bundle W4 Consoles
> middleware or its private export templates. This tool produces a *stock-Godot project*; every
> restricted step happens on the **user's** machine under **their** platform approval + **their** W4
> license. Full rules: [`console-porting-architecture-spec.md`](./console-porting-architecture-spec.md).

## The pipeline

```
.flourish ──flourish-export──▶ .vnbundle ──flourish-convert──▶ ready-to-open Godot project ──▶ plays
 (engine's                     (neutral,                        (runtime + your game +          (Godot 4.3,
  export)                       validated data)                  guidance; self-contained)       then W4 → console)
```

## Layout

| Path | What it is | Status |
|------|-----------|--------|
| [`console-porting-architecture-spec.md`](./console-porting-architecture-spec.md) | Guardrail spec (governs; §1 is law) | — |
| [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) | The grounded plan + locked decisions | — |
| [`format/`](./format/) | The `.vnbundle` format: SPEC, JSON schemas, samples, `validate.mjs` | ✅ Phase 1 |
| [`runtime-godot/`](./runtime-godot/) | **Component A** — the Godot 4.3 VN runtime that plays a `.vnbundle` | ✅ Phase 2 |
| [`tooling/exporter/`](./tooling/exporter/) | `.flourish → .vnbundle` (TypeScript) | ✅ Phase 3 |
| [`tooling/converter/`](./tooling/converter/) | **Component B** — `.vnbundle →` Godot project (TypeScript) | ✅ Phase 4 |
| `Godot_v4.3-stable_win64*.exe` | Stock Godot 4.3 (used to run/verify the runtime) | — |

## Try the whole chain (on the real sample project)

```bash
# 1) export a .flourish → .vnbundle
cd tooling/exporter && npm install && npm run build
node dist/cli.js ../../always_and_forever.flourish out/game.vnbundle

# 2) sanity-check the bundle
node ../../format/validate.mjs out/game.vnbundle

# 3) convert the bundle → a Godot project
cd ../converter && npm install && npm run build
node dist/cli.js ../exporter/out/game.vnbundle out/game-godot

# 4) open out/game-godot/project.godot in Godot 4.3 and press Play
```

Steps 1–4 need **no console access** — the whole chain validates on stock desktop Godot. Console
licensing only enters at the very end, on your side (see any generated project's `OPEN_ME_FIRST.md`).

## Decisions (locked)

TypeScript/Node CLI tooling · Godot **4.3** · v1 scope = **core VN + visual polish** (mini-games /
phone / inline scripts are deferred and flagged) · the converter **instructs**, it never fetches Godot.

## Remaining

- **Phase 6 — console-readiness pass** on the runtime: controller-input polish, memory/perf, save
  integrity — to give a user's eventual W4 build the best certification odds.
- Iteratively fill in Tier-2 rendering (screen FX, particles, video, custom UI screens) in the runtime.
