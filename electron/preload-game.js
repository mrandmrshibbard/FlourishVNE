/**
 * Electron Preload Script for Game Builds
 * Provides secure save/load API to the renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');
const Store = require('electron-store');

const store = new Store({
    name: 'game-saves',
    encryptionKey: 'flourish-vne-game-saves'
});

contextBridge.exposeInMainWorld('electronAPI', {
    // Save game data
    saveGame: (key, data) => {
        try {
            store.set(key, data);
            return true;
        } catch (error) {
            console.error('Save failed:', error);
            return false;
        }
    },

    // Load game data
    loadGame: (key) => {
        try {
            return store.get(key, null);
        } catch (error) {
            console.error('Load failed:', error);
            return null;
        }
    },

    // Delete save
    deleteSave: (key) => {
        try {
            store.delete(key);
            return true;
        } catch (error) {
            console.error('Delete failed:', error);
            return false;
        }
    },

    // Get all keys
    getAllKeys: () => {
        try {
            return Object.keys(store.store);
        } catch (error) {
            console.error('Get keys failed:', error);
            return [];
        }
    },

    // Clear all data
    clearAll: () => {
        try {
            store.clear();
            return true;
        } catch (error) {
            console.error('Clear failed:', error);
            return false;
        }
    },

    // Check if key exists
    has: (key) => {
        return store.has(key);
    },

    // Unified async storage API (preferred)
    storage: {
        setItem: async (key, value) => {
            store.set(key, value);
        },
        getItem: async (key) => {
            const val = store.get(key);
            return typeof val === 'undefined' ? null : val;
        },
        removeItem: async (key) => {
            store.delete(key);
        },
        clear: async () => {
            store.clear();
        },
        keys: async () => {
            return Object.keys(store.store);
        }
    }
});
