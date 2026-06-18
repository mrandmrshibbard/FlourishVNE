/**
 * Real-time Template Customization Service for FlourishVNE
 * 
 * Purpose: Live template customization with real-time updates and validation
 * Features: Reactive updates, validation, undo/redo, change tracking
 * 
 * User Story: US1 - Simplified Visual Novel Template Creation
 * Task: T025
 */

import { Template, TemplateConfig, TemplateValidationResult } from '../../types/template';
import { VNUIScreen } from '../../features/ui/types';
import { VNID } from '../../types';
import { TemplateValidator, ValidationResult } from '../../utils/templateValidator';

/**
 * Customization change event
 */
export interface CustomizationChange {
  id: string;
  timestamp: Date;
  field: string;
  path: string;
  oldValue: any;
  newValue: any;
  isValid: boolean;
}

/**
 * Customization session state
 */
export interface CustomizationSession {
  templateId: VNID;
  config: TemplateConfig;
  changes: CustomizationChange[];
  currentIndex: number; // For undo/redo
  isDirty: boolean;
  validationResult?: TemplateValidationResult;
  previewScreens?: VNUIScreen[];
}

/**
 * Customization listener callback
 */
export type CustomizationListener = (session: CustomizationSession) => void;

/**
 * Template Customizer - Real-time template customization service
 */
export class TemplateCustomizer {
  private sessions: Map<string, CustomizationSession> = new Map();
  private listeners: Map<string, Set<CustomizationListener>> = new Map();
  private validator: TemplateValidator;
  private autoValidate: boolean = true;
  private autoPreview: boolean = true;
  private debounceMs: number = 300;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(validator?: TemplateValidator) {
    this.validator = validator || new TemplateValidator();
  }

  /**
   * Start a new customization session
   */
  public startSession(
    sessionId: string,
    template: Template,
    initialConfig?: TemplateConfig
  ): CustomizationSession {
    const config = initialConfig || { ...template.defaultConfig };
    
    const session: CustomizationSession = {
      templateId: template.id,
      config,
      changes: [],
      currentIndex: -1,
      isDirty: false
    };

    this.sessions.set(sessionId, session);

    this.sessions.set(sessionId, session);

    // Initial validation and preview (async, non-blocking)
    if (this.autoValidate || this.autoPreview) {
      Promise.resolve().then(async () => {
        if (this.autoValidate) {
          await this.validateSession(sessionId, template);
        }
        
        if (this.autoPreview) {
          await this.updatePreview(sessionId, template);
        }
      });
    }
    
    return session;
  }

  /**
   * Get session by ID
   */
  public getSession(sessionId: string): CustomizationSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Update configuration field
   */
  public updateField(
    sessionId: string,
    template: Template,
    field: string,
    value: any,
    path?: string
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const fullPath = path || field;
    const oldValue = this.getNestedValue(session.config, fullPath);

    // Create change record
    const change: CustomizationChange = {
      id: this.generateChangeId(),
      timestamp: new Date(),
      field,
      path: fullPath,
      oldValue,
      newValue: value,
      isValid: true // Will be updated after validation
    };

    // Apply change
    this.setNestedValue(session.config, fullPath, value);
    
    // Truncate forward history if we're not at the end
    if (session.currentIndex < session.changes.length - 1) {
      session.changes = session.changes.slice(0, session.currentIndex + 1);
    }

    // Add to history
    session.changes.push(change);
    session.currentIndex++;
    session.isDirty = true;

    // Debounced validation and preview
    this.scheduleUpdate(sessionId, template);

    return true;
  }

  /**
   * Update multiple fields at once
   */
  public updateFields(
    sessionId: string,
    template: Template,
    updates: Array<{ field: string; value: any; path?: string }>
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Apply all updates
    updates.forEach(({ field, value, path }) => {
      const fullPath = path || field;
      const oldValue = this.getNestedValue(session.config, fullPath);

      const change: CustomizationChange = {
        id: this.generateChangeId(),
        timestamp: new Date(),
        field,
        path: fullPath,
        oldValue,
        newValue: value,
        isValid: true
      };

      this.setNestedValue(session.config, fullPath, value);
      
      if (session.currentIndex < session.changes.length - 1) {
        session.changes = session.changes.slice(0, session.currentIndex + 1);
      }

      session.changes.push(change);
      session.currentIndex++;
    });

    session.isDirty = true;

    // Debounced validation and preview
    this.scheduleUpdate(sessionId, template);

    return true;
  }

  /**
   * Replace entire configuration
   */
  public replaceConfig(
    sessionId: string,
    template: Template,
    newConfig: TemplateConfig
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const change: CustomizationChange = {
      id: this.generateChangeId(),
      timestamp: new Date(),
      field: '__root__',
      path: '__root__',
      oldValue: session.config,
      newValue: newConfig,
      isValid: true
    };

    session.config = { ...newConfig };
    
    if (session.currentIndex < session.changes.length - 1) {
      session.changes = session.changes.slice(0, session.currentIndex + 1);
    }

    session.changes.push(change);
    session.currentIndex++;
    session.isDirty = true;

    this.scheduleUpdate(sessionId, template);

    return true;
  }

  /**
   * Undo last change
   */
  public undo(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.currentIndex < 0) return false;

    const change = session.changes[session.currentIndex];
    
    if (change.path === '__root__') {
      session.config = { ...change.oldValue };
    } else {
      this.setNestedValue(session.config, change.path, change.oldValue);
    }

    session.currentIndex--;
    session.isDirty = session.currentIndex >= 0;

    this.notifyListeners(sessionId);
    
    return true;
  }

  /**
   * Redo last undone change
   */
  public redo(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.currentIndex >= session.changes.length - 1) return false;

    session.currentIndex++;
    const change = session.changes[session.currentIndex];
    
    if (change.path === '__root__') {
      session.config = { ...change.newValue };
    } else {
      this.setNestedValue(session.config, change.path, change.newValue);
    }

    session.isDirty = true;

    this.notifyListeners(sessionId);
    
    return true;
  }

  /**
   * Check if undo is available
   */
  public canUndo(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session ? session.currentIndex >= 0 : false;
  }

  /**
   * Check if redo is available
   */
  public canRedo(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session ? session.currentIndex < session.changes.length - 1 : false;
  }

  /**
   * Reset configuration to template defaults
   */
  public reset(sessionId: string, template: Template): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    return this.replaceConfig(sessionId, template, { ...template.defaultConfig });
  }

  /**
   * Validate current configuration
   */
  public async validateSession(sessionId: string, template: Template): Promise<TemplateValidationResult | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const validationResult = await this.validator.validateConfiguration(template, session.config);
    
    // Convert ValidationResult to TemplateValidationResult
    const result: TemplateValidationResult = {
      isValid: validationResult.valid,
      errors: validationResult.errors.map(err => ({
        code: err.code,
        message: err.message,
        field: err.field,
        severity: 'error'
      })),
      warnings: validationResult.warnings.map(warn => ({
        code: warn.code,
        message: warn.message,
        field: warn.field,
        impact: 'medium'
      })),
      suggestions: validationResult.info.map(info => info.message)
    };
    
    session.validationResult = result;

    // Update change validity
    if (session.currentIndex >= 0) {
      session.changes[session.currentIndex].isValid = result.isValid;
    }

    this.notifyListeners(sessionId);
    
    return result;
  }

  /**
   * Update preview screens
   */
  public async updatePreview(sessionId: string, template: Template): Promise<VNUIScreen[] | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    try {
      const screens = await Promise.resolve(template.uiGenerator(session.config));
      session.previewScreens = screens;
      
      this.notifyListeners(sessionId);
      
      return screens;
    } catch (error) {
      console.error('Preview generation failed:', error);
      return null;
    }
  }

  /**
   * Schedule debounced validation and preview update
   */
  private scheduleUpdate(sessionId: string, template: Template): void {
    // Clear existing timer
    const existingTimer = this.debounceTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new update
    const timer = setTimeout(async () => {
      if (this.autoValidate) {
        await this.validateSession(sessionId, template);
      }
      
      if (this.autoPreview) {
        await this.updatePreview(sessionId, template);
      }

      this.notifyListeners(sessionId);
      this.debounceTimers.delete(sessionId);
    }, this.debounceMs);

    this.debounceTimers.set(sessionId, timer);
  }

  /**
   * Force immediate validation and preview update
   */
  public async forceUpdate(sessionId: string, template: Template): Promise<void> {
    const timer = this.debounceTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(sessionId);
    }

    if (this.autoValidate) {
      await this.validateSession(sessionId, template);
    }
    
    if (this.autoPreview) {
      await this.updatePreview(sessionId, template);
    }

    this.notifyListeners(sessionId);
  }

  /**
   * Register change listener
   */
  public addListener(sessionId: string, listener: CustomizationListener): void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }
    this.listeners.get(sessionId)!.add(listener);
  }

  /**
   * Unregister change listener
   */
  public removeListener(sessionId: string, listener: CustomizationListener): void {
    const sessionListeners = this.listeners.get(sessionId);
    if (sessionListeners) {
      sessionListeners.delete(listener);
    }
  }

  /**
   * Notify all listeners of session change
   */
  private notifyListeners(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    const sessionListeners = this.listeners.get(sessionId);
    
    if (session && sessionListeners) {
      sessionListeners.forEach(listener => {
        try {
          listener(session);
        } catch (error) {
          console.error('Listener error:', error);
        }
      });
    }
  }

  /**
   * Save session state
   */
  public saveSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.isDirty = false;
    this.notifyListeners(sessionId);
    
    return true;
  }

  /**
   * End customization session
   */
  public endSession(sessionId: string): boolean {
    // Clear debounce timer
    const timer = this.debounceTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(sessionId);
    }

    // Remove listeners
    this.listeners.delete(sessionId);

    // Remove session
    return this.sessions.delete(sessionId);
  }

  /**
   * Get session statistics
   */
  public getSessionStats(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      totalChanges: session.changes.length,
      currentIndex: session.currentIndex,
      canUndo: this.canUndo(sessionId),
      canRedo: this.canRedo(sessionId),
      isDirty: session.isDirty,
      isValid: session.validationResult?.isValid ?? true,
      errorCount: session.validationResult?.errors.length ?? 0,
      warningCount: session.validationResult?.warnings.length ?? 0
    };
  }

  /**
   * Get change history
   */
  public getChangeHistory(sessionId: string): CustomizationChange[] {
    const session = this.sessions.get(sessionId);
    return session ? [...session.changes] : [];
  }

  /**
   * Set auto-validation
   */
  public setAutoValidate(enabled: boolean): void {
    this.autoValidate = enabled;
  }

  /**
   * Set auto-preview
   */
  public setAutoPreview(enabled: boolean): void {
    this.autoPreview = enabled;
  }

  /**
   * Set debounce delay
   */
  public setDebounceMs(ms: number): void {
    this.debounceMs = Math.max(0, ms);
  }

  /**
   * Helper: Get nested value by path
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }

  /**
   * Helper: Set nested value by path
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
  }

  /**
   * Helper: Generate unique change ID
   */
  private generateChangeId(): string {
    return `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Singleton instance
 */
export const templateCustomizer = new TemplateCustomizer();

export default templateCustomizer;
