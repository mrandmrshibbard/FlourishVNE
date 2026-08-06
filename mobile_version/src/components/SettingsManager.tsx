import React, { useState } from 'react';
import { RangeInput, ColorInput, FormField, Select, TextInput } from './ui/Form';
import { VNDayNightCycle, VNDayNightPhase, VNGradeLayer } from '../types/project';
import { VNVariable } from '../features/variables/types';
import { createDefaultDayNightCycle } from './live-preview/systems/dayNightGrade';
import { useTranslation, Trans } from 'react-i18next';
import { useToast } from '../contexts/ToastContext';
import { SUPPORTED_LANGUAGES, setLanguage } from '../i18n';
import { VNProject, VNProjectFont, CGGalleryConfig, CGGalleryEntry, MusicGalleryConfig, MusicGalleryEntry } from '../types/project';
import { VNProjectUI } from '../features/ui/types';
import { useProject } from '../contexts/ProjectContext';
import { Cog6ToothIcon, PhotoIcon, BookOpenIcon, TrashIcon, SparklesIcon, ClockIcon, LockClosedIcon, ChevronDownIcon, UIScreensIcon, MusicalNoteIcon } from './icons';
import { VNID } from '../types';
import { AccessibilityManager, A11yPreferences } from '../features/accessibility/AccessibilityManager';
import { WorkflowTracker, WorkflowStats } from '../features/analytics/WorkflowTracker';
import { sanitizeFontFamily, loadFontOnce, cssFontFamily, analyzeFontComplexity, rendererFreezesOnComplexFonts } from '../utils/styleUtils';

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
    const { t } = useTranslation('settings');
    const [activeSection, setActiveSection] = useState<'general' | 'fonts' | 'screens' | 'accessibility' | 'analytics' | 'cg-gallery' | 'music-gallery' | 'day-night'>('general');

    const updateUI = (updates: Partial<VNProjectUI>) => {
        editorDebugLog('[SettingsManager] updateUI called with:', updates);
        dispatch({ type: 'UPDATE_UI', payload: updates });
    };

    const updateProject = (updates: Partial<VNProject>) => {
        editorDebugLog('[SettingsManager] updateProject called with:', updates);
        dispatch({ type: 'UPDATE_PROJECT', payload: updates });
    };

    const sections = [
        { id: 'general' as const, name: t('sections.general'), icon: Cog6ToothIcon },
        { id: 'fonts' as const, name: t('sections.fonts'), icon: BookOpenIcon },
        { id: 'screens' as const, name: t('sections.screens'), icon: UIScreensIcon },
        { id: 'cg-gallery' as const, name: t('sections.cgGallery'), icon: PhotoIcon },
        { id: 'music-gallery' as const, name: t('sections.musicGallery'), icon: MusicalNoteIcon },
        { id: 'day-night' as const, name: t('sections.dayNight', 'Day / Night'), icon: ClockIcon },
        { id: 'accessibility' as const, name: t('sections.accessibility'), icon: SparklesIcon },
        { id: 'analytics' as const, name: t('sections.analytics'), icon: ClockIcon },
    ];

    return (
        <div className="flex h-full">
            {/* Settings Sidebar */}
            <div className="w-64 bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] flex flex-col">
                <div className="p-4 border-b border-[var(--border-subtle)]">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Cog6ToothIcon className="w-5 h-5" />
                        {t('title')}
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
                {activeSection === 'music-gallery' && (
                    <MusicGallerySettings project={project} onUpdate={updateProject} />
                )}
                {activeSection === 'day-night' && (
                    <DayNightSettings project={project} onUpdate={updateProject} />
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
    const { t, i18n } = useTranslation('settings');
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
            <h3 className="text-xl font-bold text-white mb-6">{t('general.heading')}</h3>

            <div className="space-y-6 max-w-md">
                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('general.language')}</label>
                    <select
                        value={i18n.language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        {SUPPORTED_LANGUAGES.map(lang => (
                            <option key={lang.code} value={lang.code}>{lang.label}</option>
                        ))}
                    </select>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{t('general.languageHint')}</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('general.projectTitle')}</label>
                    <input
                        type="text"
                        value={project.title}
                        onChange={(e) => onUpdate({ title: e.target.value })}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        placeholder={t('general.projectTitlePlaceholder')}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('general.startingScene')}</label>
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
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('general.description')}</label>
                    <textarea
                        value={project.description || ''}
                        onChange={(e) => onUpdate({ description: e.target.value })}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        placeholder={t('general.descriptionPlaceholder')}
                        rows={3}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('general.author')}</label>
                    <input
                        type="text"
                        value={project.author || ''}
                        onChange={(e) => onUpdate({ author: e.target.value })}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        placeholder={t('general.authorPlaceholder')}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('general.projectVersion')}</label>
                    <input
                        type="text"
                        value={project.version || ''}
                        onChange={(e) => onUpdate({ version: e.target.value })}
                        className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        placeholder={t('general.projectVersionPlaceholder')}
                    />
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)]">
                    <h4 className="text-lg font-semibold text-white mb-4">{t('general.gameResolution')}</h4>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('general.preset')}</label>
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
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('general.width')}</label>
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
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('general.height')}</label>
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
                            {t('general.aspectRatio', { ratio: project.gameResolution?.aspectRatio || '16:9' })}
                        </div>
                    </div>
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)]">
                    <h4 className="text-lg font-semibold text-white mb-4">{t('general.stageBehavior')}</h4>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <label className="text-sm font-medium text-[var(--text-primary)]">{t('general.autoArrange')}</label>
                                <p className="text-xs text-[var(--text-secondary)]">{t('general.autoArrangeDesc')}</p>
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
                    <h4 className="text-lg font-semibold text-white mb-4">{t('general.defaultGameSettings')}</h4>
                    <p className="text-xs text-[var(--text-secondary)] mb-4">{t('general.defaultGameSettingsDesc')}</p>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('general.textSpeed', { value: project.ui?.defaultGameSettings?.textSpeed ?? 50 })}</label>
                            <RangeInput
                                min="1"
                                max="100"
                                value={project.ui?.defaultGameSettings?.textSpeed ?? 50}
                                onChange={(e) => updateGameSetting({ textSpeed: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                            <div className="flex justify-between text-xs text-[var(--text-secondary)] mt-1">
                                <span>{t('general.slow')}</span><span>{t('general.fast')}</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('general.musicVolume', { value: Math.round((project.ui?.defaultGameSettings?.musicVolume ?? 0.8) * 100) })}</label>
                            <RangeInput
                                min="0"
                                max="100"
                                value={Math.round((project.ui?.defaultGameSettings?.musicVolume ?? 0.8) * 100)}
                                onChange={(e) => updateGameSetting({ musicVolume: parseInt(e.target.value) / 100 })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('general.sfxVolume', { value: Math.round((project.ui?.defaultGameSettings?.sfxVolume ?? 0.8) * 100) })}</label>
                            <RangeInput
                                min="0"
                                max="100"
                                value={Math.round((project.ui?.defaultGameSettings?.sfxVolume ?? 0.8) * 100)}
                                onChange={(e) => updateGameSetting({ sfxVolume: parseInt(e.target.value) / 100 })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('general.voiceVolume', { value: Math.round((project.ui?.defaultGameSettings?.voiceVolume ?? 0.8) * 100) })}</label>
                            <RangeInput
                                min="0"
                                max="100"
                                value={Math.round((project.ui?.defaultGameSettings?.voiceVolume ?? 0.8) * 100)}
                                onChange={(e) => updateGameSetting({ voiceVolume: parseInt(e.target.value) / 100 })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('general.ambientVolume', { value: Math.round((project.ui?.defaultGameSettings?.ambientVolume ?? 0.8) * 100) })}</label>
                            <RangeInput
                                min="0"
                                max="100"
                                value={Math.round((project.ui?.defaultGameSettings?.ambientVolume ?? 0.8) * 100)}
                                onChange={(e) => updateGameSetting({ ambientVolume: parseInt(e.target.value) / 100 })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('general.autoAdvanceDelay', { value: project.ui?.defaultGameSettings?.autoAdvanceDelay ?? 3 })}</label>
                            <RangeInput
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
                                <label className="text-sm font-medium text-[var(--text-primary)]">{t('general.enableSkip')}</label>
                                <p className="text-xs text-[var(--text-secondary)]">{t('general.enableSkipDesc')}</p>
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
                                <label className="text-sm font-medium text-[var(--text-primary)]">{t('general.autoAdvance')}</label>
                                <p className="text-xs text-[var(--text-secondary)]">{t('general.autoAdvanceDesc')}</p>
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
                    <h4 className="text-lg font-semibold text-white mb-4">{t('general.projectSummary')}</h4>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { label: t('general.summary.scenes'), value: Object.keys(project.scenes || {}).length },
                            { label: t('general.summary.characters'), value: Object.keys(project.characters || {}).length },
                            { label: t('general.summary.variables'), value: Object.keys(project.variables || {}).length },
                            { label: t('general.summary.backgrounds'), value: Object.keys(project.backgrounds || {}).length },
                            { label: t('general.summary.images'), value: Object.keys(project.images || {}).length },
                            { label: t('general.summary.audioFiles'), value: Object.keys(project.audio || {}).length },
                            { label: t('general.summary.uiScreens'), value: Object.keys(project.uiScreens || {}).length },
                            { label: t('general.summary.totalEvents'), value: Object.values(project.scenes || {}).reduce((sum: number, s: any) => sum + (s.commands?.length || 0), 0) },
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
                <ColorInput value={colorValue} onChange={v => onColorChange(v)} />
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[var(--text-secondary)]">Opacity</span>
                        <span className="text-xs text-[var(--text-secondary)]">{opacityValue}%</span>
                    </div>
                    <RangeInput
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
                        <RangeInput
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
                            <RangeInput
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
                            <RangeInput
                                min="0"
                                max="200"
                                value={project.ui.dialogueBoxBottomMargin ?? 20}
                                onChange={(e) => onUpdate({ dialogueBoxBottomMargin: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Inner Padding ({project.ui.dialogueBoxPadding ?? 20}px)</label>
                            <RangeInput
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
                                <RangeInput
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
                            <RangeInput
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
                            <RangeInput
                                min="0"
                                max="30"
                                value={project.ui.nameboxPadding ?? 8}
                                onChange={(e) => onUpdate({ nameboxPadding: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Horizontal Padding ({project.ui.nameboxHorizontalPadding ?? 14}px)</label>
                            <RangeInput
                                min="0"
                                max="40"
                                value={project.ui.nameboxHorizontalPadding ?? 14}
                                onChange={(e) => onUpdate({ nameboxHorizontalPadding: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Corner Radius ({project.ui.nameboxBorderRadius ?? 6}px)</label>
                            <RangeInput
                                min="0"
                                max="20"
                                value={project.ui.nameboxBorderRadius ?? 6}
                                onChange={(e) => onUpdate({ nameboxBorderRadius: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Horizontal Offset ({project.ui.nameboxOffsetX ?? 20}px)</label>
                            <RangeInput
                                min="0"
                                max="200"
                                value={project.ui.nameboxOffsetX ?? 20}
                                onChange={(e) => onUpdate({ nameboxOffsetX: parseInt(e.target.value) })}
                                className="w-full accent-[var(--accent-lavender)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Gap Above Dialogue Box ({project.ui.nameboxOffsetY ?? 0}px)</label>
                            <RangeInput
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
                        <RangeInput
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
                            <RangeInput
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
                                <RangeInput
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
                            <RangeInput
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
                            <ColorInput value={project.ui.choiceHoverColor ?? '#334155'} onChange={v => onUpdate({ choiceHoverColor: v })} />
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
                                <RangeInput
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
                            <RangeInput
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
                                <RangeInput
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
                            <RangeInput
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
                                onChange={(e) => onUpdate({
                                    quickMenuPosition: e.target.value as any,
                                    // Clear explicit drag-set coordinates so the new preset's defaults take effect.
                                    // Otherwise saved X/Y/W/H from a prior drag override the preset and nothing visibly changes.
                                    quickMenuX: undefined,
                                    quickMenuY: undefined,
                                    quickMenuWidth: undefined,
                                    quickMenuHeight: undefined,
                                })}
                                className="w-full bg-[var(--bg-primary)] text-white p-3 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                            >
                                <option value="above-dialogue">Above Dialogue Box</option>
                                <option value="top-right">Top Right</option>
                                <option value="top-left">Top Left</option>
                                <option value="bottom-right">Bottom Right (pushes dialogue up)</option>
                                <option value="bottom-left">Bottom Left (pushes dialogue up)</option>
                                <option value="hidden">Hidden</option>
                            </select>
                            {(project.ui.quickMenuX !== undefined || project.ui.quickMenuY !== undefined || project.ui.quickMenuWidth !== undefined || project.ui.quickMenuHeight !== undefined) && (
                                <button
                                    type="button"
                                    onClick={() => onUpdate({ quickMenuX: undefined, quickMenuY: undefined, quickMenuWidth: undefined, quickMenuHeight: undefined })}
                                    className="mt-2 text-xs px-3 py-1.5 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-default)] text-[var(--text-secondary)]"
                                    title="Discard custom drag position and snap the Quick Menu back to the selected preset."
                                >
                                    Reset to Preset Position
                                </button>
                            )}
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
                                    <RangeInput
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
    const { t } = useTranslation('settings');
    const toast = useToast();

    const projectFontsArray = Object.values((project as any).fonts || {}) as VNProjectFont[];
    
    const addProjectFont = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.ttf,.otf,font/ttf,font/otf';
        input.onchange = async (e: any) => {
            const file: File | undefined = e.target?.files?.[0];
            if (!file) return;

            // Family names must be CSS-safe: dots/parentheses make new FontFace() THROW, so a
            // font registered under such a name silently never loads (all its text falls back).
            const baseName = sanitizeFontFamily(file.name.replace(/\.(ttf|otf)$/i, ''));
            if (file.size > 20 * 1024 * 1024) {
                toast.warning(t('fonts.sizeWarning', 'This font is very large ({{mb}} MB) — it will make your project file much bigger and saving slower. A subsetted version of the font would work better.', { mb: Math.round(file.size / 1024 / 1024) }));
            }
            const complexity = analyzeFontComplexity(await file.arrayBuffer());
            if (complexity?.tooComplex && rendererFreezesOnComplexFonts()) {
                toast.error(t('fonts.tooComplex', "This font can't be used — its letters are drawn with extremely detailed outlines (about {{kb}} KB per letter) that would freeze the app. If the font has a simpler version, use that one.", { kb: Math.round(complexity.avgGlyphBytes / 1024) }));
                return;
            }
            const dataUrl = await fileToBase64(file);

            const newId = `font-${Math.random().toString(36).substring(2, 9)}` as VNID;
            const existingFamilies = new Set(
                Object.values((project as any).fonts || {}).map((f: any) => (f?.fontFamily || '').toLowerCase())
            );
            let fontFamily = baseName;
            for (let n = 2; existingFamilies.has(fontFamily.toLowerCase()); n++) {
                fontFamily = `${baseName}-${n}`;
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
            
            // Load the font into the document immediately (deduped — the editor's font effect
            // will also see this font and must not re-parse it).
            await loadFontOnce(fontFamily, dataUrl);
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
            <h3 className="text-xl font-bold text-white mb-6">{t('fonts.heading')}</h3>

            {/* Project Font Library */}
            <div className="border border-[var(--border-subtle)] rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold text-white">{t('fonts.library')}</h4>
                    <button
                        onClick={addProjectFont}
                        className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded font-medium transition-colors"
                    >
                        {t('fonts.upload')}
                    </button>
                </div>

                {projectFontsArray.length === 0 ? (
                    <div className="text-[var(--text-secondary)] text-sm bg-[var(--bg-primary)]/50 p-4 rounded">
                        {t('fonts.empty')}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {projectFontsArray.map((f) => (
                            <div key={f.id} className="flex items-center justify-between bg-[var(--bg-primary)]/50 border border-[var(--border-default)] rounded p-3">
                                <div className="min-w-0 flex-1">
                                    <div className="text-white font-medium" style={{ fontFamily: cssFontFamily(f.fontFamily) }}>
                                        {f.name}
                                    </div>
                                    <div className="text-xs text-[var(--text-secondary)]">{f.fontFamily}</div>
                                </div>
                                <button
                                    onClick={() => deleteProjectFont(f.id)}
                                    className="ml-4 text-red-400 hover:text-red-300 p-2 hover:bg-red-900/30 rounded transition-colors"
                                    title={t('fonts.deleteFont')}
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
                    <Trans i18nKey="fonts.note" t={t} components={{ b: <strong className="text-white" /> }} />
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
    const { t } = useTranslation('settings');
    const allScreens = Object.values(project.uiScreens || {}) as any[];

    const screenSlots: { key: keyof VNProjectUI; label: string; description: string }[] = [
        { key: 'titleScreenId', label: t('screens.slots.titleScreen'), description: t('screens.slots.titleScreenDesc') },
        { key: 'settingsScreenId', label: t('screens.slots.settingsScreen'), description: t('screens.slots.settingsScreenDesc') },
        { key: 'saveScreenId', label: t('screens.slots.saveScreen'), description: t('screens.slots.saveScreenDesc') },
        { key: 'loadScreenId', label: t('screens.slots.loadScreen'), description: t('screens.slots.loadScreenDesc') },
        { key: 'pauseScreenId', label: t('screens.slots.pauseScreen'), description: t('screens.slots.pauseScreenDesc') },
        // Game HUD is now set per-screen in the screen's "Overlay behavior" properties (the
        // "Use as game HUD" toggle), alongside the other overlay settings.
    ];

    return (
        <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-2">{t('screens.heading')}</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
                {t('screens.intro')}
            </p>

            {allScreens.length === 0 && (
                <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <p className="text-sm text-amber-300 font-medium mb-1">{t('screens.noScreensTitle')}</p>
                    <p className="text-xs text-amber-300/70">
                        {t('screens.noScreensDesc')}
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
                            <option value="">{t('screens.none')}</option>
                            {allScreens.map((screen: any) => (
                                <option key={screen.id} value={screen.id}>
                                    {screen.name}
                                </option>
                            ))}
                        </select>
                        {(project.ui[key] as string) && !allScreens.find((s: any) => s.id === project.ui[key]) && (
                            <p className="mt-1 text-xs text-amber-400">{t('screens.missing')}</p>
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
    const { t } = useTranslation('settings');
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
        ...allImages.map((img) => ({ id: img.id, name: img.name, type: t('cgGallery.typeImage') })),
        ...allBackgrounds.map((bg) => ({ id: bg.id, name: bg.name, type: t('cgGallery.typeBackground') })),
    ];

    const booleanVariables = Object.values(project.variables || {}).filter((v: any) => v.type === 'boolean') as { id: string; name: string; type: string }[];

    return (
        <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-2">{t('cgGallery.heading')}</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
                {t('cgGallery.intro')}
            </p>

            {/* Gallery-Level Settings */}
            <div className="space-y-4 max-w-lg mb-8">
                <h4 className="text-sm font-semibold text-sky-400 uppercase tracking-wider">{t('cgGallery.gallerySettings')}</h4>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('cgGallery.columns')}</label>
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
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('cgGallery.unlockScope')}</label>
                        <select
                            value={gallery.unlockScope}
                            onChange={(e) => updateGallery({ unlockScope: e.target.value as 'global' | 'per-save' })}
                            className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        >
                            <option value="global">{t('cgGallery.scopeGlobal')}</option>
                            <option value="per-save">{t('cgGallery.scopePerSave')}</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('cgGallery.lockedPlaceholder')}</label>
                    <select
                        value={gallery.lockedPlaceholderAssetId ?? ''}
                        onChange={(e) => updateGallery({ lockedPlaceholderAssetId: (e.target.value || null) as VNID | null })}
                        className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="">{t('cgGallery.lockedDefault')}</option>
                        {allAssets.map((a) => (
                            <option key={a.id} value={a.id}>[{a.type}] {a.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('cgGallery.viewerBgColor')}</label>
                    <div className="flex gap-2 items-center">
                        <ColorInput value={gallery.viewerBackgroundColor || '#000000'} onChange={v => updateGallery({ viewerBackgroundColor: v })} />
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
                <h4 className="text-sm font-semibold text-sky-400 uppercase tracking-wider">{t('cgGallery.entriesHeading', { count: entries.length })}</h4>
                <button
                    onClick={addEntry}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-md transition-colors"
                >
                    {t('cgGallery.addEntry')}
                </button>
            </div>

            {entries.length === 0 ? (
                <div className="text-center py-12 bg-[var(--bg-primary)]/50 rounded-lg border border-[var(--border-subtle)] border-dashed">
                    <p className="text-[var(--text-secondary)] mb-2">{t('cgGallery.noEntries')}</p>
                    <p className="text-xs text-[var(--text-muted)]">{t('cgGallery.noEntriesHint')}</p>
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
                                        {assetInfo ? `${assetInfo.type}: ${assetInfo.name}` : t('cgGallery.noAsset')}
                                    </span>
                                    {entry.unlockable && (
                                        <span className="text-xs bg-amber-600/30 text-amber-400 px-2 py-0.5 rounded flex items-center gap-1"><LockClosedIcon className="w-3 h-3" /> {t('cgGallery.unlockable')}</span>
                                    )}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeEntry(entry.id as VNID); }}
                                        className="text-red-400 hover:text-red-300 p-1"
                                        title={t('cgGallery.removeEntry')}
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                    <span className={`text-[var(--text-secondary)] transition-transform ${isEditing ? 'rotate-180' : ''}`}><ChevronDownIcon className="w-4 h-4" /></span>
                                </div>

                                {/* Entry Details (expanded) */}
                                {isEditing && (
                                    <div className="px-4 pb-4 pt-2 border-t border-[var(--border-subtle)] space-y-3">
                                        <div>
                                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{t('cgGallery.name')}</label>
                                            <input
                                                type="text"
                                                value={entry.name}
                                                onChange={(e) => updateEntry(entry.id as VNID, { name: e.target.value })}
                                                className="w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{t('cgGallery.asset')}</label>
                                                <select
                                                    value={entry.assetId ?? ''}
                                                    onChange={(e) => updateEntry(entry.id as VNID, { assetId: (e.target.value || null) as VNID | null })}
                                                    className="w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                                                >
                                                    <option value="">{t('cgGallery.selectAsset')}</option>
                                                    {allImages.length > 0 && (
                                                        <optgroup label={t('cgGallery.images')}>
                                                            {allImages.map((img) => (
                                                                <option key={img.id} value={img.id}>{img.name}</option>
                                                            ))}
                                                        </optgroup>
                                                    )}
                                                    {allBackgrounds.length > 0 && (
                                                        <optgroup label={t('cgGallery.backgrounds')}>
                                                            {allBackgrounds.map((bg) => (
                                                                <option key={bg.id} value={bg.id}>{bg.name}</option>
                                                            ))}
                                                        </optgroup>
                                                    )}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{t('cgGallery.thumbnailOverride')}</label>
                                                <select
                                                    value={entry.thumbnailAssetId ?? ''}
                                                    onChange={(e) => updateEntry(entry.id as VNID, { thumbnailAssetId: (e.target.value || null) as VNID | null })}
                                                    className="w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                                                >
                                                    <option value="">{t('cgGallery.sameAsAsset')}</option>
                                                    {allAssets.map((a) => (
                                                        <option key={a.id} value={a.id}>[{a.type}] {a.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{t('cgGallery.category')}</label>
                                                <input
                                                    type="text"
                                                    value={entry.category ?? ''}
                                                    onChange={(e) => updateEntry(entry.id as VNID, { category: e.target.value || undefined })}
                                                    className="w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                                                    placeholder={t('cgGallery.categoryPlaceholder')}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{t('cgGallery.sortOrder')}</label>
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
                                                <label className="text-sm text-[var(--text-primary)]">{t('cgGallery.requiresUnlocking')}</label>
                                            </div>

                                            {entry.unlockable && (
                                                <div>
                                                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{t('cgGallery.unlockVariable')}</label>
                                                    <select
                                                        value={entry.unlockVariableId ?? ''}
                                                        onChange={(e) => updateEntry(entry.id as VNID, { unlockVariableId: (e.target.value || null) as VNID | null })}
                                                        className="w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                                                    >
                                                        <option value="">{t('cgGallery.selectVariable')}</option>
                                                        {booleanVariables.map((v) => (
                                                            <option key={v.id} value={v.id}>{v.name}</option>
                                                        ))}
                                                    </select>
                                                    {booleanVariables.length === 0 && (
                                                        <p className="text-xs text-amber-400 mt-1">
                                                            {t('cgGallery.noBooleanVars')}
                                                        </p>
                                                    )}
                                                    {entry.unlockVariableId && !booleanVariables.find((v) => v.id === entry.unlockVariableId) && (
                                                        <p className="text-xs text-amber-400 mt-1">{t('cgGallery.varNotFound')}</p>
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

interface MusicGallerySettingsProps {
    project: VNProject;
    onUpdate: (updates: Partial<VNProject>) => void;
}

const MusicGallerySettings: React.FC<MusicGallerySettingsProps> = ({ project, onUpdate }) => {
    const { t } = useTranslation('settings');
    const { dispatch } = useProject();
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

    const gallery: MusicGalleryConfig = project.musicGallery ?? { entries: {} };

    const updateGallery = (updates: Partial<MusicGalleryConfig>) => {
        onUpdate({ musicGallery: { ...gallery, ...updates } });
    };

    const entries = Object.values(gallery.entries).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const addEntry = () => {
        const id = `song-${Math.random().toString(36).substring(2, 9)}` as VNID;
        const newEntry: MusicGalleryEntry = {
            id,
            name: `${t('musicGallery.defaultSongName')} ${entries.length + 1}`,
            audioId: null,
            unlockable: false,
            order: entries.length,
        };
        updateGallery({ entries: { ...gallery.entries, [id]: newEntry } });
        setEditingEntryId(id);
    };

    const updateEntry = (id: VNID, updates: Partial<MusicGalleryEntry>) => {
        const existing = gallery.entries[id];
        if (!existing) return;
        updateGallery({ entries: { ...gallery.entries, [id]: { ...existing, ...updates } } });
    };

    const removeEntry = (id: VNID) => {
        const { [id]: _removed, ...rest } = gallery.entries;
        updateGallery({ entries: rest });
        if (editingEntryId === id) setEditingEntryId(null);
    };

    /** One-click unlock switch: a PERSISTENT boolean so unlocks survive New Game + restarts
     *  (same rule as the CG Gallery wizard). Created + assigned in one go. */
    const createUnlockVariable = (entry: MusicGalleryEntry) => {
        const varId = `var-song-unlock-${Math.random().toString(36).substring(2, 9)}` as VNID;
        dispatch({
            type: 'ADD_VARIABLE',
            payload: {
                id: varId,
                name: `Song Unlock: ${entry.name}`,
                type: 'boolean',
                defaultValue: false,
                scope: 'persistent',
            },
        });
        updateEntry(entry.id as VNID, { unlockVariableId: varId });
    };

    const allAudio = Object.values(project.audio || {}) as { id: string; name: string }[];
    const allImages = Object.values(project.images || {}) as { id: string; name: string }[];
    const allBackgrounds = Object.values(project.backgrounds || {}) as { id: string; name: string }[];
    const artworkOptions = (
        <>
            {allImages.length > 0 && (
                <optgroup label={t('cgGallery.images')}>
                    {allImages.map((img) => (
                        <option key={img.id} value={img.id}>{img.name}</option>
                    ))}
                </optgroup>
            )}
            {allBackgrounds.length > 0 && (
                <optgroup label={t('cgGallery.backgrounds')}>
                    {allBackgrounds.map((bg) => (
                        <option key={bg.id} value={bg.id}>{bg.name}</option>
                    ))}
                </optgroup>
            )}
        </>
    );

    const booleanVariables = Object.values(project.variables || {}).filter((v: any) => v.type === 'boolean') as { id: string; name: string; type: string }[];
    const inputCls = "w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]";

    return (
        <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-2">{t('musicGallery.heading')}</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
                {t('musicGallery.intro')}
            </p>

            {/* Gallery-Level Settings */}
            <div className="space-y-4 max-w-lg mb-8">
                <h4 className="text-sm font-semibold text-sky-400 uppercase tracking-wider">{t('musicGallery.gallerySettings')}</h4>
                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('musicGallery.defaultArtwork')}</label>
                    <select
                        value={gallery.defaultArtworkAssetId ?? ''}
                        onChange={(e) => updateGallery({ defaultArtworkAssetId: (e.target.value || null) as VNID | null })}
                        className={inputCls}
                    >
                        <option value="">{t('musicGallery.noDefaultArtwork')}</option>
                        {artworkOptions}
                    </select>
                    <p className="text-xs text-[var(--text-muted)] mt-1">{t('musicGallery.defaultArtworkHint')}</p>
                </div>
            </div>

            {/* Songs */}
            <div className="mb-4 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-sky-400 uppercase tracking-wider">{t('musicGallery.songsHeading', { count: entries.length })}</h4>
                <button
                    onClick={addEntry}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-md transition-colors"
                >
                    {t('musicGallery.addSong')}
                </button>
            </div>

            {entries.length === 0 ? (
                <div className="text-center py-12 bg-[var(--bg-primary)]/50 rounded-lg border border-[var(--border-subtle)] border-dashed">
                    <p className="text-[var(--text-secondary)] mb-2">{t('musicGallery.noSongs')}</p>
                    <p className="text-xs text-[var(--text-muted)]">{t('musicGallery.noSongsHint')}</p>
                </div>
            ) : (
                <div className="space-y-2 max-w-2xl">
                    {entries.map((entry) => {
                        const isEditing = editingEntryId === entry.id;
                        const audioInfo = allAudio.find((a) => a.id === entry.audioId);

                        return (
                            <div
                                key={entry.id}
                                className={`bg-[var(--bg-primary)] rounded-md border ${isEditing ? 'border-sky-500' : 'border-[var(--border-subtle)]'} overflow-hidden`}
                            >
                                <div
                                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-750"
                                    onClick={() => setEditingEntryId(isEditing ? null : entry.id)}
                                >
                                    <span className="text-[var(--text-muted)] text-xs font-mono w-6 text-center">{(entry.order ?? 0) + 1}</span>
                                    <span className="flex-1 text-white text-sm font-medium truncate">{entry.name}</span>
                                    <span className="text-xs text-[var(--text-secondary)]">
                                        {audioInfo ? audioInfo.name : t('musicGallery.noAudio')}
                                    </span>
                                    {entry.unlockable && (
                                        <span className="text-xs bg-amber-600/30 text-amber-400 px-2 py-0.5 rounded flex items-center gap-1"><LockClosedIcon className="w-3 h-3" /> {t('cgGallery.unlockable')}</span>
                                    )}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeEntry(entry.id as VNID); }}
                                        className="text-red-400 hover:text-red-300 p-1"
                                        title={t('musicGallery.removeSong')}
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                    <span className={`text-[var(--text-secondary)] transition-transform ${isEditing ? 'rotate-180' : ''}`}><ChevronDownIcon className="w-4 h-4" /></span>
                                </div>

                                {isEditing && (
                                    <div className="px-4 pb-4 pt-2 border-t border-[var(--border-subtle)] space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{t('musicGallery.songTitle')}</label>
                                                <input
                                                    type="text"
                                                    value={entry.name}
                                                    onChange={(e) => updateEntry(entry.id as VNID, { name: e.target.value })}
                                                    className={inputCls}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{t('musicGallery.artist')}</label>
                                                <input
                                                    type="text"
                                                    value={entry.artist ?? ''}
                                                    onChange={(e) => updateEntry(entry.id as VNID, { artist: e.target.value || undefined })}
                                                    className={inputCls}
                                                    placeholder={t('musicGallery.artistPlaceholder')}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{t('musicGallery.song')}</label>
                                                <select
                                                    value={entry.audioId ?? ''}
                                                    onChange={(e) => updateEntry(entry.id as VNID, { audioId: (e.target.value || null) as VNID | null })}
                                                    className={inputCls}
                                                >
                                                    <option value="">{t('musicGallery.selectSong')}</option>
                                                    {allAudio.map((a) => (
                                                        <option key={a.id} value={a.id}>{a.name}</option>
                                                    ))}
                                                </select>
                                                {allAudio.length === 0 && (
                                                    <p className="text-xs text-amber-400 mt-1">{t('musicGallery.noAudioAssets')}</p>
                                                )}
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{t('musicGallery.artwork')}</label>
                                                <select
                                                    value={entry.artworkAssetId ?? ''}
                                                    onChange={(e) => updateEntry(entry.id as VNID, { artworkAssetId: (e.target.value || null) as VNID | null })}
                                                    className={inputCls}
                                                >
                                                    <option value="">{t('musicGallery.useDefaultArtwork')}</option>
                                                    {artworkOptions}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{t('cgGallery.category')}</label>
                                                <input
                                                    type="text"
                                                    value={entry.category ?? ''}
                                                    onChange={(e) => updateEntry(entry.id as VNID, { category: e.target.value || undefined })}
                                                    className={inputCls}
                                                    placeholder={t('musicGallery.categoryPlaceholder')}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{t('cgGallery.sortOrder')}</label>
                                                <input
                                                    type="number"
                                                    value={entry.order ?? 0}
                                                    onChange={(e) => updateEntry(entry.id as VNID, { order: parseInt(e.target.value, 10) || 0 })}
                                                    className={inputCls}
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
                                                <label className="text-sm text-[var(--text-primary)]">{t('musicGallery.requiresUnlocking')}</label>
                                            </div>

                                            {entry.unlockable && (
                                                <div>
                                                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{t('musicGallery.unlockVariable')}</label>
                                                    <div className="flex gap-2">
                                                        <select
                                                            value={entry.unlockVariableId ?? ''}
                                                            onChange={(e) => updateEntry(entry.id as VNID, { unlockVariableId: (e.target.value || null) as VNID | null })}
                                                            className={inputCls}
                                                        >
                                                            <option value="">{t('cgGallery.selectVariable')}</option>
                                                            {booleanVariables.map((v) => (
                                                                <option key={v.id} value={v.id}>{v.name}</option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            onClick={() => createUnlockVariable(entry)}
                                                            className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs rounded whitespace-nowrap"
                                                            title={t('musicGallery.createUnlockHint')}
                                                        >
                                                            {t('musicGallery.createUnlock')}
                                                        </button>
                                                    </div>
                                                    {entry.unlockVariableId && !booleanVariables.find((v) => v.id === entry.unlockVariableId) && (
                                                        <p className="text-xs text-amber-400 mt-1">{t('cgGallery.varNotFound')}</p>
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
    const { t } = useTranslation('settings');
    const a11yManager = AccessibilityManager.getInstance();
    const [preferences, setPreferences] = useState<A11yPreferences>(a11yManager.getPreferences());

    const handleToggle = (key: keyof A11yPreferences) => {
        const newValue = !preferences[key];
        a11yManager.updatePreference(key, newValue);
        setPreferences(a11yManager.getPreferences());
    };

    const toggleItems: { key: keyof A11yPreferences; label: string; description: string }[] = [
        { key: 'highContrast', label: t('accessibility.items.highContrast'), description: t('accessibility.items.highContrastDesc') },
        { key: 'reducedMotion', label: t('accessibility.items.reducedMotion'), description: t('accessibility.items.reducedMotionDesc') },
        { key: 'largeText', label: t('accessibility.items.largeText'), description: t('accessibility.items.largeTextDesc') },
        { key: 'keyboardOnly', label: t('accessibility.items.keyboardOnly'), description: t('accessibility.items.keyboardOnlyDesc') },
        { key: 'screenReaderMode', label: t('accessibility.items.screenReaderMode'), description: t('accessibility.items.screenReaderModeDesc') },
    ];

    return (
        <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-2">{t('accessibility.heading')}</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
                <Trans i18nKey="accessibility.intro" t={t} components={{ b: <strong className="text-[var(--text-primary)]" /> }} />
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
                <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">{t('accessibility.shortcuts')}</h4>
                <div className="space-y-1 text-xs text-[var(--text-secondary)]">
                    <div className="flex justify-between"><span>{t('accessibility.undo')}</span><kbd className="bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded text-[var(--text-primary)] font-mono">Ctrl+Z</kbd></div>
                    <div className="flex justify-between"><span>{t('accessibility.redo')}</span><kbd className="bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded text-[var(--text-primary)] font-mono">Ctrl+Y</kbd></div>
                    <div className="flex justify-between"><span>{t('accessibility.saveProject')}</span><kbd className="bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded text-[var(--text-primary)] font-mono">Ctrl+S</kbd></div>
                    <div className="flex justify-between"><span>{t('accessibility.commandPalette')}</span><kbd className="bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded text-[var(--text-primary)] font-mono">Ctrl+K</kbd></div>
                </div>
            </div>
        </div>
    );
};

const AnalyticsSettings: React.FC = () => {
    const { t } = useTranslation('settings');
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
        const known = t(`analytics.actions.${raw}`, { defaultValue: '' });
        if (known) return known;
        return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).toLowerCase().replace(/^\w/, c => c.toUpperCase());
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
                <h3 className="text-xl font-bold text-white">{t('analytics.heading')}</h3>
                <div className="flex items-center gap-2">
                    {!showClearConfirm ? (
                        <button
                            onClick={() => setShowClearConfirm(true)}
                            className="px-3 py-1.5 text-xs rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-red-400 hover:border-red-500/50 transition-colors"
                        >
                            {t('analytics.clearData')}
                        </button>
                    ) : (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleClear}
                                className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 transition-colors"
                            >
                                {t('analytics.confirm')}
                            </button>
                            <button
                                onClick={() => setShowClearConfirm(false)}
                                className="px-2 py-1 text-xs rounded bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                            >
                                {t('analytics.cancel')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
                {t('analytics.intro')}
            </p>

            <div className="space-y-6 max-w-lg">
                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)] text-center">
                        <span className="block text-xs text-[var(--text-secondary)] mb-1">{t('analytics.sessionTime')}</span>
                        <span className="text-xl font-bold text-white">{formatSessionDuration(sessionElapsed)}</span>
                    </div>
                    <div className="p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)] text-center">
                        <span className="block text-xs text-[var(--text-secondary)] mb-1">{t('analytics.totalActions')}</span>
                        <span className="text-xl font-bold text-white">{stats.totalActions}</span>
                    </div>
                    <div className="p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)] text-center">
                        <span className="block text-xs text-[var(--text-secondary)] mb-1">{t('analytics.actionsPerMin')}</span>
                        <span className="text-xl font-bold text-white">{apm}</span>
                    </div>
                </div>

                {/* Most Common Actions — bar chart style */}
                <div className="p-4 bg-[var(--bg-primary)] rounded-md border border-[var(--border-subtle)]">
                    <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">{t('analytics.mostUsed')}</h4>
                    {stats.mostCommonActions.length === 0 ? (
                        <p className="text-xs text-[var(--text-secondary)]">{t('analytics.noActions')}</p>
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
                        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">{t('analytics.repeatedPatterns')}</h4>
                        <p className="text-xs text-[var(--text-secondary)] mb-2">{t('analytics.patternsDesc')}</p>
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
                                    <span className="text-xs text-[var(--text-secondary)] mt-1 block">{t('analytics.repeated', { count: pattern.frequency })}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Optimization Suggestions */}
                {suggestions.length > 0 && (
                    <div className="p-4 bg-amber-500/10 rounded-md border border-amber-500/30">
                        <h4 className="text-sm font-medium text-amber-300 mb-2">{t('analytics.optimizationSuggestions')}</h4>
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
                        <span>{t('analytics.avgTime', { time: formatDuration(stats.averageActionTime) })}</span>
                        <span>{t('analytics.dataResets')}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Day / Night cycle settings (time-of-day color grade)
// ─────────────────────────────────────────────────────────────────────────────
const GradeLayerEditor: React.FC<{ label: string; layer: VNGradeLayer; onChange: (l: VNGradeLayer) => void }> = ({ label, layer, onChange }) => {
    const patch = (u: Partial<VNGradeLayer>) => onChange({ ...layer, ...u });
    return (
        <div className="border border-[var(--border-subtle)] rounded-md p-2 flex-1 min-w-0">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                <input type="checkbox" checked={layer.enabled} onChange={e => patch({ enabled: e.target.checked })} className="h-3.5 w-3.5" />
                {label}
            </label>
            {layer.enabled && <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--text-muted)] w-16">Tint</span>
                    <ColorInput value={layer.tint} onChange={(v: string) => patch({ tint: v })} />
                </div>
                <div>
                    <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Tint strength ({Math.round(layer.tintOpacity * 100)}%)</div>
                    <RangeInput min={0} max={1} step={0.01} value={layer.tintOpacity} onChange={(e: any) => patch({ tintOpacity: parseFloat(e.target.value) })} className="w-full" />
                </div>
                <div>
                    <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Brightness ({layer.brightness.toFixed(2)}×)</div>
                    <RangeInput min={0} max={2} step={0.01} value={layer.brightness} onChange={(e: any) => patch({ brightness: parseFloat(e.target.value) })} className="w-full" />
                </div>
                <div>
                    <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Saturation ({layer.saturation.toFixed(2)}×)</div>
                    <RangeInput min={0} max={2} step={0.01} value={layer.saturation} onChange={(e: any) => patch({ saturation: parseFloat(e.target.value) })} className="w-full" />
                </div>
            </div>}
        </div>
    );
};

const DayNightSettings: React.FC<{ project: VNProject; onUpdate: (u: Partial<VNProject>) => void }> = ({ project, onUpdate }) => {
    const { t } = useTranslation('settings');
    const cycle = project.dayNightCycle;
    const enabled = !!cycle?.enabled;

    const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dn_${Date.now()}_${Math.floor(Math.random() * 1e6)}`);

    const setCycle = (c: VNDayNightCycle) => onUpdate({ dayNightCycle: c });

    const toggleEnabled = (on: boolean) => {
        if (!on) { if (cycle) setCycle({ ...cycle, enabled: false }); return; }
        // Turning on: seed a default cycle + a managed "Time of Day" number variable (0–24) the first time.
        const base = cycle ?? createDefaultDayNightCycle();
        let timeVariableId = base.timeVariableId;
        let variables = project.variables;
        if (!timeVariableId || !project.variables[timeVariableId]) {
            timeVariableId = newId();
            const v: VNVariable = { id: timeVariableId, name: 'Time of Day', type: 'number', defaultValue: 8, scope: 'global', min: 0, max: 24, isInternal: true };
            variables = { ...project.variables, [timeVariableId]: v };
        }
        onUpdate({ dayNightCycle: { ...base, enabled: true, timeVariableId }, variables });
    };

    const updatePhase = (idx: number, u: Partial<VNDayNightPhase>) => {
        if (!cycle) return;
        const phases = cycle.phases.map((p, i) => i === idx ? { ...p, ...u } : p);
        setCycle({ ...cycle, phases });
    };
    const addPhase = () => {
        if (!cycle) return;
        const mk = (): VNGradeLayer => ({ enabled: true, tint: '#ffffff', tintOpacity: 0, brightness: 1, saturation: 1 });
        setCycle({ ...cycle, phases: [...cycle.phases, { id: newId(), name: 'Phase', atHour: 0, background: mk(), sprites: mk() }] });
    };
    const removePhase = (idx: number) => { if (cycle) setCycle({ ...cycle, phases: cycle.phases.filter((_, i) => i !== idx) }); };

    return (
        <div className="p-6 max-w-3xl">
            <h3 className="text-xl font-bold text-white mb-1">{t('sections.dayNight', 'Day / Night')}</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">{t('dayNight.intro', 'Shift scene colors with the time of day — warm mornings to cold nights. Use the “Set Time of Day” command (or button action) to change the time, or gate events on the time variable in conditions.')}</p>

            <label className="flex items-center gap-2 mb-4">
                <input type="checkbox" checked={enabled} onChange={e => toggleEnabled(e.target.checked)} className="h-4 w-4" />
                <span className="text-sm font-medium text-[var(--text-primary)]">{t('dayNight.enable', 'Enable day/night cycle')}</span>
            </label>

            {enabled && cycle && <>
                <div className="border-t border-[var(--border-subtle)] pt-3 mb-4">
                    <label className="flex items-center gap-2 mb-2">
                        <input type="checkbox" checked={!!cycle.autoAdvance?.enabled} onChange={e => setCycle({ ...cycle, autoAdvance: { secondsPerHour: cycle.autoAdvance?.secondsPerHour ?? 60, enabled: e.target.checked } })} className="h-4 w-4" />
                        <span className="text-sm text-[var(--text-primary)]">{t('dayNight.autoAdvance', 'Auto-advance the clock during play')}</span>
                    </label>
                    {cycle.autoAdvance?.enabled && (
                        <FormField label={t('dayNight.secondsPerHour', 'Real seconds per in-game hour')}>
                            <TextInput type="number" min="1" step="1" value={cycle.autoAdvance.secondsPerHour} onChange={e => setCycle({ ...cycle, autoAdvance: { enabled: true, secondsPerHour: Math.max(1, parseFloat(e.target.value) || 60) } })} />
                        </FormField>
                    )}
                </div>

                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">{t('dayNight.phases', 'Phases')}</h4>
                    <button onClick={addPhase} className="text-xs text-sky-400 hover:text-sky-300">+ {t('dayNight.addPhase', 'Add phase')}</button>
                </div>
                <div className="space-y-3">
                    {[...cycle.phases].sort((a, b) => a.atHour - b.atHour).map(p => {
                        const idx = cycle.phases.indexOf(p);
                        return (
                            <div key={p.id} className="border border-[var(--border-default)] rounded-lg p-3 bg-[var(--bg-primary)]/40">
                                <div className="flex items-center gap-2 mb-2">
                                    <TextInput value={p.name} onChange={e => updatePhase(idx, { name: e.target.value })} className="flex-1" />
                                    <label className="text-[10px] text-[var(--text-muted)]">{t('dayNight.atHour', 'at hour')}</label>
                                    <input type="number" min={0} max={24} step={0.5} value={p.atHour} onChange={e => updatePhase(idx, { atHour: Math.max(0, Math.min(24, parseFloat(e.target.value) || 0)) })} className="w-16 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-xs" />
                                    <button onClick={() => removePhase(idx)} title={t('dayNight.removePhase', 'Remove phase')} className="text-red-400 hover:text-red-300 p-1"><TrashIcon className="w-4 h-4" /></button>
                                </div>
                                <div className="flex gap-2">
                                    <GradeLayerEditor label={t('dayNight.background', 'Background')} layer={p.background} onChange={l => updatePhase(idx, { background: l })} />
                                    <GradeLayerEditor label={t('dayNight.sprites', 'Sprites')} layer={p.sprites} onChange={l => updatePhase(idx, { sprites: l })} />
                                </div>
                            </div>
                        );
                    })}
                </div>
                <p className="text-[10px] text-[var(--text-muted)] mt-3">{t('dayNight.sceneHint', 'Tip: a scene can pin a fixed time or opt out of grading in its Scene Settings. The time is the “Time of Day” variable — show it on a Meter or in {Time of Day} text, or use it in conditions.')}</p>
            </>}
        </div>
    );
};

export default SettingsManager;