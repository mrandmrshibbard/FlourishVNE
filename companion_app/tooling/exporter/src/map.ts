// Top-level project mapping: VNProject → the .vnbundle files (manifest, scenes, variables,
// characters, ui, save schema). Uses commands.ts for the per-command work.
import { ExportContext } from './context.js';
import { mapCommands } from './commands.js';
import { mapScreens } from './screens.js';
import { mapInGameUI } from './ingameui.js';

export interface MappedBundle {
  manifest: any;
  scenes: any;
  variables: any;
  characters: any;
  ui: any;
  save: any;
  ctx: ExportContext;
}

export function mapProject(project: any): MappedBundle {
  const ctx = new ExportContext(project);

  const scenes = Object.values<any>(project.scenes || {}).map((s: any) => {
    const scene: any = { id: s.id, name: s.name, commands: mapCommands(s.commands || [], ctx) };
    if (s.outTransition && s.outTransition !== 'instant')
      scene.outTransition = { type: s.outTransition, durationMs: Math.round((s.outTransitionDuration ?? 0.5) * 1000) };
    return scene;
  });

  const variables = Object.values<any>(project.variables || {}).map((v: any) => {
    const o: any = { id: v.id, name: v.name, type: v.type, default: v.defaultValue, scope: v.scope || 'global' };
    if (v.min != null) o.min = v.min;
    if (v.max != null) o.max = v.max;
    if (v.trueLabel != null) o.trueLabel = v.trueLabel;
    if (v.falseLabel != null) o.falseLabel = v.falseLabel;
    return o;
  });

  const characters = Object.values<any>(project.characters || {})
    .map((c: any) => mapCharacter(c, ctx))
    .filter(Boolean);

  // registry-based capabilities (in addition to per-command detection)
  if (Object.keys(project.scripts || {}).length) ctx.capabilities.scripts = true;
  if (Object.keys(project.plugins || {}).length) ctx.capabilities.plugins = true;
  if (Object.keys(project.miniGames || {}).length) ctx.capabilities.miniGames = true;
  if (Object.keys(project.maps || {}).length) ctx.capabilities.maps = true;
  if (Object.keys(project.itemCollections || {}).length || Object.keys(project.items || {}).length) ctx.capabilities.inventory = true;

  const res = project.gameResolution;
  const manifest = {
    bundle_format_version: '0.1.0',
    generator: { name: 'flourish-vnbundle-exporter', version: '0.1.0' },
    game: {
      id: project.id || 'game',
      title: project.title || 'Untitled',
      author: project.metadata?.author || project.author || '',
      version: project.version || '1.0.0',
      description: project.description || project.metadata?.description || '',
    },
    entry: { scene: project.startSceneId },
    resolution: { width: res?.width || 1280, height: res?.height || 720 },
    capabilities: ctx.capabilities,
    files: {
      scenes: 'script/scenes.json',
      variables: 'script/variables.json',
      characters: 'characters/characters.json',
      ui: 'ui/layout.json',
      save: 'save-format.json',
    },
  };

  const ui = {
    ...mapInGameUI(project, ctx),
    backlog: { enabled: true, maxEntries: 200 },
    dayNight: mapDayNight(project),
    ...mapScreens(project, ctx),
  };

  const save = {
    save_schema_version: '0.1.0',
    persist: { position: true, variables: { scopes: ['global', 'persistent'] }, visitedScenes: true, playTime: true, stage: true, music: true },
    persistentVariablesSeparate: true,
    slots: { count: 10, autosave: true },
  };

  return {
    manifest,
    scenes: { scenes },
    variables: { variables },
    characters: { characters },
    ui,
    save,
    ctx,
  };
}

// Layered expression → a named sprite state whose `layers` are drawn bottom-to-top (base first).
function mapCharacter(c: any, ctx: ExportContext): any | null {
  const layerOrder = Object.keys(c.layers || {});
  const sprites: any[] = [];
  for (const e of Object.values<any>(c.expressions || {})) {
    const layers: string[] = [];
    if (c.baseImageUrl) { const b = ctx.asset(c.baseImageUrl); if (b) layers.push(b); }
    for (const layerId of layerOrder) {
      const assetId = e.layerConfiguration?.[layerId];
      if (!assetId) continue;
      const asset = c.layers[layerId]?.assets?.[assetId];
      if (asset?.imageUrl) { const p = ctx.asset(asset.imageUrl); if (p) layers.push(p); }
      else if (asset?.videoUrl) ctx.warn(`character ${c.id} expression ${e.id}: video layer not supported in v1`);
    }
    if (layers.length === 0) { ctx.warn(`character ${c.id} expression ${e.id}: no image layers — skipped`); continue; }
    sprites.push({ id: e.id, layers });
  }
  if (sprites.length === 0) { ctx.warn(`character ${c.id}: no usable sprites — dropped`); return null; }
  const out: any = { id: c.id, name: c.name, defaultSprite: sprites[0].id, sprites };
  if (c.color) out.nameColor = c.color;
  if (c.fontUrl) { const f = ctx.asset(c.fontUrl); if (f) out.font = f; }

  // Raw layer tree — for the character-creator elements (CharacterPreview / AssetCycler / Customizer),
  // which composite a live sprite by choosing, per layer, the asset a variable points at. Additive; the
  // flattened `sprites` above still drives story rendering.
  const base = c.baseImageUrl ? ctx.asset(c.baseImageUrl) : undefined;
  if (base) out.base = base;
  const rawLayers = layerOrder.map((lid: string) => {
    const L = c.layers[lid] || {};
    const assets = Object.values<any>(L.assets || {})
      .map((a: any) => ({ id: a.id, name: a.name, image: a.imageUrl ? ctx.asset(a.imageUrl) : undefined }))
      .filter((a: any) => a.image);
    return { id: lid, name: L.name, assets };
  }).filter((l: any) => l.assets.length > 0);
  if (rawLayers.length) {
    out.layers = rawLayers;                                 // z-ordered bottom→top
    // Per-expression layer selections (layerId → assetId), so a preview has a default look to build on.
    out.expressions = Object.values<any>(c.expressions || {})
      .map((e: any) => ({ id: e.id, config: e.layerConfiguration || {} }));
  }
  return out;
}

// Day/night colour-grade cycle (project.dayNightCycle). Carried into ui.dayNight so the runtime can
// interpolate a grade for the current hour when a SetTimeOfDay command runs. Phases hold a background
// and a sprites grade layer (tint/opacity/brightness/saturation); returns null when unused.
function mapDayNight(project: any): any {
  const dn = project.dayNightCycle;
  if (!dn || !Array.isArray(dn.phases) || dn.phases.length === 0) return null;
  const layer = (l: any) => ({
    enabled: l?.enabled !== false,
    tint: l?.tint || '#ffffff',
    tintOpacity: l?.tintOpacity ?? 0,
    brightness: l?.brightness ?? 1,
    saturation: l?.saturation ?? 1,
  });
  return {
    enabled: dn.enabled !== false,
    timeVariableId: dn.timeVariableId || null,
    phases: dn.phases.map((p: any) => ({ atHour: p.atHour, background: layer(p.background), sprites: layer(p.sprites) })),
  };
}
