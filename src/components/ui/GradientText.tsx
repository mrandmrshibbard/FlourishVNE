import React, { useRef, useLayoutEffect } from 'react';

/**
 * Renders gradient-clipped text (`-webkit-background-clip: text`) that updates correctly
 * when the gradient changes live in the editor.
 *
 * Chromium has a long-standing bug: when the `background` of an element with
 * `-webkit-background-clip: text` changes, it fails to re-clip — the gradient paints the
 * whole box (showing through / behind the text) until the element is repainted from scratch
 * (which is why toggling the gradient off/on "fixed" it). We force that repaint imperatively
 * by flipping `background-clip` and triggering a reflow whenever the background changes.
 *
 * Pass the gradient style (e.g. from `extractTextGradientStyle` / `buildTextEffectStyles`)
 * as `style`. When `style` is null/has no text-clip, it renders a plain span.
 */
export const GradientText: React.FC<{
    style?: React.CSSProperties | null;
    className?: string;
    children: React.ReactNode;
}> = ({ style, className, children }) => {
    const ref = useRef<HTMLSpanElement>(null);
    const isClip = !!style && ((style as any).WebkitBackgroundClip === 'text' || (style as any).backgroundClip === 'text');
    const bg = (style as any)?.background ?? (style as any)?.backgroundImage;

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || !isClip) return;
        // Force Chromium to re-clip the background to the glyphs after it changed.
        const s = el.style as any;
        s.webkitBackgroundClip = 'initial';
        s.backgroundClip = 'initial';
        // Reading offset triggers a synchronous reflow before the next paint.
        void el.offsetHeight;
        s.webkitBackgroundClip = 'text';
        s.backgroundClip = 'text';
    }, [bg, isClip]);

    return <span ref={ref} className={className} style={style || undefined}>{children}</span>;
};

export default GradientText;
