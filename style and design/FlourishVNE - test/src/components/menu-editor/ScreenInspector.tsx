import React from 'react';
import { useProject } from '../../contexts/ProjectContext';
import { VNID } from '../../types';
import { VNUIScreen } from '../../features/ui/types';
import { FormField, TextInput, Select } from '../ui/Form';
import AssetSelector from '../ui/AssetSelector';
import { Cog6ToothIcon } from '../icons';

const ScreenInspector: React.FC<{ screenId: VNID }> = ({ screenId }) => {
    const { project, dispatch } = useProject();
    const screen = project.uiScreens[screenId];

    if (!screen) return <div className="w-56 p-4 bg-slate-800/50 border-2 border-slate-700 rounded-lg text-white">Screen not found.</div>;

    const updateScreen = (updates: Partial<VNUIScreen>) => {
        dispatch({ type: 'UPDATE_UI_SCREEN', payload: { screenId, updates }});
    };

    const isSpecialScreen = Object.values(project.ui).includes(screenId);

    return (
        <div className="bg-slate-800/50 border-2 border-slate-700 rounded-lg flex flex-col flex-shrink-0 shadow-xl overflow-hidden" style={{ width: '224px', maxHeight: '85vh' }}>
            <div className="p-3 border-b-2 border-slate-700 flex-shrink-0">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Cog6ToothIcon className="w-4 h-4 text-purple-400" />
                    Properties
                </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                <FormField label="Name">
                    <TextInput value={screen.name} onChange={e => updateScreen({ name: e.target.value })} disabled={isSpecialScreen} />
                </FormField>

                <hr className="border-slate-700 my-2" />
                <h3 className="font-semibold text-xs text-slate-400 mb-1.5">Background</h3>
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
                    <FormField label="Color">
                        <TextInput type="color" value={screen.background.value} onChange={e => updateScreen({ background: { type: 'color', value: e.target.value }})} className="p-1 h-8"/>
                    </FormField>
                ) : (
                     <AssetSelector label="Asset" assetType={screen.background.type === 'image' ? 'backgrounds' : 'videos'} value={screen.background.assetId} 
                        onChange={id => {
                            if (screen.background.type !== 'color') {
                                updateScreen({ background: { type: screen.background.type, assetId: id }});
                            }
                        }} />
                )}

                <hr className="border-slate-700 my-2" />
                <h3 className="font-semibold text-xs text-slate-400 mb-1.5">Music</h3>
                <AssetSelector label="Track" assetType="audio" value={screen.music.audioId} onChange={id => updateScreen({ music: { ...screen.music, audioId: id } })} />
                <FormField label="Policy">
                     <Select value={screen.music.policy} onChange={e => updateScreen({ music: { ...screen.music, policy: e.target.value as any }})}>
                        <option value="continue">Continue</option>
                        <option value="stop">Stop</option>
                    </Select>
                </FormField>

                <hr className="border-slate-700 my-2" />
                <h3 className="font-semibold text-xs text-slate-400 mb-1.5">Ambient</h3>
                <AssetSelector label="Track" assetType="audio" value={screen.ambientNoise.audioId} onChange={id => updateScreen({ ambientNoise: { ...screen.ambientNoise, audioId: id } })} />
                <FormField label="Policy">
                     <Select value={screen.ambientNoise.policy} onChange={e => updateScreen({ ambientNoise: { ...screen.ambientNoise, policy: e.target.value as any }})}>
                        <option value="continue">Continue</option>
                        <option value="stop">Stop</option>
                    </Select>
                </FormField>

                <hr className="border-slate-700 my-2" />
                <h3 className="font-semibold text-xs text-slate-400 mb-1.5">Transitions</h3>
                <FormField label="In">
                    <Select value={screen.transitionIn || 'fade'} onChange={e => updateScreen({ transitionIn: e.target.value as any })}>
                        <option value="none">None</option>
                        <option value="fade">Fade</option>
                        <option value="slideUp">↑ Up</option>
                        <option value="slideDown">↓ Down</option>
                        <option value="slideLeft">← Left</option>
                        <option value="slideRight">→ Right</option>
                    </Select>
                </FormField>
                <FormField label="Out">
                    <Select value={screen.transitionOut || 'fade'} onChange={e => updateScreen({ transitionOut: e.target.value as any })}>
                        <option value="none">None</option>
                        <option value="fade">Fade</option>
                        <option value="slideUp">↑ Up</option>
                        <option value="slideDown">↓ Down</option>
                        <option value="slideLeft">← Left</option>
                        <option value="slideRight">→ Right</option>
                    </Select>
                </FormField>
                <FormField label="Duration">
                    <TextInput type="number" value={screen.transitionDuration || 300} onChange={e => updateScreen({ transitionDuration: parseInt(e.target.value) || 300 })} placeholder="ms" />
                </FormField>

                <hr className="border-slate-700 my-2" />
                <FormField label="Show Dialogue Box">
                    <input type="checkbox" checked={screen.showDialogue || false} onChange={e => updateScreen({ showDialogue: e.target.checked })} className="w-4 h-4" />
                </FormField>
            </div>
        </div>
    );
};
export default ScreenInspector;