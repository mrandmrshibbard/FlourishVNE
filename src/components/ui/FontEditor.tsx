import React, { useState, useMemo, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { VNFontSettings } from '../../features/ui/types';
import { VNTextShadow, VNTextGradient, VNTextBorder } from '../../features/scene/types';
import { useProject } from '../../contexts/ProjectContext';
import { FormField, TextInput, Select, ColorInput } from './Form';

/** Curated list of popular fonts for visual novels. Exported so consumers can reuse it. */
export const popularFonts = [
  'Poppins, sans-serif',
  'Arial, sans-serif',
  'Helvetica, sans-serif',
  'Verdana, sans-serif',
  'Times New Roman, serif',
  'Georgia, serif',
  'Courier New, monospace',
  'Pacifico, cursive',
  'Lato, sans-serif',
  'Merriweather, serif',
  'Oswald, sans-serif',
  'Playfair Display, serif',
  'Roboto, sans-serif',
  'Caveat, cursive',
];

/** Default VNFontSettings for when a font object is missing. */
export const defaultFontSettings: VNFontSettings = {
    family: 'Poppins, sans-serif',
    size: 16,
    color: '#FFFFFF',
    weight: 'normal',
    italic: false,
};

const defaultShadow: VNTextShadow = { enabled: false, offsetX: 2, offsetY: 2, blur: 4, color: '#000000' };
const defaultGradient: VNTextGradient = { enabled: false, type: 'linear', angle: 90, colors: ['#ff00a5', '#8a2be2'] };
const defaultBorder: VNTextBorder = { enabled: false, width: 1, color: '#000000' };

export interface FontEditorProps {
    font: VNFontSettings;
    onFontChange: (prop: keyof VNFontSettings, value: any) => void;
    /** If provided, wraps the editor in a collapsible panel with this label. */
    label?: string;
    /** Show text alignment controls (left / center / right). Default true. */
    showAlign?: boolean;
    /** Show letter-spacing control. Default true. */
    showLetterSpacing?: boolean;
    /** Show text-shadow, gradient, and border sections. Default true. */
    showTextEffects?: boolean;
    /** Show a live sample preview of the font. Default false. */
    showPreview?: boolean;
    /** Default alignment used when font.align is undefined. Default 'left'. */
    defaultAlign?: 'left' | 'center' | 'right';
}

const FontEditor: React.FC<FontEditorProps> = ({
    font,
    onFontChange,
    label,
    showAlign = true,
    showLetterSpacing = true,
    showTextEffects = true,
    showPreview = false,
    defaultAlign = 'left',
}) => {
    const { t } = useTranslation('components');
    const uid = useId();
    const { project } = useProject();
    const [open, setOpen] = useState(true);

    const fontOptions = useMemo(() => {
        const opts = [...popularFonts];
        const projectFonts = (project as any).fonts || {};
        for (const f of Object.values(projectFonts) as any[]) {
            if (f?.fontFamily && !opts.includes(f.fontFamily)) {
                opts.unshift(f.fontFamily);
            }
        }
        if (!opts.includes(font.family)) {
            opts.unshift(font.family);
        }
        return opts;
    }, [(project as any).fonts, font.family]);

    const shadow = font.textShadow || defaultShadow;
    const gradient = font.textGradient || defaultGradient;
    const border = font.textBorder || defaultBorder;

    const updateShadow = (updates: Partial<VNTextShadow>) => {
        onFontChange('textShadow' as any, { ...shadow, ...updates });
    };
    const updateGradient = (updates: Partial<VNTextGradient>) => {
        onFontChange('textGradient' as any, { ...gradient, ...updates });
    };
    const updateBorder = (updates: Partial<VNTextBorder>) => {
        onFontChange('textBorder' as any, { ...border, ...updates });
    };

    const controls = (
        <div className="space-y-2">
            <FormField label={t('fontEditor.fontFamily')}>
                <Select value={font.family} onChange={e => onFontChange('family', e.target.value)}>
                    {fontOptions.map(fontFamily => (
                        <option key={fontFamily} value={fontFamily}>
                            {fontFamily.split(',')[0]}
                        </option>
                    ))}
                </Select>
            </FormField>
            <div className="grid grid-cols-2 gap-2">
                <FormField label={t('fontEditor.size')}>
                    <TextInput type="number" value={font.size} onChange={e => onFontChange('size', parseInt(e.target.value, 10))} />
                </FormField>
                <FormField label={t('fontEditor.color')}>
                    <ColorInput value={font.color} onChange={val => onFontChange('color', val)} className="p-1 h-10" />
                </FormField>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <FormField label={t('fontEditor.weight')}>
                    <Select value={font.weight} onChange={e => onFontChange('weight', e.target.value)}>
                        <option value="normal">{t('fontEditor.weightNormal')}</option>
                        <option value="bold">{t('fontEditor.weightBold')}</option>
                    </Select>
                </FormField>
                <div className="flex items-center pt-6">
                    <input
                        type="checkbox"
                        id={`${uid}-italic`}
                        checked={font.italic}
                        onChange={e => onFontChange('italic', e.target.checked)}
                        className="h-4 w-4 rounded bg-slate-700 border-slate-600 focus:ring-sky-500"
                    />
                    <label htmlFor={`${uid}-italic`} className="ml-2">{t('fontEditor.italic')}</label>
                </div>
            </div>

            {showAlign && (
                <FormField label={t('fontEditor.alignment')}>
                    <div className="flex gap-1">
                        {(['left', 'center', 'right'] as const).map(a => (
                            <button key={a} onClick={() => onFontChange('align', a)}
                                className={`flex-1 py-1 px-1 rounded text-xs font-medium transition-colors ${
                                    (font.align || defaultAlign) === a
                                        ? 'bg-sky-500 text-white'
                                        : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                                }`}>
                                {a === 'left' ? t('fontEditor.alignLeft') : a === 'center' ? t('fontEditor.alignCenter') : t('fontEditor.alignRight')}
                            </button>
                        ))}
                    </div>
                </FormField>
            )}

            {showLetterSpacing && (
                <FormField label={t('fontEditor.letterSpacing')}>
                    <TextInput type="number" value={font.letterSpacing ?? 0} onChange={e => onFontChange('letterSpacing' as any, parseFloat(e.target.value) || 0)} />
                </FormField>
            )}

            {showPreview && (
                <div className="mt-2 p-3 bg-[var(--bg-primary)] rounded border border-[var(--border-default)]">
                    <p
                        className="text-sm"
                        style={{
                            fontFamily: font.family,
                            fontSize: `${font.size}px`,
                            color: font.color,
                            fontWeight: font.weight,
                            fontStyle: font.italic ? 'italic' : 'normal',
                            textAlign: font.align || defaultAlign,
                            letterSpacing: font.letterSpacing ? `${font.letterSpacing}px` : undefined,
                        }}
                    >
                        {t('fontEditor.sampleText')}
                    </p>
                </div>
            )}

            {showTextEffects && (
                <>
                    {/* Text Shadow */}
                    <hr className="border-slate-700 my-2" />
                    <h4 className="font-bold text-xs mb-2 text-slate-400">{t('fontEditor.textShadow')}</h4>
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mb-2">
                        <input type="checkbox" checked={shadow.enabled} onChange={e => updateShadow({ enabled: e.target.checked })} />
                        {t('fontEditor.enableShadow')}
                    </label>
                    {shadow.enabled && (
                        <>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label={t('fontEditor.xOffset')}><TextInput type="number" value={shadow.offsetX} onChange={e => updateShadow({ offsetX: parseFloat(e.target.value) || 0 })} /></FormField>
                                <FormField label={t('fontEditor.yOffset')}><TextInput type="number" value={shadow.offsetY} onChange={e => updateShadow({ offsetY: parseFloat(e.target.value) || 0 })} /></FormField>
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label={t('fontEditor.blur')}><TextInput type="number" value={shadow.blur} onChange={e => updateShadow({ blur: parseFloat(e.target.value) || 0 })} /></FormField>
                                <FormField label={t('fontEditor.shadowColor')}><ColorInput value={shadow.color} onChange={val => updateShadow({ color: val })} className="p-1 h-10" /></FormField>
                            </div>
                        </>
                    )}

                    {/* Text Gradient */}
                    <hr className="border-slate-700 my-2" />
                    <h4 className="font-bold text-xs mb-2 text-slate-400">{t('fontEditor.textGradient')}</h4>
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mb-2">
                        <input type="checkbox" checked={gradient.enabled} onChange={e => updateGradient({ enabled: e.target.checked })} />
                        {t('fontEditor.enableGradient')}
                    </label>
                    {gradient.enabled && (
                        <>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label={t('fontEditor.type')}>
                                    <Select value={gradient.type} onChange={e => updateGradient({ type: e.target.value as any })}>
                                        <option value="linear">{t('fontEditor.typeLinear')}</option>
                                        <option value="radial">{t('fontEditor.typeRadial')}</option>
                                    </Select>
                                </FormField>
                                {gradient.type === 'linear' && (
                                    <FormField label={t('fontEditor.angle')}><TextInput type="number" value={gradient.angle} onChange={e => updateGradient({ angle: parseInt(e.target.value, 10) || 0 })} /></FormField>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label={t('fontEditor.color1')}><ColorInput value={gradient.colors[0] || '#ff00a5'} onChange={val => { const c = [...gradient.colors]; c[0] = val; updateGradient({ colors: c }); }} className="p-1 h-10" /></FormField>
                                <FormField label={t('fontEditor.color2')}><ColorInput value={gradient.colors[1] || '#8a2be2'} onChange={val => { const c = [...gradient.colors]; c[1] = val; updateGradient({ colors: c }); }} className="p-1 h-10" /></FormField>
                            </div>
                        </>
                    )}

                    {/* Text Border / Stroke */}
                    <hr className="border-slate-700 my-2" />
                    <h4 className="font-bold text-xs mb-2 text-slate-400">{t('fontEditor.textBorder')}</h4>
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mb-2">
                        <input type="checkbox" checked={border.enabled} onChange={e => updateBorder({ enabled: e.target.checked })} />
                        {t('fontEditor.enableBorder')}
                    </label>
                    {border.enabled && (
                        <div className="grid grid-cols-2 gap-1">
                            <FormField label={t('fontEditor.width')}><TextInput type="number" value={border.width} onChange={e => updateBorder({ width: parseFloat(e.target.value) || 1 })} /></FormField>
                            <FormField label={t('fontEditor.borderColor')}><ColorInput value={border.color} onChange={val => updateBorder({ color: val })} className="p-1 h-10" /></FormField>
                        </div>
                    )}
                </>
            )}
        </div>
    );

    if (label) {
        return (
            <div className="border border-[var(--border-subtle)] rounded-md">
                <button onClick={() => setOpen(!open)}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-bold text-white hover:bg-[var(--bg-secondary)] rounded-t-md">
                    <span>{label}</span>
                    <span className="text-[var(--text-muted)]">{open ? '▾' : '▸'}</span>
                </button>
                {open && (
                    <div className="p-2 border-t border-[var(--border-subtle)]">
                        {controls}
                    </div>
                )}
            </div>
        );
    }

    return controls;
};

export default FontEditor;