import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { useProject } from '../../contexts/ProjectContext';
import { BookOpenIcon, PlusIcon, SparklesIcon } from '../icons';
import { newSbId } from './StoryBibleManager';

/** Left pane (sections mode): the Story Bible's section list + the pinned Glossary nav item. */
const SectionListPane: React.FC<{
    project: VNProject;
    selectedSectionId: VNID | null;
    onSelect: (id: VNID) => void;
    onOpenGlossary: () => void;
}> = ({ project, selectedSectionId, onSelect, onOpenGlossary }) => {
    const { t } = useTranslation('storyBible');
    const { dispatch } = useProject();
    const sections = project.storyBible?.sections ?? [];
    const glossaryCount = Object.keys(project.glossary?.entries ?? {}).length;

    const addSection = () => {
        const id = newSbId();
        dispatch({ type: 'STORY_BIBLE_ADD_SECTION', payload: { section: { id, name: t('sections.newName', 'New section'), content: '', subsections: [] } } });
        onSelect(id);
    };

    return (
        <div className="w-80 bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] flex flex-col flex-shrink-0">
            <div className="p-4 border-b border-[var(--border-subtle)]">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <BookOpenIcon className="w-5 h-5" />
                    {t('title', 'Story Bible')}
                </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {sections.map((s, i) => (
                    <div
                        key={s.id}
                        onClick={() => onSelect(s.id)}
                        className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                            selectedSectionId === s.id ? 'bg-fuchsia-500/20 border border-fuchsia-500/50' : 'hover:bg-[var(--bg-secondary)] border border-transparent'
                        }`}
                    >
                        <span className="flex-1 text-sm truncate text-[var(--text-primary)]">{s.name || t('sections.unnamed', 'Untitled')}</span>
                        {s.subsections.length > 0 && <span className="text-[10px] text-[var(--text-muted)]">{s.subsections.length}</span>}
                        <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); dispatch({ type: 'STORY_BIBLE_MOVE_SECTION', payload: { sectionId: s.id, direction: -1 } }); }} disabled={i === 0} className="px-0.5 text-[10px] text-[var(--text-secondary)] hover:text-white disabled:opacity-25" title={t('sections.moveUp', 'Move up')}>↑</button>
                            <button onClick={(e) => { e.stopPropagation(); dispatch({ type: 'STORY_BIBLE_MOVE_SECTION', payload: { sectionId: s.id, direction: 1 } }); }} disabled={i === sections.length - 1} className="px-0.5 text-[10px] text-[var(--text-secondary)] hover:text-white disabled:opacity-25" title={t('sections.moveDown', 'Move down')}>↓</button>
                        </span>
                    </div>
                ))}
                {sections.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)] italic p-2">{t('sections.none', 'No sections yet.')}</p>
                )}
            </div>
            <div className="p-2 border-t border-[var(--border-subtle)] space-y-2">
                <button onClick={addSection} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white p-2 rounded-md flex items-center justify-center gap-2 font-bold text-sm transition-colors">
                    <PlusIcon className="w-4 h-4" />
                    {t('sections.add', 'Add section')}
                </button>
                {/* Pinned Glossary entry — switches the whole pane per Brad's design. */}
                <button
                    onClick={onOpenGlossary}
                    className="w-full flex items-center gap-2 p-2 rounded-md border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-sky-500/60 hover:bg-sky-500/10 transition-colors"
                    title={t('glossary.navHint', 'Words your players can hover in dialogue for an explanation')}
                >
                    <SparklesIcon className="w-4 h-4 text-sky-300" />
                    <span className="flex-1 text-left text-sm font-semibold">{t('glossary.title', 'Glossary')}</span>
                    {glossaryCount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300">{glossaryCount}</span>}
                    <span className="text-[var(--text-muted)]">→</span>
                </button>
            </div>
        </div>
    );
};

export default SectionListPane;
