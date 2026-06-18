import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizationService, StringEntry, LanguageConfig } from '../features/localization/LocalizationService';

interface LocalizationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
}

const COMMON_LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'ja', name: 'Japanese' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
];

const LocalizationPanel: React.FC<LocalizationPanelProps> = ({ isOpen, onClose, project }) => {
  const { t } = useTranslation('contextPanels');
  const [service] = useState(() => new LocalizationService());
  const [languages, setLanguages] = useState<LanguageConfig[]>([]);
  const [strings, setStrings] = useState<StringEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && project) {
      service.initializeFromProject(project);
      refreshState();
    }
  }, [isOpen, project]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowLangDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const refreshState = () => {
    setLanguages([...service.getLanguages()]);
    setStrings([...service.getStrings()]);
  };

  const handleAddLanguage = (code: string, name: string) => {
    service.addLanguage(code, name);
    refreshState();
    setShowLangDropdown(false);
  };

  const handleRemoveLanguage = (code: string) => {
    service.removeLanguage(code);
    refreshState();
  };

  const handleTranslationChange = (stringId: string, langCode: string, text: string) => {
    service.setTranslation(stringId, langCode, text);
    refreshState();
  };

  const handleExportCSV = () => {
    const csv = service.exportCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'localization.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const result = service.importCSV(content);
      setImportResult(result);
      refreshState();
      setTimeout(() => setImportResult(null), 5000);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const additionalLanguages = languages.filter(l => !l.isDefault);
  const availableToAdd = COMMON_LANGUAGES.filter(cl => !languages.find(l => l.code === cl.code));

  const filteredStrings = useMemo(() => {
    let result = strings;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.key.toLowerCase().includes(q) ||
        s.defaultText.toLowerCase().includes(q) ||
        (s.context || '').toLowerCase().includes(q)
      );
    }
    if (tagFilter !== 'all') {
      result = result.filter(s => s.tags.includes(tagFilter));
    }
    return result;
  }, [strings, searchQuery, tagFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--bg-primary)] w-[95vw] h-[90vh] rounded-xl border border-[var(--border-subtle)] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌐</span>
            <h2 className="text-xl font-bold text-white">{t('localizationPanel.title')}</h2>
            <span className="text-sm text-[var(--text-secondary)]">
              {t('localizationPanel.stringCount', { count: strings.length })}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-white p-2 rounded-lg hover:bg-[var(--bg-primary)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-3 border-b border-[var(--border-subtle)] flex items-center gap-3 flex-wrap">
          {languages.map(lang => (
            <div
              key={lang.code}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border"
              style={{
                background: lang.isDefault ? 'rgba(59, 130, 246, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                borderColor: lang.isDefault ? 'rgba(59, 130, 246, 0.4)' : 'rgba(100, 116, 139, 0.3)',
                color: lang.isDefault ? '#93c5fd' : '#cbd5e1'
              }}
            >
              <span className="font-medium">{lang.name}</span>
              <span className="text-xs opacity-70">({lang.code})</span>
              <span
                className="text-xs font-mono px-1.5 py-0.5 rounded"
                style={{
                  background: lang.completionPercent === 100
                    ? 'rgba(34, 197, 94, 0.2)'
                    : lang.completionPercent > 50
                      ? 'rgba(234, 179, 8, 0.2)'
                      : 'rgba(239, 68, 68, 0.2)',
                  color: lang.completionPercent === 100
                    ? '#86efac'
                    : lang.completionPercent > 50
                      ? '#fde047'
                      : '#fca5a5'
                }}
              >
                {lang.completionPercent}%
              </span>
              {!lang.isDefault && (
                <button
                  onClick={() => handleRemoveLanguage(lang.code)}
                  className="text-[var(--text-muted)] hover:text-red-400 transition-colors ml-1"
                  title={t('localizationPanel.removeLanguageTip', { name: lang.name })}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowLangDropdown(!showLangDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-primary)] hover:text-white hover:border-[var(--border-default)] transition-colors"
              disabled={availableToAdd.length === 0}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
              </svg>
              {t('localizationPanel.addLanguage')}
            </button>
            {showLangDropdown && availableToAdd.length > 0 && (
              <div className="absolute top-full left-0 mt-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg shadow-xl z-10 py-1 min-w-[180px]">
                {availableToAdd.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => handleAddLanguage(lang.code, lang.name)}
                    className="w-full text-left px-4 py-2 text-sm text-[var(--text-primary)] hover:text-white hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    {lang.name} <span className="text-[var(--text-muted)]">({lang.code})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-3 border-b border-[var(--border-subtle)] flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder={t('localizationPanel.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div className="flex items-center gap-1">
            {([
              { value: 'all', label: t('localizationPanel.filterAll') },
              { value: 'dialogue', label: t('localizationPanel.filterDialogue') },
              { value: 'choice', label: t('localizationPanel.filterChoice') },
            ] as { value: string; label: string }[]).map(tag => (
              <button
                key={tag.value}
                onClick={() => setTagFilter(tag.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  tagFilter === tag.value
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {filteredStrings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
              <span className="text-4xl mb-3">📝</span>
              <p className="text-lg font-medium">{t('localizationPanel.emptyNoStrings')}</p>
              <p className="text-sm mt-1">
                {strings.length === 0
                  ? t('localizationPanel.emptyNoStringsHintScan')
                  : t('localizationPanel.emptyNoStringsHintFilter')}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--bg-primary)] z-10">
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="text-left px-4 py-3 text-[var(--text-secondary)] font-medium w-[200px] min-w-[200px]">{t('localizationPanel.colKey')}</th>
                  <th className="text-left px-4 py-3 text-[var(--text-secondary)] font-medium w-[140px] min-w-[140px]">{t('localizationPanel.colContext')}</th>
                  <th className="text-left px-4 py-3 text-[var(--text-secondary)] font-medium min-w-[200px]">{t('localizationPanel.colDefaultText')}</th>
                  {additionalLanguages.map(lang => (
                    <th key={lang.code} className="text-left px-4 py-3 text-[var(--text-secondary)] font-medium min-w-[200px]">
                      {lang.name} ({lang.code})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStrings.map(entry => (
                  <tr key={entry.id} className="border-b border-slate-800 hover:bg-[var(--bg-primary)]/50 transition-colors">
                    <td className="px-4 py-2 font-mono text-xs text-[var(--text-secondary)] break-all border-r border-slate-800">
                      {entry.key}
                      <div className="flex gap-1 mt-1">
                        {entry.tags.map(t => (
                          <span
                            key={t}
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{
                              background: t === 'dialogue' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                              color: t === 'dialogue' ? '#93c5fd' : '#c4b5fd'
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--text-muted)] border-r border-slate-800">{entry.context}</td>
                    <td className="px-4 py-2 text-[var(--text-primary)] border-r border-slate-800">
                      {entry.defaultText}
                    </td>
                    {additionalLanguages.map(lang => {
                      const translation = entry.translations[lang.code] || '';
                      const isEmpty = !translation.trim();
                      return (
                        <td
                          key={lang.code}
                          className="px-2 py-1 border-r border-slate-800"
                          style={isEmpty ? { background: 'rgba(234, 179, 8, 0.08)' } : undefined}
                        >
                          <input
                            type="text"
                            value={translation}
                            onChange={e => handleTranslationChange(entry.id, lang.code, e.target.value)}
                            placeholder={t('localizationPanel.translationPlaceholder')}
                            className="w-full bg-transparent text-[var(--text-primary)] placeholder-slate-600 px-2 py-1.5 rounded border border-transparent focus:border-blue-500 focus:outline-none transition-colors text-sm"
                            style={isEmpty ? { borderColor: 'rgba(234, 179, 8, 0.3)' } : undefined}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-6 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportCSV}
              disabled={strings.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-primary)] hover:text-white hover:border-[var(--border-default)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
              </svg>
              {t('localizationPanel.exportCsv')}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-primary)] hover:text-white hover:border-[var(--border-default)] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z" />
                <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
              </svg>
              {t('localizationPanel.importCsv')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleImportCSV}
              className="hidden"
            />
          </div>
          {importResult && (
            <div className="text-sm">
              <span className="text-green-400">{t('localizationPanel.importSuccess', { count: importResult.imported })}</span>
              {importResult.errors.length > 0 && (
                <span className="text-yellow-400 ml-2">
                  {t('localizationPanel.importErrors', { count: importResult.errors.length })} {importResult.errors.slice(0, 3).join(', ')}
                </span>
              )}
            </div>
          )}
          <div className="text-xs text-[var(--text-muted)]">
            {t('localizationPanel.showingCount', { filtered: filteredStrings.length, total: strings.length })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocalizationPanel;
