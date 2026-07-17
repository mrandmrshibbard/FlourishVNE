import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VNProject, VNGlossaryEntry } from '../../types/project';
import { useProject } from '../../contexts/ProjectContext';
import { ColorInput, FormField, TextInput } from '../ui/Form';
import { TrashIcon } from '../icons';
import { compileGlossary } from '../../utils/glossaryMatcher';
import { revealHighlightStyle } from '../live-preview/AnimatedDialogueText';
import { GlossaryTooltip } from '../live-preview/GlossaryTooltip';

/** Right pane (glossary mode): the full entry form + a live preview of the in-game look. */
const GlossaryEntryEditor: React.FC<{
    project: VNProject;
    entry: VNGlossaryEntry;
    onDeleted: () => void;
}> = ({ project, entry, onDeleted }) => {
    const { t } = useTranslation('storyBible');
    const { dispatch } = useProject();
    const [altDraft, setAltDraft] = useState('');
    const [previewHover, setPreviewHover] = useState<{ x: number; y: number } | null>(null);

    const update = (updates: Partial<Omit<VNGlossaryEntry, 'id'>>) =>
        dispatch({ type: 'GLOSSARY_UPDATE_ENTRY', payload: { entryId: entry.id, updates } });

    const addAlternative = () => {
        const v = altDraft.trim();
        if (!v) return;
        const existing = entry.alternatives || [];
        if (!existing.some(a => a.toLowerCase() === v.toLowerCase())) {
            update({ alternatives: [...existing, v] });
        }
        setAltDraft('');
    };

    const settings = project.glossary?.settings;
    const accent = entry.color || settings?.defaultColor || '#7ee7ff';
    const style = settings?.highlightStyle || 'underline';

    // Live preview: run the REAL matcher over a sample line so authors see exactly what
    // players get (including whether their term actually matches).
    const previewLine = t('glossary.previewLine', 'They say the {{term}} appears only at night.', { term: entry.term || '…' });
    const previewSegments = useMemo(() => {
        const compiled = compileGlossary({ entries: { [entry.id]: { ...entry, enabled: true } }, settings });
        const matches = compiled?.findMatches(previewLine) ?? [];
        const parts: Array<{ text: string; hit: boolean }> = [];
        let cursor = 0;
        for (const m of matches) {
            if (m.start > cursor) parts.push({ text: previewLine.slice(cursor, m.start), hit: false });
            parts.push({ text: previewLine.slice(m.start, m.end), hit: true });
            cursor = m.end;
        }
        if (cursor < previewLine.length) parts.push({ text: previewLine.slice(cursor), hit: false });
        return parts;
    }, [entry, settings, previewLine]);

    return (
        <div className="p-6 space-y-4 max-w-2xl w-full mx-auto">
            <div className="flex items-center gap-2">
                <h3 className="flex-1 text-xl font-bold text-white truncate">{entry.term || t('glossary.newTerm', 'New term')}</h3>
                <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
                    <input type="checkbox" checked={entry.enabled !== false} onChange={e => update({ enabled: e.target.checked ? undefined : false })} />
                    {t('glossary.enabledEntry', 'Show in game')}
                </label>
                <button
                    onClick={() => { if (window.confirm(t('glossary.deleteConfirm', 'Delete "{{term}}" from the glossary?', { term: entry.term }))) { dispatch({ type: 'GLOSSARY_DELETE_ENTRY', payload: { entryId: entry.id } }); onDeleted(); } }}
                    className="p-1.5 text-red-400 hover:text-red-300 rounded hover:bg-red-500/10"
                    title={t('glossary.delete', 'Delete term')}
                >
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>

            {/* Live preview — hover the highlighted word to see the real tooltip. */}
            <div className="rounded-md border border-[var(--border-subtle)] bg-black/40 px-4 py-3 text-sm text-slate-100 relative">
                <span className="block text-[10px] text-[var(--text-muted)] mb-1">{t('glossary.preview', 'How it looks in the game (hover the word):')}</span>
                {previewSegments.map((p, i) => p.hit ? (
                    <span
                        key={i}
                        style={{ ...revealHighlightStyle({ color: accent, style }), cursor: 'help' }}
                        onMouseEnter={e => setPreviewHover({ x: e.clientX, y: e.clientY })}
                        onMouseMove={e => setPreviewHover({ x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setPreviewHover(null)}
                    >{p.text}</span>
                ) : <React.Fragment key={i}>{p.text}</React.Fragment>)}
                {previewHover && <GlossaryTooltip entry={entry} accentColor={accent} x={previewHover.x} y={previewHover.y} />}
                {!previewSegments.some(p => p.hit) && entry.term.trim() && (
                    <p className="text-[10px] text-amber-400/80 mt-1">{t('glossary.previewNoMatch', "The term didn't match the sample — check capital letters if Match capital letters is on.")}</p>
                )}
            </div>

            <FormField label={t('glossary.term', 'Word or phrase')}>
                <TextInput value={entry.term} onChange={e => update({ term: e.target.value })} />
            </FormField>

            <FormField label={t('glossary.alternatives', 'Other spellings or forms')}>
                <div className="flex flex-wrap gap-1.5 items-center">
                    {(entry.alternatives || []).map((a, i) => (
                        <span key={`${a}-${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-200 text-xs">
                            {a}
                            <button onClick={() => update({ alternatives: (entry.alternatives || []).filter((_, j) => j !== i) })} className="text-sky-300 hover:text-white leading-none">×</button>
                        </span>
                    ))}
                    <input
                        value={altDraft}
                        onChange={e => setAltDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addAlternative(); } }}
                        onBlur={addAlternative}
                        placeholder={t('glossary.alternativesHelp', 'e.g. the plural — press Enter to add')}
                        className="flex-1 min-w-[160px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-white outline-none focus:border-sky-500/60"
                    />
                </div>
            </FormField>

            <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] cursor-pointer">
                <input type="checkbox" checked={!!entry.caseSensitive} onChange={e => update({ caseSensitive: e.target.checked || undefined })} />
                {t('glossary.caseSensitive', 'Match capital letters exactly')}
            </label>

            <FormField label={t('glossary.color', 'Highlight colour')}>
                <div className="flex items-center gap-2">
                    <ColorInput value={accent} onChange={v => update({ color: v })} />
                    {entry.color && (
                        <button onClick={() => update({ color: undefined })} className="text-xs text-[var(--text-secondary)] hover:text-white underline">
                            {t('glossary.useDefaultColor', 'Use the default colour')}
                        </button>
                    )}
                </div>
            </FormField>

            <FormField label={t('glossary.tooltipTitle', 'Tooltip title (empty = the word itself)')}>
                <TextInput value={entry.title || ''} onChange={e => update({ title: e.target.value || undefined })} />
            </FormField>

            <FormField label={t('glossary.description', 'Explanation')}>
                <textarea
                    value={entry.description || ''}
                    onChange={e => update({ description: e.target.value || undefined })}
                    rows={4}
                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded px-2 py-1.5 text-sm text-white outline-none focus:border-sky-500/60 resize-y"
                />
            </FormField>

            <FormField label={t('glossary.extra', 'Small footnote (optional)')}>
                <TextInput value={entry.extra || ''} onChange={e => update({ extra: e.target.value || undefined })} />
            </FormField>
        </div>
    );
};

export default GlossaryEntryEditor;
