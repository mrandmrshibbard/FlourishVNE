import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type ThemeName = 'purple' | 'midnight' | 'ocean' | 'forest' | 'sunset';

export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  accentPink: string;
  accentCyan: string;
  accentPurple: string;
  accentSky: string;
  accentBlue: string;
  accentYellow: string;
  accentRed: string;
  accentGreen: string;
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
}

export interface Theme {
  name: ThemeName;
  label: string;
  colors: ThemeColors;
}

const themes: Record<ThemeName, Theme> = {
  purple: {
    name: 'purple',
    label: 'Purple Dream',
    colors: {
      bgPrimary: '#1a102c',
      bgSecondary: '#2a1a45',
      bgTertiary: '#4D3273',
      accentPink: '#ff00a5',
      accentCyan: '#00f2ea',
      accentPurple: '#8a2be2',
      accentSky: '#0ea5e9',
      accentBlue: '#3b82f6',
      accentYellow: '#fbbf24',
      accentRed: '#ef4444',
      accentGreen: '#10b981',
      textPrimary: '#f0e6ff',
      textSecondary: '#c0b4d4',
      textTertiary: '#94a3b8',
      textMuted: '#64748b',
      slate900: '#0f172a',
      slate800: '#1e293b',
      slate700: '#334155',
      slate600: '#475569',
      slate500: '#64748b',
      slate400: '#94a3b8',
    },
  },
  midnight: {
    name: 'midnight',
    label: 'Midnight',
    colors: {
      bgPrimary: '#0a0a0f',
      bgSecondary: '#12121a',
      bgTertiary: '#1e1e2e',
      accentPink: '#f472b6',
      accentCyan: '#22d3ee',
      accentPurple: '#a78bfa',
      accentSky: '#38bdf8',
      accentBlue: '#60a5fa',
      accentYellow: '#facc15',
      accentRed: '#f87171',
      accentGreen: '#4ade80',
      textPrimary: '#e4e4e7',
      textSecondary: '#a1a1aa',
      textTertiary: '#71717a',
      textMuted: '#52525b',
      slate900: '#09090b',
      slate800: '#18181b',
      slate700: '#27272a',
      slate600: '#3f3f46',
      slate500: '#52525b',
      slate400: '#71717a',
    },
  },
  ocean: {
    name: 'ocean',
    label: 'Ocean Depths',
    colors: {
      bgPrimary: '#0c1929',
      bgSecondary: '#0f2942',
      bgTertiary: '#1a4066',
      accentPink: '#ec4899',
      accentCyan: '#06b6d4',
      accentPurple: '#818cf8',
      accentSky: '#0ea5e9',
      accentBlue: '#3b82f6',
      accentYellow: '#eab308',
      accentRed: '#ef4444',
      accentGreen: '#22c55e',
      textPrimary: '#e0f2fe',
      textSecondary: '#7dd3fc',
      textTertiary: '#38bdf8',
      textMuted: '#0284c7',
      slate900: '#082f49',
      slate800: '#0c4a6e',
      slate700: '#075985',
      slate600: '#0369a1',
      slate500: '#0284c7',
      slate400: '#0ea5e9',
    },
  },
  forest: {
    name: 'forest',
    label: 'Forest Grove',
    colors: {
      bgPrimary: '#0d1f14',
      bgSecondary: '#14321f',
      bgTertiary: '#1f4a2e',
      accentPink: '#f472b6',
      accentCyan: '#2dd4bf',
      accentPurple: '#a78bfa',
      accentSky: '#38bdf8',
      accentBlue: '#60a5fa',
      accentYellow: '#fbbf24',
      accentRed: '#f87171',
      accentGreen: '#4ade80',
      textPrimary: '#dcfce7',
      textSecondary: '#86efac',
      textTertiary: '#4ade80',
      textMuted: '#22c55e',
      slate900: '#052e16',
      slate800: '#14532d',
      slate700: '#166534',
      slate600: '#15803d',
      slate500: '#16a34a',
      slate400: '#22c55e',
    },
  },
  sunset: {
    name: 'sunset',
    label: 'Sunset Glow',
    colors: {
      bgPrimary: '#1c1410',
      bgSecondary: '#2d1f18',
      bgTertiary: '#4a3228',
      accentPink: '#fb7185',
      accentCyan: '#2dd4bf',
      accentPurple: '#c084fc',
      accentSky: '#38bdf8',
      accentBlue: '#60a5fa',
      accentYellow: '#fbbf24',
      accentRed: '#f87171',
      accentGreen: '#4ade80',
      textPrimary: '#fef3c7',
      textSecondary: '#fcd34d',
      textTertiary: '#f59e0b',
      textMuted: '#d97706',
      slate900: '#1c1917',
      slate800: '#292524',
      slate700: '#44403c',
      slate600: '#57534e',
      slate500: '#78716c',
      slate400: '#a8a29e',
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
  
  root.style.setProperty('--bg-primary', colors.bgPrimary);
  root.style.setProperty('--bg-secondary', colors.bgSecondary);
  root.style.setProperty('--bg-tertiary', colors.bgTertiary);
  root.style.setProperty('--accent-pink', colors.accentPink);
  root.style.setProperty('--accent-cyan', colors.accentCyan);
  root.style.setProperty('--accent-purple', colors.accentPurple);
  root.style.setProperty('--accent-sky', colors.accentSky);
  root.style.setProperty('--accent-blue', colors.accentBlue);
  root.style.setProperty('--accent-yellow', colors.accentYellow);
  root.style.setProperty('--accent-red', colors.accentRed);
  root.style.setProperty('--accent-green', colors.accentGreen);
  root.style.setProperty('--text-primary', colors.textPrimary);
  root.style.setProperty('--text-secondary', colors.textSecondary);
  root.style.setProperty('--text-tertiary', colors.textTertiary);
  root.style.setProperty('--text-muted', colors.textMuted);
  root.style.setProperty('--slate-900', colors.slate900);
  root.style.setProperty('--slate-800', colors.slate800);
  root.style.setProperty('--slate-700', colors.slate700);
  root.style.setProperty('--slate-600', colors.slate600);
  root.style.setProperty('--slate-500', colors.slate500);
  root.style.setProperty('--slate-400', colors.slate400);
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored && themes[stored as ThemeName]) {
        return stored as ThemeName;
      }
    } catch (e) {
      // localStorage unavailable
    }
    return 'purple';
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
