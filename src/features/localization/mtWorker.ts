/**
 * The machine-translation worker.
 *
 * 🔴 This is the codebase's first Web Worker, and it exists for one reason: running a translation
 * model takes seconds per batch, and on the main thread that freezes the whole editor — no typing,
 * no scrolling, no Cancel button. A worker keeps the app responsive while a few hundred lines are
 * drafted, which is the difference between a usable feature and one people abandon halfway.
 *
 * transformers.js is imported DYNAMICALLY (~45 MB of ONNX runtime lives behind it). Nothing is
 * loaded until an author actually asks for a translation, so the editor's startup cost is zero for
 * everyone who never uses this.
 *
 * Models come from Hugging Face on demand and are cached by transformers.js itself. That's why
 * there's no bespoke downloader here: it already handles resuming, caching and progress, and a
 * second implementation would just be more to get wrong.
 */

/** Messages in. */
type Incoming =
    | { type: 'load'; model: string }
    | { type: 'translate'; id: number; texts: string[]; model: string };

/** Messages out. */
type Outgoing =
    | { type: 'progress'; status: string; file?: string; loaded?: number; total?: number; percent?: number }
    | { type: 'ready'; model: string }
    | { type: 'result'; id: number; texts: string[] }
    | { type: 'error'; id?: number; message: string };

const post = (message: Outgoing) => (self as any).postMessage(message);

/** One loaded pipeline per model, so switching languages doesn't reload what's already here. */
const pipelines = new Map<string, any>();
let transformers: any = null;

async function loadTransformers() {
    if (transformers) return transformers;
    transformers = await import('@xenova/transformers');
    // Models are fetched from the hub and cached by the library; we never look for local files.
    transformers.env.allowLocalModels = false;
    transformers.env.useBrowserCache = true;
    return transformers;
}

async function getPipeline(model: string) {
    const existing = pipelines.get(model);
    if (existing) return existing;

    const { pipeline } = await loadTransformers();
    const instance = await pipeline('translation', model, {
        quantized: true,                       // int8: ~4x smaller download, no meaningful quality loss here
        progress_callback: (report: any) => {
            post({
                type: 'progress',
                status: report?.status || 'loading',
                file: report?.file,
                loaded: report?.loaded,
                total: report?.total,
                percent: typeof report?.progress === 'number' ? Math.round(report.progress) : undefined,
            });
        },
    });
    pipelines.set(model, instance);
    return instance;
}

self.onmessage = async (event: MessageEvent<Incoming>) => {
    const message = event.data;
    try {
        if (message.type === 'load') {
            await getPipeline(message.model);
            post({ type: 'ready', model: message.model });
            return;
        }

        if (message.type === 'translate') {
            const translate = await getPipeline(message.model);
            /* One call per line rather than one for the batch: these models take a single string,
             * and batching them into an array makes some of them cross-contaminate lines. The
             * caller's batch size still controls how often it hears back. */
            const texts: string[] = [];
            for (const text of message.texts) {
                try {
                    const output = await translate(text);
                    const first = Array.isArray(output) ? output[0] : output;
                    texts.push(String(first?.translation_text ?? ''));
                } catch {
                    // An empty string means "couldn't do this line" — the caller rejects it and
                    // reports it, rather than the whole batch being lost.
                    texts.push('');
                }
            }
            post({ type: 'result', id: message.id, texts });
        }
    } catch (error: any) {
        post({
            type: 'error',
            id: (message as any).id,
            message: error?.message || 'The translator could not be started.',
        });
    }
};

export {};
