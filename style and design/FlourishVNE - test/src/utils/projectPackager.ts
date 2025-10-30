// Declare global variables from CDN scripts
declare var JSZip: any;
declare var saveAs: any;

import { VNProject } from '../types/project';
import { VNID } from '../types';
import { VNCharacter, VNCharacterLayer, VNLayerAsset } from '../features/character/types';
import { VNBackground, VNAudio, VNVideo, VNImage } from '../features/assets/types';
// FIX: Removed GoToScreenAction as it is not exported from 'scene/types' and is unused.
import { VNCommand, CommandType, SetBackgroundCommand, ShowCharacterCommand, HideCharacterCommand, PlayMusicCommand, StopMusicCommand, PlaySoundEffectCommand, PlayMovieCommand, ShowImageCommand, ShowButtonCommand, VNScene } from '../features/scene/types';
import { UIElementType, UIButtonElement, UIImageElement, UIAsset, VNUIScreen, VNUIElement, UICharacterPreviewElement } from '../features/ui/types';

import { fileToBase64 } from './file';
import { createInitialProject, createDefaultUIScreens } from '../constants';

export type ExportManifest = {
    schemaVersion: 1;
    exportedAt: string;
    project: { id: VNID; title: string };
    embedded: { backgrounds: string[]; images: string[]; audio: string[]; videos: string[]; characters: string[]; ui: string[] };
    fetchFailures: string[];
};

const dataUrlToBlob = async (dataUrl: string): Promise<{ blob: Blob, mimeType: string }> => {
    // Manually parse the data URL to be more robust than the fetch API,
    // which can sometimes default to octet-stream for unknown types.
    const parts = dataUrl.split(',');
    if (parts.length < 2) {
        console.error("Malformed data URL:", dataUrl);
        return { blob: new Blob(), mimeType: 'application/octet-stream' };
    }
    const meta = parts[0];
    const data = parts[1];
    
    const mimeMatch = meta.match(/:(.*?);/);
    const mimeType = (mimeMatch && mimeMatch[1]) ? mimeMatch[1] : 'application/octet-stream';
    
    const isBase64 = meta.includes(';base64');
    
    let byteString;
    try {
        byteString = isBase64 ? atob(data) : decodeURIComponent(data);
    } catch (e) {
        console.error("Failed to decode data URL content:", e);
        return { blob: new Blob(), mimeType: 'application/octet-stream' };
    }
    
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const intArray = new Uint8Array(arrayBuffer);
    for (let i = 0; i < byteString.length; i++) {
        intArray[i] = byteString.charCodeAt(i);
    }
    
    const blob = new Blob([intArray], { type: mimeType });
    return { blob, mimeType };
};

const fetchUrlToBlob = async (url: string): Promise<{ blob: Blob, mimeType: string } | null> => {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        return { blob, mimeType: blob.type || (res.headers.get('content-type') || '') };
    } catch (e) {
        // Could be CORS or network error; skip embedding
        console.warn('Could not fetch remote asset for embedding:', url, e);
        return null;
    }
};


const mimeToExtension = (mimeType: string): string => {
    if (!mimeType) return 'bin';

    const mimeMap: { [key: string]: string } = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'audio/mpeg': 'mp3',
        'audio/ogg': 'ogg',
        'audio/wav': 'wav',
        'audio/webm': 'weba', // Use .weba for audio to distinguish from video/webm
        'audio/mp4': 'm4a',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/ogg': 'ogv',
        'application/octet-stream': 'bin',
    };

    if (mimeMap[mimeType]) {
        return mimeMap[mimeType];
    }
    
    // Fallback for unlisted types
    const parts = mimeType.split('/');
    if (parts.length < 2) return 'bin';
    
    return parts[1].split('+')[0]; // e.g. 'svg+xml' -> 'svg'
};

const extensionToMime = (extension: string): string => {
    const ext = extension.toLowerCase();
    const mimeMap: { [key: string]: string } = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'mp3': 'audio/mpeg',
        'ogg': 'audio/ogg',
        'wav': 'audio/wav',
        'weba': 'audio/webm',
        'm4a': 'audio/mp4',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'ogv': 'video/ogg',
        'bin': 'application/octet-stream',
    };
    return mimeMap[ext] || 'application/octet-stream';
};


const sanitizeFilename = (name: string, fallback: string): string => {
    if (!name || name.trim() === '') {
        return fallback;
    }
    // Replace invalid filesystem characters with an underscore
    return name.replace(/[^a-z0-9_.\-]/gi, '_').replace(/_{2,}/g, '_').toLowerCase();
};

export const exportProject = async (project: VNProject) => {
    if (!project) {
        throw new Error('A valid project object must be provided for export.');
    }

    const zip = new JSZip();
    const projectClone = JSON.parse(JSON.stringify(project)) as VNProject;
    const assetFolder = zip.folder('assets');
    if (!assetFolder) throw new Error("Could not create assets folder in zip");

    const processedAssetIds = new Set<VNID>();
    const manifest: ExportManifest = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        project: { id: project.id, title: project.title },
        embedded: { backgrounds: [], images: [], audio: [], videos: [], characters: [], ui: [] },
        fetchFailures: [],
    };

    const addEmbedded = (group: keyof ExportManifest['embedded'], path: string) => {
        if (!path) return;
        const list = manifest.embedded[group];
        if (!list.includes(path)) list.push(path);
    };

    const addFailure = (id: string) => {
        if (!manifest.fetchFailures.includes(id)) {
            manifest.fetchFailures.push(id);
        }
    };

    const assetProcessors = {
        backgrounds: async (id: VNID) => {
            if (processedAssetIds.has(id)) return;
            const asset = projectClone.backgrounds[id];
            if (asset?.imageUrl) {
                if (asset.imageUrl.startsWith('data:')) {
                    const { blob, mimeType } = await dataUrlToBlob(asset.imageUrl);
                    const filename = `${asset.id}_${sanitizeFilename(asset.name, 'background')}.${mimeToExtension(mimeType)}`;
                    assetFolder.folder('backgrounds')?.file(filename, blob);
                    asset.imageUrl = `assets/backgrounds/${filename}`;
                    processedAssetIds.add(id);
                    addEmbedded('backgrounds', asset.imageUrl);
                } else {
                    const fetched = await fetchUrlToBlob(asset.imageUrl);
                    if (fetched) {
                        const { blob, mimeType } = fetched;
                        const filename = `${asset.id}_${sanitizeFilename(asset.name, 'background')}.${mimeToExtension(mimeType)}`;
                        assetFolder.folder('backgrounds')?.file(filename, blob);
                        asset.imageUrl = `assets/backgrounds/${filename}`;
                        processedAssetIds.add(id);
                        addEmbedded('backgrounds', asset.imageUrl);
                    } else {
                        addFailure(`backgrounds:${asset.id}`);
                    }
                }
            }
        },
        images: async (id: VNID) => {
            if (processedAssetIds.has(id)) return;
            const asset = projectClone.images[id];
            if (asset?.imageUrl) {
                if (asset.imageUrl.startsWith('data:')) {
                    const { blob, mimeType } = await dataUrlToBlob(asset.imageUrl);
                    const filename = `${asset.id}_${sanitizeFilename(asset.name, 'image')}.${mimeToExtension(mimeType)}`;
                    assetFolder.folder('images')?.file(filename, blob);
                    asset.imageUrl = `assets/images/${filename}`;
                    processedAssetIds.add(id);
                    addEmbedded('images', asset.imageUrl);
                } else {
                    const fetched = await fetchUrlToBlob(asset.imageUrl);
                    if (fetched) {
                        const { blob, mimeType } = fetched;
                        const filename = `${asset.id}_${sanitizeFilename(asset.name, 'image')}.${mimeToExtension(mimeType)}`;
                        assetFolder.folder('images')?.file(filename, blob);
                        asset.imageUrl = `assets/images/${filename}`;
                        processedAssetIds.add(id);
                        addEmbedded('images', asset.imageUrl);
                    } else {
                        addFailure(`images:${asset.id}`);
                    }
                }
            }
        },
        audio: async (id: VNID) => {
            if (processedAssetIds.has(id)) return;
            const asset = projectClone.audio[id];
            if (asset?.audioUrl) {
                if (asset.audioUrl.startsWith('data:')) {
                    const { blob, mimeType } = await dataUrlToBlob(asset.audioUrl);
                    const filename = `${asset.id}_${sanitizeFilename(asset.name, 'audio')}.${mimeToExtension(mimeType)}`;
                    assetFolder.folder('audio')?.file(filename, blob);
                    asset.audioUrl = `assets/audio/${filename}`;
                    processedAssetIds.add(id);
                    addEmbedded('audio', asset.audioUrl);
                } else {
                    const fetched = await fetchUrlToBlob(asset.audioUrl);
                    if (fetched) {
                        const { blob, mimeType } = fetched;
                        const filename = `${asset.id}_${sanitizeFilename(asset.name, 'audio')}.${mimeToExtension(mimeType)}`;
                        assetFolder.folder('audio')?.file(filename, blob);
                        asset.audioUrl = `assets/audio/${filename}`;
                        processedAssetIds.add(id);
                        addEmbedded('audio', asset.audioUrl);
                    } else {
                        addFailure(`audio:${asset.id}`);
                    }
                }
            }
        },
        videos: async (id: VNID) => {
            if (processedAssetIds.has(id)) return;
            const asset = projectClone.videos[id];
            if (asset?.videoUrl) {
                if (asset.videoUrl.startsWith('data:')) {
                    const { blob, mimeType } = await dataUrlToBlob(asset.videoUrl);
                    const filename = `${asset.id}_${sanitizeFilename(asset.name, 'video')}.${mimeToExtension(mimeType)}`;
                    assetFolder.folder('videos')?.file(filename, blob);
                    asset.videoUrl = `assets/videos/${filename}`;
                    processedAssetIds.add(id);
                    addEmbedded('videos', asset.videoUrl);
                } else {
                    const fetched = await fetchUrlToBlob(asset.videoUrl);
                    if (fetched) {
                        const { blob, mimeType } = fetched;
                        const filename = `${asset.id}_${sanitizeFilename(asset.name, 'video')}.${mimeToExtension(mimeType)}`;
                        assetFolder.folder('videos')?.file(filename, blob);
                        asset.videoUrl = `assets/videos/${filename}`;
                        processedAssetIds.add(id);
                        addEmbedded('videos', asset.videoUrl);
                    } else {
                        addFailure(`videos:${asset.id}`);
                    }
                }
            }
        },
    };

    // --- 1. GATHER ALL ASSET REFERENCES ---
    const assetsToProcess = {
        backgrounds: new Set<VNID>(Object.keys(project.backgrounds)),
        images: new Set<VNID>(Object.keys(project.images || {})),
        audio: new Set<VNID>(Object.keys(project.audio)),
        videos: new Set<VNID>(Object.keys(project.videos)),
    };

    // Scan Scenes
    for (const scene of Object.values(project.scenes) as VNScene[]) {
        for (const command of scene.commands) {
            switch (command.type) {
                case CommandType.SetBackground: assetsToProcess.backgrounds.add((command as SetBackgroundCommand).backgroundId); break;
                case CommandType.ShowImage: assetsToProcess.images.add((command as ShowImageCommand).imageId); break;
                case CommandType.ShowButton: {
                    const cmd = command as ShowButtonCommand;
                    if (cmd.image) {
                        if (cmd.image.type === 'image') assetsToProcess.images.add(cmd.image.id);
                        else if (cmd.image.type === 'video') assetsToProcess.videos.add(cmd.image.id);
                    }
                    if (cmd.hoverImage) {
                        if (cmd.hoverImage.type === 'image') assetsToProcess.images.add(cmd.hoverImage.id);
                        else if (cmd.hoverImage.type === 'video') assetsToProcess.videos.add(cmd.hoverImage.id);
                    }
                    if (cmd.clickSound) assetsToProcess.audio.add(cmd.clickSound);
                    break;
                }
                case CommandType.PlayMusic: assetsToProcess.audio.add((command as PlayMusicCommand).audioId); break;
                case CommandType.PlaySoundEffect: assetsToProcess.audio.add((command as PlaySoundEffectCommand).audioId); break;
                case CommandType.PlayMovie: assetsToProcess.videos.add((command as PlayMovieCommand).videoId); break;
            }
        }
    }

    // Scan UI Screens
    for (const screen of Object.values(project.uiScreens) as VNUIScreen[]) {
        if (screen.background.type === 'image' && screen.background.assetId) assetsToProcess.backgrounds.add(screen.background.assetId);
        if (screen.background.type === 'video' && screen.background.assetId) assetsToProcess.videos.add(screen.background.assetId);
        if (screen.music.audioId) assetsToProcess.audio.add(screen.music.audioId);

        for (const element of Object.values(screen.elements) as VNUIElement[]) {
            if (element.type === UIElementType.Button) {
                const btn = element as UIButtonElement;
                if (btn.image?.id) {
                    if (btn.image.type === 'video') {
                        assetsToProcess.videos.add(btn.image.id);
                    } else {
                        assetsToProcess.backgrounds.add(btn.image.id);
                    }
                }
                if (btn.hoverImage?.id) {
                    if (btn.hoverImage.type === 'video') {
                        assetsToProcess.videos.add(btn.hoverImage.id);
                    } else {
                        assetsToProcess.backgrounds.add(btn.hoverImage.id);
                    }
                }
                if (btn.clickSoundId) assetsToProcess.audio.add(btn.clickSoundId);
                if (btn.hoverSoundId) assetsToProcess.audio.add(btn.hoverSoundId);
            }
            if (element.type === UIElementType.Image) {
                const img = element as UIImageElement;
                if (img.image?.type === 'image' && img.image.id) assetsToProcess.backgrounds.add(img.image.id);
                if (img.image?.type === 'video' && img.image.id) assetsToProcess.videos.add(img.image.id);
            }
        }
    }

    // --- 2. PROCESS AND ZIP ASSETS ---
    const processingPromises: Promise<void>[] = [];
    assetsToProcess.backgrounds.forEach(id => processingPromises.push(assetProcessors.backgrounds(id)));
    assetsToProcess.images.forEach(id => processingPromises.push(assetProcessors.images(id)));
    assetsToProcess.audio.forEach(id => processingPromises.push(assetProcessors.audio(id)));
    assetsToProcess.videos.forEach(id => processingPromises.push(assetProcessors.videos(id)));
    await Promise.all(processingPromises);
    
    // Process Characters (they are self-contained with direct data URLs)
    const charFolder = assetFolder.folder('characters');
    if (charFolder) {
        for (const charId in projectClone.characters) {
            const character = projectClone.characters[charId];
            const singleCharFolder = charFolder.folder(charId);
            if (!singleCharFolder) continue;

            if (character.baseImageUrl) {
                if (character.baseImageUrl.startsWith('data:')) {
                    const { blob, mimeType } = await dataUrlToBlob(character.baseImageUrl);
                    const filename = `base.${mimeToExtension(mimeType)}`;
                    singleCharFolder.file(filename, blob);
                    character.baseImageUrl = `assets/characters/${charId}/${filename}`;
                    addEmbedded('characters', character.baseImageUrl);
                } else {
                    const fetched = await fetchUrlToBlob(character.baseImageUrl);
                    if (fetched) {
                        const { blob, mimeType } = fetched;
                        const filename = `base.${mimeToExtension(mimeType)}`;
                        singleCharFolder.file(filename, blob);
                        character.baseImageUrl = `assets/characters/${charId}/${filename}`;
                        addEmbedded('characters', character.baseImageUrl);
                    } else {
                        addFailure(`characters:${charId}:base`);
                    }
                }
            }

            // Handle custom font URL
            if (character.fontUrl) {
                if (character.fontUrl.startsWith('data:')) {
                    const { blob, mimeType } = await dataUrlToBlob(character.fontUrl);
                    const ext = mimeType === 'font/otf' ? 'otf' : 'ttf';
                    const filename = `font.${ext}`;
                    singleCharFolder.file(filename, blob);
                    character.fontUrl = `assets/characters/${charId}/${filename}`;
                    addEmbedded('characters', character.fontUrl);
                } else {
                    const fetched = await fetchUrlToBlob(character.fontUrl);
                    if (fetched) {
                        const { blob } = fetched;
                        // Determine extension from URL or default to ttf
                        const ext = character.fontUrl.toLowerCase().endsWith('.otf') ? 'otf' : 'ttf';
                        const filename = `font.${ext}`;
                        singleCharFolder.file(filename, blob);
                        character.fontUrl = `assets/characters/${charId}/${filename}`;
                        addEmbedded('characters', character.fontUrl);
                    } else {
                        addFailure(`characters:${charId}:font`);
                    }
                }
            }

            for (const layerId in character.layers) {
                const layer = character.layers[layerId];
                const layerFolder = singleCharFolder.folder(layerId);
                if (!layerFolder) continue;
                for (const assetId in layer.assets) {
                    const asset = layer.assets[assetId];
                    if (asset.imageUrl) {
                        if (asset.imageUrl.startsWith('data:')) {
                            const { blob, mimeType } = await dataUrlToBlob(asset.imageUrl);
                            const filename = `${assetId}_${sanitizeFilename(asset.name, 'asset')}.${mimeToExtension(mimeType)}`;
                            layerFolder.file(filename, blob);
                            asset.imageUrl = `assets/characters/${charId}/${layerId}/${filename}`;
                            addEmbedded('characters', asset.imageUrl);
                        } else {
                            const fetched = await fetchUrlToBlob(asset.imageUrl);
                            if (fetched) {
                                const { blob, mimeType } = fetched;
                                const filename = `${assetId}_${sanitizeFilename(asset.name, 'asset')}.${mimeToExtension(mimeType)}`;
                                layerFolder.file(filename, blob);
                                asset.imageUrl = `assets/characters/${charId}/${layerId}/${filename}`;
                                addEmbedded('characters', asset.imageUrl);
                            } else {
                                addFailure(`characters:${charId}:${layerId}:${assetId}`);
                            }
                        }
                    }
                }
            }
        }
    }

    // Process stand-alone UI images
    if (projectClone.ui.dialogueBoxImage) {
        const assetType = projectClone.ui.dialogueBoxImage.type;
        const assetId = projectClone.ui.dialogueBoxImage.id;
        const asset = assetType === 'video' ? projectClone.videos[assetId] : projectClone.backgrounds[assetId];
        const assetUrl = assetType === 'video' ? (asset as VNVideo)?.videoUrl : (asset as VNBackground)?.imageUrl;
        
        if (assetUrl && assetUrl.startsWith('data:')) {
            const { blob, mimeType } = await dataUrlToBlob(assetUrl);
            const filename = `dialogue_box_${assetId}.${mimeToExtension(mimeType)}`;
            assetFolder.folder('ui')?.file(filename, blob);
            const embeddedPath = `assets/ui/${filename}`;
            addEmbedded('ui', embeddedPath);
            // Update the asset reference to use the embedded path
            if (assetType === 'video') {
                (projectClone.videos[assetId] as VNVideo).videoUrl = embeddedPath;
            } else {
                (projectClone.backgrounds[assetId] as VNBackground).imageUrl = embeddedPath;
            }
        } else if (assetUrl) {
            const fetched = await fetchUrlToBlob(assetUrl);
            if (fetched) {
                const { blob, mimeType } = fetched;
                const filename = `dialogue_box_${assetId}.${mimeToExtension(mimeType)}`;
                assetFolder.folder('ui')?.file(filename, blob);
                const embeddedPath = `assets/ui/${filename}`;
                addEmbedded('ui', embeddedPath);
                if (assetType === 'video') {
                    (projectClone.videos[assetId] as VNVideo).videoUrl = embeddedPath;
                } else {
                    (projectClone.backgrounds[assetId] as VNBackground).imageUrl = embeddedPath;
                }
            } else {
                addFailure(`ui:dialogueBox`);
            }
        }
    }
    
    if (projectClone.ui.choiceButtonImage) {
        const assetType = projectClone.ui.choiceButtonImage.type;
        const assetId = projectClone.ui.choiceButtonImage.id;
        const asset = assetType === 'video' ? projectClone.videos[assetId] : projectClone.backgrounds[assetId];
        const assetUrl = assetType === 'video' ? (asset as VNVideo)?.videoUrl : (asset as VNBackground)?.imageUrl;
        
        if (assetUrl && assetUrl.startsWith('data:')) {
            const { blob, mimeType } = await dataUrlToBlob(assetUrl);
            const filename = `choice_button_${assetId}.${mimeToExtension(mimeType)}`;
            assetFolder.folder('ui')?.file(filename, blob);
            const embeddedPath = `assets/ui/${filename}`;
            addEmbedded('ui', embeddedPath);
            if (assetType === 'video') {
                (projectClone.videos[assetId] as VNVideo).videoUrl = embeddedPath;
            } else {
                (projectClone.backgrounds[assetId] as VNBackground).imageUrl = embeddedPath;
            }
        } else if (assetUrl) {
            const fetched = await fetchUrlToBlob(assetUrl);
            if (fetched) {
                const { blob, mimeType } = fetched;
                const filename = `choice_button_${assetId}.${mimeToExtension(mimeType)}`;
                assetFolder.folder('ui')?.file(filename, blob);
                const embeddedPath = `assets/ui/${filename}`;
                addEmbedded('ui', embeddedPath);
                if (assetType === 'video') {
                    (projectClone.videos[assetId] as VNVideo).videoUrl = embeddedPath;
                } else {
                    (projectClone.backgrounds[assetId] as VNBackground).imageUrl = embeddedPath;
                }
            } else {
                addFailure(`ui:choiceButton`);
            }
        }
    }

    // --- 3. SAVE PROJECT.JSON AND GENERATE ZIP ---
    zip.file('project.json', JSON.stringify(projectClone, null, 2));
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const content = await zip.generateAsync({ type: 'blob' });
    const safeTitle = project.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    saveAs(content, `${safeTitle}_export.zip`);
};

export const importProject = async (file: File): Promise<{ project: VNProject; manifest?: ExportManifest }> => {
    const zip = await JSZip.loadAsync(file);
    const projectFile = zip.file('project.json');

    if (!projectFile) {
        throw new Error('project.json not found in the zip file.');
    }

    const projectContent = await projectFile.async('string');
    let project: VNProject;
    try {
        project = JSON.parse(projectContent);
    } catch (e) {
        throw new Error('Could not parse project.json. The file may be corrupt.');
    }

    // Optionally read manifest
    let parsedManifest: ExportManifest | undefined = undefined;
    const manifestFile = zip.file('manifest.json');
    if (manifestFile) {
        try {
            const manifestContent = await manifestFile.async('string');
            parsedManifest = JSON.parse(manifestContent);
            // Basic validation
            if (parsedManifest.schemaVersion && parsedManifest.schemaVersion !== 1) {
                console.warn('Imported project manifest schemaVersion mismatch:', parsedManifest.schemaVersion);
            }
            if (parsedManifest.fetchFailures && parsedManifest.fetchFailures.length > 0) {
                console.warn('Some assets could not be embedded during export:', parsedManifest.fetchFailures);
            }
        } catch (e) {
            console.warn('Failed to parse manifest.json from import:', e);
            parsedManifest = undefined;
        }
    }

    // --- DATA HYDRATION: Ensure project structure is up-to-date ---
    if (!project.images) project.images = {};
    if (project.characters) {
        for (const charId in project.characters) {
            const char = project.characters[charId];
            if (!char.layers) char.layers = {};
            if (!char.expressions) char.expressions = {};
        }
    }

    const defaultProj = createInitialProject();
    project.ui = {
        ...defaultProj.ui,
        ...(project.ui || {}),
        dialogueNameFont: { ...defaultProj.ui.dialogueNameFont, ...(project.ui?.dialogueNameFont || {}) },
        dialogueTextFont: { ...defaultProj.ui.dialogueTextFont, ...(project.ui?.dialogueTextFont || {}) },
        choiceTextFont: { ...defaultProj.ui.choiceTextFont, ...(project.ui?.choiceTextFont || {}) },
    };
    
    if (!project.uiScreens) {
        const { screens, specialIds } = createDefaultUIScreens();
        project.uiScreens = screens;
        project.ui = { ...project.ui, ...specialIds };
    }

    // Add ambient noise to UI screens that don't have it (backward compatibility)
    if (project.uiScreens) {
        for (const screenId in project.uiScreens) {
            const screen = project.uiScreens[screenId];
            if (!screen.ambientNoise) {
                screen.ambientNoise = { audioId: null, policy: 'continue' };
            }
            
            // Add expressionId to CharacterPreview elements that don't have it (backward compatibility)
            for (const elementId in screen.elements) {
                const element = screen.elements[elementId];
                if (element.type === UIElementType.CharacterPreview) {
                    const charPreview = element as UICharacterPreviewElement;
                    if (charPreview.expressionId === undefined && charPreview.characterId) {
                        // Set to first expression of the character if available
                        const char = project.characters[charPreview.characterId];
                        if (char) {
                            const firstExprId = Object.keys(char.expressions)[0];
                            charPreview.expressionId = firstExprId;
                        }
                    }
                }
            }
        }
    }
    // --- END HYDRATION ---

    const hydrateAsset = async (relativePath: string | null | undefined): Promise<string> => {
        if (!relativePath || relativePath.startsWith('data:')) {
            return relativePath || '';
        }
        const assetFile = zip.file(relativePath);
        if (assetFile) {
            try {
                const blob = await assetFile.async('blob');
                const extension = relativePath.split('.').pop() || 'bin';
                const mimeType = extensionToMime(extension);
                return await fileToBase64(new File([blob], assetFile.name, { type: mimeType }));
            } catch(e) {
                 console.error(`Failed to process asset from zip: ${relativePath}`, e);
                 return relativePath; // Return path if processing fails
            }
        }
        console.warn(`Asset not found in zip: ${relativePath}`);
        return relativePath; // Return path if not found
    };

    const hydrationPromises: Promise<any>[] = [];
    
    const collections: (keyof VNProject)[] = ['backgrounds', 'images', 'audio', 'videos'];
    const urlKeys = { backgrounds: 'imageUrl', images: 'imageUrl', audio: 'audioUrl', videos: 'videoUrl' };

    for (const collectionName of collections) {
        const collection = project[collectionName] as Record<VNID, { id: VNID, name: string, [key: string]: any }>;
        if (!collection) continue;
        for (const asset of Object.values(collection)) {
            const urlKey = urlKeys[collectionName as keyof typeof urlKeys];
            hydrationPromises.push(hydrateAsset(asset[urlKey]).then(dataUrl => { asset[urlKey] = dataUrl; }));
        }
    }

    for (const char of Object.values(project.characters) as VNCharacter[]) {
        hydrationPromises.push(hydrateAsset(char.baseImageUrl).then(dataUrl => { char.baseImageUrl = dataUrl; }));
        hydrationPromises.push(hydrateAsset(char.fontUrl).then(dataUrl => { char.fontUrl = dataUrl; }));
        for (const layer of Object.values(char.layers) as VNCharacterLayer[]) {
            for (const asset of Object.values(layer.assets) as VNLayerAsset[]) {
                hydrationPromises.push(hydrateAsset(asset.imageUrl).then(dataUrl => { asset.imageUrl = dataUrl; }));
            }
        }
    }
    
    // Dialogue box and choice button images are now asset references, not direct URLs
    // They are hydrated as part of the backgrounds/videos collections

    await Promise.all(hydrationPromises);
    
    // All saving logic has been removed. The app now manages the project state
    // in-memory. The returned project object should be passed to the main app state.

    return { project, manifest: parsedManifest };
};