/**
 * HotZoneOverlays
 * ────────────────
 * Canvas-overlay components for hot spots, image-map regions, and hot zone
 * elements (draggable images / buttons / text / etc.). Extracted from the
 * deprecated `HotZoneEditor.tsx` so it can be deleted in Phase 4.
 *
 * These components still consume the legacy `VNHotSpot` / `VNHotZoneElement`
 * shapes — callers (MenuEditor, etc.) translate between the unified
 * `VNUIElement` types and these shapes via `src/utils/hotZoneShims.ts`.
 * A future Phase 4.5 can rewrite them to read typed elements directly and
 * retire the shim.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import {
    VNUIElement,
    UIElementType,
    UIHotSpotElement,
    UIImageMapElement,
    UIImageElement,
    UIButtonElement,
    UITextElement,
    UITextInputElement,
    VNHotZoneElement,
    HotSpotTrigger,
} from '../../features/ui/types';
import { ImageMapRegion } from '../../features/scene/types';
import ResizableDraggable from '../menu-editor/ResizableDraggable';

/** Renders a Hot Spot overlay on the canvas. Takes a unified `UIHotSpotElement`
 *  directly — its field layout matches the legacy `VNHotSpot` so no conversion
 *  is needed. */
export const HotSpotOverlay: React.FC<{
    spot: UIHotSpotElement;
    isSelected: boolean;
    parentSize: { width: number; height: number };
    onSelect: (e: React.MouseEvent) => void;
    onUpdate: (updates: { x?: number; y?: number; width?: number; height?: number }) => void;
}> = ({ spot, isSelected, parentSize, onSelect, onUpdate }) => {
    const triggerColors: Record<HotSpotTrigger, string> = {
        click: 'rgba(59, 130, 246, 0.3)',
        hover: 'rgba(234, 179, 8, 0.3)',
        'drag-drop': 'rgba(34, 197, 94, 0.3)',
    };
    const borderColors: Record<HotSpotTrigger, string> = {
        click: 'rgb(59, 130, 246)',
        hover: 'rgb(234, 179, 8)',
        'drag-drop': 'rgb(34, 197, 94)',
    };

    return (
        <ResizableDraggable
            x={spot.x}
            y={spot.y}
            width={spot.width}
            height={spot.height}
            anchorX={0}
            anchorY={0}
            parentSize={parentSize}
            isSelected={isSelected}
            onSelect={onSelect}
            onUpdate={onUpdate}
            snapGrid={1}
        >
            <div
                className="w-full h-full flex items-center justify-center text-xs font-bold"
                style={{
                    backgroundColor: triggerColors[spot.trigger],
                    border: `2px dashed ${borderColors[spot.trigger]}`,
                    borderRadius: spot.shape === 'circle' ? '50%' : '4px',
                    color: borderColors[spot.trigger],
                }}
            >
                {spot.name}
            </div>
        </ResizableDraggable>
    );
};

/** Internal helper: map a unified `VNUIElement` (image / button / text /
 *  text-input / image map / draggable image) into the legacy
 *  `VNHotZoneElement` shape that HotZoneElementOverlay's body renders.
 *  Kept private to this module so the component has a typed external API. */
function toLegacyHotZoneElement(el: VNUIElement): VNHotZoneElement | null {
    const anyEl = el as any;
    switch (el.type) {
        case UIElementType.ImageMap: {
            const m = el as UIImageMapElement;
            return {
                id: m.id, name: m.name, elementType: 'imageMap',
                imageId: (m.image?.id ?? '') as VNID,
                hoverImageId: m.hoverImage?.id,
                imageMapRegions: m.imageMapRegions,
                x: m.x, y: m.y, width: m.width, height: m.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: m.conditions, actions: anyEl.actions,
                clickSoundId: anyEl.clickSoundId, hoverSoundId: anyEl.hoverSoundId,
            };
        }
        case UIElementType.Image: {
            const img = el as UIImageElement;
            const bg = img.background;
            const isVideo = bg?.type === 'video';
            const isImage = bg?.type === 'image';
            const assetId = (bg && (bg.type === 'image' || bg.type === 'video') ? bg.assetId : null) ?? img.image?.id ?? null;
            return {
                id: img.id, name: img.name,
                elementType: isVideo ? 'video' : 'image',
                imageId: (isImage ? assetId : '') as VNID,
                videoId: isVideo ? (assetId ?? undefined) as VNID | undefined : undefined,
                videoLoop: anyEl.videoLoop, videoMuted: anyEl.videoMuted,
                x: img.x, y: img.y, width: img.width, height: img.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: img.conditions, actions: anyEl.actions,
                clickSoundId: anyEl.clickSoundId, hoverSoundId: anyEl.hoverSoundId,
            };
        }
        case UIElementType.Text: {
            const t = el as UITextElement;
            return {
                id: t.id, name: t.name, elementType: 'text',
                imageId: '' as VNID, text: t.text, font: t.font,
                x: t.x, y: t.y, width: t.width, height: t.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: t.conditions, actions: anyEl.actions,
                clickSoundId: anyEl.clickSoundId, hoverSoundId: anyEl.hoverSoundId,
            };
        }
        case UIElementType.Button: {
            const b = el as UIButtonElement;
            return {
                id: b.id, name: b.name, elementType: 'button',
                imageId: (b.image?.id ?? '') as VNID, text: b.text, font: b.font,
                backgroundColor: b.backgroundColor,
                x: b.x, y: b.y, width: b.width, height: b.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: b.conditions, actions: b.actions ?? anyEl.actions,
                clickSoundId: b.clickSoundId ?? null, hoverSoundId: b.hoverSoundId ?? null,
            };
        }
        case UIElementType.TextInput: {
            const ti = el as UITextInputElement;
            return {
                id: ti.id, name: ti.name, elementType: 'textInput',
                imageId: '' as VNID, placeholder: ti.placeholder, variableId: ti.variableId,
                font: ti.font, backgroundColor: ti.backgroundColor,
                borderColor: ti.borderColor, maxLength: ti.maxLength,
                x: ti.x, y: ti.y, width: ti.width, height: ti.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: ti.conditions, actions: anyEl.actions,
                clickSoundId: anyEl.clickSoundId, hoverSoundId: anyEl.hoverSoundId,
            };
        }
        default:
            return null;
    }
}

/** Polygon region overlay with per-vertex drag handles and body drag-to-move */
export const PolyRegionOverlay: React.FC<{
    region: ImageMapRegion;
    parentSize: { width: number; height: number };
    isRegionSelected: boolean;
    onSelect: () => void;
    onUpdate: (coords: number[]) => void;
}> = ({ region, parentSize, isRegionSelected, onSelect, onUpdate }) => {
    const [vertexDrag, setVertexDrag] = useState<{ idx: number; startMouseX: number; startMouseY: number; startX: number; startY: number } | null>(null);
    const [bodyDrag, setBodyDrag] = useState<{ startMouseX: number; startMouseY: number; startCoords: number[] } | null>(null);

    useEffect(() => {
        if (!vertexDrag && !bodyDrag) return;
        const onMove = (e: MouseEvent) => {
            const pw = Math.max(1, parentSize.width);
            const ph = Math.max(1, parentSize.height);
            if (vertexDrag) {
                const dx = ((e.clientX - vertexDrag.startMouseX) / pw) * 100;
                const dy = ((e.clientY - vertexDrag.startMouseY) / ph) * 100;
                let nx = vertexDrag.startX + dx;
                let ny = vertexDrag.startY + dy;
                nx = Math.max(0, Math.min(100, Math.round(nx * 10) / 10));
                ny = Math.max(0, Math.min(100, Math.round(ny * 10) / 10));
                const newCoords = [...region.coords];
                newCoords[vertexDrag.idx * 2] = nx;
                newCoords[vertexDrag.idx * 2 + 1] = ny;
                onUpdate(newCoords);
            } else if (bodyDrag) {
                const dx = ((e.clientX - bodyDrag.startMouseX) / pw) * 100;
                const dy = ((e.clientY - bodyDrag.startMouseY) / ph) * 100;
                const newCoords = bodyDrag.startCoords.map((c, i) =>
                    Math.round((c + (i % 2 === 0 ? dx : dy)) * 10) / 10
                );
                onUpdate(newCoords);
            }
        };
        const onUp = () => { setVertexDrag(null); setBodyDrag(null); };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [vertexDrag, bodyDrag, parentSize.width, parentSize.height, region.coords, onUpdate]);

    const points: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < region.coords.length; i += 2) {
        points.push({ x: region.coords[i] ?? 0, y: region.coords[i + 1] ?? 0 });
    }
    const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
    const fill = isRegionSelected
        ? (region.highlightColor || 'rgba(16,185,129,0.4)')
        : (region.highlightColor || 'rgba(16,185,129,0.25)');
    const strokeColor = isRegionSelected ? 'rgba(16,185,129,0.95)' : 'rgba(16,185,129,0.7)';

    return (
        <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
            <svg
                className="absolute inset-0"
                style={{ width: '100%', height: '100%', overflow: 'visible' }}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
            >
                <polygon
                    points={pointsStr}
                    fill={fill}
                    stroke={strokeColor}
                    strokeWidth={isRegionSelected ? 2 : 1.5}
                    vectorEffect="non-scaling-stroke"
                    style={{ pointerEvents: 'auto', cursor: 'move' }}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelect();
                        setBodyDrag({ startMouseX: e.clientX, startMouseY: e.clientY, startCoords: [...region.coords] });
                    }}
                >
                    <title>{region.tooltip || region.name}</title>
                </polygon>
            </svg>
            {/* Region label anchored to first point */}
            {points[0] && (
                <span
                    className="absolute text-[7px] text-emerald-300 bg-emerald-800/70 px-0.5 rounded pointer-events-none"
                    style={{ left: `${points[0].x}%`, top: `${points[0].y}%`, transform: 'translate(4px, -100%)', whiteSpace: 'nowrap' }}
                >
                    {region.name}
                </span>
            )}
            {/* Vertex handles — only when region is the actively selected one */}
            {isRegionSelected && points.map((pt, pi) => (
                <div
                    key={pi}
                    title={`Point ${pi + 1} — drag to reshape`}
                    style={{
                        position: 'absolute',
                        left: `${pt.x}%`,
                        top: `${pt.y}%`,
                        transform: 'translate(-50%, -50%)',
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: '#06b6d4',
                        border: '2px solid white',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                        cursor: 'crosshair',
                        pointerEvents: 'auto',
                        zIndex: 10,
                    }}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelect();
                        setVertexDrag({
                            idx: pi,
                            startMouseX: e.clientX,
                            startMouseY: e.clientY,
                            startX: pt.x,
                            startY: pt.y,
                        });
                    }}
                />
            ))}
        </div>
    );
};

/** Renders an interactive hot zone element (image / button / text / video /
 *  text input / image map / draggable) on the canvas. Takes a unified
 *  `VNUIElement` and converts to the legacy `VNHotZoneElement` layout
 *  internally so the existing per-type JSX can render unchanged. */
export const HotZoneElementOverlay: React.FC<{
    element: VNUIElement;
    project: VNProject;
    isSelected: boolean;
    parentSize: { width: number; height: number };
    onSelect: (e: React.MouseEvent) => void;
    onUpdate: (updates: { x?: number; y?: number; width?: number; height?: number }) => void;
    onRegionUpdate?: (regionIdx: number, coords: number[]) => void;
    selectedRegionIdx?: number | null;
    onSelectRegion?: (idx: number | null) => void;
}> = ({ element: typedElement, project, isSelected, parentSize, onSelect, onUpdate, onRegionUpdate, selectedRegionIdx, onSelectRegion }) => {
    const element = toLegacyHotZoneElement(typedElement);
    if (!element) return null;
    const imageUrl = project.images[element.imageId]?.imageUrl ||
                     project.backgrounds[element.imageId]?.imageUrl;

    const elType = element.elementType || 'image';
    const videoUrl = element.videoId ? (project.videos[element.videoId]?.videoUrl) : null;

    // Compute the pixel size of this element on the canvas (for inner region drag/resize)
    const elementPixelSize = useMemo(() => ({
        width: parentSize.width * element.width / 100,
        height: parentSize.height * element.height / 100,
    }), [parentSize, element.width, element.height]);
    return (
        <ResizableDraggable
            x={element.x}
            y={element.y}
            width={element.width}
            height={element.height}
            anchorX={0}
            anchorY={0}
            parentSize={parentSize}
            isSelected={isSelected}
            onSelect={onSelect}
            onUpdate={onUpdate}
            snapGrid={1}
            allowChildInteraction={elType === 'imageMap' && isSelected}
        >
            <div className="w-full h-full relative">
                {elType === 'text' ? (
                    <div className="w-full h-full flex items-center justify-center text-white text-sm"
                        style={element.font ? { fontFamily: element.font.family, fontSize: element.font.size, fontWeight: element.font.weight, fontStyle: element.font.italic ? 'italic' : 'normal', color: element.font.color || '#fff' } : {}}>
                        {element.text || element.name}
                    </div>
                ) : elType === 'button' ? (
                    <div className="w-full h-full relative flex items-center justify-center rounded" style={{ backgroundColor: element.backgroundColor || '#4D3273' }}>
                        {imageUrl && <img src={imageUrl} alt={element.name} className="absolute inset-0 w-full h-full object-fill rounded" />}
                        <span className="relative z-10 text-white text-sm font-semibold"
                            style={element.font ? { fontFamily: element.font.family, fontSize: element.font.size, color: element.font.color || '#fff' } : {}}>
                            {element.text || element.name}
                        </span>
                    </div>
                ) : elType === 'video' ? (
                    videoUrl ? (
                        <video src={videoUrl} className="w-full h-full object-contain" muted autoPlay loop={element.videoLoop ?? true} />
                    ) : (
                        <div className="w-full h-full bg-indigo-500/30 border-2 border-indigo-400 border-dashed rounded flex items-center justify-center text-xs text-indigo-300">
                            {element.name} (no video)
                        </div>
                    )
                ) : elType === 'textInput' ? (
                    <div className="w-full h-full flex items-center gap-0">
                        <div className="flex-1 h-full rounded-l px-2 flex items-center text-xs min-w-0"
                            style={{
                                backgroundColor: element.backgroundColor || '#1e293b',
                                border: `1px solid ${element.borderColor || '#475569'}`,
                                borderRight: 'none',
                                color: element.font?.color || '#94a3b8',
                                fontFamily: element.font?.family,
                                fontSize: element.font?.size,
                            }}>
                            {element.placeholder || 'Text input...'}
                        </div>
                        <div className="h-full px-2 rounded-r text-xs font-semibold flex items-center justify-center shrink-0"
                            style={{
                                backgroundColor: element.borderColor || '#475569',
                                color: '#fff',
                                border: `1px solid ${element.borderColor || '#475569'}`,
                            }}>
                            &#x2713;
                        </div>
                    </div>
                ) : elType === 'imageMap' ? (
                    <div className="w-full h-full relative">
                        {imageUrl ? (
                            <img src={imageUrl} alt={element.name} className="w-full h-full object-contain" />
                        ) : (
                            <div className="w-full h-full bg-emerald-500/20 border-2 border-emerald-400 border-dashed rounded" />
                        )}
                        {(element.imageMapRegions || []).map((region, idx) => {
                            const isRegionSelected = isSelected && selectedRegionIdx === idx;
                            const interactive = isSelected && !!onRegionUpdate;

                            // Rect: interactive drag/resize when element is selected
                            if (interactive && region.shape === 'rect' && region.coords.length >= 4) {
                                const [rx, ry, rw, rh] = region.coords;
                                return (
                                    <ResizableDraggable
                                        key={region.id}
                                        x={rx}
                                        y={ry}
                                        width={rw}
                                        height={rh}
                                        anchorX={0}
                                        anchorY={0}
                                        parentSize={elementPixelSize}
                                        isSelected={isRegionSelected}
                                        onSelect={(e) => { e.stopPropagation(); onSelectRegion?.(idx); }}
                                        onUpdate={(u) => onRegionUpdate!(idx, [u.x, u.y, u.width, u.height])}
                                        snapGrid={1}
                                        label={region.name}
                                    >
                                        <div
                                            className="w-full h-full"
                                            style={{
                                                backgroundColor: isRegionSelected
                                                    ? (region.highlightColor || 'rgba(16,185,129,0.4)')
                                                    : (region.highlightColor || 'rgba(16,185,129,0.25)'),
                                                border: isRegionSelected
                                                    ? '2px solid rgba(16,185,129,0.9)'
                                                    : '1px solid rgba(16,185,129,0.6)',
                                            }}
                                        >
                                            <span className="absolute top-0 left-0 text-[7px] text-emerald-300 bg-emerald-800/60 px-0.5 rounded-br">{region.name}</span>
                                        </div>
                                    </ResizableDraggable>
                                );
                            }

                            // Circle: interactive drag/resize via bounding-box mapping
                            if (interactive && region.shape === 'circle' && region.coords.length >= 3) {
                                const [cx, cy, r] = region.coords;
                                const boxSize = r * 2;
                                return (
                                    <ResizableDraggable
                                        key={region.id}
                                        x={cx - r}
                                        y={cy - r}
                                        width={boxSize}
                                        height={boxSize}
                                        anchorX={0}
                                        anchorY={0}
                                        parentSize={elementPixelSize}
                                        isSelected={isRegionSelected}
                                        onSelect={(e) => { e.stopPropagation(); onSelectRegion?.(idx); }}
                                        onUpdate={(u) => {
                                            const diameter = Math.max(2, Math.max(u.width, u.height));
                                            const newR = diameter / 2;
                                            const newCx = u.x + u.width / 2;
                                            const newCy = u.y + u.height / 2;
                                            onRegionUpdate!(idx, [
                                                Math.round(newCx * 10) / 10,
                                                Math.round(newCy * 10) / 10,
                                                Math.round(newR * 10) / 10,
                                            ]);
                                        }}
                                        snapGrid={1}
                                        label={region.name}
                                    >
                                        <div
                                            className="w-full h-full"
                                            style={{
                                                backgroundColor: isRegionSelected
                                                    ? (region.highlightColor || 'rgba(16,185,129,0.4)')
                                                    : (region.highlightColor || 'rgba(16,185,129,0.25)'),
                                                border: isRegionSelected
                                                    ? '2px solid rgba(16,185,129,0.9)'
                                                    : '1px solid rgba(16,185,129,0.6)',
                                                borderRadius: '50%',
                                            }}
                                        >
                                            <span className="absolute top-0 left-0 text-[7px] text-emerald-300 bg-emerald-800/60 px-0.5 rounded-br">{region.name}</span>
                                        </div>
                                    </ResizableDraggable>
                                );
                            }

                            // Polygon: interactive vertex/body drag
                            if (interactive && region.shape === 'poly' && region.coords.length >= 4) {
                                return (
                                    <PolyRegionOverlay
                                        key={region.id}
                                        region={region}
                                        parentSize={elementPixelSize}
                                        isRegionSelected={isRegionSelected}
                                        onSelect={() => onSelectRegion?.(idx)}
                                        onUpdate={(coords) => onRegionUpdate!(idx, coords)}
                                    />
                                );
                            }

                            // Static polygon (element not selected): SVG overlay
                            if (region.shape === 'poly' && region.coords.length >= 4) {
                                const polyPoints: string[] = [];
                                for (let i = 0; i + 1 < region.coords.length; i += 2) {
                                    polyPoints.push(`${region.coords[i] ?? 0},${region.coords[i + 1] ?? 0}`);
                                }
                                return (
                                    <svg
                                        key={region.id}
                                        className="absolute inset-0 pointer-events-none"
                                        style={{ width: '100%', height: '100%' }}
                                        viewBox="0 0 100 100"
                                        preserveAspectRatio="none"
                                    >
                                        <polygon
                                            points={polyPoints.join(' ')}
                                            fill={region.highlightColor || 'rgba(16,185,129,0.25)'}
                                            stroke="rgba(16,185,129,0.6)"
                                            strokeWidth={1.5}
                                            vectorEffect="non-scaling-stroke"
                                        >
                                            <title>{region.tooltip || region.name}</title>
                                        </polygon>
                                    </svg>
                                );
                            }

                            // Non-interactive (or fallback) overlay for rect/circle
                            const style: React.CSSProperties = {
                                position: 'absolute',
                                backgroundColor: region.highlightColor || 'rgba(16,185,129,0.25)',
                                border: '1px solid rgba(16,185,129,0.6)',
                                cursor: isSelected ? 'pointer' : 'default',
                                pointerEvents: isSelected ? 'auto' : 'none',
                            };
                            if (region.shape === 'rect') {
                                style.left = `${region.coords[0]}%`;
                                style.top = `${region.coords[1]}%`;
                                style.width = `${region.coords[2]}%`;
                                style.height = `${region.coords[3]}%`;
                            } else if (region.shape === 'circle') {
                                const r = region.coords[2];
                                style.left = `${region.coords[0] - r}%`;
                                style.top = `${region.coords[1] - r}%`;
                                style.width = `${r * 2}%`;
                                style.height = `${r * 2}%`;
                                style.borderRadius = '50%';
                            }
                            return (
                                <div key={region.id} style={style} title={region.tooltip || region.name}
                                    onClick={isSelected ? (e) => { e.stopPropagation(); onSelectRegion?.(idx); } : undefined}
                                >
                                    <span className="absolute top-0 left-0 text-[7px] text-emerald-300 bg-emerald-800/60 px-0.5 rounded-br">{region.name}</span>
                                </div>
                            );
                        })}
                        <div className="absolute bottom-0 right-0 bg-emerald-500/80 text-white text-[8px] px-1 rounded-tl">
                            Map ({(element.imageMapRegions || []).length})
                        </div>
                    </div>
                ) : imageUrl ? (
                    <img src={imageUrl} alt={element.name} className="w-full h-full object-contain" />
                ) : (
                    <div className="w-full h-full bg-purple-500/30 border-2 border-purple-400 border-dashed rounded flex items-center justify-center text-xs text-purple-300">
                        {element.name}
                    </div>
                )}
                {element.draggable && (
                    <div className="absolute top-0 right-0 bg-sky-500/80 text-white text-[8px] px-1 rounded-bl">
                        Drag
                    </div>
                )}
                {element.conditions && element.conditions.length > 0 && (
                    <div className="absolute top-0 left-0 bg-amber-500/80 text-white text-[8px] px-1 rounded-br">
                        IF
                    </div>
                )}
            </div>
        </ResizableDraggable>
    );
};
