# renpy-convert

Converts a Ren'Py game into a FlourishVNE `.flourish` project.

## 🔴 Content rule

The source is a commercial game used for a **private** recreation. Its dialogue, art and audio
move **file-to-file on this machine only**. Nothing derived from game content may appear in:
chat, plan documents, commit messages, committed files, gap reports, test goldens, or drive
output. Reports and goldens carry **counts, identifiers and masked shapes only**.

`.gitignore` covers `/OurLife/`, `/ourlife-out/` and binary fixtures under this directory.
Note that `.gitignore` does **not** keep anything out of a *build* — that is `package.json`
`build.files`. This tool lives at the repo root, which is not packaged, so it never ships.

## Why this exists (and why it was rebuilt)

The previous converter wrote hand-typed object literals with no contract against the engine's
types. Measured consequences in its last output:

| Defect | Effect |
|---|---|
| Invented condition operators (`equals`, `greater_than`) | the engine's evaluator returns **false** for unknown operators → **653/653 branches always false**, ~632 story branches never ran |
| `HideImage` wrote `elementId`; engine reads `targetCommandId` | 73/73 hides were no-ops |
| `ChangePortrait` → bare `SetCharacterLayer` | 355 fired off-stage (silent no-ops) |
| Sprite canvas read from `base.png`, portrait-only scale solve | landscape sprites ~2.37× too small; one stub `base.png` → boxes ~64× oversized |
| Only PNGs measured, un-positioned shows centred | 233/235 overlays left at the `50/50/100/100` default |
| Asset pass never failed | 171/235 overlays pointed at a 64×64 tinted square |
| Everything base64'd into `project.json` | 229.9 MB (the real format writes `assets/…` separately) |

**The fix is structural**: `ir/engineContract.ts` imports the engine's real types
(`import type` only, so it is erased at runtime and Node can run the CLI), every mapper returns
engine-typed values, and `npx tsc --noEmit` therefore turns a wrong field name or a bogus
operator into a **compile error** instead of a silent runtime no-op.

## Never fake it

There is **no placeholder generator in this codebase**, by design. If an asset does not resolve,
no command is emitted. Unconvertible constructs become one `Group` command named
`⛔ UNCONVERTED [Gnnnn] <kind> — <file>:<line>` (a guaranteed runtime no-op that is visible in
the editor) plus a record in `gap-report.json`. The CLI exits **non-zero** on any gap unless
`--allow-gaps`, and `validateProjectForBuild` errors are fatal.

## Layout

```
ir/        engineContract.ts  — the type-only bridge to src/ + the operator and geometry constants
parse/     lexer, blocks, statements, atl, pyexpr
model/     imageTable, portraitTable, transformTable, slotOrder, assetIndex, spriteResolver
analysis/  cfg, spriteState (sprite dataflow), variables
map/       geometry, conditions, text, characters, commands   ← the only place literals are written
emit/      project, grade, archive
lint/      linter.ts  — fatal, runs on every convert
report/    gap.ts
drive/     playwright scripts (env: FLOURISH_CHROME, FLOURISH_DEV_URL)
```

## Commands

```bash
npm run convert:test        # this tool's tests only (the app suite is untouched)
npx tsc --noEmit            # proves every emitted command matches the engine's types
```

The app's own `npm test` does not include this directory (its vitest config is `src/**` only).
