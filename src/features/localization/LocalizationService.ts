export interface StringEntry {
  id: string;
  key: string;
  defaultText: string;
  translations: Record<string, string>;
  context?: string;
  maxLength?: number;
  tags: string[];
}

export interface LanguageConfig {
  code: string;
  name: string;
  isDefault: boolean;
  completionPercent: number;
}

export interface LocalizationData {
  languages: LanguageConfig[];
  strings: StringEntry[];
  defaultLanguage: string;
}

export class LocalizationService {
  private data: LocalizationData;

  constructor() {
    this.data = {
      languages: [{ code: 'en', name: 'English', isDefault: true, completionPercent: 100 }],
      strings: [],
      defaultLanguage: 'en'
    };
  }

  initializeFromProject(project: any): void {
    const strings: StringEntry[] = [];
    if (project?.scenes) {
      const scenes = Object.values(project.scenes) as any[];
      for (const scene of scenes) {
        if (scene.commands) {
          scene.commands.forEach((cmd: any, idx: number) => {
            if (cmd.type === 'Dialogue' && cmd.text) {
              strings.push({
                id: `${scene.id}_cmd_${idx}`,
                key: `${scene.name || scene.id}.dialogue.${idx}`,
                defaultText: cmd.text,
                translations: { [this.data.defaultLanguage]: cmd.text },
                context: `Scene: ${scene.name || scene.id}`,
                tags: ['dialogue']
              });
            }
            if (cmd.type === 'Choice' && cmd.options) {
              cmd.options.forEach((option: any, cIdx: number) => {
                if (option.text) {
                  strings.push({
                    id: `${scene.id}_cmd_${idx}_choice_${cIdx}`,
                    key: `${scene.name || scene.id}.choice.${idx}.${cIdx}`,
                    defaultText: option.text,
                    translations: { [this.data.defaultLanguage]: option.text },
                    context: `Scene: ${scene.name || scene.id}, Choice`,
                    tags: ['choice']
                  });
                }
              });
            }
          });
        }
      }
    }
    this.data.strings = strings;
    this.updateCompletionPercents();
  }

  addLanguage(code: string, name: string): void {
    if (!this.data.languages.find(l => l.code === code)) {
      this.data.languages.push({ code, name, isDefault: false, completionPercent: 0 });
    }
  }

  removeLanguage(code: string): void {
    if (code === this.data.defaultLanguage) return;
    this.data.languages = this.data.languages.filter(l => l.code !== code);
    this.data.strings.forEach(s => delete s.translations[code]);
  }

  setTranslation(stringId: string, languageCode: string, text: string): void {
    const entry = this.data.strings.find(s => s.id === stringId);
    if (entry) {
      entry.translations[languageCode] = text;
      this.updateCompletionPercents();
    }
  }

  getData(): LocalizationData { return this.data; }
  getLanguages(): LanguageConfig[] { return this.data.languages; }
  getStrings(): StringEntry[] { return this.data.strings; }

  getStringsForLanguage(code: string): Array<StringEntry & { translated: string | undefined }> {
    return this.data.strings.map(s => ({
      ...s,
      translated: s.translations[code]
    }));
  }

  exportCSV(languageCode?: string): string {
    const langs = languageCode ? [languageCode] : this.data.languages.map(l => l.code);
    let csv = 'Key,Context,' + langs.join(',') + '\n';
    for (const s of this.data.strings) {
      const values = langs.map(l => `"${(s.translations[l] || '').replace(/"/g, '""')}"`);
      csv += `"${s.key}","${s.context || ''}",${values.join(',')}\n`;
    }
    return csv;
  }

  importCSV(csvContent: string): { imported: number; errors: string[] } {
    const lines = csvContent.split('\n').filter(l => l.trim());
    if (lines.length < 2) return { imported: 0, errors: ['Empty CSV'] };

    const headers = this.parseCSVLine(lines[0]);
    const langCodes = headers.slice(2);
    let imported = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const key = values[0];
      const entry = this.data.strings.find(s => s.key === key);
      if (!entry) {
        errors.push(`Key not found: ${key}`);
        continue;
      }
      langCodes.forEach((code, idx) => {
        const text = values[idx + 2];
        if (text) {
          entry.translations[code] = text;
          imported++;
        }
      });
    }

    this.updateCompletionPercents();
    return { imported, errors };
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (line[i] === ',' && !inQuotes) {
        result.push(current); current = '';
      } else { current += line[i]; }
    }
    result.push(current);
    return result;
  }

  private updateCompletionPercents(): void {
    const total = this.data.strings.length;
    if (total === 0) return;
    for (const lang of this.data.languages) {
      const translated = this.data.strings.filter(s => s.translations[lang.code]?.trim()).length;
      lang.completionPercent = Math.round((translated / total) * 100);
    }
  }
}
