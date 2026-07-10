// flourish-convert — CLI: .vnbundle (or folder) → a ready-to-open Godot project.
// Usage: node dist/cli.js <input.vnbundle|folder> [outDir]
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBundle } from './readBundle.js';
import { scaffoldGodotProject } from './scaffold.js';

const input = process.argv[2];
const outArg = process.argv[3];
if (!input) {
  console.error('usage: flourish-convert <input.vnbundle|folder> [outDir]');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url)); // .../tooling/converter/dist
const runtimeDir = process.env.FLOURISH_RUNTIME_DIR
  ? resolve(process.env.FLOURISH_RUNTIME_DIR)
  : resolve(here, '../../../runtime-godot');

const bundle = openBundle(resolve(input));
const gid = bundle.manifest.game?.id ?? 'game';
const outDir = outArg ? resolve(outArg) : resolve('out', `${gid}-godot`);

const { warnings } = scaffoldGodotProject({ bundle, outDir, runtimeDir });

console.log(`\nGenerated a Godot project for "${bundle.manifest.game?.title}" → ${outDir}`);
console.log(`  1. Open ${outDir}\\project.godot in Godot 4.3`);
console.log(`  2. Press Play to run your game on desktop.`);
console.log(`  3. See OPEN_ME_FIRST.md for console-build steps (you provide your own platform approval + W4 license).`);
if (warnings.length) {
  console.log(`  ${warnings.length} heads-up:`);
  for (const w of warnings) console.log(`     - ${w}`);
}
console.log('');
