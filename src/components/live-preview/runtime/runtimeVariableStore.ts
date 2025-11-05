export type Primitive = string | number | boolean | null | undefined;

export type VariableScope = 'global' | 'scene' | 'transient';

export interface VariableWrite {
    variableId: string;
    value: Primitive;
    scope: VariableScope;
    sourceCommandId?: string;
}

export interface VariableSnapshot {
    globals: Record<string, Primitive>;
    scene: Record<string, Primitive>;
    transient: Record<string, Primitive>;
    lastWriteOrder: string[];
}

/**
 * Simple runtime variable store that tracks write order so conditionals can
 * evaluate against up-to-date values before the React render cycle completes.
 */
export class RuntimeVariableStore {
    private globals: Record<string, Primitive>;
    private scene: Record<string, Primitive>;
    private transient: Record<string, Primitive>;
    private lastWriteOrder: string[] = [];

    constructor(initial?: Partial<VariableSnapshot>) {
        this.globals = { ...(initial?.globals ?? {}) };
        this.scene = { ...(initial?.scene ?? {}) };
        this.transient = { ...(initial?.transient ?? {}) };
        this.lastWriteOrder = [...(initial?.lastWriteOrder ?? [])];
    }

    applyWrites(writes: VariableWrite[]): void {
        for (const write of writes) {
            const { variableId, value, scope, sourceCommandId } = write;
            switch (scope) {
                case 'global':
                    this.globals[variableId] = value;
                    break;
                case 'scene':
                    this.scene[variableId] = value;
                    break;
                case 'transient':
                    this.transient[variableId] = value;
                    break;
                default:
                    throw new Error(`Unsupported variable scope: ${scope}`);
            }
            if (sourceCommandId) {
                this.lastWriteOrder.push(sourceCommandId);
            }
        }
    }

    get(variableId: string): Primitive {
        if (variableId in this.transient) {
            return this.transient[variableId];
        }
        if (variableId in this.scene) {
            return this.scene[variableId];
        }
        return this.globals[variableId];
    }

    resetScene(sceneDefaults?: Record<string, Primitive>): void {
        this.scene = { ...(sceneDefaults ?? {}) };
        this.transient = {};
    }

    resetTransient(): void {
        this.transient = {};
    }

    snapshot(): VariableSnapshot {
        return {
            globals: { ...this.globals },
            scene: { ...this.scene },
            transient: { ...this.transient },
            lastWriteOrder: [...this.lastWriteOrder],
        };
    }
}
