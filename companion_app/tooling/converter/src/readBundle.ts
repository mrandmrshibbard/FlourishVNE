// Opens a .vnbundle (extracted folder — what the exporter emits — or a zip) and exposes the manifest
// plus a `copyInto(dest)` that materializes the whole bundle at a destination.
import { readFileSync, existsSync, statSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { unzipSync } from 'fflate';

export interface BundleSource {
  manifest: any;
  copyInto(dest: string): void;
}

export function openBundle(input: string): BundleSource {
  if (existsSync(input) && statSync(input).isDirectory()) {
    const manifest = JSON.parse(readFileSync(join(input, 'manifest.json'), 'utf8'));
    return { manifest, copyInto(dest) { cpSync(input, dest, { recursive: true }); } };
  }
  const zip = unzipSync(readFileSync(input));
  const mBytes = zip['manifest.json'];
  if (!mBytes) throw new Error('manifest.json not found in ' + input);
  const manifest = JSON.parse(new TextDecoder().decode(mBytes));
  return {
    manifest,
    copyInto(dest) {
      for (const [rel, bytes] of Object.entries(zip)) {
        if (rel.endsWith('/')) continue;
        const p = join(dest, rel);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, bytes);
      }
    },
  };
}
