export type VNID = string;
export type VNPositionPreset = 'left' | 'center' | 'right' | 'off-left' | 'off-right';
export interface VNPositionCustom {
    x: number; // percentage from left (0-100)
    y: number; // percentage from top (0-100)
}
export type VNPosition = VNPositionPreset | VNPositionCustom;
export type VNTransition = 'fade' | 'dissolve' | 'slide' | 'iris-in' | 'wipe-right' | 'instant' | 'cross-fade';
export type VNSceneTransition = 'fade' | 'dissolve' | 'iris-out' | 'wipe-right' | 'slide-left' | 'instant';

// Re-export context panels types
export * from './context-panels';

// Re-export screen effects types
export * from './screen-effects';
