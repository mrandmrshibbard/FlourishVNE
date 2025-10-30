/**
 * Save/Load System for Desktop Builds
 * Provides persistent game state storage using localStorage (browser)
 * or electron-store (desktop builds)
 */

export interface GameSaveData {
    version: string;
    timestamp: number;
    playerName?: string;
    currentSceneId: string;
    currentCommandIndex: number;
    variables: Record<string, string | number | boolean>;
    visitedScenes: string[];
    playTime: number; // in seconds
    autoSaveEnabled: boolean;
}

export interface SaveSlot {
    id: number;
    data: GameSaveData | null;
    name: string;
    thumbnail?: string; // base64 encoded screenshot
}

const SAVE_KEY_PREFIX = 'vn_save_';
const MAX_SAVE_SLOTS = 10;
const SAVE_VERSION = '1.0.0';

/**
 * Check if running in Electron desktop build
 */
export function isDesktopBuild(): boolean {
    return typeof window !== 'undefined' && 
           (window as any).electronAPI !== undefined;
}

/**
 * Save game state to a specific slot
 */
export function saveGame(
    slotId: number,
    gameState: Omit<GameSaveData, 'version' | 'timestamp'>,
    slotName?: string
): boolean {
    try {
        const saveData: GameSaveData = {
            ...gameState,
            version: SAVE_VERSION,
            timestamp: Date.now()
        };

        const saveKey = `${SAVE_KEY_PREFIX}${slotId}`;
        
        if (isDesktopBuild()) {
            // Use Electron store for desktop builds
            (window as any).electronAPI.saveGame(saveKey, saveData);
        } else {
            // Use localStorage for browser builds
            localStorage.setItem(saveKey, JSON.stringify(saveData));
        }

        // Save slot metadata
        if (slotName) {
            const metaKey = `${saveKey}_meta`;
            const metadata = { name: slotName, timestamp: saveData.timestamp };
            
            if (isDesktopBuild()) {
                (window as any).electronAPI.saveGame(metaKey, metadata);
            } else {
                localStorage.setItem(metaKey, JSON.stringify(metadata));
            }
        }

        return true;
    } catch (error) {
        console.error('Failed to save game:', error);
        return false;
    }
}

/**
 * Load game state from a specific slot
 */
export function loadGame(slotId: number): GameSaveData | null {
    try {
        const saveKey = `${SAVE_KEY_PREFIX}${slotId}`;
        let saveDataStr: string | null = null;

        if (isDesktopBuild()) {
            saveDataStr = (window as any).electronAPI.loadGame(saveKey);
        } else {
            saveDataStr = localStorage.getItem(saveKey);
        }

        if (!saveDataStr) return null;

        const saveData: GameSaveData = JSON.parse(saveDataStr);
        
        // Version check
        if (saveData.version !== SAVE_VERSION) {
            console.warn('Save file version mismatch');
            // Could implement migration logic here
        }

        return saveData;
    } catch (error) {
        console.error('Failed to load game:', error);
        return null;
    }
}

/**
 * Delete a save from a specific slot
 */
export function deleteSave(slotId: number): boolean {
    try {
        const saveKey = `${SAVE_KEY_PREFIX}${slotId}`;
        const metaKey = `${saveKey}_meta`;

        if (isDesktopBuild()) {
            (window as any).electronAPI.deleteSave(saveKey);
            (window as any).electronAPI.deleteSave(metaKey);
        } else {
            localStorage.removeItem(saveKey);
            localStorage.removeItem(metaKey);
        }

        return true;
    } catch (error) {
        console.error('Failed to delete save:', error);
        return false;
    }
}

/**
 * Get all save slots with their metadata
 */
export function getAllSaveSlots(): SaveSlot[] {
    const slots: SaveSlot[] = [];

    for (let i = 1; i <= MAX_SAVE_SLOTS; i++) {
        const saveData = loadGame(i);
        const metaKey = `${SAVE_KEY_PREFIX}${i}_meta`;
        
        let slotName = `Save Slot ${i}`;
        
        try {
            let metaStr: string | null = null;
            
            if (isDesktopBuild()) {
                metaStr = (window as any).electronAPI.loadGame(metaKey);
            } else {
                metaStr = localStorage.getItem(metaKey);
            }
            
            if (metaStr) {
                const metadata = JSON.parse(metaStr);
                slotName = metadata.name || slotName;
            }
        } catch (error) {
            // Ignore metadata errors
        }

        slots.push({
            id: i,
            data: saveData,
            name: slotName
        });
    }

    return slots;
}

/**
 * Auto-save to a dedicated slot
 */
export function autoSave(gameState: Omit<GameSaveData, 'version' | 'timestamp'>): boolean {
    return saveGame(0, gameState, 'Auto Save'); // Slot 0 is reserved for auto-save
}

/**
 * Load auto-save
 */
export function loadAutoSave(): GameSaveData | null {
    return loadGame(0);
}

/**
 * Check if a save exists in a slot
 */
export function hasSaveInSlot(slotId: number): boolean {
    return loadGame(slotId) !== null;
}

/**
 * Export save to file (for backup/sharing)
 */
export function exportSaveToFile(slotId: number): void {
    const saveData = loadGame(slotId);
    if (!saveData) return;

    const dataStr = JSON.stringify(saveData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `save_slot_${slotId}_${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
}

/**
 * Import save from file
 */
export function importSaveFromFile(file: File, slotId: number): Promise<boolean> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const saveData: GameSaveData = JSON.parse(e.target?.result as string);
                const success = saveGame(slotId, saveData);
                resolve(success);
            } catch (error) {
                console.error('Failed to import save:', error);
                resolve(false);
            }
        };
        
        reader.onerror = () => resolve(false);
        reader.readAsText(file);
    });
}

/**
 * Clear all saves (use with caution!)
 */
export function clearAllSaves(): boolean {
    try {
        for (let i = 0; i <= MAX_SAVE_SLOTS; i++) {
            deleteSave(i);
        }
        return true;
    } catch (error) {
        console.error('Failed to clear all saves:', error);
        return false;
    }
}
