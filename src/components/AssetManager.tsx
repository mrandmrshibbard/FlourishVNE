import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useInlineRename } from '../hooks/useInlineRename';
import { VNProject } from '../types/project';
import { VNBackground, VNImage, VNAudio, VNVideo } from '../features/assets/types';
import { useProject } from '../contexts/ProjectContext';
import { useToast } from '../contexts/ToastContext';
import {
    PlusIcon, TrashIcon, PhotoIcon, MusicalNoteIcon, FilmIcon,
    PencilIcon, FolderIcon, GridIcon, ListIcon, SearchIcon,
    ChevronRightIcon, XMarkIcon, UploadIcon, CheckIcon,
} from './icons';
import { fileToBase64 } from '../utils/file';
import { formatBytes, LARGE_ASSET_WARN_BYTES } from '../utils/projectAssetSize';
import { ingestUpload, resolveFieldUrl, refToRelPath, getProjectAssetSizes, isElectronAssetStore } from '../utils/assetStore';
import TrimmedVideo from './ui/TrimmedVideo';
import VideoTrimFields from './ui/VideoTrimFields';
import AudioAdjustFields from './ui/AudioAdjustFields';
import { AssetType } from '../features/assets/state/assetReducer';

// ─── Types ───────────────────────────────────────────────────────────────────

type AssetCategory = 'backgrounds' | 'images' | 'audio' | 'videos';
type ViewMode = 'grid' | 'list';
type SortMode = 'name-asc' | 'name-desc' | 'size-asc' | 'size-desc' | 'type';

interface DirectoryNode {
    name: string;
    path: string;
    children: DirectoryNode[];
    assets: any[];
}

const ASSET_CATEGORIES: Record<AssetCategory, {
    label: string;
    icon: React.ReactNode;
    accept: string;
    color: string;
    bgGradient: string;
}> = {
    backgrounds: {
        label: 'Backgrounds',
        icon: <PhotoIcon className="w-5 h-5" />,
        accept: 'image/*,video/*,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,.mov',
        color: 'text-purple-400',
        bgGradient: 'from-purple-500/20 to-violet-500/10',
    },
    images: {
        label: 'Images',
        icon: <PhotoIcon className="w-5 h-5" />,
        accept: 'image/*,video/*,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,.mov',
        color: 'text-blue-400',
        bgGradient: 'from-blue-500/20 to-cyan-500/10',
    },
    audio: {
        label: 'Audio',
        icon: <MusicalNoteIcon className="w-5 h-5" />,
        accept: '.mp3,.wav,.ogg,.m4a,.flac,.aac,.wma,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/flac,audio/aac,audio/*',
        color: 'text-green-400',
        bgGradient: 'from-green-500/20 to-emerald-500/10',
    },
    videos: {
        label: 'Videos',
        icon: <FilmIcon className="w-5 h-5" />,
        accept: 'video/*,.mp4,.webm,.mov,.avi,.mkv',
        color: 'text-pink-400',
        bgGradient: 'from-pink-500/20 to-rose-500/10',
    },
};

const UNIVERSAL_ACCEPT = 'image/*,video/*,audio/*,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.mp4,.webm,.mov,.avi,.mkv,.mp3,.wav,.ogg,.m4a,.flac,.aac,.wma,audio/mpeg';

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Estimates the byte size of a data URL. */
function estimateDataUrlSize(dataUrl: string | undefined | null): number {
    if (!dataUrl || !dataUrl.startsWith('data:')) return 0;
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) return 0;
    const base64 = dataUrl.substring(commaIdx + 1);
    return Math.floor(base64.length * 0.75);
}

/** Formats bytes into a human-readable string. */
function formatFileSize(bytes: number): string {
    if (bytes === 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Primary data URL for any asset. */
function getAssetUrl(asset: any): string | null {
    return asset.imageUrl || asset.videoUrl || asset.audioUrl || null;
}

/** Returns the broad media kind for a File. Used to decide whether a file is
 *  compatible with the currently-selected asset category. */
function detectMediaKind(file: File): 'image' | 'video' | 'audio' | 'unknown' {
    const mime = file.type.toLowerCase();
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'].includes(ext)) return 'audio';
    if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
    return 'unknown';
}

/** Detects the best asset category for a File object. When `preferredCategory`
 *  is given (the tab the user is currently viewing) and the file is compatible
 *  with it, the file is routed there — e.g. dropping a PNG on the Backgrounds
 *  tab puts it in Backgrounds rather than always defaulting to Images. */
function detectCategoryFromFile(file: File, preferredCategory?: AssetCategory): AssetCategory {
    const kind = detectMediaKind(file);
    if (preferredCategory) {
        const fits =
            (preferredCategory === 'backgrounds' && (kind === 'image' || kind === 'video')) ||
            (preferredCategory === 'images' && (kind === 'image' || kind === 'video')) ||
            (preferredCategory === 'audio' && kind === 'audio') ||
            (preferredCategory === 'videos' && kind === 'video');
        if (fits) return preferredCategory;
    }
    if (kind === 'audio') return 'audio';
    if (kind === 'video') return 'videos';
    return 'images';
}

/** Detects category from a filename extension. Honors `preferredCategory`
 *  when the file is compatible — same rule as `detectCategoryFromFile`. */
function detectCategoryFromFilename(filename: string, preferredCategory?: AssetCategory): AssetCategory {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const kind: 'image' | 'video' | 'audio' | 'unknown' =
        ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'].includes(ext) ? 'audio'
        : ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext) ? 'video'
        : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext) ? 'image'
        : 'unknown';
    if (preferredCategory) {
        const fits =
            (preferredCategory === 'backgrounds' && (kind === 'image' || kind === 'video')) ||
            (preferredCategory === 'images' && (kind === 'image' || kind === 'video')) ||
            (preferredCategory === 'audio' && kind === 'audio') ||
            (preferredCategory === 'videos' && kind === 'video');
        if (fits) return preferredCategory;
    }
    if (kind === 'audio') return 'audio';
    if (kind === 'video') return 'videos';
    return 'images';
}

/** Scans every scene command + UI screen for references to an asset id. */
function findAssetUsage(project: VNProject, assetId: string): { location: string; detail: string }[] {
    const refs: { location: string; detail: string }[] = [];
    for (const scene of Object.values(project.scenes)) {
        for (const cmd of scene.commands) {
            const c = cmd as any;
            if (c.backgroundId === assetId || c.imageId === assetId || c.audioId === assetId || c.videoId === assetId) {
                refs.push({ location: scene.name, detail: cmd.type });
            }
        }
    }
    for (const screen of Object.values(project.uiScreens || {})) {
        const s = screen as any;
        if (s.background?.assetId === assetId) refs.push({ location: `UI: ${screen.name}`, detail: 'Screen Background' });
        if (s.music?.audioId === assetId) refs.push({ location: `UI: ${screen.name}`, detail: 'Screen Music' });
        for (const el of Object.values(screen.elements || {}) as any[]) {
            if (el.image?.id === assetId || el.hoverImage?.id === assetId || el.clickSoundId === assetId || el.hoverSoundId === assetId) {
                refs.push({ location: `UI: ${screen.name}`, detail: `Element: ${el.type}` });
            }
        }
    }
    if ((project.ui as any)?.dialogueBoxImage?.id === assetId) refs.push({ location: 'Project UI', detail: 'Dialogue Box Image' });
    if ((project.ui as any)?.dialogueBoxBorderImage?.id === assetId) refs.push({ location: 'Project UI', detail: 'Dialogue Border Image' });
    if ((project.ui as any)?.choiceButtonImage?.id === assetId) refs.push({ location: 'Project UI', detail: 'Choice Button Image' });
    if ((project.ui as any)?.choiceButtonBorderImage?.id === assetId) refs.push({ location: 'Project UI', detail: 'Choice Border Image' });
    return refs;
}

/** Build a navigable folder tree from asset path metadata. */
function buildDirectoryTree(assets: any[]): DirectoryNode {
    const root: DirectoryNode = { name: 'Root', path: '', children: [], assets: [] };
    const folderMap = new Map<string, DirectoryNode>();
    folderMap.set('', root);

    for (const asset of assets) {
        const assetPath: string = asset.path || '';
        if (!assetPath) continue;
        const parts = assetPath.split('/').filter((p: string) => p);
        let currentPath = '';
        for (const part of parts) {
            const parentPath = currentPath;
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            if (!folderMap.has(currentPath)) {
                const node: DirectoryNode = { name: part, path: currentPath, children: [], assets: [] };
                folderMap.set(currentPath, node);
                folderMap.get(parentPath)!.children.push(node);
            }
        }
    }

    for (const asset of assets) {
        if (asset.isPlaceholder || asset.name === '.folder_marker') continue;
        const folder = folderMap.get(asset.path || '');
        if (folder) folder.assets.push(asset);
    }

    const sortNode = (node: DirectoryNode) => {
        node.children.sort((a, b) => a.name.localeCompare(b.name));
        node.assets.sort((a, b) => a.name.localeCompare(b.name));
        node.children.forEach(sortNode);
    };
    sortNode(root);
    return root;
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface AssetManagerProps {
    project?: VNProject;
}

const AssetManager: React.FC<AssetManagerProps> = ({ project: projectProp }) => {
    const { t } = useTranslation('assets');
    const { project: ctxProject, dispatch } = useProject();
    const project = projectProp || ctxProject;
    const toast = useToast();

    // Real on-disk sizes of file-backed assets (relPath → bytes); refreshed when the asset set changes.
    const [assetSizes, setAssetSizes] = useState<Record<string, number>>({});
    useEffect(() => {
        if (!isElectronAssetStore()) { setAssetSizes({}); return; }
        let cancelled = false;
        getProjectAssetSizes(project.id).then(r => { if (!cancelled) setAssetSizes(r.sizes); });
        return () => { cancelled = true; };
    }, [project.id, project.images, project.backgrounds, project.audio, project.videos]);

    // Core state
    const [selectedCategory, setSelectedCategory] = useState<AssetCategory>('backgrounds');
    const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [sortMode, setSortMode] = useState<SortMode>('name-asc');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPath, setCurrentPath] = useState('');

    // Edit state
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renamingFolderPath, setRenamingFolderPath] = useState<string | null>(null);
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    // Modal state
    const [showFolderSelector, setShowFolderSelector] = useState(false);
    const [moveAssetData, setMoveAssetData] = useState<{ id: string; name: string; type: AssetType } | null>(null);
    const [moveMultiple, setMoveMultiple] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<{ type: 'asset' | 'folder' | 'multi'; id?: string; path?: string; name: string; count?: number } | null>(null);

    // Drag-and-drop state
    const [draggedAsset, setDraggedAsset] = useState<{ id: string; type: AssetType } | null>(null);
    const [isDragOverContent, setIsDragOverContent] = useState(false);

    // Upload ref
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ═══ Derived Data ═══════════════════════════════════════════════════════

    const getAssetsForCategory = useCallback((category: AssetCategory): any[] => {
        switch (category) {
            case 'backgrounds': return Object.values(project.backgrounds || {});
            case 'images': return Object.values(project.images || {});
            case 'audio': return Object.values(project.audio || {});
            case 'videos': return Object.values(project.videos || {});
            default: return [];
        }
    }, [project]);

    const allAssets = useMemo(() => getAssetsForCategory(selectedCategory), [selectedCategory, getAssetsForCategory]);
    const directoryTree = useMemo(() => buildDirectoryTree(allAssets), [allAssets]);

    const getCurrentDirectory = useCallback((): DirectoryNode => {
        if (!currentPath) return directoryTree;
        const parts = currentPath.split('/').filter(p => p);
        let node = directoryTree;
        for (const part of parts) {
            const child = node.children.find(c => c.name === part);
            if (!child) return directoryTree;
            node = child;
        }
        return node;
    }, [currentPath, directoryTree]);

    const currentDirectory = useMemo(() => getCurrentDirectory(), [getCurrentDirectory]);
    const isSearching = searchQuery.trim().length > 0;

    /** Sort helper */
    const sortAssets = useCallback((assets: any[]): any[] => {
        const sorted = [...assets];
        switch (sortMode) {
            case 'name-asc':  return sorted.sort((a, b) => a.name.localeCompare(b.name));
            case 'name-desc': return sorted.sort((a, b) => b.name.localeCompare(a.name));
            case 'size-asc':  return sorted.sort((a, b) => estimateDataUrlSize(getAssetUrl(a)) - estimateDataUrlSize(getAssetUrl(b)));
            case 'size-desc': return sorted.sort((a, b) => estimateDataUrlSize(getAssetUrl(b)) - estimateDataUrlSize(getAssetUrl(a)));
            case 'type':      return sorted.sort((a, b) => {
                const tA = a.imageUrl ? 'image' : a.videoUrl ? 'video' : a.audioUrl ? 'audio' : 'other';
                const tB = b.imageUrl ? 'image' : b.videoUrl ? 'video' : b.audioUrl ? 'audio' : 'other';
                return tA.localeCompare(tB) || a.name.localeCompare(b.name);
            });
            default: return sorted;
        }
    }, [sortMode]);

    const filteredAssets = useMemo(() => {
        let assets: any[];
        if (isSearching) {
            const q = searchQuery.toLowerCase();
            assets = allAssets.filter(a => !a.isPlaceholder && a.name !== '.folder_marker' && a.name.toLowerCase().includes(q));
        } else {
            assets = currentDirectory.assets.filter(a => !a.isPlaceholder && a.name !== '.folder_marker');
        }
        return sortAssets(assets);
    }, [currentDirectory, allAssets, searchQuery, isSearching, sortAssets]);

    const totalAssetCount = useMemo(() => {
        let count = 0;
        (['backgrounds', 'images', 'audio', 'videos'] as AssetCategory[]).forEach(cat => {
            count += getAssetsForCategory(cat).filter(a => !a.isPlaceholder && a.name !== '.folder_marker').length;
        });
        return count;
    }, [getAssetsForCategory]);

    const categoryCount = useCallback((cat: AssetCategory) =>
        getAssetsForCategory(cat).filter((a: any) => !a.isPlaceholder && a.name !== '.folder_marker').length,
    [getAssetsForCategory]);

    // Reset selection on category / path change
    useEffect(() => { setSelectedAssetIds(new Set()); }, [selectedCategory, currentPath]);

    // ═══ Actions ═════════════════════════════════════════════════════════════

    // `url` is either a base64 data: URL or a managed ref ("assets/…"). `isVideo` is detected from the
    // source file (can't sniff a ref). `id` is pre-generated so the stored filename matches the asset.
    const addAsset = useCallback((category: AssetCategory, name: string, url: string, path: string = '', isVideo = false, id?: string) => {
        const newAsset: any = { id: id || `${category.slice(0, 4)}-${Math.random().toString(36).substring(2, 9)}`, name, path };
        if (category === 'backgrounds' || category === 'images') {
            if (isVideo) { newAsset.videoUrl = url; newAsset.isVideo = true; newAsset.loop = true; }
            else newAsset.imageUrl = url;
        } else if (category === 'audio') {
            newAsset.audioUrl = url;
        } else {
            newAsset.videoUrl = url;
        }
        dispatch({ type: 'ADD_ASSET', payload: { assetType: category, asset: newAsset } });
    }, [dispatch]);

    const handleFileDrop = useCallback(async (files: File[]) => {
        let ok = 0, fail = 0;
        const categorized = new Map<AssetCategory, File[]>();
        for (const f of files) {
            // Honor the user's currently-viewed category when the file fits there.
            // Image dropped on Backgrounds tab → Backgrounds; image dropped on Audio → Images (fallback).
            const cat = detectCategoryFromFile(f, selectedCategory);
            if (!categorized.has(cat)) categorized.set(cat, []);
            categorized.get(cat)!.push(f);
        }
        const largeNames: string[] = [];
        for (const [cat, catFiles] of categorized) {
            for (const f of catFiles) {
                try {
                    if (f.size > LARGE_ASSET_WARN_BYTES) largeNames.push(`${f.name} (${formatBytes(f.size)})`);
                    const isVideo = f.type.startsWith('video/') || /\.(mp4|webm|ogg|mov)$/i.test(f.name);
                    const id = `${cat.slice(0, 4)}-${Math.random().toString(36).substring(2, 9)}`;
                    // Write to the managed file store (desktop) or fall back to base64 (web).
                    const url = await ingestUpload(ctxProject.id, cat as any, id, f);
                    addAsset(cat, f.name.replace(/\.[^/.]+$/, ''), url, currentPath, isVideo, id);
                    ok++;
                } catch { fail++; }
            }
        }
        // Heads-up: large media bloats the project + slows exports. Non-blocking, informational.
        if (largeNames.length > 0) {
            toast.warning(t('toastLargeAsset', 'Large file added: {{files}}. Large media slows the editor and makes exports big — consider compressing it.', { files: largeNames.join(', ') }), { duration: 8000 });
        }
        if (fail > 0) toast.warning(t('toastUploadPartial', { ok, fail }));
        else if (ok > 0) {
            const cats = Array.from(categorized.keys());
            const base = t('toastUploaded', { count: ok });
            toast.success(cats.length > 1 ? base + t('toastAcross', { cats: cats.map(c => t(`categoriesLower.${c}`)).join(', ') }) : base);
        }
    }, [addAsset, currentPath, toast, selectedCategory, t, ctxProject.id]);

    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        await handleFileDrop(Array.from(files));
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [handleFileDrop]);

    const handleReplaceAsset = useCallback(async (assetId: string, assetType: AssetType) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = ASSET_CATEGORIES[assetType as AssetCategory]?.accept || '*';
        input.onchange = async (e: any) => {
            const file = e.target?.files?.[0];
            if (!file) return;
            try {
                const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|ogg|mov)$/i.test(file.name);
                // Reuse the asset's id so the stored file is replaced in place.
                const url = await ingestUpload(ctxProject.id, assetType as any, assetId as any, file);
                let updates: any = {};
                if (assetType === 'backgrounds' || assetType === 'images') {
                    updates = isVideo
                        ? { videoUrl: url, imageUrl: null, isVideo: true, loop: true }
                        : { imageUrl: url, videoUrl: null, isVideo: false };
                } else if (assetType === 'audio') {
                    updates = { audioUrl: url };
                } else {
                    updates = { videoUrl: url };
                }
                dispatch({ type: 'UPDATE_ASSET', payload: { assetType, assetId, updates } });
                toast.success(t('toastReplaced'));
            } catch { toast.error(t('toastReplaceFailed')); }
        };
        input.click();
    }, [dispatch, toast, t, ctxProject.id]);

    const handleDeleteAsset = useCallback((assetId: string, assetName: string) => {
        setDeleteTarget({ type: 'asset', id: assetId, name: assetName });
        setShowDeleteConfirm(true);
    }, []);

    const handleDeleteSelected = useCallback(() => {
        if (selectedAssetIds.size === 0) return;
        setDeleteTarget({ type: 'multi', name: `${selectedAssetIds.size} assets`, count: selectedAssetIds.size });
        setShowDeleteConfirm(true);
    }, [selectedAssetIds]);

    const confirmDelete = useCallback(() => {
        if (!deleteTarget) return;
        if (deleteTarget.type === 'multi') {
            selectedAssetIds.forEach(id => dispatch({ type: 'DELETE_ASSET', payload: { assetType: selectedCategory, assetId: id } }));
            setSelectedAssetIds(new Set());
        } else if (deleteTarget.type === 'asset' && deleteTarget.id) {
            dispatch({ type: 'DELETE_ASSET', payload: { assetType: selectedCategory, assetId: deleteTarget.id } });
            setSelectedAssetIds(prev => { const n = new Set(prev); n.delete(deleteTarget.id!); return n; });
        } else if (deleteTarget.type === 'folder' && deleteTarget.path) {
            allAssets.filter(a => (a.path || '').startsWith(deleteTarget.path!))
                .forEach(a => dispatch({ type: 'DELETE_ASSET', payload: { assetType: selectedCategory, assetId: a.id } }));
            if (currentPath.startsWith(deleteTarget.path!)) setCurrentPath(deleteTarget.path!.split('/').slice(0, -1).join('/'));
        }
        setShowDeleteConfirm(false);
        setDeleteTarget(null);
    }, [deleteTarget, selectedCategory, selectedAssetIds, allAssets, currentPath, dispatch]);

    const handleRenameAsset = useCallback((assetId: string, name: string) => {
        dispatch({ type: 'UPDATE_ASSET', payload: { assetType: selectedCategory, assetId, updates: { name } } });
        setRenamingId(null);
    }, [dispatch, selectedCategory]);

    const handleMoveAsset = useCallback((assetId: string, newPath: string) => {
        dispatch({ type: 'UPDATE_ASSET', payload: { assetType: selectedCategory, assetId, updates: { path: newPath } } });
    }, [dispatch, selectedCategory]);

    /** Moves the dragged asset to a folder; if it's part of the current multi-selection,
     *  the whole selection moves with it (so dragging any selected card moves them all). */
    const handleMoveDragged = useCallback((draggedId: string, newPath: string) => {
        const ids = selectedAssetIds.has(draggedId) && selectedAssetIds.size > 1
            ? Array.from(selectedAssetIds)
            : [draggedId];
        ids.forEach(id => handleMoveAsset(id, newPath));
    }, [selectedAssetIds, handleMoveAsset]);

    /** Renames a folder by rewriting the path prefix on every asset inside it
     *  (including the placeholder marker and any nested subfolders). */
    const handleRenameFolder = useCallback((folderPath: string, rawName: string) => {
        setRenamingFolderPath(null);
        const newName = rawName.trim();
        if (!newName || /[\/\\]/.test(newName)) return;
        const parts = folderPath.split('/');
        parts.pop();
        const parentPath = parts.join('/');
        const newPath = parentPath ? `${parentPath}/${newName}` : newName;
        if (newPath === folderPath) return;
        // Block renaming onto an existing sibling folder.
        const conflict = allAssets.some((a: any) => {
            const p = a.path || '';
            if (p === folderPath || p.startsWith(folderPath + '/')) return false; // part of the folder being renamed
            return p === newPath || p.startsWith(newPath + '/');
        });
        if (conflict) { toast.error(t('toastFolderExists', { name: newName })); return; }
        allAssets.forEach((a: any) => {
            const p = a.path || '';
            if (p === folderPath) {
                dispatch({ type: 'UPDATE_ASSET', payload: { assetType: selectedCategory, assetId: a.id, updates: { path: newPath } } });
            } else if (p.startsWith(folderPath + '/')) {
                dispatch({ type: 'UPDATE_ASSET', payload: { assetType: selectedCategory, assetId: a.id, updates: { path: newPath + p.slice(folderPath.length) } } });
            }
        });
        // Keep the breadcrumb valid if we're viewing inside the renamed folder.
        if (currentPath === folderPath || currentPath.startsWith(folderPath + '/')) {
            setCurrentPath(newPath + currentPath.slice(folderPath.length));
        }
    }, [allAssets, currentPath, selectedCategory, dispatch, toast, t]);

    const handleCreateFolder = useCallback(() => {
        if (!newFolderName.trim() || /[\/\\]/.test(newFolderName)) { setCreatingFolder(false); setNewFolderName(''); return; }
        const name = newFolderName.trim();
        const newFolderPath = currentPath ? `${currentPath}/${name}` : name;
        if (currentDirectory.children.find(f => f.name === name)) { setCreatingFolder(false); setNewFolderName(''); return; }

        const placeholder: any = {
            id: `folder-placeholder-${Math.random().toString(36).substring(2, 9)}`,
            name: '.folder_marker', path: newFolderPath, isPlaceholder: true,
        };
        if (selectedCategory === 'audio') placeholder.audioUrl = '';
        else if (selectedCategory === 'videos') placeholder.videoUrl = '';
        else placeholder.imageUrl = '';

        dispatch({ type: 'ADD_ASSET', payload: { assetType: selectedCategory, asset: placeholder } });
        setCreatingFolder(false);
        setNewFolderName('');
    }, [newFolderName, currentPath, currentDirectory, selectedCategory, dispatch]);

    const handleSelectAsset = useCallback((assetId: string, e: React.MouseEvent) => {
        if (e.ctrlKey || e.metaKey) {
            setSelectedAssetIds(prev => { const n = new Set(prev); if (n.has(assetId)) n.delete(assetId); else n.add(assetId); return n; });
        } else if (e.shiftKey && selectedAssetIds.size > 0) {
            const last = Array.from(selectedAssetIds).pop()!;
            const a = filteredAssets.findIndex(x => x.id === last);
            const b = filteredAssets.findIndex(x => x.id === assetId);
            if (a >= 0 && b >= 0) {
                const s = Math.min(a, b), en = Math.max(a, b);
                const n = new Set(selectedAssetIds);
                for (let i = s; i <= en; i++) n.add(filteredAssets[i].id);
                setSelectedAssetIds(n);
            }
        } else {
            setSelectedAssetIds(new Set([assetId]));
        }
    }, [selectedAssetIds, filteredAssets]);

    const selectAll = useCallback(() => {
        setSelectedAssetIds(prev => prev.size === filteredAssets.length ? new Set() : new Set(filteredAssets.map(a => a.id)));
    }, [filteredAssets]);

    const navigateToPath = useCallback((path: string) => { setCurrentPath(path); setSearchQuery(''); }, []);

    const breadcrumbs = useMemo(() => {
        if (!currentPath) return [{ name: 'Root', path: '' }];
        const parts = currentPath.split('/').filter(p => p);
        const crumbs = [{ name: 'Root', path: '' }];
        let acc = '';
        parts.forEach(p => { acc = acc ? `${acc}/${p}` : p; crumbs.push({ name: p, path: acc }); });
        return crumbs;
    }, [currentPath]);

    // ═══ Content-area drag-and-drop (external files) ═════════════════════════

    const handleContentDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) setIsDragOverContent(true);
    }, []);
    const handleContentDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setIsDragOverContent(false);
    }, []);
    const handleContentDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setIsDragOverContent(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) handleFileDrop(files);
    }, [handleFileDrop]);

    // ═══ Inspector data ══════════════════════════════════════════════════════

    const selectedAssetForInspector = useMemo(() => {
        if (selectedAssetIds.size !== 1) return null;
        const id = Array.from(selectedAssetIds)[0];
        return allAssets.find((a: any) => a.id === id) || null;
    }, [selectedAssetIds, allAssets]);

    // ═══ Render ══════════════════════════════════════════════════════════════

    return (
        <div className="flex h-full">
            {/* ── Category Sidebar ── */}
            <div style={{ width: 'var(--sidebar-width)' }} className="bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] flex flex-col">
                <div className="p-4 border-b border-[var(--border-subtle)]">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <PhotoIcon className="w-5 h-5" /> {t('title')}
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{t('totalItems', { count: totalAssetCount })}</p>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {(Object.keys(ASSET_CATEGORIES) as AssetCategory[]).map(cat => {
                        const info = ASSET_CATEGORIES[cat];
                        const count = categoryCount(cat);
                        const active = selectedCategory === cat;
                        return (
                            <button
                                key={cat}
                                onClick={() => { setSelectedCategory(cat); setCurrentPath(''); setSearchQuery(''); }}
                                className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${
                                    active
                                        ? `bg-gradient-to-r ${info.bgGradient} border border-sky-500/50 shadow-lg shadow-sky-500/5`
                                        : 'bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)] border border-transparent'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={info.color}>{info.icon}</div>
                                    <div className="text-left">
                                        <div className="font-medium text-white text-sm">{t(`categories.${cat}`)}</div>
                                        <div className="text-xs text-[var(--text-secondary)]">{t('items', { count })}</div>
                                    </div>
                                </div>
                                {active && <ChevronRightIcon className="w-4 h-4 text-sky-400" />}
                            </button>
                        );
                    })}
                </div>

                {/* Quick Upload */}
                <div className="p-3 border-t border-[var(--border-subtle)]">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-sky-500/20 to-purple-500/20 hover:from-sky-500/30 hover:to-purple-500/30 text-white rounded-lg font-medium transition-all border border-dashed border-[var(--border-default)] hover:border-sky-400"
                    >
                        <UploadIcon className="w-4 h-4" />
                        <span className="text-sm">{t('quickUpload')}</span>
                    </button>
                    <input ref={fileInputRef} type="file" accept={UNIVERSAL_ACCEPT} onChange={handleFileUpload} className="hidden" multiple />
                </div>
            </div>

            {/* ── Main Content ── */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Toolbar */}
                <div className="bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] p-3 space-y-2">
                    {/* Breadcrumbs */}
                    <div className="flex items-center gap-1 text-sm overflow-x-auto">
                        {breadcrumbs.map((crumb, i, arr) => (
                            <React.Fragment key={crumb.path}>
                                <button
                                    onClick={() => navigateToPath(crumb.path)}
                                    className={`flex items-center gap-1 px-2 py-1 rounded transition-colors whitespace-nowrap ${
                                        i === arr.length - 1 ? 'text-white font-medium' : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-secondary)]'
                                    }`}
                                >
                                    {i === 0 && <FolderIcon className="w-4 h-4 text-yellow-500" />}
                                    {crumb.name}
                                </button>
                                {i < arr.length - 1 && <ChevronRightIcon className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />}
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Search + Controls */}
                    <div className="flex items-center gap-2">
                        {/* Search */}
                        <div className="flex-1 relative">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                            <input
                                type="text"
                                autoFocus
                                placeholder={t('searchPlaceholder', { category: t(`categoriesLower.${selectedCategory}`) })}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-[var(--bg-primary)] text-white pl-9 pr-8 py-1.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[var(--accent-lavender)]/50"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-white">
                                    <XMarkIcon className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* Sort */}
                        <select
                            value={sortMode}
                            onChange={e => setSortMode(e.target.value as SortMode)}
                            className="bg-[var(--bg-primary)] text-white text-xs px-2 py-1.5 rounded-lg border border-[var(--border-default)] outline-none focus:ring-2 focus:ring-[var(--accent-lavender)]/50"
                            title={t('sortAssets')}
                        >
                            <option value="name-asc">{t('sortNameAsc')}</option>
                            <option value="name-desc">{t('sortNameDesc')}</option>
                            <option value="size-asc">{t('sortSizeAsc')}</option>
                            <option value="size-desc">{t('sortSizeDesc')}</option>
                            <option value="type">{t('sortType')}</option>
                        </select>

                        {/* View toggle */}
                        <div className="flex items-center border border-[var(--border-default)] rounded-lg overflow-hidden">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-sky-500 text-white' : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-secondary)]'}`}
                                title={t('gridView')}
                            >
                                <GridIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-sky-500 text-white' : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-secondary)]'}`}
                                title={t('listView')}
                            >
                                <ListIcon className="w-4 h-4" />
                            </button>
                        </div>

                        {/* New Folder */}
                        <button
                            onClick={() => setCreatingFolder(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-white rounded-lg text-sm font-medium transition-all border border-[var(--border-default)]"
                            title={t('newFolder')}
                        >
                            <FolderIcon className="w-4 h-4 text-yellow-500" />
                            <PlusIcon className="w-3 h-3" />
                        </button>

                        {/* Upload */}
                        <UploadButton
                            accept={ASSET_CATEGORIES[selectedCategory].accept}
                            onUpload={(name, url, filename) => {
                                // Route to the currently-viewed category when the file fits — drop a PNG on
                                // the Backgrounds tab and it lands in Backgrounds instead of Images.
                                const cat = detectCategoryFromFilename(filename, selectedCategory);
                                addAsset(cat, name, url, currentPath);
                            }}
                        />
                    </div>

                    {/* Selection bar */}
                    {selectedAssetIds.size > 0 && (
                        <div className="flex items-center gap-3 bg-sky-500/10 border border-sky-500/30 rounded-lg px-3 py-1.5">
                            <span className="text-sky-400 text-sm font-medium">{t('selected', { count: selectedAssetIds.size })}</span>
                            <div className="flex-1" />
                            <button onClick={selectAll} className="text-xs text-sky-400 hover:text-sky-300 font-medium">
                                {selectedAssetIds.size === filteredAssets.length ? t('deselectAll') : t('selectAll')}
                            </button>
                            <button onClick={handleDeleteSelected} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 font-medium">
                                <TrashIcon className="w-3 h-3" /> {t('delete')}
                            </button>
                        </div>
                    )}
                </div>

                {/* Asset Content Area */}
                <div
                    className={`flex-1 overflow-y-auto p-4 bg-[var(--bg-primary)] transition-colors ${isDragOverContent ? 'ring-2 ring-inset ring-sky-400 bg-sky-500/5' : ''}`}
                    onDragOver={handleContentDragOver}
                    onDragLeave={handleContentDragLeave}
                    onDrop={handleContentDrop}
                >
                    {/* Drag overlay */}
                    {isDragOverContent && (
                        <div className="mb-4 flex items-center justify-center p-6 border-2 border-dashed border-sky-400 rounded-xl bg-sky-500/10 pointer-events-none">
                            <div className="text-center">
                                <UploadIcon className="w-10 h-10 text-sky-400 mx-auto mb-2" />
                                <p className="text-sky-300 font-medium">{t('dropToUpload')}</p>
                                <p className="text-sky-400/60 text-xs mt-1">{t('dropAutoSort')}</p>
                            </div>
                        </div>
                    )}

                    {/* Search result info */}
                    {isSearching && filteredAssets.length > 0 && (
                        <div className="mb-3 flex items-center gap-2 text-sm text-sky-400">
                            <SearchIcon className="w-4 h-4" />
                            <span>{t('results', { count: filteredAssets.length, query: searchQuery })}</span>
                        </div>
                    )}

                    {/* Folders */}
                    {!isSearching && (currentDirectory.children.length > 0 || creatingFolder) && (
                        <div className="mb-5">
                            <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wider">{t('folders')}</h3>
                            <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3' : 'space-y-1.5'}>
                                {creatingFolder && (
                                    <div className="bg-[var(--bg-primary)] rounded-lg p-3 border-2 border-dashed border-sky-500">
                                        <div className="flex flex-col items-center text-center">
                                            <FolderIcon className="w-10 h-10 text-yellow-500 mb-2" />
                                            <input
                                                type="text" placeholder={t('folderName')} value={newFolderName}
                                                onChange={e => setNewFolderName(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); else if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); } }}
                                                className="w-full bg-[var(--bg-primary)] text-white px-2 py-1 rounded text-sm outline-none ring-2 ring-sky-500 mb-2"
                                                autoFocus
                                            />
                                            <div className="flex items-center gap-1.5 w-full">
                                                <button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="flex-1 bg-sky-500 hover:bg-sky-600 text-white px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50">{t('create')}</button>
                                                <button onClick={() => { setCreatingFolder(false); setNewFolderName(''); }} className="flex-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-white px-2 py-1 rounded text-xs font-medium transition-colors">{t('cancel')}</button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {currentDirectory.children.map(folder => (
                                    <FolderCard
                                        key={folder.path} folder={folder} viewMode={viewMode}
                                        isRenaming={renamingFolderPath === folder.path}
                                        onClick={() => navigateToPath(folder.path)}
                                        onStartRenaming={() => setRenamingFolderPath(folder.path)}
                                        onCommitRename={name => handleRenameFolder(folder.path, name)}
                                        onDelete={() => { setDeleteTarget({ type: 'folder', path: folder.path, name: folder.name }); setShowDeleteConfirm(true); }}
                                        onDrop={path => { if (draggedAsset) handleMoveDragged(draggedAsset.id, path); }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Assets */}
                    {filteredAssets.length > 0 ? (
                        <div>
                            {(!isSearching && currentDirectory.children.length > 0) && (
                                <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wider">{t('files')}</h3>
                            )}
                            <div className={viewMode === 'grid'
                                ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'
                                : 'space-y-1.5'}
                            >
                                {filteredAssets.map(asset => (
                                    <AssetCard
                                        key={asset.id} asset={asset} assetType={selectedCategory}
                                        sizeBytes={assetSizes[refToRelPath(getAssetUrl(asset)) || ''] }
                                        viewMode={viewMode} isSelected={selectedAssetIds.has(asset.id)}
                                        isRenaming={renamingId === asset.id}
                                        onSelect={e => handleSelectAsset(asset.id, e)}
                                        onStartRenaming={() => setRenamingId(asset.id)}
                                        onCommitRename={name => handleRenameAsset(asset.id, name)}
                                        onDelete={() => handleDeleteAsset(asset.id, asset.name)}
                                        onReplace={() => handleReplaceAsset(asset.id, selectedCategory)}
                                        onMove={() => { setMoveAssetData({ id: asset.id, name: asset.name, type: selectedCategory }); setShowFolderSelector(true); }}
                                        onDragStart={() => setDraggedAsset({ id: asset.id, type: selectedCategory })}
                                        onDragEnd={() => setDraggedAsset(null)}
                                        showPath={isSearching}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : isSearching ? (
                        <EmptyState icon={<SearchIcon className="w-16 h-16 opacity-30" />} title={t('noResults')} description={t('noResultsDesc', { query: searchQuery })} />
                    ) : (
                        <EmptyState
                            icon={ASSET_CATEGORIES[selectedCategory].icon}
                            title={t('noAssetsYet', { category: t(`categoriesLower.${selectedCategory}`) })}
                            description={t('noAssetsDesc', { category: t(`categoriesLower.${selectedCategory}`) })}
                            onDrop={handleFileDrop}
                        />
                    )}
                </div>
            </div>

            {/* ── Inspector Panel (single selection) ── */}
            {selectedAssetForInspector && (
                <div style={{ width: 'var(--inspector-width)' }} className="bg-[var(--bg-primary)] border-l border-[var(--border-subtle)] flex flex-col overflow-y-auto">
                    <AssetInspector
                        asset={selectedAssetForInspector} assetType={selectedCategory} project={project}
                        onClose={() => setSelectedAssetIds(new Set())}
                        onUpdate={(updates) => dispatch({ type: 'UPDATE_ASSET', payload: { assetType: selectedCategory, assetId: selectedAssetForInspector.id, updates } })}
                        onReplace={() => handleReplaceAsset(selectedAssetForInspector.id, selectedCategory)}
                        onRename={() => setRenamingId(selectedAssetForInspector.id)}
                        onDelete={() => handleDeleteAsset(selectedAssetForInspector.id, selectedAssetForInspector.name)}
                    />
                </div>
            )}

            {/* ── Batch Panel (multi selection) ── */}
            {selectedAssetIds.size > 1 && (
                <div style={{ width: 'var(--inspector-width)' }} className="bg-[var(--bg-primary)] border-l border-[var(--border-subtle)] flex flex-col">
                    <div className="p-4 border-b border-[var(--border-subtle)]">
                        <h3 className="text-lg font-bold text-white">{t('batchSelection')}</h3>
                    </div>
                    <div className="flex-1 p-4 space-y-4">
                        <div className="bg-[var(--bg-primary)] p-4 rounded-lg text-center">
                            <div className="text-3xl font-bold text-sky-400">{selectedAssetIds.size}</div>
                            <div className="text-sm text-[var(--text-secondary)] mt-1">{t('assetsSelected')}</div>
                        </div>
                        <button onClick={() => { setMoveMultiple(true); setShowFolderSelector(true); }} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 rounded-lg font-medium transition-all border border-sky-500/30">
                            <FolderIcon className="w-4 h-4" /> {t('moveSelected')}
                        </button>
                        <button onClick={handleDeleteSelected} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg font-medium transition-all border border-red-500/30">
                            <TrashIcon className="w-4 h-4" /> {t('deleteSelected')}
                        </button>
                        <button onClick={() => setSelectedAssetIds(new Set())} className="w-full px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-white rounded-lg text-sm font-medium transition-colors">
                            {t('clearSelection')}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Modals ── */}
            <FolderSelectorModal
                isOpen={showFolderSelector}
                assetName={moveMultiple ? t('selected', { count: selectedAssetIds.size }) : (moveAssetData?.name || '')}
                allAssets={allAssets}
                onSelect={path => {
                    if (moveMultiple) { selectedAssetIds.forEach(id => handleMoveAsset(id, path)); setSelectedAssetIds(new Set()); }
                    else if (moveAssetData) handleMoveAsset(moveAssetData.id, path);
                    setShowFolderSelector(false); setMoveAssetData(null); setMoveMultiple(false);
                }}
                onClose={() => { setShowFolderSelector(false); setMoveAssetData(null); setMoveMultiple(false); }}
            />
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                title={deleteTarget?.type === 'folder' ? t('deleteFolderTitle') : deleteTarget?.type === 'multi' ? t('deleteAssetsTitle') : t('deleteAssetTitle')}
                message={
                    deleteTarget?.type === 'folder'
                        ? t('deleteFolderMsg', { name: deleteTarget.name })
                        : deleteTarget?.type === 'multi'
                            ? t('deleteAssetsMsg', { count: deleteTarget.count })
                            : t('deleteAssetMsg', { name: deleteTarget?.name })
                }
                confirmText={t('delete')} cancelText={t('cancel')} danger
                onConfirm={confirmDelete}
                onCancel={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}
            />
        </div>
    );
};

// ─── AssetCard ───────────────────────────────────────────────────────────────

const AssetCard: React.FC<{
    asset: any;
    assetType: AssetType;
    viewMode: ViewMode;
    isSelected: boolean;
    isRenaming: boolean;
    onSelect: (e: React.MouseEvent) => void;
    onStartRenaming: () => void;
    onCommitRename: (name: string) => void;
    onDelete: () => void;
    onReplace: () => void;
    onMove: () => void;
    onDragStart: () => void;
    onDragEnd: () => void;
    showPath?: boolean;
    sizeBytes?: number;
}> = React.memo(({ asset, assetType, viewMode, isSelected, isRenaming, onSelect, onStartRenaming, onCommitRename, onDelete, onReplace, onMove, onDragStart, onDragEnd, showPath = false, sizeBytes }) => {
    const { t } = useTranslation('assets');
    const { project: cardProject } = useProject();
    const { inputProps: renameInputProps } = useInlineRename(asset.name, onCommitRename);
    // Real on-disk size for file-backed assets; falls back to the data:-URL estimate (web / base64).
    const size = sizeBytes ?? estimateDataUrlSize(getAssetUrl(asset));
    const rImg = resolveFieldUrl(cardProject.id, asset.imageUrl) || undefined;
    const rVid = resolveFieldUrl(cardProject.id, asset.videoUrl) || undefined;

    const thumbnail = useMemo(() => {
        if (asset.imageUrl) return <img src={rImg} alt={asset.name} className="w-full h-full object-cover" loading="lazy" />;
        if (asset.videoUrl) return (
            <div className="w-full h-full relative">
                <TrimmedVideo src={rVid} className="w-full h-full object-cover" muted preload="metadata" trimStart={asset.trimStart} trimEnd={asset.trimEnd} />
                <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1 py-0.5"><FilmIcon className="w-3 h-3 text-white" /></div>
            </div>
        );
        if (asset.audioUrl) return (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-500/20 to-emerald-500/20">
                <MusicalNoteIcon className="w-10 h-10 text-green-400" />
            </div>
        );
        return <div className="w-full h-full flex items-center justify-center bg-[var(--bg-secondary)]"><PhotoIcon className="w-10 h-10 text-[var(--text-muted)]" /></div>;
    }, [asset.imageUrl, asset.videoUrl, asset.audioUrl, asset.name, asset.trimStart, asset.trimEnd, rImg, rVid]);

    if (viewMode === 'grid') {
        return (
            <div
                draggable={!isRenaming} onDragStart={onDragStart} onDragEnd={onDragEnd}
                onClick={onSelect} onDoubleClick={e => { e.stopPropagation(); onStartRenaming(); }}
                className={`group relative bg-[var(--bg-primary)] rounded-lg overflow-hidden cursor-pointer border transition-all hover:shadow-lg ${
                    isSelected ? 'border-sky-500 ring-2 ring-sky-500/30 shadow-sky-500/10' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
                }`}
            >
                {/* Checkbox */}
                <div className={`absolute top-1.5 left-1.5 z-10 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-sky-500 border-sky-500' : 'bg-[var(--bg-primary)]/80 border-slate-400 hover:border-white'
                    }`}>
                        {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
                    </div>
                </div>

                <div className="aspect-square">{thumbnail}</div>

                <div className="p-2">
                    {isRenaming ? (
                        <input type="text" {...renameInputProps}
                            className="w-full bg-[var(--bg-primary)] text-white px-2 py-1 rounded text-xs outline-none ring-2 ring-sky-500" />
                    ) : (
                        <>
                            <div className="text-xs text-white truncate font-medium" title={asset.name}>{asset.name}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[10px] text-[var(--text-muted)]">{formatFileSize(size)}</span>
                                {showPath && asset.path && <>
                                    <span className="text-[10px] text-slate-600">·</span>
                                    <span className="text-[10px] text-[var(--text-muted)] truncate" title={asset.path}>{asset.path}</span>
                                </>}
                            </div>
                        </>
                    )}
                </div>

                {/* Hover Actions */}
                <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ActionBtn icon={<UploadIcon className="w-3 h-3" />} title={t('replace')} onClick={onReplace} color="hover:text-amber-400" />
                    <ActionBtn icon={<FolderIcon className="w-3 h-3" />} title={t('move')} onClick={onMove} color="hover:text-yellow-400" />
                    <ActionBtn icon={<PencilIcon className="w-3 h-3" />} title={t('rename')} onClick={onStartRenaming} color="hover:text-sky-400" />
                    <ActionBtn icon={<TrashIcon className="w-3 h-3" />} title={t('delete')} onClick={onDelete} color="hover:text-red-400" />
                </div>
            </div>
        );
    }

    // ── List View ──
    return (
        <div
            draggable={!isRenaming} onDragStart={onDragStart} onDragEnd={onDragEnd}
            onClick={onSelect} onDoubleClick={e => { e.stopPropagation(); onStartRenaming(); }}
            className={`group flex items-center gap-3 bg-[var(--bg-primary)] rounded-lg p-2 cursor-pointer border transition-all ${
                isSelected ? 'border-sky-500 ring-2 ring-sky-500/30' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
            }`}
        >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                isSelected ? 'bg-sky-500 border-sky-500' : 'bg-[var(--bg-primary)] border-[var(--border-default)] group-hover:border-slate-400'
            }`}>
                {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
            </div>

            <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">{thumbnail}</div>

            <div className="flex-1 min-w-0">
                {isRenaming ? (
                    <input type="text" {...renameInputProps}
                        className="w-full bg-[var(--bg-primary)] text-white px-2 py-1 rounded text-sm outline-none ring-2 ring-sky-500" />
                ) : (
                    <>
                        <div className="text-sm text-white truncate font-medium">{asset.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-[var(--text-muted)]">{formatFileSize(size)}</span>
                            <span className="text-xs text-slate-600 capitalize">{assetType.slice(0, -1)}</span>
                            {showPath && asset.path && (
                                <span className="text-xs text-[var(--text-muted)] truncate" title={asset.path}><FolderIcon className="w-3 h-3 inline mr-0.5" />{asset.path}</span>
                            )}
                        </div>
                    </>
                )}
            </div>

            <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <ActionBtn icon={<UploadIcon className="w-3.5 h-3.5" />} title={t('replace')} onClick={onReplace} color="hover:text-amber-400" />
                <ActionBtn icon={<FolderIcon className="w-3.5 h-3.5" />} title={t('move')} onClick={onMove} color="hover:text-yellow-400" />
                <ActionBtn icon={<PencilIcon className="w-3.5 h-3.5" />} title={t('rename')} onClick={onStartRenaming} color="hover:text-sky-400" />
                <ActionBtn icon={<TrashIcon className="w-3.5 h-3.5" />} title={t('delete')} onClick={onDelete} color="hover:text-red-400" />
            </div>
        </div>
    );
});

// ─── ActionBtn ───────────────────────────────────────────────────────────────

const ActionBtn: React.FC<{ icon: React.ReactNode; title: string; onClick: (e?: any) => void; color: string }> = ({ icon, title, onClick, color }) => (
    <button onClick={e => { e.stopPropagation(); onClick(e); }} className={`p-1 rounded bg-[var(--bg-primary)]/80 text-[var(--text-secondary)] ${color} transition-colors`} title={title}>
        {icon}
    </button>
);

// ─── FolderCard ──────────────────────────────────────────────────────────────

const FolderCard: React.FC<{
    folder: DirectoryNode;
    viewMode: ViewMode;
    isRenaming: boolean;
    onClick: () => void;
    onStartRenaming: () => void;
    onCommitRename: (name: string) => void;
    onDelete: () => void;
    onDrop: (path: string) => void;
}> = React.memo(({ folder, viewMode, isRenaming, onClick, onStartRenaming, onCommitRename, onDelete, onDrop }) => {
    const { t } = useTranslation('assets');
    const [isHovering, setIsHovering] = useState(false);
    const { inputProps: renameInputProps } = useInlineRename(folder.name, onCommitRename);
    const totalAssets = folder.assets.length + folder.children.reduce((acc, c) => acc + c.assets.length, 0);

    // Single-click navigates into the folder, so only navigate when not renaming.
    const handleClick = () => { if (!isRenaming) onClick(); };

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsHovering(true); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsHovering(false); };
    const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsHovering(false); onDrop(folder.path); };

    if (viewMode === 'grid') {
        return (
            <div
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                onClick={handleClick} onDoubleClick={e => { e.stopPropagation(); onStartRenaming(); }}
                className={`group relative bg-[var(--bg-primary)] rounded-lg p-3 cursor-pointer border transition-all ${
                    isHovering ? 'border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/50' : 'border-[var(--border-subtle)] hover:border-sky-500/50'
                }`}
            >
                <div className="flex flex-col items-center text-center">
                    <FolderIcon className={`w-10 h-10 mb-1.5 ${isHovering ? 'text-sky-400' : 'text-yellow-500'}`} />
                    {isRenaming ? (
                        <input type="text" {...renameInputProps}
                            className="w-full bg-[var(--bg-primary)] text-white px-2 py-1 rounded text-xs outline-none ring-2 ring-sky-500 text-center" />
                    ) : (
                        <div className="font-medium text-white text-xs truncate w-full">{folder.name}</div>
                    )}
                    <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">{t('items', { count: totalAssets })}</div>
                </div>
                {!isRenaming && (
                    <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); onStartRenaming(); }} className="p-1 rounded bg-[var(--bg-primary)]/80 text-[var(--text-secondary)] hover:text-sky-400 transition-colors" title={t('rename')}>
                            <PencilIcon className="w-3 h-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); onDelete(); }} className="p-1 rounded bg-[var(--bg-primary)]/80 text-[var(--text-secondary)] hover:text-red-400 transition-colors" title={t('deleteFolderAction')}>
                            <TrashIcon className="w-3 h-3" />
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            onClick={handleClick} onDoubleClick={e => { e.stopPropagation(); onStartRenaming(); }}
            className={`group flex items-center gap-3 bg-[var(--bg-primary)] rounded-lg p-2 cursor-pointer border transition-all ${
                isHovering ? 'border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/50' : 'border-[var(--border-subtle)] hover:border-sky-500/50'
            }`}
        >
            <FolderIcon className={`w-8 h-8 flex-shrink-0 ${isHovering ? 'text-sky-400' : 'text-yellow-500'}`} />
            <div className="flex-1 min-w-0">
                {isRenaming ? (
                    <input type="text" {...renameInputProps}
                        className="w-full bg-[var(--bg-primary)] text-white px-2 py-1 rounded text-sm outline-none ring-2 ring-sky-500" />
                ) : (
                    <>
                        <div className="font-medium text-white text-sm truncate">{folder.name}</div>
                        <div className="text-xs text-[var(--text-secondary)]">{t('items', { count: totalAssets })}</div>
                    </>
                )}
            </div>
            {!isRenaming && (
                <>
                    <button onClick={e => { e.stopPropagation(); onStartRenaming(); }} className="p-1 text-[var(--text-secondary)] hover:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity" title={t('rename')}>
                        <PencilIcon className="w-4 h-4" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); onDelete(); }} className="p-1 text-[var(--text-secondary)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" title={t('deleteFolderAction')}>
                        <TrashIcon className="w-4 h-4" />
                    </button>
                    <ChevronRightIcon className="w-4 h-4 text-[var(--text-muted)]" />
                </>
            )}
        </div>
    );
});

// ─── EmptyState ──────────────────────────────────────────────────────────────

const EmptyState: React.FC<{
    icon: React.ReactNode;
    title: string;
    description: string;
    onDrop?: (files: File[]) => void;
}> = ({ icon, title, description, onDrop }) => {
    const { t } = useTranslation('assets');
    const [isDragOver, setIsDragOver] = useState(false);
    return (
        <div
            className="flex-1 flex items-center justify-center min-h-[300px]"
            onDragOver={e => { if (onDrop) { e.preventDefault(); setIsDragOver(true); } }}
            onDragLeave={e => { if (onDrop) { e.preventDefault(); setIsDragOver(false); } }}
            onDrop={e => { if (!onDrop) return; e.preventDefault(); setIsDragOver(false); const files = Array.from(e.dataTransfer.files); if (files.length > 0) onDrop(files); }}
        >
            <div className={`text-center max-w-sm p-8 rounded-xl border-2 border-dashed transition-all ${
                isDragOver ? 'border-sky-400 bg-sky-500/10 scale-105' : onDrop ? 'border-[var(--border-default)] hover:border-[var(--border-default)]' : 'border-transparent'
            }`}>
                <div className={`flex justify-center mb-4 ${isDragOver ? 'text-sky-400' : 'text-slate-600'}`}>
                    {React.cloneElement(icon as React.ReactElement, { className: 'w-16 h-16' } as any)}
                </div>
                <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
                <p className="text-[var(--text-secondary)] text-sm">{description}</p>
                {onDrop && <p className={`text-xs mt-3 ${isDragOver ? 'text-sky-300' : 'text-[var(--text-muted)]'}`}>{isDragOver ? t('dropFilesHere') : t('dragDropHere')}</p>}
            </div>
        </div>
    );
};

// ─── UploadButton ────────────────────────────────────────────────────────────

const UploadButton: React.FC<{
    accept: string;
    onUpload: (name: string, dataUrl: string, filename: string) => void;
}> = ({ accept, onUpload }) => {
    const { t } = useTranslation('assets');
    const inputRef = useRef<HTMLInputElement>(null);
    const toast = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setIsUploading(true);
        const arr: File[] = Array.from(files);
        setProgress({ current: 0, total: arr.length });
        let ok = 0, fail = 0;
        for (let i = 0; i < arr.length; i++) {
            setProgress({ current: i + 1, total: arr.length });
            try {
                const b64 = await fileToBase64(arr[i]);
                onUpload(arr[i].name.replace(/\.[^/.]+$/, ''), b64, arr[i].name);
                ok++;
            } catch { fail++; }
        }
        if (fail > 0) toast.warning(t('toastUploadPartial', { ok, fail }));
        else if (ok > 0) toast.success(t('toastUploaded', { count: ok }));
        setIsUploading(false); setProgress(null);
        if (inputRef.current) inputRef.current.value = '';
    };

    return (
        <div className="relative">
            <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" disabled={isUploading} multiple />
            <button onClick={() => inputRef.current?.click()} disabled={isUploading}
                className="relative flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-sky-500 to-purple-500 hover:from-sky-600 hover:to-purple-600 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-70 shadow-lg overflow-hidden"
            >
                {isUploading && progress && (
                    <div className="absolute inset-0 bg-white/20 transition-all" style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }} />
                )}
                <span className="relative flex items-center gap-1.5">
                    {isUploading ? (
                        <>
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            {progress && `${progress.current}/${progress.total}`}
                        </>
                    ) : (
                        <><PlusIcon className="w-4 h-4" /> {t('upload')}</>
                    )}
                </span>
            </button>
        </div>
    );
};

// ─── AssetInspector ──────────────────────────────────────────────────────────

const AssetInspector: React.FC<{
    asset: any;
    assetType: AssetType;
    project: VNProject;
    onClose: () => void;
    onUpdate: (updates: any) => void;
    onReplace: () => void;
    onRename: () => void;
    onDelete: () => void;
}> = ({ asset, assetType, project, onClose, onUpdate, onReplace, onRename, onDelete }) => {
    const { t } = useTranslation('assets');
    const size = estimateDataUrlSize(getAssetUrl(asset));
    const usage = useMemo(() => findAssetUsage(project, asset.id), [project, asset.id]);

    return (
        <div className="flex flex-col h-full">
            <div className="p-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <h3 className="text-sm font-bold text-white truncate flex-1" title={asset.name}>{asset.name}</h3>
                <button onClick={onClose} className="p-1 text-[var(--text-secondary)] hover:text-white transition-colors ml-2" title={t('close')}><XMarkIcon className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-4">
                {/* Preview */}
                {(asset.imageUrl || asset.videoUrl) && (
                    <div className="bg-[var(--bg-primary)] rounded-lg overflow-hidden">
                        {asset.videoUrl
                            ? <TrimmedVideo src={resolveFieldUrl(project.id, asset.videoUrl) || undefined} controls loop={asset.loop} trimStart={asset.trimStart} trimEnd={asset.trimEnd} className="w-full rounded-lg" />
                            : <img src={resolveFieldUrl(project.id, asset.imageUrl) || undefined} alt={asset.name} className="w-full rounded-lg object-contain max-h-[300px]" />
                        }
                    </div>
                )}

                {/* Default video trim — trim this asset once; every use inherits it unless the
                    command/element sets its own per-use trim. */}
                {asset.videoUrl && (
                    <div className="bg-[var(--bg-primary)] rounded-lg p-3">
                        <VideoTrimFields label={t('defaultTrim', 'Default trim (seconds)')} start={asset.trimStart} end={asset.trimEnd}
                            onChange={patch => onUpdate(patch)} />
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">{t('defaultTrimHint', 'Applies to every use of this video unless a command/element overrides it.')}</p>
                    </div>
                )}
                {asset.audioUrl && (
                    <div className="bg-[var(--bg-primary)] p-3 rounded-lg">
                        <div className="flex items-center justify-center mb-3">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
                                <MusicalNoteIcon className="w-8 h-8 text-green-400" />
                            </div>
                        </div>
                        <audio src={resolveFieldUrl(project.id, asset.audioUrl) || undefined} controls className="w-full" />
                    </div>
                )}
                {/* Default sound shaping — shape this sound once; every use inherits it unless a
                    command/action sets its own. Reverse only takes effect on SFX/voice uses (the
                    music channel plays forward by design). */}
                {asset.audioUrl && (
                    <div className="bg-[var(--bg-primary)] rounded-lg p-3">
                        <h4 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wider">{t('defaultShaping', 'Default sound shaping')}</h4>
                        <AudioAdjustFields
                            value={asset.audioAdjust}
                            onChange={next => onUpdate({ audioAdjust: next })}
                            allowReverse
                            project={project}
                            audioId={asset.id}
                        />
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">{t('defaultShapingHint', 'Applies wherever this sound is used, unless a command or button sets its own. "Play backwards" only affects sound effects and voices — music always plays forward.')}</p>
                    </div>
                )}

                {/* Quick Actions */}
                <div className="grid grid-cols-3 gap-1.5">
                    <button onClick={onReplace} className="flex flex-col items-center gap-1 p-2 bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] rounded-lg transition-colors" title={t('replaceFile')}>
                        <UploadIcon className="w-4 h-4 text-amber-400" /><span className="text-[10px] text-[var(--text-secondary)]">{t('replace')}</span>
                    </button>
                    <button onClick={onRename} className="flex flex-col items-center gap-1 p-2 bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] rounded-lg transition-colors" title={t('rename')}>
                        <PencilIcon className="w-4 h-4 text-sky-400" /><span className="text-[10px] text-[var(--text-secondary)]">{t('rename')}</span>
                    </button>
                    <button onClick={onDelete} className="flex flex-col items-center gap-1 p-2 bg-[var(--bg-primary)] hover:bg-red-500/10 rounded-lg transition-colors" title={t('delete')}>
                        <TrashIcon className="w-4 h-4 text-red-400" /><span className="text-[10px] text-[var(--text-secondary)]">{t('delete')}</span>
                    </button>
                </div>

                {/* Metadata */}
                <div>
                    <h4 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wider">{t('details')}</h4>
                    <div className="bg-[var(--bg-primary)] rounded-lg divide-y divide-slate-800">
                        <MetaRow label={t('metaType')} value={assetType.slice(0, -1)} />
                        <MetaRow label={t('metaSize')} value={formatFileSize(size)} />
                        <MetaRow label={t('metaId')} value={asset.id} mono />
                        {asset.path && <MetaRow label={t('metaPath')} value={asset.path} mono />}
                    </div>
                </div>

                {/* Usage */}
                <div>
                    <h4 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wider">{t('usedIn', { count: usage.length })}</h4>
                    {usage.length > 0 ? (
                        <div className="bg-[var(--bg-primary)] rounded-lg divide-y divide-slate-800 max-h-[200px] overflow-y-auto">
                            {usage.map((ref, i) => (
                                <div key={i} className="px-3 py-2 flex items-center gap-2">
                                    <span className="text-xs text-white truncate flex-1">{ref.location}</span>
                                    <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">{ref.detail}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-[var(--bg-primary)] rounded-lg p-3"><p className="text-xs text-[var(--text-muted)] italic text-center">{t('notReferenced')}</p></div>
                    )}
                </div>
            </div>
        </div>
    );
};

const MetaRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
    <div className="px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--text-secondary)] flex-shrink-0">{label}</span>
        <span className={`text-xs text-white truncate ${mono ? 'font-mono text-[10px]' : ''}`} title={value}>{value}</span>
    </div>
);

// ─── FolderSelectorModal ─────────────────────────────────────────────────────

const FolderSelectorModal: React.FC<{
    isOpen: boolean;
    assetName: string;
    allAssets: any[];
    onSelect: (path: string) => void;
    onClose: () => void;
}> = ({ isOpen, assetName, allAssets, onSelect, onClose }) => {
    const { t } = useTranslation('assets');
    const [selectedPath, setSelectedPath] = useState('');
    const [customPath, setCustomPath] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);

    if (!isOpen) return null;

    const folderPaths = new Set<string>(['']);
    allAssets.forEach(asset => {
        if (asset.path) {
            const parts = (asset.path as string).split('/').filter((p: string) => p);
            let acc = '';
            parts.forEach((p: string) => { acc = acc ? `${acc}/${p}` : p; folderPaths.add(acc); });
        }
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
            <div className="bg-[var(--bg-primary)] rounded-xl shadow-2xl w-full max-w-md border border-[var(--border-subtle)]" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-[var(--border-subtle)]">
                    <h3 className="text-lg font-bold text-white">{t('moveAsset')}</h3>
                    <p className="text-[var(--text-secondary)] text-sm mt-1">{t('moveAssetTo', { name: assetName })}</p>
                </div>

                <div className="p-5 space-y-3 max-h-80 overflow-y-auto">
                    {!showCustomInput ? (
                        <>
                            {Array.from(folderPaths).sort().map(path => (
                                <button key={path} onClick={() => setSelectedPath(path)}
                                    className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-all ${
                                        selectedPath === path ? 'bg-sky-500/20 border-2 border-sky-500' : 'bg-[var(--bg-secondary)] border-2 border-transparent hover:bg-[var(--bg-tertiary)]'
                                    }`}>
                                    <FolderIcon className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                                    <span className="text-white text-sm font-medium">{path || t('root')}</span>
                                </button>
                            ))}
                            <button onClick={() => setShowCustomInput(true)} className="w-full p-3 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-white text-sm font-medium flex items-center justify-center gap-2">
                                <PlusIcon className="w-4 h-4" /> {t('newFolderPath')}
                            </button>
                        </>
                    ) : (
                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-[var(--text-secondary)]">{t('customPath')}</label>
                            <input type="text" value={customPath} onChange={e => setCustomPath(e.target.value)} placeholder={t('customPathPlaceholder')}
                                className="w-full bg-[var(--bg-primary)] text-white px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-[var(--accent-lavender)]" autoFocus />
                            <button onClick={() => setShowCustomInput(false)} className="text-sky-400 hover:text-sky-300 text-sm font-medium">{t('backToFolderList')}</button>
                        </div>
                    )}
                </div>

                <div className="p-5 border-t border-[var(--border-subtle)] flex items-center gap-3">
                    <button onClick={onClose} className="flex-1 px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-white rounded-lg font-medium transition-colors">{t('cancel')}</button>
                    <button onClick={() => onSelect(showCustomInput ? customPath.trim() : selectedPath)}
                        className="flex-1 px-4 py-2 bg-gradient-to-r from-sky-500 to-purple-500 hover:from-sky-600 hover:to-purple-600 text-white rounded-lg font-medium transition-all">
                        {t('moveHere')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── ConfirmDialog ───────────────────────────────────────────────────────────

const ConfirmDialog: React.FC<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ isOpen, title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false, onConfirm, onCancel }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
            <div className="bg-[var(--bg-primary)] rounded-xl shadow-2xl w-full max-w-md border border-[var(--border-subtle)]" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-[var(--border-subtle)]"><h3 className="text-lg font-bold text-white">{title}</h3></div>
                <div className="p-5"><p className="text-[var(--text-primary)]">{message}</p></div>
                <div className="p-5 border-t border-[var(--border-subtle)] flex items-center gap-3">
                    <button onClick={onCancel} className="flex-1 px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-white rounded-lg font-medium transition-colors">{cancelText}</button>
                    <button onClick={onConfirm}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                            danger ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gradient-to-r from-sky-500 to-purple-500 hover:from-sky-600 hover:to-purple-600 text-white'
                        }`}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default React.memo(AssetManager);
