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
        top: rect.bottom + 8,
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
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 hover:scale-[1.02]"
        style={{
          background: 'linear-gradient(135deg, var(--bg-tertiary), var(--bg-secondary))',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)',
          boxShadow: isOpen ? '0 0 15px color-mix(in srgb, var(--accent-lavender) 30%, transparent)' : 'none'
        }}
        title="Change editor theme"
      >
        <span className="text-base">{currentTheme?.emoji || '🎨'}</span>
        <span
          className="w-3 h-3 rounded-full border border-white/30"
          style={{ 
            background: `linear-gradient(135deg, ${currentTheme?.colors.accentPink} 0%, ${currentTheme?.colors.accentCyan} 50%, ${currentTheme?.colors.accentLavender} 100%)` 
          }}
        />
        <span>Theme</span>
      </button>

      {isOpen && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed min-w-[220px] overflow-hidden"
          style={{ 
            top: dropdownPos.top, 
            right: dropdownPos.right,
            zIndex: 9999,
            background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-primary))',
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            boxShadow: `
              0 10px 40px rgba(0, 0, 0, 0.4),
              0 0 30px color-mix(in srgb, var(--accent-pink) 15%, transparent),
              inset 0 1px 0 rgba(255, 255, 255, 0.05)
            `
          }}
        >
          {/* Rainbow header bar */}
          <div 
            className="h-1"
            style={{
              background: 'linear-gradient(90deg, var(--accent-pink), var(--accent-peach), var(--accent-yellow), var(--accent-mint), var(--accent-cyan), var(--accent-lavender))'
            }}
          />
          <div className="p-3 border-b border-[var(--border-subtle)]">
            <span className="text-xs text-[var(--text-secondary)] font-semibold tracking-wide uppercase">✨ Editor Theme</span>
          </div>
          <div className="p-2">
            {availableThemes.map((theme) => {
              const isSelected = themeName === theme.name;
              return (
                <button
                  key={theme.name}
                  onClick={() => {
                    setTheme(theme.name as ThemeName);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-all duration-200 ${
                    isSelected
                      ? 'text-white'
                      : 'hover:scale-[1.01] text-[var(--text-primary)]'
                  }`}
                  style={isSelected ? {
                    background: `linear-gradient(135deg, ${theme.colors.accentPink}, ${theme.colors.accentLavender})`,
                    boxShadow: `0 0 15px color-mix(in srgb, ${theme.colors.accentPink} 40%, transparent)`
                  } : {
                    background: 'transparent'
                  }}
                >
                  <span className="text-lg">{theme.emoji}</span>
                  <span
                    className="w-5 h-5 rounded-full border-2 flex-shrink-0 transition-transform duration-200"
                    style={{ 
                      background: `linear-gradient(135deg, ${theme.colors.bgPrimary} 25%, ${theme.colors.accentPink} 50%, ${theme.colors.accentCyan} 75%, ${theme.colors.accentLavender} 100%)`,
                      borderColor: isSelected ? 'white' : 'rgba(255,255,255,0.2)'
                    }}
                  />
                  <span className="font-medium">{theme.label}</span>
                  {isSelected && (
                    <span className="ml-auto text-white">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ThemeSelector;
