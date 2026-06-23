# Layering & Parallax — Design Doc

Status: **agreed design, not yet implemented.** Next big-rock after the Properties Inspector
revamp. Builds on the Transform inspector group (which was created with "future layer /
parallax depth" in mind) and the additive-optional save/load rule
(see `feedback_never_break_saveload` / MigrationService).

---

## 1. Problem

There is **no per-item z-order anywhere** in the engine today, on either surface:

- **Scenes** stack by fixed *type bands* + insertion order. Front-to-back (from
  `LivePreview.tsx`): background (0) → movie overlays (z2) → characters (z5) → hot spots
  (z8) → image/text/button overlays (DOM order, no z-index) → system UI: dialogue (z20),
  namebox (z21), quick menu (25/50), screen overlay FX (z40), confirm dialog (9998).
  Within a type it's purely command order.
- **Screens** render `Object.values(screen.elements)` in **insertion order**, no z-index
  (`UIScreenRenderer` in `LivePreview.tsx`; editor in `menu-editor/MenuEditor.tsx`).

Consequences the author hits: a character can't be moved in front of an image, an image
can't go behind a character, two screen elements only overlap in creation order — and
there is no control to change any of it.

Separately, there's no parallax/depth. Mouse position is already tracked by the drag
system, and each visual has exactly **one** CSS-transform construction site, so both
features have clean injection points.

---

## 2. Layering

### Data model (additive-optional)
- Add `layer?: number` to every scene visual command (`ShowImage`, `ShowCharacter`,
  `ShowText`, `ShowButton`, `PlayMovie`, hot spots, image maps) and to `BaseUIElement`
  (`features/ui/types.ts`). Higher = nearer the viewer.
- `undefined` ⇒ fall back to today's behavior. **No migration needed.**

### Unified stage stacking (the core change)
Replace the hardcoded per-type z-bands for *stage content* with **one shared stacking
context**: collect all stage visuals, sort by `(layer ?? typeDefault, insertionIndex)`,
and emit `style={{ zIndex }}` per item (or render in sorted order). This is what allows
reordering **across** types (character in front of image, etc.).

- **Defaults must reproduce today's look exactly.** Seed each type's default layer to match
  the current bands so existing projects are pixel-identical until the author changes
  something. Suggested default bands (leave head-room between them):
  `movies 100 · characters 200 · images/text/buttons 300`, insertion index as tiebreak.
- **System UI stays above and untouched**: dialogue (z20+), quick menu, screen overlay FX,
  confirm dialog keep their existing high bands. The author layer space lives *below* the
  dialogue band (i.e., it controls stage content only). Clamp author layer so it can't
  punch through the dialogue/HUD bands.

### Inspector UX (Transform group, both inspectors)
- A **Layer** number field in the Transform group of `CommandGroupFields` (scenes) and
  `ElementGroupFields` (screens).
- **Bring to Front / Send to Back / Forward / Backward** buttons that compute the number
  relative to siblings (no z-number math for the author). Front = max(siblings)+1, etc.
- (Optional later) drag-to-reorder in the command stack / element tree mapped to `layer`.

---

## 3. Parallax

### Data model (additive-optional)
- Per-element `parallaxDepth?: number` (slider, 0 = locked to camera, higher = moves more).
  Composes **independently** with `layer`. On scene visuals + `BaseUIElement`.
- Per-**scene** and per-**screen** parallax settings object:
  `parallax?: { mode: 'off' | 'mouse' | 'camera' | 'both'; intensity?: number }`.
  `mode` is the author's choice of driver; `intensity` is a global multiplier.
  Absent ⇒ off (today's behavior).

### Drivers (author-selectable per scene/screen)
- **Mouse-follow** (ships first): a `ParallaxProvider` tracks the normalized pointer offset
  from stage center (−1…1) on a single `requestAnimationFrame` loop, easing toward the
  target (no jitter). Each visual reads its `parallaxDepth` and composes
  `translate(offsetX · depth · intensity, offsetY · depth · intensity)` onto its transform.
- **Camera (pan/zoom)**: during `PanZoomScreen` camera moves, shift each visual by
  `cameraDelta · depth`. Hooks into the existing pan/zoom transform. Can land after mouse.
- **Both**: sum the two offsets.

### Rendering
- **Render-time offset only** — never written back to stored x/y. Editing positions stays
  clean.
- Inject the translate at each visual's single transform site (approx, in `LivePreview.tsx`):
  characters (~7680–7700), text overlays (~314–355), image overlays (~685/704), button
  overlays (~481), screen elements (~2738–2750). Append the parallax translate so it
  composes with existing rotation/scale/slide.
- **Editor canvas** stays static, with a **"Preview parallax"** toggle so positioning isn't
  fighting the effect.
- Respect `prefers-reduced-motion` and a global off switch.

### Gotchas to design around
- **Background overscan**: mouse parallax can reveal a background's edge — render
  parallaxed backgrounds slightly oversized (or document a safe margin).
- **Transform composition**: always append the parallax translate; never replace existing
  transforms.
- **Performance**: one shared rAF loop + GPU `transform`; throttle; skip when `mode==='off'`.

---

## 4. Save/load safety

All new fields are additive-optional (`layer?`, `parallaxDepth?`, scene/screen `parallax?`).
Old projects load with them `undefined` ⇒ identical behavior; export deep-clones as-is; **no
migration required**. The layering change touches the **runtime stage renderer**, so it
needs `npm run build:engine` and a "looks pixel-identical by default" verification on a
pre-existing project.

---

## 5. Phasing

1. **Phase 1 — Layering** (fixes the actual overlap pain): `layer?` field; unified stage
   stacking with order-preserving defaults; Transform-group number + Front/Back/Forward/
   Backward for scenes **and** screens. `build:engine` + identical-by-default check.
2. **Phase 2 — Mouse parallax**: `parallaxDepth?` + scene/screen `parallax` settings;
   `ParallaxProvider` (pointer tracking, eased rAF); transform injection at each site;
   editor "Preview parallax" toggle; reduced-motion.
3. **Phase 3 — Camera parallax**: tie depth into `PanZoomScreen` camera moves; `mode`
   `camera`/`both`.

---

## 6. Decisions locked (2026-06-05)

- Layer UX: **number + Front/Back/Forward/Backward buttons** (in Transform group).
- Parallax depth: **per-element** slider (composes with layer).
- Parallax driver: **author-selectable** per scene/screen — Off / Mouse / Camera / Both.
- Scope: **scenes and screens** (cursor-following title screens included).
