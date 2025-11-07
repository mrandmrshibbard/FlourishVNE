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
    // Layered Character Creator Template
    this.addDefaultTemplate({
      id: 'template-character-creator',
      name: 'Layered Character Creator',
      description: 'Interactive character creation with composable sprite layers. Mix and match base, hair, eyes, clothes, and accessories to create unique characters.',
      category: 'character-creation',
      state: 'published',
      configSchema: {
        type: 'object',
        properties: {
          screenName: { type: 'string' },
          characterName: { type: 'string' },
          layers: { type: 'array' },
          showRandomizeButton: { type: 'boolean' },
          showResetButton: { type: 'boolean' },
          backgroundColor: { type: 'string' }
        },
        required: ['screenName', 'characterName', 'layers']
      },
      defaultConfig: {
        screenName: 'Character Creator',
        characterName: 'Player Character',
        layers: [
          { name: 'Base', order: 0 },
          { name: 'Hair', order: 1 },
          { name: 'Eyes', order: 2 },
          { name: 'Clothes', order: 3 },
          { name: 'Accessories', order: 4 }
        ],
        showRandomizeButton: true,
        showResetButton: true,
        backgroundColor: '#1a102c'
      },
      tags: ['character', 'customization', 'layered', 'creator'],
      version: '1.0.0',
      customizationLimits: {
        allowStructureChanges: true,
        allowNewComponents: true,
        allowVariableModification: true,
        allowLogicChanges: true,
        requiredFields: ['screenName', 'characterName', 'layers'],
        lockedComponents: []
      },
      preview: {
        features: [
          'Composable sprite layers (base, hair, eyes, clothes, accessories)',
          'Individual asset cyclers for each layer',
          'Real-time character preview with all layers combined',
          'Optional randomize and reset buttons',
          'Variables track selection for each layer'
        ],
        estimatedTime: 8,
        complexity: 'beginner'
      }
    });

    // Shop Screen Template
    this.addDefaultTemplate({
      id: 'template-shop-screen',
      name: 'Shop System',
      description: 'Complete shop interface with item display, currency tracking, and purchase functionality. Perfect for games with inventory and economy systems.',
      category: 'shop-system',
      state: 'published',
      configSchema: {
        type: 'object',
        properties: {
          screenName: { type: 'string' },
          currencyName: { type: 'string' },
          currencyIcon: { type: 'string' },
          items: { type: 'array' },
          columns: { type: 'number' },
          backgroundColor: { type: 'string' }
        },
        required: ['screenName', 'currencyName', 'items']
      },
      defaultConfig: {
        screenName: 'Shop',
        currencyName: 'Gold',
        currencyIcon: '💰',
        items: [
          { id: 'health_potion', name: 'Health Potion', price: 50, category: 'consumable', description: 'Restores 50 HP', rarity: 'common' },
          { id: 'magic_scroll', name: 'Magic Scroll', price: 100, category: 'consumable', description: 'Learn a new spell', rarity: 'uncommon' },
          { id: 'iron_sword', name: 'Iron Sword', price: 200, category: 'weapon', description: '+10 Attack', rarity: 'common' },
          { id: 'lucky_charm', name: 'Lucky Charm', price: 150, category: 'accessory', description: '+5 Luck', rarity: 'rare' }
        ],
        columns: 2,
        backgroundColor: '#1a102c'
      },
      tags: ['shop', 'economy', 'inventory', 'ui'],
      version: '1.0.0',
      customizationLimits: {
        allowStructureChanges: true,
        allowNewComponents: true,
        allowVariableModification: true,
        allowLogicChanges: true,
        requiredFields: ['screenName', 'currencyName', 'items'],
        lockedComponents: []
      },
      preview: {
        features: [
          'Grid layout for displaying items',
          'Currency display and tracking',
          'Item cards with name, price, and description',
          'Purchase buttons with affordability checking',
          'Inventory tracking variables',
          'Close/Back button'
        ],
        estimatedTime: 10,
        complexity: 'intermediate'
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
        case 'template-character-creator':
          return this.generateCharacterCreatorScreen(config);
        case 'template-shop-screen':
          return this.generateShopScreen(config);
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
   * Generate Layered Character Creator UI Screen
   * Creates a screen with:
   * - CharacterPreview showing all layers composed together
   * - AssetCycler for each layer
   * - Optional randomize/reset buttons
   */
  private generateCharacterCreatorScreen(config: TemplateConfig): VNUIScreen[] {
    const screenId = this.generateId();
    const elements: Record<VNID, any> = {};
    
    const characterName = config.characterName as string || 'Character';
    const layers = config.layers as Array<{name: string, order: number, variableId?: VNID}> || [];
    const showRandomizeButton = config.showRandomizeButton !== false;
    const showResetButton = config.showResetButton !== false;
    
    // Generate a character ID (user will need to create the actual character)
    const characterId = this.generateId();
    
    // Create layer IDs and use pre-generated variable IDs from config (or generate new ones)
    const layerData = layers.map(layer => ({
      layerId: this.generateId(),
      variableId: layer.variableId || this.generateId(), // Use pre-generated ID if available
      name: layer.name,
      order: layer.order
    }));
    
    let yPosition = 14; // Starting Y position for cyclers
    const cyclerSpacing = 13; // Space between cyclers
    
    // 1. CharacterPreview Element (center-right)
    const previewId = this.generateId();
    const layerVariableMap: Record<VNID, VNID> = {};
    layerData.forEach(ld => {
      layerVariableMap[ld.layerId] = ld.variableId;
    });
    
    elements[previewId] = {
      id: previewId,
      name: 'Character Preview',
      type: 'CharacterPreview',
      characterId: characterId,
      expressionId: null, // Will use layer variables
      layerVariableMap: layerVariableMap,
      x: 50,
      y: 10,
      width: 45,
      height: 80,
      anchorX: 0,
      anchorY: 0
    };
    
    // 2. AssetCycler Elements for each layer (left side)
    layerData.forEach((ld, index) => {
      const cyclerId = this.generateId();
      elements[cyclerId] = {
        id: cyclerId,
        name: `${ld.name} Cycler`,
        type: 'AssetCycler',
        characterId: characterId,
        layerId: ld.layerId,
        variableId: ld.variableId,
        assetIds: [], // User will populate these
        label: ld.name,
        showAssetName: true,
        font: {
          family: 'Poppins, sans-serif',
          size: 18,
          color: '#FFFFFF',
          weight: 'normal',
          italic: false
        },
        arrowColor: '#a855f7',
        arrowSize: 24,
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        x: 5,
        y: yPosition,
        width: 40,
        height: 8,
        anchorX: 0,
        anchorY: 0
      };
      yPosition += cyclerSpacing;
    });
    
    // 3. Randomize Button (if enabled)
    if (showRandomizeButton) {
      const randomizeBtnId = this.generateId();
      elements[randomizeBtnId] = {
        id: randomizeBtnId,
        name: 'Randomize Button',
        type: 'Button',
        text: 'Randomize',
        font: {
          family: 'Poppins, sans-serif',
          size: 16,
          color: '#FFFFFF',
          weight: 'normal',
          italic: false
        },
        action: {
          type: 'SetVariable',
          variableId: layerData[0]?.variableId || this.generateId(),
          operator: 'random',
          value: ''
        },
        actions: [], // User can add randomize logic for each layer
        image: null,
        hoverImage: null,
        clickSoundId: null,
        hoverSoundId: null,
        x: 5,
        y: 85,
        width: 18,
        height: 8,
        anchorX: 0,
        anchorY: 0
      };
    }
    
    // 4. Reset Button (if enabled)
    if (showResetButton) {
      const resetBtnId = this.generateId();
      elements[resetBtnId] = {
        id: resetBtnId,
        name: 'Reset Button',
        type: 'Button',
        text: 'Reset',
        font: {
          family: 'Poppins, sans-serif',
          size: 16,
          color: '#FFFFFF',
          weight: 'normal',
          italic: false
        },
        action: {
          type: 'SetVariable',
          variableId: layerData[0]?.variableId || this.generateId(),
          operator: 'set',
          value: ''
        },
        actions: [], // User can add reset logic for each layer
        image: null,
        hoverImage: null,
        clickSoundId: null,
        hoverSoundId: null,
        x: 25,
        y: 85,
        width: 18,
        height: 8,
        anchorX: 0,
        anchorY: 0
      };
    }
    
    // 5. Confirm/Done Button
    const confirmBtnId = this.generateId();
    elements[confirmBtnId] = {
      id: confirmBtnId,
      name: 'Done Button',
      type: 'Button',
      text: 'Done',
      font: {
        family: 'Poppins, sans-serif',
        size: 18,
        color: '#FFFFFF',
        weight: 'bold',
        italic: false
      },
      action: {
        type: 'ReturnToPreviousScreen'
      },
      image: null,
      hoverImage: null,
      clickSoundId: null,
      hoverSoundId: null,
      x: 72,
      y: 88,
      width: 20,
      height: 8,
      anchorX: 0,
      anchorY: 0
    };
    
    // Create the screen
    return [{
      id: screenId,
      name: config.screenName || 'Character Creator',
      background: { type: 'color', value: config.backgroundColor || '#1a102c' },
      music: { audioId: null, policy: 'continue' },
      ambientNoise: { audioId: null, policy: 'continue' },
      elements: elements,
      transitionIn: 'fade',
      transitionOut: 'fade',
      transitionDuration: 300,
      showDialogue: false
    }];
  }

  /**
   * Generate Shop Screen UI
   * Creates a screen with:
   * - Currency display header
   * - Grid of item cards with purchase buttons
   * - Inventory tracking
   * - Close/Back button
   */
  private generateShopScreen(config: TemplateConfig): VNUIScreen[] {
    const screenId = this.generateId();
    const elements: Record<VNID, any> = {};
    
    const screenName = config.screenName as string || 'Shop';
    const currencyName = config.currencyName as string || 'Gold';
    const currencyIcon = config.currencyIcon as string || '💰';
    const items = config.items as Array<{
      id: string, 
      name: string, 
      price: number, 
      description: string, 
      category: string,
      variableId?: string  // Added by TemplateGenerator
    }> || [];
    const columns = config.columns as number || 2;
    
    // Get currency variable ID from config (injected by TemplateGenerator)
    const currencyVariableId = config.currencyVariableId as string;
    
    // 1. Title Text (top)
    const titleId = this.generateId();
    elements[titleId] = {
      id: titleId,
      name: 'Shop Title',
      type: 'Text',
      text: screenName,
      font: {
        family: 'Poppins, sans-serif',
        size: 32,
        color: '#FFFFFF',
        weight: 'bold',
        italic: false
      },
      textAlign: 'center',
      verticalAlign: 'middle',
      x: 50,
      y: 5,
      width: 60,
      height: 8,
      anchorX: 0.5,
      anchorY: 0
    };
    
    // 2. Currency Display (below title)
    const currencyDisplayId = this.generateId();
    elements[currencyDisplayId] = {
      id: currencyDisplayId,
      name: 'Currency Display',
      type: 'Text',
      text: `${currencyIcon} {player_${currencyName.toLowerCase()}} ${currencyName}`,
      font: {
        family: 'Poppins, sans-serif',
        size: 24,
        color: '#FFD700',
        weight: 'bold',
        italic: false
      },
      textAlign: 'center',
      verticalAlign: 'middle',
      x: 50,
      y: 13,
      width: 40,
      height: 6,
      anchorX: 0.5,
      anchorY: 0
    };
    
    // 3. Item Cards Grid
    const cardWidth = 40;
    const cardHeight = 22;
    const startX = columns === 1 ? 30 : 10;
    const startY = 22;
    const gapX = 48;
    const gapY = 24;
    
    items.forEach((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + (col * gapX);
      const y = startY + (row * gapY);
      
      // Item Card Background
      const cardBgId = this.generateId();
      elements[cardBgId] = {
        id: cardBgId,
        name: `${item.name} Card Background`,
        type: 'Image',
        background: { type: 'color', value: 'rgba(30, 41, 59, 0.9)' },
        x: x,
        y: y,
        width: cardWidth,
        height: cardHeight,
        anchorX: 0,
        anchorY: 0
      };
      
      // Item Name with count display
      const nameId = this.generateId();
      elements[nameId] = {
        id: nameId,
        name: `${item.name} Name`,
        type: 'Text',
        text: `${item.name} (x{${item.id}_count})`,
        font: {
          family: 'Poppins, sans-serif',
          size: 18,
          color: '#FFFFFF',
          weight: 'bold',
          italic: false
        },
        textAlign: 'center',
        verticalAlign: 'middle',
        x: x + cardWidth / 2,
        y: y + 2,
        width: cardWidth - 2,
        height: 5,
        anchorX: 0.5,
        anchorY: 0
      };
      
      // Item Description
      const descId = this.generateId();
      elements[descId] = {
        id: descId,
        name: `${item.name} Description`,
        type: 'Text',
        text: item.description || '',
        font: {
          family: 'Poppins, sans-serif',
          size: 14,
          color: '#C0B4D4',
          weight: 'normal',
          italic: false
        },
        textAlign: 'center',
        verticalAlign: 'middle',
        x: x + cardWidth / 2,
        y: y + 8,
        width: cardWidth - 4,
        height: 6,
        anchorX: 0.5,
        anchorY: 0
      };
      
      // Item Price
      const priceId = this.generateId();
      elements[priceId] = {
        id: priceId,
        name: `${item.name} Price`,
        type: 'Text',
        text: `${currencyIcon} ${item.price}`,
        font: {
          family: 'Poppins, sans-serif',
          size: 16,
          color: '#FFD700',
          weight: 'bold',
          italic: false
        },
        textAlign: 'center',
        verticalAlign: 'middle',
        x: x + cardWidth / 2,
        y: y + 14,
        width: cardWidth - 2,
        height: 4,
        anchorX: 0.5,
        anchorY: 0
      };
      
      // Purchase Button with SetVariable actions
      const buyBtnId = this.generateId();
      const buyButton = {
        id: buyBtnId,
        name: `Buy ${item.name} Button`,
        type: 'Button',
        text: 'Buy',
        font: {
          family: 'Poppins, sans-serif',
          size: 14,
          color: '#FFFFFF',
          weight: 'bold',
          italic: false
        },
        // Primary action: Subtract the price from currency
        action: {
          type: 'SetVariable',
          variableId: currencyVariableId,
          operator: 'subtract',
          value: item.price.toString()
        },
        // Additional action: Increment the item count
        actions: [
          {
            type: 'SetVariable',
            variableId: item.variableId!,
            operator: 'add',
            value: '1'
          }
        ],
        image: null,
        hoverImage: null,
        clickSoundId: null,
        hoverSoundId: null,
        x: x + cardWidth / 2,
        y: y + 18,
        width: 15,
        height: 4,
        anchorX: 0.5,
        anchorY: 0
      };
      
      elements[buyBtnId] = buyButton;
    });
    
    // 4. Close/Back Button
    const closeBtnId = this.generateId();
    elements[closeBtnId] = {
      id: closeBtnId,
      name: 'Close Button',
      type: 'Button',
      text: 'Close',
      font: {
        family: 'Poppins, sans-serif',
        size: 18,
        color: '#FFFFFF',
        weight: 'bold',
        italic: false
      },
      action: {
        type: 'ReturnToPreviousScreen'
      },
      actions: [],
      image: null,
      hoverImage: null,
      clickSoundId: null,
      hoverSoundId: null,
      x: 50,
      y: 92,
      width: 20,
      height: 6,
      anchorX: 0.5,
      anchorY: 0
    };
    
    // Create the screen
    return [{
      id: screenId,
      name: screenName,
      background: { type: 'color', value: config.backgroundColor || '#1a102c' },
      music: { audioId: null, policy: 'continue' },
      ambientNoise: { audioId: null, policy: 'continue' },
      elements: elements,
      transitionIn: 'fade',
      transitionOut: 'fade',
      transitionDuration: 300,
      showDialogue: false
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