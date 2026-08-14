/**
 * The translation workspace.
 *
 * 🔴 Rebuilt on `project.localization`. The previous version kept everything in a service object
 * held in component state and never dispatched, so every translation an author typed was thrown
 * away the moment the panel closed — the bug this feature exists to fix. Every write here goes
 * through `dispatch`, which means it lands in the project, in undo history, and in the save file.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import JSZip from 'jszip';
import { useProject } from '../contexts/ProjectContext';
import { VNLanguage } from '../types/project';
import { VNID } from '../types';
import {
    buildTranslationSheets, buildTranslationCsv, readTranslationSheets, readTranslationCsv,
    ImportChange, ImportResult,
} from '../features/localization/translationSheet';
import { writeXlsx, parseXlsx, parseCsv } from '../features/localization/tabular';
import {
    applyTranslations, languageProgress, upsertTranslation, emptyLocalization, hashSource,
} from '../features/localization/store';
import { collectTranslatableText } from '../features/localization/walkTranslatable';
import {
    createLanguageScreen, addMissingLanguageButtons, createLanguageVariable, LanguagePickerStyle,
    languagePickerStyle, setLanguagePickerStyle, removeLanguageFromScreen,
} from '../features/localization/languageScreen';
import { describeTokens } from '../features/localization/tokenGuard';
import { downloadBlob } from '../utils/gameBundler';
import ImportReport from './localization/ImportReport';
import ReviewChanges from './localization/ReviewChanges';
import LocalizedArt from './localization/LocalizedArt';
import MachineDraft from './localization/MachineDraft';

interface LocalizationPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

/** Names are written in the language itself — that's what a speaker of it looks for in a list. */
const COMMON_LANGUAGES: { code: string; name: string }[] = [
    { code: 'es', name: 'Español' }, { code: 'fr', name: 'Français' }, { code: 'de', name: 'Deutsch' },
    { code: 'pt-BR', name: 'Português (Brasil)' }, { code: 'it', name: 'Italiano' }, { code: 'ru', name: 'Русский' },
    { code: 'ja', name: '日本語' }, { code: 'ko', name: '한국어' }, { code: 'zh-CN', name: '简体中文' },
    { code: 'zh-TW', name: '繁體中文' }, { code: 'ar', name: 'العربية' }, { code: 'pl', name: 'Polski' },
    { code: 'tr', name: 'Türkçe' }, { code: 'nl', name: 'Nederlands' },
];

type Filter = 'all' | 'untranslated' | 'needsReview' | 'stale';

/** Words vs. pictures — the two kinds of thing that need translating. */
const TabSwitch: React.FC<{ tab: 'text' | 'art'; setTab: (t: 'text' | 'art') => void; t: any }> = ({ tab, setTab, t }) => (
    <div className="flex gap-1 border-b border-slate-700 px-4 py-1.5">
        {([
            ['text', t('localizationPanel.tabText', 'Words')],
            ['art', t('localizationPanel.tabArt', 'Pictures with words in them')],
        ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
                className={`rounded px-3 py-1 text-sm ${tab === id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}>
                {label}
            </button>
        ))}
    </div>
);

/**
 * One translation cell.
 *
 * 🔴 Keeps the text in LOCAL state while typing and commits on blur — dispatching per keystroke
 * would rewrite the whole project on every letter. But the local copy must follow the stored value
 * when it changes from OUTSIDE (an import, an undo): this was a plain uncontrolled `defaultValue`,
 * and React never updates one of those after mount, so imported translations didn't appear until
 * the panel was closed and reopened. The `useEffect` is the fix, not a nicety.
 */
const TranslationBox: React.FC<{
    value: string;
    onCommit: (text: string) => void;
    placeholder: string;
    rows: number;
}> = ({ value, onCommit, placeholder, rows }) => {
    const [text, setText] = useState(value);
    useEffect(() => { setText(value); }, [value]);

    return (
        <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onBlur={() => { if (text !== value) onCommit(text); }}
            placeholder={placeholder}
            rows={rows}
            className="w-full rounded border border-slate-600 bg-slate-800 p-2 text-sm text-slate-100"
        />
    );
};

const LocalizationPanel: React.FC<LocalizationPanelProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation('contextPanels');
    const { project, dispatch } = useProject();

    const localization = project?.localization;
    const languages: VNLanguage[] = localization?.languages || [];
    const [active, setActive] = useState<string>('');
    const [filter, setFilter] = useState<Filter>('all');
    const [search, setSearch] = useState('');
    const [report, setReport] = useState<ImportResult | null>(null);
    const [pendingReview, setPendingReview] = useState<ImportChange[] | null>(null);
    const [reviewFirst, setReviewFirst] = useState(false);          // opt-in, per Brad
    const [addingLanguage, setAddingLanguage] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState<VNLanguage | null>(null);
    const [screenNotice, setScreenNotice] = useState<string | null>(null);
    const [tab, setTab] = useState<'text' | 'art'>('text');
    /* How the language screen lets players choose. Ten buttons is a wall of text on screen, so a
     * dropdown is offered — chosen BEFORE the screen is generated, since it decides what's built. */
    const [pickerStyle, setPickerStyle] = useState<LanguagePickerStyle>('buttons');
    const [dragging, setDragging] = useState(false);
    const [busy, setBusy] = useState('');
    const fileInput = useRef<HTMLInputElement>(null);

    const language = active || languages[0]?.code || '';
    const sites = useMemo(() => (project ? collectTranslatableText(project) : []), [project]);
    const progress = useMemo(
        () => (project && language ? languageProgress(project, language) : null),
        [project, language],
    );

    const update = (next: any) => dispatch({ type: 'UPDATE_PROJECT', payload: { localization: next } });

    /* ── Languages ─────────────────────────────────────────────────────────────────────── */

    /**
     * Adding a language also makes sure the game HAS a way for players to choose it.
     *
     * The screen is a real, editable UI screen (see `languageScreen.ts`) created the first time
     * it's needed and topped up with a button afterwards — never rebuilt, since by then it's the
     * author's screen. Doing this here means an author can't end up with a translated game that
     * players have no way to switch into, which is the obvious trap.
     */
    const addLanguage = (code: string, name: string) => {
        if (!project || languages.some(l => l.code === code)) return;
        const base = localization || emptyLocalization();
        const nextLocalization = { ...base, languages: [...base.languages, { code, name, enabled: true }] };
        const withLanguage: any = { ...project, localization: nextLocalization };

        const existingId = (project.ui as any)?.languageScreenId;
        const existing = existingId ? (project.uiScreens as any)?.[existingId] : null;
        const payload: any = { localization: nextLocalization };

        if (existing) {
            const topped = addMissingLanguageButtons(withLanguage, existing);
            if (topped !== existing) payload.uiScreens = { ...project.uiScreens, [existingId]: topped };
        } else {
            // A dropdown needs somewhere to store the selection, so it brings a variable with it.
            const needsVariable = pickerStyle === 'dropdown';
            const languageVar = needsVariable ? createLanguageVariable(withLanguage) : null;
            const screen = createLanguageScreen(withLanguage, 'Language', pickerStyle, languageVar?.id);

            payload.uiScreens = { ...project.uiScreens, [screen.id]: screen };
            payload.ui = { ...project.ui, languageScreenId: screen.id };
            if (languageVar) {
                payload.variables = { ...(project.variables || {}), [languageVar.id]: languageVar.variable };
            }
            setScreenNotice(screen.name);
        }

        dispatch({ type: 'UPDATE_PROJECT', payload });
        setActive(code);
        setAddingLanguage(false);
    };

    const setLanguageEnabled = (code: string, enabled: boolean) => {
        const base = localization || emptyLocalization();
        update({ ...base, languages: base.languages.map(l => l.code === code ? { ...l, enabled } : l) });
    };

    /* The style shown in the toolbar: whatever the existing screen actually uses, or the pending
     * choice for a screen that doesn't exist yet. Reading it off the screen means the control can
     * never disagree with what the author will see when they open it. */
    const existingScreen: any = (project?.ui as any)?.languageScreenId
        ? (project?.uiScreens as any)?.[(project!.ui as any).languageScreenId]
        : null;
    const currentPickerStyle: LanguagePickerStyle = existingScreen
        ? languagePickerStyle(existingScreen)
        : pickerStyle;

    /** Convert an existing screen's picker, or just remember the choice if there's no screen yet. */
    const changePickerStyle = (style: LanguagePickerStyle) => {
        setPickerStyle(style);
        if (!project || !existingScreen || style === currentPickerStyle) return;

        const payload: any = {};
        let variableId: VNID | undefined;
        if (style === 'dropdown') {
            // Reuse the language variable if one is already there — switching back and forth
            // shouldn't litter the project with a new variable each time.
            const existingVar = Object.values<any>(project.variables || {})
                .find(v => v?.name === 'Language');
            if (existingVar) {
                variableId = existingVar.id;
            } else {
                const made = createLanguageVariable(project);
                variableId = made.id;
                payload.variables = { ...(project.variables || {}), [made.id]: made.variable };
            }
        }

        const next = setLanguagePickerStyle(project, existingScreen, style, variableId);
        if (next === existingScreen) return;
        payload.uiScreens = { ...project.uiScreens, [existingScreen.id]: next };
        dispatch({ type: 'UPDATE_PROJECT', payload });
    };

    /** How much work is at stake, so the confirmation can say a number rather than "some data". */
    const translationCount = (code: string) =>
        Object.values(localization?.strings || {}).filter((byLang: any) => byLang?.[code]?.text).length;

    /**
     * Removing a language deletes its translations too.
     *
     * Keeping them was the first behaviour, and it was wrong in a way only using it reveals:
     * re-adding the language brought the old translations back from nowhere, which reads like a
     * bug even when it's deliberate. Deleting is what "remove" means. The confirmation names the
     * number of translations first, and it's a single dispatch, so Undo brings the whole thing back.
     */
    const removeLanguage = (code: string) => {
        const base = localization || emptyLocalization();
        const strings: any = {};
        for (const [key, byLang] of Object.entries<any>(base.strings || {})) {
            const { [code]: _removed, ...rest } = byLang || {};
            if (Object.keys(rest).length) strings[key] = rest;      // drop keys left with nothing
        }
        const payload: any = {
            localization: { ...base, languages: base.languages.filter(l => l.code !== code), strings },
        };

        // ...and take it off the language screen, or players keep seeing a button that switches
        // into a language the game no longer has.
        if (existingScreen) {
            const trimmed = removeLanguageFromScreen(project!, existingScreen, code);
            if (trimmed !== existingScreen) {
                payload.uiScreens = { ...project!.uiScreens, [existingScreen.id]: trimmed };
            }
        }

        dispatch({ type: 'UPDATE_PROJECT', payload });
        if (active === code) setActive('');
        setConfirmRemove(null);
    };

    /* ── Editing ───────────────────────────────────────────────────────────────────────── */

    const setTranslation = (key: string, text: string, source: string) => {
        update(upsertTranslation(localization, key, language, {
            text,
            origin: 'human',
            needsReview: false,                 // a person typed it — that IS the review
            sourceHash: hashSource(source),
        }));
    };

    const approve = (key: string, source: string) => {
        const current = localization?.strings?.[key]?.[language];
        if (!current) return;
        update(upsertTranslation(localization, key, language, {
            ...current, needsReview: false, sourceHash: hashSource(source),
        }));
    };

    /* ── Export ────────────────────────────────────────────────────────────────────────── */

    const exportFile = async (format: 'csv' | 'xlsx') => {
        if (!project || !language) return;
        setBusy(t('localizationPanel.preparing', 'Preparing the file…'));
        try {
            const options = {
                languageCode: language,
                languageName: languages.find(l => l.code === language)?.name,
                existing: localization?.strings,
            };
            const safeTitle = (project.title || 'game').replace(/[^\w.-]+/g, '_');
            const filename = `${safeTitle}_${language}.${format}`;
            const api = (window as any).electronAPI;

            if (format === 'csv') {
                const csv = buildTranslationCsv(project, options);
                if (api?.saveProjectToPath) await api.saveProjectToPath(csv, filename, undefined, 'csv');
                else downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
            } else {
                const bytes = await writeXlsx(buildTranslationSheets(project, options), JSZip);
                if (api?.saveProjectToPath) await api.saveProjectToPath(bytes, filename, undefined, 'xlsx');
                else downloadBlob(new Blob([bytes as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
            }
        } finally {
            setBusy('');
        }
    };

    /* ── Import ────────────────────────────────────────────────────────────────────────── */

    const importFile = async (file: File) => {
        if (!project || !language) return;
        setBusy(t('localizationPanel.reading', 'Reading the file…'));
        try {
            const existing = localization?.strings;
            let result: ImportResult;
            if (/\.xlsx$/i.test(file.name)) {
                const sheets = await parseXlsx(new Uint8Array(await file.arrayBuffer()), JSZip);
                result = readTranslationSheets(project, sheets, { languageCode: language, existing });
            } else {
                result = readTranslationCsv(project, await file.text(), { languageCode: language, existing });
            }
            setReport(result);
            if (reviewFirst && result.changes.length) setPendingReview(result.changes);
            else if (result.changes.length) {
                dispatch({
                    type: 'UPDATE_PROJECT',
                    payload: { localization: applyTranslations(project, result.changes, { language }).localization },
                });
            }
        } catch (error: any) {
            setReport({
                language, changes: [], counts: { rowsRead: 0, changed: 0, unchanged: 0, blank: 0, refused: 0 },
                issues: [{
                    kind: 'no-key-column', blocking: true, sheet: file.name, row: 1,
                    message: t('localizationPanel.unreadable',
                        "Couldn't read that spreadsheet. If it came from another program, open it and re-save it as CSV, then try again."),
                }],
            });
        } finally {
            setBusy('');
        }
    };

    const applyReviewed = (accepted: ImportChange[]) => {
        if (project && accepted.length) {
            dispatch({
                type: 'UPDATE_PROJECT',
                payload: { localization: applyTranslations(project, accepted, { language }).localization },
            });
        }
        setPendingReview(null);
    };

    /* ── Rows ──────────────────────────────────────────────────────────────────────────── */

    const rows = useMemo(() => {
        const strings = localization?.strings || {};
        const needle = search.trim().toLowerCase();
        return sites.filter(site => {
            const entry = strings[site.key]?.[language];
            if (filter === 'untranslated' && entry?.text) return false;
            if (filter === 'needsReview' && !entry?.needsReview) return false;
            if (filter === 'stale' && !(entry?.text && entry.sourceHash && entry.sourceHash !== hashSource(site.value))) return false;
            if (needle && !site.value.toLowerCase().includes(needle) && !site.where.toLowerCase().includes(needle)) return false;
            return true;
        });
    }, [sites, localization, language, filter, search]);

    if (!isOpen) return null;

    const filters: { id: Filter; label: string }[] = [
        { id: 'all', label: t('localizationPanel.filterAll', 'All') },
        { id: 'untranslated', label: t('localizationPanel.filterUntranslated', 'Not translated') },
        { id: 'needsReview', label: t('localizationPanel.filterNeedsReview', 'Needs review') },
        { id: 'stale', label: t('localizationPanel.filterStale', 'Out of date') },
    ];

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4"
            onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={`relative flex h-[85vh] w-full max-w-6xl flex-col rounded-xl bg-slate-900 shadow-2xl ${dragging ? 'ring-2 ring-emerald-500' : ''}`}
                onClick={e => e.stopPropagation()}
                /* Dropping the returned spreadsheet onto the panel is the natural gesture, so it
                 * works anywhere on it. `onDragOver` MUST preventDefault or the browser navigates
                 * away to the file instead of handing it over. */
                onDragOver={e => { e.preventDefault(); if (!dragging) setDragging(true); }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
                onDrop={e => {
                    e.preventDefault();
                    setDragging(false);
                    const file = e.dataTransfer?.files?.[0];
                    if (file && language) importFile(file);
                }}>

                {dragging && language && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-slate-900/80 text-lg text-emerald-300">
                        {t('localizationPanel.dropHere', 'Drop the translated file here')}
                    </div>
                )}

                {confirmRemove && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-black/70 p-4">
                        <div className="w-full max-w-md rounded-lg border border-slate-600 bg-slate-800 p-4">
                            <h3 className="mb-2 text-base font-semibold text-slate-100">
                                {t('localizationPanel.confirmRemoveTitle', 'Remove {{name}}?', { name: confirmRemove.name })}
                            </h3>
                            <p className="mb-4 text-sm text-slate-300">
                                {translationCount(confirmRemove.code) > 0
                                    ? t('localizationPanel.confirmRemoveBody',
                                        'This also deletes {{count}} translations for this language. You can undo it straight away with Ctrl+Z.',
                                        { count: translationCount(confirmRemove.code) })
                                    : t('localizationPanel.confirmRemoveEmpty',
                                        'Nothing has been translated into this language yet.')}
                            </p>
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setConfirmRemove(null)}
                                    className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-600">
                                    {t('localizationPanel.cancel', 'Cancel')}
                                </button>
                                <button onClick={() => removeLanguage(confirmRemove.code)}
                                    className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-500">
                                    {t('localizationPanel.confirmRemoveAction', 'Remove and delete')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-100">
                            {t('localizationPanel.title', 'Translate your game')}
                        </h2>
                        <p className="text-xs text-slate-400">
                            {t('localizationPanel.subtitle', 'Add a language, then translate here or send a spreadsheet to a translator.')}
                        </p>
                    </div>
                    <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">✕</button>
                </div>

                {/* Languages */}
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 px-4 py-2">
                    {languages.map(lang => (
                        <div key={lang.code}
                            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${lang.code === language ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200' : 'border-slate-600 text-slate-300'}`}>
                            <button onClick={() => setActive(lang.code)}>{lang.name}</button>
                            <label className="ml-1 flex cursor-pointer items-center gap-1 text-xs text-slate-400"
                                title={t('localizationPanel.enabledHint', 'Offer this language to players')}>
                                <input type="checkbox" checked={lang.enabled}
                                    onChange={e => setLanguageEnabled(lang.code, e.target.checked)} />
                            </label>
                            <button onClick={() => setConfirmRemove(lang)}
                                className="ml-1 text-slate-500 hover:text-rose-400"
                                title={t('localizationPanel.removeLanguage', 'Remove this language')}>✕</button>
                        </div>
                    ))}

                    {/* Always available. Hiding this once a screen existed meant an author who
                        generated buttons could never change their mind — "we never rebuild your
                        screen" shouldn't mean "you're stuck with the first choice". */}
                    <label className="ml-auto flex items-center gap-1 text-xs text-slate-400">
                        {t('localizationPanel.pickerStyle', 'Players choose with')}
                        <select value={currentPickerStyle}
                            aria-label={t('localizationPanel.pickerStyle', 'Players choose with')}
                            onChange={e => changePickerStyle(e.target.value as LanguagePickerStyle)}
                            className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-slate-100">
                            <option value="buttons">{t('localizationPanel.pickerButtons', 'A button per language')}</option>
                            <option value="dropdown">{t('localizationPanel.pickerDropdown', 'A drop-down list')}</option>
                        </select>
                    </label>

                    {addingLanguage ? (
                        <select autoFocus defaultValue=""
                            aria-label={t('localizationPanel.chooseLanguage', 'Choose a language…')}
                            onChange={e => {
                                const found = COMMON_LANGUAGES.find(l => l.code === e.target.value);
                                if (found) addLanguage(found.code, found.name);
                            }}
                            onBlur={() => setAddingLanguage(false)}
                            className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100">
                            <option value="" disabled>{t('localizationPanel.chooseLanguage', 'Choose a language…')}</option>
                            {COMMON_LANGUAGES.filter(l => !languages.some(x => x.code === l.code))
                                .map(l => <option key={l.code} value={l.code}>{l.name} ({l.code})</option>)}
                        </select>
                    ) : (
                        <button onClick={() => setAddingLanguage(true)}
                            className="rounded-full border border-dashed border-slate-600 px-3 py-1 text-sm text-slate-300 hover:border-slate-400">
                            + {t('localizationPanel.addLanguage', 'Add a language')}
                        </button>
                    )}
                </div>

                {screenNotice && (
                    <div className="flex items-start justify-between gap-3 border-b border-slate-700 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200">
                        <span>
                            {t('localizationPanel.screenCreated',
                                'A "{{name}}" screen was added so players can choose their language. You can restyle it like any other screen under Screens.',
                                { name: screenNotice })}
                        </span>
                        <button onClick={() => setScreenNotice(null)}
                            className="shrink-0 text-emerald-300/70 hover:text-emerald-100">✕</button>
                    </div>
                )}

                {!language ? (
                    <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-400">
                        {t('localizationPanel.emptyState', 'Add a language to get started. Your game keeps working exactly as it does now until you do.')}
                    </div>
                ) : pendingReview ? (
                    <div className="flex-1 min-h-0 p-4">
                        <ReviewChanges changes={pendingReview} onApply={applyReviewed} onCancel={() => setPendingReview(null)} />
                    </div>
                ) : tab === 'art' ? (
                    <>
                        <TabSwitch tab={tab} setTab={setTab} t={t} />
                        <LocalizedArt
                            project={project}
                            language={language}
                            languageName={languages.find(l => l.code === language)?.name || language}
                            overrides={localization?.assetOverrides?.[language] || {}}
                            onChange={next => {
                                const base = localization || emptyLocalization();
                                update({
                                    ...base,
                                    assetOverrides: { ...(base.assetOverrides || {}), [language]: next },
                                });
                            }}
                        />
                    </>
                ) : (
                    <>
                        <TabSwitch tab={tab} setTab={setTab} t={t} />
                        {/* Toolbar */}
                        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 px-4 py-2">
                            {progress && (
                                <div className="mr-2 text-sm text-slate-300">
                                    <span className="font-medium text-slate-100">{progress.percent}%</span>{' '}
                                    <span className="text-slate-400">
                                        ({progress.translated}/{progress.total})
                                    </span>
                                    {progress.needsReview > 0 && (
                                        <span className="ml-2 text-amber-400">
                                            {t('localizationPanel.needsReviewCount', '{{count}} to review', { count: progress.needsReview })}
                                        </span>
                                    )}
                                    {progress.stale > 0 && (
                                        <span className="ml-2 text-orange-400">
                                            {t('localizationPanel.staleCount', '{{count}} out of date', { count: progress.stale })}
                                        </span>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-1">
                                {filters.map(f => (
                                    <button key={f.id} onClick={() => setFilter(f.id)}
                                        className={`rounded px-2 py-1 text-xs ${filter === f.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}>
                                        {f.label}
                                    </button>
                                ))}
                            </div>

                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder={t('localizationPanel.search', 'Search…')}
                                className="ml-auto w-40 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100" />

                            <button onClick={() => exportFile('xlsx')} disabled={!!busy}
                                className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100 hover:bg-slate-600 disabled:opacity-50">
                                {t('localizationPanel.exportXlsx', 'Send to a translator (Excel)')}
                            </button>
                            <button onClick={() => exportFile('csv')} disabled={!!busy}
                                className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100 hover:bg-slate-600 disabled:opacity-50">
                                {t('localizationPanel.exportCsv', 'CSV')}
                            </button>
                            <button onClick={() => fileInput.current?.click()} disabled={!!busy}
                                className="rounded bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-500 disabled:opacity-50">
                                {t('localizationPanel.import', 'Bring a file back in')}
                            </button>
                            <input ref={fileInput} type="file" accept=".csv,.xlsx" className="hidden"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) importFile(file);
                                    e.target.value = '';       // so the same file can be picked twice
                                }} />
                        </div>

                        <div className="border-b border-slate-700 px-4 py-2">
                            <MachineDraft
                                project={project}
                                language={language}
                                languageName={languages.find(l => l.code === language)?.name || language}
                                onDrafted={next => dispatch({
                                    type: 'UPDATE_PROJECT',
                                    payload: { localization: (next as any).localization },
                                })}
                            />
                        </div>

                        <label className="flex items-center gap-2 border-b border-slate-700 px-4 py-1.5 text-xs text-slate-400">
                            <input type="checkbox" checked={reviewFirst} onChange={e => setReviewFirst(e.target.checked)} />
                            {t('localizationPanel.reviewFirst', 'Let me review each change before it is applied')}
                        </label>

                        {(report || busy) && (
                            <div className="border-b border-slate-700 px-4 py-2">
                                {busy
                                    ? <div className="text-sm text-slate-300">{busy}</div>
                                    : <ImportReport result={report!} onDismiss={() => setReport(null)} />}
                            </div>
                        )}

                        {/* The table */}
                        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
                            {rows.length === 0 ? (
                                <div className="py-10 text-center text-sm text-slate-400">
                                    {t('localizationPanel.noRows', 'Nothing here — try a different filter.')}
                                </div>
                            ) : rows.map(site => {
                                const entry = localization?.strings?.[site.key]?.[language];
                                const stale = !!(entry?.text && entry.sourceHash && entry.sourceHash !== hashSource(site.value));
                                const notes = describeTokens(site.value);
                                return (
                                    <div key={site.key} className="mb-2 rounded border border-slate-700 bg-slate-800/40 p-2">
                                        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-400">
                                            <span>{site.where}</span>
                                            <span className="flex items-center gap-2">
                                                {entry?.origin === 'machine' && (
                                                    <span className="rounded bg-sky-950 px-1.5 py-0.5 text-sky-300">
                                                        {t('localizationPanel.machineBadge', 'Machine draft')}
                                                    </span>
                                                )}
                                                {stale && (
                                                    <span className="rounded bg-orange-950 px-1.5 py-0.5 text-orange-300">
                                                        {t('localizationPanel.staleBadge', 'Out of date')}
                                                    </span>
                                                )}
                                                {(entry?.needsReview || stale) && entry?.text && (
                                                    <button onClick={() => approve(site.key, site.value)}
                                                        className="rounded bg-slate-700 px-2 py-0.5 text-slate-200 hover:bg-slate-600">
                                                        {t('localizationPanel.looksGood', 'Looks good')}
                                                    </button>
                                                )}
                                            </span>
                                        </div>
                                        <div className="grid gap-2 md:grid-cols-2">
                                            <div className="whitespace-pre-wrap rounded bg-slate-900/60 p-2 text-sm text-slate-300">
                                                {site.value}
                                            </div>
                                            <TranslationBox
                                                value={entry?.text || ''}
                                                onCommit={text => setTranslation(site.key, text, site.value)}
                                                placeholder={t('localizationPanel.translationPlaceholder', 'Translation…')}
                                                rows={Math.min(6, Math.max(2, Math.ceil(site.value.length / 60)))}
                                            />
                                        </div>
                                        {notes && <div className="mt-1 text-xs text-amber-400/90">{notes}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default LocalizationPanel;
