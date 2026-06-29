export type VNID = string;
export type VNPositionPreset = 'left' | 'center' | 'right' | 'off-left' | 'off-right';
export interface VNPositionCustom {
    x: number; // percentage from left (0-100)
    y: number; // percentage from top (0-100)
}
export type VNPosition = VNPositionPreset | VNPositionCustom;
/** Normalized content box: visible/interactive sub-region of a sprite/image/button as inset fractions
 *  (0–1) of the element's full box. 0 every edge = full box; absent = full box (additive-optional). */
export interface VNContentBox { left: number; top: number; right: number; bottom: number; }
export type VNTransition = 'fade' | 'dissolve' | 'slide' | 'iris-in' | 'wipe-right' | 'instant' | 'cross-fade';
export type VNSceneTransition = 'fade' | 'dissolve' | 'iris-out' | 'wipe-right' | 'slide-left' | 'instant';

// Re-export context panels types
export * from './context-panels';

// Re-export screen effects types
export * from './screen-effects';
