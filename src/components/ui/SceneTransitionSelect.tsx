import React from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from './Form';
import type { VNCustomTransition } from '../../features/scene/types';

/** Per-jump scene-transition override picker. Empty = use the leaving scene's own Scene
 *  Settings choice; otherwise a built-in or one of the project's custom (author-made)
 *  transitions from In-Game UI → Scene Transitions. */
const SceneTransitionSelect: React.FC<{
    value?: string;
    customTransitions?: Record<string, VNCustomTransition>;
    onChange: (value: string | undefined) => void;
}> = ({ value, customTransitions, onChange }) => {
    const { t } = useTranslation('properties');
    const customs = Object.values(customTransitions ?? {}) as VNCustomTransition[];
    return (
        <Select value={value || ''} onChange={e => onChange(e.target.value || undefined)}>
            <option value="">{t('sceneTransitionSelect.useSceneSetting', "Use the scene's setting")}</option>
            <option value="fade">{t('sceneTransitionSelect.fade', 'Fade to black')}</option>
            <option value="dissolve">{t('sceneTransitionSelect.dissolve', 'Dissolve')}</option>
            <option value="iris-out">{t('sceneTransitionSelect.irisOut', 'Iris (closing circle)')}</option>
            <option value="wipe-right">{t('sceneTransitionSelect.wipeRight', 'Wipe')}</option>
            <option value="slide-left">{t('sceneTransitionSelect.slideLeft', 'Slide')}</option>
            <option value="instant">{t('sceneTransitionSelect.instant', 'Instant (no effect)')}</option>
            {customs.length > 0 && (
                <optgroup label={t('sceneTransitionSelect.yourTransitions', 'Your transitions')}>
                    {customs.map(ct => <option key={ct.id} value={`custom:${ct.id}`}>{ct.name}</option>)}
                </optgroup>
            )}
        </Select>
    );
};

export default SceneTransitionSelect;
