import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * "Effect style" — the one always-visible control at the TOP of a qualifying effect command's
 * properties (and inside qualifying screen-effect rows). Classic = exactly today's rendering
 * (the stored field is REMOVED, keeping projects byte-identical); Enhanced = the WebGL glow
 * styles, which silently fall back to Classic on devices without WebGL.
 */
const EffectStyleSwitch: React.FC<{
    value: 'classic' | 'enhanced';
    onChange: (style: 'classic' | 'enhanced') => void;
    compact?: boolean;
}> = ({ value, onChange, compact }) => {
    const { t } = useTranslation('ui');
    const seg = (key: 'classic' | 'enhanced', label: string) => (
        <button
            type="button"
            onClick={() => onChange(key)}
            className={`flex-1 px-2 ${compact ? 'py-0.5' : 'py-1'} text-xs rounded transition-colors ${
                value === key
                    ? 'bg-[var(--accent-purple)] text-white font-semibold'
                    : 'text-slate-300 hover:bg-white/10'
            }`}
        >
            {label}
        </button>
    );
    return (
        <div className={compact ? '' : 'p-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)]/40'}>
            <div className="flex items-center gap-2">
                <span className={`text-xs ${compact ? 'text-slate-400' : 'font-bold text-slate-300'} flex-shrink-0`}>
                    {t('effectStyle.label', 'Effect style')}
                </span>
                <div className="flex flex-1 gap-0.5 p-0.5 rounded-md bg-black/30">
                    {seg('classic', t('effectStyle.classic', 'Classic'))}
                    {seg('enhanced', t('effectStyle.enhanced', 'Enhanced'))}
                </div>
            </div>
            {!compact && (
                <p className="text-[10px] text-slate-500 mt-1">
                    {t('effectStyle.hint', 'Classic — exactly as before · Enhanced — richer light and glow (falls back to Classic on old devices)')}
                </p>
            )}
        </div>
    );
};

export default EffectStyleSwitch;
