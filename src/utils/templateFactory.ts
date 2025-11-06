/**
 * Template Factory for FlourishVNE
 * 
 * Purpose: Utilities for generating project components from Template definitions
 * 
 * Features:
 * - Template configuration validation against JSON schemas
 * - Variable generation from templates
 * - Logic workflow generation for template validations
 * - Asset reference extraction
 * - Template caching for performance (<100ms simple, <500ms complex)
 * 
 * Note: Component generation uses Template.uiGenerator function
 */

import { VNID } from '../types';
import { Template, TemplateConfig, TemplateCategory } from '../types/template';
import { VNUIScreen } from '../features/ui/types';
import { EnhancedVariable, VariableScope, VariableCategory, EnhancedVariableType } from '../types/enhanced-variables';
import { LogicNode, LogicNodeType, LogicConnection } from '../types/logic';

/**
 * Template generation context
 */
export interface GenerationContext {
  projectId: VNID;
  sceneId?: VNID;
  namespace?: string;
  existingVariables: Map<string, VNID>;
  existingComponents: Map<string, VNID>;
}

/**
 * Generation result
 */
export interface GenerationResult {
  success: boolean;
  components: VNUIScreen[];
  variables: EnhancedVariable[];
  logicNodes: LogicNode[];
  connections: LogicConnection[];
  assetReferences: AssetReference[];
  errors: GenerationError[];
  warnings: string[];
  metadata: GenerationMetadata;
}

export interface AssetReference {
  id: VNID;
  path: string;
  type: 'image' | 'audio' | 'video' | 'font';
  usedBy: VNID[];
  isRequired: boolean;
}

export interface GenerationError {
  severity: 'error' | 'warning';
  message: string;
  parameter?: string;
  suggestedFix?: string;
  code: string;
}

export interface GenerationMetadata {
  templateId: VNID;
  templateName: string;
  generatedAt: Date;
  generationTime: number;
  componentCount: number;
  variableCount: number;
  logicNodeCount: number;
  complexity: 'simple' | 'moderate' | 'complex';
}

/**
 * Component generation options
 */
export interface ComponentGenerationOptions {
  prefix?: string;
  validation?: 'none' | 'basic' | 'strict';
  cacheResults?: boolean;
}

/**
 * Template Factory
 * 
 * Provides utilities for working with templates
 */
export class TemplateFactory {
  private generationCache: Map<string, GenerationResult> = new Map();
  private variableIdCounter: number = 0;
  private logicNodeIdCounter: number = 0;

  /**
   * Generate components from a template
   */
  async generateFromTemplate(
    template: Template,
    configuration: TemplateConfig,
    context: GenerationContext,
    options: ComponentGenerationOptions = {}
  ): Promise<GenerationResult> {
    const startTime = performance.now();
    const errors: GenerationError[] = [];
    const warnings: string[] = [];

    // Check cache
    const cacheKey = this.getCacheKey(template.id, configuration);
    if (options.cacheResults !== false && this.generationCache.has(cacheKey)) {
      return this.generationCache.get(cacheKey)!;
    }

    // Validate configuration against template schema
    const validationErrors = this.validateConfiguration(template, configuration);
    if (validationErrors.length > 0 && options.validation === 'strict') {
      return this.createErrorResult(template, startTime, validationErrors);
    }
    errors.push(...validationErrors.filter(e => e.severity === 'error'));
    warnings.push(...validationErrors.filter(e => e.severity === 'warning').map(e => e.message));

    // Use template's uiGenerator function to create components
    let components: VNUIScreen[] = [];
    try {
      components = template.uiGenerator(configuration);
    } catch (error) {
      errors.push({
        severity: 'error',
        message: `Failed to generate components: ${error instanceof Error ? error.message : String(error)}`,
        code: 'GENERATION_FAILED'
      });
      return this.createErrorResult(template, startTime, errors);
    }
    
    // Generate variables for template category
    const variables = this.generateVariables(template, configuration, context);
    
    // Generate validation logic nodes
    const { nodes, connections } = this.generateValidationLogic(template, configuration, context);
    
    // Collect asset references from components
    const assetReferences = this.collectAssetReferences(components);

    const generationTime = performance.now() - startTime;
    const result: GenerationResult = {
      success: errors.length === 0,
      components,
      variables,
      logicNodes: nodes,
      connections,
      assetReferences,
      errors,
      warnings,
      metadata: {
        templateId: template.id,
        templateName: template.name,
        generatedAt: new Date(),
        generationTime,
        componentCount: components.length,
        variableCount: variables.length,
        logicNodeCount: nodes.length,
        complexity: this.estimateComplexity(components, variables, nodes)
      }
    };

    // Cache successful results under threshold
    if (result.success && generationTime < 1000 && options.cacheResults !== false) {
      this.generationCache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Validate configuration against template schema
   */
  private validateConfiguration(template: Template, configuration: TemplateConfig): GenerationError[] {
    const errors: GenerationError[] = [];
    const schema = template.configSchema;

    // Basic schema validation
    if (schema.required) {
      for (const requiredProp of schema.required) {
        if (!(requiredProp in configuration)) {
          errors.push({
            severity: 'error',
            message: `Required property '${requiredProp}' is missing`,
            parameter: requiredProp,
            suggestedFix: `Add '${requiredProp}' to configuration`,
            code: 'MISSING_REQUIRED'
          });
        }
      }
    }

    // Type validation for properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in configuration) {
          const value = configuration[key];
          const expectedType = (propSchema as any).type;
          const actualType = Array.isArray(value) ? 'array' : typeof value;

          if (expectedType && actualType !== expectedType) {
            errors.push({
              severity: 'error',
              message: `Property '${key}' must be of type '${expectedType}', got '${actualType}'`,
              parameter: key,
              code: 'TYPE_MISMATCH'
            });
          }
        }
      }
    }

    // Check customization bounds
    this.validateCustomizationBounds(template, configuration, errors);

    return errors;
  }

  /**
   * Validate against customization bounds
   */
  private validateCustomizationBounds(
    template: Template,
    configuration: TemplateConfig,
    errors: GenerationError[]
  ): void {
    const bounds = template.customizationLimits;

    if (bounds.maxCharacters && configuration.characters) {
      const charCount = Array.isArray(configuration.characters) ? configuration.characters.length : 0;
      if (charCount > bounds.maxCharacters) {
        errors.push({
          severity: 'warning',
          message: `Character count (${charCount}) exceeds recommended limit (${bounds.maxCharacters})`,
          parameter: 'characters',
          code: 'EXCEEDS_LIMIT'
        });
      }
    }

    if (bounds.maxItems && configuration.items) {
      const itemCount = Array.isArray(configuration.items) ? configuration.items.length : 0;
      if (itemCount > bounds.maxItems) {
        errors.push({
          severity: 'warning',
          message: `Item count (${itemCount}) exceeds recommended limit (${bounds.maxItems})`,
          parameter: 'items',
          code: 'EXCEEDS_LIMIT'
        });
      }
    }

    if (bounds.maxStats && configuration.stats) {
      const statCount = Array.isArray(configuration.stats) ? configuration.stats.length : 0;
      if (statCount > bounds.maxStats) {
        errors.push({
          severity: 'warning',
          message: `Stat count (${statCount}) exceeds recommended limit (${bounds.maxStats})`,
          parameter: 'stats',
          code: 'EXCEEDS_LIMIT'
        });
      }
    }
  }

  /**
   * Generate variables for template
   */
  private generateVariables(
    template: Template,
    configuration: TemplateConfig,
    context: GenerationContext
  ): EnhancedVariable[] {
    const variables: EnhancedVariable[] = [];
    const namespace = context.namespace || template.name.toLowerCase().replace(/\s+/g, '_');

    // Generate category-specific variables
    switch (template.category) {
      case 'character-creation':
        variables.push(...this.generateCharacterVariables(configuration, namespace));
        break;
      case 'inventory':
        variables.push(...this.generateInventoryVariables(configuration, namespace));
        break;
      case 'stat-tracker':
        variables.push(...this.generateStatVariables(configuration, namespace));
        break;
      case 'shop-system':
        variables.push(...this.generateShopVariables(configuration, namespace));
        break;
    }

    return variables;
  }

  /**
   * Generate character-related variables
   */
  private generateCharacterVariables(configuration: TemplateConfig, namespace: string): EnhancedVariable[] {
    const variables: EnhancedVariable[] = [];

    variables.push(this.createVariable({
      name: `${namespace}_character_name`,
      type: 'string',
      defaultValue: '',
      scope: 'global',
      category: 'character-stats',
      description: 'Character name from creation screen'
    }));

    // Appearance variables
    if (configuration.characters) {
      const chars = configuration.characters as any[];
      for (let i = 0; i < chars.length; i++) {
        variables.push(this.createVariable({
          name: `${namespace}_char_${i}_appearance`,
          type: 'object',
          defaultValue: {},
          scope: 'global',
          category: 'character-stats',
          description: `Appearance data for character ${i}`
        }));
      }
    }

    return variables;
  }

  /**
   * Generate inventory variables
   */
  private generateInventoryVariables(configuration: TemplateConfig, namespace: string): EnhancedVariable[] {
    const variables: EnhancedVariable[] = [];

    variables.push(this.createVariable({
      name: `${namespace}_inventory_items`,
      type: 'array',
      defaultValue: [],
      scope: 'global',
      category: 'inventory',
      description: 'Player inventory items'
    }));

    variables.push(this.createVariable({
      name: `${namespace}_selected_item_id`,
      type: 'string',
      defaultValue: '',
      scope: 'temporary',
      category: 'inventory',
      description: 'Currently selected item ID'
    }));

    return variables;
  }

  /**
   * Generate stat tracking variables
   */
  private generateStatVariables(configuration: TemplateConfig, namespace: string): EnhancedVariable[] {
    const variables: EnhancedVariable[] = [];

    if (configuration.stats) {
      const stats = configuration.stats as any[];
      for (const stat of stats) {
        variables.push(this.createVariable({
          name: `${namespace}_stat_${stat.name || stat.id}`,
          type: 'number',
          defaultValue: stat.defaultValue || 0,
          scope: 'global',
          category: 'character-stats',
          description: stat.description || `Stat: ${stat.name}`
        }));
      }
    }

    return variables;
  }

  /**
   * Generate shop system variables
   */
  private generateShopVariables(configuration: TemplateConfig, namespace: string): EnhancedVariable[] {
    const variables: EnhancedVariable[] = [];

    variables.push(this.createVariable({
      name: `${namespace}_player_currency`,
      type: 'number',
      defaultValue: configuration.startingCurrency || 0,
      scope: 'global',
      category: 'inventory',
      description: 'Player currency amount'
    }));

    variables.push(this.createVariable({
      name: `${namespace}_shop_items`,
      type: 'array',
      defaultValue: configuration.items || [],
      scope: 'global',
      category: 'inventory',
      description: 'Available shop items'
    }));

    return variables;
  }

  /**
   * Generate validation logic nodes
   */
  private generateValidationLogic(
    template: Template,
    configuration: TemplateConfig,
    context: GenerationContext
  ): { nodes: LogicNode[]; connections: LogicConnection[] } {
    const nodes: LogicNode[] = [];
    const connections: LogicConnection[] = [];

    // Generate category-specific validation logic
    switch (template.category) {
      case 'character-creation':
        const charLogic = this.generateCharacterValidationLogic(configuration, context);
        nodes.push(...charLogic.nodes);
        connections.push(...charLogic.connections);
        break;
      case 'shop-system':
        const shopLogic = this.generateShopValidationLogic(configuration, context);
        nodes.push(...shopLogic.nodes);
        connections.push(...shopLogic.connections);
        break;
    }

    return { nodes, connections };
  }

  /**
   * Generate character creation validation logic
   */
  private generateCharacterValidationLogic(
    configuration: TemplateConfig,
    context: GenerationContext
  ): { nodes: LogicNode[]; connections: LogicConnection[] } {
    const nodes: LogicNode[] = [];
    const connections: LogicConnection[] = [];

    // Name validation node
    const now = new Date();
    const validateNameNode: LogicNode = {
      id: this.generateLogicNodeId(),
      type: 'condition',
      position: { x: 100, y: 100 },
      appearance: { width: 200, height: 80, color: '#4CAF50', icon: 'check-circle' },
      label: 'Validate Character Name',
      description: 'Ensure character name is not empty',
      inputPorts: [],
      outputPorts: [],
      config: {
        condition: 'character_name.length > 0'
      },
      validation: {
        isValid: true,
        errors: [],
        warnings: [],
        lastValidated: now
      },
      isEnabled: true,
      createdAt: now,
      lastModified: now
    };
    nodes.push(validateNameNode);

    return { nodes, connections };
  }

  /**
   * Generate shop validation logic
   */
  private generateShopValidationLogic(
    configuration: TemplateConfig,
    context: GenerationContext
  ): { nodes: LogicNode[]; connections: LogicConnection[] } {
    const nodes: LogicNode[] = [];
    const connections: LogicConnection[] = [];

    // Currency check node
    const now = new Date();
    const checkCurrencyNode: LogicNode = {
      id: this.generateLogicNodeId(),
      type: 'variable-check',
      position: { x: 100, y: 100 },
      appearance: { width: 200, height: 80, color: '#FFC107', icon: 'dollar-sign' },
      label: 'Check Sufficient Currency',
      description: 'Verify player has enough currency',
      inputPorts: [],
      outputPorts: [],
      config: {
        variableId: 'player_currency',
        operator: '>=',
        compareValue: 'item_price'
      },
      validation: {
        isValid: true,
        errors: [],
        warnings: [],
        lastValidated: now
      },
      isEnabled: true,
      createdAt: now,
      lastModified: now
    };
    nodes.push(checkCurrencyNode);

    return { nodes, connections };
  }

  /**
   * Collect asset references from components
   */
  private collectAssetReferences(components: VNUIScreen[]): AssetReference[] {
    const references: AssetReference[] = [];
    const assetMap = new Map<string, AssetReference>();

    for (const component of components) {
      // Background assets
      if (component.background.type !== 'color') {
        const assetId = component.background.assetId;
        if (assetId) {
          this.addAssetReference(assetMap, {
            id: assetId,
            path: '', // Would be looked up from asset manager
            type: component.background.type === 'video' ? 'video' : 'image',
            usedBy: [component.id],
            isRequired: true
          });
        }
      }

      // Music assets
      if (component.music.audioId) {
        this.addAssetReference(assetMap, {
          id: component.music.audioId,
          path: '',
          type: 'audio',
          usedBy: [component.id],
          isRequired: false
        });
      }

      // Ambient noise assets
      if (component.ambientNoise.audioId) {
        this.addAssetReference(assetMap, {
          id: component.ambientNoise.audioId,
          path: '',
          type: 'audio',
          usedBy: [component.id],
          isRequired: false
        });
      }
    }

    return Array.from(assetMap.values());
  }

  /**
   * Add or update asset reference
   */
  private addAssetReference(map: Map<string, AssetReference>, ref: AssetReference): void {
    if (map.has(ref.id)) {
      const existing = map.get(ref.id)!;
      existing.usedBy.push(...ref.usedBy);
    } else {
      map.set(ref.id, ref);
    }
  }

  /**
   * Helper: Create variable
   */
  private createVariable(config: {
    name: string;
    type: EnhancedVariableType;
    defaultValue: any;
    scope: VariableScope;
    category: VariableCategory;
    description?: string;
  }): EnhancedVariable {
    const now = new Date();
    
    return {
      id: this.generateVariableId(),
      name: config.name,
      type: this.mapEnhancedTypeToVNType(config.type),
      defaultValue: config.defaultValue,
      enhancedType: config.type,
      category: config.category,
      scope: config.scope,
      description: config.description || '',
      tags: [],
      validation: {
        rules: [],
        isValid: true,
        errors: [],
        warnings: [],
        lastValidated: now
      },
      constraints: {
        required: false,
        unique: false,
        immutable: false
      },
      persistence: 'session',
      isReadOnly: false,
      isSystem: false,
      dependencies: [],
      dependents: [],
      relationships: [],
      usage: {
        readCount: 0,
        writeCount: 0,
        lastRead: now,
        lastWrite: now,
        accessLocations: [],
        hotspots: []
      },
      performance: {
        evaluationTime: 0,
        memoryUsage: 0,
        updateFrequency: 0,
        dependencyDepth: 0,
        optimizationScore: 100,
        bottleneckRisk: 'low'
      },
      history: [],
      lastModified: now,
      lastAccessed: now,
      createdAt: now,
      modificationCount: 0,
      displayOptions: {
        showInDebugger: true,
        debuggerFormat: 'formatted',
        inspectorVisible: false,
        inspectorOrder: 0
      },
      version: 1,
      canRollback: false
    };
  }

  /**
   * Map EnhancedVariableType to base VNVariableType
   */
  private mapEnhancedTypeToVNType(enhancedType: EnhancedVariableType): 'string' | 'number' | 'boolean' {
    switch (enhancedType) {
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      default:
        return 'string';
    }
  }

  /**
   * Helper: Generate cache key
   */
  private getCacheKey(templateId: VNID, configuration: TemplateConfig): string {
    return `${templateId}_${JSON.stringify(configuration)}`;
  }

  /**
   * Helper: Generate variable ID
   */
  private generateVariableId(): VNID {
    return `var_${++this.variableIdCounter}_${Date.now()}`;
  }

  /**
   * Helper: Generate logic node ID
   */
  private generateLogicNodeId(): VNID {
    return `logic_${++this.logicNodeIdCounter}_${Date.now()}`;
  }

  /**
   * Helper: Estimate complexity
   */
  private estimateComplexity(
    components: VNUIScreen[],
    variables: EnhancedVariable[],
    logicNodes: LogicNode[]
  ): 'simple' | 'moderate' | 'complex' {
    const score = components.length * 5 + variables.length * 2 + logicNodes.length * 3;

    if (score < 20) return 'simple';
    if (score < 50) return 'moderate';
    return 'complex';
  }

  /**
   * Helper: Create error result
   */
  private createErrorResult(
    template: Template,
    startTime: number,
    errors: GenerationError[]
  ): GenerationResult {
    return {
      success: false,
      components: [],
      variables: [],
      logicNodes: [],
      connections: [],
      assetReferences: [],
      errors,
      warnings: [],
      metadata: {
        templateId: template.id,
        templateName: template.name,
        generatedAt: new Date(),
        generationTime: performance.now() - startTime,
        componentCount: 0,
        variableCount: 0,
        logicNodeCount: 0,
        complexity: 'simple'
      }
    };
  }

  /**
   * Clear generation cache
   */
  clearCache(): void {
    this.generationCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number } {
    return {
      size: this.generationCache.size
    };
  }
}

/**
 * Export singleton instance
 */
export const templateFactory = new TemplateFactory();
