import React, { useState, useEffect, useCallback } from 'react';
import { ProjectProvider } from './contexts/ProjectContext';
import { UIScreenThemeProvider } from './contexts/UIScreenThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import VisualNovelEditor from './components/VisualNovelEditor';
import { ProjectHub, saveRecentProject } from './components/ProjectHub';
import { MusicPlayer } from './components/MusicPlayer';
import AutoUpdateBanner from './components/AutoUpdateBanner';
import { VNProject } from './types/project';
import { NavigationTab } from './components/NavigationTabs';
import { toggleBackgroundMusic, getCurrentSongName } from './utils/hubAudio';
import { importProject } from './utils/projectPackager';

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

const App = () => {
    const [activeProject, setActiveProject] = useState<VNProject | null>(null);
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

        const tryAutoPlay = () => {
            try {
                toggleBackgroundMusic(true);
                setIsMusicPlaying(true);
                setCurrentSongName(getCurrentSongName());
            } catch { /* will retry on click */ }
        };
        tryAutoPlay();
        const clickFallback = () => {
            if (!isMusicPlaying) tryAutoPlay();
            document.removeEventListener('click', clickFallback);
        };
        document.addEventListener('click', clickFallback, { once: true });
        return () => document.removeEventListener('click', clickFallback);
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
            (window as any).electronAPI.onWindowType((data: { type: NavigationTab; project?: VNProject }) => {
                editorDebugLog('Received window data:', data);
                setInitialTab(data.type);
                if (data.project) {
                    setActiveProject(data.project);
                }
                // Mark this as a manager window
                (window as any).__IS_MANAGER_WINDOW__ = true;
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
                    return;
                }
                const { project } = await importProject(result.data);

                // Stop hub music if playing
                if (isMusicPlaying) {
                    toggleBackgroundMusic(false);
                    setIsMusicPlaying(false);
                }

                saveRecentProject(project, filePath);
                setActiveProject(project);
            } catch (err) {
                console.error('Failed to open project file:', err);
            }
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleProjectSelect = (project: VNProject) => {
        // Stop hub background music when entering the editor
        if (isMusicPlaying) {
            toggleBackgroundMusic(false);
            setIsMusicPlaying(false);
        }
        setActiveProject(project);
    };

    const handleCloseProject = () => {
        setActiveProject(null);
    };

    if (!activeProject) {
        return (
            <ToastProvider>
                <AutoUpdateBanner />
                <ProjectHub onProjectSelect={handleProjectSelect} />
                <MusicPlayer
                    isPlaying={isMusicPlaying}
                    onPlayingChange={handleMusicPlayingChange}
                    currentSong={currentSongName}
                    onSongChange={handleSongChange}
                />
            </ToastProvider>
        );
    }
    
    return (
        <ToastProvider>
            <AutoUpdateBanner />
            <ProjectProvider key={activeProject.id} initialProject={activeProject}>
                <UIScreenThemeProvider>
                    <VisualNovelEditor onExit={handleCloseProject} initialTab={initialTab} />
                </UIScreenThemeProvider>
            </ProjectProvider>
            <MusicPlayer
                isPlaying={isMusicPlaying}
                onPlayingChange={handleMusicPlayingChange}
                currentSong={currentSongName}
                onSongChange={handleSongChange}
            />
        </ToastProvider>
    );
};

export default App;
