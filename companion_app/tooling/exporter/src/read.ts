// Reads a .flourish project — either an extracted folder or the .flourish zip — and exposes the
// project JSON plus on-demand asset bytes. Asset refs in project.json are already relative
// `assets/...` paths (the engine rewrites them on export), so no path rewriting is needed here.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';

export interface FlourishSource {
  project: any;
  readAsset(rel: string): Uint8Array | null;
}

export function openFlourish(inputPath: string): FlourishSource {
  if (existsSync(inputPath) && statSync(inputPath).isDirectory()) {
    const project = JSON.parse(readFileSync(join(inputPath, 'project.json'), 'utf8'));
    return {
      project,
      readAsset(rel) { const p = join(inputPath, rel); return existsSync(p) ? readFileSync(p) : null; },
    };
  }
  const zip = unzipSync(readFileSync(inputPath));
  const projBytes = zip['project.json'];
  if (!projBytes) throw new Error('project.json not found in ' + inputPath);
  const project = JSON.parse(new TextDecoder().decode(projBytes));
  return {
    project,
    readAsset(rel) { return zip[rel] ?? null; },
  };
}
