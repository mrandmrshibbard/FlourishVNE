import React, { useState, useRef, useCallback, useEffect } from 'react';
import { snapRect, insetRect, SnapRect, SnapGuide } from '../../utils/canvasSnap';

/** Snap a value to the nearest grid line when shift is held */
function snapToGrid(value: number, gridSize: number, shiftHeld: boolean): number {
    if (!shiftHeld) return value;
    return Math.round(value / gridSize) * gridSize;
}

export interface ResizableDraggableProps {
    x: number; y: number; width: number; height: number;
    anchorX: number; anchorY: number;
    parentSize: { width: number; height: number };
    isSelected: boolean;
    onSelect: (e: React.MouseEvent) => void;
    onUpdate: (updates: { x: number; y: number; width: number; height: number }) => void;
    children: React.ReactNode;
    /** Grid size in % for snap-to-grid (default 1). Hold Shift while dragging to snap. */
    snapGrid?: number;
    /** When true, render dashed grid lines on the canvas while dragging with Shift held */
    showSnapGuides?: boolean;
    /** Label shown above the element when selected */
    label?: string;
    /** If true, element cannot be dragged or resized */
    locked?: boolean;
    /** If true, children can receive pointer events (for nested interactive content) */
    allowChildInteraction?: boolean;
    /** Right-click handler (used to open the element radial menu). */
    onContextMenu?: (e: React.MouseEvent) => void;
    /** Stacking order on the canvas (mirrors the element's `layer`). */
    zIndex?: number;
    /** Other elements' VISUAL top-left rects (in % of the canvas) for smart alignment snapping. */
    siblings?: SnapRect[];
    /** Smart snapping on/off (default on). Hold Alt while dragging to bypass per-interaction. */
    snapEnabled?: boolean;
    /** Lifts the live alignment-guide lines up so the parent can draw them at canvas level. */
    onGuides?: (guides: SnapGuide[]) => void;
    /** Visible content box (inset fractions). When set, DRAG snapping aligns by the visible content
     *  region instead of the full element box. */
    contentBox?: { left: number; top: number; right: number; bottom: number };
    /** Extra overlay rendered inside the element box, OUTSIDE the pointer-events-gated children
     *  wrapper (so its own handles can receive events) — used for the on-canvas content-box editor. */
    overlay?: React.ReactNode;
    /** CSS transform applied to the CONTENT only (element rotation/flip preview). The drag box,
     *  outline, and resize handles stay axis-aligned so the element remains easy to grab. */
    contentTransform?: string;
    /** Rotate the WHOLE box — outline, handles and content together — in degrees, about the box
     *  centre (matching the runtime's transform origin). Rotation lives out here rather than in
     *  contentTransform so the selection chrome follows the element; flips stay on the content,
     *  because mirroring the box would mirror the resize-handle semantics too. */
    rotationDeg?: number;
}

const ResizableDraggable: React.FC<ResizableDraggableProps> = ({
    x, y, width, height, anchorX, anchorY, parentSize, isSelected, onSelect, onUpdate, children,
    snapGrid = 1, showSnapGuides, label, locked, allowChildInteraction, onContextMenu, zIndex,
    siblings, snapEnabled = true, onGuides, contentBox, overlay, contentTransform, rotationDeg,
}) => {

    const ref = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState<string | null>(null);
    const [shiftHeld, setShiftHeld] = useState(false);
    const startPos = useRef({ x: 0, y: 0, width: 0, height: 0, mouseX: 0, mouseY: 0 });
    // Live geometry during an active drag/resize. Driven by mousemove and rendered locally so
    // ONLY this element re-renders per move — onUpdate (a full project dispatch that re-renders
    // the whole editor) fires once, on release. Without this every mousemove dispatched globally,
    // which made dragging/resizing elements (and meters) lag. Also collapses a drag into ONE undo step.
    const [liveRect, setLiveRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const liveRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

    // Track shift key state globally while interacting
    useEffect(() => {
        if (!isDragging && !isResizing) return;
        const onKey = (e: KeyboardEvent) => setShiftHeld(e.shiftKey);
        window.addEventListener('keydown', onKey);
        window.addEventListener('keyup', onKey);
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
    }, [isDragging, isResizing]);

    const handleMouseDown = useCallback((e: React.MouseEvent, action: 'drag' | string) => {
        if (locked) return;
        e.preventDefault();
        e.stopPropagation();
        onSelect(e);
        setShiftHeld(e.shiftKey);
        
        startPos.current = {
            x, y, width, height,
            mouseX: e.clientX,
            mouseY: e.clientY,
        };

        if (action === 'drag') {
            setIsDragging(true);
        } else {
            setIsResizing(action);
        }
    }, [x, y, width, height, onSelect, locked]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging && !isResizing) return;
        if (!parentSize.width || !parentSize.height) return;
        
        const isSnapping = e.shiftKey;
        const grid = snapGrid;
        let dx = (e.clientX - startPos.current.mouseX) / parentSize.width * 100;
        let dy = (e.clientY - startPos.current.mouseY) / parentSize.height * 100;
        if (isResizing && rotationDeg) {
            // Map the pointer delta into the box's local (rotated) axes, so each handle keeps
            // meaning "this edge" however the box is turned.
            const rad = (-rotationDeg * Math.PI) / 180;
            const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
            const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
            dx = rx; dy = ry;
        }
        
        let newX = startPos.current.x;
        let newY = startPos.current.y;
        let newWidth = startPos.current.width;
        let newHeight = startPos.current.height;

        if (isDragging) {
            newX = startPos.current.x + dx;
            newY = startPos.current.y + dy;
            newX = snapToGrid(newX, grid, isSnapping);
            newY = snapToGrid(newY, grid, isSnapping);
        }

        if (isResizing) {
            if (isResizing.includes('r')) newWidth = startPos.current.width + dx;
            if (isResizing.includes('l')) { newWidth = startPos.current.width - dx; newX = startPos.current.x + dx; }
            if (isResizing.includes('b')) newHeight = startPos.current.height + dy;
            if (isResizing.includes('t')) { newHeight = startPos.current.height - dy; newY = startPos.current.y + dy; }
            newWidth = snapToGrid(newWidth, grid, isSnapping);
            newHeight = snapToGrid(newHeight, grid, isSnapping);
            if (isSnapping) {
                if (isResizing.includes('l')) newX = startPos.current.x + startPos.current.width - newWidth;
                if (isResizing.includes('t')) newY = startPos.current.y + startPos.current.height - newHeight;
            }
        }

        let next = { x: newX, y: newY, width: Math.max(2, newWidth), height: Math.max(2, newHeight) };

        // Smart alignment snapping (default on; Shift = legacy grid above takes precedence; Alt bypasses).
        // Snaps to canvas edges/center even with no siblings; sibling alignment when provided.
        if (!isSnapping && snapEnabled && !e.altKey) {
            // Use SAFE anchors here: an undefined anchor (common on buttons) would make
            // `anchor * width` NaN, which silently kills both the snap AND the guide lines.
            const aX = Number.isFinite(anchorX) ? anchorX : 0;
            const aY = Number.isFinite(anchorY) ? anchorY : 0;
            // Convert the anchor-based geometry to the element's VISUAL top-left rect.
            const vx = next.x - aX * next.width;
            const vy = next.y - aY * next.height;
            if (isDragging && contentBox) {
                // Snap by the VISIBLE content rect, then apply the positional delta back (move only).
                const full = { x: vx, y: vy, width: next.width, height: next.height };
                const content = insetRect(full, contentBox);
                const res = snapRect(content, siblings || [], { mode: 'move' });
                next = { ...next, x: next.x + (res.rect.x - content.x), y: next.y + (res.rect.y - content.y) };
                onGuides?.(res.guides);
            } else {
                const res = snapRect(
                    { x: vx, y: vy, width: next.width, height: next.height },
                    siblings || [],
                    { mode: isDragging ? 'move' : 'resize', activeEdges: typeof isResizing === 'string' ? isResizing : '' },
                );
                next = {
                    x: res.rect.x + aX * res.rect.width,
                    y: res.rect.y + aY * res.rect.height,
                    width: res.rect.width,
                    height: res.rect.height,
                };
                onGuides?.(res.guides);
            }
        } else {
            onGuides?.([]);
        }

        liveRectRef.current = next;
        setLiveRect(next);

    }, [isDragging, isResizing, parentSize, snapGrid, snapEnabled, siblings, anchorX, anchorY, onGuides, contentBox]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setIsResizing(null);
        onGuides?.([]);
        // Commit the final geometry once (single dispatch + single undo step).
        const final = liveRectRef.current;
        liveRectRef.current = null;
        setLiveRect(null);
        if (final) onUpdate(final);
    }, [onUpdate, onGuides]);

    useEffect(() => {
        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

    // During an active drag/resize, render from the local live geometry (no global dispatch yet).
    const eff = liveRect ?? { x, y, width, height };
    // Safely handle potential NaN values
    const safeX = Number.isFinite(eff.x) ? eff.x : 0;
    const safeY = Number.isFinite(eff.y) ? eff.y : 0;
    const safeWidth = Number.isFinite(eff.width) && eff.width > 0 ? eff.width : 10;
    const safeHeight = Number.isFinite(eff.height) && eff.height > 0 ? eff.height : 10;
    const safeAnchorX = Number.isFinite(anchorX) ? anchorX : 0;
    const safeAnchorY = Number.isFinite(anchorY) ? anchorY : 0;

    const style: React.CSSProperties = {
        position: 'absolute',
        left: `${safeX}%`, top: `${safeY}%`,
        width: `${safeWidth}%`, height: `${safeHeight}%`,
        transform: `translate(-${safeAnchorX * 100}%, -${safeAnchorY * 100}%)${rotationDeg ? ` rotate(${rotationDeg}deg)` : ''}`,
        cursor: locked ? 'default' : isDragging ? 'grabbing' : 'grab',
        zIndex,
    };

    const handleClasses = "absolute bg-sky-400 border border-slate-900 rounded-full";
    const resizeHandles = [
        { pos: 't', cursor: 'ns-resize', style: { top: -4, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, cursor: 'ns-resize' } },
        { pos: 'b', cursor: 'ns-resize', style: { bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, cursor: 'ns-resize' } },
        { pos: 'l', cursor: 'ew-resize', style: { left: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, cursor: 'ew-resize' } },
        { pos: 'r', cursor: 'ew-resize', style: { right: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, cursor: 'ew-resize' } },
        { pos: 'tl', cursor: 'nwse-resize', style: { top: -4, left: -4, width: 8, height: 8, cursor: 'nwse-resize' } },
        { pos: 'tr', cursor: 'nesw-resize', style: { top: -4, right: -4, width: 8, height: 8, cursor: 'nesw-resize' } },
        { pos: 'bl', cursor: 'nesw-resize', style: { bottom: -4, left: -4, width: 8, height: 8, cursor: 'nesw-resize' } },
        { pos: 'br', cursor: 'nwse-resize', style: { bottom: -4, right: -4, width: 8, height: 8, cursor: 'nwse-resize' } },
    ];

    const isInteracting = isDragging || !!isResizing;

    return (
        <div ref={ref} style={style} onMouseDown={(e) => handleMouseDown(e, 'drag')} onContextMenu={onContextMenu}>
            <div className={`relative w-full h-full ${isSelected ? 'outline outline-2 outline-sky-400 outline-offset-2' : ''}`}>
                <div style={{ pointerEvents: allowChildInteraction ? 'auto' : 'none', width: '100%', height: '100%', ...(contentTransform ? { transform: contentTransform } : {}) }}>
                    {children}
                </div>
                {/* Position / size label */}
                {isSelected && isInteracting && (
                    <div className="absolute -top-6 left-0 text-[10px] text-sky-300 bg-slate-900/80 px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none">
                        {Math.round(eff.x * 10) / 10}%, {Math.round(eff.y * 10) / 10}% &mdash; {Math.round(eff.width * 10) / 10}% × {Math.round(eff.height * 10) / 10}%
                        {shiftHeld && <span className="ml-1 text-amber-300">[SNAP]</span>}
                    </div>
                )}
                {/* Element label */}
                {isSelected && !isInteracting && label && (
                    <div className="absolute -top-5 left-0 text-[10px] text-sky-300 bg-slate-900/80 px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none">
                        {label}
                    </div>
                )}
                {isSelected && !locked && (
                    <>
                        {resizeHandles.map(handle => (
                            <div
                                key={handle.pos}
                                className={handleClasses}
                                style={handle.style as React.CSSProperties}
                                onMouseDown={(e) => handleMouseDown(e, handle.pos)}
                            />
                        ))}
                    </>
                )}
                {/* Extra overlay (e.g. content-box editor) — outside the children wrapper so its own
                    handles receive pointer events. It manages its own pointer-events internally. */}
                {overlay}
            </div>
        </div>
    );
};

export default ResizableDraggable;
