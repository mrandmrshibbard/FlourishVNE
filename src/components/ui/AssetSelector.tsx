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