import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTheme, ThemeName } from '../contexts/ThemeContext';

const ThemeSelector: React.FC = () => {
  const { themeName, setTheme, availableThemes } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right
      });
    }
  }, [isOpen]);

  const currentTheme = availableThemes.find(t => t.name === themeName);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="bg-[var(--bg-tertiary)] hover:bg-[var(--slate-600)] text-[var(--text-primary)] font-bold px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors text-xs"
        title="Change editor theme"
      >
        <span
          className="w-3 h-3 rounded-full border border-white/30"
          style={{ background: `linear-gradient(135deg, ${currentTheme?.colors.bgPrimary} 50%, ${currentTheme?.colors.accentPurple} 50%)` }}
        />
        Theme
      </button>

      {isOpen && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed bg-[var(--bg-secondary)] border border-[var(--slate-700)] rounded-lg shadow-xl min-w-[180px] overflow-hidden"
          style={{ 
            top: dropdownPos.top, 
            right: dropdownPos.right,
            zIndex: 9999
          }}
        >
          <div className="p-2 border-b border-[var(--slate-700)]">
            <span className="text-xs text-[var(--text-secondary)] font-semibold">Editor Theme</span>
          </div>
          <div className="p-1">
            {availableThemes.map((theme) => (
              <button
                key={theme.name}
                onClick={() => {
                  setTheme(theme.name as ThemeName);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                  themeName === theme.name
                    ? 'bg-[var(--accent-purple)]/20 text-[var(--accent-cyan)]'
                    : 'hover:bg-[var(--slate-700)] text-[var(--text-primary)]'
                }`}
              >
                <span
                  className="w-4 h-4 rounded-full border border-white/30 flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${theme.colors.bgPrimary} 50%, ${theme.colors.accentPurple} 50%)` }}
                />
                <span>{theme.label}</span>
                {themeName === theme.name && (
                  <span className="ml-auto text-[var(--accent-green)]">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ThemeSelector;
