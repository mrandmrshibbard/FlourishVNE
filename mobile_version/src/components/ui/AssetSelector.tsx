import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNID } from '../../types';
import { useProject } from '../../contexts/ProjectContext';
import { FormField, Select } from './Form';

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
    const videoAssets = isVideoPicker ? [
        ...Object.values(project.videos || {}),
        ...Object.values(project.backgrounds || {}).filter((a: any) => a.isVideo || a.videoUrl),
        ...Object.values(project.images || {}).filter((a: any) => a.isVideo || a.videoUrl),
    ] as any[] : [];

    // For images, show backgrounds, images, and optionally videos
    const showAllImageTypes = assetType === 'images';
    const hasBackgrounds = showAllImageTypes && Object.keys(project.backgrounds || {}).length > 0;
    const hasImages = Object.keys(assets || {}).length > 0;
    const hasVideos = showAllImageTypes && allowVideo && Object.keys(project.videos || {}).length > 0;
    
    return (
        <FormField label={label}>
            <Select value={value || ''} onChange={e => onChange(e.target.value || null)}>
                <option value="">{t('assetSelector.none')}</option>
                {showAllImageTypes ? (
                    <>
                        {hasBackgrounds && (
                            <optgroup label={t('assetSelector.backgrounds')}>
                                {Object.values(project.backgrounds || {}).map((asset: any) => (
                                    <option key={asset.id} value={asset.id}>{asset.name}</option>
                                ))}
                            </optgroup>
                        )}
                        {hasImages && (
                            <optgroup label={t('assetSelector.images')}>
                                {Object.values(assets || {}).map((asset: any) => (
                                    <option key={asset.id} value={asset.id}>{asset.name}</option>
                                ))}
                            </optgroup>
                        )}
                        {hasVideos && (
                            <optgroup label={t('assetSelector.videos')}>
                                {Object.values(project.videos || {}).map((asset: any) => (
                                    <option key={asset.id} value={asset.id}>{asset.name}</option>
                                ))}
                            </optgroup>
                        )}
                    </>
                ) : isVideoPicker ? (
                    videoAssets.map((asset: any) => (
                        <option key={asset.id} value={asset.id}>{asset.name}</option>
                    ))
                ) : (
                    Object.values(assets || {}).map((asset: any) => (
                        <option key={asset.id} value={asset.id}>{asset.name}</option>
                    ))
                )}
            </Select>
        </FormField>
    );
};

export default AssetSelector;