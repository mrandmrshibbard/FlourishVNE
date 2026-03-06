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
import { VNProjectUI, VNFontSettings } from '../features/ui/types';
import { useProject } from '../contexts/ProjectContext';
import ResizableDraggable from './menu-editor/ResizableDraggable';
import {
    ChatBubbleIcon, BookmarkSquareIcon, SparklesIcon, PencilIcon,
    ChevronDownIcon,
} from './icons';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type InGameUIElement =
    | 'dialogueBox'
    | 'nameBox'
    | 'choiceButtons'
    | 'inputBox'
    | 'quickMenu';

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
    return {
        fontFamily: f.family,
        fontSize: `calc(var(--font-scale, 1) * ${f.size}px)`,
        color: f.color,
        fontWeight: f.weight,
        fontStyle: f.italic ? 'italic' : 'normal',
        textAlign: f.align || 'left',
        letterSpacing: f.letterSpacing ? `${f.letterSpacing}px` : undefined,
    };
}

/* ------------------------------------------------------------------ */
/*  Default layout helpers  (%)                                        */
/* ------------------------------------------------------------------ */

function getDialogueRect(ui: VNProjectUI) {
    const w = ui.dialogueBoxWidth ?? 100;
    const h = ui.dialogueBoxHeight ? (ui.dialogueBoxHeight / 10.8) : 20; // approx of 1080 base
    const x = ui.dialogueBoxX ?? ((100 - w) / 2);
    const bm = ui.dialogueBoxBottomMargin ?? 20;
    const y = ui.dialogueBoxY ?? (100 - h - (bm / 10.8));
    return { x, y, width: w, height: h };
}

function getNameboxRect(ui: VNProjectUI) {
    const dRect = getDialogueRect(ui);
    const w = ui.nameboxWidth ?? 15;
    const h = ui.nameboxHeight ?? 5;
    const x = ui.nameboxX ?? (dRect.x + (ui.nameboxOffsetX ?? 20) / 19.2);
    const y = ui.nameboxY ?? (dRect.y - h - (ui.nameboxOffsetY ?? 0) / 10.8);
    return { x, y, width: w, height: h };
}

function getChoiceRect(ui: VNProjectUI) {
    const w = ui.choiceButtonWidth ? (ui.choiceButtonWidth / 19.2) : 30;
    const h = ui.choiceButtonHeight ? (ui.choiceButtonHeight / 10.8) : 25;
    const x = ui.choiceButtonX ?? (50 - w / 2);
    const y = ui.choiceButtonY ?? 35;
    return { x, y, width: w, height: h };
}

function getInputRect(ui: VNProjectUI) {
    const w = ui.inputBoxWidth ? (ui.inputBoxWidth / 19.2) : 30;
    const h = ui.inputBoxHeight ? (typeof ui.inputBoxHeight === 'number' ? ui.inputBoxHeight / 10.8 : 20) : 20;
    const x = ui.inputBoxX ?? (50 - w / 2);
    const y = ui.inputBoxY ?? 40;
    return { x, y, width: w, height: h };
}

function getQuickMenuRect(ui: VNProjectUI) {
    const w = ui.quickMenuWidth ?? 40;
    const h = ui.quickMenuHeight ?? 4;
    let x = ui.quickMenuX ?? 30;
    let y = ui.quickMenuY ?? 73;
    if (!ui.quickMenuX && !ui.quickMenuY) {
        const pos = ui.quickMenuPosition ?? 'above-dialogue';
        const dRect = getDialogueRect(ui);
        if (pos === 'top-right') { x = 75; y = 2; }
        else if (pos === 'bottom-right') { x = 75; y = 92; }
        else if (pos === 'above-dialogue') { x = dRect.x + dRect.width / 2 - w / 2; y = dRect.y - h - 1; }
    }
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

    // Resolve images
    const bgImgId = ui.dialogueBoxImage?.id;
    const bgUrl = bgImgId
        ? ((project.images as any)[bgImgId]?.imageUrl || (project.backgrounds as any)[bgImgId]?.imageUrl)
        : null;

    return (
        <div className="w-full h-full relative" style={{
            backgroundColor: bgUrl ? undefined : bgColor,
            borderRadius: `calc(var(--font-scale,1) * ${br}px)`,
            overflow: 'hidden',
            ...(bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
        }}>
            <div style={{
                padding: `calc(var(--font-scale,1) * ${padding}px)`,
                paddingTop: `calc(var(--font-scale,1) * ${padding + textPadTop}px)`,
                paddingBottom: `calc(var(--font-scale,1) * ${padding + textPadBot}px)`,
                paddingLeft: `calc(var(--font-scale,1) * ${padding + textPadLeft}px)`,
                paddingRight: `calc(var(--font-scale,1) * ${padding + textPadRight}px)`,
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

    return (
        <div className="w-full h-full flex items-center" style={{
            backgroundColor: bgUrl ? undefined : bgColor,
            borderRadius: `calc(var(--font-scale,1) * ${br}px)`,
            padding: `calc(var(--font-scale,1) * ${pad}px) calc(var(--font-scale,1) * ${hPad}px)`,
            ...(bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
        }}>
            <span style={fontToStyle(ui.dialogueNameFont)} className="opacity-90">Character Name</span>
        </div>
    );
};

const ChoiceButtonsPreview: React.FC<{ ui: VNProjectUI; project: VNProject }> = ({ ui, project }) => {
    const bgColor = hexToRgba(ui.choiceButtonColor ?? '#1e293b', ui.choiceButtonOpacity ?? 90);
    const br = ui.choiceButtonBorderRadius ?? 8;
    const pad = ui.choiceButtonPadding ?? 16;

    const bgImgId = ui.choiceButtonImage?.id;
    const bgUrl = bgImgId
        ? ((project.images as any)[bgImgId]?.imageUrl || (project.backgrounds as any)[bgImgId]?.imageUrl)
        : null;

    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-[4%]">
            {['Choice A', 'Choice B', 'Choice C'].map(label => (
                <div key={label} className="w-[80%] text-center" style={{
                    backgroundColor: bgUrl ? undefined : bgColor,
                    borderRadius: `calc(var(--font-scale,1) * ${br}px)`,
                    padding: `calc(var(--font-scale,1) * ${pad}px)`,
                    ...(bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
                }}>
                    <span style={fontToStyle(ui.choiceTextFont)} className="opacity-90">{label}</span>
                </div>
            ))}
        </div>
    );
};

const InputBoxPreview: React.FC<{ ui: VNProjectUI; project: VNProject }> = ({ ui, project }) => {
    const bgColor = hexToRgba(ui.inputBoxColor ?? '#0f172a', ui.inputBoxOpacity ?? 92);
    const br = ui.inputBoxBorderRadius ?? 8;
    const pad = ui.inputBoxPadding ?? 24;

    const bgImgId = ui.inputBoxImage?.id;
    const bgUrl = bgImgId
        ? ((project.images as any)[bgImgId]?.imageUrl || (project.backgrounds as any)[bgImgId]?.imageUrl)
        : null;

    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-[6%]" style={{
            backgroundColor: bgUrl ? undefined : bgColor,
            borderRadius: `calc(var(--font-scale,1) * ${br}px)`,
            padding: `calc(var(--font-scale,1) * ${pad}px)`,
            ...(bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
        }}>
            <p style={fontToStyle(ui.inputPromptFont)} className="opacity-90 text-center">What is your name?</p>
            <div className="w-[80%] bg-white/10 rounded px-2 py-1" style={fontToStyle(ui.inputFieldFont)}>
                <span className="opacity-40">Type here…</span>
            </div>
            <div className="px-4 py-1 rounded bg-sky-600/80">
                <span style={fontToStyle(ui.inputSubmitFont)}>Submit</span>
            </div>
        </div>
    );
};

const QuickMenuPreview: React.FC<{ ui: VNProjectUI }> = ({ ui }) => {
    const bgColor = hexToRgba(ui.quickMenuColor ?? '#0f172a', ui.quickMenuOpacity ?? 75);
    const br = ui.quickMenuBorderRadius ?? 4;
    const buttons = ['Skip', 'Auto', 'Log', 'Back'];

    return (
        <div className="w-full h-full flex items-center justify-center gap-[2%]">
            {buttons.map(lbl => (
                <div key={lbl} className="px-2 py-0.5" style={{
                    backgroundColor: bgColor,
                    borderRadius: `calc(var(--font-scale,1) * ${br}px)`,
                    fontSize: 'calc(var(--font-scale,1) * 12px)',
                    color: '#94a3b8',
                }}>
                    {lbl}
                </div>
            ))}
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

const InGameUIPropsEditor: React.FC<PropsEditorProps> = ({ ui, element, project, onUpdate }) => {
    const inputCls = "w-full bg-[var(--bg-primary)] text-white p-2 rounded border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm";
    const labelCls = "block text-xs font-medium text-[var(--text-secondary)] mb-1";

    // Gather all available images (images + backgrounds) for background image selectors
    const allImages = useMemo(() => [
        ...Object.values(project.images || {}) as any[],
        ...Object.values(project.backgrounds || {}) as any[],
    ], [project.images, project.backgrounds]);

    const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
        <div><label className={labelCls}>{label}</label>{children}</div>
    );

    const NumInput: React.FC<{ label: string; value: number | undefined; fallback: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }> = ({ label, value, fallback, onChange, min, max, step }) => (
        <Field label={label}>
            <input type="number" className={inputCls} value={value ?? fallback} min={min} max={max} step={step}
                onChange={e => onChange(parseFloat(e.target.value) || fallback)} />
        </Field>
    );

    const ColorField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
        <Field label={label}>
            <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-full h-8 rounded cursor-pointer border border-[var(--border-default)]" />
        </Field>
    );

    const OpacityField: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange }) => (
        <Field label={label}>
            <div className="flex items-center gap-2">
                <input type="range" min={0} max={100} value={value} onChange={e => onChange(parseInt(e.target.value))} className="flex-1 accent-sky-500" />
                <span className="text-xs text-[var(--text-secondary)] w-8 text-right">{value}%</span>
            </div>
        </Field>
    );

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

                {/* Text padding inside dialogue */}
                <h4 className="text-sm font-bold text-white border-b border-[var(--border-subtle)] pb-1 pt-2">Text Position (padding px)</h4>
                <p className="text-[10px] text-[var(--text-muted)]">Controls where typed text starts inside the dialogue box. Drag the inner text area on canvas or set manually.</p>
                <div className="grid grid-cols-2 gap-2">
                    <NumInput label="Top" value={ui.dialogueTextPaddingTop} fallback={0} min={0} onChange={v => onUpdate({ dialogueTextPaddingTop: v })} />
                    <NumInput label="Bottom" value={ui.dialogueTextPaddingBottom} fallback={0} min={0} onChange={v => onUpdate({ dialogueTextPaddingBottom: v })} />
                    <NumInput label="Left" value={ui.dialogueTextPaddingLeft} fallback={0} min={0} onChange={v => onUpdate({ dialogueTextPaddingLeft: v })} />
                    <NumInput label="Right" value={ui.dialogueTextPaddingRight} fallback={0} min={0} onChange={v => onUpdate({ dialogueTextPaddingRight: v })} />
                </div>
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
                    <select className={inputCls} value={ui.quickMenuPosition ?? 'above-dialogue'} onChange={e => onUpdate({ quickMenuPosition: e.target.value as any })}>
                        <option value="above-dialogue">Above Dialogue</option>
                        <option value="top-right">Top Right</option>
                        <option value="bottom-right">Bottom Right</option>
                        <option value="hidden">Hidden</option>
                    </select>
                </Field>
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
    const dialogueRect = useMemo(() => getDialogueRect(ui), [ui]);
    const nameboxRect = useMemo(() => getNameboxRect(ui), [ui]);
    const choiceRect = useMemo(() => getChoiceRect(ui), [ui]);
    const inputRect = useMemo(() => getInputRect(ui), [ui]);
    const quickMenuRect = useMemo(() => getQuickMenuRect(ui), [ui]);

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
    const elementRects: Record<InGameUIElement, { rect: ReturnType<typeof getDialogueRect>; handler: typeof handleDragDialogue; preview: React.ReactNode }> = useMemo(() => ({
        dialogueBox:   { rect: dialogueRect,   handler: handleDragDialogue,  preview: <DialogueBoxPreview ui={ui} project={project} /> },
        nameBox:       { rect: nameboxRect,    handler: handleDragNamebox,   preview: <NameBoxPreview ui={ui} project={project} /> },
        choiceButtons: { rect: choiceRect,     handler: handleDragChoice,    preview: <ChoiceButtonsPreview ui={ui} project={project} /> },
        inputBox:      { rect: inputRect,      handler: handleDragInput,     preview: <InputBoxPreview ui={ui} project={project} /> },
        quickMenu:     { rect: quickMenuRect,  handler: handleDragQuickMenu, preview: <QuickMenuPreview ui={ui} /> },
    }), [dialogueRect, nameboxRect, choiceRect, inputRect, quickMenuRect, ui, project,
         handleDragDialogue, handleDragNamebox, handleDragChoice, handleDragInput, handleDragQuickMenu]);

    const activeEl = selectedElement && !isHidden(selectedElement) ? elementRects[selectedElement] : null;

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

                    {!activeEl && (
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
