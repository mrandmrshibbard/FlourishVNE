// Custom UI screens (title / menu / pause / …) → the bundle's ui.screens. v1 renders the core element
// types (Image / Text / Button); system widgets (SaveSlotGrid, SettingsSlider/Toggle, CGGallery, …) are
// skipped + warned. Elements are positioned by x/y/w/h (percent) + anchorX/anchorY (0..1). Buttons carry
// one normalized action.
import { ExportContext } from './context.js';
import { mapConditions } from './commands.js';

const UNSUPPORTED_ELEMENTS = new Set([
  'CGGallery', 'HotZone',
]);

export interface MappedUI {
  titleScreen?: string;
  saveScreen?: string;
  loadScreen?: string;
  settingsScreen?: string;
  pauseScreen?: string;
  screens: any[];
}

export function mapScreens(project: any, ctx: ExportContext): MappedUI {
  const ui = project.ui || {};
  const screens: any[] = [];
  for (const s of Object.values<any>(project.uiScreens || {})) {
    ctx.audit('screen', s, ['background', 'backgroundColor', 'music', 'ambientNoise', 'elements', 'effects', 'openHotkey',
      'transitionIn', 'transitionOut', 'transitionDuration', 'transitionInDuration', 'transitionOutDuration',
      'category', 'showDialogue', 'passThrough', 'backdropOpacity', 'backdropBlur', 'hudAboveDialogue', 'hudNonBlocking',
      'pauseSceneWhileOpen', 'resetElementVisibilityOnOpen', 'onCloseBehavior', 'onCloseActions', 'additionalBackgrounds',
      'backgroundParallaxDepth', 'backgroundLayer', 'backgroundTransition', 'backgroundTransitionDuration', 'parallax', 'winCondition']);
    // Save-slot grids act as "save" on the save screen, "load" everywhere else (the engine infers
    // this from which ui.*ScreenId the screen is).
    const slotMode = s.id === ui.saveScreenId ? 'save' : 'load';
    const elements: any[] = [];
    for (const e of Object.values<any>(s.elements || {})) {
      const m = mapElement(e, ctx, slotMode);
      if (m) { Object.assign(m, baseExtras(e, ctx)); elements.push(m); }
      else if (UNSUPPORTED_ELEMENTS.has(e.type)) ctx.warn(`UI element "${e.type}" on screen "${s.name}" isn't rendered in v1 — skipped`);
    }
    // Stable sort by stacking order (higher = nearer the viewer); undefined layer keeps insertion order.
    elements.sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));
    const bgId = s.background?.assetId;
    const scr: any = {
      id: s.id,
      name: s.name,
      background: bgId ? (ctx.bg(bgId) ?? ctx.image(bgId) ?? null) : null,
      backgroundColor: s.background?.type === 'color' ? s.background.value : (s.backgroundColor || undefined),
      music: s.music?.audioId ? (ctx.audio(s.music.audioId) ?? undefined) : undefined,
      elements,
    };
    if (s.ambientNoise?.audioId) scr.ambient = ctx.audio(s.ambientNoise.audioId) ?? undefined;
    if (s.openHotkey) scr.openHotkey = String(s.openHotkey).toLowerCase();  // press this key to toggle the screen
    // Overlay/HUD behaviour: whether this screen sits OVER the running story (transparent) vs replaces it.
    if (s.showDialogue) scr.showDialogue = true;                 // keep the story dialogue box visible
    if (s.passThrough) scr.passThrough = true;                   // click-through (non-blocking HUD)
    if (s.hudNonBlocking) scr.hudNonBlocking = true;
    if (s.hudAboveDialogue) scr.hudAboveDialogue = true;
    if (s.pauseSceneWhileOpen) scr.pauseSceneWhileOpen = true;
    if (s.resetElementVisibilityOnOpen) scr.resetElementVisibilityOnOpen = true;
    if (s.backdropOpacity != null) scr.backdropOpacity = s.backdropOpacity;   // dim behind the screen (0..1)
    if (s.backdropBlur != null) scr.backdropBlur = s.backdropBlur;            // px
    if (s.backgroundParallaxDepth != null) scr.backgroundParallaxDepth = s.backgroundParallaxDepth;
    // Extra background planes (stacked, each with its own parallax depth).
    if (Array.isArray(s.additionalBackgrounds) && s.additionalBackgrounds.length) {
      scr.additionalBackgrounds = s.additionalBackgrounds.map((b: any) => {
        const id = b.background?.assetId;
        return { image: id ? (ctx.bg(id) ?? ctx.image(id)) : null, layer: b.layer, parallaxDepth: b.parallaxDepth };
      }).filter((b: any) => b.image);
    }
    // On-close behaviour: resume / advance the story, or run actions.
    if (s.onCloseBehavior && s.onCloseBehavior !== 'default') scr.onCloseBehavior = s.onCloseBehavior;
    if (Array.isArray(s.onCloseActions) && s.onCloseActions.length) scr.onCloseActions = s.onCloseActions.map((a: any) => mapScreenAction(a, ctx)).filter((a: any) => a && a.action !== 'none');
    // Drag-drop win condition: fire actions when all draggables are placed (or a variable is met).
    if (s.winCondition) {
      const w = s.winCondition;
      scr.winCondition = { type: w.type ?? 'allPlaced', var: w.variableId, operator: w.operator, value: w.value,
        actions: (Array.isArray(w.actions) ? w.actions : []).map((a: any) => mapScreenAction(a, ctx)).filter((a: any) => a && a.action !== 'none') };
    }
    // Static overlay atmosphere declared on the screen (rain/snow/fog/shimmer/…). Normalized to the
    // same param dict the runtime's dynamic setScreenOverlay handler consumes (effectType/intensity/color).
    if (Array.isArray(s.effects) && s.effects.length) {
      scr.overlays = s.effects.map((fx: any) => ({ effectType: fx.type, intensity: fx.intensity ?? 1, color: fx.color, ...(fx.params || {}) }));
    }
    // Screen enter/exit transition (fade / slide / crossfade). Duration falls back through the
    // legacy single field. Only carried when non-trivial so default screens stay byte-clean.
    const tin = s.transitionIn && s.transitionIn !== 'none' ? s.transitionIn : undefined;
    const tout = s.transitionOut && s.transitionOut !== 'none' ? s.transitionOut : undefined;
    if (tin) { scr.transitionIn = tin; scr.transitionInMs = s.transitionInDuration ?? s.transitionDuration ?? 300; }
    if (tout) { scr.transitionOut = tout; scr.transitionOutMs = s.transitionOutDuration ?? s.transitionDuration ?? 300; }
    screens.push(scr);
  }
  return {
    titleScreen: ui.titleScreenId || undefined,
    saveScreen: ui.saveScreenId || undefined,
    loadScreen: ui.loadScreenId || undefined,
    settingsScreen: ui.settingsScreenId || undefined,
    pauseScreen: ui.pauseScreenId || undefined,
    screens,
  };
}

function place(e: any): any {
  const o: any = { id: e.id, x: e.x ?? 0, y: e.y ?? 0, w: e.width ?? 20, h: e.height ?? 8, anchorX: e.anchorX ?? 0, anchorY: e.anchorY ?? 0 };
  if (e.opacity != null) o.opacity = e.opacity;      // 0..1
  if (e.layer != null) o.layer = e.layer;            // stacking order (higher = nearer)
  // Visibility gating shared by every element (BaseUIElement): show/hide conditions + startHidden.
  const cond = mapConditions(e.conditions);
  if (cond) o.if = cond;                              // hidden until conditions pass
  const dis = mapConditions(e.disabledConditions);
  if (dis) o.disabledIf = dis;                        // rendered but non-interactive when true
  if (e.startHidden) o.startHidden = true;            // invisible until a ShowElement action
  return o;
}

// Base-element features shared by ALL element types (entry transition, click/hover sound, parallax,
// fit-to-content, condition-driven appearance states). Merged onto every mapped element in mapScreens.
function baseExtras(e: any, ctx: ExportContext): any {
  const o: any = {};
  if (e.transitionIn && e.transitionIn !== 'none') {
    o.transitionIn = e.transitionIn;                                     // fade/slideUp/…/scale
    o.transitionInMs = e.transitionDuration ?? 300;
    if (e.transitionDelay) o.transitionDelayMs = e.transitionDelay;
  }
  if (e.clickSoundId) { const s = ctx.audio(e.clickSoundId); if (s) o.clickSound = s; }
  if (e.hoverSoundId) { const s = ctx.audio(e.hoverSoundId); if (s) o.hoverSound = s; }
  if (e.parallaxDepth != null) o.parallaxDepth = e.parallaxDepth;        // mouse/camera parallax
  if (e.fitToContent) o.fitToContent = true;
  // Drag-drop puzzle props (Tier-3): a draggable element the player moves onto matching hotspots.
  if (e.draggable) {
    o.draggable = true;
    if (e.dragTag) o.dragTag = e.dragTag;
    if (e.snapBack) o.snapBack = true;
    if (e.snapToHotSpot) o.snapToHotSpot = true;
    if (e.hideOnDrop) o.hideOnDrop = true;
    if (e.boundItemId) o.boundItemId = e.boundItemId;
  }
  if (Array.isArray(e.appearanceStates) && e.appearanceStates.length) {
    o.appearanceStates = e.appearanceStates.map((a: any) => {
      const s: any = { if: mapConditions(a.conditions) };
      if (a.primaryColor) s.color = a.primaryColor;
      if (a.image?.id) { const im = ctx.image(a.image.id); if (im) s.image = im; }
      if (a.opacity != null) s.opacity = a.opacity;
      if (a.scale != null) s.scale = a.scale;
      if (a.rotation != null) s.rotation = a.rotation;
      if (a.glowColor) s.glowColor = a.glowColor;
      if (a.glowSize != null) s.glowSize = a.glowSize;
      if (a.transitionMs != null) s.transitionMs = a.transitionMs;
      return s;
    }).filter((s: any) => s.if);
    if (!o.appearanceStates.length) delete o.appearanceStates;
  }
  return o;
}

// Resolve a VNFontSettings object → the flat font fields the runtime consumes (fontSize/color/bold/
// italic/align/font-path/shadow/border/gradient). Shared by screen elements AND the In-Game UI config.
export function resolveFont(f: any, ctx: ExportContext): any {
  const o: any = {};
  if (!f) return o;
  if (f.size) o.fontSize = f.size;
  if (f.color) o.color = f.color;
  if (f.weight === 'bold') o.bold = true;
  if (f.italic) o.italic = true;
  if (f.align) o.align = f.align;
  if (f.letterSpacing != null) o.letterSpacing = f.letterSpacing;
  const fp = ctx.font(f.family);
  if (fp) o.font = fp;
  if (f.textShadow?.enabled) o.textShadow = { x: f.textShadow.offsetX, y: f.textShadow.offsetY, blur: f.textShadow.blur, color: f.textShadow.color };
  if (f.textBorder?.enabled) o.textBorder = { width: f.textBorder.width, color: f.textBorder.color };
  if (f.textGradient?.enabled) o.textGradient = { type: f.textGradient.type, angle: f.textGradient.angle, colors: f.textGradient.colors };
  return o;
}

function fontFields(e: any, ctx: ExportContext): any {
  return resolveFont(e.font, ctx);
}

// Base keys handled by place() + baseExtras() for every element, so the auditor treats them as covered.
const BASE_KEYS = ['x', 'y', 'width', 'height', 'anchorX', 'anchorY', 'opacity', 'layer', 'conditions', 'disabledConditions', 'startHidden',
  'transitionIn', 'transitionDuration', 'transitionDelay', 'clickSoundId', 'hoverSoundId', 'parallaxDepth', 'fitToContent', 'appearanceStates', 'name', 'interactive',
  'draggable', 'dragTag', 'snapBack', 'snapToHotSpot', 'hideOnDrop', 'boundItemId'];
const FONT_KEYS = ['family', 'size', 'color', 'weight', 'italic', 'align', 'letterSpacing', 'textShadow', 'textBorder', 'textGradient'];

function mapElement(e: any, ctx: ExportContext, slotMode: string): any | null {
  if (e.font) ctx.audit('font', e.font, FONT_KEYS);
  switch (e.type) {
    case 'Image': {
      ctx.audit('element:Image', e, [...BASE_KEYS, 'image', 'background', 'objectFit']);
      const id = e.image?.id ?? (e.background?.type !== 'color' ? e.background?.assetId : undefined);
      const img = id ? (ctx.image(id) ?? ctx.bg(id)) : undefined;
      const o: any = { type: 'image', ...place(e), image: img ?? null, objectFit: e.objectFit || 'contain' };
      if (e.background?.type === 'color') o.backgroundColor = e.background.value;
      return o;
    }
    case 'Text': {
      ctx.audit('element:Text', e, [...BASE_KEYS, 'text', 'font', 'textAlign', 'verticalAlign', 'textShadow', 'textGradient']);
      const o: any = { type: 'text', ...place(e), text: e.text ?? '', ...fontFields(e, ctx) };
      if (e.textAlign) o.align = e.textAlign;
      if (e.verticalAlign) o.valign = e.verticalAlign;
      // Deprecated element-level shadow/gradient (superseded by font.*): honor only as a fallback.
      if (!o.textShadow && e.textShadow?.enabled) o.textShadow = { x: e.textShadow.offsetX, y: e.textShadow.offsetY, blur: e.textShadow.blur, color: e.textShadow.color };
      if (!o.textGradient && e.textGradient?.enabled) o.textGradient = { type: e.textGradient.type, angle: e.textGradient.angle, colors: e.textGradient.colors };
      return o;
    }
    case 'Button': {
      ctx.audit('element:Button', e, [...BASE_KEYS, 'text', 'font', 'action', 'actions', 'image', 'hoverImage', 'backgroundColor', 'hoverBackgroundColor', 'borderRadius', 'paddingX', 'contentBox', 'clickSoundId', 'hoverSoundId']);
      const o: any = { type: 'button', ...place(e), text: e.text ?? '', ...fontFields(e, ctx), action: mapScreenAction(e.action, ctx) };
      // Multiple actions (all fire on click): carry the full list; single `action` kept for back-compat.
      if (Array.isArray(e.actions) && e.actions.length) o.actions = e.actions.map((a: any) => mapScreenAction(a, ctx)).filter((a: any) => a && a.action !== 'none');
      if (e.image?.id) { const im = ctx.image(e.image.id); if (im) o.image = im; }
      if (e.hoverImage?.id) { const im = ctx.image(e.hoverImage.id); if (im) o.hoverImage = im; }
      if (e.backgroundColor) o.backgroundColor = e.backgroundColor;
      if (e.hoverBackgroundColor) o.hoverBackgroundColor = e.hoverBackgroundColor;
      if (e.borderRadius != null) o.borderRadius = e.borderRadius;
      return o;
    }
    case 'SaveSlotGrid': {
      ctx.audit('element:SaveSlotGrid', e, [...BASE_KEYS, 'slotCount', 'emptySlotText', 'font', 'slotLayout', 'slotRects',
        'slotBackgroundColor', 'slotBorderColor', 'slotHoverBorderColor', 'slotHeaderColor', 'slotTextColor', 'emptySlotTextColor',
        'emptySlotFont', 'pageIndicatorFont', 'prevButtonText', 'nextButtonText', 'navButtonFont',
        'hideInfoBar', 'hideSlotLabel', 'hideEraseButtons']);
      const o: any = { type: 'saveSlotGrid', ...place(e), mode: slotMode, slotCount: e.slotCount ?? 8, emptySlotText: e.emptySlotText ?? '[ Empty ]', ...fontFields(e, ctx) };
      for (const k of ['slotBackgroundColor', 'slotBorderColor', 'slotHoverBorderColor', 'slotHeaderColor', 'slotTextColor', 'emptySlotTextColor', 'prevButtonText', 'nextButtonText'])
        if (e[k] != null) o[k] = e[k];
      if (e.slotLayout === 'free' && Array.isArray(e.slotRects)) o.slotRects = e.slotRects.map((r: any) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
      if (e.hideSlotLabel) o.hideSlotLabel = true;
      if (e.hideEraseButtons) o.hideEraseButtons = true;
      if (e.hideInfoBar) o.hideInfoBar = true;
      return o;
    }
    case 'SettingsSlider': {
      ctx.audit('element:SettingsSlider', e, [...BASE_KEYS, 'setting', 'thumbColor', 'trackColor', 'thumbImage', 'trackImage', 'variableId', 'minValue', 'maxValue', 'actions']);
      const o: any = { type: 'settingsSlider', ...place(e), setting: e.setting ?? 'volume', thumbColor: e.thumbColor, trackColor: e.trackColor };
      if (e.thumbImage?.id) { const im = ctx.image(e.thumbImage.id); if (im) o.thumbImage = im; }
      if (e.trackImage?.id) { const im = ctx.image(e.trackImage.id); if (im) o.trackImage = im; }
      if (e.variableId) { o.var = e.variableId; if (e.minValue != null) o.min = e.minValue; if (e.maxValue != null) o.max = e.maxValue; }
      return o;
    }
    case 'SettingsToggle': {
      ctx.audit('element:SettingsToggle', e, [...BASE_KEYS, 'setting', 'text', 'label', 'font', 'checkboxColor', 'variableId', 'checkedValue', 'uncheckedValue', 'checkedImage', 'uncheckedImage', 'actions']);
      const o: any = { type: 'settingsToggle', ...place(e), setting: e.setting ?? '', text: e.text ?? e.label ?? '', ...fontFields(e, ctx) };
      if (e.checkboxColor) o.checkboxColor = e.checkboxColor;
      if (e.variableId) { o.variableId = e.variableId; o.checkedValue = e.checkedValue; o.uncheckedValue = e.uncheckedValue; }
      if (e.checkedImage?.id) { const im = ctx.image(e.checkedImage.id); if (im) o.checkedImage = im; }
      if (e.uncheckedImage?.id) { const im = ctx.image(e.uncheckedImage.id); if (im) o.uncheckedImage = im; }
      return o;
    }
    case 'Checkbox': {
      ctx.audit('element:Checkbox', e, [...BASE_KEYS, 'label', 'variableId', 'checkedValue', 'uncheckedValue', 'font', 'checkboxColor', 'labelColor']);
      const o: any = { type: 'checkbox', ...place(e), label: e.label ?? '', var: e.variableId, checkedValue: e.checkedValue ?? true, uncheckedValue: e.uncheckedValue ?? false, ...fontFields(e, ctx) };
      if (e.checkboxColor) o.checkboxColor = e.checkboxColor;
      if (e.labelColor) o.labelColor = e.labelColor;
      return o;
    }
    case 'TextInput': {
      ctx.audit('element:TextInput', e, [...BASE_KEYS, 'placeholder', 'variableId', 'font', 'backgroundColor', 'borderColor', 'maxLength']);
      const o: any = { type: 'textInput', ...place(e), placeholder: e.placeholder ?? '', var: e.variableId, ...fontFields(e, ctx) };
      if (e.backgroundColor) o.backgroundColor = e.backgroundColor;
      if (e.borderColor) o.borderColor = e.borderColor;
      if (e.maxLength != null) o.maxLength = e.maxLength;
      return o;
    }
    case 'Dropdown': {
      ctx.audit('element:Dropdown', e, [...BASE_KEYS, 'variableId', 'options', 'font', 'arrowSide', 'backgroundColor', 'borderColor', 'hoverColor']);
      const opts = Array.isArray(e.options) ? e.options.map((op: any) => ({ label: op.label ?? String(op.value ?? ''), value: op.value })) : [];
      const o: any = { type: 'dropdown', ...place(e), var: e.variableId, options: opts, ...fontFields(e, ctx) };
      if (e.backgroundColor) o.backgroundColor = e.backgroundColor;
      if (e.borderColor) o.borderColor = e.borderColor;
      return o;
    }
    case 'HotSpot': {
      ctx.audit('element:HotSpot', e, [...BASE_KEYS, 'shape', 'trigger', 'acceptedElementIds', 'acceptTag', 'highlightColor', 'visible']);
      const acts = (Array.isArray(e.actions) ? e.actions : []).map((a: any) => mapScreenAction(a, ctx)).filter((a: any) => a && a.action !== 'none');
      const o: any = { type: 'hotSpot', ...place(e), shape: e.shape ?? 'rect', trigger: e.trigger ?? 'click', actions: acts };
      if (Array.isArray(e.acceptedElementIds)) o.acceptedElementIds = e.acceptedElementIds;
      if (e.acceptTag) o.acceptTag = e.acceptTag;
      if (e.highlightColor) o.highlightColor = e.highlightColor;
      if (e.visible) o.visible = true;
      return o;
    }
    case 'CharacterPreview': {
      ctx.audit('element:CharacterPreview', e, [...BASE_KEYS, 'characterId', 'characterSource', 'expressionId', 'layerVariableMap']);
      return { type: 'characterPreview', ...place(e), character: e.characterId, expression: e.expressionId, layerVars: e.layerVariableMap || {} };
    }
    case 'AssetCycler': {
      ctx.audit('element:AssetCycler', e, [...BASE_KEYS, 'characterId', 'layerId', 'variableId', 'assetIds', 'label', 'font',
        'showAssetName', 'arrowColor', 'arrowSize', 'backgroundColor', 'visible']);
      const o: any = { type: 'assetCycler', ...place(e), character: e.characterId, layer: e.layerId, var: e.variableId,
        assetIds: Array.isArray(e.assetIds) ? e.assetIds : [], ...fontFields(e, ctx) };
      if (e.label) o.label = e.label;
      if (e.showAssetName) o.showAssetName = true;
      if (e.arrowColor) o.arrowColor = e.arrowColor;
      if (e.backgroundColor) o.backgroundColor = e.backgroundColor;
      return o;
    }
    case 'Customizer': {
      ctx.audit('element:Customizer', e, [...BASE_KEYS, 'characterId', 'expressionId', 'categories', 'layout', 'previewPercent', 'font',
        'previewBackgroundColor', 'previewBorderColor', 'previewBorderRadius', 'backgroundColor', 'borderColor', 'borderRadius',
        'swatchSize', 'swatchGap', 'selectedColor', 'arrowColor', 'showLabels', 'showRandomize', 'showReset', 'randomizeLabel', 'resetLabel',
        // styling knobs approximated by the runtime
        'previewBackgroundImage', 'hidePickersPanel', 'buttonColor', 'buttonTextColor', 'arrowImage', 'arrowSize', 'backgroundImage', 'optionMeta',
        'previewRect', 'pickersRect']);
      const cats = Array.isArray(e.categories) ? e.categories.map((c: any) => ({ layer: c.layerId, var: c.variableId, label: c.label, pickerStyle: c.pickerStyle || 'arrows' })) : [];
      const o: any = { type: 'customizer', ...place(e), character: e.characterId, expression: e.expressionId, categories: cats,
        layout: e.layout || 'preview-left', ...fontFields(e, ctx) };
      if (e.previewPercent != null) o.previewPercent = e.previewPercent;
      if (e.showLabels) o.showLabels = true;
      if (e.previewBackgroundColor) o.previewBackgroundColor = e.previewBackgroundColor;
      if (e.backgroundColor) o.backgroundColor = e.backgroundColor;
      if (e.selectedColor) o.selectedColor = e.selectedColor;
      if (e.arrowColor) o.arrowColor = e.arrowColor;
      if (e.showRandomize) { o.showRandomize = true; o.randomizeLabel = e.randomizeLabel || 'Randomize'; }
      if (e.showReset) { o.showReset = true; o.resetLabel = e.resetLabel || 'Reset'; }
      return o;
    }
    case 'Meter': {
      ctx.audit('element:Meter', e, [...BASE_KEYS, 'variableId', 'minValue', 'maxValue', 'direction', 'fillColor', 'fillColorEnd',
        'backgroundColor', 'borderColor', 'borderRadius', 'showLabel', 'label', 'labelFont', 'showValue', 'valueFormat', 'valueFont',
        'style', 'segmentCount', 'segmentGap', 'alignX', 'alignY',
        // icon/animation styling — carried as-is where simple, otherwise approximated by the runtime
        'fillImage', 'backgroundImage', 'iconImage', 'iconEmptyImage', 'iconCount', 'iconStep', 'iconSize', 'iconGap',
        'lowThresholdPct', 'lowAnimations', 'lowFlashColor', 'changeAnimationUp', 'changeAnimationDown', 'changeFlashColorUp', 'changeFlashColorDown']);
      const o: any = { type: 'meter', ...place(e), var: e.variableId, min: e.minValue ?? 0, max: e.maxValue ?? 100, style: e.style ?? 'bar' };
      if (e.direction) o.direction = e.direction;
      if (e.fillColor) o.fillColor = e.fillColor;
      if (e.fillColorEnd) o.fillColorEnd = e.fillColorEnd;
      if (e.backgroundColor) o.backgroundColor = e.backgroundColor;
      if (e.borderColor) o.borderColor = e.borderColor;
      if (e.borderRadius != null) o.borderRadius = e.borderRadius;
      if (e.showLabel) { o.showLabel = true; o.label = e.label ?? ''; }
      if (e.showValue) { o.showValue = true; o.valueFormat = e.valueFormat ?? 'value'; }
      if (e.style === 'segments') { o.segmentCount = e.segmentCount ?? 10; o.segmentGap = e.segmentGap ?? 2; }
      if (e.alignX) o.alignX = e.alignX;
      if (e.alignY) o.alignY = e.alignY;
      // icon-mode art (hearts/stars): carry the two symbol textures + count/size so the runtime can draw them
      if (e.style === 'icons') {
        const full = e.iconImage?.id ? ctx.image(e.iconImage.id) : undefined;
        const empty = e.iconEmptyImage?.id ? ctx.image(e.iconEmptyImage.id) : undefined;
        if (full) o.iconImage = full;
        if (empty) o.iconEmptyImage = empty;
        o.iconCount = e.iconCount ?? 5;
        if (e.iconSize != null) o.iconSize = e.iconSize;
        if (e.iconGap != null) o.iconGap = e.iconGap;
      }
      return o;
    }
    default:
      return null;
  }
}

function mapScreenAction(a: any, ctx: ExportContext): any {
  if (!a || !a.type) return { action: 'none' };
  ctx.audit('screenAction:' + a.type, a, ['targetSceneId', 'targetScreenId', 'targetLabel', 'url', 'newTab', 'variableId', 'operator', 'value', 'conditions']);
  switch (a.type) {
    case 'StartNewGame': return { action: 'startNewGame' };
    case 'GoToScreen': return { action: 'goToScreen', screen: a.targetScreenId };
    case 'ReturnToPreviousScreen': return { action: 'back' };
    case 'ReturnToGame': return { action: 'returnToGame' };
    case 'QuitToTitle': return { action: 'quitToTitle' };
    case 'QuitGame': return { action: 'quit' };
    case 'OpenURL': return { action: 'openUrl', url: a.url };
    case 'SetVariable': return { action: 'setVar', var: a.variableId, op: a.operator || 'set', value: a.value };
    case 'JumpToScene': return { action: 'jumpToScene', scene: a.targetSceneId };
    case 'JumpToLabel': return { action: 'jumpToLabel', label: a.targetLabel };
    case 'LoadGame': return { action: 'goToScreen', screen: ctx.project.ui?.loadScreenId };
    case 'SaveGame': return { action: 'goToScreen', screen: ctx.project.ui?.saveScreenId };
    case 'ResetVariable': return { action: 'resetVar', var: a.variableId };
    case 'ToggleScreen': return { action: 'toggleScreen', screen: a.targetScreenId };
    case 'ShowElement': return { action: 'showElement', target: a.targetElementId ?? a.targetId };
    case 'HideElement': return { action: 'hideElement', target: a.targetElementId ?? a.targetId };
    case 'PlaySound': { const audio = ctx.audio(a.audioId); return audio ? { action: 'playSound', audio } : { action: 'none' }; }
    case 'CallCommonEvent': return { action: 'callCommonEvent', event: a.commonEventId };
    // quick-menu / player-control verbs
    case 'ShowLog': return { action: 'showLog' };
    case 'ToggleAutoAdvance': return { action: 'toggleAuto' };
    case 'ToggleSkip': return { action: 'toggleSkip' };
    case 'SkipBackward': return { action: 'skipBackward' };
    case 'OpenPauseMenu': return { action: 'goToScreen', screen: ctx.project.ui?.pauseScreenId };
    case 'ContinueGame': return { action: 'returnToGame' };
    default: ctx.warn(`screen button action "${a.type}" not supported in v1 — no-op`); return { action: 'none' };
  }
}
