import type { TFunction } from 'i18next';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNUIAction, UIActionType } from '../types/shared';
import { VNScene, CommandType, LabelCommand } from '../features/scene/types';

/**
 * Single source of truth for UI-action metadata, shared by ActionEditor, ActionCard,
 * and UIActionsListEditor (previously each kept its own copy → they drifted, which caused
 * the "Give Item shows no fields" bug). Pure helpers — no JSX, no hooks.
 */

/** Translated action-type label via the shared `ui.actions.*` keys (English fallback = the raw type). */
export function actionLabel(type: string, t: TFunction): string {
    const key = 'actions.' + (type.charAt(0).toLowerCase() + type.slice(1));
    const translated = t(key);
    return translated === key ? type : translated;
}

/** A well-formed default action object when the user picks a type — the UNION of what the two
 *  former editors seeded, so no context loses a field. */
export function defaultActionForType(type: UIActionType, project: VNProject): VNUIAction {
    const base = { type } as any;
    const firstKey = (rec?: Record<string, unknown>) => (rec ? Object.keys(rec)[0] || '' : '');
    switch (type) {
        case UIActionType.GoToScreen:
        case UIActionType.ToggleScreen:
            return { ...base, targetScreenId: firstKey(project.uiScreens) };
        case UIActionType.JumpToScene:
            return { ...base, targetSceneId: project.startSceneId || firstKey(project.scenes) };
        case UIActionType.JumpToLabel: {
            let firstLabel = '';
            for (const scene of Object.values(project.scenes) as VNScene[]) {
                const labelCmd = scene.commands.find(cmd => cmd.type === CommandType.Label);
                if (labelCmd) { firstLabel = (labelCmd as LabelCommand).labelId; break; }
            }
            return { ...base, targetLabel: firstLabel };
        }
        case UIActionType.SetVariable:
            return { ...base, variableId: firstKey(project.variables), operator: 'set', value: '' };
        case UIActionType.ResetVariable:
            return { ...base, variableId: firstKey(project.variables) };
        case UIActionType.PlaySound:
            return { ...base, audioId: firstKey(project.audio), volume: 1, loop: false };
        case UIActionType.CycleLayerAsset: {
            const firstCharId = firstKey(project.characters);
            const firstChar = (project.characters as any)[firstCharId];
            return { ...base, characterId: firstCharId, layerId: firstChar ? firstKey(firstChar.layers) : '', variableId: firstKey(project.variables), direction: 'next' };
        }
        case UIActionType.OpenURL:
            return { ...base, url: 'https://', newTab: true };
        case UIActionType.CallCommonEvent:
            return { ...base, commonEventId: firstKey((project as any).commonEvents) };
        case UIActionType.ShowElement:
        case UIActionType.HideElement:
            return { ...base, targetElementId: '' };
        case UIActionType.ChangeImage:
            return { ...base, targetElementId: '', newImageId: '' as VNID };
        case UIActionType.PlayAnimation:
            return { ...base, targetElementId: '', animation: 'shake', duration: 500 };
        case UIActionType.GiveItem:
        case UIActionType.DestroyItem:
            return { ...base, itemId: firstKey(project.items), quantity: 1 };
        case UIActionType.UseItem:
        case UIActionType.CarryItem:
            return { ...base, itemId: firstKey(project.items) };
        case UIActionType.RestockCollection:
            return { ...base, collectionId: firstKey(project.itemCollections) };
        case UIActionType.BuyItem:
        case UIActionType.SellItem:
            return { ...base, itemId: firstKey(project.items), collectionId: firstKey(project.itemCollections) };
        case UIActionType.BuySelectedItem:
        case UIActionType.SellSelectedItem:
            return { ...base, collectionId: firstKey(project.itemCollections) };
        case UIActionType.SaveGame:
        case UIActionType.LoadGame:
        case UIActionType.DeleteSave:
            return { ...base, slotNumber: 1 };
        case UIActionType.StartTimer:
            return { ...base, timerId: '', mode: 'countdown', duration: 10, from: 0, interval: 1, loop: false, onComplete: [] };
        case UIActionType.StopTimer:
            return { ...base, timerId: '' };
        default:
            return base;
    }
}

/** One-line detail shown on a collapsed action row (the bound target's name), shared by both editors. */
export function actionSummaryDetail(action: VNUIAction, project: VNProject): string {
    const a = action as any;
    switch (action.type) {
        case UIActionType.SetVariable:
        case UIActionType.ResetVariable:
            return project.variables[a.variableId]?.name || '';
        case UIActionType.GoToScreen:
        case UIActionType.ToggleScreen:
            return (project.uiScreens[a.targetScreenId] as any)?.name || '';
        case UIActionType.JumpToScene:
            return (project.scenes[a.targetSceneId] as any)?.name || '';
        case UIActionType.JumpToLabel:
            return a.targetLabel || '';
        case UIActionType.PlaySound:
            return (project.audio[a.audioId] as any)?.name || '';
        case UIActionType.CallCommonEvent:
            return ((project as any).commonEvents?.[a.commonEventId])?.name || '';
        case UIActionType.GiveItem:
        case UIActionType.UseItem:
        case UIActionType.DestroyItem:
        case UIActionType.CarryItem:
        case UIActionType.BuyItem:
        case UIActionType.SellItem:
            return (project.items?.[a.itemId] as any)?.name || '';
        case UIActionType.RestockCollection:
        case UIActionType.BuySelectedItem:
        case UIActionType.SellSelectedItem:
            return (project.itemCollections?.[a.collectionId] as any)?.name || '';
        case UIActionType.StartTimer:
            return `${a.mode === 'stopwatch' ? '⏱' : '⏳'} ${a.timerId || 'default'} · ${a.duration ?? 0}s`;
        case UIActionType.StopTimer:
            return a.timerId || 'default';
        default:
            return '';
    }
}
