/**
 * Progressive Disclosure System for FlourishVNE
 * 
 * Purpose: Show advanced features only when users need them
 * Features: Smart feature gating, user proficiency tracking, gradual unlock
 * 
 * User Story: US2 - Streamlined Interface Navigation
 * Task: T032
 */

/**
 * User proficiency levels
 */
export type ProficiencyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

/**
 * Feature categories
 */
export type FeatureCategory = 
  | 'basic-editing'
  | 'advanced-logic'
  | 'template-customization'
  | 'visual-logic'
  | 'performance-tuning'
  | 'advanced-variables'
  | 'custom-scripting';

/**
 * Feature metadata
 */
export interface Feature {
  id: string;
  name: string;
  description: string;
  category: FeatureCategory;
  requiredLevel: ProficiencyLevel;
  dependencies?: string[];
  usageCount: number;
  lastUsed?: Date;
  unlocked: boolean;
}

/**
 * User progress tracking
 */
export interface UserProgress {
  level: ProficiencyLevel;
  experiencePoints: number;
  completedTasks: string[];
  unlockedFeatures: string[];
  createdAt: Date;
  lastActive: Date;
}

/**
 * Progressive Disclosure Service
 */
export class ProgressiveDisclosure {
  private static instance: ProgressiveDisclosure;
  private features: Map<string, Feature> = new Map();
  private userProgress: UserProgress;
  private storageKey = 'flourish_user_progress';
  private listeners: Set<(progress: UserProgress) => void> = new Set();

  private constructor() {
    this.userProgress = this.loadProgress();
    this.initializeFeatures();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ProgressiveDisclosure {
    if (!ProgressiveDisclosure.instance) {
      ProgressiveDisclosure.instance = new ProgressiveDisclosure();
    }
    return ProgressiveDisclosure.instance;
  }

  /**
   * Initialize feature definitions
   */
  private initializeFeatures(): void {
    const featureDefinitions: Feature[] = [
      // Basic features (always available)
      {
        id: 'scene-creation',
        name: 'Scene Creation',
        description: 'Create and edit basic scenes',
        category: 'basic-editing',
        requiredLevel: 'beginner',
        usageCount: 0,
        unlocked: true
      },
      {
        id: 'character-management',
        name: 'Character Management',
        description: 'Add and customize characters',
        category: 'basic-editing',
        requiredLevel: 'beginner',
        usageCount: 0,
        unlocked: true
      },
      {
        id: 'dialogue-editing',
        name: 'Dialogue Editing',
        description: 'Write and edit dialogue',
        category: 'basic-editing',
        requiredLevel: 'beginner',
        usageCount: 0,
        unlocked: true
      },

      // Intermediate features
      {
        id: 'choice-branching',
        name: 'Choice Branching',
        description: 'Create branching story paths',
        category: 'advanced-logic',
        requiredLevel: 'intermediate',
        dependencies: ['scene-creation', 'dialogue-editing'],
        usageCount: 0,
        unlocked: false
      },
      {
        id: 'variable-management',
        name: 'Variable Management',
        description: 'Create and manage story variables',
        category: 'advanced-logic',
        requiredLevel: 'intermediate',
        usageCount: 0,
        unlocked: false
      },
      {
        id: 'template-usage',
        name: 'Template Usage',
        description: 'Use pre-built templates',
        category: 'template-customization',
        requiredLevel: 'intermediate',
        dependencies: ['scene-creation'],
        usageCount: 0,
        unlocked: false
      },

      // Advanced features
      {
        id: 'visual-logic-builder',
        name: 'Visual Logic Builder',
        description: 'Build complex logic with visual nodes',
        category: 'visual-logic',
        requiredLevel: 'advanced',
        dependencies: ['choice-branching', 'variable-management'],
        usageCount: 0,
        unlocked: false
      },
      {
        id: 'template-customization',
        name: 'Template Customization',
        description: 'Customize and create templates',
        category: 'template-customization',
        requiredLevel: 'advanced',
        dependencies: ['template-usage'],
        usageCount: 0,
        unlocked: false
      },
      {
        id: 'advanced-variables',
        name: 'Advanced Variables',
        description: 'Complex variable relationships and formulas',
        category: 'advanced-variables',
        requiredLevel: 'advanced',
        dependencies: ['variable-management'],
        usageCount: 0,
        unlocked: false
      },

      // Expert features
      {
        id: 'performance-optimization',
        name: 'Performance Optimization',
        description: 'Fine-tune project performance',
        category: 'performance-tuning',
        requiredLevel: 'expert',
        dependencies: ['visual-logic-builder', 'advanced-variables'],
        usageCount: 0,
        unlocked: false
      },
      {
        id: 'custom-scripting',
        name: 'Custom Scripting',
        description: 'Write custom JavaScript logic',
        category: 'custom-scripting',
        requiredLevel: 'expert',
        dependencies: ['visual-logic-builder'],
        usageCount: 0,
        unlocked: false
      }
    ];

    featureDefinitions.forEach(feature => {
      this.features.set(feature.id, feature);
    });

    // Unlock features based on current progress
    this.evaluateUnlocks();
  }

  /**
   * Check if feature is unlocked
   */
  public isFeatureUnlocked(featureId: string): boolean {
    const feature = this.features.get(featureId);
    return feature?.unlocked || false;
  }

  /**
   * Get feature details
   */
  public getFeature(featureId: string): Feature | null {
    return this.features.get(featureId) || null;
  }

  /**
   * Get all features for a category
   */
  public getFeaturesByCategory(category: FeatureCategory): Feature[] {
    return Array.from(this.features.values())
      .filter(f => f.category === category);
  }

  /**
   * Get unlocked features
   */
  public getUnlockedFeatures(): Feature[] {
    return Array.from(this.features.values())
      .filter(f => f.unlocked);
  }

  /**
   * Get locked features
   */
  public getLockedFeatures(): Feature[] {
    return Array.from(this.features.values())
      .filter(f => !f.unlocked);
  }

  /**
   * Track feature usage
   */
  public trackFeatureUsage(featureId: string): void {
    const feature = this.features.get(featureId);
    if (feature && feature.unlocked) {
      feature.usageCount++;
      feature.lastUsed = new Date();
      
      // Award experience points
      this.awardExperience(5);
      
      // Check for new unlocks
      this.evaluateUnlocks();
      
      this.persistProgress();
      this.notifyListeners();
    }
  }

  /**
   * Complete a task (awards experience)
   */
  public completeTask(taskId: string, experiencePoints: number = 10): void {
    if (!this.userProgress.completedTasks.includes(taskId)) {
      this.userProgress.completedTasks.push(taskId);
      this.awardExperience(experiencePoints);
      this.evaluateUnlocks();
      this.persistProgress();
      this.notifyListeners();
    }
  }

  /**
   * Award experience points
   */
  private awardExperience(points: number): void {
    this.userProgress.experiencePoints += points;
    this.userProgress.lastActive = new Date();
    
    // Check for level up
    const newLevel = this.calculateLevel(this.userProgress.experiencePoints);
    if (newLevel !== this.userProgress.level) {
      this.userProgress.level = newLevel;
    }
  }

  /**
   * Calculate proficiency level from experience
   */
  private calculateLevel(experience: number): ProficiencyLevel {
    if (experience >= 500) return 'expert';
    if (experience >= 200) return 'advanced';
    if (experience >= 50) return 'intermediate';
    return 'beginner';
  }

  /**
   * Evaluate and unlock features based on progress
   */
  private evaluateUnlocks(): void {
    let unlockedSomething = false;

    this.features.forEach(feature => {
      if (feature.unlocked) return;

      // Check level requirement
      if (!this.meetsLevelRequirement(feature.requiredLevel)) return;

      // Check dependencies
      if (feature.dependencies && !this.meetsDependencies(feature.dependencies)) return;

      // Unlock feature
      feature.unlocked = true;
      this.userProgress.unlockedFeatures.push(feature.id);
      unlockedSomething = true;
    });

    if (unlockedSomething) {
      this.persistProgress();
      this.notifyListeners();
    }
  }

  /**
   * Check if user meets level requirement
   */
  private meetsLevelRequirement(required: ProficiencyLevel): boolean {
    const levelOrder: ProficiencyLevel[] = ['beginner', 'intermediate', 'advanced', 'expert'];
    const userIndex = levelOrder.indexOf(this.userProgress.level);
    const requiredIndex = levelOrder.indexOf(required);
    return userIndex >= requiredIndex;
  }

  /**
   * Check if dependencies are met
   */
  private meetsDependencies(dependencies: string[]): boolean {
    return dependencies.every(depId => {
      const feature = this.features.get(depId);
      return feature?.unlocked || false;
    });
  }

  /**
   * Get current user progress
   */
  public getProgress(): UserProgress {
    return { ...this.userProgress };
  }

  /**
   * Get progress statistics
   */
  public getStatistics() {
    const total = this.features.size;
    const unlocked = this.getUnlockedFeatures().length;
    const locked = this.getLockedFeatures().length;

    return {
      level: this.userProgress.level,
      experiencePoints: this.userProgress.experiencePoints,
      nextLevelAt: this.getNextLevelExperience(),
      totalFeatures: total,
      unlockedFeatures: unlocked,
      lockedFeatures: locked,
      completedTasks: this.userProgress.completedTasks.length,
      unlockProgress: Math.round((unlocked / total) * 100)
    };
  }

  /**
   * Get experience needed for next level
   */
  private getNextLevelExperience(): number {
    const current = this.userProgress.level;
    switch (current) {
      case 'beginner': return 50;
      case 'intermediate': return 200;
      case 'advanced': return 500;
      case 'expert': return 500; // Max level
    }
  }

  /**
   * Manually unlock feature (for testing or admin)
   */
  public manuallyUnlockFeature(featureId: string): boolean {
    const feature = this.features.get(featureId);
    if (feature && !feature.unlocked) {
      feature.unlocked = true;
      if (!this.userProgress.unlockedFeatures.includes(featureId)) {
        this.userProgress.unlockedFeatures.push(featureId);
      }
      this.persistProgress();
      this.notifyListeners();
      return true;
    }
    return false;
  }

  /**
   * Reset progress (for testing)
   */
  public resetProgress(): void {
    this.userProgress = {
      level: 'beginner',
      experiencePoints: 0,
      completedTasks: [],
      unlockedFeatures: [],
      createdAt: new Date(),
      lastActive: new Date()
    };

    this.features.forEach(feature => {
      feature.unlocked = feature.requiredLevel === 'beginner';
      feature.usageCount = 0;
      feature.lastUsed = undefined;
    });

    this.persistProgress();
    this.notifyListeners();
  }

  /**
   * Load progress from storage
   */
  private loadProgress(): UserProgress {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        return {
          ...data,
          createdAt: new Date(data.createdAt),
          lastActive: new Date(data.lastActive)
        };
      }
    } catch (error) {
      console.warn('Failed to load user progress:', error);
    }

    // Default progress
    return {
      level: 'beginner',
      experiencePoints: 0,
      completedTasks: [],
      unlockedFeatures: [],
      createdAt: new Date(),
      lastActive: new Date()
    };
  }

  /**
   * Persist progress to storage
   */
  private persistProgress(): void {
    try {
      const data = {
        ...this.userProgress,
        createdAt: this.userProgress.createdAt.toISOString(),
        lastActive: this.userProgress.lastActive.toISOString()
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to persist user progress:', error);
    }
  }

  /**
   * Add progress listener
   */
  public addListener(callback: (progress: UserProgress) => void): void {
    this.listeners.add(callback);
  }

  /**
   * Remove progress listener
   */
  public removeListener(callback: (progress: UserProgress) => void): void {
    this.listeners.delete(callback);
  }

  /**
   * Notify listeners of progress change
   */
  private notifyListeners(): void {
    this.listeners.forEach(callback => {
      try {
        callback(this.getProgress());
      } catch (error) {
        console.error('Progress listener error:', error);
      }
    });
  }
}

/**
 * Singleton instance export
 */
export const progressiveDisclosure = ProgressiveDisclosure.getInstance();

export default progressiveDisclosure;
