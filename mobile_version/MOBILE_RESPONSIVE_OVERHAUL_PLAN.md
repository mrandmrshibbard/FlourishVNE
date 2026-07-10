# Mobile Responsive Overhaul — Flourish editor on phones

> STATUS: PARKED (approved direction, work not started). Brad chose a FULL responsive overhaul
> after testing the APK — "sizing is way off, nothing fits, long scroll through tabs".
> Resume by executing Phase 1 below, then rebuild the APK for on-device testing between phases.

## Context
The mobile app (`mobile_version/`, a full fork compiled into an Android WebView APK) renders the **unmodified desktop editor**: a two-pane shell (full-width content + an always-on right inspector sidebar) with 8 wrap-prone tabs, every "manager" tab a fixed-width **master-detail**, and the two canvas editors (Scene, UI-screens) multi-pane. On a ~360–430px phone nothing fits. Fixed widths (`min-w-[600px]` scene center, `w-72/w-80/w-64` list panes, 320px inspector) blow the layout **wider than the device**, which DEFEATS the existing `≤820px` media query that would have made the tab bar scroll — so the tabs WRAP into the long vertical stack Brad saw. **Mobile-fork ONLY** — desktop `src/` is untouched and these files are NOT mirrored back. Layout only → no schema change, save/load-safe.

## Reuse (don't reinvent) — found in the fork
- `src/utils/platform.ts` → **`IS_MOBILE`** (build-time `__MOBILE__`, ALWAYS true in the mobile app → drive the phone layout unconditionally, no fragile runtime width-detection) + `isTouchPrimary()`.
- `src/styles/mobile.css` (already imported by index.tsx) — touch targets, safe-areas, `≤820/≤560` overrides, tab `flex-wrap:nowrap;overflow-x:auto`, `main.flex-grow{overflow-x:auto}`. **EXTEND this**, keyed on a `.phone` class (not viewport width, which the blowout defeats).
- CSS vars `--inspector-width` / `--sidebar-width` / `--header-height` (index.css).
- **Canvas-fit primitive** (ResizeObserver + RAF + aspect letterbox): `StagingArea.tsx:311` and `menu-editor/MenuEditor.tsx:899` — already responsive; just needs its parent to fill the phone.
- `src/utils/responsiveManager.ts` (breakpoint service) or a tiny new `useIsPhone()` matchMedia hook.

## Strategy
Put a **`.phone` class on the root** (from `IS_MOBILE`). **First kill the width-blowout** (`html,body,#root{max-width:100vw;overflow-x:hidden}` + drop/relax the fixed widths) so the viewport stays = device width; everything below then behaves. Two reusable patterns cover most of it:
1. **Aux/inspector panes → bottom SHEET** (slide-up drawer), not a side column.
2. **Master-detail → DRILL-DOWN** (list full-width; tap an item → detail full-screen with a ← back).

## Phase 1 — Foundation + Shell  (biggest immediate win)
- NEW `src/hooks/useIsPhone.ts` (matchMedia `(max-width:768px)` / coarse-pointer; default true under `IS_MOBILE`). Add `phone` class to the VNE root (and `<html>`). `src/index.css`: global `max-width:100vw; overflow-x:hidden`.
- NEW `src/components/ui/MobileSheet.tsx` — bottom drawer (backdrop, drag/Esc to dismiss). Reused for the inspector + any aux pane.
- `VisualNovelEditor.tsx` (~557–688): on phone, REMOVE the right inspector column; render `renderInspector()` inside `<MobileSheet>` toggled by a header/FAB "Properties" button. Content = 100% width.
- `NavigationTabs.tsx` (~238): force single-row `flex-nowrap overflow-x-auto` under `.phone` (icon-first compact).
- `Header.tsx`: phone → icon-only Save/Play/Build/Undo/Redo; Tools dropdown + all modals clamp `width:min(92vw,…)`.
- **Gate:** rebuild APK → one scrollable tab row, full-width content, Properties as a sheet, zero horizontal page scroll.

## Phase 2 — Managers (master-detail → drill-down)
- NEW reusable `src/components/ui/MobileMasterDetail.tsx` (props: `list`, `detail`, `hasSelection`, `onBack`) OR a `.phone` CSS pattern + tiny per-manager wiring: phone + selection → DETAIL full-screen with ← back; else LIST full-width. Replace fixed list widths (`w-72/w-80/w-64`/`--sidebar-width`) with full-width on phone.
- Apply to: `CharacterManager`, `SystemsManager` (3-pane → systems→list→detail), `CommonEventsManager`, `VariableManager`, `AssetManager` (+ grid `grid-cols-2` on phone), `SettingsManager` (sections → drill-down).
- `CharacterEditorNew.tsx`: stack the `w-2/5` live-preview ABOVE the layers on phone.

## Phase 3 — Canvas editors (Scene + UI-screens)
- `SceneManager.tsx`: drop center `min-w-[600px]`; phone STACK — scene list + CommandPalette as sheets/drawers, `StagingArea` canvas (auto-fits once parent is full-width), command list below; `PropertiesInspector` → `MobileSheet`.
- `menu-editor/MenuEditor.tsx`: canvas full-width (auto-fits), add-element row horizontal-scroll, `UIElementInspector` → `MobileSheet`. (Canvas-fit primitives already size the stage; this is layout restructuring, no canvas-math changes.)

## Phase 4 — Polish
Touch targets ≥44px + input font ≥16px (some already in mobile.css), modal/dropdown widths, touch drag/resize sanity (ResizableDraggable/StagingArea already use pointer events — verify on-device), Test-Play fullscreen (already letterboxes), Asset grid density, FontEditor/ColorInput spacing.

## Critical files
- Foundation: NEW `src/hooks/useIsPhone.ts`, NEW `src/components/ui/MobileSheet.tsx`, NEW `src/components/ui/MobileMasterDetail.tsx`, EXTEND `src/styles/mobile.css`, `src/index.css`, reuse `src/utils/platform.ts`.
- Shell: `src/components/VisualNovelEditor.tsx`, `Header.tsx`, `NavigationTabs.tsx`.
- Managers: `CharacterManager.tsx`(+`CharacterEditorNew.tsx`), `SystemsManager.tsx`, `CommonEventsManager.tsx`, `VariableManager.tsx`, `AssetManager.tsx`, `SettingsManager.tsx`.
- Canvas: `SceneManager.tsx`, `SceneEditor.tsx`, `StagingArea.tsx` (parent-fit only), `menu-editor/MenuEditor.tsx`, inspectors (`UIElementInspector`/`PropertiesInspector`/`ScreenInspector`/`InteractiveElementInspectors` → render inside `MobileSheet` on phone).

## Build / safety
ALL edits in `mobile_version/` ONLY (do NOT mirror to desktop `src/` — this is intentional, permanent fork divergence). Editor-only → **no `build:engine`** unless an engine file is touched. Per phase: `npx tsc --noEmit` + `npm run build`, then `npm run android:build` + cached-toolchain `assembleDebug` (`scratchpad/build-mobile-apk.cjs`) → fresh APK. Additive/layout-only — no save/load risk.

## Delivery cadence
Execute **phase-by-phase**; after each phase rebuild the APK and Brad tests on-device before the next. Phase 1 (shell) alone makes the app navigable.

## Verification (per phase)
tsc + build green → rebuild APK (or test in a 390px-wide browser window). Check: tabs = one horizontally-scrollable row; no horizontal PAGE scroll; inspector opens as a bottom sheet; managers drill list→detail→back; Scene/UI canvases fit the screen; Test-Play runs fullscreen; open/save a `.flourish` round-trips unchanged.
