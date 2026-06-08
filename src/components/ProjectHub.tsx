import React, { useEffect, useRef, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
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
    lastOpened: number; // timestamp in milliseconds
    sceneCount: number;
    characterCount: number;
    /** Absolute path to the .flourish / .zip file on disk (if known). */
    filePath?: string;
}

/** A file entry returned by the main process's list-project-files IPC. */
interface SavedProjectFile {
    name: string;
    path: string;
    size: number;       // bytes
    modified: number;   // timestamp in milliseconds
}

const RECENT_PROJECTS_KEY = 'flourish:recentProjects';
const MAX_RECENT_PROJECTS = 5;

// Helper to save recent project metadata - exported for use by Header on successful exports
export function saveRecentProject(project: VNProject, filePath?: string): void {
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
            filePath: filePath || undefined,
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
    const [autoUpdateStatus, setAutoUpdateStatus] = useState<string | null>(null);
    const [autoUpdateError, setAutoUpdateError] = useState<string | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [savedProjectFiles, setSavedProjectFiles] = useState<SavedProjectFile[]>([]);
    const [recoveryProjects, setRecoveryProjects] = useState<Array<{id: string; title: string; savedAt: number}>>([]);
    const [showRecovery, setShowRecovery] = useState(false);
    const toast = useToast();
    const { t } = useTranslation('hub');

    const ITCHIO_URL = 'https://memento-morii1.itch.io/flourish-visual-novel-engine';

    useEffect(() => {
        setRecentProjects(loadRecentProjects());

        // Scan the default Projects directory for saved .flourish / .zip files
        const api = (window as any).electronAPI;
        if (api?.listProjectFiles) {
            api.listProjectFiles().then((result: { success: boolean; files: SavedProjectFile[] }) => {
                if (result.success) {
                    setSavedProjectFiles(result.files);
                }
            }).catch(() => {});
        }

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
                        toast.info(t('toast.newVersionAvailable', { version: releaseData.version }), { duration: 5000 });
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

    // Listen for auto-update status events from electron-updater
    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.onUpdateStatus) return;
        api.onUpdateStatus((event: any) => {
            setAutoUpdateStatus(event.status);
            if (event.status === 'error') {
                setAutoUpdateError(event.message || t('toast.updateFailed'));
            } else {
                setAutoUpdateError(null);
            }
            if (event.status === 'downloaded') {
                toast.success(t('toast.updateDownloaded'));
            }
        });
    }, [toast]);

    const handleRestartAndUpdate = async () => {
        const api = (window as any).electronAPI;
        if (!api?.installUpdate) {
            toast.error(t('toast.autoUpdateUnavailable'));
            return;
        }
        setAutoUpdateStatus('installing');
        setAutoUpdateError(null);
        try {
            const result = await api.installUpdate();
            if (result?.status === 'error') {
                setAutoUpdateStatus('error');
                setAutoUpdateError(result.message || t('toast.updateFailed'));
                toast.error(result.message || t('toast.updateFailedManual'));
            }
        } catch (err: any) {
            setAutoUpdateStatus('error');
            setAutoUpdateError(err?.message || t('toast.updateFailed'));
            toast.error(t('toast.updateFailedManualGithub'));
        }
    };

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
            toast.success(t('toast.tutorialLoaded'));
        } catch (error) {
            console.error('Error loading tutorial project:', error);
            toast.error(t('toast.tutorialFailed', { error: error instanceof Error ? error.message : 'Unknown error' }));
        }
    };

    const handleFileOpen = () => {
        if ((window as any).electronAPI?.setHubActive) {
            (window as any).electronAPI.setHubActive(false);
        }
        fileInputRef.current?.click();
    };

    /**
     * Open a project from a known file path on disk (from Recent Projects,
     * Saved Projects, or the native Open dialog).
     */
    const handleOpenFromPath = async (filePath: string) => {
        const api = (window as any).electronAPI;
        if (!api?.readProjectFile) {
            // Not running in Electron — fall back to file picker
            handleFileOpen();
            return;
        }

        setIsImporting(true);
        try {
            const result = await api.readProjectFile(filePath);
            if (!result.success) {
                toast.error(result.error || t('toast.readFileFailed'));
                return;
            }

            // result.data is a Uint8Array (IPC-serialised Buffer)
            const { project } = await importProject(result.data);
            if (api?.setHubActive) {
                api.setHubActive(false);
            }
            saveRecentProject(project, filePath);
            toast.success(t('toast.projectLoaded'));
            onProjectSelect(project);
        } catch (error) {
            console.error('Error opening project from path:', error);
            toast.error(t('toast.openFailed', { error: error instanceof Error ? error.message : 'Unknown error' }));
        } finally {
            setIsImporting(false);
        }
    };

    /**
     * Use the native Open dialog (via IPC) to pick a project file.
     * Falls back to the HTML file input when not running in Electron.
     */
    const handleNativeOpen = async () => {
        const api = (window as any).electronAPI;
        if (!api?.openProjectDialog) {
            handleFileOpen();
            return;
        }

        setIsImporting(true);
        try {
            const result = await api.openProjectDialog();
            if (!result.success) {
                if (!result.canceled) toast.error(result.error || t('toast.openFailedGeneric'));
                return;
            }

            const { project } = await importProject(result.data);
            if (api?.setHubActive) {
                api.setHubActive(false);
            }
            saveRecentProject(project, result.filePath);
            toast.success(t('toast.projectLoaded'));
            onProjectSelect(project);
        } catch (error) {
            console.error('Error opening project:', error);
            toast.error(t('toast.openFailed', { error: error instanceof Error ? error.message : 'Unknown error' }));
        } finally {
            setIsImporting(false);
        }
    };

    /**
     * Open the default Projects folder in the OS file explorer.
     */
    const handleRevealProjectsFolder = async () => {
        const api = (window as any).electronAPI;
        if (!api?.getUserDataPaths || !api?.revealInExplorer) return;
        try {
            const paths = await api.getUserDataPaths();
            await api.revealInExplorer(paths.projects);
        } catch {
            toast.error(t('toast.folderOpenFailed'));
        }
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
            toast.success(t('toast.importSuccess'));
            onProjectSelect(project);
        } catch (error) {
            console.error("Error importing project file:", error);
            toast.error(t('toast.importFailed', { error: error instanceof Error ? error.message : 'Unknown error' }));
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
        toast.info(t('toast.removedFromRecent'));
    };

    // Format relative time
    const formatTimeAgo = (timestamp: number): string => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return t('time.justNow');
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return t('time.minutesAgo', { count: minutes });
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return t('time.hoursAgo', { count: hours });
        const days = Math.floor(hours / 24);
        if (days < 7) return t('time.daysAgo', { count: days });
        return new Date(timestamp).toLocaleDateString();
    };

    return (
        <div className="h-screen w-screen text-[var(--text-primary)] flex items-center justify-center p-4 overflow-y-auto"
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
                                ? t('updateBanner.newUpdate', { version: updateAvailable.version })
                                : t('updateBanner.versionAvailable', { version: updateAvailable.version })
                            }
                        </span>
                        
                        {/* Restart & Update via electron-updater */}
                        {isElectron && (
                            <button
                                onClick={handleRestartAndUpdate}
                                disabled={autoUpdateStatus === 'installing'}
                                className="ml-2 px-4 py-1.5 bg-white/30 hover:bg-white/45 rounded-full font-bold text-sm transition-all flex items-center gap-1.5 hover:scale-105 disabled:opacity-50 disabled:cursor-wait border border-white/40"
                            >
                                {autoUpdateStatus === 'installing' ? t('updateBanner.installing')
                                    : autoUpdateStatus === 'downloading' ? t('updateBanner.downloading')
                                    : t('updateBanner.restartUpdate')}
                            </button>
                        )}

                        {autoUpdateError && (
                            <span className="text-xs text-red-200 bg-red-500/30 px-2 py-1 rounded">
                                ⚠️ {autoUpdateError}
                            </span>
                        )}

                        {/* Download from GitHub (fallback) */}
                        <button
                            onClick={handleDownloadNewVersion}
                            className="px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-full font-semibold text-sm transition-all flex items-center gap-1.5 hover:scale-105"
                        >
                            {t('updateBanner.downloadGithub')}
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
                            {t('updateBanner.whatsNew')}
                        </button>
                        
                        {/* Dismiss button */}
                        <button
                            onClick={() => setBannerDismissed(true)}
                            className="ml-2 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all"
                            title={t('updateBanner.dismiss')}
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
                        <h2 className="text-xl font-bold mb-2 text-[var(--accent-cyan)]">{t('recovery.title')}</h2>
                        <p className="text-[var(--text-secondary)] text-sm mb-4">
                            {t('recovery.prompt')}
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
                                                toast.success(t('toast.projectRecovered'));
                                                onProjectSelect(project);
                                            } else {
                                                toast.error(t('toast.couldNotLoadSaved'));
                                            }
                                        } catch {
                                            toast.error(t('toast.recoverFailed'));
                                        }
                                        setShowRecovery(false);
                                    }}
                                    className="w-full text-left p-3 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--accent-cyan)]/20 transition-colors border border-transparent hover:border-[var(--accent-cyan)]/30"
                                >
                                    <div className="font-medium text-[var(--text-primary)]">{rp.title}</div>
                                    <div className="text-xs text-[var(--text-muted)] mt-1">
                                        {t('recovery.savedAt', { time: formatTimeAgo(rp.savedAt) })}
                                    </div>
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowRecovery(false)}
                                className="flex-1 px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80 text-[var(--text-secondary)] transition-colors text-sm"
                            >
                                {t('recovery.startFresh')}
                            </button>
                            <button
                                onClick={async () => {
                                    for (const rp of recoveryProjects) {
                                        await deleteAutoSave(rp.id as any).catch(() => {});
                                    }
                                    setRecoveryProjects([]);
                                    setShowRecovery(false);
                                    toast.info(t('toast.autoSavesCleared'));
                                }}
                                className="px-4 py-2 rounded-lg bg-red-900/50 hover:bg-red-800/50 text-red-300 transition-colors text-sm"
                            >
                                {t('recovery.discardAll')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="w-full max-w-5xl p-8 relative z-10 my-auto">
                <header className="text-center mb-8">
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
                    <p className="text-[var(--text-secondary)] text-lg font-medium">{t('tagline')}</p>
                    <p className="text-[var(--text-muted)] mt-2 text-sm flex items-center justify-center gap-2">
                        <span className="inline-block w-8 h-[1px] bg-gradient-to-r from-transparent to-[var(--accent-pink)]" />
                        {t('subtitle')}
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
                        <h2 className="relative z-10 text-xl font-bold text-[var(--text-primary)] mb-2">{t('createNew')}</h2>
                        <p className="relative z-10 text-[var(--text-muted)] text-sm">{t('createNewDesc')}</p>
                        
                        {/* Decorative sparkles */}
                        <div className="absolute top-6 right-8 text-[var(--accent-pink)] opacity-40 group-hover:opacity-80 transition-opacity">✦</div>
                        <div className="absolute bottom-8 left-10 text-[var(--accent-lavender)] opacity-30 group-hover:opacity-70 transition-opacity">✧</div>
                    </button>
                    
                    {/* Start Demo Card */}
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
                        <h2 className="relative z-10 text-xl font-bold text-[var(--text-primary)] mb-2">{t('startTutorial')}</h2>
                        <p className="relative z-10 text-[var(--text-muted)] text-sm">{t('startTutorialDesc')}</p>
                        
                        <div className="absolute top-6 right-8 text-yellow-400 opacity-40 group-hover:opacity-80 transition-opacity">✦</div>
                        <div className="absolute bottom-8 left-10 text-amber-300 opacity-30 group-hover:opacity-70 transition-opacity">✧</div>
                    </button>
                    
                    {/* Import Project Card */}
                    <button 
                        onClick={isElectron ? handleNativeOpen : handleFileOpen}
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
                        <h2 className="relative z-10 text-xl font-bold text-[var(--text-primary)] mb-2">{t('openProject')}</h2>
                        <p className="relative z-10 text-[var(--text-muted)] text-sm">{t('openProjectDesc')}</p>
                        
                        {/* Decorative sparkles */}
                        <div className="absolute top-8 left-8 text-[var(--accent-cyan)] opacity-40 group-hover:opacity-80 transition-opacity">✦</div>
                        <div className="absolute bottom-6 right-10 text-[var(--accent-mint)] opacity-30 group-hover:opacity-70 transition-opacity">✧</div>
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".zip,.flourish,application/zip" onChange={handleFileChange} />
                </main>
                
                {/* Recent Projects Section */}
                {recentProjects.length > 0 && (
                    <section className="mt-8">
                        <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-5 flex items-center gap-3 uppercase tracking-widest">
                            <span className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[var(--accent-lavender)]" />
                            <ClockIcon className="w-4 h-4 text-[var(--accent-lavender)]" />
                            {t('recentProjects')}
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
                                    onClick={() => {
                                        if (recent.filePath) {
                                            handleOpenFromPath(recent.filePath);
                                        } else {
                                            isElectron ? handleNativeOpen() : handleFileOpen();
                                        }
                                    }}
                                    title={recent.filePath ? t('openFile', { path: recent.filePath }) : t('importToContinue')}
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
                                        title={t('removeFromRecent')}
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
                                    {recent.filePath && (
                                        <p className="text-[10px] text-[var(--text-muted)] mt-1.5 truncate opacity-60" title={recent.filePath}>
                                            📁 {recent.filePath}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Saved Projects on Disk (Electron only) */}
                {isElectron && savedProjectFiles.length > 0 && (
                    <section className="mt-6">
                        <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-5 flex items-center gap-3 uppercase tracking-widest">
                            <span className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[var(--accent-cyan)]" />
                            <span className="text-base">📂</span>
                            {t('savedProjects')}
                            <span className="w-8 h-[1px] bg-gradient-to-l from-transparent to-[var(--accent-cyan)]" />
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {savedProjectFiles.map((file) => (
                                <button
                                    key={file.path}
                                    onClick={() => handleOpenFromPath(file.path)}
                                    className="group relative rounded-xl p-4 text-left transition-all duration-200 hover:scale-[1.01]"
                                    style={{
                                        background: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border-subtle)',
                                    }}
                                    title={file.path}
                                >
                                    <div className="font-semibold text-sm text-[var(--text-primary)] truncate mb-1">
                                        {file.name.replace(/\.(flourish|zip)$/i, '')}
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                                        <span>{(file.size / 1024).toFixed(0)} KB</span>
                                        <span>{formatTimeAgo(file.modified)}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>
                )}
                
                 <footer className="text-center mt-8 pb-4 text-[var(--text-muted)] text-sm">
                    {isElectron ? (
                        <>
                            <p className="opacity-70"><Trans t={t} i18nKey="projectsFolderNote" components={{ strong: <strong /> }} /></p>
                            <div className="flex items-center justify-center gap-4 mt-3">
                                <button
                                    onClick={handleRevealProjectsFolder}
                                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] transition-all inline-flex items-center gap-2 group"
                                >
                                    📂 {t('openProjectsFolder')}
                                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                                </button>
                                <span className="text-[var(--border-subtle)]">|</span>
                                <button
                                    onClick={() => setShowChangelog(true)}
                                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] transition-all inline-flex items-center gap-2 group"
                                >
                                    {t('viewLatestChanges')}
                                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="opacity-70">{t('inMemoryNote')}</p>
                            <button
                                onClick={() => setShowChangelog(true)}
                                className="mt-4 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] transition-all inline-flex items-center gap-2 group"
                            >
                                {t('viewLatestChanges')}
                                <span className="group-hover:translate-x-1 transition-transform">→</span>
                            </button>
                        </>
                    )}
                    <p className="mt-4 text-xs opacity-50 font-mono">v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—'}</p>
                </footer>
            </div>
            <ChangelogModal visible={showChangelog} onClose={() => setShowChangelog(false)} />
            <LoadingOverlay
                isVisible={isImporting}
                message={t('importingProject')}
                subMessage={t('importingProjectSub')}
            />
        </div>
    );
};
