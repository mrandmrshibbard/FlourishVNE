import React, { useState } from 'react';
import { VNProject, VNProjectFont, CGGalleryConfig, CGGalleryEntry } from '../types/project';
import { VNProjectUI, VNFontSettings } from '../features/ui/types';
import { useProject } from '../contexts/ProjectContext';
import { Cog6ToothIcon, PhotoIcon, BookOpenIcon, MusicalNoteIcon, TrashIcon, SparklesIcon, ClockIcon, LockClosedIcon, ChevronDownIcon } from './icons';
import { VNID } from '../types';
import { AccessibilityManager, A11yPreferences } from '../features/accessibility/AccessibilityManager';
import { WorkflowTracker, WorkflowStats } from '../features/analytics/WorkflowTracker';

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

interface SettingsManagerProps {
    project: VNProject;
}

const SettingsManager: React.FC<SettingsManagerProps> = ({ project }) => {
    const { dispatch } = useProject();
    const [activeSection, setActiveSection] = useState<'general' | 'ui' | 'fonts' | 'screens' | 'accessibility' | 'analytics' | 'cg-gallery'>('general');

    const updateUI = (updates: Partial<VNProjectUI>) => {
        editorDebugLog('[SettingsManager] updateUI called with:', updates);
        dispatch({ type: 'UPDATE_UI', payload: updates });
    };

    const updateProject = (updates: Partial<VNProject>) => {
        editorDebugLog('[SettingsManager] updateProject called with:', updates);
        dispatch({ type: 'UPDATE_PROJECT', payload: updates });
    };

    const sections = [
        { id: 'general' as const, name: 'General', icon: Cog6ToothIcon },
        { id: 'ui' as const, name: 'UI Assets', icon: PhotoIcon },
        { id: 'fonts' as const, name: 'Fonts', icon: BookOpenIcon },
        { id: 'screens' as const, name: 'Screens', icon: MusicalNoteIcon },
        { id: 'cg-gallery' as const, name: 'CG Gallery', icon: PhotoIcon },
        { id: 'accessibility' as const, name: 'Accessibility', icon: SparklesIcon },
        { id: 'analytics' as const, name: 'Analytics', icon: ClockIcon },
    ];

    return (
        <div className="flex h-full">
            {/* Settings Sidebar */}
            <div className="w-64 bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] flex flex-col">
                <div className="p-4 border-b border-[var(--border-subtle)]">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Cog6ToothIcon className="w-5 h-5" />
                        Settings
                    </h2>
                </div>

                <div className="flex-1 p-2 space-y-1">
                    {sections.map(section => (
                        <button
                            key={section.id}
                            onClick={() => setActiveSection(section.id)}
                            className={`w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors ${
                                activeSection === section.id
                                    ? 'bg-sky-500/20 border border-sky-500/50 text-sky-300'
                                    : 'hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                            }`}
                        >
                            <section.icon className="w-5 h-5 flex-shrink-0" />
                            <span className="font-medium">{section.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Settings Content */}
            <div className="flex-1 overflow-y-auto">
                {activeSection === 'general' && (
                    <GeneralSettings project={project} onUpdate={updateProject} onUpdateUI={updateUI} />
                )}
                {activeSection === 'ui' && (
                    <UIAssetsSettings project={project} onUpdate={updateUI} />
                )}
                {activeSection === 'fonts' && (
                    <FontSettings project={project} onUpdate={updateUI} />
                )}
                {activeSection === 'screens' && (
                    <ScreenSettings project={project} onUpdate={updateUI} />
                )}
                {activeSection === 'accessibility' && (
                    <AccessibilitySettings />
                )}
                {activeSection === 'cg-gallery' && (
                    <CGGallerySettings project={project} onUpdate={updateProject} />
                )}
                {activeSection === 'analytics' && (
                    <AnalyticsSettings />
                )}
            </div>
        </div>
    );
};

interface GeneralSettingsProps {
    project: VNProject;
    onUpdate: (updates: Partial<VNProject>) => void;
    onUpdateUI: (updates: Partial<VNProjectUI>) => void;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({ project, onUpdate, onUpdateUI }) => {
    return (
        <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-6">General Settings</h3>

            <div className="space-y-6 max-w-md">
                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Project Title</label>
                    <input
                        type="text"
                        value={project.title}
                        onChange={(e) => onUpdate({ title: e.target.value })}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        placeholder="Enter project title"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Starting Scene</label>
                    <select
                        value={project.startSceneId}
                        onChange={(e) => onUpdate({ startSceneId: e.target.value })}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        {Object.values(project.scenes || {}).map((scene: any) => (
                            <option key={scene.id} value={scene.id}>
                                {scene.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Description</label>
                    <textarea
                        value={project.description || ''}
                        onChange={(e) => onUpdate({ description: e.target.value })}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        placeholder="Enter project description"
                        rows={3}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Author</label>
                    <input
                        type="text"
                        value={project.author || ''}
                        onChange={(e) => onUpdate({ author: e.target.value })}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        placeholder="Enter author name"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Project Version</label>
                    <input
                        type="text"
                        value={project.version || ''}
                        onChange={(e) => onUpdate({ version: e.target.value })}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        placeholder="e.g. 1.0.0"
                    />
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)]">
                    <h4 className="text-lg font-semibold text-white mb-4">Game Resolution</h4>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Preset</label>
                            <select
                                value={
                                    project.gameResolution
                                        ? `${project.gameResolution.width}x${project.gameResolution.height}`
                                        : '1920x1080'
                                }
                                onChange={(e) => {
                                    const presets: Record<string, { width: number; height: number; aspectRatio: string }> = {
                                        '1920x1080': { width: 1920, height: 1080, aspectRatio: '16:9' },
                                        '1280x720': { width: 1280, height: 720, aspectRatio: '16:9' },
                                        '1024x768': { width: 1024, height: 768, aspectRatio: '4:3' },
                                        '800x600': { width: 800, height: 600, aspectRatio: '4:3' },
                                        '1080x1920': { width: 1080, height: 1920, aspectRatio: '9:16' },
                                    };
                                    const preset = presets[e.target.value];
                                    if (preset) {
                                        onUpdate({ gameResolution: preset });
                                    }
                                }}
                                className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                            >
                                <option value="1920x1080">1920 x 1080 (16:9 Full HD)</option>
                                <option value="1280x720">1280 x 720 (16:9 HD)</option>
                                <option value="1024x768">1024 x 768 (4:3)</option>
                                <option value="800x600">800 x 600 (4:3)</option>
                                <option value="1080x1920">1080 x 1920 (9:16 Portrait)</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Width</label>
                                <input
                                    type="number"
                                    value={project.gameResolution?.width || 1920}
                                    onChange={(e) => {
                                        const width = parseInt(e.target.value) || 1920;
                                        const height = project.gameResolution?.height || 1080;
                                        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
                                        const d = gcd(width, height);
                                        onUpdate({
                                            gameResolution: {
                                                width,
                                                height,
                                                aspectRatio: `${width / d}:${height / d}`
                                            }
                                        });
                                    }}
                                    className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)] text-sm"
                                    min="320"
                                    max="3840"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Height</label>
                                <input
                                    type="number"
                                    value={project.gameResolution?.height || 1080}
                                    onChange={(e) => {
                                        const height = parseInt(e.target.value) || 1080;
                                        const width = project.gameResolution?.width || 1920;
                                        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
                                        const d = gcd(width, height);
                                        onUpdate({
                                            gameResolution: {
                                                width,
                                                height,
                                                aspectRatio: `${width / d}:${height / d}`
                                            }
                                        });
                                    }}
                                    className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)] text-sm"
                                    min="240"
                                    max="2160"
                                />
                            </div>
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">
                            Aspect Ratio: {project.gameResolution?.aspectRatio || '16:9'}
                        </div>
                    </div>
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)]">
                    <h4 className="text-lg font-semibold text-white mb-4">Default Game Settings</h4>
                    <p className="text-xs text-[var(--text-secondary)] mb-4">These values are used as the initial settings when a player starts your game.</p>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Text Speed: {project.ui?.defaultGameSettings?.textSpeed ?? 50}</label>
                            <input
                                type="range"
                                min="1"
                                max="100"
                                value={project.ui?.defaultGameSettings?.textSpeed ?? 50}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    onUpdateUI({ defaultGameSettings: { ...project.ui?.defaultGameSettings, textSpeed: val, musicVolume: project.ui?.defaultGameSettings?.musicVolume ?? 0.8, sfxVolume: project.ui?.defaultGameSettings?.sfxVolume ?? 0.8, ambientVolume: project.ui?.defaultGameSettings?.ambientVolume ?? 0.8, enableSkip: project.ui?.defaultGameSettings?.enableSkip ?? true, autoAdvance: project.ui?.defaultGameSettings?.autoAdvance ?? false, autoAdvanceDelay: project.ui?.defaultGameSettings?.autoAdvanceDelay ?? 3 } });
                                }}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Music Volume: {Math.round((project.ui?.defaultGameSettings?.musicVolume ?? 0.8) * 100)}%</label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={Math.round((project.ui?.defaultGameSettings?.musicVolume ?? 0.8) * 100)}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value) / 100;
                                    onUpdateUI({ defaultGameSettings: { ...project.ui?.defaultGameSettings, textSpeed: project.ui?.defaultGameSettings?.textSpeed ?? 50, musicVolume: val, sfxVolume: project.ui?.defaultGameSettings?.sfxVolume ?? 0.8, ambientVolume: project.ui?.defaultGameSettings?.ambientVolume ?? 0.8, enableSkip: project.ui?.defaultGameSettings?.enableSkip ?? true, autoAdvance: project.ui?.defaultGameSettings?.autoAdvance ?? false, autoAdvanceDelay: project.ui?.defaultGameSettings?.autoAdvanceDelay ?? 3 } });
                                }}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">SFX Volume: {Math.round((project.ui?.defaultGameSettings?.sfxVolume ?? 0.8) * 100)}%</label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={Math.round((project.ui?.defaultGameSettings?.sfxVolume ?? 0.8) * 100)}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value) / 100;
                                    onUpdateUI({ defaultGameSettings: { ...project.ui?.defaultGameSettings, textSpeed: project.ui?.defaultGameSettings?.textSpeed ?? 50, musicVolume: project.ui?.defaultGameSettings?.musicVolume ?? 0.8, sfxVolume: val, ambientVolume: project.ui?.defaultGameSettings?.ambientVolume ?? 0.8, enableSkip: project.ui?.defaultGameSettings?.enableSkip ?? true, autoAdvance: project.ui?.defaultGameSettings?.autoAdvance ?? false, autoAdvanceDelay: project.ui?.defaultGameSettings?.autoAdvanceDelay ?? 3 } });
                                }}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Ambient Volume: {Math.round((project.ui?.defaultGameSettings?.ambientVolume ?? 0.8) * 100)}%</label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={Math.round((project.ui?.defaultGameSettings?.ambientVolume ?? 0.8) * 100)}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value) / 100;
                                    onUpdateUI({ defaultGameSettings: { ...project.ui?.defaultGameSettings, textSpeed: project.ui?.defaultGameSettings?.textSpeed ?? 50, musicVolume: project.ui?.defaultGameSettings?.musicVolume ?? 0.8, sfxVolume: project.ui?.defaultGameSettings?.sfxVolume ?? 0.8, ambientVolume: val, enableSkip: project.ui?.defaultGameSettings?.enableSkip ?? true, autoAdvance: project.ui?.defaultGameSettings?.autoAdvance ?? false, autoAdvanceDelay: project.ui?.defaultGameSettings?.autoAdvanceDelay ?? 3 } });
                                }}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Auto-Advance Delay: {project.ui?.defaultGameSettings?.autoAdvanceDelay ?? 3}s</label>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                step="0.5"
                                value={project.ui?.defaultGameSettings?.autoAdvanceDelay ?? 3}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    onUpdateUI({ defaultGameSettings: { ...project.ui?.defaultGameSettings, textSpeed: project.ui?.defaultGameSettings?.textSpeed ?? 50, musicVolume: project.ui?.defaultGameSettings?.musicVolume ?? 0.8, sfxVolume: project.ui?.defaultGameSettings?.sfxVolume ?? 0.8, ambientVolume: project.ui?.defaultGameSettings?.ambientVolume ?? 0.8, enableSkip: project.ui?.defaultGameSettings?.enableSkip ?? true, autoAdvance: project.ui?.defaultGameSettings?.autoAdvance ?? false, autoAdvanceDelay: val } });
                                }}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-[var(--text-primary)]">Enable Skip</label>
                            <button
                                onClick={() => {
                                    const current = project.ui?.defaultGameSettings?.enableSkip ?? true;
                                    onUpdateUI({ defaultGameSettings: { ...project.ui?.defaultGameSettings, textSpeed: project.ui?.defaultGameSettings?.textSpeed ?? 50, musicVolume: project.ui?.defaultGameSettings?.musicVolume ?? 0.8, sfxVolume: project.ui?.defaultGameSettings?.sfxVolume ?? 0.8, ambientVolume: project.ui?.defaultGameSettings?.ambientVolume ?? 0.8, enableSkip: !current, autoAdvance: project.ui?.defaultGameSettings?.autoAdvance ?? false, autoAdvanceDelay: project.ui?.defaultGameSettings?.autoAdvanceDelay ?? 3 } });
                                }}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                    (project.ui?.defaultGameSettings?.enableSkip ?? true) ? 'bg-sky-500' : 'bg-[var(--bg-tertiary)]'
                                }`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    (project.ui?.defaultGameSettings?.enableSkip ?? true) ? 'translate-x-6' : 'translate-x-1'
                                }`} />
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-[var(--text-primary)]">Auto-Advance</label>
                            <button
                                onClick={() => {
                                    const current = project.ui?.defaultGameSettings?.autoAdvance ?? false;
                                    onUpdateUI({ defaultGameSettings: { ...project.ui?.defaultGameSettings, textSpeed: project.ui?.defaultGameSettings?.textSpeed ?? 50, musicVolume: project.ui?.defaultGameSettings?.musicVolume ?? 0.8, sfxVolume: project.ui?.defaultGameSettings?.sfxVolume ?? 0.8, ambientVolume: project.ui?.defaultGameSettings?.ambientVolume ?? 0.8, enableSkip: project.ui?.defaultGameSettings?.enableSkip ?? true, autoAdvance: !current, autoAdvanceDelay: project.ui?.defaultGameSettings?.autoAdvanceDelay ?? 3 } });
                                }}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                    (project.ui?.defaultGameSettings?.autoAdvance ?? false) ? 'bg-sky-500' : 'bg-[var(--bg-tertiary)]'
                                }`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    (project.ui?.defaultGameSettings?.autoAdvance ?? false) ? 'translate-x-6' : 'translate-x-1'
                                }`} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t border-[var(--border-subtle)]">
                    <div>
                        <span className="text-[var(--text-secondary)]">Project ID:</span>
                        <span className="text-white ml-2 font-mono text-xs">{project.id}</span>
                    </div>
                    <div>
                        <span className="text-[var(--text-secondary)]">Scenes:</span>
                        <span className="text-white ml-2">{Object.keys(project.scenes || {}).length}</span>
                    </div>
                    <div>
                        <span className="text-[var(--text-secondary)]">Characters:</span>
                        <span className="text-white ml-2">{Object.keys(project.characters || {}).length}</span>
                    </div>
                    <div>
                        <span className="text-[var(--text-secondary)]">Variables:</span>
                        <span className="text-white ml-2">{Object.keys(project.variables || {}).length}</span>
                    </div>
                    <div>
                        <span className="text-[var(--text-secondary)]">Engine Version:</span>
                        <span className="text-white ml-2 font-mono text-xs">{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface UIAssetsSettingsProps {
    project: VNProject;
    onUpdate: (updates: Partial<VNProjectUI>) => void;
}

const UIAssetsSettings: React.FC<UIAssetsSettingsProps> = ({ project, onUpdate }) => {
    const allImages = Object.values(project.images || {}) as any[];
    const allVideos = Object.values(project.videos || {}) as any[];

    editorDebugLog('[UIAssetsSettings] Rendering with images:', allImages.length, allImages.map(i => i.name));

    const getAssetName = (assetId: string | null, type: 'image' | 'video') => {
        if (!assetId) return 'None';
        const assets = type === 'image' ? allImages : Object.values(project.videos || {});
        const asset = assets.find(a => a.id === assetId);
        return asset ? asset.name : 'Unknown';
    };

    const [showResetConfirm, setShowResetConfirm] = useState(false);

    const handleResetToDefaults = () => {
        onUpdate({
            dialogueBoxImage: null,
            dialogueBoxBorderImage: null,
            dialogueBorderPadding: 12,
            dialogueBoxWidth: 100,
            dialogueBoxHeight: 0,
            dialogueBoxBottomMargin: 20,
            dialogueBoxPadding: 20,
            choiceButtonImage: null,
            choiceButtonBorderImage: null,
            choiceBorderPadding: 8,
            choiceButtonWidth: 0,
            choiceButtonHeight: 0,
            choiceButtonPadding: 16,
            inputBoxImage: null,
            inputBoxBorderImage: null,
            inputBorderPadding: 8,
            inputBoxWidth: 0,
            inputBoxPadding: 24,
            inputPromptFont: { family: 'Poppins, sans-serif', size: 18, color: '#FFFFFF', weight: 'normal', italic: false },
            inputFieldFont: { family: 'Poppins, sans-serif', size: 16, color: '#FFFFFF', weight: 'normal', italic: false },
            inputSubmitFont: { family: 'Poppins, sans-serif', size: 16, color: '#FFFFFF', weight: 'normal', italic: false },
            dialogueNameFont: { family: 'Poppins, sans-serif', size: 22, color: '#FFFFFF', weight: 'bold', italic: false },
            dialogueTextFont: { family: 'Poppins, sans-serif', size: 20, color: '#FFFFFF', weight: 'normal', italic: false },
            choiceTextFont: { family: 'Poppins, sans-serif', size: 18, color: '#FFFFFF', weight: 'normal', italic: false },
        });
        setShowResetConfirm(false);
    };

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">UI Assets</h3>
                {!showResetConfirm ? (
                    <button
                        onClick={() => setShowResetConfirm(true)}
                        className="px-3 py-1.5 text-xs rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-amber-400 hover:border-amber-500/50 transition-colors"
                        title="Reset all dialogue and choice styling to defaults"
                    >
                        Reset to Defaults
                    </button>
                ) : (
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-400">Reset all UI assets &amp; fonts?</span>
                        <button
                            onClick={handleResetToDefaults}
                            className="px-2 py-1 text-xs rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
                        >
                            Confirm
                        </button>
                        <button
                            onClick={() => setShowResetConfirm(false)}
                            className="px-2 py-1 text-xs rounded bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                )}
            </div>

            <div className="space-y-6 max-w-md">
                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Dialogue Box Image</label>
                    <select
                        value={project.ui.dialogueBoxImage?.id || ''}
                        onChange={(e) => {
                            const assetId = e.target.value;
                            editorDebugLog('[UIAssetsSettings] Dialogue box selection changed:', assetId);
                            editorDebugLog('[UIAssetsSettings] Available images:', allImages.map(i => ({ id: i.id, name: i.name })));
                            const asset = assetId ? allImages.find(img => img.id === assetId) : null;
                            editorDebugLog('[UIAssetsSettings] Found asset:', asset);
                            onUpdate({
                                dialogueBoxImage: asset ? { type: 'image', id: asset.id } : null
                            });
                        }}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="">None</option>
                        {allImages.map(image => (
                            <option key={image.id} value={image.id}>
                                {image.name}
                            </option>
                        ))}
                    </select>
                    {project.ui.dialogueBoxImage?.id && (() => {
                        const img = allImages.find(i => i.id === project.ui.dialogueBoxImage?.id);
                        const url = img?.imageUrl;
                        return url ? (
                            <div className="mt-2 rounded-md overflow-hidden border border-[var(--border-default)]" style={{ maxHeight: '80px' }}>
                                <img src={url} alt="Dialogue box preview" className="w-full h-full object-contain" style={{ maxHeight: '80px' }} />
                            </div>
                        ) : (
                            <p className="mt-1 text-xs text-amber-400">⚠ Selected image not found in project assets</p>
                        );
                    })()}
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Dialogue Box Border Image</label>
                    <select
                        value={project.ui.dialogueBoxBorderImage?.id || ''}
                        onChange={(e) => {
                            const assetId = e.target.value;
                            const asset = assetId ? allImages.find(img => img.id === assetId) : null;
                            onUpdate({
                                dialogueBoxBorderImage: asset ? { type: 'image', id: asset.id } : null
                            });
                        }}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="">None</option>
                        {allImages.map(image => (
                            <option key={image.id} value={image.id}>
                                {image.name}
                            </option>
                        ))}
                    </select>
                    {project.ui.dialogueBoxBorderImage?.id && (() => {
                        const img = allImages.find(i => i.id === project.ui.dialogueBoxBorderImage?.id);
                        const url = img?.imageUrl;
                        return url ? (
                            <div className="mt-2 rounded-md overflow-hidden border border-[var(--border-default)]" style={{ maxHeight: '80px' }}>
                                <img src={url} alt="Dialogue border preview" className="w-full h-full object-contain" style={{ maxHeight: '80px' }} />
                            </div>
                        ) : (
                            <p className="mt-1 text-xs text-amber-400">⚠ Selected image not found in project assets</p>
                        );
                    })()}
                </div>

                {(project.ui.dialogueBoxImage || project.ui.dialogueBoxBorderImage) && (
                    <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Dialogue Border Thickness ({project.ui.dialogueBorderPadding ?? 12}px)</label>
                        <input
                            type="range"
                            min="0"
                            max="40"
                            value={project.ui.dialogueBorderPadding ?? 12}
                            onChange={(e) => onUpdate({ dialogueBorderPadding: parseInt(e.target.value) })}
                            className="w-full accent-[var(--accent-lavender)]"
                        />
                    </div>
                )}

                <div className="border-t border-[var(--border-subtle)] pt-4">
                    <h4 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Dialogue Box Dimensions</h4>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Width ({project.ui.dialogueBoxWidth ?? 100}%)</label>
                            <input
                                type="range"
                                min="30"
                                max="100"
                                value={project.ui.dialogueBoxWidth ?? 100}
                                onChange={(e) => onUpdate({ dialogueBoxWidth: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Height (px, 0 = auto)</label>
                            <input
                                type="number"
                                min="0"
                                max="600"
                                value={project.ui.dialogueBoxHeight ?? 0}
                                onChange={(e) => onUpdate({ dialogueBoxHeight: Math.max(0, parseInt(e.target.value) || 0) })}
                                className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                                placeholder="0 = auto"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Bottom Margin ({project.ui.dialogueBoxBottomMargin ?? 20}px)</label>
                            <input
                                type="range"
                                min="0"
                                max="200"
                                value={project.ui.dialogueBoxBottomMargin ?? 20}
                                onChange={(e) => onUpdate({ dialogueBoxBottomMargin: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Inner Padding ({project.ui.dialogueBoxPadding ?? 20}px)</label>
                            <input
                                type="range"
                                min="0"
                                max="60"
                                value={project.ui.dialogueBoxPadding ?? 20}
                                onChange={(e) => onUpdate({ dialogueBoxPadding: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Choice Button Image</label>
                    <select
                        value={project.ui.choiceButtonImage?.id || ''}
                        onChange={(e) => {
                            const assetId = e.target.value;
                            const asset = assetId ? allImages.find(img => img.id === assetId) : null;
                            onUpdate({
                                choiceButtonImage: asset ? { type: 'image', id: asset.id } : null
                            });
                        }}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="">None</option>
                        {allImages.map(image => (
                            <option key={image.id} value={image.id}>
                                {image.name}
                            </option>
                        ))}
                    </select>
                    {project.ui.choiceButtonImage?.id && (() => {
                        const img = allImages.find(i => i.id === project.ui.choiceButtonImage?.id);
                        const url = img?.imageUrl;
                        return url ? (
                            <div className="mt-2 rounded-md overflow-hidden border border-[var(--border-default)]" style={{ maxHeight: '60px' }}>
                                <img src={url} alt="Choice button preview" className="w-full h-full object-contain" style={{ maxHeight: '60px' }} />
                            </div>
                        ) : (
                            <p className="mt-1 text-xs text-amber-400">⚠ Selected image not found in project assets</p>
                        );
                    })()}
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Choice Button Border Image</label>
                    <select
                        value={project.ui.choiceButtonBorderImage?.id || ''}
                        onChange={(e) => {
                            const assetId = e.target.value;
                            const asset = assetId ? allImages.find(img => img.id === assetId) : null;
                            onUpdate({
                                choiceButtonBorderImage: asset ? { type: 'image', id: asset.id } : null
                            });
                        }}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="">None</option>
                        {allImages.map(image => (
                            <option key={image.id} value={image.id}>
                                {image.name}
                            </option>
                        ))}
                    </select>
                    {project.ui.choiceButtonBorderImage?.id && (() => {
                        const img = allImages.find(i => i.id === project.ui.choiceButtonBorderImage?.id);
                        const url = img?.imageUrl;
                        return url ? (
                            <div className="mt-2 rounded-md overflow-hidden border border-[var(--border-default)]" style={{ maxHeight: '60px' }}>
                                <img src={url} alt="Choice border preview" className="w-full h-full object-contain" style={{ maxHeight: '60px' }} />
                            </div>
                        ) : (
                            <p className="mt-1 text-xs text-amber-400">⚠ Selected image not found in project assets</p>
                        );
                    })()}
                </div>

                {(project.ui.choiceButtonImage || project.ui.choiceButtonBorderImage) && (
                    <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Choice Border Thickness ({project.ui.choiceBorderPadding ?? 8}px)</label>
                        <input
                            type="range"
                            min="0"
                            max="30"
                            value={project.ui.choiceBorderPadding ?? 8}
                            onChange={(e) => onUpdate({ choiceBorderPadding: parseInt(e.target.value) })}
                            className="w-full accent-[var(--accent-lavender)]"
                        />
                    </div>
                )}

                <div className="border-t border-[var(--border-subtle)] pt-4">
                    <h4 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Choice Button Dimensions</h4>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Width (px, 0 = auto)</label>
                            <input
                                type="number"
                                min="0"
                                max="1200"
                                value={project.ui.choiceButtonWidth ?? 0}
                                onChange={(e) => onUpdate({ choiceButtonWidth: Math.max(0, parseInt(e.target.value) || 0) })}
                                className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                                placeholder="0 = auto"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Height (px, 0 = auto)</label>
                            <input
                                type="number"
                                min="0"
                                max="400"
                                value={project.ui.choiceButtonHeight ?? 0}
                                onChange={(e) => onUpdate({ choiceButtonHeight: Math.max(0, parseInt(e.target.value) || 0) })}
                                className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                                placeholder="0 = auto"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Inner Padding ({project.ui.choiceButtonPadding ?? 16}px)</label>
                            <input
                                type="range"
                                min="0"
                                max="60"
                                value={project.ui.choiceButtonPadding ?? 16}
                                onChange={(e) => onUpdate({ choiceButtonPadding: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                    </div>
                </div>

                {/* ─── Text Input Box Customization ─── */}
                <div className="border-t border-[var(--border-subtle)] pt-4">
                    <h4 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Text Input Box</h4>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Input Box Image</label>
                            <select
                                value={project.ui.inputBoxImage?.id || ''}
                                onChange={(e) => {
                                    const assetId = e.target.value;
                                    const asset = assetId ? allImages.find(img => img.id === assetId) : null;
                                    onUpdate({
                                        inputBoxImage: asset ? { type: 'image', id: asset.id } : null
                                    });
                                }}
                                className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                            >
                                <option value="">None (glass-morphism default)</option>
                                {allImages.map(image => (
                                    <option key={image.id} value={image.id}>
                                        {image.name}
                                    </option>
                                ))}
                            </select>
                            {project.ui.inputBoxImage?.id && (() => {
                                const img = allImages.find(i => i.id === project.ui.inputBoxImage?.id);
                                const url = img?.imageUrl;
                                return url ? (
                                    <div className="mt-2 rounded-md overflow-hidden border border-[var(--border-default)]" style={{ maxHeight: '60px' }}>
                                        <img src={url} alt="Input box preview" className="w-full h-full object-contain" style={{ maxHeight: '60px' }} />
                                    </div>
                                ) : (
                                    <p className="mt-1 text-xs text-amber-400">Selected image not found in project assets</p>
                                );
                            })()}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Input Box Border Image</label>
                            <select
                                value={project.ui.inputBoxBorderImage?.id || ''}
                                onChange={(e) => {
                                    const assetId = e.target.value;
                                    const asset = assetId ? allImages.find(img => img.id === assetId) : null;
                                    onUpdate({
                                        inputBoxBorderImage: asset ? { type: 'image', id: asset.id } : null
                                    });
                                }}
                                className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                            >
                                <option value="">None</option>
                                {allImages.map(image => (
                                    <option key={image.id} value={image.id}>
                                        {image.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {(project.ui.inputBoxImage || project.ui.inputBoxBorderImage) && (
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Input Border Thickness ({project.ui.inputBorderPadding ?? 8}px)</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="30"
                                    value={project.ui.inputBorderPadding ?? 8}
                                    onChange={(e) => onUpdate({ inputBorderPadding: parseInt(e.target.value) })}
                                    className="w-full accent-[var(--accent-lavender)]"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Width (px, 0 = auto)</label>
                            <input
                                type="number"
                                min="0"
                                max="1200"
                                value={project.ui.inputBoxWidth ?? 0}
                                onChange={(e) => onUpdate({ inputBoxWidth: Math.max(0, parseInt(e.target.value) || 0) })}
                                className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                                placeholder="0 = auto (max-w-md)"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Inner Padding ({project.ui.inputBoxPadding ?? 24}px)</label>
                            <input
                                type="range"
                                min="0"
                                max="60"
                                value={project.ui.inputBoxPadding ?? 24}
                                onChange={(e) => onUpdate({ inputBoxPadding: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface FontSettingsProps {
    project: VNProject;
    onUpdate: (updates: Partial<VNProjectUI>) => void;
}

const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

const FontSettings: React.FC<FontSettingsProps> = ({ project, onUpdate }) => {
    const { dispatch } = useProject();
    
    const projectFontsArray = Object.values((project as any).fonts || {}) as VNProjectFont[];
    
    // Popular fonts list for the dropdowns
    const popularFonts = [
        'Poppins, sans-serif',
        'Arial, sans-serif',
        'Helvetica, sans-serif',
        'Verdana, sans-serif',
        'Times New Roman, serif',
        'Georgia, serif',
        'Courier New, monospace',
        'Pacifico, cursive',
        'Lato, sans-serif',
        'Merriweather, serif',
        'Oswald, sans-serif',
        'Playfair Display, serif',
        'Roboto, sans-serif',
        'Caveat, cursive',
    ];
    
    // Build font options including project fonts
    const getFontOptions = (currentFamily: string) => {
        const options = [...popularFonts];
        // Add project fonts at the top
        for (const f of projectFontsArray) {
            if (f?.fontFamily && !options.includes(f.fontFamily)) {
                options.unshift(f.fontFamily);
            }
        }
        // Ensure current value is in list
        if (currentFamily && !options.includes(currentFamily)) {
            options.unshift(currentFamily);
        }
        return options;
    };
    
    const updateFont = (fontKey: keyof VNProjectUI, updates: Partial<VNFontSettings>) => {
        const currentFont = (project.ui[fontKey] as VNFontSettings) ?? { family: 'Poppins, sans-serif', size: 16, color: '#FFFFFF', weight: 'normal' as const, italic: false };
        onUpdate({ [fontKey]: { ...currentFont, ...updates } });
    };
    
    const addProjectFont = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.ttf,.otf,font/ttf,font/otf';
        input.onchange = async (e: any) => {
            const file: File | undefined = e.target?.files?.[0];
            if (!file) return;

            const baseName = file.name.replace(/\.(ttf|otf)$/i, '').trim() || 'Custom Font';
            const dataUrl = await fileToBase64(file);

            const newId = `font-${Math.random().toString(36).substring(2, 9)}` as VNID;
            const existingFamilies = new Set(
                Object.values((project as any).fonts || {}).map((f: any) => (f?.fontFamily || '').toLowerCase())
            );
            let fontFamily = baseName;
            if (existingFamilies.has(fontFamily.toLowerCase())) {
                fontFamily = `${baseName} (${newId})`;
            }

            const newFont: VNProjectFont = {
                id: newId,
                name: baseName,
                fontFamily,
                fontUrl: dataUrl,
                fileName: file.name,
            };

            dispatch({
                type: 'UPDATE_PROJECT',
                payload: {
                    fonts: {
                        ...((project as any).fonts || {}),
                        [newId]: newFont,
                    },
                } as any,
            });
            
            // Load the font into the document immediately
            try {
                const fontFace = new FontFace(fontFamily, `url(${dataUrl})`);
                await fontFace.load();
                (document as any).fonts.add(fontFace);
            } catch (err) {
                console.error('Failed to load uploaded font:', err);
            }
        };
        input.click();
    };
    
    const deleteProjectFont = (fontId: VNID) => {
        const fontsById = { ...((project as any).fonts || {}) } as Record<VNID, VNProjectFont>;
        delete fontsById[fontId];
        dispatch({ type: 'UPDATE_PROJECT', payload: { fonts: fontsById } as any });
    };

    const FontEditor = ({ label, fontKey }: { label: string; fontKey: keyof VNProjectUI }) => {
        const font = (project.ui[fontKey] as VNFontSettings) ?? { family: 'Poppins, sans-serif', size: 16, color: '#FFFFFF', weight: 'normal' as const, italic: false };
        const fontOptions = getFontOptions(font.family);

        return (
            <div className="border border-[var(--border-subtle)] rounded-lg p-4">
                <h4 className="text-lg font-semibold text-white mb-4">{label}</h4>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Family</label>
                        <select
                            value={font.family}
                            onChange={(e) => updateFont(fontKey, { family: e.target.value })}
                            className="w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        >
                            {fontOptions.map(f => (
                                <option key={f} value={f}>{f.split(',')[0]}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Size</label>
                        <input
                            type="number"
                            value={font.size}
                            onChange={(e) => updateFont(fontKey, { size: parseInt(e.target.value) })}
                            className="w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Color</label>
                        <input
                            type="color"
                            value={font.color}
                            onChange={(e) => updateFont(fontKey, { color: e.target.value })}
                            className="w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Weight</label>
                        <select
                            value={font.weight}
                            onChange={(e) => updateFont(fontKey, { weight: e.target.value as 'normal' | 'bold' })}
                            className="w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        >
                            <option value="normal">Normal</option>
                            <option value="bold">Bold</option>
                        </select>
                    </div>

                    <div className="col-span-2">
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={font.italic}
                                onChange={(e) => updateFont(fontKey, { italic: e.target.checked })}
                                className="rounded border-[var(--border-default)] text-sky-500 focus:ring-[var(--accent-lavender)]"
                            />
                            <span className="text-sm font-medium text-[var(--text-primary)]">Italic</span>
                        </label>
                    </div>

                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Alignment</label>
                        <div className="flex gap-1">
                            {(['left', 'center', 'right'] as const).map(a => (
                                <button
                                    key={a}
                                    onClick={() => updateFont(fontKey, { align: a })}
                                    className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${
                                        (font.align || 'left') === a
                                            ? 'bg-sky-500 text-white'
                                            : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                                    }`}
                                >
                                    {a === 'left' ? '← Left' : a === 'center' ? '↔ Center' : 'Right →'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-4 p-3 bg-[var(--bg-primary)] rounded border border-[var(--border-default)]">
                    <p
                        className="text-sm"
                        style={{
                            fontFamily: font.family,
                            fontSize: `${font.size}px`,
                            color: font.color,
                            fontWeight: font.weight,
                            fontStyle: font.italic ? 'italic' : 'normal',
                            textAlign: font.align || 'left',
                        }}
                    >
                        Sample text with current font settings
                    </p>
                </div>
            </div>
        );
    };

    return (
        <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-6">Font Settings</h3>

            {/* Project Font Library */}
            <div className="border border-[var(--border-subtle)] rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold text-white">Project Font Library (TTF/OTF)</h4>
                    <button
                        onClick={addProjectFont}
                        className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded font-medium transition-colors"
                    >
                        Upload Font
                    </button>
                </div>
                
                {projectFontsArray.length === 0 ? (
                    <div className="text-[var(--text-secondary)] text-sm bg-[var(--bg-primary)]/50 p-4 rounded">
                        No custom fonts uploaded yet. Upload a .ttf or .otf file to make it available in all font pickers throughout your project.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {projectFontsArray.map((f) => (
                            <div key={f.id} className="flex items-center justify-between bg-[var(--bg-primary)]/50 border border-[var(--border-default)] rounded p-3">
                                <div className="min-w-0 flex-1">
                                    <div className="text-white font-medium" style={{ fontFamily: f.fontFamily }}>
                                        {f.name}
                                    </div>
                                    <div className="text-xs text-[var(--text-secondary)]">{f.fontFamily}</div>
                                </div>
                                <button
                                    onClick={() => deleteProjectFont(f.id)}
                                    className="ml-4 text-red-400 hover:text-red-300 p-2 hover:bg-red-900/30 rounded transition-colors"
                                    title="Delete font"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="space-y-6">
                <FontEditor label="Dialogue Name Font" fontKey="dialogueNameFont" />
                <FontEditor label="Dialogue Text Font" fontKey="dialogueTextFont" />
                <FontEditor label="Choice Text Font" fontKey="choiceTextFont" />
                <FontEditor label="Input Prompt Font" fontKey="inputPromptFont" />
                <FontEditor label="Input Field Font" fontKey="inputFieldFont" />
                <FontEditor label="Input Submit Button Font" fontKey="inputSubmitFont" />
            </div>
        </div>
    );
};

interface ScreenSettingsProps {
    project: VNProject;
    onUpdate: (updates: Partial<VNProjectUI>) => void;
}

const ScreenSettings: React.FC<ScreenSettingsProps> = ({ project, onUpdate }) => {
    const allScreens = Object.values(project.uiScreens || {}) as any[];

    const getScreenName = (screenId: string | null) => {
        if (!screenId) return 'None';
        const screen = allScreens.find(s => s.id === screenId);
        return screen ? screen.name : 'Unknown';
    };

    return (
        <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-6">Special Screens</h3>

            <div className="space-y-6 max-w-md">
                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Title Screen</label>
                    <select
                        value={project.ui.titleScreenId || ''}
                        onChange={(e) => onUpdate({ titleScreenId: e.target.value || null })}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="">None</option>
                        {allScreens.map(screen => (
                            <option key={screen.id} value={screen.id}>
                                {screen.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Settings Screen</label>
                    <select
                        value={project.ui.settingsScreenId || ''}
                        onChange={(e) => onUpdate({ settingsScreenId: e.target.value || null })}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="">None</option>
                        {allScreens.map(screen => (
                            <option key={screen.id} value={screen.id}>
                                {screen.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Save Screen</label>
                    <select
                        value={project.ui.saveScreenId || ''}
                        onChange={(e) => onUpdate({ saveScreenId: e.target.value || null })}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="">None</option>
                        {allScreens.map(screen => (
                            <option key={screen.id} value={screen.id}>
                                {screen.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Load Screen</label>
                    <select
                        value={project.ui.loadScreenId || ''}
                        onChange={(e) => onUpdate({ loadScreenId: e.target.value || null })}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="">None</option>
                        {allScreens.map(screen => (
                            <option key={screen.id} value={screen.id}>
                                {screen.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Pause Screen</label>
                    <select
                        value={project.ui.pauseScreenId || ''}
                        onChange={(e) => onUpdate({ pauseScreenId: e.target.value || null })}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="">None</option>
                        {allScreens.map(screen => (
                            <option key={screen.id} value={screen.id}>
                                {screen.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Game HUD Screen</label>
                    <select
                        value={project.ui.gameHudScreenId || ''}
                        onChange={(e) => onUpdate({ gameHudScreenId: e.target.value || null })}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="">None</option>
                        {allScreens.map(screen => (
                            <option key={screen.id} value={screen.id}>
                                {screen.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
};

interface CGGallerySettingsProps {
    project: VNProject;
    onUpdate: (updates: Partial<VNProject>) => void;
}

const CGGallerySettings: React.FC<CGGallerySettingsProps> = ({ project, onUpdate }) => {
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

    const gallery: CGGalleryConfig = project.cgGallery ?? {
        entries: {},
        unlockScope: 'global',
        columns: 4,
    };

    const updateGallery = (updates: Partial<CGGalleryConfig>) => {
        onUpdate({ cgGallery: { ...gallery, ...updates } });
    };

    const entries = Object.values(gallery.entries).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const addEntry = () => {
        const id = `cg-${Math.random().toString(36).substring(2, 9)}` as VNID;
        const newEntry: CGGalleryEntry = {
            id,
            name: `CG ${entries.length + 1}`,
            assetId: null,
            unlockable: false,
            order: entries.length,
        };
        updateGallery({ entries: { ...gallery.entries, [id]: newEntry } });
        setEditingEntryId(id);
    };

    const updateEntry = (id: VNID, updates: Partial<CGGalleryEntry>) => {
        const existing = gallery.entries[id];
        if (!existing) return;
        updateGallery({ entries: { ...gallery.entries, [id]: { ...existing, ...updates } } });
    };

    const removeEntry = (id: VNID) => {
        const { [id]: _removed, ...rest } = gallery.entries;
        updateGallery({ entries: rest });
        if (editingEntryId === id) setEditingEntryId(null);
    };

    const allImages = Object.values(project.images || {}) as { id: string; name: string; imageUrl?: string; videoUrl?: string }[];
    const allBackgrounds = Object.values(project.backgrounds || {}) as { id: string; name: string; imageUrl?: string; videoUrl?: string }[];
    const allAssets = [
        ...allImages.map((img) => ({ id: img.id, name: img.name, type: 'Image' })),
        ...allBackgrounds.map((bg) => ({ id: bg.id, name: bg.name, type: 'Background' })),
    ];

    const booleanVariables = Object.values(project.variables || {}).filter((v: any) => v.type === 'boolean') as { id: string; name: string; type: string }[];

    return (
        <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-2">CG Gallery</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
                Manage the CG (Computer Graphics) gallery entries that players can unlock and view. Add images from your project assets and optionally tie them to boolean variables to create unlockable gallery items.
            </p>

            {/* Gallery-Level Settings */}
            <div className="space-y-4 max-w-lg mb-8">
                <h4 className="text-sm font-semibold text-sky-400 uppercase tracking-wider">Gallery Settings</h4>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Columns</label>
                        <input
                            type="number"
                            min={2}
                            max={8}
                            value={gallery.columns}
                            onChange={(e) => updateGallery({ columns: parseInt(e.target.value, 10) || 4 })}
                            className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Unlock Scope</label>
                        <select
                            value={gallery.unlockScope}
                            onChange={(e) => updateGallery({ unlockScope: e.target.value as 'global' | 'per-save' })}
                            className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        >
                            <option value="global">Global (all saves)</option>
                            <option value="per-save">Per Save Slot</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Locked Placeholder Image</label>
                    <select
                        value={gallery.lockedPlaceholderAssetId ?? ''}
                        onChange={(e) => updateGallery({ lockedPlaceholderAssetId: (e.target.value || null) as VNID | null })}
                        className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="">Default (lock icon)</option>
                        {allAssets.map((a) => (
                            <option key={a.id} value={a.id}>[{a.type}] {a.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Viewer Background Color</label>
                    <div className="flex gap-2 items-center">
                        <input
                            type="color"
                            value={gallery.viewerBackgroundColor || '#000000'}
                            onChange={(e) => updateGallery({ viewerBackgroundColor: e.target.value })}
                            className="h-9 w-12 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded cursor-pointer"
                        />
                        <input
                            type="text"
                            value={gallery.viewerBackgroundColor || '#000000'}
                            onChange={(e) => updateGallery({ viewerBackgroundColor: e.target.value })}
                            className="flex-1 bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)] text-sm font-mono"
                            placeholder="#000000"
                        />
                    </div>
                </div>
            </div>

            {/* Entries Section */}
            <div className="mb-4 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-sky-400 uppercase tracking-wider">Gallery Entries ({entries.length})</h4>
                <button
                    onClick={addEntry}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-md transition-colors"
                >
                    + Add Entry
                </button>
            </div>

            {entries.length === 0 ? (
                <div className="text-center py-12 bg-[var(--bg-primary)]/50 rounded-lg border border-[var(--border-subtle)] border-dashed">
                    <p className="text-[var(--text-secondary)] mb-2">No gallery entries yet</p>
                    <p className="text-xs text-[var(--text-muted)]">Click "Add Entry" to create your first CG gallery item</p>
                </div>
            ) : (
                <div className="space-y-2 max-w-2xl">
                    {entries.map((entry) => {
                        const isEditing = editingEntryId === entry.id;
                        const assetInfo = allAssets.find((a) => a.id === entry.assetId);

                        return (
                            <div
                                key={entry.id}
                                className={`bg-[var(--bg-primary)] rounded-md border ${isEditing ? 'border-sky-500' : 'border-[var(--border-subtle)]'} overflow-hidden`}
                            >
                                {/* Entry Header (collapsed) */}
                                <div
                                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-750"
                                    onClick={() => setEditingEntryId(isEditing ? null : entry.id)}
                                >
                                    <span className="text-[var(--text-muted)] text-xs font-mono w-6 text-center">{(entry.order ?? 0) + 1}</span>
                                    <span className="flex-1 text-white text-sm font-medium truncate">{entry.name}</span>
                                    <span className="text-xs text-[var(--text-secondary)]">
                                        {assetInfo ? `${assetInfo.type}: ${assetInfo.name}` : 'No asset'}
                                    </span>
                                    {entry.unlockable && (
                                        <span className="text-xs bg-amber-600/30 text-amber-400 px-2 py-0.5 rounded flex items-center gap-1"><LockClosedIcon className="w-3 h-3" /> Unlockable</span>
                                    )}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeEntry(entry.id as VNID); }}
                                        className="text-red-400 hover:text-red-300 p-1"
                                        title="Remove entry"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                    <span className={`text-[var(--text-secondary)] transition-transform ${isEditing ? 'rotate-180' : ''}`}><ChevronDownIcon className="w-4 h-4" /></span>
                                </div>

                                {/* Entry Details (expanded) */}
                                {isEditing && (
                                    <div className="px-4 pb-4 pt-2 border-t border-[var(--border-subtle)] space-y-3">
                                        <div>
                                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Name</label>
                                            <input
                                                type="text"
                                                value={entry.name}
                                                onChange={(e) => updateEntry(entry.id as VNID, { name: e.target.value })}
                                                className="w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Asset</label>
                                                <select
                                                    value={entry.assetId ?? ''}
                                                    onChange={(e) => updateEntry(entry.id as VNID, { assetId: (e.target.value || null) as VNID | null })}
                                                    className="w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                                                >
                                                    <option value="">-- Select Asset --</option>
                                                    {allImages.length > 0 && (
                                                        <optgroup label="Images">
                                                            {allImages.map((img) => (
                                                                <option key={img.id} value={img.id}>{img.name}</option>
                                                            ))}
                                                        </optgroup>
                                                    )}
                                                    {allBackgrounds.length > 0 && (
                                                        <optgroup label="Backgrounds">
                                                            {allBackgrounds.map((bg) => (
                                                                <option key={bg.id} value={bg.id}>{bg.name}</option>
                                                            ))}
                                                        </optgroup>
                                                    )}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Thumbnail Override</label>
                                                <select
                                                    value={entry.thumbnailAssetId ?? ''}
                                                    onChange={(e) => updateEntry(entry.id as VNID, { thumbnailAssetId: (e.target.value || null) as VNID | null })}
                                                    className="w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                                                >
                                                    <option value="">Same as asset</option>
                                                    {allAssets.map((a) => (
                                                        <option key={a.id} value={a.id}>[{a.type}] {a.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Category</label>
                                                <input
                                                    type="text"
                                                    value={entry.category ?? ''}
                                                    onChange={(e) => updateEntry(entry.id as VNID, { category: e.target.value || undefined })}
                                                    className="w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                                                    placeholder="e.g. Chapter 1"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Sort Order</label>
                                                <input
                                                    type="number"
                                                    value={entry.order ?? 0}
                                                    onChange={(e) => updateEntry(entry.id as VNID, { order: parseInt(e.target.value, 10) || 0 })}
                                                    className="w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                                                />
                                            </div>
                                        </div>

                                        {/* Unlockable Section */}
                                        <div className="bg-[var(--bg-primary)]/50 rounded p-3 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    role="switch"
                                                    aria-checked={entry.unlockable}
                                                    onClick={() => updateEntry(entry.id as VNID, { unlockable: !entry.unlockable })}
                                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-lavender)] ${
                                                        entry.unlockable ? 'bg-sky-500' : 'bg-[var(--bg-tertiary)]'
                                                    }`}
                                                >
                                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${entry.unlockable ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                </button>
                                                <label className="text-sm text-[var(--text-primary)]">Requires Unlocking</label>
                                            </div>

                                            {entry.unlockable && (
                                                <div>
                                                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Unlock Variable (boolean)</label>
                                                    <select
                                                        value={entry.unlockVariableId ?? ''}
                                                        onChange={(e) => updateEntry(entry.id as VNID, { unlockVariableId: (e.target.value || null) as VNID | null })}
                                                        className="w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                                                    >
                                                        <option value="">-- Select Variable --</option>
                                                        {booleanVariables.map((v) => (
                                                            <option key={v.id} value={v.id}>{v.name}</option>
                                                        ))}
                                                    </select>
                                                    {booleanVariables.length === 0 && (
                                                        <p className="text-xs text-amber-400 mt-1">
                                                            No boolean variables found. Create a boolean variable in the Variables panel to use as an unlock trigger.
                                                        </p>
                                                    )}
                                                    {entry.unlockVariableId && !booleanVariables.find((v) => v.id === entry.unlockVariableId) && (
                                                        <p className="text-xs text-amber-400 mt-1">⚠ Selected variable not found</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const AccessibilitySettings: React.FC = () => {
    const a11yManager = AccessibilityManager.getInstance();
    const [preferences, setPreferences] = useState<A11yPreferences>(a11yManager.getPreferences());

    const handleToggle = (key: keyof A11yPreferences) => {
        const newValue = !preferences[key];
        a11yManager.updatePreference(key, newValue);
        setPreferences(a11yManager.getPreferences());
    };

    const toggleItems: { key: keyof A11yPreferences; label: string; description: string }[] = [
        { key: 'highContrast', label: 'High Contrast Mode', description: 'Increases contrast for better visibility' },
        { key: 'reducedMotion', label: 'Reduced Motion', description: 'Reduces animations for motion sensitivity' },
        { key: 'largeText', label: 'Large Text', description: 'Increases text size throughout the editor' },
        { key: 'keyboardOnly', label: 'Keyboard Navigation', description: 'Optimized for keyboard-only use' },
        { key: 'screenReaderMode', label: 'Screen Reader Mode', description: 'Enhanced compatibility with screen readers' },
    ];

    return (
        <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-6">Accessibility Settings</h3>

            <div className="space-y-4 max-w-md">
                {toggleItems.map(({ key, label, description }) => (
                    <div
                        key={key}
                        className="flex items-center justify-between p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)]"
                    >
                        <div>
                            <label className="block text-sm font-medium text-white">{label}</label>
                            <span className="text-xs text-[var(--text-secondary)]">{description}</span>
                        </div>
                        <button
                            role="switch"
                            aria-checked={preferences[key]}
                            onClick={() => handleToggle(key)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-lavender)] focus:ring-offset-2 focus:ring-offset-slate-900 ${
                                preferences[key] ? 'bg-sky-500' : 'bg-[var(--bg-tertiary)]'
                            }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    preferences[key] ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

const AnalyticsSettings: React.FC = () => {
    const [stats, setStats] = useState<WorkflowStats>(WorkflowTracker.getInstance().getStatistics());

    const refreshStats = () => {
        setStats(WorkflowTracker.getInstance().getStatistics());
    };

    const formatDuration = (ms: number): string => {
        if (ms < 1000) return `${Math.round(ms)}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60000).toFixed(1)}m`;
    };

    const sessionStart = React.useRef(Date.now());
    const sessionDuration = Date.now() - sessionStart.current;

    const formatSessionDuration = (ms: number): string => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    };

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Analytics</h3>
                <button
                    onClick={refreshStats}
                    className="px-3 py-1.5 text-sm bg-sky-500/20 text-sky-300 rounded-md border border-sky-500/50 hover:bg-sky-500/30 transition-colors"
                >
                    Refresh
                </button>
            </div>

            <div className="space-y-6 max-w-md">
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)]">
                        <span className="block text-xs text-[var(--text-secondary)] mb-1">Total Actions</span>
                        <span className="text-2xl font-bold text-white">{stats.totalActions}</span>
                    </div>
                    <div className="p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)]">
                        <span className="block text-xs text-[var(--text-secondary)] mb-1">Avg Action Time</span>
                        <span className="text-2xl font-bold text-white">{formatDuration(stats.averageActionTime)}</span>
                    </div>
                    <div className="p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)]">
                        <span className="block text-xs text-[var(--text-secondary)] mb-1">Session Duration</span>
                        <span className="text-2xl font-bold text-white">{formatSessionDuration(sessionDuration)}</span>
                    </div>
                    <div className="p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)]">
                        <span className="block text-xs text-[var(--text-secondary)] mb-1">Efficiency Score</span>
                        <span className="text-2xl font-bold text-white">{stats.efficiencyScore}%</span>
                    </div>
                </div>

                <div className="p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)]">
                    <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">Most Common Actions (Top 5)</h4>
                    {stats.mostCommonActions.length === 0 ? (
                        <p className="text-xs text-[var(--text-secondary)]">No actions tracked yet. Start editing to see analytics.</p>
                    ) : (
                        <div className="space-y-2">
                            {stats.mostCommonActions.map((item, index) => (
                                <div key={item.action} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-[var(--text-muted)] w-4">{index + 1}.</span>
                                        <span className="text-sm text-white font-mono">{item.action}</span>
                                    </div>
                                    <span className="text-xs text-[var(--text-secondary)]">{item.count}x</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SettingsManager;