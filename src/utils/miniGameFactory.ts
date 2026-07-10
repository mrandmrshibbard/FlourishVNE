import { VNMiniGameConfig, VNMiniGameStage, VNMiniGameStageType } from '../types/miniGames';

/** Editor-side factories for new mini games / stages (sensible, immediately-playable defaults). */

const gid = (p: string) => `${p}-${Math.random().toString(36).substring(2, 9)}`;

export function createDefaultStage(type: VNMiniGameStageType): VNMiniGameStage {
    const base = { id: gid('mgstage'), stageType: type } as any;
    switch (type) {
        case 'wipe':
            return { ...base, coverType: 'color', coverColor: '#9ca3af', brushStyle: 'softRound', brushSize: 10, winRevealPercent: 70, autoClearOnWin: true };
        case 'memory':
            return { ...base, faces: [], flipBackDelayMs: 900 };
        case 'hidden':
            return { ...base, sceneImageId: null, hotspots: [] };
        case 'sliding':
            return { ...base, imageId: null, gridSize: 3, showReference: true, shuffleMoves: 80 };
        case 'assemble':
            return { ...base, sourceMode: 'slice', sliceImageId: null, sliceCols: 3, sliceRows: 3, snapTolerancePct: 8, trayPosition: 'bottom' };
        case 'paint':
            return { ...base, baseImageId: null, regions: [], palettes: [], tintMode: 'multiply', requireAllRegions: true };
        case 'qte':
        default:
            return { ...base, prompts: [], gapMs: 400, onMiss: 'retry', showProgressPips: true };
    }
}

export function createDefaultMiniGame(type: VNMiniGameStageType, name: string): VNMiniGameConfig {
    return { id: gid('vnmg'), name, stages: [createDefaultStage(type)], winActions: [] };
}
