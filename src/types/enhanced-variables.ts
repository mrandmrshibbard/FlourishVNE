import { VNID } from './index';
import { VNCondition } from './shared';
import { VNVariable, VNVariableType, VNSetVariableOperator } from '../features/variables/types';

// Enhanced variable types extending base VN variable system
export type EnhancedVariableType = VNVariableType | 'object' | 'array' | 'date' | 'json' | 'expression';

// Extended operators for enhanced variable manipulation
export type EnhancedVariableOperator = 
  | VNSetVariableOperator
  | 'multiply'
  | 'divide'
  | 'modulo'
  | 'min'
  | 'max'
  | 'append'
  | 'prepend'
  | 'toggle'
  | 'increment'
  | 'decrement'
  | 'push'
  | 'pop'
  | 'shift'
  | 'unshift'
  | 'concat'
  | 'merge';

// Variable scopes for organization and access control
export type VariableScope = 'global' | 'scene' | 'character' | 'session' | 'temporary' | 'persistent';

// Variable categories for organization
export type VariableCategory = 
  | 'character-stats'
  | 'game-state'
  | 'inventory'
  | 'relationships'
  | 'achievements'
  | 'preferences'
  | 'system'
  | 'temporary'
  | 'custom';

// Variable validation types
export type VariableValidationType = 
  | 'required'
  | 'range'
  | 'pattern'
  | 'custom'
  | 'enum'
  | 'type-check';

// Variable persistence levels
export type PersistenceLevel = 'none' | 'session' | 'save-file' | 'global-settings' | 'cloud';

// Enhanced variable with additional features
export interface EnhancedVariable extends VNVariable {
  // Enhanced type system
  enhancedType: EnhancedVariableType;
  subType?: string; // For arrays/objects: element type
  
  // Organization and metadata
  category: VariableCategory;
  scope: VariableScope;
  description?: string;
  tags: string[];
  
  // Value constraints and validation
  validation: VariableValidation;
  constraints: VariableConstraints;
  
  // Persistence and lifecycle
  persistence: PersistenceLevel;
  isReadOnly: boolean;
  isSystem: boolean;
  
  // Relationship tracking
  dependencies: VNID[]; // Variables this depends on
  dependents: VNID[]; // Variables that depend on this
  relationships: VNID[]; // Variable relationships
  
  // Performance and usage tracking
  usage: VariableUsageInfo;
  performance: VariablePerformance;
  
  // History and debugging
  history: VariableHistoryEntry[];
  lastModified: Date;
  lastAccessed: Date;
  createdAt: Date;
  modificationCount: number;
  
  // UI and display
  displayOptions: VariableDisplayOptions;
  
  // Backup and versioning
  version: number;
  backupValue?: any;
  canRollback: boolean;
}

// Variable validation configuration
export interface VariableValidation {
  rules: ValidationRule[];
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  lastValidated: Date;
}

export interface ValidationRule {
  type: VariableValidationType;
  config: Record<string, any>;
  message: string;
  severity: 'error' | 'warning' | 'info';
  enabled: boolean;
}

export interface ValidationError {
  rule: string;
  message: string;
  value: any;
  timestamp: Date;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  rule: string;
  message: string;
  impact: 'low' | 'medium' | 'high';
  suggestion?: string;
}

// Variable constraints for value limits
export interface VariableConstraints {
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  allowedValues?: any[];
  pattern?: string;
  required: boolean;
  unique: boolean;
  immutable: boolean;
}

// Variable usage tracking
export interface VariableUsageInfo {
  readCount: number;
  writeCount: number;
  lastRead: Date;
  lastWrite: Date;
  accessLocations: AccessLocation[];
  hotspots: UsageHotspot[];
}

export interface AccessLocation {
  sceneId?: VNID;
  componentId?: VNID;
  commandIndex?: number;
  accessType: 'read' | 'write' | 'reference';
  timestamp: Date;
  context?: string;
}

export interface UsageHotspot {
  location: string;
  accessCount: number;
  averageFrequency: number; // accesses per session
  lastAccess: Date;
}

// Performance tracking for optimization
export interface VariablePerformance {
  evaluationTime: number; // milliseconds
  memoryUsage: number; // bytes
  updateFrequency: number; // updates per minute
  dependencyDepth: number;
  optimizationScore: number; // 0-100
  bottleneckRisk: 'low' | 'medium' | 'high';
}

// Variable history for debugging and rollback
export interface VariableHistoryEntry {
  id: string;
  timestamp: Date;
  oldValue: any;
  newValue: any;
  operation: EnhancedVariableOperator;
  sourceId?: VNID; // What triggered the change
  sourceType?: 'user' | 'script' | 'relationship' | 'system';
  context?: Record<string, any>;
}

// UI display configuration
export interface VariableDisplayOptions {
  showInDebugger: boolean;
  debuggerFormat: 'raw' | 'formatted' | 'custom';
  debuggerColor?: string;
  debuggerIcon?: string;
  inspectorVisible: boolean;
  inspectorOrder: number;
  grouping?: string;
  customRenderer?: string;
}

// Variable relationship for automatic updates
export interface VariableRelationship {
  id: VNID;
  sourceVariableId: VNID;
  targetVariableId: VNID;
  relationshipType: RelationshipType;
  formula: string;
  condition?: VNCondition;
  priority: number;
  isActive: boolean;
  isEnabled: boolean;
  lastExecuted: Date;
  executionCount: number;
  averageExecutionTime: number;
  errors: RelationshipError[];
}

export type RelationshipType = 
  | 'formula'       // Mathematical calculation
  | 'mirror'        // Copy value exactly
  | 'inverse'       // Opposite value
  | 'aggregate'     // Sum/average multiple variables
  | 'conditional'   // Update based on condition
  | 'transform'     // Convert value format
  | 'throttled'     // Update with delay/limit
  | 'custom';       // User-defined logic

export interface RelationshipError {
  timestamp: Date;
  error: string;
  context: Record<string, any>;
  recovered: boolean;
}

// Variable dependency graph for analysis
export interface DependencyNode {
  variableId: VNID;
  dependsOn: VNID[];
  dependents: VNID[];
  depth: number;
  cyclic: boolean;
  weight: number; // impact factor
}

export interface DependencyGraph {
  nodes: Record<VNID, DependencyNode>;
  relationships: VariableRelationship[];
  circularDependencies: VNID[][];
  orphanedVariables: VNID[];
  criticalPath: VNID[];
  maxDepth: number;
  totalRelationships: number;
}

// Variable state monitoring and debugging
export interface StateMonitor {
  id: VNID;
  name: string;
  trackedVariables: VNID[];
  isActive: boolean;
  isRecording: boolean;
  
  // Real-time state
  currentValues: Record<VNID, any>;
  pendingUpdates: VariableUpdate[];
  lastSnapshot: Date;
  
  // Debugging features
  breakpoints: VariableBreakpoint[];
  watchExpressions: WatchExpression[];
  callStack: VariableCallStack[];
  
  // Performance monitoring
  performanceMetrics: MonitorPerformanceMetrics;
  
  // Session data
  sessionStartTime: Date;
  totalUpdates: number;
  errorCount: number;
  warningCount: number;
}

export interface VariableUpdate {
  variableId: VNID;
  oldValue: any;
  newValue: any;
  operation: EnhancedVariableOperator;
  timestamp: Date;
  sourceId?: VNID;
  priority: number;
  isProcessed: boolean;
}

export interface VariableBreakpoint {
  variableId: VNID;
  condition?: string;
  hitCount: number;
  isEnabled: boolean;
  action: 'pause' | 'log' | 'alert';
}

export interface WatchExpression {
  id: string;
  expression: string;
  currentValue: any;
  lastEvaluated: Date;
  isValid: boolean;
  error?: string;
}

export interface VariableCallStack {
  timestamp: Date;
  operation: string;
  variableId: VNID;
  sourceLocation: string;
  depth: number;
  context: Record<string, any>;
}

export interface MonitorPerformanceMetrics {
  averageUpdateTime: number; // milliseconds
  totalMemoryUsage: number; // bytes
  updateFrequency: number; // updates per second
  evaluationLoad: number; // 0-100 percentage
  bottleneckVariables: VNID[];
}

// Variable optimization and caching
export interface VariableOptimization {
  variableId: VNID;
  optimizationType: OptimizationType;
  cacheStrategy: CacheStrategy;
  isOptimized: boolean;
  optimizationRules: OptimizationRule[];
  performance: OptimizationPerformance;
}

export type OptimizationType = 'cache' | 'lazy' | 'precompute' | 'batch' | 'throttle' | 'memoize';

export interface CacheStrategy {
  type: 'none' | 'lru' | 'ttl' | 'dependency' | 'custom';
  maxSize?: number;
  ttl?: number; // time to live in milliseconds
  evictionPolicy?: 'lru' | 'lfu' | 'fifo' | 'custom';
  invalidateOn?: string[]; // events that invalidate cache
}

export interface OptimizationRule {
  condition: string;
  action: OptimizationType;
  priority: number;
  isEnabled: boolean;
  performance: {
    expectedSpeedup: number;
    memoryImpact: number;
    complexity: 'low' | 'medium' | 'high';
  };
}

export interface OptimizationPerformance {
  speedupAchieved: number; // percentage improvement
  memoryOverhead: number; // additional bytes used
  cacheHitRate: number; // 0-100 percentage
  optimizationEffectiveness: number; // 0-100 score
  lastOptimized: Date;
}

// Variable snapshots for save/restore and testing
export interface VariableSnapshot {
  id: VNID;
  name: string;
  timestamp: Date;
  description?: string;
  
  // Snapshot data
  variables: Record<VNID, any>;
  relationships: VariableRelationship[];
  metadata: SnapshotMetadata;
  
  // Validation and integrity
  checksum: string;
  isValid: boolean;
  corruptionDetected: boolean;
  
  // Size and compression
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export interface SnapshotMetadata {
  variableCount: number;
  relationshipCount: number;
  averageComplexity: number;
  memoryFootprint: number;
  captureTime: number; // milliseconds to create
  restorationTime?: number; // milliseconds to restore
  tags: string[];
  category: 'manual' | 'automatic' | 'test' | 'backup';
}

// Variable reference integrity and validation
export interface BrokenReference {
  sourceId: VNID;
  sourceType: 'scene' | 'character' | 'ui' | 'condition' | 'relationship';
  referencedVariableId: VNID;
  referenceLocation: string;
  errorType: 'missing' | 'type-mismatch' | 'scope-violation' | 'circular';
  suggestedFix?: string;
  severity: 'error' | 'warning';
}

export interface RefactorSuggestion {
  type: 'rename' | 'merge' | 'split' | 'scope-change' | 'type-change' | 'optimization';
  targetVariableIds: VNID[];
  description: string;
  reasoning: string;
  impact: 'low' | 'medium' | 'high';
  confidence: number; // 0-100
  automation: 'automatic' | 'assisted' | 'manual';
  estimatedTime: number; // minutes
}

// Variable report generation
export interface VariableReport {
  generatedAt: Date;
  reportType: 'usage' | 'performance' | 'dependencies' | 'documentation';
  projectId: VNID;
  timeRange: {
    start: Date;
    end: Date;
  };
  
  // Summary statistics
  summary: VariableReportSummary;
  
  // Detailed sections
  usageAnalysis?: UsageAnalysis;
  performanceAnalysis?: PerformanceAnalysis;
  dependencyAnalysis?: DependencyAnalysis;
  recommendations: ReportRecommendation[];
  
  // Export options
  format: 'json' | 'markdown' | 'csv' | 'pdf';
  visualizations: GraphVisualization[];
}

export interface VariableReportSummary {
  totalVariables: number;
  totalRelationships: number;
  averageUsagePerVariable: number;
  mostUsedVariables: Array<{ id: VNID; count: number }>;
  performanceBottlenecks: VNID[];
  circularDependencies: number;
  orphanedVariables: number;
  memoryUsage: number;
  evaluationTime: number;
}

export interface UsageAnalysis {
  accessPatterns: AccessPattern[];
  hotspots: UsageHotspot[];
  unusedVariables: VNID[];
  overusedVariables: VNID[];
  temporalDistribution: TemporalUsage[];
}

export interface AccessPattern {
  pattern: string;
  frequency: number;
  variables: VNID[];
  efficiency: number;
}

export interface TemporalUsage {
  timeSlot: Date;
  accessCount: number;
  uniqueVariables: number;
  operationTypes: Record<EnhancedVariableOperator, number>;
}

export interface PerformanceAnalysis {
  evaluationTimes: Record<VNID, number>;
  memoryUsage: Record<VNID, number>;
  updateFrequencies: Record<VNID, number>;
  optimizationOpportunities: OptimizationOpportunity[];
  bottleneckAnalysis: BottleneckAnalysis;
}

export interface OptimizationOpportunity {
  variableId: VNID;
  currentPerformance: number;
  estimatedImprovement: number;
  optimizationType: OptimizationType;
  complexity: 'low' | 'medium' | 'high';
  priority: number;
}

export interface BottleneckAnalysis {
  criticalPath: VNID[];
  bottleneckNodes: VNID[];
  impactAssessment: Record<VNID, number>;
  mitigationStrategies: string[];
}

export interface DependencyAnalysis {
  dependencyGraph: DependencyGraph;
  complexityMetrics: ComplexityMetrics;
  stabilityMetrics: StabilityMetrics;
  refactoringOpportunities: RefactorSuggestion[];
}

export interface ComplexityMetrics {
  averageDepth: number;
  maxDepth: number;
  cyclomaticComplexity: number;
  couplingIndex: number;
  cohesionIndex: number;
}

export interface StabilityMetrics {
  changeFrequency: Record<VNID, number>;
  errorRate: Record<VNID, number>;
  reliabilityScore: number;
  maintainabilityIndex: number;
}

export interface ReportRecommendation {
  category: 'performance' | 'structure' | 'usage' | 'maintenance';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionItems: string[];
  estimatedImpact: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface GraphVisualization {
  type: 'dependency-graph' | 'usage-timeline' | 'performance-chart' | 'relationship-map';
  title: string;
  data: any;
  config: VisualizationConfig;
}

export interface VisualizationConfig {
  width: number;
  height: number;
  interactive: boolean;
  theme: 'light' | 'dark' | 'auto';
  exportFormats: string[];
  animations: boolean;
}