import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useInlineRename } from '../hooks/useInlineRename';
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
    const { t } = useTranslation(['characters', 'common']);
    const [renamingId, setRenamingId] = useState<VNID | null>(null);
    const [draggedCharacterId, setDraggedCharacterId] = useState<VNID | null>(null);
    const [dropTargetId, setDropTargetId] = useState<VNID | null>(null);

    const charactersArray = useMemo(() => Object.values(project.characters) as VNCharacter[], [project.characters]);

    const addCharacter = () => {
        const name = t('newCharacterName', { n: Object.keys(project.characters).length + 1 });
        dispatch({ type: 'ADD_CHARACTER', payload: { name, color: '#FFFFFF' } });
    };

    const handleDeleteCharacter = (characterId: VNID) => {
        dispatch({ type: 'DELETE_CHARACTER', payload: { characterId } });
    };

    const handleRenameCharacter = (characterId: VNID, name: string) => {
        dispatch({ type: 'UPDATE_CHARACTER', payload: { characterId, updates: { name } } });
        setRenamingId(null);
    };

    // Drag-to-reorder the character list (mirrors the Scenes tab).
    const handleDragStart = (characterId: VNID) => {
        setDraggedCharacterId(characterId);
    };

    const handleDragOver = (e: React.DragEvent, characterId: VNID) => {
        e.preventDefault();
        if (draggedCharacterId && draggedCharacterId !== characterId) {
            setDropTargetId(characterId);
        }
    };

    const handleDragLeave = () => {
        setDropTargetId(null);
    };

    const handleDrop = (e: React.DragEvent, targetCharacterId: VNID) => {
        e.preventDefault();
        if (!draggedCharacterId || draggedCharacterId === targetCharacterId) {
            setDraggedCharacterId(null);
            setDropTargetId(null);
            return;
        }

        const characterIds = charactersArray.map(c => c.id);
        const fromIndex = characterIds.indexOf(draggedCharacterId);
        const toIndex = characterIds.indexOf(targetCharacterId);

        if (fromIndex !== -1 && toIndex !== -1) {
            const newCharacterIds = [...characterIds];
            newCharacterIds.splice(fromIndex, 1);
            newCharacterIds.splice(toIndex, 0, draggedCharacterId);
            dispatch({ type: 'REORDER_CHARACTERS', payload: { characterIds: newCharacterIds } });
        }

        setDraggedCharacterId(null);
        setDropTargetId(null);
    };

    return (
        <div className="flex h-full">
            {/* Character List Sidebar */}
            <div className="bg-slate-800 border-r border-slate-700 flex flex-col" style={{ width: 'var(--sidebar-width)' }}>
                <div className="p-4 border-b border-slate-700">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <SparkleIcon className="w-5 h-5" />
                        {t('listTitle')}
                    </h2>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {charactersArray.map(character => (
                        <CharacterItem
                            key={character.id}
                            character={character}
                            isSelected={activeCharacterId === character.id}
                            isRenaming={renamingId === character.id}
                            isDragging={draggedCharacterId === character.id}
                            isDropTarget={dropTargetId === character.id}
                            onSelect={() => setActiveCharacterId(character.id)}
                            onStartRenaming={() => setRenamingId(character.id)}
                            onCommitRename={(name) => handleRenameCharacter(character.id, name)}
                            onDelete={() => handleDeleteCharacter(character.id)}
                            onDragStart={() => handleDragStart(character.id)}
                            onDragOver={(e) => handleDragOver(e, character.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, character.id)}
                        />
                    ))}
                </div>

                <div className="p-2 border-t border-slate-700">
                    <button
                        onClick={addCharacter}
                        className="w-full bg-sky-500 hover:bg-sky-600 text-white p-2 rounded-md flex items-center justify-center gap-2 font-bold transition-colors"
                    >
                        <PlusIcon className="w-4 h-4" />
                        {t('addCharacter')}
                    </button>
                </div>
            </div>

            {/* Character Editor */}
            <div className="flex-1 flex flex-col min-w-0">
                {activeCharacterId ? (
                    <CharacterEditor
                        activeCharacterId={activeCharacterId}
                        selectedExpressionId={selectedExpressionId}
                        setSelectedExpressionId={setSelectedExpressionId}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-400">
                        <div className="text-center">
                            <SparkleIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p className="text-lg">{t('selectToEdit')}</p>
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
    isDragging: boolean;
    isDropTarget: boolean;
    onSelect: () => void;
    onStartRenaming: () => void;
    onCommitRename: (name: string) => void;
    onDelete: () => void;
    onDragStart: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
}

const CharacterItem: React.FC<CharacterItemProps> = ({
    character,
    isSelected,
    isRenaming,
    isDragging,
    isDropTarget,
    onSelect,
    onStartRenaming,
    onCommitRename,
    onDelete,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop
}) => {
    const { t } = useTranslation('common');
    const { inputProps: renameInputProps } = useInlineRename(character.name, onCommitRename);

    // Get thumbnail from base image or first expression
    const thumbnailUrl = character.baseImageUrl || (Object.values(character.expressions)[0] ? null : null);

    return (
        <div
            draggable={!isRenaming}
            onClick={onSelect}
            onDoubleClick={onStartRenaming}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                isSelected
                    ? 'bg-sky-500/20 border border-sky-500/50'
                    : 'hover:bg-slate-700'
            } ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'ring-2 ring-sky-400' : ''}`}
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
                        {...renameInputProps}
                        className="w-full bg-slate-900 text-white p-1 rounded text-sm outline-none ring-1 ring-sky-500"
                    />
                ) : (
                    <span className="text-sm">{character.name}</span>
                )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                <button
                    onClick={(e) => { e.stopPropagation(); onStartRenaming(); }}
                    className="p-1 text-slate-500 hover:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={t('rename')}
                >
                    <PencilIcon className="w-3 h-3" />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={t('delete')}
                >
                    <TrashIcon className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
};

export default React.memo(CharacterManager);