/**
 * Case-insensitive index of the game's asset tree.
 *
 * Two reasons this is not just `fs.existsSync`:
 *  1. `GetFolder()` returns the mixed-case `Portrait(name=…)` (e.g. "Cove_8") while the folder on
 *     disk is lowercase ("cove_8"). Ren'Py gets away with it because NTFS is case-insensitive.
 *     A case-sensitive lookup would silently resolve nothing — which is precisely how a build
 *     ends up 100% placeholders.
 *  2. The previous converter keyed audio by BASENAME, collapsing 218 distinct paths to 131 and
 *     playing ~87 wrong clips. Everything here is keyed by full RELATIVE PATH; basenames are
 *     offered only as an explicitly-ambiguous secondary lookup.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface AssetIndex {
    /** lowercased relative posix path -> real absolute path */
    byPath: Map<string, string>;
    /** lowercased basename (no dir) -> every real absolute path with that basename */
    byBasename: Map<string, string[]>;
    root: string;
    fileCount: number;
}

const SKIP_DIRS = new Set(['.git', '__pycache__', 'saves', 'cache', 'tl', 'lib', 'renpy']);

export function buildAssetIndex(gameDir: string, subdirs: string[] = ['images', 'sounds', 'voices', 'gui', 'fonts']): AssetIndex {
    const byPath = new Map<string, string>();
    const byBasename = new Map<string, string[]>();
    let fileCount = 0;

    const walk = (abs: string) => {
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (e.isDirectory()) {
                if (SKIP_DIRS.has(e.name.toLowerCase())) continue;
                walk(path.join(abs, e.name));
            } else if (e.isFile()) {
                const full = path.join(abs, e.name);
                const rel = path.relative(gameDir, full).split(path.sep).join('/');
                byPath.set(rel.toLowerCase(), full);
                const base = e.name.toLowerCase();
                const list = byBasename.get(base);
                if (list) list.push(full); else byBasename.set(base, [full]);
                fileCount++;
            }
        }
    };

    for (const sub of subdirs) {
        const abs = path.join(gameDir, sub);
        if (fs.existsSync(abs)) walk(abs);
    }
    if (fileCount === 0) {
        // The old pipeline guarded its walk with existsSync and carried on, so a wrong --src
        // produced an EMPTY index that looked like success and shipped tinted squares.
        throw new Error(`assetIndex: no files found under ${gameDir} — is --src pointing at the game/ directory?`);
    }
    return { byPath, byBasename, root: gameDir, fileCount };
}

/** Windows separators -> posix, so an index key never depends on the host OS. */
const toPosix = (p: string): string => p.split(String.fromCharCode(92)).join('/');

/** Resolve a game-relative path (as Ren'Py would write it) to a real file, case-insensitively. */
export function resolvePath(index: AssetIndex, relPath: string): string | null {
    return index.byPath.get(toPosix(relPath).toLowerCase()) ?? null;
}
