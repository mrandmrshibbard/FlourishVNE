import React from 'react';
import Panel from '../ui/Panel';
import { useProject } from '../../contexts/ProjectContext';
import { VNID } from '../../types';
import { VNUIScreen } from '../../features/ui/types';
import { FormField, TextInput, Select } from '../ui/Form';
import AssetSelector from '../ui/AssetSelector';

const ScreenInspector: React.FC<{ screenId: VNID }> = ({ screenId }) => {
    const { project, dispatch } = useProject();
    const screen = project.uiScreens[screenId];

    if (!screen) return <Panel title="Properties">Screen not found.</Panel>;

    const updateScreen = (updates: Partial<VNUIScreen>) => {
        dispatch({ type: 'UPDATE_UI_SCREEN', payload: { screenId, updates }});
    };

    const isSpecialScreen = Object.values(project.ui).includes(screenId);

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
                         <AssetSelector label="Asset" assetType={screen.background.type === 'image' ? 'backgrounds' : 'videos'} value={screen.background.assetId} 
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
            </div>
        </Panel>
    );
};
export default ScreenInspector;