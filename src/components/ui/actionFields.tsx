import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { VNUIAction, UIActionType, RESET_ALL_VARIABLES } from '../../types/shared';
import { VNVariable, VNSetVariableOperator } from '../../features/variables/types';
import { VNScene } from '../../features/scene/types';
import { VNUIScreen } from '../../features/ui/types';
import { resolveBoolLabels } from '../../features/variables/booleanLabels';
import VariablePicker from '../variables/VariablePicker';
import ValueCalcEditor, { DEFAULT_CALC } from '../variables/ValueCalcEditor';
import { FormField, Select, TextInput, RangeInput } from './Form';
import type { ActionTargetableElement } from './UIActionsListEditor';
import { collectTimerIds } from '../../utils/actionMeta';
import AudioAdjustFields from './AudioAdjustFields';
import SearchableSelect from './SearchableSelect';

/**
 * THE single per-action parameter-field renderer, shared by ActionEditor (single action) and
 * UIActionsListEditor (action list). Previously each editor had its own switch and they drifted
 * (cause of the "Give Item shows no fields" bug). One switch here = no more drift.
 *
 * Two visual skins via `variant`:
 *  - 'form'    → FormField + Select/TextInput (the inspector ActionEditor look)
 *  - 'compact' → dense bare controls with a coloured left-border box (the list-editor look)
 *
 * Helpers are plain functions (NOT nested components) so inputs don't remount/lose focus per render.
 */
export interface ActionFieldsOptions {
    targetableElements?: ActionTargetableElement[];
    variant?: 'form' | 'compact';
    /** Injected by the action-list editors so a field can edit a NESTED action list (e.g. a timer's
     *  on-finish actions) without importing UIActionsListEditor here (which would be a circular import). */
    renderActionList?: (actions: VNUIAction[], onChange: (actions: VNUIAction[]) => void, label?: string) => React.ReactNode;
}

const ActionFields: React.FC<{
    action: VNUIAction;
    project: VNProject;
    onChange: (next: VNUIAction) => void;
    options?: ActionFieldsOptions;
}> = ({ action, project, onChange, options }) => {
    const { t } = useTranslation('ui');
    const variant = options?.variant ?? 'form';
    const targets = options?.targetableElements || [];
    const a = action as any;
    const set = (patch: Record<string, unknown>) => onChange({ ...action, ...patch } as VNUIAction);

    const inputCls = 'w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]';
    const borderByColor: Record<string, string> = { sky: 'border-sky-500/30', purple: 'border-purple-500/30', amber: 'border-amber-500/30' };

    // Coloured/box wrapper around a group of controls.
    const group = (color: string, children: React.ReactNode) => variant === 'form'
        ? <div className="space-y-2 p-2 border border-slate-700 rounded">{children}</div>
        : <div className={`ml-3 mt-1 mb-2 p-1.5 border-l-2 ${borderByColor[color] || borderByColor.sky} space-y-1`}>{children}</div>;

    // A labelled control: form wraps in FormField; compact renders the control bare.
    const field = (label: string, control: React.ReactNode) => variant === 'form'
        ? <FormField label={label}>{control}</FormField>
        : <>{control}</>;

    const sel = (value: string, onCh: (v: string) => void, children: React.ReactNode) => variant === 'form'
        ? <Select value={value} onChange={e => onCh(e.target.value)}>{children}</Select>
        : <select value={value} onChange={e => onCh(e.target.value)} className={inputCls}>{children}</select>;

    /* Searchable variant for the LONG lists (audio, video): type-to-filter instead of scrolling a
     * hundred assets. Separate from `sel` because SearchableSelect takes an options ARRAY, not
     * <option> children. The search box only appears past 5 options, so small projects see a
     * normal dropdown. Same control both variants — the compact list editor gets it too. */
    const searchSel = (value: string, onCh: (v: string) => void,
        options: { value: string; label: string; group?: string }[], placeholder: string) => (
        <SearchableSelect value={value} onChange={onCh} options={options} placeholder={placeholder}
            className={variant === 'compact' ? 'text-[10px]' : undefined} />
    );

    const txt = (value: string, onCh: (v: string) => void, opts?: { type?: string; min?: number; placeholder?: string; list?: string }) => variant === 'form'
        ? <TextInput type={opts?.type} value={value} onChange={e => onCh(e.target.value)} placeholder={opts?.placeholder} list={opts?.list} />
        : <input type={opts?.type || 'text'} min={opts?.min} value={value} onChange={e => onCh(e.target.value)} placeholder={opts?.placeholder} className={inputCls} list={opts?.list} />;

    // Screen elements grouped by screen, for Show/Hide-Element pickers.
    const elementsByScreen = Object.values(project.uiScreens).map((s: VNUIScreen) => ({
        screenId: s.id, screenName: s.name,
        elements: Object.values(s.elements || {}).map((el: any) => ({ id: el.id as VNID, name: (el.name || el.type) as string })),
    })).filter(g => g.elements.length > 0);
    const numericVariables = Object.values(project.variables).filter((v: VNVariable) => v.type === 'number');

    switch (action.type) {
        case UIActionType.GoToScreen:
            return group('sky', field(t('actionEditor.targetScreen', 'Target screen'), sel(a.targetScreenId || '', v => set({ targetScreenId: v }), <>
                {Object.values(project.uiScreens).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </>)));
        case UIActionType.ToggleScreen:
            return group('sky', field(t('actionEditor.screenToToggle', 'Screen to toggle'), sel(a.targetScreenId || '', v => set({ targetScreenId: v }), <>
                <option value="">{t('actionsList.selectScreen', 'Select a screen…')}</option>
                {Object.values(project.uiScreens).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </>)));
        case UIActionType.OpenPhoneApp:
            // Registry app ids kept as literals so this editor file doesn't import the engine module.
            return group('sky', field(t('actionEditor.phoneApp', 'Phone app'), sel(a.appId || 'chat', v => set({ appId: v }), <>
                <option value="chat">{t('actionEditor.phoneAppChat', 'Messages')}</option>
                <option value="contacts">{t('actionEditor.phoneAppContacts', 'Contacts')}</option>
                <option value="history">{t('actionEditor.phoneAppHistory', 'Recents')}</option>
                <option value="gallery">{t('actionEditor.phoneAppGallery', 'Gallery')}</option>
                <option value="map">{t('actionEditor.phoneAppMap', 'Map')}</option>
                <option value="settings">{t('actionEditor.phoneAppSettings', 'Settings')}</option>
            </>)));
        case UIActionType.ShowMap:
            return group('sky', field(t('actionEditor.whichMap', 'Map'), sel(a.mapId || '', v => set({ mapId: v }), <>
                <option value="">{t('actionEditor.selectMap', 'Select a map…')}</option>
                {Object.values((project as any).maps || {}).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </>)));
        case UIActionType.ShowMiniGame:
            return group('sky', field(t('actionEditor.whichMiniGame', 'Mini game'), sel(a.gameId || '', v => set({ gameId: v }), <>
                <option value="">{t('actionEditor.selectMiniGame', 'Select a mini game…')}</option>
                {Object.values((project as any).miniGames || {}).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </>)));
        case UIActionType.ShowElement:
        case UIActionType.HideElement: {
            const verb = action.type === UIActionType.ShowElement ? t('actionEditor.elementToShow', 'Element to show') : t('actionEditor.elementToHide', 'Element to hide');
            return group('sky', field(verb, sel(a.targetElementId || '', v => set({ targetElementId: v }), <>
                <option value="">{t('actionEditor.selectElement', 'Select an element…')}</option>
                {elementsByScreen.map(g => <optgroup key={g.screenId} label={g.screenName}>
                    {g.elements.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
                </optgroup>)}
            </>)));
        }
        case UIActionType.HideImage: {
            /* PICTURES ONLY. "Hide Element" lists every element on every screen, so finding the one
             * picture you meant is a hunt — that's the whole point of this action. Screens list only
             * their picture elements; scenes list the pictures the story itself put up (Show Image),
             * so one action covers "hide that picture" wherever the picture lives. */
            const screenPictures = Object.values(project.uiScreens).map((s: VNUIScreen) => ({
                id: s.id,
                name: s.name,
                pictures: Object.values(s.elements || {})
                    .filter((el: any) => el.type === 'Image' || el.type === 'draggableImageElement')
                    .map((el: any) => ({ id: el.id as VNID, name: (el.name || el.type) as string })),
            })).filter(g => g.pictures.length > 0);
            const scenePictures = Object.values(project.scenes as any).map((sc: any) => ({
                id: sc.id,
                name: sc.name,
                pictures: (sc.commands || [])
                    .filter((cc: any) => cc.type === 'ShowImage')
                    .map((cc: any) => ({
                        id: cc.id as VNID,
                        name: (project.images as any)[cc.imageId]?.name
                            || (project.backgrounds as any)[cc.imageId]?.name
                            || t('actionEditor.unnamedImage', 'Untitled image'),
                    })),
            })).filter((g: any) => g.pictures.length > 0);
            const hasAny = screenPictures.length > 0 || scenePictures.length > 0;
            return group('sky', <>
                {field(t('actionEditor.imageToHide', 'Picture to hide'), sel(a.targetCommandId || '', v => set({ targetCommandId: v }), <>
                    <option value="">{t('actionEditor.selectImage', 'Select a picture…')}</option>
                    {screenPictures.map(g => <optgroup key={`scr-${g.id}`} label={g.name}>
                        {g.pictures.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>)}
                    {scenePictures.map((g: any) => <optgroup key={`scn-${g.id}`} label={`${g.name} — ${t('actionEditor.inScene', 'in the story')}`}>
                        {g.pictures.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>)}
                </>))}
                {!hasAny && (
                    <p className="text-[10px] text-[var(--text-muted)]">
                        {t('actionEditor.noPictures', 'No pictures yet — add a picture to a screen, or a Show Image command to a scene.')}
                    </p>
                )}
            </>);
        }
        case UIActionType.JumpToScene:
            return group('sky', <>
                {field(t('actionEditor.targetScene', 'Target scene'), sel(a.targetSceneId || '', v => set({ targetSceneId: v }), <>
                    <option value="">{t('actionsList.selectScene', 'Select a scene…')}</option>
                    {Object.values(project.scenes).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </>))}
                {field(t('actionEditor.jumpTransition', 'Scene transition'), sel(a.transition || '', v => set({ transition: v || undefined }), <>
                    <option value="">{t('actionEditor.jumpTransitionDefault', "Use the scene's setting")}</option>
                    <option value="fade">{t('actionEditor.jumpTransitionFade', 'Fade to black')}</option>
                    <option value="dissolve">{t('actionEditor.jumpTransitionDissolve', 'Dissolve')}</option>
                    <option value="iris-out">{t('actionEditor.jumpTransitionIris', 'Iris (closing circle)')}</option>
                    <option value="wipe-right">{t('actionEditor.jumpTransitionWipe', 'Wipe')}</option>
                    <option value="slide-left">{t('actionEditor.jumpTransitionSlide', 'Slide')}</option>
                    <option value="instant">{t('actionEditor.jumpTransitionInstant', 'Instant (no effect)')}</option>
                    {Object.values(project.customTransitions ?? {}).length > 0 && (
                        <optgroup label={t('actionEditor.jumpTransitionYours', 'Your transitions')}>
                            {Object.values(project.customTransitions ?? {}).map((ct: any) => <option key={ct.id} value={`custom:${ct.id}`}>{ct.name}</option>)}
                        </optgroup>
                    )}
                </>))}
            </>);
        case UIActionType.JumpToLabel: {
            const labels: Array<{ labelId: string; sceneName: string }> = [];
            Object.values(project.scenes).forEach((scene: VNScene) => scene.commands.forEach((cmd: any) => {
                if (cmd.labelId) labels.push({ labelId: cmd.labelId, sceneName: scene.name });
            }));
            return group('sky', variant === 'form'
                ? field(t('actionEditor.targetLabel', 'Target label'), sel(a.targetLabel || '', v => set({ targetLabel: v }), <>
                    {labels.length === 0 && <option value="">{t('actionEditor.noLabels', 'No labels')}</option>}
                    {labels.map((l, i) => <option key={i} value={l.labelId}>{l.labelId} · {l.sceneName}</option>)}
                </>))
                : txt(a.targetLabel || '', v => set({ targetLabel: v }), { placeholder: t('actionsList.labelName', 'Label name') }));
        }
        case UIActionType.SetVariable: {
            const variable = a.variableId ? project.variables[a.variableId] : null;
            const isNum = variable?.type === 'number';
            const varSelect = (
                <VariablePicker value={a.variableId || ''} onChange={v => {
                    const nv = project.variables[v];
                    let op = a.operator;
                    if (nv?.type !== 'number' && (op === 'add' || op === 'subtract' || op === 'random' || op === 'addRandom' || op === 'subtractRandom')) op = 'set';
                    // Keep `value` concrete & type-appropriate so a boolean Set never saves an empty value
                    // (the engine reads an empty boolean Set as its default, not a real Yes/No choice).
                    let value = a.value;
                    if (nv?.type === 'boolean' && typeof value !== 'boolean') value = true;
                    else if (nv?.type !== 'boolean' && typeof value === 'boolean') value = '';
                    // From-a-variable / calculation values are number-only — strip them on a type change.
                    const strip = nv?.type !== 'number' && (a as any).valueSource
                        ? { valueSource: undefined, valueVariableId: undefined, calc: undefined }
                        : {};
                    set({ variableId: v, operator: op, value, ...strip } as any);
                }} />
            );
            const opSelect = sel(a.operator || 'set', v => set({ operator: v as VNSetVariableOperator }), <>
                <option value="set">{t('actionsList.setTo', 'Set to')}</option>
                {isNum && <option value="add">{t('actionsList.addOp', 'Add')}</option>}
                {isNum && <option value="subtract">{t('actionsList.subtract', 'Subtract')}</option>}
                {isNum && <option value="random">{t('actionsList.random', 'Random')}</option>}
                {isNum && <option value="addRandom">{t('actionsList.addRandom', 'Add random')}</option>}
                {isNum && <option value="subtractRandom">{t('actionsList.subtractRandom', 'Subtract random')}</option>}
            </>);
            const isRandomOp = a.operator === 'random' || a.operator === 'addRandom' || a.operator === 'subtractRandom';
            // Random min/max live on their OWN full-width row (see the compact return below) —
            // sharing a flex row with the w-full operator select crushed them into unusable
            // slivers (user report: "the boxes look like just slits").
            const randomRangeRow = isRandomOp && isNum ? (
                <div className="flex gap-1 mt-1">
                    <label className="flex-1 flex items-center gap-1 text-[9px] text-slate-400 min-w-0">
                        <span className="shrink-0">{t('actionsList.min', 'Min')}</span>
                        <input type="number" value={a.randomMin ?? 0} onChange={e => set({ randomMin: Number(e.target.value) })} className={inputCls} style={{ minWidth: '3rem' }} />
                    </label>
                    <label className="flex-1 flex items-center gap-1 text-[9px] text-slate-400 min-w-0">
                        <span className="shrink-0">{t('actionsList.max', 'Max')}</span>
                        <input type="number" value={a.randomMax ?? 100} onChange={e => set({ randomMax: Number(e.target.value) })} className={inputCls} style={{ minWidth: '3rem' }} />
                    </label>
                </div>
            ) : null;
            // Value mode: absent fields = "a value I type" (old data, byte-identical). Number-only.
            const valueMode: 'typed' | 'variable' | 'calc' =
                (a as any).valueSource === 'variable' ? 'variable' : (a as any).valueSource === 'calc' ? 'calc' : 'typed';
            const showModeSelect = isNum && !isRandomOp;
            const setValueMode = (mode: string) => {
                if (mode === 'typed') set({ valueSource: undefined, valueVariableId: undefined, calc: undefined } as any);
                else if (mode === 'variable') set({ valueSource: 'variable', calc: undefined } as any);
                else set({ valueSource: 'calc', valueVariableId: undefined, calc: (a as any).calc ?? DEFAULT_CALC } as any);
            };
            const modeSelect = showModeSelect ? sel(valueMode, setValueMode, <>
                <option value="typed">{t('actionsList.valueModeTyped', 'A value I type')}</option>
                <option value="variable">{t('actionsList.valueModeVariable', "Another variable's value")}</option>
                <option value="calc">{t('actionsList.valueModeCalc', 'A calculation')}</option>
            </>) : null;
            const otherVarPicker = showModeSelect && valueMode === 'variable' ? (
                <VariablePicker value={(a as any).valueVariableId || ''} onChange={v => set({ valueVariableId: v } as any)} allowedTypes={['number']} />
            ) : null;
            const calcEditor = showModeSelect && valueMode === 'calc' ? (
                <ValueCalcEditor calc={(a as any).calc} onChange={calc => set({ calc } as any)} project={project} />
            ) : null;
            const valueCtl = (isRandomOp && isNum) || (showModeSelect && valueMode !== 'typed') ? null
            : variable?.type === 'boolean' ? sel(a.value === false ? 'false' : 'true', v => set({ value: v === 'true' }), <>
                <option value="true">{resolveBoolLabels(variable, t('actionsList.true', 'Yes'), t('actionsList.false', 'No')).yes}</option>
                <option value="false">{resolveBoolLabels(variable, t('actionsList.true', 'Yes'), t('actionsList.false', 'No')).no}</option>
            </>) : (
                <input type={isNum ? 'number' : 'text'} value={String(a.value ?? '')} placeholder={t('actionsList.value', 'Value')}
                    onChange={e => set({ value: isNum ? Number(e.target.value) : e.target.value })} className={inputCls} />
            );
            if (variant === 'form') {
                return group('sky', <>
                    {field(t('actionEditor.variable', 'Variable'), varSelect)}
                    {field(t('actionEditor.operator', 'Operator'), opSelect)}
                    {modeSelect && field(t('actionEditor.valueMode', 'What value?'), modeSelect)}
                    {isRandomOp && isNum
                        ? <div className="grid grid-cols-2 gap-2">
                            <FormField label={t('actionEditor.min', 'Min')}><TextInput type="number" value={String(a.randomMin ?? 0)} onChange={e => set({ randomMin: parseFloat(e.target.value) || 0 })} /></FormField>
                            <FormField label={t('actionEditor.max', 'Max')}><TextInput type="number" value={String(a.randomMax ?? 100)} onChange={e => set({ randomMax: parseFloat(e.target.value) || 100 })} /></FormField>
                          </div>
                        : otherVarPicker ? field(t('actionEditor.valueOtherVariable', 'Which variable?'), otherVarPicker)
                        : calcEditor ? calcEditor
                        : field(t('actionEditor.value', 'Value'), valueCtl)}
                </>);
            }
            return group('sky', <>
                {varSelect}
                <div className="flex gap-1">{opSelect}{valueCtl}</div>
                {/* Mode select + its editors get their own full-width rows (the randomRangeRow
                    lesson: sharing a flex row with the operator select crushes inputs to slits). */}
                {modeSelect && <div className="mt-1">{modeSelect}</div>}
                {otherVarPicker && <div className="mt-1">{otherVarPicker}</div>}
                {calcEditor && <div className="mt-1">{calcEditor}</div>}
                {randomRangeRow}
            </>);
        }
        case UIActionType.ResetVariable:
            return group('sky', field(t('actionEditor.variableToReset', 'Variable to reset'), sel(a.variableId || '', v => set({ variableId: v }), <>
                <option value={RESET_ALL_VARIABLES}>{t('actionsList.allVariables', 'All variables')}</option>
                <option value="">{t('actionsList.selectVariable', 'Select a variable…')}</option>
                {Object.values(project.variables).map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
            </>)));
        case UIActionType.PlaySound:
            return group('purple', <>
                {field(t('actionEditor.audio', 'Audio'),
                    searchSel(a.audioId || '', v => set({ audioId: v }),
                        [{ value: '', label: t('actionsList.selectAudio', 'Select audio…') },
                         ...Object.values(project.audio).map((au: any) => ({ value: au.id, label: au.name }))],
                        t('actionsList.selectAudio', 'Select audio…')))}
                <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[var(--text-secondary)]">{t('actionsList.volume', 'Volume')}</span>
                    <RangeInput min={0} max={1} step={0.01} value={a.volume ?? 1} onChange={e => set({ volume: parseFloat(e.target.value) })} className="flex-1 accent-[var(--accent-lavender)]" />
                </div>
                <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                    <input type="checkbox" checked={a.loop ?? false} onChange={e => set({ loop: e.target.checked })} />
                    {t('actionsList.loop', 'Loop')}
                </label>
                <AudioAdjustFields value={a.audioAdjust} onChange={next => set({ audioAdjust: next })} allowReverse project={project} audioId={a.audioId || null} />
            </>);
        case UIActionType.StopSound:
            return group('purple', <>
                {field(t('actionEditor.soundToStop', 'Sound to stop'),
                    searchSel(a.audioId || '', v => set({ audioId: v || null }),
                        [{ value: '', label: t('actionEditor.allSounds', 'All playing sounds') },
                         ...Object.values(project.audio).map((au: any) => ({ value: au.id, label: au.name }))],
                        t('actionEditor.allSounds', 'All playing sounds')))}
                {field(t('actionsList.fadeSeconds', 'Fade (seconds)'), txt(String(a.fadeDuration ?? 0), v => set({ fadeDuration: Math.max(0, parseFloat(v) || 0) }), { type: 'number', min: 0 }))}
                <p className="text-[10px] text-[var(--text-muted)]">{t('actionEditor.stopSoundHint', 'Stops sound effects — background music has its own Stop Music action.')}</p>
            </>);
        case UIActionType.PlayVideo: {
            // A video can live in videos OR backgrounds/images (upload-tab siloing) — list them all,
            // GROUPED by pool: three merged lists made same-named videos indistinguishable.
            const videoOptions = [
                ...Object.values(project.videos || {}).map((v: any) => ({ value: v.id, label: v.name, group: t('actionEditor.groupVideos', 'Videos') })),
                ...Object.values(project.backgrounds || {}).filter((v: any) => v.isVideo || v.videoUrl).map((v: any) => ({ value: v.id, label: v.name, group: t('actionEditor.groupBackgrounds', 'Backgrounds') })),
                ...Object.values(project.images || {}).filter((v: any) => v.isVideo || v.videoUrl).map((v: any) => ({ value: v.id, label: v.name, group: t('actionEditor.groupImages', 'Images') })),
            ];
            return group('purple', <>
                {field(t('actionEditor.video', 'Video'),
                    searchSel(a.videoId || '', v => set({ videoId: v || null }), videoOptions,
                        t('actionEditor.selectVideo', 'Select a video…')))}
                <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                    <input type="checkbox" checked={a.loop ?? false} onChange={e => set({ loop: e.target.checked })} />
                    {t('actionsList.loop', 'Loop')}
                </label>
                <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                    <input type="checkbox" checked={a.blockInput ?? false} disabled={a.loop ?? false} onChange={e => set({ blockInput: e.target.checked })} />
                    {t('actionEditor.videoBlockInput', "Players can't skip it (no clicking through)")}
                </label>
                {(a.loop ?? false) && <p className="text-[10px] text-[var(--text-muted)]">{t('actionEditor.videoLoopBlockHint', 'A looping video always stays skippable — otherwise it could never be closed.')}</p>}
                {options?.renderActionList
                    ? <div className="mt-1">{options.renderActionList((a.onEndActions as VNUIAction[]) || [], (acts) => set({ onEndActions: acts }), t('actionEditor.videoOnEnd', 'When the video ends, run'))}</div>
                    : null}
            </>);
        }
        case UIActionType.PlayMusic:
            return group('purple', <>
                {field(t('actionEditor.music', 'Music'),
                    searchSel(a.audioId || '', v => set({ audioId: v }),
                        [{ value: '', label: t('actionsList.selectAudio', 'Select audio…') },
                         ...Object.values(project.audio).map((au: any) => ({ value: au.id, label: au.name }))],
                        t('actionsList.selectAudio', 'Select audio…')))}
                <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[var(--text-secondary)]">{t('actionsList.volume', 'Volume')}</span>
                    <RangeInput min={0} max={1} step={0.01} value={a.volume ?? 1} onChange={e => set({ volume: parseFloat(e.target.value) })} className="flex-1 accent-[var(--accent-lavender)]" />
                </div>
                {field(t('actionsList.fadeSeconds', 'Fade (seconds)'), txt(String(a.fadeDuration ?? 1), v => set({ fadeDuration: Math.max(0, parseFloat(v) || 0) }), { type: 'number', min: 0 }))}
                <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                    <input type="checkbox" checked={a.loop ?? true} onChange={e => set({ loop: e.target.checked })} />
                    {t('actionsList.loop', 'Loop')}
                </label>
                <AudioAdjustFields value={a.audioAdjust} onChange={next => set({ audioAdjust: next })} allowReverse={false} project={project} audioId={a.audioId || null} />
            </>);
        case UIActionType.StopMusic:
            return group('purple', <>
                {field(t('actionsList.fadeSeconds', 'Fade (seconds)'), txt(String(a.fadeDuration ?? 1), v => set({ fadeDuration: Math.max(0, parseFloat(v) || 0) }), { type: 'number', min: 0 }))}
            </>);
        case UIActionType.ShowFlashlight:
            return group('amber', <>
                {field(t('actionsList.radius', 'Radius %'), <RangeInput min={8} max={60} value={a.radius ?? 22} onChange={e => set({ radius: parseInt(e.target.value, 10) })} className="flex-1 accent-[var(--accent-lavender)]" />)}
                {field(t('actionsList.darkness', 'Darkness'), <RangeInput min={0.2} max={1} step={0.05} value={a.darkness ?? 0.85} onChange={e => set({ darkness: parseFloat(e.target.value) })} className="flex-1 accent-[var(--accent-lavender)]" />)}
                {field(t('actionsList.color', 'Color'), txt(a.color ?? '#000000', v => set({ color: v })))}
                {field(t('actionsList.toggleKey', 'Toggle key'), txt(a.toggleKey ?? '', v => set({ toggleKey: v || undefined }), { placeholder: 'f' }))}
            </>);
        case UIActionType.ShowSpotlight:
            return group('amber', <>
                {field(t('actionsList.beamWidth', 'Beam width %'), <RangeInput min={5} max={100} value={a.beamWidth ?? 45} onChange={e => set({ beamWidth: parseInt(e.target.value, 10) })} className="flex-1 accent-[var(--accent-lavender)]" />)}
                {field(t('actionsList.sourceWidth', 'Source width %'), <RangeInput min={0} max={60} value={a.sourceWidth ?? 8} onChange={e => set({ sourceWidth: parseInt(e.target.value, 10) })} className="flex-1 accent-[var(--accent-lavender)]" />)}
                {field(t('actionsList.darkness', 'Darkness'), <RangeInput min={0.2} max={1} step={0.05} value={a.intensity ?? 0.85} onChange={e => set({ intensity: parseFloat(e.target.value) })} className="flex-1 accent-[var(--accent-lavender)]" />)}
                {field(t('actionsList.color', 'Beam color'), txt(a.color ?? '#fff3d6', v => set({ color: v })))}
                <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]"><input type="checkbox" checked={a.followMouse !== false} onChange={e => set({ followMouse: e.target.checked })} />{t('actionsList.swivel', 'Swivel toward the mouse')}</label>
                {field(t('actionsList.toggleKey', 'Toggle key'), txt(a.toggleKey ?? '', v => set({ toggleKey: v || undefined }), { placeholder: 'f' }))}
            </>);
        case UIActionType.CycleLayerAsset: {
            const character = a.characterId ? project.characters[a.characterId] : undefined;
            const availableLayers = character ? Object.values(character.layers) : [];
            return group('purple', <>
                {field(t('actionEditor.character', 'Character'), sel(a.characterId || '', v => {
                    const nc = project.characters[v];
                    set({ characterId: v, layerId: nc ? Object.keys(nc.layers)[0] || '' : '' });
                }, <>
                    <option value="">—</option>
                    {Object.values(project.characters).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </>))}
                {a.characterId && field(t('actionEditor.layer', 'Layer'), sel(a.layerId || '', v => set({ layerId: v }), <>
                    {availableLayers.map((layer: any) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
                </>))}
                {field(t('actionEditor.indexVariable', 'Index variable'), sel(a.variableId || '', v => set({ variableId: v }), <>
                    <option value="">—</option>
                    {numericVariables.map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </>))}
                {field(t('actionEditor.direction', 'Direction'), sel(a.direction || 'next', v => set({ direction: v as 'next' | 'prev' }), <>
                    <option value="next">{t('actionEditor.dirNext', 'Next')}</option>
                    <option value="prev">{t('actionEditor.dirPrev', 'Previous')}</option>
                </>))}
            </>);
        }
        case UIActionType.ChangePose: {
            const poseChar = a.characterId ? project.characters[a.characterId] : undefined;
            const poses = poseChar ? Object.values(poseChar.poses || {}) : [];
            return group('purple', <>
                {field(t('actionEditor.character', 'Character'), sel(a.characterId || '', v => set({ characterId: v, poseId: null }), <>
                    <option value="">—</option>
                    {Object.values(project.characters).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </>))}
                {field(t('actionEditor.pose', 'Pose'), sel(a.poseId || '', v => set({ poseId: v || null }), <>
                    <option value="">{t('actionEditor.poseDefault', 'Default pose')}</option>
                    {poses.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </>))}
                <p className="text-[10px] col-span-2" style={{ color: 'var(--text-muted)' }}>
                    {t('actionEditor.changePoseHint', 'Only works while that character is on stage. Their outfit and position stay exactly as they are.')}
                </p>
            </>);
        }
        case UIActionType.ChangeCharacter: {
            const incoming = a.toCharacterId ? project.characters[a.toCharacterId] : undefined;
            return group('purple', <>
                {field(t('actionEditor.swapFrom', 'Replace who is on stage'), sel(a.fromCharacterId || '', v => set({ fromCharacterId: v }), <>
                    <option value="">—</option>
                    {Object.values(project.characters).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </>))}
                {field(t('actionEditor.swapTo', 'With this character'), sel(a.toCharacterId || '', v => set({ toCharacterId: v, expressionId: null, poseId: null }), <>
                    <option value="">—</option>
                    {Object.values(project.characters).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </>))}
                {incoming && field(t('actionEditor.expression', 'Expression'), sel(a.expressionId || '', v => set({ expressionId: v || null }), <>
                    <option value="">{t('actionEditor.expressionFirst', 'Their first expression')}</option>
                    {Object.values(incoming.expressions || {}).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </>))}
                {incoming && field(t('actionEditor.pose', 'Pose'), sel(a.poseId || '', v => set({ poseId: v || null }), <>
                    <option value="">{t('actionEditor.poseDefault', 'Default pose')}</option>
                    {Object.values(incoming.poses || {}).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </>))}
                <p className="text-[10px] col-span-2" style={{ color: 'var(--text-muted)' }}>
                    {t('actionEditor.changeCharacterHint', 'The newcomer takes over the same spot — same position and size as the character they replace.')}
                </p>
            </>);
        }
        case UIActionType.PlayCharacterAnimation: {
            const animChar = a.characterId ? project.characters[a.characterId] : undefined;
            const anims = animChar ? Object.values((animChar as any).animations || {}) : [];
            return group('purple', <>
                {field(t('actionEditor.character', 'Character'), sel(a.characterId || '', v => set({ characterId: v, animationId: null }), <>
                    <option value="">—</option>
                    {Object.values(project.characters).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </>))}
                {field(t('actionEditor.animation', 'Animation'), sel(a.animationId || '', v => set({ animationId: v || null }), <>
                    <option value="">{t('actionEditor.animationStop', 'Stop the current animation')}</option>
                    {anims.map((an: any) => <option key={an.id} value={an.id}>{an.name}</option>)}
                </>))}
                <p className="text-[10px] col-span-2" style={{ color: 'var(--text-muted)' }}>
                    {t('actionEditor.playCharacterAnimationHint', 'Plays one of the character\'s own animations (made in the Animation Studio). Only works while they are on stage.')}
                </p>
            </>);
        }
        case UIActionType.OpenURL:
            return group('sky', <>
                {field(t('actionEditor.url', 'URL'), txt(a.url || '', v => set({ url: v }), { placeholder: t('actionEditor.urlPlaceholder', 'https://…') }))}
                <label className={`flex items-center gap-1 ${variant === 'form' ? 'text-xs text-slate-300' : 'text-[10px] text-[var(--text-secondary)]'}`}>
                    <input type="checkbox" checked={a.newTab !== false} onChange={e => set({ newTab: e.target.checked })} />
                    {t('actionEditor.openNewTab', 'Open in a new tab')}
                </label>
            </>);
        case UIActionType.CloseScreen:
            return group('sky', field(t('actionEditor.screenToClose', 'Screen to close'),
                sel(a.targetScreenId || '', v => set({ targetScreenId: v || undefined }), <>
                    <option value="">{t('actionEditor.closeThisScreen', 'The screen this button is on')}</option>
                    {Object.values(project.uiScreens).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </>)));
        case UIActionType.SetFullscreen:
            return group('sky', field(t('actionEditor.fullscreenMode', 'What this button does'),
                sel(a.mode || 'toggle', v => set({ mode: v }), <>
                    <option value="toggle">{t('actionEditor.fullscreenToggle', 'Switch between full screen and windowed')}</option>
                    <option value="on">{t('actionEditor.fullscreenOn', 'Go full screen')}</option>
                    <option value="off">{t('actionEditor.fullscreenOff', 'Leave full screen (windowed)')}</option>
                </>)));
        case UIActionType.SetLanguage: {
            const langs = ((project as any).localization?.languages || []) as { code: string; name: string }[];
            const sourceLanguage = (project as any).localization?.sourceLanguage || 'en';
            return group('sky', <>
                {field(t('actionEditor.language', 'Language'), sel(a.languageCode ?? '', v => set({ languageCode: v }), <>
                    <option value="">{t('actionEditor.languageOriginal', 'The language the game is written in')}</option>
                    {langs.map(l => <option key={l.code} value={l.code}>{l.name} ({l.code})</option>)}
                </>))}
                {!langs.length && (
                    <p className={variant === 'form' ? 'text-xs text-amber-400' : 'text-[10px] text-amber-400'}>
                        {t('actionEditor.noLanguagesYet', 'No languages added yet — add one in Translate your game first.')}
                    </p>
                )}
                {a.languageCode === sourceLanguage && (
                    <p className={variant === 'form' ? 'text-xs text-slate-400' : 'text-[10px] text-[var(--text-secondary)]'}>
                        {t('actionEditor.languageIsSource', 'This is the language the game is written in.')}
                    </p>
                )}
            </>);
        }
        case UIActionType.CallCommonEvent:
            return group('sky', field(t('actionEditor.commonEvent', 'Common Event'), sel(a.commonEventId || '', v => set({ commonEventId: v }), <>
                <option value="">{t('actionEditor.selectCommonEvent', 'Select a common event…')}</option>
                {Object.values((project as any).commonEvents || {}).map((ce: any) => <option key={ce.id} value={ce.id}>{ce.name}{!ce.enabled ? ' (disabled)' : ''}</option>)}
            </>)));
        case UIActionType.PlayAnimation:
            return group('purple', <>
                {field(t('actionEditor.targetElement', 'Target element'), sel(a.targetElementId || '', v => set({ targetElementId: v }), <>
                    <option value="">{t('actionsList.selectElement', 'Select an element…')}</option>
                    {targets.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
                </>))}
                <div className="flex gap-1">
                    {sel(a.animation || 'shake', v => set({ animation: v }), <>
                        {['shake', 'bounce', 'pulse', 'spin', 'fadeIn', 'fadeOut', 'slideIn', 'glow'].map(an => <option key={an} value={an}>{t('actionsList.anim.' + an, an)}</option>)}
                    </>)}
                    <input type="number" value={a.duration ?? 500} min={100} step={100} placeholder="ms" onChange={e => set({ duration: Number(e.target.value) })} className={inputCls} />
                </div>
            </>);
        case UIActionType.ChangeImage: {
            const imageAssets = Object.values(project.images).concat(Object.values(project.backgrounds) as any[]);
            return group('purple', <>
                {field(t('actionEditor.targetElement', 'Target element'), sel(a.targetElementId || '', v => set({ targetElementId: v }), <>
                    <option value="">{t('actionsList.selectElement', 'Select an element…')}</option>
                    {targets.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
                </>))}
                {field(t('actionsList.selectImage', 'Image'), sel(a.newImageId || '', v => set({ newImageId: v }), <>
                    <option value="">{t('actionsList.selectImage', 'Select an image…')}</option>
                    {imageAssets.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                </>))}
            </>);
        }
        case UIActionType.SaveGame:
        case UIActionType.LoadGame:
        case UIActionType.DeleteSave:
            return group('sky', <>
                {field(t('actionEditor.saveSlot', 'Save slot'), <input type="number" min={1} max={99} value={a.slotNumber ?? 1}
                    onChange={e => set({ slotNumber: Number(e.target.value) || 1 })} className={variant === 'form' ? 'w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs' : inputCls + ' w-16'} />)}
                {action.type === UIActionType.DeleteSave && <p className="text-[10px] text-[var(--text-muted)]">{t('actionsList.deleteSaveHint', 'Erases this slot (Save + Load). Shows the “Erase Save” confirmation first.')}</p>}
            </>);
        case UIActionType.SaveSlotsNextPage:
        case UIActionType.SaveSlotsPrevPage: {
            // Every SaveSlotGrid across all screens, labeled "Screen › Element".
            const gridOptions: { id: string; label: string }[] = [];
            for (const screen of Object.values(project.uiScreens || {}) as any[]) {
                for (const elx of Object.values(screen?.elements || {}) as any[]) {
                    if (elx?.type === 'SaveSlotGrid') gridOptions.push({ id: elx.id, label: `${screen.name} › ${elx.name || 'Save slots'}` });
                }
            }
            return group('sky', <>
                {field(t('actionEditor.saveSlotsTarget', 'Which slot grid'), sel(a.targetElementId || '', v => set({ targetElementId: v || null }), <>
                    <option value="">{t('actionEditor.saveSlotsAnyGrid', 'The slot grid on the open screen')}</option>
                    {gridOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </>))}
                <p className="text-[10px] text-[var(--text-muted)]">{t('actionEditor.saveSlotsPageHint', 'Turns the save/load slots one page. Tip: hide the built-in arrows on the slot grid to use your own buttons.')}</p>
            </>);
        }
        case UIActionType.GiveItem:
        case UIActionType.UseItem:
        case UIActionType.DestroyItem:
        case UIActionType.CarryItem: {
            const itemArr = Object.values(project.items || {}) as any[];
            const showQty = (action.type === UIActionType.GiveItem || action.type === UIActionType.DestroyItem) && !a.all;
            return group('amber', <>
                {field(t('actionEditor.item', 'Item'), sel(a.itemId || '', v => set({ itemId: v }), <>
                    <option value="">{itemArr.length === 0 ? t('actionsList.noItems', 'No items defined (Systems → Items)') : t('actionsList.selectItem', 'Select an item…')}</option>
                    {itemArr.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                </>))}
                {action.type === UIActionType.DestroyItem && <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                    <input type="checkbox" checked={!!a.all} onChange={e => set({ all: e.target.checked || undefined })} /> {t('actionsList.destroyAll', 'Remove all')}
                </label>}
                {showQty && (variant === 'form'
                    ? <FormField label={t('actionsList.quantity', 'Quantity')}><TextInput type="number" value={String(a.quantity ?? 1)} onChange={e => set({ quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })} /></FormField>
                    : <div className="flex items-center gap-1"><span className="text-[10px] text-[var(--text-secondary)]">{t('actionsList.quantity', 'Quantity')}</span>
                        <input type="number" min={1} value={a.quantity ?? 1} onChange={e => set({ quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })} className={inputCls + ' w-16'} /></div>)}
            </>);
        }
        case UIActionType.RestockCollection: {
            const collArr = Object.values(project.itemCollections || {}) as any[];
            return group('amber', field(t('actionEditor.itemList', 'Item list'), sel(a.collectionId || '', v => set({ collectionId: v }), <>
                <option value="">{collArr.length === 0 ? t('actionsList.noCollections', 'No item lists defined (Systems → Inventory)') : t('actionsList.selectCollection', 'Select an item list…')}</option>
                {collArr.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
            </>)));
        }
        case UIActionType.BuyItem:
        case UIActionType.SellItem: {
            const itemArr = Object.values(project.items || {}) as any[];
            const collArr = Object.values(project.itemCollections || {}) as any[];
            return group('amber', <>
                {field(t('actionEditor.item', 'Item'), sel(a.itemId || '', v => set({ itemId: v }), <>
                    <option value="">{itemArr.length === 0 ? t('actionsList.noItems', 'No items defined (Systems → Items)') : t('actionsList.selectItem', 'Select an item…')}</option>
                    {itemArr.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                </>))}
                {field(action.type === UIActionType.BuyItem ? t('actionsList.shopBuyFrom', 'Shop list to buy from') : t('actionsList.shopSellTo', 'Shop list to sell to'), sel(a.collectionId || '', v => set({ collectionId: v }), <>
                    <option value="">{collArr.length === 0 ? t('actionsList.noCollections', 'No item lists defined (Systems → Inventory)') : t('actionsList.selectCollection', 'Select an item list…')}</option>
                    {collArr.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
                </>))}
            </>);
        }
        case UIActionType.BuySelectedItem:
        case UIActionType.SellSelectedItem: {
            const collArr = Object.values(project.itemCollections || {}) as any[];
            return group('amber', <>
                {field(action.type === UIActionType.BuySelectedItem ? t('actionsList.shopBuyFrom', 'Shop list to buy from') : t('actionsList.shopSellTo', 'Shop list to sell to'), sel(a.collectionId || '', v => set({ collectionId: v }), <>
                    <option value="">{collArr.length === 0 ? t('actionsList.noCollections', 'No item lists defined (Systems → Inventory)') : t('actionsList.selectCollection', 'Select an item list…')}</option>
                    {collArr.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
                </>))}
                <p className="text-[10px] text-[var(--text-muted)]">{t('actionsList.selectedItemHint', 'Acts on the item the player has selected in the grid.')}</p>
            </>);
        }
        case UIActionType.StartTimer: {
            const mode = a.mode === 'stopwatch' ? 'stopwatch' : 'countdown';
            return group('purple', <>
                {field(t('actionEditor.timerId', 'Timer id (for Stop Timer)'), txt(a.timerId || '', v => set({ timerId: v }), { placeholder: 'default' }))}
                {field(t('actionEditor.timerMode', 'Mode'), sel(mode, v => set({ mode: v }), <>
                    <option value="countdown">{t('actionEditor.timerCountdown', 'Countdown (to 0)')}</option>
                    <option value="stopwatch">{t('actionEditor.timerStopwatch', 'Stopwatch (count up)')}</option>
                </>))}
                {mode === 'countdown'
                    ? field(t('actionEditor.timerFromCountdown', 'Count down from (seconds)'), txt(String(a.duration ?? 10), v => set({ duration: parseInt(v, 10) || 0 }), { type: 'number', min: 1 }))
                    : <>
                        {field(t('actionEditor.timerStart', 'Start at (seconds)'), txt(String(a.from ?? 0), v => set({ from: parseInt(v, 10) || 0 }), { type: 'number', min: 0 }))}
                        {field(t('actionEditor.timerCap', 'Stop at (seconds; 0 = until stopped)'), txt(String(a.duration ?? 0), v => set({ duration: parseInt(v, 10) || 0 }), { type: 'number', min: 0 }))}
                    </>}
                {field(t('actionEditor.timerInterval', 'Tick every (seconds)'), txt(String(a.interval ?? 1), v => set({ interval: parseFloat(v) || 1 }), { type: 'number', min: 0.1 }))}
                {field(t('actionEditor.timerVariable', 'Show on number variable (optional)'), sel(a.variableId || '', v => set({ variableId: v || undefined }), <>
                    <option value="">{t('actionEditor.timerNoVar', '(none — just runs)')}</option>
                    {numericVariables.map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </>))}
                <label className={`flex items-center gap-1 ${variant === 'form' ? 'text-xs text-slate-300' : 'text-[10px] text-[var(--text-secondary)]'}`}>
                    <input type="checkbox" checked={!!a.loop} onChange={e => set({ loop: e.target.checked })} />
                    {t('actionEditor.timerLoop', 'Loop')}
                </label>
                <label className={`flex items-center gap-1 ${variant === 'form' ? 'text-xs text-slate-300' : 'text-[10px] text-[var(--text-secondary)]'}`}>
                    <input type="checkbox" checked={!!a.resume} onChange={e => set({ resume: e.target.checked || undefined })} />
                    {t('actionEditor.timerResume', 'Can Restart (requires variable)')}
                </label>
                <label className={`flex items-center gap-1 ${variant === 'form' ? 'text-xs text-slate-300' : 'text-[10px] text-[var(--text-secondary)]'}`}>
                    <input type="checkbox" checked={!!a.keepAcrossGames} onChange={e => set({ keepAcrossGames: e.target.checked || undefined })} />
                    {t('actionEditor.timerKeepAcrossGames', 'Persist Playthroughs')}
                </label>
                <label className={`flex items-center gap-1 ${variant === 'form' ? 'text-xs text-slate-300' : 'text-[10px] text-[var(--text-secondary)]'}`}>
                    <input type="checkbox" checked={!!a.rememberBetweenSessions} onChange={e => set({ rememberBetweenSessions: e.target.checked || undefined })} />
                    {t('actionEditor.timerRememberSessions', 'Persist Game Reboot')}
                </label>
                {options?.renderActionList
                    ? <div className="mt-1">{options.renderActionList((a.onComplete as VNUIAction[]) || [], (acts) => set({ onComplete: acts }), t('actionEditor.timerOnComplete', 'When it finishes, run'))}</div>
                    : null}
                <p className="text-[10px] text-[var(--text-muted)]">{t('actionEditor.timerBlockHint', 'To pause the story until it finishes, use the Start Timer command instead.')}</p>
            </>);
        }
        case UIActionType.StopTimer:
            return group('purple', <>
                {field(t('actionEditor.timerIdStop', 'Timer to stop (blank = default)'), txt(a.timerId || '', v => set({ timerId: v }), { placeholder: 'default', list: 'flourish-timer-ids-action' }))}
                <datalist id="flourish-timer-ids-action">
                    {collectTimerIds(project).map(id => <option key={id} value={id} />)}
                </datalist>
                <p className="text-[10px] text-[var(--text-muted)]">{t('actionEditor.timerIdStopHint', 'Timers are global — this stops the timer no matter which scene started it.')}</p>
            </>);
        case UIActionType.SetTimeOfDay: {
            const mode = a.mode === 'advance' ? 'advance' : 'set';
            return group('purple', <>
                {field(t('actionEditor.todMode', 'Action'), sel(mode, v => set({ mode: v }), <>
                    <option value="set">{t('actionEditor.todSet', 'Set time to…')}</option>
                    <option value="advance">{t('actionEditor.todAdvance', 'Advance by…')}</option>
                </>))}
                {mode === 'set'
                    ? field(t('actionEditor.todHour', 'Hour (0–24)'), txt(String(a.hour ?? 12), v => set({ hour: parseFloat(v) || 0 }), { type: 'number', min: 0 }))
                    : field(t('actionEditor.todHours', 'Advance by (hours)'), txt(String(a.hours ?? 1), v => set({ hours: parseFloat(v) || 0 }), { type: 'number' }))}
                {field(t('actionEditor.todTransition', 'Transition (seconds)'), txt(String(a.transitionDuration ?? 2), v => set({ transitionDuration: parseFloat(v) || 0 }), { type: 'number', min: 0 }))}
            </>);
        }
        default:
            return null;
    }
};

export default ActionFields;
