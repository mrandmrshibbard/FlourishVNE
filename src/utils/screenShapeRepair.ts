/**
 * Give every UI screen the fields the renderer assumes it has.
 *
 * 🔴 Why this exists: the generated language screen shipped without `music`/`ambientNoise` and with
 * `background: null`, and opening it in the Screens tab crashed the editor to a blank page — the
 * renderer reads `background.type` and `music.policy` without guarding. The generator is fixed, but
 * projects saved in between already contain the broken screen, and a version-gated migration would
 * never fire on them because they're already at the current version. So this runs on EVERY load,
 * like its neighbours in the load-migration chain.
 *
 * It only ever FILLS IN what's missing — it never overwrites a value the author set — so it's
 * idempotent and safe to run on every project forever. Worth keeping regardless of this one bug:
 * hand-edited JSON and older exports hit the same crash.
 */
import { VNProject } from '../types/project';
import { VNUIScreen } from '../features/ui/types';

/** The shape `createDefaultUIScreens` produces, for anything a screen is missing. */
const DEFAULT_BACKGROUND = { type: 'color' as const, value: '#1a102c' };
const DEFAULT_AUDIO = { audioId: null, policy: 'continue' as const };

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object';

/** True when a screen would crash the renderer as it stands. */
export function isScreenIncomplete(screen: any): boolean {
    if (!isObject(screen)) return false;
    if (!isObject(screen.background)) return true;
    if (!isObject(screen.music)) return true;
    if (!isObject(screen.ambientNoise)) return true;
    if (!isObject(screen.elements)) return true;
    return false;
}

function repairScreen(screen: any): VNUIScreen {
    const repaired: any = { ...screen };
    if (!isObject(repaired.background)) repaired.background = { ...DEFAULT_BACKGROUND };
    if (!isObject(repaired.music)) repaired.music = { ...DEFAULT_AUDIO };
    if (!isObject(repaired.ambientNoise)) repaired.ambientNoise = { ...DEFAULT_AUDIO };
    if (!isObject(repaired.elements)) repaired.elements = {};
    return repaired as VNUIScreen;
}

/**
 * Returns the SAME project object when every screen is already well-formed, so an untouched project
 * costs one pass and no allocation — the load chain runs this on every open.
 */
export function repairIncompleteScreens(project: VNProject): VNProject {
    const screens: any = (project as any)?.uiScreens;
    if (!isObject(screens)) return project;

    let changed = false;
    const next: Record<string, VNUIScreen> = {};
    for (const [id, screen] of Object.entries<any>(screens)) {
        if (isScreenIncomplete(screen)) {
            next[id] = repairScreen(screen);
            changed = true;
        } else {
            next[id] = screen;
        }
    }
    return changed ? { ...project, uiScreens: next } : project;
}
