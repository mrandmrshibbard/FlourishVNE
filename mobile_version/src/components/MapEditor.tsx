/**
 * MapEditor — the visual travel-map designer (Systems → Maps, and "Edit maps…" from the phone's
 * Map-app settings). Authors pick a backdrop, then DRAG location markers straight onto the image:
 * icon pins / custom marker art / invisible regions, each with a target scene, unlock conditions,
 * and a locked look. Maps live in `project.maps` and are shown by the Show Map command, the
 * Show Map button action, and the phone's Map app.
 *
 * The canvas letterboxes the backdrop (contain-fit) and positions markers relative to the IMAGE
 * box, mirroring the runtime MapSurface — what you place is what players tap.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { VNID } from '../types';
import { VNMapConfig, VNMapLocation } from '../types/project';
import { useProject } from '../contexts/ProjectContext';
import { resolveFieldUrl } from '../utils/assetStore';
import { PHONE_GLYPHS, PHONE_ICON_KEYS } from '../features/ui/phoneIcons';
import ResizableDraggable from './menu-editor/ResizableDraggable';
import ConditionsEditor from './ui/ConditionsEditor';
import AssetSelector from './ui/AssetSelector';
import { FormField, Select, TextInput, ColorInput } from './ui/Form';
import FontEditor, { defaultFontSettings } from './ui/FontEditor';
import UIActionsListEditor from './ui/UIActionsListEditor';
import { defaultActionForType } from '../utils/actionMeta';
import { UIActionType, VNUIAction } from '../types/shared';
import { VNFontSettings } from '../features/ui/types';
import { PlusIcon, TrashIcon, SparklesIcon, XMarkIcon } from './icons';

const gid = (p: string) => `${p}-${Math.random().toString(36).substring(2, 9)}`;

const MapEditor: React.FC<{ isOpen: boolean; onClose: () => void; initialMapId?: VNID | null }> = ({ isOpen, onClose, initialMapId }) => {
    const { project, dispatch } = useProject();
    const { t } = useTranslation('ui');
    const maps = project.maps || {};
    const [activeMapId, setActiveMapId] = useState<VNID | null>(initialMapId || Object.keys(maps)[0] || null);
    const [selectedLocId, setSelectedLocId] = useState<VNID | null>(null);
    const map = activeMapId ? maps[activeMapId] : null;

    // ── project writes ──
    const writeMaps = (next: Record<VNID, VNMapConfig>) => dispatch({ type: 'UPDATE_PROJECT', payload: { maps: next } });
    const patchMap = (patch: Partial<VNMapConfig>) => { if (map) writeMaps({ ...maps, [map.id]: { ...map, ...patch } }); };
    const addMap = () => {
        const id = gid('vnmap');
        writeMaps({ ...maps, [id]: { id, name: `Map ${Object.keys(maps).length + 1}`, backgroundImage: null, locations: [] } });
        setActiveMapId(id);
        setSelectedLocId(null);
    };
    const removeMap = (id: VNID) => {
        const next = { ...maps };
        delete next[id];
        writeMaps(next);
        if (activeMapId === id) { setActiveMapId(Object.keys(next)[0] || null); setSelectedLocId(null); }
    };
    const patchLoc = (locId: VNID, patch: Partial<VNMapLocation>) => {
        if (!map) return;
        patchMap({ locations: map.locations.map(l => l.id === locId ? { ...l, ...patch } : l) });
    };
    const addLoc = () => {
        if (!map) return;
        const id = gid('loc');
        patchMap({ locations: [...map.locations, { id, name: `Location ${map.locations.length + 1}`, x: 50, y: 50, markerStyle: 'icon', actions: [defaultActionForType(UIActionType.JumpToScene, project)] }] });
        setSelectedLocId(id);
    };
    const removeLoc = (locId: VNID) => {
        if (!map) return;
        patchMap({ locations: map.locations.filter(l => l.id !== locId) });
        if (selectedLocId === locId) setSelectedLocId(null);
    };

    // ── canvas: contain-fit the backdrop, position markers inside the IMAGE box ──
    const canvasRef = useRef<HTMLDivElement>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
    useEffect(() => {
        const el = canvasRef.current;
        if (!el) return;
        const obs = new ResizeObserver(() => setCanvasSize({ width: el.clientWidth, height: el.clientHeight }));
        obs.observe(el);
        return () => obs.disconnect();
    }, [isOpen, activeMapId]);
    const bgRef = map?.backgroundImage || null;
    const bgUrl = bgRef ? (resolveFieldUrl(project.id, (project.images as any)?.[bgRef.id]?.imageUrl || (project.backgrounds as any)?.[bgRef.id]?.imageUrl || (project.images as any)?.[bgRef.id]?.videoUrl || (project.backgrounds as any)?.[bgRef.id]?.videoUrl || (project.videos as any)?.[bgRef.id]?.videoUrl) || null) : null;
    // Contain-fit box in px within the canvas (falls back to the full canvas until the image loads).
    const imageBox = useMemo(() => {
        if (!canvasSize.width || !canvasSize.height) return { left: 0, top: 0, width: 0, height: 0 };
        if (!naturalSize) return { left: 0, top: 0, width: canvasSize.width, height: canvasSize.height };
        const scale = Math.min(canvasSize.width / naturalSize.w, canvasSize.height / naturalSize.h);
        const w = naturalSize.w * scale, h = naturalSize.h * scale;
        return { left: (canvasSize.width - w) / 2, top: (canvasSize.height - h) / 2, width: w, height: h };
    }, [canvasSize, naturalSize]);
    const markerSize = Math.max(2, map?.markerSize ?? 6);

    if (!isOpen) return null;
    const backdrop = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); };
    const selectedLoc = map?.locations.find(l => l.id === selectedLocId) || null;
    const mediaRef = (id: VNID | null): { type: 'image' | 'video'; id: VNID } | null => {
        if (!id) return null;
        const isVid = !!(project.videos as any)?.[id] || !!((project.images as any)?.[id]?.videoUrl) || !!((project.backgrounds as any)?.[id]?.videoUrl);
        return { type: isVid ? 'video' : 'image', id };
    };

    // z-[10000]: editor canvas layers reach z-100+, which punches through a z-50 overlay.
    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={backdrop}>
            <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl shadow-2xl w-[94vw] h-[88vh] m-4 border border-slate-700 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between p-3 border-b border-slate-700 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg"><SparklesIcon className="w-5 h-5 text-purple-400" /></div>
                        <div>
                            <h2 className="text-base font-semibold text-white">{t('mapEditor.title', 'Map Editor')}</h2>
                            <p className="text-xs text-slate-400">{t('mapEditor.subtitle', 'Drag locations onto your map. Players tap them to travel.')}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg"><XMarkIcon className="w-5 h-5 text-slate-400" /></button>
                </div>

                <div className="flex-1 min-h-0 flex">
                    {/* ── Map list ── */}
                    <div className="w-52 flex-shrink-0 border-r border-slate-700 flex flex-col">
                        <div className="p-2 space-y-1 overflow-y-auto flex-1">
                            {(Object.values(maps) as VNMapConfig[]).map(m => (
                                <div key={m.id} className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer ${m.id === activeMapId ? 'bg-purple-500/20 border border-purple-500/50' : 'hover:bg-slate-800 border border-transparent'}`}
                                    onClick={() => { setActiveMapId(m.id); setSelectedLocId(null); }}>
                                    <span className="text-sm text-white truncate flex-1">🗺️ {m.name}</span>
                                    <button onClick={e => { e.stopPropagation(); removeMap(m.id); }} className="p-0.5 text-red-400 opacity-0 group-hover:opacity-100" title={t('mapEditor.deleteMap', 'Delete map')}><TrashIcon className="w-3.5 h-3.5" /></button>
                                </div>
                            ))}
                        </div>
                        <button onClick={addMap} className="m-2 p-1.5 text-xs rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center gap-1 flex-shrink-0"><PlusIcon className="w-3 h-3" /> {t('mapEditor.newMap', 'New map')}</button>
                    </div>

                    {/* ── Canvas ── */}
                    <div className="flex-1 min-w-0 flex flex-col">
                        {map ? <>
                            <div className="flex items-center gap-2 p-2 border-b border-slate-700 flex-shrink-0">
                                <input value={map.name} onChange={e => patchMap({ name: e.target.value })} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-purple-500 w-48" />
                                <button onClick={addLoc} className="px-2.5 py-1 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1"><PlusIcon className="w-3 h-3" /> {t('mapEditor.addLocation', 'Add location')}</button>
                                <span className="text-[10px] text-slate-500">{t('mapEditor.dragHint', 'Drag markers to place them. Click one to edit it on the right.')}</span>
                            </div>
                            <div ref={canvasRef} className="flex-1 min-h-0 relative bg-slate-950 m-2 rounded-lg overflow-hidden" onMouseDown={() => setSelectedLocId(null)}>
                                {bgUrl ? (
                                    bgRef?.type === 'video'
                                        ? <video src={bgUrl} autoPlay loop muted playsInline onLoadedMetadata={e => setNaturalSize({ w: (e.target as HTMLVideoElement).videoWidth || 16, h: (e.target as HTMLVideoElement).videoHeight || 9 })} className="absolute" style={{ left: imageBox.left, top: imageBox.top, width: imageBox.width, height: imageBox.height }} />
                                        : <img src={bgUrl} alt="" onLoad={e => setNaturalSize({ w: (e.target as HTMLImageElement).naturalWidth || 16, h: (e.target as HTMLImageElement).naturalHeight || 9 })} className="absolute" style={{ left: imageBox.left, top: imageBox.top, width: imageBox.width, height: imageBox.height }} />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">{t('mapEditor.pickBackdrop', 'Pick a map image on the right →')}</div>
                                )}
                                {/* Marker layer = the contain-fit image box (marker % = image %) */}
                                <div className="absolute" style={{ left: imageBox.left, top: imageBox.top, width: imageBox.width, height: imageBox.height }}>
                                    {map.locations.map(loc => {
                                        const isRegion = (loc.markerStyle || 'icon') === 'region';
                                        const markerUrl = loc.markerStyle === 'image' && loc.markerImage ? resolveFieldUrl(project.id, (project.images as any)?.[loc.markerImage.id]?.imageUrl || (project.backgrounds as any)?.[loc.markerImage.id]?.imageUrl) : null;
                                        return (
                                            <ResizableDraggable key={loc.id}
                                                x={loc.x} y={loc.y}
                                                width={isRegion ? (loc.width ?? 12) : markerSize}
                                                height={isRegion ? (loc.height ?? 12) : markerSize * (imageBox.width && imageBox.height ? imageBox.width / imageBox.height : 1)}
                                                anchorX={isRegion ? 0 : 0.5} anchorY={isRegion ? 0 : 0.5}
                                                parentSize={{ width: imageBox.width || 1, height: imageBox.height || 1 }}
                                                isSelected={selectedLocId === loc.id}
                                                onSelect={() => setSelectedLocId(loc.id)}
                                                onUpdate={u => patchLoc(loc.id, isRegion ? { x: u.x, y: u.y, width: u.width, height: u.height } : { x: u.x, y: u.y })}
                                                label={loc.name}>
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', containerType: 'size', ...(isRegion ? { background: 'rgba(99,102,241,0.25)', border: '1.5px dashed rgba(99,102,241,0.8)', borderRadius: 6 } : {}) } as React.CSSProperties}>
                                                    {!isRegion && (markerUrl
                                                        ? <img src={markerUrl} alt="" style={{ width: '92cqmin', height: '92cqmin', objectFit: 'contain' }} />
                                                        : <span style={{ fontSize: '70cqmin', lineHeight: 1, color: map.markerColor || '#ef4444', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>{(loc.builtinIcon && PHONE_GLYPHS[loc.builtinIcon]) || '📍'}</span>)}
                                                </div>
                                            </ResizableDraggable>
                                        );
                                    })}
                                </div>
                            </div>
                        </> : (
                            <div className="flex-1 flex items-center justify-center text-slate-500">{t('mapEditor.noMap', 'Create a map to get started.')}</div>
                        )}
                    </div>

                    {/* ── Properties ── */}
                    <div className="w-72 flex-shrink-0 border-l border-slate-700 overflow-y-auto p-3 space-y-3">
                        {map && <>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t('mapEditor.mapSettings', 'Map settings')}</h3>
                            <AssetSelector label={t('mapEditor.backdrop', 'Map image / video')} assetType="images" allowVideo value={map.backgroundImage?.id || null} onChange={id => { setNaturalSize(null); patchMap({ backgroundImage: mediaRef(id) }); }} />
                            <div className="grid grid-cols-2 gap-2">
                                <FormField label={t('mapEditor.markerColor', 'Marker color')}><ColorInput value={map.markerColor || '#ef4444'} onChange={v => patchMap({ markerColor: v })} /></FormField>
                                <FormField label={t('mapEditor.markerSize', 'Marker size %')}><TextInput type="number" min={2} max={30} value={map.markerSize ?? 6} onChange={e => patchMap({ markerSize: Math.max(2, Math.min(30, parseInt(e.target.value) || 6)) })} /></FormField>
                            </div>
                            <FontEditor label={t('mapEditor.labelStyle', 'Label text style (all points)')} font={(map.labelFont as VNFontSettings) ?? defaultFontSettings} onFontChange={(prop, value) => patchMap({ labelFont: { ...((map.labelFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })} />
                            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={!!map.confirmTravel} onChange={e => patchMap({ confirmTravel: e.target.checked || undefined })} className="w-4 h-4" />
                                {t('mapEditor.confirmTravel', 'Ask before traveling')}
                            </label>
                            {map.confirmTravel && <FormField label={t('mapEditor.confirmText', 'Confirm text')}><TextInput value={map.confirmText || ''} placeholder={t('hc.travelToName', 'Travel to {name}?')} onChange={e => patchMap({ confirmText: e.target.value || undefined })} /></FormField>}

                            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={map.allowZoom !== false} onChange={e => patchMap({ allowZoom: e.target.checked ? undefined : false })} className="w-4 h-4" />
                                {t('mapEditor.allowZoom', 'Let players zoom & pan this map')}
                            </label>
                            {map.allowZoom !== false && (
                                <FormField label={t('mapEditor.maxZoom', 'Maximum zoom (×)')}>
                                    <TextInput type="number" min={1.2} max={8} step={0.5} value={map.maxZoom ?? 3} onChange={e => patchMap({ maxZoom: Math.max(1.2, Math.min(8, parseFloat(e.target.value) || 3)) })} />
                                </FormField>
                            )}

                            <hr className="border-slate-700" />
                            {selectedLoc ? <>
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t('mapEditor.location', 'Location')}</h3>
                                    <button onClick={() => removeLoc(selectedLoc.id)} className="p-1 text-red-400 hover:text-red-300" title={t('mapEditor.deleteLocation', 'Delete location')}><TrashIcon className="w-3.5 h-3.5" /></button>
                                </div>
                                <FormField label={t('mapEditor.locName', 'Name')}><TextInput value={selectedLoc.name} onChange={e => patchLoc(selectedLoc.id, { name: e.target.value })} /></FormField>
                                <FormField label={t('mapEditor.marker', 'Marker')}>
                                    <Select value={selectedLoc.markerStyle || 'icon'} onChange={e => patchLoc(selectedLoc.id, { markerStyle: e.target.value as any })}>
                                        <option value="icon">{t('mapEditor.markerIcon', 'Icon pin')}</option>
                                        <option value="image">{t('mapEditor.markerImage', 'Custom image')}</option>
                                        <option value="region">{t('mapEditor.markerRegion', 'Invisible region (over the art)')}</option>
                                    </Select>
                                </FormField>
                                {(selectedLoc.markerStyle || 'icon') === 'icon' && (
                                    <FormField label={t('mapEditor.icon', 'Icon')}>
                                        <Select value={selectedLoc.builtinIcon || ''} onChange={e => patchLoc(selectedLoc.id, { builtinIcon: e.target.value || undefined })}>
                                            <option value="">📍 {t('mapEditor.defaultPin', 'default pin')}</option>
                                            {PHONE_ICON_KEYS.map(k => <option key={k} value={k}>{PHONE_GLYPHS[k]} {k}</option>)}
                                        </Select>
                                    </FormField>
                                )}
                                {selectedLoc.markerStyle === 'image' && (
                                    <AssetSelector label={t('mapEditor.markerArt', 'Marker art')} assetType="images" value={selectedLoc.markerImage?.id || null} onChange={id => patchLoc(selectedLoc.id, { markerImage: id ? { type: 'image', id } : null })} />
                                )}
                                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                                    <input type="checkbox" checked={selectedLoc.showLabel !== false} onChange={e => patchLoc(selectedLoc.id, { showLabel: e.target.checked ? undefined : false })} className="w-4 h-4" />
                                    {t('mapEditor.showLabel', 'Show a label on this point')}
                                </label>
                                {selectedLoc.showLabel !== false && <>
                                    <FormField label={t('mapEditor.label', 'Label players see')}><TextInput value={selectedLoc.label || ''} placeholder={selectedLoc.name} onChange={e => patchLoc(selectedLoc.id, { label: e.target.value || undefined })} /></FormField>
                                    <AssetSelector label={t('mapEditor.labelImage', 'Image label (optional — replaces the text)')} assetType="images" value={selectedLoc.labelImage?.id || null} onChange={id => patchLoc(selectedLoc.id, { labelImage: id ? { type: 'image', id } : null })} />
                                    {!selectedLoc.labelImage && (
                                        <FontEditor label={t('mapEditor.labelStylePoint', 'Label text style (this point)')} font={(selectedLoc.labelFont as VNFontSettings) ?? (map.labelFont as VNFontSettings) ?? defaultFontSettings} onFontChange={(prop, value) => patchLoc(selectedLoc.id, { labelFont: { ...((selectedLoc.labelFont as VNFontSettings) ?? (map.labelFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })} />
                                    )}
                                </>}
                                <UIActionsListEditor actions={(selectedLoc.actions as VNUIAction[]) || []} project={project} onChange={acts => patchLoc(selectedLoc.id, { actions: acts })} label={t('mapEditor.onTap', 'When tapped, do…')} />
                                <ConditionsEditor collapsible title={t('mapEditor.unlockWhen', 'Unlocked when…')} conditions={selectedLoc.conditions || []} project={project} onChange={(cs: any) => patchLoc(selectedLoc.id, { conditions: cs && cs.length ? cs : undefined })} />
                                <FormField label={t('mapEditor.lockedLook', 'While locked')}>
                                    <Select value={selectedLoc.lockedAppearance || 'hidden'} onChange={e => patchLoc(selectedLoc.id, { lockedAppearance: e.target.value as any })}>
                                        <option value="hidden">{t('mapEditor.lockedHidden', 'Hidden entirely')}</option>
                                        <option value="dimmed">{t('mapEditor.lockedDimmed', 'Dimmed (visible, untappable)')}</option>
                                        <option value="lockedIcon">{t('mapEditor.lockedIcon', '🔒 lock icon')}</option>
                                    </Select>
                                </FormField>
                                {(selectedLoc.lockedAppearance === 'dimmed' || selectedLoc.lockedAppearance === 'lockedIcon') && (
                                    <FormField label={t('mapEditor.lockedLabel', 'Locked label')}><TextInput value={selectedLoc.lockedLabel || ''} placeholder="???" onChange={e => patchLoc(selectedLoc.id, { lockedLabel: e.target.value || undefined })} /></FormField>
                                )}
                            </> : (
                                <p className="text-[11px] text-slate-500">{t('mapEditor.selectLocation', 'Click a marker on the map (or Add location) to edit its name, destination, and unlock rules.')}</p>
                            )}
                        </>}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default MapEditor;
