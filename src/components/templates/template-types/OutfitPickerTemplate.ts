/**
 * Outfit Picker Template for FlourishVNE
 * 
 * Purpose: Pre-built template for creating wardrobe/outfit selection systems
 * Features: Clothing categories, preview system, saved outfits, shop integration
 * 
 * User Story: US1 - Simplified Visual Novel Template Creation
 * Task: T020
 */

import { Template, TemplateConfig, TemplatePreview, CustomizationBounds, TemplateLayoutConfig, TemplateItemConfig } from '../../../types/template';
import { VNUIScreen } from '../../../features/ui/types';
import { VNID } from '../../../types';

/**
 * Outfit Picker specific configuration
 */
export interface OutfitPickerConfig extends TemplateConfig {
  // Clothing categories
  categories: {
    id: string;
    name: string;
    icon: string;
    required: boolean; // Whether this category must have a selection
  }[];
  
  // Available clothing items
  items: (TemplateItemConfig & {
    category: string;
    previewImage?: string;
    unlocked: boolean;
    stats?: Record<string, number>; // Stat modifiers (e.g., charisma +2)
    tags?: string[]; // casual, formal, sporty, etc.
  })[];
  
  // Outfit presets
  presets?: {
    id: string;
    name: string;
    description: string;
    items: Record<string, string>; // category -> itemId
    thumbnail?: string;
  }[];
  
  // Features
  features: {
    allowMixMatch: boolean; // Can mix items from different sets
    showStats: boolean; // Display stat totals
    saveOutfits: boolean; // Allow saving custom outfits
    maxSavedOutfits: number;
    shopIntegration: boolean; // Link to shop for locked items
  };
  
  // UI customization
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    locked: string;
  };
  
  layout: TemplateLayoutConfig & {
    viewMode: 'grid' | 'list' | 'carousel';
    showPreview: boolean;
    previewSize: 'small' | 'medium' | 'large';
    itemsPerRow: number;
  };
  
  // Output configuration
  output: {
    variablePrefix: string;
    saveToVariable: string; // Variable name for current outfit
    savedOutfitsVariable: string;
  };
}

/**
 * Default configuration for Outfit Picker template
 */
export const defaultOutfitPickerConfig: OutfitPickerConfig = {
  categories: [
    { id: 'top', name: 'Top', icon: '👕', required: true },
    { id: 'bottom', name: 'Bottom', icon: '👖', required: true },
    { id: 'shoes', name: 'Shoes', icon: '👟', required: true },
    { id: 'accessory', name: 'Accessory', icon: '💍', required: false }
  ],
  
  items: [
    // Tops
    { id: 'casual_tshirt', name: 'Casual T-Shirt', category: 'top', price: 0, unlocked: true, description: 'A comfortable everyday shirt', tags: ['casual'], stats: {} },
    { id: 'formal_shirt', name: 'Formal Shirt', category: 'top', price: 100, unlocked: false, description: 'Professional button-up shirt', tags: ['formal'], stats: { charisma: 2 } },
    { id: 'sporty_jersey', name: 'Sports Jersey', category: 'top', price: 80, unlocked: false, description: 'Athletic wear for active days', tags: ['sporty'], stats: { strength: 1 } },
    
    // Bottoms
    { id: 'jeans', name: 'Blue Jeans', category: 'bottom', price: 0, unlocked: true, description: 'Classic denim jeans', tags: ['casual'] },
    { id: 'dress_pants', name: 'Dress Pants', category: 'bottom', price: 120, unlocked: false, description: 'Formal trousers', tags: ['formal'], stats: { charisma: 1 } },
    { id: 'shorts', name: 'Athletic Shorts', category: 'bottom', price: 60, unlocked: false, description: 'Comfortable athletic shorts', tags: ['sporty'] },
    
    // Shoes
    { id: 'sneakers', name: 'White Sneakers', category: 'shoes', price: 0, unlocked: true, description: 'All-purpose sneakers', tags: ['casual'] },
    { id: 'dress_shoes', name: 'Dress Shoes', category: 'shoes', price: 150, unlocked: false, description: 'Polished formal footwear', tags: ['formal'], stats: { charisma: 1 } },
    { id: 'running_shoes', name: 'Running Shoes', category: 'shoes', price: 90, unlocked: false, description: 'High-performance athletic shoes', tags: ['sporty'], stats: { dexterity: 1 } },
    
    // Accessories
    { id: 'watch', name: 'Wristwatch', category: 'accessory', price: 200, unlocked: false, description: 'Elegant timepiece', tags: ['formal'], stats: { charisma: 2 } },
    { id: 'cap', name: 'Baseball Cap', category: 'accessory', price: 50, unlocked: false, description: 'Casual headwear', tags: ['casual', 'sporty'] }
  ],
  
  presets: [
    {
      id: 'casual_default',
      name: 'Casual Outfit',
      description: 'Everyday comfortable look',
      items: { top: 'casual_tshirt', bottom: 'jeans', shoes: 'sneakers' }
    },
    {
      id: 'formal_suit',
      name: 'Formal Outfit',
      description: 'Professional business attire',
      items: { top: 'formal_shirt', bottom: 'dress_pants', shoes: 'dress_shoes', accessory: 'watch' }
    },
    {
      id: 'athletic',
      name: 'Athletic Outfit',
      description: 'Ready for physical activity',
      items: { top: 'sporty_jersey', bottom: 'shorts', shoes: 'running_shoes', accessory: 'cap' }
    }
  ],
  
  features: {
    allowMixMatch: true,
    showStats: true,
    saveOutfits: true,
    maxSavedOutfits: 5,
    shopIntegration: true
  },
  
  colors: {
    primary: '#6C63FF',
    secondary: '#9C9CF1',
    accent: '#FF6584',
    background: '#F7F7F7',
    text: '#2D3748',
    locked: '#CBD5E0'
  },
  
  layout: {
    columns: 3,
    spacing: 'normal',
    alignment: 'center',
    responsive: true,
    viewMode: 'grid',
    showPreview: true,
    previewSize: 'large',
    itemsPerRow: 3
  },
  
  output: {
    variablePrefix: 'outfit_',
    saveToVariable: 'currentOutfit',
    savedOutfitsVariable: 'savedOutfits'
  }
};

/**
 * Customization bounds for Outfit Picker template
 */
export const outfitPickerCustomizationBounds: CustomizationBounds = {
  allowStructureChanges: false,
  allowNewComponents: true,
  allowVariableModification: true,
  allowLogicChanges: true,
  maxItems: 100,
  requiredFields: ['categories', 'items', 'features', 'output'],
  lockedComponents: ['preview-renderer', 'stat-calculator']
};

/**
 * Preview information for Outfit Picker template
 */
export const outfitPickerPreview: TemplatePreview = {
  features: [
    'Multiple clothing categories (top, bottom, shoes, accessories)',
    'Mix and match different items',
    'Preview system with character model',
    'Stat tracking (charisma, style, etc.)',
    'Locked items requiring purchase or unlock',
    'Preset outfit configurations',
    'Save custom outfit combinations',
    'Shop integration for purchasing items',
    'Grid, list, or carousel view modes'
  ],
  estimatedTime: 6,
  complexity: 'beginner'
};

/**
 * UI generator function for Outfit Picker template
 */
export function generateOutfitPickerUI(config: TemplateConfig): VNUIScreen[] {
  const typedConfig = config as unknown as OutfitPickerConfig;
  
  const screen: VNUIScreen = {
    id: `outfit_picker_${Date.now()}` as VNID,
    name: 'Outfit Picker',
    background: { type: 'color', value: typedConfig.colors.background },
    music: { audioId: null, policy: 'continue' },
    ambientNoise: { audioId: null, policy: 'continue' },
    elements: {},
    showDialogue: false
  };
  
  return [screen];
}

/**
 * Outfit Picker Template Definition
 */
export const OutfitPickerTemplate: Template = {
  id: 'template_outfit_picker' as VNID,
  name: 'Outfit Picker',
  description: 'Create a wardrobe/outfit selection system with clothing categories, preview, stats, and shop integration',
  category: 'outfit-picker',
  state: 'published',
  configSchema: {
    type: 'object',
    properties: {
      categories: { type: 'array' },
      items: { type: 'array' },
      presets: { type: 'array' },
      features: { type: 'object' },
      colors: { type: 'object' },
      layout: { type: 'object' },
      output: { type: 'object' }
    },
    required: ['categories', 'items', 'features', 'output']
  },
  defaultConfig: defaultOutfitPickerConfig,
  uiGenerator: generateOutfitPickerUI,
  previewImage: '/templates/outfit-picker-preview.png',
  preview: outfitPickerPreview,
  tags: ['outfit', 'wardrobe', 'fashion', 'dress-up', 'customization'],
  version: '1.0.0',
  customizationLimits: outfitPickerCustomizationBounds,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  author: 'FlourishVNE',
  isUserTemplate: false,
  usageCount: 0,
  rating: 4.8
};

export default OutfitPickerTemplate;
