// Scaffolds a ready-to-open Godot project: the Component-A runtime + the user's game (at res://bundle,
// auto-loaded) + a patched project.godot + plain-language next-step guidance. It copies files and
// writes docs — NOTHING ELSE. It never builds, signs, or touches a console SDK or W4 material.
import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BundleSource } from './readBundle.js';

const DEFERRED = ['scripts', 'plugins', 'miniGames', 'phone', 'inventory', 'maps'];

export function scaffoldGodotProject(opts: { bundle: BundleSource; outDir: string; runtimeDir: string }): { warnings: string[] } {
  const { bundle, outDir, runtimeDir } = opts;
  const m = bundle.manifest;

  if (!existsSync(join(runtimeDir, 'project.godot')) || !existsSync(join(runtimeDir, 'src')))
    throw new Error(`runtime not found at ${runtimeDir} (expected project.godot + src/). Set FLOURISH_RUNTIME_DIR to override.`);

  mkdirSync(outDir, { recursive: true });

  // 1) runtime scripts + main scene
  cpSync(join(runtimeDir, 'src'), join(outDir, 'src'), { recursive: true });

  // 2) project.godot — patched with the game's name + resolution
  let pg = readFileSync(join(runtimeDir, 'project.godot'), 'utf8');
  const title = String(m.game?.title ?? 'Visual Novel').replace(/"/g, "'");
  const w = m.resolution?.width ?? 1280;
  const h = m.resolution?.height ?? 720;
  pg = pg.replace(/config\/name=".*"/, `config/name="${title}"`)
    .replace(/viewport_width=\d+/, `viewport_width=${w}`)
    .replace(/viewport_height=\d+/, `viewport_height=${h}`);
  writeFileSync(join(outDir, 'project.godot'), pg);

  // 3) the game, embedded at res://bundle/ (the runtime auto-loads it)
  bundle.copyInto(join(outDir, 'bundle'));

  // 4) plain-language guidance + a Godot .gitignore
  writeFileSync(join(outDir, 'OPEN_ME_FIRST.md'), guidance(m));
  writeFileSync(join(outDir, '.gitignore'), '.godot/\n');

  const caps = m.capabilities || {};
  const warnings = DEFERRED.filter(c => caps[c]).map(c =>
    `Your game uses "${c}", which this console runtime does not play yet — those parts will be missing.`);
  return { warnings };
}

function guidance(m: any): string {
  const title = m.game?.title ?? 'your game';
  const caps = m.capabilities || {};
  const missing = DEFERRED.filter(c => caps[c]);
  const missingBlock = missing.length ? `
## Heads-up: a few features aren't included yet

This early console runtime doesn't play these parts of your game, so they'd be **missing** from a
console build (everything else works):

${missing.map(c => `- ${c}`).join('\n')}
` : '';

  return `# ${title} — your game as a Godot project

This folder is a **ready-to-open Godot 4.3 project** of your visual novel. It contains the player
runtime plus your game's data (in \`bundle/\`). You can open and play it right now on your computer.

## Play it on your computer (no console needed)

1. Install **Godot 4.3** (free): https://godotengine.org/download/archive/#4.3-stable
2. Open Godot, click **Import**, and pick the \`project.godot\` file in this folder.
3. Press **Play** (▶, top-right). Your game runs.
${missingBlock}
## Building for a console (Xbox / PlayStation / Switch)

Getting your game onto a console is **your** step, in **your** own environment — and it requires two
things this tool intentionally does **not** and **cannot** provide:

1. **Platform developer approval.** You must be an approved developer with the platform holder
   (Microsoft / Sony / Nintendo). This is a per-developer agreement under NDA.
2. **A W4 Consoles license** (or your own console export templates). Godot's console support ships
   privately, only to approved developers, through **W4 Games**: https://www.w4games.com/

Once you have both, on **your** machine:

- Install the W4 Consoles export templates into **your** Godot (per W4's private instructions).
- Open this project and export to your target console through Godot's normal export flow.
- Build, sign, and submit for certification using **your** platform credentials.

> This tool removes the project-setup work. It does **not** make your game auto-pass certification —
> expect real per-game work (controller polish, performance, memory, cert fixes), typically a few
> months for a first console port. That work stays on your side, by design.

## What this tool did / did not do

- **Did:** generate a stock-Godot project, drop in the runtime, embed your game, and write this guide.
- **Did NOT (ever):** download or bundle any console SDK; handle any signing key or certificate;
  perform any build; or include W4's middleware or export templates. Those live only with you, under
  your own licenses.
`;
}
