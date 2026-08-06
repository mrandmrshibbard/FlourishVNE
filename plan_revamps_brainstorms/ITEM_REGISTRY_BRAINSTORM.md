# Item Registry — Design Brainstorm

> **Status:** BUILT & SHIPPED (verified 2026-07-08) — this brainstorm was realized as the
> Inventory pilot of the Systems framework (see SYSTEMS_ROADMAP.md, which supersedes this doc).
> The registry lives at `project.items` (`src/features/items/types.ts`), is managed in the
> **Items tab of `SystemsManager.tsx`**, and is auto-rendered by `UIInventoryGridElement`.
> Shipped in commit `f8b1003`. The original brainstorm text below is kept for history.
>
> _(Historical, captured 2026-06-03:)_ Parking-lot doc to resume from later.
>
> Context: the current "inventory" is hand-rolled — image-map regions write a
> `selected_item` string variable and element visibility is gated by conditions.
> That works but has sharp edges (one element per item, fragile string matching,
> the AND/OR condition bug we just fixed). An item registry formalizes this.

---

## 1. Why add an item registry

The engine already leans on **registries** as a core pattern: `project.variables`,
`project.characters`, `project.cgGallery.entries` — "define once, reference by id
everywhere." Items are the conspicuous gap; today they're *simulated* with string
variables + scattered conditions.

| Reason | What it fixes today |
|---|---|
| **Single source of truth** | An item like `key` lives as a magic string in a variable, a condition, and an image-map region — three places, easy to typo/desync. Define it once. |
| **Kills the "one element per item" explosion** | Inventory currently needs a hand-placed Interactive Image + region + visibility condition *per item*. A data-driven grid renders the whole inventory from the registry (how `CGGalleryGridElement` already renders the CG gallery). |
| **Quantities / stacking** | Variables model "have key" (boolean) clumsily and "3 potions" painfully. A registry holds counts natively. |
| **Richer metadata** | Name, description, icon, category, rarity, value, tags, "consumable?" — none of which a bare string carries. Enables tooltips, detail panels, sorting. |
| **Safer logic** | "Has item" / "item qty ≥ N" become first-class conditions instead of fragile string-matching that silently breaks. |
| **Authoring speed & fewer errors** | Item *dropdowns* in commands/conditions instead of free-typed strings. |
| **Unlocks standard mechanics** | Key-item gating, shops (buy/sell vs a currency variable), gifting/affection, crafting, collectibles/achievements. |
| **Localization-ready** | Item names/descriptions become content entries flowing through the same i18n pipeline. |
| **Clean save/load** | Inventory is one serializable map in player state, persists like variables already do. |

**Costs to weigh:** another manager UI to build/localize, another concept for authors
to learn, and risk of scope-creeping toward a full RPG system. Mitigation: keep it
**optional and VN-focused**, and let it *coexist* with the variable approach.

---

## 2. Author requirements / input (from this conversation)

These are explicit requirements from the project owner, to be honored in any design:

1. **Inventory grids must be fully customizable**, exactly like the Quick Menu buttons
   and dialogue box already are:
   - Fonts, **font color**, and **custom fonts uploaded via Settings** (the project
     font library).
   - Background color (and presumably background image, padding, borders, radius — match
     the existing element styling controls).
2. **Tooltip / item-detail panes must be customizable too** — same styling controls
   (fonts, colors, background, etc.).
3. **Screens selected as overlays should appear *over* the dialogue box** (z-order: an
   overlay screen renders above the in-game dialogue UI, not behind it).
4. **Situational control over screen flow** — give users explicit control over what
   happens:
   - when you **toggle a screen** (open/close behavior), and
   - when you **return to the game** from a screen.
   (i.e. configurable behaviors per screen / per transition, not one hardcoded rule.)

> These generalize beyond items: #1/#2 are about element + tooltip theming, #3/#4 are
> about screen layering and screen-flow control. Worth designing so the item system
> *consumes* these capabilities rather than reinventing them.

---

## 3. Data-model sketch (mirrors existing registries)

- **`project.items`** — registry of `ItemDefinition`:
  `id`, `name`, `description`, `icon` (asset ref), `category`, `stackable`, `maxStack`,
  `value`, `tags[]`, `consumable`, `useActions?: VNUIAction[]` (reuse the action
  system), `defaultOwned?`.
- **Runtime inventory** — lives in `playerState` beside `variables`:
  `inventory: Record<itemId, quantity>`, plus optional `selectedItemId` (formalizing the
  current `selected_item`). Serializes with saves automatically.

Deliberately rhymes with `CGGalleryConfig` (definition registry + state) so it fits the
engine's grain.

---

## 4. How items thread through each subsystem

### Scenes & Commands
- New command types paralleling existing ones: `GiveItem`, `RemoveItem`,
  `SetItemQuantity`, `ClearInventory`, optional `SelectItem` — each with an **item
  dropdown** (no magic strings).
- Branching: a `Choice` option or `BranchStart` gated on owning an item (e.g. a dialogue
  option that only appears if you have the locket).

### Screens (UI) — biggest payoff
- A first-class **Inventory Grid element** that auto-renders owned items from the
  registry (icon + quantity badge + tooltip), like `CGGalleryGridElement` does — no
  per-item hand placement. **Must be customizable per Author Requirement #1.**
- An **item detail / tooltip panel** bound to the selected item. **Customizable per
  Author Requirement #2.**
- **Use / Drop / Equip** buttons whose actions reference the selected item (fire the
  item's `useActions`).
- A **Shop screen**: list registry items, buy/sell against a currency variable.
- The existing image-map approach still works for *bespoke* layouts (a hand-drawn
  satchel) — but could populate from the registry instead of static regions.

### Logic (variables & conditionals)
- New condition operators: **"has item"**, **"item quantity ≥ / = / ≤ N"**, **"item is
  selected"** — selectable in the same `ConditionsEditor`, so they immediately inherit
  the new **AND/OR** combining (e.g. *has `key` OR has `lockpick`* → show "open door").
- New **UI button actions** (extending the `UIActionType` set that now includes Reset
  Variable / Play Sound): `GiveItem`, `RemoveItem`, `UseItem`, `SelectItem`. A clickable
  region or button can grant/consume an item.
- **Bridge to variables** (optional) for authors who think in variables: expose
  `count(item)` / "owns item" so numeric/boolean logic and text interpolation
  (`You have {potion_count} potions`) keep working.

---

## 5. Customization & theming (Author Requirements #1 + #2, expanded)

The Inventory Grid and the tooltip/detail pane should reuse the **same styling model**
already used by the dialogue box, name box, choice buttons, and Quick Menu:
- Font family (incl. **custom uploaded fonts** from the Settings → Fonts library),
  font size, weight, italic, **font color**, gradient/shadow/border (the `FontEditor`
  controls).
- Background color / image, opacity, border, border-radius, padding.
- Per-slot styling (icon size, quantity-badge style, selected/hover state).
- Tooltip pane: position, background, fonts/colors, show name + description.

**Design note:** rather than bespoke styling fields, the grid/tooltip should consume the
existing element-style + `FontEditor` infrastructure so it stays consistent and benefits
from future styling improvements automatically.

---

## 6. Overlay layering & screen-flow control (Author Requirements #3 + #4, expanded)

### Overlay screens above the dialogue box
- Today, screen z-order is managed via the screen stack / HUD stack and a `passThrough`
  flag. Requirement: a screen flagged/used as an **overlay** must render **above the
  in-game dialogue box** (and quick menu) so an inventory popup sits on top of dialogue,
  not behind it.
- Implies an explicit **layer/z-index concept per screen** (e.g. "overlay" vs "base"),
  and making the dialogue/quick-menu layer sit below overlay screens.

### Situational screen-flow control
- Per-screen (or per-action) configuration for:
  - **On toggle/open:** pause the scene? dim/blur the background? block input to the
    scene beneath? play a sound? freeze auto-advance/skip?
  - **On return to game (close):** resume where left off, advance, re-show dialogue,
    restore quick menu, run an action, etc.
- Generalizes the existing `ReturnToGame` / `ToggleScreen` / `ReturnToPreviousScreen`
  actions into **configurable behaviors** instead of one hardcoded rule.

> This is arguably a prerequisite for a good inventory UX (open inventory over dialogue,
> use an item, return cleanly) — and useful for *all* screens, not just items.

---

## 7. Suggested phasing

**MVP**
- `project.items` registry + Item Manager UI.
- `GiveItem` / `RemoveItem` commands.
- `GiveItem` / `UseItem` / `SelectItem` button actions.
- "has item" / "item quantity" conditions (inherit AND/OR automatically).
- One data-driven **Inventory Grid element** (customizable per §5).

**Later**
- Stacking limits, shops/currency, crafting, categories/filtering, drag-between-slots,
  gifting/affection, collectible achievements.

---

## 8. Open questions to settle before building

1. Stackable quantities, unique key-items only, or both?
2. Is there a "selected/equipped" concept, or just owned/used?
3. How much auto-rendered inventory UI vs. author-placed (image-map style)?
4. Do item counts need to be readable as variables (interpolation/legacy logic), or stay
   a separate system?
5. Migration: auto-convert existing `selected_item`-style setups, or offer the registry
   alongside and leave existing projects untouched?
6. Overlay layering: a new per-screen "layer" field, or infer from how the screen is
   invoked?

---

## 9. Connections to recent / existing work

- **Conditionals:** item conditions slot into the AND/OR `ConditionsEditor` — no new
  logic engine needed (`utils/conditionLogic.ts`, `connector` on `VNCondition`).
- **Actions:** `GiveItem`/`UseItem`/`SelectItem` follow the exact pattern just used for
  Reset Variable / Play Sound (enum in `types/shared.ts` → editor field in
  `ActionEditor`/`UIActionsListEditor` → `executeUIAction` branch in `LivePreview` →
  `npm run build:engine`).
- **Data-driven UI precedent:** `CGGalleryConfig` + `CGGalleryGridElement` is the closest
  existing analog for both the registry and the auto-rendered grid.
- **Styling precedent:** dialogue box / Quick Menu / `FontEditor` + Settings font library
  (Author Requirements #1/#2 reuse this).
- **Asset embedding:** item icons ride the existing packager (already embeds all images).
- **Localization:** item text joins the established `settings`/`ui`/`components`
  namespace pattern.

---

## 10. Note for next session

The owner flagged that this discussion **sparked another idea to tackle first** —
likely the **overlay-layering + screen-flow-control** capability (§6), since it's a
prerequisite for a good inventory UX and benefits all screens. Confirm what that idea is
before starting the item registry itself.
