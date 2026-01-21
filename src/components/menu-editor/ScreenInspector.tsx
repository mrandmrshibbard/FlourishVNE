import React from 'react';
import Panel from '../ui/Panel';
import { useProject } from '../../contexts/ProjectContext';
import { VNID } from '../../types';
import { VNUIScreen } from '../../features/ui/types';
import { FormField, TextInput, Select } from '../ui/Form';
import AssetSelector from '../ui/AssetSelector';
import { upsertOverlayEffect, type VNScreenOverlayEffectType } from '../../types';

const ScreenInspector: React.FC<{ screenId: VNID }> = ({ screenId }) => {
    const { project, dispatch } = useProject();
    const screen = project.uiScreens[screenId];

    if (!screen) return <Panel title="Properties">Screen not found.</Panel>;

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
    const setEffect = (type: VNScreenOverlayEffectType, intensity: number, variant?: 'snow' | 'ash', color?: string) => {
        updateScreen({
            effects: upsertOverlayEffect(currentEffects, {
                type,
                intensity,
                variant,
                color,
            })
        });
    };

    return (
        <Panel title="Screen Properties" className="w-96 flex-shrink-0">
            <div className="flex-grow overflow-y-auto pr-1">
                <FormField label="Screen Name">
                    <TextInput value={screen.name} onChange={e => updateScreen({ name: e.target.value })} disabled={isSpecialScreen} />
                </FormField>

                <hr className="border-slate-700 my-4" />
                <h3 className="font-bold mb-2 text-slate-400">Background</h3>
                <div className="grid grid-cols-2 gap-2">
                    <FormField label="Type">
                         <Select value={screen.background.type} onChange={e => {
                            const newType = e.target.value as 'color' | 'image' | 'video';
                            if (newType === 'color') {
                                updateScreen({ background: { type: 'color', value: '#000000' }});
                            } else {
                                updateScreen({ background: { type: newType, assetId: null }});
                            }
                         }}>
                            <option value="color">Color</option>
                            <option value="image">Image</option>
                            <option value="video">Video</option>
                        </Select>
                    </FormField>
                    {screen.background.type === 'color' ? (
                        <FormField label="Color Value">
                            <TextInput type="color" value={screen.background.value} onChange={e => updateScreen({ background: { type: 'color', value: e.target.value }})} className="p-1 h-10"/>
                        </FormField>
                    ) : (
                         <AssetSelector label="Asset" assetType={screen.background.type === 'image' ? 'images' : 'videos'} allowVideo value={screen.background.assetId} 
                            onChange={id => {
                                if (screen.background.type !== 'color') {
                                    updateScreen({ background: { type: screen.background.type, assetId: id }});
                                }
                            }} />
                    )}
                </div>

                <hr className="border-slate-700 my-4" />
                <h3 className="font-bold mb-2 text-slate-400">Music</h3>
                 <div className="grid grid-cols-2 gap-2">
                    <AssetSelector label="Track" assetType="audio" value={screen.music.audioId} onChange={id => updateScreen({ music: { ...screen.music, audioId: id } })} />
                    <FormField label="Playback Policy">
                         <Select value={screen.music.policy} onChange={e => updateScreen({ music: { ...screen.music, policy: e.target.value as any }})}>
                            <option value="continue">Continue</option>
                            <option value="stop">Stop on Exit</option>
                        </Select>
                    </FormField>
                </div>

                <hr className="border-slate-700 my-4" />
                <h3 className="font-bold mb-2 text-slate-400">Ambient Noise</h3>
                 <div className="grid grid-cols-2 gap-2">
                    <AssetSelector label="Track" assetType="audio" value={screen.ambientNoise.audioId} onChange={id => updateScreen({ ambientNoise: { ...screen.ambientNoise, audioId: id } })} />
                    <FormField label="Playback Policy">
                         <Select value={screen.ambientNoise.policy} onChange={e => updateScreen({ ambientNoise: { ...screen.ambientNoise, policy: e.target.value as any }})}>
                            <option value="continue">Continue</option>
                            <option value="stop">Stop on Exit</option>
                        </Select>
                    </FormField>
                </div>

                <hr className="border-slate-700 my-4" />
                <h3 className="font-bold mb-2 text-slate-400">Screen Transitions</h3>
                <div className="grid grid-cols-2 gap-2">
                    <FormField label="Transition In">
                        <Select value={screen.transitionIn || 'fade'} onChange={e => updateScreen({ transitionIn: e.target.value as any })}>
                            <option value="none">None</option>
                            <option value="fade">Fade</option>
                            <option value="slideUp">Slide Up</option>
                            <option value="slideDown">Slide Down</option>
                            <option value="slideLeft">Slide Left</option>
                            <option value="slideRight">Slide Right</option>
                        </Select>
                    </FormField>
                    <FormField label="Transition Out">
                        <Select value={screen.transitionOut || 'fade'} onChange={e => updateScreen({ transitionOut: e.target.value as any })}>
                            <option value="none">None</option>
                            <option value="fade">Fade</option>
                            <option value="slideUp">Slide Up</option>
                            <option value="slideDown">Slide Down</option>
                            <option value="slideLeft">Slide Left</option>
                            <option value="slideRight">Slide Right</option>
                        </Select>
                    </FormField>
                </div>
                <FormField label="Duration (ms)">
                    <TextInput type="number" value={screen.transitionDuration || 300} onChange={e => updateScreen({ transitionDuration: parseInt(e.target.value) || 300 })} />
                </FormField>

                <hr className="border-slate-700 my-4" />
                <h3 className="font-bold mb-2 text-slate-400">Dialogue Box</h3>
                <FormField label="Show Dialogue">
                    <input type="checkbox" checked={screen.showDialogue || false} onChange={e => updateScreen({ showDialogue: e.target.checked })} className="w-5 h-5" />
                </FormField>

                <hr className="border-slate-700 my-4" />
                <h3 className="font-bold mb-2 text-slate-400">Screen Effects</h3>

                {([
                    { type: 'crtScanlines' as const, label: 'CRT Scanlines' },
                    { type: 'chromaticGlitch' as const, label: 'Chromatic Glitch' },
                    { type: 'sunbeams' as const, label: 'Undulating Sunbeams', supportsColor: true, defaultColor: '#FFCC66' },
                    { type: 'shimmer' as const, label: 'Undulating Shimmer', supportsColor: true, defaultColor: '#FFFFFF' },
                    { type: 'rain' as const, label: 'Rain', supportsColor: true, defaultColor: '#AADDFF' },
                    { type: 'snowAsh' as const, label: 'Snow / Ash', supportsColor: true, defaultColor: '#FFFFFF' },
                ] as const).map(({ type, label, supportsColor, defaultColor }) => {
                    const intensity = getIntensity(type);
                    const enabled = intensity > 0;
                    const effectColor = getColor(type);
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
                                <span>{label}</span>
                            </label>

                            {enabled && (
                                <>
                                    <div className="mt-2">
                                        <div className="text-xs text-slate-300 mb-1">Intensity: {Math.round(intensity * 100)}%</div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.01"
                                            value={intensity}
                                            onChange={(e) => setEffect(type, parseFloat(e.target.value), type === 'snowAsh' ? getSnowAshVariant() : undefined, effectColor || undefined)}
                                            className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-sky-500"
                                        />
                                    </div>

                                    {supportsColor && (
                                        <div className="mt-2">
                                            <div className="text-xs text-slate-300 mb-1">Color</div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={effectColor || defaultColor}
                                                    onChange={(e) => setEffect(type, intensity, type === 'snowAsh' ? getSnowAshVariant() : undefined, e.target.value)}
                                                    className="w-10 h-8 p-0 border-0 rounded cursor-pointer"
                                                />
                                                <input
                                                    type="text"
                                                    value={effectColor || defaultColor}
                                                    onChange={(e) => setEffect(type, intensity, type === 'snowAsh' ? getSnowAshVariant() : undefined, e.target.value)}
                                                    placeholder={defaultColor}
                                                    className="flex-1 px-2 py-1 text-sm bg-slate-700 border border-slate-600 rounded"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setEffect(type, intensity, type === 'snowAsh' ? getSnowAshVariant() : undefined, defaultColor)}
                                                    className="px-2 py-1 text-xs bg-slate-600 hover:bg-slate-500 rounded"
                                                    title="Reset to default color"
                                                >
                                                    Reset
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {type === 'snowAsh' && (
                                        <FormField label="Mode">
                                            <Select
                                                value={getSnowAshVariant()}
                                                onChange={(e) => setEffect('snowAsh', intensity, e.target.value as any, effectColor || undefined)}
                                            >
                                                <option value="snow">Snow</option>
                                                <option value="ash">Ash</option>
                                            </Select>
                                        </FormField>
                                    )}
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </Panel>
    );
};
export default ScreenInspector;