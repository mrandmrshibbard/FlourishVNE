import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { VNProject } from '../../types/project';
import { UIMusicGalleryElement, UIMusicPlayerPart, MusicPlayerPartType } from '../../features/ui/types';
import { FormField, TextInput, Select, ColorInput } from '../ui/Form';
import AssetSelector from '../ui/AssetSelector';
import FontEditor from '../ui/FontEditor';
import { defaultMusicPlayerParts } from '../../utils/musicGallery';
import { MusicPartInner, SAMPLE_PREVIEW_CTX, MusicPreviewCtx } from '../menu-editor/MusicGalleryPreview';

/**
 * The Music Player Designer: place and style every piece of a Music Gallery player
 * (song list, cover art, transport controls…) by dragging them inside the element box.
 * Clone of the Save Slot Designer architecture: edits a LOCAL copy; "Done" commits once
 * (one undo step), Cancel discards.
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, isNaN(v) ? lo : v));
const newPartId = () => 'mgpart_' + Math.random().toString(36).slice(2, 10);

const ADDABLE: Array<{ type: MusicPlayerPartType; w: number; h: number }> = [
    { type: 'songList', w: 45, h: 60 },
    { type: 'artwork', w: 40, h: 48 },
    { type: 'songTitle', w: 45, h: 9 },
    { type: 'artistName', w: 45, h: 6 },
    { type: 'playPause', w: 12, h: 18 },
    { type: 'prevButton', w: 8, h: 13 },
    { type: 'nextButton', w: 8, h: 13 },
    { type: 'seekBar', w: 40, h: 4 },
    { type: 'timeLabel', w: 40, h: 6 },
    { type: 'loopToggle', w: 7, h: 11 },
    { type: 'shuffleToggle', w: 7, h: 11 },
];

const TEXT_PARTS: MusicPlayerPartType[] = ['songTitle', 'artistName', 'timeLabel', 'songList'];
const CONTROL_PARTS: MusicPlayerPartType[] = ['playPause', 'prevButton', 'nextButton', 'loopToggle', 'shuffleToggle'];
const TOGGLE_PARTS: MusicPlayerPartType[] = ['playPause', 'loopToggle', 'shuffleToggle'];

const MusicPlayerDesigner: React.FC<{
    element: UIMusicGalleryElement;
    project: VNProject;
    onCommit: (parts: UIMusicPlayerPart[]) => void;
    onClose: () => void;
}> = ({ element, project, onCommit, onClose }) => {
    const { t } = useTranslation('ui');
    const [parts, setParts] = useState<UIMusicPlayerPart[]>(() => (element.parts || []).map(p => ({ ...p })));
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [previewPlaying, setPreviewPlaying] = useState(true);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; startX: number; startY: number; orig: UIMusicPlayerPart } | null>(null);

    const selected = parts.find(p => p.id === selectedId) || null;

    // WYSIWYG canvas: same shape as the placed element (element % of screen × game resolution).
    const res = project.gameResolution || { width: 1280, height: 720 };
    const elementAspect = ((element.width / 100) * res.width) / Math.max(1, (element.height / 100) * res.height);

    const previewCtx: MusicPreviewCtx = {
        ...SAMPLE_PREVIEW_CTX(element),
        playing: previewPlaying,
        currentIndex: previewPlaying ? 0 : -1,
    };

    const partLabel = (type: MusicPlayerPartType): string => {
        const labels: Record<MusicPlayerPartType, string> = {
            songList: t('musicDesigner.partSongList', 'Song list'),
            artwork: t('musicDesigner.partArtwork', 'Cover art'),
            songTitle: t('musicDesigner.partSongTitle', 'Song title'),
            artistName: t('musicDesigner.partArtist', 'Artist name'),
            playPause: t('musicDesigner.partPlayPause', 'Play/Pause button'),
            prevButton: t('musicDesigner.partPrev', 'Previous button'),
            nextButton: t('musicDesigner.partNext', 'Next button'),
            seekBar: t('musicDesigner.partSeek', 'Progress bar'),
            timeLabel: t('musicDesigner.partTime', 'Time label'),
            loopToggle: t('musicDesigner.partLoop', 'Repeat button'),
            shuffleToggle: t('musicDesigner.partShuffle', 'Shuffle button'),
        };
        return labels[type];
    };

    const updatePart = (id: string, patch: Partial<UIMusicPlayerPart>) => {
        setParts(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));
    };

    const addPart = (type: MusicPlayerPartType) => {
        const spec = ADDABLE.find(a => a.type === type)!;
        const part: UIMusicPlayerPart = { id: newPartId(), partType: type, x: 30, y: 35, width: spec.w, height: spec.h };
        setParts(ps => [...ps, part]);
        setSelectedId(part.id);
    };

    const removePart = (id: string) => {
        setParts(ps => ps.filter(p => p.id !== id));
        setSelectedId(s => (s === id ? null : s));
    };

    const movePart = (id: string, dir: -1 | 1) => {
        setParts(ps => {
            const idx = ps.findIndex(p => p.id === id);
            const to = idx + dir;
            if (idx === -1 || to < 0 || to >= ps.length) return ps;
            const next = [...ps];
            [next[idx], next[to]] = [next[to], next[idx]];
            return next;
        });
    };

    const missingTypes = ADDABLE.filter(a => !parts.some(p => p.partType === a.type));

    const onCanvasPointerMove = (e: React.PointerEvent) => {
        const drag = dragRef.current;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!drag || !rect) return;
        const dx = ((e.clientX - drag.startX) / rect.width) * 100;
        const dy = ((e.clientY - drag.startY) / rect.height) * 100;
        if (drag.mode === 'move') {
            updatePart(drag.id, {
                x: clamp(drag.orig.x + dx, -20, 99),
                y: clamp(drag.orig.y + dy, -20, 99),
            });
        } else {
            updatePart(drag.id, {
                width: clamp(drag.orig.width + dx, 2, 120),
                height: clamp(drag.orig.height + dy, 2, 120),
            });
        }
    };
    const endDrag = () => { dragRef.current = null; };
    const startDrag = (e: React.PointerEvent, part: UIMusicPlayerPart, mode: 'move' | 'resize') => {
        e.stopPropagation();
        setSelectedId(part.id);
        dragRef.current = { id: part.id, mode, startX: e.clientX, startY: e.clientY, orig: { ...part } };
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    };

    const editorImageUrl = (id?: string | null): string | null => {
        if (!id) return null;
        return (project.images?.[id] as any)?.imageUrl || (project.backgrounds?.[id] as any)?.imageUrl || null;
    };
    const bgUrl = element.backgroundImage?.id ? editorImageUrl(element.backgroundImage.id) : null;

    const defaultFont = { family: 'Arial, sans-serif', size: 13, color: '#e2e8f0', weight: 'normal', italic: false } as any;

    return createPortal(
        <div className="fixed inset-0 z-[100000] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 w-full max-w-5xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">🎵 {t('musicDesigner.title', 'Design the music player')}</h3>
                <p className="text-xs text-[var(--text-secondary)] mb-3">{t('musicDesigner.hint', 'Drag the pieces to place them; drag the corner square to resize. Sizes are in percent of the player, so the design stretches with the element. Use the eye to hide a piece without losing its spot.')}</p>

                <div className="flex gap-4 flex-wrap">
                    {/* ── Canvas ── */}
                    <div className="flex-1 min-w-[360px]">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {missingTypes.length > 0 && (
                                <Select value="" onChange={e => { if (e.target.value) addPart(e.target.value as MusicPlayerPartType); }} className="text-xs">
                                    <option value="">{t('musicDesigner.addPiece', '+ Add a piece back…')}</option>
                                    {missingTypes.map(a => (
                                        <option key={a.type} value={a.type}>{partLabel(a.type)}</option>
                                    ))}
                                </Select>
                            )}
                            <button
                                type="button"
                                onClick={() => { setParts(defaultMusicPlayerParts()); setSelectedId(null); }}
                                className="px-2 py-1 rounded text-xs border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-purple)]"
                            >
                                ↺ {t('musicDesigner.resetLayout', 'Reset to the standard layout')}
                            </button>
                            <div className="flex-1" />
                            <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] cursor-pointer">
                                <input type="checkbox" checked={previewPlaying} onChange={e => setPreviewPlaying(e.target.checked)} />
                                {t('musicDesigner.previewPlaying', 'Preview with a song playing')}
                            </label>
                        </div>

                        <div
                            ref={canvasRef}
                            className="relative w-full rounded-lg overflow-hidden select-none border-2 border-[var(--border-subtle)]"
                            style={{
                                aspectRatio: `${elementAspect}`,
                                backgroundColor: element.hideBackgroundPanel ? '#0b1120' : (element.backgroundColor || 'rgba(15, 23, 42, 0.92)'),
                                touchAction: 'none',
                            }}
                            onPointerMove={onCanvasPointerMove}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            onPointerDown={() => setSelectedId(null)}
                        >
                            {bgUrl && <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full pointer-events-none" style={{ objectFit: 'cover' }} />}
                            {parts.map(p => {
                                const isSel = p.id === selectedId;
                                const hidden = p.visible === false;
                                return (
                                    <div
                                        key={p.id}
                                        style={{
                                            position: 'absolute',
                                            left: `${p.x}%`, top: `${p.y}%`, width: `${p.width}%`, height: `${p.height}%`,
                                            opacity: hidden ? 0.25 : 1,
                                            outline: isSel ? '2px solid #38bdf8' : '1px dashed rgba(148,163,184,0.4)',
                                            cursor: 'move',
                                            overflow: 'hidden',
                                            borderRadius: p.borderRadius,
                                            background: p.partType === 'songList' || p.partType === 'artwork' ? p.backgroundColor : undefined,
                                        }}
                                        onPointerDown={e => startDrag(e, p, 'move')}
                                    >
                                        <MusicPartInner part={p} ctx={previewCtx} project={project} />
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
                    </div>

                    {/* ── Pieces list + selected piece properties ── */}
                    <div className="w-72 flex-shrink-0 flex flex-col gap-2">
                        <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{t('musicDesigner.pieces', 'Pieces')}</div>
                        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                            {parts.map((p, idx) => (
                                <div key={p.id} className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer ${p.id === selectedId ? 'bg-[var(--accent-purple)]/30 text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-white/5'}`} onClick={() => setSelectedId(p.id)}>
                                    <button
                                        type="button"
                                        title={p.visible === false ? t('musicDesigner.showPiece', 'Show this piece') : t('musicDesigner.hidePiece', 'Hide this piece (keeps its spot)')}
                                        onClick={e => { e.stopPropagation(); updatePart(p.id, { visible: p.visible === false ? undefined : false }); }}
                                        className="opacity-70 hover:opacity-100"
                                    >
                                        {p.visible === false ? '🚫' : '👁'}
                                    </button>
                                    <span className="flex-1 truncate">{partLabel(p.partType)}</span>
                                    <button type="button" title={t('slotDesigner.moveBack', 'Move back')} disabled={idx === 0} onClick={e => { e.stopPropagation(); movePart(p.id, -1); }} className="opacity-70 hover:opacity-100 disabled:opacity-20">↑</button>
                                    <button type="button" title={t('slotDesigner.moveFront', 'Move forward')} disabled={idx === parts.length - 1} onClick={e => { e.stopPropagation(); movePart(p.id, 1); }} className="opacity-70 hover:opacity-100 disabled:opacity-20">↓</button>
                                    <button type="button" title={t('common.delete', 'Delete')} onClick={e => { e.stopPropagation(); removePart(p.id); }} className="opacity-70 hover:opacity-100 text-red-400">✕</button>
                                </div>
                            ))}
                        </div>

                        {selected && <>
                            <div className="border-t border-[var(--border-subtle)] pt-2 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{partLabel(selected.partType)}</div>
                            <div className="grid grid-cols-2 gap-1.5">
                                <FormField label="X %"><TextInput type="number" value={Math.round(selected.x)} onChange={e => updatePart(selected.id, { x: clamp(parseFloat(e.target.value), -20, 99) })} /></FormField>
                                <FormField label="Y %"><TextInput type="number" value={Math.round(selected.y)} onChange={e => updatePart(selected.id, { y: clamp(parseFloat(e.target.value), -20, 99) })} /></FormField>
                                <FormField label={t('slotDesigner.width', 'Width %')}><TextInput type="number" value={Math.round(selected.width)} onChange={e => updatePart(selected.id, { width: clamp(parseFloat(e.target.value), 2, 120) })} /></FormField>
                                <FormField label={t('slotDesigner.height', 'Height %')}><TextInput type="number" value={Math.round(selected.height)} onChange={e => updatePart(selected.id, { height: clamp(parseFloat(e.target.value), 2, 120) })} /></FormField>
                            </div>
                            <FormField label={t('slotDesigner.corners', 'Rounded corners (px)')}>
                                <TextInput type="number" min={0} value={selected.borderRadius ?? 0} onChange={e => updatePart(selected.id, { borderRadius: Math.max(0, parseFloat(e.target.value) || 0) })} />
                            </FormField>

                            {CONTROL_PARTS.includes(selected.partType) && <>
                                <FormField label={t('musicDesigner.controlColor', 'Button color')}>
                                    <ColorInput value={selected.color || '#e2e8f0'} onChange={v => updatePart(selected.id, { color: v })} allowAlpha />
                                </FormField>
                                <FormField label={t('musicDesigner.controlBg', 'Button backdrop')}>
                                    <ColorInput value={selected.backgroundColor || 'rgba(0,0,0,0)'} onChange={v => updatePart(selected.id, { backgroundColor: v })} allowAlpha />
                                </FormField>
                                <AssetSelector
                                    label={t('musicDesigner.customArt', 'My own picture for this button')}
                                    assetType="images"
                                    value={selected.image?.id || null}
                                    onChange={id => updatePart(selected.id, { image: id ? { type: 'image', id } : null })}
                                />
                                {TOGGLE_PARTS.includes(selected.partType) && (
                                    <AssetSelector
                                        label={t('musicDesigner.customArtActive', "…while it's on")}
                                        assetType="images"
                                        value={selected.imageActive?.id || null}
                                        onChange={id => updatePart(selected.id, { imageActive: id ? { type: 'image', id } : null })}
                                    />
                                )}
                            </>}

                            {selected.partType === 'artwork' && <>
                                <FormField label={t('slotDesigner.fitMode', 'How the picture fills its box')}>
                                    <Select value={selected.objectFit || 'cover'} onChange={e => updatePart(selected.id, { objectFit: e.target.value as UIMusicPlayerPart['objectFit'] })}>
                                        <option value="cover">{t('slotDesigner.fitCover', 'Fill the box (crops the edges)')}</option>
                                        <option value="contain">{t('slotDesigner.fitContain', 'Fit inside (no cropping)')}</option>
                                        <option value="fill">{t('slotDesigner.fitFill', 'Stretch to the box')}</option>
                                    </Select>
                                </FormField>
                                <FormField label={t('musicDesigner.artworkBg', 'Backdrop behind the art')}>
                                    <ColorInput value={selected.backgroundColor || 'rgba(0,0,0,0.35)'} onChange={v => updatePart(selected.id, { backgroundColor: v })} allowAlpha />
                                </FormField>
                            </>}

                            {selected.partType === 'seekBar' && <>
                                <FormField label={t('musicDesigner.seekFill', 'Filled part of the bar')}>
                                    <ColorInput value={selected.color || '#38bdf8'} onChange={v => updatePart(selected.id, { color: v })} allowAlpha />
                                </FormField>
                                <FormField label={t('musicDesigner.seekTrack', 'Rest of the bar')}>
                                    <ColorInput value={selected.trackColor || 'rgba(148,163,184,0.35)'} onChange={v => updatePart(selected.id, { trackColor: v })} allowAlpha />
                                </FormField>
                                <FormField label={t('musicDesigner.seekThumb', 'Drag handle')}>
                                    <ColorInput value={selected.thumbColor || '#e2e8f0'} onChange={v => updatePart(selected.id, { thumbColor: v })} allowAlpha />
                                </FormField>
                            </>}

                            {selected.partType === 'songList' && <>
                                <FormField label={t('musicDesigner.rowColor', 'Row color')}>
                                    <ColorInput value={selected.rowColor || 'rgba(255,255,255,0.05)'} onChange={v => updatePart(selected.id, { rowColor: v })} allowAlpha />
                                </FormField>
                                <FormField label={t('musicDesigner.playingRowColor', 'Now-playing row color')}>
                                    <ColorInput value={selected.playingRowColor || 'rgba(56,189,248,0.25)'} onChange={v => updatePart(selected.id, { playingRowColor: v })} allowAlpha />
                                </FormField>
                                <FormField label={t('musicDesigner.rowGap', 'Space between rows (px)')}>
                                    <TextInput type="number" min={0} value={selected.rowGap ?? 4} onChange={e => updatePart(selected.id, { rowGap: Math.max(0, parseFloat(e.target.value) || 0) })} />
                                </FormField>
                                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                                    <input type="checkbox" checked={selected.showArtworkInList ?? true} onChange={e => updatePart(selected.id, { showArtworkInList: e.target.checked })} className="accent-purple-500" />
                                    {t('musicDesigner.showArtworkInList', 'Little cover picture on each row')}
                                </label>
                                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                                    <input type="checkbox" checked={selected.showArtistInList ?? false} onChange={e => updatePart(selected.id, { showArtistInList: e.target.checked })} className="accent-purple-500" />
                                    {t('musicDesigner.showArtistInList', 'Artist under each song')}
                                </label>
                            </>}

                            {TEXT_PARTS.includes(selected.partType) && (
                                <FontEditor
                                    label={t('musicDesigner.textStyle', 'Text style')}
                                    font={selected.font || defaultFont}
                                    onFontChange={(prop, value) => updatePart(selected.id, { font: { ...(selected.font || defaultFont), [prop]: value } })}
                                />
                            )}
                        </>}
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                    <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)]">{t('common.cancel', 'Cancel')}</button>
                    <button type="button" onClick={() => onCommit(parts)} className="px-3 py-1.5 rounded-md text-xs bg-[var(--accent-purple)] text-white font-semibold">{t('common.done', 'Done')}</button>
                </div>
            </div>
        </div>, document.body);
};

export default MusicPlayerDesigner;

/** Inspector-side field: the button that opens the Designer (modal state lives here). */
export const MusicPlayerDesignField: React.FC<{
    element: UIMusicGalleryElement;
    project: VNProject;
    updateElement: (patch: Partial<UIMusicGalleryElement>) => void;
}> = ({ element, project, updateElement }) => {
    const { t } = useTranslation('ui');
    const [open, setOpen] = useState(false);
    return <>
        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('musicDesigner.sectionTitle', 'Player design')}</h4>
        <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full mt-1 px-3 py-1.5 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-purple)]"
        >
            🎵 {t('musicDesigner.openButton', 'Design the player…')}
        </button>
        <p className="text-[10px] text-[var(--text-muted)] mt-1">{t('musicDesigner.openHint', 'Move, resize, restyle, or hide every piece: song list, cover art, buttons, progress bar.')}</p>
        {open && (
            <MusicPlayerDesigner
                element={element}
                project={project}
                onCommit={parts => { updateElement({ parts }); setOpen(false); }}
                onClose={() => setOpen(false)}
            />
        )}
    </>;
};
