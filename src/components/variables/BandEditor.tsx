/**
 * Give the numbers names — the band editor.
 *
 * This is boolean labels, but for numbers. An author who writes `Affection` as a 0–100 number has no
 * way to say what 34 MEANS; here they say it once ("21 and up is a Friend") and the whole app starts
 * speaking in their words: conditions read "when Yuki is a Friend or better", {Yuki} in dialogue can
 * print "Friend", the live tracker shows "Friend (34)", and a meter can wear the band's colour.
 *
 * Used by both variable editors (VariableManager + VariablePropertiesEditor).
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNID } from '../../types';
import { VNVariable, VNVariableBand, VNVariableShowAs } from '../../features/variables/types';
import { sortedBands, bandRange, makeBand, validateBands } from '../../features/variables/bands';
import { ColorInput } from '../ui/Form';
import EmojiPicker from '../ui/EmojiPicker';
import { TrashIcon, PlusIcon } from '../icons';

/** A starting point beats a blank page. These become the author's content, so they aren't translated. */
const PRESETS: { key: string; label: string; bands: { name: string; min: number; color: string; icon: string }[] }[] = [
    {
        key: 'relationship', label: 'Relationship',
        bands: [
            { name: 'Stranger', min: 0, color: '#94a3b8', icon: '😐' },
            { name: 'Acquaintance', min: 21, color: '#38bdf8', icon: '🙂' },
            { name: 'Friend', min: 41, color: '#4ade80', icon: '😊' },
            { name: 'Close', min: 61, color: '#fb923c', icon: '🥰' },
            { name: 'In love', min: 81, color: '#f472b6', icon: '💖' },
        ],
    },
    {
        key: 'health', label: 'Health',
        bands: [
            { name: 'Critical', min: 0, color: '#ef4444', icon: '💀' },
            { name: 'Hurt', min: 26, color: '#fb923c', icon: '🤕' },
            { name: 'Fine', min: 61, color: '#4ade80', icon: '🙂' },
            { name: 'Perfect', min: 91, color: '#22d3ee', icon: '✨' },
        ],
    },
    {
        key: 'suspicion', label: 'Suspicion',
        bands: [
            { name: 'Unnoticed', min: 0, color: '#4ade80', icon: '😌' },
            { name: 'Curious', min: 26, color: '#facc15', icon: '🤔' },
            { name: 'Suspicious', min: 51, color: '#fb923c', icon: '😠' },
            { name: 'Certain', min: 81, color: '#ef4444', icon: '🚨' },
        ],
    },
];

const newId = (): VNID => `band-${Math.random().toString(36).slice(2, 9)}` as VNID;

export const BandEditor: React.FC<{
    variable: VNVariable;
    onChange: (updates: Partial<VNVariable>) => void;
}> = ({ variable, onChange }) => {
    const { t } = useTranslation('variables');
    const bands = sortedBands(variable);
    const problems = validateBands(variable);

    const setBands = (next: VNVariableBand[]) =>
        onChange({ bands: next.length ? [...next].sort((a, b) => a.min - b.min) : undefined });

    const updateBand = (id: VNID, updates: Partial<VNVariableBand>) =>
        setBands(bands.map(b => (b.id === id ? { ...b, ...updates } : b)));

    const addBand = () => setBands([...bands, { ...makeBand(variable, newId()), name: '' }]);

    const removeBand = (id: VNID) => setBands(bands.filter(b => b.id !== id));

    const applyPreset = (key: string) => {
        const p = PRESETS.find(x => x.key === key);
        if (!p) return;
        onChange({
            bands: p.bands.map(b => ({ id: newId(), ...b })),
            // A preset only makes sense across a range, so give it one if the author hasn't.
            ...(variable.min === undefined ? { min: 0 } : {}),
            ...(variable.max === undefined ? { max: 100 } : {}),
            ...(variable.showAs ? {} : { showAs: 'band' as VNVariableShowAs }),
        });
    };

    const inputClass = 'bg-[var(--bg-primary)] text-white p-1.5 rounded-md border border-[var(--border-default)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]';

    return (
        <div className="pt-4 border-t border-[var(--border-subtle)]">
            <label className="block text-sm font-medium text-[var(--text-primary)]">
                {t('bands.label', 'Give the numbers names')}
            </label>
            <p className="text-xs text-[var(--text-secondary)] mt-1 mb-2">
                {t('bands.hint', 'Name the ranges once — then you can write “when Yuki is a Friend” instead of “when Affection is 41 or more”.')}
            </p>

            {bands.length === 0 ? (
                <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                        {PRESETS.map(p => (
                            <button key={p.key} onClick={() => applyPreset(p.key)}
                                className="text-xs px-2 py-1 rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent-lavender)] transition-colors">
                                {p.bands[0].icon} {p.label}
                            </button>
                        ))}
                        <button onClick={addBand}
                            className="text-xs px-2 py-1 rounded-md border border-dashed border-[var(--border-default)] text-[var(--text-secondary)] hover:text-white flex items-center gap-1">
                            <PlusIcon className="w-3 h-3" />{t('bands.startBlank', 'Start blank')}
                        </button>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] italic">
                        {t('bands.presetHint', 'Pick one to start — you can rename, recolour and re-number every step afterwards.')}
                    </p>
                </div>
            ) : (
                <div className="space-y-1.5">
                    {/* Highest band first: the list then reads top-down like a ladder, best at the top. */}
                    {[...bands].reverse().map(band => {
                        const { from, to } = bandRange(variable, band);
                        return (
                            <div key={band.id} className="flex items-center gap-1.5 p-1.5 rounded-md border border-[var(--border-subtle)]">
                                <span className="flex-shrink-0">
                                    <EmojiPicker
                                        value={band.icon}
                                        onChange={icon => updateBand(band.id, { icon })}
                                        placeholder="🙂"
                                        title={t('bands.iconTitle', 'An emoji for this step (optional)')}
                                    />
                                </span>
                                <input
                                    type="text"
                                    value={band.name}
                                    onChange={e => updateBand(band.id, { name: e.target.value })}
                                    placeholder={t('bands.namePlaceholder', 'Friend')}
                                    className={`${inputClass} flex-grow min-w-0`}
                                />
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <span className="text-[10px] text-[var(--text-muted)]">{t('bands.from', 'from')}</span>
                                    <input
                                        type="number"
                                        value={band.min}
                                        onChange={e => updateBand(band.id, { min: parseFloat(e.target.value) || 0 })}
                                        className={`${inputClass} w-16`}
                                    />
                                </div>
                                <span className="text-[10px] text-[var(--text-muted)] w-16 text-right flex-shrink-0 tabular-nums">
                                    {to === null ? t('bands.andUp', '{{from}} and up', { from }) : `${from}–${to}`}
                                </span>
                                <span className="flex-shrink-0" title={t('bands.colorTitle', 'Colour for this step')}>
                                    <ColorInput
                                        value={band.color ?? '#94a3b8'}
                                        onChange={color => updateBand(band.id, { color })}
                                    />
                                </span>
                                <button onClick={() => removeBand(band.id)} className="p-1 text-red-500 hover:text-red-400 flex-shrink-0"
                                    title={t('bands.remove', 'Remove this step')}>
                                    <TrashIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        );
                    })}

                    <button onClick={addBand}
                        className="text-sky-400 hover:text-sky-300 text-xs mt-1 flex items-center gap-1">
                        <PlusIcon className="w-4 h-4" />{t('bands.add', 'Add another step')}
                    </button>

                    {problems.length > 0 && (
                        <div className="mt-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/40 space-y-0.5">
                            {problems.map((p, i) => (
                                <p key={i} className="text-[11px] text-amber-300">⚠ {p}</p>
                            ))}
                        </div>
                    )}

                    {/* How the value should READ to the player and in the tracker. */}
                    <div className="pt-2">
                        <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                            {t('bands.showAsLabel', 'When this appears in your story text')}
                        </label>
                        <select
                            value={variable.showAs ?? 'number'}
                            onChange={e => onChange({ showAs: e.target.value as VNVariableShowAs })}
                            className={`${inputClass} w-full`}
                        >
                            <option value="number">{t('bands.showAsNumber', 'Show the number — “34”')}</option>
                            <option value="band">{t('bands.showAsBand', 'Show the name — “Friend”')}</option>
                            <option value="both">{t('bands.showAsBoth', 'Show both — “Friend (34)”')}</option>
                        </select>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                            {t('bands.showAsHint', 'This is what {{token}} prints in dialogue and choices.', { token: `{${variable.name}}` })}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BandEditor;
