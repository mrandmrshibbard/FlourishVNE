/**
 * i18n — editor interface internationalization (react-i18next).
 *
 * Initializes a singleton i18next instance with statically-bundled locale
 * resources (no HTTP backend — this is an offline Electron app). The chosen
 * language is persisted to localStorage, mirroring the ThemeContext pattern
 * (`src/contexts/ThemeContext.tsx`).
 *
 * NOTE: This is the EDITOR UI only. It is intentionally separate from
 * player-facing game-content localization (LocalizationService) and from the
 * exported game runtime bundles.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';
import enHeader from './locales/en/header.json';
import enSettings from './locales/en/settings.json';
import enHub from './locales/en/hub.json';
import ptCommon from './locales/pt/common.json';
import ptHeader from './locales/pt/header.json';
import ptSettings from './locales/pt/settings.json';
import ptHub from './locales/pt/hub.json';

/** Languages offered in the editor's Language selector. `en` is the source of truth. */
export const SUPPORTED_LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'pt', label: 'Português (Brasil)' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

const LANGUAGE_STORAGE_KEY = 'flourish-editor-language';

const resources = {
    en: { common: enCommon, header: enHeader, settings: enSettings, hub: enHub },
    pt: { common: ptCommon, header: ptHeader, settings: ptSettings, hub: ptHub },
} as const;

function getInitialLanguage(): string {
    try {
        const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (stored && SUPPORTED_LANGUAGES.some(l => l.code === stored)) {
            return stored;
        }
    } catch {
        // localStorage unavailable
    }
    return 'en';
}

i18n.use(initReactI18next).init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'header', 'settings', 'hub'],
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
});

/** Change the active editor language and persist the choice. */
export function setLanguage(code: string): void {
    i18n.changeLanguage(code);
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
    } catch {
        // localStorage unavailable
    }
}

export default i18n;
