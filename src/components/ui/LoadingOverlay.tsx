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
        <div 
            className="fixed inset-0 z-[60] flex items-center justify-center"
            style={{ 
                background: 'radial-gradient(ellipse at center, rgba(15, 10, 25, 0.9) 0%, rgba(0, 0, 0, 0.95) 100%)',
                backdropFilter: 'blur(12px)',
                animation: 'fade-in 0.2s ease-out' 
            }}
        >
            {/* Floating background orbs */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div 
                    className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-30"
                    style={{
                        background: 'radial-gradient(circle, var(--accent-pink) 0%, transparent 70%)',
                        animation: 'float 4s ease-in-out infinite',
                        filter: 'blur(60px)'
                    }}
                />
                <div 
                    className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full opacity-25"
                    style={{
                        background: 'radial-gradient(circle, var(--accent-cyan) 0%, transparent 70%)',
                        animation: 'float 5s ease-in-out infinite reverse',
                        filter: 'blur(60px)'
                    }}
                />
            </div>
            
            <div 
                className="relative rounded-3xl shadow-2xl p-10 max-w-sm w-full mx-4 text-center overflow-hidden"
                style={{ 
                    background: 'linear-gradient(180deg, var(--bg-tertiary) 0%, var(--bg-secondary) 100%)',
                    border: '1px solid var(--border-default)',
                    boxShadow: 'var(--shadow-xl), var(--shadow-glow-rainbow), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                    animation: 'modal-enter 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
            >
                {/* Rainbow top border */}
                <div 
                    className="absolute top-0 left-0 right-0 h-[2px]"
                    style={{
                        background: 'linear-gradient(90deg, var(--accent-pink), var(--accent-peach), var(--accent-yellow), var(--accent-mint), var(--accent-cyan), var(--accent-lavender))'
                    }}
                />
                
                {/* Spinner */}
                <div className="relative w-20 h-20 mx-auto mb-8">
                    {/* Outer glow ring */}
                    <div 
                        className="absolute inset-[-8px] rounded-full"
                        style={{
                            background: 'conic-gradient(from 0deg, var(--accent-pink), var(--accent-lavender), var(--accent-cyan), var(--accent-mint), var(--accent-pink))',
                            filter: 'blur(12px)',
                            opacity: 0.4,
                            animation: 'spin 3s linear infinite'
                        }}
                    />
                    {/* Background ring */}
                    <div className="absolute inset-0 border-4 border-[var(--border-subtle)] rounded-full" />
                    {/* Animated gradient ring */}
                    <div 
                        className="absolute inset-0 rounded-full"
                        style={{
                            background: 'conic-gradient(from 0deg, var(--accent-pink), var(--accent-lavender), var(--accent-cyan), transparent)',
                            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #fff calc(100% - 4px))',
                            mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #fff calc(100% - 4px))',
                            animation: 'spin 1s linear infinite'
                        }}
                    />
                    {/* Center content */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        {progress !== undefined ? (
                            <span 
                                className="text-lg font-bold"
                                style={{
                                    background: 'linear-gradient(135deg, var(--accent-pink), var(--accent-cyan))',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent'
                                }}
                            >
                                {Math.round(progress)}%
                            </span>
                        ) : (
                            <span className="text-2xl">✨</span>
                        )}
                    </div>
                </div>

                {/* Main message */}
                <p 
                    className="text-xl font-bold mb-3"
                    style={{
                        background: 'linear-gradient(135deg, var(--text-primary), var(--pastel-lavender))',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent'
                    }}
                >
                    {message}
                </p>

                {/* Progress bar (if progress is provided) */}
                {progress !== undefined && (
                    <div className="w-full h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden mb-4 shadow-inner">
                        <div 
                            className="h-full transition-all duration-300 ease-out rounded-full"
                            style={{ 
                                width: `${progress}%`,
                                background: 'linear-gradient(90deg, var(--accent-pink), var(--accent-lavender), var(--accent-cyan))',
                                boxShadow: '0 0 15px var(--accent-cyan)'
                            }}
                        />
                    </div>
                )}

                {/* Sub message */}
                {subMessage && (
                    <p className="text-sm text-[var(--text-muted)] mb-4">
                        {subMessage}
                    </p>
                )}

                {/* Pulsing dots for visual feedback */}
                <div className="flex justify-center gap-2 mt-2">
                    {[
                        'var(--accent-pink)',
                        'var(--accent-lavender)',
                        'var(--accent-cyan)'
                    ].map((color, i) => (
                        <div
                            key={i}
                            className="w-2.5 h-2.5 rounded-full"
                            style={{
                                background: color,
                                boxShadow: `0 0 10px ${color}`,
                                animation: 'pulse 1.4s ease-in-out infinite',
                                animationDelay: `${i * 0.15}s`
                            }}
                        />
                    ))}
                </div>
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.3; transform: scale(0.7); }
                    50% { opacity: 1; transform: scale(1.2); }
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0) scale(1); }
                    50% { transform: translateY(-20px) scale(1.05); }
                }
            `}</style>
        </div>
    );
};

export default LoadingOverlay;
