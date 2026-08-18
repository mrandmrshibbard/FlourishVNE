/**
 * IR -> `VNCommand[]`.
 *
 * The return type is the engine's own `VNCommand` union (via `import type`), so a wrong field
 * name or a bogus operator is a `tsc` error rather than a silent runtime no-op. That is what
 * makes defects 2, 3 and 4 unrepeatable:
 *   - conditions come from `map/conditions.ts`, the only place an operator string exists;
 *   - `HideImage` carries `targetCommandId` (the old build emitted `elementId`, so all 73 were
 *     no-ops and overlays accumulated forever);
 *   - a sprite change becomes `SetCharacterLayer` ONLY while the character is on stage.
 *
 * Anything untranslatable becomes exactly one `Group` command - the only type that is visible in
 * the editor and a guaranteed runtime no-op - named `UNCONVERTED [Gnnnn] <kind> - <file>:<line>`.
 * Never a `Dialogue`, which would put engine text in the story box.
 *
 * CONTENT RULE: dialogue text passes into `DialogueCommand.text` and is never logged; markers
 * name a construct KIND and a source position, never the text.
 */
import type { VNCommand, VNCondition, VNTransition } from '../ir/engineContract';
import { CT } from '../ir/engineContract';
import type { Node, Pos, SayNode, ShowNode, SceneNode } from '../ir/nodes';
import { mapCondition } from './conditions';
import { mapText } from './text';
import type { ShowSnapshot, LiveChange } from '../analysis/spriteState';

export interface Gap {
    id: string;
    kind: string;
    severity: 'blocker' | 'degraded' | 'note';
    file: string;
    line: number;
    /** Masked detail - identifiers and shapes only, never text. */
    detail: string;
    commandId: string;
}

export interface EmitContext {
    /** Ren'Py variable name -> Flourish variable id. */
    variableId(name: string): string | null;
    /** Portrait name -> Flourish character id. */
    characterId(portrait: string): string | null;
    /** The character's single neutral expression id. */
    expressionId(portrait: string): string | null;
    /** (portrait, slot) -> layer id. */
    layerId(portrait: string, slot: string): string | null;
    /** (portrait, slot, value, grade) -> layer asset id; null when the value clears the layer. */
    assetId(portrait: string, slot: string, value: string, grade: string | null): string | null;
    /** A non-portrait image name (`bg hill night`) -> image asset id. */
    imageId(name: string[]): string | null;
    /**
     * Where a non-portrait image sits, measured from the real art rather than assumed.
     * Hard-coding a full-screen default is defect 6: 233 of 235 overlays ended up identical.
     */
    imagePlacement(name: string[], transforms: string[]): { x: number; y: number; width: number; height: number } | null;
    /** An audio path from a `play` statement -> audio asset id. */
    audioId(file: string): string | null;
    /** Geometry for a character show, already solved by map/geometry. */
    placement(tag: string, transforms: string[]): { x: number; y: number; scale: number } | null;
    /** Deterministic id generator - never Math.random, so runs are reproducible. */
    nextId(prefix: string): string;
    /** Image tag -> portrait name. */
    tagToPortrait: Map<string, string>;
    /** Snapshot lookup by source line, from the sprite dataflow. */
    showAt(line: number): ShowSnapshot | undefined;
    liveChangeAt(line: number): LiveChange | undefined;
}

export interface EmitResult {
    commands: VNCommand[];
    gaps: Gap[];
}

/** Ren'Py transition -> Flourish transition + duration. `slowdissolve` is `Dissolve(1.0)`. */
export function mapTransition(name: string | null): { transition: VNTransition; duration: number } {
    switch (name) {
        case null: return { transition: 'instant', duration: 0 };
        case 'dissolve': return { transition: 'dissolve', duration: 0.5 };
        case 'slowdissolve': return { transition: 'dissolve', duration: 1.0 };
        case 'fade': return { transition: 'fade', duration: 0.5 };
        default: return { transition: 'dissolve', duration: 0.5 };
    }
}

/** Transitions this converter understands; anything else is reported instead of approximated. */
const KNOWN_TRANSITIONS = new Set(['dissolve', 'slowdissolve', 'fade']);

export class Emitter {
    private gaps: Gap[] = [];
    private gapSeq = 0;
    /** Commands awaiting a `with` statement, per Ren'Py's "apply to all pending changes" rule. */
    private pending: VNCommand[] = [];
    /**
     * Ren'Py image TAG -> the id of the ShowImage that last displayed it.
     *
     * `hide <tag>` names the tag, but Flourish's HideImage points at the SHOW COMMAND that created
     * the overlay (`targetCommandId`). The old build emitted `elementId` instead, so all 73 hides
     * were no-ops and overlays piled up for the rest of the scene.
     */
    private lastShowByTag = new Map<string, string>();

    constructor(private ctx: EmitContext, private file: string) {}

    getGaps(): Gap[] { return this.gaps; }

    /**
     * One `Group` marker. Visible in the editor, guaranteed no-op at runtime.
     * `[Gnnnn]` ties the on-screen marker to a row in the gap report.
     */
    private marker(kind: string, pos: Pos, detail: string, severity: Gap['severity']): VNCommand {
        const id = this.ctx.nextId('cmd');
        const gapId = `G${String(++this.gapSeq).padStart(4, '0')}`;
        this.gaps.push({ id: gapId, kind, severity, file: pos.file, line: pos.line, detail, commandId: id });
        return {
            id, type: CT.Group,
            name: `UNCONVERTED [${gapId}] ${kind} - ${pos.file}:${pos.line}`,
            commandIds: [], collapsed: true,
        } as unknown as VNCommand;
    }

    /** Attach a transition to everything staged since the last interaction. */
    private applyWith(name: string, pos: Pos): VNCommand[] {
        if (!KNOWN_TRANSITIONS.has(name)) {
            const m = this.marker('with-transition', pos, name, 'degraded');
            this.pending = [];
            return [m];
        }
        const { transition, duration } = mapTransition(name);
        for (const cmd of this.pending) {
            const c = cmd as unknown as Record<string, unknown>;
            if ('transition' in c) { c.transition = transition; c.duration = duration; }
        }
        this.pending = [];
        return [];
    }

    private stage<T extends VNCommand>(cmd: T): T {
        this.pending.push(cmd);
        return cmd;
    }

    private say(node: SayNode): VNCommand[] {
        const { text, gaps } = mapText(node.text, {
            variableName: (n) => (this.ctx.variableId(n) ? n : null),
        });
        for (const g of gaps) {
            if (g.kind === 'markup-dropped') continue;                 // recorded in bulk below
            this.gaps.push({
                id: `G${String(++this.gapSeq).padStart(4, '0')}`,
                kind: `text-${g.kind}`, severity: g.kind === 'unknown-variable' ? 'blocker' : 'degraded',
                file: node.pos.file, line: node.pos.line, detail: g.detail, commandId: '',
            });
        }
        const characterId = node.speaker ? this.ctx.characterId(node.speaker) : null;
        return [{
            id: this.ctx.nextId('cmd'),
            type: CT.Dialogue,
            characterId,
            text,
        } as unknown as VNCommand];
    }

    /** A `show` of a character portrait, using the dataflow's reconstructed piece set. */
    private showCharacter(node: ShowNode, tag: string, portrait: string): VNCommand[] {
        const characterId = this.ctx.characterId(portrait);
        const expressionId = this.ctx.expressionId(portrait);
        if (!characterId || !expressionId) {
            return [this.marker('unknown-character', node.pos, portrait, 'blocker')];
        }
        const snap = this.ctx.showAt(node.pos.line);
        const place = this.ctx.placement(tag, node.transforms);
        if (!place) {
            return [this.marker('unresolved-placement', node.pos, node.transforms.join(',') || 'none', 'blocker')];
        }
        const layerOverrides: Record<string, string | null> = {};
        for (const [slot, value] of Object.entries(snap?.determinate ?? {})) {
            const layerId = this.ctx.layerId(portrait, slot);
            if (!layerId) continue;
            // `none` is Ren'Py's CLEAR sentinel - it must null the layer, never resolve to art.
            layerOverrides[layerId] = value === 'none'
                ? null
                : this.ctx.assetId(portrait, slot, value, snap?.matrix ?? null);
        }
        const { transition, duration } = mapTransition(node.withTransition);
        return [this.stage({
            id: this.ctx.nextId('cmd'),
            type: CT.ShowCharacter,
            characterId, expressionId,
            position: { x: place.x, y: place.y },
            scale: place.scale,
            transition, duration,
            layerOverrides,
        } as unknown as VNCommand)];
    }

    private scene(node: SceneNode): VNCommand[] {
        const { transition, duration } = mapTransition(node.withTransition);
        if (node.colour) {
            return [this.stage({
                id: this.ctx.nextId('cmd'),
                type: CT.SetBackground,
                imageId: null, backgroundColor: node.colour,
                transition, duration,
            } as unknown as VNCommand)];
        }
        const imageId = this.ctx.imageId(node.image);
        if (!imageId) {
            return [this.marker('unresolved-background', node.pos, node.image.join(' '), 'blocker')];
        }
        return [this.stage({
            id: this.ctx.nextId('cmd'),
            type: CT.SetBackground,
            imageId, transition, duration,
        } as unknown as VNCommand)];
    }

    /** A `$` one-liner: a ChangePortrait on stage, a variable assignment, or a marker. */
    private python(node: Extract<Node, { kind: 'python' }>): VNCommand[] {
        const live = this.ctx.liveChangeAt(node.pos.line);
        if (live) {
            const characterId = this.ctx.characterId(live.portrait);
            if (!characterId) return [this.marker('unknown-character', node.pos, live.portrait, 'blocker')];
            const layers: { layerId: string; assetId: string | null }[] = [];
            for (const [slot, value] of Object.entries(live.slots)) {
                const layerId = this.ctx.layerId(live.portrait, slot);
                if (!layerId) continue;
                layers.push({
                    layerId,
                    assetId: value === 'none' ? null : this.ctx.assetId(live.portrait, slot, value, live.matrix),
                });
            }
            if (!layers.length) return [];
            return [{
                id: this.ctx.nextId('cmd'), type: CT.SetCharacterLayer, characterId, layers,
            } as unknown as VNCommand];
        }
        // A ChangePortrait made while the character is OFF stage only seeds Ren'Py's dict. It has
        // no visual effect, so it must emit nothing - emitting one per call is what produced 355
        // silent no-ops in the previous build.
        if (/^ChangePortrait\s*\(/.test(node.code)) return [];

        const assign = /^([A-Za-z_][A-Za-z0-9_.]*)\s*(\+=|-=|=)\s*(.+)$/.exec(node.code);
        if (assign) {
            const [, name, op, rhs] = assign;
            const variableId = this.ctx.variableId(name);
            if (!variableId) return [this.marker('unknown-variable', node.pos, name, 'blocker')];
            const value = literalValue(rhs.trim());
            if (value === null) return [this.marker('non-literal-assignment', node.pos, name, 'blocker')];
            return [{
                id: this.ctx.nextId('cmd'), type: CT.SetVariable, variableId,
                operator: op === '=' ? 'set' : op === '+=' ? 'add' : 'subtract',
                value,
            } as unknown as VNCommand];
        }
        const call = /^([A-Za-z_][A-Za-z0-9_.]*)\s*\(/.exec(node.code);
        return [this.marker('python-call', node.pos, call ? call[1] : 'expression', 'note')];
    }

    emit(nodes: Node[]): VNCommand[] {
        const out: VNCommand[] = [];
        for (const node of nodes) {
            switch (node.kind) {
                case 'say': out.push(...this.say(node)); break;

                case 'scene': out.push(...this.scene(node)); break;

                case 'show': {
                    if (node.expression) {
                        out.push(this.marker('show-expression', node.pos, 'expression', 'degraded'));
                        break;
                    }
                    if (node.atl.length) {
                        out.push(this.marker('atl-block', node.pos, `${node.atl.length} steps`, 'degraded'));
                    }
                    const tag = node.as ?? node.image[0];
                    const portrait = tag ? this.ctx.tagToPortrait.get(tag.toLowerCase()) : undefined;
                    if (portrait) { out.push(...this.showCharacter(node, tag!, portrait)); break; }
                    const imageId = this.ctx.imageId(node.image);
                    if (!imageId) {
                        out.push(this.marker('unresolved-image', node.pos, node.image.join(' '), 'blocker'));
                        break;
                    }
                    const { transition, duration } = mapTransition(node.withTransition);
                    const geo = this.ctx.imagePlacement(node.image, node.transforms);
                    if (!geo) {
                        out.push(this.marker('unmeasured-image', node.pos, node.image.join(' '), 'blocker'));
                        break;
                    }
                    const showCmd = this.stage({
                        id: this.ctx.nextId('cmd'), type: CT.ShowImage, imageId,
                        x: geo.x, y: geo.y, width: geo.width, height: geo.height,
                        rotation: 0, opacity: 1, transition, duration,
                    } as unknown as VNCommand);
                    // Ren'Py's tag is the FIRST word of the image name, and a later show with the
                    // same tag REPLACES the earlier one - so the map holds the most recent.
                    if (node.image[0]) this.lastShowByTag.set(node.image[0], (showCmd as any).id);
                    out.push(showCmd);
                    break;
                }

                case 'hide': {
                    const tag = node.image[0];
                    const portrait = tag ? this.ctx.tagToPortrait.get(tag.toLowerCase()) : undefined;
                    const { transition, duration } = mapTransition(node.withTransition);
                    if (portrait) {
                        const characterId = this.ctx.characterId(portrait);
                        if (!characterId) { out.push(this.marker('unknown-character', node.pos, portrait, 'blocker')); break; }
                        out.push(this.stage({
                            id: this.ctx.nextId('cmd'), type: CT.HideCharacter, characterId, transition, duration,
                        } as unknown as VNCommand));
                        break;
                    }
                    // Non-character art is hidden by pointing at the Show that created it.
                    const targetCommandId = tag ? this.lastShowByTag.get(tag) : undefined;
                    if (!targetCommandId) {
                        // Nothing on this path ever showed that tag - hiding it is a no-op in
                        // Ren'Py too, but it is worth surfacing rather than assuming.
                        out.push(this.marker('hide-without-show', node.pos, tag ?? '', 'note'));
                        break;
                    }
                    out.push(this.stage({
                        id: this.ctx.nextId('cmd'), type: CT.HideImage,
                        targetCommandId, transition, duration,
                    } as unknown as VNCommand));
                    this.lastShowByTag.delete(tag!);
                    break;
                }

                case 'with': out.push(...this.applyWith(node.transition, node.pos)); break;

                case 'python': out.push(...this.python(node)); break;

                case 'pause':
                    out.push({
                        id: this.ctx.nextId('cmd'), type: CT.Wait,
                        duration: node.duration ?? 0,
                        ...(node.duration === null ? { waitIndefinitelyForInput: true } : {}),
                    } as unknown as VNCommand);
                    break;

                case 'jump':
                    out.push({
                        id: this.ctx.nextId('cmd'), type: CT.JumpToLabel, labelId: node.target,
                    } as unknown as VNCommand);
                    break;

                case 'label':
                    out.push({ id: this.ctx.nextId('cmd'), type: CT.Label, labelId: node.name } as unknown as VNCommand);
                    out.push(...this.emit(node.body));
                    break;

                case 'if': out.push(...this.branch(node)); break;

                case 'menu': out.push(...this.menu(node)); break;

                case 'play': out.push(...this.play(node)); break;

                // Ren'Py's dialogue-box visibility. Flourish shows/hides the box with the line
                // itself, so these have no separate command - recorded once as a note, not dropped.
                case 'window': break;
                case 'nvl': out.push(this.marker('nvl', node.pos, node.action, 'note')); break;
                case 'return': out.push(this.marker('return', node.pos, 'return', 'note')); break;
                case 'callScreen': out.push(this.marker('call-screen', node.pos, node.screen, 'note')); break;
                case 'call': out.push(this.marker('call-label', node.pos, node.target, 'blocker')); break;
                case 'stop': case 'queue': out.push(this.marker('audio', node.pos, node.kind, 'degraded')); break;
                case 'default': break;                       // becomes a project variable, not a command
                default: break;
            }
        }
        return out;
    }

    private play(node: Extract<Node, { kind: 'play' }>): VNCommand[] {
        const file = node.files[0];
        if (!file) return [this.marker('audio-no-file', node.pos, node.channel, 'blocker')];
        const audioId = this.ctx.audioId(file);
        if (!audioId) return [this.marker('unresolved-audio', node.pos, node.channel, 'blocker')];
        if (node.channel === 'music') {
            return [{
                id: this.ctx.nextId('cmd'), type: CT.PlayMusic, audioId,
                loop: node.loop ?? true,
                fadeIn: node.fadein ?? 0, fadeOut: node.fadeout ?? 0,
            } as unknown as VNCommand];
        }
        // Any other channel is a one-shot: the game's `voice2` carries dialogue voice bits.
        return [{
            id: this.ctx.nextId('cmd'), type: CT.PlaySoundEffect, audioId,
        } as unknown as VNCommand];
    }

    private conditionsFor(src: string, pos: Pos): VNCondition[] | null {
        const mapped = mapCondition(src, { variableId: (n) => this.ctx.variableId(n) });
        if (!mapped || mapped.unknownVariables.length) return null;
        return mapped.conditions;
    }

    private branch(node: Extract<Node, { kind: 'if' }>): VNCommand[] {
        const branchId = this.ctx.nextId('branch');
        const out: VNCommand[] = [];
        for (const [i, clause] of node.clauses.entries()) {
            if (clause.condition === null) {
                out.push({ id: this.ctx.nextId('cmd'), type: CT.BranchElse, branchId } as unknown as VNCommand);
                out.push(...this.emit(clause.body));
                continue;
            }
            const conditions = this.conditionsFor(clause.condition, clause.pos);
            if (!conditions) {
                // 🔴 An untranslatable condition must SKIP its body. Emitting the body unguarded
                // would play content the player is not supposed to see - worse than omitting it.
                out.push(this.marker('untranslatable-condition', clause.pos, 'condition', 'blocker'));
                continue;
            }
            out.push({
                id: this.ctx.nextId('cmd'),
                type: i === 0 ? CT.BranchStart : CT.BranchElseIf,
                branchId, conditions,
                ...(i === 0 ? { name: 'If', color: '#7aa2f7', isCollapsed: false } : {}),
            } as unknown as VNCommand);
            out.push(...this.emit(clause.body));
        }
        out.push({ id: this.ctx.nextId('cmd'), type: CT.BranchEnd, branchId } as unknown as VNCommand);
        return out;
    }

    /**
     * A menu becomes a Choice whose options jump to per-option labels, because Flourish's choice
     * options carry ACTIONS rather than inline command bodies.
     */
    private menu(node: Extract<Node, { kind: 'menu' }>): VNCommand[] {
        const endLabel = this.ctx.nextId('menuEnd');
        const options: unknown[] = [];
        const bodies: VNCommand[] = [];
        for (const opt of node.options) {
            const optLabel = this.ctx.nextId('menuOpt');
            const { text } = mapText(opt.text, { variableName: (n) => (this.ctx.variableId(n) ? n : null) });
            let conditions: VNCondition[] | undefined;
            if (opt.condition) {
                const mapped = this.conditionsFor(opt.condition, opt.pos);
                if (!mapped) {
                    bodies.push(this.marker('untranslatable-option-condition', opt.pos, 'condition', 'blocker'));
                    continue;
                }
                conditions = mapped;
            }
            options.push({
                id: this.ctx.nextId('opt'), text,
                actions: [{ type: 'jumpToLabel', labelId: optLabel }],
                ...(conditions ? { conditions } : {}),
            });
            bodies.push({ id: this.ctx.nextId('cmd'), type: CT.Label, labelId: optLabel } as unknown as VNCommand);
            bodies.push(...this.emit(opt.body));
            bodies.push({ id: this.ctx.nextId('cmd'), type: CT.JumpToLabel, labelId: endLabel } as unknown as VNCommand);
        }
        return [
            { id: this.ctx.nextId('cmd'), type: CT.Choice, options } as unknown as VNCommand,
            ...bodies,
            { id: this.ctx.nextId('cmd'), type: CT.Label, labelId: endLabel } as unknown as VNCommand,
        ];
    }
}

/** A Ren'Py literal as the engine would store it, or null when it is an expression. */
export function literalValue(src: string): string | number | boolean | null {
    const t = src.trim();
    if (t === 'True') return true;
    if (t === 'False') return false;
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    if (/^-?\d*\.\d+$/.test(t)) return parseFloat(t);
    const q = /^"([^"]*)"$|^'([^']*)'$/.exec(t);
    if (q) return q[1] ?? q[2] ?? '';
    const call = /^_\(\s*"([^"]*)"\s*\)$/.exec(t);       // Ren'Py's translation wrapper
    if (call) return call[1];
    return null;
}
