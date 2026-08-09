/**
 * The main-thread side of machine translation: owns the worker, and hands back a `Translator`
 * that `machineTranslateProject` can drive without knowing any of this exists.
 *
 * Everything model-specific is here. The rest of the feature is model-agnostic and tested with a
 * fake translator, so if transformers.js is ever swapped out, this file is the only casualty.
 */

/** Which Helsinki OPUS-MT model translates a given pair. */
export function modelFor(from: string, to: string): string | null {
    // Models are single-direction and named by base language, so region suffixes are dropped:
    // pt-BR uses the en→pt model, zh-CN the en→zh one.
    const base = (code: string) => (code || '').split('-')[0].toLowerCase();
    const source = base(from), target = base(to);
    if (!source || !target || source === target) return null;
    return `Xenova/opus-mt-${source}-${target}`;
}

/**
 * Language pairs we advertise. Helsinki publishes hundreds, but only the ones actually converted to
 * ONNX under the `Xenova` account will load — offering a pair that 404s on download is a worse
 * experience than not offering it, so this list stays conservative and English-sourced.
 */
const SUPPORTED_FROM_EN = ['es', 'fr', 'de', 'it', 'pt', 'ru', 'uk', 'ja', 'zh', 'ar', 'nl', 'pl', 'tr', 'fi', 'sv', 'cs', 'hi', 'id', 'vi', 'ko'];

export function canMachineTranslate(from: string, to: string): boolean {
    const base = (code: string) => (code || '').split('-')[0].toLowerCase();
    if (base(from) !== 'en') return false;             // v1: English source only
    return SUPPORTED_FROM_EN.includes(base(to));
}

export interface ModelProgress {
    status: string;
    file?: string;
    percent?: number;
    loaded?: number;
    total?: number;
}

type Pending = { resolve: (texts: string[]) => void; reject: (error: Error) => void };

/**
 * A worker-backed translator.
 *
 * Deliberately a small class rather than a hook: a long translation run outlives any one render,
 * and tying the worker's life to a component would kill the job on a re-render.
 */
export class MachineTranslator {
    private worker: Worker | null = null;
    private pending = new Map<number, Pending>();
    private nextId = 1;
    private onProgress?: (progress: ModelProgress) => void;

    constructor(onProgress?: (progress: ModelProgress) => void) {
        this.onProgress = onProgress;
    }

    private ensureWorker(): Worker {
        if (this.worker) return this.worker;
        // `new URL(..., import.meta.url)` is how Vite finds and bundles a worker.
        this.worker = new Worker(new URL('./mtWorker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (event: MessageEvent<any>) => {
            const message = event.data;
            if (message?.type === 'progress') { this.onProgress?.(message); return; }
            if (message?.type === 'result') {
                this.pending.get(message.id)?.resolve(message.texts || []);
                this.pending.delete(message.id);
                return;
            }
            if (message?.type === 'error') {
                const error = new Error(message.message || 'The translator failed.');
                if (message.id != null) {
                    this.pending.get(message.id)?.reject(error);
                    this.pending.delete(message.id);
                } else {
                    // A failure with no id is a load failure — fail everything waiting, or they
                    // hang forever.
                    for (const [, pending] of this.pending) pending.reject(error);
                    this.pending.clear();
                }
            }
        };
        this.worker.onerror = () => {
            const error = new Error('The translator stopped unexpectedly.');
            for (const [, pending] of this.pending) pending.reject(error);
            this.pending.clear();
        };
        return this.worker;
    }

    /** Download + start a model ahead of time, so the size warning can be shown before committing. */
    async load(from: string, to: string): Promise<void> {
        const model = modelFor(from, to);
        if (!model) throw new Error('There is no translator for that pair of languages.');
        const worker = this.ensureWorker();
        await new Promise<void>((resolve, reject) => {
            const onMessage = (event: MessageEvent<any>) => {
                if (event.data?.type === 'ready') { cleanup(); resolve(); }
                else if (event.data?.type === 'error' && event.data.id == null) {
                    cleanup(); reject(new Error(event.data.message));
                }
            };
            const cleanup = () => worker.removeEventListener('message', onMessage);
            worker.addEventListener('message', onMessage);
            worker.postMessage({ type: 'load', model });
        });
    }

    /** The function `machineTranslateProject` calls. */
    translate = async (texts: string[], from: string, to: string): Promise<string[]> => {
        const model = modelFor(from, to);
        if (!model) throw new Error('There is no translator for that pair of languages.');
        const worker = this.ensureWorker();
        const id = this.nextId++;
        return new Promise<string[]>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            worker.postMessage({ type: 'translate', id, texts, model });
        });
    };

    /** Stop the worker and fail anything still waiting. Safe to call more than once. */
    dispose(): void {
        for (const [, pending] of this.pending) pending.reject(new Error('Translation was stopped.'));
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
    }
}

/** Machine translation needs a worker and a lot of storage, so it's desktop-only for now. */
export function machineTranslationAvailable(): boolean {
    return typeof window !== 'undefined'
        && !!(window as any).electronAPI
        && typeof Worker !== 'undefined';
}
