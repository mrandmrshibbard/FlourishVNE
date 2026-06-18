/**
 * Script Reducer
 * Handles all script-related state actions: add, update, delete scripts.
 */

import { VNProject } from '../../../types/project';
import { VNScript } from '../../../types/scripting';
import { VNID } from '../../../types';

export type ScriptAction =
    | { type: 'ADD_SCRIPT'; payload: { script: VNScript } }
    | { type: 'UPDATE_SCRIPT'; payload: { scriptId: VNID; updates: Partial<VNScript> } }
    | { type: 'DELETE_SCRIPT'; payload: { scriptId: VNID } };

export const scriptReducer = (state: VNProject, action: ScriptAction): VNProject => {
    switch (action.type) {
        case 'ADD_SCRIPT': {
            const { script } = action.payload;
            return {
                ...state,
                scripts: {
                    ...(state.scripts || {}),
                    [script.id]: script,
                },
            };
        }

        case 'UPDATE_SCRIPT': {
            const { scriptId, updates } = action.payload;
            const scripts = state.scripts || {};
            const existing = scripts[scriptId];
            if (!existing) return state;

            return {
                ...state,
                scripts: {
                    ...scripts,
                    [scriptId]: {
                        ...existing,
                        ...updates,
                        updatedAt: new Date().toISOString(),
                    },
                },
            };
        }

        case 'DELETE_SCRIPT': {
            const { scriptId } = action.payload;
            const scripts = state.scripts || {};
            const { [scriptId]: _, ...remaining } = scripts;

            // Also clear any RunScript commands pointing to this script
            const newScenes = JSON.parse(JSON.stringify(state.scenes));
            for (const sceneId in newScenes) {
                newScenes[sceneId].commands = newScenes[sceneId].commands.map((cmd: any) => {
                    if (cmd.type === 'RunScript' && cmd.scriptId === scriptId) {
                        return { ...cmd, scriptId: '' };
                    }
                    return cmd;
                });
            }

            return {
                ...state,
                scripts: remaining,
                scenes: newScenes,
            };
        }

        default:
            return state;
    }
};
