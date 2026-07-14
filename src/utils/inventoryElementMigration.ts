import { VNProject } from '../types/project';
import { VNID } from '../types';
import { UIElementType } from '../features/ui/types';

/**
 * Normalize the legacy Inventory-grid `showUseButton` boolean onto the newer `slotButton`
 * ('none'|'use'|'buy'|'sell'), then drop the dead flag. `slotButton` superseded `showUseButton`;
 * the editor + engine now read `slotButton` only, so old projects that only had `showUseButton`
 * need this on load to keep their "Use" buttons. Idempotent + additive: only touches Inventory
 * elements where `showUseButton` is set and `slotButton` is unset; returns the same project
 * reference when nothing changed.
 */
export function migrateInventorySlotButton(project: VNProject): VNProject {
    if (!project || !project.uiScreens) return project;
    let anyChanged = false;
    const newScreens: Record<VNID, any> = {};
    for (const [sid, screen] of Object.entries(project.uiScreens)) {
        if (!screen || typeof screen !== 'object') { newScreens[sid as VNID] = screen; continue; }
        const elements = (screen as any).elements as Record<VNID, any> | undefined;
        if (!elements) { newScreens[sid as VNID] = screen; continue; }
        let screenChanged = false;
        const newElements: Record<VNID, any> = {};
        for (const [eid, el] of Object.entries(elements)) {
            if (el && el.type === UIElementType.Inventory && el.showUseButton !== undefined && el.slotButton === undefined) {
                const { showUseButton, ...rest } = el;
                newElements[eid as VNID] = { ...rest, slotButton: showUseButton ? 'use' : 'none' };
                screenChanged = true;
            } else {
                newElements[eid as VNID] = el;
            }
        }
        newScreens[sid as VNID] = screenChanged ? { ...(screen as any), elements: newElements } : screen;
        if (screenChanged) anyChanged = true;
    }
    if (!anyChanged) return project;
    return { ...project, uiScreens: newScreens } as VNProject;
}
