import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FormField, TextInput, RangeInput } from '../ui/Form';

/**
 * Author UI for positioning a Spotlight: numeric Source X/Y + Aim fields, plus a "Place on canvas"
 * modal where you CLICK to drop the light source and DRAG to aim the beam. The modal previews the
 * actual beam (same geometry as the runtime) over a neutral 16:9 stage.
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, isNaN(v) ? lo : v));
// Local hex→rgba so this editor component stays independent of the runtime helper.
const hexA = (hex: string, a: number) => {
    const h = (hex || '#ffffff').replace('#', '');
    const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
    return `rgba(${isNaN(r) ? 255 : r},${isNaN(g) ? 255 : g},${isNaN(b) ? 255 : b},${a})`;
};

const BeamPreview: React.FC<{ sx: number; sy: number; aim: number; cmd: any }> = ({ sx, sy, aim, cmd }) => {
    const half = clamp(cmd.beamWidth ?? 45, 5, 100) / 2;
    const len = clamp(cmd.height ?? 100, 10, 200);
    const srcHalf = clamp(cmd.sourceWidth ?? 8, 0, 60) / 2;
    const inner = Math.round(clamp(1 - (cmd.falloff ?? 0.5), 0, 1) * 100);
    const color = cmd.color || '#fff3d6';
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${clamp(cmd.intensity ?? 0.85, 0, 1)})` }} />
            <div className="absolute inset-0" style={{ mixBlendMode: 'screen', transformOrigin: `${sx}% ${sy}%`, transform: `rotate(${-aim}deg)`, filter: 'blur(6px)' }}>
                <div className="absolute inset-0" style={{
                    clipPath: `polygon(${sx - srcHalf}% ${sy}%, ${sx + srcHalf}% ${sy}%, ${sx + half}% ${sy + len}%, ${sx - half}% ${sy + len}%)`,
                    background: `radial-gradient(120% ${len}% at ${sx}% ${sy}%, ${hexA(color, 0.95)} 0%, ${hexA(color, 0.55)} ${inner}%, ${hexA(color, 0)} 100%)`,
                }} />
            </div>
        </div>
    );
};

/** Exported for reuse: the screen-attached 'spotlight' effect's beam editor opens this same picker
 *  (beams share the command's field names — sourceX/sourceY/aimAngle/beamWidth/…). */
export const SpotlightCanvasPicker: React.FC<{ cmd: any; onApply: (p: any) => void; onClose: () => void; t: any }> = ({ cmd, onApply, onClose, t }) => {
    const [sx, setSx] = useState<number>(cmd.sourceX ?? 50);
    const [sy, setSy] = useState<number>(cmd.sourceY ?? 0);
    const [aim, setAim] = useState<number>(cmd.aimAngle ?? 0);
    const stageRef = useRef<HTMLDivElement | null>(null);
    const draggingRef = useRef(false);

    // Drag = move the SOURCE only (aim is the slider). Snap to an edge when the source gets close to it.
    const SNAP = 6; // % from an edge that snaps flush
    const snap = (v: number) => (v < SNAP ? 0 : v > 100 - SNAP ? 100 : v);
    const place = (e: React.PointerEvent) => {
        const r = stageRef.current!.getBoundingClientRect();
        setSx(snap(clamp(((e.clientX - r.left) / r.width) * 100, 0, 100)));
        setSy(snap(clamp(((e.clientY - r.top) / r.height) * 100, 0, 100)));
    };
    const onDown = (e: React.PointerEvent) => { draggingRef.current = true; place(e); (e.currentTarget as Element).setPointerCapture?.(e.pointerId); };
    const onMove = (e: React.PointerEvent) => { if (draggingRef.current) place(e); };
    const onUp = () => { draggingRef.current = false; };

    return createPortal(
        <div className="fixed inset-0 z-[100000] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{t('fx.placeSpotlight', 'Place the spotlight')}</h3>
                <p className="text-xs text-[var(--text-secondary)] mb-2">{t('fx.placeSpotlightHint', 'Click or drag to place the light source (it snaps to the screen edges). Use the Aim slider below to point the beam.')}</p>
                <div ref={stageRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                    className="relative w-full rounded-lg overflow-hidden cursor-crosshair select-none"
                    style={{ aspectRatio: '16 / 9', background: '#11141c', backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.06) 1px,transparent 1px)', backgroundSize: '10% 10%', touchAction: 'none' }}>
                    <BeamPreview sx={sx} sy={sy} aim={aim} cmd={cmd} />
                    <div className="absolute w-3 h-3 rounded-full bg-amber-300 border border-black/50 -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: `${sx}%`, top: `${sy}%` }} />
                </div>
                <FormField label={`${t('fx.aimAngle', 'Aim direction')} (${Math.round(aim)}°)`}>
                    <RangeInput min={-170} max={170} value={aim} onChange={e => setAim(clamp(parseFloat(e.target.value), -170, 170))} className="w-full accent-[var(--accent-lavender)]" />
                </FormField>
                <div className="grid grid-cols-2 gap-2 mt-1">
                    <FormField label={t('fx.sourceX', 'Source X %')}><TextInput type="number" value={Math.round(sx)} onChange={e => setSx(clamp(parseFloat(e.target.value), 0, 100))} /></FormField>
                    <FormField label={t('fx.sourceY', 'Source Y %')}><TextInput type="number" value={Math.round(sy)} onChange={e => setSy(clamp(parseFloat(e.target.value), 0, 100))} /></FormField>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                    <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)]">{t('common.cancel', 'Cancel')}</button>
                    <button type="button" onClick={() => onApply({ sourceX: Math.round(sx), sourceY: Math.round(sy), aimAngle: Math.round(aim) })} className="px-3 py-1.5 rounded-md text-xs bg-[var(--accent-purple)] text-white font-semibold">{t('common.apply', 'Apply')}</button>
                </div>
            </div>
        </div>, document.body);
};

const SpotlightPlacementField: React.FC<{ cmd: any; updateCommand: (u: any) => void; project: any; t: any }> = ({ cmd, updateCommand, t }) => {
    const [open, setOpen] = useState(false);
    const sx = cmd.sourceX ?? 50, sy = cmd.sourceY ?? 0, aim = cmd.aimAngle ?? 0;
    return <>
        <div className="grid grid-cols-2 gap-2">
            <FormField label={t('fx.sourceX', 'Source X %')}><TextInput type="number" value={sx} onChange={e => updateCommand({ sourceX: clamp(parseFloat(e.target.value), 0, 100) })} /></FormField>
            <FormField label={t('fx.sourceY', 'Source Y %')}><TextInput type="number" value={sy} onChange={e => updateCommand({ sourceY: clamp(parseFloat(e.target.value), 0, 100) })} /></FormField>
        </div>
        <FormField label={`${t('fx.aimAngle', 'Aim direction')} (${aim}°)`}>
            <RangeInput min={-170} max={170} value={aim} onChange={e => updateCommand({ aimAngle: clamp(parseFloat(e.target.value), -170, 170) })} className="w-full accent-[var(--accent-lavender)]" />
        </FormField>
        <button type="button" onClick={() => setOpen(true)} className="w-full mt-1 px-3 py-1.5 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-purple)]">📍 {t('fx.pickOnCanvas', 'Place source on canvas')}</button>
        {open && <SpotlightCanvasPicker cmd={cmd} onApply={(p) => { updateCommand(p); setOpen(false); }} onClose={() => setOpen(false)} t={t} />}
    </>;
};

export default SpotlightPlacementField;
