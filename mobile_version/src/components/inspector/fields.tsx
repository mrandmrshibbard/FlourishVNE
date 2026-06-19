/**
 * Shared inspector field primitives.
 *
 * These were defined locally inside PropertiesInspector.tsx and are moved here so
 * the grouped renderers (and any future inspector) can reuse the exact same
 * controls instead of duplicating them. Behaviour is unchanged — this is a
 * straight relocation.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNTransition, VNPosition, VNPositionPreset } from '../../types';
import { FormField, Select, TextInput, RangeInput } from '../ui/Form';
import TransitionPreview from '../ui/TransitionPreview';

/**
 * Bidirectional rotation slider (-180°..180°) plus horizontal/vertical flip
 * toggles. Used by Image/Text/Button/Character editors. For characters, flipX
 * maps to the existing `inverted` field (handled by the caller).
 */
export const OrientationFields: React.FC<{
    rotation?: number;
    flipX?: boolean;
    flipY?: boolean;
    flipXLabel?: string;
    onChange: (patch: { rotation?: number; flipX?: boolean; flipY?: boolean }) => void;
}> = ({ rotation, flipX, flipY, flipXLabel = 'Flip Horizontal', onChange }) => (
    <div className="space-y-1 pt-1 border-t border-[var(--border-subtle)] mt-2">
        <FormField label={`Rotation: ${rotation ?? 0}°`}>
            <div className="flex items-center gap-2">
                <RangeInput min={-180} max={180} step={1} value={rotation ?? 0}
                    onChange={e => onChange({ rotation: parseInt(e.target.value, 10) })}
                    className="w-full cursor-pointer"
                />
                <button
                    type="button"
                    onClick={() => onChange({ rotation: 0 })}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                    title="Reset rotation to 0°"
                >0°</button>
            </div>
        </FormField>
        <div className="flex gap-4 pb-1">
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
                <input type="checkbox" checked={!!flipX} onChange={e => onChange({ flipX: e.target.checked })} className="cursor-pointer" />
                {flipXLabel}
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
                <input type="checkbox" checked={!!flipY} onChange={e => onChange({ flipY: e.target.checked })} className="cursor-pointer" />
                Flip Vertical
            </label>
        </div>
    </div>
);

/** Transition type + duration with a live preview. */
export const TransitionFields: React.FC<{
    transition: VNTransition;
    duration: number;
    onUpdate: (updates: { transition?: VNTransition; duration?: number }) => void;
}> = ({ transition, duration, onUpdate }) => {
    const { t } = useTranslation('properties');
    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1">
                <FormField label={t('shared.transition')}>
                    <Select value={transition} onChange={e => onUpdate({ transition: e.target.value as VNTransition })}>
                        <option value="fade">{t('transitions.fade')}</option>
                        <option value="dissolve">{t('transitions.dissolve')}</option>
                        <option value="slide">{t('transitions.slide')}</option>
                        <option value="iris-in">{t('transitions.iris')}</option>
                        <option value="wipe-right">{t('transitions.wipe')}</option>
                        <option value="instant">{t('transitions.instant')}</option>
                    </Select>
                </FormField>
                <FormField label={t('shared.durationSec')}>
                    <TextInput type="number" min="0" step="0.1" value={duration} onChange={e => onUpdate({ duration: parseFloat(e.target.value) || 0 })} />
                </FormField>
            </div>
            <TransitionPreview transition={transition} duration={duration} />
        </div>
    );
};

/** Character/position picker: preset (left/center/right) or custom x/y%. */
export const PositionInputs: React.FC<{
    label: string;
    position: VNPosition;
    onChange: (position: VNPosition) => void;
    disabled?: boolean;
}> = ({ label, position, onChange, disabled }) => {
    const { t } = useTranslation('properties');
    const isCustom = typeof position === 'object';
    const coords = isCustom ? position : { x: 50, y: 50 };
    const [showCustom, setShowCustom] = React.useState(isCustom);
    return (
        <div className={`space-y-2 ${disabled ? 'opacity-50' : ''}`}>
            <FormField label={label}>
                <div className="space-y-2">
                    <Select
                        value={showCustom ? 'custom' : (isCustom ? 'custom' : position)}
                        onChange={e => {
                            if (e.target.value === 'custom') { setShowCustom(true); onChange({ x: 50, y: 50 }); }
                            else { setShowCustom(false); onChange(e.target.value as VNPositionPreset); }
                        }}
                        disabled={disabled}
                    >
                        <option value="left">{t('positions.left')}</option>
                        <option value="center">{t('positions.center')}</option>
                        <option value="right">{t('positions.right')}</option>
                        <option value="custom">{t('positions.custom')}</option>
                    </Select>
                    {showCustom && (
                        <div className="grid grid-cols-2 gap-1">
                            <FormField label={t('shared.xPercent')}>
                                <TextInput type="number" min="0" max="100" value={coords.x} onChange={e => onChange({ ...coords, x: parseFloat(e.target.value) || 0 })} disabled={disabled} />
                            </FormField>
                            <FormField label={t('shared.yPercent')}>
                                <TextInput type="number" min="0" max="100" value={coords.y} onChange={e => onChange({ ...coords, y: parseFloat(e.target.value) || 0 })} disabled={disabled} />
                            </FormField>
                        </div>
                    )}
                </div>
            </FormField>
        </div>
    );
};

/**
 * Per-character visual-effects stack editor (breathing/shake/glow/tint/etc.),
 * extracted from PropertiesInspector so the flat ShowCharacter case and the
 * grouped Effects renderer share one implementation. Reads `visualEffects`
 * (falling back to the legacy single `visualEffect`) and writes via `updateCommand`.
 */
export const CharacterVisualEffectsEditor: React.FC<{
    cmd: any;
    updateCommand: (updates: any) => void;
}> = ({ cmd, updateCommand }) => {
    const { t } = useTranslation('properties');
    const effects: any[] = cmd.visualEffects && cmd.visualEffects.length > 0
        ? cmd.visualEffects
        : (cmd.visualEffect && cmd.visualEffect.type !== 'none' ? [cmd.visualEffect] : []);
    const updateEffects = (ne: any[]) => updateCommand({ visualEffects: ne.length > 0 ? ne : undefined, visualEffect: undefined });
    const addEffect = () => updateEffects([...effects, { type: 'breathing', speed: 1, intensity: 1 }]);
    const removeEffect = (idx: number) => updateEffects(effects.filter((_, i) => i !== idx));
    const updateEffect = (idx: number, patch: any) => updateEffects(effects.map((e, i) => i === idx ? { ...e, ...patch } : e));
    return <>
        {effects.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('character.noEffects')}</p>}
        {effects.map((eff: any, idx: number) => (
            <div key={idx} className="mb-3 p-2 rounded-lg" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-primary)' }}>
                <div className="flex items-center gap-1 mb-2">
                    <Select className="flex-1" value={eff.type || 'none'} onChange={e => { const type = e.target.value as any; if (type === 'none') removeEffect(idx); else updateEffect(idx, { type }); }}>
                        <option value="none">{t('character.remove')}</option>
                        <option value="shake">{t('character.effects.shake')}</option>
                        <option value="bounce">{t('character.effects.bounce')}</option>
                        <option value="float">{t('character.effects.float')}</option>
                        <option value="pulse">{t('character.effects.pulse')}</option>
                        <option value="glow">{t('character.effects.glow')}</option>
                        <option value="tint">{t('character.effects.tint')}</option>
                        <option value="silhouette">{t('character.effects.silhouette')}</option>
                        <option value="breathing">{t('character.effects.breathing')}</option>
                        <option value="flicker">{t('character.effects.flicker')}</option>
                    </Select>
                    <button onClick={() => removeEffect(idx)} className="p-1 rounded hover:bg-[var(--bg-tertiary)]" title={t('character.removeEffect')}>
                        <svg className="w-3.5 h-3.5" style={{ color: 'var(--accent-coral)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs w-12 shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('character.speed')}</span>
                    <RangeInput min="0.1" max="5" step="0.1" value={eff.speed ?? 1} onChange={e => updateEffect(idx, { speed: parseFloat(e.target.value) })} className="flex-1" />
                    <span className="text-xs w-8 text-right" style={{ color: 'var(--text-secondary)' }}>{(eff.speed ?? 1).toFixed(1)}x</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs w-12 shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('character.power')}</span>
                    <RangeInput min="0.1" max="3" step="0.1" value={eff.intensity ?? 1} onChange={e => updateEffect(idx, { intensity: parseFloat(e.target.value) })} className="flex-1" />
                    <span className="text-xs w-8 text-right" style={{ color: 'var(--text-secondary)' }}>{(eff.intensity ?? 1).toFixed(1)}x</span>
                </div>
                {(eff.type === 'glow' || eff.type === 'tint' || eff.type === 'silhouette') && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs w-12 shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('character.color')}</span>
                        <input type="color" value={eff.color || '#FFFFFF'} onChange={e => updateEffect(idx, { color: e.target.value })} className="w-7 h-7 rounded cursor-pointer border-0" />
                    </div>
                )}
            </div>
        ))}
        <button onClick={addEffect} className="w-full text-xs py-1.5 rounded-lg border border-dashed hover:border-solid transition-colors"
            style={{ borderColor: 'var(--accent-lavender)', color: 'var(--accent-lavender)', background: 'transparent' }}>
            {t('character.addEffect')}
        </button>
    </>;
};
