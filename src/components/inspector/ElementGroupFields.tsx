/**
 * Grouped field renderers for UI screen elements — the menu-editor counterpart to
 * CommandGroupFields. One source of group buckets drives both presentations:
 * the docked accordion (UIElementInspector) and the right-click radial popover
 * (ElementRadialContext). Writes flow through the caller's `updateElement`
 * (UPDATE_UI_ELEMENT) — presentation-only, no schema impact.
 *
 * "No field removed": every field from the original per-type editors lives here,
 * just re-bucketed into the canonical inspector groups.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../contexts/ProjectContext';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { VNTextAlign } from '../../types/shared';
import {
    VNUIElement, UIElementType, UIButtonElement, UITextElement, UIImageElement, UISaveSlotGridElement,
    UISettingsSliderElement, UISettingsToggleElement, UICharacterPreviewElement, UITextInputElement,
    UIDropdownElement, UICheckboxElement, UIAssetCyclerElement, UICGGalleryElement, UIInventoryGridElement, UIMeterElement, UICustomizerElement, DropdownOption,
    GameSetting, GameToggleSetting, UISlotRect, UIAppearanceState,
} from '../../features/ui/types';
import { VNVariable } from '../../features/variables/types';
import { hasBands, sortedBands } from '../../features/variables/bands';
import VariablePicker from '../variables/VariablePicker';
import { VNCharacter, VNCharacterLayer, VNLayerAsset } from '../../features/character/types';
import { FormField, TextInput, Select, ColorInput, RangeInput } from '../ui/Form';
import { pluginManager } from '../../features/plugins/PluginManagerService';
import { TrashIcon } from '../icons';
import FontEditor from '../ui/FontEditor';
import ActionEditor from '../menu-editor/ActionEditor';
import ActionCard from '../menu-editor/ActionCard';
import UIActionsListEditor from '../ui/UIActionsListEditor';
import AssetSelector from '../ui/AssetSelector';
import VideoTrimFields from '../ui/VideoTrimFields';
import ConditionsEditor from '../ui/ConditionsEditor';
import CollapsibleSection from '../ui/CollapsibleSection';
import { InspectorGroupId, GROUP_ORDER } from './inspectorGroups';
import { LayerControl, ParallaxDepthControl } from './LayerControl';
import { SlotDesignField } from './SaveSlotDesigner';

export type UpdateElement = (updates: Partial<VNUIElement>) => void;

/** Seed `count` slot rects (screen-percent, top-left anchored) laid out as a grid inside the
 *  element's current box. Used when switching a SaveSlotGrid/CGGallery to free placement, and by
 *  "Re-arrange as grid", so slots start in a sensible spot before the author drags them. */
function gridSeedRects(
    box: { x: number; y: number; width: number; height: number; anchorX?: number; anchorY?: number },
    count: number,
    cols: number,
): UISlotRect[] {
    const safeCount = Math.max(1, count);
    const safeCols = Math.max(1, cols);
    const left = box.x - (box.anchorX ?? 0) * box.width;
    const top = box.y - (box.anchorY ?? 0) * box.height;
    const gap = 2; // percent between cells
    const rows = Math.max(1, Math.ceil(safeCount / safeCols));
    const cellW = (box.width - gap * (safeCols - 1)) / safeCols;
    const cellH = (box.height - gap * (rows - 1)) / rows;
    const round = (n: number) => Math.round(n * 100) / 100;
    const rects: UISlotRect[] = [];
    for (let i = 0; i < safeCount; i++) {
        const r = Math.floor(i / safeCols);
        const c = i % safeCols;
        rects.push({
            x: round(left + c * (cellW + gap)),
            y: round(top + r * (cellH + gap)),
            width: round(cellW),
            height: round(cellH),
        });
    }
    return rects;
}

/** Canonical-ordered groups that apply to a given element. Common groups always
 *  apply; media/audio/logic depend on the element type (and, for settings*, on
 *  whether it's in variable mode — only then are there per-toggle actions). */
export function getElementGroups(element: VNUIElement): InspectorGroupId[] {
    const a = element as any;
    const set = new Set<InspectorGroupId>(['content', 'transform', 'appearance', 'animation', 'conditions']);
    switch (element.type) {
        case UIElementType.Button: set.add('media'); set.add('audio'); set.add('logic'); break;
        case UIElementType.SettingsSlider:
        case UIElementType.SettingsToggle: set.add('media'); if (a.variableId) set.add('logic'); break;
        case UIElementType.Dropdown:
        case UIElementType.Checkbox: set.add('logic'); break;
        case UIElementType.Meter: set.add('media'); break;
        case UIElementType.Timer: set.add('logic'); break;
        case UIElementType.Item: set.add('logic'); set.add('audio'); break;
        default: break;
    }
    return GROUP_ORDER.filter(g => set.has(g));
}

/** One-line collapsed summary for an element group. */
export function summarizeElementGroup(element: VNUIElement, groupId: InspectorGroupId, project: VNProject): string | undefined {
    const a = element as any;
    switch (groupId) {
        case 'content': {
            if (element.type === UIElementType.Button || element.type === UIElementType.Text) {
                const txt = (a.text || '').trim();
                return txt ? `"${txt.substring(0, 24)}"` : undefined;
            }
            if (element.type === UIElementType.Meter) {
                return a.variableId ? (project.variables[a.variableId]?.name || 'missing variable') : 'no variable';
            }
            return undefined;
        }
        case 'transform': return `${Math.round(element.x)},${Math.round(element.y)} · ${Math.round(element.width)}×${Math.round(element.height)}`;
        case 'appearance': return `${Math.round((element.opacity ?? 1) * 100)}%`;
        case 'media': {
            if (element.type === UIElementType.Button) {
                const img = a.image?.id ? (project.images[a.image.id]?.name || project.videos?.[a.image.id]?.name) : null;
                return img || 'none';
            }
            return undefined;
        }
        case 'audio': {
            if (element.type === UIElementType.Button) { const n = (a.clickSoundId ? 1 : 0) + (a.hoverSoundId ? 1 : 0); return n ? `${n} sound${n === 1 ? '' : 's'}` : 'none'; }
            return undefined;
        }
        case 'animation': return `${element.transitionIn || 'fade'} ${element.transitionDuration || 300}ms`;
        case 'logic': { const n = (a.action && a.action.type && a.action.type !== 'None' ? 1 : 0) + (a.actions?.length || 0); return n ? `${n} action${n === 1 ? '' : 's'}` : 'none'; }
        case 'conditions': {
            const n = (element.conditions?.length || 0) + (element.disabledConditions?.length || 0);
            const states = (element as { appearanceStates?: unknown[] }).appearanceStates?.length || 0;
            const parts: string[] = [];
            if (n) parts.push(`${n} rule${n === 1 ? '' : 's'}`);
            if (states) parts.push(`${states} state${states === 1 ? '' : 's'}`);
            return parts.length ? parts.join(', ') : 'none';
        }
        default: return undefined;
    }
}

interface Props {
    groupId: InspectorGroupId;
    element: VNUIElement;
    project: VNProject;
    updateElement: UpdateElement;
    /** Deep link to the Characters tab (Customizer → edit its character's layers/art). */
    onOpenCharacters?: (charId: VNID) => void;
}

/** Renders the fields for one (element, group) pair. */
export const ElementGroupFields: React.FC<Props> = ({ groupId, element, project, updateElement, onOpenCharacters }) => {
    const { t } = useTranslation('ui');
    const { dispatch } = useProject();

    // ── Common group fields (apply to every element type) ──────────────────────
    const renderTransformFields = () => (
        <>
            <div className="grid grid-cols-2 gap-2">
                <FormField label={t('elementInspector.xPct')}><TextInput type="number" value={element.x} onChange={e => updateElement({ x: parseFloat(e.target.value) || 0 })} /></FormField>
                <FormField label={t('elementInspector.yPct')}><TextInput type="number" value={element.y} onChange={e => updateElement({ y: parseFloat(e.target.value) || 0 })} /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <FormField label={t('elementInspector.widthPct')}><TextInput type="number" value={element.width} onChange={e => updateElement({ width: parseFloat(e.target.value) || 0 })} /></FormField>
                <FormField label={t('elementInspector.heightPct')}><TextInput type="number" value={element.height} onChange={e => updateElement({ height: parseFloat(e.target.value) || 0 })} /></FormField>
            </div>
            {/* Anchor preset grid: which point of the element sits on its X/Y coordinate.
                Center (middle dot) matches scene overlays, so the same X/Y lands in the same
                spot on a scene and on a screen. The raw inputs below fine-tune between presets. */}
            <div className="mt-1">
                <div className="text-[10px] text-slate-500 mb-1">{t('elementInspector.anchorPoint', 'Anchor (which part sits on X/Y)')}</div>
                <div className="inline-grid grid-cols-3 gap-0.5 p-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border-default)]">
                    {[0, 0.5, 1].map(ay => [0, 0.5, 1].map(ax => {
                        const active = Math.abs((element.anchorX ?? 0) - ax) < 0.01 && Math.abs((element.anchorY ?? 0) - ay) < 0.01;
                        return (
                            <button key={`${ax}-${ay}`} type="button"
                                onClick={() => updateElement({ anchorX: ax, anchorY: ay })}
                                title={`${ax === 0 ? 'left' : ax === 1 ? 'right' : 'center'} · ${ay === 0 ? 'top' : ay === 1 ? 'bottom' : 'middle'}`}
                                className={`w-5 h-5 rounded-sm flex items-center justify-center ${active ? 'bg-[var(--accent-purple)]' : 'hover:bg-[var(--bg-tertiary)]'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-slate-500'}`} />
                            </button>
                        );
                    }))}
                </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">{t('elementInspector.fineTuneAnchor')}</p>
            <div className="grid grid-cols-2 gap-2">
                <FormField label={t('elementInspector.anchorX')}><TextInput type="number" step="0.1" value={element.anchorX} onChange={e => updateElement({ anchorX: parseFloat(e.target.value) || 0 })} /></FormField>
                <FormField label={t('elementInspector.anchorY')}><TextInput type="number" step="0.1" value={element.anchorY} onChange={e => updateElement({ anchorY: parseFloat(e.target.value) || 0 })} /></FormField>
            </div>
            <LayerControl
                value={element.layer}
                siblings={(() => {
                    const scr = Object.values(project.uiScreens).find((s: any) => (s.elements || {})[element.id]) as any;
                    return scr ? Object.values(scr.elements).filter((e: any) => e.id !== element.id).map((e: any) => e.layer ?? 0) : undefined;
                })()}
                onChange={n => updateElement({ layer: n })}
            />
            <ParallaxDepthControl value={element.parallaxDepth} onChange={n => updateElement({ parallaxDepth: n })} />
            {(element.type === UIElementType.Image || (element.type === UIElementType.Button && !!(element as UIButtonElement).image)) && (
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)] mt-1">
                    <input type="checkbox" checked={!!element.fitToContent} onChange={e => updateElement({ fitToContent: e.target.checked })} className="cursor-pointer" />
                    {t('elementInspector.fitToContent')}
                </label>
            )}
        </>
    );
    const renderOpacityField = () => (
        <>
            <FormField label={t('elementInspector.opacity', { pct: Math.round((element.opacity ?? 1) * 100) })}>
                <RangeInput min={0} max={1} step={0.01} value={element.opacity ?? 1} onChange={e => updateElement({ opacity: parseFloat(e.target.value) })} className="w-full accent-purple-500" />
            </FormField>
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
                <input type="checkbox" checked={!!element.startHidden} onChange={e => updateElement({ startHidden: e.target.checked || undefined })} className="cursor-pointer" />
                {t('elementInspector.startHidden', 'Start hidden (revealed by a Show Element action)')}
            </label>
        </>
    );
    const renderAnimationFields = () => (
        <>
            <div className="grid grid-cols-2 gap-2">
                <FormField label={t('elementInspector.transitionIn')}>
                    <Select value={element.transitionIn || 'fade'} onChange={e => updateElement({ transitionIn: e.target.value as any })}>
                        <option value="none">{t('elementInspector.transNone')}</option>
                        <option value="fade">{t('elementInspector.transFade')}</option>
                        <option value="slideUp">{t('elementInspector.transSlideUp')}</option>
                        <option value="slideDown">{t('elementInspector.transSlideDown')}</option>
                        <option value="slideLeft">{t('elementInspector.transSlideLeft')}</option>
                        <option value="slideRight">{t('elementInspector.transSlideRight')}</option>
                        <option value="scale">{t('elementInspector.transScale')}</option>
                    </Select>
                </FormField>
                <FormField label={t('elementInspector.durationMs')}>
                    <TextInput type="number" value={element.transitionDuration || 300} onChange={e => updateElement({ transitionDuration: parseInt(e.target.value) || 300 })} />
                </FormField>
            </div>
            <FormField label={t('elementInspector.delayMs')}>
                <TextInput type="number" value={element.transitionDelay || 0} onChange={e => updateElement({ transitionDelay: parseInt(e.target.value) || 0 })} />
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t('elementInspector.delayHint', 'Give each element a different delay to stagger them — first one in, then the next…')}</p>
            </FormField>
            {(element.transitionIn || 'fade') !== 'none' && (element.transitionIn || 'fade') !== 'fade' && (
                <>
                    <FormField label={t('elementInspector.transFadeToo', 'Also fade in while moving')}>
                        <input type="checkbox" checked={element.transitionFade !== false}
                            onChange={e => updateElement({ transitionFade: e.target.checked ? undefined : false })} />
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t('elementInspector.transFadeHint', 'Off = the element arrives fully visible and just slides into place.')}</p>
                    </FormField>
                    {(element.transitionIn || '').startsWith('slide') && (
                        <FormField label={t('elementInspector.transDistance', 'Slide distance (%)')}>
                            <TextInput type="number" min="5" max="400"
                                value={element.transitionDistance ?? ''}
                                placeholder={t('elementInspector.transDistanceAuto', 'automatic')}
                                onChange={e => updateElement({ transitionDistance: e.target.value === '' ? undefined : (parseInt(e.target.value) || undefined) })} />
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t('elementInspector.transDistanceHint', 'How far away it starts, relative to its own size. 100% = one full element-width away.')}</p>
                        </FormField>
                    )}
                </>
            )}
            {(element.transitionIn || 'fade') !== 'none' && (
                <FormField label={t('elementInspector.transOnReveal', 'Play again when shown by an action')}>
                    <input type="checkbox" checked={!!element.transitionOnReveal}
                        onChange={e => updateElement({ transitionOnReveal: e.target.checked || undefined })} />
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t('elementInspector.transOnRevealHint', 'When a Show Element action reveals this, replay the entrance instead of just fading in.')}</p>
                </FormField>
            )}
        </>
    );
    const renderConditionsFields = () => (
        <div className="space-y-2">
            <ConditionsEditor collapsible title={t('elementInspector.visibilityConditions')} hint={t('elementInspector.visibilityNote')}
                conditions={element.conditions} project={project} onChange={(cs) => updateElement({ conditions: cs })} />
            <ConditionsEditor collapsible title={t('elementInspector.disabledConditions')} hint={t('elementInspector.disabledNote')}
                conditions={element.disabledConditions} project={project} onChange={(cs) => updateElement({ disabledConditions: cs })} />
            {renderAppearanceStates()}
        </div>
    );

    // Appearance states — variable-reactive look. First matching state wins; the "main color"
    // maps to this element's primary colour (Meter fill / Text colour / Button bg, else glow).
    const renderAppearanceStates = () => {
        const states = (element as { appearanceStates?: UIAppearanceState[] }).appearanceStates;
        const setStates = (next: UIAppearanceState[]) => updateElement({ appearanceStates: next.length ? next : undefined } as Partial<VNUIElement>);
        const patchState = (i: number, patch: Partial<UIAppearanceState>) => {
            const next = [...(states || [])];
            next[i] = { ...next[i], ...patch };
            setStates(next);
        };
        const toUIAsset = (id: VNID | null) => {
            if (!id) return null;
            const a = (project.videos as Record<string, { isVideo?: boolean; videoUrl?: string }> | undefined)?.[id]
                || (project.images as Record<string, { isVideo?: boolean; videoUrl?: string }> | undefined)?.[id]
                || (project.backgrounds as Record<string, { isVideo?: boolean; videoUrl?: string }> | undefined)?.[id];
            const isVid = !!((project.videos as Record<string, unknown> | undefined)?.[id] || a?.isVideo || a?.videoUrl);
            return { type: isVid ? 'video' as const : 'image' as const, id };
        };
        const mainColorLabel = element.type === UIElementType.Meter ? 'Fill color'
            : element.type === UIElementType.Text ? 'Text color'
            : element.type === UIElementType.Button ? 'Background color'
            : 'Glow color';
        const supportsImage = element.type === UIElementType.Image || element.type === UIElementType.Button;
        const hasTypedPrimary = element.type === UIElementType.Meter || element.type === UIElementType.Text || element.type === UIElementType.Button;
        return (
            <div className="rounded border border-slate-700/50 p-2">
                <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xs font-bold text-slate-300">Appearance States</h4>
                    <button
                        onClick={() => setStates([...(states || []), { id: `state-${Math.random().toString(36).slice(2, 9)}`, name: `State ${(states?.length || 0) + 1}`, conditions: [] }])}
                        className="text-xs px-2 py-0.5 rounded bg-purple-600/80 hover:bg-purple-600 text-white"
                    >+ Add state</button>
                </div>
                <p className="text-[10px] text-slate-400 mb-2">When a state's conditions match, the element changes its look (first matching state wins). A state with no conditions never activates.</p>
                {(states || []).map((st, i) => (
                    <div key={st.id} className="rounded bg-slate-800/40 border border-slate-700/40 p-2 mb-2 space-y-2">
                        <div className="flex items-center gap-2">
                            <TextInput value={st.name || ''} onChange={e => patchState(i, { name: e.target.value })} placeholder={`State ${i + 1}`} className="flex-1 text-xs" />
                            <button onClick={() => setStates((states || []).filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 px-1" title="Delete state">×</button>
                        </div>
                        <ConditionsEditor collapsible title="When (conditions)" conditions={st.conditions} project={project} onChange={cs => patchState(i, { conditions: cs })} />
                        <FormField label={mainColorLabel}><ColorInput value={st.primaryColor ?? ''} onChange={c => patchState(i, { primaryColor: c || undefined })} /></FormField>
                        {supportsImage && (
                            <AssetSelector label="Swap image" assetType="images" allowVideo value={st.image?.id ?? null} onChange={id => patchState(i, { image: toUIAsset(id) })} />
                        )}
                        <div className="grid grid-cols-3 gap-2">
                            <FormField label="Opacity %"><TextInput type="number" value={st.opacity != null ? Math.round(st.opacity * 100) : ''} onChange={e => patchState(i, { opacity: e.target.value === '' ? undefined : (parseInt(e.target.value, 10) || 0) / 100 })} placeholder="100" /></FormField>
                            <FormField label="Scale ×"><TextInput type="number" step="0.05" value={st.scale ?? ''} onChange={e => patchState(i, { scale: e.target.value === '' ? undefined : parseFloat(e.target.value) })} placeholder="1" /></FormField>
                            <FormField label="Rotate °"><TextInput type="number" value={st.rotation ?? ''} onChange={e => patchState(i, { rotation: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })} placeholder="0" /></FormField>
                        </div>
                        {hasTypedPrimary && (
                            <div className="grid grid-cols-2 gap-2">
                                <FormField label="Glow color"><ColorInput value={st.glowColor ?? ''} onChange={c => patchState(i, { glowColor: c || undefined })} /></FormField>
                                <FormField label="Glow size px"><TextInput type="number" value={st.glowSize ?? ''} onChange={e => patchState(i, { glowSize: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })} placeholder="8" /></FormField>
                            </div>
                        )}
                        <FormField label="Transition (ms)"><TextInput type="number" value={st.transitionMs ?? ''} onChange={e => patchState(i, { transitionMs: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })} placeholder="0 = instant" /></FormField>
                    </div>
                ))}
            </div>
        );
    };

    // Shared "additional actions" list editor (Button / Dropdown / Checkbox / Settings*).
    const renderActionsList = (actions: any[] | undefined): React.ReactNode => (
        <div className="space-y-1.5">
            {(actions || []).map((action, idx) => (
                <ActionCard key={idx} action={action} index={idx}
                    onActionChange={updatedAction => { const na = [...(actions || [])]; na[idx] = updatedAction; updateElement({ actions: na } as any); }}
                    onRemove={() => updateElement({ actions: (actions || []).filter((_, i) => i !== idx) } as any)} />
            ))}
            <button onClick={() => updateElement({ actions: [...(actions || []), { type: 'GoToScreen', targetScreenId: '' } as any] } as any)} className="w-full p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors text-sm">{t('elementInspector.addAction')}</button>
        </div>
    );

    // Per-type field buckets → canonical inspector groups.
    const getTypeGroups = (): Partial<Record<InspectorGroupId, React.ReactNode>> => {
        switch (element.type) {
            case UIElementType.Button: {
                const el = element as UIButtonElement;
                return {
                    content: <FormField label={t('elementInspector.text')}><TextInput value={el.text} onChange={e => updateElement({ text: e.target.value })} /></FormField>,
                    appearance: <>
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label={t('elementInspector.background')}><ColorInput value={el.backgroundColor || '#4D3273'} onChange={val => updateElement({ backgroundColor: val })} /></FormField>
                            <FormField label={t('elementInspector.hoverBackground')}><ColorInput value={el.hoverBackgroundColor || '#6B4C9A'} onChange={val => updateElement({ hoverBackgroundColor: val })} /></FormField>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label="Text Padding (%)">
                                <TextInput type="number" min={0} max={50} step={1} value={el.paddingX ?? 0} onChange={e => updateElement({ paddingX: Math.max(0, Number(e.target.value) || 0) })} />
                            </FormField>
                            <FormField label={t('elementInspector.borderRadius', 'Corner Radius (px)')}>
                                <TextInput type="number" min={0} step={1} value={el.borderRadius ?? 4} onChange={e => updateElement({ borderRadius: Math.max(0, Number(e.target.value) || 0) })} />
                            </FormField>
                        </div>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.fontStyle')}</h4>
                        <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })} />
                    </>,
                    media: <>
                        <h4 className="font-bold text-xs text-slate-400">{t('elementInspector.defaultImage')}</h4>
                        <div className="grid grid-cols-2 gap-2 p-2 border border-slate-700 rounded">
                            <AssetSelector label={t('elementInspector.asset')} assetType={el.image?.type === 'video' ? 'videos' : 'images'} allowVideo value={el.image?.id || null} onChange={id => updateElement({ image: id ? { type: el.image?.type || 'image', id } : null })} />
                            <FormField label={t('elementInspector.type')}>
                                <Select value={el.image?.type || 'image'} onChange={e => updateElement({ image: { type: e.target.value as 'image' | 'video', id: el.image?.id || '' } })}>
                                    <option value="image">{t('elementInspector.typeImage')}</option>
                                    <option value="video">{t('elementInspector.typeVideo')}</option>
                                </Select>
                            </FormField>
                        </div>
                        <h4 className="font-bold text-xs mt-2 text-slate-400">{t('elementInspector.hoverImage')}</h4>
                        <div className="grid grid-cols-2 gap-2 p-2 border border-slate-700 rounded">
                            <AssetSelector label={t('elementInspector.asset')} assetType={el.hoverImage?.type === 'video' ? 'videos' : 'images'} allowVideo value={el.hoverImage?.id || null} onChange={id => updateElement({ hoverImage: id ? { type: el.hoverImage?.type || 'image', id } : null })} />
                            <FormField label={t('elementInspector.type')}>
                                <Select value={el.hoverImage?.type || 'image'} onChange={e => updateElement({ hoverImage: { type: e.target.value as 'image' | 'video', id: el.hoverImage?.id || '' } })}>
                                    <option value="image">{t('elementInspector.typeImage')}</option>
                                    <option value="video">{t('elementInspector.typeVideo')}</option>
                                </Select>
                            </FormField>
                        </div>
                    </>,
                    audio: <div className="grid grid-cols-2 gap-2">
                        <AssetSelector label={t('elementInspector.hoverSound')} assetType="audio" value={el.hoverSoundId} onChange={id => updateElement({ hoverSoundId: id })} />
                        <AssetSelector label={t('elementInspector.clickSound')} assetType="audio" value={el.clickSoundId} onChange={id => updateElement({ clickSoundId: id })} />
                    </div>,
                    logic: <>
                        <h4 className="font-bold mb-1 text-slate-400 text-xs">{t('elementInspector.primaryAction')}</h4>
                        <ActionEditor action={el.action} onActionChange={action => updateElement({ action })} />
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.additionalActions')}</h4>
                        {renderActionsList(el.actions)}
                    </>,
                };
            }
            case UIElementType.Text: {
                const el = element as UITextElement;
                return {
                    content: <>
                        <FormField label={t('elementInspector.text')}><TextInput value={el.text} onChange={e => updateElement({ text: e.target.value })} /></FormField>
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label={t('elementInspector.horizontalAlign')}>
                                <Select value={el.textAlign || el.font?.align || 'center'} onChange={e => { const align = e.target.value as VNTextAlign; updateElement({ textAlign: align, font: { ...el.font, align } }); }}>
                                    <option value="left">{t('elementInspector.left')}</option>
                                    <option value="center">{t('elementInspector.center')}</option>
                                    <option value="right">{t('elementInspector.right')}</option>
                                </Select>
                            </FormField>
                            <FormField label={t('elementInspector.verticalAlign')}>
                                <Select value={el.verticalAlign} onChange={e => updateElement({ verticalAlign: e.target.value as any })}>
                                    <option value="top">{t('elementInspector.top')}</option>
                                    <option value="middle">{t('elementInspector.middle')}</option>
                                    <option value="bottom">{t('elementInspector.bottom')}</option>
                                </Select>
                            </FormField>
                        </div>
                    </>,
                    appearance: <>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.fontStyle')}</h4>
                        <FontEditor font={el.font} onFontChange={(prop, value) => { const updates: Partial<UITextElement> = { font: { ...el.font, [prop]: value } }; if (prop === 'align') updates.textAlign = value as VNTextAlign; updateElement(updates); }} />
                    </>,
                };
            }
            case UIElementType.Image: {
                const el = element as UIImageElement;
                const isVideoOnly = el.name === 'Video' && el.background?.type === 'video';
                const bgType = el.background?.type || (el.image ? el.image.type : 'image');
                const bgValue = el.background?.type === 'color' ? el.background.value : el.background?.assetId || null;
                return {
                    content: <>
                        {!isVideoOnly && (
                            <FormField label={t('elementInspector.backgroundType')}>
                                <Select value={bgType} onChange={e => {
                                    const newType = e.target.value as 'color' | 'image' | 'video';
                                    if (newType === 'color') updateElement({ background: { type: 'color', value: '#000000' }, image: null });
                                    else updateElement({ background: { type: newType, assetId: null }, image: null });
                                }}>
                                    <option value="color">{t('elementInspector.bgColor')}</option>
                                    <option value="image">{t('elementInspector.typeImage')}</option>
                                    <option value="video">{t('elementInspector.typeVideo')}</option>
                                </Select>
                            </FormField>
                        )}
                        {bgType === 'color' ? (
                            <FormField label={t('elementInspector.colorValue')}>
                                <ColorInput value={typeof bgValue === 'string' && bgValue.startsWith('#') ? bgValue : '#000000'} onChange={v => updateElement({ background: { type: 'color', value: v }, image: null })} />
                            </FormField>
                        ) : (
                            <AssetSelector label={bgType === 'video' ? t('elementInspector.videoAsset') : t('elementInspector.imageAsset')} assetType={bgType === 'video' ? 'videos' : 'images'} allowVideo value={typeof bgValue === 'string' ? bgValue : null} onChange={id => updateElement({ background: { ...(el.background as any), type: bgType as 'image' | 'video', assetId: id }, image: null })} />
                        )}
                        {bgType !== 'color' && (
                            <FormField label={t('elementInspector.fitMode')}>
                                <Select value={el.objectFit || 'contain'} onChange={e => updateElement({ objectFit: e.target.value as 'contain' | 'cover' | 'fill' })}>
                                    <option value="contain">{t('elementInspector.fitContain')}</option>
                                    <option value="cover">{t('elementInspector.fitCover')}</option>
                                    <option value="fill">{t('elementInspector.fitFill')}</option>
                                </Select>
                            </FormField>
                        )}
                        {bgType === 'video' && (
                            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mt-1">
                                <input type="checkbox" checked={(el.background as any)?.loop ?? true}
                                    onChange={e => updateElement({ background: { ...(el.background as any), loop: e.target.checked } })} />
                                Loop video <span className="text-[10px] text-slate-500">(off = play once, hold last frame)</span>
                            </label>
                        )}
                        {bgType === 'video' && (
                            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mt-1">
                                <input type="checkbox" checked={(el.background as any)?.muted ?? false}
                                    onChange={e => updateElement({ background: { ...(el.background as any), muted: e.target.checked } })} />
                                Mute audio <span className="text-[10px] text-slate-500">(on = silent decorative loop)</span>
                            </label>
                        )}
                        {bgType === 'video' && (
                            <VideoTrimFields className="mt-2" start={(el.background as any)?.trimStart} end={(el.background as any)?.trimEnd}
                                onChange={patch => updateElement({ background: { ...(el.background as any), ...patch } })} />
                        )}
                        <p className="text-xs text-slate-400 mt-1">{t('elementInspector.coverHint')}</p>
                    </>,
                };
            }
            case UIElementType.SaveSlotGrid: {
                const el = element as UISaveSlotGridElement;
                return {
                    content: <>
                        <FormField label="Slot layout">
                            <Select value={el.slotLayout || 'grid'} onChange={e => {
                                if (e.target.value === 'free') {
                                    const rects = (el.slotRects && el.slotRects.length) ? el.slotRects : gridSeedRects(el, el.slotCount, 2);
                                    updateElement({ slotLayout: 'free', slotRects: rects });
                                } else {
                                    updateElement({ slotLayout: 'grid' });
                                }
                            }}>
                                <option value="grid">Grid (auto, paginated)</option>
                                <option value="free">Free placement</option>
                            </Select>
                        </FormField>
                        {el.slotLayout === 'free' ? <>
                            <FormField label={t('elementInspector.slotCount')}><TextInput type="number" min={1} value={el.slotCount} onChange={e => updateElement({ slotCount: parseInt(e.target.value) || 1 })} /></FormField>
                            <p className="text-[10px] text-slate-400 -mt-1 mb-1">Drag each slot box on the canvas to position and size it. Slots without a box are hidden, and pagination is off.</p>
                            <button onClick={() => updateElement({ slotRects: gridSeedRects(el, el.slotCount, 2) })} className="text-xs px-2 py-1 mb-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200">Re-arrange as grid</button>
                        </> : (() => {
                            const perPage = Math.max(1, el.slotsPerPage ?? 4);
                            const pages = Math.max(1, Math.ceil(el.slotCount / perPage));
                            return <>
                                <div className="grid grid-cols-2 gap-2">
                                    <FormField label={t('elementInspector.slotsPerPage', 'Slots per page')}>
                                        <TextInput type="number" min={1} max={24} value={perPage} onChange={e => { const v = Math.max(1, Math.min(24, parseInt(e.target.value) || 1)); updateElement({ slotsPerPage: v, slotCount: v * pages }); }} />
                                    </FormField>
                                    <FormField label={t('elementInspector.pageCount', 'Number of pages')}>
                                        <TextInput type="number" min={1} max={99} value={pages} onChange={e => { const v = Math.max(1, Math.min(99, parseInt(e.target.value) || 1)); updateElement({ slotCount: perPage * v }); }} />
                                    </FormField>
                                </div>
                                <FormField label={t('elementInspector.slotColumns', 'Columns')}>
                                    <Select value={String(el.slotColumns ?? 0)} onChange={e => { const v = parseInt(e.target.value); updateElement({ slotColumns: v > 0 ? v : undefined }); }}>
                                        <option value="0">{t('elementInspector.columnsAuto', 'Automatic')}</option>
                                        {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={String(n)}>{n}</option>)}
                                    </Select>
                                </FormField>
                                <p className="text-[10px] text-slate-400">{t('elementInspector.totalSlotsHint', 'Total slots:')} {el.slotCount}</p>
                            </>;
                        })()}
                        <FormField label={t('elementInspector.emptySlotText')}><TextInput value={el.emptySlotText} onChange={e => updateElement({ emptySlotText: e.target.value })} /></FormField>
                        <SlotDesignField element={el} project={project} updateElement={updateElement as any} />
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.infoBar')}</h4>
                        <div className="flex items-center gap-4 my-1">
                            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={el.hideInfoBar === true} onChange={e => updateElement({ hideInfoBar: e.target.checked })} className="accent-purple-500" />
                                {t('elementInspector.hideInfoBar')}
                            </label>
                            {!el.hideInfoBar && (
                                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                                    <input type="checkbox" checked={el.hideSlotLabel === true} onChange={e => updateElement({ hideSlotLabel: e.target.checked })} className="accent-purple-500" />
                                    {t('elementInspector.hideSlotLabel')}
                                </label>
                            )}
                            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={el.hideEraseButtons === true} onChange={e => updateElement({ hideEraseButtons: e.target.checked })} className="accent-purple-500" />
                                {t('elementInspector.hideEraseButtons', 'Hide erase (✕) buttons')}
                            </label>
                        </div>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.navigationButtons')}</h4>
                        <FormField label={t('elementInspector.prevButtonText')}><TextInput value={el.prevButtonText ?? '◀ Prev'} onChange={e => updateElement({ prevButtonText: e.target.value })} /></FormField>
                        <FormField label={t('elementInspector.nextButtonText')}><TextInput value={el.nextButtonText ?? 'Next ▶'} onChange={e => updateElement({ nextButtonText: e.target.value })} /></FormField>
                        <div className="flex items-center gap-4 my-1">
                            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={el.hideNavButtons === true} onChange={e => updateElement({ hideNavButtons: e.target.checked })} className="accent-purple-500" />
                                {t('elementInspector.hideNavButtons', 'Hide the built-in arrows')}
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={el.hidePageIndicator === true} onChange={e => updateElement({ hidePageIndicator: e.target.checked })} className="accent-purple-500" />
                                {t('elementInspector.hidePageIndicator', 'Hide the page number')}
                            </label>
                        </div>
                        <p className="text-[10px] text-slate-400">{t('elementInspector.customNavHint', 'Tip: add your own Button elements with the "Save/Load Slots: next/previous page" actions for fully custom arrows. They work on both the Save and Load screens.')}</p>
                    </>,
                    appearance: <>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.fontStyle')}</h4>
                        <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })} />
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.colors')}</h4>
                        <FormField label={t('elementInspector.slotBackground')}><ColorInput value={el.slotBackgroundColor} onChange={c => updateElement({ slotBackgroundColor: c })} /></FormField>
                        <FormField label={t('elementInspector.slotBorder')}><ColorInput value={el.slotBorderColor} onChange={c => updateElement({ slotBorderColor: c })} /></FormField>
                        <FormField label={t('elementInspector.slotHoverBorder')}><ColorInput value={el.slotHoverBorderColor} onChange={c => updateElement({ slotHoverBorderColor: c })} /></FormField>
                        <FormField label={t('elementInspector.slotHeader')}><ColorInput value={el.slotHeaderColor} onChange={c => updateElement({ slotHeaderColor: c })} /></FormField>
                        <FormField label={t('elementInspector.slotText')}><ColorInput value={el.slotTextColor} onChange={c => updateElement({ slotTextColor: c })} /></FormField>
                        <FontEditor label={t('elementInspector.emptySlotFont')} font={el.emptySlotFont || { family: 'Arial, sans-serif', size: 14, color: el.emptySlotTextColor || '#a0aec0', weight: 'normal', italic: false }} onFontChange={(prop, value) => updateElement({ emptySlotFont: { ...(el.emptySlotFont || { family: 'Arial, sans-serif', size: 14, color: el.emptySlotTextColor || '#a0aec0', weight: 'normal', italic: false }), [prop]: value } })} />
                        <FontEditor label={t('elementInspector.navButtonFont')} font={el.navButtonFont || { family: 'Arial, sans-serif', size: 12, color: el.slotHeaderColor || '#7dd3fc', weight: 'bold', italic: false }} onFontChange={(prop, value) => updateElement({ navButtonFont: { ...(el.navButtonFont || { family: 'Arial, sans-serif', size: 12, color: el.slotHeaderColor || '#7dd3fc', weight: 'bold', italic: false }), [prop]: value } })} showAlign={false} />
                        <FontEditor label={t('elementInspector.pageIndicatorFont')} font={el.pageIndicatorFont || { family: 'Arial, sans-serif', size: 12, color: '#e2e8f0', weight: 'normal', italic: false }} onFontChange={(prop, value) => updateElement({ pageIndicatorFont: { ...(el.pageIndicatorFont || { family: 'Arial, sans-serif', size: 12, color: '#e2e8f0', weight: 'normal', italic: false }), [prop]: value } })} showAlign={false} />
                    </>,
                };
            }
            case UIElementType.SettingsSlider: {
                const el = element as UISettingsSliderElement;
                const isVariableMode = !!el.variableId;
                const numberVariables = Object.values(project.variables).filter((v): v is VNVariable => (v as VNVariable).type === 'number');
                return {
                    content: <>
                        <FormField label={t('elementInspector.controlMode')}>
                            <Select value={isVariableMode ? 'variable' : 'setting'} onChange={e => {
                                if (e.target.value === 'variable') { const firstVar = numberVariables[0]; updateElement({ variableId: firstVar?.id || '', minValue: 0, maxValue: 100, setting: undefined }); }
                                else updateElement({ variableId: undefined, minValue: undefined, maxValue: undefined, setting: 'musicVolume' as GameSetting });
                            }}>
                                <option value="setting">{t('elementInspector.gameSetting')}</option>
                                <option value="variable">{t('elementInspector.variableOpt')}</option>
                            </Select>
                        </FormField>
                        {isVariableMode ? (
                            <>
                                <FormField label={t('elementInspector.variable')}>
                                    <Select value={el.variableId || ''} onChange={e => updateElement({ variableId: e.target.value })}>
                                        {numberVariables.length === 0 && <option value="">{t('elementInspector.noNumberVars')}</option>}
                                        {numberVariables.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </Select>
                                </FormField>
                                <div className="grid grid-cols-2 gap-2">
                                    <FormField label={t('elementInspector.minValue')}><TextInput type="number" value={el.minValue ?? 0} onChange={e => updateElement({ minValue: parseFloat(e.target.value) || 0 })} /></FormField>
                                    <FormField label={t('elementInspector.maxValue')}><TextInput type="number" value={el.maxValue ?? 100} onChange={e => updateElement({ maxValue: parseFloat(e.target.value) || 100 })} /></FormField>
                                </div>
                            </>
                        ) : (
                            <FormField label={t('elementInspector.settingControlled')}>
                                <Select value={el.setting} onChange={e => updateElement({ setting: e.target.value as GameSetting })}>
                                    <option value="musicVolume">{t('elementInspector.musicVolume')}</option>
                                    <option value="sfxVolume">{t('elementInspector.sfxVolume')}</option>
                                    <option value="ambientVolume">{t('elementInspector.ambientVolume')}</option>
                                    <option value="textSpeed">{t('elementInspector.textSpeed')}</option>
                                </Select>
                            </FormField>
                        )}
                    </>,
                    media: <>
                        <AssetSelector label={t('elementInspector.thumbImage')} assetType="images" allowVideo value={el.thumbImage?.id || null} onChange={id => updateElement({ thumbImage: id ? { type: 'image', id } : null })} />
                        <AssetSelector label={t('elementInspector.trackImage')} assetType="images" allowVideo value={el.trackImage?.id || null} onChange={id => updateElement({ trackImage: id ? { type: 'image', id } : null })} />
                    </>,
                    appearance: <div className="grid grid-cols-2 gap-2">
                        <FormField label={t('elementInspector.thumbColor')}><ColorInput value={el.thumbColor || '#8a2be2'} onChange={val => updateElement({ thumbColor: val })} /></FormField>
                        <FormField label={t('elementInspector.trackColor')}><ColorInput value={el.trackColor || '#4D3273'} onChange={val => updateElement({ trackColor: val })} /></FormField>
                    </div>,
                    logic: isVariableMode ? renderActionsList(el.actions) : undefined,
                };
            }
            case UIElementType.SettingsToggle: {
                const el = element as UISettingsToggleElement;
                const isVariableMode = !!el.variableId;
                const allVariables = Object.values(project.variables) as VNVariable[];
                return {
                    content: <>
                        <FormField label={t('elementInspector.controlMode')}>
                            <Select value={isVariableMode ? 'variable' : 'setting'} onChange={e => {
                                if (e.target.value === 'variable') {
                                    const firstVar = allVariables[0];
                                    let checkedVal: string | number | boolean = true; let uncheckedVal: string | number | boolean = false;
                                    if (firstVar?.type === 'number') { checkedVal = 1; uncheckedVal = 0; } else if (firstVar?.type === 'string') { checkedVal = 'checked'; uncheckedVal = 'unchecked'; }
                                    updateElement({ variableId: firstVar?.id || '', checkedValue: checkedVal, uncheckedValue: uncheckedVal, setting: undefined });
                                } else updateElement({ variableId: undefined, checkedValue: undefined, uncheckedValue: undefined, setting: 'enableSkip' as GameToggleSetting });
                            }}>
                                <option value="setting">{t('elementInspector.gameSetting')}</option>
                                <option value="variable">{t('elementInspector.variableOpt')}</option>
                            </Select>
                        </FormField>
                        {isVariableMode ? (
                            <>
                                <FormField label={t('elementInspector.variable')}>
                                    <Select value={el.variableId || ''} onChange={e => {
                                        const newVarId = e.target.value; const newVar = project.variables[newVarId];
                                        let checkedVal: string | number | boolean = true; let uncheckedVal: string | number | boolean = false;
                                        if (newVar?.type === 'number') { checkedVal = 1; uncheckedVal = 0; } else if (newVar?.type === 'string') { checkedVal = 'checked'; uncheckedVal = 'unchecked'; }
                                        updateElement({ variableId: newVarId, checkedValue: checkedVal, uncheckedValue: uncheckedVal });
                                    }}>
                                        {allVariables.length === 0 && <option value="">{t('elementInspector.noVarsAvailable')}</option>}
                                        {allVariables.map(v => <option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
                                    </Select>
                                </FormField>
                                <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.values')}</h4>
                                <FormField label={t('elementInspector.checkedValue')}>
                                    <TextInput value={String(el.checkedValue ?? true)} onChange={e => { const variable = project.variables[el.variableId || '']; let nv: string | number | boolean = e.target.value; if (variable?.type === 'number') nv = isNaN(Number(e.target.value)) ? 0 : Number(e.target.value); else if (variable?.type === 'boolean') nv = e.target.value.toLowerCase() === 'true'; updateElement({ checkedValue: nv }); }} />
                                </FormField>
                                <FormField label={t('elementInspector.uncheckedValue')}>
                                    <TextInput value={String(el.uncheckedValue ?? false)} onChange={e => { const variable = project.variables[el.variableId || '']; let nv: string | number | boolean = e.target.value; if (variable?.type === 'number') nv = isNaN(Number(e.target.value)) ? 0 : Number(e.target.value); else if (variable?.type === 'boolean') nv = e.target.value.toLowerCase() === 'true'; updateElement({ uncheckedValue: nv }); }} />
                                </FormField>
                            </>
                        ) : (
                            <FormField label={t('elementInspector.settingControlled')}>
                                <Select value={el.setting} onChange={e => updateElement({ setting: e.target.value as GameToggleSetting })}>
                                    <option value="enableSkip">{t('elementInspector.enableSkip')}</option>
                                </Select>
                            </FormField>
                        )}
                        <FormField label={t('elementInspector.labelText')}><TextInput value={el.text} onChange={e => updateElement({ text: e.target.value })} /></FormField>
                    </>,
                    media: <>
                        <AssetSelector label={t('elementInspector.checkedImage')} assetType="images" allowVideo value={el.checkedImage?.id || null} onChange={id => updateElement({ checkedImage: id ? { type: 'image', id } : null })} />
                        <AssetSelector label={t('elementInspector.uncheckedImage')} assetType="images" allowVideo value={el.uncheckedImage?.id || null} onChange={id => updateElement({ uncheckedImage: id ? { type: 'image', id } : null })} />
                    </>,
                    appearance: <>
                        <FormField label={t('elementInspector.checkboxColor')}><ColorInput value={el.checkboxColor || '#ec4899'} onChange={val => updateElement({ checkboxColor: val })} /></FormField>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.fontStyle')}</h4>
                        <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })} />
                    </>,
                    logic: isVariableMode ? renderActionsList(el.actions) : undefined,
                };
            }
            case UIElementType.TextInput: {
                const el = element as UITextInputElement;
                return {
                    content: <>
                        <FormField label={t('elementInspector.placeholderText')}><TextInput value={el.placeholder} onChange={e => updateElement({ placeholder: e.target.value })} /></FormField>
                        <FormField label={t('elementInspector.variableToSet')}>
                            <Select value={el.variableId} onChange={e => updateElement({ variableId: e.target.value })}>
                                {Object.keys(project.variables).length === 0 && <option value="">{t('elementInspector.noVarsAvailable')}</option>}
                                {Object.values(project.variables).map((v: any) => <option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
                            </Select>
                        </FormField>
                        <FormField label={t('elementInspector.maxLength')}><TextInput type="number" value={el.maxLength || 100} onChange={e => updateElement({ maxLength: parseInt(e.target.value) || 100 })} /></FormField>
                    </>,
                    appearance: <>
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label={t('elementInspector.background')}><ColorInput value={el.backgroundColor || '#1e293b'} onChange={v => updateElement({ backgroundColor: v })} /></FormField>
                            <FormField label={t('elementInspector.border')}><ColorInput value={el.borderColor || '#475569'} onChange={v => updateElement({ borderColor: v })} /></FormField>
                        </div>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.fontStyle')}</h4>
                        <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })} />
                    </>,
                };
            }
            case UIElementType.Dropdown: {
                const el = element as UIDropdownElement;
                const variable = project.variables[el.variableId];
                return {
                    content: <>
                        <h4 className="font-bold my-1 text-slate-400 text-xs">{t('elementInspector.variableSettings')}</h4>
                        <FormField label={t('elementInspector.variable')}>
                            <Select value={el.variableId} onChange={e => {
                                const newVarId = e.target.value as VNID; const newVariable = project.variables[newVarId];
                                let newOptions: DropdownOption[] = [];
                                if (newVariable) {
                                    if (newVariable.type === 'boolean') newOptions = [{ id: crypto.randomUUID(), label: 'True', value: true }, { id: crypto.randomUUID(), label: 'False', value: false }];
                                    else if (newVariable.type === 'number') newOptions = [{ id: crypto.randomUUID(), label: 'Option 1', value: 1 }, { id: crypto.randomUUID(), label: 'Option 2', value: 2 }, { id: crypto.randomUUID(), label: 'Option 3', value: 3 }];
                                    else newOptions = [{ id: crypto.randomUUID(), label: 'Option 1', value: 'option1' }, { id: crypto.randomUUID(), label: 'Option 2', value: 'option2' }, { id: crypto.randomUUID(), label: 'Option 3', value: 'option3' }];
                                }
                                updateElement({ variableId: newVarId, options: newOptions });
                            }}>
                                <option value="">{t('elementInspector.selectVariable')}</option>
                                {Object.values(project.variables).map(v => { const vi = v as VNVariable; return <option key={vi.id} value={vi.id}>{vi.name} ({vi.type})</option>; })}
                            </Select>
                        </FormField>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.options')}{variable && ` (${variable.type})`}</h4>
                        {variable?.type === 'boolean' ? (
                            <>
                                <div className="text-sm text-slate-400 mb-2">{t('elementInspector.customizeTrueFalse')}</div>
                                {el.options.map((opt, idx) => (
                                    <FormField key={opt.id} label={opt.value === true ? t('elementInspector.trueLabel') : t('elementInspector.falseLabel')}>
                                        <TextInput value={opt.label} onChange={e => { const newOptions = [...el.options]; newOptions[idx] = { ...opt, label: e.target.value }; updateElement({ options: newOptions }); }} />
                                    </FormField>
                                ))}
                            </>
                        ) : (
                            <div className="space-y-2">
                                {el.options.map((opt, idx) => (
                                    <div key={opt.id} className="flex gap-2 items-center p-2 bg-slate-800 rounded">
                                        <div className="flex-grow space-y-1">
                                            <TextInput placeholder={t('elementInspector.labelPlaceholder')} value={opt.label} onChange={e => { const newOptions = [...el.options]; newOptions[idx] = { ...opt, label: e.target.value }; updateElement({ options: newOptions }); }} />
                                            <TextInput placeholder={variable?.type === 'number' ? t('elementInspector.valueNumberPlaceholder') : t('elementInspector.valuePlaceholder')} value={String(opt.value)} onChange={e => { const newOptions = [...el.options]; const newValue = variable?.type === 'number' ? (isNaN(Number(e.target.value)) ? 0 : Number(e.target.value)) : e.target.value; newOptions[idx] = { ...opt, value: newValue }; updateElement({ options: newOptions }); }} />
                                        </div>
                                        <button onClick={() => updateElement({ options: el.options.filter((_, i) => i !== idx) })} className="p-2 hover:bg-red-600 rounded transition-colors" title={t('elementInspector.removeOption')}><TrashIcon className="w-4 h-4" /></button>
                                    </div>
                                ))}
                                {variable?.type !== 'boolean' && (
                                    <button onClick={() => { const newOption: DropdownOption = { id: crypto.randomUUID(), label: `Option ${el.options.length + 1}`, value: variable?.type === 'number' ? el.options.length + 1 : `option${el.options.length + 1}` }; updateElement({ options: [...el.options, newOption] }); }} className="w-full p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors">{t('elementInspector.addOption')}</button>
                                )}
                            </div>
                        )}
                    </>,
                    appearance: <>
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label={t('elementInspector.background')}><ColorInput value={el.backgroundColor || '#1e293b'} onChange={v => updateElement({ backgroundColor: v })} /></FormField>
                            <FormField label={t('elementInspector.border')}><ColorInput value={el.borderColor || '#475569'} onChange={v => updateElement({ borderColor: v })} /></FormField>
                            <FormField label={t('elementInspector.hover')}><ColorInput value={el.hoverColor || '#334155'} onChange={v => updateElement({ hoverColor: v })} /></FormField>
                        </div>
                        <FormField label="Arrow Side">
                            <Select value={el.arrowSide || 'right'} onChange={e => updateElement({ arrowSide: e.target.value as 'left' | 'right' })}>
                                <option value="right">Right (default)</option>
                                <option value="left">Left (RTL)</option>
                            </Select>
                        </FormField>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.fontStyle')}</h4>
                        <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })} />
                    </>,
                    logic: <>
                        <p className="text-xs text-slate-400 mb-2">{t('elementInspector.onChangeActions')}</p>
                        {renderActionsList(el.actions)}
                    </>,
                };
            }
            case UIElementType.Checkbox: {
                const el = element as UICheckboxElement;
                const variable = project.variables[el.variableId];
                return {
                    content: <>
                        <FormField label={t('elementInspector.labelText')}><TextInput value={el.label} onChange={e => updateElement({ label: e.target.value })} /></FormField>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.variableSettings')}</h4>
                        <FormField label={t('elementInspector.variable')}>
                            <Select value={el.variableId} onChange={e => {
                                const newVarId = e.target.value as VNID; const newVariable = project.variables[newVarId];
                                let checkedValue: string | number | boolean = true; let uncheckedValue: string | number | boolean = false;
                                if (newVariable) { if (newVariable.type === 'boolean') { checkedValue = true; uncheckedValue = false; } else if (newVariable.type === 'number') { checkedValue = 1; uncheckedValue = 0; } else { checkedValue = 'checked'; uncheckedValue = 'unchecked'; } }
                                updateElement({ variableId: newVarId, checkedValue, uncheckedValue });
                            }}>
                                <option value="">{t('elementInspector.selectVariable')}</option>
                                {Object.values(project.variables).map(v => { const vi = v as VNVariable; return <option key={vi.id} value={vi.id}>{vi.name} ({vi.type})</option>; })}
                            </Select>
                        </FormField>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.values')}{variable && ` (${variable.type})`}</h4>
                        <FormField label={t('elementInspector.checkedValue')}>
                            <TextInput value={String(el.checkedValue)} onChange={e => { let nv: string | number | boolean = e.target.value; if (variable?.type === 'number') nv = isNaN(Number(e.target.value)) ? 0 : Number(e.target.value); else if (variable?.type === 'boolean') nv = e.target.value.toLowerCase() === 'true'; updateElement({ checkedValue: nv }); }} />
                        </FormField>
                        <FormField label={t('elementInspector.uncheckedValue')}>
                            <TextInput value={String(el.uncheckedValue)} onChange={e => { let nv: string | number | boolean = e.target.value; if (variable?.type === 'number') nv = isNaN(Number(e.target.value)) ? 0 : Number(e.target.value); else if (variable?.type === 'boolean') nv = e.target.value.toLowerCase() === 'true'; updateElement({ uncheckedValue: nv }); }} />
                        </FormField>
                    </>,
                    appearance: <>
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label={t('elementInspector.checkboxColor')}><ColorInput value={el.checkboxColor || '#3b82f6'} onChange={v => updateElement({ checkboxColor: v })} /></FormField>
                            <FormField label={t('elementInspector.labelColor')}><ColorInput value={el.labelColor || '#f1f5f9'} onChange={v => updateElement({ labelColor: v })} /></FormField>
                        </div>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.fontStyle')}</h4>
                        <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })} />
                    </>,
                    logic: <>
                        <p className="text-xs text-slate-400 mb-2">{t('elementInspector.onToggleActions')}</p>
                        {renderActionsList(el.actions)}
                    </>,
                };
            }
            case UIElementType.CGGallery: {
                const el = element as UICGGalleryElement;
                const galleryEntries = Object.values(project.cgGallery?.entries || {});
                const categories = [...new Set(galleryEntries.map((e: any) => e.category).filter(Boolean))] as string[];
                return {
                    content: <>
                        <h4 className="font-bold my-1 text-slate-400 text-xs">{t('elementInspector.galleryLayout')}</h4>
                        <FormField label="Slot layout">
                            <Select value={el.slotLayout || 'grid'} onChange={e => {
                                if (e.target.value === 'free') {
                                    const cols = el.columns || 4;
                                    const seedCount = Math.max(galleryEntries.length || 0, cols);
                                    const rects = (el.slotRects && el.slotRects.length) ? el.slotRects : gridSeedRects(el, seedCount, cols);
                                    updateElement({ slotLayout: 'free', slotRects: rects });
                                } else {
                                    updateElement({ slotLayout: 'grid' });
                                }
                            }}>
                                <option value="grid">Grid (auto)</option>
                                <option value="free">Free placement</option>
                            </Select>
                        </FormField>
                        {el.slotLayout === 'free' ? <>
                            <p className="text-[10px] text-slate-400 -mt-1 mb-1">Drag each box on the canvas to position it. Entries fill the boxes in order — add one box per CG you want to show. Extra entries (beyond the boxes) are hidden.</p>
                            <div className="flex items-center gap-2 mb-1">
                                <button onClick={() => { const rects = [...(el.slotRects || [])]; const last = rects[rects.length - 1]; rects.push(last ? { ...last, x: Math.min(90, last.x + 4), y: Math.min(90, last.y + 4) } : { x: 40, y: 40, width: 16, height: 16 }); updateElement({ slotRects: rects }); }} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200">+ Add box</button>
                                <button onClick={() => { const rects = [...(el.slotRects || [])]; rects.pop(); updateElement({ slotRects: rects }); }} disabled={!el.slotRects || el.slotRects.length === 0} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-40">− Remove last</button>
                                <span className="text-[10px] text-slate-500">{el.slotRects?.length || 0} boxes</span>
                            </div>
                            <button onClick={() => { const cols = el.columns || 4; updateElement({ slotRects: gridSeedRects(el, el.slotRects?.length || Math.max(galleryEntries.length, cols), cols) }); }} className="text-xs px-2 py-1 mb-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200">Re-arrange as grid</button>
                        </> : <>
                            <FormField label={t('elementInspector.columns')}><TextInput type="number" min="2" max="8" value={String(el.columns || 4)} onChange={e => updateElement({ columns: parseInt(e.target.value, 10) || 4 })} /></FormField>
                            <FormField label={t('elementInspector.gapPx')}><TextInput type="number" min="0" max="32" value={String(el.gap || 8)} onChange={e => updateElement({ gap: parseInt(e.target.value, 10) || 8 })} /></FormField>
                        </>}
                        <FormField label={t('elementInspector.categoryFilter')}>
                            <Select value={el.categoryFilter || ''} onChange={e => updateElement({ categoryFilter: e.target.value || undefined })}>
                                <option value="">{t('elementInspector.allCategories')}</option>
                                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </Select>
                            <p className="text-[9px] text-slate-500 mt-0.5">{t('elementInspector.categoryFilterHint')}</p>
                        </FormField>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.display')}</h4>
                        <FormField label={t('elementInspector.showNames')}><input type="checkbox" checked={el.showNames !== false} onChange={e => updateElement({ showNames: e.target.checked })} /></FormField>
                        <div className="mt-4 p-2 rounded bg-slate-700/30 text-xs text-slate-400">
                            <p>Gallery entries are managed in the <strong>CG Gallery</strong> tab. This element displays them as a grid on the UI screen.</p>
                            <p className="mt-1">{galleryEntries.length} entries configured.</p>
                        </div>
                    </>,
                    appearance: <>
                        <h4 className="font-bold my-1 text-slate-400 text-xs">{t('elementInspector.thumbnailStyling')}</h4>
                        <FormField label={t('elementInspector.borderColor')}><ColorInput value={el.thumbnailBorderColor || '#4D3273'} onChange={v => updateElement({ thumbnailBorderColor: v })} /></FormField>
                        <FormField label={t('elementInspector.borderRadiusPx')}><TextInput type="number" min="0" max="32" value={String(el.thumbnailBorderRadius || 8)} onChange={e => updateElement({ thumbnailBorderRadius: parseInt(e.target.value, 10) || 8 })} /></FormField>
                        <FormField label={t('elementInspector.backgroundColor')}><ColorInput value={el.backgroundColor || '#0f172a'} onChange={v => updateElement({ backgroundColor: v })} disabled={el.hideBackgroundPanel === true} /></FormField>
                        <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer my-1">
                            <input type="checkbox" checked={el.hideBackgroundPanel === true} onChange={e => updateElement({ hideBackgroundPanel: e.target.checked })} className="accent-purple-500" />
                            Hide background panel (show thumbnails over your own art)
                        </label>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.lockedEntries')}</h4>
                        <FormField label={t('elementInspector.lockedBackground')}><ColorInput value={el.lockedColor || '#1e293b'} onChange={v => updateElement({ lockedColor: v })} /></FormField>
                        <FormField label={t('elementInspector.lockedText')}><TextInput value={el.lockedText || '🔒'} onChange={e => updateElement({ lockedText: e.target.value })} placeholder="🔒" /></FormField>
                        {el.showNames !== false && el.nameFont && (
                            <>
                                <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.nameFont')}</h4>
                                <FontEditor font={el.nameFont} onFontChange={(prop, value) => updateElement({ nameFont: { ...el.nameFont!, [prop]: value } })} />
                            </>
                        )}
                    </>,
                };
            }
            case UIElementType.Inventory: {
                const el = element as UIInventoryGridElement;
                const itemList = Object.values(project.items || {});
                const categories = [...new Set(itemList.map((it: any) => it.category).filter(Boolean))] as string[];
                const allColls = Object.values(project.itemCollections || {}) as any[];
                const itemLists = allColls as { id: string; name: string }[];
                // Data-source kind (mirrors the runtime): a shop list is a collection that is NOT the
                // player's owned-items view. Slot-button options are filtered to what actually works.
                const boundColl = el.collectionId ? (project.itemCollections as any)?.[el.collectionId] : undefined;
                const isPlayerSource = !boundColl || !!boundColl.tracksOwnedItems;
                const allowedBtns = isPlayerSource ? ['none', 'use', 'sell'] : ['none', 'buy'];
                const curBtn = el.slotButton ?? 'none';
                const btnOpts = allowedBtns.includes(curBtn) ? allowedBtns : [...allowedBtns, curBtn];
                const btnLabel = (m: string) => m === 'use' ? 'Use (consume the item)' : m === 'buy' ? 'Buy (from this shop)' : m === 'sell' ? 'Sell (player’s items → a shop)' : 'None';
                // Sell-to candidates: real shops (have a currency), excluding this grid's own list.
                const sellShops = allColls.filter(c => c.id !== el.collectionId && !c.tracksOwnedItems && c.currencyVariableId);
                const sellTargetMissing = curBtn === 'sell' && (!el.sellToCollectionId || !sellShops.some(c => c.id === el.sellToCollectionId));
                const buyNoCurrency = curBtn === 'buy' && !!boundColl && !boundColl.currencyVariableId;
                return {
                    content: <>
                        <h4 className="font-bold my-1 text-slate-400 text-xs">Data source</h4>
                        <FormField label="Bound list">
                            <Select value={el.collectionId || ''} onChange={e => updateElement({ collectionId: e.target.value || undefined })}>
                                <option value="">Player inventory (owned items)</option>
                                {itemLists.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </Select>
                        </FormField>
                        <p className="text-[9px] text-slate-500 -mt-1">Which stockpile this grid shows. "Player inventory" = the items the player owns. Pick an item list (Systems → Inventory) to show a shop/library/chest's own separate stock.</p>
                        <h4 className="font-bold my-1 mt-2 text-slate-400 text-xs">{t('elementInspector.galleryLayout')}</h4>
                        <FormField label="Slot layout">
                            <Select value={el.slotLayout || 'grid'} onChange={e => {
                                if (e.target.value === 'free') {
                                    const cols = el.columns || 4;
                                    const seed = Math.max(itemList.length || 0, cols);
                                    const rects = (el.slotRects && el.slotRects.length) ? el.slotRects : gridSeedRects(el, seed, cols);
                                    updateElement({ slotLayout: 'free', slotRects: rects });
                                } else updateElement({ slotLayout: 'grid' });
                            }}>
                                <option value="grid">Grid (auto)</option>
                                <option value="free">Free placement</option>
                            </Select>
                        </FormField>
                        {el.slotLayout === 'free' ? <>
                            <p className="text-[10px] text-slate-400 -mt-1 mb-1">Drag each box on the canvas to position/resize it. Items fill the boxes in order — add one box per slot you want; items beyond the boxes are hidden.</p>
                            <div className="flex items-center gap-2 mb-1">
                                <button onClick={() => { const rects = [...(el.slotRects || [])]; const last = rects[rects.length - 1]; rects.push(last ? { ...last, x: Math.min(90, last.x + 4), y: Math.min(90, last.y + 4) } : { x: 40, y: 40, width: 12, height: 12 }); updateElement({ slotRects: rects }); }} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200">+ Add box</button>
                                <button onClick={() => { const rects = [...(el.slotRects || [])]; rects.pop(); updateElement({ slotRects: rects }); }} disabled={!el.slotRects || el.slotRects.length === 0} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-40">− Remove last</button>
                                <span className="text-[10px] text-slate-500">{el.slotRects?.length || 0} boxes</span>
                            </div>
                            <button onClick={() => { const cols = el.columns || 4; updateElement({ slotRects: gridSeedRects(el, el.slotRects?.length || Math.max(itemList.length, cols), cols) }); }} className="text-xs px-2 py-1 mb-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200">Re-arrange as grid</button>
                        </> : <>
                            <div className="grid grid-cols-2 gap-2">
                                <FormField label={t('elementInspector.columns')}><TextInput type="number" min="1" max="10" value={String(el.columns || 4)} onChange={e => updateElement({ columns: parseInt(e.target.value, 10) || 4 })} /></FormField>
                                <FormField label="Rows"><TextInput type="number" min="0" max="20" value={el.rows ?? ''} placeholder="Auto" onChange={e => updateElement({ rows: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0) })} /></FormField>
                            </div>
                            <p className="text-[9px] text-slate-500 -mt-1">Rows = minimum slot rows (pads empty slots, like a backpack). Blank = grow with items.</p>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                                <FormField label="Column spacing"><TextInput type="number" min="0" max="48" value={String(el.columnGap ?? el.gap ?? 8)} onChange={e => updateElement({ columnGap: parseInt(e.target.value, 10) || 0 })} /></FormField>
                                <FormField label="Row spacing"><TextInput type="number" min="0" max="48" value={String(el.rowGap ?? el.gap ?? 8)} onChange={e => updateElement({ rowGap: parseInt(e.target.value, 10) || 0 })} /></FormField>
                            </div>
                        </>}
                        <FormField label={t('elementInspector.categoryFilter')}>
                            <Select value={el.categoryFilter || ''} onChange={e => updateElement({ categoryFilter: e.target.value || undefined })}>
                                <option value="">{t('elementInspector.allCategories')}</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </Select>
                        </FormField>
                        <p className="text-[9px] text-slate-500 -mt-1">Shows only ONE category. To group items under category headers, use grouping in Systems → Player Inventory.</p>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.display')}</h4>
                        {!el.collectionId && <p className="text-[9px] text-slate-500 -mt-1">These override the defaults in Systems → Player Inventory.</p>}
                        {el.collectionId
                            ? <p className="text-[9px] text-slate-500">A bound list always shows its full stock (0 = sold out). "Hide unowned" only applies to the player's inventory.</p>
                            : <FormField label="Hide unowned items"><input type="checkbox" checked={el.hideUnowned !== false} onChange={e => updateElement({ hideUnowned: e.target.checked })} /></FormField>}
                        <FormField label={t('elementInspector.showNames')}><input type="checkbox" checked={el.showNames !== false} onChange={e => updateElement({ showNames: e.target.checked })} /></FormField>
                        <FormField label="Show quantity badge"><input type="checkbox" checked={el.showQuantity !== false} onChange={e => updateElement({ showQuantity: e.target.checked })} /></FormField>
                        <FormField label="Slot button">
                            <Select value={curBtn}
                                onChange={e => { const m = e.target.value as 'use' | 'buy' | 'sell' | 'none'; updateElement({ slotButton: m }); }}>
                                {btnOpts.map(m => <option key={m} value={m}>{btnLabel(m)}{allowedBtns.includes(m) ? '' : ' (not valid for this data source)'}</option>)}
                            </Select>
                        </FormField>
                        {!allowedBtns.includes(curBtn) && (
                            <p className="text-[9px] text-amber-400 -mt-1">{isPlayerSource ? 'Buy only works on a shop list.' : 'Use/Sell only work on the player’s inventory.'} This button is ignored at runtime.</p>
                        )}
                        {curBtn === 'buy' && allowedBtns.includes('buy') && (
                            buyNoCurrency
                                ? <p className="text-[9px] text-amber-400 -mt-1">This shop has no currency variable — Buy will do nothing. Set one in Systems → Inventory → this list → Shop.</p>
                                : <p className="text-[9px] text-slate-500 -mt-1">Buys from this grid's bound shop. Price & currency come from that list's shop settings (Systems → Inventory).</p>
                        )}
                        {curBtn === 'sell' && allowedBtns.includes('sell') && (
                            <>
                                <FormField label="Sell to shop">
                                    <Select value={el.sellToCollectionId || ''} onChange={e => updateElement({ sellToCollectionId: e.target.value || undefined })}>
                                        <option value="">Select a shop list…</option>
                                        {sellShops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        {el.sellToCollectionId && !sellShops.some(c => c.id === el.sellToCollectionId) && (
                                            <option value={el.sellToCollectionId}>{(project.itemCollections as any)?.[el.sellToCollectionId]?.name || el.sellToCollectionId} (not a currency shop)</option>
                                        )}
                                    </Select>
                                </FormField>
                                {sellTargetMissing && <p className="text-[9px] text-amber-400 -mt-1">Pick a shop list with a currency for the sale to go through.</p>}
                                {sellShops.length === 0 && <p className="text-[9px] text-slate-500 -mt-1">No shops yet — a shop is an item list with a currency variable (Systems → Inventory).</p>}
                            </>
                        )}
                        <FormField label="Player can rearrange"><input type="checkbox" checked={el.allowReorder !== false} onChange={e => updateElement({ allowReorder: e.target.checked })} /></FormField>
                        <FormField label="Empty text"><TextInput value={el.emptyText || ''} onChange={e => updateElement({ emptyText: e.target.value })} placeholder="Your bag is empty" /></FormField>
                        <div className="mt-4 p-2 rounded bg-slate-700/30 text-xs text-slate-400">
                            <p>Items are managed in the <strong>Systems</strong> tab. {el.collectionId ? 'This grid shows the bound item list’s own stock (separate from the player’s inventory).' : 'This grid shows the player’s owned items.'}</p>
                            <p className="mt-1">{itemList.length} item{itemList.length === 1 ? '' : 's'} defined.</p>
                        </div>
                    </>,
                    appearance: <>
                        <h4 className="font-bold my-1 text-slate-400 text-xs">Slot styling</h4>
                        <FormField label="Slot background"><ColorInput value={el.slotColor && el.slotColor.startsWith('#') ? el.slotColor : '#1e293b'} onChange={v => updateElement({ slotColor: v })} /></FormField>
                        <FormField label={t('elementInspector.borderColor')}><ColorInput value={el.slotBorderColor || '#4D3273'} onChange={v => updateElement({ slotBorderColor: v })} /></FormField>
                        <FormField label={t('elementInspector.borderRadiusPx')}><TextInput type="number" min="0" max="32" value={String(el.slotBorderRadius ?? 8)} onChange={e => updateElement({ slotBorderRadius: parseInt(e.target.value, 10) || 0 })} /></FormField>
                        <FormField label="Selected ring"><ColorInput value={el.selectedBorderColor || '#38bdf8'} onChange={v => updateElement({ selectedBorderColor: v })} /></FormField>
                        <FormField label="Square slots"><input type="checkbox" checked={el.squareSlots !== false} onChange={e => updateElement({ squareSlots: e.target.checked })} /></FormField>
                        <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer my-1">
                            <input type="checkbox" checked={el.hideSlotBox === true} onChange={e => updateElement({ hideSlotBox: e.target.checked })} className="accent-purple-500" />
                            Hide slot box &amp; border (show item only)
                        </label>
                        <FormField label={t('elementInspector.backgroundColor')}><ColorInput value={el.backgroundColor && el.backgroundColor.startsWith('#') ? el.backgroundColor : '#0f172a'} onChange={v => updateElement({ backgroundColor: v })} disabled={el.hideBackgroundPanel === true} /></FormField>
                        <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer my-1">
                            <input type="checkbox" checked={el.hideBackgroundPanel === true} onChange={e => updateElement({ hideBackgroundPanel: e.target.checked })} className="accent-purple-500" />
                            Hide background panel (float over your own art)
                        </label>
                        {el.showQuantity !== false && (
                            <>
                                <h4 className="font-bold my-2 text-slate-400 text-xs">Quantity badge</h4>
                                <div className="grid grid-cols-2 gap-1">
                                    <FormField label="Text"><ColorInput value={el.quantityColor && el.quantityColor.startsWith('#') ? el.quantityColor : '#ffffff'} onChange={v => updateElement({ quantityColor: v })} /></FormField>
                                    <FormField label="Background"><ColorInput value={el.quantityBgColor && el.quantityBgColor.startsWith('#') ? el.quantityBgColor : '#000000'} onChange={v => updateElement({ quantityBgColor: v })} /></FormField>
                                </div>
                                <FormField label="Position">
                                    <Select value={el.quantityPosition || 'top-right'} onChange={e => updateElement({ quantityPosition: e.target.value as UIInventoryGridElement['quantityPosition'] })}>
                                        <option value="top-right">Top right</option>
                                        <option value="top-left">Top left</option>
                                        <option value="bottom-right">Bottom right</option>
                                        <option value="bottom-left">Bottom left</option>
                                    </Select>
                                </FormField>
                                {el.quantityFont
                                    ? <FontEditor font={el.quantityFont} onFontChange={(prop, value) => updateElement({ quantityFont: { ...el.quantityFont!, [prop]: value } })} />
                                    : <button onClick={() => updateElement({ quantityFont: project.ui.dialogueTextFont })} className="text-xs text-sky-400 hover:text-sky-300 mt-1">+ Customize badge font</button>}
                            </>
                        )}
                        {el.showNames !== false && el.nameFont && (
                            <>
                                <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.nameFont')}</h4>
                                <FontEditor font={el.nameFont} onFontChange={(prop, value) => updateElement({ nameFont: { ...el.nameFont!, [prop]: value } })} />
                            </>
                        )}
                        {(el.slotButton ?? 'none') !== 'none' && (() => {
                            const mode = el.slotButton ?? 'none';
                            const defLabel = mode === 'buy' ? 'Buy' : mode === 'sell' ? 'Sell' : 'Use';
                            return (
                            <>
                                <h4 className="font-bold my-2 text-slate-400 text-xs">{defLabel} button</h4>
                                <FormField label="Button text"><TextInput value={el.useButtonText || ''} onChange={e => updateElement({ useButtonText: e.target.value })} placeholder={defLabel} /></FormField>
                                <AssetSelector label="Button art" assetType="images" allowVideo value={el.useButtonImage?.id || null} onChange={id => updateElement({ useButtonImage: id ? { type: 'image', id } : null })} />
                                <AssetSelector label="Hover art" assetType="images" allowVideo value={el.useButtonHoverImage?.id || null} onChange={id => updateElement({ useButtonHoverImage: id ? { type: 'image', id } : null })} />
                                <div className="grid grid-cols-3 gap-1">
                                    <FormField label="BG"><ColorInput value={el.useButtonColor && el.useButtonColor.startsWith('#') ? el.useButtonColor : '#0ea5e9'} onChange={v => updateElement({ useButtonColor: v })} /></FormField>
                                    <FormField label="Hover"><ColorInput value={el.useButtonHoverColor && el.useButtonHoverColor.startsWith('#') ? el.useButtonHoverColor : '#0284c7'} onChange={v => updateElement({ useButtonHoverColor: v })} /></FormField>
                                    <FormField label="Text"><ColorInput value={el.useButtonTextColor && el.useButtonTextColor.startsWith('#') ? el.useButtonTextColor : '#ffffff'} onChange={v => updateElement({ useButtonTextColor: v })} /></FormField>
                                </div>
                                <FormField label="Corner radius (px)"><TextInput type="number" min="0" max="32" value={String(el.useButtonRadius ?? 6)} onChange={e => updateElement({ useButtonRadius: parseInt(e.target.value, 10) || 0 })} /></FormField>
                                {el.useButtonFont
                                    ? <><h4 className="font-bold my-2 text-slate-400 text-xs">Button font</h4><FontEditor font={el.useButtonFont} onFontChange={(prop, value) => updateElement({ useButtonFont: { ...el.useButtonFont!, [prop]: value } })} /></>
                                    : <button onClick={() => updateElement({ useButtonFont: project.ui.dialogueTextFont })} className="text-xs text-sky-400 hover:text-sky-300 mt-1">+ Customize button font</button>}
                                <div className="mt-3">
                                    <UIActionsListEditor actions={el.slotButtonActions || []} project={project} onChange={acts => updateElement({ slotButtonActions: acts })} label={`When ${defLabel} is clicked, also run`} />
                                    <p className="text-[9px] text-slate-500 mt-1">Runs after the built-in {defLabel.toLowerCase()} (e.g. play a sound, set a flag, jump, call a Common Event). Applies to every slot's button — unless an item sets its own slot-button actions (Systems → item), which replace these for that item.</p>
                                </div>
                            </>
                            );
                        })()}
                    </>,
                };
            }
            case UIElementType.Customizer: {
                const el = element as UICustomizerElement;
                const czChar = el.characterId ? project.characters[el.characterId] : undefined;
                const czLayers: VNCharacterLayer[] = czChar ? Object.values(czChar.layers) : [];
                // Build (or re-sync) one category per character layer, auto-creating a backing string
                // variable for each — this is what makes the dress-up "just work" with no manual wiring.
                const buildCategories = () => {
                    if (!czChar) return;
                    const cats = Object.values(czChar.layers).map((layer: any) => {
                        const existing = (el.categories || []).find(c => c.layerId === layer.id);
                        if (existing) return existing;
                        const variableId: VNID = `cust-${Math.random().toString(36).slice(2, 9)}`;
                        const firstAsset = Object.keys(layer.assets)[0] || '';
                        dispatch({ type: 'ADD_VARIABLE', payload: { id: variableId, name: `${czChar.name} — ${layer.name}`, type: 'string', defaultValue: firstAsset } });
                        return { layerId: layer.id, label: layer.name, variableId, pickerStyle: 'arrows' as const };
                    });
                    updateElement({ categories: cats });
                };
                const setOptionMeta = (assetId: VNID, patch: Partial<import('../../features/ui/types').UICustomizerOptionMeta>) => {
                    const meta = { ...(el.optionMeta || {}) };
                    meta[assetId] = { ...(meta[assetId] || {}), ...patch };
                    updateElement({ optionMeta: meta });
                };
                // ── Layer picker helpers (clear, per-layer include/label/style/order) ──
                const catFor = (layerId: VNID) => (el.categories || []).find(c => c.layerId === layerId);
                const includeLayer = (layer: VNCharacterLayer) => {
                    if (!czChar || catFor(layer.id)) return;
                    const variableId: VNID = `cust-${Math.random().toString(36).slice(2, 9)}`;
                    const firstAsset = Object.keys(layer.assets)[0] || '';
                    dispatch({ type: 'ADD_VARIABLE', payload: { id: variableId, name: `${czChar.name} — ${layer.name}`, type: 'string', defaultValue: firstAsset } });
                    updateElement({ categories: [...(el.categories || []), { layerId: layer.id, label: layer.name, variableId, pickerStyle: 'arrows' }] });
                };
                const excludeLayer = (layerId: VNID) => updateElement({ categories: (el.categories || []).filter(c => c.layerId !== layerId) });
                const patchCat = (layerId: VNID, patch: Partial<import('../../features/ui/types').UICustomizerCategory>) => updateElement({ categories: (el.categories || []).map(c => c.layerId === layerId ? { ...c, ...patch } : c) });
                const moveCat = (idx: number, dir: -1 | 1) => {
                    const cats = [...(el.categories || [])];
                    const j = idx + dir;
                    if (j < 0 || j >= cats.length) return;
                    [cats[idx], cats[j]] = [cats[j], cats[idx]];
                    updateElement({ categories: cats });
                };
                const includedCats = el.categories || [];
                const excludedLayers = czLayers.filter(l => !catFor(l.id));
                const pickerStyleHint = (s?: string): string => (({
                    swatches: 'Every option as a grid of thumbnails the player taps.',
                    arrows: 'One option at a time with ◀ ▶ arrows to cycle through.',
                    buttons: 'Each option as a labelled button.',
                    dropdown: 'A dropdown list of options.',
                } as Record<string, string>)[s || 'swatches'] || '');
                const stepHeader = (n: number, title: string) => (
                    <div className="flex items-center gap-2 pt-1">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--accent-lavender)]/25 text-[var(--accent-lavender)] text-[11px] font-bold flex items-center justify-center">{n}</span>
                        <h4 className="font-bold text-slate-200 text-xs">{title}</h4>
                    </div>
                );
                return {
                    content: <>
                        <p className="text-[11px] text-slate-300 bg-slate-800/40 rounded p-2 leading-snug">A <strong>Customizer</strong> lets players dress up a character — pick a character, choose which parts they can change, and where it appears on screen.</p>
                        {stepHeader(1, 'Choose the character')}
                        <FormField label="Character">
                            <Select value={el.characterId || ''} onChange={e => {
                                const newCharId = e.target.value;
                                const newChar = newCharId ? project.characters[newCharId] : undefined;
                                if (newChar) {
                                    // Auto-include every layer so the customizer WORKS immediately (no hidden
                                    // setup step). Each becomes an ◀▶ cycle picker by default; the author can
                                    // remove/relabel/reorder/restyle below. Reuse an existing category's variable
                                    // if the layer already had one.
                                    const cats = (Object.values(newChar.layers) as VNCharacterLayer[]).map(layer => {
                                        const existing = (el.categories || []).find(c => c.layerId === layer.id);
                                        if (existing) return existing;
                                        const variableId: VNID = `cust-${Math.random().toString(36).slice(2, 9)}`;
                                        const firstAsset = Object.keys(layer.assets)[0] || '';
                                        dispatch({ type: 'ADD_VARIABLE', payload: { id: variableId, name: `${newChar.name} — ${layer.name}`, type: 'string', defaultValue: firstAsset } });
                                        return { layerId: layer.id, label: layer.name, variableId, pickerStyle: 'arrows' as const };
                                    });
                                    updateElement({ characterId: newCharId, categories: cats, expressionId: undefined });
                                } else {
                                    updateElement({ characterId: newCharId, categories: [], expressionId: undefined });
                                }
                            }}>
                                {Object.keys(project.characters).length === 0 && <option value="">No characters yet</option>}
                                {!el.characterId && <option value="">Select a character…</option>}
                                {Object.values(project.characters).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </Select>
                        </FormField>
                        {czChar && Object.keys((czChar as any).poses || {}).length > 0 && (
                            <FormField label={t('elementInspector.previewPose', 'Pose shown in this preview')}>
                                <Select value={(el as any).poseId || ''} onChange={e => updateElement({ poseId: e.target.value || undefined } as any)}>
                                    <option value="">{t('character.defaultPose', 'Default (normal art)')}</option>
                                    {Object.values((czChar as any).poses || {}).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </Select>
                            </FormField>
                        )}
                        {czChar && onOpenCharacters && (
                            <button onClick={() => onOpenCharacters(czChar.id)} className="w-full text-left text-xs px-2.5 py-2 rounded-lg bg-[var(--accent-lavender)]/10 hover:bg-[var(--accent-lavender)]/20 text-[var(--accent-lavender)] border border-[var(--accent-lavender)]/30 transition-colors">
                                ✎ Add or edit this character's layers &amp; art →
                            </button>
                        )}
                        {czChar && czLayers.length === 0 && <p className="text-[11px] text-amber-400 bg-amber-400/10 rounded p-2">This character has no layers yet. Click the button above to add layers (hair, outfit, etc.) and their art in the Characters tab, then come back here.</p>}
                        {czChar && czLayers.length > 0 && (
                            <div className="space-y-2">
                                {stepHeader(2, 'Pick what players can change')}
                                <p className="text-[10px] text-slate-400 -mt-1">Each layer you add becomes an on-screen picker the player uses to change that part of the character.</p>
                                {includedCats.length === 0 && (
                                    <p className="text-[11px] text-slate-300 bg-slate-800/40 rounded p-2">Nothing added yet. {excludedLayers.length > 0 ? 'Add a part from the buttons below 👇' : ''}</p>
                                )}
                                {includedCats.map((cat, idx) => {
                                    const layerName = czChar.layers[cat.layerId]?.name || '(deleted layer)';
                                    return (
                                        <div key={cat.layerId} className="rounded-lg border border-slate-700 bg-slate-800/40 p-2 space-y-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-slate-200 text-xs flex-1 truncate" title={layerName}>{layerName}</span>
                                                <button onClick={() => moveCat(idx, -1)} disabled={idx <= 0} className="text-slate-400 hover:text-white disabled:opacity-25 text-sm px-1 flex-shrink-0" title="Move up">↑</button>
                                                <button onClick={() => moveCat(idx, 1)} disabled={idx >= includedCats.length - 1} className="text-slate-400 hover:text-white disabled:opacity-25 text-sm px-1 flex-shrink-0" title="Move down">↓</button>
                                                <button onClick={() => excludeLayer(cat.layerId)} className="text-red-400 hover:text-red-300 text-sm px-1 flex-shrink-0" title="Remove this part">✕</button>
                                            </div>
                                            <FormField label="Label players see">
                                                <TextInput value={cat.label ?? ''} placeholder={layerName} onChange={e => patchCat(cat.layerId, { label: e.target.value || undefined })} />
                                            </FormField>
                                            <FormField label="How the player picks">
                                                <Select value={cat.pickerStyle || 'swatches'} onChange={e => patchCat(cat.layerId, { pickerStyle: e.target.value as 'swatches' | 'arrows' | 'buttons' | 'dropdown' })}>
                                                    <option value="arrows">Arrows (◀ ▶ cycle)</option>
                                                    <option value="swatches">Swatches (grid of thumbnails)</option>
                                                    <option value="buttons">Buttons</option>
                                                    <option value="dropdown">Dropdown list</option>
                                                </Select>
                                            </FormField>
                                            <p className="text-[9px] text-slate-500 -mt-1">{pickerStyleHint(cat.pickerStyle)}</p>
                                        </div>
                                    );
                                })}
                                {excludedLayers.length > 0 && (
                                    <div className="rounded-lg border border-dashed border-slate-700 p-2">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <p className="text-[10px] text-slate-400">{includedCats.length > 0 ? 'Add another part:' : 'Add a part players can change:'}</p>
                                            <button onClick={buildCategories} className="text-[10px] px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 flex-shrink-0" title="Add every layer at once">Add all</button>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {excludedLayers.map(layer => (
                                                <button key={layer.id} onClick={() => includeLayer(layer)} className="text-[11px] px-2.5 py-1 rounded-md bg-[var(--accent-cyan)]/15 hover:bg-[var(--accent-cyan)]/25 text-[var(--accent-cyan)]" title={`Let players change ${layer.name}`}>+ {layer.name}</button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {czChar.expressions && Object.keys(czChar.expressions).length > 0 && (
                                    <details className="text-[10px] text-slate-400">
                                        <summary className="cursor-pointer select-none hover:text-slate-200">Advanced: base look for parts you didn't add</summary>
                                        <div className="pt-1.5">
                                            <FormField label="Fallback expression">
                                                <Select value={el.expressionId || ''} onChange={e => updateElement({ expressionId: e.target.value || undefined })}>
                                                    <option value="">First expression</option>
                                                    {Object.values(czChar.expressions).map((ex: any) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                                                </Select>
                                            </FormField>
                                            <p className="text-[9px] text-slate-500 mt-1">Layers you didn't add stay fixed on this expression's look.</p>
                                        </div>
                                    </details>
                                )}
                            </div>
                        )}
                        {stepHeader(3, 'Where it appears')}
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label="Layout">
                                <Select value={el.layout || 'preview-left'} onChange={e => {
                                    const v = e.target.value as UICustomizerElement['layout'];
                                    if (v === 'free') {
                                        updateElement({
                                            layout: 'free',
                                            previewRect: el.previewRect ?? { x: 8, y: 12, width: 30, height: 76 },
                                            pickersRect: el.pickersRect ?? { x: 44, y: 12, width: 48, height: 76 },
                                        });
                                    } else updateElement({ layout: v });
                                }}>
                                    <option value="preview-left">Preview left</option>
                                    <option value="preview-right">Preview right</option>
                                    <option value="preview-top">Preview top</option>
                                    <option value="free">Free placement</option>
                                </Select>
                            </FormField>
                            {el.layout !== 'free' && <FormField label="Preview size (%)"><TextInput type="number" min="20" max="80" value={String(el.previewPercent ?? 45)} onChange={e => updateElement({ previewPercent: Math.max(10, Math.min(90, parseInt(e.target.value, 10) || 45)) })} /></FormField>}
                        </div>
                        {el.layout === 'free' && (
                            <div className="p-2 rounded border border-slate-700 bg-slate-800/30 space-y-2">
                                <p className="text-[10px] text-slate-400">Drag the character preview and the controls panel on the canvas to position &amp; size them.</p>
                                <h4 className="font-bold text-slate-400 text-xs">Preview box</h4>
                                <p className="text-[9px] text-slate-500 -mt-1">Leave these blank for no box — the character floats so you can place your own background art behind it.</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <FormField label="Background"><ColorInput value={el.previewBackgroundColor ?? ''} onChange={c => updateElement({ previewBackgroundColor: c || undefined })} /></FormField>
                                    <FormField label="Border"><ColorInput value={el.previewBorderColor ?? ''} onChange={c => updateElement({ previewBorderColor: c || undefined })} /></FormField>
                                </div>
                                <AssetSelector label="Background image (optional)" assetType="images" allowVideo value={el.previewBackgroundImage?.id ?? null} onChange={id => updateElement({ previewBackgroundImage: id ? { type: 'image', id } : null })} />
                                <FormField label="Corner radius (px)"><TextInput type="number" min="0" max="64" value={el.previewBorderRadius ?? ''} placeholder="0" onChange={e => updateElement({ previewBorderRadius: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0) })} /></FormField>
                                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                                    <input type="checkbox" checked={el.hidePickersPanel === true} onChange={e => updateElement({ hidePickersPanel: e.target.checked || undefined })} className="accent-purple-500" />
                                    Hide controls panel (let the pickers float too)
                                </label>
                            </div>
                        )}
                        {stepHeader(4, 'Player controls')}
                        <FormField label="Show category labels"><input type="checkbox" checked={el.showLabels !== false} onChange={e => updateElement({ showLabels: e.target.checked })} /></FormField>
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label="Randomize button"><input type="checkbox" checked={!!el.showRandomize} onChange={e => updateElement({ showRandomize: e.target.checked })} /></FormField>
                            <FormField label="Reset button"><input type="checkbox" checked={!!el.showReset} onChange={e => updateElement({ showReset: e.target.checked })} /></FormField>
                        </div>
                        {el.showRandomize && <FormField label="Randomize label"><TextInput value={el.randomizeLabel ?? ''} placeholder="Randomize" onChange={e => updateElement({ randomizeLabel: e.target.value || undefined })} /></FormField>}
                        {el.showReset && <FormField label="Reset label"><TextInput value={el.resetLabel ?? ''} placeholder="Reset" onChange={e => updateElement({ resetLabel: e.target.value || undefined })} /></FormField>}
                        {(el.categories || []).length > 0 && czChar && (
                            <CollapsibleSection title="Options & rules" hint="Lock options behind conditions, hide incompatible ones, or give an option a custom swatch.">
                                {(el.categories || []).map(cat => {
                                    const layer = czChar.layers[cat.layerId];
                                    if (!layer) return null;
                                    const catAssets = Object.values(layer.assets) as any[];
                                    return (
                                        <div key={cat.layerId} className="mb-2">
                                            <p className="text-[10px] font-semibold text-slate-300 mb-1">{cat.label || layer.name}</p>
                                            <div className="space-y-1.5">
                                                {catAssets.map(a => {
                                                    const meta = el.optionMeta?.[a.id] || {};
                                                    return (
                                                        <div key={a.id} className="p-1.5 rounded border border-slate-700/50 bg-slate-800/30 space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-slate-400 flex-1 truncate" title={a.name}>{a.name}</span>
                                                                <Select value={meta.whenUnmet || 'hide'} onChange={e => setOptionMeta(a.id, { whenUnmet: e.target.value as 'hide' | 'lock' })}>
                                                                    <option value="hide">Hide if unmet</option>
                                                                    <option value="lock">Lock if unmet</option>
                                                                </Select>
                                                            </div>
                                                            <AssetSelector label="Swatch (optional)" assetType="images" value={meta.swatchImage?.id || null} onChange={id => setOptionMeta(a.id, { swatchImage: id ? { type: 'image', id } : null })} />
                                                            <ConditionsEditor collapsible title="Show / unlock when…" conditions={meta.conditions} project={project} onChange={cs => setOptionMeta(a.id, { conditions: cs })} />
                                                        </div>
                                                    );
                                                })}
                                                {catAssets.length === 0 && <p className="text-[9px] text-slate-500">No assets in this layer.</p>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </CollapsibleSection>
                        )}
                    </>,
                    appearance: <>
                        <FormField label="Panel background"><ColorInput value={el.backgroundColor || '#1e1e38'} onChange={v => updateElement({ backgroundColor: v })} /></FormField>
                        <FormField label={t('elementInspector.borderColor')}>
                            <div className="flex items-center gap-2">
                                <ColorInput value={el.borderColor || '#4D3273'} onChange={v => updateElement({ borderColor: v })} />
                                {el.borderColor && <button onClick={() => updateElement({ borderColor: undefined })} className="text-xs text-red-400 hover:text-red-300">Clear</button>}
                            </div>
                        </FormField>
                        <FormField label={t('elementInspector.borderRadiusPx')}><TextInput type="number" min="0" max="40" value={String(el.borderRadius ?? 8)} onChange={e => updateElement({ borderRadius: parseInt(e.target.value, 10) || 0 })} /></FormField>
                        <FormField label="Selected highlight"><ColorInput value={el.selectedColor || '#8a2be2'} onChange={v => updateElement({ selectedColor: v })} /></FormField>
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label="Swatch size (px)"><TextInput type="number" min="16" max="160" value={String(el.swatchSize ?? 48)} onChange={e => updateElement({ swatchSize: parseInt(e.target.value, 10) || 48 })} /></FormField>
                            <FormField label="Swatch gap (px)"><TextInput type="number" min="0" max="40" value={String(el.swatchGap ?? 6)} onChange={e => updateElement({ swatchGap: parseInt(e.target.value, 10) || 0 })} /></FormField>
                        </div>
                        <div className="space-y-2 p-2 rounded-md bg-slate-800/40 border border-slate-700/50">
                            <p className="text-[10px] text-slate-400 font-semibold">Picker theming</p>
                            <AssetSelector label="Frame image (optional)" assetType="images" value={el.backgroundImage?.id || null} onChange={id => updateElement({ backgroundImage: id ? { type: 'image', id } : null })} />
                            <p className="text-[9px] text-slate-500 -mt-1">A panel/frame image behind the whole element.</p>
                            <div className="grid grid-cols-2 gap-2">
                                <FormField label="Arrow color"><ColorInput value={el.arrowColor || '#ffffff'} onChange={v => updateElement({ arrowColor: v })} /></FormField>
                                <FormField label="Arrow size (px)"><TextInput type="number" min="8" max="96" value={String(el.arrowSize ?? 28)} onChange={e => updateElement({ arrowSize: parseInt(e.target.value, 10) || 28 })} /></FormField>
                            </div>
                            <AssetSelector label="Arrow image (optional)" assetType="images" value={el.arrowImage?.id || null} onChange={id => updateElement({ arrowImage: id ? { type: 'image', id } : null })} />
                            <p className="text-[9px] text-slate-500 -mt-1">Used by the Arrows picker style (left side is mirrored).</p>
                            <div className="grid grid-cols-2 gap-2">
                                <FormField label="Button color"><ColorInput value={(el.buttonColor && el.buttonColor.startsWith('#')) ? el.buttonColor : '#334155'} onChange={v => updateElement({ buttonColor: v })} /></FormField>
                                <FormField label="Button text"><ColorInput value={el.buttonTextColor || '#ffffff'} onChange={v => updateElement({ buttonTextColor: v })} /></FormField>
                            </div>
                            <p className="text-[9px] text-slate-500">Set each category's picker style (Swatches / Arrows / Buttons / Dropdown) in the Content tab.</p>
                        </div>
                        {el.font && (
                            <><h4 className="font-bold my-2 text-slate-400 text-xs">Label font</h4>
                            <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font!, [prop]: value } })} /></>
                        )}
                    </>,
                };
            }
            case UIElementType.Meter: {
                const el = element as UIMeterElement;
                const numberVariables = Object.values(project.variables).filter((v): v is VNVariable => (v as VNVariable).type === 'number');
                const boundVar = el.variableId ? project.variables[el.variableId] : undefined;
                // If the bound variable backs a stat, surface that stat's color as a one-click suggestion.
                const allStats = Object.values(project.stats || {}) as import('../../features/stats/types').VNStat[];
                const boundStat = el.variableId ? allStats.find(s => Object.values(s.variableIds || {}).includes(el.variableId!)) : undefined;
                // Band-driven options are only offered once the variable HAS names to show — otherwise
                // they'd be dead controls that silently do nothing.
                const meterHasBands = hasBands(boundVar);
                const meterBandExample = meterHasBands
                    ? `"${sortedBands(boundVar)[0]?.name || 'Friend'}" (the step's name)`
                    : '';
                return {
                    content: <>
                        <FormField label="Variable to display">
                            {/* Number-only: a meter on a Yes/No or a piece of text is meaningless. If none
                                exists yet, the picker creates one from the name you type — no trip to the
                                Variables tab and back. */}
                            <VariablePicker
                                value={el.variableId || ''}
                                onChange={id => updateElement({ variableId: id || undefined })}
                                allowedTypes={['number']}
                                placeholder="Choose a number to show…"
                            />
                        </FormField>
                        <p className="text-[9px] text-slate-500 -mt-1">Stats (Systems tab) appear here by name — e.g. "Alice — Affection". The bar tracks the value live.</p>
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label="Minimum"><TextInput type="number" value={el.minValue ?? ''} placeholder={String((boundVar as any)?.min ?? 0)} onChange={e => updateElement({ minValue: e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0) })} /></FormField>
                            <FormField label="Maximum"><TextInput type="number" value={el.maxValue ?? ''} placeholder={String((boundVar as any)?.max ?? 100)} onChange={e => updateElement({ maxValue: e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0) })} /></FormField>
                        </div>
                        <p className="text-[9px] text-slate-500 -mt-1">Blank = use the variable's own range.</p>
                        <FormField label="Bar style">
                            <Select value={el.style || 'bar'} onChange={e => updateElement({ style: e.target.value as 'bar' | 'battery' | 'segments' | 'icons' })}>
                                <option value="bar">Bar (classic fill)</option>
                                <option value="battery">Battery</option>
                                <option value="segments">Segments</option>
                                <option value="icons">Hearts / repeated image</option>
                            </Select>
                        </FormField>
                        {el.style === 'segments' && (
                            <div className="grid grid-cols-2 gap-2">
                                <FormField label="Segments"><TextInput type="number" min="1" max="50" value={el.segmentCount ?? 10} onChange={e => updateElement({ segmentCount: parseInt(e.target.value) || 10 })} /></FormField>
                                <FormField label="Gap (px)"><TextInput type="number" min="0" max="20" value={el.segmentGap ?? 2} onChange={e => updateElement({ segmentGap: parseInt(e.target.value) || 0 })} /></FormField>
                            </div>
                        )}
                        {el.style === 'icons' && (
                            <div className="space-y-2 p-2 rounded-md bg-slate-800/40 border border-slate-700/50">
                                <p className="text-[10px] text-slate-400">Show a symbol repeated across the bar — perfect for a hearts / lives system.</p>
                                <AssetSelector label="Symbol image (full)" assetType="images" value={el.iconImage?.id || null} onChange={id => updateElement({ iconImage: id ? { type: 'image', id } : null })} />
                                <AssetSelector label="Empty symbol (optional)" assetType="images" value={el.iconEmptyImage?.id || null} onChange={id => updateElement({ iconEmptyImage: id ? { type: 'image', id } : null })} />
                                <p className="text-[9px] text-slate-500 -mt-1">No empty image → the full symbol shows dimmed for empty slots. With no image at all, colored boxes are used.</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <FormField label="How many"><TextInput type="number" min="1" max="20" value={el.iconCount ?? 3} onChange={e => updateElement({ iconCount: parseInt(e.target.value) || 3 })} /></FormField>
                                    <FormField label="Steps per symbol">
                                        <Select value={el.iconStep || 'full'} onChange={e => updateElement({ iconStep: e.target.value as 'full' | 'half' | 'quarter' })}>
                                            <option value="full">Whole only</option>
                                            <option value="half">Half (½)</option>
                                            <option value="quarter">Quarter (¼)</option>
                                        </Select>
                                    </FormField>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <FormField label="Size (px)"><TextInput type="number" min="8" max="128" value={el.iconSize ?? 24} onChange={e => updateElement({ iconSize: parseInt(e.target.value) || 24 })} /></FormField>
                                    <FormField label="Gap (px)"><TextInput type="number" min="0" max="40" value={el.iconGap ?? 4} onChange={e => updateElement({ iconGap: parseInt(e.target.value) || 0 })} /></FormField>
                                </div>
                                <p className="text-[9px] text-slate-500">Tip: set Maximum to your number of lives so each symbol = 1 (use Half/Quarter for partial hearts).</p>
                            </div>
                        )}
                        {el.style !== 'battery' && el.style !== 'segments' && el.style !== 'icons' && (
                        <FormField label="Fill direction">
                            <Select value={el.direction || 'ltr'} onChange={e => updateElement({ direction: e.target.value as 'ltr' | 'rtl' | 'up' })}>
                                <option value="ltr">Left → right</option>
                                <option value="rtl">Right → left</option>
                                <option value="up">Bottom → top</option>
                            </Select>
                        </FormField>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label="Align X">
                                <Select value={el.alignX || 'left'} onChange={e => updateElement({ alignX: e.target.value as 'left' | 'center' | 'right' })}>
                                    <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                                </Select>
                            </FormField>
                            <FormField label="Align Y">
                                <Select value={el.alignY || 'top'} onChange={e => updateElement({ alignY: e.target.value as 'top' | 'center' | 'bottom' })}>
                                    <option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option>
                                </Select>
                            </FormField>
                        </div>
                        <FormField label="Show label"><input type="checkbox" checked={el.showLabel !== false} onChange={e => updateElement({ showLabel: e.target.checked })} /></FormField>
                        {el.showLabel !== false && (
                            <FormField label="Label text"><TextInput value={el.label || ''} onChange={e => updateElement({ label: e.target.value || undefined })} placeholder={boundVar?.name || 'Variable name'} /></FormField>
                        )}
                        <FormField label="Show value"><input type="checkbox" checked={el.showValue !== false} onChange={e => updateElement({ showValue: e.target.checked })} /></FormField>
                        {el.showValue !== false && (
                            <FormField label="Value style">
                                <Select value={el.valueFormat || 'valueMax'} onChange={e => updateElement({ valueFormat: e.target.value as 'value' | 'valueMax' | 'percent' | 'band' })}>
                                    <option value="valueMax">47/100</option>
                                    <option value="value">47</option>
                                    <option value="percent">47%</option>
                                    {/* Only offered once the variable actually has names to show. */}
                                    {meterHasBands && <option value="band">{meterBandExample}</option>}
                                </Select>
                            </FormField>
                        )}
                        {meterHasBands && (
                            <FormField label="Colour the bar by its step" hint="The bar takes the colour of whichever named step the value is in — so it warms up as it fills.">
                                <input type="checkbox" checked={!!el.fillFromBand} onChange={e => updateElement({ fillFromBand: e.target.checked })} />
                            </FormField>
                        )}
                    </>,
                    appearance: <>
                        <FormField label="Fill color"><ColorInput value={el.fillColor || '#a78bfa'} onChange={v => updateElement({ fillColor: v })} /></FormField>
                        {boundStat?.color && boundStat.color !== el.fillColor && (
                            <button onClick={() => updateElement({ fillColor: boundStat.color })} className="text-xs text-sky-400 hover:text-sky-300 -mt-1 flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full inline-block" style={{ background: boundStat.color }} /> Use "{boundStat.name}" stat color
                            </button>
                        )}
                        <FormField label="Gradient end (optional)">
                            <div className="flex items-center gap-2">
                                <ColorInput value={el.fillColorEnd || '#f472b6'} onChange={v => updateElement({ fillColorEnd: v })} />
                                {el.fillColorEnd && <button onClick={() => updateElement({ fillColorEnd: undefined })} className="text-xs text-red-400 hover:text-red-300">Clear</button>}
                            </div>
                        </FormField>
                        <FormField label="Track color"><ColorInput value={el.backgroundColor && el.backgroundColor.startsWith('#') ? el.backgroundColor : '#1e293b'} onChange={v => updateElement({ backgroundColor: v })} /></FormField>
                        <FormField label={t('elementInspector.borderColor')}>
                            <div className="flex items-center gap-2">
                                <ColorInput value={el.borderColor || '#4D3273'} onChange={v => updateElement({ borderColor: v })} />
                                {el.borderColor && <button onClick={() => updateElement({ borderColor: undefined })} className="text-xs text-red-400 hover:text-red-300">Clear</button>}
                            </div>
                        </FormField>
                        <FormField label={t('elementInspector.borderRadiusPx')}><TextInput type="number" min="0" max="32" value={String(el.borderRadius ?? 6)} onChange={e => updateElement({ borderRadius: parseInt(e.target.value, 10) || 0 })} /></FormField>
                        <div className="space-y-2 p-2 rounded-md bg-slate-800/40 border border-slate-700/50">
                            <p className="text-[10px] text-slate-400 font-semibold">Resource animations</p>
                            <FormField label="Low when ≤ (% full)"><TextInput type="number" min="0" max="100" value={String(el.lowThresholdPct ?? 25)} onChange={e => updateElement({ lowThresholdPct: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })} /></FormField>
                            <div>
                                <p className="text-[10px] text-slate-400 mb-1">Animate while low (combine any):</p>
                                <div className="grid grid-cols-2 gap-1">
                                    {(['shake', 'pulse', 'flash', 'wave'] as const).map(fx => {
                                        const on = (el.lowAnimations || []).includes(fx);
                                        return <label key={fx} className="flex items-center gap-1.5 text-xs text-slate-300 capitalize">
                                            <input type="checkbox" checked={on} onChange={e => {
                                                const cur = new Set(el.lowAnimations || []);
                                                if (e.target.checked) cur.add(fx); else cur.delete(fx);
                                                updateElement({ lowAnimations: Array.from(cur) });
                                            }} />{fx}
                                        </label>;
                                    })}
                                </div>
                            </div>
                            {(el.lowAnimations || []).includes('flash') && (
                                <FormField label="Low flash color"><ColorInput value={el.lowFlashColor || '#ef4444'} onChange={v => updateElement({ lowFlashColor: v })} /></FormField>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                <FormField label="On increase">
                                    <Select value={el.changeAnimationUp || 'none'} onChange={e => updateElement({ changeAnimationUp: e.target.value as 'none' | 'pop' | 'flash' | 'shake' | 'wave' })}>
                                        <option value="none">None</option><option value="pop">Pop</option><option value="flash">Flash</option><option value="shake">Shake</option><option value="wave">Wave</option>
                                    </Select>
                                </FormField>
                                <FormField label="On decrease">
                                    <Select value={el.changeAnimationDown || 'none'} onChange={e => updateElement({ changeAnimationDown: e.target.value as 'none' | 'pop' | 'flash' | 'shake' | 'wave' })}>
                                        <option value="none">None</option><option value="pop">Pop</option><option value="flash">Flash</option><option value="shake">Shake</option><option value="wave">Wave</option>
                                    </Select>
                                </FormField>
                            </div>
                            {el.changeAnimationUp === 'flash' && <FormField label="Increase flash color"><ColorInput value={el.changeFlashColorUp || '#4ade80'} onChange={v => updateElement({ changeFlashColorUp: v })} /></FormField>}
                            {el.changeAnimationDown === 'flash' && <FormField label="Decrease flash color"><ColorInput value={el.changeFlashColorDown || '#ef4444'} onChange={v => updateElement({ changeFlashColorDown: v })} /></FormField>}
                            <p className="text-[9px] text-slate-500">Plays in test-play & the built game (the canvas stays still).</p>
                        </div>
                        {el.showLabel !== false && el.labelFont && (
                            <><h4 className="font-bold my-2 text-slate-400 text-xs">Label font</h4>
                            <FontEditor font={el.labelFont} onFontChange={(prop, value) => updateElement({ labelFont: { ...el.labelFont!, [prop]: value } })} /></>
                        )}
                        {el.showValue !== false && el.valueFont && (
                            <><h4 className="font-bold my-2 text-slate-400 text-xs">Value font</h4>
                            <FontEditor font={el.valueFont} onFontChange={(prop, value) => updateElement({ valueFont: { ...el.valueFont!, [prop]: value } })} /></>
                        )}
                    </>,
                    media: <>
                        <AssetSelector label="Fill art (optional)" assetType="images" allowVideo value={el.fillImage?.id || null} onChange={id => updateElement({ fillImage: id ? { type: 'image', id } : null })} />
                        <p className="text-[9px] text-slate-500 -mt-1">An image revealed left-to-right as the bar fills (replaces the fill color).</p>
                        <AssetSelector label="Track art (optional)" assetType="images" allowVideo value={el.backgroundImage?.id || null} onChange={id => updateElement({ backgroundImage: id ? { type: 'image', id } : null })} />
                    </>,
                };
            }
            case UIElementType.CharacterPreview: {
                const el = element as UICharacterPreviewElement;
                const isPlayer = el.characterSource === 'player';
                const character = el.characterId ? project.characters[el.characterId] : null;
                const stringVariables = Object.values(project.variables).filter((v): v is VNVariable => (v as VNVariable).type === 'string');
                const layerCount = character ? Object.keys(character.layers).length : 0;
                const mappedCount = character ? Object.values(el.layerVariableMap || {}).filter(Boolean).length : 0;
                return {
                    content: <>
                        <p className="text-xs text-slate-400 mb-3">{t('elementInspector.charPreviewIntro')}</p>
                        <FormField label="Show">
                            <Select value={isPlayer ? 'player' : 'fixed'} onChange={e => updateElement({ characterSource: e.target.value === 'player' ? 'player' : 'fixed' } as any)}>
                                <option value="fixed">A specific character</option>
                                <option value="player">The player's created character</option>
                            </Select>
                        </FormField>
                        {isPlayer && <p className="text-[11px] text-[var(--text-muted)] mb-2">Displays whichever character the player created — their chosen look + outfit are detected automatically. Build the Character Creator in Systems.</p>}
                        {!isPlayer && <>
                        <FormField label={t('elementInspector.character')}>
                            <Select value={el.characterId || ''} onChange={e => { const newCharId = e.target.value; const newChar = project.characters[newCharId]; const firstExprId = newChar ? Object.keys(newChar.expressions)[0] : undefined; updateElement({ characterId: newCharId, expressionId: firstExprId, layerVariableMap: {} }); }}>
                                <option value="">{t('elementInspector.selectCharacter')}</option>
                                {Object.values(project.characters).map((char: unknown) => { const c = char as VNCharacter; return <option key={c.id} value={c.id}>{c.name}</option>; })}
                            </Select>
                        </FormField>
                        {character && Object.keys(character.expressions).length > 0 && (
                            <FormField label={t('elementInspector.defaultExpression')}>
                                <Select value={el.expressionId || ''} onChange={e => updateElement({ expressionId: e.target.value || undefined })}>
                                    <option value="">{t('elementInspector.none')}</option>
                                    {Object.values(character.expressions).map((expr: unknown) => { const ex = expr as any; return <option key={ex.id} value={ex.id}>{ex.name}</option>; })}
                                </Select>
                            </FormField>
                        )}
                        {character && Object.keys((character as any).poses || {}).length > 0 && (
                            <FormField label={t('elementInspector.previewPose', 'Pose shown in this preview')}>
                                <Select value={(el as any).poseId || ''} onChange={e => updateElement({ poseId: e.target.value || undefined } as any)}>
                                    <option value="">{t('character.defaultPose', 'Default (normal art)')}</option>
                                    {Object.values((character as any).poses || {}).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </Select>
                            </FormField>
                        )}
                        {character && layerCount > 0 && (
                            <div className="mt-3">
                                <CollapsibleSection title={t('elementInspector.layerConnections')} defaultOpen={true} badge={`${mappedCount}/${layerCount}`} hint={t('elementInspector.layerConnHint')}>
                                    <p className="text-[10px] text-slate-500 mb-2">{t('elementInspector.connectLayersHint')}</p>
                                    {mappedCount === 0 && layerCount > 0 && (<p className="text-[10px] text-amber-400/70 mb-2">{t('elementInspector.wizardTip')}</p>)}
                                    {Object.values(character.layers).map((layerUnknown: unknown) => {
                                        const layer = layerUnknown as VNCharacterLayer;
                                        return (
                                            <FormField key={layer.id} label={layer.name}>
                                                <Select value={el.layerVariableMap[layer.id] || ''} onChange={e => { const newMap = { ...el.layerVariableMap }; if (e.target.value) newMap[layer.id] = e.target.value; else delete newMap[layer.id]; updateElement({ layerVariableMap: newMap }); }}>
                                                    <option value="">{t('elementInspector.noneUseDefault')}</option>
                                                    {stringVariables.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                                </Select>
                                            </FormField>
                                        );
                                    })}
                                </CollapsibleSection>
                            </div>
                        )}
                        {character && layerCount === 0 && (<p className="text-xs text-slate-400 mt-2">{t('elementInspector.noLayersYet')}</p>)}
                        </>}
                    </>,
                };
            }
            case UIElementType.AssetCycler: {
                const el = element as UIAssetCyclerElement;
                const character = project.characters[el.characterId];
                const layer = character?.layers[el.layerId];
                const assetCount = layer ? Object.keys(layer.assets).length : 0;
                const selectedCount = el.assetIds?.length || 0;
                const hasConditions = (el.assetConditions && el.assetConditions.length > 0) || !!el.filterPattern;
                return {
                    content: <>
                        <p className="text-xs text-slate-400 mb-3">Lets the player cycle through appearance options (e.g., hair styles, skin tones) using arrow buttons.</p>
                        <FormField label={t('elementInspector.character')}>
                            <Select value={el.characterId} onChange={e => { const charId = e.target.value as VNID; const char = project.characters[charId]; const firstLayerId = char ? Object.keys(char.layers)[0] : ''; const firstLayer = firstLayerId && char ? char.layers[firstLayerId] : null; const assetIds = firstLayer ? Object.keys(firstLayer.assets) : []; updateElement({ characterId: charId, layerId: firstLayerId, assetIds }); }}>
                                <option value="">{t('elementInspector.selectCharacter')}</option>
                                {Object.values(project.characters).map((c: VNCharacter) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </Select>
                        </FormField>
                        <FormField label={t('elementInspector.layerToCustomize')}>
                            <Select value={el.layerId} onChange={e => { const layerId = e.target.value as VNID; const newLayer = character?.layers[layerId]; const assetIds = newLayer ? Object.keys(newLayer.assets) : []; updateElement({ layerId, assetIds }); }}>
                                <option value="">{t('elementInspector.selectLayer')}</option>
                                {character && Object.values(character.layers).map((l: VNCharacterLayer) => <option key={l.id} value={l.id}>{l.name} ({Object.keys(l.assets).length} assets)</option>)}
                            </Select>
                        </FormField>
                        <FormField label={t('elementInspector.label')}>
                            <TextInput value={el.label || ''} onChange={e => updateElement({ label: e.target.value })} placeholder={t('elementInspector.labelEgPlaceholder')} />
                        </FormField>
                        <div className="flex items-center gap-4 my-2">
                            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={el.showAssetName !== false} onChange={e => updateElement({ showAssetName: e.target.checked })} className="accent-purple-500" />
                                Show name
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={el.visible !== false} onChange={e => updateElement({ visible: e.target.checked })} className="accent-purple-500" />
                                Visible
                            </label>
                        </div>
                        <div className="space-y-2 mt-3">
                            <CollapsibleSection title={t('elementInspector.availableAssets')} defaultOpen={true} badge={`${selectedCount}/${assetCount}`}>
                                {assetCount > 0 ? (
                                    <>
                                        <div className="flex justify-between mb-2">
                                            <span className="text-[10px] text-slate-500">{t('elementInspector.checkUncheckHint')}</span>
                                            <button onClick={() => { const allIds = layer ? Object.keys(layer.assets) : []; const allSelected = allIds.every(id => el.assetIds.includes(id)); updateElement({ assetIds: allSelected ? [] : allIds }); }} className="text-[10px] text-purple-400 hover:text-purple-300">{selectedCount === assetCount ? 'Deselect All' : 'Select All'}</button>
                                        </div>
                                        <div className="space-y-1 max-h-36 overflow-y-auto">
                                            {layer && Object.values(layer.assets).map((asset: VNLayerAsset) => {
                                                const isSelected = el.assetIds.includes(asset.id);
                                                return (
                                                    <label key={asset.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-700/30 rounded px-1 py-0.5">
                                                        <input type="checkbox" checked={isSelected} onChange={e => { const newAssetIds = e.target.checked ? [...el.assetIds, asset.id] : el.assetIds.filter(id => id !== asset.id); updateElement({ assetIds: newAssetIds }); }} className="accent-purple-500" />
                                                        <span className="text-sm text-slate-300">{asset.name}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-xs text-slate-500 italic">{layer ? 'This layer has no assets. Upload assets in the Characters tab first.' : 'Select a layer above.'}</p>
                                )}
                            </CollapsibleSection>
                            <CollapsibleSection title={t('elementInspector.appearance')} hint={t('elementInspector.appearanceHint')}>
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    <FormField label={t('elementInspector.arrowColor')}><ColorInput value={el.arrowColor || '#a855f7'} onChange={v => updateElement({ arrowColor: v })} /></FormField>
                                    <FormField label={t('elementInspector.arrowSize')}><TextInput type="number" value={String(el.arrowSize || 24)} onChange={e => updateElement({ arrowSize: Number(e.target.value) })} min="12" max="48" /></FormField>
                                </div>
                                <FormField label={t('elementInspector.background')}>
                                    <ColorInput value={el.backgroundColor?.replace(/rgba?\([^)]+\)/, '#1e293b') || '#1e293b'} onChange={hex => { const rgba = `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, 0.8)`; updateElement({ backgroundColor: rgba }); }} />
                                </FormField>
                                <h4 className="font-bold text-xs mt-3 mb-1 text-slate-400">{t('elementInspector.font')}</h4>
                                <FontEditor font={el.font} onFontChange={(prop, value) => updateElement({ font: { ...el.font, [prop]: value } })} />
                            </CollapsibleSection>
                            <CollapsibleSection title={t('elementInspector.advanced')} hint={hasConditions ? 'Has filtering rules' : 'Variable binding & conditional filtering'} badge={hasConditions ? '⚡' : undefined}>
                                <p className="text-[10px] text-slate-500 mb-2">These settings are auto-configured by the wizard. Only edit if you know what you&apos;re doing.</p>
                                <FormField label={t('elementInspector.variableStoresSelection')}>
                                    <Select value={el.variableId} onChange={e => updateElement({ variableId: e.target.value as VNID })}>
                                        <option value="">{t('elementInspector.selectVariableEllipsis')}</option>
                                        {Object.values(project.variables).map(v => { const vi = v as VNVariable; return <option key={vi.id} value={vi.id}>{vi.name} ({vi.type})</option>; })}
                                    </Select>
                                </FormField>
                                <h4 className="font-bold text-xs mt-3 mb-1 text-slate-400">{t('elementInspector.conditionalFiltering')}</h4>
                                <p className="text-[10px] text-slate-500 mb-2">Show/hide assets based on other selections. E.g., only show certain hairstyles when a specific body type is selected.</p>
                                {el.assetConditions && el.assetConditions.length > 0 ? (
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {el.assetConditions.map((assetCond, condIndex) => {
                                            const asset = layer?.assets[assetCond.assetId];
                                            return (
                                                <div key={condIndex} className="p-2 bg-slate-800 rounded border border-slate-600">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-xs font-medium text-purple-300">{asset?.name || assetCond.assetId}</span>
                                                        <button onClick={() => { const newConditions = el.assetConditions!.filter((_, i) => i !== condIndex); updateElement({ assetConditions: newConditions.length > 0 ? newConditions : undefined }); }} className="text-red-400 hover:text-red-300 text-[10px]">{t('elementInspector.remove')}</button>
                                                    </div>
                                                    {assetCond.conditions.length === 0 && <div className="text-[10px] text-slate-500 italic">{t('elementInspector.alwaysVisible')}</div>}
                                                    {assetCond.conditions.map((cond, subIndex) => (
                                                        <div key={subIndex} className="flex gap-1 items-center mb-1 text-xs">
                                                            <Select value={cond.variableId} onChange={e => { const newConditions = [...el.assetConditions!]; newConditions[condIndex] = { ...newConditions[condIndex], conditions: newConditions[condIndex].conditions.map((c, i) => i === subIndex ? { ...c, variableId: e.target.value as VNID } : c) }; updateElement({ assetConditions: newConditions }); }} className="flex-1 text-xs">
                                                                <option value="">{t('elementInspector.variableEllipsis')}</option>
                                                                {Object.values(project.variables).map(v => { const vi = v as VNVariable; return <option key={vi.id} value={vi.id}>{vi.name}</option>; })}
                                                            </Select>
                                                            <span className="text-slate-500">=</span>
                                                            <TextInput value={cond.value} onChange={e => { const newConditions = [...el.assetConditions!]; newConditions[condIndex] = { ...newConditions[condIndex], conditions: newConditions[condIndex].conditions.map((c, i) => i === subIndex ? { ...c, value: e.target.value } : c) }; updateElement({ assetConditions: newConditions }); }} placeholder="value" className="w-20 text-xs" />
                                                            <button onClick={() => { const newConditions = [...el.assetConditions!]; newConditions[condIndex] = { ...newConditions[condIndex], conditions: newConditions[condIndex].conditions.filter((_, i) => i !== subIndex) }; updateElement({ assetConditions: newConditions }); }} className="text-red-400 hover:text-red-300 px-1">×</button>
                                                        </div>
                                                    ))}
                                                    <button onClick={() => { const newConditions = [...el.assetConditions!]; const firstVarId = Object.keys(project.variables)[0] || ''; newConditions[condIndex] = { ...newConditions[condIndex], conditions: [...newConditions[condIndex].conditions, { variableId: firstVarId as VNID, value: '' }] }; updateElement({ assetConditions: newConditions }); }} className="text-[10px] text-purple-400 hover:text-purple-300 mt-1">{t('elementInspector.addRule')}</button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-slate-500 italic">{t('elementInspector.noFilteringRules')}</p>
                                )}
                                <div className="flex gap-2 mt-2">
                                    <Select value="" onChange={e => { const assetId = e.target.value as VNID; if (!assetId) return; if ((el.assetConditions || []).some(c => c.assetId === assetId)) return; updateElement({ assetConditions: [...(el.assetConditions || []), { assetId, conditions: [] }] }); }} className="flex-1 text-xs">
                                        <option value="">{t('elementInspector.addRuleForAsset')}</option>
                                        {layer && Object.values(layer.assets).filter(a => el.assetIds.includes((a as VNLayerAsset).id)).map(a => { const asset = a as VNLayerAsset; const has = el.assetConditions?.some(c => c.assetId === asset.id); return <option key={asset.id} value={asset.id} disabled={has}>{asset.name}{has ? ' ✓' : ''}</option>; })}
                                    </Select>
                                    {el.assetConditions && el.assetConditions.length > 0 && (<button onClick={() => updateElement({ assetConditions: undefined })} className="text-[10px] text-red-400 hover:text-red-300 whitespace-nowrap">{t('elementInspector.clearAll')}</button>)}
                                </div>
                                {(el.filterPattern || (el.filterVariableIds && el.filterVariableIds.length > 0)) && (
                                    <>
                                        <h4 className="font-bold text-xs mt-4 mb-1 text-amber-400/80">{t('elementInspector.legacyFilterPattern')}</h4>
                                        <p className="text-[10px] text-slate-500 mb-1">{t('elementInspector.legacyFilterNote')}</p>
                                        <FormField label={t('elementInspector.filterVariables')}>
                                            <div className="flex flex-col gap-1">
                                                {(el.filterVariableIds || []).map((varId, index) => (
                                                    <div key={index} className="flex gap-1 items-center">
                                                        <Select value={varId} onChange={e => { const newIds = [...(el.filterVariableIds || [])]; newIds[index] = e.target.value as VNID; updateElement({ filterVariableIds: newIds }); }} className="flex-1 text-xs">
                                                            <option value="">{t('elementInspector.variableEllipsis')}</option>
                                                            {Object.values(project.variables).filter(v => (v as VNVariable).type === 'string').map(v => { const vi = v as VNVariable; return <option key={vi.id} value={vi.id}>{vi.name}</option>; })}
                                                        </Select>
                                                        <button onClick={() => { const newIds = (el.filterVariableIds || []).filter((_, i) => i !== index); updateElement({ filterVariableIds: newIds.length > 0 ? newIds : undefined }); }} className="text-red-400 text-xs px-1">×</button>
                                                    </div>
                                                ))}
                                                <button onClick={() => updateElement({ filterVariableIds: [...(el.filterVariableIds || []), Object.keys(project.variables)[0] || ''] })} className="text-[10px] text-purple-400">{t('elementInspector.add')}</button>
                                            </div>
                                        </FormField>
                                        <FormField label={t('elementInspector.pattern')}>
                                            <TextInput value={el.filterPattern || ''} onChange={e => updateElement({ filterPattern: e.target.value })} placeholder="{var1}_{var2}" />
                                        </FormField>
                                    </>
                                )}
                            </CollapsibleSection>
                        </div>
                    </>,
                };
            }
            case UIElementType.Timer: {
                const el = element as any;
                return {
                    content: (
                        <div className="flex flex-col gap-2">
                            <FormField label={t('elementInspector.timerDelay', 'Delay (seconds)')}>
                                <TextInput type="number" min={0} step={0.5} value={el.durationSeconds ?? 3} onChange={e => updateElement({ durationSeconds: Math.max(0, parseFloat(e.target.value) || 0) } as any)} />
                            </FormField>
                            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                                <input type="checkbox" checked={!!el.showCountdown} onChange={e => updateElement({ showCountdown: e.target.checked } as any)} />
                                {t('elementInspector.timerShowCountdown', 'Show a visible countdown')}
                            </label>
                            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                                <input type="checkbox" checked={!!el.loop} onChange={e => updateElement({ loop: e.target.checked } as any)} />
                                {t('elementInspector.timerLoop', 'Repeat every interval')}
                            </label>
                            <p className="text-[11px] text-[var(--text-muted)]">{t('elementInspector.timerHint', 'When this screen opens, the timer waits the delay, then runs its actions (add them in the Logic tab).')}</p>
                        </div>
                    ),
                    logic: <UIActionsListEditor actions={el.actions || []} project={project} onChange={acts => updateElement({ actions: acts } as any)} label={t('elementInspector.timerActions', 'When the timer elapses, run')} />,
                };
            }
            case UIElementType.Item: {
                const el = element as any;
                const items = Object.values(project.items || {}) as any[];
                const mode = el.mode || 'display';
                return {
                    content: (
                        <div className="flex flex-col gap-2">
                            <FormField label={t('elementInspector.itemWhich', 'Item')}>
                                <Select value={el.itemId || ''} onChange={e => updateElement({ itemId: (e.target.value || null) } as any)}>
                                    <option value="">{t('elementInspector.itemSelect', 'Pick an item…')}</option>
                                    {items.map((it: any) => <option key={it.id} value={it.id}>{it.name}</option>)}
                                </Select>
                            </FormField>
                            {items.length === 0 && <p className="text-[11px] text-amber-400">{t('elementInspector.itemNone', 'No items yet — create them in the Systems tab first.')}</p>}
                            <FormField label={t('elementInspector.itemMode', 'What it does')}>
                                <Select value={mode} onChange={e => updateElement({ mode: e.target.value } as any)}>
                                    <option value="display">{t('elementInspector.itemModeDisplay', 'Display — show something the player owns')}</option>
                                    <option value="pickup">{t('elementInspector.itemModePickup', 'Pickup — click to take it')}</option>
                                </Select>
                            </FormField>
                            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                                <input type="checkbox" checked={!!el.showName} onChange={e => updateElement({ showName: e.target.checked } as any)} />
                                {t('elementInspector.itemShowName', "Show the item's name")}
                            </label>
                            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                                <input type="checkbox" checked={!!el.showCount} onChange={e => updateElement({ showCount: e.target.checked } as any)} />
                                {t('elementInspector.itemShowCount', 'Show how many the player has (×N)')}
                            </label>
                            {mode === 'display' && (
                                <>
                                    <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                                        <input type="checkbox" checked={!!el.onlyWhileOwned} onChange={e => updateElement({ onlyWhileOwned: e.target.checked } as any)} />
                                        {t('elementInspector.itemOnlyOwned', 'Only show while the player has it')}
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                                        <input type="checkbox" checked={!!el.draggable} onChange={e => updateElement({ draggable: e.target.checked } as any)} />
                                        {t('elementInspector.itemDraggable', 'Players can drag it onto hot spots')}
                                    </label>
                                    {el.draggable && <p className="text-[11px] text-[var(--text-muted)]">{t('elementInspector.itemDragHint', "A hot spot accepts it when its accept tag matches the item's drag tag (set on the item, in Systems). Dropping uses the item — its use effect runs.")}</p>}
                                </>
                            )}
                            {mode === 'pickup' && (
                                <>
                                    <FormField label={t('elementInspector.itemPickupQty', 'How many the click gives')}>
                                        <TextInput type="number" min={1} step={1} value={el.pickupQuantity ?? 1} onChange={e => updateElement({ pickupQuantity: Math.max(1, parseInt(e.target.value) || 1) } as any)} />
                                    </FormField>
                                    <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                                        <input type="checkbox" checked={el.pickupOnce ?? true} onChange={e => updateElement({ pickupOnce: e.target.checked } as any)} />
                                        {t('elementInspector.itemPickupOnce', 'Once taken, it stays gone (saved with the game)')}
                                    </label>
                                </>
                            )}
                        </div>
                    ),
                    logic: <UIActionsListEditor actions={el.actions || []} project={project} onChange={acts => updateElement({ actions: acts } as any)} label={mode === 'pickup' ? t('elementInspector.itemPickupActions', 'When picked up, also run') : t('elementInspector.itemClickActions', 'When clicked, run')} />,
                };
            }
            case UIElementType.Custom: {
                const el = element as any;
                const def = pluginManager.getUIElementType(el.pluginType);
                const setProp = (k: string, v: any) => updateElement({ props: { ...(el.props || {}), [k]: v } } as any);
                if (!def) {
                    return { content: <p className="text-xs text-amber-400">{t('elementInspector.customMissing', "This custom element's extension isn't installed or enabled.")}</p> };
                }
                const flds = def.inspector || [];
                return {
                    content: (
                        <div className="flex flex-col gap-2">
                            {flds.length === 0 && <p className="text-xs text-[var(--text-muted)]">{t('elementInspector.customNoProps', 'This element has no editable properties.')}</p>}
                            {flds.map((f: any) => {
                                const val = (el.props || {})[f.key];
                                return (
                                    <FormField key={f.key} label={f.label}>
                                        {f.type === 'textarea' ? (
                                            <textarea value={String(val ?? '')} onChange={e => setProp(f.key, e.target.value)} className="w-full bg-[var(--bg-primary)] text-[var(--text-primary)] px-2 py-1 rounded border border-[var(--border-subtle)] text-xs outline-none" style={{ minHeight: 60, resize: 'vertical' }} />
                                        ) : f.type === 'number' ? (
                                            <TextInput type="number" value={Number(val ?? 0)} onChange={e => setProp(f.key, parseFloat(e.target.value) || 0)} />
                                        ) : f.type === 'boolean' ? (
                                            <input type="checkbox" checked={!!val} onChange={e => setProp(f.key, e.target.checked)} className="cursor-pointer" />
                                        ) : f.type === 'color' ? (
                                            <ColorInput value={String(val || '#ffffff')} onChange={v => setProp(f.key, v)} />
                                        ) : f.type === 'select' ? (
                                            <Select value={String(val ?? '')} onChange={e => setProp(f.key, e.target.value)}>
                                                {(f.options || []).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </Select>
                                        ) : (
                                            <TextInput value={String(val ?? '')} onChange={e => setProp(f.key, e.target.value)} />
                                        )}
                                    </FormField>
                                );
                            })}
                        </div>
                    ),
                };
            }
            default:
                return {};
        }
    };

    const groups = getTypeGroups();
    switch (groupId) {
        case 'content': return <>{groups.content ?? null}</>;
        case 'transform': return renderTransformFields();
        case 'appearance': return <>{renderOpacityField()}{groups.appearance}</>;
        case 'effects': return <>{groups.effects ?? null}</>;
        case 'media': return <>{groups.media ?? null}</>;
        case 'animation': return renderAnimationFields();
        case 'audio': return <>{groups.audio ?? null}</>;
        case 'logic': return <>{groups.logic ?? null}</>;
        case 'conditions': return renderConditionsFields();
        default: return null;
    }
};

export default ElementGroupFields;
