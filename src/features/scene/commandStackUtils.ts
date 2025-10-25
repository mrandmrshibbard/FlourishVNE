import { VNCommand, CommandModifiers, BLOCKING_COMMAND_TYPES, UNPREDICTABLE_ASYNC_COMMANDS } from './types';

/**
 * Check if a command type can run asynchronously
 */
export function canRunAsync(commandType: string): boolean {
    return !BLOCKING_COMMAND_TYPES.includes(commandType as any);
}

/**
 * Check if a command type has unpredictable behavior when run async
 */
export function hasUnpredictableAsyncBehavior(commandType: string): boolean {
    return UNPREDICTABLE_ASYNC_COMMANDS.includes(commandType as any);
}

/**
 * Get warning message for async execution
 */
export function getAsyncWarning(commandType: string): string | null {
    if (BLOCKING_COMMAND_TYPES.includes(commandType as any)) {
        return 'This command cannot run asynchronously as it blocks execution by design.';
    }
    if (UNPREDICTABLE_ASYNC_COMMANDS.includes(commandType as any)) {
        return 'Running this command asynchronously may produce unpredictable results. Use with caution.';
    }
    return null;
}

/**
 * Group commands by stackId for visual display
 */
export interface CommandStack {
    stackId: string | null;
    commands: VNCommand[];
    isStacked: boolean;
}

export function groupCommandsIntoStacks(commands: VNCommand[]): CommandStack[] {
    const stacks: CommandStack[] = [];
    const stackMap = new Map<string, { commands: VNCommand[], firstIndex: number }>();
    const processedCommands = new Set<VNCommand>();
    
    // First pass: identify stacks and track their first occurrence
    commands.forEach((command, index) => {
        const stackId = command.modifiers?.stackId;
        
        if (stackId) {
            if (!stackMap.has(stackId)) {
                stackMap.set(stackId, { commands: [], firstIndex: index });
            }
            stackMap.get(stackId)!.commands.push(command);
            processedCommands.add(command);
        }
    });
    
    // Second pass: build stacks in original order
    commands.forEach((command, index) => {
        const stackId = command.modifiers?.stackId;
        
        if (stackId) {
            // Only add the stack once, at the position of its first command
            const stackData = stackMap.get(stackId);
            if (stackData && stackData.firstIndex === index) {
                // Sort by stackOrder
                const stackCommands = stackData.commands.sort((a, b) => {
                    const orderA = a.modifiers?.stackOrder ?? 0;
                    const orderB = b.modifiers?.stackOrder ?? 0;
                    return orderA - orderB;
                });
                
                stacks.push({
                    stackId,
                    commands: stackCommands,
                    isStacked: true,
                });
            }
        } else {
            // Commands without stackId are individual stacks
            stacks.push({
                stackId: null,
                commands: [command],
                isStacked: false,
            });
        }
    });
    
    return stacks;
}

/**
 * Generate a unique stack ID
 */
export function generateStackId(): string {
    return `stack-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Check if commands can be stacked together (must have compatible timing)
 */
export function canStackCommands(commands: VNCommand[]): { canStack: boolean; reason?: string } {
    if (commands.length < 2) {
        return { canStack: false, reason: 'Need at least 2 commands to stack' };
    }
    
    // Check if any command is blocking
    for (const cmd of commands) {
        if (!canRunAsync(cmd.type)) {
            return { 
                canStack: false, 
                reason: `"${cmd.type}" cannot run in parallel as it blocks execution` 
            };
        }
    }
    
    return { canStack: true };
}

/**
 * Create or update stack modifiers for commands
 */
export function stackCommands(commands: VNCommand[], existingStackId?: string): VNCommand[] {
    const stackId = existingStackId || generateStackId();
    
    return commands.map((cmd, index) => ({
        ...cmd,
        modifiers: {
            ...cmd.modifiers,
            runAsync: true,
            stackId,
            stackOrder: index,
        },
    }));
}

/**
 * Remove a command from its stack
 */
export function unstackCommand(command: VNCommand): VNCommand {
    const { modifiers, ...rest } = command;
    if (!modifiers) return command;
    
    const { stackId, stackOrder, runAsync, ...remainingModifiers } = modifiers;
    
    return {
        ...rest,
        modifiers: Object.keys(remainingModifiers).length > 0 ? remainingModifiers : undefined,
    };
}

/**
 * Check if a command is part of a stack
 */
export function isCommandStacked(command: VNCommand): boolean {
    return !!command.modifiers?.stackId;
}
