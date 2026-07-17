import { VNID } from '../../../types';
import { VNProject, VNStoryBibleSection, VNStoryBibleSubsection, VNGlossaryEntry, VNGlossarySettings } from '../../../types/project';

/**
 * Story Bible (writer's notes) + Glossary slice. Both collections are additive-optional on
 * VNProject, so every case lazy-inits absent fields and never assumes they exist.
 */
export type StoryBibleAction =
    | { type: 'STORY_BIBLE_ADD_SECTION'; payload: { section: VNStoryBibleSection } }
    | { type: 'STORY_BIBLE_UPDATE_SECTION'; payload: { sectionId: VNID; updates: Partial<Pick<VNStoryBibleSection, 'name' | 'content'>> } }
    | { type: 'STORY_BIBLE_DELETE_SECTION'; payload: { sectionId: VNID } }
    | { type: 'STORY_BIBLE_MOVE_SECTION'; payload: { sectionId: VNID; direction: -1 | 1 } }
    | { type: 'STORY_BIBLE_ADD_SUBSECTION'; payload: { sectionId: VNID; subsection: VNStoryBibleSubsection } }
    | { type: 'STORY_BIBLE_UPDATE_SUBSECTION'; payload: { sectionId: VNID; subsectionId: VNID; updates: Partial<Pick<VNStoryBibleSubsection, 'name' | 'content'>> } }
    | { type: 'STORY_BIBLE_DELETE_SUBSECTION'; payload: { sectionId: VNID; subsectionId: VNID } }
    | { type: 'GLOSSARY_ADD_ENTRY'; payload: { entry: VNGlossaryEntry } }
    | { type: 'GLOSSARY_UPDATE_ENTRY'; payload: { entryId: VNID; updates: Partial<Omit<VNGlossaryEntry, 'id'>> } }
    | { type: 'GLOSSARY_DELETE_ENTRY'; payload: { entryId: VNID } }
    | { type: 'GLOSSARY_IMPORT_ENTRIES'; payload: { entries: VNGlossaryEntry[]; settings?: VNGlossarySettings } }
    | { type: 'GLOSSARY_UPDATE_SETTINGS'; payload: { updates: Partial<VNGlossarySettings> } };

const withSections = (state: VNProject, sections: VNStoryBibleSection[]): VNProject =>
    ({ ...state, storyBible: { ...(state.storyBible || {}), sections } });

const withGlossary = (state: VNProject, entries: Record<VNID, VNGlossaryEntry>, settings?: VNGlossarySettings): VNProject =>
    ({ ...state, glossary: { entries, settings: settings ?? state.glossary?.settings } });

export const storyBibleReducer = (state: VNProject, action: StoryBibleAction): VNProject => {
    switch (action.type) {
        case 'STORY_BIBLE_ADD_SECTION': {
            const sections = state.storyBible?.sections ?? [];
            return withSections(state, [...sections, action.payload.section]);
        }
        case 'STORY_BIBLE_UPDATE_SECTION': {
            const sections = state.storyBible?.sections ?? [];
            if (!sections.some(s => s.id === action.payload.sectionId)) return state;
            return withSections(state, sections.map(s => s.id === action.payload.sectionId ? { ...s, ...action.payload.updates } : s));
        }
        case 'STORY_BIBLE_DELETE_SECTION': {
            const sections = state.storyBible?.sections ?? [];
            if (!sections.some(s => s.id === action.payload.sectionId)) return state;
            return withSections(state, sections.filter(s => s.id !== action.payload.sectionId));
        }
        case 'STORY_BIBLE_MOVE_SECTION': {
            const sections = [...(state.storyBible?.sections ?? [])];
            const i = sections.findIndex(s => s.id === action.payload.sectionId);
            const j = i + action.payload.direction;
            if (i < 0 || j < 0 || j >= sections.length) return state;
            [sections[i], sections[j]] = [sections[j], sections[i]];
            return withSections(state, sections);
        }
        case 'STORY_BIBLE_ADD_SUBSECTION': {
            const sections = state.storyBible?.sections ?? [];
            if (!sections.some(s => s.id === action.payload.sectionId)) return state;
            return withSections(state, sections.map(s => s.id === action.payload.sectionId
                ? { ...s, subsections: [...(s.subsections || []), action.payload.subsection] }
                : s));
        }
        case 'STORY_BIBLE_UPDATE_SUBSECTION': {
            const sections = state.storyBible?.sections ?? [];
            const sec = sections.find(s => s.id === action.payload.sectionId);
            if (!sec?.subsections?.some(ss => ss.id === action.payload.subsectionId)) return state;
            return withSections(state, sections.map(s => s.id === action.payload.sectionId
                ? { ...s, subsections: s.subsections.map(ss => ss.id === action.payload.subsectionId ? { ...ss, ...action.payload.updates } : ss) }
                : s));
        }
        case 'STORY_BIBLE_DELETE_SUBSECTION': {
            const sections = state.storyBible?.sections ?? [];
            const sec = sections.find(s => s.id === action.payload.sectionId);
            if (!sec?.subsections?.some(ss => ss.id === action.payload.subsectionId)) return state;
            return withSections(state, sections.map(s => s.id === action.payload.sectionId
                ? { ...s, subsections: s.subsections.filter(ss => ss.id !== action.payload.subsectionId) }
                : s));
        }
        case 'GLOSSARY_ADD_ENTRY': {
            const entries = state.glossary?.entries ?? {};
            return withGlossary(state, { ...entries, [action.payload.entry.id]: action.payload.entry });
        }
        case 'GLOSSARY_UPDATE_ENTRY': {
            const entries = state.glossary?.entries ?? {};
            const existing = entries[action.payload.entryId];
            if (!existing) return state;
            return withGlossary(state, { ...entries, [action.payload.entryId]: { ...existing, ...action.payload.updates, id: action.payload.entryId } });
        }
        case 'GLOSSARY_DELETE_ENTRY': {
            const entries = state.glossary?.entries ?? {};
            if (!entries[action.payload.entryId]) return state;
            const next = { ...entries };
            delete next[action.payload.entryId];
            return withGlossary(state, next);
        }
        case 'GLOSSARY_IMPORT_ENTRIES': {
            // Merge-by-term (case-insensitive): an imported entry replaces an existing one with
            // the same term, KEEPING the existing id (so nothing else that might reference it
            // breaks); new terms are added, regenerating colliding ids.
            const entries = { ...(state.glossary?.entries ?? {}) };
            const byTerm = new Map(Object.values(entries).map(e => [e.term.trim().toLowerCase(), e.id]));
            for (const raw of action.payload.entries) {
                if (!raw?.term?.trim()) continue;
                const existingId = byTerm.get(raw.term.trim().toLowerCase());
                if (existingId) {
                    entries[existingId] = { ...raw, id: existingId };
                } else {
                    let id = raw.id || `gl-${Math.random().toString(36).slice(2, 9)}`;
                    while (entries[id]) id = `gl-${Math.random().toString(36).slice(2, 9)}`;
                    entries[id] = { ...raw, id };
                    byTerm.set(raw.term.trim().toLowerCase(), id);
                }
            }
            const settings = action.payload.settings
                ? { ...(state.glossary?.settings || {}), ...action.payload.settings }
                : state.glossary?.settings;
            return withGlossary(state, entries, settings);
        }
        case 'GLOSSARY_UPDATE_SETTINGS': {
            const entries = state.glossary?.entries ?? {};
            return withGlossary(state, entries, { ...(state.glossary?.settings || {}), ...action.payload.updates });
        }
        default:
            return state;
    }
};
