/**
 * Template Gallery Component for FlourishVNE
 * 
 * Purpose: Browse, search, and select templates from the template library
 * 
 * Features:
 * - Grid/list view of available templates
 * - Category filtering
 * - Search by name, tags, description
 * - Template preview cards
 * - Quick actions (preview, apply, customize)
 * - Responsive layout
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Template, TemplateCategory } from '../../types/template';
import { TemplateService } from '../../features/templates/TemplateService';
import { VNID } from '../../types';

// Create service instance
const templateService = new TemplateService();

/**
 * Template gallery props
 */
export interface TemplateGalleryProps {
  onSelectTemplate?: (template: Template) => void;
  onPreviewTemplate?: (template: Template) => void;
  onApplyTemplate?: (template: Template) => void;
  selectedTemplateId?: VNID;
  categories?: TemplateCategory[];
  viewMode?: 'grid' | 'list';
  showSearch?: boolean;
  showFilters?: boolean;
  maxTemplates?: number;
}

/**
 * View mode type
 */
type ViewMode = 'grid' | 'list';

/**
 * Template Gallery Component
 */
export const TemplateGallery: React.FC<TemplateGalleryProps> = ({
  onSelectTemplate,
  onPreviewTemplate,
  onApplyTemplate,
  selectedTemplateId,
  categories,
  viewMode: initialViewMode = 'grid',
  showSearch = true,
  showFilters = true,
  maxTemplates
}) => {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load templates on mount
  React.useEffect(() => {
    loadTemplates();
  }, []);

  /**
   * Load templates from service
   */
  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await templateService.getAvailableTemplates({
        query: '',
        categories: categories || undefined,
        limit: maxTemplates || 100
      });
      setTemplates(result.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Filter templates based on search and category
   */
  const filteredTemplates = useMemo(() => {
    let filtered = templates;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(t => t.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [templates, selectedCategory, searchQuery]);

  /**
   * Get unique categories from templates
   */
  const availableCategories = useMemo(() => {
    const cats = new Set<TemplateCategory>();
    templates.forEach(t => cats.add(t.category));
    return Array.from(cats).sort();
  }, [templates]);

  /**
   * Handle template selection
   */
  const handleSelectTemplate = useCallback((template: Template) => {
    onSelectTemplate?.(template);
  }, [onSelectTemplate]);

  /**
   * Handle template preview
   */
  const handlePreviewTemplate = useCallback((template: Template, e: React.MouseEvent) => {
    e.stopPropagation();
    onPreviewTemplate?.(template);
  }, [onPreviewTemplate]);

  /**
   * Handle template application
   */
  const handleApplyTemplate = useCallback((template: Template, e: React.MouseEvent) => {
    e.stopPropagation();
    onApplyTemplate?.(template);
  }, [onApplyTemplate]);

  // Loading state
  if (loading) {
    return (
      <div className="template-gallery template-gallery--loading">
        <div className="template-gallery__spinner">
          <div className="spinner" />
          <p>Loading templates...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="template-gallery template-gallery--error">
        <div className="template-gallery__error">
          <p className="error-message">{error}</p>
          <button onClick={loadTemplates} className="btn btn--primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (templates.length === 0) {
    return (
      <div className="template-gallery template-gallery--empty">
        <div className="template-gallery__empty">
          <p>No templates available</p>
          <button onClick={loadTemplates} className="btn btn--secondary">
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="template-gallery">
      {/* Header */}
      <div className="template-gallery__header">
        <h2 className="template-gallery__title">Template Gallery</h2>
        
        {/* View mode toggle */}
        <div className="template-gallery__view-toggle">
          <button
            className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            <GridIcon />
          </button>
          <button
            className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            <ListIcon />
          </button>
        </div>
      </div>

      {/* Search and filters */}
      {(showSearch || showFilters) && (
        <div className="template-gallery__controls">
          {/* Search */}
          {showSearch && (
            <div className="template-gallery__search">
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="search-input"
              />
              {searchQuery && (
                <button
                  className="search-clear"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          )}

          {/* Category filter */}
          {showFilters && (
            <div className="template-gallery__filters">
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value as TemplateCategory | 'all')}
                className="category-select"
              >
                <option value="all">All Categories</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>
                    {formatCategoryName(cat)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Template grid/list */}
      <div className={`template-gallery__content template-gallery__content--${viewMode}`}>
        {filteredTemplates.length > 0 ? (
          filteredTemplates.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              viewMode={viewMode}
              isSelected={template.id === selectedTemplateId}
              onSelect={handleSelectTemplate}
              onPreview={handlePreviewTemplate}
              onApply={handleApplyTemplate}
            />
          ))
        ) : (
          <div className="template-gallery__no-results">
            <p>No templates match your search criteria</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="btn btn--secondary"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Template card component
 */
interface TemplateCardProps {
  template: Template;
  viewMode: ViewMode;
  isSelected: boolean;
  onSelect: (template: Template) => void;
  onPreview: (template: Template, e: React.MouseEvent) => void;
  onApply: (template: Template, e: React.MouseEvent) => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  viewMode,
  isSelected,
  onSelect,
  onPreview,
  onApply
}) => {
  return (
    <div
      className={`template-card template-card--${viewMode} ${isSelected ? 'template-card--selected' : ''}`}
      onClick={() => onSelect(template)}
    >
      {/* Preview image */}
      {template.previewImage && (
        <div className="template-card__image">
          <img src={template.previewImage} alt={template.name} />
        </div>
      )}

      {/* Content */}
      <div className="template-card__content">
        <div className="template-card__header">
          <h3 className="template-card__title">{template.name}</h3>
          <span className="template-card__category">
            {formatCategoryName(template.category)}
          </span>
        </div>

        <p className="template-card__description">{template.description}</p>

        {/* Tags */}
        {template.tags.length > 0 && (
          <div className="template-card__tags">
            {template.tags.slice(0, 3).map(tag => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
            {template.tags.length > 3 && (
              <span className="tag tag--more">+{template.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="template-card__meta">
          <span className="meta-item">
            v{template.version}
          </span>
          {template.usageCount !== undefined && (
            <span className="meta-item">
              {template.usageCount} uses
            </span>
          )}
          {template.rating !== undefined && (
            <span className="meta-item">
              ⭐ {template.rating.toFixed(1)}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="template-card__actions">
          <button
            className="btn btn--secondary btn--sm"
            onClick={e => onPreview(template, e)}
          >
            Preview
          </button>
          <button
            className="btn btn--primary btn--sm"
            onClick={e => onApply(template, e)}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Format category name for display
 */
function formatCategoryName(category: TemplateCategory): string {
  return category
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Grid icon component
 */
const GridIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
    <rect x="2" y="2" width="7" height="7" />
    <rect x="11" y="2" width="7" height="7" />
    <rect x="2" y="11" width="7" height="7" />
    <rect x="11" y="11" width="7" height="7" />
  </svg>
);

/**
 * List icon component
 */
const ListIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
    <rect x="2" y="3" width="16" height="2" />
    <rect x="2" y="9" width="16" height="2" />
    <rect x="2" y="15" width="16" height="2" />
  </svg>
);

export default TemplateGallery;
