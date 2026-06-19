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
import { RangeInput } from './ui/Form';
import { VNProject } from '../types/project';
import { VNProjectUI, VNFontSettings, VNConfirmDialogSettings, QuickMenuButtonKey, QuickMenuButtonConfig, QuickMenuCustomButton } from '../features/ui/types';
import { VNID } from '../types';
import { useProject } from '../contexts/ProjectContext';
import FontEditor, { defaultFontSettings } from './ui/FontEditor';
import { useTranslation } from 'react-i18next';
import { fontSettingsToStyle, extractTextGradientStyle } from '../utils/styleUtils';
import { GradientText } from './ui/GradientText';
import ResizableDraggable from './menu-editor/ResizableDraggable';
import TextboxThemeManager from './ui/TextboxThemeManager';
import DialogueReactiveStatesEditor from './ui/DialogueReactiveStatesEditor';
import QuickMenuReactiveStatesEditor from './ui/QuickMenuReactiveStatesEditor';
import ActionEditor from './menu-editor/ActionEditor';
import { UIActionType, VNUIAction } from '../types/shared';
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
    | 'confirmDialogs'
    | 'textboxThemes';

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
    { id: 'textboxThemes', label: 'Textbox Themes', icon: <BookmarkSquareIcon className="w-4 h-4" />, description: 'Reusable per-character dialogue box designs' },
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

/** The six quick-menu buttons + their per-button visibility flag (shared by editor UI). */
const QUICK_MENU_BUTTONS: { key: QuickMenuButtonKey; label: string; showKey: keyof VNProjectUI }[] = [
    { key: 'skipBackward', label: 'Back',  showKey: 'quickMenuShowSkipBackward' },
    { key: 'log',          label: 'Log',   showKey: 'quickMenuShowLog' },
    { key: 'autoAdvance',  label: 'Auto',  showKey: 'quickMenuShowAutoAdvance' },
    { key: 'skipForward',  label: 'Skip',  showKey: 'quickMenuShowSkipForward' },
    { key: 'save',         label: 'Save',  showKey: 'quickMenuShowSave' },
    { key: 'load',         label: 'Load',  showKey: 'quickMenuShowLoad' },
];

function getQuickMenuVisibleButtons(ui: VNProjectUI) {
    return QUICK_MENU_BUTTONS.filter(b => (ui as any)[b.showKey] !== false);
}

/** Per-button rects for independent layout — mirrors the runtime default spread, including the
 *  author-defined custom buttons (appended after the built-ins, exactly as the engine orders them). */
function getQuickMenuButtonRects(ui: VNProjectUI, gameW = 1920, gameH = 1080) {
    const group = getQuickMenuRect(ui, gameW, gameH);
    const cfgs = ui.quickMenuButtons || {};
    const combined = [
        ...getQuickMenuVisibleButtons(ui).map(b => ({ key: b.key as string, label: b.label, cfg: (cfgs[b.key] || {}) as QuickMenuButtonConfig, isCustom: false })),
        ...(ui.quickMenuCustomButtons || []).filter(c => c.show !== false).map(c => ({ key: c.id as string, label: c.label, cfg: c as QuickMenuButtonConfig, isCustom: true })),
    ];
    const count = combined.length || 1;
    const slotW = group.width / count;
    return combined.map((b, i) => ({
        key: b.key,
        label: b.label,
        isCustom: b.isCustom,
        cfg: b.cfg,
        rect: {
            x: b.cfg.x ?? (group.x + i * slotW),
            y: b.cfg.y ?? group.y,
            width: b.cfg.width ?? Math.max(4, slotW - 1),
            height: b.cfg.height ?? group.height,
        },
    }));
}

/* ------------------------------------------------------------------ */
/*  Canvas renderers – preview how elements look in-game               */
/* ------------------------------------------------------------------ */

const DialogueBoxPreview: React.FC<{ ui: VNProjectUI; project: VNProject }> = ({ ui, project }) => {
    const { t } = useTranslation('ui');
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
                        {t('inGameUi.sampleDialogue')}
                    </p>
                </div>
            </div>
        </div>
    );
};

const NameBoxPreview: React.FC<{ ui: VNProjectUI; project: VNProject }> = ({ ui, project }) => {
    const { t } = useTranslation('ui');
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
                <GradientText style={extractTextGradientStyle(ui.dialogueNameFont)}>{t('inGameUi.characterName')}</GradientText>
            </span>
        </div>
    );
};

const ChoiceButtonsPreview: React.FC<{ ui: VNProjectUI; project: VNProject }> = ({ ui, project }) => {
    const { t } = useTranslation('ui');
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
            {['A', 'B', 'C'].map(label => (
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
                            <GradientText style={extractTextGradientStyle(ui.choiceTextFont)}>{`${t('inGameUi.sampleChoice')} ${label}`}</GradientText>
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
};

const InputBoxPreview: React.FC<{ ui: VNProjectUI; project: VNProject }> = ({ ui, project }) => {
    const { t } = useTranslation('ui');
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
                        <GradientText style={extractTextGradientStyle(ui.inputPromptFont)}>{t('inGameUi.whatIsYourName')}</GradientText>
                    </p>
                    <div className="w-[80%] bg-white/10 rounded px-2 py-1" style={fontToStyle(ui.inputFieldFont)}>
                        <span className="opacity-40">{t('inGameUi.typeHere')}</span>
                    </div>
                    <div className="px-4 py-1 rounded bg-sky-600/80">
                        <span style={fontToStyle(ui.inputSubmitFont)}>
                            <GradientText style={extractTextGradientStyle(ui.inputSubmitFont)}>{t('inGameUi.submit')}</GradientText>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

/** Resolve a quick-menu button's art url from images + backgrounds. */
function resolveQmArt(project: VNProject, asset?: { id: string } | null): string | null {
    if (!asset?.id) return null;
    const all = { ...(project.images || {}), ...(project.backgrounds || {}) } as Record<string, any>;
    return all[asset.id]?.imageUrl || all[asset.id]?.videoUrl || null;
}

const QuickMenuPreview: React.FC<{ ui: VNProjectUI; project: VNProject }> = ({ ui, project }) => {
    const { t } = useTranslation('ui');
    const bgColor = hexToRgba(ui.quickMenuColor ?? '#0f172a', ui.quickMenuOpacity ?? 75);
    const br = ui.quickMenuBorderRadius ?? 4;
    const visibleButtons = getQuickMenuVisibleButtons(ui);
    const cfgs = ui.quickMenuButtons || {};

    return (
        <div className="w-full h-full flex items-center justify-center gap-[2%]">
            {visibleButtons.map(btn => {
                const art = resolveQmArt(project, cfgs[btn.key]?.image as any);
                if (art) {
                    return <img key={btn.key} src={art} alt={t('inGameUi.qmLabels.'+btn.key)} draggable={false}
                        style={{ height: '75%', width: 'auto', objectFit: 'contain', display: 'block' }} />;
                }
                return (
                    <div key={btn.key} style={{
                        backgroundColor: bgColor,
                        borderRadius: `calc(var(--font-scale,1) * ${br}px)`,
                        fontSize: 'calc(var(--font-scale,1) * 12px)',
                        padding: 'calc(var(--font-scale,1) * 10px) calc(var(--font-scale,1) * 10px)',
                        color: 'rgba(255,255,255,0.8)',
                        border: '1px solid rgba(148,163,184,0.2)',
                    }}>
                        {t('inGameUi.qmLabels.'+btn.key)}
                    </div>
                );
            })}
            {/* Author-defined custom buttons render inline after the built-ins (grouped layout). */}
            {(ui.quickMenuCustomButtons || []).filter(c => c.show !== false).map(cb => {
                const art = resolveQmArt(project, cb.image as any);
                if (art) {
                    return <img key={cb.id} src={art} alt={cb.label} draggable={false}
                        style={{ height: '75%', width: 'auto', objectFit: 'contain', display: 'block' }} />;
                }
                return (
                    <div key={cb.id} style={{
                        backgroundColor: bgColor,
                        borderRadius: `calc(var(--font-scale,1) * ${br}px)`,
                        fontSize: 'calc(var(--font-scale,1) * 12px)',
                        padding: 'calc(var(--font-scale,1) * 10px) calc(var(--font-scale,1) * 10px)',
                        color: 'rgba(255,255,255,0.8)',
                        border: '1px solid rgba(148,163,184,0.2)',
                    }}>
                        {cb.label}
                    </div>
                );
            })}
        </div>
    );
};

/** A single quick-menu button preview (fills its container) — used for the per-button
 *  draggables in independent layout. Shows custom art (object-contain) or a default pill. */
const QuickMenuButtonPreview: React.FC<{ ui: VNProjectUI; project: VNProject; label: string; btnKey?: QuickMenuButtonKey; cfg?: QuickMenuButtonConfig }> = ({ ui, project, btnKey, label, cfg: cfgProp }) => {
    const cfg = cfgProp ?? (btnKey ? (ui.quickMenuButtons || {})[btnKey] || {} : {});
    const art = resolveQmArt(project, cfg.image as any);
    if (art) {
        // Mirror the engine's "fit to content": art shrinks to its fitted rect, centered, so the
        // editor preview matches the in-game footprint/hitbox.
        if (cfg.fitToContent) {
            return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <img src={art} alt={label} draggable={false}
                    style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }} />
            </div>;
        }
        return <img src={art} alt={label} draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />;
    }
    return (
        <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: hexToRgba(ui.quickMenuColor ?? '#0f172a', ui.quickMenuOpacity ?? 75),
            borderRadius: `calc(var(--font-scale,1) * ${ui.quickMenuBorderRadius ?? 4}px)`,
            color: 'rgba(255,255,255,0.8)',
            fontSize: 'calc(var(--font-scale,1) * 12px)',
            border: '1px solid rgba(148,163,184,0.2)',
        }}>
            {label}
        </div>
    );
};

const ConfirmDialogPreview: React.FC<{ ui: VNProjectUI; project: VNProject }> = ({ ui, project }) => {
    const { t } = useTranslation('ui');
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
                        {cd.quitTitle || t('inGameUi.phQuitGame')}
                    </div>
                    <div style={{ ...messageStyle, marginBottom: 'calc(var(--font-scale,1) * 24px)' }}>
                        {cd.quitMessage || t('inGameUi.phQuitMsg')}
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
                            {cd.quitCancelLabel || t('inGameUi.phCancel')}
                        </div>
                        <div style={{
                            ...btnStyle,
                            padding: `calc(var(--font-scale,1) * ${btnPad}px) calc(var(--font-scale,1) * ${btnPad * 3}px)`,
                            borderRadius: `calc(var(--font-scale,1) * ${btnBorderRadius}px)`,
                            background: confirmBtnImgUrl ? 'transparent' : (confirmBtnColor || 'linear-gradient(to right, #ec4899, #a855f7)'),
                            ...makeBtnImageStyle(confirmBtnImgUrl),
                        }}>
                            {cd.quitConfirmLabel || t('inGameUi.phQuit')}
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
            <RangeInput min={0} max={100} value={value} onChange={e => onChange(parseInt(e.target.value))} className="flex-1 accent-sky-500" />
            <span className="text-xs text-[var(--text-secondary)] w-8 text-right">{value}%</span>
        </div>
    </PropsField>
);

const InGameUIPropsEditor: React.FC<PropsEditorProps> = ({ ui, element, project, onUpdate }) => {
    const { t } = useTranslation('ui');
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
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1">{t('inGameUi.dialogueBox')}</h4>
                <div className="grid grid-cols-2 gap-2">
                    <ColorField label={t('inGameUi.colorBackground')} value={ui.dialogueBoxColor ?? '#0f172a'} onChange={v => onUpdate({ dialogueBoxColor: v })} />
                    <OpacityField label={t('inGameUi.opacity')} value={ui.dialogueBoxOpacity ?? 90} onChange={v => onUpdate({ dialogueBoxOpacity: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <NumInput label={t('inGameUi.borderRadius')} value={ui.dialogueBoxBorderRadius} fallback={8} min={0} onChange={v => onUpdate({ dialogueBoxBorderRadius: v })} />
                    <NumInput label={t('inGameUi.contentPadding')} value={ui.dialogueBoxPadding} fallback={20} min={0} onChange={v => onUpdate({ dialogueBoxPadding: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <NumInput label={t('inGameUi.width')} value={ui.dialogueBoxWidth} fallback={100} min={10} max={100} onChange={v => onUpdate({ dialogueBoxWidth: v })} />
                    <NumInput label={t('inGameUi.bottomMargin')} value={ui.dialogueBoxBottomMargin} fallback={20} min={0} onChange={v => onUpdate({ dialogueBoxBottomMargin: v })} />
                </div>

                <Field label={t('inGameUi.backgroundImage')}>
                    <select className={inputCls} value={ui.dialogueBoxImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ dialogueBoxImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">{t('inGameUi.noneUseColor')}</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>

                {ui.dialogueBoxImage && (
                    <Field label={t('inGameUi.imageFitMode')}>
                        <select className={inputCls} value={ui.dialogueBoxSizeMode ?? 'stretch'}
                            onChange={e => onUpdate({ dialogueBoxSizeMode: e.target.value as any })}>
                            <option value="stretch">{t('inGameUi.fitStretch')}</option>
                            <option value="contain">{t('inGameUi.fitContain')}</option>
                            <option value="cover">{t('inGameUi.fitCover')}</option>
                            <option value="tile">{t('inGameUi.fitTile')}</option>
                            <option value="nine-slice">{t('inGameUi.fitNineSlice')}</option>
                        </select>
                    </Field>
                )}
                {ui.dialogueBoxImage && (ui.dialogueBoxSizeMode ?? 'stretch') === 'nine-slice' && (
                    <NumInput label={t('inGameUi.slice')} value={ui.dialogueBoxSlice} fallback={30} min={1} onChange={v => onUpdate({ dialogueBoxSlice: v })} />
                )}

                <Field label={t('inGameUi.borderImage')}>
                    <select className={inputCls} value={ui.dialogueBoxBorderImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ dialogueBoxBorderImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">{t('inGameUi.none')}</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>
                {ui.dialogueBoxBorderImage && (
                    <NumInput label={t('inGameUi.borderPadding')} value={ui.dialogueBorderPadding} fallback={12} min={0} onChange={v => onUpdate({ dialogueBorderPadding: v })} />
                )}

                {/* Text padding inside dialogue */}
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1 pt-2">{t('inGameUi.textPosition')}</h4>
                <p className="text-[10px] text-[var(--text-muted)]">{t('inGameUi.textPosHint')}</p>
                <div className="grid grid-cols-2 gap-2">
                    <NumInput label={t('inGameUi.posTop')} value={ui.dialogueTextPaddingTop} fallback={0} min={0} onChange={v => onUpdate({ dialogueTextPaddingTop: v })} />
                    <NumInput label={t('inGameUi.posBottom')} value={ui.dialogueTextPaddingBottom} fallback={0} min={0} onChange={v => onUpdate({ dialogueTextPaddingBottom: v })} />
                    <NumInput label={t('inGameUi.posLeft')} value={ui.dialogueTextPaddingLeft} fallback={0} min={0} onChange={v => onUpdate({ dialogueTextPaddingLeft: v })} />
                    <NumInput label={t('inGameUi.posRight')} value={ui.dialogueTextPaddingRight} fallback={0} min={0} onChange={v => onUpdate({ dialogueTextPaddingRight: v })} />
                </div>

                <FontEditor
                    label={t('inGameUi.dialogueTextFont')}
                    font={(ui.dialogueTextFont as VNFontSettings) ?? defaultFontSettings}
                    onFontChange={(prop, value) => onUpdate({ dialogueTextFont: { ...((ui.dialogueTextFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })}
                />

                <div className="border-t border-[var(--border-subtle)] pt-2">
                    <h4 className="text-sm font-bold text-white mb-1">Speaker Emphasis</h4>
                    <p className="text-[10px] text-[var(--text-muted)] mb-2">While a character is speaking, brighten + slightly enlarge them and dim the others — a "who's talking" cue that needs no mouth art.</p>
                    <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={ui.speakerEmphasisEnabled ?? false} onChange={e => onUpdate({ speakerEmphasisEnabled: e.target.checked })} className="cursor-pointer" />
                        Enable speaker emphasis
                    </label>
                    {ui.speakerEmphasisEnabled && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <NumInput label="Non-speaker brightness %" value={ui.speakerEmphasisDim != null ? Math.round(ui.speakerEmphasisDim * 100) : undefined} fallback={50} min={10} max={100} onChange={v => onUpdate({ speakerEmphasisDim: Math.max(0.1, Math.min(1, v / 100)) })} />
                            <NumInput label="Speaker zoom %" value={ui.speakerEmphasisScale != null ? Math.round(ui.speakerEmphasisScale * 100) : undefined} fallback={104} min={100} max={120} onChange={v => onUpdate({ speakerEmphasisScale: Math.max(1, Math.min(1.3, v / 100)) })} />
                        </div>
                    )}
                </div>

                <div className="border-t border-[var(--border-subtle)] pt-2">
                    <DialogueReactiveStatesEditor states={ui.dialogueReactiveStates} project={project} onChange={s => onUpdate({ dialogueReactiveStates: s })} />
                </div>
            </div>
        );
    }

    /* Name Box properties */
    if (element === 'nameBox') {
        return (
            <div className="space-y-3 p-3">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1">{t('inGameUi.nameBox')}</h4>
                <div className="grid grid-cols-2 gap-2">
                    <ColorField label={t('inGameUi.colorBackground')} value={ui.nameboxColor ?? '#0f172a'} onChange={v => onUpdate({ nameboxColor: v })} />
                    <OpacityField label={t('inGameUi.opacity')} value={ui.nameboxOpacity ?? 92} onChange={v => onUpdate({ nameboxOpacity: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <NumInput label={t('inGameUi.borderRadius')} value={ui.nameboxBorderRadius} fallback={6} min={0} onChange={v => onUpdate({ nameboxBorderRadius: v })} />
                    <NumInput label={t('inGameUi.padding')} value={ui.nameboxPadding} fallback={8} min={0} onChange={v => onUpdate({ nameboxPadding: v })} />
                    <NumInput label={t('inGameUi.hPadding')} value={ui.nameboxHorizontalPadding} fallback={14} min={0} onChange={v => onUpdate({ nameboxHorizontalPadding: v })} />
                </div>

                <Field label={t('inGameUi.backgroundImage')}>
                    <select className={inputCls} value={ui.nameboxImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ nameboxImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">{t('inGameUi.noneUseColor')}</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>

                {ui.nameboxImage && (
                    <Field label={t('inGameUi.imageFitMode')}>
                        <select className={inputCls} value={ui.nameboxSizeMode ?? 'stretch'}
                            onChange={e => onUpdate({ nameboxSizeMode: e.target.value as any })}>
                            <option value="stretch">{t('inGameUi.fitStretch')}</option>
                            <option value="contain">{t('inGameUi.fitContain')}</option>
                            <option value="cover">{t('inGameUi.fitCover')}</option>
                            <option value="tile">{t('inGameUi.fitTile')}</option>
                            <option value="nine-slice">{t('inGameUi.fitNineSlice')}</option>
                        </select>
                    </Field>
                )}

                <FontEditor
                    label={t('inGameUi.nameFont')}
                    font={(ui.dialogueNameFont as VNFontSettings) ?? defaultFontSettings}
                    onFontChange={(prop, value) => onUpdate({ dialogueNameFont: { ...((ui.dialogueNameFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })}
                />
                <p className="text-[10px] text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-2">
                    Want the nameplate to change with a variable? Set up <strong>Reactive States</strong> in the Dialogue Box section — they cover the box <em>and</em> the nameplate.
                </p>
            </div>
        );
    }

    /* Choice Buttons properties */
    if (element === 'choiceButtons') {
        return (
            <div className="space-y-3 p-3">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1">{t('inGameUi.choiceButtons')}</h4>
                <div className="grid grid-cols-2 gap-2">
                    <ColorField label={t('inGameUi.colorBackground')} value={ui.choiceButtonColor ?? '#1e293b'} onChange={v => onUpdate({ choiceButtonColor: v })} />
                    <OpacityField label={t('inGameUi.opacity')} value={ui.choiceButtonOpacity ?? 90} onChange={v => onUpdate({ choiceButtonOpacity: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <NumInput label={t('inGameUi.borderRadius')} value={ui.choiceButtonBorderRadius} fallback={8} min={0} onChange={v => onUpdate({ choiceButtonBorderRadius: v })} />
                    <NumInput label={t('inGameUi.padding')} value={ui.choiceButtonPadding} fallback={16} min={0} onChange={v => onUpdate({ choiceButtonPadding: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <ColorField label={t('inGameUi.hoverColor')} value={ui.choiceHoverColor ?? '#334155'} onChange={v => onUpdate({ choiceHoverColor: v })} />
                </div>

                <Field label={t('inGameUi.backgroundImage')}>
                    <select className={inputCls} value={ui.choiceButtonImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ choiceButtonImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">{t('inGameUi.noneUseColor')}</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>

                {ui.choiceButtonImage && (
                    <Field label={t('inGameUi.imageFitMode')}>
                        <select className={inputCls} value={ui.choiceButtonSizeMode ?? 'stretch'}
                            onChange={e => onUpdate({ choiceButtonSizeMode: e.target.value as any })}>
                            <option value="stretch">{t('inGameUi.fitStretch')}</option>
                            <option value="contain">{t('inGameUi.fitContain')}</option>
                            <option value="cover">{t('inGameUi.fitCover')}</option>
                            <option value="tile">{t('inGameUi.fitTile')}</option>
                            <option value="nine-slice">{t('inGameUi.fitNineSlice')}</option>
                        </select>
                    </Field>
                )}
                {ui.choiceButtonImage && (ui.choiceButtonSizeMode ?? 'stretch') === 'nine-slice' && (
                    <NumInput label={t('inGameUi.slice')} value={ui.choiceButtonSlice} fallback={15} min={1} onChange={v => onUpdate({ choiceButtonSlice: v })} />
                )}

                <Field label={t('inGameUi.hoverImage')}>
                    <select className={inputCls} value={ui.choiceHoverImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ choiceHoverImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">{t('inGameUi.none')}</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>

                <Field label={t('inGameUi.borderImage')}>
                    <select className={inputCls} value={ui.choiceButtonBorderImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ choiceButtonBorderImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">{t('inGameUi.none')}</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>
                {ui.choiceButtonBorderImage && (
                    <NumInput label={t('inGameUi.borderPadding')} value={ui.choiceBorderPadding} fallback={8} min={0} onChange={v => onUpdate({ choiceBorderPadding: v })} />
                )}

                <FontEditor
                    label={t('inGameUi.choiceTextFont')}
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
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1">{t('inGameUi.textInputBox')}</h4>
                <div className="grid grid-cols-2 gap-2">
                    <ColorField label={t('inGameUi.colorBackground')} value={ui.inputBoxColor ?? '#0f172a'} onChange={v => onUpdate({ inputBoxColor: v })} />
                    <OpacityField label={t('inGameUi.opacity')} value={ui.inputBoxOpacity ?? 92} onChange={v => onUpdate({ inputBoxOpacity: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <NumInput label={t('inGameUi.borderRadius')} value={ui.inputBoxBorderRadius} fallback={8} min={0} onChange={v => onUpdate({ inputBoxBorderRadius: v })} />
                    <NumInput label={t('inGameUi.padding')} value={ui.inputBoxPadding} fallback={24} min={0} onChange={v => onUpdate({ inputBoxPadding: v })} />
                </div>

                <Field label={t('inGameUi.backgroundImage')}>
                    <select className={inputCls} value={ui.inputBoxImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ inputBoxImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">{t('inGameUi.noneUseColor')}</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>

                {ui.inputBoxImage && (
                    <Field label={t('inGameUi.imageFitMode')}>
                        <select className={inputCls} value={ui.inputBoxSizeMode ?? 'stretch'}
                            onChange={e => onUpdate({ inputBoxSizeMode: e.target.value as any })}>
                            <option value="stretch">{t('inGameUi.fitStretch')}</option>
                            <option value="contain">{t('inGameUi.fitContain')}</option>
                            <option value="cover">{t('inGameUi.fitCover')}</option>
                            <option value="tile">{t('inGameUi.fitTile')}</option>
                            <option value="nine-slice">{t('inGameUi.fitNineSlice')}</option>
                        </select>
                    </Field>
                )}
                {ui.inputBoxImage && (ui.inputBoxSizeMode ?? 'stretch') === 'nine-slice' && (
                    <NumInput label={t('inGameUi.slice')} value={ui.inputBoxSlice} fallback={20} min={1} onChange={v => onUpdate({ inputBoxSlice: v })} />
                )}

                <Field label={t('inGameUi.borderImage')}>
                    <select className={inputCls} value={ui.inputBoxBorderImage?.id || ''}
                        onChange={e => {
                            const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                            onUpdate({ inputBoxBorderImage: asset ? { type: 'image', id: asset.id } : null });
                        }}>
                        <option value="">{t('inGameUi.none')}</option>
                        {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                    </select>
                </Field>
                {ui.inputBoxBorderImage && (
                    <NumInput label={t('inGameUi.borderPadding')} value={ui.inputBorderPadding} fallback={8} min={0} onChange={v => onUpdate({ inputBorderPadding: v })} />
                )}

                <FontEditor
                    label={t('inGameUi.promptFont')}
                    font={(ui.inputPromptFont as VNFontSettings) ?? defaultFontSettings}
                    onFontChange={(prop, value) => onUpdate({ inputPromptFont: { ...((ui.inputPromptFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })}
                />
                <FontEditor
                    label={t('inGameUi.inputFieldFont')}
                    font={(ui.inputFieldFont as VNFontSettings) ?? defaultFontSettings}
                    onFontChange={(prop, value) => onUpdate({ inputFieldFont: { ...((ui.inputFieldFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })}
                />
                <FontEditor
                    label={t('inGameUi.submitButtonFont')}
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
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1">{t('inGameUi.quickMenu')}</h4>
                <div className="grid grid-cols-2 gap-2">
                    <ColorField label={t('inGameUi.buttonColor')} value={ui.quickMenuColor ?? '#0f172a'} onChange={v => onUpdate({ quickMenuColor: v })} />
                    <OpacityField label={t('inGameUi.opacity')} value={ui.quickMenuOpacity ?? 75} onChange={v => onUpdate({ quickMenuOpacity: v })} />
                </div>
                <NumInput label={t('inGameUi.borderRadius')} value={ui.quickMenuBorderRadius} fallback={4} min={0} onChange={v => onUpdate({ quickMenuBorderRadius: v })} />
                <Field label={t('inGameUi.positionPreset')}>
                    <select className={inputCls} value={ui.quickMenuPosition ?? 'above-dialogue'} onChange={e => onUpdate({
                        quickMenuPosition: e.target.value as any,
                        // Clear explicit drag-set coordinates so the new preset's defaults take effect.
                        // Otherwise saved X/Y/W/H from a prior drag override the preset and nothing visibly changes.
                        quickMenuX: undefined,
                        quickMenuY: undefined,
                        quickMenuWidth: undefined,
                        quickMenuHeight: undefined,
                    })}>
                        <option value="above-dialogue">{t('inGameUi.posAboveDialogue')}</option>
                        <option value="top-right">{t('inGameUi.posTopRight')}</option>
                        <option value="top-left">{t('inGameUi.posTopLeft')}</option>
                        <option value="bottom-right">{t('inGameUi.posBottomRight')}</option>
                        <option value="bottom-left">{t('inGameUi.posBottomLeft')}</option>
                        <option value="hidden">{t('inGameUi.posHidden')}</option>
                    </select>
                </Field>
                {(ui.quickMenuX !== undefined || ui.quickMenuY !== undefined || ui.quickMenuWidth !== undefined || ui.quickMenuHeight !== undefined) && (
                    <button
                        type="button"
                        onClick={() => onUpdate({ quickMenuX: undefined, quickMenuY: undefined, quickMenuWidth: undefined, quickMenuHeight: undefined })}
                        className="w-full text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
                        title={t('inGameUi.resetPresetTitle')}
                    >
                        {t('inGameUi.resetPreset')}
                    </button>
                )}
                <Field label={t('inGameUi.floatOverDialogue')}>
                    <input
                        type="checkbox"
                        checked={ui.quickMenuFloatOverDialogue ?? false}
                        onChange={e => onUpdate({ quickMenuFloatOverDialogue: e.target.checked })}
                        className="cursor-pointer"
                    />
                    <span className="text-xs text-[var(--text-secondary)] ml-2">{t('inGameUi.floatOverHint')}</span>
                </Field>

                <Field label={t('inGameUi.independentLayout')}>
                    <input
                        type="checkbox"
                        checked={ui.quickMenuIndependentLayout ?? false}
                        onChange={e => onUpdate({ quickMenuIndependentLayout: e.target.checked })}
                        className="cursor-pointer"
                    />
                    <span className="text-xs text-[var(--text-secondary)] ml-2">{t('inGameUi.independentHint')}</span>
                </Field>

                <div className="border-t border-[var(--border-subtle)] pt-2">
                    <QuickMenuReactiveStatesEditor states={ui.quickMenuReactiveStates} project={project} onChange={s => onUpdate({ quickMenuReactiveStates: s })} />
                </div>

                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1 pt-3">{t('inGameUi.buttonsHeader')}</h4>
                <p className="text-[10px] text-[var(--text-muted)]">{t('inGameUi.buttonsHint')}{ui.quickMenuIndependentLayout ? t('inGameUi.buttonsHintDrag') : ''}</p>

                <div className="space-y-2">
                    {QUICK_MENU_BUTTONS.map(b => {
                        const cfg = (ui.quickMenuButtons || {})[b.key] || {};
                        const updateBtn = (patch: Partial<QuickMenuButtonConfig>) => {
                            const prev = ui.quickMenuButtons || {};
                            onUpdate({ quickMenuButtons: { ...prev, [b.key]: { ...prev[b.key], ...patch } } });
                        };
                        const shown = (ui as any)[b.showKey] !== false;
                        return (
                            <div key={b.key} className="border border-[var(--border-subtle)] rounded p-2 space-y-1.5">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={shown}
                                        onChange={e => onUpdate({ [b.showKey]: e.target.checked } as Partial<VNProjectUI>)}
                                        className="cursor-pointer"
                                    />
                                    <span className="text-xs font-medium text-[var(--text-secondary)]">{t('inGameUi.qmLabels.'+b.key)}</span>
                                </label>
                                {shown && (
                                    <>
                                        <Field label={t('inGameUi.image')}>
                                            <select className={inputCls} value={cfg.image?.id || ''}
                                                onChange={e => {
                                                    const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                                                    updateBtn({ image: asset ? { type: 'image', id: asset.id } : null });
                                                }}>
                                                <option value="">{t('inGameUi.noneDefaultStyle')}</option>
                                                {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                                            </select>
                                        </Field>
                                        <Field label={t('inGameUi.hoverImage')}>
                                            <select className={inputCls} value={cfg.hoverImage?.id || ''}
                                                onChange={e => {
                                                    const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                                                    updateBtn({ hoverImage: asset ? { type: 'image', id: asset.id } : null });
                                                }}>
                                                <option value="">{t('inGameUi.none')}</option>
                                                {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                                            </select>
                                        </Field>
                                        {ui.quickMenuIndependentLayout && (
                                            <>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <NumInput label={t('inGameUi.width')} value={cfg.width} fallback={8} min={1} max={100} onChange={v => updateBtn({ width: v })} />
                                                    <NumInput label={t('inGameUi.height')} value={cfg.height} fallback={4} min={1} max={100} onChange={v => updateBtn({ height: v })} />
                                                </div>
                                                <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)]">
                                                    <input type="checkbox" checked={!!cfg.fitToContent} onChange={e => updateBtn({ fitToContent: e.target.checked })} className="cursor-pointer" />
                                                    {t('inGameUi.fitToContent')}
                                                </label>
                                            </>
                                        )}
                                        {/* Custom action: overrides the button's built-in behavior. None = keep default. */}
                                        <div className="pt-1 border-t border-[var(--border-subtle)]">
                                            <span className="text-[11px] font-semibold text-sky-400">{t('inGameUi.customAction')}</span>
                                            <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('inGameUi.customActionHint')}</p>
                                            <ActionEditor
                                                action={cfg.action ?? { type: UIActionType.None } as VNUIAction}
                                                onActionChange={(a) => updateBtn({ action: a.type === UIActionType.None ? undefined : a })}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* ── Author-defined custom buttons (run their own action) ── */}
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1 pt-3">{t('inGameUi.customButtonsHeader')}</h4>
                <p className="text-[10px] text-[var(--text-muted)]">{t('inGameUi.customButtonsHint')}</p>
                <div className="space-y-2">
                    {(ui.quickMenuCustomButtons || []).map(cb => {
                        const updateCustom = (patch: Partial<QuickMenuCustomButton>) =>
                            onUpdate({ quickMenuCustomButtons: (ui.quickMenuCustomButtons || []).map(c => c.id === cb.id ? { ...c, ...patch } : c) });
                        const shown = cb.show !== false;
                        return (
                            <div key={cb.id} className="border border-[var(--border-subtle)] rounded p-2 space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" checked={shown} onChange={e => updateCustom({ show: e.target.checked })} className="cursor-pointer" title={t('inGameUi.visible')} />
                                    <input className={inputCls} value={cb.label} placeholder={t('inGameUi.buttonLabel')} onChange={e => updateCustom({ label: e.target.value })} />
                                    <button className="text-[var(--accent-coral)] hover:opacity-80 px-1 text-sm" title={t('inGameUi.removeButton')}
                                        onClick={() => onUpdate({ quickMenuCustomButtons: (ui.quickMenuCustomButtons || []).filter(c => c.id !== cb.id) })}>✕</button>
                                </div>
                                {shown && (
                                    <>
                                        <Field label={t('inGameUi.image')}>
                                            <select className={inputCls} value={cb.image?.id || ''}
                                                onChange={e => { const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null; updateCustom({ image: asset ? { type: 'image', id: asset.id } : null }); }}>
                                                <option value="">{t('inGameUi.noneDefaultStyle')}</option>
                                                {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                                            </select>
                                        </Field>
                                        <Field label={t('inGameUi.hoverImage')}>
                                            <select className={inputCls} value={cb.hoverImage?.id || ''}
                                                onChange={e => { const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null; updateCustom({ hoverImage: asset ? { type: 'image', id: asset.id } : null }); }}>
                                                <option value="">{t('inGameUi.none')}</option>
                                                {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                                            </select>
                                        </Field>
                                        {ui.quickMenuIndependentLayout && (
                                            <>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <NumInput label={t('inGameUi.width')} value={cb.width} fallback={8} min={1} max={100} onChange={v => updateCustom({ width: v })} />
                                                    <NumInput label={t('inGameUi.height')} value={cb.height} fallback={4} min={1} max={100} onChange={v => updateCustom({ height: v })} />
                                                </div>
                                                <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)]">
                                                    <input type="checkbox" checked={!!cb.fitToContent} onChange={e => updateCustom({ fitToContent: e.target.checked })} className="cursor-pointer" />
                                                    {t('inGameUi.fitToContent')}
                                                </label>
                                            </>
                                        )}
                                        <div className="pt-1 border-t border-[var(--border-subtle)]">
                                            <span className="text-[11px] font-semibold text-sky-400">{t('inGameUi.buttonAction')}</span>
                                            <ActionEditor
                                                action={cb.action ?? { type: UIActionType.None } as VNUIAction}
                                                onActionChange={(a) => updateCustom({ action: a.type === UIActionType.None ? undefined : a })}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                    <button
                        className="w-full text-xs py-1.5 rounded border border-dashed border-[var(--accent-purple)] text-[var(--accent-purple)] hover:bg-[var(--bg-secondary)]"
                        onClick={() => onUpdate({ quickMenuCustomButtons: [...(ui.quickMenuCustomButtons || []), { id: ('qmc-' + Math.random().toString(36).slice(2, 9)) as VNID, label: 'New Button', action: { type: UIActionType.None } as VNUIAction }] })}
                    >+ {t('inGameUi.addCustomButton')}</button>
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
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1">{t('inGameUi.confirmationDialogs')}</h4>
                <p className="text-xs text-[var(--text-secondary)]">
                    Shown when the player quits to title or starts a new game while a game is in progress.
                </p>

                {/* Quit dialog text */}
                <div className="border border-[var(--border-subtle)] rounded p-2 space-y-2">
                    <span className="text-xs font-semibold text-sky-400">{t('inGameUi.quitConfirmation')}</span>
                    <Field label={t('inGameUi.title')}>
                        <input className={inputCls} value={cd.quitTitle ?? ''} placeholder={t('inGameUi.phQuitGame')}
                            onChange={e => updateCD({ quitTitle: e.target.value || undefined })} />
                    </Field>
                    <Field label={t('inGameUi.message')}>
                        <textarea className={inputCls} rows={2} value={cd.quitMessage ?? ''} placeholder={t('inGameUi.phQuitMsg')}
                            onChange={e => updateCD({ quitMessage: e.target.value || undefined })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label={t('inGameUi.confirmButton')}>
                            <input className={inputCls} value={cd.quitConfirmLabel ?? ''} placeholder={t('inGameUi.phQuit')}
                                onChange={e => updateCD({ quitConfirmLabel: e.target.value || undefined })} />
                        </Field>
                        <Field label={t('inGameUi.cancelButton')}>
                            <input className={inputCls} value={cd.quitCancelLabel ?? ''} placeholder={t('inGameUi.phCancel')}
                                onChange={e => updateCD({ quitCancelLabel: e.target.value || undefined })} />
                        </Field>
                    </div>
                </div>

                {/* New Game dialog text */}
                <div className="border border-[var(--border-subtle)] rounded p-2 space-y-2">
                    <span className="text-xs font-semibold text-sky-400">{t('inGameUi.newGameConfirmation')}</span>
                    <Field label={t('inGameUi.title')}>
                        <input className={inputCls} value={cd.newGameTitle ?? ''} placeholder={t('inGameUi.phStartNewGame')}
                            onChange={e => updateCD({ newGameTitle: e.target.value || undefined })} />
                    </Field>
                    <Field label={t('inGameUi.message')}>
                        <textarea className={inputCls} rows={2} value={cd.newGameMessage ?? ''} placeholder={t('inGameUi.phNewGameMsg')}
                            onChange={e => updateCD({ newGameMessage: e.target.value || undefined })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label={t('inGameUi.confirmButton')}>
                            <input className={inputCls} value={cd.newGameConfirmLabel ?? ''} placeholder={t('inGameUi.phNewGame')}
                                onChange={e => updateCD({ newGameConfirmLabel: e.target.value || undefined })} />
                        </Field>
                        <Field label={t('inGameUi.cancelButton')}>
                            <input className={inputCls} value={cd.newGameCancelLabel ?? ''} placeholder={t('inGameUi.phCancel')}
                                onChange={e => updateCD({ newGameCancelLabel: e.target.value || undefined })} />
                        </Field>
                    </div>
                </div>

                {/* Visual styling */}
                <div className="border border-[var(--border-subtle)] rounded p-2 space-y-2">
                    <span className="text-xs font-semibold text-sky-400">{t('inGameUi.dialogBoxAppearance')}</span>
                    <div className="grid grid-cols-2 gap-2">
                        <ColorField label={t('inGameUi.colorBackground')} value={cd.backgroundColor ?? '#0f172a'} onChange={v => updateCD({ backgroundColor: v })} />
                        <OpacityField label={t('inGameUi.opacity')} value={cd.backgroundOpacity ?? 92} onChange={v => updateCD({ backgroundOpacity: v })} />
                    </div>
                    <NumInput label={t('inGameUi.borderRadius')} value={cd.borderRadius} fallback={12} min={0} onChange={v => updateCD({ borderRadius: v })} />
                    <NumInput label={t('inGameUi.dialogWidth')} value={cd.dialogWidth} fallback={0} min={0} max={1200} onChange={v => updateCD({ dialogWidth: v || undefined })} />
                    <NumInput label={t('inGameUi.innerPadding')} value={cd.dialogPadding} fallback={32} min={0} max={100} onChange={v => updateCD({ dialogPadding: v })} />
                    <ColorField label={t('inGameUi.overlayColor')} value={cd.overlayColor ?? '#000000'} onChange={v => updateCD({ overlayColor: `${v}bf` })} />

                    <Field label={t('inGameUi.backgroundImage')}>
                        <select className={inputCls} value={cd.backgroundImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCD({ backgroundImage: null }); return; }
                                updateCD({ backgroundImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">{t('inGameUi.none')}</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    {cd.backgroundImage && (
                        <Field label={t('inGameUi.imageSizing')}>
                            <select className={inputCls} value={cd.backgroundSizeMode ?? 'stretch'}
                                onChange={e => updateCD({ backgroundSizeMode: e.target.value as any })}>
                                <option value="stretch">{t('inGameUi.sizeStretch')}</option>
                                <option value="contain">{t('inGameUi.sizeContain')}</option>
                                <option value="cover">{t('inGameUi.sizeCover')}</option>
                                <option value="nine-slice">{t('inGameUi.sizeNineSlice')}</option>
                            </select>
                        </Field>
                    )}
                    {cd.backgroundImage && cd.backgroundSizeMode === 'nine-slice' && (
                        <NumInput label={t('inGameUi.sliceSize')} value={cd.backgroundSlice} fallback={20} min={1} onChange={v => updateCD({ backgroundSlice: v })} />
                    )}

                    <Field label={t('inGameUi.borderImage')}>
                        <select className={inputCls} value={cd.borderImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCD({ borderImage: null }); return; }
                                updateCD({ borderImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">{t('inGameUi.none')}</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    {cd.borderImage && (
                        <NumInput label={t('inGameUi.borderPadding')} value={cd.borderPadding} fallback={12} min={0} onChange={v => updateCD({ borderPadding: v })} />
                    )}
                </div>

                {/* Button styling */}
                <div className="border border-[var(--border-subtle)] rounded p-2 space-y-2">
                    <span className="text-xs font-semibold text-sky-400">{t('inGameUi.buttonStyling')}</span>
                    <div className="grid grid-cols-2 gap-2">
                        <ColorField label={t('inGameUi.confirmBtnColor')} value={cd.confirmButtonColor ?? '#ec4899'} onChange={v => updateCD({ confirmButtonColor: v })} />
                        <ColorField label={t('inGameUi.cancelBtnColor')} value={cd.cancelButtonColor ?? '#1e293b'} onChange={v => updateCD({ cancelButtonColor: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <ColorField label={t('inGameUi.confirmHoverColor')} value={cd.confirmHoverColor ?? ''} onChange={v => updateCD({ confirmHoverColor: v || undefined })} />
                        <ColorField label={t('inGameUi.cancelHoverColor')} value={cd.cancelHoverColor ?? '#334155'} onChange={v => updateCD({ cancelHoverColor: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <NumInput label={t('inGameUi.buttonPadding')} value={cd.buttonPadding} fallback={8} min={0} max={60} onChange={v => updateCD({ buttonPadding: v })} />
                        <NumInput label={t('inGameUi.buttonRadius')} value={cd.buttonBorderRadius} fallback={8} min={0} onChange={v => updateCD({ buttonBorderRadius: v })} />
                    </div>

                    <Field label={t('inGameUi.confirmButtonImage')}>
                        <select className={inputCls} value={cd.confirmButtonImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCD({ confirmButtonImage: null }); return; }
                                updateCD({ confirmButtonImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">{t('inGameUi.noneSolidColor')}</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label={t('inGameUi.cancelButtonImage')}>
                        <select className={inputCls} value={cd.cancelButtonImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCD({ cancelButtonImage: null }); return; }
                                updateCD({ cancelButtonImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">{t('inGameUi.noneSolidColor')}</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label={t('inGameUi.confirmHoverImage')}>
                        <select className={inputCls} value={cd.confirmHoverImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCD({ confirmHoverImage: null }); return; }
                                updateCD({ confirmHoverImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">{t('inGameUi.none')}</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label={t('inGameUi.cancelHoverImage')}>
                        <select className={inputCls} value={cd.cancelHoverImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCD({ cancelHoverImage: null }); return; }
                                updateCD({ cancelHoverImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">{t('inGameUi.none')}</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    {(cd.confirmButtonImage || cd.cancelButtonImage) && (
                        <>
                            <Field label={t('inGameUi.buttonImageSizing')}>
                                <select className={inputCls} value={cd.buttonSizeMode ?? 'stretch'}
                                    onChange={e => updateCD({ buttonSizeMode: e.target.value as any })}>
                                    <option value="stretch">{t('inGameUi.sizeStretch')}</option>
                                    <option value="contain">{t('inGameUi.sizeContain')}</option>
                                    <option value="cover">{t('inGameUi.sizeCover')}</option>
                                    <option value="nine-slice">{t('inGameUi.sizeNineSlice')}</option>
                                </select>
                            </Field>
                            {cd.buttonSizeMode === 'nine-slice' && (
                                <NumInput label={t('inGameUi.buttonSlice')} value={cd.buttonSlice} fallback={10} min={1} onChange={v => updateCD({ buttonSlice: v })} />
                            )}
                        </>
                    )}
                </div>

                {/* Font editors */}
                <FontEditor
                    label={t('inGameUi.titleFont')}
                    font={cd.titleFont ?? defaultFontSettings}
                    onFontChange={(prop, value) => updateCD({ titleFont: { ...(cd.titleFont ?? defaultFontSettings), [prop]: value } })}
                    defaultAlign="center"
                />
                <FontEditor
                    label={t('inGameUi.messageFont')}
                    font={cd.messageFont ?? defaultFontSettings}
                    onFontChange={(prop, value) => updateCD({ messageFont: { ...(cd.messageFont ?? defaultFontSettings), [prop]: value } })}
                    defaultAlign="center"
                />
                <FontEditor
                    label={t('inGameUi.buttonFont')}
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
    const { t } = useTranslation('ui');
    const { dispatch } = useProject();
    const [selectedElement, setSelectedElement] = useState<InGameUIElement | null>('dialogueBox');
    const [selectedThemeId, setSelectedThemeId] = useState<VNID | null>(null);
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

    const handleDragQuickMenuButton = useCallback((key: string, isCustom: boolean, u: { x: number; y: number; width: number; height: number }) => {
        if (isCustom) {
            const customs = ui.quickMenuCustomButtons || [];
            updateUI({ quickMenuCustomButtons: customs.map(c => c.id === key ? { ...c, x: u.x, y: u.y, width: u.width, height: u.height } : c) });
        } else {
            const prev = ui.quickMenuButtons || {};
            updateUI({ quickMenuButtons: { ...prev, [key as QuickMenuButtonKey]: { ...prev[key as QuickMenuButtonKey], x: u.x, y: u.y, width: u.width, height: u.height } } });
        }
    }, [ui.quickMenuButtons, ui.quickMenuCustomButtons, updateUI]);

    const quickMenuButtonRects = useMemo(() => getQuickMenuButtonRects(ui, gameW, gameH), [ui, gameW, gameH]);
    const quickMenuIndependent = !!ui.quickMenuIndependentLayout && selectedElement === 'quickMenu' && ui.quickMenuPosition !== 'hidden';

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
        quickMenu:     { rect: quickMenuRect,  handler: handleDragQuickMenu, preview: <QuickMenuPreview ui={ui} project={project} /> },
    }), [dialogueRect, nameboxRect, choiceRect, inputRect, quickMenuRect, ui, project,
         handleDragDialogue, handleDragNamebox, handleDragChoice, handleDragInput, handleDragQuickMenu]);

    const activeEl = selectedElement && !isHidden(selectedElement) ? elementRects[selectedElement] ?? null : null;

    // Live preview for the Textbox Themes section: the global dialogue UI with the selected theme's
    // DEFINED fields applied on top (blank theme fields keep the project default).
    const themedUi = useMemo<VNProjectUI>(() => {
        if (selectedElement !== 'textboxThemes' || !selectedThemeId) return ui;
        const th = project.textboxThemes?.[selectedThemeId];
        if (!th) return ui;
        const merged = { ...ui } as Record<string, unknown>;
        Object.entries(th).forEach(([k, v]) => { if (k !== 'id' && k !== 'name' && v !== undefined) merged[k] = v; });
        return merged as unknown as VNProjectUI;
    }, [selectedElement, selectedThemeId, project.textboxThemes, ui]);

    return (
        <div className="flex h-full">
            {/* Element list sidebar */}
            <div className="bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] flex flex-col" style={{ width: 'var(--sidebar-width)' }}>
                <div className="p-4 border-b border-[var(--border-subtle)]">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <ChatBubbleIcon className="w-5 h-5" />
                        {t('inGameUi.header')}
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{t('inGameUi.selectHintPre')}<kbd className="px-1 bg-[var(--bg-tertiary)] rounded text-[10px]">Shift</kbd>{t('inGameUi.selectHintPost')}</p>
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
                                <span className="block text-sm font-medium truncate">{el.id === 'textboxThemes' ? el.label : t('inGameUi.'+el.id)}</span>
                                <span className="block text-[10px] text-[var(--text-muted)] truncate">{el.id === 'textboxThemes' ? el.description : t('inGameUi.'+el.id+'Desc')}</span>
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

                    {/* When editing the Quick Menu, show the dialogue box (non-interactive, dimmed)
                        for context so the author can see how the buttons sit relative to it. */}
                    {selectedElement === 'quickMenu' && ui.quickMenuPosition !== 'hidden' && (
                        <div
                            className="absolute pointer-events-none"
                            style={{
                                left: `${dialogueRect.x}%`, top: `${dialogueRect.y}%`,
                                width: `${dialogueRect.width}%`, height: `${dialogueRect.height}%`,
                                opacity: 0.5, zIndex: 0,
                            }}
                        >
                            <DialogueBoxPreview ui={ui} project={project} />
                        </div>
                    )}

                    {/* Independent layout: one draggable per quick-menu button. */}
                    {quickMenuIndependent && quickMenuButtonRects.map(b => {
                        const lbl = b.isCustom ? b.label : t('inGameUi.qmLabels.'+b.key);
                        return (
                        <ResizableDraggable
                            key={b.key}
                            x={b.rect.x} y={b.rect.y}
                            width={b.rect.width} height={b.rect.height}
                            anchorX={0} anchorY={0}
                            parentSize={stageSize}
                            isSelected={true}
                            onSelect={e => { e.stopPropagation(); }}
                            onUpdate={u => handleDragQuickMenuButton(b.key, b.isCustom, u)}
                            snapGrid={1}
                            label={lbl}
                        >
                            <QuickMenuButtonPreview ui={ui} project={project} label={lbl}
                                btnKey={b.isCustom ? undefined : (b.key as QuickMenuButtonKey)}
                                cfg={b.isCustom ? b.cfg : undefined} />
                        </ResizableDraggable>
                        );
                    })}

                    {/* Only render the currently selected element (single grouped draggable).
                        Skipped for the Quick Menu when independent per-button layout is active. */}
                    {activeEl && !quickMenuIndependent && (
                        <ResizableDraggable
                            x={activeEl.rect.x} y={activeEl.rect.y}
                            width={activeEl.rect.width} height={activeEl.rect.height}
                            anchorX={0} anchorY={0}
                            parentSize={stageSize}
                            isSelected={true}
                            onSelect={e => { e.stopPropagation(); }}
                            onUpdate={activeEl.handler}
                            snapGrid={1}
                            label={selectedElement ? t('inGameUi.'+selectedElement) : undefined}
                        >
                            {activeEl.preview}
                        </ResizableDraggable>
                    )}

                    {/* Confirm Dialogs preview – full-canvas overlay, not draggable */}
                    {selectedElement === 'confirmDialogs' && (
                        <ConfirmDialogPreview ui={ui} project={project} />
                    )}

                    {/* Textbox theme preview – shows the selected theme's box + nameplate (not draggable). */}
                    {selectedElement === 'textboxThemes' && (
                        selectedThemeId ? (
                            <>
                                <div className="absolute pointer-events-none" style={{ left: `${nameboxRect.x}%`, top: `${nameboxRect.y}%`, width: `${nameboxRect.width}%`, height: `${nameboxRect.height}%` }}>
                                    <NameBoxPreview ui={themedUi} project={project} />
                                </div>
                                <div className="absolute pointer-events-none" style={{ left: `${dialogueRect.x}%`, top: `${dialogueRect.y}%`, width: `${dialogueRect.width}%`, height: `${dialogueRect.height}%` }}>
                                    <DialogueBoxPreview ui={themedUi} project={project} />
                                </div>
                            </>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <p className="text-sm text-white/30">Select or create a theme in the panel →</p>
                            </div>
                        )
                    )}

                    {!activeEl && selectedElement !== 'confirmDialogs' && selectedElement !== 'textboxThemes' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <p className="text-sm text-white/30">{t('inGameUi.selectFromSidebar')}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Properties panel (right side) */}
            <div className="w-72 flex-shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-primary)] overflow-y-auto">
                {selectedElement === 'textboxThemes' ? (
                    <TextboxThemeManager project={project} selectedThemeId={selectedThemeId} onSelect={setSelectedThemeId} />
                ) : selectedElement ? (
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
