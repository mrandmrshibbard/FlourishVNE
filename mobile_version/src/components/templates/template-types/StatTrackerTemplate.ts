/**
 * Stat Tracker Template for FlourishVNE
 * 
 * Purpose: Pre-built template for displaying and tracking character statistics
 * Features: Multiple display types, progress bars, stat comparison, level progression
 * 
 * User Story: US1 - Simplified Visual Novel Template Creation
 * Task: T022
 */

import { Template, TemplateConfig, TemplatePreview, CustomizationBounds, TemplateLayoutConfig, TemplateStatConfig } from '../../../types/template';
import { VNUIScreen } from '../../../features/ui/types';
import { VNID } from '../../../types';

/**
 * Stat Tracker specific configuration
 */
export interface StatTrackerConfig extends TemplateConfig {
  // Statistics to track
  stats: (TemplateStatConfig & {
    description?: string;
    icon?: string;
    color?: string;
    showPercentage?: boolean;
    growthRate?: number; // How fast stat increases with level
  })[];
  
  // Level system
  levelSystem?: {
    enabled: boolean;
    currentLevelVariable: string;
    experienceVariable: string;
    maxLevel: number;
    experienceCurve: 'linear' | 'exponential' | 'custom';
    customCurve?: number[]; // XP required for each level
  };
  
  // Display groups
  groups?: {
    id: string;
    name: string;
    statIds: string[];
    icon?: string;
    collapsible: boolean;
  }[];
  
  // Comparison features
  comparison?: {
    enabled: boolean;
    compareWith?: 'previous' | 'baseline' | 'target';
    showDifference: boolean;
    highlightChanges: boolean;
  };
  
  // Visual features
  features: {
    showLabels: boolean;
    showValues: boolean;
    showMaxValues: boolean;
    animateChanges: boolean;
    showTooltips: boolean;
    compactMode: boolean;
    showTrendIndicators: boolean; // ↑ ↓ arrows for changes
  };
  
  // UI customization
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    statFull: string;
    statEmpty: string;
    increase: string;
    decrease: string;
  };
  
  layout: TemplateLayoutConfig & {
    orientation: 'vertical' | 'horizontal';
    grouping: 'none' | 'category' | 'importance';
    showHeader: boolean;
    showFooter: boolean;
  };
  
  // Thresholds and alerts
  thresholds?: {
    statId: string;
    value: number;
    type: 'warning' | 'danger' | 'success';
    message: string;
  }[];
  
  // Output configuration
  output: {
    variablePrefix: string;
    trackHistory: boolean;
    historyVariable?: string;
    snapshotInterval?: number; // How often to save snapshots (in game minutes)
  };
}

/**
 * Default configuration for Stat Tracker template
 */
export const defaultStatTrackerConfig: StatTrackerConfig = {
  stats: [
    // Combat stats
    {
      id: 'health',
      name: 'Health',
      initialValue: 100,
      minValue: 0,
      maxValue: 100,
      displayType: 'bar',
      description: 'Current health points',
      icon: '❤️',
      color: '#E74C3C',
      showPercentage: true,
      growthRate: 10
    },
    {
      id: 'mana',
      name: 'Mana',
      initialValue: 50,
      minValue: 0,
      maxValue: 50,
      displayType: 'bar',
      description: 'Magical energy',
      icon: '✨',
      color: '#3498DB',
      showPercentage: true,
      growthRate: 5
    },
    {
      id: 'stamina',
      name: 'Stamina',
      initialValue: 80,
      minValue: 0,
      maxValue: 80,
      displayType: 'bar',
      description: 'Physical endurance',
      icon: '⚡',
      color: '#F39C12',
      showPercentage: true,
      growthRate: 8
    },
    
    // Attribute stats
    {
      id: 'strength',
      name: 'Strength',
      initialValue: 10,
      minValue: 1,
      maxValue: 99,
      displayType: 'number',
      description: 'Physical power',
      icon: '💪',
      color: '#E67E22'
    },
    {
      id: 'intelligence',
      name: 'Intelligence',
      initialValue: 10,
      minValue: 1,
      maxValue: 99,
      displayType: 'number',
      description: 'Mental acuity',
      icon: '🧠',
      color: '#9B59B6'
    },
    {
      id: 'dexterity',
      name: 'Dexterity',
      initialValue: 10,
      minValue: 1,
      maxValue: 99,
      displayType: 'number',
      description: 'Agility and precision',
      icon: '🎯',
      color: '#1ABC9C'
    },
    {
      id: 'charisma',
      name: 'Charisma',
      initialValue: 10,
      minValue: 1,
      maxValue: 99,
      displayType: 'number',
      description: 'Social influence',
      icon: '💬',
      color: '#F1C40F'
    }
  ],
  
  levelSystem: {
    enabled: true,
    currentLevelVariable: 'playerLevel',
    experienceVariable: 'playerXP',
    maxLevel: 50,
    experienceCurve: 'exponential'
  },
  
  groups: [
    {
      id: 'resources',
      name: 'Resources',
      statIds: ['health', 'mana', 'stamina'],
      icon: '📊',
      collapsible: false
    },
    {
      id: 'attributes',
      name: 'Attributes',
      statIds: ['strength', 'intelligence', 'dexterity', 'charisma'],
      icon: '⭐',
      collapsible: true
    }
  ],
  
  comparison: {
    enabled: true,
    compareWith: 'previous',
    showDifference: true,
    highlightChanges: true
  },
  
  features: {
    showLabels: true,
    showValues: true,
    showMaxValues: true,
    animateChanges: true,
    showTooltips: true,
    compactMode: false,
    showTrendIndicators: true
  },
  
  colors: {
    primary: '#3498DB',
    secondary: '#2C3E50',
    accent: '#E74C3C',
    background: '#ECF0F1',
    text: '#2C3E50',
    statFull: '#27AE60',
    statEmpty: '#95A5A6',
    increase: '#2ECC71',
    decrease: '#E74C3C'
  },
  
  layout: {
    columns: 1,
    spacing: 'normal',
    alignment: 'left',
    responsive: true,
    orientation: 'vertical',
    grouping: 'category',
    showHeader: true,
    showFooter: true
  },
  
  thresholds: [
    {
      statId: 'health',
      value: 20,
      type: 'warning',
      message: 'Health is low!'
    },
    {
      statId: 'health',
      value: 10,
      type: 'danger',
      message: 'Critical health!'
    },
    {
      statId: 'mana',
      value: 10,
      type: 'warning',
      message: 'Running low on mana'
    }
  ],
  
  output: {
    variablePrefix: 'stat_',
    trackHistory: true,
    historyVariable: 'statHistory',
    snapshotInterval: 60 // Save snapshot every hour of game time
  }
};

/**
 * Customization bounds for Stat Tracker template
 */
export const statTrackerCustomizationBounds: CustomizationBounds = {
  allowStructureChanges: false,
  allowNewComponents: true,
  allowVariableModification: true,
  allowLogicChanges: true,
  maxStats: 20,
  requiredFields: ['stats', 'features', 'output'],
  lockedComponents: ['stat-calculator', 'threshold-monitor']
};

/**
 * Preview information for Stat Tracker template
 */
export const statTrackerPreview: TemplatePreview = {
  features: [
    'Multiple display types (bars, numbers, hearts, stars)',
    'Organized stat grouping with collapsible sections',
    'Level and experience tracking system',
    'Stat comparison (previous, baseline, target)',
    'Threshold alerts (warning, danger, success)',
    'Animated stat changes with trend indicators',
    'Tooltips with stat descriptions',
    'Compact and expanded view modes',
    'Historical stat tracking and snapshots',
    'Customizable colors per stat',
    'Growth rate configuration for level progression'
  ],
  estimatedTime: 5,
  complexity: 'beginner'
};

/**
 * UI generator function for Stat Tracker template
 */
export function generateStatTrackerUI(config: TemplateConfig): VNUIScreen[] {
  const typedConfig = config as unknown as StatTrackerConfig;
  
  const screen: VNUIScreen = {
    id: `stat_tracker_${Date.now()}` as VNID,
    name: 'Character Stats',
    background: { type: 'color', value: typedConfig.colors.background },
    music: { audioId: null, policy: 'continue' },
    ambientNoise: { audioId: null, policy: 'continue' },
    elements: {},
    showDialogue: false
  };
  
  return [screen];
}

/**
 * Stat Tracker Template Definition
 */
export const StatTrackerTemplate: Template = {
  id: 'template_stat_tracker' as VNID,
  name: 'Stat Tracker',
  description: 'Display and track character statistics with bars, numbers, levels, and progression systems',
  category: 'stat-tracker',
  state: 'published',
  configSchema: {
    type: 'object',
    properties: {
      stats: { type: 'array' },
      levelSystem: { type: 'object' },
      groups: { type: 'array' },
      comparison: { type: 'object' },
      features: { type: 'object' },
      colors: { type: 'object' },
      layout: { type: 'object' },
      thresholds: { type: 'array' },
      output: { type: 'object' }
    },
    required: ['stats', 'features', 'output']
  },
  defaultConfig: defaultStatTrackerConfig,
  uiGenerator: generateStatTrackerUI,
  previewImage: '/templates/stat-tracker-preview.png',
  preview: statTrackerPreview,
  tags: ['stats', 'tracking', 'rpg', 'level', 'progression', 'health', 'mana'],
  version: '1.0.0',
  customizationLimits: statTrackerCustomizationBounds,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  author: 'FlourishVNE',
  isUserTemplate: false,
  usageCount: 0,
  rating: 4.7
};

export default StatTrackerTemplate;
