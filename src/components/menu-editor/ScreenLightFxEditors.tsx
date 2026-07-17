import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { VNScreenBeam, VNScreenLight } from '../../types';
import { FormField, Select, ColorInput, RangeInput } from '../ui/Form';
import { SpotlightCanvasPicker } from '../inspector/SpotlightPlacementField';
import { LightsLayer } from '../live-preview/ScreenOverlayEffects';
import { TrashIcon, PlusIcon } from '../icons';

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, isNaN(v) ? lo : v));

/* ------------------------------------------------------------------ */
/*  Spotlight beams — list editor; each beam opens the same click/drag */
/*  canvas picker the scene Spotlight command uses.                    */
/* ------------------------------------------------------------------ */

export const SpotlightBeamsEditor: React.FC<{
    beams: VNScreenBeam[];
    darkness: number; // the effect's intensity — passed so the picker previews the real look
    onChange: (beams: VNScreenBeam[]) => void;
}> = ({ beams, darkness, onChange }) => {
    const { t } = useTranslation('ui');
    const [pickerFor, setPickerFor] = useState<string | null>(null);
    const update = (id: string, patch: Partial<VNScreenBeam>) =>
        onChange(beams.map(b => b.id === id ? { ...b, ...patch } : b));
    const addBeam = () => onChange([...beams, {
        id: newId('beam'),
        // Offset each new beam so they don't stack invisibly on top of each other.
        sourceX: clamp(25 + beams.length * 20, 0, 100), sourceY: 0, aimAngle: 0,
    }]);

    return (
        <div className="mt-2 space-y-2">
            {beams.length === 0 && (
                <p className="text-[10px] text-[var(--text-muted)] italic">{t('screenFxEditors.noBeams', 'No beams yet — add one and place it on the canvas.')}</p>
            )}
            {beams.map((b, i) => (
                <div key={b.id} className="p-2 rounded border border-[var(--border-subtle)] space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text-primary)]">{t('screenFxEditors.beamN', 'Beam {{n}}', { n: i + 1 })}</span>
                        <div className="flex items-center gap-1">
                            <ColorInput value={b.color || '#fff3d6'} onChange={v => update(b.id, { color: v })} />
                            <button onClick={() => onChange(beams.filter(x => x.id !== b.id))} className="p-1 text-red-400 hover:text-red-300" title={t('screenFxEditors.removeBeam', 'Remove beam')}>
                                <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                    <button type="button" onClick={() => setPickerFor(b.id)}
                        className="w-full px-2 py-1 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-purple)]">
                        📍 {t('screenFxEditors.placeBeam', 'Place on canvas (click to move, slider to aim)')}
                    </button>
                    <FormField label={t('screenFxEditors.beamWidth', 'Beam width') + ` (${Math.round(b.beamWidth ?? 45)})`}>
                        <RangeInput min={5} max={100} value={b.beamWidth ?? 45} onChange={e => update(b.id, { beamWidth: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" />
                    </FormField>
                    <FormField label={t('screenFxEditors.beamLength', 'Beam length') + ` (${Math.round(b.height ?? 100)})`}>
                        <RangeInput min={10} max={200} value={b.height ?? 100} onChange={e => update(b.id, { height: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" />
                    </FormField>
                    <FormField label={t('screenFxEditors.beamSoftness', 'Glow falloff') + ` (${Math.round((b.falloff ?? 0.5) * 100)}%)`}>
                        <RangeInput min={0} max={1} step={0.05} value={b.falloff ?? 0.5} onChange={e => update(b.id, { falloff: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" />
                    </FormField>
                    {pickerFor === b.id && (
                        <SpotlightCanvasPicker
                            cmd={{ ...b, intensity: darkness }}
                            onApply={(p: any) => { update(b.id, p); setPickerFor(null); }}
                            onClose={() => setPickerFor(null)}
                            t={t}
                        />
                    )}
                </div>
            ))}
            <button onClick={addBeam} className="w-full text-xs px-2 py-1.5 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] flex items-center justify-center gap-1">
                <PlusIcon className="w-3 h-3" /> {t('screenFxEditors.addBeam', 'Add a beam')}
            </button>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/*  Placed lights — list editor + a drag-them-around canvas modal.     */
/* ------------------------------------------------------------------ */

const LightsCanvasPicker: React.FC<{
    lights: VNScreenLight[];
    onApply: (lights: VNScreenLight[]) => void;
    onClose: () => void;
}> = ({ lights: initial, onApply, onClose }) => {
    const { t } = useTranslation('ui');
    const [lights, setLights] = useState<VNScreenLight[]>(initial);
    const stageRef = useRef<HTMLDivElement | null>(null);
    const dragIdRef = useRef<string | null>(null);

    const pct = (e: React.PointerEvent) => {
        const r = stageRef.current!.getBoundingClientRect();
        return { x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100), y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100) };
    };
    const onDown = (e: React.PointerEvent) => {
        const p = pct(e);
        // Grab the nearest light within ~6% of the click; otherwise ADD a light there.
        let best: { id: string; d: number } | null = null;
        for (const l of lights) {
            const d = Math.hypot(l.x - p.x, l.y - p.y);
            if (d < 6 && (!best || d < best.d)) best = { id: l.id, d };
        }
        if (best) {
            dragIdRef.current = best.id;
        } else {
            const id = newId('light');
            setLights(ls => [...ls, { id, type: 'christmas', x: p.x, y: p.y }]);
            dragIdRef.current = id;
        }
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: React.PointerEvent) => {
        if (!dragIdRef.current) return;
        const p = pct(e);
        setLights(ls => ls.map(l => l.id === dragIdRef.current ? { ...l, x: p.x, y: p.y } : l));
    };
    const onUp = () => { dragIdRef.current = null; };

    return createPortal(
        <div className="fixed inset-0 z-[100000] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{t('screenFxEditors.placeLights', 'Place the lights')}</h3>
                <p className="text-xs text-[var(--text-secondary)] mb-2">{t('screenFxEditors.placeLightsHint', 'Drag a light to move it. Click an empty spot to add a new one. Style each light in the list after closing.')}</p>
                <div ref={stageRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                    className="relative w-full rounded-lg overflow-hidden cursor-crosshair select-none"
                    style={{ aspectRatio: '16 / 9', background: '#11141c', backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.06) 1px,transparent 1px)', backgroundSize: '10% 10%', touchAction: 'none' }}>
                    <div className="absolute inset-0 pointer-events-none">
                        <LightsLayer lights={lights} stageW={640} stageH={360} />
                        {lights.map(l => (
                            <div key={`h-${l.id}`} className="absolute w-2.5 h-2.5 rounded-full border border-white/70 -translate-x-1/2 -translate-y-1/2" style={{ left: `${l.x}%`, top: `${l.y}%` }} />
                        ))}
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                    <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)]">{t('common.cancel', 'Cancel')}</button>
                    <button type="button" onClick={() => onApply(lights)} className="px-3 py-1.5 rounded-md text-xs bg-[var(--accent-purple)] text-white font-semibold">{t('common.apply', 'Apply')}</button>
                </div>
            </div>
        </div>, document.body);
};

export const ScreenLightsEditor: React.FC<{
    lights: VNScreenLight[];
    onChange: (lights: VNScreenLight[]) => void;
}> = ({ lights, onChange }) => {
    const { t } = useTranslation('ui');
    const [pickerOpen, setPickerOpen] = useState(false);
    const update = (id: string, patch: Partial<VNScreenLight>) =>
        onChange(lights.map(l => l.id === id ? { ...l, ...patch } : l));

    return (
        <div className="mt-2 space-y-2">
            <button type="button" onClick={() => setPickerOpen(true)}
                className="w-full px-2 py-1.5 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-purple)]">
                📍 {t('screenFxEditors.placeLightsButton', 'Place lights on canvas (drag to move, click to add)')}
            </button>
            {lights.length === 0 && (
                <p className="text-[10px] text-[var(--text-muted)] italic">{t('screenFxEditors.noLights', 'No lights yet — click the button above and click where you want them.')}</p>
            )}
            {lights.map((l, i) => (
                <div key={l.id} className="p-2 rounded border border-[var(--border-subtle)] space-y-1">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)] flex-shrink-0">{t('screenFxEditors.lightN', 'Light {{n}}', { n: i + 1 })}</span>
                        <Select value={l.type} onChange={e => update(l.id, { type: e.target.value as VNScreenLight['type'] })} className="flex-1 text-xs">
                            <option value="christmas">{t('screenFxEditors.lightBulb', 'Glowing bulb')}</option>
                            <option value="candle">{t('screenFxEditors.lightCandle', 'Candle flame')}</option>
                            <option value="star">{t('screenFxEditors.lightStar', 'Star sparkle')}</option>
                        </Select>
                        {l.type !== 'candle' && <ColorInput value={l.color || (l.type === 'star' ? '#ffffff' : '#ff3b3b')} onChange={v => update(l.id, { color: v })} />}
                        <button onClick={() => onChange(lights.filter(x => x.id !== l.id))} className="p-1 text-red-400 hover:text-red-300" title={t('screenFxEditors.removeLight', 'Remove light')}>
                            <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label={t('screenFxEditors.lightSize', 'Size') + ` (${(l.size ?? 1).toFixed(1)}×)`}>
                            <RangeInput min={0.3} max={3} step={0.1} value={l.size ?? 1} onChange={e => update(l.id, { size: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" />
                        </FormField>
                        <FormField label={t('screenFxEditors.lightTwinkle', 'Twinkle')}>
                            <Select value={l.twinkle ?? 'fade'} onChange={e => update(l.id, { twinkle: e.target.value as VNScreenLight['twinkle'] })}>
                                <option value="fade">{t('screenFxEditors.twinkleFade', 'Gentle fade')}</option>
                                <option value="blink">{t('screenFxEditors.twinkleBlink', 'Blink')}</option>
                                <option value="chase">{t('screenFxEditors.twinkleChase', 'Chase (in turn)')}</option>
                                <option value="steady">{t('screenFxEditors.twinkleSteady', 'Steady (no twinkle)')}</option>
                            </Select>
                        </FormField>
                    </div>
                </div>
            ))}
            {pickerOpen && (
                <LightsCanvasPicker
                    lights={lights}
                    onApply={next => { onChange(next); setPickerOpen(false); }}
                    onClose={() => setPickerOpen(false)}
                />
            )}
        </div>
    );
};
