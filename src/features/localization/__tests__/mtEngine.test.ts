/**
 * Model selection and availability.
 *
 * The worker itself isn't tested here — it needs a real browser worker and a 40 MB download. What
 * IS tested is everything that decides whether the button should even be offered, because getting
 * that wrong means an author clicks "Draft" and waits for a download that 404s.
 */
import { describe, it, expect } from 'vitest';
import { modelFor, canMachineTranslate, machineTranslationAvailable } from '../mtEngine';

describe('picking a model', () => {
    it('maps a language pair to a Helsinki OPUS-MT model', () => {
        expect(modelFor('en', 'es')).toBe('Xenova/opus-mt-en-es');
        expect(modelFor('en', 'ja')).toBe('Xenova/opus-mt-en-ja');
    });

    it('🔴 drops region suffixes — the models are named by base language', () => {
        // pt-BR must use en→pt; asking for `opus-mt-en-pt-BR` would 404 after a long wait.
        expect(modelFor('en', 'pt-BR')).toBe('Xenova/opus-mt-en-pt');
        expect(modelFor('en', 'zh-CN')).toBe('Xenova/opus-mt-en-zh');
        expect(modelFor('en-GB', 'es')).toBe('Xenova/opus-mt-en-es');
    });

    it('refuses a pair that makes no sense', () => {
        expect(modelFor('en', 'en')).toBeNull();
        expect(modelFor('en', 'en-GB')).toBeNull();          // same base language
        expect(modelFor('', 'es')).toBeNull();
        expect(modelFor('en', '')).toBeNull();
    });
});

describe('which pairs we offer', () => {
    it('offers the common targets from English', () => {
        for (const code of ['es', 'fr', 'de', 'ja', 'zh-CN', 'pt-BR', 'ru']) {
            expect(canMachineTranslate('en', code)).toBe(true);
        }
    });

    it('🔴 says no to a language with no published model, rather than failing after a download', () => {
        expect(canMachineTranslate('en', 'cy')).toBe(false);
        expect(canMachineTranslate('en', 'xx')).toBe(false);
    });

    it('says no when the game is not written in English — v1 is English-sourced', () => {
        expect(canMachineTranslate('ja', 'es')).toBe(false);
        expect(canMachineTranslate('es', 'en')).toBe(false);
    });

    it('says no to translating a language into itself', () => {
        expect(canMachineTranslate('en', 'en')).toBe(false);
    });
});

describe('availability', () => {
    it('is off without the desktop app', () => {
        expect(machineTranslationAvailable()).toBe(false);
    });

    it('is on in the desktop app, where both the shell and workers exist', () => {
        (window as any).electronAPI = {};
        (globalThis as any).Worker = class {};
        try {
            expect(machineTranslationAvailable()).toBe(true);
        } finally {
            delete (window as any).electronAPI;
            delete (globalThis as any).Worker;
        }
    });

    it('🔴 is off without Web Workers, even in the desktop app', () => {
        // Running the model on the main thread would freeze the editor for minutes, so no worker
        // means no feature rather than a hung window.
        (window as any).electronAPI = {};
        try {
            expect(typeof Worker).toBe('undefined');
            expect(machineTranslationAvailable()).toBe(false);
        } finally {
            delete (window as any).electronAPI;
        }
    });
});
