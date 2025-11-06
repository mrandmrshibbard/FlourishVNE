/**
 * Template Configuration UI Component for FlourishVNE
 * 
 * Purpose: Interactive UI for configuring template settings before generation
 * Features: Form-based configuration, validation, real-time preview integration
 * 
 * User Story: US1 - Simplified Visual Novel Template Creation
 * Task: T023
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Template, TemplateConfig as TConfig, TemplateValidationResult } from '../../types/template';
import { VNID } from '../../types';

/**
 * Template configuration props
 */
export interface TemplateConfigProps {
  template: Template;
  initialConfig?: TConfig;
  onConfigChange?: (config: TConfig, isValid: boolean) => void;
  onSave?: (config: TConfig) => void;
  onCancel?: () => void;
  showPreview?: boolean;
}

/**
 * Field types for dynamic form generation
 */
type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'color' | 'array' | 'object';

interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  description?: string;
  required?: boolean;
  min?: number;
  max?: number;
  options?: Array<{ value: any; label: string }>;
  defaultValue?: any;
  placeholder?: string;
  validation?: (value: any) => string | null; // Returns error message or null
}

/**
 * Template Configuration Component
 */
export const TemplateConfigComponent: React.FC<TemplateConfigProps> = ({
  template,
  initialConfig,
  onConfigChange,
  onSave,
  onCancel,
  showPreview = true
}) => {
  // State
  const [config, setConfig] = useState<TConfig>(
    initialConfig || template.defaultConfig
  );
  const [validationResult, setValidationResult] = useState<TemplateValidationResult>({
    isValid: true,
    errors: [],
    warnings: [],
    suggestions: []
  });
  const [activeSection, setActiveSection] = useState<string>('general');
  const [isDirty, setIsDirty] = useState(false);

  /**
   * Extract configuration fields from template schema
   */
  const configFields = useMemo(() => {
    return extractFieldsFromSchema(template.configSchema, template.defaultConfig);
  }, [template.configSchema, template.defaultConfig]);

  /**
   * Group fields by section
   */
  const fieldSections = useMemo(() => {
    const sections: Record<string, ConfigField[]> = {
      general: []
    };

    configFields.forEach(field => {
      const sectionName = inferSectionFromKey(field.key);
      if (!sections[sectionName]) {
        sections[sectionName] = [];
      }
      sections[sectionName].push(field);
    });

    return sections;
  }, [configFields]);

  /**
   * Validate configuration against schema and customization bounds
   */
  const validateConfig = useCallback((cfg: TConfig): TemplateValidationResult => {
    const errors: Array<{ code: string; message: string; field?: string; severity: 'error' | 'warning' }> = [];
    const warnings: Array<{ code: string; message: string; field?: string; impact: 'low' | 'medium' | 'high' }> = [];

    // Check required fields
    const schema = template.configSchema;
    if (schema.required) {
      schema.required.forEach(requiredKey => {
        if (!(requiredKey in cfg) || cfg[requiredKey] === undefined || cfg[requiredKey] === null) {
          errors.push({
            code: 'REQUIRED_FIELD',
            message: `${requiredKey} is required`,
            field: requiredKey,
            severity: 'error'
          });
        }
      });
    }

    // Check customization limits
    const limits = template.customizationLimits;
    
    if (limits.maxCharacters && cfg.characters && Array.isArray(cfg.characters)) {
      if (cfg.characters.length > limits.maxCharacters) {
        errors.push({
          code: 'MAX_CHARACTERS_EXCEEDED',
          message: `Maximum ${limits.maxCharacters} characters allowed`,
          field: 'characters',
          severity: 'error'
        });
      }
    }

    if (limits.maxItems && cfg.items && Array.isArray(cfg.items)) {
      if (cfg.items.length > limits.maxItems) {
        errors.push({
          code: 'MAX_ITEMS_EXCEEDED',
          message: `Maximum ${limits.maxItems} items allowed`,
          field: 'items',
          severity: 'error'
        });
      }
    }

    if (limits.maxStats && cfg.stats && Array.isArray(cfg.stats)) {
      if (cfg.stats.length > limits.maxStats) {
        errors.push({
          code: 'MAX_STATS_EXCEEDED',
          message: `Maximum ${limits.maxStats} stats allowed`,
          field: 'stats',
          severity: 'error'
        });
      }
    }

    // Check locked components
    if (!limits.allowStructureChanges) {
      warnings.push({
        code: 'STRUCTURE_LOCKED',
        message: 'Template structure cannot be modified',
        impact: 'medium'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions: []
    };
  }, [template]);

  /**
   * Update configuration
   */
  const updateConfig = useCallback((updates: Partial<TConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    setIsDirty(true);

    // Validate
    const validation = validateConfig(newConfig);
    setValidationResult(validation);

    // Notify parent
    onConfigChange?.(newConfig, validation.isValid);
  }, [config, validateConfig, onConfigChange]);

  /**
   * Update nested configuration value
   */
  const updateNestedValue = useCallback((path: string, value: any) => {
    const keys = path.split('.');
    const newConfig = { ...config };
    
    let current: any = newConfig;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
    updateConfig(newConfig);
  }, [config, updateConfig]);

  /**
   * Handle save
   */
  const handleSave = useCallback(() => {
    if (validationResult.isValid) {
      onSave?.(config);
      setIsDirty(false);
    }
  }, [config, validationResult.isValid, onSave]);

  /**
   * Handle cancel
   */
  const handleCancel = useCallback(() => {
    if (isDirty) {
      const confirmCancel = window.confirm('You have unsaved changes. Are you sure you want to cancel?');
      if (!confirmCancel) return;
    }
    onCancel?.();
  }, [isDirty, onCancel]);

  /**
   * Reset to defaults
   */
  const handleReset = useCallback(() => {
    const confirmReset = window.confirm('Reset all configuration to default values?');
    if (confirmReset) {
      setConfig(template.defaultConfig);
      setIsDirty(true);
      const validation = validateConfig(template.defaultConfig);
      setValidationResult(validation);
      onConfigChange?.(template.defaultConfig, validation.isValid);
    }
  }, [template.defaultConfig, validateConfig, onConfigChange]);

  // Initial validation
  useEffect(() => {
    const validation = validateConfig(config);
    setValidationResult(validation);
  }, []);

  return (
    <div className="template-config">
      {/* Header */}
      <div className="template-config__header">
        <div className="template-config__title-section">
          <h2 className="template-config__title">{template.name} Configuration</h2>
          <p className="template-config__description">{template.description}</p>
        </div>
        
        {/* Action buttons */}
        <div className="template-config__actions">
          <button
            className="btn btn--secondary"
            onClick={handleReset}
            disabled={!isDirty}
          >
            Reset to Defaults
          </button>
          <button
            className="btn btn--secondary"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={handleSave}
            disabled={!validationResult.isValid || !isDirty}
          >
            Save Configuration
          </button>
        </div>
      </div>

      {/* Validation feedback */}
      {(validationResult.errors.length > 0 || validationResult.warnings.length > 0) && (
        <div className="template-config__validation">
          {validationResult.errors.map((error, idx) => (
            <div key={idx} className="validation-message validation-message--error">
              <span className="validation-icon">⚠️</span>
              <span className="validation-text">{error.message}</span>
            </div>
          ))}
          {validationResult.warnings.map((warning, idx) => (
            <div key={idx} className="validation-message validation-message--warning">
              <span className="validation-icon">ℹ️</span>
              <span className="validation-text">{warning.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Configuration form */}
      <div className="template-config__body">
        {/* Section tabs */}
        <div className="template-config__sections">
          {Object.keys(fieldSections).map(sectionName => (
            <button
              key={sectionName}
              className={`section-tab ${activeSection === sectionName ? 'section-tab--active' : ''}`}
              onClick={() => setActiveSection(sectionName)}
            >
              {formatSectionName(sectionName)}
              {fieldSections[sectionName].some(f => 
                validationResult.errors.some(e => e.field === f.key)
              ) && <span className="section-tab__error-badge">!</span>}
            </button>
          ))}
        </div>

        {/* Configuration fields */}
        <div className="template-config__fields">
          {fieldSections[activeSection]?.map(field => (
            <ConfigFieldRenderer
              key={field.key}
              field={field}
              value={getNestedValue(config, field.key)}
              onChange={(value) => updateNestedValue(field.key, value)}
              error={validationResult.errors.find(e => e.field === field.key)}
            />
          ))}
        </div>
      </div>

      {/* Preview section */}
      {showPreview && (
        <div className="template-config__preview">
          <h3>Preview</h3>
          <div className="preview-placeholder">
            <p>Template preview will appear here</p>
            <small>Changes update in real-time</small>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Field renderer component
 */
interface ConfigFieldRendererProps {
  field: ConfigField;
  value: any;
  onChange: (value: any) => void;
  error?: { message: string };
}

const ConfigFieldRenderer: React.FC<ConfigFieldRendererProps> = ({
  field,
  value,
  onChange,
  error
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    let newValue: any = e.target.value;
    
    if (field.type === 'number') {
      newValue = parseFloat(newValue);
    } else if (field.type === 'boolean') {
      newValue = (e.target as HTMLInputElement).checked;
    }
    
    onChange(newValue);
  };

  return (
    <div className={`config-field ${error ? 'config-field--error' : ''}`}>
      <label className="config-field__label">
        {field.label}
        {field.required && <span className="config-field__required">*</span>}
      </label>
      
      {field.description && (
        <p className="config-field__description">{field.description}</p>
      )}

      {/* Render appropriate input based on field type */}
      {field.type === 'text' && (
        <input
          type="text"
          className="config-field__input"
          value={value || ''}
          onChange={handleChange}
          placeholder={field.placeholder}
        />
      )}

      {field.type === 'number' && (
        <input
          type="number"
          className="config-field__input"
          value={value || ''}
          onChange={handleChange}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder}
        />
      )}

      {field.type === 'boolean' && (
        <label className="config-field__checkbox">
          <input
            type="checkbox"
            checked={value || false}
            onChange={handleChange}
          />
          <span>Enable</span>
        </label>
      )}

      {field.type === 'select' && field.options && (
        <select
          className="config-field__select"
          value={value || ''}
          onChange={handleChange}
        >
          <option value="">Select...</option>
          {field.options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {field.type === 'color' && (
        <input
          type="color"
          className="config-field__color"
          value={value || '#000000'}
          onChange={handleChange}
        />
      )}

      {error && (
        <span className="config-field__error-message">{error.message}</span>
      )}
    </div>
  );
};

/**
 * Helper: Extract fields from JSON schema
 */
function extractFieldsFromSchema(schema: any, defaultConfig: any): ConfigField[] {
  const fields: ConfigField[] = [];
  
  if (schema.properties) {
    Object.entries(schema.properties).forEach(([key, prop]: [string, any]) => {
      const field: ConfigField = {
        key,
        label: formatFieldLabel(key),
        type: inferFieldType(prop.type, prop),
        required: schema.required?.includes(key),
        defaultValue: defaultConfig[key]
      };
      
      fields.push(field);
    });
  }
  
  return fields;
}

/**
 * Helper: Infer field type from schema type
 */
function inferFieldType(schemaType: string, prop: any): FieldType {
  if (schemaType === 'string') {
    if (prop.enum) return 'select';
    if (prop.format === 'color') return 'color';
    return 'text';
  }
  if (schemaType === 'number' || schemaType === 'integer') return 'number';
  if (schemaType === 'boolean') return 'boolean';
  if (schemaType === 'array') return 'array';
  if (schemaType === 'object') return 'object';
  return 'text';
}

/**
 * Helper: Format field label
 */
function formatFieldLabel(key: string): string {
  return key
    .split(/(?=[A-Z])|_/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Helper: Format section name
 */
function formatSectionName(section: string): string {
  return section
    .split(/(?=[A-Z])|_/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Helper: Infer section from field key
 */
function inferSectionFromKey(key: string): string {
  const lowerKey = key.toLowerCase();
  
  if (lowerKey.includes('color') || lowerKey.includes('theme')) return 'appearance';
  if (lowerKey.includes('layout') || lowerKey.includes('spacing')) return 'layout';
  if (lowerKey.includes('validation') || lowerKey.includes('rule')) return 'validation';
  if (lowerKey.includes('output') || lowerKey.includes('export')) return 'output';
  if (lowerKey.includes('feature') || lowerKey.includes('enable')) return 'features';
  
  return 'general';
}

/**
 * Helper: Get nested value from object
 */
function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  
  return current;
}

export default TemplateConfigComponent;
