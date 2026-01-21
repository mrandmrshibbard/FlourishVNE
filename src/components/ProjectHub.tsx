import React, { useEffect, useRef, useState } from 'react';
import { VNProject } from '../types/project';
import { createInitialProject } from '../constants';
import { PlusIcon, UploadIcon, SparkleIcon } from './icons';
import { importProject } from '../utils/projectPackager';
import { ChangelogModal } from './ChangelogModal';
import { useToast } from '../contexts/ToastContext';

export const ProjectHub: React.FC<{
    onProjectSelect: (project: VNProject) => void;
}> = ({ onProjectSelect }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showChangelog, setShowChangelog] = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState<{ version: string; isNew: boolean } | null>(null);
    const toast = useToast();

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
            let latestVersion: string | null = null;

            if (cachedRaw) {
                try {
                    const cached = JSON.parse(cachedRaw) as { tag: string; fetchedAt: number };
                    const oneHourMs = 1 * 60 * 60 * 1000; // Check more frequently (1 hour instead of 12)
                    if (cached?.tag && typeof cached.fetchedAt === 'number' && Date.now() - cached.fetchedAt < oneHourMs) {
                        latestVersion = cached.tag.replace('v', '');
                    }
                } catch {
                    // Ignore invalid cache
                }
            }

            // Fetch fresh data if no valid cache
            if (!latestVersion) {
                const response = await fetch('https://api.github.com/repos/mrandmrshibbard/FlourishVNE/releases/latest');
                if (!response.ok) return;

                const release = await response.json();
                latestVersion = release.tag_name.replace('v', '');

                // Update cache
                try {
                    localStorage.setItem(cacheKey, JSON.stringify({ tag: release.tag_name, fetchedAt: Date.now() }));
                } catch {
                    // Ignore storage failures
                }
            }

            // Compare versions - show update banner if newer version available
            if (latestVersion && latestVersion !== currentVersion) {
                const lastShown = localStorage.getItem('lastShownChangelogVersion');
                const isNewUpdate = latestVersion !== lastShown;
                
                setUpdateAvailable({ version: latestVersion, isNew: isNewUpdate });
                
                // Show toast and auto-open changelog for brand new updates
                if (isNewUpdate) {
                    toast.info(`🎉 New version ${latestVersion} is available!`, { duration: 5000 });
                    setShowChangelog(true);
                    localStorage.setItem('lastShownChangelogVersion', latestVersion);
                }
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
            toast.error(`Failed to import project: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Reset file input
        if (event.target) {
            event.target.value = '';
        }
    };

    return (
        <div className="h-screen w-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center p-4">
            {/* Update Available Banner */}
            {updateAvailable && (
                <div className="fixed top-0 left-0 right-0 z-40">
                    <div 
                        className={`
                            flex items-center justify-center gap-3 py-3 px-4 cursor-pointer
                            ${updateAvailable.isNew 
                                ? 'bg-gradient-to-r from-[var(--accent-pink)] to-[var(--accent-purple)] animate-pulse' 
                                : 'bg-[var(--accent-cyan)]/20 border-b border-[var(--accent-cyan)]/30'
                            }
                        `}
                        onClick={() => setShowChangelog(true)}
                    >
                        <SparkleIcon className="w-5 h-5" />
                        <span className="font-medium">
                            {updateAvailable.isNew 
                                ? `🎉 New Update Available: v${updateAvailable.version}!` 
                                : `Version ${updateAvailable.version} available`
                            }
                        </span>
                        <span className="text-sm opacity-80">Click to see what's new →</span>
                    </div>
                </div>
            )}
            
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
