import React from 'react';
import { VNProject } from '../../types/project';
import { UIMusicGalleryElement, UIMusicPlayerPart } from '../../features/ui/types';
import { fontSettingsToStyle } from '../../utils/styleUtils';
import { MUSIC_CONTROL_GLYPHS, SAMPLE_SONGS, visibleSongs, formatTimeLabel } from '../../utils/musicGallery';

/**
 * EDITOR-ONLY static preview of a Music Gallery player (no audio). Used by BOTH the
 * MenuEditor canvas mock and the MusicPlayerDesigner canvas so authors see the same thing
 * everywhere. ⚠ KEEP IN SYNC with the engine renderer (MusicGalleryPlayerElement in
 * LivePreview.tsx) — the dual-renderer rule (same as the Meter element).
 */

export interface MusicPreviewSong {
    name: string;
    artist?: string;
    locked?: boolean;
    artworkUrl?: string | null;
}

export interface MusicPreviewCtx {
    songs: MusicPreviewSong[];
    /** Index into songs of the "now playing" sample row (-1 = nothing playing). */
    currentIndex: number;
    playing: boolean;
    /** 0-1 seek preview position. */
    progress: number;
    element: Pick<UIMusicGalleryElement, 'lockedText' | 'lockedColor' | 'noSongText'>;
}

export const SAMPLE_PREVIEW_CTX = (element: MusicPreviewCtx['element']): MusicPreviewCtx => ({
    songs: SAMPLE_SONGS.map(s => ({ ...s })),
    currentIndex: 0,
    playing: true,
    progress: 0.4,
    element,
});

const glyphFor = (part: UIMusicPlayerPart, active: boolean): string => {
    const g = MUSIC_CONTROL_GLYPHS[part.partType];
    if (!g) return '?';
    return active && g.active ? g.active : g.normal;
};

const editorAssetUrl = (project: VNProject, id?: string | null): string | null => {
    if (!id) return null;
    return (project.images?.[id] as any)?.imageUrl || (project.backgrounds?.[id] as any)?.imageUrl || null;
};

/** Renders ONE part's inner content (no positioning) for editor previews. */
export const MusicPartInner: React.FC<{
    part: UIMusicPlayerPart;
    ctx: MusicPreviewCtx;
    project: VNProject;
}> = ({ part, ctx, project }) => {
    const current = ctx.currentIndex >= 0 ? ctx.songs[ctx.currentIndex] : null;
    const baseText: React.CSSProperties = part.font
        ? fontSettingsToStyle(part.font)
        : { color: part.color || '#e2e8f0', fontSize: 13 };

    switch (part.partType) {
        case 'artwork': {
            const url = current?.artworkUrl || null;
            return url
                ? <img src={url} alt="" className="w-full h-full pointer-events-none" style={{ objectFit: part.objectFit || 'cover' }} />
                : (
                    <div className="w-full h-full flex flex-col items-center justify-center pointer-events-none" style={{ color: part.color || '#94a3b8' }}>
                        <span style={{ fontSize: '200%' }}>♪</span>
                        {!current && <span className="text-[10px] opacity-80">{ctx.element.noSongText || 'Pick a song'}</span>}
                    </div>
                );
        }
        case 'songTitle':
            return <div className="w-full h-full flex items-center overflow-hidden pointer-events-none" style={{ ...baseText, fontWeight: part.font ? undefined : 'bold' }}>{current ? current.name : (ctx.element.noSongText || 'Pick a song')}</div>;
        case 'artistName':
            return <div className="w-full h-full flex items-center overflow-hidden pointer-events-none" style={{ ...baseText, opacity: 0.75 }}>{current?.artist || ''}</div>;
        case 'timeLabel':
            return <div className="w-full h-full flex items-center justify-center pointer-events-none" style={baseText}>{ctx.playing || ctx.currentIndex >= 0 ? formatTimeLabel(83 * ctx.progress + 0.4, 225) : '0:00'}</div>;
        case 'seekBar': {
            const track = part.trackColor || 'rgba(148,163,184,0.35)';
            const fill = part.color || '#38bdf8';
            const thumb = part.thumbColor || '#e2e8f0';
            return (
                <div className="w-full h-full flex items-center pointer-events-none">
                    <div className="w-full relative" style={{ height: '40%', minHeight: 4, borderRadius: 999, background: track }}>
                        <div className="absolute left-0 top-0 h-full" style={{ width: `${ctx.progress * 100}%`, borderRadius: 999, background: fill }} />
                        <div className="absolute" style={{ left: `${ctx.progress * 100}%`, top: '50%', transform: 'translate(-50%, -50%)', width: 10, height: 10, borderRadius: '50%', background: thumb }} />
                    </div>
                </div>
            );
        }
        case 'songList': {
            const rows = ctx.songs.slice(0, 6);
            return (
                <div className="w-full h-full overflow-hidden pointer-events-none flex flex-col" style={{ gap: part.rowGap ?? 4 }}>
                    {rows.map((s, i) => {
                        const isCurrent = i === ctx.currentIndex;
                        const rowStyle: React.CSSProperties = {
                            background: isCurrent ? (part.playingRowColor || 'rgba(56,189,248,0.25)') : (part.rowColor || 'rgba(255,255,255,0.05)'),
                            borderRadius: part.borderRadius ?? 6,
                            ...(s.locked ? { opacity: 0.85 } : {}),
                        };
                        return (
                            <div key={i} className="flex items-center gap-2 px-2 py-1 flex-shrink-0" style={rowStyle}>
                                {(part.showArtworkInList ?? true) && (
                                    <div className="flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(0,0,0,0.3)', color: part.color || '#94a3b8', fontSize: 10 }}>
                                        {s.locked ? '🔒' : (s.artworkUrl ? <img src={s.artworkUrl} alt="" className="w-full h-full" style={{ objectFit: 'cover' }} /> : '♪')}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="truncate" style={{ ...baseText, fontSize: (baseText.fontSize as number) || 12, ...(s.locked ? { color: ctx.element.lockedColor || 'rgba(148,163,184,0.6)' } : {}) }}>
                                        {s.locked ? (ctx.element.lockedText || '???') : s.name}
                                    </div>
                                    {(part.showArtistInList ?? false) && !s.locked && s.artist && (
                                        <div className="truncate" style={{ ...baseText, fontSize: 10, opacity: 0.6 }}>{s.artist}</div>
                                    )}
                                </div>
                                {isCurrent && <span style={{ color: part.color || '#38bdf8', fontSize: 10 }}>▶</span>}
                            </div>
                        );
                    })}
                </div>
            );
        }
        // transport controls
        default: {
            const active = (part.partType === 'playPause' && ctx.playing);
            const normalUrl = part.image?.id ? editorAssetUrl(project, part.image.id) : null;
            const activeUrl = part.imageActive?.id ? editorAssetUrl(project, part.imageActive.id) : null;
            const url = active ? (activeUrl || normalUrl) : normalUrl;
            return (
                <div className="w-full h-full flex items-center justify-center pointer-events-none" style={{ background: part.backgroundColor, borderRadius: part.borderRadius }}>
                    {url
                        ? <img src={url} alt="" className="max-w-full max-h-full" style={{ objectFit: 'contain' }} />
                        : <span style={{ color: part.color || '#e2e8f0', fontSize: 'min(4vh, 18px)', lineHeight: 1 }}>{glyphFor(part, active)}</span>}
                </div>
            );
        }
    }
};

/** Full static mock of the element (panel + all visible parts) for the MenuEditor canvas. */
const MusicGalleryPreview: React.FC<{
    element: UIMusicGalleryElement;
    project: VNProject;
}> = ({ element, project }) => {
    // Prefer the project's real songs so the mock reflects the author's data.
    const real = visibleSongs(project.musicGallery, element, {});
    const songs: MusicPreviewSong[] = real.length
        ? real.slice(0, 6).map(s => ({
            name: s.name,
            artist: s.artist,
            locked: !s.unlocked,
            artworkUrl: editorAssetUrl(project, s.artworkAssetId) || editorAssetUrl(project, project.musicGallery?.defaultArtworkAssetId),
        }))
        : SAMPLE_SONGS.map(s => ({ ...s }));
    const firstUnlocked = songs.findIndex(s => !s.locked);
    const ctx: MusicPreviewCtx = {
        songs,
        currentIndex: firstUnlocked,
        playing: true,
        progress: 0.4,
        element,
    };
    const bgUrl = element.backgroundImage?.id ? editorAssetUrl(project, element.backgroundImage.id) : null;

    return (
        <div
            className="w-full h-full relative overflow-hidden"
            style={{
                backgroundColor: element.hideBackgroundPanel ? 'transparent' : (element.backgroundColor || 'rgba(15, 23, 42, 0.92)'),
                borderRadius: element.borderRadius ?? 12,
            }}
        >
            {bgUrl && !element.hideBackgroundPanel && (
                <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full pointer-events-none" style={{ objectFit: 'cover' }} />
            )}
            {(element.parts || []).filter(p => p.visible !== false).map(p => (
                <div
                    key={p.id}
                    className="absolute"
                    style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.width}%`, height: `${p.height}%` }}
                >
                    <MusicPartInner part={p} ctx={ctx} project={project} />
                </div>
            ))}
        </div>
    );
};

export default MusicGalleryPreview;
