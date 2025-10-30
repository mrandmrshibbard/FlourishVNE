import React from 'react';

export const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="mb-4">
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{label}</label>
        {children}
    </div>
);

// FIX: Wrap TextInput in React.forwardRef to allow passing a ref to the underlying input element.
// Also, combine passed className with default styles instead of overwriting.
export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
    <input {...props} ref={ref} className={`w-full bg-[var(--bg-primary)] border border-[var(--bg-tertiary)] rounded-md p-2 focus-glow ${className || ''}`}/>
));

// FIX: Combine passed className with default styles, and set a default for the rows prop.
export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className, rows = 4, ...props }) => (
    <textarea {...props} className={`w-full bg-[var(--bg-primary)] border border-[var(--bg-tertiary)] rounded-md p-2 focus-glow ${className || ''}`} rows={rows}/>
);

// FIX: Combine passed className with default styles.
export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className, ...props }) => (
    <select {...props} className={`w-full bg-[var(--bg-primary)] border border-[var(--bg-tertiary)] rounded-md p-2 focus-glow ${className || ''}`}/>
);
