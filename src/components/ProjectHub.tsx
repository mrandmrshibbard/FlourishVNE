import React, { useEffect, useRef, useState } from 'react';
import { VNProject } from '../types/project';
import { createInitialProject } from '../constants';
import { PlusIcon, UploadIcon, SparkleIcon, ClockIcon, TrashIcon } from './icons';
import { importProject } from '../utils/projectPackager';
import { ChangelogModal } from './ChangelogModal';
import { useToast } from '../contexts/ToastContext';
import LoadingOverlay from './ui/LoadingOverlay';

// Recent project metadata (stored in localStorage)
interface RecentProject {
    id: string;
    title: string;
    lastOpened: number; // timestamp
    sceneCount: number;
    characterCount: number;
}

const RECENT_PROJECTS_KEY = 'flourish:recentProjects';
const MAX_RECENT_PROJECTS = 5;

// Helper to save recent project metadata - exported for use by Header on successful exports
export function saveRecentProject(project: VNProject): void {
    try {
        const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
        let recents: RecentProject[] = stored ? JSON.parse(stored) : [];
        
        // Remove existing entry for this project
        recents = recents.filter(r => r.id !== project.id);
        
        // Add to front
        recents.unshift({
            id: project.id,
            title: project.title || 'Untitled Project',
            lastOpened: Date.now(),
            sceneCount: Object.keys(project.scenes || {}).length,
            characterCount: Object.keys(project.characters || {}).length,
        });
        
        // Trim to max
        recents = recents.slice(0, MAX_RECENT_PROJECTS);
        
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(recents));
    } catch (e) {
        console.warn('Failed to save recent project:', e);
    }
}

// Helper to load recent projects
function loadRecentProjects(): RecentProject[] {
    try {
        const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

// Helper to remove a recent project
function removeRecentProject(projectId: string): RecentProject[] {
    try {
        const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
        let recents: RecentProject[] = stored ? JSON.parse(stored) : [];
        recents = recents.filter(r => r.id !== projectId);
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(recents));
        return recents;
    } catch {
        return [];
    }
}

export const ProjectHub: React.FC<{
    onProjectSelect: (project: VNProject) => void;
}> = ({ onProjectSelect }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showChangelog, setShowChangelog] = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState<{ version: string; isNew: boolean } | null>(null);
    const [updateDownloading, setUpdateDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const [updateReady, setUpdateReady] = useState(false);
    const [autoUpdateFailed, setAutoUpdateFailed] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const toast = useToast();
    
    // Your itch.io page URL
    const ITCHIO_URL = 'https://memento-morii1.itch.io/flourish-visual-novel-engine';

    // Load recent projects on mount
    useEffect(() => {
        setRecentProjects(loadRecentProjects());
    }, []);

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

    // Listen for native auto-updater events
    useEffect(() => {
        if (!isElectron) return;
        
        const api = (window as any).electronAPI;
        
        // Update available from electron-updater
        api.onUpdateAvailable?.((info: { version: string }) => {
            console.log('Native update available:', info.version);
            setUpdateAvailable({ version: info.version, isNew: true });
            toast.info(`🎉 Update v${info.version} is available! Click to download.`, { duration: 6000 });
        });
        
        // Download progress
        api.onUpdateDownloadProgress?.((progress: { percent: number }) => {
            setDownloadProgress(Math.round(progress.percent));
        });
        
        // Update downloaded and ready to install
        api.onUpdateDownloaded?.((info: { version: string }) => {
            setUpdateDownloading(false);
            setDownloadProgress(null);
            setUpdateReady(true);
            toast.success(`Update v${info.version} downloaded! Click to install and restart.`, { duration: 0 }); // Don't auto-dismiss
        });
        
        // Update error
        api.onUpdateError?.((error: string) => {
            console.error('Update error:', error);
            setUpdateDownloading(false);
            setDownloadProgress(null);
            setAutoUpdateFailed(true);
            // Fall back to showing itch.io link
            toast.warning('Auto-update unavailable. You can download manually from itch.io.');
        });
    }, [isElectron, toast]);

    const handleDownloadUpdate = async () => {
        if (!isElectron) return;
        setUpdateDownloading(true);
        setDownloadProgress(0);
        toast.info('Downloading update...', { duration: 2000 });
        
        const result = await (window as any).electronAPI.downloadUpdate?.();
        if (!result?.success) {
            setUpdateDownloading(false);
            setAutoUpdateFailed(true);
            toast.warning('Auto-download failed. Use the itch.io link instead.');
        }
    };

    const handleOpenItchio = () => {
        window.open(ITCHIO_URL, '_blank');
    };

    const handleInstallUpdate = () => {
        if (!isElectron) return;
        toast.info('Installing update and restarting...');
        (window as any).electronAPI.installUpdate?.();
    };

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
        // Don't save to recent projects until user exports/saves the project
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

        setIsImporting(true);
        try {
            // importProject no longer saves to localStorage.
            // It just parses the file and returns the project object.
            const { project } = await importProject(file);
            if ((window as any).electronAPI?.setHubActive) {
                (window as any).electronAPI.setHubActive(false);
            }
            // Save to recent projects
            saveRecentProject(project);
            toast.success('Project imported successfully!');
            onProjectSelect(project);
        } catch (error) {
            console.error("Error importing project file:", error);
            toast.error(`Failed to import project: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsImporting(false);
        }

        // Reset file input
        if (event.target) {
            event.target.value = '';
        }
    };

    const handleRemoveRecent = (projectId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = removeRecentProject(projectId);
        setRecentProjects(updated);
        toast.info('Removed from recent projects');
    };

    // Format relative time
    const formatTimeAgo = (timestamp: number): string => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
    };

    return (
        <div className="h-screen w-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center p-4">
            {/* Update Available Banner */}
            {(updateAvailable || updateReady) && (
                <div className="fixed top-0 left-0 right-0 z-40">
                    <div 
                        className={`
                            flex items-center justify-center gap-3 py-3 px-4 flex-wrap
                            ${updateReady 
                                ? 'bg-gradient-to-r from-green-600 to-emerald-600' 
                                : updateAvailable?.isNew 
                                    ? 'bg-gradient-to-r from-[var(--accent-pink)] to-[var(--accent-purple)]' 
                                    : 'bg-[var(--accent-cyan)]/20 border-b border-[var(--accent-cyan)]/30'
                            }
                        `}
                    >
                        <SparkleIcon className="w-5 h-5" />
                        
                        {updateReady ? (
                            <>
                                <span className="font-medium">✅ Update v{updateAvailable?.version} ready to install!</span>
                                <button
                                    onClick={handleInstallUpdate}
                                    className="ml-2 px-4 py-1 bg-white text-green-700 rounded-full font-bold text-sm hover:bg-green-100 transition-colors"
                                >
                                    Install & Restart
                                </button>
                            </>
                        ) : updateDownloading ? (
                            <>
                                <span className="font-medium">Downloading update...</span>
                                <div className="w-32 h-2 bg-white/30 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-white rounded-full transition-all duration-300"
                                        style={{ width: `${downloadProgress || 0}%` }}
                                    />
                                </div>
                                <span className="text-sm">{downloadProgress}%</span>
                            </>
                        ) : (
                            <>
                                <span className="font-medium">
                                    {updateAvailable?.isNew 
                                        ? `🎉 New Update Available: v${updateAvailable.version}!` 
                                        : `Version ${updateAvailable?.version} available`
                                    }
                                </span>
                                
                                {/* Show auto-update button if not failed */}
                                {!autoUpdateFailed && (
                                    <button
                                        onClick={handleDownloadUpdate}
                                        className="ml-2 px-4 py-1 bg-white/20 hover:bg-white/30 rounded-full font-medium text-sm transition-colors"
                                    >
                                        Auto-Update
                                    </button>
                                )}
                                
                                {/* Always show itch.io link */}
                                <button
                                    onClick={handleOpenItchio}
                                    className="px-4 py-1 bg-white/20 hover:bg-white/30 rounded-full font-medium text-sm transition-colors flex items-center gap-1"
                                >
                                    📥 Download from itch.io
                                </button>
                                
                                <button
                                    onClick={() => setShowChangelog(true)}
                                    className="px-3 py-1 text-sm opacity-80 hover:opacity-100 underline"
                                >
                                    What's new?
                                </button>
                            </>
                        )}
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
                
                {/* Recent Projects Section */}
                {recentProjects.length > 0 && (
                    <section className="mt-10">
                        <h3 className="text-lg font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
                            <ClockIcon className="w-5 h-5" />
                            Recent Projects
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {recentProjects.map((recent) => (
                                <div
                                    key={recent.id}
                                    className="group relative bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-4 cursor-pointer transition-all hover:border-[var(--accent-cyan)]/50"
                                    onClick={handleFileOpen}
                                    title="Import this project to continue working on it"
                                >
                                    <button
                                        onClick={(e) => handleRemoveRecent(recent.id, e)}
                                        className="absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 bg-[var(--bg-primary)] hover:bg-red-500/20 text-[var(--text-secondary)] hover:text-red-400 transition-all"
                                        title="Remove from recent"
                                    >
                                        <TrashIcon className="w-3.5 h-3.5" />
                                    </button>
                                    <h4 className="font-semibold text-[var(--text-primary)] truncate pr-8">
                                        {recent.title}
                                    </h4>
                                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                                        {recent.sceneCount} scene{recent.sceneCount !== 1 ? 's' : ''} • {recent.characterCount} character{recent.characterCount !== 1 ? 's' : ''}
                                    </p>
                                    <p className="text-xs text-[var(--text-secondary)] opacity-70 mt-2">
                                        {formatTimeAgo(recent.lastOpened)}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] opacity-60 mt-3 text-center">
                            Click a project to import it (you'll need to select the exported .zip file)
                        </p>
                    </section>
                )}
                
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
            <LoadingOverlay 
                isVisible={isImporting} 
                message="Importing Project..." 
                subMessage="Extracting and processing files"
            />
        </div>
    );
};
