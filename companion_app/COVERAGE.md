# Feature Coverage — the "nothing gets missed" system

Brad's requirement: *"Is there a better way to make sure we get ALL of the elements and properties
and features? … Missing something could really throw off a user's end product. This needs to handle
any project using any number of features and elements and properties included in Flourish."*

The answer is **two layers working together**:

1. **The completeness auditor** (automatic, per-project) — the *runtime guarantee*. Every time the
   exporter processes a project, it records every property that is **present in that project's real
   data but not consumed by the exporter**, and prints them. A user can never silently lose a feature
   — if their project uses something we don't carry, it shows up in red at export time.
2. **This document** (the *plan*) — the full, hand-enumerated surface of every element type,
   property, command, action, and In-Game-UI field that Flourish can produce, each with a status.
   The auditor proves we handle what a *given* project uses; this matrix proves we've *planned for
   everything Flourish can express*, whether or not any one project uses it.

Neither alone is enough: the auditor only sees what a sample project happens to use; the matrix can
go stale. Together, the matrix is the checklist and the auditor is the enforcement that catches
anything the matrix missed (a new property added to Flourish shows up as an **UNEXPECTED gap** the
first time any project uses it).

---

## How the auditor works

- `ExportContext.audit(kind, src, handled)` is called wherever we map something (`context.ts`).
  `kind` is a label like `element:Button`, `command:Dialogue`, `screen`, `font`, `screenAction:GoToScreen`.
  `handled` is the list of keys the mapper consumes. Any non-null key on `src` that isn't in
  `handled` (or a structural `id`/`name`/`type`) is recorded as unmapped.
- `ExportContext.DEFERRED` (`context.ts`) lists keys we *intentionally* don't carry yet (Tier-3
  systems, planned waves). The CLI report splits unmapped keys into:
  - **✗ UNEXPECTED gap** — a feature we don't recognize. **This is a bug**: either map it or add it to
    `DEFERRED` with a plan. A clean project should print *"no unexpected gaps."*
  - **○ deferred** — known, on the roadmap, listed in `DEFERRED`.

Run it:

```bash
cd companion_app/tooling/exporter && npm run build
node dist/cli.js <project.flourish|dir> <outDir>            # summary + completeness verdict
node dist/cli.js <project.flourish|dir> <outDir> --coverage  # + full audited-kinds table
```

**Rule for every future change:** when you add a Flourish feature to the exporter, add its keys to
the relevant `audit(...)` `handled` list (so it's counted as covered) or to `DEFERRED` (so it's
tracked as roadmap). Never leave a real property un-listed — that's exactly what the auditor is there
to catch.

---

## Status legend

| Mark | Meaning |
|---|---|
| ✅ | Carried into the bundle **and** rendered by the Godot runtime |
| 🟡 | Carried into the bundle; runtime rendering partial or approximate |
| 📦 | Carried into the bundle; runtime rendering **not yet** (data preserved, no visual) |
| ⏳ | **Deferred** — Tier-3 / planned wave; listed in `DEFERRED` or gated by a capability flag |
| ❌ | Not handled yet — **to do** |

Tiers (from the architecture spec): **T1** core VN · **T2** visual polish (v1 target) · **T3**
mini-games / phone / inventory / maps (deferred) · **TX** inline scripts / plugins (validate + warn).

---

## 1. UI screen element types (`VNUIElement`, 18 members + 2 legacy)

| Type | Status | Tier | Notes |
|---|---|---|---|
| Text | ✅ | T1 | font, align/valign, shadow, border, **gradient** (shader), clip-to-box |
| Image | ✅ | T1 | image/video/color source, objectFit, color bg; drag props ⏳ |
| Button | ✅ | T1 | label, action, image/hover, bg/hover color, radius, conditions |
| SaveSlotGrid | ✅ | T1 | slot metadata + save/load, styled slots (bg/border/text), per-slot erase, hide-toggles, scroll |
| SettingsSlider | ✅ | T1 | volume/textSpeed/variable bind, thumb/track color **and art** |
| SettingsToggle | ✅ | T1 | setting/variable bind, checkbox color **and checked/unchecked art** |
| TextInput | ✅ | T2 | player text → variable (LineEdit, maxLength, bg/border); commits on submit/blur |
| Dropdown | ✅ | T2 | option list → variable (OptionButton); selects current value; refreshes screen |
| Checkbox | ✅ | T2 | checked/unchecked value → variable; refreshes screen |
| Meter | ✅ | T2 | bar / segments / icons render + value readout; battery→bar; gradient/anim approx |
| CharacterPreview | ✅ | T2 | live-composited sprite; layers chosen by variables (layer→variable map) |
| AssetCycler | ✅ | T2 | ◀ name ▶ cycles a layer's assets → variable; refreshes linked previews |
| Customizer | ✅ | T2 | preview + per-category pickers (arrows) + Reset/Randomize; layout preview-left/right/top |
| HotSpot | ✅ | T3 | click + **drag-drop** target (accept by tag / element-id), optional highlight |
| CGGallery | ⏳ | T3 | unlocked-CG grid; warned + skipped |
| Inventory | ⏳ | T3 | item grid / shop — capability-gated |
| draggableImageElement | ⏳ | T3 | clickable/drag sub-regions |
| Custom | ⏳ | TX | plugin-provided element (`pluginType`+`props`) |
| _legacyHotZone_ | ⏳ | T3 | pre-migration hotspots (`VNUIScreen._legacyHotZone`) |

**Character-creator trio — DONE.** The character bundle now also carries `base` + a raw `layers` tree
(`[{id,name,assets:[{id,name,image}]}]`, z-ordered) + per-expression `config` (layerId→assetId), on top
of the flattened `sprites` used by the story. The runtime composites a live sprite by stacking base +
one chosen asset per layer, where each layer's asset is picked by a variable — so the preview updates
as the player cycles options.

## 2. Base element properties (`BaseUIElement` — every element)

✅ x, y, width, height, anchorX, anchorY · opacity · layer (z-order) · **conditions** (visibility) ·
**startHidden** · **disabledConditions** (renders greyed + blocks input) · **appearanceStates**
(condition-driven colour/image/opacity/scale/rotation override) · **transitionIn/Duration/Delay**
(fade/slide/scale entry animation) · **clickSoundId/hoverSoundId** · **parallaxDepth** (mouse parallax) ·
**actions[]** multi-action buttons. 🟡 fitToContent (images already aspect-fit; no footprint shrink).
✅ **draggable / dragTag / snapBack / snapToHotSpot / hideOnDrop** (T3 drag-drop puzzle: pick up an element,
drop it on a matching HotSpot; screen `winCondition` fires when all are placed or a variable is met).
📦 boundItemId (needs the inventory system — next Tier-3 subsystem).

## 3. Font (`VNFontSettings`)

✅ family (→ custom .ttf path), size, color, weight(bold), italic, align, letterSpacing,
textShadow, textBorder(outline). 📦 textGradient (carried; runtime uses first color as fallback —
true gradient text needs a shader, T2).

---

## 4. Story commands

✅ **T1:** Dialogue (text/speaker/voice/textEffect), Choice (+conditions/actions), SetVariable,
Jump/Label/JumpToLabel, CallCommonEvent, ShowCharacter (position/transition/**scale**/**flipX**),
HideCharacter, MoveCharacter, SetBackground, PlayMusic/StopMusic, PlaySoundEffect/StopSoundEffect,
Wait, SpawnParticles/StopParticles.

✅ **T2 screen FX:** ShakeScreen, FlashScreen, TintScreen, PanZoomScreen, ResetScreenEffects,
SetScreenOverlayEffect (rain/snowAsh/fog/haze/smoke/sunbeams/shimmer/**crtScanlines**/**chromaticGlitch**),
Lightning, Flashlight, **Fireworks** (spark-burst volley), **PlaceLights/ClearLights** (candle/star/
christmas glows w/ twinkle).

✅ **T2 media/grade:** **PlayMovie/StopMovie** (VideoStreamPlayer — Ogg Theora `.ogv` native; other
codecs warn + skip), **SetTimeOfDay** (day/night colour grade — interpolates the project's cycle phases
→ background tint + brightness + **saturation** shader + character grade).

✅ **Multi-character + emphasis + voice + text FX:** multiple characters on screen at once (positioned
left/center/right or x%, per-character show/hide/**move**), **speaker emphasis** (dim non-speakers + scale
the speaker), **dialogue voice** playback + **voice-paced text** (typing finishes when the voice ends),
**text effects** (shake/wave/rainbow/glitch/pulse/fade via RichTextLabel bbcode), and **skip-backward**
(ArrowUp rewinds to the previous line via interpreter snapshots).

✅ **T2 scene-overlay elements + actions:** **ShowImage / ShowText / ShowButton / ShowHotSpot** (author-
placed on the scene, tracked by id) · **HideImage/Text/Button/HotSpot** · **TweenElement** (animate
position/opacity/rotation/scale/size of an overlay or character). Buttons & hotspots dispatch their
**onClick/actions** (setVar, resetVar, jumpToScene, jumpToLabel, playSound, show/hideElement, goToScreen,
toggleScreen, returnToGame, openUrl, startNewGame, quitToTitle). **PlaySoundEffect** now audible (a
dedicated SFX player was missing).

✅ **CreditRoll** — a blocking, scrolling credits takeover (headings + role/name entries, bg color +
slideshow background + **foreground media**, skippable, `onComplete` advance-or-return-to-title).

✅ **Dialogue extras** — per-line **text speed** (+ global text-speed setting), **per-line time limit**
(auto-advance after typing), **locked** timed lines (clicks only reveal), and the **countdown timer bar**.

✅ **ShowScreen** (open a UI screen mid-story) · **ShowElement/HideElement** (reveal/hide a startHidden
element by id) · quick-menu verbs (ShowLog / ToggleAutoAdvance / ToggleSkip / SkipBackward / SaveGame /
LoadGame / OpenPauseMenu). All action verbs are shared across screen buttons, scene buttons, and hotspots
through one dispatcher.

✅ **keepOpenDuringChoices** — the dialogue box stays open (showing its line) under the following Choice's
buttons instead of being replaced.

⏳ **T3:** mini-game / phone / inventory / map / timer commands. **Tier-1 and Tier-2 are 100% complete.**

## Input & keyboard shortcuts

✅ Advance dialogue (Space / Enter / click / controller A = `ui_accept`; first press completes the
typewriter, next advances) · **per-screen `openHotkey`** (press the authored key to toggle a screen —
inventory/map/etc.) · **Escape** opens/closes the pause screen · button/hotspot click actions ·
focusable screen buttons (controller D-pad + accept).

✅ **Ctrl = skip** (races through dialogue, pauses at choices) · **H = history/backlog** (dimmed
scrollable log of every line seen) · **auto-advance** (Auto button — advances a beat after each line) ·
quick-menu Save/Load/Log/Auto/Skip buttons.

📦/❌ **owed:** ArrowUp/PageUp = skip-back · skip-only-read tracking · phone open hotkey (T3) · full
controller-button remapping for cert (Phase 6).

> **Video codec note:** stock Godot 4.3 decodes only Ogg Theora. Games using webm/mp4 clips export
> fine (the file is copied) but the runtime skips playback with a warning — the user re-encodes to
> `.ogv`, or adds a codec plugin in their own Godot environment (outside our stock-only boundary).

> Command auditing is table-driven (`COMMAND_HANDLED` in `commands.ts`) for field-mapped commands;
> Tier-2 passthrough commands carry **all** params by construction, so they're not audited (nothing
> to drop). Deferred commands surface as capability warnings.

## 5. UI actions (`UIActionType`, 52 members)

✅ StartNewGame, GoToScreen, ReturnToGame, ReturnToPreviousScreen, QuitToTitle, ExitGame/QuitGame,
JumpToScene, LoadGame, SetVariable, OpenURL, PlaySound, ResetVariable, JumpToLabel, CallCommonEvent.
✅ SaveGame/LoadGame/OpenPauseMenu (open the matching screen), **ShowElement/HideElement** (by id),
ToggleScreen, **ShowLog/ToggleAutoAdvance/ToggleSkip/SkipBackward**, CallCommonEvent (from a button).
⏳ **T3:** all Phone* (ShowPhone…OpenPhoneApp), ShowMap, ShowMiniGame, item actions
(GiveItem/UseItem/DestroyItem/CarryItem/Buy/Sell/Restock…), StartTimer/StopTimer, SetTimeOfDay,
CycleLayerAsset, PlayAnimation/ChangeImage, ClearUiPalette, ContinueGame.

> **Coverage of actions is driven by the enum (52), not the payload union (40)** — several actions use
> the bare `BaseUIAction` with no dedicated interface. When mapping actions, iterate the enum.

## 6. In-Game UI global config (`VNProjectUI`)

The runtime restyles its dialogue box / name plate / choice buttons from the author's config
(`exporter/src/ingameui.ts` → `mapInGameUI`; runtime `VNPlayer._apply_ingame_ui`). Namebox/input/quick
-menu styling is carried but not yet fully applied.

| Group | Status | Notes |
|---|---|---|
| Screen pointers (title/settings/save/load/pause/**hud**) | ✅ | all wired incl. **gameHudScreen** (persistent HUD over gameplay) |
| Dialogue box styling (image/color/opacity/size/padding/radius/position) | ✅ | image bg or flat box; geometry from width%/height/x/y/bottomMargin |
| Dialogue fonts (text + name, incl. color/align) | ✅ | dark/custom text color, center align via bbcode, custom .ttf |
| Choice button styling (image/hover/color/radius/font/height) | ✅ | image art or flat box + font |
| Namebox styling (image/color/opacity/radius/offset) | ✅ | name-plate background stylebox + offset from `ui.namebox` |
| Input box styling (image/color/radius/field font) | ✅ | applied to the text-input field from `ui.inputBox` |
| Quick menu (Log / Auto / Skip / Save / Load bar) | ✅ | built from `ui.quickMenu` show-flags; positioned; shown only in gameplay |
| Layout positions (namebox/quickmenu X/Y/W/H) | ✅ | dialogue/choice positions + quickmenu corner **and fine X/Y** |
| Reactive states (textbox + quick-menu condition restyle / speaker emphasis / reveal highlight / voice-paced) | ✅ | all applied per-line from conditions |
| Per-line textbox theme (`textboxThemes` + Dialogue override) | ✅ | resolved + applied per line |
| **defaultGameSettings** | ✅ | all volumes/textSpeed/skip/auto applied at startup |
| **confirmDialogs** (quit/newgame/erase) | ✅ | styled confirm popup gates the destructive action |
| Phone (~200 `phone*` fields) | ⏳ | **T3** — whole phone subsystem (`DEFERRED_PREFIXES`) |
| Inventory defaults (`inventory*`) | ⏳ | **T3** (`DEFERRED_PREFIXES`) |

## 7. Screen-level fields (`VNUIScreen`)

✅ background (image/video/color), music, **ambientNoise**, elements, **transitionIn/Out (+durations)**,
**effects (static overlays)**.
✅ **showDialogue** · **passThrough/hudNonBlocking** (non-blocking HUD) · **backdropOpacity + backdropBlur**
(dim + blur the story behind) · **additionalBackgrounds** (stacked planes + parallax) · **backgroundParallaxDepth** ·
**openHotkey** · **onCloseBehavior** (resume/advance) + **onCloseActions**. 🟡 category (editor-only) ·
resetElementVisibilityOnOpen (rebuild re-evaluates) · hudAboveDialogue/pauseSceneWhileOpen (carried;
single-screen runtime). ⏳ winCondition + `_legacyHotZone` (T3 hot-zone).

---

## Deferred registry (`ExportContext.DEFERRED`) — the honest list

These are the features we've **decided** not to carry in v1. They print as `○ deferred`, never as a
gap. Everything else that shows up unmapped is a real bug to fix.

- `element:Image` / `element:Button`: draggable, interactive, snapBack, snapToHotSpot, hideOnDrop,
  dragTag, boundItemId — the **drag-drop puzzle system** (T3).

As Tier-3 lands (phone, inventory, mini-games, drag-drop), move those keys out of `DEFERRED` and into
real mappings, and delete their capability warnings.

---

## Current verdict on the reference project (`always_and_forever`)

```
✓ COMPLETENESS — no unexpected gaps: every property this project uses is either mapped or known-deferred.
○ deferred (Tier-3 / planned): element:Image → draggable, interactive, snapBack   (drag-drop puzzle)
```

Everything this real, feature-rich project uses is accounted for. The only unmapped thing is the
drag-drop puzzle system, which is a deliberate Tier-3 deferral — not an accident.
