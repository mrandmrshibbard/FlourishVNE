import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNProject, VNStoryBibleSection } from '../../types/project';
import { useProject } from '../../contexts/ProjectContext';
import { TrashIcon, PlusIcon } from '../icons';
import MarkdownEditor from './markdown/MarkdownEditor';
import { newSbId } from './StoryBibleManager';

/** Right pane (sections mode): the selected section's name, notes, and sub-sections. */
const SectionEditorPane: React.FC<{
    project: VNProject;
    section: VNStoryBibleSection;
    onDeleted: () => void;
}> = ({ section, onDeleted }) => {
    const { t } = useTranslation('storyBible');
    const { dispatch } = useProject();

    const deleteSection = () => {
        const msg = section.subsections.length > 0
            ? t('sections.deleteConfirmWithSubs', 'Delete "{{name}}" and its {{count}} sub-sections? This cannot be undone with the notes still inside.', { name: section.name, count: section.subsections.length })
            : t('sections.deleteConfirm', 'Delete "{{name}}"?', { name: section.name });
        if (!window.confirm(msg)) return;
        dispatch({ type: 'STORY_BIBLE_DELETE_SECTION', payload: { sectionId: section.id } });
        onDeleted();
    };

    return (
        <div className="p-6 space-y-4 max-w-3xl w-full mx-auto">
            <div className="flex items-center gap-2">
                <input
                    value={section.name}
                    onChange={e => dispatch({ type: 'STORY_BIBLE_UPDATE_SECTION', payload: { sectionId: section.id, updates: { name: e.target.value } } })}
                    placeholder={t('sections.namePlaceholder', 'Section name')}
                    className="flex-1 bg-transparent text-xl font-bold text-white outline-none border-b border-transparent focus:border-fuchsia-500/50 pb-1"
                />
                <button onClick={deleteSection} className="p-1.5 text-red-400 hover:text-red-300 rounded hover:bg-red-500/10" title={t('sections.delete', 'Delete section')}>
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>

            <MarkdownEditor
                value={section.content}
                onChange={content => dispatch({ type: 'STORY_BIBLE_UPDATE_SECTION', payload: { sectionId: section.id, updates: { content } } })}
            />

            {section.subsections.map(ss => (
                <div key={ss.id} className="rounded-md border border-[var(--border-subtle)] p-3 space-y-2 bg-[var(--bg-secondary)]/40">
                    <div className="flex items-center gap-2">
                        <input
                            value={ss.name}
                            onChange={e => dispatch({ type: 'STORY_BIBLE_UPDATE_SUBSECTION', payload: { sectionId: section.id, subsectionId: ss.id, updates: { name: e.target.value } } })}
                            placeholder={t('subsections.namePlaceholder', 'Sub-section name')}
                            className="flex-1 bg-transparent text-sm font-semibold text-slate-100 outline-none border-b border-transparent focus:border-fuchsia-500/50"
                        />
                        <button
                            onClick={() => { if (window.confirm(t('subsections.deleteConfirm', 'Delete "{{name}}"?', { name: ss.name }))) dispatch({ type: 'STORY_BIBLE_DELETE_SUBSECTION', payload: { sectionId: section.id, subsectionId: ss.id } }); }}
                            className="p-1 text-red-400 hover:text-red-300 rounded hover:bg-red-500/10"
                            title={t('subsections.delete', 'Delete sub-section')}
                        >
                            <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <MarkdownEditor
                        value={ss.content}
                        minRows={4}
                        onChange={content => dispatch({ type: 'STORY_BIBLE_UPDATE_SUBSECTION', payload: { sectionId: section.id, subsectionId: ss.id, updates: { content } } })}
                    />
                </div>
            ))}

            <button
                onClick={() => dispatch({ type: 'STORY_BIBLE_ADD_SUBSECTION', payload: { sectionId: section.id, subsection: { id: newSbId(), name: t('subsections.newName', 'New sub-section'), content: '' } } })}
                className="w-full flex items-center justify-center gap-2 p-2 rounded-md border border-dashed border-[var(--border-subtle)] text-sm text-[var(--text-secondary)] hover:text-white hover:border-fuchsia-500/50 transition-colors"
            >
                <PlusIcon className="w-4 h-4" />
                {t('subsections.add', 'Add sub-section')}
            </button>
        </div>
    );
};

export default SectionEditorPane;
