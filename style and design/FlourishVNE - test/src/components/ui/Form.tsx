import React from 'react';

export const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="mb-3">
        <label className="form-label">{label}</label>
        {children}
    </div>
);

// FIX: Wrap TextInput in React.forwardRef to allow passing a ref to the underlying input element.
// Also, combine passed className with default styles instead of overwriting.
export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
    <input {...props} ref={ref} className={`form-input ${className || ''}`}/>
));

// FIX: Combine passed className with default styles, and set a default for the rows prop.
export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className, rows = 4, ...props }) => (
    <textarea {...props} className={`form-input ${className || ''}`} rows={rows}/>
);

// FIX: Combine passed className with default styles.
export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className, ...props }) => (
    <select {...props} className={`form-input ${className || ''}`}/>
);
