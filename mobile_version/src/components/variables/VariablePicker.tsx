/**
 * Pick a variable — or make one, right here, without leaving what you were doing.
 *
 * Every variable dropdown in the app used to be a raw <select> of bare names, and if the variable you
 * wanted didn't exist yet you had to abandon the scene, go to the Variables tab, create it, come back,
 * and find your place again. That round trip happens dozens of times while writing a branching story,
 * and it is the single most common reason an author gives up on variables.
 *
 * So: search by name, see the author's own emoji and colour, and if nothing matches, create it from
 * the search box you already typed into. The new variable is selected immediately.
 *
 * ── Traps this component exists to avoid ───────────────────────────────────────────────────────────
 *  • Portaled to <body> at z-index 100000: it is used inside scrolling inspector panels (ancestor
 *    `overflow` would clip it) and inside z-[10000] modals (which would cover it). Same lesson
 *    SearchableSelect and EmojiPicker had to learn.
 *  • `ADD_VARIABLE` accepts a caller-supplied id — that is what lets us create AND select in one go.
 *    Without it we would have to guess the new variable by name afterwards.
 *  • `isInternal` variables (item-collection stock counts) are hidden by default. They work fine by id
 *    but listing them makes every picker noisy with machinery the author never named.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../contexts/ProjectContext';
import { VNID } from '../../types';
import { VNVariable, VNVariableType } from '../../features/variables/types';
import { hasBands, sortedBands } from '../../features/variables/bands';
import { PlusIcon } from '../icons';

const TYPE_META: Record<VNVariableType, { label: string; hint: string; glyph: string; defaultValue: string | number | boolean }> = {
    boolean: { label: 'Yes / No', hint: 'Something that either happened or didn’t', glyph: '✓', defaultValue: false },
    number: { label: 'Number', hint: 'Something you count or measure', glyph: '#', defaultValue: 0 },
    string: { label: 'Text', hint: 'Words — a name, a route, a colour', glyph: 'Aa', defaultValue: '' },
};

const WIDTH = 288;
const HEIGHT = 320;

export const VariablePicker: React.FC<{
    value?: VNID | '';
    onChange: (id: VNID) => void;
    /** Restrict to certain types (e.g. a Meter only makes sense on a number). Unset = all. */
    allowedTypes?: VNVariableType[];
    /** Offer "＋ Create". Default true. */
    allowCreate?: boolean;
    /** Show system-managed variables (item stock counts). Default false. */
    includeInternal?: boolean;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}> = ({ value, onChange, allowedTypes, allowCreate = true, includeInternal = false, placeholder, disabled, className = '' }) => {
    const { t } = useTranslation('variables');
    const { project, dispatch } = useProject();

    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [coords, setCoords] = useState<{ left: number; top: number; width: number } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const options = useMemo(() => {
        let list = Object.values(project.variables) as VNVariable[];
        if (!includeInternal) list = list.filter(v => !v.isInternal);
        if (allowedTypes?.length) list = list.filter(v => allowedTypes.includes(v.type));
        return list;
    }, [project.variables, allowedTypes, includeInternal]);

    const query = search.trim().toLowerCase();
    const filtered = useMemo(
        () => (query ? options.filter(v => v.name.toLowerCase().includes(query) || (v.description ?? '').toLowerCase().includes(query)) : options),
        [options, query],
    );

    const selected = value ? project.variables[value] : undefined;

    /** A name already taken (case-insensitively) must not be created a second time — {name} in text
     *  resolves BY NAME, so two variables called "Gold" would make interpolation a coin toss. */
    const nameTaken = useMemo(
        () => !!search.trim() && (Object.values(project.variables) as VNVariable[]).some(v => v.name.toLowerCase() === query),
        [project.variables, search, query],
    );
    const canCreate = allowCreate && !!search.trim() && !nameTaken;

    const createTypes: VNVariableType[] = allowedTypes?.length ? allowedTypes : ['boolean', 'number', 'string'];

    const create = (type: VNVariableType) => {
        const id = `var-${Math.random().toString(36).slice(2, 9)}` as VNID;
        dispatch({
            type: 'ADD_VARIABLE',
            payload: { id, name: search.trim(), type, defaultValue: TYPE_META[type].defaultValue },
        });
        onChange(id);              // select it immediately — the whole point of creating it here
        setIsOpen(false);
        setSearch('');
    };

    useEffect(() => {
        if (!isOpen) return;
        const onDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (triggerRef.current?.contains(target) || popRef.current?.contains(target)) return;
            setIsOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [isOpen]);

    useLayoutEffect(() => {
        if (!isOpen) { setCoords(null); return; }
        const update = () => {
            const el = triggerRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const width = Math.max(WIDTH, r.width);
            const openUp = window.innerHeight - r.bottom < HEIGHT && r.top > window.innerHeight - r.bottom;
            setCoords({
                left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
                top: openUp ? Math.max(8, r.top - HEIGHT - 6) : r.bottom + 6,
                width,
            });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [isOpen]);

    useEffect(() => { if (isOpen) searchRef.current?.focus(); }, [isOpen]);

    const chip = (v: VNVariable) => (
        <span
            className="w-5 h-5 rounded flex items-center justify-center text-[10px] flex-shrink-0"
            style={{
                background: `color-mix(in srgb, ${v.color ?? 'var(--accent-sky)'} 22%, transparent)`,
                border: `1px solid color-mix(in srgb, ${v.color ?? 'var(--accent-sky)'} 45%, transparent)`,
            }}
        >
            {v.icon || TYPE_META[v.type].glyph}
        </span>
    );

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(o => !o)}
                className={`w-full flex items-center gap-1.5 bg-[var(--bg-primary)] text-white px-2 py-1.5 rounded-md border border-[var(--border-default)] text-sm text-left hover:border-[var(--accent-lavender)] transition-colors disabled:opacity-50 ${className}`}
            >
                {selected ? (
                    <>
                        {chip(selected)}
                        <span className="truncate flex-grow">{selected.name}</span>
                    </>
                ) : (
                    <span className="truncate flex-grow text-[var(--text-muted)]">
                        {placeholder ?? t('picker.placeholder', 'Choose a variable…')}
                    </span>
                )}
                <span className="text-[var(--text-muted)] flex-shrink-0">▾</span>
            </button>

            {isOpen && coords && ReactDOM.createPortal(
                <div
                    ref={popRef}
                    style={{
                        position: 'fixed', left: coords.left, top: coords.top, width: coords.width, maxHeight: HEIGHT,
                        zIndex: 100000,                    // above the z-[10000] body-portal modals
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 10,
                        boxShadow: '0 12px 32px -8px rgba(0,0,0,0.6)',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    }}
                >
                    <div className="p-1.5 border-b border-[var(--border-subtle)] flex-shrink-0">
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={t('picker.search', 'Search, or type a new name…')}
                            className="w-full bg-[var(--bg-primary)] text-white px-2 py-1 rounded-md border border-[var(--border-default)] text-xs outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        />
                    </div>

                    <div className="overflow-y-auto flex-grow min-h-0 p-1">
                        {filtered.map(v => (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => { onChange(v.id); setIsOpen(false); setSearch(''); }}
                                className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-left hover:bg-[var(--bg-tertiary)] transition-colors"
                                style={{ background: v.id === value ? 'var(--bg-tertiary)' : undefined }}
                            >
                                {chip(v)}
                                <span className="flex-grow min-w-0">
                                    <span className="block text-xs text-white truncate">{v.name}</span>
                                    {(v.description || hasBands(v)) && (
                                        <span className="block text-[10px] text-[var(--text-muted)] truncate">
                                            {v.description || sortedBands(v).map(b => b.name).join(' → ')}
                                        </span>
                                    )}
                                </span>
                                <span className="text-[9px] text-[var(--text-muted)] flex-shrink-0">
                                    {t(`types.${v.type}`)}
                                </span>
                            </button>
                        ))}

                        {!filtered.length && !canCreate && (
                            <p className="text-[11px] text-[var(--text-muted)] p-2 text-center">
                                {nameTaken
                                    ? t('picker.nameTaken', 'A variable called that already exists.')
                                    : t('picker.none', 'No variables yet.')}
                            </p>
                        )}
                    </div>

                    {/* Create it here. This is the whole reason the component exists. */}
                    {canCreate && (
                        <div className="p-1.5 border-t border-[var(--border-subtle)] flex-shrink-0 space-y-1">
                            <p className="text-[10px] text-[var(--text-secondary)] px-0.5 flex items-center gap-1">
                                <PlusIcon className="w-3 h-3" />
                                {t('picker.createAs', 'Make “{{name}}” a new…', { name: search.trim() })}
                            </p>
                            <div className="flex gap-1">
                                {createTypes.map(ty => (
                                    <button
                                        key={ty}
                                        type="button"
                                        onClick={() => create(ty)}
                                        title={t(`picker.typeHint.${ty}`, TYPE_META[ty].hint)}
                                        className="flex-1 text-[11px] px-1.5 py-1 rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent-lavender)] transition-colors"
                                    >
                                        {t(`picker.type.${ty}`, TYPE_META[ty].label)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>,
                document.body,
            )}
        </>
    );
};

export default VariablePicker;
