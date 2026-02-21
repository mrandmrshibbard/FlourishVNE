import React, { useState, useEffect, useCallback } from 'react';
import { ProjectProvider } from './contexts/ProjectContext';
import { UIScreenThemeProvider } from './contexts/UIScreenThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import VisualNovelEditor from './components/VisualNovelEditor';
import { ProjectHub } from './components/ProjectHub';
import { MusicPlayer } from './components/MusicPlayer';
import { VNProject } from './types/project';
import { NavigationTab } from './components/NavigationTabs';
import { toggleBackgroundMusic, getCurrentSongName } from './utils/hubAudio';

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

    const handleProjectSelect = (project: VNProject) => {
        setActiveProject(project);
    };

    const handleCloseProject = () => {
        setActiveProject(null);
    };

    if (!activeProject) {
        return (
            <ToastProvider>
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
