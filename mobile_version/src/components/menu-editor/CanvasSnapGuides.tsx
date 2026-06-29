import React from 'react';
import { SnapGuide } from '../../utils/canvasSnap';

/**
 * Renders smart-snapping alignment guide lines over a canvas. Shared by every editor
 * canvas (StagingArea / MenuEditor / InGameUIEditor). Absolutely positioned, non-interactive;
 * the parent must be `position: relative` (the stage container already is).
 *
 * Canvas-edge/center lines are amber; sibling-alignment lines are cyan.
 */
const CanvasSnapGuides: React.FC<{ guides: SnapGuide[] }> = ({ guides }) => {
    if (!guides || guides.length === 0) return null;
    return (
        // Very high z so guides draw ON TOP of dragged elements (a dragged sprite jumps to z 100000,
        // which would otherwise hide the alignment line behind it). Non-interactive (pointer-events none).
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 100001 }}>
            {guides.map((g, i) => {
                const color = g.kind === 'canvas' ? '#f59e0b' : '#22d3ee';
                if (g.axis === 'x') {
                    const top = g.span ? `${g.span[0]}%` : '0';
                    const height = g.span ? `${g.span[1] - g.span[0]}%` : '100%';
                    return <div key={i} style={{ position: 'absolute', left: `${g.at}%`, top, height, width: 0, borderLeft: `1px dashed ${color}` }} />;
                }
                const left = g.span ? `${g.span[0]}%` : '0';
                const width = g.span ? `${g.span[1] - g.span[0]}%` : '100%';
                return <div key={i} style={{ position: 'absolute', top: `${g.at}%`, left, width, height: 0, borderTop: `1px dashed ${color}` }} />;
            })}
        </div>
    );
};

export default CanvasSnapGuides;
