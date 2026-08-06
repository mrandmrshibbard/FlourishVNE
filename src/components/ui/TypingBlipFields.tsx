/**
 * The ONE typing-sound (letter blip) editor — used by the character editors' Dialogue & Voice
 * pane and the Dialogue command's per-line override, so there is no second layout to drift.
 * Plain words throughout: "Every letter" / "Each word", a pitch "wobble", a Preview button.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNTypingBlip } from '../../features/character/types';
import { VNProject } from '../../types/project';
import SearchableSelect from './SearchableSelect';
import { playBlip, prepareBlipBuffer, blipIndicesFor } from '../live-preview/letterBlips';
import { resolveFieldUrl } from '../../utils/assetStore';
import AudioAdjustFields from './AudioAdjustFields';

export const TypingBlipFields: React.FC<{
    value: VNTypingBlip;
    onChange: (next: VNTypingBlip) => void;
    project: VNProject;
}> = ({ value, onChange, project }) => {
    const { t } = useTranslation('ui');
    const mode = value.mode ?? 'letter';

    const soundOptions = [
        { value: '', label: t('blip.builtin', 'Built-in beep') },
        ...Object.values(project.audio).map((a: any) => ({ value: a.id, label: a.name })),
    ];

    const resolveUrl = (): string | null => {
        if (!value.audioId) return null; // built-in beep
        const asset = project.audio[value.audioId];
        return asset ? resolveFieldUrl(project.id, (asset as any).audioUrl) : null;
    };

    const preview = () => {
        const url = resolveUrl();
        prepareBlipBuffer(url, value.audioAdjust?.reverse);
        // A short burst so the author hears pace + wobble, not just one tick.
        const demo = 'Hello there!';
        const indices = [...blipIndicesFor(demo, value)].sort((a, b) => a - b);
        indices.slice(0, 6).forEach((_, i) => {
            setTimeout(() => playBlip(url, {
                volume: value.volume ?? 1,
                pitchWobble: value.pitchWobble ?? 0,
                speed: value.audioAdjust?.speed,
                reverse: value.audioAdjust?.reverse,
            }), i * 90);
        });
    };

    return (
        <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
                <div className="flex-1 min-w-0">
                    <SearchableSelect
                        options={soundOptions}
                        value={value.audioId ?? ''}
                        onChange={v => onChange({ ...value, audioId: (v || null) as any })}
                        placeholder={t('blip.builtin', 'Built-in beep')}
                    />
                </div>
                <button onClick={preview}
                    className="px-2 py-1 rounded border border-[var(--border-default)] text-[10px] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent-lavender)] flex-shrink-0"
                    title={t('blip.previewTitle', 'Hear a short burst with these settings')}>
                    ▶ {t('blip.preview', 'Preview')}
                </button>
            </div>
            <div className="flex items-center gap-1.5">
                <select
                    value={mode}
                    onChange={e => onChange({ ...value, mode: e.target.value as 'letter' | 'word' })}
                    className="bg-[var(--bg-primary)] text-white p-1 rounded-md border border-[var(--border-default)] text-xs flex-shrink-0"
                >
                    <option value="letter">{t('blip.modeLetter', 'Every letter')}</option>
                    <option value="word">{t('blip.modeWord', 'Each word')}</option>
                </select>
                {mode === 'letter' && (
                    <label className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                        <span className="shrink-0">{t('blip.everyN', 'every…')}</span>
                        <input type="number" min="1" max="6" value={value.everyN ?? 2}
                            onChange={e => { const n = parseInt(e.target.value, 10); onChange({ ...value, everyN: Number.isFinite(n) && n >= 1 ? Math.min(n, 6) : undefined }); }}
                            className="w-12 bg-[var(--bg-primary)] text-white p-1 rounded-md border border-[var(--border-default)] text-xs" />
                        <span className="shrink-0">{t('blip.everyNTail', 'letters')}</span>
                    </label>
                )}
            </div>
            <label className="block text-[10px] text-[var(--text-muted)]">
                {t('blip.volume', 'Sound volume')}
                <input type="range" min="0" max="1" step="0.05" value={value.volume ?? 1}
                    onChange={e => onChange({ ...value, volume: parseFloat(e.target.value) })}
                    className="w-full" />
            </label>
            <label className="block text-[10px] text-[var(--text-muted)]">
                {t('blip.wobble', 'Pitch wobble (a little randomness per blip)')}
                <input type="range" min="0" max="0.5" step="0.05" value={value.pitchWobble ?? 0}
                    onChange={e => onChange({ ...value, pitchWobble: parseFloat(e.target.value) })}
                    className="w-full" />
            </label>
            <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                <input type="checkbox" checked={value.skipPunctuation !== false}
                    onChange={e => onChange({ ...value, skipPunctuation: e.target.checked ? undefined : false })}
                    className="w-3.5 h-3.5" />
                {t('blip.skipPunct', 'Only letters and numbers blip (skip spaces and punctuation)')}
            </label>
            {/* Sound shaping — same controls as SFX, minus keep-pitch (a blip's rate IS its pitch). */}
            <div className="pt-1.5 mt-0.5 border-t border-[var(--border-subtle)]/60">
                <AudioAdjustFields
                    value={value.audioAdjust}
                    onChange={audioAdjust => onChange({ ...value, audioAdjust })}
                    allowReverse
                    allowKeepPitch={false}
                />
            </div>
        </div>
    );
};

export default TypingBlipFields;
