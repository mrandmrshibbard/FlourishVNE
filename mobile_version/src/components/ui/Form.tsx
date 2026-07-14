import React, { useState, useRef, useCallback, useEffect } from 'react';

export const FormField: React.FC<{ label: string; children: React.ReactNode; hint?: string; accentColor?: string }> = ({ label, children, hint, accentColor }) => (
    <div className="mb-4">
        <label 
            className="block text-xs font-semibold mb-2 uppercase tracking-wider flex items-center gap-2"
            style={{ color: accentColor || 'var(--text-secondary)' }}
        >
            {accentColor && (
                <span 
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
                />
            )}
            {label}
        </label>
        {children}
        {hint && <p className="mt-1.5 text-xs text-[var(--text-muted)] leading-relaxed">{hint}</p>}
    </div>
);

// Common input styles - Enhanced with glassmorphism
const inputBaseStyles = `
    w-full 
    bg-[var(--bg-primary)]
    border border-[var(--border-default)] 
    rounded-xl
    px-4 py-2.5 
    text-sm
    text-[var(--text-primary)]
    placeholder-[var(--text-muted)]
    transition-all duration-200
    hover:border-[var(--border-strong)]
    focus:outline-none 
    focus:border-[var(--accent-lavender)] 
    focus:ring-2 
    focus:ring-[var(--accent-lavender)]/15
    focus:bg-[var(--bg-secondary)]
    shadow-[inset_0_2px_4px_rgba(0,0,0,0.15)]
`;

// FIX: Wrap TextInput in React.forwardRef to allow passing a ref to the underlying input element.
// Also, combine passed className with default styles instead of overwriting.
export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
    <input 
        {...props} 
        ref={ref} 
        className={`${inputBaseStyles} ${className || ''}`}
    />
));

// ── color-with-transparency helpers (for the non-coder-friendly `allowAlpha` mode) ──
// Parse a hex OR rgb()/rgba() string into a hex swatch color + a 0..1 alpha, so a non-coder can
// drive both from a swatch + a slider (no typing rgba() by hand).
const parseColorAlpha = (raw: string): { hex: string; alpha: number } => {
    const s = (raw || '').trim();
    const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (m) {
        const clamp255 = (n: number) => Math.max(0, Math.min(255, n));
        const hex = '#' + [+m[1], +m[2], +m[3]].map(n => clamp255(n).toString(16).padStart(2, '0')).join('');
        return { hex, alpha: m[4] != null ? Math.max(0, Math.min(1, +m[4])) : 1 };
    }
    let h = s.replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map(c => c + c).join('');
    if (/^[0-9a-fA-F]{6}$/.test(h)) return { hex: '#' + h.toLowerCase(), alpha: 1 };
    return { hex: '#000000', alpha: 1 };
};
const buildColorAlpha = (hex: string, alpha: number): string => {
    if (alpha >= 0.999) return hex;
    const h = hex.replace(/^#/, '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 100) / 100})`;
};

// Throttled color input — prevents lag when dragging the color picker.
// `allowAlpha` swaps the hex text box for a transparency slider (emits rgba() under the hood) so
// non-coders can set see-through colors without ever typing a value.
export const ColorInput: React.FC<{
    value: string;
    onChange: (value: string) => void;
    className?: string;
    disabled?: boolean;
    allowAlpha?: boolean;
}> = ({ value, onChange, className, disabled, allowAlpha }) => {
    const [localValue, setLocalValue] = useState(value); // normalized hex (drives the swatch)
    const [text, setText] = useState(value);             // raw text the user is typing (may be partial)
    const latestValueRef = useRef(value);
    const lastDispatchRef = useRef(0);
    const timeoutRef = useRef<number | null>(null);

    // Sync from parent when external value changes (e.g. undo/redo, switching elements)
    useEffect(() => {
        latestValueRef.current = value;
        setLocalValue(value);
        setText(value);
    }, [value]);

    // The native colour SWATCH fires a continuous stream of events while dragging. Each upstream
    // onChange is a full project dispatch that re-renders the editor, so we THROTTLE the swatch
    // commit to ~10/sec (then flush the final value). Typed hex commits immediately (not a drag).
    const THROTTLE_MS = 100;
    const commitThrottled = useCallback((newVal: string) => {
        latestValueRef.current = newVal;
        const now = performance.now();
        if (timeoutRef.current !== null) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        const elapsed = now - lastDispatchRef.current;
        if (elapsed >= THROTTLE_MS) {
            lastDispatchRef.current = now;
            onChange(newVal);
        } else {
            timeoutRef.current = window.setTimeout(() => {
                lastDispatchRef.current = performance.now();
                timeoutRef.current = null;
                onChange(latestValueRef.current);
            }, THROTTLE_MS - elapsed);
        }
    }, [onChange]);

    const handleSwatch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        setLocalValue(newVal);
        setText(newVal);
        commitThrottled(newVal);
    }, [commitThrottled]);

    const flush = useCallback(() => {
        if (timeoutRef.current !== null) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        if (latestValueRef.current !== value) onChange(latestValueRef.current);
    }, [onChange, value]);

    useEffect(() => () => { if (timeoutRef.current !== null) clearTimeout(timeoutRef.current); }, []);

    // ── Hex text entry (type or paste) ──
    // Normalizes "abc"/"#abc"/"aabbcc"/"#aabbcc" → "#aabbcc"; null if not a valid 3/6-digit hex.
    const normalizeHex = (raw: string): string | null => {
        let h = raw.trim().replace(/^#/, '');
        if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map(c => c + c).join('');
        if (/^[0-9a-fA-F]{6}$/.test(h)) return '#' + h.toLowerCase();
        return null;
    };
    const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        setText(raw);
        const norm = normalizeHex(raw);
        if (norm) { // commit once it's a complete, valid colour
            setLocalValue(norm);
            latestValueRef.current = norm;
            onChange(norm);
        }
    };
    const handleHexBlur = () => {
        const norm = normalizeHex(text);
        if (norm) {
            setText(norm);
            setLocalValue(norm);
            if (norm !== value) onChange(norm);
        } else {
            setText(value); // revert unparseable input
            setLocalValue(value);
        }
    };

    // Non-coder mode: a color swatch + a "how solid" transparency slider (no hex typing).
    if (allowAlpha) {
        const { hex: curHex, alpha: curAlpha } = parseColorAlpha(value);
        const pct = Math.round(curAlpha * 100);
        return (
            <div className={`flex items-center gap-2 ${className || 'w-full'} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <input
                    type="color"
                    value={curHex}
                    onChange={e => commitThrottled(buildColorAlpha(e.target.value, curAlpha))}
                    onBlur={flush}
                    disabled={disabled}
                    title="Pick a colour"
                    className="h-9 w-11 flex-shrink-0 rounded-lg border border-[var(--border-default)] bg-transparent cursor-pointer p-0.5"
                />
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={pct}
                    onChange={e => commitThrottled(buildColorAlpha(curHex, Number(e.target.value) / 100))}
                    onBlur={flush}
                    disabled={disabled}
                    title="How solid (drag left to make it see-through)"
                    className="flex-1 min-w-0 accent-[var(--accent-lavender)] cursor-pointer"
                />
                <span className="text-xs text-[var(--text-muted)] w-14 text-right tabular-nums flex-shrink-0">{pct}% solid</span>
            </div>
        );
    }

    return (
        <div className={`flex items-center gap-2 ${className || 'w-full'} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <input
                type="color"
                value={localValue || '#000000'}
                onChange={handleSwatch}
                onBlur={flush}
                disabled={disabled}
                title="Pick a colour"
                className="h-9 w-11 flex-shrink-0 rounded-lg border border-[var(--border-default)] bg-transparent cursor-pointer p-0.5"
            />
            <input
                type="text"
                value={text}
                onChange={handleHexChange}
                onBlur={handleHexBlur}
                disabled={disabled}
                spellCheck={false}
                maxLength={7}
                placeholder="#RRGGBB"
                aria-label="Hex colour code"
                className="flex-1 min-w-0 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg px-2.5 py-1.5 text-sm font-mono uppercase text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] focus:outline-none focus:border-[var(--accent-lavender)]"
            />
        </div>
    );
};

/**
 * Throttled range slider — a DROP-IN replacement for `<input type="range">`. A native range
 * fires onChange continuously while dragging; when that handler dispatches a full project update
 * (the inspector pattern) every tick re-renders the whole editor → lag. RangeInput keeps the thumb
 * live via local state but throttles the upstream onChange to ~12/sec + flushes the final value on
 * release. Same `onChange(e)` signature as a native input (handlers read `e.target.value`), so a
 * swap is just renaming the tag — all other props (value/min/max/step/className/disabled…) pass
 * through unchanged.
 */
export const RangeInput: React.FC<any> = ({ value, onChange, ...rest }) => {
    const [local, setLocal] = useState(value);
    const latestRef = useRef(value);
    const lastDispatchRef = useRef(0);
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => { latestRef.current = value; setLocal(value); }, [value]);

    // Call the parent's native-style onChange with a minimal synthetic event carrying the value.
    const emit = useCallback((v: any) => {
        if (onChange) onChange({ target: { value: String(v) }, currentTarget: { value: String(v) } });
    }, [onChange]);

    const THROTTLE_MS = 80;
    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setLocal(v);
        latestRef.current = v;
        const now = performance.now();
        if (timeoutRef.current !== null) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        const elapsed = now - lastDispatchRef.current;
        if (elapsed >= THROTTLE_MS) {
            lastDispatchRef.current = now;
            emit(v);
        } else {
            timeoutRef.current = window.setTimeout(() => {
                lastDispatchRef.current = performance.now();
                timeoutRef.current = null;
                emit(latestRef.current);
            }, THROTTLE_MS - elapsed);
        }
    }, [emit]);

    // Commit the final value immediately on release (snappier than waiting out the throttle window).
    const flush = useCallback(() => {
        if (timeoutRef.current !== null) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        if (String(latestRef.current) !== String(value)) emit(latestRef.current);
    }, [emit, value]);

    useEffect(() => () => { if (timeoutRef.current !== null) clearTimeout(timeoutRef.current); }, []);

    return (
        <input
            {...rest}
            type="range"
            value={local}
            onChange={handleChange}
            onMouseUp={flush}
            onBlur={flush}
        />
    );
};

// FIX: Combine passed className with default styles, and set a default for the rows prop.
// forwardRef so callers can reach the real <textarea> — the "{ }" insert-a-variable button needs the
// CARET position, otherwise it can only append to the end of the line.
export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
    ({ className, rows = 4, ...props }, ref) => (
        <textarea
            {...props}
            ref={ref}
            className={`${inputBaseStyles} resize-none leading-relaxed ${className || ''}`}
            rows={rows}
        />
    )
);
TextArea.displayName = 'TextArea';

// FIX: Combine passed className with default styles.
export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className, ...props }) => (
    <select 
        {...props} 
        className={`${inputBaseStyles} cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23b87eff%22%20d%3D%22M6%208L1%203h10z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.75rem_center] pr-10 ${className || ''}`}
    />
);

// Toggle/Checkbox component
export const Toggle: React.FC<{
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    disabled?: boolean;
}> = ({ checked, onChange, label, disabled }) => (
    <label className={`inline-flex items-center gap-3 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <div 
            className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
                checked 
                    ? 'bg-gradient-to-r from-[var(--accent-pink)] to-[var(--accent-lavender)]' 
                    : 'bg-[var(--bg-elevated)]'
            }`}
            style={{
                boxShadow: checked ? 'var(--shadow-glow-pink)' : 'var(--shadow-inset)'
            }}
            onClick={() => !disabled && onChange(!checked)}
        >
            <div 
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-md ${
                    checked ? 'left-6' : 'left-1'
                }`}
            />
        </div>
        {label && <span className="text-sm text-[var(--text-secondary)]">{label}</span>}
    </label>
);
