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
import enNav from './locales/en/nav.json';
import enScenes from './locales/en/scenes.json';
import enCharacters from './locales/en/characters.json';
import enVariables from './locales/en/variables.json';
import enCommonEvents from './locales/en/commonEvents.json';
import enCommands from './locales/en/commands.json';
import enProperties from './locales/en/properties.json';
import enAssets from './locales/en/assets.json';
import enUi from './locales/en/ui.json';
import enComponents from './locales/en/components.json';
import enStaging from './locales/en/staging.json';
import enGameBuilder from './locales/en/gameBuilder.json';
import enEditorTools from './locales/en/editorTools.json';
import enTemplates from './locales/en/templates.json';
import enContentTools from './locales/en/contentTools.json';
import enContextPanels from './locales/en/contextPanels.json';
import ptCommon from './locales/pt/common.json';
import ptHeader from './locales/pt/header.json';
import ptSettings from './locales/pt/settings.json';
import ptHub from './locales/pt/hub.json';
import ptNav from './locales/pt/nav.json';
import ptScenes from './locales/pt/scenes.json';
import ptCharacters from './locales/pt/characters.json';
import ptVariables from './locales/pt/variables.json';
import ptCommonEvents from './locales/pt/commonEvents.json';
import ptCommands from './locales/pt/commands.json';
import ptProperties from './locales/pt/properties.json';
import ptAssets from './locales/pt/assets.json';
import ptUi from './locales/pt/ui.json';
import ptComponents from './locales/pt/components.json';
import ptStaging from './locales/pt/staging.json';
import ptGameBuilder from './locales/pt/gameBuilder.json';
import ptEditorTools from './locales/pt/editorTools.json';
import ptTemplates from './locales/pt/templates.json';
import ptContentTools from './locales/pt/contentTools.json';
import ptContextPanels from './locales/pt/contextPanels.json';

/** Languages offered in the editor's Language selector. `en` is the source of truth. */
export const SUPPORTED_LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'pt', label: 'Português (Brasil)' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

const LANGUAGE_STORAGE_KEY = 'flourish-editor-language';

const resources = {
    en: { common: enCommon, header: enHeader, settings: enSettings, hub: enHub, nav: enNav, scenes: enScenes, characters: enCharacters, variables: enVariables, commonEvents: enCommonEvents, commands: enCommands, properties: enProperties, assets: enAssets, ui: enUi, components: enComponents, staging: enStaging, gameBuilder: enGameBuilder, editorTools: enEditorTools, templates: enTemplates, contentTools: enContentTools, contextPanels: enContextPanels },
    pt: { common: ptCommon, header: ptHeader, settings: ptSettings, hub: ptHub, nav: ptNav, scenes: ptScenes, characters: ptCharacters, variables: ptVariables, commonEvents: ptCommonEvents, commands: ptCommands, properties: ptProperties, assets: ptAssets, ui: ptUi, components: ptComponents, staging: ptStaging, gameBuilder: ptGameBuilder, editorTools: ptEditorTools, templates: ptTemplates, contentTools: ptContentTools, contextPanels: ptContextPanels },
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
    ns: ['common', 'header', 'settings', 'hub', 'nav', 'scenes', 'characters', 'variables', 'commonEvents', 'commands', 'properties', 'assets', 'ui', 'components', 'staging', 'gameBuilder', 'editorTools', 'templates', 'contentTools', 'contextPanels'],
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
