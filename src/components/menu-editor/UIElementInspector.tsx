import React from 'react';
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

/** Collapsible section for organizing inspector properties */
const CollapsibleSection: React.FC<{
    title: string;
    defaultOpen?: boolean;
    badge?: string;
    hint?: string;
    children: React.ReactNode;
}> = ({ title, defaultOpen = false, badge, hint, children }) => {
    const [isOpen, setIsOpen] = React.useState(defaultOpen);
    return (
        <div className="rounded-lg overflow-hidden border border-slate-700/60">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-700/30 transition-colors text-left"
            >
                <span className={`text-[10px] text-slate-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                <span className="text-xs font-semibold text-slate-300 flex-1">{title}</span>
                {badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400">{badge}</span>}
            </button>
            {hint && !isOpen && <p className="text-[10px] text-slate-500 px-3 pb-2 -mt-1">{hint}</p>}
            {isOpen && <div className="px-3 pb-3 border-t border-slate-700/40 pt-2">{children}</div>}
        </div>
    );
};

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
    element: VNUIElement,
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
}> = ({ screenId, elementId, setSelectedElementId }) => {
    const { project, dispatch } = useProject();
    const screen = project.uiScreens[screenId];
    const element = screen?.elements[elementId];

    if (!element) return <Panel title="Properties">Element not found</Panel>;

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

    const renderCommonProperties = () => (
        <>
            <FormField label="Element Name"><TextInput value={element.name} onChange={e => updateElement({ name: e.target.value })} /></FormField>
            <div className="grid grid-cols-2 gap-2">
                <FormField label="X %"><TextInput type="number" value={element.x} onChange={e => updateElement({ x: parseFloat(e.target.value) || 0 })} /></FormField>
                <FormField label="Y %"><TextInput type="number" value={element.y} onChange={e => updateElement({ y: parseFloat(e.target.value) || 0 })} /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <FormField label="Width %"><TextInput type="number" value={element.width} onChange={e => updateElement({ width: parseFloat(e.target.value) || 0 })} /></FormField>
                <FormField label="Height %"><TextInput type="number" value={element.height} onChange={e => updateElement({ height: parseFloat(e.target.value) || 0 })} /></FormField>
            </div>
            
            <FormField label={`Opacity: ${Math.round((element.opacity ?? 1) * 100)}%`}>
                <input type="range" min="0" max="1" step="0.01" value={element.opacity ?? 1} onChange={e => updateElement({ opacity: parseFloat(e.target.value) })} className="w-full accent-purple-500" />
            </FormField>
            
            <div className="space-y-2 mt-3">
                <CollapsibleSection title="Position & Anchor" hint="Fine-tune anchor point">
                    <div className="grid grid-cols-2 gap-2 mt-1">
                        <FormField label="Anchor X (0-1)"><TextInput type="number" step="0.1" value={element.anchorX} onChange={e => updateElement({ anchorX: parseFloat(e.target.value) || 0 })} /></FormField>
                        <FormField label="Anchor Y (0-1)"><TextInput type="number" step="0.1" value={element.anchorY} onChange={e => updateElement({ anchorY: parseFloat(e.target.value) || 0 })} /></FormField>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Transition" hint={`${element.transitionIn || 'fade'} ${element.transitionDuration || 300}ms`}>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                        <FormField label="Transition In">
                            <Select value={element.transitionIn || 'fade'} onChange={e => updateElement({ transitionIn: e.target.value as any })}>
                                <option value="none">None</option>
                                <option value="fade">Fade</option>
                                <option value="slideUp">Slide Up</option>
                                <option value="slideDown">Slide Down</option>
                                <option value="slideLeft">Slide Left</option>
                                <option value="slideRight">Slide Right</option>
                                <option value="scale">Scale</option>
                            </Select>
                        </FormField>
                        <FormField label="Duration (ms)">
                            <TextInput type="number" value={element.transitionDuration || 300} onChange={e => updateElement({ transitionDuration: parseInt(e.target.value) || 300 })} />
                        </FormField>
                    </div>
                    <FormField label="Delay (ms)">
                        <TextInput type="number" value={element.transitionDelay || 0} onChange={e => updateElement({ transitionDelay: parseInt(e.target.value) || 0 })} />
                    </FormField>
                </CollapsibleSection>
                
                <CollapsibleSection 
                    title="Visibility Conditions" 
                    hint="Show/hide based on variables"
                    badge={element.conditions?.length ? String(element.conditions.length) : undefined}
                >
                    <p className="text-[10px] text-slate-500 mb-2">This element will only be visible if all conditions are met.</p>
                    <ConditionsEditor 
                        conditions={element.conditions} 
                        project={project} 
                        onChange={(cs) => updateElement({ conditions: cs })}
                    />
                </CollapsibleSection>
            </div>
        </>
    );

    const renderSpecificProperties = () => {
        switch (element.type) {
            case UIElementType.Button: {
                const el = element as UIButtonElement;
                return <>
                    <FormField label="Text"><TextInput value={el.text} onChange={e => updateElement({ text: e.target.value })} /></FormField>
                    
                    <h4 className="font-bold text-sm mt-2 text-slate-400">Default Image</h4>
                    <div className="grid grid-cols-2 gap-2 p-2 border border-slate-700 rounded">
                        <AssetSelector label="Asset" assetType={el.image?.type === 'video' ? 'videos' : 'images'} allowVideo value={el.image?.id || null} onChange={id => updateElement({ image: id ? { type: el.image?.type || 'image', id } : null })} />
                        <FormField label="Type">
                            <Select value={el.image?.type || 'image'} onChange={e => updateElement({ image: { type: e.target.value as 'image'|'video', id: el.image?.id || '' }})}>
                                <option value="image">Image</option>
                                <option value="video">Video</option>
                            </Select>
                        </FormField>
                    </div>
                    
                    <h4 className="font-bold text-sm mt-2 text-slate-400">Hover Image</h4>
                    <div className="grid grid-cols-2 gap-2 p-2 border border-slate-700 rounded">
                        <AssetSelector label="Asset" assetType={el.hoverImage?.type === 'video' ? 'videos' : 'images'} allowVideo value={el.hoverImage?.id || null} onChange={id => updateElement({ hoverImage: id ? { type: el.hoverImage?.type || 'image', id } : null })} />
                        <FormField label="Type">
                            <Select value={el.hoverImage?.type || 'image'} onChange={e => updateElement({ hoverImage: { type: e.target.value as 'image'|'video', id: el.hoverImage?.id || '' }})}>
                                <option value="image">Image</option>
                                <option value="video">Video</option>
                            </Select>
                        </FormField>
                    </div>

                     <div className="grid grid-cols-2 gap-2 mt-2">
                        <AssetSelector label="Hover Sound" assetType="audio" value={el.hoverSoundId} onChange={id => updateElement({ hoverSoundId: id })} />
                        <AssetSelector label="Click Sound" assetType="audio" value={el.clickSoundId} onChange={id => updateElement({ clickSoundId: id })} />
                    </div>
                    
                    <h4 className="font-bold text-sm mt-3 text-slate-400">Button Colors (when no image is set)</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label="Background">
                            <ColorInput value={el.backgroundColor || '#4D3273'} onChange={val => updateElement({ backgroundColor: val })} />
                        </FormField>
                        <FormField label="Hover Background">
                            <ColorInput value={el.hoverBackgroundColor || '#6B4C9A'} onChange={val => updateElement({ hoverBackgroundColor: val })} />
                        </FormField>
                    </div>

                    <h3 className="font-bold my-2 text-slate-400">Font Style</h3>
                    <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })}/>
                    <h3 className="font-bold my-2 text-slate-400">Primary Action</h3>
                    <ActionEditor action={el.action} onActionChange={action => updateElement({ action })} />
                    <h3 className="font-bold my-2 text-slate-400">Additional Actions</h3>
                    <div className="space-y-2">
                        {(el.actions || []).map((action, idx) => (
                            <div key={idx} className="p-2 bg-slate-800 rounded space-y-2">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-slate-400">Action {idx + 1}</span>
                                    <button 
                                        onClick={() => {
                                            const newActions = (el.actions || []).filter((_, i) => i !== idx);
                                            updateElement({ actions: newActions });
                                        }}
                                        className="p-1 hover:bg-red-600 rounded transition-colors"
                                        title="Remove Action"
                                    >
                                        <TrashIcon className="w-3 h-3" />
                                    </button>
                                </div>
                                <ActionEditor 
                                    action={action} 
                                    onActionChange={updatedAction => {
                                        const newActions = [...(el.actions || [])];
                                        newActions[idx] = updatedAction;
                                        updateElement({ actions: newActions });
                                    }} 
                                />
                            </div>
                        ))}
                        <button 
                            onClick={() => {
                                const newAction = { type: 'GoToScreen', targetScreenId: '' } as any;
                                updateElement({ actions: [...(el.actions || []), newAction] });
                            }}
                            className="w-full p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors text-sm"
                        >
                            + Add Action
                        </button>
                    </div>
                </>
            }
            case UIElementType.Text: {
                 const el = element as UITextElement;
                 return <>
                    <FormField label="Text"><TextInput value={el.text} onChange={e => updateElement({ text: e.target.value })} /></FormField>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label="Horizontal Align">
                            <Select value={el.textAlign || el.font?.align || 'center'} onChange={e => {
                                const align = e.target.value as VNTextAlign;
                                updateElement({ textAlign: align, font: { ...el.font, align } });
                            }}>
                                <option value="left">Left</option>
                                <option value="center">Center</option>
                                <option value="right">Right</option>
                            </Select>
                        </FormField>
                        <FormField label="Vertical Align">
                            <Select value={el.verticalAlign} onChange={e => updateElement({ verticalAlign: e.target.value as any })}>
                                <option value="top">Top</option>
                                <option value="middle">Middle</option>
                                <option value="bottom">Bottom</option>
                            </Select>
                        </FormField>
                    </div>
                    <h3 className="font-bold my-2 text-slate-400">Font Style</h3>
                    <FontEditor font={el.font} onFontChange={(prop, value) => {
                        const updates: Partial<UITextElement> = { font: { ...el.font, [prop]: value } };
                        if (prop === 'align') updates.textAlign = value as VNTextAlign;
                        updateElement(updates);
                    }}/>
                 </>
            }
            case UIElementType.Image: {
                const el = element as UIImageElement;
                // Check if this is a video-only element (created by Add Video button)
                const isVideoOnly = el.name === 'Video' && el.background?.type === 'video';
                
                // Determine current background type and value
                const bgType = el.background?.type || (el.image ? el.image.type : 'image');
                const bgValue = el.background?.type === 'color' ? el.background.value : 
                               el.background?.assetId || null;
                
                return <>
                    {/* Only show Background Type dropdown for regular image elements, not video-only elements */}
                    {!isVideoOnly && (
                        <FormField label="Background Type">
                            <Select 
                                value={bgType} 
                                onChange={e => {
                                    const newType = e.target.value as 'color' | 'image' | 'video';
                                    if (newType === 'color') {
                                        updateElement({ background: { type: 'color', value: '#000000' }, image: null });
                                    } else {
                                        updateElement({ background: { type: newType, assetId: null }, image: null });
                                    }
                                }}
                            >
                                <option value="color">Color</option>
                                <option value="image">Image</option>
                                <option value="video">Video</option>
                            </Select>
                        </FormField>
                    )}
                    
                    {bgType === 'color' ? (
                        <FormField label="Color Value">
                            <TextInput 
                                type="color" 
                                value={typeof bgValue === 'string' && bgValue.startsWith('#') ? bgValue : '#000000'} 
                                onChange={e => updateElement({ background: { type: 'color', value: e.target.value }, image: null })} 
                                className="p-1 h-10"
                            />
                        </FormField>
                    ) : (
                        <AssetSelector 
                            label={bgType === 'video' ? 'Video Asset' : 'Image Asset'} 
                            assetType={bgType === 'video' ? 'videos' : 'images'} 
                            allowVideo
                            value={typeof bgValue === 'string' ? bgValue : null} 
                            onChange={id => updateElement({ background: { type: bgType as 'image' | 'video', assetId: id }, image: null })} 
                        />
                    )}
                    
                    {bgType !== 'color' && (
                        <FormField label="Fit Mode">
                            <Select 
                                value={el.objectFit || 'contain'} 
                                onChange={e => updateElement({ objectFit: e.target.value as 'contain' | 'cover' | 'fill' })}
                            >
                                <option value="contain">Contain (fit inside, show all)</option>
                                <option value="cover">Cover (fill entire area)</option>
                                <option value="fill">Fill (stretch to fit)</option>
                            </Select>
                        </FormField>
                    )}
                    
                    <p className="text-xs text-slate-400 mt-1">
                        💡 <strong>Cover</strong> mode fills the entire element but may crop edges. Perfect for fullscreen backgrounds!
                    </p>
                </>
            }
            case UIElementType.SaveSlotGrid: {
                const el = element as UISaveSlotGridElement;
                return <>
                    <FormField label="Slot Count"><TextInput type="number" value={el.slotCount} onChange={e => updateElement({ slotCount: parseInt(e.target.value) || 1})} /></FormField>
                    <FormField label="Empty Slot Text"><TextInput value={el.emptySlotText} onChange={e => updateElement({ emptySlotText: e.target.value })} /></FormField>
                    <h3 className="font-bold my-2 text-slate-400">Font Style</h3>
                    <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })}/>
                    <h3 className="font-bold my-2 text-slate-400">Colors</h3>
                    <FormField label="Slot Background">
                        <ColorInput value={el.slotBackgroundColor} onChange={c => updateElement({ slotBackgroundColor: c })} />
                    </FormField>
                    <FormField label="Slot Border">
                        <ColorInput value={el.slotBorderColor} onChange={c => updateElement({ slotBorderColor: c })} />
                    </FormField>
                    <FormField label="Slot Hover Border">
                        <ColorInput value={el.slotHoverBorderColor} onChange={c => updateElement({ slotHoverBorderColor: c })} />
                    </FormField>
                    <FormField label="Slot Header">
                        <ColorInput value={el.slotHeaderColor} onChange={c => updateElement({ slotHeaderColor: c })} />
                    </FormField>
                    <FormField label="Slot Text">
                        <ColorInput value={el.slotTextColor} onChange={c => updateElement({ slotTextColor: c })} />
                    </FormField>
                    <FontEditor label="Empty Slot Text Font" font={el.emptySlotFont || { family: 'Arial, sans-serif', size: 14, color: el.emptySlotTextColor || '#a0aec0', weight: 'normal', italic: false }} onFontChange={(prop, value) => updateElement({ emptySlotFont: { ...(el.emptySlotFont || { family: 'Arial, sans-serif', size: 14, color: el.emptySlotTextColor || '#a0aec0', weight: 'normal', italic: false }), [prop]: value } })} />
                    <h3 className="font-bold my-2 text-slate-400">Info Bar</h3>
                    <div className="flex items-center gap-4 my-1">
                        <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                            <input type="checkbox" checked={el.hideInfoBar === true} onChange={e => updateElement({ hideInfoBar: e.target.checked })} className="accent-purple-500" />
                            Hide info bar
                        </label>
                        {!el.hideInfoBar && (
                            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={el.hideSlotLabel === true} onChange={e => updateElement({ hideSlotLabel: e.target.checked })} className="accent-purple-500" />
                                Hide slot label
                            </label>
                        )}
                    </div>
                    <h3 className="font-bold my-2 text-slate-400">Navigation Buttons</h3>
                    <FormField label="Prev Button Text"><TextInput value={el.prevButtonText ?? '◀ Prev'} onChange={e => updateElement({ prevButtonText: e.target.value })} /></FormField>
                    <FormField label="Next Button Text"><TextInput value={el.nextButtonText ?? 'Next ▶'} onChange={e => updateElement({ nextButtonText: e.target.value })} /></FormField>
                    <FontEditor label="Nav Button Font" font={el.navButtonFont || { family: 'Arial, sans-serif', size: 12, color: el.slotHeaderColor || '#7dd3fc', weight: 'bold', italic: false }} onFontChange={(prop, value) => updateElement({ navButtonFont: { ...(el.navButtonFont || { family: 'Arial, sans-serif', size: 12, color: el.slotHeaderColor || '#7dd3fc', weight: 'bold', italic: false }), [prop]: value } })} showAlign={false} />
                    <FontEditor label="Page Indicator Font" font={el.pageIndicatorFont || { family: 'Arial, sans-serif', size: 12, color: '#e2e8f0', weight: 'normal', italic: false }} onFontChange={(prop, value) => updateElement({ pageIndicatorFont: { ...(el.pageIndicatorFont || { family: 'Arial, sans-serif', size: 12, color: '#e2e8f0', weight: 'normal', italic: false }), [prop]: value } })} showAlign={false} />
                </>
            }
            case UIElementType.SettingsSlider: {
                const el = element as UISettingsSliderElement;
                const isVariableMode = !!el.variableId;
                const numberVariables = Object.values(project.variables).filter((v): v is VNVariable => (v as VNVariable).type === 'number');
                
                return <>
                    <FormField label="Control Mode">
                        <Select 
                            value={isVariableMode ? 'variable' : 'setting'} 
                            onChange={e => {
                                if (e.target.value === 'variable') {
                                    // Switch to variable mode
                                    const firstVar = numberVariables[0];
                                    updateElement({ 
                                        variableId: firstVar?.id || '', 
                                        minValue: 0, 
                                        maxValue: 100,
                                        setting: undefined 
                                    });
                                } else {
                                    // Switch to settings mode
                                    updateElement({ 
                                        variableId: undefined, 
                                        minValue: undefined, 
                                        maxValue: undefined,
                                        setting: 'musicVolume' as GameSetting 
                                    });
                                }
                            }}
                        >
                            <option value="setting">Game Setting</option>
                            <option value="variable">Variable</option>
                        </Select>
                    </FormField>

                    {isVariableMode ? (
                        <>
                            <FormField label="Variable">
                                <Select value={el.variableId || ''} onChange={e => updateElement({ variableId: e.target.value })}>
                                    {numberVariables.length === 0 && <option value="">No number variables available</option>}
                                    {numberVariables.map(v => (
                                        <option key={v.id} value={v.id}>{v.name}</option>
                                    ))}
                                </Select>
                            </FormField>
                            <div className="grid grid-cols-2 gap-2">
                                <FormField label="Min Value">
                                    <TextInput 
                                        type="number" 
                                        value={el.minValue ?? 0} 
                                        onChange={e => updateElement({ minValue: parseFloat(e.target.value) || 0 })} 
                                    />
                                </FormField>
                                <FormField label="Max Value">
                                    <TextInput 
                                        type="number" 
                                        value={el.maxValue ?? 100} 
                                        onChange={e => updateElement({ maxValue: parseFloat(e.target.value) || 100 })} 
                                    />
                                </FormField>
                            </div>
                        </>
                    ) : (
                        <FormField label="Setting Controlled">
                            <Select value={el.setting} onChange={e => updateElement({ setting: e.target.value as GameSetting })}>
                                <option value="musicVolume">Music Volume</option>
                                <option value="sfxVolume">SFX Volume</option>
                                <option value="ambientVolume">Ambient Volume</option>
                                <option value="textSpeed">Text Speed</option>
                            </Select>
                        </FormField>
                    )}
                    
                    <h4 className="font-bold text-sm mt-3 text-slate-400">Slider Images</h4>
                    <AssetSelector label="Thumb Image" assetType="images" allowVideo value={el.thumbImage?.id || null} onChange={id => updateElement({ thumbImage: id ? { type: 'image', id } : null })} />
                    <AssetSelector label="Track Image" assetType="images" allowVideo value={el.trackImage?.id || null} onChange={id => updateElement({ trackImage: id ? { type: 'image', id } : null })} />
                    
                    <h4 className="font-bold text-sm mt-3 text-slate-400">Slider Colors</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label="Thumb Color">
                            <ColorInput value={el.thumbColor || '#8a2be2'} onChange={val => updateElement({ thumbColor: val })} />
                        </FormField>
                        <FormField label="Track Color">
                            <ColorInput value={el.trackColor || '#4D3273'} onChange={val => updateElement({ trackColor: val })} />
                        </FormField>
                    </div>

                    {isVariableMode && (
                        <>
                            <h3 className="font-bold my-2 text-slate-400">Additional Actions</h3>
                            <div className="space-y-2">
                                {(el.actions || []).map((action, idx) => (
                                    <div key={idx} className="p-2 bg-slate-800 rounded space-y-2">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs text-slate-400">Action {idx + 1}</span>
                                            <button 
                                                onClick={() => {
                                                    const newActions = (el.actions || []).filter((_, i) => i !== idx);
                                                    updateElement({ actions: newActions });
                                                }}
                                                className="p-1 hover:bg-red-600 rounded transition-colors"
                                                title="Remove Action"
                                            >
                                                <TrashIcon className="w-3 h-3" />
                                            </button>
                                        </div>
                                        <ActionEditor 
                                            action={action} 
                                            onActionChange={updatedAction => {
                                                const newActions = [...(el.actions || [])];
                                                newActions[idx] = updatedAction;
                                                updateElement({ actions: newActions });
                                            }} 
                                        />
                                    </div>
                                ))}
                                <button 
                                    onClick={() => {
                                        const newAction = { type: 'GoToScreen', targetScreenId: '' } as any;
                                        updateElement({ actions: [...(el.actions || []), newAction] });
                                    }}
                                    className="w-full p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors text-sm"
                                >
                                    + Add Action
                                </button>
                            </div>
                        </>
                    )}
                </>
            }
            case UIElementType.SettingsToggle: {
                const el = element as UISettingsToggleElement;
                const isVariableMode = !!el.variableId;
                const allVariables = Object.values(project.variables) as VNVariable[];
                
                return <>
                    <FormField label="Control Mode">
                        <Select 
                            value={isVariableMode ? 'variable' : 'setting'} 
                            onChange={e => {
                                if (e.target.value === 'variable') {
                                    // Switch to variable mode
                                    const firstVar = allVariables[0];
                                    let checkedVal: string | number | boolean = true;
                                    let uncheckedVal: string | number | boolean = false;
                                    if (firstVar?.type === 'number') {
                                        checkedVal = 1;
                                        uncheckedVal = 0;
                                    } else if (firstVar?.type === 'string') {
                                        checkedVal = 'checked';
                                        uncheckedVal = 'unchecked';
                                    }
                                    updateElement({ 
                                        variableId: firstVar?.id || '', 
                                        checkedValue: checkedVal,
                                        uncheckedValue: uncheckedVal,
                                        setting: undefined 
                                    });
                                } else {
                                    // Switch to settings mode
                                    updateElement({ 
                                        variableId: undefined, 
                                        checkedValue: undefined,
                                        uncheckedValue: undefined,
                                        setting: 'enableSkip' as GameToggleSetting 
                                    });
                                }
                            }}
                        >
                            <option value="setting">Game Setting</option>
                            <option value="variable">Variable</option>
                        </Select>
                    </FormField>

                    {isVariableMode ? (
                        <>
                            <FormField label="Variable">
                                <Select value={el.variableId || ''} onChange={e => {
                                    const newVarId = e.target.value;
                                    const newVar = project.variables[newVarId];
                                    let checkedVal: string | number | boolean = true;
                                    let uncheckedVal: string | number | boolean = false;
                                    if (newVar?.type === 'number') {
                                        checkedVal = 1;
                                        uncheckedVal = 0;
                                    } else if (newVar?.type === 'string') {
                                        checkedVal = 'checked';
                                        uncheckedVal = 'unchecked';
                                    }
                                    updateElement({ 
                                        variableId: newVarId,
                                        checkedValue: checkedVal,
                                        uncheckedValue: uncheckedVal
                                    });
                                }}>
                                    {allVariables.length === 0 && <option value="">No variables available</option>}
                                    {allVariables.map(v => (
                                        <option key={v.id} value={v.id}>{v.name} ({v.type})</option>
                                    ))}
                                </Select>
                            </FormField>
                            
                            <h3 className="font-bold my-2 text-slate-400">Values</h3>
                            <FormField label="Checked Value">
                                <TextInput 
                                    value={String(el.checkedValue ?? true)}
                                    onChange={e => {
                                        const variable = project.variables[el.variableId || ''];
                                        let newValue: string | number | boolean = e.target.value;
                                        if (variable?.type === 'number') {
                                            newValue = isNaN(Number(e.target.value)) ? 0 : Number(e.target.value);
                                        } else if (variable?.type === 'boolean') {
                                            newValue = e.target.value.toLowerCase() === 'true';
                                        }
                                        updateElement({ checkedValue: newValue });
                                    }}
                                />
                            </FormField>
                            <FormField label="Unchecked Value">
                                <TextInput 
                                    value={String(el.uncheckedValue ?? false)}
                                    onChange={e => {
                                        const variable = project.variables[el.variableId || ''];
                                        let newValue: string | number | boolean = e.target.value;
                                        if (variable?.type === 'number') {
                                            newValue = isNaN(Number(e.target.value)) ? 0 : Number(e.target.value);
                                        } else if (variable?.type === 'boolean') {
                                            newValue = e.target.value.toLowerCase() === 'true';
                                        }
                                        updateElement({ uncheckedValue: newValue });
                                    }}
                                />
                            </FormField>
                        </>
                    ) : (
                        <FormField label="Setting Controlled">
                            <Select value={el.setting} onChange={e => updateElement({ setting: e.target.value as GameToggleSetting })}>
                                <option value="enableSkip">Enable Skip</option>
                            </Select>
                        </FormField>
                    )}
                    
                    <FormField label="Label Text"><TextInput value={el.text} onChange={e => updateElement({ text: e.target.value })} /></FormField>
                    
                    <h4 className="font-bold text-sm mt-3 text-slate-400">Checkbox Images</h4>
                    <AssetSelector label="Checked Image" assetType="images" allowVideo value={el.checkedImage?.id || null} onChange={id => updateElement({ checkedImage: id ? { type: 'image', id } : null })} />
                    <AssetSelector label="Unchecked Image" assetType="images" allowVideo value={el.uncheckedImage?.id || null} onChange={id => updateElement({ uncheckedImage: id ? { type: 'image', id } : null })} />
                    
                    <h4 className="font-bold text-sm mt-3 text-slate-400">Checkbox Color</h4>
                    <FormField label="Color">
                        <ColorInput value={el.checkboxColor || '#ec4899'} onChange={val => updateElement({ checkboxColor: val })} />
                    </FormField>
                    
                    <h3 className="font-bold my-2 text-slate-400">Font Style</h3>
                    <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })}/>

                    {isVariableMode && (
                        <>
                            <h3 className="font-bold my-2 text-slate-400">Additional Actions</h3>
                            <div className="space-y-2">
                                {(el.actions || []).map((action, idx) => (
                                    <div key={idx} className="p-2 bg-slate-800 rounded space-y-2">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs text-slate-400">Action {idx + 1}</span>
                                            <button 
                                                onClick={() => {
                                                    const newActions = (el.actions || []).filter((_, i) => i !== idx);
                                                    updateElement({ actions: newActions });
                                                }}
                                                className="p-1 hover:bg-red-600 rounded transition-colors"
                                                title="Remove Action"
                                            >
                                                <TrashIcon className="w-3 h-3" />
                                            </button>
                                        </div>
                                        <ActionEditor 
                                            action={action} 
                                            onActionChange={updatedAction => {
                                                const newActions = [...(el.actions || [])];
                                                newActions[idx] = updatedAction;
                                                updateElement({ actions: newActions });
                                            }} 
                                        />
                                    </div>
                                ))}
                                <button 
                                    onClick={() => {
                                        const newAction = { type: 'GoToScreen', targetScreenId: '' } as any;
                                        updateElement({ actions: [...(el.actions || []), newAction] });
                                    }}
                                    className="w-full p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors text-sm"
                                >
                                    + Add Action
                                </button>
                            </div>
                        </>
                    )}
                </>
            }
            case UIElementType.CharacterPreview: {
                const el = element as UICharacterPreviewElement;
                const character = el.characterId ? project.characters[el.characterId] : null;
                const stringVariables = Object.values(project.variables).filter((v): v is VNVariable => (v as VNVariable).type === 'string');
                const layerCount = character ? Object.keys(character.layers).length : 0;
                const mappedCount = character ? Object.values(el.layerVariableMap || {}).filter(Boolean).length : 0;
                
                return <>
                    <p className="text-xs text-slate-400 mb-3">
                        Displays a live preview of the character, updating automatically as the player makes customization choices.
                    </p>

                    <FormField label="Character">
                        <Select value={el.characterId || ''} onChange={e => {
                            const newCharId = e.target.value;
                            const newChar = project.characters[newCharId];
                            const firstExprId = newChar ? Object.keys(newChar.expressions)[0] : undefined;
                            updateElement({ characterId: newCharId, expressionId: firstExprId, layerVariableMap: {} });
                        }}>
                            <option value="">Select Character...</option>
                            {Object.values(project.characters).map((char: unknown) => {
                                const c = char as VNCharacter;
                                return <option key={c.id} value={c.id}>{c.name}</option>;
                            })}
                        </Select>
                    </FormField>
                    
                    {character && Object.keys(character.expressions).length > 0 && (
                        <FormField label="Default Expression">
                            <Select value={el.expressionId || ''} onChange={e => updateElement({ expressionId: e.target.value || undefined })}>
                                <option value="">None</option>
                                {Object.values(character.expressions).map((expr: unknown) => {
                                    const e = expr as any;
                                    return <option key={e.id} value={e.id}>{e.name}</option>;
                                })}
                            </Select>
                        </FormField>
                    )}
                    
                    {character && layerCount > 0 && (
                        <div className="mt-3">
                            <CollapsibleSection 
                                title="Layer Connections" 
                                defaultOpen={true}
                                badge={`${mappedCount}/${layerCount}`}
                                hint="Which variable drives each layer"
                            >
                                <p className="text-[10px] text-slate-500 mb-2">
                                    Connect each layer to the variable set by its Asset Cycler. The preview will update live as the player cycles through options.
                                </p>
                                {mappedCount === 0 && layerCount > 0 && (
                                    <p className="text-[10px] text-amber-400/70 mb-2">
                                        💡 Tip: Use the Character Customization Wizard to auto-configure these mappings.
                                    </p>
                                )}
                                
                                {Object.values(character.layers).map((layerUnknown: unknown) => {
                                    const layer = layerUnknown as VNCharacterLayer;
                                    const isMapped = !!el.layerVariableMap[layer.id];
                                    return (
                                        <FormField key={layer.id} label={layer.name}>
                                            <Select 
                                                value={el.layerVariableMap[layer.id] || ''} 
                                                onChange={e => {
                                                    const newMap = { ...el.layerVariableMap };
                                                    if (e.target.value) {
                                                        newMap[layer.id] = e.target.value;
                                                    } else {
                                                        delete newMap[layer.id];
                                                    }
                                                    updateElement({ layerVariableMap: newMap });
                                                }}
                                            >
                                                <option value="">None (use default expression)</option>
                                                {stringVariables.map(v => (
                                                    <option key={v.id} value={v.id}>{v.name}</option>
                                                ))}
                                            </Select>
                                        </FormField>
                                    );
                                })}
                            </CollapsibleSection>
                        </div>
                    )}
                    
                    {character && layerCount === 0 && (
                        <p className="text-xs text-slate-400 mt-2">
                            This character has no layers yet. Add layers in the Characters tab to enable customization.
                        </p>
                    )}
                </>
            }
            case UIElementType.TextInput: {
                const el = element as UITextInputElement;
                return <>
                    <FormField label="Placeholder Text">
                        <TextInput value={el.placeholder} onChange={e => updateElement({ placeholder: e.target.value })} />
                    </FormField>
                    
                    <FormField label="Variable to Set">
                        <Select value={el.variableId} onChange={e => updateElement({ variableId: e.target.value })}>
                            {Object.keys(project.variables).length === 0 && <option value="">No variables available</option>}
                            {Object.values(project.variables).map((v: any) => (
                                <option key={v.id} value={v.id}>{v.name} ({v.type})</option>
                            ))}
                        </Select>
                    </FormField>
                    
                    <FormField label="Max Length">
                        <TextInput 
                            type="number" 
                            value={el.maxLength || 100} 
                            onChange={e => updateElement({ maxLength: parseInt(e.target.value) || 100 })} 
                        />
                    </FormField>
                    
                    <h4 className="font-bold text-sm mt-3 text-slate-400">Colors</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label="Background">
                            <TextInput 
                                type="color" 
                                value={el.backgroundColor || '#1e293b'} 
                                onChange={e => updateElement({ backgroundColor: e.target.value })} 
                            />
                        </FormField>
                        <FormField label="Border">
                            <TextInput 
                                type="color" 
                                value={el.borderColor || '#475569'} 
                                onChange={e => updateElement({ borderColor: e.target.value })} 
                            />
                        </FormField>
                    </div>
                    
                    <h3 className="font-bold my-2 text-slate-400">Font Style</h3>
                    <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })}/>
                </>
            }
            case UIElementType.Dropdown: {
                const el = element as UIDropdownElement;
                const variable = project.variables[el.variableId];
                return <>
                    <h3 className="font-bold my-2 text-slate-400">Variable Settings</h3>
                    <FormField label="Variable">
                        <Select value={el.variableId} onChange={e => {
                            const newVarId = e.target.value as VNID;
                            const newVariable = project.variables[newVarId];
                            
                            // Update variable and reset options based on new variable type
                            let newOptions: DropdownOption[] = [];
                            if (newVariable) {
                                if (newVariable.type === 'boolean') {
                                    newOptions = [
                                        { id: crypto.randomUUID(), label: 'True', value: true },
                                        { id: crypto.randomUUID(), label: 'False', value: false }
                                    ];
                                } else if (newVariable.type === 'number') {
                                    newOptions = [
                                        { id: crypto.randomUUID(), label: 'Option 1', value: 1 },
                                        { id: crypto.randomUUID(), label: 'Option 2', value: 2 },
                                        { id: crypto.randomUUID(), label: 'Option 3', value: 3 }
                                    ];
                                } else {
                                    newOptions = [
                                        { id: crypto.randomUUID(), label: 'Option 1', value: 'option1' },
                                        { id: crypto.randomUUID(), label: 'Option 2', value: 'option2' },
                                        { id: crypto.randomUUID(), label: 'Option 3', value: 'option3' }
                                    ];
                                }
                            }
                            
                            updateElement({ variableId: newVarId, options: newOptions });
                        }}>
                            <option value="">-- Select Variable --</option>
                            {Object.values(project.variables).map(v => {
                                const varItem = v as VNVariable;
                                return <option key={varItem.id} value={varItem.id}>{varItem.name} ({varItem.type})</option>;
                            })}
                        </Select>
                    </FormField>

                    <h3 className="font-bold my-2 text-slate-400">Options {variable && `(${variable.type})`}</h3>
                    {variable?.type === 'boolean' ? (
                        <>
                            <div className="text-sm text-slate-400 mb-2">Customize the display text for true/false values:</div>
                            {el.options.map((opt, idx) => (
                                <FormField key={opt.id} label={opt.value === true ? 'True Label' : 'False Label'}>
                                    <TextInput 
                                        value={opt.label}
                                        onChange={e => {
                                            const newOptions = [...el.options];
                                            newOptions[idx] = { ...opt, label: e.target.value };
                                            updateElement({ options: newOptions });
                                        }}
                                    />
                                </FormField>
                            ))}
                        </>
                    ) : (
                        <div className="space-y-2">
                            {el.options.map((opt, idx) => (
                                <div key={opt.id} className="flex gap-2 items-center p-2 bg-slate-800 rounded">
                                    <div className="flex-grow space-y-1">
                                        <TextInput 
                                            placeholder="Label"
                                            value={opt.label}
                                            onChange={e => {
                                                const newOptions = [...el.options];
                                                newOptions[idx] = { ...opt, label: e.target.value };
                                                updateElement({ options: newOptions });
                                            }}
                                        />
                                        <TextInput 
                                            placeholder={variable?.type === 'number' ? 'Value (number)' : 'Value'}
                                            value={String(opt.value)}
                                            onChange={e => {
                                                const newOptions = [...el.options];
                                                const newValue = variable?.type === 'number' 
                                                    ? (isNaN(Number(e.target.value)) ? 0 : Number(e.target.value))
                                                    : e.target.value;
                                                newOptions[idx] = { ...opt, value: newValue };
                                                updateElement({ options: newOptions });
                                            }}
                                        />
                                    </div>
                                    <button 
                                        onClick={() => {
                                            const newOptions = el.options.filter((_, i) => i !== idx);
                                            updateElement({ options: newOptions });
                                        }}
                                        className="p-2 hover:bg-red-600 rounded transition-colors"
                                        title="Remove Option"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            {variable?.type !== 'boolean' && (
                                <button 
                                    onClick={() => {
                                        const newOption: DropdownOption = {
                                            id: crypto.randomUUID(),
                                            label: `Option ${el.options.length + 1}`,
                                            value: variable?.type === 'number' ? el.options.length + 1 : `option${el.options.length + 1}`
                                        };
                                        updateElement({ options: [...el.options, newOption] });
                                    }}
                                    className="w-full p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                                >
                                    + Add Option
                                </button>
                            )}
                        </div>
                    )}

                    <h3 className="font-bold my-2 text-slate-400">Styling</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label="Background">
                            <input 
                                type="color" 
                                className="w-full" 
                                value={el.backgroundColor || '#1e293b'} 
                                onChange={e => updateElement({ backgroundColor: e.target.value })} 
                            />
                        </FormField>
                        <FormField label="Border">
                            <input 
                                type="color" 
                                className="w-full" 
                                value={el.borderColor || '#475569'} 
                                onChange={e => updateElement({ borderColor: e.target.value })} 
                            />
                        </FormField>
                        <FormField label="Hover">
                            <input 
                                type="color" 
                                className="w-full" 
                                value={el.hoverColor || '#334155'} 
                                onChange={e => updateElement({ hoverColor: e.target.value })} 
                            />
                        </FormField>
                    </div>
                    
                    <h3 className="font-bold my-2 text-slate-400">Font Style</h3>
                    <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })}/>
                    
                    <h3 className="font-bold my-2 text-slate-400">Additional Actions</h3>
                    <p className="text-xs text-slate-400 mb-2">Run these actions when the dropdown value changes</p>
                    <div className="space-y-2">
                        {(el.actions || []).map((action, idx) => (
                            <div key={idx} className="p-2 bg-slate-800 rounded space-y-2">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-slate-400">Action {idx + 1}</span>
                                    <button 
                                        onClick={() => {
                                            const newActions = (el.actions || []).filter((_, i) => i !== idx);
                                            updateElement({ actions: newActions });
                                        }}
                                        className="p-1 hover:bg-red-600 rounded transition-colors"
                                        title="Remove Action"
                                    >
                                        <TrashIcon className="w-3 h-3" />
                                    </button>
                                </div>
                                <ActionEditor 
                                    action={action} 
                                    onActionChange={updatedAction => {
                                        const newActions = [...(el.actions || [])];
                                        newActions[idx] = updatedAction;
                                        updateElement({ actions: newActions });
                                    }} 
                                />
                            </div>
                        ))}
                        <button 
                            onClick={() => {
                                const newAction = { type: 'GoToScreen', targetScreenId: '' } as any;
                                updateElement({ actions: [...(el.actions || []), newAction] });
                            }}
                            className="w-full p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors text-sm"
                        >
                            + Add Action
                        </button>
                    </div>
                </>
            }
            case UIElementType.Checkbox: {
                const el = element as UICheckboxElement;
                const variable = project.variables[el.variableId];
                return <>
                    <h3 className="font-bold my-2 text-slate-400">Label</h3>
                    <FormField label="Label Text">
                        <TextInput 
                            value={el.label}
                            onChange={e => updateElement({ label: e.target.value })}
                        />
                    </FormField>

                    <h3 className="font-bold my-2 text-slate-400">Variable Settings</h3>
                    <FormField label="Variable">
                        <Select value={el.variableId} onChange={e => {
                            const newVarId = e.target.value as VNID;
                            const newVariable = project.variables[newVarId];
                            
                            // Update variable and reset values based on new variable type
                            let checkedValue: string | number | boolean = true;
                            let uncheckedValue: string | number | boolean = false;
                            
                            if (newVariable) {
                                if (newVariable.type === 'boolean') {
                                    checkedValue = true;
                                    uncheckedValue = false;
                                } else if (newVariable.type === 'number') {
                                    checkedValue = 1;
                                    uncheckedValue = 0;
                                } else {
                                    checkedValue = 'checked';
                                    uncheckedValue = 'unchecked';
                                }
                            }
                            
                            updateElement({ 
                                variableId: newVarId, 
                                checkedValue, 
                                uncheckedValue 
                            });
                        }}>
                            <option value="">-- Select Variable --</option>
                            {Object.values(project.variables).map(v => {
                                const varItem = v as VNVariable;
                                return <option key={varItem.id} value={varItem.id}>{varItem.name} ({varItem.type})</option>;
                            })}
                        </Select>
                    </FormField>

                    <h3 className="font-bold my-2 text-slate-400">Values {variable && `(${variable.type})`}</h3>
                    <FormField label="Checked Value">
                        <TextInput 
                            value={String(el.checkedValue)}
                            onChange={e => {
                                let newValue: string | number | boolean = e.target.value;
                                if (variable?.type === 'number') {
                                    newValue = isNaN(Number(e.target.value)) ? 0 : Number(e.target.value);
                                } else if (variable?.type === 'boolean') {
                                    newValue = e.target.value.toLowerCase() === 'true';
                                }
                                updateElement({ checkedValue: newValue });
                            }}
                        />
                    </FormField>
                    <FormField label="Unchecked Value">
                        <TextInput 
                            value={String(el.uncheckedValue)}
                            onChange={e => {
                                let newValue: string | number | boolean = e.target.value;
                                if (variable?.type === 'number') {
                                    newValue = isNaN(Number(e.target.value)) ? 0 : Number(e.target.value);
                                } else if (variable?.type === 'boolean') {
                                    newValue = e.target.value.toLowerCase() === 'true';
                                }
                                updateElement({ uncheckedValue: newValue });
                            }}
                        />
                    </FormField>

                    <h3 className="font-bold my-2 text-slate-400">Styling</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label="Checkbox Color">
                            <input 
                                type="color" 
                                className="w-full" 
                                value={el.checkboxColor || '#3b82f6'} 
                                onChange={e => updateElement({ checkboxColor: e.target.value })} 
                            />
                        </FormField>
                        <FormField label="Label Color">
                            <input 
                                type="color" 
                                className="w-full" 
                                value={el.labelColor || '#f1f5f9'} 
                                onChange={e => updateElement({ labelColor: e.target.value })} 
                            />
                        </FormField>
                    </div>
                    
                    <h3 className="font-bold my-2 text-slate-400">Font Style</h3>
                    <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })}/>
                    
                    <h3 className="font-bold my-2 text-slate-400">Additional Actions</h3>
                    <p className="text-xs text-slate-400 mb-2">Run these actions when the checkbox is toggled</p>
                    <div className="space-y-2">
                        {(el.actions || []).map((action, idx) => (
                            <div key={idx} className="p-2 bg-slate-800 rounded space-y-2">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-slate-400">Action {idx + 1}</span>
                                    <button 
                                        onClick={() => {
                                            const newActions = (el.actions || []).filter((_, i) => i !== idx);
                                            updateElement({ actions: newActions });
                                        }}
                                        className="p-1 hover:bg-red-600 rounded transition-colors"
                                        title="Remove Action"
                                    >
                                        <TrashIcon className="w-3 h-3" />
                                    </button>
                                </div>
                                <ActionEditor 
                                    action={action} 
                                    onActionChange={updatedAction => {
                                        const newActions = [...(el.actions || [])];
                                        newActions[idx] = updatedAction;
                                        updateElement({ actions: newActions });
                                    }} 
                                />
                            </div>
                        ))}
                        <button 
                            onClick={() => {
                                const newAction = { type: 'GoToScreen', targetScreenId: '' } as any;
                                updateElement({ actions: [...(el.actions || []), newAction] });
                            }}
                            className="w-full p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors text-sm"
                        >
                            + Add Action
                        </button>
                    </div>
                </>
            }
            case UIElementType.AssetCycler: {
                const el = element as UIAssetCyclerElement;
                const character = project.characters[el.characterId];
                const layer = character?.layers[el.layerId];
                const assetCount = layer ? Object.keys(layer.assets).length : 0;
                const selectedCount = el.assetIds?.length || 0;
                const hasConditions = (el.assetConditions && el.assetConditions.length > 0) || !!el.filterPattern;
                
                return <>
                    {/* Brief description */}
                    <p className="text-xs text-slate-400 mb-3">
                        Lets the player cycle through appearance options (e.g., hair styles, skin tones) using arrow buttons.
                    </p>

                    {/* ── ESSENTIALS: Character, Layer, Label ── */}
                    <FormField label="Character">
                        <Select value={el.characterId} onChange={e => {
                            const charId = e.target.value as VNID;
                            const char = project.characters[charId];
                            const firstLayerId = char ? Object.keys(char.layers)[0] : '';
                            const firstLayer = firstLayerId && char ? char.layers[firstLayerId] : null;
                            const assetIds = firstLayer ? Object.keys(firstLayer.assets) : [];
                            updateElement({ characterId: charId, layerId: firstLayerId, assetIds });
                        }}>
                            <option value="">Select Character...</option>
                            {Object.values(project.characters).map((c: VNCharacter) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </Select>
                    </FormField>

                    <FormField label="Layer to Customize">
                        <Select value={el.layerId} onChange={e => {
                            const layerId = e.target.value as VNID;
                            const newLayer = character?.layers[layerId];
                            const assetIds = newLayer ? Object.keys(newLayer.assets) : [];
                            updateElement({ layerId, assetIds });
                        }}>
                            <option value="">Select Layer...</option>
                            {character && Object.values(character.layers).map((l: VNCharacterLayer) => (
                                <option key={l.id} value={l.id}>{l.name} ({Object.keys(l.assets).length} assets)</option>
                            ))}
                        </Select>
                    </FormField>
                    
                    <FormField label="Label">
                        <TextInput 
                            value={el.label || ''}
                            onChange={e => updateElement({ label: e.target.value })}
                            placeholder="e.g., Hair Color"
                        />
                    </FormField>
                    
                    <div className="flex items-center gap-4 my-2">
                        <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                            <input type="checkbox" checked={el.showAssetName !== false} onChange={e => updateElement({ showAssetName: e.target.checked })} className="accent-purple-500" />
                            Show name
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                            <input type="checkbox" checked={el.visible !== false} onChange={e => updateElement({ visible: e.target.checked })} className="accent-purple-500" />
                            Visible
                        </label>
                    </div>

                    <div className="space-y-2 mt-3">
                        {/* ── ASSETS: Which options can the player cycle through ── */}
                        <CollapsibleSection title="Available Assets" defaultOpen={true} badge={`${selectedCount}/${assetCount}`}>
                            {assetCount > 0 ? (
                                <>
                                    <div className="flex justify-between mb-2">
                                        <span className="text-[10px] text-slate-500">Check/uncheck which assets the player can pick</span>
                                        <button 
                                            onClick={() => {
                                                const allIds = layer ? Object.keys(layer.assets) : [];
                                                const allSelected = allIds.every(id => el.assetIds.includes(id));
                                                updateElement({ assetIds: allSelected ? [] : allIds });
                                            }}
                                            className="text-[10px] text-purple-400 hover:text-purple-300"
                                        >
                                            {selectedCount === assetCount ? 'Deselect All' : 'Select All'}
                                        </button>
                                    </div>
                                    <div className="space-y-1 max-h-36 overflow-y-auto">
                                        {layer && Object.values(layer.assets).map((asset: VNLayerAsset) => {
                                            const isSelected = el.assetIds.includes(asset.id);
                                            return (
                                                <label key={asset.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-700/30 rounded px-1 py-0.5">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={e => {
                                                            const newAssetIds = e.target.checked
                                                                ? [...el.assetIds, asset.id]
                                                                : el.assetIds.filter(id => id !== asset.id);
                                                            updateElement({ assetIds: newAssetIds });
                                                        }}
                                                        className="accent-purple-500"
                                                    />
                                                    <span className="text-sm text-slate-300">{asset.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : (
                                <p className="text-xs text-slate-500 italic">
                                    {layer ? 'This layer has no assets. Upload assets in the Characters tab first.' : 'Select a layer above.'}
                                </p>
                            )}
                        </CollapsibleSection>

                        {/* ── APPEARANCE: Arrow and background styling ── */}
                        <CollapsibleSection title="Appearance" hint="Arrow color, size, and background">
                            <div className="grid grid-cols-2 gap-2 mt-1">
                                <FormField label="Arrow Color">
                                    <input type="color" className="w-full" value={el.arrowColor || '#a855f7'} onChange={e => updateElement({ arrowColor: e.target.value })} />
                                </FormField>
                                <FormField label="Arrow Size">
                                    <TextInput type="number" value={String(el.arrowSize || 24)} onChange={e => updateElement({ arrowSize: Number(e.target.value) })} min="12" max="48" />
                                </FormField>
                            </div>
                            <FormField label="Background">
                                <input type="color" className="w-full" value={el.backgroundColor?.replace(/rgba?\([^)]+\)/, '#1e293b') || '#1e293b'} onChange={e => {
                                    const hex = e.target.value;
                                    const rgba = `rgba(${parseInt(hex.slice(1,3), 16)}, ${parseInt(hex.slice(3,5), 16)}, ${parseInt(hex.slice(5,7), 16)}, 0.8)`;
                                    updateElement({ backgroundColor: rgba });
                                }} />
                            </FormField>
                            <h4 className="font-bold text-xs mt-3 mb-1 text-slate-400">Font</h4>
                            <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })}/>
                        </CollapsibleSection>

                        {/* ── ADVANCED: Variable binding & conditional filtering ── */}
                        <CollapsibleSection 
                            title="Advanced" 
                            hint={hasConditions ? 'Has filtering rules' : 'Variable binding & conditional filtering'}
                            badge={hasConditions ? '⚡' : undefined}
                        >
                            <p className="text-[10px] text-slate-500 mb-2">
                                These settings are auto-configured by the wizard. Only edit if you know what you&apos;re doing.
                            </p>

                            <FormField label="Variable (stores selection)">
                                <Select value={el.variableId} onChange={e => updateElement({ variableId: e.target.value as VNID })}>
                                    <option value="">Select Variable...</option>
                                    {Object.values(project.variables).map(v => {
                                        const varItem = v as VNVariable;
                                        return <option key={varItem.id} value={varItem.id}>{varItem.name} ({varItem.type})</option>;
                                    })}
                                </Select>
                            </FormField>
                            
                            {/* Asset Conditions (the simpler system) */}
                            <h4 className="font-bold text-xs mt-3 mb-1 text-slate-400">Conditional Filtering</h4>
                            <p className="text-[10px] text-slate-500 mb-2">
                                Show/hide assets based on other selections. E.g., only show certain hairstyles when a specific body type is selected.
                            </p>
                            
                            {el.assetConditions && el.assetConditions.length > 0 ? (
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {el.assetConditions.map((assetCond, condIndex) => {
                                        const asset = layer?.assets[assetCond.assetId];
                                        return (
                                            <div key={condIndex} className="p-2 bg-slate-800 rounded border border-slate-600">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-xs font-medium text-purple-300">{asset?.name || assetCond.assetId}</span>
                                                    <button onClick={() => {
                                                        const newConditions = el.assetConditions!.filter((_, i) => i !== condIndex);
                                                        updateElement({ assetConditions: newConditions.length > 0 ? newConditions : undefined });
                                                    }} className="text-red-400 hover:text-red-300 text-[10px]">Remove</button>
                                                </div>
                                                {assetCond.conditions.length === 0 && <div className="text-[10px] text-slate-500 italic">Always visible</div>}
                                                {assetCond.conditions.map((cond, subIndex) => (
                                                    <div key={subIndex} className="flex gap-1 items-center mb-1 text-xs">
                                                        <Select value={cond.variableId} onChange={e => {
                                                            const newConditions = [...el.assetConditions!];
                                                            newConditions[condIndex] = { ...newConditions[condIndex], conditions: newConditions[condIndex].conditions.map((c, i) => i === subIndex ? { ...c, variableId: e.target.value as VNID } : c) };
                                                            updateElement({ assetConditions: newConditions });
                                                        }} className="flex-1 text-xs">
                                                            <option value="">Variable...</option>
                                                            {Object.values(project.variables).map(v => { const vi = v as VNVariable; return <option key={vi.id} value={vi.id}>{vi.name}</option>; })}
                                                        </Select>
                                                        <span className="text-slate-500">=</span>
                                                        <TextInput value={cond.value} onChange={e => {
                                                            const newConditions = [...el.assetConditions!];
                                                            newConditions[condIndex] = { ...newConditions[condIndex], conditions: newConditions[condIndex].conditions.map((c, i) => i === subIndex ? { ...c, value: e.target.value } : c) };
                                                            updateElement({ assetConditions: newConditions });
                                                        }} placeholder="value" className="w-20 text-xs" />
                                                        <button onClick={() => {
                                                            const newConditions = [...el.assetConditions!];
                                                            newConditions[condIndex] = { ...newConditions[condIndex], conditions: newConditions[condIndex].conditions.filter((_, i) => i !== subIndex) };
                                                            updateElement({ assetConditions: newConditions });
                                                        }} className="text-red-400 hover:text-red-300 px-1">×</button>
                                                    </div>
                                                ))}
                                                <button onClick={() => {
                                                    const newConditions = [...el.assetConditions!];
                                                    const firstVarId = Object.keys(project.variables)[0] || '';
                                                    newConditions[condIndex] = { ...newConditions[condIndex], conditions: [...newConditions[condIndex].conditions, { variableId: firstVarId as VNID, value: '' }] };
                                                    updateElement({ assetConditions: newConditions });
                                                }} className="text-[10px] text-purple-400 hover:text-purple-300 mt-1">+ Add Rule</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-[10px] text-slate-500 italic">No filtering rules — all assets always available.</p>
                            )}
                            
                            <div className="flex gap-2 mt-2">
                                <Select value="" onChange={e => {
                                    const assetId = e.target.value as VNID;
                                    if (!assetId) return;
                                    if ((el.assetConditions || []).some(c => c.assetId === assetId)) return;
                                    updateElement({ assetConditions: [...(el.assetConditions || []), { assetId, conditions: [] }] });
                                }} className="flex-1 text-xs">
                                    <option value="">Add rule for asset...</option>
                                    {layer && Object.values(layer.assets).filter(a => el.assetIds.includes((a as VNLayerAsset).id)).map(a => {
                                        const asset = a as VNLayerAsset;
                                        const has = el.assetConditions?.some(c => c.assetId === asset.id);
                                        return <option key={asset.id} value={asset.id} disabled={has}>{asset.name}{has ? ' ✓' : ''}</option>;
                                    })}
                                </Select>
                                {el.assetConditions && el.assetConditions.length > 0 && (
                                    <button onClick={() => updateElement({ assetConditions: undefined })} className="text-[10px] text-red-400 hover:text-red-300 whitespace-nowrap">Clear All</button>
                                )}
                            </div>

                            {/* Legacy filter pattern — hidden unless already in use */}
                            {(el.filterPattern || (el.filterVariableIds && el.filterVariableIds.length > 0)) && (
                                <>
                                    <h4 className="font-bold text-xs mt-4 mb-1 text-amber-400/80">Legacy Filter Pattern</h4>
                                    <p className="text-[10px] text-slate-500 mb-1">This is an older filtering method. Consider using conditional filtering above instead.</p>
                                    <FormField label="Filter Variables">
                                        <div className="flex flex-col gap-1">
                                            {(el.filterVariableIds || []).map((varId, index) => (
                                                <div key={index} className="flex gap-1 items-center">
                                                    <Select value={varId} onChange={e => {
                                                        const newIds = [...(el.filterVariableIds || [])];
                                                        newIds[index] = e.target.value as VNID;
                                                        updateElement({ filterVariableIds: newIds });
                                                    }} className="flex-1 text-xs">
                                                        <option value="">Variable...</option>
                                                        {Object.values(project.variables).filter(v => (v as VNVariable).type === 'string').map(v => { const vi = v as VNVariable; return <option key={vi.id} value={vi.id}>{vi.name}</option>; })}
                                                    </Select>
                                                    <button onClick={() => {
                                                        const newIds = (el.filterVariableIds || []).filter((_, i) => i !== index);
                                                        updateElement({ filterVariableIds: newIds.length > 0 ? newIds : undefined });
                                                    }} className="text-red-400 text-xs px-1">×</button>
                                                </div>
                                            ))}
                                            <button onClick={() => updateElement({ filterVariableIds: [...(el.filterVariableIds || []), Object.keys(project.variables)[0] || ''] })} className="text-[10px] text-purple-400">+ Add</button>
                                        </div>
                                    </FormField>
                                    <FormField label="Pattern">
                                        <TextInput value={el.filterPattern || ''} onChange={e => updateElement({ filterPattern: e.target.value })} placeholder="{var1}_{var2}" />
                                    </FormField>
                                </>
                            )}
                        </CollapsibleSection>
                    </div>
                </>
            }
            case UIElementType.CGGallery: {
                const el = element as UICGGalleryElement;
                const galleryEntries = Object.values(project.cgGallery?.entries || {});
                const categories = [...new Set(galleryEntries.map(e => e.category).filter(Boolean))] as string[];
                return <>
                    <h3 className="font-bold my-2 text-slate-400">Gallery Layout</h3>
                    <FormField label="Columns">
                        <TextInput type="number" min="2" max="8" value={String(el.columns || 4)} onChange={e => updateElement({ columns: parseInt(e.target.value, 10) || 4 })} />
                    </FormField>
                    <FormField label="Gap (px)">
                        <TextInput type="number" min="0" max="32" value={String(el.gap || 8)} onChange={e => updateElement({ gap: parseInt(e.target.value, 10) || 8 })} />
                    </FormField>
                    <FormField label="Category Filter">
                        <Select value={el.categoryFilter || ''} onChange={e => updateElement({ categoryFilter: e.target.value || undefined })}>
                            <option value="">All Categories</option>
                            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </Select>
                        <p className="text-[9px] text-slate-500 mt-0.5">Filter to show only entries in a specific category</p>
                    </FormField>

                    <h3 className="font-bold my-2 text-slate-400">Thumbnail Styling</h3>
                    <FormField label="Border Color">
                        <input type="color" className="w-full" value={el.thumbnailBorderColor || '#4D3273'} onChange={e => updateElement({ thumbnailBorderColor: e.target.value })} />
                    </FormField>
                    <FormField label="Border Radius (px)">
                        <TextInput type="number" min="0" max="32" value={String(el.thumbnailBorderRadius || 8)} onChange={e => updateElement({ thumbnailBorderRadius: parseInt(e.target.value, 10) || 8 })} />
                    </FormField>
                    <FormField label="Background Color">
                        <input type="color" className="w-full" value={el.backgroundColor || '#0f172a'} onChange={e => updateElement({ backgroundColor: e.target.value })} />
                    </FormField>

                    <h3 className="font-bold my-2 text-slate-400">Locked Entries</h3>
                    <FormField label="Locked Background">
                        <input type="color" className="w-full" value={el.lockedColor || '#1e293b'} onChange={e => updateElement({ lockedColor: e.target.value })} />
                    </FormField>
                    <FormField label="Locked Text">
                        <TextInput value={el.lockedText || '🔒'} onChange={e => updateElement({ lockedText: e.target.value })} placeholder="🔒" />
                    </FormField>

                    <h3 className="font-bold my-2 text-slate-400">Display</h3>
                    <FormField label="Show Names">
                        <input type="checkbox" checked={el.showNames !== false} onChange={e => updateElement({ showNames: e.target.checked })} />
                    </FormField>
                    {el.showNames !== false && el.nameFont && (
                        <>
                            <h3 className="font-bold my-2 text-slate-400">Name Font</h3>
                            <FontEditor font={el.nameFont} onFontChange={(prop, value) => updateElement({ nameFont: { ...el.nameFont!, [prop]: value } })} />
                        </>
                    )}

                    <div className="mt-4 p-2 rounded bg-slate-700/30 text-xs text-slate-400">
                        <p>Gallery entries are managed in the <strong>CG Gallery</strong> tab. This element displays them as a grid on the UI screen.</p>
                        <p className="mt-1">{galleryEntries.length} entries configured.</p>
                    </div>
                </>
            }
            default: return null;
        }
    };

    return (
        <Panel title={`Properties: ${element.type}`} className="w-96 flex-shrink-0">
            <div className="flex-grow overflow-y-auto pr-1">
                {renderCommonProperties()}
                <hr className="border-slate-700 my-4" />
                {renderSpecificProperties()}
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