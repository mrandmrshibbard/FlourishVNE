import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type ThemeName = 'rainbow' | 'midnight' | 'ocean' | 'forest' | 'sunset' | 'sakura';

export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgElevated: string;
  accentPink: string;
  accentCyan: string;
  accentPurple: string;
  accentSky: string;
  accentBlue: string;
  accentYellow: string;
  accentRed: string;
  accentGreen: string;
  accentPeach: string;
  accentMint: string;
  accentLavender: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  slate900: string;
  slate800: string;
  slate700: string;
  slate600: string;
  slate500: string;
  slate400: string;
  // Gradient backgrounds for the theme
  gradientBg: string;
}

export interface Theme {
  name: ThemeName;
  label: string;
  emoji: string;
  colors: ThemeColors;
}

const themes: Record<ThemeName, Theme> = {
  rainbow: {
    name: 'rainbow',
    label: 'Rainbow Dream',
    emoji: '🌈',
    colors: {
      bgPrimary: '#0f0a19',
      bgSecondary: '#1a1229',
      bgTertiary: '#251a3a',
      bgElevated: '#322450',
      accentPink: '#ff7eb3',
      accentCyan: '#7effff',
      accentPurple: '#b87eff',
      accentSky: '#7eb8ff',
      accentBlue: '#7e9eff',
      accentYellow: '#ffe57e',
      accentRed: '#ff8f8f',
      accentGreen: '#7effb8',
      accentPeach: '#ffb87e',
      accentMint: '#7effb8',
      accentLavender: '#b87eff',
      textPrimary: '#fff8fc',
      textSecondary: '#e0d0f0',
      textTertiary: '#b0a0c8',
      textMuted: '#8070a0',
      slate900: '#0f0a19',
      slate800: '#1a1229',
      slate700: '#251a3a',
      slate600: '#3d2d5c',
      slate500: '#5a4578',
      slate400: '#8878a8',
      gradientBg: `
        radial-gradient(ellipse at 10% 20%, rgba(255, 126, 179, 0.08) 0%, transparent 40%),
        radial-gradient(ellipse at 90% 80%, rgba(126, 255, 255, 0.06) 0%, transparent 40%),
        radial-gradient(ellipse at 50% 50%, rgba(184, 126, 255, 0.05) 0%, transparent 50%)
      `,
    },
  },
  sakura: {
    name: 'sakura',
    label: 'Sakura Blossom',
    emoji: '🌸',
    colors: {
      bgPrimary: '#1a0f18',
      bgSecondary: '#2a1525',
      bgTertiary: '#3d1f38',
      bgElevated: '#4d2848',
      accentPink: '#ff8fbf',
      accentCyan: '#8fd9d9',
      accentPurple: '#c08fff',
      accentSky: '#8fc8ff',
      accentBlue: '#8fb8ff',
      accentYellow: '#ffd98f',
      accentRed: '#ff9f9f',
      accentGreen: '#8fd9a8',
      accentPeach: '#ffc8a8',
      accentMint: '#8fd9bf',
      accentLavender: '#c8a8ff',
      textPrimary: '#fff5f8',
      textSecondary: '#f0d0e0',
      textTertiary: '#c8a0b8',
      textMuted: '#a07090',
      slate900: '#1a0f18',
      slate800: '#2a1525',
      slate700: '#3d1f38',
      slate600: '#502848',
      slate500: '#703860',
      slate400: '#a06088',
      gradientBg: `
        radial-gradient(ellipse at 20% 30%, rgba(255, 143, 191, 0.12) 0%, transparent 45%),
        radial-gradient(ellipse at 80% 70%, rgba(255, 200, 168, 0.08) 0%, transparent 40%),
        radial-gradient(ellipse at 50% 90%, rgba(192, 143, 255, 0.06) 0%, transparent 35%)
      `,
    },
  },
  midnight: {
    name: 'midnight',
    label: 'Midnight Galaxy',
    emoji: '🌙',
    colors: {
      bgPrimary: '#08080f',
      bgSecondary: '#10101a',
      bgTertiary: '#1a1a28',
      bgElevated: '#252538',
      accentPink: '#f472b6',
      accentCyan: '#22d3ee',
      accentPurple: '#a78bfa',
      accentSky: '#38bdf8',
      accentBlue: '#60a5fa',
      accentYellow: '#facc15',
      accentRed: '#f87171',
      accentGreen: '#4ade80',
      accentPeach: '#fdba74',
      accentMint: '#6ee7b7',
      accentLavender: '#c4b5fd',
      textPrimary: '#f0f0f8',
      textSecondary: '#a8a8c0',
      textTertiary: '#707090',
      textMuted: '#505068',
      slate900: '#08080f',
      slate800: '#10101a',
      slate700: '#1a1a28',
      slate600: '#2a2a40',
      slate500: '#404058',
      slate400: '#606080',
      gradientBg: `
        radial-gradient(ellipse at 30% 20%, rgba(167, 139, 250, 0.08) 0%, transparent 45%),
        radial-gradient(ellipse at 70% 80%, rgba(34, 211, 238, 0.06) 0%, transparent 40%),
        radial-gradient(ellipse at 90% 10%, rgba(244, 114, 182, 0.05) 0%, transparent 30%)
      `,
    },
  },
  ocean: {
    name: 'ocean',
    label: 'Ocean Depths',
    emoji: '🌊',
    colors: {
      bgPrimary: '#0a1520',
      bgSecondary: '#102030',
      bgTertiary: '#183048',
      bgElevated: '#204060',
      accentPink: '#ff8fbf',
      accentCyan: '#40e8e0',
      accentPurple: '#9090ff',
      accentSky: '#40c8ff',
      accentBlue: '#4090ff',
      accentYellow: '#ffd060',
      accentRed: '#ff7070',
      accentGreen: '#40d890',
      accentPeach: '#ffb090',
      accentMint: '#60f0c0',
      accentLavender: '#a0a0ff',
      textPrimary: '#e8f8ff',
      textSecondary: '#90d0f0',
      textTertiary: '#60a0c8',
      textMuted: '#4080a0',
      slate900: '#0a1520',
      slate800: '#102030',
      slate700: '#183048',
      slate600: '#204060',
      slate500: '#306080',
      slate400: '#5090b0',
      gradientBg: `
        radial-gradient(ellipse at 20% 80%, rgba(64, 232, 224, 0.1) 0%, transparent 45%),
        radial-gradient(ellipse at 80% 20%, rgba(64, 200, 255, 0.08) 0%, transparent 40%),
        radial-gradient(ellipse at 50% 50%, rgba(96, 240, 192, 0.05) 0%, transparent 50%)
      `,
    },
  },
  forest: {
    name: 'forest',
    label: 'Enchanted Forest',
    emoji: '🌿',
    colors: {
      bgPrimary: '#0a150f',
      bgSecondary: '#10251a',
      bgTertiary: '#1a3828',
      bgElevated: '#254a38',
      accentPink: '#ff9fb8',
      accentCyan: '#60e8d0',
      accentPurple: '#b090e8',
      accentSky: '#70c8f0',
      accentBlue: '#70a8e8',
      accentYellow: '#e8d060',
      accentRed: '#e87070',
      accentGreen: '#60e898',
      accentPeach: '#e8b890',
      accentMint: '#80f8c0',
      accentLavender: '#c0a8f0',
      textPrimary: '#e8fff0',
      textSecondary: '#a0e0c0',
      textTertiary: '#70b898',
      textMuted: '#509070',
      slate900: '#0a150f',
      slate800: '#10251a',
      slate700: '#1a3828',
      slate600: '#254a38',
      slate500: '#386050',
      slate400: '#609078',
      gradientBg: `
        radial-gradient(ellipse at 30% 70%, rgba(96, 232, 152, 0.1) 0%, transparent 45%),
        radial-gradient(ellipse at 70% 30%, rgba(128, 248, 192, 0.07) 0%, transparent 40%),
        radial-gradient(ellipse at 50% 90%, rgba(176, 144, 232, 0.05) 0%, transparent 35%)
      `,
    },
  },
  sunset: {
    name: 'sunset',
    label: 'Golden Sunset',
    emoji: '🌅',
    colors: {
      bgPrimary: '#151008',
      bgSecondary: '#251a10',
      bgTertiary: '#382818',
      bgElevated: '#4a3820',
      accentPink: '#ff90a8',
      accentCyan: '#70d8d8',
      accentPurple: '#c090d8',
      accentSky: '#70b8e0',
      accentBlue: '#70a0d8',
      accentYellow: '#ffd040',
      accentRed: '#ff7060',
      accentGreen: '#70d890',
      accentPeach: '#ffb070',
      accentMint: '#80e8b0',
      accentLavender: '#c8a0e0',
      textPrimary: '#fff8e8',
      textSecondary: '#e8d0a0',
      textTertiary: '#c0a070',
      textMuted: '#987850',
      slate900: '#151008',
      slate800: '#251a10',
      slate700: '#382818',
      slate600: '#4a3820',
      slate500: '#685030',
      slate400: '#987858',
      gradientBg: `
        radial-gradient(ellipse at 70% 80%, rgba(255, 176, 112, 0.12) 0%, transparent 45%),
        radial-gradient(ellipse at 30% 30%, rgba(255, 208, 64, 0.08) 0%, transparent 40%),
        radial-gradient(ellipse at 90% 50%, rgba(255, 112, 96, 0.06) 0%, transparent 35%)
      `,
    },
  },
};

interface ThemeContextValue {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  availableThemes: Theme[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = 'flourish-editor-theme';

const applyThemeToDocument = (theme: Theme) => {
  const root = document.documentElement;
  const { colors } = theme;
  
  // Background colors
  root.style.setProperty('--bg-primary', colors.bgPrimary);
  root.style.setProperty('--bg-secondary', colors.bgSecondary);
  root.style.setProperty('--bg-tertiary', colors.bgTertiary);
  root.style.setProperty('--bg-elevated', colors.bgElevated);
  
  // Accent colors
  root.style.setProperty('--accent-pink', colors.accentPink);
  root.style.setProperty('--accent-cyan', colors.accentCyan);
  root.style.setProperty('--accent-purple', colors.accentPurple);
  root.style.setProperty('--accent-sky', colors.accentSky);
  root.style.setProperty('--accent-blue', colors.accentBlue);
  root.style.setProperty('--accent-yellow', colors.accentYellow);
  root.style.setProperty('--accent-red', colors.accentRed);
  root.style.setProperty('--accent-green', colors.accentGreen);
  root.style.setProperty('--accent-peach', colors.accentPeach);
  root.style.setProperty('--accent-mint', colors.accentMint);
  root.style.setProperty('--accent-lavender', colors.accentLavender);
  
  // Text colors
  root.style.setProperty('--text-primary', colors.textPrimary);
  root.style.setProperty('--text-secondary', colors.textSecondary);
  root.style.setProperty('--text-tertiary', colors.textTertiary);
  root.style.setProperty('--text-muted', colors.textMuted);
  
  // Slate scale
  root.style.setProperty('--slate-900', colors.slate900);
  root.style.setProperty('--slate-800', colors.slate800);
  root.style.setProperty('--slate-700', colors.slate700);
  root.style.setProperty('--slate-600', colors.slate600);
  root.style.setProperty('--slate-500', colors.slate500);
  root.style.setProperty('--slate-400', colors.slate400);
  
  // Gradient background
  root.style.setProperty('--gradient-bg', colors.gradientBg);
  
  // Also set pastel variants based on the accent colors
  root.style.setProperty('--pastel-pink', colors.accentPink);
  root.style.setProperty('--pastel-cyan', colors.accentCyan);
  root.style.setProperty('--pastel-purple', colors.accentPurple);
  root.style.setProperty('--pastel-yellow', colors.accentYellow);
  root.style.setProperty('--pastel-mint', colors.accentMint);
  root.style.setProperty('--pastel-peach', colors.accentPeach);
  root.style.setProperty('--pastel-lavender', colors.accentLavender);
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      // Handle migration from old 'purple' theme to new 'rainbow' theme
      if (stored === 'purple') {
        return 'rainbow';
      }
      if (stored && themes[stored as ThemeName]) {
        return stored as ThemeName;
      }
    } catch (e) {
      // localStorage unavailable
    }
    return 'rainbow';
  });

  const theme = themes[themeName];

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeName(name);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, name);
    } catch (e) {
      // localStorage unavailable
    }
  }, []);

  const availableThemes = Object.values(themes);

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme, availableThemes }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export { themes };
