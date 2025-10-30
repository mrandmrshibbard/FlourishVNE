import React, { useState, useRef, useEffect } from 'react';
import { VNProject } from '../types/project';
import { VNBackground, VNImage, VNAudio, VNVideo } from '../features/assets/types';
import { VNVariable } from '../features/variables/types';
import { useProject } from '../contexts/ProjectContext';
import { PlusIcon, TrashIcon, PhotoIcon, MusicalNoteIcon, FilmIcon, PencilIcon } from './icons';
import { fileToBase64 } from '../utils/file';
import { AssetType } from '../features/assets/state/assetReducer';
import Input from './ui/Input';
import Select from './ui/Select';
import Button from './ui/Button';

type AssetCategory = 'backgrounds' | 'images' | 'audio' | 'videos';

interface AssetManagerProps {
    // No longer need project prop - using context directly
}

const AssetManager: React.FC<AssetManagerProps> = () => {
    const { project, dispatch } = useProject();
    const [selectedAsset, setSelectedAsset] = useState<{ id: string; type: AssetType } | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFolder, setSelectedFolder] = useState<string>('All');
    const [assetFolders, setAssetFolders] = useState<Record<string, string>>({});
    const [showNewFolderInput, setShowNewFolderInput] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [openCategories, setOpenCategories] = useState<Record<AssetCategory, boolean>>({
        backgrounds: true,
        images: false,
        audio: false,
        videos: false,
    });
    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
    const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

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

    const getFilteredAssetsForCategory = (category: AssetCategory) => {
        const assets = getAssetsForCategory(category) as any[];
        let filtered = assets;

        // Filter by search query
        if (searchQuery.trim()) {
            filtered = filtered.filter(asset =>
                asset.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        // Filter by folder
        if (selectedFolder !== 'All') {
            filtered = filtered.filter(asset => {
                const assetKey = `${category}-${asset.id}`;
                return assetFolders[assetKey] === selectedFolder;
            });
        }

        return filtered;
    };

    const addAsset = (category: AssetCategory, name: string, url: string, folder: string = 'Default') => {
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

        // Store folder information
        const assetKey = `${category}-${newAsset.id}`;
        setAssetFolders(prev => ({ ...prev, [assetKey]: folder }));
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

    const createFolder = () => {
        if (newFolderName.trim() && !Array.from(new Set(Object.values(assetFolders))).includes(newFolderName.trim())) {
            setSelectedFolder(newFolderName.trim());
            setNewFolderName('');
            setShowNewFolderInput(false);
        }
    };

    const toggleCategory = (category: AssetCategory) => {
        setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }));
    };

    const toggleMultiSelect = () => {
        setIsMultiSelectMode(!isMultiSelectMode);
        setSelectedAssets(new Set());
    };

    const toggleAssetSelection = (assetId: string) => {
        if (!isMultiSelectMode) return;
        
        const newSelected = new Set(selectedAssets);
        if (newSelected.has(assetId)) {
            newSelected.delete(assetId);
        } else {
            newSelected.add(assetId);
        }
        setSelectedAssets(newSelected);
    };

    const selectAllAssets = () => {
        const allAssetIds = new Set<string>();
        (['backgrounds', 'images', 'audio', 'videos'] as AssetCategory[]).forEach(category => {
            getFilteredAssetsForCategory(category).forEach(asset => {
                allAssetIds.add(asset.id);
            });
        });
        setSelectedAssets(allAssetIds);
    };

    const clearSelection = () => {
        setSelectedAssets(new Set());
    };

    const bulkDeleteAssets = () => {
        if (selectedAssets.size === 0) return;
        
        if (confirm(`Delete ${selectedAssets.size} selected asset(s)? This action cannot be undone.`)) {
            selectedAssets.forEach(assetId => {
                // Find which category this asset belongs to
                let assetType: AssetType | null = null;
                let category: AssetCategory | null = null;
                
                for (const cat of ['backgrounds', 'images', 'audio', 'videos'] as AssetCategory[]) {
                    const assets = getAssetsForCategory(cat) as any[];
                    if (assets.some(asset => asset.id === assetId)) {
                        category = cat;
                        assetType = cat.slice(0, -1) as AssetType; // Remove 's' from category name
                        break;
                    }
                }
                
                if (assetType) {
                    dispatch({ type: 'DELETE_ASSET', payload: { assetType, assetId } });
                }
            });
            setSelectedAssets(new Set());
            setSelectedAsset(null);
        }
    };

    const bulkMoveAssets = (targetFolder: string) => {
        if (selectedAssets.size === 0) return;
        
        selectedAssets.forEach(assetId => {
            // Find which category this asset belongs to and update its folder
            for (const cat of ['backgrounds', 'images', 'audio', 'videos'] as AssetCategory[]) {
                const assets = getAssetsForCategory(cat) as any[];
                const asset = assets.find(a => a.id === assetId);
                if (asset) {
                    const assetKey = `${cat}-${assetId}`;
                    setAssetFolders(prev => ({ ...prev, [assetKey]: targetFolder }));
                    break;
                }
            }
        });
        setSelectedAssets(new Set());
    };

    return (
        <div className="flex h-full min-w-[1300px] max-w-[1300px] min-h-[850px] max-h-[850px] gap-4 p-4 overflow-hidden">
            {/* Asset Categories Sidebar */}
            <div className="w-80 panel flex flex-col max-h-full">
                <div className="p-3 border-b-2 border-slate-700 flex-shrink-0">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <PhotoIcon className="w-5 h-5 text-yellow-400" />
                        Assets
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">Import and organize media files</p>
                    <div className="mt-4 space-y-3">
                        <Input
                            placeholder="Search assets..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <Select
                                value={selectedFolder}
                                onChange={(e) => setSelectedFolder(e.target.value)}
                                options={[
                                    { value: 'All', label: 'All Folders' },
                                    { value: 'Default', label: 'Default' },
                                    ...Array.from(new Set(Object.values(assetFolders))).map(folder => ({
                                        value: folder,
                                        label: folder
                                    }))
                                ]}
                                className="flex-1"
                            />
                            <Button
                                onClick={() => setShowNewFolderInput(!showNewFolderInput)}
                                variant="ghost"
                                size="sm"
                                title="Create new folder"
                            >
                                <PlusIcon className="w-4 h-4" />
                            </Button>
                        </div>
                        {showNewFolderInput && (
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Folder name..."
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                                    className="flex-1"
                                    autoFocus
                                />
                                <Button
                                    onClick={createFolder}
                                    variant="success"
                                    size="sm"
                                >
                                    Create
                                </Button>
                                <Button
                                    onClick={() => {
                                        setShowNewFolderInput(false);
                                        setNewFolderName('');
                                    }}
                                    variant="ghost"
                                    size="sm"
                                >
                                    Cancel
                                </Button>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center justify-between mt-3">
                        <div className="flex gap-2">
                            <button
                                onClick={toggleMultiSelect}
                                className={`px-2 py-1 text-xs rounded ${isMultiSelectMode ? 'bg-sky-500 text-white' : 'bg-slate-600 text-gray-300 hover:bg-slate-500'}`}
                            >
                                {isMultiSelectMode ? 'Cancel' : 'Select'}
                            </button>
                        </div>
                    </div>
                    
                    {isMultiSelectMode && (
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={selectAllAssets}
                                className="px-2 py-1 text-xs bg-slate-600 text-gray-300 hover:bg-slate-500 rounded"
                            >
                                All
                            </button>
                            <button
                                onClick={clearSelection}
                                className="px-2 py-1 text-xs bg-slate-600 text-gray-300 hover:bg-slate-500 rounded"
                            >
                                None
                            </button>
                            {selectedAssets.size > 0 && (
                                <>
                                    <button
                                        onClick={bulkDeleteAssets}
                                        className="px-2 py-1 text-xs bg-red-600 text-white hover:bg-red-500 rounded"
                                    >
                                        Delete ({selectedAssets.size})
                                    </button>
                                    <Select
                                        value=""
                                        onChange={(e) => e.target.value && bulkMoveAssets(e.target.value)}
                                        options={[
                                            { value: '', label: 'Move to...' },
                                            { value: 'Default', label: 'Default' },
                                            ...Array.from(new Set(Object.values(assetFolders))).map(folder => ({
                                                value: folder,
                                                label: folder
                                            }))
                                        ]}
                                        className="text-xs"
                                    />
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
                    {(Object.keys(assetCategories) as AssetCategory[]).map(category => {
                        const filteredAssets = getFilteredAssetsForCategory(category);
                        return (
                            <AssetCategorySection
                                key={category}
                                category={category}
                                assets={filteredAssets}
                                isOpen={openCategories[category]}
                                onToggle={() => toggleCategory(category)}
                                onSelectAsset={(asset) => setSelectedAsset({ id: asset.id, type: category })}
                                selectedAssetId={selectedAsset?.type === category ? selectedAsset.id : null}
                                onAddAsset={(name, url) => addAsset(category, name, url, selectedFolder === 'All' ? 'Default' : selectedFolder)}
                                onDeleteAsset={(assetId) => handleDeleteAsset(category, assetId)}
                                onRenameAsset={(assetId, name) => handleRenameAsset(category, assetId, name)}
                                renamingId={renamingId}
                                setRenamingId={setRenamingId}
                                isMultiSelectMode={isMultiSelectMode}
                                selectedAssets={selectedAssets}
                                onToggleAssetSelection={toggleAssetSelection}
                                accept={assetCategories[category].accept}
                            />
                        );
                    })}
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
    isMultiSelectMode: boolean;
    selectedAssets: Set<string>;
    onToggleAssetSelection: (assetId: string) => void;
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
    isMultiSelectMode,
    selectedAssets,
    onToggleAssetSelection,
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
                            isMultiSelectMode={isMultiSelectMode}
                            isAssetSelected={selectedAssets.has(asset.id)}
                            onSelect={() => onSelectAsset(asset)}
                            onToggleSelection={() => onToggleAssetSelection(asset.id)}
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
    isMultiSelectMode: boolean;
    isAssetSelected: boolean;
    onSelect: () => void;
    onToggleSelection: () => void;
    onStartRenaming: () => void;
    onCommitRename: (name: string) => void;
    onDelete: () => void;
}

const AssetItem: React.FC<AssetItemProps> = ({
    asset,
    isSelected,
    isRenaming,
    isMultiSelectMode,
    isAssetSelected,
    onSelect,
    onToggleSelection,
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
            onClick={isMultiSelectMode ? onToggleSelection : onSelect}
            onDoubleClick={isMultiSelectMode ? undefined : onStartRenaming}
            className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                isSelected
                    ? 'bg-sky-500/20 border border-sky-500/50'
                    : isAssetSelected
                    ? 'bg-green-500/20 border border-green-500/50'
                    : 'hover:bg-slate-700'
            }`}
        >
            {isMultiSelectMode && (
                <input
                    type="checkbox"
                    checked={isAssetSelected}
                    onChange={() => {}} // Handled by onClick
                    className="w-4 h-4 text-green-600 bg-slate-700 border-slate-500 rounded focus:ring-green-500"
                    onClick={(e) => e.stopPropagation()}
                />
            )}
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

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsUploading(true);
            try {
                const base64 = await fileToBase64(file);
                const name = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
                onUpload(name, base64);
                console.log('[AssetUploader] Successfully uploaded:', name);
            } catch (error) {
                console.error('[AssetUploader] Failed to upload file:', error);
                if (error instanceof Error && error.message !== 'Upload cancelled by user') {
                    alert(`Failed to upload ${file.name}:\n\n${error.message}\n\nPlease try a smaller file or compress the video.`);
                }
            } finally {
                setIsUploading(false);
                // Reset the input so the same file can be selected again if needed
                if (inputRef.current) inputRef.current.value = '';
            }
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
            />

            <button
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
                className="w-full bg-sky-500 hover:bg-sky-600 text-white p-2 rounded-md flex items-center justify-center gap-2 font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <PlusIcon className="w-4 h-4" />
                {isUploading ? 'Uploading...' : 'Upload Asset'}
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
