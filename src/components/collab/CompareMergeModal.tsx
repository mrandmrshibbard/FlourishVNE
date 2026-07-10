/**
 * CompareMergeModal — collaborative-authoring "Compare & Merge" (see COLLAB_MERGE_PLAN.md).
 * Open your current project beside a collaborator's exported .flourish and see exactly where
 * they diverge — per ENTITY, shown the friendly way (never raw JSON).
 *  • Phase 1: read-only side-by-side diff.
 *  • Phase 2: selectively IMPORT entities that are NEW in theirs (+ their dependency closure)
 *    into your project — additive only, one undoable step.
 */
import React, { useMemo, useRef, useState } from 'react';
import { VNProject } from '../../types/project';
import { importProject } from '../../utils/projectPackager';
import { diffProjects, sharesAncestry, DiffCategory, DiffEntry, DiffStatus } from '../../utils/projectDiff';
import { computeImportPlan, applyImport, ImportPlan, EntityRef } from '../../utils/projectMerge';
import { useProject } from '../../contexts/ProjectContext';
import { useToast } from '../../contexts/ToastContext';
import { XMarkIcon } from '../icons';

const STATUS_META: Record<DiffStatus, { label: string; color: string; bg: string }> = {
    changed:   { label: 'Changed',    color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
    new:       { label: 'New',        color: '#34d399', bg: 'rgba(52,211,153,0.15)' },
    yoursOnly: { label: 'Yours only', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
    identical: { label: 'Same',       color: '#64748b', bg: 'transparent' },
};

const prettyType = (t: string) => (t || '').replace(/([A-Z])/g, ' $1').trim();
const isImageUrl = (v: any) => typeof v === 'string' && (v.startsWith('data:image') || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(v) || v.startsWith('http'));

/** One command rendered as a friendly one-liner (no JSON). */
function commandLabel(cmd: any): string {
    if (!cmd || typeof cmd !== 'object') return String(cmd);
    const t = prettyType(cmd.type || 'Command');
    if (typeof cmd.text === 'string' && cmd.text.trim()) {
        const snip = cmd.text.replace(/\s+/g, ' ').trim().slice(0, 40);
        return `${t}: "${snip}${cmd.text.length > 40 ? '…' : ''}"`;
    }
    if (cmd.targetSceneId) return `${t} → scene`;
    return t;
}

/** A stable signature for a command, to highlight which rows differ between the two sides. */
function sig(cmd: any): string {
    try { return JSON.stringify(cmd); } catch { return String(cmd); }
}

const Thumb: React.FC<{ url?: string }> = ({ url }) =>
    url && isImageUrl(url)
        ? <img src={url} alt="" className="w-full h-32 object-contain rounded bg-black/30 border border-[var(--border-subtle)]" />
        : <div className="w-full h-32 rounded bg-black/20 border border-[var(--border-subtle)] flex items-center justify-center text-3xl opacity-50">🗎</div>;

/** Friendly field table for entities without a bespoke view — primitives only, no JSON, no data blobs. */
const FieldTable: React.FC<{ entity: any }> = ({ entity }) => {
    if (!entity || typeof entity !== 'object') return <div className="text-xs text-[var(--text-muted)]">—</div>;
    const rows: Array<[string, string]> = [];
    let thumb: string | undefined;
    for (const [k, v] of Object.entries(entity)) {
        if (v == null) continue;
        if (typeof v === 'string') {
            if (isImageUrl(v)) { if (!thumb) thumb = v; continue; }
            if (v.startsWith('data:')) { rows.push([k, '[media]']); continue; }
            rows.push([k, v.length > 60 ? v.slice(0, 60) + '…' : v]);
        } else if (typeof v === 'number' || typeof v === 'boolean') {
            rows.push([k, String(v)]);
        } else if (Array.isArray(v)) {
            rows.push([k, `${v.length} item${v.length === 1 ? '' : 's'}`]);
        } else if (typeof v === 'object') {
            rows.push([k, `${Object.keys(v).length} field${Object.keys(v).length === 1 ? '' : 's'}`]);
        }
    }
    return (
        <div className="space-y-1.5">
            {thumb && <Thumb url={thumb} />}
            <div className="text-[11px]">
                {rows.map(([k, v]) => (
                    <div key={k} className="flex gap-2 py-0.5 border-b border-[var(--border-subtle)]/40">
                        <span className="text-[var(--text-muted)] min-w-[90px]">{prettyType(k)}</span>
                        <span className="text-[var(--text-secondary)] break-all">{v}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

/** Side-by-side command list with per-row "differs" highlight. */
const CommandList: React.FC<{ entity: any; otherEntity: any }> = ({ entity, otherEntity }) => {
    const cmds: any[] = Array.isArray(entity?.commands) ? entity.commands : [];
    const otherSigs = useMemo(() => new Set((otherEntity?.commands || []).map(sig)), [otherEntity]);
    if (!cmds.length) return <div className="text-xs text-[var(--text-muted)] italic">No commands</div>;
    return (
        <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">{cmds.length} command{cmds.length === 1 ? '' : 's'}</div>
            {cmds.map((c, i) => {
                const differs = otherEntity && !otherSigs.has(sig(c));
                return (
                    <div key={c.id || i} className="text-[11px] px-2 py-1 rounded flex items-center gap-2"
                        style={{ background: differs ? 'rgba(251,191,36,0.12)' : 'var(--bg-tertiary)', borderLeft: `2px solid ${differs ? '#fbbf24' : 'transparent'}` }}>
                        <span className="text-[var(--text-muted)] w-5 text-right">{i + 1}</span>
                        <span className="text-[var(--text-secondary)] truncate">{commandLabel(c)}</span>
                    </div>
                );
            })}
        </div>
    );
};

/** Pick the right friendly renderer for one side of an entity. */
const EntityDetail: React.FC<{ kind: string; entity: any; other: any }> = ({ kind, entity, other }) => {
    if (!entity) return <div className="text-xs text-[var(--text-muted)] italic">(not in this project)</div>;
    switch (kind) {
        case 'imageAsset':
            return <Thumb url={entity.imageUrl} />;
        case 'audioAsset':
            return <div className="text-sm text-[var(--text-secondary)] flex items-center gap-2"><span className="text-2xl">🔊</span>{entity.name || 'audio'}</div>;
        case 'videoAsset':
            return <div className="text-sm text-[var(--text-secondary)] flex items-center gap-2"><span className="text-2xl">🎬</span>{entity.name || 'video'}</div>;
        case 'character':
            return (
                <div className="space-y-2">
                    <Thumb url={entity.baseImageUrl || (Object.values(entity.expressions || {})[0] as any)?.imageUrl} />
                    <div className="text-[11px] space-y-0.5">
                        <div className="flex items-center gap-2"><span className="text-[var(--text-muted)]">Color</span><span className="w-4 h-4 rounded" style={{ background: entity.color || '#fff' }} />{entity.color}</div>
                        <div><span className="text-[var(--text-muted)]">Expressions: </span>{Object.keys(entity.expressions || {}).length}</div>
                        <div><span className="text-[var(--text-muted)]">Layers: </span>{Object.keys(entity.layers || {}).length}</div>
                    </div>
                </div>
            );
        case 'variable':
            return (
                <div className="text-[11px] space-y-1">
                    {['type', 'scope', 'defaultValue', 'min', 'max'].map(f => entity[f] !== undefined && (
                        <div key={f} className="flex gap-2"><span className="text-[var(--text-muted)] min-w-[80px]">{prettyType(f)}</span><span className="text-[var(--text-secondary)]">{String(entity[f])}</span></div>
                    ))}
                </div>
            );
        case 'screen':
            return (
                <div className="text-[11px] space-y-1">
                    <div><span className="text-[var(--text-muted)]">Elements: </span>{Array.isArray(entity.elements) ? entity.elements.length : 0}</div>
                    {entity.screenType && <div><span className="text-[var(--text-muted)]">Type: </span>{entity.screenType}</div>}
                </div>
            );
        case 'scene':
        case 'commonEvent':
            return <CommandList entity={entity} otherEntity={other} />;
        default:
            return <FieldTable entity={entity} />;
    }
};

export const CompareMergeModal: React.FC<{ project: VNProject; onClose: () => void }> = ({ project, onClose }) => {
    const { dispatch } = useProject();
    const toast = useToast();
    const fileRef = useRef<HTMLInputElement>(null);
    const [theirName, setTheirName] = useState('');
    const [theirProject, setTheirProject] = useState<VNProject | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [catKey, setCatKey] = useState<string | null>(null);
    const [entryId, setEntryId] = useState<string | null>(null);
    const [showIdentical, setShowIdentical] = useState(false);
    // Phase 2 import state — selection keyed "categoryKey:id"; a pending plan awaiting confirm.
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [pending, setPending] = useState<ImportPlan | null>(null);

    // Diff is derived so it auto-refreshes after an import updates `project`.
    const diff = useMemo(() => (theirProject ? diffProjects(project, theirProject) : null), [project, theirProject]);

    const pick = () => fileRef.current?.click();

    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true); setError(''); setTheirProject(null); setCatKey(null); setEntryId(null); setSelected(new Set()); setPending(null);
        try {
            const { project: theirs } = await importProject(file);
            const d = diffProjects(project, theirs);
            setTheirProject(theirs);
            setTheirName(file.name);
            const firstWithChanges = d.categories.find(c => c.counts.new + c.counts.changed > 0) || d.categories[0];
            setCatKey(firstWithChanges?.key ?? null);
        } catch (err: any) {
            setError(`Couldn't read that .flourish file: ${err?.message || 'unknown error'}`);
        } finally {
            setLoading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const cat: DiffCategory | undefined = diff?.categories.find(c => c.key === catKey);
    const visibleEntries = useMemo(
        () => (cat?.entries || []).filter(e => showIdentical || e.status !== 'identical'),
        [cat, showIdentical]
    );
    const entry: DiffEntry | undefined = visibleEntries.find(e => e.id === entryId) || visibleEntries[0];

    const selKey = (catKey: string, id: string) => `${catKey}:${id}`;
    const toggleSelect = (catK: string, id: string) => setSelected(prev => {
        const next = new Set(prev); const k = selKey(catK, id);
        next.has(k) ? next.delete(k) : next.add(k);
        return next;
    });
    const selectAllNewInCat = (c: DiffCategory) => setSelected(prev => {
        const next = new Set(prev);
        const news = c.entries.filter(e => e.status === 'new');
        const allOn = news.every(e => next.has(selKey(c.key, e.id)));
        news.forEach(e => allOn ? next.delete(selKey(c.key, e.id)) : next.add(selKey(c.key, e.id)));
        return next;
    });

    // Build the import plan (selection + dependency closure) and show the confirm panel.
    const reviewImport = () => {
        if (!theirProject || selected.size === 0) return;
        const refs: EntityRef[] = Array.from(selected).map((k: string) => { const i = k.indexOf(':'); return { category: k.slice(0, i), id: k.slice(i + 1) }; });
        setPending(computeImportPlan(project, theirProject, refs));
    };

    const applyPlan = () => {
        if (!theirProject || !pending) return;
        const merged = applyImport(project, theirProject, pending.toImport);
        dispatch({ type: 'SET_PROJECT', payload: merged });
        toast.success(`Brought ${pending.toImport.length} item${pending.toImport.length === 1 ? '' : 's'} into your project.`);
        setSelected(new Set());
        setPending(null);
        // `diff` recomputes automatically once `project` updates (imported items become “Same”).
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)]">
                    <div>
                        <h2 className="text-base font-bold text-[var(--text-primary)]">Compare &amp; Merge</h2>
                        <p className="text-[11px] text-[var(--text-muted)]">See what differs between your project and a collaborator's, then pick what to import. Every import is a single undoable step (Ctrl+Z).</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]"><XMarkIcon className="w-5 h-5" /></button>
                </div>

                {!diff ? (
                    /* Pick screen */
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
                        <div className="text-5xl">🤝</div>
                        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Compare with a friend's project</h3>
                        <p className="text-sm text-[var(--text-secondary)] max-w-md">
                            Choose your collaborator's exported <span className="font-mono text-[var(--accent-cyan)]">.flourish</span> file. Flourish will show, scene by scene and character by character, what they've added or changed — so you can plan what to bring into <span className="font-semibold">{project.title || 'your project'}</span>.
                        </p>
                        <p className="text-xs text-[var(--text-muted)] max-w-md">
                            Tip: comparisons work best when you both started from the <em>same</em> shared project. Separately-made projects will simply show everything as “New”.
                        </p>
                        {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">{error}</div>}
                        <button onClick={pick} disabled={loading}
                            className="btn-primary-gradient text-white font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50">
                            {loading ? 'Reading…' : "Choose a .flourish file…"}
                        </button>
                        <input ref={fileRef} type="file" accept=".flourish,.zip" onChange={onFile} className="hidden" />
                    </div>
                ) : (
                    <>
                        {/* Summary bar */}
                        <div className="px-5 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-4 flex-wrap">
                            <span className="text-xs text-[var(--text-muted)]">Comparing <span className="text-[var(--text-secondary)] font-medium">{theirName}</span> → <span className="text-[var(--text-secondary)] font-medium">{project.title || 'your project'}</span></span>
                            <div className="flex items-center gap-2 text-[11px]">
                                <span style={{ color: STATUS_META.changed.color }}>● {diff.totals.changed} changed</span>
                                <span style={{ color: STATUS_META.new.color }}>● {diff.totals.new} new</span>
                                <span style={{ color: STATUS_META.yoursOnly.color }}>● {diff.totals.yoursOnly} yours-only</span>
                                <span style={{ color: STATUS_META.identical.color }}>● {diff.totals.identical} same</span>
                            </div>
                            <label className="ml-auto text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={showIdentical} onChange={e => setShowIdentical(e.target.checked)} /> show identical
                            </label>
                            <button onClick={pick} className="text-[11px] text-[var(--accent-cyan)] hover:underline">change file</button>
                            <input ref={fileRef} type="file" accept=".flourish,.zip" onChange={onFile} className="hidden" />
                        </div>

                        {!sharesAncestry(diff) && (
                            <div className="px-5 py-2 text-[11px] text-amber-300 bg-amber-500/10 border-b border-amber-500/20">
                                ⚠ These two projects don't share any items — they were started separately, so everything shows as “New”. Merging works best from a shared project.
                            </div>
                        )}

                        {/* 3-pane body */}
                        <div className="flex-1 flex min-h-0">
                            {/* Categories */}
                            <div className="w-48 border-r border-[var(--border-subtle)] overflow-y-auto py-2 flex-shrink-0">
                                {diff.categories.map(c => {
                                    const active = c.key === catKey;
                                    const changes = c.counts.new + c.counts.changed;
                                    return (
                                        <button key={c.key} onClick={() => { setCatKey(c.key); setEntryId(null); }}
                                            className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between ${active ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'}`}>
                                            <span>{c.label}</span>
                                            {changes > 0
                                                ? <span className="text-[10px] px-1.5 rounded-full" style={{ background: STATUS_META.changed.bg, color: STATUS_META.changed.color }}>{changes}</span>
                                                : <span className="text-[10px] text-[var(--text-muted)]">{c.entries.length}</span>}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Entries */}
                            <div className="w-64 border-r border-[var(--border-subtle)] overflow-y-auto py-1 flex-shrink-0">
                                {cat && cat.counts.new > 0 && (
                                    <button onClick={() => selectAllNewInCat(cat)}
                                        className="w-full text-left px-3 py-1 text-[10px] text-[var(--accent-mint)] hover:underline border-b border-[var(--border-subtle)]/40 mb-0.5">
                                        ☑ Select all new in {cat.label}
                                    </button>
                                )}
                                {visibleEntries.length === 0
                                    ? <div className="px-3 py-3 text-[11px] text-[var(--text-muted)] italic">No differences here{cat && cat.counts.identical > 0 ? ' (everything identical)' : ''}.</div>
                                    : visibleEntries.map(e => {
                                        const m = STATUS_META[e.status];
                                        const active = entry?.id === e.id;
                                        const isSelectable = e.status === 'new' || e.status === 'changed';
                                        const checked = !!cat && selected.has(selKey(cat.key, e.id));
                                        return (
                                            <div key={e.id}
                                                className={`w-full px-3 py-1.5 flex items-center gap-2 cursor-pointer ${active ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-tertiary)]'}`}
                                                onClick={() => setEntryId(e.id)}>
                                                {isSelectable
                                                    ? <input type="checkbox" checked={checked} onClick={ev => ev.stopPropagation()} onChange={() => cat && toggleSelect(cat.key, e.id)} className="flex-shrink-0" title={e.status === 'new' ? 'Import this into your project' : "Replace your version with theirs"} />
                                                    : <span className="w-3.5 flex-shrink-0" />}
                                                <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}40` }}>{m.label}</span>
                                                <span className="text-xs text-[var(--text-secondary)] truncate">{e.name}</span>
                                            </div>
                                        );
                                    })}
                            </div>

                            {/* Detail: side by side */}
                            <div className="flex-1 overflow-y-auto p-4 min-w-0">
                                {entry ? (
                                    <>
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-sm font-semibold text-[var(--text-primary)]">{entry.name}</span>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: STATUS_META[entry.status].bg, color: STATUS_META[entry.status].color }}>{STATUS_META[entry.status].label}</span>
                                            {cat && (entry.status === 'new' || entry.status === 'changed') && (() => {
                                                const on = selected.has(selKey(cat.key, entry.id));
                                                const takeLabel = entry.status === 'new' ? 'Import this' : 'Use their version';
                                                return (
                                                    <button onClick={() => toggleSelect(cat.key, entry.id)}
                                                        className={`ml-auto text-[11px] px-2.5 py-1 rounded-lg font-medium ${on ? 'bg-[var(--accent-mint)]/20 text-[var(--accent-mint)] border border-[var(--accent-mint)]/40' : 'border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>
                                                        {on ? `✓ ${entry.status === 'new' ? 'Will import' : 'Taking theirs'} — keep mine?` : takeLabel}
                                                    </button>
                                                );
                                            })()}
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wide text-[var(--accent-cyan)] mb-2">Their version ({theirName})</div>
                                                <EntityDetail kind={cat!.kind} entity={entry.theirs} other={entry.yours} />
                                            </div>
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-2">Your version</div>
                                                <EntityDetail kind={cat!.kind} entity={entry.yours} other={entry.theirs} />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-sm text-[var(--text-muted)] flex items-center justify-center h-full">Select an item to see the side-by-side comparison.</div>
                                )}
                            </div>
                        </div>

                        {/* Import action bar */}
                        <div className="px-5 py-2.5 border-t border-[var(--border-subtle)] flex items-center gap-3">
                            <span className="text-[11px] text-[var(--text-muted)]">
                                Tick <span style={{ color: STATUS_META.new.color }}>New</span> items to add, or <span style={{ color: STATUS_META.changed.color }}>Changed</span> items to take their version. {selected.size > 0 ? <b className="text-[var(--text-secondary)]">{selected.size} selected</b> : 'Your versions stay unless you pick theirs.'}
                            </span>
                            <button onClick={reviewImport} disabled={selected.size === 0}
                                className="ml-auto btn-primary-gradient text-white font-semibold px-4 py-1.5 rounded-lg text-xs disabled:opacity-40">
                                Review import{selected.size > 0 ? ` (${selected.size})` : ''}
                            </button>
                        </div>
                    </>
                )}

                {/* Confirm import panel */}
                {pending && (
                    <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center p-6" onClick={() => setPending(null)}>
                        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="px-5 py-3 border-b border-[var(--border-subtle)]">
                                {(() => {
                                    const adds = pending.toImport.filter(i => i.mode === 'add').length;
                                    const repl = pending.toImport.filter(i => i.mode === 'replace').length;
                                    return <h3 className="text-sm font-bold text-[var(--text-primary)]">Bring {pending.toImport.length} item{pending.toImport.length === 1 ? '' : 's'} into “{project.title || 'your project'}” <span className="font-normal text-[11px] text-[var(--text-muted)]">({adds} added{repl ? `, ${repl} replaced` : ''})</span></h3>;
                                })()}
                                <p className="text-[11px] text-[var(--text-muted)]">Nothing is deleted. <span style={{ color: STATUS_META.changed.color }}>Replaced</span> items overwrite your version with theirs. You can undo the whole thing with Ctrl+Z.</p>
                            </div>
                            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
                                {pending.toImport.map(it => (
                                    <div key={it.id} className="text-xs flex items-center gap-2">
                                        {it.mode === 'replace'
                                            ? <span style={{ color: STATUS_META.changed.color }} title="Overwrites your version">⟳</span>
                                            : <span style={{ color: STATUS_META.new.color }} title="Added (new to your project)">＋</span>}
                                        <span className="text-[var(--text-secondary)]">{it.name}</span>
                                        {it.mode === 'replace' && <span className="text-[10px]" style={{ color: STATUS_META.changed.color }}>replaces yours</span>}
                                        {it.pulledIn && <span className="text-[10px] text-[var(--accent-cyan)]" title="Pulled in because a selected item needs it">needed dependency</span>}
                                    </div>
                                ))}
                                {pending.broken.length > 0 && (
                                    <div className="mt-3 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
                                        ⚠ {pending.broken.length} reference{pending.broken.length === 1 ? '' : 's'} point to items that aren't in either project (they may have been deleted). The import will proceed, but those links may be empty:
                                        <div className="mt-1 opacity-80">{pending.broken.slice(0, 6).map(b => `${b.fromName} → ${b.refId}`).join('; ')}{pending.broken.length > 6 ? '…' : ''}</div>
                                    </div>
                                )}
                            </div>
                            <div className="px-5 py-3 border-t border-[var(--border-subtle)] flex justify-end gap-2">
                                <button onClick={() => setPending(null)} className="px-4 py-1.5 rounded-lg text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">Cancel</button>
                                <button onClick={applyPlan} className="btn-primary-gradient text-white font-semibold px-4 py-1.5 rounded-lg text-xs">Add to my project</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CompareMergeModal;
