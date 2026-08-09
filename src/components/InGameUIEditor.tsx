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
import { RangeInput, ColorInput } from './ui/Form';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { VNProject } from '../types/project';
import { VNProjectUI, VNFontSettings, VNConfirmDialogSettings, VNConfirmVariantStyle, QuickMenuButtonKey, QuickMenuButtonConfig, QuickMenuCustomButton, PhoneButtonConfig, PhoneContact } from '../features/ui/types';
import { PHONE_GLYPHS, PHONE_ICON_KEYS } from '../features/ui/phoneIcons';
import { PHONE_APP_CHOICES } from './live-preview/phone/phoneApps';
import { PhoneCallConversationEditor } from './inspector/CommandGroupFields';
import ConversationStudio from './ConversationStudio';
import { VNID } from '../types';
import { useProject } from '../contexts/ProjectContext';
import { isManagerWindow, isMultiWindowSupported, openManagerWindow, syncInGameState, onInGameStateUpdate, type InGameUIState } from '../utils/windowManager';
import FontEditor, { defaultFontSettings } from './ui/FontEditor';
import { useTranslation } from 'react-i18next';
import { fontSettingsToStyle, extractTextGradientStyle } from '../utils/styleUtils';
import { GradientText } from './ui/GradientText';
import ResizableDraggable from './menu-editor/ResizableDraggable';
import CanvasSnapGuides from './menu-editor/CanvasSnapGuides';
import CanvasEdgeFrame from './ui/CanvasEdgeFrame';
import { SnapRect, SnapGuide } from '../utils/canvasSnap';
import TextboxThemeManager from './ui/TextboxThemeManager';
import SceneTransitionManager, { SceneTransitionCanvasPreview } from './ui/SceneTransitionManager';
import DialogueReactiveStatesEditor from './ui/DialogueReactiveStatesEditor';
import QuickMenuReactiveStatesEditor from './ui/QuickMenuReactiveStatesEditor';
import ActionEditor from './menu-editor/ActionEditor';
import ConditionsEditor from './ui/ConditionsEditor';
import TrimmedVideo from './ui/TrimmedVideo';
import VideoTrimFields from './ui/VideoTrimFields';
import { resolveVideoTrim } from '../utils/videoTrim';
import { resolveFieldUrl } from '../utils/assetStore';
import { useTestPlayActive } from '../utils/testPlayState';
import { PhonePortraitPicker } from './inspector/CommandGroupFields';
import { UIActionType, VNUIAction } from '../types/shared';
import {
    ChatBubbleIcon, BookmarkSquareIcon, SparklesIcon, PencilIcon,
    ChevronDownIcon, QuestionMarkIcon, TrashIcon, PlusIcon,
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
    | 'phone'
    | 'textboxThemes'
    | 'sceneTransitions'
    | 'mousePointer';

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
    { id: 'phone', label: 'Phone', icon: <ChatBubbleIcon className="w-4 h-4" />, description: 'In-game cellphone & messaging' },
    { id: 'textboxThemes', label: 'Textbox Themes', icon: <BookmarkSquareIcon className="w-4 h-4" />, description: 'Reusable per-character dialogue box designs' },
    { id: 'sceneTransitions', label: 'Scene Transitions', icon: <SparklesIcon className="w-4 h-4" />, description: 'Your own scene-change animations (closing + opening)' },
    { id: 'mousePointer', label: 'Mouse Pointer', icon: <SparklesIcon className="w-4 h-4" />, description: 'Custom cursors for the whole game' },
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

/** Resolve a chrome-background UIAsset ref to its media: image url (CSS bg) OR video url (real <video>),
 *  detecting video by the actual asset (across videos/images/backgrounds). URLs go through
 *  resolveFieldUrl so file-backed refs load. Trim = per-use (on the ref) → asset default. */
function chromeBgMedia(ref: any, project: VNProject): { imageUrl: string | null; videoUrl: string | null; isVideo: boolean; trimStart?: number; trimEnd?: number } {
    const id = ref?.id;
    if (!id) return { imageUrl: null, videoUrl: null, isVideo: false };
    const asset: any = (project.videos as any)?.[id] || (project.images as any)?.[id] || (project.backgrounds as any)?.[id];
    const isVideo = ref.type === 'video' || !!(asset && (asset.isVideo || asset.videoUrl));
    const t = resolveVideoTrim(ref, asset);
    return {
        imageUrl: !isVideo ? (resolveFieldUrl(project.id, asset?.imageUrl) || null) : null,
        videoUrl: isVideo ? (resolveFieldUrl(project.id, asset?.videoUrl) || null) : null,
        isVideo,
        trimStart: t.start,
        trimEnd: t.end,
    };
}

/** Bumps when test-play closes (fires 'flourish:playended') so a preview <video> behind the
 *  overlay — which the browser evicts and won't auto-resume — remounts and replays on return. */
function useVideoReloadNonce(): number {
    const [n, setN] = React.useState(0);
    React.useEffect(() => {
        const onEnded = () => setN(x => x + 1);
        window.addEventListener('flourish:playended', onEnded);
        return () => window.removeEventListener('flourish:playended', onEnded);
    }, []);
    return n;
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

function getPhoneRect(ui: VNProjectUI, _gameW = 1920, _gameH = 1080) {
    const scale = (ui.phoneScale ?? 100) / 100;
    const w = (ui.phoneWidth ?? 26) * scale;
    const h = (ui.phoneHeight ?? 82) * scale;
    const pos = ui.phonePosition || 'bottom-right';
    const x = ui.phoneX ?? (pos === 'center' ? (100 - w) / 2 : pos.includes('right') ? (100 - w - 2) : 2);
    const y = ui.phoneY ?? (pos === 'center' ? (100 - h) / 2 : pos.includes('top') ? 2 : (100 - h - 2));
    return { x, y, width: w, height: h };
}

/** Canvas-% rects for each visible free-layout phone app button (phone rect + button%). */
function getPhoneButtonRects(ui: VNProjectUI, gameW = 1920, gameH = 1080) {
    const phone = getPhoneRect(ui, gameW, gameH);
    return (ui.phoneButtons || []).filter(b => b.show !== false).map(b => ({
        id: b.id,
        label: b.label,
        rect: {
            x: phone.x + ((b.x ?? 8) / 100) * phone.width,
            y: phone.y + ((b.y ?? 12) / 100) * phone.height,
            width: ((b.width ?? 22) / 100) * phone.width,
            height: ((b.height ?? 16) / 100) * phone.height,
        },
    }));
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
    const vReload = useVideoReloadNonce();
    const testPlaying = useTestPlayActive();
    const bgColor = hexToRgba(ui.dialogueBoxColor ?? '#0f172a', ui.dialogueBoxOpacity ?? 90);
    const br = ui.dialogueBoxBorderRadius ?? 8;
    const padding = ui.dialogueBoxPadding ?? 20;
    const textPadTop = ui.dialogueTextPaddingTop ?? 0;
    const textPadBot = ui.dialogueTextPaddingBottom ?? 0;
    const textPadLeft = ui.dialogueTextPaddingLeft ?? 0;
    const textPadRight = ui.dialogueTextPaddingRight ?? 0;
    const sizeMode = ui.dialogueBoxSizeMode ?? 'stretch';
    const slice = ui.dialogueBoxSlice ?? 30;

    // Resolve images / video
    const bgMedia = chromeBgMedia(ui.dialogueBoxImage, project);
    const bgUrl = bgMedia.imageUrl;
    const bgVideoUrl = bgMedia.videoUrl;

    // Resolve border image
    const borderImgId = ui.dialogueBoxBorderImage?.id;
    const borderUrl = borderImgId
        ? ((project.images as any)[borderImgId]?.imageUrl || (project.backgrounds as any)[borderImgId]?.imageUrl)
        : null;
    const borderPadding = ui.dialogueBorderPadding ?? 12;

    const hasCustomImage = bgUrl || bgVideoUrl || borderUrl;

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
                {!testPlaying && bgVideoUrl && <TrimmedVideo key={`dlg-${bgVideoUrl}-${vReload}`} ref={(el) => { if (el) el.play().catch(() => {}); }} src={bgVideoUrl} autoPlay loop muted playsInline trimStart={bgMedia.trimStart} trimEnd={bgMedia.trimEnd} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 0 }} />}
                <div style={{
                    position: 'relative', zIndex: 1,
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
    const vReload = useVideoReloadNonce();
    const testPlaying = useTestPlayActive();
    const bgColor = hexToRgba(ui.choiceButtonColor ?? '#1e293b', ui.choiceButtonOpacity ?? 90);
    const br = ui.choiceButtonBorderRadius ?? 8;
    const pad = ui.choiceButtonPadding ?? 16;
    const slice = ui.choiceButtonSlice ?? 15;
    const sizeMode = ui.choiceButtonSizeMode ?? 'stretch';

    const bgMedia = chromeBgMedia(ui.choiceButtonImage, project);
    const bgUrl = bgMedia.imageUrl;
    const bgVideoUrl = bgMedia.videoUrl;

    const borderImgId = (ui as any).choiceButtonBorderImage?.id;
    const borderUrl = borderImgId
        ? ((project.images as any)[borderImgId]?.imageUrl || (project.backgrounds as any)[borderImgId]?.imageUrl)
        : null;
    const borderPadding = (ui as any).choiceBorderPadding ?? 8;
    const hasCustomImage = bgUrl || bgVideoUrl || borderUrl;

    // Mirrors the engine's renderButton + vertical layout exactly (full-width buttons in the
    // configured rect, horizontal padding doubled, fixed height when set, frosted default look,
    // full-opacity text, 12px gaps) — the preview and test play must be the same picture.
    return (
        <div className="w-full h-full flex flex-col items-center justify-center" style={{ gap: 'calc(var(--font-scale,1) * 12px)' }}>
            {['A', 'B', 'C'].map(label => (
                <div key={label} className="w-full"
                     style={borderUrl
                         ? { ...buildImageBackgroundStyle(borderUrl, sizeMode, slice), padding: `calc(var(--font-scale,1) * ${borderPadding}px)`, borderRadius: `calc(var(--font-scale,1) * ${br}px)` }
                         : {}}>
                    <div className="w-full flex flex-col items-center justify-center" style={{
                        position: 'relative', overflow: 'hidden',
                        textAlign: (ui.choiceTextFont?.align || 'center') as any,
                        borderRadius: `calc(var(--font-scale,1) * ${br}px)`,
                        padding: `calc(var(--font-scale,1) * ${pad}px) calc(var(--font-scale,1) * ${pad * 2}px)`,
                        ...(ui.choiceButtonHeight ? { height: `calc(var(--font-scale,1) * ${ui.choiceButtonHeight}px)` } : {}),
                        ...(bgUrl
                            ? { ...buildImageBackgroundStyle(bgUrl, sizeMode, slice), backgroundColor: bgColor }
                            : !hasCustomImage
                                ? {
                                    backgroundColor: bgColor,
                                    border: '1px solid rgba(148,163,184,0.3)',
                                    boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
                                    backdropFilter: 'blur(6px)',
                                    WebkitBackdropFilter: 'blur(6px)',
                                  }
                                : {}),
                    }}>
                        {!testPlaying && bgVideoUrl && <TrimmedVideo key={`cho-${label}-${bgVideoUrl}-${vReload}`} ref={(el) => { if (el) el.play().catch(() => {}); }} src={bgVideoUrl} autoPlay loop muted playsInline trimStart={bgMedia.trimStart} trimEnd={bgMedia.trimEnd} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 0 }} />}
                        <span style={{ ...fontToStyle(ui.choiceTextFont), position: 'relative', zIndex: 1 }}>
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
    const vReload = useVideoReloadNonce();
    const testPlaying = useTestPlayActive();
    const bgColor = hexToRgba(ui.inputBoxColor ?? '#0f172a', ui.inputBoxOpacity ?? 92);
    const br = ui.inputBoxBorderRadius ?? 8;
    const pad = ui.inputBoxPadding ?? 24;
    const slice = ui.inputBoxSlice ?? 20;
    const sizeMode = ui.inputBoxSizeMode ?? 'stretch';

    const bgMedia = chromeBgMedia(ui.inputBoxImage, project);
    const bgUrl = bgMedia.imageUrl;
    const bgVideoUrl = bgMedia.videoUrl;

    const borderImgId = (ui as any).inputBoxBorderImage?.id;
    const borderUrl = borderImgId
        ? ((project.images as any)[borderImgId]?.imageUrl || (project.backgrounds as any)[borderImgId]?.imageUrl)
        : null;
    const borderPadding = (ui as any).inputBorderPadding ?? 8;
    const hasCustomImage = bgUrl || bgVideoUrl || borderUrl;

    return (
        <div className="w-full h-full flex flex-col items-center justify-center">
            <div className="w-full"
                 style={borderUrl
                     ? { ...buildImageBackgroundStyle(borderUrl, sizeMode, slice), padding: `calc(var(--font-scale,1) * ${borderPadding}px)`, borderRadius: `calc(var(--font-scale,1) * ${br}px)` }
                     : {}}>
                <div className="w-full flex flex-col items-center justify-center gap-[6%]" style={{
                    position: 'relative', overflow: 'hidden',
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
                    {!testPlaying && bgVideoUrl && <TrimmedVideo key={`inp-${bgVideoUrl}-${vReload}`} ref={(el) => { if (el) el.play().catch(() => {}); }} src={bgVideoUrl} autoPlay loop muted playsInline trimStart={bgMedia.trimStart} trimEnd={bgMedia.trimEnd} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 0 }} />}
                    <p style={{ ...fontToStyle(ui.inputPromptFont), position: 'relative', zIndex: 1 }} className="opacity-90">
                        <GradientText style={extractTextGradientStyle(ui.inputPromptFont)}>{t('inGameUi.whatIsYourName')}</GradientText>
                    </p>
                    <div className="w-[80%] bg-white/10 rounded px-2 py-1" style={{ ...fontToStyle(ui.inputFieldFont), position: 'relative', zIndex: 1 }}>
                        <span className="opacity-40">{t('inGameUi.typeHere')}</span>
                    </div>
                    <div className="px-4 py-1" style={{
                        position: 'relative', zIndex: 1,
                        borderRadius: ui.inputSubmitBorderRadius ?? 6,
                        ...((() => {
                            const subUrl = ui.inputSubmitImage?.id
                                ? (project.images?.[ui.inputSubmitImage.id]?.imageUrl || project.backgrounds?.[ui.inputSubmitImage.id]?.imageUrl)
                                : null;
                            return subUrl ? buildImageBackgroundStyle(subUrl, 'stretch') : { backgroundColor: ui.inputSubmitColor ?? '#334155' };
                        })()),
                    }}>
                        <span style={fontToStyle(ui.inputSubmitFont)}>
                            <GradientText style={extractTextGradientStyle(ui.inputSubmitFont)}>{ui.inputSubmitLabel || t('inGameUi.submit')}</GradientText>
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

/** The three confirmation variants (Quit / New Game / Erase Save) + their default text. */
type ConfirmVariant = 'quit' | 'newGame' | 'eraseSave';
const CONFIRM_VARIANTS: ConfirmVariant[] = ['quit', 'newGame', 'eraseSave'];
const CONFIRM_TEXT_DEFAULTS: Record<ConfirmVariant, { title: string; message: string; confirm: string; cancel: string }> = {
    quit: { title: 'Quit Game', message: 'Are you sure you want to quit?', confirm: 'Quit', cancel: 'Cancel' },
    newGame: { title: 'Start New Game', message: 'Any unsaved progress will be lost. Are you sure?', confirm: 'New Game', cancel: 'Cancel' },
    eraseSave: { title: 'Erase Save', message: 'Erase this save? This cannot be undone.', confirm: 'Erase', cancel: 'Cancel' },
};
const confirmVariantLabel = (v: ConfirmVariant, t: any): string =>
    v === 'quit' ? t('inGameUi.quitConfirmation') : v === 'newGame' ? t('inGameUi.newGameConfirmation') : t('inGameUi.eraseSaveConfirmation', 'Erase Save');

/** Live canvas preview of the themed in-game phone (static sample). Mirrors the runtime PhonePanel.
 *  Rendered inside a ResizableDraggable (which owns position + size + scale), so it just fills its
 *  parent — every change to project.ui.phone* re-renders it live. */
const PhonePreview: React.FC<{ ui: VNProjectUI; project: VNProject; hideFreeButtons?: boolean; view?: 'chat' | 'contacts' }> = ({ ui, project, hideFreeButtons, view }) => {
    const { t } = useTranslation('ui');
    const allAssets = { ...project.images, ...project.backgrounds } as Record<string, any>;
    const url = (a?: { id: string } | null) => a?.id ? (allAssets[a.id]?.imageUrl || null) : null;
    const shellImg = url(ui.phoneShellImage as any);
    const wallpaperImg = url(ui.phoneWallpaperImage as any);
    const contactAvatarEm = ui.phoneContactAvatarSize ?? 2.4;
    const chatAvatarEm = ui.phoneChatAvatarSize ?? 2.2;
    const sample = (Object.values(project.characters) as any[])[0];
    const buttons = (ui.phoneButtons || []).filter(b => b.show !== false);
    const bezel = ui.phoneBezelWidth ?? 8;
    const casingRadius = ui.phoneBorderRadius ?? 28;
    const screenRadius = Math.max(casingRadius - bezel, 6);
    const showHome = ui.phoneShowHomeButton !== false;
    // Chat bubble font size honors the configured phone font size (scaled to the preview), so size
    // changes reflect on the canvas instead of being pinned to a hardcoded value.
    const chatFontPx = ui.phoneFont?.fontSize ?? 12;
    const chatFontSize = `calc(var(--font-scale,1) * ${chatFontPx}px)`;
    const vidUrl = (a?: { id: string } | null) => a?.id ? ((project.videos as any)?.[a.id]?.videoUrl || null) : null;
    const wallpaperVid = (ui.phoneWallpaperImage as any)?.type === 'video' ? vidUrl(ui.phoneWallpaperImage as any) : null;
    const contactsRegion = ui.phoneContactsRegion;
    const contactRows = (ui.phoneContacts || []).length === 0
        ? <div style={{ opacity: 0.5, fontSize: 'calc(var(--font-scale,1) * 11px)', textAlign: 'center', marginTop: 8 }}>{t('hc.noContactsYet', 'No contacts yet')}</div>
        : (ui.phoneContacts || []).map(c => {
            const ch = (project.characters as any)[c.characterId];
            const av = url(c.avatar?.customImage as any) || ch?.baseImageUrl;
            return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 10, background: ui.phoneContactRowColor || ui.phoneHistoryRowColor || 'rgba(255,255,255,0.05)', color: ui.phoneContactTextColor || ui.phoneHistoryTextColor || '#fff' }}>
                    {ui.phoneShowAvatars !== false && av && <img src={av} alt="" style={{ width: `${contactAvatarEm}em`, height: `${contactAvatarEm}em`, borderRadius: '9999px', objectFit: ui.phoneContactAvatarFit || 'cover', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: chatFontSize, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...(ui.phoneContactNameFont ? fontToStyle(ui.phoneContactNameFont) : {}) }}>{c.displayName || ch?.name || 'Unknown'}</div>
                        {c.statusText && <div style={{ fontSize: 'calc(var(--font-scale,1) * 9px)', opacity: 0.7, ...(ui.phoneContactStatusFont ? fontToStyle(ui.phoneContactStatusFont) : {}) }}>{c.statusText}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        {!c.hideCall && <span style={{ padding: '2px 6px', borderRadius: 9999, background: ui.phoneCallAcceptColor || '#22c55e', fontSize: 'calc(var(--font-scale,1) * 9px)' }}>📞</span>}
                        {!c.hideMessage && <span style={{ padding: '2px 6px', borderRadius: 9999, background: ui.phoneOutgoingBubbleColor || '#2f6bff', fontSize: 'calc(var(--font-scale,1) * 9px)' }}>💬</span>}
                    </div>
                </div>
            );
        });
    return (
        <div style={{
            position: 'relative', width: '100%', height: '100%', pointerEvents: 'none',
            borderRadius: `calc(var(--font-scale,1) * ${casingRadius}px)`, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
            padding: `calc(var(--font-scale,1) * ${bezel}px)`,
            background: shellImg ? `url(${shellImg}) center / 100% 100% no-repeat` : (ui.phoneShellColor || '#16181d'),
            opacity: (ui.phoneOpacity ?? 100) / 100, boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
        }}>
        <div style={{
            flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative',
            borderRadius: `calc(var(--font-scale,1) * ${screenRadius}px)`, border: `1px solid ${ui.phoneScreenBorderColor || 'rgba(255,255,255,0.12)'}`,
            background: ui.phoneScreenColor || '#0b0d12', ...(ui.phoneFont ? fontToStyle(ui.phoneFont) : {}),
            ...(wallpaperImg && !wallpaperVid ? { backgroundImage: `url(${wallpaperImg})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
            ...(wallpaperVid ? { isolation: 'isolate' } : {}),
        }}>
            {wallpaperVid && (
                <video autoPlay loop muted playsInline key={wallpaperVid} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: -1, pointerEvents: 'none' }}>
                    <source src={wallpaperVid} />
                </video>
            )}
            {ui.phoneShowStatusBar !== false && (() => {
                const sBars = Math.max(1, Math.min(8, ui.phoneSignalBars ?? 4));
                const sColor = ui.phoneSignalColor || ui.phoneStatusIconColor || '#fff';
                const bColor = ui.phoneBatteryColor || ui.phoneStatusIconColor || '#fff';
                return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', fontSize: 'calc(var(--font-scale,1) * 11px)', color: ui.phoneStatusIconColor || '#fff', background: ui.phoneStatusBarColor || 'transparent' }}>
                    <span>{ui.phoneClockText || '08:30'}</span>
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {ui.phoneShowSignal && (
                            <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: '0.1em', height: '0.85em' }}>
                                {Array.from({ length: sBars }).map((_, i) => <span key={i} style={{ width: '0.18em', height: `${30 + (i / (sBars - 1 || 1)) * 70}%`, borderRadius: 1, background: sColor }} />)}
                            </span>
                        )}
                        {ui.phoneShowBattery && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                                <span style={{ display: 'inline-block', width: '1.5em', height: '0.8em', border: `1px solid ${ui.phoneStatusIconColor || '#fff'}`, borderRadius: 2, position: 'relative' }}>
                                    <span style={{ position: 'absolute', top: 1, bottom: 1, left: 1, right: '35%', background: bColor, borderRadius: 1 }} />
                                </span>
                                <span style={{ display: 'inline-block', width: 2, height: '0.45em', background: ui.phoneStatusIconColor || '#fff', borderRadius: '0 1px 1px 0' }} />
                            </span>
                        )}
                    </span>
                </div>
                );
            })()}
            {ui.phoneHeaderText && <div style={{ padding: '2px 14px', ...(ui.phoneTitleFont ? fontToStyle(ui.phoneTitleFont) : { fontWeight: 700, color: '#fff' }) }}>{ui.phoneHeaderText}</div>}
            <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
                {view === 'contacts' ? (
                    contactsRegion ? null : contactRows
                ) : ui.phoneButtonLayout === 'grid' ? (
                    /* Home grid preview — mirrors the runtime home app's icon grid. */
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, ui.phoneHomeGridColumns ?? 3)}, 1fr)`, gap: '4%', padding: '4% 2%', alignContent: 'start' }}>
                        {buttons.map(b => { const ci = url(b.iconImage as any); const cols = Math.max(1, ui.phoneHomeGridColumns ?? 3); const iconPct = Math.max(6, Math.min(40, ui.phoneHomeIconSize ?? 18)); return (
                            <div key={b.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: ui.phoneButtonIconColor || '#cbd5e1' }}>
                                <span style={{ width: `${(iconPct / (100 / cols)) * 100}%`, maxWidth: '86%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: ui.phoneHomeIconBgColor || 'transparent', borderRadius: ui.phoneHomeIconRadius ?? 14, containerType: 'size' } as React.CSSProperties}>
                                    {ci ? <img src={ci} alt="" style={{ width: '86cqmin', height: '86cqmin', objectFit: 'contain' }} /> : <span style={{ fontSize: '64cqmin', lineHeight: 1 }}>{(b.builtinIcon && PHONE_GLYPHS[b.builtinIcon]) || '●'}</span>}
                                </span>
                                {ui.phoneHomeShowLabels !== false && b.label && <span style={{ fontSize: 'calc(var(--font-scale,1) * 9px)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', textShadow: '0 1px 3px rgba(0,0,0,0.7)', ...(ui.phoneHomeLabelFont ? fontToStyle(ui.phoneHomeLabelFont) : {}) }}>{b.label}</span>}
                            </div>
                        ); })}
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                            {ui.phoneShowAvatars !== false && sample?.baseImageUrl && <img src={sample.baseImageUrl} alt="" style={{ width: `${chatAvatarEm}em`, height: `${chatAvatarEm}em`, borderRadius: '9999px', objectFit: ui.phoneChatAvatarFit || 'cover' }} />}
                            <div style={{ padding: '6px 10px', borderRadius: 14, fontSize: chatFontSize, background: ui.phoneIncomingBubbleColor || '#2a2f3a', color: ui.phoneBubbleTextColor || '#fff' }}>alo tudo bom, onde vc esta?</div>
                        </div>
                        <div style={{ alignSelf: 'flex-end', padding: '6px 10px', borderRadius: 14, fontSize: chatFontSize, background: ui.phoneOutgoingBubbleColor || '#2f6bff', color: ui.phoneBubbleTextColor || '#fff' }}>a caminho!</div>
                    </>
                )}
            </div>
            {view === 'contacts' && contactsRegion && (
                <div style={{ position: 'absolute', left: `${contactsRegion.x}%`, top: `${contactsRegion.y}%`, width: `${contactsRegion.width}%`, height: `${contactsRegion.height}%`, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 6px', zIndex: 2 }}>
                    {contactRows}
                </div>
            )}
            {!hideFreeButtons && ui.phoneButtonLayout === 'free' && buttons.map(b => { const ci = url(b.iconImage as any); return (
                <div key={b.id} style={{ position: 'absolute', left: `${b.x ?? 8}%`, top: `${b.y ?? 12}%`, width: `${b.width ?? 14}%`, height: `${b.height ?? 14}%`, containerType: 'size', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1cqmin', color: ui.phoneButtonIconColor || '#cbd5e1', zIndex: 5 } as React.CSSProperties}>
                    {ci ? <img src={ci} alt="" style={{ width: '82cqmin', height: '82cqmin', objectFit: 'contain' }} /> : <span style={{ fontSize: '74cqmin', lineHeight: 1 }}>{(b.builtinIcon && PHONE_GLYPHS[b.builtinIcon]) || '●'}</span>}
                    {b.label && <span style={{ fontSize: '18cqmin', lineHeight: 1, whiteSpace: 'nowrap' }}>{b.label}</span>}
                </div>
            ); })}
            {ui.phoneButtonLayout !== 'free' && ui.phoneButtonLayout !== 'grid' && buttons.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-around', padding: '6px 4px', background: ui.phoneButtonBarColor || 'rgba(0,0,0,0.35)' }}>
                    {buttons.map(b => { const ci = url(b.iconImage as any); return (
                        <div key={b.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: ui.phoneButtonIconColor || '#cbd5e1', fontSize: 'calc(var(--font-scale,1) * 9px)' }}>
                            {ci ? <img src={ci} alt="" style={{ width: '1.4em', height: '1.4em', objectFit: 'contain' }} /> : <span style={{ fontSize: 'calc(var(--font-scale,1) * 16px)' }}>{(b.builtinIcon && PHONE_GLYPHS[b.builtinIcon]) || '●'}</span>}
                            {b.label && <span>{b.label}</span>}
                        </div>
                    ); })}
                </div>
            )}
        </div>
        {showHome && (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: `calc(var(--font-scale,1) * ${bezel * 0.6}px)` }}>
                <div style={{ width: 'calc(var(--font-scale,1) * 18px)', height: 'calc(var(--font-scale,1) * 18px)', borderRadius: '9999px', border: `2px solid ${ui.phoneHomeButtonColor || 'rgba(255,255,255,0.28)'}` }} />
            </div>
        )}
        </div>
    );
};

/** Canvas preview of the incoming-text notification banner (mirrors the runtime banner). `fill`
 *  fills its parent (used inside a draggable); otherwise it positions itself like the runtime. */
const PhoneBannerPreview: React.FC<{ ui: VNProjectUI; project: VNProject; fill?: boolean }> = ({ ui, project, fill }) => {
    const sample = (Object.values(project.characters) as any[])[0];
    const atTop = (ui.phoneNotifPosition || 'top') === 'top';
    const posStyle: React.CSSProperties = fill
        ? { position: 'relative', width: '100%', height: '100%' }
        : { position: 'absolute', left: '50%', transform: 'translateX(-50%)', [atTop ? 'top' : 'bottom']: '4%', width: '60%' } as React.CSSProperties;
    return (
        <div style={{ ...posStyle, display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderRadius: 14, pointerEvents: 'none', boxSizing: 'border-box', background: ui.phoneNotifColor || '#12141a', color: ui.phoneNotifTextColor || '#fff', boxShadow: '0 8px 30px rgba(0,0,0,0.5)', ...(ui.phoneNotifFont ? fontToStyle(ui.phoneNotifFont) : {}) }}>
            {sample?.baseImageUrl && <img src={sample.baseImageUrl} alt="" style={{ width: '2.4em', height: '2.4em', borderRadius: '9999px', objectFit: 'cover' }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9em' }}>{sample?.name || 'Marte'}</div>
                <div style={{ fontSize: '0.85em', opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>alo tudo bom, onde vc esta?</div>
            </div>
            <span style={{ fontSize: '1.2em' }}>💬</span>
        </div>
    );
};

/** Canvas preview of the unread badge styled per phoneBadgeShape. `fill` centers it in its parent
 *  (used inside a draggable); otherwise it positions itself at the configured x/y. */
const PhoneBadgePreview: React.FC<{ ui: VNProjectUI; fill?: boolean }> = ({ ui, fill }) => {
    const size = ui.phoneBadgeSize ?? 16;
    const shape = ui.phoneBadgeShape || 'dot';
    const color = ui.phoneBadgeColor || '#ef4444';
    const textColor = ui.phoneBadgeTextColor || '#fff';
    const isCount = shape === 'count';
    const isIcon = shape === 'icon';
    const inner: React.CSSProperties = {
        minWidth: size, width: shape === 'count' ? undefined : size, height: size, padding: isCount ? '0 5px' : 0,
        borderRadius: shape === 'square' ? Math.max(3, size * 0.25) : '9999px',
        background: shape === 'ring' ? 'transparent' : color,
        border: shape === 'ring' ? `${Math.max(2, size * 0.18)}px solid ${color}` : undefined,
        color: textColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * (isIcon ? 0.62 : 0.7), fontWeight: 700, boxShadow: shape === 'ring' ? 'none' : '0 2px 8px rgba(0,0,0,0.4)',
    };
    const content = isCount ? '1' : isIcon ? ((ui.phoneBadgeIcon && PHONE_GLYPHS[ui.phoneBadgeIcon]) || '💬') : '';
    const wrap: React.CSSProperties = fill
        ? { position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, pointerEvents: 'none' }
        : { position: 'absolute', left: `${ui.phoneBadgeX ?? 95}%`, top: `${ui.phoneBadgeY ?? 4}%`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pointerEvents: 'none' };
    return <div style={wrap}><div style={inner}>{content}</div>{ui.phoneBadgeLabel && <div style={{ fontSize: Math.max(9, size * 0.62), fontWeight: 600, color: ui.phoneBadgeLabelColor || textColor, whiteSpace: 'nowrap', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{ui.phoneBadgeLabel}</div>}</div>;
};

/** Canvas preview of the full-screen incoming-call screen (mirrors the runtime modal call). */
const PhoneCallPreview: React.FC<{ ui: VNProjectUI; project: VNProject; hidePortrait?: boolean }> = ({ ui, project, hidePortrait }) => {
    const { t } = useTranslation('ui');
    const sample = (Object.values(project.characters) as any[])[0];
    const allAssets = { ...project.images, ...project.backgrounds } as Record<string, any>;
    const bgImg = ui.phoneCallBgImage?.id ? (allAssets[ui.phoneCallBgImage.id]?.imageUrl || null) : null;
    const shape = ui.phoneCallPortraitShape || 'circle';
    const circle = (color: string) => ({ width: '3em', height: '3em', borderRadius: '9999px', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3em' } as React.CSSProperties);
    return (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, pointerEvents: 'none', color: '#fff', background: bgImg ? `url(${bgImg}) center/cover no-repeat` : (ui.phoneCallBgColor || 'rgba(8,10,14,0.96)') }}>
            {!hidePortrait && (
            <div style={{ width: `${ui.phoneCallPortraitSize ?? 22}%`, aspectRatio: '1', borderRadius: shape === 'circle' ? '9999px' : '16px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
                {sample?.baseImageUrl && <img src={sample.baseImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: ui.phoneCallPortraitFit || 'cover', objectPosition: ui.phoneCallPortraitPosition || 'center' }} />}
            </div>
            )}
            <div style={{ ...(ui.phoneCallNameFont ? fontToStyle(ui.phoneCallNameFont) : { fontSize: '1.5em', fontWeight: 700 }) }}>{sample?.name || 'Marte'}</div>
            <div style={{ opacity: 0.7, fontSize: '0.9em' }}>{t('hc.incomingCall2', 'Incoming call…')}</div>
            <div style={{ display: 'flex', gap: 48 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}><span style={circle(ui.phoneCallDeclineColor || '#ef4444')}>{(ui.phoneCallDeclineIcon && PHONE_GLYPHS[ui.phoneCallDeclineIcon]) || '⊘'}</span><span style={{ fontSize: '0.8em' }}>{ui.phoneCallDeclineLabel || 'Decline'}</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}><span style={circle(ui.phoneCallAcceptColor || '#22c55e')}>{(ui.phoneCallAcceptIcon && PHONE_GLYPHS[ui.phoneCallAcceptIcon]) || '📞'}</span><span style={{ fontSize: '0.8em' }}>{ui.phoneCallAcceptLabel || 'Accept'}</span></div>
            </div>
        </div>
    );
};

// Picker for an image OR video background ref (wallpaper / chat backgrounds). The stored `type`
// is derived from whether the chosen id lives in project.videos.
const PhoneBgSelect: React.FC<{ project: VNProject; cls: string; value?: { type: 'image' | 'video'; id: VNID } | null; onChange: (v: { type: 'image' | 'video'; id: VNID } | null) => void }> = ({ project, cls, value, onChange }) => (
    <select className={cls} value={value?.id || ''} onChange={e => {
        const id = e.target.value;
        if (!id) { onChange(null); return; }
        const isVid = !!(project.videos as any)?.[id];
        onChange({ type: isVid ? 'video' : 'image', id: id as VNID });
    }}>
        <option value="">None</option>
        <optgroup label="Images">
            {(Object.values(project.images || {}) as any[]).map(im => <option key={im.id} value={im.id}>{im.name || im.id}</option>)}
        </optgroup>
        <optgroup label="Videos">
            {(Object.values((project as any).videos || {}) as any[]).map(v => <option key={v.id} value={v.id}>{v.name || v.id}</option>)}
        </optgroup>
    </select>
);

/** Editor for a contact's gated conversation LIST (calls or texts): named entries with a
 *  "Plays when…" gate and a play-once flag. At runtime the FIRST entry whose conditions pass
 *  (and isn't a played-out once) wins — so one contact holds many conversations and the story's
 *  variables pick the right one. */
const PhoneConversationListEditor: React.FC<{ entries: any[] | undefined; onChange: (e: any[] | undefined) => void; project: VNProject; t: any; cls: string; kind: 'call' | 'text'; studioTitle?: string }> = ({ entries, onChange, project, t, cls, kind, studioTitle }) => {
    const list = entries || [];
    const [studioOpen, setStudioOpen] = (React as any).useState(false);
    const upd = (i: number, patch: any) => onChange(list.map((x, idx) => idx === i ? { ...x, ...patch } : x));
    const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= list.length) return; const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; onChange(next); };
    const remove = (i: number) => { const next = list.filter((_: any, idx: number) => idx !== i); onChange(next.length ? next : undefined); };
    return (
        <div className="space-y-1.5">
            <button onClick={() => setStudioOpen(true)} className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30" title={t('hc.theBigChatStyleEditor', 'The big chat-style editor — see the conversation as real bubbles')}>
                {t('hc.openConversationStudio', '⛶ Open Conversation Studio')}
            </button>
            {studioOpen && <ConversationStudio isOpen onClose={() => setStudioOpen(false)} project={project} kind={kind}
                title={studioTitle} entries={list} onChangeEntries={next => onChange(next.length ? next : undefined)} />}
            <p className="text-[10px] text-[var(--text-muted)]">{kind === 'text'
                ? 'When the player opens this chat, the FIRST conversation whose conditions pass plays (typing dots, replies, photos). "Once" entries are skipped after they\'ve played; entries without "Once" replay on every visit until their conditions change.'
                : 'When the player calls, the FIRST conversation whose conditions pass plays on the call screen. "Once" entries are skipped after they\'ve played.'}</p>
            {list.map((e: any, i: number) => (
                <CollapsibleSection key={e.id} title={e.name || `Conversation ${i + 1}`}
                    summary={`${e.conversation?.lines?.length || 0} lines${e.once ? ' · once' : ''}${e.conditions?.length ? ' · gated' : ''}`}
                    defaultOpen={!e.conversation?.lines?.length}
                    action={<div className="flex items-center gap-0.5">
                        <button onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 text-[var(--text-muted)] hover:text-white disabled:opacity-30 text-xs" title={t('hc.moveUp', 'Move up')}>↑</button>
                        <button onClick={() => move(i, 1)} disabled={i === list.length - 1} className="p-0.5 text-[var(--text-muted)] hover:text-white disabled:opacity-30 text-xs" title={t('hc.moveDown', 'Move down')}>↓</button>
                        <button onClick={() => remove(i)} className="p-1 text-red-400 hover:text-red-300 text-xs" title="Remove">✕</button>
                    </div>}>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <input className={cls + ' flex-1 min-w-0'} value={e.name ?? ''} placeholder={t('hc.nameEGAfterThe', 'Name (e.g. After the party)')} onChange={ev => upd(i, { name: ev.target.value || undefined })} />
                            <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] flex-shrink-0" title={t('hc.playAtMostOncePer', 'Play at most once per playthrough')}><input type="checkbox" checked={!!e.once} onChange={ev => upd(i, { once: ev.target.checked || undefined })} />Once</label>
                        </div>
                        <ConditionsEditor collapsible title={t('hc.playsWhen', 'Plays when…')} conditions={e.conditions || []} project={project} onChange={(cs: any) => upd(i, { conditions: cs && cs.length ? cs : undefined })} />
                        <PhoneCallConversationEditor conversation={e.conversation} onChange={(conv: any) => upd(i, { conversation: conv || { lines: [] } })} project={project} t={t} />
                    </div>
                </CollapsibleSection>
            ))}
            <button onClick={() => onChange([...list, { id: `pcv-${Date.now()}-${list.length}`, conversation: { lines: [] } }])} className="text-xs px-2 py-1 rounded border border-dashed border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">{t('hc.addConversation', '+ Add conversation')}</button>
        </div>
    );
};

const ConfirmDialogPreview: React.FC<{ ui: VNProjectUI; project: VNProject; variant?: ConfirmVariant }> = ({ ui, project, variant = 'quit' }) => {
    const { t } = useTranslation('ui');
    const cd = ui.confirmDialogs || {};
    // Which confirmation to preview. Styling is per-variant; text differs per variant.
    const isQuit = variant === 'quit';
    const _d = CONFIRM_TEXT_DEFAULTS[variant];
    const previewTitle = (cd as any)[variant + 'Title'] || _d.title;
    const previewMessage = (cd as any)[variant + 'Message'] || _d.message;
    const previewCancel = (cd as any)[variant + 'CancelLabel'] || _d.cancel;
    const previewConfirm = (cd as any)[variant + 'ConfirmLabel'] || _d.confirm;
    void isQuit;
    // Effective per-variant style (shared base overlaid with this variant's overrides).
    const e = { ...cd, ...(cd.variants?.[variant] || {}) };
    const bgColor = e.backgroundColor ?? '#0f172a';
    const bgOpacity = (e.backgroundOpacity ?? 92) / 100;
    const borderRadius = e.borderRadius ?? 12;
    const overlayColor = e.overlayColor ?? 'rgba(0,0,0,0.75)';
    const confirmBtnColor = e.confirmButtonColor ?? '';
    const cancelBtnColor = e.cancelButtonColor ?? '#1e293b';
    const btnBorderRadius = e.buttonBorderRadius ?? Math.max(borderRadius - 4, 4);
    const btnPad = e.buttonPadding ?? 8;
    const dialogPad = e.dialogPadding ?? 32;

    // Resolve assets
    const allAssets = { ...project.images, ...project.backgrounds } as Record<string, any>;
    const resolveUrl = (asset?: { id: string } | null) => asset?.id ? (allAssets[asset.id]?.imageUrl || null) : null;

    const bgImageUrl = resolveUrl(e.backgroundImage as any);
    const borderImageUrl = resolveUrl(e.borderImage as any);
    const confirmBtnImgUrl = resolveUrl(e.confirmButtonImage as any);
    const cancelBtnImgUrl = resolveUrl(e.cancelButtonImage as any);

    const sizeMode = e.backgroundSizeMode || 'stretch';

    const bgImageStyle: React.CSSProperties = bgImageUrl ? {
        backgroundImage: `url(${bgImageUrl})`,
        backgroundSize: sizeMode === 'nine-slice' ? undefined : (sizeMode === 'stretch' ? '100% 100%' : sizeMode),
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
    } : {};

    const titleStyle: React.CSSProperties = e.titleFont ? fontToStyle(e.titleFont) : {
        fontSize: 'calc(var(--font-scale,1) * 20px)', fontWeight: 600, color: '#fff'
    };
    const messageStyle: React.CSSProperties = e.messageFont ? fontToStyle(e.messageFont) : {
        fontSize: 'calc(var(--font-scale,1) * 15px)', color: '#cbd5e1'
    };
    const btnStyle: React.CSSProperties = e.buttonFont ? fontToStyle(e.buttonFont) : {
        fontSize: 'calc(var(--font-scale,1) * 14px)', fontWeight: 500, color: '#fff'
    };

    const alphaHex = Math.round(bgOpacity * 255).toString(16).padStart(2, '0');

    const makeBtnImageStyle = (imgUrl: string | null): React.CSSProperties => {
        if (!imgUrl) return {};
        const bsm = e.buttonSizeMode || 'stretch';
        return {
            backgroundImage: `url(${imgUrl})`,
            backgroundSize: bsm === 'nine-slice' ? undefined : (bsm === 'stretch' ? '100% 100%' : bsm),
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundColor: 'transparent',
            ...(bsm === 'nine-slice' ? { borderImage: `url(${imgUrl}) ${e.buttonSlice ?? 10} fill`, borderImageWidth: `${e.buttonSlice ?? 10}px` } : {}),
        };
    };

    const borderPad = e.borderPadding ?? 12;

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
                    ...(e.dialogWidth ? { width: `calc(var(--font-scale,1) * ${e.dialogWidth}px)` } : { minWidth: 'calc(var(--font-scale,1) * 320px)', maxWidth: 'calc(var(--font-scale,1) * 440px)' }),
                    textAlign: 'center' as const,
                    boxShadow: borderImageUrl ? 'none' : '0 12px 40px rgba(0,0,0,0.5)',
                    ...bgImageStyle,
                }}>
                    <div style={{ ...titleStyle, marginBottom: 'calc(var(--font-scale,1) * 12px)' }}>
                        {previewTitle}
                    </div>
                    <div style={{ ...messageStyle, marginBottom: 'calc(var(--font-scale,1) * 24px)' }}>
                        {previewMessage}
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
                            {previewCancel}
                        </div>
                        <div style={{
                            ...btnStyle,
                            padding: `calc(var(--font-scale,1) * ${btnPad}px) calc(var(--font-scale,1) * ${btnPad * 3}px)`,
                            borderRadius: `calc(var(--font-scale,1) * ${btnBorderRadius}px)`,
                            background: confirmBtnImgUrl ? 'transparent' : (confirmBtnColor || 'linear-gradient(to right, #ec4899, #a855f7)'),
                            ...makeBtnImageStyle(confirmBtnImgUrl),
                        }}>
                            {previewConfirm}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

/** One free-layout piece of the confirm dialog (box / confirm button / cancel button), styled like
 *  ConfirmDialogPreview but filling its container so a ResizableDraggable can position/size it. */
const ConfirmFreePart: React.FC<{ ui: VNProjectUI; project: VNProject; variant: ConfirmVariant; part: 'box' | 'confirm' | 'cancel' }> = ({ ui, project, variant, part }) => {
    const { t } = useTranslation('ui');
    const cd = ui.confirmDialogs || {};
    const isQuit = variant === 'quit';
    const e = { ...cd, ...(cd.variants?.[variant] || {}) };
    const bgColor = e.backgroundColor ?? '#0f172a';
    const alphaHex = Math.round(((e.backgroundOpacity ?? 92) / 100) * 255).toString(16).padStart(2, '0');
    const borderRadius = e.borderRadius ?? 12;
    const confirmBtnColor = e.confirmButtonColor ?? '';
    const cancelBtnColor = e.cancelButtonColor ?? '#1e293b';
    const btnBorderRadius = e.buttonBorderRadius ?? Math.max(borderRadius - 4, 4);
    const dialogPad = e.dialogPadding ?? 32;
    const allAssets = { ...project.images, ...project.backgrounds } as Record<string, any>;
    const resolveUrl = (asset?: { id: string } | null) => asset?.id ? (allAssets[asset.id]?.imageUrl || null) : null;
    const bgImageUrl = resolveUrl(e.backgroundImage as any);
    const sizeMode = e.backgroundSizeMode || 'stretch';
    const bgImageStyle: React.CSSProperties = bgImageUrl ? { backgroundImage: `url(${bgImageUrl})`, backgroundSize: sizeMode === 'nine-slice' ? undefined : (sizeMode === 'stretch' ? '100% 100%' : sizeMode), backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : {};
    const titleStyle = e.titleFont ? fontToStyle(e.titleFont) : { fontSize: 'calc(var(--font-scale,1) * 20px)', fontWeight: 600, color: '#fff' };
    const messageStyle = e.messageFont ? fontToStyle(e.messageFont) : { fontSize: 'calc(var(--font-scale,1) * 15px)', color: '#cbd5e1' };
    const btnStyle = e.buttonFont ? fontToStyle(e.buttonFont) : { fontSize: 'calc(var(--font-scale,1) * 14px)', fontWeight: 500, color: '#fff' };
    const makeBtnImageStyle = (imgUrl: string | null): React.CSSProperties => {
        if (!imgUrl) return {};
        const bsm = e.buttonSizeMode || 'stretch';
        return { backgroundImage: `url(${imgUrl})`, backgroundSize: bsm === 'nine-slice' ? undefined : (bsm === 'stretch' ? '100% 100%' : bsm), backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundColor: 'transparent' };
    };

    if (part === 'box') {
        const previewTitle = (cd as any)[variant + 'Title'] || CONFIRM_TEXT_DEFAULTS[variant].title;
        const previewMessage = (cd as any)[variant + 'Message'] || CONFIRM_TEXT_DEFAULTS[variant].message;
        return (
            <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', backgroundColor: bgImageUrl ? 'transparent' : `${bgColor}${alphaHex}`, borderRadius: `calc(var(--font-scale,1) * ${borderRadius}px)`, padding: `calc(var(--font-scale,1) * ${dialogPad}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'calc(var(--font-scale,1) * 8px)', overflow: 'hidden', textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', ...bgImageStyle }}>
                <div style={titleStyle}>{previewTitle}</div>
                <div style={messageStyle}>{previewMessage}</div>
            </div>
        );
    }
    const isConfirm = part === 'confirm';
    const imgUrl = resolveUrl((isConfirm ? e.confirmButtonImage : e.cancelButtonImage) as any);
    const label = isConfirm
        ? ((cd as any)[variant + 'ConfirmLabel'] || CONFIRM_TEXT_DEFAULTS[variant].confirm)
        : ((cd as any)[variant + 'CancelLabel'] || CONFIRM_TEXT_DEFAULTS[variant].cancel);
    return (
        <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', ...btnStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: `calc(var(--font-scale,1) * ${btnBorderRadius}px)`, ...(isConfirm ? { background: imgUrl ? 'transparent' : (confirmBtnColor || 'linear-gradient(to right, #ec4899, #a855f7)') } : { backgroundColor: imgUrl ? 'transparent' : cancelBtnColor, border: imgUrl ? 'none' : '1px solid rgba(255,255,255,0.1)' }), ...makeBtnImageStyle(imgUrl) }}>
            {label}
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
    /** For the confirmDialogs panel: which variant (Quit / New Game) is being edited+previewed. */
    confirmVariant?: ConfirmVariant;
    onConfirmVariantChange?: (v: ConfirmVariant) => void;
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
        <ColorInput value={value} onChange={onChange} />
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

const InGameUIPropsEditor: React.FC<PropsEditorProps> = ({ ui, element, project, onUpdate, confirmVariant = 'newGame', onConfirmVariantChange }) => {
    const { t } = useTranslation('ui');
    // Gather all available images (images + backgrounds) for background image selectors
    const allImages = useMemo(() => [
        ...Object.values(project.images || {}) as any[],
        ...Object.values(project.backgrounds || {}) as any[],
    ], [project.images, project.backgrounds]);
    // Chrome backgrounds (dialogue/input/choice) can be a VIDEO too — list videos alongside images.
    const allBgMedia = useMemo(() => [
        ...allImages,
        ...Object.values(project.videos || {}) as any[],
    ], [allImages, project.videos]);
    const isVideoAssetId = (id: string): boolean =>
        !!(project.videos as any)?.[id] || !!((project.images as any)?.[id]?.videoUrl) || !!((project.backgrounds as any)?.[id]?.videoUrl);
    /** Build the chrome-bg ref for an asset id, tagging type video/image (preserves no trim — new pick). */
    const bgRefFor = (id: string) => id ? { type: (isVideoAssetId(id) ? 'video' : 'image') as 'video' | 'image', id } : null;

    // Local aliases for brevity
    const Field = PropsField;
    const NumInput = PropsNumInput;
    const ColorField = PropsColorField;
    const OpacityField = PropsOpacityField;
    const inputCls = propsInputCls;

    /* Dialogue Box properties */
    if (element === 'mousePointer') {
        const cursors: any = (ui as any).cursors || {};
        // Write a slot patch; empty slots are REMOVED so untouched projects stay byte-identical.
        const setSlot = (slot: 'normal' | 'hand' | 'drag', patch: any | null) => {
            const next: any = { ...cursors };
            const merged = patch === null ? null : { ...(next[slot] || {}), ...patch };
            if (!merged || !merged.image) delete next[slot]; else next[slot] = merged;
            if (!next.normal && !next.hand && !next.drag && !next.dialogueAdvance && !next.choices) {
                onUpdate({ cursors: undefined } as any);
            } else {
                onUpdate({ cursors: next } as any);
            }
        };
        const setBehavior = (key: 'dialogueAdvance' | 'choices', v: string) => {
            const next: any = { ...cursors };
            if (v === 'hand') delete next[key]; else next[key] = v;
            if (!next.normal && !next.hand && !next.drag && !next.dialogueAdvance && !next.choices) onUpdate({ cursors: undefined } as any);
            else onUpdate({ cursors: next } as any);
        };
        const imageOptions = [...Object.values(project.images || {}), ...Object.values(project.backgrounds || {})] as any[];
        const slotEditor = (slot: 'normal' | 'hand' | 'drag', label: string, hint: string) => {
            const sc: any = cursors[slot] || {};
            return (
                <div className="space-y-1.5 rounded-md border border-[var(--border-subtle)] p-2">
                    <Field label={label}>
                        <select className={inputCls} value={sc.image?.id || ''}
                            onChange={e => setSlot(slot, e.target.value ? { image: { type: 'image', id: e.target.value } } : null)}>
                            <option value="">{t('inGameUi.cursorNone', "None — the computer's own pointer")}</option>
                            {imageOptions.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                        </select>
                    </Field>
                    {sc.image && (
                        <div className="grid grid-cols-2 gap-2">
                            <NumInput label={t('inGameUi.cursorSize', 'Size (px)')} value={sc.size} fallback={32} min={8} max={128} onChange={v => setSlot(slot, { size: v })} />
                            <Field label={t('inGameUi.cursorHot', 'Click point')}>
                                <select className={inputCls} value={sc.hotPreset || 'tip'} onChange={e => setSlot(slot, { hotPreset: e.target.value })}>
                                    <option value="tip">{t('inGameUi.cursorHotTip', 'Top-left tip (like an arrow)')}</option>
                                    <option value="center">{t('inGameUi.cursorHotCenter', 'Center (like a crosshair)')}</option>
                                </select>
                            </Field>
                        </div>
                    )}
                    <p className="text-[10px] text-[var(--text-muted)]">{hint}</p>
                </div>
            );
        };
        return (
            <div className="p-3 space-y-2">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1 mb-1">{t('Mouse pointer')}</h4>
                <p className="text-[10px] text-[var(--text-muted)]">{t('inGameUi.mousePointerHint', 'Give your game its own pointers. Very large pointers may not show on every computer — around 32 px is safest.')}</p>
                {slotEditor('normal', t('inGameUi.cursorNormal', 'Normal pointer'), t('inGameUi.cursorNormalHint', 'Shown everywhere nothing special is happening.'))}
                {slotEditor('hand', t('inGameUi.cursorHand', 'Hand (over clickable things)'), t('inGameUi.cursorHandHint', 'Shown over buttons, hot spots, choices — anything clickable.'))}
                {slotEditor('drag', t('inGameUi.cursorDrag', 'While dragging'), t('inGameUi.cursorDragHint', 'Shown while the player holds and drags an object.'))}
                <div className="grid grid-cols-1 gap-2 pt-1">
                    <Field label={t('inGameUi.cursorDialogue', 'When the story is waiting for a click')}>
                        <select className={inputCls} value={cursors.dialogueAdvance || 'hand'} onChange={e => setBehavior('dialogueAdvance', e.target.value)}>
                            <option value="hand">{t('inGameUi.cursorShowHand', 'Show the hand')}</option>
                            <option value="arrow">{t('inGameUi.cursorKeepArrow', 'Keep the plain arrow')}</option>
                        </select>
                    </Field>
                    <Field label={t('inGameUi.cursorChoices', 'Over choice buttons')}>
                        <select className={inputCls} value={cursors.choices || 'hand'} onChange={e => setBehavior('choices', e.target.value)}>
                            <option value="hand">{t('inGameUi.cursorShowHand', 'Show the hand')}</option>
                            <option value="arrow">{t('inGameUi.cursorKeepArrow', 'Keep the plain arrow')}</option>
                        </select>
                    </Field>
                </div>
            </div>
        );
    }

    if (element === 'dialogueBox') {
        return (
            <div className="p-3 space-y-2">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1 mb-1">{t('inGameUi.dialogueBox')}</h4>
                <CollapsibleSection title={t('inGameUi.groupBoxAppearance', 'Box appearance')} defaultOpen>
                    <div className="space-y-2">
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
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('inGameUi.groupBackgroundBorder', 'Background & border image')}>
                    <div className="space-y-2">
                        <Field label={t('inGameUi.backgroundImage')}>
                            <select className={inputCls} value={ui.dialogueBoxImage?.id || ''}
                                onChange={e => onUpdate({ dialogueBoxImage: bgRefFor(e.target.value) })}>
                                <option value="">{t('inGameUi.noneUseColor')}</option>
                                {allBgMedia.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                            </select>
                        </Field>
                        {ui.dialogueBoxImage?.type === 'video' && (
                            <VideoTrimFields className="mt-1" start={ui.dialogueBoxImage.trimStart} end={ui.dialogueBoxImage.trimEnd}
                                onChange={patch => onUpdate({ dialogueBoxImage: { ...(ui.dialogueBoxImage as any), ...patch } })} />
                        )}
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
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('inGameUi.groupTextFont', 'Text & font')}>
                    <div className="space-y-2">
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
                    </div>
                    {/* ── Automatic punctuation pacing ── */}
                    <div className="border-t border-[var(--border-subtle)] mt-2 pt-2">
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                            <input type="checkbox" checked={ui.dialoguePunctuationPacing?.enabled ?? false}
                                onChange={e => {
                                    if (!e.target.checked) {
                                        // Off with nothing customized → remove the key entirely (byte-identity).
                                        const cur = ui.dialoguePunctuationPacing;
                                        const hasCustom = cur && (cur.commaMs !== undefined || cur.sentenceMs !== undefined || cur.ellipsisMs !== undefined);
                                        onUpdate({ dialoguePunctuationPacing: hasCustom ? { ...cur, enabled: false } : undefined });
                                    } else {
                                        onUpdate({ dialoguePunctuationPacing: { ...(ui.dialoguePunctuationPacing || {}), enabled: true } });
                                    }
                                }} className="cursor-pointer" />
                            {t('inGameUi.punctuationPacing', 'Pause at Punctuation while text types')}
                        </label>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">{t('inGameUi.punctuationPacingHint', 'Small holds after commas, longer after sentence ends, longest after “…” — dialogue reads naturally without typing [pause] codes. Voiced lines with voice-paced text keep the clip’s timing.')}</p>
                        {ui.dialoguePunctuationPacing?.enabled && (
                            <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                                {([
                                    ['commaMs', t('inGameUi.punctuationCommaMs', 'At commas (ms)'), 150],
                                    ['sentenceMs', t('inGameUi.punctuationSentenceMs', 'At . ! ? (ms)'), 300],
                                    ['ellipsisMs', t('inGameUi.punctuationEllipsisMs', 'At … (ms)'), 450],
                                ] as const).map(([key, label, def]) => (
                                    <label key={key} className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                        {label}
                                        <input type="number" min="0" step="50"
                                            value={ui.dialoguePunctuationPacing?.[key] ?? ''}
                                            placeholder={String(def)}
                                            onChange={e => {
                                                const n = parseInt(e.target.value, 10);
                                                onUpdate({ dialoguePunctuationPacing: { ...(ui.dialoguePunctuationPacing || {}), enabled: true, [key]: Number.isFinite(n) && n >= 0 ? n : undefined } });
                                            }}
                                            className="w-full bg-[var(--bg-primary)] text-white p-1 rounded-md border border-[var(--border-default)] text-xs mt-0.5" />
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('inGameUi.groupSpeakerEmphasis', 'Speaker emphasis')}>
                    <p className="text-[10px] text-[var(--text-muted)] mb-2">{t('hc.whileACharacterIsSpeaking', 'While a character is speaking, brighten + slightly enlarge them and dim the others — a "who\'s talking" cue that needs no mouth art.')}</p>
                    <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={ui.speakerEmphasisEnabled ?? false} onChange={e => onUpdate({ speakerEmphasisEnabled: e.target.checked })} className="cursor-pointer" />
                        {t('hc.enableSpeakerEmphasis', 'Enable speaker emphasis')}
                    </label>
                    {ui.speakerEmphasisEnabled && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <NumInput label="Non-speaker brightness %" value={ui.speakerEmphasisDim != null ? Math.round(ui.speakerEmphasisDim * 100) : undefined} fallback={50} min={10} max={100} onChange={v => onUpdate({ speakerEmphasisDim: Math.max(0.1, Math.min(1, v / 100)) })} />
                            <NumInput label="Speaker zoom %" value={ui.speakerEmphasisScale != null ? Math.round(ui.speakerEmphasisScale * 100) : undefined} fallback={104} min={100} max={120} onChange={v => onUpdate({ speakerEmphasisScale: Math.max(1, Math.min(1.3, v / 100)) })} />
                        </div>
                    )}
                </CollapsibleSection>

                <CollapsibleSection title={t('inGameUi.groupRevealHighlight', 'Reveal highlight (karaoke)')}>
                    <p className="text-[10px] text-[var(--text-muted)] mb-2">{t('inGameUi.revealHighlightHint', 'While a line types out, the word currently being revealed lights up — like sing-along lyrics. Off = no change.')}</p>
                    {(() => {
                        const rh = ui.dialogueRevealHighlight || {};
                        const patch = (p: any) => onUpdate({ dialogueRevealHighlight: { ...rh, ...p } });
                        return <>
                            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                                <input type="checkbox" checked={rh.enabled ?? false} onChange={e => patch({ enabled: e.target.checked })} className="cursor-pointer" />
                                {t('inGameUi.revealHighlightOn', 'Highlight the word being revealed')}
                            </label>
                            {rh.enabled && (
                                <div className="space-y-2 mt-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] text-[var(--text-muted)] block mb-0.5">{t('inGameUi.revealHighlightStyle', 'Style')}</label>
                                            <select value={rh.style || 'color'} onChange={e => patch({ style: e.target.value })}
                                                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1.5 py-1 text-white text-xs">
                                                <option value="color">{t('inGameUi.revealHlColor', 'Recolor the word')}</option>
                                                <option value="glow">{t('inGameUi.revealHlGlow', 'Soft glow')}</option>
                                                <option value="underline">{t('inGameUi.revealHlUnderline', 'Underline')}</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-[var(--text-muted)] block mb-0.5">{t('inGameUi.revealHighlightColor', 'Highlight color')}</label>
                                            <ColorInput value={rh.color || '#facc15'} onChange={(v: string) => patch({ color: v })} />
                                        </div>
                                    </div>
                                    <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                                        <input type="checkbox" checked={rh.useSpeakerColor ?? false} onChange={e => patch({ useSpeakerColor: e.target.checked })} className="cursor-pointer" />
                                        {t('inGameUi.revealHighlightSpeaker', 'Use the speaker’s name color instead')}
                                    </label>
                                    <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                                        <input type="checkbox" checked={rh.syncToVoice ?? false} onChange={e => patch({ syncToVoice: e.target.checked })} className="cursor-pointer" />
                                        {t('inGameUi.revealHighlightVoice', 'Sync to voice lines (word timing read from the audio)')}
                                    </label>
                                    {rh.syncToVoice && (
                                        <p className="text-[10px] text-[var(--text-muted)]">{t('inGameUi.revealHighlightVoiceHint', 'On voiced lines the highlight follows the recording — surging and pausing with the actor. Lines without voice fall back to typing sync. Timing is estimated from loudness, so it’s word-accurate, not lip-sync-accurate.')}</p>
                                    )}
                                </div>
                            )}
                        </>;
                    })()}
                    <div className="border-t border-[var(--border-subtle)] mt-2 pt-2">
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                            <input type="checkbox" checked={ui.voicePacedText ?? false} onChange={e => onUpdate({ voicePacedText: e.target.checked })} className="cursor-pointer" />
                            {t('inGameUi.voicePacedText', 'Voice-paced text: the reveal finishes together with the voice clip')}
                        </label>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">{t('inGameUi.voicePacedTextHint', 'Only affects voiced lines; a per-line Text Speed override still wins.')}</p>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('inGameUi.groupReactiveStates', 'Reactive states')}>
                    <DialogueReactiveStatesEditor states={ui.dialogueReactiveStates} project={project} onChange={s => onUpdate({ dialogueReactiveStates: s })} />
                </CollapsibleSection>
            </div>
        );
    }

    /* Name Box properties */
    if (element === 'nameBox') {
        return (
            <div className="p-3 space-y-2">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1 mb-1">{t('inGameUi.nameBox')}</h4>
                <CollapsibleSection title={t('inGameUi.groupBoxAppearance', 'Box appearance')} defaultOpen>
                    <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            <ColorField label={t('inGameUi.colorBackground')} value={ui.nameboxColor ?? '#0f172a'} onChange={v => onUpdate({ nameboxColor: v })} />
                            <OpacityField label={t('inGameUi.opacity')} value={ui.nameboxOpacity ?? 92} onChange={v => onUpdate({ nameboxOpacity: v })} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <NumInput label={t('inGameUi.borderRadius')} value={ui.nameboxBorderRadius} fallback={6} min={0} onChange={v => onUpdate({ nameboxBorderRadius: v })} />
                            <NumInput label={t('inGameUi.padding')} value={ui.nameboxPadding} fallback={8} min={0} onChange={v => onUpdate({ nameboxPadding: v })} />
                            <NumInput label={t('inGameUi.hPadding')} value={ui.nameboxHorizontalPadding} fallback={14} min={0} onChange={v => onUpdate({ nameboxHorizontalPadding: v })} />
                        </div>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('inGameUi.groupBackgroundImage', 'Background image')}>
                    <div className="space-y-2">
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
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('inGameUi.groupFont', 'Font')}>
                    <FontEditor
                        label={t('inGameUi.nameFont')}
                        font={(ui.dialogueNameFont as VNFontSettings) ?? defaultFontSettings}
                        onFontChange={(prop, value) => onUpdate({ dialogueNameFont: { ...((ui.dialogueNameFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })}
                    />
                    <p className="text-[10px] text-[var(--text-muted)] mt-2">
                        Want the nameplate to change with a variable? Set up <strong>{t('hc.reactiveStates', 'Reactive States')}</strong> {t('hc.inTheDialogueBoxSection', 'in the Dialogue Box section — they cover the box')} <em>and</em> the nameplate.
                    </p>
                </CollapsibleSection>
            </div>
        );
    }

    /* Choice Buttons properties */
    if (element === 'choiceButtons') {
        return (
            <div className="p-3 space-y-2">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1 mb-1">{t('inGameUi.choiceButtons')}</h4>
                <CollapsibleSection title={t('inGameUi.groupButtonAppearance', 'Button appearance')} defaultOpen>
                    <div className="space-y-2">
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
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('inGameUi.groupImages', 'Images')}>
                    <div className="space-y-2">
                        <Field label={t('inGameUi.backgroundImage')}>
                            <select className={inputCls} value={ui.choiceButtonImage?.id || ''}
                                onChange={e => onUpdate({ choiceButtonImage: bgRefFor(e.target.value) })}>
                                <option value="">{t('inGameUi.noneUseColor')}</option>
                                {allBgMedia.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                            </select>
                        </Field>
                        {ui.choiceButtonImage?.type === 'video' && (
                            <VideoTrimFields className="mt-1" start={ui.choiceButtonImage.trimStart} end={ui.choiceButtonImage.trimEnd}
                                onChange={patch => onUpdate({ choiceButtonImage: { ...(ui.choiceButtonImage as any), ...patch } })} />
                        )}
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
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('inGameUi.groupFont', 'Font')}>
                    <FontEditor
                        label={t('inGameUi.choiceTextFont')}
                        font={(ui.choiceTextFont as VNFontSettings) ?? defaultFontSettings}
                        onFontChange={(prop, value) => onUpdate({ choiceTextFont: { ...((ui.choiceTextFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })}
                    />
                </CollapsibleSection>
            </div>
        );
    }

    /* Input Box properties */
    if (element === 'inputBox') {
        return (
            <div className="p-3 space-y-2">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1 mb-1">{t('inGameUi.textInputBox')}</h4>
                <CollapsibleSection title={t('inGameUi.groupBoxAppearance', 'Box appearance')} defaultOpen>
                    <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            <ColorField label={t('inGameUi.colorBackground')} value={ui.inputBoxColor ?? '#0f172a'} onChange={v => onUpdate({ inputBoxColor: v })} />
                            <OpacityField label={t('inGameUi.opacity')} value={ui.inputBoxOpacity ?? 92} onChange={v => onUpdate({ inputBoxOpacity: v })} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <NumInput label={t('inGameUi.borderRadius')} value={ui.inputBoxBorderRadius} fallback={8} min={0} onChange={v => onUpdate({ inputBoxBorderRadius: v })} />
                            <NumInput label={t('inGameUi.padding')} value={ui.inputBoxPadding} fallback={24} min={0} onChange={v => onUpdate({ inputBoxPadding: v })} />
                        </div>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('inGameUi.groupBackgroundBorder', 'Background & border image')}>
                    <div className="space-y-2">
                        <Field label={t('inGameUi.backgroundImage')}>
                            <select className={inputCls} value={ui.inputBoxImage?.id || ''}
                                onChange={e => onUpdate({ inputBoxImage: bgRefFor(e.target.value) })}>
                                <option value="">{t('inGameUi.noneUseColor')}</option>
                                {allBgMedia.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                            </select>
                        </Field>
                        {ui.inputBoxImage?.type === 'video' && (
                            <VideoTrimFields className="mt-1" start={ui.inputBoxImage.trimStart} end={ui.inputBoxImage.trimEnd}
                                onChange={patch => onUpdate({ inputBoxImage: { ...(ui.inputBoxImage as any), ...patch } })} />
                        )}
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
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('inGameUi.groupFonts', 'Fonts')}>
                    <div className="space-y-2">
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
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('inGameUi.submitButton', 'Submit Button')}>
                    <div className="space-y-2">
                        <Field label={t('inGameUi.buttonLabel', 'Button text')}>
                            <input className={inputCls} value={ui.inputSubmitLabel ?? ''} placeholder={t('inGameUi.submit')}
                                onChange={e => onUpdate({ inputSubmitLabel: e.target.value || undefined })} />
                        </Field>
                        <div className="grid grid-cols-2 gap-2">
                            <ColorField label={t('inGameUi.colorBackground')} value={ui.inputSubmitColor ?? '#334155'} onChange={v => onUpdate({ inputSubmitColor: v })} />
                            <NumInput label={t('inGameUi.borderRadius')} value={ui.inputSubmitBorderRadius} fallback={6} min={0} onChange={v => onUpdate({ inputSubmitBorderRadius: v })} />
                        </div>
                        <Field label={t('inGameUi.backgroundImage')}>
                            <select className={inputCls} value={ui.inputSubmitImage?.id || ''}
                                onChange={e => {
                                    const asset = e.target.value ? allImages.find((img: any) => img.id === e.target.value) : null;
                                    onUpdate({ inputSubmitImage: asset ? { type: 'image', id: asset.id } : null });
                                }}>
                                <option value="">{t('inGameUi.noneUseColor')}</option>
                                {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                            </select>
                        </Field>
                        <FontEditor
                            label={t('inGameUi.submitButtonFont')}
                            font={(ui.inputSubmitFont as VNFontSettings) ?? defaultFontSettings}
                            onFontChange={(prop, value) => onUpdate({ inputSubmitFont: { ...((ui.inputSubmitFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })}
                        />
                    </div>
                </CollapsibleSection>
            </div>
        );
    }

    /* Quick Menu properties */
    if (element === 'quickMenu') {
        return (
            <div className="p-3 space-y-2">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1 mb-1">{t('inGameUi.quickMenu')}</h4>
                <CollapsibleSection title={t('inGameUi.groupAppearancePosition', 'Appearance & position')} defaultOpen>
                <div className="space-y-2">
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

                </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('inGameUi.groupReactiveStates', 'Reactive states')}>
                    <QuickMenuReactiveStatesEditor states={ui.quickMenuReactiveStates} project={project} onChange={s => onUpdate({ quickMenuReactiveStates: s })} />
                </CollapsibleSection>

                <CollapsibleSection title={t('inGameUi.buttonsHeader')} defaultOpen>
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
                </CollapsibleSection>
            </div>
        );
    }

    /* Phone properties */
    if (element === 'phone') {
        const numberVars = Object.values(project.variables).filter((v: any) => v.type === 'number');
        const buttons = ui.phoneButtons || [];
        const updateBtn = (i: number, patch: Partial<PhoneButtonConfig>) => onUpdate({ phoneButtons: buttons.map((b, idx) => idx === i ? { ...b, ...patch } : b) });
        const addBtn = () => onUpdate({ phoneButtons: [...buttons, { id: `pb-${Math.random().toString(36).slice(2, 9)}`, label: '', builtinIcon: 'chat', action: { type: UIActionType.ShowPhoneText } as VNUIAction }] });
        const removeBtn = (i: number) => onUpdate({ phoneButtons: buttons.filter((_, idx) => idx !== i) });
        return (
            <div className="p-3 space-y-2">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1 mb-1">Phone</h4>
                <p className="text-[10px] text-[var(--text-muted)]">{t('hc.inGameCellphoneMessaging', "In-game cellphone + messaging. It appears whenever it's opened — by the hotkey below, a Phone command (Show/Hide Phone, Show/Hide Text), or any button's phone action. Theme it here; no separate enable switch needed.")}</p>

                <CollapsibleSection title={t('hc.shellPosition', 'Shell & position')} defaultOpen>
                    <div className="space-y-2">
                        <Field label="Position">
                            <select className={inputCls} value={ui.phonePosition || 'bottom-right'} onChange={e => onUpdate({ phonePosition: e.target.value as any })}>
                                <option value="bottom-right">{t('hc.bottomRight', 'Bottom right')}</option>
                                <option value="bottom-left">{t('hc.bottomLeft', 'Bottom left')}</option>
                                <option value="top-right">{t('hc.topRight', 'Top right')}</option>
                                <option value="top-left">{t('hc.topLeft', 'Top left')}</option>
                                <option value="center">Center</option>
                            </select>
                        </Field>
                        <Field label="Scale">
                            <div className="flex items-center gap-2">
                                <RangeInput min={30} max={200} value={ui.phoneScale ?? 100} onChange={e => onUpdate({ phoneScale: parseInt(e.target.value) })} className="flex-1 accent-sky-500" />
                                <span className="text-xs text-[var(--text-secondary)] w-10 text-right">{ui.phoneScale ?? 100}%</span>
                            </div>
                        </Field>
                        <div className="grid grid-cols-2 gap-2">
                            <NumInput label="Width (%)" value={ui.phoneWidth} fallback={26} min={10} max={100} onChange={v => onUpdate({ phoneWidth: v })} />
                            <NumInput label="Height (%)" value={ui.phoneHeight} fallback={82} min={20} max={100} onChange={v => onUpdate({ phoneHeight: v })} />
                            <NumInput label="X (%)" value={ui.phoneX} fallback={72} min={0} max={100} onChange={v => onUpdate({ phoneX: v })} />
                            <NumInput label="Y (%)" value={ui.phoneY} fallback={16} min={0} max={100} onChange={v => onUpdate({ phoneY: v })} />
                        </div>
                        <ColorField label="Shell color" value={ui.phoneShellColor ?? '#0b0d12'} onChange={v => onUpdate({ phoneShellColor: v })} />
                        <Field label="Shell image">
                            <select className={inputCls} value={ui.phoneShellImage?.id || ''} onChange={e => onUpdate({ phoneShellImage: e.target.value ? { type: 'image', id: e.target.value as VNID } : null })}>
                                <option value="">{t('hc.noneSolidColor', 'None (solid color)')}</option>
                                {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                            </select>
                        </Field>
                        <div className="grid grid-cols-2 gap-2">
                            <NumInput label="Corner radius" value={ui.phoneBorderRadius} fallback={28} min={0} max={80} onChange={v => onUpdate({ phoneBorderRadius: v })} />
                            <OpacityField label="Opacity" value={ui.phoneOpacity ?? 100} onChange={v => onUpdate({ phoneOpacity: v })} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <NumInput label="Bezel width (px)" value={ui.phoneBezelWidth} fallback={8} min={0} max={40} onChange={v => onUpdate({ phoneBezelWidth: v })} />
                            <ColorField label="Screen color" value={ui.phoneScreenColor ?? '#0b0d12'} onChange={v => onUpdate({ phoneScreenColor: v })} />
                        </div>
                        <ColorField label="Screen border" value={ui.phoneScreenBorderColor ?? '#ffffff1f'} onChange={v => onUpdate({ phoneScreenBorderColor: v })} />
                        <Field label="Home button">
                            <input type="checkbox" checked={ui.phoneShowHomeButton !== false} onChange={e => onUpdate({ phoneShowHomeButton: e.target.checked })} className="cursor-pointer" />
                            <span className="text-xs text-[var(--text-secondary)] ml-2">{t('hc.aRoundButtonOnThe', 'A round button on the chin (also closes the phone).')}</span>
                        </Field>
                        {ui.phoneShowHomeButton !== false && (
                            <ColorField label="Home button color" value={ui.phoneHomeButtonColor ?? '#ffffff47'} onChange={v => onUpdate({ phoneHomeButtonColor: v })} />
                        )}
                        <Field label="Open hotkey">
                            <input className={inputCls} maxLength={1} value={ui.phoneOpenHotkey ?? ''} placeholder={t('hc.egP', 'e.g. p')} onChange={e => onUpdate({ phoneOpenHotkey: e.target.value || undefined })} />
                        </Field>
                        <Field label="On close">
                            <select className={inputCls} value={ui.phoneOnCloseBehavior || 'resume'} onChange={e => onUpdate({ phoneOnCloseBehavior: e.target.value === 'resume' ? undefined : e.target.value as any })}>
                                <option value="resume">{t('hc.doNothingPlayerAdvances', 'Do nothing (player advances)')}</option>
                                <option value="advance">{t('hc.advanceTheStoryOneStep', 'Advance the story one step')}</option>
                            </select>
                        </Field>
                        <p className="text-[10px] text-[var(--text-muted)] -mt-1">{t('hc.chooseWhatHappensWhenThe', 'Choose what happens when the player closes the phone (home button / Hide Phone). "Advance" continues the scene so they don\'t need an extra click.')}</p>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('hc.statusBar', 'Status bar')}>
                    <div className="space-y-2">
                        <Field label="Show status bar">
                            <input type="checkbox" checked={ui.phoneShowStatusBar !== false} onChange={e => onUpdate({ phoneShowStatusBar: e.target.checked })} className="cursor-pointer" />
                        </Field>
                        <Field label="Clock text">
                            <input className={inputCls} value={ui.phoneClockText ?? ''} placeholder="08:30 or {time}" onChange={e => onUpdate({ phoneClockText: e.target.value || undefined })} />
                        </Field>
                        <div className="grid grid-cols-2 gap-2">
                            <ColorField label="Bar color" value={ui.phoneStatusBarColor ?? '#00000000'} onChange={v => onUpdate({ phoneStatusBarColor: v })} />
                            <ColorField label="Icon/text color" value={ui.phoneStatusIconColor ?? '#ffffff'} onChange={v => onUpdate({ phoneStatusIconColor: v })} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Field label="Signal icon"><input type="checkbox" checked={!!ui.phoneShowSignal} onChange={e => onUpdate({ phoneShowSignal: e.target.checked })} className="cursor-pointer" /></Field>
                            <Field label="Battery icon"><input type="checkbox" checked={!!ui.phoneShowBattery} onChange={e => onUpdate({ phoneShowBattery: e.target.checked })} className="cursor-pointer" /></Field>
                        </div>
                        {ui.phoneShowSignal && (
                            <div className="pl-2 border-l-2 border-[var(--accent-lavender)]/30 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <NumInput label="Signal bars" value={ui.phoneSignalBars} fallback={4} min={1} max={8} onChange={v => onUpdate({ phoneSignalBars: v })} />
                                    <ColorField label="Signal color" value={ui.phoneSignalColor ?? (ui.phoneStatusIconColor || '#ffffff')} onChange={v => onUpdate({ phoneSignalColor: v })} />
                                </div>
                                <Field label="Bars filled from variable">
                                    <select className={inputCls} value={ui.phoneSignalVariableId || ''} onChange={e => onUpdate({ phoneSignalVariableId: (e.target.value || undefined) as VNID | undefined })}>
                                        <option value="">{t('hc.allBarsFilled', 'All bars filled')}</option>
                                        {numberVars.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </select>
                                </Field>
                                <p className="text-[10px] text-[var(--text-muted)] -mt-1">{t('hc.theVariableSValueHow', 'The variable\'s value = how many bars are lit. Change it with Set Variable (gated by conditions) to raise/drop signal during the story.')}</p>
                            </div>
                        )}
                        {ui.phoneShowBattery && (
                            <div className="pl-2 border-l-2 border-[var(--accent-lavender)]/30 space-y-2">
                                <ColorField label="Battery color" value={ui.phoneBatteryColor ?? (ui.phoneStatusIconColor || '#ffffff')} onChange={v => onUpdate({ phoneBatteryColor: v })} />
                                <Field label="Battery % from variable">
                                    <select className={inputCls} value={ui.phoneBatteryVariableId || ''} onChange={e => onUpdate({ phoneBatteryVariableId: (e.target.value || undefined) as VNID | undefined })}>
                                        <option value="">{t('hc.full100', 'Full (100%)')}</option>
                                        {numberVars.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </select>
                                </Field>
                            </div>
                        )}
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('hc.headerChatBubbles', 'Header & chat bubbles')}>
                    <div className="space-y-2">
                        <Field label="Header text"><input className={inputCls} value={ui.phoneHeaderText ?? ''} placeholder="MESSAGES" onChange={e => onUpdate({ phoneHeaderText: e.target.value || undefined })} /></Field>
                        <div className="grid grid-cols-2 gap-2">
                            <ColorField label="Incoming bubble" value={ui.phoneIncomingBubbleColor ?? '#2a2f3a'} onChange={v => onUpdate({ phoneIncomingBubbleColor: v })} />
                            <ColorField label="Your bubble" value={ui.phoneOutgoingBubbleColor ?? '#2f6bff'} onChange={v => onUpdate({ phoneOutgoingBubbleColor: v })} />
                        </div>
                        <ColorField label="Bubble text" value={ui.phoneBubbleTextColor ?? '#ffffff'} onChange={v => onUpdate({ phoneBubbleTextColor: v })} />
                        <Field label="Show avatars"><input type="checkbox" checked={ui.phoneShowAvatars !== false} onChange={e => onUpdate({ phoneShowAvatars: e.target.checked })} className="cursor-pointer" /></Field>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Buttons">
                    <div className="space-y-2">
                        <Field label="Layout">
                            <select className={inputCls} value={ui.phoneButtonLayout || 'bar'} onChange={e => onUpdate({ phoneButtonLayout: e.target.value === 'bar' ? undefined : e.target.value as any })}>
                                <option value="bar">{t('hc.bottomBarEvenlySpaced', 'Bottom bar (evenly spaced)')}</option>
                                <option value="grid">{t('hc.homeGridFullScreenApp', 'Home grid (full-screen app icons)')}</option>
                                <option value="free">{t('hc.freePlacementAppIconsAnywhere', 'Free placement (app icons anywhere)')}</option>
                            </select>
                        </Field>
                        <p className="text-[10px] text-[var(--text-muted)] -mt-1">{t('hc.homeGridFillsTheHome', 'Home grid fills the home screen with app icons in rows, like a real phone. Free placement positions each button by its own X/Y.')}</p>
                        <div className="grid grid-cols-2 gap-2">
                            <ColorField label="Bar color" value={ui.phoneButtonBarColor ?? '#00000059'} onChange={v => onUpdate({ phoneButtonBarColor: v })} />
                            <ColorField label="Icon color" value={ui.phoneButtonIconColor ?? '#cbd5e1'} onChange={v => onUpdate({ phoneButtonIconColor: v })} />
                        </div>
                        {ui.phoneButtonLayout === 'grid' && (
                            <div className="space-y-2 border border-[var(--border-subtle)] rounded p-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <NumInput label="Icons per row" value={ui.phoneHomeGridColumns} fallback={3} min={1} max={6} onChange={v => onUpdate({ phoneHomeGridColumns: v })} />
                                    <NumInput label="Icon size %" value={ui.phoneHomeIconSize} fallback={18} min={6} max={40} onChange={v => onUpdate({ phoneHomeIconSize: v })} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <ColorField label="Icon backing" value={ui.phoneHomeIconBgColor ?? '#00000000'} onChange={v => onUpdate({ phoneHomeIconBgColor: v })} />
                                    <NumInput label="Backing radius" value={ui.phoneHomeIconRadius} fallback={14} min={0} max={60} onChange={v => onUpdate({ phoneHomeIconRadius: v })} />
                                </div>
                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input type="checkbox" checked={ui.phoneHomeShowLabels !== false} onChange={e => onUpdate({ phoneHomeShowLabels: e.target.checked ? undefined : false })} className="w-3.5 h-3.5" /> Show labels under icons
                                </label>
                                <FontEditor label="Label font" font={(ui.phoneHomeLabelFont as VNFontSettings) ?? defaultFontSettings} onFontChange={(prop, value) => onUpdate({ phoneHomeLabelFont: { ...((ui.phoneHomeLabelFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })} />
                            </div>
                        )}
                        {buttons.map((b, i) => (
                            <div key={b.id} className="border border-[var(--border-subtle)] rounded p-2 space-y-1.5">
                                <div className="flex items-center gap-1">
                                    <input className={inputCls} value={b.label ?? ''} placeholder={t('hc.labelOptional', 'Label (optional)')} onChange={e => updateBtn(i, { label: e.target.value || undefined })} />
                                    <button onClick={() => removeBtn(i)} className="p-1 text-red-400 hover:text-red-300" title="Remove"><TrashIcon className="w-4 h-4" /></button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Field label="Icon">
                                        <select className={inputCls} value={b.builtinIcon || ''} onChange={e => updateBtn(i, { builtinIcon: e.target.value || undefined })}>
                                            {PHONE_ICON_KEYS.map(k => <option key={k} value={k}>{PHONE_GLYPHS[k]} {k}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Custom icon">
                                        <select className={inputCls} value={b.iconImage?.id || ''} onChange={e => updateBtn(i, { iconImage: e.target.value ? { type: 'image', id: e.target.value as VNID } : null })}>
                                            <option value="">{t('hc.useBuiltIn', 'Use built-in')}</option>
                                            {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                                        </select>
                                    </Field>
                                </div>
                                {ui.phoneButtonLayout === 'free' && (
                                    <div className="grid grid-cols-4 gap-1">
                                        <NumInput label="X %" value={b.x} fallback={8} min={0} max={100} onChange={v => updateBtn(i, { x: v })} />
                                        <NumInput label="Y %" value={b.y} fallback={12} min={0} max={100} onChange={v => updateBtn(i, { y: v })} />
                                        <NumInput label="W %" value={b.width} fallback={22} min={4} max={100} onChange={v => updateBtn(i, { width: v })} />
                                        <NumInput label="H %" value={b.height} fallback={16} min={4} max={100} onChange={v => updateBtn(i, { height: v })} />
                                    </div>
                                )}
                                <Field label="Opens">
                                    <select className={inputCls} value={b.appId || '__custom__'} onChange={e => {
                                        const v = e.target.value;
                                        if (v === '__custom__') updateBtn(i, { appId: undefined });
                                        else updateBtn(i, { appId: v, builtinIcon: b.builtinIcon || PHONE_APP_CHOICES.find(a => a.id === v)?.glyph, label: b.label || PHONE_APP_CHOICES.find(a => a.id === v)?.label });
                                    }}>
                                        {PHONE_APP_CHOICES.map(a => <option key={a.id} value={a.id}>{PHONE_GLYPHS[a.glyph]} {a.label} app</option>)}
                                        <option value="__custom__">{t('hc.customAction', 'Custom action…')}</option>
                                    </select>
                                </Field>
                                {!b.appId && (
                                    <div>
                                        <span className="text-[10px] text-[var(--text-secondary)]">{t('hc.actionWhenTapped', 'Action when tapped')}</span>
                                        <ActionEditor action={b.action ?? { type: UIActionType.None } as VNUIAction} onActionChange={(a) => updateBtn(i, { action: a.type === UIActionType.None ? undefined : a })} />
                                    </div>
                                )}
                            </div>
                        ))}
                        <button onClick={addBtn} className="w-full p-1.5 text-xs rounded bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] flex items-center justify-center gap-1"><PlusIcon className="w-3 h-3" /> {t('hc.addButton', 'Add button')}</button>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Fonts">
                    <div className="space-y-2">
                        <FontEditor label="Header font" font={(ui.phoneTitleFont as VNFontSettings) ?? defaultFontSettings} onFontChange={(prop, value) => onUpdate({ phoneTitleFont: { ...((ui.phoneTitleFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })} />
                        <FontEditor label="Chat font" font={(ui.phoneFont as VNFontSettings) ?? defaultFontSettings} onFontChange={(prop, value) => onUpdate({ phoneFont: { ...((ui.phoneFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })} />
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('hc.incomingTextBadge', 'Incoming text & badge')}>
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('hc.usedByTheIncomingText', "Used by the \"Incoming Text\" command. The banner slides in when a text arrives; the badge marks unread.")}</p>
                    <Field label="Banner position">
                        <select className={inputCls} value={ui.phoneNotifPosition || 'top'} onChange={e => onUpdate({ phoneNotifPosition: e.target.value as any })}>
                            <option value="top">Top</option>
                            <option value="bottom">Bottom</option>
                        </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                        <ColorField label="Banner color" value={ui.phoneNotifColor ?? '#12141a'} onChange={v => onUpdate({ phoneNotifColor: v })} />
                        <ColorField label="Banner text" value={ui.phoneNotifTextColor ?? '#ffffff'} onChange={v => onUpdate({ phoneNotifTextColor: v })} />
                    </div>
                    <Field label="Default ding sound">
                        <select className={inputCls} value={ui.phoneNotifSoundId || ''} onChange={e => onUpdate({ phoneNotifSoundId: (e.target.value || null) as any })}>
                            <option value="">None</option>
                            {(Object.values(project.audio || {}) as any[]).map(a => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                        </select>
                    </Field>
                    <NumInput label="Auto-dismiss (ms, 0 = stay)" value={ui.phoneNotifAutoMs} fallback={6000} min={0} max={60000} onChange={v => onUpdate({ phoneNotifAutoMs: v })} />
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <div className="grid grid-cols-2 gap-2">
                        <ColorField label="Badge color" value={ui.phoneBadgeColor ?? '#ef4444'} onChange={v => onUpdate({ phoneBadgeColor: v })} />
                        <ColorField label="Badge text" value={ui.phoneBadgeTextColor ?? '#ffffff'} onChange={v => onUpdate({ phoneBadgeTextColor: v })} />
                    </div>
                    <Field label="Badge style">
                        <select className={inputCls} value={ui.phoneBadgeShape || 'dot'} onChange={e => onUpdate({ phoneBadgeShape: e.target.value as any })}>
                            <option value="dot">Dot</option>
                            <option value="count">Count</option>
                            <option value="ring">{t('hc.ringHollow', 'Ring (hollow)')}</option>
                            <option value="square">{t('hc.roundedSquare', 'Rounded square')}</option>
                            <option value="icon">Icon</option>
                            <option value="pulse">{t('hc.pulsingDot', 'Pulsing dot')}</option>
                        </select>
                    </Field>
                    {ui.phoneBadgeShape === 'icon' && (
                        <Field label="Badge icon">
                            <select className={inputCls} value={ui.phoneBadgeIcon || ''} onChange={e => onUpdate({ phoneBadgeIcon: e.target.value || undefined })}>
                                <option value="">{t('hc.default', '💬 default')}</option>
                                {PHONE_ICON_KEYS.map(k => <option key={k} value={k}>{PHONE_GLYPHS[k]} {k}</option>)}
                            </select>
                        </Field>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Caption (under badge)"><input className={inputCls} value={ui.phoneBadgeLabel ?? ''} placeholder='e.g. "Messages"' onChange={e => onUpdate({ phoneBadgeLabel: e.target.value || undefined })} /></Field>
                        <ColorField label="Caption color" value={ui.phoneBadgeLabelColor ?? '#ffffff'} onChange={v => onUpdate({ phoneBadgeLabelColor: v })} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <NumInput label="Badge size (px)" value={ui.phoneBadgeSize} fallback={16} min={6} max={48} onChange={v => onUpdate({ phoneBadgeSize: v })} />
                        <NumInput label="Badge X (%)" value={ui.phoneBadgeX} fallback={95} min={0} max={100} onChange={v => onUpdate({ phoneBadgeX: v })} />
                        <NumInput label="Badge Y (%)" value={ui.phoneBadgeY} fallback={4} min={0} max={100} onChange={v => onUpdate({ phoneBadgeY: v })} />
                    </div>
                    <ColorField label="Typing dots color" value={ui.phoneTypingColor ?? '#ffffff'} onChange={v => onUpdate({ phoneTypingColor: v })} />
                </CollapsibleSection>

                <CollapsibleSection title={t('hc.incomingCall', 'Incoming call')}>
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('hc.usedByTheIncomingCall', 'Used by the "Incoming Call" command (full-screen accept/decline, or a corner ring).')}</p>
                    <ColorField label="Call background" value={ui.phoneCallBgColor ?? '#080a0e'} onChange={v => onUpdate({ phoneCallBgColor: v })} />
                    <Field label="Call background image">
                        <select className={inputCls} value={ui.phoneCallBgImage?.id || ''} onChange={e => onUpdate({ phoneCallBgImage: e.target.value ? { type: 'image', id: e.target.value as VNID } : null })}>
                            <option value="">{t('hc.noneSolidColor', 'None (solid color)')}</option>
                            {allImages.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                        </select>
                    </Field>
                    <Field label="Default ringtone">
                        <select className={inputCls} value={ui.phoneCallRingtoneId || ''} onChange={e => onUpdate({ phoneCallRingtoneId: (e.target.value || null) as any })}>
                            <option value="">None</option>
                            {(Object.values(project.audio || {}) as any[]).map(a => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                        </select>
                    </Field>
                    <Field label="Caller portrait shape">
                        <select className={inputCls} value={ui.phoneCallPortraitShape || 'circle'} onChange={e => onUpdate({ phoneCallPortraitShape: e.target.value as any })}>
                            <option value="circle">Circle</option>
                            <option value="square">{t('hc.roundedSquare', 'Rounded square')}</option>
                        </select>
                    </Field>
                    <FontEditor label="Caller name font" font={(ui.phoneCallNameFont as VNFontSettings) ?? defaultFontSettings} onFontChange={(prop, value) => onUpdate({ phoneCallNameFont: { ...((ui.phoneCallNameFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })} />
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Accept label"><input className={inputCls} value={ui.phoneCallAcceptLabel ?? ''} placeholder="Accept" onChange={e => onUpdate({ phoneCallAcceptLabel: e.target.value })} /></Field>
                        <ColorField label="Accept color" value={ui.phoneCallAcceptColor ?? '#22c55e'} onChange={v => onUpdate({ phoneCallAcceptColor: v })} />
                    </div>
                    <Field label="Accept icon">
                        <select className={inputCls} value={ui.phoneCallAcceptIcon || ''} onChange={e => onUpdate({ phoneCallAcceptIcon: e.target.value || undefined })}>
                            <option value="">{t('hc.default2', '📞 default')}</option>
                            {PHONE_ICON_KEYS.map(k => <option key={k} value={k}>{PHONE_GLYPHS[k]} {k}</option>)}
                        </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Decline label"><input className={inputCls} value={ui.phoneCallDeclineLabel ?? ''} placeholder="Decline" onChange={e => onUpdate({ phoneCallDeclineLabel: e.target.value })} /></Field>
                        <ColorField label="Decline color" value={ui.phoneCallDeclineColor ?? '#ef4444'} onChange={v => onUpdate({ phoneCallDeclineColor: v })} />
                    </div>
                    <Field label="Decline icon">
                        <select className={inputCls} value={ui.phoneCallDeclineIcon || ''} onChange={e => onUpdate({ phoneCallDeclineIcon: e.target.value || undefined })}>
                            <option value="">{t('hc.default3', '⊘ default')}</option>
                            {PHONE_ICON_KEYS.map(k => <option key={k} value={k}>{PHONE_GLYPHS[k]} {k}</option>)}
                        </select>
                    </Field>
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('hc.inCallTranscriptScriptedCall', 'In-call transcript (scripted call conversations play on the phone\'s call screen).')}</p>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="End Call label"><input className={inputCls} value={ui.phoneCallEndLabel ?? ''} placeholder={t('hc.endCall', 'End Call')} onChange={e => onUpdate({ phoneCallEndLabel: e.target.value || undefined })} /></Field>
                        <ColorField label="End Call color" value={ui.phoneCallEndColor ?? '#ef4444'} onChange={v => onUpdate({ phoneCallEndColor: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <ColorField label="Call timer" value={ui.phoneCallTimerColor ?? '#ffffffb3'} onChange={v => onUpdate({ phoneCallTimerColor: v })} />
                        <Field label='"Calling…" text'><input className={inputCls} value={ui.phoneCallDialingText ?? ''} placeholder="Calling…" onChange={e => onUpdate({ phoneCallDialingText: e.target.value || undefined })} /></Field>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <ColorField label="Their line bubble" value={ui.phoneCallLineIncomingColor ?? '#2a2f3a'} onChange={v => onUpdate({ phoneCallLineIncomingColor: v })} />
                        <ColorField label="Your line bubble" value={ui.phoneCallLineOutgoingColor ?? '#2f6bff'} onChange={v => onUpdate({ phoneCallLineOutgoingColor: v })} />
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('hc.wallpapersSettingsApp', 'Wallpapers & Settings app')}>
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('hc.givePlayersWallpapersToChoose', 'Give players wallpapers to choose from — a')} <b>{t('hc.settingsApp', 'Settings app')}</b> {t('hc.appearsOnThePhoneAdd', 'appears on the phone (add an app button that opens "Settings"). Their pick is remembered in saves. Wallpapers with conditions unlock over the story.')}</p>
                    <Field label="Settings header"><input className={inputCls} value={ui.phoneSettingsHeader ?? ''} placeholder="Settings" onChange={e => onUpdate({ phoneSettingsHeader: e.target.value || undefined })} /></Field>
                    <Field label="Wallpaper section label"><input className={inputCls} value={ui.phoneSettingsWallpaperLabel ?? ''} placeholder="Wallpaper" onChange={e => onUpdate({ phoneSettingsWallpaperLabel: e.target.value || undefined })} /></Field>
                    {(ui.phoneWallpapers || []).map((w, i) => (
                        <div key={w.id} className="border border-[var(--border-subtle)] rounded p-2 space-y-1.5 mb-1.5">
                            <div className="flex items-center gap-1">
                                <input className={inputCls} value={w.name ?? ''} placeholder={t('hc.nameOptional', 'Name (optional)')} onChange={e => onUpdate({ phoneWallpapers: (ui.phoneWallpapers || []).map((x, xi) => xi === i ? { ...x, name: e.target.value || undefined } : x) })} />
                                <button onClick={() => onUpdate({ phoneWallpapers: (ui.phoneWallpapers || []).filter((_, xi) => xi !== i) })} className="p-1 text-red-400 hover:text-red-300" title="Remove"><TrashIcon className="w-4 h-4" /></button>
                            </div>
                            <Field label="Image / video">
                                <PhoneBgSelect project={project} value={w.image} onChange={ref => onUpdate({ phoneWallpapers: (ui.phoneWallpapers || []).map((x, xi) => xi === i ? { ...x, image: ref || x.image } : x) })} />
                            </Field>
                            <ConditionsEditor collapsible title={t('hc.unlockedWhen', 'Unlocked when…')} conditions={w.conditions || []} project={project} onChange={cond => onUpdate({ phoneWallpapers: (ui.phoneWallpapers || []).map((x, xi) => xi === i ? { ...x, conditions: cond && cond.length ? cond : undefined } : x) })} />
                        </div>
                    ))}
                    <button onClick={() => onUpdate({ phoneWallpapers: [...(ui.phoneWallpapers || []), { id: `wp-${Math.random().toString(36).slice(2, 9)}`, image: { type: 'image', id: '' as VNID } }] })} className="w-full p-1.5 text-xs rounded bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] flex items-center justify-center gap-1"><PlusIcon className="w-3 h-3" /> {t('hc.addWallpaperOption', 'Add wallpaper option')}</button>
                </CollapsibleSection>

                <CollapsibleSection title={t('hc.homeWidgets', 'Home widgets')}>
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">Decorative pieces on the phone's home screen: a clock (uses the status-bar clock text), custom text (supports {'{variables}'}), or an image. Positioned in % of the phone screen.</p>
                    {(ui.phoneHomeWidgets || []).map((w, i) => {
                        const patchW = (patch: any) => onUpdate({ phoneHomeWidgets: (ui.phoneHomeWidgets || []).map((x, xi) => xi === i ? { ...x, ...patch } : x) });
                        return (
                            <div key={w.id} className="border border-[var(--border-subtle)] rounded p-2 space-y-1.5 mb-1.5">
                                <div className="flex items-center gap-1">
                                    <select className={inputCls} value={w.type} onChange={e => patchW({ type: e.target.value })}>
                                        <option value="clock">{t('hc.clock', '🕐 Clock')}</option>
                                        <option value="text">Text</option>
                                        <option value="image">Image</option>
                                    </select>
                                    <button onClick={() => onUpdate({ phoneHomeWidgets: (ui.phoneHomeWidgets || []).filter((_, xi) => xi !== i) })} className="p-1 text-red-400 hover:text-red-300" title="Remove"><TrashIcon className="w-4 h-4" /></button>
                                </div>
                                {w.type === 'text' && <input className={inputCls} value={w.text ?? ''} placeholder={t('hc.textVariablesWork', 'Text ({variables} work)')} onChange={e => patchW({ text: e.target.value })} />}
                                {w.type === 'image' && <PhoneBgSelect project={project} value={w.image || null} onChange={ref => patchW({ image: ref })} />}
                                <div className="grid grid-cols-4 gap-1">
                                    <NumInput label="X %" value={w.x} fallback={10} min={0} max={100} onChange={v => patchW({ x: v })} />
                                    <NumInput label="Y %" value={w.y} fallback={8} min={0} max={100} onChange={v => patchW({ y: v })} />
                                    <NumInput label="W %" value={w.width} fallback={80} min={2} max={100} onChange={v => patchW({ width: v })} />
                                    <NumInput label="H %" value={w.height} fallback={10} min={2} max={100} onChange={v => patchW({ height: v })} />
                                </div>
                                {w.type !== 'image' && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <ColorField label="Color" value={w.color ?? '#ffffff'} onChange={v => patchW({ color: v })} />
                                        <div><FontEditor label="Font" font={(w.font as VNFontSettings) ?? defaultFontSettings} onFontChange={(prop, value) => patchW({ font: { ...((w.font as VNFontSettings) ?? defaultFontSettings), [prop]: value } })} /></div>
                                    </div>
                                )}
                                <ConditionsEditor collapsible title={t('hc.showWhen', 'Show when…')} conditions={w.conditions || []} project={project} onChange={cond => patchW({ conditions: cond && cond.length ? cond : undefined })} />
                            </div>
                        );
                    })}
                    <button onClick={() => onUpdate({ phoneHomeWidgets: [...(ui.phoneHomeWidgets || []), { id: `hw-${Math.random().toString(36).slice(2, 9)}`, type: 'clock' as const, x: 10, y: 8, width: 80, height: 12 }] })} className="w-full p-1.5 text-xs rounded bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] flex items-center justify-center gap-1"><PlusIcon className="w-3 h-3" /> {t('hc.addWidget', 'Add widget')}</button>
                </CollapsibleSection>

                <CollapsibleSection title={t('hc.mapApp', 'Map app')}>
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('hc.freeRoamTravelFromThe', 'Free-roam travel from the phone: the player opens the Map app and taps a location to go there. Design maps in')} <b>{t('hc.systemsMapsTravel', 'Systems → Maps & Travel')}</b>{t('hc.browsingIsAlwaysAllowed', "; browsing is always allowed, traveling honors the gate below.")}</p>
                    <Field label="Map shown in the app">
                        <select className={inputCls} value={ui.phoneMapId || ''} onChange={e => onUpdate({ phoneMapId: (e.target.value || null) as any })}>
                            <option value="">{t('hc.noneMapAppDisabled', 'None (Map app disabled)')}</option>
                            {(Object.values(project.maps || {}) as any[]).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </Field>
                    <Field label="Header"><input className={inputCls} value={ui.phoneMapHeader ?? ''} placeholder="Map" onChange={e => onUpdate({ phoneMapHeader: e.target.value || undefined })} /></Field>
                    <ConditionsEditor collapsible title={t('hc.travelAllowedWhen', 'Travel allowed when…')} hint="Leave empty = always. E.g. add a 'can_travel is true' condition and flip that variable with Set Variable when the story permits moving." conditions={ui.phoneMapTravelConditions || []} project={project} onChange={cond => onUpdate({ phoneMapTravelConditions: cond && cond.length ? cond : undefined })} />
                    <Field label="Blocked-travel message"><input className={inputCls} value={ui.phoneMapTravelLockedText ?? ''} placeholder={t('hc.youCanTLeaveRight', 'You can\'t leave right now.')} onChange={e => onUpdate({ phoneMapTravelLockedText: e.target.value || undefined })} /></Field>
                </CollapsibleSection>

                <CollapsibleSection title={t('hc.galleryApp', 'Gallery app')}>
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('hc.thePhoneSGallery', 'The phone\'s Gallery:')} <b>{t('hc.photos', "Photos")}</b> {t('hc.collectsEveryPhotoCharactersText', "collects every photo characters text the player;")} <b>{t('hc.collection', 'Collection')}</b> {t('hc.mirrorsTheProjectSCg', 'mirrors the project\'s CG Gallery (same unlocks). Open it with an app button set to "Gallery app".')}</p>
                    <Field label="Header"><input className={inputCls} value={ui.phoneGalleryHeader ?? ''} placeholder="Gallery" onChange={e => onUpdate({ phoneGalleryHeader: e.target.value || undefined })} /></Field>
                    <div className="grid grid-cols-2 gap-2">
                        <NumInput label="Columns" value={ui.phoneGalleryColumns} fallback={3} min={1} max={6} onChange={v => onUpdate({ phoneGalleryColumns: v })} />
                        <Field label="Show CG tab">
                            <select className={inputCls} value={ui.phoneGalleryShowCG === false ? 'no' : 'yes'} onChange={e => onUpdate({ phoneGalleryShowCG: e.target.value === 'no' ? false : undefined })}>
                                <option value="yes">{t('hc.yesWhenACgGallery', 'Yes (when a CG gallery exists)')}</option>
                                <option value="no">{t('hc.noPhotosOnly', 'No (photos only)')}</option>
                            </select>
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Photos tab label"><input className={inputCls} value={ui.phoneGalleryPhotosLabel ?? ''} placeholder="Photos" onChange={e => onUpdate({ phoneGalleryPhotosLabel: e.target.value || undefined })} /></Field>
                        <Field label="CG tab label"><input className={inputCls} value={ui.phoneGalleryCGLabel ?? ''} placeholder="Collection" onChange={e => onUpdate({ phoneGalleryCGLabel: e.target.value || undefined })} /></Field>
                    </div>
                    <Field label="Empty text"><input className={inputCls} value={ui.phoneGalleryEmptyText ?? ''} placeholder={t('hc.noPhotosYet', 'No photos yet')} onChange={e => onUpdate({ phoneGalleryEmptyText: e.target.value || undefined })} /></Field>
                </CollapsibleSection>

                <CollapsibleSection title={t('hc.messagesAppThreadsInbox', 'Messages app (threads inbox)')}>
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('hc.theMessagesAppOpensTo', "The Messages app opens to an inbox — one row per conversation with a preview and an unread pill; tapping a row opens that chat. Rows reuse the Contacts row colors.")}</p>
                    <Field label="Header"><input className={inputCls} value={ui.phoneMessagesHeader ?? ''} placeholder="Messages" onChange={e => onUpdate({ phoneMessagesHeader: e.target.value || undefined })} /></Field>
                    <Field label="Empty text"><input className={inputCls} value={ui.phoneMessagesEmptyText ?? ''} placeholder={t('hc.noMessagesYet', 'No messages yet')} onChange={e => onUpdate({ phoneMessagesEmptyText: e.target.value || undefined })} /></Field>
                    <Field label="New-conversation hint"><input className={inputCls} value={ui.phoneMessagesNewHint ?? ''} placeholder={t('hc.newConversation', 'New conversation')} onChange={e => onUpdate({ phoneMessagesNewHint: e.target.value || undefined })} /></Field>
                </CollapsibleSection>

                <CollapsibleSection title={t('hc.recentsHistory', 'Recents (history)')}>
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('hc.theCallLogViewOpened', 'The call log view, opened by a phone button with the "Show Phone History" action.')}</p>
                    <Field label="Header"><input className={inputCls} value={ui.phoneHistoryHeader ?? ''} placeholder="Recents" onChange={e => onUpdate({ phoneHistoryHeader: e.target.value })} /></Field>
                    <div className="grid grid-cols-2 gap-2">
                        <ColorField label="Row color" value={ui.phoneHistoryRowColor ?? '#ffffff10'} onChange={v => onUpdate({ phoneHistoryRowColor: v })} />
                        <ColorField label="Row text" value={ui.phoneHistoryTextColor ?? '#ffffff'} onChange={v => onUpdate({ phoneHistoryTextColor: v })} />
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Contacts">
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('hc.theContactsAppOpenIt', 'The Contacts app — open it with a phone button using the "Show Phone Contacts" action. Each contact offers Call + Message. Switch the canvas to the')} <b>{t('hc.contacts', 'Contacts')}</b> {t('hc.viewToDragResizeThe', 'view to drag/resize the list area.')}</p>
                    {ui.phoneContactsRegion && (
                        <button className="mb-1 text-[10px] px-2 py-1 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:bg-white/10" onClick={() => onUpdate({ phoneContactsRegion: undefined })}>{t('hc.resetListToFillThe', 'Reset list to fill the screen')}</button>
                    )}
                    <Field label="Header"><input className={inputCls} value={ui.phoneContactsHeader ?? ''} placeholder="Contacts" onChange={e => onUpdate({ phoneContactsHeader: e.target.value || undefined })} /></Field>
                    <div className="grid grid-cols-2 gap-2">
                        <ColorField label="Row color" value={ui.phoneContactRowColor ?? '#ffffff10'} onChange={v => onUpdate({ phoneContactRowColor: v })} />
                        <ColorField label="Row text" value={ui.phoneContactTextColor ?? '#ffffff'} onChange={v => onUpdate({ phoneContactTextColor: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Call button label"><input className={inputCls} value={ui.phoneContactCallLabel ?? ''} placeholder="Call" onChange={e => onUpdate({ phoneContactCallLabel: e.target.value || undefined })} /></Field>
                        <Field label="Message button label"><input className={inputCls} value={ui.phoneContactMessageLabel ?? ''} placeholder="Message" onChange={e => onUpdate({ phoneContactMessageLabel: e.target.value || undefined })} /></Field>
                    </div>
                    <FontEditor label="Contact name font" font={(ui.phoneContactNameFont as VNFontSettings) ?? defaultFontSettings} onFontChange={(prop, value) => onUpdate({ phoneContactNameFont: { ...((ui.phoneContactNameFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })} />
                    <FontEditor label="Contact status font" font={(ui.phoneContactStatusFont as VNFontSettings) ?? defaultFontSettings} onFontChange={(prop, value) => onUpdate({ phoneContactStatusFont: { ...((ui.phoneContactStatusFont as VNFontSettings) ?? defaultFontSettings), [prop]: value } })} />
                    <div className="mt-2 flex flex-col gap-2">
                        {(ui.phoneContacts || []).map((c, i) => {
                            const update = (patch: Partial<PhoneContact>) => onUpdate({ phoneContacts: (ui.phoneContacts || []).map((x, idx) => idx === i ? { ...x, ...patch } : x) });
                            return (
                                <div key={c.id} className="rounded border border-[var(--border-subtle)] p-2 flex flex-col gap-2" style={{ background: 'var(--bg-primary)' }}>
                                    <div className="flex items-center gap-2">
                                        <select className={inputCls + ' flex-1'} value={c.characterId || ''} onChange={e => update({ characterId: e.target.value as VNID })}>
                                            <option value="">{t('hc.pickACharacter', '— pick a character —')}</option>
                                            {(Object.values(project.characters) as any[]).map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                                        </select>
                                        <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]"><input type="checkbox" checked={!!c.pinned} onChange={e => update({ pinned: e.target.checked || undefined })} />Pin</label>
                                        <button onClick={() => onUpdate({ phoneContacts: (ui.phoneContacts || []).filter((_, idx) => idx !== i) })} className="text-red-400 hover:text-red-300 text-xs px-1" title="Remove">✕</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Field label="Name (optional)"><input className={inputCls} value={c.displayName ?? ''} placeholder={t('hc.characterName', '(character name)')} onChange={e => update({ displayName: e.target.value || undefined })} /></Field>
                                        <Field label="Status line"><input className={inputCls} value={c.statusText ?? ''} placeholder={t('hc.egAffection', 'e.g. Affection: {mia_love}')} onChange={e => update({ statusText: e.target.value || undefined })} /></Field>
                                    </div>
                                    <div className="flex gap-3 text-[10px] text-[var(--text-secondary)]">
                                        <label className="flex items-center gap-1"><input type="checkbox" checked={!!c.hideCall} onChange={e => update({ hideCall: e.target.checked || undefined })} />{t('hc.hideCall', 'Hide Call')}</label>
                                        <label className="flex items-center gap-1"><input type="checkbox" checked={!!c.hideMessage} onChange={e => update({ hideMessage: e.target.checked || undefined })} />{t('hc.hideMessage', 'Hide Message')}</label>
                                    </div>
                                    {c.characterId && <PhonePortraitPicker senderId={c.characterId} value={c.avatar} onChange={v => update({ avatar: v })} project={project} t={t} />}
                                    <Field label="Chat background (this thread)">
                                        <PhoneBgSelect project={project} cls={inputCls} value={c.chatBackground} onChange={v => update({ chatBackground: v })} />
                                    </Field>
                                    <CollapsibleSection title={t('hc.callConversations', 'Call conversations')} badge={String((c.callConversations || []).length)}
                                        summary={(c.callConversations || []).length ? undefined : 'none'}>
                                        <PhoneConversationListEditor entries={c.callConversations} onChange={list => update({ callConversations: list as any })} project={project} t={t} cls={inputCls} kind="call"
                                            studioTitle={`${c.displayName || (project.characters as any)[c.characterId]?.name || 'Contact'} — Call conversations`} />
                                    </CollapsibleSection>
                                    <CollapsibleSection title={t('hc.textConversations', 'Text conversations')} badge={String((c.textConversations || []).length)}
                                        summary={(c.textConversations || []).length ? undefined : 'none'}>
                                        <PhoneConversationListEditor entries={c.textConversations} onChange={list => update({ textConversations: list as any })} project={project} t={t} cls={inputCls} kind="text"
                                            studioTitle={`${c.displayName || (project.characters as any)[c.characterId]?.name || 'Contact'} — Text conversations`} />
                                    </CollapsibleSection>
                                    {!!c.callConversation?.lines?.length && (
                                        <CollapsibleSection title={t('hc.legacyCallConversation', '(Legacy) Call conversation')} summary={`${c.callConversation.lines.length} lines · always the fallback`}>
                                            <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('hc.thisSingleConversationPredatesThe', 'This single conversation predates the gated list above. It still plays when no list entry passes. Move it into the list to give it conditions.')}</p>
                                            <button className="mb-1 text-[10px] px-2 py-1 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:bg-white/10"
                                                onClick={() => update({ callConversations: [...(c.callConversations || []), { id: `pcv-${Date.now()}` as VNID, name: 'Default call', conversation: c.callConversation! }], callConversation: undefined })}>
                                                {t('hc.moveIntoTheList', 'Move into the list ↑')}
                                            </button>
                                            <PhoneCallConversationEditor conversation={c.callConversation} onChange={conv => update({ callConversation: conv?.lines?.length ? conv : undefined })} project={project} t={t} />
                                        </CollapsibleSection>
                                    )}
                                    {!c.callConversation?.lines?.length && !(c.callConversations || []).length && (
                                        <div>
                                            <div className="text-[10px] text-[var(--text-muted)] mb-0.5">{t('hc.whenCallIsTappedAfter', 'When "Call" is tapped (after the Calling… screen)')}</div>
                                            <ActionEditor action={c.callAction ?? { type: UIActionType.None } as VNUIAction} onActionChange={(a) => update({ callAction: a.type === UIActionType.None ? undefined : a })} />
                                        </div>
                                    )}
                                    <ConditionsEditor conditions={c.conditions} project={project} onChange={cond => update({ conditions: cond && cond.length ? cond : undefined })} collapsible title={t('hc.unlockConditions', 'Unlock conditions')} />
                                </div>
                            );
                        })}
                        <button onClick={() => onUpdate({ phoneContacts: [...(ui.phoneContacts || []), { id: `pc-${Date.now()}` as VNID, characterId: '' as VNID }] })} className="text-xs px-2 py-1 rounded border border-dashed border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">{t('hc.addContact', '+ Add contact')}</button>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('hc.soundsBackground', 'Sounds & background')}>
                    <Field label="Open sound">
                        <select className={inputCls} value={ui.phoneOpenSoundId || ''} onChange={e => onUpdate({ phoneOpenSoundId: (e.target.value || undefined) as any })}>
                            <option value="">None</option>
                            {(Object.values(project.audio || {}) as any[]).map(a => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                        </select>
                    </Field>
                    <Field label="Close sound">
                        <select className={inputCls} value={ui.phoneCloseSoundId || ''} onChange={e => onUpdate({ phoneCloseSoundId: (e.target.value || undefined) as any })}>
                            <option value="">None</option>
                            {(Object.values(project.audio || {}) as any[]).map(a => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                        </select>
                    </Field>
                    <Field label="Button tap sound">
                        <select className={inputCls} value={ui.phoneTapSoundId || ''} onChange={e => onUpdate({ phoneTapSoundId: (e.target.value || undefined) as any })}>
                            <option value="">None</option>
                            {(Object.values(project.audio || {}) as any[]).map(a => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                        </select>
                    </Field>
                    <Field label="Wallpaper (home / apps)">
                        <PhoneBgSelect project={project} cls={inputCls} value={ui.phoneWallpaperImage} onChange={v => onUpdate({ phoneWallpaperImage: v })} />
                    </Field>
                    <Field label="Chat background (default for all threads)">
                        <PhoneBgSelect project={project} cls={inputCls} value={ui.phoneChatBackgroundImage} onChange={v => onUpdate({ phoneChatBackgroundImage: v })} />
                    </Field>
                    <p className="text-[10px] text-[var(--text-muted)]">{t('hc.backgroundsCanBeAnImage', 'Backgrounds can be an image or a looping video. Videos play muted on a loop.')}</p>
                </CollapsibleSection>

                <CollapsibleSection title={t('hc.portraitsAvatars', 'Portraits & avatars')}>
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('hc.useContainASmallerSize', 'Use "contain" + a smaller size so a tall full-body sprite fits without cropping.')}</p>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Contacts avatar size (em)"><input type="number" step="0.1" min="1" max="6" className={inputCls} value={ui.phoneContactAvatarSize ?? 2.4} onChange={e => onUpdate({ phoneContactAvatarSize: parseFloat(e.target.value) || undefined })} /></Field>
                        <Field label="Contacts avatar fit"><select className={inputCls} value={ui.phoneContactAvatarFit || 'cover'} onChange={e => onUpdate({ phoneContactAvatarFit: e.target.value as any })}><option value="cover">{t('hc.coverCrop', 'Cover (crop)')}</option><option value="contain">{t('hc.containWhole', 'Contain (whole)')}</option></select></Field>
                        <Field label="Chat avatar size (em)"><input type="number" step="0.1" min="1" max="6" className={inputCls} value={ui.phoneChatAvatarSize ?? 2.2} onChange={e => onUpdate({ phoneChatAvatarSize: parseFloat(e.target.value) || undefined })} /></Field>
                        <Field label="Chat avatar fit"><select className={inputCls} value={ui.phoneChatAvatarFit || 'cover'} onChange={e => onUpdate({ phoneChatAvatarFit: e.target.value as any })}><option value="cover">{t('hc.coverCrop', 'Cover (crop)')}</option><option value="contain">{t('hc.containWhole', 'Contain (whole)')}</option></select></Field>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                        <Field label="Call portrait size (%)"><input type="number" step="1" min="8" max="60" className={inputCls} value={ui.phoneCallPortraitSize ?? 22} onChange={e => onUpdate({ phoneCallPortraitSize: parseFloat(e.target.value) || undefined })} /></Field>
                        <Field label="Call portrait fit"><select className={inputCls} value={ui.phoneCallPortraitFit || 'cover'} onChange={e => onUpdate({ phoneCallPortraitFit: e.target.value as any })}><option value="cover">{t('hc.coverCrop', 'Cover (crop)')}</option><option value="contain">{t('hc.containWhole', 'Contain (whole)')}</option></select></Field>
                    </div>
                    <Field label="Call portrait focus (CSS object-position)"><input className={inputCls} value={ui.phoneCallPortraitPosition ?? ''} placeholder="center top" onChange={e => onUpdate({ phoneCallPortraitPosition: e.target.value || undefined })} /></Field>
                </CollapsibleSection>
            </div>
        );
    }

    /* Confirm Dialogs properties */
    if (element === 'confirmDialogs') {
        const cd = ui.confirmDialogs || {} as VNConfirmDialogSettings;
        const updateCD = (patch: Partial<VNConfirmDialogSettings>) => onUpdate({ confirmDialogs: { ...cd, ...patch } });

        const variantKey = (confirmVariant || 'newGame') as ConfirmVariant; // 'quit' | 'newGame' | 'eraseSave'
        const vDefaults = CONFIRM_TEXT_DEFAULTS[variantKey];
        // Context-aware text accessors — edit ONLY the selected variant's strings.
        const titleVal = ((cd as any)[variantKey + 'Title'] as string) ?? '';
        const msgVal = ((cd as any)[variantKey + 'Message'] as string) ?? '';
        const confirmVal = ((cd as any)[variantKey + 'ConfirmLabel'] as string) ?? '';
        const cancelVal = ((cd as any)[variantKey + 'CancelLabel'] as string) ?? '';
        const setText = (field: 'Title' | 'Message' | 'ConfirmLabel' | 'CancelLabel', val: string) => {
            const key = (variantKey + field) as keyof VNConfirmDialogSettings;
            updateCD({ [key]: val || undefined } as Partial<VNConfirmDialogSettings>);
        };
        // Per-variant STYLE: read from the merged effective look, write to this variant's override
        // bag so each confirmation (Quit / New Game / Erase Save) is fully independent.
        const eff = { ...cd, ...(cd.variants?.[variantKey] || {}) } as VNConfirmVariantStyle & VNConfirmDialogSettings;
        const updateCDStyle = (patch: Partial<VNConfirmVariantStyle>) => updateCD({
            variants: { ...(cd.variants || {}), [variantKey]: { ...(cd.variants?.[variantKey] || {}), ...patch } },
        });
        return (
            <div className="p-3 space-y-2">
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1 mb-1">{t('inGameUi.confirmationDialogs')}</h4>
                <p className="text-xs text-[var(--text-secondary)]">
                    {t('hc.shownWhenThePlayerQuits', 'Shown when the player quits to title or starts a new game while a game is in progress.')}
                </p>

                {/* Variant selector — chooses which confirmation you're editing AND previewing. */}
                <div className="flex gap-1 bg-[var(--bg-tertiary)] rounded-lg p-1">
                    {CONFIRM_VARIANTS.map(v => (
                        <button key={v} onClick={() => onConfirmVariantChange?.(v)}
                            className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${confirmVariant === v ? 'bg-[var(--accent-lavender)] text-white shadow' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                            {confirmVariantLabel(v, t)}
                        </button>
                    ))}
                </div>

                {/* Free / independent layout (per-variant) */}
                <CollapsibleSection title={t('inGameUi.freeLayout', 'Free layout (drag & resize)')}>
                    <Field label={t('inGameUi.independentLayout')}>
                        <input
                            type="checkbox"
                            checked={eff.independentLayout ?? false}
                            onChange={e => {
                                const on = e.target.checked;
                                if (on && !eff.boxRect) {
                                    // Seed sensible defaults so the box + buttons appear placed, then drag.
                                    updateCDStyle({
                                        independentLayout: true,
                                        boxRect: { x: 32, y: 26, width: 36, height: 34 },
                                        cancelRect: { x: 34, y: 50, width: 14, height: 8 },
                                        confirmRect: { x: 52, y: 50, width: 14, height: 8 },
                                    });
                                } else {
                                    updateCDStyle({ independentLayout: on });
                                }
                            }}
                            className="cursor-pointer"
                        />
                        <span className="text-xs text-[var(--text-secondary)] ml-2">{t('inGameUi.confirmFreeHint', 'Drag & resize the box and each button on the canvas (applies to the selected confirmation).')}</span>
                    </Field>
                </CollapsibleSection>

                {/* Context-aware text for the SELECTED confirmation only */}
                <CollapsibleSection title={`${confirmVariantLabel(variantKey, t)} — ${t('inGameUi.textAndButtons', 'text & buttons')}`} defaultOpen>
                    <div className="space-y-2">
                        <Field label={t('inGameUi.title')}>
                            <input className={inputCls} value={titleVal} placeholder={vDefaults.title}
                                onChange={e => setText('Title', e.target.value)} />
                        </Field>
                        <Field label={t('inGameUi.message')}>
                            <textarea className={inputCls} rows={2} value={msgVal} placeholder={vDefaults.message}
                                onChange={e => setText('Message', e.target.value)} />
                        </Field>
                        <div className="grid grid-cols-2 gap-2">
                            <Field label={t('inGameUi.confirmButton')}>
                                <input className={inputCls} value={confirmVal} placeholder={vDefaults.confirm}
                                    onChange={e => setText('ConfirmLabel', e.target.value)} />
                            </Field>
                            <Field label={t('inGameUi.cancelButton')}>
                                <input className={inputCls} value={cancelVal} placeholder={vDefaults.cancel}
                                    onChange={e => setText('CancelLabel', e.target.value)} />
                            </Field>
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)]">{t('inGameUi.confirmPerVariantStyleHint', 'The appearance, buttons, fonts and layout below apply to the SELECTED confirmation only — Quit, New Game and Erase Save are styled independently.')}</p>
                    </div>
                </CollapsibleSection>

                {/* Visual styling (per-variant) */}
                <CollapsibleSection title={t('inGameUi.dialogBoxAppearance')}>
                    <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <ColorField label={t('inGameUi.colorBackground')} value={eff.backgroundColor ?? '#0f172a'} onChange={v => updateCDStyle({ backgroundColor: v })} />
                        <OpacityField label={t('inGameUi.opacity')} value={eff.backgroundOpacity ?? 92} onChange={v => updateCDStyle({ backgroundOpacity: v })} />
                    </div>
                    <NumInput label={t('inGameUi.borderRadius')} value={eff.borderRadius} fallback={12} min={0} onChange={v => updateCDStyle({ borderRadius: v })} />
                    <NumInput label={t('inGameUi.dialogWidth')} value={eff.dialogWidth} fallback={0} min={0} max={1200} onChange={v => updateCDStyle({ dialogWidth: v || undefined })} />
                    <NumInput label={t('inGameUi.innerPadding')} value={eff.dialogPadding} fallback={32} min={0} max={100} onChange={v => updateCDStyle({ dialogPadding: v })} />
                    <ColorField label={t('inGameUi.overlayColor')} value={eff.overlayColor ?? '#000000'} onChange={v => updateCDStyle({ overlayColor: `${v}bf` })} />

                    <Field label={t('inGameUi.backgroundImage')}>
                        <select className={inputCls} value={eff.backgroundImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCDStyle({ backgroundImage: null }); return; }
                                updateCDStyle({ backgroundImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">{t('inGameUi.none')}</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    {eff.backgroundImage && (
                        <Field label={t('inGameUi.imageSizing')}>
                            <select className={inputCls} value={eff.backgroundSizeMode ?? 'stretch'}
                                onChange={e => updateCDStyle({ backgroundSizeMode: e.target.value as any })}>
                                <option value="stretch">{t('inGameUi.sizeStretch')}</option>
                                <option value="contain">{t('inGameUi.sizeContain')}</option>
                                <option value="cover">{t('inGameUi.sizeCover')}</option>
                                <option value="nine-slice">{t('inGameUi.sizeNineSlice')}</option>
                            </select>
                        </Field>
                    )}
                    {eff.backgroundImage && eff.backgroundSizeMode === 'nine-slice' && (
                        <NumInput label={t('inGameUi.sliceSize')} value={eff.backgroundSlice} fallback={20} min={1} onChange={v => updateCDStyle({ backgroundSlice: v })} />
                    )}

                    <Field label={t('inGameUi.borderImage')}>
                        <select className={inputCls} value={eff.borderImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCDStyle({ borderImage: null }); return; }
                                updateCDStyle({ borderImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">{t('inGameUi.none')}</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    {eff.borderImage && (
                        <NumInput label={t('inGameUi.borderPadding')} value={eff.borderPadding} fallback={12} min={0} onChange={v => updateCDStyle({ borderPadding: v })} />
                    )}
                    </div>
                </CollapsibleSection>

                {/* Button styling (per-variant) */}
                <CollapsibleSection title={t('inGameUi.buttonStyling')}>
                    <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <ColorField label={t('inGameUi.confirmBtnColor')} value={eff.confirmButtonColor ?? '#ec4899'} onChange={v => updateCDStyle({ confirmButtonColor: v })} />
                        <ColorField label={t('inGameUi.cancelBtnColor')} value={eff.cancelButtonColor ?? '#1e293b'} onChange={v => updateCDStyle({ cancelButtonColor: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <ColorField label={t('inGameUi.confirmHoverColor')} value={eff.confirmHoverColor ?? ''} onChange={v => updateCDStyle({ confirmHoverColor: v || undefined })} />
                        <ColorField label={t('inGameUi.cancelHoverColor')} value={eff.cancelHoverColor ?? '#334155'} onChange={v => updateCDStyle({ cancelHoverColor: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <NumInput label={t('inGameUi.buttonPadding')} value={eff.buttonPadding} fallback={8} min={0} max={60} onChange={v => updateCDStyle({ buttonPadding: v })} />
                        <NumInput label={t('inGameUi.buttonRadius')} value={eff.buttonBorderRadius} fallback={8} min={0} onChange={v => updateCDStyle({ buttonBorderRadius: v })} />
                    </div>

                    <Field label={t('inGameUi.confirmButtonImage')}>
                        <select className={inputCls} value={eff.confirmButtonImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCDStyle({ confirmButtonImage: null }); return; }
                                updateCDStyle({ confirmButtonImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">{t('inGameUi.noneSolidColor')}</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label={t('inGameUi.cancelButtonImage')}>
                        <select className={inputCls} value={eff.cancelButtonImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCDStyle({ cancelButtonImage: null }); return; }
                                updateCDStyle({ cancelButtonImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">{t('inGameUi.noneSolidColor')}</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label={t('inGameUi.confirmHoverImage')}>
                        <select className={inputCls} value={eff.confirmHoverImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCDStyle({ confirmHoverImage: null }); return; }
                                updateCDStyle({ confirmHoverImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">{t('inGameUi.none')}</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label={t('inGameUi.cancelHoverImage')}>
                        <select className={inputCls} value={eff.cancelHoverImage?.id || ''}
                            onChange={e => {
                                if (!e.target.value) { updateCDStyle({ cancelHoverImage: null }); return; }
                                updateCDStyle({ cancelHoverImage: { type: 'image', id: e.target.value as any } });
                            }}>
                            <option value="">{t('inGameUi.none')}</option>
                            {allImages.map((img: any) => (
                                <option key={img.id} value={img.id}>{img.name || img.id}</option>
                            ))}
                        </select>
                    </Field>
                    {(eff.confirmButtonImage || eff.cancelButtonImage) && (
                        <>
                            <Field label={t('inGameUi.buttonImageSizing')}>
                                <select className={inputCls} value={eff.buttonSizeMode ?? 'stretch'}
                                    onChange={e => updateCDStyle({ buttonSizeMode: e.target.value as any })}>
                                    <option value="stretch">{t('inGameUi.sizeStretch')}</option>
                                    <option value="contain">{t('inGameUi.sizeContain')}</option>
                                    <option value="cover">{t('inGameUi.sizeCover')}</option>
                                    <option value="nine-slice">{t('inGameUi.sizeNineSlice')}</option>
                                </select>
                            </Field>
                            {eff.buttonSizeMode === 'nine-slice' && (
                                <NumInput label={t('inGameUi.buttonSlice')} value={eff.buttonSlice} fallback={10} min={1} onChange={v => updateCDStyle({ buttonSlice: v })} />
                            )}
                        </>
                    )}
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title={t('inGameUi.groupFonts', 'Fonts')}>
                    <div className="space-y-2">
                        <FontEditor
                            label={t('inGameUi.titleFont')}
                            font={eff.titleFont ?? defaultFontSettings}
                            onFontChange={(prop, value) => updateCDStyle({ titleFont: { ...(eff.titleFont ?? defaultFontSettings), [prop]: value } })}
                            defaultAlign="center"
                        />
                        <FontEditor
                            label={t('inGameUi.messageFont')}
                            font={eff.messageFont ?? defaultFontSettings}
                            onFontChange={(prop, value) => updateCDStyle({ messageFont: { ...(eff.messageFont ?? defaultFontSettings), [prop]: value } })}
                            defaultAlign="center"
                        />
                        <FontEditor
                            label={t('inGameUi.buttonFont')}
                            font={eff.buttonFont ?? defaultFontSettings}
                            onFontChange={(prop, value) => updateCDStyle({ buttonFont: { ...(eff.buttonFont ?? defaultFontSettings), [prop]: value } })}
                            defaultAlign="center"
                        />
                    </div>
                </CollapsibleSection>
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
    // The editor is composed of three independently-renderable parts: the element tree/list (left),
    // the canvas (center), and the properties (right). These flags let a host render a subset — e.g.
    // a popped-out window showing only the canvas — while another shows the tree + properties.
    showTree?: boolean;
    showCanvas?: boolean;
    showProperties?: boolean;
}

const InGameUIEditor: React.FC<InGameUIEditorProps> = ({ project, showTree = true, showCanvas = true, showProperties = true }) => {
    const { t } = useTranslation('ui');
    const { dispatch } = useProject();
    // Seed shared view-state from a cross-window snapshot (set when this is a popped-out In-Game part).
    const seedInGame = (typeof window !== 'undefined' ? (window as any).__FLOURISH_INGAME_STATE__ : null) as InGameUIState | null;
    const [selectedElement, setSelectedElement] = useState<InGameUIElement | null>((seedInGame?.selectedElement as InGameUIElement) ?? 'dialogueBox');
    const [selectedThemeId, setSelectedThemeId] = useState<VNID | null>(seedInGame?.selectedThemeId ?? null);
    // Custom scene transitions: which one is being edited + a nonce that (re)plays the canvas preview.
    const [selectedTransitionId, setSelectedTransitionId] = useState<VNID | null>(null);
    const [transitionPreviewNonce, setTransitionPreviewNonce] = useState(0);
    // Which confirmation the preview shows (Quit vs New Game). Default to New Game so it's visible.
    const [confirmPreviewVariant, setConfirmPreviewVariant] = useState<ConfirmVariant>((seedInGame?.confirmPreviewVariant as ConfirmVariant) ?? 'newGame');
    // Which phone "view" the canvas previews so each dynamic surface can be seen + themed live.
    const [phonePreviewView, setPhonePreviewView] = useState<'phone' | 'contacts' | 'notification' | 'badge' | 'call'>((seedInGame?.phonePreviewView as any) ?? 'phone');
    const [showSnapGuides, setShowSnapGuides] = useState(false);
    // Smart snapping (default ON; Alt bypasses per-drag) + live alignment guides for the canvas.
    const [snapEnabled, setSnapEnabled] = useState(false);
    const [inGameSnapGuides, setInGameSnapGuides] = useState<SnapGuide[]>([]);
    const stageRef = useRef<HTMLDivElement>(null);
    const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

    // ── Cross-window sync of the shared view-state, so the popped-out canvas/properties windows and
    // the tree in the main editor all agree on the selected surface + how it's previewed. Each window
    // BROADCASTS while focused and ADOPTS others' updates while not focused (no feedback loop). ──
    const isFocusedRef = useRef<boolean>(typeof document !== 'undefined' ? document.hasFocus() : false);
    useEffect(() => {
        const onFocus = () => { isFocusedRef.current = true; };
        const onBlur = () => { isFocusedRef.current = false; };
        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);
        return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); };
    }, []);
    useEffect(() => {
        const state: InGameUIState = { selectedElement, selectedThemeId, confirmPreviewVariant, phonePreviewView };
        (window as any).__FLOURISH_INGAME_STATE__ = state;
        if (isFocusedRef.current) syncInGameState(state);
    }, [selectedElement, selectedThemeId, confirmPreviewVariant, phonePreviewView]);
    useEffect(() => {
        onInGameStateUpdate((s) => {
            if (isFocusedRef.current || !s) return;
            (window as any).__FLOURISH_INGAME_STATE__ = s;
            setSelectedElement((s.selectedElement as InGameUIElement) ?? null);
            setSelectedThemeId(s.selectedThemeId ?? null);
            setConfirmPreviewVariant(s.confirmPreviewVariant as ConfirmVariant);
            setPhonePreviewView((s.phonePreviewView as any) ?? 'phone');
        });
    }, []);

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
    const phoneRect = useMemo(() => getPhoneRect(ui, gameW, gameH), [ui, gameW, gameH]);
    const phoneButtonRects = useMemo(() => getPhoneButtonRects(ui, gameW, gameH), [ui, gameW, gameH]);

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

    const handleDragPhone = useCallback((u: { x: number; y: number; width: number; height: number }) => {
        // Resize/move reports the on-screen (scaled) size; store the BASE width/height so the scale
        // slider stays an independent multiplier (rect = base × scale).
        const scale = (ui.phoneScale ?? 100) / 100 || 1;
        updateUI({ phoneX: u.x, phoneY: u.y, phoneWidth: u.width / scale, phoneHeight: u.height / scale });
    }, [updateUI, ui.phoneScale]);

    // Drag/resize a free-layout phone app button — convert canvas-% back to phone-screen-%.
    const handleDragPhoneButton = useCallback((id: string, u: { x: number; y: number; width: number; height: number }) => {
        const phone = getPhoneRect(ui, gameW, gameH);
        if (!phone.width || !phone.height) return;
        const x = ((u.x - phone.x) / phone.width) * 100;
        const y = ((u.y - phone.y) / phone.height) * 100;
        const width = (u.width / phone.width) * 100;
        const height = (u.height / phone.height) * 100;
        updateUI({ phoneButtons: (ui.phoneButtons || []).map(b => b.id === id ? { ...b, x, y, width, height } : b) });
    }, [updateUI, ui, gameW, gameH]);

    // Drag/resize the badge — writes its position AND size (size derived from the dragged box height).
    const handleDragBadge = useCallback((u: { x: number; y: number; width: number; height: number }) => {
        const sizePx = Math.max(6, Math.min(96, Math.round((u.height / 100) * gameH)));
        updateUI({ phoneBadgeX: u.x, phoneBadgeY: u.y, phoneBadgeSize: sizePx });
    }, [updateUI, gameH]);
    const handleDragBanner = useCallback((u: { x: number; y: number }) => {
        updateUI({ phoneNotifX: u.x, phoneNotifY: u.y });
    }, [updateUI]);
    // Drag/resize the incoming-call caller portrait — writes free position (screen-%) + size (% of width).
    const handleDragCallPortrait = useCallback((u: { x: number; y: number; width: number; height: number }) => {
        updateUI({ phoneCallPortraitX: Math.round(u.x), phoneCallPortraitY: Math.round(u.y), phoneCallPortraitSize: Math.max(8, Math.min(60, Math.round(u.width))) });
    }, [updateUI]);
    // Drag/resize the contacts list region — convert canvas-% back to phone-screen-% (like app buttons).
    const handleDragContactsRegion = useCallback((u: { x: number; y: number; width: number; height: number }) => {
        const phone = getPhoneRect(ui, gameW, gameH);
        if (!phone.width || !phone.height) return;
        updateUI({ phoneContactsRegion: {
            x: ((u.x - phone.x) / phone.width) * 100,
            y: ((u.y - phone.y) / phone.height) * 100,
            width: (u.width / phone.width) * 100,
            height: (u.height / phone.height) * 100,
        } });
    }, [updateUI, ui, gameW, gameH]);

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
    // Free-layout phone app buttons: show the phone as static context + one draggable per button
    // (so buttons drag/resize cleanly without lagging behind the shell). Mirrors quickMenuIndependent.
    const phoneButtonsIndependent = selectedElement === 'phone' && phonePreviewView === 'phone' && ui.phoneButtonLayout === 'free';

    // Confirm-dialog free layout: drag/resize the box + each button independently (screen-%), PER variant.
    const confirmEff = { ...(ui.confirmDialogs || {}), ...(ui.confirmDialogs?.variants?.[confirmPreviewVariant] || {}) };
    const confirmIndependent = selectedElement === 'confirmDialogs' && !!confirmEff.independentLayout && !!confirmEff.boxRect;
    const handleDragConfirmRect = useCallback((which: 'boxRect' | 'confirmRect' | 'cancelRect', u: { x: number; y: number; width: number; height: number }) => {
        const prev = ui.confirmDialogs || {};
        const vk = confirmPreviewVariant;
        const prevV = prev.variants?.[vk] || {};
        updateUI({ confirmDialogs: { ...prev, variants: { ...(prev.variants || {}), [vk]: { ...prevV, [which]: { x: u.x, y: u.y, width: u.width, height: u.height } } } } });
    }, [ui.confirmDialogs, confirmPreviewVariant, updateUI]);

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
        phone:         { rect: phoneRect,      handler: handleDragPhone,     preview: <PhonePreview ui={ui} project={project} /> },
    }), [dialogueRect, nameboxRect, choiceRect, inputRect, quickMenuRect, phoneRect, ui, project,
         handleDragDialogue, handleDragNamebox, handleDragChoice, handleDragInput, handleDragQuickMenu, handleDragPhone]);

    const activeEl = selectedElement && !isHidden(selectedElement) ? elementRects[selectedElement] ?? null : null;

    // Sibling rects (other chrome elements, % top-left) for alignment snapping of the active element.
    const inGameSiblings = useMemo(() => {
        const out: SnapRect[] = [];
        (Object.keys(elementRects) as InGameUIElement[]).forEach(k => {
            if (k === selectedElement || isHidden(k)) return;
            const r = elementRects[k]?.rect;
            if (r) out.push({ x: r.x, y: r.y, width: r.width, height: r.height });
        });
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [elementRects, selectedElement, ui.quickMenuPosition]);

    // Arrow-key nudge for the selected element (parity with StagingArea / MenuEditor).
    // 0.5% steps (Shift = 2%); Alt = resize width/height instead of moving.
    useEffect(() => {
        if (!activeEl) return;
        const onKey = (e: KeyboardEvent) => {
            if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
            e.preventDefault();
            const step = e.shiftKey ? 2 : 0.5;
            const r = activeEl.rect;
            if (e.altKey) {
                const dw = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
                const dh = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
                activeEl.handler({ x: r.x, y: r.y, width: Math.max(2, r.width + dw), height: Math.max(2, r.height + dh) });
            } else {
                const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
                const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
                activeEl.handler({ x: r.x + dx, y: r.y + dy, width: r.width, height: r.height });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [activeEl]);

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
            {/* Element list sidebar (Part 1: tree) */}
            {showTree && (
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
            )}

            {/* Canvas area (center) (Part 2: canvas) */}
            {showCanvas && (
            <div className="relative flex-1 min-w-0 flex items-center justify-center p-4 bg-[var(--bg-secondary)]">
                {isMultiWindowSupported() && !isManagerWindow() && (
                    <button
                        onClick={() => openManagerWindow('canvas')}
                        title={t('inGameUi.popOutCanvas', 'Open the canvas in its own window')}
                        className="absolute top-2 right-2 z-30 w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-black/40 hover:bg-black/60 border border-[var(--border-subtle)] transition-all"
                    >
                        ⧉
                    </button>
                )}
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
                    {/* Smart-snap alignment guides (live during a drag/resize). */}
                    <CanvasSnapGuides guides={inGameSnapGuides} />
                    {/* Player-screen boundary — marks exactly where the game frame cuts off. */}
                    <CanvasEdgeFrame />
                    {/* Smart-snap toggle. */}
                    <button
                        onMouseDown={(e) => { e.stopPropagation(); setSnapEnabled(s => !s); }}
                        title={t('inGameUi.snapTip', 'Smart snapping to edges, centers & other elements. Hold Alt while dragging to place freely.')}
                        className={`absolute top-2 left-2 z-30 px-2 py-0.5 rounded text-[10px] font-medium border ${snapEnabled ? 'bg-sky-500/80 border-sky-400/50 text-white' : 'bg-slate-800/80 border-slate-600/50 text-slate-200'}`}
                    >
                        {t('inGameUi.snap', 'Snap')}
                    </button>

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
                            snapEnabled={snapEnabled}
                            siblings={quickMenuButtonRects.filter(o => o.key !== b.key).map(o => ({ x: o.rect.x, y: o.rect.y, width: o.rect.width, height: o.rect.height }))}
                            onGuides={setInGameSnapGuides}
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
                    {activeEl && !quickMenuIndependent && !phoneButtonsIndependent && !(selectedElement === 'phone' && phonePreviewView !== 'phone') && (
                        <ResizableDraggable
                            x={activeEl.rect.x} y={activeEl.rect.y}
                            width={activeEl.rect.width} height={activeEl.rect.height}
                            anchorX={0} anchorY={0}
                            parentSize={stageSize}
                            isSelected={true}
                            onSelect={e => { e.stopPropagation(); }}
                            onUpdate={activeEl.handler}
                            snapGrid={1}
                            snapEnabled={snapEnabled}
                            siblings={inGameSiblings}
                            onGuides={setInGameSnapGuides}
                            label={selectedElement ? t('inGameUi.'+selectedElement) : undefined}
                        >
                            {activeEl.preview}
                        </ResizableDraggable>
                    )}

                    {/* Phone: the phone shell renders via the draggable path above; a view switcher lets
                        the author preview + theme the other dynamic surfaces (banner / badge / call). */}
                    {selectedElement === 'phone' && (
                        <>
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex gap-1 bg-[var(--bg-tertiary)] border border-[var(--border-default)] backdrop-blur-sm rounded-lg p-1 pointer-events-auto shadow-xl">
                                {([['phone', 'Phone'], ['contacts', 'Contacts'], ['notification', 'Banner'], ['badge', 'Badge'], ['call', 'Call']] as const).map(([v, lbl]) => (
                                    <button key={v} onClick={() => setPhonePreviewView(v)}
                                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${phonePreviewView === v ? 'bg-[var(--accent-lavender)] text-white shadow' : 'text-[var(--text-primary)] hover:bg-white/10'}`}>
                                        {lbl}
                                    </button>
                                ))}
                            </div>
                            {/* Free app-button editing: the phone shell is itself drag/resizable, with one
                                draggable per button layered on top (icon scales to the box via cq units). */}
                            {phoneButtonsIndependent && (
                                <ResizableDraggable
                                    x={phoneRect.x} y={phoneRect.y} width={phoneRect.width} height={phoneRect.height}
                                    anchorX={0} anchorY={0} parentSize={stageSize} isSelected={true}
                                    onSelect={e => e.stopPropagation()} onUpdate={handleDragPhone}
                                    snapGrid={1} snapEnabled={snapEnabled} onGuides={setInGameSnapGuides} label="Phone">
                                    <PhonePreview ui={ui} project={project} hideFreeButtons />
                                </ResizableDraggable>
                            )}
                            {phoneButtonsIndependent && phoneButtonRects.map(b => {
                                const cfg = (ui.phoneButtons || []).find(x => x.id === b.id);
                                const ci = cfg?.iconImage?.id ? ((project.images as any)[cfg.iconImage.id]?.imageUrl || (project.backgrounds as any)[cfg.iconImage.id]?.imageUrl) : null;
                                return (
                                <ResizableDraggable key={b.id}
                                    x={b.rect.x} y={b.rect.y} width={b.rect.width} height={b.rect.height}
                                    anchorX={0} anchorY={0} parentSize={stageSize} isSelected={true}
                                    onSelect={e => e.stopPropagation()} onUpdate={u => handleDragPhoneButton(b.id, u)}
                                    snapGrid={1} snapEnabled={snapEnabled} onGuides={setInGameSnapGuides}
                                    siblings={phoneButtonRects.filter(o => o.id !== b.id).map(o => ({ x: o.rect.x, y: o.rect.y, width: o.rect.width, height: o.rect.height }))}
                                    label={b.label || 'App'}>
                                    <div style={{ width: '100%', height: '100%', containerType: 'size', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1cqmin', color: ui.phoneButtonIconColor || '#cbd5e1' } as React.CSSProperties}>
                                        {ci ? <img src={ci} alt="" style={{ width: '82cqmin', height: '82cqmin', objectFit: 'contain' }} /> : <span style={{ fontSize: '74cqmin', lineHeight: 1 }}>{(cfg?.builtinIcon && PHONE_GLYPHS[cfg.builtinIcon]) || '●'}</span>}
                                        {cfg?.label && <span style={{ fontSize: '18cqmin', lineHeight: 1, whiteSpace: 'nowrap' }}>{cfg.label}</span>}
                                    </div>
                                </ResizableDraggable>
                                );
                            })}
                            {/* Banner view: drag/resize the notification banner. */}
                            {phonePreviewView === 'notification' && (
                                <ResizableDraggable
                                    x={ui.phoneNotifX ?? 20} y={ui.phoneNotifY ?? 4} width={60} height={12}
                                    anchorX={0} anchorY={0} parentSize={stageSize} isSelected={true}
                                    onSelect={e => e.stopPropagation()} onUpdate={u => handleDragBanner(u)}
                                    snapGrid={1} snapEnabled={snapEnabled} onGuides={setInGameSnapGuides} label="Banner">
                                    <PhoneBannerPreview ui={ui} project={project} fill />
                                </ResizableDraggable>
                            )}
                            {/* Badge view: drag to position, resize to set its size. */}
                            {phonePreviewView === 'badge' && (
                                <ResizableDraggable
                                    x={ui.phoneBadgeX ?? 95} y={ui.phoneBadgeY ?? 4}
                                    width={((ui.phoneBadgeSize ?? 16) / gameH) * 100} height={((ui.phoneBadgeSize ?? 16) / gameH) * 100}
                                    anchorX={0} anchorY={0} parentSize={stageSize} isSelected={true}
                                    onSelect={e => e.stopPropagation()} onUpdate={u => handleDragBadge(u)}
                                    snapGrid={1} snapEnabled={snapEnabled} onGuides={setInGameSnapGuides} label="Badge">
                                    <PhoneBadgePreview ui={ui} fill />
                                </ResizableDraggable>
                            )}
                            {phonePreviewView === 'call' && (() => {
                                const callSample = (Object.values(project.characters) as any[])[0];
                                const callShape = ui.phoneCallPortraitShape || 'circle';
                                const portW = ui.phoneCallPortraitSize ?? 22;
                                return (<>
                                    <div className="absolute inset-0" style={{ zIndex: 0 }}><PhoneCallPreview ui={ui} project={project} hidePortrait /></div>
                                    <ResizableDraggable
                                        x={ui.phoneCallPortraitX ?? 50} y={ui.phoneCallPortraitY ?? 18}
                                        width={portW} height={portW * (gameW / gameH)}
                                        anchorX={0} anchorY={0} parentSize={stageSize} isSelected={true}
                                        onSelect={e => e.stopPropagation()} onUpdate={u => handleDragCallPortrait(u)}
                                        snapGrid={1} snapEnabled={snapEnabled} onGuides={setInGameSnapGuides} label="Caller portrait">
                                        <div style={{ width: '100%', height: '100%', borderRadius: callShape === 'circle' ? '9999px' : '16px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
                                            {callSample?.baseImageUrl && <img src={callSample.baseImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: ui.phoneCallPortraitFit || 'cover', objectPosition: ui.phoneCallPortraitPosition || 'center' }} />}
                                        </div>
                                    </ResizableDraggable>
                                </>);
                            })()}
                            {/* Contacts view: the phone shell is drag/resizable, and the contacts list
                                occupies a free region you can drag/resize within it. */}
                            {phonePreviewView === 'contacts' && (() => {
                                const region = ui.phoneContactsRegion || { x: 6, y: 16, width: 88, height: 78 };
                                const regionRect = {
                                    x: phoneRect.x + (region.x / 100) * phoneRect.width,
                                    y: phoneRect.y + (region.y / 100) * phoneRect.height,
                                    width: (region.width / 100) * phoneRect.width,
                                    height: (region.height / 100) * phoneRect.height,
                                };
                                return (<>
                                    <ResizableDraggable
                                        x={phoneRect.x} y={phoneRect.y} width={phoneRect.width} height={phoneRect.height}
                                        anchorX={0} anchorY={0} parentSize={stageSize} isSelected={true}
                                        onSelect={e => e.stopPropagation()} onUpdate={handleDragPhone}
                                        snapGrid={1} snapEnabled={snapEnabled} onGuides={setInGameSnapGuides} label="Phone">
                                        <PhonePreview ui={ui} project={project} view="contacts" />
                                    </ResizableDraggable>
                                    <ResizableDraggable
                                        x={regionRect.x} y={regionRect.y} width={regionRect.width} height={regionRect.height}
                                        anchorX={0} anchorY={0} parentSize={stageSize} isSelected={true}
                                        onSelect={e => e.stopPropagation()} onUpdate={handleDragContactsRegion}
                                        snapGrid={1} snapEnabled={snapEnabled} onGuides={setInGameSnapGuides} label="Contacts list">
                                        <div style={{ width: '100%', height: '100%', border: '1px dashed rgba(124,131,253,0.7)', borderRadius: 8, background: 'rgba(124,131,253,0.08)' }} />
                                    </ResizableDraggable>
                                </>);
                            })()}
                        </>
                    )}

                    {/* Confirm Dialogs preview – full-canvas overlay, not draggable. A toggle lets the
                        author preview EITHER the Quit or the New Game confirmation (shared styling). */}
                    {selectedElement === 'confirmDialogs' && (
                        <>
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex gap-1 bg-[var(--bg-tertiary)] border border-[var(--border-default)] backdrop-blur-sm rounded-lg p-1 pointer-events-auto shadow-xl">
                                {CONFIRM_VARIANTS.map(v => (
                                    <button key={v} onClick={() => setConfirmPreviewVariant(v)}
                                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${confirmPreviewVariant === v ? 'bg-[var(--accent-lavender)] text-white shadow' : 'text-[var(--text-primary)] hover:bg-white/10'}`}>
                                        {confirmVariantLabel(v, t)}
                                    </button>
                                ))}
                            </div>
                            {confirmIndependent ? (
                                <>
                                    {/* Free layout: draggable/resizable box + each button (screen-%). */}
                                    <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: confirmEff.overlayColor ?? 'rgba(0,0,0,0.75)' }} />
                                    {([
                                        { which: 'boxRect' as const, rect: confirmEff.boxRect!, part: 'box' as const, label: t('inGameUi.confirmBoxLabel', 'Dialog box') },
                                        { which: 'cancelRect' as const, rect: confirmEff.cancelRect, part: 'cancel' as const, label: t('inGameUi.cancelButton') },
                                        { which: 'confirmRect' as const, rect: confirmEff.confirmRect, part: 'confirm' as const, label: t('inGameUi.confirmButton') },
                                    ]).filter(d => d.rect).map(d => (
                                        <ResizableDraggable
                                            key={d.which}
                                            x={d.rect!.x} y={d.rect!.y}
                                            width={d.rect!.width} height={d.rect!.height}
                                            anchorX={0} anchorY={0}
                                            parentSize={stageSize}
                                            isSelected={true}
                                            onSelect={e => { e.stopPropagation(); }}
                                            onUpdate={u => handleDragConfirmRect(d.which, u)}
                                            snapGrid={1}
                                            snapEnabled={snapEnabled}
                                            siblings={([confirmEff.boxRect, confirmEff.cancelRect, confirmEff.confirmRect].filter(Boolean) as Array<{x:number;y:number;width:number;height:number}>).filter(r => r !== d.rect).map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }))}
                                            onGuides={setInGameSnapGuides}
                                            label={d.label}
                                        >
                                            <ConfirmFreePart ui={ui} project={project} variant={confirmPreviewVariant} part={d.part} />
                                        </ResizableDraggable>
                                    ))}
                                </>
                            ) : (
                                <ConfirmDialogPreview ui={ui} project={project} variant={confirmPreviewVariant} />
                            )}
                        </>
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
                                <p className="text-sm text-white/30">{t('hc.selectOrCreateATheme', 'Select or create a theme in the panel →')}</p>
                            </div>
                        )
                    )}

                    {/* Custom scene transition preview — two sample scenes with the selected
                        transition playing between them (▶ Preview button in the panel). */}
                    {selectedElement === 'sceneTransitions' && (
                        selectedTransitionId && project.customTransitions?.[selectedTransitionId] ? (
                            <>
                                <SceneTransitionCanvasPreview
                                    project={project}
                                    def={project.customTransitions[selectedTransitionId]}
                                    nonce={transitionPreviewNonce}
                                />
                                {transitionPreviewNonce === 0 && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <p className="text-sm text-white/50 bg-black/40 px-3 py-1.5 rounded">{t('inGameUi.transitionPreviewHint', 'Press “Preview on the canvas” in the panel →')}</p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <p className="text-sm text-white/30">{t('inGameUi.transitionSelectHint', 'Select or create a transition in the panel →')}</p>
                            </div>
                        )
                    )}

                    {!activeEl && selectedElement !== 'confirmDialogs' && selectedElement !== 'textboxThemes' && selectedElement !== 'sceneTransitions' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <p className="text-sm text-white/30">{t('inGameUi.selectFromSidebar')}</p>
                        </div>
                    )}
                </div>
            </div>
            )}

            {/* Properties panel (right side) (Part 3: properties) */}
            {showProperties && (
            <div className={`relative flex flex-col min-h-0 ${(!showTree && !showCanvas) ? 'flex-1 min-w-0' : 'w-72 flex-shrink-0 border-l border-[var(--border-subtle)]'} bg-[var(--bg-primary)]`}>
                {isMultiWindowSupported() && !isManagerWindow() && (
                    <button
                        onClick={() => openManagerWindow('inspector')}
                        title={t('inGameUi.popOutProperties', 'Open the properties in its own window')}
                        className="absolute top-2 right-2 z-30 w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-black/40 hover:bg-black/60 border border-[var(--border-subtle)] transition-all"
                    >
                        ⧉
                    </button>
                )}
                {/* Inner scroller (flex-1 + min-h-0): reliably scrolls tall property lists, matching the
                    tree sidebar's pattern. Self-overflow on the stretched flex item was clipping content. */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                {selectedElement === 'textboxThemes' ? (
                    <TextboxThemeManager project={project} selectedThemeId={selectedThemeId} onSelect={setSelectedThemeId} />
                ) : selectedElement === 'sceneTransitions' ? (
                    <SceneTransitionManager
                        project={project}
                        selectedId={selectedTransitionId}
                        onSelect={id => { setSelectedTransitionId(id); setTransitionPreviewNonce(0); }}
                        onPreview={() => setTransitionPreviewNonce(n => n + 1)}
                    />
                ) : selectedElement ? (
                    <InGameUIPropsEditor key={selectedElement} ui={ui} element={selectedElement} project={project} onUpdate={updateUI} confirmVariant={confirmPreviewVariant} onConfirmVariantChange={setConfirmPreviewVariant} />
                ) : (
                    <div className="p-4 text-center text-[var(--text-secondary)] text-sm">
                        {t('hc.clickAnElementOnThe', 'Click an element on the sidebar to edit its properties')}
                    </div>
                )}
                </div>
            </div>
            )}
        </div>
    );
};

export default InGameUIEditor;
