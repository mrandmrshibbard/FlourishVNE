import { VNID, VNPosition, VNTransition } from '../../types';
import { VNSetVariableOperator } from '../variables/types';
import { JumpToSceneAction, SetVariableAction, VNTextAlign, VNVAlign, VNCondition, VNUIAction } from '../../types/shared';

/**
 * Command execution modifiers for parallel/async execution
 */
export interface CommandModifiers {
    /** If true, don't wait for this command to complete before advancing to next command */
    runAsync?: boolean;
    /** Visual grouping ID - commands with same stackId are displayed on the same line */
    stackId?: string;
    /** Order within a stack (lower numbers execute first) */
    stackOrder?: number;
}

/**
 * Commands that should NEVER run async (blocking by nature)
 */
export const BLOCKING_COMMAND_TYPES = [
    'Dialogue',
    'Choice',
    'TextInput',
    'BranchStart',
    'BranchEnd',
    'Jump',
    'JumpToLabel',
    'ShowScreen',
] as const;

/**
 * Commands that CAN run async but may have unpredictable results
 */
export const UNPREDICTABLE_ASYNC_COMMANDS = [
    'PlayMovie',
    'Wait',
] as const;

export enum CommandType {
    Dialogue = 'Dialogue',
    SetBackground = 'SetBackground',
    ShowCharacter = 'ShowCharacter',
    HideCharacter = 'HideCharacter',
    Choice = 'Choice',
    BranchStart = 'BranchStart',
    BranchEnd = 'BranchEnd',
    SetVariable = 'SetVariable',
    TextInput = 'TextInput',
    Jump = 'Jump',
    Label = 'Label',
    JumpToLabel = 'JumpToLabel',
    PlayMusic = 'PlayMusic',
    StopMusic = 'StopMusic',
    PlaySoundEffect = 'PlaySoundEffect',
    StopSoundEffect = 'StopSoundEffect',
    PlayMovie = 'PlayMovie',
    Wait = 'Wait',
    ShakeScreen = 'ShakeScreen',
    TintScreen = 'TintScreen',
    PanZoomScreen = 'PanZoomScreen',
    ResetScreenEffects = 'ResetScreenEffects',
    FlashScreen = 'FlashScreen',
    ShowScreen = 'ShowScreen',
    ShowText = 'ShowText',
    ShowImage = 'ShowImage',
    HideText = 'HideText',
    HideImage = 'HideImage',
    ShowButton = 'ShowButton',
    HideButton = 'HideButton',
    Group = 'Group', // Visual grouping only, no execution
}

interface BaseCommand {
    id: VNID;
    type: CommandType;
    conditions?: VNCondition[];
    modifiers?: CommandModifiers;
}

export interface DialogueCommand extends BaseCommand {
    type: CommandType.Dialogue;
    characterId: VNID | null;
    text: string;
}

export interface SetBackgroundCommand extends BaseCommand {
    type: CommandType.SetBackground;
    backgroundId: VNID;
    transition: VNTransition;
    duration: number; // in seconds
}

export interface ShowCharacterCommand extends BaseCommand {
    type: CommandType.ShowCharacter;
    characterId: VNID;
    expressionId: VNID;
    position: VNPosition;
    transition: VNTransition;
    duration: number; // in seconds
    startPosition?: VNPosition; // for slide transitions
    endPosition?: VNPosition; // for slide transitions
}

export interface HideCharacterCommand extends BaseCommand {
    type: CommandType.HideCharacter;
    characterId: VNID;
    transition: VNTransition;
    duration: number; // in seconds
    startPosition?: VNPosition; // for slide transitions
    endPosition?: VNPosition; // for slide transitions
}

// Choice actions now support all UI button actions for maximum flexibility
export type ChoiceAction = VNUIAction;

export interface ChoiceOption {
    id: VNID;
    text: string;
    actions?: ChoiceAction[];
    conditions?: VNCondition[];
    targetSceneId?: VNID; // Deprecated, for migration
}
export interface ChoiceCommand extends BaseCommand {
    type: CommandType.Choice;
    options: ChoiceOption[];
}

export interface BranchStartCommand extends BaseCommand {
    type: CommandType.BranchStart;
    name: string;
    color: string;
    branchId: VNID;
    isCollapsed?: boolean;
}

export interface BranchEndCommand extends BaseCommand {
    type: CommandType.BranchEnd;
    branchId: VNID;
}

export interface SetVariableCommand extends BaseCommand {
    type: CommandType.SetVariable;
    variableId: VNID;
    operator: VNSetVariableOperator;
    value: string | number | boolean;
    randomMin?: number; // For random operator - minimum value (inclusive)
    randomMax?: number; // For random operator - maximum value (inclusive)
}

export interface TextInputCommand extends BaseCommand {
    type: CommandType.TextInput;
    variableId: VNID;
    prompt: string;
    placeholder?: string;
    maxLength?: number;
}

export interface JumpCommand extends BaseCommand {
    type: CommandType.Jump;
    targetSceneId: VNID;
}

export interface LabelCommand extends BaseCommand {
    type: CommandType.Label;
    labelId: string;
}

export interface JumpToLabelCommand extends BaseCommand {
    type: CommandType.JumpToLabel;
    labelId: string;
}

export interface PlayMusicCommand extends BaseCommand {
    type: CommandType.PlayMusic;
    audioId: VNID;
    loop: boolean;
    fadeDuration: number;
    volume?: number; // optional per-command volume override (0-1)
}
export interface StopMusicCommand extends BaseCommand {
    type: CommandType.StopMusic;
    fadeDuration: number;
}
export interface PlaySoundEffectCommand extends BaseCommand {
    type: CommandType.PlaySoundEffect;
    audioId: VNID;
    volume?: number; // optional per-sfx volume (0-1)
}
export interface StopSoundEffectCommand extends BaseCommand {
    type: CommandType.StopSoundEffect;
}
export interface PlayMovieCommand extends BaseCommand {
    type: CommandType.PlayMovie;
    videoId: VNID;
    waitsForCompletion: boolean;
}

export interface WaitCommand extends BaseCommand {
    type: CommandType.Wait;
    duration: number; // in seconds
    waitForInput?: boolean;
}
export interface ShakeScreenCommand extends BaseCommand {
    type: CommandType.ShakeScreen;
    duration: number;
    intensity: number;
}

export interface TintScreenCommand extends BaseCommand {
    type: CommandType.TintScreen;
    color: string;
    duration: number;
}
export interface PanZoomScreenCommand extends BaseCommand {
    type: CommandType.PanZoomScreen;
    zoom: number;
    panX: number; // percentage
    panY: number; // percentage
    duration: number;
}
export interface ResetScreenEffectsCommand extends BaseCommand {
    type: CommandType.ResetScreenEffects;
    duration: number;
}
export interface FlashScreenCommand extends BaseCommand {
    type: CommandType.FlashScreen;
    color: string;
    duration: number;
}
export interface ShowScreenCommand extends BaseCommand {
    type: CommandType.ShowScreen;
    screenId: VNID;
}

export interface ShowTextCommand extends BaseCommand {
    type: CommandType.ShowText;
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontFamily: string;
    color: string;
    width?: number;
    height?: number;
    textAlign?: VNTextAlign;
    verticalAlign?: VNVAlign;
    transition: VNTransition;
    duration: number; // in seconds
}

export interface ShowImageCommand extends BaseCommand {
    type: CommandType.ShowImage;
    imageId: VNID;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
    scaleX?: number;
    scaleY?: number;
    transition: VNTransition;
    duration: number; // in seconds
}

export interface HideTextCommand extends BaseCommand {
    type: CommandType.HideText;
    targetCommandId: VNID;
    transition: VNTransition;
    duration: number; // in seconds
}

export interface HideImageCommand extends BaseCommand {
    type: CommandType.HideImage;
    targetCommandId: VNID;
    transition: VNTransition;
    duration: number; // in seconds
}

export interface ShowButtonCommand extends BaseCommand {
    type: CommandType.ShowButton;
    text: string;
    x: number; // percentage
    y: number; // percentage
    width?: number; // percentage, optional
    height?: number; // percentage, optional
    anchorX?: number; // 0-1, default 0.5
    anchorY?: number; // 0-1, default 0.5
    // Styling
    backgroundColor?: string;
    textColor?: string;
    fontSize?: number;
    fontWeight?: 'normal' | 'bold';
    borderRadius?: number; // pixels
    // Images (optional)
    image?: { type: 'image' | 'video', id: VNID } | null;
    hoverImage?: { type: 'image' | 'video', id: VNID } | null;
    // Actions
    onClick: VNUIAction;
    actions?: VNUIAction[]; // Multiple actions support
    clickSound?: VNID | null;
    waitForClick?: boolean; // If true, pause execution until button is clicked
    // Transition
    transition?: VNTransition;
    duration?: number; // in seconds
    // Conditions
    showConditions?: VNCondition[];
}

export interface HideButtonCommand extends BaseCommand {
    type: CommandType.HideButton;
    targetCommandId: VNID;
    transition?: VNTransition;
    duration?: number; // in seconds
}

export interface GroupCommand extends BaseCommand {
    type: CommandType.Group;
    name: string;
    /** IDs of commands contained in this group */
    commandIds: VNID[];
    /** Visual state - collapsed or expanded */
    collapsed?: boolean;
}

export type VNCommand =
  | DialogueCommand | SetBackgroundCommand | ShowCharacterCommand | HideCharacterCommand
    | ChoiceCommand | BranchStartCommand | BranchEndCommand | SetVariableCommand | TextInputCommand | JumpCommand | LabelCommand | JumpToLabelCommand
  | PlayMusicCommand | StopMusicCommand | PlaySoundEffectCommand | StopSoundEffectCommand | PlayMovieCommand | WaitCommand
  | ShakeScreenCommand | TintScreenCommand | PanZoomScreenCommand | ResetScreenEffectsCommand
  | FlashScreenCommand | ShowScreenCommand | ShowTextCommand | ShowImageCommand
  | HideTextCommand | HideImageCommand | ShowButtonCommand | HideButtonCommand | GroupCommand;

export interface VNScene {
    id: VNID;
    name: string;
    commands: VNCommand[];
    conditions?: VNCondition[];
    fallbackSceneId?: VNID; // Scene to jump to if conditions fail
}
