// flourish-export — CLI: .flourish (or extracted folder) → .vnbundle folder.
// Usage: node dist/cli.js <input.flourish|dir> [outDir]
import { resolve } from 'node:path';
import { openFlourish } from './read.js';
import { mapProject } from './map.js';
import { writeBundle } from './write.js';

const input = process.argv[2];
const outArg = process.argv[3];
if (!input) {
  console.error('usage: flourish-export <input.flourish|dir> [outDir]');
  process.exit(2);
}

const source = openFlourish(resolve(input));
const mapped = mapProject(source.project);
const gid = mapped.manifest.game.id;
const outDir = outArg ? resolve(outArg) : resolve('out', `${gid}.vnbundle`);
const { copied, missing } = writeBundle(outDir, mapped, source);

console.log(`\nExported "${mapped.manifest.game.title}" → ${outDir}`);
console.log(`  scenes: ${mapped.scenes.scenes.length}  ·  characters: ${mapped.characters.characters.length}  ·  variables: ${mapped.variables.variables.length}`);
console.log(`  assets copied: ${copied}${missing ? `  ·  MISSING: ${missing}` : ''}`);
const caps = Object.entries(mapped.manifest.capabilities).filter(([, v]) => v).map(([k]) => k);
console.log(`  capabilities used: ${caps.length ? caps.join(', ') : '(none — clean core VN)'}`);

const warns = mapped.ctx.warnings;
if (warns.length) {
  const seen = new Map<string, number>();
  for (const m of warns) seen.set(m, (seen.get(m) || 0) + 1);
  console.log(`  ${warns.length} warning(s):`);
  for (const [m, n] of seen) console.log(`     - ${m}${n > 1 ? ` (x${n})` : ''}`);
}

// Completeness report: every property PRESENT in this project's data that the exporter did not
// consume. An empty report means full coverage of everything this project actually uses. Pass
// --coverage to always print the audited-kinds table (even the fully-covered ones).
const verbose = process.argv.includes('--coverage');
const um = mapped.ctx.coverageUnmapped;
const ctx = mapped.ctx;
const kinds = [...ctx.coverageSeen.keys()].sort();
// Split each kind's unmapped keys into "surprise" (a real bug — a feature we didn't know about) and
// "deferred" (a Tier-3/planned feature we intentionally don't carry yet).
const surprise: Array<[string, string[]]> = [];
const deferred: Array<[string, string[]]> = [];
for (const k of kinds) {
  const keys = [...(um.get(k) ?? [])].sort();
  if (!keys.length) continue;
  const s = keys.filter((key) => !ctx.isDeferred(k, key));
  const d = keys.filter((key) => ctx.isDeferred(k, key));
  if (s.length) surprise.push([k, s]);
  if (d.length) deferred.push([k, d]);
}
if (surprise.length) {
  console.log(`\n  ✗ COMPLETENESS — ${surprise.length} UNEXPECTED gap(s) (features present that we don't recognize — investigate):`);
  for (const [k, keys] of surprise) console.log(`     ${k}  (${ctx.coverageSeen.get(k)}×) → ${keys.join(', ')}`);
} else {
  console.log(`\n  ✓ COMPLETENESS — no unexpected gaps: every property this project uses is either mapped or a known-deferred feature.`);
}
if (deferred.length) {
  console.log(`  ○ deferred (Tier-3 / planned, intentionally not in v1):`);
  for (const [k, keys] of deferred) console.log(`     ${k}  (${ctx.coverageSeen.get(k)}×) → ${keys.join(', ')}`);
}
if (verbose) {
  console.log(`\n  audited kinds (${kinds.length}):`);
  for (const k of kinds) console.log(`     ${k}  (${ctx.coverageSeen.get(k)}×)${um.get(k)?.size ? '  UNMAPPED: ' + [...um.get(k)!].sort().join(', ') : ''}`);
}
console.log('');
