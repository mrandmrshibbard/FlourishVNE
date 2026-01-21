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
        <div className="h-screen w-screen text-[var(--text-primary)] flex items-center justify-center p-4 overflow-hidden"
            style={{
                background: `
                    radial-gradient(ellipse at 20% 30%, rgba(255, 126, 179, 0.12) 0%, transparent 50%),
                    radial-gradient(ellipse at 80% 70%, rgba(126, 255, 255, 0.1) 0%, transparent 50%),
                    radial-gradient(ellipse at 50% 100%, rgba(184, 126, 255, 0.08) 0%, transparent 40%),
                    linear-gradient(180deg, var(--bg-primary) 0%, #0a0612 100%)
                `
            }}
        >
            {/* Floating decorative elements */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-20 left-10 w-32 h-32 rounded-full bg-gradient-to-br from-[var(--accent-pink)]/10 to-transparent blur-2xl animate-float" style={{ animationDelay: '0s' }} />
                <div className="absolute top-40 right-20 w-40 h-40 rounded-full bg-gradient-to-br from-[var(--accent-cyan)]/10 to-transparent blur-2xl animate-float" style={{ animationDelay: '1s' }} />
                <div className="absolute bottom-32 left-1/4 w-24 h-24 rounded-full bg-gradient-to-br from-[var(--accent-lavender)]/10 to-transparent blur-2xl animate-float" style={{ animationDelay: '2s' }} />
                <div className="absolute bottom-20 right-1/3 w-36 h-36 rounded-full bg-gradient-to-br from-[var(--accent-mint)]/8 to-transparent blur-2xl animate-float" style={{ animationDelay: '1.5s' }} />
            </div>
            
            {/* Update Available Banner */}
            {(updateAvailable || updateReady) && (
                <div className="fixed top-0 left-0 right-0 z-40">
                    <div 
                        className={`
                            flex items-center justify-center gap-3 py-3 px-4 flex-wrap backdrop-blur-md
                            ${updateReady 
                                ? 'bg-gradient-to-r from-[var(--accent-mint)]/90 to-[var(--accent-cyan)]/90' 
                                : updateAvailable?.isNew 
                                    ? 'bg-gradient-to-r from-[var(--accent-pink)]/90 via-[var(--accent-lavender)]/90 to-[var(--accent-cyan)]/90' 
                                    : 'bg-[var(--bg-secondary)]/80 border-b border-[var(--accent-cyan)]/30'
                            }
                        `}
                        style={{
                            boxShadow: updateReady || updateAvailable?.isNew 
                                ? '0 4px 30px rgba(184, 126, 255, 0.3)' 
                                : 'none'
                        }}
                    >
                        <SparkleIcon className="w-5 h-5 animate-glow" />
                        
                        {updateReady ? (
                            <>
                                <span className="font-semibold">✅ Update v{updateAvailable?.version} ready to install!</span>
                                <button
                                    onClick={handleInstallUpdate}
                                    className="ml-2 px-4 py-1.5 bg-white text-[var(--accent-mint)] rounded-full font-bold text-sm hover:bg-white/90 transition-all shadow-lg hover:scale-105"
                                >
                                    Install & Restart
                                </button>
                            </>
                        ) : updateDownloading ? (
                            <>
                                <span className="font-medium">Downloading update...</span>
                                <div className="w-32 h-2 bg-white/30 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full rounded-full transition-all duration-300"
                                        style={{ 
                                            width: `${downloadProgress || 0}%`,
                                            background: 'linear-gradient(90deg, var(--accent-pink), var(--accent-cyan))'
                                        }}
                                    />
                                </div>
                                <span className="text-sm font-medium">{downloadProgress}%</span>
                            </>
                        ) : (
                            <>
                                <span className="font-semibold">
                                    {updateAvailable?.isNew 
                                        ? `🎉 New Update Available: v${updateAvailable.version}!` 
                                        : `Version ${updateAvailable?.version} available`
                                    }
                                </span>
                                
                                {/* Show auto-update button if not failed */}
                                {!autoUpdateFailed && (
                                    <button
                                        onClick={handleDownloadUpdate}
                                        className="ml-2 px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-full font-semibold text-sm transition-all hover:scale-105"
                                    >
                                        Auto-Update
                                    </button>
                                )}
                                
                                {/* Always show itch.io link */}
                                <button
                                    onClick={handleOpenItchio}
                                    className="px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-full font-semibold text-sm transition-all flex items-center gap-1.5 hover:scale-105"
                                >
                                    📥 Download from itch.io
                                </button>
                                
                                <button
                                    onClick={() => setShowChangelog(true)}
                                    className="px-3 py-1 text-sm opacity-80 hover:opacity-100 underline decoration-dotted underline-offset-2"
                                >
                                    What's new?
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
            
            <div className="w-full max-w-5xl p-8 relative z-10">
                <header className="text-center mb-14">
                    {/* Logo/Icon */}
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 animate-float"
                        style={{
                            background: 'linear-gradient(135deg, var(--accent-pink) 0%, var(--accent-lavender) 50%, var(--accent-cyan) 100%)',
                            boxShadow: 'var(--shadow-glow-rainbow), var(--shadow-lg)'
                        }}
                    >
                        <span className="text-4xl">🌸</span>
                    </div>
                    
                    <h1 className="font-heading text-5xl md:text-6xl font-bold mb-4"
                        style={{
                            background: 'linear-gradient(135deg, var(--accent-pink) 0%, var(--pastel-peach) 25%, var(--accent-lavender) 50%, var(--accent-cyan) 75%, var(--accent-mint) 100%)',
                            backgroundSize: '200% auto',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            animation: 'rainbow-text 6s linear infinite',
                            textShadow: '0 0 80px rgba(184, 126, 255, 0.4)'
                        }}
                    >
                        Flourish
                    </h1>
                    <p className="text-[var(--text-secondary)] text-lg font-medium">Visual Novel Engine</p>
                    <p className="text-[var(--text-muted)] mt-2 text-sm flex items-center justify-center gap-2">
                        <span className="inline-block w-8 h-[1px] bg-gradient-to-r from-transparent to-[var(--accent-pink)]" />
                        Create Without Limits
                        <span className="inline-block w-8 h-[1px] bg-gradient-to-l from-transparent to-[var(--accent-cyan)]" />
                    </p>
                </header>

                <main className="flex flex-col md:flex-row items-stretch justify-center gap-6">
                    {/* Create New Project Card */}
                    <button 
                        onClick={handleCreateNew}
                        className="group relative w-full md:w-1/2 h-72 text-center p-8 rounded-3xl transition-all duration-300 transform hover:scale-[1.02] flex flex-col items-center justify-center overflow-hidden"
                        style={{
                            background: 'linear-gradient(180deg, var(--bg-tertiary) 0%, var(--bg-secondary) 100%)',
                            border: '1px solid var(--border-subtle)',
                            boxShadow: 'var(--shadow-lg), inset 0 1px 0 rgba(255, 255, 255, 0.03)'
                        }}
                    >
                        {/* Animated gradient border on hover */}
                        <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            style={{
                                padding: '1px',
                                background: 'linear-gradient(135deg, var(--accent-pink), var(--accent-lavender))',
                                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                                WebkitMaskComposite: 'xor',
                                maskComposite: 'exclude',
                            }}
                        />
                        
                        {/* Glow effect */}
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"
                            style={{ boxShadow: 'inset 0 0 60px rgba(255, 126, 179, 0.1), 0 0 40px rgba(255, 126, 179, 0.15)' }}
                        />
                        
                        <div className="relative z-10 p-5 rounded-2xl mb-5 group-hover:scale-110 transition-transform duration-300"
                            style={{
                                background: 'linear-gradient(135deg, rgba(255, 126, 179, 0.2) 0%, rgba(184, 126, 255, 0.15) 100%)',
                                boxShadow: '0 0 30px rgba(255, 126, 179, 0.2)'
                            }}
                        >
                            <PlusIcon className="w-10 h-10 text-[var(--accent-pink)]" />
                        </div>
                        <h2 className="relative z-10 text-xl font-bold text-[var(--text-primary)] mb-2">Create New Project</h2>
                        <p className="relative z-10 text-[var(--text-muted)] text-sm">Start your story from scratch</p>
                        
                        {/* Decorative sparkles */}
                        <div className="absolute top-6 right-8 text-[var(--accent-pink)] opacity-40 group-hover:opacity-80 transition-opacity">✦</div>
                        <div className="absolute bottom-8 left-10 text-[var(--accent-lavender)] opacity-30 group-hover:opacity-70 transition-opacity">✧</div>
                    </button>
                    
                    {/* Import Project Card */}
                    <button 
                        onClick={handleFileOpen}
                        className="group relative w-full md:w-1/2 h-72 text-center p-8 rounded-3xl transition-all duration-300 transform hover:scale-[1.02] flex flex-col items-center justify-center overflow-hidden"
                        style={{
                            background: 'linear-gradient(180deg, var(--bg-tertiary) 0%, var(--bg-secondary) 100%)',
                            border: '1px solid var(--border-subtle)',
                            boxShadow: 'var(--shadow-lg), inset 0 1px 0 rgba(255, 255, 255, 0.03)'
                        }}
                    >
                        {/* Animated gradient border on hover */}
                        <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            style={{
                                padding: '1px',
                                background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-mint))',
                                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                                WebkitMaskComposite: 'xor',
                                maskComposite: 'exclude',
                            }}
                        />
                        
                        {/* Glow effect */}
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"
                            style={{ boxShadow: 'inset 0 0 60px rgba(126, 255, 255, 0.1), 0 0 40px rgba(126, 255, 255, 0.15)' }}
                        />
                        
                        <div className="relative z-10 p-5 rounded-2xl mb-5 group-hover:scale-110 transition-transform duration-300"
                            style={{
                                background: 'linear-gradient(135deg, rgba(126, 255, 255, 0.2) 0%, rgba(126, 184, 255, 0.15) 100%)',
                                boxShadow: '0 0 30px rgba(126, 255, 255, 0.2)'
                            }}
                        >
                            <UploadIcon className="w-10 h-10 text-[var(--accent-cyan)]" />
                        </div>
                        <h2 className="relative z-10 text-xl font-bold text-[var(--text-primary)] mb-2">Import Project</h2>
                        <p className="relative z-10 text-[var(--text-muted)] text-sm">Load a .zip project file</p>
                        
                        {/* Decorative sparkles */}
                        <div className="absolute top-8 left-8 text-[var(--accent-cyan)] opacity-40 group-hover:opacity-80 transition-opacity">✦</div>
                        <div className="absolute bottom-6 right-10 text-[var(--accent-mint)] opacity-30 group-hover:opacity-70 transition-opacity">✧</div>
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".zip,application/zip" onChange={handleFileChange} />
                </main>
                
                {/* Recent Projects Section */}
                {recentProjects.length > 0 && (
                    <section className="mt-14">
                        <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-5 flex items-center gap-3 uppercase tracking-widest">
                            <span className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[var(--accent-lavender)]" />
                            <ClockIcon className="w-4 h-4 text-[var(--accent-lavender)]" />
                            Recent Projects
                            <span className="w-8 h-[1px] bg-gradient-to-l from-transparent to-[var(--accent-lavender)]" />
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {recentProjects.map((recent, index) => (
                                <div
                                    key={recent.id}
                                    className="group relative rounded-2xl p-5 cursor-pointer transition-all duration-300 hover:scale-[1.02]"
                                    style={{
                                        background: 'linear-gradient(180deg, var(--bg-tertiary) 0%, var(--bg-secondary) 100%)',
                                        border: '1px solid var(--border-subtle)',
                                        boxShadow: 'var(--shadow-md)',
                                        animationDelay: `${index * 0.1}s`
                                    }}
                                    onClick={handleFileOpen}
                                    title="Import this project to continue working on it"
                                >
                                    {/* Color accent bar */}
                                    <div 
                                        className="absolute top-0 left-4 right-4 h-[2px] rounded-full"
                                        style={{
                                            background: `linear-gradient(90deg, 
                                                ${['var(--accent-pink)', 'var(--accent-cyan)', 'var(--accent-mint)', 'var(--accent-lavender)', 'var(--accent-peach)'][index % 5]}, 
                                                transparent)`
                                        }}
                                    />
                                    
                                    <button
                                        onClick={(e) => handleRemoveRecent(recent.id, e)}
                                        className="absolute top-4 right-4 p-2 rounded-xl opacity-0 group-hover:opacity-100 bg-[var(--bg-primary)]/80 hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-400 transition-all backdrop-blur-sm"
                                        title="Remove from recent"
                                    >
                                        <TrashIcon className="w-3.5 h-3.5" />
                                    </button>
                                    <h4 className="font-bold text-[var(--text-primary)] truncate pr-10 mb-3">
                                        {recent.title}
                                    </h4>
                                    <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                                        <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--bg-primary)]/50">
                                            📖 {recent.sceneCount}
                                        </span>
                                        <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--bg-primary)]/50">
                                            👤 {recent.characterCount}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[var(--text-tertiary)] mt-3 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-mint)]" />
                                        {formatTimeAgo(recent.lastOpened)}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mt-5 text-center opacity-70">
                            Click a project to import it (you'll need to select the exported .zip file)
                        </p>
                    </section>
                )}
                
                 <footer className="text-center mt-14 text-[var(--text-muted)] text-sm">
                    <p className="opacity-70">Your work is managed in memory. Use the 'Export' button in the editor to save.</p>
                    <button
                        onClick={() => setShowChangelog(true)}
                        className="mt-4 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] transition-all inline-flex items-center gap-2 group"
                    >
                        View Latest Changes 
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
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
