/**
 * Text Overlay Renderer
 * Displays text overlays with transitions on the game stage
 */

import React, { useState, useEffect, useRef } from 'react';
import { TextOverlay, StageSize } from '../types/gameState';
import { getOverlayTransitionClass, buildSlideStyle } from '../systems/transitionUtils';

interface TextOverlayElementProps {
    overlay: TextOverlay;
    stageSize: StageSize;
}

export const TextOverlayElement: React.FC<TextOverlayElementProps> = ({ overlay, stageSize }) => {
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

    const applyTransition = playTransition && !!hasTransition;
    const transitionClass = applyTransition && overlay.transition ? getOverlayTransitionClass(overlay.transition, overlay.action === 'hide') : '';
    const animDuration = `${overlay.duration ?? 0.5}s`;
    const isSlideTransition = overlay.transition === 'slide';
    const slideStyle = isSlideTransition ? buildSlideStyle(overlay.x, overlay.y ?? 0, overlay.action, stageSize) : {};

    const baseStyle: React.CSSProperties = {
        left: `${overlay.x}%`,
        top: `${overlay.y}%`,
        ...(isSlideTransition ? {} : { transform: 'translate(-50%, -50%)' }),
        fontSize: `${overlay.fontSize}px`,
        fontFamily: overlay.fontFamily,
        color: overlay.color,
        width: overlay.width ? `${overlay.width}px` : 'auto',
        height: overlay.height ? `${overlay.height}px` : 'auto',
        textAlign: overlay.textAlign || 'left',
        display: 'flex',
        alignItems: overlay.verticalAlign === 'top' ? 'flex-start' : overlay.verticalAlign === 'bottom' ? 'flex-end' : 'center',
        justifyContent: overlay.textAlign === 'left' ? 'flex-start' : overlay.textAlign === 'right' ? 'flex-end' : 'center',
        whiteSpace: overlay.width ? 'pre-wrap' : 'nowrap',
        overflow: 'hidden',
    };

    // Only pre-hide if we're showing WITH a transition that hasn't started yet
    if (overlay.action === 'show' && hasTransition && !playTransition) {
        baseStyle.opacity = 0;
    }

    const className = `absolute${applyTransition ? ` ${transitionClass} transition-base` : ''}`;
    const style = {
        ...baseStyle,
        ...(applyTransition ? { animationDuration: animDuration } : {}),
        ...(isSlideTransition ? slideStyle : {}),
    } as React.CSSProperties;

    return (
        <div className={className} style={style}>
            {overlay.text}
        </div>
    );
};
