import React, { useState, useRef, useCallback, useEffect } from 'react';

const ResizableDraggable: React.FC<{
    x: number; y: number; width: number; height: number;
    anchorX: number; anchorY: number;
    parentSize: { width: number; height: number };
    isSelected: boolean;
    onSelect: (e: React.MouseEvent) => void;
    onUpdate: (updates: { x: number; y: number; width: number; height: number }) => void;
    children: React.ReactNode;
}> = ({ x, y, width, height, anchorX, anchorY, parentSize, isSelected, onSelect, onUpdate, children }) => {

    const ref = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState<string | null>(null);
    const startPos = useRef({ x: 0, y: 0, width: 0, height: 0, mouseX: 0, mouseY: 0 });

    const handleMouseDown = useCallback((e: React.MouseEvent, action: 'drag' | string) => {
        e.preventDefault();
        onSelect(e);
        
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
    }, [x, y, width, height, onSelect]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging && !isResizing) return;
        if (!parentSize.width || !parentSize.height) return;
        
        const dx = (e.clientX - startPos.current.mouseX) / parentSize.width * 100;
        const dy = (e.clientY - startPos.current.mouseY) / parentSize.height * 100;
        
        let newX = startPos.current.x;
        let newY = startPos.current.y;
        let newWidth = startPos.current.width;
        let newHeight = startPos.current.height;

        if (isDragging) {
            newX = startPos.current.x + dx;
            newY = startPos.current.y + dy;
        }

        if (isResizing) {
            if (isResizing.includes('r')) newWidth = startPos.current.width + dx;
            if (isResizing.includes('l')) { newWidth = startPos.current.width - dx; newX = startPos.current.x + dx; }
            if (isResizing.includes('b')) newHeight = startPos.current.height + dy;
            if (isResizing.includes('t')) { newHeight = startPos.current.height - dy; newY = startPos.current.y + dy; }
        }

        onUpdate({ x: newX, y: newY, width: Math.max(2, newWidth), height: Math.max(2, newHeight) });

    }, [isDragging, isResizing, parentSize, onUpdate]);

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
        cursor: isDragging ? 'grabbing' : 'grab',
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

    return (
        <div ref={ref} style={style} onMouseDown={(e) => handleMouseDown(e, 'drag')}>
            <div className={`relative w-full h-full ${isSelected ? 'outline outline-2 outline-sky-400 outline-offset-2' : ''}`}>
                <div style={{ pointerEvents: 'none', width: '100%', height: '100%' }}>
                    {children}
                </div>
                {isSelected && (
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
