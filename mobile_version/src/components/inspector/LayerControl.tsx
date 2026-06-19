import React from 'react';
import { FormField, TextInput, RangeInput } from '../ui/Form';

/**
 * Stage/screen stacking-order control for the Transform group. A raw layer number plus
 * Bring-to-Front / Forward / Backward / Send-to-Back buttons. `siblings` is the effective
 * layer of the other items on the same surface (commands in the scene, elements on the
 * screen); when omitted, Front/Back fall back to ±1. Higher = nearer the viewer.
 */
export const LayerControl: React.FC<{
    value: number | undefined;
    siblings?: number[];
    onChange: (n: number) => void;
}> = ({ value, siblings, onChange }) => {
    const cur = value ?? 0;
    const pool = siblings && siblings.length ? [cur, ...siblings] : [cur];
    const max = Math.max(...pool);
    const min = Math.min(...pool);
    const btn = 'px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-[11px] whitespace-nowrap';
    return (
        <FormField label="Layer (stacking order)">
            <div className="flex items-center gap-1 flex-wrap">
                <TextInput type="number" value={cur} onChange={e => onChange(parseInt(e.target.value, 10) || 0)} style={{ width: '64px' }} />
                <button type="button" className={btn} title="Bring to front" onClick={() => onChange(max + 1)}>⤒ Front</button>
                <button type="button" className={btn} title="Forward one step" onClick={() => onChange(cur + 1)}>↑</button>
                <button type="button" className={btn} title="Backward one step" onClick={() => onChange(cur - 1)}>↓</button>
                <button type="button" className={btn} title="Send to back" onClick={() => onChange(min - 1)}>⤓ Back</button>
            </div>
        </FormField>
    );
};

/** Per-element/command parallax depth slider (0 = locked, higher = moves more). Only has a
 *  visible effect when the scene/screen's parallax setting is enabled. */
export const ParallaxDepthControl: React.FC<{
    value: number | undefined;
    onChange: (n: number) => void;
}> = ({ value, onChange }) => {
    const v = value ?? 0;
    return (
        <FormField label="Parallax depth">
            <div className="flex items-center gap-2">
                <RangeInput min="0" max="2" step="0.05" value={v} onChange={e => onChange(parseFloat(e.target.value) || 0)} className="flex-1" />
                <span className="text-[11px] text-[var(--text-secondary)] w-9 text-right">{v.toFixed(2)}</span>
            </div>
        </FormField>
    );
};

export default LayerControl;
