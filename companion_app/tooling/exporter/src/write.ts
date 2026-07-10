// Writes the mapped bundle to disk (folder form) and copies every referenced asset from the source.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { FlourishSource } from './read.js';
import type { MappedBundle } from './map.js';

export function writeBundle(outDir: string, mapped: MappedBundle, source: FlourishSource): { copied: number; missing: number } {
  const w = (rel: string, data: unknown) => {
    const p = join(outDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(data, null, 2));
  };
  w('manifest.json', mapped.manifest);
  w('script/scenes.json', mapped.scenes);
  w('script/variables.json', mapped.variables);
  w('characters/characters.json', mapped.characters);
  w('ui/layout.json', mapped.ui);
  w('save-format.json', mapped.save);

  let copied = 0;
  let missing = 0;
  for (const rel of mapped.ctx.assetRefs) {
    const bytes = source.readAsset(rel);
    if (!bytes) { missing++; mapped.ctx.warn(`asset missing in source: ${rel}`); continue; }
    const p = join(outDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, bytes);
    copied++;
  }
  return { copied, missing };
}
