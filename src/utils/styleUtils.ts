import React from 'react';
import { VNFontSettings } from "../features/ui/types";

/**
 * Build a CSS transform fragment for an element's orientation (rotation + flips).
 * Returns an empty string when nothing is set, so callers can safely compose it with
 * other transforms: `transform: \`translate(...) ${buildOrientationTransform(o)}\`.trim()`.
 *
 * flipX/flipY are applied as scale(-1); rotation is in degrees (positive = clockwise).
 */
export const buildOrientationTransform = (o?: { rotation?: number; flipX?: boolean; flipY?: boolean }): string => {
    if (!o) return '';
    const parts: string[] = [];
    if (o.rotation) parts.push(`rotate(${o.rotation}deg)`);
    const sx = o.flipX ? -1 : 1;
    const sy = o.flipY ? -1 : 1;
    if (sx !== 1 || sy !== 1) parts.push(`scale(${sx}, ${sy})`);
    return parts.join(' ');
};

/**
 * Convert VNFontSettings to a React CSSProperties object.
 * All pixel values are wrapped with `calc(var(--font-scale, 1) * Npx)` so
 * that containers can set the `--font-scale` CSS custom-property to
 * scale text proportionally with their rendered size.
 *
 * Set `--font-scale` on a container via:
 *   style={{ '--font-scale': containerWidth / designWidth } as CSSProperties}
 *
 * NOTE: Text gradients are NOT included in the returned style because
 * `background-clip: text` only works correctly on inline elements that
 * tightly wrap the text.  Use `extractTextGradientStyle(settings)` to get
 * those props and apply them to a child `<span>` around the text content.
 */
export const fontSettingsToStyle = (settings: VNFontSettings): React.CSSProperties => {
    /** Wrap a px value so it responds to the --font-scale CSS variable. */
    const px = (n: number) => `calc(var(--font-scale, 1) * ${n}px)`;

    const style: React.CSSProperties = {
        fontFamily: settings.family,
        fontSize: px(settings.size),
        color: settings.color,
        fontWeight: settings.weight,
        fontStyle: settings.italic ? 'italic' : 'normal',
        textAlign: settings.align || 'left',
        letterSpacing: settings.letterSpacing ? px(settings.letterSpacing) : undefined,
    };

    // Text shadow — only apply if no gradient is active. 
    // When gradient is active, shadow is applied to the gradient span instead
    // to ensure proper layering (shadow behind text, not on top).
    if (settings.textShadow?.enabled && (!settings.textGradient?.enabled || settings.textGradient.colors.length < 2)) {
        const ts = settings.textShadow;
        style.textShadow = `${px(ts.offsetX)} ${px(ts.offsetY)} ${px(ts.blur)} ${ts.color}`;
    }

    // Text border / stroke
    if (settings.textBorder?.enabled) {
        (style as any).WebkitTextStroke = `${px(settings.textBorder.width)} ${settings.textBorder.color}`;
    }

    return style;
};

/**
 * Returns CSS properties for the text-gradient effect (if enabled).
 * Must be applied to an **inline** wrapper `<span>` around the text, NOT
 * on the container / parent element.  Returns `null` when no gradient is active.
 * 
 * Uses CSS filter drop-shadow (not text-shadow) when shadow is enabled, because
 * text-shadow renders on top of transparent text. The drop-shadow filter applies
 * the shadow behind the content properly.
 */
export const extractTextGradientStyle = (settings: VNFontSettings): React.CSSProperties | null => {
    if (!settings.textGradient?.enabled || settings.textGradient.colors.length < 2) return null;
    const grad = settings.textGradient;
    const style: React.CSSProperties = {
        background: grad.type === 'radial'
            ? `radial-gradient(circle, ${grad.colors.join(', ')})`
            : `linear-gradient(${grad.angle}deg, ${grad.colors.join(', ')})`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        // inline-block gives the gradient a proper box to clip against; without it an inline
        // span mis-clips/repaints the gradient (paints the line box) when colors change.
        display: 'inline-block',
    };
    
    // Use CSS filter drop-shadow (not text-shadow) for proper layering behind transparent text.
    // text-shadow renders on top with transparent fills; drop-shadow renders behind correctly.
    // Apply font-scale so shadow offset/blur match between editor and built game.
    if (settings.textShadow?.enabled) {
        const px = (n: number) => `calc(var(--font-scale, 1) * ${n}px)`;
        const ts = settings.textShadow;
        style.filter = `drop-shadow(${px(ts.offsetX)} ${px(ts.offsetY)} ${px(ts.blur)} ${ts.color})`;
    }
    
    return style as React.CSSProperties;
};

/**
 * Build container + gradient-span styles for ad-hoc text effects (ShowText overlay
 * command, etc.) that store textShadow/textGradient/textBorder as inline fields
 * rather than a VNFontSettings object.
 *
 * Returns:
 *   - containerStyle: properties to merge on the outer/text container.
 *     Includes text-shadow when no gradient is active (so the shadow sits behind text),
 *     and the WebkitTextStroke for borders.
 *   - gradientSpanStyle: properties to apply to an inline `<span>` wrapping the text,
 *     OR null when no gradient is configured. Includes a `filter: drop-shadow(...)`
 *     so the shadow renders behind the transparent gradient text (not on top of it).
 *
 * All px values use `calc(var(--font-scale, 1) * Npx)` so editor and built games
 * scale identically.
 */
export const buildTextEffectStyles = (
    effects: {
        textShadow?: { enabled: boolean; offsetX: number; offsetY: number; blur: number; color: string };
        textGradient?: { enabled: boolean; type: 'linear' | 'radial'; angle: number; colors: string[] };
        textBorder?: { enabled: boolean; width: number; color: string };
    },
    options?: { scaleWithFontVar?: boolean }
): { containerStyle: React.CSSProperties; gradientSpanStyle: React.CSSProperties | null } => {
    const scale = options?.scaleWithFontVar !== false;
    const px = (n: number) => scale ? `calc(var(--font-scale, 1) * ${n}px)` : `${n}px`;
    const hasGradient = !!(effects.textGradient?.enabled && effects.textGradient.colors.length >= 2);
    const containerStyle: React.CSSProperties = {};
    let gradientSpanStyle: React.CSSProperties | null = null;

    if (effects.textBorder?.enabled) {
        (containerStyle as any).WebkitTextStroke = `${px(effects.textBorder.width)} ${effects.textBorder.color}`;
    }

    if (hasGradient) {
        const g = effects.textGradient!;
        gradientSpanStyle = {
            background: g.type === 'radial'
                ? `radial-gradient(circle, ${g.colors.join(', ')})`
                : `linear-gradient(${g.angle}deg, ${g.colors.join(', ')})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            // inline-block gives the gradient a proper box to clip against (fixes the
            // canvas mis-render when adjusting gradient colors).
            display: 'inline-block',
        } as React.CSSProperties;
        if (effects.textShadow?.enabled) {
            const ts = effects.textShadow;
            // drop-shadow on gradient span: shadow renders behind the gradient text fill
            gradientSpanStyle.filter = `drop-shadow(${px(ts.offsetX)} ${px(ts.offsetY)} ${px(ts.blur)} ${ts.color})`;
        }
    } else if (effects.textShadow?.enabled) {
        const ts = effects.textShadow;
        containerStyle.textShadow = `${px(ts.offsetX)} ${px(ts.offsetY)} ${px(ts.blur)} ${ts.color}`;
    }

    return { containerStyle, gradientSpanStyle };
};