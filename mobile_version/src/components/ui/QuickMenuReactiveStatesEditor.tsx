import React from 'react';
import { VNProject } from '../../types/project';
import { VNReactiveQuickMenuState } from '../../features/ui/types';
import { FormField, TextInput, ColorInput } from './Form';
import ConditionsEditor from './ConditionsEditor';

const genId = () => `qmstate-${Math.random().toString(36).slice(2, 9)}`;

/**
 * Editor for the built-in Quick Menu bar variable-reactive states (projectUI.quickMenuReactiveStates).
 * Whole-bar only: each state is a condition set → bar color / opacity / hide + a transition. First
 * matching state wins at runtime.
 */
const QuickMenuReactiveStatesEditor: React.FC<{
    states: VNReactiveQuickMenuState[] | undefined;
    project: VNProject;
    onChange: (states: VNReactiveQuickMenuState[] | undefined) => void;
}> = ({ states, project, onChange }) => {
    const list = states || [];
    const set = (next: VNReactiveQuickMenuState[]) => onChange(next.length ? next : undefined);
    const patch = (i: number, p: Partial<VNReactiveQuickMenuState>) => {
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
                When a variable condition matches, the whole Quick Menu bar changes (first matching state wins). Add a transition to ease the change.
            </p>
            {list.map((st, i) => (
                <div key={st.id} className="rounded bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-2 mb-2 space-y-2">
                    <div className="flex items-center gap-2">
                        <TextInput value={st.name || ''} onChange={e => patch(i, { name: e.target.value })} placeholder={`State ${i + 1}`} className="flex-1 text-xs" />
                        <button onClick={() => set(list.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 px-1" title="Delete state">×</button>
                    </div>
                    <ConditionsEditor collapsible title="When (conditions)" conditions={st.conditions} project={project} onChange={cs => patch(i, { conditions: cs })} />
                    <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
                        <input type="checkbox" checked={st.hide === true} onChange={e => patch(i, { hide: e.target.checked })} className="accent-purple-500" />
                        Hide the whole bar while active
                    </label>
                    {!st.hide && (
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label="Bar color"><ColorInput value={st.color ?? ''} onChange={c => patch(i, { color: c || undefined })} /></FormField>
                            <FormField label="Opacity %"><TextInput type="number" value={st.opacity ?? ''} onChange={e => patch(i, { opacity: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })} placeholder="default" /></FormField>
                        </div>
                    )}
                    <FormField label="Transition (ms)">
                        <TextInput type="number" value={st.transitionMs ?? ''} onChange={e => patch(i, { transitionMs: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })} placeholder="0 = instant" />
                    </FormField>
                </div>
            ))}
        </div>
    );
};

export default QuickMenuReactiveStatesEditor;
