import React from 'react';
import Panel from '../ui/Panel';
import { useProject } from '../../contexts/ProjectContext';
import { VNID } from '../../types';
import { VNUIElement, UIElementType, UIButtonElement, UITextElement, UIImageElement, UISaveSlotGridElement, UISettingsSliderElement, UISettingsToggleElement, UICharacterPreviewElement, UITextInputElement, UIDropdownElement, UICheckboxElement, UIAssetCyclerElement, DropdownOption, GameSetting, GameToggleSetting } from '../../features/ui/types';
import { VNVariable } from '../../features/variables/types';
import { VNCharacter, VNCharacterLayer, VNLayerAsset } from '../../features/character/types';
import { FormField, TextInput, Select } from '../ui/Form';
import { TrashIcon } from '../icons';
import FontEditor from '../ui/FontEditor';
import ActionEditor from './ActionEditor';
import AssetSelector from '../ui/AssetSelector';

const UIElementInspector: React.FC<{
    screenId: VNID;
    elementId: VNID;
    setSelectedElementId: (id: VNID | null) => void;
}> = ({ screenId, elementId, setSelectedElementId }) => {
    const { project, dispatch } = useProject();
    const screen = project.uiScreens[screenId];
    const element = screen?.elements[elementId];

    if (!element) return <Panel title="Properties">Element not found</Panel>;

    const updateElement = (updates: Partial<VNUIElement>) => {
        dispatch({ type: 'UPDATE_UI_ELEMENT', payload: { screenId, elementId, updates }});
    };
    
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
            <div className="grid grid-cols-2 gap-2">
                <FormField label="Anchor X (0-1)"><TextInput type="number" step="0.1" value={element.anchorX} onChange={e => updateElement({ anchorX: parseFloat(e.target.value) || 0 })} /></FormField>
                <FormField label="Anchor Y (0-1)"><TextInput type="number" step="0.1" value={element.anchorY} onChange={e => updateElement({ anchorY: parseFloat(e.target.value) || 0 })} /></FormField>
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
                        <AssetSelector label="Asset" assetType={el.image?.type === 'video' ? 'videos' : 'backgrounds'} value={el.image?.id || null} onChange={id => updateElement({ image: id ? { type: el.image?.type || 'image', id } : null })} />
                        <FormField label="Type">
                            <Select value={el.image?.type || 'image'} onChange={e => updateElement({ image: { type: e.target.value as 'image'|'video', id: el.image?.id || '' }})}>
                                <option value="image">Image</option>
                                <option value="video">Video</option>
                            </Select>
                        </FormField>
                    </div>
                    
                    <h4 className="font-bold text-sm mt-2 text-slate-400">Hover Image</h4>
                    <div className="grid grid-cols-2 gap-2 p-2 border border-slate-700 rounded">
                        <AssetSelector label="Asset" assetType={el.hoverImage?.type === 'video' ? 'videos' : 'backgrounds'} value={el.hoverImage?.id || null} onChange={id => updateElement({ hoverImage: id ? { type: el.hoverImage?.type || 'image', id } : null })} />
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
                            <Select value={el.textAlign} onChange={e => updateElement({ textAlign: e.target.value as any })}>
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
                    <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })}/>
                 </>
            }
            case UIElementType.Image: {
                const el = element as UIImageElement;
                return <>
                    <FormField label="Asset Type">
                        <Select 
                            value={el.image?.type || 'image'} 
                            onChange={e => {
                                const newType = e.target.value as 'image'|'video';
                                // Clear the ID when switching types to avoid mismatched asset types
                                updateElement({ image: { type: newType, id: '' }});
                            }}
                        >
                            <option value="image">Image</option>
                            <option value="video">Video</option>
                        </Select>
                    </FormField>
                    <AssetSelector 
                        label={el.image?.type === 'video' ? 'Video' : 'Image'} 
                        assetType={el.image?.type === 'video' ? 'videos' : 'backgrounds'} 
                        value={el.image?.id || null} 
                        onChange={id => updateElement({ image: id ? { type: el.image?.type || 'image', id } : null })} 
                    />
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
                                <option value="textSpeed">Text Speed</option>
                            </Select>
                        </FormField>
                    )}
                    
                    <h4 className="font-bold text-sm mt-3 text-slate-400">Slider Images</h4>
                    <AssetSelector label="Thumb Image" assetType="backgrounds" value={el.thumbImage?.id || null} onChange={id => updateElement({ thumbImage: id ? { type: 'image', id } : null })} />
                    <AssetSelector label="Track Image" assetType="backgrounds" value={el.trackImage?.id || null} onChange={id => updateElement({ trackImage: id ? { type: 'image', id } : null })} />
                    
                    <h4 className="font-bold text-sm mt-3 text-slate-400">Slider Colors</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label="Thumb Color">
                            <TextInput type="color" value={el.thumbColor || '#ec4899'} onChange={e => updateElement({ thumbColor: e.target.value })} />
                        </FormField>
                        <FormField label="Track Color">
                            <TextInput type="color" value={el.trackColor || '#a855f7'} onChange={e => updateElement({ trackColor: e.target.value })} />
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
                    <AssetSelector label="Checked Image" assetType="backgrounds" value={el.checkedImage?.id || null} onChange={id => updateElement({ checkedImage: id ? { type: 'image', id } : null })} />
                    <AssetSelector label="Unchecked Image" assetType="backgrounds" value={el.uncheckedImage?.id || null} onChange={id => updateElement({ uncheckedImage: id ? { type: 'image', id } : null })} />
                    
                    <h4 className="font-bold text-sm mt-3 text-slate-400">Checkbox Color</h4>
                    <FormField label="Color">
                        <TextInput type="color" value={el.checkboxColor || '#ec4899'} onChange={e => updateElement({ checkboxColor: e.target.value })} />
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
                
                return <>
                    <FormField label="Character">
                        <Select value={el.characterId} onChange={e => {
                            const newCharId = e.target.value;
                            const newChar = project.characters[newCharId];
                            const firstExprId = newChar ? Object.keys(newChar.expressions)[0] : undefined;
                            updateElement({ characterId: newCharId, expressionId: firstExprId, layerVariableMap: {} });
                        }}>
                            {Object.keys(project.characters).length === 0 && <option value="">No characters available</option>}
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
                    
                    {character && Object.keys(character.layers).length > 0 && (
                        <>
                            <h3 className="font-bold my-2 text-slate-400">Layer Variable Mappings</h3>
                            <p className="text-xs text-slate-400 mb-2">
                                Map layers to string variables containing asset IDs to dynamically control assets. Layers without mappings will use the default expression.
                            </p>
                            
                            {Object.values(character.layers).map((layerUnknown: unknown) => {
                                const layer = layerUnknown as VNCharacterLayer;
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
                        </>
                    )}
                    
                    {character && Object.keys(character.layers).length === 0 && (
                        <p className="text-xs text-slate-400 mt-2">
                            This character has no layers. Add layers to enable variable-driven customization.
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
                
                return <>
                    <h3 className="font-bold my-2 text-slate-400">Character & Layer</h3>
                    <FormField label="Character">
                        <Select value={el.characterId} onChange={e => {
                            const charId = e.target.value as VNID;
                            const char = project.characters[charId];
                            const firstLayerId = char ? Object.keys(char.layers)[0] : '';
                            const firstLayer = firstLayerId && char ? char.layers[firstLayerId] : null;
                            const assetIds = firstLayer ? Object.keys(firstLayer.assets) : [];
                            
                            updateElement({ 
                                characterId: charId,
                                layerId: firstLayerId,
                                assetIds
                            });
                        }}>
                            <option value="">-- Select Character --</option>
                            {Object.values(project.characters).map((c: VNCharacter) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </Select>
                    </FormField>

                    <FormField label="Layer">
                        <Select value={el.layerId} onChange={e => {
                            const layerId = e.target.value as VNID;
                            const newLayer = character?.layers[layerId];
                            const assetIds = newLayer ? Object.keys(newLayer.assets) : [];
                            
                            updateElement({ 
                                layerId,
                                assetIds
                            });
                        }}>
                            <option value="">-- Select Layer --</option>
                            {character && Object.values(character.layers).map((l: VNCharacterLayer) => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </Select>
                    </FormField>

                    <h3 className="font-bold my-2 text-slate-400">Assets to Cycle</h3>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                        {layer && Object.values(layer.assets).map((asset: VNLayerAsset) => {
                            const isSelected = el.assetIds.includes(asset.id);
                            return (
                                <div key={asset.id} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={e => {
                                            const newAssetIds = e.target.checked
                                                ? [...el.assetIds, asset.id]
                                                : el.assetIds.filter(id => id !== asset.id);
                                            updateElement({ assetIds: newAssetIds });
                                        }}
                                    />
                                    <span className="text-sm">{asset.name}</span>
                                </div>
                            );
                        })}
                        {(!layer || Object.keys(layer.assets).length === 0) && (
                            <div className="text-sm text-slate-500 italic">No assets available</div>
                        )}
                    </div>

                    <h3 className="font-bold my-2 text-slate-400">Variable</h3>
                    <FormField label="Variable to Store Selection">
                        <Select value={el.variableId} onChange={e => updateElement({ variableId: e.target.value as VNID })}>
                            <option value="">-- Select Variable --</option>
                            {Object.values(project.variables).map(v => {
                                const varItem = v as VNVariable;
                                return <option key={varItem.id} value={varItem.id}>{varItem.name} ({varItem.type})</option>;
                            })}
                        </Select>
                    </FormField>

                    <h3 className="font-bold my-2 text-slate-400">Label & Display</h3>
                    <FormField label="Label (optional)">
                        <TextInput 
                            value={el.label || ''}
                            onChange={e => updateElement({ label: e.target.value })}
                            placeholder="e.g., Hair Color"
                        />
                    </FormField>
                    <FormField label="Visible">
                        <input
                            type="checkbox"
                            checked={el.visible !== false}
                            onChange={e => updateElement({ visible: e.target.checked })}
                        />
                    </FormField>
                    <FormField label="Show Asset Name">
                        <input
                            type="checkbox"
                            checked={el.showAssetName !== false}
                            onChange={e => updateElement({ showAssetName: e.target.checked })}
                        />
                    </FormField>

                    <h3 className="font-bold my-2 text-slate-400">Dynamic Filtering (Optional)</h3>
                    <p className="text-xs text-slate-400 mb-2">
                        Filter which assets show based on other variables. Use {'{varId}'} in the pattern to insert variable values.
                    </p>
                    <FormField label="Filter Variables">
                        <div className="flex flex-col gap-2">
                            {(el.filterVariableIds || []).map((varId, index) => (
                                <div key={index} className="flex gap-2 items-center">
                                    <Select 
                                        value={varId} 
                                        onChange={e => {
                                            const newIds = [...(el.filterVariableIds || [])];
                                            newIds[index] = e.target.value as VNID;
                                            updateElement({ filterVariableIds: newIds });
                                        }}
                                        className="flex-1"
                                    >
                                        <option value="">-- Select Variable --</option>
                                        {Object.values(project.variables).filter(v => (v as VNVariable).type === 'string').map(v => {
                                            const varItem = v as VNVariable;
                                            return <option key={varItem.id} value={varItem.id}>{varItem.name}</option>;
                                        })}
                                    </Select>
                                    <button
                                        onClick={() => {
                                            const newIds = (el.filterVariableIds || []).filter((_, i) => i !== index);
                                            updateElement({ filterVariableIds: newIds.length > 0 ? newIds : undefined });
                                        }}
                                        className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={() => {
                                    const newIds = [...(el.filterVariableIds || []), Object.keys(project.variables)[0] || ''];
                                    updateElement({ filterVariableIds: newIds });
                                }}
                                className="px-3 py-1 bg-[var(--accent-purple)] hover:opacity-80 rounded text-sm"
                            >
                                + Add Filter Variable
                            </button>
                        </div>
                    </FormField>
                    <FormField label="Filter Pattern">
                        <TextInput 
                            value={el.filterPattern || ''}
                            onChange={e => updateElement({ filterPattern: e.target.value })}
                            placeholder="e.g., {var-abc123}_{var-def456}"
                        />
                        <div className="text-xs text-slate-400 mt-1">
                            Use {'{varId}'} to insert variable values. Copy variable IDs from the dropdowns above.
                            <br />Example: If variables are "slim" and "light", pattern "{'{body_type}'}_{'{skin_tone}'}" matches "slim_light"
                        </div>
                    </FormField>

                    <h3 className="font-bold my-2 text-slate-400">Styling</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label="Arrow Color">
                            <input 
                                type="color" 
                                className="w-full" 
                                value={el.arrowColor || '#a855f7'} 
                                onChange={e => updateElement({ arrowColor: e.target.value })} 
                            />
                        </FormField>
                        <FormField label="Arrow Size">
                            <TextInput 
                                type="number"
                                value={String(el.arrowSize || 24)}
                                onChange={e => updateElement({ arrowSize: Number(e.target.value) })}
                                min="12"
                                max="48"
                            />
                        </FormField>
                    </div>
                    <FormField label="Background Color">
                        <input 
                            type="color" 
                            className="w-full" 
                            value={el.backgroundColor?.replace(/rgba?\([^)]+\)/, '#1e293b') || '#1e293b'} 
                            onChange={e => {
                                const hex = e.target.value;
                                const rgba = `rgba(${parseInt(hex.slice(1,3), 16)}, ${parseInt(hex.slice(3,5), 16)}, ${parseInt(hex.slice(5,7), 16)}, 0.8)`;
                                updateElement({ backgroundColor: rgba });
                            }} 
                        />
                    </FormField>

                    <h3 className="font-bold my-2 text-slate-400">Font Style</h3>
                    <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })}/>
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