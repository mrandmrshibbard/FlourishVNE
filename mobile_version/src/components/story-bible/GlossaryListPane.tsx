import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VNID } from '../../types';
import { VNProject, VNGlossaryEntry, VNGlossarySettings } from '../../types/project';
import { useProject } from '../../contexts/ProjectContext';
import { useToast } from '../../contexts/ToastContext';
import { ColorInput } from '../ui/Form';
import { PlusIcon, SparklesIcon } from '../icons';
import { newGlossaryId } from './StoryBibleManager';

const EXPORT_FORMAT = 'flourish-glossary';

/** Left pane (glossary mode): back button, searchable entry list, add/import/export, settings. */
const GlossaryListPane: React.FC<{
    project: VNProject;
    selectedEntryId: VNID | null;
    onSelect: (id: VNID) => void;
    onBack: () => void;
}> = ({ project, selectedEntryId, onSelect, onBack }) => {
    const { t } = useTranslation('storyBible');
    const { dispatch } = useProject();
    const toast = useToast();
    const [search, setSearch] = useState('');
    const fileRef = useRef<HTMLInputElement | null>(null);

    const entries = Object.values(project.glossary?.entries ?? {}) as VNGlossaryEntry[];
    const settings = project.glossary?.settings;
    const q = search.trim().toLowerCase();
    const filtered = q ? entries.filter(e => e.term.toLowerCase().includes(q) || (e.alternatives || []).some(a => a.toLowerCase().includes(q))) : entries;

    const addEntry = () => {
        const id = newGlossaryId();
        dispatch({ type: 'GLOSSARY_ADD_ENTRY', payload: { entry: { id, term: t('glossary.newTerm', 'New term') } } });
        onSelect(id);
    };

    const doExport = () => {
        const payload = {
            format: EXPORT_FORMAT,
            version: 1,
            settings: settings ?? {},
            entries,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(project.title || 'project').replace(/[^a-z0-9]/gi, '_').toLowerCase()}-glossary.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const doImport = async (file: File) => {
        try {
            const parsed = JSON.parse(await file.text());
            if (parsed?.format !== EXPORT_FORMAT || !Array.isArray(parsed.entries)) {
                toast.error(t('glossary.importError', "That file isn't a Flourish glossary."));
                return;
            }
            const clean: VNGlossaryEntry[] = parsed.entries
                .filter((e: any) => e && typeof e.term === 'string' && e.term.trim())
                .map((e: any): VNGlossaryEntry => ({
                    id: typeof e.id === 'string' && e.id ? e.id : newGlossaryId(),
                    term: String(e.term),
                    alternatives: Array.isArray(e.alternatives) ? e.alternatives.map(String).filter(Boolean) : undefined,
                    caseSensitive: e.caseSensitive === true || undefined,
                    title: typeof e.title === 'string' ? e.title : undefined,
                    description: typeof e.description === 'string' ? e.description : undefined,
                    extra: typeof e.extra === 'string' ? e.extra : undefined,
                    color: typeof e.color === 'string' ? e.color : undefined,
                    enabled: e.enabled === false ? false : undefined,
                }));
            const importSettings: VNGlossarySettings | undefined = parsed.settings && typeof parsed.settings === 'object'
                ? {
                    ...(typeof parsed.settings.defaultColor === 'string' ? { defaultColor: parsed.settings.defaultColor } : {}),
                    ...(parsed.settings.highlightStyle === 'color' || parsed.settings.highlightStyle === 'glow' || parsed.settings.highlightStyle === 'underline' ? { highlightStyle: parsed.settings.highlightStyle } : {}),
                }
                : undefined;
            dispatch({ type: 'GLOSSARY_IMPORT_ENTRIES', payload: { entries: clean, settings: importSettings } });
            toast.success(t('glossary.importSuccess', 'Imported {{count}} terms', { count: clean.length }));
        } catch {
            toast.error(t('glossary.importError', "That file isn't a Flourish glossary."));
        }
    };

    return (
        <div className="w-80 bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] flex flex-col flex-shrink-0">
            <div className="p-4 border-b border-[var(--border-subtle)] space-y-2">
                <button onClick={onBack} className="text-xs text-[var(--text-secondary)] hover:text-white transition-colors">
                    ← {t('glossary.back', 'Story Bible')}
                </button>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <SparklesIcon className="w-5 h-5 text-sky-300" />
                    {t('glossary.title', 'Glossary')}
                </h2>
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={t('glossary.search', 'Search terms…')}
                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-white outline-none focus:border-sky-500/60"
                />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filtered.map(e => (
                    <div
                        key={e.id}
                        onClick={() => onSelect(e.id)}
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                            selectedEntryId === e.id ? 'bg-sky-500/20 border border-sky-500/50' : 'hover:bg-[var(--bg-secondary)] border border-transparent'
                        } ${e.enabled === false ? 'opacity-50' : ''}`}
                    >
                        <span className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20" style={{ backgroundColor: e.color || settings?.defaultColor || '#7ee7ff' }} />
                        <span className="flex-1 text-sm truncate text-[var(--text-primary)]">{e.term}</span>
                        {(e.alternatives?.length ?? 0) > 0 && <span className="text-[10px] text-[var(--text-muted)]">+{e.alternatives!.length}</span>}
                    </div>
                ))}
                {filtered.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)] italic p-2">{q ? t('glossary.noResults', 'No terms match.') : t('glossary.none', 'No terms yet.')}</p>
                )}
            </div>
            <div className="p-2 border-t border-[var(--border-subtle)] space-y-2">
                <button onClick={addEntry} className="w-full bg-sky-500 hover:bg-sky-600 text-white p-2 rounded-md flex items-center justify-center gap-2 font-bold text-sm transition-colors">
                    <PlusIcon className="w-4 h-4" />
                    {t('glossary.addTerm', 'Add term')}
                </button>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => fileRef.current?.click()} className="px-2 py-1.5 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-sky-500/60">
                        {t('glossary.import', 'Import…')}
                    </button>
                    <button onClick={doExport} disabled={entries.length === 0} className="px-2 py-1.5 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-sky-500/60 disabled:opacity-40">
                        {t('glossary.export', 'Export')}
                    </button>
                </div>
                <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ''; }} />
                {/* Glossary-wide settings */}
                <div className="rounded-md border border-[var(--border-subtle)] p-2 space-y-2">
                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
                        <input type="checkbox" checked={settings?.enabled !== false}
                            onChange={e => dispatch({ type: 'GLOSSARY_UPDATE_SETTINGS', payload: { updates: { enabled: e.target.checked ? undefined : false } } })} />
                        {t('glossary.settings.enabled', 'Highlight glossary terms in the game')}
                    </label>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-secondary)] flex-1">{t('glossary.settings.defaultColor', 'Default colour')}</span>
                        <ColorInput value={settings?.defaultColor || '#7ee7ff'}
                            onChange={v => dispatch({ type: 'GLOSSARY_UPDATE_SETTINGS', payload: { updates: { defaultColor: v } } })} />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-secondary)] flex-1">{t('glossary.settings.style', 'How terms stand out')}</span>
                        <select
                            value={settings?.highlightStyle || 'underline'}
                            onChange={e => dispatch({ type: 'GLOSSARY_UPDATE_SETTINGS', payload: { updates: { highlightStyle: e.target.value as any } } })}
                            className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded px-1 py-0.5 text-xs text-white"
                        >
                            <option value="underline">{t('glossary.settings.styleUnderline', 'Underlined')}</option>
                            <option value="color">{t('glossary.settings.styleColor', 'Coloured text')}</option>
                            <option value="glow">{t('glossary.settings.styleGlow', 'Soft glow')}</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GlossaryListPane;
