/**
 * THE contract between this converter and the FlourishVNE engine.
 *
 * Why this file exists: the previous converter wrote hand-typed object literals with no
 * connection to the engine's real types. It invented condition operators ("equals",
 * "greater_than") where the engine expects "==" / ">", and the engine's evaluator returns
 * FALSE for anything it does not recognise — so all 653 conditional branches always took the
 * false path and ~632 story branches never executed. It also wrote `elementId` where
 * `HideImage` reads `targetCommandId`, making 73/73 hides no-ops. Both were silent.
 *
 * Everything here is `import type` ONLY. Type imports are erased at compile time, so the CLI
 * runs under plain Node (which cannot resolve the app's extensionless, bundler-style imports)
 * while `npx tsc --noEmit` still type-checks every emitted command against the real engine
 * shapes. A wrong field name or a bogus operator becomes a COMPILE ERROR, not a silent no-op.
 *
 * `CT` mirrors the CommandType enum as string literals because an enum is a runtime value and
 * cannot cross the type-only boundary. `__tests__/contract.test.ts` imports the real enum (via
 * vitest, which does resolve app imports) and proves the mirror is exact.
 */
import type {
    VNCommand,
    VNScene,
    DialogueCommand,
    ShowImageCommand,
    HideImageCommand,
    ShowCharacterCommand,
    HideCharacterCommand,
    SetCharacterLayerCommand,
    SetBackgroundCommand,
    PlayMusicCommand,
    ChoiceCommand,
    ChoiceOption,
    JumpCommand,
    LabelCommand,
    JumpToLabelCommand,
    BranchStartCommand,
    BranchElseIfCommand,
    BranchElseCommand,
    BranchEndCommand,
    SetVariableCommand,
    WaitCommand,
    GroupCommand,
    ShowTextCommand,
    HideTextCommand,
} from '../../../src/features/scene/types';
import type { VNCondition, VNConditionOperator } from '../../../src/types/shared';
// Position/transition unions live in src/types, not the scene types.
import type { VNPosition, VNTransition } from '../../../src/types';
import type { VNProject } from '../../../src/types/project';
import type {
    VNCharacter,
    VNCharacterLayer,
    VNLayerAsset,
    VNCharacterExpression,
    VNLayerBox,
    VNCharacterAnimation,
} from '../../../src/features/character/types';
import type { VNVariable } from '../../../src/features/variables/types';

export type {
    VNCommand, VNScene, VNProject, VNCondition, VNConditionOperator, VNVariable,
    VNCharacter, VNCharacterLayer, VNLayerAsset, VNCharacterExpression, VNLayerBox,
    VNCharacterAnimation,
    DialogueCommand, ShowImageCommand, HideImageCommand, ShowCharacterCommand,
    HideCharacterCommand, SetCharacterLayerCommand, SetBackgroundCommand, PlayMusicCommand,
    ChoiceCommand, ChoiceOption, JumpCommand, LabelCommand, JumpToLabelCommand,
    BranchStartCommand, BranchElseIfCommand, BranchElseCommand, BranchEndCommand,
    SetVariableCommand, WaitCommand, GroupCommand, ShowTextCommand, HideTextCommand,
    VNPosition, VNTransition,
};

/** String mirror of the CommandType enum members this converter emits. Proven exact by contract.test.ts. */
export const CT = {
    Dialogue: 'Dialogue',
    ShowImage: 'ShowImage',
    HideImage: 'HideImage',
    ShowCharacter: 'ShowCharacter',
    HideCharacter: 'HideCharacter',
    SetCharacterLayer: 'SetCharacterLayer',
    PlayCharacterAnimation: 'PlayCharacterAnimation',
    SetBackground: 'SetBackground',
    PlayMusic: 'PlayMusic',
    StopMusic: 'StopMusic',
    PlaySoundEffect: 'PlaySoundEffect',
    Choice: 'Choice',
    Jump: 'Jump',
    Label: 'Label',
    JumpToLabel: 'JumpToLabel',
    BranchStart: 'BranchStart',
    BranchElseIf: 'BranchElseIf',
    BranchElse: 'BranchElse',
    BranchEnd: 'BranchEnd',
    SetVariable: 'SetVariable',
    Wait: 'Wait',
    Group: 'Group',
    ShowText: 'ShowText',
    HideText: 'HideText',
} as const;

export type EmittedCommandType = (typeof CT)[keyof typeof CT];

/**
 * EVERY condition operator this converter may emit. `map/conditions.ts` is the only module
 * allowed to produce one, and it must pick from here. Typed as the engine's own union, so a
 * typo or an invented name (the 653-dead-branch bug) fails `tsc`.
 */
export const OPERATORS = {
    eq: '==',
    ne: '!=',
    gt: '>',
    lt: '<',
    gte: '>=',
    lte: '<=',
    isTrue: 'is true',
    isFalse: 'is false',
    contains: 'contains',
    startsWith: 'startsWith',
} as const satisfies Record<string, VNConditionOperator>;

/** Ren'Py's virtual resolution — the source coordinate space for every geometry formula. */
export const RENPY = { width: 1920, height: 1080 } as const;

/**
 * Flourish's scene-overlay design-pixel reference. `ShowImage.width/height` and
 * `ShowText.fontSize` are pixels against THIS, never against gameResolution — the two spaces
 * are different and mixing them silently mis-sizes everything.
 */
export const OVERLAY_REFERENCE = { width: 1280, height: 720 } as const;

/** The character sprite frame: 90% of stage height, 3:4, transform-origin center bottom. */
export const SPRITE_FRAME = {
    /** Frame height as a fraction of stage height. */
    heightFraction: 0.9,
    /** Frame aspect (width / height). */
    aspect: 3 / 4,
    /** Frame height in Ren'Py virtual px: 0.9 * 1080. */
    heightPx: 972,
    /** Frame width in Ren'Py virtual px: 1920 * 0.675 * 9/16. */
    widthPx: 729,
} as const;
