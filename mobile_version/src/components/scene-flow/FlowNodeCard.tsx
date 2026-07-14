/**
 * Story Flow Map — one node card.
 *
 * React.memo'd on purpose: panning changes ONE transform on the wrapper, so with memoized cards a
 * pan is a single style write instead of 500 re-renders.
 *
 * All copy is plain language for non-coders — "steps", not "commands"; "Nothing leads here", not
 * "unreachable node".
 */
import React from 'react';
import { FlowNode, FlowNodeKind } from '../../utils/storyGraph';
import { NODE_W, NODE_H } from './FlowEdgeLayer';

const KIND_META: Record<FlowNodeKind, { icon: string; colour: string }> = {
    scene: { icon: '🎬', colour: 'var(--accent-pink)' },
    screen: { icon: '🖼', colour: 'var(--accent-cyan)' },
    commonEvent: { icon: '🔁', colour: 'var(--accent-mint)' },
    miniGame: { icon: '🎮', colour: 'var(--accent-yellow)' },
    map: { icon: '🗺', colour: 'var(--accent-sky)' },
};

interface Props {
    node: FlowNode;
    pos: { x: number; y: number };
    isActive: boolean;       // the scene currently open in the editor
    isSelected: boolean;
    isDimmed: boolean;
    /** Any scene in the project has an unknowable (script) route → soften "nothing leads here". */
    softenUnreachable: boolean;
    /** Route coverage, when the coverage view is on: has the author ever played this node? null = view off. */
    played: boolean | null;
    /** "Follow a variable" mode: what this node does to it, and what you could arrive carrying. */
    flow: { summary: string; arrive: string | null; unbounded: boolean } | null;
    sceneNameById: (id: string) => string;
    onPointerDown: (e: React.PointerEvent, key: string) => void;
    onDoubleClick: (node: FlowNode) => void;
    onHover: (key: string | null) => void;
    t: (k: string, d: string, o?: any) => string;
}

const Badge: React.FC<{ colour: string; children: React.ReactNode; title?: string }> = ({ colour, children, title }) => (
    <span title={title}
        className="text-[9px] leading-none px-1.5 py-0.5 rounded-full whitespace-nowrap"
        style={{ background: `color-mix(in srgb, ${colour} 22%, transparent)`, color: colour, border: `1px solid color-mix(in srgb, ${colour} 45%, transparent)` }}>
        {children}
    </span>
);

const FlowNodeCard: React.FC<Props> = ({
    node, pos, isActive, isSelected, isDimmed, softenUnreachable, played, flow, sceneNameById, onPointerDown, onDoubleClick, onHover, t,
}) => {
    const meta = KIND_META[node.kind];
    const isEnding = node.isTerminalOnly;

    const border = isActive || isSelected
        ? `2px solid var(--accent-pink)`
        : played === true
            ? `2px solid var(--accent-green)`
            : isEnding
                ? `2px solid var(--accent-yellow)`
                : `1px solid var(--border-subtle)`;

    // Coverage view: a played card gets a faint green wash; an untested one just stays plain, so the
    // eye is drawn to what's MISSING rather than to what's done.
    const background = played === true
        ? 'color-mix(in srgb, var(--accent-green) 10%, var(--bg-secondary))'
        : 'var(--bg-secondary)';

    return (
        <div
            onPointerDown={(e) => onPointerDown(e, node.key)}
            onDoubleClick={() => onDoubleClick(node)}
            onMouseEnter={() => onHover(node.key)}
            onMouseLeave={() => onHover(null)}
            title={node.name}
            style={{
                position: 'absolute', left: pos.x, top: pos.y, width: NODE_W, height: NODE_H,
                background,
                border,
                borderRadius: 12,
                boxShadow: isSelected || isActive ? '0 4px 18px -4px var(--accent-pink)' : '0 2px 8px rgba(0,0,0,0.35)',
                opacity: isDimmed ? 0.28 : 1,
                cursor: 'grab',
                userSelect: 'none',
                overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                transition: 'opacity 120ms, border-color 120ms',
            }}
        >
            {/* kind stripe */}
            <div style={{ height: 3, background: meta.colour, flexShrink: 0 }} />

            <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0, flex: 1 }}>
                <div className="flex items-center gap-1.5">
                    <span style={{ fontSize: 11 }}>{meta.icon}</span>
                    <span className="truncate font-semibold" style={{ color: 'var(--text-primary)', fontSize: 12 }}>{node.name}</span>
                </div>

                {/* Following a variable? Then the variable IS the subtitle — what this scene does to
                    it, and what the player could be carrying when they get here. */}
                {flow ? (
                    <div className="flex items-center gap-1.5 truncate" style={{ fontSize: 10 }}>
                        {flow.summary ? (
                            <span
                                className="px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap flex-shrink-0"
                                style={{
                                    background: 'color-mix(in srgb, var(--accent-cyan) 22%, transparent)',
                                    color: 'var(--accent-cyan)',
                                }}
                            >
                                {flow.summary}
                            </span>
                        ) : (
                            <span style={{ color: 'var(--text-muted)' }}>{t('flowMap.flowNoChange', 'no change')}</span>
                        )}
                        <span className="truncate" style={{ color: 'var(--text-muted)' }}>
                            {flow.unbounded
                                ? t('flowMap.flowUnbounded', 'a loop keeps raising this')
                                : flow.arrive
                                    ? t('flowMap.flowArrive', 'arrive with {{range}}', { range: flow.arrive })
                                    : t('flowMap.flowNever', 'never reached')}
                        </span>
                    </div>
                ) : (
                    <div className="truncate" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                        {node.alwaysRuns
                            ? t('flowMap.alwaysRuns', 'Runs in every scene')
                            : node.subtitle}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-1 mt-auto">
                    {played === false && (
                        <Badge colour="var(--text-muted)"
                            title={t('flowMap.neverPlayedHint', 'You have never reached this while test-playing. Play your story and it will turn green.')}>
                            {t('flowMap.badgeNeverPlayed', '👁 Never played')}
                        </Badge>
                    )}
                    {played === true && (
                        <Badge colour="var(--accent-green)" title={t('flowMap.playedHint', 'You have reached this while test-playing.')}>
                            {t('flowMap.badgePlayed', '✓ Played')}
                        </Badge>
                    )}
                    {node.isStart && <Badge colour="var(--accent-mint)">{t('flowMap.badgeStart', '▶ Start')}</Badge>}
                    {isEnding && <Badge colour="var(--accent-yellow)">{t('flowMap.badgeEnding', '🏁 Ending')}</Badge>}
                    {node.isUnreachable && !node.isStart && (
                        <Badge colour="var(--accent-peach)"
                            title={softenUnreachable
                                ? t('flowMap.unreachableSoftHint', 'Nothing on this map leads here — but a script might send the player here.')
                                : t('flowMap.unreachableHint', 'No choice or jump anywhere in your story leads to this scene.')}>
                            {t('flowMap.badgeUnreachable', '⚠ Nothing leads here')}
                        </Badge>
                    )}
                    {node.isDeadEnd && (
                        <Badge colour="var(--accent-coral)" title={t('flowMap.deadEndHint', 'The player arrives here and the story has nowhere to go next.')}>
                            {t('flowMap.badgeDeadEnd', '⛔ Stops here')}
                        </Badge>
                    )}
                    {/* The quiet-fall-through warning: the scene just runs on into the next one. */}
                    {node.fallsThroughTo && (
                        <Badge colour="var(--text-muted)"
                            title={t('flowMap.fallthroughHint', 'This scene has no ending or jump, so it quietly continues to "{{name}}". Did you mean that?', { name: sceneNameById(node.fallsThroughTo) })}>
                            {t('flowMap.badgeFallthrough', '↳ Continues on')}
                        </Badge>
                    )}
                    {node.hasDynamicExit && (
                        <Badge colour="var(--text-muted)" title={t('flowMap.dynamicHint', 'A script here can send the player somewhere the map cannot predict.')}>
                            {t('flowMap.badgeDynamic', '? Script jump')}
                        </Badge>
                    )}
                </div>
            </div>
        </div>
    );
};

export default React.memo(FlowNodeCard);
