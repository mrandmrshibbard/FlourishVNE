import React, { useEffect, useRef, useState } from 'react';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNCharacter } from '../features/character/types';
import { useProject } from '../contexts/ProjectContext';
import CharacterEditor from './CharacterEditor';
import CharacterInspector from './CharacterInspector';
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
    const [selectedCharacters, setSelectedCharacters] = useState<Set<VNID>>(new Set());
    const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

    const charactersArray = Object.values(project.characters) as VNCharacter[];

    const addCharacter = () => {
        const name = `New Character ${Object.keys(project.characters).length + 1}`;
        dispatch({ type: 'ADD_CHARACTER', payload: { name, color: '#FFFFFF' } });
    };

    const handleDeleteCharacter = (characterId: VNID) => {
        dispatch({ type: 'DELETE_CHARACTER', payload: { characterId } });
    };

    const handleRenameCharacter = (characterId: VNID, name: string) => {
        const trimmed = name.trim();
        if (!trimmed || project.characters[characterId]?.name === trimmed) {
            setRenamingId(null);
            return;
        }
        dispatch({ type: 'UPDATE_CHARACTER', payload: { characterId, updates: { name: trimmed } } });
        setRenamingId(null);
    };

    const toggleMultiSelect = () => {
        setIsMultiSelectMode(!isMultiSelectMode);
        setSelectedCharacters(new Set());
    };

    const toggleCharacterSelection = (characterId: VNID) => {
        if (!isMultiSelectMode) return;
        
        const newSelected = new Set(selectedCharacters);
        if (newSelected.has(characterId)) {
            newSelected.delete(characterId);
        } else {
            newSelected.add(characterId);
        }
        setSelectedCharacters(newSelected);
    };

    const selectAllCharacters = () => {
        setSelectedCharacters(new Set(charactersArray.map(character => character.id)));
    };

    const clearSelection = () => {
        setSelectedCharacters(new Set());
    };

    const bulkDeleteCharacters = () => {
        if (selectedCharacters.size === 0) return;
        
        if (confirm(`Delete ${selectedCharacters.size} selected character(s)? This action cannot be undone.`)) {
            selectedCharacters.forEach(characterId => {
                dispatch({ type: 'DELETE_CHARACTER', payload: { characterId } });
            });
            setSelectedCharacters(new Set());
            
            // If active character was deleted, clear selection
            if (activeCharacterId && selectedCharacters.has(activeCharacterId)) {
                setActiveCharacterId(null);
            }
        }
    };

    const bulkDuplicateCharacters = () => {
        if (selectedCharacters.size === 0) return;
        
        selectedCharacters.forEach(characterId => {
            const character = project.characters[characterId];
            if (character) {
                const newName = `${character.name} Copy`;
                dispatch({ type: 'ADD_CHARACTER', payload: { 
                    name: newName, 
                    color: character.color,
                    baseImageUrl: character.baseImageUrl,
                    expressions: character.expressions
                } });
            }
        });
        setSelectedCharacters(new Set());
    };

    return (
        <div className="flex h-full min-w-[1400px] max-w-[1400px] min-h-[750px] max-h-[750px] gap-4 p-4 overflow-hidden">
            {/* Character List Sidebar */}
            <div className="w-72 panel flex flex-col flex-shrink-0 h-full">
                <div className="p-2 border-b-2 border-slate-700 flex-shrink-0">
                    <div className="flex items-center justify-between mb-0.5">
                        <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <SparkleIcon className="w-4 h-4 text-blue-400" />
                            Characters
                        </h2>
                        <button
                            onClick={toggleMultiSelect}
                            className={`px-2 py-0.5 text-xs font-semibold rounded ${isMultiSelectMode ? 'bg-sky-500 text-white' : 'bg-slate-600 text-gray-300 hover:bg-slate-500'}`}
                        >
                            {isMultiSelectMode ? 'Cancel' : 'Select'}
                        </button>
                    </div>
                    <p className="text-xs text-slate-400">Create character sprites</p>
                    
                    {isMultiSelectMode && (
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={selectAllCharacters}
                                className="px-2 py-1 text-xs bg-slate-600 text-gray-300 hover:bg-slate-500 rounded"
                            >
                                All
                            </button>
                            <button
                                onClick={clearSelection}
                                className="px-2 py-1 text-xs bg-slate-600 text-gray-300 hover:bg-slate-500 rounded"
                            >
                                None
                            </button>
                            {selectedCharacters.size > 0 && (
                                <>
                                    <button
                                        onClick={bulkDuplicateCharacters}
                                        className="px-2 py-1 text-xs bg-green-600 text-white hover:bg-green-500 rounded"
                                    >
                                        Duplicate ({selectedCharacters.size})
                                    </button>
                                    <button
                                        onClick={bulkDeleteCharacters}
                                        className="px-2 py-1 text-xs bg-red-600 text-white hover:bg-red-500 rounded"
                                    >
                                        Delete ({selectedCharacters.size})
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
                    {charactersArray.map(character => (
                        <CharacterItem
                            key={character.id}
                            character={character}
                            isSelected={activeCharacterId === character.id}
                            isRenaming={renamingId === character.id}
                            isMultiSelectMode={isMultiSelectMode}
                            isCharacterSelected={selectedCharacters.has(character.id)}
                            onSelect={() => setActiveCharacterId(character.id)}
                            onToggleSelection={() => toggleCharacterSelection(character.id)}
                            onStartRenaming={() => setRenamingId(character.id)}
                            onCancelRenaming={() => setRenamingId(null)}
                            onCommitRename={(name) => handleRenameCharacter(character.id, name)}
                            onDelete={() => handleDeleteCharacter(character.id)}
                        />
                    ))}
                </div>

                <div className="p-2 border-t-2 border-slate-700 flex-shrink-0 panel-header">
                    <button
                        onClick={addCharacter}
                        className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white py-2 px-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-all shadow-xl hover:shadow-2xl hover:scale-[1.02] border border-sky-400/50"
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

            {/* Character Inspector */}
            {activeCharacterId && (
                <CharacterInspector 
                    activeCharacterId={activeCharacterId} 
                    selectedExpressionId={selectedExpressionId}
                    setSelectedExpressionId={setSelectedExpressionId}
                />
            )}
        </div>
    );
};

interface CharacterItemProps {
    character: VNCharacter;
    isSelected: boolean;
    isRenaming: boolean;
    isMultiSelectMode: boolean;
    isCharacterSelected: boolean;
    onSelect: () => void;
    onToggleSelection: () => void;
    onStartRenaming: () => void;
    onCancelRenaming: () => void;
    onCommitRename: (name: string) => void;
    onDelete: () => void;
}

const CharacterItem: React.FC<CharacterItemProps> = ({
    character,
    isSelected,
    isRenaming,
    isMultiSelectMode,
    isCharacterSelected,
    onSelect,
    onToggleSelection,
    onStartRenaming,
    onCancelRenaming,
    onCommitRename,
    onDelete
}) => {
    const [renameValue, setRenameValue] = useState(character.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isRenaming) {
            setRenameValue(character.name);
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            });
        }
    }, [isRenaming, character.name]);

    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            const next = renameValue.trim() || character.name;
            onCommitRename(next);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setRenameValue(character.name);
            onCancelRenaming();
        }
    };

    const handleRenameBlur = () => {
        const next = renameValue.trim();
        if (next) {
            onCommitRename(next);
        } else {
            setRenameValue(character.name);
            onCancelRenaming();
        }
    };

    // Get thumbnail from base image or first expression
    const thumbnailUrl = character.baseImageUrl || (Object.values(character.expressions)[0] ? null : null);

    return (
        <div
            onClick={isMultiSelectMode ? onToggleSelection : onSelect}
            onDoubleClick={isMultiSelectMode ? undefined : onStartRenaming}
            className={`group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                isSelected
                    ? 'bg-sky-500/20 border-2 border-sky-500/50 shadow-lg scale-[1.02]'
                    : isCharacterSelected
                    ? 'bg-green-500/20 border-2 border-green-500/50 shadow-md'
                    : 'hover:bg-slate-700/70 border-2 border-transparent'
            }`}
        >
            {isMultiSelectMode && (
                <input
                    type="checkbox"
                    checked={isCharacterSelected}
                    onChange={() => {}} // Handled by onClick
                    className="w-5 h-5 text-green-600 bg-slate-700 border-slate-500 rounded focus:ring-green-500 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                />
            )}
            {thumbnailUrl ? (
                <img
                    src={thumbnailUrl}
                    alt={character.name}
                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-slate-700 border border-slate-600"
                />
            ) : (
                <div className="w-10 h-10 rounded-lg bg-slate-700 border border-slate-600 flex items-center justify-center flex-shrink-0">
                    <SparkleIcon className="w-5 h-5 text-slate-400" />
                </div>
            )}

            <div className="flex-grow truncate min-w-0">
                {isRenaming ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={handleRenameBlur}
                        onKeyDown={handleRenameKeyDown}
                        className="w-full bg-slate-900 text-white py-1.5 px-2 rounded text-sm outline-none ring-2 ring-sky-500"
                        onClick={e => e.stopPropagation()}
                        autoFocus
                    />
                ) : (
                    <span className="text-sm font-medium">{character.name}</span>
                )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                    onClick={(e) => { e.stopPropagation(); onStartRenaming(); }}
                    className="p-1.5 text-slate-400 hover:text-sky-400 bg-slate-700 hover:bg-slate-600 rounded transition-all hover:scale-110 opacity-0 group-hover:opacity-100"
                    title="Rename"
                >
                    <PencilIcon className="w-3.5 h-3.5" />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-1.5 text-slate-400 hover:text-red-400 bg-slate-700 hover:bg-slate-600 rounded transition-all hover:scale-110 opacity-0 group-hover:opacity-100"
                    title="Delete"
                >
                    <TrashIcon className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
};

export default CharacterManager;
