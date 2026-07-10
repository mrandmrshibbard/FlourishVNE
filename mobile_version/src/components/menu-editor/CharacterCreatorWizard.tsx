import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { VNProject } from '../../types/project';
import { VNID } from '../../types';
import { CharacterCreatorConfig, DressUpConfig } from '../../features/systems/applyCharacterCreator';
import { DetectedOutfitRule, detectOutfitRules } from '../../features/systems/outfitRules';
import { UICustomizerCategory } from '../../features/ui/types';
import { SparklesIcon, CheckIcon, XMarkIcon, ChevronRightIcon } from '../icons';

/**
 * The UNIFIED character wizard — one tool for both jobs:
 *  - 🎮 Player character creator: players choose who they'll play as, dress them up, and type a
 *    name; the story shows them anywhere via ⟨Player's Character⟩ (→ applyCharacterCreator).
 *  - 🧥 Story-character dress-up: a Customizer for any character, as a ready-to-use screen or
 *    dropped onto the screen being edited (→ applyDressUp), with plain-language "smart fit rules"
 *    auto-suggested from art filenames.
 * Launched from BOTH the Systems hub (deep-linked via `initialMode`) and the UI editor's wizard
 * menu (which passes `currentScreenId` to enable the drop-onto-this-screen output).
 */

export type UnifiedWizardResult =
    | { kind: 'player'; config: CharacterCreatorConfig }
    | { kind: 'dressup'; config: DressUpConfig };

interface Props {
    isOpen: boolean;
    project: VNProject;
    onClose: () => void;
    onGenerate: (result: UnifiedWizardResult) => void;
    /** The screen open in the UI editor (enables "drop it onto this screen"). */
    currentScreenId?: VNID;
    /** Skip the who-is-this-for step (hub deep links). */
    initialMode?: 'player' | 'dressup';
}

type Step = 'audience' | 'player' | 'du-character' | 'du-parts' | 'du-rules' | 'du-output';

interface PartConfig { include: boolean; label: string; pickerStyle: NonNullable<UICustomizerCategory['pickerStyle']> }

const PICKER_HINTS: Record<string, string> = {
    swatches: 'Every option as a grid of thumbnails the player taps.',
    arrows: 'One option at a time with ◀ ▶ arrows to cycle through.',
    buttons: 'Each option as a labelled button.',
    dropdown: 'A dropdown list of options.',
};

const CharacterCreatorWizard: React.FC<Props> = ({ isOpen, project, onClose, onGenerate, currentScreenId, initialMode }) => {
    const characters = Object.values(project.characters || {}) as any[];

    const [step, setStep] = useState<Step>(initialMode === 'player' ? 'player' : initialMode === 'dressup' ? 'du-character' : 'audience');

    // ── Player branch state (the original form) ──
    const [screenName, setScreenName] = useState('Character Creator');
    const [selected, setSelected] = useState<Set<VNID>>(() => new Set(characters.slice(0, 1).map(c => c.id)));
    const [customize, setCustomize] = useState(true);
    const [includeName, setIncludeName] = useState(true);
    const [namePrompt, setNamePrompt] = useState('Your name:');
    const [hideNonFitting, setHideNonFitting] = useState(true);

    // ── Dress-up branch state ──
    const [duCharId, setDuCharId] = useState<VNID | null>(null);
    const [duParts, setDuParts] = useState<Record<VNID, PartConfig>>({});
    const [duAccepted, setDuAccepted] = useState<Set<string>>(new Set());
    const [duOutput, setDuOutput] = useState<'new' | 'current'>('new');
    const [duScreenName, setDuScreenName] = useState('');

    const duChar = duCharId ? project.characters[duCharId] : null;

    // Smart-rule suggestions for the picked character, limited to layers the player can change.
    const duRules = useMemo<DetectedOutfitRule[]>(() => {
        if (!duChar) return [];
        return detectOutfitRules(duChar).filter(r => duParts[r.targetLayerId]?.include && duParts[r.dependsLayerId]?.include);
    }, [duChar, duParts]);

    if (!isOpen) return null;
    const backdrop = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); };

    // ── Player branch handlers ──
    const toggleChar = (id: VNID) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const offeredIds = characters.filter(c => selected.has(c.id)).map(c => c.id);
    const canGeneratePlayer = offeredIds.length > 0;
    const generatePlayer = () => {
        if (!canGeneratePlayer) return;
        onGenerate({ kind: 'player', config: {
            screenName: screenName.trim() || 'Character Creator',
            offeredCharacterIds: offeredIds,
            customize,
            includeName,
            namePrompt: includeName ? namePrompt : undefined,
            hideNonFitting,
        } });
        onClose();
    };

    // ── Dress-up branch handlers ──
    const pickDuCharacter = (id: VNID) => {
        setDuCharId(id);
        const ch = project.characters[id];
        const parts: Record<VNID, PartConfig> = {};
        (Object.values(ch?.layers || {}) as any[]).forEach(layer => {
            const n = Object.keys(layer.assets || {}).length;
            parts[layer.id] = {
                include: n >= 2, // a single-option layer gives players nothing to change
                label: layer.name.charAt(0).toUpperCase() + layer.name.slice(1),
                pickerStyle: 'arrows',
            };
        });
        setDuParts(parts);
        setDuScreenName(`${ch?.name || 'Character'} Dress-Up`);
        setDuAccepted(new Set()); // re-seeded when entering the rules step
    };
    const duIncludedCount = (Object.values(duParts) as PartConfig[]).filter(p => p.include).length;
    const enterRulesStep = () => {
        // All suggestions default CHECKED — authors review sentences, not configure modes.
        setDuAccepted(new Set(duRules.map(r => r.id)));
        setStep(duRules.length > 0 ? 'du-rules' : 'du-output');
    };
    const generateDressUp = () => {
        if (!duChar || duIncludedCount === 0) return;
        onGenerate({ kind: 'dressup', config: {
            characterId: duChar.id,
            screenName: duScreenName.trim() || `${duChar.name} Dress-Up`,
            target: duOutput === 'current' && currentScreenId ? { kind: 'existing-screen', screenId: currentScreenId } : { kind: 'new-screen' },
            layers: (Object.entries(duParts) as [VNID, PartConfig][]).filter(([, p]) => p.include).map(([layerId, p]) => ({ layerId, label: p.label, pickerStyle: p.pickerStyle })),
            acceptedRules: duRules.filter(r => duAccepted.has(r.id)),
        } });
        onClose();
    };

    const subtitle: Record<Step, string> = {
        'audience': 'Who will use this?',
        'player': "Player character creator — choose, dress up, and name.",
        'du-character': 'Dress-up · Step 1: Pick the character',
        'du-parts': 'Dress-up · Step 2: What can players change?',
        'du-rules': 'Dress-up · Step 3: Smart fit rules',
        'du-output': 'Dress-up · Step 4: Where should this go?',
    };

    // ─────────────────────────── step renderers ───────────────────────────

    const renderAudience = () => (
        <div className="space-y-3">
            <button onClick={() => setStep('player')} className="w-full text-left bg-slate-800/60 hover:bg-slate-800 border border-slate-600/60 hover:border-purple-500/60 rounded-xl p-4 transition-colors">
                <div className="text-base font-semibold text-white">🎮 The player's own character</div>
                <p className="text-sm text-slate-400 mt-1">Players pick who they'll play as, dress them up, and type a name. Your story can then show them and speak as <span className="text-purple-300">⟨Player's Character⟩</span> anywhere.</p>
            </button>
            <button onClick={() => setStep('du-character')} className="w-full text-left bg-slate-800/60 hover:bg-slate-800 border border-slate-600/60 hover:border-purple-500/60 rounded-xl p-4 transition-colors">
                <div className="text-base font-semibold text-white">🧥 A story character (dress-up)</div>
                <p className="text-sm text-slate-400 mt-1">A dress-up screen for any character. Players change hair, outfits and more — and the character wears their new look in your scenes automatically.</p>
            </button>
            {characters.length === 0 && (
                <p className="text-sm text-amber-400 bg-amber-400/10 rounded-lg p-3">You have no characters yet. Create at least one character (with layers/outfits) in the Characters tab first.</p>
            )}
        </div>
    );

    const renderPlayer = () => (
        <div className="space-y-5">
            {characters.length === 0 && (
                <p className="text-sm text-amber-400 bg-amber-400/10 rounded-lg p-3">You have no characters yet. Create at least one character (with layers/outfits) in the Characters tab first.</p>
            )}
            <label className="block">
                <span className="text-sm text-slate-300">Screen name</span>
                <input value={screenName} onChange={e => setScreenName(e.target.value)} className="mt-1 w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 outline-none focus:border-purple-500" />
            </label>
            <div>
                <span className="text-sm text-slate-300">Characters the player can choose from</span>
                <p className="text-[11px] text-slate-500 mb-2">Pick one for a single fixed protagonist, or several to let the player choose. Each keeps its own outfits.</p>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {characters.map(c => (
                        <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer bg-slate-800/50 rounded-lg px-3 py-2 hover:bg-slate-800">
                            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleChar(c.id)} className="w-4 h-4" />
                            <span className="flex-1 text-white">{c.name}</span>
                            <span className="text-[10px] text-slate-500">{Object.keys(c.layers || {}).length} layer{Object.keys(c.layers || {}).length === 1 ? '' : 's'}</span>
                        </label>
                    ))}
                </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={customize} onChange={e => setCustomize(e.target.checked)} className="w-4 h-4" />
                <span className="text-slate-200">Let players customize the outfit</span>
                <span className="text-[11px] text-slate-500">(adds a dress-up Customizer for each character)</span>
            </label>
            {customize && (
                <label className="flex items-center gap-2 text-sm cursor-pointer ml-6">
                    <input type="checkbox" checked={hideNonFitting} onChange={e => setHideNonFitting(e.target.checked)} className="w-4 h-4" />
                    <span className="text-slate-200">Hide pieces that don't fit (recommended)</span>
                    <span className="text-[11px] text-slate-500">(reads your art file names, e.g. jacket_slim only with body_slim)</span>
                </label>
            )}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={includeName} onChange={e => setIncludeName(e.target.checked)} className="w-4 h-4" />
                    <span className="text-slate-200">Let players name their character</span>
                    <span className="text-[11px] text-slate-500">(shown as the speaker name in dialogue)</span>
                </label>
                {includeName && (
                    <input value={namePrompt} onChange={e => setNamePrompt(e.target.value)} placeholder="Name prompt (e.g. Your name:)" className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm outline-none focus:border-purple-500" />
                )}
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3 text-[11px] text-slate-400 leading-relaxed">
                <b className="text-slate-300">How it runs:</b> the generated <b>Start</b> button toggles the creator screen closed, and the screen advances the story when it closes (saving the player's choices). To open it, add a <span className="font-mono text-slate-300">Show&nbsp;Screen</span> command (or a button with a <span className="font-mono text-slate-300">Toggle&nbsp;Screen</span> action) pointing at this screen — e.g. at the very start of your first scene, or from your title's New&nbsp;Game button.
            </div>
            <div className="bg-slate-900 rounded-lg p-4 space-y-2 text-sm">
                <Row label={`Screen "${screenName || 'Character Creator'}"`} />
                <Row label={`Player picks from ${offeredIds.length || 'no'} character${offeredIds.length === 1 ? '' : 's'}`} />
                {customize && <Row label="Dress-up Customizer per character (outfit remembered)" />}
                {customize && hideNonFitting && <Row label="Pieces that don't fit are hidden automatically" />}
                {includeName && <Row label="Name entry → shown as the speaker name in dialogue" />}
                <Row label="⟨Player's Character⟩ is wired up automatically" />
            </div>
        </div>
    );

    const renderDuCharacter = () => (
        <div className="space-y-3">
            {characters.length === 0 && (
                <p className="text-sm text-amber-400 bg-amber-400/10 rounded-lg p-3">You have no characters yet. Create at least one character (with layers/outfits) in the Characters tab first.</p>
            )}
            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {characters.map(c => {
                    const layerCount = Object.keys(c.layers || {}).length;
                    const pieceCount = (Object.values(c.layers || {}) as any[]).reduce((n, l) => n + Object.keys(l.assets || {}).length, 0);
                    const isSel = duCharId === c.id;
                    return (
                        <button key={c.id} onClick={() => pickDuCharacter(c.id)}
                            className={`text-left rounded-xl p-3 border transition-colors ${isSel ? 'bg-purple-500/20 border-purple-500/60' : 'bg-slate-800/60 border-slate-600/60 hover:bg-slate-800'}`}>
                            <div className="font-semibold text-white text-sm truncate">{c.name}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{layerCount} layer{layerCount === 1 ? '' : 's'} · {pieceCount} piece{pieceCount === 1 ? '' : 's'} of art</div>
                        </button>
                    );
                })}
            </div>
            {duChar && Object.keys(duChar.layers || {}).length === 0 && (
                <p className="text-sm text-amber-400 bg-amber-400/10 rounded-lg p-3">"{duChar.name}" has no layers yet — there'd be nothing to dress up. Add layers (Hair, Outfit…) with art in the Characters tab first.</p>
            )}
        </div>
    );

    const renderDuParts = () => (
        <div className="space-y-2">
            <p className="text-[11px] text-slate-500">Each checked part becomes a picker players can use. Give it the label players will see.</p>
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {(Object.values(duChar?.layers || {}) as any[]).map(layer => {
                    const part = duParts[layer.id];
                    if (!part) return null;
                    const n = Object.keys(layer.assets || {}).length;
                    return (
                        <div key={layer.id} className={`rounded-lg px-3 py-2 border ${part.include ? 'bg-slate-800/60 border-slate-600/60' : 'bg-slate-800/25 border-transparent'}`}>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={part.include} onChange={e => setDuParts(p => ({ ...p, [layer.id]: { ...part, include: e.target.checked } }))} className="w-4 h-4" />
                                <span className="text-sm text-white flex-1">{layer.name}</span>
                                <span className="text-[10px] text-slate-500">{n} option{n === 1 ? '' : 's'}</span>
                            </div>
                            {n < 2 && <p className="text-[10px] text-slate-500 ml-6 mt-0.5">only one option — players couldn't change anything</p>}
                            {part.include && (
                                <div className="flex items-center gap-2 ml-6 mt-1.5">
                                    <input value={part.label} onChange={e => setDuParts(p => ({ ...p, [layer.id]: { ...part, label: e.target.value } }))}
                                        placeholder="Label players see" className="flex-1 bg-slate-900/70 border border-slate-600 rounded px-2 py-1 text-xs outline-none focus:border-purple-500" />
                                    <select value={part.pickerStyle} onChange={e => setDuParts(p => ({ ...p, [layer.id]: { ...part, pickerStyle: e.target.value as PartConfig['pickerStyle'] } }))}
                                        title={PICKER_HINTS[part.pickerStyle]}
                                        className="bg-slate-900/70 border border-slate-600 rounded px-2 py-1 text-xs">
                                        <option value="arrows">◀ ▶ Arrows</option>
                                        <option value="swatches">Swatches</option>
                                        <option value="buttons">Buttons</option>
                                        <option value="dropdown">Dropdown</option>
                                    </select>
                                </div>
                            )}
                            {part.include && <p className="text-[10px] text-slate-500 ml-6 mt-1">{PICKER_HINTS[part.pickerStyle]}</p>}
                        </div>
                    );
                })}
            </div>
            {duIncludedCount === 0 && <p className="text-sm text-amber-400">Check at least one part players can change.</p>}
        </div>
    );

    const renderDuRules = () => {
        // Group the suggestion sentences by the category (layer) they gate.
        const byLayer = new Map<VNID, DetectedOutfitRule[]>();
        duRules.forEach(r => { const l = byLayer.get(r.targetLayerId) || []; l.push(r); byLayer.set(r.targetLayerId, l); });
        return (
            <div className="space-y-3">
                <div>
                    <h3 className="text-sm font-semibold text-white">Some pieces look like they only fit certain choices</h3>
                    <p className="text-[11px] text-slate-400 mt-1">We looked at your art file names and spotted these matches. Checked rules automatically hide a piece when it wouldn't fit. You can change any of this later in the Customizer's Properties.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setDuAccepted(new Set(duRules.map(r => r.id)))} className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs">Check all</button>
                    <button onClick={() => setDuAccepted(new Set())} className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs">Uncheck all</button>
                </div>
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {[...byLayer.entries()].map(([layerId, rules]) => (
                        <div key={layerId}>
                            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{duParts[layerId]?.label || rules[0].targetLayerName}</div>
                            <div className="space-y-1">
                                {rules.map(r => (
                                    <label key={r.id} className="flex items-start gap-2 text-sm cursor-pointer bg-slate-800/50 rounded-lg px-3 py-2 hover:bg-slate-800">
                                        <input type="checkbox" checked={duAccepted.has(r.id)}
                                            onChange={e => setDuAccepted(prev => { const next = new Set(prev); if (e.target.checked) next.add(r.id); else next.delete(r.id); return next; })}
                                            className="w-4 h-4 mt-0.5" />
                                        <span className="text-slate-200 leading-snug">
                                            Show <b className="text-white">"{r.targetAssetName}"</b> only when <b className="text-white">{duParts[r.dependsLayerId]?.label || r.dependsLayerName}</b> is {r.dependsAssetNames.map((n, i) => (
                                                <React.Fragment key={i}>{i > 0 && <span className="text-slate-400"> or </span>}<b className="text-white">"{n}"</b></React.Fragment>
                                            ))}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-slate-500">Unchecked pieces are always available.</p>
            </div>
        );
    };

    const renderDuOutput = () => (
        <div className="space-y-4">
            <div className="space-y-2">
                <label className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer ${duOutput === 'new' ? 'bg-purple-500/15 border-purple-500/60' : 'bg-slate-800/50 border-slate-600/60'}`}>
                    <input type="radio" name="du-out" checked={duOutput === 'new'} onChange={() => setDuOutput('new')} className="mt-1" />
                    <span>
                        <span className="text-sm font-semibold text-white block">A new, ready-to-use screen</span>
                        <span className="text-[11px] text-slate-400">Open it with a Show Screen command in any scene. When the player clicks Done, the story continues with the new outfit.</span>
                    </span>
                </label>
                {duOutput === 'new' && (
                    <input value={duScreenName} onChange={e => setDuScreenName(e.target.value)} placeholder="Screen name" className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm outline-none focus:border-purple-500" />
                )}
                {currentScreenId && (
                    <label className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer ${duOutput === 'current' ? 'bg-purple-500/15 border-purple-500/60' : 'bg-slate-800/50 border-slate-600/60'}`}>
                        <input type="radio" name="du-out" checked={duOutput === 'current'} onChange={() => setDuOutput('current')} className="mt-1" />
                        <span>
                            <span className="text-sm font-semibold text-white block">Drop it onto the screen I'm editing now</span>
                            <span className="text-[11px] text-slate-400">Adds the configured Customizer to "{project.uiScreens?.[currentScreenId]?.name || 'this screen'}" — position and style it like any element.</span>
                        </span>
                    </label>
                )}
            </div>
            <div className="bg-slate-900 rounded-lg p-4 space-y-2 text-sm">
                <Row label={`Dress-up for ${duChar?.name || '—'}`} />
                <Row label={`Players can change: ${(Object.values(duParts) as PartConfig[]).filter(p => p.include).map(p => p.label).join(', ') || '—'}`} />
                {duAccepted.size > 0 && <Row label={`${duAccepted.size} smart fit rule${duAccepted.size === 1 ? '' : 's'}`} />}
                <Row label={duOutput === 'current' && currentScreenId ? `Added to "${project.uiScreens?.[currentScreenId]?.name || 'current screen'}"` : `New screen "${duScreenName || `${duChar?.name} Dress-Up`}" with a Done button`} />
                <Row label="The new look shows on the character in your scenes automatically" />
            </div>
        </div>
    );

    // ─────────────────────────── footer navigation ───────────────────────────

    const footer = () => {
        const next = (label: string, target: Step | (() => void), disabled = false) => (
            <button onClick={() => (typeof target === 'function' ? target() : setStep(target))} disabled={disabled}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 flex items-center gap-2">{label} <ChevronRightIcon className="w-4 h-4" /></button>
        );
        const back = (target: Step) => (
            <button onClick={() => setStep(target)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600">Back</button>
        );
        const cancel = <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600">Cancel</button>;
        const showAudienceBack = !initialMode;
        switch (step) {
            case 'audience': return <>{cancel}<span /></>;
            case 'player': return <>
                {showAudienceBack ? back('audience') : cancel}
                <button onClick={generatePlayer} disabled={!canGeneratePlayer} className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 font-semibold flex items-center gap-2"><SparklesIcon className="w-4 h-4" /> Generate Character Creator</button>
            </>;
            case 'du-character': return <>
                {showAudienceBack ? back('audience') : cancel}
                {next('Next', 'du-parts', !duChar || Object.keys(duChar.layers || {}).length === 0)}
            </>;
            case 'du-parts': return <>{back('du-character')}{next('Next', enterRulesStep, duIncludedCount === 0)}</>;
            case 'du-rules': return <>{back('du-parts')}{next('Next', 'du-output')}</>;
            case 'du-output': return <>
                {back(duRules.length > 0 ? 'du-rules' : 'du-parts')}
                <button onClick={generateDressUp} disabled={!duChar || duIncludedCount === 0} className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 font-semibold flex items-center gap-2"><SparklesIcon className="w-4 h-4" /> Generate Dress-Up</button>
            </>;
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={backdrop}>
            <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl shadow-2xl w-full max-w-2xl m-4 border border-slate-700 max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-slate-700 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg"><SparklesIcon className="w-6 h-6 text-purple-400" /></div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Character Creator & Dress-Up</h2>
                            <p className="text-sm text-slate-400">{subtitle[step]}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg"><XMarkIcon className="w-5 h-5 text-slate-400" /></button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {step === 'audience' && renderAudience()}
                    {step === 'player' && renderPlayer()}
                    {step === 'du-character' && renderDuCharacter()}
                    {step === 'du-parts' && renderDuParts()}
                    {step === 'du-rules' && renderDuRules()}
                    {step === 'du-output' && renderDuOutput()}
                </div>

                <div className="flex justify-between gap-3 p-4 border-t border-slate-700 flex-shrink-0">
                    {footer()}
                </div>
            </div>
        </div>,
        document.body,
    );
};

const Row: React.FC<{ label: string }> = ({ label }) => (
    <div className="flex items-center gap-2 text-slate-200"><CheckIcon className="w-4 h-4 text-green-400" /><span>{label}</span></div>
);

export default CharacterCreatorWizard;
