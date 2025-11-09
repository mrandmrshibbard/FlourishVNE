import React, { useState, useMemo } from 'react';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNCharacter } from '../features/character/types';
import { useProject } from '../contexts/ProjectContext';
import CharacterEditor from './CharacterEditor';
import { PlusIcon, TrashIcon, SparkleIcon, PencilIcon } from './icons';

interface CharacterManagerProps {
    project: VNProject;
    activeCharacterId: VNID | null;
    setActiveCharacterId: (id: VNID | null) => void;
    selectedExpressionId: string | null;
    setSelectedExpressionId: (id: string | null) => void;
}

const CharacterManager: React.FC<CharacterManagerProps> = ({
    project,
    activeCharacterId,
    setActiveCharacterId,
    selectedExpressionId,
    setSelectedExpressionId
}) => {
    const { dispatch } = useProject();
    const [renamingId, setRenamingId] = useState<VNID | null>(null);

    const charactersArray = useMemo(() => Object.values(project.characters) as VNCharacter[], [project.characters]);

    const addCharacter = () => {
        const name = `New Character ${Object.keys(project.characters).length + 1}`;
        dispatch({ type: 'ADD_CHARACTER', payload: { name, color: '#FFFFFF' } });
    };

    const handleDeleteCharacter = (characterId: VNID) => {
        dispatch({ type: 'DELETE_CHARACTER', payload: { characterId } });
    };

    const handleRenameCharacter = (characterId: VNID, name: string) => {
        dispatch({ type: 'UPDATE_CHARACTER', payload: { characterId, updates: { name } } });
        setRenamingId(null);
    };

    return (
        <div className="flex h-full">
            {/* Character List Sidebar */}
            <div className="bg-slate-800 border-r border-slate-700 flex flex-col" style={{ width: 'var(--sidebar-width)' }}>
                <div className="p-4 border-b border-slate-700">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <SparkleIcon className="w-5 h-5" />
                        Characters
                    </h2>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {charactersArray.map(character => (
                        <CharacterItem
                            key={character.id}
                            character={character}
                            isSelected={activeCharacterId === character.id}
                            isRenaming={renamingId === character.id}
                            onSelect={() => setActiveCharacterId(character.id)}
                            onStartRenaming={() => setRenamingId(character.id)}
                            onCommitRename={(name) => handleRenameCharacter(character.id, name)}
                            onDelete={() => handleDeleteCharacter(character.id)}
                        />
                    ))}
                </div>

                <div className="p-2 border-t border-slate-700">
                    <button
                        onClick={addCharacter}
                        className="w-full bg-sky-500 hover:bg-sky-600 text-white p-2 rounded-md flex items-center justify-center gap-2 font-bold transition-colors"
                    >
                        <PlusIcon className="w-4 h-4" />
                        Add Character
                    </button>
                </div>
            </div>

            {/* Character Editor */}
            <div className="flex-1 flex flex-col min-w-0">
                {activeCharacterId ? (
                    <CharacterEditor
                        activeCharacterId={activeCharacterId}
                        selectedExpressionId={selectedExpressionId}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-400">
                        <div className="text-center">
                            <SparkleIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p className="text-lg">Select a character to edit</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

interface CharacterItemProps {
    character: VNCharacter;
    isSelected: boolean;
    isRenaming: boolean;
    onSelect: () => void;
    onStartRenaming: () => void;
    onCommitRename: (name: string) => void;
    onDelete: () => void;
}

const CharacterItem: React.FC<CharacterItemProps> = ({
    character,
    isSelected,
    isRenaming,
    onSelect,
    onStartRenaming,
    onCommitRename,
    onDelete
}) => {
    const [renameValue, setRenameValue] = useState(character.name);

    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onCommitRename(renameValue);
        } else if (e.key === 'Escape') {
            setRenameValue(character.name);
            onStartRenaming(); // This will cancel renaming
        }
    };

    const handleRenameBlur = () => {
        onCommitRename(renameValue);
    };

    // Get thumbnail from base image or first expression
    const thumbnailUrl = character.baseImageUrl || (Object.values(character.expressions)[0] ? null : null);

    return (
        <div
            onClick={onSelect}
            onDoubleClick={onStartRenaming}
            className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                isSelected
                    ? 'bg-sky-500/20 border border-sky-500/50'
                    : 'hover:bg-slate-700'
            }`}
        >
            {thumbnailUrl ? (
                <img
                    src={thumbnailUrl}
                    alt={character.name}
                    className="w-8 h-8 rounded-md object-cover flex-shrink-0 bg-slate-700"
                />
            ) : (
                <div className="w-8 h-8 rounded-md bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <SparkleIcon className="w-4 h-4 text-slate-400" />
                </div>
            )}

            <div className="flex-grow truncate">
                {isRenaming ? (
                    <input
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={handleRenameBlur}
                        onKeyDown={handleRenameKeyDown}
                        className="w-full bg-slate-900 text-white p-1 rounded text-sm outline-none ring-1 ring-sky-500"
                        onClick={e => e.stopPropagation()}
                        autoFocus
                    />
                ) : (
                    <span className="text-sm">{character.name}</span>
                )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                <button
                    onClick={(e) => { e.stopPropagation(); onStartRenaming(); }}
                    className="p-1 text-slate-500 hover:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Rename"
                >
                    <PencilIcon className="w-3 h-3" />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete"
                >
                    <TrashIcon className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
};

export default React.memo(CharacterManager);