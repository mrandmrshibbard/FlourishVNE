/**
 * Workflow Optimization Tracker for FlourishVNE
 * 
 * Purpose: Track and optimize user workflows for efficiency improvements
 * Features: Action timing, workflow patterns, optimization suggestions
 * 
 * User Story: US2 - Streamlined Interface Navigation
 * Task: T037
 */

/**
 * Workflow action
 */
export interface WorkflowAction {
  id: string;
  action: string;
  context: string;
  timestamp: Date;
  duration?: number;
  success: boolean;
}

/**
 * Workflow pattern
 */
export interface WorkflowPattern {
  id: string;
  actions: string[];
  frequency: number;
  averageDuration: number;
  lastOccurred: Date;
}

/**
 * Workflow statistics
 */
export interface WorkflowStats {
  totalActions: number;
  averageActionTime: number;
  mostCommonActions: Array<{ action: string; count: number }>;
  commonPatterns: WorkflowPattern[];
  efficiencyScore: number;
}

/**
 * Workflow Tracker Service
 */
export class WorkflowTracker {
  private static instance: WorkflowTracker;
  private actions: WorkflowAction[] = [];
  private patterns: Map<string, WorkflowPattern> = new Map();
  private maxActions = 1000;
  private currentActionStart?: Date;
  private currentAction?: string;

  private constructor() {}

  public static getInstance(): WorkflowTracker {
    if (!WorkflowTracker.instance) {
      WorkflowTracker.instance = new WorkflowTracker();
    }
    return WorkflowTracker.instance;
  }

  /**
   * Start tracking an action
   */
  public startAction(action: string, context: string): void {
    this.currentAction = action;
    this.currentActionStart = new Date();
  }

  /**
   * End tracking current action
   */
  public endAction(success: boolean = true): void {
    if (!this.currentAction || !this.currentActionStart) return;

    const duration = Date.now() - this.currentActionStart.getTime();
    
    const workflowAction: WorkflowAction = {
      id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      action: this.currentAction,
      context: '',
      timestamp: this.currentActionStart,
      duration,
      success
    };

    this.actions.unshift(workflowAction);
    
    // Limit stored actions
    if (this.actions.length > this.maxActions) {
      this.actions = this.actions.slice(0, this.maxActions);
    }

    // Analyze patterns
    this.analyzePatterns();

    this.currentAction = undefined;
    this.currentActionStart = undefined;
  }

  /**
   * Track simple action without duration
   */
  public trackAction(action: string, context: string): void {
    this.startAction(action, context);
    this.endAction(true);
  }

  /**
   * Analyze workflow patterns
   */
  private analyzePatterns(): void {
    // Look for sequences of 3+ actions
    if (this.actions.length < 3) return;

    const recentActions = this.actions.slice(0, 5).map(a => a.action);
    const patternKey = recentActions.join('->');

    const existing = this.patterns.get(patternKey);
    if (existing) {
      existing.frequency++;
      existing.lastOccurred = new Date();
    } else {
      this.patterns.set(patternKey, {
        id: patternKey,
        actions: recentActions,
        frequency: 1,
        averageDuration: 0,
        lastOccurred: new Date()
      });
    }
  }

  /**
   * Get workflow statistics
   */
  public getStatistics(): WorkflowStats {
    const totalActions = this.actions.length;
    const successfulActions = this.actions.filter(a => a.success).length;
    
    // Calculate average action time
    const actionsWithDuration = this.actions.filter(a => a.duration !== undefined);
    const averageActionTime = actionsWithDuration.length > 0
      ? actionsWithDuration.reduce((sum, a) => sum + (a.duration || 0), 0) / actionsWithDuration.length
      : 0;

    // Get most common actions
    const actionCounts = new Map<string, number>();
    this.actions.forEach(a => {
      actionCounts.set(a.action, (actionCounts.get(a.action) || 0) + 1);
    });
    
    const mostCommonActions = Array.from(actionCounts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Get common patterns
    const commonPatterns = Array.from(this.patterns.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    // Calculate efficiency score (0-100)
    const efficiencyScore = totalActions > 0
      ? Math.min(100, Math.round((successfulActions / totalActions) * 100))
      : 100;

    return {
      totalActions,
      averageActionTime,
      mostCommonActions,
      commonPatterns,
      efficiencyScore
    };
  }

  /**
   * Get optimization suggestions
   */
  public getOptimizationSuggestions(): string[] {
    const suggestions: string[] = [];
    const stats = this.getStatistics();

    // Suggest keyboard shortcuts for common actions
    if (stats.mostCommonActions.length > 0) {
      const topAction = stats.mostCommonActions[0];
      if (topAction.count > 10) {
        suggestions.push(`Consider using keyboard shortcuts for "${topAction.action}" (used ${topAction.count} times)`);
      }
    }

    // Suggest templates for repeated patterns
    if (stats.commonPatterns.length > 0) {
      const topPattern = stats.commonPatterns[0];
      if (topPattern.frequency > 3) {
        suggestions.push(`You frequently perform: ${topPattern.actions.join(' → ')}. Consider using a template!`);
      }
    }

    // Efficiency suggestions
    if (stats.efficiencyScore < 80) {
      suggestions.push('Try using the preview feature more often to catch issues early');
    }

    return suggestions;
  }

  /**
   * Clear tracking data
   */
  public clearData(): void {
    this.actions = [];
    this.patterns.clear();
  }
}

export const workflowTracker = WorkflowTracker.getInstance();
export default workflowTracker;
