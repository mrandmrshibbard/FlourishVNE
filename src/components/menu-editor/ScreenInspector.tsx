import React from 'react';
import { useTranslation } from 'react-i18next';
import Panel from '../ui/Panel';
import { useProject } from '../../contexts/ProjectContext';
import { VNID } from '../../types';
import { VNUIScreen, VNHotZoneWinCondition, VNHotZoneElement, UIElementType, UIHotSpotElement, UIImageElement, UIImageMapElement } from '../../features/ui/types';
import { FormField, TextInput, Select, ColorInput } from '../ui/Form';
import AssetSelector from '../ui/AssetSelector';
import WinConditionEditor from '../ui/WinConditionEditor';
import { deriveHotZoneElementsFromScreen } from '../../utils/hotZoneShims';
import { upsertOverlayEffect, type VNScreenOverlayEffectType, type VNEffectParams } from '../../types';

const newInteractiveId = (prefix: string): VNID =>
    `${prefix}-${Math.random().toString(36).substring(2, 9)}` as VNID;

/** Small reusable slider for 0..1 effect params */
const ParamSlider: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange }) => (
    <div className="mt-1">
        <div className="text-xs text-slate-400 mb-0.5 flex justify-between">
            <span>{label}</span>
            <span>{Math.round(value * 100)}%</span>
        </div>
        <input type="range" min="0" max="1" step="0.01" value={value}
            onChange={e => onChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500" />
    </div>
);

const ScreenInspector: React.FC<{ screenId: VNID }> = ({ screenId }) => {
    const { t } = useTranslation('ui');
    const { project, dispatch } = useProject();
    const screen = project.uiScreens[screenId];

    if (!screen) return <Panel title={t('screenInspector.propertiesTitle')}>{t('screenInspector.notFound')}</Panel>;

    const updateScreen = (updates: Partial<VNUIScreen>) => {
        dispatch({ type: 'UPDATE_UI_SCREEN', payload: { screenId, updates }});
    };

    const isSpecialScreen = Object.values(project.ui).includes(screenId);

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

    return (
        <Panel title={t('screenInspector.title')} className="w-96 flex-shrink-0">
            <div className="flex-grow overflow-y-auto pr-1">
                <FormField label={t('screenInspector.screenName')}>
                    <TextInput value={screen.name} onChange={e => updateScreen({ name: e.target.value })} disabled={isSpecialScreen} />
                </FormField>

                <hr className="border-slate-700 my-4" />
                <h3 className="font-bold mb-2 text-slate-400">{t('screenInspector.background')}</h3>
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
                                    updateScreen({ background: { type: screen.background.type, assetId: id }});
                                }
                            }} />
                    )}
                </div>

                <hr className="border-slate-700 my-4" />
                <h3 className="font-bold mb-2 text-slate-400">{t('screenInspector.music')}</h3>
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
                    <input type="range" min="0" max="100" value={Math.round((screen.music.volume ?? 1) * 100)}
                        onChange={e => updateScreen({ music: { ...screen.music, volume: parseInt(e.target.value) / 100 } })}
                        className="w-full accent-purple-500" />
                </FormField>

                <hr className="border-slate-700 my-4" />
                <h3 className="font-bold mb-2 text-slate-400">{t('screenInspector.ambientNoise')}</h3>
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
                    <input type="range" min="0" max="100" value={Math.round((screen.ambientNoise.volume ?? 1) * 100)}
                        onChange={e => updateScreen({ ambientNoise: { ...screen.ambientNoise, volume: parseInt(e.target.value) / 100 } })}
                        className="w-full accent-purple-500" />
                </FormField>

                <hr className="border-slate-700 my-4" />
                <h3 className="font-bold mb-2 text-slate-400">{t('screenInspector.transitions')}</h3>
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

                <hr className="border-slate-700 my-4" />
                <h3 className="font-bold mb-2 text-slate-400">{t('screenInspector.dialogueBox')}</h3>
                <FormField label={t('screenInspector.showDialogue')}>
                    <input type="checkbox" checked={screen.showDialogue || false} onChange={e => updateScreen({ showDialogue: e.target.checked })} className="w-5 h-5" />
                </FormField>

                <hr className="border-slate-700 my-4" />
                <h3 className="font-bold mb-2 text-slate-400">{t('screenInspector.overlayBehavior')}</h3>
                <FormField label={t('screenInspector.passThrough')}>
                    <input
                        type="checkbox"
                        checked={screen.passThrough ?? (screenId === project.ui.gameHudScreenId)}
                        onChange={e => updateScreen({ passThrough: e.target.checked })}
                        className="w-5 h-5"
                    />
                </FormField>
                <p className="text-[10px] text-slate-500 -mt-1">{t('screenInspector.passThroughHint')}</p>

                <hr className="border-slate-700 my-4" />
                <h3 className="font-bold mb-2 text-slate-400">{t('screenInspector.screenEffects')}</h3>

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
                ] as const).map(({ type, supportsColor, defaultColor, extraParams, supportsBlend }) => {
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
                                        <input
                                            type="range"
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
            </div>

            {/* Interactivity — quick-add buttons that drop a default hot spot / draggable
                element / image map onto the screen. As soon as one is added, the editor
                routes to HotZoneEditor for detail editing (until Phase 3 brings overlays
                directly into MenuEditor). */}
            <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
                <h3 className="text-sm font-bold text-purple-300 mb-2">{t('screenInspector.interactivity')}</h3>
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
                            const draggableCount = Object.values(screen.elements).filter(
                                (e: any) => e.draggable === true
                            ).length;
                            // Draggable image — stored as a `UIImageElement` with `interactive: true`
                            // plus `draggable: true` and snap-back. The `interactive` flag keeps the
                            // element in the hot zone editor even if `draggable` is toggled off later.
                            const newEl: UIImageElement = {
                                id,
                                name: t('screenInspector.draggableName', { n: draggableCount + 1 }),
                                type: UIElementType.Image,
                                background: { type: 'color', value: '#00000000' },
                                image: null,
                                objectFit: 'contain',
                                x: 10, y: 10, width: 10, height: 10,
                                anchorX: 0, anchorY: 0,
                                interactive: true,
                                draggable: true,
                                snapBack: true,
                            };
                            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId, element: newEl } });
                        }}
                        className="w-full text-left text-xs bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 px-2 py-1.5 rounded transition-colors"
                    >
                        {t('screenInspector.addDraggable')}
                    </button>
                    <button
                        onClick={() => {
                            const id = newInteractiveId('hze');
                            const mapCount = Object.values(screen.elements).filter(
                                (e: any) => e.type === UIElementType.ImageMap
                            ).length;
                            const newEl: UIImageMapElement = {
                                id,
                                name: t('screenInspector.imageMapName', { n: mapCount + 1 }),
                                type: UIElementType.ImageMap,
                                image: null,
                                imageMapRegions: [],
                                x: 10, y: 10, width: 60, height: 40,
                                anchorX: 0, anchorY: 0,
                                interactive: true,
                            };
                            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId, element: newEl } });
                        }}
                        className="w-full text-left text-xs bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 px-2 py-1.5 rounded transition-colors"
                    >
                        {t('screenInspector.addImageMap')}
                    </button>
                </div>
            </div>

            {/* Win Condition — available on any screen. Setting one promotes the screen to
                "interactive" without forcing a switch to the legacy hot zone editor. */}
            <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
                <WinConditionEditor
                    winCondition={screen.winCondition}
                    project={project}
                    targetableElements={
                        Object.values(deriveHotZoneElementsFromScreen(screen)).map((el: VNHotZoneElement) => ({
                            id: el.id,
                            name: el.name,
                        }))
                    }
                    onChange={(next: VNHotZoneWinCondition | undefined) => updateScreen({ winCondition: next })}
                />
            </div>
        </Panel>
    );
};
export default ScreenInspector;