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
import { VNTransition, VNPosition, VNPositionPreset, VNID } from '../../types';
import { FormField, Select, TextInput, RangeInput, ColorInput } from '../ui/Form';
import TransitionPreview from '../ui/TransitionPreview';
import SearchableSelect from '../ui/SearchableSelect';

/**
 * "⚡ Follow a number variable" — an optional variable binding that composes UNDER any numeric
 * FX field. Unbound = the manual value applies exactly as before; bound = the variable drives
 * the value (live for continuous FX like tint/fog/flashlight, read-at-run for one-shots like
 * shake — the field's hint says which). Pattern copied from the Timer variable picker.
 */
export const VarFollowSelect: React.FC<{
    value?: VNID | null;
    onChange: (id: VNID | null) => void;
    project: any;
    /** Expected range shown while bound, e.g. "0–1" or "0–100". */
    range: string;
    /** 'live' = updates while the effect is active; 'run' = read when the command runs. */
    mode: 'live' | 'run';
}> = ({ value, onChange, project, range, mode }) => {
    const { t } = useTranslation('ui');
    const numberVars = (Object.values(project.variables || {}) as any[]).filter(v => v.type === 'number');
    const bound = value ? (project.variables || {})[value] : null;
    // No number variables yet: stay VISIBLE with a pointer (hiding made the feature undiscoverable).
    if (numberVars.length === 0 && !value) {
        return (
            <p className="text-[10px] text-[var(--text-muted)] mt-1" title={t('varFollow.tip', 'Let a number variable control this value')}>
                ⚡ {t('varFollow.noVars', 'Want a variable to control this? Add a number variable in the Variables tab, then pick it here.')}
            </p>
        );
    }
    return (
        <div className="mt-1">
            <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0" title={t('varFollow.tip', 'Let a number variable control this value')}>⚡</span>
                <div className="flex-1 min-w-0">
                    <SearchableSelect
                        options={[{ value: '', label: t('varFollow.none', '— manual value —') }, ...numberVars.map(v => ({ value: v.id, label: v.name }))]}
                        value={value || ''}
                        onChange={(v: any) => onChange(v || null)}
                        placeholder={t('varFollow.placeholder', 'Follow a number variable (optional)')}
                    />
                </div>
            </div>
            {value && (
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5 ml-5">
                    {mode === 'live'
                        ? t('varFollow.liveHint', { defaultValue: `Follows "{{name}}" live while the effect is on screen (expected ${range}).`, name: bound?.name || '?', range })
                        : t('varFollow.runHint', { defaultValue: `Reads "{{name}}" when the command runs (expected ${range}).`, name: bound?.name || '?', range })}
                </p>
            )}
        </div>
    );
};

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
}> = ({ rotation, flipX, flipY, flipXLabel, onChange }) => {
    const { t } = useTranslation('properties');
    return (
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
                    title={t('properties:hc.resetRotationTo0', 'Reset rotation to 0°')}
                >0°</button>
            </div>
        </FormField>
        <div className="flex gap-4 pb-1">
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
                <input type="checkbox" checked={!!flipX} onChange={e => onChange({ flipX: e.target.checked })} className="cursor-pointer" />
                {flipXLabel ?? t('properties:hc.flipHorizontal', 'Flip Horizontal')}
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
                <input type="checkbox" checked={!!flipY} onChange={e => onChange({ flipY: e.target.checked })} className="cursor-pointer" />
                {t('properties:hc.flipVertical', 'Flip Vertical')}
            </label>
        </div>
    </div>
    );
};

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
                        <option value="glitch">{t('character.effects.glitch', 'Glitch (corruption)')}</option>
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
                        <ColorInput value={eff.color || '#FFFFFF'} onChange={v => updateEffect(idx, { color: v })} />
                    </div>
                )}
                {eff.type === 'glitch' && (
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs w-12 shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('character.rimSize', 'Line size')}</span>
                        <RangeInput min="0.2" max="3" step="0.1" value={eff.rimSize ?? 1} onChange={e => updateEffect(idx, { rimSize: parseFloat(e.target.value) })} className="flex-1" />
                        <span className="text-xs w-8 text-right" style={{ color: 'var(--text-secondary)' }}>{(eff.rimSize ?? 1).toFixed(1)}x</span>
                    </div>
                )}
                {eff.type === 'glitch' && (() => {
                    // Multi-colour rim: the ghost outlines flash through these in turn.
                    const colors: string[] = eff.colors?.length ? eff.colors : [eff.color || '#33FF66'];
                    const setColors = (next: string[]) => updateEffect(idx, { colors: next, color: next[0] });
                    return (
                        <div className="flex items-start gap-2">
                            <span className="text-xs w-12 shrink-0 mt-1.5" style={{ color: 'var(--text-secondary)' }}>{t('character.colors', 'Colours')}</span>
                            <div className="flex flex-wrap gap-1.5 items-center">
                                {colors.map((c, ci) => (
                                    <div key={ci} className="relative">
                                        <ColorInput value={c} onChange={v => setColors(colors.map((x, i) => i === ci ? v : x))} />
                                        {colors.length > 1 && (
                                            <button onClick={() => setColors(colors.filter((_, i) => i !== ci))} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] leading-none flex items-center justify-center" title={t('character.removeColor', 'Remove colour')}>×</button>
                                        )}
                                    </div>
                                ))}
                                <button onClick={() => setColors([...colors, '#ff4d9d'])} className="text-xs px-2 py-1 rounded-md border border-dashed" style={{ borderColor: 'var(--accent-lavender)', color: 'var(--accent-lavender)' }}>{t('character.addColor', '+ Colour')}</button>
                            </div>
                        </div>
                    );
                })()}
            </div>
        ))}
        <button onClick={addEffect} className="w-full text-xs py-1.5 rounded-lg border border-dashed hover:border-solid transition-colors"
            style={{ borderColor: 'var(--accent-lavender)', color: 'var(--accent-lavender)', background: 'transparent' }}>
            {t('character.addEffect')}
        </button>
    </>;
};
