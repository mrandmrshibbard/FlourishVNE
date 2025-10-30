import React from 'react';
import { VNID } from '../../types';
import { useProject } from '../../contexts/ProjectContext';
import { FormField, Select } from './Form';

type AssetType = 'backgrounds' | 'images' | 'audio' | 'videos';

const AssetSelector: React.FC<{
    label: string;
    assetType: AssetType;
    value: VNID | null;
    onChange: (id: VNID | null) => void;
}> = ({ label, assetType, value, onChange }) => {
    const { project } = useProject();
    const assets = project[assetType];
    
    return (
        <FormField label={label}>
            <Select value={value || ''} onChange={e => onChange(e.target.value || null)}>
                <option value="">None</option>
                {Object.values(assets || {}).map((asset: any) => (
                    <option key={asset.id} value={asset.id}>{asset.name}</option>
                ))}
            </Select>
        </FormField>
    );
};

export default AssetSelector;