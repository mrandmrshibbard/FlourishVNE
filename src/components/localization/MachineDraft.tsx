/**
 * "Draft with machine translation".
 *
 * 🔴 The framing is the feature. Ren'Py's own documentation recommends against shipping machine
 * translation, and it's right — so this is presented as a first draft to edit, never as a finished
 * translation. The button says "Draft", results are flagged for review everywhere they appear, and
 * the confirmation says plainly that it should be read before players see it.
 *
 * The one-time download is gated: an author is told the size and asked, rather than discovering a
 * few hundred megabytes going out over a metered connection. Same pattern as the Android toolchain.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VNProject } from '../../types/project';
import { machineTranslateProject, summarizeMachineTranslation, MachineTranslateReport } from '../../features/localization/machineTranslate';
import { MachineTranslator, ModelProgress, canMachineTranslate, machineTranslationAvailable } from '../../features/localization/mtEngine';

interface Props {
    project: VNProject;
    language: string;
    languageName: string;
    /** Called with the drafted project; the caller dispatches it. */
    onDrafted: (next: VNProject) => void;
}

const MachineDraft: React.FC<Props> = ({ project, language, languageName, onDrafted }) => {
    const { t } = useTranslation('contextPanels');
    const sourceLanguage = (project as any).localization?.sourceLanguage || 'en';

    const [confirming, setConfirming] = useState(false);
    const [running, setRunning] = useState(false);
    const [modelProgress, setModelProgress] = useState<ModelProgress | null>(null);
    const [lineProgress, setLineProgress] = useState<{ done: number; total: number } | null>(null);
    const [report, setReport] = useState<MachineTranslateReport | null>(null);
    const [error, setError] = useState<string | null>(null);

    const translatorRef = useRef<MachineTranslator | null>(null);
    const signalRef = useRef<{ aborted: boolean }>({ aborted: false });

    // A run outlives any single render, so the worker is torn down on unmount, not on re-render.
    useEffect(() => () => { translatorRef.current?.dispose(); }, []);

    if (!machineTranslationAvailable() || !canMachineTranslate(sourceLanguage, language)) {
        return null;
    }

    const start = async () => {
        setConfirming(false);
        setError(null);
        setReport(null);
        setRunning(true);
        signalRef.current = { aborted: false };

        const translator = new MachineTranslator(setModelProgress);
        translatorRef.current = translator;

        try {
            const { project: next, report: result } = await machineTranslateProject(project, translator.translate, {
                language,
                onProgress: (done, total) => setLineProgress({ done, total }),
                signal: signalRef.current,
            });
            setReport(result);
            if (result.translated > 0) onDrafted(next);
        } catch (e: any) {
            setError(e?.message || t('localizationPanel.mtFailed', 'The translator could not be started.'));
        } finally {
            translator.dispose();
            translatorRef.current = null;
            setRunning(false);
            setModelProgress(null);
            setLineProgress(null);
        }
    };

    const stop = () => { signalRef.current.aborted = true; };

    if (running) {
        const downloading = modelProgress && modelProgress.status !== 'ready' && modelProgress.percent != null;
        return (
            <div className="rounded border border-slate-600 bg-slate-800/60 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-200">
                        {downloading
                            ? t('localizationPanel.mtDownloading', 'Getting the {{language}} translator ready… {{percent}}%',
                                { language: languageName, percent: modelProgress!.percent })
                            : lineProgress
                                ? t('localizationPanel.mtWorking', 'Drafting… {{done}} of {{total}}', lineProgress)
                                : t('localizationPanel.mtStarting', 'Starting…')}
                    </span>
                    <button onClick={stop} className="shrink-0 rounded bg-slate-700 px-3 py-1 text-slate-100 hover:bg-slate-600">
                        {t('localizationPanel.mtStop', 'Stop')}
                    </button>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                    {t('localizationPanel.mtKeepWorking', 'Drafting — One Moment.')}
                </p>
            </div>
        );
    }

    if (confirming) {
        return (
            <div className="rounded border border-slate-600 bg-slate-800/60 p-3 text-sm">
                <p className="mb-2 text-slate-200">
                    {t('localizationPanel.mtConfirm',
                        'This writes a first draft of every untranslated line into {{language}}. It is a starting point to edit, not a finished translation — every line will be marked for review.',
                        { language: languageName })}
                </p>
                <p className="mb-2 rounded border border-amber-500/40 bg-amber-950/30 px-2 py-1.5 text-xs text-amber-200">
                    {t('localizationPanel.mtAccuracyWarning',
                        '⚠ Machine translation is often inaccurate. It gets tone, names and idioms wrong, and can state the opposite of what was meant. It is HIGHLY recommended that someone who speaks the language reviews every line before you publish.')}
                </p>
                <p className="mb-3 text-xs text-slate-400">
                    {t('localizationPanel.mtDownloadNote',
                        'The first time you use a language, its translator is downloaded (usually 40–80 MB). After that it works offline.')}
                </p>
                <div className="flex justify-end gap-2">
                    <button onClick={() => setConfirming(false)}
                        className="rounded bg-slate-700 px-3 py-1.5 text-slate-100 hover:bg-slate-600">
                        {t('localizationPanel.cancel', 'Cancel')}
                    </button>
                    <button onClick={start}
                        className="rounded bg-sky-600 px-3 py-1.5 text-white hover:bg-sky-500">
                        {t('localizationPanel.mtGo', 'Download and draft')}
                    </button>
                </div>
            </div>
        );
    }

    /* A standing warning whenever this language HAS machine drafts in it — not just in the moments
     * after a run. The risk isn't at the moment of drafting, it's weeks later when an author has
     * forgotten which lines a machine wrote and is about to publish. */
    const machineCount = Object.values<any>((project as any).localization?.strings || {})
        .filter(byLang => byLang?.[language]?.origin === 'machine' && byLang[language]?.needsReview).length;

    return (
        <div className="space-y-2">
            <button onClick={() => setConfirming(true)}
                className="rounded bg-sky-700 px-3 py-1 text-sm text-white hover:bg-sky-600">
                {t('localizationPanel.mtButton', 'Draft with machine translation')}
            </button>

            {machineCount > 0 && (
                <div className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
                    <span aria-hidden>⚠</span>
                    <span>
                        <strong className="font-medium">
                            {t('localizationPanel.mtStandingWarningTitle',
                                '{{count}} lines in {{language}} were written by a machine and have not been checked.',
                                { count: machineCount, language: languageName })}
                        </strong>{' '}
                        {t('localizationPanel.mtStandingWarning',
                            'Machine translation regularly gets tone, names and idioms wrong, and sometimes states the opposite of what was meant. It is HIGHLY recommended that you or a translator review every line before you publish. Use the "Needs review" filter, then mark each one "Looks good".')}
                    </span>
                </div>
            )}

            {error && (
                <div className="rounded bg-rose-950/40 px-2 py-1 text-sm text-rose-200">{error}</div>
            )}

            {report && (
                <div className="rounded border border-slate-600 bg-slate-800/60 p-3 text-sm">
                    <div className="font-medium text-slate-100">{summarizeMachineTranslation(report)}</div>
                    <p className="mt-1 text-xs text-amber-400/90">
                        {t('localizationPanel.mtReviewNote',
                            'Machine translation gets the gist, not the tone. Read these before players do — use the "Needs review" filter.')}
                    </p>
                    {report.rejected.length > 0 && (
                        <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                            {report.rejected.map((line, i) => (
                                <div key={i} className="rounded bg-slate-900/60 px-2 py-1 text-xs">
                                    <span className="text-slate-400">{line.where}: </span>
                                    <span className="text-slate-200">{line.reason}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MachineDraft;
