import React from 'react';

interface LoadingOverlayProps {
    isVisible: boolean;
    message?: string;
    progress?: number; // 0-100, optional
    subMessage?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ 
    isVisible, 
    message = 'Processing...', 
    progress,
    subMessage 
}) => {
    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-80">
            <div className="bg-[var(--bg-secondary)] rounded-xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
                {/* Spinner */}
                <div className="relative w-16 h-16 mx-auto mb-6">
                    <div className="absolute inset-0 border-4 border-[var(--bg-tertiary)] rounded-full"></div>
                    <div 
                        className="absolute inset-0 border-4 border-transparent border-t-[var(--accent-cyan)] rounded-full animate-spin"
                        style={{ animationDuration: '0.8s' }}
                    ></div>
                    {progress !== undefined && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-sm font-bold text-[var(--text-primary)]">
                                {Math.round(progress)}%
                            </span>
                        </div>
                    )}
                </div>

                {/* Main message */}
                <p className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                    {message}
                </p>

                {/* Progress bar (if progress is provided) */}
                {progress !== undefined && (
                    <div className="w-full h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden mb-3">
                        <div 
                            className="h-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)] transition-all duration-300 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                )}

                {/* Sub message */}
                {subMessage && (
                    <p className="text-sm text-[var(--text-secondary)]">
                        {subMessage}
                    </p>
                )}

                {/* Pulsing dots for visual feedback */}
                <div className="flex justify-center gap-1 mt-4">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="w-2 h-2 rounded-full bg-[var(--accent-cyan)]"
                            style={{
                                animation: 'pulse 1.2s ease-in-out infinite',
                                animationDelay: `${i * 0.2}s`
                            }}
                        />
                    ))}
                </div>
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.3; transform: scale(0.8); }
                    50% { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
};

export default LoadingOverlay;
