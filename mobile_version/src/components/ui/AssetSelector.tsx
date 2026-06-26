import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNID } from '../../types';
import { useProject } from '../../contexts/ProjectContext';
import { FormField } from './Form';
import SearchableSelect from './SearchableSelect';

type AssetType = 'backgrounds' | 'images' | 'audio' | 'videos';

const AssetSelector: React.FC<{
    label: string;
    assetType: AssetType;
    value: VNID | null;
    onChange: (id: VNID | null) => void;
    allowVideo?: boolean;
}> = ({ label, assetType, value, onChange, allowVideo }) => {
    const { t } = useTranslation('components');
    const { project } = useProject();
    const assets = project[assetType];

    // Video assets can live in the videos collection OR in backgrounds/images (a video uploaded
    // under those Asset Manager tabs is stored there with a videoUrl). When picking a video,
    // list them all so the asset is selectable regardless of which tab it was uploaded under.
    const isVideoPicker = assetType === 'videos';
    const showAllImageTypes = assetType === 'images';

    // Flat, searchable option list (SearchableSelect adds a type-to-filter box so you can jump
    // straight to an asset by name instead of scrolling a long grouped dropdown).
    const options: { value: string; label: string; group?: string }[] = [{ value: '', label: t('assetSelector.none') }];
    if (showAllImageTypes) {
        Object.values(project.backgrounds || {}).forEach((a: any) => options.push({ value: a.id, label: a.name, group: t('assetSelector.backgrounds') }));
        Object.values(assets || {}).forEach((a: any) => options.push({ value: a.id, label: a.name, group: t('assetSelector.images') }));
        if (allowVideo) Object.values(project.videos || {}).forEach((a: any) => options.push({ value: a.id, label: a.name, group: t('assetSelector.videos') }));
    } else if (isVideoPicker) {
        ([
            ...Object.values(project.videos || {}),
            ...Object.values(project.backgrounds || {}).filter((a: any) => a.isVideo || a.videoUrl),
            ...Object.values(project.images || {}).filter((a: any) => a.isVideo || a.videoUrl),
        ] as any[]).forEach((a: any) => options.push({ value: a.id, label: a.name }));
    } else {
        Object.values(assets || {}).forEach((a: any) => options.push({ value: a.id, label: a.name }));
    }

    return (
        <FormField label={label}>
            <SearchableSelect
                value={value || ''}
                onChange={v => onChange(v || null)}
                options={options}
                placeholder={t('assetSelector.none')}
            />
        </FormField>
    );
};

export default AssetSelector;