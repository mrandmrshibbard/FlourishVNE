/**
 * The variable X-ray — "where is this actually used?"
 *
 * A writer's complaint about variables is almost never "I can't make one". It's "I have no idea what
 * this one is doing any more". This walks the ENTIRE project and answers, for every variable:
 * what changes it, what checks it, what shows it — and where each of those lives, so the author can
 * click straight to it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS REPLACES `findVariableUsages` IN VariableManager.tsx
 * That one is (a) only reachable from the DELETE confirmation, and (b) BROKEN in a way nobody noticed:
 * it guarded its UI branch with `Array.isArray(screen.elements)` — but `elements` is a **Record**, not
 * an array. So it has never once walked a UI screen. "This variable is used in 3 places. Deleting it
 * may break your game!" was undercounting, silently, and an author could delete a variable that half
 * their UI depended on and be told it was used nowhere. It also looked for `.content`/`.children` on
 * elements, which are not fields on any VNUIElement (the text lives in `.text`).
 *
 * So: correctness here is not cosmetic. An author DELETES things based on what this says.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TWO UNIVERSAL SHAPES do most of the work, and they nest arbitrarily:
 *   • every `conditions` array is VNCondition[]  → a CHECK
 *   • every `actions` array is VNUIAction[]      → may SET, and carries its own `conditions`
 * Walk those two everywhere and you catch the long tail (a timer's on-finish actions, a phone reply's
 * follow-ups, a mini-game's outcome tiers) without enumerating each by hand.
 *
 * THE THREE SINGLE-ACTION FIELDS that look like arrays and aren't — miss these and a button's whole
 * behaviour goes unseen: `ShowButtonCommand.onClick`, `UIButtonElement.action`,
 * `QuickMenuCustomButton.action` / `PhoneButtonConfig.action`.
 *
 * Pure. Editor-only (nothing here ships in the engine).
 */
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNCondition, VNUIAction, UIActionType, RESET_ALL_VARIABLES } from '../types/shared';
import { CommandType, VNCommand } from '../features/scene/types';
import { VNVariable } from '../features/variables/types';
import { sortedBands, isBandOperator, bandById } from '../features/variables/bands';
import { describeSetVariable, variableLabel } from './variableLanguage';

/**
 * Read a collection that MIGHT be an array and might be a keyed object.
 *
 * The project schema is not consistent about this and never has been: `scenes`/`uiScreens`/`items` are
 * Records, `map.locations`/`score.tiers` are arrays — and **`cgGallery.entries` is a Record in real
 * projects even though its type says array**. A bare `for (const x of (thing ?? []))` over a Record
 * throws "object is not iterable" and takes the whole Variables tab down with it.
 *
 * This is the SAME bug that made the old findVariableUsages silently skip every UI screen (it guarded
 * with `Array.isArray(screen.elements)`, and elements is a Record). That one failed quietly; this one
 * failed loudly. A walker over author data must tolerate both shapes — assume nothing.
 */
function asList<T>(v: unknown): T[] {
    if (Array.isArray(v)) return v as T[];
    if (v && typeof v === 'object') return Object.values(v as Record<string, T>);
    return [];
}

/** What is being done to the variable. */
export type UsageKind =
    | 'set'      // something changes it
    | 'check'    // a condition reads it
    | 'show'     // it's printed in text, or displayed (a meter, a dropdown…)
    | 'ask';     // the player types/chooses the value

export interface UsageLocation {
    area: 'scene' | 'screen' | 'commonEvent' | 'map' | 'miniGame' | 'systems' | 'phone' | 'gallery' | 'script' | 'project';
    sceneId?: VNID;
    /** Index into the scene's (or common event's) command list. */
    commandIndex?: number;
    screenId?: VNID;
    elementId?: VNID;
    commonEventId?: VNID;
    mapId?: VNID;
    miniGameId?: VNID;
    itemId?: VNID;
    statId?: VNID;
}

export interface VariableUsage {
    variableId: VNID;
    kind: UsageKind;
    /** For a 'set': which way the value moves. Drives the "goes up in 5 places" summary. */
    direction?: 'up' | 'down' | 'set';
    /** Plain language: what happens here. */
    what: string;
    /** Plain language: where this is. */
    where: string;
    location: UsageLocation;
    /** Whether the editor can actually take the author to this spot. */
    canJump: boolean;
}

export interface VariableHealth {
    /** Nothing anywhere changes it — so it is stuck on its starting value forever. */
    neverChanged: boolean;
    /** Nothing checks it and nothing shows it — changing it can have no effect the player ever sees. */
    neverUsed: boolean;
    /** Not referenced anywhere at all. */
    orphan: boolean;
    /** Conditions that can never be true, as plain sentences. */
    impossible: string[];
}

export interface VariableUsageIndex {
    byVariable: Map<VNID, VariableUsage[]>;
    health: Map<VNID, VariableHealth>;
}

export interface UsageCounts { set: number; check: number; show: number; up: number; down: number; total: number }

export function countUsages(usages: VariableUsage[]): UsageCounts {
    const c: UsageCounts = { set: 0, check: 0, show: 0, up: 0, down: 0, total: usages.length };
    for (const u of usages) {
        if (u.kind === 'set' || u.kind === 'ask') c.set++;
        else if (u.kind === 'check') c.check++;
        else c.show++;
        if (u.direction === 'up') c.up++;
        if (u.direction === 'down') c.down++;
    }
    return c;
}

// ── the walker ───────────────────────────────────────────────────────────────

interface Ctx {
    project: VNProject;
    out: VariableUsage[];
    /** Variable names, lowercased, for {token} scanning. Built once. */
    nameToId: Map<string, VNID>;
    /** See `add` — the dedupe guard. */
    seen: Set<string>;
}

/**
 * Record a usage, ONCE.
 *
 * The walker deliberately overlaps: a command's `text` is read both by its own case and by the
 * generic tail that handles the twenty command types which all happen to have a `text` field. That
 * overlap is what makes the long tail cheap to cover — but without this guard it double-counts, and
 * "Affection is shown in 2 places" when it's shown in 1 is exactly the kind of small lie that makes an
 * author stop trusting the panel. Identical (variable, kind, what, where, location) IS a duplicate:
 * the location carries the step index, so two real usages can never collide.
 */
const add = (ctx: Ctx, u: VariableUsage) => {
    if (!u.variableId) return;
    const key = `${u.variableId}|${u.kind}|${u.what}|${u.where}|${JSON.stringify(u.location)}`;
    if (ctx.seen.has(key)) return;
    ctx.seen.add(key);
    ctx.out.push(u);
};

/** `{Affection}` in a piece of text. Resolves BY NAME first, then by id — same rule as the engine. */
function scanText(ctx: Ctx, text: unknown, where: string, location: UsageLocation): void {
    if (typeof text !== 'string' || !text.includes('{')) return;
    const seen = new Set<VNID>();
    for (const m of text.matchAll(/\{([^}]+)\}/g)) {
        const token = m[1].trim();
        const id = ctx.nameToId.get(token.toLowerCase()) ?? (ctx.project.variables[token] ? (token as VNID) : undefined);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        add(ctx, {
            variableId: id, kind: 'show',
            what: `Its value is shown in the text: “${text.length > 48 ? text.slice(0, 47) + '…' : text}”`,
            where, location, canJump: canJump(location),
        });
    }
}

function scanConditions(ctx: Ctx, conditions: unknown, where: string, location: UsageLocation, what = 'Checked'): void {
    for (const c of asList<VNCondition>(conditions)) {
        if (!c?.variableId) continue;
        add(ctx, {
            variableId: c.variableId, kind: 'check',
            what: `${what}: ${describeOneCondition(ctx.project, c)}`,
            where, location, canJump: canJump(location),
        });
    }
}

/** One condition as a phrase. (conditionLogic.describeConditions does lists; this is the single form.) */
function describeOneCondition(project: VNProject, c: VNCondition): string {
    const v = project.variables[c.variableId];
    const name = variableLabel(v);
    if (isBandOperator(c.operator)) {
        const band = bandById(v, c.value);
        const word = c.operator === 'inBand' ? 'is' : c.operator === 'atLeastBand' ? 'is at least' : 'is below';
        return `${name} ${word} ${band?.name ?? '…'}`;
    }
    return `${name} ${c.operator} ${c.value ?? ''}`.trim();
}

/** Actions nest (a timer's on-finish list, a mini-game tier). Recurse, and never forget their conditions. */
function scanActions(ctx: Ctx, actions: unknown, where: string, location: UsageLocation, depth = 0): void {
    if (depth > 8) return;                                  // paranoia: a self-referential data shape
    // CAREFUL: this field is sometimes a LIST of actions, sometimes ONE action (`ShowButtonCommand.onClick`,
    // `UIButtonElement.action`), and — like everything else in this schema — could be a keyed object.
    // A single action is distinguishable because it has a `type`; without that check, `asList` would
    // shred one action into its own field values.
    const list: VNUIAction[] = Array.isArray(actions)
        ? actions
        : (actions && typeof actions === 'object' && 'type' in (actions as object))
            ? [actions as VNUIAction]
            : asList<VNUIAction>(actions);
    for (const action of list) {
        if (!action) continue;
        const a = action as any;

        // EVERY action can carry its own conditions.
        scanConditions(ctx, a.conditions, where, location, 'Only when');

        switch (action.type) {
            case UIActionType.SetVariable: {
                if (!a.variableId) break;
                add(ctx, {
                    variableId: a.variableId, kind: 'set',
                    direction: a.operator === 'add' ? 'up' : a.operator === 'subtract' ? 'down' : 'set',
                    what: describeSetVariable(ctx.project, a),
                    where, location, canJump: canJump(location),
                });
                break;
            }
            case UIActionType.ResetVariable: {
                if (!a.variableId || a.variableId === RESET_ALL_VARIABLES) break;
                add(ctx, {
                    variableId: a.variableId, kind: 'set', direction: 'set',
                    what: `Put ${variableLabel(ctx.project.variables[a.variableId])} back to how it started`,
                    where, location, canJump: canJump(location),
                });
                break;
            }
            case UIActionType.CycleLayerAsset: {
                if (!a.variableId) break;
                add(ctx, {
                    variableId: a.variableId, kind: 'set', direction: 'set',
                    what: 'Changes which outfit/layer piece is worn',
                    where, location, canJump: canJump(location),
                });
                break;
            }
            case UIActionType.StartTimer: {
                if (a.variableId) {
                    add(ctx, {
                        variableId: a.variableId, kind: 'set', direction: 'set',
                        what: 'A timer counts into it',
                        where, location, canJump: canJump(location),
                    });
                }
                scanActions(ctx, a.onComplete, `${where} → when the timer finishes`, location, depth + 1);
                break;
            }
            default:
                break;
        }
    }
}

/** Everything a single command can touch. Used for scenes AND common events (same command shape). */
function scanCommand(ctx: Ctx, command: VNCommand, where: string, location: UsageLocation): void {
    const c = command as any;

    scanConditions(ctx, c.conditions, where, location, 'Only runs when');
    scanConditions(ctx, c.liveConditions, where, location, 'Only shows while');

    switch (command.type) {
        case CommandType.SetVariable:
            if (c.variableId) {
                add(ctx, {
                    variableId: c.variableId, kind: 'set',
                    direction: c.operator === 'add' ? 'up' : c.operator === 'subtract' ? 'down' : 'set',
                    what: describeSetVariable(ctx.project, c),
                    where, location, canJump: canJump(location),
                });
            }
            break;

        case CommandType.TextInput:
            if (c.variableId) {
                add(ctx, {
                    variableId: c.variableId, kind: 'ask',
                    what: 'The player types the value here',
                    where, location, canJump: canJump(location),
                });
            }
            scanText(ctx, c.prompt, where, location);
            scanText(ctx, c.placeholder, where, location);
            break;

        case CommandType.StartTimer:
            if (c.variableId) {
                add(ctx, {
                    variableId: c.variableId, kind: 'set', direction: 'set',
                    what: 'A timer counts into it',
                    where, location, canJump: canJump(location),
                });
            }
            scanActions(ctx, c.onComplete, `${where} → when the timer finishes`, location);
            break;

        // NOTE: Dialogue needs no case — the generic tail below already reads `c.text`.

        case CommandType.Choice:
            for (const [i, opt] of asList<any>(c.options).entries()) {
                const optWhere = `${where} → option ${i + 1}`;
                scanText(ctx, opt.text, optWhere, location);
                scanConditions(ctx, opt.conditions, optWhere, location, 'Option only appears when');
                scanActions(ctx, opt.actions, optWhere, location);
            }
            break;

        case CommandType.Wait:
            scanConditions(ctx, c.waitConditions, where, location, 'Waits until');
            break;

        default:
            break;
    }

    // ── Shapes that appear on many command types, handled generically ──
    // The single-action fields that LOOK like arrays and aren't. Miss `onClick` and a button's entire
    // behaviour is invisible to the X-ray.
    scanActions(ctx, c.onClick, where, location);
    scanActions(ctx, c.actions, where, location);
    scanConditions(ctx, c.showConditions, where, location, 'Only shows when');
    scanActions(ctx, c.acceptActions, `${where} → if answered`, location);
    scanActions(ctx, c.declineActions, `${where} → if declined`, location);
    scanActions(ctx, c.timeoutActions, `${where} → if missed`, location);
    scanActions(ctx, c.tapActions, `${where} → if tapped`, location);
    scanActions(ctx, c.endActions, `${where} → at the end`, location);
    scanText(ctx, c.text, where, location);
    scanText(ctx, c.title, where, location);
    scanText(ctx, c.name, where, location);

    // Phone conversations: replies nest follow-ups, and each reply has its own conditions + actions.
    scanPhoneReplies(ctx, c.replies, where, location);
    scanPhoneConversation(ctx, c.conversation, where, location);
    for (const line of asList<any>(c.lines)) {
        scanText(ctx, line?.text, where, location);
        scanConditions(ctx, line?.conditions, where, location, 'Line only plays when');
        scanPhoneReplies(ctx, line?.replies, where, location);
    }
    // A phone-text command's choices are ordinary ChoiceOptions.
    for (const [i, opt] of asList<any>(c.choices).entries()) {
        const optWhere = `${where} → reply ${i + 1}`;
        scanText(ctx, opt?.text, optWhere, location);
        scanConditions(ctx, opt?.conditions, optWhere, location, 'Only appears when');
        scanActions(ctx, opt?.actions, optWhere, location);
    }
    // Drag-and-drop regions on an image.
    for (const r of asList<any>(c.draggableImageElementRegions)) {
        scanConditions(ctx, r?.conditions, where, location, 'Only when');
        scanActions(ctx, r?.actions, where, location);
    }
    // Credits roll.
    for (const e of asList<any>(c.entries)) {
        scanText(ctx, e?.label, where, location);
        scanText(ctx, e?.value, where, location);
    }

    // "Follow a variable" FX fields — a live number driving an effect's strength.
    for (const key of Object.keys(c)) {
        if (!key.endsWith('VariableId') || key === 'variableId') continue;
        const id = c[key];
        if (!id || typeof id !== 'string' || !ctx.project.variables[id]) continue;
        add(ctx, {
            variableId: id as VNID, kind: 'show',
            what: `Its value drives this effect (${humanizeFxField(key)})`,
            where, location, canJump: canJump(location),
        });
    }
}

/** `burstHeightVariableId` → "burst height". */
function humanizeFxField(key: string): string {
    return key
        .replace(/VariableId$/, '')
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .toLowerCase();
}

function scanPhoneReplies(ctx: Ctx, replies: unknown, where: string, location: UsageLocation, depth = 0): void {
    if (depth > 6) return;
    for (const r of asList<any>(replies)) {
        if (!r) continue;
        scanText(ctx, r.text, where, location);
        scanConditions(ctx, r.conditions, where, location, 'Reply only offered when');
        scanActions(ctx, r.actions, where, location);
        for (const f of asList<any>(r.followUps)) scanText(ctx, f?.text, where, location);
    }
}

function scanPhoneConversation(ctx: Ctx, conv: unknown, where: string, location: UsageLocation): void {
    if (!conv || typeof conv !== 'object') return;
    const c = conv as any;
    for (const line of asList<any>(c.lines)) {
        scanText(ctx, line?.text, where, location);
        scanConditions(ctx, line?.conditions, where, location, 'Line only plays when');
        scanPhoneReplies(ctx, line?.replies, where, location);
    }
    scanActions(ctx, c.endActions, `${where} → at the end`, location);
}

/** Every UI element. `elements` is a RECORD — the old walker's Array.isArray guard is why it never ran. */
function scanElement(ctx: Ctx, el: any, screenName: string, screenId: VNID): void {
    if (!el) return;
    const location: UsageLocation = { area: 'screen', screenId, elementId: el.id };
    const where = `Screen “${screenName}” → ${el.name || el.type}`;

    scanConditions(ctx, el.conditions, where, location, 'Only shows when');
    scanConditions(ctx, el.disabledConditions, where, location, 'Greyed out when');
    for (const st of asList<any>(el.appearanceStates)) {
        scanConditions(ctx, st?.conditions, `${where} → look “${st?.name ?? ''}”`, location, 'Changes look when');
    }
    scanActions(ctx, el.actions, where, location);
    scanActions(ctx, el.action, where, location);              // UIButtonElement.action — SINGLE, not an array
    scanActions(ctx, el.slotButtonActions, `${where} → item button`, location);

    // Elements that are BOUND to a variable (they show it and/or write it).
    if (el.variableId) {
        const bindingKind: UsageKind =
            el.type === 'Meter' ? 'show' :
            (el.type === 'TextInput' || el.type === 'Dropdown' || el.type === 'Checkbox' ||
             el.type === 'SettingsSlider' || el.type === 'SettingsToggle' || el.type === 'AssetCycler') ? 'ask' : 'show';
        add(ctx, {
            variableId: el.variableId, kind: bindingKind,
            what: bindingKind === 'show' ? 'Shown by this element' : 'The player sets it with this element',
            where, location, canJump: true,
        });
    }
    // A Customizer's categories each bind their own variable.
    for (const cat of asList<any>(el.categories)) {
        if (cat?.variableId) {
            add(ctx, {
                variableId: cat.variableId, kind: 'ask',
                what: `The player picks “${cat.label || cat.name || 'an option'}” with this dress-up element`,
                where, location, canJump: true,
            });
        }
    }
    for (const meta of Object.values((el.optionMeta ?? {}) as Record<string, any>)) {
        scanConditions(ctx, (meta as any)?.conditions, `${where} → an option`, location, 'Option only available when');
    }
    // A CharacterPreview maps layer → variable; the VALUES are the variable ids.
    for (const varId of Object.values((el.layerVariableMap ?? {}) as Record<string, string>)) {
        if (varId) {
            add(ctx, {
                variableId: varId as VNID, kind: 'show',
                what: 'Chooses which layer art this preview wears',
                where, location, canJump: true,
            });
        }
    }
    for (const ac of asList<any>(el.assetConditions)) {
        scanConditions(ctx, ac?.conditions, where, location, 'Uses this art when');
    }
    for (const id of asList<VNID>(el.filterVariableIds)) {
        if (id) add(ctx, { variableId: id, kind: 'check', what: 'Filters which options are offered', where, location, canJump: true });
    }
    if (el.filterVariableId) {
        add(ctx, { variableId: el.filterVariableId, kind: 'check', what: 'Filters which options are offered', where, location, canJump: true });
    }

    // Text that can interpolate.
    for (const key of ['text', 'label', 'placeholder', 'useButtonText', 'emptyText', 'lockedText', 'randomizeLabel', 'resetLabel']) {
        scanText(ctx, el[key], where, location);
    }
    for (const opt of asList<any>(el.options)) scanText(ctx, opt?.label, where, location);
}

// ── entry point ──────────────────────────────────────────────────────────────

/** Whether the editor can navigate the author to this spot (see VisualNovelEditor's jump handler). */
function canJump(loc: UsageLocation): boolean {
    return loc.area === 'scene' || loc.area === 'screen' || loc.area === 'commonEvent'
        || loc.area === 'map' || loc.area === 'miniGame' || loc.area === 'systems';
}

export function buildVariableUsageIndex(project: VNProject): VariableUsageIndex {
    const ctx: Ctx = {
        project,
        out: [],
        nameToId: new Map(
            (Object.values(project.variables ?? {}) as VNVariable[]).map(v => [v.name.toLowerCase(), v.id]),
        ),
        seen: new Set(),
    };

    // ── scenes ──
    for (const scene of Object.values(project.scenes ?? {}) as any[]) {
        const sceneWhere = `Scene “${scene.name}”`;
        scanConditions(ctx, scene.conditions, sceneWhere, { area: 'scene', sceneId: scene.id }, 'Scene only plays when');
        for (const [i, command] of asList<VNCommand>(scene.commands).entries()) {
            scanCommand(ctx, command, `${sceneWhere} → step ${i + 1}`, { area: 'scene', sceneId: scene.id, commandIndex: i });
        }
    }

    // ── common events (same command shape) ──
    for (const ce of Object.values(project.commonEvents ?? {}) as any[]) {
        const where = `Common event “${ce.name}”`;
        if (ce.conditionVariableId) {
            add(ctx, {
                variableId: ce.conditionVariableId, kind: 'check',
                what: 'This common event only runs while it is on',
                where, location: { area: 'commonEvent', commonEventId: ce.id }, canJump: true,
            });
        }
        for (const [i, command] of asList<VNCommand>(ce.commands).entries()) {
            scanCommand(ctx, command, `${where} → step ${i + 1}`, { area: 'commonEvent', commonEventId: ce.id, commandIndex: i });
        }
    }

    // ── UI screens ──
    for (const screen of Object.values(project.uiScreens ?? {}) as any[]) {
        const loc: UsageLocation = { area: 'screen', screenId: screen.id };
        const where = `Screen “${screen.name}”`;
        scanActions(ctx, screen.onCloseActions, `${where} → when closed`, loc);
        if (screen.winCondition) {
            if (screen.winCondition.variableId) {
                add(ctx, {
                    variableId: screen.winCondition.variableId, kind: 'check',
                    what: 'Decides when this screen is “won”',
                    where, location: loc, canJump: true,
                });
            }
            scanActions(ctx, screen.winCondition.actions, `${where} → on winning`, loc);
        }
        // A RECORD, not an array. This is the guard that broke the old walker.
        for (const el of Object.values((screen.elements ?? {}) as Record<string, any>)) {
            scanElement(ctx, el, screen.name, screen.id);
        }
    }

    // ── maps ──
    for (const map of Object.values(project.maps ?? {}) as any[]) {
        const loc: UsageLocation = { area: 'map', mapId: map.id };
        const where = `Map “${map.name}”`;
        scanText(ctx, map.confirmText, where, loc);
        for (const place of asList<any>(map.locations)) {
            const pWhere = `${where} → “${place?.label || 'a place'}”`;
            scanConditions(ctx, place?.conditions, pWhere, loc, 'Only unlocked when');
            scanActions(ctx, place?.actions, pWhere, loc);
            scanText(ctx, place?.label, pWhere, loc);
            scanText(ctx, place?.lockedLabel, pWhere, loc);
        }
    }

    // ── mini games ──
    for (const game of Object.values(project.miniGames ?? {}) as any[]) {
        const loc: UsageLocation = { area: 'miniGame', miniGameId: game.id };
        const where = `Mini game “${game.name}”`;
        const score = game.score ?? {};
        for (const [field, label] of [['hitsVariableId', 'hits'], ['missesVariableId', 'misses'], ['accuracyVariableId', 'how accurate the player was']] as const) {
            if (score[field]) {
                add(ctx, {
                    variableId: score[field], kind: 'set', direction: 'set',
                    what: `The score writes ${label} into it`,
                    where, location: loc, canJump: true,
                });
            }
        }
        for (const tier of asList<any>(score.tiers)) {
            scanActions(ctx, tier?.actions, `${where} → result “${tier?.name ?? ''}”`, loc);
            scanText(ctx, tier?.message, where, loc);
        }
        scanActions(ctx, game.winActions, `${where} → on winning`, loc);
        scanActions(ctx, game.failActions, `${where} → on failing`, loc);
        scanActions(ctx, game.skipActions, `${where} → if skipped`, loc);
        for (const key of ['title', 'instructions', 'introText']) scanText(ctx, game[key], where, loc);
    }

    // ── items & collections ──
    for (const item of Object.values(project.items ?? {}) as any[]) {
        const loc: UsageLocation = { area: 'systems', itemId: item.id };
        const where = `Item “${item.name}”`;
        if (item.countVariableId) {
            add(ctx, {
                variableId: item.countVariableId, kind: 'set', direction: 'set',
                what: 'Counts how many of this item the player is carrying',
                where, location: loc, canJump: true,
            });
        }
        scanActions(ctx, item.useEffect, `${where} → when used`, loc);
        scanActions(ctx, item.slotButtonActions, `${where} → its button`, loc);
    }
    for (const col of Object.values((project as any).itemCollections ?? {}) as any[]) {
        const loc: UsageLocation = { area: 'systems' };
        const where = `Item list “${col.name}”`;
        if (col.currencyVariableId) {
            add(ctx, { variableId: col.currencyVariableId, kind: 'check', what: 'The money this shop spends', where, location: loc, canJump: true });
        }
        if (col.restock?.watchVariableId) {
            add(ctx, { variableId: col.restock.watchVariableId, kind: 'check', what: 'Restocks the shop when this changes', where, location: loc, canJump: true });
        }
        scanConditions(ctx, col.restock?.condition, where, loc, 'Restocks when');
    }

    // ── stats (a stat materialises one number variable per target) ──
    for (const stat of Object.values((project as any).stats ?? {}) as any[]) {
        for (const varId of Object.values((stat.variableIds ?? {}) as Record<string, string>)) {
            if (!varId) continue;
            add(ctx, {
                variableId: varId as VNID, kind: 'show',
                what: `Tracks the “${stat.name}” stat`,
                where: `Stat “${stat.name}”`,
                location: { area: 'systems', statId: stat.id }, canJump: true,
            });
        }
    }

    // ── CG gallery ──
    for (const entry of asList<any>((project as any).cgGallery?.entries)) {
        if (entry?.unlockVariableId) {
            add(ctx, {
                variableId: entry.unlockVariableId, kind: 'check',
                what: `Unlocks the gallery picture “${entry.name || ''}”`,
                where: 'CG gallery',
                location: { area: 'gallery' }, canJump: false,
            });
        }
    }

    // ── project-level UI: phone, quick menu, reactive chrome ──
    const ui = (project as any).ui ?? {};
    const uiLoc: UsageLocation = { area: 'project' };
    for (const [field, what] of [['playerCharacterVarId', 'Holds the player’s chosen character'], ['playerCharacterNameVarId', 'Holds the player’s chosen name']] as const) {
        if (ui[field]) add(ctx, { variableId: ui[field], kind: 'set', direction: 'set', what, where: 'Player character setup', location: uiLoc, canJump: false });
    }
    for (const st of asList<any>(ui.dialogueReactiveStates)) {
        scanConditions(ctx, st?.conditions, 'Text box (reacts to the story)', uiLoc, 'Changes look when');
    }
    for (const st of asList<any>(ui.quickMenuReactiveStates)) {
        scanConditions(ctx, st?.conditions, 'Quick menu (reacts to the story)', uiLoc, 'Changes look when');
    }
    for (const b of asList<any>(ui.quickMenuCustomButtons)) {
        scanActions(ctx, b?.action, `Quick menu → “${b?.label ?? 'a button'}”`, uiLoc);
        scanActions(ctx, b?.actions, `Quick menu → “${b?.label ?? 'a button'}”`, uiLoc);
    }
    const phoneLoc: UsageLocation = { area: 'phone' };
    for (const b of asList<any>(ui.phoneButtons)) {
        scanConditions(ctx, b?.conditions, 'Phone → a button', phoneLoc, 'Only shows when');
        scanActions(ctx, b?.action, 'Phone → a button', phoneLoc);
    }
    for (const contact of asList<any>(ui.phoneContacts)) {
        const where = `Phone → contact “${contact?.name ?? ''}”`;
        scanConditions(ctx, contact?.conditions, where, phoneLoc, 'Only appears when');
        scanText(ctx, contact?.statusText, where, phoneLoc);
        scanActions(ctx, contact?.callAction, where, phoneLoc);
        scanPhoneConversation(ctx, contact?.callConversation, where, phoneLoc);
        for (const c of asList<any>(contact?.callConversations)) {
            scanConditions(ctx, c?.conditions, where, phoneLoc, 'This call happens when');
            scanPhoneConversation(ctx, c?.conversation, where, phoneLoc);
        }
        for (const c of asList<any>(contact?.textConversations)) {
            scanConditions(ctx, c?.conditions, where, phoneLoc, 'This chat happens when');
            scanPhoneConversation(ctx, c?.conversation, where, phoneLoc);
        }
    }
    for (const w of asList<any>(ui.phoneWallpapers)) scanConditions(ctx, w?.conditions, 'Phone → wallpapers', phoneLoc, 'Only offered when');
    for (const w of asList<any>(ui.phoneHomeWidgets)) {
        scanConditions(ctx, w?.conditions, 'Phone → home screen', phoneLoc, 'Only shows when');
        scanText(ctx, w?.text, 'Phone → home screen', phoneLoc);
    }
    scanConditions(ctx, ui.phoneMapTravelConditions, 'Phone → map travel', phoneLoc, 'Travel allowed when');

    // ── scripts (by NAME — the sandbox API takes strings) ──
    for (const script of Object.values((project as any).scripts ?? {}) as any[]) {
        const code: string = script?.code ?? '';
        if (!code) continue;
        const loc: UsageLocation = { area: 'script' };
        const where = `Script “${script.name}”`;
        for (const m of code.matchAll(/(get|set)Variable\s*\(\s*['"]([^'"]+)['"]/g)) {
            const id = ctx.nameToId.get(m[2].toLowerCase()) ?? (project.variables[m[2]] ? (m[2] as VNID) : undefined);
            if (!id) continue;
            add(ctx, {
                variableId: id,
                kind: m[1] === 'set' ? 'set' : 'check',
                direction: m[1] === 'set' ? 'set' : undefined,
                what: m[1] === 'set' ? 'A script changes it' : 'A script reads it',
                where, location: loc, canJump: false,
            });
        }
    }

    // ── index + health ──
    const byVariable = new Map<VNID, VariableUsage[]>();
    for (const v of Object.keys(project.variables ?? {})) byVariable.set(v as VNID, []);
    for (const u of ctx.out) {
        if (!byVariable.has(u.variableId)) byVariable.set(u.variableId, []);
        byVariable.get(u.variableId)!.push(u);
    }

    const health = new Map<VNID, VariableHealth>();
    for (const [id, usages] of byVariable) {
        const variable = project.variables[id];
        const counts = countUsages(usages);
        health.set(id, {
            neverChanged: counts.set === 0,
            neverUsed: counts.check === 0 && counts.show === 0,
            orphan: counts.total === 0,
            impossible: variable ? findImpossibleConditions(project, variable, usages) : [],
        });
    }

    return { byVariable, health };
}

/**
 * Conditions that can NEVER be true — the silent killer. "Affection is more than 100" on a variable
 * capped at 100 means that branch is dead, the author never sees an error, and they conclude that
 * variables don't work.
 */
function findImpossibleConditions(project: VNProject, variable: VNVariable, usages: VariableUsage[]): string[] {
    if (variable.type !== 'number') return [];
    const { min, max } = variable;
    if (min === undefined && max === undefined && !variable.bands?.length) return [];

    const problems = new Set<string>();
    const name = variableLabel(variable);

    // Band floors above the ceiling can never be reached.
    for (const band of sortedBands(variable)) {
        if (max !== undefined && band.min > max) {
            problems.add(`“${band.name}” starts at ${band.min}, but ${name} can never go above ${max} — so nothing can ever be ${band.name}.`);
        }
    }

    // The condition checks themselves. We only look at the checks the walker found for THIS variable,
    // so this is exact rather than a guess.
    for (const u of usages) {
        if (u.kind !== 'check') continue;
        const m = u.what.match(/(>=|<=|>|<|==)\s*(-?\d+(?:\.\d+)?)\s*$/);
        if (!m) continue;
        const op = m[1];
        const n = Number(m[2]);
        let dead = false;
        if (max !== undefined && (op === '>' && n >= max)) dead = true;
        if (max !== undefined && (op === '>=' && n > max)) dead = true;
        if (min !== undefined && (op === '<' && n <= min)) dead = true;
        if (min !== undefined && (op === '<=' && n < min)) dead = true;
        if (op === '==' && ((max !== undefined && n > max) || (min !== undefined && n < min))) dead = true;
        if (dead) {
            problems.add(`A check for “${name} ${op} ${n}” can never be true (${name} stays between ${min ?? '−∞'} and ${max ?? '∞'}). That branch will never happen.`);
        }
    }
    return [...problems];
}
