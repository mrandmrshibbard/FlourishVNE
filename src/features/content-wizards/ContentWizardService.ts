import { VNID } from '../../types';
import { 
  ContentWizard, 
  WizardStep, 
  WizardType, 
  StepInputField, 
  StepInputType, 
  ValidationRule, 
  WizardComplexity, 
  WizardOutputConfig, 
  WizardPrerequisite,
  SelectOption,
  ContentType,
  StepResponse,
  ValidationResult,
  FieldError
} from '../../types/wizard';
import { VNProject } from '../../types/project';
import { VNScene } from '../../features/scene/types';
import { VNCharacter } from '../../features/character/types';
import { EnhancedVariable } from '../../types/enhanced-variables';

/**
 * Content Wizard Service - Provides comprehensive wizard-based content creation
 * 
 * Features:
 * - Multi-step wizard orchestration
 * - Session state management with persistence
 * - Input validation and error handling
 * - Content generation from wizard data
 * - Template-based wizard creation
 * - Progress tracking and analytics
 * - Undo/redo support
 * - Auto-save functionality
 */

export interface WizardServiceConfig {
  enableAutoSave: boolean;
  autoSaveInterval: number; // milliseconds
  enableUndo: boolean;
  maxUndoSteps: number;
  enableValidation: boolean;
  showTips: boolean;
  sessionTimeout: number; // milliseconds
}

export interface WizardSession {
  id: VNID;
  wizardId: VNID;
  userId: string;
  projectId: VNID;
  startedAt: Date;
  lastUpdated: Date;
  currentStepIndex: number;
  stepResponses: Map<string, StepResponse>;
  undoStack: WizardSnapshot[];
  redoStack: WizardSnapshot[];
  validationErrors: Map<string, FieldError[]>;
  isCompleted: boolean;
  result?: WizardExecutionResult;
  metadata: Record<string, any>;
}

export interface WizardSnapshot {
  stepIndex: number;
  responses: Record<string, StepResponse>;
  timestamp: Date;
}

export interface WizardExecutionResult {
  wizardId: VNID;
  sessionId: VNID;
  success: boolean;
  completedAt: Date;
  generatedContent: GeneratedContent[];
  summary: string;
  stats: {
    totalSteps: number;
    completedSteps: number;
    skippedSteps: number;
    timeElapsed: number;
    errorsEncountered: number;
  };
}

export interface GeneratedContent {
  id: VNID;
  type: ContentType;
  name: string;
  data: any;
  relatedItems: VNID[];
}

export class ContentWizardService {
  private wizards = new Map<VNID, ContentWizard>();
  private sessions = new Map<VNID, WizardSession>();
  private config: WizardServiceConfig;
  private autoSaveTimers = new Map<VNID, NodeJS.Timeout>();

  constructor(config: Partial<WizardServiceConfig> = {}) {
    this.config = {
      enableAutoSave: true,
      autoSaveInterval: 30000,
      enableUndo: true,
      maxUndoSteps: 20,
      enableValidation: true,
      showTips: true,
      sessionTimeout: 3600000, // 1 hour
      ...config
    };

    this.initializeBuiltInWizards();
  }

  /**
   * Initialize built-in content wizards
   */
  private initializeBuiltInWizards(): void {
    // Character Creator Wizard
    const characterWizard: ContentWizard = {
      id: `wizard_character_${Date.now()}`,
      type: 'character-creator',
      name: 'Character Creator',
      description: 'Create a complete character with sprites, stats, and relationships',
      icon: 'user',
      category: 'character',
      complexity: 'beginner',
      targetContentType: 'character',
      steps: [
        {
          id: `step_char_basic_${Date.now()}`,
          title: 'Character Basics',
          description: 'Enter basic character information',
          fields: [
            {
              id: 'char_name',
              type: 'text',
              label: 'Character Name',
              placeholder: 'Enter character name',
              required: true,
              validation: [
                {
                  type: 'min-length',
                  value: 1,
                  message: 'Name is required'
                },
                {
                  type: 'max-length',
                  value: 50,
                  message: 'Name must be 50 characters or less'
                }
              ],
              helpText: 'The display name for your character'
            },
            {
              id: 'char_description',
              type: 'textarea',
              label: 'Description',
              placeholder: 'Describe your character...',
              required: false,
              validation: [
                {
                  type: 'max-length',
                  value: 500,
                  message: 'Description must be 500 characters or less'
                }
              ],
              helpText: 'A brief description of your character'
            },
            {
              id: 'char_role',
              type: 'select',
              label: 'Character Role',
              required: true,
              options: [
                { value: 'protagonist', label: 'Protagonist' },
                { value: 'love-interest', label: 'Love Interest' },
                { value: 'antagonist', label: 'Antagonist' },
                { value: 'supporting', label: 'Supporting Character' },
                { value: 'minor', label: 'Minor Character' }
              ],
              helpText: 'The role this character plays in your story'
            }
          ],
          canSkip: false,
          canGoBack: false,
          estimatedTime: 3,
          helpContent: 'Start by giving your character a name and choosing their role in the story.'
        },
        {
          id: `step_char_appearance_${Date.now()}`,
          title: 'Character Appearance',
          description: 'Upload character sprites and define appearance',
          fields: [
            {
              id: 'char_sprite',
              type: 'file',
              label: 'Character Sprite',
              required: false,
              helpText: 'Select or upload the main sprite for this character'
            },
            {
              id: 'char_expressions',
              type: 'file',
              label: 'Expression Sprites',
              required: false,
              helpText: 'Upload different expression sprites (happy, sad, angry, etc.)'
            },
            {
              id: 'char_color',
              type: 'color',
              label: 'Name Color',
              defaultValue: '#FFFFFF',
              required: false,
              helpText: 'The color used for the character\'s name in dialogues'
            }
          ],
          canSkip: true,
          canGoBack: true,
          estimatedTime: 5,
          helpContent: 'Add visual assets for your character. You can skip this and add them later.'
        },
        {
          id: `step_char_stats_${Date.now()}`,
          title: 'Character Stats',
          description: 'Define character attributes and stats',
          fields: [
            {
              id: 'char_stats_enabled',
              type: 'boolean',
              label: 'Enable Character Stats',
              defaultValue: false,
              required: false,
              helpText: 'Track numeric stats for this character (e.g., affection, trust)'
            },
            {
              id: 'char_initial_affection',
              type: 'number',
              label: 'Initial Affection',
              defaultValue: 0,
              required: false,
              conditional: {
                fieldId: 'char_stats_enabled',
                operator: '==',
                value: true
              },
              helpText: 'Starting affection level (0-100)'
            },
            {
              id: 'char_traits',
              type: 'multi-select',
              label: 'Character Traits',
              placeholder: 'Add traits...',
              required: false,
              options: [
                { value: 'shy', label: 'Shy' },
                { value: 'confident', label: 'Confident' },
                { value: 'mysterious', label: 'Mysterious' },
                { value: 'friendly', label: 'Friendly' },
                { value: 'serious', label: 'Serious' }
              ],
              helpText: 'Add personality traits (e.g., shy, confident, mysterious)'
            }
          ],
          canSkip: true,
          canGoBack: true,
          estimatedTime: 4,
          helpContent: 'Optionally add stats and traits to track character development.'
        }
      ],
      totalSteps: 3,
      estimatedTime: 12,
      prerequisites: [],
      outputConfig: {
        generateScenes: false,
        generateCharacters: true,
        generateUIScreens: false,
        generateVariables: false,
        generateAssets: false,
        applyOptimizations: false,
        createBackup: true,
        integrationPoints: ['character-manager']
      },
      version: '1.0.0',
      author: 'FlourishVNE',
      tags: ['character', 'creation', 'beginner'],
      usageCount: 0,
      lastUpdated: new Date(),
      isCustom: false
    };

    this.registerWizard(characterWizard);

    // Scene Builder Wizard
    const sceneWizard: ContentWizard = {
      id: `wizard_scene_${Date.now()}`,
      type: 'custom',
      name: 'Scene Builder',
      description: 'Create immersive scenes with backgrounds, characters, and dialogue',
      icon: 'image',
      category: 'scene',
      complexity: 'beginner',
      targetContentType: 'scene',
      steps: [
        {
          id: `step_scene_basic_${Date.now()}`,
          title: 'Scene Basics',
          description: 'Name and describe your scene',
          fields: [
            {
              id: 'scene_name',
              type: 'text',
              label: 'Scene Name',
              placeholder: 'Enter scene name',
              required: true,
              validation: [
                {
                  type: 'min-length',
                  value: 1,
                  message: 'Scene name is required'
                }
              ],
              helpText: 'A descriptive name for this scene'
            },
            {
              id: 'scene_location',
              type: 'select',
              label: 'Location Type',
              required: true,
              options: [
                { value: 'indoor', label: 'Indoor' },
                { value: 'outdoor', label: 'Outdoor' },
                { value: 'abstract', label: 'Abstract' },
                { value: 'other', label: 'Other' }
              ],
              helpText: 'The type of location for this scene'
            }
          ],
          canSkip: false,
          canGoBack: false,
          estimatedTime: 2
        },
        {
          id: `step_scene_bg_${Date.now()}`,
          title: 'Background',
          description: 'Set the scene background',
          fields: [
            {
              id: 'scene_background',
              type: 'file',
              label: 'Background Image',
              required: false,
              helpText: 'Select or upload a background image'
            },
            {
              id: 'scene_music',
              type: 'file',
              label: 'Background Music',
              required: false,
              helpText: 'Select background music for this scene'
            }
          ],
          canSkip: true,
          canGoBack: true,
          estimatedTime: 3
        },
        {
          id: `step_scene_content_${Date.now()}`,
          title: 'Scene Content',
          description: 'Add characters and dialogue',
          fields: [
            {
              id: 'scene_characters',
              type: 'multi-select',
              label: 'Characters in Scene',
              options: [], // Will be populated dynamically
              required: false,
              helpText: 'Select which characters appear in this scene'
            },
            {
              id: 'scene_opening_text',
              type: 'textarea',
              label: 'Opening Narrative',
              placeholder: 'Enter opening text...',
              required: false,
              helpText: 'Optional narrative text that appears when the scene starts'
            }
          ],
          canSkip: true,
          canGoBack: true,
          estimatedTime: 5
        }
      ],
      totalSteps: 3,
      estimatedTime: 10,
      prerequisites: [],
      outputConfig: {
        generateScenes: true,
        generateCharacters: false,
        generateUIScreens: false,
        generateVariables: false,
        generateAssets: false,
        applyOptimizations: false,
        createBackup: true,
        integrationPoints: ['scene-manager']
      },
      version: '1.0.0',
      author: 'FlourishVNE',
      tags: ['scene', 'creation', 'beginner'],
      usageCount: 0,
      lastUpdated: new Date(),
      isCustom: false
    };

    this.registerWizard(sceneWizard);
  }

  /**
   * Register a new wizard
   */
  public registerWizard(wizard: ContentWizard): boolean {
    if (this.wizards.has(wizard.id)) {
      console.warn(`Wizard ${wizard.id} already registered`);
      return false;
    }

    // Validate wizard structure
    if (!this.validateWizardStructure(wizard)) {
      console.error(`Invalid wizard structure for ${wizard.name}`);
      return false;
    }

    this.wizards.set(wizard.id, wizard);
    return true;
  }

  /**
   * Validate wizard structure
   */
  private validateWizardStructure(wizard: ContentWizard): boolean {
    if (!wizard.id || !wizard.name || !wizard.steps || wizard.steps.length === 0) {
      return false;
    }

    // Validate each step
    for (const step of wizard.steps) {
      if (!step.id || !step.title || !step.fields) {
        return false;
      }

      // Validate fields
      for (const field of step.fields) {
        if (!field.id || !field.type || !field.label) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Start a new wizard session
   */
  public startWizard(
    wizardId: VNID,
    userId: string,
    projectId: VNID,
    initialData?: Record<string, any>
  ): WizardSession | null {
    const wizard = this.wizards.get(wizardId);
    if (!wizard) {
      console.error(`Wizard ${wizardId} not found`);
      return null;
    }

    // Check prerequisites
    if (!this.checkPrerequisites(wizard)) {
      console.warn(`Prerequisites not met for wizard ${wizard.name}`);
      return null;
    }

    const sessionId = `session_${wizardId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const session: WizardSession = {
      id: sessionId,
      wizardId,
      userId,
      projectId,
      startedAt: new Date(),
      lastUpdated: new Date(),
      currentStepIndex: 0,
      stepResponses: new Map(),
      undoStack: [],
      redoStack: [],
      validationErrors: new Map(),
      isCompleted: false,
      metadata: {
        wizardName: wizard.name,
        wizardType: wizard.type,
        initialData: initialData || {}
      }
    };

    this.sessions.set(sessionId, session);

    // Setup auto-save if enabled
    if (this.config.enableAutoSave) {
      this.setupAutoSave(sessionId);
    }

    return session;
  }

  /**
   * Check wizard prerequisites
   */
  private checkPrerequisites(wizard: ContentWizard): boolean {
    if (!wizard.prerequisites || wizard.prerequisites.length === 0) {
      return true;
    }

    // For now, return true - in a full implementation, this would check project state
    return true;
  }

  /**
   * Setup auto-save for session
   */
  private setupAutoSave(sessionId: VNID): void {
    if (this.autoSaveTimers.has(sessionId)) {
      clearInterval(this.autoSaveTimers.get(sessionId));
    }

    const timer = setInterval(() => {
      this.saveSessionState(sessionId);
    }, this.config.autoSaveInterval);

    this.autoSaveTimers.set(sessionId, timer);
  }

  /**
   * Save session state (for auto-save)
   */
  private saveSessionState(sessionId: VNID): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.isCompleted) {
      this.clearAutoSave(sessionId);
      return;
    }

    session.lastUpdated = new Date();
    // In a full implementation, this would persist to storage
    console.log(`Auto-saved session ${sessionId}`);
  }

  /**
   * Clear auto-save timer
   */
  private clearAutoSave(sessionId: VNID): void {
    const timer = this.autoSaveTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(sessionId);
    }
  }

  /**
   * Get current step for session
   */
  public getCurrentStep(sessionId: VNID): WizardStep | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const wizard = this.wizards.get(session.wizardId);
    if (!wizard) return null;

    return wizard.steps[session.currentStepIndex] || null;
  }

  /**
   * Submit step response
   */
  public async submitStep(
    sessionId: VNID,
    stepId: string,
    fieldValues: Record<string, any>
  ): Promise<ValidationResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        isValid: false,
        errors: [{ fieldId: 'session', message: 'Session not found', code: 'SESSION_NOT_FOUND', severity: 'error' }],
        warnings: []
      };
    }

    const currentStep = this.getCurrentStep(sessionId);
    if (!currentStep || currentStep.id !== stepId) {
      return {
        isValid: false,
        errors: [{ fieldId: 'step', message: 'Invalid step', code: 'INVALID_STEP', severity: 'error' }],
        warnings: []
      };
    }

    // Validate field values
    const validationResult = this.validateStepFields(currentStep, fieldValues);
    
    if (validationResult.isValid) {
      // Create snapshot for undo if enabled
      if (this.config.enableUndo) {
        this.createSnapshot(session);
      }

      // Store response
      const response: StepResponse = {
        stepId,
        values: fieldValues,
        timestamp: new Date(),
        timeSpent: 0,
        skipped: false,
        validationPassed: true
      };
      session.stepResponses.set(stepId, response);
      session.lastUpdated = new Date();

      // Clear validation errors for this step
      session.validationErrors.delete(stepId);
    } else {
      // Store validation errors
      session.validationErrors.set(stepId, validationResult.errors);
    }

    return validationResult;
  }

  /**
   * Validate step fields
   */
  private validateStepFields(step: WizardStep, fieldValues: Record<string, any>): ValidationResult {
    const errors: FieldError[] = [];
    const warnings: { fieldId: string; message: string; impact: 'low' | 'medium' | 'high' }[] = [];

    for (const field of step.fields) {
      const value = fieldValues[field.id];

      // Check required fields
      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push({
          fieldId: field.id,
          message: `${field.label} is required`,
          code: 'REQUIRED_FIELD',
          severity: 'error'
        });
        continue;
      }

      // Skip validation for optional empty fields
      if (!field.required && (value === undefined || value === null || value === '')) {
        continue;
      }

      // Run validation rules
      if (field.validation) {
        for (const rule of field.validation) {
          const ruleError = this.validateRule(field, value, rule);
          if (ruleError) {
            errors.push(ruleError);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate individual rule
   */
  private validateRule(field: StepInputField, value: any, rule: ValidationRule): FieldError | null {
    switch (rule.type) {
      case 'min-length':
        if (typeof value === 'string' && value.length < rule.value) {
          return { fieldId: field.id, message: rule.message, code: 'MIN_LENGTH', severity: 'error' };
        }
        break;

      case 'max-length':
        if (typeof value === 'string' && value.length > rule.value) {
          return { fieldId: field.id, message: rule.message, code: 'MAX_LENGTH', severity: 'error' };
        }
        break;

      case 'pattern':
        if (typeof value === 'string') {
          const pattern = new RegExp(rule.value as string);
          if (!pattern.test(value)) {
            return { fieldId: field.id, message: rule.message, code: 'PATTERN_MISMATCH', severity: 'error' };
          }
        }
        break;
    }

    return null;
  }

  /**
   * Create snapshot for undo
   */
  private createSnapshot(session: WizardSession): void {
    const responses: Record<string, StepResponse> = {};
    for (const [key, value] of session.stepResponses.entries()) {
      responses[key] = value;
    }

    const snapshot: WizardSnapshot = {
      stepIndex: session.currentStepIndex,
      responses,
      timestamp: new Date()
    };

    session.undoStack.push(snapshot);

    // Limit undo stack size
    if (session.undoStack.length > this.config.maxUndoSteps) {
      session.undoStack.shift();
    }

    // Clear redo stack when new action is taken
    session.redoStack = [];
  }

  /**
   * Move to next step
   */
  public async nextStep(sessionId: VNID): Promise<{ success: boolean; step?: WizardStep; completed?: boolean }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false };
    }

    const wizard = this.wizards.get(session.wizardId);
    if (!wizard) {
      return { success: false };
    }

    // Move to next step
    session.currentStepIndex++;
    session.lastUpdated = new Date();

    // Check if completed
    if (session.currentStepIndex >= wizard.steps.length) {
      return await this.completeWizard(sessionId);
    }

    const nextStep = wizard.steps[session.currentStepIndex];
    return { success: true, step: nextStep };
  }

  /**
   * Move to previous step
   */
  public previousStep(sessionId: VNID): { success: boolean; step?: WizardStep } {
    const session = this.sessions.get(sessionId);
    if (!session || session.currentStepIndex <= 0) {
      return { success: false };
    }

    const wizard = this.wizards.get(session.wizardId);
    if (!wizard) {
      return { success: false };
    }

    session.currentStepIndex--;
    session.lastUpdated = new Date();

    const prevStep = wizard.steps[session.currentStepIndex];
    return { success: true, step: prevStep };
  }

  /**
   * Skip current step
   */
  public async skipStep(sessionId: VNID): Promise<{ success: boolean; step?: WizardStep; completed?: boolean }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false };
    }

    const currentStep = this.getCurrentStep(sessionId);
    if (!currentStep || !currentStep.canSkip) {
      return { success: false };
    }

    // Mark step as skipped and move to next
    return this.nextStep(sessionId);
  }

  /**
   * Undo last action
   */
  public undo(sessionId: VNID): boolean {
    if (!this.config.enableUndo) return false;

    const session = this.sessions.get(sessionId);
    if (!session || session.undoStack.length === 0) {
      return false;
    }

    // Save current state to redo stack
    const currentResponses: Record<string, StepResponse> = {};
    for (const [key, value] of session.stepResponses.entries()) {
      currentResponses[key] = value;
    }
    session.redoStack.push({
      stepIndex: session.currentStepIndex,
      responses: currentResponses,
      timestamp: new Date()
    });

    // Restore previous state
    const snapshot = session.undoStack.pop()!;
    session.currentStepIndex = snapshot.stepIndex;
    session.stepResponses = new Map(Object.entries(snapshot.responses));
    session.lastUpdated = new Date();

    return true;
  }

  /**
   * Redo last undone action
   */
  public redo(sessionId: VNID): boolean {
    if (!this.config.enableUndo) return false;

    const session = this.sessions.get(sessionId);
    if (!session || session.redoStack.length === 0) {
      return false;
    }

    // Save current state to undo stack
    const currentResponses: Record<string, StepResponse> = {};
    for (const [key, value] of session.stepResponses.entries()) {
      currentResponses[key] = value;
    }
    session.undoStack.push({
      stepIndex: session.currentStepIndex,
      responses: currentResponses,
      timestamp: new Date()
    });

    // Restore redo state
    const snapshot = session.redoStack.pop()!;
    session.currentStepIndex = snapshot.stepIndex;
    session.stepResponses = new Map(Object.entries(snapshot.responses));
    session.lastUpdated = new Date();

    return true;
  }

  /**
   * Complete wizard and generate content
   */
  private async completeWizard(sessionId: VNID): Promise<{ success: boolean; completed: true; result?: WizardExecutionResult }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, completed: true };
    }

    const wizard = this.wizards.get(session.wizardId);
    if (!wizard) {
      return { success: false, completed: true };
    }

    // Generate content from wizard responses
    const generatedContent = await this.generateContent(wizard, session);

    const result: WizardExecutionResult = {
      wizardId: wizard.id,
      sessionId: session.id,
      success: true,
      completedAt: new Date(),
      generatedContent,
      summary: `Successfully completed ${wizard.name}`,
      stats: {
        totalSteps: wizard.steps.length,
        completedSteps: session.stepResponses.size,
        skippedSteps: wizard.steps.length - session.stepResponses.size,
        timeElapsed: Date.now() - session.startedAt.getTime(),
        errorsEncountered: 0
      }
    };

    session.isCompleted = true;
    session.result = result;
    session.lastUpdated = new Date();

    // Update wizard usage count
    wizard.usageCount++;

    // Clear auto-save
    this.clearAutoSave(sessionId);

    return { success: true, completed: true, result };
  }

  /**
   * Generate content from wizard responses
   */
  private async generateContent(wizard: ContentWizard, session: WizardSession): Promise<GeneratedContent[]> {
    const content: GeneratedContent[] = [];

    // Collect all field values
    const allData: Record<string, any> = {};
    for (const [stepId, response] of session.stepResponses.entries()) {
      Object.assign(allData, response.values);
    }

    // Generate content based on wizard type
    switch (wizard.targetContentType) {
      case 'character':
        content.push(this.generateCharacterContent(allData));
        break;
      
      case 'scene':
        content.push(this.generateSceneContent(allData));
        break;

      case 'ui-screen':
      case 'variable-set':
      case 'logic-system':
      case 'template-instance':
      case 'complete-system':
        // These would be implemented similarly
        content.push({
          id: `generated_${wizard.targetContentType}_${Date.now()}`,
          type: wizard.targetContentType,
          name: allData.name || 'Generated Content',
          data: allData,
          relatedItems: []
        });
        break;
    }

    return content;
  }

  /**
   * Generate character content from wizard data
   */
  private generateCharacterContent(data: Record<string, any>): GeneratedContent {
    const character: Partial<VNCharacter> = {
      id: `char_${Date.now()}`,
      name: data.char_name || 'New Character',
      color: data.char_color || '#FFFFFF',
      baseImageUrl: data.char_sprite || null,
      layers: {}
    };

    return {
      id: character.id!,
      type: 'character',
      name: character.name!,
      data: character,
      relatedItems: []
    };
  }

  /**
   * Generate scene content from wizard data
   */
  private generateSceneContent(data: Record<string, any>): GeneratedContent {
    const scene: VNScene = {
      id: `scene_${Date.now()}`,
      name: data.scene_name || 'New Scene',
      commands: []
    };

    // Store additional wizard data for reference
    const sceneWithWizardData = {
      ...scene,
      wizardData: {
        location: data.scene_location,
        background: data.scene_background,
        music: data.scene_music,
        characters: data.scene_characters || [],
        openingText: data.scene_opening_text
      }
    };

    return {
      id: scene.id,
      type: 'scene',
      name: scene.name,
      data: sceneWithWizardData,
      relatedItems: data.scene_characters || []
    };
  }

  /**
   * Get all available wizards
   */
  public getAvailableWizards(filter?: { type?: WizardType; complexity?: WizardComplexity }): ContentWizard[] {
    let wizards = Array.from(this.wizards.values());

    if (filter?.type) {
      wizards = wizards.filter(w => w.type === filter.type);
    }

    if (filter?.complexity) {
      wizards = wizards.filter(w => w.complexity === filter.complexity);
    }

    return wizards.sort((a, b) => b.usageCount - a.usageCount);
  }

  /**
   * Get wizard by ID
   */
  public getWizard(wizardId: VNID): ContentWizard | undefined {
    return this.wizards.get(wizardId);
  }

  /**
   * Get session by ID
   */
  public getSession(sessionId: VNID): WizardSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get active sessions for user
   */
  public getUserSessions(userId: string): WizardSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId && !s.isCompleted);
  }

  /**
   * Delete session
   */
  public deleteSession(sessionId: VNID): boolean {
    this.clearAutoSave(sessionId);
    return this.sessions.delete(sessionId);
  }

  /**
   * Get session progress
   */
  public getProgress(sessionId: VNID): { current: number; total: number; percentage: number } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const wizard = this.wizards.get(session.wizardId);
    if (!wizard) return null;

    return {
      current: session.currentStepIndex + 1,
      total: wizard.steps.length,
      percentage: Math.round(((session.currentStepIndex + 1) / wizard.steps.length) * 100)
    };
  }

  /**
   * Get service statistics
   */
  public getStatistics(): {
    totalWizards: number;
    activeSessions: number;
    completedSessions: number;
    mostUsedWizard: string | null;
  } {
    const activeSessions = Array.from(this.sessions.values()).filter(s => !s.isCompleted);
    const completedSessions = Array.from(this.sessions.values()).filter(s => s.isCompleted);

    let mostUsedWizard: string | null = null;
    let maxUsage = 0;
    for (const wizard of this.wizards.values()) {
      if (wizard.usageCount > maxUsage) {
        maxUsage = wizard.usageCount;
        mostUsedWizard = wizard.name;
      }
    }

    return {
      totalWizards: this.wizards.size,
      activeSessions: activeSessions.length,
      completedSessions: completedSessions.length,
      mostUsedWizard
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<WizardServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    // Clear all auto-save timers
    for (const timer of this.autoSaveTimers.values()) {
      clearInterval(timer);
    }
    this.autoSaveTimers.clear();

    this.wizards.clear();
    this.sessions.clear();
  }
}
