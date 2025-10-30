import React, { useState } from 'react';
import { VNProject } from '../types/project';
import { VNProjectUI, VNFontSettings } from '../features/ui/types';
import { useProject } from '../contexts/ProjectContext';
import { Cog6ToothIcon, PhotoIcon, BookOpenIcon, MusicalNoteIcon } from './icons';

interface SettingsManagerProps {
    project: VNProject;
}

const SettingsManager: React.FC<SettingsManagerProps> = ({ project }) => {
    const { dispatch } = useProject();
    const [activeSection, setActiveSection] = useState<'general' | 'ui' | 'fonts' | 'screens'>('general');

    const updateUI = (updates: Partial<VNProjectUI>) => {
        console.log('[SettingsManager] updateUI called with:', updates);
        dispatch({ type: 'UPDATE_UI', payload: updates });
    };

    const updateProject = (updates: Partial<VNProject>) => {
        console.log('[SettingsManager] updateProject called with:', updates);
        dispatch({ type: 'UPDATE_PROJECT', payload: updates });
    };

    const sections = [
        { id: 'general' as const, name: 'General', icon: Cog6ToothIcon },
        { id: 'ui' as const, name: 'UI Assets', icon: PhotoIcon },
        { id: 'fonts' as const, name: 'Fonts', icon: BookOpenIcon },
        { id: 'screens' as const, name: 'Screens', icon: MusicalNoteIcon },
    ];

    return (
        <div className="flex h-full min-w-[900px] max-w-[900px] min-h-[700px] max-h-[700px] gap-4 p-4 overflow-hidden">
            {/* Settings Sidebar */}
            <div className="w-64 panel flex flex-col max-h-full">
                <div className="p-3 border-b-2 border-slate-700 flex-shrink-0">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <Cog6ToothIcon className="w-5 h-5 text-red-400" />
                        Settings
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">Configure project properties</p>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                    {sections.map(section => (
                        <button
                            key={section.id}
                            onClick={() => setActiveSection(section.id)}
                            className={`w-full flex items-center gap-2 p-2.5 rounded-lg text-sm text-left transition-all ${
                                activeSection === section.id
                                    ? 'bg-sky-500/20 border-2 border-sky-500/50 text-sky-300 shadow-lg scale-[1.02]'
                                    : 'hover:bg-slate-700 text-slate-300 border-2 border-transparent'
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
                    <GeneralSettings project={project} onUpdate={updateProject} />
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
            </div>
        </div>
    );
};

interface GeneralSettingsProps {
    project: VNProject;
    onUpdate: (updates: Partial<VNProject>) => void;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({ project, onUpdate }) => {
    return (
        <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-6">General Settings</h3>

            <div className="space-y-6 max-w-md">
                <div>
                    <label className="form-label">Project Title</label>
                    <input
                        type="text"
                        value={project.title}
                        onChange={(e) => onUpdate({ title: e.target.value })}
                        className="form-input"
                        placeholder="Enter project title"
                    />
                </div>

                <div>
                    <label className="form-label">Starting Scene</label>
                    <select
                        value={project.startSceneId}
                        onChange={(e) => onUpdate({ startSceneId: e.target.value })}
                        className="form-input"
                    >
                        {Object.values(project.scenes || {}).map((scene: any) => (
                            <option key={scene.id} value={scene.id}>
                                {scene.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t border-slate-700">
                    <div>
                        <span className="text-slate-400">Project ID:</span>
                        <span className="text-white ml-2 font-mono text-xs">{project.id}</span>
                    </div>
                    <div>
                        <span className="text-slate-400">Scenes:</span>
                        <span className="text-white ml-2">{Object.keys(project.scenes || {}).length}</span>
                    </div>
                    <div>
                        <span className="text-slate-400">Characters:</span>
                        <span className="text-white ml-2">{Object.keys(project.characters || {}).length}</span>
                    </div>
                    <div>
                        <span className="text-slate-400">Variables:</span>
                        <span className="text-white ml-2">{Object.keys(project.variables || {}).length}</span>
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

    console.log('[UIAssetsSettings] Rendering with images:', allImages.length, allImages.map(i => i.name));

    const getAssetName = (assetId: string | null, type: 'image' | 'video') => {
        if (!assetId) return 'None';
        const assets = type === 'image' ? allImages : Object.values(project.videos || {});
        const asset = assets.find(a => a.id === assetId);
        return asset ? asset.name : 'Unknown';
    };

    return (
        <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-6">UI Assets</h3>

            <div className="space-y-6 max-w-md">
                <div>
                    <label className="form-label">Dialogue Box Image</label>
                    <select
                        value={project.ui.dialogueBoxImage?.id || ''}
                        onChange={(e) => {
                            const assetId = e.target.value;
                            console.log('[UIAssetsSettings] Dialogue box selection changed:', assetId);
                            console.log('[UIAssetsSettings] Available images:', allImages.map(i => ({ id: i.id, name: i.name })));
                            const asset = assetId ? allImages.find(img => img.id === assetId) : null;
                            console.log('[UIAssetsSettings] Found asset:', asset);
                            onUpdate({
                                dialogueBoxImage: asset ? { type: 'image', id: asset.id } : null
                            });
                        }}
                        className="form-input"
                    >
                        <option value="">None</option>
                        {allImages.map(image => (
                            <option key={image.id} value={image.id}>
                                {image.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="form-label">Choice Button Image</label>
                    <select
                        value={project.ui.choiceButtonImage?.id || ''}
                        onChange={(e) => {
                            const assetId = e.target.value;
                            const asset = assetId ? allImages.find(img => img.id === assetId) : null;
                            onUpdate({
                                choiceButtonImage: asset ? { type: 'image', id: asset.id } : null
                            });
                        }}
                        className="form-input"
                    >
                        <option value="">None</option>
                        {allImages.map(image => (
                            <option key={image.id} value={image.id}>
                                {image.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
};

interface FontSettingsProps {
    project: VNProject;
    onUpdate: (updates: Partial<VNProjectUI>) => void;
}

const FontSettings: React.FC<FontSettingsProps> = ({ project, onUpdate }) => {
    const updateFont = (fontKey: keyof VNProjectUI, updates: Partial<VNFontSettings>) => {
        const currentFont = project.ui[fontKey] as VNFontSettings;
        onUpdate({ [fontKey]: { ...currentFont, ...updates } });
    };

    const FontEditor = ({ label, fontKey }: { label: string; fontKey: keyof VNProjectUI }) => {
        const font = project.ui[fontKey] as VNFontSettings;

        return (
            <div className="border border-slate-700 rounded-lg p-4">
                <h4 className="text-lg font-semibold text-white mb-4">{label}</h4>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Family</label>
                        <input
                            type="text"
                            value={font.family}
                            onChange={(e) => updateFont(fontKey, { family: e.target.value })}
                            className="form-input"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Size</label>
                        <input
                            type="number"
                            value={font.size}
                            onChange={(e) => updateFont(fontKey, { size: parseInt(e.target.value) })}
                            className="form-input"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Color</label>
                        <input
                            type="color"
                            value={font.color}
                            onChange={(e) => updateFont(fontKey, { color: e.target.value })}
                            className="form-input"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Weight</label>
                        <select
                            value={font.weight}
                            onChange={(e) => updateFont(fontKey, { weight: e.target.value as 'normal' | 'bold' })}
                            className="form-input"
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
                                className="rounded border-slate-600 text-sky-500 focus:ring-sky-500"
                            />
                            <span className="text-sm font-medium text-slate-300">Italic</span>
                        </label>
                    </div>
                </div>

                <div className="mt-4 p-3 bg-slate-900 rounded border border-slate-600">
                    <p
                        className="text-sm"
                        style={{
                            fontFamily: font.family,
                            fontSize: `${font.size}px`,
                            color: font.color,
                            fontWeight: font.weight,
                            fontStyle: font.italic ? 'italic' : 'normal'
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

            <div className="space-y-6">
                <FontEditor label="Dialogue Name Font" fontKey="dialogueNameFont" />
                <FontEditor label="Dialogue Text Font" fontKey="dialogueTextFont" />
                <FontEditor label="Choice Text Font" fontKey="choiceTextFont" />
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
                    <label className="form-label">Title Screen</label>
                    <select
                        value={project.ui.titleScreenId || ''}
                        onChange={(e) => onUpdate({ titleScreenId: e.target.value || null })}
                        className="form-input"
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
                    <label className="form-label">Settings Screen</label>
                    <select
                        value={project.ui.settingsScreenId || ''}
                        onChange={(e) => onUpdate({ settingsScreenId: e.target.value || null })}
                        className="form-input"
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
                    <label className="form-label">Save Screen</label>
                    <select
                        value={project.ui.saveScreenId || ''}
                        onChange={(e) => onUpdate({ saveScreenId: e.target.value || null })}
                        className="form-input"
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
                    <label className="form-label">Load Screen</label>
                    <select
                        value={project.ui.loadScreenId || ''}
                        onChange={(e) => onUpdate({ loadScreenId: e.target.value || null })}
                        className="form-input"
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
                    <label className="form-label">Pause Screen</label>
                    <select
                        value={project.ui.pauseScreenId || ''}
                        onChange={(e) => onUpdate({ pauseScreenId: e.target.value || null })}
                        className="form-input"
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
                    <label className="form-label">Game HUD Screen</label>
                    <select
                        value={project.ui.gameHudScreenId || ''}
                        onChange={(e) => onUpdate({ gameHudScreenId: e.target.value || null })}
                        className="form-input"
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

export default SettingsManager;
