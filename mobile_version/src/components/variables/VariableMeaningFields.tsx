/**
 * What a variable MEANS — the thing a name alone can never carry.
 *
 * `Affection = 34` tells an author nothing: is 34 good? out of what? The Systems > Stats pane has
 * always let you attach an icon, a colour and a plain description; plain variables never could. This
 * brings those down to every variable, so the whole app can show a variable as something you
 * RECOGNISE rather than something you read.
 *
 * Shared by VariableManager and VariablePropertiesEditor (which are otherwise two divergent editors).
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNVariable } from '../../features/variables/types';
import { ColorInput } from '../ui/Form';
import EmojiPicker from '../ui/EmojiPicker';

const inputClass = 'w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]';

export const VariableMeaningFields: React.FC<{
    variable: VNVariable;
    onChange: (updates: Partial<VNVariable>) => void;
}> = ({ variable, onChange }) => {
    const { t } = useTranslation('variables');

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <span className="flex-shrink-0">
                    <EmojiPicker
                        value={variable.icon}
                        onChange={icon => onChange({ icon })}
                        placeholder="❤️"
                        title={t('meaning.iconTitle', 'An emoji, so you can spot this variable at a glance')}
                    />
                </span>
                <span className="flex-shrink-0" title={t('meaning.colorTitle', 'A colour, used wherever this variable appears')}>
                    <ColorInput
                        value={variable.color ?? '#7dd3fc'}
                        onChange={color => onChange({ color })}
                    />
                </span>
                <input
                    type="text"
                    value={variable.description ?? ''}
                    onChange={e => onChange({ description: e.target.value || undefined })}
                    placeholder={t('meaning.descPlaceholder', 'What this means in your story — e.g. “How much Yuki likes you”')}
                    className={`${inputClass} flex-grow min-w-0`}
                />
            </div>
        </div>
    );
};

export default VariableMeaningFields;
