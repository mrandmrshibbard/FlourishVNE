/**
 * Transition utilities for visual effects
 */

import React from 'react';
import { VNTransition } from '../../../types';
import { StageSize } from '../types/gameState';

/**
 * Get the CSS class name for an overlay transition
 */
export const getOverlayTransitionClass = (transition: VNTransition, isHide: boolean): string => {
    switch (transition) {
        case 'fade':
            return isHide ? 'transition-fade-out' : 'transition-dissolve';
        case 'dissolve':
            return isHide ? 'transition-dissolve-out' : 'transition-dissolve';
        case 'slide':
            return 'transition-slide';
        case 'iris-in':
            return isHide ? 'transition-iris-out' : 'transition-iris-in';
        case 'wipe-right':
            return isHide ? 'transition-wipe-out-right' : 'transition-wipe-right';
        default:
            return 'transition-dissolve';
    }
};

/**
 * Build CSS custom properties for slide transitions
 */
export const buildSlideStyle = (
    x: number, 
    _y: number, 
    action: 'show' | 'hide' | undefined, 
    stageSize: StageSize
): React.CSSProperties => {
    const horizontalBias = x <= 50 ? -60 : 60;
    const startPercent = action === 'show' ? horizontalBias : 0;
    const endPercent = action === 'hide' ? horizontalBias : 0;

    const style: React.CSSProperties = {
        '--slide-start-x': `${startPercent}%`,
        '--slide-start-y': `0%`,
        '--slide-end-x': `${endPercent}%`,
        '--slide-end-y': `0%`,
    } as React.CSSProperties;

    if (stageSize.width > 0 && stageSize.height > 0) {
        style['--slide-start-px' as any] = `${(startPercent / 100) * stageSize.width}px`;
        style['--slide-end-px' as any] = `${(endPercent / 100) * stageSize.width}px`;
        style['--slide-start-py' as any] = `0px`;
        style['--slide-end-py' as any] = `0px`;
    }

    return style;
};

/**
 * Get position style for character placement
 */
export const getPositionStyle = (position: import('../../../types').VNPosition): React.CSSProperties => {
    if (typeof position === 'object') {
        return { 
            left: `${position.x}%`, 
            top: `${position.y}%`, 
            transform: 'translate(-50%, 0)' 
        };
    }
    
    const presetStyles: Record<import('../../../types').VNPositionPreset, React.CSSProperties> = {
        'left': { top: '10%', left: '25%', transform: 'translate(-50%, 0)' },
        'center': { top: '10%', left: '50%', transform: 'translate(-50%, 0)' },
        'right': { top: '10%', left: '75%', transform: 'translate(-50%, 0)' },
        'off-left': { top: '10%', left: '-25%', transform: 'translate(-50%, 0)' },
        'off-right': { top: '10%', left: '125%', transform: 'translate(-50%, 0)' },
    };
    
    return presetStyles[position];
};
