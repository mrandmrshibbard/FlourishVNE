import React, { useEffect, useRef, useState } from 'react';
import { VNProject } from '../types/project';
import { createInitialProject } from '../constants';
import { PlusIcon, UploadIcon } from './icons';
import { importProject } from '../utils/projectPackager';
import { ChangelogModal } from './ChangelogModal';

export const ProjectHub: React.FC<{
    onProjectSelect: (project: VNProject) => void;
}> = ({ onProjectSelect }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showChangelog, setShowChangelog] = useState(false);

    useEffect(() => {
        (window as any).__IS_MANAGER_WINDOW__ = false;
        if ((window as any).electronAPI?.setHubActive) {
            (window as any).electronAPI.setHubActive(true);
        }

        // Check for updates on app start (Electron only)
        checkForUpdates();

        return () => {
            if ((window as any).electronAPI?.setHubActive) {
                (window as any).electronAPI.setHubActive(false);
            }
        };
    }, []);

    const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

    const checkForUpdates = async () => {
        try {
            if (!isElectron) return;

            const currentVersion = await (window as any).electronAPI?.getAppVersion();
            if (!currentVersion) return;

            // Cache to avoid rate-limits / slow startups.
            const cacheKey = 'githubLatestReleaseCache';
            const cachedRaw = localStorage.getItem(cacheKey);
            if (cachedRaw) {
                try {
                    const cached = JSON.parse(cachedRaw) as { tag: string; fetchedAt: number };
                    const twelveHoursMs = 12 * 60 * 60 * 1000;
                    if (cached?.tag && typeof cached.fetchedAt === 'number' && Date.now() - cached.fetchedAt < twelveHoursMs) {
                        const latestVersion = cached.tag.replace('v', '');
                        const lastShown = localStorage.getItem('lastShownChangelogVersion');
                        if (latestVersion !== lastShown && latestVersion !== currentVersion) {
                            setShowChangelog(true);
                            localStorage.setItem('lastShownChangelogVersion', latestVersion);
                        }
                        return;
                    }
                } catch {
                    // Ignore invalid cache
                }
            }

            const response = await fetch('https://api.github.com/repos/mrandmrshibbard/FlourishVNE/releases/latest');
            if (!response.ok) return;

            const release = await response.json();
            const latestVersion = release.tag_name.replace('v', '');

            // Update cache
            try {
                localStorage.setItem(cacheKey, JSON.stringify({ tag: release.tag_name, fetchedAt: Date.now() }));
            } catch {
                // Ignore storage failures
            }

            const lastShown = localStorage.getItem('lastShownChangelogVersion');
            if (latestVersion !== lastShown && latestVersion !== currentVersion) {
                setShowChangelog(true);
                localStorage.setItem('lastShownChangelogVersion', latestVersion);
            }
        } catch (error) {
            console.error('Failed to check for updates:', error);
        }
    };

    const handleCreateNew = () => {
        if ((window as any).electronAPI?.setHubActive) {
            (window as any).electronAPI.setHubActive(false);
        }
        const newProject = createInitialProject();
        // The new project is not saved to localStorage; it's passed directly to the editor state.
        onProjectSelect(newProject);
    };

    const handleFileOpen = () => {
        if ((window as any).electronAPI?.setHubActive) {
            (window as any).electronAPI.setHubActive(false);
        }
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            // importProject no longer saves to localStorage.
            // It just parses the file and returns the project object.
            const { project } = await importProject(file);
            if ((window as any).electronAPI?.setHubActive) {
                (window as any).electronAPI.setHubActive(false);
            }
            onProjectSelect(project);
        } catch (error) {
            console.error("Error importing project file:", error);
            alert(`Failed to import project file. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Reset file input
        if (event.target) {
            event.target.value = '';
        }
    };

    return (
        <div className="h-screen w-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center p-4">
            <div className="w-full max-w-4xl p-8">
                <header className="text-center mb-12">
                    <h1 className="font-heading text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-pink)] to-[var(--accent-cyan)]">Flourish Visual Novel Engine</h1>
                    <p className="text-[var(--text-secondary)] mt-2">🌈🌸 Create Without Limits 🌸🌈</p>
                </header>

                <main className="flex flex-col md:flex-row items-center justify-center gap-8">
                    <button 
                        onClick={handleCreateNew}
                        className="w-full md:w-1/2 h-64 text-center p-6 bg-[var(--accent-purple)]/20 hover:bg-[var(--accent-purple)]/30 border-2 border-[var(--accent-purple)]/50 rounded-lg shadow-lg transition-all transform hover:scale-105 flex flex-col items-center justify-center"
                    >
                        <div className="bg-[var(--accent-purple)]/20 p-4 rounded-full mb-4"><PlusIcon className="w-8 h-8" /></div>
                        <h2 className="text-2xl font-semibold">Create New Project</h2>
                        <p className="text-[var(--text-secondary)]">Start from a blank canvas.</p>
                    </button>
                    <button 
                        onClick={handleFileOpen}
                        className="w-full md:w-1/2 h-64 text-center p-6 bg-[var(--accent-cyan)]/20 hover:bg-[var(--accent-cyan)]/30 border-2 border-[var(--accent-cyan)]/50 rounded-lg shadow-lg transition-all transform hover:scale-105 flex flex-col items-center justify-center"
                    >
                         <div className="bg-[var(--accent-cyan)]/20 p-4 rounded-full mb-4"><UploadIcon className="w-8 h-8" /></div>
                        <h2 className="text-2xl font-semibold">Import Project</h2>
                        <p className="text-[var(--text-secondary)]">Load a .zip project file.</p>
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".zip,application/zip" onChange={handleFileChange} />
                </main>
                 <footer className="text-center mt-12 text-[var(--text-secondary)]">
                    <p>Your work is now managed in memory. Please use the 'Export' button in the editor to save your project.</p>
                    <button
                        onClick={() => setShowChangelog(true)}
                        className="mt-2 text-sm underline hover:text-[var(--accent-cyan)]"
                    >
                        View Latest Changes
                    </button>
                </footer>
            </div>
            <ChangelogModal visible={showChangelog} onClose={() => setShowChangelog(false)} />
        </div>
    );
};
