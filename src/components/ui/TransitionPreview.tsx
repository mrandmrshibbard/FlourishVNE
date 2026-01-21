import React, { useState, useEffect } from 'react';
import { VNTransition } from '../../types';

interface TransitionPreviewProps {
    transition: VNTransition;
    duration?: number;
}

/**
 * Animated preview of transition effects
 */
const TransitionPreview: React.FC<TransitionPreviewProps> = ({ transition, duration = 1 }) => {
    const [isAnimating, setIsAnimating] = useState(false);
    const [showNew, setShowNew] = useState(false);

    // Trigger animation when transition changes or on click
    const playAnimation = () => {
        setIsAnimating(true);
        setShowNew(false);
        
        // Small delay then show new content with transition
        setTimeout(() => {
            setShowNew(true);
        }, 50);
        
        // Reset after animation
        setTimeout(() => {
            setIsAnimating(false);
        }, (duration * 1000) + 200);
    };

    // Auto-play on mount and when transition changes
    useEffect(() => {
        playAnimation();
    }, [transition]);

    const getTransitionStyle = (): React.CSSProperties => {
        const baseDuration = `${duration}s`;
        
        switch (transition) {
            case 'fade':
                return {
                    animation: showNew ? `tp-fade-in ${baseDuration} ease-out forwards` : 'none',
                    opacity: showNew ? 1 : 0,
                };
            case 'dissolve':
                return {
                    animation: showNew ? `tp-dissolve ${baseDuration} ease-out forwards` : 'none',
                    opacity: showNew ? 1 : 0,
                };
            case 'slide':
                return {
                    animation: showNew ? `tp-slide-in ${baseDuration} ease-out forwards` : 'none',
                    transform: showNew ? 'translateX(0)' : 'translateX(100%)',
                };
            case 'iris-in':
                return {
                    animation: showNew ? `tp-iris-in ${baseDuration} ease-out forwards` : 'none',
                    clipPath: showNew ? 'circle(100% at center)' : 'circle(0% at center)',
                };
            case 'wipe-right':
                return {
                    animation: showNew ? `tp-wipe-right ${baseDuration} ease-out forwards` : 'none',
                    clipPath: showNew ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
                };
            case 'cross-fade':
                return {
                    animation: showNew ? `tp-fade-in ${baseDuration} ease-out forwards` : 'none',
                    opacity: showNew ? 1 : 0,
                };
            case 'instant':
            default:
                return {
                    opacity: showNew ? 1 : 0,
                    transition: 'none',
                };
        }
    };

    const getTransitionDescription = (): string => {
        switch (transition) {
            case 'fade': return 'Fades through black';
            case 'dissolve': return 'Cross-dissolves smoothly';
            case 'slide': return 'Slides in from right';
            case 'iris-in': return 'Circular reveal from center';
            case 'wipe-right': return 'Wipes from left to right';
            case 'cross-fade': return 'Blends between images';
            case 'instant': return 'Instant change, no animation';
            default: return '';
        }
    };

    return (
        <div className="transition-preview" onClick={playAnimation} title="Click to replay">
            <div className="transition-preview__container">
                {/* Old content (faded background) */}
                <div className="transition-preview__old">
                    <div className="transition-preview__placeholder transition-preview__placeholder--old">
                        Old
                    </div>
                </div>
                
                {/* New content with transition */}
                <div 
                    className="transition-preview__new"
                    style={getTransitionStyle()}
                >
                    <div className="transition-preview__placeholder transition-preview__placeholder--new">
                        New
                    </div>
                </div>
                
                {/* Fade overlay for fade transition */}
                {transition === 'fade' && isAnimating && !showNew && (
                    <div className="transition-preview__fade-overlay" />
                )}
            </div>
            
            <div className="transition-preview__label">
                {getTransitionDescription()}
            </div>

            <style>{`
                .transition-preview {
                    cursor: pointer;
                    user-select: none;
                }
                
                .transition-preview__container {
                    position: relative;
                    width: 100%;
                    height: 40px;
                    border-radius: 4px;
                    overflow: hidden;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                }
                
                .transition-preview__old,
                .transition-preview__new {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .transition-preview__old {
                    background: linear-gradient(135deg, #4a5568 0%, #2d3748 100%);
                }
                
                .transition-preview__new {
                    background: linear-gradient(135deg, var(--accent-cyan) 0%, var(--accent-purple) 100%);
                }
                
                .transition-preview__placeholder {
                    font-size: 10px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                
                .transition-preview__placeholder--old {
                    color: #a0aec0;
                }
                
                .transition-preview__placeholder--new {
                    color: white;
                }
                
                .transition-preview__fade-overlay {
                    position: absolute;
                    inset: 0;
                    background: black;
                    animation: tp-fade-overlay 0.5s ease-in-out;
                }
                
                .transition-preview__label {
                    margin-top: 4px;
                    font-size: 10px;
                    color: var(--text-secondary);
                    text-align: center;
                }
                
                @keyframes tp-fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                @keyframes tp-dissolve {
                    0% { opacity: 0; filter: blur(4px); }
                    100% { opacity: 1; filter: blur(0); }
                }
                
                @keyframes tp-slide-in {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                
                @keyframes tp-iris-in {
                    from { clip-path: circle(0% at center); }
                    to { clip-path: circle(100% at center); }
                }
                
                @keyframes tp-wipe-right {
                    from { clip-path: inset(0 100% 0 0); }
                    to { clip-path: inset(0 0 0 0); }
                }
                
                @keyframes tp-fade-overlay {
                    0% { opacity: 0; }
                    50% { opacity: 1; }
                    100% { opacity: 0; }
                }
            `}</style>
        </div>
    );
};

export default TransitionPreview;
