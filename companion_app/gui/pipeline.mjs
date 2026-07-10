// The one-click pipeline: a .flourish file → a ready-to-open Godot 4.3 project.
// Runs the exporter (→ .vnbundle) then the converter (→ Godot project) in-process, so the GUI gets
// structured results (title, counts, capabilities, warnings) instead of parsing CLI text.
//
// Boundary reminder (spec §1): this only produces a STOCK-Godot project. It never bundles/fetches a
// console SDK, touches signing keys, performs a console build, or bundles W4 templates.
import { pathToFileURL } from 'node:url';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));           // companion_app/gui
const COMPANION = resolve(HERE, '..');                          // companion_app
const EXPORTER = join(COMPANION, 'tooling', 'exporter', 'dist');
const CONVERTER = join(COMPANION, 'tooling', 'converter', 'dist');
const RUNTIME = join(COMPANION, 'runtime-godot');

const imp = (dir, file) => import(pathToFileURL(join(dir, file)).href);

/**
 * @param {string} flourishPath  absolute path to a .flourish file (or an extracted project folder)
 * @param {string} outParent     folder to write "<id>.vnbundle" and "<id>-godot" into
 * @param {(msg:string)=>void} [onStep]  progress callback
 */
export async function runPipeline(flourishPath, outParent, onStep = () => {}) {
  const step = (m) => { onStep(m); };

  step('Reading your Flourish project…');
  const read = await imp(EXPORTER, 'read.js');
  const map = await imp(EXPORTER, 'map.js');
  const write = await imp(EXPORTER, 'write.js');

  const source = read.openFlourish(resolve(flourishPath));
  const mapped = map.mapProject(source.project);
  const gid = mapped.manifest.game.id;
  const title = mapped.manifest.game.title || 'Your game';

  step('Converting scenes, characters and UI…');
  const bundleDir = join(outParent, `${gid}.vnbundle`);
  const { copied, missing } = write.writeBundle(bundleDir, mapped, source);

  step('Checking everything lines up…');
  const validate = await imp(join(COMPANION, 'format'), 'validate.mjs');
  const check = validate.validateBundle(bundleDir);   // { name, errors, warnings }
  const validationErrors = check.errors ?? [];

  step('Building the Godot project…');
  const readBundle = await imp(CONVERTER, 'readBundle.js');
  const scaffold = await imp(CONVERTER, 'scaffold.js');
  const bundle = readBundle.openBundle(bundleDir);
  const godotDir = join(outParent, `${gid}-godot`);
  const { warnings: convWarnings } = scaffold.scaffoldGodotProject({ bundle, outDir: godotDir, runtimeDir: RUNTIME });

  // de-duplicate warnings and count repeats (e.g. "…(x3)")
  const seen = new Map();
  for (const w of [...(mapped.ctx?.warnings ?? []), ...convWarnings]) seen.set(w, (seen.get(w) || 0) + 1);
  const warnings = [...seen].map(([m, n]) => (n > 1 ? `${m} (×${n})` : m));

  const capabilities = Object.entries(mapped.manifest.capabilities || {}).filter(([, v]) => v).map(([k]) => k);

  step('Done!');
  return {
    ok: true,
    title,
    scenes: mapped.scenes.scenes.length,
    characters: mapped.characters.characters.length,
    variables: mapped.variables.variables.length,
    assetsCopied: copied,
    assetsMissing: missing,
    capabilities,
    warnings,
    validationErrors,   // structural/referential problems (usually empty — the exporter emits valid bundles)
    godotDir,
    projectFile: join(godotDir, 'project.godot'),
  };
}
