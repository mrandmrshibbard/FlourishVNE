import { VNID, ContextPanel, ContextPanelType, ContextInfo, ContextProvider, ContextProviderType, ContextAction, ContextSuggestion, ContextRule, ContextTrigger, ContextScope, ContextPriority } from '../../types';
import { VNProject } from '../../types/project';
import { VNScene } from '../../features/scene/types';
import { VNCharacter } from '../../features/character/types';
import { EnhancedVariable } from '../../types/enhanced-variables';
import { TemplateInstance } from '../../types/template';
import { LogicGraph } from '../../types/logic';

export interface ContextPanelServiceConfig {
  maxPanelsActive: number;
  refreshInterval: number;
  enableSmartSuggestions: boolean;
  autoHideDelay: number;
  contextDepth: number;
}

export interface EditorState {
  activeTab: string;
  selectedItems: string[];
  currentScene?: VNID;
  currentCharacter?: VNID;
  currentCommand?: VNID;
  currentVariable?: VNID;
  cursor: { line: number; column: number };
  selection: { start: { line: number; column: number }; end: { line: number; column: number } } | null;
  searchQuery?: string;
  filterState: Record<string, any>;
}

export interface ContextAnalysisResult {
  scope: ContextScope;
  relevantItems: Array<{
    id: VNID;
    type: string;
    relevance: number;
    metadata: Record<string, any>;
  }>;
  suggestions: ContextSuggestion[];
  actions: ContextAction[];
  warnings: string[];
  tips: string[];
}

/**
 * Context Panel Service - Provides dynamic context-aware panels and suggestions
 * 
 * Features:
 * - Context-aware help and suggestions
 * - Dynamic panel management
 * - Smart content recommendations
 * - Editor state analysis
 * - Interactive guidance system
 */
export class ContextPanelService {
  private panels = new Map<VNID, ContextPanel>();
  private providers = new Map<ContextProviderType, ContextProvider>();
  private activeRules = new Map<VNID, ContextRule>();
  private editorState: EditorState;
  private config: ContextPanelServiceConfig;
  private refreshTimer?: NodeJS.Timeout;

  constructor(config: Partial<ContextPanelServiceConfig> = {}) {
    this.config = {
      maxPanelsActive: 3,
      refreshInterval: 1000,
      enableSmartSuggestions: true,
      autoHideDelay: 5000,
      contextDepth: 3,
      ...config
    };

    this.editorState = {
      activeTab: '',
      selectedItems: [],
      cursor: { line: 1, column: 1 },
      selection: null,
      filterState: {}
    };

    this.initializeProviders();
    this.setupAutoRefresh();
  }

  /**
   * Initialize built-in context providers
   */
  private initializeProviders(): void {
    // Scene context provider
    this.providers.set('scene', {
      id: `provider_scene_${Date.now()}`,
      type: 'scene',
      name: 'Scene Context',
      description: 'Provides context for scene editing',
      isActive: true,
      priority: 'high',
      scope: 'scene',
      triggers: ['scene-selected', 'scene-editing', 'command-added'],
      config: {
        includeCharacters: true,
        includeCommands: true,
        includeVariables: true,
        maxSuggestions: 5
      },
      provideContext: this.provideSceneContext.bind(this),
      canProvideContext: this.canProvideSceneContext.bind(this)
    });

    // Character context provider
    this.providers.set('character', {
      id: `provider_character_${Date.now()}`,
      type: 'character',
      name: 'Character Context',
      description: 'Provides context for character editing',
      isActive: true,
      priority: 'high',
      scope: 'character',
      triggers: ['character-selected', 'character-editing', 'dialogue-editing'],
      config: {
        includeRelationships: true,
        includeStats: true,
        includeAssets: true,
        maxSuggestions: 5
      },
      provideContext: this.provideCharacterContext.bind(this),
      canProvideContext: this.canProvideCharacterContext.bind(this)
    });

    // Variable context provider
    this.providers.set('variable', {
      id: `provider_variable_${Date.now()}`,
      type: 'variable',
      name: 'Variable Context',
      description: 'Provides context for variable usage',
      isActive: true,
      priority: 'medium',
      scope: 'global',
      triggers: ['variable-referenced', 'condition-editing', 'logic-editing'],
      config: {
        showUsages: true,
        showDependencies: true,
        showSuggestions: true,
        maxSuggestions: 10
      },
      provideContext: this.provideVariableContext.bind(this),
      canProvideContext: this.canProvideVariableContext.bind(this)
    });

    // Template context provider
    this.providers.set('template', {
      id: `provider_template_${Date.now()}`,
      type: 'template',
      name: 'Template Context',
      description: 'Provides template suggestions and help',
      isActive: true,
      priority: 'medium',
      scope: 'global',
      triggers: ['template-browsing', 'content-creation', 'empty-scene'],
      config: {
        categorizeTemplates: true,
        showPreview: true,
        includeCustom: true,
        maxSuggestions: 8
      },
      provideContext: this.provideTemplateContext.bind(this),
      canProvideContext: this.canProvideTemplateContext.bind(this)
    });

    // Logic context provider
    this.providers.set('logic', {
      id: `provider_logic_${Date.now()}`,
      type: 'logic',
      name: 'Logic Context',
      description: 'Provides logic editing assistance',
      isActive: true,
      priority: 'high',
      scope: 'logic',
      triggers: ['logic-editing', 'node-selected', 'connection-creating'],
      config: {
        showCompatibleNodes: true,
        validateConnections: true,
        suggestOptimizations: true,
        maxSuggestions: 6
      },
      provideContext: this.provideLogicContext.bind(this),
      canProvideContext: this.canProvideLogicContext.bind(this)
    });

    // Help context provider
    this.providers.set('help', {
      id: `provider_help_${Date.now()}`,
      type: 'help',
      name: 'Help Context',
      description: 'Provides contextual help and tips',
      isActive: true,
      priority: 'low',
      scope: 'global',
      triggers: ['error-encountered', 'first-time-user', 'feature-discovery'],
      config: {
        includeDocumentation: true,
        includeTips: true,
        includeExamples: true,
        adaptive: true
      },
      provideContext: this.provideHelpContext.bind(this),
      canProvideContext: this.canProvideHelpContext.bind(this)
    });
  }

  /**
   * Setup automatic context refresh
   */
  private setupAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(() => {
      this.refreshActiveContexts();
    }, this.config.refreshInterval);
  }

  /**
   * Update editor state and trigger context analysis
   */
  public updateEditorState(newState: Partial<EditorState>): void {
    const oldState = { ...this.editorState };
    this.editorState = { ...this.editorState, ...newState };

    // Analyze what changed and trigger appropriate updates
    this.analyzeStateChange(oldState, this.editorState);
  }

  /**
   * Analyze state changes and update contexts
   */
  private analyzeStateChange(oldState: EditorState, newState: EditorState): void {
    const changes: ContextTrigger[] = [];

    if (oldState.activeTab !== newState.activeTab) {
      changes.push('tab-changed');
    }
    if (oldState.currentScene !== newState.currentScene) {
      changes.push('scene-changed');
    }
    if (oldState.currentCharacter !== newState.currentCharacter) {
      changes.push('character-changed');
    }
    if (oldState.selectedItems.join(',') !== newState.selectedItems.join(',')) {
      changes.push('selection-changed');
    }

    // Trigger context updates based on changes
    for (const change of changes) {
      this.triggerContextUpdate(change);
    }
  }

  /**
   * Trigger context updates for specific triggers
   */
  private triggerContextUpdate(trigger: ContextTrigger): void {
    for (const [type, provider] of Array.from(this.providers.entries())) {
      if (provider.isActive && provider.triggers.includes(trigger)) {
        this.updateProviderContext(type);
      }
    }
  }

  /**
   * Update context for a specific provider
   */
  private async updateProviderContext(providerType: ContextProviderType): Promise<void> {
    const provider = this.providers.get(providerType);
    if (!provider || !provider.canProvideContext(this.editorState)) {
      return;
    }

    try {
      const context = await provider.provideContext(this.editorState);
      if (context) {
        this.createOrUpdatePanel(provider, context);
      }
    } catch (error) {
      console.error(`Error updating context for provider ${providerType}:`, error);
    }
  }

  /**
   * Create or update a context panel
   */
  private createOrUpdatePanel(provider: ContextProvider, context: ContextInfo): void {
    const panelId = `panel_${provider.type}_${Date.now()}`;
    
    const panel: ContextPanel = {
      id: panelId,
      type: this.mapProviderTypeToPanel(provider.type),
      title: provider.name,
      content: context,
      isVisible: true,
      isCollapsed: false,
      position: this.calculatePanelPosition(provider.priority),
      priority: provider.priority,
      scope: provider.scope,
      lastUpdated: new Date(),
      autoHide: provider.priority === 'low',
      actions: context.actions || [],
      triggers: provider.triggers
    };

    this.panels.set(panelId, panel);
    this.enforceMaxPanels();
  }

  /**
   * Map provider type to panel type
   */
  private mapProviderTypeToPanel(providerType: ContextProviderType): ContextPanelType {
    const mapping: Record<ContextProviderType, ContextPanelType> = {
      scene: 'contextual-help',
      character: 'contextual-help',
      variable: 'smart-suggestions',
      template: 'smart-suggestions',
      logic: 'contextual-help',
      help: 'quick-reference',
      validation: 'validation-results',
      performance: 'performance-insights'
    };
    return mapping[providerType] || 'contextual-help';
  }

  /**
   * Calculate panel position based on priority
   */
  private calculatePanelPosition(priority: ContextPriority): { x: number; y: number; width: number; height: number } {
    const basePosition = {
      high: { x: 20, y: 20, width: 300, height: 400 },
      medium: { x: 340, y: 20, width: 280, height: 350 },
      low: { x: 640, y: 20, width: 260, height: 300 }
    };

    return basePosition[priority];
  }

  /**
   * Enforce maximum panel limit
   */
  private enforceMaxPanels(): void {
    const activePanels = Array.from(this.panels.values())
      .filter(panel => panel.isVisible)
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });

    if (activePanels.length > this.config.maxPanelsActive) {
      const panelsToHide = activePanels.slice(this.config.maxPanelsActive);
      for (const panel of panelsToHide) {
        panel.isVisible = false;
      }
    }
  }

  /**
   * Scene context provider implementation
   */
  private async provideSceneContext(state: EditorState): Promise<ContextInfo | null> {
    if (!state.currentScene) return null;

    const suggestions: ContextSuggestion[] = [
      {
        id: `suggestion_scene_${Date.now()}`,
        type: 'action',
        title: 'Add Character Dialogue',
        description: 'Add a dialogue command for character interaction',
        relevance: 0.8,
        action: {
          id: `action_add_dialogue_${Date.now()}`,
          type: 'create',
          label: 'Add Dialogue',
          description: 'Create a new dialogue command',
          icon: 'dialogue',
          handler: 'scene.addDialogue',
          params: { sceneId: state.currentScene },
          shortcut: 'Ctrl+D'
        },
        metadata: {
          category: 'commands',
          difficulty: 'beginner'
        }
      },
      {
        id: `suggestion_background_${Date.now()}`,
        type: 'suggestion',
        title: 'Set Scene Background',
        description: 'Add a background image to enhance the scene',
        relevance: 0.7,
        action: {
          id: `action_set_background_${Date.now()}`,
          type: 'modify',
          label: 'Set Background',
          description: 'Choose or upload a background image',
          icon: 'image',
          handler: 'scene.setBackground',
          params: { sceneId: state.currentScene },
          shortcut: 'Ctrl+B'
        },
        metadata: {
          category: 'assets',
          difficulty: 'beginner'
        }
      }
    ];

    const actions: ContextAction[] = [
      {
        id: `action_preview_scene_${Date.now()}`,
        type: 'execute',
        label: 'Preview Scene',
        description: 'Preview the current scene in the live preview',
        icon: 'play',
        handler: 'scene.preview',
        params: { sceneId: state.currentScene },
        shortcut: 'F5'
      },
      {
        id: `action_validate_scene_${Date.now()}`,
        type: 'validate',
        label: 'Validate Scene',
        description: 'Check scene for errors and warnings',
        icon: 'check',
        handler: 'scene.validate',
        params: { sceneId: state.currentScene },
        shortcut: 'Ctrl+Shift+V'
      }
    ];

    return {
      title: 'Scene Context',
      summary: 'Context information for scene editing',
      items: [],
      suggestions,
      actions,
      metadata: {
        sceneId: state.currentScene,
        contextType: 'scene',
        lastUpdated: new Date().toISOString()
      }
    };
  }

  private canProvideSceneContext(state: EditorState): boolean {
    return !!state.currentScene && state.activeTab === 'scene-editor';
  }

  /**
   * Character context provider implementation
   */
  private async provideCharacterContext(state: EditorState): Promise<ContextInfo | null> {
    if (!state.currentCharacter) return null;

    const suggestions: ContextSuggestion[] = [
      {
        id: `suggestion_char_asset_${Date.now()}`,
        type: 'asset',
        title: 'Add Character Sprite',
        description: 'Upload or select a sprite for this character',
        relevance: 0.9,
        action: {
          id: `action_add_sprite_${Date.now()}`,
          type: 'create',
          label: 'Add Sprite',
          description: 'Add a visual representation for the character',
          icon: 'image',
          handler: 'character.addSprite',
          params: { characterId: state.currentCharacter },
          shortcut: 'Ctrl+I'
        },
        metadata: {
          category: 'assets',
          difficulty: 'beginner'
        }
      }
    ];

    return {
      title: 'Character Context',
      summary: 'Context information for character editing',
      items: [],
      suggestions,
      actions: [],
      metadata: {
        characterId: state.currentCharacter,
        contextType: 'character',
        lastUpdated: new Date().toISOString()
      }
    };
  }

  private canProvideCharacterContext(state: EditorState): boolean {
    return !!state.currentCharacter && 
           (state.activeTab === 'character-editor' || state.activeTab === 'character-manager');
  }

  /**
   * Variable context provider implementation
   */
  private async provideVariableContext(state: EditorState): Promise<ContextInfo | null> {
    const suggestions: ContextSuggestion[] = [
      {
        id: `suggestion_var_track_${Date.now()}`,
        type: 'insight',
        title: 'Track Variable Usage',
        description: 'Monitor how this variable is used across scenes',
        relevance: 0.6,
        action: {
          id: `action_track_var_${Date.now()}`,
          type: 'analyze',
          label: 'Track Usage',
          description: 'Analyze variable usage patterns',
          icon: 'analytics',
          handler: 'variable.trackUsage',
          params: { variableId: state.currentVariable },
          shortcut: 'Ctrl+T'
        },
        metadata: {
          category: 'analysis',
          difficulty: 'intermediate'
        }
      }
    ];

    return {
      title: 'Variable Context',
      summary: 'Context information for variable usage',
      items: [],
      suggestions,
      actions: [],
      metadata: {
        variableId: state.currentVariable,
        contextType: 'variable',
        lastUpdated: new Date().toISOString()
      }
    };
  }

  private canProvideVariableContext(state: EditorState): boolean {
    return state.activeTab === 'variable-manager' || !!state.currentVariable;
  }

  /**
   * Template context provider implementation
   */
  private async provideTemplateContext(state: EditorState): Promise<ContextInfo | null> {
    const suggestions: ContextSuggestion[] = [
      {
        id: `suggestion_template_browse_${Date.now()}`,
        type: 'suggestion',
        title: 'Browse Templates',
        description: 'Explore available templates for quick content creation',
        relevance: 0.7,
        action: {
          id: `action_browse_templates_${Date.now()}`,
          type: 'navigate',
          label: 'Browse Templates',
          description: 'Open template browser',
          icon: 'template',
          handler: 'template.browse',
          params: {},
          shortcut: 'Ctrl+Shift+T'
        },
        metadata: {
          category: 'productivity',
          difficulty: 'beginner'
        }
      }
    ];

    return {
      title: 'Template Context',
      summary: 'Template suggestions and guidance',
      items: [],
      suggestions,
      actions: [],
      metadata: {
        contextType: 'template',
        lastUpdated: new Date().toISOString()
      }
    };
  }

  private canProvideTemplateContext(state: EditorState): boolean {
    return state.selectedItems.length === 0 || state.activeTab === 'template-browser';
  }

  /**
   * Logic context provider implementation
   */
  private async provideLogicContext(state: EditorState): Promise<ContextInfo | null> {
    const suggestions: ContextSuggestion[] = [
      {
        id: `suggestion_logic_validate_${Date.now()}`,
        type: 'validation',
        title: 'Validate Logic Graph',
        description: 'Check for logic errors and optimization opportunities',
        relevance: 0.8,
        action: {
          id: `action_validate_logic_${Date.now()}`,
          type: 'validate',
          label: 'Validate Logic',
          description: 'Run logic validation checks',
          icon: 'check-circle',
          handler: 'logic.validate',
          params: {},
          shortcut: 'Ctrl+Shift+V'
        },
        metadata: {
          category: 'validation',
          difficulty: 'intermediate'
        }
      }
    ];

    return {
      title: 'Logic Context',
      summary: 'Logic editing assistance',
      items: [],
      suggestions,
      actions: [],
      metadata: {
        contextType: 'logic',
        lastUpdated: new Date().toISOString()
      }
    };
  }

  private canProvideLogicContext(state: EditorState): boolean {
    return state.activeTab === 'logic-editor';
  }

  /**
   * Help context provider implementation
   */
  private async provideHelpContext(state: EditorState): Promise<ContextInfo | null> {
    const suggestions: ContextSuggestion[] = [
      {
        id: `suggestion_help_docs_${Date.now()}`,
        type: 'help',
        title: 'View Documentation',
        description: 'Access comprehensive documentation and guides',
        relevance: 0.5,
        action: {
          id: `action_view_docs_${Date.now()}`,
          type: 'navigate',
          label: 'Open Docs',
          description: 'Open documentation in new window',
          icon: 'book',
          handler: 'help.openDocs',
          params: {},
          shortcut: 'F1'
        },
        metadata: {
          category: 'help',
          difficulty: 'beginner'
        }
      }
    ];

    return {
      title: 'Help Context',
      summary: 'Contextual help and guidance',
      items: [],
      suggestions,
      actions: [],
      metadata: {
        contextType: 'help',
        lastUpdated: new Date().toISOString()
      }
    };
  }

  private canProvideHelpContext(state: EditorState): boolean {
    return true; // Help is always available
  }

  /**
   * Refresh all active contexts
   */
  private refreshActiveContexts(): void {
    for (const [type, provider] of Array.from(this.providers.entries())) {
      if (provider.isActive) {
        this.updateProviderContext(type);
      }
    }
  }

  /**
   * Get all active panels
   */
  public getActivePanels(): ContextPanel[] {
    return Array.from(this.panels.values())
      .filter(panel => panel.isVisible)
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });
  }

  /**
   * Get panel by ID
   */
  public getPanel(panelId: VNID): ContextPanel | undefined {
    return this.panels.get(panelId);
  }

  /**
   * Toggle panel visibility
   */
  public togglePanel(panelId: VNID): boolean {
    const panel = this.panels.get(panelId);
    if (panel) {
      panel.isVisible = !panel.isVisible;
      return panel.isVisible;
    }
    return false;
  }

  /**
   * Close panel
   */
  public closePanel(panelId: VNID): boolean {
    const panel = this.panels.get(panelId);
    if (panel) {
      panel.isVisible = false;
      return true;
    }
    return false;
  }

  /**
   * Configure provider settings
   */
  public configureProvider(type: ContextProviderType, config: Record<string, any>): boolean {
    const provider = this.providers.get(type);
    if (provider) {
      provider.config = { ...provider.config, ...config };
      return true;
    }
    return false;
  }

  /**
   * Enable/disable provider
   */
  public setProviderActive(type: ContextProviderType, active: boolean): boolean {
    const provider = this.providers.get(type);
    if (provider) {
      provider.isActive = active;
      if (!active) {
        // Hide panels from this provider
        for (const [panelId, panel] of Array.from(this.panels.entries())) {
          if (panel.title === provider.name) {
            panel.isVisible = false;
          }
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Analyze current context and provide insights
   */
  public analyzeCurrentContext(): ContextAnalysisResult {
    const relevantItems: Array<{
      id: VNID;
      type: string;
      relevance: number;
      metadata: Record<string, any>;
    }> = [];

    const suggestions: ContextSuggestion[] = [];
    const actions: ContextAction[] = [];
    const warnings: string[] = [];
    const tips: string[] = [];

    // Collect suggestions from all active panels
    for (const panel of this.getActivePanels()) {
      if (panel.content.suggestions) {
        suggestions.push(...panel.content.suggestions);
      }
      if (panel.content.actions) {
        actions.push(...panel.content.actions);
      }
    }

    // Add contextual tips based on current state
    if (this.editorState.selectedItems.length === 0) {
      tips.push('Select an item to see context-specific options');
    }

    if (this.editorState.activeTab === 'scene-editor' && !this.editorState.currentScene) {
      warnings.push('No scene selected. Please select a scene to edit.');
    }

    return {
      scope: this.determineCurrentScope(),
      relevantItems,
      suggestions: suggestions.slice(0, 10), // Limit suggestions
      actions: actions.slice(0, 8), // Limit actions
      warnings,
      tips
    };
  }

  /**
   * Determine current context scope
   */
  private determineCurrentScope(): ContextScope {
    if (this.editorState.currentScene) return 'scene';
    if (this.editorState.currentCharacter) return 'character';
    if (this.editorState.activeTab === 'logic-editor') return 'logic';
    return 'global';
  }

  /**
   * Register custom context provider
   */
  public registerProvider(provider: ContextProvider): boolean {
    if (this.providers.has(provider.type)) {
      return false; // Provider already exists
    }

    this.providers.set(provider.type, provider);
    return true;
  }

  /**
   * Unregister context provider
   */
  public unregisterProvider(type: ContextProviderType): boolean {
    return this.providers.delete(type);
  }

  /**
   * Get provider configuration
   */
  public getProviderConfig(type: ContextProviderType): Record<string, any> | null {
    const provider = this.providers.get(type);
    return provider ? provider.config : null;
  }

  /**
   * Get service configuration
   */
  public getConfig(): ContextPanelServiceConfig {
    return { ...this.config };
  }

  /**
   * Update service configuration
   */
  public updateConfig(newConfig: Partial<ContextPanelServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart auto-refresh if interval changed
    if (newConfig.refreshInterval) {
      this.setupAutoRefresh();
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    this.panels.clear();
    this.providers.clear();
    this.activeRules.clear();
  }

  /**
   * Get context statistics
   */
  public getStatistics(): {
    totalPanels: number;
    activePanels: number;
    totalProviders: number;
    activeProviders: number;
    lastRefresh: Date;
  } {
    return {
      totalPanels: this.panels.size,
      activePanels: this.getActivePanels().length,
      totalProviders: this.providers.size,
      activeProviders: Array.from(this.providers.values()).filter(p => p.isActive).length,
      lastRefresh: new Date()
    };
  }
}