import React from 'react';

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

// FIX: Combine passed className with default styles, and set a default for the rows prop.
export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className, rows = 4, ...props }) => (
    <textarea 
        {...props} 
        className={`${inputBaseStyles} resize-none leading-relaxed ${className || ''}`} 
        rows={rows}
    />
);

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
