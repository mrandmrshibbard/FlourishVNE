import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { useProject } from '../../contexts/ProjectContext';
import { BookOpenIcon } from '../icons';
import SectionListPane from './SectionListPane';
import SectionEditorPane from './SectionEditorPane';
import GlossaryListPane from './GlossaryListPane';
import GlossaryEntryEditor from './GlossaryEntryEditor';

const PLUGIN_ID = 'com.flourish.story-bible';
const BANNER_DISMISS_KEY = 'flourish-sb-plugin-banner-dismissed';

export const newSbId = () => `sb-${Math.random().toString(36).slice(2, 9)}`;
export const newGlossaryId = () => `gl-${Math.random().toString(36).slice(2, 9)}`;

/**
 * The Story Bible tab: writer's notes (sections + subsections, markdown-lite) with a pinned
 * Glossary section — clicking it swaps the left pane to the glossary entry list and the right
 * pane to the entry editor (Brad's layout). Notes are editor-only (stripped from game builds);
 * the glossary ships with the game.
 */
const StoryBibleManager: React.FC<{ project: VNProject }> = ({ project }) => {
    const { t } = useTranslation('storyBible');
    const { dispatch } = useProject();
    const [mode, setMode] = useState<'sections' | 'glossary'>('sections');
    const [selectedSectionId, setSelectedSectionId] = useState<VNID | null>(null);
    const [selectedEntryId, setSelectedEntryId] = useState<VNID | null>(null);
    const [bannerDismissed, setBannerDismissed] = useState<boolean>(() => {
        try { return localStorage.getItem(BANNER_DISMISS_KEY) === '1'; } catch { return true; }
    });

    const sections = project.storyBible?.sections ?? [];
    const selectedSection = sections.find(s => s.id === selectedSectionId) ?? null;
    const selectedEntry = selectedEntryId ? project.glossary?.entries?.[selectedEntryId] ?? null : null;

    const pluginInstalled = !!(project.plugins?.[PLUGIN_ID] || (project.pluginRegistry as any)?.[PLUGIN_ID]);
    const dismissBanner = () => {
        setBannerDismissed(true);
        try { localStorage.setItem(BANNER_DISMISS_KEY, '1'); } catch { /* ignore */ }
    };

    const createStarterSections = () => {
        const names = [
            t('starter.synopsis', 'Synopsis'),
            t('starter.chapters', 'Chapters'),
            t('starter.characters', 'Characters'),
            t('starter.locations', 'Locations'),
            t('starter.arcs', 'Story Arcs'),
        ];
        let firstId: VNID | null = null;
        for (const name of names) {
            const id = newSbId();
            if (!firstId) firstId = id;
            dispatch({ type: 'STORY_BIBLE_ADD_SECTION', payload: { section: { id, name, content: '', subsections: [] } } });
        }
        if (firstId) setSelectedSectionId(firstId);
    };

    return (
        <div className="flex flex-col h-full">
            {pluginInstalled && !bannerDismissed && (
                <div className="flex items-center gap-3 px-4 py-2 bg-fuchsia-500/10 border-b border-fuchsia-500/30 text-xs text-fuchsia-200 flex-shrink-0">
                    <BookOpenIcon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{t('pluginBanner.text', 'The Story Bible is now built into the editor, and your notes from the old plugin were imported here. You can safely uninstall the plugin from Tools → Plugin Manager.')}</span>
                    <button onClick={dismissBanner} className="px-2 py-0.5 rounded border border-fuchsia-500/40 hover:bg-fuchsia-500/20">{t('pluginBanner.dismiss', 'Got it')}</button>
                </div>
            )}
            <div className="flex flex-1 min-h-0">
                {mode === 'sections' ? (
                    <>
                        <SectionListPane
                            project={project}
                            selectedSectionId={selectedSectionId}
                            onSelect={setSelectedSectionId}
                            onOpenGlossary={() => setMode('glossary')}
                        />
                        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                            {selectedSection ? (
                                <SectionEditorPane
                                    key={selectedSection.id}
                                    project={project}
                                    section={selectedSection}
                                    onDeleted={() => setSelectedSectionId(null)}
                                />
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
                                    <div className="text-center max-w-md px-6">
                                        <BookOpenIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                        <p className="text-lg mb-1">{t('empty.title', 'Your Story Bible')}</p>
                                        <p className="text-sm mb-4">{t('empty.body', 'Keep everything about your story in one place — synopsis, character notes, places, plot arcs. Only you see this: it never ships with your game.')}</p>
                                        {sections.length === 0 && (
                                            <button onClick={createStarterSections} className="px-4 py-2 rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-semibold">
                                                {t('empty.starterButton', 'Create starter sections')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <GlossaryListPane
                            project={project}
                            selectedEntryId={selectedEntryId}
                            onSelect={setSelectedEntryId}
                            onBack={() => setMode('sections')}
                        />
                        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                            {selectedEntry ? (
                                <GlossaryEntryEditor
                                    key={selectedEntry.id}
                                    project={project}
                                    entry={selectedEntry}
                                    onDeleted={() => setSelectedEntryId(null)}
                                />
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
                                    <div className="text-center max-w-md px-6">
                                        <span className="block text-4xl mb-3">📖</span>
                                        <p className="text-lg mb-1">{t('glossary.emptyTitle', 'Glossary')}</p>
                                        <p className="text-sm">{t('glossary.emptyBody', 'Add words your players might not know. When one appears in dialogue it gets highlighted, and hovering it shows your explanation.')}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default StoryBibleManager;
