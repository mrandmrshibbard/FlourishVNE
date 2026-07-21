import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { VNProject } from '../../types/project';
import { UISaveSlotGridElement, UISlotDesign, UISlotDesignPart } from '../../features/ui/types';
import { FormField, TextInput, Select, ColorInput } from '../ui/Form';
import AssetSelector from '../ui/AssetSelector';
import FontEditor from '../ui/FontEditor';
import { fontSettingsToStyle } from '../../utils/styleUtils';
import { formatSlotText, slotPartVisible, SAMPLE_SLOT_SAVE, SAMPLE_SLOT_SCREENSHOT } from '../../utils/slotDesign';

/**
 * The Slot Designer: author one save slot's look — background art/color plus freely placed
 * parts (the save's screenshot, extra images, text with {slot}/{scene}/{date}/{time} tokens) —
 * opened straight from the SaveSlotGrid's Properties so authors never leave the screen editor.
 * Edits a LOCAL copy; "Done" commits once (one undo step), Cancel discards.
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, isNaN(v) ? lo : v));
const newPartId = () => 'part_' + Math.random().toString(36).slice(2, 10);

const DEFAULT_PART: Record<UISlotDesignPart['partType'], Omit<UISlotDesignPart, 'id' | 'partType'>> = {
    screenshot: { x: 4, y: 5, width: 92, height: 62, objectFit: 'cover' },
    image: { x: 35, y: 30, width: 30, height: 30, objectFit: 'contain' },
    text: { x: 4, y: 72, width: 92, height: 12, text: 'Slot {slot}' },
};

const SaveSlotDesigner: React.FC<{
    element: UISaveSlotGridElement;
    project: VNProject;
    onCommit: (design: UISlotDesign) => void;
    onClose: () => void;
}> = ({ element, project, onCommit, onClose }) => {
    const { t } = useTranslation('ui');
    const [design, setDesign] = useState<UISlotDesign>(() => ({
        enabled: true,
        background: element.slotDesign?.background,
        parts: (element.slotDesign?.parts || []).map(p => ({ ...p })),
    }));
    const [selectedId, setSelectedId] = useState<string | null>(design.parts[0]?.id || null);
    const [previewOccupied, setPreviewOccupied] = useState(true);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; startX: number; startY: number; orig: UISlotDesignPart } | null>(null);

    const selected = design.parts.find(p => p.id === selectedId) || null;

    const editorImageUrl = (id?: string | null): string | null => {
        if (!id) return null;
        return (project.images[id] as any)?.imageUrl || (project.backgrounds?.[id] as any)?.imageUrl || null;
    };

    const updatePart = (id: string, patch: Partial<UISlotDesignPart>) => {
        setDesign(d => ({ ...d, parts: d.parts.map(p => p.id === id ? { ...p, ...patch } : p) }));
    };

    const addPart = (partType: UISlotDesignPart['partType']) => {
        const part: UISlotDesignPart = { id: newPartId(), partType, ...DEFAULT_PART[partType] };
        setDesign(d => ({ ...d, parts: [...d.parts, part] }));
        setSelectedId(part.id);
    };

    const removePart = (id: string) => {
        setDesign(d => ({ ...d, parts: d.parts.filter(p => p.id !== id) }));
        setSelectedId(s => (s === id ? null : s));
    };

    const movePart = (id: string, dir: -1 | 1) => {
        setDesign(d => {
            const idx = d.parts.findIndex(p => p.id === id);
            const to = idx + dir;
            if (idx === -1 || to < 0 || to >= d.parts.length) return d;
            const parts = [...d.parts];
            [parts[idx], parts[to]] = [parts[to], parts[idx]];
            return { ...d, parts };
        });
    };

    const onCanvasPointerMove = (e: React.PointerEvent) => {
        const drag = dragRef.current;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!drag || !rect) return;
        const dx = ((e.clientX - drag.startX) / rect.width) * 100;
        const dy = ((e.clientY - drag.startY) / rect.height) * 100;
        if (drag.mode === 'move') {
            updatePart(drag.id, {
                x: clamp(drag.orig.x + dx, -50, 99),
                y: clamp(drag.orig.y + dy, -50, 99),
            });
        } else {
            updatePart(drag.id, {
                width: clamp(drag.orig.width + dx, 2, 150),
                height: clamp(drag.orig.height + dy, 2, 150),
            });
        }
    };
    const endDrag = () => { dragRef.current = null; };
    const startDrag = (e: React.PointerEvent, part: UISlotDesignPart, mode: 'move' | 'resize') => {
        e.stopPropagation();
        setSelectedId(part.id);
        dragRef.current = { id: part.id, mode, startX: e.clientX, startY: e.clientY, orig: { ...part } };
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    };

    const bgImageUrl = design.background?.type === 'image' ? editorImageUrl(design.background.assetId) : null;
    const bgType = design.background?.type || 'none';

    const partLabel = (p: UISlotDesignPart) =>
        p.partType === 'screenshot' ? t('slotDesigner.partScreenshot', 'Screenshot')
        : p.partType === 'image' ? t('slotDesigner.partImage', 'Image')
        : t('slotDesigner.partText', 'Text');

    return createPortal(
        <div className="fixed inset-0 z-[100000] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 w-full max-w-4xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">🎨 {t('slotDesigner.title', 'Design the save slot')}</h3>
                <p className="text-xs text-[var(--text-secondary)] mb-3">{t('slotDesigner.hint', 'Design ONE slot — the Save/Load screen repeats it for every slot. Drag pieces to place them; drag the corner square to resize. Sizes are in percent of the slot, so the design stretches with the slot.')}</p>

                <div className="flex gap-4 flex-wrap">
                    {/* ── Canvas + add/preview controls ── */}
                    <div className="flex-1 min-w-[320px]">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <button type="button" onClick={() => addPart('screenshot')} className="px-2 py-1 rounded text-xs border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-purple)]">+ {t('slotDesigner.addScreenshot', 'Screenshot')}</button>
                            <button type="button" onClick={() => addPart('image')} className="px-2 py-1 rounded text-xs border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-purple)]">+ {t('slotDesigner.addImage', 'Image')}</button>
                            <button type="button" onClick={() => addPart('text')} className="px-2 py-1 rounded text-xs border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-purple)]">+ {t('slotDesigner.addText', 'Text')}</button>
                            <div className="flex-1" />
                            <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] cursor-pointer">
                                <input type="checkbox" checked={previewOccupied} onChange={e => setPreviewOccupied(e.target.checked)} />
                                {t('slotDesigner.previewOccupied', 'Preview with a save in it')}
                            </label>
                        </div>

                        <div
                            ref={canvasRef}
                            className="relative w-full rounded-lg overflow-hidden select-none border-2"
                            style={{
                                aspectRatio: '16 / 10',
                                borderColor: element.slotBorderColor || '#475569',
                                backgroundColor: design.background?.type === 'color' ? design.background.value : (element.slotBackgroundColor || '#1e293b'),
                                touchAction: 'none',
                            }}
                            onPointerMove={onCanvasPointerMove}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            onPointerDown={() => setSelectedId(null)}
                        >
                            {bgImageUrl && <img src={bgImageUrl} alt="" className="absolute inset-0 w-full h-full pointer-events-none" style={{ objectFit: 'cover' }} />}
                            {design.parts.map(p => {
                                const visible = slotPartVisible(p, previewOccupied);
                                const isSel = p.id === selectedId;
                                const box: React.CSSProperties = {
                                    position: 'absolute',
                                    left: `${p.x}%`, top: `${p.y}%`, width: `${p.width}%`, height: `${p.height}%`,
                                    borderRadius: p.borderRadius,
                                    opacity: visible ? 1 : 0.25,
                                    outline: isSel ? '2px solid #38bdf8' : '1px dashed rgba(148,163,184,0.55)',
                                    cursor: 'move',
                                    overflow: 'hidden',
                                };
                                let inner: React.ReactNode = null;
                                if (p.partType === 'screenshot') {
                                    inner = <img src={SAMPLE_SLOT_SCREENSHOT} alt="" className="w-full h-full pointer-events-none" style={{ objectFit: p.objectFit || 'cover' }} />;
                                } else if (p.partType === 'image') {
                                    const url = editorImageUrl(p.asset?.id);
                                    inner = url
                                        ? <img src={url} alt="" className="w-full h-full pointer-events-none" style={{ objectFit: p.objectFit || 'contain' }} />
                                        : <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-300 bg-black/30 pointer-events-none">🖼 {t('slotDesigner.pickArt', 'pick art')}</div>;
                                } else {
                                    const fs = p.font ? fontSettingsToStyle(p.font) : { color: element.slotTextColor || '#e2e8f0', fontSize: 12 };
                                    const align = (fs as React.CSSProperties).textAlign;
                                    inner = <div className="w-full h-full flex items-center pointer-events-none" style={{ ...fs, justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start', whiteSpace: 'pre-wrap' }}>{formatSlotText(p.text || '', 3, previewOccupied ? SAMPLE_SLOT_SAVE : null)}</div>;
                                }
                                return (
                                    <div key={p.id} style={box} onPointerDown={e => startDrag(e, p, 'move')}>
                                        {inner}
                                        {isSel && (
                                            <div
                                                onPointerDown={e => startDrag(e, p, 'resize')}
                                                className="absolute bottom-0 right-0 w-3 h-3 bg-sky-400 border border-black/60"
                                                style={{ cursor: 'nwse-resize' }}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Background controls */}
                        <div className="mt-2 grid grid-cols-2 gap-2 items-end">
                            <FormField label={t('slotDesigner.background', 'Slot background')}>
                                <Select value={bgType} onChange={e => {
                                    const v = e.target.value;
                                    setDesign(d => ({
                                        ...d,
                                        background: v === 'none' ? undefined
                                            : v === 'color' ? { type: 'color', value: d.background?.type === 'color' ? d.background.value : '#1e293b' }
                                            : { type: 'image', assetId: d.background?.type === 'image' ? d.background.assetId : null },
                                    }));
                                }}>
                                    <option value="none">{t('slotDesigner.bgNone', "The slot's normal color")}</option>
                                    <option value="color">{t('slotDesigner.bgColor', 'A color')}</option>
                                    <option value="image">{t('slotDesigner.bgImage', 'My own art')}</option>
                                </Select>
                            </FormField>
                            {design.background?.type === 'color' && (
                                <FormField label={t('slotDesigner.bgColorValue', 'Color')}>
                                    <ColorInput value={design.background.value} onChange={v => setDesign(d => ({ ...d, background: { type: 'color', value: v } }))} />
                                </FormField>
                            )}
                            {design.background?.type === 'image' && (
                                <AssetSelector label={t('slotDesigner.bgArt', 'Background art')} assetType="images" value={design.background.assetId} onChange={id => setDesign(d => ({ ...d, background: { type: 'image', assetId: id } }))} />
                            )}
                        </div>
                    </div>

                    {/* ── Selected part properties ── */}
                    <div className="w-64 flex-shrink-0 flex flex-col gap-2">
                        <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{t('slotDesigner.pieces', 'Pieces')}</div>
                        <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                            {design.parts.length === 0 && <p className="text-[11px] text-[var(--text-muted)]">{t('slotDesigner.noPieces', 'No pieces yet — add a Screenshot, Image, or Text above.')}</p>}
                            {design.parts.map((p, idx) => (
                                <div key={p.id} className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer ${p.id === selectedId ? 'bg-[var(--accent-purple)]/30 text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-white/5'}`} onClick={() => setSelectedId(p.id)}>
                                    <span className="flex-1 truncate">{partLabel(p)}{p.partType === 'text' && p.text ? ` — ${p.text.slice(0, 16)}` : ''}</span>
                                    <button type="button" title={t('slotDesigner.moveBack', 'Move back')} disabled={idx === 0} onClick={e => { e.stopPropagation(); movePart(p.id, -1); }} className="opacity-70 hover:opacity-100 disabled:opacity-20">↑</button>
                                    <button type="button" title={t('slotDesigner.moveFront', 'Move forward')} disabled={idx === design.parts.length - 1} onClick={e => { e.stopPropagation(); movePart(p.id, 1); }} className="opacity-70 hover:opacity-100 disabled:opacity-20">↓</button>
                                    <button type="button" title={t('common.delete', 'Delete')} onClick={e => { e.stopPropagation(); removePart(p.id); }} className="opacity-70 hover:opacity-100 text-red-400">✕</button>
                                </div>
                            ))}
                        </div>

                        {selected && <>
                            <div className="border-t border-[var(--border-subtle)] pt-2 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{partLabel(selected)}</div>
                            <div className="grid grid-cols-2 gap-1.5">
                                <FormField label="X %"><TextInput type="number" value={Math.round(selected.x)} onChange={e => updatePart(selected.id, { x: clamp(parseFloat(e.target.value), -50, 99) })} /></FormField>
                                <FormField label="Y %"><TextInput type="number" value={Math.round(selected.y)} onChange={e => updatePart(selected.id, { y: clamp(parseFloat(e.target.value), -50, 99) })} /></FormField>
                                <FormField label={t('slotDesigner.width', 'Width %')}><TextInput type="number" value={Math.round(selected.width)} onChange={e => updatePart(selected.id, { width: clamp(parseFloat(e.target.value), 2, 150) })} /></FormField>
                                <FormField label={t('slotDesigner.height', 'Height %')}><TextInput type="number" value={Math.round(selected.height)} onChange={e => updatePart(selected.id, { height: clamp(parseFloat(e.target.value), 2, 150) })} /></FormField>
                            </div>
                            <FormField label={t('slotDesigner.visibleWhen', 'Show this piece')}>
                                <Select value={selected.visibleWhen || 'always'} onChange={e => updatePart(selected.id, { visibleWhen: e.target.value as UISlotDesignPart['visibleWhen'] })}>
                                    <option value="always">{t('slotDesigner.visAlways', 'Always')}</option>
                                    <option value="occupied">{t('slotDesigner.visOccupied', 'Only when the slot has a save')}</option>
                                    <option value="empty">{t('slotDesigner.visEmpty', 'Only when the slot is empty')}</option>
                                </Select>
                            </FormField>
                            <FormField label={t('slotDesigner.corners', 'Rounded corners (px)')}>
                                <TextInput type="number" min={0} value={selected.borderRadius ?? 0} onChange={e => updatePart(selected.id, { borderRadius: Math.max(0, parseFloat(e.target.value) || 0) })} />
                            </FormField>
                            {(selected.partType === 'screenshot' || selected.partType === 'image') && (
                                <FormField label={t('slotDesigner.fitMode', 'How the picture fills its box')}>
                                    <Select value={selected.objectFit || (selected.partType === 'screenshot' ? 'cover' : 'contain')} onChange={e => updatePart(selected.id, { objectFit: e.target.value as UISlotDesignPart['objectFit'] })}>
                                        <option value="cover">{t('slotDesigner.fitCover', 'Fill the box (crops the edges)')}</option>
                                        <option value="contain">{t('slotDesigner.fitContain', 'Fit inside (no cropping)')}</option>
                                        <option value="fill">{t('slotDesigner.fitFill', 'Stretch to the box')}</option>
                                    </Select>
                                </FormField>
                            )}
                            {selected.partType === 'image' && (
                                <AssetSelector label={t('slotDesigner.pieceArt', 'Art')} assetType="images" value={selected.asset?.id || null} onChange={id => updatePart(selected.id, { asset: id ? { type: 'image', id } : null })} />
                            )}
                            {selected.partType === 'text' && <>
                                <FormField label={t('slotDesigner.text', 'Text')}>
                                    <textarea
                                        value={selected.text || ''}
                                        onChange={e => updatePart(selected.id, { text: e.target.value })}
                                        className="w-full bg-[var(--bg-primary)] text-[var(--text-primary)] px-2 py-1 rounded border border-[var(--border-subtle)] text-xs outline-none"
                                        style={{ minHeight: 44, resize: 'vertical' }}
                                    />
                                </FormField>
                                <p className="text-[10px] text-[var(--text-muted)]">{t('slotDesigner.tokensHint', 'Fill-ins: {slot} = slot number, {scene} = saved scene, {date} and {time} = when it was saved.')}</p>
                                <FontEditor
                                    label={t('slotDesigner.textStyle', 'Text style')}
                                    font={selected.font || ({ family: 'Arial, sans-serif', size: 12, color: '#e2e8f0', weight: 'normal', italic: false } as any)}
                                    onFontChange={(prop, value) => updatePart(selected.id, { font: { ...(selected.font || ({ family: 'Arial, sans-serif', size: 12, color: '#e2e8f0', weight: 'normal', italic: false } as any)), [prop]: value } })}
                                />
                            </>}
                        </>}
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                    <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)]">{t('common.cancel', 'Cancel')}</button>
                    <button type="button" onClick={() => onCommit({ ...design, enabled: true })} className="px-3 py-1.5 rounded-md text-xs bg-[var(--accent-purple)] text-white font-semibold">{t('common.done', 'Done')}</button>
                </div>
            </div>
        </div>, document.body);
};

export default SaveSlotDesigner;

/** The inspector-side field: "use a custom design" toggle + the button that opens the Designer.
 *  Lives here (not in ElementGroupFields) because the modal needs its own open/closed state. */
export const SlotDesignField: React.FC<{
    element: UISaveSlotGridElement;
    project: VNProject;
    updateElement: (patch: Partial<UISaveSlotGridElement>) => void;
}> = ({ element, project, updateElement }) => {
    const { t } = useTranslation('ui');
    const [open, setOpen] = useState(false);
    const enabled = !!element.slotDesign?.enabled;
    return <>
        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('slotDesigner.sectionTitle', 'Custom slot design')}</h4>
        <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input
                type="checkbox"
                checked={enabled}
                onChange={e => updateElement({ slotDesign: { parts: [], ...(element.slotDesign || {}), enabled: e.target.checked } })}
                className="accent-purple-500"
            />
            {t('slotDesigner.useCustom', 'Design the slot myself (background + freely placed pieces)')}
        </label>
        {enabled && <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="w-full mt-1.5 px-3 py-1.5 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-purple)]"
            >
                🎨 {t('slotDesigner.openButton', 'Design the slot…')}
            </button>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">{t('slotDesigner.replacesHint', 'Your design replaces the built-in screenshot strip, info bar, and slot label. The erase ✕ stays.')}</p>
        </>}
        {open && (
            <SaveSlotDesigner
                element={element}
                project={project}
                onCommit={design => { updateElement({ slotDesign: design }); setOpen(false); }}
                onClose={() => setOpen(false)}
            />
        )}
    </>;
};
