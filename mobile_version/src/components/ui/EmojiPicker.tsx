/**
 * Pick an emoji — without knowing where emoji come from.
 *
 * Everywhere we ask an author for an emoji (a variable's icon, a band's icon), the field used to be a
 * bare text box: fine if you know the Windows emoji key, a dead end if you don't. This is a swatch you
 * click, with a searchable grid of the emoji a visual-novel writer actually reaches for.
 *
 * NOT the full Unicode set, on purpose: 3,000 emoji in a grid is a worse experience than 200 relevant
 * ones you can search by the words you'd actually use ("angry", "love", "money", "key"). The
 * "type your own" box at the bottom is the escape hatch, so nothing is off-limits.
 *
 * ── The two traps this component exists to avoid ────────────────────────────────────────────────
 *  1. It is used INSIDE scrolling inspector panels and inside modals. So the popover is PORTALED to
 *     <body> with position:fixed (ancestor `overflow` would otherwise clip it) at z-index 100000
 *     (above the z-[10000] body-portal modals — MapEditor, Conversation Studio…). Same rules the
 *     SearchableSelect dropdown had to learn.
 *  2. Emoji are rendered by the SYSTEM font — no CDN, no webfont, nothing to download. The offline
 *     desktop build stays offline.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';

/**
 * Curated for visual-novel authors. `k` = search keywords, so someone can type what they MEAN
 * ("angry", "money", "quest") rather than guess the emoji's official Unicode name.
 * Emoji themselves are content, not copy — never translated.
 */
export interface EmojiDef { e: string; k: string }

export const GROUPS: { id: string; label: string; emoji: EmojiDef[] }[] = [
    {
        id: 'feelings', label: 'Feelings',
        emoji: [
            { e: '😊', k: 'happy smile glad pleased' }, { e: '😄', k: 'happy grin joy laugh' },
            { e: '🥰', k: 'love adore affection smitten' }, { e: '😍', k: 'love hearts crush' },
            { e: '😳', k: 'flustered blush embarrassed surprised' }, { e: '😏', k: 'smug smirk sly' },
            { e: '🙂', k: 'neutral fine okay slight smile' }, { e: '😐', k: 'blank neutral indifferent' },
            { e: '😔', k: 'sad down disappointed dejected' }, { e: '😢', k: 'cry sad tears upset' },
            { e: '😭', k: 'sob cry bawl devastated' }, { e: '😠', k: 'angry mad cross annoyed' },
            { e: '😡', k: 'furious rage angry hate' }, { e: '😨', k: 'scared afraid fear frightened' },
            { e: '😱', k: 'terrified scream shock horror' }, { e: '🤔', k: 'think curious wonder suspicious' },
            { e: '😅', k: 'nervous awkward relieved sweat' }, { e: '😴', k: 'sleep tired asleep' },
            { e: '😌', k: 'calm relaxed content unnoticed serene' },
            { e: '🤢', k: 'sick ill nausea disgust' }, { e: '🤕', k: 'hurt injured wounded' },
            { e: '💀', k: 'dead death critical skull' }, { e: '😈', k: 'evil wicked mischief devil' },
        ],
    },
    {
        id: 'love', label: 'Love & bonds',
        emoji: [
            { e: '❤️', k: 'love heart red affection romance' }, { e: '💖', k: 'love sparkle heart adore' },
            { e: '💕', k: 'love hearts affection' }, { e: '💔', k: 'heartbreak broken breakup sad' },
            { e: '💘', k: 'cupid arrow love crush' }, { e: '🧡', k: 'orange heart warm' },
            { e: '💛', k: 'yellow heart friend' }, { e: '💚', k: 'green heart friend' },
            { e: '💙', k: 'blue heart calm' }, { e: '💜', k: 'purple heart' },
            { e: '🖤', k: 'black heart dark cold' }, { e: '🤍', k: 'white heart pure' },
            { e: '💍', k: 'ring marriage engagement propose' }, { e: '💋', k: 'kiss lips romance' },
            { e: '🌹', k: 'rose romance flower love' }, { e: '👥', k: 'friends people relationship' },
        ],
    },
    {
        id: 'status', label: 'Status & stats',
        emoji: [
            { e: '⭐', k: 'star favourite rating good' }, { e: '✨', k: 'sparkle magic special perfect' },
            { e: '🔥', k: 'fire hot streak passion' }, { e: '⚡', k: 'energy power lightning speed' },
            { e: '💪', k: 'strength strong power muscle' }, { e: '🧠', k: 'intelligence smart mind brain' },
            { e: '🍀', k: 'luck lucky fortune charm' }, { e: '🎯', k: 'accuracy aim target skill' },
            { e: '🏆', k: 'win trophy victory champion' }, { e: '🥇', k: 'first gold medal best' },
            { e: '📈', k: 'up rising increase growth' }, { e: '📉', k: 'down falling decrease loss' },
            { e: '⏳', k: 'time timer countdown waiting' }, { e: '🩸', k: 'blood health hurt wound' },
            { e: '🛡️', k: 'defence shield protect armour' }, { e: '⚔️', k: 'attack fight sword battle' },
            { e: '👁️', k: 'suspicion watch seen noticed eye' }, { e: '🎭', k: 'drama mask acting persona' },
        ],
    },
    {
        id: 'things', label: 'Things',
        emoji: [
            { e: '🔑', k: 'key unlock door open' }, { e: '🗝️', k: 'key old antique unlock' },
            { e: '🚪', k: 'door room exit entry' }, { e: '🔒', k: 'locked closed shut secure' },
            { e: '🔓', k: 'unlocked open' }, { e: '💰', k: 'money gold coins wealth rich' },
            { e: '💵', k: 'money cash notes currency' }, { e: '💎', k: 'gem diamond treasure valuable' },
            { e: '🎁', k: 'gift present reward' }, { e: '📱', k: 'phone mobile message text' },
            { e: '✉️', k: 'letter mail message note' }, { e: '📖', k: 'book read story diary journal' },
            { e: '📜', k: 'scroll quest note ancient' }, { e: '🗺️', k: 'map travel location journey' },
            { e: '🍰', k: 'cake food sweet dessert' }, { e: '☕', k: 'coffee drink cafe warm' },
            { e: '🍷', k: 'wine drink alcohol dinner' }, { e: '🎒', k: 'bag inventory backpack items' },
            { e: '⚗️', k: 'potion alchemy chemistry brew' }, { e: '🕯️', k: 'candle light dark flame' },
            { e: '🔮', k: 'crystal ball fortune magic future' }, { e: '🎲', k: 'dice chance random luck' },
        ],
    },
    {
        id: 'world', label: 'World',
        emoji: [
            { e: '☀️', k: 'sun day sunny morning' }, { e: '🌙', k: 'moon night evening' },
            { e: '⛅', k: 'cloudy overcast weather' }, { e: '🌧️', k: 'rain wet weather storm' },
            { e: '⛈️', k: 'storm thunder lightning' }, { e: '❄️', k: 'snow cold winter ice' },
            { e: '🌸', k: 'blossom spring flower sakura' }, { e: '🍂', k: 'autumn fall leaves' },
            { e: '🌊', k: 'sea ocean water wave' }, { e: '🏫', k: 'school class campus' },
            { e: '🏠', k: 'home house building' }, { e: '🏥', k: 'hospital medical clinic' },
            { e: '🌃', k: 'city night town' }, { e: '🌲', k: 'forest tree woods nature' },
            { e: '⛩️', k: 'shrine temple japan' }, { e: '🏰', k: 'castle fantasy kingdom' },
        ],
    },
    {
        id: 'marks', label: 'Marks',
        emoji: [
            { e: '✅', k: 'yes done complete tick check true' }, { e: '❌', k: 'no wrong fail cross false' },
            { e: '⚠️', k: 'warning caution careful danger' }, { e: '❓', k: 'question unknown mystery' },
            { e: '❗', k: 'important alert exclaim' }, { e: '🚩', k: 'flag marker route branch' },
            { e: '🔔', k: 'bell notification alert' }, { e: '🔕', k: 'muted silent off' },
            { e: '🚨', k: 'alarm alert caught emergency siren' },
            { e: '➕', k: 'plus add increase more' }, { e: '➖', k: 'minus subtract decrease less' },
            { e: '🔴', k: 'red dot critical stop' }, { e: '🟠', k: 'orange dot warning' },
            { e: '🟡', k: 'yellow dot caution' }, { e: '🟢', k: 'green dot good go' },
            { e: '🔵', k: 'blue dot calm' }, { e: '🟣', k: 'purple dot' },
            { e: '⚪', k: 'white dot empty none' }, { e: '⚫', k: 'black dot dark' },
        ],
    },
];

const ALL: EmojiDef[] = GROUPS.flatMap(g => g.emoji);

export const EmojiPicker: React.FC<{
    value?: string;
    onChange: (emoji: string | undefined) => void;
    /** Shown in the swatch when nothing is chosen — a hint of what this icon is FOR. */
    placeholder?: string;
    title?: string;
    disabled?: boolean;
}> = ({ value, onChange, placeholder = '🙂', title, disabled }) => {
    const { t } = useTranslation('components');
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const WIDTH = 288;
    const HEIGHT = 340;

    const results = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return null;
        return ALL.filter(x => x.k.includes(q) || x.e === q);
    }, [search]);

    // Close on outside click (the popover is portaled, so it is "outside" the trigger's DOM subtree).
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

    // Anchor to the trigger, flipping up/left when there's no room. Recomputed on scroll/resize so it
    // can't drift away from its button inside a scrolling inspector.
    useLayoutEffect(() => {
        if (!isOpen) { setCoords(null); return; }
        const update = () => {
            const el = triggerRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const openUp = window.innerHeight - r.bottom < HEIGHT && r.top > window.innerHeight - r.bottom;
            const left = Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8));
            setCoords({ left, top: openUp ? Math.max(8, r.top - HEIGHT - 6) : r.bottom + 6 });
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

    const choose = (e: string) => { onChange(e); setIsOpen(false); setSearch(''); };

    const cell = (x: EmojiDef) => (
        <button
            key={x.e}
            type="button"
            onClick={() => choose(x.e)}
            title={x.k.split(' ')[0]}
            className="w-8 h-8 rounded-md flex items-center justify-center text-lg leading-none transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{ outline: value === x.e ? '2px solid var(--accent-lavender)' : undefined }}
        >
            {x.e}
        </button>
    );

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(o => !o)}
                title={title ?? t('emoji.pick', 'Pick an emoji')}
                className="w-10 h-9 rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] flex items-center justify-center text-lg leading-none hover:border-[var(--accent-lavender)] transition-colors disabled:opacity-50"
            >
                {value || <span className="opacity-35">{placeholder}</span>}
            </button>

            {isOpen && coords && ReactDOM.createPortal(
                <div
                    ref={popRef}
                    style={{
                        position: 'fixed', left: coords.left, top: coords.top, width: WIDTH, maxHeight: HEIGHT,
                        // Above the z-[10000] body-portal modals, per the popover-always-on-top convention.
                        zIndex: 100000,
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 10,
                        boxShadow: '0 12px 32px -8px rgba(0,0,0,0.6)',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    }}
                >
                    <div className="p-1.5 flex items-center gap-1.5 border-b border-[var(--border-subtle)] flex-shrink-0">
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            autoFocus
                            placeholder={t('emoji.search', 'Search — “angry”, “key”, “money”…')}
                            className="flex-grow min-w-0 bg-[var(--bg-primary)] text-white px-2 py-1 rounded-md border border-[var(--border-default)] text-xs outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        />
                        {value && (
                            <button
                                type="button"
                                onClick={() => { onChange(undefined); setIsOpen(false); }}
                                className="text-[10px] px-1.5 py-1 rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-white whitespace-nowrap flex-shrink-0"
                            >
                                {t('emoji.none', 'None')}
                            </button>
                        )}
                    </div>

                    <div className="overflow-y-auto p-1.5 flex-grow min-h-0">
                        {results ? (
                            results.length ? (
                                <div className="grid grid-cols-8 gap-0.5">{results.map(cell)}</div>
                            ) : (
                                <p className="text-[11px] text-[var(--text-muted)] p-2 text-center">
                                    {t('emoji.noMatch', 'Nothing matches. You can paste your own below.')}
                                </p>
                            )
                        ) : (
                            GROUPS.map(g => (
                                <div key={g.id} className="mb-1.5">
                                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] px-1 mb-0.5">
                                        {t(`emoji.group.${g.id}`, g.label)}
                                    </p>
                                    <div className="grid grid-cols-8 gap-0.5">{g.emoji.map(cell)}</div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* The escape hatch: any emoji at all, including ones not on our list. */}
                    <div className="p-1.5 border-t border-[var(--border-subtle)] flex-shrink-0">
                        <input
                            value={value ?? ''}
                            onChange={e => onChange(e.target.value || undefined)}
                            placeholder={t('emoji.custom', '…or type / paste any emoji')}
                            className="w-full bg-[var(--bg-primary)] text-white px-2 py-1 rounded-md border border-[var(--border-default)] text-xs outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        />
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};

export default EmojiPicker;
