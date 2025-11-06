/**
 * Contextual Toolbar Component for FlourishVNE
 * 
 * Purpose: Display context-sensitive tools based on current editor state
 * Features: Dynamic tool visibility, quick actions, keyboard shortcuts
 * 
 * User Story: US2 - Streamlined Interface Navigation
 * Task: T029
 */

import React, { useMemo, useCallback } from 'react';
import { useProject } from '../../contexts/ProjectContext';
import { VNID } from '../../types';

/**
 * Tool definition
 */
export interface ContextualTool {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  tooltip?: string;
  shortcut?: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

/**
 * Context type determines which tools are shown
 */
export type EditorContext = 
  | 'scene-editing'
  | 'character-editing'
  | 'ui-editing'
  | 'asset-management'
  | 'variable-management'
  | 'settings'
  | 'template-browsing'
  | 'logic-building'
  | 'wizard-flow';

/**
 * Contextual toolbar props
 */
export interface ContextualToolbarProps {
  context: EditorContext;
  activeItemId?: VNID | null;
  onToolAction?: (toolId: string) => void;
  additionalTools?: ContextualTool[];
  hideDefaultTools?: boolean;
}

/**
 * Contextual Toolbar Component
 */
export const ContextualToolbar: React.FC<ContextualToolbarProps> = ({
  context,
  activeItemId,
  onToolAction,
  additionalTools = [],
  hideDefaultTools = false
}) => {
  const { project, dispatch } = useProject();

  /**
   * Get contextual tools based on current context
   */
  const contextualTools = useMemo<ContextualTool[]>(() => {
    if (hideDefaultTools) return [];

    switch (context) {
      case 'scene-editing':
        return [
          {
            id: 'add-dialogue',
            label: 'Add Dialogue',
            icon: <span>💬</span>,
            action: () => onToolAction?.('add-dialogue'),
            tooltip: 'Add dialogue command (Alt+D)',
            shortcut: 'Alt+D'
          },
          {
            id: 'add-choice',
            label: 'Add Choice',
            icon: <span>🔀</span>,
            action: () => onToolAction?.('add-choice'),
            tooltip: 'Add choice command (Alt+C)',
            shortcut: 'Alt+C'
          },
          {
            id: 'add-variable',
            label: 'Set Variable',
            icon: <span>📊</span>,
            action: () => onToolAction?.('add-variable'),
            tooltip: 'Add variable command (Alt+V)',
            shortcut: 'Alt+V'
          },
          {
            id: 'preview-scene',
            label: 'Preview',
            icon: <span>▶️</span>,
            action: () => onToolAction?.('preview-scene'),
            tooltip: 'Preview scene (F5)',
            shortcut: 'F5',
            variant: 'primary'
          }
        ];

      case 'character-editing':
        return [
          {
            id: 'add-expression',
            label: 'Add Expression',
            icon: <span>😊</span>,
            action: () => onToolAction?.('add-expression'),
            tooltip: 'Add new expression',
          },
          {
            id: 'add-outfit',
            label: 'Add Outfit',
            icon: <span>👔</span>,
            action: () => onToolAction?.('add-outfit'),
            tooltip: 'Add outfit variant',
          },
          {
            id: 'duplicate-character',
            label: 'Duplicate',
            icon: <span>📋</span>,
            action: () => onToolAction?.('duplicate-character'),
            tooltip: 'Duplicate character (Ctrl+D)',
            shortcut: 'Ctrl+D'
          }
        ];

      case 'ui-editing':
        return [
          {
            id: 'add-button',
            label: 'Add Button',
            icon: <span>🔘</span>,
            action: () => onToolAction?.('add-button'),
            tooltip: 'Add button element',
          },
          {
            id: 'add-text',
            label: 'Add Text',
            icon: <span>📝</span>,
            action: () => onToolAction?.('add-text'),
            tooltip: 'Add text element',
          },
          {
            id: 'add-image',
            label: 'Add Image',
            icon: <span>🖼️</span>,
            action: () => onToolAction?.('add-image'),
            tooltip: 'Add image element',
          },
          {
            id: 'preview-ui',
            label: 'Preview',
            icon: <span>▶️</span>,
            action: () => onToolAction?.('preview-ui'),
            tooltip: 'Preview UI screen (F5)',
            shortcut: 'F5',
            variant: 'primary'
          }
        ];

      case 'template-browsing':
        return [
          {
            id: 'filter-templates',
            label: 'Filter',
            icon: <span>🔍</span>,
            action: () => onToolAction?.('filter-templates'),
            tooltip: 'Filter templates',
          },
          {
            id: 'sort-templates',
            label: 'Sort',
            icon: <span>↕️</span>,
            action: () => onToolAction?.('sort-templates'),
            tooltip: 'Sort templates',
          },
          {
            id: 'favorites-only',
            label: 'Favorites',
            icon: <span>⭐</span>,
            action: () => onToolAction?.('favorites-only'),
            tooltip: 'Show favorites only',
          }
        ];

      case 'logic-building':
        return [
          {
            id: 'add-condition',
            label: 'Add Condition',
            icon: <span>❓</span>,
            action: () => onToolAction?.('add-condition'),
            tooltip: 'Add condition node',
          },
          {
            id: 'add-action',
            label: 'Add Action',
            icon: <span>⚡</span>,
            action: () => onToolAction?.('add-action'),
            tooltip: 'Add action node',
          },
          {
            id: 'validate-logic',
            label: 'Validate',
            icon: <span>✓</span>,
            action: () => onToolAction?.('validate-logic'),
            tooltip: 'Validate logic flow',
            variant: 'primary'
          }
        ];

      case 'variable-management':
        return [
          {
            id: 'add-variable',
            label: 'Add Variable',
            icon: <span>➕</span>,
            action: () => onToolAction?.('add-variable'),
            tooltip: 'Add new variable (Alt+N)',
            shortcut: 'Alt+N',
            variant: 'primary'
          },
          {
            id: 'debug-variables',
            label: 'Debug',
            icon: <span>🐛</span>,
            action: () => onToolAction?.('debug-variables'),
            tooltip: 'Open variable debugger',
          },
          {
            id: 'export-variables',
            label: 'Export',
            icon: <span>📤</span>,
            action: () => onToolAction?.('export-variables'),
            tooltip: 'Export variable definitions',
          }
        ];

      case 'asset-management':
        return [
          {
            id: 'import-assets',
            label: 'Import',
            icon: <span>📥</span>,
            action: () => onToolAction?.('import-assets'),
            tooltip: 'Import assets',
            variant: 'primary'
          },
          {
            id: 'organize-assets',
            label: 'Organize',
            icon: <span>📁</span>,
            action: () => onToolAction?.('organize-assets'),
            tooltip: 'Organize assets',
          },
          {
            id: 'unused-assets',
            label: 'Find Unused',
            icon: <span>🔎</span>,
            action: () => onToolAction?.('unused-assets'),
            tooltip: 'Find unused assets',
          }
        ];

      case 'wizard-flow':
        return [
          {
            id: 'wizard-back',
            label: 'Back',
            icon: <span>◀️</span>,
            action: () => onToolAction?.('wizard-back'),
            tooltip: 'Previous step',
          },
          {
            id: 'wizard-next',
            label: 'Next',
            icon: <span>▶️</span>,
            action: () => onToolAction?.('wizard-next'),
            tooltip: 'Next step',
            variant: 'primary'
          },
          {
            id: 'wizard-cancel',
            label: 'Cancel',
            icon: <span>✖️</span>,
            action: () => onToolAction?.('wizard-cancel'),
            tooltip: 'Cancel wizard',
            variant: 'danger'
          }
        ];

      default:
        return [];
    }
  }, [context, onToolAction, hideDefaultTools]);

  /**
   * Combine default and additional tools
   */
  const allTools = useMemo(() => {
    return [...contextualTools, ...additionalTools];
  }, [contextualTools, additionalTools]);

  /**
   * Handle tool click
   */
  const handleToolClick = useCallback((tool: ContextualTool) => {
    if (!tool.disabled) {
      tool.action();
    }
  }, []);

  if (allTools.length === 0) {
    return null;
  }

  return (
    <div className="contextual-toolbar">
      <div className="toolbar-container">
        {allTools.map((tool) => (
          <button
            key={tool.id}
            className={`toolbar-button toolbar-button--${tool.variant || 'secondary'} ${
              tool.disabled ? 'toolbar-button--disabled' : ''
            }`}
            onClick={() => handleToolClick(tool)}
            disabled={tool.disabled}
            title={tool.tooltip}
            data-shortcut={tool.shortcut}
          >
            <span className="toolbar-button__icon">{tool.icon}</span>
            <span className="toolbar-button__label">{tool.label}</span>
            {tool.shortcut && (
              <span className="toolbar-button__shortcut">{tool.shortcut}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Hook for managing toolbar keyboard shortcuts
 */
export const useToolbarShortcuts = (
  context: EditorContext,
  onToolAction: (toolId: string) => void
) => {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Scene editing shortcuts
      if (context === 'scene-editing') {
        if (e.altKey && e.key === 'd') {
          e.preventDefault();
          onToolAction('add-dialogue');
        } else if (e.altKey && e.key === 'c') {
          e.preventDefault();
          onToolAction('add-choice');
        } else if (e.altKey && e.key === 'v') {
          e.preventDefault();
          onToolAction('add-variable');
        } else if (e.key === 'F5') {
          e.preventDefault();
          onToolAction('preview-scene');
        }
      }

      // Character editing shortcuts
      if (context === 'character-editing') {
        if (e.ctrlKey && e.key === 'd') {
          e.preventDefault();
          onToolAction('duplicate-character');
        }
      }

      // Variable management shortcuts
      if (context === 'variable-management') {
        if (e.altKey && e.key === 'n') {
          e.preventDefault();
          onToolAction('add-variable');
        }
      }

      // UI editing shortcuts
      if (context === 'ui-editing') {
        if (e.key === 'F5') {
          e.preventDefault();
          onToolAction('preview-ui');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [context, onToolAction]);
};

export default ContextualToolbar;
