/**
 * ExtensionDatabaseManager — the UI for custom DATABASE CATEGORIES contributed by extensions (Phase C3).
 *
 * An extension calls `api.registerDatabaseCategory({ id, name, fields })`; this modal then generates a
 * record list + an add/edit form from those `fields` — no UI code needed from the extension author.
 * Records are stored per-category in the extension's project-scoped storage (so they save/load with the
 * project) and are readable at runtime via `api.getRecords(categoryId)`.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { useExtensionDatabaseCategories } from './ExtensionPanelsHost';
import { EXT_DB_STORAGE_PREFIX } from '../features/plugins/PluginManagerService';
import type { EditorDatabaseCategory, ExtensionFieldSpec, ExtensionRecord } from '../types/plugins';

const genId = () => 'rec-' + Math.random().toString(36).slice(2, 9);

const ExtensionDatabaseManager: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { project, dispatch } = useProject();
    const cats = useExtensionDatabaseCategories();

    const [selectedCatId, setSelectedCatId] = useState<string | null>(cats[0]?.category.id ?? null);
    const selected = useMemo(() => cats.find(c => c.category.id === selectedCatId) || cats[0] || null, [cats, selectedCatId]);

    const storageKey = selected ? `${EXT_DB_STORAGE_PREFIX}${selected.category.id}` : '';
    const readRecords = (): ExtensionRecord[] => {
        if (!selected) return [];
        const recs = (project.pluginStorage as any)?.[selected.pluginId]?.[storageKey];
        return Array.isArray(recs) ? recs : [];
    };

    const [records, setRecords] = useState<ExtensionRecord[]>(readRecords);
    const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
    const saveTimer = useRef<number | null>(null);

    // Reload records when the chosen category changes.
    useEffect(() => {
        setRecords(readRecords());
        setSelectedRecordId(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCatId, selected?.pluginId]);

    // Debounced persist (avoids a dispatch per keystroke / undo-history spam).
    const persist = (next: ExtensionRecord[]) => {
        if (!selected) return;
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
            dispatch({ type: 'SET_PLUGIN_STORAGE', payload: { pluginId: selected.pluginId, key: storageKey, value: next } });
        }, 400);
    };
    useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);

    const commit = (next: ExtensionRecord[]) => { setRecords(next); persist(next); };

    const fields: ExtensionFieldSpec[] = selected?.category.fields || [];
    const titleField = selected?.category.titleField || fields.find(f => f.type === 'text')?.key || 'name';
    const recordTitle = (r: ExtensionRecord) => {
        const v = r[titleField];
        return (v !== undefined && v !== null && String(v).trim()) ? String(v) : '(untitled)';
    };

    const addRecord = () => {
        if (!selected) return;
        const rec: ExtensionRecord = { id: genId() };
        fields.forEach(f => { rec[f.key] = f.default ?? (f.type === 'boolean' ? false : f.type === 'number' ? 0 : ''); });
        const next = [...records, rec];
        commit(next);
        setSelectedRecordId(rec.id);
    };
    const deleteRecord = (id: string) => {
        const next = records.filter(r => r.id !== id);
        commit(next);
        if (selectedRecordId === id) setSelectedRecordId(null);
    };
    const setFieldValue = (recId: string, key: string, value: any) => {
        commit(records.map(r => (r.id === recId ? { ...r, [key]: value } : r)));
    };

    // Asset options (images + backgrounds) for `asset` fields.
    const assetOptions = useMemo(() => {
        const opts: Array<{ label: string; value: string }> = [{ label: '— none —', value: '' }];
        const add = (coll: Record<string, any> | undefined, tag: string) => {
            Object.entries(coll || {}).forEach(([id, a]: [string, any]) => opts.push({ label: `${a?.name || id} (${tag})`, value: id }));
        };
        add(project.images as any, 'image');
        add(project.backgrounds as any, 'bg');
        return opts;
    }, [project.images, project.backgrounds]);

    const editing = selectedRecordId ? records.find(r => r.id === selectedRecordId) : null;

    const inputBase = 'w-full bg-[var(--bg-primary)] text-[var(--text-primary)] px-2 py-1 rounded border border-[var(--border-subtle)] text-xs outline-none';

    const renderField = (f: ExtensionFieldSpec) => {
        const val = editing ? editing[f.key] : '';
        const set = (v: any) => editing && setFieldValue(editing.id, f.key, v);
        switch (f.type) {
            case 'textarea':
                return <textarea value={String(val ?? '')} placeholder={f.placeholder} onChange={e => set(e.target.value)} className={inputBase} style={{ minHeight: 70, resize: 'vertical' }} />;
            case 'number':
                return <input type="number" value={Number(val ?? 0)} placeholder={f.placeholder} onChange={e => set(parseFloat(e.target.value) || 0)} className={inputBase} />;
            case 'boolean':
                return <input type="checkbox" checked={!!val} onChange={e => set(e.target.checked)} />;
            case 'select':
                return <select value={String(val ?? '')} onChange={e => set(e.target.value)} className={inputBase}>{(f.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
            case 'color':
                return <input type="color" value={String(val || '#ffffff')} onChange={e => set(e.target.value)} className="w-10 h-7 bg-transparent border border-[var(--border-subtle)] rounded cursor-pointer" />;
            case 'asset':
                return <select value={String(val ?? '')} onChange={e => set(e.target.value)} className={inputBase}>{assetOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
            default:
                return <input type="text" value={String(val ?? '')} placeholder={f.placeholder} onChange={e => set(e.target.value)} className={inputBase} />;
        }
    };

    return (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-[860px] max-w-[94vw] h-[600px] max-h-[90vh] rounded-xl border flex flex-col overflow-hidden"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>🗃️ Extension Data</span>
                    <div className="flex-1" />
                    <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm px-2">✕</button>
                </div>

                {cats.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
                        No extension databases. Enable an extension that adds one.
                    </div>
                ) : (
                    <>
                        {/* Category tabs */}
                        <div className="flex gap-1 px-3 pt-2 flex-wrap">
                            {cats.map(({ category }) => (
                                <button
                                    key={category.id}
                                    onClick={() => setSelectedCatId(category.id)}
                                    className={`text-xs px-3 py-1.5 rounded-t-lg ${selected?.category.id === category.id ? 'bg-[var(--bg-primary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                                >
                                    {category.icon ? category.icon + ' ' : ''}{category.name}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 flex min-h-0 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                            {/* Record list */}
                            <div className="w-56 flex-shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--border-subtle)' }}>
                                <div className="flex-1 overflow-auto p-2">
                                    {records.length === 0 && <div className="text-xs p-2" style={{ color: 'var(--text-muted)' }}>No records yet.</div>}
                                    {records.map(r => (
                                        <div
                                            key={r.id}
                                            onClick={() => setSelectedRecordId(r.id)}
                                            className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer text-xs ${selectedRecordId === r.id ? 'bg-violet-500/20 text-violet-200' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}
                                        >
                                            <span className="flex-1 truncate">{recordTitle(r)}</span>
                                            <button onClick={e => { e.stopPropagation(); deleteRecord(r.id); }} className="text-[var(--text-muted)] hover:text-red-400">×</button>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={addRecord} className="m-2 py-1.5 rounded border border-dashed text-xs" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                                    + Add {selected?.category.recordLabel || 'Record'}
                                </button>
                            </div>

                            {/* Generated form */}
                            <div className="flex-1 overflow-auto p-4">
                                {!editing ? (
                                    <div className="h-full flex items-center justify-center text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                                        Select a {selected?.category.recordLabel?.toLowerCase() || 'record'} on the left, or add one.
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3 max-w-md">
                                        {fields.map(f => (
                                            <label key={f.key} className="block text-xs">
                                                <span className="block mb-1" style={{ color: 'var(--text-secondary)' }}>{f.label}</span>
                                                {renderField(f)}
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ExtensionDatabaseManager;
