import React, { useEffect, useRef, useState } from 'react';
import { VNProject } from '../types/project';
import { createInitialProject } from '../constants';
import { PlusIcon, UploadIcon, SparkleIcon, ClockIcon, TrashIcon } from './icons';
import { importProject } from '../utils/projectPackager';
import { ChangelogModal } from './ChangelogModal';
import { useToast } from '../contexts/ToastContext';
import LoadingOverlay from './ui/LoadingOverlay';
import { getAutoSaveMetadata, loadProjectFromIDB, deleteAutoSave } from '../utils/storage';

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
    const [updateAvailable, setUpdateAvailable] = useState<{ version: string; isNew: boolean; downloadUrl: string } | null>(null);
    const [bannerDismissed, setBannerDismissed] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [recoveryProjects, setRecoveryProjects] = useState<Array<{id: string; title: string; savedAt: number}>>([]);
    const [showRecovery, setShowRecovery] = useState(false);
    const toast = useToast();
    
    const ITCHIO_URL = 'https://memento-morii1.itch.io/flourish-visual-novel-engine';

    useEffect(() => {
        setRecentProjects(loadRecentProjects());

        getAutoSaveMetadata().then(metas => {
            if (metas.length > 0) {
                setRecoveryProjects(metas.map(m => ({
                    id: m.projectId,
                    title: m.title,
                    savedAt: m.savedAt
                })));
                setShowRecovery(true);
            }
        }).catch(() => {});
    }, []);

    useEffect(() => {
        (window as any).__IS_MANAGER_WINDOW__ = false;
        if ((window as any).electronAPI?.setHubActive) {
            (window as any).electronAPI.setHubActive(true);
        }

        // Clear stale caches that may point to the wrong repo
        localStorage.removeItem('githubLatestReleaseCache');
        localStorage.removeItem('githubLatestReleaseBodyCache');

        return () => {
            if ((window as any).electronAPI?.setHubActive) {
                (window as any).electronAPI.setHubActive(false);
            }
        };
    }, []);

    const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

    // Check for updates via GitHub Releases API on mount
    useEffect(() => {
        const checkForUpdates = async () => {
            try {
                // Get current app version (works in both Electron and web)
                let currentVersion: string | null = null;
                if (isElectron) {
                    currentVersion = await (window as any).electronAPI?.getAppVersion();
                }
                if (!currentVersion) return;

                // Use a cache to avoid GitHub API rate-limits
                const cacheKey = 'githubLatestReleaseCache';
                const cachedRaw = localStorage.getItem(cacheKey);
                let releaseData: { version: string; downloadUrl: string } | null = null;

                if (cachedRaw) {
                    try {
                        const cached = JSON.parse(cachedRaw);
                        const oneHourMs = 60 * 60 * 1000;
                        if (cached?.version && cached?.downloadUrl && Date.now() - cached.fetchedAt < oneHourMs) {
                            releaseData = { version: cached.version, downloadUrl: cached.downloadUrl };
                        }
                    } catch { /* ignore bad cache */ }
                }

                if (!releaseData) {
                    const response = await fetch('https://api.github.com/repos/mrandmrshibbard/FlourishVNE-releases/releases/latest');
                    if (!response.ok) return;

                    const release = await response.json();
                    const latestVersion = (release.tag_name || '').replace(/^v/, '');
                    const downloadUrl = release.html_url || 'https://github.com/mrandmrshibbard/FlourishVNE-releases/releases/latest';

                    releaseData = { version: latestVersion, downloadUrl };

                    try {
                        localStorage.setItem(cacheKey, JSON.stringify({ ...releaseData, fetchedAt: Date.now() }));
                    } catch { /* ignore */ }
                }

                if (releaseData.version && releaseData.version !== currentVersion) {
                    const lastShown = localStorage.getItem('lastShownChangelogVersion');
                    const isNewUpdate = releaseData.version !== lastShown;

                    setUpdateAvailable({ version: releaseData.version, isNew: isNewUpdate, downloadUrl: releaseData.downloadUrl });

                    if (isNewUpdate) {
                        toast.info(`🎉 New version ${releaseData.version} is available!`, { duration: 5000 });
                        setShowChangelog(true);
                        localStorage.setItem('lastShownChangelogVersion', releaseData.version);
                    }
                }
            } catch (error) {
                console.error('Failed to check for updates:', error);
            }
        };

        checkForUpdates();
    }, [isElectron, toast]);

    const handleDownloadNewVersion = () => {
        const url = updateAvailable?.downloadUrl || 'https://github.com/mrandmrshibbard/FlourishVNE-releases/releases/latest';
        window.open(url, '_blank');
    };

    const handleOpenItchio = () => {
        window.open(ITCHIO_URL, '_blank');
    };

    const handleCreateNew = () => {
        if ((window as any).electronAPI?.setHubActive) {
            (window as any).electronAPI.setHubActive(false);
        }
        const newProject = createInitialProject();
        onProjectSelect(newProject);
    };

    const handleStartTutorial = async () => {
        try {
            const response = await fetch('welcome_onboarding_export/project.json');
            if (!response.ok) {
                throw new Error(`Failed to fetch tutorial project: ${response.statusText}`);
            }
            const project = (await response.json()) as VNProject;

            const BASE = 'welcome_onboarding_export/';
            const prefixUrl = (url: string | undefined): string | undefined => {
                if (!url || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http')) return url;
                return url.startsWith('assets/') ? BASE + url : url;
            };

            if (project.backgrounds) {
                for (const bg of Object.values(project.backgrounds)) {
                    (bg as any).imageUrl = prefixUrl((bg as any).imageUrl);
                }
            }
            if (project.images) {
                for (const img of Object.values(project.images)) {
                    (img as any).imageUrl = prefixUrl((img as any).imageUrl);
                }
            }
            if (project.audio) {
                for (const aud of Object.values(project.audio)) {
                    (aud as any).audioUrl = prefixUrl((aud as any).audioUrl);
                }
            }
            if (project.videos) {
                for (const vid of Object.values(project.videos as Record<string, any>)) {
                    vid.videoUrl = prefixUrl(vid.videoUrl);
                }
            }
            if (project.characters) {
                for (const char of Object.values(project.characters)) {
                    const c = char as any;
                    c.fontUrl = prefixUrl(c.fontUrl);
                    if (c.layers && typeof c.layers === 'object') {
                        for (const layer of Object.values(c.layers) as any[]) {
                            if (layer.assets && typeof layer.assets === 'object') {
                                for (const asset of Object.values(layer.assets) as any[]) {
                                    asset.imageUrl = prefixUrl(asset.imageUrl);
                                }
                            }
                        }
                    }
                }
            }

            if ((window as any).electronAPI?.setHubActive) {
                (window as any).electronAPI.setHubActive(false);
            }
            onProjectSelect(project);
            toast.success('Tutorial project loaded!');
        } catch (error) {
            console.error('Error loading tutorial project:', error);
            toast.error(`Failed to load tutorial: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
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
            {updateAvailable && !bannerDismissed && (
                <div className="fixed top-0 left-0 right-0 z-40">
                    <div 
                        className={`
                            flex items-center justify-center gap-3 py-3 px-4 flex-wrap backdrop-blur-md
                            ${updateAvailable.isNew 
                                ? 'bg-gradient-to-r from-[var(--accent-pink)]/90 via-[var(--accent-lavender)]/90 to-[var(--accent-cyan)]/90' 
                                : 'bg-[var(--bg-secondary)]/80 border-b border-[var(--accent-cyan)]/30'
                            }
                        `}
                        style={{
                            boxShadow: updateAvailable.isNew 
                                ? '0 4px 30px rgba(184, 126, 255, 0.3)' 
                                : 'none'
                        }}
                    >
                        <SparkleIcon className="w-5 h-5 animate-glow" />
                        
                        <span className="font-semibold">
                            {updateAvailable.isNew 
                                ? `🎉 New Update Available: v${updateAvailable.version}!` 
                                : `Version ${updateAvailable.version} available`
                            }
                        </span>
                        
                        {/* Download from GitHub */}
                        <button
                            onClick={handleDownloadNewVersion}
                            className="ml-2 px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-full font-semibold text-sm transition-all flex items-center gap-1.5 hover:scale-105"
                        >
                            📥 Download from GitHub
                        </button>
                        
                        {/* Also show itch.io link */}
                        <button
                            onClick={handleOpenItchio}
                            className="px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-full font-semibold text-sm transition-all flex items-center gap-1.5 hover:scale-105"
                        >
                            🎮 itch.io
                        </button>
                        
                        <button
                            onClick={() => setShowChangelog(true)}
                            className="px-3 py-1 text-sm opacity-80 hover:opacity-100 underline decoration-dotted underline-offset-2"
                        >
                            What's new?
                        </button>
                        
                        {/* Dismiss button */}
                        <button
                            onClick={() => setBannerDismissed(true)}
                            className="ml-2 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all"
                            title="Dismiss"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
            
            {showRecovery && recoveryProjects.length > 0 && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[var(--bg-secondary)] border border-[var(--accent-cyan)]/30 rounded-2xl p-6 max-w-md w-full shadow-2xl">
                        <h2 className="text-xl font-bold mb-2 text-[var(--accent-cyan)]">Recover Unsaved Work</h2>
                        <p className="text-[var(--text-secondary)] text-sm mb-4">
                            Auto-saved projects were found from a previous session. Would you like to restore one?
                        </p>
                        <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                            {recoveryProjects.map(rp => (
                                <button
                                    key={rp.id}
                                    onClick={async () => {
                                        try {
                                            const project = await loadProjectFromIDB(rp.id as any);
                                            if (project) {
                                                saveRecentProject(project);
                                                toast.success('Project recovered!');
                                                onProjectSelect(project);
                                            } else {
                                                toast.error('Could not load saved project.');
                                            }
                                        } catch {
                                            toast.error('Failed to recover project.');
                                        }
                                        setShowRecovery(false);
                                    }}
                                    className="w-full text-left p-3 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--accent-cyan)]/20 transition-colors border border-transparent hover:border-[var(--accent-cyan)]/30"
                                >
                                    <div className="font-medium text-[var(--text-primary)]">{rp.title}</div>
                                    <div className="text-xs text-[var(--text-muted)] mt-1">
                                        Saved {formatTimeAgo(rp.savedAt)}
                                    </div>
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowRecovery(false)}
                                className="flex-1 px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80 text-[var(--text-secondary)] transition-colors text-sm"
                            >
                                Start Fresh
                            </button>
                            <button
                                onClick={async () => {
                                    for (const rp of recoveryProjects) {
                                        await deleteAutoSave(rp.id as any).catch(() => {});
                                    }
                                    setRecoveryProjects([]);
                                    setShowRecovery(false);
                                    toast.info('Auto-saves cleared.');
                                }}
                                className="px-4 py-2 rounded-lg bg-red-900/50 hover:bg-red-800/50 text-red-300 transition-colors text-sm"
                            >
                                Discard All
                            </button>
                        </div>
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
                        className="group relative w-full md:w-1/3 h-72 text-center p-8 rounded-3xl transition-all duration-300 transform hover:scale-[1.02] flex flex-col items-center justify-center overflow-hidden"
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
                    
                    {/* Start Tutorial Card */}
                    <button 
                        onClick={handleStartTutorial}
                        className="group relative w-full md:w-1/3 h-72 text-center p-8 rounded-3xl transition-all duration-300 transform hover:scale-[1.02] flex flex-col items-center justify-center overflow-hidden"
                        style={{
                            background: 'linear-gradient(180deg, var(--bg-tertiary) 0%, var(--bg-secondary) 100%)',
                            border: '1px solid var(--border-subtle)',
                            boxShadow: 'var(--shadow-lg), inset 0 1px 0 rgba(255, 255, 255, 0.03)'
                        }}
                    >
                        <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            style={{
                                padding: '1px',
                                background: 'linear-gradient(135deg, #f5c542, #e6a817)',
                                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                                WebkitMaskComposite: 'xor',
                                maskComposite: 'exclude',
                            }}
                        />
                        
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"
                            style={{ boxShadow: 'inset 0 0 60px rgba(245, 197, 66, 0.1), 0 0 40px rgba(245, 197, 66, 0.15)' }}
                        />
                        
                        <div className="relative z-10 p-5 rounded-2xl mb-5 group-hover:scale-110 transition-transform duration-300"
                            style={{
                                background: 'linear-gradient(135deg, rgba(245, 197, 66, 0.2) 0%, rgba(230, 168, 23, 0.15) 100%)',
                                boxShadow: '0 0 30px rgba(245, 197, 66, 0.2)'
                            }}
                        >
                            <span className="text-4xl">🎓</span>
                        </div>
                        <h2 className="relative z-10 text-xl font-bold text-[var(--text-primary)] mb-2">Start Tutorial</h2>
                        <p className="relative z-10 text-[var(--text-muted)] text-sm">Learn the basics with a guided project</p>
                        
                        <div className="absolute top-6 right-8 text-yellow-400 opacity-40 group-hover:opacity-80 transition-opacity">✦</div>
                        <div className="absolute bottom-8 left-10 text-amber-300 opacity-30 group-hover:opacity-70 transition-opacity">✧</div>
                    </button>
                    
                    {/* Import Project Card */}
                    <button 
                        onClick={handleFileOpen}
                        className="group relative w-full md:w-1/3 h-72 text-center p-8 rounded-3xl transition-all duration-300 transform hover:scale-[1.02] flex flex-col items-center justify-center overflow-hidden"
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
