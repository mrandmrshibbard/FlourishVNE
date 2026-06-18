/**
 * Screen category helpers — an editor-only organization aid so the proliferating screen kinds
 * (menus, overlays, HUD, generated system screens) are visually distinguishable in the screen
 * list and filterable in the Systems hub. NO runtime effect.
 *
 * A screen's category is its explicit `screen.category` when set, otherwise inferred from the
 * role it plays in `project.ui` (title/pause/save/load/settings = menu, the game HUD = hud).
 */
import { VNUIScreen, VNScreenCategory } from '../features/ui/types';
import { VNProject } from '../types/project';

export const SCREEN_CATEGORY_ORDER: VNScreenCategory[] = ['menu', 'hud', 'overlay', 'system', 'screen'];

/** Fixed tint per category (editor only). */
export const SCREEN_CATEGORY_COLORS: Record<VNScreenCategory, string> = {
    menu: '#66b3ff',     // sky
    hud: '#f59e0b',      // amber
    overlay: '#a78bfa',  // lavender
    system: '#34d399',   // mint
    screen: '#94a3b8',   // slate (neutral / regular)
};

/** i18n key suffix per category (under `ui:screenCategory.*`). */
export const SCREEN_CATEGORY_LABEL_KEY: Record<VNScreenCategory, string> = {
    menu: 'screenCategory.menu',
    hud: 'screenCategory.hud',
    overlay: 'screenCategory.overlay',
    system: 'screenCategory.system',
    screen: 'screenCategory.screen',
};

/** Resolves a screen's category: explicit value wins, else inferred from its project role. */
export function getScreenCategory(screen: VNUIScreen, project: VNProject): VNScreenCategory {
    if (screen.category) return screen.category;
    const ui = project.ui;
    if (ui) {
        if (screen.id === ui.gameHudScreenId) return 'hud';
        if ([ui.titleScreenId, ui.pauseScreenId, ui.saveScreenId, ui.loadScreenId, ui.settingsScreenId].includes(screen.id)) return 'menu';
    }
    return 'screen';
}

export function getScreenCategoryColor(screen: VNUIScreen, project: VNProject): string {
    return SCREEN_CATEGORY_COLORS[getScreenCategory(screen, project)];
}
