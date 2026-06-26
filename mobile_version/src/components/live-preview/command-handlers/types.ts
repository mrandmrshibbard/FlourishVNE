/**
 * Command Handler Types
 * Shared interfaces for command processing
 */

import React from 'react';
import { VNID } from '../../../types';
import { VNProject } from '../../../types/project';
import { VNCondition } from '../../../types/shared';
import { PlayerState, StageState, MusicState } from '../types/gameState';
import { CommandScheduler } from '../runtime/commandScheduler';
import { RuntimeVariableStore } from '../runtime/runtimeVariableStore';
import { RuntimeDiagnostics } from '../runtime/runtimeDiagnostics';

export interface RuntimeCommandHelpers {
    scheduler: CommandScheduler;
    variableStore: RuntimeVariableStore;
    diagnostics: RuntimeDiagnostics;
}

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
    playSound: (soundId: VNID | null, volume?: number, loop?: boolean) => HTMLAudioElement | null | void;
    /** Play a dialogue VOICE clip: only one at a time (no overlap), volume follows the Voice slider
     *  independently of SFX. Falls back to playSound if absent (older callers). */
    playVoice?: (soundId: VNID | null, volume?: number) => HTMLAudioElement | null | void;
    stopAllSfx: () => void;
    /** Stop sound effects: all when audioId is omitted/null, else just that sound; optional fade-out (seconds). */
    stopSfx: (audioId?: VNID | null, fadeDuration?: number) => void;
    settings: {
        textSpeed: number;
        musicVolume: number;
        sfxVolume: number;
        voiceVolume?: number;
        enableSkip: boolean;
    };
    // Additional utilities for complex handlers
    advance: () => void;
    setPlayerState: React.Dispatch<React.SetStateAction<PlayerState | null>>;
    activeEffectTimeoutsRef: React.MutableRefObject<number[]>;
    runtime?: RuntimeCommandHelpers;
    // Condition evaluation for ShowButton and other conditional commands
    evaluateConditions: (conditions: VNCondition[] | undefined, variables: Record<VNID, string | number | boolean>) => boolean;
    /** Show a toast notification to the player (scripts' game.notify, surfaced script errors). Optional. */
    notify?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
    /** Run a real engine command imperatively from a foreground script (presentation parity) — reuses
     *  this same context's handlers + applies the result live. Resolves once applied (blocking commands
     *  like choice resolve on player input, returning e.g. the chosen index). Optional. */
    runCommand?: (type: string, params: Record<string, any>) => Promise<any>;
    /** Fire a real UI action from a foreground script (the same path a UI button uses) — go to screen,
     *  save/load, show/hide element, etc. Optional. */
    runUIAction?: (actionType: string, params: Record<string, any>) => void;
    /** True when running inside an EXPORTED game (not the editor's test-play). Used to suppress
     *  developer-facing diagnostics (script "not found" warnings, error toasts) from reaching players. */
    isStandalone?: boolean;
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
        currentIndex?: number;
        currentSceneId?: VNID;
        currentCommands?: any[];
        commandStack?: any[];
    };
    /** A FUNCTIONAL stage-state delta applied against the LATEST state (not the handler's
     *  closure snapshot). Use this for add/remove on stage collections (characters, overlays)
     *  so that stacked/`runAsync` commands compose instead of clobbering each other: e.g. four
     *  Hide Character commands fired in parallel each removing a different character. The plain
     *  `updates.stageState` path replaces whole collections from a stale snapshot and races. */
    stagePatch?: (prev: StageState) => Partial<StageState>;
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
