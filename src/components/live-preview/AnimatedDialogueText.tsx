/**
 * AnimatedDialogueText - Renders dialogue text with per-character animated effects
 * Supports: shake, wave, rainbow, glitch, pulse, fade-in, bounce, typewriter-bounce
 */
import React, { useMemo } from 'react';
import type { VNDialogueTextEffect, VNTextEffectType } from '../../features/scene/types';

export interface AnimatedDialogueTextProps {
    /** The full text being displayed (already sliced by typewriter) */
    displayText: string;
    /** Text effect configuration */
    textEffect?: VNDialogueTextEffect;
    /** Base text style to apply */
    textStyle?: React.CSSProperties;
    /** Gradient style for text (if any) */
    gradientStyle?: React.CSSProperties;
}

/**
 * Generate CSS keyframe animations for text effects.
 * These are injected once and reused across all characters.
 */
const TEXT_EFFECT_KEYFRAMES = `
@keyframes vnTextShake {
    0%, 100% { transform: translate(0, 0); }
    10% { transform: translate(-1px, -1px); }
    20% { transform: translate(1px, 0); }
    30% { transform: translate(-1px, 1px); }
    40% { transform: translate(1px, -1px); }
    50% { transform: translate(-1px, 0px); }
    60% { transform: translate(1px, 1px); }
    70% { transform: translate(0, -1px); }
    80% { transform: translate(-1px, 1px); }
    90% { transform: translate(1px, 0); }
}

@keyframes vnTextWave {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(var(--wave-amplitude, -4px)); }
}

@keyframes vnTextPulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(var(--pulse-scale, 1.15)); opacity: 0.85; }
}

@keyframes vnTextBounce {
    0%, 100% { transform: translateY(0); }
    30% { transform: translateY(var(--bounce-height, -6px)); }
    50% { transform: translateY(0); }
    70% { transform: translateY(var(--bounce-height-small, -3px)); }
}

@keyframes vnTextFadeIn {
    0% { opacity: 0; transform: translateY(4px); }
    100% { opacity: 1; transform: translateY(0); }
}

@keyframes vnTextGlitch {
    0%, 100% { transform: translate(0, 0) skew(0deg); opacity: 1; }
    7% { transform: translate(-2px, -1px) skew(-2deg); }
    10% { transform: translate(2px, 1px) skew(2deg); opacity: 0.8; }
    15% { transform: translate(-1px, 2px) skew(-1deg); }
    20% { transform: translate(0, 0) skew(0deg); opacity: 1; }
}

@keyframes vnTextTypewriterBounce {
    0% { transform: scale(0.5) translateY(8px); opacity: 0; }
    60% { transform: scale(1.1) translateY(-2px); opacity: 1; }
    80% { transform: scale(0.95) translateY(1px); }
    100% { transform: scale(1) translateY(0); opacity: 1; }
}
`;

let stylesInjected = false;

function injectTextEffectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.setAttribute('data-vn-text-effects', 'true');
    style.textContent = TEXT_EFFECT_KEYFRAMES;
    document.head.appendChild(style);
}

/** Rainbow color generation based on character index */
function getRainbowColor(index: number, speed: number): string {
    const hue = (index * 30 + Date.now() * speed * 0.05) % 360;
    return `hsl(${hue}, 85%, 65%)`;
}

/** Get animation CSS for a character at a given index */
function getCharacterStyle(
    effect: VNDialogueTextEffect,
    charIndex: number,
    totalChars: number
): React.CSSProperties {
    const speed = effect.speed ?? 1;
    const intensity = effect.intensity ?? 1;
    const duration = 1 / speed;
    const delay = charIndex * 0.05 / speed;

    switch (effect.type) {
        case 'shake':
            return {
                display: 'inline-block',
                animation: `vnTextShake ${0.3 / speed}s ease-in-out infinite`,
                animationDelay: `${delay}s`,
                '--shake-intensity': `${intensity}px`,
            } as React.CSSProperties;

        case 'wave':
            return {
                display: 'inline-block',
                animation: `vnTextWave ${0.8 / speed}s ease-in-out infinite`,
                animationDelay: `${delay}s`,
                '--wave-amplitude': `${-4 * intensity}px`,
            } as React.CSSProperties;

        case 'rainbow':
            // Rainbow uses dynamic color - handled by the component via a custom approach
            return {
                display: 'inline-block',
                color: getRainbowColor(charIndex, speed),
                transition: 'color 0.1s',
            };

        case 'glitch':
            return {
                display: 'inline-block',
                animation: `vnTextGlitch ${0.5 / speed}s ease-in-out infinite`,
                animationDelay: `${charIndex * 0.1}s`,
            };

        case 'pulse':
            return {
                display: 'inline-block',
                animation: `vnTextPulse ${1 / speed}s ease-in-out infinite`,
                animationDelay: `${delay}s`,
                '--pulse-scale': `${1 + 0.15 * intensity}`,
            } as React.CSSProperties;

        case 'fade-in':
            return {
                display: 'inline-block',
                animation: `vnTextFadeIn ${0.4 / speed}s ease-out forwards`,
                animationDelay: `${charIndex * 0.03 / speed}s`,
                opacity: 0,
            };

        case 'bounce':
            return {
                display: 'inline-block',
                animation: `vnTextBounce ${0.6 / speed}s ease-in-out infinite`,
                animationDelay: `${delay}s`,
                '--bounce-height': `${-6 * intensity}px`,
                '--bounce-height-small': `${-3 * intensity}px`,
            } as React.CSSProperties;

        case 'typewriter-bounce':
            return {
                display: 'inline-block',
                animation: `vnTextTypewriterBounce ${0.3 / speed}s ease-out forwards`,
                animationDelay: `0s`,
            };

        default:
            return {};
    }
}

export const AnimatedDialogueText: React.FC<AnimatedDialogueTextProps> = ({
    displayText,
    textEffect,
    textStyle,
    gradientStyle,
}) => {
    // Inject keyframe styles once
    useMemo(() => {
        injectTextEffectStyles();
    }, []);

    // If no effect or 'none', render plain text
    if (!textEffect || textEffect.type === 'none') {
        return (
            <span style={gradientStyle || undefined}>{displayText}</span>
        );
    }

    // Split into word + whitespace tokens. Each word's animated characters are
    // wrapped in an inline-block, white-space:nowrap group so the word stays on
    // one line — a per-character inline-block layout otherwise lets the browser
    // break words mid-word at any character. Whitespace between words stays
    // breakable so lines still wrap normally. The running `charIndex` (counting
    // spaces too) keeps the animation stagger (wave/shake/rainbow) consistent
    // across the whole line.
    const tokens = displayText.split(/(\s+)/);
    const totalChars = displayText.length;
    let charIndex = 0;

    return (
        <span style={gradientStyle || undefined}>
            {tokens.map((token, ti) => {
                if (token === '') return null;
                if (/^\s+$/.test(token)) {
                    charIndex += token.length;
                    // Breakable whitespace between words
                    return <span key={ti}>{token}</span>;
                }
                const wordStart = charIndex;
                charIndex += token.length;
                return (
                    <span key={ti} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
                        {token.split('').map((char, ci) => {
                            const charStyle = getCharacterStyle(textEffect, wordStart + ci, totalChars);
                            return (
                                <span
                                    key={ci}
                                    style={{
                                        ...charStyle,
                                        // Preserve any gradient styling
                                        ...(gradientStyle ? {
                                            WebkitBackgroundClip: undefined,
                                            backgroundClip: undefined,
                                            WebkitTextFillColor: undefined,
                                        } : {}),
                                    }}
                                >
                                    {char}
                                </span>
                            );
                        })}
                    </span>
                );
            })}
        </span>
    );
};

/** Hook that re-renders periodically for rainbow effect animation */
export function useRainbowTick(active: boolean, intervalMs: number = 100) {
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
        if (!active) return;
        const id = setInterval(() => setTick(t => t + 1), intervalMs);
        return () => clearInterval(id);
    }, [active, intervalMs]);
}
