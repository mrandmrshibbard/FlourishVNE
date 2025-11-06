/**
 * WCAG 2.1 Accessibility Manager for FlourishVNE
 * 
 * Purpose: Ensure WCAG 2.1 compliance and accessibility best practices
 * Features: Keyboard navigation, screen reader support, focus management
 * 
 * User Story: US2 - Streamlined Interface Navigation
 * Task: T036
 */

/**
 * Accessibility preferences
 */
export interface A11yPreferences {
  highContrast: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  keyboardOnly: boolean;
  screenReaderMode: boolean;
}

/**
 * Accessibility Manager Service
 */
export class AccessibilityManager {
  private static instance: AccessibilityManager;
  private preferences: A11yPreferences;
  private storageKey = 'flourish_a11y_preferences';

  private constructor() {
    this.preferences = this.loadPreferences();
    this.applyPreferences();
    this.setupKeyboardNav();
  }

  public static getInstance(): AccessibilityManager {
    if (!AccessibilityManager.instance) {
      AccessibilityManager.instance = new AccessibilityManager();
    }
    return AccessibilityManager.instance;
  }

  private loadPreferences(): A11yPreferences {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) return JSON.parse(stored);
    } catch (error) {
      console.warn('Failed to load a11y preferences:', error);
    }

    // Detect system preferences
    return {
      highContrast: false,
      reducedMotion: typeof window !== 'undefined' && 
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      largeText: false,
      keyboardOnly: false,
      screenReaderMode: false
    };
  }

  public getPreferences(): A11yPreferences {
    return { ...this.preferences };
  }

  public updatePreference<K extends keyof A11yPreferences>(
    key: K,
    value: A11yPreferences[K]
  ): void {
    this.preferences[key] = value;
    this.applyPreferences();
    this.savePreferences();
  }

  private applyPreferences(): void {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    
    // Apply high contrast
    root.classList.toggle('high-contrast', this.preferences.highContrast);
    
    // Apply reduced motion
    root.classList.toggle('reduced-motion', this.preferences.reducedMotion);
    
    // Apply large text
    root.classList.toggle('large-text', this.preferences.largeText);
    
    // Apply keyboard-only mode
    root.classList.toggle('keyboard-only', this.preferences.keyboardOnly);
  }

  private savePreferences(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.preferences));
    } catch (error) {
      console.warn('Failed to save a11y preferences:', error);
    }
  }

  private setupKeyboardNav(): void {
    if (typeof document === 'undefined') return;

    // Track keyboard usage
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        this.preferences.keyboardOnly = true;
        this.applyPreferences();
      }
    });

    // Track mouse usage
    document.addEventListener('mousedown', () => {
      if (this.preferences.keyboardOnly) {
        this.preferences.keyboardOnly = false;
        this.applyPreferences();
      }
    });
  }

  /**
   * Announce to screen readers
   */
  public announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    if (typeof document === 'undefined') return;

    const announcer = document.getElementById('a11y-announcer') || this.createAnnouncer();
    announcer.setAttribute('aria-live', priority);
    announcer.textContent = message;
    
    // Clear after announcement
    setTimeout(() => { announcer.textContent = ''; }, 1000);
  }

  private createAnnouncer(): HTMLElement {
    const announcer = document.createElement('div');
    announcer.id = 'a11y-announcer';
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', 'polite');
    announcer.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
    document.body.appendChild(announcer);
    return announcer;
  }
}

export const accessibilityManager = AccessibilityManager.getInstance();
export default accessibilityManager;
