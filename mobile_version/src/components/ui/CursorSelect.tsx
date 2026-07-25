/**
 * "Mouse pointer when hovering" — the shared per-element cursor picker.
 *
 * One consistent control everywhere something reacts to the mouse (buttons, hot spots,
 * draggables, items…). Plain player-facing choices:
 *   Auto            → whatever the element normally shows (hand, grab-hand, …)
 *   Show the hand   → force the clickable hand
 *   Keep the plain arrow → suppress the hand (hidden-object secrecy — players can't
 *                     sweep the screen watching for the cursor to change)
 *   Custom picture… → any image asset as a one-off pointer for this element
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FormField, Select } from './Form';
import AssetSelector from './AssetSelector';

export interface CursorSelectValue {
    hoverCursor?: 'auto' | 'hand' | 'arrow' | 'custom';
    hoverCursorImage?: { type: 'image' | 'video'; id: string } | null;
}

const CursorSelect: React.FC<{
    value: CursorSelectValue;
    onChange: (patch: CursorSelectValue) => void;
    label?: string;
}> = ({ value, onChange, label }) => {
    const { t } = useTranslation('ui');
    const mode = value.hoverCursor || 'auto';
    return (
        <>
            <FormField label={label || t('cursorSelect.label', 'Mouse pointer when hovering')}>
                <Select
                    value={mode}
                    onChange={e => {
                        const v = e.target.value as CursorSelectValue['hoverCursor'];
                        // 'auto' clears both fields so untouched projects stay byte-identical.
                        if (v === 'auto') onChange({ hoverCursor: undefined, hoverCursorImage: undefined });
                        else if (v === 'custom') onChange({ hoverCursor: 'custom' });
                        else onChange({ hoverCursor: v, hoverCursorImage: undefined });
                    }}
                >
                    <option value="auto">{t('cursorSelect.auto', 'Auto (normal behavior)')}</option>
                    <option value="hand">{t('cursorSelect.hand', 'Show the hand')}</option>
                    <option value="arrow">{t('cursorSelect.arrow', 'Keep the plain arrow (don’t give it away)')}</option>
                    <option value="custom">{t('cursorSelect.custom', 'Custom picture…')}</option>
                </Select>
            </FormField>
            {mode === 'custom' && (
                <AssetSelector
                    label={t('cursorSelect.image', 'Pointer picture')}
                    assetType="images"
                    value={value.hoverCursorImage?.id || null}
                    onChange={(id: string | null) => onChange({ hoverCursor: 'custom', hoverCursorImage: id ? { type: 'image', id } : null })}
                />
            )}
        </>
    );
};

export default CursorSelect;
