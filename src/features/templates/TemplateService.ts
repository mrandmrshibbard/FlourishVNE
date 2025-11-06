import { 
  Template, 
  TemplateConfig, 
  TemplateInstance, 
  TemplateLibrary, 
  TemplateGenerationResult, 
  TemplateValidationResult, 
  TemplateSearchOptions, 
  TemplateSearchResult,
  TemplateCategory,
  TemplateValidationError,
  TemplateValidationWarning
} from '../../types/template';
import { VNID } from '../../types';
import { VNUIScreen } from '../ui/types';
import { VNVariable } from '../variables/types';
import { VNProject } from '../../types/project';

/**
 * Core service for managing template library, configuration, and generation
 * Implements the Template Service contract from contracts/template-service.md
 */
export class TemplateService {
  private templates: Map<VNID, Template> = new Map();
  private templateInstances: Map<VNID, TemplateInstance> = new Map();
  private library: TemplateLibrary;

  constructor() {
    this.library = {
      featured: [],
      categories: {} as Record<TemplateCategory, VNID[]>,
      recent: [],
      userTemplates: [],
      favorites: []
    };
    this.initializeDefaultTemplates();
  }

  /**
   * Get the complete template library with categorized templates
   */
  async getTemplateLibrary(): Promise<TemplateLibrary> {
    // Ensure categories are properly populated
    const categories = {} as Record<TemplateCategory, VNID[]>;
    
    for (const [id, template] of this.templates) {
      if (!categories[template.category]) {
        categories[template.category] = [];
      }
      categories[template.category].push(id);
    }

    return {
      ...this.library,
      categories
    };
  }

  /**
   * Get available templates with optional filtering
   */
  async getAvailableTemplates(options?: TemplateSearchOptions): Promise<TemplateSearchResult> {
    let filteredTemplates = Array.from(this.templates.values());

    // Apply filters
    if (options?.query) {
      const query = options.query.toLowerCase();
      filteredTemplates = filteredTemplates.filter(template =>
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    if (options?.categories && options.categories.length > 0) {
      filteredTemplates = filteredTemplates.filter(template =>
        options.categories!.includes(template.category)
      );
    }

    if (options?.tags && options.tags.length > 0) {
      filteredTemplates = filteredTemplates.filter(template =>
        options.tags!.some(tag => template.tags.includes(tag))
      );
    }

    if (options?.complexity && options.complexity.length > 0) {
      filteredTemplates = filteredTemplates.filter(template =>
        template.preview && options.complexity!.includes(template.preview.complexity)
      );
    }

    // Apply sorting
    if (options?.sortBy) {
      filteredTemplates.sort((a, b) => {
        let aValue: any, bValue: any;
        
        switch (options.sortBy) {
          case 'name':
            aValue = a.name;
            bValue = b.name;
            break;
          case 'popularity':
            aValue = a.usageCount || 0;
            bValue = b.usageCount || 0;
            break;
          case 'rating':
            aValue = a.rating || 0;
            bValue = b.rating || 0;
            break;
          case 'recent':
            aValue = a.updatedAt;
            bValue = b.updatedAt;
            break;
          case 'complexity':
            const complexityOrder = { 'beginner': 1, 'intermediate': 2, 'advanced': 3 };
            aValue = a.preview ? complexityOrder[a.preview.complexity] : 0;
            bValue = b.preview ? complexityOrder[b.preview.complexity] : 0;
            break;
          default:
            return 0;
        }

        if (typeof aValue === 'string') {
          return options.sortOrder === 'desc' ? bValue.localeCompare(aValue) : aValue.localeCompare(bValue);
        } else {
          return options.sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
        }
      });
    }

    // Apply pagination
    const total = filteredTemplates.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;
    const paginatedTemplates = filteredTemplates.slice(offset, offset + limit);

    // Calculate facets
    const facets = this.calculateSearchFacets(Array.from(this.templates.values()));

    return {
      templates: paginatedTemplates,
      total,
      hasMore: offset + limit < total,
      facets
    };
  }

  /**
   * Get a specific template by ID
   */
  async getTemplate(templateId: VNID): Promise<Template | null> {
    return this.templates.get(templateId) || null;
  }

  /**
   * Configure a template with user-specific settings
   */
  async configureTemplate(
    templateId: VNID, 
    config: TemplateConfig, 
    projectId: VNID
  ): Promise<TemplateValidationResult> {
    const template = this.templates.get(templateId);
    if (!template) {
      return {
        isValid: false,
        errors: [{
          code: 'TEMPLATE_NOT_FOUND',
          message: `Template with ID ${templateId} not found`,
          severity: 'error'
        }],
        warnings: [],
        suggestions: []
      };
    }

    // Validate configuration against template schema
    const validation = await this.validateTemplateConfig(template, config);
    
    if (validation.isValid) {
      // Create template instance
      const instance: TemplateInstance = {
        id: this.generateId(),
        templateId,
        projectId,
        config,
        generatedUIScreens: [],
        generatedVariables: [],
        createdAt: new Date(),
        lastModified: new Date(),
        customizations: []
      };

      this.templateInstances.set(instance.id, instance);
    }

    return validation;
  }

  /**
   * Generate content from a configured template
   */
  async generateFromTemplate(
    templateId: VNID, 
    config: TemplateConfig, 
    projectId: VNID
  ): Promise<TemplateGenerationResult> {
    const template = this.templates.get(templateId);
    if (!template) {
      return {
        success: false,
        generatedScreens: [],
        generatedVariables: [],
        warnings: [],
        errors: ['Template not found']
      };
    }

    try {
      // Validate configuration first
      const validation = await this.validateTemplateConfig(template, config);
      if (!validation.isValid) {
        return {
          success: false,
          generatedScreens: [],
          generatedVariables: [],
          warnings: validation.warnings.map(w => w.message),
          errors: validation.errors.map(e => e.message)
        };
      }

      // Generate UI screens using template's generator function
      const generatedScreens = template.uiGenerator(config);
      
      // Generate variables based on template configuration
      const generatedVariables = this.generateTemplateVariables(template, config);

      // Create template instance to track generation
      const instance: TemplateInstance = {
        id: this.generateId(),
        templateId,
        projectId,
        config,
        generatedUIScreens: generatedScreens.map(screen => screen.id),
        generatedVariables: generatedVariables.map(variable => variable.id),
        createdAt: new Date(),
        lastModified: new Date(),
        customizations: []
      };

      this.templateInstances.set(instance.id, instance);

      // Update template usage count
      template.usageCount = (template.usageCount || 0) + 1;

      // Estimate performance
      const estimatedPerformance = {
        renderTime: generatedScreens.length * 10, // Rough estimate
        memoryUsage: this.estimateMemoryUsage(generatedScreens, generatedVariables),
        variableCount: generatedVariables.length
      };

      return {
        success: true,
        generatedScreens,
        generatedVariables,
        warnings: validation.warnings.map(w => w.message),
        errors: [],
        estimatedPerformance
      };

    } catch (error) {
      return {
        success: false,
        generatedScreens: [],
        generatedVariables: [],
        warnings: [],
        errors: [`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * Validate template configuration against schema
   */
  private async validateTemplateConfig(
    template: Template, 
    config: TemplateConfig
  ): Promise<TemplateValidationResult> {
    const errors: TemplateValidationError[] = [];
    const warnings: TemplateValidationWarning[] = [];
    const suggestions: string[] = [];

    // Check required fields from schema
    if (template.configSchema.required) {
      for (const requiredField of template.configSchema.required) {
        if (!(requiredField in config)) {
          errors.push({
            code: 'MISSING_REQUIRED_FIELD',
            message: `Required field '${requiredField}' is missing`,
            field: requiredField,
            severity: 'error'
          });
        }
      }
    }

    // Validate against customization limits
    const limits = template.customizationLimits;
    
    if (config.characters && limits.maxCharacters && config.characters.length > limits.maxCharacters) {
      errors.push({
        code: 'EXCEEDS_CHARACTER_LIMIT',
        message: `Number of characters (${config.characters.length}) exceeds limit (${limits.maxCharacters})`,
        field: 'characters',
        severity: 'error'
      });
    }

    if (config.items && limits.maxItems && config.items.length > limits.maxItems) {
      errors.push({
        code: 'EXCEEDS_ITEM_LIMIT',
        message: `Number of items (${config.items.length}) exceeds limit (${limits.maxItems})`,
        field: 'items',
        severity: 'error'
      });
    }

    // Check locked components
    if (limits.lockedComponents.length > 0) {
      for (const lockedComponent of limits.lockedComponents) {
        if (config[lockedComponent] !== template.defaultConfig[lockedComponent]) {
          warnings.push({
            code: 'LOCKED_COMPONENT_MODIFIED',
            message: `Component '${lockedComponent}' is locked but has been modified`,
            field: lockedComponent,
            impact: 'medium'
          });
        }
      }
    }

    // Provide suggestions for optimization
    if (config.characters && config.characters.length > 5) {
      suggestions.push('Consider reducing the number of characters for better performance');
    }

    if (config.items && config.items.length > 20) {
      suggestions.push('Large item lists may impact performance. Consider pagination or filtering.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Generate variables based on template configuration
   */
  private generateTemplateVariables(template: Template, config: TemplateConfig): VNVariable[] {
    const variables: VNVariable[] = [];

    // Generate character-related variables
    if (config.characters) {
      for (const character of config.characters) {
        variables.push({
          id: this.generateId(),
          name: `${character.name}_unlocked`,
          type: 'boolean',
          defaultValue: false
        });

        variables.push({
          id: this.generateId(),
          name: `${character.name}_affection`,
          type: 'number',
          defaultValue: 0
        });
      }
    }

    // Generate item-related variables
    if (config.items) {
      for (const item of config.items) {
        variables.push({
          id: this.generateId(),
          name: `${item.name}_count`,
          type: 'number',
          defaultValue: 0
        });

        if (item.price) {
          variables.push({
            id: this.generateId(),
            name: `${item.name}_purchased`,
            type: 'boolean',
            defaultValue: false
          });
        }
      }
    }

    // Generate stat-related variables
    if (config.stats) {
      for (const stat of config.stats) {
        variables.push({
          id: this.generateId(),
          name: stat.name,
          type: 'number',
          defaultValue: stat.initialValue
        });
      }
    }

    return variables;
  }

  /**
   * Estimate memory usage for generated content
   */
  private estimateMemoryUsage(screens: VNUIScreen[], variables: VNVariable[]): number {
    // Rough estimation: 1KB per screen, 100 bytes per variable
    return (screens.length * 1024) + (variables.length * 100);
  }

  /**
   * Calculate search facets for filtering
   */
  private calculateSearchFacets(templates: Template[]) {
    const categories: Record<TemplateCategory, number> = {} as Record<TemplateCategory, number>;
    const tags: Record<string, number> = {};
    const complexity: Record<string, number> = {};

    for (const template of templates) {
      // Count categories
      categories[template.category] = (categories[template.category] || 0) + 1;

      // Count tags
      for (const tag of template.tags) {
        tags[tag] = (tags[tag] || 0) + 1;
      }

      // Count complexity levels
      if (template.preview) {
        complexity[template.preview.complexity] = (complexity[template.preview.complexity] || 0) + 1;
      }
    }

    return { categories, tags, complexity };
  }

  /**
   * Initialize default templates for common VN patterns
   */
  private initializeDefaultTemplates(): void {
    // Asset Cycling System Template
    this.addDefaultTemplate({
      id: 'template-asset-cycling',
      name: 'Asset Cycling System',
      description: 'Multi-purpose asset browser with filtered combinations. Perfect for outfit selection, item customization, or any categorized asset preview.',
      category: 'character-creation',
      state: 'published',
      configSchema: {
        type: 'object',
        properties: {
          screenName: { type: 'string' },
          characterId: { type: 'string' },
          layerId: { type: 'string' },
          categories: { type: 'array' },
          useCharacterPreview: { type: 'boolean' },
          showConfirmButton: { type: 'boolean' },
          backgroundType: { type: 'string' },
          backgroundColor: { type: 'string' }
        },
        required: ['screenName', 'characterId', 'layerId', 'categories']
      },
      defaultConfig: {
        screenName: 'Outfit Selection',
        characterId: '',
        layerId: '',
        categories: [
          { name: 'Top', assetPrefix: 'top' },
          { name: 'Bottom', assetPrefix: 'bottom' }
        ],
        useCharacterPreview: true,
        showConfirmButton: true,
        backgroundType: 'color',
        backgroundColor: '#1a102c'
      },
      tags: ['asset-cycling', 'customization', 'outfit', 'items'],
      version: '1.0.0',
      customizationLimits: {
        allowStructureChanges: true,
        allowNewComponents: true,
        allowVariableModification: true,
        allowLogicChanges: true,
        requiredFields: ['screenName', 'characterId', 'layerId', 'categories'],
        lockedComponents: []
      },
      preview: {
        features: [
          'Filtered asset combinations with automatic matching',
          'Multiple category cyclers (outfit parts, colors, etc.)',
          'Character preview or image display',
          'Variable-based asset filtering'
        ],
        estimatedTime: 5,
        complexity: 'beginner'
      }
    });
  }

  /**
   * Add a default template to the service
   */
  private addDefaultTemplate(templateData: Partial<Template>): void {
    const template: Template = {
      id: templateData.id!,
      name: templateData.name!,
      description: templateData.description!,
      category: templateData.category!,
      state: templateData.state || 'published',
      configSchema: templateData.configSchema!,
      defaultConfig: templateData.defaultConfig!,
      uiGenerator: this.createUIGeneratorForTemplate(templateData.id!),
      previewImage: templateData.previewImage,
      preview: templateData.preview,
      tags: templateData.tags || [],
      version: templateData.version || '1.0.0',
      customizationLimits: templateData.customizationLimits!,
      createdAt: new Date(),
      updatedAt: new Date(),
      author: 'FlourishVNE',
      isUserTemplate: false,
      usageCount: 0
    };

    this.templates.set(template.id, template);
  }

  /**
   * Create a UI generator function for a specific template
   */
  private createUIGeneratorForTemplate(templateId: string) {
    return (config: TemplateConfig): VNUIScreen[] => {
      switch (templateId) {
        case 'template-asset-cycling':
          return this.generateAssetCyclingScreen(config);
        default:
          // Fallback for unknown templates
          return [{
            id: this.generateId(),
            name: config.screenName || 'Template Screen',
            background: { type: 'color', value: config.backgroundColor || '#1a102c' },
            music: { audioId: null, policy: 'continue' },
            ambientNoise: { audioId: null, policy: 'continue' },
            elements: {},
            transitionIn: 'fade',
            transitionOut: 'fade',
            transitionDuration: 300,
            showDialogue: config.showDialogue || false
          }];
      }
    };
  }

  /**
   * Generate Asset Cycling System UI Screen
   * This creates the exact structure a user would manually create:
   * - CharacterPreview element (if enabled)
   * - AssetCycler elements for each category
   * - Hidden filtered AssetCycler for final selection
   * - Confirmation button (if enabled)
   */
  private generateAssetCyclingScreen(config: TemplateConfig): VNUIScreen[] {
    const screenId = this.generateId();
    const elements: Record<VNID, any> = {};
    
    const characterId = config.characterId as string;
    const layerId = config.layerId as string;
    const categories = config.categories as Array<{name: string, assetPrefix: string, assetIds?: string[]}>;
    const useCharacterPreview = config.useCharacterPreview !== false;
    const showConfirmButton = config.showConfirmButton !== false;
    
    let yPosition = 14; // Starting Y position for cyclers
    const cyclerSpacing = 13; // Space between cyclers
    
    // Create variables for each category and the final combined selection
    const categoryVariables: string[] = [];
    categories.forEach((category, index) => {
      const varId = this.generateId();
      categoryVariables.push(varId);
    });
    
    // Final combined variable
    const finalVariableId = this.generateId();
    
    // 1. CharacterPreview Element (if enabled)
    if (useCharacterPreview) {
      const previewId = this.generateId();
      elements[previewId] = {
        id: previewId,
        name: 'Character Preview',
        type: 'CharacterPreview',
        characterId: characterId,
        expressionId: config.expressionId || null, // User should provide empty expression
        layerVariableMap: {
          [layerId]: finalVariableId
        },
        x: 44,
        y: 5,
        width: 53,
        height: 90,
        anchorX: 0,
        anchorY: 0
      };
    }
    
    // 2. AssetCycler Elements for each category
    categories.forEach((category, index) => {
      const cyclerId = this.generateId();
      elements[cyclerId] = {
        id: cyclerId,
        name: `${category.name} Cycler`,
        type: 'AssetCycler',
        characterId: characterId,
        layerId: layerId,
        variableId: categoryVariables[index],
        assetIds: category.assetIds || [], // User will populate these
        label: category.name,
        showAssetName: false,
        font: {
          family: 'Poppins, sans-serif',
          size: 20,
          color: '#FFFFFF',
          weight: 'normal',
          italic: false
        },
        arrowColor: '#a855f7',
        arrowSize: 24,
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        x: 4,
        y: yPosition,
        width: 40,
        height: 8,
        anchorX: 0,
        anchorY: 0
      };
      yPosition += cyclerSpacing;
    });
    
    // 3. Hidden Filtered AssetCycler for final selection
    const filterCyclerId = this.generateId();
    // Build filter pattern: {[1]}_{[2]}_{[3]}...
    const filterPattern = categories.map((_, i) => `{[${i + 1}]}`).join('_');
    
    elements[filterCyclerId] = {
      id: filterCyclerId,
      name: 'Combined Selection',
      type: 'AssetCycler',
      characterId: characterId,
      layerId: layerId,
      variableId: finalVariableId,
      assetIds: config.allAssetIds || [], // User provides all possible combinations
      label: 'Final',
      showAssetName: true,
      font: {
        family: 'Poppins, sans-serif',
        size: 20,
        color: '#FFFFFF',
        weight: 'normal',
        italic: false
      },
      arrowColor: '#a855f7',
      arrowSize: 24,
      backgroundColor: 'rgba(30, 41, 59, 0.8)',
      filterPattern: filterPattern,
      filterVariableIds: categoryVariables,
      visible: false, // Hidden - auto-updates based on filter
      x: 4,
      y: yPosition,
      width: 40,
      height: 8,
      anchorX: 0,
      anchorY: 0
    };
    
    // 4. Confirmation Button (if enabled)
    if (showConfirmButton) {
      const buttonId = this.generateId();
      elements[buttonId] = {
        id: buttonId,
        name: 'Confirm Button',
        type: 'Button',
        text: config.confirmButtonText || 'Confirm',
        font: {
          family: 'Poppins, sans-serif',
          size: 18,
          color: '#FFFFFF',
          weight: 'normal',
          italic: false
        },
        action: {
          type: 'ReturnToPreviousScreen' // Or custom action
        },
        image: null,
        hoverImage: null,
        clickSoundId: null,
        hoverSoundId: null,
        x: 12,
        y: 78,
        width: 20,
        height: 10,
        anchorX: 0,
        anchorY: 0
      };
    }
    
    // Create the screen
    return [{
      id: screenId,
      name: config.screenName || 'Asset Cycling Screen',
      background: config.backgroundType === 'image' && config.backgroundImageId 
        ? { type: 'image', assetId: config.backgroundImageId as VNID }
        : { type: 'color', value: config.backgroundColor || '#1a102c' },
      music: { audioId: config.musicId as VNID || null, policy: 'continue' },
      ambientNoise: { audioId: null, policy: 'continue' },
      elements: elements,
      transitionIn: 'fade',
      transitionOut: 'fade',
      transitionDuration: 300,
      showDialogue: config.showDialogue || false
    }];
  }

  /**
   * Create a UI generator function for a template category
   * @deprecated Use createUIGeneratorForTemplate instead
   */
  private createUIGenerator(category: TemplateCategory) {
    return (config: TemplateConfig): VNUIScreen[] => {
      // This is a simplified generator - in a real implementation,
      // each category would have sophisticated UI generation logic
      return [{
        id: this.generateId(),
        name: `${category} Screen`,
        background: { type: 'color', value: config.colors?.background || '#ffffff' },
        music: { audioId: null, policy: 'continue' },
        ambientNoise: { audioId: null, policy: 'continue' },
        elements: {} as Record<VNID, any>, // Will be populated with actual UI elements
        transitionIn: 'fade',
        transitionOut: 'fade',
        transitionDuration: 300,
        showDialogue: false
      }];
    };
  }

  /**
   * Generate a unique ID
   */
  private generateId(): VNID {
    return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}