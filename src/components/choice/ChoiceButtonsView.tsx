/**
 * THE choice-button renderer — the single implementation behind every surface:
 * the engine's ChoiceMenu (test play + built games via build:engine), the StagingArea
 * canvas, and the In-Game UI editor preview. Behavioral port of the engine's historical
 * renderButton/stack code, with every Tailwind utility converted to inline styles so the
 * choice path renders identically with or without the Tailwind CDN (built games used to
 * lose ALL button styling offline).
 *
 * Inline-conversion contract (values are Tailwind's own):
 *   mb-3 / gap-3            → '0.75rem'
 *   transition-all duration-200 → 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)'
 *   hover:scale-[1.03]      → per-button hover state → transform: scale(1.03)
 *   preflight button reset  → explicit margin 0, border 0, fontFamily 'inherit'
 *   line-height             → EXPLICIT 1.6 (the editor page's body value — authoring truth;
 *                             builds historically got preflight's 1.5 and diverged)
 * Keep the vnChoice* keyframes in this file's <style> block: they must stay engine-inline
 * (built games have no external CSS for them) — engineInlineCss.test.ts scans this file.
 */
import React, { useState, useEffect, useRef } from 'react';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { ChoiceOption } from '../../features/scene/types';
import { interpolateVariables } from '../../utils/variableInterpolation';
import { fontSettingsToStyle, extractTextGradientStyle } from '../../utils/styleUtils';
import { resolveVideoTrim } from '../../utils/videoTrim';
import TrimmedVideo from '../ui/TrimmedVideo';
import { scalePx, hexToRgba, buildImageBackgroundStyle, resolveChoiceChrome, resolveChoiceOptionImg, ChoiceChrome } from './choiceButtonStyle';

export interface ChoiceButtonsViewProps {
    project: VNProject;
    projectUI: any;
    options: ChoiceOption[];
    variables?: Record<VNID, string | number | boolean>;
    layout?: 'vertical' | 'horizontal' | 'free';
    uiPalette?: Record<string, string> | null;
    /** false = editor sample band: buttons are non-focusable and clicks are inert. */
    interactive?: boolean;
    onSelect?: (choice: ChoiceOption) => void;
    timeLimit?: number;
    showTimer?: boolean;
    onTimeout?: () => void;
    /** Editor box-hugging: reports the rendered stack height in px (vertical layout only). */
    onMeasureStack?: (px: number) => void;
    /** Editor: suppress video art while test play is running (browser evicts the stream). */
    suppressVideo?: boolean;
    /** Editor: bump to force video remount after test play ends. */
    videoNonce?: string | number;
    /** When the stack should be positioned by the PARENT (editor preview fills its box)
     *  instead of self-positioning at the project rect. */
    fillParent?: boolean;
}

/** One choice button, engine-exact. Hover is per-button state (only one hovers at a time). */
const ChoiceButtonInner: React.FC<{
    project: VNProject;
    projectUI: any;
    chrome: ChoiceChrome;
    choice: ChoiceOption;
    fill: boolean;
    interactive: boolean;
    variables: Record<VNID, string | number | boolean>;
    uiPalette?: Record<string, string> | null;
    onSelect?: (choice: ChoiceOption) => void;
    suppressVideo?: boolean;
    videoNonce?: string | number;
}> = ({ project, projectUI, chrome, choice, fill, interactive, variables, uiPalette, onSelect, suppressVideo, videoNonce }) => {
    const [isHovered, setIsHovered] = useState(false);
    const interpolatedText = interpolateVariables(choice.text, variables, project);
    const optImg = resolveChoiceOptionImg(project, choice.image);
    const optHoverImg = resolveChoiceOptionImg(project, choice.hoverImage);
    const baseImg = optImg ?? chrome.choiceButtonUrl;
    const baseIsVideo = optImg ? choice.image?.type === 'video' : chrome.isChoiceButtonVideo;
    const baseTrimRef: any = optImg ? choice.image : projectUI.choiceButtonImage;
    const baseTrimAsset: any = baseTrimRef?.id ? ((project.videos as any)[baseTrimRef.id] || (project.images as any)[baseTrimRef.id] || (project.backgrounds as any)[baseTrimRef.id]) : undefined;
    const baseTrim = resolveVideoTrim(baseTrimRef, baseTrimAsset); // per-use ref trim wins; else asset default
    const hoverImg = optHoverImg ?? chrome.choiceHoverUrl;
    const activeButtonUrl = (isHovered && hoverImg) ? hoverImg : baseImg;
    const optBg = choice.backgroundColor ? hexToRgba(choice.backgroundColor, chrome.choiceOpacity) : chrome.choiceBgColor;
    const optHoverBg = choice.hoverBackgroundColor ? hexToRgba(choice.hoverBackgroundColor, chrome.choiceOpacity) : chrome.choiceHoverBgColor;
    const optRadius = choice.borderRadius ?? chrome.choiceBorderRadius;
    const hasImg = !!(baseImg || chrome.choiceBorderUrl);
    return (
        <button
            {...(interactive ? {} : { type: 'button' as const, tabIndex: -1 })}
            onClick={interactive ? () => onSelect?.(choice) : undefined}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                // Preflight-equivalent reset (choice path must not depend on Tailwind).
                // `background` SHORTHAND on purpose: the color arms below use the longhands, so
                // when hexToRgba emits its historical invalid rgba(NaN…) (the 'transparent'
                // quirk) the browser drops the longhand and this shorthand's transparent holds.
                margin: 0,
                border: 0,
                background: 'transparent',
                fontFamily: 'inherit',
                lineHeight: 1.6,
                // relative overflow-hidden w-full transition-all duration-200 hover:scale-[1.03]
                position: 'relative',
                overflow: 'hidden',
                width: '100%',
                transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                transform: isHovered ? 'scale(1.03)' : undefined,
                borderRadius: scalePx(optRadius),
                ...(fill ? { height: '100%' } : {}),
                ...(activeButtonUrl && !baseIsVideo
                    ? {
                        ...buildImageBackgroundStyle(activeButtonUrl, chrome.choiceSizeMode, chrome.choiceSlice),
                        backgroundColor: isHovered ? optHoverBg : optBg,
                      }
                    : !hasImg
                        ? {
                            backgroundColor: isHovered ? optHoverBg : optBg,
                            border: uiPalette?.choiceBorder ? `2px solid ${uiPalette.choiceBorder}` : '1px solid rgba(148,163,184,0.3)',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
                            backdropFilter: 'blur(6px)',
                            WebkitBackdropFilter: 'blur(6px)',
                          }
                        : { backgroundColor: isHovered ? optHoverBg : 'transparent' }),
                padding: `${scalePx(chrome.choicePadding)} ${scalePx(chrome.choicePadding * 2)}`,
                ...(!fill && chrome.choiceHeight ? { height: scalePx(chrome.choiceHeight) } : {}),
                ...fontSettingsToStyle(projectUI.choiceTextFont),
                ...(uiPalette?.choiceText ? { color: uiPalette.choiceText } : {}),
                ...(choice.fontSize ? { fontSize: scalePx(choice.fontSize) } : {}),
                ...(choice.textColor ? { color: choice.textColor } : {}),
                textAlign: (projectUI.choiceTextFont?.align || 'center') as any,
                wordBreak: 'normal' as const,
                overflowWrap: 'break-word' as const,
                cursor: (projectUI as any)?.cursors?.choices === 'arrow' ? 'var(--vn-cursor-normal, default)' : 'var(--vn-cursor-hand, pointer)',
            }}
        >
            {baseIsVideo && baseImg && !suppressVideo && (
                <TrimmedVideo key={videoNonce !== undefined ? `chv-${baseImg}-${videoNonce}` : undefined}
                    src={baseImg} autoPlay loop muted trimStart={baseTrim.start} trimEnd={baseTrim.end}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: -10, pointerEvents: 'none', objectFit: 'fill', borderRadius: scalePx(optRadius) }} />
            )}
            <span style={{ position: 'relative', zIndex: 10, ...(extractTextGradientStyle(projectUI.choiceTextFont) || {}), ...(uiPalette?.choiceText && !choice.textColor ? { color: uiPalette.choiceText, background: 'none', WebkitTextFillColor: uiPalette.choiceText } : {}), ...(choice.textColor ? { color: choice.textColor } : {}) }}>{interpolatedText}</span>
        </button>
    );
};

/** Standalone single button for the StagingArea free-layout EDIT path: ResizableDraggable
 *  owns position/size; the button face comes from the exact engine rendering. */
export const SingleChoiceButton: React.FC<{
    project: VNProject;
    projectUI: any;
    option: ChoiceOption;
    fill?: boolean;
    variables?: Record<VNID, string | number | boolean>;
    uiPalette?: Record<string, string> | null;
}> = ({ project, projectUI, option, fill = true, variables = {}, uiPalette }) => {
    const chrome = resolveChoiceChrome(project, projectUI, uiPalette);
    return <ChoiceButtonInner project={project} projectUI={projectUI} chrome={chrome} choice={option}
        fill={fill} interactive={false} variables={variables} uiPalette={uiPalette} />;
};

export const ChoiceButtonsView: React.FC<ChoiceButtonsViewProps> = ({
    project, projectUI, options, variables = {}, layout, uiPalette,
    interactive = true, onSelect, timeLimit, showTimer, onTimeout,
    onMeasureStack, suppressVideo, videoNonce, fillParent,
}) => {
    const chrome = resolveChoiceChrome(project, projectUI, uiPalette);

    // Time-limited choice: count down while shown; fire onTimeout once at 0. The shrinking bar
    // reads `remaining`. Restarts when the option set or the limit changes (a new Choice command).
    const [remaining, setRemaining] = useState<number>(timeLimit ?? 0);
    useEffect(() => {
        if (!timeLimit || timeLimit <= 0) return;
        setRemaining(timeLimit);
        const start = performance.now();
        let raf = 0;
        let fired = false;
        const tick = () => {
            const left = Math.max(0, timeLimit - (performance.now() - start) / 1000);
            setRemaining(left);
            if (left <= 0) { if (!fired) { fired = true; onTimeout?.(); } return; }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeLimit, options]);
    const showCountdown = !!(timeLimit && timeLimit > 0 && showTimer);
    const countdownFrac = timeLimit && timeLimit > 0 ? Math.max(0, Math.min(1, remaining / timeLimit)) : 0;
    const countdownOverlay = showCountdown ? (
        <div style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: '3%', width: '40%', height: scalePx(8), background: 'rgba(0,0,0,0.45)', borderRadius: 999, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                <div style={{ height: '100%', width: `${countdownFrac * 100}%`, background: projectUI.choiceHoverColor || '#6B4C9A', transition: 'width 0.12s linear' }} />
            </div>
        </div>
    ) : null;

    // Editor box-hugging: report the true rendered stack height (children + their margins).
    const stackRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!onMeasureStack) return;
        const el = stackRef.current;
        if (!el) return;
        const measure = () => {
            let sum = 0;
            Array.from(el.children).forEach(c => {
                const h = (c as HTMLElement).offsetHeight;
                const mb = parseFloat(getComputedStyle(c as HTMLElement).marginBottom) || 0;
                if ((c as HTMLElement).tagName !== 'STYLE') sum += h + mb;
            });
            if (sum > 0) onMeasureStack(sum);
        };
        measure();
        const ro = new ResizeObserver(measure);
        Array.from(el.children).forEach(c => { if ((c as HTMLElement).tagName !== 'STYLE') ro.observe(c as Element); });
        return () => ro.disconnect();
    });

    const choiceKeyframes = (
        <style>{`
            @keyframes vnChoiceOverlayIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes vnChoiceSlideIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
    );

    // ── Free layout: each option positioned/sized by its own x/y/width/height ──
    if (layout === 'free') {
        return (
            <>
            {countdownOverlay}
            <div style={{ position: 'absolute', inset: 0, zIndex: 30, pointerEvents: 'none', animation: 'vnChoiceOverlayIn 0.3s ease-out' }}>
                {options.map((choice, index) => {
                    const bx = choice.x ?? (34 + index * 2);
                    const by = choice.y ?? (40 + index * 12);
                    const bw = choice.width ?? 25;
                    const bh = choice.height ?? 9;
                    return (
                        <div key={index} style={{
                            position: 'absolute', left: `${bx}%`, top: `${by}%`, width: `${bw}%`, height: `${bh}%`, pointerEvents: 'auto',
                            animation: `vnChoiceSlideIn 0.35s ease-out ${index * 0.08}s both`,
                            ...(chrome.choiceBorderUrl ? { ...buildImageBackgroundStyle(chrome.choiceBorderUrl, chrome.choiceSizeMode, chrome.choiceSlice), padding: scalePx(chrome.choiceBorderPadding), borderRadius: scalePx(chrome.choiceBorderRadius) } : {}),
                        }}>
                            <ChoiceButtonInner project={project} projectUI={projectUI} chrome={chrome} choice={choice}
                                fill={true} interactive={interactive} variables={variables} uiPalette={uiPalette}
                                onSelect={onSelect} suppressVideo={suppressVideo} videoNonce={videoNonce} />
                        </div>
                    );
                })}
                {choiceKeyframes}
            </div>
            </>
        );
    }

    // ── Vertical (default) or Horizontal stack ──
    const horizontal = layout === 'horizontal';
    return (
        <>
        {countdownOverlay}
        <div ref={stackRef}
             style={{
                 // absolute z-30 flex (flex-row flex-wrap gap-3 | flex-col) items-center justify-center
                 display: 'flex',
                 flexDirection: horizontal ? 'row' : 'column',
                 ...(horizontal ? { flexWrap: 'wrap' as const, gap: '0.75rem' } : {}),
                 alignItems: 'center',
                 justifyContent: 'center',
                 ...(fillParent
                     ? { width: '100%', height: '100%' }
                     : {
                         position: 'absolute' as const,
                         zIndex: 30,
                         left: `${chrome.rect.xPct}%`,
                         top: `${chrome.rect.yPct}%`,
                         width: `${chrome.rect.wPct}%`,
                         height: `${chrome.rect.hPct}%`,
                       }),
                 animation: 'vnChoiceOverlayIn 0.3s ease-out',
             }}>
            {options.map((choice, index) => (
                <div
                    key={index}
                    style={{
                        animation: `vnChoiceSlideIn 0.35s ease-out ${index * 0.08}s both`,
                        ...(horizontal ? {} : { width: '100%', marginBottom: '0.75rem' }),
                        ...(chrome.choiceBorderUrl
                            ? { ...buildImageBackgroundStyle(chrome.choiceBorderUrl, chrome.choiceSizeMode, chrome.choiceSlice), padding: scalePx(chrome.choiceBorderPadding), borderRadius: scalePx(chrome.choiceBorderRadius) }
                            : {})
                    }}
                >
                    <ChoiceButtonInner project={project} projectUI={projectUI} chrome={chrome} choice={choice}
                        fill={false} interactive={interactive} variables={variables} uiPalette={uiPalette}
                        onSelect={onSelect} suppressVideo={suppressVideo} videoNonce={videoNonce} />
                </div>
            ))}
            {choiceKeyframes}
        </div>
        </>
    );
};

export default ChoiceButtonsView;
