import { VNID } from './index';
import { VNUIScreen } from '../features/ui/types';
import { VNVariable } from '../features/variables/types';

// Template Categories
export type TemplateCategory = 
  | 'character-creation'
  | 'outfit-picker'
  | 'shop-system'
  | 'stat-tracker'
  | 'dating-sim'
  | 'mini-game'
  | 'dialogue-system'
  | 'inventory'
  | 'combat'
  | 'exploration'
  | 'custom';

// Template State
export type TemplateState = 'draft' | 'published' | 'deprecated';

// Customization boundaries for guided template editing
export interface CustomizationBounds {
  allowStructureChanges: boolean;
  allowNewComponents: boolean;
  allowVariableModification: boolean;
  allowLogicChanges: boolean;
  maxCharacters?: number;
  maxItems?: number;
  maxStats?: number;
  requiredFields: string[];
  lockedComponents: string[];
}

// JSON Schema for template configuration validation
export interface JSONSchema {
  type: string;
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

// Template configuration for user customization
export interface TemplateConfig {
  [key: string]: any;
  characters?: TemplateCharacterConfig[];
  items?: TemplateItemConfig[];
  stats?: TemplateStatConfig[];
  colors?: TemplateColorConfig;
  layout?: TemplateLayoutConfig;
}

export interface TemplateCharacterConfig {
  id: string;
  name: string;
  role: string;
  defaultOutfits?: string[];
  customizable: boolean;
}

export interface TemplateItemConfig {
  id: string;
  name: string;
  price?: number;
  category: string;
  description?: string;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

export interface TemplateStatConfig {
  id: string;
  name: string;
  initialValue: number;
  minValue?: number;
  maxValue?: number;
  displayType: 'bar' | 'number' | 'heart' | 'star';
}

export interface TemplateColorConfig {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface TemplateLayoutConfig {
  columns?: number;
  spacing?: 'compact' | 'normal' | 'spacious';
  alignment?: 'left' | 'center' | 'right';
  responsive: boolean;
}

// Point for positioning elements
export interface Point2D {
  x: number;
  y: number;
}

// Template preview information
export interface TemplatePreview {
  screenshotUrl?: string;
  demoUrl?: string;
  features: string[];
  estimatedTime: number; // minutes to complete setup
  complexity: 'beginner' | 'intermediate' | 'advanced';
}

// Core Template entity
export interface Template {
  id: VNID;
  name: string;
  description: string;
  category: TemplateCategory;
  state: TemplateState;
  configSchema: JSONSchema;
  defaultConfig: TemplateConfig;
  uiGenerator: (config: TemplateConfig) => VNUIScreen[];
  previewImage?: string;
  preview?: TemplatePreview;
  tags: string[];
  version: string;
  customizationLimits: CustomizationBounds;
  createdAt: Date;
  updatedAt: Date;
  author?: string;
  isUserTemplate: boolean;
  parentTemplateId?: VNID; // For templates derived from others
  usageCount?: number;
  rating?: number;
}

// Template instance created when user customizes a template
export interface TemplateInstance {
  id: VNID;
  templateId: VNID;
  projectId: VNID;
  config: TemplateConfig;
  generatedUIScreens: VNID[];
  generatedVariables: VNID[];
  createdAt: Date;
  lastModified: Date;
  customizations: TemplateCustomization[];
}

// Record of user customizations to a template
export interface TemplateCustomization {
  id: VNID;
  field: string;
  originalValue: any;
  customValue: any;
  timestamp: Date;
  reason?: string;
}

// Template library organization
export interface TemplateLibrary {
  featured: VNID[];
  categories: Record<TemplateCategory, VNID[]>;
  recent: VNID[];
  userTemplates: VNID[];
  favorites: VNID[];
}

// Template generation result
export interface TemplateGenerationResult {
  success: boolean;
  generatedScreens: VNUIScreen[];
  generatedVariables: VNVariable[];
  warnings: string[];
  errors: string[];
  estimatedPerformance?: {
    renderTime: number;
    memoryUsage: number;
    variableCount: number;
  };
}

// Template validation result
export interface TemplateValidationResult {
  isValid: boolean;
  errors: TemplateValidationError[];
  warnings: TemplateValidationWarning[];
  suggestions: string[];
}

export interface TemplateValidationError {
  code: string;
  message: string;
  field?: string;
  severity: 'error' | 'warning';
}

export interface TemplateValidationWarning {
  code: string;
  message: string;
  field?: string;
  impact: 'low' | 'medium' | 'high';
}

// Template search and filtering
export interface TemplateSearchOptions {
  query?: string;
  categories?: TemplateCategory[];
  tags?: string[];
  complexity?: ('beginner' | 'intermediate' | 'advanced')[];
  sortBy?: 'name' | 'popularity' | 'rating' | 'recent' | 'complexity';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface TemplateSearchResult {
  templates: Template[];
  total: number;
  hasMore: boolean;
  facets: {
    categories: Record<TemplateCategory, number>;
    tags: Record<string, number>;
    complexity: Record<string, number>;
  };
}