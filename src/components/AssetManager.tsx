import React, { useState, useRef, useEffect } from 'react';
import { VNProject } from '../types/project';
import { VNBackground, VNImage, VNAudio, VNVideo } from '../features/assets/types';
import { VNVariable } from '../features/variables/types';
import { useProject } from '../contexts/ProjectContext';
import { PlusIcon, TrashIcon, PhotoIcon, MusicalNoteIcon, FilmIcon, PencilIcon } from './icons';
import { fileToBase64 } from '../utils/file';
import { AssetType } from '../features/assets/state/assetReducer';

type AssetCategory = 'backgrounds' | 'images' | 'audio' | 'videos';

interface AssetManagerProps {
    project: VNProject;
}

const AssetManager: React.FC<AssetManagerProps> = ({ project }) => {
    const { dispatch } = useProject();
    const [selectedAsset, setSelectedAsset] = useState<{ id: string; type: AssetType } | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [openCategories, setOpenCategories] = useState<Record<AssetCategory, boolean>>({
        backgrounds: true,
        images: false,
        audio: false,
        videos: false,
    });

    const assetCategories: Record<AssetCategory, { label: string; icon: React.ReactNode; accept?: string }> = {
        backgrounds: {
            label: 'Backgrounds',
            icon: <PhotoIcon className="w-4 h-4" />,
            accept: 'image/*,video/*',
        },
        images: {
            label: 'Images',
            icon: <PhotoIcon className="w-4 h-4" />,
            accept: 'image/*,video/*',
        },
        audio: {
            label: 'Audio',
            icon: <MusicalNoteIcon className="w-4 h-4" />,
            accept: 'audio/*',
        },
        videos: {
            label: 'Videos',
            icon: <FilmIcon className="w-4 h-4" />,
            accept: 'video/*',
        },
    };

    const getAssetsForCategory = (category: AssetCategory) => {
        switch (category) {
            case 'backgrounds': return Object.values(project.backgrounds || {});
            case 'images': return Object.values(project.images || {});
            case 'audio': return Object.values(project.audio || {});
            case 'videos': return Object.values(project.videos || {});
            default: return [];
        }
    };

    const addAsset = (category: AssetCategory, name: string, url: string) => {
        const newAsset = { id: `${category.slice(0, 4)}-${Math.random().toString(36).substring(2, 9)}`, name };
        let payload: any;

        const isVideo = url.startsWith('data:video/') || /\.(mp4|webm|ogg|mov)$/i.test(name);

        if (category === 'backgrounds') {
            payload = {
                ...newAsset,
                ...(isVideo ? { videoUrl: url, isVideo: true, loop: true } : { imageUrl: url })
            };
        } else if (category === 'images') {
            payload = {
                ...newAsset,
                ...(isVideo ? { videoUrl: url, isVideo: true, loop: true } : { imageUrl: url })
            };
        } else if (category === 'audio') {
            payload = { ...newAsset, audioUrl: url };
        } else if (category === 'videos') {
            payload = { ...newAsset, videoUrl: url };
        }

        console.log('[AssetManager] Adding asset:', { category, name, assetId: newAsset.id, payloadKeys: Object.keys(payload) });
        dispatch({ type: 'ADD_ASSET', payload: { assetType: category, asset: payload } });
    };

    const handleDeleteAsset = (assetType: AssetType, assetId: string) => {
        dispatch({ type: 'DELETE_ASSET', payload: { assetType, assetId } });
        if (selectedAsset?.id === assetId && selectedAsset?.type === assetType) {
            setSelectedAsset(null);
        }
    };

    const handleRenameAsset = (assetType: AssetType, assetId: string, name: string) => {
        dispatch({ type: 'UPDATE_ASSET', payload: { assetType, assetId, updates: { name } } });
        setRenamingId(null);
    };

    const toggleCategory = (category: AssetCategory) => {
        setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }));
    };

    return (
        <div className="flex h-full">
            {/* Asset Categories Sidebar */}
            <div className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col">
                <div className="p-4 border-b border-slate-700">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <PhotoIcon className="w-5 h-5" />
                        Assets
                    </h2>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {(Object.keys(assetCategories) as AssetCategory[]).map(category => (
                        <AssetCategorySection
                            key={category}
                            category={category}
                            assets={getAssetsForCategory(category)}
                            isOpen={openCategories[category]}
                            onToggle={() => toggleCategory(category)}
                            onSelectAsset={(asset) => setSelectedAsset({ id: asset.id, type: category })}
                            selectedAssetId={selectedAsset?.type === category ? selectedAsset.id : null}
                            onAddAsset={(name, url) => addAsset(category, name, url)}
                            onDeleteAsset={(assetId) => handleDeleteAsset(category, assetId)}
                            onRenameAsset={(assetId, name) => handleRenameAsset(category, assetId, name)}
                            renamingId={renamingId}
                            setRenamingId={setRenamingId}
                            accept={assetCategories[category].accept}
                        />
                    ))}
                </div>
            </div>

            {/* Asset Inspector */}
            <div className="flex-1 flex flex-col min-w-0">
                {selectedAsset ? (
                    <AssetInspector
                        assetType={selectedAsset.type}
                        assetId={selectedAsset.id}
                        project={project}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-400">
                        <div className="text-center">
                            <PhotoIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p className="text-lg">Select an asset to inspect</p>
                            <p className="text-sm">View and edit asset properties</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

interface AssetCategorySectionProps {
    category: AssetCategory;
    assets: any[];
    isOpen: boolean;
    onToggle: () => void;
    onSelectAsset: (asset: any) => void;
    selectedAssetId: string | null;
    onAddAsset: (name: string, url: string) => void;
    onDeleteAsset: (assetId: string) => void;
    onRenameAsset: (assetId: string, name: string) => void;
    renamingId: string | null;
    setRenamingId: (id: string | null) => void;
    accept?: string;
}

const AssetCategorySection: React.FC<AssetCategorySectionProps> = ({
    category,
    assets,
    isOpen,
    onToggle,
    onSelectAsset,
    selectedAssetId,
    onAddAsset,
    onDeleteAsset,
    onRenameAsset,
    renamingId,
    setRenamingId,
    accept
}) => {
    const getIcon = (category: AssetCategory) => {
        switch (category) {
            case 'backgrounds': return <PhotoIcon className="w-4 h-4" />;
            case 'images': return <PhotoIcon className="w-4 h-4" />;
            case 'audio': return <MusicalNoteIcon className="w-4 h-4" />;
            case 'videos': return <FilmIcon className="w-4 h-4" />;
        }
    };

    return (
        <div className="border border-slate-600 rounded-md">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between p-2 bg-slate-700 hover:bg-slate-600 rounded-t-md"
            >
                <div className="flex items-center gap-2 font-bold text-white">
                    {getIcon(category)} {category} ({assets.length})
                </div>
                <span className={`transform transition-transform text-white ${isOpen ? 'rotate-90' : ''}`}>▶</span>
            </button>

            {isOpen && (
                <div className="p-2 space-y-1 bg-slate-800 rounded-b-md">
                    {assets.map(asset => (
                        <AssetItem
                            key={asset.id}
                            asset={asset}
                            isSelected={selectedAssetId === asset.id}
                            isRenaming={renamingId === asset.id}
                            onSelect={() => onSelectAsset(asset)}
                            onStartRenaming={() => setRenamingId(asset.id)}
                            onCommitRename={(name) => onRenameAsset(asset.id, name)}
                            onDelete={() => onDeleteAsset(asset.id)}
                        />
                    ))}
                    <AssetUploader onUpload={(name, url) => onAddAsset(name, url)} accept={accept} />
                </div>
            )}
        </div>
    );
};

interface AssetItemProps {
    asset: any;
    isSelected: boolean;
    isRenaming: boolean;
    onSelect: () => void;
    onStartRenaming: () => void;
    onCommitRename: (name: string) => void;
    onDelete: () => void;
}

const AssetItem: React.FC<AssetItemProps> = ({
    asset,
    isSelected,
    isRenaming,
    onSelect,
    onStartRenaming,
    onCommitRename,
    onDelete
}) => {
    const [renameValue, setRenameValue] = useState(asset.name);

    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onCommitRename(renameValue);
        } else if (e.key === 'Escape') {
            setRenameValue(asset.name);
            onStartRenaming();
        }
    };

    const handleRenameBlur = () => {
        onCommitRename(renameValue);
    };

    const getThumbnail = () => {
        if (asset.imageUrl) {
            return <img src={asset.imageUrl} alt={asset.name} className="w-8 h-8 rounded-md object-cover flex-shrink-0 bg-slate-700" />;
        } else if (asset.videoUrl) {
            return <video src={asset.videoUrl} className="w-8 h-8 rounded-md object-cover flex-shrink-0 bg-slate-700" muted />;
        }
        return <div className="w-8 h-8 rounded-md bg-slate-700 flex items-center justify-center flex-shrink-0">
            <PhotoIcon className="w-4 h-4 text-slate-400" />
        </div>;
    };

    return (
        <div
            onClick={onSelect}
            onDoubleClick={onStartRenaming}
            className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                isSelected
                    ? 'bg-sky-500/20 border border-sky-500/50'
                    : 'hover:bg-slate-700'
            }`}
        >
            {getThumbnail()}

            <div className="flex-grow truncate">
                {isRenaming ? (
                    <input
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={handleRenameBlur}
                        onKeyDown={handleRenameKeyDown}
                        className="w-full bg-slate-900 text-white p-1 rounded text-sm outline-none ring-1 ring-sky-500"
                        onClick={e => e.stopPropagation()}
                        autoFocus
                    />
                ) : (
                    <span className="text-sm">{asset.name}</span>
                )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                <button
                    onClick={(e) => { e.stopPropagation(); onStartRenaming(); }}
                    className="p-1 text-slate-500 hover:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Rename"
                >
                    <PencilIcon className="w-3 h-3" />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete"
                >
                    <TrashIcon className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
};

const AssetUploader: React.FC<{ onUpload: (name: string, dataUrl: string) => void; accept?: string }> = ({ onUpload, accept }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            setIsUploading(true);
            const fileArray = Array.from(files) as File[];
            setUploadProgress({ current: 0, total: fileArray.length });
            
            let successCount = 0;
            let failCount = 0;
            const errors: string[] = [];

            for (let i = 0; i < fileArray.length; i++) {
                const file = fileArray[i];
                setUploadProgress({ current: i + 1, total: fileArray.length });
                
                try {
                    const base64 = await fileToBase64(file);
                    const name = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
                    onUpload(name, base64);
                    console.log('[AssetUploader] Successfully uploaded:', name);
                    successCount++;
                } catch (error) {
                    console.error('[AssetUploader] Failed to upload file:', error);
                    failCount++;
                    if (error instanceof Error && error.message !== 'Upload cancelled by user') {
                        errors.push(`${file.name}: ${error.message}`);
                    }
                }
            }

            // Show summary if there were any failures
            if (failCount > 0) {
                alert(`Upload Summary:\n✓ ${successCount} succeeded\n✗ ${failCount} failed\n\n${errors.join('\n')}\n\nFailed files may be too large or in an unsupported format.`);
            }

            setIsUploading(false);
            setUploadProgress(null);
            // Reset the input so the same files can be selected again if needed
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                onChange={handleFileChange}
                style={{ display: 'none' }}
                disabled={isUploading}
                multiple
            />

            <button
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
                className="w-full bg-sky-500 hover:bg-sky-600 text-white p-2 rounded-md flex items-center justify-center gap-2 font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <PlusIcon className="w-4 h-4" />
                {isUploading && uploadProgress 
                    ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...` 
                    : 'Upload Assets'}
            </button>
        </>
    );
};

interface AssetInspectorProps {
    assetType: AssetType;
    assetId: string;
    project: VNProject;
}

const AssetInspector: React.FC<AssetInspectorProps> = ({ assetType, assetId, project }) => {
    const getAsset = () => {
        switch (assetType) {
            case 'backgrounds': return project.backgrounds?.[assetId];
            case 'images': return project.images?.[assetId];
            case 'audio': return project.audio?.[assetId];
            case 'videos': return project.videos?.[assetId];
            default: return null;
        }
    };

    const asset = getAsset();

    if (!asset) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-400">
                <p>Asset not found</p>
            </div>
        );
    }

    return (
        <div className="flex-1 p-4 overflow-y-auto">
            <h3 className="text-xl font-bold text-white mb-4">{asset.name}</h3>

            <div className="space-y-4">
                {(asset.imageUrl || asset.videoUrl) && (
                    <div>
                        <h4 className="text-sm font-medium text-slate-300 mb-2">Preview</h4>
                        <div className="bg-slate-800 p-4 rounded-md">
                            {asset.videoUrl ? (
                                <video
                                    src={asset.videoUrl}
                                    controls
                                    className="max-w-full max-h-64 rounded-md"
                                    style={{ loop: asset.loop }}
                                />
                            ) : (
                                <img
                                    src={asset.imageUrl}
                                    alt={asset.name}
                                    className="max-w-full max-h-64 rounded-md object-contain"
                                />
                            )}
                        </div>
                    </div>
                )}

                {asset.audioUrl && (
                    <div>
                        <h4 className="text-sm font-medium text-slate-300 mb-2">Audio</h4>
                        <div className="bg-slate-800 p-4 rounded-md">
                            <audio src={asset.audioUrl} controls className="w-full" />
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="text-slate-400">Type:</span>
                        <span className="text-white ml-2 capitalize">{assetType.slice(0, -1)}</span>
                    </div>
                    <div>
                        <span className="text-slate-400">ID:</span>
                        <span className="text-white ml-2 font-mono text-xs">{asset.id}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AssetManager;