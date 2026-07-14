/**
 * SceneManager — a thin ROUTER between the two Scenes views:
 *   • List view (the classic scene list + command editor)  — SceneManagerList.tsx
 *   • Map view  (the Story Flow Map)                       — scene-flow/SceneFlowMap.tsx
 *
 * Mirrors the CharacterEditor Classic⇄New router: the choice is an editor preference in
 * localStorage (never in the project file), so switching is lossless. Both existing call sites
 * (VisualNovelEditor, ManagerWindow) keep working with zero changes — they still import
 * `SceneManager` and pass the same props.
 */
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SceneManagerList, { SceneManagerProps } from './SceneManagerList';
import SceneFlowMap from './scene-flow/SceneFlowMap';

const VIEW_KEY = 'flourish:sceneManagerView';
type SceneView = 'list' | 'map';

const SceneManager: React.FC<SceneManagerProps> = (props) => {
    const { t } = useTranslation(['scenes']);
    const [view, setView] = useState<SceneView>(() => {
        try { return localStorage.getItem(VIEW_KEY) === 'map' ? 'map' : 'list'; } catch { return 'list'; }
    });

    const switchView = useCallback((v: SceneView) => {
        setView(v);
        try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
    }, []);

    const toggle = (
        <button
            onClick={() => switchView(view === 'list' ? 'map' : 'list')}
            title={view === 'list'
                ? t('flowMap.switchToMapHint', 'See how your scenes connect')
                : t('flowMap.switchToListHint', 'Back to the scene list')}
            className="text-[10px] px-2 py-0.5 rounded-md border transition-colors hover:bg-[var(--bg-tertiary)] flex items-center gap-1 flex-shrink-0"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
            {view === 'list' ? t('flowMap.mapView', '🗺 Story map') : t('flowMap.listView', '↩ List')}
        </button>
    );

    return view === 'map'
        ? <SceneFlowMap {...props} headerSlot={toggle} onOpenScene={(id) => { props.setActiveSceneId(id); props.setSelectedCommandIndex(null); switchView('list'); }} />
        : <SceneManagerList {...props} headerSlot={toggle} />;
};

export default SceneManager;
