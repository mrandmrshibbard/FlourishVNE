import React from 'react';
import { VNFontSettings } from '../../features/ui/types';
import { VNTextShadow, VNTextGradient, VNTextBorder } from '../../features/scene/types';
import { useProject } from '../../contexts/ProjectContext';
import { FormField, TextInput, Select, ColorInput } from './Form';

// A curated list of popular and suitable fonts for visual novels.
const popularFonts = [
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

const defaultShadow: VNTextShadow = { enabled: false, offsetX: 2, offsetY: 2, blur: 4, color: '#000000' };
const defaultGradient: VNTextGradient = { enabled: false, type: 'linear', angle: 90, colors: ['#ff00a5', '#8a2be2'] };
const defaultBorder: VNTextBorder = { enabled: false, width: 1, color: '#000000' };

const FontEditor: React.FC<{
    font: VNFontSettings;
    onFontChange: (prop: keyof VNFontSettings, value: any) => void;
}> = ({ font, onFontChange }) => {
    const { project } = useProject();
    // Ensure the current font is in the list, even if it's a custom one.
    const fontOptions = [...popularFonts];

    // Add project-level custom fonts (uploaded TTF/OTF)
    const projectFonts = (project as any).fonts || {};
    for (const f of Object.values(projectFonts) as any[]) {
        if (f?.fontFamily && !fontOptions.includes(f.fontFamily)) {
            fontOptions.unshift(f.fontFamily);
        }
    }

    if (!fontOptions.includes(font.family)) {
        fontOptions.unshift(font.family);
    }

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

    return (
        <div className="space-y-2">
            <FormField label="Font Family">
                <Select value={font.family} onChange={e => onFontChange('family', e.target.value)}>
                    {fontOptions.map(fontFamily => (
                        <option key={fontFamily} value={fontFamily}>
                            {fontFamily.split(',')[0]}
                        </option>
                    ))}
                </Select>
            </FormField>
            <div className="grid grid-cols-2 gap-2">
                <FormField label="Size (px)">
                    <TextInput type="number" value={font.size} onChange={e => onFontChange('size', parseInt(e.target.value, 10))} />
                </FormField>
                <FormField label="Color">
                    <ColorInput value={font.color} onChange={val => onFontChange('color', val)} className="p-1 h-10" />
                </FormField>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <FormField label="Weight">
                    <Select value={font.weight} onChange={e => onFontChange('weight', e.target.value)}>
                        <option value="normal">Normal</option>
                        <option value="bold">Bold</option>
                    </Select>
                </FormField>
                <div className="flex items-center pt-6">
                    <input
                        type="checkbox"
                        id="font-italic"
                        checked={font.italic}
                        onChange={e => onFontChange('italic', e.target.checked)}
                        className="h-4 w-4 rounded bg-slate-700 border-slate-600 focus:ring-sky-500"
                    />
                    <label htmlFor="font-italic" className="ml-2">Italic</label>
                </div>
            </div>
            <FormField label="Letter Spacing (px)">
                <TextInput type="number" value={font.letterSpacing ?? 0} onChange={e => onFontChange('letterSpacing' as any, parseFloat(e.target.value) || 0)} />
            </FormField>

            {/* Text Shadow */}
            <hr className="border-slate-700 my-2" />
            <h4 className="font-bold text-xs mb-2 text-slate-400">Text Shadow</h4>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mb-2">
                <input type="checkbox" checked={shadow.enabled} onChange={e => updateShadow({ enabled: e.target.checked })} />
                Enable Shadow
            </label>
            {shadow.enabled && (
                <>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="X Offset"><TextInput type="number" value={shadow.offsetX} onChange={e => updateShadow({ offsetX: parseFloat(e.target.value) || 0 })} /></FormField>
                        <FormField label="Y Offset"><TextInput type="number" value={shadow.offsetY} onChange={e => updateShadow({ offsetY: parseFloat(e.target.value) || 0 })} /></FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="Blur"><TextInput type="number" value={shadow.blur} onChange={e => updateShadow({ blur: parseFloat(e.target.value) || 0 })} /></FormField>
                        <FormField label="Shadow Color"><ColorInput value={shadow.color} onChange={val => updateShadow({ color: val })} className="p-1 h-10" /></FormField>
                    </div>
                </>
            )}

            {/* Text Gradient */}
            <hr className="border-slate-700 my-2" />
            <h4 className="font-bold text-xs mb-2 text-slate-400">Text Gradient</h4>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mb-2">
                <input type="checkbox" checked={gradient.enabled} onChange={e => updateGradient({ enabled: e.target.checked })} />
                Enable Gradient
            </label>
            {gradient.enabled && (
                <>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="Type">
                            <Select value={gradient.type} onChange={e => updateGradient({ type: e.target.value as any })}>
                                <option value="linear">Linear</option>
                                <option value="radial">Radial</option>
                            </Select>
                        </FormField>
                        {gradient.type === 'linear' && (
                            <FormField label="Angle (°)"><TextInput type="number" value={gradient.angle} onChange={e => updateGradient({ angle: parseInt(e.target.value, 10) || 0 })} /></FormField>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="Color 1"><ColorInput value={gradient.colors[0] || '#ff00a5'} onChange={val => { const c = [...gradient.colors]; c[0] = val; updateGradient({ colors: c }); }} className="p-1 h-10" /></FormField>
                        <FormField label="Color 2"><ColorInput value={gradient.colors[1] || '#8a2be2'} onChange={val => { const c = [...gradient.colors]; c[1] = val; updateGradient({ colors: c }); }} className="p-1 h-10" /></FormField>
                    </div>
                </>
            )}

            {/* Text Border / Stroke */}
            <hr className="border-slate-700 my-2" />
            <h4 className="font-bold text-xs mb-2 text-slate-400">Text Border</h4>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mb-2">
                <input type="checkbox" checked={border.enabled} onChange={e => updateBorder({ enabled: e.target.checked })} />
                Enable Border
            </label>
            {border.enabled && (
                <div className="grid grid-cols-2 gap-1">
                    <FormField label="Width (px)"><TextInput type="number" value={border.width} onChange={e => updateBorder({ width: parseFloat(e.target.value) || 1 })} /></FormField>
                    <FormField label="Border Color"><ColorInput value={border.color} onChange={val => updateBorder({ color: val })} className="p-1 h-10" /></FormField>
                </div>
            )}
        </div>
    );
};

export default FontEditor;