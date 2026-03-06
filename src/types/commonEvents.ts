/**
 * Common Events System Types
 *
 * Common Events are reusable command sequences that can be called from
 * anywhere in the project. They function like functions/macros — you
 * author them once and invoke them via the "Call Common Event" command.
 *
 * Inspired by Visual Novel Maker's Common Events system with:
 * - Called events (invoked explicitly via command)
 * - Parallel events (run alongside scenes automatically)
 * - Parameterised events (accept arguments when called)
 */

import { VNID } from './index';
import type { VNCommand } from '../features/scene/types';

/* ------------------------------------------------------------------ */
/*  Trigger types                                                      */
/* ------------------------------------------------------------------ */

/**
 * How / when a Common Event is triggered.
 *
 * - 'called'       – Only runs when explicitly invoked by a CallCommonEvent command.
 * - 'parallel'     – Starts automatically and runs alongside the current scene.
 * - 'auto'         – Runs once automatically at scene start before the scene's own commands.
 */
export type CommonEventTrigger = 'called' | 'parallel' | 'auto';

/* ------------------------------------------------------------------ */
/*  Parameter definition (for parameterised events)                    */
/* ------------------------------------------------------------------ */

export interface CommonEventParameter {
    /** Unique param id */
    id: VNID;
    /** Display name */
    name: string;
    /** Data type */
    type: 'string' | 'number' | 'boolean';
    /** Default value when no argument is supplied */
    defaultValue: string | number | boolean;
    /** Optional description shown in the editor */
    description?: string;
}

/* ------------------------------------------------------------------ */
/*  Common Event                                                       */
/* ------------------------------------------------------------------ */

export interface VNCommonEvent {
    /** Unique identifier */
    id: VNID;
    /** Display name shown in the editor */
    name: string;
    /** Optional description */
    description?: string;
    /** Trigger type */
    trigger: CommonEventTrigger;
    /** Whether this common event is enabled (disabled events are skipped) */
    enabled: boolean;
    /** The command sequence (same VNCommand[] used in scenes) */
    commands: VNCommand[];
    /** Parameters accepted by this event (only meaningful for 'called' trigger) */
    parameters: CommonEventParameter[];
    /**
     * Condition switch — for 'parallel' and 'auto' triggers.
     * If set, the event only fires when this variable is truthy.
     */
    conditionVariableId?: VNID | null;
    /** When the event was created */
    createdAt: string;
    /** When the event was last modified */
    updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const generateId = (): string => Math.random().toString(36).substring(2, 9);

export function createDefaultCommonEvent(name: string): VNCommonEvent {
    const now = new Date().toISOString();
    return {
        id: `ce-${generateId()}`,
        name,
        description: '',
        trigger: 'called',
        enabled: true,
        commands: [],
        parameters: [],
        conditionVariableId: null,
        createdAt: now,
        updatedAt: now,
    };
}

export function createCommonEventParameter(name: string, type: 'string' | 'number' | 'boolean' = 'string'): CommonEventParameter {
    return {
        id: `cep-${generateId()}`,
        name,
        type,
        defaultValue: type === 'number' ? 0 : type === 'boolean' ? false : '',
        description: '',
    };
}
