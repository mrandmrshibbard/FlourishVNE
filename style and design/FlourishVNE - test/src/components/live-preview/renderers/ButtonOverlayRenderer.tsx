/**
 * Button Overlay Renderer
 * Displays interactive button overlays with transitions
 */

import React, { useState, useEffect, useRef } from 'react';
import { ButtonOverlay } from '../types/gameState';
import { VNUIAction, UIActionType } from '../../../types/shared';
import { VNID } from '../../../types';
import { getOverlayTransitionClass } from '../systems/transitionUtils';

interface ButtonOverlayElementProps {
    overlay: ButtonOverlay;
    onAction: (action: VNUIAction) => void;
    playSound: (soundId: VNID | null) => void;
    onAdvance?: () => void;
}

export const ButtonOverlayElement: React.FC<ButtonOverlayElementProps> = ({ 
    overlay, 
    onAction, 
    playSound, 
    onAdvance 
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const hasTransition = overlay.transition && overlay.transition !== 'instant';
    const [playTransition, setPlayTransition] = useState<boolean>(overlay.action === 'hide' && !!hasTransition);
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        if (!overlay.transition || overlay.transition === 'instant') {
            setPlayTransition(false);
            return;
        }

        if (overlay.action === 'show') {
            setPlayTransition(false);
            timeoutRef.current = window.setTimeout(() => {
                setPlayTransition(true);
                timeoutRef.current = null;
            }, 0);
            return () => {
                if (timeoutRef.current !== null) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }
            };
        }

        setPlayTransition(true);
        return () => {
            if (timeoutRef.current !== null) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [overlay.id, overlay.transition, overlay.action]);

    const handleClick = () => {
        console.log('Button clicked:', overlay.text, 'Action:', overlay.onClick);
        if (overlay.clickSound) {
            try {
                playSound(overlay.clickSound);
            } catch (e) {
                console.error('Error playing button click sound:', e);
            }
        }
        onAction(overlay.onClick);
        
        // If this button requires click to advance, call the advance function
        // BUT: Don't advance if action is JumpToScene (it handles its own navigation)
        if (overlay.waitForClick && onAdvance && overlay.onClick.type !== UIActionType.JumpToScene) {
            onAdvance();
        }
    };

    const applyTransition = playTransition && overlay.transition && overlay.transition !== 'instant';
    const transitionClass = applyTransition && overlay.transition ? getOverlayTransitionClass(overlay.transition, overlay.action === 'hide') : '';
    const animDuration = `${overlay.duration ?? 0.3}s`;

    const containerStyle: React.CSSProperties = {
        position: 'absolute',
        left: `${overlay.x}%`,
        top: `${overlay.y}%`,
        width: `${overlay.width}%`,
        height: `${overlay.height}%`,
        transform: `translate(-${overlay.anchorX * 100}%, -${overlay.anchorY * 100}%)`,
        pointerEvents: 'auto',
    };

    // Pre-hide if showing WITH a transition that hasn't started yet
    if (overlay.action === 'show' && hasTransition && !playTransition) {
        containerStyle.opacity = 0;
    }

    const buttonStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        backgroundColor: overlay.backgroundColor,
        color: overlay.textColor,
        fontSize: `${overlay.fontSize}px`,
        fontWeight: overlay.fontWeight,
        borderRadius: `${overlay.borderRadius}px`,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.1s, box-shadow 0.1s',
        boxShadow: isHovered ? '0 4px 12px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.2)',
        transform: isHovered ? 'translateY(-2px)' : 'none',
    };

    const displayImage = isHovered && overlay.hoverImageUrl ? overlay.hoverImageUrl : overlay.imageUrl;

    return (
        <div
            key={overlay.id}
            style={containerStyle}
            className={`${transitionClass}`}
            {...(hasTransition ? { style: { ...containerStyle, animationDuration: animDuration } } : {})}
        >
            <button
                onClick={handleClick}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                style={buttonStyle}
            >
                {displayImage ? (
                    <img 
                        src={displayImage} 
                        alt={overlay.text} 
                        style={{ 
                            width: '100%', 
                            height: '100%', 
                            objectFit: 'cover', 
                            borderRadius: `${overlay.borderRadius}px` 
                        }} 
                    />
                ) : (
                    <span>{overlay.text}</span>
                )}
            </button>
        </div>
    );
};
