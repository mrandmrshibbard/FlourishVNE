import React from 'react';
import { VNCharacterTextbox } from '../../features/character/types';
import { VNID } from '../../types';
import { useProject } from '../../contexts/ProjectContext';
import { FormField, TextInput, ColorInput } from './Form';
import AssetSelector from './AssetSelector';

/**
 * Shared editor for a dialogue textbox's appearance (box background + nameplate). Used by both the
 * per-character custom override (CharacterEditor) and reusable textbox themes (InGameUIEditor).
 * Every field is optional; a blank value falls back to the project-global dialogue UI at render.
 */
const TextboxStyleFields: React.FC<{
    value: Partial<VNCharacterTextbox> | undefined;
    onChange: (patch: Partial<VNCharacterTextbox>) => void;
}> = ({ value, onChange }) => {
    const { project } = useProject();
    const tb = value || {};
    const toUIAsset = (id: VNID | null) => {
        if (!id) return null;
        const a = (project.videos as Record<string, { isVideo?: boolean; videoUrl?: string }> | undefined)?.[id]
            || (project.images as Record<string, { isVideo?: boolean; videoUrl?: string }> | undefined)?.[id]
            || (project.backgrounds as Record<string, { isVideo?: boolean; videoUrl?: string }> | undefined)?.[id];
        const isVid = !!((project.videos as Record<string, unknown> | undefined)?.[id] || a?.isVideo || a?.videoUrl);
        return { type: isVid ? 'video' as const : 'image' as const, id };
    };
    return (
        <div className="space-y-3 pl-1 border-l-2" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="space-y-2 pl-2">
                <h4 className="text-[11px] font-bold" style={{ color: 'var(--text-secondary)' }}>Dialogue box</h4>
                <AssetSelector label="Background image" assetType="images" allowVideo value={tb.dialogueBoxImage?.id ?? null} onChange={id => onChange({ dialogueBoxImage: toUIAsset(id) })} />
                <FormField label="Box color"><ColorInput value={tb.dialogueBoxColor ?? ''} onChange={c => onChange({ dialogueBoxColor: c || undefined })} /></FormField>
                <div className="grid grid-cols-2 gap-3">
                    <FormField label="Opacity %"><TextInput type="number" value={tb.dialogueBoxOpacity ?? ''} onChange={e => onChange({ dialogueBoxOpacity: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })} placeholder="default" /></FormField>
                    <FormField label="Corner radius"><TextInput type="number" value={tb.dialogueBoxBorderRadius ?? ''} onChange={e => onChange({ dialogueBoxBorderRadius: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })} placeholder="default" /></FormField>
                </div>
            </div>
            <div className="space-y-2 pl-2">
                <h4 className="text-[11px] font-bold" style={{ color: 'var(--text-secondary)' }}>Nameplate</h4>
                <AssetSelector label="Background image" assetType="images" value={tb.nameboxImage?.id ?? null} onChange={id => onChange({ nameboxImage: toUIAsset(id) })} />
                <FormField label="Nameplate color"><ColorInput value={tb.nameboxColor ?? ''} onChange={c => onChange({ nameboxColor: c || undefined })} /></FormField>
                <div className="grid grid-cols-2 gap-3">
                    <FormField label="Opacity %"><TextInput type="number" value={tb.nameboxOpacity ?? ''} onChange={e => onChange({ nameboxOpacity: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })} placeholder="default" /></FormField>
                    <FormField label="Corner radius"><TextInput type="number" value={tb.nameboxBorderRadius ?? ''} onChange={e => onChange({ nameboxBorderRadius: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })} placeholder="default" /></FormField>
                </div>
            </div>
        </div>
    );
};

export default TextboxStyleFields;
