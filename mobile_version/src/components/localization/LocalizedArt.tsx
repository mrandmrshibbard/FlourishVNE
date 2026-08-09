/**
 * Per-language artwork.
 *
 * Some pictures have words baked into them — a shop sign, a newspaper, a logo — and translating the
 * script leaves those in the original language. Both Ren'Py and Visual Novel Maker solve this with
 * naming conventions (a `tl/ja/` folder, or a `_ja` filename suffix), which means an author has to
 * learn a rule and get it exactly right with no feedback if they don't. Here it's a picker: choose
 * the replacement, see it immediately.
 *
 * The runtime does the swap by REPOINTING the original asset id at the replacement's file, so every
 * command, screen and character that referenced the original keeps working untouched.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';

interface Props {
    project: VNProject;
    language: string;
    languageName: string;
    /** Full replacement map for this language: original asset id → replacement asset id. */
    overrides: Record<string, string>;
    onChange: (overrides: Record<string, string>) => void;
}

type Entry = { id: VNID; name: string; url?: string; collection: 'images' | 'backgrounds' };

const LocalizedArt: React.FC<Props> = ({ project, language, languageName, overrides, onChange }) => {
    const { t } = useTranslation('contextPanels');
    const [search, setSearch] = useState('');
    const [onlyTranslated, setOnlyTranslated] = useState(false);

    const entries = useMemo<Entry[]>(() => {
        const out: Entry[] = [];
        for (const collection of ['backgrounds', 'images'] as const) {
            for (const asset of Object.values<any>((project as any)[collection] || {})) {
                if (!asset?.id) continue;
                out.push({ id: asset.id, name: asset.name || asset.id, url: asset.imageUrl, collection });
            }
        }
        return out.sort((a, b) => a.name.localeCompare(b.name));
    }, [project]);

    const visible = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return entries.filter(entry => {
            if (onlyTranslated && !overrides[entry.id]) return false;
            if (needle && !entry.name.toLowerCase().includes(needle)) return false;
            return true;
        });
    }, [entries, search, onlyTranslated, overrides]);

    const setOverride = (originalId: VNID, replacementId: string) => {
        const next = { ...overrides };
        // Picking the original back, or nothing, REMOVES the entry rather than storing a no-op —
        // otherwise the saved project slowly fills with overrides that do nothing.
        if (!replacementId || replacementId === originalId) delete next[originalId];
        else next[originalId] = replacementId;
        onChange(next);
    };

    const replacementFor = (entry: Entry): Entry | undefined =>
        entries.find(e => e.id === overrides[entry.id]);

    if (!entries.length) {
        return (
            <div className="py-10 text-center text-sm text-slate-400">
                {t('localizationPanel.artNoAssets', 'This game has no pictures yet.')}
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 px-4 py-2">
                <p className="mr-auto text-xs text-slate-400">
                    {t('localizationPanel.artIntro',
                        'If a picture has words in it — a sign, a logo — choose the {{language}} version here. Everything that used the original will show the new one.',
                        { language: languageName })}
                </p>
                <label className="flex items-center gap-1 text-xs text-slate-300">
                    <input type="checkbox" checked={onlyTranslated} onChange={e => setOnlyTranslated(e.target.checked)} />
                    {t('localizationPanel.artOnlySwapped', 'Only ones I have swapped')}
                </label>
                <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder={t('localizationPanel.search', 'Search…')}
                    className="w-40 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100" />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
                {visible.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-400">
                        {t('localizationPanel.noRows', 'Nothing here — try a different filter.')}
                    </div>
                ) : visible.map(entry => {
                    const replacement = replacementFor(entry);
                    return (
                        <div key={entry.id} className="mb-2 flex items-center gap-3 rounded border border-slate-700 bg-slate-800/40 p-2">
                            <div className="flex w-40 shrink-0 items-center gap-2">
                                {entry.url
                                    ? <img src={entry.url} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />
                                    : <div className="h-10 w-16 shrink-0 rounded bg-slate-700" />}
                                <span className="truncate text-xs text-slate-300" title={entry.name}>{entry.name}</span>
                            </div>

                            <span className="shrink-0 text-slate-500" aria-hidden>→</span>

                            <select
                                value={overrides[entry.id] || ''}
                                onChange={e => setOverride(entry.id, e.target.value)}
                                className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                            >
                                <option value="">
                                    {t('localizationPanel.artSame', 'Same picture as the original')}
                                </option>
                                {entries.filter(other => other.id !== entry.id).map(other => (
                                    <option key={other.id} value={other.id}>{other.name}</option>
                                ))}
                            </select>

                            {replacement && (
                                replacement.url
                                    ? <img src={replacement.url} alt="" className="h-10 w-16 shrink-0 rounded object-cover ring-1 ring-emerald-500" />
                                    : <div className="h-10 w-16 shrink-0 rounded bg-slate-700 ring-1 ring-emerald-500" />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default LocalizedArt;
