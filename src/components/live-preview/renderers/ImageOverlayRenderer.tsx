/**
 * Image Overlay Renderer
 * Displays image/video overlays with transitions on the game stage
 */

import React, { useState, useEffect, useRef } from 'react';
import { ImageOverlay, StageSize } from '../types/gameState';
import { getOverlayTransitionClass, buildSlideStyle } from '../systems/transitionUtils';

interface ImageOverlayElementProps {
    overlay: ImageOverlay;
    stageSize: StageSize;
}

export const ImageOverlayElement: React.FC<ImageOverlayElementProps> = ({ overlay, stageSize }) => {
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

    const applyTransition = playTransition && overlay.transition && overlay.transition !== 'instant';
    const transitionClass = applyTransition && overlay.transition ? getOverlayTransitionClass(overlay.transition, overlay.action === 'hide') : '';
    const animDuration = `${overlay.duration ?? 0.5}s`;
    const isSlideTransition = overlay.transition === 'slide';
    const slideStyle = isSlideTransition ? buildSlideStyle(overlay.x, overlay.y ?? 0, overlay.action, stageSize) : {};

    const containerStyle: React.CSSProperties = {
        left: `${overlay.x}%`,
        top: `${overlay.y}%`,
        width: `${overlay.width}px`,
        height: `${overlay.height}px`,
        ...(isSlideTransition ? {} : { transform: 'translate(-50%, -50%)' }),
    };

    // Only pre-hide if we're showing WITH a transition that hasn't started yet
    if (overlay.action === 'show' && hasTransition && !playTransition) {
        containerStyle.opacity = 0;
    }

    const imageStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        transform: `rotate(${overlay.rotation}deg) scale(${overlay.scaleX}, ${overlay.scaleY})`,
        transformOrigin: 'center center',
        opacity: overlay.opacity,
    };

    const className = `absolute${applyTransition ? ` ${transitionClass} transition-base` : ''}`;
    const style = {
        ...containerStyle,
        ...(applyTransition ? { animationDuration: animDuration } : {}),
        ...(isSlideTransition ? slideStyle : {}),
    } as React.CSSProperties;

    return (
        <div className={className} style={style}>
            {overlay.isVideo && overlay.videoUrl ? (
                <video 
                    src={overlay.videoUrl} 
                    autoPlay 
                    muted 
                    loop={overlay.videoLoop} 
                    playsInline
                    className="absolute inset-0 w-full h-full object-contain" 
                    style={imageStyle} 
                />
            ) : (
                <img 
                    src={overlay.imageUrl} 
                    alt="" 
                    className="absolute inset-0 w-full h-full object-contain" 
                    style={imageStyle} 
                />
            )}
        </div>
    );
};
