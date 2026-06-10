# Systems & RPG Mechanics — Architecture Roadmap

> **Status:** Plan / brainstorm only. Nothing implemented yet. Parking-lot doc to resume from.
> Captured 2026-06-08. Supersedes the inventory-specific [ITEM_REGISTRY_BRAINSTORM.md](ITEM_REGISTRY_BRAINSTORM.md),
> which becomes the **Inventory pilot** (§7) of the larger "Systems" framework described here.
>
> Context: the project owner submitted a large bucket list of dating-sim / RPG systems and
> proposed a **"Systems" hub** to house them. This doc reframes the whole list into a small
> set of reusable foundations packaged behind that hub, and lays out a phased build order.

---

## 1. Core insight

~20 distinct "systems" the owner asked for (inventory, skills, relationships, quests,
missions, clubs, gradebook, reputation, health, etc.) are the **same machine** underneath:

> a **registry of typed records** + a **runtime collection** + **data-bound UI** + **conditions/actions** that mutate them.

Build that machine once and each "system" is mostly **configuration + a screen**, not bespoke
code. Two creative asks (modular avatar, plant mini-game) need extra primitives (a layered
**compositor** and a **mini-game canvas**).

### The five foundations
| # | Foundation | Unlocks |
|---|---|---|
| **A** | Generic data registry + collections (generalize the Item Registry) | items, skills, relationships, quests, missions, clubs, reputation, equipment, gradebook |
| **B** | Data-bound UI widgets (grids, lists, bars/meters, detail panes) — extends the CG-Gallery grid + Screens element system | inventory grid, skill list, relationship roster, quest log, Map/Missions panels, dorm room |
| **C** | Screen-flow + overlay layering (prereq; see item-brainstorm §6) | every "button opens a panel over dialogue & returns cleanly"; variable-driven UI palette |
| **D** | Modular layered compositor (grayscale parts + palette dye + layer order + transforms) | avatar/clothing customization **and** the plant builder's dyed parts |
| **E** | Mini-game canvas (drag / snap / save / export) | plant assembly game; sports/hobby mini-games |

---

## 2. The "Systems" hub (the shell)

A **Systems** entry in the editor's top nav (owner's idea: a dropdown sitting by **Tools**)
opens a **Systems window**. Inside, the author sees available systems and clicks **+** to
create/enable one. Enabling a system is the master on-switch for a self-contained bundle.

**A "System" bundles:**
- **Data model** — its records + fields (Foundation A).
- **Commands** — e.g. `Give Item`, `Change Relationship` (appear in the Command Palette **only when active**).
- **Conditions & actions** — e.g. "has item", "affection ≥ 5" (appear in editors **only when active**).
- **Canvas layout** — the data-bound UI the player sees (Foundation B).
- **Runtime screen(s) + settings** — incl. a configurable **keyboard shortcut** to open/close.
- **Saved state** — runtime data persists in the save file like variables.

**Progressive disclosure is the point.** A new author never sees an Inventory command or a
Relationship property until they enable that system. This is the macro version of the
"keep it calm for non-coders, reveal on demand" philosophy already applied to variable
presets, plain-language conditions, and the action/condition accordions.

**Built-in templates + custom.** The hub lists **ready-made templates** (Inventory,
Relationships, Skills, Quests, Reputation, Clubs, School…) wired up out of the box, plus a
**"Custom System"** option for *"any other feature defined by the developer."* Templates
first; the generic custom builder comes later (and templates are effectively its presets).

---

## 3. Locked decisions (2026-06-08)

1. **Canvas:** start by **reusing the Screens canvas, scoped per-system**, with new data-bound
   element types (inventory grid, record list, meters). Only build bespoke canvas pieces if a
   specific system needs interactions Screens can't express ("decide per-system later").
2. **Dropdown:** **built-in templates first**; custom-system builder later.
3. **Pilot:** **Inventory** is the first end-to-end vertical slice that proves the whole shell.

---

## 4. Full ask → foundation/system → effort mapping

Effort key: ✅ possible today · 🔧 config on a foundation · 🆕 new primitive/system · 🧪 hard/bespoke

| Owner ask | Maps to | Effort | Notes / fallback |
|---|---|---|---|
| Map button | custom screen + button (GoToScreen/ToggleScreen) | ✅ | content of map may want B |
| Inventory button | Inventory system (A+B) + screen | 🆕 | the pilot |
| Missions button | Quests/Missions system (A+B) | 🔧 | a collection + log screen |
| Personalized image display | Show Image / image element bound to a variable | ✅/🔧 | live-asset work already done |
| "Any other feature dev defines" | **Custom System** in the hub | 🆕 | the thesis |
| Modular avatar / clothing / dyes / symbol swaps | Compositor (D) | 🆕 | builds on existing character **layers** + **tinting** + **CycleLayerAsset**; fallback: preset outfits |
| Plant-creation mini-game (assemble/save/export/damage) | Mini-game canvas (E) + D | 🧪 | store flower as **data (list of dyed parts)** → desk/inventory/"loses petals" fall out free; fallback: preset arrangements of assigned parts |
| UI palette by condition/variable | screen theming + variable binding | 🔧 | small extension; verify current theming reach |
| Item/inventory management (containers, grid/volume, stacking penalties) | Inventory system, later sub-phases | 🔧 | on top of A |
| Kits / wipe inventory on event / restore standard kit / starting kits | Inventory commands (ClearInventory, GiveKit) | 🔧 | |
| Equipment w/ stats (equip/unequip) | Inventory + Stats | 🔧 | item fields + equip slots |
| Relationships (friend/rival/romance/business/scholastic/politics) | Relationships system | 🔧 | collection of character records w/ numeric fields |
| Mental health / physical health | Stats (number records + meters) | 🔧/✅ | prototype with variables + live meters now |
| Support accommodations (IC) | narrative + variables | ✅ | |
| Accessibility (OOC, e.g. colorblind mode) | Settings/theming | 🔧 | engine-wide setting |
| Skills system | Skills system (collection) | 🔧 | levels/xp as record fields |
| Professional / job development | Skills/Reputation collections | 🔧 | |
| Reputation system | Stats/Reputation collection | 🔧 | per-faction numbers |
| Quest system | Quests system (collection + states) | 🔧 | states: available/active/done |
| Gifting & mail | Inventory + Relationships + a mailbox collection | 🔧 | |
| Sports (practice, campus games, awards, health effects) | Stats + mini-games (E) + quests | 🧪 | mini-games bespoke; rest is config |
| Personal activities (games/hobbies/crafts) | mini-games (E) / Skills | 🧪 | reusable mini-game templates |
| School (classes, attendance, homework, tests, grading) | School system (collections + gradebook screen) | 🔧 | scheduling is the tricky bit |
| Clubs (join/create, living ecosystem) | Clubs system (collection) | 🔧/🧪 | "ecosystem" sim is the hard part |
| Dorm room accumulating story items over time | screen w/ data-bound conditional elements (A+B+C) | 🔧 | narrative mirror |

---

## 5. Phased roadmap

- **Phase 0 — Screen-flow + overlay layering (C).** Per-screen open/close behavior (pause
  scene, dim background, block input, return cleanly) + overlay screens render above the
  dialogue box + variable-driven palette. Prereq for every panel. (See item-brainstorm §6.)
- **Phase 1 — Systems shell + Inventory pilot (vertical slice).** Build the hub, the
  enable/+create flow, progressive-disclosure plumbing (gated commands/conditions/actions),
  the scoped Screens canvas with the first data-bound elements, and the Inventory system
  end-to-end (see §7). Proves the whole pattern.
- **Phase 2 — Generalize to more systems + widgets (A+B).** Relationships, Skills, Quests,
  Reputation, School, Clubs, Stats (health) as templates riding the same rails. Mostly
  authoring, not engineering. Add the **Custom System** builder here.
- **Phase 3 — Modular compositor (D).** Avatar/clothing customization screen; reuse for the
  plant's dyed parts.
- **Phase 4 — Mini-game canvas (E).** Plant builder; sports/hobby mini-games.
- **Cross-cutting (anytime):** prototype Stats (health/reputation/skills) as number variables
  + live meters today; accessibility/theming settings; dorm-room screen once A+B+C exist.

---

## 6. Systems-shell architecture sketch (for Phase 1)

- **`project.systems`** — registry of enabled systems: `{ id, type (template id | 'custom'),
  name, config, dataModel, screenIds[], settings (hotkeys, open/close behavior) }`. Additive-optional.
- **Runtime state** — each system's live data in `playerState` (e.g. `inventory: Record<itemId, qty>`),
  serialized with saves like variables.
- **Disclosure plumbing** — Command Palette filters command types by active systems; inspector
  groups + element palette gate their system-specific entries the same way. Mirrors the existing
  `isCommandGrouped` / inspector-group taxonomy.
- **Scoped canvas** — reuse the Screens/UIManager canvas; present a per-system view; register the
  system's data-bound element types into the palette only when active.
- **Relationship to Plugins** — Systems are the **no-code, data-driven cousin** of the existing
  plugin system. **Open question:** share registration plumbing or stay separate?

---

## 7. Inventory pilot (Phase 1 concrete slice)

From [ITEM_REGISTRY_BRAINSTORM.md](ITEM_REGISTRY_BRAINSTORM.md) — its MVP becomes the pilot:
- `project.items` registry + Item Manager (now: an **Inventory system** created from the hub).
- Commands: `GiveItem`, `RemoveItem` (+ later `SetItemQuantity`, `ClearInventory`, `GiveKit`).
- Actions: `GiveItem`, `UseItem`, `SelectItem` (extend `UIActionType`, run through the
  ActionEditor/ActionCard → executeUIAction → `build:engine` pipeline).
- Conditions: "has item", "item quantity ≥/=/≤ N" (inherit the AND/OR ConditionsEditor + the
  new collapsible accordions automatically).
- One data-driven **Inventory Grid** element + an item **detail/tooltip pane**, both consuming
  the existing element-style + FontEditor infra (owner reqs #1/#2 in the item brainstorm).
- Runtime: opens as an overlay screen (needs Phase 0) with a configurable hotkey.

---

## 8. Honest hard-parts + fallbacks

- **Avatar (D):** more feasible than it looks — Flourish already composites layered characters,
  tints assets (the grayscale-dye model), and has `CycleLayerAsset` for conditional swaps (House
  symbol, scarf, earring). The new work is exposing layers to the **player** via a customization
  screen + binding to the per-arrival palette. Fallback: preset outfits.
- **Plant mini-game (E):** drag/snap/assemble/**export image**/dynamic damage is genuinely new.
  Key design choice that makes the downstream magic free: **store the flower as data** (an ordered
  list of placed, dyed parts) not a flat image — then "shown on desk / in inventory / loses petals
  when injured" are just re-renders. Fallback: assemble assigned parts into a few preset
  arrangements (still dyed, still dynamic).
- **"Living ecosystem" clubs / sports sims:** the simulation depth is the cost, not the data.
  Start with static state + scripted events; simulate later.

---

## 9. Open questions to settle before building

1. **Disclosure plumbing**: a generic "active systems → which commands/conditions/actions/elements
   show" registry, or hand-wired per system? (Generic is the long-term win.)
2. **Systems vs Plugins**: shared registration, or separate concepts?
3. **Multiplicity**: multiple bags/containers = system *instances*, or sub-collections inside one
   Inventory system? (Lean: one system, multiple collections inside.)
4. **Stats as variables**: do system numbers (health/reputation) double as readable variables for
   interpolation/legacy logic, or stay a separate store with a bridge? (Item-brainstorm Q4.)
5. **Save/load migration**: enable systems alongside existing projects untouched (yes — additive-optional, honor the hard rule).
6. **Custom System builder scope**: how much can authors define (fields, screens, commands) without code?

---

## 10. Connections to existing work

- **Registries precedent:** `project.variables`, `project.characters`, `cgGallery.entries`,
  and the planned `project.items` — Systems formalize "define once, reference by id."
- **Data-driven UI precedent:** `CGGalleryConfig` + `CGGalleryGridElement`.
- **Conditions/actions:** slot into the AND/OR `ConditionsEditor` + `ActionEditor`/`ActionCard`
  (collapsible) — no new logic engine.
- **Screen system / layering / theming:** the scoped canvas + overlay layering reuse it.
- **Plugins / Common Events / Scripting:** see [SCRIPTING_PLUGINS_COMMONEVENTS_PLAN.md](SCRIPTING_PLUGINS_COMMONEVENTS_PLAN.md) — decide the Systems↔Plugins relationship.
- **Hard rule:** never break save/load — everything additive-optional + MigrationService if a
  schema ever changes.
