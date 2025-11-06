/**
 * Context Panel Manager for FlourishVNE
 * 
 * Purpose: Responsive context-aware panel system that provides relevant
 * tools, suggestions, and documentation based on current editing context
 * 
 * Features:
 * - Dynamic panel providers (scene, character, variable, template, logic, help)
 * - Smart context detection
 * - Collapsible panels with resize support
 * - Quick actions and suggestions
 * - Keyboard shortcuts
 * - Panel persistence (remember expanded state)
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { ContextPanel, ContextSuggestion, ContextAction } from '../../types/context-panels';
import { ContextPanelService } from '../../features/context-panels/ContextPanelService';
import { VNID } from '../../types';

// Create service instance
const panelService = new ContextPanelService();

/**
 * Panel manager props
 */
export interface ContextPanelManagerProps {
  currentContext?: {
    activeTab: string;
    selectedItems?: string[];
    currentScene?: VNID;
    currentCharacter?: VNID;
    currentCommand?: VNID;
    currentVariable?: VNID;
  };
  availablePanels?: string[]; // Limit which panels are available
  defaultExpanded?: boolean;
  minPanelWidth?: number;
  maxPanelWidth?: number;
  position?: 'left' | 'right';
  onSuggestionClick?: (suggestion: ContextSuggestion) => void;
  onPanelAction?: (action: string, data?: any) => void;
}

/**
 * Panel state
 */
interface PanelState {
  expanded: Record<string, boolean>;
  widths: Record<string, number>;
  order: string[];
}

/**
 * Context Panel Manager Component
 */
export const ContextPanelManager: React.FC<ContextPanelManagerProps> = ({
  currentContext = { 
    activeTab: '', 
    selectedItems: [],
    currentScene: undefined,
    currentCharacter: undefined,
    currentCommand: undefined,
    currentVariable: undefined
  },
  availablePanels,
  defaultExpanded = true,
  minPanelWidth = 250,
  maxPanelWidth = 600,
  position = 'right',
  onSuggestionClick,
  onPanelAction
}) => {
  // State
  const [panelState, setPanelState] = useState<PanelState>(() => {
    const saved = localStorage.getItem('flourish_panel_state');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return {
      expanded: {},
      widths: {},
      order: []
    };
  });

  const [activePanels, setActivePanels] = useState<ContextPanel[]>([]);
  const [suggestions, setSuggestions] = useState<ContextSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [, setIconMap] = useState<Record<string, string>>({});

  // Update panels when context changes
  useEffect(() => {
    updatePanelsForContext();
  }, [currentContext.activeTab, currentContext.currentScene, currentContext.currentCharacter]);

  // Save panel state to localStorage
  useEffect(() => {
    localStorage.setItem('flourish_panel_state', JSON.stringify(panelState));
  }, [panelState]);

  /**
   * Update panels based on current context
   */
  const updatePanelsForContext = useCallback(() => {
    setIsLoading(true);
    try {
      // Update editor state
      panelService.updateEditorState({
        activeTab: currentContext.activeTab,
        selectedItems: currentContext.selectedItems || [],
        currentScene: currentContext.currentScene,
        currentCharacter: currentContext.currentCharacter,
        currentCommand: currentContext.currentCommand,
        currentVariable: currentContext.currentVariable
      });
      
      // Get active panels
      const panels = panelService.getActivePanels();
      
      // Filter by available panels if specified
      const filtered = availablePanels
        ? panels.filter(p => availablePanels.includes(p.id))
        : panels;

      setActivePanels(filtered);

      // Get suggestions from context analysis
      const analysis = panelService.analyzeCurrentContext();
      setSuggestions(analysis.suggestions);

      // Initialize panel state for new panels
      setPanelState(prev => {
        const expanded = { ...prev.expanded };
        const widths = { ...prev.widths };
        const order = [...prev.order];

        filtered.forEach(panel => {
          if (!(panel.id in expanded)) {
            expanded[panel.id] = !panel.isCollapsed;
          }
          if (!(panel.id in widths)) {
            widths[panel.id] = panel.position.width || 300;
          }
          if (!order.includes(panel.id)) {
            order.push(panel.id);
          }
        });

        return { expanded, widths, order };
      });
    } catch (error) {
      console.error('Failed to update panels:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentContext, availablePanels]);

  /**
   * Toggle panel expanded state
   */
  const togglePanel = useCallback((panelId: string) => {
    setPanelState(prev => ({
      ...prev,
      expanded: {
        ...prev.expanded,
        [panelId]: !prev.expanded[panelId]
      }
    }));
  }, []);

  /**
   * Resize panel
   */
  const resizePanel = useCallback((panelId: string, width: number) => {
    const clampedWidth = Math.max(minPanelWidth, Math.min(maxPanelWidth, width));
    setPanelState(prev => ({
      ...prev,
      widths: {
        ...prev.widths,
        [panelId]: clampedWidth
      }
    }));
  }, [minPanelWidth, maxPanelWidth]);

  /**
   * Reorder panels
   */
  const reorderPanels = useCallback((fromIndex: number, toIndex: number) => {
    setPanelState(prev => {
      const order = [...prev.order];
      const [removed] = order.splice(fromIndex, 1);
      order.splice(toIndex, 0, removed);
      return { ...prev, order };
    });
  }, []);

  /**
   * Handle suggestion click
   */
  const handleSuggestionClick = useCallback((suggestion: ContextSuggestion) => {
    onSuggestionClick?.(suggestion);
    
    // Execute suggestion action if available
    if (suggestion.action) {
      onPanelAction?.(suggestion.action.type, suggestion.action.params);
    }
  }, [onSuggestionClick, onPanelAction]);

  /**
   * Sorted panels by order
   */
  const sortedPanels = useMemo(() => {
    return [...activePanels].sort((a, b) => {
      const indexA = panelState.order.indexOf(a.id);
      const indexB = panelState.order.indexOf(b.id);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [activePanels, panelState.order]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`context-panel-manager context-panel-manager--${position}`}>
        <div className="context-panel-manager__loading">
          <div className="spinner" />
          <p>Loading context panels...</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (activePanels.length === 0 && suggestions.length === 0) {
    return (
      <div className={`context-panel-manager context-panel-manager--${position}`}>
        <div className="context-panel-manager__empty">
          <p>No context-specific panels available</p>
          <small>Select an item to see relevant tools and suggestions</small>
        </div>
      </div>
    );
  }

  return (
    <div className={`context-panel-manager context-panel-manager--${position}`}>
      {/* Suggestions section */}
      {suggestions.length > 0 && (
        <div className="context-panel-manager__suggestions">
          <h3 className="suggestions-title">💡 Suggestions</h3>
          <div className="suggestions-list">
            {suggestions.map(suggestion => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onClick={handleSuggestionClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Panels */}
      <div className="context-panel-manager__panels">
        {sortedPanels.map((panel, index) => (
          <Panel
            key={panel.id}
            panel={panel}
            isExpanded={panelState.expanded[panel.id] ?? defaultExpanded}
            width={panelState.widths[panel.id] || panel.config.defaultWidth || 300}
            onToggle={() => togglePanel(panel.id)}
            onResize={width => resizePanel(panel.id, width)}
            onAction={onPanelAction}
            canReorder={sortedPanels.length > 1}
            onReorder={(direction) => {
              if (direction === 'up' && index > 0) {
                reorderPanels(index, index - 1);
              } else if (direction === 'down' && index < sortedPanels.length - 1) {
                reorderPanels(index, index + 1);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * Suggestion card component
 */
interface SuggestionCardProps {
  suggestion: ContextSuggestion;
  onClick: (suggestion: ContextSuggestion) => void;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ suggestion, onClick }) => {
  // Map relevance to priority-like display (higher relevance = higher priority)
  const priorityDisplay = suggestion.relevance > 0.8 ? 'high' : suggestion.relevance > 0.5 ? 'medium' : 'low';
  const priorityColor = {
    high: '#E74C3C',
    medium: '#F39C12',
    low: '#3498DB'
  }[priorityDisplay];

  return (
    <div
      className={`suggestion-card suggestion-card--${suggestion.type}`}
      onClick={() => onClick(suggestion)}
      style={{ borderLeftColor: priorityColor }}
    >
      <div className="suggestion-card__header">
        <span className="suggestion-card__title">{suggestion.title}</span>
        <span className={`suggestion-card__relevance relevance--${priorityDisplay}`}>
          {Math.round(suggestion.relevance * 100)}%
        </span>
      </div>
      <p className="suggestion-card__description">{suggestion.description}</p>
      {suggestion.action && (
        <p className="suggestion-card__action">
          {suggestion.action.icon} {suggestion.action.label}
        </p>
      )}
      {suggestion.dismissible && (
        <button className="suggestion-card__dismiss" onClick={(e) => { e.stopPropagation(); }}>
          ✕
        </button>
      )}
    </div>
  );
};

/**
 * Panel component
 */
interface PanelProps {
  panel: ContextPanel;
  isExpanded: boolean;
  width: number;
  onToggle: () => void;
  onResize: (width: number) => void;
  onAction?: (action: string, data?: any) => void;
  canReorder: boolean;
  onReorder: (direction: 'up' | 'down') => void;
}

const Panel: React.FC<PanelProps> = ({
  panel,
  isExpanded,
  width,
  onToggle,
  onResize,
  onAction,
  canReorder,
  onReorder
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  
  // Get icon from panel if available
  const icon = panel.content.metadata?.icon as string | undefined;

  /**
   * Start resize
   */
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    setResizeStartX(e.clientX);
    setResizeStartWidth(width);
    e.preventDefault();
  }, [width]);

  /**
   * Handle resize
   */
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX;
      onResize(resizeStartWidth + delta);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStartX, resizeStartWidth, onResize]);

  /**
   * Handle action button click
   */
  const handleActionClick = useCallback((actionId: string) => {
    const action = panel.actions.find(a => a.id === actionId);
    if (action) {
      onAction?.(action.action, action.actionData);
    }
  }, [panel.actions, onAction]);

  return (
    <div
      className={`context-panel ${isExpanded ? 'context-panel--expanded' : 'context-panel--collapsed'}`}
      style={{ width: panel.config.resizable ? width : undefined }}
    >
      {/* Header */}
      <div className="context-panel__header" onClick={onToggle}>
        <div className="context-panel__title-row">
          {icon && <span className="context-panel__icon">{icon}</span>}
          <h3 className="context-panel__title">{panel.content.title}</h3>
          <button className="context-panel__toggle" title={isExpanded ? 'Collapse' : 'Expand'}>
            {isExpanded ? '▼' : '▶'}
          </button>
        </div>
        {panel.content.summary && (
          <p className="context-panel__subtitle">{panel.content.summary.substring(0, 60)}...</p>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="context-panel__content">
          {/* Summary */}
          {panel.content.summary && (
            <p className="context-panel__summary">{panel.content.summary}</p>
          )}

          {/* Context Items */}
          {panel.content.items && panel.content.items.length > 0 && (
            <div className="context-panel__items">
              {panel.content.items.map(item => (
                <div key={item.id} className="context-item">
                  <strong className="context-item__title">{item.title}</strong>
                  {item.description && (
                    <p className="context-item__description">{item.description}</p>
                  )}
                  {item.value !== undefined && (
                    <div className="context-item__value">
                      {typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {panel.actions.length > 0 && (
            <div className="context-panel__actions">
              {panel.actions.map(action => (
                <button
                  key={action.id}
                  className={`panel-action-btn`}
                  onClick={() => handleActionClick(action.id)}
                  disabled={action.isEnabled === false}
                  title={action.description}
                >
                  <span className="action-icon">{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {/* Suggestions */}
          {panel.content.suggestions && panel.content.suggestions.length > 0 && (
            <div className="context-panel__suggestions">
              <h4>Suggestions:</h4>
              {panel.content.suggestions.map(suggestion => (
                <div key={suggestion.id} className="context-suggestion">
                  {suggestion.title}
                </div>
              ))}
            </div>
          )}

          {/* Metadata */}
          {panel.content.metadata && Object.keys(panel.content.metadata).length > 0 && (
            <div className="context-panel__metadata">
              {Object.entries(panel.content.metadata).map(([key, value]) => (
                <div key={key} className="metadata-item">
                  <span className="metadata-label">{key}:</span>
                  <span className="metadata-value">{String(value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Resize handle (always enabled) */}
      <div
        className="context-panel__resize-handle"
        onMouseDown={handleResizeStart}
        style={{ cursor: 'ew-resize' }}
      />

      {/* Reorder buttons */}
      {canReorder && isExpanded && (
        <div className="context-panel__reorder">
          <button
            className="reorder-btn reorder-btn--up"
            onClick={() => onReorder('up')}
            title="Move up"
          >
            ↑
          </button>
          <button
            className="reorder-btn reorder-btn--down"
            onClick={() => onReorder('down')}
            title="Move down"
          >
            ↓
          </button>
        </div>
      )}
    </div>
  );
};

export default ContextPanelManager;
