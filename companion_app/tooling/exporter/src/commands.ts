// Command mapping: engine VNCommand[] → .vnbundle node[]. Two non-trivial transforms:
//  (1) flat Branch markers (BranchStart/ElseIf/Else/End, paired by branchId) → one nested `branch`;
//  (2) engine asset IDs + PascalCase types → relative asset paths + camelCase node types.
// Deferred (Tier-3) and unportable (Tier-X) commands are dropped, flagged, and set a capability.
import { ExportContext } from './context.js';
import { resolveParticleConfig } from './particles.js';

const POSITION: Record<string, { x: number; y: number }> = {
  'left': { x: 0.25, y: 1 }, 'center': { x: 0.5, y: 1 }, 'right': { x: 0.75, y: 1 },
  'off-left': { x: -0.15, y: 1 }, 'off-right': { x: 1.15, y: 1 },
};

function mapPosition(pos: any): { x: number; y: number } {
  if (typeof pos === 'string') return POSITION[pos] ?? { x: 0.5, y: 1 };
  if (pos && typeof pos === 'object') return { x: (pos.x ?? 50) / 100, y: (pos.y ?? 100) / 100 };
  return { x: 0.5, y: 1 };
}

function mapTransition(t: any, durSec: any): any {
  if (!t || t === 'instant' || t === 'cut') return undefined;
  return { type: String(t), durationMs: Math.round((durSec ?? 0.5) * 1000) };
}

export function mapConditions(conds: any): any[] | undefined {
  if (!Array.isArray(conds) || conds.length === 0) return undefined;
  return conds.map((c: any, i: number) => {
    const o: any = { var: c.variableId, op: c.operator };
    if (c.value !== undefined) o.value = c.value;
    if (i > 0 && c.connector) o.join = c.connector;
    return o;
  });
}

function mapSetOp(op: any, ctx: ExportContext): string {
  if (op === 'random') { ctx.warn('SetVariable "random" not supported in v1 — treated as "set"'); return 'set'; }
  return op || 'set';
}

function mapAction(a: any, ctx: ExportContext): any | null {
  switch (a.type) {
    case 'SetVariable': return { action: 'setVar', var: a.variableId, op: mapSetOp(a.operator, ctx), value: a.value };
    case 'ResetVariable': return { action: 'resetVar', var: a.variableId };
    case 'JumpToScene': return { action: 'jumpToScene', scene: a.targetSceneId };
    case 'JumpToLabel': return { action: 'jumpToLabel', label: a.targetLabel };
    case 'PlaySound': { const audio = ctx.audio(a.audioId); return audio ? { action: 'playSound', audio } : null; }
    // In-game button/hotspot actions: show/hide a scene overlay element, open a screen, etc. These map
    // to the same normalized action verbs the runtime's action dispatcher handles.
    case 'ShowElement': return { action: 'showElement', target: a.targetElementId ?? a.targetId };
    case 'HideElement': return { action: 'hideElement', target: a.targetElementId ?? a.targetId };
    case 'GoToScreen': return { action: 'goToScreen', screen: a.targetScreenId };
    case 'ToggleScreen': return { action: 'toggleScreen', screen: a.targetScreenId };
    case 'ReturnToGame': return { action: 'returnToGame' };
    case 'OpenURL': return { action: 'openUrl', url: a.url };
    case 'CallCommonEvent': return { action: 'callCommonEvent', event: a.commonEventId };
    case 'StartNewGame': return { action: 'startNewGame' };
    case 'QuitToTitle': return { action: 'quitToTitle' };
    case 'ContinueGame': return { action: 'returnToGame' };
    // quick-menu / player-control verbs (also usable from scene buttons/hotspots)
    case 'ShowLog': return { action: 'showLog' };
    case 'ToggleAutoAdvance': return { action: 'toggleAuto' };
    case 'ToggleSkip': return { action: 'toggleSkip' };
    case 'SkipBackward': return { action: 'skipBackward' };
    case 'SaveGame': return { action: 'goToScreen', screen: ctx.project.ui?.saveScreenId };
    case 'LoadGame': return { action: 'goToScreen', screen: ctx.project.ui?.loadScreenId };
    case 'OpenPauseMenu': return { action: 'goToScreen', screen: ctx.project.ui?.pauseScreenId };
    default: ctx.warn(`action "${a.type}" not supported in v1 — dropped`); return null;
  }
}

// Map a primary action + optional extra actions[] into a single normalized list (used by buttons/hotspots).
function mapActionList(primary: any, extra: any, ctx: ExportContext): any[] {
  const out: any[] = [];
  if (primary) { const m = mapAction(primary, ctx); if (m) out.push(m); }
  if (Array.isArray(extra)) for (const a of extra) { const m = mapAction(a, ctx); if (m) out.push(m); }
  return out;
}

const TIER2_NAME: Record<string, string> = {
  ShakeScreen: 'shakeScreen', TintScreen: 'tintScreen',
  PanZoomScreen: 'panZoomScreen', ResetScreenEffects: 'resetScreenEffects', FlashScreen: 'flashScreen',
  SetScreenOverlayEffect: 'setScreenOverlay', StopParticles: 'stopParticles', Lightning: 'lightning',
  Flashlight: 'flashlight', Fireworks: 'fireworks', PlaceLights: 'placeLights', ClearLights: 'clearLights',
  SetTimeOfDay: 'setTimeOfDay',
};

function stripBase(c: any): any {
  const { id, type, conditions, liveConditions, modifiers, layer, parallaxDepth, ...rest } = c;
  void id; void type; void conditions; void liveConditions; void modifiers; void layer; void parallaxDepth;
  return rest;
}

// Keys every command may carry that the exporter handles or intentionally ignores (conditions is
// mapped; modifiers/liveConditions/layer/parallaxDepth are runtime-parallelism/z metadata we skip).
const BASE_CMD_KEYS = ['conditions', 'modifiers', 'liveConditions', 'layer', 'parallaxDepth'];
// Per-command: the type-specific keys the exporter consumes. Anything present in the data but NOT
// listed here (or in BASE_CMD_KEYS) is reported by the coverage auditor as an unmapped property.
const COMMAND_HANDLED: Record<string, string[]> = {
  Dialogue: ['text', 'characterId', 'characterSource', 'voiceAudioId', 'textEffect', 'textSpeed', 'timeLimit', 'timeLimitLocked', 'showTimer', 'textboxThemeId', 'keepOpenDuringChoices'],
  Choice: ['options'],
  SetVariable: ['variableId', 'operator', 'value', 'randomMin', 'randomMax'],
  Jump: ['targetSceneId'], Label: ['labelId'], JumpToLabel: ['labelId'],
  CallCommonEvent: ['commonEventId', 'arguments'],
  ShowCharacter: ['characterId', 'expressionId', 'position', 'transition', 'duration', 'characterSource', 'scale', 'inverted', 'hidePreviousTransition'],
  HideCharacter: ['characterId', 'transition', 'duration', 'characterSource'],
  MoveCharacter: ['characterId', 'toPosition', 'duration', 'easing', 'characterSource'],
  SetBackground: ['backgroundId', 'backgroundColor', 'transition', 'duration'],
  PlayMusic: ['audioId', 'loop', 'fadeDuration', 'volume'],
  StopMusic: ['fadeDuration'],
  PlaySoundEffect: ['audioId', 'volume', 'loop'],
  StopSoundEffect: ['audioId', 'fadeDuration'],
  Wait: ['duration', 'waitForInput', 'waitIndefinitelyForInput'],
  SpawnParticles: ['particleTag', 'config', 'duration'],
  StopParticles: ['particleTag'],
  PlayMovie: ['videoId', 'waitsForCompletion', 'trimStart', 'trimEnd', 'displayMode', 'loop', 'holdLastFrame', 'transition', 'transitionDuration', 'x', 'y', 'width', 'height', 'opacity', 'objectFit'],
  StopMovie: [],
  ShowScreen: ['screenId'],
  ShowImage: ['imageId', 'x', 'y', 'width', 'height', 'rotation', 'opacity', 'scaleX', 'scaleY', 'flipX', 'flipY', 'transition', 'duration', 'trimStart', 'trimEnd', 'fitToContent', 'contentBox'],
  ShowText: ['text', 'x', 'y', 'fontSize', 'fontFamily', 'color', 'width', 'height', 'fontWeight', 'fontStyle', 'letterSpacing', 'textShadow', 'textGradient', 'textBorder', 'textAlign', 'verticalAlign', 'transition', 'duration', 'rotation', 'flipX', 'flipY', 'liveText'],
  ShowButton: ['text', 'x', 'y', 'width', 'height', 'anchorX', 'anchorY', 'backgroundColor', 'textColor', 'fontSize', 'fontWeight', 'textAlign', 'paddingX', 'borderRadius', 'opacity', 'image', 'hoverImage', 'onClick', 'actions', 'clickSound', 'waitForClick', 'quickMenuMode', 'transition', 'duration', 'rotation', 'flipX', 'flipY', 'showConditions', 'contentBox'],
  ShowHotSpot: ['name', 'x', 'y', 'width', 'height', 'shape', 'trigger', 'actions', 'conditions', 'acceptedTag', 'highlightColor', 'visible', 'advanceOnTrigger'],
  HideImage: ['targetCommandId', 'transition', 'duration'],
  HideText: ['targetCommandId', 'transition', 'duration'],
  HideButton: ['targetCommandId', 'transition', 'duration'],
  HideHotSpot: ['targetCommandId', 'transition', 'duration'],
  TweenElement: ['targetId', 'targetType', 'duration', 'easing', 'waitForCompletion', 'x', 'y', 'width', 'height', 'opacity', 'rotation', 'scaleX', 'scaleY', 'scale', 'fontSize', 'borderRadius'],
  CreditRoll: ['entries', 'duration', 'scrollSpeed', 'backgroundColor', 'textColor', 'allowSkip', 'onComplete', 'backgrounds', 'media'],
};

function mapCommand(c: any, ctx: ExportContext): any | null {
  // Only audit commands we map field-by-field; Tier-2 passthrough carries all params, and deferred
  // (Tier-3/X) commands are already surfaced via capability warnings.
  if (COMMAND_HANDLED[c.type]) ctx.audit('command:' + c.type, c, [...BASE_CMD_KEYS, ...COMMAND_HANDLED[c.type]]);
  const base: any = { id: c.id };
  const cond = mapConditions(c.conditions);
  if (cond) base.if = cond;

  switch (c.type) {
    case 'Dialogue': {
      const n: any = { ...base, type: 'say', text: c.text ?? '' };
      if (c.characterId) n.speaker = c.characterId;
      if (c.voiceAudioId) { const v = ctx.audio(c.voiceAudioId); if (v) n.voice = v; }
      if (c.textEffect?.type) n.effects = [{ effect: c.textEffect.type, params: { speed: c.textEffect.speed, intensity: c.textEffect.intensity } }];
      if (c.textboxThemeId) n.textboxTheme = c.textboxThemeId;        // per-line textbox theme override
      if (c.keepOpenDuringChoices) n.keepOpenDuringChoices = true;    // keep this box open under the next Choice
      if (c.textSpeed != null) n.textSpeed = c.textSpeed;             // per-line reveal speed (chars/sec-ish)
      if (c.timeLimit != null && c.timeLimit > 0) {                   // auto-advance N s after typing finishes
        n.timeLimit = c.timeLimit;
        if (c.timeLimitLocked) n.timeLimitLocked = true;             // locked: only the timer advances
        if (c.showTimer) n.showTimer = true;
      }
      if (c.characterSource === 'player') ctx.warn('Dialogue characterSource "player" (player-created character) not in v1 — treated as the fixed character');
      return n;
    }
    case 'Choice': {
      const options = (c.options || []).map((o: any) => {
        const opt: any = { text: o.text ?? '' };
        const oc = mapConditions(o.conditions); if (oc) opt.if = oc;
        const acts = (o.actions || []).map((a: any) => mapAction(a, ctx)).filter(Boolean);
        if (acts.length === 1 && acts[0].action === 'jumpToScene' && !acts[0].if) opt.goto = acts[0].scene; // readable sugar
        else if (acts.length) opt.actions = acts;
        return opt;
      });
      return { ...base, type: 'choice', options };
    }
    case 'SetVariable': return { ...base, type: 'set', var: c.variableId, op: mapSetOp(c.operator, ctx), value: c.value };
    case 'Jump': return { ...base, type: 'jump', scene: c.targetSceneId };
    case 'Label': return { ...base, type: 'label', name: c.labelId };
    case 'JumpToLabel': return { ...base, type: 'jumpToLabel', label: c.labelId };
    case 'CallCommonEvent': return { ...base, type: 'callCommonEvent', event: c.commonEventId };

    case 'ShowCharacter': {
      const n: any = { ...base, type: 'showCharacter', character: c.characterId, sprite: c.expressionId, position: mapPosition(c.position) };
      const tr = mapTransition(c.transition, c.duration); if (tr) n.transition = tr;
      if (c.scale != null) n.scale = c.scale;              // sprite scale multiplier
      if (c.inverted) n.flipX = true;                      // mirror horizontally
      if (c.hidePreviousTransition) n.hidePreviousTransition = c.hidePreviousTransition;
      if (c.characterSource === 'player') ctx.warn('ShowCharacter characterSource "player" not in v1');
      return n;
    }
    case 'HideCharacter': { const n: any = { ...base, type: 'hideCharacter', character: c.characterId }; const tr = mapTransition(c.transition, c.duration); if (tr) n.transition = tr; return n; }
    case 'MoveCharacter': return { ...base, type: 'moveCharacter', character: c.characterId, to: mapPosition(c.toPosition), durationMs: Math.round((c.duration ?? 0.5) * 1000), easing: c.easing };
    case 'SetCharacterLayer': ctx.warn('SetCharacterLayer not mapped in v1 — dropped'); return null;

    case 'SetBackground': {
      if (c.backgroundColor) ctx.warn('SetBackground backgroundColor not in v1 — using no image');
      const n: any = { ...base, type: 'setBackground', image: ctx.bg(c.backgroundId) ?? null };
      const tr = mapTransition(c.transition, c.duration); if (tr) n.transition = tr;
      return n;
    }
    case 'PlayMusic': { const audio = ctx.audio(c.audioId); if (!audio) { ctx.warn('PlayMusic audio missing — dropped'); return null; } const n: any = { ...base, type: 'playMusic', audio, loop: c.loop !== false }; if (c.fadeDuration) n.fadeMs = Math.round(c.fadeDuration * 1000); if (c.volume != null) n.volume = c.volume; return n; }
    case 'StopMusic': { const n: any = { ...base, type: 'stopMusic' }; if (c.fadeDuration) n.fadeMs = Math.round(c.fadeDuration * 1000); return n; }
    case 'PlaySoundEffect': { const audio = ctx.audio(c.audioId); if (!audio) { ctx.warn('PlaySoundEffect audio missing — dropped'); return null; } const n: any = { ...base, type: 'playSound', audio }; if (c.volume != null) n.volume = c.volume; return n; }
    case 'StopSoundEffect': { const n: any = { ...base, type: 'stopSound' }; if (c.audioId) { const a = ctx.audio(c.audioId); if (a) n.audio = a; } return n; }
    case 'Wait': return { ...base, type: 'wait', ms: Math.round((c.duration ?? 0) * 1000) };

    case 'PlayMovie': { ctx.capabilities.video = true; const n: any = { ...base, type: 'playMovie', params: stripBase(c) }; const v = ctx.video(c.videoId); if (v) n.video = v; return n; }
    case 'StopMovie': return { ...base, type: 'stopMovie' };
    case 'ShowScreen': return { ...base, type: 'showScreen', screen: c.screenId };

    // ── scene-overlay elements: author-placed image/text/button/hotspot drawn on the scene, tracked
    //    by this command's id so Hide*/TweenElement can target them. ──
    case 'ShowImage': {
      const img = ctx.image(c.imageId) ?? ctx.bg(c.imageId) ?? ctx.video(c.imageId);
      if (!img) { ctx.warn('ShowImage: asset missing — dropped'); return null; }
      const n: any = { ...base, type: 'showImage', image: img, x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? 20, height: c.height ?? 20 };
      if (c.rotation) n.rotation = c.rotation;
      if (c.opacity != null) n.opacity = c.opacity;
      if (c.scaleX != null) n.scaleX = c.scaleX;
      if (c.scaleY != null) n.scaleY = c.scaleY;
      if (c.flipX) n.flipX = true;
      if (c.flipY) n.flipY = true;
      const tr = mapTransition(c.transition, c.duration); if (tr) n.transition = tr;
      return n;
    }
    case 'ShowText': {
      const n: any = { ...base, type: 'showText', text: c.text ?? '', x: c.x ?? 0, y: c.y ?? 0, fontSize: c.fontSize ?? 24, color: c.color ?? '#ffffff' };
      if (c.width != null) n.width = c.width;
      if (c.height != null) n.height = c.height;
      if (c.fontWeight === 'bold') n.bold = true;
      if (c.fontStyle === 'italic') n.italic = true;
      if (c.textAlign) n.align = c.textAlign;
      if (c.verticalAlign) n.valign = c.verticalAlign;
      if (c.letterSpacing != null) n.letterSpacing = c.letterSpacing;
      if (c.fontFamily) { const fp = ctx.font(c.fontFamily); if (fp) n.font = fp; }
      if (c.textShadow?.enabled) n.textShadow = { x: c.textShadow.offsetX, y: c.textShadow.offsetY, blur: c.textShadow.blur, color: c.textShadow.color };
      if (c.textBorder?.enabled) n.textBorder = { width: c.textBorder.width, color: c.textBorder.color };
      if (c.liveText) n.liveText = true;
      if (c.rotation) n.rotation = c.rotation;
      const tr = mapTransition(c.transition, c.duration); if (tr) n.transition = tr;
      return n;
    }
    case 'ShowButton': {
      const n: any = { ...base, type: 'showButton', text: c.text ?? '', x: c.x ?? 0, y: c.y ?? 0,
        anchorX: c.anchorX ?? 0.5, anchorY: c.anchorY ?? 0.5,
        actions: mapActionList(c.onClick, c.actions, ctx) };
      if (c.width != null) n.width = c.width;
      if (c.height != null) n.height = c.height;
      if (c.backgroundColor) n.backgroundColor = c.backgroundColor;
      if (c.textColor) n.color = c.textColor;
      if (c.fontSize != null) n.fontSize = c.fontSize;
      if (c.fontWeight === 'bold') n.bold = true;
      if (c.textAlign) n.align = c.textAlign;
      if (c.borderRadius != null) n.borderRadius = c.borderRadius;
      if (c.opacity != null) n.opacity = c.opacity;
      if (c.image?.id) { const im = ctx.image(c.image.id) ?? ctx.video(c.image.id); if (im) n.image = im; }
      if (c.hoverImage?.id) { const im = ctx.image(c.hoverImage.id); if (im) n.hoverImage = im; }
      if (c.waitForClick) n.waitForClick = true;
      if (c.quickMenuMode) n.quickMenuMode = true;
      if (c.clickSound) { const s = ctx.audio(c.clickSound); if (s) n.clickSound = s; }
      const cond = mapConditions(c.showConditions); if (cond) n.showIf = cond;
      const tr = mapTransition(c.transition, c.duration); if (tr) n.transition = tr;
      return n;
    }
    case 'ShowHotSpot': {
      const n: any = { ...base, type: 'showHotSpot', x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? 10, height: c.height ?? 10,
        shape: c.shape ?? 'rect', trigger: c.trigger ?? 'click', actions: mapActionList(null, c.actions, ctx) };
      if (c.visible) n.visible = true;
      if (c.highlightColor) n.highlightColor = c.highlightColor;
      if (c.advanceOnTrigger) n.advanceOnTrigger = true;
      const cond = mapConditions(c.conditions); if (cond) n.showIf = cond;
      return n;
    }
    case 'HideImage':
    case 'HideText':
    case 'HideButton':
    case 'HideHotSpot': {
      const n: any = { ...base, type: 'hideElement', target: c.targetCommandId };
      const tr = mapTransition(c.transition, c.duration); if (tr) n.transition = tr;
      return n;
    }
    case 'TweenElement': {
      const n: any = { ...base, type: 'tween', target: c.targetId, targetType: c.targetType,
        durationMs: Math.round((c.duration ?? 0.5) * 1000), easing: c.easing };
      for (const k of ['x', 'y', 'width', 'height', 'opacity', 'rotation', 'scaleX', 'scaleY', 'scale', 'fontSize', 'borderRadius'])
        if (c[k] != null) n[k] = c[k];
      return n;
    }
    case 'CreditRoll': {
      const entries = Array.isArray(c.entries)
        ? c.entries.map((e: any) => ({ kind: e.kind ?? 'credit', label: e.label ?? '', value: e.value }))
        : [];
      const n: any = { ...base, type: 'creditRoll', entries,
        durationMs: Math.round((c.duration ?? 15) * 1000),
        backgroundColor: c.backgroundColor ?? '#000000', textColor: c.textColor ?? '#ffffff',
        allowSkip: c.allowSkip !== false, onComplete: c.onComplete ?? 'advance' };
      if (c.scrollSpeed != null) n.scrollSpeed = c.scrollSpeed;
      // Slideshow backgrounds (resolved image paths + per-slide seconds).
      if (Array.isArray(c.backgrounds)) {
        const bgs = c.backgrounds
          .map((b: any) => ({ image: ctx.image(b.assetId) ?? ctx.bg(b.assetId), seconds: b.displayDuration ?? 5 }))
          .filter((b: any) => b.image);
        if (bgs.length) n.backgrounds = bgs;
      }
      // Foreground media (logos/art positioned over the scroll). Static in v1 (show/hide timing dropped).
      if (Array.isArray(c.media)) {
        const media = c.media
          .map((m: any) => ({ image: ctx.image(m.assetId) ?? ctx.bg(m.assetId), x: m.x ?? 0, y: m.y ?? 0, width: m.width ?? 20, height: m.height ?? 20, opacity: m.opacity ?? 1 }))
          .filter((m: any) => m.image);
        if (media.length) n.media = media;
      }
      return n;
    }
    case 'SpawnParticles': {
      ctx.capabilities.particles = true;
      const pcfg = resolveParticleConfig(c.config);
      if (!pcfg) { ctx.warn('SpawnParticles with a custom (non-preset) config — not rendered in v1'); return null; }
      return { ...base, type: 'spawnParticles', tag: c.particleTag ?? c.id, duration: c.duration ?? 0, config: pcfg };
    }
    case 'StopParticles': return { ...base, type: 'stopParticles', tag: c.particleTag ?? undefined };

    // Tier-3 deferred → drop + capability + warn
    case 'ShowMiniGame': ctx.capabilities.miniGames = true; ctx.warn('ShowMiniGame dropped (mini-games not in console v1)'); return null;
    case 'ShowMap': ctx.capabilities.maps = true; ctx.warn('ShowMap dropped (maps not in console v1)'); return null;
    case 'GiveItem': case 'UseItem': case 'DestroyItem': case 'ShowItem': case 'RestockCollection': case 'BuyItem': case 'SellItem':
      ctx.capabilities.inventory = true; ctx.warn(`${c.type} dropped (inventory not in console v1)`); return null;
    // Tier-X unportable
    case 'RunScript': ctx.capabilities.scripts = true; ctx.warn('RunScript dropped (inline scripts are not portable to console)'); return null;

    default:
      if (typeof c.type === 'string' && /phone/i.test(c.type)) { ctx.capabilities.phone = true; ctx.warn(`${c.type} dropped (in-game phone not in console v1)`); return null; }
      if (typeof c.type === 'string' && TIER2_NAME[c.type]) return { ...base, type: TIER2_NAME[c.type], params: stripBase(c) };
      ctx.warn(`command "${c.type}" not recognized — dropped`); return null;
  }
}

// ── flat Branch markers → nested `branch` node ──
export function mapCommands(cmds: any[], ctx: ExportContext): any[] {
  const out: any[] = [];
  let i = 0;
  while (i < cmds.length) {
    const c = cmds[i];
    if (c.type === 'BranchStart') {
      const { node, next } = foldBranch(cmds, i, ctx);
      if (node) out.push(node);
      i = next;
      continue;
    }
    if (c.type === 'BranchElseIf' || c.type === 'BranchElse' || c.type === 'BranchEnd') { i++; continue; } // stray marker
    const n = mapCommand(c, ctx);
    if (n) out.push(n);
    i++;
  }
  return out;
}

function foldBranch(cmds: any[], start: number, ctx: ExportContext): { node: any; next: number } {
  const branchId = cmds[start].branchId;
  let depth = 0;
  let end = -1;
  const markerIdx: number[] = []; // this branch's start + elseif/else, at depth 1
  for (let j = start; j < cmds.length; j++) {
    const t = cmds[j].type;
    if (t === 'BranchStart') { depth++; if (depth === 1) markerIdx.push(j); }
    else if (t === 'BranchEnd') { if (depth === 1) { end = j; break; } else depth--; }
    else if ((t === 'BranchElseIf' || t === 'BranchElse') && depth === 1 && cmds[j].branchId === branchId) markerIdx.push(j);
  }
  if (end === -1) { ctx.warn('unterminated BranchStart — treating the rest as one arm'); end = cmds.length; }
  const bounds = [...markerIdx, end];
  const arms: any[] = [];
  for (let k = 0; k < bounds.length - 1; k++) {
    const marker = cmds[bounds[k]];
    const body = cmds.slice(bounds[k] + 1, bounds[k + 1]);
    const arm: any = { commands: mapCommands(body, ctx) };
    if (marker.type === 'BranchElse') arm.else = true;
    else arm.if = mapConditions(marker.conditions) ?? [];
    arms.push(arm);
  }
  return { node: { id: cmds[start].id, type: 'branch', branches: arms }, next: end + 1 };
}
