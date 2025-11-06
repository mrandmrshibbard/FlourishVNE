/**
 * Template Preview Generator Component for FlourishVNE
 * 
 * Purpose: Real-time preview of template configurations before generation
 * Features: Live rendering, multiple view modes, interactive preview
 * 
 * User Story: US1 - Simplified Visual Novel Template Creation
 * Task: T024
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Template, TemplateConfig as TConfig, TemplateGenerationResult } from '../../types/template';
import { VNUIScreen } from '../../features/ui/types';
import { VNID } from '../../types';

/**
 * Template preview props
 */
export interface TemplatePreviewProps {
  template: Template;
  config: TConfig;
  mode?: 'static' | 'interactive' | 'fullscreen';
  showCode?: boolean;
  showMetadata?: boolean;
  onInteraction?: (action: string, data: any) => void;
}

/**
 * Preview view modes
 */
type ViewMode = 'desktop' | 'tablet' | 'mobile';

/**
 * Template Preview Component
 */
export const TemplatePreview: React.FC<TemplatePreviewProps> = ({
  template,
  config,
  mode = 'static',
  showCode = false,
  showMetadata = true,
  onInteraction
}) => {
  // State
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');
  const [generatedScreens, setGeneratedScreens] = useState<VNUIScreen[]>([]);
  const [activeScreenIndex, setActiveScreenIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(100);
  
  const previewRef = useRef<HTMLDivElement>(null);

  /**
   * Generate preview screens from configuration
   */
  const generatePreview = useCallback(async () => {
    setIsGenerating(true);
    setGenerationError(null);
    
    try {
      // Use template's UI generator
      const screens = await Promise.resolve(template.uiGenerator(config));
      setGeneratedScreens(screens);
      setActiveScreenIndex(0);
    } catch (error) {
      console.error('Preview generation error:', error);
      setGenerationError(error instanceof Error ? error.message : 'Failed to generate preview');
    } finally {
      setIsGenerating(false);
    }
  }, [template, config]);

  /**
   * Regenerate preview when config changes
   */
  useEffect(() => {
    const debounce = setTimeout(() => {
      generatePreview();
    }, 300); // Debounce for performance

    return () => clearTimeout(debounce);
  }, [generatePreview]);

  /**
   * Get viewport dimensions for current view mode
   */
  const viewportDimensions = useMemo(() => {
    const dimensions = {
      desktop: { width: 1920, height: 1080 },
      tablet: { width: 768, height: 1024 },
      mobile: { width: 375, height: 667 }
    };
    return dimensions[viewMode];
  }, [viewMode]);

  /**
   * Calculate scaled dimensions
   */
  const scaledDimensions = useMemo(() => {
    const scale = zoom / 100;
    return {
      width: viewportDimensions.width * scale,
      height: viewportDimensions.height * scale
    };
  }, [viewportDimensions, zoom]);

  /**
   * Handle screen navigation
   */
  const navigateToScreen = useCallback((index: number) => {
    if (index >= 0 && index < generatedScreens.length) {
      setActiveScreenIndex(index);
      onInteraction?.('screen-navigate', { index });
    }
  }, [generatedScreens.length, onInteraction]);

  /**
   * Handle element interaction in interactive mode
   */
  const handleElementInteraction = useCallback((elementId: VNID, action: string) => {
    if (mode === 'interactive') {
      onInteraction?.('element-interact', { elementId, action });
    }
  }, [mode, onInteraction]);

  /**
   * Export preview as image
   */
  const exportAsImage = useCallback(async () => {
    if (!previewRef.current) return;
    
    // Implementation would use html2canvas or similar
    onInteraction?.('export-image', { screenIndex: activeScreenIndex });
  }, [activeScreenIndex, onInteraction]);

  const activeScreen = generatedScreens[activeScreenIndex];

  return (
    <div className={`template-preview template-preview--${mode}`}>
      {/* Preview toolbar */}
      <div className="template-preview__toolbar">
        {/* View mode switcher */}
        <div className="preview-toolbar__section">
          <label className="toolbar-label">View:</label>
          <div className="view-mode-buttons">
            <button
              className={`view-mode-btn ${viewMode === 'desktop' ? 'active' : ''}`}
              onClick={() => setViewMode('desktop')}
              title="Desktop view"
            >
              🖥️
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'tablet' ? 'active' : ''}`}
              onClick={() => setViewMode('tablet')}
              title="Tablet view"
            >
              📱
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'mobile' ? 'active' : ''}`}
              onClick={() => setViewMode('mobile')}
              title="Mobile view"
            >
              📱
            </button>
          </div>
        </div>

        {/* Zoom controls */}
        <div className="preview-toolbar__section">
          <label className="toolbar-label">Zoom:</label>
          <button
            className="zoom-btn"
            onClick={() => setZoom(Math.max(25, zoom - 25))}
            disabled={zoom <= 25}
          >
            −
          </button>
          <span className="zoom-value">{zoom}%</span>
          <button
            className="zoom-btn"
            onClick={() => setZoom(Math.min(200, zoom + 25))}
            disabled={zoom >= 200}
          >
            +
          </button>
          <button
            className="zoom-btn"
            onClick={() => setZoom(100)}
          >
            Reset
          </button>
        </div>

        {/* Display options */}
        <div className="preview-toolbar__section">
          <label className="toolbar-checkbox">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
            />
            <span>Grid</span>
          </label>
        </div>

        {/* Screen navigation */}
        {generatedScreens.length > 1 && (
          <div className="preview-toolbar__section">
            <label className="toolbar-label">Screen:</label>
            <button
              className="nav-btn"
              onClick={() => navigateToScreen(activeScreenIndex - 1)}
              disabled={activeScreenIndex === 0}
            >
              ◀
            </button>
            <span className="screen-indicator">
              {activeScreenIndex + 1} / {generatedScreens.length}
            </span>
            <button
              className="nav-btn"
              onClick={() => navigateToScreen(activeScreenIndex + 1)}
              disabled={activeScreenIndex === generatedScreens.length - 1}
            >
              ▶
            </button>
          </div>
        )}

        {/* Export */}
        <div className="preview-toolbar__section">
          <button
            className="export-btn"
            onClick={exportAsImage}
            title="Export as image"
          >
            📷 Export
          </button>
        </div>
      </div>

      {/* Preview content */}
      <div className="template-preview__content">
        {isGenerating && (
          <div className="preview-loading">
            <div className="spinner" />
            <p>Generating preview...</p>
          </div>
        )}

        {generationError && (
          <div className="preview-error">
            <span className="error-icon">⚠️</span>
            <p>{generationError}</p>
            <button onClick={generatePreview}>Retry</button>
          </div>
        )}

        {!isGenerating && !generationError && activeScreen && (
          <div
            ref={previewRef}
            className={`preview-viewport ${showGrid ? 'preview-viewport--grid' : ''}`}
            style={{
              width: `${scaledDimensions.width}px`,
              height: `${scaledDimensions.height}px`
            }}
          >
            {/* Screen background */}
            <div
              className="preview-background"
              style={{
                background: activeScreen.background.type === 'color'
                  ? activeScreen.background.value
                  : undefined
              }}
            />

            {/* Screen elements */}
            <div className="preview-elements">
              {Object.entries(activeScreen.elements).map(([elementId, element]) => (
                <PreviewElement
                  key={elementId}
                  element={element}
                  interactive={mode === 'interactive'}
                  onInteract={(action) => handleElementInteraction(elementId as VNID, action)}
                />
              ))}
            </div>

            {/* Screen overlay info */}
            {showMetadata && (
              <div className="preview-overlay">
                <div className="screen-info">
                  <strong>{activeScreen.name}</strong>
                  <span className="element-count">
                    {Object.keys(activeScreen.elements).length} elements
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {!isGenerating && !generationError && generatedScreens.length === 0 && (
          <div className="preview-empty">
            <p>No preview available</p>
            <small>Configure template settings to see preview</small>
          </div>
        )}
      </div>

      {/* Code view */}
      {showCode && activeScreen && (
        <div className="template-preview__code">
          <h4>Generated Code</h4>
          <pre className="code-block">
            {JSON.stringify(activeScreen, null, 2)}
          </pre>
        </div>
      )}

      {/* Metadata panel */}
      {showMetadata && template.preview && (
        <div className="template-preview__metadata">
          <div className="metadata-section">
            <h4>Template Info</h4>
            <div className="metadata-item">
              <label>Complexity:</label>
              <span className={`complexity-badge complexity--${template.preview.complexity}`}>
                {template.preview.complexity}
              </span>
            </div>
            <div className="metadata-item">
              <label>Setup Time:</label>
              <span>{template.preview.estimatedTime} minutes</span>
            </div>
            <div className="metadata-item">
              <label>Features:</label>
              <ul className="feature-list">
                {template.preview.features.slice(0, 5).map((feature, idx) => (
                  <li key={idx}>{feature}</li>
                ))}
                {template.preview.features.length > 5 && (
                  <li className="feature-more">
                    +{template.preview.features.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Screen thumbnail strip */}
      {generatedScreens.length > 1 && (
        <div className="template-preview__thumbnails">
          {generatedScreens.map((screen, index) => (
            <button
              key={screen.id}
              className={`thumbnail ${index === activeScreenIndex ? 'thumbnail--active' : ''}`}
              onClick={() => navigateToScreen(index)}
            >
              <div className="thumbnail__preview">
                {/* Simplified preview */}
                <span className="thumbnail__label">{screen.name}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Preview element component
 */
interface PreviewElementProps {
  element: any;
  interactive: boolean;
  onInteract: (action: string) => void;
}

const PreviewElement: React.FC<PreviewElementProps> = ({
  element,
  interactive,
  onInteract
}) => {
  const handleClick = useCallback(() => {
    if (interactive) {
      onInteract('click');
    }
  }, [interactive, onInteract]);

  // Simplified element rendering for preview
  return (
    <div
      className={`preview-element ${interactive ? 'preview-element--interactive' : ''}`}
      onClick={handleClick}
      style={{
        position: 'absolute',
        // Element positioning would be calculated from element data
        cursor: interactive ? 'pointer' : 'default'
      }}
    >
      {/* Element content placeholder */}
      <div className="element-placeholder">
        Element
      </div>
    </div>
  );
};

/**
 * Preview utilities
 */
export const PreviewUtils = {
  /**
   * Calculate optimal zoom level for container
   */
  calculateOptimalZoom(containerWidth: number, containerHeight: number, viewportWidth: number, viewportHeight: number): number {
    const widthRatio = containerWidth / viewportWidth;
    const heightRatio = containerHeight / viewportHeight;
    const ratio = Math.min(widthRatio, heightRatio);
    return Math.floor(ratio * 100);
  },

  /**
   * Generate preview thumbnail
   */
  async generateThumbnail(screen: VNUIScreen, width: number = 200, height: number = 150): Promise<string> {
    // Implementation would use canvas rendering
    return 'data:image/png;base64,placeholder';
  },

  /**
   * Export preview as different formats
   */
  async exportPreview(screen: VNUIScreen, format: 'png' | 'svg' | 'json'): Promise<Blob | string> {
    if (format === 'json') {
      return JSON.stringify(screen, null, 2);
    }
    
    // PNG/SVG would use rendering libraries
    return new Blob(['placeholder'], { type: `image/${format}` });
  }
};

export default TemplatePreview;
