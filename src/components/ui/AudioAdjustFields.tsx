/**
 * The ONE sound-shaping editor (speed / keep-pitch / play-backwards) — mounted by the Play
 * Sound Effect + Play Music commands, the Play Sound / Play Music button actions, the Audio
 * asset pane (defaults) and the screen music/ambient editors, so there is no second layout
 * to drift. Plain words throughout; residue-free (all fields cleared → the key disappears).
 *
 * `allowReverse` is false on the MUSIC channel (owner decision — reverse is SFX/voice only).
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNAudioAdjust } from '../../features/scene/types';
import { VNProject } from '../../types/project';
import { applyAudioAdjust, clampSpeed } from '../../utils/audioAdjust';
import { getReversedUrl } from '../live-preview/reversedAudio';
import { resolveFieldUrl } from '../../utils/assetStore';

/** Write helper shared by every mount: strips empty objects so untouched data stays byte-identical. */
export const writeAudioAdjust = (next: VNAudioAdjust): VNAudioAdjust | undefined => {
    const out: VNAudioAdjust = {};
    if (next.speed !== undefined && next.speed !== 1) out.speed = next.speed;
    if (next.reverse) out.reverse = true;
    if (next.keepPitch) out.keepPitch = true;
    return Object.keys(out).length ? out : undefined;
};

export const AudioAdjustFields: React.FC<{
    value: VNAudioAdjust | undefined;
    onChange: (next: VNAudioAdjust | undefined) => void;
    /** false on the music channel — reverse is refused there. */
    allowReverse?: boolean;
    /** false where pitch-keeping can't be honored (typing blips — rate IS pitch there). */
    allowKeepPitch?: boolean;
    /** For the ▶ Preview button (optional — hidden when absent). */
    project?: VNProject;
    audioId?: string | null;
}> = ({ value, onChange, allowReverse = true, allowKeepPitch = true, project, audioId }) => {
    const { t } = useTranslation('ui');
    const speed = value?.speed ?? 1;

    const commit = (patch: Partial<VNAudioAdjust>) => onChange(writeAudioAdjust({ ...value, ...patch }));

    const speedLabel = speed === 1 ? t('audioAdjust.normal', '1× normal')
        : speed < 1 ? t('audioAdjust.slower', '{{x}}× (slower)', { x: speed }) : t('audioAdjust.faster', '{{x}}× (faster)', { x: speed });

    const preview = async () => {
        if (!project || !audioId) return;
        const asset: any = project.audio[audioId];
        const url = asset ? resolveFieldUrl(project.id, asset.audioUrl) || asset.audioUrl : null;
        if (!url) return;
        let playUrl = url;
        if (allowReverse && value?.reverse) playUrl = (await getReversedUrl(url)) || url;
        const a = new Audio(playUrl);
        applyAudioAdjust(a, value ?? null);
        a.volume = 0.9;
        a.play().catch(() => { /* preview is best-effort */ });
        window.setTimeout(() => { try { a.pause(); } catch { /* noop */ } }, 4000);
    };

    return (
        <div className="space-y-1.5">
            <div>
                <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[var(--text-muted)]">{t('audioAdjust.speed', 'Speed')}</span>
                    <span className="text-[10px] tabular-nums text-[var(--text-secondary)]">{speedLabel}</span>
                </div>
                <input type="range" min={0.25} max={4} step={0.05} value={speed}
                    onChange={e => { const v = clampSpeed(parseFloat(e.target.value) || 1); commit({ speed: Math.abs(v - 1) < 0.026 ? 1 : Math.round(v * 100) / 100 }); }}
                    className="w-full" aria-label={t('audioAdjust.speed', 'Speed')} />
            </div>
            {allowKeepPitch && (
                <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
                    <input type="checkbox" checked={!!value?.keepPitch} onChange={e => commit({ keepPitch: e.target.checked })} className="w-3.5 h-3.5" />
                    {t('audioAdjust.keepPitch', 'Keep the original pitch (no chipmunk / slow-motion voice)')}
                </label>
            )}
            {allowReverse && (
                <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
                    <input type="checkbox" checked={!!value?.reverse} onChange={e => commit({ reverse: e.target.checked })} className="w-3.5 h-3.5" />
                    {t('audioAdjust.reverse', 'Play backwards')}
                </label>
            )}
            <div className="flex items-center justify-between">
                <p className="text-[10px] text-[var(--text-muted)] italic">
                    {allowReverse
                        ? t('audioAdjust.hint', 'One file, many sounds — slow it, speed it, or flip it.')
                        : t('audioAdjust.hintMusic', 'Music can change speed; playing backwards is for sound effects and voices.')}
                </p>
                {project && audioId ? (
                    <button onClick={preview}
                        className="px-2 py-1 rounded border border-[var(--border-default)] text-[10px] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent-lavender)] flex-shrink-0"
                        title={t('audioAdjust.previewTitle', 'Hear a few seconds with these settings')}>
                        ▶ {t('audioAdjust.preview', 'Preview')}
                    </button>
                ) : null}
            </div>
        </div>
    );
};

export default AudioAdjustFields;
