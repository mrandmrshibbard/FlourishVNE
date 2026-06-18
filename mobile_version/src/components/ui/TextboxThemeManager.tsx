import React from 'react';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { VNTextboxTheme } from '../../features/character/types';
import { useProject } from '../../contexts/ProjectContext';
import { FormField, TextInput } from './Form';
import TextboxStyleFields from './TextboxStyleFields';
import { TrashIcon, PlusIcon } from '../icons';

const genId = () => `tbtheme-${Math.random().toString(36).slice(2, 9)}`;

/**
 * Manager for reusable dialogue textbox themes (project.textboxThemes). Create/rename/delete themes
 * and edit a selected theme's appearance with the shared TextboxStyleFields. Lives in the In-Game UI
 * Editor's right panel; the selected theme is lifted to the parent so the canvas can preview it.
 */
const TextboxThemeManager: React.FC<{
    project: VNProject;
    selectedThemeId: VNID | null;
    onSelect: (id: VNID | null) => void;
}> = ({ project, selectedThemeId, onSelect }) => {
    const { dispatch } = useProject();
    const themes = Object.values(project.textboxThemes || {}) as VNTextboxTheme[];
    const selected = selectedThemeId ? project.textboxThemes?.[selectedThemeId] : undefined;

    const addTheme = () => {
        const id = genId();
        dispatch({ type: 'ADD_TEXTBOX_THEME', payload: { id, name: `Theme ${themes.length + 1}` } });
        onSelect(id);
    };

    return (
        <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Textbox Themes</h3>
                <button onClick={addTheme} className="text-xs px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white flex items-center gap-1">
                    <PlusIcon className="w-3 h-3" /> New
                </button>
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">
                Reusable dialogue box / nameplate designs. Assign one to a character (Character editor) or override per line on a Dialogue command. Blank fields fall back to the project default.
            </p>

            {themes.length === 0 && (
                <p className="text-xs text-[var(--text-muted)] italic py-2">No themes yet. Click “New” to create one.</p>
            )}

            <div className="space-y-1">
                {themes.map(th => (
                    <div
                        key={th.id}
                        onClick={() => onSelect(th.id)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${selectedThemeId === th.id ? 'bg-sky-500/20 border border-sky-500/40' : 'hover:bg-[var(--bg-secondary)] border border-transparent'}`}
                    >
                        <span className="flex-1 text-xs text-[var(--text-primary)] truncate">{th.name}</span>
                        <button
                            onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_TEXTBOX_THEME', payload: { themeId: th.id } }); if (selectedThemeId === th.id) onSelect(null); }}
                            className="text-red-400 hover:text-red-300 p-0.5"
                            title="Delete theme"
                        >
                            <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}
            </div>

            {selected && (
                <div className="pt-2 border-t border-[var(--border-subtle)] space-y-3">
                    <FormField label="Theme name">
                        <TextInput value={selected.name} onChange={e => dispatch({ type: 'UPDATE_TEXTBOX_THEME', payload: { themeId: selected.id, updates: { name: e.target.value } } })} />
                    </FormField>
                    <TextboxStyleFields
                        value={selected}
                        onChange={patch => dispatch({ type: 'UPDATE_TEXTBOX_THEME', payload: { themeId: selected.id, updates: patch } })}
                    />
                </div>
            )}
        </div>
    );
};

export default TextboxThemeManager;
