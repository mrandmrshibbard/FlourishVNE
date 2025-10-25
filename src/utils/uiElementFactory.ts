import { VNID } from '../types';
import { VNProject } from '../types/project';
// FIX: UIActionType is exported from shared types.
import { UIElementType, VNUIElement, UITextElement, UIButtonElement, UIImageElement, UISaveSlotGridElement, UISettingsSliderElement, UISettingsToggleElement, UICharacterPreviewElement, UITextInputElement, UIDropdownElement, UICheckboxElement, DropdownOption } from '../features/ui/types';
import { UIActionType } from '../types/shared';

const generateId = (): VNID => `elem-${Math.random().toString(36).substring(2, 9)}`;

export const createUIElement = (type: UIElementType, project: VNProject): VNUIElement | null => {
    const base = {
        id: generateId(),
        name: `${type} Element`,
        x: 40, y: 40, width: 20, height: 10,
        anchorX: 0, anchorY: 0,
    };

    switch(type) {
        case UIElementType.Button: {
            const el: UIButtonElement = {
                ...base, name: 'Button', type, text: 'Button',
                font: project.ui.choiceTextFont, action: { type: UIActionType.None },
                image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null,
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
                slotCount: 6, font: project.ui.choiceTextFont, emptySlotText: '[ Empty Slot ]'
            };
            return el;
        }
        case UIElementType.SettingsSlider: {
            const el: UISettingsSliderElement = {
                ...base, name: 'Settings Slider', type,
                width: 40, height: 5,
                setting: 'musicVolume',
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
    }
};
