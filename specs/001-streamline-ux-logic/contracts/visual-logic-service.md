# Visual Logic Service Contract

**Service**: Visual Logic Builder  
**Version**: 1.0.0  
**Protocol**: Internal TypeScript interfaces (client-side only)

## Interface: VisualLogicService

### createLogicGraph()

**Purpose**: Initialize new visual logic builder canvas

**Input**:
```typescript
interface CreateLogicGraphRequest {
  initialConditions?: VNCondition[];
  canvasSize: { width: number; height: number };
  readOnly?: boolean;
}
```

**Output**:
```typescript
interface CreateLogicGraphResponse {
  graphId: string;
  rootNodes: LogicNode[];
  availableTemplates: ConditionTemplate[];
}
```

**Behavior**:
- Creates empty or pre-populated logic canvas
- Loads condition templates for user selection
- Sets up validation and connection rules

---

### addLogicNode()

**Purpose**: Add new node to visual logic graph

**Input**:
```typescript
interface AddLogicNodeRequest {
  graphId: string;
  nodeType: LogicNodeType;
  position: Point2D;
  templateId?: string;
  initialConfig?: Record<string, any>;
}
```

**Output**:
```typescript
interface AddLogicNodeResponse {
  node: LogicNode;
  availableConnections: ConnectionPoint[];
  validationResult: ValidationResult;
}
```

**Behavior**:
- Adds node at specified position
- Applies template configuration if provided
- Validates node placement and connections
- Returns available connection points

---

### connectNodes()

**Purpose**: Create logical connection between nodes

**Input**:
```typescript
interface ConnectNodesRequest {
  graphId: string;
  sourceNodeId: string;
  sourcePort: number;
  targetNodeId: string;
  targetPort: number;
}
```

**Output**:
```typescript
interface ConnectNodesResponse {
  connection: LogicConnection;
  validationResult: ValidationResult;
  affectedNodes: string[];
  circularDependency?: boolean;
}
```

**Behavior**:
- Creates connection between specified ports
- Validates connection compatibility
- Checks for circular dependencies
- Updates affected node validation states

---

### validateLogicGraph()

**Purpose**: Comprehensive validation of entire logic graph

**Input**:
```typescript
interface ValidateLogicGraphRequest {
  graphId: string;
  validationLevel: 'syntax' | 'semantic' | 'runtime';
  projectVariables: VNVariable[];
}
```

**Output**:
```typescript
interface ValidateLogicGraphResponse {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
  canExecute: boolean;
}
```

**Behavior**:
- Performs comprehensive graph validation
- Checks variable references and types
- Identifies potential runtime issues
- Provides actionable error messages

---

### exportToConditions()

**Purpose**: Convert visual logic graph to executable conditions

**Input**:
```typescript
interface ExportToConditionsRequest {
  graphId: string;
  optimizationLevel: 'none' | 'basic' | 'aggressive';
  targetFormat: 'vnengine' | 'javascript';
}
```

**Output**:
```typescript
interface ExportToConditionsResponse {
  conditions: VNCondition[];
  executionOrder: string[];
  performanceHints: string[];
  compatibilityWarnings: string[];
}
```

**Behavior**:
- Converts nodes to executable condition format
- Optimizes execution order for performance
- Ensures backward compatibility
- Provides performance optimization hints

## Error Handling

```typescript
interface LogicError {
  code: string;
  message: string;
  nodeId?: string;
  position?: Point2D;
  recoveryActions: string[];
}

// Error codes:
// INVALID_CONNECTION, CIRCULAR_DEPENDENCY, 
// MISSING_VARIABLE, SYNTAX_ERROR, RUNTIME_ERROR
```