/**
 * Choice-button chrome resolution — the ONE home for every derived choice style value.
 *
 * History: the choice button was hand-copied in four places (engine ChoiceMenu, StagingArea,
 * InGameUIEditor preview, plus the generated engine bundle) and the copies drifted until the
 * surfaces disagreed about hover, video art, asset URLs, and geometry. Everything now flows
 * through this module + ChoiceButtonsView so divergence is structurally impossible.
 *
 * Container-semantics note (deliberately preserved, do not "fix" casually):
 * `choiceButtonHeight` is PER-BUTTON game px, but the stack container's height is that same
 * value as a % of game height (one button tall, default 25%), with the stack CENTERED inside.
 * With several options the stack symmetrically overflows the stored rect — the visual stack
 * position therefore depends on option count. Changing this would move every existing game's
 * choices; a future additive `choiceStackAnchor` field is the vehicle if we ever revisit it.
 */
import type React from 'react';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { resolveFieldUrl } from '../../utils/assetStore';

/** Scale a pixel value by the --font-scale CSS variable (stageWidth / gameResolution.width). */
export const scalePx = (n: number) => `calc(var(--font-scale,1) * ${n}px)`;

/** Convert hex color + opacity (0-100) to rgba string.
 *  EXACT port of the engine's historical function, quirks included: a non-#RRGGBB input
 *  (e.g. 'transparent' or an rgba() string) yields `rgba(NaN,…)`, an INVALID declaration the
 *  browser drops — which is precisely how 'transparent' choice backgrounds have always
 *  "worked". Do not "fix" this without a parity pass; projects depend on the dropped decl. */
export function hexToRgba(hex: string, opacity: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

export function buildImageBackgroundStyle(url: string, sizeMode: string, slicePx?: number): React.CSSProperties {
    switch (sizeMode) {
        case 'nine-slice': {
            const s = slicePx ?? 30;
            return {
                borderImageSource: `url(${url})`,
                borderImageSlice: `${s} fill`,
                borderImageWidth: `calc(var(--font-scale,1) * ${s}px)`,
                borderImageRepeat: 'stretch',
                borderStyle: 'solid',
                borderColor: 'transparent',
                borderWidth: `calc(var(--font-scale,1) * ${s}px)`,
            };
        }
        case 'contain':
            return { backgroundImage: `url(${url})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
        case 'cover':
            return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
        case 'tile':
            return { backgroundImage: `url(${url})`, backgroundSize: 'auto', backgroundRepeat: 'repeat' };
        case 'stretch':
        default:
            return { backgroundImage: `url(${url})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
    }
}

export interface ChoiceChrome {
    choiceButtonUrl: string | null;
    isChoiceButtonVideo: boolean;
    choiceBorderUrl: string | null;
    choiceBorderPadding: number;
    choiceHoverUrl: string | null;
    choicePadding: number;
    choiceSizeMode: string;
    choiceSlice: number;
    choiceOpacity: number;
    choiceBorderRadius: number;
    choiceHeight: number;
    choiceBgColor: string;
    choiceHoverBgColor: string;
    /** Stack rect as % of the stage (see container-semantics note above). */
    rect: { xPct: number; yPct: number; wPct: number; hPct: number };
}

/** Every derived chrome value the button renderers need, from the global project.ui style.
 *  A won coloring mini game's captured palette outranks the authored global style; explicit
 *  per-option colors still win over both (applied in ChoiceButtonsView). */
export function resolveChoiceChrome(project: VNProject, projectUI: any, uiPalette?: Record<string, string> | null): ChoiceChrome {
    const choiceButtonUrl = projectUI.choiceButtonImage
        ? resolveFieldUrl(project.id, projectUI.choiceButtonImage.type === 'video'
            ? (project.videos[projectUI.choiceButtonImage.id]?.videoUrl || (project.images[projectUI.choiceButtonImage.id] as any)?.videoUrl || (project.backgrounds[projectUI.choiceButtonImage.id] as any)?.videoUrl)
            : (project.images[projectUI.choiceButtonImage.id]?.imageUrl || project.backgrounds[projectUI.choiceButtonImage.id]?.imageUrl)
          )
        : null;
    const choiceBorderUrl = projectUI.choiceButtonBorderImage
        ? resolveFieldUrl(project.id, project.images[projectUI.choiceButtonBorderImage.id]?.imageUrl || project.backgrounds[projectUI.choiceButtonBorderImage.id]?.imageUrl)
        : null;
    const choiceHoverUrl = projectUI.choiceHoverImage
        ? resolveFieldUrl(project.id, project.images[projectUI.choiceHoverImage.id]?.imageUrl || project.backgrounds[projectUI.choiceHoverImage.id]?.imageUrl)
        : null;

    const choiceWidth = projectUI.choiceButtonWidth || 0;
    const choiceHeight = projectUI.choiceButtonHeight || 0;
    const choiceColor = uiPalette?.choiceBg ?? projectUI.choiceButtonColor ?? '#1e293b';
    const choiceOpacity = projectUI.choiceButtonOpacity ?? 90;
    const choiceHoverColor = projectUI.choiceHoverColor ?? '#334155';

    const gameW = project.gameResolution?.width || 1920;
    const gameH = project.gameResolution?.height || 1080;
    const wPct = choiceWidth ? (choiceWidth * 100 / gameW) : 30;
    const hPct = choiceHeight ? (choiceHeight * 100 / gameH) : 25;

    return {
        choiceButtonUrl,
        isChoiceButtonVideo: projectUI.choiceButtonImage?.type === 'video',
        choiceBorderUrl,
        choiceBorderPadding: projectUI.choiceBorderPadding ?? 8,
        choiceHoverUrl,
        choicePadding: projectUI.choiceButtonPadding ?? 16,
        choiceSizeMode: projectUI.choiceButtonSizeMode ?? 'stretch',
        choiceSlice: projectUI.choiceButtonSlice ?? 15,
        choiceOpacity,
        choiceBorderRadius: projectUI.choiceButtonBorderRadius ?? 8,
        choiceHeight,
        choiceBgColor: hexToRgba(choiceColor, choiceOpacity),
        choiceHoverBgColor: hexToRgba(choiceHoverColor, choiceOpacity),
        rect: {
            xPct: projectUI.choiceButtonX ?? (50 - wPct / 2),
            yPct: projectUI.choiceButtonY ?? 35,
            wPct,
            hPct,
        },
    };
}

/** Resolve a per-option art asset (image/video) to a URL. */
export function resolveChoiceOptionImg(project: VNProject, a?: { type: 'image' | 'video'; id: VNID } | null): string | null {
    if (!a) return null;
    return resolveFieldUrl(project.id, a.type === 'video'
        ? (project.videos[a.id]?.videoUrl || (project.backgrounds[a.id] as any)?.videoUrl || (project.images[a.id] as any)?.videoUrl || null)
        : (project.images[a.id]?.imageUrl || project.backgrounds[a.id]?.imageUrl || null));
}
