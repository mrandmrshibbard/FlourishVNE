/**
 * `image <name...> = "<path>"` declarations - the map from a `scene`/`show` name to a file.
 *
 * Ren'Py image names are MULTI-WORD (`image bg hill night = "images/backgrounds/h_n.jpg"`), and the
 * first word is the tag. Only the plain string form is a direct file; the game also declares images
 * built from `ConditionSwitch`, `Composite`, `AlphaMask` and animation blocks, and those are
 * recorded as UNRESOLVED rather than guessed at - picking one arm of a ConditionSwitch would show
 * art the player should not be seeing.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface ImageDecl {
    /** Space-joined name, e.g. `bg hill night`. */
    name: string;
    /** Game-relative file path, when the declaration is a plain string. */
    file: string | null;
    /** The raw right-hand side when it is not a plain string. */
    expression: string | null;
    source: string;
    line: number;
}

export function parseImageDeclarations(src: string, file: string): ImageDecl[] {
    const out: ImageDecl[] = [];
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        // Must start the line (allowing indent) - `image` also appears as a kwarg inside screens.
        const m = /^[ \t]*image[ \t]+([A-Za-z_][A-Za-z0-9_ ]*?)[ \t]*=[ \t]*(.+?)[ \t]*$/.exec(raw);
        if (!m) continue;
        const name = m[1].trim().replace(/[ \t]+/g, ' ');
        const rhs = m[2].trim();
        if (/^Portrait\s*\(/.test(rhs)) continue;              // characters are built elsewhere
        const str = /^"([^"]+)"$|^'([^']+)'$/.exec(rhs);
        out.push({
            name,
            file: str ? (str[1] ?? str[2]) : null,
            expression: str ? null : rhs,
            source: file,
            line: i + 1,
        });
    }
    return out;
}

export interface ImageTable {
    /** Lower-cased space-joined name -> declaration. */
    byName: Map<string, ImageDecl>;
}

/**
 * Ren'Py's AUTOMATIC image definition: every file under `game/images/` becomes an image named by
 * its filename without the extension. Subdirectories are searched but contribute nothing to the
 * name, so `images/step_intros/step1_open.jpg` is simply `step1_open`.
 *
 * Missing this is not cosmetic - the prologue shows several images that are never declared with an
 * `image` statement and exist only as files.
 */
export function autoDefinedImages(gameDir: string): ImageDecl[] {
    const root = path.join(gameDir, 'images');
    if (!fs.existsSync(root)) return [];
    const out: ImageDecl[] = [];
    const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            const ext = path.extname(entry.name).toLowerCase();
            if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) continue;
            const name = path.basename(entry.name, path.extname(entry.name));
            out.push({
                name,
                file: path.relative(gameDir, full).split(path.sep).join('/'),
                expression: null,
                source: '(auto)',
                line: 0,
            });
        }
    };
    walk(root);
    return out;
}

export function loadImageTable(gameDir: string): ImageTable {
    const byName = new Map<string, ImageDecl>();
    // Auto-defined first, so an explicit `image` statement always wins.
    for (const decl of autoDefinedImages(gameDir)) byName.set(decl.name.toLowerCase(), decl);
    for (const entry of fs.readdirSync(gameDir)) {
        if (!entry.endsWith('.rpy')) continue;
        const src = fs.readFileSync(path.join(gameDir, entry), 'utf8');
        for (const decl of parseImageDeclarations(src, entry)) {
            // A later declaration wins, as Ren'Py's init order would have it.
            byName.set(decl.name.toLowerCase(), decl);
        }
    }
    if (!byName.size) throw new Error(`imageTable: no image declarations found in ${gameDir}`);
    return { byName };
}

/**
 * Resolve a `scene`/`show` name to a declaration.
 *
 * Ren'Py matches the LONGEST declared name that prefixes the given words, so `scene bg hill night`
 * finds `bg hill night` while `scene bg hill` finds `bg hill`. Falling back to the tag alone would
 * silently show the wrong time of day.
 */
export function resolveImageName(table: ImageTable, words: string[]): ImageDecl | null {
    for (let take = words.length; take > 0; take--) {
        const key = words.slice(0, take).join(' ').toLowerCase();
        const decl = table.byName.get(key);
        if (decl) return decl;
    }
    return null;
}
