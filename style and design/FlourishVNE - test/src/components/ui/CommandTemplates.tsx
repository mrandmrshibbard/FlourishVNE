import React, { useState } from 'react';
import { VNCommand, CommandType, ShowCharacterCommand, DialogueCommand, SetBackgroundCommand, PlayMusicCommand, ChoiceCommand, HideCharacterCommand, WaitCommand } from '../../features/scene/types';
import { VNID } from '../../types';
import Button from './Button';
import { PlusIcon, BookOpenIcon, MusicalNoteIcon, PhotoIcon, SparkleIcon, TrashIcon } from '../icons';

interface CommandTemplate {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    commands: Omit<VNCommand, 'id'>[];
}

interface CommandTemplatesProps {
    onInsertTemplate: (commands: Omit<VNCommand, 'id'>[]) => void;
    className?: string;
}

const COMMAND_TEMPLATES: CommandTemplate[] = [
    {
        id: 'character-entrance',
        name: 'Character Entrance',
        description: 'Show a character with dialogue',
        icon: <SparkleIcon className="w-4 h-4" />,
        commands: [
            {
                type: CommandType.ShowCharacter,
                characterId: '',
                position: 'center',
                transition: 'fade',
                modifiers: {}
            } as Omit<ShowCharacterCommand, 'id'>,
            {
                type: CommandType.Dialogue,
                characterId: '',
                text: 'Hello there!',
                modifiers: {}
            } as Omit<DialogueCommand, 'id'>
        ]
    },
    {
        id: 'background-change',
        name: 'Background Change',
        description: 'Change scene background with transition',
        icon: <PhotoIcon className="w-4 h-4" />,
        commands: [
            {
                type: CommandType.SetBackground,
                backgroundId: '',
                transition: 'fade',
                modifiers: {}
            } as Omit<SetBackgroundCommand, 'id'>
        ]
    },
    {
        id: 'music-start',
        name: 'Start Background Music',
        description: 'Play looping background music',
        icon: <MusicalNoteIcon className="w-4 h-4" />,
        commands: [
            {
                type: CommandType.PlayMusic,
                audioId: '',
                loop: true,
                fadeDuration: 1000,
                volume: 0.7,
                modifiers: {}
            } as Omit<PlayMusicCommand, 'id'>
        ]
    },
    {
        id: 'choice-dialogue',
        name: 'Choice with Dialogue',
        description: 'Present player choice with preceding dialogue',
        icon: <BookOpenIcon className="w-4 h-4" />,
        commands: [
            {
                type: CommandType.Dialogue,
                characterId: '',
                text: 'What would you like to do?',
                modifiers: {}
            } as Omit<DialogueCommand, 'id'>,
            {
                type: CommandType.Choice,
                options: [
                    { id: 'option1', text: 'Option 1', targetSceneId: '' },
                    { id: 'option2', text: 'Option 2', targetSceneId: '' }
                ],
                modifiers: {}
            } as Omit<ChoiceCommand, 'id'>
        ]
    },
    {
        id: 'character-exit',
        name: 'Character Exit',
        description: 'Hide a character with transition',
        icon: <TrashIcon className="w-4 h-4" />,
        commands: [
            {
                type: CommandType.HideCharacter,
                characterId: '',
                transition: 'fade',
                modifiers: {}
            } as Omit<HideCharacterCommand, 'id'>
        ]
    },
    {
        id: 'wait-pause',
        name: 'Wait/Pause',
        description: 'Add a timed pause in the scene',
        icon: <PlusIcon className="w-4 h-4" />,
        commands: [
            {
                type: CommandType.Wait,
                duration: 2,
                modifiers: {}
            } as Omit<WaitCommand, 'id'>
        ]
    }
];

export const CommandTemplates: React.FC<CommandTemplatesProps> = ({
    onInsertTemplate,
    className = ''
}) => {
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

    const handleInsertTemplate = (template: CommandTemplate) => {
        onInsertTemplate(template.commands);
        setSelectedTemplate(null);
    };

    return (
        <div className={`space-y-3 ${className}`}>
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Command Templates
            </div>
            <div className="grid grid-cols-2 gap-2">
                {COMMAND_TEMPLATES.map((template) => (
                    <Button
                        key={template.id}
                        variant="secondary"
                        size="sm"
                        className="h-auto p-3 text-left justify-start"
                        onClick={() => handleInsertTemplate(template)}
                        title={template.description}
                    >
                        <div className="flex items-start space-x-2">
                            <div className="flex-shrink-0 mt-0.5">
                                {template.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                                    {template.name}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {template.description}
                                </div>
                            </div>
                        </div>
                    </Button>
                ))}
            </div>
        </div>
    );
};

export default CommandTemplates;