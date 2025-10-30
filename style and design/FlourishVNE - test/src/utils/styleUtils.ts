import React from 'react';
import { VNFontSettings } from "../features/ui/types";

export const fontSettingsToStyle = (settings: VNFontSettings): React.CSSProperties => ({
    fontFamily: settings.family,
    fontSize: `${settings.size}px`,
    color: settings.color,
    fontWeight: settings.weight,
    fontStyle: settings.italic ? 'italic' : 'normal',
});