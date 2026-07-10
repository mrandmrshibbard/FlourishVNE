# Compare & Merge — Collaborative Authoring Plan

Status: **BUILT & SHIPPED — Phases 1–3 complete** (verified 2026-07-08) · Created 2026-06-18

> Reachable in-editor via **Header → Tools menu → "🤝 Compare & Merge"**. Implemented in
> `src/utils/projectDiff.ts` (per-entity diff), `src/utils/projectMerge.ts` (additive import +
> take-theirs replace, with dependency-closure resolution) and
> `src/components/collab/CompareMergeModal.tsx` (the full UI). Import mutates the open project via a
> single undoable `SET_PROJECT`. **Still open (optional): Phase 4** — sub-entity / command-level
> merge, name-based matching for independent projects, a Project-Hub entry point, an auto-backup
> prompt before merge, and i18n localization of the modal strings.

## Goal
Let two (or more) people build one visual novel **together, asynchronously** — "you make the
characters, I'll write Chapters 1–3, then we combine our work." No backend, no accounts, no
real-time sync. It's a file-based **Compare & Merge** flow: open your project beside a
collaborator's exported `.flourish`, see exactly where they diverge, and choose what to pull in
— with warnings when something would break.

This is the on-brand answer to the user request "multiplayer save / make a VN together."
**Real-time co-editing (Figma/Docs style) is explicitly OUT OF SCOPE** — it would require a
server, accounts, and a CRDT/OT conflict engine, and would break Flourish's offline-first,
backend-free design. (Noted as a separate future product direction only.)

## Hard principles
- **No raw code/JSON shown, ever.** Flourish is a no-code tool. Comparisons are always at the
  level of human things — "Scene: Chapter 1", "Character: Alice", "Background: sunset.png",
  "Variable: affection" — with friendly visual detail (command lists, sprites, thumbnails,
  values), never diff text or JSON. (Consistent with the whole editor.)
- **Non-destructive.** Merging edits *your* project only, as a single undoable step, and offers
  to auto-save a backup `.flourish` first. The collaborator's file is never modified.
- **Never silently break a reference.** Importing a scene that needs a character/asset/variable
  you don't have must pull that dependency in too, or clearly warn.
- **Additive-first, save/load-safe.** Reuses existing `.flourish` import (`projectPackager.importProject`)
  + the project schema; no new save format. See [[feedback_never_break_saveload]].

## How co-authoring actually works (the workflow we design around)
The diff is only meaningful when entities share **stable IDs** (`scene-xxx`, `char-xxx`…). That
happens when collaborators share an **ancestor**:

> **One person creates the project, exports it, and shares the `.flourish`. Everyone edits their
> own copy. Later they Compare & Merge.**

With a shared ancestor, "Scene Alice-intro" is the *same* scene in both files, so we can show a
true per-entity diff. We design for this and surface it as guidance in the UI ("To collaborate,
start from the same project").

**Independent projects** (built separately, no shared IDs) still work, but every entity reads as
"New" (no overlap) → it degrades gracefully into a plain **import picker** ("bring these scenes/
characters/assets into my project"). Optional later: name-based "possible match" hints.

## The entities we compare (from `VNProject`, `src/types/project.ts`)
Diff is computed per entity within each category (each is a `Record<VNID, …>`):

| Category | Project field(s) |
|---|---|
| Scenes | `scenes` |
| Characters | `characters` |
| Assets — Backgrounds / Images / Audio / Videos | `backgrounds`, `images`, `audio`, `videos` |
| UI Screens | `uiScreens` |
| Variables | `variables` |
| Common Events | `commonEvents` |
| Systems — Items / Collections / Stats | `items`, `itemCollections`, `stats` |
| Fonts | `fonts` |
| Textbox Themes | `textboxThemes` |
| CG Gallery | `cgGallery.entries` |

**Special / deferred:** `ui` (VNProjectUI), `gameResolution`, title/author/version and other
project-level **settings** are singletons, not collections — shown as a separate "Project
settings" section, field-by-field, defaulting to **keep mine** (rarely what you want to import
from a collaborator). `scripts` and `plugins*` are advanced/code — **excluded from v1** merge
(flag if present, don't diff).

## Per-entity status
Computed by matching IDs across the two projects, then deep-comparing the entity:
- **New** — only in theirs → offer to import.
- **Changed** — in both, but differs → review; choose *Take theirs* / *Keep mine*.
- **Identical** — in both, equal → collapsed/hidden by default.
- **Yours only** — only in yours → informational (never deleted).

Asset equality compares the stored data (string compare of the data URL / a cheap hash) — we only
need equal-vs-different, and we show **thumbnails**, never the data. (Assets can live in any of
backgrounds/images/audio/videos — resolution must look across all, per [[reference_asset_collection_siloing]].)

Note: this is a **two-way** diff (theirs vs yours), not three-way — without a stored common
ancestor we can't auto-merge "both changed the same scene", so those are a user choice. (Storing
an ancestor for true 3-way merge = possible future enhancement.)

## Dependency closure (the make-or-break part)
When the user selects an entity to import, we compute everything it **references** and offer to
bring it along (or warn if missing):
- **Scene / Common Event** → commands reference: `characterId` + `expressionId`, background/image/
  audio/video `assetId`s, `variableId`s (conditions & Set-Variable), `GoToScreen`/`ToggleScreen`
  target screen ids, `CallCommonEvent` ids, item/collection/stat ids.
- **Character** → its layer/expression image assets.
- **UI Screen** → element assets, bound `variableId`s (Meter/Slider/conditions), item/collection
  ids, fonts.
- **Items/Stats** → backing `countVariableId`/`variableIds`; **Item** → `collectionId`, icon asset.
- **Textbox theme / character / screen** → fonts.

Algorithm: for each chosen entity, walk its references recursively → a **dependency set**. The
review UI shows "Importing *Chapter 1* will also bring: Alice, sunset.png, affection" and lets the
user include/exclude, with a clear ⚠ for any reference that exists in neither project (broken).
ID-collision handling reuses the existing remap approach (the duplicate-scene `branchId` remap,
item-count-variable self-heal) — for shared-ancestor merges IDs match (replace-by-id); for
genuinely-new entities from an independent project, mint fresh IDs and rewrite references.

## UX — change-list first, side-by-side on demand
A code-review/git-client shape (but entity-level and visual), NOT a flat side-by-side dump:
1. **Entry points:** Project Hub → "Compare with a friend's project…"; and an editor menu item
   "Merge from another project…". Pick the collaborator's `.flourish` (file picker / mobile file
   bridge). "Yours" = the currently open project.
2. **Summary panel** by category with counts: *Scenes — 3 new · 2 changed · 10 same · Characters
   — 1 new …*. Identical collapsed away.
3. **Entity list** per category with a status badge + a decision control (Import / Keep mine).
   New default Import-optional; Changed default Keep-mine (safe).
4. **Side-by-side detail** opens when an entity is clicked — theirs vs yours, rendered the
   friendly way: a scene → its two command lists with changed rows highlighted; a character →
   sprites/expressions; an asset → thumbnails; a variable → name/scope/default/value. No JSON.
5. **Review & Apply:** a final summary ("Import 6 items + 3 dependencies; 2 conflicts resolved as
   'keep mine'"), a one-click backup-export prompt, then **Apply Merge** → single undoable
   dispatch into your project.

## Phases (each ships standalone value)
- **Phase 1 — Compare viewer (READ-ONLY).** Load two `.flourish`, build the entity diff engine,
  show the categorized change list + friendly side-by-side detail. No importing yet. Delivers
  "see what my friend changed" and de-risks the diff/identity/asset-equality logic. *Editor-only;
  no engine bundle, no save-format change.*
- **Phase 2 — Import NEW (additive only).** Bring in only-in-theirs entities + their dependency
  closure, with ID handling. Purely additive (nothing overwritten) = safest first merge.
- **Phase 3 — Conflict resolution.** "Changed in both" → per-entity Take-theirs / Keep-mine
  (replace-by-id), driven from the side-by-side detail.
- **Phase 4 (later) — sub-entity merge.** Per-command scene merging, per-expression character
  merging; optional name-based matching for independent projects; optional stored-ancestor 3-way.

## Edge cases / risks
- Huge assets → compare by hash, render thumbnails, lazy-load detail. Two big projects in memory
  at once — load the collaborator's lazily / release after.
- Reference into neither project → ⚠ "broken reference" (don't import, or import + flag).
- Engine/schema version differences → run the collaborator's file through the load migrations
  (unified screens, item/stat self-heal, orphan-branch repair) before diffing.
- Mobile fork: gets the same feature (uses the app-private `.flourish` file bridge to pick the
  collaborator's file). Sync after building.

## Non-goals (v1)
Real-time multiplayer; accounts/cloud; merging `scripts`/`plugins`; auto-merging conflicting
command lists without user choice; deleting "yours-only" entities.

## Verify (each phase)
tsc 0 · `npm run build` · Playwright: build two `.flourish` from a shared ancestor with known
divergences → confirm the change list classifies New/Changed/Identical correctly, dependency
closure is right, and Apply Merge updates only the chosen entities (and is one undo step).
Editor-only → no `build:engine`, no game re-export. Sync changed files to `mobile_version`.
