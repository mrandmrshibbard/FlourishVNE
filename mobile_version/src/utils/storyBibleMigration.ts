import { VNProject, VNStoryBibleSection, VNStoryBibleSubsection } from '../types/project';

const PLUGIN_ID = 'com.flourish.story-bible';

const newId = () => `sb-${Math.random().toString(36).slice(2, 9)}`;

/**
 * One-time lift of the old Story Bible PLUGIN's notes into the built-in `project.storyBible`.
 *
 * The plugin (public/story-bible.plugin.js) stored
 *   project.pluginStorage['com.flourish.story-bible'].bible =
 *     { fab, win, selected, sections: [{ id, name, content, subsections: [{id,name,content}] }] }
 * where fab/win/selected are floating-window UI state — dropped here.
 *
 * Idempotent: once `project.storyBible` exists (from this migration OR user edits), the plugin
 * blob is never read again — so later plugin writes can't clobber built-in edits. The blob is
 * deliberately NOT deleted (the plugin may still be installed and running against it).
 */
export function migrateStoryBiblePluginStorage(project: VNProject): VNProject {
    if (!project || project.storyBible) return project;
    const bible = project.pluginStorage?.[PLUGIN_ID]?.['bible'];
    if (!bible || !Array.isArray(bible.sections)) return project;

    const toSubsection = (raw: any): VNStoryBibleSubsection => ({
        id: typeof raw?.id === 'string' && raw.id ? raw.id : newId(),
        name: typeof raw?.name === 'string' ? raw.name : '',
        content: typeof raw?.content === 'string' ? raw.content : '',
    });
    const sections: VNStoryBibleSection[] = bible.sections
        .filter((s: any) => s && typeof s === 'object')
        .map((s: any): VNStoryBibleSection => ({
            id: typeof s.id === 'string' && s.id ? s.id : newId(),
            name: typeof s.name === 'string' ? s.name : '',
            content: typeof s.content === 'string' ? s.content : '',
            subsections: Array.isArray(s.subsections) ? s.subsections.filter((x: any) => x && typeof x === 'object').map(toSubsection) : [],
        }));

    return { ...project, storyBible: { sections } };
}
