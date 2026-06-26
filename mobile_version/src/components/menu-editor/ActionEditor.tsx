import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNID } from '../../types';
import { VNUIScreen } from '../../features/ui/types';
import { VNUIAction, UIActionType, GoToScreenAction, JumpToSceneAction, JumpToLabelAction, SetVariableAction, ResetVariableAction, PlaySoundAction, CycleLayerAssetAction, OpenURLAction, ToggleScreenAction, CallCommonEventAction, RESET_ALL_VARIABLES } from '../../types/shared';
import { VNCommonEvent } from '../../types/commonEvents';
import { VNSetVariableOperator } from '../../features/variables/types';
import { VNScene, CommandType, LabelCommand } from '../../features/scene/types';
import { VNVariable } from '../../features/variables/types';
import { resolveBoolLabels } from '../../features/variables/booleanLabels';
import { VNCharacter } from '../../features/character/types';
import { useProject } from '../../contexts/ProjectContext';
import { FormField, Select, TextInput } from '../ui/Form';
import ConditionsEditor from '../ui/ConditionsEditor';

/** Action types offered by the menu/screen ActionEditor dropdown, in display order.
 *  (Intentionally excludes PlayAnimation / ChangeImage, which are interactive-element-only.) */
const MENU_ACTION_TYPES: UIActionType[] = [
    UIActionType.None, UIActionType.StartNewGame, UIActionType.ContinueGame, UIActionType.GoToScreen,
    UIActionType.LoadGame, UIActionType.SaveGame, UIActionType.DeleteSave, UIActionType.ReturnToGame, UIActionType.ReturnToPreviousScreen,
    UIActionType.QuitToTitle, UIActionType.ExitGame, UIActionType.JumpToScene, UIActionType.JumpToLabel,
    UIActionType.SetVariable, UIActionType.ResetVariable, UIActionType.PlaySound, UIActionType.CycleLayerAsset, UIActionType.ToggleScreen, UIActionType.OpenURL,
    UIActionType.ShowElement, UIActionType.HideElement,
    UIActionType.CallCommonEvent,
    UIActionType.GiveItem, UIActionType.UseItem, UIActionType.DestroyItem, UIActionType.UseSelectedItem, UIActionType.RestockCollection,
    UIActionType.BuyItem, UIActionType.SellItem, UIActionType.BuySelectedItem, UIActionType.SellSelectedItem,
    UIActionType.ShowLog, UIActionType.ToggleAutoAdvance, UIActionType.ToggleSkip, UIActionType.SkipBackward,
    UIActionType.OpenPauseMenu,
    UIActionType.ShowPhone, UIActionType.HidePhone, UIActionType.ShowPhoneText, UIActionType.HidePhoneText, UIActionType.ShowPhoneHistory, UIActionType.ShowPhoneContacts,
];

const ActionEditor: React.FC<{
    action: VNUIAction;
    onActionChange: (newAction: VNUIAction) => void;
}> = ({ action, onActionChange }) => {
    const { project } = useProject();
    const { t } = useTranslation('ui');
    // Translated action-type label (reuses the shared ui.actions.* keys).
    const actionLabel = (type: string): string => {
        const key = 'actions.' + (type.charAt(0).toLowerCase() + type.slice(1));
        const translated = t(key);
        return translated === key ? type : translated;
    };

    const allLabels = React.useMemo(() => {
        const labels: Array<{ labelId: string; sceneName: string; sceneId: string }> = [];
        Object.values(project.scenes).forEach((scene: VNScene) => {
            scene.commands.forEach(cmd => {
                if (cmd.type === CommandType.Label) {
                    labels.push({
                        labelId: (cmd as LabelCommand).labelId,
                        sceneName: scene.name,
                        sceneId: scene.id
                    });
                }
            });
        });
        return labels;
    }, [project.scenes]);

    const numericVariables = React.useMemo(() => (
        Object.values(project.variables).filter((v: VNVariable) => v.type === 'number')
    ), [project.variables]);

    // All screen elements (grouped by screen) for Show/Hide-Element target pickers.
    const elementsByScreen = React.useMemo(() => (
        Object.values(project.uiScreens).map((s: VNUIScreen) => ({
            screenId: s.id,
            screenName: s.name,
            elements: Object.values(s.elements || {}).map((el: any) => ({ id: el.id as VNID, name: (el.name || el.type) as string })),
        })).filter(g => g.elements.length > 0)
    ), [project.uiScreens]);

    // Handle null/undefined action
    if (!action) {
        const defaultAction: VNUIAction = { type: UIActionType.None };
        return (
            <div>
                <FormField label={t('actionEditor.actionType')}>
                    <Select value={UIActionType.None} onChange={e => onActionChange({ type: e.target.value as UIActionType })}>
                        {MENU_ACTION_TYPES.map(at => <option key={at} value={at}>{actionLabel(at)}</option>)}
                    </Select>
                </FormField>
            </div>
        );
    }

    const handleTypeChange = (type: UIActionType) => {
        let newAction: VNUIAction = { type };
        switch(type) {
            case UIActionType.GoToScreen:
                newAction = { ...newAction, targetScreenId: Object.keys(project.uiScreens)[0] || '' } as GoToScreenAction;
                break;
            case UIActionType.ToggleScreen:
                newAction = { ...newAction, targetScreenId: Object.keys(project.uiScreens)[0] || '' } as ToggleScreenAction;
                break;
            case UIActionType.JumpToScene:
                newAction = { ...newAction, targetSceneId: project.startSceneId } as JumpToSceneAction;
                break;
            case UIActionType.JumpToLabel: {
                // Find the first available label across all scenes
                let firstLabel = '';
                for (const scene of Object.values(project.scenes) as VNScene[]) {
                    const labelCmd = scene.commands.find(cmd => cmd.type === CommandType.Label);
                    if (labelCmd) {
                        firstLabel = (labelCmd as LabelCommand).labelId;
                        break;
                    }
                }
                newAction = { ...newAction, targetLabel: firstLabel } as JumpToLabelAction;
                break;
            }
            case UIActionType.SetVariable:
                newAction = { ...newAction, variableId: Object.keys(project.variables)[0] || '', operator: 'set', value: '' } as SetVariableAction;
                break;
            case UIActionType.ResetVariable:
                newAction = { ...newAction, variableId: Object.keys(project.variables)[0] || '' } as ResetVariableAction;
                break;
            case UIActionType.PlaySound:
                newAction = { ...newAction, audioId: Object.keys(project.audio)[0] || '', volume: 1, loop: false } as PlaySoundAction;
                break;
            case UIActionType.CycleLayerAsset:
                const firstCharId = Object.keys(project.characters)[0] || '';
                const firstChar = project.characters[firstCharId];
                const firstLayerId = firstChar ? Object.keys(firstChar.layers)[0] || '' : '';
                const firstVarId = Object.keys(project.variables)[0] || '';
                newAction = { ...newAction, characterId: firstCharId, layerId: firstLayerId, variableId: firstVarId, direction: 'next' } as CycleLayerAssetAction;
                break;
            case UIActionType.OpenURL:
                newAction = { ...newAction, url: 'https://', newTab: true } as OpenURLAction;
                break;
            case UIActionType.CallCommonEvent:
                newAction = { ...newAction, commonEventId: Object.keys(project.commonEvents || {})[0] || '' } as CallCommonEventAction;
                break;
            case UIActionType.ShowElement:
            case UIActionType.HideElement:
                newAction = { ...newAction, targetElementId: '' } as any;
                break;
            case UIActionType.GiveItem:
            case UIActionType.DestroyItem:
                newAction = { ...newAction, itemId: Object.keys(project.items || {})[0] || '', quantity: 1 } as any;
                break;
            case UIActionType.UseItem:
                newAction = { ...newAction, itemId: Object.keys(project.items || {})[0] || '' } as any;
                break;
            case UIActionType.RestockCollection:
                newAction = { ...newAction, collectionId: Object.keys(project.itemCollections || {})[0] || '' } as any;
                break;
            case UIActionType.BuyItem:
            case UIActionType.SellItem:
                newAction = { ...newAction, itemId: Object.keys(project.items || {})[0] || '', collectionId: Object.keys(project.itemCollections || {})[0] || '' } as any;
                break;
            case UIActionType.BuySelectedItem:
            case UIActionType.SellSelectedItem:
                newAction = { ...newAction, collectionId: Object.keys(project.itemCollections || {})[0] || '' } as any;
                break;
        }
        onActionChange(newAction);
    };

    React.useEffect(() => {
        if (!action) {
            return;
        }

        switch (action.type) {
            case UIActionType.GoToScreen: {
                const goToScreen = action as GoToScreenAction;
                if (!goToScreen.targetScreenId) {
                    const screenIds = Object.keys(project.uiScreens);
                    if (screenIds.length === 1) {
                        onActionChange({ ...goToScreen, targetScreenId: screenIds[0] });
                    }
                }
                break;
            }
            case UIActionType.JumpToScene: {
                const jumpToScene = action as JumpToSceneAction;
                if (!jumpToScene.targetSceneId) {
                    const sceneIds = Object.keys(project.scenes);
                    if (sceneIds.length === 1) {
                        onActionChange({ ...jumpToScene, targetSceneId: sceneIds[0] });
                    }
                }
                break;
            }
            case UIActionType.JumpToLabel: {
                const jumpToLabel = action as JumpToLabelAction;
                if (!jumpToLabel.targetLabel && allLabels.length === 1) {
                    onActionChange({ ...jumpToLabel, targetLabel: allLabels[0].labelId });
                }
                break;
            }
            case UIActionType.SetVariable: {
                const setVariable = action as SetVariableAction;
                const variableIds = Object.keys(project.variables);
                if (!setVariable.variableId && variableIds.length === 1) {
                    const firstVar = project.variables[variableIds[0]];
                    let defaultValue: string | number | boolean = '';
                    if (firstVar) {
                        if (firstVar.type === 'boolean') {
                            defaultValue = false;
                        } else if (firstVar.type === 'number') {
                            defaultValue = 0;
                        } else {
                            defaultValue = '';
                        }
                    }
                    onActionChange({ ...setVariable, variableId: variableIds[0], value: defaultValue });
                    break;
                }

                const variable = project.variables[setVariable.variableId];
                if (variable) {
                    if (variable.type === 'boolean' && typeof setVariable.value !== 'boolean') {
                        const normalized = String(setVariable.value).trim().toLowerCase();
                        const boolValue = ['true', '1', 'yes', 'on'].includes(normalized);
                        onActionChange({ ...setVariable, value: boolValue });
                    } else if (variable.type === 'number' && typeof setVariable.value === 'string') {
                        const parsedValue = parseFloat(setVariable.value);
                        onActionChange({ ...setVariable, value: Number.isNaN(parsedValue) ? 0 : parsedValue });
                    }
                }
                break;
            }
            case UIActionType.CycleLayerAsset: {
                const cycleAction = action as CycleLayerAssetAction;
                const characterIds = Object.keys(project.characters);

                if (!cycleAction.characterId && characterIds.length === 1) {
                    const firstCharId = characterIds[0];
                    const firstChar = project.characters[firstCharId];
                    const firstLayerId = firstChar ? Object.keys(firstChar.layers)[0] || '' : '';
                    onActionChange({ ...cycleAction, characterId: firstCharId, layerId: firstLayerId });
                    break;
                }

                if (cycleAction.characterId) {
                    const character = project.characters[cycleAction.characterId];
                    if (character && !cycleAction.layerId) {
                        const layerIds = Object.keys(character.layers);
                        if (layerIds.length === 1) {
                            onActionChange({ ...cycleAction, layerId: layerIds[0] });
                            break;
                        }
                    }
                }

                if (!cycleAction.variableId && numericVariables.length === 1) {
                    onActionChange({ ...cycleAction, variableId: numericVariables[0].id });
                }
                break;
            }
            default:
                break;
        }
    }, [action, allLabels, numericVariables, onActionChange, project.characters, project.scenes, project.uiScreens, project.variables]);

    const renderActionFields = () => {
        switch (action.type) {
            case UIActionType.GoToScreen: {
                const goToScreen = action as GoToScreenAction;
                return (
                    <FormField label={t('actionEditor.targetScreen')}>
                        <Select value={goToScreen.targetScreenId} onChange={e => onActionChange({ ...goToScreen, targetScreenId: e.target.value })}>
                            {Object.values(project.uiScreens).map((s: VNUIScreen) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </Select>
                    </FormField>
                );
            }
            case UIActionType.ToggleScreen: {
                const toggleScreen = action as ToggleScreenAction;
                return (
                    <FormField label={t('actionEditor.screenToToggle')}>
                        <Select value={toggleScreen.targetScreenId} onChange={e => onActionChange({ ...toggleScreen, targetScreenId: e.target.value })}>
                            <option value="">{t('actionEditor.selectScreen')}</option>
                            {Object.values(project.uiScreens).map((s: VNUIScreen) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </Select>
                    </FormField>
                );
            }
            case UIActionType.ShowElement:
            case UIActionType.HideElement: {
                const a = action as any;
                const verb = action.type === UIActionType.ShowElement ? t('actionEditor.elementToShow', 'Element to show') : t('actionEditor.elementToHide', 'Element to hide');
                return (
                    <FormField label={verb}>
                        <Select value={a.targetElementId || ''} onChange={e => onActionChange({ ...a, targetElementId: e.target.value })}>
                            <option value="">{t('actionEditor.selectElement', 'Select an element…')}</option>
                            {elementsByScreen.map(g => (
                                <optgroup key={g.screenId} label={g.screenName}>
                                    {g.elements.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
                                </optgroup>
                            ))}
                        </Select>
                    </FormField>
                );
            }
            case UIActionType.SaveGame:
            case UIActionType.LoadGame:
            case UIActionType.DeleteSave: {
                const a = action as any;
                return (
                    <FormField label={t('actionEditor.saveSlot', 'Save slot')}>
                        <input type="number" min={1} max={99} value={a.slotNumber ?? 1}
                            onChange={e => onActionChange({ ...a, slotNumber: Number(e.target.value) || 1 })}
                            className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs" />
                        {action.type === UIActionType.DeleteSave && (
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t('actionEditor.deleteSaveHint', 'Erases this slot (Save + Load). Shows the customizable “Erase Save” confirmation first.')}</p>
                        )}
                    </FormField>
                );
            }
            case UIActionType.JumpToScene: {
                const jumpToScene = action as JumpToSceneAction;
                return (
                    <FormField label={t('actionEditor.targetScene')}>
                        <Select value={jumpToScene.targetSceneId} onChange={e => onActionChange({ ...jumpToScene, targetSceneId: e.target.value })}>
                            {Object.values(project.scenes).map((s: VNScene) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </Select>
                    </FormField>
                );
            }
            case UIActionType.JumpToLabel: {
                const jumpToLabel = action as JumpToLabelAction;
                return (
                    <FormField label={t('actionEditor.targetLabel')}>
                        <Select value={jumpToLabel.targetLabel} onChange={e => onActionChange({ ...jumpToLabel, targetLabel: e.target.value })}>
                            {allLabels.length === 0 && <option value="">{t('actionEditor.noLabels')}</option>}
                            {allLabels.map((labelInfo, idx) => (
                                <option key={idx} value={labelInfo.labelId}>
                                    {t('actionEditor.labelInScene', { label: labelInfo.labelId, scene: labelInfo.sceneName })}
                                </option>
                            ))}
                        </Select>
                    </FormField>
                );
            }
            case UIActionType.SetVariable: {
                const setVariable = action as SetVariableAction;
                const variable = project.variables[setVariable.variableId];
                return (
                    <div className="space-y-2 p-2 border border-slate-700 rounded">
                        <FormField label={t('actionEditor.variable')}><Select value={setVariable.variableId} onChange={e => {
                            const newVarId = e.target.value;
                            const newVar = project.variables[newVarId];
                            let newOperator = setVariable.operator;
                            if (newVar?.type !== 'number' && (setVariable.operator === 'add' || setVariable.operator === 'subtract' || setVariable.operator === 'random')) {
                                newOperator = 'set';
                            }
                            onActionChange({ ...setVariable, variableId: newVarId, operator: newOperator });
                        }}>
                             {Object.keys(project.variables).length === 0 && <option disabled>{t('actionEditor.noVariables')}</option>}
                            {Object.values(project.variables).map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </Select></FormField>

                        <FormField label={t('actionEditor.operator')}><Select value={setVariable.operator} onChange={e => onActionChange({ ...setVariable, operator: e.target.value as VNSetVariableOperator })}>
                            <option value="set">{t('actionEditor.opSet')}</option>
                            {project.variables[setVariable.variableId]?.type === 'number' && <option value="add">{t('actionEditor.opAdd')}</option>}
                            {project.variables[setVariable.variableId]?.type === 'number' && <option value="subtract">{t('actionEditor.opSubtract')}</option>}
                            {project.variables[setVariable.variableId]?.type === 'number' && <option value="random">{t('actionEditor.opRandom')}</option>}
                        </Select></FormField>

                        {setVariable.operator === 'random' && project.variables[setVariable.variableId]?.type === 'number' ? (
                            <div className="grid grid-cols-2 gap-2">
                                <FormField label={t('actionEditor.min')}>
                                    <TextInput type="number" value={String(setVariable.randomMin ?? 0)} onChange={e => onActionChange({ ...setVariable, randomMin: parseFloat(e.target.value) || 0 })}/>
                                </FormField>
                                <FormField label={t('actionEditor.max')}>
                                    <TextInput type="number" value={String(setVariable.randomMax ?? 100)} onChange={e => onActionChange({ ...setVariable, randomMax: parseFloat(e.target.value) || 100 })}/>
                                </FormField>
                            </div>
                        ) : project.variables[setVariable.variableId]?.type === 'boolean' ? (
                            <FormField label={t('actionEditor.value')}>
                                <Select value={String(setVariable.value)} onChange={e => onActionChange({ ...setVariable, value: e.target.value === 'true' })}>
                                    <option value="true">{resolveBoolLabels(project.variables[setVariable.variableId], t('actionEditor.true'), t('actionEditor.false')).yes}</option>
                                    <option value="false">{resolveBoolLabels(project.variables[setVariable.variableId], t('actionEditor.true'), t('actionEditor.false')).no}</option>
                                </Select>
                            </FormField>
                        ) : (
                            <FormField label={t('actionEditor.value')}><TextInput value={String(setVariable.value)} onChange={e => onActionChange({ ...setVariable, value: e.target.value })}/></FormField>
                        )}
                    </div>
                );
            }
            case UIActionType.ResetVariable: {
                const resetAction = action as ResetVariableAction;
                return (
                    <FormField label={t('actionEditor.variableToReset')}>
                        <Select value={resetAction.variableId} onChange={e => onActionChange({ ...resetAction, variableId: e.target.value as VNID })}>
                            <option value={RESET_ALL_VARIABLES}>{t('actionEditor.allVariables')}</option>
                            {Object.keys(project.variables).length === 0 && <option disabled>{t('actionEditor.noVariables')}</option>}
                            {Object.values(project.variables).map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </Select>
                    </FormField>
                );
            }
            case UIActionType.PlaySound: {
                const playSoundAction = action as PlaySoundAction;
                return (
                    <div className="space-y-2 p-2 border border-slate-700 rounded">
                        <FormField label={t('actionEditor.audio')}>
                            <Select value={playSoundAction.audioId} onChange={e => onActionChange({ ...playSoundAction, audioId: e.target.value as VNID })}>
                                {Object.keys(project.audio).length === 0 && <option value="">{t('actionEditor.noAudio')}</option>}
                                {Object.values(project.audio).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </Select>
                        </FormField>
                        <FormField label={t('actionEditor.volume', { value: Math.round((playSoundAction.volume ?? 1) * 100) })}>
                            <input type="range" min="0" max="1" step="0.01" value={playSoundAction.volume ?? 1}
                                onChange={e => onActionChange({ ...playSoundAction, volume: parseFloat(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]" />
                        </FormField>
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                            <input type="checkbox" checked={playSoundAction.loop || false}
                                onChange={e => onActionChange({ ...playSoundAction, loop: e.target.checked })} />
                            {t('actionEditor.loopSound')}
                        </label>
                    </div>
                );
            }
            case UIActionType.CycleLayerAsset: {
                const cycleAction = action as CycleLayerAssetAction;
                const character = cycleAction.characterId ? project.characters[cycleAction.characterId] : undefined;
                const availableLayers = character ? Object.values(character.layers) : [];
                return (
                    <div className="space-y-2 p-2 border border-slate-700 rounded">
                        <FormField label={t('actionEditor.character')}>
                            <Select value={cycleAction.characterId} onChange={e => {
                                const newCharId = e.target.value;
                                const newChar = project.characters[newCharId];
                                const firstLayerId = newChar ? Object.keys(newChar.layers)[0] || '' : '';
                                onActionChange({ ...cycleAction, characterId: newCharId, layerId: firstLayerId });
                            }}>
                                {Object.keys(project.characters).length === 0 && <option disabled>{t('actionEditor.noCharacters')}</option>}
                                {Object.values(project.characters).map((c: VNCharacter) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </Select>
                        </FormField>

                        {cycleAction.characterId && (
                            <FormField label={t('actionEditor.layer')}>
                                <Select value={cycleAction.layerId} onChange={e => onActionChange({ ...cycleAction, layerId: e.target.value })}>
                                    {availableLayers.length === 0 && <option disabled>{t('actionEditor.noLayers')}</option>}
                                    {availableLayers.map((layer: any) => {
                                        const assetCount = layer.assets ? Object.keys(layer.assets).length : 0;
                                        return (
                                            <option key={layer.id} value={layer.id}>{t('actionEditor.layerAssets', { name: layer.name, count: assetCount })}</option>
                                        );
                                    })}
                                </Select>
                            </FormField>
                        )}

                        <FormField label={t('actionEditor.indexVariable')}>
                            <Select value={cycleAction.variableId} onChange={e => onActionChange({ ...cycleAction, variableId: e.target.value })}>
                                {Object.keys(project.variables).length === 0 && <option disabled>{t('actionEditor.noVariables')}</option>}
                                {numericVariables.map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </Select>
                        </FormField>

                        <FormField label={t('actionEditor.direction')}>
                            <Select value={cycleAction.direction} onChange={e => onActionChange({ ...cycleAction, direction: e.target.value as 'next' | 'prev' })}>
                                <option value="next">{t('actionEditor.dirNext')}</option>
                                <option value="prev">{t('actionEditor.dirPrev')}</option>
                            </Select>
                        </FormField>
                    </div>
                );
            }
            case UIActionType.OpenURL: {
                const openUrlAction = action as OpenURLAction;
                return (
                    <div className="space-y-2 p-2 border border-slate-700 rounded">
                        <FormField label={t('actionEditor.url')}>
                            <TextInput
                                value={openUrlAction.url || ''}
                                onChange={e => onActionChange({ ...openUrlAction, url: e.target.value })}
                                placeholder={t('actionEditor.urlPlaceholder')}
                            />
                        </FormField>
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={openUrlAction.newTab !== false}
                                onChange={e => onActionChange({ ...openUrlAction, newTab: e.target.checked })}
                            />
                            {t('actionEditor.openNewTab')}
                        </label>
                    </div>
                );
            }
            case UIActionType.CallCommonEvent: {
                const ccAction = action as CallCommonEventAction;
                const events = Object.values(project.commonEvents || {}) as VNCommonEvent[];
                return (
                    <div className="space-y-2 p-2 border border-slate-700 rounded">
                        <FormField label="Common Event">
                            <Select value={ccAction.commonEventId || ''} onChange={e => onActionChange({ ...ccAction, commonEventId: e.target.value as VNID })}>
                                <option value="">Select a common event…</option>
                                {events.map(ce => <option key={ce.id} value={ce.id}>{ce.name}{!ce.enabled ? ' (disabled)' : ''}</option>)}
                            </Select>
                        </FormField>
                    </div>
                );
            }
            case UIActionType.GiveItem:
            case UIActionType.UseItem:
            case UIActionType.DestroyItem: {
                const a = action as any;
                const itemArr = Object.values(project.items || {}) as any[];
                const showQty = action.type !== UIActionType.UseItem && !a.all;
                return (
                    <div className="space-y-2 p-2 border border-slate-700 rounded">
                        <FormField label="Item">
                            <Select value={a.itemId || ''} onChange={e => onActionChange({ ...a, itemId: e.target.value as VNID })}>
                                {itemArr.length === 0 && <option value="">No items defined (Systems → Items)</option>}
                                {itemArr.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                            </Select>
                        </FormField>
                        {action.type === UIActionType.DestroyItem && (
                            <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                                <input type="checkbox" checked={!!a.all} onChange={e => onActionChange({ ...a, all: e.target.checked || undefined })} /> Destroy all
                            </label>
                        )}
                        {showQty && (
                            <FormField label="Quantity">
                                <TextInput type="number" min="1" value={String(a.quantity ?? 1)} onChange={e => onActionChange({ ...a, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
                            </FormField>
                        )}
                    </div>
                );
            }
            case UIActionType.RestockCollection: {
                const a = action as any;
                const collArr = Object.values(project.itemCollections || {}) as any[];
                return (
                    <div className="space-y-2 p-2 border border-slate-700 rounded">
                        <FormField label="Item list">
                            <Select value={a.collectionId || ''} onChange={e => onActionChange({ ...a, collectionId: e.target.value as VNID })}>
                                {collArr.length === 0 && <option value="">No item lists defined (Systems → Inventory)</option>}
                                {collArr.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
                            </Select>
                        </FormField>
                    </div>
                );
            }
            case UIActionType.BuyItem:
            case UIActionType.SellItem: {
                const a = action as any;
                const collArr = Object.values(project.itemCollections || {}) as any[];
                const itemArr = Object.values(project.items || {}) as any[];
                return (
                    <div className="space-y-2 p-2 border border-slate-700 rounded">
                        <FormField label="Item">
                            <Select value={a.itemId || ''} onChange={e => onActionChange({ ...a, itemId: e.target.value as VNID })}>
                                {itemArr.length === 0 && <option value="">No items defined (Systems → Items)</option>}
                                {itemArr.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                            </Select>
                        </FormField>
                        <FormField label={action.type === UIActionType.BuyItem ? 'Shop list to buy from' : 'Shop list to sell to'}>
                            <Select value={a.collectionId || ''} onChange={e => onActionChange({ ...a, collectionId: e.target.value as VNID })}>
                                {collArr.length === 0 && <option value="">No item lists defined (Systems → Inventory)</option>}
                                {collArr.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
                            </Select>
                        </FormField>
                    </div>
                );
            }
            case UIActionType.BuySelectedItem:
            case UIActionType.SellSelectedItem: {
                const a = action as any;
                const collArr = Object.values(project.itemCollections || {}) as any[];
                return (
                    <div className="space-y-2 p-2 border border-slate-700 rounded">
                        <FormField label={action.type === UIActionType.BuySelectedItem ? 'Shop list to buy from' : 'Shop list to sell to'}>
                            <Select value={a.collectionId || ''} onChange={e => onActionChange({ ...a, collectionId: e.target.value as VNID })}>
                                {collArr.length === 0 && <option value="">No item lists defined (Systems → Inventory)</option>}
                                {collArr.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
                            </Select>
                        </FormField>
                        <p className="text-[11px] text-[var(--text-secondary)]">Acts on the item the player has selected in the grid. No-op if nothing is selected / it's blocked.</p>
                    </div>
                );
            }
            default:
                return null;
        }
    };

    return (
        <div>
            <FormField label={t('actionEditor.actionType')}>
                <Select value={action.type} onChange={e => handleTypeChange(e.target.value as UIActionType)}>
                    {MENU_ACTION_TYPES.map(at => <option key={at} value={at}>{actionLabel(at)}</option>)}
                </Select>
            </FormField>
            {renderActionFields()}
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
