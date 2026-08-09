# FlourishVNE v2.2.0 — Codebase Audit & Visual Novel Maker Comparison

> Generated from a comprehensive audit of all source files across 20+ components.

---

## Part 1: Current Feature Inventory

### Project Management
- `.flourish` JSON project format (packaged via JSZip)
- Export/import with file-association double-click open
- Recent projects list (last 5, persisted in localStorage)
- IndexedDB auto-save with crash recovery
- Dirty tracking with exit warnings
- Electron quit intercept for clean shutdown
- Project metadata: ID, title, description, author, version, engineVersion

### Scene System (37 Command Types)
| Category | Commands |
|----------|----------|
| **Story** | Dialogue, Choice, Label, Jump, JumpToLabel |
| **Characters** | ShowCharacter, HideCharacter |
| **Scenes** | SetBackground |
| **Audio** | PlayMusic, StopMusic, PlaySoundEffect, StopSoundEffect |
| **Variables** | SetVariable, TextInput |
| **Screen FX** | ShakeScreen, TintScreen, PanZoomScreen, FlashScreen, SetScreenOverlayEffect, ResetScreenEffects |
| **UI Elements** | ShowText, HideText, ShowImage, HideImage, ShowButton, HideButton, ShowScreen |
| **Media** | PlayMovie, StopMovie, CreditRoll |
| **Flow** | BranchStart, BranchEnd, Wait, Group |
| **Scripting** | RunScript |

**Command features:** drag-and-drop reorder, multi-select (Click/Shift/Ctrl), copy/paste, delete, per-command conditions (10 operators), async execution flag, command stacking (parallel grouping), collapsible branches, visual-only groups.

### Character System
- Multi-layer sprite system (each layer = named asset, image or video)
- Named expressions mapping layers → asset selections
- Custom fonts per character (family, URL, size, weight, italic)
- Base layer (image/video with video loop support)
- Character Editor with Expressions, Layers, Style tabs
- Show/Hide with transitions (fade, dissolve, slide, iris-in, wipe-right, instant, cross-fade)
- 7 position presets + custom X,Y% positioning
- Configurable slide start/end positions for enter/exit animations

### Dialogue & Choices
- Speaker (character or Narrator)
- Variable interpolation via `{variableName}` syntax
- Typewriter effect with configurable speed (1-100)
- Click-to-advance
- Multiple-choice with conditions per option
- Full UI action support per choice (14 action types)
- Multiple actions per choice option (sequential execution)
- Customizable TextInput with styling (input box image, border image, padding, fonts)

### Visual Effects
- ShakeScreen (duration + intensity)
- TintScreen (color overlay + duration)
- PanZoomScreen (zoom + pan X/Y + duration — camera movement)
- FlashScreen (color + duration)
- 6 overlay effect types: CRT Scanlines, Chromatic Glitch, Sunbeams, Shimmer, Rain, Snow/Ash
- Universal effect parameters: intensity, speed, blendMode, color, duration
- Scene transitions: fade, dissolve, iris-out, wipe-right, slide-left, instant
- Asset transitions: fade, dissolve, slide, iris-in, wipe-right, instant, cross-fade
- Live transition preview in the inspector

### Audio System
- 3 independent channels: Music, SFX, Ambient
- PlayMusic with loop, fade-in, per-command volume override
- StopMusic with fade-out duration
- PlaySoundEffect / StopSoundEffect
- Supported formats: MP3, WAV, OGG, M4A, FLAC, AAC, WMA
- Hub music player (dockable/pop-out/draggable mini-player)

### Video / Movie System
- Fullscreen or overlay display modes
- Positioning: X, Y, Width, Height (0-100%)
- Object fit: cover, contain, fill, custom
- Looping, opacity, wait-for-completion options
- Supported formats: MP4, WebM, MOV, AVI, MKV

### Variable / Logic System
- Types: String, Number, Boolean
- Scopes: Local (per-scene), Global (per-playthrough), Persistent (cross-session)
- Operators: set, add, subtract, random (min/max range)
- 10 condition operators: ==, !=, >, <, >=, <=, is true, is false, contains, startsWith
- Conditions on any command, choice, UI element, scene, button
- Variable interpolation in dialogue and UI text
- Usage tracker (finds all references across entire project)

### UI / Menu System
- 5 built-in screens: Title, Save, Load, Settings, Pause Menu
- Unlimited custom screens
- 12 UI element types: Button, Text, Image, SaveSlotGrid, SettingsSlider, SettingsToggle, CharacterPreview, TextInput, Dropdown, Checkbox, AssetCycler, CGGallery
- 14 UI action types (StartNewGame, GoToScreen, LoadGame, SaveGame, etc.)
- Visual WYSIWYG drag-and-drop editor with resizable/draggable elements
- Per-element opacity, conditions, disabled conditions, transitions
- Screen backgrounds (color/image/video), music, ambient, overlay effects
- Character Customization Wizard and CG Gallery Wizard
- Game HUD system (always-visible overlay during gameplay)
- Restore defaults for built-in screens

### Build / Export System
- **Web**: Single-file HTML standalone, itch.io-ready ZIP
- **Desktop**: Standalone EXE, NSIS installer with desktop shortcut
- Custom app icon
- Full save/load (10 slots), auto-save, persistent progress
- Pre-build validation (missing assets, broken references)
- Visual progress indicators, estimated build size

### Scripting / Plugin System
- JavaScript script editor with syntax highlighting
- Triggers: command, onSceneEnter, onSceneExit, global
- Sandboxed `game` API: variables, navigation, dialogue, audio, utility, math
- Validation with line-level error/warning reporting
- Test execution with console output
- Plugin manifest system (ID, version, categories, capabilities)
- Plugin manager UI: install, enable/disable, uninstall, configure

### Asset Management
- 4 categories: Backgrounds, Images, Audio, Videos
- Grid/List view toggle, sort (name/size/type), search filter
- Virtual directories for organization
- Drag & drop multi-file upload, bulk operations
- Inline preview (images, audio playback, video)
- Custom font import (TTF/OTF)

### Localization
- 10 preset languages (EN, JA, ES, FR, DE, KO, ZH, PT, RU, AR)
- Auto-extraction of translatable strings
- Inline translation editor per string per language
- Search & tag filtering
- CSV export/import

### Settings & Customization
- Game resolution presets (1920×1080, 1280×720, etc.) + custom
- Default game settings: text speed, volumes, auto-advance delay, skip, auto-advance
- Dialogue box/choice button/input styling with 9-slice border images
- Full font settings: family, size, color, weight, italic, alignment, spacing, shadow, gradient, border
- 6 editor themes (Rainbow, Midnight, Ocean, Forest, Sunset, Sakura)
- Accessibility: high contrast, reduced motion, large text, keyboard-only, screen reader

### History / Backlog / Skip
- 200-entry dialogue history with full state snapshots
- Skip mode with accelerating speed
- Auto-advance with configurable delay
- Backward skip with complete visual state restore (stage, variables, music)
- Save/load system with 10 slots + auto-save
- Save migration system (version-based)

### Additional Systems
- Credit Roll (headings + credit pairs, slideshow backgrounds, foreground media)
- Template Gallery (12 template categories with no-code configurators)
- Content Wizards (12 wizard types with step-based UI)
- Multi-window support (tabs open in separate OS windows)
- Guided Tour (7-step onboarding)
- Full undo/redo with keyboard shortcuts
- ErrorBoundary per-panel, toast notifications
- Developer debug flags

---

## Part 2: Comparison — FlourishVNE vs. Visual Novel Maker

### Legend
| Symbol | Meaning |
|--------|---------|
| ✅ | Feature present and functional |
| ⚠️ | Partial implementation or limited |
| ❌ | Feature not present |
| 🏆 | Clear advantage over the competitor |

---

### Core Editor

| Feature | FlourishVNE | Visual Novel Maker | Notes |
|---------|:-----------:|:------------------:|-------|
| Live Preview | ✅ 🏆 | ✅ | Flourish has a full in-editor runtime engine (~6,800 lines) with all 37 commands |
| WYSIWYG UI Editor | ✅ 🏆 | ⚠️ | Flourish has a full drag-and-drop visual UI screen editor; VNM uses message/choice layout configs |
| Drag & Drop Commands | ✅ 🏆 | ❌ | VNM uses list-based command insertion; Flourish supports full drag & drop from palette |
| Multi-Select Commands | ✅ 🏆 | ❌ | Click, Shift+Click range, Ctrl+Click toggle |
| Copy/Paste Commands | ✅ | ❌ | Ctrl+C/V for commands |
| Undo/Redo | ✅ | ✅ | Both have full undo/redo |
| Multi-Window | ✅ 🏆 | ❌ | Flourish can pop out tabs into separate OS windows |
| Command Palette | ✅ | ✅ | Both offer categorized command access |
| Command Categories | 37 commands 🏆 | ~25 commands | Flourish has more command types |

### Scene / Flow Management

| Feature | FlourishVNE | Visual Novel Maker | Notes |
|---------|:-----------:|:------------------:|-------|
| Scenes / Chapters | ✅ | ✅ | Both support multi-scene projects |
| Scene Transitions | ✅ (6 types) | ✅ (6+ types) | Comparable — fade, dissolve, wipe, etc. |
| Labels + Jump | ✅ | ✅ | Both support in-scene labels and jumps |
| Branching (If/Else) | ✅ | ✅ | Both support conditional branching |
| Per-Command Conditions | ✅ 🏆 | ⚠️ | Flourish: any command can have conditions; VNM: conditions via dedicated If/Else blocks only |
| Command Stacking (Async) | ✅ 🏆 | ❌ | Flourish allows parallel command execution with stack grouping |
| Command Groups | ✅ 🏆 | ❌ | Visual-only folders for organizing commands |
| Scene Conditions (Gate) | ✅ 🏆 | ❌ | Gate scene access with variable conditions + fallback |
| Wait Command | ✅ | ✅ | Both have timed wait commands |

### Character System

| Feature | FlourishVNE | Visual Novel Maker | Notes |
|---------|:-----------:|:------------------:|-------|
| Character Database | ✅ | ✅ | Both have character management |
| Multi-Layer Sprites | ✅ 🏆 | ❌ | Flourish supports multi-layer compositing; VNM uses single-image expressions |
| Expressions | ✅ | ✅ | Both have named expression systems |
| Custom Fonts Per Character | ✅ 🏆 | ❌ | Flourish supports per-character font settings |
| Show/Hide with Transitions | ✅ | ✅ | Both support character transitions |
| 7+ Position Presets | ✅ | ✅ | Both have position options |
| Custom X,Y% Positioning | ✅ | ✅ | Both allow custom positioning |
| Live2D Support | ❌ | ✅ 🏆 | VNM has Live2D model support (paid DLC) |
| Voice Sync / Lip Sync | ❌ | ✅ 🏆 | VNM syncs voice clips to Live2D lip movement |
| Character Shaking/Zoom | ⚠️ | ✅ 🏆 | VNM has per-character shake/zoom; Flourish has screen-level effects only |
| Character Tinting | ❌ | ✅ 🏆 | VNM can tint individual characters; Flourish tints entire screen |
| Layer-as-Video | ✅ 🏆 | ❌ | Flourish sprite layers can be videos with loop support |

### Dialogue & Text

| Feature | FlourishVNE | Visual Novel Maker | Notes |
|---------|:-----------:|:------------------:|-------|
| Dialogue with Speaker | ✅ | ✅ | Both have character/narrator dialogue |
| Variable Interpolation | ✅ | ✅ | Both support inserting variables in text |
| Typewriter Effect | ✅ | ✅ | Both have configurable text speed |
| Choices with Conditions | ✅ 🏆 | ✅ | Flourish supports conditions + multiple actions per choice |
| Text Input (Player Entry) | ✅ 🏆 | ⚠️ | Flourish has a fully customizable TextInput command; VNM has basic name input |
| Rich Text Formatting | ⚠️ | ✅ 🏆 | VNM supports per-character color, size, bold, italic within text via control codes; Flourish applies formatting per-command |
| Text Effects (Shake/Wave) | ❌ | ✅ 🏆 | VNM supports per-character text animations (shake, wave, rainbow) |
| Ruby Text / Furigana | ❌ | ✅ 🏆 | VNM has native ruby text support for Japanese |
| Voice Acting Per Line | ❌ | ✅ 🏆 | VNM can attach a voice clip to each dialogue line |

### Visual Effects

| Feature | FlourishVNE | Visual Novel Maker | Notes |
|---------|:-----------:|:------------------:|-------|
| Screen Shake | ✅ | ✅ | Both have screen shake |
| Screen Flash | ✅ | ✅ | Both have flash effects |
| Screen Tint | ✅ | ✅ | Both have tint/color overlays |
| Camera Pan & Zoom | ✅ 🏆 | ⚠️ | Flourish has combined pan+zoom command; VNM has basic zoom |
| Overlay Effects (6 types) | ✅ 🏆 | ❌ | CRT, Glitch, Sunbeams, Shimmer, Rain, Snow/Ash — unique to Flourish |
| Particle Effects | ⚠️ via overlays | ✅ 🏆 | VNM has a full particle system with custom emitters; Flourish has preset particle overlays |
| Tween/Animation System | ❌ | ✅ 🏆 | VNM has object tweening (move/rotate/scale/fade over time) |
| Transition Preview | ✅ 🏆 | ❌ | Flourish shows live transition previews in the inspector |

### Audio System

| Feature | FlourishVNE | Visual Novel Maker | Notes |
|---------|:-----------:|:------------------:|-------|
| Music Playback | ✅ | ✅ | Both have music with loop/fade |
| Sound Effects | ✅ | ✅ | Both have SFX support |
| Ambient Channel | ✅ 🏆 | ⚠️ | Flourish has a dedicated ambient channel; VNM layers audio on 2 channels |
| Per-Command Volume | ✅ | ✅ | Both allow volume per audio command |
| Audio Layering | ✅ | ✅ 🏆 | VNM supports more simultaneous audio layers |
| Voice Channel | ❌ | ✅ 🏆 | VNM has dedicated voice acting channel with per-dialogue clips |

### Video / Movie

| Feature | FlourishVNE | Visual Novel Maker | Notes |
|---------|:-----------:|:------------------:|-------|
| Video Playback | ✅ | ✅ | Both support video/movie playback |
| Fullscreen + Overlay Modes | ✅ 🏆 | ✅ | Flourish has more positioning options (X, Y, W, H, object-fit) |
| Video as Background | ✅ | ✅ | Both allow video backgrounds |
| Video as Character Layer | ✅ 🏆 | ❌ | Unique to Flourish — character sprite layers can be animated videos |

### Variables & Logic

| Feature | FlourishVNE | Visual Novel Maker | Notes |
|---------|:-----------:|:------------------:|-------|
| Variable Types | ✅ (3) | ✅ (2) | Flourish: String, Number, Boolean; VNM: Numbers + Switches |
| Variable Scopes | ✅ 🏆 (3) | ✅ (2) | Flourish: Local, Global, Persistent; VNM: Global, Persistent |
| 10 Condition Operators | ✅ 🏆 | ✅ (6) | Flourish has contains/startsWith; VNM is more limited |
| Random Range | ✅ | ✅ | Both support random number generation |
| Usage Tracker | ✅ 🏆 | ❌ | Find all variable references across entire project |

### UI / Menu System

| Feature | FlourishVNE | Visual Novel Maker | Notes |
|---------|:-----------:|:------------------:|-------|
| Title Screen | ✅ | ✅ | Both have customizable title screens |
| Save/Load Screen | ✅ | ✅ | Both have save/load UI |
| Settings Screen | ✅ | ✅ | Both have settings screens |
| Custom Screens | ✅ 🏆 | ⚠️ | Flourish: unlimited custom screens with WYSIWYG editor; VNM: custom layouts via scripting |
| 12 UI Element Types | ✅ 🏆 | ⚠️ | SaveSlotGrid, AssetCycler, CGGallery, CharacterPreview, Dropdown, Checkbox — Flourish has more built-in element types |
| WYSIWYG Screen Editor | ✅ 🏆 | ❌ | VNM uses property fields; Flourish has visual drag-and-drop canvas |
| Game HUD | ✅ 🏆 | ⚠️ | Flourish has a dedicated HUD layer system |
| Character Creator Wizard | ✅ 🏆 | ❌ | Guided character customization screen setup |
| CG Gallery | ✅ | ✅ | Both support CG galleries; Flourish has a dedicated element + wizard |
| 14 UI Action Types | ✅ 🏆 | ⚠️ | Flourish has more built-in actions per element |

### Build / Export

| Feature | FlourishVNE | Visual Novel Maker | Notes |
|---------|:-----------:|:------------------:|-------|
| Windows Build | ✅ | ✅ | Both export to Windows |
| macOS Build | ✅ | ✅ | Both export to Mac |
| Linux Build | ✅ | ✅ | Both export to Linux |
| Web / HTML Build | ✅ 🏆 | ✅ | Flourish: single-file HTML; VNM: web export |
| Android / iOS | ❌ | ✅ 🏆 | VNM supports mobile export; Flourish does not |
| itch.io Ready | ✅ 🏆 | ⚠️ | Flourish generates itch.io-ready ZIP packages |
| Installer (NSIS) | ✅ 🏆 | ⚠️ | Flourish generates Windows installers with desktop shortcuts |
| Build Validation | ✅ 🏆 | ❌ | Pre-build validation for missing assets and broken references |
| Steam Integration | ❌ | ✅ 🏆 | VNM has SteamOS export |

### Scripting & Extensibility

| Feature | FlourishVNE | Visual Novel Maker | Notes |
|---------|:-----------:|:------------------:|-------|
| JavaScript Scripting | ✅ | ✅ | Both support JavaScript |
| CoffeeScript | ❌ | ✅ | VNM also supports CoffeeScript |
| Sandboxed API | ✅ 🏆 | ❌ | Flourish has a secure sandbox; VNM gives full access |
| Editor Extensions | ⚠️ | ✅ 🏆 | VNM extensions can modify the editor itself, add custom commands/tabs |
| Plugin System | ✅ | ✅ | Both have plugin architectures |
| Script Triggers | ✅ 🏆 | ⚠️ | Flourish: command, onSceneEnter/Exit, global; VNM: call-based |
| Script Validation | ✅ 🏆 | ❌ | Flourish: syntax checking with line-level errors |
| Test Execution | ✅ 🏆 | ❌ | Run scripts in a mock context with console output |

### Additional Features

| Feature | FlourishVNE | Visual Novel Maker | Notes |
|---------|:-----------:|:------------------:|-------|
| Localization | ⚠️ | ✅ | **Corrected 2026-08-09:** previously marked ✅ in error. Flourish's Localization panel is in-memory only — translations are discarded when it closes, and the runtime never reads them, so an exported game cannot be localized at all. VNM's works. See `GAME_LOCALIZATION_PLAN.md` |
| Image-Based Localization | ❌ | ✅ 🏆 | VNM auto-detects localized image variants via filename suffix |
| Credit Roll System | ✅ 🏆 | ❌ | Flourish has a built-in credit roll command with slideshow backgrounds |
| Template Gallery | ✅ 🏆 | ❌ | 12 template categories with no-code configuration |
| Content Wizards | ✅ 🏆 | ❌ | Step-by-step guided creation flows (12 wizard types) |
| Guided Tour | ✅ 🏆 | ❌ | 7-step onboarding for new users |
| Accessibility Settings | ✅ 🏆 | ❌ | High contrast, reduced motion, large text, keyboard-only, screen reader |
| Multi-Window Editing | ✅ 🏆 | ❌ | Pop out tabs into separate OS windows |
| Auto-Save/Recovery | ✅ | ✅ | Both have auto-save |
| Hub Music Player | ✅ 🏆 | ❌ | Background music in the project hub |
| Bundled Assets | ❌ | ✅ 🏆 | VNM includes free characters, backgrounds, music (StARs) |
| DLC Marketplace | ❌ | ✅ 🏆 | VNM has 181 DLC packs on Steam |
| Achievement System | ⚠️ via variables | ✅ 🏆 | VNM has built-in achievements; Flourish can replicate via persistent variables |
| Hotspot / Click Areas | ⚠️ via ShowButton | ✅ 🏆 | VNM has dedicated hotspot system; Flourish can use ShowButton as a workaround |
| Timer System | ⚠️ via scripts | ✅ 🏆 | VNM has built-in timers; Flourish can script timers |
| In-Scene Overlays (Text/Image/Button) | ✅ 🏆 | ⚠️ | Flourish has ShowText/ShowImage/ShowButton with full positioning; VNM has picture commands |

---

## Part 3: Gap Analysis — What Flourish Should Prioritize

### High Priority (Competitive Gaps)

| Gap | Impact | Difficulty | Recommendation |
|-----|--------|------------|----------------|
| **Per-character text effects** (shake, wave, rainbow, color changes mid-text) | High — expected by VN players | Medium | Add inline text formatting codes: `[color=red]text[/color]`, `[shake]text[/shake]`, `[size=24]text[/size]` |
| **Voice acting per dialogue line** | High — standard in commercial VNs | Low-Medium | Add optional `voiceClip` field to Dialogue command; auto-play when dialogue advances |
| **Per-character effects** (shake, zoom, tint on individual characters) | High — adds dramatic visual impact | Medium | Add character-level shake/zoom/tint parameters to ShowCharacter or new CharacterEffect command |
| **Mobile export** (Android / iOS) | High — major distribution channel | High | Capacitor or React Native wrapper for mobile builds |
| **Tween/animation system** | Medium-High — enables dynamic transitions | Medium | Add MoveObject/TweenObject command for in-scene elements (position, scale, rotation, opacity over time) |
| **Ruby text / furigana** | Medium — critical for Japanese VN market | Low | Add ruby text markup in dialogue: `{ruby:漢字|かんじ}` |

### Medium Priority (Polish & Parity)

| Gap | Impact | Difficulty | Recommendation |
|-----|--------|------------|----------------|
| **Full particle system** (custom emitters) | Medium — current overlays cover common cases | High | Expose particle emitter parameters or add more overlay presets |
| **Audio layering** (4+ simultaneous channels) | Medium — enables complex soundscapes | Low | Add more audio channel slots beyond Music/SFX/Ambient |
| **Image-based localization** | Low-Medium — niche feature for CG localization | Low | Covered by `GAME_LOCALIZATION_PLAN.md` phase 5 as explicit per-language asset overrides (both Ren'Py and VNM ship this, so it is table stakes rather than niche) |
| **Hotspot system** | Medium — interactive exploration scenes | Medium | Dedicated Hotspot command or enhance ShowButton with invisible/shape modes |
| **Timer command** | Medium — time pressure mechanics | Low | Add Timer command (countdown, variable binding, timeout action) |
| **CoffeeScript support** | Low — JavaScript covers same use cases | Low | Not worth pursuing; JS is industry standard |

### Flourish's Unique Strengths (Maintain & Promote)

These are features where Flourish **exceeds** Visual Novel Maker:

1. **WYSIWYG UI Screen Editor** — drag-and-drop visual canvas that VNM completely lacks
2. **12 UI Element Types** — SaveSlotGrid, AssetCycler, CGGallery, CharacterPreview are unique
3. **37 Command Types vs ~25** — broader command vocabulary out-of-the-box
4. **Multi-Layer Character Sprites** — compositing system that VNM doesn't have
5. **Video Sprite Layers** — character layers can be animated videos
6. **Command Stacking (Async)** — parallel execution that VNM doesn't support
7. **Per-Command Conditions** — any command can have conditions, not just If/Else blocks
8. **6 Screen Overlay Effects** — CRT, Glitch, Sunbeams, Shimmer, Rain, Snow built-in
9. **Template Gallery + Content Wizards** — 12 templates with no-code configurators
10. **Credit Roll System** — structured credits with slideshow backgrounds
11. **Multi-Window Editing** — pop out tabs into separate OS windows
12. **Build Validation** — pre-build checks for missing assets and broken references
13. **Script Validation & Test Execution** — syntax checking + mock execution
14. **Accessibility Settings** — high contrast, reduced motion, large text, keyboard-only, screen reader
15. **Variable Usage Tracker** — find all references across entire project
16. **Scene Condition Gates** — restrict scene access with variable conditions
17. **Character Creator Wizard** — guided setup for character customization screens
18. **Web-First Architecture** — runs in any browser, no installation required; also available as desktop app

---

## Part 4: Feature Count Summary

| Category | FlourishVNE | Visual Novel Maker |
|----------|:-----------:|:------------------:|
| Command Types | 37 | ~25 |
| UI Element Types | 12 | ~4 |
| UI Action Types | 14 | ~8 |
| Screen Overlay Effects | 6 | 0 (via plugins) |
| Variable Scopes | 3 | 2 |
| Condition Operators | 10 | ~6 |
| Asset Transitions | 7 | 6 |
| Scene Transitions | 6 | 6+ |
| Audio Channels | 3 | 2 (+voice) |
| Editor Themes | 6 | 1 |
| Accessibility Options | 5 | 0 |
| Export Targets | 4 (Win/Mac/Linux/Web) | 7 (Win/Mac/Linux/Web/Android/iOS/SteamOS) |
| Template Types | 12 | 0 |
| Content Wizards | 12 | 0 |
| Save Slots | 10 | Configurable |
| Localization Languages | 10 presets | Unlimited |
| Font Customization Points | 8+ areas | 3-4 areas |

---

## Conclusion

**FlourishVNE is ahead of Visual Novel Maker in editor UX, UI design tools, command variety, and workflow automation.** The WYSIWYG screen editor, multi-layer character system, command stacking, template gallery, and content wizards represent major advantages.

**Visual Novel Maker is ahead in character animation (Live2D, voice sync), text formatting (per-character effects), mobile export, and audio layering.** These are primarily runtime/rendering features rather than editor features.

**Strategic recommendation:** Focus on the high-priority gaps (per-character text effects, voice acting support, per-character visual effects, and tween/animation system) to close the remaining competitive gaps. These are all achievable within the existing architecture without requiring third-party libraries. Mobile export is the largest gap but requires the most effort.
