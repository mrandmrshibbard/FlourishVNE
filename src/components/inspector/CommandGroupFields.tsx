/**
 * Grouped field renderers for the Properties Inspector revamp (pilot: Dialogue +
 * ShowButton). Each property group renders the SAME existing field components and
 * writes through the SAME `updateCommand(partial)` contract used by
 * PropertiesInspector — so this is presentation-only with zero schema/serialization
 * impact. Consumed by both the right-click group popover and (later) the docked
 * accordion.
 *
 * NOTE: this intentionally renders a faithful SUBSET per group for quick editing.
 * The radial's center hub ("expand") routes to the full PropertiesInspector for
 * anything not surfaced here, so no functionality is lost.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../contexts/ProjectContext';
import { VNProject } from '../../types/project';
import {
    VNCommand, CommandType, DialogueCommand, ShowButtonCommand, ShowItemCommand, ShowTextCommand, ShowImageCommand, ShowCharacterCommand, HideCharacterCommand, REACTIVE_VISUAL_TYPES,
} from '../../features/scene/types';
import { VNUIAction, UIActionType } from '../../types/shared';
import { FormField, Select, TextInput, TextArea, ColorInput } from '../ui/Form';
import { TrashIcon, XMarkIcon, PlusIcon, ChevronUpIcon, ChevronDownIcon } from '../icons';
import AssetSelector from '../ui/AssetSelector';
import ActionEditor from '../menu-editor/ActionEditor';
import ActionCard from '../menu-editor/ActionCard';
import ConditionsEditor from '../ui/ConditionsEditor';
import SearchableSelect from '../ui/SearchableSelect';
import { OrientationFields, TransitionFields, PositionInputs, CharacterVisualEffectsEditor } from './fields';
import CollapsibleSection from '../ui/CollapsibleSection';
import { InspectorGroupId, INSPECTOR_GROUPS, getCommandGroups } from './inspectorGroups';
import { LayerControl, ParallaxDepthControl } from './LayerControl';
import { pluginManager } from '../../features/plugins/PluginManagerService';
import { ChoiceLayoutSelect, ChoiceOptionAppearance } from './ChoiceAppearanceFields';
import { SetVariablePreview } from './SetVariablePreview';
import { resolveBoolLabels } from '../../features/variables/booleanLabels';

export type UpdateCommand = (updates: Partial<VNCommand>) => void;

/** Visual scene commands whose stacking order the author can change (the stage band system).
 *  Movies and hot spots keep their fixed bands for now. */
const VISUAL_LAYER_TYPES = new Set<CommandType>([
    CommandType.ShowImage, CommandType.ShowCharacter, CommandType.ShowText, CommandType.ShowButton, CommandType.ShowItem,
]);

/** Effective `layer` of the other visual commands in the same scene (for Front/Back). */
function commandSiblingLayers(project: VNProject, cmdId: string): number[] {
    for (const s of Object.values(project.scenes)) {
        if (s.commands.some(c => c.id === cmdId)) {
            return s.commands.filter(c => c.id !== cmdId && VISUAL_LAYER_TYPES.has(c.type)).map(c => (c as any).layer ?? 0);
        }
    }
    return [];
}

/** Scene context some renderers need (e.g. Hide* target lists = prior matching commands). */
export interface GroupCtx { sceneId: string; commandIndex: number; }

interface GroupProps {
    groupId: InspectorGroupId;
    command: VNCommand;
    updateCommand: UpdateCommand;
    ctx?: GroupCtx;
}

/** Renders the fields for one (command, group) pair. Returns null if nothing applies. */
export const CommandGroupFields: React.FC<GroupProps> = ({ groupId, command, updateCommand, ctx }) => {
    const { project } = useProject();
    const { t } = useTranslation('properties');

    // Conditions is a universal group (run-conditions + optional live re-evaluation),
    // independent of command type.
    if (groupId === 'conditions') {
        const c = command as any;
        const supportsLive = REACTIVE_VISUAL_TYPES.has(command.type) || command.type === CommandType.PlaySoundEffect;
        return <>
            <p className="text-xs text-[var(--text-secondary)] mb-2">{t('footer.conditionsDesc')}</p>
            <ConditionsEditor conditions={c.conditions} project={project} onChange={(cs) => updateCommand({ conditions: cs } as any)} />
            {supportsLive && (
                <label className="flex items-start gap-2 mt-3 cursor-pointer">
                    <input type="checkbox" checked={!!c.liveConditions} onChange={e => updateCommand({ liveConditions: e.target.checked } as any)} className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-[var(--text-secondary)]">
                        <span className="font-bold text-[var(--text-primary)]">{t('footer.liveConditions')}</span><br />
                        {command.type === CommandType.PlaySoundEffect
                            ? 'Re-check this sound’s conditions as variables change: loop while met (or play once each time they become true).'
                            : t('footer.liveConditionsDesc')}
                    </span>
                </label>
            )}
        </>;
    }

    // Layer + parallax-depth controls appended to the Transform group of visual commands.
    const layerCtl = (groupId === 'transform' && VISUAL_LAYER_TYPES.has(command.type))
        ? <>
            <LayerControl value={(command as any).layer} siblings={commandSiblingLayers(project, command.id)} onChange={n => updateCommand({ layer: n } as any)} />
            <ParallaxDepthControl value={(command as any).parallaxDepth} onChange={n => updateCommand({ parallaxDepth: n } as any)} />
        </>
        : null;

    if (command.type === CommandType.Dialogue) {
        return <DialogueGroup groupId={groupId} cmd={command as DialogueCommand} updateCommand={updateCommand} project={project} t={t} />;
    }
    if (command.type === CommandType.ShowButton) {
        return <>{<ShowButtonGroup groupId={groupId} cmd={command as ShowButtonCommand} updateCommand={updateCommand} project={project} t={t} />}{layerCtl}</>;
    }
    if (command.type === CommandType.ShowItem) {
        return <>{<ShowItemGroup groupId={groupId} cmd={command as ShowItemCommand} updateCommand={updateCommand} project={project} t={t} />}{layerCtl}</>;
    }
    if (command.type === CommandType.ShowText) {
        return <>{<ShowTextGroup groupId={groupId} cmd={command as ShowTextCommand} updateCommand={updateCommand} t={t} />}{layerCtl}</>;
    }
    if (command.type === CommandType.ShowImage) {
        return <>{<ShowImageGroup groupId={groupId} cmd={command as ShowImageCommand} updateCommand={updateCommand} t={t} />}{layerCtl}</>;
    }
    if (command.type === CommandType.ShowCharacter) {
        return <>{<ShowCharacterGroup groupId={groupId} cmd={command as ShowCharacterCommand} updateCommand={updateCommand} project={project} t={t} />}{layerCtl}</>;
    }
    if (command.type === CommandType.HideCharacter) {
        const c = command as HideCharacterCommand;
        if (groupId === 'content') {
            const characterOptions = Object.values(project.characters).map((ch: any) => ({ value: ch.id, label: ch.name }));
            return <FormField label={t('shared.character')}>
                <SearchableSelect options={characterOptions} value={c.characterId} onChange={value => updateCommand({ characterId: value } as any)}
                    placeholder={Object.keys(project.characters).length === 0 ? t('shared.noCharacters') : t('shared.selectCharacter')} />
            </FormField>;
        }
        if (groupId === 'animation') return <>
            <TransitionFields transition={c.transition} duration={c.duration} onUpdate={updateCommand as any} />
            {c.transition === 'slide' && <PositionInputs label={t('shared.startPosition')} position={c.startPosition as any} onChange={pos => updateCommand({ startPosition: pos } as any)} />}
            {c.transition === 'slide' && <PositionInputs label={t('shared.endPosition')} position={c.endPosition as any} onChange={pos => updateCommand({ endPosition: pos } as any)} />}
        </>;
        return null;
    }
    if (command.type === CommandType.StopMovie) {
        if (groupId === 'content') return <p className="text-xs text-[var(--text-secondary)]">{t('movie.stopMovieDesc')}</p>;
        return null;
    }
    if (command.type === CommandType.PlayMovie) {
        return <PlayMovieGroup groupId={groupId} cmd={command as any} updateCommand={updateCommand} project={project} t={t} />;
    }
    if (command.type === CommandType.ShowHotSpot) {
        return <ShowHotSpotGroup groupId={groupId} cmd={command as any} updateCommand={updateCommand} project={project} t={t} />;
    }
    if (command.type === CommandType.CreditRoll) {
        return <CreditRollGroup groupId={groupId} cmd={command as any} updateCommand={updateCommand} project={project} t={t} />;
    }
    if (command.type === CommandType.SpawnParticles) {
        return <SpawnParticlesGroup groupId={groupId} cmd={command as any} updateCommand={updateCommand} t={t} />;
    }
    if (command.type === CommandType.TweenElement) {
        return <TweenElementGroup groupId={groupId} cmd={command as any} updateCommand={updateCommand} project={project} t={t} ctx={ctx} />;
    }
    if (command.type === CommandType.HideText || command.type === CommandType.HideImage || command.type === CommandType.HideButton
        || command.type === CommandType.HideHotSpot) {
        return <HideTargetGroup groupId={groupId} command={command} updateCommand={updateCommand} project={project} t={t} ctx={ctx} />;
    }
    if (command.type === CommandType.BranchStart || command.type === CommandType.BranchEnd || command.type === CommandType.Group
        || command.type === CommandType.RunScript || command.type === CommandType.StopParticles || command.type === CommandType.CallCommonEvent) {
        return <NicheCommandGroup groupId={groupId} command={command} updateCommand={updateCommand} project={project} t={t} ctx={ctx} />;
    }
    if (command.type === CommandType.SetBackground) {
        return <SetBackgroundGroup groupId={groupId} cmd={command as any} updateCommand={updateCommand} project={project} t={t} />;
    }
    if (command.type === CommandType.PlayMusic || command.type === CommandType.StopMusic
        || command.type === CommandType.PlaySoundEffect || command.type === CommandType.StopSoundEffect) {
        return <AudioCmdGroup groupId={groupId} command={command} updateCommand={updateCommand} project={project} t={t} />;
    }
    if (command.type === CommandType.SetVariable) {
        return <SetVariableGroup groupId={groupId} cmd={command as any} updateCommand={updateCommand} project={project} t={t} />;
    }
    if (command.type === CommandType.Choice) {
        return <ChoiceGroup groupId={groupId} cmd={command as any} updateCommand={updateCommand} project={project} t={t} />;
    }
    if (command.type === CommandType.ShakeScreen || command.type === CommandType.TintScreen || command.type === CommandType.PanZoomScreen
        || command.type === CommandType.ResetScreenEffects || command.type === CommandType.FlashScreen || command.type === CommandType.Lightning
        || command.type === CommandType.Flashlight || command.type === CommandType.Fireworks || command.type === CommandType.SetScreenOverlayEffect
        || command.type === CommandType.PlaceLights || command.type === CommandType.ClearLights
        || command.type === CommandType.ShowScreen || command.type === CommandType.Label || command.type === CommandType.JumpToLabel) {
        return <ScreenMiscGroup groupId={groupId} command={command} updateCommand={updateCommand} project={project} t={t} />;
    }
    if (command.type === CommandType.Jump) {
        if (groupId !== 'content') return null;
        const c = command as any;
        return <>
            <FormField label={t('jump.targetScene')}>
                <Select value={c.targetSceneId} onChange={e => updateCommand({ targetSceneId: e.target.value } as any)}>
                    {Object.values(project.scenes).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
            </FormField>
            {!project.scenes[c.targetSceneId] && <p className="text-red-500 text-xs">Warning: Target scene not found.</p>}
        </>;
    }
    if (command.type === CommandType.Wait) {
        if (groupId !== 'content') return null;
        const c = command as any;
        const waitItems = Object.values(project.items || {}) as any[];
        const seedItems = () => (c.targetItemIds && c.targetItemIds.length > 0) ? c.targetItemIds : (waitItems[0] ? [waitItems[0].id] : []);
        return <>
            <FormField label={t('shared.durationSec')}><TextInput type="number" min="0" step="0.1" value={c.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 } as any)} disabled={c.waitIndefinitelyForInput || c.waitForItems} /></FormField>
            <FormField label={t('wait.waitMode')}>
                <div className="space-y-2">
                    <label className="flex items-center gap-1"><input type="checkbox" checked={!c.waitIndefinitelyForInput && !c.waitForInput && !c.waitForItems} onChange={() => updateCommand({ waitForInput: false, waitIndefinitelyForInput: false, waitForItems: false } as any)} /><span className="text-xs text-[var(--text-primary)]">{t('wait.timed')}</span></label>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={!!c.waitForInput && !c.waitIndefinitelyForInput && !c.waitForItems} onChange={() => updateCommand({ waitForInput: true, waitIndefinitelyForInput: false, waitForItems: false } as any)} /><span className="text-xs text-[var(--text-primary)]">{t('wait.allowClick')}</span></label>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={!!c.waitIndefinitelyForInput && !c.waitForItems} onChange={() => updateCommand({ waitIndefinitelyForInput: true, waitForInput: false, waitForItems: false } as any)} /><span className="text-xs text-[var(--text-primary)]">{t('wait.indefinite')}</span></label>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={!!c.waitForItems} onChange={() => updateCommand({ waitForItems: true, waitForInput: false, waitIndefinitelyForInput: false, targetItemIds: seedItems() } as any)} /><span className="text-xs text-[var(--text-primary)]">{t('wait.untilItems')}</span></label>
                </div>
            </FormField>
            {c.waitForItems && (
                <div className="pl-2 border-l-2 border-[var(--accent-lavender)]/40 space-y-2">
                    <FormField label={t('wait.itemsRequire')}>
                        <Select value={c.itemsMode === 'any' ? 'any' : 'all'} onChange={e => updateCommand({ itemsMode: e.target.value } as any)}>
                            <option value="all">{t('wait.requireAll')}</option>
                            <option value="any">{t('wait.requireAny')}</option>
                        </Select>
                    </FormField>
                    <div className="space-y-1">
                        {(c.targetItemIds || []).map((id: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-1">
                                <Select value={id} onChange={e => { const next = [...(c.targetItemIds || [])]; next[idx] = e.target.value; updateCommand({ targetItemIds: next } as any); }}>
                                    {waitItems.length === 0 && <option value="">{t('wait.noItems')}</option>}
                                    {waitItems.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                                </Select>
                                <button onClick={() => updateCommand({ targetItemIds: (c.targetItemIds || []).filter((_: string, i: number) => i !== idx) } as any)} className="px-2 py-1 text-xs text-red-400 hover:text-red-300 rounded hover:bg-[var(--bg-tertiary)]" title={t('wait.removeItem')}>✕</button>
                            </div>
                        ))}
                        <button onClick={() => updateCommand({ targetItemIds: [...(c.targetItemIds || []), waitItems[0]?.id || ''] } as any)} className="w-full p-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors text-xs">{t('wait.addItem')}</button>
                    </div>
                </div>
            )}
        </>;
    }
    if (command.type === CommandType.TextInput) {
        if (groupId !== 'content') return null;
        const c = command as any;
        return <>
            <FormField label={t('vars.variable')}>
                <Select value={c.variableId} onChange={e => updateCommand({ variableId: e.target.value } as any)}>
                    {Object.keys(project.variables).length === 0 && <option disabled>{t('vars.noVariables')}</option>}
                    {Object.values(project.variables).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
            </FormField>
            <FormField label={t('textInput.prompt')}><TextInput value={c.prompt} onChange={e => updateCommand({ prompt: e.target.value } as any)} placeholder={t('textInput.promptPlaceholder')} /></FormField>
            <FormField label={t('textInput.placeholder')}><TextInput value={c.placeholder || ''} onChange={e => updateCommand({ placeholder: e.target.value } as any)} placeholder={t('textInput.placeholderPlaceholder')} /></FormField>
            <FormField label={t('textInput.maxLength')}><TextInput type="number" min="1" max="1000" value={c.maxLength || 50} onChange={e => updateCommand({ maxLength: parseInt(e.target.value) || 50 } as any)} /></FormField>
        </>;
    }
    return null;
};

/**
 * Docked accordion: renders each of a command's groups as a CollapsibleSection
 * (with a collapsed one-line summary). The first group opens by default. The
 * universal inspector footer (Reset/Async/Conditions) is rendered separately by
 * PropertiesInspector below this.
 */
export const CommandGroupAccordion: React.FC<{ command: VNCommand; updateCommand: UpdateCommand; ctx?: GroupCtx }> = ({ command, updateCommand, ctx }) => {
    const { project } = useProject();
    const { t } = useTranslation('ui');
    const groups = getCommandGroups(command);
    if (groups.length === 0) return null;
    return (
        <div className="space-y-2">
            {groups.map((g, i) => (
                <CollapsibleSection
                    key={g}
                    title={t(INSPECTOR_GROUPS[g].i18nKey)}
                    glyph={INSPECTOR_GROUPS[g].glyph}
                    summary={summarizeGroup(g, command, project)}
                    defaultOpen={i === 0}
                >
                    <CommandGroupFields groupId={g} command={command} updateCommand={updateCommand} ctx={ctx} />
                </CollapsibleSection>
            ))}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Dialogue
// ─────────────────────────────────────────────────────────────────────────────
const DialogueGroup: React.FC<{ groupId: InspectorGroupId; cmd: DialogueCommand; updateCommand: UpdateCommand; project: VNProject; t: any }> = ({ groupId, cmd, updateCommand, project, t }) => {
    const currentTextEffect = cmd.textEffect?.type || 'none';
    if (groupId === 'content') {
        const characterOptions = [
            { value: '', label: t('shared.narrator') },
            ...Object.values(project.characters).map((c: any) => ({ value: c.id, label: c.name })),
        ];
        const audioOptions = [
            { value: '', label: t('shared.none') },
            ...Object.values(project.audio).map((a: any) => ({ value: a.id, label: a.name })),
        ];
        const themeOptions = [
            { value: '', label: 'Speaker default' },
            ...Object.values(project.textboxThemes || {}).map((th: any) => ({ value: th.id, label: th.name })),
        ];
        return <>
            <FormField label={t('shared.character')}>
                <SearchableSelect options={characterOptions} value={cmd.characterId || ''} onChange={(v) => updateCommand({ characterId: v || null } as any)} placeholder={t('shared.selectCharacter')} />
            </FormField>
            <FormField label={t('dialogue.text')}>
                <TextArea value={cmd.text} onChange={e => updateCommand({ text: e.target.value } as any)} />
            </FormField>
            <FormField label="Textbox theme (this line)">
                {Object.keys(project.textboxThemes || {}).length > 0 ? (
                    <SearchableSelect options={themeOptions} value={cmd.textboxThemeId || ''} onChange={(v) => updateCommand({ textboxThemeId: v || null } as any)} placeholder="Speaker default" />
                ) : (
                    <p className="text-[10px] text-[var(--text-muted)]">No textbox themes yet — create them in UI / Screens → In-Game UI → Textbox Themes.</p>
                )}
            </FormField>
            <FormField label={t('dialogue.voiceClip')}>
                <SearchableSelect options={audioOptions} value={cmd.voiceAudioId || ''} onChange={(v) => updateCommand({ voiceAudioId: v || null } as any)} placeholder={t('dialogue.selectVoiceClip')} />
            </FormField>
            <FormField label={t('dialogue.keepOpen')}>
                <input type="checkbox" checked={cmd.keepOpenDuringChoices ?? false} onChange={e => updateCommand({ keepOpenDuringChoices: e.target.checked } as any)} className="cursor-pointer" />
            </FormField>
        </>;
    }
    if (groupId === 'effects') {
        const textEffectOptions = ['none', 'shake', 'wave', 'rainbow', 'glitch', 'pulse', 'fade-in', 'bounce', 'typewriter-bounce'];
        return <>
            <FormField label={t('dialogue.textEffect')}>
                <Select value={currentTextEffect} onChange={e => {
                    const type = e.target.value as any;
                    if (type === 'none') updateCommand({ textEffect: undefined } as any);
                    else updateCommand({ textEffect: { type, speed: cmd.textEffect?.speed ?? 1, intensity: cmd.textEffect?.intensity ?? 1 } } as any);
                }}>
                    {textEffectOptions.map(v => <option key={v} value={v}>{t(`dialogue.effects.${v}`)}</option>)}
                </Select>
            </FormField>
            {currentTextEffect !== 'none' && <>
                <FormField label={t('dialogue.effectSpeed')}>
                    <input type="range" min="0.1" max="5" step="0.1" value={cmd.textEffect?.speed ?? 1} onChange={e => updateCommand({ textEffect: { ...(cmd.textEffect || { type: currentTextEffect as any }), speed: parseFloat(e.target.value) } } as any)} className="w-full" />
                    <span className="text-xs text-[var(--text-secondary)]">{(cmd.textEffect?.speed ?? 1).toFixed(1)}x</span>
                </FormField>
                <FormField label={t('dialogue.effectIntensity')}>
                    <input type="range" min="0.1" max="3" step="0.1" value={cmd.textEffect?.intensity ?? 1} onChange={e => updateCommand({ textEffect: { ...(cmd.textEffect || { type: currentTextEffect as any }), intensity: parseFloat(e.target.value) } } as any)} className="w-full" />
                    <span className="text-xs text-[var(--text-secondary)]">{(cmd.textEffect?.intensity ?? 1).toFixed(1)}x</span>
                </FormField>
            </>}
        </>;
    }
    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// ShowButton
// ─────────────────────────────────────────────────────────────────────────────
const ShowButtonGroup: React.FC<{ groupId: InspectorGroupId; cmd: ShowButtonCommand; updateCommand: UpdateCommand; project: VNProject; t: any }> = ({ groupId, cmd, updateCommand, project, t }) => {
    switch (groupId) {
        case 'content':
            return <FormField label={t('button.buttonText')}><TextInput value={cmd.text} onChange={e => updateCommand({ text: e.target.value } as any)} /></FormField>;
        case 'transform':
            return <>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('shared.xPosition')}><TextInput type="number" value={cmd.x} onChange={e => updateCommand({ x: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                    <FormField label={t('shared.yPosition')}><TextInput type="number" value={cmd.y} onChange={e => updateCommand({ y: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                </div>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('shared.widthPercent')}><TextInput type="number" value={cmd.width} onChange={e => updateCommand({ width: parseFloat(e.target.value) || 20 } as any)} /></FormField>
                    <FormField label={t('shared.heightPercent')}><TextInput type="number" value={cmd.height} onChange={e => updateCommand({ height: parseFloat(e.target.value) || 8 } as any)} /></FormField>
                </div>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('button.anchorX')}><TextInput type="number" step="0.1" value={cmd.anchorX} onChange={e => updateCommand({ anchorX: parseFloat(e.target.value) || 0.5 } as any)} /></FormField>
                    <FormField label={t('button.anchorY')}><TextInput type="number" step="0.1" value={cmd.anchorY} onChange={e => updateCommand({ anchorY: parseFloat(e.target.value) || 0.5 } as any)} /></FormField>
                </div>
                <OrientationFields rotation={cmd.rotation} flipX={cmd.flipX} flipY={cmd.flipY} onChange={p => updateCommand(p as any)} />
            </>;
        case 'appearance':
            return <>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('button.background')}><ColorInput value={cmd.backgroundColor || '#6366f1'} onChange={val => updateCommand({ backgroundColor: val } as any)} /></FormField>
                    <FormField label={t('button.textColor')}><ColorInput value={cmd.textColor || '#ffffff'} onChange={val => updateCommand({ textColor: val } as any)} /></FormField>
                </div>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('text.fontSize')}><TextInput type="number" value={cmd.fontSize} onChange={e => updateCommand({ fontSize: parseInt(e.target.value, 10) || 18 } as any)} /></FormField>
                    <FormField label={t('button.fontWeight')}>
                        <Select value={cmd.fontWeight} onChange={e => updateCommand({ fontWeight: e.target.value as 'normal' | 'bold' } as any)}>
                            <option value="normal">{t('text.normal')}</option>
                            <option value="bold">{t('text.bold')}</option>
                        </Select>
                    </FormField>
                </div>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label="Text Align">
                        <Select value={cmd.textAlign || 'center'} onChange={e => updateCommand({ textAlign: e.target.value as 'left' | 'center' | 'right' } as any)}>
                            <option value="left">{t('elementInspector.left', 'Left')}</option>
                            <option value="center">{t('elementInspector.center', 'Center')}</option>
                            <option value="right">{t('elementInspector.right', 'Right')}</option>
                        </Select>
                    </FormField>
                    <FormField label="Text Padding (%)"><TextInput type="number" min={0} max={50} value={cmd.paddingX ?? 0} onChange={e => updateCommand({ paddingX: Math.max(0, parseFloat(e.target.value) || 0) } as any)} /></FormField>
                </div>
                <FormField label={t('button.borderRadius')}><TextInput type="number" value={cmd.borderRadius} onChange={e => updateCommand({ borderRadius: parseInt(e.target.value, 10) || 0 } as any)} /></FormField>
                <FormField label={t('movie.opacity', { value: Math.round((cmd.opacity ?? 1) * 100) })}>
                    <input type="range" min="0" max="1" step="0.01" value={cmd.opacity ?? 1} onChange={e => updateCommand({ opacity: parseFloat(e.target.value) } as any)} className="w-full accent-[var(--accent-lavender)]" />
                </FormField>
            </>;
        case 'media':
            return <>
                <AssetSelector label={t('button.buttonImage')} assetType="images" value={cmd.image?.id || null} allowVideo onChange={id => updateCommand({ image: id ? { type: 'image', id } : null } as any)} />
                <AssetSelector label={t('button.hoverImage')} assetType="images" value={cmd.hoverImage?.id || null} allowVideo onChange={id => updateCommand({ hoverImage: id ? { type: 'image', id } : null } as any)} />
            </>;
        case 'logic': {
            const actions = cmd.actions || [];
            return <>
                <FormField label={t('button.waitForClick')}>
                    <div className="flex items-center gap-1">
                        <input type="checkbox" checked={cmd.waitForClick || false} onChange={e => updateCommand({ waitForClick: e.target.checked } as any)} className="w-4 h-4" />
                        <span className="text-xs text-[var(--text-secondary)]">{t('button.waitForClickHint')}</span>
                    </div>
                </FormField>
                <FormField label={t('button.quickMenuMode')}>
                    <div className="flex items-center gap-1">
                        <input type="checkbox" checked={cmd.quickMenuMode || false} onChange={e => updateCommand({ quickMenuMode: e.target.checked } as any)} className="w-4 h-4" />
                        <span className="text-xs text-[var(--text-secondary)]">{t('button.quickMenuModeHint')}</span>
                    </div>
                </FormField>
                <h4 className="font-bold text-xs mb-1 mt-2 text-[var(--text-secondary)]">{t('button.primaryAction')}</h4>
                <ActionEditor action={cmd.onClick} onActionChange={action => updateCommand({ onClick: action } as any)} />
                <h4 className="font-bold text-xs mb-1 mt-2 text-[var(--text-secondary)]">{t('button.additionalActions')}</h4>
                <div className="space-y-1.5">
                    {actions.map((action, idx) => (
                        <ActionCard key={idx} action={action} index={idx}
                            onActionChange={updated => { const next = [...actions]; next[idx] = updated; updateCommand({ actions: next } as any); }}
                            onRemove={() => updateCommand({ actions: actions.filter((_, i) => i !== idx) } as any)} />
                    ))}
                    <button onClick={() => updateCommand({ actions: [...actions, { type: UIActionType.GoToScreen, targetScreenId: '' } as VNUIAction] } as any)} className="w-full p-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors text-xs">
                        {t('button.addAction')}
                    </button>
                </div>
                <ConditionsEditor collapsible title={t('button.showConditions')} hint={t('button.showConditionsHint')} conditions={cmd.showConditions || []} project={project} onChange={(cs) => updateCommand({ showConditions: cs } as any)} />
            </>;
        }
        case 'animation':
            return <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand as any} />;
        case 'audio':
            return <AssetSelector label={t('button.clickSound')} assetType="audio" value={cmd.clickSound} onChange={id => updateCommand({ clickSound: id } as any)} />;
        default:
            return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// ShowItem (a clickable scene pickup — reuses the button overlay; icon-only)
// ─────────────────────────────────────────────────────────────────────────────
const ShowItemGroup: React.FC<{ groupId: InspectorGroupId; cmd: ShowItemCommand; updateCommand: UpdateCommand; project: VNProject; t: any }> = ({ groupId, cmd, updateCommand, project, t }) => {
    const items = Object.values(project.items || {}) as any[];
    switch (groupId) {
        case 'content':
            return <>
                <FormField label={t('showItem.item')}>
                    <Select value={cmd.itemId || ''} onChange={e => updateCommand({ itemId: e.target.value } as any)}>
                        {items.length === 0 && <option value="">{t('showItem.noItems')}</option>}
                        {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                    </Select>
                </FormField>
                <FormField label={t('showItem.quantity')}><TextInput type="number" min={1} value={cmd.quantity ?? 1} onChange={e => updateCommand({ quantity: Math.max(1, parseInt(e.target.value, 10) || 1) } as any)} /></FormField>
            </>;
        case 'transform':
            return <>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('shared.xPosition')}><TextInput type="number" value={cmd.x} onChange={e => updateCommand({ x: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                    <FormField label={t('shared.yPosition')}><TextInput type="number" value={cmd.y} onChange={e => updateCommand({ y: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                </div>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('shared.widthPercent')}><TextInput type="number" value={cmd.width} onChange={e => updateCommand({ width: parseFloat(e.target.value) || 10 } as any)} /></FormField>
                    <FormField label={t('shared.heightPercent')}><TextInput type="number" value={cmd.height} onChange={e => updateCommand({ height: parseFloat(e.target.value) || 10 } as any)} /></FormField>
                </div>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('button.anchorX')}><TextInput type="number" step="0.1" value={cmd.anchorX} onChange={e => updateCommand({ anchorX: parseFloat(e.target.value) || 0.5 } as any)} /></FormField>
                    <FormField label={t('button.anchorY')}><TextInput type="number" step="0.1" value={cmd.anchorY} onChange={e => updateCommand({ anchorY: parseFloat(e.target.value) || 0.5 } as any)} /></FormField>
                </div>
                <OrientationFields rotation={cmd.rotation} flipX={cmd.flipX} flipY={cmd.flipY} onChange={p => updateCommand(p as any)} />
            </>;
        case 'appearance':
            return <FormField label={t('movie.opacity', { value: Math.round((cmd.opacity ?? 1) * 100) })}>
                <input type="range" min="0" max="1" step="0.01" value={cmd.opacity ?? 1} onChange={e => updateCommand({ opacity: parseFloat(e.target.value) } as any)} className="w-full accent-[var(--accent-lavender)]" />
            </FormField>;
        case 'media':
            return <>
                <AssetSelector label={t('showItem.imageOverride')} assetType="images" value={cmd.image?.id || null} allowVideo onChange={id => updateCommand({ image: id ? { type: 'image', id } : null } as any)} />
                <AssetSelector label={t('button.hoverImage')} assetType="images" value={cmd.hoverImage?.id || null} allowVideo onChange={id => updateCommand({ hoverImage: id ? { type: 'image', id } : null } as any)} />
                <p className="text-[10px] text-[var(--text-muted)] -mt-1">{t('showItem.imageHint')}</p>
            </>;
        case 'logic': {
            const actions = cmd.actions || [];
            return <>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)]">
                    <input type="checkbox" checked={cmd.giveOnClick !== false} onChange={e => updateCommand({ giveOnClick: e.target.checked } as any)} className="w-4 h-4" />
                    {t('showItem.giveOnClick')}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)]">
                    <input type="checkbox" checked={cmd.removeAfterPickup !== false} onChange={e => updateCommand({ removeAfterPickup: e.target.checked } as any)} className="w-4 h-4" />
                    {t('showItem.removeAfterPickup')}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)]">
                    <input type="checkbox" checked={cmd.pickUpOnce !== false} onChange={e => updateCommand({ pickUpOnce: e.target.checked } as any)} className="w-4 h-4" />
                    {t('showItem.pickUpOnce')}
                </label>
                <p className="text-[10px] text-[var(--text-muted)] -mt-1">{t('showItem.pickUpOnceHint')}</p>
                <h4 className="font-bold text-xs mb-1 mt-2 text-[var(--text-secondary)]">{t('button.additionalActions')}</h4>
                <div className="space-y-1.5">
                    {actions.map((action, idx) => (
                        <ActionCard key={idx} action={action} index={idx}
                            onActionChange={updated => { const next = [...actions]; next[idx] = updated; updateCommand({ actions: next } as any); }}
                            onRemove={() => updateCommand({ actions: actions.filter((_, i) => i !== idx) } as any)} />
                    ))}
                    <button onClick={() => updateCommand({ actions: [...actions, { type: UIActionType.GoToScreen, targetScreenId: '' } as VNUIAction] } as any)} className="w-full p-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors text-xs">
                        {t('button.addAction')}
                    </button>
                </div>
                <ConditionsEditor collapsible title={t('button.showConditions')} hint={t('button.showConditionsHint')} conditions={cmd.showConditions || []} project={project} onChange={(cs) => updateCommand({ showConditions: cs } as any)} />
            </>;
        }
        case 'animation':
            return <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand as any} />;
        case 'audio':
            return <AssetSelector label={t('button.clickSound')} assetType="audio" value={cmd.clickSound} onChange={id => updateCommand({ clickSound: id } as any)} />;
        default:
            return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// ShowText
// ─────────────────────────────────────────────────────────────────────────────
const ShowTextGroup: React.FC<{ groupId: InspectorGroupId; cmd: ShowTextCommand; updateCommand: UpdateCommand; t: any }> = ({ groupId, cmd, updateCommand, t }) => {
    switch (groupId) {
        case 'content':
            return <>
                <FormField label={t('text.text')}><TextArea value={cmd.text} onChange={e => updateCommand({ text: e.target.value } as any)} /></FormField>
                <label className="flex items-start gap-2 text-xs mt-1 cursor-pointer">
                    <input type="checkbox" checked={!!cmd.liveText} onChange={e => updateCommand({ liveText: e.target.checked } as any)} className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                        <span className="font-bold text-[var(--text-primary)]">{t('text.liveText')}</span><br />
                        <span className="text-[var(--text-muted)]">{t('text.liveTextDesc')}</span>
                    </span>
                </label>
            </>;
        case 'transform':
            return <>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('shared.xPosition')}><TextInput type="number" value={cmd.x} onChange={e => updateCommand({ x: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                    <FormField label={t('shared.yPosition')}><TextInput type="number" value={cmd.y} onChange={e => updateCommand({ y: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                </div>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('text.maxWidth')}><TextInput type="number" value={cmd.width || ''} onChange={e => updateCommand({ width: e.target.value ? parseInt(e.target.value, 10) : undefined } as any)} /></FormField>
                    <FormField label={t('text.maxHeight')}><TextInput type="number" value={cmd.height || ''} onChange={e => updateCommand({ height: e.target.value ? parseInt(e.target.value, 10) : undefined } as any)} /></FormField>
                </div>
                <OrientationFields rotation={cmd.rotation} flipX={cmd.flipX} flipY={cmd.flipY} onChange={p => updateCommand(p as any)} />
            </>;
        case 'appearance':
            return <>
                <FormField label={t('text.fontFamily')}><TextInput value={cmd.fontFamily} onChange={e => updateCommand({ fontFamily: e.target.value } as any)} placeholder={t('text.fontFamilyPlaceholder')} /></FormField>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('text.fontSize')}><TextInput type="number" value={cmd.fontSize} onChange={e => updateCommand({ fontSize: parseInt(e.target.value, 10) || 16 } as any)} /></FormField>
                    <FormField label={t('shared.color')}><ColorInput value={cmd.color} onChange={val => updateCommand({ color: val } as any)} className="p-1 h-10" /></FormField>
                </div>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('text.weight')}>
                        <Select value={cmd.fontWeight || 'normal'} onChange={e => updateCommand({ fontWeight: e.target.value as any } as any)}>
                            <option value="normal">{t('text.normal')}</option>
                            <option value="bold">{t('text.bold')}</option>
                        </Select>
                    </FormField>
                    <FormField label={t('text.style')}>
                        <Select value={cmd.fontStyle || 'normal'} onChange={e => updateCommand({ fontStyle: e.target.value as any } as any)}>
                            <option value="normal">{t('text.normal')}</option>
                            <option value="italic">{t('text.italic')}</option>
                        </Select>
                    </FormField>
                </div>
                <FormField label={t('text.letterSpacing')}>
                    <TextInput type="number" value={cmd.letterSpacing ?? 0} onChange={e => updateCommand({ letterSpacing: parseFloat(e.target.value) || 0 } as any)} />
                </FormField>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('text.textAlign')}>
                        <Select value={cmd.textAlign || 'left'} onChange={e => updateCommand({ textAlign: e.target.value as any } as any)}>
                            <option value="left">{t('positions.left')}</option>
                            <option value="center">{t('positions.center')}</option>
                            <option value="right">{t('positions.right')}</option>
                        </Select>
                    </FormField>
                    <FormField label={t('text.verticalAlign')}>
                        <Select value={cmd.verticalAlign || 'top'} onChange={e => updateCommand({ verticalAlign: e.target.value as any } as any)}>
                            <option value="top">{t('text.top')}</option>
                            <option value="middle">{t('text.middle')}</option>
                            <option value="bottom">{t('text.bottom')}</option>
                        </Select>
                    </FormField>
                </div>
            </>;
        case 'effects':
            return <>
                <h4 className="font-bold text-xs mb-1 text-[var(--text-secondary)]">{t('text.textShadow')}</h4>
                <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer mb-2">
                    <input type="checkbox" checked={cmd.textShadow?.enabled ?? false} onChange={e => updateCommand({ textShadow: { ...(cmd.textShadow || { offsetX: 2, offsetY: 2, blur: 4, color: '#000000' }), enabled: e.target.checked } } as any)} />
                    {t('text.enableShadow')}
                </label>
                {cmd.textShadow?.enabled && (
                    <>
                        <div className="grid grid-cols-2 gap-1">
                            <FormField label={t('text.xOffset')}><TextInput type="number" value={cmd.textShadow.offsetX} onChange={e => updateCommand({ textShadow: { ...cmd.textShadow!, offsetX: parseFloat(e.target.value) || 0 } } as any)} /></FormField>
                            <FormField label={t('text.yOffset')}><TextInput type="number" value={cmd.textShadow.offsetY} onChange={e => updateCommand({ textShadow: { ...cmd.textShadow!, offsetY: parseFloat(e.target.value) || 0 } } as any)} /></FormField>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                            <FormField label={t('text.blur')}><TextInput type="number" value={cmd.textShadow.blur} onChange={e => updateCommand({ textShadow: { ...cmd.textShadow!, blur: parseFloat(e.target.value) || 0 } } as any)} /></FormField>
                            <FormField label={t('text.shadowColor')}><ColorInput value={cmd.textShadow.color} onChange={val => updateCommand({ textShadow: { ...cmd.textShadow!, color: val } } as any)} className="p-1 h-10" /></FormField>
                        </div>
                    </>
                )}
                <hr className="border-[var(--border-subtle)] my-2" />
                <h4 className="font-bold text-xs mb-1 text-[var(--text-secondary)]">{t('text.textGradient')}</h4>
                <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer mb-2">
                    <input type="checkbox" checked={cmd.textGradient?.enabled ?? false} onChange={e => updateCommand({ textGradient: { ...(cmd.textGradient || { type: 'linear', angle: 90, colors: ['#ff00a5', '#8a2be2'] }), enabled: e.target.checked } } as any)} />
                    {t('text.enableGradient')}
                </label>
                {cmd.textGradient?.enabled && (
                    <>
                        <div className="grid grid-cols-2 gap-1">
                            <FormField label={t('text.type')}>
                                <Select value={cmd.textGradient.type} onChange={e => updateCommand({ textGradient: { ...cmd.textGradient!, type: e.target.value as any } } as any)}>
                                    <option value="linear">{t('text.linear')}</option>
                                    <option value="radial">{t('text.radial')}</option>
                                </Select>
                            </FormField>
                            {cmd.textGradient.type === 'linear' && (
                                <FormField label={t('text.angle')}><TextInput type="number" value={cmd.textGradient.angle} onChange={e => updateCommand({ textGradient: { ...cmd.textGradient!, angle: parseInt(e.target.value, 10) || 0 } } as any)} /></FormField>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                            <FormField label={t('text.color1')}><ColorInput value={cmd.textGradient.colors[0] || '#ff00a5'} onChange={val => { const c = [...(cmd.textGradient!.colors)]; c[0] = val; updateCommand({ textGradient: { ...cmd.textGradient!, colors: c } } as any); }} className="p-1 h-10" /></FormField>
                            <FormField label={t('text.color2')}><ColorInput value={cmd.textGradient.colors[1] || '#8a2be2'} onChange={val => { const c = [...(cmd.textGradient!.colors)]; c[1] = val; updateCommand({ textGradient: { ...cmd.textGradient!, colors: c } } as any); }} className="p-1 h-10" /></FormField>
                        </div>
                    </>
                )}
                <hr className="border-[var(--border-subtle)] my-2" />
                <h4 className="font-bold text-xs mb-1 text-[var(--text-secondary)]">{t('text.textBorder')}</h4>
                <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer mb-2">
                    <input type="checkbox" checked={cmd.textBorder?.enabled ?? false} onChange={e => updateCommand({ textBorder: { ...(cmd.textBorder || { width: 1, color: '#000000' }), enabled: e.target.checked } } as any)} />
                    {t('text.enableBorder')}
                </label>
                {cmd.textBorder?.enabled && (
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('text.borderWidth')}><TextInput type="number" min="0" step="0.1" value={cmd.textBorder.width} onChange={e => updateCommand({ textBorder: { ...cmd.textBorder!, width: parseFloat(e.target.value) || 0 } } as any)} /></FormField>
                        <FormField label={t('text.borderColor')}><ColorInput value={cmd.textBorder.color} onChange={val => updateCommand({ textBorder: { ...cmd.textBorder!, color: val } } as any)} className="p-1 h-10" /></FormField>
                    </div>
                )}
            </>;
        case 'animation':
            return <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand as any} />;
        default:
            return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// ShowImage
// ─────────────────────────────────────────────────────────────────────────────
const ShowImageGroup: React.FC<{ groupId: InspectorGroupId; cmd: ShowImageCommand; updateCommand: UpdateCommand; t: any }> = ({ groupId, cmd, updateCommand, t }) => {
    switch (groupId) {
        case 'content':
            return <AssetSelector label={t('image.image')} assetType="images" value={cmd.imageId} onChange={id => updateCommand({ imageId: id || '' } as any)} allowVideo />;
        case 'transform':
            return <>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('shared.xPosition')}><TextInput type="number" value={cmd.x} onChange={e => updateCommand({ x: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                    <FormField label={t('shared.yPosition')}><TextInput type="number" value={cmd.y} onChange={e => updateCommand({ y: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                </div>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('shared.widthPx')}><TextInput type="number" value={cmd.width} onChange={e => updateCommand({ width: parseInt(e.target.value, 10) || 0 } as any)} /></FormField>
                    <FormField label={t('shared.heightPx')}><TextInput type="number" value={cmd.height} onChange={e => updateCommand({ height: parseInt(e.target.value, 10) || 0 } as any)} /></FormField>
                </div>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('shared.scaleX')}><TextInput type="number" step="0.1" value={cmd.scaleX ?? 1} onChange={e => updateCommand({ scaleX: parseFloat(e.target.value) || 1 } as any)} /></FormField>
                    <FormField label={t('shared.scaleY')}><TextInput type="number" step="0.1" value={cmd.scaleY ?? 1} onChange={e => updateCommand({ scaleY: parseFloat(e.target.value) || 1 } as any)} /></FormField>
                </div>
                <OrientationFields rotation={cmd.rotation} flipX={cmd.flipX} flipY={cmd.flipY} onChange={p => updateCommand(p as any)} />
            </>;
        case 'appearance':
            return <>
                <FormField label={t('image.opacity', { value: cmd.opacity })}>
                    <input type="range" min="0" max="1" step="0.01" value={cmd.opacity} onChange={e => updateCommand({ opacity: parseFloat(e.target.value) } as any)} className="w-full" />
                </FormField>
                <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs text-[var(--text-secondary)]">
                    <input type="checkbox" checked={!!cmd.fitToContent} onChange={e => updateCommand({ fitToContent: e.target.checked || undefined } as any)} className="cursor-pointer" />
                    {t('image.fitToContent')}
                </label>
            </>;
        case 'animation':
            return <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand as any} />;
        default:
            return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// ShowCharacter
// ─────────────────────────────────────────────────────────────────────────────
const ShowCharacterGroup: React.FC<{ groupId: InspectorGroupId; cmd: ShowCharacterCommand; updateCommand: UpdateCommand; project: VNProject; t: any }> = ({ groupId, cmd, updateCommand, project, t }) => {
    const character = project.characters[cmd.characterId];
    switch (groupId) {
        case 'content': {
            const characterOptions = Object.values(project.characters).map((c: any) => ({ value: c.id, label: c.name }));
            const expressionOptions = character ? Object.values(character.expressions).map((e: any) => ({ value: e.id, label: e.name })) : [];
            return <>
                <FormField label={t('shared.character')}>
                    <SearchableSelect options={characterOptions} value={cmd.characterId}
                        onChange={value => { const nc = project.characters[value]; const fe = nc ? Object.keys(nc.expressions)[0] : ''; updateCommand({ characterId: value, expressionId: fe || '' } as any); }}
                        placeholder={Object.keys(project.characters).length === 0 ? t('shared.noCharacters') : t('shared.selectCharacter')} />
                </FormField>
                <FormField label={t('shared.expression')}>
                    <SearchableSelect options={expressionOptions} value={cmd.expressionId}
                        onChange={value => updateCommand({ expressionId: value } as any)}
                        placeholder={(!character || Object.keys(character.expressions).length === 0) ? t('shared.noExpressions') : t('shared.selectExpression')} />
                </FormField>
            </>;
        }
        case 'transform': {
            const isSlide = cmd.transition === 'slide';
            return <>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)]">
                    <input type="checkbox" checked={!!cmd.keepPosition} onChange={e => updateCommand({ keepPosition: e.target.checked || undefined } as any)} className="cursor-pointer" />
                    {t('character.keepPosition')}
                </label>
                {cmd.keepPosition
                    ? <p className="text-[11px] text-[var(--text-muted)] -mt-1">{t('character.keepPositionHint')}</p>
                    : (isSlide ? <>
                        <PositionInputs label={t('shared.startPosition')} position={cmd.startPosition || cmd.position} onChange={pos => updateCommand({ startPosition: pos } as any)} />
                        <PositionInputs label={t('shared.endPosition')} position={cmd.endPosition || cmd.position} onChange={pos => updateCommand({ endPosition: pos } as any)} />
                    </> : (
                        <PositionInputs label={t('shared.position')} position={cmd.position} onChange={pos => updateCommand({ position: pos } as any)} />
                    ))}
                <FormField label={t('shared.scale')}>
                    <div className="flex items-center gap-2">
                        <input type="range" min="0.1" max="3" step="0.05" value={cmd.scale ?? 1} onChange={e => updateCommand({ scale: parseFloat(e.target.value) } as any)} className="flex-1" />
                        <TextInput type="number" min="0.1" max="5" step="0.05" value={cmd.scale ?? 1} onChange={e => updateCommand({ scale: parseFloat(e.target.value) || 1 } as any)} style={{ width: '60px' }} />
                    </div>
                </FormField>
                <OrientationFields rotation={cmd.rotation} flipX={cmd.inverted} flipY={cmd.flipY} flipXLabel={t('character.mirrorSprite')}
                    onChange={p => { const patch: any = {}; if ('rotation' in p) patch.rotation = p.rotation; if ('flipX' in p) patch.inverted = p.flipX; if ('flipY' in p) patch.flipY = p.flipY; updateCommand(patch); }} />
            </>;
        }
        case 'effects':
            return <CharacterVisualEffectsEditor cmd={cmd} updateCommand={updateCommand} />;
        case 'animation':
            return <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand as any} />;
        default:
            return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// SetBackground
// ─────────────────────────────────────────────────────────────────────────────
const SetBackgroundGroup: React.FC<{ groupId: InspectorGroupId; cmd: any; updateCommand: UpdateCommand; project: VNProject; t: any }> = ({ groupId, cmd, updateCommand, project, t }) => {
    if (groupId === 'content') {
        const useColor = !!cmd.backgroundColor;
        const options: { value: string; label: string; group?: string }[] = [
            ...Object.values(project.backgrounds).map((b: any) => ({ value: b.id, label: b.name, group: 'Backgrounds' })),
            ...Object.values(project.images).map((img: any) => ({ value: img.id, label: img.name, group: 'Images' })),
            // Videos uploaded under the Videos tab can also be used as a (video) background.
            ...Object.values(project.videos || {}).map((v: any) => ({ value: v.id, label: v.name, group: 'Videos' })),
        ];
        return <>
            <FormField label={t('background.type')}>
                <Select value={useColor ? 'color' : 'image'} onChange={e => updateCommand({ backgroundColor: e.target.value === 'color' ? (cmd.backgroundColor || '#1a102c') : undefined } as any)}>
                    <option value="image">{t('background.imageVideo')}</option>
                    <option value="color">{t('background.solidColor')}</option>
                </Select>
            </FormField>
            {useColor ? (
                <FormField label={t('background.color')}>
                    <ColorInput value={cmd.backgroundColor} onChange={val => updateCommand({ backgroundColor: val } as any)} className="p-1 h-10" />
                </FormField>
            ) : (
                <FormField label={t('background.background')}>
                    <SearchableSelect options={options} value={cmd.backgroundId} onChange={(v) => updateCommand({ backgroundId: v } as any)} placeholder={t('background.background')} />
                </FormField>
            )}
            {!useColor && (
                <label className="flex items-center gap-2 mt-1 cursor-pointer text-xs text-[var(--text-secondary)]">
                    <input type="checkbox" checked={cmd.loop ?? true} onChange={e => updateCommand({ loop: e.target.checked } as any)} className="w-4 h-4" />
                    <span>Loop video <span className="text-[10px]">(videos only; off = play once &amp; hold last frame)</span></span>
                </label>
            )}
            {/* Parallax depth: drifts the backdrop (slower than foreground visuals). Applies to
                both the base background and stacked planes. */}
            <ParallaxDepthControl value={cmd.parallaxDepth} onChange={n => updateCommand({ parallaxDepth: n } as any)} />
            {/* Stack toggle: keep multiple backdrops instead of replacing, for multi-plane parallax. */}
            <label className="flex items-start gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={!!cmd.stack} onChange={e => updateCommand({ stack: e.target.checked || undefined } as any)} className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-[var(--text-secondary)]">
                    <span className="font-bold text-[var(--text-primary)]">Stack (don't replace)</span><br />
                    Add this as its own backdrop plane instead of replacing the current background — stack several at different layers/depths to build a parallax-scrolling scene.
                </span>
            </label>
            {cmd.stack && (
                <FormField label={`Layer: ${cmd.layer ?? 0}`}>
                    <div className="flex items-center gap-1">
                        <button type="button" title="Send this plane back a layer"
                            onClick={() => updateCommand({ layer: (cmd.layer ?? 0) - 1 || undefined } as any)}
                            className="px-2 py-0.5 text-xs rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)]">↓</button>
                        <TextInput type="number" step="1" value={cmd.layer ?? 0}
                            onChange={e => { const v = parseInt(e.target.value, 10); updateCommand({ layer: Number.isNaN(v) ? undefined : (v || undefined) } as any); }}
                            style={{ width: '64px', textAlign: 'center' }} />
                        <button type="button" title="Bring this plane forward a layer"
                            onClick={() => updateCommand({ layer: (cmd.layer ?? 0) + 1 || undefined } as any)}
                            className="px-2 py-0.5 text-xs rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)]">↑</button>
                    </div>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Stacking order of this plane (default 0 = just above the base background). Stage visuals sit at higher bands (text ≈1, movies ≈2, characters ≈5) — raise this to put the plane in front of them, lower (negative) to push it further back.</p>
                </FormField>
            )}
        </>;
    }
    if (groupId === 'animation') return <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand as any} />;
    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Audio commands (PlayMusic / StopMusic / PlaySoundEffect / StopSoundEffect)
// ─────────────────────────────────────────────────────────────────────────────
const AudioCmdGroup: React.FC<{ groupId: InspectorGroupId; command: VNCommand; updateCommand: UpdateCommand; project: VNProject; t: any }> = ({ groupId, command, updateCommand, project, t }) => {
    if (groupId !== 'audio') return null;
    const cmd = command as any;
    const trackPicker = (
        <FormField label={t('audio.audioTrack')}>
            <Select value={cmd.audioId} onChange={e => updateCommand({ audioId: e.target.value } as any)}>
                {Object.keys(project.audio).length === 0 && <option disabled>{t('audio.noAudio')}</option>}
                {Object.values(project.audio).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
        </FormField>
    );
    const volume = (
        <FormField label={`Volume: ${Math.round((cmd.volume ?? 1) * 100)}%`}>
            <input type="range" min="0" max="100" value={Math.round((cmd.volume ?? 1) * 100)} onChange={e => updateCommand({ volume: parseInt(e.target.value) / 100 } as any)} className="w-full accent-[var(--accent-lavender)]" />
        </FormField>
    );
    switch (command.type) {
        case CommandType.PlayMusic:
            return <>
                {trackPicker}
                {volume}
                <FormField label={t('audio.fadeDurationSec')}><TextInput type="number" min="0" step="0.1" value={cmd.fadeDuration} onChange={e => updateCommand({ fadeDuration: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)] cursor-pointer"><input type="checkbox" checked={cmd.loop} onChange={e => updateCommand({ loop: e.target.checked } as any)} /> {t('audio.loop')}</label>
            </>;
        case CommandType.StopMusic:
            return <FormField label={t('audio.fadeDurationSec')}><TextInput type="number" min="0" step="0.1" value={cmd.fadeDuration} onChange={e => updateCommand({ fadeDuration: parseFloat(e.target.value) || 0 } as any)} /></FormField>;
        case CommandType.PlaySoundEffect:
            return <>
                {trackPicker}
                {volume}
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer"><input type="checkbox" checked={!!cmd.loop} onChange={e => updateCommand({ loop: e.target.checked } as any)} /> <span>{t('audio.loop')}</span></label>
            </>;
        case CommandType.StopSoundEffect:
            return <>
                <FormField label={t('audio.targetSound')}>
                    <Select value={cmd.audioId || ''} onChange={e => updateCommand({ audioId: e.target.value } as any)}>
                        <option value="">{t('audio.allSounds')}</option>
                        {Object.values(project.audio).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select>
                </FormField>
                <FormField label={t('audio.fadeOutSec')}><TextInput type="number" min="0" step="0.1" value={cmd.fadeDuration ?? 0} onChange={e => updateCommand({ fadeDuration: parseFloat(e.target.value) || 0 } as any)} /></FormField>
            </>;
        default:
            return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// SetVariable
// ─────────────────────────────────────────────────────────────────────────────
const SetVariableGroup: React.FC<{ groupId: InspectorGroupId; cmd: any; updateCommand: UpdateCommand; project: VNProject; t: any }> = ({ groupId, cmd, updateCommand, project, t }) => {
    if (groupId !== 'logic') return null;
    const variable = project.variables[cmd.variableId];
    return <>
        <FormField label={t('vars.variable')}>
            <Select value={cmd.variableId} onChange={e => {
                const newVar = project.variables[e.target.value];
                let op = cmd.operator;
                if (newVar?.type !== 'number' && (op === 'add' || op === 'subtract' || op === 'random')) op = 'set';
                updateCommand({ variableId: e.target.value, operator: op } as any);
            }}>
                {Object.keys(project.variables).length === 0 && <option disabled>{t('vars.noVariables')}</option>}
                {Object.values(project.variables).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
        </FormField>
        <FormField label={t('vars.operator')}>
            <Select value={cmd.operator} onChange={e => updateCommand({ operator: e.target.value as any } as any)}>
                <option value="set">{t('vars.set')}</option>
                {variable?.type === 'number' && <option value="add">{t('vars.add')}</option>}
                {variable?.type === 'number' && <option value="subtract">{t('vars.subtract')}</option>}
                {variable?.type === 'number' && <option value="random">{t('vars.random')}</option>}
            </Select>
        </FormField>
        {cmd.operator === 'random' && variable?.type === 'number' ? (
            <div className="grid grid-cols-2 gap-1">
                <FormField label={t('vars.minValue')}><TextInput type="number" value={String(cmd.randomMin ?? 0)} onChange={e => updateCommand({ randomMin: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                <FormField label={t('vars.maxValue')}><TextInput type="number" value={String(cmd.randomMax ?? 100)} onChange={e => updateCommand({ randomMax: parseFloat(e.target.value) || 100 } as any)} /></FormField>
            </div>
        ) : (
            <FormField label={t('vars.value')}>
                {variable?.type === 'boolean' ? (
                    <Select value={String(cmd.value)} onChange={e => updateCommand({ value: e.target.value === 'true' } as any)}>
                        <option value="true">{resolveBoolLabels(variable, t('vars.true'), t('vars.false')).yes}</option>
                        <option value="false">{resolveBoolLabels(variable, t('vars.true'), t('vars.false')).no}</option>
                    </Select>
                ) : variable?.type === 'number' ? (
                    <TextInput type="number" value={String(cmd.value)} onChange={e => updateCommand({ value: e.target.value } as any)} />
                ) : (
                    <TextInput value={String(cmd.value)} onChange={e => updateCommand({ value: e.target.value } as any)} />
                )}
            </FormField>
        )}
        <SetVariablePreview variable={variable} operator={cmd.operator} value={cmd.value} randomMin={cmd.randomMin} randomMax={cmd.randomMax} />
    </>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Screen effects + ShowScreen + Label/JumpToLabel (all are Content + Conditions)
// ─────────────────────────────────────────────────────────────────────────────
const ScreenMiscGroup: React.FC<{ groupId: InspectorGroupId; command: VNCommand; updateCommand: UpdateCommand; project: VNProject; t: any }> = ({ groupId, command, updateCommand, project, t }) => {
    if (groupId !== 'content') return null;
    const cmd = command as any;
    switch (command.type) {
        case CommandType.ShakeScreen: {
            const persistent = cmd.duration === 0;
            return <>
                <FormField label={t('screen.intensity', { value: cmd.intensity })}>
                    <input type="range" min="1" max="10" value={cmd.intensity} onChange={e => updateCommand({ intensity: parseInt(e.target.value, 10) } as any)} className="w-full accent-[var(--accent-lavender)]" />
                </FormField>
                <FormField label={t('screen.duration')}>
                    <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={persistent} onChange={e => updateCommand({ duration: e.target.checked ? 0 : 0.5 } as any)} /><span className="text-xs text-[var(--text-primary)]">{t('screen.persistentShake')}</span></label>
                    {!persistent && <TextInput type="number" min="0.1" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0.1 } as any)} />}
                </FormField>
                {persistent && <p className="text-xs text-amber-400/80">{t('screen.shakeWarning')}</p>}
            </>;
        }
        case CommandType.TintScreen:
            return <>
                <FormField label={t('screen.tintColor')}><TextInput type="text" value={cmd.color} onChange={e => updateCommand({ color: e.target.value } as any)} /></FormField>
                <FormField label={t('shared.durationSec')}><TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 } as any)} /></FormField>
            </>;
        case CommandType.PanZoomScreen:
            return <>
                <FormField label={t('screen.zoom', { value: cmd.zoom })}><input type="range" min="0.1" max="5" step="0.1" value={cmd.zoom} onChange={e => updateCommand({ zoom: parseFloat(e.target.value) } as any)} className="w-full accent-[var(--accent-lavender)]" /></FormField>
                <FormField label={t('screen.panX', { value: cmd.panX })}><input type="range" min="-100" max="100" value={cmd.panX} onChange={e => updateCommand({ panX: parseInt(e.target.value, 10) } as any)} className="w-full accent-[var(--accent-lavender)]" /></FormField>
                <FormField label={t('screen.panY', { value: cmd.panY })}><input type="range" min="-100" max="100" value={cmd.panY} onChange={e => updateCommand({ panY: parseInt(e.target.value, 10) } as any)} className="w-full accent-[var(--accent-lavender)]" /></FormField>
                <FormField label={t('shared.durationSec')}><TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 } as any)} /></FormField>
            </>;
        case CommandType.ResetScreenEffects:
            return <FormField label={t('shared.durationSec')}><TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 } as any)} /></FormField>;
        case CommandType.FlashScreen:
            return <>
                <FormField label={t('screen.flashColor')}><TextInput type="text" value={cmd.color} onChange={e => updateCommand({ color: e.target.value } as any)} /></FormField>
                <FormField label={t('shared.durationSec')}><TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 } as any)} /></FormField>
            </>;
        case CommandType.Lightning: {
            const audioOpts = Object.values(project.audio || {}) as any[];
            return <>
                <FormField label="Flash color"><TextInput type="text" value={cmd.color ?? '#EAF2FF'} onChange={e => updateCommand({ color: e.target.value } as any)} /></FormField>
                <FormField label={`Brightness ${Math.round((cmd.intensity ?? 0.9) * 100)}%`}>
                    <input type="range" min="0.1" max="1" step="0.05" value={cmd.intensity ?? 0.9} onChange={e => updateCommand({ intensity: parseFloat(e.target.value) } as any)} className="w-full accent-[var(--accent-lavender)]" />
                </FormField>
                <FormField label="Duration (s)"><TextInput type="number" min="0.1" step="0.1" value={cmd.duration ?? 0.7} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0.7 } as any)} /></FormField>
                <FormField label="Flashes">
                    <Select value={String(cmd.flashes ?? 2)} onChange={e => updateCommand({ flashes: parseInt(e.target.value, 10) } as any)}>
                        <option value="1">Single strike</option>
                        <option value="2">Double flicker</option>
                        <option value="3">Stormy (triple)</option>
                    </Select>
                </FormField>
                <FormField label="Thunder SFX">
                    <Select value={cmd.thunderSfxId || ''} onChange={e => updateCommand({ thunderSfxId: e.target.value || null } as any)}>
                        <option value="">None</option>
                        {audioOpts.map(a => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                    </Select>
                </FormField>
                <FormField label="Thunder delay (s)"><TextInput type="number" min="0" step="0.1" value={cmd.thunderDelay ?? 0.6} onChange={e => updateCommand({ thunderDelay: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                <label className="flex items-center gap-2 my-1"><input type="checkbox" checked={cmd.affectsDialogue !== false} onChange={e => updateCommand({ affectsDialogue: e.target.checked } as any)} /><span className="text-xs text-[var(--text-primary)]">Flash the dialogue box too</span></label>
                <p className="text-xs text-[var(--text-secondary)]">Light first, then a short delay, then thunder — increase the delay for a more distant storm.</p>
            </>;
        }
        case CommandType.Fireworks: {
            const audioOpts = Object.values(project.audio || {}) as any[];
            const fwColors: string[] = (cmd.colors && cmd.colors.length) ? cmd.colors : [];
            const setColors = (arr: string[]) => updateCommand({ colors: arr } as any);
            const fwPresets: Record<string, string[]> = {
                Festive: ['#ff3b3b', '#ffd23b', '#3bff6b', '#3b9bff', '#ff7bef'],
                Warm: ['#ff5e3b', '#ffae3b', '#ffd23b', '#fff1a8'],
                Cool: ['#3b9bff', '#6b5bff', '#3bffd2', '#b0e0ff'],
                Gold: ['#ffd23b', '#ffae3b', '#fff1a8'],
                'Red & Green': ['#ff3b3b', '#3bff6b'],
            };
            const fwBtn = "px-2 py-0.5 rounded text-[10px] font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/50";
            return <>
                <FormField label="Burst colors">
                    <div className="space-y-1.5">
                        <div className="flex flex-wrap gap-1">
                            {Object.keys(fwPresets).map(name => <button key={name} onClick={() => setColors(fwPresets[name])} className={fwBtn}>{name}</button>)}
                            <button onClick={() => setColors([])} className={fwBtn} title="Random festive colors">Festive mix</button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 items-center">
                            {fwColors.map((c, i) => (
                                <div key={i} className="relative">
                                    <ColorInput value={c} onChange={(val: string) => setColors(fwColors.map((x, idx) => idx === i ? val : x))} className="w-8 h-8 p-0.5" />
                                    <button onClick={() => setColors(fwColors.filter((_, idx) => idx !== i))} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] leading-none flex items-center justify-center" title="Remove color">×</button>
                                </div>
                            ))}
                            <button onClick={() => setColors([...fwColors, '#ffd23b'])} className={fwBtn}>+ Color</button>
                        </div>
                        {fwColors.length === 0 && <p className="text-[11px] text-[var(--text-secondary)]">Using a random festive mix. Pick a preset above, or add your own colors.</p>}
                    </div>
                </FormField>
                <FormField label="Bursts"><TextInput type="number" min="1" max="20" value={cmd.bursts ?? 3} onChange={e => updateCommand({ bursts: Math.max(1, parseInt(e.target.value, 10) || 3) } as any)} /></FormField>
                <FormField label={`Burst height ${Math.round((cmd.burstHeight ?? 0.7) * 100)}%`}><input type="range" min="0.1" max="1" step="0.05" value={cmd.burstHeight ?? 0.7} onChange={e => updateCommand({ burstHeight: parseFloat(e.target.value) } as any)} className="w-full accent-[var(--accent-lavender)]" /></FormField>
                <FormField label="Duration (s)"><TextInput type="number" min="0.5" step="0.1" value={cmd.duration ?? 2.5} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 2.5 } as any)} /></FormField>
                <FormField label={`Brightness ${Math.round((cmd.intensity ?? 1) * 100)}%`}><input type="range" min="0.2" max="1" step="0.05" value={cmd.intensity ?? 1} onChange={e => updateCommand({ intensity: parseFloat(e.target.value) } as any)} className="w-full accent-[var(--accent-lavender)]" /></FormField>
                <FormField label="Boom SFX">
                    <Select value={cmd.sfxId || ''} onChange={e => updateCommand({ sfxId: e.target.value || null } as any)}>
                        <option value="">None</option>
                        {audioOpts.map(a => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                    </Select>
                </FormField>
                <FormField label="Boom delay (s)"><TextInput type="number" min="0" step="0.1" value={cmd.sfxDelay ?? 0.3} onChange={e => updateCommand({ sfxDelay: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                <label className="flex items-center gap-2 my-1"><input type="checkbox" checked={cmd.sfxPerBurst === true} onChange={e => updateCommand({ sfxPerBurst: e.target.checked } as any)} /><span className="text-xs text-[var(--text-primary)]">Play the boom on every burst</span></label>
                <label className="flex items-center gap-2 my-1"><input type="checkbox" checked={cmd.affectsDialogue !== false} onChange={e => updateCommand({ affectsDialogue: e.target.checked } as any)} /><span className="text-xs text-[var(--text-primary)]">Show over the dialogue box</span></label>
                <p className="text-xs text-[var(--text-secondary)]">A one-shot burst of fireworks. Stack or sequence several for a longer show. For ambient looping fireworks, use Screen Overlay Effect → Fireworks instead.</p>
            </>;
        }
        case CommandType.PlaceLights: {
            const lights: any[] = cmd.lights || [];
            const addLight = (lType: 'candle' | 'star' | 'christmas') => {
                const n = lights.length;
                const nl: any = {
                    id: `light-${Math.random().toString(36).slice(2, 9)}`,
                    type: lType,
                    x: 25 + (n * 9) % 50,
                    y: 30 + (n * 7) % 35,
                    size: 1, brightness: 1, twinkleSpeed: 1,
                };
                if (lType === 'christmas') { nl.color = '#ff3b3b'; nl.twinkle = 'fade'; }
                if (lType === 'star') { nl.color = '#ffffff'; }
                updateCommand({ lights: [...lights, nl] } as any);
            };
            const updateLight = (i: number, patch: any) => updateCommand({ lights: lights.map((l, idx) => idx === i ? { ...l, ...patch } : l) } as any);
            const removeLight = (i: number) => updateCommand({ lights: lights.filter((_, idx) => idx !== i) } as any);
            const btnCls = "px-2 py-1 rounded text-[11px] font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/50";
            return <>
                <div className="flex gap-1 flex-wrap mb-1">
                    <button onClick={() => addLight('candle')} className={btnCls}>+ Candle</button>
                    <button onClick={() => addLight('star')} className={btnCls}>+ Star</button>
                    <button onClick={() => addLight('christmas')} className={btnCls}>+ Christmas</button>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">Drag each light into place on the scene preview, or set its position below. Scatter bulbs for a tree, or line them up for a string.</p>
                {lights.length === 0 && <p className="text-xs text-[var(--text-secondary)] italic mt-1">No lights yet — add one above.</p>}
                {lights.map((l, i) => (
                    <div key={l.id} className="border border-[var(--border-subtle)] rounded p-2 my-1 space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold capitalize text-[var(--text-primary)]">{l.type} #{i + 1}</span>
                            <button onClick={() => removeLight(i)} className="text-red-400 text-[11px] hover:underline">Remove</button>
                        </div>
                        {l.type !== 'candle' && <FormField label="Color"><TextInput type="text" value={l.color || (l.type === 'star' ? '#ffffff' : '#ff3b3b')} onChange={e => updateLight(i, { color: e.target.value })} /></FormField>}
                        {l.type === 'christmas' && <FormField label="Twinkle"><Select value={l.twinkle || 'fade'} onChange={e => updateLight(i, { twinkle: e.target.value })}><option value="steady">Steady</option><option value="fade">Fade</option><option value="blink">Blink</option><option value="chase">Chase</option></Select></FormField>}
                        <FormField label={`Size ${(l.size ?? 1).toFixed(1)}×`}><input type="range" min="0.4" max="3" step="0.1" value={l.size ?? 1} onChange={e => updateLight(i, { size: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" /></FormField>
                        <FormField label={`Twinkle speed ${(l.twinkleSpeed ?? 1).toFixed(1)}×`}><input type="range" min="0.2" max="3" step="0.1" value={l.twinkleSpeed ?? 1} onChange={e => updateLight(i, { twinkleSpeed: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" /></FormField>
                        <FormField label={`Brightness ${Math.round((l.brightness ?? 1) * 100)}%`}><input type="range" min="0.2" max="1" step="0.05" value={l.brightness ?? 1} onChange={e => updateLight(i, { brightness: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" /></FormField>
                        <FormField label="Position (x%, y%)">
                            <div className="flex gap-1">
                                <TextInput type="number" value={Math.round(l.x ?? 0)} onChange={e => updateLight(i, { x: parseFloat(e.target.value) || 0 })} />
                                <TextInput type="number" value={Math.round(l.y ?? 0)} onChange={e => updateLight(i, { y: parseFloat(e.target.value) || 0 })} />
                            </div>
                        </FormField>
                    </div>
                ))}
                <label className="flex items-center gap-2 my-1"><input type="checkbox" checked={cmd.aboveCharacters === true} onChange={e => updateCommand({ aboveCharacters: e.target.checked } as any)} /><span className="text-xs text-[var(--text-primary)]">Show in front of characters</span></label>
            </>;
        }
        case CommandType.ClearLights: {
            return <p className="text-xs text-[var(--text-secondary)]">Removes all placed lights from the scene.</p>;
        }
        case CommandType.Flashlight: {
            const audioOpts = Object.values(project.audio || {}) as any[];
            return <>
                <FormField label="Flashlight">
                    <Select value={cmd.enabled ? 'on' : 'off'} onChange={e => updateCommand({ enabled: e.target.value === 'on' } as any)}>
                        <option value="on">Turn on</option>
                        <option value="off">Turn off</option>
                    </Select>
                </FormField>
                {cmd.enabled && <>
                    <FormField label={`Light radius ${cmd.radius ?? 22}%`}><input type="range" min="8" max="60" value={cmd.radius ?? 22} onChange={e => updateCommand({ radius: parseInt(e.target.value, 10) } as any)} className="w-full accent-[var(--accent-lavender)]" /></FormField>
                    <FormField label={`Edge softness ${Math.round((cmd.softness ?? 0.6) * 100)}%`}><input type="range" min="0" max="1" step="0.05" value={cmd.softness ?? 0.6} onChange={e => updateCommand({ softness: parseFloat(e.target.value) } as any)} className="w-full accent-[var(--accent-lavender)]" /></FormField>
                    <FormField label={`Darkness ${Math.round((cmd.darkness ?? 0.85) * 100)}%`}><input type="range" min="0.2" max="1" step="0.05" value={cmd.darkness ?? 0.85} onChange={e => updateCommand({ darkness: parseFloat(e.target.value) } as any)} className="w-full accent-[var(--accent-lavender)]" /></FormField>
                    <FormField label="Dark color"><TextInput type="text" value={cmd.color ?? '#000000'} onChange={e => updateCommand({ color: e.target.value } as any)} /></FormField>
                    <FormField label="Player toggle key (optional)"><TextInput type="text" value={cmd.toggleKey ?? ''} onChange={e => updateCommand({ toggleKey: e.target.value || undefined } as any)} placeholder="e.g. f" maxLength={1} /></FormField>
                    <FormField label="Sound on toggle (optional)">
                        <Select value={cmd.sfxId || ''} onChange={e => updateCommand({ sfxId: e.target.value || null } as any)}>
                            <option value="">None</option>
                            {audioOpts.map(a => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                        </Select>
                    </FormField>
                    <label className="flex items-center gap-2 my-1"><input type="checkbox" checked={cmd.affectsDialogue !== false} onChange={e => updateCommand({ affectsDialogue: e.target.checked } as any)} /><span className="text-xs text-[var(--text-primary)]">Dim the dialogue box too</span></label>
                    <label className="flex items-center gap-2 my-1"><input type="checkbox" checked={cmd.darkWhenOff === true} onChange={e => updateCommand({ darkWhenOff: e.target.checked } as any)} /><span className="text-xs text-[var(--text-primary)]">Keep the screen dark when switched off (dark room)</span></label>
                    <p className="text-xs text-[var(--text-secondary)]">The lit circle follows the cursor. Untick "Dim the dialogue box" to keep it readable above the dark. With "Keep the screen dark when off", pressing the toggle key plunges the room into black instead of revealing it — end it with a "Flashlight → Turn off" command (it also clears on scene change).</p>
                </>}
            </>;
        }
        case CommandType.SetScreenOverlayEffect: {
            const effectType = cmd.effectType as string;
            const intensity = typeof cmd.intensity === 'number' ? cmd.intensity : 0;
            const supportsColor = ['sunbeams', 'shimmer', 'rain', 'snowAsh', 'fog', 'haze', 'smoke', 'fireworks'].includes(effectType) || !!pluginManager.getEffect(effectType);
            const defaultColors: Record<string, string> = { sunbeams: '#FFDC8C', shimmer: '#FFFFFF', rain: '#B4D2FF', snowAsh: '#FFFFFF', fog: '#CDD2D8', haze: '#E1DED2', smoke: '#46484C', fireworks: '#FFD23B' };
            const effectColor = cmd.color || defaultColors[effectType] || '#FFFFFF';
            const overlayDuration = typeof cmd.duration === 'number' ? cmd.duration : 0;
            const isPersistent = overlayDuration === 0;
            return <>
                <FormField label={t('screen.effect')}>
                    <Select value={effectType} onChange={e => updateCommand({ effectType: e.target.value, color: undefined } as any)}>
                        <option value="crtScanlines">{t('screen.effects.crtScanlines')}</option>
                        <option value="chromaticGlitch">{t('screen.effects.chromaticGlitch')}</option>
                        <option value="sunbeams">{t('screen.effects.sunbeams')}</option>
                        <option value="shimmer">{t('screen.effects.shimmer')}</option>
                        <option value="rain">{t('screen.effects.rain')}</option>
                        <option value="snowAsh">{t('screen.effects.snowAsh')}</option>
                        <option value="fog">Fog</option>
                        <option value="haze">Haze</option>
                        <option value="smoke">Smoke</option>
                        <option value="fireworks">Fireworks (looping show)</option>
                        {pluginManager.getRegisteredEffects().filter(e => typeof e.render === 'function').map(e => (
                            <option key={e.type} value={e.type}>🧩 {e.displayName}</option>
                        ))}
                    </Select>
                </FormField>
                <FormField label={t('screen.intensityPct', { value: Math.round(intensity * 100) })}>
                    <input type="range" min="0" max="1" step="0.01" value={intensity} onChange={e => updateCommand({ intensity: parseFloat(e.target.value) } as any)} className="w-full accent-[var(--accent-lavender)]" />
                </FormField>
                {supportsColor && (
                    <FormField label={t('screen.color')}>
                        <div className="flex items-center gap-2">
                            <ColorInput value={effectColor} onChange={val => updateCommand({ color: val } as any)} className="w-10 h-10" />
                            <TextInput value={effectColor} onChange={e => updateCommand({ color: e.target.value } as any)} placeholder="#FFFFFF" className="flex-1" />
                            <button type="button" onClick={() => updateCommand({ color: undefined } as any)} className="px-2 py-1 text-xs bg-[var(--bg-tertiary)] rounded" title={t('screen.reset')}>{t('screen.reset')}</button>
                        </div>
                    </FormField>
                )}
                {effectType === 'snowAsh' && (
                    <FormField label={t('screen.mode')}>
                        <Select value={cmd.variant || 'snow'} onChange={e => updateCommand({ variant: e.target.value } as any)}>
                            <option value="snow">{t('screen.snow')}</option>
                            <option value="ash">{t('screen.ash')}</option>
                        </Select>
                    </FormField>
                )}
                {['fog', 'haze', 'smoke'].includes(effectType) && (
                    <label className="flex items-center gap-2 my-1"><input type="checkbox" checked={!!cmd.params?.aboveCharacters} onChange={e => updateCommand({ params: { ...cmd.params, aboveCharacters: e.target.checked } } as any)} /><span className="text-xs text-[var(--text-primary)]">Render in front of characters</span></label>
                )}
                <FormField label={t('screen.duration')}>
                    <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={isPersistent} onChange={e => updateCommand({ duration: e.target.checked ? 0 : 5 } as any)} /><span className="text-xs text-[var(--text-primary)]">{t('screen.persistentShort')}</span></label>
                    {!isPersistent && <TextInput type="number" min="0.1" step="0.5" value={overlayDuration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0.1 } as any)} />}
                    {!isPersistent && <p className="text-xs text-[var(--text-secondary)] mt-1">{t('screen.autoRemoveHint')}</p>}
                </FormField>
                <p className="text-xs text-[var(--text-secondary)]">{t('screen.tip')}</p>
            </>;
        }
        case CommandType.ShowScreen:
            return <FormField label={t('screen.uiScreen')}>
                <Select value={cmd.screenId} onChange={e => updateCommand({ screenId: e.target.value } as any)}>
                    {Object.keys(project.uiScreens).length === 0 && <option disabled>{t('screen.noUIScreens')}</option>}
                    {Object.values(project.uiScreens).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
            </FormField>;
        case CommandType.Label:
        case CommandType.JumpToLabel:
            return <FormField label={t('screen.labelId')}><TextInput value={cmd.labelId} onChange={e => updateCommand({ labelId: e.target.value } as any)} /></FormField>;
        default:
            return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Hide* target pickers (target = a prior matching command in the same scene)
// ─────────────────────────────────────────────────────────────────────────────
const HideTargetGroup: React.FC<{ groupId: InspectorGroupId; command: VNCommand; updateCommand: UpdateCommand; project: VNProject; t: any; ctx?: GroupCtx }> = ({ groupId, command, updateCommand, project, t, ctx }) => {
    const c = command as any;
    const prior = (type: CommandType): any[] => {
        if (!ctx) return [];
        const cmds = project.scenes[ctx.sceneId]?.commands || [];
        return cmds.filter((cc, i) => cc.type === type && i < ctx.commandIndex);
    };
    if (groupId === 'animation' && command.type !== CommandType.HideHotSpot) {
        return <TransitionFields transition={c.transition} duration={c.duration} onUpdate={updateCommand as any} />;
    }
    if (groupId !== 'content') return null;
    const picker = (label: string, placeholder: string, opts: { id: string; label: string }[]) => (
        <FormField label={label}>
            <Select value={c.targetCommandId || ''} onChange={e => updateCommand({ targetCommandId: e.target.value } as any)}>
                <option value="">{placeholder}</option>
                {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
        </FormField>
    );
    switch (command.type) {
        case CommandType.HideText:
            return picker(t('overlay.targetText'), t('overlay.selectText'), prior(CommandType.ShowText).map(o => ({ id: o.id, label: `"${(o.text || '').substring(0, 40)}..." (ID: ${o.id})` })));
        case CommandType.HideImage:
            return picker(t('overlay.targetImage'), t('overlay.selectImage'), prior(CommandType.ShowImage).map(o => {
                const name = (project.images as any)[o.imageId]?.name || (project.backgrounds as any)[o.imageId]?.name || 'Unknown Image';
                return { id: o.id, label: `${name} (ID: ${o.id})` };
            }));
        case CommandType.HideButton:
            return picker(t('button.targetButton'), t('button.selectButton'), prior(CommandType.ShowButton).map(o => ({ id: o.id, label: `"${o.text}" (ID: ${o.id})` })));
        case CommandType.HideHotSpot:
            return picker('Target Hot Spot to Hide', 'Select Hot Spot...', prior(CommandType.ShowHotSpot).map(o => ({ id: o.id, label: o.name || o.id })));
        default:
            return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// ShowHotSpot (invisible/visible interactive region with actions)
// ─────────────────────────────────────────────────────────────────────────────
const ShowHotSpotGroup: React.FC<{ groupId: InspectorGroupId; cmd: any; updateCommand: UpdateCommand; project: VNProject; t: any }> = ({ groupId, cmd, updateCommand, project, t }) => {
    const acts = cmd.actions || [];
    switch (groupId) {
        case 'content':
            return <>
                <FormField label="Name"><TextInput value={cmd.name} onChange={e => updateCommand({ name: e.target.value } as any)} /></FormField>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label="Shape">
                        <Select value={cmd.shape} onChange={e => updateCommand({ shape: e.target.value } as any)}>
                            <option value="rect">Rectangle</option>
                            <option value="circle">Circle</option>
                        </Select>
                    </FormField>
                    <FormField label="Trigger">
                        <Select value={cmd.trigger} onChange={e => updateCommand({ trigger: e.target.value } as any)}>
                            <option value="click">Click</option>
                            <option value="hover">Hover</option>
                            <option value="drag-drop">Drop target</option>
                        </Select>
                    </FormField>
                </div>
                {cmd.trigger === 'drag-drop' && (
                    <FormField label="Accept tag (optional)">
                        <TextInput value={cmd.acceptedTag || ''} onChange={e => updateCommand({ acceptedTag: e.target.value } as any)} placeholder="e.g. key — leave empty to accept any" />
                    </FormField>
                )}
                {cmd.trigger === 'click' && (
                    <label className="flex items-center gap-1 mt-1">
                        <input type="checkbox" checked={cmd.advanceOnTrigger || false} onChange={e => updateCommand({ advanceOnTrigger: e.target.checked } as any)} className="w-4 h-4" />
                        <span className="text-xs text-[var(--text-secondary)]">Advance dialogue on click</span>
                    </label>
                )}
            </>;
        case 'transform':
            return <div className="grid grid-cols-2 gap-1">
                <FormField label={t('shared.xPosition')}><TextInput type="number" value={cmd.x} onChange={e => updateCommand({ x: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                <FormField label={t('shared.yPosition')}><TextInput type="number" value={cmd.y} onChange={e => updateCommand({ y: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                <FormField label={t('shared.widthPercent')}><TextInput type="number" value={cmd.width} onChange={e => updateCommand({ width: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                <FormField label={t('shared.heightPercent')}><TextInput type="number" value={cmd.height} onChange={e => updateCommand({ height: parseFloat(e.target.value) || 0 } as any)} /></FormField>
            </div>;
        case 'appearance':
            return <>
                <label className="flex items-center gap-1">
                    <input type="checkbox" checked={cmd.visible || false} onChange={e => updateCommand({ visible: e.target.checked } as any)} className="w-4 h-4" />
                    <span className="text-xs text-[var(--text-secondary)]">Draw the spot during play</span>
                </label>
                {cmd.visible && (
                    <FormField label={t('shared.color')}><ColorInput value={cmd.highlightColor || 'rgba(99,102,241,0.35)'} onChange={val => updateCommand({ highlightColor: val } as any)} /></FormField>
                )}
            </>;
        case 'logic':
            return <>
                <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Actions</h4>
                <div className="space-y-1.5">
                    {acts.map((action: any, idx: number) => (
                        <ActionCard key={idx} action={action} index={idx}
                            onActionChange={(updated: any) => { const next = [...acts]; next[idx] = updated; updateCommand({ actions: next } as any); }}
                            onRemove={() => updateCommand({ actions: acts.filter((_: any, i: number) => i !== idx) } as any)} />
                    ))}
                    <button onClick={() => updateCommand({ actions: [...acts, { type: 'SetVariable' } as any] } as any)} className="w-full p-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors text-xs">{t('button.addAction')}</button>
                </div>
            </>;
        default:
            return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CreditRoll (entries; colours; slideshow + foreground media; playback)
// ─────────────────────────────────────────────────────────────────────────────
const CreditRollGroup: React.FC<{ groupId: InspectorGroupId; cmd: any; updateCommand: UpdateCommand; project: VNProject; t: any }> = ({ groupId, cmd, updateCommand, project, t }) => {
    const entries = cmd.entries || [];
    switch (groupId) {
        case 'content': {
            const updateEntry = (index: number, field: string, value: string) => { const ne = [...entries]; ne[index] = { ...ne[index], [field]: value }; updateCommand({ entries: ne } as any); };
            const removeEntry = (index: number) => updateCommand({ entries: entries.filter((_: any, i: number) => i !== index) } as any);
            const addEntry = (kind: 'heading' | 'credit') => updateCommand({ entries: [...entries, kind === 'heading' ? { kind: 'heading', label: 'Section Title' } : { kind: 'credit', label: 'Role', value: 'Name' }] } as any);
            const moveEntry = (index: number, dir: -1 | 1) => { const ne = [...entries]; const s = index + dir; if (s < 0 || s >= ne.length) return;[ne[index], ne[s]] = [ne[s], ne[index]]; updateCommand({ entries: ne } as any); };
            return <FormField label={t('credit.entries')}>
                <div className="space-y-2 mb-2">
                    {entries.map((entry: any, i: number) => (
                        <div key={i} className={`p-2 rounded-lg border ${entry.kind === 'heading' ? 'bg-amber-900/20 border-amber-500/30' : 'bg-[var(--bg-secondary)]/30 border-[var(--border-default)]/30'}`}>
                            <div className="flex items-center gap-1 mb-1">
                                <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">{entry.kind === 'heading' ? t('credit.heading') : t('credit.credit')}</span>
                                <div className="flex-1" />
                                <button onClick={() => moveEntry(i, -1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title={t('credit.moveUp')}><ChevronUpIcon className="w-3.5 h-3.5" /></button>
                                <button onClick={() => moveEntry(i, 1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title={t('credit.moveDown')}><ChevronDownIcon className="w-3.5 h-3.5" /></button>
                                <button onClick={() => removeEntry(i)} className="p-0.5 text-red-400 hover:text-red-300" title={t('credit.remove')}><XMarkIcon className="w-3.5 h-3.5" /></button>
                            </div>
                            {entry.kind === 'heading' ? (
                                <TextInput value={entry.label} onChange={e => updateEntry(i, 'label', e.target.value)} placeholder={t('credit.sectionTitlePlaceholder')} />
                            ) : (
                                <div className="flex gap-1">
                                    <TextInput value={entry.label} onChange={e => updateEntry(i, 'label', e.target.value)} placeholder={t('credit.rolePlaceholder')} className="flex-1" />
                                    <TextInput value={entry.value || ''} onChange={e => updateEntry(i, 'value', e.target.value)} placeholder={t('credit.namePlaceholder')} className="flex-1" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <div className="flex gap-2">
                    <button onClick={() => addEntry('heading')} className="flex-1 px-2 py-1.5 text-xs bg-amber-900/30 hover:bg-amber-800/40 border border-amber-500/30 rounded text-amber-300 transition-colors">{t('credit.addHeading')}</button>
                    <button onClick={() => addEntry('credit')} className="flex-1 px-2 py-1.5 text-xs bg-[var(--bg-tertiary)]/30 hover:bg-[var(--bg-tertiary)]/40 border border-[var(--border-default)]/30 rounded text-[var(--text-primary)] transition-colors">{t('credit.addCredit')}</button>
                </div>
            </FormField>;
        }
        case 'logic':
            return <>
                <FormField label={t('credit.scrollSpeed')}>
                    <input type="range" min="10" max="200" step="5" value={cmd.scrollSpeed || 60} onChange={e => updateCommand({ scrollSpeed: parseInt(e.target.value) || 60 } as any)} className="w-full" />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('credit.pxPerSec', { value: cmd.scrollSpeed || 60, label: (cmd.scrollSpeed || 60) <= 40 ? t('credit.speedSlow') : (cmd.scrollSpeed || 60) <= 80 ? t('credit.speedNormal') : (cmd.scrollSpeed || 60) <= 130 ? t('credit.speedFast') : t('credit.speedVeryFast') })}</span>
                </FormField>
                <FormField label={t('credit.maxDuration')}>
                    <TextInput type="number" min="5" max="300" step="1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 15 } as any)} />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('credit.maxDurationHint')}</span>
                </FormField>
                <FormField label={t('credit.allowSkip')}>
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={cmd.allowSkip} onChange={e => updateCommand({ allowSkip: e.target.checked } as any)} />
                        <span className="text-xs text-[var(--text-primary)]">{t('credit.allowSkipHint')}</span>
                    </label>
                </FormField>
                <FormField label={t('credit.onComplete')}>
                    <Select value={cmd.onComplete} onChange={e => updateCommand({ onComplete: e.target.value } as any)}>
                        <option value="advance">{t('credit.onCompleteAdvance')}</option>
                        <option value="title">{t('credit.onCompleteTitle')}</option>
                    </Select>
                </FormField>
            </>;
        case 'appearance':
            return <>
                <FormField label={t('credit.backgroundColor')}>
                    <div className="flex items-center gap-2">
                        <ColorInput value={cmd.backgroundColor.substring(0, 7)} onChange={val => updateCommand({ backgroundColor: val + 'FF' } as any)} className="w-10 h-10" />
                        <TextInput value={cmd.backgroundColor} onChange={e => updateCommand({ backgroundColor: e.target.value } as any)} placeholder="#000000FF" className="flex-1" />
                    </div>
                </FormField>
                <FormField label={t('credit.textColor')}>
                    <div className="flex items-center gap-2">
                        <ColorInput value={cmd.textColor} onChange={val => updateCommand({ textColor: val } as any)} className="w-10 h-10" />
                        <TextInput value={cmd.textColor} onChange={e => updateCommand({ textColor: e.target.value } as any)} placeholder="#FFFFFF" className="flex-1" />
                    </div>
                </FormField>
            </>;
        case 'media': {
            const backgrounds: any[] = cmd.backgrounds || [];
            const mediaList: any[] = cmd.media || [];
            const bgAssetOptions: any[] = [];
            Object.values(project.backgrounds).forEach((b: any) => bgAssetOptions.push({ value: b.id, label: b.name, group: t('credit.groupBackgrounds') }));
            Object.values(project.images).forEach((img: any) => bgAssetOptions.push({ value: img.id, label: img.name, group: t('credit.groupImages') }));
            const mediaAssetOptions: any[] = [...bgAssetOptions];
            Object.values(project.videos).forEach((v: any) => mediaAssetOptions.push({ value: v.id, label: v.name, group: t('credit.groupVideos') }));
            const updateBg = (i: number, u: any) => { const n = [...backgrounds]; n[i] = { ...n[i], ...u }; updateCommand({ backgrounds: n } as any); };
            const removeBg = (i: number) => updateCommand({ backgrounds: backgrounds.filter((_: any, x: number) => x !== i) } as any);
            const addBg = () => updateCommand({ backgrounds: [...backgrounds, { assetId: null, displayDuration: 5, transition: 'fade', transitionDuration: 0.8 }] } as any);
            const moveBg = (i: number, d: -1 | 1) => { const n = [...backgrounds]; const s = i + d; if (s < 0 || s >= n.length) return;[n[i], n[s]] = [n[s], n[i]]; updateCommand({ backgrounds: n } as any); };
            const updateMedia = (i: number, u: any) => { const n = [...mediaList]; n[i] = { ...n[i], ...u }; updateCommand({ media: n } as any); };
            const removeMedia = (i: number) => updateCommand({ media: mediaList.filter((_: any, x: number) => x !== i) } as any);
            const addMedia = () => updateCommand({ media: [...mediaList, { assetId: null, x: 10, y: 10, width: 30, height: 30, opacity: 1, objectFit: 'contain', showAt: 0, hideAt: 0, transition: 'fade', transitionDuration: 0.5 }] } as any);
            const moveMedia = (i: number, d: -1 | 1) => { const n = [...mediaList]; const s = i + d; if (s < 0 || s >= n.length) return;[n[i], n[s]] = [n[s], n[i]]; updateCommand({ media: n } as any); };
            return <>
                <FormField label={t('credit.backgroundSlideshow')}>
                    <p className="text-[10px] text-[var(--text-secondary)] mb-2">{t('credit.backgroundSlideshowHint')}</p>
                    <div className="space-y-2 mb-2">
                        {backgrounds.map((bg, i) => (
                            <div key={i} className="p-2 rounded-lg border bg-indigo-900/15 border-indigo-500/25">
                                <div className="flex items-center gap-1 mb-1.5">
                                    <span className="text-[10px] uppercase font-bold text-indigo-300">{t('credit.slide', { n: i + 1 })}</span>
                                    <div className="flex-1" />
                                    <button onClick={() => moveBg(i, -1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title={t('credit.moveUp')}><ChevronUpIcon className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => moveBg(i, 1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title={t('credit.moveDown')}><ChevronDownIcon className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => removeBg(i)} className="p-0.5 text-red-400 hover:text-red-300" title={t('credit.remove')}><XMarkIcon className="w-3.5 h-3.5" /></button>
                                </div>
                                <SearchableSelect options={bgAssetOptions} value={bg.assetId || ''} onChange={(v) => updateBg(i, { assetId: v || null })} placeholder={bgAssetOptions.length === 0 ? t('credit.noAssets') : t('credit.selectImageVideo')} />
                                <div className="grid grid-cols-2 gap-1 mt-1.5">
                                    <FormField label={t('credit.displaySec')}><TextInput type="number" min="1" max="120" step="0.5" value={bg.displayDuration} onChange={e => updateBg(i, { displayDuration: parseFloat(e.target.value) || 5 })} /></FormField>
                                    <FormField label={t('credit.transition')}>
                                        <Select value={bg.transition} onChange={e => updateBg(i, { transition: e.target.value })}>
                                            <option value="fade">{t('credit.transitionFade')}</option>
                                            <option value="dissolve">{t('credit.transitionDissolve')}</option>
                                            <option value="instant">{t('credit.transitionInstant')}</option>
                                        </Select>
                                    </FormField>
                                </div>
                                {bg.transition !== 'instant' && <FormField label={t('credit.transitionDuration')}><TextInput type="number" min="0.1" max="5" step="0.1" value={bg.transitionDuration} onChange={e => updateBg(i, { transitionDuration: parseFloat(e.target.value) || 0.5 })} /></FormField>}
                                <FormField label={t('credit.sizing')}>
                                    <Select value={bg.objectFit || 'cover'} onChange={e => { const val = e.target.value; if (val === 'custom') updateBg(i, { objectFit: val }); else updateBg(i, { objectFit: val, x: 0, y: 0, width: 100, height: 100 }); }}>
                                        <option value="cover">{t('credit.sizingCover')}</option>
                                        <option value="contain">{t('credit.sizingContain')}</option>
                                        <option value="fill">{t('credit.sizingFill')}</option>
                                        <option value="custom">{t('credit.sizingCustom')}</option>
                                    </Select>
                                </FormField>
                                {bg.objectFit === 'custom' && <>
                                    <div className="grid grid-cols-2 gap-1 mt-1.5">
                                        <FormField label={t('credit.x')}><TextInput type="number" min="0" max="100" step="1" value={bg.x ?? 0} onChange={e => updateBg(i, { x: parseFloat(e.target.value) || 0 })} /></FormField>
                                        <FormField label={t('credit.y')}><TextInput type="number" min="0" max="100" step="1" value={bg.y ?? 0} onChange={e => updateBg(i, { y: parseFloat(e.target.value) || 0 })} /></FormField>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1">
                                        <FormField label={t('credit.width')}><TextInput type="number" min="1" max="100" step="1" value={bg.width ?? 100} onChange={e => updateBg(i, { width: parseFloat(e.target.value) || 100 })} /></FormField>
                                        <FormField label={t('credit.height')}><TextInput type="number" min="1" max="100" step="1" value={bg.height ?? 100} onChange={e => updateBg(i, { height: parseFloat(e.target.value) || 100 })} /></FormField>
                                    </div>
                                </>}
                                <FormField label={t('credit.opacity', { value: Math.round((bg.opacity ?? 1) * 100) })}><input type="range" min="0" max="1" step="0.01" value={bg.opacity ?? 1} onChange={e => updateBg(i, { opacity: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" /></FormField>
                            </div>
                        ))}
                    </div>
                    <button onClick={addBg} className="w-full px-2 py-1.5 text-xs bg-indigo-900/25 hover:bg-indigo-800/35 border border-indigo-500/25 rounded text-indigo-300 transition-colors">{t('credit.addBackgroundSlide')}</button>
                </FormField>
                <hr className="border-[var(--border-subtle)] my-3" />
                <FormField label={t('credit.foregroundMedia')}>
                    <p className="text-[10px] text-[var(--text-secondary)] mb-2">{t('credit.foregroundMediaHint')}</p>
                    <div className="space-y-2 mb-2">
                        {mediaList.map((item, i) => (
                            <div key={i} className="p-2 rounded-lg border bg-emerald-900/15 border-emerald-500/25">
                                <div className="flex items-center gap-1 mb-1.5">
                                    <span className="text-[10px] uppercase font-bold text-emerald-300">{t('credit.media', { n: i + 1 })}</span>
                                    <div className="flex-1" />
                                    <button onClick={() => moveMedia(i, -1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title={t('credit.moveUp')}><ChevronUpIcon className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => moveMedia(i, 1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title={t('credit.moveDown')}><ChevronDownIcon className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => removeMedia(i)} className="p-0.5 text-red-400 hover:text-red-300" title={t('credit.remove')}><XMarkIcon className="w-3.5 h-3.5" /></button>
                                </div>
                                <SearchableSelect options={mediaAssetOptions} value={item.assetId || ''} onChange={(v) => updateMedia(i, { assetId: v || null })} placeholder={mediaAssetOptions.length === 0 ? t('credit.noAssets') : t('credit.selectImageVideo')} />
                                <FormField label={t('credit.sizing')}>
                                    <Select value={item.objectFit || 'contain'} onChange={e => { const val = e.target.value; if (val === 'custom') updateMedia(i, { objectFit: val }); else updateMedia(i, { objectFit: val, x: 10, y: 10, width: 30, height: 30 }); }}>
                                        <option value="cover">{t('credit.sizingCover')}</option>
                                        <option value="contain">{t('credit.sizingContain')}</option>
                                        <option value="fill">{t('credit.sizingFill')}</option>
                                        <option value="custom">{t('credit.sizingCustom')}</option>
                                    </Select>
                                </FormField>
                                {item.objectFit === 'custom' && <>
                                    <div className="grid grid-cols-2 gap-1 mt-1.5">
                                        <FormField label={t('credit.x')}><TextInput type="number" min="0" max="100" step="1" value={item.x} onChange={e => updateMedia(i, { x: parseFloat(e.target.value) || 0 })} /></FormField>
                                        <FormField label={t('credit.y')}><TextInput type="number" min="0" max="100" step="1" value={item.y} onChange={e => updateMedia(i, { y: parseFloat(e.target.value) || 0 })} /></FormField>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1">
                                        <FormField label={t('credit.width')}><TextInput type="number" min="1" max="100" step="1" value={item.width} onChange={e => updateMedia(i, { width: parseFloat(e.target.value) || 30 })} /></FormField>
                                        <FormField label={t('credit.height')}><TextInput type="number" min="1" max="100" step="1" value={item.height} onChange={e => updateMedia(i, { height: parseFloat(e.target.value) || 30 })} /></FormField>
                                    </div>
                                </>}
                                <FormField label={t('credit.opacity', { value: Math.round((item.opacity ?? 1) * 100) })}><input type="range" min="0" max="1" step="0.01" value={item.opacity ?? 1} onChange={e => updateMedia(i, { opacity: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" /></FormField>
                                <div className="grid grid-cols-2 gap-1 mt-1.5">
                                    <FormField label={t('credit.showAt')}><TextInput type="number" min="0" step="0.5" value={item.showAt} onChange={e => updateMedia(i, { showAt: parseFloat(e.target.value) || 0 })} /></FormField>
                                    <FormField label={t('credit.hideAt')}><TextInput type="number" min="0" step="0.5" value={item.hideAt} onChange={e => updateMedia(i, { hideAt: parseFloat(e.target.value) || 0 })} /></FormField>
                                </div>
                                <p className="text-[9px] text-[var(--text-muted)] mt-0.5">{t('credit.hideAtHint')}</p>
                                <div className="grid grid-cols-2 gap-1 mt-1">
                                    <FormField label={t('credit.transition')}>
                                        <Select value={item.transition} onChange={e => updateMedia(i, { transition: e.target.value })}>
                                            <option value="fade">{t('credit.transitionFade')}</option>
                                            <option value="instant">{t('credit.transitionInstant')}</option>
                                        </Select>
                                    </FormField>
                                    {item.transition !== 'instant' && <FormField label={t('credit.duration')}><TextInput type="number" min="0.1" max="5" step="0.1" value={item.transitionDuration} onChange={e => updateMedia(i, { transitionDuration: parseFloat(e.target.value) || 0.5 })} /></FormField>}
                                </div>
                            </div>
                        ))}
                    </div>
                    <button onClick={addMedia} className="w-full px-2 py-1.5 text-xs bg-emerald-900/25 hover:bg-emerald-800/35 border border-emerald-500/25 rounded text-emerald-300 transition-colors">{t('credit.addMediaItem')}</button>
                </FormField>
            </>;
        }
        default:
            return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// SpawnParticles (tag/preset/duration; full particle config)
// ─────────────────────────────────────────────────────────────────────────────
const numInputStyle: React.CSSProperties = { backgroundColor: 'var(--background-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' };
const SpawnParticlesGroup: React.FC<{ groupId: InspectorGroupId; cmd: any; updateCommand: UpdateCommand; t: any }> = ({ groupId, cmd, updateCommand, t }) => {
    const cfg = cmd.config || {};
    const setCfg = (patch: any) => updateCommand({ config: { ...cfg, ...patch } } as any);
    const isCustom = !cfg.preset || cfg.preset === 'none';
    if (groupId === 'content') {
        const presets = ['none', 'fireflies', 'sparks', 'bubbles', 'confetti', 'embers', 'dust', 'petals', 'magic', 'stars'];
        const presetLabel: Record<string, string> = { none: 'presetCustom', fireflies: 'presetFireflies', sparks: 'presetSparks', bubbles: 'presetBubbles', confetti: 'presetConfetti', embers: 'presetEmbers', dust: 'presetDust', petals: 'presetPetals', magic: 'presetMagic', stars: 'presetStars' };
        return <>
            <FormField label={t('particles.particleTag')}><TextInput value={cmd.particleTag || ''} onChange={e => updateCommand({ particleTag: e.target.value } as any)} placeholder={t('particles.particleTagPlaceholder')} /></FormField>
            <FormField label={t('particles.preset')}>
                <Select value={cfg.preset || 'none'} onChange={e => { const np = e.target.value; if (np === 'none') updateCommand({ config: { ...cfg, preset: 'none' } } as any); else updateCommand({ config: { preset: np } } as any); }}>
                    {presets.map(p => <option key={p} value={p}>{t(`particles.${presetLabel[p]}`)}</option>)}
                </Select>
            </FormField>
            <FormField label={t('particles.durationSec')}>
                <input type="number" min="0" step="0.5" value={cmd.duration || 0} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 } as any)} className="w-full rounded px-2 py-1 text-sm" style={numInputStyle} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.durationHint')}</span>
            </FormField>
        </>;
    }
    if (groupId === 'effects') {
        const shapes = ['circle', 'square', 'star', 'heart', 'sparkle'];
        const shapeLabel: Record<string, string> = { circle: 'shapeCircle', square: 'shapeSquare', star: 'shapeStar', heart: 'shapeHeart', sparkle: 'shapeSparkle' };
        const areaMode = (() => {
            const eX = cfg.emitterX ?? 50, eY = cfg.emitterY ?? 50, eW = cfg.emitterWidth ?? 100, eH = cfg.emitterHeight ?? 100;
            if (eW === 100 && eH === 100 && eX === 50 && eY === 50) return 'full-screen';
            if (eW >= 90 && eH <= 10 && eY <= 5) return 'top-edge';
            if (eW >= 90 && eH <= 10 && eY >= 95) return 'bottom-edge';
            if (eW >= 90 && eH <= 10 && eY >= 45 && eY <= 55) return 'horizontal-line';
            if (eW <= 10 && eH <= 10) return 'point';
            return 'custom';
        })();
        return <>
            <FormField label={t('particles.density')}>
                <input type="range" min="1" max="200" value={cfg.emitRate || 20} onChange={e => setCfg({ emitRate: parseInt(e.target.value) || 20 })} className="w-full" />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.densityHint', { value: cfg.emitRate || 20 })}</span>
            </FormField>
            <FormField label={t('particles.speed')}>
                <div className="flex gap-1">
                    <input type="number" min="0" value={cfg.speedMin ?? 10} onChange={e => setCfg({ speedMin: parseFloat(e.target.value) || 0 })} className="w-1/2 rounded px-2 py-1 text-sm" style={numInputStyle} />
                    <input type="number" min="0" value={cfg.speedMax ?? 50} onChange={e => setCfg({ speedMax: parseFloat(e.target.value) || 0 })} className="w-1/2 rounded px-2 py-1 text-sm" style={numInputStyle} />
                </div>
            </FormField>
            <FormField label={t('particles.size')}>
                <div className="flex gap-1">
                    <input type="number" min="0.5" value={cfg.sizeMin ?? 2} onChange={e => setCfg({ sizeMin: parseFloat(e.target.value) || 1 })} className="w-1/2 rounded px-2 py-1 text-sm" style={numInputStyle} />
                    <input type="number" min="0.5" value={cfg.sizeMax ?? 8} onChange={e => setCfg({ sizeMax: parseFloat(e.target.value) || 1 })} className="w-1/2 rounded px-2 py-1 text-sm" style={numInputStyle} />
                </div>
            </FormField>
            <FormField label={t('particles.emissionArea')}>
                <Select value={areaMode} onChange={e => {
                    const presets: Record<string, any> = {
                        'full-screen': { emitterX: 50, emitterY: 50, emitterWidth: 100, emitterHeight: 100 },
                        'top-edge': { emitterX: 50, emitterY: 0, emitterWidth: 100, emitterHeight: 5 },
                        'bottom-edge': { emitterX: 50, emitterY: 100, emitterWidth: 100, emitterHeight: 5 },
                        'horizontal-line': { emitterX: 50, emitterY: 50, emitterWidth: 100, emitterHeight: 5 },
                        'point': { emitterX: 50, emitterY: 50, emitterWidth: 0, emitterHeight: 0 },
                    };
                    if (presets[e.target.value]) setCfg(presets[e.target.value]);
                }}>
                    <option value="full-screen">{t('particles.areaFullScreen')}</option>
                    <option value="top-edge">{t('particles.areaTopEdge')}</option>
                    <option value="bottom-edge">{t('particles.areaBottomEdge')}</option>
                    <option value="horizontal-line">{t('particles.areaHorizontalLine')}</option>
                    <option value="point">{t('particles.areaPoint')}</option>
                    <option value="custom">{t('particles.areaCustom')}</option>
                </Select>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.emissionAreaHint')}</span>
            </FormField>
            <FormField label={t('particles.emitterCenter')}>
                <div className="flex gap-1">
                    <input type="number" min="0" max="100" value={cfg.emitterX ?? 50} onChange={e => setCfg({ emitterX: parseFloat(e.target.value) })} className="w-1/2 rounded px-2 py-1 text-sm" style={numInputStyle} />
                    <input type="number" min="0" max="100" value={cfg.emitterY ?? 50} onChange={e => setCfg({ emitterY: parseFloat(e.target.value) })} className="w-1/2 rounded px-2 py-1 text-sm" style={numInputStyle} />
                </div>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.emitterCenterHint')}</span>
            </FormField>
            <FormField label={t('particles.emitterSpread')}>
                <div className="flex gap-1">
                    <input type="number" min="0" max="200" value={cfg.emitterWidth ?? 100} onChange={e => setCfg({ emitterWidth: parseFloat(e.target.value) })} className="w-1/2 rounded px-2 py-1 text-sm" style={numInputStyle} />
                    <input type="number" min="0" max="200" value={cfg.emitterHeight ?? 100} onChange={e => setCfg({ emitterHeight: parseFloat(e.target.value) })} className="w-1/2 rounded px-2 py-1 text-sm" style={numInputStyle} />
                </div>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.emitterSpreadHint')}</span>
            </FormField>
            {isCustom && <>
                <FormField label={t('particles.shape')}>
                    <Select value={cfg.shape || 'circle'} onChange={e => setCfg({ shape: e.target.value })}>
                        {shapes.map(s => <option key={s} value={s}>{t(`particles.${shapeLabel[s]}`)}</option>)}
                    </Select>
                </FormField>
                <FormField label={t('particles.lifetime')}><input type="number" min="0.1" max="30" step="0.1" value={cfg.lifetime || 3} onChange={e => setCfg({ lifetime: parseFloat(e.target.value) || 3 })} className="w-full rounded px-2 py-1 text-sm" style={numInputStyle} /></FormField>
                <FormField label={t('particles.gravity')}>
                    <input type="range" min="-100" max="100" value={cfg.gravity || 0} onChange={e => setCfg({ gravity: parseFloat(e.target.value) })} className="w-full" />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.gravityHint', { value: cfg.gravity || 0 })}</span>
                </FormField>
                <FormField label={t('particles.wind')}>
                    <input type="range" min="-50" max="50" value={cfg.wind || 0} onChange={e => setCfg({ wind: parseFloat(e.target.value) })} className="w-full" />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{cfg.wind || 0}</span>
                </FormField>
                <FormField label={t('particles.colors')}>
                    <TextInput value={(cfg.colors || ['#FFFFFF']).join(', ')} onChange={e => setCfg({ colors: e.target.value.split(',').map((c: string) => c.trim()).filter(Boolean) })} placeholder="#FF0000, #00FF00, #0000FF" />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.colorsHint')}</span>
                </FormField>
                <FormField label={t('particles.options')}>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.fadeOut ?? true} onChange={e => setCfg({ fadeOut: e.target.checked })} /><span className="text-xs text-[var(--text-primary)]">{t('particles.fadeOut')}</span></label>
                    <label className="flex items-center gap-2 mt-1"><input type="checkbox" checked={cfg.shrink ?? false} onChange={e => setCfg({ shrink: e.target.checked })} /><span className="text-xs text-[var(--text-primary)]">{t('particles.shrink')}</span></label>
                </FormField>
            </>}
        </>;
    }
    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// TweenElement (target/easing/wait; tweened transform + appearance props)
// ─────────────────────────────────────────────────────────────────────────────
const TWEEN_EASING = [
    { group: 'Linear', options: ['linear'] }, { group: 'Quad', options: ['easeInQuad', 'easeOutQuad', 'easeInOutQuad'] },
    { group: 'Cubic', options: ['easeInCubic', 'easeOutCubic', 'easeInOutCubic'] }, { group: 'Quart', options: ['easeInQuart', 'easeOutQuart', 'easeInOutQuart'] },
    { group: 'Quint', options: ['easeInQuint', 'easeOutQuint', 'easeInOutQuint'] }, { group: 'Sine', options: ['easeInSine', 'easeOutSine', 'easeInOutSine'] },
    { group: 'Expo', options: ['easeInExpo', 'easeOutExpo', 'easeInOutExpo'] }, { group: 'Circ', options: ['easeInCirc', 'easeOutCirc', 'easeInOutCirc'] },
    { group: 'Back', options: ['easeInBack', 'easeOutBack', 'easeInOutBack'] }, { group: 'Elastic', options: ['easeInElastic', 'easeOutElastic', 'easeInOutElastic'] },
    { group: 'Bounce', options: ['easeInBounce', 'easeOutBounce', 'easeInOutBounce'] },
];
const TweenElementGroup: React.FC<{ groupId: InspectorGroupId; cmd: any; updateCommand: UpdateCommand; project: VNProject; t: any; ctx?: GroupCtx }> = ({ groupId, cmd, updateCommand, project, t, ctx }) => {
    const scene = ctx ? project.scenes[ctx.sceneId] : undefined;
    const sceneCommands: any[] = scene?.commands || [];
    if (groupId === 'content') {
        const typeOptions = [
            { value: 'character', label: t('tween.typeCharacter') }, { value: 'image', label: t('tween.typeImage') },
            { value: 'text', label: t('tween.typeText') }, { value: 'button', label: t('tween.typeButton') },
            { value: 'movie', label: t('tween.typeMovie') },
            { value: 'screen', label: t('tween.typeScreen') },
        ];
        const targetIdOptions: { value: string; label: string }[] = [];
        if (cmd.targetType === 'character') Object.values(project.characters).forEach((c: any) => targetIdOptions.push({ value: c.id, label: c.name }));
        else if (cmd.targetType === 'screen') targetIdOptions.push({ value: '__screen__', label: t('tween.screen') });
        else if (cmd.targetType === 'text') sceneCommands.filter(c => c.type === CommandType.ShowText).forEach(c => targetIdOptions.push({ value: c.id, label: `"${c.text.substring(0, 30)}${c.text.length > 30 ? '…' : ''}"` }));
        else if (cmd.targetType === 'image') sceneCommands.filter(c => c.type === CommandType.ShowImage).forEach(c => { const img = (project.images || {})[c.imageId]; targetIdOptions.push({ value: c.id, label: img?.name || t('tween.imageLabel', { id: c.id.substring(0, 8) }) }); });
        else if (cmd.targetType === 'button') sceneCommands.filter(c => c.type === CommandType.ShowButton).forEach(c => targetIdOptions.push({ value: c.id, label: `"${c.text.substring(0, 30)}${c.text.length > 30 ? '…' : ''}"` }));
        else if (cmd.targetType === 'movie') sceneCommands.filter(c => c.type === CommandType.PlayMovie).forEach(c => { const v = (project.videos || {})[c.videoId]; targetIdOptions.push({ value: c.id, label: v?.name || t('tween.imageLabel', { id: c.id.substring(0, 8) }) }); });
        return <>
            <FormField label={t('tween.targetType')}>
                <Select value={cmd.targetType} onChange={e => updateCommand({ targetType: e.target.value, targetId: '' } as any)}>
                    {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
            </FormField>
            <FormField label={t('tween.targetId')}>
                {targetIdOptions.length > 0
                    ? <SearchableSelect options={targetIdOptions} value={cmd.targetId} onChange={(v) => updateCommand({ targetId: v } as any)} placeholder={t('tween.selectTarget')} />
                    : <TextInput value={cmd.targetId} onChange={e => updateCommand({ targetId: e.target.value } as any)} placeholder={t('tween.noMatchingShow')} />}
            </FormField>
            <FormField label={t('tween.durationSeconds')}><TextInput type="number" min="0.01" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 1 } as any)} /></FormField>
            <FormField label={t('tween.easing')}>
                <Select value={cmd.easing || 'easeInOutCubic'} onChange={e => updateCommand({ easing: e.target.value } as any)}>
                    {TWEEN_EASING.map(g => <optgroup key={g.group} label={g.group}>{g.options.map(o => <option key={o} value={o}>{o}</option>)}</optgroup>)}
                </Select>
            </FormField>
            <label className="flex items-center gap-1 mt-1">
                <input type="checkbox" checked={cmd.waitForCompletion !== false} onChange={e => updateCommand({ waitForCompletion: e.target.checked } as any)} className="h-4 w-4 rounded bg-[var(--bg-secondary)] border-[var(--border-default)]" />
                <span className="text-sm">{t('tween.waitForCompletion')}</span>
            </label>
        </>;
    }
    const showPos = cmd.targetType !== 'screen';
    const showSize = cmd.targetType === 'image' || cmd.targetType === 'button' || cmd.targetType === 'text' || cmd.targetType === 'movie';
    const showOpacity = cmd.targetType !== 'screen' && cmd.targetType !== 'text';
    const showRotation = cmd.targetType === 'image' || cmd.targetType === 'movie';
    const showScale = cmd.targetType === 'character';
    const showScaleXY = cmd.targetType === 'image' || cmd.targetType === 'movie';
    const showFontSize = cmd.targetType === 'text' || cmd.targetType === 'button';
    const showBorderRadius = cmd.targetType === 'button';
    const showBgColor = cmd.targetType === 'button';
    const showColor = cmd.targetType === 'text';
    const showZoomPan = cmd.targetType === 'screen';
    if (groupId === 'transform') {
        return <>
            <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>{t('tween.targetPropertiesHint')}</p>
            {showPos && <div className="grid grid-cols-2 gap-1">
                <FormField label={t('tween.x')}><TextInput type="number" step="0.1" value={cmd.x ?? ''} onChange={e => updateCommand({ x: e.target.value ? parseFloat(e.target.value) : undefined } as any)} placeholder="–" /></FormField>
                <FormField label={t('tween.y')}><TextInput type="number" step="0.1" value={cmd.y ?? ''} onChange={e => updateCommand({ y: e.target.value ? parseFloat(e.target.value) : undefined } as any)} placeholder="–" /></FormField>
            </div>}
            {showSize && <div className="grid grid-cols-2 gap-1">
                <FormField label={t('tween.width')}><TextInput type="number" min="0" step="1" value={cmd.width ?? ''} onChange={e => updateCommand({ width: e.target.value ? parseFloat(e.target.value) : undefined } as any)} placeholder="–" /></FormField>
                <FormField label={t('tween.height')}><TextInput type="number" min="0" step="1" value={cmd.height ?? ''} onChange={e => updateCommand({ height: e.target.value ? parseFloat(e.target.value) : undefined } as any)} placeholder="–" /></FormField>
            </div>}
            {showRotation && <FormField label={t('tween.rotation')}><TextInput type="number" step="1" value={cmd.rotation ?? ''} onChange={e => updateCommand({ rotation: e.target.value ? parseFloat(e.target.value) : undefined } as any)} placeholder="–" /></FormField>}
            {showScale && <FormField label={t('tween.scale')}>
                <div className="flex items-center gap-2">
                    <input type="range" min="0.1" max="3" step="0.05" value={cmd.scale ?? 1} onChange={e => updateCommand({ scale: parseFloat(e.target.value) } as any)} className="flex-1" />
                    <TextInput type="number" min="0.1" max="5" step="0.05" value={cmd.scale ?? ''} onChange={e => updateCommand({ scale: e.target.value ? parseFloat(e.target.value) : undefined } as any)} style={{ width: '60px' }} />
                </div>
            </FormField>}
            {showScaleXY && <div className="grid grid-cols-2 gap-1">
                <FormField label={t('tween.scaleX')}><TextInput type="number" step="0.05" value={cmd.scaleX ?? ''} onChange={e => updateCommand({ scaleX: e.target.value ? parseFloat(e.target.value) : undefined } as any)} placeholder="–" /></FormField>
                <FormField label={t('tween.scaleY')}><TextInput type="number" step="0.05" value={cmd.scaleY ?? ''} onChange={e => updateCommand({ scaleY: e.target.value ? parseFloat(e.target.value) : undefined } as any)} placeholder="–" /></FormField>
            </div>}
            {showFontSize && <FormField label={t('tween.fontSize')}><TextInput type="number" min="1" step="1" value={cmd.fontSize ?? ''} onChange={e => updateCommand({ fontSize: e.target.value ? parseFloat(e.target.value) : undefined } as any)} placeholder="–" /></FormField>}
            {showBorderRadius && <FormField label={t('tween.borderRadius')}><TextInput type="number" min="0" step="1" value={cmd.borderRadius ?? ''} onChange={e => updateCommand({ borderRadius: e.target.value ? parseFloat(e.target.value) : undefined } as any)} placeholder="–" /></FormField>}
            {showZoomPan && <>
                <FormField label={t('tween.zoom')}><TextInput type="number" min="0.1" step="0.1" value={cmd.zoom ?? ''} onChange={e => updateCommand({ zoom: e.target.value ? parseFloat(e.target.value) : undefined } as any)} placeholder="–" /></FormField>
                <div className="grid grid-cols-2 gap-1">
                    <FormField label={t('tween.panX')}><TextInput type="number" step="1" value={cmd.panX ?? ''} onChange={e => updateCommand({ panX: e.target.value ? parseFloat(e.target.value) : undefined } as any)} placeholder="–" /></FormField>
                    <FormField label={t('tween.panY')}><TextInput type="number" step="1" value={cmd.panY ?? ''} onChange={e => updateCommand({ panY: e.target.value ? parseFloat(e.target.value) : undefined } as any)} placeholder="–" /></FormField>
                </div>
            </>}
            {!showPos && !showSize && !showRotation && !showScale && !showScaleXY && !showFontSize && !showBorderRadius && !showZoomPan && <p className="text-xs text-[var(--text-muted)]">—</p>}
        </>;
    }
    if (groupId === 'appearance') {
        return <>
            {showOpacity && <FormField label={cmd.opacity !== undefined ? t('tween.opacity', { value: Math.round(cmd.opacity * 100) + '%' }) : t('tween.opacityNone')}>
                <input type="range" min="0" max="1" step="0.01" value={cmd.opacity ?? 1} onChange={e => updateCommand({ opacity: parseFloat(e.target.value) } as any)} className="w-full accent-[var(--accent-lavender)]" />
            </FormField>}
            {showColor && <FormField label={t('tween.textColor')}>
                <div className="flex gap-1 items-center">
                    <ColorInput value={cmd.color || '#FFFFFF'} onChange={val => updateCommand({ color: val } as any)} className="w-12 h-10" />
                    <TextInput value={cmd.color ?? ''} onChange={e => updateCommand({ color: e.target.value || undefined } as any)} placeholder="–" className="flex-grow" />
                </div>
            </FormField>}
            {showBgColor && <FormField label={t('tween.backgroundColor')}>
                <div className="flex gap-1 items-center">
                    <ColorInput value={cmd.backgroundColor || '#6366f1'} onChange={val => updateCommand({ backgroundColor: val } as any)} className="w-12 h-10" />
                    <TextInput value={cmd.backgroundColor ?? ''} onChange={e => updateCommand({ backgroundColor: e.target.value || undefined } as any)} placeholder="–" className="flex-grow" />
                </div>
            </FormField>}
            {!showOpacity && !showColor && !showBgColor && <p className="text-xs text-[var(--text-muted)]">—</p>}
        </>;
    }
    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// PlayMovie (video; displayMode/loop/wait; sizing + custom rect; opacity)
// ─────────────────────────────────────────────────────────────────────────────
const PlayMovieGroup: React.FC<{ groupId: InspectorGroupId; cmd: any; updateCommand: UpdateCommand; project: VNProject; t: any }> = ({ groupId, cmd, updateCommand, project, t }) => {
    const isOverlay = cmd.displayMode === 'overlay';
    // Video assets can live in the videos collection OR in backgrounds/images (a video uploaded
    // under those Asset Manager tabs lands there with a videoUrl). List them all so a video is
    // usable here no matter which tab it was added under.
    const videoAssets = [
        ...Object.values(project.videos || {}),
        ...Object.values(project.backgrounds || {}).filter((a: any) => a.isVideo || a.videoUrl),
        ...Object.values(project.images || {}).filter((a: any) => a.isVideo || a.videoUrl),
    ] as any[];
    switch (groupId) {
        case 'content':
            return <>
                <FormField label={t('movie.video')}>
                    <Select value={cmd.videoId} onChange={e => updateCommand({ videoId: e.target.value } as any)}>
                        {videoAssets.length === 0 && <option disabled>{t('movie.noVideos')}</option>}
                        {videoAssets.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </Select>
                </FormField>
                <FormField label={t('movie.displayMode')}>
                    <Select value={cmd.displayMode || 'fullscreen'} onChange={e => {
                        const mode = e.target.value as 'fullscreen' | 'overlay';
                        if (mode === 'overlay') updateCommand({ displayMode: mode, waitsForCompletion: false } as any);
                        else updateCommand({ displayMode: mode } as any);
                    }}>
                        <option value="fullscreen">{t('movie.fullscreen')}</option>
                        <option value="overlay">{t('movie.overlay')}</option>
                    </Select>
                </FormField>
                <div className="flex items-center gap-1 mt-2">
                    <input id="grp-movie-loop" type="checkbox" checked={cmd.loop ?? false} onChange={e => updateCommand({ loop: e.target.checked } as any)} className="h-4 w-4" />
                    <label htmlFor="grp-movie-loop" className="text-sm">{t('movie.loopContinuously')}</label>
                </div>
                {!cmd.loop && (
                    <div className="flex items-center gap-1 mt-2">
                        <input id="grp-movie-hold" type="checkbox" checked={cmd.holdLastFrame ?? false} onChange={e => updateCommand({ holdLastFrame: e.target.checked } as any)} className="h-4 w-4" />
                        <label htmlFor="grp-movie-hold" className="text-sm">Hold last frame when finished</label>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-1 mt-2">
                    <FormField label="Transition">
                        <Select value={cmd.transition || 'instant'} onChange={e => updateCommand({ transition: e.target.value === 'instant' ? undefined : e.target.value } as any)}>
                            <option value="instant">None</option>
                            <option value="fade">Fade</option>
                            <option value="dissolve">Dissolve</option>
                            <option value="slide">Slide</option>
                            <option value="iris-in">Iris</option>
                            <option value="wipe-right">Wipe</option>
                        </Select>
                    </FormField>
                    {cmd.transition && cmd.transition !== 'instant' && (
                        <FormField label="Duration (s)">
                            <TextInput type="number" min="0" step="0.1" value={cmd.transitionDuration ?? 0.5} onChange={e => updateCommand({ transitionDuration: parseFloat(e.target.value) || undefined } as any)} />
                        </FormField>
                    )}
                </div>
                {!isOverlay && (
                    <div className="flex items-center gap-1 mt-2">
                        <input id="grp-movie-wait" type="checkbox" checked={cmd.waitsForCompletion} onChange={e => updateCommand({ waitsForCompletion: e.target.checked } as any)} className="h-4 w-4" />
                        <label htmlFor="grp-movie-wait" className="text-sm">{t('movie.waitForCompletion')}</label>
                    </div>
                )}
            </>;
        case 'transform':
            return <>
                <FormField label={t('movie.displaySizing')}>
                    <Select value={cmd.objectFit || 'cover'} onChange={e => {
                        const val = e.target.value as 'cover' | 'contain' | 'fill' | 'custom';
                        if (val === 'custom') updateCommand({ objectFit: val } as any);
                        else updateCommand({ objectFit: val, x: 0, y: 0, width: 100, height: 100 } as any);
                    }}>
                        <option value="cover">{t('movie.cover')}</option>
                        <option value="contain">{t('movie.contain')}</option>
                        <option value="fill">{t('movie.fill')}</option>
                        <option value="custom">{t('movie.custom')}</option>
                    </Select>
                </FormField>
                {cmd.objectFit === 'custom' && <>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('shared.xPosition')}><TextInput type="number" min="0" max="100" step="1" value={cmd.x ?? 0} onChange={e => updateCommand({ x: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                        <FormField label={t('shared.yPosition')}><TextInput type="number" min="0" max="100" step="1" value={cmd.y ?? 0} onChange={e => updateCommand({ y: parseFloat(e.target.value) || 0 } as any)} /></FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('shared.widthPercent')}><TextInput type="number" min="1" max="100" step="1" value={cmd.width ?? 100} onChange={e => updateCommand({ width: parseFloat(e.target.value) || 100 } as any)} /></FormField>
                        <FormField label={t('shared.heightPercent')}><TextInput type="number" min="1" max="100" step="1" value={cmd.height ?? 100} onChange={e => updateCommand({ height: parseFloat(e.target.value) || 100 } as any)} /></FormField>
                    </div>
                </>}
                {/* Parallax depth: shifts a Placed video with the scene's parallax. Best on overlay
                    (placed) videos — a fullscreen movie has no margin to drift into. */}
                <ParallaxDepthControl value={cmd.parallaxDepth} onChange={n => updateCommand({ parallaxDepth: n } as any)} />
            </>;
        case 'appearance':
            return <FormField label={t('movie.opacity', { value: Math.round((cmd.opacity ?? 1) * 100) })}>
                <input type="range" min="0" max="1" step="0.01" value={cmd.opacity ?? 1} onChange={e => updateCommand({ opacity: parseFloat(e.target.value) } as any)} className="w-full" />
            </FormField>;
        default:
            return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Choice (options list with per-option conditions + inline Jump/SetVariable actions)
// ─────────────────────────────────────────────────────────────────────────────
const genOptId = () => `opt-${Math.random().toString(36).substring(2, 9)}`;
const ChoiceGroup: React.FC<{ groupId: InspectorGroupId; cmd: any; updateCommand: UpdateCommand; project: VNProject; t: any }> = ({ groupId, cmd, updateCommand, project, t }) => {
    if (groupId !== 'content') return null;
    const updateOption = (index: number, updated: any) => {
        const newOptions = [...cmd.options];
        newOptions[index] = { ...newOptions[index], ...updated };
        if (newOptions[index].actions) delete (newOptions[index] as any).targetSceneId;
        updateCommand({ options: newOptions } as any);
    };
    const addOption = () => {
        const firstSceneId = Object.keys(project.scenes)[0];
        updateCommand({ options: [...cmd.options, { id: genOptId(), text: 'New Option', actions: [{ type: UIActionType.JumpToScene, targetSceneId: firstSceneId || '' }] }] } as any);
    };
    const removeOption = (index: number) => updateCommand({ options: cmd.options.filter((_: any, i: number) => i !== index) } as any);
    // Choice options carry the FULL VNUIAction set (same as buttons) — edited via the shared ActionEditor.
    const setAction = (oi: number, ai: number, newAction: VNUIAction) => {
        const opt = cmd.options[oi];
        const newActions = [...(opt.actions || [])];
        newActions[ai] = newAction;
        updateOption(oi, { actions: newActions });
    };
    const addAnyAction = (oi: number) => {
        const opt = cmd.options[oi];
        updateOption(oi, { actions: [...(opt.actions || []), { type: UIActionType.None }] });
    };
    const removeAction = (oi: number, ai: number) => updateOption(oi, { actions: (cmd.options[oi].actions || []).filter((_: any, i: number) => i !== ai) });

    return <div>
        <ChoiceLayoutSelect layout={cmd.layout} onChange={l => updateCommand({ layout: l } as any)} />
        {cmd.options.map((opt: any, i: number) => {
            const mo = ('targetSceneId' in opt && !('actions' in opt))
                ? { id: opt.id || genOptId(), text: opt.text, conditions: opt.conditions, actions: [{ type: UIActionType.JumpToScene, targetSceneId: opt.targetSceneId }] }
                : { ...opt, id: opt.id || genOptId(), actions: opt.actions || [] };
            return (
                <div key={mo.id} className="p-1 border border-[var(--border-subtle)] rounded-md mb-2">
                    <FormField label={`Option ${i + 1} Text`}><TextInput value={mo.text} onChange={e => updateOption(i, { text: e.target.value })} /></FormField>
                    <h4 className="font-bold text-xs mt-3 mb-1 text-[var(--text-secondary)]">{t('choice.conditions')}</h4>
                    <p className="text-xs text-[var(--text-muted)] mb-2">{t('choice.conditionsHint')}</p>
                    <ConditionsEditor conditions={mo.conditions} project={project} onChange={(cs) => updateOption(i, { conditions: cs })} />
                    <h4 className="font-bold text-xs mt-3 mb-1 text-[var(--text-secondary)]">{t('choice.actions')}</h4>
                    <div className="space-y-1.5">
                        {(mo.actions || []).map((action: any, ai: number) => (
                            <ActionCard key={ai} action={action} index={ai}
                                onActionChange={(na) => setAction(i, ai, na)} onRemove={() => removeAction(i, ai)} />
                        ))}
                        <div className="flex gap-1 pt-1">
                            <button onClick={() => addAnyAction(i)} className="text-xs bg-sky-600 hover:bg-sky-700 px-2 py-1 rounded flex items-center gap-1"><PlusIcon className="w-3 h-3" />{t('choice.addAction')}</button>
                        </div>
                    </div>
                    <ChoiceOptionAppearance option={mo} layout={cmd.layout} project={project} onChange={patch => updateOption(i, patch)} />
                    <button onClick={() => removeOption(i)} className="text-red-400 hover:text-red-300 text-xs mt-3">{t('choice.removeOption')}</button>
                </div>
            );
        })}
        <button onClick={addOption} className="text-sky-400 hover:text-sky-300 mt-2 flex items-center gap-1 text-xs"><PlusIcon className="w-4 h-4" />{t('choice.addOption')}</button>
    </div>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Niche commands: BranchStart/BranchEnd, Group, RunScript, StopParticles, CallCommonEvent
// (all Content-only besides the universal Conditions group)
// ─────────────────────────────────────────────────────────────────────────────
const NicheCommandGroup: React.FC<{ groupId: InspectorGroupId; command: VNCommand; updateCommand: UpdateCommand; project: VNProject; t: any; ctx?: GroupCtx }> = ({ groupId, command, updateCommand, project, t, ctx }) => {
    if (groupId !== 'content') return null;
    const cmd = command as any;
    switch (command.type) {
        case CommandType.BranchStart:
            return <>
                <FormField label="Branch Name"><TextInput value={cmd.name} onChange={e => updateCommand({ name: e.target.value } as any)} /></FormField>
                <FormField label="Branch Color">
                    <div className="flex gap-1 items-center">
                        <ColorInput value={cmd.color} onChange={val => updateCommand({ color: val } as any)} className="w-12 h-10" />
                        <TextInput value={cmd.color} onChange={e => updateCommand({ color: e.target.value } as any)} placeholder="#38bdf8" className="flex-grow" />
                    </div>
                </FormField>
            </>;
        case CommandType.BranchEnd: {
            const cmds = ctx ? (project.scenes[ctx.sceneId]?.commands || []) : [];
            const matchingStart = cmds.find(c => c.type === CommandType.BranchStart && (c as any).branchId === cmd.branchId) as any;
            return <p className="text-xs text-[var(--text-secondary)]">This marks the end of the branch: <strong className="text-[var(--accent-cyan)]">{matchingStart?.name || 'Unknown Branch'}</strong></p>;
        }
        case CommandType.Group:
            return <>
                <FormField label={t('group.name')}><TextInput value={cmd.name || ''} onChange={e => updateCommand({ name: e.target.value } as any)} placeholder={t('group.namePlaceholder')} /></FormField>
                <p className="text-xs text-[var(--text-secondary)] mt-2">{t('group.contains', { count: cmd.commandIds?.length || 0 })}</p>
            </>;
        case CommandType.RunScript: {
            const scripts = Object.values(project.scripts || {});
            const selectedScript = cmd.scriptId ? (project.scripts || {})[cmd.scriptId] : null;
            return <>
                <FormField label={t('runScript.script')}>
                    <Select value={cmd.scriptId} onChange={e => updateCommand({ scriptId: e.target.value } as any)}>
                        <option value="">{t('runScript.selectScript')}</option>
                        {scripts.map((s: any) => <option key={s.id} value={s.id}>{s.name}{!s.enabled ? t('runScript.disabled') : ''}</option>)}
                    </Select>
                </FormField>
                {scripts.length === 0 && <p className="text-xs text-amber-400">{t('runScript.noScripts')}</p>}
                {selectedScript && <div className="text-xs p-2 rounded mt-1" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                    <p><strong>{t('runScript.trigger')}</strong> {(selectedScript as any).trigger}</p>
                    {(selectedScript as any).description && <p className="mt-0.5">{(selectedScript as any).description}</p>}
                </div>}
                {selectedScript && (selectedScript as any).params && (selectedScript as any).params.length > 0 && (
                    <div className="mt-1">
                        <h4 className="font-bold text-xs mb-1 text-[var(--text-secondary)]">Arguments</h4>
                        {(selectedScript as any).params.map((p: any) => {
                            const argVal = cmd.arguments?.[p.id];
                            const current = argVal !== undefined ? argVal : p.defaultValue;
                            const setArg = (v: any) => updateCommand({ arguments: { ...(cmd.arguments || {}), [p.id]: v } } as any);
                            return (
                                <FormField key={p.id} label={`${p.name} (${p.type})`}>
                                    {p.type === 'boolean' ? (
                                        <Select value={String(current)} onChange={e => setArg(e.target.value === 'true')}>
                                            <option value="false">false</option>
                                            <option value="true">true</option>
                                        </Select>
                                    ) : (
                                        <TextInput type={p.type === 'number' ? 'number' : 'text'} value={String(current ?? '')} onChange={e => setArg(p.type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)} />
                                    )}
                                    {p.description && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{p.description}</span>}
                                </FormField>
                            );
                        })}
                    </div>
                )}
                <FormField label={t('runScript.waitForCompletion')}>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cmd.waitForCompletion} onChange={e => updateCommand({ waitForCompletion: e.target.checked } as any)} /><span className="text-xs text-[var(--text-primary)]">{t('runScript.waitForCompletionHint')}</span></label>
                </FormField>
            </>;
        }
        case CommandType.StopParticles: {
            const prior = ctx ? (project.scenes[ctx.sceneId]?.commands || []).filter((c, i) => c.type === CommandType.SpawnParticles && i < ctx.commandIndex) : [];
            const emitters = prior.map((c: any) => {
                const tag = c.particleTag || `particles_${c.id}`;
                const preset = c.config?.preset && c.config.preset !== 'none' ? c.config.preset : 'particles';
                return { tag, label: c.particleTag ? c.particleTag : `${preset} (${c.id.slice(0, 6)})` };
            });
            if (cmd.particleTag && !emitters.some((e: any) => e.tag === cmd.particleTag)) emitters.push({ tag: cmd.particleTag, label: cmd.particleTag });
            return <>
                <FormField label={t('particles.particleTag')}>
                    <Select value={cmd.particleTag || ''} onChange={e => updateCommand({ particleTag: e.target.value } as any)}>
                        <option value="">{t('particles.stopAll')}</option>
                        {emitters.map((em: any, i: number) => <option key={`${em.tag}-${i}`} value={em.tag}>{em.label}</option>)}
                    </Select>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.stopTagHint')}</span>
                </FormField>
                <FormField label={t('particles.fadeDurationSec')}>
                    <TextInput type="number" min="0" step="0.1" value={cmd.fadeDuration || 0} onChange={e => updateCommand({ fadeDuration: parseFloat(e.target.value) || 0 } as any)} />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.fadeInstant')}</span>
                </FormField>
            </>;
        }
        case CommandType.CallCommonEvent: {
            const commonEvents = Object.values(project.commonEvents || {});
            const selectedCE: any = cmd.commonEventId ? (project.commonEvents || {})[cmd.commonEventId] : null;
            return <>
                <FormField label={t('callCommonEvent.commonEvent')}>
                    <Select value={cmd.commonEventId || ''} onChange={e => updateCommand({ commonEventId: e.target.value } as any)}>
                        <option value="">{t('callCommonEvent.selectCommonEvent')}</option>
                        {commonEvents.map((ce: any) => <option key={ce.id} value={ce.id}>{ce.name}{!ce.enabled ? t('callCommonEvent.disabled') : ''}</option>)}
                    </Select>
                </FormField>
                {commonEvents.length === 0 && <p className="text-xs text-amber-400">{t('callCommonEvent.noCommonEvents')}</p>}
                {selectedCE && <div className="text-xs p-2 rounded mt-1" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                    <p><strong>{t('callCommonEvent.trigger')}</strong> {selectedCE.trigger}</p>
                    <p><strong>{t('callCommonEvent.commands')}</strong> {selectedCE.commands?.length || 0}</p>
                    {selectedCE.description && <p className="mt-0.5">{selectedCE.description}</p>}
                </div>}
            </>;
        }
        default:
            return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Collapsed/wedge summaries (one short line per group)
// ─────────────────────────────────────────────────────────────────────────────
export function summarizeGroup(groupId: InspectorGroupId, command: VNCommand, project: VNProject): string {
    const assetName = (map: Record<string, any>, id?: string | null) => (id && map[id]?.name) || '';
    if (groupId === 'conditions') {
        const n = (command as any).conditions?.length || 0;
        const live = (command as any).liveConditions ? ' · live' : '';
        return n ? `${n} condition(s)${live}` : 'none';
    }
    if (command.type === CommandType.Dialogue) {
        const cmd = command as DialogueCommand;
        switch (groupId) {
            case 'content': {
                const who = cmd.characterId ? (project.characters[cmd.characterId]?.name || '') : 'Narrator';
                const txt = (cmd.text || '').slice(0, 24);
                return [who, txt && `“${txt}${cmd.text.length > 24 ? '…' : ''}”`].filter(Boolean).join(' · ');
            }
            case 'effects': return cmd.textEffect?.type ? cmd.textEffect.type : 'none';
            case 'logic': return (cmd as any).conditions?.length ? `${(cmd as any).conditions.length} condition(s)` : '';
        }
    }
    if (command.type === CommandType.ShowButton) {
        const cmd = command as ShowButtonCommand;
        switch (groupId) {
            case 'content': return cmd.text || '';
            case 'transform': return `${cmd.x},${cmd.y} · ${cmd.width}×${cmd.height}%${cmd.rotation ? ` · ↻${cmd.rotation}°` : ''}`;
            case 'appearance': return `${cmd.fontSize ?? 18}px · ${cmd.backgroundColor || '#6366f1'}`;
            case 'media': return assetName(project.images as any, cmd.image?.id) || 'none';
            case 'logic': {
                const n = (cmd.actions?.length || 0) + (cmd.onClick && cmd.onClick.type !== UIActionType.None ? 1 : 0);
                const c = cmd.showConditions?.length || 0;
                return [n ? `${n} action(s)` : '', c ? `${c} show-cond` : ''].filter(Boolean).join(' · ') || 'none';
            }
            case 'animation': return `${cmd.transition} · ${cmd.duration}s`;
            case 'audio': return assetName(project.audio as any, cmd.clickSound) || 'none';
        }
    }
    if (command.type === CommandType.ShowText) {
        const cmd = command as ShowTextCommand;
        switch (groupId) {
            case 'content': { const txt = (cmd.text || '').slice(0, 24); return txt ? `“${txt}${cmd.text.length > 24 ? '…' : ''}”` : ''; }
            case 'transform': return `${cmd.x},${cmd.y}${cmd.rotation ? ` · ↻${cmd.rotation}°` : ''}`;
            case 'appearance': return `${cmd.fontSize ?? 16}px · ${cmd.color || '#fff'}`;
            case 'effects': {
                const on = [cmd.textShadow?.enabled && 'shadow', cmd.textGradient?.enabled && 'gradient', cmd.textBorder?.enabled && 'border'].filter(Boolean);
                return on.length ? on.join(' · ') : 'none';
            }
            case 'animation': return `${cmd.transition} · ${cmd.duration}s`;
        }
    }
    if (command.type === CommandType.ShowImage) {
        const cmd = command as ShowImageCommand;
        switch (groupId) {
            case 'content': return assetName(project.images as any, cmd.imageId) || assetName(project.backgrounds as any, cmd.imageId) || 'none';
            case 'transform': return `${cmd.x},${cmd.y} · ${cmd.width}×${cmd.height}${cmd.rotation ? ` · ↻${cmd.rotation}°` : ''}`;
            case 'appearance': return `${Math.round((cmd.opacity ?? 1) * 100)}%`;
            case 'animation': return `${cmd.transition} · ${cmd.duration}s`;
        }
    }
    if (command.type === CommandType.ShowCharacter) {
        const cmd = command as ShowCharacterCommand;
        const posStr = (p: any) => (p && typeof p === 'object') ? `${p.x},${p.y}` : (p || 'center');
        switch (groupId) {
            case 'content': { const cn = project.characters[cmd.characterId]?.name || '—'; const en = project.characters[cmd.characterId]?.expressions?.[cmd.expressionId]?.name || ''; return en ? `${cn} · ${en}` : cn; }
            case 'transform': return `${posStr(cmd.position)} · ${cmd.scale ?? 1}x`;
            case 'effects': { const n = cmd.visualEffects?.length || (cmd.visualEffect && cmd.visualEffect.type !== 'none' ? 1 : 0); return n ? `${n} effect(s)` : 'none'; }
            case 'animation': return `${cmd.transition} · ${cmd.duration}s`;
        }
    }
    if (command.type === CommandType.SetBackground) {
        const cmd = command as any;
        if (groupId === 'content') return cmd.backgroundColor || assetName(project.backgrounds as any, cmd.backgroundId) || assetName(project.images as any, cmd.backgroundId) || 'none';
        if (groupId === 'animation') return `${cmd.transition} · ${cmd.duration}s`;
    }
    if (command.type === CommandType.PlayMusic || command.type === CommandType.PlaySoundEffect) {
        if (groupId === 'audio') { const c = command as any; return assetName(project.audio as any, c.audioId) || 'none'; }
    }
    if (command.type === CommandType.StopMusic) {
        if (groupId === 'audio') return `fade ${(command as any).fadeDuration ?? 0}s`;
    }
    if (command.type === CommandType.StopSoundEffect) {
        if (groupId === 'audio') { const c = command as any; return c.audioId ? (assetName(project.audio as any, c.audioId) || '') : 'all'; }
    }
    if (command.type === CommandType.SetVariable) {
        if (groupId === 'logic') { const c = command as any; const n = project.variables[c.variableId]?.name || '?'; return `${n} ${c.operator} ${c.operator === 'random' ? `${c.randomMin ?? 0}-${c.randomMax ?? 100}` : c.value}`; }
    }
    if (command.type === CommandType.Jump) {
        if (groupId === 'content') return project.scenes[(command as any).targetSceneId]?.name || '—';
    }
    if (command.type === CommandType.Wait) {
        if (groupId === 'content') {
            const c = command as any;
            if (c.waitForItems) { const n = (c.targetItemIds || []).filter(Boolean).length; return `until ${c.itemsMode === 'any' ? 'any' : 'all'} of ${n} item${n === 1 ? '' : 's'}`; }
            return c.waitIndefinitelyForInput ? 'until input' : c.waitForInput ? `${c.duration}s or click` : `${c.duration}s`;
        }
    }
    if (command.type === CommandType.TextInput) {
        if (groupId === 'content') { const c = command as any; const n = project.variables[c.variableId]?.name || '?'; return `→ ${n}`; }
    }
    if (command.type === CommandType.HideCharacter) {
        const c = command as HideCharacterCommand;
        if (groupId === 'content') return project.characters[c.characterId]?.name || '—';
        if (groupId === 'animation') return `${c.transition} · ${c.duration}s`;
    }
    if (command.type === CommandType.HideText || command.type === CommandType.HideImage || command.type === CommandType.HideButton
        || command.type === CommandType.HideHotSpot) {
        const c = command as any;
        if (groupId === 'content') return c.targetCommandId ? '→ target' : 'no target';
        if (groupId === 'animation') return `${c.transition} · ${c.duration}s`;
    }
    if (command.type === CommandType.Choice) {
        if (groupId === 'content') { const n = (command as any).options?.length || 0; return `${n} option${n === 1 ? '' : 's'}`; }
    }
    if (command.type === CommandType.PlayMovie) {
        const c = command as any;
        if (groupId === 'content') { const v = project.videos[c.videoId] || (project.backgrounds as any)[c.videoId] || (project.images as any)?.[c.videoId]; return v ? `${v.name} · ${c.displayMode || 'fullscreen'}` : 'no video'; }
        if (groupId === 'transform') return c.objectFit || 'cover';
        if (groupId === 'appearance') return `${Math.round((c.opacity ?? 1) * 100)}%`;
    }
    if (command.type === CommandType.ShowHotSpot) {
        const c = command as any;
        if (groupId === 'content') return `${c.name || 'spot'} · ${c.trigger || 'click'}`;
        if (groupId === 'appearance') return c.visible ? 'visible' : 'invisible';
        if (groupId === 'logic') { const n = c.actions?.length || 0; return `${n} action${n === 1 ? '' : 's'}`; }
    }
    if (command.type === CommandType.CreditRoll) {
        const c = command as any;
        if (groupId === 'content') { const n = c.entries?.length || 0; return `${n} entr${n === 1 ? 'y' : 'ies'}`; }
        if (groupId === 'logic') return `${c.scrollSpeed || 60} px/s`;
        if (groupId === 'media') { const n = (c.backgrounds?.length || 0) + (c.media?.length || 0); return n ? `${n} asset${n === 1 ? '' : 's'}` : 'none'; }
    }
    if (command.type === CommandType.SpawnParticles) {
        const c = command as any;
        if (groupId === 'content') { const p = c.config?.preset; return p && p !== 'none' ? p : (c.particleTag || 'custom'); }
        if (groupId === 'effects') return `density ${c.config?.emitRate || 20}`;
    }
    if (command.type === CommandType.TweenElement) {
        const c = command as any;
        if (groupId === 'content') return `${c.targetType || '?'} · ${c.duration ?? 1}s`;
    }
    if (groupId === 'content') {
        const c = command as any;
        switch (command.type) {
            case CommandType.ShakeScreen: return `×${c.intensity}${c.duration === 0 ? ' · persistent' : ''}`;
            case CommandType.TintScreen: return c.color || '';
            case CommandType.PanZoomScreen: return `${c.zoom}x @ ${c.panX},${c.panY}`;
            case CommandType.ResetScreenEffects: return `${c.duration}s`;
            case CommandType.FlashScreen: return c.color || '';
            case CommandType.Lightning: return `${c.flashes ?? 2}× flash${c.thunderSfxId ? ' + thunder' : ''}`;
            case CommandType.Fireworks: return `${c.bursts ?? 3} burst${(c.bursts ?? 3) === 1 ? '' : 's'}${c.sfxId ? ' + boom' : ''}`;
            case CommandType.PlaceLights: return `${(c.lights || []).length} light${(c.lights || []).length === 1 ? '' : 's'}`;
            case CommandType.ClearLights: return 'clear lights';
            case CommandType.Flashlight: return c.enabled ? `on · r${c.radius ?? 22}%` : 'off';
            case CommandType.SetScreenOverlayEffect: return c.effectType || '';
            case CommandType.ShowScreen: return project.uiScreens[c.screenId]?.name || '—';
            case CommandType.Label:
            case CommandType.JumpToLabel: return c.labelId || '';
            case CommandType.BranchStart: return c.name || '';
            case CommandType.Group: return `${c.name || 'Group'} · ${c.commandIds?.length || 0}`;
            case CommandType.RunScript: return (project.scripts as any)?.[c.scriptId]?.name || '—';
            case CommandType.StopParticles: return c.particleTag || 'all';
            case CommandType.CallCommonEvent: return (project.commonEvents as any)?.[c.commonEventId]?.name || '—';
        }
    }
    return '';
}
