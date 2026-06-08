# FlourishVNE Editor Localization (i18n) — Progress & Handoff Reference

> **Status snapshot:** Infrastructure complete. **✅ WAVE A** + **✅ WAVE B** + **✅ WAVE C COMPLETE** (2026-06-07). All editor-UI components are localized into English (`en`) and Brazilian Portuguese (`pt`). Full-project parity: **2457 keys across 20 namespaces, en==pt ALL MATCH**, `tsc` clean (no new errors), `vite build` green.
>
> **Wave C completion (final batch)** added 6 new namespaces for the remaining large editors: `gameBuilder` (GameBuilder), `editorTools` (VisualNovelEditor + ScriptEditor + PluginManagerUI), `templates` (TemplateGallery/Config/Preview), `staging` (StagingArea — editor chrome only; previewed project data left untranslated), `contentTools` (ContentWizardModal + MusicPlayer), `contextPanels` (ContextPanelManager + ContextualToolbar + LocalizationPanel chrome). All registered in `src/i18n/index.ts`.
>
> **Only Wave D (deferred, low-priority) remains:** `getCommandSummary` gray summary lines (CommandItem/CommandStackItem) and `commandStackUtils` async-warning strings. SKIP list unchanged (LivePreview + live-preview/* runtime, ResourceManager/ScriptingEditor dead code).
>
> _(Historical: Wave C earlier did ConfirmationModal, InfoModal, LoadingOverlay, KeyboardShortcutsModal, ImportSummaryModal, AutoUpdateBanner, ChangelogModal, GuidedTour, HelpPanel, AssetSelector, ManagerWindow, ThemeSelector, UIScreenThemeSelector, VariablePropertiesEditor, SearchableSelect, TransitionPreview, FontEditor via the `components` namespace.)_

---

## 1. Goal & Scope

**Goal:** Translate the **editor interface** of FlourishVNE into Brazilian Portuguese (`pt`), motivated by a Brazilian-Portuguese-speaking power user. English (`en`) is the source of truth; `pt` is the translation.

**In scope — "Surface 1": the editor UI** (buttons, tooltips, menus, toasts, placeholders, modals, panels) in the React editor app bundled by Vite.

**OUT of scope (do NOT translate):**
- **"Surface 2": player-facing game content** (the dialogue/choices an author writes) — has its own unused skeleton (`src/features/localization/LocalizationService.ts`, `LocalizationPanel.tsx`).
- **The exported game runtime** — `public/game-engine.js`, `src/utils/gameEngineBundle.ts`, and the live-preview *runtime* that mirrors it. Built by a **separate** pipeline (`build:engine` → `scripts/generate-engine-bundle.js`).
- Console logs, internal IDs, asset/font proper names, CSS variables.

**Decisions locked in:** library = **react-i18next + i18next**; resources **statically imported** (offline Electron app, no HTTP backend); language persisted in `localStorage['flourish-editor-language']` mirroring `src/contexts/ThemeContext.tsx`; **namespace-per-area** architecture.

---

## 2. Infrastructure (DONE — do not rebuild)

| Purpose | Path |
|---|---|
| i18n init singleton + `setLanguage()` + `SUPPORTED_LANGUAGES` | `src/i18n/index.ts` |
| Locale resources (en) | `src/i18n/locales/en/*.json` |
| Locale resources (pt) | `src/i18n/locales/pt/*.json` |
| Side-effect init import (`import './i18n';`) | `src/index.tsx` |
| Language picker UI | `src/components/SettingsManager.tsx` (General section) |
| `resolveJsonModule: true` | `tsconfig.json` |
| Vite chunking (monaco split only; React+i18n in one `vendor` chunk) | `vite.config.ts` |

**`SUPPORTED_LANGUAGES`** = `[{code:'en',label:'English'}, {code:'pt',label:'Português (Brasil)'}]`.

**To add a NEW namespace** you must edit `src/i18n/index.ts` in 4 places:
1. `import enX from './locales/en/x.json';`
2. `import ptX from './locales/pt/x.json';`
3. add `x: enX` / `x: ptX` to the `resources.en` / `resources.pt` objects
4. add `'x'` to the `ns: [...]` array

`fallbackLng: 'en'` means **untranslated keys safely fall back to English** — partial localization never breaks the UI. `interpolation.escapeValue:false` (React already escapes). `returnNull:false`.

---

## 3. The Recipe (apply per component)

```tsx
import { useTranslation } from 'react-i18next';
// inside the component:
const { t } = useTranslation('namespaceName');
// text:        <button>{t('save')}</button>
// attribute:   title={t('returnToHub')}  placeholder={t('enterTitle')}
// interpolate: t('uploaded', { count: ok })          // "Uploaded {{count}} files"
// plurals:     key_one / key_other + { count }       // i18next auto-selects
// cross-ns:    t('common:delete')  or  t(`commands:names.${cmd.type}`)
// markup:      <Trans> component (see PropertiesInspector movie.stopMovieNote)
```

**Conventions:**
- One namespace per major area; `camelCase` keys; nested objects for groups (e.g. `footer.parallelExecution`).
- Shared verbs live in `common` ns; reuse via `t('common:...')`.
- **Every sub-component (separate `React.FC`) that renders literals needs its own `useTranslation` hook** — `t` is not inherited. (AssetManager/CharacterEditor had many sub-FCs each.)
- Module-level display strings (outside components) use `i18n.t(...)` imported from `../i18n` (see VariableManager, CommonEventsManager).
- Command-type display names are centralized in the **`commands`** ns under `commands.names.*` — reuse everywhere instead of duplicating.
- For arrays of `{value,label}` options, translate the `label` at build time via `t(...)` inside the component (see PropertiesInspector particle presets / tween target types).
- Add `t` to `useCallback`/`useMemo` dep arrays where it's used.

---

## 4. Namespace Inventory (current key counts, en == pt verified)

| Namespace | Keys | Primary consumer(s) |
|---|---|---|
| common | 9 | shared verbs (save/cancel/delete/add/close…) |
| header | 25 | Header.tsx |
| hub | 56 | ProjectHub.tsx |
| settings | 50 | SettingsManager.tsx (General + language picker only — **rest of Settings NOT done**) |
| nav | 16 | NavigationTabs.tsx |
| scenes | 44 | SceneManager, SceneEditor, SceneConfigEditor |
| characters | 63 | CharacterManager (4 top-level) + CharacterEditor (`editor.*`) |
| variables | 45 | VariableManager |
| commonEvents | 47 | CommonEventsManager |
| commands | 52 | CommandPalette, SceneEditor, CommandStackComponents, CommonEventsManager (`commands.names.*`) |
| properties | 451 | PropertiesInspector (all command editors + shared footer) |
| assets | 80 | AssetManager |
| ui | 98 | Wave A UI editors — shared action/condition widgets + menu ActionEditor (`actions.*`, `actionsList.*`, `winCondition.*`, `conditions.*`, `actionEditor.*`). **`ui.actions.*` is the shared UIActionType label map — reuse via the `actionLabel()` helper pattern.** |

---

## 5. COMPLETED components (15)

All verified: `npx tsc --noEmit` clean (except known pre-existing errors, §8), en/pt key parity ALL MATCH, `npx vite build` ✓.

1. **Header.tsx** (`header`)
2. **ProjectHub.tsx** (`hub`) — incl. toasts w/ interpolation
3. **SettingsManager.tsx** — **General section + language picker ONLY**; remaining sections pending (see §6)
4. **NavigationTabs.tsx** (`nav`)
5. **SceneManager.tsx** (`scenes`)
6. **CharacterManager.tsx** (`characters` top-level keys)
7. **VariableManager.tsx** (`variables`, incl. module-level `i18n.t` for usage strings)
8. **CommonEventsManager.tsx** (`commonEvents` + `commands` for command names)
9. **CommandPalette.tsx** (`commands`)
10. **SceneEditor.tsx** (`scenes` editor.* + `commands` for CommandItem/AddCommandMenu)
11. **SceneConfigEditor.tsx** (`scenes.config.*`)
12. **CommandStackComponents.tsx** (`commands` name + `scenes` tooltips)
13. **PropertiesInspector.tsx** (`properties`, 443 keys) — every command editor + shared footer (Parallel Execution, Conditions, Delete, panel title, empty state)
14. **AssetManager.tsx** (`assets`, 80 keys) — incl. all sub-FCs (AssetCard, FolderCard, EmptyState, UploadButton, AssetInspector, FolderSelectorModal)
15. **CharacterEditor.tsx** (`characters.editor.*`) — 3 sub-FCs (ExpressionListItem, LayerCard, main), 3 tabs (Expressions/Layers/Style)

**Deferred-low-priority within done files:** `getCommandSummary` gray summary lines in CommandItem & CommandStackItem; `commandStackUtils` async-warning strings.

---

## 6. REMAINING editor components (the rollout queue)

> **Was actively starting "UI editors" wave when paused.** Order below is the planned wave order.

### Wave A — UI editors (IN PROGRESS — all use the `ui` namespace)
**DONE (verified parity + build):**
- ✅ `src/components/ui/ConditionsEditor.tsx` (`ui.conditions.*`)
- ✅ `src/components/ui/WinConditionEditor.tsx` (`ui.winCondition.*`)
- ✅ `src/components/ui/UIActionsListEditor.tsx` (`ui.actions.*` + `ui.actionsList.*`; `actionLabel()` helper)
- ✅ `src/components/menu-editor/ActionEditor.tsx` (`ui.actionEditor.*`; reuses `ui.actions.*` via `actionLabel()` + `MENU_ACTION_TYPES` list)
- ✅ `src/components/UIManager.tsx` (`ui.manager.*`; 2 sub-FCs each with own hook)
- ✅ `src/components/menu-editor/ScreenInspector.tsx` (`ui.screenInspector.*`; effect/param labels keyed by `effects.{type}` + `params.{type}.{key}`)
- ✅ `src/components/menu-editor/ResizableDraggable.tsx` — **no user-facing strings; nothing to localize.**

- ✅ `src/components/menu-editor/MenuEditor.tsx` (`ui.menuEditor.*`) — canvas previews (`UIElementRenderer`/`SafeUIElementRenderer` each have own hook), panel, template-wizard modal. Auto-created button `.text`/`.name` defaults left as-is (player content / project data).
- ✅ `src/components/hot-zone/HotZoneOverlays.tsx` — **no user-facing strings; canvas overlays only.**
- ✅ `src/components/hot-zone/HotZoneInspectors.tsx` (`ui.hotZone.*`) — both `HotSpotProperties` + `HotZoneElementProperties` FCs hooked; ~70 strings.
- ✅ `src/components/menu-editor/CharacterCustomizationWizard.tsx` (`ui.charWizard.*`) — 3-step wizard, ~26 strings.
- ✅ `src/components/menu-editor/CGGalleryWizard.tsx` (`ui.cgWizard.*`) — 3-step wizard, ~39 strings. (Asset `category` defaults + generated `CG Unlock:` var-name preview left as data.)

`ui` namespace now 355 keys (en==pt). Pre-existing tsc errors in ScreenInspector (effects-array `as const` union) are NOT from i18n — build passes.
**Batch-edit tip:** for these big files a Python `str.replace` script (match full JSX substrings → `{t('...')}`, assert no MISS) was far faster than per-string Edits. Add the `useTranslation('ui')` hook first, then run the script.

- ✅ `src/components/menu-editor/UIElementInspector.tsx` (`ui.elementInspector.*`) — largest file (~190 keys). Only the main FC needs the hook (`CollapsibleSection` just renders its `title`/`hint`/`badge` props; `buildDropdownOptions`/`buildCheckboxValues` defaults are data). Auto-created dropdown/checkbox option-label defaults (`Option 1`, `True`/`False`) left as data.

- ✅ `src/components/InGameUIEditor.tsx` (`ui.inGameUi.*`) — all 8 sub-FCs hooked (6 previews + props editor + main). Module-level `ELEMENTS`/`QUICK_MENU_BUTTONS` labels translated at render via `t('inGameUi.'+el.id)` / `t('inGameUi.qmLabels.'+b.key)`. Confirm-dialog preview fallbacks + placeholders share keys.

**🎉 WAVE A COMPLETE.** `ui` namespace is the localization home for all UI editors. Full project parity: **1605 total keys, en==pt ALL MATCH**, build green.

### Wave B — Rest of SettingsManager ✅ COMPLETE
All live SettingsManager sub-components localized via the `settings` ns: **Fonts** (`settings.fonts.*`), **Screens** (`settings.screens.*` incl. `slots.*`), **CG Gallery** (`settings.cgGallery.*`, incl. `typeImage`/`typeBackground` mapped into `allAssets`), **Accessibility** (`settings.accessibility.*`, intro uses `<Trans>` for inline `<b>`), **Analytics** (`settings.analytics.*`, incl. `actions.*` map for `humanizeAction` with raw-key fallback). General + section nav were already done. Inline-bold notes use react-i18next `<Trans>` (`fonts.note`, `accessibility.intro`) with `components={{ b: <strong/> }}`.
- **`UIAssetsSettings` skipped** — dead code: defined but never rendered (not in the section switch, not exported). Its dialogue/name/choice/input-box appearance controls now live in `InGameUIEditor.tsx` (already localized in Wave A).

### Wave C — Standalone components & modals
**🔄 IN PROGRESS** (17 of ~26 done). New `components` namespace (`src/i18n/locales/{en,pt}/components.json`, registered in `i18n/index.ts` — 4 edits: import enComponents/ptComponents, add to resources.en/pt, add `'components'` to the `ns` array).

**Conventions established in this wave (follow for the rest):**
- One sub-object per component inside `components.json` (e.g. `helpPanel`, `fontEditor`, `varProps`). Keep en/pt in lockstep — parity script must stay at ALL MATCH.
- Reusable components whose label/title/placeholder come from **props with hardcoded default fallbacks**: drop the inline default, take the prop as optional, and compute `const x = prop ?? t(...)` in the body (see `InfoModal`, `LoadingOverlay`, `SearchableSelect`, `UIScreenThemeSelector`). Generic default labels route to the existing `common` ns (`common:cancel`, `common:close`).
- Inline-bold / inline-`<kbd>` strings use react-i18next `<Trans i18nKey=... t={t} components={{ b: <strong/> }} />` (see `keyboardShortcuts.footer`).
- Data arrays defined at module scope (tour steps, shortcut tables, command docs) → convert to a stable meta array (ids/keys only) and build the display array **inside** the component with `t()` in a `useMemo([...,t])`; remember to add the memoized array to dependent `useMemo` deps (see `HelpPanel`).
- `helpPanel.commands.<Name>.{desc,example}` keyed by the stable command name; param identifiers like `characterId` stay as code.

**✅ Done (17):** ConfirmationModal, InfoModal, LoadingOverlay, KeyboardShortcutsModal, ImportSummaryModal, AutoUpdateBanner, ChangelogModal, GuidedTour, HelpPanel (full command reference), AssetSelector, ManagerWindow, ThemeSelector, UIScreenThemeSelector, VariablePropertiesEditor (`varProps`), SearchableSelect, TransitionPreview, FontEditor.
**Verified string-free (no work needed):** ContextMenu, Panel, Form.

**⏳ Remaining:**
- `src/components/ContentWizardModal.tsx` (391)
- `src/components/templates/` — TemplateGallery (416), TemplateConfig (539), TemplatePreview (453)
- `src/components/GameBuilder.tsx` (962)
- `src/components/ScriptEditor.tsx` (384) and/or `src/components/ScriptingEditor.tsx` (659) — *grep which one actually renders before touching*
- `src/components/PluginManagerUI.tsx` (468)
- `src/components/MusicPlayer.tsx` (385) — editor music player chrome
- `src/components/context-panels/ContextPanelManager.tsx` (533), `ContextualToolbar.tsx` (425)
- `src/components/LocalizationPanel.tsx` (366) — *editor chrome only; this panel manages Surface-2 player content — localize chrome, NOT the managed content*
- `src/components/VisualNovelEditor.tsx` (662) — top-level editor shell
- `src/components/StagingArea.tsx` (1261) — **verify editor vs runtime before touching** (may overlap exported runtime)

### Wave D — Deferred low-priority
- `getCommandSummary` lines (CommandItem, CommandStackItem)
- `commandStackUtils` async-warning strings

### SKIP — out of scope (player-facing runtime / dead code)
- `src/components/LivePreview.tsx` (8656) and `src/components/LivePreview/UnifiedPreview.tsx`
- everything under `src/components/live-preview/` (ScreenOverlayEffects, ParticleSystem, AnimatedDialogueText, command-handlers/*)
- `src/components/icons.tsx` (no user text)
- `src/components/ErrorBoundary.tsx` (dev-facing)
- **`src/components/ResourceManager.tsx` (785) — DEAD CODE, zero imports anywhere. Confirmed unused; do not localize.**

> Before localizing any ambiguous file, grep for where it's imported and whether it renders inside the editor vs. the exported/preview runtime.

---

## 7. Verification (run after each component/batch)

```bash
# 1. Type-check (ignore the known pre-existing errors in §8)
npx tsc --noEmit 2>&1 | grep "<ComponentName>"

# 2. en/pt key parity across ALL namespaces (must print "ALL MATCH")
node -e "
const fs=require('fs');
const dir='src/i18n/locales/';
const ns=fs.readdirSync(dir+'en').map(f=>f.replace('.json',''));
function keys(o,p=''){let r=[];for(const k in o){const v=o[k];const kk=p?p+'.'+k:k;if(v&&typeof v==='object'&&!Array.isArray(v))r=r.concat(keys(v,kk));else r.push(kk);}return r;}
let ok=true;
for(const n of ns){const en=JSON.parse(fs.readFileSync(dir+'en/'+n+'.json'));const pt=JSON.parse(fs.readFileSync(dir+'pt/'+n+'.json'));const ek=keys(en).sort(),pk=keys(pt).sort();const miss=ek.filter(k=>!pk.includes(k)),ex=pk.filter(k=>!ek.includes(k));if(miss.length||ex.length){ok=false;console.log('X '+n+' miss:'+miss+' extra:'+ex);}else console.log('OK '+n+' ('+ek.length+')');}
console.log(ok?'ALL MATCH':'MISMATCH');
"

# 3. Production build (must end "built in N.NNs")
npx vite build
```

**Live test:** `npm run dev` → Settings → General → switch to **Português (Brasil)** → UI flips live; reload → persists (localStorage). Accents (ã, ç, é, õ) render fine; watch for layout overflow (pt runs ~15–30% longer than en — fix with wrapping/min-width as it appears).

---

## 8. Known PRE-EXISTING tsc errors (NOT caused by i18n — ignore)

These exist independent of localization; do not try to "fix" them as part of i18n:
- `PropertiesInspector.tsx` ~line 2430: `TS2869 Right operand of ?? is unreachable` (in TweenElement `!!(...) ?? ...`, untouched).
- `CharacterEditor.tsx` ~line 730: `TS2353 'defaultVoiceId' does not exist in type Partial<Pick<VNCharacter,...>>` (the `updateCharacter` Pick type omits `defaultVoiceId`).
- `ErrorBoundary.tsx`: `setState`/`props` does not exist (class-component typing).
- `menu-editor/MenuEditor.tsx`, `ScreenInspector.tsx`, `UIElementInspector.tsx`: several `Property X on type 'unknown'`, `'CloseScreen' not assignable to UIActionType`, etc.
- `live-preview/command-handlers/dialogueHandler.ts`: `voiceVolume` missing.
- `ui/SearchableSelect.tsx`: `.map` on `unknown`.
- `constants.ts`: VNProjectUI missing-properties error.
- VariableManager: `VNUIElement.content/children` errors.

**The real signal is `npx vite build` succeeding** (esbuild transpiles without strict typecheck). tsc is used only to catch *new* errors introduced in the file you just edited.

---

## 9. IDE diagnostics noise (expected, harmless)

After every Edit the VS Code language server emits transient cascades — `TS7026 (JSX.IntrinsicElements)`, `TS7006 (implicit any)`, `TS7016/7031 (React types dropped)`. These are **language-server artifacts that clear on their own**; the authoritative check is the real `npx tsc --noEmit` run, which stays clean. Do not chase them.

---

## 10. Quick resume checklist

1. Read this file.
2. `git status` / `git diff --stat` to see uncommitted i18n work.
3. Pick the next file in §6 Wave A (UIManager.tsx is the entry point for UI editors).
4. Decide namespace: likely a new **`ui`** ns (register in `src/i18n/index.ts` per §2) — or split `menu`/`hotzone` if it gets large. Keep `properties`-style nesting.
5. Apply the recipe (§3), add hooks to every sub-FC.
6. Verify (§7). Report checkpoint. Continue.
