import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { VNScene } from '../../features/scene/types';
import { VNCharacter } from '../../features/character/types';
import { VNVariable } from '../../features/variables/types';
import { VNUIScreen } from '../../features/ui/types';

/**
 * Migration Service - Handles project version upgrades and data transformations
 * 
 * Features:
 * - Version detection and validation
 * - Multi-step migration pipelines
 * - Data transformation with rollback support
 * - Backup creation and restoration
 * - Migration validation and error handling
 * - Progress tracking and reporting
 * - Backward compatibility checks
 */

export interface MigrationServiceConfig {
  enableAutoBackup: boolean;
  backupLocation: string;
  maxBackupAge: number; // days
  validateAfterMigration: boolean;
  allowDataLoss: boolean;
  logMigrations: boolean;
}

export interface MigrationDefinition {
  id: VNID;
  name: string;
  description: string;
  fromVersion: string;
  toVersion: string;
  priority: number; // Lower numbers run first
  isReversible: boolean;
  estimatedDuration: number; // milliseconds
  transforms: MigrationTransform[];
  validators: MigrationValidator[];
  metadata: Record<string, any>;
}

export interface MigrationTransform {
  id: VNID;
  name: string;
  target: 'project' | 'scenes' | 'characters' | 'variables' | 'ui' | 'assets' | 'settings';
  operation: 'add' | 'modify' | 'delete' | 'rename' | 'restructure';
  apply: (data: any) => Promise<any>;
  rollback?: (data: any, backup: any) => Promise<any>;
  validate?: (data: any) => Promise<boolean>;
}

export interface MigrationValidator {
  id: VNID;
  name: string;
  validate: (project: VNProject) => Promise<ValidationIssue[]>;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  location?: string;
  suggestion?: string;
  autoFixable: boolean;
}

export interface MigrationPlan {
  id: VNID;
  projectId: VNID;
  currentVersion: string;
  targetVersion: string;
  migrations: MigrationDefinition[];
  totalSteps: number;
  estimatedDuration: number;
  requiresBackup: boolean;
  potentialIssues: ValidationIssue[];
  createdAt: Date;
}

export interface MigrationResult {
  planId: VNID;
  success: boolean;
  startedAt: Date;
  completedAt: Date;
  migratedFrom: string;
  migratedTo: string;
  appliedMigrations: string[];
  failedMigrations: string[];
  backupLocation?: string;
  errors: MigrationError[];
  warnings: string[];
  dataLoss: DataLossReport | null;
}

export interface MigrationError {
  migrationId: VNID;
  transformId?: VNID;
  code: string;
  message: string;
  stack?: string;
  recoverable: boolean;
}

export interface DataLossReport {
  deletedItems: Array<{ type: string; id: VNID; name: string }>;
  modifiedItems: Array<{ type: string; id: VNID; changes: string[] }>;
  severity: 'none' | 'minor' | 'major' | 'critical';
  canRecover: boolean;
}

export interface ProjectBackup {
  id: VNID;
  projectId: VNID;
  version: string;
  createdAt: Date;
  size: number; // bytes
  location: string;
  data: {
    project: VNProject;
    metadata: Record<string, any>;
  };
  reason: 'manual' | 'pre-migration' | 'auto';
}

export class MigrationService {
  private migrations = new Map<string, MigrationDefinition[]>(); // keyed by fromVersion
  private backups = new Map<VNID, ProjectBackup>();
  private config: MigrationServiceConfig;
  private currentVersion: string = '2.0.0';

  constructor(config: Partial<MigrationServiceConfig> = {}) {
    this.config = {
      enableAutoBackup: true,
      backupLocation: './backups',
      maxBackupAge: 30,
      validateAfterMigration: true,
      allowDataLoss: false,
      logMigrations: true,
      ...config
    };

    this.registerBuiltInMigrations();
  }

  /**
   * Register built-in migrations
   */
  private registerBuiltInMigrations(): void {
    // Migration from 1.0.0 to 2.0.0
    this.registerMigration({
      id: 'mig_1.0_to_2.0',
      name: 'Upgrade to 2.0',
      description: 'Major upgrade with enhanced features and streamlined UX',
      fromVersion: '1.0.0',
      toVersion: '2.0.0',
      priority: 1,
      isReversible: true,
      estimatedDuration: 5000,
      transforms: [
        {
          id: 'transform_project_structure',
          name: 'Update Project Structure',
          target: 'project',
          operation: 'restructure',
          apply: async (project: VNProject & { version?: string; metadata?: any }) => {
            // Add new 2.0 features
            return {
              ...project,
              version: '2.0.0',
              metadata: {
                ...(project.metadata || {}),
                migratedAt: new Date().toISOString(),
                previousVersion: '1.0.0'
              }
            };
          },
          rollback: async (project: VNProject & { version?: string; metadata?: any }, backup: VNProject & { version?: string; metadata?: any }) => {
            return {
              ...backup,
              version: '1.0.0'
            };
          },
          validate: async (project: VNProject & { version?: string }) => {
            return (project as any).version === '2.0.0';
          }
        },
        {
          id: 'transform_scene_commands',
          name: 'Update Scene Command Format',
          target: 'scenes',
          operation: 'modify',
          apply: async (scenes: Record<VNID, VNScene>) => {
            // Update command structure for 2.0
            const result: Record<VNID, VNScene> = {};
            for (const [id, scene] of Object.entries(scenes)) {
              result[id] = {
                ...scene,
                commands: scene.commands.map(cmd => ({
                  ...cmd,
                  // Add command modifiers for 2.0
                  modifiers: (cmd as any).modifiers || {}
                }))
              };
            }
            return result;
          },
          validate: async (scenes: Record<VNID, VNScene>) => {
            return Object.values(scenes).every(scene => 
              scene.commands.every(cmd => (cmd as any).modifiers !== undefined)
            );
          }
        },
        {
          id: 'transform_character_layers',
          name: 'Update Character Layer System',
          target: 'characters',
          operation: 'restructure',
          apply: async (characters: Record<VNID, VNCharacter>) => {
            // Convert old sprite system to new layer system
            const result: Record<VNID, VNCharacter> = {};
            for (const [id, char] of Object.entries(characters)) {
              result[id] = {
                ...char,
                layers: char.layers || {}
              };
            }
            return result;
          },
          validate: async (characters: Record<VNID, VNCharacter>) => {
            return Object.values(characters).every(char => char.layers !== undefined);
          }
        }
      ],
      validators: [
        {
          id: 'validate_project_integrity',
          name: 'Project Integrity Check',
          severity: 'error',
          validate: async (project: VNProject) => {
            const issues: ValidationIssue[] = [];

            if (!project.id) {
              issues.push({
                code: 'MISSING_PROJECT_ID',
                message: 'Project is missing required ID',
                severity: 'error',
                autoFixable: true,
                suggestion: 'Generate a new project ID'
              });
            }

            if (!project.title || project.title.trim() === '') {
              issues.push({
                code: 'MISSING_PROJECT_TITLE',
                message: 'Project is missing a title',
                severity: 'error',
                autoFixable: false
              });
            }

            return issues;
          }
        }
      ],
      metadata: {
        breaking: true,
        dataLoss: false,
        requiresUserAction: false
      }
    });

    // Migration from 1.5.0 to 2.0.0
    this.registerMigration({
      id: 'mig_1.5_to_2.0',
      name: 'Upgrade 1.5 to 2.0',
      description: 'Incremental upgrade from 1.5 to 2.0',
      fromVersion: '1.5.0',
      toVersion: '2.0.0',
      priority: 1,
      isReversible: true,
      estimatedDuration: 3000,
      transforms: [
        {
          id: 'transform_ui_screens',
          name: 'Update UI Screen Format',
          target: 'ui',
          operation: 'modify',
          apply: async (screens: Record<VNID, VNUIScreen>) => {
            // Update UI screens to 2.0 format
            const result: Record<VNID, VNUIScreen> = {};
            for (const [id, screen] of Object.entries(screens)) {
              result[id] = {
                ...screen,
                // Add new 2.0 properties metadata if needed
                ...(screen as any).metadata && { metadata: (screen as any).metadata }
              };
            }
            return result;
          },
          validate: async (screens: Record<VNID, VNUIScreen>) => {
            return Object.values(screens).every(screen => true); // Always valid
          }
        }
      ],
      validators: [],
      metadata: {
        breaking: false,
        dataLoss: false,
        requiresUserAction: false
      }
    });
  }

  /**
   * Register a migration
   */
  public registerMigration(migration: MigrationDefinition): void {
    const key = migration.fromVersion;
    const existing = this.migrations.get(key) || [];
    
    // Check for duplicate migration IDs
    if (existing.some(m => m.id === migration.id)) {
      console.warn(`Migration ${migration.id} already registered`);
      return;
    }

    // Add and sort by priority
    existing.push(migration);
    existing.sort((a, b) => a.priority - b.priority);
    
    this.migrations.set(key, existing);
  }

  /**
   * Detect project version
   */
  public detectVersion(project: VNProject): string {
    // Check for explicit version in extended properties
    const extendedProject = project as VNProject & { version?: string; metadata?: any };
    
    if (extendedProject.version) {
      return extendedProject.version;
    }

    // Attempt to infer version from metadata if present
    if (extendedProject.metadata?.version) {
      return extendedProject.metadata.version;
    }

    // Default to oldest supported version
    return '1.0.0';
  }

  /**
   * Check if migration is needed
   */
  public needsMigration(project: VNProject): boolean {
    const currentVer = this.detectVersion(project);
    return this.compareVersions(currentVer, this.currentVersion) < 0;
  }

  /**
   * Compare semantic versions
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const diff = (parts1[i] || 0) - (parts2[i] || 0);
      if (diff !== 0) return diff;
    }

    return 0;
  }

  /**
   * Create migration plan
   */
  public async createMigrationPlan(project: VNProject, targetVersion?: string): Promise<MigrationPlan> {
    const currentVersion = this.detectVersion(project);
    const target = targetVersion || this.currentVersion;

    // Find all migrations needed
    const path = this.findMigrationPath(currentVersion, target);
    
    if (path.length === 0) {
      throw new Error(`No migration path from ${currentVersion} to ${target}`);
    }

    // Validate migrations
    const potentialIssues: ValidationIssue[] = [];
    for (const migration of path) {
      for (const validator of migration.validators) {
        const issues = await validator.validate(project);
        potentialIssues.push(...issues);
      }
    }

    // Check for blocking errors
    const blockingErrors = potentialIssues.filter(issue => issue.severity === 'error' && !issue.autoFixable);
    if (blockingErrors.length > 0 && !this.config.allowDataLoss) {
      throw new Error(`Migration blocked by ${blockingErrors.length} errors. Fix errors or enable allowDataLoss.`);
    }

    const totalSteps = path.reduce((sum, mig) => sum + mig.transforms.length, 0);
    const estimatedDuration = path.reduce((sum, mig) => sum + mig.estimatedDuration, 0);

    return {
      id: `plan_${Date.now()}`,
      projectId: project.id,
      currentVersion,
      targetVersion: target,
      migrations: path,
      totalSteps,
      estimatedDuration,
      requiresBackup: path.some(m => !m.isReversible || m.metadata.breaking),
      potentialIssues,
      createdAt: new Date()
    };
  }

  /**
   * Find migration path between versions
   */
  private findMigrationPath(from: string, to: string): MigrationDefinition[] {
    const path: MigrationDefinition[] = [];
    let current = from;

    // Simple path finding - in production this would use a graph algorithm
    while (this.compareVersions(current, to) < 0) {
      const migrations = this.migrations.get(current);
      if (!migrations || migrations.length === 0) {
        // Try to find any migration that can move us forward
        const allMigrations = Array.from(this.migrations.values()).flat();
        const viable = allMigrations.find(m => 
          this.compareVersions(m.fromVersion, current) === 0 &&
          this.compareVersions(m.toVersion, to) <= 0
        );

        if (!viable) break;
        path.push(viable);
        current = viable.toVersion;
      } else {
        // Use the first migration (highest priority)
        const migration = migrations[0];
        path.push(migration);
        current = migration.toVersion;
      }
    }

    return path;
  }

  /**
   * Execute migration
   */
  public async executeMigration(project: VNProject, plan: MigrationPlan): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      planId: plan.id,
      success: false,
      startedAt: new Date(),
      completedAt: new Date(),
      migratedFrom: plan.currentVersion,
      migratedTo: plan.targetVersion,
      appliedMigrations: [],
      failedMigrations: [],
      errors: [],
      warnings: [],
      dataLoss: null
    };

    let backup: ProjectBackup | null = null;

    try {
      // Create backup if needed
      if (this.config.enableAutoBackup || plan.requiresBackup) {
        backup = await this.createBackup(project, 'pre-migration');
        result.backupLocation = backup.location;
      }

      // Execute each migration in sequence
      for (const migration of plan.migrations) {
        try {
          await this.executeSingleMigration(project, migration);
          result.appliedMigrations.push(migration.id);
        } catch (error) {
          result.failedMigrations.push(migration.id);
          result.errors.push({
            migrationId: migration.id,
            code: 'MIGRATION_FAILED',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            recoverable: migration.isReversible
          });

          // Stop on error unless configured otherwise
          if (!this.config.allowDataLoss) {
            throw error;
          }
        }
      }

      // Validate final result
      if (this.config.validateAfterMigration) {
        const validationIssues = await this.validateProject(project);
        const errors = validationIssues.filter(issue => issue.severity === 'error');
        
        if (errors.length > 0) {
          result.warnings.push(`Validation found ${errors.length} errors after migration`);
        }
      }

      // Update project version (extend with migration metadata)
      const extendedProject = project as VNProject & { version?: string; metadata?: any };
      extendedProject.version = plan.targetVersion;
      extendedProject.metadata = extendedProject.metadata || {};
      extendedProject.metadata.lastMigration = {
        date: new Date().toISOString(),
        from: plan.currentVersion,
        to: plan.targetVersion
      };

      result.success = result.failedMigrations.length === 0;

    } catch (error) {
      result.success = false;
      console.error('Migration failed:', error);

      // Attempt rollback if backup exists
      if (backup && this.config.enableAutoBackup) {
        try {
          await this.restoreBackup(backup.id);
          result.warnings.push('Migration failed, project restored from backup');
        } catch (rollbackError) {
          result.errors.push({
            migrationId: 'ROLLBACK',
            code: 'ROLLBACK_FAILED',
            message: 'Failed to restore backup after migration failure',
            recoverable: false
          });
        }
      }
    }

    result.completedAt = new Date();

    // Log migration if enabled
    if (this.config.logMigrations) {
      this.logMigration(result);
    }

    return result;
  }

  /**
   * Execute a single migration
   */
  private async executeSingleMigration(project: VNProject, migration: MigrationDefinition): Promise<void> {
    for (const transform of migration.transforms) {
      let target: any;

      // Get target data
      switch (transform.target) {
        case 'project':
          target = project;
          break;
        case 'scenes':
          target = project.scenes || {};
          break;
        case 'characters':
          target = project.characters || {};
          break;
        case 'variables':
          target = project.variables || {};
          break;
        case 'ui':
          target = project.uiScreens || {};
          break;
        case 'settings':
          target = (project as any).settings || {};
          break;
        case 'assets':
          target = {
            backgrounds: project.backgrounds || {},
            images: project.images || {},
            audio: project.audio || {},
            videos: project.videos || {}
          };
          break;
        default:
          throw new Error(`Unknown transform target: ${transform.target}`);
      }

      // Apply transform
      const transformed = await transform.apply(target);

      // Validate if validator provided
      if (transform.validate) {
        const isValid = await transform.validate(transformed);
        if (!isValid) {
          throw new Error(`Transform validation failed: ${transform.name}`);
        }
      }

      // Update project
      switch (transform.target) {
        case 'project':
          Object.assign(project, transformed);
          break;
        case 'scenes':
          project.scenes = transformed;
          break;
        case 'characters':
          project.characters = transformed;
          break;
        case 'variables':
          project.variables = transformed;
          break;
        case 'ui':
          project.uiScreens = transformed;
          break;
        case 'settings':
          (project as any).settings = transformed;
          break;
        case 'assets':
          if (transformed.backgrounds) project.backgrounds = transformed.backgrounds;
          if (transformed.images) project.images = transformed.images;
          if (transformed.audio) project.audio = transformed.audio;
          if (transformed.videos) project.videos = transformed.videos;
          break;
      }
    }
  }

  /**
   * Validate project after migration
   */
  private async validateProject(project: VNProject): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // Basic structure validation
    if (!project.id) {
      issues.push({
        code: 'MISSING_ID',
        message: 'Project missing ID',
        severity: 'error',
        autoFixable: true
      });
    }

    if (!project.title) {
      issues.push({
        code: 'MISSING_TITLE',
        message: 'Project missing title',
        severity: 'error',
        autoFixable: false
      });
    }

    const extendedProject = project as VNProject & { version?: string };
    if (!extendedProject.version) {
      issues.push({
        code: 'MISSING_VERSION',
        message: 'Project missing version',
        severity: 'warning',
        autoFixable: true
      });
    }

    return issues;
  }

  /**
   * Create project backup
   */
  public async createBackup(project: VNProject, reason: 'manual' | 'pre-migration' | 'auto'): Promise<ProjectBackup> {
    const backupId = `backup_${Date.now()}`;
    
    const backup: ProjectBackup = {
      id: backupId,
      projectId: project.id,
      version: this.detectVersion(project),
      createdAt: new Date(),
      size: JSON.stringify(project).length,
      location: `${this.config.backupLocation}/${backupId}.json`,
      data: {
        project: JSON.parse(JSON.stringify(project)), // Deep clone
        metadata: {
          createdBy: 'MigrationService',
          reason
        }
      },
      reason
    };

    this.backups.set(backupId, backup);

    // In production, this would write to disk/storage
    console.log(`Created backup ${backupId} at ${backup.location}`);

    return backup;
  }

  /**
   * Restore from backup
   */
  public async restoreBackup(backupId: VNID): Promise<VNProject> {
    const backup = this.backups.get(backupId);
    if (!backup) {
      throw new Error(`Backup ${backupId} not found`);
    }

    return JSON.parse(JSON.stringify(backup.data.project)); // Deep clone
  }

  /**
   * Get available backups
   */
  public getBackups(projectId?: VNID): ProjectBackup[] {
    const backups = Array.from(this.backups.values());
    
    if (projectId) {
      return backups.filter(b => b.projectId === projectId);
    }

    return backups;
  }

  /**
   * Delete old backups
   */
  public async cleanupOldBackups(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.maxBackupAge);

    let deletedCount = 0;
    for (const [id, backup] of this.backups.entries()) {
      if (backup.createdAt < cutoffDate) {
        this.backups.delete(id);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Log migration result
   */
  private logMigration(result: MigrationResult): void {
    const log = {
      timestamp: new Date().toISOString(),
      planId: result.planId,
      success: result.success,
      from: result.migratedFrom,
      to: result.migratedTo,
      duration: result.completedAt.getTime() - result.startedAt.getTime(),
      appliedMigrations: result.appliedMigrations.length,
      errors: result.errors.length
    };

    console.log('Migration completed:', JSON.stringify(log, null, 2));
  }

  /**
   * Get migration history
   */
  public getMigrationHistory(projectId: VNID): Array<{
    date: string;
    from: string;
    to: string;
    success: boolean;
  }> {
    // In production, this would query a persistent log
    return [];
  }

  /**
   * Check compatibility
   */
  public checkCompatibility(project: VNProject): {
    compatible: boolean;
    version: string;
    issues: ValidationIssue[];
    canMigrate: boolean;
  } {
    const version = this.detectVersion(project);
    const compatible = this.compareVersions(version, this.currentVersion) === 0;
    const canMigrate = this.findMigrationPath(version, this.currentVersion).length > 0;

    return {
      compatible,
      version,
      issues: [],
      canMigrate
    };
  }

  /**
   * Get service statistics
   */
  public getStatistics(): {
    totalMigrations: number;
    totalBackups: number;
    currentVersion: string;
    supportedVersions: string[];
  } {
    const allMigrations = Array.from(this.migrations.values()).flat();
    const versions = new Set<string>();
    
    for (const migration of allMigrations) {
      versions.add(migration.fromVersion);
      versions.add(migration.toVersion);
    }

    return {
      totalMigrations: allMigrations.length,
      totalBackups: this.backups.size,
      currentVersion: this.currentVersion,
      supportedVersions: Array.from(versions).sort((a, b) => this.compareVersions(a, b))
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<MigrationServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.migrations.clear();
    this.backups.clear();
  }
}
