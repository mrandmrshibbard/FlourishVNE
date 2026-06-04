import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNProject } from '../types/project';
import { ExportManifest } from '../utils/projectPackager';

export const ImportSummaryModal: React.FC<{
    visible: boolean;
    project: VNProject | null;
    manifest?: ExportManifest;
    conflict: boolean;
    onCancel: () => void;
    onOverwrite: () => void;
    onRename: () => void;
    onSave: () => void; // for non-conflict save
}> = ({ visible, project, manifest, conflict, onCancel, onOverwrite, onRename, onSave }) => {
    const { t } = useTranslation('components');
    if (!visible || !project) return null;

    const e = manifest?.embedded || { backgrounds: [], images: [], audio: [], videos: [], characters: [], ui: [] };
    const failures: string[] = manifest?.fetchFailures || [];


    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-lg shadow-xl w-full max-w-2xl p-6">
                <h2 className="text-xl font-semibold mb-2">{t('importSummary.title')}</h2>
                <p className="text-sm text-[var(--text-secondary)] mb-4">{t('importSummary.intro')}</p>

                {manifest && (
                    <div className="mb-4 text-sm text-[var(--text-secondary)]">
                        <p>{t('importSummary.exportedAt', { date: new Date(manifest.exportedAt).toLocaleString() })}</p>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <p className="text-sm font-semibold">{t('importSummary.titleLabel')}</p>
                        <p className="truncate">{project.title}</p>
                    </div>
                    <div>
                        <p className="text-sm font-semibold">{t('importSummary.idLabel')}</p>
                        <p className="truncate">{project.id}</p>
                    </div>
                </div>

                <div className="mb-4">
                    <p className="text-sm font-semibold">{t('importSummary.embeddedAssets')}</p>
                    <ul className="text-sm text-[var(--text-secondary)] list-disc ml-5">
                        <li>{t('importSummary.backgrounds')}: {e.backgrounds?.length || 0}</li>
                        <li>{t('importSummary.images')}: {e.images?.length || 0}</li>
                        <li>{t('importSummary.audio')}: {e.audio?.length || 0}</li>
                        <li>{t('importSummary.videos')}: {e.videos?.length || 0}</li>
                        <li>{t('importSummary.characters')}: {e.characters?.length || 0}</li>
                        <li>{t('importSummary.uiImages')}: {e.ui?.length || 0}</li>
                    </ul>
                </div>

                {failures.length > 0 && (
                    <div className="mb-4">
                        <p className="text-sm font-semibold text-amber-400">{t('importSummary.warnings')}</p>
                        <p className="text-sm text-[var(--text-secondary)]">{t('importSummary.warningsDesc')}</p>
                        <ul className="text-sm text-[var(--text-secondary)] list-disc ml-5 max-h-28 overflow-auto mt-2">
                            {failures.slice(0, 20).map((f, i) => <li key={i}>{f}</li>)}
                            {failures.length > 20 && <li>{t('importSummary.andMore', { count: failures.length - 20 })}</li>}
                        </ul>
                    </div>
                )}

                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/90">{t('importSummary.cancel')}</button>
                    {!conflict ? (
                        <button onClick={onSave} className="px-4 py-2 rounded bg-[var(--accent-cyan)] text-white">{t('importSummary.importSave')}</button>
                    ) : (
                        <>
                            <button onClick={onRename} className="px-4 py-2 rounded bg-[var(--accent-purple)] text-white">{t('importSummary.importCopy')}</button>
                            <button onClick={onOverwrite} className="px-4 py-2 rounded bg-[var(--accent-pink)] text-white">{t('importSummary.overwrite')}</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportSummaryModal;
