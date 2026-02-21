import React from 'react';
import { VNFontSettings } from "../features/ui/types";

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

    // Text shadow
    if (settings.textShadow?.enabled) {
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
 */
export const extractTextGradientStyle = (settings: VNFontSettings): React.CSSProperties | null => {
    if (!settings.textGradient?.enabled || settings.textGradient.colors.length < 2) return null;
    const grad = settings.textGradient;
    return {
        background: grad.type === 'radial'
            ? `radial-gradient(circle, ${grad.colors.join(', ')})`
            : `linear-gradient(${grad.angle}deg, ${grad.colors.join(', ')})`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
    } as React.CSSProperties;
};