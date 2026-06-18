import { describe, it, expect, beforeEach } from 'vitest';
import { LocalizationService } from '../LocalizationService';

describe('LocalizationService', () => {
  let service: LocalizationService;

  beforeEach(() => {
    service = new LocalizationService();
  });

  describe('initial state', () => {
    it('starts with English as the default language', () => {
      const langs = service.getLanguages();
      expect(langs).toHaveLength(1);
      expect(langs[0].code).toBe('en');
      expect(langs[0].isDefault).toBe(true);
      expect(langs[0].completionPercent).toBe(100);
    });

    it('starts with no strings', () => {
      expect(service.getStrings()).toHaveLength(0);
    });
  });

  describe('addLanguage', () => {
    it('adds a new language', () => {
      service.addLanguage('fr', 'French');

      const langs = service.getLanguages();
      expect(langs).toHaveLength(2);
      expect(langs[1].code).toBe('fr');
      expect(langs[1].name).toBe('French');
      expect(langs[1].isDefault).toBe(false);
    });

    it('does not add duplicate languages', () => {
      service.addLanguage('fr', 'French');
      service.addLanguage('fr', 'French Again');

      expect(service.getLanguages()).toHaveLength(2);
    });
  });

  describe('removeLanguage', () => {
    it('removes a non-default language', () => {
      service.addLanguage('fr', 'French');
      service.removeLanguage('fr');

      expect(service.getLanguages()).toHaveLength(1);
      expect(service.getLanguages()[0].code).toBe('en');
    });

    it('does not remove the default language', () => {
      service.removeLanguage('en');

      expect(service.getLanguages()).toHaveLength(1);
      expect(service.getLanguages()[0].code).toBe('en');
    });

    it('cleans up translations for removed language', () => {
      service.initializeFromProject({
        scenes: {
          's1': {
            id: 's1', name: 'Scene 1',
            commands: [{ type: 'Dialogue', text: 'Hello' }],
          },
        },
      });
      service.addLanguage('fr', 'French');
      const strings = service.getStrings();
      service.setTranslation(strings[0].id, 'fr', 'Bonjour');

      service.removeLanguage('fr');

      expect(service.getStrings()[0].translations['fr']).toBeUndefined();
    });
  });

  describe('setTranslation', () => {
    it('sets a translation for a string', () => {
      service.initializeFromProject({
        scenes: {
          's1': {
            id: 's1', name: 'Scene 1',
            commands: [{ type: 'Dialogue', text: 'Hello' }],
          },
        },
      });
      service.addLanguage('ja', 'Japanese');
      const strings = service.getStrings();

      service.setTranslation(strings[0].id, 'ja', 'こんにちは');

      const updated = service.getStrings();
      expect(updated[0].translations['ja']).toBe('こんにちは');
    });

    it('does nothing for a non-existent string ID', () => {
      service.addLanguage('fr', 'French');
      service.setTranslation('non-existent', 'fr', 'Test');

      expect(service.getStrings()).toHaveLength(0);
    });
  });

  describe('initializeFromProject', () => {
    it('extracts dialogue strings from scenes', () => {
      service.initializeFromProject({
        scenes: {
          's1': {
            id: 's1', name: 'Intro',
            commands: [
              { type: 'Dialogue', text: 'Welcome!' },
              { type: 'Dialogue', text: 'How are you?' },
            ],
          },
        },
      });

      expect(service.getStrings()).toHaveLength(2);
      expect(service.getStrings()[0].defaultText).toBe('Welcome!');
      expect(service.getStrings()[1].defaultText).toBe('How are you?');
    });

    it('extracts choice option strings', () => {
      service.initializeFromProject({
        scenes: {
          's1': {
            id: 's1', name: 'Scene 1',
            commands: [{
              type: 'Choice',
              options: [
                { text: 'Option A' },
                { text: 'Option B' },
              ],
            }],
          },
        },
      });

      const strings = service.getStrings();
      expect(strings).toHaveLength(2);
      expect(strings[0].defaultText).toBe('Option A');
      expect(strings[1].defaultText).toBe('Option B');
    });

    it('tags dialogue and choice strings appropriately', () => {
      service.initializeFromProject({
        scenes: {
          's1': {
            id: 's1', name: 'Scene 1',
            commands: [
              { type: 'Dialogue', text: 'Hello' },
              { type: 'Choice', options: [{ text: 'Yes' }] },
            ],
          },
        },
      });

      const strings = service.getStrings();
      expect(strings[0].tags).toContain('dialogue');
      expect(strings[1].tags).toContain('choice');
    });
  });

  describe('exportCSV', () => {
    it('exports all languages when no language specified', () => {
      service.initializeFromProject({
        scenes: {
          's1': {
            id: 's1', name: 'Scene 1',
            commands: [{ type: 'Dialogue', text: 'Hello' }],
          },
        },
      });
      service.addLanguage('fr', 'French');

      const csv = service.exportCSV();

      expect(csv).toContain('Key,Context,en,fr');
      expect(csv).toContain('"Hello"');
    });

    it('exports a specific language only', () => {
      service.initializeFromProject({
        scenes: {
          's1': {
            id: 's1', name: 'Scene 1',
            commands: [{ type: 'Dialogue', text: 'Hello' }],
          },
        },
      });
      service.addLanguage('fr', 'French');

      const csv = service.exportCSV('en');

      expect(csv).toContain('Key,Context,en');
      expect(csv).not.toContain(',fr');
    });

    it('escapes double quotes in CSV values', () => {
      service.initializeFromProject({
        scenes: {
          's1': {
            id: 's1', name: 'Scene 1',
            commands: [{ type: 'Dialogue', text: 'He said "wow"' }],
          },
        },
      });

      const csv = service.exportCSV('en');

      expect(csv).toContain('""wow""');
    });
  });

  describe('importCSV', () => {
    it('imports translations from CSV', () => {
      service.initializeFromProject({
        scenes: {
          's1': {
            id: 's1', name: 'Scene 1',
            commands: [{ type: 'Dialogue', text: 'Hello' }],
          },
        },
      });
      service.addLanguage('fr', 'French');

      const strings = service.getStrings();
      const csvContent = `Key,Context,en,fr\n"${strings[0].key}","Scene: Scene 1","Hello","Bonjour"`;

      const result = service.importCSV(csvContent);

      expect(result.imported).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
      expect(service.getStrings()[0].translations['fr']).toBe('Bonjour');
    });

    it('reports errors for unknown keys', () => {
      service.initializeFromProject({
        scenes: {
          's1': {
            id: 's1', name: 'Scene 1',
            commands: [{ type: 'Dialogue', text: 'Hello' }],
          },
        },
      });

      const csvContent = `Key,Context,en\n"unknown.key","","Test"`;
      const result = service.importCSV(csvContent);

      expect(result.errors.some(e => e.includes('Key not found'))).toBe(true);
    });

    it('returns error for empty CSV', () => {
      const result = service.importCSV('');
      expect(result.imported).toBe(0);
      expect(result.errors).toContain('Empty CSV');
    });
  });

  describe('completion percentage', () => {
    it('calculates 100% for default language', () => {
      service.initializeFromProject({
        scenes: {
          's1': {
            id: 's1', name: 'Scene 1',
            commands: [
              { type: 'Dialogue', text: 'Hello' },
              { type: 'Dialogue', text: 'World' },
            ],
          },
        },
      });

      const langs = service.getLanguages();
      const en = langs.find(l => l.code === 'en')!;
      expect(en.completionPercent).toBe(100);
    });

    it('calculates 0% for a new language with no translations', () => {
      service.initializeFromProject({
        scenes: {
          's1': {
            id: 's1', name: 'Scene 1',
            commands: [
              { type: 'Dialogue', text: 'Hello' },
              { type: 'Dialogue', text: 'World' },
            ],
          },
        },
      });
      service.addLanguage('fr', 'French');

      const langs = service.getLanguages();
      const fr = langs.find(l => l.code === 'fr')!;
      expect(fr.completionPercent).toBe(0);
    });

    it('calculates 50% when half the strings are translated', () => {
      service.initializeFromProject({
        scenes: {
          's1': {
            id: 's1', name: 'Scene 1',
            commands: [
              { type: 'Dialogue', text: 'Hello' },
              { type: 'Dialogue', text: 'World' },
            ],
          },
        },
      });
      service.addLanguage('fr', 'French');

      const strings = service.getStrings();
      service.setTranslation(strings[0].id, 'fr', 'Bonjour');

      const langs = service.getLanguages();
      const fr = langs.find(l => l.code === 'fr')!;
      expect(fr.completionPercent).toBe(50);
    });

    it('updates completion after import', () => {
      service.initializeFromProject({
        scenes: {
          's1': {
            id: 's1', name: 'Scene 1',
            commands: [
              { type: 'Dialogue', text: 'Hello' },
              { type: 'Dialogue', text: 'World' },
            ],
          },
        },
      });
      service.addLanguage('de', 'German');

      const strings = service.getStrings();
      const csv = `Key,Context,de\n"${strings[0].key}","","Hallo"\n"${strings[1].key}","","Welt"`;
      service.importCSV(csv);

      const langs = service.getLanguages();
      const de = langs.find(l => l.code === 'de')!;
      expect(de.completionPercent).toBe(100);
    });
  });
});
