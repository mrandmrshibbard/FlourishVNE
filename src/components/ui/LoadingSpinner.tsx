import React from 'react';

interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    message?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
    size = 'md',
    className = '',
    message
}) => {
    const sizeClasses = {
        sm: 'w-4 h-4',
        md: 'w-6 h-6',
        lg: 'w-8 h-8'
    };

    return (
        <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
            <div className={`loading-spinner ${sizeClasses[size]}`}></div>
            {message && (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message}</p>
            )}
        </div>
    );
};

export default LoadingSpinner;