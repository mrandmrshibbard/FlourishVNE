/**
 * applyCharacterCreator — turns a Character Creator wizard result into a REAL, playable creator
 * screen using existing reducer actions, with zero manual wiring.
 *
 * It generates:
 *  - a GLOBAL string "Player Character" variable (holds the chosen character id) + points
 *    project.ui.playerCharacterVarId at it, so ⟨Player's Character⟩ commands/elements resolve to it;
 *  - (optional) a GLOBAL string "Player Name" variable + project.ui.playerCharacterNameVarId, so the
 *    dialogue name box shows the player's typed name;
 *  - one system screen holding a single-page flow: a title, one character-choice button per offered
 *    character (SetVariable → chosen id), one Customizer per offered character (each gated by a
 *    condition on the chosen id, so only the picked character's dress-up shows — its outfit variables
 *    are auto-created just like the editor does), an optional name Text Input, and a Start button that
 *    jumps to the first story scene.
 *
 * Everything it makes is an ordinary screen/variable the author can re-style afterwards. Vars are
 * GLOBAL (per-playthrough, saved with the game, reset on New Game) — correct for a protagonist.
 */
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { UIActionType, VNCondition, VNUIAction } from '../../types/shared';
import { UIElementType, UITextElement, UIButtonElement, UITextInputElement, UICharacterPreviewElement, UICustomizerElement, UICustomizerCategory } from '../ui/types';
import { VNCharacterLayer } from '../../features/character/types';
import { createUIElement } from '../../utils/uiElementFactory';
import { DetectedOutfitRule, detectOutfitRules, rulesToOptionMeta } from './outfitRules';

const gid = (p: string) => `${p}-${Math.random().toString(36).substring(2, 9)}`;

/** Find an existing outfit variable by the shared naming convention (`${char} — ${layer}`), else
 *  create one. Reuse keeps re-runs and multiple customizers for the same character sharing outfit
 *  state instead of minting duplicates (mirrors applySystem's reuse-by-name pattern). */
function findOrCreateOutfitVar(
    project: VNProject,
    dispatch: Dispatch,
    charName: string,
    layer: VNCharacterLayer,
    scope?: 'global',
): VNID {
    const name = `${charName} — ${layer.name}`;
    const existing = (Object.values(project.variables || {}) as any[])
        .find(v => v.type === 'string' && v.name === name);
    if (existing) return existing.id;
    const variableId = gid('cust');
    const firstAsset = Object.keys(layer.assets)[0] || '';
    dispatch({ type: 'ADD_VARIABLE', payload: { id: variableId, name, type: 'string', defaultValue: firstAsset, ...(scope ? { scope } : {}) } });
    return variableId;
}

export interface CharacterCreatorConfig {
    screenName: string;
    /** Characters the player can choose between (at least one). */
    offeredCharacterIds: VNID[];
    /** Let the player customize the chosen character's outfit (adds a Customizer per character). */
    customize: boolean;
    /** Let the player type a name (adds a Text Input bound to the name variable). */
    includeName: boolean;
    namePrompt?: string;
    namePlaceholder?: string;
    /** Auto-hide outfit pieces that don't fit other choices (smart fit rules from filenames).
     *  Default true. */
    hideNonFitting?: boolean;
}

type Dispatch = (action: any) => void;

export function applyCharacterCreator(config: CharacterCreatorConfig, project: VNProject, dispatch: Dispatch): { screenId: VNID } {
    const offered = config.offeredCharacterIds.filter(id => project.characters[id]);
    const multi = offered.length > 1;

    // 1. "Player Character" variable (chosen character id) + project pointer.
    const playerCharVarId = gid('var');
    dispatch({ type: 'ADD_VARIABLE', payload: { id: playerCharVarId, name: 'Player Character', type: 'string', defaultValue: offered[0] || '', scope: 'global' } });
    dispatch({ type: 'UPDATE_UI_CONFIG', payload: { key: 'playerCharacterVarId', value: playerCharVarId } });

    // 2. Optional "Player Name" variable + pointer.
    let playerNameVarId: VNID | undefined;
    if (config.includeName) {
        playerNameVarId = gid('var');
        dispatch({ type: 'ADD_VARIABLE', payload: { id: playerNameVarId, name: 'Player Name', type: 'string', defaultValue: '', scope: 'global' } });
        dispatch({ type: 'UPDATE_UI_CONFIG', payload: { key: 'playerCharacterNameVarId', value: playerNameVarId } });
    }

    // 3. The creator screen (a modal system screen that covers the scene).
    const screenId = gid('screen');
    // Remember which screen is THE player-character creator so the Systems hub can link "Edit".
    dispatch({ type: 'UPDATE_UI_CONFIG', payload: { key: 'characterCreatorScreenId', value: screenId } });
    dispatch({ type: 'ADD_UI_SCREEN', payload: { id: screenId, name: config.screenName } });
    dispatch({ type: 'UPDATE_UI_SCREEN', payload: { screenId, updates: {
        category: 'system', showDialogue: false, pauseSceneWhileOpen: true, resetElementVisibilityOnOpen: true,
        // When the creator closes (the Start button toggles it off), advance the story past the
        // command that opened it. The close path commits the player's name/character/outfit choices.
        onCloseBehavior: 'advance',
        background: { type: 'color', value: '#1a102c' },
    } } });

    const elements: any[] = [];

    // 3a. Title.
    const title = createUIElement(UIElementType.Text, project) as UITextElement;
    title.name = 'Title'; title.text = 'Create Your Character';
    title.x = 8; title.y = 4; title.width = 84; title.height = 8; title.textAlign = 'center'; (title as any).layer = 5;
    elements.push(title);

    // 3b. One character-choice button per offered character (only when there's a choice to make).
    if (multi) {
        const n = offered.length;
        const gap = 2;
        const totalW = 84;
        const btnW = Math.max(10, Math.min(24, totalW / n - gap));
        const rowW = btnW * n + gap * (n - 1);
        const startX = 50 - rowW / 2;
        offered.forEach((charId, i) => {
            const ch = project.characters[charId];
            const b = createUIElement(UIElementType.Button, project) as UIButtonElement;
            b.name = `Pick: ${ch.name}`; b.text = ch.name;
            b.x = startX + i * (btnW + gap); b.y = 14; b.width = btnW; b.height = 7; (b as any).layer = 6;
            const act: VNUIAction = { type: UIActionType.SetVariable, variableId: playerCharVarId, operator: 'set', value: charId } as any;
            b.action = act; b.actions = [act];
            elements.push(b);
        });
    }

    // 3c. Dress-up: one Customizer per offered character, each gated so only the chosen one shows.
    //     (When not customizing, a single ⟨Player's Character⟩ preview element stands in.)
    if (config.customize) {
        offered.forEach(charId => {
            const ch = project.characters[charId];
            const cz = createUIElement(UIElementType.Customizer, project) as UICustomizerElement;
            cz.name = `Customize: ${ch.name}`;
            cz.characterId = charId;
            cz.x = 0; cz.y = 0; cz.width = 100; cz.height = 100;
            cz.layout = 'free';
            cz.previewRect = { x: 6, y: 24, width: 34, height: 60 };
            cz.pickersRect = { x: 44, y: 24, width: 50, height: 56 };
            cz.hidePickersPanel = false;
            (cz as any).layer = 3;
            // Build one category per layer, reusing/creating the backing outfit variable (mirrors
            // the editor's auto-include). These are the variables ShowCharacter/CharacterPreview
            // auto-detect.
            const cats: UICustomizerCategory[] = (Object.values(ch.layers) as VNCharacterLayer[]).map(layer => {
                const variableId = findOrCreateOutfitVar(project, dispatch, ch.name, layer, 'global');
                return { layerId: layer.id, label: layer.name, variableId, pickerStyle: 'arrows' as const };
            });
            cz.categories = cats;
            // Smart fit rules (default on): auto-hide pieces whose filenames say they don't fit
            // the player's other choices (e.g. jacket_slim only with body_slim).
            if (config.hideNonFitting !== false) {
                const layerVarMap: Record<VNID, VNID> = {};
                cats.forEach(c => { layerVarMap[c.layerId] = c.variableId; });
                const optionMeta = rulesToOptionMeta(detectOutfitRules(ch), layerVarMap);
                if (Object.keys(optionMeta).length > 0) cz.optionMeta = optionMeta;
            }
            // Show only when this character is the chosen one (single-character creators show always).
            if (multi) {
                const cond: VNCondition = { variableId: playerCharVarId, operator: '==', value: charId };
                (cz as any).conditions = [cond];
            }
            elements.push(cz);
        });
    } else {
        // No dress-up: a live ⟨Player's Character⟩ preview so the choice is at least visible.
        const preview = createUIElement(UIElementType.CharacterPreview, project) as UICharacterPreviewElement;
        preview.name = 'Chosen Character'; preview.characterSource = 'player';
        preview.x = 35; preview.y = 24; preview.width = 30; preview.height = 60; (preview as any).layer = 3;
        elements.push(preview);
    }

    // 3d. Optional name entry.
    if (config.includeName && playerNameVarId) {
        const label = createUIElement(UIElementType.Text, project) as UITextElement;
        label.name = 'Name Prompt'; label.text = config.namePrompt || 'Your name:';
        label.x = 30; label.y = 82; label.width = 40; label.height = 4; label.textAlign = 'center'; (label as any).layer = 6;
        elements.push(label);
        const input = createUIElement(UIElementType.TextInput, project) as UITextInputElement;
        input.name = 'Name Input'; input.variableId = playerNameVarId;
        input.placeholder = config.namePlaceholder || 'Type a name…';
        input.x = 32; input.y = 86; input.width = 36; input.height = 6; (input as any).layer = 6;
        elements.push(input);
    }

    // 3e. Start button — toggles the creator screen closed; the screen's 'advance' close-behavior
    //     then continues the story. Closing commits the chosen character/outfit/name.
    const start = createUIElement(UIElementType.Button, project) as UIButtonElement;
    start.name = 'Start'; start.text = 'Start ▶';
    start.x = 40; start.y = 93; start.width = 20; start.height = 6; (start as any).layer = 7;
    const startAct: VNUIAction = { type: UIActionType.ToggleScreen, targetScreenId: screenId } as any;
    start.action = startAct; start.actions = [startAct];
    elements.push(start);

    elements.forEach(element => dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId, element } }));

    return { screenId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dress-up (story character) — the unified wizard's second mode
// ─────────────────────────────────────────────────────────────────────────────

export interface DressUpConfig {
    /** The story character being dressed up. */
    characterId: VNID;
    /** New-screen name (defaults to "{Character} Dress-Up"). */
    screenName?: string;
    /** Where the Customizer goes: a fresh ready-to-use screen, or an existing screen. */
    target: { kind: 'new-screen' } | { kind: 'existing-screen'; screenId: VNID };
    /** Layers the player may change (subset of the character's layers, wizard-picked). */
    layers: Array<{ layerId: VNID; label?: string; pickerStyle?: UICustomizerCategory['pickerStyle'] }>;
    /** Smart fit rules the author accepted in the wizard (already filtered to checked ones). */
    acceptedRules: DetectedOutfitRule[];
}

/** Turn a dress-up wizard result into a configured Customizer element — on a new standalone
 *  screen (with title + Done button) or dropped onto an existing screen. Variables follow the
 *  same `${char} — ${layer}` convention (reused when they already exist), so ShowCharacter
 *  auto-detects the outfit exactly like every other customizer. */
export function applyDressUp(config: DressUpConfig, project: VNProject, dispatch: Dispatch): { screenId: VNID; elementId: VNID } {
    const ch = project.characters[config.characterId];
    if (!ch) return { screenId: '', elementId: '' };

    // 1. One category (+ backing variable) per included layer.
    const layerVarMap: Record<VNID, VNID> = {};
    const cats: UICustomizerCategory[] = config.layers
        .map(({ layerId, label, pickerStyle }): UICustomizerCategory | null => {
            const layer = ch.layers[layerId];
            if (!layer) return null;
            const variableId = findOrCreateOutfitVar(project, dispatch, ch.name, layer);
            layerVarMap[layerId] = variableId;
            return { layerId, label: label || layer.name, variableId, pickerStyle: pickerStyle || 'arrows' };
        })
        .filter((c): c is UICustomizerCategory => !!c);

    // 2. The Customizer element (factory defaults = box-less free layout).
    const cz = createUIElement(UIElementType.Customizer, project) as UICustomizerElement;
    cz.name = `${ch.name} Dress-Up`;
    cz.characterId = config.characterId;
    cz.categories = cats;
    const optionMeta = rulesToOptionMeta(config.acceptedRules, layerVarMap);
    if (Object.keys(optionMeta).length > 0) cz.optionMeta = optionMeta;

    // 3a. Drop onto an existing screen (launched from the UI editor).
    if (config.target.kind === 'existing-screen') {
        dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId: config.target.screenId, element: cz } });
        return { screenId: config.target.screenId, elementId: cz.id };
    }

    // 3b. New ready-to-use screen: title + full-canvas customizer + Done button. Same proven
    //     recipe as the player creator (Done toggles the screen closed; 'advance' resumes the
    //     story and the close path commits the outfit variables).
    const screenId = gid('screen');
    dispatch({ type: 'ADD_UI_SCREEN', payload: { id: screenId, name: config.screenName || `${ch.name} Dress-Up` } });
    dispatch({ type: 'UPDATE_UI_SCREEN', payload: { screenId, updates: {
        category: 'system', showDialogue: false, pauseSceneWhileOpen: true, resetElementVisibilityOnOpen: true,
        onCloseBehavior: 'advance',
        background: { type: 'color', value: '#1a102c' },
    } } });

    const title = createUIElement(UIElementType.Text, project) as UITextElement;
    title.name = 'Title'; title.text = config.screenName || `${ch.name} Dress-Up`;
    title.x = 8; title.y = 4; title.width = 84; title.height = 8; title.textAlign = 'center'; (title as any).layer = 5;

    cz.x = 0; cz.y = 0; cz.width = 100; cz.height = 100;
    cz.layout = 'free';
    cz.previewRect = { x: 6, y: 18, width: 34, height: 66 };
    cz.pickersRect = { x: 44, y: 18, width: 50, height: 62 };
    cz.hidePickersPanel = false;
    (cz as any).layer = 3;

    const done = createUIElement(UIElementType.Button, project) as UIButtonElement;
    done.name = 'Done'; done.text = 'Done ✓';
    done.x = 40; done.y = 91; done.width = 20; done.height = 6; (done as any).layer = 7;
    const doneAct: VNUIAction = { type: UIActionType.ToggleScreen, targetScreenId: screenId } as any;
    done.action = doneAct; done.actions = [doneAct];

    [title, cz, done].forEach(element => dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId, element } }));
    return { screenId, elementId: cz.id };
}
