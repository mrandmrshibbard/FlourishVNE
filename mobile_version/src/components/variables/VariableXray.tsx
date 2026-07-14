/**
 * "Where is this used?" — the variable X-ray panel.
 *
 * Answers the question a writer actually asks, in the order they ask it:
 *   1. Is anything wrong with this?          → the health warnings, first, loudest
 *   2. What changes it? What checks it?      → the up/down/checked summary
 *   3. Show me.                              → the list, grouped, every row clickable
 *
 * The list is built by utils/variableUsage.ts. Clicking a row calls `onJump`, which the editor turns
 * into "switch tab, open that scene, select that step".
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VNProject } from '../../types/project';
import { VNID } from '../../types';
import {
    buildVariableUsageIndex, countUsages, UsageLocation, VariableUsage,
} from '../../utils/variableUsage';

const KIND_META: Record<string, { icon: string; colour: string }> = {
    set: { icon: '✎', colour: 'var(--accent-peach)' },
    ask: { icon: '⌨', colour: 'var(--accent-peach)' },
    check: { icon: '?', colour: 'var(--accent-lavender)' },
    show: { icon: '👁', colour: 'var(--accent-cyan)' },
};

export const VariableXray: React.FC<{
    project: VNProject;
    variableId: VNID;
    onJump?: (location: UsageLocation) => void;
}> = ({ project, variableId, onJump }) => {
    const { t } = useTranslation('variables');
    const [expanded, setExpanded] = useState(true);

    // The whole project is walked here. Memoized on the slices the walker actually reads, or it
    // re-walks every scene on every keystroke in the inspector above it.
    const index = useMemo(
        () => buildVariableUsageIndex(project),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [project.scenes, project.uiScreens, project.commonEvents, project.maps, project.miniGames,
         project.items, (project as any).itemCollections, (project as any).stats, (project as any).scripts,
         (project as any).cgGallery, (project as any).ui, project.variables],
    );

    const usages = index.byVariable.get(variableId) ?? [];
    const health = index.health.get(variableId);
    const counts = countUsages(usages);

    /** Group by place, so the list reads like a table of contents rather than 60 loose rows. */
    const groups = useMemo(() => {
        const m = new Map<string, VariableUsage[]>();
        for (const u of usages) {
            const key = u.where.split(' → ')[0];       // "Scene “Chapter 1”" — drop the step suffix
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(u);
        }
        return [...m.entries()];
    }, [usages]);

    const warn = (text: string, tone: 'bad' | 'warn') => (
        <p
            key={text}
            className="text-[11px] px-2 py-1.5 rounded-md"
            style={{
                background: `color-mix(in srgb, ${tone === 'bad' ? 'var(--accent-coral)' : 'var(--accent-yellow)'} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${tone === 'bad' ? 'var(--accent-coral)' : 'var(--accent-yellow)'} 40%, transparent)`,
                color: tone === 'bad' ? 'var(--accent-coral)' : 'var(--accent-yellow)',
            }}
        >
            {text}
        </p>
    );

    return (
        <div className="pt-4 border-t border-[var(--border-subtle)]">
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center justify-between text-sm font-medium text-[var(--text-primary)] mb-2"
            >
                <span>
                    {t('xray.title', 'Where this is used')}
                    <span className="ml-2 text-xs text-[var(--text-muted)]">
                        {counts.total === 0
                            ? t('xray.nowhere', 'nowhere yet')
                            : t('xray.count', '{{count}} places', { count: counts.total })}
                    </span>
                </span>
                <span className="text-[var(--text-muted)]">{expanded ? '▾' : '▸'}</span>
            </button>

            {/* Problems first — these are the ones that make an author think variables are broken. */}
            <div className="space-y-1 mb-2">
                {health?.orphan && warn(
                    t('xray.orphan', 'Nothing in your story uses this yet. It will just sit at its starting value.'),
                    'warn',
                )}
                {!health?.orphan && health?.neverChanged && warn(
                    t('xray.neverChanged', 'Nothing ever changes this, so it stays at its starting value for the whole game. Did you mean to change it somewhere?'),
                    'warn',
                )}
                {!health?.orphan && health?.neverUsed && warn(
                    t('xray.neverUsed', 'Nothing ever checks or shows this, so changing it can’t affect anything the player sees.'),
                    'warn',
                )}
                {(health?.impossible ?? []).map(p => warn(p, 'bad'))}
            </div>

            {expanded && (
                <>
                    {/* The summary a writer actually thinks in. */}
                    {counts.total > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2 text-[11px]">
                            {counts.up > 0 && <Pill colour="var(--accent-mint)">{t('xray.up', 'goes up in {{n}}', { n: counts.up })}</Pill>}
                            {counts.down > 0 && <Pill colour="var(--accent-coral)">{t('xray.down', 'goes down in {{n}}', { n: counts.down })}</Pill>}
                            {counts.set > 0 && <Pill colour="var(--accent-peach)">{t('xray.changed', 'changed in {{n}}', { n: counts.set })}</Pill>}
                            {counts.check > 0 && <Pill colour="var(--accent-lavender)">{t('xray.checked', 'checked in {{n}}', { n: counts.check })}</Pill>}
                            {counts.show > 0 && <Pill colour="var(--accent-cyan)">{t('xray.shown', 'shown in {{n}}', { n: counts.show })}</Pill>}
                        </div>
                    )}

                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {groups.map(([place, list]) => (
                            <div key={place}>
                                <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-0.5">{place}</p>
                                <div className="space-y-0.5">
                                    {list.map((u, i) => {
                                        const meta = KIND_META[u.kind] ?? KIND_META.show;
                                        const clickable = u.canJump && !!onJump;
                                        return (
                                            <button
                                                key={i}
                                                disabled={!clickable}
                                                onClick={() => clickable && onJump!(u.location)}
                                                title={clickable ? t('xray.jump', 'Take me there') : t('xray.noJump', 'This one can’t be opened directly')}
                                                className={`w-full text-left flex items-start gap-1.5 px-1.5 py-1 rounded-md text-[11px] transition-colors ${clickable ? 'hover:bg-[var(--bg-tertiary)] cursor-pointer' : 'cursor-default opacity-70'}`}
                                            >
                                                <span className="flex-shrink-0 mt-px" style={{ color: meta.colour }}>{meta.icon}</span>
                                                <span className="flex-grow min-w-0">
                                                    <span className="block text-[var(--text-primary)] truncate">{u.what}</span>
                                                    {/* The step suffix — "→ step 4" — is the useful half of `where` here. */}
                                                    {u.where.includes(' → ') && (
                                                        <span className="block text-[10px] text-[var(--text-muted)] truncate">
                                                            {u.where.split(' → ').slice(1).join(' → ')}
                                                        </span>
                                                    )}
                                                </span>
                                                {clickable && <span className="text-[var(--text-muted)] flex-shrink-0">›</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

const Pill: React.FC<{ colour: string; children: React.ReactNode }> = ({ colour, children }) => (
    <span
        className="px-1.5 py-0.5 rounded-full whitespace-nowrap"
        style={{
            background: `color-mix(in srgb, ${colour} 18%, transparent)`,
            color: colour,
            border: `1px solid color-mix(in srgb, ${colour} 40%, transparent)`,
        }}
    >
        {children}
    </span>
);

export default VariableXray;
