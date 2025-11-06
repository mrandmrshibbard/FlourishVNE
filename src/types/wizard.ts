import { VNID } from './index';
import { VNCondition } from './shared';
import { Template, TemplateConfig } from './template';
import { VNUIScreen } from '../features/ui/types';
import { VNVariable } from '../features/variables/types';
import { VNCharacter } from '../features/character/types';
import { VNScene } from '../features/scene/types';

// Wizard types for different content creation scenarios
export type WizardType = 
  | 'character-creator'
  | 'dating-sim'
  | 'shop-system'
  | 'combat-system'
  | 'mini-game'
  | 'dialogue-tree'
  | 'inventory-system'
  | 'stat-tracker'
  | 'achievement-system'
  | 'save-system'
  | 'scene-transition'
  | 'custom';

// Content types that wizards can generate
export type ContentType = 
  | 'scene'
  | 'character'
  | 'ui-screen'
  | 'variable-set'
  | 'logic-system'
  | 'template-instance'
  | 'complete-system';

// Wizard complexity levels
export type WizardComplexity = 'beginner' | 'intermediate' | 'advanced' | 'expert';

// User experience levels for wizard customization
export type UserExperience = 'beginner' | 'intermediate' | 'advanced';

// Step navigation actions
export type NavigationAction = 'next' | 'back' | 'skip' | 'jump' | 'restart' | 'finish';

// Step input types for UI generation
export type StepInputType = 
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multi-select'
  | 'color'
  | 'file'
  | 'character-picker'
  | 'template-picker'
  | 'variable-picker'
  | 'range'
  | 'textarea'
  | 'code'
  | 'grid-layout'
  | 'custom';

// Validation rule types
export type ValidationRuleType = 
  | 'required'
  | 'min-length'
  | 'max-length'
  | 'pattern'
  | 'min-value'
  | 'max-value'
  | 'unique'
  | 'custom';

// Step input field definition
export interface StepInputField {
  id: string;
  type: StepInputType;
  label: string;
  description?: string;
  placeholder?: string;
  defaultValue?: any;
  options?: SelectOption[]; // For select/multi-select
  validation?: ValidationRule[];
  conditional?: StepCondition; // Show field only if condition met
  helpText?: string;
  required: boolean;
}

export interface SelectOption {
  value: any;
  label: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
}

export interface ValidationRule {
  type: ValidationRuleType;
  value?: any;
  message: string;
  validator?: (value: any, allValues: Record<string, any>) => boolean;
}

export interface StepCondition {
  fieldId: string;
  operator: '==' | '!=' | '>' | '<' | 'includes' | 'excludes';
  value: any;
}

// Individual wizard step definition
export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  fields: StepInputField[];
  canSkip: boolean;
  canGoBack: boolean;
  estimatedTime?: number; // minutes
  helpContent?: string;
  previewEnabled?: boolean;
  validationRules?: StepValidationRule[];
}

export interface StepValidationRule {
  type: 'cross-field' | 'business-logic' | 'external';
  message: string;
  validator: (stepData: Record<string, any>, allWizardData: Record<string, any>) => boolean;
}

// User's response to a wizard step
export interface StepResponse {
  stepId: string;
  values: Record<string, any>;
  timestamp: Date;
  timeSpent: number; // seconds
  skipped: boolean;
  validationPassed: boolean;
  errors?: string[];
}

// Validation result for step input
export interface ValidationResult {
  isValid: boolean;
  errors: FieldError[];
  warnings: FieldWarning[];
  suggestions?: string[];
}

export interface FieldError {
  fieldId: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
}

export interface FieldWarning {
  fieldId: string;
  message: string;
  impact: 'low' | 'medium' | 'high';
}

// Content preview during wizard process
export interface ContentPreview {
  type: 'visual' | 'code' | 'json' | 'description';
  content: any;
  title?: string;
  canInteract: boolean;
  highlightedElements?: string[];
  warnings?: string[];
}

// Visual preview for UI elements
export interface VisualPreview {
  screenshotUrl?: string;
  interactiveDemoUrl?: string;
  componentPreviews: ComponentPreview[];
  styling: PreviewStyling;
}

export interface ComponentPreview {
  id: string;
  type: string;
  properties: Record<string, any>;
  children?: ComponentPreview[];
}

export interface PreviewStyling {
  theme: 'light' | 'dark' | 'auto';
  scale: number;
  showBounds: boolean;
  showLabels: boolean;
}

// Performance estimation for generated content
export interface PerformanceEstimate {
  renderTime: number; // milliseconds
  memoryUsage: number; // bytes
  fileSize: number; // bytes
  variableCount: number;
  componentCount: number;
  complexity: 'low' | 'medium' | 'high';
}

// Core content wizard definition
export interface ContentWizard {
  id: VNID;
  type: WizardType;
  name: string;
  description: string;
  icon?: string;
  category: string;
  complexity: WizardComplexity;
  targetContentType: ContentType;
  
  // Steps and flow
  steps: WizardStep[];
  totalSteps: number;
  estimatedTime: number; // total minutes
  
  // Prerequisites and requirements
  prerequisites: WizardPrerequisite[];
  requiredTemplates?: VNID[];
  requiredVariables?: string[];
  
  // Generation configuration
  outputConfig: WizardOutputConfig;
  
  // Metadata
  version: string;
  author?: string;
  tags: string[];
  usageCount: number;
  rating?: number;
  lastUpdated: Date;
  isCustom: boolean;
}

export interface WizardPrerequisite {
  type: 'character' | 'template' | 'variable' | 'scene' | 'ui-screen';
  condition: string;
  message: string;
  optional: boolean;
}

export interface WizardOutputConfig {
  generateScenes: boolean;
  generateCharacters: boolean;
  generateUIScreens: boolean;
  generateVariables: boolean;
  generateAssets: boolean;
  applyOptimizations: boolean;
  createBackup: boolean;
  integrationPoints: string[];
}

// Active wizard session
export interface WizardSession {
  id: VNID;
  wizardId: VNID;
  projectId: VNID;
  userId?: string;
  
  // Session state
  currentStepIndex: number;
  isComplete: boolean;
  isPaused: boolean;
  
  // Collected data
  stepResponses: Record<string, StepResponse>;
  aggregatedData: Record<string, any>;
  
  // Progress tracking
  startedAt: Date;
  lastActivityAt: Date;
  timeSpent: number; // total seconds
  completionPercentage: number;
  
  // Generation state
  preview?: ContentPreview;
  generatedContent?: WizardGeneratedContent;
  
  // Session configuration
  options: WizardSessionOptions;
  
  // Save state
  savePoints: WizardSavePoint[];
  canResume: boolean;
  expiresAt?: Date;
}

export interface WizardSessionOptions {
  skipIntro: boolean;
  customizeSteps: boolean;
  saveProgress: boolean;
  autoPreview: boolean;
  showHints: boolean;
  debugMode: boolean;
  saveInterval: number; // seconds
}

export interface WizardSavePoint {
  id: string;
  stepIndex: number;
  data: Record<string, any>;
  timestamp: Date;
  canShare: boolean;
  description?: string;
}

// Generated content from wizard completion
export interface WizardGeneratedContent {
  scenes: VNScene[];
  characters: VNCharacter[];
  uiScreens: VNUIScreen[];
  variables: VNVariable[];
  templateInstances: VNID[];
  
  // Integration data
  integrationPoints: ContentIntegration[];
  dependencies: ContentDependency[];
  
  // Metadata
  generatedAt: Date;
  generationTime: number; // milliseconds
  optimizationsApplied: string[];
  warnings: string[];
  errors: string[];
  
  // Rollback support
  backupData?: any;
  canRollback: boolean;
}

export interface ContentIntegration {
  type: 'scene-link' | 'character-reference' | 'variable-binding' | 'ui-navigation';
  sourceId: VNID;
  targetId: VNID;
  relationship: string;
  automatic: boolean;
}

export interface ContentDependency {
  type: 'requires' | 'enhances' | 'conflicts-with';
  dependentId: VNID;
  dependencyId: VNID;
  reason: string;
  critical: boolean;
}

// Wizard template for creating reusable wizard patterns
export interface WizardTemplate {
  id: VNID;
  name: string;
  description: string;
  baseWizardType: WizardType;
  customSteps: WizardStep[];
  stepOverrides: Record<string, Partial<WizardStep>>;
  defaultConfiguration: Record<string, any>;
  author?: string;
  isPublic: boolean;
  parentTemplateId?: VNID;
  
  // Template metadata
  version: string;
  createdAt: Date;
  lastModified: Date;
  usageCount: number;
  forkCount: number;
}

// Wizard library organization
export interface WizardLibrary {
  featured: VNID[];
  categories: Record<string, VNID[]>;
  recent: VNID[];
  userWizards: VNID[];
  templates: VNID[];
  recommended: Record<UserExperience, VNID[]>;
}

// Wizard search and discovery
export interface WizardSearchOptions {
  query?: string;
  types?: WizardType[];
  complexity?: WizardComplexity[];
  contentTypes?: ContentType[];
  tags?: string[];
  maxTime?: number; // maximum estimated time in minutes
  userExperience?: UserExperience;
  sortBy?: 'name' | 'popularity' | 'rating' | 'time' | 'complexity';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface WizardSearchResult {
  wizards: ContentWizard[];
  total: number;
  hasMore: boolean;
  facets: {
    types: Record<WizardType, number>;
    complexity: Record<WizardComplexity, number>;
    contentTypes: Record<ContentType, number>;
    estimatedTime: {
      under15min: number;
      under30min: number;
      under60min: number;
      over60min: number;
    };
  };
  recommendations: VNID[];
}

// Wizard analytics and tracking
export interface WizardUsageAnalytics {
  wizardId: VNID;
  totalSessions: number;
  completedSessions: number;
  averageCompletionTime: number;
  averageStepTime: Record<string, number>;
  dropoffPoints: Record<string, number>;
  userSatisfactionRating: number;
  commonErrorPoints: string[];
  popularConfiguration: Record<string, any>;
  lastAnalyzed: Date;
}

// Wizard error handling
export interface WizardError {
  code: string;
  message: string;
  stepId?: string;
  fieldId?: string;
  severity: 'blocking' | 'warning' | 'info';
  suggestedAction: string;
  canRetry: boolean;
  timestamp: Date;
  context?: Record<string, any>;
}

// Wizard completion and next steps
export interface WizardCompletionResult {
  success: boolean;
  generatedContent: WizardGeneratedContent;
  nextSteps: string[];
  relatedWizards: VNID[];
  learningResources: string[];
  supportOptions: string[];
  
  // Quality metrics
  contentQuality: 'excellent' | 'good' | 'acceptable' | 'needs-improvement';
  performanceRating: number; // 0-100
  userExperienceRating?: number; // 0-100
  
  // Follow-up actions
  recommendedOptimizations: string[];
  suggestedEnhancements: string[];
  compatibilityWarnings: string[];
}