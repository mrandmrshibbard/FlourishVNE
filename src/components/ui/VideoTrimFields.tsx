import React from 'react';

/**
 * Shared editor control for trimming a video to a [start, end] slice (seconds), so one
 * long video can be reused as many clips. Render it next to any video picker — ONLY when
 * the chosen asset is a video. Values are seconds (decimals allowed). Empty = no bound.
 *
 * Looping behaviour is owned by the surface's own loop flag; when that surface loops, it
 * loops THIS segment (handled by <TrimmedVideo>). The note reminds the author of that.
 */
const VideoTrimFields: React.FC<{
    start?: number | null;
    end?: number | null;
    onChange: (patch: { trimStart?: number; trimEnd?: number }) => void;
    /** Compact label above the two inputs. */
    label?: string;
    className?: string;
}> = ({ start, end, onChange, label = 'Trim (seconds)', className }) => {
    const parse = (v: string): number | undefined => {
        if (v === '') return undefined;
        const n = parseFloat(v);
        return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    const inputCls = 'w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-[var(--text-primary)]';
    return (
        <div className={className}>
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">{label}</div>
            <div className="grid grid-cols-2 gap-2">
                <label className="block">
                    <span className="block text-[10px] text-[var(--text-secondary)] mb-0.5">Start</span>
                    <input type="number" step="0.1" min="0" className={inputCls}
                        value={start ?? ''} placeholder="0"
                        onChange={e => onChange({ trimStart: parse(e.target.value) })} />
                </label>
                <label className="block">
                    <span className="block text-[10px] text-[var(--text-secondary)] mb-0.5">End</span>
                    <input type="number" step="0.1" min="0" className={inputCls}
                        value={end ?? ''} placeholder="(end of video)"
                        onChange={e => onChange({ trimEnd: parse(e.target.value) })} />
                </label>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">Plays only this slice. If the surface loops, it loops the slice.</p>
        </div>
    );
};

export default VideoTrimFields;
