import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ProjectProvider } from './contexts/ProjectContext';
import { UIScreenThemeProvider } from './contexts/UIScreenThemeContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { useTranslation } from 'react-i18next';
import VisualNovelEditor from './components/VisualNovelEditor';
import InspectorWindow from './components/InspectorWindow';
import CanvasWindow from './components/CanvasWindow';
import InGameWindow from './components/InGameWindow';
import TestPlayWindow from './components/TestPlayWindow';
import { getManagerWindowType } from './utils/windowManager';
import { ProjectHub, saveRecentProject } from './components/ProjectHub';
import { MusicPlayer } from './components/MusicPlayer';
import AutoUpdateBanner from './components/AutoUpdateBanner';
import { VNProject } from './types/project';
import { NavigationTab } from './components/NavigationTabs';
import { toggleBackgroundMusic, getCurrentSongName, isBgmPlaying } from './utils/hubAudio';
import { importProject, lastImportRepair } from './utils/projectPackager';

// Detect a popped-out manager/child window *synchronously* at module load.
// Electron loads these with ?manager=<type> (see electron/main.cjs). Marking it
// here — before React mounts — ensures the auto-play effect and the Hub-only
// MusicPlayer never start a second chiptune AudioContext in the child window.
try {
    // Primary: the ?manager=<type> query. Fallback: scan the whole href in case
    // the param lands in the hash (router) or a custom-scheme load reshapes the URL.
    if (new URLSearchParams(window.location.search).has('manager') ||
        /[?&#]manager=/.test(window.location.href)) {
        (window as any).__IS_MANAGER_WINDOW__ = true;
    }
} catch { /* location unavailable */ }

function isManagerWindow(): boolean {
    return !!(window as any).__IS_MANAGER_WINDOW__;
}

function isEditorDebugEnabled(): boolean {
    try {
        return window.localStorage.getItem('flourish:editorDebug') === '1';
    } catch {
        return false;
    }
}

function editorDebugLog(...args: unknown[]): void {
    if (!isEditorDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.log(...args);
}


/**
 * Surfaces the outcome of a file-association open ("double-clicked a .flourish").
 *
 * That handler lives ABOVE the ToastProvider, so it cannot toast — and it used to swallow every
 * failure into console.error. A user double-clicked their (possibly damaged) project and NOTHING
 * visibly happened: the one moment they most needed to hear "this file is damaged", the app said
 * nothing at all. The handler now dispatches a window event; this listener, mounted inside the
 * providers, turns it into a visible toast.
 */
const OPEN_FILE_RESULT_EVENT = 'flourish:openFileResult';
const FileOpenNotifier: React.FC = () => {
    const toast = useToast();
    const { t } = useTranslation('hub');
    React.useEffect(() => {
        const onResult = (e: Event) => {
            const d = (e as CustomEvent).detail as { kind: string; message?: string; lost?: number };
            if (d.kind === 'error') {
                toast.error(t('toast.openFailed', { error: d.message || 'Unknown error' }), { duration: 10000 });
            } else if (d.kind === 'repaired') {
                toast.warning(
                    (d.lost ?? 0) > 0
                        ? t('toast.repairedPartial', 'This project file was damaged (a save was interrupted). Your story was recovered, but {{count}} media file(s) were lost and will need re-importing. Save it again now to make it whole.', { count: d.lost })
                        : t('toast.repaired', 'This project file was damaged (a save was interrupted), but everything was recovered. Save it again now to make it whole.'),
                    { duration: 12000 },
                );
            }
        };
        window.addEventListener(OPEN_FILE_RESULT_EVENT, onResult);
        return () => window.removeEventListener(OPEN_FILE_RESULT_EVENT, onResult);
    }, [toast, t]);
    return null;
};

const announceOpenFileResult = (detail: { kind: string; message?: string; lost?: number }) => {
    // Defer one tick so a listener mounted by the SAME state update (entering the editor) hears it.
    setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_FILE_RESULT_EVENT, { detail })), 250);
};

const App = () => {
    const { t } = useTranslation('hub');
    const [activeProject, setActiveProject] = useState<VNProject | null>(null);
    // Once a project has been opened, the hub chiptune must never (re)start. Guards the
    // autoplay click-fallback, whose closure would otherwise restart music on the very
    // click that opens a project. A ref so handlers read the live value synchronously.
    const projectOpenedRef = useRef(false);
    const [initialTab, setInitialTab] = useState<NavigationTab | undefined>(undefined);

    // ── Global music state (persists across hub ↔ editor) ──
    const [isMusicPlaying, setIsMusicPlaying] = useState(false);
    const [currentSongName, setCurrentSongName] = useState('');

    // Auto-start music when the app first loads
    useEffect(() => {
        // Dismiss the splash screen now that React has mounted
        if (typeof (window as any).__dismissSplash === 'function') {
            (window as any).__dismissSplash();
        }

        // Popped-out manager windows must not start their own hub music.
        if (isManagerWindow()) return;

        const tryAutoPlay = () => {
            try {
                toggleBackgroundMusic(true);
                setIsMusicPlaying(true);
                setCurrentSongName(getCurrentSongName());
            } catch { /* will retry on click */ }
        };
        tryAutoPlay();
        const clickFallback = () => {
            // Use the LIVE audio + project state (not the stale captured React state) so this
            // never restarts music after a project has been opened by this very click.
            if (!projectOpenedRef.current && !isBgmPlaying()) tryAutoPlay();
            document.removeEventListener('click', clickFallback);
        };
        document.addEventListener('click', clickFallback, { once: true });
        return () => document.removeEventListener('click', clickFallback);
    }, []);

    // Stop the hub chiptune when entering the editor. UNCONDITIONAL: the real audio
    // (hubAudio AudioContext) can be playing even when the React `isMusicPlaying` state
    // says otherwise (autoplay-blocked-then-resumed drift), so always stop — it's
    // idempotent — rather than gating on the possibly-stale flag.
    const stopHubMusic = useCallback(() => {
        projectOpenedRef.current = true;
        toggleBackgroundMusic(false);
        setIsMusicPlaying(false);
    }, []);

    const handleMusicPlayingChange = useCallback((playing: boolean) => {
        setIsMusicPlaying(playing);
        if (playing) setCurrentSongName(getCurrentSongName());
    }, []);

    const handleSongChange = useCallback((name: string) => {
        setCurrentSongName(name);
    }, []);

    // Listen for window-type message from Electron
    useEffect(() => {
        if ((window as any).electronAPI?.onWindowType) {
            (window as any).electronAPI.onWindowType((data: { type: NavigationTab; project?: VNProject; context?: any; panelsOpen?: any; inGameState?: any }) => {
                editorDebugLog('Received window data:', data);
                setInitialTab(data.type);
                // Seed the editor context (selection) BEFORE the project triggers a panel window to
                // mount, so a popped-out inspector opens already showing the current selection.
                if (data.context) {
                    (window as any).__FLOURISH_EDITOR_CONTEXT__ = data.context;
                }
                // Seed the In-Game UI shared view-state so a popped-out In-Game part opens in sync.
                if (data.inGameState) {
                    (window as any).__FLOURISH_INGAME_STATE__ = data.inGameState;
                }
                // Seed which panel windows are already open so a newly-opened editor hides its matching
                // inline panel from the start.
                if (data.panelsOpen !== undefined) {
                    (window as any).__FLOURISH_PANELS_OPEN__ = data.panelsOpen;
                }
                if (data.project) {
                    setActiveProject(data.project);
                }
                // Mark this as a manager window. This message is the
                // guaranteed signal (sent on did-finish-load for every popped
                // window), so even if the synchronous URL check missed the
                // ?manager= param, stop any hub music that already auto-started
                // here — chiptune must only play in the project hub.
                (window as any).__IS_MANAGER_WINDOW__ = true;
                stopHubMusic();
            });
        }
    }, []);

    // Expose project to Electron for sharing with manager windows
    useEffect(() => {
        if (activeProject) {
            (window as any).__FLOURISH_PROJECT__ = activeProject;
        }
    }, [activeProject]);

    // ── File-association / double-click open ──
    // When the user double-clicks a .flourish file (or the app is launched
    // with a file argument), the main process sends 'open-file' via IPC.
    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.onOpenFile || !api?.readProjectFile) return;

        api.onOpenFile(async (filePath: string) => {
            editorDebugLog('Received open-file request:', filePath);
            try {
                const result = await api.readProjectFile(filePath);
                if (!result.success) {
                    console.error('Failed to read file:', result.error);
                    announceOpenFileResult({ kind: 'error', message: result.error });
                    return;
                }
                const { project } = await importProject(result.data);

                stopHubMusic(); // entering the editor — silence the hub chiptune
                saveRecentProject(project, filePath);
                setActiveProject(project);
                // If the archive had to be REPAIRED to open, the author must hear about it — a
                // partially-recovered project silently opened would launder its damage into every
                // future save (autosave persists it within ~1.2s).
                if (lastImportRepair) {
                    announceOpenFileResult({ kind: 'repaired', lost: lastImportRepair.lost.length });
                }
            } catch (err) {
                console.error('Failed to open project file:', err);
                announceOpenFileResult({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
            }
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleProjectSelect = (project: VNProject) => {
        stopHubMusic(); // entering the editor — silence the hub chiptune (always)
        setActiveProject(project);
    };

    const handleCloseProject = () => {
        setActiveProject(null);
    };

    // Focused PANEL windows (e.g. the popped-out Properties Inspector) render a single panel that
    // follows the main editor's selection — never the Project Hub or a full editor.
    const managerType = getManagerWindowType();

    // The dedicated test-play window runs the game (LivePreview) in its own window.
    if (managerType === 'testplay') {
        if (!activeProject) {
            return (
                <ToastProvider>
                    <div className="h-screen flex items-center justify-center bg-black text-white text-sm">{t('hc.loading', 'Loading…')}</div>
                </ToastProvider>
            );
        }
        return (
            <ToastProvider>
                <ProjectProvider key={activeProject.id} initialProject={activeProject}>
                    <TestPlayWindow />
                </ProjectProvider>
            </ToastProvider>
        );
    }

    const isPanelWindow = managerType === 'inspector' || managerType === 'canvas'
        || managerType === 'ingame-canvas' || managerType === 'ingame-properties';

    if (isPanelWindow) {
        if (!activeProject) {
            // Waiting on the project from the main window (sent on did-finish-load).
            return (
                <ToastProvider>
                    <div className="h-screen flex items-center justify-center bg-[var(--bg-primary)] text-[var(--text-secondary)] text-sm">
                        {t('hc.loading', 'Loading…')}
                    </div>
                </ToastProvider>
            );
        }
        return (
            <ToastProvider>
                <ProjectProvider key={activeProject.id} initialProject={activeProject}>
                    <UIScreenThemeProvider>
                        {managerType === 'inspector' && <InspectorWindow />}
                        {managerType === 'canvas' && <CanvasWindow />}
                        {managerType === 'ingame-canvas' && <InGameWindow part="canvas" />}
                        {managerType === 'ingame-properties' && <InGameWindow part="properties" />}
                    </UIScreenThemeProvider>
                </ProjectProvider>
            </ToastProvider>
        );
    }

    if (!activeProject) {
        return (
            <ToastProvider>
                <FileOpenNotifier />
                <AutoUpdateBanner />
                <ProjectHub onProjectSelect={handleProjectSelect} />
                {!isManagerWindow() && (
                    <MusicPlayer
                        isPlaying={isMusicPlaying}
                        onPlayingChange={handleMusicPlayingChange}
                        currentSong={currentSongName}
                        onSongChange={handleSongChange}
                    />
                )}
            </ToastProvider>
        );
    }

    return (
        <ToastProvider>
            <FileOpenNotifier />
            <AutoUpdateBanner />
            <ProjectProvider key={activeProject.id} initialProject={activeProject}>
                <UIScreenThemeProvider>
                    <VisualNovelEditor onExit={handleCloseProject} initialTab={initialTab} />
                </UIScreenThemeProvider>
            </ProjectProvider>
            {/* Music player is intentionally Hub-only — inside the editor it would overlap the
                Properties inspector and other panels. Hub music is stopped on project open. */}
        </ToastProvider>
    );
};

export default App;
