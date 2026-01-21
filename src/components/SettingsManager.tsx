import React, { useState } from 'react';
import { VNProject, VNProjectFont } from '../types/project';
import { VNProjectUI, VNFontSettings } from '../features/ui/types';
import { useProject } from '../contexts/ProjectContext';
import { Cog6ToothIcon, PhotoIcon, BookOpenIcon, MusicalNoteIcon, TrashIcon } from './icons';
import { VNID } from '../types';

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
    const [activeSection, setActiveSection] = useState<'general' | 'ui' | 'fonts' | 'screens'>('general');

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
    ];

    return (
        <div className="flex h-full">
            {/* Settings Sidebar */}
            <div className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
                <div className="p-4 border-b border-slate-700">
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
                                    : 'hover:bg-slate-700 text-slate-300'
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
                    <label className="block text-sm font-medium text-slate-300 mb-2">Project Title</label>
                    <input
                        type="text"
                        value={project.title}
                        onChange={(e) => onUpdate({ title: e.target.value })}
                        className="w-full bg-slate-800 text-white p-3 rounded-md border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        placeholder="Enter project title"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Starting Scene</label>
                    <select
                        value={project.startSceneId}
                        onChange={(e) => onUpdate({ startSceneId: e.target.value })}
                        className="w-full bg-slate-800 text-white p-3 rounded-md border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
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

    editorDebugLog('[UIAssetsSettings] Rendering with images:', allImages.length, allImages.map(i => i.name));

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
                    <label className="block text-sm font-medium text-slate-300 mb-2">Dialogue Box Image</label>
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
                        className="w-full bg-slate-800 text-white p-3 rounded-md border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-505"
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
                    <label className="block text-sm font-medium text-slate-300 mb-2">Choice Button Image</label>
                    <select
                        value={project.ui.choiceButtonImage?.id || ''}
                        onChange={(e) => {
                            const assetId = e.target.value;
                            const asset = assetId ? allImages.find(img => img.id === assetId) : null;
                            onUpdate({
                                choiceButtonImage: asset ? { type: 'image', id: asset.id } : null
                            });
                        }}
                        className="w-full bg-slate-800 text-white p-3 rounded-md border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
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
        const currentFont = project.ui[fontKey] as VNFontSettings;
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
        const font = project.ui[fontKey] as VNFontSettings;
        const fontOptions = getFontOptions(font.family);

        return (
            <div className="border border-slate-700 rounded-lg p-4">
                <h4 className="text-lg font-semibold text-white mb-4">{label}</h4>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Family</label>
                        <select
                            value={font.family}
                            onChange={(e) => updateFont(fontKey, { family: e.target.value })}
                            className="w-full bg-slate-800 text-white p-2 rounded border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        >
                            {fontOptions.map(f => (
                                <option key={f} value={f}>{f.split(',')[0]}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Size</label>
                        <input
                            type="number"
                            value={font.size}
                            onChange={(e) => updateFont(fontKey, { size: parseInt(e.target.value) })}
                            className="w-full bg-slate-800 text-white p-2 rounded border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Color</label>
                        <input
                            type="color"
                            value={font.color}
                            onChange={(e) => updateFont(fontKey, { color: e.target.value })}
                            className="w-full bg-slate-800 text-white p-2 rounded border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Weight</label>
                        <select
                            value={font.weight}
                            onChange={(e) => updateFont(fontKey, { weight: e.target.value as 'normal' | 'bold' })}
                            className="w-full bg-slate-800 text-white p-2 rounded border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
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

            {/* Project Font Library */}
            <div className="border border-slate-700 rounded-lg p-4 mb-6">
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
                    <div className="text-slate-400 text-sm bg-slate-900/50 p-4 rounded">
                        No custom fonts uploaded yet. Upload a .ttf or .otf file to make it available in all font pickers throughout your project.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {projectFontsArray.map((f) => (
                            <div key={f.id} className="flex items-center justify-between bg-slate-900/50 border border-slate-600 rounded p-3">
                                <div className="min-w-0 flex-1">
                                    <div className="text-white font-medium" style={{ fontFamily: f.fontFamily }}>
                                        {f.name}
                                    </div>
                                    <div className="text-xs text-slate-400">{f.fontFamily}</div>
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
                    <label className="block text-sm font-medium text-slate-300 mb-2">Title Screen</label>
                    <select
                        value={project.ui.titleScreenId || ''}
                        onChange={(e) => onUpdate({ titleScreenId: e.target.value || null })}
                        className="w-full bg-slate-800 text-white p-3 rounded-md border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
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
                    <label className="block text-sm font-medium text-slate-300 mb-2">Settings Screen</label>
                    <select
                        value={project.ui.settingsScreenId || ''}
                        onChange={(e) => onUpdate({ settingsScreenId: e.target.value || null })}
                        className="w-full bg-slate-800 text-white p-3 rounded-md border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
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
                    <label className="block text-sm font-medium text-slate-300 mb-2">Save Screen</label>
                    <select
                        value={project.ui.saveScreenId || ''}
                        onChange={(e) => onUpdate({ saveScreenId: e.target.value || null })}
                        className="w-full bg-slate-800 text-white p-3 rounded-md border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
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
                    <label className="block text-sm font-medium text-slate-300 mb-2">Load Screen</label>
                    <select
                        value={project.ui.loadScreenId || ''}
                        onChange={(e) => onUpdate({ loadScreenId: e.target.value || null })}
                        className="w-full bg-slate-800 text-white p-3 rounded-md border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
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
                    <label className="block text-sm font-medium text-slate-300 mb-2">Pause Screen</label>
                    <select
                        value={project.ui.pauseScreenId || ''}
                        onChange={(e) => onUpdate({ pauseScreenId: e.target.value || null })}
                        className="w-full bg-slate-800 text-white p-3 rounded-md border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
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
                    <label className="block text-sm font-medium text-slate-300 mb-2">Game HUD Screen</label>
                    <select
                        value={project.ui.gameHudScreenId || ''}
                        onChange={(e) => onUpdate({ gameHudScreenId: e.target.value || null })}
                        className="w-full bg-slate-800 text-white p-3 rounded-md border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
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