/**
 * Insert a variable into text — "{ }" — instead of typing `{Affection}` from memory.
 *
 * Text interpolation resolves `{Affection}` BY NAME. That makes hand-typing it two footguns at once:
 * a typo silently ships as literal braces in the player's dialogue, and renaming the variable later
 * quietly breaks every line that mentions it (the rename can't find text it doesn't know about).
 * Picking from a list removes the typo half of that entirely, and a value inserted from here is
 * guaranteed to match a real variable at the moment it's inserted.
 *
 * Inserts at the caret of the associated <input>/<textarea>, not at the end — an author adding
 * "{Gold}" mid-sentence should not have it land after the full stop.
 */
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../contexts/ProjectContext';
import { VNVariable } from '../../features/variables/types';
import VariablePicker from './VariablePicker';

export const VariableTokenButton: React.FC<{
    /** The field to insert into. */
    targetRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
    /** Current text — we return the NEW text; the caller owns the state. */
    value: string;
    onChange: (next: string) => void;
    className?: string;
}> = ({ targetRef, value, onChange, className = '' }) => {
    const { t } = useTranslation('variables');
    const { project } = useProject();
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLSpanElement>(null);

    const insert = (id: string) => {
        const variable = project.variables[id] as VNVariable | undefined;
        if (!variable) return;
        const token = `{${variable.name}}`;

        const el = targetRef.current;
        // Fall back to appending if the field was never focused (no caret to speak of).
        const start = el?.selectionStart ?? value.length;
        const end = el?.selectionEnd ?? value.length;
        const next = value.slice(0, start) + token + value.slice(end);
        onChange(next);
        setOpen(false);

        // Put the caret after what we just inserted, so they can keep typing.
        requestAnimationFrame(() => {
            if (!el) return;
            el.focus();
            const caret = start + token.length;
            el.setSelectionRange(caret, caret);
        });
    };

    return (
        <span ref={wrapRef} className={`relative inline-flex ${className}`}>
            {!open ? (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    title={t('token.insert', 'Put a variable into this text — it will show the value while the game runs')}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent-lavender)] transition-colors font-mono leading-none"
                >
                    {'{ }'}
                </button>
            ) : (
                // Once open, the VariablePicker takes over (it portals itself, so no clipping).
                <span className="w-40">
                    <VariablePicker
                        value=""
                        onChange={insert}
                        placeholder={t('token.pick', 'Which variable?')}
                    />
                </span>
            )}
        </span>
    );
};

export default VariableTokenButton;
