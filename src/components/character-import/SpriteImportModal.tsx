/**
 * Bulk sprite importer — the review screen.
 *
 * Drop many PNGs (or a .psd / .ora) → we work out the layers, variants and expressions → the artist
 * REVIEWS and corrects → one click imports the lot in a single undoable step.
 *
 * Everything is pre-checked on purpose: the author is here to *review*, not to configure.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../contexts/ProjectContext';
import { useToast } from '../../contexts/ToastContext';
import { VNID } from '../../types';
import { VNCharacter, VNCharacterLayer, VNLayerAsset } from '../../features/character/types';
import { resolveFieldUrl } from '../../utils/assetStore';
import { readFilesSource } from '../../features/character/import/filesSource';
import { readOraSource } from '../../features/character/import/oraSource';
import { readPsdSource } from '../../features/character/import/psdSource';
import { groupSpriteNames, deriveExpressions, partLayerName, NameEntry } from '../../features/character/import/nameGrouping';
import { computeResizeTarget } from '../../features/character/import/raster';
import { runSpriteImport } from '../../features/character/import/commit';
import { ImportedDoc, ImportPlan, PlanLayer, PlanExpression, ImportWarning } from '../../features/character/import/types';
import LoadingOverlay from '../ui/LoadingOverlay';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    character: VNCharacter;
    /** Files handed straight from a drop, so the modal opens already parsing. */
    initialFiles?: File[] | null;
}

const SpriteImportModal: React.FC<Props> = ({ isOpen, onClose, character, initialFiles }) => {
    const { project, dispatch } = useProject();
    const toast = useToast();
    const { t } = useTranslation(['characters']);

    const [doc, setDoc] = useState<ImportedDoc | null>(null);
    const [layers, setLayers] = useState<PlanLayer[]>([]);
    const [expressions, setExpressions] = useState<PlanExpression[]>([]);
    const [resize, setResize] = useState(true);
    const [addToExisting, setAddToExisting] = useState(true);
    const [parsing, setParsing] = useState(false);
    const [busy, setBusy] = useState<{ done: number; total: number; name: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [thumbs, setThumbs] = useState<Record<string, string>>({});
    const [aspectWarning, setAspectWarning] = useState<ImportWarning | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const resizeTarget = useMemo(
        () => (doc ? computeResizeTarget(doc.width, doc.height, project.gameResolution) : null),
        [doc, project.gameResolution],
    );

    // ── parse ────────────────────────────────────────────────────────────────
    const parse = useCallback(async (files: File[]) => {
        setParsing(true); setError(null); setAspectWarning(null);
        try {
            const psd = files.find(f => /\.psd$/i.test(f.name));
            const ora = files.find(f => /\.ora$/i.test(f.name));
            // Paint the spinner before the (synchronous) PSD read blocks the thread.
            await new Promise(r => requestAnimationFrame(() => r(null)));

            const d = psd ? await readPsdSource(psd)
                : ora ? await readOraSource(ora)
                    : await readFilesSource(files);

            const entries: NameEntry[] = d.layers.map(l => ({
                key: l.key, name: l.name, groupPath: l.groupPath,
                sourceOrder: d.kind === 'files' ? undefined : l.order,
                visible: l.visible,
            }));
            // Visibility only MEANS something in a layered file — in a folder of loose PNGs every
            // file is "visible", so we'd wrongly call every group "parts" and split it apart.
            const planned = groupSpriteNames(entries, { useVisibility: d.kind !== 'files' });
            const derived = deriveExpressions(planned);

            setDoc(d);
            setLayers(planned.map(pl => ({
                name: pl.name,
                mode: pl.mode,
                ambiguous: pl.ambiguous,
                variants: pl.variants.map(v => ({ key: v.key, name: v.name, include: true })),
                // Object.values() yields `unknown` under this tsconfig — cast at every call site.
                existingLayerId: (Object.values(character.layers ?? {}) as VNCharacterLayer[])
                    .find(l => l.name.trim().toLowerCase() === pl.name.trim().toLowerCase())?.id,
            })));
            setExpressions(derived.map(e => ({ name: e.name, include: true, selection: e.selection })));

            // ASPECT GUARD: the engine fits each layer by its own aspect, so importing art of a
            // different shape than the character's existing sprites silently renders it wrong.
            const anyExisting = (Object.values(character.layers ?? {}) as VNCharacterLayer[])
                .flatMap(l => Object.values(l.assets) as VNLayerAsset[])
                .find(a => a.imageUrl);
            if (anyExisting?.imageUrl) {
                const url = resolveFieldUrl(project.id, anyExisting.imageUrl);
                if (url) {
                    const img = new Image();
                    await new Promise(res => { img.onload = res; img.onerror = res; img.src = url; });
                    if (img.naturalWidth && img.naturalHeight) {
                        const existAspect = img.naturalWidth / img.naturalHeight;
                        const newAspect = d.width / d.height;
                        if (Math.abs(newAspect - existAspect) / existAspect > 0.01) {
                            setAspectWarning({
                                code: 'aspect-mismatch', severity: 'error',
                                message: t('spriteImport.aspectMismatch',
                                    'This art is a different shape ({{nw}}×{{nh}}) from {{char}}\'s existing sprites ({{ew}}×{{eh}}). If you import it, the new layers will not line up on stage. Re-export it at the same shape.',
                                    { nw: d.width, nh: d.height, ew: img.naturalWidth, eh: img.naturalHeight, char: character.name }),
                            });
                        }
                    }
                }
            }
        } catch (e: any) {
            setError(e?.message || t('spriteImport.parseFailed', "We couldn't read that file."));
        } finally {
            setParsing(false);
        }
    }, [character, project.id, t]);

    useEffect(() => {
        if (isOpen && initialFiles?.length) parse(initialFiles);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, initialFiles]);

    // Lazily fetch thumbnails once the plan exists.
    useEffect(() => {
        if (!doc) return;
        let cancelled = false;
        (async () => {
            for (const l of doc.layers) {
                if (cancelled) return;
                try {
                    const url = await l.getThumbnail(96);
                    if (!cancelled) setThumbs(prev => ({ ...prev, [l.key]: url }));
                } catch { /* a thumbnail is a nicety, never fatal */ }
            }
        })();
        return () => { cancelled = true; };
    }, [doc]);

    useEffect(() => () => { doc?.dispose(); }, [doc]);

    const reset = () => { doc?.dispose(); setDoc(null); setLayers([]); setExpressions([]); setThumbs({}); setError(null); setAspectWarning(null); };
    const close = () => { reset(); onClose(); };

    // ── commit ───────────────────────────────────────────────────────────────
    const doImport = async () => {
        if (!doc) return;
        const ac = new AbortController();
        abortRef.current = ac;
        setBusy({ done: 0, total: 1, name: '' });
        try {
            const plan: ImportPlan = {
                doc, layers, expressions,
                resizeTo: resize ? resizeTarget : null,
                addLayersToExistingExpressions: addToExisting,
            };
            const before = { layers: character.layers, expressions: character.expressions };
            const result = await runSpriteImport(project, character, plan, {
                signal: ac.signal,
                onProgress: (done, total, name) => setBusy({ done, total, name }),
            });

            // ONE dispatch → ONE undo step.
            dispatch({
                type: 'UPDATE_CHARACTER',
                payload: { characterId: character.id, updates: { layers: result.layers, expressions: result.expressions } },
            } as any);

            toast.success(
                t('spriteImport.done', 'Imported {{layers}} layers and {{assets}} sprites into {{char}}.',
                    { layers: result.layerCount, assets: result.assetCount, char: character.name }),
                {
                    action: {
                        label: t('spriteImport.undo', 'Undo'),
                        onClick: () => dispatch({ type: 'UPDATE_CHARACTER', payload: { characterId: character.id, updates: before } } as any),
                    },
                },
            );
            close();
        } catch (e: any) {
            if (e?.name === 'AbortError') toast.info(t('spriteImport.cancelled', 'Import cancelled — nothing was changed.'));
            else { setError(e?.message || String(e)); toast.error(t('spriteImport.failed', 'The import failed. Nothing was changed.')); }
        } finally {
            setBusy(null);
            abortRef.current = null;
        }
    };

    if (!isOpen) return null;

    const allWarnings: ImportWarning[] = [
        ...(aspectWarning ? [aspectWarning] : []),
        ...(doc?.warnings ?? []),
        ...(doc?.layers ?? []).flatMap(l => l.warnings),
    ];
    const blocking = allWarnings.some(w => w.severity === 'error');
    const totalVariants = layers.reduce((n, l) => n + l.variants.filter(v => v.include).length, 0);

    const setLayerName = (i: number, name: string) =>
        setLayers(prev => prev.map((l, j) => (j === i ? { ...l, name } : l)));
    const toggleVariant = (li: number, vi: number) =>
        setLayers(prev => prev.map((l, j) => j !== li ? l
            : { ...l, variants: l.variants.map((v, k) => (k === vi ? { ...v, include: !v.include } : v)) }));
    const move = (i: number, dir: -1 | 1) => setLayers(prev => {
        const next = [...prev];
        const j = i + dir;
        if (j < 0 || j >= next.length) return prev;
        [next[i], next[j]] = [next[j], next[i]];
        return next;
    });
    const setMode = (i: number, mode: 'variants' | 'parts') =>
        setLayers(prev => prev.map((l, j) => (j === i ? { ...l, mode } : l)));

    /** Pull ONE image out of its group into a layer of its own (the manual escape hatch). */
    const splitOut = (li: number, vi: number) => setLayers(prev => {
        const src = prev[li];
        if (src.variants.length < 2) return prev;         // it's already alone
        const v = src.variants[vi];
        const next = [...prev];
        next[li] = { ...src, variants: src.variants.filter((_, k) => k !== vi) };
        // A single-image layer is a "part" by definition — it always shows.
        next.splice(li + 1, 0, { name: partLayerName(src.name, v.name), mode: 'parts', variants: [v] });
        return next;
    });

    /** How many character layers this plan will actually produce (parts expand to one each). */
    const resultingLayerCount = layers.reduce((n, l) => {
        const inc = l.variants.filter(v => v.include).length;
        if (!inc) return n;
        return n + (l.mode === 'parts' ? inc : 1);
    }, 0);

    return createPortal(
        <div className="fixed inset-0 z-[100000] bg-black/70 flex items-center justify-center p-4" onClick={close}>
            <div className="rounded-xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
                onClick={e => e.stopPropagation()}>

                <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div>
                        <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                            {t('spriteImport.title', 'Import sprites into {{char}}', { char: character.name })}
                        </h2>
                        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            {doc
                                ? t('spriteImport.found', "We looked at your art and found {{layers}} layers. Check it over, then import.", { layers: layers.length })
                                : t('spriteImport.hint', 'Drop your layer PNGs, or a Photoshop (.psd) / Krita (.ora) file.')}
                        </p>
                    </div>
                    <button onClick={close} style={{ color: 'var(--text-muted)' }}>✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                    {parsing && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('spriteImport.reading', 'Reading your art…')}</p>}
                    {error && <div className="text-xs p-2 rounded" style={{ background: 'color-mix(in srgb, var(--accent-coral) 18%, transparent)', color: 'var(--accent-coral)' }}>{error}</div>}

                    {allWarnings.map((w, i) => (
                        <div key={i} className="text-[11px] p-2 rounded" style={{
                            background: `color-mix(in srgb, ${w.severity === 'error' ? 'var(--accent-coral)' : 'var(--accent-peach)'} 15%, transparent)`,
                            color: w.severity === 'error' ? 'var(--accent-coral)' : 'var(--accent-peach)',
                        }}>
                            {w.severity === 'error' ? '⛔ ' : '⚠ '}{w.message}
                        </div>
                    ))}

                    {doc && layers.map((l, li) => (
                        <div key={li} className="rounded-lg p-2" style={{ background: 'var(--bg-tertiary)', border: `1px solid ${l.ambiguous ? 'var(--accent-peach)' : 'var(--border-subtle)'}` }}>
                            <div className="flex items-center gap-2 mb-1.5">
                                <div className="flex flex-col">
                                    <button onClick={() => move(li, -1)} disabled={li === 0} className="text-[9px] leading-none disabled:opacity-25" style={{ color: 'var(--text-muted)' }} title={t('spriteImport.moveBack', 'Move further back')}>▲</button>
                                    <button onClick={() => move(li, 1)} disabled={li === layers.length - 1} className="text-[9px] leading-none disabled:opacity-25" style={{ color: 'var(--text-muted)' }} title={t('spriteImport.moveFront', 'Move further front')}>▼</button>
                                </div>
                                <input value={l.name} onChange={e => setLayerName(li, e.target.value)}
                                    className="text-xs font-semibold bg-transparent border-b outline-none px-1 flex-1"
                                    style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }} />
                                {l.existingLayerId && l.mode === 'variants' && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent-mint) 20%, transparent)', color: 'var(--accent-mint)' }}>
                                        {t('spriteImport.mergesInto', 'adds to your existing layer')}
                                    </span>
                                )}

                                {/* ALTERNATIVES vs PARTS — the difference between an eye you can wear
                                    and an eye where you must pick one third of it. */}
                                {l.variants.length > 1 && (
                                    <div className="flex rounded-md overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border-subtle)' }}>
                                        {([['variants', t('spriteImport.modeAlternatives', 'Pick one')], ['parts', t('spriteImport.modeParts', 'Stack all')]] as const).map(([m, label]) => (
                                            <button key={m} onClick={() => setMode(li, m)}
                                                title={m === 'variants'
                                                    ? t('spriteImport.modeAlternativesHint', 'These are alternatives — the character shows ONE of them at a time (e.g. happy eyes OR sad eyes).')
                                                    : t('spriteImport.modePartsHint', 'These are pieces that build one thing — they all show together (e.g. the whites, iris and pupil of an eye). Each becomes its own layer.')}
                                                className="text-[9px] px-1.5 py-0.5"
                                                style={{
                                                    background: l.mode === m ? 'var(--accent-lavender)' : 'transparent',
                                                    color: l.mode === m ? '#fff' : 'var(--text-muted)',
                                                }}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {l.mode === 'parts' && l.variants.length > 1 && (
                                <p className="text-[10px] mb-1.5" style={{ color: 'var(--accent-mint)' }}>
                                    {t('spriteImport.partsNote', 'These all show together — each becomes its own layer ({{names}}).',
                                        { names: l.variants.filter(v => v.include).map(v => partLayerName(l.name, v.name)).join(', ') })}
                                </p>
                            )}

                            {/* Tell the author what the choice below actually means, in their language. */}
                            {l.mode === 'variants' && l.variants.length > 1 && (
                                <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                                    {t('spriteImport.variantsNote', 'The character shows ONE of these at a time. If they are really pieces that stack together (like the whites, iris and pupil of an eye), switch to "Stack all" — or give a single image its own layer with "Own layer".')}
                                </p>
                            )}

                            <div className="flex flex-wrap gap-1.5">
                                {l.variants.map((v, vi) => (
                                    <div key={v.key} className="flex items-center rounded overflow-hidden"
                                        style={{
                                            background: v.include ? 'color-mix(in srgb, var(--accent-lavender) 18%, transparent)' : 'transparent',
                                            border: `1px solid ${v.include ? 'var(--accent-lavender)' : 'var(--border-subtle)'}`,
                                            opacity: v.include ? 1 : 0.5,
                                        }}>
                                        <button onClick={() => toggleVariant(li, vi)}
                                            title={t('spriteImport.toggleHint', 'Include or skip this image')}
                                            className="flex items-center gap-1 px-1.5 py-1 text-[10px]"
                                            style={{ color: v.include ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                            {thumbs[v.key]
                                                ? <img src={thumbs[v.key]} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
                                                : <span style={{ width: 22, height: 22, display: 'inline-block' }} />}
                                            {v.name}
                                        </button>
                                        {l.variants.length > 1 && (
                                            <button onClick={() => splitOut(li, vi)}
                                                title={t('spriteImport.splitOutHint', 'Give this image its own layer, so it always shows instead of being one of the choices')}
                                                className="px-1.5 py-1 text-[10px] font-semibold whitespace-nowrap hover:brightness-125"
                                                style={{
                                                    color: 'var(--accent-mint)',
                                                    borderLeft: '1px solid var(--border-subtle)',
                                                    background: 'color-mix(in srgb, var(--accent-mint) 14%, transparent)',
                                                }}>
                                                ⤴ {t('spriteImport.splitOut', 'Own layer')}
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    {doc && expressions.length > 0 && (
                        <div className="rounded-lg p-2" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
                            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                                {t('spriteImport.expressions', 'Expressions we spotted')}
                            </p>
                            <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                                {t('spriteImport.expressionsHint', 'We matched up names across your layers — e.g. happy eyes + a happy mouth make a "Happy" expression.')}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {expressions.map((e, i) => (
                                    <button key={i} onClick={() => setExpressions(prev => prev.map((x, j) => (j === i ? { ...x, include: !x.include } : x)))}
                                        className="px-2 py-0.5 rounded-full text-[10px]"
                                        style={{
                                            background: e.include ? 'color-mix(in srgb, var(--accent-pink) 18%, transparent)' : 'transparent',
                                            border: `1px solid ${e.include ? 'var(--accent-pink)' : 'var(--border-subtle)'}`,
                                            color: e.include ? 'var(--accent-pink)' : 'var(--text-muted)',
                                        }}>
                                        {e.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {doc && (
                        <div className="space-y-1.5">
                            {resizeTarget && (
                                <label className="flex items-center gap-2 text-[11px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                                    <input type="checkbox" checked={resize} onChange={e => setResize(e.target.checked)} />
                                    {t('spriteImport.resize', 'Shrink to fit your game ({{fw}}×{{fh}} → {{tw}}×{{th}}) — keeps your project small',
                                        { fw: doc.width, fh: doc.height, tw: resizeTarget.width, th: resizeTarget.height })}
                                </label>
                            )}
                            {Object.keys(character.expressions ?? {}).length > 0 && (
                                <label className="flex items-center gap-2 text-[11px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                                    <input type="checkbox" checked={addToExisting} onChange={e => setAddToExisting(e.target.checked)} />
                                    {t('spriteImport.addToExisting', 'Add the new layers to expressions this character already has')}
                                </label>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-4 py-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {doc && t('spriteImport.summary', '{{layers}} layers · {{variants}} sprites · {{exprs}} expressions',
                            { layers: resultingLayerCount, variants: totalVariants, exprs: expressions.filter(e => e.include).length })}
                    </span>
                    <div className="flex gap-2">
                        <button onClick={close} className="px-3 py-1.5 rounded-md text-xs border"
                            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                            {t('common.cancel', 'Cancel')}
                        </button>
                        <button onClick={doImport} disabled={!doc || blocking || !totalVariants}
                            className="px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-40"
                            style={{ background: 'var(--accent-purple)', color: '#fff' }}>
                            {t('spriteImport.import', 'Import')}
                        </button>
                    </div>
                </div>
            </div>

            <LoadingOverlay
                isVisible={!!busy}
                message={t('spriteImport.importing', 'Importing your sprites…')}
                progress={busy ? (busy.done / Math.max(1, busy.total)) * 100 : 0}
                subMessage={busy?.name}
            />
        </div>,
        document.body,
    );
};

export default SpriteImportModal;
