import { VNID } from './index';
import { VNCondition } from './shared';
import { Point2D } from './template';

// Logic Node Types
export type LogicNodeType = 
  | 'condition'        // If/Then/Else logic
  | 'variable-check'   // Variable comparison
  | 'variable-set'     // Variable assignment
  | 'math-operation'   // Mathematical calculation
  | 'random'          // Random number/choice
  | 'timer'           // Time-based logic
  | 'input'           // User input capture
  | 'output'          // Result/action trigger
  | 'and-gate'        // Logical AND
  | 'or-gate'         // Logical OR
  | 'not-gate'        // Logical NOT
  | 'switch'          // Multi-branch logic
  | 'loop'            // Iteration logic
  | 'comment'         // Documentation node
  | 'start'           // Entry point
  | 'end'             // Exit point
  | 'custom';         // User-defined logic

// Connection point types
export type ConnectionType = 
  | 'boolean'         // True/False values
  | 'number'          // Numeric values
  | 'string'          // Text values
  | 'variable'        // Variable references
  | 'condition'       // Condition objects
  | 'trigger'         // Event triggers
  | 'any';            // Accept any type

// Connection port definition
export interface ConnectionPort {
  id: string;
  type: ConnectionType;
  label: string;
  required: boolean;
  defaultValue?: any;
  multiple?: boolean; // Can accept multiple connections
}

// Logic connection between nodes
export interface LogicConnection {
  id: VNID;
  sourceNodeId: VNID;
  sourcePortId: string;
  targetNodeId: VNID;
  targetPortId: string;
  type: ConnectionType;
  value?: any;
  isValid: boolean;
  createdAt: Date;
}

// Node size and appearance
export interface NodeAppearance {
  width: number;
  height: number;
  color?: string;
  icon?: string;
  collapsed?: boolean;
  highlighted?: boolean;
}

// Node validation state
export interface NodeValidation {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  lastValidated: Date;
}

export interface ValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  field?: string;
  suggestedFix?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  impact: 'low' | 'medium' | 'high';
  field?: string;
  recommendation?: string;
}

// Core Logic Node entity
export interface LogicNode {
  id: VNID;
  type: LogicNodeType;
  position: Point2D;
  appearance: NodeAppearance;
  label: string;
  description?: string;
  
  // Connection configuration
  inputPorts: ConnectionPort[];
  outputPorts: ConnectionPort[];
  
  // Node-specific configuration
  config: Record<string, any>;
  
  // Generated logic
  condition?: VNCondition;
  templateId?: string;
  
  // State and validation
  validation: NodeValidation;
  isEnabled: boolean;
  isBreakpoint?: boolean; // For debugging
  
  // Metadata
  createdAt: Date;
  lastModified: Date;
  executionCount?: number;
  averageExecutionTime?: number;
}

// Visual logic graph containing multiple nodes
export interface LogicGraph {
  id: VNID;
  name: string;
  description?: string;
  nodes: Record<VNID, LogicNode>;
  connections: Record<VNID, LogicConnection>;
  startNodeId?: VNID;
  variables: VNID[]; // Referenced variables
  
  // Graph-level validation
  isValid: boolean;
  hasCircularDependency: boolean;
  validationErrors: ValidationError[];
  
  // Layout and view settings
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  
  // Metadata
  createdAt: Date;
  lastModified: Date;
  version: number;
}

// Condition template for common logic patterns
export interface ConditionTemplate {
  id: VNID;
  name: string;
  description: string;
  category: ConditionTemplateCategory;
  nodeType: LogicNodeType;
  defaultConfig: Record<string, any>;
  requiredVariables: string[];
  outputType: ConnectionType;
  complexity: 'basic' | 'intermediate' | 'advanced';
  usageCount: number;
  tags: string[];
  
  // Template content
  nodes: Partial<LogicNode>[];
  connections: Partial<LogicConnection>[];
  
  // Generation function
  generator: (config: Record<string, any>) => LogicNode[];
}

export type ConditionTemplateCategory =
  | 'variable-checks'
  | 'math-operations'
  | 'inventory-logic'
  | 'character-stats'
  | 'time-conditions'
  | 'random-events'
  | 'user-input'
  | 'game-state'
  | 'achievements'
  | 'progression'
  | 'custom';

// Execution context for logic evaluation
export interface LogicExecutionContext {
  variables: Record<string, any>;
  currentSceneId?: VNID;
  currentCharacterId?: VNID;
  gameState: Record<string, any>;
  debugMode: boolean;
  breakpoints: VNID[];
}

// Execution result from logic evaluation
export interface LogicExecutionResult {
  success: boolean;
  result: any;
  executedNodes: VNID[];
  executionTime: number;
  variableChanges: VariableChange[];
  errors: ExecutionError[];
  debugInfo?: LogicDebugInfo;
}

export interface VariableChange {
  variableId: VNID;
  oldValue: any;
  newValue: any;
  nodeId: VNID;
  timestamp: Date;
}

export interface ExecutionError {
  nodeId: VNID;
  code: string;
  message: string;
  stack?: string;
  timestamp: Date;
}

export interface LogicDebugInfo {
  nodeExecutions: NodeExecution[];
  connectionStates: ConnectionState[];
  performanceMetrics: PerformanceMetrics;
}

export interface NodeExecution {
  nodeId: VNID;
  startTime: Date;
  endTime: Date;
  duration: number;
  inputValues: Record<string, any>;
  outputValue: any;
  success: boolean;
  error?: string;
}

export interface ConnectionState {
  connectionId: VNID;
  value: any;
  timestamp: Date;
  isActive: boolean;
}

export interface PerformanceMetrics {
  totalExecutionTime: number;
  nodeCount: number;
  connectionCount: number;
  memoryUsage: number;
  evaluationDepth: number;
}

// Logic builder UI state
export interface LogicBuilderState {
  selectedNodes: VNID[];
  selectedConnections: VNID[];
  dragMode: 'none' | 'node' | 'connection' | 'selection';
  clipboard: {
    nodes: LogicNode[];
    connections: LogicConnection[];
  };
  undoStack: LogicGraph[];
  redoStack: LogicGraph[];
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
}

// Node factory for creating different types of logic nodes
export interface NodeFactory {
  createNode(type: LogicNodeType, position: Point2D, config?: Record<string, any>): LogicNode;
  createFromTemplate(templateId: VNID, position: Point2D, config?: Record<string, any>): LogicNode[];
  validateNodeConfig(type: LogicNodeType, config: Record<string, any>): ValidationError[];
  getAvailableNodeTypes(): LogicNodeType[];
  getNodeTypeInfo(type: LogicNodeType): NodeTypeInfo;
}

export interface NodeTypeInfo {
  type: LogicNodeType;
  name: string;
  description: string;
  category: string;
  icon: string;
  defaultPorts: {
    inputs: ConnectionPort[];
    outputs: ConnectionPort[];
  };
  configSchema: Record<string, any>;
  examples: string[];
}

// Connection validation and management
export interface ConnectionValidator {
  canConnect(sourcePort: ConnectionPort, targetPort: ConnectionPort): boolean;
  validateConnection(connection: LogicConnection, graph: LogicGraph): ValidationError[];
  findCircularDependencies(graph: LogicGraph): VNID[][];
  optimizeConnections(graph: LogicGraph): LogicGraph;
}

// Logic export formats
export interface LogicExportOptions {
  format: 'vnengine' | 'javascript' | 'json' | 'yaml';
  includeComments: boolean;
  optimizeOutput: boolean;
  minify: boolean;
}

export interface LogicExportResult {
  format: string;
  content: string;
  size: number;
  warnings: string[];
  metadata: {
    nodeCount: number;
    connectionCount: number;
    variableCount: number;
    exportTime: Date;
  };
}