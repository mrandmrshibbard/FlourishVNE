/**
 * Canvas point-pick singleton — a tiny pub/sub that lets an inspector field request a
 * "click the canvas to set this point" interaction (à la the hotkey assigner). The inspector
 * (e.g. Move Character) calls `canvasPointPick.begin(...)`; the scene canvas (StagingArea)
 * watches the active request, shows a crosshair, and on click computes the x/y% and writes it
 * back to the command, then clears the request.
 *
 * It's a module singleton (per-window) so the inspector and the canvas in the SAME editor window
 * coordinate without threading a context through the whole tree. The popped-out canvas window is a
 * separate document and won't share this — picking is a main-window convenience.
 */
import React from 'react';

export interface CanvasPickRequest {
    /** Scene + command being edited (so the canvas can dispatch UPDATE_COMMAND). */
    sceneId: string;
    commandIndex: number;
    /** Which command field receives the picked {x,y} (e.g. 'toPosition' | 'fromPosition'). */
    field: string;
    /** Short label shown in the canvas crosshair banner. */
    label?: string;
}

let active: CanvasPickRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => { listeners.forEach(l => l()); };

export const canvasPointPick = {
    get(): CanvasPickRequest | null { return active; },
    /** Toggle: begin() with the same field again cancels (so the button is a toggle). */
    begin(req: CanvasPickRequest) {
        active = (active && active.field === req.field && active.commandIndex === req.commandIndex && active.sceneId === req.sceneId) ? null : req;
        emit();
    },
    cancel() { if (active) { active = null; emit(); } },
    subscribe(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; },
};

/** React hook: re-renders on pick-state change; returns the active request (or null). */
export function useCanvasPointPick(): CanvasPickRequest | null {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => canvasPointPick.subscribe(force), []);
    return canvasPointPick.get();
}
