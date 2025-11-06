/**
 * Template Library Data Store for FlourishVNE
 * 
 * Purpose: Central repository and management system for all available templates
 * Features: Template registration, categorization, search, filtering
 * 
 * User Story: US1 - Simplified Visual Novel Template Creation
 * Task: T026
 */

import { Template, TemplateCategory, TemplateConfig } from '../../types/template';
import { VNID } from '../../types';

/**
 * Template library entry with extended metadata
 */
export interface TemplateLibraryEntry {
  template: Template;
  metadata: {
    downloads: number;
    rating: number;
    dateAdded: Date;
    lastUpdated: Date;
    isCustom: boolean;
    isFavorite: boolean;
  };
}

/**
 * Template search filters
 */
export interface TemplateSearchFilters {
  categories?: TemplateCategory[];
  complexity?: ('beginner' | 'intermediate' | 'advanced')[];
  tags?: string[];
  searchQuery?: string;
  showFavoritesOnly?: boolean;
  showCustomOnly?: boolean;
  minRating?: number;
  maxSetupTime?: number;
}

/**
 * Template sort options
 */
export type TemplateSortBy = 
  | 'name-asc' 
  | 'name-desc' 
  | 'date-added-asc' 
  | 'date-added-desc' 
  | 'popularity' 
  | 'rating' 
  | 'complexity';

/**
 * Template Library class - singleton pattern
 */
export class TemplateLibrary {
  private static instance: TemplateLibrary;
  private templates: Map<VNID, TemplateLibraryEntry> = new Map();
  private categoryIndex: Map<TemplateCategory, Set<VNID>> = new Map();
  private tagIndex: Map<string, Set<VNID>> = new Map();
  private favorites: Set<VNID> = new Set();
  private recentlyUsed: VNID[] = [];
  private maxRecentlyUsed = 10;

  /**
   * Private constructor for singleton
   */
  private constructor() {
    this.initializeIndexes();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): TemplateLibrary {
    if (!TemplateLibrary.instance) {
      TemplateLibrary.instance = new TemplateLibrary();
    }
    return TemplateLibrary.instance;
  }

  /**
   * Initialize category and tag indexes
   */
  private initializeIndexes(): void {
    const categories: TemplateCategory[] = [
      'character-creation', 'outfit-picker', 'shop-system', 'stat-tracker',
      'dating-sim', 'mini-game', 'dialogue-system', 'inventory',
      'combat', 'exploration', 'custom'
    ];
    
    categories.forEach(category => {
      this.categoryIndex.set(category, new Set());
    });
  }

  /**
   * Register a new template
   */
  public registerTemplate(
    template: Template,
    metadata?: Partial<{ downloads: number; rating: number }>,
    isCustom: boolean = false
  ): void {
    const entry: TemplateLibraryEntry = {
      template,
      metadata: {
        downloads: metadata?.downloads ?? template.usageCount ?? 0,
        rating: metadata?.rating ?? template.rating ?? 0,
        dateAdded: new Date(),
        lastUpdated: new Date(),
        isCustom,
        isFavorite: false
      }
    };

    this.templates.set(template.id, entry);
    this.updateIndexes(template.id, entry);
  }

  /**
   * Update template indexes
   */
  private updateIndexes(templateId: VNID, entry: TemplateLibraryEntry): void {
    // Category index
    const categorySet = this.categoryIndex.get(entry.template.category);
    if (categorySet) {
      categorySet.add(templateId);
    }

    // Tag index
    entry.template.tags.forEach(tag => {
      const tagNormalized = tag.toLowerCase();
      if (!this.tagIndex.has(tagNormalized)) {
        this.tagIndex.set(tagNormalized, new Set());
      }
      this.tagIndex.get(tagNormalized)!.add(templateId);
    });
  }

  /**
   * Unregister a template
   */
  public unregisterTemplate(templateId: VNID): boolean {
    const entry = this.templates.get(templateId);
    if (!entry) return false;

    // Remove from category index
    const categorySet = this.categoryIndex.get(entry.template.category);
    if (categorySet) {
      categorySet.delete(templateId);
    }

    // Remove from tag index
    entry.template.tags.forEach(tag => {
      const tagSet = this.tagIndex.get(tag.toLowerCase());
      if (tagSet) {
        tagSet.delete(templateId);
      }
    });

    // Remove from favorites and recently used
    this.favorites.delete(templateId);
    this.recentlyUsed = this.recentlyUsed.filter(id => id !== templateId);

    // Remove from main storage
    return this.templates.delete(templateId);
  }

  /**
   * Get template by ID
   */
  public getTemplate(templateId: VNID): Template | null {
    return this.templates.get(templateId)?.template ?? null;
  }

  /**
   * Get template entry with metadata
   */
  public getTemplateEntry(templateId: VNID): TemplateLibraryEntry | null {
    return this.templates.get(templateId) ?? null;
  }

  /**
   * Get all templates
   */
  public getAllTemplates(): Template[] {
    return Array.from(this.templates.values()).map(entry => entry.template);
  }

  /**
   * Get all template entries
   */
  public getAllEntries(): TemplateLibraryEntry[] {
    return Array.from(this.templates.values());
  }

  /**
   * Search templates with filters
   */
  public searchTemplates(
    filters: TemplateSearchFilters = {},
    sortBy: TemplateSortBy = 'name-asc'
  ): TemplateLibraryEntry[] {
    let results = this.getAllEntries();

    // Apply category filter
    if (filters.categories && filters.categories.length > 0) {
      results = results.filter(entry =>
        filters.categories!.includes(entry.template.category)
      );
    }

    // Apply complexity filter
    if (filters.complexity && filters.complexity.length > 0) {
      results = results.filter(entry =>
        filters.complexity!.includes(entry.template.preview.complexity)
      );
    }

    // Apply tag filter
    if (filters.tags && filters.tags.length > 0) {
      results = results.filter(entry => {
        const entryTags = entry.template.tags.map(t => t.toLowerCase());
        return filters.tags!.some(tag => entryTags.includes(tag.toLowerCase()));
      });
    }

    // Apply search query
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      results = results.filter(entry => {
        const searchableText = [
          entry.template.name,
          entry.template.description,
          ...entry.template.tags,
          entry.template.author || ''
        ].join(' ').toLowerCase();
        
        return searchableText.includes(query);
      });
    }

    // Apply favorites filter
    if (filters.showFavoritesOnly) {
      results = results.filter(entry => entry.metadata.isFavorite);
    }

    // Apply custom filter
    if (filters.showCustomOnly) {
      results = results.filter(entry => entry.metadata.isCustom);
    }

    // Apply rating filter
    if (filters.minRating !== undefined) {
      results = results.filter(entry => entry.metadata.rating >= filters.minRating!);
    }

    // Apply setup time filter
    if (filters.maxSetupTime !== undefined) {
      results = results.filter(entry =>
        entry.template.preview.estimatedTime <= filters.maxSetupTime!
      );
    }

    // Sort results
    return this.sortTemplates(results, sortBy);
  }

  /**
   * Sort templates
   */
  private sortTemplates(
    entries: TemplateLibraryEntry[],
    sortBy: TemplateSortBy
  ): TemplateLibraryEntry[] {
    const sorted = [...entries];

    switch (sortBy) {
      case 'name-asc':
        sorted.sort((a, b) => a.template.name.localeCompare(b.template.name));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.template.name.localeCompare(a.template.name));
        break;
      case 'date-added-asc':
        sorted.sort((a, b) => a.metadata.dateAdded.getTime() - b.metadata.dateAdded.getTime());
        break;
      case 'date-added-desc':
        sorted.sort((a, b) => b.metadata.dateAdded.getTime() - a.metadata.dateAdded.getTime());
        break;
      case 'popularity':
        sorted.sort((a, b) => b.metadata.downloads - a.metadata.downloads);
        break;
      case 'rating':
        sorted.sort((a, b) => b.metadata.rating - a.metadata.rating);
        break;
      case 'complexity':
        const complexityOrder = { beginner: 0, intermediate: 1, advanced: 2 };
        sorted.sort((a, b) =>
          complexityOrder[a.template.preview.complexity] - 
          complexityOrder[b.template.preview.complexity]
        );
        break;
    }

    return sorted;
  }

  /**
   * Get templates by category
   */
  public getTemplatesByCategory(category: TemplateCategory): Template[] {
    const templateIds = this.categoryIndex.get(category);
    if (!templateIds) return [];

    return Array.from(templateIds)
      .map(id => this.templates.get(id)?.template)
      .filter((t): t is Template => t !== undefined);
  }

  /**
   * Get templates by tag
   */
  public getTemplatesByTag(tag: string): Template[] {
    const templateIds = this.tagIndex.get(tag.toLowerCase());
    if (!templateIds) return [];

    return Array.from(templateIds)
      .map(id => this.templates.get(id)?.template)
      .filter((t): t is Template => t !== undefined);
  }

  /**
   * Toggle favorite status
   */
  public toggleFavorite(templateId: VNID): boolean {
    const entry = this.templates.get(templateId);
    if (!entry) return false;

    entry.metadata.isFavorite = !entry.metadata.isFavorite;
    
    if (entry.metadata.isFavorite) {
      this.favorites.add(templateId);
    } else {
      this.favorites.delete(templateId);
    }

    return entry.metadata.isFavorite;
  }

  /**
   * Get favorite templates
   */
  public getFavoriteTemplates(): Template[] {
    return Array.from(this.favorites)
      .map(id => this.templates.get(id)?.template)
      .filter((t): t is Template => t !== undefined);
  }

  /**
   * Track template usage
   */
  public trackUsage(templateId: VNID): void {
    const entry = this.templates.get(templateId);
    if (!entry) return;

    // Update downloads counter
    entry.metadata.downloads++;

    // Update recently used
    this.recentlyUsed = [
      templateId,
      ...this.recentlyUsed.filter(id => id !== templateId)
    ].slice(0, this.maxRecentlyUsed);

    // Update last updated timestamp
    entry.metadata.lastUpdated = new Date();
  }

  /**
   * Get recently used templates
   */
  public getRecentlyUsedTemplates(): Template[] {
    return this.recentlyUsed
      .map(id => this.templates.get(id)?.template)
      .filter((t): t is Template => t !== undefined);
  }

  /**
   * Update template rating
   */
  public updateRating(templateId: VNID, rating: number): boolean {
    const entry = this.templates.get(templateId);
    if (!entry || rating < 0 || rating > 5) return false;

    entry.metadata.rating = rating;
    entry.metadata.lastUpdated = new Date();
    return true;
  }

  /**
   * Get all categories with template counts
   */
  public getCategoryCounts(): Map<TemplateCategory, number> {
    const counts = new Map<TemplateCategory, number>();
    
    this.categoryIndex.forEach((templateIds, category) => {
      counts.set(category, templateIds.size);
    });
    
    return counts;
  }

  /**
   * Get all tags with template counts
   */
  public getTagCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    
    this.tagIndex.forEach((templateIds, tag) => {
      counts.set(tag, templateIds.size);
    });
    
    return counts;
  }

  /**
   * Clear all templates (for testing/reset)
   */
  public clear(): void {
    this.templates.clear();
    this.categoryIndex.forEach(set => set.clear());
    this.tagIndex.clear();
    this.favorites.clear();
    this.recentlyUsed = [];
  }

  /**
   * Export library to JSON
   */
  public exportToJSON(): string {
    const data = {
      templates: Array.from(this.templates.entries()).map(([id, entry]) => ({
        id,
        template: entry.template,
        metadata: {
          ...entry.metadata,
          dateAdded: entry.metadata.dateAdded.toISOString(),
          lastUpdated: entry.metadata.lastUpdated.toISOString()
        }
      })),
      favorites: Array.from(this.favorites),
      recentlyUsed: this.recentlyUsed
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Import library from JSON
   */
  public importFromJSON(json: string): boolean {
    try {
      const data = JSON.parse(json);

      // Clear existing data
      this.clear();

      // Import templates
      data.templates.forEach((item: any) => {
        const entry: TemplateLibraryEntry = {
          template: item.template,
          metadata: {
            ...item.metadata,
            dateAdded: new Date(item.metadata.dateAdded),
            lastUpdated: new Date(item.metadata.lastUpdated)
          }
        };

        this.templates.set(item.id, entry);
        this.updateIndexes(item.id, entry);
      });

      // Import favorites
      if (data.favorites) {
        this.favorites = new Set(data.favorites);
      }

      // Import recently used
      if (data.recentlyUsed) {
        this.recentlyUsed = data.recentlyUsed;
      }

      return true;
    } catch (error) {
      console.error('Failed to import template library:', error);
      return false;
    }
  }

  /**
   * Get library statistics
   */
  public getStatistics() {
    return {
      totalTemplates: this.templates.size,
      customTemplates: Array.from(this.templates.values()).filter(e => e.metadata.isCustom).length,
      favoriteCount: this.favorites.size,
      categoryCounts: Object.fromEntries(this.getCategoryCounts()),
      averageRating: this.calculateAverageRating(),
      mostPopular: this.getMostPopularTemplate(),
      recentlyUsedCount: this.recentlyUsed.length
    };
  }

  /**
   * Calculate average rating across all templates
   */
  private calculateAverageRating(): number {
    const entries = Array.from(this.templates.values());
    if (entries.length === 0) return 0;

    const sum = entries.reduce((acc, entry) => acc + entry.metadata.rating, 0);
    return sum / entries.length;
  }

  /**
   * Get most popular template
   */
  private getMostPopularTemplate(): Template | null {
    const entries = Array.from(this.templates.values());
    if (entries.length === 0) return null;

    const mostPopular = entries.reduce((max, entry) =>
      entry.metadata.downloads > max.metadata.downloads ? entry : max
    );

    return mostPopular.template;
  }
}

/**
 * Singleton instance export
 */
export const templateLibrary = TemplateLibrary.getInstance();

/**
 * Helper functions for template library operations
 */
export const TemplateLibraryHelpers = {
  /**
   * Quick search helper
   */
  quickSearch(query: string): Template[] {
    return templateLibrary.searchTemplates(
      { searchQuery: query },
      'popularity'
    ).map(entry => entry.template);
  },

  /**
   * Get recommended templates based on usage patterns
   */
  getRecommendations(limit: number = 5): Template[] {
    const recent = templateLibrary.getRecentlyUsedTemplates();
    const popular = templateLibrary.searchTemplates(
      {},
      'popularity'
    ).map(entry => entry.template);

    // Combine recent and popular, remove duplicates
    const combined = [...recent, ...popular];
    const unique = Array.from(new Map(combined.map(t => [t.id, t])).values());

    return unique.slice(0, limit);
  },

  /**
   * Get beginner-friendly templates
   */
  getBeginnerTemplates(): Template[] {
    return templateLibrary.searchTemplates(
      { complexity: ['beginner'] },
      'rating'
    ).map(entry => entry.template);
  },

  /**
   * Batch register templates
   */
  batchRegister(templates: Template[]): void {
    templates.forEach(template => {
      templateLibrary.registerTemplate(template);
    });
  }
};

export default templateLibrary;
