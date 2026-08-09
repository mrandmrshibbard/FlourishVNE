/**
 * The −/%/+ zoom cluster shown in the corner of an editing canvas. Shared so the scene canvas
 * and the screens canvas look and behave identically — they used to differ because only one of
 * them had zoom at all.
 *
 * Keys are `staging:`-prefixed deliberately: this copy already exists there in all ten
 * languages, and the component is rendered from two different namespaces, so an unprefixed key
 * would resolve differently depending on the caller.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { CanvasZoom } from '../../hooks/useCanvasZoom';

const CanvasZoomControls: React.FC<{ zoom: CanvasZoom; className?: string }> = ({ zoom, className }) => {
    const { t } = useTranslation('staging');
    return (
        <div className={`absolute bottom-2 right-2 flex items-center gap-1 z-[10000] bg-[var(--bg-primary)]/70 border border-[var(--border-default)]/40 rounded-lg px-1 py-0.5 ${className || ''}`}>
            <button
                onClick={zoom.zoomOut}
                className="w-5 h-5 flex items-center justify-center rounded text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                title={t('staging:zoomOut', 'Zoom out (Ctrl+scroll)')}
            >−</button>
            <button
                onClick={zoom.reset}
                className="px-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] tabular-nums"
                title={t('staging:zoomReset', 'Back to fit')}
            >{zoom.percent}%</button>
            <button
                onClick={zoom.zoomIn}
                className="w-5 h-5 flex items-center justify-center rounded text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                title={t('staging:zoomIn', 'Zoom in (Ctrl+scroll)')}
            >+</button>
        </div>
    );
};

export default CanvasZoomControls;
