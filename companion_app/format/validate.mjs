#!/usr/bin/env node
/**
 * .vnbundle format self-check — dependency-free (Node built-ins only).
 *
 * Validates every sample bundle under ./samples against the v0.1.0 contract: structural rules
 * (node shapes, required fields) AND referential integrity that JSON Schema can't express —
 * goto/jump/label targets resolve, variable references are declared, character/sprite references
 * exist, asset paths exist on disk, common-event references resolve. Also surfaces capability
 * warnings (a bundle using a deferred/Tier-X subsystem is valid but not-yet-console-portable).
 *
 * This is the Phase-1 consistency checker, not the exporter. The machine-checkable field contract
 * lives in ./schemas (run those with any JSON-Schema 2020-12 validator once the TS tooling exists).
 *
 * Usage:  node format/validate.mjs            # validate all samples
 *         node format/validate.mjs <dir>      # validate one bundle folder
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPECTED_VERSION = '0.1.0';

const NODE_TYPES = new Set([
  'say', 'choice', 'set', 'jump', 'label', 'jumpToLabel', 'branch', 'callCommonEvent', 'wait', 'group',
  'textInput', 'showCharacter', 'hideCharacter', 'setCharacterSprite', 'moveCharacter', 'setBackground',
  'playMusic', 'stopMusic', 'playSound', 'stopSound', 'showImage', 'hideImage', 'showText', 'hideText',
  'showButton', 'hideButton', 'showHotSpot', 'hideHotSpot', 'tween', 'creditRoll', 'playMovie', 'stopMovie',
  'shakeScreen', 'tintScreen', 'panZoomScreen', 'resetScreenEffects', 'flashScreen', 'setScreenOverlay',
  'spawnParticles', 'stopParticles', 'lightning', 'flashlight', 'fireworks', 'placeLights', 'clearLights',
  'showScreen', 'setTimeOfDay',
]);
const CONDITION_OPS = new Set(['==', '!=', '>', '<', '>=', '<=', 'is true', 'is false', 'contains', 'startsWith']);
const NO_VALUE_OPS = new Set(['is true', 'is false']);
const SET_OPS = new Set(['set', 'add', 'subtract', 'multiply', 'divide', 'toggle']);
const ACTION_TYPES = new Set(['setVar', 'resetVar', 'jumpToScene', 'jumpToLabel', 'playMusic', 'stopMusic', 'playSound', 'stopSound', 'showScreen', 'save', 'load', 'deleteSave']);
const DEFERRED_CAPS = ['scripts', 'plugins', 'miniGames', 'phone', 'inventory', 'maps'];

function loadJson(errors, dir, rel) {
  const p = join(dir, rel);
  if (!existsSync(p)) { errors.push(`missing file referenced by manifest: ${rel}`); return null; }
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { errors.push(`invalid JSON in ${rel}: ${e.message}`); return null; }
}

export function validateBundle(dir) {
  const errors = [];
  const warnings = [];
  const name = dir.split(/[\\/]/).pop();

  const manifest = loadJson(errors, dir, 'manifest.json');
  if (!manifest) return { name, errors, warnings };

  // ── manifest ──
  if (manifest.bundle_format_version !== EXPECTED_VERSION)
    errors.push(`bundle_format_version ${JSON.stringify(manifest.bundle_format_version)} != expected ${EXPECTED_VERSION}`);
  if (!manifest.game?.id) errors.push('manifest.game.id missing');
  if (!manifest.game?.title) errors.push('manifest.game.title missing');
  const files = manifest.files || {};
  if (!files.scenes) errors.push('manifest.files.scenes missing');
  for (const cap of DEFERRED_CAPS)
    if (manifest.capabilities?.[cap]) warnings.push(`capability "${cap}" is true → not-yet-console-portable (v1 flags this)`);

  // ── load referenced files ──
  const scenesDoc = files.scenes ? loadJson(errors, dir, files.scenes) : null;
  const varsDoc = files.variables ? loadJson(errors, dir, files.variables) : null;
  const charsDoc = files.characters ? loadJson(errors, dir, files.characters) : null;
  const logicDoc = files.logic ? loadJson(errors, dir, files.logic) : null;
  if (files.save) loadJson(errors, dir, files.save); // parse-check only here

  // ── collect ids ──
  const varIds = new Set((varsDoc?.variables || []).map(v => v.id));
  for (const v of varsDoc?.variables || []) {
    if (!v.id || !v.name || !v.type) { errors.push(`variable missing id/name/type: ${JSON.stringify(v)}`); continue; }
    const t = v.type, d = v.default;
    const ok = (t === 'string' && typeof d === 'string') || (t === 'number' && typeof d === 'number') || (t === 'boolean' && typeof d === 'boolean');
    if (!ok) errors.push(`variable "${v.id}" default ${JSON.stringify(d)} does not match type "${t}"`);
    if (v.scope && !['local', 'global', 'persistent'].includes(v.scope)) errors.push(`variable "${v.id}" bad scope "${v.scope}"`);
  }

  const charSprites = new Map(); // charId -> Set(spriteId)
  for (const c of charsDoc?.characters || []) {
    const sprites = new Set((c.sprites || []).map(s => s.id));
    charSprites.set(c.id, sprites);
    if (c.defaultSprite && !sprites.has(c.defaultSprite)) errors.push(`character "${c.id}" defaultSprite "${c.defaultSprite}" not in sprites`);
    for (const s of c.sprites || []) {
      if (Array.isArray(s.layers)) for (const lp of s.layers) assetExists(errors, dir, lp, `character ${c.id} sprite ${s.id} layer`);
      else assetExists(errors, dir, s.image, `character ${c.id} sprite ${s.id}`);
    }
    if (c.font) assetExists(errors, dir, c.font, `character ${c.id} font`);
  }

  const sceneIds = new Set((scenesDoc?.scenes || []).map(s => s.id));
  const eventIds = new Set((logicDoc?.commonEvents || []).map(e => e.id));

  const ctx = { errors, warnings, dir, varIds, charSprites, sceneIds, eventIds };

  if (manifest.entry?.scene && !sceneIds.has(manifest.entry.scene))
    errors.push(`entry.scene "${manifest.entry.scene}" not found in scenes`);

  // ── walk scenes ──
  for (const scene of scenesDoc?.scenes || []) {
    const labels = new Set();
    collectLabels(scene.commands || [], labels);
    const seenIds = new Set();
    walkNodes(scene.commands || [], { ...ctx, sceneId: scene.id, labels, seenIds });
  }
  // common-event command bodies (labels are scene-local; CE labels validated within the CE)
  for (const ev of logicDoc?.commonEvents || []) {
    const labels = new Set(); collectLabels(ev.commands || [], labels);
    walkNodes(ev.commands || [], { ...ctx, sceneId: `commonEvent:${ev.id}`, labels, seenIds: new Set() });
  }

  return { name, errors, warnings };
}

function collectLabels(nodes, out) {
  for (const n of nodes || []) {
    if (n?.type === 'label' && n.name) out.add(n.name);
    if (n?.type === 'branch') for (const arm of n.branches || []) collectLabels(arm.commands, out);
    if (n?.type === 'group') collectLabels(n.commands, out);
  }
}

function assetExists(errors, dir, ref, where) {
  if (ref == null) return;
  if (typeof ref !== 'string') { errors.push(`${where}: asset ref is not a string`); return; }
  if (/^(data:|https?:|flourish-asset:)/i.test(ref)) { errors.push(`${where}: web-style asset ref "${ref}" (must be a relative assets/ path)`); return; }
  if (!existsSync(join(dir, ref))) errors.push(`${where}: asset file not found: ${ref}`);
}

function checkConditions(conds, ctx, where) {
  if (conds == null) return;
  if (!Array.isArray(conds)) { ctx.errors.push(`${where}: "if" must be an array`); return; }
  conds.forEach((c, i) => {
    if (!c || typeof c !== 'object') { ctx.errors.push(`${where}: condition[${i}] not an object`); return; }
    if (!ctx.varIds.has(c.var)) ctx.errors.push(`${where}: condition references undeclared variable "${c.var}"`);
    if (!CONDITION_OPS.has(c.op)) ctx.errors.push(`${where}: condition bad op "${c.op}"`);
    if (!NO_VALUE_OPS.has(c.op) && c.value === undefined) ctx.errors.push(`${where}: condition op "${c.op}" requires a value`);
    if (i > 0 && c.join && !['and', 'or'].includes(c.join)) ctx.errors.push(`${where}: condition bad join "${c.join}"`);
  });
}

function checkVarSet(vs, ctx, where) {
  if (!ctx.varIds.has(vs.var)) ctx.errors.push(`${where}: set references undeclared variable "${vs.var}"`);
  if (vs.op && !SET_OPS.has(vs.op)) ctx.errors.push(`${where}: bad set op "${vs.op}"`);
}

function checkAction(a, ctx, where) {
  if (!ACTION_TYPES.has(a.action)) { ctx.errors.push(`${where}: unknown/reserved action "${a.action}" (not in the v1 subset)`); return; }
  checkConditions(a.if, ctx, `${where} action(${a.action})`);
  if (a.action === 'setVar' || a.action === 'resetVar') { if (!ctx.varIds.has(a.var)) ctx.errors.push(`${where}: action "${a.action}" references undeclared variable "${a.var}"`); }
  if (a.action === 'jumpToScene') { if (!ctx.sceneIds.has(a.scene)) ctx.errors.push(`${where}: jumpToScene target scene "${a.scene}" not found`); }
  if (a.action === 'jumpToLabel') { if (!ctx.labels.has(a.label)) ctx.errors.push(`${where}: jumpToLabel target "${a.label}" not in scene ${ctx.sceneId}`); }
}

function walkNodes(nodes, ctx) {
  if (!Array.isArray(nodes)) { ctx.errors.push(`scene ${ctx.sceneId}: commands is not an array`); return; }
  for (const n of nodes) {
    const where = `scene ${ctx.sceneId} node ${n?.id ?? '(no id)'}`;
    if (!n || typeof n !== 'object') { ctx.errors.push(`${where}: node not an object`); continue; }
    if (!n.id) ctx.errors.push(`${where}: missing id`);
    else if (ctx.seenIds.has(n.id)) ctx.errors.push(`${where}: duplicate node id "${n.id}"`);
    else ctx.seenIds.add(n.id);
    if (!NODE_TYPES.has(n.type)) { ctx.errors.push(`${where}: unknown/reserved node type "${n.type}"`); continue; }
    checkConditions(n.if, ctx, where);

    switch (n.type) {
      case 'say':
        if (typeof n.text !== 'string') ctx.errors.push(`${where}: say requires text`);
        if (n.speaker != null && !ctx.charSprites.has(n.speaker)) ctx.errors.push(`${where}: say speaker "${n.speaker}" not a known character`);
        if (n.voice) assetExists(ctx.errors, ctx.dir, n.voice, where);
        break;
      case 'choice':
        if (!Array.isArray(n.options) || n.options.length < 1) { ctx.errors.push(`${where}: choice needs options`); break; }
        n.options.forEach((o, i) => {
          const ow = `${where} option[${i}]`;
          if (typeof o.text !== 'string') ctx.errors.push(`${ow}: missing text`);
          checkConditions(o.if, ctx, ow);
          if (o.goto && !ctx.sceneIds.has(o.goto)) ctx.errors.push(`${ow}: goto scene "${o.goto}" not found`);
          if (o.gotoLabel && !ctx.labels.has(o.gotoLabel)) ctx.errors.push(`${ow}: gotoLabel "${o.gotoLabel}" not in scene ${ctx.sceneId}`);
          for (const vs of o.set || []) checkVarSet(vs, ctx, ow);
          for (const a of o.actions || []) checkAction(a, ctx, ow);
        });
        break;
      case 'set': checkVarSet(n, ctx, where); break;
      case 'jump': if (!ctx.sceneIds.has(n.scene)) ctx.errors.push(`${where}: jump scene "${n.scene}" not found`); break;
      case 'jumpToLabel': if (!ctx.labels.has(n.label)) ctx.errors.push(`${where}: jumpToLabel "${n.label}" not in scene ${ctx.sceneId}`); break;
      case 'label': if (!n.name) ctx.errors.push(`${where}: label needs name`); break;
      case 'branch':
        if (!Array.isArray(n.branches)) { ctx.errors.push(`${where}: branch needs branches[]`); break; }
        for (const arm of n.branches) {
          if (arm.if) checkConditions(arm.if, ctx, `${where} branch-arm`);
          walkNodes(arm.commands || [], ctx);
        }
        break;
      case 'group': walkNodes(n.commands || [], ctx); break;
      case 'callCommonEvent': if (!ctx.eventIds.has(n.event)) ctx.errors.push(`${where}: callCommonEvent "${n.event}" not found`); break;
      case 'textInput': if (!ctx.varIds.has(n.var)) ctx.errors.push(`${where}: textInput var "${n.var}" undeclared`); break;
      case 'showCharacter': case 'hideCharacter': case 'setCharacterSprite': case 'moveCharacter': {
        if (!ctx.charSprites.has(n.character)) { ctx.errors.push(`${where}: character "${n.character}" not found`); break; }
        if (n.sprite && !ctx.charSprites.get(n.character).has(n.sprite)) ctx.errors.push(`${where}: sprite "${n.sprite}" not on character "${n.character}"`);
        break;
      }
      case 'setBackground': if (n.image) assetExists(ctx.errors, ctx.dir, n.image, where); break;
      case 'playMusic': case 'playSound': if (n.audio) assetExists(ctx.errors, ctx.dir, n.audio, where); break;
      case 'playMovie': if (n.video) assetExists(ctx.errors, ctx.dir, n.video, where); break;
      default: /* Tier-2 presentation nodes: structural presence only in v0.1.0 */ break;
    }
  }
}

// ── runner (only when executed directly, not when imported by the GUI pipeline) ──
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const arg = process.argv[2];
  let bundleDirs;
  if (arg) bundleDirs = [arg];
  else {
    const samplesDir = join(HERE, 'samples');
    bundleDirs = readdirSync(samplesDir).map(d => join(samplesDir, d)).filter(p => statSync(p).isDirectory());
  }

  let anyError = false;
  console.log(`\n.vnbundle format self-check (v${EXPECTED_VERSION}) — ${bundleDirs.length} bundle(s)\n`);
  for (const dir of bundleDirs) {
    const { name, errors, warnings } = validateBundle(dir);
    if (errors.length) {
      anyError = true;
      console.log(`  ✗ ${name}  (${errors.length} error${errors.length > 1 ? 's' : ''})`);
      for (const e of errors) console.log(`      ERROR  ${e}`);
    } else {
      console.log(`  ✓ ${name}`);
    }
    for (const w of warnings) console.log(`      warn   ${w}`);
  }
  console.log('');
  if (anyError) { console.log('RESULT: FAIL\n'); process.exit(1); }
  console.log('RESULT: all bundles valid ✅\n');
}
