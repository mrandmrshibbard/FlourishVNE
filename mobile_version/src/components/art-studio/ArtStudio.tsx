/**
 * Art Studio — the author-side drawing surface (Mini Games tab → 🎨 Art Studio).
 *
 * Draw game art without leaving FlourishVNE: brush / airbrush / paint can (flood fill) /
 * eraser / eyedropper over an optional locked base image, with named color palettes stored
 * at project.artPalettes (shared with coloring mini games). MASK MODE paints pure white on
 * transparency — the one-click source for wipe cover areas and paint-region masks.
 *
 * The drawing lives on its own layer above the base; saving exports a PNG (flattened with
 * the base, or the drawing alone) as a normal image asset via ADD_ASSET — the Studio never
 * modifies the source asset. Editor-only: no engine involvement.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { VNID } from '../../types';
import { VNArtPalette } from '../../types/miniGames';
import { useProject } from '../../contexts/ProjectContext';
import { resolveFieldUrl } from '../../utils/assetStore';
import AssetSelector from '../ui/AssetSelector';
import { FormField, TextInput, ColorInput, RangeInput } from '../ui/Form';
import { PlusIcon, TrashIcon, XMarkIcon } from '../icons';

const gid = (p: string) => `${p}-${Math.random().toString(36).substring(2, 9)}`;
const MAX_DIM = 2048;
const CHECKER: React.CSSProperties = { backgroundImage: 'repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%)', backgroundSize: '20px 20px' };

type Tool = 'brush' | 'airbrush' | 'fill' | 'eraser' | 'eyedropper';

/** Scanline-free BFS flood fill: finds the contiguous similar-color region on the COMPOSITE
 *  (base + drawing, so line-art on the base bounds the fill) and paints it into the drawing
 *  layer. Tolerance is per-channel. Tainted base (rare) → fill silently does nothing. */
function floodFill(drawCanvas: HTMLCanvasElement, baseImg: HTMLImageElement | null, sx: number, sy: number, hex: string) {
    const w = drawCanvas.width, h = drawCanvas.height;
    const comp = document.createElement('canvas');
    comp.width = w; comp.height = h;
    const cctx = comp.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
    if (!cctx) return;
    if (baseImg) cctx.drawImage(baseImg, 0, 0, w, h);
    cctx.drawImage(drawCanvas, 0, 0);
    let img: ImageData;
    try { img = cctx.getImageData(0, 0, w, h); } catch { return; }
    const d = img.data;
    const idx = (x: number, y: number) => (y * w + x) * 4;
    const si = idx(Math.floor(sx), Math.floor(sy));
    const tr = d[si], tg = d[si + 1], tb = d[si + 2], ta = d[si + 3];
    const m = hex.replace('#', '');
    const fr = parseInt(m.substring(0, 2), 16), fg = parseInt(m.substring(2, 4), 16), fb = parseInt(m.substring(4, 6), 16);
    if (Math.abs(tr - fr) <= 4 && Math.abs(tg - fg) <= 4 && Math.abs(tb - fb) <= 4 && ta > 250) return; // already this color
    const TOL = 32;
    const match = (i: number) => Math.abs(d[i] - tr) <= TOL && Math.abs(d[i + 1] - tg) <= TOL && Math.abs(d[i + 2] - tb) <= TOL && Math.abs(d[i + 3] - ta) <= TOL;
    const mask = new Uint8Array(w * h);
    const stack: number[] = [Math.floor(sx), Math.floor(sy)];
    while (stack.length) {
        const y = stack.pop() as number, x = stack.pop() as number;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const p = y * w + x;
        if (mask[p] || !match(p * 4)) continue;
        mask[p] = 1;
        stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    const out = new ImageData(w, h);
    for (let p = 0; p < w * h; p++) {
        if (!mask[p]) continue;
        const o = p * 4;
        out.data[o] = fr; out.data[o + 1] = fg; out.data[o + 2] = fb; out.data[o + 3] = 255;
    }
    const fillLayer = document.createElement('canvas');
    fillLayer.width = w; fillLayer.height = h;
    fillLayer.getContext('2d')!.putImageData(out, 0, 0);
    drawCanvas.getContext('2d')!.drawImage(fillLayer, 0, 0);
}

const ArtStudio: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { project, dispatch } = useProject();
    const { t } = useTranslation('ui');

    // ── setup phase: pick a canvas size or a base image ──
    const [surface, setSurface] = useState<{ w: number; h: number; baseId: VNID | null; baseUrl: string | null } | null>(null);
    const [customW, setCustomW] = useState(1280);
    const [customH, setCustomH] = useState(720);
    const [setupBaseId, setSetupBaseId] = useState<VNID | null>(null);

    // ── tools ──
    const [tool, setTool] = useState<Tool>('brush');
    const [brushSize, setBrushSize] = useState(36);
    const [opacity, setOpacity] = useState(1);
    const [soft, setSoft] = useState(true);
    const [color, setColor] = useState('#e35d5d');
    const [maskMode, setMaskMode] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);
    const [savedNote, setSavedNote] = useState<string | null>(null);
    const [saveName, setSaveName] = useState('');
    const [flatten, setFlatten] = useState(true);
    const [, forceRender] = useState(0);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const baseImgRef = useRef<HTMLImageElement | null>(null);
    const lastRef = useRef<{ x: number; y: number } | null>(null);
    const sprayRef = useRef<number | null>(null);
    const undoRef = useRef<string[]>([]);
    const redoRef = useRef<string[]>([]);

    const paintColor = maskMode ? '#ffffff' : color;

    const resolveImg = (id: VNID | null): string | null => {
        if (!id) return null;
        const img = (project.images as any)?.[id], bg = (project.backgrounds as any)?.[id];
        return resolveFieldUrl(project.id, img?.imageUrl || bg?.imageUrl || null);
    };

    // Load the base image element once a surface exists.
    useEffect(() => {
        baseImgRef.current = null;
        if (!surface?.baseUrl) return;
        const img = new Image();
        img.onload = () => { baseImgRef.current = img; forceRender(x => x + 1); };
        img.src = surface.baseUrl;
    }, [surface?.baseUrl]);

    useEffect(() => () => { if (sprayRef.current != null) clearInterval(sprayRef.current); }, []);

    const startWithSize = (w: number, h: number) => setSurface({ w: Math.min(MAX_DIM, Math.max(64, Math.round(w))), h: Math.min(MAX_DIM, Math.max(64, Math.round(h))), baseId: null, baseUrl: null });
    const startWithBase = () => {
        const url = resolveImg(setupBaseId);
        if (!url) return;
        const probe = new Image();
        probe.onload = () => {
            const scale = Math.min(1, MAX_DIM / Math.max(probe.naturalWidth || 1280, probe.naturalHeight || 720));
            setSurface({ w: Math.round((probe.naturalWidth || 1280) * scale), h: Math.round((probe.naturalHeight || 720) * scale), baseId: setupBaseId, baseUrl: url });
        };
        probe.src = url;
    };

    // ── stroke machinery ──
    const canvasPoint = (e: React.PointerEvent) => {
        const c = canvasRef.current as HTMLCanvasElement;
        const rect = c.getBoundingClientRect();
        return { x: ((e.clientX - rect.left) / rect.width) * c.width, y: ((e.clientY - rect.top) / rect.height) * c.height };
    };
    const pushUndo = () => {
        const c = canvasRef.current;
        if (!c) return;
        undoRef.current.push(c.toDataURL());
        if (undoRef.current.length > 30) undoRef.current.shift();
        redoRef.current = [];
    };
    const restore = (dataUrl: string | undefined) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx || !canvasRef.current) return;
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        if (dataUrl) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = dataUrl; }
    };
    const undo = () => { const c = canvasRef.current; if (!c || !undoRef.current.length) return; redoRef.current.push(c.toDataURL()); restore(undoRef.current.pop()); };
    const redo = () => { const c = canvasRef.current; if (!c || !redoRef.current.length) return; undoRef.current.push(c.toDataURL()); restore(redoRef.current.pop()); };

    const stamp = (x: number, y: number) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        const r = brushSize / 2;
        ctx.save();
        if (tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#000'; ctx.fill();
        } else if (tool === 'airbrush') {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, paintColor);
            g.addColorStop(1, paintColor + '00');
            ctx.globalAlpha = 0.1 * opacity;
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.globalAlpha = opacity;
            if (soft) {
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, paintColor);
                g.addColorStop(0.7, paintColor);
                g.addColorStop(1, paintColor + '00');
                ctx.fillStyle = g;
            } else ctx.fillStyle = paintColor;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    };

    const eyedrop = (x: number, y: number) => {
        const c = canvasRef.current;
        if (!c) return;
        const comp = document.createElement('canvas');
        comp.width = c.width; comp.height = c.height;
        const cctx = comp.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
        if (!cctx) return;
        if (baseImgRef.current) cctx.drawImage(baseImgRef.current, 0, 0, c.width, c.height);
        cctx.drawImage(c, 0, 0);
        try {
            const p = cctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
            if (p[3] > 8) setColor('#' + [p[0], p[1], p[2]].map(v => v.toString(16).padStart(2, '0')).join(''));
        } catch { /* tainted base — eyedropper unavailable */ }
    };

    const onPointerDown = (e: React.PointerEvent) => {
        const c = canvasRef.current;
        if (!c) return;
        const p = canvasPoint(e);
        if (tool === 'eyedropper') { eyedrop(p.x, p.y); return; }
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        pushUndo();
        setDirty(true);
        if (tool === 'fill') { floodFill(c, baseImgRef.current, p.x, p.y, paintColor); return; }
        lastRef.current = p;
        stamp(p.x, p.y);
        if (tool === 'airbrush') {
            if (sprayRef.current != null) clearInterval(sprayRef.current);
            sprayRef.current = window.setInterval(() => { if (lastRef.current) stamp(lastRef.current.x, lastRef.current.y); }, 30);
        }
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!lastRef.current || tool === 'fill' || tool === 'eyedropper') return;
        const p = canvasPoint(e);
        const last = lastRef.current;
        const dist = Math.hypot(p.x - last.x, p.y - last.y);
        const step = Math.max(2, brushSize / 4);
        for (let d = step; d <= dist; d += step) stamp(last.x + ((p.x - last.x) * d) / dist, last.y + ((p.y - last.y) * d) / dist);
        if (dist >= step) lastRef.current = p;
        else if (tool !== 'airbrush') lastRef.current = p;
    };
    const endStroke = () => {
        lastRef.current = null;
        if (sprayRef.current != null) { clearInterval(sprayRef.current); sprayRef.current = null; }
    };

    const clearAll = () => { pushUndo(); restore(undefined); };

    // ── palettes (project.artPalettes) ──
    const palettes: VNArtPalette[] = project.artPalettes || [];
    const [activePaletteId, setActivePaletteId] = useState<VNID | null>(palettes[0]?.id || null);
    const activePalette = palettes.find(p => p.id === activePaletteId) || null;
    const writePalettes = (next: VNArtPalette[]) => dispatch({ type: 'UPDATE_PROJECT', payload: { artPalettes: next } });
    const addPalette = () => {
        const p: VNArtPalette = { id: gid('pal'), name: `Palette ${palettes.length + 1}`, colors: [color] };
        writePalettes([...palettes, p]);
        setActivePaletteId(p.id);
    };
    const patchPalette = (id: VNID, patch: Partial<VNArtPalette>) => writePalettes(palettes.map(p => p.id === id ? { ...p, ...patch } : p));
    const removePalette = (id: VNID) => {
        writePalettes(palettes.filter(p => p.id !== id));
        if (activePaletteId === id) setActivePaletteId(null);
    };

    // ── save as asset ──
    const saveAsset = () => {
        const c = canvasRef.current;
        if (!c || !surface) return;
        const out = document.createElement('canvas');
        out.width = surface.w; out.height = surface.h;
        const octx = out.getContext('2d')!;
        if (flatten && !maskMode && baseImgRef.current) octx.drawImage(baseImgRef.current, 0, 0, surface.w, surface.h);
        octx.drawImage(c, 0, 0);
        let dataUrl: string;
        try { dataUrl = out.toDataURL('image/png'); } catch { setSavedNote(t('artStudio.taintError', 'This base image can’t be exported (cross-origin) — try “drawing only”.')); return; }
        const name = saveName.trim() || (maskMode ? `Mask ${new Date().toLocaleTimeString()}` : `Artwork ${new Date().toLocaleTimeString()}`);
        const id = gid('img');
        dispatch({ type: 'ADD_ASSET', payload: { assetType: 'images', asset: { id, name, path: '', imageUrl: dataUrl } as any } });
        setDirty(false);
        setSavedNote(t('artStudio.saved', { defaultValue: 'Saved “{{name}}” to Assets → Images ✓', name }));
        window.setTimeout(() => setSavedNote(null), 3500);
    };

    const toolBtn = (id: Tool, glyph: string, label: string) => (
        <button key={id} onClick={() => setTool(id)} title={label}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${tool === id ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200' : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-400'}`}>
            {glyph} {label}
        </button>
    );

    // z-[10000]: editor canvas layers reach z-100+, which punches through a z-50 overlay.
    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 backdrop-blur-sm">
            <div className="w-[min(1280px,97vw)] h-[min(840px,95vh)] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700">
                    <h3 className="text-white font-bold">🎨 {t('artStudio.title', 'Art Studio')}{maskMode ? ` — ${t('artStudio.maskModeTag', 'Mask mode')}` : ''}{dirty ? ' •' : ''}</h3>
                    <div className="flex items-center gap-2">
                        {savedNote && <span className="text-xs text-emerald-300">{savedNote}</span>}
                        <button onClick={() => (dirty ? setConfirmClose(true) : onClose())} className="text-slate-400 hover:text-white"><XMarkIcon className="w-5 h-5" /></button>
                    </div>
                </div>

                {!surface ? (
                    /* ── setup: size or base image ── */
                    <div className="flex-1 flex items-center justify-center p-6">
                        <div className="w-[min(560px,90%)] space-y-4">
                            <h4 className="text-slate-200 font-semibold text-sm">{t('artStudio.setupTitle', 'What are we making?')}</h4>
                            <div className="grid grid-cols-3 gap-2">
                                <button onClick={() => startWithSize(1280, 720)} className="rounded-xl border border-slate-600 bg-slate-800 hover:border-emerald-400 p-3 text-left">
                                    <div className="text-lg">🖼️</div><div className="text-xs font-semibold text-slate-200 mt-1">1280 × 720</div><div className="text-[10px] text-slate-400">{t('artStudio.sizeScene', 'Scene-sized art')}</div>
                                </button>
                                <button onClick={() => startWithSize(1024, 1024)} className="rounded-xl border border-slate-600 bg-slate-800 hover:border-emerald-400 p-3 text-left">
                                    <div className="text-lg">⬜</div><div className="text-xs font-semibold text-slate-200 mt-1">1024 × 1024</div><div className="text-[10px] text-slate-400">{t('artStudio.sizeSquare', 'Square (stamps, brushes)')}</div>
                                </button>
                                <div className="rounded-xl border border-slate-600 bg-slate-800 p-3">
                                    <div className="text-lg">📐</div>
                                    <div className="flex items-center gap-1 mt-1">
                                        <input type="number" value={customW} min={64} max={MAX_DIM} onChange={e => setCustomW(Number(e.target.value) || 64)} className="w-16 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-xs text-slate-200" />
                                        <span className="text-slate-500 text-xs">×</span>
                                        <input type="number" value={customH} min={64} max={MAX_DIM} onChange={e => setCustomH(Number(e.target.value) || 64)} className="w-16 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-xs text-slate-200" />
                                    </div>
                                    <button onClick={() => startWithSize(customW, customH)} className="mt-1.5 w-full text-[11px] font-semibold text-emerald-300 hover:text-emerald-200">{t('artStudio.sizeCustom', 'Start custom →')}</button>
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-600 bg-slate-800 p-3 space-y-2">
                                <div className="text-xs font-semibold text-slate-200">{t('artStudio.baseTitle', '…or paint over one of your images')}</div>
                                <AssetSelector label={t('artStudio.basePick', 'Base image (stays untouched — you paint on a layer above it)')} assetType="images" value={setupBaseId} onChange={setSetupBaseId} />
                                <button onClick={startWithBase} disabled={!setupBaseId} className="w-full px-2 py-1.5 rounded-md text-xs font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white">{t('artStudio.baseStart', 'Open in the Studio')}</button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 flex">
                        {/* ── canvas ── */}
                        <div className="flex-1 min-w-0 flex flex-col">
                            {/* tool bar */}
                            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-700/70">
                                {toolBtn('brush', '🖌️', t('artStudio.brush', 'Brush'))}
                                {toolBtn('airbrush', '💨', t('artStudio.airbrush', 'Airbrush'))}
                                {toolBtn('fill', '🪣', t('artStudio.fill', 'Paint can'))}
                                {toolBtn('eraser', '🧼', t('artStudio.eraser', 'Eraser'))}
                                {toolBtn('eyedropper', '💉', t('artStudio.eyedropper', 'Pick color'))}
                                {(tool === 'brush') && (
                                    <label className="flex items-center gap-1 text-[11px] text-slate-400">
                                        <input type="checkbox" className="w-3.5 h-3.5" checked={soft} onChange={e => setSoft(e.target.checked)} /> {t('artStudio.softEdge', 'soft edge')}
                                    </label>
                                )}
                                <span className="text-[11px] text-slate-400 ml-1">{t('artStudio.size', 'Size')}</span>
                                <input type="range" min={4} max={200} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="w-28" />
                                <span className="text-[11px] text-slate-400">{t('artStudio.opacity', 'Opacity')}</span>
                                <input type="range" min={5} max={100} value={Math.round(opacity * 100)} onChange={e => setOpacity(Number(e.target.value) / 100)} className="w-20" />
                                <span className="flex-1" />
                                <button onClick={undo} className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-700 hover:bg-slate-600 text-white">↶</button>
                                <button onClick={redo} className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-700 hover:bg-slate-600 text-white">↷</button>
                                <button onClick={clearAll} className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-700 hover:bg-slate-600 text-white">{t('artStudio.clear', 'Clear')}</button>
                            </div>
                            {/* surface */}
                            <div className="flex-1 min-h-0 flex items-center justify-center p-3">
                                <div className="relative max-w-full max-h-full rounded-lg overflow-hidden border border-slate-600" style={{ aspectRatio: `${surface.w} / ${surface.h}`, ...( !surface.baseUrl || maskMode ? CHECKER : {} ), width: 'min(100%, calc((100vh - 260px) * ' + (surface.w / surface.h) + '))' }}>
                                    {surface.baseUrl && <img src={surface.baseUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: maskMode ? 0.45 : 1 }} />}
                                    <canvas ref={canvasRef} width={surface.w} height={surface.h}
                                        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endStroke} onPointerCancel={endStroke} onPointerLeave={endStroke}
                                        className="absolute inset-0 w-full h-full"
                                        style={{ touchAction: 'none', cursor: tool === 'eyedropper' ? 'copy' : 'crosshair' }} />
                                </div>
                            </div>
                        </div>

                        {/* ── right panel: color, palettes, mask, save ── */}
                        <div className="w-72 flex-shrink-0 border-l border-slate-700 overflow-y-auto p-3 space-y-3">
                            <FormField label={t('artStudio.color', 'Color')}>
                                <ColorInput value={paintColor} onChange={setColor} disabled={maskMode} />
                            </FormField>
                            <label className="flex items-start gap-2">
                                <input type="checkbox" className="w-4 h-4 mt-0.5" checked={maskMode} onChange={e => setMaskMode(e.target.checked)} />
                                <span className="text-xs text-slate-300">{t('artStudio.maskMode', 'Mask mode')} <span className="block text-[10px] text-slate-500">{t('artStudio.maskModeHint', 'Paints pure white on transparency — perfect for wipe cover areas and paint-region masks. The base dims so you can trace it.')}</span></span>
                            </label>

                            <div className="rounded-lg border border-slate-700/60 p-2 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-300">{t('artStudio.palettes', 'Color palettes')}</span>
                                    <button onClick={addPalette} title={t('artStudio.newPalette', 'New palette')} className="text-slate-400 hover:text-white"><PlusIcon className="w-4 h-4" /></button>
                                </div>
                                {palettes.length > 0 && (
                                    <select value={activePaletteId || ''} onChange={e => setActivePaletteId(e.target.value || null)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200">
                                        <option value="">{t('artStudio.noPalette', '— pick a palette —')}</option>
                                        {palettes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                )}
                                {activePalette && <>
                                    <TextInput value={activePalette.name} onChange={(e: any) => patchPalette(activePalette.id, { name: e.target.value })} />
                                    <div className="flex flex-wrap gap-1.5">
                                        {activePalette.colors.map((c, i) => (
                                            <div key={i} className="relative group">
                                                <button onClick={() => setColor(c)} title={c} className="w-7 h-7 rounded-md border border-slate-500" style={{ background: c }} />
                                                <button onClick={() => patchPalette(activePalette.id, { colors: activePalette.colors.filter((_, j) => j !== i) })}
                                                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-700 text-slate-300 text-[9px] leading-none opacity-0 group-hover:opacity-100">✕</button>
                                            </div>
                                        ))}
                                        <button onClick={() => patchPalette(activePalette.id, { colors: [...activePalette.colors, color] })} title={t('artStudio.addSwatch', 'Add the current color')}
                                            className="w-7 h-7 rounded-md border border-dashed border-slate-500 text-slate-400 hover:text-white text-sm">+</button>
                                    </div>
                                    <button onClick={() => removePalette(activePalette.id)} className="w-full text-[10px] text-slate-500 hover:text-red-400 flex items-center justify-center gap-1"><TrashIcon className="w-3 h-3" /> {t('artStudio.deletePalette', 'Delete this palette')}</button>
                                </>}
                                <p className="text-[10px] text-slate-500">{t('artStudio.palettesHint', 'Palettes are saved with the project — coloring mini games can offer them to players.')}</p>
                            </div>

                            <div className="rounded-lg border border-slate-700/60 p-2 space-y-2">
                                <div className="text-xs font-semibold text-slate-300">{t('artStudio.saveTitle', 'Save as a new image asset')}</div>
                                <TextInput value={saveName} placeholder={maskMode ? t('artStudio.savePhMask', 'e.g. Window grime mask') : t('artStudio.savePh', 'e.g. Treasure map')} onChange={(e: any) => setSaveName(e.target.value)} />
                                {!!surface.baseUrl && !maskMode && (
                                    <label className="flex items-center gap-1.5">
                                        <input type="checkbox" className="w-4 h-4" checked={flatten} onChange={e => setFlatten(e.target.checked)} />
                                        <span className="text-xs text-slate-300">{t('artStudio.flatten', 'Include the base image (uncheck = drawing only)')}</span>
                                    </label>
                                )}
                                <button onClick={saveAsset} className="w-full px-2 py-2 rounded-md text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white">💾 {t('artStudio.save', 'Save to Assets')}</button>
                                <p className="text-[10px] text-slate-500">{t('artStudio.saveHint', 'Your original images are never changed — every save creates a new asset.')}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* discard confirm */}
                {confirmClose && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">
                        <div className="rounded-xl border border-slate-600 bg-slate-800 p-5 w-80 space-y-3">
                            <p className="text-sm text-slate-200">{t('artStudio.discardQ', 'You have unsaved drawing. Close anyway?')}</p>
                            <div className="flex gap-2 justify-end">
                                <button onClick={() => setConfirmClose(false)} className="px-3 py-1.5 rounded-md text-xs bg-slate-700 hover:bg-slate-600 text-white">{t('artStudio.keepDrawing', 'Keep drawing')}</button>
                                <button onClick={onClose} className="px-3 py-1.5 rounded-md text-xs font-bold bg-red-500 hover:bg-red-600 text-white">{t('artStudio.discard', 'Discard & close')}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default ArtStudio;
