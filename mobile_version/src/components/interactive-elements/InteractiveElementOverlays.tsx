/**
 * InteractiveElementOverlays
 * ──────────────────────────
 * Canvas-overlay components for hot spots, image-map regions, and interactive
 * elements (draggable images / buttons / text / etc.) on a regular screen.
 *
 * The external API is typed against the unified `VNUIElement` types; internally
 * the element overlay converts to the legacy `VNHotZoneElement` runtime layout
 * so the per-type JSX can render unchanged — an implementation detail only.
 */
import React, { useMemo } from 'react';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import {
    VNUIElement,
    UIElementType,
    UIHotSpotElement,
    UIdraggableImageElementElement,
    UIImageElement,
    UIButtonElement,
    UITextElement,
    UITextInputElement,
    VNHotZoneElement,
    HotSpotTrigger,
} from '../../features/ui/types';
import { draggableImageElementRegion } from '../../features/scene/types';
import ResizableDraggable from '../menu-editor/ResizableDraggable';
import { buildOrientationTransform } from '../../utils/styleUtils';
import { PolygonShapeSVG, PolygonVertexEditor } from './HotSpotDrawTools';

/** Renders a Hot Spot overlay on the canvas. Takes a unified `UIHotSpotElement`
 *  directly — its field layout matches the legacy `VNHotSpot` so no conversion
 *  is needed. */
export const HotSpotOverlay: React.FC<{
    spot: UIHotSpotElement;
    isSelected: boolean;
    parentSize: { width: number; height: number };
    onSelect: (e: React.MouseEvent) => void;
    onUpdate: (updates: { x?: number; y?: number; width?: number; height?: number; points?: number[] }) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    /** "✏ Draw again" for drawn shapes — enters trace mode (provided by the host editor). */
    onRequestDraw?: () => void;
    zIndex?: number;
}> = ({ spot, isSelected, parentSize, onSelect, onUpdate, onContextMenu, onRequestDraw, zIndex }) => {
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

    const isPoly = spot.shape === 'poly' && (spot.points?.length ?? 0) >= 6;
    const flipTransform = buildOrientationTransform({ flipX: (spot as any).flipX, flipY: (spot as any).flipY }) || undefined;
    // The element's on-canvas pixel size — the vertex editor needs it for delta math.
    const spotPixelSize = {
        width: (parentSize.width * spot.width) / 100,
        height: (parentSize.height * spot.height) / 100,
    };

    return (
        <ResizableDraggable
            x={spot.x}
            y={spot.y}
            width={spot.width}
            height={spot.height}
            anchorX={0}
            anchorY={0}
            // Rotation on the BOX (outline + handles follow); flips on the content.
            rotationDeg={(spot as any).rotation || undefined}
            contentTransform={flipTransform}
            parentSize={parentSize}
            isSelected={isSelected}
            onSelect={onSelect}
            onUpdate={onUpdate}
            onContextMenu={onContextMenu}
            zIndex={zIndex}
            snapGrid={1}
            // The drawn-shape vertex layer needs its own pointer events; it lives in `overlay`
            // (outside the pointer-events-gated children wrapper), same as the content-box editor.
            overlay={isPoly && isSelected ? (
                // Wrap in the same flip transform as the content so handles land ON the flipped
                // shape; rotation is already applied by the outer box.
                <div className="absolute inset-0" style={{ transform: flipTransform, pointerEvents: 'none' }}>
                    <PolygonVertexEditor
                        points={spot.points!}
                        parentSize={spotPixelSize}
                        selected
                        fill="transparent"
                        stroke="transparent"
                        rotationDeg={(spot as any).rotation || undefined}
                        flipX={(spot as any).flipX}
                        flipY={(spot as any).flipY}
                        onCommit={points => onUpdate({ points })}
                    />
                    {onRequestDraw && (
                        <button
                            type="button"
                            className="absolute -top-5 right-0 text-[10px] bg-slate-900/80 text-sky-300 hover:text-white px-1.5 py-0.5 rounded whitespace-nowrap"
                            style={{ pointerEvents: 'auto', zIndex: 60 }}
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); onRequestDraw(); }}
                        >
                            ✏
                        </button>
                    )}
                </div>
            ) : undefined}
        >
            {isPoly ? (
                // Drawn shape: the SVG preview replaces the border-box look. Rendered as content
                // (inside rotation + flips) so it matches the runtime clip-path exactly.
                <div className="w-full h-full relative flex items-center justify-center text-xs font-bold" style={{ color: borderColors[spot.trigger] }}>
                    <PolygonShapeSVG
                        points={spot.points!}
                        fill={triggerColors[spot.trigger]}
                        stroke={borderColors[spot.trigger]}
                    />
                    <span className="relative pointer-events-none">{spot.name}</span>
                </div>
            ) : (
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
            )}
        </ResizableDraggable>
    );
};

/** Internal helper: map a unified `VNUIElement` (image / button / text /
 *  text-input / Interactive Image / draggable image) into the legacy
 *  `VNHotZoneElement` shape that InteractiveElementOverlay's body renders.
 *  Kept private to this module so the component has a typed external API. */
function toLegacyHotZoneElement(el: VNUIElement, items?: Record<string, any>): VNHotZoneElement | null {
    const anyEl = el as any;
    switch (el.type) {
        case UIElementType.Item: {
            // Draggable ITEM element → image-shaped draggable wearing the item's icon (mirrors the
            // runtime adapter in utils/interactiveElements.ts — keep the two in sync).
            const item = anyEl.itemId ? items?.[anyEl.itemId] : undefined;
            const iconIsVideo = item?.icon?.type === 'video';
            return {
                id: el.id, name: el.name,
                elementType: iconIsVideo ? 'video' : 'image',
                imageId: (!iconIsVideo ? (item?.icon?.id ?? '') : '') as VNID,
                videoId: iconIsVideo ? item?.icon?.id : undefined,
                x: el.x, y: el.y, width: el.width, height: el.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack ?? true,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: el.conditions, actions: anyEl.actions,
                clickSoundId: anyEl.clickSoundId, hoverSoundId: anyEl.hoverSoundId,
            };
        }
        case UIElementType.draggableImageElement: {
            const m = el as UIdraggableImageElementElement;
            return {
                id: m.id, name: m.name, elementType: 'draggableImageElement',
                imageId: (m.image?.id ?? '') as VNID,
                hoverImageId: m.hoverImage?.id,
                draggableImageElementRegions: m.draggableImageElementRegions,
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

/** Polygon region overlay with per-vertex drag handles and body drag-to-move.
 *  Thin wrapper: the guts moved to the shared PolygonVertexEditor (HotSpotDrawTools),
 *  which drawn-shape hot spots reuse. Behavior for image maps is unchanged, plus the
 *  editor's extras (double-click an edge to add a point, double-click/right-click a
 *  point to remove it). */
export const PolyRegionOverlay: React.FC<{
    region: draggableImageElementRegion;
    parentSize: { width: number; height: number };
    isRegionSelected: boolean;
    onSelect: () => void;
    onUpdate: (coords: number[]) => void;
}> = ({ region, parentSize, isRegionSelected, onSelect, onUpdate }) => (
    <PolygonVertexEditor
        points={region.coords}
        parentSize={parentSize}
        selected={isRegionSelected}
        fill={isRegionSelected
            ? (region.highlightColor || 'rgba(16,185,129,0.4)')
            : (region.highlightColor || 'rgba(16,185,129,0.25)')}
        stroke={isRegionSelected ? 'rgba(16,185,129,0.95)' : 'rgba(16,185,129,0.7)'}
        label={region.name}
        tooltip={region.tooltip || region.name}
        allowBodyDrag
        onSelect={onSelect}
        onCommit={onUpdate}
    />
);

/** Renders an interactive hot zone element (image / button / text / video /
 *  text input / Interactive Image / draggable) on the canvas. Takes a unified
 *  `VNUIElement` and converts to the legacy `VNHotZoneElement` layout
 *  internally so the existing per-type JSX can render unchanged. */
export const InteractiveElementOverlay: React.FC<{
    element: VNUIElement;
    project: VNProject;
    isSelected: boolean;
    parentSize: { width: number; height: number };
    onSelect: (e: React.MouseEvent) => void;
    onUpdate: (updates: { x?: number; y?: number; width?: number; height?: number }) => void;
    onRegionUpdate?: (regionIdx: number, coords: number[]) => void;
    selectedRegionIdx?: number | null;
    onSelectRegion?: (idx: number | null) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    zIndex?: number;
}> = ({ element: typedElement, project, isSelected, parentSize, onSelect, onUpdate, onRegionUpdate, selectedRegionIdx, onSelectRegion, onContextMenu, zIndex }) => {
    const element = toLegacyHotZoneElement(typedElement, project.items);
    if (!element) return null;
    const imageUrl = project.images[element.imageId]?.imageUrl ||
                     project.backgrounds[element.imageId]?.imageUrl;

    const elType = element.elementType || 'image';
    // A video asset can live in videos OR backgrounds/images (depends on the upload tab).
    const videoUrl = element.videoId
        ? (project.videos[element.videoId]?.videoUrl || (project.backgrounds[element.videoId] as any)?.videoUrl || (project.images[element.videoId] as any)?.videoUrl)
        : null;

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
            // 🔴 From typedElement, NOT `element`: toLegacyHotZoneElement is a typed field list
            // that strips rotation/flip — reading the converted object made this a silent no-op.
            rotationDeg={(typedElement as any).rotation || undefined}
            contentTransform={buildOrientationTransform({ flipX: (typedElement as any).flipX, flipY: (typedElement as any).flipY }) || undefined}
            parentSize={parentSize}
            isSelected={isSelected}
            onSelect={onSelect}
            onUpdate={onUpdate}
            onContextMenu={onContextMenu}
            zIndex={zIndex}
            snapGrid={1}
            allowChildInteraction={elType === 'draggableImageElement' && isSelected}
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
                ) : elType === 'draggableImageElement' ? (
                    <div className="w-full h-full relative">
                        {imageUrl ? (
                            <img src={imageUrl} alt={element.name} className="w-full h-full object-contain" />
                        ) : (
                            <div className="w-full h-full bg-emerald-500/20 border-2 border-emerald-400 border-dashed rounded" />
                        )}
                        {(element.draggableImageElementRegions || []).map((region, idx) => {
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
                            Map ({(element.draggableImageElementRegions || []).length})
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
