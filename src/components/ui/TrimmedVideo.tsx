import React, { useRef, useEffect } from 'react';

/**
 * A <video> that plays only a [trimStart, trimEnd] slice of its source, so one long
 * video file can back many different clips. Drop-in for raw <video>: forwards every
 * standard video prop/ref.
 *
 * Behaviour:
 *  - Seeks to `trimStart` on load (and shows that frame immediately — never a frozen 0:00
 *    frame for a trimmed thumbnail).
 *  - When it reaches `trimEnd`: if `loop` is set it jumps back to `trimStart` (loops the
 *    SEGMENT, not the whole file); otherwise it pauses on the last trimmed frame.
 *  - With no trim set it behaves exactly like a normal <video> (native loop etc.).
 *
 * Native `loop` is disabled whenever a trim is active because the browser's loop replays
 * the WHOLE file from 0 — we re-loop the segment ourselves via the timeupdate/ended hooks.
 */
export interface TrimmedVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
    src?: string;
    trimStart?: number | null;
    trimEnd?: number | null;
    /** Fires when a NON-looping clip reaches `trimEnd` (the native `ended` event won't fire, since
     *  the video is paused before its real end). Pair with onEnded to cover trimmed + untrimmed. */
    onSegmentEnd?: () => void;
}

const TrimmedVideo = React.forwardRef<HTMLVideoElement, TrimmedVideoProps>(
    ({ src, trimStart, trimEnd, loop, onSegmentEnd, children, ...rest }, externalRef) => {
        const innerRef = useRef<HTMLVideoElement | null>(null);
        const setRefs = (el: HTMLVideoElement | null) => {
            innerRef.current = el;
            if (typeof externalRef === 'function') externalRef(el);
            else if (externalRef) (externalRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
        };

        const start = (trimStart != null && trimStart > 0) ? trimStart : 0;
        const end = (trimEnd != null && trimEnd > start) ? trimEnd : undefined;
        const trimmed = start > 0 || end != null;

        useEffect(() => {
            const el = innerRef.current;
            if (!el || !trimmed) return;
            const seekToStart = () => { try { el.currentTime = start; } catch { /* not seekable yet */ } };
            const onMeta = () => seekToStart();
            let firedSegmentEnd = false;
            const onTime = () => {
                if (end != null && el.currentTime >= end) {
                    if (loop) { try { el.currentTime = start; const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch { /* no-op */ } }
                    else { try { el.pause(); el.currentTime = end; } catch { /* no-op */ } if (!firedSegmentEnd) { firedSegmentEnd = true; onSegmentEnd?.(); } }
                } else if (start > 0 && el.currentTime < start - 0.3) {
                    // A native restart (or scrub) dropped us before the segment — snap back.
                    seekToStart();
                }
            };
            const onEnded = () => { if (loop) { seekToStart(); const p = el.play(); if (p && p.catch) p.catch(() => {}); } };
            if (el.readyState >= 1) seekToStart();
            el.addEventListener('loadedmetadata', onMeta);
            el.addEventListener('timeupdate', onTime);
            el.addEventListener('ended', onEnded);
            return () => {
                el.removeEventListener('loadedmetadata', onMeta);
                el.removeEventListener('timeupdate', onTime);
                el.removeEventListener('ended', onEnded);
            };
        }, [src, start, end, loop, trimmed, onSegmentEnd]);

        // Native loop must be off when trimming (it would replay the whole file from 0).
        const nativeLoop = trimmed ? false : loop;

        return <video ref={setRefs} src={src} loop={nativeLoop} {...rest}>{children}</video>;
    }
);

TrimmedVideo.displayName = 'TrimmedVideo';
export default TrimmedVideo;
