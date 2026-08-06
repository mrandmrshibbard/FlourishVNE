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
/**
 * A CSS-safe font family name derived from author input (usually a filename). The FontFace
 * constructor REJECTS names with parentheses, dots, commas, etc. — a font registered with an
 * invalid family silently never loads, and every element referencing it falls back to the same
 * default typeface. Letters/digits/spaces/hyphens/underscores only; never starts with a digit.
 */
export const sanitizeFontFamily = (raw: string | null | undefined, fallback = 'Custom-Font'): string => {
    // ONE TOKEN, valid as a bare CSS identifier. The previous form kept spaces ("Font 8bitlim",
    // "My Font 2") — FontFace accepted those, but an UNQUOTED font-family declaration whose
    // second word starts with a digit is INVALID CSS: the browser drops the whole declaration
    // and the text silently falls back to the default face at every use site.
    let family = String(raw ?? '').replace(/[^\p{L}\p{N} _-]+/gu, ' ').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!family) family = fallback;
    if (/^\d/.test(family)) family = `Font-${family}`;
    return family;
};

/**
 * A font-family value safe to put in CSS/style attributes. Families STORED by older versions
 * can contain spaces with digit-leading words ("Font 8bitlim", "My Font 2") — valid for
 * FontFace registration but INVALID as an unquoted font-family declaration, so the browser
 * dropped the declaration and the font "didn't work" despite being loaded. Quoting heals them.
 * Stacks (with commas) and already-quoted values pass through untouched.
 */
export const cssFontFamily = (family: string | null | undefined): string | undefined => {
    if (!family) return undefined;
    const f = String(family).trim();
    if (!f || f.includes(',') || f.startsWith('"') || f.startsWith("'")) return f || undefined;
    // A single clean CSS identifier can stay bare; EVERYTHING else (spaces, digit-leading
    // tokens, odd punctuation) gets quoted - quoting a name that did not need quotes is
    // always harmless.
    const isBareIdent = /^[A-Za-z_ -￿][A-Za-z0-9_ -￿-]*$/.test(f);
    return isBareIdent ? f : '"' + f.replace(/"/g, '') + '"';
};

/**
 * Outline-complexity check for TrueType fonts. Some display fonts (e.g. "inflated balloon"
 * demos) pack tens of thousands of contour points into EVERY glyph — ~43KB of outline data
 * per letter vs ~1–3KB in normal fonts. Chromium 120's rasterizer (the desktop app) HANGS
 * the whole renderer on the FIRST paint of such a glyph — the window freezes solid, which
 * users report as a crash. Parsing is fine; only drawing dies — so we measure the bytes and
 * refuse to ever draw. Returns null for non-TTF containers (CFF/WOFF — no glyf to measure).
 */
export const analyzeFontComplexity = (buf: ArrayBuffer): { glyphs: number; avgGlyphBytes: number; tooComplex: boolean } | null => {
    try {
        const dv = new DataView(buf);
        if (buf.byteLength < 12) return null;
        const ver = dv.getUint32(0, false);
        if (ver !== 0x00010000 && ver !== 0x74727565 /* 'true' */) return null;
        const numTables = dv.getUint16(4, false);
        let glyfLen = 0, maxpOff = -1;
        for (let i = 0; i < numTables && 12 + i * 16 + 16 <= buf.byteLength; i++) {
            const off = 12 + i * 16;
            const tag = String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
            if (tag === 'glyf') glyfLen = dv.getUint32(off + 12, false);
            if (tag === 'maxp') maxpOff = dv.getUint32(off + 8, false);
        }
        if (!glyfLen || maxpOff < 0 || maxpOff + 6 > buf.byteLength) return null;
        const glyphs = dv.getUint16(maxpOff + 4, false);
        if (!glyphs) return null;
        const avgGlyphBytes = glyfLen / glyphs;
        // Normal fonts: 1–3KB/glyph; rich display fonts ~5KB. The freezing specimen: ~43KB.
        return { glyphs, avgGlyphBytes, tooComplex: avgGlyphBytes > 10 * 1024 };
    } catch { return null; }
};

/**
 * Does THIS renderer freeze on ultra-complex glyph outlines? Chromium 120 (the app's current
 * Electron) hangs solid; Chromium ≥130 renders the same font in milliseconds (verified).
 * Gating the refusal here means: web games in modern browsers use such fonts TODAY, and the
 * desktop restriction lifts itself automatically the day the app's Electron is upgraded.
 * Unknown engines (Firefox/Safari — no Chrome token) are not refused: no evidence they hang.
 */
export const rendererFreezesOnComplexFonts = (): boolean => {
    try {
        const m = (navigator.userAgent || '').match(/Chrome\/(\d+)/);
        return !!m && parseInt(m[1], 10) < 130;
    } catch { return false; }
};

/** Fonts refused by the complexity check — remembered so the loaders skip them instantly. */
const refusedFontKeys = new Set<string>();

/**
 * Register a custom font EXACTLY ONCE per (family, source). Engine code — used by the editor's
 * font loader and the in-game engine alike.
 *
 * Why once: the loaders re-run whenever the project's characters/fonts change (in the editor
 * that's every character edit). Each `new FontFace().load()` re-parses the whole font file and
 * `document.fonts.add` keeps every OBJECT (the set dedups by identity, not content) — with a
 * large font that repeat-decode grew until the renderer died. The URL passed here must already
 * be RESOLVED (resolveFieldUrl) — a bare managed ref like "assets/fonts/x.ttf" 404s against
 * the page and the font silently falls back to the default face.
 */
const loadedFontKeys = new Set<string>();
export const loadFontOnce = async (family: string, resolvedUrl: string | null | undefined): Promise<boolean> => {
    if (!family || !resolvedUrl) return false;
    const key = `${family}|${resolvedUrl.slice(0, 256)}|${resolvedUrl.length}`;
    if (loadedFontKeys.has(key)) return true;
    if (refusedFontKeys.has(key)) return false;
    try {
        // Refuse renderer-freezing fonts BEFORE they can ever be drawn — this also un-bricks
        // projects that already contain one (the font falls back; the app stays responsive
        // so the author can delete or replace it).
        try {
            if (rendererFreezesOnComplexFonts()) {
                const res = await fetch(resolvedUrl);
                if (res.ok) {
                    const info = analyzeFontComplexity(await res.arrayBuffer());
                    if (info?.tooComplex) {
                        refusedFontKeys.add(key);
                        console.error(`Font "${family}" refused: ~${Math.round(info.avgGlyphBytes / 1024)}KB of outline data per glyph would freeze rendering in this app version. Use a simpler version of this font.`);
                        return false;
                    }
                }
            }
        } catch { /* unreadable here — let FontFace try below, exactly as before */ }
        const face = new FontFace(family, `url(${resolvedUrl})`);
        await face.load();
        (document as any).fonts.add(face);
        loadedFontKeys.add(key);
        return true;
    } catch (error) {
        console.error(`Failed to load font "${family}":`, error);
        return false;
    }
};

export const fontSettingsToStyle = (settings: VNFontSettings | undefined | null): React.CSSProperties => {
    /** Wrap a px value so it responds to the --font-scale CSS variable. */
    const px = (n: number) => `calc(var(--font-scale, 1) * ${n}px)`;

    // A missing font block must never crash a render (elements from imports/plugins/
    // generators may omit optional fonts the editor UI would have seeded). Inherit-ish
    // defaults keep the element visible so the author can style it in the inspector.
    if (!settings) {
        return { fontSize: px(16), color: '#ffffff', textAlign: 'left' };
    }

    const style: React.CSSProperties = {
        fontFamily: cssFontFamily(settings.family),
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

    // Text border / stroke. `paint-order` draws the stroke BEHIND the fill — without it the
    // stroke is centered on the glyph edge and its inner half eats the letter, which gets
    // brutal on bold text (a user: "bolding swallows 90% of the fill"). Behind-fill, the
    // border only grows outward, so weight and border thickness are independent.
    if (settings.textBorder?.enabled) {
        (style as any).WebkitTextStroke = `${px(settings.textBorder.width)} ${settings.textBorder.color}`;
        (style as any).paintOrder = 'stroke fill';
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
export const extractTextGradientStyle = (settings: VNFontSettings | undefined | null): React.CSSProperties | null => {
    if (!settings || !settings.textGradient?.enabled || settings.textGradient.colors.length < 2) return null;
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
        // Stroke behind the fill (see fontSettingsToStyle) — bold no longer swallows the letter.
        (containerStyle as any).paintOrder = 'stroke fill';
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