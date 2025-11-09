import React, { useState, useRef, useEffect, useMemo } from 'react';
import { VNProject } from '../types/project';
import { VNBackground, VNImage, VNAudio, VNVideo } from '../features/assets/types';
import { VNVariable } from '../features/variables/types';
import { useProject } from '../contexts/ProjectContext';
import { PlusIcon, TrashIcon, PhotoIcon, MusicalNoteIcon, FilmIcon, PencilIcon, FolderIcon, GridIcon, ListIcon, SearchIcon, ChevronRightIcon, XMarkIcon } from './icons';
import { fileToBase64 } from '../utils/file';
import { AssetType } from '../features/assets/state/assetReducer';

type AssetCategory = 'backgrounds' | 'images' | 'audio' | 'videos';
type ViewMode = 'grid' | 'list';

interface AssetManagerProps {
    project: VNProject;
}

interface DirectoryNode {
    name: string;
    path: string;
    children: DirectoryNode[];
    assets: any[];
    isExpanded: boolean;
}

const AssetManager: React.FC<AssetManagerProps> = ({ project }) => {
    const { dispatch } = useProject();
    const [selectedCategory, setSelectedCategory] = useState<AssetCategory>('backgrounds');
    const [selectedAsset, setSelectedAsset] = useState<{ id: string; type: AssetType } | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPath, setCurrentPath] = useState<string>(''); // Current directory path
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    
    // Modal states
    const [showFolderSelector, setShowFolderSelector] = useState(false);
    const [moveAssetData, setMoveAssetData] = useState<{ id: string; name: string; type: AssetType } | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<{ type: 'asset' | 'folder'; id?: string; path?: string; name: string } | null>(null);
    const [draggedAsset, setDraggedAsset] = useState<{ id: string; type: AssetType } | null>(null);

    const assetCategories: Record<AssetCategory, { label: string; icon: React.ReactNode; accept?: string; color: string }> = {
        backgrounds: {
            label: 'Backgrounds',
            icon: <PhotoIcon className="w-5 h-5" />,
            accept: 'image/*,video/*',
            color: 'text-purple-400'
        },
        images: {
            label: 'Images',
            icon: <PhotoIcon className="w-5 h-5" />,
            accept: 'image/*,video/*',
            color: 'text-blue-400'
        },
        audio: {
            label: 'Audio',
            icon: <MusicalNoteIcon className="w-5 h-5" />,
            accept: 'audio/*',
            color: 'text-green-400'
        },
        videos: {
            label: 'Videos',
            icon: <FilmIcon className="w-5 h-5" />,
            accept: 'video/*',
            color: 'text-pink-400'
        },
    };

    const getAssetsForCategory = (category: AssetCategory): any[] => {
        switch (category) {
            case 'backgrounds': return Object.values(project.backgrounds || {});
            case 'images': return Object.values(project.images || {});
            case 'audio': return Object.values(project.audio || {});
            case 'videos': return Object.values(project.videos || {});
            default: return [];
        }
    };

    // Build directory tree from assets
    const buildDirectoryTree = (assets: any[]): DirectoryNode => {
        const root: DirectoryNode = {
            name: 'Root',
            path: '',
            children: [],
            assets: [],
            isExpanded: true
        };

        const folderMap = new Map<string, DirectoryNode>();
        folderMap.set('', root);

        // First pass: create all folders
        assets.forEach(asset => {
            const assetPath = asset.path || '';
            if (assetPath) {
                const parts = assetPath.split('/').filter(p => p);
                let currentPath = '';
                
                parts.forEach((part, index) => {
                    const parentPath = currentPath;
                    currentPath = currentPath ? `${currentPath}/${part}` : part;
                    
                    if (!folderMap.has(currentPath)) {
                        const newFolder: DirectoryNode = {
                            name: part,
                            path: currentPath,
                            children: [],
                            assets: [],
                            isExpanded: false
                        };
                        folderMap.set(currentPath, newFolder);
                        
                        const parent = folderMap.get(parentPath)!;
                        parent.children.push(newFolder);
                    }
                });
            }
        });

        // Second pass: assign assets to folders
        assets.forEach(asset => {
            const assetPath = asset.path || '';
            const folder = folderMap.get(assetPath)!;
            folder.assets.push(asset);
        });

        // Sort children and assets
        const sortNode = (node: DirectoryNode) => {
            node.children.sort((a, b) => a.name.localeCompare(b.name));
            node.assets.sort((a, b) => a.name.localeCompare(b.name));
            node.children.forEach(sortNode);
        };
        sortNode(root);

        return root;
    };

    const allAssets = useMemo(() => getAssetsForCategory(selectedCategory), [selectedCategory, project]);
    const directoryTree = useMemo(() => buildDirectoryTree(allAssets), [allAssets]);

    // Get current directory node
    const getCurrentDirectory = (): DirectoryNode => {
        if (!currentPath) return directoryTree;
        
        const parts = currentPath.split('/').filter(p => p);
        let node = directoryTree;
        
        for (const part of parts) {
            const child = node.children.find(c => c.name === part);
            if (!child) return directoryTree;
            node = child;
        }
        
        return node;
    };

    const currentDirectory = getCurrentDirectory();

    // Filter assets by search query - search ALL assets when searching, not just current directory
    const filteredAssets = useMemo(() => {
        if (!searchQuery) {
            // No search - show only current directory assets
            return currentDirectory.assets.filter(asset => !asset.isPlaceholder && asset.name !== '.folder_marker');
        }
        
        // Searching - search ALL assets across all directories
        const query = searchQuery.toLowerCase();
        return allAssets.filter(asset => 
            !asset.isPlaceholder && 
            asset.name !== '.folder_marker' &&
            asset.name.toLowerCase().includes(query)
        );
    }, [currentDirectory.assets, allAssets, searchQuery]);
    
    // When searching, we need to show results from all folders
    const isSearching = searchQuery.trim().length > 0;

    const addAsset = (category: AssetCategory, name: string, url: string, path: string = '') => {
        const newAsset = { id: `${category.slice(0, 4)}-${Math.random().toString(36).substring(2, 9)}`, name, path };
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

        console.log('[AssetManager] Adding asset:', { category, name, path, assetId: newAsset.id });
        dispatch({ type: 'ADD_ASSET', payload: { assetType: category, asset: payload } });
    };

    const handleDeleteAsset = (assetType: AssetType, assetId: string, assetName: string) => {
        setDeleteTarget({ type: 'asset', id: assetId, name: assetName });
        setShowDeleteConfirm(true);
    };
    
    const confirmDelete = () => {
        if (!deleteTarget) return;
        
        if (deleteTarget.type === 'asset' && deleteTarget.id) {
            dispatch({ type: 'DELETE_ASSET', payload: { assetType: selectedCategory, assetId: deleteTarget.id } });
            if (selectedAsset?.id === deleteTarget.id && selectedAsset?.type === selectedCategory) {
                setSelectedAsset(null);
            }
        } else if (deleteTarget.type === 'folder' && deleteTarget.path) {
            // Delete all assets in this folder and subfolders
            const assetsToDelete = allAssets.filter(asset => 
                (asset.path || '').startsWith(deleteTarget.path!)
            );
            
            assetsToDelete.forEach(asset => {
                dispatch({ type: 'DELETE_ASSET', payload: { assetType: selectedCategory, assetId: asset.id } });
            });
            
            // Navigate to parent if we're in the deleted folder
            if (currentPath.startsWith(deleteTarget.path!)) {
                const parentPath = deleteTarget.path!.split('/').slice(0, -1).join('/');
                setCurrentPath(parentPath);
            }
        }
        
        setShowDeleteConfirm(false);
        setDeleteTarget(null);
    };

    const handleRenameAsset = (assetType: AssetType, assetId: string, name: string) => {
        dispatch({ type: 'UPDATE_ASSET', payload: { assetType, assetId, updates: { name } } });
        setRenamingId(null);
    };

    const handleMoveAsset = (assetType: AssetType, assetId: string, newPath: string) => {
        dispatch({ type: 'UPDATE_ASSET', payload: { assetType, assetId, updates: { path: newPath } } });
    };

    const handleCreateFolder = () => {
        if (!newFolderName.trim()) return;
        
        // Validate folder name
        const folderName = newFolderName.trim();
        if (/[\/\\]/.test(folderName)) {
            // Show error in UI instead of alert
            setNewFolderName('');
            setCreatingFolder(false);
            return;
        }
        
        // Create the full path for the new folder
        const newFolderPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        
        // Check if folder already exists
        const existingFolder = currentDirectory.children.find(f => f.name === folderName);
        if (existingFolder) {
            // Show error in UI instead of alert
            setNewFolderName('');
            setCreatingFolder(false);
            return;
        }
        
        // Create a placeholder asset in the new folder to make it exist
        // This is a dummy asset that marks the folder as existing
        const placeholderAsset = {
            id: `folder-placeholder-${Math.random().toString(36).substring(2, 9)}`,
            name: '.folder_marker',
            path: newFolderPath,
            isPlaceholder: true
        };
        
        // Add the placeholder based on category type
        if (selectedCategory === 'backgrounds' || selectedCategory === 'images') {
            dispatch({ 
                type: 'ADD_ASSET', 
                payload: { 
                    assetType: selectedCategory, 
                    asset: { ...placeholderAsset, imageUrl: '' } 
                } 
            });
        } else if (selectedCategory === 'audio') {
            dispatch({ 
                type: 'ADD_ASSET', 
                payload: { 
                    assetType: selectedCategory, 
                    asset: { ...placeholderAsset, audioUrl: '' } 
                } 
            });
        } else if (selectedCategory === 'videos') {
            dispatch({ 
                type: 'ADD_ASSET', 
                payload: { 
                    assetType: selectedCategory, 
                    asset: { ...placeholderAsset, videoUrl: '' } 
                } 
            });
        }
        
        setCreatingFolder(false);
        setNewFolderName('');
    };

    const handleDeleteFolder = (folderPath: string, folderName: string) => {
        setDeleteTarget({ type: 'folder', path: folderPath, name: folderName });
        setShowDeleteConfirm(true);
    };

    const handlePromptMoveAsset = (assetType: AssetType, assetId: string, assetName: string) => {
        setMoveAssetData({ id: assetId, name: assetName, type: assetType });
        setShowFolderSelector(true);
    };
    
    const confirmMoveAsset = (newPath: string) => {
        if (!moveAssetData) return;
        handleMoveAsset(moveAssetData.type, moveAssetData.id, newPath);
        setShowFolderSelector(false);
        setMoveAssetData(null);
    };

    const navigateToPath = (path: string) => {
        setCurrentPath(path);
        setSearchQuery(''); // Clear search when navigating
    };

    const getBreadcrumbs = () => {
        if (!currentPath) return [{ name: 'Root', path: '' }];
        
        const parts = currentPath.split('/').filter(p => p);
        const breadcrumbs = [{ name: 'Root', path: '' }];
        
        let accumulatedPath = '';
        parts.forEach(part => {
            accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
            breadcrumbs.push({ name: part, path: accumulatedPath });
        });
        
        return breadcrumbs;
    };

    return (
        <div className="flex h-full">
            {/* Category Sidebar */}
            <div style={{ width: 'var(--sidebar-width)' }} className="bg-slate-800 border-r border-slate-700 flex flex-col">
                <div className="p-4 border-b border-slate-700">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <PhotoIcon className="w-5 h-5" />
                        Assets
                    </h2>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {(Object.keys(assetCategories) as AssetCategory[]).map(category => {
                        const categoryInfo = assetCategories[category];
                        const assetCount = getAssetsForCategory(category).length;
                        
                        return (
                            <button
                                key={category}
                                onClick={() => {
                                    setSelectedCategory(category);
                                    setCurrentPath('');
                                    setSearchQuery('');
                                }}
                                className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${
                                    selectedCategory === category
                                        ? 'bg-gradient-to-r from-sky-500/20 to-purple-500/20 border border-sky-500/50'
                                        : 'bg-slate-700/50 hover:bg-slate-700 border border-transparent'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={categoryInfo.color}>
                                        {categoryInfo.icon}
                                    </div>
                                    <div className="text-left">
                                        <div className="font-medium text-white text-sm">{categoryInfo.label}</div>
                                        <div className="text-xs text-slate-400">{assetCount} items</div>
                                    </div>
                                </div>
                                {selectedCategory === category && (
                                    <ChevronRightIcon className="w-4 h-4 text-sky-400" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Toolbar */}
                <div className="bg-slate-800 border-b border-slate-700 p-4 space-y-3">
                    {/* Breadcrumbs */}
                    <div className="flex items-center gap-2 text-sm">
                        {getBreadcrumbs().map((crumb, index, arr) => (
                            <React.Fragment key={crumb.path}>
                                <button
                                    onClick={() => navigateToPath(crumb.path)}
                                    className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                                        index === arr.length - 1
                                            ? 'text-white font-medium'
                                            : 'text-slate-400 hover:text-white hover:bg-slate-700'
                                    }`}
                                >
                                    {index === 0 && <FolderIcon className="w-4 h-4" />}
                                    {crumb.name}
                                </button>
                                {index < arr.length - 1 && (
                                    <ChevronRightIcon className="w-4 h-4 text-slate-500" />
                                )}
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Search and Controls */}
                    <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search assets..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-900 text-white pl-10 pr-4 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-500/50"
                            />
                        </div>

                        <div className="flex items-center gap-2 border border-slate-600 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded transition-colors ${
                                    viewMode === 'grid'
                                        ? 'bg-sky-500 text-white'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                                title="Grid View"
                            >
                                <GridIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded transition-colors ${
                                    viewMode === 'list'
                                        ? 'bg-sky-500 text-white'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                                title="List View"
                            >
                                <ListIcon className="w-4 h-4" />
                            </button>
                        </div>

                        <button
                            onClick={() => setCreatingFolder(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-all border border-slate-600"
                            title="New Folder"
                        >
                            <FolderIcon className="w-4 h-4 text-yellow-500" />
                            <PlusIcon className="w-3 h-3" />
                        </button>

                        <AssetUploader 
                            onUpload={(name, url) => addAsset(selectedCategory, name, url, currentPath)}
                            accept={assetCategories[selectedCategory].accept}
                        />
                    </div>
                </div>

                {/* Asset Display Area */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-900">
                    {/* Search Results Info */}
                    {isSearching && filteredAssets.length > 0 && (
                        <div className="mb-4 p-3 bg-sky-500/10 border border-sky-500/30 rounded-lg">
                            <p className="text-sky-400 text-sm">
                                Found <span className="font-bold">{filteredAssets.length}</span> result{filteredAssets.length !== 1 ? 's' : ''} for "{searchQuery}"
                            </p>
                        </div>
                    )}
                    
                    {/* Folders - hide when searching */}
                    {!isSearching && (currentDirectory.children.length > 0 || creatingFolder) && (
                        <div className="mb-6">
                            <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">Folders</h3>
                            <div className={viewMode === 'grid' ? 'grid grid-cols-4 gap-4' : 'space-y-2'}>
                                {/* New Folder Creation Card */}
                                {creatingFolder && (
                                    <div className="bg-slate-800 rounded-lg p-4 border-2 border-dashed border-sky-500">
                                        <div className="flex flex-col items-center text-center">
                                            <FolderIcon className="w-12 h-12 text-yellow-500 mb-3" />
                                            <input
                                                type="text"
                                                placeholder="Folder name"
                                                value={newFolderName}
                                                onChange={(e) => setNewFolderName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        handleCreateFolder();
                                                    } else if (e.key === 'Escape') {
                                                        setCreatingFolder(false);
                                                        setNewFolderName('');
                                                    }
                                                }}
                                                className="w-full bg-slate-900 text-white px-3 py-2 rounded-lg text-sm outline-none ring-2 ring-sky-500 mb-3"
                                                autoFocus
                                            />
                                            <div className="flex items-center gap-2 w-full">
                                                <button
                                                    onClick={handleCreateFolder}
                                                    disabled={!newFolderName.trim()}
                                                    className="flex-1 bg-sky-500 hover:bg-sky-600 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Create
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setCreatingFolder(false);
                                                        setNewFolderName('');
                                                    }}
                                                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                {currentDirectory.children.map(folder => (
                                    <FolderCard
                                        key={folder.path}
                                        folder={folder}
                                        viewMode={viewMode}
                                        onClick={() => navigateToPath(folder.path)}
                                        onDelete={() => handleDeleteFolder(folder.path, folder.name)}
                                        onDrop={(folderPath) => {
                                            if (draggedAsset) {
                                                handleMoveAsset(draggedAsset.type, draggedAsset.id, folderPath);
                                            }
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Assets */}
                    {filteredAssets.length > 0 ? (
                        <div>
                            <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">
                                {isSearching 
                                    ? 'Search Results' 
                                    : currentDirectory.children.length > 0 
                                        ? 'Files' 
                                        : 'Assets'
                                }
                            </h3>
                            <div className={viewMode === 'grid' ? 'grid grid-cols-4 gap-4' : 'space-y-2'}>
                                {filteredAssets.map(asset => (
                                    <AssetCard
                                        key={asset.id}
                                        asset={asset}
                                        assetType={selectedCategory}
                                        viewMode={viewMode}
                                        isSelected={selectedAsset?.id === asset.id && selectedAsset?.type === selectedCategory}
                                        isRenaming={renamingId === asset.id}
                                        onSelect={() => setSelectedAsset({ id: asset.id, type: selectedCategory })}
                                        onStartRenaming={() => setRenamingId(asset.id)}
                                        onCommitRename={(name) => handleRenameAsset(selectedCategory, asset.id, name)}
                                        onDelete={() => handleDeleteAsset(selectedCategory, asset.id, asset.name)}
                                        onMove={() => handlePromptMoveAsset(selectedCategory, asset.id, asset.name)}
                                        onDragStart={() => setDraggedAsset({ id: asset.id, type: selectedCategory })}
                                        onDragEnd={() => setDraggedAsset(null)}
                                        showPath={isSearching}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : searchQuery ? (
                        <EmptyState
                            icon={<SearchIcon className="w-16 h-16 opacity-30" />}
                            title="No results found"
                            description={`No assets matching "${searchQuery}"`}
                        />
                    ) : (
                        <EmptyState
                            icon={assetCategories[selectedCategory].icon}
                            title="No assets yet"
                            description={`Upload ${selectedCategory} to get started`}
                        />
                    )}
                </div>
            </div>

            {/* Asset Inspector (Right Panel) */}
            {selectedAsset && (
                <div style={{ width: 'var(--inspector-width)' }} className="bg-slate-800 border-l border-slate-700 flex flex-col overflow-y-auto">
                    <AssetInspector
                        assetType={selectedAsset.type}
                        assetId={selectedAsset.id}
                        project={project}
                        onClose={() => setSelectedAsset(null)}
                    />
                </div>
            )}
            
            {/* Modals */}
            <FolderSelectorModal
                isOpen={showFolderSelector}
                assetName={moveAssetData?.name || ''}
                currentPath={currentPath}
                allAssets={allAssets}
                onSelect={confirmMoveAsset}
                onClose={() => {
                    setShowFolderSelector(false);
                    setMoveAssetData(null);
                }}
            />
            
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                title={deleteTarget?.type === 'folder' ? 'Delete Folder' : 'Delete Asset'}
                message={
                    deleteTarget?.type === 'folder'
                        ? `Delete "${deleteTarget.name}" and all its contents? This cannot be undone.`
                        : `Delete "${deleteTarget?.name}"? This cannot be undone.`
                }
                confirmText="Delete"
                cancelText="Cancel"
                danger={true}
                onConfirm={confirmDelete}
                onCancel={() => {
                    setShowDeleteConfirm(false);
                    setDeleteTarget(null);
                }}
            />
        </div>
    );
};

interface FolderCardProps {
    folder: DirectoryNode;
    viewMode: ViewMode;
    onClick: () => void;
    onDelete: () => void;
    onDrop: (folderPath: string) => void;
    isDragOver?: boolean;
}

const FolderCard: React.FC<FolderCardProps> = ({ folder, viewMode, onClick, onDelete, onDrop, isDragOver }) => {
    const totalAssets = folder.assets.length + folder.children.reduce((acc, child) => acc + child.assets.length, 0);
    
    const [isHovering, setIsHovering] = useState(false);
    
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsHovering(true);
    };
    
    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsHovering(false);
    };
    
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsHovering(false);
        onDrop(folder.path);
    };

    if (viewMode === 'grid') {
        return (
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={onClick}
                className={`group relative bg-slate-800 rounded-lg p-4 cursor-pointer border transition-all ${
                    isHovering
                        ? 'border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/50'
                        : 'border-slate-700 hover:border-sky-500/50 hover:bg-slate-750'
                }`}
            >
                <div className="flex flex-col items-center text-center">
                    <FolderIcon className={`w-12 h-12 mb-2 ${isHovering ? 'text-sky-400' : 'text-yellow-500'}`} />
                    <div className="font-medium text-white text-sm truncate w-full">{folder.name}</div>
                    <div className="text-xs text-slate-400 mt-1">{totalAssets} items</div>
                </div>

                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="absolute top-2 right-2 p-1.5 rounded bg-slate-900/80 text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete Folder"
                >
                    <TrashIcon className="w-3 h-3" />
                </button>
            </div>
        );
    }

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={onClick}
            className={`group flex items-center gap-3 bg-slate-800 rounded-lg p-3 cursor-pointer border transition-all ${
                isHovering
                    ? 'border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/50'
                    : 'border-slate-700 hover:border-sky-500/50 hover:bg-slate-750'
            }`}
        >
            <FolderIcon className={`w-8 h-8 flex-shrink-0 ${isHovering ? 'text-sky-400' : 'text-yellow-500'}`} />
            <div className="flex-1 min-w-0">
                <div className="font-medium text-white text-sm truncate">{folder.name}</div>
                <div className="text-xs text-slate-400">{totalAssets} items</div>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-1.5 rounded text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete Folder"
            >
                <TrashIcon className="w-4 h-4" />
            </button>
            <ChevronRightIcon className="w-4 h-4 text-slate-500" />
        </div>
    );
};

interface AssetCardProps {
    asset: any;
    assetType: AssetType;
    viewMode: ViewMode;
    isSelected: boolean;
    isRenaming: boolean;
    onSelect: () => void;
    onStartRenaming: () => void;
    onCommitRename: (name: string) => void;
    onDelete: () => void;
    onMove: () => void;
    onDragStart: () => void;
    onDragEnd: () => void;
    showPath?: boolean;
}

const AssetCard: React.FC<AssetCardProps> = ({
    asset,
    assetType,
    viewMode,
    isSelected,
    isRenaming,
    onSelect,
    onStartRenaming,
    onCommitRename,
    onDelete,
    onMove,
    onDragStart,
    onDragEnd,
    showPath = false
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

    const getThumbnail = () => {
        if (asset.imageUrl) {
            return <img src={asset.imageUrl} alt={asset.name} className="w-full h-full object-cover" />;
        } else if (asset.videoUrl) {
            return <video src={asset.videoUrl} className="w-full h-full object-cover" muted />;
        } else if (asset.audioUrl) {
            return <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-500/20 to-emerald-500/20">
                <MusicalNoteIcon className="w-12 h-12 text-green-400" />
            </div>;
        }
        return <div className="w-full h-full flex items-center justify-center bg-slate-700">
            <PhotoIcon className="w-12 h-12 text-slate-400" />
        </div>;
    };

    if (viewMode === 'grid') {
        return (
            <div
                draggable
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onClick={onSelect}
                onDoubleClick={onStartRenaming}
                className={`group relative bg-slate-800 rounded-lg overflow-hidden cursor-move border transition-all ${
                    isSelected
                        ? 'border-sky-500 ring-2 ring-sky-500/30'
                        : 'border-slate-700 hover:border-sky-500/50'
                }`}
            >
                <div className="aspect-square">{getThumbnail()}</div>
                
                <div className="p-3">
                    {isRenaming ? (
                        <input
                            type="text"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onBlur={() => onCommitRename(renameValue)}
                            onKeyDown={handleRenameKeyDown}
                            className="w-full bg-slate-900 text-white px-2 py-1 rounded text-sm outline-none ring-2 ring-sky-500"
                            onClick={e => e.stopPropagation()}
                            autoFocus
                        />
                    ) : (
                        <>
                            <div className="text-sm text-white truncate font-medium">{asset.name}</div>
                            {showPath && asset.path && (
                                <div className="mt-1 flex items-center gap-1">
                                    <FolderIcon className="w-3 h-3 text-slate-500 flex-shrink-0" />
                                    <span className="text-xs text-slate-400 truncate">{asset.path}</span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => { e.stopPropagation(); onMove(); }}
                        className="p-1.5 rounded bg-slate-900/80 text-slate-400 hover:text-yellow-400"
                        title="Move to Folder"
                    >
                        <FolderIcon className="w-3 h-3" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onStartRenaming(); }}
                        className="p-1.5 rounded bg-slate-900/80 text-slate-400 hover:text-sky-400"
                        title="Rename"
                    >
                        <PencilIcon className="w-3 h-3" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="p-1.5 rounded bg-slate-900/80 text-slate-400 hover:text-red-400"
                        title="Delete"
                    >
                        <TrashIcon className="w-3 h-3" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onSelect}
            onDoubleClick={onStartRenaming}
            className={`group flex items-center gap-4 bg-slate-800 rounded-lg p-3 cursor-move border transition-all ${
                isSelected
                    ? 'border-sky-500 ring-2 ring-sky-500/30'
                    : 'border-slate-700 hover:border-sky-500/50'
            }`}
        >
            <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                {getThumbnail()}
            </div>

            <div className="flex-1 min-w-0">
                {isRenaming ? (
                    <input
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => onCommitRename(renameValue)}
                        onKeyDown={handleRenameKeyDown}
                        className="w-full bg-slate-900 text-white px-2 py-1 rounded text-sm outline-none ring-2 ring-sky-500"
                        onClick={e => e.stopPropagation()}
                        autoFocus
                    />
                ) : (
                    <>
                        <div className="text-sm text-white truncate font-medium">{asset.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-slate-400 capitalize">{assetType.slice(0, -1)}</span>
                            {showPath && asset.path && (
                                <>
                                    <span className="text-xs text-slate-600">•</span>
                                    <div className="flex items-center gap-1">
                                        <FolderIcon className="w-3 h-3 text-slate-500 flex-shrink-0" />
                                        <span className="text-xs text-slate-400 truncate">{asset.path}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                <button
                    onClick={(e) => { e.stopPropagation(); onMove(); }}
                    className="p-1.5 text-slate-400 hover:text-yellow-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Move to Folder"
                >
                    <FolderIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onStartRenaming(); }}
                    className="p-1.5 text-slate-400 hover:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Rename"
                >
                    <PencilIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-1.5 text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete"
                >
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

interface EmptyStateProps {
    icon: React.ReactNode;
    title: string;
    description: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description }) => (
    <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
            <div className="flex justify-center mb-4 text-slate-600">
                {React.cloneElement(icon as React.ReactElement, { className: 'w-20 h-20' })}
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
            <p className="text-slate-400">{description}</p>
        </div>
    </div>
);


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
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky-500 to-purple-500 hover:from-sky-600 hover:to-purple-600 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
                <PlusIcon className="w-4 h-4" />
                {isUploading && uploadProgress 
                    ? `${uploadProgress.current}/${uploadProgress.total}` 
                    : 'Upload'}
            </button>
        </>
    );
};

interface AssetInspectorProps {
    assetType: AssetType;
    assetId: string;
    project: VNProject;
    onClose: () => void;
}

const AssetInspector: React.FC<AssetInspectorProps> = ({ assetType, assetId, project, onClose }) => {
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
            <div className="flex-1 flex items-center justify-center text-slate-400 p-4">
                <div className="text-center">
                    <PhotoIcon className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium">Asset not found</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Properties</h3>
                <button
                    onClick={onClose}
                    className="p-1.5 text-slate-400 hover:text-white transition-colors"
                    title="Close"
                >
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 p-4 overflow-y-auto space-y-6">
                <div>
                    <h4 className="text-sm font-medium text-slate-400 mb-2 uppercase tracking-wider">Asset Name</h4>
                    <div className="bg-slate-900 p-3 rounded-lg">
                        <p className="text-white font-medium">{asset.name}</p>
                    </div>
                </div>

                {(asset.imageUrl || asset.videoUrl) && (
                    <div>
                        <h4 className="text-sm font-medium text-slate-400 mb-2 uppercase tracking-wider">Preview</h4>
                        <div className="bg-slate-900 p-4 rounded-lg">
                            {asset.videoUrl ? (
                                <video
                                    src={asset.videoUrl}
                                    controls
                                    loop={asset.loop}
                                    className="w-full rounded-lg"
                                />
                            ) : (
                                <img
                                    src={asset.imageUrl}
                                    alt={asset.name}
                                    className="w-full rounded-lg object-contain"
                                />
                            )}
                        </div>
                    </div>
                )}

                {asset.audioUrl && (
                    <div>
                        <h4 className="text-sm font-medium text-slate-400 mb-2 uppercase tracking-wider">Audio</h4>
                        <div className="bg-slate-900 p-4 rounded-lg">
                            <audio src={asset.audioUrl} controls className="w-full" />
                        </div>
                    </div>
                )}

                <div>
                    <h4 className="text-sm font-medium text-slate-400 mb-2 uppercase tracking-wider">Metadata</h4>
                    <div className="bg-slate-900 p-4 rounded-lg space-y-3">
                        <div>
                            <span className="text-slate-400 text-sm">Type:</span>
                            <span className="text-white ml-3 capitalize">{assetType.slice(0, -1)}</span>
                        </div>
                        <div>
                            <span className="text-slate-400 text-sm">ID:</span>
                            <span className="text-white ml-3 font-mono text-xs">{asset.id}</span>
                        </div>
                        {asset.path && (
                            <div>
                                <span className="text-slate-400 text-sm">Path:</span>
                                <span className="text-white ml-3 text-xs font-mono">{asset.path}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Modal Components
interface FolderSelectorModalProps {
    isOpen: boolean;
    assetName: string;
    currentPath: string;
    allAssets: any[];
    onSelect: (path: string) => void;
    onClose: () => void;
}

const FolderSelectorModal: React.FC<FolderSelectorModalProps> = ({ isOpen, assetName, currentPath, allAssets, onSelect, onClose }) => {
    const [selectedPath, setSelectedPath] = useState(currentPath);
    const [customPath, setCustomPath] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);
    
    if (!isOpen) return null;
    
    // Get all unique folder paths
    const folderPaths = new Set<string>();
    folderPaths.add(''); // Root folder
    
    allAssets.forEach(asset => {
        if (asset.path) {
            const parts = asset.path.split('/').filter((p: string) => p);
            let accumulatedPath = '';
            parts.forEach((part: string) => {
                accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
                folderPaths.add(accumulatedPath);
            });
        }
    });
    
    const folders = Array.from(folderPaths).sort();
    
    const handleConfirm = () => {
        if (showCustomInput) {
            onSelect(customPath.trim());
        } else {
            onSelect(selectedPath);
        }
    };
    
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
            <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-700" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 border-b border-slate-700">
                    <h3 className="text-xl font-bold text-white">Move Asset</h3>
                    <p className="text-slate-400 text-sm mt-1">Move "{assetName}" to a folder</p>
                </div>
                
                <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
                    {!showCustomInput ? (
                        <>
                            <div className="space-y-2">
                                {folders.map((path) => (
                                    <button
                                        key={path}
                                        onClick={() => setSelectedPath(path)}
                                        className={`w-full text-left p-3 rounded-lg transition-all flex items-center gap-3 ${
                                            selectedPath === path
                                                ? 'bg-sky-500/20 border-2 border-sky-500'
                                                : 'bg-slate-700 border-2 border-transparent hover:bg-slate-600'
                                        }`}
                                    >
                                        <FolderIcon className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                                        <span className="text-white font-medium">{path || '(Root)'}</span>
                                    </button>
                                ))}
                            </div>
                            
                            <button
                                onClick={() => setShowCustomInput(true)}
                                className="w-full p-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                <PlusIcon className="w-4 h-4" />
                                New Folder Path
                            </button>
                        </>
                    ) : (
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-2">Custom Path</label>
                                <input
                                    type="text"
                                    value={customPath}
                                    onChange={(e) => setCustomPath(e.target.value)}
                                    placeholder="e.g., Characters/Heroes"
                                    className="w-full bg-slate-900 text-white px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                                    autoFocus
                                />
                            </div>
                            <button
                                onClick={() => setShowCustomInput(false)}
                                className="text-sky-400 hover:text-sky-300 text-sm font-medium"
                            >
                                ← Back to folder list
                            </button>
                        </div>
                    )}
                </div>
                
                <div className="p-6 border-t border-slate-700 flex items-center gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="flex-1 px-4 py-2 bg-gradient-to-r from-sky-500 to-purple-500 hover:from-sky-600 hover:to-purple-600 text-white rounded-lg font-medium transition-all"
                    >
                        Move Here
                    </button>
                </div>
            </div>
        </div>
    );
};

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    danger?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    onConfirm,
    onCancel,
    danger = false
}) => {
    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
            <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-700" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 border-b border-slate-700">
                    <h3 className="text-xl font-bold text-white">{title}</h3>
                </div>
                
                <div className="p-6">
                    <p className="text-slate-300">{message}</p>
                </div>
                
                <div className="p-6 border-t border-slate-700 flex items-center gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                            danger
                                ? 'bg-red-500 hover:bg-red-600 text-white'
                                : 'bg-gradient-to-r from-sky-500 to-purple-500 hover:from-sky-600 hover:to-purple-600 text-white'
                        }`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default React.memo(AssetManager);