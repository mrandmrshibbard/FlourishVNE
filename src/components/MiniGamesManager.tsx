/**
 * MiniGamesManager — the Mini Games tab. Authors build playable mini games here and show
 * them from scenes (Show Mini Game command) or buttons (Show Mini Game action).
 *
 * Layout (CharacterManager pattern): list column · config column · LIVE PREVIEW pane.
 * The preview runs the REAL engine component (MiniGameFrame, MapSurface-parity) so what
 * the author plays here is exactly what players get — action exits are swapped for a
 * "would run N actions" note + Replay.
 *
 * A game is a SEQUENCE OF STAGES (mixing mechanics); creating one seeds a single stage of
 * the picked type so single-mechanic authoring feels like a flat editor — "+ Add another
 * stage" is the mixing door. M1 ships the wipe-away stage; other types are "coming soon".
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNMiniGameConfig, VNMiniGameStage, VNMiniGameStageType, VNMiniGameMessage, VNWipeStage, VNMemoryStage, VNHiddenObjectStage, VNSlidingStage, VNAssembleStage, VNPaintStage, VNQteStage, VNArtPalette, VNPaletteToUiEntry, VNUiPaletteTarget } from '../types/miniGames';
import { useProject } from '../contexts/ProjectContext';
import { createDefaultMiniGame, createDefaultStage } from '../utils/miniGameFactory';
import { resolveFieldUrl } from '../utils/assetStore';
import MiniGameFrame from './live-preview/minigames/MiniGameFrame';
import { useImageBox } from './live-preview/minigames/useImageBox';
import { sliceCellStyle } from './live-preview/minigames/sliceStyles';
import ArtStudio from './art-studio/ArtStudio';
import ResizableDraggable from './menu-editor/ResizableDraggable';
import AssetSelector from './ui/AssetSelector';
import UIActionsListEditor from './ui/UIActionsListEditor';
import CollapsibleSection from './ui/CollapsibleSection';
import { FormField, Select, TextInput, TextArea, ColorInput, RangeInput } from './ui/Form';
import { PlusIcon, TrashIcon, GamepadIcon, XMarkIcon } from './icons';

const STAGE_TYPES: { type: VNMiniGameStageType; glyph: string; label: string; desc: string; available: boolean }[] = [
    { type: 'wipe', glyph: '🧽', label: 'Wipe away', desc: 'Scrub off a cover (dust, fog, frost…) to reveal what’s underneath.', available: true },
    { type: 'assemble', glyph: '🧩', label: 'Assemble', desc: 'Drag pieces from a tray onto their spots to build the picture.', available: true },
    { type: 'paint', glyph: '🎨', label: 'Painting', desc: 'Tap a color, tap a region — color in the artwork.', available: true },
    { type: 'memory', glyph: '🃏', label: 'Memory match', desc: 'Flip cards and find every matching pair.', available: true },
    { type: 'hidden', glyph: '🔍', label: 'Hidden objects', desc: 'Find every hidden thing in a busy scene.', available: true },
    { type: 'sliding', glyph: '🔢', label: 'Sliding puzzle', desc: 'Slide tiles into place to restore the image.', available: true },
    { type: 'qte', glyph: '⚡', label: 'Quick taps', desc: 'Hit each prompt before its timer runs out.', available: true },
];

const stageMeta = (type: string) => STAGE_TYPES.find(s => s.type === type) || { type, glyph: '❓', label: type, desc: '', available: false } as any;

/**
 * CoverMaskPainter — airbrush the AREA a wipe stage's cover occupies ("just this grimy smudge",
 * not the whole screen). The first slice of the planned Art Studio, pulled forward: airbrush /
 * marker / eraser onto a 960×540 alpha mask drawn over the stage composition. Painted alpha is
 * what the engine clips the cover to (the orange is only editor feedback).
 */
const MASK_W = 960, MASK_H = 540;
const CoverMaskPainter: React.FC<{
    revealUrl: string | null;
    initialMaskUrl: string | null;
    onSave: (pngDataUrl: string) => void;
    onClose: () => void;
}> = ({ revealUrl, initialMaskUrl, onSave, onClose }) => {
    const { t } = useTranslation('ui');
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [tool, setTool] = useState<'airbrush' | 'marker' | 'eraser'>('airbrush');
    const [size, setSize] = useState(48);
    const [hasStrokes, setHasStrokes] = useState(false);
    const undoRef = useRef<string[]>([]);
    const drawingRef = useRef<{ last: { x: number; y: number } | null }>({ last: null });

    // Load the existing mask (editing) once.
    useEffect(() => {
        const c = canvasRef.current;
        const ctx = c?.getContext('2d');
        if (!c || !ctx) return;
        ctx.clearRect(0, 0, MASK_W, MASK_H);
        if (initialMaskUrl) {
            const img = new Image();
            img.onload = () => { ctx.drawImage(img, 0, 0, MASK_W, MASK_H); setHasStrokes(true); };
            img.src = initialMaskUrl;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const canvasPoint = (e: React.PointerEvent) => {
        const rect = (canvasRef.current as HTMLCanvasElement).getBoundingClientRect();
        return { x: ((e.clientX - rect.left) / rect.width) * MASK_W, y: ((e.clientY - rect.top) / rect.height) * MASK_H };
    };
    const stamp = (x: number, y: number) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        ctx.save();
        if (tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = 'rgba(0,0,0,1)';
            ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill();
        } else if (tool === 'marker') {
            ctx.fillStyle = 'rgba(249,115,22,1)';
            ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill();
        } else {
            // airbrush: soft radial falloff, builds up with passes (light spray = lighter cover)
            const g = ctx.createRadialGradient(x, y, 0, x, y, size / 2);
            g.addColorStop(0, 'rgba(249,115,22,0.35)');
            g.addColorStop(1, 'rgba(249,115,22,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    };
    const onPointerDown = (e: React.PointerEvent) => {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        const c = canvasRef.current;
        if (c) {
            undoRef.current.push(c.toDataURL());
            if (undoRef.current.length > 20) undoRef.current.shift();
        }
        const p = canvasPoint(e);
        drawingRef.current.last = p;
        stamp(p.x, p.y);
        setHasStrokes(true);
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const last = drawingRef.current.last;
        if (!last) return;
        const p = canvasPoint(e);
        const dist = Math.hypot(p.x - last.x, p.y - last.y);
        const step = Math.max(2, size / 4);
        for (let d = step; d <= dist; d += step) stamp(last.x + ((p.x - last.x) * d) / dist, last.y + ((p.y - last.y) * d) / dist);
        if (dist >= step) drawingRef.current.last = p;
    };
    const endStroke = () => { drawingRef.current.last = null; };
    const undo = () => {
        const prev = undoRef.current.pop();
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, MASK_W, MASK_H);
        if (prev) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = prev; }
    };
    const clearAll = () => {
        const c = canvasRef.current;
        const ctx = c?.getContext('2d');
        if (!c || !ctx) return;
        undoRef.current.push(c.toDataURL());
        ctx.clearRect(0, 0, MASK_W, MASK_H);
        setHasStrokes(false);
    };

    const toolBtn = (id: 'airbrush' | 'marker' | 'eraser', glyph: string, label: string) => (
        <button onClick={() => setTool(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${tool === id ? 'border-orange-400 bg-orange-500/20 text-orange-200' : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-400'}`}>
            {glyph} {label}
        </button>
    );

    // z-[10000]: editor canvas layers reach z-100+, which punches through a z-50 overlay.
    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="w-[min(1040px,94vw)] max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-white font-bold">{t('miniGames.maskTitle', '✏️ Draw where the cover goes')}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><XMarkIcon className="w-5 h-5" /></button>
                </div>
                <p className="text-xs text-slate-400 mb-3">{t('miniGames.maskHint', 'Spray over the spots that should be covered (dust, grime, frost…). Orange = covered; players wipe exactly what you paint. Light airbrush passes make thinner, semi-see-through cover.')}</p>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    {toolBtn('airbrush', '💨', t('miniGames.toolAirbrush', 'Airbrush'))}
                    {toolBtn('marker', '🖊️', t('miniGames.toolMarker', 'Marker'))}
                    {toolBtn('eraser', '🧼', t('miniGames.toolEraser', 'Eraser'))}
                    <span className="text-xs text-slate-400 ml-2">{t('miniGames.toolSize', 'Size')}</span>
                    <input type="range" min={10} max={160} step={2} value={size} onChange={e => setSize(Number(e.target.value))} className="w-36" />
                    <span className="flex-1" />
                    <button onClick={undo} className="px-3 py-1.5 rounded-lg text-xs bg-slate-700 hover:bg-slate-600 text-white">↶ {t('miniGames.undo', 'Undo')}</button>
                    <button onClick={clearAll} className="px-3 py-1.5 rounded-lg text-xs bg-slate-700 hover:bg-slate-600 text-white">{t('miniGames.clear', 'Clear')}</button>
                </div>
                <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-600 bg-[#0b0d12]" style={{ backgroundImage: 'repeating-conic-gradient(#151a22 0% 25%, #0b0d12 0% 50%)', backgroundSize: '24px 24px' }}>
                    {revealUrl
                        ? <img src={revealUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
                        : <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-sm pointer-events-none">{t('miniGames.maskSceneHint', 'The running scene will show through here')}</div>}
                    <canvas ref={canvasRef} width={MASK_W} height={MASK_H}
                        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endStroke} onPointerCancel={endStroke} onPointerLeave={endStroke}
                        className="absolute inset-0 w-full h-full cursor-crosshair" style={{ touchAction: 'none' }} />
                </div>
                <div className="flex items-center justify-end gap-2 mt-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-slate-700 hover:bg-slate-600 text-white">{t('miniGames.cancel', 'Cancel')}</button>
                    <button disabled={!hasStrokes} onClick={() => { const c = canvasRef.current; if (c) onSave(c.toDataURL('image/png')); }}
                        className="px-4 py-2 rounded-lg text-sm font-bold bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white">
                        ✓ {t('miniGames.maskSave', 'Use this cover area')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

const gid = (p: string) => `${p}-${Math.random().toString(36).substring(2, 9)}`;

/** Friendly keycap label for a stored e.key value (arrows → glyphs, space/enter as words). */
const keyCapLabel = (k?: string): string => {
    const l = (k || '').toLowerCase().trim();
    if (!l) return '';
    if (l === ' ' || l === 'space' || l === 'spacebar') return 'Space';
    if (l === 'arrowup' || l === 'up') return '↑ Up';
    if (l === 'arrowdown' || l === 'down') return '↓ Down';
    if (l === 'arrowleft' || l === 'left') return '← Left';
    if (l === 'arrowright' || l === 'right') return '→ Right';
    if (l === 'enter' || l === 'return') return '⏎ Enter';
    if (l === 'escape' || l === 'esc') return 'Esc';
    return k!.length === 1 ? k!.toUpperCase() : k!;
};

/** A "press any key" capture for QTE key prompts — records the real e.key (arrows, space, letters,
 *  etc.) so authors never have to know key-name strings. Click to arm, then press the key. */
const KeyCaptureField: React.FC<{ value?: string; onChange: (k: string) => void }> = ({ value, onChange }) => {
    const { t } = useTranslation('ui');
    const [listening, setListening] = useState(false);
    useEffect(() => {
        if (!listening) return;
        const h = (e: KeyboardEvent) => {
            if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return; // wait for a real key
            e.preventDefault(); e.stopPropagation();
            onChange(e.key === ' ' ? ' ' : e.key);
            setListening(false);
        };
        window.addEventListener('keydown', h, true);
        return () => window.removeEventListener('keydown', h, true);
    }, [listening, onChange]);
    return (
        <button type="button" onClick={() => setListening(l => !l)}
            title={t('miniGames.qteKeyCaptureTitle', 'Click, then press the key the player must hit (arrows, space, any letter…)')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold border min-w-[74px] transition-colors ${listening ? 'border-sky-400 text-sky-300 bg-sky-500/10 animate-pulse' : 'border-slate-600 text-slate-100 hover:border-slate-400'}`}>
            {listening ? t('miniGames.qteKeyListening', 'Press a key…') : (keyCapLabel(value) || t('miniGames.qteKeySet', '⌨ Set key'))}
        </button>
    );
};

/** A Select over a character's expressions (for reaction states). '' = default/idle. */
const ExpressionSelect: React.FC<{ project: VNProject; characterId: VNID | null | undefined; value: VNID | null | undefined; onChange: (id: VNID | null) => void; noneLabel: string }> = ({ project, characterId, value, onChange, noneLabel }) => {
    const ch: any = characterId ? (project.characters as any)?.[characterId] : null;
    const exprs: any[] = ch ? Object.values(ch.expressions || {}) : [];
    return (
        <Select value={value || ''} onChange={(e: any) => onChange(e.target.value || null)}>
            <option value="">{noneLabel}</option>
            {exprs.map(ex => <option key={ex.id} value={ex.id}>{ex.name || ex.id}</option>)}
        </Select>
    );
};

/** A Select over the project's NUMBER variables (score export targets). '' = none. */
const NumberVarSelect: React.FC<{ project: VNProject; value: VNID | null | undefined; onChange: (id: VNID | null) => void; noneLabel: string }> = ({ project, value, onChange, noneLabel }) => {
    const vars = Object.values(project.variables || {}).filter((v: any) => v.type === 'number') as any[];
    return (
        <Select value={value || ''} onChange={(e: any) => onChange(e.target.value || null)}>
            <option value="">{noneLabel}</option>
            {vars.map(v => <option key={v.id} value={v.id}>{v.name || v.id}</option>)}
        </Select>
    );
};

/** A font picker over the project's custom fonts (imported .ttf, loaded at runtime via FontFace)
 *  plus the generic families. '' = the app default. Shared by the game-level font + every message. */
const FontSelect: React.FC<{
    project: VNProject;
    value: string | undefined;
    onChange: (v: string | undefined) => void;
    defaultLabel?: string;
}> = ({ project, value, onChange, defaultLabel }) => {
    const { t } = useTranslation('ui');
    const projectFonts = Object.values((project as any).fonts || {}) as any[];
    return (
        <Select value={value || ''} onChange={(e: any) => onChange(e.target.value || undefined)}>
            <option value="">{defaultLabel || t('miniGames.msgFontDefault', 'Default')}</option>
            {projectFonts.map(f => <option key={f.id} value={f.fontFamily} style={{ fontFamily: f.fontFamily }}>{f.name}</option>)}
            <option value="serif">Serif</option>
            <option value="monospace">Monospace</option>
            <option value="cursive">Cursive</option>
        </Select>
    );
};

/** Shared editor for the win/lose banner configs: Default glyph · Custom (text/art/font/panel/
 *  duration/entrance) · None. Used by the Winning AND Losing sections. */
const MessageConfigEditor: React.FC<{
    label: string;
    defaultOptionLabel: string;
    defaultText: string;
    msg: VNMiniGameMessage | undefined;
    onChange: (next: VNMiniGameMessage | undefined) => void;
    project: VNProject;
    hint?: string;
}> = ({ label, defaultOptionLabel, defaultText, msg, onChange, project, hint }) => {
    const { t } = useTranslation('ui');
    const mode: 'default' | 'custom' | 'none' = !msg ? 'default' : msg.enabled === false ? 'none' : 'custom';
    const patch = (p: any) => onChange({ ...(msg || {}), enabled: true, ...p });
    return (
        <div className="mt-2 rounded-lg border border-slate-700/60 p-2">
            {hint && <p className="text-[10px] text-slate-500 mb-1">{hint}</p>}
            <FormField label={label}>
                <Select value={mode} onChange={(e: any) => {
                    const v = e.target.value;
                    if (v === 'default') onChange(undefined);
                    else if (v === 'none') onChange({ enabled: false });
                    else onChange({ ...(msg || {}), enabled: true, text: msg?.text ?? defaultText });
                }}>
                    <option value="default">{defaultOptionLabel}</option>
                    <option value="custom">{t('miniGames.msgCustom', 'Customize it (my own text/art)…')}</option>
                    <option value="none">{t('miniGames.msgNone', 'Turn it off (nothing shows)')}</option>
                </Select>
            </FormField>
            {mode === 'custom' && msg && (
                <div className="space-y-2 mt-2">
                    <FormField label={t('miniGames.msgText', 'Message ({variables} work here)')}>
                        <TextArea rows={2} value={msg.text || ''} onChange={(e: any) => patch({ text: e.target.value })} />
                    </FormField>
                    <AssetSelector label={t('miniGames.msgImage', 'Art above the text (sticker, trophy…)')} assetType="images" value={msg.imageId || null} onChange={id => patch({ imageId: id })} />
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label={t('miniGames.msgFont', 'Font')}>
                            <FontSelect project={project} value={msg.fontFamily} onChange={v => patch({ fontFamily: v })} defaultLabel={t('miniGames.msgFontGame', 'Match the game')} />
                        </FormField>
                        <FormField label={t('miniGames.msgColor', 'Text color')}>
                            <ColorInput value={msg.color || '#ffffff'} onChange={(v: string) => patch({ color: v })} />
                        </FormField>
                    </div>
                    <FormField label={`${t('miniGames.msgSize', 'Text size')} (${msg.fontSize ?? 48}px)`}>
                        <RangeInput min={16} max={96} step={2} value={msg.fontSize ?? 48} onChange={(e: any) => patch({ fontSize: Number(e.target.value) })} />
                    </FormField>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1.5">
                            <input type="checkbox" className="w-4 h-4" checked={msg.bold !== false} onChange={e => patch({ bold: e.target.checked })} />
                            <span className="text-xs text-slate-300">{t('miniGames.msgBold', 'Bold')}</span>
                        </label>
                        <label className="flex items-center gap-1.5">
                            <input type="checkbox" className="w-4 h-4" checked={!!msg.italic} onChange={e => patch({ italic: e.target.checked || undefined })} />
                            <span className="text-xs text-slate-300">{t('miniGames.msgItalic', 'Italic')}</span>
                        </label>
                        <label className="flex items-center gap-1.5">
                            <input type="checkbox" className="w-4 h-4" checked={msg.dimBackground !== false} onChange={e => patch({ dimBackground: e.target.checked })} />
                            <span className="text-xs text-slate-300">{t('miniGames.msgDim', 'Dim the game behind it')}</span>
                        </label>
                    </div>
                    <FormField label={t('miniGames.msgPanel', 'Box behind the text')}>
                        <label className="flex items-center gap-1.5 mb-1.5">
                            <input type="checkbox" className="w-4 h-4" checked={!!msg.panelColor} onChange={e => patch({ panelColor: e.target.checked ? 'rgba(0,0,0,0.6)' : undefined })} />
                            <span className="text-xs text-slate-300">{t('miniGames.msgPanelToggle', 'Show a colored box behind the text')}</span>
                        </label>
                        {!!msg.panelColor && <ColorInput allowAlpha value={msg.panelColor} onChange={(v: string) => patch({ panelColor: v })} />}
                    </FormField>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label={t('miniGames.msgDuration', 'Shown for (seconds)')}>
                            <TextInput type="number" min={0.2} max={30} step={0.1} value={(msg.durationMs ?? 1200) / 1000}
                                onChange={(e: any) => { const s = Math.max(0.2, Math.min(30, Number(e.target.value) || 1.2)); patch({ durationMs: Math.round(s * 1000) }); }} />
                        </FormField>
                        <FormField label={t('miniGames.msgAnim', 'Entrance')}>
                            <Select value={msg.animation || 'pop'} onChange={(e: any) => patch({ animation: e.target.value })}>
                                <option value="pop">{t('miniGames.msgAnimPop', 'Pop')}</option>
                                <option value="fade">{t('miniGames.msgAnimFade', 'Fade')}</option>
                                <option value="none">{t('miniGames.msgAnimNone', 'None')}</option>
                            </Select>
                        </FormField>
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * HiddenSpotsPlacer — drag/resize the hidden objects straight onto the scene image
 * (MapEditor pattern: the canvas letterboxes the image and spots live in IMAGE-% space,
 * exactly the coordinates the runtime hit-tests — what you place is what players tap).
 */
const HiddenSpotsPlacer: React.FC<{
    stage: VNHiddenObjectStage;
    imageUrl: string | null;
    onPatch: (patch: Partial<VNHiddenObjectStage>) => void;
    onClose: () => void;
}> = ({ stage, imageUrl, onPatch, onClose }) => {
    const { t } = useTranslation('ui');
    const canvasRef = useRef<HTMLDivElement>(null);
    const box = useImageBox(canvasRef, imageUrl);
    const hotspots = stage.hotspots || [];
    const [selectedId, setSelectedId] = useState<string | null>(hotspots[0]?.id || null);
    const selected = hotspots.find(h => h.id === selectedId) || null;

    const patchSpot = (id: string, patch: any) => onPatch({ hotspots: hotspots.map(h => h.id === id ? { ...h, ...patch } : h) });
    const addSpot = () => {
        const id = gid('spot');
        onPatch({ hotspots: [...hotspots, { id, name: `Object ${hotspots.length + 1}`, shape: 'circle' as const, x: 42, y: 40, w: 14, h: 18 }] });
        setSelectedId(id);
    };
    const removeSpot = (id: string) => {
        onPatch({ hotspots: hotspots.filter(h => h.id !== id) });
        if (selectedId === id) setSelectedId(null);
    };

    // z-[10000]: editor canvas layers reach z-100+, which punches through a z-50 overlay.
    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="w-[min(1180px,96vw)] h-[min(760px,92vh)] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                    <h3 className="text-white font-bold">🎯 {t('miniGames.placerTitle', 'Place the hidden objects')}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><XMarkIcon className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 min-h-0 flex">
                    {/* canvas */}
                    <div ref={canvasRef} className="flex-1 min-w-0 relative bg-slate-950 m-2 rounded-lg overflow-hidden" onMouseDown={() => setSelectedId(null)}>
                        {imageUrl ? (
                            <img src={imageUrl} alt="" className="absolute" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">{t('miniGames.placerNoImage', 'Pick a scene image first (right panel)')}</div>
                        )}
                        {/* Spot layer = the contain-fit image box (spot % = image %) */}
                        <div className="absolute" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
                            {hotspots.map(h => (
                                <ResizableDraggable key={h.id}
                                    x={h.x} y={h.y} width={h.w} height={h.h}
                                    anchorX={0} anchorY={0}
                                    parentSize={{ width: box.width || 1, height: box.height || 1 }}
                                    isSelected={selectedId === h.id}
                                    onSelect={() => setSelectedId(h.id)}
                                    onUpdate={u => patchSpot(h.id, { x: u.x, y: u.y, w: u.width, h: u.height })}
                                    label={h.name}>
                                    <div style={{ width: '100%', height: '100%', background: 'rgba(52,211,153,0.18)', border: '2px dashed rgba(52,211,153,0.85)', borderRadius: (h.shape || 'circle') === 'circle' ? '50%' : 8 }} />
                                </ResizableDraggable>
                            ))}
                        </div>
                    </div>
                    {/* side panel */}
                    <div className="w-72 flex-shrink-0 border-l border-slate-700 overflow-y-auto p-3 space-y-2">
                        <button onClick={addSpot} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-md flex items-center justify-center gap-2 text-sm font-bold">
                            <PlusIcon className="w-4 h-4" /> {t('miniGames.placerAdd', 'Add object')}
                        </button>
                        <div className="space-y-1">
                            {hotspots.map(h => (
                                <div key={h.id} onClick={() => setSelectedId(h.id)}
                                    className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer border text-xs ${selectedId === h.id ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-100' : 'border-transparent hover:bg-slate-700/40 text-slate-300'}`}>
                                    <span>{(h.shape || 'circle') === 'circle' ? '◯' : '▭'}</span>
                                    <span className="flex-1 min-w-0 truncate">{h.name || t('miniGames.placerUnnamed', 'Unnamed object')}</span>
                                    <button onClick={e => { e.stopPropagation(); removeSpot(h.id); }} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"><TrashIcon className="w-3.5 h-3.5" /></button>
                                </div>
                            ))}
                            {hotspots.length === 0 && <p className="text-[11px] text-slate-500 px-1">{t('miniGames.placerEmpty', 'No objects yet — add one and drag it over the thing to find.')}</p>}
                        </div>
                        {selected && <>
                            <div className="border-t border-slate-700 pt-2 space-y-2">
                                <FormField label={t('miniGames.placerName', 'Name (for you)')}>
                                    <TextInput value={selected.name || ''} onChange={(e: any) => patchSpot(selected.id, { name: e.target.value })} />
                                </FormField>
                                <FormField label={t('miniGames.placerShape', 'Tap area shape')}>
                                    <Select value={selected.shape || 'circle'} onChange={(e: any) => patchSpot(selected.id, { shape: e.target.value })}>
                                        <option value="circle">{t('miniGames.placerCircle', 'Circle / oval')}</option>
                                        <option value="rect">{t('miniGames.placerRect', 'Rectangle')}</option>
                                    </Select>
                                </FormField>
                                <AssetSelector label={t('miniGames.placerFoundArt', 'Art shown when found (optional — default ✓ ring)')} assetType="images" value={selected.foundImageId || null} onChange={id => patchSpot(selected.id, { foundImageId: id })} />
                            </div>
                        </>}
                        <p className="text-[10px] text-slate-500 pt-1">{t('miniGames.placerHint', 'Drag to move, corners to resize. Players tap these areas — bigger = easier.')}</p>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

/**
 * AssembleTargetsPlacer — drag/resize where each piece lands on the board (pieces mode).
 * Same canvas pattern as HiddenSpotsPlacer: targets live in % of the base image's contain
 * box (or the whole canvas when there's no base image), matching the runtime exactly.
 */
const AssembleTargetsPlacer: React.FC<{
    stage: VNAssembleStage;
    baseUrl: string | null;
    pieceUrl: (id: VNID | null) => string | null;
    onPatch: (patch: Partial<VNAssembleStage>) => void;
    onClose: () => void;
}> = ({ stage, baseUrl, pieceUrl, onPatch, onClose }) => {
    const { t } = useTranslation('ui');
    const canvasRef = useRef<HTMLDivElement>(null);
    const box = useImageBox(canvasRef, baseUrl);
    const pieces = stage.pieces || [];
    const [selectedId, setSelectedId] = useState<string | null>(pieces[0]?.id || null);

    const patchPiece = (id: string, patch: any) => onPatch({ pieces: pieces.map(p => p.id === id ? { ...p, ...patch } : p) });

    // z-[10000]: editor canvas layers reach z-100+, which punches through a z-50 overlay.
    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="w-[min(1180px,96vw)] h-[min(760px,92vh)] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                    <h3 className="text-white font-bold">🧩 {t('miniGames.targetsTitle', 'Place where each piece lands')}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><XMarkIcon className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 min-h-0 flex">
                    <div ref={canvasRef} className="flex-1 min-w-0 relative bg-slate-950 m-2 rounded-lg overflow-hidden" onMouseDown={() => setSelectedId(null)}>
                        {baseUrl
                            ? <img src={baseUrl} alt="" className="absolute" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />
                            : <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-sm pointer-events-none">{t('miniGames.targetsNoBase', 'No board image — pieces land over the scene')}</div>}
                        <div className="absolute" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
                            {pieces.map(p => {
                                const u = pieceUrl(p.imageId || null);
                                return (
                                    <ResizableDraggable key={p.id}
                                        x={p.target.x} y={p.target.y} width={p.target.w} height={p.target.h}
                                        anchorX={0} anchorY={0}
                                        parentSize={{ width: box.width || 1, height: box.height || 1 }}
                                        isSelected={selectedId === p.id}
                                        onSelect={() => setSelectedId(p.id)}
                                        onUpdate={u2 => patchPiece(p.id, { target: { x: u2.x, y: u2.y, w: u2.width, h: u2.height } })}
                                        label={p.name || t('miniGames.targetPiece', 'Piece')}>
                                        <div style={{ width: '100%', height: '100%', border: '2px dashed rgba(52,211,153,0.85)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(52,211,153,0.08)' }}>
                                            {u && <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.75, pointerEvents: 'none' }} />}
                                        </div>
                                    </ResizableDraggable>
                                );
                            })}
                        </div>
                    </div>
                    <div className="w-72 flex-shrink-0 border-l border-slate-700 overflow-y-auto p-3 space-y-1">
                        {pieces.map((p, i) => (
                            <div key={p.id} onClick={() => setSelectedId(p.id)}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer border text-xs ${selectedId === p.id ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-100' : 'border-transparent hover:bg-slate-700/40 text-slate-300'}`}>
                                <span>🧩</span>
                                <span className="flex-1 min-w-0 truncate">{p.name || `${t('miniGames.targetPiece', 'Piece')} ${i + 1}`}</span>
                            </div>
                        ))}
                        {selectedId && (() => {
                            const p = pieces.find(x => x.id === selectedId);
                            if (!p) return null;
                            return (
                                <div className="border-t border-slate-700 pt-2 mt-2 space-y-2">
                                    <FormField label={t('miniGames.targetName', 'Name (for you)')}>
                                        <TextInput value={p.name || ''} onChange={(e: any) => patchPiece(p.id, { name: e.target.value })} />
                                    </FormField>
                                    <label className="flex items-center gap-1.5">
                                        <input type="checkbox" className="w-4 h-4" checked={p.showGhost !== false} onChange={e => patchPiece(p.id, { showGhost: e.target.checked })} />
                                        <span className="text-xs text-slate-300">{t('miniGames.targetGhost', 'Show a faint silhouette where it goes')}</span>
                                    </label>
                                </div>
                            );
                        })()}
                        <p className="text-[10px] text-slate-500 pt-1">{t('miniGames.targetsHint', 'Drag to move, corners to resize. Pieces snap when dropped near their own spot.')}</p>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

/**
 * PalettesEditor — the color schemes a coloring surface offers the player: inline palettes
 * (quick, local to this stage) plus checkable Art Studio schemes (project.artPalettes,
 * shared with the Art Studio's swatch bar — Brad's "same palettes both places").
 */
const PalettesEditor: React.FC<{
    inline: { id: VNID; name: string; colors: string[] }[];
    paletteIds: VNID[];
    project: VNProject;
    onChange: (patch: { palettes?: any[]; paletteIds?: VNID[] }) => void;
    onOpenArtStudio: () => void;
}> = ({ inline, paletteIds, project, onChange, onOpenArtStudio }) => {
    const { t } = useTranslation('ui');
    const studio: VNArtPalette[] = (project as any).artPalettes || [];
    const patchInline = (id: VNID, patch: any) => onChange({ palettes: inline.map(p => p.id === id ? { ...p, ...patch } : p) });
    return (
        <div className="rounded-lg border border-slate-700/60 p-2 space-y-2">
            <div className="text-xs font-semibold text-slate-300">{t('miniGames.palettes', 'Color choices for the player')}</div>
            {studio.length > 0 && (
                <div className="space-y-1">
                    {studio.map(p => (
                        <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="w-4 h-4" checked={paletteIds.includes(p.id)}
                                onChange={e => onChange({ paletteIds: e.target.checked ? [...paletteIds, p.id] : paletteIds.filter(x => x !== p.id) })} />
                            <span className="text-xs text-slate-300 truncate">{p.name || t('miniGames.paletteUnnamed', 'Palette')}</span>
                            <span className="flex gap-0.5 ml-auto">
                                {p.colors.slice(0, 8).map((c, i) => <span key={i} className="w-3.5 h-3.5 rounded-full border border-black/40" style={{ background: c }} />)}
                            </span>
                        </label>
                    ))}
                </div>
            )}
            {inline.map((p, pi) => (
                <div key={p.id} className="rounded-md border border-slate-700/60 p-1.5 space-y-1">
                    <div className="flex items-center gap-1">
                        <TextInput value={p.name} onChange={(e: any) => patchInline(p.id, { name: e.target.value })} placeholder={`${t('miniGames.paletteName', 'Palette')} ${pi + 1}`} />
                        <button onClick={() => onChange({ palettes: inline.filter(x => x.id !== p.id) })} title={t('miniGames.paletteRemove', 'Remove palette')}
                            className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-700/50 flex-shrink-0"><TrashIcon className="w-4 h-4" /></button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                        {p.colors.map((c, ci) => (
                            <span key={ci} className="relative group/sw">
                                <input type="color" value={/^#([0-9a-f]{6})$/i.test(c) ? c : '#ffffff'}
                                    onChange={e => patchInline(p.id, { colors: p.colors.map((x, i) => i === ci ? e.target.value : x) })}
                                    className="w-7 h-7 rounded-full border border-slate-500 cursor-pointer p-0 bg-transparent" style={{ background: c }} />
                                <button onClick={() => patchInline(p.id, { colors: p.colors.filter((_, i) => i !== ci) })}
                                    className="absolute -top-1.5 -right-1.5 hidden group-hover/sw:flex w-4 h-4 items-center justify-center rounded-full bg-slate-900 border border-slate-600 text-slate-400 hover:text-red-400 text-[9px] leading-none">✕</button>
                            </span>
                        ))}
                        <button onClick={() => patchInline(p.id, { colors: [...p.colors, '#facc15'] })}
                            className="w-7 h-7 rounded-full border border-dashed border-slate-500 text-slate-400 hover:text-white hover:border-slate-300 text-sm leading-none">+</button>
                    </div>
                </div>
            ))}
            <div className="flex gap-1.5">
                <button onClick={() => onChange({ palettes: [...inline, { id: gid('pal'), name: `Palette ${inline.length + 1}`, colors: ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6'] }] })}
                    className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold border border-dashed border-slate-500 text-slate-400 hover:text-white hover:border-slate-300">
                    + {t('miniGames.paletteAdd', 'Add a palette')}
                </button>
                <button onClick={onOpenArtStudio} className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200">
                    🎨 {t('miniGames.paletteStudio', 'Manage in Art Studio…')}
                </button>
            </div>
            <p className="text-[10px] text-slate-500">{t('miniGames.palettesHint', 'Players pick from these swatches while coloring. No palette = a default rainbow set.')}</p>
        </div>
    );
};

/** UI surfaces a captured color slot can restyle (palette→UI). Labels are author-facing. */
const UI_PALETTE_TARGETS: { value: VNUiPaletteTarget; label: string }[] = [
    { value: 'dialogueBg', label: 'Dialogue box background' },
    { value: 'dialogueBorder', label: 'Dialogue box border' },
    { value: 'dialogueText', label: 'Dialogue text' },
    { value: 'dialogueName', label: 'Name box background' },
    { value: 'choiceBg', label: 'Choice button background' },
    { value: 'choiceBorder', label: 'Choice button border' },
    { value: 'choiceText', label: 'Choice button text' },
];

/**
 * PaintRegionsPlacer — drag/resize SHAPE regions over the picture (HiddenSpotsPlacer
 * pattern: regions live in % of the base image's contain box, exactly what the runtime
 * hit-tests). Mask regions place themselves (their painted pixels ARE the area), so
 * they're listed for context but not draggable.
 */
const PaintRegionsPlacer: React.FC<{
    stage: VNPaintStage;
    imageUrl: string | null;
    maskUrl: (id: VNID | null) => string | null;
    onPatch: (patch: Partial<VNPaintStage>) => void;
    onClose: () => void;
}> = ({ stage, imageUrl, maskUrl, onPatch, onClose }) => {
    const { t } = useTranslation('ui');
    const canvasRef = useRef<HTMLDivElement>(null);
    const box = useImageBox(canvasRef, imageUrl);
    const regions = stage.regions || [];
    const [selectedId, setSelectedId] = useState<string | null>(regions.find(r => !r.maskImageId)?.id || null);
    const patchRegion = (id: string, patch: any) => onPatch({ regions: regions.map(r => r.id === id ? { ...r, ...patch } : r) });

    // z-[10000]: editor canvas layers reach z-100+, which punches through a z-50 overlay.
    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="w-[min(1180px,96vw)] h-[min(760px,92vh)] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                    <h3 className="text-white font-bold">🎨 {t('miniGames.paintPlacerTitle', 'Place the paintable areas')}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><XMarkIcon className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 min-h-0 flex">
                    <div ref={canvasRef} className="flex-1 min-w-0 relative bg-slate-950 m-2 rounded-lg overflow-hidden" onMouseDown={() => setSelectedId(null)}>
                        {imageUrl
                            ? <img src={imageUrl} alt="" className="absolute" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />
                            : <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">{t('miniGames.paintPlacerNoImage', 'Pick the picture first (right panel)')}</div>}
                        <div className="absolute" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
                            {/* mask regions: shown for context (their pixels are the area) */}
                            {regions.filter(r => r.maskImageId).map(r => {
                                const u = maskUrl(r.maskImageId || null);
                                return u ? <img key={r.id} src={u} alt="" className="absolute inset-0 w-full h-full object-fill pointer-events-none" style={{ opacity: 0.35, filter: 'drop-shadow(0 0 2px #34d399)' }} /> : null;
                            })}
                            {regions.map(r => r.maskImageId ? null : (
                                <ResizableDraggable key={r.id}
                                    x={r.x ?? 30} y={r.y ?? 30} width={r.w ?? 40} height={r.h ?? 40}
                                    anchorX={0} anchorY={0}
                                    parentSize={{ width: box.width || 1, height: box.height || 1 }}
                                    isSelected={selectedId === r.id}
                                    onSelect={() => setSelectedId(r.id)}
                                    onUpdate={u => patchRegion(r.id, { x: u.x, y: u.y, w: u.width, h: u.height })}
                                    label={r.name}>
                                    <div style={{ width: '100%', height: '100%', background: 'rgba(52,211,153,0.18)', border: '2px dashed rgba(52,211,153,0.85)', borderRadius: (r.shape || 'rect') === 'ellipse' ? '50%' : 8 }} />
                                </ResizableDraggable>
                            ))}
                        </div>
                    </div>
                    <div className="w-72 flex-shrink-0 border-l border-slate-700 overflow-y-auto p-3 space-y-1">
                        {regions.map((r, i) => (
                            <div key={r.id} onClick={() => !r.maskImageId && setSelectedId(r.id)}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs ${r.maskImageId ? 'border-transparent text-slate-500' : selectedId === r.id ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-100 cursor-pointer' : 'border-transparent hover:bg-slate-700/40 text-slate-300 cursor-pointer'}`}>
                                <span>{r.maskImageId ? '🖼️' : (r.shape || 'rect') === 'ellipse' ? '◯' : '▭'}</span>
                                <span className="flex-1 min-w-0 truncate">{r.name || `${t('miniGames.paintRegion', 'Area')} ${i + 1}`}</span>
                                {r.maskImageId && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400">{t('miniGames.paintMaskBadge', 'mask')}</span>}
                            </div>
                        ))}
                        {selectedId && (() => {
                            const r = regions.find(x => x.id === selectedId && !x.maskImageId);
                            if (!r) return null;
                            return (
                                <div className="border-t border-slate-700 pt-2 mt-2 space-y-2">
                                    <FormField label={t('miniGames.paintRegionName', 'Name (for you)')}>
                                        <TextInput value={r.name || ''} onChange={(e: any) => patchRegion(r.id, { name: e.target.value })} />
                                    </FormField>
                                    <FormField label={t('miniGames.paintRegionShape', 'Shape')}>
                                        <Select value={r.shape || 'rect'} onChange={(e: any) => patchRegion(r.id, { shape: e.target.value })}>
                                            <option value="rect">{t('miniGames.placerRect', 'Rectangle')}</option>
                                            <option value="ellipse">{t('miniGames.placerCircle', 'Circle / oval')}</option>
                                        </Select>
                                    </FormField>
                                </div>
                            );
                        })()}
                        <p className="text-[10px] text-slate-500 pt-1">{t('miniGames.paintPlacerHint', 'Drag to move, corners to resize. Mask areas (from the Art Studio) place themselves — their painted pixels are the tappable area.')}</p>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

const MiniGamesManager: React.FC<{ project?: VNProject }> = () => {
    const { project, dispatch } = useProject();
    const { t } = useTranslation('ui');
    const games: Record<VNID, VNMiniGameConfig> = project.miniGames || {};
    const [activeGameId, setActiveGameId] = useState<VNID | null>(Object.keys(games)[0] || null);
    const [selectedStageId, setSelectedStageId] = useState<VNID | null>(null);
    const [picker, setPicker] = useState<null | 'new' | 'addStage'>(null);
    const [previewKey, setPreviewKey] = useState(0);
    const [previewResult, setPreviewResult] = useState<null | { kind: 'win' | 'skip' | 'fail'; count: number; slots?: Record<string, string>; score?: { hits: number; misses: number; accuracy: number }; tierName?: string }>(null);
    const [maskPainterOpen, setMaskPainterOpen] = useState(false);
    const [spotsPlacerOpen, setSpotsPlacerOpen] = useState(false);
    const [targetsPlacerOpen, setTargetsPlacerOpen] = useState(false);
    const [paintPlacerOpen, setPaintPlacerOpen] = useState(false);
    const [artStudioOpen, setArtStudioOpen] = useState(false);

    const game = activeGameId ? games[activeGameId] : null;
    const stage: VNMiniGameStage | null = game ? (game.stages.find(s => s.id === selectedStageId) || game.stages[0] || null) : null;

    // The live preview runs the REAL engine, and its surfaces snapshot their stage config at mount
    // (positions, prompts, regions, cover masks, cards…). So a plain re-render with an edited config
    // leaves the canvas STALE until it remounts — which is why switching tabs and back "fixes" it.
    // Fold a cheap signature of the whole game config into the preview key so ANY property edit
    // remounts the frame the same way a tab-switch does — the preview re-syncs to the edit live.
    const gameSig = useMemo(() => {
        if (!game) return 0;
        const s = JSON.stringify(game);
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return h;
    }, [game]);
    // When the config changes the frame remounts (gameSig key) into a fresh play-through — but the
    // win/lose OUTCOME overlay is MiniGamesManager state that would otherwise stay up on top of the
    // restarted preview (target looks frozen until you hit Replay). Clear it on any edit so the edit
    // shows a clean, playing preview immediately.
    useEffect(() => { setPreviewResult(null); }, [gameSig]);

    // ── project writes (writeMaps pattern: plain UPDATE_PROJECT merge) ──
    const writeGames = (next: Record<VNID, VNMiniGameConfig>) => dispatch({ type: 'UPDATE_PROJECT', payload: { miniGames: next } });
    const patchGame = (patch: Partial<VNMiniGameConfig>) => { if (game) writeGames({ ...games, [game.id]: { ...game, ...patch } }); };
    const patchStage = (stageId: VNID, patch: any) => {
        if (!game) return;
        patchGame({ stages: game.stages.map(s => s.id === stageId ? { ...s, ...patch } : s) });
    };
    const addGame = (type: VNMiniGameStageType) => {
        const g = createDefaultMiniGame(type, `Mini Game ${Object.keys(games).length + 1}`);
        writeGames({ ...games, [g.id]: g });
        setActiveGameId(g.id);
        setSelectedStageId(g.stages[0]?.id || null);
    };
    const removeGame = (id: VNID) => {
        const next = { ...games };
        delete next[id];
        writeGames(next);
        if (activeGameId === id) { setActiveGameId(Object.keys(next)[0] || null); setSelectedStageId(null); }
    };
    const addStage = (type: VNMiniGameStageType) => {
        if (!game) return;
        const s = createDefaultStage(type);
        patchGame({ stages: [...game.stages, s] });
        setSelectedStageId(s.id);
    };
    const moveStage = (stageId: VNID, dir: -1 | 1) => {
        if (!game) return;
        const idx = game.stages.findIndex(s => s.id === stageId);
        const to = idx + dir;
        if (idx < 0 || to < 0 || to >= game.stages.length) return;
        const next = [...game.stages];
        const [s] = next.splice(idx, 1);
        next.splice(to, 0, s);
        patchGame({ stages: next });
    };
    const removeStage = (stageId: VNID) => {
        if (!game || game.stages.length <= 1) return; // a game always keeps ≥1 stage
        patchGame({ stages: game.stages.filter(s => s.id !== stageId) });
        if (selectedStageId === stageId) setSelectedStageId(null);
    };

    // ── editor-side asset resolver for the live preview (cross-collection, like the engine's) ──
    const assetResolver = useMemo(() => (assetId: VNID | null, type: 'audio' | 'video' | 'image'): string | null => {
        if (!assetId) return null;
        const raw = ((): string | null => {
            if (type === 'audio') return (project.audio as any)?.[assetId]?.audioUrl || null;
            const bg = (project.backgrounds as any)?.[assetId];
            const img = (project.images as any)?.[assetId];
            const vid = (project.videos as any)?.[assetId];
            if (type === 'video') return vid?.videoUrl || bg?.videoUrl || img?.videoUrl || null;
            return bg?.videoUrl || bg?.imageUrl || img?.videoUrl || img?.imageUrl || vid?.videoUrl || null;
        })();
        return resolveFieldUrl(project.id, raw);
    }, [project]);

    const previewPlaySound = (id: VNID | null) => {
        const url = assetResolver(id, 'audio');
        if (!url) return;
        try { const a = new Audio(url); a.volume = 0.6; void a.play(); } catch { /* editor preview only */ }
    };

    const replay = () => { setPreviewResult(null); setPreviewKey(k => k + 1); };

    /** Persist the airbrushed cover area: update the stage's mask asset in place (so re-edits
     *  keep one asset), or create it on first save. Data URL now; the asset store file-backs it. */
    const saveCoverMask = (dataUrl: string) => {
        if (!game || !stage) return;
        const existingId = (stage as VNWipeStage).coverMaskImageId;
        if (existingId && (project.images as any)?.[existingId]) {
            dispatch({ type: 'UPDATE_ASSET', payload: { assetType: 'images', assetId: existingId, updates: { imageUrl: dataUrl } } });
        } else {
            const id = `img-${Math.random().toString(36).substring(2, 9)}`;
            dispatch({ type: 'ADD_ASSET', payload: { assetType: 'images', asset: { id, name: `Wipe cover area — ${game.name}`, path: '', imageUrl: dataUrl } as any } });
            patchStage(stage.id, { coverMaskImageId: id });
        }
        setMaskPainterOpen(false);
        setPreviewKey(k => k + 1); // restart the live preview with the new cover area
    };

    // ── type picker (new game / add stage) ──
    const typePicker = picker && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setPicker(null); }}>
            <div className="w-[min(680px,92vw)] max-h-[80vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-bold text-lg">{picker === 'new' ? t('miniGames.pickType', 'What kind of mini game?') : t('miniGames.pickStageType', 'Add a stage — what kind?')}</h3>
                    <button onClick={() => setPicker(null)} className="text-slate-400 hover:text-white"><XMarkIcon className="w-5 h-5" /></button>
                </div>
                {picker === 'addStage' && <p className="text-xs text-slate-400 mb-3">{t('miniGames.mixHint', 'Stages play in order — mix mechanics like “wipe the dust, then assemble the pieces”.')}</p>}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {STAGE_TYPES.map(s => (
                        <button key={s.type} disabled={!s.available}
                            onClick={() => { if (picker === 'new') addGame(s.type); else addStage(s.type); setPicker(null); }}
                            className={`text-left rounded-xl border p-3 transition-colors ${s.available ? 'border-slate-600 bg-slate-800 hover:border-emerald-400 hover:bg-slate-750 cursor-pointer' : 'border-slate-700/60 bg-slate-800/40 opacity-55 cursor-not-allowed'}`}>
                            <div className="text-2xl">{s.glyph}</div>
                            <div className="text-sm font-semibold text-slate-200 mt-1 flex items-center gap-2">
                                {s.label}
                                {!s.available && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400">{t('miniGames.comingSoon', 'coming soon')}</span>}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{s.desc}</div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    // ── selected-stage editor (type-specific) ──
    const stageEditor = game && stage && (() => {
        const meta = stageMeta(stage.stageType);
        const common = <>
            <FormField label={t('miniGames.stageInstructions', 'Instructions for this stage')}>
                <TextInput value={stage.instructions || ''} onChange={(e: any) => patchStage(stage.id, { instructions: e.target.value || undefined })} placeholder={t('miniGames.stageInstructionsPh', 'e.g. Wipe the dust away!')} />
            </FormField>
            <CollapsibleSection title={t('miniGames.stageCursor', 'Player cursor (this stage)')} summary={stage.cursorImageId ? t('miniGames.custom', 'custom') : t('miniGames.default', 'default')}>
                <AssetSelector label={t('miniGames.cursorImage', 'Cursor image')} assetType="images" value={stage.cursorImageId || null} onChange={id => patchStage(stage.id, { cursorImageId: id })} />
                {!!stage.cursorImageId && (
                    <FormField label={t('miniGames.cursorSize', 'Cursor size')}>
                        <RangeInput min={2} max={20} step={1} value={stage.cursorSizePct ?? 6} onChange={(e: any) => patchStage(stage.id, { cursorSizePct: Number(e.target.value) })} />
                    </FormField>
                )}
                <p className="text-[10px] text-slate-500 mt-1">{t('miniGames.cursorHint', 'Follows the pointer while this stage plays (also shows under the finger on touch).')}</p>
            </CollapsibleSection>
            <AssetSelector label={t('miniGames.stageWinSfx', 'Stage-complete sound')} assetType="audio" value={stage.stageWinSfxId || null} onChange={id => patchStage(stage.id, { stageWinSfxId: id })} />
            {/* On-screen hit/miss feedback — a custom message/art flashed on a correct or wrong move.
                Only the stage types with discrete hit/miss events show this (qte/memory/hidden/assemble). */}
            {(['qte', 'memory', 'hidden', 'assemble'] as const).includes(stage.stageType as any) && (
                <CollapsibleSection title={t('miniGames.feedback', 'On-screen feedback (hit / miss)')}
                    summary={[stage.hitFeedback && stage.hitFeedback.enabled !== false && (stage.hitFeedback.text || stage.hitFeedback.imageId) ? '✔' : '', stage.missFeedback && stage.missFeedback.enabled !== false && (stage.missFeedback.text || stage.missFeedback.imageId) ? '✖' : ''].filter(Boolean).join(' ') || t('miniGames.default', 'default')}>
                    <p className="text-[10px] text-slate-500">{t('miniGames.feedbackHint', 'Flash your own message or art when the player gets one right (hit) or wrong (miss). Same options as the win/lose messages. Leave on “Default” to keep the built-in cue. Taps in a Quick-taps stage can also override these per tap.')}</p>
                    <MessageConfigEditor
                        label={t('miniGames.hitFeedback', 'When they get one RIGHT')}
                        defaultOptionLabel={t('miniGames.hitFeedbackDefault', 'Default (no flash)')}
                        defaultText={t('miniGames.hitFeedbackText', 'Nice!')}
                        msg={stage.hitFeedback}
                        onChange={m => patchStage(stage.id, { hitFeedback: m })}
                        project={project}
                    />
                    <MessageConfigEditor
                        label={t('miniGames.missFeedback', 'When they get one WRONG')}
                        defaultOptionLabel={t('miniGames.missFeedbackDefault', 'Default (built-in cue)')}
                        defaultText={t('miniGames.missFeedbackText', 'Try again!')}
                        msg={stage.missFeedback}
                        onChange={m => patchStage(stage.id, { missFeedback: m })}
                        project={project}
                    />
                </CollapsibleSection>
            )}
            {/* Between-stage cutscene: a tap-to-continue story beat after this stage (leveled games). */}
            <CollapsibleSection title={t('miniGames.cutscene', 'Cutscene after this stage')} summary={stage.cutscene && (stage.cutscene.text || stage.cutscene.imageId || stage.cutscene.characterId) ? '🎬' : t('miniGames.off', 'off')}>
                {(() => {
                    const cut = stage.cutscene || {};
                    const patchCut = (patch: any) => patchStage(stage.id, { cutscene: { ...cut, ...patch } });
                    const cutChars = Object.values(project.characters || {}) as any[];
                    return <div className="space-y-2">
                        <p className="text-[10px] text-slate-500">{t('miniGames.cutsceneHint', 'Shows after the player clears this stage, before the next one (or before the win on the last stage). Great for a story beat between levels.')}</p>
                        <FormField label={t('miniGames.cutsceneText', 'Message ({variables} work)')}>
                            <TextArea rows={2} value={cut.text || ''} onChange={(e: any) => patchCut({ text: e.target.value || undefined })} />
                        </FormField>
                        <AssetSelector label={t('miniGames.cutsceneImage', 'Image (optional)')} assetType="images" value={cut.imageId || null} onChange={id => patchCut({ imageId: id })} />
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label={t('miniGames.cutsceneChar', 'Character (optional)')}>
                                <Select value={cut.characterId || ''} onChange={(e: any) => patchCut({ characterId: e.target.value || null, expressionId: null })}>
                                    <option value="">{t('miniGames.reactCharNone', 'None')}</option>
                                    {cutChars.map(ch => <option key={ch.id} value={ch.id}>{ch.name || ch.id}</option>)}
                                </Select>
                            </FormField>
                            {cut.characterId && <FormField label={t('miniGames.cutsceneExpr', 'Expression')}><ExpressionSelect project={project} characterId={cut.characterId} value={cut.expressionId} onChange={id => patchCut({ expressionId: id })} noneLabel={t('miniGames.reactFirst', 'First expression')} /></FormField>}
                        </div>
                        <FormField label={t('miniGames.cutsceneDuration', 'Auto-continue after (seconds; 0 = wait for a tap)')}>
                            <TextInput type="number" min={0} max={30} step={0.5} value={(cut.durationMs ?? 0) / 1000} onChange={(e: any) => { const s = Math.max(0, Math.min(30, Number(e.target.value) || 0)); patchCut({ durationMs: s > 0 ? Math.round(s * 1000) : undefined }); }} />
                        </FormField>
                    </div>;
                })()}
            </CollapsibleSection>
        </>;

        if (stage.stageType === 'wipe') {
            const s = stage as VNWipeStage;
            return <CollapsibleSection title={`${meta.glyph} ${t('miniGames.stageSettings', 'Stage settings')} — ${meta.label}`} defaultOpen>
                <div className="space-y-2">
                    <AssetSelector label={t('miniGames.wipeReveal', 'Picture underneath (empty = the scene shows through)')} assetType="images" value={s.revealImageId || null} onChange={id => patchStage(s.id, { revealImageId: id })} />
                    <FormField label={t('miniGames.wipeCover', 'Cover')}>
                        <Select value={s.coverType || 'color'} onChange={(e: any) => patchStage(s.id, { coverType: e.target.value })}>
                            <option value="color">{t('miniGames.coverColor', 'Solid color')}</option>
                            <option value="image">{t('miniGames.coverImage', 'Image (dust, dirt, fog art…)')}</option>
                            <option value="frost">{t('miniGames.coverFrost', 'Frost / steam haze')}</option>
                        </Select>
                    </FormField>
                    {(s.coverType || 'color') === 'color' && (
                        <FormField label={t('miniGames.coverColorLabel', 'Cover color')}>
                            <ColorInput value={s.coverColor || '#9ca3af'} onChange={(v: string) => patchStage(s.id, { coverColor: v })} />
                        </FormField>
                    )}
                    {s.coverType === 'image' && (
                        <AssetSelector label={t('miniGames.coverImageLabel', 'Cover image')} assetType="images" value={s.coverImageId || null} onChange={id => patchStage(s.id, { coverImageId: id })} />
                    )}
                    {/* Cover AREA — whole surface, or an author-airbrushed patch ("just this smudge") */}
                    <div className="rounded-lg border border-slate-700/60 p-2">
                        <div className="text-xs font-semibold text-slate-300 mb-1">{t('miniGames.coverArea', 'Where is the cover?')}</div>
                        {s.coverMaskImageId ? (
                            <div className="flex items-center gap-2">
                                <div className="w-20 h-[45px] flex-shrink-0 rounded border border-slate-600 overflow-hidden" style={{ backgroundImage: 'repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%)', backgroundSize: '10px 10px' }}>
                                    {(() => { const u = assetResolver(s.coverMaskImageId, 'image'); return u ? <img src={u} alt="" className="w-full h-full object-contain" /> : null; })()}
                                </div>
                                <div className="flex-1 min-w-0 space-y-1">
                                    <button onClick={() => setMaskPainterOpen(true)} className="w-full px-2 py-1.5 rounded-md text-xs font-semibold bg-orange-500/20 border border-orange-500/50 text-orange-200 hover:bg-orange-500/30">
                                        ✏️ {t('miniGames.maskEdit', 'Edit the drawn area…')}
                                    </button>
                                    <button onClick={() => patchStage(s.id, { coverMaskImageId: null })} className="w-full px-2 py-1 rounded-md text-[11px] bg-slate-700/60 text-slate-300 hover:bg-slate-700">
                                        {t('miniGames.maskRemove', 'Cover the whole area instead')}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <p className="text-[10px] text-slate-500 mb-1.5">{t('miniGames.coverAreaHint', 'Right now the whole area is covered. You can airbrush exactly where the dirt/frost sits instead — even just one small smudge.')}</p>
                                <button onClick={() => setMaskPainterOpen(true)} className="w-full px-2 py-1.5 rounded-md text-xs font-semibold bg-orange-500/20 border border-orange-500/50 text-orange-200 hover:bg-orange-500/30">
                                    ✏️ {t('miniGames.maskDraw', 'Draw the covered area…')}
                                </button>
                            </>
                        )}
                    </div>
                    <FormField label={t('miniGames.brushStyle', 'Brush feel')}>
                        <Select value={s.brushStyle || 'softRound'} onChange={(e: any) => patchStage(s.id, { brushStyle: e.target.value })}>
                            <option value="softRound">{t('miniGames.brushSoft', 'Soft round (cloth)')}</option>
                            <option value="hardRound">{t('miniGames.brushHard', 'Hard round (squeegee)')}</option>
                            <option value="scratch">{t('miniGames.brushScratch', 'Scratcher (thin streaks)')}</option>
                            <option value="sponge">{t('miniGames.brushSponge', 'Sponge (dabby)')}</option>
                            <option value="custom">{t('miniGames.brushCustom', 'Custom image…')}</option>
                        </Select>
                    </FormField>
                    {s.brushStyle === 'custom' && (
                        <AssetSelector label={t('miniGames.brushCustomImage', 'Brush image (its transparency is the shape)')} assetType="images" value={s.customBrushImageId || null} onChange={id => patchStage(s.id, { customBrushImageId: id })} />
                    )}
                    <FormField label={`${t('miniGames.brushSize', 'Brush size')} (${s.brushSize ?? 10})`}>
                        <RangeInput min={4} max={25} step={1} value={s.brushSize ?? 10} onChange={(e: any) => patchStage(s.id, { brushSize: Number(e.target.value) })} />
                    </FormField>
                    <FormField label={`${t('miniGames.winPercent', 'Cleared % needed to win')} (${s.winRevealPercent ?? 70}%)`}>
                        <RangeInput min={10} max={100} step={5} value={s.winRevealPercent ?? 70} onChange={(e: any) => patchStage(s.id, { winRevealPercent: Number(e.target.value) })} />
                    </FormField>
                    <label className="flex items-center gap-2">
                        <input type="checkbox" className="w-4 h-4" checked={s.autoClearOnWin !== false} onChange={e => patchStage(s.id, { autoClearOnWin: e.target.checked })} />
                        <span className="text-xs text-slate-300">{t('miniGames.autoClear', 'Fade away the rest of the cover on win')}</span>
                    </label>
                    {common}
                </div>
            </CollapsibleSection>;
        }
        if (stage.stageType === 'memory') {
            const s = stage as VNMemoryStage;
            const faces = s.faces || [];
            const patchFace = (id: VNID, patch: any) => patchStage(s.id, { faces: faces.map(f => f.id === id ? { ...f, ...patch } : f) });
            return <CollapsibleSection title={`${meta.glyph} ${t('miniGames.stageSettings', 'Stage settings')} — ${meta.label}`} defaultOpen>
                <div className="space-y-2">
                    <div className="rounded-lg border border-slate-700/60 p-2">
                        <div className="text-xs font-semibold text-slate-300 mb-1">{t('miniGames.memFaces', 'Card faces (each appears twice)')}</div>
                        {faces.map((f, i) => (
                            <div key={f.id} className="flex items-end gap-1 mb-1">
                                <div className="flex-1 min-w-0">
                                    <AssetSelector label={`${t('miniGames.memCard', 'Card')} ${i + 1}`} assetType="images" value={f.imageId || null} onChange={id => patchFace(f.id, { imageId: id })} />
                                </div>
                                <button onClick={() => patchStage(s.id, { faces: faces.filter(x => x.id !== f.id) })} title={t('miniGames.memRemoveCard', 'Remove card')}
                                    className="mb-1 p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-700/50"><TrashIcon className="w-4 h-4" /></button>
                            </div>
                        ))}
                        <button onClick={() => patchStage(s.id, { faces: [...faces, { id: gid('face'), imageId: null }] })}
                            className="w-full mt-1 px-2 py-1.5 rounded-md text-xs font-semibold border border-dashed border-slate-500 text-slate-400 hover:text-white hover:border-slate-300">
                            + {t('miniGames.memAddCard', 'Add a card face')}
                        </button>
                        <p className="text-[10px] text-slate-500 mt-1">{t('miniGames.memFacesHint', '3 faces = 6 cards, 6 faces = 12 cards… Faces without an image show a number (fine for testing).')}</p>
                    </div>
                    <AssetSelector label={t('miniGames.memBack', 'Card back (optional — default pattern)')} assetType="images" value={s.cardBackImageId || null} onChange={id => patchStage(s.id, { cardBackImageId: id })} />
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label={t('miniGames.memCols', 'Columns')}>
                            <Select value={String(s.cols || 0)} onChange={(e: any) => { const v = Number(e.target.value); patchStage(s.id, { cols: v || undefined }); }}>
                                <option value="0">{t('miniGames.memColsAuto', 'Auto')}</option>
                                {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                            </Select>
                        </FormField>
                        <FormField label={`${t('miniGames.memFlipBack', 'Flip-back delay')} (${((s.flipBackDelayMs ?? 900) / 1000).toFixed(1)}s)`}>
                            <RangeInput min={300} max={3000} step={100} value={s.flipBackDelayMs ?? 900} onChange={(e: any) => patchStage(s.id, { flipBackDelayMs: Number(e.target.value) })} />
                        </FormField>
                    </div>
                    <AssetSelector label={t('miniGames.memMatchSfx', 'Pair-matched sound')} assetType="audio" value={s.matchSfxId || null} onChange={id => patchStage(s.id, { matchSfxId: id })} />
                    {common}
                </div>
            </CollapsibleSection>;
        }
        if (stage.stageType === 'hidden') {
            const s = stage as VNHiddenObjectStage;
            const spots = s.hotspots || [];
            return <CollapsibleSection title={`${meta.glyph} ${t('miniGames.stageSettings', 'Stage settings')} — ${meta.label}`} defaultOpen>
                <div className="space-y-2">
                    <AssetSelector label={t('miniGames.hiddenScene', 'Busy scene image')} assetType="images" value={s.sceneImageId || null} onChange={id => patchStage(s.id, { sceneImageId: id })} />
                    <button onClick={() => setSpotsPlacerOpen(true)} disabled={!s.sceneImageId}
                        className="w-full px-2 py-1.5 rounded-md text-xs font-semibold bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed">
                        🎯 {spots.length ? t('miniGames.hiddenEditSpots', { defaultValue: 'Place objects… ({{count}} placed)', count: spots.length }) : t('miniGames.hiddenPlaceSpots', 'Place objects…')}
                    </button>
                    {!s.sceneImageId && <p className="text-[10px] text-slate-500">{t('miniGames.hiddenNeedImage', 'Pick the scene image first, then place the objects on it.')}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <label className="flex items-center gap-1.5">
                            <input type="checkbox" className="w-4 h-4" checked={s.showFoundMarkers !== false} onChange={e => patchStage(s.id, { showFoundMarkers: e.target.checked })} />
                            <span className="text-xs text-slate-300">{t('miniGames.hiddenMarkers', 'Mark found objects')}</span>
                        </label>
                        <label className="flex items-center gap-1.5">
                            <input type="checkbox" className="w-4 h-4" checked={s.showCounter !== false} onChange={e => patchStage(s.id, { showCounter: e.target.checked })} />
                            <span className="text-xs text-slate-300">{t('miniGames.hiddenCounter', 'Show the “3 / 5” counter')}</span>
                        </label>
                        <label className="flex items-center gap-1.5">
                            <input type="checkbox" className="w-4 h-4" checked={!!s.hintButton} onChange={e => patchStage(s.id, { hintButton: e.target.checked || undefined })} />
                            <span className="text-xs text-slate-300">{t('miniGames.hiddenHint', 'Hint button')}</span>
                        </label>
                    </div>
                    {!!s.hintButton && (
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label={t('miniGames.hiddenHintLabel', 'Hint button label')}>
                                <TextInput value={s.hintLabel || ''} placeholder="💡 Hint" onChange={(e: any) => patchStage(s.id, { hintLabel: e.target.value || undefined })} />
                            </FormField>
                            <FormField label={t('miniGames.hiddenHintCooldown', 'Cooldown (seconds)')}>
                                <TextInput type="number" min={1} max={120} value={s.hintCooldownSec ?? 10} onChange={(e: any) => patchStage(s.id, { hintCooldownSec: Math.max(1, Number(e.target.value) || 10) })} />
                            </FormField>
                        </div>
                    )}
                    {common}
                </div>
            </CollapsibleSection>;
        }
        if (stage.stageType === 'sliding') {
            const s = stage as VNSlidingStage;
            return <CollapsibleSection title={`${meta.glyph} ${t('miniGames.stageSettings', 'Stage settings')} — ${meta.label}`} defaultOpen>
                <div className="space-y-2">
                    <AssetSelector label={t('miniGames.slideImage', 'Puzzle image')} assetType="images" value={s.imageId || null} onChange={id => patchStage(s.id, { imageId: id })} />
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label={t('miniGames.slideGrid', 'Grid size')}>
                            <Select value={String(s.gridSize || 3)} onChange={(e: any) => patchStage(s.id, { gridSize: Number(e.target.value) })}>
                                <option value="3">3 × 3 {t('miniGames.slideEasy', '(easy)')}</option>
                                <option value="4">4 × 4</option>
                                <option value="5">5 × 5 {t('miniGames.slideHard', '(hard)')}</option>
                            </Select>
                        </FormField>
                        <FormField label={`${t('miniGames.slideShuffle', 'Shuffle strength')} (${s.shuffleMoves ?? 80})`}>
                            <RangeInput min={10} max={200} step={10} value={s.shuffleMoves ?? 80} onChange={(e: any) => patchStage(s.id, { shuffleMoves: Number(e.target.value) })} />
                        </FormField>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <label className="flex items-center gap-1.5">
                            <input type="checkbox" className="w-4 h-4" checked={!!s.showNumbers} onChange={e => patchStage(s.id, { showNumbers: e.target.checked || undefined })} />
                            <span className="text-xs text-slate-300">{t('miniGames.slideNumbers', 'Number the tiles')}</span>
                        </label>
                        <label className="flex items-center gap-1.5">
                            <input type="checkbox" className="w-4 h-4" checked={s.showReference !== false} onChange={e => patchStage(s.id, { showReference: e.target.checked })} />
                            <span className="text-xs text-slate-300">{t('miniGames.slideReference', 'Show the finished picture in the corner')}</span>
                        </label>
                    </div>
                    <p className="text-[10px] text-slate-500">{t('miniGames.slideHint', 'The scramble uses only legal moves, so every board is solvable. Tap a tile next to the gap to slide it.')}</p>
                    {common}
                </div>
            </CollapsibleSection>;
        }
        if (stage.stageType === 'assemble') {
            const s = stage as VNAssembleStage;
            const asmMode = s.sourceMode || 'slice';
            const asmPieces = s.pieces || [];
            const sliceUrl = assetResolver(s.sliceImageId || null, 'image');
            return <CollapsibleSection title={`${meta.glyph} ${t('miniGames.stageSettings', 'Stage settings')} — ${meta.label}`} defaultOpen>
                <div className="space-y-2">
                    <FormField label={t('miniGames.asmSource', 'Where do the pieces come from?')}>
                        <Select value={asmMode} onChange={(e: any) => patchStage(s.id, { sourceMode: e.target.value })}>
                            <option value="slice">{t('miniGames.asmSlice', 'Cut one image into a grid (automatic)')}</option>
                            <option value="pieces">{t('miniGames.asmPieces', 'My own piece images (placed by hand)')}</option>
                        </Select>
                    </FormField>
                    {asmMode === 'slice' ? <>
                        <AssetSelector label={t('miniGames.asmSliceImage', 'Image to cut up')} assetType="images" value={s.sliceImageId || null} onChange={id => patchStage(s.id, { sliceImageId: id })} />
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label={t('miniGames.asmCols', 'Columns')}>
                                <Select value={String(s.sliceCols ?? 3)} onChange={(e: any) => patchStage(s.id, { sliceCols: Number(e.target.value) })}>
                                    {[2, 3, 4, 5, 6].map(x => <option key={x} value={x}>{x}</option>)}
                                </Select>
                            </FormField>
                            <FormField label={t('miniGames.asmRows', 'Rows')}>
                                <Select value={String(s.sliceRows ?? 3)} onChange={(e: any) => patchStage(s.id, { sliceRows: Number(e.target.value) })}>
                                    {[2, 3, 4, 5, 6].map(x => <option key={x} value={x}>{x}</option>)}
                                </Select>
                            </FormField>
                        </div>
                        {sliceUrl && (
                            <div className="rounded-lg border border-slate-700/60 p-2">
                                <div className="text-[10px] text-slate-500 mb-1">{t('miniGames.asmPreview', 'The cut (pieces come out shuffled in play):')}</div>
                                <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${s.sliceCols ?? 3}, 1fr)`, width: 180 }}>
                                    {Array.from({ length: (s.sliceCols ?? 3) * (s.sliceRows ?? 3) }, (_, i) => {
                                        const c = i % (s.sliceCols ?? 3), r = Math.floor(i / (s.sliceCols ?? 3));
                                        return <div key={i} className="aspect-square rounded-[2px]" style={sliceCellStyle(sliceUrl, s.sliceCols ?? 3, s.sliceRows ?? 3, c, r) as any} />;
                                    })}
                                </div>
                            </div>
                        )}
                    </> : <>
                        <AssetSelector label={t('miniGames.asmBase', 'Board image (what the pieces land on — optional)')} assetType="images" value={s.baseImageId || null} onChange={id => patchStage(s.id, { baseImageId: id })} />
                        <div className="rounded-lg border border-slate-700/60 p-2">
                            <div className="text-xs font-semibold text-slate-300 mb-1">{t('miniGames.asmPieceList', 'Pieces')}</div>
                            {asmPieces.map((p, i) => (
                                <div key={p.id} className="flex items-end gap-1 mb-1">
                                    <div className="flex-1 min-w-0">
                                        <AssetSelector label={p.name || `${t('miniGames.targetPiece', 'Piece')} ${i + 1}`} assetType="images" value={p.imageId || null} onChange={id => patchStage(s.id, { pieces: asmPieces.map(x => x.id === p.id ? { ...x, imageId: id } : x) })} />
                                    </div>
                                    <button onClick={() => patchStage(s.id, { pieces: asmPieces.filter(x => x.id !== p.id) })} title={t('miniGames.asmRemovePiece', 'Remove piece')}
                                        className="mb-1 p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-700/50"><TrashIcon className="w-4 h-4" /></button>
                                </div>
                            ))}
                            <button onClick={() => patchStage(s.id, { pieces: [...asmPieces, { id: gid('piece'), name: `Piece ${asmPieces.length + 1}`, imageId: null, target: { x: 8 + (asmPieces.length % 4) * 22, y: 30 + Math.floor(asmPieces.length / 4) * 26, w: 18, h: 22 } }] })}
                                className="w-full mt-1 px-2 py-1.5 rounded-md text-xs font-semibold border border-dashed border-slate-500 text-slate-400 hover:text-white hover:border-slate-300">
                                + {t('miniGames.asmAddPiece', 'Add a piece')}
                            </button>
                        </div>
                        <button onClick={() => setTargetsPlacerOpen(true)} disabled={!asmPieces.length}
                            className="w-full px-2 py-1.5 rounded-md text-xs font-semibold bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed">
                            🧩 {t('miniGames.asmPlaceTargets', 'Place where each piece lands…')}
                        </button>
                    </>}
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label={`${t('miniGames.asmSnap', 'Snap distance')} (${s.snapTolerancePct ?? 8}%)`}>
                            <RangeInput min={3} max={20} step={1} value={s.snapTolerancePct ?? 8} onChange={(e: any) => patchStage(s.id, { snapTolerancePct: Number(e.target.value) })} />
                        </FormField>
                        <FormField label={t('miniGames.asmTray', 'Piece tray')}>
                            <Select value={s.trayPosition || 'bottom'} onChange={(e: any) => patchStage(s.id, { trayPosition: e.target.value })}>
                                <option value="bottom">{t('miniGames.asmTrayBottom', 'Along the bottom')}</option>
                                <option value="right">{t('miniGames.asmTrayRight', 'Down the right side')}</option>
                            </Select>
                        </FormField>
                    </div>
                    {/* Build & Color workshop: the assembled object is also colorable */}
                    {(() => {
                        const col = s.coloring || {};
                        const patchColoring = (patch: any) => patchStage(s.id, { coloring: { ...col, ...patch } });
                        return (
                            <CollapsibleSection title={`🖌 ${t('miniGames.buildColor', 'Build & Color')}`} summary={col.enabled ? t('miniGames.on', 'on') : t('miniGames.off', 'off')}>
                                <label className="flex items-center gap-2 mb-2">
                                    <input type="checkbox" className="w-4 h-4" checked={!!col.enabled} onChange={e => patchColoring({ enabled: e.target.checked || undefined })} />
                                    <span className="text-xs text-slate-300">{t('miniGames.buildColorOn', 'Players also COLOR what they build')}</span>
                                </label>
                                {col.enabled && <div className="space-y-2">
                                    <FormField label={t('miniGames.buildColorWhen', 'When can they color?')}>
                                        <Select value={col.freeOrder ? 'free' : 'after'} onChange={(e: any) => patchColoring({ freeOrder: e.target.value === 'free' || undefined })}>
                                            <option value="after">{t('miniGames.buildColorAfter', 'After it’s built (guided two-step)')}</option>
                                            <option value="free">{t('miniGames.buildColorFree', 'While building (freeform)')}</option>
                                        </Select>
                                    </FormField>
                                    <PalettesEditor
                                        inline={col.palettes || []}
                                        paletteIds={col.paletteIds || []}
                                        project={project}
                                        onChange={patch => patchColoring(patch)}
                                        onOpenArtStudio={() => setArtStudioOpen(true)}
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <FormField label={t('miniGames.tintMode', 'Paint style')}>
                                            <Select value={col.tintMode || 'multiply'} onChange={(e: any) => patchColoring({ tintMode: e.target.value })}>
                                                <option value="multiply">{t('miniGames.tintMultiply', 'Keep the art’s shading')}</option>
                                                <option value="replace">{t('miniGames.tintReplace', 'Flat color')}</option>
                                            </Select>
                                        </FormField>
                                        <FormField label={t('miniGames.paintBrushSize', 'Player brush size')}>
                                            <RangeInput min={2} max={20} step={1} value={col.brushSizePct ?? 7} onChange={(e: any) => patchColoring({ brushSizePct: Number(e.target.value) })} />
                                        </FormField>
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                        <label className="flex items-center gap-1.5">
                                            <input type="checkbox" className="w-4 h-4" checked={col.requireAllColored !== false} onChange={e => patchColoring({ requireAllColored: e.target.checked })} />
                                            <span className="text-xs text-slate-300">{t('miniGames.buildColorRequireAll', 'Every piece must be colored to win (off = a Done button)')}</span>
                                        </label>
                                        <label className="flex items-center gap-1.5">
                                            <input type="checkbox" className="w-4 h-4" checked={!!col.allowBrush} onChange={e => patchColoring({ allowBrush: e.target.checked || undefined })} />
                                            <span className="text-xs text-slate-300">{t('miniGames.paintAllowBrush', 'Players can also paint strokes (never outside the lines)')}</span>
                                        </label>
                                    </div>
                                    {asmMode === 'pieces' && asmPieces.length > 0 && <div className="rounded-lg border border-slate-700/60 p-2">
                                        <div className="text-xs font-semibold text-slate-300 mb-1">{t('miniGames.colorSlots', 'Color slots (for “Player colors → story UI”)')}</div>
                                        {asmPieces.map((p, i) => (
                                            <div key={p.id} className="flex items-center gap-1.5 mb-1">
                                                <span className="text-[11px] text-slate-400 w-24 truncate flex-shrink-0">{p.name || `${t('miniGames.targetPiece', 'Piece')} ${i + 1}`}</span>
                                                <TextInput value={(p as any).colorSlot || ''} placeholder={t('miniGames.colorSlotPh', 'Color slot name (optional — e.g. dress)')}
                                                    onChange={(e: any) => patchStage(s.id, { pieces: asmPieces.map(x => x.id === p.id ? { ...x, colorSlot: e.target.value || undefined } : x) })} />
                                            </div>
                                        ))}
                                        <p className="text-[10px] text-slate-500">{t('miniGames.colorSlotsHint', 'Name a piece’s slot and the color the player gives it can restyle the story UI, and lands in a text variable with the same name.')}</p>
                                    </div>}
                                </div>}
                            </CollapsibleSection>
                        );
                    })()}
                    {common}
                </div>
            </CollapsibleSection>;
        }
        if (stage.stageType === 'paint') {
            const s = stage as VNPaintStage;
            const pregions = s.regions || [];
            const patchRegion = (id: VNID, patch: any) => patchStage(s.id, { regions: pregions.map(r => r.id === id ? { ...r, ...patch } : r) });
            return <CollapsibleSection title={`${meta.glyph} ${t('miniGames.stageSettings', 'Stage settings')} — ${meta.label}`} defaultOpen>
                <div className="space-y-2">
                    <AssetSelector label={t('miniGames.paintBase', 'Picture to color in')} assetType="images" value={s.baseImageId || null} onChange={id => patchStage(s.id, { baseImageId: id })} />
                    <div className="rounded-lg border border-slate-700/60 p-2">
                        <div className="text-xs font-semibold text-slate-300 mb-1">{t('miniGames.paintRegions', 'Paintable areas')}</div>
                        {pregions.map((r, i) => (
                            <div key={r.id} className="rounded-md border border-slate-700/60 p-1.5 mb-1 space-y-1">
                                <div className="flex items-center gap-1">
                                    <TextInput value={r.name || ''} placeholder={`${t('miniGames.paintRegion', 'Area')} ${i + 1}`} onChange={(e: any) => patchRegion(r.id, { name: e.target.value || undefined })} />
                                    <button onClick={() => patchStage(s.id, { regions: pregions.filter(x => x.id !== r.id) })} title={t('miniGames.paintRemoveRegion', 'Remove area')}
                                        className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-700/50 flex-shrink-0"><TrashIcon className="w-4 h-4" /></button>
                                </div>
                                <AssetSelector label={t('miniGames.paintMask', 'Mask image (optional — else it’s a shape you place)')} assetType="images" value={r.maskImageId || null} onChange={id => patchRegion(r.id, { maskImageId: id })} />
                                <TextInput value={r.colorSlot || ''} placeholder={t('miniGames.colorSlotPh', 'Color slot name (optional — e.g. dress)')} onChange={(e: any) => patchRegion(r.id, { colorSlot: e.target.value || undefined })} />
                            </div>
                        ))}
                        <button onClick={() => patchStage(s.id, { regions: [...pregions, { id: gid('region'), name: `Area ${pregions.length + 1}`, shape: 'rect' as const, x: 12 + (pregions.length % 3) * 26, y: 25 + Math.floor(pregions.length / 3) * 28, w: 22, h: 24 }] })}
                            className="w-full mt-1 px-2 py-1.5 rounded-md text-xs font-semibold border border-dashed border-slate-500 text-slate-400 hover:text-white hover:border-slate-300">
                            + {t('miniGames.paintAddRegion', 'Add an area')}
                        </button>
                        <p className="text-[10px] text-slate-500 mt-1">{t('miniGames.paintMaskHint', 'Masks (white-on-transparent PNGs) follow curvy outlines exactly — make one in the Art Studio’s mask mode. Areas without a mask are simple shapes you place below. Named color slots feed “Player colors → story UI”.')}</p>
                    </div>
                    <button onClick={() => setPaintPlacerOpen(true)} disabled={!pregions.some(r => !r.maskImageId)}
                        className="w-full px-2 py-1.5 rounded-md text-xs font-semibold bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed">
                        🎯 {t('miniGames.paintPlace', 'Place the shape areas…')}
                    </button>
                    <PalettesEditor
                        inline={s.palettes || []}
                        paletteIds={s.paletteIds || []}
                        project={project}
                        onChange={patch => patchStage(s.id, patch)}
                        onOpenArtStudio={() => setArtStudioOpen(true)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label={t('miniGames.tintMode', 'Paint style')}>
                            <Select value={s.tintMode || 'multiply'} onChange={(e: any) => patchStage(s.id, { tintMode: e.target.value })}>
                                <option value="multiply">{t('miniGames.tintMultiply', 'Keep the art’s shading')}</option>
                                <option value="replace">{t('miniGames.tintReplace', 'Flat color')}</option>
                            </Select>
                        </FormField>
                        <FormField label={t('miniGames.paintBrushSize', 'Player brush size')}>
                            <RangeInput min={2} max={20} step={1} value={s.brushSizePct ?? 7} onChange={(e: any) => patchStage(s.id, { brushSizePct: Number(e.target.value) })} />
                        </FormField>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <label className="flex items-center gap-1.5">
                            <input type="checkbox" className="w-4 h-4" checked={s.requireAllRegions !== false} onChange={e => patchStage(s.id, { requireAllRegions: e.target.checked })} />
                            <span className="text-xs text-slate-300">{t('miniGames.paintRequireAll', 'Every area must be painted to win (off = a Done button)')}</span>
                        </label>
                        <label className="flex items-center gap-1.5">
                            <input type="checkbox" className="w-4 h-4" checked={!!s.allowBrush} onChange={e => patchStage(s.id, { allowBrush: e.target.checked || undefined })} />
                            <span className="text-xs text-slate-300">{t('miniGames.paintAllowBrush', 'Players can also paint strokes (never outside the lines)')}</span>
                        </label>
                    </div>
                    {common}
                </div>
            </CollapsibleSection>;
        }
        if (stage.stageType === 'qte') {
            const s = stage as VNQteStage;
            const prompts = s.prompts || [];
            const patchPrompt = (id: VNID, patch: any) => patchStage(s.id, { prompts: prompts.map(p => p.id === id ? { ...p, ...patch } : p) });
            const hasKeyPrompts = prompts.some(p => p.kind === 'key');
            return <CollapsibleSection title={`${meta.glyph} ${t('miniGames.stageSettings', 'Stage settings')} — ${meta.label}`} defaultOpen>
                <div className="space-y-2">
                    <div className="rounded-lg border border-slate-700/60 p-2">
                        <div className="text-xs font-semibold text-slate-300 mb-1">{t('miniGames.qtePrompts', 'Prompts (hit them in order)')}</div>
                        {prompts.map((p, i) => (
                            <div key={p.id} className="rounded-md border border-slate-700/60 p-1.5 mb-1 space-y-1">
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-slate-500 flex-shrink-0 w-4 text-center">{i + 1}</span>
                                    <Select value={p.kind} onChange={(e: any) => patchPrompt(p.id, { kind: e.target.value })}>
                                        <option value="button">{t('miniGames.qteButton', 'Tap target')}</option>
                                        <option value="key">{t('miniGames.qteKey', 'Keyboard key')}</option>
                                    </Select>
                                    {p.kind === 'key' && (
                                        <KeyCaptureField value={p.key} onChange={k => patchPrompt(p.id, { key: k })} />
                                    )}
                                    <button onClick={() => patchStage(s.id, { prompts: prompts.filter(x => x.id !== p.id) })} title={t('miniGames.qteRemovePrompt', 'Remove prompt')}
                                        className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-700/50 flex-shrink-0"><TrashIcon className="w-4 h-4" /></button>
                                </div>
                                <TextInput value={p.label || ''} placeholder={t('miniGames.qteLabelPh', 'Text on the target (optional)')} onChange={(e: any) => patchPrompt(p.id, { label: e.target.value || undefined })} />
                                <AssetSelector label={t('miniGames.qteImage', 'Art on the target (optional)')} assetType="images" value={p.imageId || null} onChange={id => patchPrompt(p.id, { imageId: id })} />
                                <div className="grid grid-cols-3 gap-1.5">
                                    <FormField label={`${t('miniGames.qteWindow', 'Time')} (${((p.windowMs ?? 1500) / 1000).toFixed(1)}s)`}>
                                        <RangeInput min={300} max={5000} step={100} value={p.windowMs ?? 1500} onChange={(e: any) => patchPrompt(p.id, { windowMs: Number(e.target.value) })} />
                                    </FormField>
                                    <FormField label={t('miniGames.qteX', 'Across (%)')}>
                                        <TextInput type="number" min={5} max={95} value={p.xPct ?? 50} onChange={(e: any) => patchPrompt(p.id, { xPct: Math.max(0, Math.min(100, Number(e.target.value) || 50)) })} />
                                    </FormField>
                                    <FormField label={t('miniGames.qteY', 'Down (%)')}>
                                        <TextInput type="number" min={5} max={95} value={p.yPct ?? 50} onChange={(e: any) => patchPrompt(p.id, { yPct: Math.max(0, Math.min(100, Number(e.target.value) || 50)) })} />
                                    </FormField>
                                </div>
                                {/* Per-prompt reactions + background (needs a Reacting character / to swap the backdrop) */}
                                {game.character?.characterId && (
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <FormField label={t('miniGames.qteHitExpr', 'Character on hit')}><ExpressionSelect project={project} characterId={game.character.characterId} value={p.hitExpressionId} onChange={id => patchPrompt(p.id, { hitExpressionId: id })} noneLabel={t('miniGames.reactDefault', 'Default reaction')} /></FormField>
                                        <FormField label={t('miniGames.qteMissExpr', 'Character on miss')}><ExpressionSelect project={project} characterId={game.character.characterId} value={p.missExpressionId} onChange={id => patchPrompt(p.id, { missExpressionId: id })} noneLabel={t('miniGames.reactDefault', 'Default reaction')} /></FormField>
                                    </div>
                                )}
                                <AssetSelector label={t('miniGames.qtePromptBg', 'Swap the backdrop for this prompt (optional)')} assetType="images" value={p.bgImageId || null} onChange={id => patchPrompt(p.id, { bgImageId: id })} />
                                {/* Per-tap feedback override — falls back to the stage's On-screen feedback. */}
                                <CollapsibleSection title={t('miniGames.qtePromptFeedback', 'Custom hit/miss for this tap')}
                                    summary={[p.hitFeedback && p.hitFeedback.enabled !== false && (p.hitFeedback.text || p.hitFeedback.imageId) ? '✔' : '', p.missFeedback && p.missFeedback.enabled !== false && (p.missFeedback.text || p.missFeedback.imageId) ? '✖' : ''].filter(Boolean).join(' ') || t('miniGames.usesStage', 'uses stage')}>
                                    <MessageConfigEditor
                                        label={t('miniGames.hitFeedback', 'When they get one RIGHT')}
                                        defaultOptionLabel={t('miniGames.qteUseStageFeedback', 'Use the stage default')}
                                        defaultText={t('miniGames.hitFeedbackText', 'Nice!')}
                                        msg={p.hitFeedback}
                                        onChange={m => patchPrompt(p.id, { hitFeedback: m })}
                                        project={project}
                                    />
                                    <MessageConfigEditor
                                        label={t('miniGames.missFeedback', 'When they get one WRONG')}
                                        defaultOptionLabel={t('miniGames.qteUseStageFeedback', 'Use the stage default')}
                                        defaultText={t('miniGames.missFeedbackText', 'Try again!')}
                                        msg={p.missFeedback}
                                        onChange={m => patchPrompt(p.id, { missFeedback: m })}
                                        project={project}
                                    />
                                </CollapsibleSection>
                            </div>
                        ))}
                        <button onClick={() => patchStage(s.id, { prompts: [...prompts, { id: gid('qte'), kind: 'button' as const, windowMs: 1500, xPct: 20 + Math.floor(Math.random() * 60), yPct: 20 + Math.floor(Math.random() * 60) }] })}
                            className="w-full mt-1 px-2 py-1.5 rounded-md text-xs font-semibold border border-dashed border-slate-500 text-slate-400 hover:text-white hover:border-slate-300">
                            + {t('miniGames.qteAddPrompt', 'Add a prompt')}
                        </button>
                        {hasKeyPrompts && (
                            <p className="text-[10px] text-amber-400/90 mt-1">⌨️ {t('miniGames.qteKeyboardWarn', 'Keyboard prompts need a keyboard — prefer tap targets if your game will be played on phones.')}</p>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label={`${t('miniGames.qteGap', 'Pause between prompts')} (${((s.gapMs ?? 400) / 1000).toFixed(1)}s)`}>
                            <RangeInput min={0} max={2000} step={100} value={s.gapMs ?? 400} onChange={(e: any) => patchStage(s.id, { gapMs: Number(e.target.value) })} />
                        </FormField>
                        <FormField label={t('miniGames.qteOnMiss', 'Missing a prompt')}>
                            <Select value={s.onMiss || 'retry'} onChange={(e: any) => patchStage(s.id, { onMiss: e.target.value })}>
                                <option value="retryPrompt">{t('miniGames.qteRetryPrompt', 'Retry just that tap')}</option>
                                <option value="retry">{t('miniGames.qteRetry', 'Restart the sequence')}</option>
                                <option value="fail">{t('miniGames.qteFail', 'Lose the game')}</option>
                            </Select>
                        </FormField>
                    </div>
                    <label className="flex items-center gap-1.5">
                        <input type="checkbox" className="w-4 h-4" checked={s.showProgressPips !== false} onChange={e => patchStage(s.id, { showProgressPips: e.target.checked })} />
                        <span className="text-xs text-slate-300">{t('miniGames.qtePips', 'Show progress dots')}</span>
                    </label>
                    <p className="text-[10px] text-slate-500">{t('miniGames.qteHint', '“Retry just that tap” keeps earlier progress and re-arms only the missed prompt; “Restart the sequence” sends them back to the first prompt; “Lose the game” ends it immediately. A miss still uses up a try when the game has a mistake limit.')}</p>
                    {common}
                </div>
            </CollapsibleSection>;
        }
        return <CollapsibleSection title={`${meta.glyph} ${t('miniGames.stageSettings', 'Stage settings')} — ${meta.label}`} defaultOpen>
            <p className="text-xs text-slate-400 mb-2">{t('miniGames.typeComingSoon', 'This mini game type is coming soon — in play it currently shows a tap-to-continue placeholder.')}</p>
            <div className="space-y-2">{common}</div>
        </CollapsibleSection>;
    })();

    return (
        <div className="flex h-full">
            {typePicker}
            {maskPainterOpen && stage?.stageType === 'wipe' && (
                <CoverMaskPainter
                    revealUrl={assetResolver((stage as VNWipeStage).revealImageId || null, 'image')}
                    initialMaskUrl={assetResolver((stage as VNWipeStage).coverMaskImageId || null, 'image')}
                    onSave={saveCoverMask}
                    onClose={() => setMaskPainterOpen(false)}
                />
            )}
            {spotsPlacerOpen && stage?.stageType === 'hidden' && (
                <HiddenSpotsPlacer
                    stage={stage as VNHiddenObjectStage}
                    imageUrl={assetResolver((stage as VNHiddenObjectStage).sceneImageId || null, 'image')}
                    onPatch={patch => patchStage(stage.id, patch)}
                    onClose={() => { setSpotsPlacerOpen(false); setPreviewKey(k => k + 1); }}
                />
            )}
            {artStudioOpen && <ArtStudio onClose={() => setArtStudioOpen(false)} />}
            {targetsPlacerOpen && stage?.stageType === 'assemble' && (
                <AssembleTargetsPlacer
                    stage={stage as VNAssembleStage}
                    baseUrl={assetResolver((stage as VNAssembleStage).baseImageId || null, 'image')}
                    pieceUrl={id => assetResolver(id, 'image')}
                    onPatch={patch => patchStage(stage.id, patch)}
                    onClose={() => { setTargetsPlacerOpen(false); setPreviewKey(k => k + 1); }}
                />
            )}
            {paintPlacerOpen && stage?.stageType === 'paint' && (
                <PaintRegionsPlacer
                    stage={stage as VNPaintStage}
                    imageUrl={assetResolver((stage as VNPaintStage).baseImageId || null, 'image')}
                    maskUrl={id => assetResolver(id, 'image')}
                    onPatch={patch => patchStage(stage.id, patch)}
                    onClose={() => { setPaintPlacerOpen(false); setPreviewKey(k => k + 1); }}
                />
            )}
            {/* ── list column ── */}
            <div className="bg-slate-800 border-r border-slate-700 flex flex-col" style={{ width: 'var(--sidebar-width)' }}>
                <div className="p-4 border-b border-slate-700">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <GamepadIcon className="w-5 h-5" />
                        {t('miniGames.listTitle', 'Mini Games')}
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-1">{t('miniGames.listHint', 'Show one from a scene with the “Show Mini Game” command, or from any button action.')}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {Object.values(games).map(g => (
                        <div key={g.id}
                            onClick={() => { setActiveGameId(g.id); setSelectedStageId(g.stages[0]?.id || null); setPreviewResult(null); setPreviewKey(k => k + 1); }}
                            className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border ${activeGameId === g.id ? 'bg-emerald-500/15 border-emerald-500/50' : 'border-transparent hover:bg-slate-700/40'}`}>
                            <span className="text-base">{stageMeta(g.stages[0]?.stageType || 'wipe').glyph}</span>
                            <span className="flex-1 min-w-0 truncate text-sm text-slate-200">{g.name}</span>
                            {g.stages.length > 1 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300">{g.stages.length}</span>}
                            <button onClick={e => { e.stopPropagation(); removeGame(g.id); }} title={t('miniGames.deleteGame', 'Delete mini game')}
                                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"><TrashIcon className="w-3.5 h-3.5" /></button>
                        </div>
                    ))}
                    {Object.keys(games).length === 0 && (
                        <div className="text-center text-slate-500 text-xs px-4 py-10">
                            <div className="text-3xl mb-2">🕹️</div>
                            {t('miniGames.empty', 'No mini games yet. Make one and drop a “Show Mini Game” command into any scene!')}
                        </div>
                    )}
                </div>
                <div className="p-2 border-t border-slate-700 space-y-1.5">
                    <button onClick={() => setPicker('new')}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-md flex items-center justify-center gap-2 font-bold transition-colors">
                        <PlusIcon className="w-4 h-4" />
                        {t('miniGames.newGame', 'New Mini Game')}
                    </button>
                    <button onClick={() => setArtStudioOpen(true)}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white p-2 rounded-md flex items-center justify-center gap-2 text-sm font-semibold transition-colors">
                        🎨 {t('miniGames.artStudio', 'Art Studio')}
                    </button>
                </div>
            </div>

            {!game ? (
                <div className="flex-1 flex items-center justify-center text-slate-400">
                    <div className="text-center">
                        <GamepadIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-lg">{t('miniGames.selectToEdit', 'Pick a mini game — or create your first one!')}</p>
                    </div>
                </div>
            ) : (
                <>
                    {/* ── config column ── */}
                    <div className="w-[360px] xl:w-[400px] flex-shrink-0 border-r border-slate-700 overflow-y-auto p-3 space-y-2">
                        <FormField label={t('miniGames.name', 'Name')}>
                            <TextInput value={game.name} onChange={(e: any) => patchGame({ name: e.target.value })} />
                        </FormField>

                        {/* Stages strip — the mixing door */}
                        <div className="rounded-lg border border-slate-700/60 p-2">
                            <div className="text-xs font-semibold text-slate-300 mb-1.5">{t('miniGames.stages', 'Stages (play in order)')}</div>
                            <div className="flex flex-wrap gap-1.5">
                                {game.stages.map((s, i) => {
                                    const m = stageMeta(s.stageType);
                                    const sel = stage?.id === s.id;
                                    return (
                                        <div key={s.id} onClick={() => setSelectedStageId(s.id)}
                                            className={`flex items-center gap-1 pl-2 pr-1 py-1 rounded-full border cursor-pointer text-xs ${sel ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200' : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500'}`}>
                                            <span>{m.glyph}</span>
                                            <span>{i + 1}. {m.label}</span>
                                            {sel && <span className="flex items-center">
                                                <button className="px-0.5 text-slate-400 hover:text-white disabled:opacity-30" disabled={i === 0} onClick={e => { e.stopPropagation(); moveStage(s.id, -1); }} title={t('miniGames.moveEarlier', 'Play earlier')}>◀</button>
                                                <button className="px-0.5 text-slate-400 hover:text-white disabled:opacity-30" disabled={i === game.stages.length - 1} onClick={e => { e.stopPropagation(); moveStage(s.id, 1); }} title={t('miniGames.moveLater', 'Play later')}>▶</button>
                                                <button className="px-0.5 text-slate-400 hover:text-red-400 disabled:opacity-30" disabled={game.stages.length <= 1} onClick={e => { e.stopPropagation(); removeStage(s.id); }} title={t('miniGames.removeStage', 'Remove stage')}>✕</button>
                                            </span>}
                                        </div>
                                    );
                                })}
                                <button onClick={() => setPicker('addStage')} className="px-2 py-1 rounded-full border border-dashed border-slate-500 text-xs text-slate-400 hover:text-white hover:border-slate-300">
                                    + {t('miniGames.addStage', 'Add another stage')}
                                </button>
                            </div>
                        </div>

                        {stageEditor}

                        <CollapsibleSection title={t('miniGames.looks', 'How it looks')} summary={game.title || game.instructions ? '✎' : ''}>
                            <div className="space-y-2">
                                <FormField label={t('miniGames.title', 'Title shown to the player')}>
                                    <TextInput value={game.title || ''} onChange={(e: any) => patchGame({ title: e.target.value || undefined })} placeholder={game.name} />
                                </FormField>
                                <FormField label={t('miniGames.instructions', 'Instructions line')}>
                                    <TextInput value={game.instructions || ''} onChange={(e: any) => patchGame({ instructions: e.target.value || undefined })} />
                                </FormField>
                                <FormField label={t('miniGames.introText', 'Intro splash (tap to start; the timer starts after)')}>
                                    <TextArea rows={2} value={game.introText || ''} onChange={(e: any) => patchGame({ introText: e.target.value || undefined })} />
                                </FormField>
                                <FormField label={t('miniGames.backgroundColor', 'Shade behind the game')} hint={t('miniGames.backgroundColorHint', 'Pick a color and drag the slider for how solid it is. A dark, mostly-solid shade keeps the scene dimly visible behind the game.')}>
                                    <ColorInput allowAlpha value={game.backgroundColor || 'rgba(0,0,0,0.75)'} onChange={(v: string) => patchGame({ backgroundColor: v })} />
                                </FormField>
                                <FormField label={t('miniGames.gameFont', 'Font for all the game text')} hint={t('miniGames.gameFontHint', 'Used for the title, instructions, tap labels, cutscenes and buttons. Import your own .ttf fonts in the project Fonts library, then pick one here. Individual popups can still override this.')}>
                                    <FontSelect project={project} value={game.fontFamily} onChange={v => patchGame({ fontFamily: v })} defaultLabel={t('miniGames.gameFontDefault', 'Default font')} />
                                </FormField>
                                <AssetSelector label={t('miniGames.backgroundImage', 'Backdrop image')} assetType="images" value={game.backgroundImage || null} onChange={id => patchGame({ backgroundImage: id })} />
                            </div>
                        </CollapsibleSection>

                        {/* Reacting character (general): reacts to hits/misses/win/fail while playing. */}
                        <CollapsibleSection title={t('miniGames.reactChar', 'Reacting character')} summary={game.character ? (project.characters as any)?.[game.character.characterId]?.name || t('miniGames.on', 'on') : t('miniGames.off', 'off')}>
                            <p className="text-[10px] text-slate-500 mb-2">{t('miniGames.reactCharHint', 'Show a character in the game that reacts to hits, misses, winning and losing — perfect for a music game where the singer frowns when you miss a note.')}</p>
                            {(() => {
                                const c = game.character;
                                const patchChar = (patch: any) => patchGame({ character: c ? { ...c, ...patch } : { characterId: patch.characterId, ...patch } });
                                const chars = Object.values(project.characters || {}) as any[];
                                return <>
                                    <FormField label={t('miniGames.reactCharPick', 'Character')}>
                                        <Select value={c?.characterId || ''} onChange={(e: any) => { const id = e.target.value; patchGame({ character: id ? { ...(c || {}), characterId: id } : undefined }); }}>
                                            <option value="">{t('miniGames.reactCharNone', 'None')}</option>
                                            {chars.map(ch => <option key={ch.id} value={ch.id}>{ch.name || ch.id}</option>)}
                                        </Select>
                                    </FormField>
                                    {c?.characterId && <div className="space-y-2">
                                        <div className="grid grid-cols-2 gap-2">
                                            <FormField label={t('miniGames.reactIdle', 'Resting look')}><ExpressionSelect project={project} characterId={c.characterId} value={c.idleExpressionId} onChange={id => patchChar({ idleExpressionId: id })} noneLabel={t('miniGames.reactFirst', 'First expression')} /></FormField>
                                            <FormField label={t('miniGames.reactHit', 'When they hit')}><ExpressionSelect project={project} characterId={c.characterId} value={c.hitExpressionId} onChange={id => patchChar({ hitExpressionId: id })} noneLabel={t('miniGames.reactSame', 'Same as resting')} /></FormField>
                                            <FormField label={t('miniGames.reactMiss', 'When they miss')}><ExpressionSelect project={project} characterId={c.characterId} value={c.missExpressionId} onChange={id => patchChar({ missExpressionId: id })} noneLabel={t('miniGames.reactSame', 'Same as resting')} /></FormField>
                                            <FormField label={t('miniGames.reactWin', 'On win')}><ExpressionSelect project={project} characterId={c.characterId} value={c.winExpressionId} onChange={id => patchChar({ winExpressionId: id })} noneLabel={t('miniGames.reactSame', 'Same as resting')} /></FormField>
                                            <FormField label={t('miniGames.reactFail', 'On lose')}><ExpressionSelect project={project} characterId={c.characterId} value={c.failExpressionId} onChange={id => patchChar({ failExpressionId: id })} noneLabel={t('miniGames.reactSame', 'Same as resting')} /></FormField>
                                            <FormField label={`${t('miniGames.reactHold', 'Reaction hold')} (${((c.reactMs ?? 500) / 1000).toFixed(1)}s)`}><RangeInput min={150} max={2000} step={50} value={c.reactMs ?? 500} onChange={(e: any) => patchChar({ reactMs: Number(e.target.value) })} /></FormField>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <FormField label={t('miniGames.reactX', 'Across (%)')}><TextInput type="number" min={0} max={100} value={c.x ?? 22} onChange={(e: any) => patchChar({ x: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></FormField>
                                            <FormField label={t('miniGames.reactY', 'Down (%)')}><TextInput type="number" min={0} max={100} value={c.y ?? 8} onChange={(e: any) => patchChar({ y: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></FormField>
                                            <FormField label={t('miniGames.reactSize', 'Size (%)')}><TextInput type="number" min={5} max={100} value={c.size ?? 62} onChange={(e: any) => patchChar({ size: Math.max(5, Math.min(100, Number(e.target.value) || 62)) })} /></FormField>
                                        </div>
                                        <label className="flex items-center gap-2">
                                            <input type="checkbox" className="w-4 h-4" checked={!!c.flipX} onChange={e => patchChar({ flipX: e.target.checked || undefined })} />
                                            <span className="text-xs text-slate-300">{t('miniGames.reactFlip', 'Face the other way (mirror)')}</span>
                                        </label>
                                    </div>}
                                </>;
                            })()}
                        </CollapsibleSection>

                        {/* Scoring & performance outcomes (general): export score + branch by accuracy. */}
                        <CollapsibleSection title={t('miniGames.scoring', 'Scoring & outcomes')} summary={game.score?.tiers?.length ? `${game.score.tiers.length} ${t('miniGames.tiers', 'tiers')}` : (game.score?.accuracyVariableId || game.score?.hitsVariableId ? '✎' : t('miniGames.off', 'off'))}>
                            <p className="text-[10px] text-slate-500 mb-2">{t('miniGames.scoringHint', 'Count correct vs wrong moves into number variables, then branch on how well the player did — send a great run to one scene and a rough one to another.')}</p>
                            {(() => {
                                const s = game.score;
                                const patchScore = (patch: any) => patchGame({ score: { ...(s || {}), ...patch } });
                                const tiers = s?.tiers || [];
                                return <>
                                    <div className="rounded-lg border border-slate-700/60 p-2 space-y-2">
                                        <div className="text-xs font-semibold text-slate-300">{t('miniGames.scoreVars', 'Save the score into variables')}</div>
                                        <FormField label={t('miniGames.scoreHits', 'Correct moves → variable')}><NumberVarSelect project={project} value={s?.hitsVariableId} onChange={id => patchScore({ hitsVariableId: id })} noneLabel={t('miniGames.dontSave', "Don't save")} /></FormField>
                                        <FormField label={t('miniGames.scoreMisses', 'Wrong moves → variable')}><NumberVarSelect project={project} value={s?.missesVariableId} onChange={id => patchScore({ missesVariableId: id })} noneLabel={t('miniGames.dontSave', "Don't save")} /></FormField>
                                        <FormField label={t('miniGames.scoreAcc', 'Accuracy % → variable')}><NumberVarSelect project={project} value={s?.accuracyVariableId} onChange={id => patchScore({ accuracyVariableId: id })} noneLabel={t('miniGames.dontSave', "Don't save")} /></FormField>
                                        <p className="text-[10px] text-slate-500">{t('miniGames.scoreVarsHint', 'Make number variables in the Variables tab first. You can branch with conditions anywhere using these.')}</p>
                                    </div>
                                    <div className="rounded-lg border border-slate-700/60 p-2 mt-2 space-y-2">
                                        <div className="text-xs font-semibold text-slate-300">{t('miniGames.outcomeTiers', 'Outcome tiers (by accuracy)')}</div>
                                        {tiers.map((tr, i) => (
                                            <div key={tr.id} className="rounded-md border border-slate-700/60 p-1.5 space-y-1">
                                                <div className="flex items-center gap-1">
                                                    <TextInput value={tr.name} placeholder={t('miniGames.tierName', 'e.g. Perfect')} onChange={(e: any) => patchScore({ tiers: tiers.map(x => x.id === tr.id ? { ...x, name: e.target.value } : x) })} />
                                                    <button onClick={() => patchScore({ tiers: tiers.filter(x => x.id !== tr.id) })} title={t('miniGames.tierRemove', 'Remove tier')} className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-700/50 flex-shrink-0"><TrashIcon className="w-4 h-4" /></button>
                                                </div>
                                                <FormField label={`${t('miniGames.tierMin', 'Reached at accuracy ≥')} ${tr.minAccuracy}%`}><RangeInput min={0} max={100} step={5} value={tr.minAccuracy} onChange={(e: any) => patchScore({ tiers: tiers.map(x => x.id === tr.id ? { ...x, minAccuracy: Number(e.target.value) } : x) })} /></FormField>
                                                <UIActionsListEditor actions={tr.actions || []} project={project} onChange={acts => patchScore({ tiers: tiers.map(x => x.id === tr.id ? { ...x, actions: acts } : x) })} label={t('miniGames.tierActions', 'When this tier wins')} />
                                            </div>
                                        ))}
                                        <button onClick={() => patchScore({ tiers: [...tiers, { id: gid('tier'), name: `Tier ${tiers.length + 1}`, minAccuracy: tiers.length === 0 ? 90 : 0, actions: [] }] })}
                                            className="w-full px-2 py-1.5 rounded-md text-xs font-semibold border border-dashed border-slate-500 text-slate-400 hover:text-white hover:border-slate-300">
                                            + {t('miniGames.tierAdd', 'Add an outcome tier')}
                                        </button>
                                        <p className="text-[10px] text-slate-500">{t('miniGames.tiersHint', 'On win, the highest tier the player reached runs its actions (after the normal Win actions). e.g. Perfect ≥90 → great ending, Okay ≥0 → normal ending.')}</p>
                                    </div>
                                </>;
                            })()}
                        </CollapsibleSection>

                        <CollapsibleSection title={t('miniGames.winning', 'Winning')} badge={String((game.winActions || []).length)} defaultOpen>
                            <p className="text-[10px] text-slate-500 mb-1">{t('miniGames.winHint', 'Runs after the LAST stage is completed. From a scene command, the story then continues on its own.')}</p>
                            <UIActionsListEditor actions={game.winActions || []} project={project} onChange={acts => patchGame({ winActions: acts })} label={t('miniGames.winActions', 'When the player wins')} />
                            <AssetSelector label={t('miniGames.winSfx', 'Win sound')} assetType="audio" value={game.winSfxId || null} onChange={id => patchGame({ winSfxId: id })} />
                            <MessageConfigEditor
                                label={t('miniGames.winMessage', 'The “You won!” popup')}
                                hint={t('miniGames.winMessageHint', 'The popup players see the moment they win. Keep the default ✓, write your own words/art, or turn it off completely.')}
                                defaultOptionLabel={t('miniGames.winMsgDefault', 'Default popup (a big ✓)')}
                                defaultText={t('miniGames.winMsgDefaultText', 'You did it!')}
                                msg={game.winMessage}
                                onChange={m => patchGame({ winMessage: m })}
                                project={project}
                            />
                        </CollapsibleSection>

                        {/* Palette→UI: only meaningful once a coloring stage names color slots */}
                        {(() => {
                            const knownSlots: string[] = [];
                            game.stages.forEach(st => {
                                if (st.stageType === 'paint') (st as VNPaintStage).regions?.forEach(r => { if (r.colorSlot && !knownSlots.includes(r.colorSlot)) knownSlots.push(r.colorSlot); });
                                if (st.stageType === 'assemble') (st as VNAssembleStage).pieces?.forEach(p => { if (p.colorSlot && !knownSlots.includes(p.colorSlot)) knownSlots.push(p.colorSlot); });
                            });
                            const mappings: VNPaletteToUiEntry[] = game.paletteToUi || [];
                            if (!knownSlots.length && !mappings.length) return null;
                            return (
                                <CollapsibleSection title={`🎨 ${t('miniGames.paletteToUi', 'Player colors → story UI')}`} badge={mappings.length ? String(mappings.length) : undefined}>
                                    <p className="text-[10px] text-slate-500 mb-2">{t('miniGames.paletteToUiHint', 'When the game is WON, the color the player left in a slot restyles part of the story UI — and every slot also lands in a text variable with the same name. Undo any time with the “Reset UI Colors” button action.')}</p>
                                    {mappings.map((m, i) => (
                                        <div key={i} className="flex items-center gap-1.5 mb-1">
                                            <Select value={m.slot} onChange={(e: any) => patchGame({ paletteToUi: mappings.map((x, xi) => xi === i ? { ...x, slot: e.target.value } : x) })}>
                                                {[m.slot, ...knownSlots.filter(sl => sl !== m.slot)].filter(Boolean).map(sl => <option key={sl} value={sl}>{sl}</option>)}
                                            </Select>
                                            <span className="text-slate-500 text-xs flex-shrink-0">→</span>
                                            <Select value={m.target} onChange={(e: any) => patchGame({ paletteToUi: mappings.map((x, xi) => xi === i ? { ...x, target: e.target.value } : x) })}>
                                                {UI_PALETTE_TARGETS.map(tg => <option key={tg.value} value={tg.value}>{tg.label}</option>)}
                                            </Select>
                                            <button onClick={() => patchGame({ paletteToUi: mappings.filter((_, xi) => xi !== i) })} title={t('miniGames.paletteToUiRemove', 'Remove')}
                                                className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-700/50 flex-shrink-0"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                                    <button disabled={!knownSlots.length}
                                        onClick={() => patchGame({ paletteToUi: [...mappings, { slot: knownSlots[0], target: 'dialogueBg' }] })}
                                        className="w-full mt-1 px-2 py-1.5 rounded-md text-xs font-semibold border border-dashed border-slate-500 text-slate-400 hover:text-white hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed">
                                        + {t('miniGames.paletteToUiAdd', 'Restyle something with a slot color')}
                                    </button>
                                    {!knownSlots.length && <p className="text-[10px] text-slate-500 mt-1">{t('miniGames.paletteToUiNoSlots', 'Name a color slot on a paint area or Build & Color piece first.')}</p>}
                                </CollapsibleSection>
                            );
                        })()}

                        <CollapsibleSection title={t('miniGames.skip', 'Skip button')} summary={game.skippable ? t('miniGames.on', 'on') : t('miniGames.off', 'off')}>
                            <label className="flex items-center gap-2 mb-2">
                                <input type="checkbox" className="w-4 h-4" checked={!!game.skippable} onChange={e => patchGame({ skippable: e.target.checked || undefined })} />
                                <span className="text-xs text-slate-300">{t('miniGames.skippable', 'Player can skip the whole game')}</span>
                            </label>
                            {game.skippable && <>
                                <FormField label={t('miniGames.skipLabel', 'Button label')}>
                                    <TextInput value={game.skipLabel || ''} onChange={(e: any) => patchGame({ skipLabel: e.target.value || undefined })} placeholder="Skip" />
                                </FormField>
                                <UIActionsListEditor actions={game.skipActions || []} project={project} onChange={acts => patchGame({ skipActions: acts })} label={t('miniGames.skipActions', 'When skipped')} />
                            </>}
                        </CollapsibleSection>

                        <CollapsibleSection title={t('miniGames.losing', 'Losing (time & mistakes)')}
                            summary={[(game.timeLimitSec ?? 0) > 0 ? `${game.timeLimitSec}s` : '', (game.mistakeLimit ?? 0) > 0 ? `${game.mistakeLimit} ♥` : ''].filter(Boolean).join(' · ') || t('miniGames.off', 'off')}>
                            <FormField label={t('miniGames.timeLimitSec', 'Time limit in seconds (0 = none; one clock spans all stages)')}>
                                <TextInput type="number" min={0} value={game.timeLimitSec ?? 0} onChange={(e: any) => { const v = Math.max(0, Number(e.target.value) || 0); patchGame({ timeLimitSec: v || undefined }); }} />
                            </FormField>
                            {(game.timeLimitSec ?? 0) > 0 && (
                                <label className="flex items-center gap-2 mb-2">
                                    <input type="checkbox" className="w-4 h-4" checked={game.showTimer !== false} onChange={e => patchGame({ showTimer: e.target.checked })} />
                                    <span className="text-xs text-slate-300">{t('miniGames.showTimer', 'Show the countdown bar')}</span>
                                </label>
                            )}
                            <FormField label={t('miniGames.mistakeLimit', 'Allowed mistakes (0 = mistakes are free)')} hint={t('miniGames.mistakeLimitHint', 'A failed card pair or a wrong tap uses up one try; running out loses the game. Spans all stages.')}>
                                <TextInput type="number" min={0} max={20} value={game.mistakeLimit ?? 0} onChange={(e: any) => { const v = Math.max(0, Math.min(20, Number(e.target.value) || 0)); patchGame({ mistakeLimit: v || undefined }); }} />
                            </FormField>
                            {(game.mistakeLimit ?? 0) > 0 && <>
                                <label className="flex items-center gap-2 mb-2">
                                    <input type="checkbox" className="w-4 h-4" checked={game.showMistakes !== false} onChange={e => patchGame({ showMistakes: e.target.checked })} />
                                    <span className="text-xs text-slate-300">{t('miniGames.showMistakes', 'Show remaining tries as hearts')}</span>
                                </label>
                                <label className="flex items-center gap-2 mb-2">
                                    <input type="checkbox" className="w-4 h-4" checked={!!game.mistakesPerStage} onChange={e => patchGame({ mistakesPerStage: e.target.checked || undefined })} />
                                    <span className="text-xs text-slate-300">{t('miniGames.mistakesPerStage', 'Tries refill on each stage (instead of one pool for the whole game)')}</span>
                                </label>
                            </>}
                            {((game.timeLimitSec ?? 0) > 0 || (game.mistakeLimit ?? 0) > 0) && <>
                                <FormField label={t('miniGames.failMode', 'When they run out of time or tries')}
                                    hint={game.failMode === 'retry'
                                        ? t('miniGames.failModeRetryHint', 'Unlimited fails — it just restarts, never a game over. (The "When the player loses" actions below are skipped in this mode; give the game a Skip button if you want an escape.)')
                                        : t('miniGames.failModeEndHint', 'Ends the mini-game and runs the actions below.')}>
                                    <Select value={game.failMode || 'end'} onChange={(e: any) => patchGame({ failMode: e.target.value === 'retry' ? 'retry' : undefined })}>
                                        <option value="end">{t('miniGames.failModeEnd', 'End the game (game over)')}</option>
                                        <option value="retry">{t('miniGames.failModeRetry', 'Let them keep trying (retry)')}</option>
                                    </Select>
                                </FormField>
                                {game.failMode === 'retry' && (
                                    <FormField label={t('miniGames.retryScope', 'On retry, restart…')}>
                                        <Select value={game.retryScope || 'game'} onChange={(e: any) => patchGame({ retryScope: e.target.value === 'stage' ? 'stage' : undefined })}>
                                            <option value="game">{t('miniGames.retryScopeGame', 'The whole game (from stage 1)')}</option>
                                            <option value="stage">{t('miniGames.retryScopeStage', 'Just the current stage (keep earlier stages cleared)')}</option>
                                        </Select>
                                    </FormField>
                                )}
                                <UIActionsListEditor actions={game.failActions || []} project={project} onChange={acts => patchGame({ failActions: acts })} label={t('miniGames.failActions', 'When the player loses')} />
                                <AssetSelector label={t('miniGames.failSfx', 'Lose sound')} assetType="audio" value={game.failSfxId || null} onChange={id => patchGame({ failSfxId: id })} />
                                <MessageConfigEditor
                                    label={t('miniGames.loseMessage', 'The “You lost” popup')}
                                    hint={t('miniGames.loseMessageHint', 'The popup players see when they run out of time or tries. Keep the default, write your own words/art, or turn it off completely.')}
                                    defaultOptionLabel={t('miniGames.loseMsgDefault', 'Default (⏰ time up / ✖ out of tries)')}
                                    defaultText={t('miniGames.loseMsgDefaultText', 'Oh no…')}
                                    msg={game.failMessage}
                                    onChange={m => patchGame({ failMessage: m })}
                                    project={project}
                                />
                            </>}
                        </CollapsibleSection>

                        <CollapsibleSection title={t('miniGames.sounds', 'Sounds')} summary={game.interactSfxId ? '♪' : ''}>
                            <AssetSelector label={t('miniGames.interactSfx', 'Interaction sound (taps, scrubs, snaps…)')} assetType="audio" value={game.interactSfxId || null} onChange={id => patchGame({ interactSfxId: id })} />
                        </CollapsibleSection>

                        <p className="text-[10px] text-slate-500 px-1">{t('miniGames.saveHint', 'Mini-game progress is never saved — if the player saves mid-game and loads, the game starts fresh.')}</p>
                    </div>

                    {/* ── live preview pane (the REAL engine component) ── */}
                    <div className="flex-1 min-w-0 flex flex-col p-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-bold text-slate-200">{t('miniGames.preview', 'Live preview — play it!')}</h3>
                            <button onClick={replay} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white">
                                ⟲ {t('miniGames.replay', 'Replay')}
                            </button>
                        </div>
                        <div className="relative w-full max-w-[960px] mx-auto aspect-video rounded-xl overflow-hidden border border-slate-700 bg-[radial-gradient(circle_at_30%_30%,#1e293b,#0f172a)]">
                            {game.stages.length > 0 ? (
                                <MiniGameFrame
                                    key={`${game.id}-${previewKey}-${gameSig}`}
                                    game={game}
                                    project={project}
                                    variables={{}}
                                    assetResolver={assetResolver}
                                    playSound={previewPlaySound}
                                    isEditorPreview
                                    onResolve={(kind, slotColors, score) => {
                                        const baseActs = (kind === 'win' ? game.winActions : kind === 'skip' ? game.skipActions : game.failActions) || [];
                                        // Show which outcome tier the score lands in (editor feedback only).
                                        const tier = kind === 'win' && score && game.score?.tiers?.length
                                            ? [...game.score.tiers].filter(t => score.accuracy >= (t.minAccuracy ?? 0)).sort((a, b) => (b.minAccuracy ?? 0) - (a.minAccuracy ?? 0))[0]
                                            : undefined;
                                        setPreviewResult({ kind, count: baseActs.length + (tier?.actions?.length || 0), slots: slotColors && Object.keys(slotColors).length ? slotColors : undefined, score, tierName: tier?.name });
                                    }}
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">{t('miniGames.noStages', 'Add a stage to play this game.')}</div>
                            )}
                            {previewResult && (
                                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70" style={{ animation: 'fade-in 0.2s ease-out' }}>
                                    <div className="text-4xl">{previewResult.kind === 'win' ? '🏆' : previewResult.kind === 'skip' ? '⏭️' : '⏰'}</div>
                                    <div className="text-slate-200 text-sm">
                                        {previewResult.kind === 'win' ? t('miniGames.previewWon', 'Won!') : previewResult.kind === 'skip' ? t('miniGames.previewSkipped', 'Skipped.') : t('miniGames.previewFailed', 'Time ran out.')}
                                        {' '}{t('miniGames.previewWouldRun', { defaultValue: 'In play, this would run {{count}} action(s).', count: previewResult.count })}
                                    </div>
                                    {previewResult.score && (previewResult.score.hits + previewResult.score.misses > 0) && (
                                        <div className="text-[11px] text-slate-300">
                                            {t('miniGames.previewScore', { defaultValue: 'Score: {{hits}} hit / {{misses}} miss · {{acc}}% accuracy', hits: previewResult.score.hits, misses: previewResult.score.misses, acc: previewResult.score.accuracy })}
                                            {previewResult.tierName && <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">🏅 {previewResult.tierName}</span>}
                                        </div>
                                    )}
                                    {previewResult.slots && (
                                        <div className="flex items-center gap-2 flex-wrap justify-center px-6">
                                            <span className="text-[11px] text-slate-400">{t('miniGames.previewSlots', 'Captured colors:')}</span>
                                            {Object.entries(previewResult.slots).map(([slot, color]) => (
                                                <span key={slot} className="flex items-center gap-1 text-[11px] text-slate-300">
                                                    <span className="w-3.5 h-3.5 rounded-full border border-black/40" style={{ background: color }} />{slot}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <button onClick={replay} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold">⟲ {t('miniGames.replay', 'Replay')}</button>
                                </div>
                            )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2 text-center">{t('miniGames.previewHint', 'This is the real game engine — exactly what players will get. Action exits are shown as a note here instead of running.')}</p>
                    </div>
                </>
            )}
        </div>
    );
};

export default MiniGamesManager;
