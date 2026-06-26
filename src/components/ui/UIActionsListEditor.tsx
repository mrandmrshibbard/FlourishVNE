/**
 * UIActionsListEditor
 * ───────────────────
 * Compact list editor for `VNUIAction[]` with inline detail editors per
 * action type. Extracted from the original `HZActionsEditor` inside
 * `HotZoneEditor.tsx` so it can be shared by the win-condition editor and
 * other places that edit action lists.
 */
import React from 'react';
import { RangeInput } from './Form';
import { useTranslation } from 'react-i18next';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import {
    VNUIAction,
    UIActionType,
    RESET_ALL_VARIABLES,
} from '../../types/shared';
import { VNVariable, VNSetVariableOperator } from '../../features/variables/types';
import { resolveBoolLabels } from '../../features/variables/booleanLabels';
import { CollapsibleSection } from './CollapsibleSection';
import { PlusIcon, TrashIcon } from '../icons';

export interface ActionTargetableElement {
    id: VNID;
    name: string;
}

interface UIActionsListEditorProps {
    actions: VNUIAction[];
    project: VNProject;
    /** Elements that show up in target-element pickers (ChangeImage / PlayAnimation).
     *  Usually the hot zone elements on the current screen. */
    targetableElements?: ActionTargetableElement[];
    onChange: (actions: VNUIAction[]) => void;
    label?: string;
}

const UIActionsListEditor: React.FC<UIActionsListEditorProps> = ({
    actions,
    project,
    targetableElements,
    onChange,
    label,
}) => {
    const { t } = useTranslation('ui');
    // Translated label for an action type. Maps the enum value (e.g. 'StartNewGame') to the
    // ui.actions.* key (e.g. 'startNewGame'), falling back to the raw type if missing.
    const actionLabel = (type: string): string => {
        const key = 'actions.' + (type.charAt(0).toLowerCase() + type.slice(1));
        const translated = t(key);
        return translated === key ? type : translated;
    };
    const listLabel = label ?? t('actionsList.actions');
    const addAction = () => {
        onChange([...actions, { type: UIActionType.None }]);
    };

    const updateAction = (index: number, updates: Partial<VNUIAction>) => {
        const next = [...actions];
        next[index] = { ...next[index], ...updates } as VNUIAction;
        onChange(next);
    };

    const removeAction = (index: number) => {
        onChange(actions.filter((_, i) => i !== index));
    };

    const changeActionType = (index: number, newType: UIActionType) => {
        const defaults: Record<string, any> = {
            [UIActionType.SetVariable]: { variableId: '' as VNID, operator: 'set' as VNSetVariableOperator, value: '' },
            [UIActionType.ResetVariable]: { variableId: '' as VNID },
            [UIActionType.PlaySound]: { audioId: '' as VNID, volume: 1, loop: false },
            [UIActionType.GoToScreen]: { targetScreenId: '' as VNID },
            [UIActionType.JumpToScene]: { targetSceneId: '' as VNID },
            [UIActionType.JumpToLabel]: { targetLabel: '' },
            [UIActionType.ChangeImage]: { targetElementId: '' as VNID, newImageId: '' as VNID },
            [UIActionType.PlayAnimation]: { targetElementId: '' as VNID, animation: 'shake', duration: 500 },
            [UIActionType.ToggleScreen]: { targetScreenId: '' as VNID },
            [UIActionType.OpenURL]: { url: '', newTab: true },
            [UIActionType.LoadGame]: { slotNumber: 1 },
            [UIActionType.SaveGame]: { slotNumber: 1 },
            [UIActionType.DeleteSave]: { slotNumber: 1 },
            [UIActionType.GiveItem]: { itemId: '' as VNID, quantity: 1 },
            [UIActionType.UseItem]: { itemId: '' as VNID },
            [UIActionType.DestroyItem]: { itemId: '' as VNID, quantity: 1 },
            [UIActionType.CarryItem]: { itemId: '' as VNID },
            [UIActionType.RestockCollection]: { collectionId: '' as VNID },
            [UIActionType.BuyItem]: { itemId: '' as VNID, collectionId: '' as VNID },
            [UIActionType.SellItem]: { itemId: '' as VNID, collectionId: '' as VNID },
            [UIActionType.BuySelectedItem]: { collectionId: '' as VNID },
            [UIActionType.SellSelectedItem]: { collectionId: '' as VNID },
        };
        const next = [...actions];
        next[index] = { type: newType, ...(defaults[newType] || {}) } as VNUIAction;
        onChange(next);
    };

    const renderDetails = (action: VNUIAction, index: number) => {
        const a = action as any;
        const inputCls = "w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]";
        const targetChoices = targetableElements || [];

        switch (action.type) {
            case UIActionType.SetVariable: {
                const variable = a.variableId ? project.variables[a.variableId] : null;
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-sky-500/30 space-y-1">
                        <select value={a.variableId || ''} onChange={e => updateAction(index, { variableId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">{t('actionsList.selectVariable')}</option>
                            {Object.values(project.variables).map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
                        </select>
                        <div className="flex gap-1">
                            <select value={a.operator || 'set'} onChange={e => updateAction(index, { operator: e.target.value as VNSetVariableOperator } as any)} className={inputCls}>
                                <option value="set">{t('actionsList.setTo')}</option>
                                <option value="add">{t('actionsList.addOp')}</option>
                                <option value="subtract">{t('actionsList.subtract')}</option>
                                <option value="random">{t('actionsList.random')}</option>
                            </select>
                            {a.operator === 'random' ? (
                                <div className="flex gap-1 flex-1">
                                    <input type="number" value={a.randomMin ?? 0} placeholder={t('actionsList.min')} onChange={e => updateAction(index, { randomMin: Number(e.target.value) } as any)} className={inputCls} />
                                    <input type="number" value={a.randomMax ?? 100} placeholder={t('actionsList.max')} onChange={e => updateAction(index, { randomMax: Number(e.target.value) } as any)} className={inputCls} />
                                </div>
                            ) : variable?.type === 'boolean' ? (
                                <select value={String(a.value ?? '')} onChange={e => updateAction(index, { value: e.target.value === 'true' } as any)} className={inputCls}>
                                    <option value="true">{resolveBoolLabels(variable, t('actionsList.true'), t('actionsList.false')).yes}</option>
                                    <option value="false">{resolveBoolLabels(variable, t('actionsList.true'), t('actionsList.false')).no}</option>
                                </select>
                            ) : (
                                <input
                                    type={variable?.type === 'number' ? 'number' : 'text'}
                                    value={String(a.value ?? '')}
                                    placeholder={t('actionsList.value')}
                                    onChange={e => updateAction(index, { value: variable?.type === 'number' ? Number(e.target.value) : e.target.value } as any)}
                                    className={inputCls}
                                />
                            )}
                        </div>
                    </div>
                );
            }
            case UIActionType.ResetVariable:
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-sky-500/30">
                        <select value={a.variableId || ''} onChange={e => updateAction(index, { variableId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value={RESET_ALL_VARIABLES}>{t('actionsList.allVariables')}</option>
                            <option value="">{t('actionsList.selectVariable')}</option>
                            {Object.values(project.variables).map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
                        </select>
                    </div>
                );
            case UIActionType.PlaySound:
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-purple-500/30 space-y-1">
                        <select value={a.audioId || ''} onChange={e => updateAction(index, { audioId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">{t('actionsList.selectAudio')}</option>
                            {Object.values(project.audio).map((au: any) => <option key={au.id} value={au.id}>{au.name}</option>)}
                        </select>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-[var(--text-secondary)]">{t('actionsList.volume')}</span>
                            <RangeInput min={0} max={1} step={0.01} value={a.volume ?? 1}
                                onChange={e => updateAction(index, { volume: parseFloat(e.target.value) } as any)} className="flex-1 accent-[var(--accent-lavender)]" />
                        </div>
                        <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                            <input type="checkbox" checked={a.loop ?? false}
                                onChange={e => updateAction(index, { loop: e.target.checked } as any)} />
                            {t('actionsList.loop')}
                        </label>
                    </div>
                );
            case UIActionType.GoToScreen:
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-sky-500/30">
                        <select value={a.targetScreenId || ''} onChange={e => updateAction(index, { targetScreenId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">{t('actionsList.selectScreen')}</option>
                            {Object.values(project.uiScreens).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                );
            case UIActionType.ToggleScreen:
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-sky-500/30">
                        <select value={a.targetScreenId || ''} onChange={e => updateAction(index, { targetScreenId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">{t('actionsList.selectScreen')}</option>
                            {Object.values(project.uiScreens).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                );
            case UIActionType.JumpToScene:
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-sky-500/30">
                        <select value={a.targetSceneId || ''} onChange={e => updateAction(index, { targetSceneId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">{t('actionsList.selectScene')}</option>
                            {Object.values(project.scenes).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                );
            case UIActionType.JumpToLabel:
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-sky-500/30">
                        <input type="text" value={a.targetLabel || ''} placeholder={t('actionsList.labelName')}
                            onChange={e => updateAction(index, { targetLabel: e.target.value } as any)} className={inputCls} />
                    </div>
                );
            case UIActionType.OpenURL:
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-sky-500/30 space-y-1">
                        <input type="text" value={a.url || ''} placeholder={t('actionsList.url')}
                            onChange={e => updateAction(index, { url: e.target.value } as any)} className={inputCls} />
                        <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                            <input type="checkbox" checked={a.newTab ?? true}
                                onChange={e => updateAction(index, { newTab: e.target.checked } as any)} />
                            {t('actionsList.openNewTab')}
                        </label>
                    </div>
                );
            case UIActionType.PlayAnimation: {
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-purple-500/30 space-y-1">
                        <select value={a.targetElementId || ''} onChange={e => updateAction(index, { targetElementId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">{t('actionsList.selectElement')}</option>
                            {targetChoices.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
                        </select>
                        <div className="flex gap-1">
                            <select value={a.animation || 'shake'} onChange={e => updateAction(index, { animation: e.target.value } as any)} className={inputCls}>
                                <option value="shake">{t('actionsList.anim.shake')}</option>
                                <option value="bounce">{t('actionsList.anim.bounce')}</option>
                                <option value="pulse">{t('actionsList.anim.pulse')}</option>
                                <option value="spin">{t('actionsList.anim.spin')}</option>
                                <option value="fadeIn">{t('actionsList.anim.fadeIn')}</option>
                                <option value="fadeOut">{t('actionsList.anim.fadeOut')}</option>
                                <option value="slideIn">{t('actionsList.anim.slideIn')}</option>
                                <option value="glow">{t('actionsList.anim.glow')}</option>
                            </select>
                            <input type="number" value={a.duration ?? 500} min={100} step={100} placeholder="ms"
                                onChange={e => updateAction(index, { duration: Number(e.target.value) } as any)} className={inputCls} />
                        </div>
                    </div>
                );
            }
            case UIActionType.ChangeImage: {
                const imageAssets = Object.values(project.images).concat(Object.values(project.backgrounds) as any[]);
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-purple-500/30 space-y-1">
                        <select value={a.targetElementId || ''} onChange={e => updateAction(index, { targetElementId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">{t('actionsList.selectElement')}</option>
                            {targetChoices.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
                        </select>
                        <select value={a.newImageId || ''} onChange={e => updateAction(index, { newImageId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">{t('actionsList.selectImage')}</option>
                            {imageAssets.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                        </select>
                    </div>
                );
            }
            case UIActionType.GiveItem:
            case UIActionType.UseItem:
            case UIActionType.DestroyItem:
            case UIActionType.CarryItem: {
                const itemArr = Object.values(project.items || {}) as any[];
                const showQty = (action.type === UIActionType.GiveItem || action.type === UIActionType.DestroyItem) && !a.all;
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-amber-500/30 space-y-1">
                        <select value={a.itemId || ''} onChange={e => updateAction(index, { itemId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">{itemArr.length === 0 ? t('actionsList.noItems', 'No items defined (Systems → Items)') : t('actionsList.selectItem', 'Select an item…')}</option>
                            {itemArr.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                        </select>
                        {action.type === UIActionType.DestroyItem && (
                            <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                                <input type="checkbox" checked={!!a.all} onChange={e => updateAction(index, { all: e.target.checked || undefined } as any)} />
                                {t('actionsList.destroyAll', 'Remove all')}
                            </label>
                        )}
                        {showQty && (
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-[var(--text-secondary)]">{t('actionsList.quantity', 'Quantity')}</span>
                                <input type="number" min={1} value={a.quantity ?? 1}
                                    onChange={e => updateAction(index, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) } as any)} className={inputCls + ' w-16'} />
                            </div>
                        )}
                    </div>
                );
            }
            case UIActionType.RestockCollection: {
                const collArr = Object.values(project.itemCollections || {}) as any[];
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-amber-500/30">
                        <select value={a.collectionId || ''} onChange={e => updateAction(index, { collectionId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">{collArr.length === 0 ? t('actionsList.noCollections', 'No item lists defined (Systems → Inventory)') : t('actionsList.selectCollection', 'Select an item list…')}</option>
                            {collArr.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
                        </select>
                    </div>
                );
            }
            case UIActionType.BuyItem:
            case UIActionType.SellItem: {
                const itemArr = Object.values(project.items || {}) as any[];
                const collArr = Object.values(project.itemCollections || {}) as any[];
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-amber-500/30 space-y-1">
                        <select value={a.itemId || ''} onChange={e => updateAction(index, { itemId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">{itemArr.length === 0 ? t('actionsList.noItems', 'No items defined (Systems → Items)') : t('actionsList.selectItem', 'Select an item…')}</option>
                            {itemArr.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                        </select>
                        <select value={a.collectionId || ''} onChange={e => updateAction(index, { collectionId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">{collArr.length === 0 ? t('actionsList.noCollections', 'No item lists defined (Systems → Inventory)') : (action.type === UIActionType.BuyItem ? t('actionsList.shopBuyFrom', 'Shop list to buy from…') : t('actionsList.shopSellTo', 'Shop list to sell to…'))}</option>
                            {collArr.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
                        </select>
                    </div>
                );
            }
            case UIActionType.BuySelectedItem:
            case UIActionType.SellSelectedItem: {
                const collArr = Object.values(project.itemCollections || {}) as any[];
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-amber-500/30 space-y-1">
                        <select value={a.collectionId || ''} onChange={e => updateAction(index, { collectionId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">{collArr.length === 0 ? t('actionsList.noCollections', 'No item lists defined (Systems → Inventory)') : (action.type === UIActionType.BuySelectedItem ? t('actionsList.shopBuyFrom', 'Shop list to buy from…') : t('actionsList.shopSellTo', 'Shop list to sell to…'))}</option>
                            {collArr.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
                        </select>
                        <p className="text-[10px] text-[var(--text-muted)]">{t('actionsList.selectedItemHint', 'Acts on the item the player has selected in the grid.')}</p>
                    </div>
                );
            }
            case UIActionType.SaveGame:
            case UIActionType.LoadGame:
            case UIActionType.DeleteSave:
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-sky-500/30">
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-[var(--text-secondary)]">{t('actionsList.slot')}</span>
                            <input type="number" value={a.slotNumber ?? 1} min={1} max={99}
                                onChange={e => updateAction(index, { slotNumber: Number(e.target.value) } as any)} className={inputCls + ' w-16'} />
                        </div>
                        {a.type === UIActionType.DeleteSave && (
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">{t('actionsList.deleteSaveHint', 'Erases this slot (clears it for Save and Load). Shows the customizable “Erase Save” confirmation first.')}</p>
                        )}
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-[var(--text-secondary)] text-xs font-semibold">{listLabel}</span>
                <button onClick={addAction} className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-0.5">
                    <PlusIcon className="w-3 h-3" /> {t('actionsList.add')}
                </button>
            </div>
            {actions.length === 0 && (
                <p className="text-[10px] text-slate-500 italic">{t('actionsList.noActions')}</p>
            )}
            <div className="space-y-1">
                {actions.map((action, i) => {
                    const a = action as any;
                    let detail = '';
                    if (action.type === UIActionType.SetVariable || action.type === UIActionType.ResetVariable) detail = project.variables[a.variableId]?.name || '';
                    else if (action.type === UIActionType.JumpToScene) detail = (project.scenes[a.targetSceneId] as any)?.name || '';
                    else if (action.type === UIActionType.GoToScreen || action.type === UIActionType.ToggleScreen) detail = (project.uiScreens[a.targetScreenId] as any)?.name || '';
                    else if (action.type === UIActionType.GiveItem || action.type === UIActionType.UseItem || action.type === UIActionType.DestroyItem || action.type === UIActionType.CarryItem || action.type === UIActionType.BuyItem || action.type === UIActionType.SellItem) detail = (project.items?.[a.itemId] as any)?.name || '';
                    else if (action.type === UIActionType.RestockCollection || action.type === UIActionType.BuySelectedItem || action.type === UIActionType.SellSelectedItem) detail = (project.itemCollections?.[a.collectionId] as any)?.name || '';
                    const summary = detail ? `${actionLabel(action.type)}: ${detail}` : actionLabel(action.type);
                    return (
                        <CollapsibleSection
                            key={i}
                            title={t('actionEditor.actionN', { n: i + 1 })}
                            summary={summary}
                            defaultOpen={true}
                            action={
                                <button onClick={() => removeAction(i)} title={t('actionEditor.removeAction')} className="text-red-400 hover:text-red-300 p-0.5">
                                    <TrashIcon className="w-3 h-3" />
                                </button>
                            }
                        >
                            <select
                                value={action.type}
                                onChange={e => changeActionType(i, e.target.value as UIActionType)}
                                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px] mb-1"
                            >
                                {Object.values(UIActionType).map(at => (
                                    <option key={at} value={at}>{actionLabel(at)}</option>
                                ))}
                            </select>
                            {renderDetails(action, i)}
                        </CollapsibleSection>
                    );
                })}
            </div>
        </div>
    );
};

export default UIActionsListEditor;
