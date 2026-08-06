import { VNID } from '../types';
import { VNProject } from '../types/project';
// FIX: UIActionType is exported from shared types.
import { UIElementType, VNUIElement, UITextElement, UIButtonElement, UIImageElement, UISaveSlotGridElement, UISettingsSliderElement, UISettingsToggleElement, UICharacterPreviewElement, UITextInputElement, UIDropdownElement, UICheckboxElement, UIAssetCyclerElement, UICGGalleryElement, UIMusicGalleryElement, UIInventoryGridElement, UIMeterElement, UICustomizerElement, UITimerElement, UIItemElement, UICustomElement, DropdownOption } from '../features/ui/types';
import { UIActionType } from '../types/shared';
import { defaultMusicPlayerParts } from './musicGallery';

const generateId = (): VNID => `elem-${Math.random().toString(36).substring(2, 9)}`;

/** Build a custom (extension-contributed) screen element from a registered UI element type. */
export const createCustomUIElement = (
    pluginType: string,
    displayName: string,
    defaultProps?: Record<string, any>,
    defaultSize?: { width: number; height: number },
): UICustomElement => ({
    id: generateId(),
    name: displayName || 'Custom Element',
    x: 40, y: 40,
    width: defaultSize?.width ?? 20,
    height: defaultSize?.height ?? 15,
    anchorX: 0.5, anchorY: 0.5, // center — see createUIElement note
    type: UIElementType.Custom,
    pluginType,
    props: { ...(defaultProps || {}) },
});

export const createUIElement = (type: UIElementType, project: VNProject): VNUIElement | null => {
    const base = {
        id: generateId(),
        name: `${type} Element`,
        x: 40, y: 40, width: 20, height: 10,
        // Center anchor (0.5) — matches scene overlays (Show Button/Image) AND the shipped
        // default menu screens, so the same x/y lands an element in the same spot on a scene
        // and on a screen. Existing projects keep whatever anchor they stored (no migration).
        anchorX: 0.5, anchorY: 0.5,
    };

    switch(type) {
        case UIElementType.Button: {
            const el: UIButtonElement = {
                ...base, name: 'Button', type, text: 'Button',
                font: project.ui.choiceTextFont, action: { type: UIActionType.None },
                image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null,
                backgroundColor: '#4D3273', hoverBackgroundColor: '#6B4C9A',
            };
            return el;
        }
        case UIElementType.Text: {
            const el: UITextElement = {
                ...base, name: 'Text', type, text: 'Text Element',
                font: project.ui.dialogueTextFont,
                textAlign: 'center',
                verticalAlign: 'middle',
            };
            return el;
        }
        case UIElementType.Image: {
             const el: UIImageElement = {
                ...base, name: 'Image', type, image: null, objectFit: 'contain'
            };
            return el;
        }
        case UIElementType.SaveSlotGrid: {
            const el: UISaveSlotGridElement = {
                ...base, name: 'Save Slots', type,
                width: 80, height: 70, x: 10, y: 20,
                slotCount: 6, font: project.ui.choiceTextFont, emptySlotText: '[ Empty Slot ]',
                slotBackgroundColor: '#1e1e38',
                slotBorderColor: '#4D3273',
                slotHoverBorderColor: '#8a2be2',
                slotHeaderColor: '#a78bfa',
            };
            return el;
        }
        case UIElementType.SettingsSlider: {
            const el: UISettingsSliderElement = {
                ...base, name: 'Settings Slider', type,
                width: 40, height: 5,
                setting: 'musicVolume',
                trackColor: '#4D3273',
                thumbColor: '#8a2be2',
            };
            return el;
        }
        case UIElementType.SettingsToggle: {
            const el: UISettingsToggleElement = {
                ...base, name: 'Settings Toggle', type,
                width: 30, height: 5,
                setting: 'enableSkip',
                text: 'Enable Skip',
                font: project.ui.choiceTextFont,
            };
            return el;
        }
        case UIElementType.CharacterPreview: {
            const firstCharId = Object.keys(project.characters)[0] || '';
            const firstChar = firstCharId ? project.characters[firstCharId] : null;
            const firstExprId = firstChar ? Object.keys(firstChar.expressions)[0] : undefined;

            const el: UICharacterPreviewElement = {
                ...base, name: 'Character Preview', type,
                width: 30, height: 60,
                characterId: firstCharId,
                expressionId: firstExprId,
                layerVariableMap: {}
            };
            return el;
        }
        case UIElementType.Customizer: {
            // Start with NO character chosen: picking one in Properties auto-includes its layers as
            // cycle pickers (the inspector creates the backing variables), so it works out of the box.
            const el: UICustomizerElement = {
                ...base, name: 'Customizer', type,
                x: 20, y: 15, width: 60, height: 70,
                characterId: '',
                expressionId: undefined,
                categories: [],
                // Default to the box-less Free layout: the character floats (no box) so authors place
                // their own art behind it, and the controls panel is hidden too. Presets stay available.
                layout: 'free',
                previewRect: { x: 8, y: 12, width: 30, height: 76 },
                pickersRect: { x: 44, y: 12, width: 48, height: 76 },
                hidePickersPanel: true,
                previewPercent: 45,
                showLabels: true,
                font: project.ui.choiceTextFont,
                backgroundColor: '#1e1e38',
                borderColor: '#4D3273',
                borderRadius: 8,
                swatchSize: 48,
                swatchGap: 6,
                selectedColor: '#8a2be2',
            };
            return el;
        }
        case UIElementType.TextInput: {
            const firstVarId = Object.keys(project.variables)[0] || '';
            
            const el: UITextInputElement = {
                ...base, name: 'Text Input', type,
                width: 40, height: 8,
                placeholder: 'Enter text...',
                variableId: firstVarId,
                font: project.ui.dialogueTextFont,
                backgroundColor: '#1e293b',
                borderColor: '#475569',
                maxLength: 100
            };
            return el;
        }
        case UIElementType.Dropdown: {
            const firstVarId = Object.keys(project.variables)[0] || '';
            const variable = project.variables[firstVarId];
            
            // Create default options based on variable type
            let defaultOptions: DropdownOption[] = [];
            if (variable) {
                if (variable.type === 'boolean') {
                    defaultOptions = [
                        { id: crypto.randomUUID(), label: 'True', value: true },
                        { id: crypto.randomUUID(), label: 'False', value: false }
                    ];
                } else if (variable.type === 'number') {
                    defaultOptions = [
                        { id: crypto.randomUUID(), label: 'Option 1', value: 1 },
                        { id: crypto.randomUUID(), label: 'Option 2', value: 2 },
                        { id: crypto.randomUUID(), label: 'Option 3', value: 3 }
                    ];
                } else {
                    // string type
                    defaultOptions = [
                        { id: crypto.randomUUID(), label: 'Option 1', value: 'option1' },
                        { id: crypto.randomUUID(), label: 'Option 2', value: 'option2' },
                        { id: crypto.randomUUID(), label: 'Option 3', value: 'option3' }
                    ];
                }
            }
            
            const el: UIDropdownElement = {
                ...base, name: 'Dropdown', type,
                width: 40, height: 8,
                variableId: firstVarId,
                options: defaultOptions,
                font: project.ui.dialogueTextFont,
                backgroundColor: '#1e293b',
                borderColor: '#475569',
                hoverColor: '#334155'
            };
            return el;
        }
        case UIElementType.Checkbox: {
            const firstVarId = Object.keys(project.variables)[0] || '';
            const variable = project.variables[firstVarId];
            
            // Set default checked/unchecked values based on variable type
            let checkedValue: string | number | boolean = true;
            let uncheckedValue: string | number | boolean = false;
            
            if (variable) {
                if (variable.type === 'boolean') {
                    checkedValue = true;
                    uncheckedValue = false;
                } else if (variable.type === 'number') {
                    checkedValue = 1;
                    uncheckedValue = 0;
                } else {
                    // string type
                    checkedValue = 'checked';
                    uncheckedValue = 'unchecked';
                }
            }
            
            const el: UICheckboxElement = {
                ...base, name: 'Checkbox', type,
                width: 30, height: 6,
                label: 'Checkbox Label',
                variableId: firstVarId,
                checkedValue,
                uncheckedValue,
                font: project.ui.dialogueTextFont,
                checkboxColor: '#3b82f6',
                labelColor: '#f1f5f9'
            };
            return el;
        }
        case UIElementType.AssetCycler: {
            const firstCharId = Object.keys(project.characters)[0] || '';
            const character = firstCharId ? project.characters[firstCharId] : null;
            const firstLayerId = character ? Object.keys(character.layers)[0] : '';
            const layer = firstLayerId && character ? character.layers[firstLayerId] : null;
            const assetIds = layer ? Object.keys(layer.assets) : [];
            
            // Get or create a string variable for storing asset ID
            const stringVars = Object.values(project.variables).filter(v => v.type === 'string');
            const firstVarId = stringVars.length > 0 ? stringVars[0].id : Object.keys(project.variables)[0] || '';
            
            const el: UIAssetCyclerElement = {
                ...base, name: 'Asset Cycler', type,
                width: 40, height: 8,
                characterId: firstCharId,
                layerId: firstLayerId,
                variableId: firstVarId,
                assetIds: assetIds,
                label: 'Customize',
                showAssetName: true,
                font: project.ui.dialogueTextFont,
                arrowColor: '#a855f7',
                arrowSize: 24,
                backgroundColor: 'rgba(30, 41, 59, 0.8)'
            };
            return el;
        }
        case UIElementType.CGGallery: {
            const el: UICGGalleryElement = {
                ...base, name: 'CG Gallery', type,
                width: 80, height: 70, x: 10, y: 15,
                columns: 4,
                gap: 8,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                thumbnailBorderColor: '#4D3273',
                thumbnailBorderRadius: 8,
                showNames: true,
                nameFont: project.ui.dialogueTextFont,
                lockedColor: '#1e293b',
                lockedText: '🔒',
            };
            return el;
        }
        case UIElementType.MusicGallery: {
            const el: UIMusicGalleryElement = {
                ...base, name: 'Music Gallery', type,
                width: 56, height: 62, x: 50, y: 50,
                parts: defaultMusicPlayerParts(),
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                borderRadius: 12,
                lockedText: '???',
                lockedColor: 'rgba(148, 163, 184, 0.35)',
                noSongText: 'Pick a song',
                onLeave: 'stop',
            };
            return el;
        }
        case UIElementType.Inventory: {
            const el: UIInventoryGridElement = {
                ...base, name: 'Inventory', type,
                width: 60, height: 60, x: 20, y: 20,
                columns: 4,
                columnGap: 8,
                rowGap: 8,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                slotColor: 'rgba(255,255,255,0.04)',
                slotBorderColor: '#4D3273',
                slotBorderRadius: 8,
                showNames: true,
                showQuantity: true,
                slotButton: 'none',
                hideUnowned: true,
                nameFont: project.ui.dialogueTextFont,
                emptyText: 'Empty',
            };
            return el;
        }
        case UIElementType.Meter: {
            // Prefer a stat's backing variable (the meter's main use), else the first number variable.
            const firstStat = Object.values(project.stats || {})[0];
            const statVarId = firstStat ? Object.values(firstStat.variableIds || {})[0] : undefined;
            const numberVars = Object.values(project.variables).filter(v => v.type === 'number');
            const el: UIMeterElement = {
                ...base, name: 'Meter', type,
                width: 30, height: 5, x: 35, y: 47.5,
                variableId: statVarId || numberVars[0]?.id,
                direction: 'ltr',
                fillColor: firstStat?.color || '#a78bfa',
                backgroundColor: 'rgba(0,0,0,0.4)',
                borderRadius: 6,
                showLabel: true,
                showValue: true,
                valueFormat: 'valueMax',
                labelFont: project.ui.dialogueTextFont,
                valueFont: project.ui.dialogueTextFont,
            };
            return el;
        }
        case UIElementType.Timer: {
            const el: UITimerElement = {
                ...base, name: 'Timer', type,
                width: 10, height: 6,
                durationSeconds: 3,
                showCountdown: false,
                loop: false,
                actions: [],
            };
            return el;
        }
        case UIElementType.Item: {
            const firstItemId = Object.keys(project.items || {})[0] as VNID | undefined;
            const el: UIItemElement = {
                ...base, name: 'Item', type,
                width: 10, height: 14,
                itemId: firstItemId ?? null,
                mode: 'display',
                actions: [],
            };
            return el;
        }
    }
};
