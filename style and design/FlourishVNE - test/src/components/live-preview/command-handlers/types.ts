/**
 * Command Handler Types
 * Shared interfaces for command processing
 */

import React from 'react';
import { VNID } from '../../../types';
import { VNProject } from '../../../types/project';
import { PlayerState, StageState, MusicState } from '../types/gameState';

/**
 * Context passed to all command handlers
 */
export interface CommandContext {
    project: VNProject;
    playerState: PlayerState;
    assetResolver: (assetId: VNID | null, type: 'audio' | 'video' | 'image') => string | null;
    getAssetMetadata: (assetId: VNID | null, type: 'audio' | 'video' | 'image') => { isVideo: boolean; loop: boolean };
    musicAudioRef: React.RefObject<HTMLAudioElement>;
    fadeAudio: (audio: HTMLAudioElement, targetVolume: number, duration?: number, onComplete?: () => void) => void;
    playSound: (soundId: VNID | null, volume?: number) => void;
    settings: {
        textSpeed: number;
        musicVolume: number;
        sfxVolume: number;
        enableSkip: boolean;
    };
    // Additional utilities for complex handlers
    advance: () => void;
    setPlayerState: React.Dispatch<React.SetStateAction<PlayerState | null>>;
    activeEffectTimeoutsRef: React.MutableRefObject<number[]>;
}

/**
 * Result returned from command handlers
 */
export interface CommandResult {
    /** Should the game auto-advance to the next command? */
    advance: boolean;
    /** State updates to apply */
    updates?: {
        stageState?: Partial<StageState>;
        musicState?: Partial<MusicState>;
        uiState?: Partial<PlayerState['uiState']>;
        variables?: Record<VNID, string | number | boolean>;
        dialogueHistory?: PlayerState['dialogueHistory'];
        choiceHistory?: PlayerState['choiceHistory'];
        currentIndex?: number;
        currentSceneId?: VNID;
        currentCommands?: any[];
        commandStack?: any[];
    };
    /** Delay in milliseconds before advancing */
    delay?: number;
    /** Callback to execute after delay */
    callback?: () => void;
}

/**
 * Navigation helper result
 */
export interface NavigationResult {
    sceneId: VNID;
    commands: any[];
}
