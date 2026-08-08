/**
 * Common Event Reducer
 * Handles all common-event-related state actions: add, update, delete,
 * and command manipulation within common events.
 */

import { VNProject } from '../../../types/project';
import { VNCommonEvent, CommonEventParameter } from '../../../types/commonEvents';
import { VNCommand, CommandType } from '../../scene/types';
import { VNID } from '../../../types';

export type CommonEventAction =
    | { type: 'ADD_COMMON_EVENT'; payload: { commonEvent: VNCommonEvent } }
    | { type: 'UPDATE_COMMON_EVENT'; payload: { commonEventId: VNID; updates: Partial<VNCommonEvent> } }
    | { type: 'DELETE_COMMON_EVENT'; payload: { commonEventId: VNID } }
    | { type: 'DUPLICATE_COMMON_EVENT'; payload: { commonEventId: VNID } }
    | { type: 'ADD_COMMON_EVENT_COMMAND'; payload: { commonEventId: VNID; command: VNCommand; index?: number } }
    | { type: 'UPDATE_COMMON_EVENT_COMMAND'; payload: { commonEventId: VNID; commandIndex: number; updates: Partial<VNCommand> } }
    | { type: 'DELETE_COMMON_EVENT_COMMAND'; payload: { commonEventId: VNID; commandIndex: number } }
    | { type: 'REORDER_COMMON_EVENT_COMMANDS'; payload: { commonEventId: VNID; fromIndex: number; toIndex: number } }
    | { type: 'ADD_COMMON_EVENT_PARAMETER'; payload: { commonEventId: VNID; parameter: CommonEventParameter } }
    | { type: 'UPDATE_COMMON_EVENT_PARAMETER'; payload: { commonEventId: VNID; parameterId: VNID; updates: Partial<CommonEventParameter> } }
    | { type: 'DELETE_COMMON_EVENT_PARAMETER'; payload: { commonEventId: VNID; parameterId: VNID } };

const generateId = (): string => Math.random().toString(36).substring(2, 9);

export const commonEventReducer = (state: VNProject, action: CommonEventAction): VNProject => {
    switch (action.type) {
        case 'ADD_COMMON_EVENT': {
            const { commonEvent } = action.payload;
            return {
                ...state,
                commonEvents: {
                    ...(state.commonEvents || {}),
                    [commonEvent.id]: commonEvent,
                },
            };
        }

        case 'UPDATE_COMMON_EVENT': {
            const { commonEventId, updates } = action.payload;
            const commonEvents = state.commonEvents || {};
            const existing = commonEvents[commonEventId];
            if (!existing) return state;

            return {
                ...state,
                commonEvents: {
                    ...commonEvents,
                    [commonEventId]: {
                        ...existing,
                        ...updates,
                        updatedAt: new Date().toISOString(),
                    },
                },
            };
        }

        case 'DELETE_COMMON_EVENT': {
            const { commonEventId } = action.payload;
            const commonEvents = state.commonEvents || {};
            const { [commonEventId]: _, ...remaining } = commonEvents;

            // Also clear any CallCommonEvent commands referencing this event
            const newScenes = JSON.parse(JSON.stringify(state.scenes));
            for (const sceneId in newScenes) {
                newScenes[sceneId].commands = newScenes[sceneId].commands.map((cmd: any) => {
                    if (cmd.type === 'CallCommonEvent' && cmd.commonEventId === commonEventId) {
                        return { ...cmd, commonEventId: '' };
                    }
                    return cmd;
                });
            }

            return {
                ...state,
                commonEvents: remaining,
                scenes: newScenes,
            };
        }

        case 'DUPLICATE_COMMON_EVENT': {
            const { commonEventId } = action.payload;
            const commonEvents = state.commonEvents || {};
            const original = commonEvents[commonEventId];
            if (!original) return state;

            const now = new Date().toISOString();
            const newId = `ce-${generateId()}`;
            const duplicate: VNCommonEvent = {
                ...JSON.parse(JSON.stringify(original)),
                id: newId,
                name: `${original.name} (copy)`,
                createdAt: now,
                updatedAt: now,
                // Re-generate command IDs
                commands: original.commands.map((cmd: VNCommand) => ({
                    ...JSON.parse(JSON.stringify(cmd)),
                    id: `cmd-${generateId()}`,
                })),
            };

            return {
                ...state,
                commonEvents: {
                    ...commonEvents,
                    [newId]: duplicate,
                },
            };
        }

        case 'ADD_COMMON_EVENT_COMMAND': {
            const { commonEventId, command, index } = action.payload;
            const commonEvents = state.commonEvents || {};
            const existing = commonEvents[commonEventId];
            if (!existing) return state;

            const newCmd = { ...command, id: command.id || `cmd-${generateId()}` };
            const commands = [...existing.commands];
            if (index !== undefined && index >= 0 && index <= commands.length) {
                commands.splice(index, 0, newCmd);
            } else {
                commands.push(newCmd);
            }

            return {
                ...state,
                commonEvents: {
                    ...commonEvents,
                    [commonEventId]: {
                        ...existing,
                        commands,
                        updatedAt: new Date().toISOString(),
                    },
                },
            };
        }

        case 'UPDATE_COMMON_EVENT_COMMAND': {
            const { commonEventId, commandIndex, updates } = action.payload;
            const commonEvents = state.commonEvents || {};
            const existing = commonEvents[commonEventId];
            if (!existing || commandIndex < 0 || commandIndex >= existing.commands.length) return state;

            const commands = [...existing.commands];
            commands[commandIndex] = { ...commands[commandIndex], ...updates } as VNCommand;

            return {
                ...state,
                commonEvents: {
                    ...commonEvents,
                    [commonEventId]: {
                        ...existing,
                        commands,
                        updatedAt: new Date().toISOString(),
                    },
                },
            };
        }

        case 'DELETE_COMMON_EVENT_COMMAND': {
            const { commonEventId, commandIndex } = action.payload;
            const commonEvents = state.commonEvents || {};
            const existing = commonEvents[commonEventId];
            if (!existing || commandIndex < 0 || commandIndex >= existing.commands.length) return state;

            const commandToDelete = existing.commands[commandIndex];

            // Mirror the scene reducer's branch integrity rules: deleting a Branch removes ALL
            // of its markers (start, otherwise-if / otherwise, end) while keeping the command
            // bodies in place; a BranchEnd can never be deleted on its own — an orphaned branch
            // makes the runtime fall through segment bodies.
            if (commandToDelete?.type === CommandType.BranchStart) {
                const branchId = (commandToDelete as { branchId?: VNID }).branchId;
                const isBranchMarker = (cmd: VNCommand) =>
                    (cmd.type === CommandType.BranchStart ||
                     cmd.type === CommandType.BranchElseIf ||
                     cmd.type === CommandType.BranchElse ||
                     cmd.type === CommandType.BranchEnd) &&
                    (cmd as { branchId?: VNID }).branchId === branchId;
                return {
                    ...state,
                    commonEvents: {
                        ...commonEvents,
                        [commonEventId]: {
                            ...existing,
                            commands: existing.commands.filter(cmd => !isBranchMarker(cmd)),
                            updatedAt: new Date().toISOString(),
                        },
                    },
                };
            }
            if (commandToDelete?.type === CommandType.BranchEnd) {
                return state;
            }

            const commands = [...existing.commands];
            commands.splice(commandIndex, 1);

            return {
                ...state,
                commonEvents: {
                    ...commonEvents,
                    [commonEventId]: {
                        ...existing,
                        commands,
                        updatedAt: new Date().toISOString(),
                    },
                },
            };
        }

        case 'REORDER_COMMON_EVENT_COMMANDS': {
            const { commonEventId, fromIndex, toIndex } = action.payload;
            const commonEvents = state.commonEvents || {};
            const existing = commonEvents[commonEventId];
            if (!existing) return state;

            const commands = [...existing.commands];
            const [moved] = commands.splice(fromIndex, 1);
            commands.splice(toIndex, 0, moved);

            return {
                ...state,
                commonEvents: {
                    ...commonEvents,
                    [commonEventId]: {
                        ...existing,
                        commands,
                        updatedAt: new Date().toISOString(),
                    },
                },
            };
        }

        case 'ADD_COMMON_EVENT_PARAMETER': {
            const { commonEventId, parameter } = action.payload;
            const commonEvents = state.commonEvents || {};
            const existing = commonEvents[commonEventId];
            if (!existing) return state;

            return {
                ...state,
                commonEvents: {
                    ...commonEvents,
                    [commonEventId]: {
                        ...existing,
                        parameters: [...existing.parameters, parameter],
                        updatedAt: new Date().toISOString(),
                    },
                },
            };
        }

        case 'UPDATE_COMMON_EVENT_PARAMETER': {
            const { commonEventId, parameterId, updates } = action.payload;
            const commonEvents = state.commonEvents || {};
            const existing = commonEvents[commonEventId];
            if (!existing) return state;

            const parameters = existing.parameters.map(p =>
                p.id === parameterId ? { ...p, ...updates } : p
            );

            return {
                ...state,
                commonEvents: {
                    ...commonEvents,
                    [commonEventId]: {
                        ...existing,
                        parameters,
                        updatedAt: new Date().toISOString(),
                    },
                },
            };
        }

        case 'DELETE_COMMON_EVENT_PARAMETER': {
            const { commonEventId, parameterId } = action.payload;
            const commonEvents = state.commonEvents || {};
            const existing = commonEvents[commonEventId];
            if (!existing) return state;

            // Remove the deleted parameter's argument from any CallCommonEvent command
            // that targets this event (in scenes AND in other common events), so no
            // dangling arg refs linger after the param is gone.
            const stripArg = (cmd: any) => {
                if (cmd.type === 'CallCommonEvent' && cmd.commonEventId === commonEventId && cmd.arguments && parameterId in cmd.arguments) {
                    const { [parameterId]: _drop, ...restArgs } = cmd.arguments;
                    return { ...cmd, arguments: restArgs };
                }
                return cmd;
            };

            const newScenes: typeof state.scenes = {};
            for (const sceneId in state.scenes) {
                const scene = state.scenes[sceneId];
                newScenes[sceneId] = { ...scene, commands: scene.commands.map(stripArg) };
            }

            const updatedEvents: typeof commonEvents = {};
            for (const ceId in commonEvents) {
                const ce = commonEvents[ceId];
                updatedEvents[ceId] = { ...ce, commands: ce.commands.map(stripArg) };
            }
            // Apply the parameter removal to the target event.
            updatedEvents[commonEventId] = {
                ...updatedEvents[commonEventId],
                parameters: existing.parameters.filter(p => p.id !== parameterId),
                updatedAt: new Date().toISOString(),
            };

            return {
                ...state,
                scenes: newScenes,
                commonEvents: updatedEvents,
            };
        }

        default:
            return state;
    }
};
