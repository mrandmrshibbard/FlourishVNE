/**
 * Drafting a language with machine translation.
 *
 * The model itself is INJECTED — this module only knows how to feed it safely and what to do with
 * what comes back. That keeps the whole risky part of the feature (token mangling, bad results,
 * cancellation, progress) pure and testable without downloading a 40 MB model, and it means the
 * backend can be swapped later without touching any of this.
 *
 * 🔴 The stance, which the wording everywhere else follows: this produces a DRAFT. Ren'Py's own
 * docs recommend against shipping machine translation, and they're right. Every result is stored
 * `origin: 'machine'` + `needsReview: true`, so it's visibly unreviewed in the workspace and the
 * build validator mentions it. The button says "Draft with machine translation", not "Translate".
 */
import { VNProject } from '../../types/project';
import { collectTranslatableText, TextSite } from './walkTranslatable';
import { protectTokens, restoreTokens, compareTokens, MARKER_STYLE_COUNT } from './tokenGuard';
import { applyTranslations } from './store';
import { ImportChange } from './translationSheet';

/**
 * Translate a batch of already-protected lines.
 *
 * Must return one result per input, in the same order. Anything it can't translate should come
 * back as an empty string rather than throwing, so one bad line doesn't lose the whole batch.
 */
export type Translator = (texts: string[], from: string, to: string) => Promise<string[]>;

export interface MachineTranslateOptions {
    language: string;
    /** Re-draft lines that already have a translation (default false — never overwrite work). */
    includeTranslated?: boolean;
    /** Lines per call to the model. */
    batchSize?: number;
    onProgress?: (done: number, total: number) => void;
    /** Cancel a long run; whatever finished is still applied. */
    signal?: { aborted: boolean };
}

export interface RejectedLine {
    key: string;
    where: string;
    source: string;
    reason: string;
}

export interface MachineTranslateReport {
    /** Lines drafted and applied. */
    translated: number;
    /** Lines left alone because a translation already existed. */
    skipped: number;
    /** Lines the model returned something unusable for — left untranslated, never half-applied. */
    rejected: RejectedLine[];
    /** Lines that failed once and were saved by retrying with a different placeholder shape. */
    recovered: number;
    cancelled: boolean;
}

const DEFAULT_BATCH = 16;

/**
 * Draft `language` for every untranslated line.
 *
 * Returns a NEW project; the original is untouched. A line is only accepted if its tokens survive
 * intact — otherwise it's reported and left untranslated, because a missing translation is a small
 * problem and a broken one shipped to players is not.
 */
export async function machineTranslateProject(
    project: VNProject,
    translator: Translator,
    options: MachineTranslateOptions,
): Promise<{ project: VNProject; report: MachineTranslateReport }> {
    const sourceLanguage = (project as any).localization?.sourceLanguage || 'en';
    const strings = (project as any).localization?.strings || {};
    const report: MachineTranslateReport = { translated: 0, skipped: 0, rejected: [], recovered: 0, cancelled: false };

    const pending: TextSite[] = [];
    for (const site of collectTranslatableText(project)) {
        if (!options.includeTranslated && strings[site.key]?.[options.language]?.text) {
            report.skipped++;
            continue;
        }
        pending.push(site);
    }

    const changes: ImportChange[] = [];
    const batchSize = Math.max(1, options.batchSize || DEFAULT_BATCH);
    let done = 0;

    /**
     * Try one line on its own with a different marker shape.
     *
     * 🔴 Added after real drafting dropped lines like "It took {Clicks} pats and gave {Affection}
     * affection" — the model reformatted the placeholder, so a perfectly good translation was
     * thrown away. Marker shapes fail for different reasons, so a retry recovers most of them.
     */
    const retryLine = async (site: TextSite, primaryReason: string): Promise<{ text: string } | { reason: string }> => {
        /* If every retry also fails, report the FIRST failure. That's the diagnostic one — the
         * retries are an internal recovery attempt, and telling the author about the last of them
         * would describe a request they never made. */
        let lastReason = primaryReason;
        for (let style = 1; style < MARKER_STYLE_COUNT; style++) {
            if (options.signal?.aborted) break;
            const guarded = protectTokens(site.value, style);
            let out: string[];
            try {
                out = await translator([guarded.text], sourceLanguage, options.language);
            } catch (error: any) {
                lastReason = error?.message || lastReason;
                continue;
            }
            const raw = (out?.[0] ?? '').trim();
            if (!raw) continue;
            const restored = restoreTokens(raw, guarded.tokens, style);
            if (!restored.ok) continue;
            if (!compareTokens(site.value, restored.text).ok) continue;
            if (restored.text === site.value) continue;
            return { text: restored.text };
        }
        return { reason: lastReason };
    };

    for (let start = 0; start < pending.length; start += batchSize) {
        if (options.signal?.aborted) { report.cancelled = true; break; }

        const batch = pending.slice(start, start + batchSize);
        const protectedTexts = batch.map(site => protectTokens(site.value));

        let results: string[];
        try {
            results = await translator(protectedTexts.map(p => p.text), sourceLanguage, options.language);
        } catch (error: any) {
            // A failed batch is reported line by line rather than aborting the run — a transient
            // model error shouldn't throw away the batches that already succeeded.
            for (const site of batch) {
                report.rejected.push({
                    key: site.key, where: site.where, source: site.value,
                    reason: error?.message || 'the translator failed',
                });
            }
            done += batch.length;
            options.onProgress?.(done, pending.length);
            continue;
        }

        for (let i = 0; i < batch.length; i++) {
            const site = batch[i];
            const reject = (reason: string) =>
                report.rejected.push({ key: site.key, where: site.where, source: site.value, reason });
            const accept = (text: string) => {
                changes.push({
                    key: site.key, where: site.where, source: site.value,
                    before: '', after: text, stale: false, translatedFrom: site.value,
                });
                report.translated++;
            };

            const raw = (results?.[i] ?? '').trim();
            const restored = raw ? restoreTokens(raw, protectedTexts[i].tokens) : null;
            const usable = !!restored?.ok
                && compareTokens(site.value, restored.text).ok
                && restored.text !== site.value;

            if (usable) { accept(restored!.text); continue; }

            const primaryReason =
                !raw ? 'the translator returned nothing'
                : restored && !restored.ok ? (restored.reason || 'the codes in the line were mangled')
                : restored?.text === site.value ? 'the translator returned the original text'
                : 'the codes in the line were mangled';

            // Only worth retrying when the line HAS tokens — that's the failure a different marker
            // shape can fix. A line with none failed for some other reason, and asking again would
            // just cost time for the same answer.
            if (protectedTexts[i].tokens.length && !options.signal?.aborted) {
                const retried = await retryLine(site, primaryReason);
                if ('text' in retried) { accept(retried.text); report.recovered++; continue; }
                reject(retried.reason);
                continue;
            }

            reject(primaryReason);
        }

        done += batch.length;
        options.onProgress?.(done, pending.length);
    }

    return {
        project: applyTranslations(project, changes, { language: options.language, origin: 'machine' }),
        report,
    };
}

/** A short, plain summary for the panel. */
export function summarizeMachineTranslation(report: MachineTranslateReport): string {
    const parts = [`${report.translated} ${report.translated === 1 ? 'line' : 'lines'} drafted`];
    if (report.skipped) parts.push(`${report.skipped} already translated`);
    if (report.recovered) parts.push(`${report.recovered} needed a second attempt`);
    if (report.rejected.length) parts.push(`${report.rejected.length} skipped as unsafe`);
    if (report.cancelled) parts.push('stopped early');
    return parts.join(' · ');
}
