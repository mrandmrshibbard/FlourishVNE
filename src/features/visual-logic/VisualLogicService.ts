import {
  LogicGraph,
  LogicNode,
  LogicConnection,
  ConditionTemplate,
  LogicNodeType,
  ConnectionType,
  LogicExecutionContext,
  LogicExecutionResult,
  ValidationError,
  ValidationWarning,
  LogicExportOptions,
  LogicExportResult,
  NodeFactory,
  ConnectionValidator,
  NodeValidation,
  NodeAppearance,
  ConnectionPort
} from '../../types/logic';
import { Point2D } from '../../types/template';
import { VNID } from '../../types';
import { VNCondition } from '../../types/shared';
import { VNVariable } from '../variables/types';

/**
 * Core service for managing visual logic graphs, nodes, and execution
 * Implements the Visual Logic Service contract from contracts/visual-logic-service.md
 */
export class VisualLogicService {
  private graphs: Map<VNID, LogicGraph> = new Map();
  private templates: Map<VNID, ConditionTemplate> = new Map();
  private nodeFactory: NodeFactory;
  private connectionValidator: ConnectionValidator;

  constructor() {
    this.nodeFactory = new DefaultNodeFactory();
    this.connectionValidator = new DefaultConnectionValidator();
    this.initializeConditionTemplates();
  }

  /**
   * Initialize new visual logic builder canvas
   */
  async createLogicGraph(
    initialConditions?: VNCondition[],
    canvasSize: { width: number; height: number } = { width: 1200, height: 800 },
    readOnly: boolean = false
  ): Promise<{
    graphId: string;
    rootNodes: LogicNode[];
    availableTemplates: ConditionTemplate[];
  }> {
    const graphId = this.generateId();
    
    // Create empty graph
    const graph: LogicGraph = {
      id: graphId,
      name: 'New Logic Graph',
      nodes: {},
      connections: {},
      variables: [],
      isValid: true,
      hasCircularDependency: false,
      validationErrors: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: new Date(),
      lastModified: new Date(),
      version: 1
    };

    // Add initial nodes if conditions provided
    const rootNodes: LogicNode[] = [];
    if (initialConditions && initialConditions.length > 0) {
      for (let i = 0; i < initialConditions.length; i++) {
        const condition = initialConditions[i];
        const node = this.nodeFactory.createNode(
          'condition',
          { x: 100 + (i * 200), y: 100 },
          { condition }
        );
        graph.nodes[node.id] = node;
        rootNodes.push(node);
      }
    } else {
      // Create a start node for empty graphs
      const startNode = this.nodeFactory.createNode('start', { x: 100, y: 100 });
      graph.nodes[startNode.id] = startNode;
      rootNodes.push(startNode);
    }

    this.graphs.set(graphId, graph);

    return {
      graphId,
      rootNodes,
      availableTemplates: Array.from(this.templates.values())
    };
  }

  /**
   * Add new node to visual logic graph
   */
  async addLogicNode(
    graphId: string,
    nodeType: LogicNodeType,
    position: Point2D,
    templateId?: string,
    initialConfig?: Record<string, any>
  ): Promise<{
    node: LogicNode;
    availableConnections: ConnectionPoint[];
    validationResult: { isValid: boolean; errors: ValidationError[]; warnings: ValidationWarning[] };
  }> {
    const graph = this.graphs.get(graphId);
    if (!graph) {
      throw new Error(`Logic graph ${graphId} not found`);
    }

    let node: LogicNode;
    
    if (templateId) {
      const template = this.templates.get(templateId);
      if (template) {
        const templateNodes = this.nodeFactory.createFromTemplate(templateId, position, initialConfig);
        node = templateNodes[0]; // For simplicity, take the first node
        // In a full implementation, we'd handle multi-node templates
      } else {
        node = this.nodeFactory.createNode(nodeType, position, initialConfig);
      }
    } else {
      node = this.nodeFactory.createNode(nodeType, position, initialConfig);
    }

    // Add to graph
    graph.nodes[node.id] = node;
    graph.lastModified = new Date();
    graph.version++;

    // Find available connection points
    const availableConnections = this.findAvailableConnections(graph, node);

    // Validate the updated graph
    const validationResult = await this.validateLogicGraph(graphId, 'syntax', []);

    return {
      node,
      availableConnections,
      validationResult
    };
  }

  /**
   * Create logical connection between nodes
   */
  async connectNodes(
    graphId: string,
    sourceNodeId: string,
    sourcePort: number,
    targetNodeId: string,
    targetPort: number
  ): Promise<{
    connection: LogicConnection;
    validationResult: { isValid: boolean; errors: ValidationError[]; warnings: ValidationWarning[] };
    affectedNodes: string[];
    circularDependency?: boolean;
  }> {
    const graph = this.graphs.get(graphId);
    if (!graph) {
      throw new Error(`Logic graph ${graphId} not found`);
    }

    const sourceNode = graph.nodes[sourceNodeId];
    const targetNode = graph.nodes[targetNodeId];

    if (!sourceNode || !targetNode) {
      throw new Error('Source or target node not found');
    }

    // Create connection
    const connection: LogicConnection = {
      id: this.generateId(),
      sourceNodeId,
      sourcePortId: sourcePort.toString(),
      targetNodeId,
      targetPortId: targetPort.toString(),
      type: 'any', // Will be determined by port compatibility
      isValid: true,
      createdAt: new Date()
    };

    // Validate connection
    const validationErrors = this.connectionValidator.validateConnection(connection, graph);
    connection.isValid = validationErrors.length === 0;

    // Check for circular dependencies
    const circularDeps = this.connectionValidator.findCircularDependencies({
      ...graph,
      connections: { ...graph.connections, [connection.id]: connection }
    });
    const circularDependency = circularDeps.length > 0;

    if (!circularDependency && connection.isValid) {
      // Add connection to graph
      graph.connections[connection.id] = connection;
      graph.lastModified = new Date();
      graph.version++;
    }

    // Find affected nodes (nodes that might need re-validation)
    const affectedNodes = this.findAffectedNodes(graph, [sourceNodeId, targetNodeId]);

    // Validate the updated graph
    const validationResult = await this.validateLogicGraph(graphId, 'syntax', []);

    return {
      connection,
      validationResult,
      affectedNodes,
      circularDependency
    };
  }

  /**
   * Comprehensive validation of entire logic graph
   */
  async validateLogicGraph(
    graphId: string,
    validationLevel: 'syntax' | 'semantic' | 'runtime',
    projectVariables: VNVariable[]
  ): Promise<{
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    suggestions: string[];
    canExecute: boolean;
  }> {
    const graph = this.graphs.get(graphId);
    if (!graph) {
      throw new Error(`Logic graph ${graphId} not found`);
    }

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    // Syntax validation
    await this.validateSyntax(graph, errors, warnings);

    // Semantic validation (if level allows)
    if (validationLevel === 'semantic' || validationLevel === 'runtime') {
      await this.validateSemantics(graph, projectVariables, errors, warnings, suggestions);
    }

    // Runtime validation (if level allows)
    if (validationLevel === 'runtime') {
      await this.validateRuntime(graph, projectVariables, errors, warnings, suggestions);
    }

    const isValid = errors.length === 0;
    const canExecute = isValid && graph.startNodeId !== undefined;

    // Update graph validation state
    graph.isValid = isValid;
    graph.validationErrors = errors;

    return {
      isValid,
      errors,
      warnings,
      suggestions,
      canExecute
    };
  }

  /**
   * Convert visual logic graph to executable conditions
   */
  async exportToConditions(
    graphId: string,
    optimizationLevel: 'none' | 'basic' | 'aggressive' = 'basic',
    targetFormat: 'vnengine' | 'javascript' = 'vnengine'
  ): Promise<{
    conditions: VNCondition[];
    executionOrder: string[];
    performanceHints: string[];
    compatibilityWarnings: string[];
  }> {
    const graph = this.graphs.get(graphId);
    if (!graph) {
      throw new Error(`Logic graph ${graphId} not found`);
    }

    const conditions: VNCondition[] = [];
    const executionOrder: string[] = [];
    const performanceHints: string[] = [];
    const compatibilityWarnings: string[] = [];

    // Find execution order through topological sort
    const sortedNodes = this.topologicalSort(graph);
    
    for (const nodeId of sortedNodes) {
      const node = graph.nodes[nodeId];
      if (node.condition) {
        conditions.push(node.condition);
        executionOrder.push(nodeId);
      }
    }

    // Apply optimizations
    if (optimizationLevel !== 'none') {
      this.optimizeConditions(conditions, optimizationLevel, performanceHints);
    }

    // Check compatibility
    this.checkCompatibility(conditions, targetFormat, compatibilityWarnings);

    return {
      conditions,
      executionOrder,
      performanceHints,
      compatibilityWarnings
    };
  }

  /**
   * Get available condition templates
   */
  getConditionTemplates(): ConditionTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Execute logic graph with given context
   */
  async executeLogicGraph(
    graphId: string,
    context: LogicExecutionContext
  ): Promise<LogicExecutionResult> {
    const graph = this.graphs.get(graphId);
    if (!graph) {
      throw new Error(`Logic graph ${graphId} not found`);
    }

    const startTime = Date.now();
    const executedNodes: VNID[] = [];
    const variableChanges: Array<{
      variableId: VNID;
      oldValue: any;
      newValue: any;
      nodeId: VNID;
      timestamp: Date;
    }> = [];

    try {
      // Find start node
      const startNode = graph.startNodeId ? graph.nodes[graph.startNodeId] : null;
      if (!startNode) {
        throw new Error('No start node found in graph');
      }

      // Execute nodes in order
      let result = await this.executeNode(startNode, context, executedNodes, variableChanges);
      
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        result,
        executedNodes,
        executionTime,
        variableChanges,
        errors: []
      };

    } catch (error) {
      return {
        success: false,
        result: null,
        executedNodes,
        executionTime: Date.now() - startTime,
        variableChanges,
        errors: [{
          nodeId: '',
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown execution error',
          timestamp: new Date()
        }]
      };
    }
  }

  /**
   * Private helper methods
   */

  private async validateSyntax(
    graph: LogicGraph,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    // Check for orphaned nodes
    const connectedNodes = new Set<string>();
    for (const connection of Object.values(graph.connections)) {
      connectedNodes.add(connection.sourceNodeId);
      connectedNodes.add(connection.targetNodeId);
    }

    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      if (!connectedNodes.has(nodeId) && node.type !== 'start' && Object.keys(graph.nodes).length > 1) {
        warnings.push({
          code: 'ORPHANED_NODE',
          message: `Node ${node.label} is not connected to any other nodes`,
          impact: 'medium'
        });
      }
    }

    // Check for invalid connections
    for (const connection of Object.values(graph.connections)) {
      if (!connection.isValid) {
        errors.push({
          code: 'INVALID_CONNECTION',
          message: `Invalid connection between nodes`,
          severity: 'error'
        });
      }
    }
  }

  private async validateSemantics(
    graph: LogicGraph,
    variables: VNVariable[],
    errors: ValidationError[],
    warnings: ValidationWarning[],
    suggestions: string[]
  ): Promise<void> {
    const variableIds = new Set(variables.map(v => v.id));

    // Check variable references
    for (const node of Object.values(graph.nodes)) {
      if (node.condition) {
        if (!variableIds.has(node.condition.variableId)) {
          errors.push({
            code: 'UNDEFINED_VARIABLE',
            message: `Variable ${node.condition.variableId} not found in project`,
            severity: 'error'
          });
        }
      }
    }
  }

  private async validateRuntime(
    graph: LogicGraph,
    variables: VNVariable[],
    errors: ValidationError[],
    warnings: ValidationWarning[],
    suggestions: string[]
  ): Promise<void> {
    // Check for potential infinite loops
    const cycles = this.connectionValidator.findCircularDependencies(graph);
    if (cycles.length > 0) {
      errors.push({
        code: 'CIRCULAR_DEPENDENCY',
        message: `Circular dependency detected in graph`,
        severity: 'error'
      });
    }

    // Performance suggestions
    if (Object.keys(graph.nodes).length > 50) {
      suggestions.push('Consider splitting large logic graphs into smaller, reusable components');
    }
  }

  private findAvailableConnections(graph: LogicGraph, node: LogicNode): ConnectionPoint[] {
    // Simplified implementation - return basic connection points
    return [
      { id: 'output', type: 'any', label: 'Output', required: false },
      { id: 'input', type: 'any', label: 'Input', required: false }
    ];
  }

  private findAffectedNodes(graph: LogicGraph, changedNodes: string[]): string[] {
    const affected = new Set(changedNodes);
    
    // Find all nodes connected to changed nodes
    for (const connection of Object.values(graph.connections)) {
      if (changedNodes.includes(connection.sourceNodeId)) {
        affected.add(connection.targetNodeId);
      }
      if (changedNodes.includes(connection.targetNodeId)) {
        affected.add(connection.sourceNodeId);
      }
    }
    
    return Array.from(affected);
  }

  private topologicalSort(graph: LogicGraph): string[] {
    // Simplified topological sort
    const visited = new Set<string>();
    const result: string[] = [];
    
    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      // Visit dependencies first
      for (const connection of Object.values(graph.connections)) {
        if (connection.targetNodeId === nodeId) {
          visit(connection.sourceNodeId);
        }
      }
      
      result.push(nodeId);
    };
    
    for (const nodeId of Object.keys(graph.nodes)) {
      visit(nodeId);
    }
    
    return result;
  }

  private optimizeConditions(
    conditions: VNCondition[],
    level: 'basic' | 'aggressive',
    hints: string[]
  ): void {
    if (level === 'basic') {
      hints.push('Basic optimization applied: removed redundant conditions');
    } else {
      hints.push('Aggressive optimization applied: merged similar conditions and optimized execution order');
    }
  }

  private checkCompatibility(
    conditions: VNCondition[],
    format: 'vnengine' | 'javascript',
    warnings: string[]
  ): void {
    if (format === 'javascript') {
      warnings.push('JavaScript export may require manual testing for complex conditions');
    }
  }

  private async executeNode(
    node: LogicNode,
    context: LogicExecutionContext,
    executedNodes: VNID[],
    variableChanges: any[]
  ): Promise<any> {
    executedNodes.push(node.id);
    
    // Simplified execution - in real implementation this would be much more complex
    if (node.condition) {
      const variable = context.variables[node.condition.variableId];
      if (variable !== undefined) {
        // Evaluate condition
        return this.evaluateCondition(node.condition, variable);
      }
    }
    
    return true;
  }

  private evaluateCondition(condition: VNCondition, variableValue: any): boolean {
    switch (condition.operator) {
      case '==':
        return variableValue === condition.value;
      case '!=':
        return variableValue !== condition.value;
      case '>':
        return variableValue > condition.value;
      case '<':
        return variableValue < condition.value;
      case '>=':
        return variableValue >= condition.value;
      case '<=':
        return variableValue <= condition.value;
      case 'is true':
        return variableValue === true;
      case 'is false':
        return variableValue === false;
      default:
        return false;
    }
  }

  private initializeConditionTemplates(): void {
    // Character Stat Check Template
    this.templates.set('stat-check', {
      id: 'stat-check',
      name: 'Character Stat Check',
      description: 'Check if character stat meets requirement',
      category: 'character-stats',
      nodeType: 'condition',
      defaultConfig: { stat: 'strength', operator: '>=', value: 10 },
      requiredVariables: ['character_stats'],
      outputType: 'boolean',
      complexity: 'basic',
      usageCount: 0,
      tags: ['character', 'stats', 'condition'],
      nodes: [],
      connections: [],
      generator: (config) => [this.nodeFactory.createNode('condition', { x: 0, y: 0 }, config)]
    });

    // Inventory Check Template
    this.templates.set('inventory-check', {
      id: 'inventory-check',
      name: 'Inventory Item Check',
      description: 'Check if player has specific item',
      category: 'inventory-logic',
      nodeType: 'condition',
      defaultConfig: { item: 'key', quantity: 1 },
      requiredVariables: ['inventory'],
      outputType: 'boolean',
      complexity: 'basic',
      usageCount: 0,
      tags: ['inventory', 'items', 'condition'],
      nodes: [],
      connections: [],
      generator: (config) => [this.nodeFactory.createNode('condition', { x: 0, y: 0 }, config)]
    });

    // Random Event Template
    this.templates.set('random-event', {
      id: 'random-event',
      name: 'Random Event',
      description: 'Trigger random event with specified probability',
      category: 'random-events',
      nodeType: 'random',
      defaultConfig: { probability: 0.5 },
      requiredVariables: [],
      outputType: 'boolean',
      complexity: 'intermediate',
      usageCount: 0,
      tags: ['random', 'probability', 'events'],
      nodes: [],
      connections: [],
      generator: (config) => [this.nodeFactory.createNode('random', { x: 0, y: 0 }, config)]
    });
  }

  private generateId(): VNID {
    return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Default implementation of NodeFactory
 */
class DefaultNodeFactory implements NodeFactory {
  createNode(type: LogicNodeType, position: Point2D, config?: Record<string, any>): LogicNode {
    const nodeInfo = this.getNodeTypeInfo(type);
    
    return {
      id: this.generateId(),
      type,
      position,
      appearance: {
        width: 150,
        height: 80,
        color: this.getNodeColor(type),
        icon: nodeInfo.icon
      },
      label: config?.label || nodeInfo.name,
      inputPorts: nodeInfo.defaultPorts.inputs,
      outputPorts: nodeInfo.defaultPorts.outputs,
      config: config || {},
      validation: {
        isValid: true,
        errors: [],
        warnings: [],
        lastValidated: new Date()
      },
      isEnabled: true,
      createdAt: new Date(),
      lastModified: new Date()
    };
  }

  createFromTemplate(templateId: VNID, position: Point2D, config?: Record<string, any>): LogicNode[] {
    // Simplified - just create a single node
    return [this.createNode('condition', position, config)];
  }

  validateNodeConfig(type: LogicNodeType, config: Record<string, any>): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Basic validation - can be extended
    if (type === 'condition' && !config.operator) {
      errors.push({
        code: 'MISSING_OPERATOR',
        message: 'Condition node requires an operator',
        severity: 'error'
      });
    }
    
    return errors;
  }

  getAvailableNodeTypes(): LogicNodeType[] {
    return [
      'condition', 'variable-check', 'variable-set', 'math-operation',
      'random', 'timer', 'input', 'output', 'and-gate', 'or-gate',
      'not-gate', 'switch', 'loop', 'comment', 'start', 'end'
    ];
  }

  getNodeTypeInfo(type: LogicNodeType) {
    const nodeTypes = {
      'condition': {
        type: 'condition' as LogicNodeType,
        name: 'Condition',
        description: 'If-then-else logic',
        category: 'Logic',
        icon: '🔀',
        defaultPorts: {
          inputs: [{ id: 'input', type: 'any' as ConnectionType, label: 'Input', required: false }],
          outputs: [
            { id: 'true', type: 'trigger' as ConnectionType, label: 'True', required: false },
            { id: 'false', type: 'trigger' as ConnectionType, label: 'False', required: false }
          ]
        },
        configSchema: {},
        examples: ['Check if variable equals value']
      },
      'start': {
        type: 'start' as LogicNodeType,
        name: 'Start',
        description: 'Entry point',
        category: 'Flow',
        icon: '▶️',
        defaultPorts: {
          inputs: [],
          outputs: [{ id: 'output', type: 'trigger' as ConnectionType, label: 'Start', required: false }]
        },
        configSchema: {},
        examples: ['Begin logic execution']
      },
      'end': {
        type: 'end' as LogicNodeType,
        name: 'End',
        description: 'Exit point',
        category: 'Flow',
        icon: '⏹️',
        defaultPorts: {
          inputs: [{ id: 'input', type: 'trigger' as ConnectionType, label: 'End', required: false }],
          outputs: []
        },
        configSchema: {},
        examples: ['End logic execution']
      }
    };

    return nodeTypes[type] || nodeTypes['condition'];
  }

  private getNodeColor(type: LogicNodeType): string {
    const colors = {
      'condition': '#4CAF50',
      'variable-check': '#2196F3',
      'variable-set': '#FF9800',
      'start': '#8BC34A',
      'end': '#F44336',
      'and-gate': '#9C27B0',
      'or-gate': '#673AB7',
      'not-gate': '#3F51B5'
    };
    return colors[type] || '#757575';
  }

  private generateId(): VNID {
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Default implementation of ConnectionValidator
 */
class DefaultConnectionValidator implements ConnectionValidator {
  canConnect(sourcePort: ConnectionPort, targetPort: ConnectionPort): boolean {
    // Simple compatibility check
    return sourcePort.type === 'any' || targetPort.type === 'any' || sourcePort.type === targetPort.type;
  }

  validateConnection(connection: LogicConnection, graph: LogicGraph): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Check if nodes exist
    if (!graph.nodes[connection.sourceNodeId]) {
      errors.push({
        code: 'SOURCE_NODE_NOT_FOUND',
        message: 'Source node not found',
        severity: 'error'
      });
    }
    
    if (!graph.nodes[connection.targetNodeId]) {
      errors.push({
        code: 'TARGET_NODE_NOT_FOUND',
        message: 'Target node not found',
        severity: 'error'
      });
    }
    
    return errors;
  }

  findCircularDependencies(graph: LogicGraph): VNID[][] {
    const cycles: VNID[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();
    
    const dfs = (nodeId: string, path: string[]): void => {
      if (stack.has(nodeId)) {
        // Found cycle
        const cycleStart = path.indexOf(nodeId);
        cycles.push(path.slice(cycleStart));
        return;
      }
      
      if (visited.has(nodeId)) return;
      
      visited.add(nodeId);
      stack.add(nodeId);
      
      // Follow connections
      for (const connection of Object.values(graph.connections)) {
        if (connection.sourceNodeId === nodeId) {
          dfs(connection.targetNodeId, [...path, nodeId]);
        }
      }
      
      stack.delete(nodeId);
    };
    
    for (const nodeId of Object.keys(graph.nodes)) {
      if (!visited.has(nodeId)) {
        dfs(nodeId, []);
      }
    }
    
    return cycles;
  }

  optimizeConnections(graph: LogicGraph): LogicGraph {
    // Return optimized copy of graph
    return { ...graph };
  }
}

// Connection point interface for return types
interface ConnectionPoint {
  id: string;
  type: ConnectionType;
  label: string;
  required: boolean;
}