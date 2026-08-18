/**
 * The intermediate representation: one typed node per Ren'Py statement.
 *
 * There is deliberately NO "raw line" or "unknown" node. The old converter had one, and 199 lines
 * quietly fell into it - which is why commands went missing with no error. Anything the parser
 * cannot classify throws instead. Statements that parse fine but have no Flourish equivalent
 * (`call screen`, for example) get a proper node here and become a visible marker later; that
 * decision belongs to the mapper, not the parser.
 *
 * CONTENT RULE: `text` fields carry game dialogue. Never log, print, or serialise them into a
 * report - only their lengths and counts.
 */

export interface Pos {
    /** 1-based physical line in the source file. */
    line: number;
    file: string;
}

export type Node =
    | LabelNode | SayNode | MenuNode | IfNode | JumpNode | CallNode | CallScreenNode
    | ReturnNode | SceneNode | ShowNode | HideNode | PlayNode | StopNode | QueueNode
    | WindowNode | WithNode | PauseNode | NvlNode | DefaultNode | PythonNode;

export interface LabelNode { kind: 'label'; pos: Pos; name: string; body: Node[] }

/**
 * A line of dialogue. `speaker` is the Ren'Py character shorthand (null = narrator).
 * `attributes` are image attributes on the say line (`c happy "..."`), which Ren'Py applies to the
 * speaker's currently-shown sprite.
 */
export interface SayNode {
    kind: 'say'; pos: Pos;
    speaker: string | null;
    attributes: string[];
    text: string;
}

export interface MenuOption {
    pos: Pos;
    text: string;
    /** Raw Ren'Py condition source from `"..." if <cond>:`, if present. */
    condition: string | null;
    body: Node[];
}
export interface MenuNode { kind: 'menu'; pos: Pos; options: MenuOption[] }

/** `if` / `elif` / `else` collapsed into ordered clauses; a null condition is the `else`. */
export interface IfClause { pos: Pos; condition: string | null; body: Node[] }
export interface IfNode { kind: 'if'; pos: Pos; clauses: IfClause[] }

export interface JumpNode { kind: 'jump'; pos: Pos; target: string }
export interface CallNode { kind: 'call'; pos: Pos; target: string }
export interface CallScreenNode { kind: 'callScreen'; pos: Pos; screen: string; args: string }
export interface ReturnNode { kind: 'return'; pos: Pos }

/** One ATL property line inside a `show`/`scene` block, e.g. `easein 1.8 yoffset -100`. */
export interface AtlStep {
    pos: Pos;
    /** Warper name (`easein`, `linear`, ...) when the line begins with one. */
    warper: string | null;
    /** Warper duration in seconds, when a warper is present. */
    duration: number | null;
    /** Numeric transform properties set on this step. */
    props: Record<string, number>;
    /** `pause(<n>)` inside an ATL block. */
    pause: number | null;
}

export interface SceneNode {
    kind: 'scene'; pos: Pos;
    /** Image name as space-separated words (`bg hill night`), or [] for `scene` alone. */
    image: string[];
    /** A solid-colour scene: `scene expression "#fff"`. */
    colour: string | null;
    transforms: string[];
    atl: AtlStep[];
    /** Inline `with <transition>` on the same statement. */
    withTransition: string | null;
}

export interface ShowNode {
    kind: 'show'; pos: Pos;
    image: string[];
    /** `as <tag>` when present - Ren'Py's explicit tag override. */
    as: string | null;
    /** Raw source of `show expression <expr>`, which the mapper must resolve or mark. */
    expression: string | null;
    transforms: string[];
    atl: AtlStep[];
    withTransition: string | null;
}

export interface HideNode { kind: 'hide'; pos: Pos; image: string[]; withTransition: string | null }

export interface PlayNode {
    kind: 'play'; pos: Pos;
    channel: string;
    files: string[];
    fadein: number | null;
    fadeout: number | null;
    loop: boolean | null;
}
export interface StopNode { kind: 'stop'; pos: Pos; channel: string; fadeout: number | null }
export interface QueueNode { kind: 'queue'; pos: Pos; channel: string; files: string[] }

export interface WindowNode { kind: 'window'; pos: Pos; action: 'show' | 'hide' | 'auto' }
export interface WithNode { kind: 'with'; pos: Pos; transition: string }
export interface PauseNode { kind: 'pause'; pos: Pos; duration: number | null }
export interface NvlNode { kind: 'nvl'; pos: Pos; action: 'clear' | 'show' | 'hide' }

export interface DefaultNode { kind: 'default'; pos: Pos; name: string; expr: string }
/** A `$ <expression>` one-liner. The mapper decides what, if anything, it becomes. */
export interface PythonNode { kind: 'python'; pos: Pos; code: string }
