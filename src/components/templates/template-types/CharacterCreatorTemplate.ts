/**
 * Character Creator Template for FlourishVNE
 * 
 * Purpose: Pre-built template for creating customizable character creation screens
 * Features: Name input, trait selection, appearance customization, stat allocation
 * 
 * User Story: US1 - Simplified Visual Novel Template Creation
 * Task: T019
 */

import { Template, TemplateConfig, TemplatePreview, CustomizationBounds, TemplateLayoutConfig } from '../../../types/template';
import { VNUIScreen } from '../../../features/ui/types';
import { VNID } from '../../../types';

/**
 * Character Creator specific configuration
 */
export interface CharacterCreatorConfig extends TemplateConfig {
  // Appearance options
  appearance: {
    bodyTypes: string[];
    hairStyles: string[];
    hairColors: string[];
    eyeColors: string[];
    skinTones: string[];
  };
  
  // Personality traits
  traits: {
    id: string;
    name: string;
    description: string;
    exclusiveWith?: string[]; // Mutually exclusive traits
  }[];
  
  // Starting stats
  stats: {
    id: string;
    name: string;
    description: string;
    minValue: number;
    maxValue: number;
    initialValue: number;
    displayType: 'bar' | 'number' | 'heart' | 'star';
  }[];
  
  // Point allocation
  pointAllocation?: {
    enabled: boolean;
    totalPoints: number;
    minPerStat: number;
    maxPerStat: number;
  };
  
  // Background stories
  backgrounds?: {
    id: string;
    name: string;
    description: string;
    statModifiers: Record<string, number>;
  }[];
  
  // UI customization
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  
  // UI customization (extends TemplateLayoutConfig with additional properties)
  layout: TemplateLayoutConfig & {
    style: 'single-page' | 'multi-step' | 'tabbed';
    showPreview: boolean;
    previewPosition: 'left' | 'right' | 'bottom';
  };
  
  // Validation rules
  validation: {
    requireName: boolean;
    minNameLength: number;
    maxNameLength: number;
    requireTrait: boolean;
    minTraits: number;
    maxTraits: number;
  };
  
  // Output configuration
  output: {
    variablePrefix: string;
    saveToVariable: string; // Variable name to store character data
    autoGenerateSprite: boolean;
  };
}

/**
 * Default configuration for Character Creator template
 */
export const defaultCharacterCreatorConfig: CharacterCreatorConfig = {
  appearance: {
    bodyTypes: ['Slim', 'Athletic', 'Muscular', 'Curvy', 'Plus Size'],
    hairStyles: ['Short', 'Medium', 'Long', 'Braided', 'Ponytail', 'Bun'],
    hairColors: ['Black', 'Brown', 'Blonde', 'Red', 'Silver', 'Blue', 'Pink'],
    eyeColors: ['Brown', 'Blue', 'Green', 'Hazel', 'Gray', 'Amber'],
    skinTones: ['Fair', 'Light', 'Medium', 'Olive', 'Tan', 'Dark']
  },
  
  traits: [
    { id: 'brave', name: 'Brave', description: 'Faces danger without fear' },
    { id: 'cautious', name: 'Cautious', description: 'Thinks before acting', exclusiveWith: ['brave'] },
    { id: 'charming', name: 'Charming', description: 'Wins people over easily' },
    { id: 'intelligent', name: 'Intelligent', description: 'Quick learner and problem solver' },
    { id: 'athletic', name: 'Athletic', description: 'Physically fit and coordinated' },
    { id: 'creative', name: 'Creative', description: 'Thinks outside the box' }
  ],
  
  stats: [
    { 
      id: 'strength', 
      name: 'Strength', 
      description: 'Physical power and endurance',
      minValue: 1,
      maxValue: 10,
      initialValue: 5,
      displayType: 'bar'
    },
    { 
      id: 'intelligence', 
      name: 'Intelligence', 
      description: 'Mental acuity and problem solving',
      minValue: 1,
      maxValue: 10,
      initialValue: 5,
      displayType: 'bar'
    },
    { 
      id: 'charisma', 
      name: 'Charisma', 
      description: 'Social influence and charm',
      minValue: 1,
      maxValue: 10,
      initialValue: 5,
      displayType: 'bar'
    },
    { 
      id: 'dexterity', 
      name: 'Dexterity', 
      description: 'Agility and coordination',
      minValue: 1,
      maxValue: 10,
      initialValue: 5,
      displayType: 'bar'
    }
  ],
  
  pointAllocation: {
    enabled: true,
    totalPoints: 20,
    minPerStat: 1,
    maxPerStat: 10
  },
  
  backgrounds: [
    {
      id: 'noble',
      name: 'Noble Background',
      description: 'Born into privilege and educated in the arts',
      statModifiers: { charisma: 2, intelligence: 1 }
    },
    {
      id: 'warrior',
      name: 'Warrior Background',
      description: 'Trained in combat from a young age',
      statModifiers: { strength: 2, dexterity: 1 }
    },
    {
      id: 'scholar',
      name: 'Scholar Background',
      description: 'Devoted to learning and research',
      statModifiers: { intelligence: 3 }
    },
    {
      id: 'commoner',
      name: 'Common Background',
      description: 'Grew up among the common folk',
      statModifiers: { charisma: 1, strength: 1, dexterity: 1 }
    }
  ],
  
  colors: {
    primary: '#4A90E2',
    secondary: '#7B68EE',
    accent: '#FF6B6B',
    background: '#F8F9FA',
    text: '#2C3E50'
  },
  
  layout: {
    columns: 1,
    spacing: 'normal',
    alignment: 'center',
    responsive: true,
    style: 'multi-step',
    showPreview: true,
    previewPosition: 'right'
  },
  
  validation: {
    requireName: true,
    minNameLength: 2,
    maxNameLength: 50,
    requireTrait: true,
    minTraits: 1,
    maxTraits: 3
  },
  
  output: {
    variablePrefix: 'player_',
    saveToVariable: 'playerCharacter',
    autoGenerateSprite: false
  }
};

/**
 * Customization bounds for Character Creator template
 */
export const characterCreatorCustomizationBounds: CustomizationBounds = {
  allowStructureChanges: false,
  allowNewComponents: true,
  allowVariableModification: true,
  allowLogicChanges: false,
  maxCharacters: 1, // Single character creation
  maxStats: 10,
  requiredFields: ['appearance', 'traits', 'stats', 'validation', 'output'],
  lockedComponents: ['navigation', 'validation-logic']
};

/**
 * Preview information for Character Creator template
 */
export const characterCreatorPreview: TemplatePreview = {
  features: [
    'Customizable appearance options (body, hair, eyes, skin)',
    'Personality trait selection with exclusivity rules',
    'Stat allocation system with point budgets',
    'Background story selection with stat modifiers',
    'Real-time character preview',
    'Multi-step or single-page layouts',
    'Validation and error handling',
    'Variable export for use in story'
  ],
  estimatedTime: 8, // 8 minutes to configure
  complexity: 'beginner'
};

/**
 * UI generator function for Character Creator template
 * Returns configuration metadata for UI generation
 * 
 * Note: Actual UI element generation is handled by TemplateGenerator service.
 * This function returns a placeholder screen with template metadata.
 */
export function generateCharacterCreatorUI(config: TemplateConfig): VNUIScreen[] {
  const typedConfig = config as unknown as CharacterCreatorConfig;
  
  // Return placeholder screen structure
  // Actual UI generation will be handled by TemplateGenerator service
  const screen: VNUIScreen = {
    id: `char_creator_${Date.now()}` as VNID,
    name: 'Character Creator',
    background: { type: 'color', value: typedConfig.colors.background },
    music: { audioId: null, policy: 'continue' },
    ambientNoise: { audioId: null, policy: 'continue' },
    elements: {},
    showDialogue: false
  };
  
  return [screen];
}

/**
 * Character Creator Template Definition
 */
export const CharacterCreatorTemplate: Template = {
  id: 'template_character_creator' as VNID,
  name: 'Character Creator',
  description: 'Create a customizable character creation screen with appearance, traits, stats, and background selection',
  category: 'character-creation',
  state: 'published',
  configSchema: {
    type: 'object',
    properties: {
      appearance: { type: 'object' },
      traits: { type: 'array' },
      stats: { type: 'array' },
      pointAllocation: { type: 'object' },
      backgrounds: { type: 'array' },
      colors: { type: 'object' },
      layout: { type: 'object' },
      validation: { type: 'object' },
      output: { type: 'object' }
    },
    required: ['appearance', 'traits', 'stats', 'validation', 'output']
  },
  defaultConfig: defaultCharacterCreatorConfig,
  uiGenerator: generateCharacterCreatorUI,
  previewImage: '/templates/character-creator-preview.png',
  preview: characterCreatorPreview,
  tags: ['character', 'creation', 'rpg', 'customization', 'stats'],
  version: '1.0.0',
  customizationLimits: characterCreatorCustomizationBounds,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  author: 'FlourishVNE',
  isUserTemplate: false,
  usageCount: 0,
  rating: 5.0
};

export default CharacterCreatorTemplate;
