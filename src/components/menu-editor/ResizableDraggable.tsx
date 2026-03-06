import React, { useState, useRef, useCallback, useEffect } from 'react';

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
}

const ResizableDraggable: React.FC<ResizableDraggableProps> = ({
    x, y, width, height, anchorX, anchorY, parentSize, isSelected, onSelect, onUpdate, children,
    snapGrid = 1, showSnapGuides, label, locked,
}) => {

    const ref = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState<string | null>(null);
    const [shiftHeld, setShiftHeld] = useState(false);
    const startPos = useRef({ x: 0, y: 0, width: 0, height: 0, mouseX: 0, mouseY: 0 });

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
        const dx = (e.clientX - startPos.current.mouseX) / parentSize.width * 100;
        const dy = (e.clientY - startPos.current.mouseY) / parentSize.height * 100;
        
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

        onUpdate({ x: newX, y: newY, width: Math.max(2, newWidth), height: Math.max(2, newHeight) });

    }, [isDragging, isResizing, parentSize, onUpdate, snapGrid]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setIsResizing(null);
    }, []);

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

    // Safely handle potential NaN values
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    const safeWidth = Number.isFinite(width) && width > 0 ? width : 10;
    const safeHeight = Number.isFinite(height) && height > 0 ? height : 10;
    const safeAnchorX = Number.isFinite(anchorX) ? anchorX : 0;
    const safeAnchorY = Number.isFinite(anchorY) ? anchorY : 0;

    const style: React.CSSProperties = {
        position: 'absolute',
        left: `${safeX}%`, top: `${safeY}%`,
        width: `${safeWidth}%`, height: `${safeHeight}%`,
        transform: `translate(-${safeAnchorX * 100}%, -${safeAnchorY * 100}%)`,
        cursor: locked ? 'default' : isDragging ? 'grabbing' : 'grab',
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
        <div ref={ref} style={style} onMouseDown={(e) => handleMouseDown(e, 'drag')}>
            <div className={`relative w-full h-full ${isSelected ? 'outline outline-2 outline-sky-400 outline-offset-2' : ''}`}>
                <div style={{ pointerEvents: 'none', width: '100%', height: '100%' }}>
                    {children}
                </div>
                {/* Position / size label */}
                {isSelected && isInteracting && (
                    <div className="absolute -top-6 left-0 text-[10px] text-sky-300 bg-slate-900/80 px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none">
                        {Math.round(x * 10) / 10}%, {Math.round(y * 10) / 10}% &mdash; {Math.round(width * 10) / 10}% × {Math.round(height * 10) / 10}%
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
            </div>
        </div>
    );
};

export default ResizableDraggable;
