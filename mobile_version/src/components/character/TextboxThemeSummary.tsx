/**
 * "This character's dialogue box" — a read-only summary shown on the character editor's MAIN
 * tab, with a button that jumps to the tab that actually edits it.
 *
 * Why this exists: characters have supported their own textbox theme (`textboxThemeId`) and an
 * inline look (`textbox`) for a long time, and the runtime honours them — per-line override
 * first, then the character's theme with their inline tweaks layered on top, then the project
 * default. But the controls live on a *different* tab from where people build a character, so
 * authors never found them and set the theme on every single dialogue line by hand instead.
 *
 * Deliberately read-only: duplicating the editing controls would mean two places to keep in
 * sync. This one only shows what's set and points at where to change it.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNProject } from '../../types/project';
import { VNCharacter } from '../../features/character/types';

interface Props {
    character: VNCharacter;
    project: VNProject;
    /** Switch the editor to the tab holding the real controls. */
    onEdit: () => void;
}

const TextboxThemeSummary: React.FC<Props> = ({ character, project, onEdit }) => {
    // Own the namespace rather than taking `t` as a prop: the i18n coverage scanner only reads
    // files that call useTranslation, so a prop-drilled `t` would leave these strings invisible
    // to it — reported as translated while actually being English everywhere.
    const { t } = useTranslation('characters');
    const themes = (project.textboxThemes || {}) as Record<string, { id: string; name: string }>;
    const theme = character.textboxThemeId ? themes[character.textboxThemeId] : undefined;
    // A theme id pointing at a deleted theme shouldn't read as "no theme" — say so plainly.
    const themeMissing = !!character.textboxThemeId && !theme;
    const hasOwnLook = !!character.textbox && Object.keys(character.textbox).length > 0;

    let summary: string;
    if (themeMissing) summary = t('textboxSummary.missing', 'That theme was deleted — pick another');
    else if (theme && hasOwnLook) summary = t('textboxSummary.themePlusOwn', '{{name}} + your own tweaks').replace('{{name}}', theme.name);
    else if (theme) summary = theme.name;
    else if (hasOwnLook) summary = t('textboxSummary.ownOnly', 'A custom look, just for them');
    else summary = t('textboxSummary.projectDefault', "Your project's usual dialogue box");

    return (
        <div
            className="flex items-center gap-2 rounded-lg border p-2"
            style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}
        >
            <span className="text-lg flex-shrink-0" aria-hidden="true">💬</span>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {t('textboxSummary.title', 'When they speak')}
                </p>
                <p
                    className="text-[10px] truncate"
                    style={{ color: themeMissing ? 'var(--accent-amber, #fbbf24)' : 'var(--text-muted)' }}
                    title={summary}
                >
                    {summary}
                </p>
            </div>
            <button
                onClick={onEdit}
                className="text-xs px-2 py-1 rounded-md flex-shrink-0"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
                {t('textboxSummary.change', 'Change')}
            </button>
        </div>
    );
};

export default TextboxThemeSummary;
