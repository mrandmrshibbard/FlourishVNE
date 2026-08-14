/**
 * ConversationStudio — a full-screen, chat-style WYSIWYG editor for phone conversations
 * (voiced call transcripts AND scripted text conversations).
 *
 * The center pane renders the conversation as REAL chat bubbles — click a bubble or a reply
 * pill to edit it in the side panel, use the "+" inserters to add lines anywhere. In LIST mode
 * (a contact's gated conversation list) the left column manages the entries (name, conditions,
 * play-once, order — first passing entry wins at runtime).
 *
 * State routing: the HOST owns the data (command inspectors pass updateCommand-backed closures,
 * the In-Game UI contact card passes its update() → UPDATE_UI_CONFIG). The studio holds only
 * SELECTION state and writes every edit straight through onChange* — so edits round-trip live
 * and undo/redo rides the project history like any other edit.
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { PhoneCallConversation, PhoneCallLine, PhoneConversationEntry, PhoneReply } from '../features/scene/types';
import { FormField, Select, TextInput, TextArea } from './ui/Form';
import AssetSelector from './ui/AssetSelector';
import ConditionsEditor from './ui/ConditionsEditor';
import UIActionsListEditor from './ui/UIActionsListEditor';
import CollapsibleSection from './ui/CollapsibleSection';
import { PhonePortraitPicker, PhoneFollowUpsEditor, phoneSenderOptions, phoneMediaRef } from './inspector/CommandGroupFields';
import { XMarkIcon, PlusIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon, SparklesIcon } from './icons';

const gid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

type StudioSelection = { kind: 'line'; li: number } | { kind: 'reply'; li: number; ri: number } | { kind: 'settings' } | null;

export interface ConversationStudioProps {
    isOpen: boolean;
    onClose: () => void;
    project: VNProject;
    /** 'call' = voiced transcript (voice clip + ends-call surfaces); 'text' = chat thread (photos). */
    kind: 'call' | 'text';
    title?: string;
    /** SINGLE mode — edit one conversation (command inspectors). */
    conversation?: PhoneCallConversation;
    onChangeConversation?: (c: PhoneCallConversation) => void;
    /** LIST mode — edit a contact's gated conversation list. */
    entries?: PhoneConversationEntry[];
    onChangeEntries?: (e: PhoneConversationEntry[]) => void;
}

const ConversationStudio: React.FC<ConversationStudioProps> = (props) => {
    const { isOpen, onClose, project, kind } = props;
    const { t } = useTranslation('ui');
    const listMode = !!props.onChangeEntries;
    const entries = props.entries || [];
    const [selectedEntryId, setSelectedEntryId] = useState<VNID | null>((entries[0]?.id as VNID) ?? null);
    const [sel, setSel] = useState<StudioSelection>(null);
    if (!isOpen) return null;

    const entry = listMode ? (entries.find(e => e.id === selectedEntryId) || entries[0]) : undefined;
    const conv: PhoneCallConversation = (listMode ? entry?.conversation : props.conversation) || { lines: [] };
    const lines: PhoneCallLine[] = conv.lines || [];

    const setEntries = (next: PhoneConversationEntry[]) => props.onChangeEntries!(next);
    const setEntry = (patch: Partial<PhoneConversationEntry>) => { if (entry) setEntries(entries.map(e => e.id === entry.id ? { ...e, ...patch } : e)); };
    const setConv = (patch: Partial<PhoneCallConversation>) => {
        const next = { ...conv, ...patch };
        if (listMode) { if (entry) setEntries(entries.map(e => e.id === entry.id ? { ...e, conversation: next } : e)); }
        else props.onChangeConversation!(next);
    };
    const setLines = (l: PhoneCallLine[]) => setConv({ lines: l });
    const updateLine = (i: number, patch: any) => setLines(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
    const insertLine = (at: number) => {
        const nl: PhoneCallLine = { id: gid('cl') as VNID, speakerId: (Object.keys(project.characters)[0] || 'player') as any, text: '', delayMs: 900 };
        const next = [...lines]; next.splice(at, 0, nl); setLines(next);
        setSel({ kind: 'line', li: at });
    };
    const removeLine = (i: number) => { setLines(lines.filter((_, idx) => idx !== i)); setSel(null); };
    const moveLine = (i: number, dir: -1 | 1) => {
        const j = i + dir; if (j < 0 || j >= lines.length) return;
        const next = [...lines]; [next[i], next[j]] = [next[j], next[i]]; setLines(next);
        setSel({ kind: 'line', li: j });
    };
    const addEntry = () => {
        const e: PhoneConversationEntry = { id: gid('pcv') as VNID, conversation: { lines: [] } };
        setEntries([...entries, e]); setSelectedEntryId(e.id as VNID); setSel({ kind: 'settings' });
    };
    const moveEntry = (i: number, dir: -1 | 1) => {
        const j = i + dir; if (j < 0 || j >= entries.length) return;
        const next = [...entries]; [next[i], next[j]] = [next[j], next[i]]; setEntries(next);
    };
    const removeEntry = (i: number) => {
        const removed = entries[i];
        const next = entries.filter((_, idx) => idx !== i);
        setEntries(next);
        if (removed?.id === selectedEntryId) { setSelectedEntryId((next[0]?.id as VNID) ?? null); setSel(null); }
    };

    const selLine = sel && sel.kind !== 'settings' ? lines[sel.li] : null;
    const selReply: PhoneReply | null = sel?.kind === 'reply' && selLine ? ((selLine.replies || [])[sel.ri] || null) : null;
    const updateSelReply = (patch: any) => {
        if (sel?.kind !== 'reply' || !selLine) return;
        updateLine(sel.li, { replies: (selLine.replies || []).map((r, idx) => idx === sel.ri ? { ...r, ...patch } : r) });
    };
    /** Add a reply (a player CHOICE — pauses the conversation, runs actions) to a line and jump
     *  straight into editing it. */
    const addReplyToLine = (li: number) => {
        const line = lines[li]; if (!line) return;
        const replies = [...(line.replies || []), { id: gid('pr') as VNID, text: 'Reply', followUps: [], actions: [] } as PhoneReply];
        updateLine(li, { replies });
        setSel({ kind: 'reply', li, ri: replies.length - 1 });
    };

    const speakerName = (id: VNID | 'player') => id === 'player' ? t('phoneCmd.player', 'Player (you)') : ((project.characters as any)[id]?.name || '?');
    const inColor = project.ui.phoneIncomingBubbleColor || '#2a2f3a';
    const outColor = project.ui.phoneOutgoingBubbleColor || '#2f6bff';
    const bubbleText = project.ui.phoneBubbleTextColor || '#fff';
    const imgName = (ref?: { id: VNID } | null) => ref ? (((project.images as any)?.[ref.id]?.name) || ((project.videos as any)?.[ref.id]?.name) || ((project.backgrounds as any)?.[ref.id]?.name) || 'photo') : '';

    // A slim hover-reveal inserter BETWEEN bubbles — its own row (no negative margins/z-index),
    // so it never overlaps or steals clicks from the bubbles around it.
    const InsertRow: React.FC<{ at: number }> = ({ at }) => (
        <div className="group h-3 flex items-center justify-center">
            <button onClick={() => insertLine(at)} title={t('convoStudio.insertLine', 'Insert a line here')}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full bg-slate-700 hover:bg-purple-600 text-slate-300 hover:text-white leading-none">
                <PlusIcon className="w-3 h-3" />
            </button>
        </div>
    );

    const backdrop = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); };

    return createPortal(
        // z-[10000]: the editor canvases layer content up to z-100+ (per-layer z-order), so a
        // z-50 overlay gets punched through by the phone preview behind it.
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onMouseDown={backdrop}>
            <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl shadow-2xl w-[94vw] h-[88vh] m-4 border border-slate-700 flex flex-col overflow-hidden">
                {/* ── Header ── */}
                <div className="flex items-center justify-between p-3 border-b border-slate-700 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg"><SparklesIcon className="w-5 h-5 text-purple-400" /></div>
                        <div>
                            <h2 className="text-base font-semibold text-white">{props.title || t('convoStudio.title', 'Conversation Studio')}</h2>
                            <p className="text-xs text-slate-400">{kind === 'call'
                                ? t('convoStudio.subCall', 'A scripted phone call — click a bubble to edit; replies pause for the player.')
                                : t('convoStudio.subText', 'A scripted text conversation — click a bubble to edit; replies pause for the player.')}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg"><XMarkIcon className="w-5 h-5 text-slate-400" /></button>
                </div>

                <div className="flex-1 min-h-0 flex">
                    {/* ── Entries column (list mode) ── */}
                    {listMode && (
                        <div className="w-56 flex-shrink-0 border-r border-slate-700 flex flex-col">
                            <div className="px-3 py-2 text-[10px] text-slate-400 border-b border-slate-700/60">{t('convoStudio.entriesHint', 'The FIRST conversation whose conditions pass plays. Drag order = priority.')}</div>
                            <div className="p-2 space-y-1 overflow-y-auto flex-1">
                                {entries.map((e, i) => (
                                    <div key={e.id} className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer ${entry?.id === e.id ? 'bg-purple-500/20 border border-purple-500/50' : 'hover:bg-slate-800 border border-transparent'}`}
                                        onClick={() => { setSelectedEntryId(e.id as VNID); setSel({ kind: 'settings' }); }}>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-white truncate">💬 {e.name || `${t('convoStudio.conversation', 'Conversation')} ${i + 1}`}</div>
                                            <div className="text-[10px] text-slate-400">{(e.conversation?.lines?.length || 0)} {t('convoStudio.lines', 'lines')}{e.once ? ' · once' : ''}{e.conditions?.length ? ' · ⚑' : ''}</div>
                                        </div>
                                        <div className="flex flex-col opacity-0 group-hover:opacity-100">
                                            <button onClick={ev => { ev.stopPropagation(); moveEntry(i, -1); }} disabled={i === 0} className="p-0 text-slate-400 hover:text-white disabled:opacity-30"><ChevronUpIcon className="w-3 h-3" /></button>
                                            <button onClick={ev => { ev.stopPropagation(); moveEntry(i, 1); }} disabled={i === entries.length - 1} className="p-0 text-slate-400 hover:text-white disabled:opacity-30"><ChevronDownIcon className="w-3 h-3" /></button>
                                        </div>
                                        <button onClick={ev => { ev.stopPropagation(); removeEntry(i); }} className="p-0.5 text-red-400 opacity-0 group-hover:opacity-100" title={t('convoStudio.deleteEntry', 'Delete conversation')}><TrashIcon className="w-3.5 h-3.5" /></button>
                                    </div>
                                ))}
                            </div>
                            <div className="p-2 border-t border-slate-700">
                                <button onClick={addEntry} className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30">
                                    <PlusIcon className="w-3.5 h-3.5" /> {t('convoStudio.addEntry', 'Add conversation')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Chat preview (click to edit) ── */}
                    <div className="flex-1 min-w-0 flex flex-col bg-slate-900/60">
                        {listMode && !entry ? (
                            <div className="flex-1 flex items-center justify-center">
                                <button onClick={addEntry} className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30">
                                    <PlusIcon className="w-4 h-4" /> {t('convoStudio.addFirst', 'Add the first conversation')}
                                </button>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto px-6 py-4">
                                <div className="max-w-md mx-auto flex flex-col gap-2">
                                    {lines.map((line, i) => {
                                        const mine = line.speakerId === 'player';
                                        const isSelLine = sel && sel.kind === 'line' && sel.li === i;
                                        return (
                                            <React.Fragment key={line.id || i}>
                                                <InsertRow at={i} />
                                                <div className={`flex ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
                                                    <div style={{ maxWidth: '78%' }}>
                                                        {!mine && <div className="text-[10px] text-slate-400 mb-0.5">{speakerName(line.speakerId)}</div>}
                                                        <div onClick={() => setSel({ kind: 'line', li: i })}
                                                            className={`cursor-pointer rounded-2xl px-3 py-1.5 text-sm break-words border-2 ${isSelLine ? 'border-purple-400' : 'border-transparent hover:border-purple-500/40'}`}
                                                            style={{ background: mine ? outColor : inColor, color: bubbleText }}>
                                                            {line.image && <div className="text-[10px] opacity-80 mb-0.5">📷 {imgName(line.image)}</div>}
                                                            {line.text || <span className="opacity-50 italic">{t('convoStudio.emptyLine', '(empty line — click to write)')}</span>}
                                                        </div>
                                                        {(line.voiceAudioId || line.conditions?.length || line.soundId) && (
                                                            <div className="text-[10px] text-slate-400 mt-0.5 flex gap-1.5">
                                                                {line.voiceAudioId && <span title={t('convoStudio.voiced', 'Voiced')}>🎙</span>}
                                                                {!!line.conditions?.length && <span title={t('convoStudio.conditional', 'Only plays under conditions')}>⚑ {line.conditions.length}</span>}
                                                                {line.soundId && <span title={t('convoStudio.sound', 'Plays a sound')}>♪</span>}
                                                            </div>
                                                        )}
                                                        {/* Reply pills (pause the conversation for a tap) */}
                                                        {!!line.replies?.length && (
                                                            <div className="flex flex-col items-end gap-1 mt-1.5">
                                                                {line.replies.map((r, ri) => {
                                                                    const isSelReply = sel && sel.kind === 'reply' && sel.li === i && sel.ri === ri;
                                                                    return (
                                                                        <button key={r.id} onClick={() => setSel({ kind: 'reply', li: i, ri })}
                                                                            className={`rounded-full px-3 py-1 text-xs border-2 ${isSelReply ? 'border-purple-400' : 'border-transparent hover:border-purple-500/40'}`}
                                                                            style={{ background: outColor, color: bubbleText, opacity: 0.9 }}>
                                                                            ↩ {r.text || '(empty reply)'}{r.endsCall ? ' · 📵' : ''}{r.conditions?.length ? ' · ⚑' : ''}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                        <div className={`mt-1 flex gap-1 ${mine ? 'justify-start' : 'justify-end'}`}>
                                                            <button onClick={() => addReplyToLine(i)}
                                                                className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-purple-500/60"
                                                                title={t('convoStudio.addReplyTip', 'Add a player reply under this line — a choice that pauses the conversation and can run actions')}>
                                                                + {t('convoStudio.reply', 'Reply choice')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </React.Fragment>
                                        );
                                    })}
                                    <button onClick={() => insertLine(lines.length)}
                                        className="mt-1 w-full flex items-center justify-center gap-1 px-2 py-2 text-xs rounded-lg border border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-purple-500/60">
                                        <PlusIcon className="w-3.5 h-3.5" /> {t('convoStudio.addLine', 'Add line')}
                                    </button>
                                    {lines.length > 0 && (
                                        <button onClick={() => setSel({ kind: 'settings' })}
                                            className={`self-center text-[10px] px-2 py-1 rounded-full border ${sel?.kind === 'settings' ? 'border-purple-400 text-purple-300' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                                            {kind === 'call'
                                                ? (conv.autoEnd !== false ? t('convoStudio.endAuto', '— call ends here —') : t('convoStudio.endManual', '— stays until the player hangs up —'))
                                                : t('convoStudio.endText', '— conversation ends here —')}
                                            {(conv.endActions || []).length > 0 && ` · ${(conv.endActions || []).length} ${t('convoStudio.actions', 'actions')}`}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Side panel: the selected thing's fields ── */}
                    <div className="w-80 flex-shrink-0 border-l border-slate-700 overflow-y-auto p-3 space-y-2">
                        {sel?.kind === 'reply' && selLine && selReply ? (<>
                            <button onClick={() => setSel({ kind: 'line', li: sel.li })} className="text-[10px] text-slate-400 hover:text-white">‹ {t('convoStudio.backToLine', 'Back to the line')}</button>
                            <h3 className="text-sm font-semibold text-white">{t('convoStudio.replyTitle', 'Player reply')}</h3>
                            <FormField label={t('convoStudio.replyText', 'Reply text')}>
                                <TextInput value={selReply.text} onChange={(e: any) => updateSelReply({ text: e.target.value })} />
                            </FormField>
                            {kind === 'call' && (
                                <label className="flex items-center gap-1 text-xs text-slate-300">
                                    <input type="checkbox" checked={!!selReply.endsCall} onChange={e => updateSelReply({ endsCall: e.target.checked || undefined })} className="w-4 h-4" />
                                    {t('phoneCmd.replyEndsCall', 'Hang up after this reply')}
                                </label>
                            )}
                            <PhoneFollowUpsEditor followUps={selReply.followUps || []} onChange={fu => updateSelReply({ followUps: fu })} project={project} t={t} showVoice={kind === 'call'} />
                            <UIActionsListEditor actions={selReply.actions || []} project={project} onChange={(acts: any) => updateSelReply({ actions: acts })} label={t('phoneCmd.replyActions', 'Reply actions')} />
                            <ConditionsEditor collapsible title={t('phoneCmd.replyConditions', 'Only offer this reply when…')} conditions={selReply.conditions || []} project={project} onChange={(cs: any) => updateSelReply({ conditions: cs })} />
                            <button onClick={() => { updateLine(sel.li, { replies: (selLine.replies || []).filter((_, idx) => idx !== sel.ri) }); setSel({ kind: 'line', li: sel.li }); }}
                                className="w-full mt-2 px-2 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20">{t('convoStudio.deleteReply', 'Delete this reply')}</button>
                        </>) : sel?.kind === 'line' && selLine ? (<>
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-white">{t('convoStudio.lineTitle', 'Line')} {sel.li + 1}</h3>
                                <div className="flex items-center gap-0.5">
                                    <button onClick={() => moveLine(sel.li, -1)} disabled={sel.li === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30" title={t('phoneCmd.moveUp', 'Move up')}><ChevronUpIcon className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => moveLine(sel.li, 1)} disabled={sel.li === lines.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30" title={t('phoneCmd.moveDown', 'Move down')}><ChevronDownIcon className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => removeLine(sel.li)} className="p-1 text-red-400 hover:text-red-300" title={t('phoneCmd.removeLine', 'Remove line')}><TrashIcon className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>
                            <FormField label={t('convoStudio.speaker', 'Speaker')}>
                                <Select value={selLine.speakerId} onChange={(e: any) => updateLine(sel.li, { speakerId: e.target.value })}>
                                    {phoneSenderOptions(project, t).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </Select>
                            </FormField>
                            <FormField label={t('convoStudio.lineText', 'Text')}>
                                <TextArea rows={3} value={selLine.text} onChange={(e: any) => updateLine(sel.li, { text: e.target.value })} />
                            </FormField>
                            {kind === 'call' && (<>
                                <AssetSelector label={t('phoneCmd.voiceClip', 'Voice clip')} assetType="audio" value={selLine.voiceAudioId || null} onChange={(id: any) => updateLine(sel.li, { voiceAudioId: id })} />
                                <label className="flex items-center gap-1 text-xs text-slate-300" title={t('phoneCmd.waitForVoiceTip', 'The next line waits until this voice clip finishes (instead of the timed beat).')}>
                                    <input type="checkbox" checked={!!selLine.waitForVoice} onChange={e => updateLine(sel.li, { waitForVoice: e.target.checked || undefined })} className="w-4 h-4" />
                                    {t('phoneCmd.waitForVoice', 'Time this line to the voice')}
                                </label>
                            </>)}
                            {!selLine.waitForVoice && (
                                <FormField label={kind === 'text' ? t('convoStudio.typingMs', 'Typing "…" before it (ms)') : t('phoneCmd.lineDelay', 'Beat before it (ms)')}>
                                    <TextInput type="number" min={0} value={selLine.delayMs ?? 900} onChange={(e: any) => updateLine(sel.li, { delayMs: Math.max(0, parseInt(e.target.value) || 0) })} />
                                </FormField>
                            )}
                            <AssetSelector label={t('phoneCmd.attachPhoto2', 'Attach photo / video')} assetType="images" allowVideo value={selLine.image?.id || null} onChange={(id: any) => updateLine(sel.li, { image: phoneMediaRef(project, id) })} />
                            <FormField label={t('convoStudio.lineSound', 'Sound when it lands')}>
                                <AssetSelector label="" assetType="audio" value={selLine.soundId || null} onChange={(id: any) => updateLine(sel.li, { soundId: id })} />
                            </FormField>
                            <PhonePortraitPicker senderId={selLine.speakerId} value={selLine.portrait} onChange={(p: any) => updateLine(sel.li, { portrait: p })} project={project} t={t} />
                            <ConditionsEditor collapsible title={t('phoneCmd.lineConditions', 'Only say this when…')} conditions={selLine.conditions || []} project={project} onChange={(cs: any) => updateLine(sel.li, { conditions: cs })} />
                            {/* Replies = in-conversation CHOICES: pause for a tap, run actions, gate later lines. */}
                            <div className="pt-2 border-t border-slate-700/60">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-white">{t('convoStudio.repliesTitle', 'Player replies (a choice)')}</span>
                                    <button onClick={() => addReplyToLine(sel.li)} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30">+ {t('convoStudio.addReply', 'Add reply')}</button>
                                </div>
                                <p className="text-[10px] text-slate-500 mb-1">{t('convoStudio.repliesHint2', 'The conversation pauses until the player taps one. Each reply can run ACTIONS (set variables, jump to a scene, give items, call a common event…), text back, and be condition-gated — later lines can react to what was picked.')}</p>
                                {(selLine.replies || []).map((r, ri) => (
                                    <button key={r.id} onClick={() => setSel({ kind: 'reply', li: (sel as any).li, ri })}
                                        className="w-full text-left text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 truncate mb-0.5">
                                        ↩ {r.text || t('convoStudio.emptyReply', '(empty reply)')}{(r.actions || []).length ? ` · ${(r.actions || []).length} ${t('convoStudio.actions', 'actions')}` : ''}
                                    </button>
                                ))}
                            </div>
                        </>) : (<>
                            <h3 className="text-sm font-semibold text-white">{t('convoStudio.settingsTitle', 'Conversation settings')}</h3>
                            {listMode && entry && (<>
                                <FormField label={t('convoStudio.entryName', 'Name (for you)')}>
                                    <TextInput value={entry.name ?? ''} placeholder={t('convoStudio.entryNamePh', 'e.g. After the party')} onChange={(e: any) => setEntry({ name: e.target.value || undefined })} />
                                </FormField>
                                <label className="flex items-center gap-1 text-xs text-slate-300" title={t('convoStudio.onceTip', 'Play at most once per playthrough')}>
                                    <input type="checkbox" checked={!!entry.once} onChange={e => setEntry({ once: e.target.checked || undefined })} className="w-4 h-4" />
                                    {t('convoStudio.once', 'Play only once')}
                                </label>
                                <ConditionsEditor collapsible title={t('convoStudio.playsWhen', 'Plays when…')} conditions={entry.conditions || []} project={project} onChange={(cs: any) => setEntry({ conditions: cs && cs.length ? cs : undefined })} />
                            </>)}
                            {kind === 'call' && lines.length > 0 && (
                                <label className="flex items-center gap-1 text-xs text-slate-300">
                                    <input type="checkbox" checked={conv.autoEnd !== false} onChange={e => setConv({ autoEnd: e.target.checked ? undefined : false })} className="w-4 h-4" />
                                    {t('phoneCmd.autoEnd', 'Hang up automatically after the last line')}
                                </label>
                            )}
                            <CollapsibleSection title={kind === 'call' ? t('phoneCmd.endActions', 'When the call ends') : t('convoStudio.endActionsText', 'When the conversation ends')} summary={`${(conv.endActions || []).length} ${t('convoStudio.actions', 'actions')}`}>
                                <UIActionsListEditor actions={conv.endActions || []} project={project} onChange={(acts: any) => setConv({ endActions: acts })} label="" />
                            </CollapsibleSection>
                            {!sel && <p className="text-[10px] text-slate-500 mt-2">{t('convoStudio.clickHint', 'Click a bubble in the middle to edit its line.')}</p>}
                        </>)}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ConversationStudio;
