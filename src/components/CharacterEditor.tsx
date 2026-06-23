/**
 * CharacterEditor — routes between the New (default) and Classic character editors.
 *
 * The choice is a per-user EDITOR preference (localStorage), never stored in the project, so
 * switching is lossless: both editors read/write the exact same character fields (layers, assets,
 * expressions, style). Classic is the byte-for-byte previous editor, kept available so users who
 * prefer it — or want to revert while getting used to the new layout — can switch back any time.
 */

import React, { useState, useCallback } from 'react';
import { VNID } from '../types';
import CharacterEditorClassic from './CharacterEditorClassic';
import CharacterEditorNew from './CharacterEditorNew';

const VIEW_KEY = 'flourish:characterEditorView';
type CharEditorView = 'new' | 'classic';

const CharacterEditor: React.FC<{
    activeCharacterId: VNID;
    selectedExpressionId: VNID | null;
    setSelectedExpressionId: (id: VNID | null) => void;
}> = (props) => {
    const [view, setView] = useState<CharEditorView>(() => {
        try { return localStorage.getItem(VIEW_KEY) === 'classic' ? 'classic' : 'new'; } catch { return 'new'; }
    });

    const switchView = useCallback((v: CharEditorView) => {
        setView(v);
        try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
    }, []);

    const toggle = (
        <button
            onClick={() => switchView(view === 'new' ? 'classic' : 'new')}
            title={view === 'new' ? 'Switch to the classic character editor' : 'Switch to the new character editor'}
            className="text-[11px] px-2.5 py-1 rounded-md border transition-colors hover:bg-[var(--bg-tertiary)] flex items-center gap-1.5 flex-shrink-0"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
            {view === 'new' ? '↩ Classic view' : '✨ New view'}
        </button>
    );

    return view === 'classic'
        ? <CharacterEditorClassic {...props} headerSlot={toggle} />
        : <CharacterEditorNew {...props} headerSlot={toggle} />;
};

export default CharacterEditor;
