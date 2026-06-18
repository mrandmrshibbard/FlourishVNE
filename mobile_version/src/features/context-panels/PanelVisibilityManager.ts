/**
 * Smart Panel Visibility Manager for FlourishVNE
 * 
 * Purpose: Intelligent panel show/hide based on context, screen size, and user preferences
 * Features: Auto-collapse, responsive breakpoints, state persistence
 * 
 * User Story: US2 - Streamlined Interface Navigation
 * Task: T030
 */

import { VNID } from '../../types';

/**
 * Panel identifiers
 */
export type PanelId =
  | 'scene-list'
  | 'command-stack'
  | 'properties-inspector'
  | 'character-list'
  | 'expression-editor'
  | 'ui-screen-list'
  | 'element-inspector'
  | 'asset-browser'
  | 'variable-list'
  | 'variable-debugger'
  | 'template-gallery'
  | 'template-config'
  | 'logic-canvas'
  | 'logic-inspector'
  | 'wizard-steps';

/**
 * Panel visibility state
 */
export interface PanelVisibility {
  id: PanelId;
  visible: boolean;
  collapsed: boolean;
  pinned: boolean;
  lastToggled: Date;
}

/**
 * Editor context for smart visibility
 */
export interface EditorContext {
  activeTab: string;
  activeItemId?: VNID | null;
  screenWidth: number;
  screenHeight: number;
  hasSelection: boolean;
}

/**
 * Visibility rules
 */
export interface VisibilityRule {
  panelId: PanelId;
  contexts: string[];
  minScreenWidth?: number;
  requiresSelection?: boolean;
  requiresActiveItem?: boolean;
  autoCollapse?: boolean;
  priority: number;
}

/**
 * Panel Visibility Manager Service
 */
export class PanelVisibilityManager {
  private static instance: PanelVisibilityManager;
  private panelStates: Map<PanelId, PanelVisibility> = new Map();
  private visibilityRules: VisibilityRule[] = [];
  private listeners: Set<(states: Map<PanelId, PanelVisibility>) => void> = new Set();
  private storageKey = 'flourish_panel_visibility';

  private constructor() {
    this.initializeDefaultRules();
    this.loadPersistedStates();
    this.setupResponsiveListener();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): PanelVisibilityManager {
    if (!PanelVisibilityManager.instance) {
      PanelVisibilityManager.instance = new PanelVisibilityManager();
    }
    return PanelVisibilityManager.instance;
  }

  /**
   * Initialize default visibility rules
   */
  private initializeDefaultRules(): void {
    this.visibilityRules = [
      // Scene editing context
      {
        panelId: 'scene-list',
        contexts: ['scenes'],
        minScreenWidth: 768,
        priority: 10
      },
      {
        panelId: 'command-stack',
        contexts: ['scenes'],
        requiresActiveItem: true,
        priority: 9
      },
      {
        panelId: 'properties-inspector',
        contexts: ['scenes'],
        requiresSelection: true,
        minScreenWidth: 1024,
        priority: 8
      },

      // Character editing context
      {
        panelId: 'character-list',
        contexts: ['characters'],
        minScreenWidth: 768,
        priority: 10
      },
      {
        panelId: 'expression-editor',
        contexts: ['characters'],
        requiresActiveItem: true,
        priority: 9
      },

      // UI editing context
      {
        panelId: 'ui-screen-list',
        contexts: ['ui'],
        minScreenWidth: 768,
        priority: 10
      },
      {
        panelId: 'element-inspector',
        contexts: ['ui'],
        requiresSelection: true,
        minScreenWidth: 1024,
        priority: 8
      },

      // Asset management
      {
        panelId: 'asset-browser',
        contexts: ['assets'],
        priority: 10
      },

      // Variable management
      {
        panelId: 'variable-list',
        contexts: ['variables'],
        priority: 10
      },
      {
        panelId: 'variable-debugger',
        contexts: ['variables'],
        minScreenWidth: 1200,
        priority: 7
      },

      // Template browsing
      {
        panelId: 'template-gallery',
        contexts: ['templates'],
        priority: 10
      },
      {
        panelId: 'template-config',
        contexts: ['templates'],
        requiresSelection: true,
        priority: 9
      },

      // Visual logic
      {
        panelId: 'logic-canvas',
        contexts: ['logic'],
        priority: 10
      },
      {
        panelId: 'logic-inspector',
        contexts: ['logic'],
        requiresSelection: true,
        minScreenWidth: 1024,
        priority: 8
      },

      // Wizards
      {
        panelId: 'wizard-steps',
        contexts: ['wizard'],
        priority: 10
      }
    ];
  }

  /**
   * Update panel visibility based on context
   */
  public updateVisibility(context: EditorContext): void {
    const currentStates = new Map(this.panelStates);

    // Evaluate each rule
    this.visibilityRules.forEach(rule => {
      const state = this.getPanelState(rule.panelId);
      
      // Skip if panel is pinned
      if (state.pinned) return;

      // Check if context matches
      const contextMatches = rule.contexts.includes(context.activeTab);
      
      // Check screen width requirement
      const screenWidthOk = !rule.minScreenWidth || context.screenWidth >= rule.minScreenWidth;
      
      // Check selection requirement
      const selectionOk = !rule.requiresSelection || context.hasSelection;
      
      // Check active item requirement
      const activeItemOk = !rule.requiresActiveItem || !!context.activeItemId;

      // Determine visibility
      const shouldBeVisible = contextMatches && screenWidthOk && selectionOk && activeItemOk;

      // Update state
      if (shouldBeVisible !== state.visible) {
        state.visible = shouldBeVisible;
        state.lastToggled = new Date();
        this.panelStates.set(rule.panelId, state);
      }

      // Auto-collapse on narrow screens
      if (rule.autoCollapse && context.screenWidth < 1024 && shouldBeVisible) {
        state.collapsed = true;
        this.panelStates.set(rule.panelId, state);
      }
    });

    // Notify listeners if states changed
    if (!this.areStatesEqual(currentStates, this.panelStates)) {
      this.notifyListeners();
      this.persistStates();
    }
  }

  /**
   * Get panel visibility state
   */
  public getPanelState(panelId: PanelId): PanelVisibility {
    if (!this.panelStates.has(panelId)) {
      this.panelStates.set(panelId, {
        id: panelId,
        visible: true,
        collapsed: false,
        pinned: false,
        lastToggled: new Date()
      });
    }
    return this.panelStates.get(panelId)!;
  }

  /**
   * Toggle panel visibility
   */
  public togglePanel(panelId: PanelId): void {
    const state = this.getPanelState(panelId);
    state.visible = !state.visible;
    state.lastToggled = new Date();
    this.panelStates.set(panelId, state);
    this.notifyListeners();
    this.persistStates();
  }

  /**
   * Toggle panel collapse state
   */
  public toggleCollapse(panelId: PanelId): void {
    const state = this.getPanelState(panelId);
    state.collapsed = !state.collapsed;
    state.lastToggled = new Date();
    this.panelStates.set(panelId, state);
    this.notifyListeners();
    this.persistStates();
  }

  /**
   * Pin/unpin panel
   */
  public togglePin(panelId: PanelId): void {
    const state = this.getPanelState(panelId);
    state.pinned = !state.pinned;
    state.lastToggled = new Date();
    this.panelStates.set(panelId, state);
    this.notifyListeners();
    this.persistStates();
  }

  /**
   * Show panel explicitly
   */
  public showPanel(panelId: PanelId): void {
    const state = this.getPanelState(panelId);
    if (!state.visible) {
      state.visible = true;
      state.lastToggled = new Date();
      this.panelStates.set(panelId, state);
      this.notifyListeners();
      this.persistStates();
    }
  }

  /**
   * Hide panel explicitly
   */
  public hidePanel(panelId: PanelId): void {
    const state = this.getPanelState(panelId);
    if (state.visible && !state.pinned) {
      state.visible = false;
      state.lastToggled = new Date();
      this.panelStates.set(panelId, state);
      this.notifyListeners();
      this.persistStates();
    }
  }

  /**
   * Get all panel states
   */
  public getAllStates(): Map<PanelId, PanelVisibility> {
    return new Map(this.panelStates);
  }

  /**
   * Register change listener
   */
  public addListener(callback: (states: Map<PanelId, PanelVisibility>) => void): void {
    this.listeners.add(callback);
  }

  /**
   * Unregister change listener
   */
  public removeListener(callback: (states: Map<PanelId, PanelVisibility>) => void): void {
    this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    this.listeners.forEach(callback => {
      try {
        callback(this.getAllStates());
      } catch (error) {
        console.error('Panel visibility listener error:', error);
      }
    });
  }

  /**
   * Compare two state maps
   */
  private areStatesEqual(
    a: Map<PanelId, PanelVisibility>,
    b: Map<PanelId, PanelVisibility>
  ): boolean {
    if (a.size !== b.size) return false;
    
    for (const [key, valueA] of a) {
      const valueB = b.get(key);
      if (!valueB) return false;
      if (
        valueA.visible !== valueB.visible ||
        valueA.collapsed !== valueB.collapsed ||
        valueA.pinned !== valueB.pinned
      ) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Persist states to localStorage
   */
  private persistStates(): void {
    try {
      const stateArray = Array.from(this.panelStates.entries()).map(([id, state]) => ({
        id,
        visible: state.visible,
        collapsed: state.collapsed,
        pinned: state.pinned,
        lastToggled: state.lastToggled.toISOString()
      }));
      localStorage.setItem(this.storageKey, JSON.stringify(stateArray));
    } catch (error) {
      console.warn('Failed to persist panel states:', error);
    }
  }

  /**
   * Load persisted states from localStorage
   */
  private loadPersistedStates(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const stateArray = JSON.parse(stored);
        stateArray.forEach((item: any) => {
          this.panelStates.set(item.id, {
            id: item.id,
            visible: item.visible,
            collapsed: item.collapsed,
            pinned: item.pinned,
            lastToggled: new Date(item.lastToggled)
          });
        });
      }
    } catch (error) {
      console.warn('Failed to load persisted panel states:', error);
    }
  }

  /**
   * Setup responsive window listener
   */
  private setupResponsiveListener(): void {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        // Trigger visibility update based on new screen size
        // This will be called by the application when window resizes
      };
      
      window.addEventListener('resize', handleResize);
    }
  }

  /**
   * Reset all panels to default state
   */
  public resetToDefaults(): void {
    this.panelStates.clear();
    localStorage.removeItem(this.storageKey);
    this.notifyListeners();
  }
}

/**
 * Singleton instance export
 */
export const panelVisibilityManager = PanelVisibilityManager.getInstance();

export default panelVisibilityManager;
