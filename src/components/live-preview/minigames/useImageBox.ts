import { useEffect, useMemo, useState } from 'react';

/**
 * Contain-fit letterbox math shared by mini-game surfaces AND their placement editors
 * (extracted from MapEditor's canvas so on-canvas placement and runtime hit-testing always
 * agree: hotspot % coordinates are % OF THE IMAGE BOX, not of the host).
 *
 * Returns the image's box in px within the host (falls back to the full host until the
 * image's natural size is known — same behavior as MapEditor).
 */
export interface ImageBox { left: number; top: number; width: number; height: number; }

export function useImageBox(hostRef: { current: HTMLDivElement | null }, url: string | null): ImageBox {
    const [hostSize, setHostSize] = useState({ w: 0, h: 0 });
    const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

    useEffect(() => {
        const el = hostRef.current;
        if (!el) return;
        const obs = new ResizeObserver(() => setHostSize({ w: el.clientWidth, h: el.clientHeight }));
        obs.observe(el);
        setHostSize({ w: el.clientWidth, h: el.clientHeight });
        return () => obs.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hostRef.current]);

    useEffect(() => {
        setNatural(null);
        if (!url) return;
        let live = true;
        const img = new Image();
        img.onload = () => { if (live) setNatural({ w: img.naturalWidth || 16, h: img.naturalHeight || 9 }); };
        img.src = url;
        return () => { live = false; };
    }, [url]);

    return useMemo(() => {
        if (!hostSize.w || !hostSize.h) return { left: 0, top: 0, width: 0, height: 0 };
        if (!natural) return { left: 0, top: 0, width: hostSize.w, height: hostSize.h };
        const scale = Math.min(hostSize.w / natural.w, hostSize.h / natural.h);
        const w = natural.w * scale, h = natural.h * scale;
        return { left: (hostSize.w - w) / 2, top: (hostSize.h - h) / 2, width: w, height: h };
    }, [hostSize, natural]);
}
