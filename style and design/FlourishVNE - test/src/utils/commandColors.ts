import { CommandType } from '../features/scene/types';

export interface CommandColorScheme {
    bg: string;
    border: string;
    text: string;
    hover: string;
}

export const getCommandColorScheme = (commandType: CommandType): CommandColorScheme => {
    switch (commandType) {
        // Dialogue & Text - Blue
        case CommandType.Dialogue:
        case CommandType.ShowText:
        case CommandType.HideText:
            return {
                bg: 'bg-blue-900/30',
                border: 'border-blue-500/50',
                text: 'text-blue-300',
                hover: 'hover:bg-blue-900/50'
            };

        // Characters - Purple
        case CommandType.ShowCharacter:
        case CommandType.HideCharacter:
            return {
                bg: 'bg-purple-900/30',
                border: 'border-purple-500/50',
                text: 'text-purple-300',
                hover: 'hover:bg-purple-900/50'
            };

        // Scenes & Backgrounds - Green
        case CommandType.SetBackground:
        case CommandType.Jump:
        case CommandType.Label:
        case CommandType.JumpToLabel:
            return {
                bg: 'bg-green-900/30',
                border: 'border-green-500/50',
                text: 'text-green-300',
                hover: 'hover:bg-green-900/50'
            };

        // Audio - Pink
        case CommandType.PlayMusic:
        case CommandType.StopMusic:
        case CommandType.PlaySoundEffect:
            return {
                bg: 'bg-pink-900/30',
                border: 'border-pink-500/50',
                text: 'text-pink-300',
                hover: 'hover:bg-pink-900/50'
            };

        // Images & Media - Orange
        case CommandType.ShowImage:
        case CommandType.HideImage:
        case CommandType.PlayMovie:
            return {
                bg: 'bg-orange-900/30',
                border: 'border-orange-500/50',
                text: 'text-orange-300',
                hover: 'hover:bg-orange-900/50'
            };

        // Effects & Transitions - Cyan
        case CommandType.ShakeScreen:
        case CommandType.FlashScreen:
        case CommandType.TintScreen:
        case CommandType.PanZoomScreen:
        case CommandType.ResetScreenEffects:
            return {
                bg: 'bg-cyan-900/30',
                border: 'border-cyan-500/50',
                text: 'text-cyan-300',
                hover: 'hover:bg-cyan-900/50'
            };

        // Choices & Branching - Yellow
        case CommandType.Choice:
        case CommandType.BranchStart:
        case CommandType.BranchEnd:
            return {
                bg: 'bg-yellow-900/30',
                border: 'border-yellow-500/50',
                text: 'text-yellow-300',
                hover: 'hover:bg-yellow-900/50'
            };

        // Variables & Logic - Indigo
        case CommandType.SetVariable:
        case CommandType.TextInput:
            return {
                bg: 'bg-indigo-900/30',
                border: 'border-indigo-500/50',
                text: 'text-indigo-300',
                hover: 'hover:bg-indigo-900/50'
            };

        // UI & Interaction - Red
        case CommandType.ShowButton:
        case CommandType.HideButton:
        case CommandType.ShowScreen:
            return {
                bg: 'bg-red-900/30',
                border: 'border-red-500/50',
                text: 'text-red-300',
                hover: 'hover:bg-red-900/50'
            };

        // Flow Control - Slate
        case CommandType.Wait:
        case CommandType.Group:
        default:
            return {
                bg: 'bg-slate-700/30',
                border: 'border-slate-500/50',
                text: 'text-slate-300',
                hover: 'hover:bg-slate-700/50'
            };
    }
};

export const getCommandLabel = (commandType: CommandType): string => {
    const labels: Record<CommandType, string> = {
        [CommandType.Dialogue]: 'Dialogue',
        [CommandType.SetBackground]: 'Set Background',
        [CommandType.ShowCharacter]: 'Show Character',
        [CommandType.HideCharacter]: 'Hide Character',
        [CommandType.Choice]: 'Show Choices',
        [CommandType.BranchStart]: 'Branch Start',
        [CommandType.BranchEnd]: 'Branch End',
        [CommandType.SetVariable]: 'Set Variable',
        [CommandType.TextInput]: 'Text Input',
        [CommandType.Jump]: 'Jump',
        [CommandType.Label]: 'Label',
        [CommandType.JumpToLabel]: 'Jump To Label',
        [CommandType.PlayMusic]: 'Play Music',
        [CommandType.StopMusic]: 'Stop Music',
        [CommandType.PlaySoundEffect]: 'Play Sound',
        [CommandType.PlayMovie]: 'Play Video',
        [CommandType.Wait]: 'Wait',
        [CommandType.ShakeScreen]: 'Shake Screen',
        [CommandType.TintScreen]: 'Tint Screen',
        [CommandType.PanZoomScreen]: 'Pan/Zoom',
        [CommandType.ResetScreenEffects]: 'Reset Effects',
        [CommandType.FlashScreen]: 'Flash',
        [CommandType.ShowScreen]: 'Show UI Screen',
        [CommandType.ShowText]: 'Show Text',
        [CommandType.ShowImage]: 'Show Image',
        [CommandType.HideText]: 'Hide Text',
        [CommandType.HideImage]: 'Hide Image',
        [CommandType.ShowButton]: 'Show Button',
        [CommandType.HideButton]: 'Hide Button',
        [CommandType.Group]: 'Group',
    };
    return labels[commandType] || commandType;
};
