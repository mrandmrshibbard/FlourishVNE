import React from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../contexts/ProjectContext';
import { VNID } from '../types';
import { VNScene } from '../features/scene/types';
import Panel from './ui/Panel';
import { FormField, Select, TextInput } from './ui/Form';
import ConditionsEditor from './ui/ConditionsEditor';

const SceneConfigEditor: React.FC<{
    activeSceneId: VNID;
}> = ({ activeSceneId }) => {
    const { project, dispatch } = useProject();
    const { t } = useTranslation('scenes');
    const activeScene = project.scenes[activeSceneId];

    if (!activeScene) {
        return (
            <Panel title={t('config.title')} className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0 h-full">
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs italic">
                    <p>{t('config.notFound')}</p>
                </div>
            </Panel>
        );
    }

    const updateScene = (updates: Partial<Pick<VNScene, 'conditions' | 'fallbackSceneId' | 'outTransition' | 'outTransitionDuration' | 'parallax'>>) => {
        dispatch({ type: 'UPDATE_SCENE_CONFIG', payload: { sceneId: activeSceneId, updates } });
    };
    const px = activeScene.parallax;

    return (
        <Panel title={t('config.titleNamed', { name: activeScene.name })} className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0 h-full">
            <div className="flex flex-col h-full">
                <div className="flex-grow overflow-y-auto pr-1">
                    {/* Exit Transition Settings */}
                    <div className="mb-4">
                        <h3 className="font-bold mb-2 text-[var(--accent-cyan)]">{t('config.exitTransition')}</h3>
                        <p className="text-xs text-[var(--text-secondary)] mb-3">
                            {t('config.exitTransitionDesc')}
                        </p>
                        <FormField label={t('config.transitionStyle')}>
                            <Select
                                value={activeScene.outTransition || 'fade'}
                                onChange={e => updateScene({ outTransition: (e.target.value as VNScene['outTransition']) || undefined })}
                            >
                                <option value="fade">{t('config.transitions.fade')}</option>
                                <option value="dissolve">{t('config.transitions.dissolve')}</option>
                                <option value="iris-out">{t('config.transitions.iris-out')}</option>
                                <option value="wipe-right">{t('config.transitions.wipe-right')}</option>
                                <option value="slide-left">{t('config.transitions.slide-left')}</option>
                                <option value="instant">{t('config.transitions.instant')}</option>
                            </Select>
                        </FormField>
                        {(activeScene.outTransition || 'fade') !== 'instant' && (
                            <FormField label={t('config.duration')}>
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

                    {/* Parallax */}
                    <div className="mb-4">
                        <h3 className="font-bold mb-2 text-[var(--accent-cyan)]">Parallax</h3>
                        <p className="text-xs text-[var(--text-secondary)] mb-3">
                            Shifts stage visuals by their per-command <em>Parallax depth</em> (set in a visual's Transform group) for a sense of depth. <em>Follow mouse</em> tracks the pointer; <em>Camera</em> reacts to Pan/Zoom Screen moves (nearer/higher-depth layers sweep past farther ones); <em>Both</em> combines them.
                        </p>
                        <FormField label="Mode">
                            <Select
                                value={px?.mode || 'off'}
                                onChange={e => {
                                    const mode = e.target.value as NonNullable<VNScene['parallax']>['mode'];
                                    updateScene({ parallax: mode === 'off' ? undefined : { ...px, mode } });
                                }}
                            >
                                <option value="off">Off</option>
                                <option value="mouse">Follow mouse</option>
                                <option value="camera">Camera (pan/zoom)</option>
                                <option value="both">Both</option>
                            </Select>
                        </FormField>
                        {px?.mode && px.mode !== 'off' && (
                            <FormField label={`Intensity: ${(px.intensity ?? 1).toFixed(2)}×`}>
                                <input
                                    type="range" min="0" max="3" step="0.05"
                                    value={px.intensity ?? 1}
                                    onChange={e => updateScene({ parallax: { ...px, intensity: parseFloat(e.target.value) || 0 } })}
                                    className="w-full accent-[var(--accent-cyan)]"
                                />
                            </FormField>
                        )}
                        {(px?.mode === 'camera' || px?.mode === 'both') && (
                            <p className="text-[10px] text-[var(--text-secondary)] mt-1">Camera parallax is driven by <em>Pan/Zoom Screen</em> commands — depth-0 layers move with the camera, higher-depth layers move more. Add some pan to see it.</p>
                        )}
                    </div>

                    <hr className="border-[var(--border-subtle)] mb-4" />

                    <div className="mb-4">
                        <h3 className="font-bold mb-2 text-[var(--accent-cyan)]">{t('config.sceneConditions')}</h3>
                        <p className="text-xs text-[var(--text-secondary)] mb-3">
                            {t('config.sceneConditionsDesc')}
                        </p>
                        <ConditionsEditor 
                            conditions={activeScene.conditions} 
                            project={project} 
                            onChange={(cs) => updateScene({ conditions: cs })}
                        />
                    </div>
                    
                    {activeScene.conditions && activeScene.conditions.length > 0 && (
                        <div className="mt-4">
                            <FormField label={t('config.fallbackScene')}>
                                <p className="text-xs text-[var(--text-secondary)] mb-2">
                                    {t('config.fallbackDesc')}
                                </p>
                                <Select
                                    value={activeScene.fallbackSceneId || ''}
                                    onChange={e => updateScene({ fallbackSceneId: e.target.value || undefined })}
                                >
                                    <option value="">{t('config.skipToNext')}</option>
                                    {Object.values(project.scenes).filter((s: VNScene) => s.id !== activeSceneId).map((s: VNScene) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </Select>
                            </FormField>
                        </div>
                    )}
                </div>
            </div>
        </Panel>
    );
};

export default SceneConfigEditor;
