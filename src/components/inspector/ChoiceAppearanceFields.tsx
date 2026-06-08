/**
 * Shared Choice‑customization controls, used by BOTH choice editors (the grouped
 * `ChoiceGroup` in CommandGroupFields and the flat Choice case in PropertiesInspector)
 * so they stay identical. Presentation‑only — writes flow through the caller's update fn.
 *
 * - `ChoiceLayoutSelect`: command‑level layout (Vertical = default / Horizontal / Free).
 * - `ChoiceOptionAppearance`: per‑option art + colors + font size + corner radius, plus
 *   x/y/width/height position fields when the command is in Free layout. Anything left
 *   blank falls back to the global In‑Game‑UI choice style at runtime.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNProject } from '../../types/project';
import { ChoiceOption } from '../../features/scene/types';
import { VNID } from '../../types';
import { FormField, Select, TextInput, ColorInput } from '../ui/Form';
import AssetSelector from '../ui/AssetSelector';

export type ChoiceLayout = 'vertical' | 'horizontal' | 'free';

export const ChoiceLayoutSelect: React.FC<{ layout?: ChoiceLayout; onChange: (l: ChoiceLayout | undefined) => void }> = ({ layout, onChange }) => {
    const { t } = useTranslation('properties');
    return (
        <>
            <FormField label={t('choice.layout')}>
                <Select value={layout || 'vertical'} onChange={e => onChange(e.target.value === 'vertical' ? undefined : (e.target.value as ChoiceLayout))}>
                    <option value="vertical">{t('choice.layoutVertical')}</option>
                    <option value="horizontal">{t('choice.layoutHorizontal')}</option>
                    <option value="free">{t('choice.layoutFree')}</option>
                </Select>
            </FormField>
            {layout === 'free' && <p className="text-[10px] text-[var(--text-muted)] -mt-2 mb-2">{t('choice.freeHint')}</p>}
        </>
    );
};

export const ChoiceOptionAppearance: React.FC<{
    option: ChoiceOption;
    layout?: ChoiceLayout;
    project: VNProject;
    onChange: (patch: Partial<ChoiceOption>) => void;
}> = ({ option, layout, project, onChange }) => {
    const { t } = useTranslation('properties');
    const num = (v: string): number | undefined => (v === '' ? undefined : (parseFloat(v) || 0));
    return (
        <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
            <h4 className="font-bold text-xs text-[var(--text-secondary)]">{t('choice.appearance')}</h4>
            <p className="text-[10px] text-[var(--text-muted)]">{t('choice.appearanceHint')}</p>
            <AssetSelector label={t('choice.image')} assetType="images" value={option.image?.id || null}
                onChange={(id: VNID | null) => onChange({ image: id ? { type: 'image', id } : null })} />
            <AssetSelector label={t('choice.hoverImage')} assetType="images" value={option.hoverImage?.id || null}
                onChange={(id: VNID | null) => onChange({ hoverImage: id ? { type: 'image', id } : null })} />
            <div className="grid grid-cols-3 gap-1">
                <FormField label={t('choice.bgColor')}><ColorInput value={option.backgroundColor || '#1e293b'} onChange={v => onChange({ backgroundColor: v })} /></FormField>
                <FormField label={t('choice.hoverBgColor')}><ColorInput value={option.hoverBackgroundColor || '#334155'} onChange={v => onChange({ hoverBackgroundColor: v })} /></FormField>
                <FormField label={t('choice.textColor')}><ColorInput value={option.textColor || '#ffffff'} onChange={v => onChange({ textColor: v })} /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-1">
                <FormField label={t('choice.fontSize')}><TextInput type="number" value={option.fontSize ?? ''} onChange={e => onChange({ fontSize: num(e.target.value) })} /></FormField>
                <FormField label={t('choice.radius')}><TextInput type="number" value={option.borderRadius ?? ''} onChange={e => onChange({ borderRadius: num(e.target.value) })} /></FormField>
            </div>
            {layout === 'free' && (
                <div className="grid grid-cols-4 gap-1">
                    <FormField label={t('choice.xPct')}><TextInput type="number" value={option.x ?? ''} onChange={e => onChange({ x: num(e.target.value) })} /></FormField>
                    <FormField label={t('choice.yPct')}><TextInput type="number" value={option.y ?? ''} onChange={e => onChange({ y: num(e.target.value) })} /></FormField>
                    <FormField label={t('choice.wPct')}><TextInput type="number" value={option.width ?? ''} onChange={e => onChange({ width: num(e.target.value) })} /></FormField>
                    <FormField label={t('choice.hPct')}><TextInput type="number" value={option.height ?? ''} onChange={e => onChange({ height: num(e.target.value) })} /></FormField>
                </div>
            )}
        </div>
    );
};
