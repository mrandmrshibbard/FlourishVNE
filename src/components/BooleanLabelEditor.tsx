/**
 * Lets an author choose the value labels for a BOOLEAN variable — a quick preset
 * (Yes/No default, On/Off, True/False, Locked/Unlocked, Open/Closed) or a Custom pair.
 * Writes `trueLabel`/`falseLabel` on the variable; clearing both falls back to the
 * global "Yes/No". Used by both variable editors (VariableManager + VariablePropertiesEditor).
 */
import React from 'react';
import { useTranslation } from 'react-i18next';

// Preset pairs are stored literally (they become the author's project content, like a
// variable name — not translated). The 'yesno' default stores nothing so it falls back.
const PRESETS: { key: string; trueLabel: string; falseLabel: string }[] = [
    { key: 'onoff', trueLabel: 'On', falseLabel: 'Off' },
    { key: 'truefalse', trueLabel: 'True', falseLabel: 'False' },
    { key: 'locked', trueLabel: 'Locked', falseLabel: 'Unlocked' },
    { key: 'openclosed', trueLabel: 'Open', falseLabel: 'Closed' },
];

export const BooleanLabelEditor: React.FC<{
    trueLabel?: string;
    falseLabel?: string;
    onChange: (updates: { trueLabel?: string; falseLabel?: string }) => void;
}> = ({ trueLabel, falseLabel, onChange }) => {
    const { t } = useTranslation('variables');
    const tl = (trueLabel ?? '').trim();
    const fl = (falseLabel ?? '').trim();

    let selected = 'custom';
    if (!tl && !fl) selected = 'yesno';
    else {
        const match = PRESETS.find(p => p.trueLabel === tl && p.falseLabel === fl);
        if (match) selected = match.key;
    }

    const selectClass = 'w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]';
    const inputClass = selectClass;

    const handlePreset = (val: string) => {
        if (val === 'yesno') onChange({ trueLabel: undefined, falseLabel: undefined });
        else if (val === 'custom') onChange({ trueLabel: tl || 'Yes', falseLabel: fl || 'No' });
        else {
            const p = PRESETS.find(x => x.key === val);
            if (p) onChange({ trueLabel: p.trueLabel, falseLabel: p.falseLabel });
        }
    };

    return (
        <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('boolLabels.label')}</label>
            <select value={selected} onChange={e => handlePreset(e.target.value)} className={selectClass}>
                <option value="yesno">{t('boolLabels.defaultPreset')}</option>
                {PRESETS.map(p => <option key={p.key} value={p.key}>{p.trueLabel} / {p.falseLabel}</option>)}
                <option value="custom">{t('boolLabels.custom')}</option>
            </select>
            {selected === 'custom' && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                    <input type="text" value={trueLabel ?? ''} placeholder={t('boolLabels.truePlaceholder')}
                        onChange={e => onChange({ trueLabel: e.target.value })} className={inputClass} />
                    <input type="text" value={falseLabel ?? ''} placeholder={t('boolLabels.falsePlaceholder')}
                        onChange={e => onChange({ falseLabel: e.target.value })} className={inputClass} />
                </div>
            )}
            <p className="text-xs text-[var(--text-secondary)] mt-1">{t('boolLabels.hint')}</p>
        </div>
    );
};

export default BooleanLabelEditor;
