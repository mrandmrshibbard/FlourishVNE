/**
 * Hook to measure and track stage/container dimensions
 */

import React, { useState, useEffect } from 'react';
import { StageSize } from '../types/gameState';

export const useStageSize = (ref: React.RefObject<HTMLElement | null>) => {
    const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });
    
    useEffect(() => {
        if (!ref.current) return;
        
        const el = ref.current;
        const obs = new ResizeObserver(() => {
            const r = el.getBoundingClientRect();
            setSize({ width: r.width, height: r.height });
        });
        
        obs.observe(el);
        
        // Initial measure
        const r = el.getBoundingClientRect();
        setSize({ width: r.width, height: r.height });
        
        return () => obs.disconnect();
    }, [ref]);
    
    return size;
};
