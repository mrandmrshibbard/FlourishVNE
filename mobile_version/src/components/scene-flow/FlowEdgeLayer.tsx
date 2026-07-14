/**
 * Story Flow Map — the SVG edge layer.
 *
 * Sits UNDER the HTML node cards, inside the SAME transform wrapper, so the two layers can never
 * drift apart when you zoom or pan. Arrowhead <marker>s are hardcoded per colour: SVG markers can't
 * reliably inherit a path's stroke in Electron's Chromium, so one marker per palette colour it is.
 */
import React from 'react';
import { FlowEdge, FlowNode } from '../../utils/storyGraph';

export const NODE_W = 210;
export const NODE_H = 96;

type ColourKey = 'lavender' | 'pink' | 'cyan' | 'mint' | 'peach' | 'muted' | 'played';

/** Edge kind → theme colour. Never hex — always a CSS var, so themes keep working. */
const KIND_COLOUR: Record<FlowEdge['kind'], ColourKey> = {
    jump: 'lavender',
    label: 'lavender',
    choice: 'pink',
    outcome: 'cyan',
    call: 'mint',
    opens: 'mint',
    fallback: 'peach',
    fallthrough: 'muted',
};

const CSS_VAR: Record<ColourKey, string> = {
    lavender: 'var(--accent-lavender)',
    pink: 'var(--accent-pink)',
    cyan: 'var(--accent-cyan)',
    mint: 'var(--accent-mint)',
    peach: 'var(--accent-peach)',
    muted: 'var(--text-muted)',
    played: 'var(--accent-green, var(--accent-mint))',   // "you have played this route"
};

export function edgePath(from: { x: number; y: number }, to: { x: number; y: number }, isBack: boolean): string {
    const sx = from.x + NODE_W, sy = from.y + NODE_H / 2;   // out of the right edge
    const tx = to.x, ty = to.y + NODE_H / 2;                // into the left edge

    // Self-loop: a small arc off the right side back into itself.
    if (from.x === to.x && from.y === to.y) {
        const cx = sx + 54;
        return `M ${sx} ${sy - 8} C ${cx} ${sy - 46}, ${cx} ${sy + 46}, ${sx} ${sy + 8}`;
    }
    // Back-edge (the target sits to the LEFT — a loop in the story): swing out and under, so it
    // reads as "goes back", instead of cutting straight through the nodes between.
    if (isBack || tx < sx) {
        const dip = Math.max(60, Math.abs(ty - sy) * 0.4 + 60);
        return `M ${sx} ${sy} C ${sx + 70} ${sy + dip}, ${tx - 70} ${ty + dip}, ${tx} ${ty}`;
    }
    // Forward: a horizontal-tangent cubic bézier.
    const dx = Math.max(40, (tx - sx) * 0.5);
    return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
}

interface Props {
    edges: FlowEdge[];
    positions: Record<string, { x: number; y: number }>;
    backEdges: Set<string>;
    nodesByKey: Map<string, FlowNode>;
    /** Keys of the highlighted node's edges — everything else dims. null = no highlight. */
    highlighted: Set<string> | null;
    /**
     * Route coverage. When non-null, the kind palette is REPLACED: played routes go green, untested
     * routes go faint and grey. Mixing the two palettes would be unreadable — coverage is a mode.
     */
    coveredEdges: Set<string> | null;
    /**
     * "Follow a variable" mode: edges leaving a scene that CHANGED the variable. They get a comet of
     * light travelling along them, so you watch the value flow downstream instead of computing it.
     */
    flowingEdges: Set<string> | null;
    width: number;
    height: number;
}

/** Respect the OS setting — an animated loop is exactly what this is for. */
const prefersReducedMotion = () =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const FlowEdgeLayer: React.FC<Props> = ({ edges, positions, backEdges, highlighted, coveredEdges, flowingEdges, width, height }) => (
    <svg
        width={Math.max(width, 1)}
        height={Math.max(height, 1)}
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
    >
        <defs>
            {(Object.keys(CSS_VAR) as ColourKey[]).map(c => (
                <marker key={c} id={`flow-arrow-${c}`} viewBox="0 0 10 10" refX="9" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={CSS_VAR[c]} />
                </marker>
            ))}
            {/* The comet: a short bright dash that runs the length of the path, over and over.
                `stroke-dashoffset` is GPU-cheap and — unlike animateMotion — doesn't need a separate
                element per edge, so a hundred flowing edges still cost one style animation each. */}
            <style>{`
                @keyframes flourish-flow-comet { to { stroke-dashoffset: -1000; } }
                .flourish-flow-comet {
                    animation: flourish-flow-comet 2.4s linear infinite;
                    filter: drop-shadow(0 0 3px var(--accent-cyan));
                }
                @media (prefers-reduced-motion: reduce) {
                    .flourish-flow-comet { animation: none; }
                }
            `}</style>
        </defs>

        {edges.map(e => {
            const from = positions[e.from];
            const to = positions[e.to];
            if (!from || !to) return null;

            const isBack = backEdges.has(e.id);
            const played = coveredEdges ? coveredEdges.has(e.id) : null;
            const colour: ColourKey = played === null
                ? (KIND_COLOUR[e.kind] ?? 'muted')
                : (played ? 'played' : 'muted');
            const dim = highlighted ? !highlighted.has(e.id) : false;

            const isFallthrough = e.kind === 'fallthrough';
            // Conditional = "only sometimes" → dashed. Fall-through is always faint (it's the quiet default).
            const dash = e.conditional ? '6 4' : (e.kind === 'fallback' || e.kind === 'label' ? '4 3' : undefined);
            const baseOpacity = played === null
                ? (isFallthrough ? 0.38 : (e.conditional ? 0.75 : 0.95))
                // In coverage mode the untested routes are the POINT — they stay legible (not ghosted
                // like a fall-through), while played routes recede so the grey stands out.
                : (played ? 0.8 : 0.45);

            const midLabel = e.count > 1 ? `×${e.count}` : e.label;

            const d = edgePath(from, to, isBack);
            const flowing = !!flowingEdges?.has(e.id);

            return (
                <g key={e.id} opacity={dim ? 0.08 : 1} style={{ transition: 'opacity 120ms' }}>
                    <path
                        d={d}
                        fill="none"
                        stroke={CSS_VAR[colour]}
                        strokeWidth={played ? 2.5 : (isFallthrough && played === null ? 1.5 : 2)}
                        strokeDasharray={isBack && !dash ? '5 4' : dash}
                        strokeOpacity={baseOpacity}
                        markerEnd={`url(#flow-arrow-${colour})`}
                    />

                    {/* The light trail — a second copy of the SAME path, so it can never drift off it. */}
                    {flowing && !dim && (
                        <path
                            className={prefersReducedMotion() ? undefined : 'flourish-flow-comet'}
                            d={d}
                            fill="none"
                            stroke="var(--accent-cyan)"
                            strokeWidth={3}
                            strokeLinecap="round"
                            // A short lit segment (18) then a long gap (982) — one comet at a time, and
                            // the 1000-unit period matches the keyframe's dashoffset so it loops seamlessly.
                            strokeDasharray="18 982"
                            strokeOpacity={0.95}
                        />
                    )}
                    {!!midLabel && !dim && !isFallthrough && (() => {
                        // Park the label just outside the source node so it never sits under a card.
                        const lx = from.x + NODE_W + 14;
                        const ly = from.y + NODE_H / 2 - 6;
                        return (
                            <text x={lx} y={ly} fontSize={10} fill="var(--text-secondary)"
                                style={{ paintOrder: 'stroke', pointerEvents: 'none' }}
                                stroke="var(--bg-primary)" strokeWidth={3} strokeLinejoin="round">
                                {midLabel.length > 22 ? midLabel.slice(0, 21) + '…' : midLabel}
                            </text>
                        );
                    })()}
                </g>
            );
        })}
    </svg>
);

export default React.memo(FlowEdgeLayer);
