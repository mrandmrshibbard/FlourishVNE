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
import { useTranslation } from 'react-i18next';
import { useProject } from '../../contexts/ProjectContext';
import { VNID } from '../../types';
import {
  ChatBubbleIcon, BranchIcon, VariablesIcon, PlayIcon, FaceSmileIcon,
  ShirtIcon, DuplicateIcon, CursorClickIcon, DocumentTextIcon, PhotoIcon,
  SearchIcon, ArrowsUpDownIcon, StarIcon, QuestionMarkIcon, BoltIcon,
  CheckIcon, PlusIcon, BugIcon, ArrowDownTrayIcon, UploadIcon, FolderIcon,
  ArrowLeftIcon, ArrowRightIcon, XMarkIcon
} from '../icons';

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
  const { t } = useTranslation('contextPanels');

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
            label: t('toolbar.sceneEditing.addDialogue'),
            icon: <ChatBubbleIcon className="w-4 h-4" />,
            action: () => onToolAction?.('add-dialogue'),
            tooltip: t('toolbar.sceneEditing.addDialogueTip'),
            shortcut: 'Alt+D'
          },
          {
            id: 'add-choice',
            label: t('toolbar.sceneEditing.addChoice'),
            icon: <BranchIcon className="w-4 h-4" />,
            action: () => onToolAction?.('add-choice'),
            tooltip: t('toolbar.sceneEditing.addChoiceTip'),
            shortcut: 'Alt+C'
          },
          {
            id: 'add-variable',
            label: t('toolbar.sceneEditing.setVariable'),
            icon: <VariablesIcon className="w-4 h-4" />,
            action: () => onToolAction?.('add-variable'),
            tooltip: t('toolbar.sceneEditing.setVariableTip'),
            shortcut: 'Alt+V'
          },
          {
            id: 'preview-scene',
            label: t('toolbar.sceneEditing.preview'),
            icon: <PlayIcon className="w-4 h-4" />,
            action: () => onToolAction?.('preview-scene'),
            tooltip: t('toolbar.sceneEditing.previewTip'),
            shortcut: 'F5',
            variant: 'primary'
          }
        ];

      case 'character-editing':
        return [
          {
            id: 'add-expression',
            label: t('toolbar.characterEditing.addExpression'),
            icon: <FaceSmileIcon className="w-4 h-4" />,
            action: () => onToolAction?.('add-expression'),
            tooltip: t('toolbar.characterEditing.addExpressionTip'),
          },
          {
            id: 'add-outfit',
            label: t('toolbar.characterEditing.addOutfit'),
            icon: <ShirtIcon className="w-4 h-4" />,
            action: () => onToolAction?.('add-outfit'),
            tooltip: t('toolbar.characterEditing.addOutfitTip'),
          },
          {
            id: 'duplicate-character',
            label: t('toolbar.characterEditing.duplicate'),
            icon: <DuplicateIcon className="w-4 h-4" />,
            action: () => onToolAction?.('duplicate-character'),
            tooltip: t('toolbar.characterEditing.duplicateTip'),
            shortcut: 'Ctrl+D'
          }
        ];

      case 'ui-editing':
        return [
          {
            id: 'add-button',
            label: t('toolbar.uiEditing.addButton'),
            icon: <CursorClickIcon className="w-4 h-4" />,
            action: () => onToolAction?.('add-button'),
            tooltip: t('toolbar.uiEditing.addButtonTip'),
          },
          {
            id: 'add-text',
            label: t('toolbar.uiEditing.addText'),
            icon: <DocumentTextIcon className="w-4 h-4" />,
            action: () => onToolAction?.('add-text'),
            tooltip: t('toolbar.uiEditing.addTextTip'),
          },
          {
            id: 'add-image',
            label: t('toolbar.uiEditing.addImage'),
            icon: <PhotoIcon className="w-4 h-4" />,
            action: () => onToolAction?.('add-image'),
            tooltip: t('toolbar.uiEditing.addImageTip'),
          },
          {
            id: 'preview-ui',
            label: t('toolbar.uiEditing.preview'),
            icon: <PlayIcon className="w-4 h-4" />,
            action: () => onToolAction?.('preview-ui'),
            tooltip: t('toolbar.uiEditing.previewTip'),
            shortcut: 'F5',
            variant: 'primary'
          }
        ];

      case 'template-browsing':
        return [
          {
            id: 'filter-templates',
            label: t('toolbar.templateBrowsing.filter'),
            icon: <SearchIcon className="w-4 h-4" />,
            action: () => onToolAction?.('filter-templates'),
            tooltip: t('toolbar.templateBrowsing.filterTip'),
          },
          {
            id: 'sort-templates',
            label: t('toolbar.templateBrowsing.sort'),
            icon: <ArrowsUpDownIcon className="w-4 h-4" />,
            action: () => onToolAction?.('sort-templates'),
            tooltip: t('toolbar.templateBrowsing.sortTip'),
          },
          {
            id: 'favorites-only',
            label: t('toolbar.templateBrowsing.favorites'),
            icon: <StarIcon className="w-4 h-4" />,
            action: () => onToolAction?.('favorites-only'),
            tooltip: t('toolbar.templateBrowsing.favoritesTip'),
          }
        ];

      case 'logic-building':
        return [
          {
            id: 'add-condition',
            label: t('toolbar.logicBuilding.addCondition'),
            icon: <QuestionMarkIcon className="w-4 h-4" />,
            action: () => onToolAction?.('add-condition'),
            tooltip: t('toolbar.logicBuilding.addConditionTip'),
          },
          {
            id: 'add-action',
            label: t('toolbar.logicBuilding.addAction'),
            icon: <BoltIcon className="w-4 h-4" />,
            action: () => onToolAction?.('add-action'),
            tooltip: t('toolbar.logicBuilding.addActionTip'),
          },
          {
            id: 'validate-logic',
            label: t('toolbar.logicBuilding.validate'),
            icon: <CheckIcon className="w-4 h-4" />,
            action: () => onToolAction?.('validate-logic'),
            tooltip: t('toolbar.logicBuilding.validateTip'),
            variant: 'primary'
          }
        ];

      case 'variable-management':
        return [
          {
            id: 'add-variable',
            label: t('toolbar.variableManagement.addVariable'),
            icon: <PlusIcon className="w-4 h-4" />,
            action: () => onToolAction?.('add-variable'),
            tooltip: t('toolbar.variableManagement.addVariableTip'),
            shortcut: 'Alt+N',
            variant: 'primary'
          },
          {
            id: 'debug-variables',
            label: t('toolbar.variableManagement.debug'),
            icon: <BugIcon className="w-4 h-4" />,
            action: () => onToolAction?.('debug-variables'),
            tooltip: t('toolbar.variableManagement.debugTip'),
          },
          {
            id: 'export-variables',
            label: t('toolbar.variableManagement.export'),
            icon: <ArrowDownTrayIcon className="w-4 h-4" />,
            action: () => onToolAction?.('export-variables'),
            tooltip: t('toolbar.variableManagement.exportTip'),
          }
        ];

      case 'asset-management':
        return [
          {
            id: 'import-assets',
            label: t('toolbar.assetManagement.import'),
            icon: <UploadIcon className="w-4 h-4" />,
            action: () => onToolAction?.('import-assets'),
            tooltip: t('toolbar.assetManagement.importTip'),
            variant: 'primary'
          },
          {
            id: 'organize-assets',
            label: t('toolbar.assetManagement.organize'),
            icon: <FolderIcon className="w-4 h-4" />,
            action: () => onToolAction?.('organize-assets'),
            tooltip: t('toolbar.assetManagement.organizeTip'),
          },
          {
            id: 'unused-assets',
            label: t('toolbar.assetManagement.findUnused'),
            icon: <SearchIcon className="w-4 h-4" />,
            action: () => onToolAction?.('unused-assets'),
            tooltip: t('toolbar.assetManagement.findUnusedTip'),
          }
        ];

      case 'wizard-flow':
        return [
          {
            id: 'wizard-back',
            label: t('toolbar.wizardFlow.back'),
            icon: <ArrowLeftIcon className="w-4 h-4" />,
            action: () => onToolAction?.('wizard-back'),
            tooltip: t('toolbar.wizardFlow.backTip'),
          },
          {
            id: 'wizard-next',
            label: t('toolbar.wizardFlow.next'),
            icon: <ArrowRightIcon className="w-4 h-4" />,
            action: () => onToolAction?.('wizard-next'),
            tooltip: t('toolbar.wizardFlow.nextTip'),
            variant: 'primary'
          },
          {
            id: 'wizard-cancel',
            label: t('toolbar.wizardFlow.cancel'),
            icon: <XMarkIcon className="w-4 h-4" />,
            action: () => onToolAction?.('wizard-cancel'),
            tooltip: t('toolbar.wizardFlow.cancelTip'),
            variant: 'danger'
          }
        ];

      default:
        return [];
    }
  }, [context, onToolAction, hideDefaultTools, t]);

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
