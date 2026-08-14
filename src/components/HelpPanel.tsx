import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CommandDoc {
  name: string;
  category: string;
  description: string;
  params: string[];
  example: string;
}

// Command docs. `name`/`category`/`params` are stable identifiers; the human-readable
// `description`/`example` are pulled from the `components.helpPanel.commands.<name>` keys.
const COMMAND_DOC_META: { name: string; category: string; params: string[] }[] = [
  { name: 'Dialogue', category: 'Story', params: ['text', 'characterId'] },
  { name: 'Choice', category: 'Story', params: ['options[]', 'text', 'actions'] },
  { name: 'BranchStart', category: 'Story', params: ['name', 'color', 'branchId'] },
  { name: 'BranchEnd', category: 'Story', params: ['branchId'] },
  { name: 'ShowCharacter', category: 'Visual', params: ['characterId', 'expressionId', 'position', 'transition', 'duration'] },
  { name: 'HideCharacter', category: 'Visual', params: ['characterId', 'transition', 'duration'] },
  { name: 'SetBackground', category: 'Visual', params: ['backgroundId', 'transition', 'duration'] },
  { name: 'ShowText', category: 'Visual', params: ['text', 'x', 'y', 'fontSize', 'fontFamily', 'color', 'transition', 'duration'] },
  { name: 'HideText', category: 'Visual', params: ['targetCommandId', 'transition', 'duration'] },
  { name: 'ShowImage', category: 'Visual', params: ['imageId', 'x', 'y', 'width', 'height', 'rotation', 'opacity', 'transition', 'duration'] },
  { name: 'HideImage', category: 'Visual', params: ['targetCommandId', 'transition', 'duration'] },
  { name: 'ShowButton', category: 'Visual', params: ['text', 'x', 'y', 'width', 'height', 'backgroundColor', 'textColor', 'onClick', 'transition'] },
  { name: 'HideButton', category: 'Visual', params: ['targetCommandId', 'transition', 'duration'] },
  { name: 'PlayMusic', category: 'Audio', params: ['audioId', 'loop', 'fadeDuration', 'volume'] },
  { name: 'StopMusic', category: 'Audio', params: ['fadeDuration'] },
  { name: 'PlaySoundEffect', category: 'Audio', params: ['audioId', 'volume'] },
  { name: 'StopSoundEffect', category: 'Audio', params: [] },
  { name: 'PlayMovie', category: 'Media', params: ['videoId', 'waitsForCompletion', 'displayMode', 'loop'] },
  { name: 'StopMovie', category: 'Media', params: [] },
  { name: 'SetVariable', category: 'Logic', params: ['variableId', 'operator', 'value', 'randomMin', 'randomMax'] },
  { name: 'TextInput', category: 'Logic', params: ['variableId', 'prompt', 'placeholder', 'maxLength'] },
  { name: 'Jump', category: 'Flow', params: ['targetSceneId'] },
  { name: 'Label', category: 'Flow', params: ['labelId'] },
  { name: 'JumpToLabel', category: 'Flow', params: ['labelId'] },
  { name: 'Wait', category: 'Flow', params: ['duration', 'waitForInput'] },
  { name: 'ShowScreen', category: 'Flow', params: ['screenId'] },
  { name: 'ShakeScreen', category: 'Effects', params: ['duration', 'intensity'] },
  { name: 'TintScreen', category: 'Effects', params: ['color', 'duration'] },
  { name: 'FlashScreen', category: 'Effects', params: ['color', 'duration'] },
  { name: 'PanZoomScreen', category: 'Effects', params: ['zoom', 'panX', 'panY', 'duration'] },
  { name: 'ResetScreenEffects', category: 'Effects', params: ['duration'] },
  { name: 'SetScreenOverlayEffect', category: 'Effects', params: ['effectType', 'intensity', 'variant', 'color'] },
  { name: 'GiveItem', category: 'Items', params: ['itemId', 'quantity'] },
  { name: 'UseItem', category: 'Items', params: ['itemId'] },
  { name: 'DestroyItem', category: 'Items', params: ['itemId', 'quantity', 'all'] },
  { name: 'RestockCollection', category: 'Items', params: ['collectionId'] },
  { name: 'BuyItem', category: 'Items', params: ['itemId', 'collectionId', 'quantity'] },
  { name: 'SellItem', category: 'Items', params: ['itemId', 'collectionId', 'quantity'] },
  { name: 'Group', category: 'Organization', params: ['name', 'commandIds'] },
];

const CATEGORIES = ['Story', 'Visual', 'Audio', 'Items', 'Logic', 'Flow', 'Effects', 'Organization'];

const CATEGORY_COLORS: Record<string, string> = {
  Story: '#f472b6',
  Visual: '#a78bfa',
  Audio: '#34d399',
  Items: '#10b981',
  Logic: '#fbbf24',
  Flow: '#60a5fa',
  Effects: '#fb923c',
  Organization: '#94a3b8',
};

interface SectionState {
  gettingStarted: boolean;
  commands: boolean;
  shortcuts: boolean;
  tips: boolean;
}

const KEYBOARD_SHORTCUT_META: { keys: string; key: string }[] = [
  { keys: 'Ctrl + Z', key: 'undo' },
  { keys: 'Ctrl + Y', key: 'redo' },
  { keys: 'Ctrl + Shift + Z', key: 'redoAlt' },
  { keys: 'Ctrl + S', key: 'save' },
  { keys: 'Delete', key: 'delete' },
  { keys: 'Ctrl + D', key: 'duplicate' },
  { keys: 'Ctrl + C', key: 'copy' },
  { keys: 'Ctrl + V', key: 'paste' },
  { keys: 'Space', key: 'play' },
  { keys: 'Escape', key: 'escape' },
];

const TIP_KEYS = ['organize', 'variables', 'preview', 'audio', 'labels', 'stacking', 'branches', 'effects', 'items', 'inventory', 'shop', 'hotkeys'];

const ChevronIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
  >
    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
  </svg>
);

const HelpPanel: React.FC<HelpPanelProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('components');

  const COMMAND_DOCS: CommandDoc[] = useMemo(() => COMMAND_DOC_META.map(m => ({
    ...m,
    description: t(`helpPanel.commands.${m.name}.desc`),
    example: t(`helpPanel.commands.${m.name}.example`),
  })), [t]);

  const KEYBOARD_SHORTCUTS = useMemo(() => KEYBOARD_SHORTCUT_META.map(m => ({
    keys: m.keys,
    action: t(`helpPanel.shortcuts.${m.key}`),
  })), [t]);

  const TIPS = useMemo(() => TIP_KEYS.map(k => ({
    title: t(`helpPanel.tips.${k}Title`),
    tip: t(`helpPanel.tips.${k}Tip`),
  })), [t]);

  const [searchQuery, setSearchQuery] = useState('');
  const [sections, setSections] = useState<SectionState>({
    gettingStarted: true,
    commands: true,
    shortcuts: false,
    tips: false,
  });

  const toggleSection = (section: keyof SectionState) => {
    setSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const filteredCommands = useMemo(() => {
    if (!searchQuery.trim()) return COMMAND_DOCS;
    const q = searchQuery.toLowerCase();
    return COMMAND_DOCS.filter(
      cmd =>
        cmd.name.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.params.some(p => p.toLowerCase().includes(q)) ||
        cmd.example.toLowerCase().includes(q)
    );
  }, [searchQuery, COMMAND_DOCS]);

  const filteredShortcuts = useMemo(() => {
    if (!searchQuery.trim()) return KEYBOARD_SHORTCUTS;
    const q = searchQuery.toLowerCase();
    return KEYBOARD_SHORTCUTS.filter(
      s => s.keys.toLowerCase().includes(q) || s.action.toLowerCase().includes(q)
    );
  }, [searchQuery, KEYBOARD_SHORTCUTS]);

  const filteredTips = useMemo(() => {
    if (!searchQuery.trim()) return TIPS;
    const q = searchQuery.toLowerCase();
    return TIPS.filter(
      item => item.title.toLowerCase().includes(q) || item.tip.toLowerCase().includes(q)
    );
  }, [searchQuery, TIPS]);

  const hasGettingStartedMatch = useMemo(() => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const text = 'getting started project scene preview create add play editor hub';
    return text.includes(q);
  }, [searchQuery]);

  const groupedCommands = useMemo((): Array<[string, CommandDoc[]]> => {
    const result: Array<[string, CommandDoc[]]> = [];
    for (const cat of CATEGORIES) {
      const cmds = filteredCommands.filter(c => c.category === cat);
      if (cmds.length > 0) result.push([cat, cmds]);
    }
    return result;
  }, [filteredCommands]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity duration-300"
          onMouseDown={onClose}
        />
      )}
      <div
        className={`fixed top-0 right-0 h-full w-[400px] z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          backgroundColor: '#0f172a',
          borderLeft: '1px solid #334155',
          boxShadow: '-8px 0 30px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <span className="text-lg">📖</span>
            <h2 className="text-white font-semibold text-base">{t('helpPanel.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-white p-1 rounded-md hover:bg-[var(--bg-primary)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <div className="relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            >
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              autoFocus
              placeholder={t('helpPanel.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--bg-primary)] text-white text-sm pl-9 pr-3 py-2 rounded-lg border border-[var(--border-default)] focus:border-cyan-500 focus:outline-none placeholder-slate-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 #0f172a' }}>
          {hasGettingStartedMatch && (
            <div className="border-b border-[var(--border-subtle)]/50">
              <button
                onClick={() => toggleSection('gettingStarted')}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--bg-primary)]/50 transition-colors"
              >
                <ChevronIcon isOpen={sections.gettingStarted} />
                <span className="text-cyan-400 font-medium text-sm">{t('helpPanel.gettingStarted')}</span>
              </button>
              {sections.gettingStarted && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="bg-[var(--bg-primary)]/50 rounded-lg p-3">
                    <h4 className="text-white text-xs font-semibold mb-1">{t('helpPanel.gs.step1Title')}</h4>
                    <p className="text-[var(--text-secondary)] text-xs leading-relaxed">{t('helpPanel.gs.step1Desc')}</p>
                  </div>
                  <div className="bg-[var(--bg-primary)]/50 rounded-lg p-3">
                    <h4 className="text-white text-xs font-semibold mb-1">{t('helpPanel.gs.step2Title')}</h4>
                    <p className="text-[var(--text-secondary)] text-xs leading-relaxed">{t('helpPanel.gs.step2Desc')}</p>
                  </div>
                  <div className="bg-[var(--bg-primary)]/50 rounded-lg p-3">
                    <h4 className="text-white text-xs font-semibold mb-1">{t('helpPanel.gs.step3Title')}</h4>
                    <p className="text-[var(--text-secondary)] text-xs leading-relaxed">{t('helpPanel.gs.step3Desc')}</p>
                  </div>
                  <div className="bg-[var(--bg-primary)]/50 rounded-lg p-3">
                    <h4 className="text-white text-xs font-semibold mb-1">{t('helpPanel.gs.step4Title')}</h4>
                    <p className="text-[var(--text-secondary)] text-xs leading-relaxed">{t('helpPanel.gs.step4Desc')}</p>
                  </div>
                  <div className="bg-[var(--bg-primary)]/50 rounded-lg p-3">
                    <h4 className="text-white text-xs font-semibold mb-1">{t('helpPanel.gs.step5Title')}</h4>
                    <p className="text-[var(--text-secondary)] text-xs leading-relaxed">{t('helpPanel.gs.step5Desc')}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {filteredCommands.length > 0 && (
            <div className="border-b border-[var(--border-subtle)]/50">
              <button
                onClick={() => toggleSection('commands')}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--bg-primary)]/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ChevronIcon isOpen={sections.commands} />
                  <span className="text-cyan-400 font-medium text-sm">{t('helpPanel.eventsReference')}</span>
                </div>
                <span className="text-[var(--text-muted)] text-xs">{t('helpPanel.eventsCount', { count: filteredCommands.length })}</span>
              </button>
              {sections.commands && (
                <div className="px-4 pb-4 space-y-4">
                  {groupedCommands.map(([category, cmds]) => (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: CATEGORY_COLORS[category] || '#94a3b8' }}
                        />
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: CATEGORY_COLORS[category] || '#94a3b8' }}>
                          {t(`helpPanel.categories.${category}`, { defaultValue: category })}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {cmds.map(cmd => (
                          <CommandCard key={cmd.name} cmd={cmd} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {filteredShortcuts.length > 0 && (
            <div className="border-b border-[var(--border-subtle)]/50">
              <button
                onClick={() => toggleSection('shortcuts')}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--bg-primary)]/50 transition-colors"
              >
                <ChevronIcon isOpen={sections.shortcuts} />
                <span className="text-cyan-400 font-medium text-sm">{t('helpPanel.keyboardShortcuts')}</span>
              </button>
              {sections.shortcuts && (
                <div className="px-4 pb-4 space-y-1">
                  {filteredShortcuts.map((shortcut, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[var(--bg-primary)]/50">
                      <span className="text-[var(--text-primary)] text-xs">{shortcut.action}</span>
                      <kbd className="bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-primary)] text-[10px] px-2 py-0.5 rounded font-mono">
                        {shortcut.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {filteredTips.length > 0 && (
            <div className="border-b border-[var(--border-subtle)]/50">
              <button
                onClick={() => toggleSection('tips')}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--bg-primary)]/50 transition-colors"
              >
                <ChevronIcon isOpen={sections.tips} />
                <span className="text-cyan-400 font-medium text-sm">{t('helpPanel.tipsTricks')}</span>
              </button>
              {sections.tips && (
                <div className="px-4 pb-4 space-y-2">
                  {filteredTips.map((tip, i) => (
                    <div key={i} className="bg-[var(--bg-primary)]/50 rounded-lg p-3">
                      <h4 className="text-amber-400 text-xs font-semibold mb-1">💡 {tip.title}</h4>
                      <p className="text-[var(--text-secondary)] text-xs leading-relaxed">{tip.tip}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {searchQuery && filteredCommands.length === 0 && filteredShortcuts.length === 0 && filteredTips.length === 0 && !hasGettingStartedMatch && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <span className="text-3xl mb-3">🔍</span>
              <p className="text-[var(--text-secondary)] text-sm">{t('helpPanel.noResults', { query: searchQuery })}</p>
              <p className="text-[var(--text-muted)] text-xs mt-1">{t('helpPanel.noResultsHint')}</p>
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]/80">
          <p className="text-[var(--text-muted)] text-[10px] text-center">{t('helpPanel.footer')}</p>
        </div>
      </div>
    </>
  );
};

const CommandCard: React.FC<{ cmd: CommandDoc }> = ({ cmd }) => {
  const { t } = useTranslation('components');
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="bg-[var(--bg-primary)]/60 rounded-lg border border-[var(--border-subtle)]/50 overflow-hidden cursor-pointer hover:border-[var(--border-default)] transition-colors"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <code className="text-white text-xs font-mono font-semibold">{cmd.name}</code>
        </div>
        <ChevronIcon isOpen={isExpanded} />
      </div>
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-[var(--border-subtle)]/30 pt-2">
          <p className="text-[var(--text-primary)] text-xs leading-relaxed">{cmd.description}</p>
          {cmd.params.length > 0 && (
            <div>
              <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider font-semibold">{t('helpPanel.parameters')}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {cmd.params.map(p => (
                  <span key={p} className="bg-[var(--bg-secondary)]/80 text-cyan-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider font-semibold">{t('helpPanel.example')}</span>
            <p className="text-emerald-400/80 text-xs mt-0.5 italic">"{cmd.example}"</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default HelpPanel;
