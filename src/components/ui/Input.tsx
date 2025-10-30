import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    helperText?: string;
}

const Input: React.FC<InputProps> = ({
    label,
    error,
    helperText,
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
            <input className={classes} {...props} />
            {error && (
                <p className="text-sm text-red-400">{error}</p>
            )}
            {helperText && !error && (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{helperText}</p>
            )}
        </div>
    );
};

export default Input;