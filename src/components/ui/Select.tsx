import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    helperText?: string;
    options: { value: string; label: string }[];
}

const Select: React.FC<SelectProps> = ({
    label,
    error,
    helperText,
    options,
    className = '',
    ...props
}) => {
    const baseClasses = 'form-input';
    const errorClasses = error ? 'border-red-500 focus:ring-red-500' : '';
    const classes = `${baseClasses} ${errorClasses} ${className}`.trim();

    return (
        <div className="space-y-1">
            {label && (
                <label className="form-label">
                    {label}
                </label>
            )}
            <select className={classes} {...props}>
                {options.map(option => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            {error && (
                <p className="text-sm text-red-400">{error}</p>
            )}
            {helperText && !error && (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{helperText}</p>
            )}
        </div>
    );
};

export default Select;