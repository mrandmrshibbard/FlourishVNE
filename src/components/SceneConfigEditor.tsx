import React from 'react';
import { useProject } from '../contexts/ProjectContext';
import { VNID } from '../types';
import { VNScene } from '../features/scene/types';
import Panel from './ui/Panel';
import { FormField, Select, TextInput } from './ui/Form';
import ConditionsEditor from './ui/ConditionsEditor';

const SceneConfigEditor: React.FC<{
    activeSceneId: VNID;
    onCloseSceneConfig?: () => void;
}> = ({ activeSceneId, onCloseSceneConfig }) => {
    const { project, dispatch } = useProject();
    const activeScene = project.scenes[activeSceneId];

    if (!activeScene) {
        return (
            <Panel title="Scene Config" className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0 h-full">
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs italic">
                    <p>Scene not found.</p>
                </div>
            </Panel>
        );
    }

    const updateScene = (updates: Partial<Pick<VNScene, 'conditions' | 'fallbackSceneId' | 'outTransition' | 'outTransitionDuration'>>) => {
        dispatch({ type: 'UPDATE_SCENE_CONFIG', payload: { sceneId: activeSceneId, updates } });
    };

    return (
        <Panel title={`Scene Config: ${activeScene.name}`} className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0 h-full">
            <div className="flex flex-col h-full">
                <div className="flex-grow overflow-y-auto pr-1">
                    {/* Exit Transition Settings */}
                    <div className="mb-4">
                        <h3 className="font-bold mb-2 text-[var(--accent-cyan)]">Exit Transition</h3>
                        <p className="text-xs text-[var(--text-secondary)] mb-3">
                            How the screen transitions out when leaving this scene.
                        </p>
                        <FormField label="Transition Style">
                            <Select
                                value={activeScene.outTransition || 'fade'}
                                onChange={e => updateScene({ outTransition: (e.target.value as VNScene['outTransition']) || undefined })}
                            >
                                <option value="fade">Fade to Black</option>
                                <option value="dissolve">Dissolve</option>
                                <option value="iris-out">Iris Out</option>
                                <option value="wipe-right">Wipe Right</option>
                                <option value="slide-left">Slide Left</option>
                                <option value="instant">Instant (No Transition)</option>
                            </Select>
                        </FormField>
                        {(activeScene.outTransition || 'fade') !== 'instant' && (
                            <FormField label="Duration (s)">
                                <TextInput
                                    type="number"
                                    min={0.1}
                                    max={5}
                                    step={0.1}
                                    value={activeScene.outTransitionDuration ?? 0.5}
                                    onChange={e => {
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val) && val >= 0.1 && val <= 5) {
                                            updateScene({ outTransitionDuration: val });
                                        }
                                    }}
                                />
                            </FormField>
                        )}
                    </div>

                    <hr className="border-[var(--border-subtle)] mb-4" />

                    <div className="mb-4">
                        <h3 className="font-bold mb-2 text-[var(--accent-cyan)]">Scene Conditions</h3>
                        <p className="text-xs text-[var(--text-secondary)] mb-3">
                            This scene will only play if all conditions are met. If conditions fail, the scene will be skipped.
                        </p>
                        <ConditionsEditor 
                            conditions={activeScene.conditions} 
                            project={project} 
                            onChange={(cs) => updateScene({ conditions: cs })}
                        />
                    </div>
                    
                    {activeScene.conditions && activeScene.conditions.length > 0 && (
                        <div className="mt-4">
                            <FormField label="Fallback Scene">
                                <p className="text-xs text-[var(--text-secondary)] mb-2">
                                    If conditions fail, jump to this scene instead:
                                </p>
                                <Select 
                                    value={activeScene.fallbackSceneId || ''} 
                                    onChange={e => updateScene({ fallbackSceneId: e.target.value || undefined })}
                                >
                                    <option value="">Skip to next scene in sequence</option>
                                    {Object.values(project.scenes).filter((s: VNScene) => s.id !== activeSceneId).map((s: VNScene) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </Select>
                            </FormField>
                        </div>
                    )}
                </div>
                <div className="pt-4 mt-auto">
                    <button 
                        onClick={onCloseSceneConfig} 
                        className="w-full bg-[var(--accent-cyan)] hover:opacity-80 text-black font-bold py-1 px-2 rounded-lg transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </Panel>
    );
};

export default SceneConfigEditor;
