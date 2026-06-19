import React from 'react';
import { useTranslation } from 'react-i18next';
import Panel from '../ui/Panel';
import { useProject } from '../../contexts/ProjectContext';
import { VNID } from '../../types';
import { VNUIScreen, VNScreenCategory, VNHotZoneWinCondition, VNUIElement, UIElementType, UIHotSpotElement, UIImageElement, VNScreenBackgroundLayer } from '../../features/ui/types';
import { getScreenCategory, getScreenCategoryColor, SCREEN_CATEGORY_ORDER, SCREEN_CATEGORY_LABEL_KEY } from '../../utils/screenCategory';
import { FormField, TextInput, Select, ColorInput, RangeInput } from '../ui/Form';
import AssetSelector from '../ui/AssetSelector';
import WinConditionEditor from '../ui/WinConditionEditor';
import UIActionsListEditor from '../ui/UIActionsListEditor';
import { isInteractiveElement } from '../../utils/interactiveElements';
import { upsertOverlayEffect, type VNScreenOverlayEffectType, type VNEffectParams } from '../../types';
import CollapsibleSection from '../ui/CollapsibleSection';

const newInteractiveId = (prefix: string): VNID =>
    `${prefix}-${Math.random().toString(36).substring(2, 9)}` as VNID;

/** Small reusable slider for 0..1 effect params */
const ParamSlider: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange }) => (
    <div className="mt-1">
        <div className="text-xs text-slate-400 mb-0.5 flex justify-between">
            <span>{label}</span>
            <span>{Math.round(value * 100)}%</span>
        </div>
        <RangeInput min="0" max="1" step="0.01" value={value}
            onChange={e => onChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500" />
    </div>
);

/** Click-to-capture keyboard shortcut mapper. Click, then press a key; Esc cancels. */
const HotkeyCapture: React.FC<{ value?: string; onChange: (key: string | undefined) => void; t: any }> = ({ value, onChange, t }) => {
    const [listening, setListening] = React.useState(false);
    React.useEffect(() => {
        if (!listening) return;
        const onKey = (e: KeyboardEvent) => {
            e.preventDefault(); e.stopPropagation();
            if (e.key === 'Escape') { setListening(false); return; }
            if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return; // wait for a real key
            onChange(e.key);
            setListening(false);
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [listening, onChange]);
    const display = (k?: string) => !k ? '' : (k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);
    return (
        <div className="flex items-center gap-2">
            <button type="button" onClick={() => setListening(l => !l)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${listening ? 'bg-sky-500/20 border-sky-500 text-sky-300 animate-pulse' : 'bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--border-default)]'}`}>
                {listening ? t('screenInspector.openHotkeyPress') : (value ? `${t('screenInspector.openHotkeyKey')}: ${display(value)}` : t('screenInspector.openHotkeySet'))}
            </button>
            {value && !listening && (
                <button type="button" onClick={() => onChange(undefined)} className="text-xs text-red-400 hover:text-red-300">{t('screenInspector.openHotkeyClear')}</button>
            )}
        </div>
    );
};

const ScreenInspector: React.FC<{ screenId: VNID }> = ({ screenId }) => {
    const { t } = useTranslation('ui');
    const { project, dispatch } = useProject();
    const screen = project.uiScreens[screenId];

    if (!screen) return <Panel title={t('screenInspector.propertiesTitle')}>{t('screenInspector.notFound')}</Panel>;

    const updateScreen = (updates: Partial<VNUIScreen>) => {
        dispatch({ type: 'UPDATE_UI_SCREEN', payload: { screenId, updates }});
    };

    const isSpecialScreen = Object.values(project.ui).includes(screenId);

    // Overlay/open-behavior controls only make sense for HUD or Overlay screens — gate the whole
    // section behind the category to cut clutter on menus/system/regular screens. Safety: keep it
    // visible if the screen already has any overlay setting, so nothing gets orphaned/hidden.
    const screenCategory = getScreenCategory(screen, project);
    const hasOverlaySettings = !!(screen.passThrough || screen.hudAboveDialogue || screen.pauseSceneWhileOpen
        || screen.backdropOpacity || screen.backdropBlur
        || screen.resetElementVisibilityOnOpen === false
        || (screen.onCloseBehavior && screen.onCloseBehavior !== 'default')
        || (screen.onCloseActions && screen.onCloseActions.length));
    const showOpenBehavior = screenCategory === 'hud' || screenCategory === 'overlay' || hasOverlaySettings;

    const currentEffects = screen.effects ?? [];
    const getIntensity = (type: VNScreenOverlayEffectType): number => {
        const e = currentEffects.find(x => x.type === type);
        return e ? e.intensity : 0;
    };
    const getSnowAshVariant = (): 'snow' | 'ash' => {
        const e = currentEffects.find(x => x.type === 'snowAsh');
        return (e?.variant as any) === 'ash' ? 'ash' : 'snow';
    };
    const getColor = (type: VNScreenOverlayEffectType): string => {
        const e = currentEffects.find(x => x.type === type);
        return e?.color ?? '';
    };
    const getParams = (type: VNScreenOverlayEffectType): VNEffectParams => {
        const e = currentEffects.find(x => x.type === type);
        return e?.params ?? {};
    };
    const setEffect = (type: VNScreenOverlayEffectType, intensity: number, variant?: 'snow' | 'ash', color?: string, params?: VNEffectParams) => {
        updateScreen({
            effects: upsertOverlayEffect(currentEffects, {
                type,
                intensity,
                variant,
                color,
                params,
            })
        });
    };

    // Additional background planes (multi-plane parallax backdrops).
    const addlBgs = screen.additionalBackgrounds || [];
    const updateAddlBg = (id: VNID, patch: Partial<VNScreenBackgroundLayer>) =>
        updateScreen({ additionalBackgrounds: addlBgs.map(b => b.id === id ? { ...b, ...patch } : b) });
    const addAddlBg = () =>
        updateScreen({ additionalBackgrounds: [...addlBgs, {
            id: newInteractiveId('sbg'),
            background: { type: 'image', assetId: null },
            layer: addlBgs.length ? Math.max(...addlBgs.map(b => b.layer ?? 0)) + 1 : 1,
        }] });
    const removeAddlBg = (id: VNID) =>
        updateScreen({ additionalBackgrounds: addlBgs.filter(b => b.id !== id) });

    return (
        <Panel title={t('screenInspector.title')} className="w-96 flex-shrink-0">
            <div className="flex-grow overflow-y-auto pr-1 space-y-2">
                <FormField label={t('screenInspector.screenName')}>
                    <TextInput value={screen.name} onChange={e => updateScreen({ name: e.target.value })} disabled={isSpecialScreen} />
                </FormField>

                <FormField label={t('screenInspector.category')}>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getScreenCategoryColor(screen, project) }} />
                        <Select value={screen.category || ''} onChange={e => updateScreen({ category: (e.target.value || undefined) as VNScreenCategory | undefined })} className="flex-1">
                            <option value="">{t('screenCategory.auto', { name: t(SCREEN_CATEGORY_LABEL_KEY[getScreenCategory(screen, project)]) })}</option>
                            {SCREEN_CATEGORY_ORDER.map(c => <option key={c} value={c}>{t(SCREEN_CATEGORY_LABEL_KEY[c])}</option>)}
                        </Select>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">{t('screenInspector.categoryHint')}</p>
                </FormField>

                <FormField label={t('screenInspector.openHotkey')}>
                    <HotkeyCapture value={screen.openHotkey} onChange={k => updateScreen({ openHotkey: k })} t={t} />
                    <p className="text-[10px] text-slate-500 mt-1">{t('screenInspector.openHotkeyHint')}</p>
                </FormField>

                <CollapsibleSection title={t('screenInspector.background')} defaultOpen>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label={t('screenInspector.type')}>
                             <Select value={screen.background.type} onChange={e => {
                                const newType = e.target.value as 'color' | 'image' | 'video';
                                if (newType === 'color') {
                                    updateScreen({ background: { type: 'color', value: '#000000' }});
                                } else {
                                    updateScreen({ background: { type: newType, assetId: null }});
                                }
                             }}>
                                <option value="color">{t('screenInspector.bgColor')}</option>
                                <option value="image">{t('screenInspector.bgImage')}</option>
                                <option value="video">{t('screenInspector.bgVideo')}</option>
                            </Select>
                        </FormField>
                        {screen.background.type === 'color' ? (
                            <FormField label={t('screenInspector.colorValue')}>
                                <ColorInput value={screen.background.value} onChange={val => updateScreen({ background: { type: 'color', value: val }})} className="p-1 h-10"/>
                            </FormField>
                        ) : (
                             <AssetSelector label={t('screenInspector.asset')} assetType={screen.background.type === 'image' ? 'images' : 'videos'} allowVideo value={screen.background.assetId}
                                onChange={id => {
                                    if (screen.background.type !== 'color') {
                                        updateScreen({ background: { ...screen.background, type: screen.background.type, assetId: id }});
                                    }
                                }} />
                        )}
                    </div>
                    {screen.background.type === 'video' && (
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mt-2">
                            <input type="checkbox" checked={screen.background.loop ?? true}
                                onChange={e => updateScreen({ background: { ...(screen.background as any), loop: e.target.checked } })} />
                            {t('screenInspector.loopVideo')} <span className="text-[10px] text-slate-500">{t('screenInspector.loopVideoHint')}</span>
                        </label>
                    )}
                    {/* Background entry transition (fade/crossfade/dissolve/slide/iris/wipe) */}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <FormField label={t('screenInspector.bgTransition')}>
                            <Select value={screen.backgroundTransition || 'none'}
                                onChange={e => updateScreen({ backgroundTransition: (e.target.value as any) === 'none' ? undefined : e.target.value as any })}>
                                <option value="none">{t('screenInspector.bgTransNone')}</option>
                                <option value="fade">{t('screenInspector.bgTransFade')}</option>
                                <option value="crossfade">{t('screenInspector.bgTransCrossfade')}</option>
                                <option value="dissolve">{t('screenInspector.bgTransDissolve')}</option>
                                <option value="slide">{t('screenInspector.bgTransSlide')}</option>
                                <option value="iris">{t('screenInspector.bgTransIris')}</option>
                                <option value="wipe">{t('screenInspector.bgTransWipe')}</option>
                            </Select>
                        </FormField>
                        {screen.backgroundTransition && screen.backgroundTransition !== 'none' && (
                            <FormField label={t('screenInspector.bgTransDuration')}>
                                <TextInput type="number" min="0" step="50" value={screen.backgroundTransitionDuration ?? 400}
                                    onChange={e => updateScreen({ backgroundTransitionDuration: parseInt(e.target.value, 10) || undefined })} />
                            </FormField>
                        )}
                    </div>
                    {/* Main background layer + parallax depth */}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <FormField label={t('screenInspector.layerN', { n: screen.backgroundLayer ?? 0 })}>
                            <div className="flex items-center gap-1">
                                <button type="button" title={t('screenInspector.sendBackLayer')} onClick={() => updateScreen({ backgroundLayer: (screen.backgroundLayer ?? 0) - 1 || undefined })} className="px-2 py-0.5 text-xs rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)]">↓</button>
                                <input type="number" step="1" value={screen.backgroundLayer ?? 0} onChange={e => { const v = parseInt(e.target.value, 10); updateScreen({ backgroundLayer: Number.isNaN(v) ? undefined : (v || undefined) }); }} className="w-14 text-center bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded px-1 py-0.5 text-xs" />
                                <button type="button" title={t('screenInspector.bringForwardLayer')} onClick={() => updateScreen({ backgroundLayer: (screen.backgroundLayer ?? 0) + 1 || undefined })} className="px-2 py-0.5 text-xs rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)]">↑</button>
                            </div>
                        </FormField>
                        <FormField label={t('screenInspector.depthN', { n: (screen.backgroundParallaxDepth ?? 0).toFixed(2) })}>
                            <RangeInput min="0" max="2" step="0.05" value={screen.backgroundParallaxDepth ?? 0} onChange={e => updateScreen({ backgroundParallaxDepth: parseFloat(e.target.value) || undefined })} className="w-full accent-purple-500" />
                        </FormField>
                    </div>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{t('screenInspector.layerDepthHint')}</p>

                    {/* Additional background planes for multi-plane parallax */}
                    <div className="mt-3 border-t border-slate-700/40 pt-2">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-300">{t('screenInspector.additionalBgs')}</span>
                            <button type="button" onClick={addAddlBg} className="text-xs px-2 py-0.5 rounded bg-purple-600/30 hover:bg-purple-600/50 text-purple-200">{t('screenInspector.addBtn')}</button>
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)] mb-2">{t('screenInspector.additionalBgsHint')}</p>
                        {addlBgs.length === 0 && <p className="text-[10px] text-slate-500 italic">{t('screenInspector.noAdditionalBgs')}</p>}
                        <div className="space-y-2">
                            {addlBgs.map((b, i) => (
                                <div key={b.id} className="rounded border border-slate-700/60 p-2">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[11px] font-semibold text-slate-400">{t('screenInspector.planeN', { n: i + 1 })}</span>
                                        <button type="button" onClick={() => removeAddlBg(b.id)} className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/30 hover:bg-red-600/50 text-red-200">{t('screenInspector.remove')}</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <FormField label={t('screenInspector.type')}>
                                            <Select value={b.background.type} onChange={e => {
                                                const nt = e.target.value as 'color' | 'image' | 'video';
                                                updateAddlBg(b.id, { background: nt === 'color' ? { type: 'color', value: '#000000' } : { type: nt, assetId: null } });
                                            }}>
                                                <option value="color">{t('screenInspector.bgColor')}</option>
                                                <option value="image">{t('screenInspector.bgImage')}</option>
                                                <option value="video">{t('screenInspector.bgVideo')}</option>
                                            </Select>
                                        </FormField>
                                        {b.background.type === 'color' ? (
                                            <FormField label={t('screenInspector.colorValue')}>
                                                <ColorInput value={b.background.value} onChange={val => updateAddlBg(b.id, { background: { type: 'color', value: val } })} className="p-1 h-10" />
                                            </FormField>
                                        ) : (
                                            <AssetSelector label={t('screenInspector.asset')} assetType={b.background.type === 'image' ? 'images' : 'videos'} allowVideo value={b.background.assetId}
                                                onChange={id => { if (b.background.type !== 'color') updateAddlBg(b.id, { background: { ...b.background, type: b.background.type, assetId: id } }); }} />
                                        )}
                                    </div>
                                    {b.background.type === 'video' && (
                                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mt-1">
                                            <input type="checkbox" checked={b.background.loop ?? true}
                                                onChange={e => updateAddlBg(b.id, { background: { ...(b.background as any), loop: e.target.checked } })} />
                                            {t('screenInspector.loopVideo')}
                                        </label>
                                    )}
                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                        <FormField label={t('screenInspector.layerN', { n: b.layer ?? 0 })}>
                                            <div className="flex items-center gap-1">
                                                <button type="button" onClick={() => updateAddlBg(b.id, { layer: (b.layer ?? 0) - 1 })} className="px-2 py-0.5 text-xs rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)]">↓</button>
                                                <input type="number" step="1" value={b.layer ?? 0} onChange={e => { const v = parseInt(e.target.value, 10); updateAddlBg(b.id, { layer: Number.isNaN(v) ? 0 : v }); }} className="w-14 text-center bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded px-1 py-0.5 text-xs" />
                                                <button type="button" onClick={() => updateAddlBg(b.id, { layer: (b.layer ?? 0) + 1 })} className="px-2 py-0.5 text-xs rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)]">↑</button>
                                            </div>
                                        </FormField>
                                        <FormField label={t('screenInspector.depthN', { n: (b.parallaxDepth ?? 0).toFixed(2) })}>
                                            <RangeInput min="0" max="2" step="0.05" value={b.parallaxDepth ?? 0} onChange={e => updateAddlBg(b.id, { parallaxDepth: parseFloat(e.target.value) || undefined })} className="w-full accent-purple-500" />
                                        </FormField>
                                    </div>
                                    <FormField label={t('screenInspector.bgTransition')}>
                                        <Select value={b.transition || 'none'}
                                            onChange={e => updateAddlBg(b.id, { transition: (e.target.value as any) === 'none' ? undefined : e.target.value as any })}>
                                            <option value="none">{t('screenInspector.bgTransNone')}</option>
                                            <option value="fade">{t('screenInspector.bgTransFade')}</option>
                                            <option value="crossfade">{t('screenInspector.bgTransCrossfade')}</option>
                                            <option value="dissolve">{t('screenInspector.bgTransDissolve')}</option>
                                            <option value="slide">{t('screenInspector.bgTransSlide')}</option>
                                            <option value="iris">{t('screenInspector.bgTransIris')}</option>
                                            <option value="wipe">{t('screenInspector.bgTransWipe')}</option>
                                        </Select>
                                    </FormField>
                                </div>
                            ))}
                        </div>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('screenInspector.music')}>
                     <div className="grid grid-cols-2 gap-2">
                        <AssetSelector label={t('screenInspector.track')} assetType="audio" value={screen.music.audioId} onChange={id => updateScreen({ music: { ...screen.music, audioId: id } })} />
                        <FormField label={t('screenInspector.playbackPolicy')}>
                             <Select value={screen.music.policy} onChange={e => updateScreen({ music: { ...screen.music, policy: e.target.value as any }})}>
                                <option value="continue">{t('screenInspector.continue')}</option>
                                <option value="stop">{t('screenInspector.stopOnExit')}</option>
                            </Select>
                        </FormField>
                    </div>
                    <FormField label={t('screenInspector.defaultVolume', { pct: Math.round((screen.music.volume ?? 1) * 100) })}>
                        <RangeInput min="0" max="100" value={Math.round((screen.music.volume ?? 1) * 100)}
                            onChange={e => updateScreen({ music: { ...screen.music, volume: parseInt(e.target.value) / 100 } })}
                            className="w-full accent-purple-500" />
                    </FormField>
                </CollapsibleSection>

                <CollapsibleSection title={t('screenInspector.ambientNoise')}>
                     <div className="grid grid-cols-2 gap-2">
                        <AssetSelector label={t('screenInspector.track')} assetType="audio" value={screen.ambientNoise.audioId} onChange={id => updateScreen({ ambientNoise: { ...screen.ambientNoise, audioId: id } })} />
                        <FormField label={t('screenInspector.playbackPolicy')}>
                             <Select value={screen.ambientNoise.policy} onChange={e => updateScreen({ ambientNoise: { ...screen.ambientNoise, policy: e.target.value as any }})}>
                                <option value="continue">{t('screenInspector.continue')}</option>
                                <option value="stop">{t('screenInspector.stopOnExit')}</option>
                            </Select>
                        </FormField>
                    </div>
                    <FormField label={t('screenInspector.defaultVolume', { pct: Math.round((screen.ambientNoise.volume ?? 1) * 100) })}>
                        <RangeInput min="0" max="100" value={Math.round((screen.ambientNoise.volume ?? 1) * 100)}
                            onChange={e => updateScreen({ ambientNoise: { ...screen.ambientNoise, volume: parseInt(e.target.value) / 100 } })}
                            className="w-full accent-purple-500" />
                    </FormField>
                </CollapsibleSection>

                <CollapsibleSection title={t('screenInspector.transitions')}>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label={t('screenInspector.transitionIn')}>
                            <Select value={screen.transitionIn || 'fade'} onChange={e => updateScreen({ transitionIn: e.target.value as any })}>
                                <option value="none">{t('screenInspector.transNone')}</option>
                                <option value="fade">{t('screenInspector.transFade')}</option>
                                <option value="crossfade">{t('screenInspector.transCrossfade')}</option>
                                <option value="slideUp">{t('screenInspector.transSlideUp')}</option>
                                <option value="slideDown">{t('screenInspector.transSlideDown')}</option>
                                <option value="slideLeft">{t('screenInspector.transSlideLeft')}</option>
                                <option value="slideRight">{t('screenInspector.transSlideRight')}</option>
                            </Select>
                        </FormField>
                        <FormField label={t('screenInspector.transitionOut')}>
                            <Select value={screen.transitionOut || 'fade'} onChange={e => updateScreen({ transitionOut: e.target.value as any })}>
                                <option value="none">{t('screenInspector.transNone')}</option>
                                <option value="fade">{t('screenInspector.transFade')}</option>
                                <option value="crossfade">{t('screenInspector.transCrossfade')}</option>
                                <option value="slideUp">{t('screenInspector.transSlideUp')}</option>
                                <option value="slideDown">{t('screenInspector.transSlideDown')}</option>
                                <option value="slideLeft">{t('screenInspector.transSlideLeft')}</option>
                                <option value="slideRight">{t('screenInspector.transSlideRight')}</option>
                            </Select>
                        </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label={t('screenInspector.fadeInDuration')}>
                            <TextInput type="number" value={screen.transitionInDuration ?? screen.transitionDuration ?? 300} onChange={e => updateScreen({ transitionInDuration: parseInt(e.target.value) || 300 })} />
                        </FormField>
                        <FormField label={t('screenInspector.fadeOutDuration')}>
                            <TextInput type="number" value={screen.transitionOutDuration ?? screen.transitionDuration ?? 300} onChange={e => updateScreen({ transitionOutDuration: parseInt(e.target.value) || 300 })} />
                        </FormField>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('screenInspector.dialogueBox')}>
                    <FormField label={t('screenInspector.showDialogue')}>
                        <input type="checkbox" checked={screen.showDialogue || false} onChange={e => updateScreen({ showDialogue: e.target.checked })} className="w-5 h-5" />
                    </FormField>
                </CollapsibleSection>

                {showOpenBehavior && (
                <CollapsibleSection title={t('screenInspector.overlayBehavior')}>
                    <FormField label={t('screenInspector.passThrough')}>
                        <input
                            type="checkbox"
                            checked={screen.passThrough ?? (screenId === project.ui.gameHudScreenId)}
                            onChange={e => updateScreen({ passThrough: e.target.checked })}
                            className="w-5 h-5"
                        />
                    </FormField>
                    <p className="text-[10px] text-slate-500 -mt-1">{t('screenInspector.passThroughHint')}</p>
                    {(screen.passThrough ?? (screenId === project.ui.gameHudScreenId)) && (
                        <FormField label={t('screenInspector.hudAboveDialogue')}>
                            <input
                                type="checkbox"
                                checked={screen.hudAboveDialogue ?? false}
                                onChange={e => updateScreen({ hudAboveDialogue: e.target.checked || undefined })}
                                className="w-5 h-5"
                            />
                            <p className="text-[10px] text-slate-500 mt-0.5">{t('screenInspector.hudAboveDialogueHint')}</p>
                        </FormField>
                    )}
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <FormField label={t('screenInspector.pauseScene')}>
                        <input type="checkbox" checked={!!screen.pauseSceneWhileOpen} onChange={e => updateScreen({ pauseSceneWhileOpen: e.target.checked || undefined })} className="w-5 h-5" />
                    </FormField>
                    <p className="text-[10px] text-slate-500 -mt-1">{t('screenInspector.pauseSceneHint')}</p>
                    <FormField label={t('screenInspector.resetElementVisibility', 'Reset hidden elements on open')}>
                        <input type="checkbox" checked={screen.resetElementVisibilityOnOpen !== false} onChange={e => updateScreen({ resetElementVisibilityOnOpen: e.target.checked ? undefined : false })} className="w-5 h-5" />
                    </FormField>
                    <p className="text-[10px] text-slate-500 -mt-1">{t('screenInspector.resetElementVisibilityHint', 'On: Show/Hide-Element overrides reset each time the screen opens (a document reopens on page 1). Off: reveals persist across opens (e.g. a map you uncover).')}</p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <FormField label={t('screenInspector.backdropDim')}>
                            <TextInput type="number" min={0} max={1} step={0.05} value={screen.backdropOpacity ?? ''} placeholder="0"
                                onChange={e => updateScreen({ backdropOpacity: e.target.value === '' ? undefined : Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })} />
                        </FormField>
                        <FormField label={t('screenInspector.backdropBlur')}>
                            <TextInput type="number" min={0} step={1} value={screen.backdropBlur ?? ''} placeholder="0"
                                onChange={e => updateScreen({ backdropBlur: e.target.value === '' ? undefined : Math.max(0, parseFloat(e.target.value) || 0) })} />
                        </FormField>
                    </div>
                    <FormField label={t('screenInspector.onClose')}>
                        <Select value={screen.onCloseBehavior || 'default'} onChange={e => updateScreen({ onCloseBehavior: e.target.value === 'default' ? undefined : (e.target.value as VNUIScreen['onCloseBehavior']) })}>
                            <option value="default">{t('screenInspector.onCloseDefault')}</option>
                            <option value="resume">{t('screenInspector.onCloseResume')}</option>
                            <option value="advance">{t('screenInspector.onCloseAdvance')}</option>
                            <option value="runActions">{t('screenInspector.onCloseRunActions')}</option>
                        </Select>
                    </FormField>
                    <p className="text-[10px] text-slate-500 -mt-1">{t('screenInspector.onCloseHint')}</p>
                    {screen.onCloseBehavior === 'runActions' && (
                        <div className="mt-2">
                            <UIActionsListEditor actions={screen.onCloseActions || []} project={project} onChange={actions => updateScreen({ onCloseActions: actions })} label={t('screenInspector.onCloseActions')} />
                        </div>
                    )}
                </CollapsibleSection>
                )}

                <CollapsibleSection title={t('screenInspector.parallax')}>
                    <FormField label={t('screenInspector.parallaxMode')}>
                        <Select
                            value={screen.parallax?.mode || 'off'}
                            onChange={e => {
                                const mode = e.target.value as NonNullable<VNUIScreen['parallax']>['mode'];
                                updateScreen({ parallax: mode === 'off' ? undefined : { ...screen.parallax, mode } });
                            }}
                        >
                            <option value="off">{t('screenInspector.parallaxOff')}</option>
                            <option value="mouse">{t('screenInspector.parallaxMouse')}</option>
                            <option value="camera">{t('screenInspector.parallaxCamera')}</option>
                            <option value="both">{t('screenInspector.parallaxBoth')}</option>
                        </Select>
                    </FormField>
                    {screen.parallax?.mode && screen.parallax.mode !== 'off' && (
                        <FormField label={t('screenInspector.parallaxIntensity', { n: (screen.parallax.intensity ?? 1).toFixed(2) })}>
                            <RangeInput min="0" max="3" step="0.05" value={screen.parallax.intensity ?? 1}
                                onChange={e => updateScreen({ parallax: { ...screen.parallax, intensity: parseFloat(e.target.value) || 0 } })}
                                className="w-full accent-purple-500" />
                        </FormField>
                    )}
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{t('screenInspector.parallaxHint')}</p>
                    {screen.parallax?.mode === 'camera' && (
                        <p className="text-[10px] text-amber-400/80 mt-1">{t('screenInspector.parallaxCameraNote')}</p>
                    )}
                </CollapsibleSection>

                <CollapsibleSection title={t('screenInspector.screenEffects')}>

                {([
                    { type: 'crtScanlines' as const, label: 'CRT Scanlines',
                      extraParams: ['lineSpacing', 'speed'] as const,
                      paramLabels: { lineSpacing: 'Line Spacing', speed: 'Scroll Speed' } },
                    { type: 'chromaticGlitch' as const, label: 'Chromatic Glitch',
                      extraParams: ['chromaticSpread', 'speed'] as const,
                      paramLabels: { chromaticSpread: 'Offset Spread', speed: 'Jitter Speed' } },
                    { type: 'sunbeams' as const, label: 'Undulating Sunbeams', supportsColor: true, defaultColor: '#FFCC66',
                      extraParams: ['spread', 'speed'] as const,
                      paramLabels: { spread: 'Ray Spread', speed: 'Animation Speed' },
                      supportsBlend: true },
                    { type: 'shimmer' as const, label: 'Undulating Shimmer', supportsColor: true, defaultColor: '#FFFFFF',
                      extraParams: ['particleDensity', 'speed'] as const,
                      paramLabels: { particleDensity: 'Particle Density', speed: 'Animation Speed' },
                      supportsBlend: true },
                    { type: 'rain' as const, label: 'Rain', supportsColor: true, defaultColor: '#AADDFF',
                      extraParams: ['windStrength', 'dropLength', 'speed'] as const,
                      paramLabels: { windStrength: 'Wind Strength', dropLength: 'Drop Length', speed: 'Fall Speed' } },
                    { type: 'snowAsh' as const, label: 'Snow / Ash', supportsColor: true, defaultColor: '#FFFFFF',
                      extraParams: ['particleSize', 'windStrength', 'speed'] as const,
                      paramLabels: { particleSize: 'Particle Size', windStrength: 'Wind Strength', speed: 'Fall Speed' } },
                    { type: 'fog' as const, label: t('screenFx.fog'), supportsColor: true, defaultColor: '#CDD2D8',
                      extraParams: ['speed'] as const,
                      paramLabels: { speed: t('screenFx.driftSpeed') } },
                    { type: 'haze' as const, label: t('screenFx.haze'), supportsColor: true, defaultColor: '#E1DED2',
                      extraParams: ['speed'] as const,
                      paramLabels: { speed: t('screenFx.driftSpeed') } },
                    { type: 'smoke' as const, label: t('screenFx.smoke'), supportsColor: true, defaultColor: '#46484C',
                      extraParams: ['speed'] as const,
                      paramLabels: { speed: t('screenFx.riseSpeed') } },
                    { type: 'fireworks' as const, label: t('screenFx.fireworks'), supportsColor: true, defaultColor: '#FFD23B',
                      extraParams: ['speed'] as const,
                      paramLabels: { speed: t('screenFx.launchSpeed') } },
                ] as const).map(({ type, supportsColor, defaultColor, extraParams, supportsBlend }: { type: any; supportsColor?: boolean; defaultColor?: string; extraParams: readonly (keyof VNEffectParams)[]; supportsBlend?: boolean }) => {
                    const intensity = getIntensity(type);
                    const enabled = intensity > 0;
                    const effectColor = getColor(type);
                    const params = getParams(type);
                    const variant = type === 'snowAsh' ? getSnowAshVariant() : undefined;

                    const updateParam = (key: keyof VNEffectParams, val: number | string) => {
                        setEffect(type, intensity, variant, effectColor || undefined, { ...params, [key]: val });
                    };

                    return (
                        <div key={type} className="mb-3">
                            <label className="flex items-center gap-2 text-sm text-slate-200">
                                <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setEffect(type, 0.5, type === 'snowAsh' ? getSnowAshVariant() : undefined, supportsColor ? defaultColor : undefined);
                                        } else {
                                            setEffect(type, 0);
                                        }
                                    }}
                                />
                                <span>{t('screenInspector.effects.' + type)}</span>
                            </label>

                            {enabled && (
                                <>
                                    <div className="mt-2">
                                        <div className="text-xs text-slate-300 mb-1 flex justify-between">
                                            <span>{t('screenInspector.intensity')}</span>
                                            <span>{Math.round(intensity * 100)}%</span>
                                        </div>
                                        <RangeInput
                                            min="0"
                                            max="1"
                                            step="0.01"
                                            value={intensity}
                                            onChange={(e) => setEffect(type, parseFloat(e.target.value), variant, effectColor || undefined, params)}
                                            className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-sky-500"
                                        />
                                    </div>

                                    {/* Per-effect granular sliders */}
                                    <div className="mt-1 pl-2 border-l border-slate-700">
                                        {extraParams.map(pKey => (
                                            <ParamSlider
                                                key={pKey}
                                                label={t('screenInspector.params.' + type + '.' + pKey)}
                                                value={typeof params[pKey] === 'number' ? (params[pKey] as number) : 0.5}
                                                onChange={v => updateParam(pKey, v)}
                                            />
                                        ))}

                                        {supportsBlend && (
                                            <div className="mt-1">
                                                <div className="text-xs text-slate-400 mb-0.5">{t('screenInspector.blendMode')}</div>
                                                <Select
                                                    value={params.blendMode || (type === 'sunbeams' ? 'screen' : 'overlay')}
                                                    onChange={e => updateParam('blendMode', e.target.value)}
                                                >
                                                    <option value="screen">{t('screenInspector.blendScreen')}</option>
                                                    <option value="overlay">{t('screenInspector.blendOverlay')}</option>
                                                    <option value="soft-light">{t('screenInspector.blendSoftLight')}</option>
                                                    <option value="normal">{t('screenInspector.blendNormal')}</option>
                                                </Select>
                                            </div>
                                        )}

                                        {/* Shimmer-specific controls */}
                                        {type === 'shimmer' && (
                                            <>
                                                <div className="mt-1">
                                                    <div className="text-xs text-slate-400 mb-0.5">{t('screenInspector.side')}</div>
                                                    <Select
                                                        value={(params as any).shimmerSide || 'full'}
                                                        onChange={e => updateParam('shimmerSide' as any, e.target.value)}
                                                    >
                                                        <option value="full">{t('screenInspector.sideFull')}</option>
                                                        <option value="left">{t('screenInspector.sideLeft')}</option>
                                                        <option value="right">{t('screenInspector.sideRight')}</option>
                                                    </Select>
                                                </div>
                                                <div className="mt-1">
                                                    <div className="text-xs text-slate-400 mb-0.5">{t('screenInspector.direction')}</div>
                                                    <Select
                                                        value={(params as any).shimmerDirection || 'up'}
                                                        onChange={e => updateParam('shimmerDirection' as any, e.target.value)}
                                                    >
                                                        <option value="up">{t('screenInspector.driftUp')}</option>
                                                        <option value="down">{t('screenInspector.driftDown')}</option>
                                                    </Select>
                                                </div>
                                                <label className="flex items-center gap-2 text-xs text-slate-300 mt-1 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!(params as any).shimmerParticlesOnly}
                                                        onChange={e => updateParam('shimmerParticlesOnly' as any, e.target.checked as any)}
                                                    />
                                                    {t('screenInspector.particlesOnly')}
                                                </label>
                                            </>
                                        )}
                                    </div>

                                    {supportsColor && (
                                        <div className="mt-2">
                                            <div className="text-xs text-slate-300 mb-1">{t('screenInspector.color')}</div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={effectColor || defaultColor}
                                                    onChange={(e) => setEffect(type, intensity, variant, e.target.value, params)}
                                                    className="w-10 h-8 p-0 border-0 rounded cursor-pointer"
                                                />
                                                <input
                                                    type="text"
                                                    value={effectColor || defaultColor}
                                                    onChange={(e) => setEffect(type, intensity, variant, e.target.value, params)}
                                                    placeholder={defaultColor}
                                                    className="flex-1 px-2 py-1 text-sm bg-slate-700 border border-slate-600 rounded"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setEffect(type, intensity, variant, defaultColor, params)}
                                                    className="px-2 py-1 text-xs bg-slate-600 hover:bg-slate-500 rounded"
                                                    title={t('screenInspector.resetColorTitle')}
                                                >
                                                    {t('screenInspector.reset')}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {type === 'snowAsh' && (
                                        <FormField label={t('screenInspector.mode')}>
                                            <Select
                                                value={getSnowAshVariant()}
                                                onChange={(e) => setEffect('snowAsh', intensity, e.target.value as any, effectColor || undefined, params)}
                                            >
                                                <option value="snow">{t('screenInspector.snow')}</option>
                                                <option value="ash">{t('screenInspector.ash')}</option>
                                            </Select>
                                        </FormField>
                                    )}
                                </>
                            )}
                        </div>
                    );
                })}
                </CollapsibleSection>

                {/* Interactivity — quick-add buttons that drop a default hot spot / draggable
                    element / image map onto the screen. */}
                <CollapsibleSection title={t('screenInspector.interactivity')}>
                <p className="text-[10px] text-[var(--text-muted)] mb-2">
                    {t('screenInspector.interactivityHint')}
                </p>
                <div className="space-y-1">
                    <button
                        onClick={() => {
                            const id = newInteractiveId('hs');
                            const existingCount = Object.values(screen.elements).filter(
                                (e: any) => e.type === UIElementType.HotSpot
                            ).length;
                            const newSpot: UIHotSpotElement = {
                                id,
                                name: t('screenInspector.hotSpotName', { n: existingCount + 1 }),
                                type: UIElementType.HotSpot,
                                shape: 'rect',
                                trigger: 'click',
                                x: 40, y: 40, width: 20, height: 20,
                                anchorX: 0, anchorY: 0,
                                interactive: true,
                                actions: [],
                            };
                            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId, element: newSpot } });
                        }}
                        className="w-full text-left text-xs bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 px-2 py-1.5 rounded transition-colors"
                    >
                        {t('screenInspector.addHotSpot')}
                    </button>
                    <button
                        onClick={() => {
                            const id = newInteractiveId('hze');
                            // Unified "interactive element": one draggable/clickable element that
                            // can be an image, image map, button, text, etc. Created as an
                            // interactive Image; the inspector's Element Type dropdown switches it
                            // (e.g. to an Image Map with clickable regions) and the Draggable toggle
                            // turns on dragging — replacing the old separate Draggable / Image Map adds.
                            const count = Object.values(screen.elements).filter(
                                (e: any) => e.interactive === true && e.type !== UIElementType.HotSpot
                            ).length;
                            const newEl: UIImageElement = {
                                id,
                                name: t('screenInspector.interactiveName', { n: count + 1 }),
                                type: UIElementType.Image,
                                background: { type: 'color', value: '#00000000' },
                                image: null,
                                objectFit: 'contain',
                                x: 20, y: 20, width: 20, height: 20,
                                anchorX: 0, anchorY: 0,
                                interactive: true,
                            };
                            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId, element: newEl } });
                        }}
                        className="w-full text-left text-xs bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 px-2 py-1.5 rounded transition-colors"
                    >
                        {t('screenInspector.addInteractive')}
                    </button>
                </div>
                </CollapsibleSection>

                {/* Win Condition — available on any screen. The targetable list is the screen's
                    interactive elements (draggables / image maps), read from `screen.elements`. */}
                <CollapsibleSection title={t('screenInspector.winCondition')}>
                    <WinConditionEditor
                        winCondition={screen.winCondition}
                        project={project}
                        targetableElements={
                            (Object.values(screen.elements || {}) as VNUIElement[])
                                .filter(isInteractiveElement)
                                .map(el => ({ id: el.id, name: el.name }))
                        }
                        onChange={(next: VNHotZoneWinCondition | undefined) => updateScreen({ winCondition: next })}
                    />
                </CollapsibleSection>
            </div>
        </Panel>
    );
};
export default ScreenInspector;