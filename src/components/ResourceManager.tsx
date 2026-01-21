import React, { useState, useRef, useEffect } from 'react';
import { VNID } from '../types';
import { VNProject, VNProjectFont } from '../types/project';
import { VNScene } from '../features/scene/types';
import { VNCharacter } from '../features/character/types';
import { VNBackground, VNAudio, VNVideo, VNImage } from '../features/assets/types';
import { VNVariable } from '../features/variables/types';
import { VNUIScreen } from '../features/ui/types';
import { useProject } from '../contexts/ProjectContext';
import Panel from './ui/Panel';
import { PlusIcon, TrashIcon, PhotoIcon, MusicalNoteIcon, FilmIcon, SparkleIcon, BookmarkSquareIcon, BookOpenIcon, Cog6ToothIcon, PencilIcon, DuplicateIcon, LockClosedIcon } from './icons';
import { fileToBase64 } from '../utils/file';
import { AssetType } from '../features/assets/state/assetReducer';
import ConfirmationModal from './ui/ConfirmationModal';
import FontEditor from './ui/FontEditor';
import { FormField, Select } from './ui/Form';
import AssetSelector from './ui/AssetSelector';

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, icon, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div>
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-2 bg-[var(--bg-tertiary)] hover:bg-[var(--accent-purple)] rounded-md">
                <div className="flex items-center gap-2 font-bold">
                    {icon} {title}
                </div>
                <span className={`transform transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
            </button>
            {isOpen && <div className="p-2 space-y-1">{children}</div>}
        </div>
    );
};

const AssetUploader: React.FC<{ onUpload: (name: string, dataUrl: string) => void; accept?: string; label?: string }> = ({ onUpload, accept, label = 'Upload' }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Warn about large files
            const sizeMB = file.size / 1024 / 1024;
            if (sizeMB > 50) {
                const proceed = confirm(
                    `Warning: This file is ${sizeMB.toFixed(1)} MB.\n\n` +
                    `Large video files can cause performance issues and may fail to load in some browsers.\n\n` +
                    `Consider compressing your video or using a smaller file size (recommended < 50 MB).\n\n` +
                    `Continue anyway?`
                );
                if (!proceed) {
                    if (inputRef.current) inputRef.current.value = '';
                    return;
                }
            }
            
            try {
                const dataUrl = await fileToBase64(file);
                
                // Verify the data was actually read
                if (!dataUrl || dataUrl.length < 100) {
                    alert(`Error: File could not be read properly. The file may be corrupted or too large.`);
                    if (inputRef.current) inputRef.current.value = '';
                    return;
                }
                
                onUpload(file.name.split('.')[0], dataUrl);
            } catch (error) {
                console.error('File upload error:', error);
                alert(`Error uploading file: ${error}`);
            }
            
            if (inputRef.current) inputRef.current.value = ''; // Reset file input
        }
    };
    return <>
        <input type="file" ref={inputRef} accept={accept} onChange={handleFileChange} className="hidden" />
        <button onClick={() => inputRef.current?.click()} className="w-full bg-[var(--accent-cyan)] hover:opacity-80 text-black p-2 rounded-md flex items-center justify-center gap-2 mt-2 font-bold">
            <PlusIcon /> {label}
        </button>
    </>
};

const ContextMenu: React.FC<{
    items: { label: string; onClick: () => void; icon?: React.ReactNode }[];
    x: number; y: number; onClose: () => void;
}> = ({ items, x, y, onClose }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div ref={menuRef} style={{ top: y, left: x }} className="fixed bg-[var(--bg-secondary)] border border-[var(--bg-tertiary)] rounded-md shadow-lg z-50 py-1">
            {items.map((item, index) => (
                <button key={index} onClick={() => { item.onClick(); onClose(); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-[var(--accent-purple)]">
                    {item.icon} {item.label}
                </button>
            ))}
        </div>
    );
};

type AssetCategoryKey = 'backgrounds' | 'images' | 'audio' | 'videos';

const ResourceItem: React.FC<{
    item: { id: VNID, name: string };
    icon: React.ReactNode;
    thumbnailUrl?: string | null;
    isVideo?: boolean;
    isSelected: boolean;
    isRenaming: boolean;
    isStartScene?: boolean;
    isLocked?: boolean;
    colorSwatch?: string;
    onSelect: () => void;
    onStartRenaming: () => void;
    onCommitRename: (newName: string) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
}> = ({ item, icon, thumbnailUrl, isVideo, isSelected, isRenaming, isStartScene, isLocked, colorSwatch, onSelect, onStartRenaming, onCommitRename, onContextMenu, onDuplicate, onDelete }) => {
    const [renameValue, setRenameValue] = useState(item.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isRenaming) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isRenaming]);
    
    useEffect(() => {
        setRenameValue(item.name);
    }, [item.name]);

    const handleRenameBlur = () => {
        if (renameValue.trim()) {
            onCommitRename(renameValue.trim());
        }
    };

    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') inputRef.current?.blur();
        if (e.key === 'Escape') {
            setRenameValue(item.name);
            onCommitRename(item.name); // This effectively cancels
        }
    };

    return (
        <div 
            onClick={onSelect} 
            onDoubleClick={!isLocked ? onStartRenaming : undefined}
            onContextMenu={onContextMenu}
            className={`group flex items-center gap-2 p-1.5 rounded-md cursor-pointer ${isSelected ? 'bg-[var(--accent-cyan)]/30' : 'hover:bg-[var(--bg-tertiary)]'}`}
        >
            {thumbnailUrl ? (
                isVideo ? (
                    <video src={thumbnailUrl} className="w-8 h-8 rounded-md object-cover flex-shrink-0 bg-slate-700" muted playsInline />
                ) : (
                    <img src={thumbnailUrl} alt={item.name} className="w-8 h-8 rounded-md object-cover flex-shrink-0 bg-slate-700"/>
                )
            ) : colorSwatch ? (
                <div className="w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center bg-slate-700">
                    <div className="w-6 h-6 rounded-full" style={{ backgroundColor: colorSwatch }}></div>
                </div>
            ) : (
                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">{icon}</div>
            )}
            <div className="flex-grow truncate">
                {isRenaming && !isLocked ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={handleRenameBlur}
                        onKeyDown={handleRenameKeyDown}
                        className="w-full bg-[var(--bg-primary)] text-white p-1 rounded-md outline-none ring-2 ring-[var(--accent-cyan)]"
                        onClick={e => e.stopPropagation()} // Prevent onSelect from firing
                    />
                ) : (
                    <span className="truncate">{item.name}</span>
                )}
            </div>
            <div className="flex items-center ml-auto flex-shrink-0 pl-1">
                {isStartScene && <SparkleIcon className="w-4 h-4 text-yellow-400" title="Start Scene"/>}
                {isLocked && <LockClosedIcon className="w-4 h-4 text-slate-500" title="This screen is essential and cannot be deleted or renamed." />}
                {onDuplicate && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                        className="p-1 text-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] bg-slate-700 hover:bg-slate-600 rounded"
                        title="Duplicate"
                    >
                        <DuplicateIcon className="w-4 h-4" />
                    </button>
                )}
                {onDelete && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="p-1 text-[var(--accent-pink)] hover:text-red-400 bg-slate-700 hover:bg-slate-600 rounded"
                        title="Delete"
                    >
                        <TrashIcon className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
};


const ResourceManager: React.FC<{
    project: VNProject;
    activeSceneId: VNID;
    setActiveSceneId: (id: VNID) => void;
    activeMenuScreenId: VNID | null;
    setActiveMenuScreenId: (id: VNID | null) => void;
    activeCharacterId: VNID | null;
    setActiveCharacterId: (id: VNID | null) => void;
    selectedVariableId: VNID | null;
    setSelectedVariableId: (id: VNID | null) => void;
    selectedCommandIndex: number | null;
    setSelectedCommandIndex: (index: number | null) => void;
}> = ({ project, activeSceneId, setActiveSceneId, activeMenuScreenId, setActiveMenuScreenId, activeCharacterId, setActiveCharacterId, selectedVariableId, setSelectedVariableId, selectedCommandIndex, setSelectedCommandIndex }) => {
    const { dispatch } = useProject();
    const [renamingId, setRenamingId] = useState<VNID | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, items: any[] } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{
        type: 'scene' | 'character' | 'variable' | 'uiScreen' | AssetType;
        item: { id: VNID; name: string };
    } | null>(null);
    const [openAssetCategories, setOpenAssetCategories] = useState<Record<AssetCategoryKey, boolean>>({
        backgrounds: true,
        images: false,
        audio: false,
        videos: false,
    });

    const projectFontsArray = Object.values((project as any).fonts || {}) as VNProjectFont[];

    const getPrimaryFontFamily = (family: string | undefined | null): string => {
        if (!family) return '';
        return family.split(',')[0].trim();
    };

    const replaceFontFamilyIfMatches = (font: any, removedFamily: string, fallbackFamily: string): any => {
        if (!font || typeof font !== 'object') return font;
        if (!font.family || typeof font.family !== 'string') return font;

        const currentPrimary = getPrimaryFontFamily(font.family);
        const removedPrimary = getPrimaryFontFamily(removedFamily);

        if (font.family === removedFamily || currentPrimary === removedPrimary) {
            return { ...font, family: fallbackFamily };
        }
        return font;
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

            const newId = `font-${Math.random().toString(36).substring(2, 9)}`;
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
        };
        input.click();
    };

    const deleteProjectFont = (fontId: VNID) => {
        const fontsById = { ...((project as any).fonts || {}) } as Record<VNID, VNProjectFont>;
        const removed = fontsById[fontId];
        const removedFamily = removed?.fontFamily;

        delete (fontsById as any)[fontId];

        // If nothing referenced it (or it was malformed), just delete.
        if (!removedFamily) {
            dispatch({ type: 'UPDATE_PROJECT', payload: { fonts: fontsById } as any });
            return;
        }

        const fallbackFamily = 'Poppins, sans-serif';

        // Update global dialogue/choice font settings
        const uiUpdates: any = {
            ...project.ui,
            dialogueNameFont: replaceFontFamilyIfMatches(project.ui.dialogueNameFont, removedFamily, fallbackFamily),
            dialogueTextFont: replaceFontFamilyIfMatches(project.ui.dialogueTextFont, removedFamily, fallbackFamily),
            choiceTextFont: replaceFontFamilyIfMatches(project.ui.choiceTextFont, removedFamily, fallbackFamily),
        };

        // Update per-element UI screen fonts
        let uiScreensChanged = false;
        const newScreens: any = { ...project.uiScreens };

        for (const screenId of Object.keys(project.uiScreens || {})) {
            const screen: any = (project.uiScreens as any)[screenId];
            if (!screen?.elements) continue;

            let elementsChanged = false;
            const newElements: any = { ...screen.elements };

            for (const elementId of Object.keys(screen.elements)) {
                const el: any = screen.elements[elementId];
                if (!el || !el.font) continue;

                const newFont = replaceFontFamilyIfMatches(el.font, removedFamily, fallbackFamily);
                if (newFont !== el.font) {
                    newElements[elementId] = { ...el, font: newFont };
                    elementsChanged = true;
                }
            }

            if (elementsChanged) {
                newScreens[screenId] = { ...screen, elements: newElements };
                uiScreensChanged = true;
            }
        }

        dispatch({
            type: 'UPDATE_PROJECT',
            payload: {
                fonts: fontsById,
                ui: uiUpdates,
                ...(uiScreensChanged ? { uiScreens: newScreens } : {}),
            } as any,
        });
    };

    const handleCommitRename = (type: 'scene' | 'character' | 'variable' | 'uiScreen' | AssetType, id: VNID, name: string) => {
        switch(type) {
            case 'scene': dispatch({ type: 'UPDATE_SCENE', payload: { sceneId: id, name }}); break;
            case 'character': dispatch({ type: 'UPDATE_CHARACTER', payload: { characterId: id, updates: { name }}}); break;
            case 'variable': dispatch({ type: 'UPDATE_VARIABLE', payload: { variableId: id, updates: { name }}}); break;
            case 'uiScreen': dispatch({ type: 'UPDATE_UI_SCREEN', payload: { screenId: id, updates: { name }}}); break;
            default: dispatch({ type: 'UPDATE_ASSET', payload: { assetType: type, assetId: id, updates: { name }}}); break;
        }
        setRenamingId(null);
    }
    
    // Handlers
    const addScene = () => {
        const name = `New Scene ${Object.keys(project.scenes).length + 1}`;
        dispatch({ type: 'ADD_SCENE', payload: { name } });
    };
    const addCharacter = () => {
        const name = `New Character ${Object.keys(project.characters).length + 1}`;
        dispatch({ type: 'ADD_CHARACTER', payload: { name, color: '#FFFFFF' } });
    };
    const addAsset = (assetType: 'backgrounds' | 'images' | 'audio' | 'videos', name: string, url: string) => {
        const newAsset = { id: `${assetType.slice(0, 4)}-${Math.random().toString(36).substring(2, 9)}`, name };
        let payload: any;
        
        // Detect if the URL is a video based on data URL mime type or file extension
        const isVideo = url.startsWith('data:video/') || /\.(mp4|webm|ogg|mov)$/i.test(name);
        
        if (assetType === 'backgrounds') {
            payload = { 
                ...newAsset, 
                ...(isVideo ? { videoUrl: url, isVideo: true, loop: true } : { imageUrl: url })
            };
        } else if (assetType === 'images') {
            payload = { 
                ...newAsset, 
                ...(isVideo ? { videoUrl: url, isVideo: true, loop: true } : { imageUrl: url })
            };
        } else if (assetType === 'audio') {
            payload = { ...newAsset, audioUrl: url };
        } else if (assetType === 'videos') {
            payload = { ...newAsset, videoUrl: url };
        }
        
        dispatch({ type: 'ADD_ASSET', payload: { assetType, asset: payload } });
    };
    const addVariable = () => {
        const name = `new_variable_${Object.keys(project.variables).length + 1}`;
        dispatch({ type: 'ADD_VARIABLE', payload: { name, type: 'number', defaultValue: 0 } });
    };
    const addUIScreen = () => {
        const name = `New Screen ${Object.keys(project.uiScreens).length + 1}`;
        dispatch({type: 'ADD_UI_SCREEN', payload: {name}});
    };

    const handleDeleteRequest = (type: 'scene' | 'character' | 'variable' | 'uiScreen' | AssetType, item: { id: VNID, name: string }) => {
        if (type === 'scene' && Object.keys(project.scenes).length <= 1) {
            alert("You cannot delete the last scene.");
            return;
        }
        setConfirmDelete({ type, item });
    };

    const handleConfirmDelete = () => {
        if (!confirmDelete) return;
        const { type, item } = confirmDelete;
        switch(type) {
            case 'scene': dispatch({ type: 'DELETE_SCENE', payload: { sceneId: item.id } }); break;
            case 'character': dispatch({ type: 'DELETE_CHARACTER', payload: { characterId: item.id } }); break;
            case 'variable': dispatch({ type: 'DELETE_VARIABLE', payload: { variableId: item.id } }); break;
            case 'uiScreen': dispatch({ type: 'DELETE_UI_SCREEN', payload: { screenId: item.id } }); break;
            default: dispatch({ type: 'DELETE_ASSET', payload: { assetType: type, assetId: item.id } }); break;
        }
        setConfirmDelete(null);
    };

    const handleContextMenu = (e: React.MouseEvent, item: { id: VNID, name: string }, type: 'scene' | 'character' | 'variable' | 'uiScreen' | 'specialUiScreen' | AssetType) => {
        e.preventDefault();
        e.stopPropagation();
        
        let menuItems: { label: string; onClick: () => void; icon?: React.ReactNode }[] = [];
        
        if (type !== 'specialUiScreen') {
             menuItems.push({ label: 'Rename', icon: <PencilIcon/>, onClick: () => setRenamingId(item.id) });
        }

        if (type === 'uiScreen' || type === 'specialUiScreen') {
            menuItems.push({ 
                label: 'Duplicate', 
                icon: <DuplicateIcon />, 
                onClick: () => {
                    console.log('[ResourceManager] Context menu - Duplicating UI screen:', item.id, item.name);
                    dispatch({ type: 'DUPLICATE_UI_SCREEN', payload: { screenId: item.id } });
                }
            });
        }

        if (type === 'scene') {
            menuItems.push({ label: 'Set as Start Scene', icon: <SparkleIcon/>, onClick: () => dispatch({ type: 'SET_START_SCENE', payload: { sceneId: item.id }}) });
        }
        
        if (type !== 'specialUiScreen') {
            menuItems.push({ label: 'Delete', icon: <TrashIcon/>, onClick: () => handleDeleteRequest(type as any, item)});
        }

        setContextMenu({ x: e.clientX, y: e.clientY, items: menuItems });
    }

    const scenesArray = Object.values(project.scenes) as VNScene[];
    const charactersArray = Object.values(project.characters) as VNCharacter[];
    const backgroundsArray = Object.values(project.backgrounds) as VNBackground[];
    const imagesArray = Object.values(project.images || {}) as VNImage[];
    const audioArray = Object.values(project.audio) as VNAudio[];
    const videosArray = Object.values(project.videos) as VNVideo[];
    const variablesArray = Object.values(project.variables) as VNVariable[];
    const uiScreensArray = Object.values(project.uiScreens) as VNUIScreen[];

    const specialScreenIds = [
        project.ui.titleScreenId,
        project.ui.settingsScreenId,
        project.ui.saveScreenId,
        project.ui.loadScreenId,
        project.ui.pauseScreenId,
    ].filter((id): id is VNID => Boolean(id));

    const assetCategoryMetadata: Record<AssetCategoryKey, { label: string; icon: React.ReactNode; accept?: string; uploadLabel: string; emptyLabel: string }> = {
        backgrounds: {
            label: 'Backgrounds',
            icon: <PhotoIcon className="w-4 h-4" />,
            accept: 'image/*,video/*',
            uploadLabel: 'Upload Background',
            emptyLabel: 'No backgrounds yet.',
        },
        images: {
            label: 'Images',
            icon: <PhotoIcon className="w-4 h-4" />,
            accept: 'image/*,video/*',
            uploadLabel: 'Upload Image',
            emptyLabel: 'No images yet.',
        },
        audio: {
            label: 'Audio',
            icon: <MusicalNoteIcon className="w-4 h-4" />,
            accept: 'audio/*',
            uploadLabel: 'Upload Audio',
            emptyLabel: 'No audio yet.',
        },
        videos: {
            label: 'Videos',
            icon: <FilmIcon className="w-4 h-4" />,
            accept: 'video/*',
            uploadLabel: 'Upload Video',
            emptyLabel: 'No videos yet.',
        },
    };

    const toggleAssetCategory = (category: AssetCategoryKey) => {
        setOpenAssetCategories(prev => ({ ...prev, [category]: !prev[category] }));
    };

    return (
        <Panel title="Project Resources" className="w-80 flex-shrink-0">
            <div className="flex-grow overflow-y-auto space-y-4 pr-1" onClick={() => setContextMenu(null)}>
                <Section title="Project Settings" icon={<Cog6ToothIcon />} defaultOpen>
                    <div className="space-y-4 p-1">
                        <FormField label="Game HUD Screen (In-Game Overlay)">
                            <Select
                                value={project.ui.gameHudScreenId || ''}
                                onChange={e => dispatch({ type: 'UPDATE_UI_CONFIG', payload: { key: 'gameHudScreenId', value: e.target.value || null } })}
                            >
                                <option value="">None</option>
                                {uiScreensArray.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </Select>
                        </FormField>
                        <div>
                             <h4 className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Dialogue Box</h4>
                             <div className="grid grid-cols-2 gap-2">
                                <AssetSelector 
                                    label="Asset" 
                                    assetType={project.ui.dialogueBoxImage?.type === 'video' ? 'videos' : 'backgrounds'} 
                                    value={project.ui.dialogueBoxImage?.id || null} 
                                    onChange={id => dispatch({ type: 'UPDATE_UI_CONFIG', payload: { key: 'dialogueBoxImage', value: id ? { type: project.ui.dialogueBoxImage?.type || 'image', id } : null } })} 
                                />
                                <FormField label="Type">
                                    <Select 
                                        value={project.ui.dialogueBoxImage?.type || 'image'} 
                                        onChange={e => dispatch({ type: 'UPDATE_UI_CONFIG', payload: { key: 'dialogueBoxImage', value: { type: e.target.value as 'image' | 'video', id: project.ui.dialogueBoxImage?.id || '' } }})}
                                    >
                                        <option value="image">Image</option>
                                        <option value="video">Video</option>
                                    </Select>
                                </FormField>
                             </div>
                        </div>
                        <div>
                             <h4 className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Choice Button</h4>
                             <div className="grid grid-cols-2 gap-2">
                                <AssetSelector 
                                    label="Asset" 
                                    assetType={project.ui.choiceButtonImage?.type === 'video' ? 'videos' : 'backgrounds'} 
                                    value={project.ui.choiceButtonImage?.id || null} 
                                    onChange={id => dispatch({ type: 'UPDATE_UI_CONFIG', payload: { key: 'choiceButtonImage', value: id ? { type: project.ui.choiceButtonImage?.type || 'image', id } : null } })} 
                                />
                                <FormField label="Type">
                                    <Select 
                                        value={project.ui.choiceButtonImage?.type || 'image'} 
                                        onChange={e => dispatch({ type: 'UPDATE_UI_CONFIG', payload: { key: 'choiceButtonImage', value: { type: e.target.value as 'image' | 'video', id: project.ui.choiceButtonImage?.id || '' } }})}
                                    >
                                        <option value="image">Image</option>
                                        <option value="video">Video</option>
                                    </Select>
                                </FormField>
                             </div>
                        </div>
                        
                        <div>
                            <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Dialogue Name Font</h4>
                            <FontEditor font={project.ui.dialogueNameFont} onFontChange={(prop, value) => dispatch({ type: 'UPDATE_UI_FONT_CONFIG', payload: { target: 'dialogueNameFont', property: prop, value }})} />
                        </div>
                         <div>
                            <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Dialogue Text Font</h4>
                            <FontEditor font={project.ui.dialogueTextFont} onFontChange={(prop, value) => dispatch({ type: 'UPDATE_UI_FONT_CONFIG', payload: { target: 'dialogueTextFont', property: prop, value }})} />
                        </div>
                         <div>
                            <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Choice Button Font</h4>
                            <FontEditor font={project.ui.choiceTextFont} onFontChange={(prop, value) => dispatch({ type: 'UPDATE_UI_FONT_CONFIG', payload: { target: 'choiceTextFont', property: prop, value }})} />
                        </div>

                        <div className="pt-2 border-t border-white/10">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-medium text-[var(--text-secondary)]">Project Font Library (TTF/OTF)</h4>
                                <button
                                    onClick={addProjectFont}
                                    className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1 rounded text-xs"
                                >
                                    Upload Font
                                </button>
                            </div>
                            {projectFontsArray.length === 0 ? (
                                <div className="text-xs text-slate-400">No custom fonts uploaded yet. Upload a .ttf/.otf to make it selectable in menu/dialogue font pickers.</div>
                            ) : (
                                <div className="space-y-2">
                                    {projectFontsArray.map((f) => (
                                        <div key={f.id} className="flex items-center justify-between bg-slate-900/40 border border-white/10 rounded px-2 py-2">
                                            <div className="min-w-0">
                                                <div className="text-sm text-white truncate" style={{ fontFamily: f.fontFamily }}>
                                                    {f.name}
                                                </div>
                                                <div className="text-[11px] text-slate-400 truncate">{f.fontFamily}</div>
                                            </div>
                                            <button
                                                onClick={() => deleteProjectFont(f.id)}
                                                className="text-xs text-red-300 hover:text-red-200 px-2"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </Section>
                <Section title="Scenes" icon={<BookOpenIcon />}>
                    {scenesArray.map(scene => (
                        <ResourceItem
                            key={scene.id}
                            item={scene}
                            icon={<BookOpenIcon />}
                            isSelected={activeSceneId === scene.id && !activeMenuScreenId && !activeCharacterId}
                            isStartScene={project.startSceneId === scene.id}
                            isRenaming={renamingId === scene.id}
                            onSelect={() => setActiveSceneId(scene.id)}
                            onStartRenaming={() => setRenamingId(scene.id)}
                            onCommitRename={(name) => handleCommitRename('scene', scene.id, name)}
                            onContextMenu={(e) => handleContextMenu(e, scene, 'scene')}
                            onDelete={() => handleDeleteRequest('scene', scene)}
                        />
                    ))}
                    <button onClick={addScene} className="w-full bg-[var(--accent-cyan)] hover:opacity-80 text-black p-2 rounded-md flex items-center justify-center gap-2 mt-2 font-bold"><PlusIcon /> Add Scene</button>
                </Section>
                <Section title="UI & Menus" icon={<BookmarkSquareIcon />}>
                    {uiScreensArray.map(screen => {
                        const isSpecial = specialScreenIds.includes(screen.id);
                        return (
                            <ResourceItem
                                key={screen.id}
                                item={screen}
                                icon={<BookmarkSquareIcon />}
                                isSelected={activeMenuScreenId === screen.id}
                                isRenaming={renamingId === screen.id}
                                isLocked={isSpecial}
                                onSelect={() => setActiveMenuScreenId(screen.id)}
                                onStartRenaming={() => setRenamingId(screen.id)}
                                onCommitRename={(name) => handleCommitRename('uiScreen', screen.id, name)}
                                onContextMenu={(e) => handleContextMenu(e, screen, isSpecial ? 'specialUiScreen' : 'uiScreen')}
                                onDuplicate={() => {
                                    console.log('[ResourceManager] Duplicating UI screen:', screen.id, screen.name);
                                    dispatch({ type: 'DUPLICATE_UI_SCREEN', payload: { screenId: screen.id } });
                                }}
                                onDelete={!isSpecial ? () => handleDeleteRequest('uiScreen', screen) : undefined}
                            />
                        );
                    })}
                    <button onClick={addUIScreen} className="w-full bg-[var(--accent-cyan)] hover:opacity-80 text-black p-2 rounded-md flex items-center justify-center gap-2 mt-2 font-bold"><PlusIcon /> Add UI Screen</button>
                </Section>
                 <Section title="Characters" icon={<PhotoIcon />}>
                    {charactersArray.map(char => (
                        <ResourceItem
                            key={char.id}
                            item={char}
                            icon={<PhotoIcon />}
                            thumbnailUrl={char.baseVideoUrl || char.baseImageUrl}
                            isVideo={!!char.isBaseVideo}
                            colorSwatch={char.color}
                            isSelected={activeCharacterId === char.id}
                            isRenaming={renamingId === char.id}
                            onSelect={() => setActiveCharacterId(char.id)}
                            onStartRenaming={() => setRenamingId(char.id)}
                            onCommitRename={(name) => handleCommitRename('character', char.id, name)}
                            onContextMenu={(e) => handleContextMenu(e, char, 'character')}
                            onDelete={() => handleDeleteRequest('character', char)}
                        />
                    ))}
                    <button onClick={addCharacter} className="w-full bg-[var(--accent-cyan)] hover:opacity-80 text-black p-2 rounded-md flex items-center justify-center gap-2 mt-2 font-bold"><PlusIcon /> Add Character</button>
                </Section>
                <Section title="Assets" icon={<PhotoIcon />}>
                    <div className="space-y-2">
                        {(Object.keys(assetCategoryMetadata) as AssetCategoryKey[]).map(category => {
                            const metadata = assetCategoryMetadata[category];
                            const isOpen = openAssetCategories[category];
                            const assetArray = category === 'backgrounds' ? backgroundsArray : category === 'images' ? imagesArray : category === 'audio' ? audioArray : videosArray;
                            const icon = category === 'audio' ? <MusicalNoteIcon /> : category === 'videos' ? <FilmIcon /> : <PhotoIcon />;
                            
                            return (
                                <div key={category} className="rounded-md border border-[var(--bg-tertiary)]">
                                    <button
                                        type="button"
                                        onClick={() => toggleAssetCategory(category)}
                                        className="w-full flex items-center justify-between px-2 py-1.5 bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] rounded-md"
                                    >
                                        <span className="flex items-center gap-2 text-sm font-semibold">
                                            {metadata.icon} {metadata.label}
                                        </span>
                                        <span className={`transform transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                                    </button>
                                    {isOpen && (
                                        <div className="p-2 space-y-1">
                                            {assetArray.length > 0 ? (
                                                assetArray.map((asset: any) => (
                                                    <ResourceItem
                                                        key={asset.id}
                                                        item={asset}
                                                        icon={icon}
                                                        thumbnailUrl={asset.videoUrl || asset.imageUrl}
                                                        isVideo={!!asset.isVideo}
                                                        isSelected={false}
                                                        isRenaming={renamingId === asset.id}
                                                        onSelect={() => {}}
                                                        onStartRenaming={() => setRenamingId(asset.id)}
                                                        onCommitRename={(name) => handleCommitRename(category, asset.id, name)}
                                                        onContextMenu={(e) => handleContextMenu(e, asset, category)}
                                                        onDelete={() => handleDeleteRequest(category, asset)}
                                                    />
                                                ))
                                            ) : (
                                                <p className="text-sm text-[var(--text-secondary)] italic">{metadata.emptyLabel}</p>
                                            )}
                                            <AssetUploader
                                                onUpload={(name, url) => addAsset(category, name, url)}
                                                accept={metadata.accept}
                                                label={metadata.uploadLabel}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </Section>
                 <Section title="Variables" icon={<Cog6ToothIcon />}>
                    {variablesArray.map(variable => (
                        <ResourceItem
                            key={variable.id}
                            item={variable}
                            icon={<Cog6ToothIcon />}
                            isSelected={selectedVariableId === variable.id}
                            isRenaming={renamingId === variable.id}
                            onSelect={() => {
                                setSelectedVariableId(variable.id);
                                setSelectedCommandIndex(null);
                            }}
                            onStartRenaming={() => setRenamingId(variable.id)}
                            onCommitRename={(name) => handleCommitRename('variable', variable.id, name)}
                            onContextMenu={(e) => handleContextMenu(e, variable, 'variable')}
                            onDelete={() => handleDeleteRequest('variable', variable)}
                        />
                    ))}
                    <button onClick={addVariable} className="w-full bg-[var(--accent-cyan)] hover:opacity-80 text-black p-2 rounded-md flex items-center justify-center gap-2 mt-2 font-bold"><PlusIcon /> Add Variable</button>
                </Section>
            </div>
            {contextMenu && <ContextMenu {...contextMenu} onClose={() => setContextMenu(null)}/>}
            <ConfirmationModal
                isOpen={!!confirmDelete}
                onClose={() => setConfirmDelete(null)}
                onConfirm={handleConfirmDelete}
                title="Confirm Deletion"
            >
                {confirmDelete && `Are you sure you want to delete the ${confirmDelete.type.replace(/s$/, '')} "${confirmDelete.item.name}"? This action cannot be undone.`}
            </ConfirmationModal>
        </Panel>
    );
};

export default ResourceManager;
