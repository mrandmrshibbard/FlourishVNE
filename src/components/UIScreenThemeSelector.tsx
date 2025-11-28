import React, { useState, useRef, useEffect } from 'react';
import { useUIScreenTheme, UIScreenThemeName } from '../contexts/UIScreenThemeContext';
import { SwatchIcon } from './icons';

interface UIScreenThemeSelectorProps {
  /** If provided, only apply to this screen. Otherwise applies to all screens */
  screenId?: string;
  /** Label to show before the selector */
  label?: string;
  /** Additional CSS class */
  className?: string;
}

const UIScreenThemeSelector: React.FC<UIScreenThemeSelectorProps> = ({ 
  screenId, 
  label = 'Apply Theme', 
  className = '' 
}) => {
  const { availableThemes, applyThemeToAllScreens, applyThemeToScreen } = useUIScreenTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleThemeSelect = (themeName: UIScreenThemeName) => {
    if (screenId) {
      applyThemeToScreen(screenId as any, themeName);
    } else {
      applyThemeToAllScreens(themeName);
    }
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-md transition-colors border border-slate-600"
        title={screenId ? 'Apply theme to this screen' : 'Apply theme to all UI screens'}
      >
        <SwatchIcon className="w-4 h-4" />
        <span>{label}</span>
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 w-64 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-slate-700 text-xs text-slate-400">
            {screenId ? 'Apply to this screen' : 'Apply to all UI screens'}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {availableThemes.map((theme) => (
              <button
                key={theme.name}
                onClick={() => handleThemeSelect(theme.name)}
                className="w-full flex items-start gap-3 p-3 hover:bg-slate-700 transition-colors text-left"
              >
                {/* Color preview swatches */}
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <div
                    className="w-8 h-8 rounded border border-slate-500"
                    style={{ backgroundColor: theme.colors.background }}
                    title="Background"
                  />
                  <div className="flex gap-0.5">
                    <div
                      className="w-4 h-4 rounded-sm border border-slate-500"
                      style={{ backgroundColor: theme.colors.buttonBg }}
                      title="Button"
                    />
                    <div
                      className="w-4 h-4 rounded-sm border border-slate-500"
                      style={{ backgroundColor: theme.colors.sliderThumb }}
                      title="Accent"
                    />
                  </div>
                </div>
                
                {/* Theme info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{theme.label}</div>
                  <div className="text-xs text-slate-400 truncate">{theme.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default UIScreenThemeSelector;
