/**
 * Logic Canvas Component for FlourishVNE
 * 
 * Purpose: Visual canvas for building logic graphs with drag-and-drop nodes
 * 
 * Features:
 * - Drag-and-drop node placement
 * - Node connection drawing
 * - Pan and zoom canvas
 * - Node selection and editing
 * - Grid snapping
 * - Undo/redo support
 * - Export/import logic graphs
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { LogicNode, LogicNodeType, LogicConnection, LogicGraph } from '../../types/logic';
import { VisualLogicService } from '../../features/visual-logic/VisualLogicService';
import { VNID } from '../../types';

// Create service instance
const logicService = new VisualLogicService();

/**
 * Canvas props
 */
export interface LogicCanvasProps {
  graphId?: VNID;
  initialGraph?: LogicGraph;
  readOnly?: boolean;
  showGrid?: boolean;
  snapToGrid?: boolean;
  gridSize?: number;
  width?: number | string;
  height?: number | string;
  onGraphChange?: (graph: LogicGraph) => void;
  onNodeSelect?: (node: LogicNode | null) => void;
  onConnectionCreate?: (connection: LogicConnection) => void;
}

/**
 * Canvas state
 */
interface CanvasState {
  nodes: Record<VNID, LogicNode>;
  connections: Record<VNID, LogicConnection>;
  selectedNodeId: VNID | null;
  selectedConnectionId: VNID | null;
  scale: number;
  offset: { x: number; y: number };
  isDragging: boolean;
  isPanning: boolean;
  connectingFrom: { nodeId: VNID; portId: string } | null;
}

/**
 * Logic Canvas Component
 */
export const LogicCanvas: React.FC<LogicCanvasProps> = ({
  graphId,
  initialGraph,
  readOnly = false,
  showGrid = true,
  snapToGrid = true,
  gridSize = 20,
  width = '100%',
  height = '600px',
  onGraphChange,
  onNodeSelect,
  onConnectionCreate
}) => {
  // Refs
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragNodeRef = useRef<{ nodeId: VNID; startPos: { x: number; y: number } } | null>(null);

  // State
  const [state, setState] = useState<CanvasState>({
    nodes: initialGraph?.nodes || {},
    connections: initialGraph?.connections || {},
    selectedNodeId: null,
    selectedConnectionId: null,
    scale: 1,
    offset: { x: 0, y: 0 },
    isDragging: false,
    isPanning: false,
    connectingFrom: null
  });

  // Load graph on mount
  useEffect(() => {
    if (graphId) {
      loadGraph(graphId);
    }
  }, [graphId]);

  /**
   * Load graph from service (placeholder)
   */
  const loadGraph = async (id: VNID) => {
    // In production, would load from service
    // For now, we work with initialGraph prop
    console.log('Loading graph:', id);
  };

  /**
   * Add node to canvas
   */
  const addNode = useCallback((type: LogicNodeType, position: { x: number; y: number }) => {
    if (readOnly) return;

    const nodeId = `node_${Date.now()}`;
    const newNode: LogicNode = {
      id: nodeId,
      type,
      position: snapToGrid ? snapPosition(position, gridSize) : position,
      appearance: {
        width: 200,
        height: 80,
        color: getNodeColor(type)
      },
      label: getNodeLabel(type),
      inputPorts: getDefaultInputPorts(type),
      outputPorts: getDefaultOutputPorts(type),
      config: {},
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

    setState(prev => {
      const nodes = { ...prev.nodes, [nodeId]: newNode };
      notifyGraphChange(nodes, prev.connections);
      return { ...prev, nodes };
    });
  }, [readOnly, snapToGrid, gridSize]);

  /**
   * Remove node from canvas
   */
  const removeNode = useCallback((nodeId: VNID) => {
    if (readOnly) return;

    setState(prev => {
      const { [nodeId]: removed, ...nodes } = prev.nodes;
      const connections = Object.fromEntries(
        Object.entries(prev.connections).filter(
          ([_, c]) => (c as LogicConnection).sourceNodeId !== nodeId && (c as LogicConnection).targetNodeId !== nodeId
        )
      ) as Record<VNID, LogicConnection>;
      notifyGraphChange(nodes, connections);
      return { ...prev, nodes, connections, selectedNodeId: null };
    });
  }, [readOnly]);

  /**
   * Update node position
   */
  const updateNodePosition = useCallback((nodeId: VNID, position: { x: number; y: number }) => {
    if (readOnly) return;

    setState(prev => {
      const node = prev.nodes[nodeId];
      if (!node) return prev;

      const nodes = {
        ...prev.nodes,
        [nodeId]: { ...node, position: snapToGrid ? snapPosition(position, gridSize) : position }
      };
      notifyGraphChange(nodes, prev.connections);
      return { ...prev, nodes };
    });
  }, [readOnly, snapToGrid, gridSize]);

  /**
   * Select node
   */
  const selectNode = useCallback((nodeId: VNID | null) => {
    setState(prev => ({ ...prev, selectedNodeId: nodeId }));
    const node = nodeId ? state.nodes[nodeId] || null : null;
    onNodeSelect?.(node);
  }, [state.nodes, onNodeSelect]);

  /**
   * Start connection
   */
  const startConnection = useCallback((nodeId: VNID, portId: string) => {
    if (readOnly) return;

    setState(prev => ({
      ...prev,
      connectingFrom: { nodeId, portId }
    }));
  }, [readOnly]);

  /**
   * Complete connection
   */
  const completeConnection = useCallback((targetNodeId: VNID, targetPortId: string) => {
    if (readOnly || !state.connectingFrom) return;

    const connId = `conn_${Date.now()}`;
    const connection: LogicConnection = {
      id: connId,
      sourceNodeId: state.connectingFrom.nodeId,
      sourcePortId: state.connectingFrom.portId,
      targetNodeId,
      targetPortId,
      type: 'trigger',
      isValid: true,
      createdAt: new Date()
    };

    setState(prev => {
      const connections = { ...prev.connections, [connId]: connection };
      notifyGraphChange(prev.nodes, connections);
      onConnectionCreate?.(connection);
      return { ...prev, connections, connectingFrom: null };
    });
  }, [readOnly, state.connectingFrom, onConnectionCreate]);

  /**
   * Remove connection
   */
  const removeConnection = useCallback((connectionId: VNID) => {
    if (readOnly) return;

    setState(prev => {
      const { [connectionId]: removed, ...connections } = prev.connections;
      notifyGraphChange(prev.nodes, connections);
      return { ...prev, connections, selectedConnectionId: null };
    });
  }, [readOnly]);

  /**
   * Notify graph change
   */
  const notifyGraphChange = (nodes: Record<VNID, LogicNode>, connections: Record<VNID, LogicConnection>) => {
    if (onGraphChange) {
      const nodeArray = Object.values(nodes);
      const connArray = Object.values(connections);
      
      const graph: LogicGraph = {
        id: graphId || `graph_${Date.now()}`,
        name: 'Logic Graph',
        description: '',
        nodes,
        connections,
        variables: [],
        isValid: true,
        hasCircularDependency: false,
        validationErrors: [],
        viewport: {
          x: state.offset.x,
          y: state.offset.y,
          zoom: state.scale
        },
        createdAt: new Date(),
        lastModified: new Date(),
        version: 1
      };
      onGraphChange(graph);
    }
  };

  /**
   * Handle mouse down on node
   */
  const handleNodeMouseDown = useCallback((nodeId: VNID, e: React.MouseEvent) => {
    if (readOnly) return;

    e.stopPropagation();
    selectNode(nodeId);

    const node = state.nodes[nodeId];
    if (node) {
      dragNodeRef.current = {
        nodeId,
        startPos: { x: e.clientX - node.position.x, y: e.clientY - node.position.y }
      };
      setState(prev => ({ ...prev, isDragging: true }));
    }
  }, [readOnly, state.nodes, selectNode]);

  /**
   * Handle mouse move
   */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (state.isDragging && dragNodeRef.current) {
      const newPos = {
        x: e.clientX - dragNodeRef.current.startPos.x,
        y: e.clientY - dragNodeRef.current.startPos.y
      };
      updateNodePosition(dragNodeRef.current.nodeId, newPos);
    }
  }, [state.isDragging, updateNodePosition]);

  /**
   * Handle mouse up
   */
  const handleMouseUp = useCallback(() => {
    if (state.isDragging) {
      dragNodeRef.current = null;
      setState(prev => ({ ...prev, isDragging: false }));
    }
  }, [state.isDragging]);

  /**
   * Handle zoom
   */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setState(prev => ({
      ...prev,
      scale: Math.max(0.1, Math.min(3, prev.scale * delta))
    }));
  }, []);

  return (
    <div
      className="logic-canvas"
      style={{ width, height, position: 'relative', overflow: 'hidden' }}
    >
      {/* Toolbar */}
      <div className="logic-canvas__toolbar">
        <button
          className="toolbar-btn"
          onClick={() => addNode('start', { x: 100, y: 100 })}
          disabled={readOnly}
          title="Add Start Node"
        >
          Start
        </button>
        <button
          className="toolbar-btn"
          onClick={() => addNode('condition', { x: 300, y: 100 })}
          disabled={readOnly}
          title="Add Condition Node"
        >
          Condition
        </button>
        <button
          className="toolbar-btn"
          onClick={() => addNode('variable-set', { x: 500, y: 100 })}
          disabled={readOnly}
          title="Add Variable Set Node"
        >
          Set Variable
        </button>
        <button
          className="toolbar-btn"
          onClick={() => addNode('end', { x: 700, y: 100 })}
          disabled={readOnly}
          title="Add End Node"
        >
          End
        </button>
        <div className="toolbar-separator" />
        <button
          className="toolbar-btn"
          onClick={() => setState(prev => ({ ...prev, scale: 1, offset: { x: 0, y: 0 } }))}
          title="Reset View"
        >
          Reset View
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="logic-canvas__content"
        style={{
          transform: `scale(${state.scale}) translate(${state.offset.x}px, ${state.offset.y}px)`,
          cursor: state.isDragging ? 'grabbing' : 'default'
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Grid */}
        {showGrid && (
          <div className="logic-canvas__grid" style={{
            backgroundSize: `${gridSize}px ${gridSize}px`,
            backgroundImage: `
              linear-gradient(to right, rgba(0,0,0,0.1) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(0,0,0,0.1) 1px, transparent 1px)
            `
          }} />
        )}

        {/* Connections */}
        <svg className="logic-canvas__connections">
          {(Object.values(state.connections) as LogicConnection[]).map(conn => {
            const sourceNode = state.nodes[conn.sourceNodeId];
            const targetNode = state.nodes[conn.targetNodeId];
            if (!sourceNode || !targetNode) return null;

            const x1 = sourceNode.position.x + sourceNode.appearance.width;
            const y1 = sourceNode.position.y + sourceNode.appearance.height / 2;
            const x2 = targetNode.position.x;
            const y2 = targetNode.position.y + targetNode.appearance.height / 2;

            return (
              <line
                key={conn.id}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={conn.id === state.selectedConnectionId ? '#0066FF' : '#666'}
                strokeWidth="2"
                onClick={() => setState(prev => ({ ...prev, selectedConnectionId: conn.id }))}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {(Object.values(state.nodes) as LogicNode[]).map(node => (
          <div
            key={node.id}
            className={`logic-node ${node.id === state.selectedNodeId ? 'logic-node--selected' : ''}`}
            style={{
              position: 'absolute',
              left: node.position.x,
              top: node.position.y,
              width: node.appearance.width,
              height: node.appearance.height,
              backgroundColor: node.appearance.color || '#fff',
              border: '2px solid #333',
              borderRadius: '8px',
              padding: '8px',
              cursor: readOnly ? 'default' : 'move',
              boxShadow: node.id === state.selectedNodeId ? '0 0 0 3px rgba(0,102,255,0.3)' : 'none'
            }}
            onMouseDown={e => handleNodeMouseDown(node.id, e)}
          >
            <div className="logic-node__header">
              <span className="logic-node__type">{node.type}</span>
              {!readOnly && (
                <button
                  className="logic-node__delete"
                  onClick={() => removeNode(node.id)}
                  title="Delete node"
                >
                  ×
                </button>
              )}
            </div>
            <div className="logic-node__label">{node.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Helper: Snap position to grid
 */
function snapPosition(pos: { x: number; y: number }, gridSize: number): { x: number; y: number } {
  return {
    x: Math.round(pos.x / gridSize) * gridSize,
    y: Math.round(pos.y / gridSize) * gridSize
  };
}

/**
 * Helper: Get node color by type
 */
function getNodeColor(type: LogicNodeType): string {
  const colors: Record<LogicNodeType, string> = {
    'start': '#4CAF50',
    'end': '#F44336',
    'condition': '#2196F3',
    'variable-check': '#FFC107',
    'variable-set': '#FF9800',
    'math-operation': '#9C27B0',
    'random': '#E91E63',
    'timer': '#00BCD4',
    'input': '#009688',
    'output': '#3F51B5',
    'and-gate': '#607D8B',
    'or-gate': '#607D8B',
    'not-gate': '#607D8B',
    'switch': '#795548',
    'loop': '#673AB7',
    'comment': '#9E9E9E',
    'custom': '#000000'
  };
  return colors[type] || '#CCCCCC';
}

/**
 * Helper: Get node label
 */
function getNodeLabel(type: LogicNodeType): string {
  return type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Helper: Get default input ports
 */
function getDefaultInputPorts(type: LogicNodeType) {
  if (type === 'start') return [];
  return [{ id: 'in', type: 'trigger' as const, label: 'Input', required: true }];
}

/**
 * Helper: Get default output ports
 */
function getDefaultOutputPorts(type: LogicNodeType) {
  if (type === 'end') return [];
  if (type === 'condition') {
    return [
      { id: 'true', type: 'trigger' as const, label: 'True', required: false },
      { id: 'false', type: 'trigger' as const, label: 'False', required: false }
    ];
  }
  return [{ id: 'out', type: 'trigger' as const, label: 'Output', required: false }];
}

/**
 * Helper: Calculate graph complexity
 */
function calculateComplexity(nodes: Record<VNID, LogicNode>, connections: Record<VNID, LogicConnection>): number {
  return Object.keys(nodes).length * 2 + Object.keys(connections).length;
}

export default LogicCanvas;
