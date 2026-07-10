# `.vnbundle` format — Phase 1 deliverable

This folder is the **contract** the whole console-porting pipeline is built on (see
[`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md), Phase 1). It is **design + data only** — no
runtime, exporter, or converter code lives here yet.

```
format/
├── SPEC.md          # the human-readable format specification (v0.1.0) — start here
├── schemas/         # JSON Schema (draft 2020-12), one per bundle file
│   ├── manifest.schema.json
│   ├── variables.schema.json
│   ├── scenes.schema.json      # node / condition / action model (the core)
│   ├── logic.schema.json
│   ├── characters.schema.json
│   ├── ui-layout.schema.json
│   └── save-format.schema.json
├── samples/         # 3 hand-authored, valid sample bundles (folder form)
│   ├── 01-hello-dialogue/      # dialogue + a character (2 sprites) + background + music
│   ├── 02-branching-variables/ # variables, conditions, gated choice, if/else branch, jumpToLabel
│   └── 03-save-load/           # persistent variable, text input, save/load actions, position
└── validate.mjs     # dependency-free consistency checker (Node built-ins only)
```

## Validate

```
node format/validate.mjs            # check all sample bundles
node format/validate.mjs <folder>   # check one bundle folder
```

`validate.mjs` covers what JSON Schema can't: **referential integrity** — every `goto`/`jump`/
`jumpToLabel` target resolves, every variable/character/sprite/common-event reference is declared,
every asset path exists on disk, node ids are unique, and any use of a deferred/Tier-X subsystem is
flagged. The `schemas/` provide the machine-checkable field-level contract; wire them into CI with a
JSON-Schema 2020-12 validator (e.g. `ajv`) once the TypeScript tooling package exists (Phase 3).

## Notes

- Sample 1's assets are tiny **placeholders** (1×1 PNGs, a stub `.ogg`) — these bundles demonstrate the
  *data format*, not media. Samples 2 & 3 are narration-only (no assets).
- `bundle_format_version` is **0.1.0** (pre-1.0: may still change; the version gate exists so old
  bundles fail loudly rather than misbehave).
- For a console-targeted v1 export, all deferred/Tier-X capability flags must be `false`
  (`scripts`, `plugins`, `miniGames`, `phone`, `inventory`, `maps`). The validator warns otherwise.
