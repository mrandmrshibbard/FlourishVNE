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
import enStoryBible from './locales/en/storyBible.json';
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
import ptStoryBible from './locales/pt/storyBible.json';
import esCommon from './locales/es/common.json';
import esHeader from './locales/es/header.json';
import esSettings from './locales/es/settings.json';
import esHub from './locales/es/hub.json';
import esNav from './locales/es/nav.json';
import esScenes from './locales/es/scenes.json';
import esCharacters from './locales/es/characters.json';
import esVariables from './locales/es/variables.json';
import esCommonEvents from './locales/es/commonEvents.json';
import esCommands from './locales/es/commands.json';
import esProperties from './locales/es/properties.json';
import esAssets from './locales/es/assets.json';
import esUi from './locales/es/ui.json';
import esComponents from './locales/es/components.json';
import esStaging from './locales/es/staging.json';
import esGameBuilder from './locales/es/gameBuilder.json';
import esEditorTools from './locales/es/editorTools.json';
import esTemplates from './locales/es/templates.json';
import esContentTools from './locales/es/contentTools.json';
import esContextPanels from './locales/es/contextPanels.json';
import itCommon from './locales/it/common.json';
import itHeader from './locales/it/header.json';
import itSettings from './locales/it/settings.json';
import itHub from './locales/it/hub.json';
import itNav from './locales/it/nav.json';
import itScenes from './locales/it/scenes.json';
import itCharacters from './locales/it/characters.json';
import itVariables from './locales/it/variables.json';
import itCommonEvents from './locales/it/commonEvents.json';
import itCommands from './locales/it/commands.json';
import itProperties from './locales/it/properties.json';
import itAssets from './locales/it/assets.json';
import itUi from './locales/it/ui.json';
import itComponents from './locales/it/components.json';
import itStaging from './locales/it/staging.json';
import itGameBuilder from './locales/it/gameBuilder.json';
import itEditorTools from './locales/it/editorTools.json';
import itTemplates from './locales/it/templates.json';
import itContentTools from './locales/it/contentTools.json';
import itContextPanels from './locales/it/contextPanels.json';
import zhCommon from './locales/zh/common.json';
import zhHeader from './locales/zh/header.json';
import zhSettings from './locales/zh/settings.json';
import zhHub from './locales/zh/hub.json';
import zhNav from './locales/zh/nav.json';
import zhScenes from './locales/zh/scenes.json';
import zhCharacters from './locales/zh/characters.json';
import zhVariables from './locales/zh/variables.json';
import zhCommonEvents from './locales/zh/commonEvents.json';
import zhCommands from './locales/zh/commands.json';
import zhProperties from './locales/zh/properties.json';
import zhAssets from './locales/zh/assets.json';
import zhUi from './locales/zh/ui.json';
import zhComponents from './locales/zh/components.json';
import zhStaging from './locales/zh/staging.json';
import zhGameBuilder from './locales/zh/gameBuilder.json';
import zhEditorTools from './locales/zh/editorTools.json';
import zhTemplates from './locales/zh/templates.json';
import zhContentTools from './locales/zh/contentTools.json';
import zhContextPanels from './locales/zh/contextPanels.json';
import jaCommon from './locales/ja/common.json';
import jaHeader from './locales/ja/header.json';
import jaSettings from './locales/ja/settings.json';
import jaHub from './locales/ja/hub.json';
import jaNav from './locales/ja/nav.json';
import jaScenes from './locales/ja/scenes.json';
import jaCharacters from './locales/ja/characters.json';
import jaVariables from './locales/ja/variables.json';
import jaCommonEvents from './locales/ja/commonEvents.json';
import jaCommands from './locales/ja/commands.json';
import jaProperties from './locales/ja/properties.json';
import jaAssets from './locales/ja/assets.json';
import jaUi from './locales/ja/ui.json';
import jaComponents from './locales/ja/components.json';
import jaStaging from './locales/ja/staging.json';
import jaGameBuilder from './locales/ja/gameBuilder.json';
import jaEditorTools from './locales/ja/editorTools.json';
import jaTemplates from './locales/ja/templates.json';
import jaContentTools from './locales/ja/contentTools.json';
import jaContextPanels from './locales/ja/contextPanels.json';
import zhTwCommon from './locales/zh-TW/common.json';
import zhTwHeader from './locales/zh-TW/header.json';
import zhTwSettings from './locales/zh-TW/settings.json';
import zhTwHub from './locales/zh-TW/hub.json';
import zhTwNav from './locales/zh-TW/nav.json';
import zhTwScenes from './locales/zh-TW/scenes.json';
import zhTwCharacters from './locales/zh-TW/characters.json';
import zhTwVariables from './locales/zh-TW/variables.json';
import zhTwCommonEvents from './locales/zh-TW/commonEvents.json';
import zhTwCommands from './locales/zh-TW/commands.json';
import zhTwProperties from './locales/zh-TW/properties.json';
import zhTwAssets from './locales/zh-TW/assets.json';
import zhTwUi from './locales/zh-TW/ui.json';
import zhTwComponents from './locales/zh-TW/components.json';
import zhTwStaging from './locales/zh-TW/staging.json';
import zhTwGameBuilder from './locales/zh-TW/gameBuilder.json';
import zhTwEditorTools from './locales/zh-TW/editorTools.json';
import zhTwTemplates from './locales/zh-TW/templates.json';
import zhTwContentTools from './locales/zh-TW/contentTools.json';
import zhTwContextPanels from './locales/zh-TW/contextPanels.json';
import ruCommon from './locales/ru/common.json';
import ruHeader from './locales/ru/header.json';
import ruSettings from './locales/ru/settings.json';
import ruHub from './locales/ru/hub.json';
import ruNav from './locales/ru/nav.json';
import ruScenes from './locales/ru/scenes.json';
import ruCharacters from './locales/ru/characters.json';
import ruVariables from './locales/ru/variables.json';
import ruCommonEvents from './locales/ru/commonEvents.json';
import ruCommands from './locales/ru/commands.json';
import ruProperties from './locales/ru/properties.json';
import ruAssets from './locales/ru/assets.json';
import ruUi from './locales/ru/ui.json';
import ruComponents from './locales/ru/components.json';
import ruStaging from './locales/ru/staging.json';
import ruGameBuilder from './locales/ru/gameBuilder.json';
import ruEditorTools from './locales/ru/editorTools.json';
import ruTemplates from './locales/ru/templates.json';
import ruContentTools from './locales/ru/contentTools.json';
import ruContextPanels from './locales/ru/contextPanels.json';
import ukCommon from './locales/uk/common.json';
import ukHeader from './locales/uk/header.json';
import ukSettings from './locales/uk/settings.json';
import ukHub from './locales/uk/hub.json';
import ukNav from './locales/uk/nav.json';
import ukScenes from './locales/uk/scenes.json';
import ukCharacters from './locales/uk/characters.json';
import ukVariables from './locales/uk/variables.json';
import ukCommonEvents from './locales/uk/commonEvents.json';
import ukCommands from './locales/uk/commands.json';
import ukProperties from './locales/uk/properties.json';
import ukAssets from './locales/uk/assets.json';
import ukUi from './locales/uk/ui.json';
import ukComponents from './locales/uk/components.json';
import ukStaging from './locales/uk/staging.json';
import ukGameBuilder from './locales/uk/gameBuilder.json';
import ukEditorTools from './locales/uk/editorTools.json';
import ukTemplates from './locales/uk/templates.json';
import ukContentTools from './locales/uk/contentTools.json';
import ukContextPanels from './locales/uk/contextPanels.json';
import frCommon from './locales/fr/common.json';
import frHeader from './locales/fr/header.json';
import frSettings from './locales/fr/settings.json';
import frHub from './locales/fr/hub.json';
import frNav from './locales/fr/nav.json';
import frScenes from './locales/fr/scenes.json';
import frCharacters from './locales/fr/characters.json';
import frVariables from './locales/fr/variables.json';
import frCommonEvents from './locales/fr/commonEvents.json';
import frCommands from './locales/fr/commands.json';
import frProperties from './locales/fr/properties.json';
import frAssets from './locales/fr/assets.json';
import frUi from './locales/fr/ui.json';
import frComponents from './locales/fr/components.json';
import frStaging from './locales/fr/staging.json';
import frGameBuilder from './locales/fr/gameBuilder.json';
import frEditorTools from './locales/fr/editorTools.json';
import frTemplates from './locales/fr/templates.json';
import frContentTools from './locales/fr/contentTools.json';
import frContextPanels from './locales/fr/contextPanels.json';

/** Languages offered in the editor's Language selector. `en` is the source of truth. */
export const SUPPORTED_LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'pt', label: 'Português (Brasil)' },
    { code: 'es', label: 'Español' },
    { code: 'it', label: 'Italiano' },
    { code: 'zh', label: '简体中文' },
    { code: 'zh-TW', label: '繁體中文' },
    { code: 'ja', label: '日本語' },
    { code: 'ru', label: 'Русский' },
    { code: 'uk', label: 'Українська' },
    { code: 'fr', label: 'Français' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

const LANGUAGE_STORAGE_KEY = 'flourish-editor-language';

const resources = {
    en: { common: enCommon, header: enHeader, settings: enSettings, hub: enHub, nav: enNav, scenes: enScenes, characters: enCharacters, variables: enVariables, commonEvents: enCommonEvents, commands: enCommands, properties: enProperties, assets: enAssets, ui: enUi, components: enComponents, staging: enStaging, gameBuilder: enGameBuilder, editorTools: enEditorTools, templates: enTemplates, contentTools: enContentTools, contextPanels: enContextPanels, storyBible: enStoryBible },
    pt: { common: ptCommon, header: ptHeader, settings: ptSettings, hub: ptHub, nav: ptNav, scenes: ptScenes, characters: ptCharacters, variables: ptVariables, commonEvents: ptCommonEvents, commands: ptCommands, properties: ptProperties, assets: ptAssets, ui: ptUi, components: ptComponents, staging: ptStaging, gameBuilder: ptGameBuilder, editorTools: ptEditorTools, templates: ptTemplates, contentTools: ptContentTools, contextPanels: ptContextPanels, storyBible: ptStoryBible },
    es: { common: esCommon, header: esHeader, settings: esSettings, hub: esHub, nav: esNav, scenes: esScenes, characters: esCharacters, variables: esVariables, commonEvents: esCommonEvents, commands: esCommands, properties: esProperties, assets: esAssets, ui: esUi, components: esComponents, staging: esStaging, gameBuilder: esGameBuilder, editorTools: esEditorTools, templates: esTemplates, contentTools: esContentTools, contextPanels: esContextPanels },
    it: { common: itCommon, header: itHeader, settings: itSettings, hub: itHub, nav: itNav, scenes: itScenes, characters: itCharacters, variables: itVariables, commonEvents: itCommonEvents, commands: itCommands, properties: itProperties, assets: itAssets, ui: itUi, components: itComponents, staging: itStaging, gameBuilder: itGameBuilder, editorTools: itEditorTools, templates: itTemplates, contentTools: itContentTools, contextPanels: itContextPanels },
    zh: { common: zhCommon, header: zhHeader, settings: zhSettings, hub: zhHub, nav: zhNav, scenes: zhScenes, characters: zhCharacters, variables: zhVariables, commonEvents: zhCommonEvents, commands: zhCommands, properties: zhProperties, assets: zhAssets, ui: zhUi, components: zhComponents, staging: zhStaging, gameBuilder: zhGameBuilder, editorTools: zhEditorTools, templates: zhTemplates, contentTools: zhContentTools, contextPanels: zhContextPanels },
    ja: { common: jaCommon, header: jaHeader, settings: jaSettings, hub: jaHub, nav: jaNav, scenes: jaScenes, characters: jaCharacters, variables: jaVariables, commonEvents: jaCommonEvents, commands: jaCommands, properties: jaProperties, assets: jaAssets, ui: jaUi, components: jaComponents, staging: jaStaging, gameBuilder: jaGameBuilder, editorTools: jaEditorTools, templates: jaTemplates, contentTools: jaContentTools, contextPanels: jaContextPanels },
    'zh-TW': { common: zhTwCommon, header: zhTwHeader, settings: zhTwSettings, hub: zhTwHub, nav: zhTwNav, scenes: zhTwScenes, characters: zhTwCharacters, variables: zhTwVariables, commonEvents: zhTwCommonEvents, commands: zhTwCommands, properties: zhTwProperties, assets: zhTwAssets, ui: zhTwUi, components: zhTwComponents, staging: zhTwStaging, gameBuilder: zhTwGameBuilder, editorTools: zhTwEditorTools, templates: zhTwTemplates, contentTools: zhTwContentTools, contextPanels: zhTwContextPanels },
    ru: { common: ruCommon, header: ruHeader, settings: ruSettings, hub: ruHub, nav: ruNav, scenes: ruScenes, characters: ruCharacters, variables: ruVariables, commonEvents: ruCommonEvents, commands: ruCommands, properties: ruProperties, assets: ruAssets, ui: ruUi, components: ruComponents, staging: ruStaging, gameBuilder: ruGameBuilder, editorTools: ruEditorTools, templates: ruTemplates, contentTools: ruContentTools, contextPanels: ruContextPanels },
    uk: { common: ukCommon, header: ukHeader, settings: ukSettings, hub: ukHub, nav: ukNav, scenes: ukScenes, characters: ukCharacters, variables: ukVariables, commonEvents: ukCommonEvents, commands: ukCommands, properties: ukProperties, assets: ukAssets, ui: ukUi, components: ukComponents, staging: ukStaging, gameBuilder: ukGameBuilder, editorTools: ukEditorTools, templates: ukTemplates, contentTools: ukContentTools, contextPanels: ukContextPanels },
    fr: { common: frCommon, header: frHeader, settings: frSettings, hub: frHub, nav: frNav, scenes: frScenes, characters: frCharacters, variables: frVariables, commonEvents: frCommonEvents, commands: frCommands, properties: frProperties, assets: frAssets, ui: frUi, components: frComponents, staging: frStaging, gameBuilder: frGameBuilder, editorTools: frEditorTools, templates: frTemplates, contentTools: frContentTools, contextPanels: frContextPanels },
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
    ns: ['common', 'header', 'settings', 'hub', 'nav', 'scenes', 'characters', 'variables', 'commonEvents', 'commands', 'properties', 'assets', 'ui', 'components', 'staging', 'gameBuilder', 'editorTools', 'templates', 'contentTools', 'contextPanels', 'storyBible'],
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
