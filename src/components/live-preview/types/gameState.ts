/**
 * Type definitions for the Live Preview game engine
 */

import React from 'react';
import { VNID, VNPosition, VNTransition } from '../../../types';
import { VNCommand } from '../../../features/scene/types';
import { ChoiceOption } from '../../../features/scene/types';
import type { VNScreenOverlayEffect } from '../../../types';
import type { VNCharacterVisualEffect, VNDialogueTextEffect, VNParticleConfig } from '../../../features/scene/types';

export type StageSize = { width: number; height: number };

export interface TextOverlay {
    id: VNID;
    text: string;
    /** Un-interpolated template (with {variable} tokens). When `live`, the renderer
     *  re-interpolates this against current variables each frame so values update live. */
    rawText?: string;
    x: number;
    y: number;
    fontSize: number;
    fontFamily: string;
    color: string;
    width?: number;
    height?: number;
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    letterSpacing?: number;
    textShadow?: { enabled: boolean; offsetX: number; offsetY: number; blur: number; color: string };
    textGradient?: { enabled: boolean; type: 'linear' | 'radial'; angle: number; colors: string[] };
    textBorder?: { enabled: boolean; width: number; color: string };
    textAlign?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'middle' | 'bottom';
    transition?: VNTransition;
    duration?: number;
    action?: 'show' | 'hide';
    // Orientation
    rotation?: number;
    flipX?: boolean;
    flipY?: boolean;
    /** Live (reactive) conditions: when `live`, re-evaluated every render to show/hide. */
    conditions?: import('../../../types/shared').VNCondition[];
    live?: boolean;
}

export interface ImageOverlay {
    id: VNID;
    imageUrl?: string;
    videoUrl?: string;
    isVideo?: boolean;
    videoLoop?: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
    scaleX: number;
    scaleY: number;
    flipX?: boolean;
    flipY?: boolean;
    transition?: VNTransition;
    duration?: number;
    action?: 'show' | 'hide';
    /** Live (reactive) conditions: when `live`, re-evaluated every render to show/hide. */
    conditions?: import('../../../types/shared').VNCondition[];
    live?: boolean;
}

export interface ButtonOverlay {
    id: VNID;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    anchorX: number;
    anchorY: number;
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    fontWeight: 'normal' | 'bold';
    borderRadius: number;
    opacity: number;
    imageUrl: string | null;
    hoverImageUrl: string | null;
    onClick: import('../../../types/shared').VNUIAction;
    actions?: import('../../../types/shared').VNUIAction[]; // Multiple actions support
    clickSound: VNID | null;
    waitForClick?: boolean;
    /** Quick-menu mode — when true, clicks fire actions but never advance the
     *  dialogue and never consume the click. See ShowButtonCommand.quickMenuMode. */
    quickMenuMode?: boolean;
    transition?: VNTransition;
    duration?: number;
    action?: 'show' | 'hide';
    // Orientation
    rotation?: number;
    flipX?: boolean;
    flipY?: boolean;
    /** Live (reactive) conditions: when `live`, re-evaluated every render to show/hide. */
    conditions?: import('../../../types/shared').VNCondition[];
    live?: boolean;
}

export interface ImageMapRegionOverlay {
    id: VNID;
    name: string;
    shape: 'rect' | 'circle' | 'poly';
    coords: number[];
    actions: import('../../../types/shared').VNUIAction[];
    tooltip?: string;
    cursor?: string;
    highlightColor?: string;
    conditions?: import('../../../types/shared').VNCondition[];
}

export interface ImageMapOverlay {
    id: VNID;
    imageUrl: string;
    hoverImageUrl?: string;
    regions: ImageMapRegionOverlay[];
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
    waitForClick?: boolean;
    transition?: VNTransition;
    duration?: number;
    action?: 'show' | 'hide';
}

/** An interactive hot spot placed on the scene stage (from a ShowHotSpot command). */
export interface HotSpotOverlay {
    id: VNID;
    /** The ShowHotSpot command id that placed it (for HideHotSpot targeting). */
    commandId: VNID;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    shape: 'rect' | 'circle';
    trigger: 'click' | 'hover' | 'drag-drop';
    actions: import('../../../types/shared').VNUIAction[];
    conditions?: import('../../../types/shared').VNCondition[];
    acceptedTag?: string;
    highlightColor?: string;
    visible?: boolean;
    advanceOnTrigger?: boolean;
}

export interface StageCharacterTransition {
    type: VNTransition;
    duration: number;
    startPosition?: VNPosition;
    endPosition?: VNPosition;
    action: 'show' | 'hide';
}

export interface StageCharacterState {
    charId: VNID;
    position: VNPosition;
    imageUrls: string[];
    videoUrls?: string[];
    isVideo?: boolean;
    videoLoop?: boolean;
    transition: StageCharacterTransition | null;
    expressionId?: VNID;
    layerVariableBindings?: Record<VNID, VNID>;
    /** Per-character visual effects — multiple can stack (shake, glow, tint, etc.) */
    visualEffects?: VNCharacterVisualEffect[];
    /** The ShowCharacter command ID that placed this character on stage (for drag-to-position) */
    sourceCommandId?: string;
    /** Character scale (1 = 100% original size) */
    scale?: number;
    /** When true, character sprite is flipped horizontally */
    inverted?: boolean;
    /** Rotation in degrees (positive = clockwise). */
    rotation?: number;
    /** When true, character sprite is flipped vertically. */
    flipY?: boolean;
    /** Live (reactive) conditions: when `live`, the character is shown only while met. */
    conditions?: import('../../../types/shared').VNCondition[];
    live?: boolean;
}

/** A live (reactive) conditional background candidate (from a live Set Background). */
export interface BackgroundLayer {
    commandId: VNID;
    conditions?: import('../../../types/shared').VNCondition[];
    url: string | null;
    color?: string;
    isVideo?: boolean;
    loop?: boolean;
}

export interface StageState {
    backgroundUrl: string | null;
    backgroundIsVideo?: boolean;
    backgroundLoop?: boolean;
    /** Solid color background (used when backgroundColor is set on the SetBackground command) */
    backgroundColor?: string;
    /** Live conditional background candidates; render picks the last whose conditions match, else the base background. */
    backgroundLayers?: BackgroundLayer[];
    characters: Record<VNID, StageCharacterState>;
    textOverlays: TextOverlay[];
    imageOverlays: ImageOverlay[];
    buttonOverlays: ButtonOverlay[];
    imageMapOverlays: ImageMapOverlay[];
    /** Interactive scene hot spots (ShowHotSpot). Optional for back-compat with older saves. */
    hotSpotOverlays?: HotSpotOverlay[];
    /** Persistent movie overlays (transparent, looping) that play behind characters */
    movieOverlays?: Array<{
        url: string;
        loop: boolean;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        opacity?: number;
        objectFit?: 'cover' | 'contain' | 'fill' | 'custom';
    }>;
    screen: {
        shake: { active: boolean; intensity: number };
        tint: string;
        zoom: number;
        panX: number;
        panY: number;
        transitionDuration: number;
        overlayEffects: VNScreenOverlayEffect[];
    };
    /** Active particle effects on stage */
    particleEffects: Record<string, {
        tag: string;
        config: VNParticleConfig;
        /** Timestamp when this effect started */
        startTime: number;
        /** Auto-stop duration (0 = persistent) */
        duration: number;
        /** Whether the effect is fading out */
        fadingOut?: boolean;
        /** Fade out duration remaining */
        fadeOutDuration?: number;
    }>;
}

export interface MusicState {
    audioId: VNID | null;
    loop: boolean;
    currentTime: number;
    isPlaying: boolean;
}

export interface PlayerState {
    mode: 'menu' | 'playing' | 'paused';
    currentSceneId: VNID;
    currentCommands: VNCommand[];
    currentIndex: number;
    commandStack: Array<{sceneId: VNID, commands: VNCommand[], index: number}>;
    variables: Record<VNID, string | number | boolean>;
    stageState: StageState;
    musicState: MusicState;
    history: HistoryEntry[];
    /** Saved choice/input responses for skip-backward replay (keyed by `sceneId:commandIndex`) */
    savedInputs: Record<string, { type: 'choice'; choice: ChoiceOption } | { type: 'textInput'; value: string }>;
    uiState: {
        dialogue: {
            characterName: string;
            characterColor: string;
            characterId: VNID | null;
            text: string;
            /** Voice audio clip ID to play for this line */
            voiceAudioId?: VNID | null;
            /** Text effect for this dialogue line */
            textEffect?: VNDialogueTextEffect;
        } | null;
        choices: ChoiceOption[] | null;
        textInput: {
            variableId: VNID;
            prompt: string;
            placeholder: string;
            maxLength: number;
        } | null;
        movieUrl: string | null;
        movieLoop?: boolean;
        isWaitingForInput: boolean;
        isTransitioning: boolean;
        transitionElement: React.ReactNode | null;
        flash: { color: string, duration: number } | null;
        showHistory: boolean;
        screenSceneId: VNID | null; // Track which scene a UI screen was opened from
        /** Whether skip-forward is currently active */
        isSkipping: boolean;
    };
}

export interface GameStateSave {
    timestamp: number;
    sceneName: string;
    /** Base64 data URL of a screenshot thumbnail */
    screenshot?: string;
    playerStateData: {
        currentSceneId: VNID;
        currentCommands: VNCommand[];
        currentIndex: number;
        commandStack: Array<{sceneId: VNID, commands: VNCommand[], index: number}>;
        variables: Record<VNID, string | number | boolean>;
        stageState: StageState;
        musicState: MusicState;
    }
}

export interface HistoryEntry {
    timestamp: number;
    type: 'dialogue' | 'choice' | 'textInput';
    characterName?: string;
    characterColor?: string;
    text: string;
    choiceText?: string; // For tracking which choice was selected
    inputValue?: string; // For tracking text input values
    /** Scene + command index snapshot for skip-backward navigation */
    sceneId?: VNID;
    commandIndex?: number;
    /** For choice entries: the full choice option so we can replay it */
    choiceOption?: ChoiceOption;
    /** For textInput entries: the variable that was set */
    variableId?: VNID;
    /** Full stage state snapshot for backward navigation (background, characters, overlays) */
    stageSnapshot?: StageState;
    /** Variables snapshot for backward navigation */
    variablesSnapshot?: Record<VNID, string | number | boolean>;
    /** Music state snapshot for backward navigation */
    musicSnapshot?: MusicState;
}

export interface GameSettings {
    textSpeed: number;
    musicVolume: number;
    sfxVolume: number;
    voiceVolume: number;
    ambientVolume: number;
    enableSkip: boolean;
    autoAdvance: boolean;
    autoAdvanceDelay: number; // in seconds
}

export const defaultSettings: GameSettings = {
    textSpeed: 50,
    musicVolume: 0.8,
    sfxVolume: 0.8,
    voiceVolume: 0.8,
    ambientVolume: 0.8,
    enableSkip: true,
    autoAdvance: false,
    autoAdvanceDelay: 3,
};
