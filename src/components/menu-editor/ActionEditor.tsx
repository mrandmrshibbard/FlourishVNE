import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNUIAction, UIActionType, GoToScreenAction, JumpToSceneAction, JumpToLabelAction, SetVariableAction, CycleLayerAssetAction } from '../../types/shared';
import { VNScene, CommandType, LabelCommand } from '../../features/scene/types';
import { VNVariable } from '../../features/variables/types';
import { useProject } from '../../contexts/ProjectContext';
import { FormField, Select } from '../ui/Form';
import ConditionsEditor from '../ui/ConditionsEditor';
import ActionFields from '../ui/actionFields';
import UIActionsListEditor from '../ui/UIActionsListEditor';
import { actionLabel, defaultActionForType } from '../../utils/actionMeta';

/** Action types offered by the menu/screen ActionEditor dropdown, in display order.
 *  (Intentionally excludes ChangeImage, which is interactive-element-only. PlayAnimation IS
 *  offered — it animates a screen element; the character equivalent is PlayCharacterAnimation,
 *  and the two are labelled distinctly so it's clear which one targets what.) */
const MENU_ACTION_TYPES: UIActionType[] = [
    UIActionType.None, UIActionType.StartNewGame, UIActionType.ContinueGame, UIActionType.GoToScreen,
    UIActionType.LoadGame, UIActionType.SaveGame, UIActionType.DeleteSave, UIActionType.SaveSlotsNextPage, UIActionType.SaveSlotsPrevPage, UIActionType.ReturnToGame, UIActionType.ReturnToPreviousScreen,
    UIActionType.QuitToTitle, UIActionType.ExitGame, UIActionType.JumpToScene, UIActionType.JumpToLabel,
    UIActionType.SetVariable, UIActionType.ResetVariable, UIActionType.PlaySound, UIActionType.StopSound, UIActionType.PlayMusic, UIActionType.StopMusic, UIActionType.PlayVideo, UIActionType.CycleLayerAsset, UIActionType.ToggleScreen, UIActionType.CloseScreen, UIActionType.OpenURL, UIActionType.SetLanguage, UIActionType.SetFullscreen,
    UIActionType.ChangePose, UIActionType.ChangeCharacter, UIActionType.PlayCharacterAnimation, UIActionType.PlayAnimation,
    UIActionType.ShowElement, UIActionType.HideElement,
    UIActionType.CallCommonEvent,
    UIActionType.GiveItem, UIActionType.UseItem, UIActionType.DestroyItem, UIActionType.UseSelectedItem, UIActionType.RestockCollection,
    UIActionType.BuyItem, UIActionType.SellItem, UIActionType.BuySelectedItem, UIActionType.SellSelectedItem,
    UIActionType.ShowLog, UIActionType.ToggleAutoAdvance, UIActionType.ToggleSkip, UIActionType.SkipBackward,
    UIActionType.OpenPauseMenu,
    UIActionType.StartTimer, UIActionType.StopTimer, UIActionType.SetTimeOfDay,
    UIActionType.ShowSpotlight, UIActionType.HideSpotlight, UIActionType.ShowFlashlight, UIActionType.HideFlashlight,
    UIActionType.ShowPhone, UIActionType.HidePhone, UIActionType.ShowPhoneText, UIActionType.HidePhoneText, UIActionType.ShowPhoneHistory, UIActionType.ShowPhoneContacts, UIActionType.OpenPhoneApp, UIActionType.ShowMap, UIActionType.ShowMiniGame,
    UIActionType.ClearUiPalette,
];

const ActionEditor: React.FC<{
    action: VNUIAction;
    onActionChange: (newAction: VNUIAction) => void;
}> = ({ action, onActionChange }) => {
    const { project } = useProject();
    const { t } = useTranslation('ui');

    const allLabels = React.useMemo(() => {
        const labels: Array<{ labelId: string; sceneName: string; sceneId: string }> = [];
        Object.values(project.scenes).forEach((scene: VNScene) => {
            scene.commands.forEach(cmd => {
                if (cmd.type === CommandType.Label) {
                    labels.push({ labelId: (cmd as LabelCommand).labelId, sceneName: scene.name, sceneId: scene.id });
                }
            });
        });
        return labels;
    }, [project.scenes]);

    const numericVariables = React.useMemo(() => (
        Object.values(project.variables).filter((v: VNVariable) => v.type === 'number')
    ), [project.variables]);

    // Handle null/undefined action
    if (!action) {
        return (
            <div>
                <FormField label={t('actionEditor.actionType')}>
                    <Select value={UIActionType.None} onChange={e => onActionChange({ type: e.target.value as UIActionType })}>
                        {MENU_ACTION_TYPES.map(at => <option key={at} value={at}>{actionLabel(at, t)}</option>)}
                    </Select>
                </FormField>
            </div>
        );
    }

    // Quality-of-life: when there's exactly ONE candidate, auto-fill the target so the field isn't blank.
    React.useEffect(() => {
        if (!action) return;
        switch (action.type) {
            case UIActionType.GoToScreen: {
                const g = action as GoToScreenAction;
                const ids = Object.keys(project.uiScreens);
                if (!g.targetScreenId && ids.length === 1) onActionChange({ ...g, targetScreenId: ids[0] });
                break;
            }
            case UIActionType.JumpToScene: {
                const j = action as JumpToSceneAction;
                const ids = Object.keys(project.scenes);
                if (!j.targetSceneId && ids.length === 1) onActionChange({ ...j, targetSceneId: ids[0] });
                break;
            }
            case UIActionType.JumpToLabel: {
                const j = action as JumpToLabelAction;
                if (!j.targetLabel && allLabels.length === 1) onActionChange({ ...j, targetLabel: allLabels[0].labelId });
                break;
            }
            case UIActionType.SetVariable: {
                const s = action as SetVariableAction;
                const ids = Object.keys(project.variables);
                if (!s.variableId && ids.length === 1) {
                    const fv = project.variables[ids[0]];
                    const dv: string | number | boolean = fv?.type === 'boolean' ? false : fv?.type === 'number' ? 0 : '';
                    onActionChange({ ...s, variableId: ids[0], value: dv });
                    break;
                }
                const variable = project.variables[s.variableId];
                if (variable) {
                    if (variable.type === 'boolean' && typeof s.value !== 'boolean') {
                        const n = String(s.value).trim().toLowerCase();
                        onActionChange({ ...s, value: ['true', '1', 'yes', 'on'].includes(n) });
                    } else if (variable.type === 'number' && typeof s.value === 'string') {
                        const p = parseFloat(s.value);
                        onActionChange({ ...s, value: Number.isNaN(p) ? 0 : p });
                    }
                }
                break;
            }
            case UIActionType.CycleLayerAsset: {
                const c = action as CycleLayerAssetAction;
                const charIds = Object.keys(project.characters);
                if (!c.characterId && charIds.length === 1) {
                    const fc = project.characters[charIds[0]];
                    onActionChange({ ...c, characterId: charIds[0], layerId: fc ? Object.keys(fc.layers)[0] || '' : '' });
                    break;
                }
                if (c.characterId) {
                    const character = project.characters[c.characterId];
                    if (character && !c.layerId) {
                        const lids = Object.keys(character.layers);
                        if (lids.length === 1) { onActionChange({ ...c, layerId: lids[0] }); break; }
                    }
                }
                if (!c.variableId && numericVariables.length === 1) onActionChange({ ...c, variableId: numericVariables[0].id });
                break;
            }
            default:
                break;
        }
    }, [action, allLabels, numericVariables, onActionChange, project.characters, project.scenes, project.uiScreens, project.variables]);

    return (
        <div>
            <FormField label={t('actionEditor.actionType')}>
                <Select value={action.type} onChange={e => onActionChange(defaultActionForType(e.target.value as UIActionType, project))}>
                    {MENU_ACTION_TYPES.map(at => <option key={at} value={at}>{actionLabel(at, t)}</option>)}
                </Select>
            </FormField>
            <ActionFields action={action} project={project} onChange={onActionChange} options={{ variant: 'form', renderActionList: (acts, onCh, lbl) => (
                <UIActionsListEditor actions={acts} project={project} onChange={onCh} label={lbl} />
            ) }} />
            {action.type !== UIActionType.None && (
                <div className="mt-2">
                    <ConditionsEditor
                        collapsible
                        title={t('actionEditor.runOnlyIf')}
                        conditions={action.conditions}
                        project={project}
                        onChange={newConditions => onActionChange({ ...action, conditions: newConditions })}
                    />
                </div>
            )}
        </div>
    );
};

export default ActionEditor;
