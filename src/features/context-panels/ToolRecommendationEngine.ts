/**
 * Context-Aware Tool Recommendation Engine for FlourishVNE
 * 
 * Purpose: Suggest relevant tools and actions based on current context
 * Features: Smart suggestions, usage patterns, contextual help
 * 
 * User Story: US2 - Streamlined Interface Navigation
 * Task: T033
 */

import { VNID } from '../../types';
import { progressiveDisclosure } from '../ui/ProgressiveDisclosure';

/**
 * Tool recommendation
 */
export interface ToolRecommendation {
  id: string;
  title: string;
  description: string;
  action: string;
  relevanceScore: number;
  category: 'next-step' | 'common-action' | 'feature-discovery' | 'help';
  learnMoreUrl?: string;
}

/**
 * Context for recommendations
 */
export interface RecommendationContext {
  currentTab: string;
  activeItemId?: VNID | null;
  recentActions: string[];
  projectState: {
    sceneCount: number;
    characterCount: number;
    hasVariables: boolean;
    hasChoices: boolean;
  };
}

/**
 * Tool Recommendation Engine
 */
export class ToolRecommendationEngine {
  private static instance: ToolRecommendationEngine;
  private actionHistory: string[] = [];
  private maxHistorySize = 20;

  private constructor() {}

  public static getInstance(): ToolRecommendationEngine {
    if (!ToolRecommendationEngine.instance) {
      ToolRecommendationEngine.instance = new ToolRecommendationEngine();
    }
    return ToolRecommendationEngine.instance;
  }

  /**
   * Get contextual recommendations
   */
  public getRecommendations(context: RecommendationContext): ToolRecommendation[] {
    const recommendations: ToolRecommendation[] = [];

    // Next-step recommendations
    recommendations.push(...this.getNextStepRecommendations(context));

    // Common action recommendations
    recommendations.push(...this.getCommonActionRecommendations(context));

    // Feature discovery recommendations
    recommendations.push(...this.getFeatureDiscoveryRecommendations(context));

    // Sort by relevance
    return recommendations
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);
  }

  /**
   * Get next-step recommendations
   */
  private getNextStepRecommendations(context: RecommendationContext): ToolRecommendation[] {
    const recs: ToolRecommendation[] = [];

    // Scene creation flow
    if (context.currentTab === 'scenes' && context.projectState.sceneCount === 0) {
      recs.push({
        id: 'create-first-scene',
        title: 'Create Your First Scene',
        description: 'Start your story by creating a scene',
        action: 'create-scene',
        relevanceScore: 10,
        category: 'next-step'
      });
    }

    // Add dialogue after scene creation
    if (context.currentTab === 'scenes' && context.activeItemId && context.recentActions.includes('create-scene')) {
      recs.push({
        id: 'add-dialogue',
        title: 'Add Dialogue',
        description: 'Bring your scene to life with dialogue',
        action: 'add-dialogue',
        relevanceScore: 9,
        category: 'next-step'
      });
    }

    // Character recommendations
    if (context.currentTab === 'characters' && context.projectState.characterCount === 0) {
      recs.push({
        id: 'create-first-character',
        title: 'Create a Character',
        description: 'Add your first character to the story',
        action: 'create-character',
        relevanceScore: 10,
        category: 'next-step'
      });
    }

    return recs;
  }

  /**
   * Get common action recommendations
   */
  private getCommonActionRecommendations(context: RecommendationContext): ToolRecommendation[] {
    const recs: ToolRecommendation[] = [];

    // Preview is always useful
    if (context.projectState.sceneCount > 0) {
      recs.push({
        id: 'preview-project',
        title: 'Preview Your Story',
        description: 'See how your story plays (F5)',
        action: 'preview',
        relevanceScore: 7,
        category: 'common-action'
      });
    }

    // Suggest variables after multiple scenes
    if (context.projectState.sceneCount >= 3 && !context.projectState.hasVariables) {
      recs.push({
        id: 'add-variables',
        title: 'Add Variables',
        description: 'Track story state with variables',
        action: 'goto-variables',
        relevanceScore: 6,
        category: 'common-action'
      });
    }

    return recs;
  }

  /**
   * Get feature discovery recommendations
   */
  private getFeatureDiscoveryRecommendations(context: RecommendationContext): ToolRecommendation[] {
    const recs: ToolRecommendation[] = [];
    const progress = progressiveDisclosure.getProgress();

    // Template discovery for intermediate users
    if (progress.level === 'intermediate' && progressiveDisclosure.isFeatureUnlocked('template-usage')) {
      recs.push({
        id: 'discover-templates',
        title: 'Try Templates',
        description: 'Speed up development with pre-built templates',
        action: 'goto-templates',
        relevanceScore: 5,
        category: 'feature-discovery'
      });
    }

    // Visual logic for advanced users
    if (progress.level === 'advanced' && progressiveDisclosure.isFeatureUnlocked('visual-logic-builder')) {
      recs.push({
        id: 'discover-visual-logic',
        title: 'Visual Logic Builder',
        description: 'Build complex branching with drag-and-drop',
        action: 'goto-logic',
        relevanceScore: 5,
        category: 'feature-discovery'
      });
    }

    return recs;
  }

  /**
   * Track user action
   */
  public trackAction(action: string): void {
    this.actionHistory.unshift(action);
    if (this.actionHistory.length > this.maxHistorySize) {
      this.actionHistory = this.actionHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Get action history
   */
  public getActionHistory(): string[] {
    return [...this.actionHistory];
  }
}

export const toolRecommendationEngine = ToolRecommendationEngine.getInstance();
export default toolRecommendationEngine;
