import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../contexts/ProjectContext';
import { VNProject } from '../../types/project';
import { VNCharacter, VNCharacterExpression, VNCharacterLayer, VNCharacterPose, VNLayerAsset, VNLayerBox } from '../../features/character/types';
import { assetArtForPose } from '../../features/character/poseArt';
import { normalizeLayerBox, isFullBox } from '../../features/character/layout';
import { snapRect, SnapGuide, SnapRect } from '../../utils/canvasSnap';
import { resolveFieldUrl } from '../../utils/assetStore';

/**
 * The Pose Studio: arrange a character's layer pieces per pose — move / resize / rotate /
 * mirror each piece's box on a canvas, reorder front↔back, hide pieces per pose — with a
 * precision suite (zoom+pan, snapping, nudge keys, exact numbers).
 *
 * Architecture: SaveSlotDesigner pattern — a LOCAL draft of the layout, edited freely;
 * "Done" diffs the draft against the character and dispatches ONE APPLY_CHARACTER_LAYOUT
 * (one undo step); Cancel discards everything. All geometry is percent of the sprite box.
 */

const FULL: VNLayerBox = { x: 0, y: 0, width: 100, height: 100 };
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, isNaN(v) ? lo : v));
const cloneBox = (b: VNLayerBox): VNLayerBox => ({ ...b });
const boxesEqual = (a?: VNLayerBox | null, b?: VNLayerBox | null): boolean =>
    JSON.stringify(normalizeLayerBox(a || undefined) ?? null) === JSON.stringify(normalizeLayerBox(b || undefined) ?? null);

interface DraftAsset { box?: VNLayerBox; poseBoxes: Record<string, VNLayerBox>; }
interface DraftLayer { box?: VNLayerBox; poseBoxes: Record<string, VNLayerBox>; assets: Record<string, DraftAsset>; }
interface DraftPose { layerOrder: string[]; hiddenLayers: string[]; }
interface Draft {
    layers: Record<string, DraftLayer>;
    poses: Record<string, DraftPose>;
    baseOrder: string[];
}

const initDraft = (character: VNCharacter): Draft => {
    const layers: Record<string, DraftLayer> = {};
    for (const layer of Object.values(character.layers)) {
        const assets: Record<string, DraftAsset> = {};
        for (const asset of Object.values(layer.assets)) {
            assets[asset.id] = {
                box: asset.box ? cloneBox(asset.box) : undefined,
                poseBoxes: Object.fromEntries(Object.entries(asset.poseBoxes || {}).map(([k, v]) => [k, cloneBox(v)])),
            };
        }
        layers[layer.id] = {
            box: layer.box ? cloneBox(layer.box) : undefined,
            poseBoxes: Object.fromEntries(Object.entries(layer.poseBoxes || {}).map(([k, v]) => [k, cloneBox(v)])),
            assets,
        };
    }
    const baseOrder = Object.keys(character.layers);
    const poses: Record<string, DraftPose> = {};
    for (const pose of Object.values(character.poses || {}) as VNCharacterPose[]) {
        const listed = (pose.layerOrder || []).filter(id => id in character.layers);
        const order = listed.length ? [...listed, ...baseOrder.filter(id => !listed.includes(id))] : [...baseOrder];
        poses[pose.id] = { layerOrder: order, hiddenLayers: [...(pose.hiddenLayers || [])] };
    }
    return { layers, poses, baseOrder };
};

const PoseStudio: React.FC<{
    character: VNCharacter;
    project: VNProject;
    initialPoseId: string | null;
    onClose: () => void;
}> = ({ character, project, initialPoseId, onClose }) => {
    const { t } = useTranslation('characters');
    const { dispatch } = useProject();

    const [draft, setDraft] = useState<Draft>(() => initDraft(character));
    const [activePose, setActivePose] = useState<string | null>(initialPoseId && character.poses?.[initialPoseId] ? initialPoseId : null);
    const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
    const [pinToAsset, setPinToAsset] = useState(false);
    const [exprId, setExprId] = useState<string>(() => Object.keys(character.expressions)[0] || '');
    const [backdrop, setBackdrop] = useState<'checker' | 'dark' | 'light'>('checker');
    const [dimBase, setDimBase] = useState(false);
    const [showUnworn, setShowUnworn] = useState(true);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [keepShape, setKeepShape] = useState(true);
    const [guides, setGuides] = useState<SnapGuide[]>([]);

    const rootRef = useRef<HTMLDivElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const spaceHeld = useRef(false);
    const dragRef = useRef<{
        mode: 'move' | 'resize' | 'rotate' | 'pan';
        layerId?: string;
        edges?: string;
        startX: number; startY: number;
        orig?: VNLayerBox;
        origPan?: { x: number; y: number };
    } | null>(null);

    useEffect(() => { rootRef.current?.focus(); }, []);

    const expr = character.expressions[exprId] || Object.values(character.expressions)[0];
    const orderedIds = activePose ? (draft.poses[activePose]?.layerOrder || draft.baseOrder) : draft.baseOrder;
    const hiddenSet = new Set(activePose ? (draft.poses[activePose]?.hiddenLayers || []) : []);

    /** The asset previewed for a layer, and whether the previewed outfit actually WEARS it.
     *  Worn = the expression explicitly picks an asset. Unworn layers still preview their
     *  first piece so there is always art to arrange (without that the canvas showed only
     *  the locked base and dragging seemed to move an empty box) — but callers render them
     *  GHOSTED and the author can hide them, so they never read as part of the pose. */
    const previewedPiece = (layer: VNCharacterLayer): { asset: VNLayerAsset | null; worn: boolean } => {
        const assetId = expr?.layerConfiguration[layer.id];
        if (assetId && layer.assets[assetId]) return { asset: layer.assets[assetId], worn: true };
        return { asset: (Object.values(layer.assets)[0] as VNLayerAsset | undefined) || null, worn: false };
    };
    const previewedAsset = (layer: VNCharacterLayer): VNLayerAsset | null => previewedPiece(layer).asset;

    /** Resolve the piece's box FROM THE DRAFT (same chain as layout.ts resolveLayerBox). */
    const resolveDraftBox = (layerId: string): VNLayerBox | undefined => {
        const dl = draft.layers[layerId];
        if (!dl) return undefined;
        const layer = character.layers[layerId];
        const asset = layer ? previewedAsset(layer) : null;
        const da = asset ? dl.assets[asset.id] : null;
        if (activePose && da?.poseBoxes[activePose]) return da.poseBoxes[activePose];
        if (da?.box) return da.box;
        if (activePose && dl.poseBoxes[activePose]) return dl.poseBoxes[activePose];
        return dl.box;
    };

    /** Whether the current selection writes to the asset level (pin) — needs a previewed asset. */
    const pinnedAssetId = (layerId: string): string | null => {
        if (!pinToAsset) return null;
        const layer = character.layers[layerId];
        const asset = layer ? previewedAsset(layer) : null;
        return asset?.id || null;
    };

    /** Write a box to the current edit target (level chosen by pose tab + pin). */
    const writeBox = (layerId: string, box: VNLayerBox | undefined) => {
        setDraft(d => {
            const dl = d.layers[layerId];
            if (!dl) return d;
            const cleaned = box ? { ...box, x: round2(box.x), y: round2(box.y), width: round2(box.width), height: round2(box.height), ...(box.rotation ? { rotation: round2(box.rotation) } : {}), ...(box.flipH ? { flipH: true } : {}) } : undefined;
            const norm = cleaned && !isFullBox(cleaned) ? cleaned : (cleaned && (cleaned.rotation || cleaned.flipH) ? cleaned : undefined);
            const assetId = pinnedAssetId(layerId);
            const nextLayer: DraftLayer = { ...dl, poseBoxes: { ...dl.poseBoxes }, assets: { ...dl.assets } };
            if (assetId) {
                const da: DraftAsset = { ...(nextLayer.assets[assetId] || { poseBoxes: {} }) };
                da.poseBoxes = { ...da.poseBoxes };
                if (activePose) {
                    if (norm) da.poseBoxes[activePose] = norm; else delete da.poseBoxes[activePose];
                } else {
                    da.box = norm;
                }
                nextLayer.assets[assetId] = da;
            } else if (activePose) {
                if (norm) nextLayer.poseBoxes[activePose] = norm; else delete nextLayer.poseBoxes[activePose];
            } else {
                nextLayer.box = norm;
            }
            return { ...d, layers: { ...d.layers, [layerId]: nextLayer } };
        });
    };

    /** Current box for editing: resolved draft value, or the whole box. */
    const editBox = (layerId: string): VNLayerBox => resolveDraftBox(layerId) || FULL;

    const mutateBox = (layerId: string, patch: Partial<VNLayerBox>) => {
        writeBox(layerId, { ...editBox(layerId), ...patch });
    };

    /** Does the selection have an override AT the current level (for Reset labeling)? */
    const hasOverrideAtLevel = (layerId: string): boolean => {
        const dl = draft.layers[layerId];
        if (!dl) return false;
        const assetId = pinnedAssetId(layerId);
        if (assetId) {
            const da = dl.assets[assetId];
            return !!(activePose ? da?.poseBoxes[activePose] : da?.box);
        }
        return !!(activePose ? dl.poseBoxes[activePose] : dl.box);
    };

    const resetAtLevel = (layerId: string) => writeBox(layerId, undefined);

    // ── Order / hide ────────────────────────────────────────────────────────────────────
    /** Move a layer one step toward the front (dir=1) or back (dir=-1) in the active order. */
    const moveLayer = (layerId: string, dir: 1 | -1) => {
        setDraft(d => {
            const order = activePose ? [...(d.poses[activePose]?.layerOrder || d.baseOrder)] : [...d.baseOrder];
            const idx = order.indexOf(layerId);
            const to = idx + dir; // later in the array = nearer the front
            if (idx === -1 || to < 0 || to >= order.length) return d;
            [order[idx], order[to]] = [order[to], order[idx]];
            if (activePose) {
                const pose = d.poses[activePose] || { layerOrder: order, hiddenLayers: [] };
                return { ...d, poses: { ...d.poses, [activePose]: { ...pose, layerOrder: order } } };
            }
            return { ...d, baseOrder: order };
        });
    };

    const toggleHidden = (layerId: string) => {
        if (!activePose) return; // Default always shows every piece
        setDraft(d => {
            const pose = d.poses[activePose] || { layerOrder: [...d.baseOrder], hiddenLayers: [] };
            const hidden = pose.hiddenLayers.includes(layerId)
                ? pose.hiddenLayers.filter(id => id !== layerId)
                : [...pose.hiddenLayers, layerId];
            return { ...d, poses: { ...d.poses, [activePose]: { ...pose, hiddenLayers: hidden } } };
        });
    };

    // ── Zoom / pan ──────────────────────────────────────────────────────────────────────
    const zoomAbout = (factor: number, cx: number, cy: number) => {
        setZoom(z => {
            const nz = clamp(z * factor, 0.5, 8);
            setPan(p => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) }));
            return nz;
        });
    };
    const onWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) return;
        zoomAbout(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - rect.left, e.clientY - rect.top);
    };
    const zoomButtons = (factor: number) => {
        const rect = viewportRef.current?.getBoundingClientRect();
        zoomAbout(factor, (rect?.width || 0) / 2, (rect?.height || 0) / 2);
    };

    // ── Pointer interactions ────────────────────────────────────────────────────────────
    const startDrag = (e: React.PointerEvent, mode: 'move' | 'resize' | 'rotate', layerId: string, edges?: string) => {
        e.stopPropagation();
        let targetId = layerId;
        // Overlap rule: freshly-opened characters have EVERY piece at the full box, so a canvas
        // click always lands on the front-most piece — never the one picked in the list. If a
        // piece is already selected and the click falls inside ITS box, drag the SELECTION
        // (design-tool behavior: "I picked Hat in the list, now I drag Hat"). Pick a different
        // piece via the list, or click outside the selected box.
        if (mode === 'move' && selectedLayerId && selectedLayerId !== layerId && character.layers[selectedLayerId]) {
            const rect = canvasRef.current?.getBoundingClientRect();
            // Only retarget to a selection that is actually RENDERED on the canvas (an
            // unworn piece hidden by the "Show unworn pieces" toggle must not be dragged blind).
            const selRendered = previewedPiece(character.layers[selectedLayerId]).worn || showUnworn;
            if (rect && rect.width > 0 && selRendered) {
                const selBox = resolveDraftBox(selectedLayerId) || FULL;
                const px = ((e.clientX - rect.left) / rect.width) * 100;
                const py = ((e.clientY - rect.top) / rect.height) * 100;
                if (px >= selBox.x && px <= selBox.x + selBox.width && py >= selBox.y && py <= selBox.y + selBox.height
                    && !hiddenSet.has(selectedLayerId)) {
                    targetId = selectedLayerId;
                }
            }
        }
        setSelectedLayerId(targetId);
        dragRef.current = { mode, layerId: targetId, edges, startX: e.clientX, startY: e.clientY, orig: cloneBox(editBox(targetId)) };
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    };
    const startPan = (e: React.PointerEvent) => {
        dragRef.current = { mode: 'pan', startX: e.clientX, startY: e.clientY, origPan: { ...pan } };
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    };

    const siblingRects = (excludeLayerId: string): SnapRect[] =>
        orderedIds
            .filter(id => id !== excludeLayerId && !hiddenSet.has(id))
            .map(id => resolveDraftBox(id))
            .filter((b): b is VNLayerBox => !!b)
            .map(b => ({ x: b.x, y: b.y, width: b.width, height: b.height }));

    const onPointerMove = (e: React.PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        if (drag.mode === 'pan') {
            setPan({ x: drag.origPan!.x + (e.clientX - drag.startX), y: drag.origPan!.y + (e.clientY - drag.startY) });
            return;
        }
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect || !drag.orig || !drag.layerId) return;
        const dx = ((e.clientX - drag.startX) / rect.width) * 100;
        const dy = ((e.clientY - drag.startY) / rect.height) * 100;

        if (drag.mode === 'move') {
            let next: SnapRect = {
                x: clamp(drag.orig.x + dx, -100, 200), y: clamp(drag.orig.y + dy, -100, 200),
                width: drag.orig.width, height: drag.orig.height,
            };
            const res = snapRect(next, siblingRects(drag.layerId), { mode: 'move', thresholdPct: 0.8 / zoom, bypass: e.altKey });
            setGuides(res.guides);
            mutateBox(drag.layerId, { x: res.rect.x, y: res.rect.y });
            return;
        }
        if (drag.mode === 'resize') {
            const o = drag.orig;
            let { x, y, width, height } = o;
            const edges = drag.edges || '';
            if (keepShape && edges.length === 2) {
                // Corner + keep shape: equal-factor scaling from the dominant pointer axis.
                const fx = (o.width + (edges.includes('r') ? dx : -dx)) / o.width;
                const fy = (o.height + (edges.includes('b') ? dy : -dy)) / o.height;
                const f = Math.max(0.02, Math.abs(fx - 1) > Math.abs(fy - 1) ? fx : fy);
                width = clamp(o.width * f, 2, 300);
                height = clamp(o.height * f, 2, 300);
                if (edges.includes('l')) x = o.x + (o.width - width);
                if (edges.includes('t')) y = o.y + (o.height - height);
            } else {
                if (edges.includes('r')) width = clamp(o.width + dx, 2, 300);
                if (edges.includes('b')) height = clamp(o.height + dy, 2, 300);
                if (edges.includes('l')) { width = clamp(o.width - dx, 2, 300); x = o.x + (o.width - width); }
                if (edges.includes('t')) { height = clamp(o.height - dy, 2, 300); y = o.y + (o.height - height); }
            }
            const res = snapRect({ x, y, width, height }, siblingRects(drag.layerId), { mode: 'resize', activeEdges: drag.edges, thresholdPct: 0.8 / zoom, bypass: e.altKey });
            setGuides(res.guides);
            mutateBox(drag.layerId, { x: res.rect.x, y: res.rect.y, width: res.rect.width, height: res.rect.height });
            return;
        }
        if (drag.mode === 'rotate') {
            const o = drag.orig;
            // Angle in canvas PIXEL space so non-square canvases don't skew it.
            const cx = rect.left + ((o.x + o.width / 2) / 100) * rect.width;
            const cy = rect.top + ((o.y + o.height / 2) / 100) * rect.height;
            let deg = Math.atan2(e.clientX - cx, -(e.clientY - cy)) * 180 / Math.PI;
            if (e.shiftKey) deg = Math.round(deg / 15) * 15;
            deg = Math.round(deg * 10) / 10;
            if (deg > 180) deg -= 360;
            mutateBox(drag.layerId, { rotation: deg === 0 ? undefined : deg });
        }
    };
    const endDrag = () => { dragRef.current = null; setGuides([]); };

    // ── Keyboard: nudge + space-pan ─────────────────────────────────────────────────────
    const onKeyDown = (e: React.KeyboardEvent) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        if (e.key === ' ') { spaceHeld.current = true; e.preventDefault(); return; }
        if (!selectedLayerId) return;
        const step = e.shiftKey ? 1 : 0.1;
        const b = editBox(selectedLayerId);
        if (e.key === 'ArrowLeft') { mutateBox(selectedLayerId, { x: round2(b.x - step) }); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { mutateBox(selectedLayerId, { x: round2(b.x + step) }); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { mutateBox(selectedLayerId, { y: round2(b.y - step) }); e.preventDefault(); }
        else if (e.key === 'ArrowDown') { mutateBox(selectedLayerId, { y: round2(b.y + step) }); e.preventDefault(); }
    };
    const onKeyUp = (e: React.KeyboardEvent) => { if (e.key === ' ') spaceHeld.current = false; };

    // ── Done: diff draft vs character → ONE APPLY_CHARACTER_LAYOUT ─────────────────────
    const commit = () => {
        const payload: any = { characterId: character.id };
        const layerBoxes: Record<string, VNLayerBox | null> = {};
        const layerPoseBoxes: Record<string, Record<string, VNLayerBox | null>> = {};
        const assetBoxes: Record<string, Record<string, VNLayerBox | null>> = {};
        const assetPoseBoxes: Record<string, Record<string, Record<string, VNLayerBox | null>>> = {};

        for (const layer of Object.values(character.layers) as VNCharacterLayer[]) {
            const dl = draft.layers[layer.id];
            if (!dl) continue;
            if (!boxesEqual(dl.box, layer.box)) layerBoxes[layer.id] = dl.box ?? null;
            const poseKeys = new Set([...Object.keys(dl.poseBoxes), ...Object.keys(layer.poseBoxes || {})]);
            for (const pid of poseKeys) {
                if (!boxesEqual(dl.poseBoxes[pid], layer.poseBoxes?.[pid])) {
                    (layerPoseBoxes[layer.id] ||= {})[pid] = dl.poseBoxes[pid] ?? null;
                }
            }
            for (const asset of Object.values(layer.assets) as VNLayerAsset[]) {
                const da = dl.assets[asset.id];
                if (!da) continue;
                if (!boxesEqual(da.box, asset.box)) (assetBoxes[layer.id] ||= {})[asset.id] = da.box ?? null;
                const aPoseKeys = new Set([...Object.keys(da.poseBoxes), ...Object.keys(asset.poseBoxes || {})]);
                for (const pid of aPoseKeys) {
                    if (!boxesEqual(da.poseBoxes[pid], asset.poseBoxes?.[pid])) {
                        ((assetPoseBoxes[layer.id] ||= {})[asset.id] ||= {})[pid] = da.poseBoxes[pid] ?? null;
                    }
                }
            }
        }
        if (Object.keys(layerBoxes).length) payload.layerBoxes = layerBoxes;
        if (Object.keys(layerPoseBoxes).length) payload.layerPoseBoxes = layerPoseBoxes;
        if (Object.keys(assetBoxes).length) payload.assetBoxes = assetBoxes;
        if (Object.keys(assetPoseBoxes).length) payload.assetPoseBoxes = assetPoseBoxes;

        if (draft.baseOrder.join('|') !== Object.keys(character.layers).join('|')) {
            payload.baseLayerOrder = draft.baseOrder;
        }
        const poseLayerOrders: Record<string, string[] | null> = {};
        const poseHiddenLayers: Record<string, string[] | null> = {};
        for (const pose of Object.values(character.poses || {}) as VNCharacterPose[]) {
            const dp = draft.poses[pose.id];
            if (!dp) continue;
            const originalListed = (pose.layerOrder || []).filter(id => id in character.layers);
            const originalOrder = originalListed.length
                ? [...originalListed, ...Object.keys(character.layers).filter(id => !originalListed.includes(id))]
                : Object.keys(character.layers);
            if (dp.layerOrder.join('|') !== originalOrder.join('|') || payload.baseLayerOrder) {
                poseLayerOrders[pose.id] = dp.layerOrder;
            }
            const origHidden = [...(pose.hiddenLayers || [])].sort().join('|');
            if ([...dp.hiddenLayers].sort().join('|') !== origHidden) {
                poseHiddenLayers[pose.id] = dp.hiddenLayers;
            }
        }
        if (Object.keys(poseLayerOrders).length) payload.poseLayerOrders = poseLayerOrders;
        if (Object.keys(poseHiddenLayers).length) payload.poseHiddenLayers = poseHiddenLayers;

        const hasChanges = Object.keys(payload).length > 1;
        if (hasChanges) dispatch({ type: 'APPLY_CHARACTER_LAYOUT', payload });
        onClose();
    };

    // ── Render helpers ──────────────────────────────────────────────────────────────────
    const artUrlFor = (asset: VNLayerAsset | null): { url: string | null; isVideo: boolean } => {
        if (!asset) return { url: null, isVideo: false };
        const art = assetArtForPose(asset, activePose || undefined);
        if (art.videoUrl) return { url: resolveFieldUrl(project.id, art.videoUrl) || art.videoUrl, isVideo: true };
        if (art.imageUrl) return { url: resolveFieldUrl(project.id, art.imageUrl) || art.imageUrl, isVideo: false };
        return { url: null, isVideo: false };
    };
    const baseArt = useMemo(() => {
        const pose = activePose ? character.poses?.[activePose] : null;
        const url = (pose?.baseImageUrl || character.baseImageUrl) || null;
        return url ? (resolveFieldUrl(project.id, url) || url) : null;
    }, [character, activePose, project.id]);

    const backdropStyle: React.CSSProperties = backdrop === 'dark'
        ? { background: '#0b1120' }
        : backdrop === 'light'
            ? { background: '#cbd5e1' }
            : { background: 'repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 0 0 / 24px 24px' };

    const selected = selectedLayerId ? character.layers[selectedLayerId] : null;
    const selectedBox = selectedLayerId ? editBox(selectedLayerId) : null;
    const selectedAsset = selected ? previewedAsset(selected) : null;
    const chip = (active: boolean): string =>
        `px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${active ? 'bg-[var(--accent-lavender)]/25 ring-1 ring-[var(--accent-lavender)]/60 text-[var(--accent-lavender)]' : 'text-slate-300 hover:bg-white/5'}`;

    // Front-first list for the sidebar (order array is back → front).
    const frontFirst = [...orderedIds].reverse();

    return createPortal(
        <div ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown} onKeyUp={onKeyUp}
            className="fixed inset-0 z-[100000] bg-black/75 flex items-center justify-center p-3 outline-none" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl w-full h-[92vh] max-w-[96vw] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* ── Top bar ── */}
                <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border-subtle)] flex-wrap">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">🧍 {t('poseStudio.title', "Arrange {{name}}'s pieces", { name: character.name })}</h3>
                    <div className="flex items-center gap-1 flex-wrap">
                        <button type="button" onClick={() => setActivePose(null)} className={chip(!activePose)}>{t('poses.default', 'Default')}</button>
                        {(Object.values(character.poses || {}) as VNCharacterPose[]).map(p => (
                            <button key={p.id} type="button" onClick={() => setActivePose(p.id)} className={chip(activePose === p.id)}>{p.name}</button>
                        ))}
                    </div>
                    <div className="flex-1" />
                    <label className="flex items-center gap-1 text-[11px] text-slate-400">
                        {t('poseStudio.previewOutfit', 'Preview outfit')}
                        <select value={exprId} onChange={e => setExprId(e.target.value)} className="bg-[var(--bg-primary)] text-slate-200 text-xs rounded px-1.5 py-1 border border-[var(--border-subtle)]">
                            {(Object.values(character.expressions) as VNCharacterExpression[]).map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                        </select>
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer" title={t('poseStudio.dimBaseHint', 'Fade the base sprite so the movable pieces stand out')}>
                        <input type="checkbox" checked={dimBase} onChange={e => setDimBase(e.target.checked)} className="accent-purple-500" />
                        {t('poseStudio.dimBase', 'Dim base')}
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer" title={t('poseStudio.showUnwornHint', 'Pieces the previewed outfit does not wear are shown see-through so you can still arrange them. Untick to hide them.')}>
                        <input type="checkbox" checked={showUnworn} onChange={e => setShowUnworn(e.target.checked)} className="accent-purple-500" />
                        {t('poseStudio.showUnworn', 'Show unworn pieces')}
                    </label>
                    <select value={backdrop} onChange={e => setBackdrop(e.target.value as any)} className="bg-[var(--bg-primary)] text-slate-200 text-xs rounded px-1.5 py-1 border border-[var(--border-subtle)]" title={t('poseStudio.backdrop', 'Backdrop')}>
                        <option value="checker">{t('poseStudio.backdropChecker', 'Checkered')}</option>
                        <option value="dark">{t('poseStudio.backdropDark', 'Dark')}</option>
                        <option value="light">{t('poseStudio.backdropLight', 'Light')}</option>
                    </select>
                    <div className="flex items-center gap-1 text-xs text-slate-300">
                        <button type="button" onClick={() => zoomButtons(1 / 1.25)} className="w-6 h-6 rounded bg-white/5 hover:bg-white/10">−</button>
                        <span className="w-11 text-center">{Math.round(zoom * 100)}%</span>
                        <button type="button" onClick={() => zoomButtons(1.25)} className="w-6 h-6 rounded bg-white/5 hover:bg-white/10">+</button>
                        <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="px-2 h-6 rounded bg-white/5 hover:bg-white/10">{t('poseStudio.fit', 'Fit')}</button>
                    </div>
                </div>

                <div className="flex-1 flex min-h-0">
                    {/* ── Left: pieces list (front → back) ── */}
                    <div className="w-60 flex-shrink-0 border-r border-[var(--border-subtle)] p-2 overflow-y-auto">
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{t('poseStudio.pieces', 'Pieces (front to back)')}</div>
                        {frontFirst.map(layerId => {
                            const layer = character.layers[layerId];
                            if (!layer) return null;
                            const { asset, worn } = previewedPiece(layer);
                            const { url } = artUrlFor(asset);
                            const isHidden = hiddenSet.has(layerId);
                            const dl = draft.layers[layerId];
                            const hasPoseOverride = !!activePose && !!(dl?.poseBoxes[activePose] || (asset && dl?.assets[asset.id]?.poseBoxes[activePose]));
                            const hasPin = !!asset && !!(dl?.assets[asset.id]?.box || (activePose && dl?.assets[asset.id]?.poseBoxes[activePose]));
                            return (
                                <div key={layerId}
                                    className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer text-xs mb-0.5 ${selectedLayerId === layerId ? 'bg-[var(--accent-lavender)]/20 ring-1 ring-[var(--accent-lavender)]/50' : 'hover:bg-white/5'} ${isHidden ? 'opacity-50' : ''}`}
                                    onClick={() => setSelectedLayerId(layerId)}>
                                    <button type="button" disabled={!activePose}
                                        title={!activePose ? t('poseStudio.hideDisabledHint', 'The Default pose always shows every piece — pick a pose to hide pieces in it') : (isHidden ? t('poseStudio.showPiece', 'Show in this pose') : t('poseStudio.hidePiece', 'Hide in this pose'))}
                                        onClick={e => { e.stopPropagation(); toggleHidden(layerId); }}
                                        className={`${!activePose ? 'opacity-30 cursor-default' : 'opacity-80 hover:opacity-100'}`}>
                                        {isHidden ? '🚫' : '👁'}
                                    </button>
                                    <span className="w-6 h-6 rounded bg-black/40 overflow-hidden flex items-center justify-center flex-shrink-0" style={worn ? undefined : { opacity: 0.4 }}>
                                        {url ? <img src={url} alt="" className="w-full h-full object-contain" /> : <span className="text-[9px] text-slate-500">—</span>}
                                    </span>
                                    <span className="flex-1 truncate text-slate-200">
                                        {layer.name}
                                        {!worn && <span className="ml-1 text-[9px] text-slate-500" title={t('poseStudio.unwornTip', 'Not in the previewed outfit — shown see-through for arranging')}>{t('poseStudio.unwornTag', '(not worn)')}</span>}
                                    </span>
                                    {hasPin && <span title={t('poseStudio.pinBadge', 'This piece has its own spot')}>📌</span>}
                                    {hasPoseOverride && !hasPin && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-lavender)]" title={t('poseStudio.overrideBadge', 'Placed differently in this pose')} />}
                                    <button type="button" title={t('poseStudio.moveForward', 'Move forward')} onClick={e => { e.stopPropagation(); moveLayer(layerId, 1); }} className="opacity-60 hover:opacity-100">▲</button>
                                    <button type="button" title={t('poseStudio.moveBackward', 'Move backward')} onClick={e => { e.stopPropagation(); moveLayer(layerId, -1); }} className="opacity-60 hover:opacity-100">▼</button>
                                </div>
                            );
                        })}
                        <p className="text-[10px] text-slate-500 mt-2">{t('poseStudio.orderHint', 'Top of the list = in front. ▲ brings a piece forward, ▼ sends it back.')}</p>
                    </div>

                    {/* ── Center: canvas ── */}
                    <div ref={viewportRef} className="flex-1 min-w-0 relative overflow-hidden" style={backdropStyle}
                        onWheel={onWheel}
                        onPointerDown={e => {
                            if (spaceHeld.current || e.button === 1) { startPan(e); e.preventDefault(); return; }
                            setSelectedLayerId(null);
                        }}
                        onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
                        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})` }}>
                            <div ref={canvasRef} className="relative select-none shadow-2xl"
                                style={{ height: 'min(78vh, 640px)', aspectRatio: '3 / 4', background: 'rgba(15,23,42,0.35)', outline: '1px solid rgba(148,163,184,0.4)', touchAction: 'none' }}>
                                {/* Base sprite — locked whole-box backdrop */}
                                {baseArt && <img src={baseArt} alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none" style={{ zIndex: 0, opacity: dimBase ? 0.25 : 1 }} draggable={false} />}
                                {/* Pieces in draft order */}
                                {orderedIds.map((layerId, stackIdx) => {
                                    const layer = character.layers[layerId];
                                    if (!layer) return null;
                                    const { asset, worn } = previewedPiece(layer);
                                    if (!worn && !showUnworn) return null;
                                    const { url, isVideo } = artUrlFor(asset);
                                    const box = resolveDraftBox(layerId) || FULL;
                                    const isSel = selectedLayerId === layerId;
                                    const isHidden = hiddenSet.has(layerId);
                                    const transform = `${box.rotation ? `rotate(${box.rotation}deg) ` : ''}${box.flipH ? 'scaleX(-1)' : ''}`.trim() || undefined;
                                    return (
                                        <div key={layerId}
                                            className="absolute"
                                            title={worn ? undefined : t('poseStudio.unwornTip', 'Not in the previewed outfit — shown see-through for arranging')}
                                            style={{
                                                left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%`,
                                                zIndex: stackIdx + 1,
                                                // Ghost order: hidden-in-pose is dimmest, unworn pieces are see-through.
                                                opacity: isHidden ? 0.3 : worn ? 1 : 0.4,
                                                outline: isSel ? '2px solid #38bdf8' : '1px dashed rgba(148,163,184,0.25)',
                                                cursor: 'move',
                                                transform,
                                            }}
                                            onPointerDown={e => startDrag(e, 'move', layerId)}>
                                            {url ? (
                                                isVideo
                                                    ? <video src={url} autoPlay muted loop playsInline className="w-full h-full object-contain pointer-events-none" />
                                                    : <img src={url} alt="" className="w-full h-full object-contain pointer-events-none" draggable={false} />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center border border-dashed border-slate-500/60 text-[10px] text-slate-400 pointer-events-none px-1 text-center">
                                                    {layer.name} · {t('poseStudio.noArtHere', 'no picture in this outfit')}
                                                </div>
                                            )}
                                            {isSel && <>
                                                {/* 8 resize handles */}
                                                {['tl', 't', 'tr', 'l', 'r', 'bl', 'b', 'br'].map(h => {
                                                    const pos: React.CSSProperties = { position: 'absolute', width: 9, height: 9, background: '#38bdf8', border: '1px solid rgba(0,0,0,0.6)', borderRadius: 2 };
                                                    if (h.includes('t')) pos.top = -5; else if (h.includes('b')) pos.bottom = -5; else pos.top = 'calc(50% - 4.5px)';
                                                    if (h.includes('l')) pos.left = -5; else if (h.includes('r')) pos.right = -5; else pos.left = 'calc(50% - 4.5px)';
                                                    const cur = h === 't' || h === 'b' ? 'ns-resize' : h === 'l' || h === 'r' ? 'ew-resize' : (h === 'tl' || h === 'br') ? 'nwse-resize' : 'nesw-resize';
                                                    return <div key={h} style={{ ...pos, cursor: cur }} onPointerDown={e => startDrag(e, 'resize', layerId, h)} />;
                                                })}
                                                {/* Rotate stem */}
                                                <div style={{ position: 'absolute', left: 'calc(50% - 1px)', top: -22, width: 2, height: 18, background: '#38bdf8' }} />
                                                <div title={t('poseStudio.rotateHint', 'Drag to tilt · hold Shift for 15° steps')}
                                                    style={{ position: 'absolute', left: 'calc(50% - 6px)', top: -30, width: 12, height: 12, borderRadius: '50%', background: '#38bdf8', border: '1px solid rgba(0,0,0,0.6)', cursor: 'grab' }}
                                                    onPointerDown={e => startDrag(e, 'rotate', layerId)} />
                                            </>}
                                        </div>
                                    );
                                })}
                                {/* Snap guides */}
                                {guides.map((g, i) => (
                                    <div key={i} className="absolute pointer-events-none" style={{
                                        background: g.kind === 'canvas' ? '#22d3ee' : '#c4b5fd',
                                        ...(g.axis === 'x'
                                            ? { left: `${g.at}%`, top: `${g.span?.[0] ?? 0}%`, width: 1, height: `${(g.span?.[1] ?? 100) - (g.span?.[0] ?? 0)}%` }
                                            : { top: `${g.at}%`, left: `${g.span?.[0] ?? 0}%`, height: 1, width: `${(g.span?.[1] ?? 100) - (g.span?.[0] ?? 0)}%` }),
                                        zIndex: 9999,
                                    }} />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Right: selected piece panel ── */}
                    <div className="w-64 flex-shrink-0 border-l border-[var(--border-subtle)] p-3 overflow-y-auto text-xs text-slate-300 space-y-2">
                        {selected && selectedBox ? <>
                            <div className="font-semibold text-slate-200 truncate">{selected.name}{selectedAsset ? <span className="text-slate-500"> · {selectedAsset.name}</span> : null}</div>
                            {selectedAsset && (
                                <div className="space-y-1">
                                    <div className="text-[10px] text-slate-500">{t('poseStudio.applyTo', 'Apply changes to')}</div>
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input type="radio" checked={!pinToAsset} onChange={() => setPinToAsset(false)} className="accent-purple-500" />
                                        {t('poseStudio.applyLayer', 'The whole layer')}
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input type="radio" checked={pinToAsset} onChange={() => setPinToAsset(true)} className="accent-purple-500" />
                                        {t('poseStudio.applyPiece', 'Just this piece ({{name}})', { name: selectedAsset.name })}
                                    </label>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-1.5">
                                {([['x', t('poseStudio.across', 'Across (X)')], ['y', t('poseStudio.down', 'Down (Y)')], ['width', t('poseStudio.width', 'Width')], ['height', t('poseStudio.height', 'Height')]] as const).map(([k, label]) => (
                                    <label key={k} className="flex flex-col gap-0.5">
                                        <span className="text-[10px] text-slate-500">{label} %</span>
                                        <input type="number" step={0.1} value={selectedBox[k]}
                                            onChange={e => mutateBox(selected.id, { [k]: clamp(parseFloat(e.target.value) || 0, k === 'width' || k === 'height' ? 2 : -100, k === 'width' || k === 'height' ? 300 : 200) } as any)}
                                            className="bg-[var(--bg-primary)] rounded px-1.5 py-1 border border-[var(--border-subtle)] text-slate-200" />
                                    </label>
                                ))}
                            </div>
                            <label className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-slate-500">{t('poseStudio.tilt', 'Tilt (degrees)')}</span>
                                <input type="number" step={1} value={selectedBox.rotation ?? 0}
                                    onChange={e => { const v = parseFloat(e.target.value) || 0; mutateBox(selected.id, { rotation: v === 0 ? undefined : v }); }}
                                    className="bg-[var(--bg-primary)] rounded px-1.5 py-1 border border-[var(--border-subtle)] text-slate-200" />
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={!!selectedBox.flipH} onChange={e => mutateBox(selected.id, { flipH: e.target.checked || undefined })} className="accent-purple-500" />
                                {t('poseStudio.mirror', 'Mirror left↔right')}
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={keepShape} onChange={e => setKeepShape(e.target.checked)} className="accent-purple-500" />
                                {t('poseStudio.keepShape', 'Keep shape while resizing')}
                            </label>
                            <div className="flex gap-1.5">
                                <button type="button" onClick={() => mutateBox(selected.id, { x: round2(50 - selectedBox.width / 2) })} className="flex-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10">{t('poseStudio.centerH', 'Center ⇋')}</button>
                                <button type="button" onClick={() => mutateBox(selected.id, { y: round2(50 - selectedBox.height / 2) })} className="flex-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10">{t('poseStudio.centerV', 'Center ⇵')}</button>
                            </div>
                            {hasOverrideAtLevel(selected.id) && (
                                <button type="button" onClick={() => resetAtLevel(selected.id)} className="w-full px-2 py-1 rounded border border-[var(--border-subtle)] hover:border-red-400/60 text-slate-300">
                                    {activePose ? t('poseStudio.resetToDefault', '↺ Back to the Default layout') : t('poseStudio.resetToWhole', '↺ Back to the whole box')}
                                </button>
                            )}
                            <p className="text-[10px] text-slate-500 pt-1">{t('poseStudio.nudgeHint', 'Tip: arrow keys nudge · hold Shift for bigger steps · hold Alt to ignore snapping · Space-drag to pan')}</p>
                        </> : (
                            <p className="text-slate-500">{t('poseStudio.pickPiece', 'Click a piece on the canvas (or in the list) to arrange it.')}</p>
                        )}
                    </div>
                </div>

                {/* ── Footer ── */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-t border-[var(--border-subtle)]">
                    <p className="text-[10px] text-slate-500 flex-1">{t('poseStudio.footerHint', 'Changes apply to this piece in every outfit and expression. Pieces poking far outside the box may be trimmed in menu previews.')}</p>
                    <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)]">{t('poseStudio.cancel', 'Cancel')}</button>
                    <button type="button" onClick={commit} className="px-4 py-1.5 rounded-md text-xs bg-[var(--accent-purple)] text-white font-semibold">{t('poseStudio.done', 'Done')}</button>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default PoseStudio;
