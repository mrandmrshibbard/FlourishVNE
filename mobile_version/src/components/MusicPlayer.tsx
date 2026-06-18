import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    toggleBackgroundMusic,
    isBgmPlaying,
    getCurrentSongName,
    getSongList,
    skipToNextSong,
} from '../utils/hubAudio';

// ── Icons ────────────────────────────────────────────────────────────────────

const MusicNoteIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
);

const MusicOffIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

const PlayIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5,3 19,12 5,21" />
    </svg>
);

const PauseIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
    </svg>
);

const SkipIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5,4 15,12 5,20" />
        <rect x="16" y="4" width="3" height="16" />
    </svg>
);

const PopOutIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
);

const MinimizeIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

// ── Component ────────────────────────────────────────────────────────────────

interface MusicPlayerProps {
    /** Whether the player is currently playing */
    isPlaying: boolean;
    /** Callback when play state changes */
    onPlayingChange: (playing: boolean) => void;
    /** Current song name */
    currentSong: string;
    /** Callback when song changes */
    onSongChange: (name: string) => void;
}

export const MusicPlayer: React.FC<MusicPlayerProps> = ({
    isPlaying,
    onPlayingChange,
    currentSong,
    onSongChange,
}) => {
    const { t } = useTranslation('contentTools');
    const [poppedOut, setPoppedOut] = useState(false);
    const [showSongList, setShowSongList] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const panelRef = useRef<HTMLDivElement>(null);
    const songListRef = useRef<HTMLDivElement>(null);

    const songs = getSongList();

    // Close song dropdown on outside click
    useEffect(() => {
        if (!showSongList) return;
        const handleClick = (e: MouseEvent) => {
            if (songListRef.current && !songListRef.current.contains(e.target as Node)) {
                setShowSongList(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showSongList]);

    // Initialize pop-out position to center-ish
    useEffect(() => {
        if (poppedOut && position.x === 0 && position.y === 0) {
            setPosition({
                x: Math.max(60, window.innerWidth / 2 - 160),
                y: Math.max(60, window.innerHeight / 2 - 100),
            });
        }
    }, [poppedOut]);

    const handleTogglePlay = useCallback(() => {
        const next = !isPlaying;
        toggleBackgroundMusic(next);
        onPlayingChange(next);
        if (next && !currentSong) {
            onSongChange(getCurrentSongName());
        }
    }, [isPlaying, currentSong, onPlayingChange, onSongChange]);

    const handleSkip = useCallback(() => {
        const name = skipToNextSong();
        onSongChange(name);
    }, [onSongChange]);

    const handleSelectSong = useCallback(
        (name: string) => {
            const newName = skipToNextSong(name);
            onSongChange(newName);
            setShowSongList(false);
        },
        [onSongChange],
    );

    const handlePopOut = useCallback(() => {
        setPoppedOut(true);
    }, []);

    const handleDock = useCallback(() => {
        setPoppedOut(false);
        setPosition({ x: 0, y: 0 });
    }, []);

    // ── Drag handling ──

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (!poppedOut) return;
            // Don't drag from buttons
            if ((e.target as HTMLElement).closest('button')) return;
            setIsDragging(true);
            const rect = panelRef.current?.getBoundingClientRect();
            dragOffset.current = {
                x: e.clientX - (rect?.left ?? 0),
                y: e.clientY - (rect?.top ?? 0),
            };
            e.preventDefault();
        },
        [poppedOut],
    );

    useEffect(() => {
        if (!isDragging) return;
        const handleMove = (e: MouseEvent) => {
            setPosition({
                x: Math.max(0, Math.min(window.innerWidth - 200, e.clientX - dragOffset.current.x)),
                y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffset.current.y)),
            });
        };
        const handleUp = () => setIsDragging(false);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [isDragging]);

    // ── Minimised (docked) FAB ──

    if (!poppedOut) {
        return (
            <button
                onClick={handleTogglePlay}
                onContextMenu={(e) => {
                    e.preventDefault();
                    handlePopOut();
                }}
                className="fixed bottom-6 right-6 z-50 group"
                title={isPlaying ? t('musicPlayer.fabTitlePlaying') : t('musicPlayer.fabTitleStopped')}
            >
                <div
                    className="w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg hover:shadow-xl border"
                    style={{
                        background: isPlaying
                            ? 'linear-gradient(135deg, var(--accent-pink), var(--accent-lavender))'
                            : 'var(--bg-secondary)',
                        borderColor: isPlaying ? 'var(--accent-pink)' : 'var(--border-subtle)',
                    }}
                >
                    {isPlaying ? (
                        <MusicNoteIcon className="w-5 h-5 text-white" />
                    ) : (
                        <MusicOffIcon className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors" />
                    )}
                </div>
                {isPlaying && (
                    <div className="absolute -top-1 -right-1 flex gap-[2px]">
                        <span className="w-[3px] h-3 bg-[var(--accent-cyan)] rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                        <span className="w-[3px] h-2 bg-[var(--accent-mint)] rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                        <span className="w-[3px] h-3.5 bg-[var(--accent-pink)] rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                    </div>
                )}
                {/* Pop-out hint on hover */}
                {isPlaying && (
                    <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] whitespace-nowrap shadow-lg">
                            <PopOutIcon className="w-3 h-3 inline mr-1" /> {t('musicPlayer.rightClickPopOut')}
                        </div>
                    </div>
                )}
            </button>
        );
    }

    // ── Popped-out panel ──

    return (
        <div
            ref={panelRef}
            onMouseDown={handleMouseDown}
            className="fixed z-[9999]"
            style={{
                left: position.x,
                top: position.y,
                cursor: isDragging ? 'grabbing' : 'default',
                userSelect: 'none',
            }}
        >
            <div
                className="rounded-xl border shadow-2xl overflow-hidden backdrop-blur-md"
                style={{
                    background: 'var(--bg-primary)',
                    borderColor: isPlaying ? 'var(--accent-pink)' : 'var(--border-subtle)',
                    width: 300,
                    opacity: isDragging ? 0.85 : 1,
                    transition: isDragging ? 'none' : 'opacity 0.2s',
                }}
            >
                {/* Title bar – draggable area */}
                <div
                    className="flex items-center justify-between px-3 py-2 border-b"
                    style={{
                        borderColor: 'var(--border-subtle)',
                        background: isPlaying
                            ? 'linear-gradient(135deg, rgba(var(--accent-pink-rgb, 236,72,153), 0.12), rgba(var(--accent-lavender-rgb, 167,139,250), 0.10))'
                            : 'var(--bg-secondary)',
                        cursor: isDragging ? 'grabbing' : 'grab',
                    }}
                >
                    <div className="flex items-center gap-2">
                        <MusicNoteIcon className="w-4 h-4 text-[var(--accent-pink)]" />
                        <span className="text-xs font-semibold text-[var(--text-primary)]">{t('musicPlayer.panelTitle')}</span>
                    </div>
                    <div className="flex gap-1">
                        <button
                            onClick={handleDock}
                            title={t('musicPlayer.dockBack')}
                            className="p-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                            <MinimizeIcon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        </button>
                    </div>
                </div>

                {/* Visualiser bar */}
                {isPlaying && (
                    <div className="flex items-end justify-center gap-[3px] px-3 py-2" style={{ height: 32 }}>
                        {Array.from({ length: 16 }).map((_, i) => (
                            <span
                                key={i}
                                className="rounded-full"
                                style={{
                                    width: 3,
                                    background: `linear-gradient(to top, var(--accent-cyan), var(--accent-pink))`,
                                    animation: `musicBar ${0.4 + Math.random() * 0.6}s ease-in-out infinite alternate`,
                                    animationDelay: `${i * 40}ms`,
                                    height: 4 + Math.random() * 14,
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* Controls */}
                <div className="px-4 py-3 flex flex-col gap-2">
                    {/* Song name + selector */}
                    <div className="relative" ref={songListRef}>
                        <button
                            onClick={() => setShowSongList((p) => !p)}
                            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg border text-left transition-colors hover:border-[var(--accent-cyan)]"
                            style={{
                                background: 'var(--bg-secondary)',
                                borderColor: showSongList ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                            }}
                        >
                            <span className="text-sm text-[var(--text-primary)] truncate">
                                {currentSong || t('musicPlayer.selectSong')}
                            </span>
                            <ChevronDownIcon
                                className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${showSongList ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {showSongList && (
                            <div
                                className="absolute bottom-full mb-1 left-0 right-0 rounded-lg border shadow-xl overflow-hidden"
                                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-subtle)', zIndex: 10 }}
                            >
                                {songs.map((name) => (
                                    <button
                                        key={name}
                                        onClick={() => handleSelectSong(name)}
                                        className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-tertiary)]"
                                        style={{
                                            color: name === currentSong ? 'var(--accent-pink)' : 'var(--text-secondary)',
                                            fontWeight: name === currentSong ? 600 : 400,
                                        }}
                                    >
                                        {name === currentSong ? '\u266B ' : ''}{name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Transport controls */}
                    <div className="flex items-center justify-center gap-3 py-1">
                        <button
                            onClick={handleTogglePlay}
                            className="w-10 h-10 rounded-full flex items-center justify-center transition-all border hover:scale-105 active:scale-95"
                            title={isPlaying ? t('musicPlayer.pause') : t('musicPlayer.play')}
                            style={{
                                background: isPlaying
                                    ? 'linear-gradient(135deg, var(--accent-pink), var(--accent-lavender))'
                                    : 'var(--bg-tertiary)',
                                borderColor: isPlaying ? 'var(--accent-pink)' : 'var(--border-subtle)',
                            }}
                        >
                            {isPlaying ? (
                                <PauseIcon className="w-4 h-4 text-white" />
                            ) : (
                                <PlayIcon className="w-4 h-4 text-[var(--text-secondary)]" />
                            )}
                        </button>

                        <button
                            onClick={handleSkip}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-all border hover:scale-105 active:scale-95 hover:border-[var(--accent-cyan)]"
                            title={t('musicPlayer.nextSong')}
                            style={{
                                background: 'var(--bg-tertiary)',
                                borderColor: 'var(--border-subtle)',
                            }}
                        >
                            <SkipIcon className="w-4 h-4 text-[var(--text-secondary)]" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Inline keyframe for the bar visualiser */}
            <style>{`
                @keyframes musicBar {
                    0% { height: 3px; }
                    100% { height: 18px; }
                }
            `}</style>
        </div>
    );
};
