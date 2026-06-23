# Properties Inspector Revamp — Design Brainstorm

> **Status:** Brainstorm only. Nothing implemented yet. Parking-lot doc to resume from.
> Captured 2026-06-05.
>
> **Strategic rationale (owner):** declutter the properties UI *first*. Once the UI is
> uncluttered and properties are well-grouped, adding bigger systems/features (item
> registry, layer control, parallax, etc.) won't feel overwhelming to build *or* to use.
> This is foundational work that pays off across everything that comes after.

---

## 1. Diagnosis — why the inspector feels overwhelming today

Grounded in the current code (`src/components/PropertiesInspector.tsx`, ~2,800 lines):

- **No progressive disclosure.** The scene-command inspector is a flat, always-expanded
  stack of `<hr>` + `<h4>` section headers. Selecting a command shows *everything* at
  once → one long scroll.
- **Logic interleaved with visuals.** Conditions / Actions sit inline between styling
  blocks. (This is the owner's specific pain: "variables and conditionals mixed in with
  other properties.")
- **Per-command duplication.** The same sections are re-implemented in each command
  `case`: `TransitionFields` (Animation) appears ~10×, `OrientationFields` ~5×, and text
  styling + shadow/gradient/border are hand-written inline in both ShowText and
  ShowButton — even though **`FontEditor` already encapsulates exactly that**.
- **Heavy inline mega-blocks.** Text effects, image-map regions, and action lists are
  large, always-visible chunks.
- **Two inspectors that don't match.** The menu-editor side (`UIElementInspector`)
  already has a `CollapsibleSection` pattern; the scene-command `PropertiesInspector`
  doesn't use it. Unifying them is half the win.

---

## 2. Core idea — one group taxonomy, multiple presentations

Almost every command/element's properties fall into the same ~8 buckets. **Define each
group once** (id, label, icon, `appliesTo(target)`, `summary(target)`, `hasState`), then
render the *same* groups three ways: docked accordion, radial menu wedges, tree affordance.
One model → three views.

| Group | What lands here today |
|---|---|
| **Content** | Core payload — dialogue text, target scene/screen, variable+value, button text |
| **Transform** | Position x/y, size w/h, anchors, Orientation (rotation/flip) — **and future `layer` / parallax depth** |
| **Appearance** | Background/text color, opacity, border radius, fonts → fold into `FontEditor` |
| **Effects** | Text shadow/gradient/border, screen tints — also already in `FontEditor` |
| **Media** | Image / hover image / video pickers |
| **Logic** | Conditions (show/disabled), Actions (primary + additional) |
| **Animation** | `TransitionFields` (transition + duration) |
| **Audio** | Click / hover sounds |

Each command/element exposes only the groups that apply to it (a `SetVariable` command =
Content + Logic; `ShowText` = Content/Transform/Appearance/Effects/Animation/Logic;
`ShowButton` = all of them).

**Hard rule for the whole revamp: no field removed.** It's reorganization + disclosure.
Before touching code, write a checklist mapping every current field → its new group home.

---

## 3. Technique A — Accordion with collapsed summaries (docked inspector)

- Make each group a **collapsible section** (reuse `CollapsibleSection` from the
  menu-editor; unify both inspectors on it).
- **Show a one-line summary when collapsed** — the single biggest "less overwhelming"
  lever. State is visible without expanding:

```
▸ Transform     120,340 · 20×8% · ↻15°
▸ Appearance    Aa Poppins 18 · ■ #6366f1
▾ Logic
    Show when:  selected_item is key  OR  selected_item is potion
    Actions:    Set selected_item = ""  · +1 more
▸ Animation     Fade · 0.5s
▸ Audio         click: door_open
```

- Default-open the 1–2 most-used groups (Content + Transform); collapse the rest.
- Persist open/closed per group in localStorage (like other editor prefs).

A 40-row wall becomes ~6 scannable rows, expand-on-demand, nothing removed.

---

## 4. Technique B — Separate "logic" from "looks"

The owner's tangle complaint. Two options (not mutually exclusive):
- **Visually code the Logic group** (tinted panel / icon), always grouped at the bottom
  regardless of command type, so it reads as a distinct zone. *(Leaning toward this.)*
- **Tabs inside the inspector** (`Content · Style · Logic · Animation`) for the hardest
  separation — but more clicks; mitigate with a **badge/dot** on the Logic tab when
  conditions/actions exist so nothing hides silently. Reserve tabs for the densest
  command (ShowButton).

---

## 5. Technique C — Density & control polish (independent of structure)

- Pack related small fields into labeled grids (x/y, w/h, anchors already 2-col; extend to
  color rows).
- Inline label+control rows for single values instead of stacked.
- **Icon button-groups** for enums (alignment, flip) instead of dropdowns.
- A single **color + hex + opacity** combo control — promote the existing
  `ColorOpacityControl` (SettingsManager) to a shared component.
- Compact **header strip**: type icon + name + quick actions (duplicate / delete / reset
  position) so those leave the body.
- **Consolidate `FontEditor`:** replace the inline text-styling + shadow/gradient/border
  blocks in ShowText/ShowButton with `<FontEditor>` (big condensation + consistency win).

---

## 6. Before / after (ShowButton)

```
TODAY                                 PROPOSED
─────────────────────                 ─────────────────────
Button Text [______]                  ⬛ Button · "Continue"   ⧉ 🗑
X [..] Y [..]                         ▾ Content     Text [Continue]
Width [..] Height [..]                ▸ Transform   50,90 · 20×8% · ↻0
Anchor X/Y [..]                       ▸ Appearance  Aa 18 ■#6366f1 ▢8
Orientation ...                       ▸ Media       img: btn_blue
── Styling ── (colors, font,          ▾ Logic ●     Show when: chapter ≥ 2
   border radius, opacity)                          On click: Go To Screen "pause"
── Images (optional) ──               ▸ Animation   Fade 0.3s
── On-Click Action ── (primary +      ▸ Audio       click: tap
   additional + flags + sound)
── Animation ──
── Show Conditions ──
(one long scroll)                     (compact, expand what you need)
```

---

## 7. Radial menu + group-scoped inspector (the accelerator layer)

Same group taxonomy, presented as a **pie menu** that blooms at the cursor — point at a
group instead of scrolling to it, and only ever see one group's fields at a time.

### Why it fits
- **Minimal mouse travel** (Fitts's law): every wedge is the same short distance from the
  cursor; you're already hovering the element/row.
- **Context-aware wedges:** only groups that apply to the target appear (usually 4–6).
- **State at a glance:** each wedge carries a dot/count when its group has content
  (Logic "●2"). Read an element's "shape" without opening anything.
- **Same trigger from canvas or tree** — both resolve to "the selected command/element."

### Interaction design
- **Single left-click stays = select** (don't break muscle memory). Bloom the radial on
  **right-click** (or double-click / a hover ⊕ affordance). Can replace or reuse the
  existing `ContextMenu`.
- **Center of the wheel** = element type icon + name; **center click opens the FULL
  inspector** (escape hatch + fixes "two-step is slower for power edits").
- **Wedge click opens the group's properties** — two flavors to weigh:
  1. **In-place popover** at the cursor with just that group (fastest for quick tweaks).
  2. **Docked inspector scoped to that group**, with breadcrumb back to "All".
  - Likely: popover with an "expand ⤢" button that promotes to the docked inspector.
- Empty-but-applicable groups: gray out or hide (preference toggle).

### Rough shape
```
              ╭───────────╮
        Logic ●2          Appearance
            ╲     ⬛        ╱
             ╲  ShowButton ╱
   Animation ─┤  (center =  ├─ Transform
             ╱  full inspect)╲
        Audio              Media
              ╰───────────╯
click "Logic" → popover with only Show-when + On-click + add buttons (⤢ to expand)
```

### Honest tradeoffs + mitigations
- **Discoverability:** radial is invisible until invoked → keep the docked inspector fully
  working (radial is an *accelerator*, not the only path) + first-run hint.
- **Accessibility/keyboard:** pie menus are mouse-first → offer a **linear context-menu
  fallback** generated from the *same* group list, plus arrow/number-key selection. Never
  make the radial the sole route to a group.
- **Segment count:** ~8 is the comfortable max; context-filtering usually yields 4–6. If a
  target always needs all 8, merge (Appearance+Effects) or add a "More…" wedge.
- **Two-step cost** for the most common edit (e.g., just change dialogue text): mitigate
  with center=full-inspector and "remember last-used group."

---

## 8. Sequencing (de-risks everything)

1. **Group taxonomy** — one source of truth: list of groups with `appliesTo` + `summary`.
2. **Focused / group-scoped inspector** — docked accordion + collapsed summaries +
   `FontEditor` consolidation + Logic-zone separation. *This alone fixes the overwhelm.*
3. **Radial accelerator** — pure presentation on top of the same group list. Add/A-B it
   without rework; if it ever feels gimmicky, steps 1–2 still stand alone.

Do it **incrementally**: build the shared section kit, then migrate **one command/element
type at a time** (output identical, just reorganized) → low risk per step. **Unify the
scene-command + menu-element inspectors** on the same kit, retiring the duplicate styling
code.

---

## 9. Parked alongside: layer control + parallax (separate brainstorm)

Owner's earlier idea (not yet specced): **layer-control on all visual commands & elements**
and **parallax for scenes and screens**. These connect to this revamp:
- A `layer` (z-order) field and a parallax-depth field live naturally in the **Transform**
  group — so the shared taxonomy means they appear everywhere with zero per-case work.
- This is a good *first concrete test* of the taxonomy once it exists.

---

## 10. Open questions to settle before building

1. Radial as **primary** entry or **accelerator** alongside the docked accordion? (lean:
   accelerator.)
2. Wedge-click → **in-place popover** or **docked panel scoped to group** (or both with an
   expand button)?
3. Radial trigger: right-click / double-click / hover-affordance — least intrusive given
   left-click already selects?
4. Empty-but-applicable groups: grayed wedges or hidden?
5. Same radial for **both** canvas element and tree row, identical behavior?
6. Accordion summaries: worth the extra effort? (high value, some work.)
7. Unify the two inspectors into one kit, or keep separate but share section components?
8. Density: compact vs comfortable?
9. Which 1–2 groups default open?

---

## 11. Connections / related docs

- **`ITEM_REGISTRY_BRAINSTORM.md`** — the item registry depends on a less-overwhelming
  inspector and on the overlay/screen-flow work; this revamp is a sensible predecessor.
- **Existing patterns to reuse:** `CollapsibleSection` (menu-editor), `FontEditor`,
  `ColorOpacityControl` (SettingsManager), `ContextMenu`.
- **Recent work it builds on:** the AND/OR conditionals (`utils/conditionLogic.ts`) live
  in the **Logic** group; the `UIActionType` action pattern (Reset Variable / Play Sound)
  also surfaces in **Logic**.

---

## 12. Overall vision / suggested order

Owner's framing: **unclutter the UI first, then build systems.** Suggested big-rock order:
1. **Properties Inspector revamp** (this doc) — foundational; makes everything else less
   overwhelming to build and use.
2. **Overlay layering + screen-flow control** (from the item-registry doc §6) — benefits
   all screens; prerequisite for good inventory UX.
3. **Item registry / inventory** (`ITEM_REGISTRY_BRAINSTORM.md`).
4. **Layer control + parallax** (§9) — slots into the new Transform group.
