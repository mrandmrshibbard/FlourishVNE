import { VNID } from './index';

// Context panel types and interfaces for dynamic UI assistance

export type ContextPanelType = 
  | 'contextual-help'
  | 'smart-suggestions'
  | 'quick-reference'
  | 'property-inspector'
  | 'validation-results'
  | 'performance-insights';

export type ContextProviderType = 
  | 'scene'
  | 'character'
  | 'variable'
  | 'template'
  | 'logic'
  | 'help'
  | 'validation'
  | 'performance';

export type ContextScope = 
  | 'global'
  | 'project'
  | 'scene'
  | 'character'
  | 'command'
  | 'variable'
  | 'logic'
  | 'asset';

export type ContextPriority = 'high' | 'medium' | 'low';

export type ContextActionType = 
  | 'create'
  | 'edit'
  | 'delete'
  | 'navigate'
  | 'execute'
  | 'validate'
  | 'analyze'
  | 'modify'
  | 'copy'
  | 'export';

export type ContextSuggestionType = 
  | 'action'
  | 'suggestion'
  | 'tip'
  | 'warning'
  | 'help'
  | 'template'
  | 'asset'
  | 'validation'
  | 'insight';

export type ContextTrigger = 
  | 'scene-selected'
  | 'scene-editing'
  | 'scene-changed'
  | 'character-selected'
  | 'character-editing'
  | 'character-changed'
  | 'dialogue-editing'
  | 'command-added'
  | 'command-edited'
  | 'command-selected'
  | 'variable-referenced'
  | 'variable-changed'
  | 'condition-editing'
  | 'logic-editing'
  | 'node-selected'
  | 'connection-creating'
  | 'template-browsing'
  | 'content-creation'
  | 'empty-scene'
  | 'error-encountered'
  | 'validation-failed'
  | 'first-time-user'
  | 'feature-discovery'
  | 'tab-changed'
  | 'selection-changed'
  | 'search-performed'
  | 'filter-applied';

// Core context panel interface
export interface ContextPanel {
  id: VNID;
  type: ContextPanelType;
  title: string;
  content: ContextInfo;
  isVisible: boolean;
  isCollapsed: boolean;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  priority: ContextPriority;
  scope: ContextScope;
  lastUpdated: Date;
  autoHide: boolean;
  actions: ContextAction[];
  triggers: ContextTrigger[];
}

// Context information container
export interface ContextInfo {
  title: string;
  summary: string;
  items: ContextItem[];
  suggestions?: ContextSuggestion[];
  actions?: ContextAction[];
  metadata: Record<string, any>;
}

// Individual context item
export interface ContextItem {
  id: VNID;
  type: string;
  title: string;
  description?: string;
  value?: any;
  relevance: number;
  metadata: Record<string, any>;
  actions?: ContextAction[];
}

// Context action definition
export interface ContextAction {
  id: VNID;
  type: ContextActionType;
  label: string;
  description: string;
  icon: string;
  handler: string;
  params: Record<string, any>;
  shortcut?: string;
  isEnabled?: boolean;
  confirmationRequired?: boolean;
  confirmationMessage?: string;
}

// Context suggestion for smart assistance
export interface ContextSuggestion {
  id: VNID;
  type: ContextSuggestionType;
  title: string;
  description: string;
  relevance: number;
  action: ContextAction;
  metadata: Record<string, any>;
  conditions?: ContextCondition[];
  dismissible?: boolean;
  persistent?: boolean;
}

// Context condition for suggestion display
export interface ContextCondition {
  field: string;
  operator: 'equals' | 'not-equals' | 'contains' | 'not-contains' | 'greater' | 'less' | 'exists' | 'not-exists';
  value: any;
  metadata?: Record<string, any>;
}

// Context provider interface
export interface ContextProvider {
  id: VNID;
  type: ContextProviderType;
  name: string;
  description: string;
  isActive: boolean;
  priority: ContextPriority;
  scope: ContextScope;
  triggers: ContextTrigger[];
  config: Record<string, any>;
  
  // Provider methods
  provideContext(editorState: any): Promise<ContextInfo | null>;
  canProvideContext(editorState: any): boolean;
}

// Context rule for automated suggestions
export interface ContextRule {
  id: VNID;
  name: string;
  description: string;
  isActive: boolean;
  priority: ContextPriority;
  scope: ContextScope;
  triggers: ContextTrigger[];
  conditions: ContextCondition[];
  actions: ContextRuleAction[];
  metadata: Record<string, any>;
}

// Context rule action
export interface ContextRuleAction {
  type: 'show-suggestion' | 'show-warning' | 'auto-fix' | 'highlight' | 'navigate';
  config: Record<string, any>;
  delay?: number;
  duration?: number;
}

// Context analytics and insights
export interface ContextAnalytics {
  panelViews: Record<VNID, number>;
  suggestionClicks: Record<VNID, number>;
  actionExecutions: Record<VNID, number>;
  dismissedSuggestions: VNID[];
  averageResponseTime: number;
  userFeedback: ContextFeedback[];
  usagePatterns: ContextUsagePattern[];
}

// User feedback on context suggestions
export interface ContextFeedback {
  suggestionId: VNID;
  userId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  timestamp: Date;
  helpful: boolean;
}

// Context usage patterns for optimization
export interface ContextUsagePattern {
  trigger: ContextTrigger;
  frequency: number;
  avgResponseTime: number;
  successRate: number;
  commonActions: string[];
  timeOfDay: string[];
  contextTypes: ContextPanelType[];
}

// Context validation result
export interface ContextValidationResult {
  isValid: boolean;
  errors: ContextValidationError[];
  warnings: ContextValidationWarning[];
  suggestions: ContextValidationSuggestion[];
  metadata: Record<string, any>;
}

// Context validation error
export interface ContextValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  location?: {
    panelId?: VNID;
    providerId?: VNID;
    field?: string;
  };
  suggestion?: string;
}

// Context validation warning
export interface ContextValidationWarning {
  code: string;
  message: string;
  suggestion: string;
  location?: {
    panelId?: VNID;
    providerId?: VNID;
    field?: string;
  };
}

// Context validation suggestion
export interface ContextValidationSuggestion {
  code: string;
  message: string;
  action: ContextAction;
  priority: ContextPriority;
}

// Context theme and appearance
export interface ContextTheme {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  accentColor: string;
  spacing: {
    small: number;
    medium: number;
    large: number;
  };
  typography: {
    fontFamily: string;
    fontSize: {
      small: number;
      medium: number;
      large: number;
    };
    fontWeight: {
      normal: number;
      bold: number;
    };
  };
  animations: {
    duration: number;
    easing: string;
    enabled: boolean;
  };
}

// Context accessibility settings
export interface ContextAccessibility {
  enableScreenReader: boolean;
  enableHighContrast: boolean;
  enableReducedMotion: boolean;
  fontSize: 'small' | 'medium' | 'large' | 'extra-large';
  keyboardNavigation: boolean;
  focusIndicators: boolean;
  tooltipDelay: number;
  autoReadContent: boolean;
}

// Context search and filtering
export interface ContextSearch {
  query: string;
  filters: ContextFilter[];
  sortBy: 'relevance' | 'date' | 'priority' | 'type';
  sortOrder: 'asc' | 'desc';
  includeArchived: boolean;
  maxResults: number;
}

// Context filter
export interface ContextFilter {
  field: string;
  operator: 'equals' | 'contains' | 'starts-with' | 'ends-with' | 'range';
  value: any;
  isActive: boolean;
}

// Context export options
export interface ContextExportOptions {
  format: 'json' | 'xml' | 'csv' | 'pdf' | 'html';
  includePanels: boolean;
  includeProviders: boolean;
  includeAnalytics: boolean;
  includeHistory: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  filters?: ContextFilter[];
}

// Context import options
export interface ContextImportOptions {
  format: 'json' | 'xml' | 'csv';
  mergeStrategy: 'replace' | 'merge' | 'append';
  validateBeforeImport: boolean;
  createBackup: boolean;
  importPanels: boolean;
  importProviders: boolean;
  importRules: boolean;
}

// Context performance metrics
export interface ContextPerformanceMetrics {
  panelRenderTime: Record<VNID, number>;
  providerResponseTime: Record<ContextProviderType, number>;
  memoryUsage: number;
  cpuUsage: number;
  totalContextUpdates: number;
  averageUpdateTime: number;
  cacheHitRate: number;
  errorRate: number;
}

// Context cache configuration
export interface ContextCacheConfig {
  enabled: boolean;
  maxSize: number;
  ttl: number; // Time to live in milliseconds
  strategy: 'lru' | 'fifo' | 'ttl';
  compression: boolean;
  persistToDisk: boolean;
}

// Context notification settings
export interface ContextNotificationSettings {
  enabled: boolean;
  showSuggestions: boolean;
  showWarnings: boolean;
  showErrors: boolean;
  showTips: boolean;
  playSound: boolean;
  soundVolume: number;
  showDesktopNotifications: boolean;
  autoHideDelay: number;
  maxVisibleNotifications: number;
}