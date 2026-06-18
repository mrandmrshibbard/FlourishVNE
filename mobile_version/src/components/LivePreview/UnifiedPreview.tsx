/**
 * Unified Preview Access Component for FlourishVNE
 * 
 * Purpose: Centralized preview system accessible from any editor context
 * Features: Quick preview, full preview, context-aware preview modes
 * 
 * User Story: US2 - Streamlined Interface Navigation
 * Task: T031
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useProject } from '../../contexts/ProjectContext';
import LivePreview from '../LivePreview';
import { VNID } from '../../types';
import { VNScene } from '../../features/scene/types';

/**
 * Preview mode types
 */
export type PreviewMode = 
  | 'scene' 
  | 'ui-screen' 
  | 'character' 
  | 'full-project'
  | 'template';

/**
 * Preview context for what to display
 */
export interface PreviewContext {
  mode: PreviewMode;
  targetId?: VNID;
  startFromCommand?: number;
  autoPlay?: boolean;
}

/**
 * Unified Preview props
 */
export interface UnifiedPreviewProps {
  initialContext?: PreviewContext;
  onClose: () => void;
  showQuickControls?: boolean;
}

/**
 * Unified Preview Component
 */
export const UnifiedPreview: React.FC<UnifiedPreviewProps> = ({
  initialContext,
  onClose,
  showQuickControls = true
}) => {
  const { project } = useProject();
  const [context, setContext] = useState<PreviewContext>(
    initialContext || {
      mode: 'full-project',
      autoPlay: false
    }
  );
  const [isPaused, setIsPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  /**
   * Get preview title based on context
   */
  const previewTitle = useMemo(() => {
    switch (context.mode) {
      case 'scene':
        if (context.targetId && project.scenes?.[context.targetId]) {
          return `Preview: ${project.scenes[context.targetId].name}`;
        }
        return 'Scene Preview';
      
      case 'ui-screen':
        if (context.targetId && project.uiScreens?.[context.targetId]) {
          return `Preview: ${project.uiScreens[context.targetId].name}`;
        }
        return 'UI Screen Preview';
      
      case 'character':
        if (context.targetId && project.characters?.[context.targetId]) {
          return `Preview: ${project.characters[context.targetId].name}`;
        }
        return 'Character Preview';
      
      case 'template':
        return 'Template Preview';
      
      case 'full-project':
      default:
        return `Preview: ${project.title}`;
    }
  }, [context, project]);

  /**
   * Handle preview mode change
   */
  const handleModeChange = useCallback((newMode: PreviewMode, targetId?: VNID) => {
    setContext({
      mode: newMode,
      targetId,
      autoPlay: context.autoPlay
    });
  }, [context.autoPlay]);

  /**
   * Toggle play/pause
   */
  const togglePlayPause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  /**
   * Restart preview
   */
  const handleRestart = useCallback(() => {
    setContext(prev => ({
      ...prev,
      startFromCommand: undefined
    }));
    setIsPaused(false);
  }, []);

  /**
   * Quick navigation to specific scene
   */
  const navigateToScene = useCallback((sceneId: VNID) => {
    handleModeChange('scene', sceneId);
  }, [handleModeChange]);

  /**
   * Get available scenes for quick navigation
   */
  const availableScenes = useMemo(() => {
    if (!project.scenes) return [];
    return Object.entries(project.scenes).map(([id, scene]) => ({
      id: id as VNID,
      name: (scene as VNScene).name
    }));
  }, [project.scenes]);

  return (
    <div className="unified-preview">
      {/* Preview Header */}
      <div className="unified-preview__header">
        <div className="preview-header__title">
          <h2>{previewTitle}</h2>
          <span className="preview-mode-badge">{context.mode}</span>
        </div>

        {showQuickControls && (
          <div className="preview-header__controls">
            {/* Play/Pause */}
            <button
              className="preview-control-btn"
              onClick={togglePlayPause}
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? '▶️' : '⏸️'}
            </button>

            {/* Restart */}
            <button
              className="preview-control-btn"
              onClick={handleRestart}
              title="Restart"
            >
              🔄
            </button>

            {/* Settings */}
            <button
              className="preview-control-btn"
              onClick={() => setShowSettings(!showSettings)}
              title="Preview Settings"
            >
              ⚙️
            </button>

            {/* Mode Selector */}
            <div className="preview-mode-selector">
              <select
                value={context.mode}
                onChange={(e) => handleModeChange(e.target.value as PreviewMode)}
                className="mode-select"
              >
                <option value="full-project">Full Project</option>
                <option value="scene">Current Scene</option>
                <option value="ui-screen">UI Screen</option>
                <option value="character">Character</option>
              </select>
            </div>

            {/* Close */}
            <button
              className="preview-control-btn preview-control-btn--close"
              onClick={onClose}
              title="Close Preview (Esc)"
            >
              ✖️
            </button>
          </div>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="unified-preview__settings">
          <div className="settings-panel">
            <h3>Preview Settings</h3>
            
            <div className="setting-group">
              <label>
                <input
                  type="checkbox"
                  checked={context.autoPlay}
                  onChange={(e) => setContext(prev => ({
                    ...prev,
                    autoPlay: e.target.checked
                  }))}
                />
                Auto-play on start
              </label>
            </div>

            {context.mode === 'scene' && availableScenes.length > 0 && (
              <div className="setting-group">
                <label>Jump to Scene:</label>
                <select
                  value={context.targetId || ''}
                  onChange={(e) => navigateToScene(e.target.value as VNID)}
                  className="scene-select"
                >
                  <option value="">Select scene...</option>
                  {availableScenes.map(scene => (
                    <option key={scene.id} value={scene.id}>
                      {scene.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {context.mode === 'scene' && context.targetId && (
              <div className="setting-group">
                <label>
                  Start from command:
                  <input
                    type="number"
                    min={0}
                    value={context.startFromCommand || 0}
                    onChange={(e) => setContext(prev => ({
                      ...prev,
                      startFromCommand: parseInt(e.target.value, 10)
                    }))}
                    className="command-input"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview Content */}
      <div className="unified-preview__content">
        <LivePreview
          onClose={onClose}
          startSceneId={
            context.mode === 'scene' && context.targetId
              ? context.targetId
              : project.startSceneId
          }
        />
      </div>

      {/* Quick Navigation Bar */}
      {showQuickControls && context.mode === 'scene' && availableScenes.length > 0 && (
        <div className="unified-preview__quick-nav">
          <div className="quick-nav-label">Quick Jump:</div>
          <div className="quick-nav-buttons">
            {availableScenes.slice(0, 5).map(scene => (
              <button
                key={scene.id}
                className={`quick-nav-btn ${
                  context.targetId === scene.id ? 'quick-nav-btn--active' : ''
                }`}
                onClick={() => navigateToScene(scene.id)}
              >
                {scene.name}
              </button>
            ))}
            {availableScenes.length > 5 && (
              <button
                className="quick-nav-btn quick-nav-btn--more"
                onClick={() => setShowSettings(true)}
              >
                +{availableScenes.length - 5} more
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Hook for unified preview access from anywhere
 */
export const useUnifiedPreview = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [previewContext, setPreviewContext] = useState<PreviewContext | undefined>();

  const openPreview = useCallback((context?: PreviewContext) => {
    setPreviewContext(context);
    setIsOpen(true);
  }, []);

  const closePreview = useCallback(() => {
    setIsOpen(false);
    setPreviewContext(undefined);
  }, []);

  const previewScene = useCallback((sceneId: VNID) => {
    openPreview({
      mode: 'scene',
      targetId: sceneId,
      autoPlay: true
    });
  }, [openPreview]);

  const previewUIScreen = useCallback((screenId: VNID) => {
    openPreview({
      mode: 'ui-screen',
      targetId: screenId,
      autoPlay: false
    });
  }, [openPreview]);

  const previewFullProject = useCallback(() => {
    openPreview({
      mode: 'full-project',
      autoPlay: true
    });
  }, [openPreview]);

  return {
    isOpen,
    previewContext,
    openPreview,
    closePreview,
    previewScene,
    previewUIScreen,
    previewFullProject
  };
};

/**
 * Preview keyboard shortcuts
 */
export const usePreviewShortcuts = (
  openPreview: (context?: PreviewContext) => void,
  closePreview: () => void,
  isOpen: boolean
) => {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F5 - Quick preview
      if (e.key === 'F5') {
        e.preventDefault();
        if (!isOpen) {
          openPreview();
        }
      }

      // Escape - Close preview
      if (e.key === 'Escape' && isOpen) {
        closePreview();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openPreview, closePreview, isOpen]);
};

export default UnifiedPreview;
