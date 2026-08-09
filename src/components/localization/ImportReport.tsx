/**
 * What happened when a translator's file came back.
 *
 * The old panel showed a message that vanished on its own, so an author who looked away missed
 * the only report they were going to get. This one stays until it's dismissed, and every row that
 * did NOT make it into the project is listed with a reason written for the author rather than for
 * a developer — the ✓/✖ running-log pattern the Plugin Manager already uses.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ImportResult, summarizeImport } from '../../features/localization/translationSheet';

interface Props {
    result: ImportResult;
    onDismiss: () => void;
}

const ImportReport: React.FC<Props> = ({ result, onDismiss }) => {
    const { t } = useTranslation('contextPanels');
    const blocking = result.issues.filter(i => i.blocking);
    const advisory = result.issues.filter(i => !i.blocking);

    return (
        <div className="rounded-lg border border-slate-600 bg-slate-800/60 p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="font-medium text-slate-100">
                        {t('localizationPanel.reportTitle', 'Import finished')}
                    </div>
                    <div className="text-slate-300">{summarizeImport(result)}</div>
                </div>
                <button
                    onClick={onDismiss}
                    className="shrink-0 rounded px-2 py-1 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
                    aria-label={t('localizationPanel.dismissReport', 'Dismiss this report')}
                >
                    ✕
                </button>
            </div>

            {(blocking.length > 0 || advisory.length > 0) && (
                <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
                    {blocking.map((issue, i) => (
                        <div key={`b${i}`} className="flex gap-2 rounded bg-rose-950/40 px-2 py-1">
                            <span className="text-rose-400" aria-hidden>✖</span>
                            <span className="text-slate-200">
                                <span className="text-slate-400">
                                    {issue.sheet} {t('localizationPanel.rowLabel', 'row')} {issue.row}:{' '}
                                </span>
                                {issue.message}
                            </span>
                        </div>
                    ))}
                    {advisory.map((issue, i) => (
                        <div key={`a${i}`} className="flex gap-2 rounded bg-amber-950/30 px-2 py-1">
                            <span className="text-amber-400" aria-hidden>!</span>
                            <span className="text-slate-200">
                                <span className="text-slate-400">
                                    {issue.sheet} {t('localizationPanel.rowLabel', 'row')} {issue.row}:{' '}
                                </span>
                                {issue.message}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {blocking.length > 0 && (
                <p className="mt-2 text-xs text-slate-400">
                    {t('localizationPanel.nothingElseChanged',
                        'Everything else was brought in. Nothing above was changed in your story — fix those rows in the spreadsheet and import it again.')}
                </p>
            )}
        </div>
    );
};

export default ImportReport;
