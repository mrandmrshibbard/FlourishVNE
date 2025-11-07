/**
 * Template Instance Generator for FlourishVNE
 * 
 * Purpose: Generate actual project content from configured templates
 * Features: Screen generation, variable creation, project integration
 * 
 * User Story: US1 - Simplified Visual Novel Template Creation
 * Task: T028
 */

import { Template, TemplateConfig, TemplateInstance, TemplateGenerationResult } from '../../types/template';
import { VNUIScreen } from '../../features/ui/types';
import { VNVariable } from '../../features/variables/types';
import { VNID } from '../../types';
import { templateLibrary } from './TemplateLibrary';
import { TemplateValidator } from '../../utils/templateValidator';

/**
 * Generation options
 */
export interface GenerationOptions {
  validateBeforeGeneration?: boolean;
  trackUsage?: boolean;
  createBackup?: boolean;
  autoIntegrate?: boolean;
  generateIds?: boolean;
}

/**
 * Integration context for generated content
 */
export interface IntegrationContext {
  projectId: VNID;
  existingScreenIds: VNID[];
  existingVariableIds: VNID[];
  nameConflictResolution: 'skip' | 'rename' | 'overwrite';
}

/**
 * Template Generator Service
 */
export class TemplateGenerator {
  private validator: TemplateValidator;
  private generationHistory: Map<VNID, TemplateInstance> = new Map();

  constructor(validator?: TemplateValidator) {
    this.validator = validator || new TemplateValidator();
  }

  /**
   * Generate template instance from configuration
   */
  public async generateInstance(
    template: Template,
    config: TemplateConfig,
    projectId: VNID,
    options: GenerationOptions = {}
  ): Promise<TemplateGenerationResult> {
    const opts = {
      validateBeforeGeneration: true,
      trackUsage: true,
      createBackup: false,
      autoIntegrate: false,
      generateIds: true,
      ...options
    };

    const result: TemplateGenerationResult = {
      success: false,
      generatedScreens: [],
      generatedVariables: [],
      warnings: [],
      errors: []
    };

    try {
      // Step 1: Validation
      if (opts.validateBeforeGeneration) {
        const validation = await this.validator.validateConfiguration(template, config);
        
        if (!validation.valid) {
          result.errors.push(...validation.errors.map(e => e.message));
          return result;
        }
        
        if (validation.warnings.length > 0) {
          result.warnings.push(...validation.warnings.map(w => w.message));
        }
      }

      // Step 2: Pre-generate variables and inject their IDs into config
      // This ensures UI elements reference the correct variable IDs
      result.generatedVariables = this.generateVariablesFromConfig(config, template);
      
      // For Layered Character Creator, inject variable IDs back into config
      if (template.id === 'template-character-creator' && config.layers) {
        const layers = config.layers as Array<{name: string, order: number, variableId?: VNID}>;
        layers.forEach((layer, index) => {
          if (result.generatedVariables[index]) {
            layer.variableId = result.generatedVariables[index].id;
          }
        });
      }

      // Step 3: Generate UI screens (now with variable IDs in config)
      try {
        const screens = await Promise.resolve(template.uiGenerator(config));
        
        if (opts.generateIds) {
          screens.forEach(screen => {
            if (!screen.id) {
              screen.id = this.generateVNID();
            }
          });
        }
        
        result.generatedScreens = screens;
      } catch (error) {
        result.errors.push(`Screen generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return result;
      }

      // Step 4: Create instance record
      const instance: TemplateInstance = {
        id: this.generateVNID(),
        templateId: template.id,
        projectId,
        config,
        generatedUIScreens: result.generatedScreens.map(s => s.id),
        generatedVariables: result.generatedVariables.map(v => v.id),
        createdAt: new Date(),
        lastModified: new Date(),
        customizations: []
      };

      // Step 5: Track usage
      if (opts.trackUsage) {
        templateLibrary.trackUsage(template.id);
        this.generationHistory.set(instance.id, instance);
      }

      // Step 6: Performance estimation
      result.estimatedPerformance = {
        renderTime: this.estimateRenderTime(result.generatedScreens),
        memoryUsage: this.estimateMemoryUsage(result.generatedScreens, result.generatedVariables),
        variableCount: result.generatedVariables.length
      };

      result.success = true;
      
    } catch (error) {
      result.errors.push(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Generate and integrate template into project
   */
  public async generateAndIntegrate(
    template: Template,
    config: TemplateConfig,
    context: IntegrationContext,
    options: GenerationOptions = {}
  ): Promise<TemplateGenerationResult> {
    const result = await this.generateInstance(
      template,
      config,
      context.projectId,
      { ...options, autoIntegrate: true }
    );

    if (!result.success) {
      return result;
    }

    // Handle name conflicts
    result.generatedScreens = this.resolveScreenConflicts(
      result.generatedScreens,
      context.existingScreenIds,
      context.nameConflictResolution
    );

    result.generatedVariables = this.resolveVariableConflicts(
      result.generatedVariables,
      context.existingVariableIds,
      context.nameConflictResolution
    );

    return result;
  }

  /**
   * Batch generate multiple template instances
   */
  public async batchGenerate(
    templates: Array<{ template: Template; config: TemplateConfig }>,
    projectId: VNID,
    options: GenerationOptions = {}
  ): Promise<TemplateGenerationResult[]> {
    const results: TemplateGenerationResult[] = [];

    for (const { template, config } of templates) {
      const result = await this.generateInstance(template, config, projectId, options);
      results.push(result);
      
      // Stop on critical error if validation is enabled
      if (!result.success && options.validateBeforeGeneration) {
        break;
      }
    }

    return results;
  }

  /**
   * Regenerate instance with updated configuration
   */
  public async regenerateInstance(
    instanceId: VNID,
    newConfig: TemplateConfig,
    options: GenerationOptions = {}
  ): Promise<TemplateGenerationResult | null> {
    const instance = this.generationHistory.get(instanceId);
    if (!instance) {
      return null;
    }

    const template = templateLibrary.getTemplate(instance.templateId);
    if (!template) {
      return null;
    }

    const result = await this.generateInstance(
      template,
      newConfig,
      instance.projectId,
      options
    );

    if (result.success) {
      // Update instance record
      instance.config = newConfig;
      instance.generatedUIScreens = result.generatedScreens.map(s => s.id);
      instance.generatedVariables = result.generatedVariables.map(v => v.id);
      instance.lastModified = new Date();
    }

    return result;
  }

  /**
   * Get generation history
   */
  public getHistory(): TemplateInstance[] {
    return Array.from(this.generationHistory.values());
  }

  /**
   * Get instance by ID
   */
  public getInstance(instanceId: VNID): TemplateInstance | null {
    return this.generationHistory.get(instanceId) || null;
  }

  /**
   * Clear generation history
   */
  public clearHistory(): void {
    this.generationHistory.clear();
  }

  /**
   * Generate variables from template configuration
   */
  private generateVariablesFromConfig(config: TemplateConfig, template: Template): VNVariable[] {
    const variables: VNVariable[] = [];

    // Layered Character Creator variables
    if (template.id === 'template-character-creator') {
      const layers = config.layers as Array<{name: string, order: number}>;
      
      // Create a variable for each layer
      if (layers && Array.isArray(layers)) {
        layers.forEach((layer) => {
          variables.push({
            id: this.generateVNID(),
            name: `character_${layer.name.toLowerCase().replace(/\s+/g, '_')}`,
            type: 'string',
            defaultValue: ''
          });
        });
      }
      
      return variables;
    }

    // Shop System variables
    if (template.id === 'template-shop-screen') {
      const currencyName = config.currencyName as string || 'Gold';
      const items = config.items as Array<{id: string, name: string, price: number}> || [];
      
      // Create currency variable
      const currencyVarId = this.generateVNID();
      variables.push({
        id: currencyVarId,
        name: `player_${currencyName.toLowerCase()}`,
        type: 'number',
        defaultValue: 1000 // Starting currency amount
      });
      
      // Store currency variable ID in config for UI generator
      (config as any).currencyVariableId = currencyVarId;
      
      // Create item count variables and inject IDs into items
      items.forEach(item => {
        const itemVarId = this.generateVNID();
        variables.push({
          id: itemVarId,
          name: `${item.id}_count`,
          type: 'number',
          defaultValue: 0
        });
        
        // Inject variable ID into item config
        (item as any).variableId = itemVarId;
      });
      
      return variables;
    }

    // Generate variables for characters
    if (config.characters && Array.isArray(config.characters)) {
      config.characters.forEach((char, index) => {
        variables.push({
          id: this.generateVNID(),
          name: `${char.id}_selected`,
          type: 'boolean',
          defaultValue: false
        });
      });
    }

    // Generate variables for items
    if (config.items && Array.isArray(config.items)) {
      config.items.forEach((item, index) => {
        variables.push({
          id: this.generateVNID(),
          name: `${item.id}_owned`,
          type: 'boolean',
          defaultValue: false
        });
      });
    }

    // Generate variables for stats
    if (config.stats && Array.isArray(config.stats)) {
      config.stats.forEach((stat, index) => {
        variables.push({
          id: this.generateVNID(),
          name: stat.id,
          type: 'number',
          defaultValue: stat.initialValue
        });
      });
    }

    return variables;
  }

  /**
   * Resolve screen name conflicts
   */
  private resolveScreenConflicts(
    screens: VNUIScreen[],
    existingIds: VNID[],
    resolution: 'skip' | 'rename' | 'overwrite'
  ): VNUIScreen[] {
    if (resolution === 'overwrite') {
      return screens;
    }

    const existingIdSet = new Set(existingIds);
    
    return screens.map(screen => {
      if (existingIdSet.has(screen.id)) {
        if (resolution === 'skip') {
          // Mark for skipping (caller handles this)
          return { ...screen, id: '' as VNID };
        } else if (resolution === 'rename') {
          // Generate new unique ID
          let newId = screen.id;
          let counter = 1;
          while (existingIdSet.has(newId)) {
            newId = `${screen.id}_${counter}` as VNID;
            counter++;
          }
          return { ...screen, id: newId };
        }
      }
      return screen;
    }).filter(screen => screen.id !== '');
  }

  /**
   * Resolve variable name conflicts
   */
  private resolveVariableConflicts(
    variables: VNVariable[],
    existingIds: VNID[],
    resolution: 'skip' | 'rename' | 'overwrite'
  ): VNVariable[] {
    if (resolution === 'overwrite') {
      return variables;
    }

    const existingIdSet = new Set(existingIds);
    
    return variables.map(variable => {
      if (existingIdSet.has(variable.id)) {
        if (resolution === 'skip') {
          return { ...variable, id: '' as VNID };
        } else if (resolution === 'rename') {
          let newId = variable.id;
          let counter = 1;
          while (existingIdSet.has(newId)) {
            newId = `${variable.id}_${counter}` as VNID;
            counter++;
          }
          return { ...variable, id: newId };
        }
      }
      return variable;
    }).filter(variable => variable.id !== '');
  }

  /**
   * Estimate render time for screens
   */
  private estimateRenderTime(screens: VNUIScreen[]): number {
    // Simple heuristic: base time + element count * complexity factor
    const baseTime = 16; // 16ms baseline (60fps)
    const elementComplexity = 0.5; // 0.5ms per element
    
    return screens.reduce((total, screen) => {
      const elementCount = Object.keys(screen.elements).length;
      return total + baseTime + (elementCount * elementComplexity);
    }, 0);
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(screens: VNUIScreen[], variables: VNVariable[]): number {
    // Rough estimates in KB
    const screenMemory = screens.length * 10; // ~10KB per screen
    const variableMemory = variables.length * 0.1; // ~100 bytes per variable
    const baseOverhead = 50; // 50KB base overhead
    
    return screenMemory + variableMemory + baseOverhead;
  }

  /**
   * Generate unique VNID
   */
  private generateVNID(): VNID {
    return `vnid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` as VNID;
  }
}

/**
 * Singleton instance
 */
export const templateGenerator = new TemplateGenerator();

/**
 * Helper functions
 */
export const TemplateGeneratorHelpers = {
  /**
   * Quick generate helper
   */
  async quickGenerate(
    template: Template,
    config: TemplateConfig,
    projectId: VNID
  ): Promise<TemplateGenerationResult> {
    return templateGenerator.generateInstance(template, config, projectId, {
      validateBeforeGeneration: true,
      trackUsage: true
    });
  },

  /**
   * Validate before generation helper
   */
  async validateAndGenerate(
    template: Template,
    config: TemplateConfig,
    projectId: VNID
  ): Promise<TemplateGenerationResult> {
    return templateGenerator.generateInstance(template, config, projectId, {
      validateBeforeGeneration: true,
      trackUsage: true,
      generateIds: true
    });
  },

  /**
   * Get generation statistics
   */
  getGenerationStats(): {
    totalInstances: number;
    totalScreens: number;
    totalVariables: number;
  } {
    const instances = templateGenerator.getHistory();
    
    return {
      totalInstances: instances.length,
      totalScreens: instances.reduce((sum, inst) => sum + inst.generatedUIScreens.length, 0),
      totalVariables: instances.reduce((sum, inst) => sum + inst.generatedVariables.length, 0)
    };
  }
};

export default templateGenerator;
