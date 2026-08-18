/**
 * AnimatedDialogueText - Renders dialogue text with per-character animated effects
 * Supports: shake, wave, rainbow, glitch, pulse, fade-in, bounce, typewriter-bounce
 */
import React, { useMemo } from 'react';
import type { VNDialogueTextEffect, VNTextEffectType } from '../../features/scene/types';

/** One glossary term occurrence in the FULL line, with its resolved look. */
export interface GlossaryMatchSpan {
    start: number;
    end: number;
    entryId: string;
    color: string;
    style: 'color' | 'glow' | 'underline';
}

/** One character-name mention in the FULL line, carrying the mentioned character's look.
 *  Display-only: no handlers, no advance interference — pure styling. */
export interface MentionSpan {
    start: number;
    end: number;
    /** The mentioned character's name color (absent = keep the text color). */
    color?: string;
    /** The mentioned character's dialogue font (already cssFontFamily-sanitized). */
    fontFamily?: string;
    bold?: boolean;
    /** The mentioned character's NAME effect (their Name effect setting, else the first
     *  inline tag in their name). Rendered via the effect-span channel, not this style —
     *  the caller merges it into effectSpans; carried here so it compiles in one pass. */
    effect?: { type: string; speed?: number; intensity?: number };
}

/** The mentioned character's look. Color resets any text-gradient fill (same trick as
 *  revealHighlightStyle) so it shows through gradient-filled dialogue text. */
const mentionStyle = (m: MentionSpan): React.CSSProperties => ({
    ...(m.color ? { color: m.color, WebkitTextFillColor: m.color } as React.CSSProperties : {}),
    ...(m.fontFamily ? { fontFamily: m.fontFamily } : {}),
    ...(m.bold ? { fontWeight: 700 } : {}),
});

export interface AnimatedDialogueTextProps {
    /** The full text being displayed (already sliced by typewriter) */
    displayText: string;
    /** Text effect configuration */
    textEffect?: VNDialogueTextEffect;
    /** Base text style to apply */
    textStyle?: React.CSSProperties;
    /** Gradient style for text (if any) */
    gradientStyle?: React.CSSProperties;
    /** Reveal highlight ("karaoke"): emphasize chars in [start, end) — the word currently
     *  being typed (typewriter driver, end absent = to the end of displayText) or spoken
     *  (voice driver). Null/absent = no highlight (line finished or feature off). */
    revealHighlight?: { start: number; end?: number; color: string; style: 'color' | 'glow' | 'underline' } | null;
    /** Glossary matches over the FULL line (sorted, non-overlapping). Only matches fully
     *  revealed (end <= displayText.length) are rendered — a term never highlights mid-
     *  typewriter. Null/absent = glossary off. */
    glossaryMatches?: GlossaryMatchSpan[] | null;
    /** Hover in/move/out over a term (entryId null = pointer left). Drives the tooltip. */
    onGlossaryHover?: (entryId: string | null, ev: React.MouseEvent) => void;
    /** Character-name mentions over the FULL line (sorted, non-overlapping; already
     *  glossary-subtracted by the caller). Unlike glossary terms, a mention CLAMPS to the
     *  revealed slice, so the name takes its owner's look while it types. */
    mentionSpans?: MentionSpan[] | null;
    /**
     * Per-word effects from inline tags (`[shake]NO[/shake]`), in the same clean-text
     * coordinates as the glossary/karaoke ranges. A char inside a span uses that span's effect;
     * everything else falls back to the line-level `textEffect`. Innermost span wins, so
     * `[wave]soft [shake]LOUD[/shake] soft[/wave]` shakes only the middle.
     */
    effectSpans?: Array<{ start: number; end: number; effect: string; intensity?: number; speed?: number }> | null;
}

/** Style applied to the word being revealed. Kept subtle enough to read at typewriter speed.
 *  Exported: the glossary (terms + the editor's live preview) reuses the same style vocabulary. */
export function revealHighlightStyle(hl: { color: string; style: 'color' | 'glow' | 'underline' }): React.CSSProperties {
    switch (hl.style) {
        case 'glow':
            return { textShadow: `0 0 8px ${hl.color}, 0 0 14px ${hl.color}` };
        case 'underline':
            return { textDecoration: 'underline', textDecorationColor: hl.color, textUnderlineOffset: '3px', textDecorationThickness: '2px' } as React.CSSProperties;
        case 'color':
        default:
            // Also reset any text-gradient fill so the color actually shows through.
            return { color: hl.color, WebkitTextFillColor: hl.color } as React.CSSProperties;
    }
}

/** Look of a glossary term in the text: reuses the karaoke style vocabulary + a help cursor. */
const glossaryTermStyle = (m: GlossaryMatchSpan): React.CSSProperties => ({
    ...revealHighlightStyle({ color: m.color, style: m.style }),
    cursor: 'help',
});

/** Interaction props for a glossary term span: hover drives the tooltip; clicks are swallowed
 *  (stopPropagation for the React advance handlers; data-vn-no-advance for the capture-phase
 *  window listeners — same marker the quick menu uses). */
const glossarySpanProps = (entryId: string, onGlossaryHover?: (entryId: string | null, ev: React.MouseEvent) => void) => ({
    'data-vn-no-advance': 'true',
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); },
    onMouseEnter: (e: React.MouseEvent) => onGlossaryHover?.(entryId, e),
    onMouseMove: (e: React.MouseEvent) => onGlossaryHover?.(entryId, e),
    onMouseLeave: (e: React.MouseEvent) => onGlossaryHover?.(null, e),
});

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
    // Optional since inline tags arrived: a line can reach the per-character path with NO
    // line-level effect (only some words tagged), so the chars outside a tag have none at all.
    effect: VNDialogueTextEffect | undefined,
    charIndex: number,
    totalChars: number
): React.CSSProperties {
    if (!effect || effect.type === 'none') return {};
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
    revealHighlight,
    glossaryMatches,
    onGlossaryHover,
    effectSpans,
    mentionSpans,
}) => {
    // Inject keyframe styles once
    useMemo(() => {
        injectTextEffectStyles();
    }, []);

    // Glossary terms only light up once the typewriter has revealed them completely.
    const visibleGlossary = (glossaryMatches ?? []).filter(m => m.start < m.end && m.end <= displayText.length);

    // Name mentions CLAMP instead — the name colors letter by letter as it types.
    const visibleMentions = (mentionSpans ?? [])
        .filter(m => m.start < m.end && m.start < displayText.length)
        .map(m => (m.end <= displayText.length ? m : { ...m, end: displayText.length }));

    // Inline tags put effects on PART of a line, so a line with no whole-line effect still needs
    // the per-character path below. Resolve each char against the innermost covering span.
    const spans = effectSpans && effectSpans.length ? effectSpans : null;
    const effectForChar = (index: number): VNDialogueTextEffect | undefined => {
        if (spans) {
            let winner: { start: number; end: number; effect: string; intensity?: number; speed?: number } | null = null;
            for (const s of spans) {
                if (index < s.start || index >= s.end) continue;
                // Innermost = the one that started latest (ties broken by the shorter span).
                if (!winner || s.start > winner.start || (s.start === winner.start && s.end < winner.end)) winner = s;
            }
            if (winner) return { type: winner.effect as VNTextEffectType, ...(winner.intensity !== undefined ? { intensity: winner.intensity } : {}), ...(winner.speed !== undefined ? { speed: winner.speed } : {}) };
        }
        return textEffect;
    };

    // If no effect or 'none', render plain text, split into segments along the karaoke range
    // and glossary match boundaries (a generalization of the old before/word/after split).
    if ((!textEffect || textEffect.type === 'none') && !spans) {
        const hlActive = !!(revealHighlight && revealHighlight.start < displayText.length);
        if (!hlActive && visibleGlossary.length === 0 && visibleMentions.length === 0) {
            return <span style={gradientStyle || undefined}>{displayText}</span>;
        }
        const hlStart = hlActive ? revealHighlight!.start : -1;
        const hlEnd = hlActive ? Math.min(revealHighlight!.end ?? displayText.length, displayText.length) : -1;
        const bounds = new Set<number>([0, displayText.length]);
        if (hlActive) { bounds.add(hlStart); bounds.add(hlEnd); }
        for (const m of visibleGlossary) { bounds.add(m.start); bounds.add(m.end); }
        for (const m of visibleMentions) { bounds.add(m.start); bounds.add(m.end); }
        const sorted = Array.from(bounds).sort((a, b) => a - b);
        const parts: React.ReactNode[] = [];
        for (let i = 0; i < sorted.length - 1; i++) {
            const s = sorted[i], e = sorted[i + 1];
            if (s >= e) continue;
            const text = displayText.slice(s, e);
            const match = visibleGlossary.find(m => m.start <= s && m.end >= e);
            const mention = visibleMentions.find(m => m.start <= s && m.end >= e);
            const inKaraoke = hlActive && s >= hlStart && e <= hlEnd;
            if (match) {
                // Karaoke merged LAST so the reading highlight momentarily wins over the term look.
                // (Mentions overlapping glossary were subtracted upstream — glossary wins.)
                parts.push(
                    <span key={i} {...glossarySpanProps(match.entryId, onGlossaryHover)}
                        style={{ ...glossaryTermStyle(match), ...(inKaraoke ? revealHighlightStyle(revealHighlight!) : {}) }}>
                        {text}
                    </span>
                );
            } else if (mention) {
                // Mention look below karaoke: the reading highlight passes over the name too.
                parts.push(
                    <span key={i} style={{ ...mentionStyle(mention), ...(inKaraoke ? revealHighlightStyle(revealHighlight!) : {}) }}>
                        {text}
                    </span>
                );
            } else if (inKaraoke) {
                parts.push(<span key={i} style={revealHighlightStyle(revealHighlight!)}>{text}</span>);
            } else {
                parts.push(<React.Fragment key={i}>{text}</React.Fragment>);
            }
        }
        return <span style={gradientStyle || undefined}>{parts}</span>;
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
                // Glossary: a term covering (any part of) this word attaches its hover/click
                // handlers at the WORD wrapper (chars are too small a hit target); the visual
                // highlight is applied per character below. Multi-word terms get the same
                // entry's handlers on each covered word.
                const wordEnd = wordStart + token.length;
                const wordMatch = visibleGlossary.find(m => m.start < wordEnd && m.end > wordStart);
                return (
                    <span
                        key={ti}
                        style={{ display: 'inline-block', whiteSpace: 'nowrap', ...(wordMatch ? { cursor: 'help' } : {}) }}
                        {...(wordMatch ? glossarySpanProps(wordMatch.entryId, onGlossaryHover) : {})}
                    >
                        {token.split('').map((char, ci) => {
                            const charStyle = getCharacterStyle(effectForChar(wordStart + ci), wordStart + ci, totalChars);
                            // Karaoke: chars in the currently revealed/spoken word carry the highlight.
                            const gi = wordStart + ci;
                            const hlStyle = revealHighlight && gi >= revealHighlight.start && gi < (revealHighlight.end ?? displayText.length)
                                ? revealHighlightStyle(revealHighlight) : undefined;
                            // Glossary term look per char (inline-block chars don't inherit a
                            // wrapper's text-decoration, so it must sit on each char).
                            const glStyle = wordMatch && gi >= wordMatch.start && gi < wordMatch.end
                                ? glossaryTermStyle(wordMatch) : undefined;
                            // Name mention look per char (mentions can span words — "Lady Ann").
                            const mnMatch = visibleMentions.find(m => gi >= m.start && gi < m.end);
                            const mnStyle = mnMatch ? mentionStyle(mnMatch) : undefined;
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
                                        // Precedence: base → mention → glossary → karaoke (last wins).
                                        ...(mnStyle || {}),
                                        ...(glStyle || {}),
                                        // Karaoke merged LAST — the reading highlight wins while passing over.
                                        ...(hlStyle || {}),
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
