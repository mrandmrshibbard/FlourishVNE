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
const SAVE_VERSION = '1.1.0'; // Bump version when save format changes

/**
 * Migration functions for different save versions
 * Maps old version to migration function that upgrades to next version
 */
const MIGRATIONS: Record<string, (save: any) => any> = {
    // Migration from 1.0.0 to 1.1.0
    '1.0.0': (save: any) => {
        // Initialize missing stageState if not present
        if (!save.stageState) {
            save.stageState = {
                background: null,
                characters: [],
                screen: { tint: 'transparent', zoom: 1, panX: 0, panY: 0, transitionDuration: 0, overlayEffects: [] },
                textOverlays: [],
                imageOverlays: [],
                buttonOverlays: [],
            };
        }
        // Ensure overlayEffects array exists in screen state
        if (save.stageState?.screen && !save.stageState.screen.overlayEffects) {
            save.stageState.screen.overlayEffects = [];
        }
        save.version = '1.1.0';
        return save;
    },
    // Add future migrations here:
    // '1.1.0': (save: any) => { ... return migrated save with version '1.2.0'; }
};

/**
 * Migrate a save from its current version to the latest version
 * @param saveData The save data to migrate
 * @returns Migrated save data, or null if migration failed
 */
function migrateSave(saveData: any): GameSaveData | null {
    if (!saveData || typeof saveData !== 'object') {
        console.warn('Invalid save data for migration');
        return null;
    }

    let currentVersion = saveData.version || '1.0.0'; // Assume 1.0.0 if no version
    let migratedSave = { ...saveData };
    let migrationCount = 0;
    const maxMigrations = 100; // Prevent infinite loops

    // Apply migrations sequentially until we reach current version
    while (currentVersion !== SAVE_VERSION && migrationCount < maxMigrations) {
        const migration = MIGRATIONS[currentVersion];
        
        if (!migration) {
            // No migration path from this version
            console.warn(`No migration path from version ${currentVersion} to ${SAVE_VERSION}`);
            // Still return the save - better to load potentially stale data than lose it
            migratedSave.version = SAVE_VERSION;
            break;
        }

        try {
            console.log(`Migrating save from version ${currentVersion}...`);
            migratedSave = migration(migratedSave);
            currentVersion = migratedSave.version;
            migrationCount++;
        } catch (error) {
            console.error(`Migration from ${currentVersion} failed:`, error);
            // Return partially migrated save rather than nothing
            migratedSave.version = SAVE_VERSION;
            break;
        }
    }

    if (migrationCount > 0) {
        console.log(`Save migrated through ${migrationCount} version(s) to ${SAVE_VERSION}`);
    }

    return migratedSave as GameSaveData;
}

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

        const rawSaveData = JSON.parse(saveDataStr);
        
        // Version check and migration
        if (rawSaveData.version !== SAVE_VERSION) {
            console.log(`Save version ${rawSaveData.version} differs from current ${SAVE_VERSION}, attempting migration...`);
            const migratedData = migrateSave(rawSaveData);
            
            if (migratedData) {
                // Optionally persist the migrated save so we don't migrate again
                try {
                    if (isDesktopBuild()) {
                        (window as any).electronAPI.saveGame(saveKey, migratedData);
                    } else {
                        localStorage.setItem(saveKey, JSON.stringify(migratedData));
                    }
                    console.log('Migrated save persisted successfully');
                } catch (persistError) {
                    console.warn('Could not persist migrated save:', persistError);
                }
                return migratedData;
            }
            
            // Migration failed but we can still try to use the raw data
            console.warn('Migration failed, using raw save data');
        }

        return rawSaveData as GameSaveData;
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
