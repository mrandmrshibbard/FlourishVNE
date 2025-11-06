/**
 * Responsive Breakpoint Manager for FlourishVNE
 * 
 * Purpose: Manage responsive behavior across different screen sizes
 * Features: Breakpoint detection, responsive utilities, adaptive layouts
 * 
 * User Story: US2 - Streamlined Interface Navigation
 * Task: T035
 */

/**
 * Breakpoint definitions
 */
export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
  ultrawide: 1920
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * Responsive Manager Service
 */
export class ResponsiveManager {
  private static instance: ResponsiveManager;
  private currentBreakpoint: Breakpoint = 'desktop';
  private listeners: Set<(breakpoint: Breakpoint) => void> = new Set();

  private constructor() {
    this.updateBreakpoint();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.updateBreakpoint());
    }
  }

  public static getInstance(): ResponsiveManager {
    if (!ResponsiveManager.instance) {
      ResponsiveManager.instance = new ResponsiveManager();
    }
    return ResponsiveManager.instance;
  }

  private updateBreakpoint(): void {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
    let newBreakpoint: Breakpoint = 'mobile';

    if (width >= BREAKPOINTS.ultrawide) newBreakpoint = 'ultrawide';
    else if (width >= BREAKPOINTS.wide) newBreakpoint = 'wide';
    else if (width >= BREAKPOINTS.desktop) newBreakpoint = 'desktop';
    else if (width >= BREAKPOINTS.tablet) newBreakpoint = 'tablet';

    if (newBreakpoint !== this.currentBreakpoint) {
      this.currentBreakpoint = newBreakpoint;
      this.notifyListeners();
    }
  }

  public getCurrentBreakpoint(): Breakpoint {
    return this.currentBreakpoint;
  }

  public isBreakpoint(breakpoint: Breakpoint): boolean {
    return this.currentBreakpoint === breakpoint;
  }

  public isAtLeast(breakpoint: Breakpoint): boolean {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
    return width >= BREAKPOINTS[breakpoint];
  }

  public addListener(callback: (breakpoint: Breakpoint) => void): void {
    this.listeners.add(callback);
  }

  public removeListener(callback: (breakpoint: Breakpoint) => void): void {
    this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(cb => cb(this.currentBreakpoint));
  }
}

export const responsiveManager = ResponsiveManager.getInstance();
export default responsiveManager;
