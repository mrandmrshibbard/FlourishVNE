import React from 'react';
import { useTranslation } from 'react-i18next';
import Panel from '../ui/Panel';
import { useProject } from '../../contexts/ProjectContext';
import { VNID } from '../../types';
import { VNCondition, VNConditionOperator, VNTextAlign } from '../../types/shared';
import { VNUIElement, UIElementType, UIButtonElement, UITextElement, UIImageElement, UISaveSlotGridElement, UISettingsSliderElement, UISettingsToggleElement, UICharacterPreviewElement, UITextInputElement, UIDropdownElement, UICheckboxElement, UIAssetCyclerElement, UICGGalleryElement, DropdownOption, GameSetting, GameToggleSetting, AssetCondition } from '../../features/ui/types';
import { VNVariable, VNVariableType } from '../../features/variables/types';
import { VNCharacter, VNCharacterLayer, VNLayerAsset } from '../../features/character/types';
import { VNProject } from '../../types/project';
import { FormField, TextInput, Select, ColorInput } from '../ui/Form';
import { TrashIcon, XMarkIcon, PlusIcon } from '../icons';
import FontEditor from '../ui/FontEditor';
import ActionEditor from './ActionEditor';
import AssetSelector from '../ui/AssetSelector';
import ConditionsEditor from '../ui/ConditionsEditor';
import CollapsibleSection from '../ui/CollapsibleSection';
import { INSPECTOR_GROUPS } from '../inspector/inspectorGroups';
import { ElementGroupFields, getElementGroups, summarizeElementGroup } from '../inspector/ElementGroupFields';

const generateOptionId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return `opt-${Math.random().toString(36).slice(2, 9)}`;
};

const buildDropdownOptions = (variable?: VNVariable): DropdownOption[] => {
    if (!variable) {
        return [
            { id: generateOptionId(), label: 'Option 1', value: 'option1' },
            { id: generateOptionId(), label: 'Option 2', value: 'option2' },
            { id: generateOptionId(), label: 'Option 3', value: 'option3' }
        ];
    }

    switch (variable.type) {
        case 'boolean':
            return [
                { id: generateOptionId(), label: 'True', value: true },
                { id: generateOptionId(), label: 'False', value: false }
            ];
        case 'number':
            return [
                { id: generateOptionId(), label: 'Option 1', value: 1 },
                { id: generateOptionId(), label: 'Option 2', value: 2 },
                { id: generateOptionId(), label: 'Option 3', value: 3 }
            ];
        default:
            return [
                { id: generateOptionId(), label: 'Option 1', value: 'option1' },
                { id: generateOptionId(), label: 'Option 2', value: 'option2' },
                { id: generateOptionId(), label: 'Option 3', value: 'option3' }
            ];
    }
};

const buildCheckboxValues = (variable?: VNVariable): { checkedValue: string | number | boolean; uncheckedValue: string | number | boolean } => {
    if (!variable) {
        return { checkedValue: true, uncheckedValue: false };
    }

    switch (variable.type) {
        case 'boolean':
            return { checkedValue: true, uncheckedValue: false };
        case 'number':
            return { checkedValue: 1, uncheckedValue: 0 };
        default:
            return { checkedValue: 'checked', uncheckedValue: 'unchecked' };
    }
};

const useElementDefaults = (
    element: VNUIElement | undefined,
    project: VNProject,
    updateElement: (updates: Partial<VNUIElement>) => void
) => {
    React.useEffect(() => {
        if (!element) {
            return;
        }

        switch (element.type) {
            case UIElementType.CharacterPreview: {
                const preview = element as UICharacterPreviewElement;
                if (!preview.characterId) {
                    const characterIds = Object.keys(project.characters);
                    if (characterIds.length === 1) {
                        const firstCharId = characterIds[0];
                        const firstChar = project.characters[firstCharId];
                        const firstExpressionId = firstChar ? Object.keys(firstChar.expressions)[0] : undefined;
                        updateElement({ characterId: firstCharId, expressionId: firstExpressionId, layerVariableMap: {} });
                        return;
                    }
                }

                if (preview.characterId) {
                    const character = project.characters[preview.characterId];
                    if (character && !preview.expressionId) {
                        const expressionIds = Object.keys(character.expressions);
                        if (expressionIds.length > 0) {
                            updateElement({ expressionId: expressionIds[0] });
                        }
                    }
                }
                break;
            }
            case UIElementType.TextInput: {
                const textInput = element as UITextInputElement;
                const variableIds = Object.keys(project.variables);
                if (!textInput.variableId && variableIds.length === 1) {
                    updateElement({ variableId: variableIds[0] });
                }
                break;
            }
            case UIElementType.Dropdown: {
                const dropdown = element as UIDropdownElement;
                const variableIds = Object.keys(project.variables);
                if (!dropdown.variableId && variableIds.length === 1) {
                    const variable = project.variables[variableIds[0]];
                    updateElement({ variableId: variableIds[0], options: buildDropdownOptions(variable) });
                }
                break;
            }
            case UIElementType.Checkbox: {
                const checkbox = element as UICheckboxElement;
                const variableIds = Object.keys(project.variables);
                if (!checkbox.variableId && variableIds.length === 1) {
                    const variable = project.variables[variableIds[0]];
                    const defaults = buildCheckboxValues(variable);
                    updateElement({ variableId: variableIds[0], ...defaults });
                }
                break;
            }
            case UIElementType.AssetCycler: {
                const cycler = element as UIAssetCyclerElement;
                const characterIds = Object.keys(project.characters);
                if (!cycler.characterId && characterIds.length === 1) {
                    const charId = characterIds[0];
                    const character = project.characters[charId];
                    const firstLayerId = character ? Object.keys(character.layers)[0] : '';
                    const firstLayer = firstLayerId && character ? character.layers[firstLayerId] : undefined;
                    const assetIds = firstLayer ? Object.keys(firstLayer.assets) : [];
                    updateElement({ characterId: charId, layerId: firstLayerId, assetIds });
                    return;
                }

                if (cycler.characterId && !cycler.layerId) {
                    const character = project.characters[cycler.characterId];
                    if (character) {
                        const layerIds = Object.keys(character.layers);
                        if (layerIds.length === 1) {
                            const layer = character.layers[layerIds[0]];
                            const assetIds = layer ? Object.keys(layer.assets) : [];
                            updateElement({ layerId: layerIds[0], assetIds });
                        }
                    }
                }
                break;
            }
            default:
                break;
        }
    }, [element, project.characters, project.variables, updateElement]);
};

const UIElementInspector: React.FC<{
    screenId: VNID;
    elementId: VNID;
    setSelectedElementId: (id: VNID | null) => void;
    /** Deep link to the Systems tab (items/lists/stats) — the reverse of "Edit screen". */
    onOpenSystems?: (sel: { system: 'items' | 'inventory' | 'stats'; id?: VNID }) => void;
    /** Deep link to the Characters tab (Customizer → edit its character's layers/art). */
    onOpenCharacters?: (charId: VNID) => void;
}> = ({ screenId, elementId, setSelectedElementId, onOpenSystems, onOpenCharacters }) => {
    const { t } = useTranslation('ui');
    const { project, dispatch } = useProject();
    const screen = project.uiScreens[screenId];
    const element = screen?.elements[elementId];

    // NOTE: the missing-element return must stay BELOW every hook. The selection can outlive
    // the element (undoing a paste removes the element but not the selection); an early return
    // up here changed the hook count between renders and crashed the whole app to a blank
    // screen ("Rendered fewer hooks than expected").

    const updateElement = React.useCallback((updates: Partial<VNUIElement>) => {
        console.log('[UIElementInspector] Updating element:', elementId, 'with updates:', updates);
        console.log('[UIElementInspector] Current element before update:', element);
        dispatch({ type: 'UPDATE_UI_ELEMENT', payload: { screenId, elementId, updates }});
    }, [dispatch, element, elementId, screenId]);

    useElementDefaults(element, project, updateElement);

    const handleDelete = () => {
        dispatch({ type: 'DELETE_UI_ELEMENT', payload: { screenId, elementId } });
        setSelectedElementId(null);
    };

    // "Manage in Systems" — resolves where this element's data lives: an inventory grid's
    // bound list (or the player inventory), or the stat behind a meter's variable.
    const systemsLink = React.useMemo((): { label: string; sel: { system: 'items' | 'inventory' | 'stats'; id?: VNID } } | null => {
        if (!element || !onOpenSystems) return null;
        if (element.type === UIElementType.Inventory) {
            const collectionId = (element as any).collectionId as VNID | undefined;
            return { label: collectionId ? 'Manage this item list in Systems →' : 'Manage items in Systems →', sel: { system: 'inventory', id: collectionId } };
        }
        if (element.type === UIElementType.Meter) {
            const varId = (element as any).variableId as VNID | undefined;
            const allStats = Object.values(project.stats || {}) as import('../../features/stats/types').VNStat[];
            const stat = varId ? allStats.find(s => Object.values(s.variableIds || {}).includes(varId)) : undefined;
            if (stat) return { label: `Manage "${stat.name}" stat in Systems →`, sel: { system: 'stats', id: stat.id } };
            return { label: 'Manage stats in Systems →', sel: { system: 'stats' } };
        }
        return null;
    }, [element, onOpenSystems, project.stats]);

    if (!element) return <Panel title={t('elementInspector.propsTitle')}>{t('elementInspector.notFound')}</Panel>;

    return (
        <Panel title={`Properties: ${element.type}`} className="w-[26rem] flex-shrink-0">
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
                {systemsLink && (
                    <button onClick={() => onOpenSystems!(systemsLink.sel)}
                        className="w-full text-left text-xs px-2.5 py-2 rounded-lg bg-[var(--accent-lavender)]/10 hover:bg-[var(--accent-lavender)]/20 text-[var(--accent-lavender)] border border-[var(--accent-lavender)]/30 transition-colors">
                        {systemsLink.label}
                    </button>
                )}
                <FormField label={t('elementInspector.elementName')}><TextInput value={element.name} onChange={e => updateElement({ name: e.target.value })} /></FormField>
                {getElementGroups(element).map(g => (
                    <CollapsibleSection
                        key={g}
                        title={t(INSPECTOR_GROUPS[g].i18nKey)}
                        glyph={INSPECTOR_GROUPS[g].glyph}
                        summary={summarizeElementGroup(element, g, project)}
                        defaultOpen={g === 'content'}
                    >
                        <ElementGroupFields groupId={g} element={element} project={project} updateElement={updateElement} onOpenCharacters={onOpenCharacters} />
                    </CollapsibleSection>
                ))}
            </div>
            <div className="pt-4 mt-auto">
                <button onClick={handleDelete} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
                    <TrashIcon/> Delete Element
                </button>
            </div>
        </Panel>
    );
};

export default UIElementInspector;