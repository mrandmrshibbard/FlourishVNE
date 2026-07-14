import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommandType } from '../../../features/scene/types';
import { UIActionType } from '../../../types/shared';

// The map only needs the project + a dispatch; stub the providers so this stays a pure render test.
const dispatch = vi.fn();
vi.mock('../../../contexts/ProjectContext', () => ({ useProject: () => ({ dispatch }) }));
vi.mock('react-i18next', () => ({
    // Return the English fallback the component passes in — that's what a user actually sees.
    useTranslation: () => ({ t: (_k: string, d?: any, o?: any) => (typeof d === 'string' ? d.replace('{{name}}', o?.name ?? '') : _k) }),
}));

import SceneFlowMap from '../SceneFlowMap';

const project: any = {
    id: 'p', title: 'P',
    startSceneId: 'intro',
    scenes: {
        intro: { id: 'intro', name: 'Intro', commands: [{ id: 'c', type: CommandType.Jump, targetSceneId: 'good' }] },
        orphan: { id: 'orphan', name: 'Lost Scene', commands: [] },
        good: {
            id: 'good', name: 'Good End',
            commands: [{ id: 'b', type: CommandType.ShowButton, text: 'Fin', onClick: { type: UIActionType.QuitToTitle } }],
        },
    },
    uiScreens: {}, commonEvents: {}, maps: {}, miniGames: {}, items: {}, ui: {},
};

const props: any = {
    project, activeSceneId: 'intro',
    setActiveSceneId: vi.fn(), selectedCommandIndex: null, setSelectedCommandIndex: vi.fn(),
    setSelectedVariableId: vi.fn(), onConfigureScene: vi.fn(), isCollapsed: false, onToggleCollapse: vi.fn(),
    onOpenScene: vi.fn(),
};

describe('SceneFlowMap (render)', () => {
    it('renders a node card for every scene', () => {
        render(<SceneFlowMap {...props} />);
        expect(screen.getByText('Intro')).toBeTruthy();
        expect(screen.getByText('Good End')).toBeTruthy();
        expect(screen.getByText('Lost Scene')).toBeTruthy();
    });

    it('surfaces the diagnostics a writer actually needs', () => {
        render(<SceneFlowMap {...props} />);
        expect(screen.getByText('▶ Start')).toBeTruthy();            // the start scene
        expect(screen.getByText('🏁 Ending')).toBeTruthy();          // Good End quits to title
        expect(screen.getByText('⚠ Nothing leads here')).toBeTruthy(); // the orphan
    });

    it('draws the edges as SVG paths', () => {
        const { container } = render(<SceneFlowMap {...props} />);
        // intro→good (jump) + orphan→good (fall-through, since Lost Scene has no exit)
        const paths = container.querySelectorAll('svg path[marker-end]');
        expect(paths.length).toBeGreaterThanOrEqual(2);
    });

    it('does not crash on an empty project', () => {
        expect(() => render(<SceneFlowMap {...props} project={{ ...project, scenes: {} }} />)).not.toThrow();
    });
});
