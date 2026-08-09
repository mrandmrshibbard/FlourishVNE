/**
 * The translation workspace.
 *
 * 🔴 The first test is the whole reason this panel was rebuilt: the previous version kept
 * translations in a service object held in component state and never dispatched, so an author's
 * work was discarded the moment the panel closed. If nothing else here survives, that one must.
 *
 * These are also the ONLY type safety this file gets — `@types/react` isn't installed, so `tsc`
 * doesn't check props or JSX at all and a renamed prop would sail straight through.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const dispatch = vi.fn();
let project: any;
vi.mock('../../contexts/ProjectContext', () => ({ useProject: () => ({ project, dispatch }) }));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, d?: any, o?: any) => {
            const s = typeof d === 'string' ? d : key;
            return s.replace(/\{\{(\w+)\}\}/g, (_m: string, n: string) => String(o?.[n] ?? ''));
        },
    }),
}));

import LocalizationPanel from '../LocalizationPanel';

const makeProject = (localization?: any): any => ({
    id: 'p', title: 'My Game',
    scenes: {
        s1: {
            id: 's1', name: 'Rooftop', commands: [
                { id: 'c1', type: 'Dialogue', characterId: 'mia', text: 'I said [shake]NO[/shake], {Nickname}.' },
                { id: 'c2', type: 'Dialogue', characterId: null, text: 'It was quiet.' },
            ],
        },
    },
    characters: { mia: { id: 'mia', name: 'Mia' } },
    items: {}, itemCollections: {}, uiScreens: {}, commonEvents: {},
    localization,
});

const spanish = (strings: any = {}) => ({
    sourceLanguage: 'en',
    languages: [{ code: 'es', name: 'Español', enabled: true }],
    strings,
});

const lastPayload = () => dispatch.mock.calls[dispatch.mock.calls.length - 1][0].payload.localization;

beforeEach(() => { dispatch.mockClear(); project = makeProject(); });

describe('🔴 translations are SAVED, not held in component state', () => {
    it('typing a translation dispatches it into the project', () => {
        project = makeProject(spanish());
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);

        const box = screen.getAllByPlaceholderText('Translation…')[0];
        // Typing is change-then-blur; the box is controlled, so setting `target.value` on the
        // blur alone would bypass React's state and test nothing real.
        fireEvent.change(box, { target: { value: 'Dije [shake]NO[/shake], {Nickname}.' } });
        fireEvent.blur(box);

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(dispatch.mock.calls[0][0].type).toBe('UPDATE_PROJECT');
        expect(lastPayload().strings['cmd:c1:text'].es.text).toBe('Dije [shake]NO[/shake], {Nickname}.');
    });

    it('records what it was translated from, so a later edit shows it as out of date', () => {
        project = makeProject(spanish());
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        const box = screen.getAllByPlaceholderText('Translation…')[0];
        fireEvent.change(box, { target: { value: 'Hola' } });
        fireEvent.blur(box);
        expect(lastPayload().strings['cmd:c1:text'].es.sourceHash).toBeTruthy();
        expect(lastPayload().strings['cmd:c1:text'].es.needsReview).toBe(false);
    });

    it('does not dispatch when the text was not actually changed', () => {
        project = makeProject(spanish({ 'cmd:c1:text': { es: { text: 'ya' } } }));
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        fireEvent.blur(screen.getAllByPlaceholderText('Translation…')[0], { target: { value: 'ya' } });
        expect(dispatch).not.toHaveBeenCalled();
    });
});

describe('languages', () => {
    it('starts with a plain explanation that nothing changes until you add one', () => {
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        expect(screen.getByText(/Add a language to get started/)).toBeTruthy();
    });

    it('adding a language dispatches it', () => {
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /Add a language/ }));
        fireEvent.change(screen.getByLabelText('Choose a language…'), { target: { value: 'ja' } });
        expect(lastPayload().languages).toEqual([{ code: 'ja', name: '日本語', enabled: true }]);
    });

    it('🔴 adding the first language also builds the screen players choose it on', () => {
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /Add a language/ }));
        fireEvent.change(screen.getByLabelText('Choose a language…'), { target: { value: 'ja' } });

        const payload = dispatch.mock.calls[0][0].payload;
        const screenId = payload.ui.languageScreenId;
        expect(screenId).toBeTruthy();
        // Otherwise an author ends up with a translated game players can't switch into.
        const buttons: any[] = Object.values(payload.uiScreens[screenId].elements)
            .filter((el: any) => el.action?.type === 'SetLanguage');
        expect(buttons.map(b => b.action.languageCode).sort()).toEqual(['en', 'ja']);
        expect(screen.getByText(/screen was added so players can choose/)).toBeTruthy();
    });

    it('adding a SECOND language tops up the existing screen instead of replacing it', () => {
        const p = makeProject(spanish());
        p.ui = { languageScreenId: 'lang1' };
        p.uiScreens = { lang1: { id: 'lang1', name: 'Language', elements: {
            keep: { id: 'keep', type: 'Button', text: 'Español', x: 12, action: { type: 'SetLanguage', languageCode: 'es' } },
        } } };
        project = p;

        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /Add a language/ }));
        fireEvent.change(screen.getByLabelText('Choose a language…'), { target: { value: 'ja' } });

        const payload = dispatch.mock.calls[0][0].payload;
        expect(payload.ui).toBeUndefined();                                  // no new screen claimed
        const elements = payload.uiScreens.lang1.elements;
        expect(elements.keep.x).toBe(12);                                    // author's edit survives
        const codes = Object.values(elements).map((el: any) => el.action?.languageCode);
        expect(codes).toContain('ja');
    });

    it('🔴 removing a language WARNS first and says how much work is at stake', () => {
        project = makeProject(spanish({ 'cmd:c1:text': { es: { text: 'Dije NO' } } }));
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        fireEvent.click(screen.getByTitle(/Remove this language/));
        // Nothing happens on the click alone — the prompt appears first.
        expect(dispatch).not.toHaveBeenCalled();
        expect(screen.getByText(/Remove Español\?/)).toBeTruthy();
        expect(screen.getByText(/deletes 1 translations/)).toBeTruthy();
    });

    it('cancelling the prompt changes nothing', () => {
        project = makeProject(spanish({ 'cmd:c1:text': { es: { text: 'Dije NO' } } }));
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        fireEvent.click(screen.getByTitle(/Remove this language/));
        fireEvent.click(screen.getByText('Cancel'));
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('🔴 confirming also takes the language OFF the language screen', () => {
        const p = makeProject(spanish({ 'cmd:c1:text': { es: { text: 'Dije NO' } } }));
        p.ui = { languageScreenId: 'lang1' };
        p.uiScreens = { lang1: { id: 'lang1', name: 'Language', elements: {
            head: { id: 'head', type: 'Text', text: '🌐 Language' },
            en: { id: 'en', type: 'Button', action: { type: 'SetLanguage', languageCode: 'en' } },
            es: { id: 'es', type: 'Button', action: { type: 'SetLanguage', languageCode: 'es' } },
        } } };
        project = p;

        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        fireEvent.click(screen.getByTitle(/Remove this language/));
        fireEvent.click(screen.getByText('Remove and delete'));

        const elements = dispatch.mock.calls[0][0].payload.uiScreens.lang1.elements;
        // Otherwise players keep a button that switches into a language the game no longer has.
        expect(elements.es).toBeUndefined();
        expect(elements.en).toBeTruthy();                 // the original language always stays
        expect(elements.head).toBeTruthy();
    });

    it('🔴 confirming DELETES the translations, so re-adding starts empty', () => {
        project = makeProject(spanish({
            'cmd:c1:text': { es: { text: 'Dije NO' }, fr: { text: 'Je dis NON' } },
            'cmd:c2:text': { es: { text: 'Silencio' } },
        }));
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        fireEvent.click(screen.getByTitle(/Remove this language/));
        fireEvent.click(screen.getByText('Remove and delete'));

        expect(lastPayload().languages).toEqual([]);
        expect(lastPayload().strings['cmd:c1:text'].es).toBeUndefined();
        // Another language's work on the same line is untouched...
        expect(lastPayload().strings['cmd:c1:text'].fr.text).toBe('Je dis NON');
        // ...and a line left with nothing at all is dropped rather than kept as an empty husk.
        expect(lastPayload().strings['cmd:c2:text']).toBeUndefined();
    });

    it('can be translated but not yet offered to players', () => {
        project = makeProject(spanish());
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        fireEvent.click(screen.getByTitle(/Offer this language to players/).querySelector('input')!);
        expect(lastPayload().languages[0].enabled).toBe(false);
    });
});

describe('🔴 choosing how players pick their language', () => {
    const withScreen = (elements: any) => {
        const p = makeProject(spanish());
        p.ui = { languageScreenId: 'lang1' };
        p.uiScreens = { lang1: { id: 'lang1', name: 'Language', elements } };
        return p;
    };
    const buttonScreen = () => withScreen({
        head: { id: 'head', type: 'Text', text: '🌐 Language' },
        b1: { id: 'b1', type: 'Button', text: 'English', action: { type: 'SetLanguage', languageCode: 'en' } },
        b2: { id: 'b2', type: 'Button', text: 'Español', action: { type: 'SetLanguage', languageCode: 'es' } },
    });
    const styleSelect = () => screen.getByLabelText('Players choose with');

    it('the control is visible even once a screen exists — you can change your mind', () => {
        project = buttonScreen();
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        expect((styleSelect() as HTMLSelectElement).value).toBe('buttons');
    });

    it('reads the style off the SCREEN, so the control never lies about what is there', () => {
        project = withScreen({
            d1: { id: 'd1', type: 'Dropdown', variableId: 'v', options: [],
                  actions: [{ type: 'SetLanguage', fromSelection: true }] },
        });
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        expect((styleSelect() as HTMLSelectElement).value).toBe('dropdown');
    });

    it('switching to a drop-down converts the existing screen and brings a variable', () => {
        project = buttonScreen();
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        fireEvent.change(styleSelect(), { target: { value: 'dropdown' } });

        const payload = dispatch.mock.calls[0][0].payload;
        const elements = payload.uiScreens.lang1.elements;
        expect(elements.head).toBeTruthy();                        // heading untouched
        expect(elements.b1).toBeUndefined();                       // buttons replaced
        const dropdown: any = Object.values(elements).find((el: any) => el.type === 'Dropdown');
        expect(dropdown.options.map((o: any) => o.value)).toEqual(['en', 'es']);
        expect(Object.values(payload.variables).some((v: any) => v.name === 'Language')).toBe(true);
    });

    it('reuses the language variable instead of making a new one each time', () => {
        const p = buttonScreen();
        p.variables = { existing: { id: 'existing', name: 'Language', type: 'string' } };
        project = p;
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        fireEvent.change(styleSelect(), { target: { value: 'dropdown' } });

        const payload = dispatch.mock.calls[0][0].payload;
        expect(payload.variables).toBeUndefined();                 // nothing new created
        const dropdown: any = Object.values(payload.uiScreens.lang1.elements)
            .find((el: any) => el.type === 'Dropdown');
        expect(dropdown.variableId).toBe('existing');
    });

    it('does nothing when the chosen style is already in use', () => {
        project = buttonScreen();
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        fireEvent.change(styleSelect(), { target: { value: 'buttons' } });
        expect(dispatch).not.toHaveBeenCalled();
    });
});

describe('pictures with words in them', () => {
    const withArt = (localization?: any) => {
        const p = makeProject(localization);
        p.backgrounds = { sign: { id: 'sign', name: 'Shop Sign', imageUrl: 'data:image/png;base64,EN' } };
        p.images = { sign_es: { id: 'sign_es', name: 'Shop Sign (Spanish)', imageUrl: 'data:image/png;base64,ES' } };
        return p;
    };
    const openArtTab = () => fireEvent.click(screen.getByText(/Pictures with words/));

    it('lists the game’s pictures so a swap can be chosen', () => {
        project = withArt(spanish());
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        openArtTab();
        // By title, not text: the names also appear as <option>s in the other rows' dropdowns.
        expect(screen.getByTitle('Shop Sign')).toBeTruthy();
        expect(screen.getByTitle('Shop Sign (Spanish)')).toBeTruthy();
    });

    it('🔴 saves the swap in the shape the runtime reads', () => {
        project = withArt(spanish());
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        openArtTab();
        fireEvent.change(screen.getAllByRole('combobox').filter(s => !s.getAttribute('aria-label'))[0], { target: { value: 'sign_es' } });
        // original id → replacement id, under the active language. applyGameLanguage repoints
        // `sign` at `sign_es`'s file, so everything already using `sign` shows the Spanish art.
        expect(lastPayload().assetOverrides).toEqual({ es: { sign: 'sign_es' } });
    });

    it('removes the entry instead of storing a swap that does nothing', () => {
        project = withArt({ ...spanish(), assetOverrides: { es: { sign: 'sign_es' } } });
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        openArtTab();
        fireEvent.change(screen.getAllByRole('combobox').filter(s => !s.getAttribute('aria-label'))[0], { target: { value: '' } });
        expect(lastPayload().assetOverrides).toEqual({ es: {} });
    });

    it('does not disturb another language’s swaps', () => {
        project = withArt({ ...spanish(), assetOverrides: { fr: { sign: 'sign_es' } } });
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        openArtTab();
        fireEvent.change(screen.getAllByRole('combobox').filter(s => !s.getAttribute('aria-label'))[0], { target: { value: 'sign_es' } });
        expect(lastPayload().assetOverrides.fr).toEqual({ sign: 'sign_es' });
    });

    it('says so plainly when the game has no pictures', () => {
        project = makeProject(spanish());
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        openArtTab();
        expect(screen.getByText(/no pictures yet/)).toBeTruthy();
    });
});

describe('dropping a file onto the panel', () => {
    const panel = () => document.querySelector('.max-w-6xl') as HTMLElement;

    it('invites the drop once a file is dragged over', () => {
        project = makeProject(spanish());
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        fireEvent.dragOver(panel());
        expect(screen.getByText('Drop the translated file here')).toBeTruthy();
    });

    it('🔴 cancels the dragover event — without that the browser just opens the file', () => {
        project = makeProject(spanish());
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        const event = new Event('dragover', { bubbles: true, cancelable: true });
        panel().dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
    });

    it('reads a dropped spreadsheet', async () => {
        project = makeProject(spanish());
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        const csv = [
            'Key,Part of the game,Where it appears,Original,Español (es),Notes',
            'char:mia:name,Characters,Character,Mia,Mía,',
        ].join('\r\n');
        const file = new File([csv], 'game_es.csv', { type: 'text/csv' });

        fireEvent.drop(panel(), { dataTransfer: { files: [file] } });
        await screen.findByText(/Import finished/);

        expect(lastPayload().strings['char:mia:name'].es.text).toBe('Mía');
    });

    it('stops inviting the drop when the file is dragged away again', () => {
        project = makeProject(spanish());
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        fireEvent.dragOver(panel());
        fireEvent.dragLeave(panel(), { relatedTarget: document.body });
        expect(screen.queryByText('Drop the translated file here')).toBeNull();
    });
});

describe('the workspace', () => {
    it('shows progress against the whole story', () => {
        project = makeProject(spanish({ 'cmd:c1:text': { es: { text: 'uno' } } }));
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        expect(screen.getByText('33%')).toBeTruthy();          // 1 of 3 (2 lines + character name)
    });

    it('warns about the bits that must not be translated', () => {
        project = makeProject(spanish());
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        expect(screen.getByText(/Keep \{Nickname\} exactly/)).toBeTruthy();
    });

    it('filters to what still needs doing', () => {
        project = makeProject(spanish({ 'cmd:c1:text': { es: { text: 'hecho' } } }));
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        expect(screen.getAllByPlaceholderText('Translation…')).toHaveLength(3);
        fireEvent.click(screen.getByText('Not translated'));
        expect(screen.getAllByPlaceholderText('Translation…')).toHaveLength(2);
    });

    it('marks a machine draft and lets one click approve it', () => {
        project = makeProject(spanish({
            'cmd:c1:text': { es: { text: 'borrador', origin: 'machine', needsReview: true } },
        }));
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        expect(screen.getByText('Machine draft')).toBeTruthy();
        fireEvent.click(screen.getByText('Looks good'));
        expect(lastPayload().strings['cmd:c1:text'].es.needsReview).toBe(false);
        expect(lastPayload().strings['cmd:c1:text'].es.text).toBe('borrador');
    });

    it('shows a translation as out of date once the original changes under it', () => {
        project = makeProject(spanish({
            'cmd:c1:text': { es: { text: 'viejo', sourceHash: 'not-the-current-hash' } },
        }));
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        // "Out of date" is also a filter button, so match the BADGE by its own styling.
        const badges = screen.getAllByText('Out of date').filter(el => el.className.includes('bg-orange-950'));
        expect(badges).toHaveLength(1);
        // ...and the row offers the one-click approval that clears it.
        expect(screen.getByText('Looks good')).toBeTruthy();
    });

    it('review-before-applying is OFF by default — no friction unless asked for', () => {
        project = makeProject(spanish());
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        const checkbox = screen.getByLabelText(/review each change/i) as HTMLInputElement;
        expect(checkbox.checked).toBe(false);
    });

    it('🔴 shows a translation that arrived from OUTSIDE, without reopening the panel', () => {
        // The bug: the box was uncontrolled (`defaultValue`), which React never updates after
        // mount — so an imported translation only appeared after closing and reopening the panel.
        project = makeProject(spanish());
        const { rerender } = render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        expect((screen.getAllByPlaceholderText('Translation…')[0] as HTMLTextAreaElement).value).toBe('');

        project = makeProject(spanish({ 'cmd:c1:text': { es: { text: 'Llegó de la importación' } } }));
        rerender(<LocalizationPanel isOpen={true} onClose={() => {}} />);

        expect((screen.getAllByPlaceholderText('Translation…')[0] as HTMLTextAreaElement).value)
            .toBe('Llegó de la importación');
    });

    it('typing stays local until blur, so a keystroke never rewrites the project', () => {
        project = makeProject(spanish());
        render(<LocalizationPanel isOpen={true} onClose={() => {}} />);
        const box = screen.getAllByPlaceholderText('Translation…')[0];
        fireEvent.change(box, { target: { value: 'escribiendo' } });
        expect(dispatch).not.toHaveBeenCalled();
        expect((box as HTMLTextAreaElement).value).toBe('escribiendo');
        fireEvent.blur(box);
        expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('renders nothing at all when closed', () => {
        const { container } = render(<LocalizationPanel isOpen={false} onClose={() => {}} />);
        expect(container.firstChild).toBeNull();
    });
});
