# Data Model: Streamline UX and Enhanced Logic Systems

**Date**: November 5, 2025  
**Feature**: 001-streamline-ux-logic  
**Based on**: [spec.md](./spec.md) and [research.md](./research.md)

## Core Entities

### Template

Pre-configured visual novel system with customizable parameters and automatic UI generation.

**Fields**:
- `id: string` - Unique template identifier
- `name: string` - Display name for template gallery
- `description: string` - Brief description of template purpose
- `category: TemplateCategory` - Type classification
- `configSchema: JSONSchema` - Configuration validation schema
- `defaultConfig: Record<string, any>` - Default parameter values
- `uiGenerator: (config: any) => VNUIScreen[]` - UI generation function
- `previewImage?: string` - Template preview image URL
- `tags: string[]` - Searchable tags for filtering
- `version: string` - Template version for compatibility
- `customizationLimits: CustomizationBounds` - Boundaries for guided customization

**Relationships**:
- Generates multiple `VNUIScreen` instances
- References `VNVariable` instances for dynamic content
- Can be extended by user-created templates

**State Transitions**:
- Draft → Published → Deprecated
- User customization creates "instance" relationship

**Validation Rules**:
- `id` must be unique across template library
- `configSchema` must be valid JSON Schema
- `uiGenerator` must produce valid VNUIScreen array
- `customizationLimits` must specify allowed modifications

---

### Logic Node

Visual representation of conditional logic with input/output connections for building complex branching.

**Fields**:
- `id: string` - Unique node identifier
- `type: LogicNodeType` - Node behavior type
- `position: Point2D` - Canvas coordinates
- `inputs: LogicConnection[]` - Incoming connections
- `outputs: LogicConnection[]` - Outgoing connections
- `condition?: VNCondition` - Associated condition logic
- `template?: string` - Reference to condition template
- `label: string` - User-friendly node description
- `isValid: boolean` - Validation state
- `errors: ValidationError[]` - Current validation issues

**Relationships**:
- Connected to other `LogicNode` instances via connections
- References `VNVariable` instances in conditions
- Generates `VNCondition` objects for scene commands

**State Transitions**:
- Invalid → Valid (through user correction)
- Template → Customized (when user modifies)

**Validation Rules**:
- Connections must have compatible input/output types
- Circular dependencies are prohibited
- All required inputs must be connected
- Generated conditions must be evaluable

---

### Variable Relationship

Defined connection between variables where changes trigger automatic updates according to formulas.

**Fields**:
- `id: string` - Unique relationship identifier
- `sourceVariableId: string` - Variable that triggers updates
- `targetVariableId: string` - Variable that gets updated
- `formula: string` - Mathematical expression for calculation
- `condition?: VNCondition` - Optional activation condition
- `priority: number` - Execution order for dependency resolution
- `isActive: boolean` - Current activation state
- `lastExecuted: timestamp` - Performance tracking

**Relationships**:
- References two `VNVariable` instances (source and target)
- Can create dependency chains with other relationships
- May trigger `StateMonitor` updates

**State Transitions**:
- Inactive → Active (when condition met)
- Pending → Executed (during update cycle)

**Validation Rules**:
- Source and target variables must exist
- Formula must be valid mathematical expression
- Circular dependencies detected and prevented
- Priority ordering must avoid conflicts

---

### Content Wizard

Step-by-step guided process for creating complex VN features with automated component generation.

**Fields**:
- `id: string` - Unique wizard identifier
- `name: string` - Display name for wizard selection
- `category: WizardCategory` - Feature type (dating-sim, shop, etc.)
- `steps: WizardStep[]` - Ordered configuration steps
- `currentStep: number` - Current progress position
- `configuration: Record<string, any>` - Collected user inputs
- `generatedComponents: ComponentReference[]` - Created components
- `isComplete: boolean` - Completion status
- `validationErrors: ValidationError[]` - Current issues

**Relationships**:
- Creates multiple `VNUIScreen`, `VNCharacter`, `VNVariable` instances
- May reference `Template` instances for sub-components
- Tracked by `StateMonitor` for debugging

**State Transitions**:
- In Progress → Complete → Applied to Project
- Can be paused and resumed at any step

**Validation Rules**:
- All required steps must be completed
- Generated components must be valid
- Configuration must pass step validation
- Dependencies must be satisfied before generation

---

### Context Panel

Dynamic interface section that shows relevant tools and options based on current user selection.

**Fields**:
- `id: string` - Unique panel identifier
- `title: string` - Panel display title
- `selectedItemType: string` - Type of currently selected item
- `selectedItemId: string` - ID of selected item
- `availableTools: Tool[]` - Contextual tool options
- `displayMode: PanelMode` - Basic or advanced view
- `isCollapsed: boolean` - Panel visibility state
- `lastUpdated: timestamp` - State change tracking

**Relationships**:
- Observes selection changes across editor components
- References tools and actions from various managers
- Updates based on selected `VNScene`, `VNCharacter`, `VNUIElement`, etc.

**State Transitions**:
- Empty → Populated (when item selected)
- Basic → Advanced (user preference)
- Visible → Collapsed (space management)

**Validation Rules**:
- Selected item must exist in project
- Available tools must be compatible with item type
- Panel updates must be responsive (<100ms)

---

### State Monitor

Real-time debugging interface showing variable values, logic flow, and system state during testing.

**Fields**:
- `id: string` - Monitor session identifier
- `isActive: boolean` - Monitoring state
- `trackedVariables: string[]` - Variable IDs being watched
- `logicFlowHistory: LogicFlowEvent[]` - Execution trace
- `performanceMetrics: PerformanceData` - Timing and memory stats
- `filterSettings: MonitorFilter` - Display preferences
- `exportFormat: 'json' | 'csv' | 'log'` - Data export options

**Relationships**:
- Observes all `VNVariable` changes
- Tracks `LogicNode` execution flow
- References active `VNScene` and commands

**State Transitions**:
- Inactive → Active (when preview started)
- Recording → Paused → Recording (user control)

**Validation Rules**:
- Performance impact must be minimal (<5ms overhead)
- Data retention must respect memory limits
- Export format must be valid and complete

## Supporting Types

### Enumerations

```typescript
enum TemplateCategory {
  CHARACTER_CREATOR = 'character-creator',
  OUTFIT_PICKER = 'outfit-picker', 
  SHOP_SCREEN = 'shop-screen',
  STAT_TRACKER = 'stat-tracker',
  DATING_SIM = 'dating-sim',
  MINI_GAME = 'mini-game'
}

enum LogicNodeType {
  CONDITION = 'condition',
  VARIABLE_CHECK = 'variable-check',
  BRANCH = 'branch',
  ACTION = 'action',
  TEMPLATE = 'template'
}

enum WizardCategory {
  DATING_SIM = 'dating-sim',
  SHOP_SYSTEM = 'shop-system', 
  COMBAT_SYSTEM = 'combat-system',
  MINI_GAME = 'mini-game'
}

enum PanelMode {
  BASIC = 'basic',
  ADVANCED = 'advanced'
}
```

### Composite Types

```typescript
interface CustomizationBounds {
  allowManualOverride: boolean;
  maxComplexity: number;
  allowedModifications: string[];
  restrictedAreas: string[];
}

interface Point2D {
  x: number;
  y: number;
}

interface LogicConnection {
  nodeId: string;
  portIndex: number;
  type: 'input' | 'output';
}

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
  fields: FormField[];
  isRequired: boolean;
  validation: ValidationSchema;
}

interface Tool {
  id: string;
  name: string;
  icon: string;
  action: () => void;
  isEnabled: boolean;
}

interface PerformanceData {
  evaluationTime: number;
  memoryUsage: number;
  variableCount: number;
  logicComplexity: number;
}
```

## Migration Considerations

### Schema Versioning

All entities include version fields for backward compatibility:
- Current project schema version: 2.0
- Enhanced features require schema version: 2.1
- Migration functions handle version upgrades automatically

### Backward Compatibility

- Existing `VNCondition` format maintained for legacy projects
- New `LogicNode` system exports to compatible condition format
- Template system generates standard `VNUIScreen` objects
- Enhanced variables extend existing variable types without breaking changes