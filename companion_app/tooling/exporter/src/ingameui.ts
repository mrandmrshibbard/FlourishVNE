// In-Game UI — the author's styling of the built-in chrome the runtime draws during play: the
// dialogue box, name plate, choice buttons, and text input. This is VNProjectUI's dialogue*/namebox*/
// choice*/input* fields (NOT the custom ui.screens, which mapScreens handles). The runtime applies
// whatever's present and falls back to sane defaults for anything absent, so a plain project stays clean.
import { ExportContext } from './context.js';
import { resolveFont } from './screens.js';
import { mapConditions } from './commands.js';

// Normalize a VNCharacterTextbox-shaped object (theme / reactive state / per-char textbox) to the flat
// style the runtime applies to the dialogue panel + name plate. Only defined fields are kept.
function textboxStyle(t: any, ctx: ExportContext): any {
  if (!t) return {};
  const uiImg = (a: any) => (a && a.type === 'image' && a.id ? ctx.image(a.id) ?? undefined : undefined);
  const o: any = {
    image: uiImg(t.dialogueBoxImage),
    color: t.dialogueBoxColor,
    opacity: t.dialogueBoxOpacity != null ? t.dialogueBoxOpacity / 100 : undefined,
    borderRadius: t.dialogueBoxBorderRadius,
    nameImage: uiImg(t.nameboxImage),
    nameColor: t.nameboxColor,
    nameOpacity: t.nameboxOpacity != null ? t.nameboxOpacity / 100 : undefined,
    nameRadius: t.nameboxBorderRadius,
    textFont: t.dialogueTextFont ? resolveFont(t.dialogueTextFont, ctx) : undefined,
    nameFont: t.dialogueNameFont ? resolveFont(t.dialogueNameFont, ctx) : undefined,
  };
  const out: any = {};
  for (const k of Object.keys(o)) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

// Resolve a UIAsset ({type:'image'|'video', id}) to an image asset path (videos in chrome are rare — skip).
function uiImage(a: any, ctx: ExportContext): string | undefined {
  if (a && a.type === 'image' && a.id) return ctx.image(a.id) ?? undefined;
  return undefined;
}

// Keep only defined values so the bundle stays minimal and the auditor's "present but unmapped" check
// on VNProjectUI stays meaningful.
function clean(o: any): any {
  const out: any = {};
  for (const k of Object.keys(o)) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

export function mapInGameUI(project: any, ctx: ExportContext): any {
  const u = project.ui || {};

  const dialogueBox = clean({
    image: uiImage(u.dialogueBoxImage, ctx),
    borderImage: uiImage(u.dialogueBoxBorderImage, ctx),
    color: u.dialogueBoxColor,
    opacity: u.dialogueBoxOpacity != null ? u.dialogueBoxOpacity / 100 : 0.85, // engine stores 0..100
    borderRadius: u.dialogueBoxBorderRadius,
    width: u.dialogueBoxWidth,                 // % of screen
    height: u.dialogueBoxHeight ?? u.dialogueBoxMinHeight, // px
    bottomMargin: u.dialogueBoxBottomMargin,   // px
    padding: u.dialogueBoxPadding,             // px
    x: u.dialogueBoxX, y: u.dialogueBoxY,      // % overrides (else bottom-center)
    sizeMode: u.dialogueBoxSizeMode,
    slice: u.dialogueBoxSlice,
    textPad: clean({ top: u.dialogueTextPaddingTop, bottom: u.dialogueTextPaddingBottom, left: u.dialogueTextPaddingLeft, right: u.dialogueTextPaddingRight }),
    textFont: resolveFont(u.dialogueTextFont, ctx),
    nameFont: resolveFont(u.dialogueNameFont, ctx),
    namePlate: { show: true },
  });

  const namebox = clean({
    image: uiImage(u.nameboxImage, ctx),
    color: u.nameboxColor,
    opacity: u.nameboxOpacity != null ? u.nameboxOpacity / 100 : undefined,
    padding: u.nameboxPadding,
    borderRadius: u.nameboxBorderRadius,
    offsetX: u.nameboxOffsetX, offsetY: u.nameboxOffsetY,
    x: u.nameboxX, y: u.nameboxY, width: u.nameboxWidth, height: u.nameboxHeight,
  });

  // Initial game settings (volumes / text speed / skip / auto-advance) applied at startup.
  const d = u.defaultGameSettings;
  const settings = d ? clean({
    textSpeed: d.textSpeed, musicVolume: d.musicVolume, sfxVolume: d.sfxVolume, voiceVolume: d.voiceVolume,
    ambientVolume: d.ambientVolume, enableSkip: d.enableSkip, autoAdvance: d.autoAdvance, autoAdvanceDelay: d.autoAdvanceDelay,
  }) : undefined;

  // Confirmation popups for destructive actions (quit / new game / erase save). Text + basic styling.
  const cd = u.confirmDialogs;
  const variantStyle = (v: any) => v ? clean({ bg: v.backgroundColor, overlay: v.overlayColor, radius: v.borderRadius, confirmColor: v.confirmButtonColor, cancelColor: v.cancelButtonColor, titleFont: v.titleFont ? resolveFont(v.titleFont, ctx) : undefined, messageFont: v.messageFont ? resolveFont(v.messageFont, ctx) : undefined }) : {};
  const confirm = cd ? clean({
    quit: clean({ title: cd.quitTitle, message: cd.quitMessage, confirm: cd.quitConfirmLabel, cancel: cd.quitCancelLabel, ...variantStyle(cd.variants?.quit) }),
    newGame: clean({ title: cd.newGameTitle, message: cd.newGameMessage, confirm: cd.newGameConfirmLabel, cancel: cd.newGameCancelLabel, ...variantStyle(cd.variants?.newGame) }),
    eraseSave: clean({ title: cd.eraseSaveTitle, message: cd.eraseSaveMessage, confirm: cd.eraseSaveConfirmLabel, cancel: cd.eraseSaveCancelLabel, ...variantStyle(cd.variants?.eraseSave) }),
  }) : undefined;

  const choiceMenu = clean({
    layout: 'list',
    image: uiImage(u.choiceButtonImage, ctx),
    hoverImage: uiImage(u.choiceHoverImage, ctx),
    color: u.choiceButtonColor,
    hoverColor: u.choiceHoverColor,
    opacity: u.choiceButtonOpacity != null ? u.choiceButtonOpacity / 100 : undefined,
    borderRadius: u.choiceButtonBorderRadius,
    padding: u.choiceButtonPadding,
    width: u.choiceButtonWidth, height: u.choiceButtonHeight, // px
    textFont: resolveFont(u.choiceTextFont, ctx),
  });

  const inputBox = clean({
    image: uiImage(u.inputBoxImage, ctx),
    color: u.inputBoxColor,
    borderColor: undefined,
    borderRadius: u.inputBoxBorderRadius,
    submitLabel: u.inputSubmitLabel,
    submitColor: u.inputSubmitColor,
    promptFont: resolveFont(u.inputPromptFont, ctx),
    fieldFont: resolveFont(u.inputFieldFont, ctx),
    submitFont: resolveFont(u.inputSubmitFont, ctx),
  });

  // Which quick-menu buttons the author enabled (log/save/load/auto/skip), plus fine placement/size.
  const quickMenu = clean({
    position: u.quickMenuPosition,
    showLog: u.quickMenuShowLog, showSave: u.quickMenuShowSave, showLoad: u.quickMenuShowLoad,
    showAutoAdvance: u.quickMenuShowAutoAdvance, showSkipForward: u.quickMenuShowSkipForward,
    showSkipBackward: u.quickMenuShowSkipBackward,
    color: u.quickMenuColor, borderRadius: u.quickMenuBorderRadius, opacity: u.quickMenuOpacity != null ? u.quickMenuOpacity / 100 : undefined,
    x: u.quickMenuX, y: u.quickMenuY, width: u.quickMenuWidth, height: u.quickMenuHeight,
  });

  // Audit VNProjectUI so any styling field we don't carry surfaces in the completeness report.
  ctx.audit('inGameUI', u, [
    // screen pointers (mapScreens consumes these) + player-char vars + editor bookkeeping
    'titleScreenId', 'settingsScreenId', 'saveScreenId', 'loadScreenId', 'pauseScreenId', 'gameHudScreenId',
    'characterCreatorScreenId', 'playerCharacterVarId', 'playerCharacterNameVarId',
    // dialogue box
    'dialogueBoxImage', 'dialogueBoxBorderImage', 'dialogueBoxColor', 'dialogueBoxOpacity', 'dialogueBoxBorderRadius',
    'dialogueBoxWidth', 'dialogueBoxHeight', 'dialogueBoxMinHeight', 'dialogueBoxBottomMargin', 'dialogueBoxPadding',
    'dialogueBoxX', 'dialogueBoxY', 'dialogueBoxSizeMode', 'dialogueBoxSlice', 'dialogueBorderPadding',
    'dialogueTextPaddingTop', 'dialogueTextPaddingBottom', 'dialogueTextPaddingLeft', 'dialogueTextPaddingRight',
    'dialogueTextFont', 'dialogueNameFont',
    // namebox
    'nameboxImage', 'nameboxColor', 'nameboxOpacity', 'nameboxPadding', 'nameboxHorizontalPadding', 'nameboxBorderRadius',
    'nameboxOffsetX', 'nameboxOffsetY', 'nameboxSizeMode', 'nameboxX', 'nameboxY', 'nameboxWidth', 'nameboxHeight',
    // choices
    'choiceButtonImage', 'choiceButtonBorderImage', 'choiceHoverImage', 'choiceButtonColor', 'choiceHoverColor',
    'choiceButtonOpacity', 'choiceButtonBorderRadius', 'choiceButtonPadding', 'choiceButtonWidth', 'choiceButtonHeight',
    'choiceButtonSizeMode', 'choiceButtonSlice', 'choiceBorderPadding', 'choiceButtonX', 'choiceButtonY', 'choiceTextFont',
    // input box
    'inputBoxImage', 'inputBoxBorderImage', 'inputBoxColor', 'inputBoxOpacity', 'inputBoxBorderRadius', 'inputBoxPadding',
    'inputBoxWidth', 'inputBoxHeight', 'inputBoxSizeMode', 'inputBoxSlice', 'inputBorderPadding', 'inputBoxX', 'inputBoxY',
    'inputSubmitLabel', 'inputSubmitColor', 'inputSubmitBorderRadius', 'inputSubmitImage',
    'inputPromptFont', 'inputFieldFont', 'inputSubmitFont',
    // quick menu (styling + per-button visibility)
    'quickMenuPosition', 'quickMenuColor', 'quickMenuOpacity', 'quickMenuBorderRadius', 'quickMenuFloatOverDialogue',
    'quickMenuShowSkipBackward', 'quickMenuShowLog', 'quickMenuShowAutoAdvance', 'quickMenuShowSkipForward',
    'quickMenuShowSave', 'quickMenuShowLoad', 'quickMenuIndependentLayout', 'quickMenuButtons', 'quickMenuCustomButtons',
    'quickMenuX', 'quickMenuY', 'quickMenuWidth', 'quickMenuHeight',
    // fonts + settings + confirm (📦/🟡)
    'dialogueNameFont', 'dialogueTextFont', 'choiceTextFont', 'defaultGameSettings', 'confirmDialogs',
    // dynamic-UI reactive states (❌ T2, deferred below)
    'dialogueReactiveStates', 'quickMenuReactiveStates', 'speakerEmphasisEnabled', 'speakerEmphasisDim',
    'speakerEmphasisScale', 'dialogueRevealHighlight', 'voicePacedText',
  ]);

  // Speaker emphasis: dim non-speaking characters + scale the speaker when a line is spoken.
  const emphasis = u.speakerEmphasisEnabled
    ? clean({ enabled: true, dim: u.speakerEmphasisDim ?? 0.5, scale: u.speakerEmphasisScale ?? 1.0 })
    : undefined;

  // Reactive textbox states — condition-gated dialogue-box restyle (first match wins, applied per line).
  const reactiveTextbox = Array.isArray(u.dialogueReactiveStates)
    ? u.dialogueReactiveStates.map((s: any) => clean({ if: mapConditions(s.conditions), hideNamebox: s.hideNamebox || undefined, ...textboxStyle(s, ctx) })).filter((s: any) => s.if)
    : undefined;
  // Reactive quick-menu states — condition-gated bar restyle / hide.
  const reactiveQuickMenu = Array.isArray(u.quickMenuReactiveStates)
    ? u.quickMenuReactiveStates.map((s: any) => clean({ if: mapConditions(s.conditions), color: s.color, opacity: s.opacity != null ? s.opacity / 100 : undefined, hide: s.hide || undefined })).filter((s: any) => s.if)
    : undefined;
  // Reusable textbox themes (project.textboxThemes) a Dialogue line can select per-line by id.
  let textboxThemes: any;
  if (project.textboxThemes) {
    textboxThemes = {};
    for (const th of Object.values<any>(project.textboxThemes)) textboxThemes[th.id] = textboxStyle(th, ctx);
  }
  // Karaoke reveal highlight (colour the text as it types).
  const rh = u.dialogueRevealHighlight;
  const revealHighlight = rh?.enabled ? clean({ enabled: true, style: rh.style || 'color', color: rh.color, useSpeakerColor: rh.useSpeakerColor || undefined }) : undefined;

  return clean({ dialogueBox, namebox, choiceMenu, inputBox, quickMenu, emphasis, settings, confirm,
    gameHudScreen: u.gameHudScreenId || undefined,
    reactiveTextbox: reactiveTextbox && reactiveTextbox.length ? reactiveTextbox : undefined,
    reactiveQuickMenu: reactiveQuickMenu && reactiveQuickMenu.length ? reactiveQuickMenu : undefined,
    textboxThemes, revealHighlight });
}
