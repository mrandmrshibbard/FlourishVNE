/**
 * Type definitions for the Live Preview game engine
 */

import React from 'react';
import { VNID, VNPosition, VNTransition } from '../../../types';
import { VNCommand } from '../../../features/scene/types';
import { ChoiceOption } from '../../../features/scene/types';

export type StageSize = { width: number; height: number };

export interface TextOverlay {
    id: VNID;
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontFamily: string;
    color: string;
    width?: number;
    height?: number;
    textAlign?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'middle' | 'bottom';
    transition?: VNTransition;
    duration?: number;
    action?: 'show' | 'hide';
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
    transition?: VNTransition;
    duration?: number;
    action?: 'show' | 'hide';
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
    imageUrl: string | null;
    hoverImageUrl: string | null;
    onClick: import('../../../types/shared').VNUIAction;
    actions?: import('../../../types/shared').VNUIAction[]; // Multiple actions support
    clickSound: VNID | null;
    waitForClick?: boolean;
    transition?: VNTransition;
    duration?: number;
    action?: 'show' | 'hide';
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
}

export interface StageState {
    backgroundUrl: string | null;
    backgroundIsVideo?: boolean;
    backgroundLoop?: boolean;
    characters: Record<VNID, StageCharacterState>;
    textOverlays: TextOverlay[];
    imageOverlays: ImageOverlay[];
    buttonOverlays: ButtonOverlay[];
    screen: {
        shake: { active: boolean; intensity: number };
        tint: string;
        zoom: number;
        panX: number;
        panY: number;
        transitionDuration: number;
    };
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
    uiState: {
        dialogue: {
            characterName: string;
            characterColor: string;
            characterId: VNID | null;
            text: string;
        } | null;
        choices: ChoiceOption[] | null;
        textInput: {
            variableId: VNID;
            prompt: string;
            placeholder: string;
            maxLength: number;
        } | null;
        movieUrl: string | null;
        isWaitingForInput: boolean;
        isTransitioning: boolean;
        transitionElement: React.ReactNode | null;
        flash: { color: string, duration: number } | null;
        showHistory: boolean;
        screenSceneId: VNID | null; // Track which scene a UI screen was opened from
    };
}

export interface GameStateSave {
    timestamp: number;
    sceneName: string;
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
    type: 'dialogue' | 'choice';
    characterName?: string;
    characterColor?: string;
    text: string;
    choiceText?: string; // For tracking which choice was selected
}

export interface GameSettings {
    textSpeed: number;
    musicVolume: number;
    sfxVolume: number;
    enableSkip: boolean;
    autoAdvance: boolean;
    autoAdvanceDelay: number; // in seconds
}

export const defaultSettings: GameSettings = {
    textSpeed: 50,
    musicVolume: 0.8,
    sfxVolume: 0.8,
    enableSkip: true,
    autoAdvance: false,
    autoAdvanceDelay: 3,
};
