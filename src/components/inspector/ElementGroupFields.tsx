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
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { VNTextAlign } from '../../types/shared';
import {
    VNUIElement, UIElementType, UIButtonElement, UITextElement, UIImageElement, UISaveSlotGridElement,
    UISettingsSliderElement, UISettingsToggleElement, UICharacterPreviewElement, UITextInputElement,
    UIDropdownElement, UICheckboxElement, UIAssetCyclerElement, UICGGalleryElement, DropdownOption,
    GameSetting, GameToggleSetting,
} from '../../features/ui/types';
import { VNVariable } from '../../features/variables/types';
import { VNCharacter, VNCharacterLayer, VNLayerAsset } from '../../features/character/types';
import { FormField, TextInput, Select, ColorInput } from '../ui/Form';
import { TrashIcon } from '../icons';
import FontEditor from '../ui/FontEditor';
import ActionEditor from '../menu-editor/ActionEditor';
import AssetSelector from '../ui/AssetSelector';
import ConditionsEditor from '../ui/ConditionsEditor';
import CollapsibleSection from '../ui/CollapsibleSection';
import { InspectorGroupId, GROUP_ORDER } from './inspectorGroups';
import { LayerControl, ParallaxDepthControl } from './LayerControl';

export type UpdateElement = (updates: Partial<VNUIElement>) => void;

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
            return n ? `${n} rule${n === 1 ? '' : 's'}` : 'none';
        }
        default: return undefined;
    }
}

interface Props {
    groupId: InspectorGroupId;
    element: VNUIElement;
    project: VNProject;
    updateElement: UpdateElement;
}

/** Renders the fields for one (element, group) pair. */
export const ElementGroupFields: React.FC<Props> = ({ groupId, element, project, updateElement }) => {
    const { t } = useTranslation('ui');

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
        <FormField label={t('elementInspector.opacity', { pct: Math.round((element.opacity ?? 1) * 100) })}>
            <input type="range" min="0" max="1" step="0.01" value={element.opacity ?? 1} onChange={e => updateElement({ opacity: parseFloat(e.target.value) })} className="w-full accent-purple-500" />
        </FormField>
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
            </FormField>
        </>
    );
    const renderConditionsFields = () => (
        <>
            <p className="text-[10px] text-slate-500 mb-1">{t('elementInspector.visibilityNote')}</p>
            <ConditionsEditor conditions={element.conditions} project={project} onChange={(cs) => updateElement({ conditions: cs })} />
            <p className="text-[10px] text-slate-500 mt-3 mb-1">{t('elementInspector.disabledNote')}</p>
            <ConditionsEditor conditions={element.disabledConditions} project={project} onChange={(cs) => updateElement({ disabledConditions: cs })} />
        </>
    );

    // Shared "additional actions" list editor (Button / Dropdown / Checkbox / Settings*).
    const renderActionsList = (actions: any[] | undefined): React.ReactNode => (
        <div className="space-y-2">
            {(actions || []).map((action, idx) => (
                <div key={idx} className="p-2 bg-slate-800 rounded space-y-2">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-slate-400">Action {idx + 1}</span>
                        <button onClick={() => updateElement({ actions: (actions || []).filter((_, i) => i !== idx) } as any)} className="p-1 hover:bg-red-600 rounded transition-colors" title={t('elementInspector.removeAction')}><TrashIcon className="w-3 h-3" /></button>
                    </div>
                    <ActionEditor action={action} onActionChange={updatedAction => { const na = [...(actions || [])]; na[idx] = updatedAction; updateElement({ actions: na } as any); }} />
                </div>
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
                        <FormField label="Text Padding (%)">
                            <TextInput type="number" min={0} max={50} step={1} value={el.paddingX ?? 0} onChange={e => updateElement({ paddingX: Math.max(0, Number(e.target.value) || 0) })} />
                        </FormField>
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
                                <TextInput type="color" value={typeof bgValue === 'string' && bgValue.startsWith('#') ? bgValue : '#000000'} onChange={e => updateElement({ background: { type: 'color', value: e.target.value }, image: null })} className="p-1 h-10" />
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
                        <p className="text-xs text-slate-400 mt-1">{t('elementInspector.coverHint')}</p>
                    </>,
                };
            }
            case UIElementType.SaveSlotGrid: {
                const el = element as UISaveSlotGridElement;
                return {
                    content: <>
                        <FormField label={t('elementInspector.slotCount')}><TextInput type="number" value={el.slotCount} onChange={e => updateElement({ slotCount: parseInt(e.target.value) || 1 })} /></FormField>
                        <FormField label={t('elementInspector.emptySlotText')}><TextInput value={el.emptySlotText} onChange={e => updateElement({ emptySlotText: e.target.value })} /></FormField>
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
                        </div>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.navigationButtons')}</h4>
                        <FormField label={t('elementInspector.prevButtonText')}><TextInput value={el.prevButtonText ?? '◀ Prev'} onChange={e => updateElement({ prevButtonText: e.target.value })} /></FormField>
                        <FormField label={t('elementInspector.nextButtonText')}><TextInput value={el.nextButtonText ?? 'Next ▶'} onChange={e => updateElement({ nextButtonText: e.target.value })} /></FormField>
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
                            <FormField label={t('elementInspector.background')}><TextInput type="color" value={el.backgroundColor || '#1e293b'} onChange={e => updateElement({ backgroundColor: e.target.value })} /></FormField>
                            <FormField label={t('elementInspector.border')}><TextInput type="color" value={el.borderColor || '#475569'} onChange={e => updateElement({ borderColor: e.target.value })} /></FormField>
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
                            <FormField label={t('elementInspector.background')}><input type="color" className="w-full" value={el.backgroundColor || '#1e293b'} onChange={e => updateElement({ backgroundColor: e.target.value })} /></FormField>
                            <FormField label={t('elementInspector.border')}><input type="color" className="w-full" value={el.borderColor || '#475569'} onChange={e => updateElement({ borderColor: e.target.value })} /></FormField>
                            <FormField label={t('elementInspector.hover')}><input type="color" className="w-full" value={el.hoverColor || '#334155'} onChange={e => updateElement({ hoverColor: e.target.value })} /></FormField>
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
                            <FormField label={t('elementInspector.checkboxColor')}><input type="color" className="w-full" value={el.checkboxColor || '#3b82f6'} onChange={e => updateElement({ checkboxColor: e.target.value })} /></FormField>
                            <FormField label={t('elementInspector.labelColor')}><input type="color" className="w-full" value={el.labelColor || '#f1f5f9'} onChange={e => updateElement({ labelColor: e.target.value })} /></FormField>
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
                        <FormField label={t('elementInspector.columns')}><TextInput type="number" min="2" max="8" value={String(el.columns || 4)} onChange={e => updateElement({ columns: parseInt(e.target.value, 10) || 4 })} /></FormField>
                        <FormField label={t('elementInspector.gapPx')}><TextInput type="number" min="0" max="32" value={String(el.gap || 8)} onChange={e => updateElement({ gap: parseInt(e.target.value, 10) || 8 })} /></FormField>
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
                        <FormField label={t('elementInspector.borderColor')}><input type="color" className="w-full" value={el.thumbnailBorderColor || '#4D3273'} onChange={e => updateElement({ thumbnailBorderColor: e.target.value })} /></FormField>
                        <FormField label={t('elementInspector.borderRadiusPx')}><TextInput type="number" min="0" max="32" value={String(el.thumbnailBorderRadius || 8)} onChange={e => updateElement({ thumbnailBorderRadius: parseInt(e.target.value, 10) || 8 })} /></FormField>
                        <FormField label={t('elementInspector.backgroundColor')}><input type="color" className="w-full" value={el.backgroundColor || '#0f172a'} onChange={e => updateElement({ backgroundColor: e.target.value })} /></FormField>
                        <h4 className="font-bold my-2 text-slate-400 text-xs">{t('elementInspector.lockedEntries')}</h4>
                        <FormField label={t('elementInspector.lockedBackground')}><input type="color" className="w-full" value={el.lockedColor || '#1e293b'} onChange={e => updateElement({ lockedColor: e.target.value })} /></FormField>
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
            case UIElementType.CharacterPreview: {
                const el = element as UICharacterPreviewElement;
                const character = el.characterId ? project.characters[el.characterId] : null;
                const stringVariables = Object.values(project.variables).filter((v): v is VNVariable => (v as VNVariable).type === 'string');
                const layerCount = character ? Object.keys(character.layers).length : 0;
                const mappedCount = character ? Object.values(el.layerVariableMap || {}).filter(Boolean).length : 0;
                return {
                    content: <>
                        <p className="text-xs text-slate-400 mb-3">{t('elementInspector.charPreviewIntro')}</p>
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
                                    <FormField label={t('elementInspector.arrowColor')}><input type="color" className="w-full" value={el.arrowColor || '#a855f7'} onChange={e => updateElement({ arrowColor: e.target.value })} /></FormField>
                                    <FormField label={t('elementInspector.arrowSize')}><TextInput type="number" value={String(el.arrowSize || 24)} onChange={e => updateElement({ arrowSize: Number(e.target.value) })} min="12" max="48" /></FormField>
                                </div>
                                <FormField label={t('elementInspector.background')}>
                                    <input type="color" className="w-full" value={el.backgroundColor?.replace(/rgba?\([^)]+\)/, '#1e293b') || '#1e293b'} onChange={e => { const hex = e.target.value; const rgba = `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, 0.8)`; updateElement({ backgroundColor: rgba }); }} />
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
