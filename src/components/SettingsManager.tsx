import React, { useState } from 'react';
import { VNProject, VNProjectFont, CGGalleryConfig, CGGalleryEntry } from '../types/project';
import { VNProjectUI } from '../features/ui/types';
import { useProject } from '../contexts/ProjectContext';
import { Cog6ToothIcon, PhotoIcon, BookOpenIcon, TrashIcon, SparklesIcon, ClockIcon, LockClosedIcon, ChevronDownIcon, UIScreensIcon } from './icons';
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
    const [activeSection, setActiveSection] = useState<'general' | 'fonts' | 'screens' | 'accessibility' | 'analytics' | 'cg-gallery'>('general');

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
        { id: 'fonts' as const, name: 'Fonts', icon: BookOpenIcon },
        { id: 'screens' as const, name: 'Screens', icon: UIScreensIcon },
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
    // Helper to update a single game-settings field without re-spreading every default manually
    const updateGameSetting = (patch: Partial<import('../features/ui/types').VNDefaultGameSettings>) => {
        const current = project.ui?.defaultGameSettings;
        onUpdateUI({
            defaultGameSettings: {
                textSpeed: current?.textSpeed ?? 50,
                musicVolume: current?.musicVolume ?? 0.8,
                sfxVolume: current?.sfxVolume ?? 0.8,
                voiceVolume: current?.voiceVolume ?? 0.8,
                ambientVolume: current?.ambientVolume ?? 0.8,
                enableSkip: current?.enableSkip ?? true,
                autoAdvance: current?.autoAdvance ?? false,
                autoAdvanceDelay: current?.autoAdvanceDelay ?? 3,
                ...patch,
            },
        });
    };

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
                    <h4 className="text-lg font-semibold text-white mb-4">Stage Behavior</h4>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <label className="text-sm font-medium text-[var(--text-primary)]">Auto-Arrange Characters</label>
                                <p className="text-xs text-[var(--text-secondary)]">Automatically spread characters apart when they share the same stage position (e.g. two characters both set to "Center" will appear side-by-side). Characters are kept within view.</p>
                            </div>
                            <button
                                onClick={() => onUpdate({ autoArrangeCharacters: !project.autoArrangeCharacters })}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                                    project.autoArrangeCharacters ? 'bg-sky-500' : 'bg-[var(--bg-tertiary)]'
                                }`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    project.autoArrangeCharacters ? 'translate-x-6' : 'translate-x-1'
                                }`} />
                            </button>
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
                                onChange={(e) => updateGameSetting({ textSpeed: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                            <div className="flex justify-between text-xs text-[var(--text-secondary)] mt-1">
                                <span>Slow</span><span>Fast</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Music Volume: {Math.round((project.ui?.defaultGameSettings?.musicVolume ?? 0.8) * 100)}%</label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={Math.round((project.ui?.defaultGameSettings?.musicVolume ?? 0.8) * 100)}
                                onChange={(e) => updateGameSetting({ musicVolume: parseInt(e.target.value) / 100 })}
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
                                onChange={(e) => updateGameSetting({ sfxVolume: parseInt(e.target.value) / 100 })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Voice Volume: {Math.round((project.ui?.defaultGameSettings?.voiceVolume ?? 0.8) * 100)}%</label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={Math.round((project.ui?.defaultGameSettings?.voiceVolume ?? 0.8) * 100)}
                                onChange={(e) => updateGameSetting({ voiceVolume: parseInt(e.target.value) / 100 })}
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
                                onChange={(e) => updateGameSetting({ ambientVolume: parseInt(e.target.value) / 100 })}
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
                                onChange={(e) => updateGameSetting({ autoAdvanceDelay: parseFloat(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                            <div className="flex justify-between text-xs text-[var(--text-secondary)] mt-1">
                                <span>1s</span><span>10s</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <label className="text-sm font-medium text-[var(--text-primary)]">Enable Skip</label>
                                <p className="text-xs text-[var(--text-secondary)]">Allow players to skip through text quickly</p>
                            </div>
                            <button
                                onClick={() => updateGameSetting({ enableSkip: !(project.ui?.defaultGameSettings?.enableSkip ?? true) })}
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
                            <div>
                                <label className="text-sm font-medium text-[var(--text-primary)]">Auto-Advance</label>
                                <p className="text-xs text-[var(--text-secondary)]">Automatically proceed to next dialogue line</p>
                            </div>
                            <button
                                onClick={() => updateGameSetting({ autoAdvance: !(project.ui?.defaultGameSettings?.autoAdvance ?? false) })}
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

                <div className="pt-4 border-t border-[var(--border-subtle)]">
                    <h4 className="text-lg font-semibold text-white mb-4">Project Summary</h4>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { label: 'Scenes', value: Object.keys(project.scenes || {}).length },
                            { label: 'Characters', value: Object.keys(project.characters || {}).length },
                            { label: 'Variables', value: Object.keys(project.variables || {}).length },
                            { label: 'Backgrounds', value: Object.keys(project.backgrounds || {}).length },
                            { label: 'Images', value: Object.keys(project.images || {}).length },
                            { label: 'Audio Files', value: Object.keys(project.audio || {}).length },
                            { label: 'UI Screens', value: Object.keys(project.uiScreens || {}).length },
                            { label: 'Total Events', value: Object.values(project.scenes || {}).reduce((sum: number, s: any) => sum + (s.commands?.length || 0), 0) },
                        ].map(item => (
                            <div key={item.label} className="p-3 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)]">
                                <span className="block text-xs text-[var(--text-secondary)]">{item.label}</span>
                                <span className="text-lg font-bold text-white">{item.value}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                        <span>ID: <span className="font-mono">{project.id}</span></span>
                        <span>Engine: <span className="font-mono">{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—'}</span></span>
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

    editorDebugLog('[UIAssetsSettings] Rendering with images:', allImages.length, allImages.map((i: any) => i.name));

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
            dialogueBoxSizeMode: 'stretch',
            dialogueBoxSlice: 30,
            dialogueBoxColor: '#0f172a',
            dialogueBoxOpacity: 90,
            dialogueBoxBorderRadius: 8,
            nameboxImage: null,
            nameboxColor: '#0f172a',
            nameboxOpacity: 92,
            nameboxPadding: 8,
            nameboxHorizontalPadding: 14,
            nameboxBorderRadius: 6,
            nameboxOffsetX: 20,
            nameboxOffsetY: 0,
            nameboxSizeMode: 'stretch',
            choiceButtonImage: null,
            choiceButtonBorderImage: null,
            choiceBorderPadding: 8,
            choiceButtonWidth: 0,
            choiceButtonHeight: 0,
            choiceButtonPadding: 16,
            choiceButtonSizeMode: 'stretch',
            choiceButtonSlice: 15,
            choiceButtonColor: '#1e293b',
            choiceButtonOpacity: 90,
            choiceButtonBorderRadius: 8,
            choiceHoverImage: null,
            choiceHoverColor: '#334155',
            inputBoxImage: null,
            inputBoxBorderImage: null,
            inputBorderPadding: 8,
            inputBoxWidth: 0,
            inputBoxPadding: 24,
            inputBoxSizeMode: 'stretch',
            inputBoxSlice: 20,
            inputBoxColor: '#0f172a',
            inputBoxOpacity: 92,
            inputBoxBorderRadius: 8,
            quickMenuPosition: 'above-dialogue',
            quickMenuColor: '#0f172a',
            quickMenuOpacity: 75,
            quickMenuBorderRadius: 4,
            inputPromptFont: { family: 'Poppins, sans-serif', size: 18, color: '#FFFFFF', weight: 'normal', italic: false },
            inputFieldFont: { family: 'Poppins, sans-serif', size: 16, color: '#FFFFFF', weight: 'normal', italic: false },
            inputSubmitFont: { family: 'Poppins, sans-serif', size: 16, color: '#FFFFFF', weight: 'normal', italic: false },
            dialogueNameFont: { family: 'Poppins, sans-serif', size: 22, color: '#FFFFFF', weight: 'bold', italic: false },
            dialogueTextFont: { family: 'Poppins, sans-serif', size: 20, color: '#FFFFFF', weight: 'normal', italic: false },
            choiceTextFont: { family: 'Poppins, sans-serif', size: 18, color: '#FFFFFF', weight: 'normal', italic: false },
        });
        setShowResetConfirm(false);
    };

    // Helper: Image fit mode selector
    const ImageFitModeSelect: React.FC<{ value: string; onChange: (v: string) => void; label?: string }> = ({ value, onChange, label }) => (
        <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{label || 'Image Fit Mode'}</label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
            >
                <option value="stretch">Stretch (fill box)</option>
                <option value="contain">Contain (fit inside)</option>
                <option value="cover">Cover (fill &amp; crop)</option>
                <option value="tile">Tile (repeat)</option>
                <option value="nine-slice">9-Slice (preserve corners)</option>
            </select>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {value === 'stretch' && 'Stretches image to fill the entire box. May distort if aspect ratios differ.'}
                {value === 'contain' && 'Fits the image inside without cropping. May show background color in gaps.'}
                {value === 'cover' && 'Fills the box completely, cropping edges if needed.'}
                {value === 'tile' && 'Repeats the image as tiles to fill the box.'}
                {value === 'nine-slice' && 'Preserves corners and edges while stretching only the center. Ideal for ornamental frames.'}
            </p>
        </div>
    );

    // Helper: Color + opacity control
    const ColorOpacityControl: React.FC<{ colorValue: string; opacityValue: number; onColorChange: (v: string) => void; onOpacityChange: (v: number) => void; label: string }> = ({ colorValue, opacityValue, onColorChange, onOpacityChange, label }) => (
        <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{label}</label>
            <div className="flex items-center gap-3">
                <input
                    type="color"
                    value={colorValue}
                    onChange={(e) => onColorChange(e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer border border-[var(--border-default)]"
                    style={{ padding: '2px' }}
                />
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[var(--text-secondary)]">Opacity</span>
                        <span className="text-xs text-[var(--text-secondary)]">{opacityValue}%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={opacityValue}
                        onChange={(e) => onOpacityChange(parseInt(e.target.value))}
                        className="w-full accent-[var(--accent-lavender)]"
                    />
                </div>
            </div>
            <div className="mt-1 h-4 rounded border border-[var(--border-default)]"
                 style={{ backgroundColor: colorValue, opacity: opacityValue / 100 }}
                 title="Color preview at current opacity"
            />
        </div>
    );

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

                {/* ─── Dialogue Box Appearance ─── */}
                <div className="border-t border-[var(--border-subtle)] pt-4">
                    <h4 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Dialogue Box Appearance</h4>
                    <div className="space-y-4">
                        {project.ui.dialogueBoxImage && (
                            <ImageFitModeSelect
                                value={project.ui.dialogueBoxSizeMode ?? 'stretch'}
                                onChange={(v) => onUpdate({ dialogueBoxSizeMode: v as any })}
                            />
                        )}
                        {project.ui.dialogueBoxImage && (project.ui.dialogueBoxSizeMode ?? 'stretch') === 'nine-slice' && (
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">9-Slice Border Size ({project.ui.dialogueBoxSlice ?? 30}px)</label>
                                <input
                                    type="range"
                                    min="5"
                                    max="100"
                                    value={project.ui.dialogueBoxSlice ?? 30}
                                    onChange={(e) => onUpdate({ dialogueBoxSlice: parseInt(e.target.value) })}
                                    className="w-full accent-[var(--accent-lavender)]"
                                />
                                <p className="mt-1 text-xs text-[var(--text-secondary)]">How many pixels from each edge to preserve as corners/borders. Increase if corners look distorted.</p>
                            </div>
                        )}
                        <ColorOpacityControl
                            colorValue={project.ui.dialogueBoxColor ?? '#0f172a'}
                            opacityValue={project.ui.dialogueBoxOpacity ?? 90}
                            onColorChange={(v) => onUpdate({ dialogueBoxColor: v })}
                            onOpacityChange={(v) => onUpdate({ dialogueBoxOpacity: v })}
                            label="Background Color (shown behind/instead of image)"
                        />
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Corner Radius ({project.ui.dialogueBoxBorderRadius ?? 8}px)</label>
                            <input
                                type="range"
                                min="0"
                                max="30"
                                value={project.ui.dialogueBoxBorderRadius ?? 8}
                                onChange={(e) => onUpdate({ dialogueBoxBorderRadius: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                    </div>
                </div>

                {/* ─── Namebox (Character Name Label) ─── */}
                <div className="border-t border-[var(--border-subtle)] pt-4">
                    <h4 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Namebox (Character Name)</h4>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Namebox Image</label>
                            <select
                                value={project.ui.nameboxImage?.id || ''}
                                onChange={(e) => {
                                    const assetId = e.target.value;
                                    const asset = assetId ? allImages.find(img => img.id === assetId) : null;
                                    onUpdate({
                                        nameboxImage: asset ? { type: 'image', id: asset.id } : null
                                    });
                                }}
                                className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                            >
                                <option value="">None (use color)</option>
                                {allImages.map(image => (
                                    <option key={image.id} value={image.id}>
                                        {image.name}
                                    </option>
                                ))}
                            </select>
                            {project.ui.nameboxImage?.id && (() => {
                                const img = allImages.find(i => i.id === project.ui.nameboxImage?.id);
                                const url = img?.imageUrl;
                                return url ? (
                                    <div className="mt-2 rounded-md overflow-hidden border border-[var(--border-default)]" style={{ maxHeight: '50px' }}>
                                        <img src={url} alt="Namebox preview" className="w-full h-full object-contain" style={{ maxHeight: '50px' }} />
                                    </div>
                                ) : (
                                    <p className="mt-1 text-xs text-amber-400">⚠ Selected image not found in project assets</p>
                                );
                            })()}
                        </div>
                        {project.ui.nameboxImage && (
                            <ImageFitModeSelect
                                value={project.ui.nameboxSizeMode ?? 'stretch'}
                                onChange={(v) => onUpdate({ nameboxSizeMode: v as any })}
                                label="Namebox Image Fit Mode"
                            />
                        )}
                        <ColorOpacityControl
                            colorValue={project.ui.nameboxColor ?? '#0f172a'}
                            opacityValue={project.ui.nameboxOpacity ?? 92}
                            onColorChange={(v) => onUpdate({ nameboxColor: v })}
                            onOpacityChange={(v) => onUpdate({ nameboxOpacity: v })}
                            label="Namebox Background Color"
                        />
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Vertical Padding ({project.ui.nameboxPadding ?? 8}px)</label>
                            <input
                                type="range"
                                min="0"
                                max="30"
                                value={project.ui.nameboxPadding ?? 8}
                                onChange={(e) => onUpdate({ nameboxPadding: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Horizontal Padding ({project.ui.nameboxHorizontalPadding ?? 14}px)</label>
                            <input
                                type="range"
                                min="0"
                                max="40"
                                value={project.ui.nameboxHorizontalPadding ?? 14}
                                onChange={(e) => onUpdate({ nameboxHorizontalPadding: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Corner Radius ({project.ui.nameboxBorderRadius ?? 6}px)</label>
                            <input
                                type="range"
                                min="0"
                                max="20"
                                value={project.ui.nameboxBorderRadius ?? 6}
                                onChange={(e) => onUpdate({ nameboxBorderRadius: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Horizontal Offset ({project.ui.nameboxOffsetX ?? 20}px)</label>
                            <input
                                type="range"
                                min="0"
                                max="200"
                                value={project.ui.nameboxOffsetX ?? 20}
                                onChange={(e) => onUpdate({ nameboxOffsetX: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Gap Above Dialogue Box ({project.ui.nameboxOffsetY ?? 0}px)</label>
                            <input
                                type="range"
                                min="0"
                                max="30"
                                value={project.ui.nameboxOffsetY ?? 0}
                                onChange={(e) => onUpdate({ nameboxOffsetY: parseInt(e.target.value) })}
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

                {/* ─── Choice Button Appearance ─── */}
                <div className="border-t border-[var(--border-subtle)] pt-4">
                    <h4 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Choice Button Appearance</h4>
                    <div className="space-y-4">
                        {project.ui.choiceButtonImage && (
                            <ImageFitModeSelect
                                value={project.ui.choiceButtonSizeMode ?? 'stretch'}
                                onChange={(v) => onUpdate({ choiceButtonSizeMode: v as any })}
                            />
                        )}
                        {project.ui.choiceButtonImage && (project.ui.choiceButtonSizeMode ?? 'stretch') === 'nine-slice' && (
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">9-Slice Border Size ({project.ui.choiceButtonSlice ?? 15}px)</label>
                                <input
                                    type="range"
                                    min="2"
                                    max="60"
                                    value={project.ui.choiceButtonSlice ?? 15}
                                    onChange={(e) => onUpdate({ choiceButtonSlice: parseInt(e.target.value) })}
                                    className="w-full accent-[var(--accent-lavender)]"
                                />
                            </div>
                        )}
                        <ColorOpacityControl
                            colorValue={project.ui.choiceButtonColor ?? '#1e293b'}
                            opacityValue={project.ui.choiceButtonOpacity ?? 90}
                            onColorChange={(v) => onUpdate({ choiceButtonColor: v })}
                            onOpacityChange={(v) => onUpdate({ choiceButtonOpacity: v })}
                            label="Button Background Color"
                        />
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Corner Radius ({project.ui.choiceButtonBorderRadius ?? 8}px)</label>
                            <input
                                type="range"
                                min="0"
                                max="30"
                                value={project.ui.choiceButtonBorderRadius ?? 8}
                                onChange={(e) => onUpdate({ choiceButtonBorderRadius: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Hover Image (optional)</label>
                            <select
                                value={project.ui.choiceHoverImage?.id || ''}
                                onChange={(e) => {
                                    const assetId = e.target.value;
                                    const asset = assetId ? allImages.find(img => img.id === assetId) : null;
                                    onUpdate({
                                        choiceHoverImage: asset ? { type: 'image', id: asset.id } : null
                                    });
                                }}
                                className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                            >
                                <option value="">None (use brightness effect)</option>
                                {allImages.map(image => (
                                    <option key={image.id} value={image.id}>
                                        {image.name}
                                    </option>
                                ))}
                            </select>
                            {project.ui.choiceHoverImage?.id && (() => {
                                const img = allImages.find(i => i.id === project.ui.choiceHoverImage?.id);
                                const url = img?.imageUrl;
                                return url ? (
                                    <div className="mt-2 rounded-md overflow-hidden border border-[var(--border-default)]" style={{ maxHeight: '50px' }}>
                                        <img src={url} alt="Choice hover preview" className="w-full h-full object-contain" style={{ maxHeight: '50px' }} />
                                    </div>
                                ) : null;
                            })()}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Hover Background Color</label>
                            <input
                                type="color"
                                value={project.ui.choiceHoverColor ?? '#334155'}
                                onChange={(e) => onUpdate({ choiceHoverColor: e.target.value })}
                                className="w-12 h-10 rounded cursor-pointer border border-[var(--border-default)]"
                                style={{ padding: '2px' }}
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

                {/* ─── Input Box Appearance ─── */}
                <div className="border-t border-[var(--border-subtle)] pt-4">
                    <h4 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Input Box Appearance</h4>
                    <div className="space-y-4">
                        {project.ui.inputBoxImage && (
                            <ImageFitModeSelect
                                value={project.ui.inputBoxSizeMode ?? 'stretch'}
                                onChange={(v) => onUpdate({ inputBoxSizeMode: v as any })}
                            />
                        )}
                        {project.ui.inputBoxImage && (project.ui.inputBoxSizeMode ?? 'stretch') === 'nine-slice' && (
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">9-Slice Border Size ({project.ui.inputBoxSlice ?? 20}px)</label>
                                <input
                                    type="range"
                                    min="2"
                                    max="60"
                                    value={project.ui.inputBoxSlice ?? 20}
                                    onChange={(e) => onUpdate({ inputBoxSlice: parseInt(e.target.value) })}
                                    className="w-full accent-[var(--accent-lavender)]"
                                />
                            </div>
                        )}
                        <ColorOpacityControl
                            colorValue={project.ui.inputBoxColor ?? '#0f172a'}
                            opacityValue={project.ui.inputBoxOpacity ?? 92}
                            onColorChange={(v) => onUpdate({ inputBoxColor: v })}
                            onOpacityChange={(v) => onUpdate({ inputBoxOpacity: v })}
                            label="Input Box Background Color"
                        />
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Corner Radius ({project.ui.inputBoxBorderRadius ?? 8}px)</label>
                            <input
                                type="range"
                                min="0"
                                max="30"
                                value={project.ui.inputBoxBorderRadius ?? 8}
                                onChange={(e) => onUpdate({ inputBoxBorderRadius: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                    </div>
                </div>

                {/* ─── Quick Menu (Skip/Auto/Log/Back) ─── */}
                <div className="border-t border-[var(--border-subtle)] pt-4">
                    <h4 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Quick Menu Buttons</h4>
                    <p className="text-xs text-[var(--text-secondary)] mb-3">Style the Skip, Auto, Log, and Back buttons shown during gameplay.</p>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Position</label>
                            <select
                                value={project.ui.quickMenuPosition ?? 'above-dialogue'}
                                onChange={(e) => onUpdate({ quickMenuPosition: e.target.value as any })}
                                className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                            >
                                <option value="above-dialogue">Above Dialogue Box</option>
                                <option value="top-right">Top Right</option>
                                <option value="bottom-right">Bottom Right</option>
                                <option value="hidden">Hidden</option>
                            </select>
                        </div>
                        {(project.ui.quickMenuPosition ?? 'above-dialogue') !== 'hidden' && (
                            <>
                                <ColorOpacityControl
                                    colorValue={project.ui.quickMenuColor ?? '#0f172a'}
                                    opacityValue={project.ui.quickMenuOpacity ?? 75}
                                    onColorChange={(v) => onUpdate({ quickMenuColor: v })}
                                    onOpacityChange={(v) => onUpdate({ quickMenuOpacity: v })}
                                    label="Button Background Color"
                                />
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Button Corner Radius ({project.ui.quickMenuBorderRadius ?? 4}px)</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="16"
                                        value={project.ui.quickMenuBorderRadius ?? 4}
                                        onChange={(e) => onUpdate({ quickMenuBorderRadius: parseInt(e.target.value) })}
                                        className="w-full accent-[var(--accent-lavender)]"
                                    />
                                </div>
                            </>
                        )}
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
                <div className="text-sm text-[var(--text-secondary)] bg-[var(--bg-primary)]/50 p-4 rounded border border-[var(--border-default)]">
                    Font settings for dialogue text, name box, choice buttons, and input boxes are configured in the <strong className="text-white">In-Game UI</strong> editor. Select an element there to edit its font properties.
                </div>
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

    const screenSlots: { key: keyof VNProjectUI; label: string; description: string }[] = [
        { key: 'titleScreenId', label: 'Title Screen', description: 'Shown when the game first launches. Typically contains New Game, Continue, Settings, and Quit buttons.' },
        { key: 'settingsScreenId', label: 'Settings Screen', description: 'In-game settings menu where players adjust text speed, volume, and other preferences.' },
        { key: 'saveScreenId', label: 'Save Screen', description: 'Screen shown when the player saves their progress. Displays available save slots.' },
        { key: 'loadScreenId', label: 'Load Screen', description: 'Screen shown when the player loads a previous save. Can share a layout with the Save Screen.' },
        { key: 'pauseScreenId', label: 'Pause Screen', description: 'Shown when the player presses Escape during gameplay. Usually offers Resume, Save, Load, Settings, and Quit.' },
        { key: 'gameHudScreenId', label: 'Game HUD Screen', description: 'Persistent overlay displayed on top of gameplay, e.g. custom button bars, status indicators, or affection meters.' },
    ];

    return (
        <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-2">Special Screens</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
                Assign UI screens you've built in the Menu Editor to serve as your game's system menus. Each slot controls when and where a screen appears during gameplay.
            </p>

            {allScreens.length === 0 && (
                <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <p className="text-sm text-amber-300 font-medium mb-1">No UI Screens Created Yet</p>
                    <p className="text-xs text-amber-300/70">
                        Create screens in the Menu Editor tab first, then return here to assign them. The Menu Editor lets you visually design title screens, settings menus, save/load screens, and more.
                    </p>
                </div>
            )}

            <div className="space-y-5 max-w-md">
                {screenSlots.map(({ key, label, description }) => (
                    <div key={key} className="p-4 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-subtle)]">
                        <label className="block text-sm font-medium text-white mb-1">{label}</label>
                        <p className="text-xs text-[var(--text-secondary)] mb-2">{description}</p>
                        <select
                            value={(project.ui[key] as string) || ''}
                            onChange={(e) => onUpdate({ [key]: e.target.value || null })}
                            className="w-full bg-[var(--bg-secondary)] text-white p-2.5 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)] text-sm"
                        >
                            <option value="">None</option>
                            {allScreens.map((screen: any) => (
                                <option key={screen.id} value={screen.id}>
                                    {screen.name}
                                </option>
                            ))}
                        </select>
                        {(project.ui[key] as string) && !allScreens.find((s: any) => s.id === project.ui[key]) && (
                            <p className="mt-1 text-xs text-amber-400">⚠ Assigned screen no longer exists</p>
                        )}
                    </div>
                ))}
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
        { key: 'highContrast', label: 'High Contrast Mode', description: 'Increases border thickness and contrast throughout the editor UI for better visibility.' },
        { key: 'reducedMotion', label: 'Reduced Motion', description: 'Disables all CSS animations and transitions. Recommended for motion-sensitive users.' },
        { key: 'largeText', label: 'Large Text', description: 'Scales up all editor text by 20% for improved readability on high-DPI screens.' },
        { key: 'keyboardOnly', label: 'Force Keyboard Focus Rings', description: 'Always shows prominent focus outlines on interactive elements. Automatically activates when Tab is pressed.' },
        { key: 'screenReaderMode', label: 'Screen Reader Mode', description: 'Adds ARIA landmarks and labels for better screen reader navigation. Enable if using NVDA, JAWS, or VoiceOver.' },
    ];

    return (
        <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-2">Accessibility Settings</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
                These settings affect the <strong className="text-[var(--text-primary)]">editor</strong> interface only, not your exported game. Settings are saved to your browser and persist across sessions.
            </p>

            <div className="space-y-3 max-w-md">
                {toggleItems.map(({ key, label, description }) => (
                    <div
                        key={key}
                        className={`flex items-start justify-between gap-4 p-4 rounded-md border transition-colors ${
                            preferences[key]
                                ? 'bg-sky-500/10 border-sky-500/30'
                                : 'bg-[var(--bg-primary)] border-[var(--border-subtle)]'
                        }`}
                    >
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-white">{label}</label>
                            <span className="text-xs text-[var(--text-secondary)] leading-relaxed">{description}</span>
                        </div>
                        <button
                            role="switch"
                            aria-checked={preferences[key]}
                            onClick={() => handleToggle(key)}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-lavender)] focus:ring-offset-2 focus:ring-offset-slate-900 ${
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

            <div className="mt-6 p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)] max-w-md">
                <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">Keyboard Shortcuts</h4>
                <div className="space-y-1 text-xs text-[var(--text-secondary)]">
                    <div className="flex justify-between"><span>Undo</span><kbd className="bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded text-[var(--text-primary)] font-mono">Ctrl+Z</kbd></div>
                    <div className="flex justify-between"><span>Redo</span><kbd className="bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded text-[var(--text-primary)] font-mono">Ctrl+Y</kbd></div>
                    <div className="flex justify-between"><span>Save Project</span><kbd className="bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded text-[var(--text-primary)] font-mono">Ctrl+S</kbd></div>
                    <div className="flex justify-between"><span>Command Palette</span><kbd className="bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded text-[var(--text-primary)] font-mono">Ctrl+K</kbd></div>
                </div>
            </div>
        </div>
    );
};

const AnalyticsSettings: React.FC = () => {
    const tracker = WorkflowTracker.getInstance();
    const [stats, setStats] = useState<WorkflowStats>(tracker.getStatistics());
    const [sessionElapsed, setSessionElapsed] = useState(0);
    const sessionStart = React.useRef(Date.now());
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // Live-updating session timer & stats refresh every second
    React.useEffect(() => {
        const timer = setInterval(() => {
            setSessionElapsed(Date.now() - sessionStart.current);
            setStats(tracker.getStatistics());
        }, 1000);
        return () => clearInterval(timer);
    }, [tracker]);

    const formatDuration = (ms: number): string => {
        if (ms < 1000) return `${Math.round(ms)}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60000).toFixed(1)}m`;
    };

    const formatSessionDuration = (ms: number): string => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    };

    // Make raw dispatch action names human-readable
    const humanizeAction = (raw: string): string => {
        const map: Record<string, string> = {
            'UPDATE_PROJECT': 'Update Project',
            'UPDATE_UI': 'Update UI Settings',
            'ADD_COMMAND': 'Add Command',
            'UPDATE_COMMAND': 'Edit Command',
            'DELETE_COMMAND': 'Delete Command',
            'REORDER_COMMANDS': 'Reorder Commands',
            'ADD_SCENE': 'Create Scene',
            'UPDATE_SCENE': 'Edit Scene',
            'DELETE_SCENE': 'Delete Scene',
            'ADD_CHARACTER': 'Create Character',
            'UPDATE_CHARACTER': 'Edit Character',
            'DELETE_CHARACTER': 'Delete Character',
            'ADD_VARIABLE': 'Create Variable',
            'UPDATE_VARIABLE': 'Edit Variable',
            'DELETE_VARIABLE': 'Delete Variable',
            'ADD_BACKGROUND': 'Add Background',
            'DELETE_BACKGROUND': 'Remove Background',
            'ADD_IMAGE': 'Add Image',
            'DELETE_IMAGE': 'Remove Image',
            'ADD_AUDIO': 'Add Audio',
            'DELETE_AUDIO': 'Remove Audio',
            'ADD_VIDEO': 'Add Video',
            'DELETE_VIDEO': 'Remove Video',
            'UNDO': 'Undo',
            'REDO': 'Redo',
            'SET_PROJECT': 'Load Project',
            'ADD_UI_SCREEN': 'Create UI Screen',
            'UPDATE_UI_SCREEN': 'Edit UI Screen',
            'DELETE_UI_SCREEN': 'Delete UI Screen',
        };
        return map[raw] || raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).toLowerCase().replace(/^\w/, c => c.toUpperCase());
    };

    const suggestions = tracker.getOptimizationSuggestions();

    const handleClear = () => {
        tracker.clearData();
        setStats(tracker.getStatistics());
        setShowClearConfirm(false);
    };

    // Compute actions-per-minute rate
    const apm = sessionElapsed > 60000 ? ((stats.totalActions / sessionElapsed) * 60000).toFixed(1) : '—';

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-bold text-white">Session Analytics</h3>
                <div className="flex items-center gap-2">
                    {!showClearConfirm ? (
                        <button
                            onClick={() => setShowClearConfirm(true)}
                            className="px-3 py-1.5 text-xs rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-red-400 hover:border-red-500/50 transition-colors"
                        >
                            Clear Data
                        </button>
                    ) : (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleClear}
                                className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 transition-colors"
                            >
                                Confirm
                            </button>
                            <button
                                onClick={() => setShowClearConfirm(false)}
                                className="px-2 py-1 text-xs rounded bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
                Tracks your editing activity during this session. Data is stored in memory and resets when you close the editor.
            </p>

            <div className="space-y-6 max-w-lg">
                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)] text-center">
                        <span className="block text-xs text-[var(--text-secondary)] mb-1">Session Time</span>
                        <span className="text-xl font-bold text-white">{formatSessionDuration(sessionElapsed)}</span>
                    </div>
                    <div className="p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)] text-center">
                        <span className="block text-xs text-[var(--text-secondary)] mb-1">Total Actions</span>
                        <span className="text-xl font-bold text-white">{stats.totalActions}</span>
                    </div>
                    <div className="p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)] text-center">
                        <span className="block text-xs text-[var(--text-secondary)] mb-1">Actions/min</span>
                        <span className="text-xl font-bold text-white">{apm}</span>
                    </div>
                </div>

                {/* Most Common Actions — bar chart style */}
                <div className="p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)]">
                    <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">Most Used Actions</h4>
                    {stats.mostCommonActions.length === 0 ? (
                        <p className="text-xs text-[var(--text-secondary)]">No actions tracked yet. Start editing your project to see analytics here.</p>
                    ) : (
                        <div className="space-y-2">
                            {stats.mostCommonActions.map((item, index) => {
                                const maxCount = stats.mostCommonActions[0]?.count || 1;
                                const pct = Math.round((item.count / maxCount) * 100);
                                return (
                                    <div key={item.action}>
                                        <div className="flex items-center justify-between mb-0.5">
                                            <span className="text-xs text-white">{humanizeAction(item.action)}</span>
                                            <span className="text-xs text-[var(--text-secondary)] tabular-nums">{item.count}x</span>
                                        </div>
                                        <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all"
                                                style={{
                                                    width: `${pct}%`,
                                                    backgroundColor: index === 0 ? '#38bdf8' : index === 1 ? '#818cf8' : '#64748b',
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Workflow Patterns */}
                {stats.commonPatterns.length > 0 && (
                    <div className="p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)]">
                        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">Repeated Patterns</h4>
                        <p className="text-xs text-[var(--text-secondary)] mb-2">Action sequences you perform frequently — consider templates or shortcuts for these.</p>
                        <div className="space-y-2">
                            {stats.commonPatterns.slice(0, 3).map((pattern) => (
                                <div key={pattern.id} className="p-2 bg-[var(--bg-secondary)] rounded border border-[var(--border-subtle)]">
                                    <div className="flex items-center gap-1 flex-wrap">
                                        {pattern.actions.map((a, i) => (
                                            <React.Fragment key={i}>
                                                <span className="text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] px-1.5 py-0.5 rounded">{humanizeAction(a)}</span>
                                                {i < pattern.actions.length - 1 && <span className="text-[var(--text-muted)] text-xs">&rarr;</span>}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                    <span className="text-xs text-[var(--text-secondary)] mt-1 block">{pattern.frequency}x repeated</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Optimization Suggestions */}
                {suggestions.length > 0 && (
                    <div className="p-4 bg-amber-500/10 rounded-md border border-amber-500/30">
                        <h4 className="text-sm font-medium text-amber-300 mb-2">Optimization Suggestions</h4>
                        <ul className="space-y-1">
                            {suggestions.map((s, i) => (
                                <li key={i} className="text-xs text-amber-200/80 flex items-start gap-2">
                                    <span className="mt-0.5 flex-shrink-0">💡</span>
                                    <span>{s}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Avg Action Time */}
                {stats.totalActions > 0 && (
                    <div className="text-xs text-[var(--text-secondary)] flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                        <span>Average time between actions: {formatDuration(stats.averageActionTime)}</span>
                        <span>Data resets on reload</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SettingsManager;