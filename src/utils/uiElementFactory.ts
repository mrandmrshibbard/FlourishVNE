import { VNID } from '../types';
import { VNProject } from '../types/project';
// FIX: UIActionType is exported from shared types.
import { UIElementType, VNUIElement, UITextElement, UIButtonElement, UIImageElement, UISaveSlotGridElement, UISettingsSliderElement, UISettingsToggleElement, UICharacterPreviewElement } from '../features/ui/types';
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
        default:
            return null;
    }
};
