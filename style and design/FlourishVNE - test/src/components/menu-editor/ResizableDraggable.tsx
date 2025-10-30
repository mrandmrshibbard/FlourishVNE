import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';

type Rect = { x: number; y: number; width: number; height: number };

const ResizableDraggable: React.FC<{
    x: number;
    y: number;
    width: number;
    height: number;
    anchorX: number;
    anchorY: number;
    parentSize: { width: number; height: number };
    isSelected: boolean;
    onSelect: (e: React.MouseEvent) => void;
    onUpdate: (updates: { x: number; y: number; width: number; height: number }) => void;
    children: React.ReactNode;
}> = ({ x, y, width, height, anchorX, anchorY, parentSize, isSelected, onSelect, onUpdate, children }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState<string | null>(null);
    const actionRef = useRef<{ type: 'drag' | 'resize' | null; resizeDir?: string }>({ type: null });
    const startPos = useRef({ x: 0, y: 0, width: 0, height: 0, mouseX: 0, mouseY: 0 });
    const draftRef = useRef<Rect | null>(null);
    const isActiveRef = useRef(false);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent, action: 'drag' | string) => {
            e.preventDefault();
            e.stopPropagation();
            onSelect(e);

            startPos.current = {
                x,
                y,
                width,
                height,
                mouseX: e.clientX,
                mouseY: e.clientY,
            };

            draftRef.current = null;
            isActiveRef.current = true;

            if (action === 'drag') {
                actionRef.current = { type: 'drag' };
                setIsDragging(true);
            } else {
                actionRef.current = { type: 'resize', resizeDir: action };
                setIsResizing(action);
            }
        },
        [x, y, width, height, onSelect]
    );

    useEffect(() => {
        if (!isDragging && !isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!actionRef.current.type) return;
            if (!parentSize.width || !parentSize.height) return;
            if (!ref.current) return;

            const dx = ((e.clientX - startPos.current.mouseX) / parentSize.width) * 100;
            const dy = ((e.clientY - startPos.current.mouseY) / parentSize.height) * 100;

            let newX = startPos.current.x;
            let newY = startPos.current.y;
            let newWidth = startPos.current.width;
            let newHeight = startPos.current.height;

            if (actionRef.current.type === 'drag') {
                newX = startPos.current.x + dx;
                newY = startPos.current.y + dy;
            } else if (actionRef.current.type === 'resize' && actionRef.current.resizeDir) {
                const dir = actionRef.current.resizeDir;
                if (dir.includes('r')) newWidth = startPos.current.width + dx;
                if (dir.includes('l')) {
                    newWidth = startPos.current.width - dx;
                    newX = startPos.current.x + dx;
                }
                if (dir.includes('b')) newHeight = startPos.current.height + dy;
                if (dir.includes('t')) {
                    newHeight = startPos.current.height - dy;
                    newY = startPos.current.y + dy;
                }
            }

            const nextRect: Rect = {
                x: newX,
                y: newY,
                width: Math.max(2, newWidth),
                height: Math.max(2, newHeight)
            };

            // Update DOM directly without triggering React re-render
            draftRef.current = nextRect;
            ref.current.style.left = `${nextRect.x}%`;
            ref.current.style.top = `${nextRect.y}%`;
            ref.current.style.width = `${nextRect.width}%`;
            ref.current.style.height = `${nextRect.height}%`;
        };

        const handleMouseUp = () => {
            const pendingRect = draftRef.current;

            if (pendingRect) {
                const hasChanged =
                    Math.abs(pendingRect.x - startPos.current.x) > 0.01 ||
                    Math.abs(pendingRect.y - startPos.current.y) > 0.01 ||
                    Math.abs(pendingRect.width - startPos.current.width) > 0.01 ||
                    Math.abs(pendingRect.height - startPos.current.height) > 0.01;

                if (hasChanged) {
                    onUpdate(pendingRect);
                }
            }

            actionRef.current = { type: null };
            isActiveRef.current = false;
            setIsDragging(false);
            setIsResizing(null);
            draftRef.current = null;
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, parentSize, onUpdate]);

    // Sync DOM with props when not actively dragging/resizing
    useLayoutEffect(() => {
        if (!ref.current || isActiveRef.current) return;
        
        ref.current.style.left = `${x}%`;
        ref.current.style.top = `${y}%`;
        ref.current.style.width = `${width}%`;
        ref.current.style.height = `${height}%`;
    }, [x, y, width, height]);

    // Initial style - only set once, then DOM updates handle changes
    const style: React.CSSProperties = {
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        height: `${height}%`,
        transform: `translate(-${anchorX * 100}%, -${anchorY * 100}%)`,
        cursor: isDragging ? 'grabbing' : 'grab',
    };

    const handleClasses = 'absolute bg-sky-400 border border-slate-900 rounded-full';
    const resizeHandles = [
        { pos: 't', style: { top: -4, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, cursor: 'ns-resize' } },
        { pos: 'b', style: { bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, cursor: 'ns-resize' } },
        { pos: 'l', style: { left: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, cursor: 'ew-resize' } },
        { pos: 'r', style: { right: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, cursor: 'ew-resize' } },
        { pos: 'tl', style: { top: -4, left: -4, width: 8, height: 8, cursor: 'nwse-resize' } },
        { pos: 'tr', style: { top: -4, right: -4, width: 8, height: 8, cursor: 'nesw-resize' } },
        { pos: 'bl', style: { bottom: -4, left: -4, width: 8, height: 8, cursor: 'nesw-resize' } },
        { pos: 'br', style: { bottom: -4, right: -4, width: 8, height: 8, cursor: 'nwse-resize' } },
    ];

    return (
        <div ref={ref} style={style} onMouseDown={(e) => handleMouseDown(e, 'drag')}>
            <div className={`relative w-full h-full ${isSelected ? 'outline outline-2 outline-sky-400 outline-offset-2' : ''}`}>
                <div style={{ pointerEvents: 'none', width: '100%', height: '100%' }}>{children}</div>
                {isSelected && (
                    <>
                        {resizeHandles.map((handle) => (
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
