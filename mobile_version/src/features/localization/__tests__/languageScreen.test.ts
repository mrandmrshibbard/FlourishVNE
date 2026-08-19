/**
 * The generated language screen.
 *
 * The rule that matters: it is generated ONCE and then belongs to the author. Adding a language
 * later appends a button; it must never rebuild the screen, because by then the author may have
 * moved things, restyled them, or deliberately deleted a button.
 */
import { describe, it, expect } from 'vitest';
import {
    createLanguageScreen, offeredLanguages, languageButtonsToAdd,
    addMissingLanguageButtons, languageButtonLayout, createLanguageVariable, languagePickerStyle,
    setLanguagePickerStyle, removeLanguageFromScreen, LANGUAGE_NAMES,
} from '../languageScreen';
import { UIActionType } from '../../../types/shared';
import { createDefaultUIScreens } from '../../../constants';

const project = (languages: any[] = [], sourceLanguage = 'en'): any => ({
    id: 'p', title: 'T', uiScreens: {},
    localization: { sourceLanguage, languages, strings: {} },
});

const withTwo = () => project([
    { code: 'es', name: 'Español', enabled: true },
    { code: 'ja', name: '日本語', enabled: true },
]);

const buttons = (screen: any) => Object.values(screen.elements)
    .filter((el: any) => el.action?.type === UIActionType.SetLanguage) as any[];

describe('which languages the screen offers', () => {
    it('🔴 always includes the original language — a player needs a way back', () => {
        expect(offeredLanguages(withTwo()).map(l => l.code)).toEqual(['en', 'es', 'ja']);
    });

    it('names the original language readably rather than showing a code', () => {
        expect(offeredLanguages(withTwo())[0].name).toBe('English');
        expect(offeredLanguages(project([], 'ja'))[0].name).toBe('日本語');
    });

    it('leaves out languages the author has not switched on yet', () => {
        const p = project([
            { code: 'es', name: 'Español', enabled: true },
            { code: 'de', name: 'Deutsch', enabled: false },
        ]);
        expect(offeredLanguages(p).map(l => l.code)).toEqual(['en', 'es']);
    });

    it('never lists the original language twice', () => {
        const p = project([{ code: 'en', name: 'English', enabled: true }]);
        expect(offeredLanguages(p).map(l => l.code)).toEqual(['en']);
    });

    it('a German-written game with an English translation offers Deutsch FIRST', () => {
        // The reported case: the author writes in German and translates to English. The picker's
        // default entry must be the language the base content is actually in.
        const p = project([{ code: 'en', name: 'English', enabled: true }], 'de');
        expect(offeredLanguages(p)).toEqual([
            { code: 'de', name: 'Deutsch' },
            { code: 'en', name: 'English' },
        ]);
    });
});

describe('the shared language-name list', () => {
    it('is exported so the panel and the in-game picker cannot disagree', () => {
        // The panel builds its catalogue from these codes; a missing name would ship a raw code.
        for (const code of ['en', 'es', 'fr', 'de', 'pt-BR', 'it', 'ru', 'uk', 'ja', 'ko', 'zh-CN', 'zh-TW', 'ar', 'pl', 'tr', 'nl']) {
            expect(LANGUAGE_NAMES[code], `no display name for ${code}`).toBeTruthy();
        }
        expect(LANGUAGE_NAMES.en).toBe('English');
        expect(LANGUAGE_NAMES.de).toBe('Deutsch');
    });
});

describe('🔴 the screen must be a COMPLETE screen, or the editor blanks out', () => {
    /* This shipped broken: the generated screen had `background: null` and no `music` or
     * `ambientNoise`, and opening it in the Screens tab crashed the app to a white page — the
     * renderer reads `background.type` without guarding. A cast (`as VNUIScreen`) was hiding it
     * from the compiler. The casts are gone; these tests are the second line of defence. */

    it('has a real background, not null', () => {
        const bg = createLanguageScreen(withTwo()).background as any;
        expect(bg).toBeTruthy();
        expect(bg.type).toBe('color');
        expect(typeof bg.value).toBe('string');
    });

    it('has the music and ambient-noise settings every screen is expected to carry', () => {
        const screen = createLanguageScreen(withTwo());
        expect(screen.music).toEqual({ audioId: null, policy: 'continue' });
        expect(screen.ambientNoise).toEqual({ audioId: null, policy: 'continue' });
    });

    it('carries every top-level field the built-in screens carry', () => {
        // Self-maintaining: if VNUIScreen gains a field, the built-in screens get it and this
        // fails until the language screen does too — rather than crashing in front of the author.
        const { screens } = createDefaultUIScreens();
        const builtIn = Object.values(screens)[0] as any;
        const ours = createLanguageScreen(withTwo()) as any;
        const missing = Object.keys(builtIn).filter(key => !(key in ours));
        expect(missing).toEqual([]);
    });
});

describe('the generated screen', () => {
    it('is made of ordinary elements the author can edit', () => {
        const screen = createLanguageScreen(withTwo());
        expect(screen.name).toBe('Language');
        const types = Object.values(screen.elements).map((el: any) => el.type);
        expect(types).toContain('Text');
        expect(types).toContain('Button');
    });

    it('gives every language a button wired to the right code', () => {
        const codes = buttons(createLanguageScreen(withTwo())).map(b => b.action.languageCode);
        expect(codes).toEqual(['en', 'es', 'ja']);
    });

    it('labels the buttons in their own language', () => {
        expect(buttons(createLanguageScreen(withTwo())).map(b => b.text)).toEqual(['English', 'Español', '日本語']);
    });

    it('🔴 has a Continue button — the only way off the boot gate', () => {
        // Choosing a language deliberately does NOT leave the screen (otherwise a dropdown could
        // never re-select the language already showing), so this button carries the whole exit.
        const exit: any = Object.values(createLanguageScreen(withTwo()).elements)
            .find((el: any) => el.action?.type === UIActionType.ReturnToPreviousScreen);
        expect(exit).toBeTruthy();
        expect(exit.text).toBe('Continue');
    });

    it('gives the dropdown screen the same way out', () => {
        const exit = Object.values(createLanguageScreen(withTwo(), 'Language', 'dropdown', 'v1').elements)
            .find((el: any) => el.action?.type === UIActionType.ReturnToPreviousScreen);
        expect(exit).toBeTruthy();
    });

    it('gives every element a distinct id', () => {
        const screen = createLanguageScreen(withTwo());
        const ids = Object.values(screen.elements).map((el: any) => el.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(Object.keys(screen.elements).sort()).toEqual(ids.sort());
    });

    it('stacks buttons in one column, then two once the list gets long', () => {
        expect(languageButtonLayout(0, 3).x).toBe(50);
        expect(languageButtonLayout(1, 3).y).toBeGreaterThan(languageButtonLayout(0, 3).y);
        // Seven languages → two columns, so they still fit on screen.
        expect(languageButtonLayout(0, 7).x).not.toBe(languageButtonLayout(1, 7).x);
        expect(languageButtonLayout(0, 7).y).toBe(languageButtonLayout(1, 7).y);
    });

    it('keeps every button on screen even with a lot of languages', () => {
        const many = Array.from({ length: 12 }, (_, i) => ({ code: `l${i}`, name: `L${i}`, enabled: true }));
        for (const b of buttons(createLanguageScreen(project(many)))) {
            expect(b.y).toBeGreaterThan(0);
            expect(b.y).toBeLessThan(100);
            expect(b.x).toBeGreaterThan(0);
            expect(b.x).toBeLessThan(100);
        }
    });
});

describe('🔴 topping up an EXISTING screen never rebuilds it', () => {
    it('reports only the languages with no button yet', () => {
        const screen = createLanguageScreen(withTwo());
        expect(languageButtonsToAdd(withTwo(), screen)).toEqual([]);

        const p = withTwo();
        p.localization.languages.push({ code: 'fr', name: 'Français', enabled: true });
        expect(languageButtonsToAdd(p, screen).map(l => l.code)).toEqual(['fr']);
    });

    it('appends the new button and leaves the author’s edits alone', () => {
        const screen: any = createLanguageScreen(withTwo());
        const spanish = buttons(screen).find(b => b.action.languageCode === 'es')!;
        spanish.x = 12;                       // the author moved it
        spanish.text = '¡Español!';           // ...and renamed it
        const movedId = spanish.id;

        const p = withTwo();
        p.localization.languages.push({ code: 'fr', name: 'Français', enabled: true });
        const next: any = addMissingLanguageButtons(p, screen);

        expect(next.elements[movedId].x).toBe(12);
        expect(next.elements[movedId].text).toBe('¡Español!');
        expect(buttons(next).map(b => b.action.languageCode)).toContain('fr');
        expect(Object.keys(next.elements)).toHaveLength(Object.keys(screen.elements).length + 1);
    });

    it('respects a button the author deliberately deleted, until they add that language again', () => {
        const screen: any = createLanguageScreen(withTwo());
        const japanese = buttons(screen).find(b => b.action.languageCode === 'ja')!;
        delete screen.elements[japanese.id];
        // It IS reported as missing — that's honest — but nothing happens unless the caller acts.
        expect(languageButtonsToAdd(withTwo(), screen).map(l => l.code)).toEqual(['ja']);
        expect(screen.elements[japanese.id]).toBeUndefined();
    });

    it('returns the identical screen when nothing is missing', () => {
        const screen = createLanguageScreen(withTwo());
        expect(addMissingLanguageButtons(withTwo(), screen)).toBe(screen);
    });
});

describe('🔴 the drop-down picker — ten buttons is a wall of text', () => {
    const varId = 'var-lang';
    const dropdownScreen = (p: any = withTwo()) => createLanguageScreen(p, 'Language', 'dropdown', varId);
    const findDropdown = (screen: any) =>
        Object.values<any>(screen.elements).find(el => el.type === 'Dropdown');

    it('builds ONE dropdown instead of a button each', () => {
        const screen = dropdownScreen();
        expect(buttons(screen)).toEqual([]);                 // no per-language buttons
        expect(findDropdown(screen)).toBeTruthy();
    });

    it('offers every language as an option, in their own language', () => {
        const dropdown = findDropdown(dropdownScreen());
        expect(dropdown.options).toEqual([
            { label: 'English', value: 'en' },
            { label: 'Español', value: 'es' },
            { label: '日本語', value: 'ja' },
        ]);
    });

    it('switches language from whichever option is picked, not a fixed one', () => {
        const dropdown = findDropdown(dropdownScreen());
        expect(dropdown.actions).toEqual([
            { type: UIActionType.SetLanguage, languageCode: '', fromSelection: true },
        ]);
        expect(dropdown.variableId).toBe(varId);
    });

    it('still has a heading and a way back', () => {
        const screen = dropdownScreen();
        const types = Object.values<any>(screen.elements).map(el => el.type);
        expect(types).toContain('Text');
        expect(Object.values<any>(screen.elements)
            .some(el => el.action?.type === UIActionType.ReturnToPreviousScreen)).toBe(true);
    });

    it('comes with a normal, visible variable to store the choice', () => {
        const { variable } = createLanguageVariable(withTwo());
        expect(variable.name).toBe('Language');
        expect(variable.initialValue).toBe('en');            // the language the game is written in
    });

    it('🔴 a new language becomes an OPTION, never a stray button', () => {
        const screen = dropdownScreen();
        const p = withTwo();
        p.localization.languages.push({ code: 'fr', name: 'Français', enabled: true });

        expect(languageButtonsToAdd(p, screen).map(l => l.code)).toEqual(['fr']);
        const next: any = addMissingLanguageButtons(p, screen);
        expect(buttons(next)).toEqual([]);                   // still no buttons
        expect(findDropdown(next).options.map((o: any) => o.value)).toEqual(['en', 'es', 'ja', 'fr']);
    });

    it('reports nothing to add when the dropdown already lists them all', () => {
        const screen = dropdownScreen();
        expect(languageButtonsToAdd(withTwo(), screen)).toEqual([]);
        expect(addMissingLanguageButtons(withTwo(), screen)).toBe(screen);
    });

    it('knows which picker a screen uses, so the author can be told', () => {
        expect(languagePickerStyle(dropdownScreen())).toBe('dropdown');
        expect(languagePickerStyle(createLanguageScreen(withTwo()))).toBe('buttons');
    });

    it('falls back to buttons if no variable was supplied', () => {
        // A dropdown with nowhere to store its selection would be inert, so buttons are safer.
        const screen = createLanguageScreen(withTwo(), 'Language', 'dropdown');
        expect(findDropdown(screen)).toBeUndefined();
        expect(buttons(screen).length).toBe(3);
    });
});

describe('🔴 changing the picker on a screen that already exists', () => {
    const varId = 'var-lang';
    const findDropdown2 = (screen: any) =>
        Object.values<any>(screen.elements).find(el => el.type === 'Dropdown');

    it('turns buttons into a dropdown', () => {
        const before = createLanguageScreen(withTwo());
        const after: any = setLanguagePickerStyle(withTwo(), before, 'dropdown', varId);
        expect(buttons(after)).toEqual([]);
        expect(findDropdown2(after).options.map((o: any) => o.value)).toEqual(['en', 'es', 'ja']);
    });

    it('turns a dropdown back into buttons', () => {
        const before = createLanguageScreen(withTwo(), 'Language', 'dropdown', varId);
        const after: any = setLanguagePickerStyle(withTwo(), before, 'buttons');
        expect(findDropdown2(after)).toBeUndefined();
        expect(buttons(after).map(b => b.action.languageCode)).toEqual(['en', 'es', 'ja']);
    });

    it('🔴 leaves everything that is NOT the picker exactly as the author left it', () => {
        const before: any = createLanguageScreen(withTwo());
        // The author restyled the heading and added artwork of their own.
        const headingId = Object.values<any>(before.elements).find(el => el.type === 'Text').id;
        before.elements[headingId].text = 'Choose your language';
        before.elements[headingId].y = 5;
        before.elements.custom = { id: 'custom', type: 'Image', imageId: 'flag' };
        before.background = { type: 'image', assetId: 'bg9' };

        const after: any = setLanguagePickerStyle(withTwo(), before, 'dropdown', varId);
        expect(after.elements[headingId].text).toBe('Choose your language');
        expect(after.elements[headingId].y).toBe(5);
        expect(after.elements.custom).toBe(before.elements.custom);
        expect(after.background).toEqual({ type: 'image', assetId: 'bg9' });
        // ...including the way back out.
        expect(Object.values<any>(after.elements)
            .some(el => el.action?.type === UIActionType.ReturnToPreviousScreen)).toBe(true);
    });

    it('does nothing when the style is already what was asked for', () => {
        const screen = createLanguageScreen(withTwo());
        expect(setLanguagePickerStyle(withTwo(), screen, 'buttons')).toBe(screen);
    });

    it('refuses to build a dropdown with nowhere to store the choice', () => {
        const screen = createLanguageScreen(withTwo());
        expect(setLanguagePickerStyle(withTwo(), screen, 'dropdown')).toBe(screen);
    });

    it('survives a round trip back to where it started', () => {
        const start = createLanguageScreen(withTwo());
        const toDropdown = setLanguagePickerStyle(withTwo(), start, 'dropdown', varId);
        const back: any = setLanguagePickerStyle(withTwo(), toDropdown, 'buttons');
        expect(buttons(back).map(b => b.action.languageCode)).toEqual(['en', 'es', 'ja']);
        expect(findDropdown2(back)).toBeUndefined();
    });
});

describe('🔴 removing a language takes it off the screen too', () => {
    const varId = 'var-lang';
    const findDropdown3 = (screen: any) =>
        Object.values<any>(screen.elements).find(el => el.type === 'Dropdown');

    it('removes the button for a language that is gone', () => {
        const screen = createLanguageScreen(withTwo());
        const after: any = removeLanguageFromScreen(withTwo(), screen, 'ja');
        expect(buttons(after).map(b => b.action.languageCode)).toEqual(['en', 'es']);
    });

    it('removes the DROPDOWN OPTION for a language that is gone', () => {
        const screen = createLanguageScreen(withTwo(), 'Language', 'dropdown', varId);
        const after: any = removeLanguageFromScreen(withTwo(), screen, 'ja');
        expect(findDropdown3(after).options.map((o: any) => o.value)).toEqual(['en', 'es']);
    });

    it('🔴 never removes the language the game is written in', () => {
        // It's the one option that can never be missing — a player who switches by accident
        // needs a way back.
        const screen = createLanguageScreen(withTwo());
        expect(removeLanguageFromScreen(withTwo(), screen, 'en')).toBe(screen);
    });

    it('leaves the heading, the back button and everything else alone', () => {
        const screen: any = createLanguageScreen(withTwo());
        const before = Object.keys(screen.elements).length;
        const after: any = removeLanguageFromScreen(withTwo(), screen, 'ja');
        expect(Object.keys(after.elements)).toHaveLength(before - 1);
        expect(Object.values<any>(after.elements)
            .some(el => el.action?.type === UIActionType.ReturnToPreviousScreen)).toBe(true);
        expect(Object.values<any>(after.elements).some(el => el.type === 'Text')).toBe(true);
    });

    it('returns the identical screen when there is nothing to remove', () => {
        const screen = createLanguageScreen(withTwo());
        expect(removeLanguageFromScreen(withTwo(), screen, 'fr')).toBe(screen);
        expect(removeLanguageFromScreen(withTwo(), screen, '')).toBe(screen);
    });

    it('🔴 add and remove are true opposites', () => {
        const start = createLanguageScreen(withTwo(), 'Language', 'dropdown', varId);
        const p = withTwo();
        p.localization.languages.push({ code: 'fr', name: 'Français', enabled: true });

        const added = addMissingLanguageButtons(p, start);
        expect(findDropdown3(added).options.map((o: any) => o.value)).toEqual(['en', 'es', 'ja', 'fr']);

        const removed: any = removeLanguageFromScreen(p, added, 'fr');
        expect(findDropdown3(removed).options.map((o: any) => o.value)).toEqual(['en', 'es', 'ja']);
    });
});
