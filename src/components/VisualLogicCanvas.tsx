import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { LogicGraph, LogicNode, LogicConnection, LogicNodeType, ConnectionPort, ConnectionType } from '../types/logic';
import { VisualLogicService } from '../features/visual-logic/VisualLogicService';
import { VNCondition } from '../types/shared';
import { VNID } from '../types';

interface VisualLogicCanvasProps {
  isOpen: boolean;
  onClose: () => void;
  initialConditions?: VNCondition[];
  onExport?: (conditions: VNCondition[]) => void;
}

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface DraggingNode {
  id: string;
  offsetX: number;
  offsetY: number;
}

interface DrawingConnection {
  sourceNodeId: string;
  sourcePortId: string;
  mouseX: number;
  mouseY: number;
}

const NODE_COLORS: Record<string, string> = {
  'start': '#4ade80',
  'end': '#4ade80',
  'condition': '#60a5fa',
  'variable-check': '#a78bfa',
  'variable-set': '#a78bfa',
  'math-operation': '#a78bfa',
  'and-gate': '#fb923c',
  'or-gate': '#fb923c',
  'not-gate': '#fb923c',
  'switch': '#facc15',
  'comment': '#9ca3af',
  'random': '#22d3ee',
  'timer': '#22d3ee',
  'input': '#22d3ee',
  'output': '#22d3ee',
  'loop': '#22d3ee',
  'custom': '#22d3ee',
};

const NODE_ICONS: Record<string, string> = {
  'start': '▶️',
  'end': '⏹️',
  'condition': '🔀',
  'variable-check': '🔍',
  'variable-set': '✏️',
  'math-operation': '🔢',
  'and-gate': '&',
  'or-gate': '|',
  'not-gate': '!',
  'switch': '🔃',
  'comment': '💬',
  'random': '🎲',
  'timer': '⏱️',
  'input': '📥',
  'output': '📤',
  'loop': '🔄',
  'custom': '⚙️',
};

const CONNECTION_COLORS: Record<string, string> = {
  'boolean': '#4ade80',
  'number': '#60a5fa',
  'string': '#facc15',
  'variable': '#a78bfa',
  'condition': '#fb923c',
  'trigger': '#94a3b8',
  'any': '#94a3b8',
};

const PALETTE_GROUPS: { label: string; types: LogicNodeType[] }[] = [
  { label: 'Flow', types: ['start', 'end'] },
  { label: 'Logic', types: ['condition', 'and-gate', 'or-gate', 'not-gate', 'switch'] },
  { label: 'Variables', types: ['variable-check', 'variable-set', 'math-operation'] },
  { label: 'Events', types: ['random', 'timer', 'input', 'output'] },
  { label: 'Other', types: ['comment', 'loop', 'custom'] },
];

function getNodeColor(type: LogicNodeType): string {
  return NODE_COLORS[type] || '#22d3ee';
}

function getNodeLabel(type: LogicNodeType): string {
  return type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getPortPosition(
  node: LogicNode,
  portId: string,
  isOutput: boolean
): { x: number; y: number } {
  const ports = isOutput ? node.outputPorts : node.inputPorts;
  const idx = ports.findIndex(p => p.id === portId);
  const total = ports.length;
  const headerHeight = 28;
  const portAreaHeight = node.appearance.height - headerHeight;
  const spacing = total > 1 ? portAreaHeight / (total + 1) : portAreaHeight / 2;
  const y = node.position.y + headerHeight + spacing * (idx + 1);
  const x = isOutput ? node.position.x + node.appearance.width : node.position.x;
  return { x, y };
}

const NodePalette: React.FC<{
  show: boolean;
  onToggle: () => void;
  onAddNode: (type: LogicNodeType) => void;
}> = ({ show, onToggle, onAddNode }) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 40,
        bottom: 0,
        width: show ? 200 : 0,
        overflow: 'hidden',
        transition: 'width 0.2s ease',
        zIndex: 20,
      }}
    >
      <div
        className="bg-slate-800 border-r border-slate-600 h-full overflow-y-auto"
        style={{ width: 200 }}
      >
        <div className="p-2 border-b border-slate-600 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Node Palette</span>
          <button
            onClick={onToggle}
            className="text-slate-400 hover:text-white text-sm px-1"
            title="Hide palette"
          >
            ✕
          </button>
        </div>
        {PALETTE_GROUPS.map(group => (
          <div key={group.label} className="mb-1">
            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {group.label}
            </div>
            {group.types.map(type => (
              <button
                key={type}
                onClick={() => onAddNode(type)}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors"
              >
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: getNodeColor(type) }}
                />
                <span>{NODE_ICONS[type] || '⚙️'}</span>
                <span>{getNodeLabel(type)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const Toolbar: React.FC<{
  graphName: string;
  viewport: Viewport;
  selectedCount: number;
  showPalette: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onDeleteSelected: () => void;
  onExport: () => void;
  onTogglePalette: () => void;
  onClose: () => void;
}> = ({
  graphName, viewport, selectedCount, showPalette,
  onZoomIn, onZoomOut, onFitToScreen,
  onDeleteSelected, onExport, onTogglePalette, onClose
}) => {
  return (
    <div
      className="bg-slate-800 border-b border-slate-600 flex items-center gap-2 px-3 py-1.5"
      style={{ height: 40, position: 'relative', zIndex: 30 }}
    >
      <button
        onClick={onTogglePalette}
        className="text-slate-300 hover:text-white text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
        title={showPalette ? 'Hide palette' : 'Show palette'}
      >
        {showPalette ? '◀' : '▶'} Nodes
      </button>
      <div className="w-px h-5 bg-slate-600" />
      <span className="text-sm font-semibold text-slate-200 truncate max-w-[200px]">
        {graphName}
      </span>
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <button
          onClick={onZoomOut}
          className="text-slate-300 hover:text-white text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
          title="Zoom Out"
        >
          −
        </button>
        <span className="text-[10px] text-slate-400 w-12 text-center">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <button
          onClick={onZoomIn}
          className="text-slate-300 hover:text-white text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={onFitToScreen}
          className="text-slate-300 hover:text-white text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
          title="Fit to Screen"
        >
          ⊞
        </button>
      </div>
      <div className="w-px h-5 bg-slate-600" />
      {selectedCount > 0 && (
        <button
          onClick={onDeleteSelected}
          className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
          title="Delete selected"
        >
          🗑 Delete ({selectedCount})
        </button>
      )}
      <button
        onClick={onExport}
        className="text-emerald-400 hover:text-emerald-300 text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
        title="Export to Conditions"
      >
        📤 Export
      </button>
      <div className="w-px h-5 bg-slate-600" />
      <button
        onClick={onClose}
        className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
        title="Close"
      >
        ✕
      </button>
    </div>
  );
};

const CanvasNode: React.FC<{
  node: LogicNode;
  isSelected: boolean;
  viewport: Viewport;
  onMouseDownHeader: (nodeId: string, e: React.MouseEvent) => void;
  onPortMouseDown: (nodeId: string, portId: string, e: React.MouseEvent) => void;
  onPortMouseUp: (nodeId: string, portId: string) => void;
  onClick: (nodeId: string, e: React.MouseEvent) => void;
}> = ({ node, isSelected, viewport, onMouseDownHeader, onPortMouseDown, onPortMouseUp, onClick }) => {
  const color = getNodeColor(node.type);
  const headerHeight = 28;

  return (
    <div
      style={{
        position: 'absolute',
        left: node.position.x,
        top: node.position.y,
        width: node.appearance.width,
        minHeight: node.appearance.height,
        transform: 'translate(0, 0)',
        zIndex: isSelected ? 10 : 1,
      }}
      onClick={(e) => { e.stopPropagation(); onClick(node.id, e); }}
    >
      <div
        style={{
          borderRadius: 8,
          overflow: 'hidden',
          border: isSelected ? `2px solid ${color}` : '2px solid rgba(255,255,255,0.1)',
          boxShadow: isSelected
            ? `0 0 12px ${color}44, 0 4px 12px rgba(0,0,0,0.4)`
            : '0 2px 8px rgba(0,0,0,0.3)',
          background: 'rgba(30, 30, 50, 0.9)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <div
          style={{
            height: headerHeight,
            background: `linear-gradient(135deg, ${color}cc, ${color}88)`,
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'grab',
            userSelect: 'none',
          }}
          onMouseDown={(e) => { e.stopPropagation(); onMouseDownHeader(node.id, e); }}
        >
          <span style={{ fontSize: 12 }}>{NODE_ICONS[node.type] || '⚙️'}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.label}
          </span>
        </div>

        <div style={{ padding: '6px 0', minHeight: node.appearance.height - headerHeight, position: 'relative' }}>
          {node.inputPorts.map((port, idx) => {
            const total = node.inputPorts.length;
            const areaH = Math.max(node.appearance.height - headerHeight, total * 20);
            const spacing = total > 1 ? areaH / (total + 1) : areaH / 2;
            const py = spacing * (idx + 1);
            return (
              <div
                key={port.id}
                style={{
                  position: 'absolute',
                  left: -6,
                  top: py - 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    border: '2px solid ' + (CONNECTION_COLORS[port.type] || '#94a3b8'),
                    background: 'rgba(30,30,50,0.9)',
                    cursor: 'pointer',
                  }}
                  onMouseUp={() => onPortMouseUp(node.id, port.id)}
                  title={`${port.label} (${port.type})`}
                />
                <span style={{ fontSize: 9, color: '#94a3b8' }}>{port.label}</span>
              </div>
            );
          })}
          {node.outputPorts.map((port, idx) => {
            const total = node.outputPorts.length;
            const areaH = Math.max(node.appearance.height - headerHeight, total * 20);
            const spacing = total > 1 ? areaH / (total + 1) : areaH / 2;
            const py = spacing * (idx + 1);
            return (
              <div
                key={port.id}
                style={{
                  position: 'absolute',
                  right: -6,
                  top: py - 6,
                  display: 'flex',
                  alignItems: 'center',
                  flexDirection: 'row-reverse',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    border: '2px solid ' + (CONNECTION_COLORS[port.type] || '#94a3b8'),
                    background: CONNECTION_COLORS[port.type] || '#94a3b8',
                    cursor: 'pointer',
                  }}
                  onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown(node.id, port.id, e); }}
                  title={`${port.label} (${port.type})`}
                />
                <span style={{ fontSize: 9, color: '#94a3b8' }}>{port.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const VisualLogicCanvas: React.FC<VisualLogicCanvasProps> = ({
  isOpen,
  onClose,
  initialConditions,
  onExport,
}) => {
  const service = useMemo(() => new VisualLogicService(), []);
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [graph, setGraph] = useState<LogicGraph | null>(null);
  const [graphId, setGraphId] = useState<string | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [draggingNode, setDraggingNode] = useState<DraggingNode | null>(null);
  const [drawingConnection, setDrawingConnection] = useState<DrawingConnection | null>(null);
  const [showPalette, setShowPalette] = useState(true);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const init = async () => {
      const result = await service.createLogicGraph(initialConditions);
      setGraphId(result.graphId);
      const g = (service as any).graphs.get(result.graphId) as LogicGraph;
      if (g) setGraph({ ...g });
    };
    init();
  }, [isOpen, initialConditions, service]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.code === 'Space' && !spaceHeld) {
        setSpaceHeld(true);
      }
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedNodes.size > 0 && graph) {
          handleDeleteSelected();
        }
      }
      if (e.code === 'Escape') {
        onClose();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isOpen, spaceHeld, selectedNodes, graph, onClose]);

  const refreshGraph = useCallback(() => {
    if (!graphId) return;
    const g = (service as any).graphs.get(graphId) as LogicGraph;
    if (g) setGraph({ ...g });
  }, [graphId, service]);

  const handleAddNode = useCallback(async (type: LogicNodeType) => {
    if (!graphId) return;
    const centerX = (-viewport.x + 400) / viewport.zoom;
    const centerY = (-viewport.y + 300) / viewport.zoom;
    try {
      await service.addLogicNode(graphId, type, { x: centerX, y: centerY });
      refreshGraph();
    } catch (err) {
      console.error('Failed to add node:', err);
    }
  }, [graphId, viewport, service, refreshGraph]);

  const handleDeleteSelected = useCallback(async () => {
    if (!graphId || !graph) return;
    for (const nodeId of selectedNodes) {
      delete graph.nodes[nodeId];
      const connToRemove = (Object.entries(graph.connections) as [string, LogicConnection][])
        .filter(([_, c]) => c.sourceNodeId === nodeId || c.targetNodeId === nodeId)
        .map(([id]) => id);
      connToRemove.forEach(id => delete graph.connections[id]);
    }
    const g = (service as any).graphs.get(graphId) as LogicGraph;
    if (g) {
      for (const nid of selectedNodes) {
        delete g.nodes[nid];
      }
      Object.keys(g.connections).forEach(cid => {
        const c = g.connections[cid];
        if (selectedNodes.has(c.sourceNodeId) || selectedNodes.has(c.targetNodeId)) {
          delete g.connections[cid];
        }
      });
    }
    setSelectedNodes(new Set());
    refreshGraph();
  }, [graphId, graph, selectedNodes, service, refreshGraph]);

  const handleExport = useCallback(async () => {
    if (!graphId) return;
    try {
      const result = await service.exportToConditions(graphId);
      onExport?.(result.conditions);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [graphId, service, onExport]);

  const handleZoomIn = useCallback(() => {
    setViewport(v => ({ ...v, zoom: Math.min(2.0, v.zoom * 1.2) }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setViewport(v => ({ ...v, zoom: Math.max(0.25, v.zoom / 1.2) }));
  }, []);

  const handleFitToScreen = useCallback(() => {
    if (!graph) return;
    const fitNodes = Object.values(graph.nodes) as LogicNode[];
    if (fitNodes.length === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    fitNodes.forEach(n => {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + n.appearance.width);
      maxY = Math.max(maxY, n.position.y + n.appearance.height);
    });
    const canvasW = canvasRef.current?.clientWidth || 800;
    const canvasH = (canvasRef.current?.clientHeight || 600) - 40;
    const padding = 80;
    const graphW = maxX - minX + padding * 2;
    const graphH = maxY - minY + padding * 2;
    const zoom = Math.min(2.0, Math.max(0.25, Math.min(canvasW / graphW, canvasH / graphH)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setViewport({
      x: canvasW / 2 - cx * zoom,
      y: canvasH / 2 - cy * zoom,
      zoom,
    });
  }, [graph]);

  const handleCanvasWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setViewport(v => {
      const newZoom = Math.max(0.25, Math.min(2.0, v.zoom * delta));
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { ...v, zoom: newZoom };
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top - 40;
      const scale = newZoom / v.zoom;
      return {
        x: mx - (mx - v.x) * scale,
        y: my - (my - v.y) * scale,
        zoom: newZoom,
      };
    });
  }, []);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, vx: viewport.x, vy: viewport.y });
      return;
    }
    if (e.button === 0 && e.target === e.currentTarget) {
      setSelectedNodes(new Set());
      setDrawingConnection(null);
    }
  }, [spaceHeld, viewport]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning && panStart) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setViewport(v => ({ ...v, x: panStart.vx + dx, y: panStart.vy + dy }));
      return;
    }

    if (draggingNode && graph && graphId) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top - 40;
      const newX = (mx - viewport.x) / viewport.zoom - draggingNode.offsetX;
      const newY = (my - viewport.y) / viewport.zoom - draggingNode.offsetY;
      const g = (service as any).graphs.get(graphId) as LogicGraph;
      if (g && g.nodes[draggingNode.id]) {
        g.nodes[draggingNode.id].position = { x: newX, y: newY };
      }
      refreshGraph();
      return;
    }

    if (drawingConnection) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = (e.clientX - rect.left - viewport.x) / viewport.zoom;
      const my = (e.clientY - rect.top - 40 - viewport.y) / viewport.zoom;
      setDrawingConnection(prev => prev ? { ...prev, mouseX: mx, mouseY: my } : null);
    }
  }, [isPanning, panStart, draggingNode, drawingConnection, graph, graphId, viewport, service, refreshGraph]);

  const handleCanvasMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
    }
    if (draggingNode) {
      setDraggingNode(null);
    }
    if (drawingConnection) {
      setDrawingConnection(null);
    }
  }, [isPanning, draggingNode, drawingConnection]);

  const handleNodeHeaderMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    if (!graph) return;
    const node = graph.nodes[nodeId];
    if (!node) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = (e.clientX - rect.left - viewport.x) / viewport.zoom;
    const my = (e.clientY - rect.top - 40 - viewport.y) / viewport.zoom;
    setDraggingNode({
      id: nodeId,
      offsetX: mx - node.position.x,
      offsetY: my - node.position.y,
    });
  }, [graph, viewport]);

  const handleNodeClick = useCallback((nodeId: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedNodes(prev => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
    } else {
      setSelectedNodes(new Set([nodeId]));
    }
  }, []);

  const handlePortMouseDown = useCallback((nodeId: string, portId: string, e: React.MouseEvent) => {
    if (!graph) return;
    const node = graph.nodes[nodeId];
    if (!node) return;
    const pos = getPortPosition(node, portId, true);
    setDrawingConnection({
      sourceNodeId: nodeId,
      sourcePortId: portId,
      mouseX: pos.x,
      mouseY: pos.y,
    });
  }, [graph]);

  const handlePortMouseUp = useCallback(async (targetNodeId: string, targetPortId: string) => {
    if (!drawingConnection || !graphId) return;
    if (drawingConnection.sourceNodeId === targetNodeId) return;
    try {
      const sourcePort = parseInt(drawingConnection.sourcePortId) || 0;
      const targetPort = parseInt(targetPortId) || 0;
      await service.connectNodes(
        graphId,
        drawingConnection.sourceNodeId,
        sourcePort,
        targetNodeId,
        targetPort
      );
      refreshGraph();
    } catch (err) {
      console.error('Failed to connect nodes:', err);
    }
    setDrawingConnection(null);
  }, [drawingConnection, graphId, service, refreshGraph]);

  const renderConnections = useCallback(() => {
    if (!graph) return null;
    const connections = Object.values(graph.connections) as LogicConnection[];
    return connections.map((conn: LogicConnection) => {
      const sourceNode = graph.nodes[conn.sourceNodeId];
      const targetNode = graph.nodes[conn.targetNodeId];
      if (!sourceNode || !targetNode) return null;

      const sp = getPortPosition(sourceNode, conn.sourcePortId, true);
      const tp = getPortPosition(targetNode, conn.targetPortId, false);
      const dx = Math.abs(tp.x - sp.x) * 0.5;
      const path = `M ${sp.x} ${sp.y} C ${sp.x + dx} ${sp.y}, ${tp.x - dx} ${tp.y}, ${tp.x} ${tp.y}`;
      const color = CONNECTION_COLORS[conn.type] || '#94a3b8';

      return (
        <path
          key={conn.id}
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.8}
        />
      );
    });
  }, [graph]);

  const renderDrawingConnection = useCallback(() => {
    if (!drawingConnection || !graph) return null;
    const sourceNode = graph.nodes[drawingConnection.sourceNodeId];
    if (!sourceNode) return null;
    const sp = getPortPosition(sourceNode, drawingConnection.sourcePortId, true);
    const mp = { x: drawingConnection.mouseX, y: drawingConnection.mouseY };
    const dx = Math.abs(mp.x - sp.x) * 0.5;
    const path = `M ${sp.x} ${sp.y} C ${sp.x + dx} ${sp.y}, ${mp.x - dx} ${mp.y}, ${mp.x} ${mp.y}`;

    return (
      <path
        d={path}
        fill="none"
        stroke="#facc15"
        strokeWidth={2}
        strokeDasharray="6,4"
        strokeLinecap="round"
        opacity={0.7}
      />
    );
  }, [drawingConnection, graph]);

  if (!isOpen) return null;

  const nodes = graph ? (Object.values(graph.nodes) as LogicNode[]) : [];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Toolbar
        graphName={graph?.name || 'Logic Graph'}
        viewport={viewport}
        selectedCount={selectedNodes.size}
        showPalette={showPalette}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitToScreen={handleFitToScreen}
        onDeleteSelected={handleDeleteSelected}
        onExport={handleExport}
        onTogglePalette={() => setShowPalette(p => !p)}
        onClose={onClose}
      />

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <NodePalette
          show={showPalette}
          onToggle={() => setShowPalette(p => !p)}
          onAddNode={handleAddNode}
        />

        <div
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            left: showPalette ? 200 : 0,
            transition: 'left 0.2s ease',
            background: '#1a1a2e',
            cursor: isPanning || spaceHeld ? 'grabbing' : 'default',
            overflow: 'hidden',
          }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onWheel={handleCanvasWheel}
        >
          <svg
            ref={svgRef}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            <defs>
              <pattern
                id="grid-dots"
                width={20}
                height={20}
                patternUnits="userSpaceOnUse"
                patternTransform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}
              >
                <circle cx={10} cy={10} r={1} fill="rgba(255,255,255,0.08)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-dots)" />
            <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
              {renderConnections()}
              {renderDrawingConnection()}
            </g>
          </svg>

          <div
            style={{
              position: 'absolute',
              inset: 0,
              transformOrigin: '0 0',
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
              pointerEvents: 'none',
            }}
          >
            {nodes.map(node => (
              <div key={node.id} style={{ pointerEvents: 'auto' }}>
                <CanvasNode
                  node={node}
                  isSelected={selectedNodes.has(node.id)}
                  viewport={viewport}
                  onMouseDownHeader={handleNodeHeaderMouseDown}
                  onPortMouseDown={handlePortMouseDown}
                  onPortMouseUp={handlePortMouseUp}
                  onClick={handleNodeClick}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisualLogicCanvas;
