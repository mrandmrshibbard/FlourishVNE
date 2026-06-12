/**
 * Editor-only helper connecting the Systems hub to the UI editor: which screens
 * display a given system object (the player inventory, an item list, or a stat)?
 * Pure scan over `project.uiScreens` — keep this OUT of engine imports (LivePreview
 * must not pull it in, or it lands in the game bundle for no reason).
 */
import { VNProject } from '../types/project';
import { VNID } from '../types';
import { UIElementType } from '../features/ui/types';

export interface SystemScreenLink {
    screenId: VNID;
    screenName: string;
    /** The element on that screen that displays the system object (grid/meter). */
    elementId: VNID;
}

type Target =
    | { kind: 'playerInventory' }
    | { kind: 'collection'; id: VNID }
    | { kind: 'stat'; id: VNID };

export function findSystemScreenLinks(project: VNProject, target: Target): SystemScreenLink[] {
    const links: SystemScreenLink[] = [];
    const statVarIds = target.kind === 'stat'
        ? new Set(Object.values(project.stats?.[target.id]?.variableIds || {}))
        : null;

    for (const screen of Object.values(project.uiScreens || {})) {
        for (const element of Object.values((screen as any).elements || {}) as any[]) {
            let match = false;
            if (target.kind === 'playerInventory') {
                match = element.type === UIElementType.Inventory && !element.collectionId;
            } else if (target.kind === 'collection') {
                match = element.type === UIElementType.Inventory
                    && (element.collectionId === target.id || element.sellToCollectionId === target.id);
            } else {
                // A stat is "shown" by any meter (or variable-bound slider) reading one of its backing vars.
                match = (element.type === UIElementType.Meter || element.type === UIElementType.SettingsSlider)
                    && !!element.variableId && !!statVarIds?.has(element.variableId);
            }
            if (match) {
                links.push({ screenId: (screen as any).id, screenName: (screen as any).name || 'Screen', elementId: element.id });
            }
        }
    }
    return links;
}
