import React from 'react';
import { useProject } from '../contexts/ProjectContext';
import InGameUIEditor from './InGameUIEditor';

/**
 * A focused, popped-out part of the In-Game UI editor — either its canvas or its properties panel.
 * The shared view-state (selected surface + preview sub-states) is kept in sync with the main editor
 * (and the other popped part) by InGameUIEditor's own cross-window sync. Project edits flow back via
 * the existing project-state sync.
 */
const InGameWindow: React.FC<{ part: 'canvas' | 'properties' }> = ({ part }) => {
    const { project } = useProject();
    return (
        <div className="h-screen w-screen overflow-hidden bg-[var(--bg-primary)]">
            <InGameUIEditor
                project={project}
                showTree={false}
                showCanvas={part === 'canvas'}
                showProperties={part === 'properties'}
            />
        </div>
    );
};

export default InGameWindow;
