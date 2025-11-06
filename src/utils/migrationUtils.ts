/**
 * Project Migration Utilities for FlourishVNE
 * 
 * Purpose: Handle project version upgrades and backward compatibility
 * 
 * Features:
 * - Schema version detection and validation
 * - Automated migration pipelines (2.0 → 2.1)
 * - Backup and restore capabilities
 * - Rollback support for failed migrations
 * - Data integrity validation
 * - Legacy format compatibility
 * 
 * Migration Path:
 * - v2.0: Base FlourishVNE project format
 * - v2.1: Enhanced with templates, visual logic, enhanced variables
 */

import { VNID } from '../types';
import { VNProject } from '../types/project';

/**
 * Supported schema versions
 */
export type SchemaVersion = '2.0' | '2.1' | '2.2';

/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean;
  fromVersion: SchemaVersion;
  toVersion: SchemaVersion;
  changes: MigrationChange[];
  warnings: string[];
  errors: MigrationError[];
  backupId?: string;
  duration: number; // milliseconds
  timestamp: Date;
}

export interface MigrationChange {
  type: 'added' | 'modified' | 'removed' | 'renamed';
  path: string; // JSON path to changed property
  description: string;
  oldValue?: any;
  newValue?: any;
}

export interface MigrationError {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
  suggestedFix?: string;
}

/**
 * Migration strategy
 */
export interface MigrationStrategy {
  version: SchemaVersion;
  migrate: (project: any) => MigrationResult;
  validate: (project: any) => boolean;
  rollback?: (project: any, backup: any) => boolean;
}

/**
 * Project backup
 */
export interface ProjectBackup {
  id: string;
  projectId: VNID;
  version: SchemaVersion;
  data: any;
  timestamp: Date;
  reason: string;
  size: number; // bytes
}

/**
 * Migration Utilities
 * 
 * Handles version upgrades and backward compatibility
 */
export class MigrationUtils {
  private strategies: Map<string, MigrationStrategy> = new Map();
  private backups: Map<string, ProjectBackup> = new Map();
  private maxBackups: number = 5;

  constructor() {
    this.registerDefaultStrategies();
  }

  /**
   * Detect project schema version
   */
  detectVersion(project: any): SchemaVersion {
    // Check for version field
    if (project.schemaVersion) {
      return project.schemaVersion as SchemaVersion;
    }

    // Detect by feature presence
    if (this.hasEnhancedFeatures(project)) {
      return '2.1';
    }

    // Default to 2.0
    return '2.0';
  }

  /**
   * Check if project has enhanced features (v2.1+)
   */
  private hasEnhancedFeatures(project: any): boolean {
    return !!(
      project.templates ||
      project.logicGraphs ||
      project.enhancedVariables ||
      project.contextPanels ||
      project.wizards
    );
  }

  /**
   * Migrate project to target version
   */
  async migrateToVersion(
    project: any,
    targetVersion: SchemaVersion,
    options: { createBackup?: boolean; validateAfter?: boolean } = {}
  ): Promise<MigrationResult> {
    const startTime = performance.now();
    const currentVersion = this.detectVersion(project);

    // Check if migration needed
    if (currentVersion === targetVersion) {
      return {
        success: true,
        fromVersion: currentVersion,
        toVersion: targetVersion,
        changes: [],
        warnings: ['Project is already at target version'],
        errors: [],
        duration: performance.now() - startTime,
        timestamp: new Date()
      };
    }

    // Create backup if requested
    let backupId: string | undefined;
    if (options.createBackup !== false) {
      backupId = await this.createBackup(project, currentVersion, 'pre-migration');
    }

    // Get migration path
    const path = this.getMigrationPath(currentVersion, targetVersion);
    if (!path || path.length === 0) {
      return {
        success: false,
        fromVersion: currentVersion,
        toVersion: targetVersion,
        changes: [],
        warnings: [],
        errors: [{
          severity: 'error',
          code: 'NO_MIGRATION_PATH',
          message: `No migration path from ${currentVersion} to ${targetVersion}`,
          suggestedFix: 'Manual migration may be required'
        }],
        backupId,
        duration: performance.now() - startTime,
        timestamp: new Date()
      };
    }

    // Execute migration steps
    const allChanges: MigrationChange[] = [];
    const allWarnings: string[] = [];
    const allErrors: MigrationError[] = [];
    let migratedProject = { ...project };

    for (const version of path) {
      const strategy = this.strategies.get(version);
      if (!strategy) {
        allErrors.push({
          severity: 'error',
          code: 'MISSING_STRATEGY',
          message: `No migration strategy for version ${version}`
        });
        break;
      }

      const result = strategy.migrate(migratedProject);
      if (!result.success) {
        allErrors.push(...result.errors);
        break;
      }

      migratedProject = this.applyChanges(migratedProject, result.changes);
      allChanges.push(...result.changes);
      allWarnings.push(...result.warnings);
    }

    // Validate if requested
    if (options.validateAfter !== false && allErrors.length === 0) {
      const validationErrors = this.validateProject(migratedProject, targetVersion);
      allErrors.push(...validationErrors);
    }

    // Update migrated project
    if (allErrors.filter(e => e.severity === 'error').length === 0) {
      Object.assign(project, migratedProject);
      project.schemaVersion = targetVersion;
    }

    return {
      success: allErrors.filter(e => e.severity === 'error').length === 0,
      fromVersion: currentVersion,
      toVersion: targetVersion,
      changes: allChanges,
      warnings: allWarnings,
      errors: allErrors,
      backupId,
      duration: performance.now() - startTime,
      timestamp: new Date()
    };
  }

  /**
   * Get migration path between versions
   */
  private getMigrationPath(from: SchemaVersion, to: SchemaVersion): SchemaVersion[] {
    const versions: SchemaVersion[] = ['2.0', '2.1', '2.2'];
    const fromIndex = versions.indexOf(from);
    const toIndex = versions.indexOf(to);

    if (fromIndex === -1 || toIndex === -1 || fromIndex >= toIndex) {
      return [];
    }

    return versions.slice(fromIndex + 1, toIndex + 1);
  }

  /**
   * Apply changes to project
   */
  private applyChanges(project: any, changes: MigrationChange[]): any {
    const updated = JSON.parse(JSON.stringify(project)); // Deep clone

    for (const change of changes) {
      const pathParts = change.path.split('.');
      let current = updated;

      // Navigate to parent
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!(part in current)) {
          current[part] = {};
        }
        current = current[part];
      }

      const finalKey = pathParts[pathParts.length - 1];

      // Apply change
      switch (change.type) {
        case 'added':
        case 'modified':
          current[finalKey] = change.newValue;
          break;
        case 'removed':
          delete current[finalKey];
          break;
        case 'renamed':
          if (change.oldValue && change.newValue) {
            current[change.newValue as string] = current[change.oldValue as string];
            delete current[change.oldValue as string];
          }
          break;
      }
    }

    return updated;
  }

  /**
   * Validate project against schema version
   */
  private validateProject(project: any, version: SchemaVersion): MigrationError[] {
    const errors: MigrationError[] = [];

    // Version-specific validation
    switch (version) {
      case '2.1':
        errors.push(...this.validateV21Features(project));
        break;
      case '2.2':
        errors.push(...this.validateV22Features(project));
        break;
    }

    return errors;
  }

  /**
   * Validate v2.1 features
   */
  private validateV21Features(project: any): MigrationError[] {
    const errors: MigrationError[] = [];

    // Check template structure
    if (project.templates && !Array.isArray(project.templates)) {
      errors.push({
        severity: 'error',
        code: 'INVALID_TEMPLATES',
        message: 'Templates must be an array',
        path: 'templates'
      });
    }

    // Check logic graphs
    if (project.logicGraphs && !Array.isArray(project.logicGraphs)) {
      errors.push({
        severity: 'error',
        code: 'INVALID_LOGIC_GRAPHS',
        message: 'Logic graphs must be an array',
        path: 'logicGraphs'
      });
    }

    return errors;
  }

  /**
   * Validate v2.2 features (future)
   */
  private validateV22Features(project: any): MigrationError[] {
    // Placeholder for future v2.2 features
    return [];
  }

  /**
   * Create project backup
   */
  async createBackup(project: any, version: SchemaVersion, reason: string): Promise<string> {
    const backupId = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const data = JSON.parse(JSON.stringify(project)); // Deep clone

    const backup: ProjectBackup = {
      id: backupId,
      projectId: project.id || 'unknown',
      version,
      data,
      timestamp: new Date(),
      reason,
      size: JSON.stringify(data).length
    };

    this.backups.set(backupId, backup);

    // Limit backup count
    if (this.backups.size > this.maxBackups) {
      const oldestBackup = Array.from(this.backups.values())
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())[0];
      this.backups.delete(oldestBackup.id);
    }

    return backupId;
  }

  /**
   * Restore from backup
   */
  restoreBackup(backupId: string): any | null {
    const backup = this.backups.get(backupId);
    if (!backup) {
      return null;
    }

    return JSON.parse(JSON.stringify(backup.data)); // Deep clone
  }

  /**
   * List available backups
   */
  listBackups(projectId?: VNID): ProjectBackup[] {
    const allBackups = Array.from(this.backups.values());
    
    if (projectId) {
      return allBackups.filter(b => b.projectId === projectId);
    }

    return allBackups;
  }

  /**
   * Register default migration strategies
   */
  private registerDefaultStrategies(): void {
    // Migration from 2.0 to 2.1
    this.strategies.set('2.1', {
      version: '2.1',
      migrate: (project: any): MigrationResult => {
        const changes: MigrationChange[] = [];
        const warnings: string[] = [];
        const errors: MigrationError[] = [];

        // Add templates array if missing
        if (!project.templates) {
          changes.push({
            type: 'added',
            path: 'templates',
            description: 'Added templates array for template system',
            newValue: []
          });
        }

        // Add logic graphs array if missing
        if (!project.logicGraphs) {
          changes.push({
            type: 'added',
            path: 'logicGraphs',
            description: 'Added logic graphs array for visual logic builder',
            newValue: []
          });
        }

        // Add enhanced variables if missing
        if (!project.enhancedVariables) {
          changes.push({
            type: 'added',
            path: 'enhancedVariables',
            description: 'Added enhanced variables object',
            newValue: {
              relationships: [],
              watchers: [],
              history: []
            }
          });
        }

        // Migrate existing variables to enhanced format
        if (project.variables && Array.isArray(project.variables)) {
          warnings.push(`${project.variables.length} variables will be enhanced with new features`);
        }

        return {
          success: true,
          fromVersion: '2.0',
          toVersion: '2.1',
          changes,
          warnings,
          errors,
          duration: 0,
          timestamp: new Date()
        };
      },
      validate: (project: any): boolean => {
        return !!(project.templates && project.logicGraphs);
      }
    });

    // Migration from 2.1 to 2.2 (placeholder for future)
    this.strategies.set('2.2', {
      version: '2.2',
      migrate: (project: any): MigrationResult => {
        return {
          success: true,
          fromVersion: '2.1',
          toVersion: '2.2',
          changes: [],
          warnings: ['Version 2.2 migration not yet implemented'],
          errors: [],
          duration: 0,
          timestamp: new Date()
        };
      },
      validate: (project: any): boolean => {
        return true;
      }
    });
  }

  /**
   * Register custom migration strategy
   */
  registerStrategy(strategy: MigrationStrategy): void {
    this.strategies.set(strategy.version, strategy);
  }

  /**
   * Check if project needs migration
   */
  needsMigration(project: any, targetVersion: SchemaVersion): boolean {
    const currentVersion = this.detectVersion(project);
    return currentVersion !== targetVersion;
  }

  /**
   * Get migration preview (dry run)
   */
  async previewMigration(
    project: any,
    targetVersion: SchemaVersion
  ): Promise<MigrationResult> {
    const projectCopy = JSON.parse(JSON.stringify(project));
    return this.migrateToVersion(projectCopy, targetVersion, {
      createBackup: false,
      validateAfter: true
    });
  }

  /**
   * Clear all backups
   */
  clearBackups(projectId?: VNID): number {
    if (projectId) {
      const toRemove = Array.from(this.backups.values())
        .filter(b => b.projectId === projectId);
      toRemove.forEach(b => this.backups.delete(b.id));
      return toRemove.length;
    }

    const count = this.backups.size;
    this.backups.clear();
    return count;
  }

  /**
   * Export project with version metadata
   */
  exportProject(project: any): { data: any; version: SchemaVersion; exported: Date } {
    const version = this.detectVersion(project);
    return {
      data: JSON.parse(JSON.stringify(project)),
      version,
      exported: new Date()
    };
  }

  /**
   * Import project with automatic migration
   */
  async importProject(
    importedData: any,
    targetVersion: SchemaVersion,
    options: { createBackup?: boolean } = {}
  ): Promise<{ project: any; migrationResult: MigrationResult }> {
    const project = importedData.data || importedData;
    const migrationResult = await this.migrateToVersion(project, targetVersion, options);

    return {
      project: migrationResult.success ? project : null,
      migrationResult
    };
  }
}

/**
 * Export singleton instance
 */
export const migrationUtils = new MigrationUtils();
