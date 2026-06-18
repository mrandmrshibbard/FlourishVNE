export type RuntimeDiagnosticEventType =
    | 'command-start'
    | 'command-finish'
    | 'branch-path'
    | 'cleanup-done'
    | 'error';

export interface RuntimeDiagnosticEvent<TPayload = unknown> {
    id: string;
    timestamp: number;
    type: RuntimeDiagnosticEventType;
    payload: TPayload;
}

export type RuntimeDiagnosticsSubscriber = (event: RuntimeDiagnosticEvent) => void;

/**
 * Small diagnostics feed that keeps an ordered event log and notifies
 * subscribers in insertion order. This mirrors the requirements captured in the
 * specification and will later back the QA overlays.
 */
export class RuntimeDiagnostics {
    private events: RuntimeDiagnosticEvent[] = [];
    private subscribers = new Set<RuntimeDiagnosticsSubscriber>();

    emit<TPayload>(type: RuntimeDiagnosticEventType, payload: TPayload): RuntimeDiagnosticEvent<TPayload> {
        const event: RuntimeDiagnosticEvent<TPayload> = {
            id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: Date.now(),
            type,
            payload,
        };
        this.events.push(event);
        for (const subscriber of this.subscribers) {
            subscriber(event);
        }
        return event;
    }

    getEvents(): RuntimeDiagnosticEvent[] {
        return [...this.events];
    }

    clear(): void {
        this.events = [];
    }

    subscribe(subscriber: RuntimeDiagnosticsSubscriber): () => void {
        this.subscribers.add(subscriber);
        return () => {
            this.subscribers.delete(subscriber);
        };
    }
}
