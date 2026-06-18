import React from 'react';
import { VNProject } from '../../types/project';
import { VNReactiveTextboxState } from '../../features/ui/types';
import { FormField, TextInput } from './Form';
import ConditionsEditor from './ConditionsEditor';
import TextboxStyleFields from './TextboxStyleFields';

const genId = () => `dlgstate-${Math.random().toString(36).slice(2, 9)}`;

/**
 * Editor for the built-in dialogue box + nameplate variable-reactive states (projectUI.
 * dialogueReactiveStates). Each state: a condition set → textbox appearance overrides + optional
 * hide-nameplate + a transition. First matching state wins at runtime. Reuses ConditionsEditor and
 * the shared TextboxStyleFields so it matches the theme/character textbox editors.
 */
const DialogueReactiveStatesEditor: React.FC<{
    states: VNReactiveTextboxState[] | undefined;
    project: VNProject;
    onChange: (states: VNReactiveTextboxState[] | undefined) => void;
}> = ({ states, project, onChange }) => {
    const list = states || [];
    const set = (next: VNReactiveTextboxState[]) => onChange(next.length ? next : undefined);
    const patch = (i: number, p: Partial<VNReactiveTextboxState>) => {
        const n = [...list];
        n[i] = { ...n[i], ...p };
        set(n);
    };
    return (
        <div className="pt-2">
            <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-bold text-white">Reactive States</h4>
                <button
                    onClick={() => set([...list, { id: genId(), name: `State ${list.length + 1}`, conditions: [] }])}
                    className="text-xs px-2 py-0.5 rounded bg-purple-600/80 hover:bg-purple-600 text-white"
                >+ Add state</button>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mb-2">
                When a variable condition matches, the dialogue box + nameplate change look (first matching state wins). Add a transition to ease the change. Blank fields keep the current theme/character look.
            </p>
            {list.map((st, i) => (
                <div key={st.id} className="rounded bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-2 mb-2 space-y-2">
                    <div className="flex items-center gap-2">
                        <TextInput value={st.name || ''} onChange={e => patch(i, { name: e.target.value })} placeholder={`State ${i + 1}`} className="flex-1 text-xs" />
                        <button onClick={() => set(list.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 px-1" title="Delete state">×</button>
                    </div>
                    <ConditionsEditor collapsible title="When (conditions)" conditions={st.conditions} project={project} onChange={cs => patch(i, { conditions: cs })} />
                    <TextboxStyleFields value={st} onChange={p => patch(i, p)} />
                    <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
                        <input type="checkbox" checked={st.hideNamebox === true} onChange={e => patch(i, { hideNamebox: e.target.checked })} className="accent-purple-500" />
                        Hide nameplate while active
                    </label>
                    <FormField label="Transition (ms)">
                        <TextInput type="number" value={st.transitionMs ?? ''} onChange={e => patch(i, { transitionMs: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })} placeholder="0 = instant" />
                    </FormField>
                </div>
            ))}
        </div>
    );
};

export default DialogueReactiveStatesEditor;
