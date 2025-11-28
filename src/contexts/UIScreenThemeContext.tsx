import React, { createContext, useContext, useState, useCallback } from 'react';
import { useProject } from './ProjectContext';
import { VNID } from '../types';
import { UIElementType } from '../features/ui/types';

export type UIScreenThemeName = 'purple' | 'midnight' | 'ocean' | 'sunset' | 'light' | 'custom';

export interface UIScreenTheme {
  name: UIScreenThemeName;
  label: string;
  description: string;
  colors: {
    background: string;
    buttonBg: string;
    buttonHover: string;
    buttonText: string;
    headerText: string;
    labelText: string;
    sliderTrack: string;
    sliderThumb: string;
    saveSlotBg: string;
    saveSlotBorder: string;
    saveSlotHoverBorder: string;
    saveSlotHeaderColor: string;
  };
}

const uiScreenThemes: Record<UIScreenThemeName, UIScreenTheme> = {
  purple: {
    name: 'purple',
    label: 'Purple Dream',
    description: 'The default purple-themed UI with neon accents',
    colors: {
      background: '#1a102c',
      buttonBg: '#4D3273',
      buttonHover: '#6B4C9A',
      buttonText: '#f0e6ff',
      headerText: '#f0e6ff',
      labelText: '#c0b4d4',
      sliderTrack: '#4D3273',
      sliderThumb: '#8a2be2',
      saveSlotBg: '#1e1e38',
      saveSlotBorder: '#4D3273',
      saveSlotHoverBorder: '#8a2be2',
      saveSlotHeaderColor: '#a78bfa',
    },
  },
  midnight: {
    name: 'midnight',
    label: 'Midnight',
    description: 'Dark and sleek with cool gray tones',
    colors: {
      background: '#0a0a0f',
      buttonBg: '#1e1e2e',
      buttonHover: '#2d2d42',
      buttonText: '#e4e4e7',
      headerText: '#e4e4e7',
      labelText: '#a1a1aa',
      sliderTrack: '#27272a',
      sliderThumb: '#a78bfa',
      saveSlotBg: '#18181b',
      saveSlotBorder: '#3f3f46',
      saveSlotHoverBorder: '#a78bfa',
      saveSlotHeaderColor: '#a78bfa',
    },
  },
  ocean: {
    name: 'ocean',
    label: 'Ocean Depths',
    description: 'Deep blue tones inspired by the sea',
    colors: {
      background: '#0c1929',
      buttonBg: '#1a4066',
      buttonHover: '#2563eb',
      buttonText: '#e0f2fe',
      headerText: '#e0f2fe',
      labelText: '#7dd3fc',
      sliderTrack: '#075985',
      sliderThumb: '#06b6d4',
      saveSlotBg: '#0f2942',
      saveSlotBorder: '#1a4066',
      saveSlotHoverBorder: '#06b6d4',
      saveSlotHeaderColor: '#7dd3fc',
    },
  },
  sunset: {
    name: 'sunset',
    label: 'Sunset Glow',
    description: 'Warm amber and orange tones',
    colors: {
      background: '#1c1410',
      buttonBg: '#4a3228',
      buttonHover: '#6b4b3a',
      buttonText: '#fef3c7',
      headerText: '#fef3c7',
      labelText: '#fcd34d',
      sliderTrack: '#44403c',
      sliderThumb: '#f59e0b',
      saveSlotBg: '#292018',
      saveSlotBorder: '#4a3228',
      saveSlotHoverBorder: '#f59e0b',
      saveSlotHeaderColor: '#fcd34d',
    },
  },
  light: {
    name: 'light',
    label: 'Light Mode',
    description: 'Clean white background with dark text',
    colors: {
      background: '#f8fafc',
      buttonBg: '#e2e8f0',
      buttonHover: '#cbd5e1',
      buttonText: '#1e293b',
      headerText: '#0f172a',
      labelText: '#475569',
      sliderTrack: '#cbd5e1',
      sliderThumb: '#6366f1',
      saveSlotBg: '#f1f5f9',
      saveSlotBorder: '#94a3b8',
      saveSlotHoverBorder: '#6366f1',
      saveSlotHeaderColor: '#6366f1',
    },
  },
  custom: {
    name: 'custom',
    label: 'Custom',
    description: 'User-defined colors',
    colors: {
      background: '#1a102c',
      buttonBg: '#4D3273',
      buttonHover: '#6B4C9A',
      buttonText: '#f0e6ff',
      headerText: '#f0e6ff',
      labelText: '#c0b4d4',
      sliderTrack: '#4D3273',
      sliderThumb: '#8a2be2',
      saveSlotBg: '#1e1e38',
      saveSlotBorder: '#4D3273',
      saveSlotHoverBorder: '#8a2be2',
      saveSlotHeaderColor: '#a78bfa',
    },
  },
};

interface UIScreenThemeContextValue {
  availableThemes: UIScreenTheme[];
  applyThemeToAllScreens: (themeName: UIScreenThemeName) => void;
  applyThemeToScreen: (screenId: VNID, themeName: UIScreenThemeName) => void;
}

const UIScreenThemeContext = createContext<UIScreenThemeContextValue | null>(null);

export const UIScreenThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { project, dispatch } = useProject();

  const applyThemeToScreen = useCallback((screenId: VNID, themeName: UIScreenThemeName) => {
    const theme = uiScreenThemes[themeName];
    console.log('[UIScreenTheme] Applying theme:', themeName, 'to screen:', screenId);
    console.log('[UIScreenTheme] Theme colors:', theme?.colors);
    console.log('[UIScreenTheme] Screen exists:', !!project?.uiScreens?.[screenId]);
    
    if (!theme || !project?.uiScreens?.[screenId]) {
      console.warn('[UIScreenTheme] Aborting - theme or screen not found');
      return;
    }

    // Update the screen's background color
    console.log('[UIScreenTheme] Dispatching UPDATE_UI_SCREEN with background:', theme.colors.background);
    dispatch({
      type: 'UPDATE_UI_SCREEN',
      payload: {
        screenId,
        updates: {
          background: { type: 'color', value: theme.colors.background },
        },
      },
    });

    // Update text elements' font colors and button elements
    const screen = project.uiScreens[screenId];
    console.log('[UIScreenTheme] Screen elements count:', Object.keys(screen?.elements || {}).length);
    if (screen?.elements) {
      Object.values(screen.elements).forEach((element: any) => {
        // Check element type using the enum values (which are strings like 'Button', 'Text')
        const elementType = element.type;
        console.log('[UIScreenTheme] Element:', element.name, 'type:', elementType, 'UIElementType.Button:', UIElementType.Button, 'UIElementType.Text:', UIElementType.Text);
        
        if (elementType === UIElementType.Text && element.font) {
          // Determine if it's a header (larger font) or label
          const isHeader = element.font.size >= 40;
          console.log('[UIScreenTheme] Updating Text element:', element.name, 'isHeader:', isHeader);
          dispatch({
            type: 'UPDATE_UI_ELEMENT',
            payload: {
              screenId,
              elementId: element.id,
              updates: {
                font: {
                  ...element.font,
                  color: isHeader ? theme.colors.headerText : theme.colors.labelText,
                },
              },
            },
          });
        } else if (elementType === UIElementType.Button && element.font) {
          console.log('[UIScreenTheme] Updating Button element:', element.name, 'backgroundColor:', theme.colors.buttonBg);
          dispatch({
            type: 'UPDATE_UI_ELEMENT',
            payload: {
              screenId,
              elementId: element.id,
              updates: {
                font: {
                  ...element.font,
                  color: theme.colors.buttonText,
                },
                backgroundColor: theme.colors.buttonBg,
                hoverBackgroundColor: theme.colors.buttonHover,
              },
            },
          });
        } else if (elementType === UIElementType.SettingsSlider) {
          console.log('[UIScreenTheme] Updating Slider element:', element.name);
          dispatch({
            type: 'UPDATE_UI_ELEMENT',
            payload: {
              screenId,
              elementId: element.id,
              updates: {
                trackColor: theme.colors.sliderTrack,
                thumbColor: theme.colors.sliderThumb,
              },
            },
          });
        } else if (elementType === UIElementType.SaveSlotGrid) {
          console.log('[UIScreenTheme] Updating SaveSlotGrid element:', element.name);
          dispatch({
            type: 'UPDATE_UI_ELEMENT',
            payload: {
              screenId,
              elementId: element.id,
              updates: {
                slotBackgroundColor: theme.colors.saveSlotBg,
                slotBorderColor: theme.colors.saveSlotBorder,
                slotHoverBorderColor: theme.colors.saveSlotHoverBorder,
                slotHeaderColor: theme.colors.saveSlotHeaderColor,
                font: {
                  ...element.font,
                  color: theme.colors.labelText,
                },
              },
            },
          });
        }
      });
    }
  }, [project, dispatch]);

  const applyThemeToAllScreens = useCallback((themeName: UIScreenThemeName) => {
    if (!project?.uiScreens) return;
    
    Object.keys(project.uiScreens).forEach((screenId) => {
      applyThemeToScreen(screenId as VNID, themeName);
    });
  }, [project, applyThemeToScreen]);

  const availableThemes = Object.values(uiScreenThemes).filter(t => t.name !== 'custom');

  return (
    <UIScreenThemeContext.Provider value={{ availableThemes, applyThemeToAllScreens, applyThemeToScreen }}>
      {children}
    </UIScreenThemeContext.Provider>
  );
};

export const useUIScreenTheme = () => {
  const context = useContext(UIScreenThemeContext);
  if (!context) {
    throw new Error('useUIScreenTheme must be used within a UIScreenThemeProvider');
  }
  return context;
};

export { uiScreenThemes };
