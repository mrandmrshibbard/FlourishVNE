/**
 * The screen where a player picks their language.
 *
 * It's a REAL UI screen made of ordinary elements — not a hard-coded dialog — so the author can
 * restyle it, move the buttons, add their own artwork, or delete it entirely, exactly like the
 * title screen. That was the point of generating one instead of building a fixed picker: nothing
 * about this feature should be the one part of the game the author can't touch.
 *
 * Generated once, on request. After that it's the author's screen and we never rewrite it — the
 * only thing that changes is that adding a language adds a button (see `languageButtonsToAdd`),
 * which the author can then move or restyle like any other.
 */
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { UIElementType, VNUIElement, VNUIScreen, UIButtonElement, UITextElement } from '../ui/types';
import { UIActionType } from '../../types/shared';

const generateId = (prefix: string) => `${prefix}-${Math.random().toString(36).substring(2, 9)}`;

const BUTTON_FONT = { family: 'Poppins, sans-serif', size: 24, color: '#f0e6ff', weight: 'normal' as const, italic: false };
const TITLE_FONT = { family: 'Poppins, sans-serif', size: 48, color: '#f0e6ff', weight: 'bold' as const, italic: false };

/** Where the nth language button sits. Two columns once there are more than six. */
export function languageButtonLayout(index: number, total: number): { x: number; y: number; width: number } {
    const twoColumns = total > 6;
    if (!twoColumns) return { x: 50, y: 32 + index * 10, width: 34 };
    const column = index % 2;
    const row = Math.floor(index / 2);
    return { x: column === 0 ? 30 : 70, y: 32 + row * 10, width: 30 };
}

const languageButton = (code: string, name: string, index: number, total: number): UIButtonElement => {
    const { x, y, width } = languageButtonLayout(index, total);
    return {
        id: generateId('el'),
        name: `${name} Button`,
        type: UIElementType.Button,
        text: name,
        x, y, width, height: 8,
        anchorX: 0.5, anchorY: 0.5,
        font: BUTTON_FONT,
        action: { type: UIActionType.SetLanguage, languageCode: code },
        image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null,
    };
};

/**
 * Every language the screen should offer, source language included.
 *
 * The source language is on the list because a player who switches by accident needs a way back,
 * and it's the one option that can never be missing from the list.
 */
export function offeredLanguages(project: VNProject): { code: string; name: string }[] {
    const localization: any = (project as any).localization;
    const source = localization?.sourceLanguage || 'en';
    const offered = [{ code: source, name: sourceLanguageName(project) }];
    for (const lang of localization?.languages || []) {
        if (lang?.enabled && lang.code && lang.code !== source) offered.push({ code: lang.code, name: lang.name || lang.code });
    }
    return offered;
}

/**
 * Every language's name in ITSELF (endonyms) - the one list the whole feature shares.
 *
 * Exported so the Localization panel builds its "add a language" catalogue from the same data
 * that names the in-game picker's default entry; two hand-kept copies of this map is how the
 * editor and the shipped game would come to disagree about what a language is called.
 */
export const LANGUAGE_NAMES: Record<string, string> = {
    en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano',
    pt: 'Português', 'pt-BR': 'Português (Brasil)', ru: 'Русский', uk: 'Українська',
    ja: '日本語', ko: '한국어', 'zh-CN': '简体中文', 'zh-TW': '繁體中文', zh: '中文',
    ar: 'العربية', pl: 'Polski', tr: 'Türkçe', nl: 'Nederlands',
};

/** A readable name for the language the game was written in, since authors never name it. */
function sourceLanguageName(project: VNProject): string {
    const source = (project as any).localization?.sourceLanguage || 'en';
    return LANGUAGE_NAMES[source] || source;
}

/** How the player picks: one button each, or a single dropdown. */
export type LanguagePickerStyle = 'buttons' | 'dropdown';

/**
 * The variable a language dropdown writes to.
 *
 * A Dropdown element always stores its selection somewhere, so the dropdown style needs a variable
 * to exist. It's a normal project variable the author can see and use — handy for branching on the
 * player's language — rather than something hidden.
 */
export function createLanguageVariable(project: VNProject): { id: VNID; variable: any } {
    const id = generateId('var');
    const source = (project as any).localization?.sourceLanguage || 'en';
    return {
        id,
        variable: {
            id, name: 'Language', type: 'string', initialValue: source,
            description: 'Which language the player chose. Set by the language dropdown.',
        },
    };
}

/** The dropdown a player picks their language from. */
function languageDropdown(project: VNProject, variableId: VNID): any {
    return {
        id: generateId('el'),
        name: 'Language Dropdown',
        type: UIElementType.Dropdown,
        x: 50, y: 42, width: 40, height: 9,
        anchorX: 0.5, anchorY: 0.5,
        font: BUTTON_FONT,
        variableId,
        options: offeredLanguages(project).map(lang => ({ label: lang.name, value: lang.code })),
        // `fromSelection` = use whichever option was just chosen. The engine supplies the value.
        actions: [{ type: UIActionType.SetLanguage, languageCode: '', fromSelection: true }],
    };
}

/**
 * A fresh language screen, ready to drop into `project.uiScreens`.
 *
 * `style: 'dropdown'` needs a variable for the dropdown to write to — pass its id in. Ten languages
 * as ten buttons is a wall of text on screen, which is exactly why the choice exists.
 */
export function createLanguageScreen(
    project: VNProject,
    screenName = 'Language',
    style: LanguagePickerStyle = 'buttons',
    languageVariableId?: VNID,
): VNUIScreen {
    const elements: Record<VNID, VNUIElement> = {};

    const headingId = generateId('el');
    elements[headingId] = {
        id: headingId, name: 'Heading', type: UIElementType.Text,
        // Deliberately NOT translated: a player looking for this screen doesn't yet read the
        // language the game is in. A globe and the language names do the work.
        text: '🌐 Language',
        x: 50, y: 18, width: 60, height: 12,
        anchorX: 0.5, anchorY: 0.5, font: TITLE_FONT,
        textAlign: 'center', verticalAlign: 'middle',
    };

    if (style === 'dropdown' && languageVariableId) {
        const dropdown = languageDropdown(project, languageVariableId);
        elements[dropdown.id] = dropdown;
    } else {
        const languages = offeredLanguages(project);
        languages.forEach((lang, index) => {
            const button = languageButton(lang.code, lang.name, index, languages.length);
            elements[button.id] = button;
        });
    }

    /* "Continue", not "Back": this screen can open BEFORE the title, where there is nothing to go
     * back to, and it's the only way off that gate — choosing a language deliberately doesn't
     * leave, so a player can switch, look, and switch again. Mid-game it still returns where they
     * came from. Like everything here, the author can rename it. */
    const backId = generateId('el');
    elements[backId] = {
        id: backId, name: 'Continue Button', type: UIElementType.Button, text: 'Continue',
        x: 50, y: 88, width: 20, height: 8,
        anchorX: 0.5, anchorY: 0.5, font: BUTTON_FONT,
        action: { type: UIActionType.ReturnToPreviousScreen },
        image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null,
    };

    /* 🔴 `background`, `music` and `ambientNoise` are REQUIRED and `background` is NOT nullable —
     * a screen missing them crashes the editor to a blank page the moment it's opened, because the
     * renderer reads `background.type` and `music.policy` without guarding. Matches the shape
     * `createDefaultUIScreens` produces in constants.ts; keep them in step. */
    return {
        id: generateId('screen'),
        name: screenName,
        background: { type: 'color', value: '#1a102c' },
        music: { audioId: null, policy: 'continue' },
        ambientNoise: { audioId: null, policy: 'continue' },
        elements,
    };
}

/**
 * Languages that have no button on the screen yet.
 *
 * Used to top up an EXISTING screen when the author adds a language later. Existing buttons are
 * never touched — the author may have moved, restyled or deliberately removed one, and rebuilding
 * the screen would throw that away.
 */
export function languageButtonsToAdd(project: VNProject, screen: VNUIScreen): { code: string; name: string }[] {
    const present = new Set<string>();
    for (const el of Object.values<any>(screen?.elements || {})) {
        if (el?.action?.type === UIActionType.SetLanguage) present.add(el.action.languageCode || '');
        // A dropdown offers its languages as OPTIONS, so those count as present too — otherwise
        // every top-up would bolt a stray button onto a screen that already lists them.
        if (isLanguageDropdown(el)) {
            for (const option of el.options || []) present.add(String(option?.value ?? ''));
        }
    }
    return offeredLanguages(project).filter(lang => !present.has(lang.code));
}

/** A dropdown wired to switch language (as opposed to any other dropdown on the screen). */
function isLanguageDropdown(el: any): boolean {
    return el?.type === UIElementType.Dropdown
        && (el.actions || []).some((a: any) => a?.type === UIActionType.SetLanguage);
}

/** Which picker a screen is currently using, so the UI can offer the other one. */
export function languagePickerStyle(screen: VNUIScreen): LanguagePickerStyle {
    return Object.values<any>(screen?.elements || {}).some(isLanguageDropdown) ? 'dropdown' : 'buttons';
}

/**
 * Take a language off the screen when it's removed from the game.
 *
 * The counterpart to `addMissingLanguageButtons`, and it was missing: removing a language left a
 * button (or a dropdown option) that switched players into a language the game no longer offers.
 *
 * Follows whichever picker is in use, and never touches the source language — that one is always
 * offered, because a player who switches by accident needs a way back.
 */
export function removeLanguageFromScreen(project: VNProject, screen: VNUIScreen, code: string): VNUIScreen {
    const source = (project as any).localization?.sourceLanguage || 'en';
    if (!screen || !code || code === source) return screen;

    let changed = false;
    const elements: Record<VNID, VNUIElement> = {};

    for (const [id, el] of Object.entries<any>(screen.elements || {})) {
        if (el?.action?.type === UIActionType.SetLanguage && (el.action.languageCode || '') === code) {
            changed = true;                      // drop this button
            continue;
        }
        if (isLanguageDropdown(el)) {
            const options = (el.options || []).filter((option: any) => String(option?.value ?? '') !== code);
            if (options.length !== (el.options || []).length) {
                elements[id] = { ...el, options };
                changed = true;
                continue;
            }
        }
        elements[id] = el;
    }

    return changed ? { ...screen, elements } : screen;
}

/** The elements that ARE the picker — the only ones a style change is allowed to touch. */
const isPickerElement = (el: any): boolean =>
    el?.action?.type === UIActionType.SetLanguage || isLanguageDropdown(el);

/**
 * Switch an existing screen between buttons and a dropdown.
 *
 * Only the picker itself is replaced. The heading, the back button, the background, and anything
 * else the author added stay exactly as they are — this is a change of control, not a rebuild.
 *
 * ⚠ It DOES discard styling applied to the old picker (a recoloured button, a moved one), because
 * there's nothing sensible to carry across from three buttons to one dropdown. The UI says so
 * before doing it.
 */
export function setLanguagePickerStyle(
    project: VNProject,
    screen: VNUIScreen,
    style: LanguagePickerStyle,
    languageVariableId?: VNID,
): VNUIScreen {
    if (languagePickerStyle(screen) === style) return screen;
    if (style === 'dropdown' && !languageVariableId) return screen;   // nowhere to store the choice

    const elements: Record<VNID, VNUIElement> = {};
    for (const [id, el] of Object.entries<any>(screen.elements || {})) {
        if (!isPickerElement(el)) elements[id] = el;
    }

    if (style === 'dropdown') {
        const dropdown = languageDropdown(project, languageVariableId!);
        elements[dropdown.id] = dropdown;
    } else {
        const languages = offeredLanguages(project);
        languages.forEach((lang, index) => {
            const button = languageButton(lang.code, lang.name, index, languages.length);
            elements[button.id] = button;
        });
    }
    return { ...screen, elements };
}

/**
 * The screen updated to offer any language it doesn't yet.
 *
 * Follows whichever picker the screen already uses: a dropdown gains options, buttons gain buttons.
 * Never converts one to the other — that's the author's choice, not ours.
 */
export function addMissingLanguageButtons(project: VNProject, screen: VNUIScreen): VNUIScreen {
    const missing = languageButtonsToAdd(project, screen);
    if (!missing.length) return screen;

    const elements = { ...screen.elements };
    const dropdownEntry = Object.entries<any>(elements).find(([, el]) => isLanguageDropdown(el));

    if (dropdownEntry) {
        const [id, dropdown] = dropdownEntry;
        elements[id] = {
            ...dropdown,
            options: [...(dropdown.options || []), ...missing.map(l => ({ label: l.name, value: l.code }))],
        };
        return { ...screen, elements };
    }

    const existingCount = Object.values(elements)
        .filter((el: any) => el?.action?.type === UIActionType.SetLanguage).length;
    const total = existingCount + missing.length;
    missing.forEach((lang, i) => {
        const button = languageButton(lang.code, lang.name, existingCount + i, total);
        elements[button.id] = button;
    });
    return { ...screen, elements };
}
