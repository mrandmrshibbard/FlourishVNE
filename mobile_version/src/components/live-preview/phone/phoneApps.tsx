/**
 * The in-game phone's APP REGISTRY.
 *
 * The phone used to hardcode four views ('home' | 'chat' | 'history' | 'contacts') inside
 * PhonePanel. Those saved `phone.view` values now double as app ids VERBATIM — old saves load
 * unchanged — and new apps (gallery, map, settings, call…) just add ids. PhonePanel renders the
 * shell (casing / status bar / wallpaper / home button) and delegates the screen's content to
 * `PHONE_APPS[view].render(ctx)`; unknown or disabled ids fall back to 'home'.
 *
 * The four legacy app bodies below were moved from PhonePanel verbatim — pixel-identical output
 * is the compatibility contract. Shared portrait/glyph helpers live here too so LivePreview and
 * future app modules import them from one place (imports stay one-directional).
 */
import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { VNID } from '../../../types';
import { VNProject, VNMapConfig, VNMapLocation } from '../../../types/project';
import { VNProjectUI, PhonePortraitSource, PhoneButtonConfig } from '../../../features/ui/types';
import { PHONE_GLYPHS } from '../../../features/ui/phoneIcons';
import { PhoneReply } from '../../../features/scene/types';
import { VNUIAction, UIActionType, VNCondition } from '../../../types/shared';
import { PlayerState, PhoneAppId } from '../types/gameState';
import { interpolateVariables } from '../../../utils/variableInterpolation';
import { fontSettingsToStyle } from '../../../utils/styleUtils';
import { phoneThreadKey, countPhoneThread } from '../command-handlers/phoneHandler';

// ─── Shared phone helpers (moved from LivePreview) ─────────────────────────────

export const PhoneGlyph: React.FC<{ name?: string }> = ({ name }) => (
    <span style={{ fontSize: '1.4em', lineHeight: 1 }}>{(name && PHONE_GLYPHS[name]) || '●'}</span>
);

/** Resolve a phone avatar / caller portrait into a STACK of image URLs (rendered overlapped).
 *  base → the character's base sprite; expression → base (unless hideBase) + the chosen pose's
 *  layer assets; custom → the uploaded image. Returns [] when nothing resolves (caller hides it). */
export function resolvePhonePortrait(
    source: PhonePortraitSource | undefined,
    character: any,
    assetResolver: (id: VNID | null, type: 'audio' | 'video' | 'image') => string | null,
): string[] {
    // Resolve through assetResolver (which maps managed refs → flourish-asset:// URLs). The base sprite
    // resolves by the character's own id; layer assets by their asset id.
    const baseUrl = character?.id ? assetResolver(character.id, 'image') : null;
    const mode = source?.mode || 'base';
    if (mode === 'custom') {
        const ci = source?.customImage;
        const url = ci ? assetResolver(ci.id, ci.type === 'video' ? 'video' : 'image') : null;
        return url ? [url] : (baseUrl ? [baseUrl] : []);
    }
    if (mode === 'expression' && character) {
        const stack: string[] = [];
        if (!source?.hideBase && baseUrl) stack.push(baseUrl);
        const expr = source?.expressionId ? character.expressions?.[source.expressionId] : undefined;
        if (expr) {
            for (const layer of Object.values(character.layers || {}) as any[]) {
                const assetId = expr.layerConfiguration?.[layer.id];
                if (!assetId) continue;
                const url = assetResolver(assetId, 'image');
                if (url) stack.push(url);
            }
        }
        return stack;
    }
    return baseUrl ? [baseUrl] : [];
}

/** A round phone avatar that overlaps a resolved portrait stack (base + pose layers, or custom). */
export const PhonePortrait: React.FC<{ urls: string[]; size: string; fit?: 'cover' | 'contain'; objectPosition?: string }> = ({ urls, size, fit, objectPosition }) => {
    if (urls.length === 0) return null;
    return (
        <div style={{ width: size, height: size, borderRadius: '9999px', overflow: 'hidden', flexShrink: 0, position: 'relative', background: 'rgba(0,0,0,0.2)' }}>
            {urls.map((u, i) => <img key={i} src={u} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit || 'cover', objectPosition: objectPosition || 'center' }} />)}
        </div>
    );
};

/** A tappable photo/video (chat bubbles + gallery tiles): tap → fullscreen lightbox. */
export const PhoneMedia: React.FC<{ media: { type: 'image' | 'video'; id: VNID }; assetResolver: (id: VNID | null, type: 'audio' | 'video' | 'image') => string | null; style?: React.CSSProperties; caption?: string }> = ({ media, assetResolver, style, caption }) => {
    const [zoomed, setZoomed] = useState(false);
    const url = assetResolver(media.id, media.type === 'video' ? 'video' : 'image');
    if (!url) return null;
    const thumb = media.type === 'video'
        ? <video src={url} muted loop playsInline autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />;
    return (
        <>
            <div onClick={(e) => { e.stopPropagation(); setZoomed(true); }} style={{ cursor: 'zoom-in', overflow: 'hidden', ...style }}>{thumb}</div>
            {zoomed && createPortal(
                <div onClick={() => setZoomed(false)} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', animation: 'fade-in 0.15s ease-out' }}>
                    {media.type === 'video'
                        ? <video src={url} controls autoPlay playsInline style={{ maxWidth: '92%', maxHeight: '86%' }} />
                        : <img src={url} alt="" style={{ maxWidth: '92%', maxHeight: '86%', objectFit: 'contain' }} />}
                    {caption && <div style={{ color: '#fff', marginTop: 10, fontSize: 14, opacity: 0.85, maxWidth: '80%', textAlign: 'center' }}>{caption}</div>}
                </div>,
                document.body,
            )}
        </>
    );
};

// ─── App registry ──────────────────────────────────────────────────────────────

/** Everything an app render needs — the primitives PhonePanel already closes over. */
export interface PhoneAppContext {
    ui: VNProjectUI;
    project: VNProject;
    phone: NonNullable<PlayerState['uiState']['phone']>;
    variables: Record<VNID, string | number | boolean>;
    assetResolver: (id: VNID | null, type: 'audio' | 'video' | 'image') => string | null;
    evaluateConditions: (c: VNCondition[] | undefined, v: Record<VNID, string | number | boolean>) => boolean;
    onAction: (a: VNUIAction) => void;
    onReply: (reply: PhoneReply) => void;
    onContactMessage: (contactId: VNID) => void;
    onContactCall: (contactId: VNID) => void;
    playTap: () => void;
    /** Navigate to another app (plays the tap sound; unknown/disabled ids land on home). */
    openApp: (id: PhoneAppId) => void;
    /** App buttons already filtered by show/conditions (for the home app's grid layout). */
    buttons: PhoneButtonConfig[];
    /** In-call transcript callbacks (the 'call' app). */
    onCallReply?: (reply: PhoneReply) => void;
    onEndCall?: () => void;
    /** Settings app: persist the player's wallpaper pick (phone.wallpaperId). */
    onSetWallpaper?: (id: VNID | null) => void;
    /** Messages app: open a thread (marks it read; may start a scripted text conversation).
     *  null = back to the threads inbox. Additive-optional (older shells fall back). */
    onOpenThread?: (contactId: VNID | null) => void;
}

export interface PhoneAppDef {
    id: PhoneAppId;
    /** Default icon (PHONE_GLYPHS key) for editor pickers / generated buttons. */
    glyph: string;
    /** Editor-facing name (English default; editors wrap with t()). */
    defaultLabel: string;
    /** Whether the app exists for this project (e.g. map only when a map is assigned).
     *  Disabled apps fall back to 'home' at render and are hidden from editor pickers. */
    isEnabled?: (ui: VNProjectUI, project: VNProject) => boolean;
    /** The chat thread swaps the wallpaper for the chat background — flag apps that do. */
    usesChatBackground?: boolean;
    /** The app body, rendered inside the phone screen's scrollable content area. */
    render: (ctx: PhoneAppContext) => React.ReactNode;
}

/** The contacts roster — shared between the in-flow contacts app body and the free,
 *  author-placed `phoneContactsRegion` overlay (which lives at shell level). Moved verbatim. */
export const renderContactsRoster = (ctx: PhoneAppContext): React.ReactNode => {
    const { ui, project, phone, variables, assetResolver, evaluateConditions, onContactCall, onContactMessage, playTap } = ctx;
    const contacts = (ui.phoneContacts || []).filter(c => !c.conditions?.length || evaluateConditions(c.conditions, variables));
    const sortedContacts = [...contacts].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    const contactAvatarSize = `${ui.phoneContactAvatarSize ?? 2.4}em`;
    const lastMessageFor = (cid: VNID) => {
        for (let i = phone.messages.length - 1; i >= 0; i--) {
            const m = phone.messages[i];
            if (m.senderId === cid || m.contactId === cid) return m.text;
        }
        return '';
    };
    return sortedContacts.length === 0 ? (
        <div style={{ opacity: 0.5, textAlign: 'center', marginTop: 12, fontSize: '0.8em' }}>No contacts</div>
    ) : sortedContacts.map(c => {
        const char = project.characters[c.characterId];
        const curls = resolvePhonePortrait(c.avatar, char, assetResolver);
        const name = c.displayName || char?.name || 'Unknown';
        const status = c.statusText ? interpolateVariables(c.statusText, variables, project) : '';
        const preview = lastMessageFor(c.characterId);
        return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 12, background: ui.phoneContactRowColor || ui.phoneHistoryRowColor || 'rgba(255,255,255,0.05)', color: ui.phoneContactTextColor || ui.phoneHistoryTextColor || '#fff' }}>
                {ui.phoneShowAvatars !== false && <PhonePortrait urls={curls} size={contactAvatarSize} fit={ui.phoneContactAvatarFit} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600, ...(ui.phoneContactNameFont ? fontSettingsToStyle(ui.phoneContactNameFont) : {}) }}>{name}</div>
                    {status && <div style={{ fontSize: '0.7em', opacity: 0.75, ...(ui.phoneContactStatusFont ? fontSettingsToStyle(ui.phoneContactStatusFont) : {}) }}>{status}</div>}
                    {preview && <div style={{ fontSize: '0.7em', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{interpolateVariables(preview, variables, project)}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {!c.hideCall && <button onClick={() => { playTap(); onContactCall(c.characterId); }} title={ui.phoneContactCallLabel || 'Call'} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 9999, border: 'none', cursor: 'pointer', background: ui.phoneCallAcceptColor || '#22c55e', color: '#fff', fontSize: '0.7em' }}>📞</button>}
                    {!c.hideMessage && <button onClick={() => { playTap(); onContactMessage(c.characterId); }} title={ui.phoneContactMessageLabel || 'Message'} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 9999, border: 'none', cursor: 'pointer', background: ui.phoneOutgoingBubbleColor || '#2f6bff', color: '#fff', fontSize: '0.7em' }}>💬</button>}
                </div>
            </div>
        );
    });
};

/** Fire an app button: `appId` (the simple path) wins; else the legacy custom `action`. */
export const fireAppButton = (ctx: PhoneAppContext, b: PhoneButtonConfig) => {
    ctx.playTap();
    if (b.appId) ctx.openApp(b.appId as PhoneAppId);
    else if (b.action) ctx.onAction(b.action);
};

// ── home ──
/** Decorative home-screen widgets (clock / text / image), condition-gated, % of the screen. */
const HomeWidgets: React.FC<{ ctx: PhoneAppContext }> = ({ ctx }) => {
    const { ui, project, variables, assetResolver, evaluateConditions } = ctx;
    const widgets = (ui.phoneHomeWidgets || []).filter(w => !w.conditions?.length || evaluateConditions(w.conditions, variables));
    if (!widgets.length) return null;
    return <>
        {widgets.map(w => {
            const font = w.font ? fontSettingsToStyle(w.font) : {};
            const style: React.CSSProperties = { position: 'absolute', left: `${w.x}%`, top: `${w.y}%`, width: `${w.width}%`, ...(w.height ? { height: `${w.height}%` } : {}), pointerEvents: 'none', color: w.color || '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.6)', ...font };
            if (w.type === 'image' && w.image) {
                const url = assetResolver(w.image.id, w.image.type === 'video' ? 'video' : 'image');
                if (!url) return null;
                return <div key={w.id} style={style}>{w.image.type === 'video' ? <video src={url} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}</div>;
            }
            const text = w.type === 'clock' ? (ui.phoneClockText || '') : (w.text || '');
            return <div key={w.id} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>{interpolateVariables(text, variables, project)}</div>;
        })}
    </>;
};

const HomeApp: PhoneAppDef = {
    id: 'home', glyph: 'home', defaultLabel: 'Home',
    render: (ctx) => {
        const { ui, assetResolver, buttons } = ctx;
        // 'bar' and 'free' button layouts render at SHELL level (unchanged legacy behavior);
        // the 'grid' layout is the home app's own full-screen icon grid. Widgets render on the
        // home screen in every layout.
        if (ui.phoneButtonLayout !== 'grid') return <HomeWidgets ctx={ctx} />;
        const cols = Math.max(1, ui.phoneHomeGridColumns ?? 3);
        const iconPct = Math.max(6, Math.min(40, ui.phoneHomeIconSize ?? 18));
        const labelFont = ui.phoneHomeLabelFont ? fontSettingsToStyle(ui.phoneHomeLabelFont) : {};
        return (
            <>
            <HomeWidgets ctx={ctx} />
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '4%', padding: '4% 2%', alignContent: 'start' }}>
                {buttons.map(b => {
                    const customIcon = b.iconImage ? assetResolver(b.iconImage.id, 'image') : null;
                    return (
                        <button key={b.id} onClick={() => fireAppButton(ctx, b)} title={b.label || ''}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: ui.phoneButtonIconColor || '#cbd5e1', padding: 0 }}>
                            <span style={{
                                width: `${(iconPct / (100 / cols)) * 100}%`, maxWidth: '86%', aspectRatio: '1',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: ui.phoneHomeIconBgColor || 'transparent',
                                borderRadius: ui.phoneHomeIconRadius ?? 14,
                                containerType: 'size',
                            } as React.CSSProperties}>
                                {customIcon
                                    ? <img src={customIcon} alt="" style={{ width: '86cqmin', height: '86cqmin', objectFit: 'contain' }} />
                                    : <span style={{ fontSize: '64cqmin', lineHeight: 1 }}>{(b.builtinIcon && PHONE_GLYPHS[b.builtinIcon]) || '●'}</span>}
                            </span>
                            {ui.phoneHomeShowLabels !== false && b.label && (
                                <span style={{ fontSize: '0.65em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', textShadow: '0 1px 3px rgba(0,0,0,0.7)', ...labelFont }}>{b.label}</span>
                            )}
                        </button>
                    );
                })}
            </div>
            </>
        );
    },
};

// ── chat (the message thread) — moved verbatim from PhonePanel ──
const ChatApp: PhoneAppDef = {
    id: 'chat', glyph: 'chat', defaultLabel: 'Messages', usesChatBackground: true,
    render: (ctx) => {
        const { ui, project, phone, variables, assetResolver, evaluateConditions, onAction, onReply, playTap, onOpenThread } = ctx;
        const bodyFont = ui.phoneFont ? fontSettingsToStyle(ui.phoneFont) : {};
        const chatAvatarSize = `${ui.phoneChatAvatarSize ?? 2.2}em`;
        const activeContactId = phone.activeContactId;

        // ── Threads inbox (no thread focused) — one row per conversation, newest first ──
        if (!activeContactId) {
            const groups = new Map<string, any[]>();
            phone.messages.forEach((m, idx) => {
                const key = phoneThreadKey(m);
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push({ m, idx });
            });
            const rows = Array.from(groups.entries()).map(([key, entries]) => {
                const contact = key ? (ui.phoneContacts || []).find(c => c.characterId === key) : undefined;
                const char = key ? project.characters[key] : null;
                const name = contact?.displayName || char?.name || (key ? '?' : (ui.phoneMessagesHeader || 'Messages'));
                const urls = char ? resolvePhonePortrait(contact?.avatar, char, assetResolver) : [];
                const last = entries[entries.length - 1];
                const preview = last.m.text ? interpolateVariables(last.m.text, variables, project) : (last.m.image ? '📷 Photo' : '');
                const unread = Math.max(0, entries.length - ((phone.threadLastRead || {})[key] ?? 0));
                return { key, name, urls, preview, unread, recency: last.idx };
            });
            // Contacts with an available (conditions-passing, unplayed) scripted text conversation
            // but no history yet get a "New conversation" row pinned on top — opening it plays it.
            const played = phone.playedConversations || [];
            (ui.phoneContacts || []).forEach(c => {
                if (groups.has(c.characterId) || c.hideMessage) return;
                if (c.conditions?.length && !evaluateConditions(c.conditions, variables)) return;
                const available = (c.textConversations || []).some(e => !!e.conversation?.lines?.length
                    && (!e.once || !played.includes(e.id))
                    && (!e.conditions?.length || evaluateConditions(e.conditions, variables)));
                if (!available) return;
                const char = project.characters[c.characterId];
                rows.push({ key: c.characterId, name: c.displayName || char?.name || '?', urls: char ? resolvePhonePortrait(c.avatar, char, assetResolver) : [], preview: ui.phoneMessagesNewHint || 'New conversation', unread: 1, recency: Number.MAX_SAFE_INTEGER });
            });
            rows.sort((a, b) => b.recency - a.recency);
            return (
                <>
                    <div style={{ fontWeight: 700, fontSize: '0.9em', marginBottom: 4, ...(ui.phoneTitleFont ? fontSettingsToStyle(ui.phoneTitleFont) : {}) }}>{ui.phoneMessagesHeader || 'Messages'}</div>
                    {rows.length === 0 && <div style={{ opacity: 0.5, textAlign: 'center', marginTop: 12, fontSize: '0.8em' }}>{ui.phoneMessagesEmptyText || 'No messages yet'}</div>}
                    {rows.map(r => (
                        <div key={r.key || '·'} onClick={() => { if (onOpenThread) { playTap(); onOpenThread(r.key as VNID); } }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 12, cursor: 'pointer', background: ui.phoneContactRowColor || ui.phoneHistoryRowColor || 'rgba(255,255,255,0.05)', color: ui.phoneContactTextColor || ui.phoneHistoryTextColor || '#fff' }}>
                            {ui.phoneShowAvatars !== false && r.urls.length > 0 && <PhonePortrait urls={r.urls} size={`${ui.phoneContactAvatarSize ?? 2.4}em`} fit={ui.phoneContactAvatarFit} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600, ...(ui.phoneContactNameFont ? fontSettingsToStyle(ui.phoneContactNameFont) : {}) }}>{r.name}</div>
                                {r.preview && <div style={{ fontSize: '0.7em', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.preview}</div>}
                            </div>
                            {r.unread > 0 && <span style={{ flexShrink: 0, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9999, background: ui.phoneBadgeColor || '#ef4444', color: ui.phoneBadgeTextColor || '#fff', fontSize: '0.65em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{r.unread > 9 ? '9+' : r.unread}</span>}
                        </div>
                    ))}
                </>
            );
        }

        // ── Thread view ──
        const effectiveReplies: PhoneReply[] = (phone.pendingReplies && phone.pendingReplies.length)
            ? phone.pendingReplies
            : (phone.pendingChoices || []).map(o => ({ id: o.id, text: o.text, conditions: o.conditions, actions: o.actions as unknown as VNUIAction[] }));
        const threadKey = activeContactId === '__misc__' ? '' : activeContactId;
        const threadMessages = phone.messages.filter(m => phoneThreadKey(m) === threadKey);
        const activeContact = (ui.phoneContacts || []).find(c => c.characterId === activeContactId);
        const activeContactName = activeContact?.displayName || project.characters[activeContactId]?.name
            || (activeContactId === '__misc__' ? (ui.phoneMessagesHeader || 'Messages') : '');
        return (
            <>
                {activeContactId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <button onClick={() => onOpenThread ? onOpenThread(null) : onAction({ type: UIActionType.ShowPhoneContacts } as VNUIAction)} title="Back" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1.1em', lineHeight: 1, padding: '0 4px' }}>‹</button>
                        <span style={{ fontWeight: 600, fontSize: '0.85em' }}>{activeContactName}</span>
                    </div>
                )}
                {threadMessages.map(m => {
                    const mine = m.senderId === 'player';
                    const char = mine ? null : project.characters[m.senderId];
                    const portraitUrls = mine ? [] : resolvePhonePortrait(m.portrait, char, assetResolver);
                    return (
                        <div key={m.id} style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', gap: 6, alignItems: 'flex-end' }}>
                            {ui.phoneShowAvatars !== false && !mine && <PhonePortrait urls={portraitUrls} size={chatAvatarSize} fit={ui.phoneChatAvatarFit} />}
                            <div style={{ maxWidth: '76%' }}>
                                {!mine && char?.name && <div style={{ fontSize: '0.7em', opacity: 0.75, marginBottom: 1, color: char.color }}>{char.name}</div>}
                                {/* Attached photo/video (tap = fullscreen). Text may be empty on photo-only messages. */}
                                {m.image && <PhoneMedia media={m.image} assetResolver={assetResolver} caption={m.text ? interpolateVariables(m.text, variables, project) : undefined} style={{ borderRadius: 14, marginBottom: m.text ? 3 : 0, aspectRatio: '4 / 3' }} />}
                                {m.text && <div style={{ padding: '6px 10px', borderRadius: 14, wordBreak: 'break-word', background: mine ? (ui.phoneOutgoingBubbleColor || '#2f6bff') : (ui.phoneIncomingBubbleColor || '#2a2f3a'), color: ui.phoneBubbleTextColor || '#fff' }}>
                                    {interpolateVariables(m.text, variables, project)}
                                </div>}
                            </div>
                        </div>
                    );
                })}
                {/* "…" typing indicator */}
                {phone.typing && (() => {
                    const tchar = phone.typing.senderId === 'player' ? null : project.characters[phone.typing.senderId];
                    const turls = tchar ? resolvePhonePortrait(undefined, tchar, assetResolver) : [];
                    return (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                            {ui.phoneShowAvatars !== false && <PhonePortrait urls={turls} size={chatAvatarSize} fit={ui.phoneChatAvatarFit} />}
                            <div style={{ padding: '8px 12px', borderRadius: 14, background: ui.phoneIncomingBubbleColor || '#2a2f3a', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                                {[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '9999px', background: ui.phoneTypingColor || ui.phoneBubbleTextColor || '#fff', animation: `vn-phone-typing 1s ${i * 0.2}s infinite` }} />)}
                            </div>
                        </div>
                    );
                })()}
                {/* Reply options (in-phone) */}
                {effectiveReplies.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                        {effectiveReplies.filter(o => !o.conditions?.length || evaluateConditions(o.conditions, variables)).map(o => (
                            <button key={o.id} onClick={() => { playTap(); onReply(o); }} style={{ alignSelf: 'flex-end', maxWidth: '82%', padding: '6px 12px', borderRadius: 14, border: 'none', cursor: 'pointer', ...bodyFont, background: ui.phoneOutgoingBubbleColor || '#2f6bff', color: ui.phoneBubbleTextColor || '#fff' }}>
                                {interpolateVariables(o.text, variables, project)}
                            </button>
                        ))}
                    </div>
                )}
            </>
        );
    },
};

// ── history (recents / call log) — moved verbatim from PhonePanel ──
const HistoryApp: PhoneAppDef = {
    id: 'history', glyph: 'call', defaultLabel: 'Recents',
    render: (ctx) => {
        const { ui, project, phone, assetResolver, variables, playTap, onAction } = ctx;
        const notifs = [...(phone.notifications || [])].reverse();
        return (
            <>
                {/* Notification center: everything that pinged the player, newest first. */}
                {notifs.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
                        <div style={{ fontSize: '0.7em', fontWeight: 700, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notifications</div>
                        {notifs.map(e => {
                            const echar = !e.senderId || e.senderId === 'player' ? null : project.characters[e.senderId];
                            const eurls = resolvePhonePortrait(e.portrait, echar, assetResolver);
                            const eIconImg = e.iconImage ? assetResolver(e.iconImage.id, 'image') : null;
                            const taps = (e.tapActions || []) as VNUIAction[];
                            return (
                                <div key={e.id} onClick={taps.length ? () => { playTap(); taps.forEach(a => onAction(a)); } : undefined}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 10, cursor: taps.length ? 'pointer' : 'default', background: ui.phoneHistoryRowColor || 'rgba(255,255,255,0.05)', color: ui.phoneHistoryTextColor || '#fff', opacity: e.read ? 0.65 : 1 }}>
                                    {eurls.length > 0 ? <PhonePortrait urls={eurls} size="2em" />
                                        : eIconImg ? <img src={eIconImg} alt="" style={{ width: '2em', height: '2em', objectFit: 'contain', flexShrink: 0 }} />
                                        : <span style={{ fontSize: '1.3em', flexShrink: 0 }}>{(e.icon && PHONE_GLYPHS[e.icon]) || '🔔'}</span>}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {(e.title || echar?.name) && <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: e.read ? 400 : 700 }}>{e.title || echar?.name}</div>}
                                        <div style={{ fontSize: '0.7em', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{interpolateVariables(e.text, variables, project)}</div>
                                    </div>
                                    {!e.read && <span style={{ width: 8, height: 8, borderRadius: 9999, background: ui.phoneBadgeColor || '#ef4444', flexShrink: 0 }} />}
                                </div>
                            );
                        })}
                        <div style={{ fontSize: '0.7em', fontWeight: 700, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>Calls</div>
                    </div>
                )}
                {(phone.callLog && phone.callLog.length > 0) ? [...phone.callLog].reverse().map(entry => {
                    const caller = entry.callerId === 'player' ? null : project.characters[entry.callerId];
                    const purls = resolvePhonePortrait(entry.portrait, caller, assetResolver);
                    const icon = entry.status === 'missed' ? '↙' : entry.status === 'accepted' ? '↗' : '⊘';
                    const tint = entry.status === 'missed' ? '#ef4444' : entry.status === 'accepted' ? '#22c55e' : '#9ca3af';
                    return (
                        <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 10, background: ui.phoneHistoryRowColor || 'rgba(255,255,255,0.05)', color: ui.phoneHistoryTextColor || '#fff' }}>
                            <PhonePortrait urls={purls} size="2em" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{caller?.name || 'Unknown'}</div>
                                <div style={{ fontSize: '0.7em', opacity: 0.8, color: tint }}>{entry.direction === 'outgoing' ? '↗' : icon} {entry.status}{entry.durationMs ? ` · ${fmtCallTime(entry.durationMs)}` : ''}</div>
                            </div>
                        </div>
                    );
                }) : <div style={{ opacity: 0.5, textAlign: 'center', marginTop: 12, fontSize: '0.8em' }}>No recent calls</div>}
            </>
        );
    },
};

// ── contacts — in-flow body (the free author-placed region overlay stays at shell level) ──
const ContactsApp: PhoneAppDef = {
    id: 'contacts', glyph: 'contacts', defaultLabel: 'Contacts',
    render: (ctx) => (ctx.ui.phoneContactsRegion ? null : renderContactsRoster(ctx)),
};

// ── call (the live voiced transcript: dialing → lines+replies+timer → ended beat) ──
const fmtCallTime = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

const CallApp: PhoneAppDef = {
    id: 'call', glyph: 'phone', defaultLabel: 'Call',
    render: (ctx) => {
        const { ui, project, phone, variables, assetResolver, evaluateConditions, playTap, onCallReply, onEndCall } = ctx;
        const ac = phone.activeCall;
        if (!ac) return <div style={{ opacity: 0.5, textAlign: 'center', marginTop: 12, fontSize: '0.8em' }}>No active call</div>;
        const char = ac.contactId === 'player' ? null : project.characters[ac.contactId];
        const contact = ac.contactId === 'player' ? undefined : (ui.phoneContacts || []).find(c => c.characterId === ac.contactId);
        const name = contact?.displayName || char?.name || 'Unknown';
        const purls = resolvePhonePortrait(ac.portrait || contact?.avatar, char, assetResolver);
        const bodyFont = ui.phoneFont ? fontSettingsToStyle(ui.phoneFont) : {};
        const endBtn = (label?: string) => (
            <button onClick={() => { playTap(); onEndCall?.(); }}
                style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 9999, border: 'none', cursor: 'pointer', background: ui.phoneCallEndColor || '#ef4444', color: '#fff', fontWeight: 600, ...bodyFont }}>
                {ui.phoneCallEndImage ? <img src={assetResolver(ui.phoneCallEndImage.id, 'image') || undefined} alt="" style={{ width: '1.2em', height: '1.2em', objectFit: 'contain' }} /> : <span>{(ui.phoneCallEndIcon && PHONE_GLYPHS[ui.phoneCallEndIcon]) || '📵'}</span>}
                <span>{label ?? (ui.phoneCallEndLabel || 'End Call')}</span>
            </button>
        );
        const header = (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 6, flexShrink: 0 }}>
                <PhonePortrait urls={purls} size="3.4em" fit={ui.phoneCallPortraitFit} />
                <div style={{ fontWeight: 700, ...(ui.phoneCallNameFont ? fontSettingsToStyle(ui.phoneCallNameFont) : {}) }}>{name}</div>
                {ac.phase === 'dialing' && <div style={{ fontSize: '0.75em', opacity: 0.75 }}>{ui.phoneCallDialingText || 'Calling…'}</div>}
                {ac.phase === 'active' && <div style={{ fontSize: '0.75em', color: ui.phoneCallTimerColor || 'rgba(255,255,255,0.7)' }}>{fmtCallTime(ac.elapsedMs)}</div>}
                {ac.phase === 'ended' && <div style={{ fontSize: '0.75em', opacity: 0.75 }}>Call ended · {fmtCallTime(ac.elapsedMs)}</div>}
            </div>
        );
        if (ac.phase === 'dialing') {
            return <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%', justifyContent: 'center' }}>{header}{endBtn()}</div>;
        }
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: '100%' }}>
                {header}
                {/* Voice-styled transcript bubbles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    {ac.transcript.map(m => {
                        const mine = m.senderId === 'player';
                        return (
                            <div key={m.id} style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row' }}>
                                <div style={{ maxWidth: '80%' }}>
                                    {m.image && <PhoneMedia media={m.image} assetResolver={assetResolver} style={{ borderRadius: 12, marginBottom: m.text ? 3 : 0, aspectRatio: '4 / 3' }} />}
                                    {m.text && <div style={{ padding: '5px 10px', borderRadius: 12, fontStyle: 'italic', wordBreak: 'break-word', background: mine ? (ui.phoneCallLineOutgoingColor || ui.phoneOutgoingBubbleColor || '#2f6bff') : (ui.phoneCallLineIncomingColor || ui.phoneIncomingBubbleColor || '#2a2f3a'), color: ui.phoneBubbleTextColor || '#fff', opacity: 0.94 }}>
                                        {interpolateVariables(m.text, variables, project)}
                                    </div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
                {/* Reply options */}
                {ac.phase === 'active' && (ac.pendingReplies || []).filter(o => !o.conditions?.length || evaluateConditions(o.conditions, variables)).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(ac.pendingReplies || []).filter(o => !o.conditions?.length || evaluateConditions(o.conditions, variables)).map(o => (
                            <button key={o.id} onClick={() => { playTap(); onCallReply?.(o); }} style={{ alignSelf: 'flex-end', maxWidth: '82%', padding: '6px 12px', borderRadius: 14, border: 'none', cursor: 'pointer', ...bodyFont, background: ui.phoneCallLineOutgoingColor || ui.phoneOutgoingBubbleColor || '#2f6bff', color: ui.phoneBubbleTextColor || '#fff' }}>
                                {interpolateVariables(o.text, variables, project)}
                            </button>
                        ))}
                    </div>
                )}
                {ac.phase === 'active' && <div style={{ paddingBottom: 6, display: 'flex', justifyContent: 'center' }}>{endBtn()}</div>}
            </div>
        );
    },
};

// ── gallery (Photos = camera roll from texts · Collection = the project's CG gallery) ──
const GalleryAppBody: React.FC<{ ctx: PhoneAppContext }> = ({ ctx }) => {
    const { ui, project, phone, variables, assetResolver } = ctx;
    const cg = (project as any).cgGallery;
    const cgEntries = cg ? (Object.values(cg.entries || {}) as any[]).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];
    const showCG = (ui.phoneGalleryShowCG ?? true) && cgEntries.length > 0;
    const [tab, setTab] = useState<'photos' | 'cg'>('photos');
    const roll = [...(phone.cameraRoll || [])].reverse(); // newest first
    const cols = Math.max(1, ui.phoneGalleryColumns ?? cg?.columns ?? 3);
    // Same unlock semantics as the menu CG gallery: boolean unlock variable truthy.
    const isUnlocked = (entry: any) => {
        if (!entry.unlockable) return true;
        if (!entry.unlockVariableId) return true;
        const val = variables[entry.unlockVariableId];
        return val === true || (val as any) === 'true' || (val as any) === 1;
    };
    const lockedUrl = cg?.lockedPlaceholderAssetId ? assetResolver(cg.lockedPlaceholderAssetId, 'image') : null;
    const tabBtn = (id: 'photos' | 'cg', label: string) => (
        <button onClick={() => { ctx.playTap(); setTab(id); }} style={{ flex: 1, padding: '4px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.75em', background: tab === id ? (ui.phoneButtonActiveColor || ui.phoneOutgoingBubbleColor || '#2f6bff') : 'rgba(255,255,255,0.08)', color: '#fff' }}>{label}</button>
    );
    const grid = (children: React.ReactNode) => (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>{children}</div>
    );
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {showCG && <div style={{ display: 'flex', gap: 6 }}>{tabBtn('photos', ui.phoneGalleryPhotosLabel || 'Photos')}{tabBtn('cg', ui.phoneGalleryCGLabel || 'Collection')}</div>}
            {tab === 'photos' || !showCG ? (
                roll.length === 0
                    ? <div style={{ opacity: 0.5, textAlign: 'center', marginTop: 12, fontSize: '0.8em' }}>{ui.phoneGalleryEmptyText || 'No photos yet'}</div>
                    : grid(roll.map(e => (
                        <PhoneMedia key={e.id} media={e.image} assetResolver={assetResolver}
                            caption={e.caption ? interpolateVariables(e.caption, variables, project) : undefined}
                            style={{ borderRadius: 8, aspectRatio: '1' }} />
                    )))
            ) : (
                grid(cgEntries.map((entry: any) => {
                    const unlocked = isUnlocked(entry);
                    if (!unlocked) {
                        return (
                            <div key={entry.id} style={{ borderRadius: 8, aspectRatio: '1', overflow: 'hidden', background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {lockedUrl ? <img src={lockedUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ opacity: 0.5 }}>🔒</span>}
                            </div>
                        );
                    }
                    return <PhoneMedia key={entry.id} media={{ type: 'image', id: entry.assetId as VNID }} assetResolver={assetResolver} caption={entry.name} style={{ borderRadius: 8, aspectRatio: '1' }} />;
                }))
            )}
        </div>
    );
};

const GalleryApp: PhoneAppDef = {
    id: 'gallery', glyph: 'gallery', defaultLabel: 'Gallery',
    render: (ctx) => <GalleryAppBody ctx={ctx} />,
};

// ── map surface (shared by the phone Map app AND the Show Map fullscreen overlay) ──
/** The touchable map: backdrop + location markers. Tapping an unlocked location (with an inline
 *  confirm when the map asks for one) fires `onLocationTap`. Locked looks: hidden/dimmed/lockIcon. */
export const MapSurface: React.FC<{
    map: VNMapConfig;
    project: VNProject;
    variables: Record<VNID, string | number | boolean>;
    assetResolver: (id: VNID | null, type: 'audio' | 'video' | 'image') => string | null;
    evaluateConditions: (c: VNCondition[] | undefined, v: Record<VNID, string | number | boolean>) => boolean;
    onLocationTap: (loc: VNMapLocation) => void;
    /** Free-roam gate: when false, taps show `lockedText` instead of traveling (browsing only). */
    travelAllowed?: boolean;
    lockedText?: string;
}> = ({ map, project, variables, assetResolver, evaluateConditions, onLocationTap, travelAllowed = true, lockedText }) => {
    const [confirmId, setConfirmId] = useState<VNID | null>(null);
    const [gateMsg, setGateMsg] = useState(false);

    // ── zoom & pan (shared by the phone Map app and the Show Map overlay) ──
    // On by default; authors can turn it off per-map (allowZoom:false) for a fixed map.
    const zoomEnabled = map.allowZoom !== false;
    const maxZoom = Math.max(1.2, Math.min(8, map.maxZoom ?? 3));
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [view, setView] = useState({ s: 1, tx: 0, ty: 0 });
    const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
    const dragRef = useRef<{ lastX: number; lastY: number; pinchDist: number } | null>(null);
    const movedRef = useRef(false); // a drag/pinch just happened → swallow the marker tap that follows
    const rect = () => containerRef.current?.getBoundingClientRect();
    // Keep the content covering the frame: at scale 1 it's locked to (0,0); zoomed in, pan is clamped
    // so you can never drag the map off its own edges.
    const clampView = useCallback((v: { s: number; tx: number; ty: number }) => {
        const r = rect();
        const W = r?.width ?? 0, H = r?.height ?? 0;
        const s = Math.max(1, Math.min(maxZoom, v.s));
        if (s <= 1.0001) return { s: 1, tx: 0, ty: 0 };
        return { s, tx: Math.min(0, Math.max(W * (1 - s), v.tx)), ty: Math.min(0, Math.max(H * (1 - s), v.ty)) };
    }, [maxZoom]);
    // Zoom toward a focal point given in container-local px (transform-origin is the top-left).
    const zoomTo = useCallback((nextS: number, fx: number, fy: number) => {
        setView(prev => {
            const s2 = Math.max(1, Math.min(maxZoom, nextS));
            const cx = (fx - prev.tx) / prev.s, cy = (fy - prev.ty) / prev.s;
            return clampView({ s: s2, tx: fx - cx * s2, ty: fy - cy * s2 });
        });
    }, [maxZoom, clampView]);
    const bump = (factor: number) => { const r = rect(); if (r) zoomTo(view.s * factor, r.width / 2, r.height / 2); };
    const resetView = () => setView({ s: 1, tx: 0, ty: 0 });

    const onWheel = (e: React.WheelEvent) => {
        if (!zoomEnabled) return;
        const r = rect(); if (!r) return;
        zoomTo(view.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top);
    };
    const onPointerDown = (e: React.PointerEvent) => {
        if (!zoomEnabled) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        movedRef.current = false;
        if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            dragRef.current = { lastX: 0, lastY: 0, pinchDist: Math.hypot(a.x - b.x, a.y - b.y) };
        } else {
            dragRef.current = { lastX: e.clientX, lastY: e.clientY, pinchDist: 0 };
        }
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!zoomEnabled || !pointers.current.has(e.pointerId) || !dragRef.current) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const r = rect(); if (!r) return;
        if (pointers.current.size >= 2) {
            const [a, b] = [...pointers.current.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (dragRef.current.pinchDist > 0) zoomTo(view.s * (dist / dragRef.current.pinchDist), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
            dragRef.current.pinchDist = dist;
            movedRef.current = true;
        } else if (view.s > 1) {
            const dx = e.clientX - dragRef.current.lastX, dy = e.clientY - dragRef.current.lastY;
            if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
            dragRef.current.lastX = e.clientX; dragRef.current.lastY = e.clientY;
            setView(prev => clampView({ s: prev.s, tx: prev.tx + dx, ty: prev.ty + dy }));
        }
    };
    const onPointerUp = (e: React.PointerEvent) => {
        pointers.current.delete(e.pointerId);
        const rest = [...pointers.current.values()];
        dragRef.current = rest.length === 1 ? { lastX: rest[0].x, lastY: rest[0].y, pinchDist: 0 } : null;
        // let a genuine tap through on the next click; a drag keeps movedRef until then
        if (rest.length === 0) window.setTimeout(() => { movedRef.current = false; }, 0);
    };
    const zoomBtnStyle: React.CSSProperties = {
        width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: 'rgba(12,14,20,0.72)', color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)',
    };

    const bg = map.backgroundImage ? assetResolver(map.backgroundImage.id, map.backgroundImage.type === 'video' ? 'video' : 'image') : null;
    const markerSize = Math.max(2, map.markerSize ?? 6); // % of map width
    const tap = (loc: VNMapLocation) => {
        if (!travelAllowed) { setGateMsg(true); window.setTimeout(() => setGateMsg(false), 2200); return; }
        if (map.confirmTravel && confirmId !== loc.id) { setConfirmId(loc.id); return; }
        setConfirmId(null);
        onLocationTap(loc);
    };
    return (
        <div ref={containerRef}
            onWheel={zoomEnabled ? onWheel : undefined}
            onPointerDown={zoomEnabled ? onPointerDown : undefined}
            onPointerMove={zoomEnabled ? onPointerMove : undefined}
            onPointerUp={zoomEnabled ? onPointerUp : undefined}
            onPointerCancel={zoomEnabled ? onPointerUp : undefined}
            onDoubleClick={zoomEnabled ? () => (view.s > 1 ? resetView() : bump(1.8)) : undefined}
            style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0b0d12', touchAction: zoomEnabled ? 'none' : undefined, cursor: zoomEnabled && view.s > 1 ? 'grab' : undefined }}>
          <div style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, willChange: view.s > 1 ? 'transform' : undefined }}>
            {bg && (map.backgroundImage!.type === 'video'
                ? <video src={bg} autoPlay loop muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : <img src={bg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />)}
            {map.locations.map(loc => {
                const unlocked = !loc.conditions?.length || evaluateConditions(loc.conditions, variables);
                const lockedLook = loc.lockedAppearance || 'hidden';
                if (!unlocked && lockedLook === 'hidden') return null;
                const style = loc.markerStyle || 'icon';
                const markerUrl = style === 'image' && loc.markerImage ? assetResolver(loc.markerImage.id, 'image') : null;
                const displayLabel = unlocked ? interpolateVariables(loc.label || loc.name, variables, project) : (loc.lockedLabel || '???');
                const clickable = unlocked;
                const dim = !unlocked;
                const isRegion = style === 'region';
                const w = isRegion ? (loc.width ?? 12) : markerSize;
                const h = isRegion ? (loc.height ?? 12) : undefined;
                // Label: per-location font over the map default; optional image label (unlocked only); hideable.
                const locFont = loc.labelFont || map.labelFont;
                const labelStyle = locFont ? fontSettingsToStyle(locFont) : {};
                const labelImg = unlocked && loc.labelImage ? assetResolver(loc.labelImage.id, 'image') : null;
                const showLabel = loc.showLabel !== false;
                return (
                    <div key={loc.id}
                        onClick={clickable ? (e) => { e.stopPropagation(); if (movedRef.current) return; tap(loc); } : undefined}
                        title={displayLabel}
                        style={{
                            position: 'absolute', left: `${loc.x}%`, top: `${loc.y}%`,
                            width: `${w}%`, ...(isRegion ? { height: `${h}%` } : { aspectRatio: '1' }),
                            transform: isRegion ? undefined : 'translate(-50%, -50%)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            cursor: clickable ? 'pointer' : 'default',
                            opacity: dim ? 0.45 : 1,
                            containerType: 'size',
                        } as React.CSSProperties}>
                        {!isRegion && (
                            !unlocked && lockedLook === 'lockedIcon'
                                ? <span style={{ fontSize: '62cqmin', lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>🔒</span>
                                : markerUrl
                                    ? <img src={markerUrl} alt="" style={{ width: '92cqmin', height: '92cqmin', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))' }} />
                                    : <span style={{ fontSize: '70cqmin', lineHeight: 1, color: map.markerColor || '#ef4444', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>{(loc.builtinIcon && PHONE_GLYPHS[loc.builtinIcon]) || '📍'}</span>
                        )}
                        {showLabel && (labelImg
                            ? <img src={labelImg} alt="" style={{ position: 'absolute', top: '100%', marginTop: 2, height: 24, maxWidth: 140, objectFit: 'contain', pointerEvents: 'none', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))' }} />
                            : <span style={{ position: 'absolute', top: '100%', marginTop: 2, whiteSpace: 'nowrap', fontSize: 11, fontWeight: 600, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.9)', ...labelStyle }}>{displayLabel}</span>)}
                        {/* Inline travel confirm */}
                        {confirmId === loc.id && (
                            <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)', background: 'rgba(10,12,18,0.95)', borderRadius: 10, padding: '6px 10px', display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap', zIndex: 5, boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}>
                                <span style={{ color: '#fff', fontSize: 12 }}>{(map.confirmText || 'Travel to {name}?').replace('{name}', displayLabel)}</span>
                                <button onClick={() => { setConfirmId(null); onLocationTap(loc); }} style={{ border: 'none', borderRadius: 8, padding: '3px 10px', cursor: 'pointer', background: '#22c55e', color: '#fff', fontWeight: 700 }}>✓</button>
                                <button onClick={() => setConfirmId(null)} style={{ border: 'none', borderRadius: 8, padding: '3px 10px', cursor: 'pointer', background: 'rgba(255,255,255,0.15)', color: '#fff' }}>✕</button>
                            </div>
                        )}
                    </div>
                );
            })}
          </div>
            {/* Zoom controls — outside the scaling layer so they keep a constant size */}
            {zoomEnabled && (
                <div style={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 6 }}
                    onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                    <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => bump(1.4)} style={zoomBtnStyle}>+</button>
                    <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => bump(1 / 1.4)} style={zoomBtnStyle}>−</button>
                    {view.s > 1.0001 && <button type="button" aria-label="Reset zoom" title="Reset zoom" onClick={resetView} style={{ ...zoomBtnStyle, fontSize: 15 }}>⤢</button>}
                </div>
            )}
            {/* Free-roam gate message */}
            {gateMsg && (
                <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(10,12,18,0.92)', color: '#fff', borderRadius: 10, padding: '6px 14px', fontSize: 12, whiteSpace: 'nowrap', animation: 'fade-in 0.2s ease-out' }}>
                    {lockedText || "You can't leave right now."}
                </div>
            )}
        </div>
    );
};

// ── map app (free-roam travel from the phone; gated by phoneMapTravelConditions) ──
const MapApp: PhoneAppDef = {
    id: 'map', glyph: 'map', defaultLabel: 'Map',
    isEnabled: (ui, project) => !!ui.phoneMapId && !!(project.maps || {})[ui.phoneMapId],
    render: (ctx) => {
        const { ui, project, variables, assetResolver, evaluateConditions, onAction, playTap } = ctx;
        const map = ui.phoneMapId ? (project.maps || {})[ui.phoneMapId] : null;
        if (!map) return null;
        const travelAllowed = !ui.phoneMapTravelConditions?.length || evaluateConditions(ui.phoneMapTravelConditions, variables);
        return (
            <div style={{ margin: '-8px -10px', height: 'calc(100% + 16px)' }}>
                <MapSurface map={map} project={project} variables={variables} assetResolver={assetResolver} evaluateConditions={evaluateConditions}
                    travelAllowed={travelAllowed} lockedText={ui.phoneMapTravelLockedText}
                    onLocationTap={(loc) => {
                        playTap();
                        // Close the phone, run the location's extra actions, then travel last.
                        onAction({ type: UIActionType.HidePhone } as VNUIAction);
                        (loc.actions || []).forEach((a: any) => onAction(a));
                        if (loc.targetSceneId) onAction({ type: UIActionType.JumpToScene, targetSceneId: loc.targetSceneId } as VNUIAction);
                    }} />
            </div>
        );
    },
};

// ── settings (player wallpaper picker; enabled when the author provides wallpapers) ──
const SettingsApp: PhoneAppDef = {
    id: 'settings', glyph: 'settings', defaultLabel: 'Settings',
    isEnabled: (ui) => !!(ui.phoneWallpapers && ui.phoneWallpapers.length > 0),
    render: (ctx) => {
        const { ui, phone, variables, assetResolver, evaluateConditions, playTap, onSetWallpaper } = ctx;
        const options = (ui.phoneWallpapers || []).filter(w => !w.conditions?.length || evaluateConditions(w.conditions, variables));
        const current = phone.wallpaperId || null;
        const tile = (key: string, selected: boolean, onClick: () => void, inner: React.ReactNode, label?: string) => (
            <button key={key} onClick={() => { playTap(); onClick(); }}
                style={{ position: 'relative', aspectRatio: '9 / 16', borderRadius: 10, overflow: 'hidden', border: 'none', padding: 0, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', boxShadow: selected ? `0 0 0 3px ${ui.phoneButtonActiveColor || '#2f6bff'}` : 'inset 0 0 0 1px rgba(255,255,255,0.12)' }}>
                {inner}
                {label && <span style={{ position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>{label}</span>}
                {selected && <span style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9999, background: ui.phoneButtonActiveColor || '#2f6bff', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
            </button>
        );
        const defaultBg = ui.phoneWallpaperImage ? assetResolver(ui.phoneWallpaperImage.id, ui.phoneWallpaperImage.type === 'video' ? 'video' : 'image') : null;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: '0.75em', fontWeight: 700, opacity: 0.8 }}>{ui.phoneSettingsWallpaperLabel || 'Wallpaper'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {tile('__default__', !current, () => onSetWallpaper?.(null),
                        defaultBg ? (ui.phoneWallpaperImage!.type === 'video' ? <video src={defaultBg} muted loop playsInline autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={defaultBg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />) : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 18 }}>—</span>,
                        'Default')}
                    {options.map(w => {
                        const url = assetResolver((w.thumbnail || w.image).id, w.thumbnail ? 'image' : (w.image.type === 'video' ? 'video' : 'image'));
                        const isVid = !w.thumbnail && w.image.type === 'video';
                        return tile(w.id, current === w.id, () => onSetWallpaper?.(w.id),
                            url ? (isVid ? <video src={url} muted loop playsInline autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />) : null,
                            w.name);
                    })}
                </div>
            </div>
        );
    },
};

export const PHONE_APPS: Record<PhoneAppId, PhoneAppDef> = {
    home: HomeApp,
    chat: ChatApp,
    history: HistoryApp,
    contacts: ContactsApp,
    gallery: GalleryApp,
    map: MapApp,
    settings: SettingsApp,
    call: CallApp,
};

/** The app the phone should actually render for a saved/requested view id. */
export function resolvePhoneApp(view: string | undefined, ui: VNProjectUI, project: VNProject): PhoneAppDef {
    const app = view ? (PHONE_APPS as Record<string, PhoneAppDef>)[view] : undefined;
    if (app && (!app.isEnabled || app.isEnabled(ui, project))) return app;
    return PHONE_APPS.home;
}

/** Apps an author can point a button at (for editor dropdowns) — home is implicit, call is
 *  runtime-only. Disabled apps are listed so authors can pre-wire buttons; they no-op to home
 *  until their feature is configured/shipped. */
export const PHONE_APP_CHOICES: Array<{ id: PhoneAppId; glyph: string; label: string }> =
    (['chat', 'contacts', 'history', 'gallery', 'map', 'settings'] as PhoneAppId[])
        .map(id => ({ id, glyph: PHONE_APPS[id].glyph, label: PHONE_APPS[id].defaultLabel }));
