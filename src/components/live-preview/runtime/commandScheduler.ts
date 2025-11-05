export interface CommandSignature {
    sceneId: string;
    commandId: string;
    index: number;
}

/**
 * Lightweight command scheduler that keeps track of processed commands so the
 * runtime never replays the same command during React effect re-renders or
 * asynchronous handler completions. The logic mirrors the guards previously
 * embedded directly in `LivePreview.tsx`.
 */
export class CommandScheduler {
    private lastProcessed: CommandSignature | null = null;

    /**
     * Determines whether the supplied command should execute. Returns false if
     * the scheduler has already advanced past the same signature.
     */
    shouldProcess(signature: CommandSignature): boolean {
        if (!this.lastProcessed) {
            return true;
        }
        return !(
            this.lastProcessed.sceneId === signature.sceneId &&
            this.lastProcessed.commandId === signature.commandId &&
            this.lastProcessed.index === signature.index
        );
    }

    /**
     * Records the most recently processed command signature.
     */
    markProcessed(signature: CommandSignature): void {
        this.lastProcessed = signature;
    }

    /**
     * Resets processed state, typically when scenes change or the command loop
     * rewinds (e.g., user restarts a scene).
     */
    reset(): void {
        this.lastProcessed = null;
    }

    /**
     * Utility guard that replicates the `lastProcessedCommandRef` early exit in
     * the legacy runtime. Useful when a command attempts to advance after the
     * scheduler already moved ahead.
     */
    alreadyAdvancedPast(currentIndex: number): boolean {
        if (!this.lastProcessed) {
            return false;
        }
        return this.lastProcessed.index > currentIndex;
    }

    getLastProcessed(): CommandSignature | null {
        return this.lastProcessed;
    }
}
