/**
 * "Review each change before applying" — the optional diff view.
 *
 * Deliberately OPT-IN and off by default (Brad's call): forcing a review screen on someone who
 * just wants their translator's file brought in is friction, and friction is the thing this whole
 * feature exists to remove. When it IS on, every change shows old → new with per-row accept/reject
 * plus accept-all and reject-all, so a long file doesn't become a hundred clicks.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImportChange } from '../../features/localization/translationSheet';

interface Props {
    changes: ImportChange[];
    onApply: (accepted: ImportChange[]) => void;
    onCancel: () => void;
}

const ReviewChanges: React.FC<Props> = ({ changes, onApply, onCancel }) => {
    const { t } = useTranslation('contextPanels');
    const [rejected, setRejected] = useState<Set<string>>(new Set());

    const toggle = (key: string) => setRejected(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    const accepted = changes.filter(c => !rejected.has(c.key));

    return (
        <div className="flex h-full flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-slate-300">
                    {t('localizationPanel.reviewCount', '{{accepted}} of {{total}} changes will be applied', {
                        accepted: accepted.length, total: changes.length,
                    })}
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setRejected(new Set())}
                        className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100 hover:bg-slate-600">
                        {t('localizationPanel.acceptAll', 'Accept all')}
                    </button>
                    <button onClick={() => setRejected(new Set(changes.map(c => c.key)))}
                        className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100 hover:bg-slate-600">
                        {t('localizationPanel.rejectAll', 'Reject all')}
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
                {changes.map(change => {
                    const isRejected = rejected.has(change.key);
                    return (
                        <div key={change.key}
                            className={`rounded border p-2 text-sm ${isRejected ? 'border-slate-700 bg-slate-900/40 opacity-60' : 'border-slate-600 bg-slate-800/50'}`}>
                            <div className="mb-1 flex items-start justify-between gap-2">
                                <span className="text-xs text-slate-400">{change.where}</span>
                                <label className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-slate-300">
                                    <input type="checkbox" checked={!isRejected} onChange={() => toggle(change.key)} />
                                    {t('localizationPanel.include', 'Include')}
                                </label>
                            </div>
                            <div className="text-slate-400">{change.source}</div>
                            {change.before && (
                                <div className="mt-1 text-rose-300/80 line-through">{change.before}</div>
                            )}
                            <div className="mt-1 text-emerald-300">{change.after}</div>
                            {change.stale && (
                                <div className="mt-1 text-xs text-amber-400">
                                    {t('localizationPanel.staleNote', 'Translated from an older version of this line.')}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="flex justify-end gap-2">
                <button onClick={onCancel}
                    className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-600">
                    {t('localizationPanel.cancel', 'Cancel')}
                </button>
                <button onClick={() => onApply(accepted)} disabled={!accepted.length}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-50">
                    {t('localizationPanel.applyAccepted', 'Apply {{count}} changes', { count: accepted.length })}
                </button>
            </div>
        </div>
    );
};

export default ReviewChanges;
