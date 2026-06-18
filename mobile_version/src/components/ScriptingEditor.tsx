/**
 * Scripting Editor — Project JSON Viewer / Editor
 *
 * Provides a developer-focused view of the project's JSON data.
 * Users can browse the full project tree, inspect any node, and
 * directly edit JSON values with validation. Designed for power
 * users who want to see and modify the underlying data structures.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { VNProject } from '../types/project';
import { VNID } from '../types';
import {
    ChevronDownIcon, ChevronRightIcon, SearchIcon,
    CodeBracketIcon, PencilIcon, SaveIcon, TrashIcon
} from './icons';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface TreeNode {
    key: string;
    path: string[];    // full key-path from root
    value: JsonValue;
    type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
    childCount?: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const getJsonType = (v: unknown): TreeNode['type'] => {
    if (v === null || v === undefined) return 'null';
    if (Array.isArray(v)) return 'array';
    const t = typeof v;
    if (t === 'object') return 'object';
    if (t === 'number' || t === 'bigint') return 'number';
    if (t === 'boolean') return 'boolean';
    return 'string'; // fallback for string, symbol, function, etc.
};

const TYPE_COLORS: Record<TreeNode['type'], string> = {
    string: '#a5d6a7',
    number: '#90caf9',
    boolean: '#ce93d8',
    null: '#ef9a9a',
    array: '#ffcc80',
    object: '#80deea',
};

const SECTION_ORDER = [
    'id', 'title', 'description', 'author', 'version', 'startSceneId',
    'scenes', 'characters', 'backgrounds', 'images', 'audio', 'videos',
    'variables', 'fonts', 'ui', 'uiScreens', 'commonEvents', 'scripts',
    'gameResolution', 'cgGallery', 'plugins', 'pluginRegistry',
];

const SECTION_LABELS: Record<string, string> = {
    scenes: 'Scenes',
    characters: 'Characters',
    backgrounds: 'Backgrounds',
    images: 'Images',
    audio: 'Audio',
    videos: 'Videos',
    variables: 'Variables',
    fonts: 'Fonts',
    ui: 'UI Settings',
    uiScreens: 'UI Screens',
    commonEvents: 'Common Events',
    scripts: 'Scripts',
    gameResolution: 'Game Resolution',
    cgGallery: 'CG Gallery',
    plugins: 'Plugins',
    pluginRegistry: 'Plugin Registry',
};

const getAtPath = (obj: any, path: string[]): unknown => {
    let current = obj;
    for (const key of path) {
        if (current == null) return undefined;
        current = current[key];
    }
    return current;
};

const setAtPath = (obj: any, path: string[], value: unknown): any => {
    if (path.length === 0) return value;
    const copy = Array.isArray(obj) ? [...obj] : { ...obj };
    const [head, ...rest] = path;
    copy[head] = setAtPath(copy[head], rest, value);
    return copy;
};

function matchesSearch(value: unknown, query: string): boolean {
    if (query.length === 0) return true;
    const q = query.toLowerCase();
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return str.toLowerCase().includes(q);
}

/** Replacer that truncates large data-URIs and base64 blobs to keep
 *  the Raw JSON view responsive. Original data is preserved in the
 *  project object; this only affects the display string. */
function safeJsonReplacer(_key: string, value: unknown): unknown {
    if (typeof value === 'string' && value.length > 500) {
        // Truncate data: URIs (base64-encoded assets)
        if (value.startsWith('data:')) {
            return value.slice(0, 80) + `…[${Math.round(value.length / 1024)} KB truncated]`;
        }
        // Truncate any very long string (> 2 KB)
        if (value.length > 2048) {
            return value.slice(0, 200) + `…[${Math.round(value.length / 1024)} KB truncated]`;
        }
    }
    return value;
}

/* ------------------------------------------------------------------ */
/*  JSON Tree Node Component                                           */
/* ------------------------------------------------------------------ */

interface JsonTreeNodeProps {
    nodeKey: string;
    value: unknown;
    path: string[];
    depth: number;
    searchQuery: string;
    expandedPaths: Set<string>;
    onToggle: (pathStr: string) => void;
    onSelect: (path: string[]) => void;
    selectedPathStr: string;
}

const JsonTreeNode: React.FC<JsonTreeNodeProps> = React.memo(({
    nodeKey, value, path, depth, searchQuery,
    expandedPaths, onToggle, onSelect, selectedPathStr
}) => {
    // Never render nodes whose value is undefined
    if (value === undefined) return null;

    const pathStr = path.join('.');
    const type = getJsonType(value);
    const isExpandable = type === 'object' || type === 'array';
    const isExpanded = expandedPaths.has(pathStr);
    const isSelected = selectedPathStr === pathStr;

    const childEntries = useMemo(() => {
        if (!isExpandable || !isExpanded) return [];
        if (type === 'array') {
            return (value as unknown[])
                .map((v, i) => ({ key: String(i), value: v }))
                .filter(({ value: v }) => v !== undefined);
        }
        // Filter out entries whose value is undefined and normalize to object format
        return Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .map(([key, val]) => ({ key, value: val }));
    }, [value, isExpandable, isExpanded, type]);

    const childCount = useMemo(() => {
        if (type === 'array') return (value as unknown[]).filter(v => v !== undefined).length;
        if (type === 'object' && value) {
            // Only count keys with defined values
            return Object.values(value as Record<string, unknown>).filter(v => v !== undefined).length;
        }
        return 0;
    }, [value, type]);

    // Skip rendering nodes that don't match search
    if (searchQuery && !matchesSearch(value, searchQuery) && !matchesSearch(nodeKey, searchQuery)) {
        return null;
    }

    const displayLabel = SECTION_LABELS[nodeKey] || nodeKey;

    return (
        <div>
            <div
                className={`flex items-center gap-1 py-0.5 cursor-pointer transition-colors group ${
                    isSelected ? 'bg-sky-500/15' : 'hover:bg-white/5'
                }`}
                style={{ paddingLeft: `${depth * 16 + 4}px` }}
                onClick={() => onSelect(path)}
            >
                {/* Expand / collapse toggle */}
                {isExpandable ? (
                    <button
                        onClick={e => { e.stopPropagation(); onToggle(pathStr); }}
                        className="w-4 h-4 flex items-center justify-center flex-shrink-0"
                    >
                        {isExpanded
                            ? <ChevronDownIcon className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                            : <ChevronRightIcon className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />}
                    </button>
                ) : (
                    <span className="w-4 flex-shrink-0" />
                )}

                {/* Key name */}
                <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                    {displayLabel}
                </span>

                {/* Type badge & preview */}
                {isExpandable ? (
                    <span className="text-[10px] ml-1" style={{ color: TYPE_COLORS[type] }}>
                        {type === 'array' ? `[${childCount}]` : `{${childCount}}`}
                    </span>
                ) : (
                    <span className="text-xs ml-1.5 truncate max-w-[200px]" style={{ color: TYPE_COLORS[type] }}>
                        {value === null ? <em style={{ color: 'var(--text-muted)' }}>null</em>
                            : type === 'string' ? `"${String(value).slice(0, 50)}${String(value).length > 50 ? '\u2026' : ''}"` 
                            : type === 'boolean' ? (value ? 'true' : 'false')
                            : String(value)}
                    </span>
                )}
            </div>

            {/* Children */}
            {isExpanded && childEntries.map(({ key, value: childVal }) => (
                <JsonTreeNode
                    key={key}
                    nodeKey={key}
                    value={childVal}
                    path={[...path, key]}
                    depth={depth + 1}
                    searchQuery={searchQuery}
                    expandedPaths={expandedPaths}
                    onToggle={onToggle}
                    onSelect={onSelect}
                    selectedPathStr={selectedPathStr}
                />
            ))}
        </div>
    );
});

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

const ScriptingEditor: React.FC<{ project: VNProject }> = ({ project }) => {
    const { dispatch } = useProject();

    // ------- State -------
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
        // Start with top-level sections expanded
        return new Set(SECTION_ORDER.filter(k => (project as any)[k] != null));
    });
    const [selectedPath, setSelectedPath] = useState<string[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const [editError, setEditError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'tree' | 'raw'>('tree');
    const [rawJson, setRawJson] = useState('');
    const [rawEditError, setRawEditError] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const rawTextareaRef = useRef<HTMLTextAreaElement>(null);

    const selectedPathStr = selectedPath.join('.');
    const selectedValue = useMemo(() => getAtPath(project, selectedPath), [project, selectedPath]);

    // ------- Handlers -------

    const handleToggle = useCallback((pathStr: string) => {
        setExpandedPaths(prev => {
            const next = new Set(prev);
            if (next.has(pathStr)) next.delete(pathStr);
            else next.add(pathStr);
            return next;
        });
    }, []);

    const handleSelect = useCallback((path: string[]) => {
        setSelectedPath(path);
        setIsEditing(false);
        setEditError(null);
    }, []);

    const handleStartEdit = useCallback(() => {
        setEditValue(JSON.stringify(selectedValue, safeJsonReplacer, 2));
        setIsEditing(true);
        setEditError(null);
    }, [selectedValue]);

    const handleSaveEdit = useCallback(() => {
        try {
            const parsed = JSON.parse(editValue);
            // Build a fully updated project by setting the value at the path
            const updatedProject = setAtPath(project, selectedPath, parsed);

            // We can't easily dispatch a generic "set entire project" action,
            // so we dispatch the specific section update.
            // The simplest approach: dispatch IMPORT_PROJECT with the updated data
            dispatch({ type: 'SET_PROJECT', payload: updatedProject } as any);

            setIsEditing(false);
            setEditError(null);
            setStatusMessage('Saved successfully');
            setTimeout(() => setStatusMessage(null), 2000);
        } catch (err: any) {
            setEditError(err.message || 'Invalid JSON');
        }
    }, [editValue, selectedPath, project, dispatch]);

    const handleCancelEdit = useCallback(() => {
        setIsEditing(false);
        setEditError(null);
    }, []);

    // Raw JSON mode
    const handleSwitchToRaw = useCallback(() => {
        setViewMode('raw');
        // Use safe replacer to truncate data URIs and prevent browser freeze
        setRawJson(JSON.stringify(project, safeJsonReplacer, 2));
        setRawEditError('Note: Large data URIs are truncated for display. Editing & saving will re-apply full data from the project.');
    }, [project]);

    const handleRawSave = useCallback(() => {
        try {
            const parsed = JSON.parse(rawJson);
            if (!parsed.id || !parsed.title || !parsed.scenes) {
                setRawEditError('Invalid project: must contain id, title, and scenes.');
                return;
            }
            dispatch({ type: 'SET_PROJECT', payload: parsed } as any);
            setRawEditError(null);
            setStatusMessage('Project JSON applied successfully');
            setTimeout(() => setStatusMessage(null), 3000);
        } catch (err: any) {
            setRawEditError(err.message || 'Invalid JSON');
        }
    }, [rawJson, dispatch]);

    const handleCopyPath = useCallback(() => {
        const pathStr = selectedPath.join('.');
        navigator.clipboard.writeText(pathStr).then(() => {
            setStatusMessage(`Copied: ${pathStr}`);
            setTimeout(() => setStatusMessage(null), 2000);
        });
    }, [selectedPath]);

    const handleCopyValue = useCallback(() => {
        const json = JSON.stringify(selectedValue, safeJsonReplacer, 2);
        navigator.clipboard.writeText(json).then(() => {
            setStatusMessage('Value copied to clipboard');
            setTimeout(() => setStatusMessage(null), 2000);
        });
    }, [selectedValue]);

    // Keyboard shortcut: Ctrl+S to save when editing
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (viewMode === 'raw') handleRawSave();
            else if (isEditing) handleSaveEdit();
        }
        if (e.key === 'Tab' && (viewMode === 'raw' || isEditing)) {
            e.preventDefault();
            const textarea = viewMode === 'raw' ? rawTextareaRef.current : textareaRef.current;
            if (!textarea) return;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const val = viewMode === 'raw' ? rawJson : editValue;
            const newVal = val.substring(0, start) + '  ' + val.substring(end);
            if (viewMode === 'raw') setRawJson(newVal);
            else setEditValue(newVal);
            requestAnimationFrame(() => {
                textarea.selectionStart = textarea.selectionEnd = start + 2;
            });
        }
    }, [isEditing, viewMode, handleSaveEdit, handleRawSave, rawJson, editValue]);

    // ------- Ordered top-level keys -------
    const orderedKeys = useMemo(() => {
        // Only include keys whose value is not undefined
        const projectKeys = Object.keys(project).filter(k => (project as any)[k] !== undefined);
        const ordered: string[] = [];
        for (const k of SECTION_ORDER) {
            if (projectKeys.includes(k)) ordered.push(k);
        }
        for (const k of projectKeys) {
            if (!ordered.includes(k)) ordered.push(k);
        }
        return ordered;
    }, [project]);

    // ------- Project stats -------
    const stats = useMemo(() => {
        // Use safeJsonReplacer to avoid freezing on large base64 data
        const jsonStr = JSON.stringify(project, safeJsonReplacer);
        return {
            size: (jsonStr.length / 1024).toFixed(1),
            scenes: Object.keys(project.scenes || {}).length,
            characters: Object.keys(project.characters || {}).length,
            variables: Object.keys(project.variables || {}).length,
            commonEvents: Object.keys((project as any).commonEvents || {}).length,
        };
    }, [project]);

    /* ------------------------------------------------------------ */
    /*  Render                                                       */
    /* ------------------------------------------------------------ */

    return (
        <div className="flex h-full overflow-hidden" onKeyDown={handleKeyDown}>
            {/* ─── Left: Tree / Raw browser ─── */}
            <div className="flex-1 flex flex-col min-w-0 border-r" style={{ borderColor: 'var(--border-subtle)' }}>
                {/* Toolbar */}
                <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                    <CodeBracketIcon className="w-4 h-4 text-sky-400" />
                    <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Project JSON</h2>

                    {/* View mode toggle */}
                    <div className="flex items-center gap-0.5 ml-2 p-0.5 rounded" style={{ background: 'var(--bg-primary)' }}>
                        <button
                            onClick={() => setViewMode('tree')}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                viewMode === 'tree' ? 'bg-sky-500/20 text-sky-300' : 'text-[var(--text-muted)] hover:text-white'
                            }`}
                        >
                            Tree
                        </button>
                        <button
                            onClick={handleSwitchToRaw}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                viewMode === 'raw' ? 'bg-sky-500/20 text-sky-300' : 'text-[var(--text-muted)] hover:text-white'
                            }`}
                        >
                            Raw JSON
                        </button>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-2 ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        <span>{stats.size} KB</span>
                        <span>{stats.scenes} scenes</span>
                        <span>{stats.characters} chars</span>
                        <span>{stats.variables} vars</span>
                    </div>
                </div>

                {/* Search (tree mode only) */}
                {viewMode === 'tree' && (
                    <div className="px-2 py-1.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                        <div className="relative">
                            <SearchIcon className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Filter by key or value..."
                                className="w-full pl-7 pr-2 py-1 rounded text-xs outline-none"
                                style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                            />
                        </div>
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-auto min-h-0" style={{ background: viewMode === 'raw' ? '#0d1117' : 'var(--bg-primary)' }}>
                    {viewMode === 'tree' ? (
                        <div className="py-1">
                            {orderedKeys.map(key => (
                                <JsonTreeNode
                                    key={key}
                                    nodeKey={key}
                                    value={(project as any)[key]}
                                    path={[key]}
                                    depth={0}
                                    searchQuery={searchQuery}
                                    expandedPaths={expandedPaths}
                                    onToggle={handleToggle}
                                    onSelect={handleSelect}
                                    selectedPathStr={selectedPathStr}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="relative h-full">
                            <textarea
                                ref={rawTextareaRef}
                                value={rawJson}
                                onChange={e => { setRawJson(e.target.value); setRawEditError(null); }}
                                spellCheck={false}
                                className="absolute inset-0 w-full h-full resize-none p-4 text-xs leading-5 outline-none font-mono"
                                style={{ background: '#0d1117', color: '#c9d1d9', tabSize: 2, caretColor: '#58a6ff' }}
                            />
                        </div>
                    )}
                </div>

                {/* Raw mode footer */}
                {viewMode === 'raw' && (
                    <div className="flex items-center gap-2 px-3 py-1.5 border-t" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                        {rawEditError && <span className="text-xs text-red-400 flex-1">{rawEditError}</span>}
                        <div className="flex-1" />
                        <button
                            onClick={handleRawSave}
                            className="px-3 py-1 rounded text-xs font-semibold transition-colors bg-sky-600/20 hover:bg-sky-600/30 text-sky-300"
                        >
                            <SaveIcon className="w-3 h-3 inline mr-1" /> Apply Changes (Ctrl+S)
                        </button>
                    </div>
                )}
            </div>

            {/* ─── Right: Inspector panel ─── */}
            <div className="w-96 flex-shrink-0 flex flex-col overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                {/* Header */}
                <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                    <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Inspector</span>
                    {selectedPath.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--bg-primary)', color: TYPE_COLORS[getJsonType(selectedValue)] }}>
                            {getJsonType(selectedValue)}
                        </span>
                    )}
                </div>

                {selectedPath.length > 0 ? (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Path breadcrumb */}
                        <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                            <div className="flex items-center gap-1 flex-wrap">
                                <button
                                    onClick={() => setSelectedPath([])}
                                    className="text-[10px] px-1 py-0.5 rounded hover:bg-white/10"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    root
                                </button>
                                {selectedPath.map((segment, i) => (
                                    <React.Fragment key={i}>
                                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>›</span>
                                        <button
                                            onClick={() => setSelectedPath(selectedPath.slice(0, i + 1))}
                                            className={`text-[10px] px-1 py-0.5 rounded hover:bg-white/10 ${
                                                i === selectedPath.length - 1 ? 'font-bold' : ''
                                            }`}
                                            style={{ color: i === selectedPath.length - 1 ? 'var(--text-primary)' : 'var(--text-muted)' }}
                                        >
                                            {SECTION_LABELS[segment] || segment}
                                        </button>
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 px-3 py-1.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                            <button
                                onClick={handleCopyPath}
                                className="px-2 py-0.5 rounded text-[10px] transition-colors"
                                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                                title="Copy path"
                            >
                                Copy Path
                            </button>
                            <button
                                onClick={handleCopyValue}
                                className="px-2 py-0.5 rounded text-[10px] transition-colors"
                                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                                title="Copy value as JSON"
                            >
                                Copy Value
                            </button>
                            {!isEditing && (
                                <button
                                    onClick={handleStartEdit}
                                    className="px-2 py-0.5 rounded text-[10px] transition-colors bg-sky-600/20 hover:bg-sky-600/30 text-sky-300"
                                    title="Edit value"
                                >
                                    <PencilIcon className="w-3 h-3 inline mr-0.5" /> Edit
                                </button>
                            )}
                        </div>

                        {/* Value display / editor */}
                        <div className="flex-1 overflow-auto min-h-0">
                            {isEditing ? (
                                <div className="flex flex-col h-full">
                                    <textarea
                                        ref={textareaRef}
                                        value={editValue}
                                        onChange={e => { setEditValue(e.target.value); setEditError(null); }}
                                        spellCheck={false}
                                        className="flex-1 resize-none p-3 text-xs leading-5 outline-none font-mono"
                                        style={{ background: '#0d1117', color: '#c9d1d9', tabSize: 2, caretColor: '#58a6ff' }}
                                    />
                                    {editError && (
                                        <div className="px-3 py-1 text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>
                                            {editError}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                                        <button
                                            onClick={handleSaveEdit}
                                            className="px-3 py-1 rounded text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 transition-colors"
                                        >
                                            Save (Ctrl+S)
                                        </button>
                                        <button
                                            onClick={handleCancelEdit}
                                            className="px-3 py-1 rounded text-xs transition-colors"
                                            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <pre
                                    className="p-3 text-xs leading-5 font-mono overflow-auto whitespace-pre-wrap"
                                    style={{ color: '#c9d1d9', background: '#0d1117', minHeight: '100%' }}
                                >
                                    {JSON.stringify(selectedValue, safeJsonReplacer, 2)}
                                </pre>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center px-6">
                            <CodeBracketIcon className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                            <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Project Data Inspector</h3>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                Select any node in the tree to inspect and edit its JSON value.
                                Use the <strong>Raw JSON</strong> view to see and edit the full project file.
                            </p>
                            <div className="mt-3 p-2 rounded text-left text-[10px] font-mono" style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
                                <p>Project size: {stats.size} KB</p>
                                <p>Scenes: {stats.scenes}</p>
                                <p>Characters: {stats.characters}</p>
                                <p>Variables: {stats.variables}</p>
                                <p>Common Events: {stats.commonEvents}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Status bar */}
                {statusMessage && (
                    <div className="px-3 py-1 text-xs text-emerald-400 border-t" style={{ borderColor: 'var(--border-subtle)', background: 'rgba(16,185,129,0.1)' }}>
                        {statusMessage}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ScriptingEditor;
