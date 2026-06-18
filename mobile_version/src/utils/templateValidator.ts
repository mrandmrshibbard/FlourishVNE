import { VNID } from '../types';
import {
  Template,
  TemplateConfig,
  TemplateInstance,
  JSONSchema,
  CustomizationBounds
} from '../types/template';

/**
 * Template Configuration Schema Validator
 * 
 * Production-ready validator for template configurations, ensuring templates
 * are properly structured and configurations meet schema requirements.
 * 
 * Features:
 * - JSON Schema validation
 * - Customization bounds enforcement
 * - Configuration completeness checking
 * - Type safety validation
 * - Template structure validation
 * - Performance-optimized validation caching
 */

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  info: ValidationInfo[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  path?: string;
  severity: 'critical' | 'error';
  fix?: {
    description: string;
    autoFixable: boolean;
    suggestedValue?: any;
  };
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  suggestion?: string;
}

export interface ValidationInfo {
  code: string;
  message: string;
  field?: string;
}

export interface ValidationOptions {
  strict: boolean;
  checkBounds: boolean;
  checkSchema: boolean;
  allowExtraProperties: boolean;
  validateNested: boolean;
}

export interface CustomValidator {
  name: string;
  category?: string;
  validate: (template: Template, config: TemplateConfig) => Promise<ValidationResult>;
  priority: number;
}

/**
 * Template Validator Service
 */
export class TemplateValidator {
  private customValidators: CustomValidator[] = [];
  private validationCache = new Map<string, ValidationResult>();
  private defaultOptions: ValidationOptions = {
    strict: true,
    checkBounds: true,
    checkSchema: true,
    allowExtraProperties: false,
    validateNested: true
  };

  constructor() {
    // Ready for use
  }

  /**
   * Validate a template definition
   */
  public async validateTemplate(template: Template, options?: Partial<ValidationOptions>): Promise<ValidationResult> {
    const opts = { ...this.defaultOptions, ...options };
    const result: ValidationResult = { valid: true, errors: [], warnings: [], info: [] };

    // Validate required fields
    if (!template.id) {
      result.errors.push({
        code: 'MISSING_TEMPLATE_ID',
        message: 'Template must have an id',
        severity: 'critical'
      });
    }

    if (!template.name || template.name.trim() === '') {
      result.errors.push({
        code: 'MISSING_TEMPLATE_NAME',
        message: 'Template must have a name',
        severity: 'error'
      });
    }

    if (!template.description || template.description.trim() === '') {
      result.warnings.push({
        code: 'MISSING_DESCRIPTION',
        message: 'Template should have a description',
        suggestion: 'Add a clear description to help users understand the template'
      });
    }

    if (!template.category) {
      result.errors.push({
        code: 'MISSING_CATEGORY',
        message: 'Template must have a category',
        severity: 'error'
      });
    }

    // Validate JSON schema
    if (opts.checkSchema) {
      const schemaResult = this.validateJSONSchema(template.configSchema);
      result.errors.push(...schemaResult.errors);
      result.warnings.push(...schemaResult.warnings);
    }

    // Validate default configuration
    if (template.defaultConfig) {
      const configResult = await this.validateConfiguration(template, template.defaultConfig, opts);
      result.errors.push(...configResult.errors);
      result.warnings.push(...configResult.warnings);
    } else {
      result.warnings.push({
        code: 'NO_DEFAULT_CONFIG',
        message: 'Template should have a default configuration',
        suggestion: 'Provide sensible defaults for better user experience'
      });
    }

    // Validate customization limits
    if (opts.checkBounds && template.customizationLimits) {
      const boundsResult = this.validateCustomizationBounds(template.customizationLimits);
      result.errors.push(...boundsResult.errors);
      result.warnings.push(...boundsResult.warnings);
    }

    // Validate UI generator exists
    if (typeof template.uiGenerator !== 'function') {
      result.errors.push({
        code: 'MISSING_UI_GENERATOR',
        message: 'Template must have a uiGenerator function',
        severity: 'critical'
      });
    }

    // Validate version
    if (!template.version || !this.isValidVersion(template.version)) {
      result.warnings.push({
        code: 'INVALID_VERSION',
        message: 'Template should have a valid semantic version',
        suggestion: 'Use format: major.minor.patch (e.g., 1.0.0)'
      });
    }

    // Validate tags
    if (!template.tags || template.tags.length === 0) {
      result.info.push({
        code: 'NO_TAGS',
        message: 'Template has no tags for discoverability'
      });
    }

    // Run custom validators
    for (const validator of this.customValidators) {
      try {
        const customResult = await validator.validate(template, template.defaultConfig);
        result.errors.push(...customResult.errors);
        result.warnings.push(...customResult.warnings);
        result.info.push(...customResult.info);
      } catch (error) {
        result.warnings.push({
          code: 'CUSTOM_VALIDATOR_ERROR',
          message: `Custom validator '${validator.name}' failed: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }

    result.valid = result.errors.length === 0;
    return result;
  }

  /**
   * Validate a template configuration against template schema
   */
  public async validateConfiguration(
    template: Template,
    config: TemplateConfig,
    options?: Partial<ValidationOptions>
  ): Promise<ValidationResult> {
    const opts = { ...this.defaultOptions, ...options };
    const result: ValidationResult = { valid: true, errors: [], warnings: [], info: [] };

    // Check cache
    const cacheKey = `${template.id}_${JSON.stringify(config)}`;
    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey)!;
    }

    // Validate against JSON schema
    if (opts.checkSchema && template.configSchema) {
      const schemaResult = this.validateAgainstSchema(config, template.configSchema);
      result.errors.push(...schemaResult.errors);
      result.warnings.push(...schemaResult.warnings);
    }

    // Validate customization bounds
    if (opts.checkBounds && template.customizationLimits) {
      const boundsResult = this.validateAgainstBounds(config, template.customizationLimits);
      result.errors.push(...boundsResult.errors);
      result.warnings.push(...boundsResult.warnings);
    }

    // Validate characters
    if (config.characters) {
      if (!Array.isArray(config.characters)) {
        result.errors.push({
          code: 'INVALID_CHARACTERS_TYPE',
          message: 'Characters must be an array',
          field: 'characters',
          severity: 'error'
        });
      } else {
        config.characters.forEach((char, index) => {
          if (!char.id || !char.name) {
            result.errors.push({
              code: 'INVALID_CHARACTER',
              message: `Character at index ${index} must have id and name`,
              field: `characters[${index}]`,
              severity: 'error'
            });
          }
        });

        // Check max characters
        if (template.customizationLimits.maxCharacters &&
            config.characters.length > template.customizationLimits.maxCharacters) {
          result.errors.push({
            code: 'TOO_MANY_CHARACTERS',
            message: `Too many characters (${config.characters.length}), maximum is ${template.customizationLimits.maxCharacters}`,
            field: 'characters',
            severity: 'error'
          });
        }
      }
    }

    // Validate items
    if (config.items) {
      if (!Array.isArray(config.items)) {
        result.errors.push({
          code: 'INVALID_ITEMS_TYPE',
          message: 'Items must be an array',
          field: 'items',
          severity: 'error'
        });
      } else {
        config.items.forEach((item, index) => {
          if (!item.id || !item.name || !item.category) {
            result.errors.push({
              code: 'INVALID_ITEM',
              message: `Item at index ${index} must have id, name, and category`,
              field: `items[${index}]`,
              severity: 'error'
            });
          }
        });

        // Check max items
        if (template.customizationLimits.maxItems &&
            config.items.length > template.customizationLimits.maxItems) {
          result.errors.push({
            code: 'TOO_MANY_ITEMS',
            message: `Too many items (${config.items.length}), maximum is ${template.customizationLimits.maxItems}`,
            field: 'items',
            severity: 'error'
          });
        }
      }
    }

    // Validate stats
    if (config.stats) {
      if (!Array.isArray(config.stats)) {
        result.errors.push({
          code: 'INVALID_STATS_TYPE',
          message: 'Stats must be an array',
          field: 'stats',
          severity: 'error'
        });
      } else {
        config.stats.forEach((stat, index) => {
          if (!stat.id || !stat.name || typeof stat.initialValue !== 'number') {
            result.errors.push({
              code: 'INVALID_STAT',
              message: `Stat at index ${index} must have id, name, and initialValue`,
              field: `stats[${index}]`,
              severity: 'error'
            });
          }

          if (stat.minValue !== undefined && stat.maxValue !== undefined && stat.minValue > stat.maxValue) {
            result.errors.push({
              code: 'INVALID_STAT_RANGE',
              message: `Stat '${stat.name}' has minValue > maxValue`,
              field: `stats[${index}]`,
              severity: 'error'
            });
          }
        });

        // Check max stats
        if (template.customizationLimits.maxStats &&
            config.stats.length > template.customizationLimits.maxStats) {
          result.errors.push({
            code: 'TOO_MANY_STATS',
            message: `Too many stats (${config.stats.length}), maximum is ${template.customizationLimits.maxStats}`,
            field: 'stats',
            severity: 'error'
          });
        }
      }
    }

    // Validate colors
    if (config.colors) {
      const colorFields = ['primary', 'secondary', 'accent', 'background', 'text'];
      for (const field of colorFields) {
        const color = (config.colors as any)[field];
        if (color && !this.isValidColor(color)) {
          result.warnings.push({
            code: 'INVALID_COLOR_FORMAT',
            message: `Invalid color format for ${field}: ${color}`,
            field: `colors.${field}`,
            suggestion: 'Use hex (#RRGGBB) or rgb/rgba format'
          });
        }
      }
    }

    result.valid = result.errors.length === 0;

    // Cache result
    this.validationCache.set(cacheKey, result);

    return result;
  }

  /**
   * Validate a template instance
   */
  public async validateInstance(
    template: Template,
    instance: TemplateInstance,
    options?: Partial<ValidationOptions>
  ): Promise<ValidationResult> {
    const result: ValidationResult = { valid: true, errors: [], warnings: [], info: [] };

    // Validate instance structure
    if (!instance.id) {
      result.errors.push({
        code: 'MISSING_INSTANCE_ID',
        message: 'Template instance must have an id',
        severity: 'critical'
      });
    }

    if (instance.templateId !== template.id) {
      result.errors.push({
        code: 'TEMPLATE_MISMATCH',
        message: 'Instance templateId does not match template id',
        severity: 'error'
      });
    }

    // Validate configuration
    const configResult = await this.validateConfiguration(template, instance.config, options);
    result.errors.push(...configResult.errors);
    result.warnings.push(...configResult.warnings);
    result.info.push(...configResult.info);

    // Validate generated content exists
    if (!instance.generatedUIScreens || instance.generatedUIScreens.length === 0) {
      result.warnings.push({
        code: 'NO_GENERATED_SCREENS',
        message: 'Template instance has no generated UI screens',
        suggestion: 'Regenerate template content'
      });
    }

    result.valid = result.errors.length === 0;
    return result;
  }

  /**
   * Validate JSON schema structure
   */
  private validateJSONSchema(schema: JSONSchema): ValidationResult {
    const result: ValidationResult = { valid: true, errors: [], warnings: [], info: [] };

    if (!schema) {
      result.errors.push({
        code: 'MISSING_SCHEMA',
        message: 'Template must have a configuration schema',
        severity: 'error'
      });
      return result;
    }

    if (!schema.type) {
      result.errors.push({
        code: 'MISSING_SCHEMA_TYPE',
        message: 'JSON schema must have a type',
        severity: 'error'
      });
    }

    if (!schema.properties) {
      result.warnings.push({
        code: 'NO_SCHEMA_PROPERTIES',
        message: 'JSON schema has no properties defined',
        suggestion: 'Define schema properties for configuration validation'
      });
    }

    return result;
  }

  /**
   * Validate configuration against JSON schema
   */
  private validateAgainstSchema(config: TemplateConfig, schema: JSONSchema): ValidationResult {
    const result: ValidationResult = { valid: true, errors: [], warnings: [], info: [] };

    // Check required properties
    if (schema.required) {
      for (const requiredProp of schema.required) {
        if (!(requiredProp in config)) {
          result.errors.push({
            code: 'MISSING_REQUIRED_PROPERTY',
            message: `Required property '${requiredProp}' is missing`,
            field: requiredProp,
            severity: 'error'
          });
        }
      }
    }

    // Check property types (basic validation)
    if (schema.properties) {
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        const value = (config as any)[prop];
        if (value !== undefined && propSchema.type) {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (propSchema.type !== actualType) {
            result.errors.push({
              code: 'TYPE_MISMATCH',
              message: `Property '${prop}' should be ${propSchema.type}, got ${actualType}`,
              field: prop,
              severity: 'error'
            });
          }
        }
      }
    }

    return result;
  }

  /**
   * Validate customization bounds structure
   */
  private validateCustomizationBounds(bounds: CustomizationBounds): ValidationResult {
    const result: ValidationResult = { valid: true, errors: [], warnings: [], info: [] };

    // Check numeric bounds are positive
    const numericBounds = ['maxCharacters', 'maxItems', 'maxStats'] as const;
    for (const bound of numericBounds) {
      const value = bounds[bound];
      if (value !== undefined && (typeof value !== 'number' || value < 1)) {
        result.errors.push({
          code: 'INVALID_BOUND_VALUE',
          message: `${bound} must be a positive number`,
          field: bound,
          severity: 'error'
        });
      }
    }

    // Check required fields is an array
    if (bounds.requiredFields && !Array.isArray(bounds.requiredFields)) {
      result.errors.push({
        code: 'INVALID_REQUIRED_FIELDS',
        message: 'requiredFields must be an array',
        field: 'requiredFields',
        severity: 'error'
      });
    }

    // Check locked components is an array
    if (bounds.lockedComponents && !Array.isArray(bounds.lockedComponents)) {
      result.errors.push({
        code: 'INVALID_LOCKED_COMPONENTS',
        message: 'lockedComponents must be an array',
        field: 'lockedComponents',
        severity: 'error'
      });
    }

    return result;
  }

  /**
   * Validate configuration against customization bounds
   */
  private validateAgainstBounds(config: TemplateConfig, bounds: CustomizationBounds): ValidationResult {
    const result: ValidationResult = { valid: true, errors: [], warnings: [], info: [] };

    // Check required fields are present
    if (bounds.requiredFields) {
      for (const requiredField of bounds.requiredFields) {
        if (!(requiredField in config) || (config as any)[requiredField] === undefined) {
          result.errors.push({
            code: 'MISSING_REQUIRED_FIELD',
            message: `Required field '${requiredField}' is missing or undefined`,
            field: requiredField,
            severity: 'error'
          });
        }
      }
    }

    return result;
  }

  /**
   * Check if version string is valid semver
   */
  private isValidVersion(version: string): boolean {
    const semverRegex = /^\d+\.\d+\.\d+$/;
    return semverRegex.test(version);
  }

  /**
   * Check if color string is valid
   */
  private isValidColor(color: string): boolean {
    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    const rgbPattern = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/;
    const rgbaPattern = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(0|1|0?\.\d+)\s*\)$/;

    return hexPattern.test(color) || rgbPattern.test(color) || rgbaPattern.test(color);
  }

  /**
   * Register a custom validator
   */
  public registerCustomValidator(validator: CustomValidator): void {
    this.customValidators.push(validator);
    this.customValidators.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Clear validation cache
   */
  public clearCache(): void {
    this.validationCache.clear();
  }

  /**
   * Get validation statistics
   */
  public getStatistics(): {
    cacheSize: number;
    customValidators: number;
  } {
    return {
      cacheSize: this.validationCache.size,
      customValidators: this.customValidators.length
    };
  }
}

// Export singleton instance
export const templateValidator = new TemplateValidator();
