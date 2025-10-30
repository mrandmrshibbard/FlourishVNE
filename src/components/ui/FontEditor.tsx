import React from 'react';
import { VNFontSettings } from '../../features/ui/types';
import { FormField, TextInput, Select } from './Form';

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

const FontEditor: React.FC<{
    font: VNFontSettings;
    onFontChange: (prop: keyof VNFontSettings, value: any) => void;
}> = ({ font, onFontChange }) => {
    // Ensure the current font is in the list, even if it's a custom one.
    const fontOptions = [...popularFonts];
    if (!fontOptions.includes(font.family)) {
        fontOptions.unshift(font.family);
    }

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
                    <TextInput type="color" value={font.color} onChange={e => onFontChange('color', e.target.value)} className="p-1 h-10" />
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
        </div>
    );
};

export default FontEditor;