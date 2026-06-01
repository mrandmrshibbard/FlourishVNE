/**
 * InGameUIEditor — Visual drag-and-drop editor for in-game UI elements
 * (dialogue box, name box, choice buttons, input box, quick menu / backlog / skip)
 *
 * Lives inside the UI/Screens tab alongside the existing MenuEditor.
 * Users can select an element, see it on a canvas matching game resolution,
 * edit its properties in the properties inspector, and drag/resize on canvas.
 * Hold Shift while dragging for snap-to-grid.
 */
import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { VNProject } from '../types/project';
import { VNProjectUI, VNFontSettings, VNConfirmDialogSettings } from '../features/ui/types';
import { useProject } from '../contexts/ProjectContext';
import FontEditor, { defaultFontSettings } from './ui/FontEditor';
import { fontSettingsToStyle, extractTextGradientStyle } from '../utils/styleUtils';
import ResizableDraggable from './menu-editor/ResizableDraggable';
import {
    ChatBubbleIcon, BookmarkSquareIcon, SparklesIcon, PencilIcon,
    ChevronDownIcon, QuestionMarkIcon,
} from './icons';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type InGameUIElement =
    | 'dialogueBox'
    | 'nameBox'
    | 'choiceButtons'
    | 'inputBox'
    | 'quickMenu'
    | 'confirmDialogs';

interface ElementConfig {
    id: InGameUIElement;
    label: string;
    icon: React.ReactNode;
    description: string;
}

const ELEMENTS: ElementConfig[] = [
    { id: 'dialogueBox',   label: 'Dialogue Box',   icon: <ChatBubbleIcon className="w-4 h-4" />,   description: 'The main text box for character dialogue' },
    { id: 'nameBox',       label: 'Name Box',        icon: <BookmarkSquareIcon className="w-4 h-4" />,   description: 'Character name label above dialogue' },
    { id: 'choiceButtons', label: 'Choice Buttons',  icon: <SparklesIcon className="w-4 h-4" />,         description: 'Player choice / decision buttons' },
    { id: 'inputBox',      label: 'Text Input',      icon: <PencilIcon className="w-4 h-4" />,           description: 'Player text input prompt box' },
    { id: 'quickMenu',     label: 'Quick Menu',      icon: <ChevronDownIcon className="w-4 h-4" />,      description: 'Skip, Auto, Log, Back buttons' },
    { id: 'confirmDialogs', label: 'Confirm Dialogs', icon: <QuestionMarkIcon className="w-4 h-4" />, description: 'Quit & New Game confirmation popups' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function hexToRgba(hex: string, opacityPct: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${opacityPct / 100})`;
}

function fontToStyle(f: VNFontSettings | undefined): React.CSSProperties {
    if (!f) return {};
    return fontSettingsToStyle(f);
}

function buildImageBackgroundStyle(url: string, sizeMode: string, slicePx?: number): React.CSSProperties {
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

/* ------------------------------------------------------------------ */
/*  Default layout helpers  (%)                                        */
/* ------------------------------------------------------------------ */

/**
 * When the Quick Menu sits at the bottom of the screen (bottom-right / bottom-left
 * presets) AND the user hasn't manually positioned the menu, reserve vertical
 * space at the bottom of the screen so the dialogue box is pushed up above it.
 *
 * Returns the extra Y-axis reservation in PERCENT of game height.
 * Returns 0 if quickMenuFloatOverDialogue is enabled (no reservation needed).
 */
function getQuickMenuBottomReservePct(ui: VNProjectUI): number {
    // If float-over is enabled, don't reserve any space
    if (ui.quickMenuFloatOverDialogue) return 0;
    
    const pos = ui.quickMenuPosition ?? 'above-dialogue';
    const isBottomPreset = pos === 'bottom-right' || pos === 'bottom-left';
    // If the user dragged the quick menu manually, respect that position and
    // don't shove the dialogue around.
    if (!isBottomPreset || ui.quickMenuY !== undefined) return 0;
    const qmHPct = ui.quickMenuHeight ?? 4;
    // qmHPct = quick-menu height, +1 % for its own bottom margin from screen,
    // +1 % gap between the quick menu and the dialogue box above it.
    return qmHPct + 2;
}

function getDialogueRect(ui: VNProjectUI, gameW = 1920, gameH = 1080) {
    const w = ui.dialogueBoxWidth ?? 100;
    const h = ui.dialogueBoxHeight ? (ui.dialogueBoxHeight * 100 / gameH) : 20;
    const x = ui.dialogueBoxX ?? ((100 - w) / 2);
    const bm = ui.dialogueBoxBottomMargin ?? 20;
    const qmReserve = getQuickMenuBottomReservePct(ui);
    const y = ui.dialogueBoxY ?? (100 - h - (bm * 100 / gameH) - qmReserve);
    return { x, y, width: w, height: h };
}

function getNameboxRect(ui: VNProjectUI, gameW = 1920, gameH = 1080) {
    const dRect = getDialogueRect(ui, gameW, gameH);
    const w = ui.nameboxWidth ?? 15;
    const h = ui.nameboxHeight ?? 5;
    const x = ui.nameboxX ?? (dRect.x + (ui.nameboxOffsetX ?? 20) * 100 / gameW);
    const y = ui.nameboxY ?? (dRect.y - h - (ui.nameboxOffsetY ?? 0) * 100 / gameH);
    return { x, y, width: w, height: h };
}

function getChoiceRect(ui: VNProjectUI, gameW = 1920, gameH = 1080) {
    const w = ui.choiceButtonWidth ? (ui.choiceButtonWidth * 100 / gameW) : 30;
    const h = ui.choiceButtonHeight ? (ui.choiceButtonHeight * 100 / gameH) : 25;
    const x = ui.choiceButtonX ?? (50 - w / 2);
    const y = ui.choiceButtonY ?? 35;
    return { x, y, width: w, height: h };
}

function getInputRect(ui: VNProjectUI, gameW = 1920, gameH = 1080) {
    const w = ui.inputBoxWidth ? (ui.inputBoxWidth * 100 / gameW) : 30;
    const h = ui.inputBoxHeight ? (typeof ui.inputBoxHeight === 'number' ? ui.inputBoxHeight * 100 / gameH : 20) : 20;
    const x = ui.inputBoxX ?? (50 - w / 2);
    const y = ui.inputBoxY ?? 40;
    return { x, y, width: w, height: h };
}

function getQuickMenuRect(ui: VNProjectUI, gameW = 1920, gameH = 1080) {
    const w = ui.quickMenuWidth ?? 40;
    const h = ui.quickMenuHeight ?? 4;
    const pos = ui.quickMenuPosition ?? 'above-dialogue';
    const dRect = getDialogueRect(ui, gameW, gameH);
    // Top presets sit just below the top of the screen. Bottom presets sit at
    // the bottom of the screen — getDialogueRect() reserves space for them so
    // the dialogue box is pushed up and never overlaps.
    const defaultPos = (() => {
        if (pos === 'top-right') return { x: 100 - w - 1, y: 1 };
        if (pos === 'top-left') return { x: 1, y: 1 };
        if (pos === 'bottom-right') return { x: 100 - w - 1, y: 100 - h - 1 };
        if (pos === 'bottom-left') return { x: 1, y: 100 - h - 1 };
        return { x: dRect.x, y: dRect.y - h - 1 };
    })();
    const x = ui.quickMenuX ?? defaultPos.x;
    const y = ui.quickMenuY ?? defaultPos.y;
    return { x, y, width: w, height: h };
}

/* ------------------------------------------------------------------ */
/*  Canvas renderers – preview how elements look in-game               */
/* ------------------------------------------------------------------ */

const DialogueBoxPreview: React.FC<{ ui: VNProjectUI; project: VNProject }> = ({ ui, project }) => {
    const bgColor = hexToRgba(ui.dialogueBoxColor ?? '#0f172a', ui.dialogueBoxOpacity ?? 90);
    const br = ui.dialogueBoxBorderRadius ?? 8;
    const padding = ui.dialogueBoxPadding ?? 20;
    const textPadTop = ui.dialogueTextPaddingTop ?? 0;
    const textPadBot = ui.dialogueTextPaddingBottom ?? 0;
    const textPadLeft = ui.dialogueTextPaddingLeft ?? 0;
    const textPadRight = ui.dialogueTextPaddingRight ?? 0;
    const sizeMode = ui.dialogueBoxSizeMode ?? 'stretch';
    const slice = ui.dialogueBoxSlice ?? 30;

    // Resolve images
    const bgImgId = ui.dialogueBoxImage?.id;
    const bgUrl = bgImgId
        ? ((project.images as any)[bgImgId]?.imageUrl || (project.backgrounds as any)[bgImgId]?.imageUrl)
        : null;

    // Resolve border image
    const borderImgId = ui.dialogueBoxBorderImage?.id;
    const borderUrl = borderImgId
        ? ((project.images as any)[borderImgId]?.imageUrl || (project.backgrounds as any)[borderImgId]?.imageUrl)
        : null;
    const borderPadding = ui.dialogueBorderPadding ?? 12;

    const hasCustomImage = bgUrl || borderUrl;

    return (
        <div className="w-full h-full relative" style={{
            ...(borderUrl
                ? { ...buildImageBackgroundStyle(borderUrl, sizeMode, slice), padding: `calc(var(--font-scale,1) * ${borderPadding}px)`, borderRadius: `calc(var(--font-scale,1) * ${br}px)` }
                : {}),
        }}>
            <div className="w-full h-full relative" style={{
                borderRadius: `calc(var(--font-scale,1) * ${br}px)`,
                overflow: 'hidden',
                ...(hasCustomImage ? {} : {
                    backgroundColor: bgColor,
                    border: '1px solid rgba(148,163,184,0.25)',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
                }),
                ...(bgUrl
                    ? { ...buildImageBackgroundStyle(bgUrl, sizeMode, slice), backgroundColor: bgColor,
                        ...(sizeMode !== 'nine-slice' ? { padding: `calc(var(--font-scale,1) * ${padding}px)` } : {}) }
                    : { padding: `calc(var(--font-scale,1) * ${padding}px)` }),
            }}>
                <div style={{
                    padding: sizeMode === 'nine-slice' && bgUrl ? `calc(var(--font-scale,1) * ${padding}px)` : undefined,
                    paddingTop: textPadTop ? `calc(var(--font-scale,1) * ${textPadTop}px)` : undefined,
                    paddingBottom: textPadBot ? `calc(var(--font-scale,1) * ${textPadBot}px)` : undefined,
                    paddingLeft: textPadLeft ? `calc(var(--font-scale,1) * ${textPadLeft}px)` : undefined,
                    paddingRight: textPadRight ? `calc(var(--font-scale,1) * ${textPadRight}px)` : undefined,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                }}>
                    <p style={fontToStyle(ui.dialogueTextFont)} className="leading-relaxed opacity-80">
                        This is a sample line of dialogue text to preview how it will look in-game…
                    </p>
                </div>
            </div>
        </div>
    );
};

const NameBoxPreview: React.FC<{ ui: VNProjectUI; project: VNProject }> = ({ ui, project }) => {
    const bgColor = hexToRgba(ui.nameboxColor ?? '#0f172a', ui.nameboxOpacity ?? 92);
    const br = ui.nameboxBorderRadius ?? 6;
    const pad = ui.nameboxPadding ?? 8;
    const hPad = ui.nameboxHorizontalPadding ?? 14;

    const bgImgId = ui.nameboxImage?.id;
    const bgUrl = bgImgId
        ? ((project.images as any)[bgImgId]?.imageUrl || (project.backgrounds as any)[bgImgId]?.imageUrl)
        : null;

    const nameAlign = ui.dialogueNameFont?.align || 'left';
    const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

    return (
        <div className="w-full h-full flex items-center" style={{
            justifyContent: justifyMap[nameAlign] || 'flex-start',
            borderRadius: `calc(var(--font-scale,1) * ${br}px)`,
            padding: `calc(var(--font-scale,1) * ${pad}px) calc(var(--font-scale,1) * ${hPad}px)`,
            ...(bgUrl
                ? buildImageBackgroundStyle(bgUrl, ui.nameboxSizeMode ?? 'stretch')
                : {
                    backgroundColor: bgColor,
                    border: '1px solid rgba(148,163,184,0.35)',
                }),
        }}>
            <span style={fontToStyle(ui.dialogueNameFont)} className="opacity-90">
                <span style={extractTextGradientStyle(ui.dialogueNameFont) || undefined}>Character Name</span>
            </span>
        </div>
    );
};

const ChoiceButtonsPreview: React.FC<{ ui: VNProjectUI; project: VNProject }> = ({ ui, project }) => {
    const bgColor = hexToRgba(ui.choiceButtonColor ?? '#1e293b', ui.choiceButtonOpacity ?? 90);
    const br = ui.choiceButtonBorderRadius ?? 8;
    const pad = ui.choiceButtonPadding ?? 16;
    const slice = ui.choiceButtonSlice ?? 15;
    const sizeMode = ui.choiceButtonSizeMode ?? 'stretch';

    const bgImgId = ui.choiceButtonImage?.id;
    const bgUrl = bgImgId
        ? ((project.images as any)[bgImgId]?.imageUrl || (project.backgrounds as any)[bgImgId]?.imageUrl)
        : null;

    const borderImgId = (ui as any).choiceButtonBorderImage?.id;
    const borderUrl = borderImgId
        ? ((project.images as any)[borderImgId]?.imageUrl || (project.backgrounds as any)[borderImgId]?.imageUrl)
        : null;
    const borderPadding = (ui as any).choiceBorderPadding ?? 8;
    const hasCustomImage = bgUrl || borderUrl;

    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-[4%]">
            {['Choice A', 'Choice B', 'Choice C'].map(label => (
                <div key={label} className="w-[80%]"
                     style={borderUrl
                         ? { ...buildImageBackgroundStyle(borderUrl, sizeMode, slice), padding: `calc(var(--font-scale,1) * ${borderPadding}px)`, borderRadius: `calc(var(--font-scale,1) * ${br}px)` }
                         : {}}>
                    <div className="w-full" style={{
                        textAlign: (ui.choiceTextFont?.align || 'center') as any,
                        borderRadius: `calc(var(--font-scale,1) * ${br}px)`,
                        padding: `calc(var(--font-scale,1) * ${pad}px)`,
                        ...(bgUrl
                            ? { ...buildImageBackgroundStyle(bgUrl, sizeMode, slice), backgroundColor: bgColor }
                            : !hasCustomImage
                                ? {
                                    backgroundColor: bgColor,
                                    border: '1px solid rgba(148,163,184,0.3)',
                                    boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
                                  }
                                : {}),
                    }}>
                        <span style={fontToStyle(ui.choiceTextFont)} className="opacity-90">
                            <span style={extractTextGradientStyle(ui.choiceTextFont) || undefined}>{label}</span>
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
};

const InputBoxPreview: React.FC<{ ui: VNProjectUI; project: VNProject }> = ({ ui, project }) => {
    const bgColor = hexToRgba(ui.inputBoxColor ?? '#0f172a', ui.inputBoxOpacity ?? 92);
    const br = ui.inputBoxBorderRadius ?? 8;
    const pad = ui.inputBoxPadding ?? 24;
    const slice = ui.inputBoxSlice ?? 20;
    const sizeMode = ui.inputBoxSizeMode ?? 'stretch';

    const bgImgId = ui.inputBoxImage?.id;
    const bgUrl = bgImgId
        ? ((project.images as any)[bgImgId]?.imageUrl || (project.backgrounds as any)[bgImgId]?.imageUrl)
        : null;

    const borderImgId = (ui as any).inputBoxBorderImage?.id;
    const borderUrl = borderImgId
        ? ((project.images as any)[borderImgId]?.imageUrl || (project.backgrounds as any)[borderImgId]?.imageUrl)
        : null;
    const borderPadding = (ui as any).inputBorderPadding ?? 8;
    const hasCustomImage = bgUrl || borderUrl;

    return (
        <div className="w-full h-full flex flex-col items-center justify-center">
            <div className="w-full"
                 style={borderUrl
                     ? { ...buildImageBackgroundStyle(borderUrl, sizeMode, slice), padding: `calc(var(--font-scale,1) * ${borderPadding}px)`, borderRadius: `calc(var(--font-scale,1) * ${br}px)` }
                     : {}}>
                <div className="w-full flex flex-col items-center justify-center gap-[6%]" style={{
                    borderRadius: `calc(var(--font-scale,1) * ${br}px)`,
                    padding: `calc(var(--font-scale,1) * ${pad}px)`,
                    ...(bgUrl
                        ? { ...buildImageBackgroundStyle(bgUrl, sizeMode, slice), backgroundColor: bgColor, ...(sizeMode !== 'nine-slice' ? {} : {}) }
                        : !hasCustomImage
                            ? {
                                backgroundColor: bgColor,
                                border: '1px solid rgba(148,163,184,0.3)',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
                              }
                            : {}),
                }}>
                    <p style={fontToStyle(ui.inputPromptFont)} className="opacity-90">
                        <span style={extractTextGradientStyle(ui.inputPromptFont) || undefined}>What is your name?</span>
                    </p>
                    <div className="w-[80%] bg-white/10 rounded px-2 py-1" style={fontToStyle(ui.inputFieldFont)}>
                        <span className="opacity-40">Type here…</span>
                    </div>
                    <div className="px-4 py-1 rounded bg-sky-600/80">
                        <span style={fontToStyle(ui.inputSubmitFont)}>
                            <span style={extractTextGradientStyle(ui.inputSubmitFont) || undefined}>Submit</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const QuickMenuPreview: React.FC<{ ui: VNProjectUI }> = ({ ui }) => {
    const bgColor = hexToRgba(ui.quickMenuColor ?? '#0f172a', ui.quickMenuOpacity ?? 75);
    const br = ui.quickMenuBorderRadius ?? 4;

    // Define all buttons with their visibility flags
    const buttonDefs = [
        { label: 'Back', show: ui.quickMenuShowSkipBackward !== false },
        { label: 'Log', show: ui.quickMenuShowLog !== false },
        { label: 'Auto', show: ui.quickMenuShowAutoAdvance !== false },
        { label: 'Skip', show: ui.quickMenuShowSkipForward !== false },
        { label: 'Save', show: ui.quickMenuShowSave !== false },
        { label: 'Load', show: ui.quickMenuShowLoad !== false },
    ];

    const visibleButtons = buttonDefs.filter(b => b.show);

    return (
        <div className="w-full h-full flex items-center justify-center gap-[2%]">
            {visibleButtons.map(btn => (
                <div key={btn.label} style={{
                    backgroundColor: bgColor,
                    borderRadius: `calc(var(--font-scale,1) * ${br}px)`,
                    fontSize: 'calc(var(--font-scale,1) * 12px)',
                    padding: 'calc(var(--font-scale,1) * 10px) calc(var(--font-scale,1) * 10px)',
                    color: 'rgba(255,255,255,0.8)',
                    border: '1px solid rgba(148,163,184,0.2)',
                }}>
                    {btn.label}
                </div>
            ))}
        </div>
    );
};

const ConfirmDialogPreview: React.FC<{ ui: VNProjectUI; project: VNProject }> = ({ ui, project }) => {
    const cd = ui.confirmDialogs || {};
    const bgColor = cd.backgroundColor ?? '#0f172a';
    const bgOpacity = (cd.backgroundOpacity ?? 92) / 100;
    const borderRadius = cd.borderRadius ?? 12;
    const overlayColor = cd.overlayColor ?? 'rgba(0,0,0,0.75)';
    const confirmBtnColor = cd.confirmButtonColor ?? '';
    const cancelBtnColor = cd.cancelButtonColor ?? '#1e293b';
    const btnBorderRadius = cd.buttonBorderRadius ?? Math.max(borderRadius - 4, 4);
    const btnPad = cd.buttonPadding ?? 8;
    const dialogPad = cd.dialogPadding ?? 32;

    // Resolve assets
    const allAssets = { ...project.images, ...project.backgrounds } as Record<string, any>;
    const resolveUrl = (asset?: { id: string } | null) => asset?.id ? (allAssets[asset.id]?.imageUrl || null) : null;

    const bgImageUrl = resolveUrl(cd.backgroundImage as any);
    const borderImageUrl = resolveUrl(cd.borderImage as any);
    const confirmBtnImgUrl = resolveUrl(cd.confirmButtonImage as any);
    const cancelBtnImgUrl = resolveUrl(cd.cancelButtonImage as any);

    const sizeMode = cd.backgroundSizeMode || 'stretch';

    const bgImageStyle: React.CSSProperties = bgImageUrl ? {
        backgroundImage: `url(${bgImageUrl})`,
        backgroundSize: sizeMode === 'nine-slice' ? undefined : (sizeMode === 'stretch' ? '100% 100%' : sizeMode),
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
    } : {};

    const titleStyle: React.CSSProperties = cd.titleFont ? fontToStyle(cd.titleFont) : {
        fontSize: 'calc(var(--font-scale,1) * 20px)', fontWeight: 600, color: '#fff'
    };
    const messageStyle: React.CSSProperties = cd.messageFont ? fontToStyle(cd.messageFont) : {
        fontSize: 'calc(var(--font-scale,1) * 15px)', color: '#cbd5e1'
    };
    const btnStyle: React.CSSProperties = cd.buttonFont ? fontToStyle(cd.buttonFont) : {
        fontSize: 'calc(var(--font-scale,1) * 14px)', fontWeight: 500, color: '#fff'
    };

    const alphaHex = Math.round(bgOpacity * 255).toString(16).padStart(2, '0');

    const makeBtnImageStyle = (imgUrl: string | null): React.CSSProperties => {
        if (!imgUrl) return {};
        const bsm = cd.buttonSizeMode || 'stretch';
        return {
            backgroundImage: `url(${imgUrl})`,
            backgroundSize: bsm === 'nine-slice' ? undefined : (bsm === 'stretch' ? '100% 100%' : bsm),
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundColor: 'transparent',
            ...(bsm === 'nine-slice' ? { borderImage: `url(${imgUrl}) ${cd.buttonSlice ?? 10} fill`, borderImageWidth: `${cd.buttonSlice ?? 10}px` } : {}),
        };
    };

    const borderPad = cd.borderPadding ?? 12;

    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ backgroundColor: overlayColor }}>
            {/* Border image wrapper */}
            <div style={borderImageUrl ? {
                backgroundImage: `url(${borderImageUrl})`,
                backgroundSize: '100% 100%',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                padding: `calc(var(--font-scale,1) * ${borderPad}px)`,
                borderRadius: `calc(var(--font-scale,1) * ${borderRadius}px)`,
            } : {}}>
                <div style={{
                    backgroundColor: bgImageUrl ? 'transparent' : `${bgColor}${alphaHex}`,
                    borderRadius: `calc(var(--font-scale,1) * ${borderRadius}px)`,
                    padding: `calc(var(--font-scale,1) * ${dialogPad}px)`,
                    ...(cd.dialogWidth ? { width: `calc(var(--font-scale,1) * ${cd.dialogWidth}px)` } : { minWidth: 'calc(var(--font-scale,1) * 320px)', maxWidth: 'calc(var(--font-scale,1) * 440px)' }),
                    textAlign: 'center' as const,
                    boxShadow: borderImageUrl ? 'none' : '0 12px 40px rgba(0,0,0,0.5)',
                    ...bgImageStyle,
                }}>
                    <div style={{ ...titleStyle, marginBottom: 'calc(var(--font-scale,1) * 12px)' }}>
                        {cd.quitTitle || 'Quit Game'}
                    </div>
                    <div style={{ ...messageStyle, marginBottom: 'calc(var(--font-scale,1) * 24px)' }}>
                        {cd.quitMessage || 'Are you sure you want to quit?'}
                    </div>
                    <div style={{ display: 'flex', gap: 'calc(var(--font-scale,1) * 12px)', justifyContent: 'center' }}>
                        <div style={{
                            ...btnStyle,
                            padding: `calc(var(--font-scale,1) * ${btnPad}px) calc(var(--font-scale,1) * ${btnPad * 3}px)`,
                            borderRadius: `calc(var(--font-scale,1) * ${btnBorderRadius}px)`,
                            backgroundColor: cancelBtnImgUrl ? 'transparent' : cancelBtnColor,
                            border: cancelBtnImgUrl ? 'none' : '1px solid rgba(255,255,255,0.1)',
                            ...makeBtnImageStyle(cancelBtnImgUrl),
                        }}>
                            {cd.quitCancelLabel || 'Cancel'}
                        </div>
                        <div style={{
                            ...btnStyle,
                            padding: `calc(var(--font-scale,1) * ${btnPad}px) calc(var(--font-scale,1) * ${btnPad * 3}px)`,
                            borderRadius: `calc(var(--font-scale,1) * ${btnBorderRadius}px)`,
                            background: confirmBtnImgUrl ? 'transparent' : (confirmBtnColor || 'linear-gradient(to right, #ec4899, #a855f7)'),
                            ...makeBtnImageStyle(confirmBtnImgUrl),
                        }}>
                            {cd.quitConfirmLabel || 'Quit'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/*  Properties Panel                                                   */
/* ------------------------------------------------------------------ */

interface PropsEditorProps {
    ui: VNProjectUI;
    element: InGameUIElement;
    project: VNProject;
    onUpdate: (updates: Partial<VNProjectUI>) => void;
}

/* ── Shared CSS classes and helper components for the properties panel ── */
const propsInputCls = "w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm";
const propsLabelCls = "block text-xs font-medium text-[var(--text-secondary)] mb-1";

const PropsField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div><label className={propsLabelCls}>{label}</label>{children}</div>
);

const PropsNumInput: React.FC<{ label: string; value: number | undefined; fallback: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }> = ({ label, value, fallback, onChange, min, max, step }) => (
    <PropsField label={label}>
        <input type="number" className={propsInputCls} value={value ?? fallback} min={min} max={max} step={step}
            onChange={e => onChange(parseFloat(e.target.value) || fallback)} />
    </PropsField>
);

const PropsColorField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
    <PropsField label={label}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-full h-8 rounded cursor-pointer border border-[var(--border-default)]" />
    </PropsField>
);

const PropsOpacityField: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange }) => (
    <PropsField label={label}>
        <div className="flex items-center gap-2">
            <input type="range" min={0} max={100} value={value} onChange={e => onChange(parseInt(e.target.value))} className="flex-1 accent-sky-500" />
            <span className="text-xs text-[var(--text-secondary)] w-8 text-right">{value}%</span>
        </div>
    </PropsField>
);

const InGameUIPropsEditor: React.FC<PropsEditorProps> = ({ ui, element, project, onUpdate }) => {
    // Gather all available images (images + backgrounds) for background image selectors
    const allImages = useMemo(() => [
        ...Object.values(project.images || {}) as any[],
        ...Object.values(project.backgrounds || {}) as any[],
    ], [project.images, project.backgrounds]);

    // Local aliases for brevity
    const Field = PropsField;
    const NumInput = PropsNumInput;
    const ColorField = PropsColorField;
    const OpacityField = PropsOpacityField;
    const inputCls = propsInputCls;

    /* Dialogue Box properties */
    if (element === 'dialogueBox') {
        return (
            <div className="space-y-3 p-3">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1">Dialogue Box</h4>
                <div className="grid grid-cols-2 gap-2">
                    <ColorField label="Background" value={ui.dialogueBoxColor ?? '#0f172a'} onChange={v => onUpdate({ dialogueBoxColor: v })} />
                    <OpacityField label="Opacity" value={ui.dialogueBoxOpacity ?? 90} onChange={v => onUpdate({ dialogueBoxOpacity: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <NumInput label="Border Radius (px)" value={ui.dialogueBoxBorderRadius} fallback={8} min={0} onChange={v => onUpdate({ dialogueBoxBorderRadius: v })} />
                    <NumInput label="Content Padding (px)" value={ui.dialogueBoxPadding} fallback={20} min={0} onChange={v => onUpdate({ dialogueBoxPadding: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <NumInput label="Width (%)" value={ui.dialogueBoxWidth} fallback={100} min={10} max={100} onChange={v => onUpdate({ dialogueBoxWidth: v })} />
                    <NumInput label="Bottom Margin (px)" value={ui.dialogueBoxBottomMargin} fallback={20} min={0} onChange={v => onUpdate({ dialogueBoxBottomMargin: v })} />
                </div>

                <Field label="Background Image">
                    <select className={inputCls} value={ui.dialogueBoxImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ dialogueBoxImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">None (use color)</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>

                {ui.dialogueBoxImage && (
                    <Field label="Image Fit Mode">
                        <select className={inputCls} value={ui.dialogueBoxSizeMode ?? 'stretch'}
                            onChange={e => onUpdate({ dialogueBoxSizeMode: e.target.value as any })}>
                            <option value="stretch">Stretch (fill box)</option>
                            <option value="contain">Contain (fit inside)</option>
                            <option value="cover">Cover (fill & crop)</option>
                            <option value="tile">Tile (repeat)</option>
                            <option value="nine-slice">9-Slice (preserve corners)</option>
                        </select>
                    </Field>
                )}
                {ui.dialogueBoxImage && (ui.dialogueBoxSizeMode ?? 'stretch') === 'nine-slice' && (
                    <NumInput label="Slice (px)" value={ui.dialogueBoxSlice} fallback={30} min={1} onChange={v => onUpdate({ dialogueBoxSlice: v })} />
                )}

                <Field label="Border Image">
                    <select className={inputCls} value={ui.dialogueBoxBorderImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ dialogueBoxBorderImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">None</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>
                {ui.dialogueBoxBorderImage && (
                    <NumInput label="Border Padding (px)" value={ui.dialogueBorderPadding} fallback={12} min={0} onChange={v => onUpdate({ dialogueBorderPadding: v })} />
                )}

                {/* Text padding inside dialogue */}
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1 pt-2">Text Position (padding px)</h4>
                <p className="text-[10px] text-[var(--text-muted)]">Controls where typed text starts inside the dialogue box. Drag the inner text area on canvas or set manually.</p>
                <div className="grid grid-cols-2 gap-2">
                    <NumInput label="Top" value={ui.dialogueTextPaddingTop} fallback={0} min={0} onChange={v => onUpdate({ dialogueTextPaddingTop: v })} />
                    <NumInput label="Bottom" value={ui.dialogueTextPaddingBottom} fallback={0} min={0} onChange={v => onUpdate({ dialogueTextPaddingBottom: v })} />
                    <NumInput label="Left" value={ui.dialogueTextPaddingLeft} fallback={0} min={0} onChange={v => onUpdate({ dialogueTextPaddingLeft: v })} />
                    <NumInput label="Right" value={ui.dialogueTextPaddingRight} fallback={0} min={0} onChange={v => onUpdate({ dialogueTextPaddingRight: v })} />
                </div>

                <FontEditor
                    label="Dialogue Text Font"
                    font={(ui.dialogueTextFont as VNFontSettings) ?? defaultFontSettings}
                    onFontChange={(prop, value) => onUpdate({ dialogueTextFont: { ...((ui.dialogueTextFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })}
                />
            </div>
        );
    }

    /* Name Box properties */
    if (element === 'nameBox') {
        return (
            <div className="space-y-3 p-3">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1">Name Box</h4>
                <div className="grid grid-cols-2 gap-2">
                    <ColorField label="Background" value={ui.nameboxColor ?? '#0f172a'} onChange={v => onUpdate({ nameboxColor: v })} />
                    <OpacityField label="Opacity" value={ui.nameboxOpacity ?? 92} onChange={v => onUpdate({ nameboxOpacity: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <NumInput label="Border Radius (px)" value={ui.nameboxBorderRadius} fallback={6} min={0} onChange={v => onUpdate({ nameboxBorderRadius: v })} />
                    <NumInput label="Padding (px)" value={ui.nameboxPadding} fallback={8} min={0} onChange={v => onUpdate({ nameboxPadding: v })} />
                    <NumInput label="H-Padding (px)" value={ui.nameboxHorizontalPadding} fallback={14} min={0} onChange={v => onUpdate({ nameboxHorizontalPadding: v })} />
                </div>

                <Field label="Background Image">
                    <select className={inputCls} value={ui.nameboxImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ nameboxImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">None (use color)</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>

                {ui.nameboxImage && (
                    <Field label="Image Fit Mode">
                        <select className={inputCls} value={ui.nameboxSizeMode ?? 'stretch'}
                            onChange={e => onUpdate({ nameboxSizeMode: e.target.value as any })}>
                            <option value="stretch">Stretch (fill box)</option>
                            <option value="contain">Contain (fit inside)</option>
                            <option value="cover">Cover (fill & crop)</option>
                            <option value="tile">Tile (repeat)</option>
                            <option value="nine-slice">9-Slice (preserve corners)</option>
                        </select>
                    </Field>
                )}

                <FontEditor
                    label="Name Font"
                    font={(ui.dialogueNameFont as VNFontSettings) ?? defaultFontSettings}
                    onFontChange={(prop, value) => onUpdate({ dialogueNameFont: { ...((ui.dialogueNameFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })}
                />
            </div>
        );
    }

    /* Choice Buttons properties */
    if (element === 'choiceButtons') {
        return (
            <div className="space-y-3 p-3">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1">Choice Buttons</h4>
                <div className="grid grid-cols-2 gap-2">
                    <ColorField label="Background" value={ui.choiceButtonColor ?? '#1e293b'} onChange={v => onUpdate({ choiceButtonColor: v })} />
                    <OpacityField label="Opacity" value={ui.choiceButtonOpacity ?? 90} onChange={v => onUpdate({ choiceButtonOpacity: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <NumInput label="Border Radius (px)" value={ui.choiceButtonBorderRadius} fallback={8} min={0} onChange={v => onUpdate({ choiceButtonBorderRadius: v })} />
                    <NumInput label="Padding (px)" value={ui.choiceButtonPadding} fallback={16} min={0} onChange={v => onUpdate({ choiceButtonPadding: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <ColorField label="Hover Color" value={ui.choiceHoverColor ?? '#334155'} onChange={v => onUpdate({ choiceHoverColor: v })} />
                </div>

                <Field label="Background Image">
                    <select className={inputCls} value={ui.choiceButtonImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ choiceButtonImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">None (use color)</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>

                {ui.choiceButtonImage && (
                    <Field label="Image Fit Mode">
                        <select className={inputCls} value={ui.choiceButtonSizeMode ?? 'stretch'}
                            onChange={e => onUpdate({ choiceButtonSizeMode: e.target.value as any })}>
                            <option value="stretch">Stretch (fill box)</option>
                            <option value="contain">Contain (fit inside)</option>
                            <option value="cover">Cover (fill & crop)</option>
                            <option value="tile">Tile (repeat)</option>
                            <option value="nine-slice">9-Slice (preserve corners)</option>
                        </select>
                    </Field>
                )}
                {ui.choiceButtonImage && (ui.choiceButtonSizeMode ?? 'stretch') === 'nine-slice' && (
                    <NumInput label="Slice (px)" value={ui.choiceButtonSlice} fallback={15} min={1} onChange={v => onUpdate({ choiceButtonSlice: v })} />
                )}

                <Field label="Hover Image">
                    <select className={inputCls} value={ui.choiceHoverImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ choiceHoverImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">None</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>

                <Field label="Border Image">
                    <select className={inputCls} value={ui.choiceButtonBorderImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ choiceButtonBorderImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">None</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>
                {ui.choiceButtonBorderImage && (
                    <NumInput label="Border Padding (px)" value={ui.choiceBorderPadding} fallback={8} min={0} onChange={v => onUpdate({ choiceBorderPadding: v })} />
                )}

                <FontEditor
                    label="Choice Text Font"
                    font={(ui.choiceTextFont as VNFontSettings) ?? defaultFontSettings}
                    onFontChange={(prop, value) => onUpdate({ choiceTextFont: { ...((ui.choiceTextFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })}
                />
            </div>
        );
    }

    /* Input Box properties */
    if (element === 'inputBox') {
        return (
            <div className="space-y-3 p-3">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1">Text Input Box</h4>
                <div className="grid grid-cols-2 gap-2">
                    <ColorField label="Background" value={ui.inputBoxColor ?? '#0f172a'} onChange={v => onUpdate({ inputBoxColor: v })} />
                    <OpacityField label="Opacity" value={ui.inputBoxOpacity ?? 92} onChange={v => onUpdate({ inputBoxOpacity: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <NumInput label="Border Radius (px)" value={ui.inputBoxBorderRadius} fallback={8} min={0} onChange={v => onUpdate({ inputBoxBorderRadius: v })} />
                    <NumInput label="Padding (px)" value={ui.inputBoxPadding} fallback={24} min={0} onChange={v => onUpdate({ inputBoxPadding: v })} />
                </div>

                <Field label="Background Image">
                    <select className={inputCls} value={ui.inputBoxImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ inputBoxImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">None (use color)</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>

                {ui.inputBoxImage && (
                    <Field label="Image Fit Mode">
                        <select className={inputCls} value={ui.inputBoxSizeMode ?? 'stretch'}
                            onChange={e => onUpdate({ inputBoxSizeMode: e.target.value as any })}>
                            <option value="stretch">Stretch (fill box)</option>
                            <option value="contain">Contain (fit inside)</option>
                            <option value="cover">Cover (fill & crop)</option>
                            <option value="tile">Tile (repeat)</option>
                            <option value="nine-slice">9-Slice (preserve corners)</option>
                        </select>
                    </Field>
                )}
                {ui.inputBoxImage && (ui.inputBoxSizeMode ?? 'stretch') === 'nine-slice' && (
                    <NumInput label="Slice (px)" value={ui.inputBoxSlice} fallback={20} min={1} onChange={v => onUpdate({ inputBoxSlice: v })} />
                )}

                <Field label="Border Image">
                    <select className={inputCls} value={ui.inputBoxBorderImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ inputBoxBorderImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">None</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>
                {ui.inputBoxBorderImage && (
                    <NumInput label="Border Padding (px)" value={ui.inputBorderPadding} fallback={8} min={0} onChange={v => onUpdate({ inputBorderPadding: v })} />
                )}

                <FontEditor
                    label="Prompt Font"
                    font={(ui.inputPromptFont as VNFontSettings) ?? defaultFontSettings}
                    onFontChange={(prop, value) => onUpdate({ inputPromptFont: { ...((ui.inputPromptFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })}
                />
                <FontEditor
                    label="Input Field Font"
                    font={(ui.inputFieldFont as VNFontSettings) ?? defaultFontSettings}
                    onFontChange={(prop, value) => onUpdate({ inputFieldFont: { ...((ui.inputFieldFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })}
                />
                <FontEditor
                    label="Submit Button Font"
                    font={(ui.inputSubmitFont as VNFontSettings) ?? defaultFontSettings}
                    onFontChange={(prop, value) => onUpdate({ inputSubmitFont: { ...((ui.inputSubmitFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })}
                />
            </div>
        );
    }

    /* Quick Menu properties */
    if (element === 'quickMenu') {
        return (
            <div className="space-y-3 p-3">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1">Quick Menu</h4>
                <div className="grid grid-cols-2 gap-2">
                    <ColorField label="Button Color" value={ui.quickMenuColor ?? '#0f172a'} onChange={v => onUpdate({ quickMenuColor: v })} />
                    <OpacityField label="Opacity" value={ui.quickMenuOpacity ?? 75} onChange={v => onUpdate({ quickMenuOpacity: v })} />
                </div>
                <NumInput label="Border Radius (px)" value={ui.quickMenuBorderRadius} fallback={4} min={0} onChange={v => onUpdate({ quickMenuBorderRadius: v })} />
                <Field label="Position Preset">
                    <select className={inputCls} value={ui.quickMenuPosition ?? 'above-dialogue'} onChange={e => onUpdate({
                        quickMenuPosition: e.target.value as any,
                        // Clear explicit drag-set coordinates so the new preset's defaults take effect.
                        // Otherwise saved X/Y/W/H from a prior drag override the preset and nothing visibly changes.
                        quickMenuX: undefined,
                        quickMenuY: undefined,
                        quickMenuWidth: undefined,
                        quickMenuHeight: undefined,
                    })}>
                        <option value="above-dialogue">Above Dialogue</option>
                        <option value="top-right">Top Right</option>
                        <option value="top-left">Top Left</option>
                        <option value="bottom-right">Bottom Right (pushes dialogue up)</option>
                        <option value="bottom-left">Bottom Left (pushes dialogue up)</option>
                        <option value="hidden">Hidden</option>
                    </select>
                </Field>
                {(ui.quickMenuX !== undefined || ui.quickMenuY !== undefined || ui.quickMenuWidth !== undefined || ui.quickMenuHeight !== undefined) && (
                    <button
                        type="button"
                        onClick={() => onUpdate({ quickMenuX: undefined, quickMenuY: undefined, quickMenuWidth: undefined, quickMenuHeight: undefined })}
                        className="w-full text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
                        title="Discard custom drag position and snap the Quick Menu back to the selected preset."
                    >
                        Reset to Preset Position
                    </button>
                )}
                <Field label="Float Over Dialogue">
                    <input
                        type="checkbox"
                        checked={ui.quickMenuFloatOverDialogue ?? false}
                        onChange={e => onUpdate({ quickMenuFloatOverDialogue: e.target.checked })}
                        className="cursor-pointer"
                    />
                    <span className="text-xs text-[var(--text-secondary)] ml-2">When enabled, quick menu floats over the dialogue box instead of pushing it up.</span>
                </Field>

                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1 pt-3">Button Visibility</h4>
                <p className="text-[10px] text-[var(--text-muted)]">Toggle which buttons appear in the quick menu.</p>

                <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={ui.quickMenuShowSkipBackward !== false}
                            onChange={e => onUpdate({ quickMenuShowSkipBackward: e.target.checked })}
                            className="cursor-pointer"
                        />
                        <span className="text-xs text-[var(--text-secondary)]">Back / Skip Backward</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={ui.quickMenuShowLog !== false}
                            onChange={e => onUpdate({ quickMenuShowLog: e.target.checked })}
                            className="cursor-pointer"
                        />
                        <span className="text-xs text-[var(--text-secondary)]">Log / History</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={ui.quickMenuShowAutoAdvance !== false}
                            onChange={e => onUpdate({ quickMenuShowAutoAdvance: e.target.checked })}
                            className="cursor-pointer"
                        />
                        <span className="text-xs text-[var(--text-secondary)]">Auto-Advance</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={ui.quickMenuShowSkipForward !== false}
                            onChange={e => onUpdate({ quickMenuShowSkipForward: e.target.checked })}
                            className="cursor-pointer"
                        />
                        <span className="text-xs text-[var(--text-secondary)]">Skip / Skip Forward</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={ui.quickMenuShowSave !== false}
                            onChange={e => onUpdate({ quickMenuShowSave: e.target.checked })}
                            className="cursor-pointer"
                        />
                        <span className="text-xs text-[var(--text-secondary)]">Save</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={ui.quickMenuShowLoad !== false}
                            onChange={e => onUpdate({ quickMenuShowLoad: e.target.checked })}
                            className="cursor-pointer"
                        />
                        <span className="text-xs text-[var(--text-secondary)]">Load</span>
                    </label>
                </div>
            </div>
        );
    }

    /* Confirm Dialogs properties */
    if (element === 'confirmDialogs') {
        const cd = ui.confirmDialogs || {} as VNConfirmDialogSettings;
        const updateCD = (patch: Partial<VNConfirmDialogSettings>) => onUpdate({ confirmDialogs: { ...cd, ...patch } });

        return (
            <div className="space-y-3 p-3">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1">Confirmation Dialogs</h4>
                <p className="text-xs text-[var(--text-secondary)]">
                    Shown when the player quits to title or starts a new game while a game is in progress.
                </p>

                {/* Quit dialog text */}
                <div className="border border-[var(--border-subtle)] rounded p-2 space-y-2">
                    <span className="text-xs font-semibold text-sky-400">Quit Confirmation</span>
                    <Field label="Title">
                        <input className={inputCls} value={cd.quitTitle ?? ''} placeholder="Quit Game"
                            onChange={e => updateCD({ quitTitle: e.target.value || undefined })} />
                    </Field>
                    <Field label="Message">
                        <textarea className={inputCls} rows={2} value={cd.quitMessage ?? ''} placeholder="Are you sure you want to quit?"
                            onChange={e => updateCD({ quitMessage: e.target.value || undefined })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Confirm Button">
                            <input className={inputCls} value={cd.quitConfirmLabel ?? ''} placeholder="Quit"
                                onChange={e => updateCD({ quitConfirmLabel: e.target.value || undefined })} />
                        </Field>
                        <Field label="Cancel Button">
                            <input className={inputCls} value={cd.quitCancelLabel ?? ''} placeholder="Cancel"
                                onChange={e => updateCD({ quitCancelLabel: e.target.value || undefined })} />
                        </Field>
                    </div>
                </div>

                {/* New Game dialog text */}
                <div className="border border-[var(--border-subtle)] rounded p-2 space-y-2">
                    <span className="text-xs font-semibold text-sky-400">New Game Confirmation</span>
                    <Field label="Title">
                        <input className={inputCls} value={cd.newGameTitle ?? ''} placeholder="Start New Game"
                            onChange={e => updateCD({ newGameTitle: e.target.value || undefined })} />
                    </Field>
                    <Field label="Message">
                        <textarea className={inputCls} rows={2} value={cd.newGameMessage ?? ''} placeholder="Any unsaved progress will be lost. Are you sure?"
                            onChange={e => updateCD({ newGameMessage: e.target.value || undefined })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Confirm Button">
                            <input className={inputCls} value={cd.newGameConfirmLabel ?? ''} placeholder="New Game"
                                onChange={e => updateCD({ newGameConfirmLabel: e.target.value || undefined })} />
                        </Field>
                        <Field label="Cancel Button">
                            <input className={inputCls} value={cd.newGameCancelLabel ?? ''} placeholder="Cancel"
                                onChange={e => updateCD({ newGameCancelLabel: e.target.value || undefined })} />
                        </Field>
                    </div>
                </div>

                {/* Visual styling */}
                <div className="border border-[var(--border-subtle)] rounded p-2 space-y-2">
                    <span className="text-xs font-semibold text-sky-400">Dialog Box Appearance</span>
                    <div className="grid grid-cols-2 gap-2">
                        <ColorField label="Background" value={cd.backgroundColor ?? '#0f172a'} onChange={v => updateCD({ backgroundColor: v })} />
                        <OpacityField label="Opacity" value={cd.backgroundOpacity ?? 92} onChange={v => updateCD({ backgroundOpacity: v })} />
                    </div>
                    <NumInput label="Border Radius (px)" value={cd.borderRadius} fallback={12} min={0} onChange={v => updateCD({ borderRadius: v })} />
                    <NumInput label="Dialog Width (px)" value={cd.dialogWidth} fallback={0} min={0} max={1200} onChange={v => updateCD({ dialogWidth: v || undefined })} />
                    <NumInput label="Inner Padding (px)" value={cd.dialogPadding} fallback={32} min={0} max={100} onChange={v => updateCD({ dialogPadding: v })} />
                    <ColorField label="Overlay / Backdrop Color" value={cd.overlayColor ?? '#000000'} onChange={v => updateCD({ overlayColor: `${v}bf` })} />

                    <Field label="Background Image">
                        <select className={inputCls} value={cd.backgroundImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCD({ backgroundImage: null }); return; }
                                updateCD({ backgroundImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">None</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    {cd.backgroundImage && (
                        <Field label="Image Sizing">
                            <select className={inputCls} value={cd.backgroundSizeMode ?? 'stretch'}
                                onChange={e => updateCD({ backgroundSizeMode: e.target.value as any })}>
                                <option value="stretch">Stretch</option>
                                <option value="contain">Contain</option>
                                <option value="cover">Cover</option>
                                <option value="nine-slice">Nine-Slice</option>
                            </select>
                        </Field>
                    )}
                    {cd.backgroundImage && cd.backgroundSizeMode === 'nine-slice' && (
                        <NumInput label="Slice Size (px)" value={cd.backgroundSlice} fallback={20} min={1} onChange={v => updateCD({ backgroundSlice: v })} />
                    )}

                    <Field label="Border Image">
                        <select className={inputCls} value={cd.borderImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCD({ borderImage: null }); return; }
                                updateCD({ borderImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">None</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    {cd.borderImage && (
                        <NumInput label="Border Padding (px)" value={cd.borderPadding} fallback={12} min={0} onChange={v => updateCD({ borderPadding: v })} />
                    )}
                </div>

                {/* Button styling */}
                <div className="border border-[var(--border-subtle)] rounded p-2 space-y-2">
                    <span className="text-xs font-semibold text-sky-400">Button Styling</span>
                    <div className="grid grid-cols-2 gap-2">
                        <ColorField label="Confirm Btn Color" value={cd.confirmButtonColor ?? '#ec4899'} onChange={v => updateCD({ confirmButtonColor: v })} />
                        <ColorField label="Cancel Btn Color" value={cd.cancelButtonColor ?? '#1e293b'} onChange={v => updateCD({ cancelButtonColor: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <ColorField label="Confirm Hover Color" value={cd.confirmHoverColor ?? ''} onChange={v => updateCD({ confirmHoverColor: v || undefined })} />
                        <ColorField label="Cancel Hover Color" value={cd.cancelHoverColor ?? '#334155'} onChange={v => updateCD({ cancelHoverColor: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <NumInput label="Button Padding (px)" value={cd.buttonPadding} fallback={8} min={0} max={60} onChange={v => updateCD({ buttonPadding: v })} />
                        <NumInput label="Button Radius (px)" value={cd.buttonBorderRadius} fallback={8} min={0} onChange={v => updateCD({ buttonBorderRadius: v })} />
                    </div>

                    <Field label="Confirm Button Image">
                        <select className={inputCls} value={cd.confirmButtonImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCD({ confirmButtonImage: null }); return; }
                                updateCD({ confirmButtonImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">None (solid color)</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Cancel Button Image">
                        <select className={inputCls} value={cd.cancelButtonImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCD({ cancelButtonImage: null }); return; }
                                updateCD({ cancelButtonImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">None (solid color)</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Confirm Hover Image">
                        <select className={inputCls} value={cd.confirmHoverImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCD({ confirmHoverImage: null }); return; }
                                updateCD({ confirmHoverImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">None</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Cancel Hover Image">
                        <select className={inputCls} value={cd.cancelHoverImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCD({ cancelHoverImage: null }); return; }
                                updateCD({ cancelHoverImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">None</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    {(cd.confirmButtonImage || cd.cancelButtonImage) && (
                        <>
                            <Field label="Button Image Sizing">
                                <select className={inputCls} value={cd.buttonSizeMode ?? 'stretch'}
                                    onChange={e => updateCD({ buttonSizeMode: e.target.value as any })}>
                                    <option value="stretch">Stretch</option>
                                    <option value="contain">Contain</option>
                                    <option value="cover">Cover</option>
                                    <option value="nine-slice">Nine-Slice</option>
                                </select>
                            </Field>
                            {cd.buttonSizeMode === 'nine-slice' && (
                                <NumInput label="Button Slice (px)" value={cd.buttonSlice} fallback={10} min={1} onChange={v => updateCD({ buttonSlice: v })} />
                            )}
                        </>
                    )}
                </div>

                {/* Font editors */}
                <FontEditor
                    label="Title Font"
                    font={cd.titleFont ?? defaultFontSettings}
                    onFontChange={(prop, value) => updateCD({ titleFont: { ...(cd.titleFont ?? defaultFontSettings), [prop]: value } })}
                    defaultAlign="center"
                />
                <FontEditor
                    label="Message Font"
                    font={cd.messageFont ?? defaultFontSettings}
                    onFontChange={(prop, value) => updateCD({ messageFont: { ...(cd.messageFont ?? defaultFontSettings), [prop]: value } })}
                    defaultAlign="center"
                />
                <FontEditor
                    label="Button Font"
                    font={cd.buttonFont ?? defaultFontSettings}
                    onFontChange={(prop, value) => updateCD({ buttonFont: { ...(cd.buttonFont ?? defaultFontSettings), [prop]: value } })}
                    defaultAlign="center"
                />
            </div>
        );
    }

    return null;
};

/* ------------------------------------------------------------------ */
/*  SnapGuideOverlay – shows grid lines when Shift is held             */
/* ------------------------------------------------------------------ */

const SnapGuideOverlay: React.FC<{ gridSize: number }> = ({ gridSize }) => {
    const lines: React.ReactNode[] = [];
    for (let i = gridSize; i < 100; i += gridSize) {
        lines.push(
            <div key={`v${i}`} className="absolute top-0 bottom-0" style={{ left: `${i}%`, width: 0, borderLeft: '1px dashed rgba(56,189,248,0.15)' }} />,
            <div key={`h${i}`} className="absolute left-0 right-0" style={{ top: `${i}%`, height: 0, borderTop: '1px dashed rgba(56,189,248,0.15)' }} />,
        );
    }
    // Centre crosshair
    lines.push(
        <div key="cx" className="absolute top-0 bottom-0" style={{ left: '50%', width: 0, borderLeft: '1px dashed rgba(56,189,248,0.3)' }} />,
        <div key="cy" className="absolute left-0 right-0" style={{ top: '50%', height: 0, borderTop: '1px dashed rgba(56,189,248,0.3)' }} />,
    );
    return <div className="absolute inset-0 pointer-events-none z-0">{lines}</div>;
};

/* ------------------------------------------------------------------ */
/*  Main Editor Component                                              */
/* ------------------------------------------------------------------ */

interface InGameUIEditorProps {
    project: VNProject;
}

const InGameUIEditor: React.FC<InGameUIEditorProps> = ({ project }) => {
    const { dispatch } = useProject();
    const [selectedElement, setSelectedElement] = useState<InGameUIElement | null>('dialogueBox');
    const [showSnapGuides, setShowSnapGuides] = useState(false);
    const stageRef = useRef<HTMLDivElement>(null);
    const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

    const ui = project.ui;
    const gameW = project.gameResolution?.width || 1920;
    const gameH = project.gameResolution?.height || 1080;

    // Measure canvas in DOM
    useEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        const obs = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            setStageSize({ width, height });
        });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    // Track shift for snap guides
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => setShowSnapGuides(e.shiftKey);
        window.addEventListener('keydown', onKey);
        window.addEventListener('keyup', onKey);
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
    }, []);

    const updateUI = useCallback((updates: Partial<VNProjectUI>) => {
        dispatch({ type: 'UPDATE_UI', payload: updates });
    }, [dispatch]);

    /* ─── Per-element rectangles ─── */
    const dialogueRect = useMemo(() => getDialogueRect(ui, gameW, gameH), [ui, gameW, gameH]);
    const nameboxRect = useMemo(() => getNameboxRect(ui, gameW, gameH), [ui, gameW, gameH]);
    const choiceRect = useMemo(() => getChoiceRect(ui, gameW, gameH), [ui, gameW, gameH]);
    const inputRect = useMemo(() => getInputRect(ui, gameW, gameH), [ui, gameW, gameH]);
    const quickMenuRect = useMemo(() => getQuickMenuRect(ui, gameW, gameH), [ui, gameW, gameH]);

    /* ─── Drag update handlers ─── */
    const handleDragDialogue = useCallback((u: { x: number; y: number; width: number; height: number }) => {
        updateUI({
            dialogueBoxX: u.x,
            dialogueBoxY: u.y,
            dialogueBoxWidth: u.width,
            dialogueBoxHeight: Math.round(u.height * (gameH / 100)),
        });
    }, [updateUI, gameH]);

    const handleDragNamebox = useCallback((u: { x: number; y: number; width: number; height: number }) => {
        updateUI({ nameboxX: u.x, nameboxY: u.y, nameboxWidth: u.width, nameboxHeight: u.height });
    }, [updateUI]);

    const handleDragChoice = useCallback((u: { x: number; y: number; width: number; height: number }) => {
        updateUI({
            choiceButtonX: u.x,
            choiceButtonY: u.y,
            choiceButtonWidth: Math.round(u.width * (gameW / 100)),
            choiceButtonHeight: Math.round(u.height * (gameH / 100)),
        });
    }, [updateUI, gameW, gameH]);

    const handleDragInput = useCallback((u: { x: number; y: number; width: number; height: number }) => {
        updateUI({
            inputBoxX: u.x,
            inputBoxY: u.y,
            inputBoxWidth: Math.round(u.width * (gameW / 100)),
            inputBoxHeight: Math.round(u.height * (gameH / 100)),
        });
    }, [updateUI, gameW, gameH]);

    const handleDragQuickMenu = useCallback((u: { x: number; y: number; width: number; height: number }) => {
        updateUI({ quickMenuX: u.x, quickMenuY: u.y, quickMenuWidth: u.width, quickMenuHeight: u.height });
    }, [updateUI]);

    const isHidden = (el: InGameUIElement) => el === 'quickMenu' && ui.quickMenuPosition === 'hidden';

    /* ─── Background image for stage ─── */
    const stageBg = useMemo<React.CSSProperties>(() => {
        const firstBg = Object.values(project.backgrounds || {})[0] as any;
        if (firstBg?.imageUrl) return { backgroundImage: `url(${firstBg.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' };
        return { backgroundColor: '#1e293b' };
    }, [project.backgrounds]);

    /* ─── Determine which element to render ─── */
    const elementRects: Partial<Record<InGameUIElement, { rect: ReturnType<typeof getDialogueRect>; handler: typeof handleDragDialogue; preview: React.ReactNode }>> = useMemo(() => ({
        dialogueBox:   { rect: dialogueRect,   handler: handleDragDialogue,  preview: <DialogueBoxPreview ui={ui} project={project} /> },
        nameBox:       { rect: nameboxRect,    handler: handleDragNamebox,   preview: <NameBoxPreview ui={ui} project={project} /> },
        choiceButtons: { rect: choiceRect,     handler: handleDragChoice,    preview: <ChoiceButtonsPreview ui={ui} project={project} /> },
        inputBox:      { rect: inputRect,      handler: handleDragInput,     preview: <InputBoxPreview ui={ui} project={project} /> },
        quickMenu:     { rect: quickMenuRect,  handler: handleDragQuickMenu, preview: <QuickMenuPreview ui={ui} /> },
    }), [dialogueRect, nameboxRect, choiceRect, inputRect, quickMenuRect, ui, project,
         handleDragDialogue, handleDragNamebox, handleDragChoice, handleDragInput, handleDragQuickMenu]);

    const activeEl = selectedElement && !isHidden(selectedElement) ? elementRects[selectedElement] ?? null : null;

    return (
        <div className="flex h-full">
            {/* Element list sidebar */}
            <div className="bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] flex flex-col" style={{ width: 'var(--sidebar-width)' }}>
                <div className="p-4 border-b border-[var(--border-subtle)]">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <ChatBubbleIcon className="w-5 h-5" />
                        In-Game UI
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">Select an element, then drag &amp; resize on canvas. Hold <kbd className="px-1 bg-[var(--bg-tertiary)] rounded text-[10px]">Shift</kbd> to snap.</p>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {ELEMENTS.map(el => (
                        <button
                            key={el.id}
                            onClick={() => setSelectedElement(el.id)}
                            className={`w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors ${
                                selectedElement === el.id
                                    ? 'bg-sky-500/20 border border-sky-500/50 text-sky-300'
                                    : 'hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                            } ${isHidden(el.id) ? 'opacity-40' : ''}`}
                        >
                            <span className="flex-shrink-0">{el.icon}</span>
                            <div className="min-w-0">
                                <span className="block text-sm font-medium truncate">{el.label}</span>
                                <span className="block text-[10px] text-[var(--text-muted)] truncate">{el.description}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Canvas area (center) */}
            <div className="flex-1 min-w-0 flex items-center justify-center p-4 bg-[var(--bg-secondary)]">
                <div
                    ref={stageRef}
                    className="relative overflow-hidden rounded-md shadow-lg"
                    style={{
                        ...stageBg,
                        aspectRatio: `${gameW} / ${gameH}`,
                        maxWidth: '100%',
                        maxHeight: '100%',
                        width: '100%',
                        '--font-scale': stageSize.width > 0 ? stageSize.width / gameW : 1,
                    } as React.CSSProperties}
                >
                    {showSnapGuides && <SnapGuideOverlay gridSize={5} />}

                    {/* Only render the currently selected element */}
                    {activeEl && (
                        <ResizableDraggable
                            x={activeEl.rect.x} y={activeEl.rect.y}
                            width={activeEl.rect.width} height={activeEl.rect.height}
                            anchorX={0} anchorY={0}
                            parentSize={stageSize}
                            isSelected={true}
                            onSelect={e => { e.stopPropagation(); }}
                            onUpdate={activeEl.handler}
                            snapGrid={1}
                            label={ELEMENTS.find(e => e.id === selectedElement)?.label}
                        >
                            {activeEl.preview}
                        </ResizableDraggable>
                    )}

                    {/* Confirm Dialogs preview – full-canvas overlay, not draggable */}
                    {selectedElement === 'confirmDialogs' && (
                        <ConfirmDialogPreview ui={ui} project={project} />
                    )}

                    {!activeEl && selectedElement !== 'confirmDialogs' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <p className="text-sm text-white/30">Select an element from the sidebar</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Properties panel (right side) */}
            <div className="w-72 flex-shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-primary)] overflow-y-auto">
                {selectedElement ? (
                    <InGameUIPropsEditor ui={ui} element={selectedElement} project={project} onUpdate={updateUI} />
                ) : (
                    <div className="p-4 text-center text-[var(--text-secondary)] text-sm">
                        Click an element on the sidebar to edit its properties
                    </div>
                )}
            </div>
        </div>
    );
};

export default InGameUIEditor;
