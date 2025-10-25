import React, { useEffect, useState, useRef } from 'react';
import Panel from './ui/Panel';
import { useProject } from '../contexts/ProjectContext';
import { VNID } from '../types';
import { VNCharacter, VNCharacterExpression, VNCharacterLayer } from '../features/character/types';
import { FormField, TextInput, Select } from './ui/Form';
import { PencilIcon, PlusIcon, TrashIcon, UploadIcon } from './icons';
import { fileToBase64 } from '../utils/file';
import ConfirmationModal from './ui/ConfirmationModal';

// This is the item in the list of expressions
const ExpressionItem: React.FC<{
    expr: VNCharacterExpression;
    isSelected: boolean;
    isRenaming: boolean;
    onSelect: () => void;
    onStartRename: () => void;
    onCommitRename: (name: string) => void;
    onDeleteRequest: () => void;
}> = ({ expr, isSelected, isRenaming, onSelect, onStartRename, onCommitRename, onDeleteRequest }) => {
    const [name, setName] = useState(expr.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setName(expr.name); }, [expr.name]);

    useEffect(() => {
        if (isRenaming) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isRenaming]);

    const handleBlur = () => {
        if (name.trim()) onCommitRename(name.trim());
        else {
            setName(expr.name);
            onCommitRename(expr.name); 
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') inputRef.current?.blur();
        else if (e.key === 'Escape') {
            setName(expr.name);
            onCommitRename(expr.name);
        }
    };
    
    return (
        <div 
            key={expr.id} 
            onClick={onSelect}
            className={`group flex items-center justify-between p-2 rounded-md cursor-pointer ${isSelected ? 'bg-[var(--accent-cyan)]/30' : 'hover:bg-[var(--bg-tertiary)]'}`}
        >
            {isRenaming ? (
                 <TextInput 
                    ref={inputRef} value={name} onChange={(e) => setName(e.target.value)}
                    onBlur={handleBlur} onKeyDown={handleKeyDown}
                    onClick={e => e.stopPropagation()} className="h-8 text-sm"
                />
            ) : (<span className="truncate">{expr.name}</span>)}
            <div className="flex items-center flex-shrink-0">
                <button onClick={(e) => { e.stopPropagation(); onStartRename(); }} className="text-slate-500 hover:text-[var(--accent-cyan)] p-1 opacity-0 group-hover:opacity-100 transition-opacity"><PencilIcon className="w-4 h-4" /></button>
                <button onClick={(e) => { e.stopPropagation(); onDeleteRequest(); }} className="text-slate-500 hover:text-[var(--accent-pink)] p-1 opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon className="w-4 h-4" /></button>
            </div>
        </div>
    );
};


const CharacterInspector: React.FC<{
    activeCharacterId: VNID;
    selectedExpressionId: VNID | null;
    setSelectedExpressionId: (id: VNID | null) => void;
}> = ({ activeCharacterId, selectedExpressionId, setSelectedExpressionId }) => {
    const { project, dispatch } = useProject();
    const character = project.characters[activeCharacterId];
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [renamingExprId, setRenamingExprId] = useState<VNID | null>(null);
    const [confirmDeleteExpr, setConfirmDeleteExpr] = useState<VNCharacterExpression | null>(null);

    if (!character) return <Panel title="Properties"><p>Character not found.</p></Panel>;

    const selectedExpression = selectedExpressionId ? character.expressions[selectedExpressionId] : null;

    const updateCharacter = (updates: Partial<Pick<VNCharacter, 'name' | 'color' | 'baseImageUrl' | 'baseVideoUrl' | 'isBaseVideo' | 'baseVideoLoop'>>) => {
        dispatch({ type: 'UPDATE_CHARACTER', payload: { characterId: activeCharacterId, updates } });
    };

    const handleBaseImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const dataUrl = await fileToBase64(file);
            const isVideo = file.type.startsWith('video/');
            
            if (isVideo) {
                updateCharacter({ 
                    baseVideoUrl: dataUrl, 
                    baseImageUrl: null,
                    isBaseVideo: true, 
                    baseVideoLoop: true 
                });
            } else {
                updateCharacter({ 
                    baseImageUrl: dataUrl,
                    baseVideoUrl: null,
                    isBaseVideo: false
                });
            }
        }
    };

    const handleAddExpression = () => {
        const name = `New Expression ${Object.keys(character.expressions).length + 1}`;
        dispatch({ type: 'ADD_EXPRESSION', payload: { characterId: activeCharacterId, name } });
    };

    const handleCommitExprRename = (exprId: VNID, name: string) => {
        dispatch({ type: 'UPDATE_EXPRESSION', payload: { characterId: activeCharacterId, expressionId: exprId, updates: { name } } });
        setRenamingExprId(null);
    };

    const handleDeleteExprRequest = (expr: VNCharacterExpression) => {
        if (Object.keys(character.expressions).length <= 1) {
            alert("You cannot delete the last expression.");
            return;
        }
        setConfirmDeleteExpr(expr);
    };

    const handleConfirmDeleteExpr = () => {
        if (confirmDeleteExpr) {
            dispatch({ type: 'DELETE_EXPRESSION', payload: { characterId: activeCharacterId, expressionId: confirmDeleteExpr.id } });
            setConfirmDeleteExpr(null);
        }
    };

    const handleLayerAssetChange = (layerId: VNID, assetId: VNID | null) => {
        if (!selectedExpression) return;
        const newConfig = { ...selectedExpression.layerConfiguration, [layerId]: assetId };
        dispatch({ type: 'UPDATE_EXPRESSION', payload: { characterId: activeCharacterId, expressionId: selectedExpression.id, updates: { layerConfiguration: newConfig } } });
    };

    return (
        <Panel title={`Properties: ${character.name}`} className="w-96 flex-shrink-0">
            <div className="flex-grow overflow-y-auto pr-1 space-y-4">
                <div>
                    <FormField label="Character Name"><TextInput value={character.name} onChange={e => updateCharacter({ name: e.target.value })} /></FormField>
                    <FormField label="Dialogue Color"><TextInput type="color" value={character.color} onChange={e => updateCharacter({ color: e.target.value })} className="p-1 h-10" /></FormField>
                </div>
                
                <div>
                    <h4 className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Base Image/Video (Optional)</h4>
                    <div className="flex items-center gap-2">
                        {character.baseVideoUrl ? (
                            <video src={character.baseVideoUrl} muted loop playsInline className="w-12 h-12 object-contain rounded-md bg-slate-700" />
                        ) : character.baseImageUrl ? (
                            <img src={character.baseImageUrl} alt="Base" className="w-12 h-12 object-contain rounded-md bg-slate-700" />
                        ) : null}
                        <button onClick={() => fileInputRef.current?.click()} className="flex-grow bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-sm p-2 rounded-md flex items-center justify-center gap-2"><UploadIcon /> {(character.baseImageUrl || character.baseVideoUrl) ? 'Change...' : 'Upload...'}</button>
                        {(character.baseImageUrl || character.baseVideoUrl) && <button onClick={() => updateCharacter({ baseImageUrl: null, baseVideoUrl: null, isBaseVideo: false })} className="p-2 bg-red-600/50 hover:bg-red-500 rounded-md"><TrashIcon /></button>}
                        <input type="file" ref={fileInputRef} onChange={handleBaseImageUpload} accept="image/*,video/*" className="hidden" />
                    </div>
                </div>

                <hr className="border-slate-700" />
                
                <div>
                    <h3 className="font-bold text-slate-300 mb-2">Expressions</h3>
                    <div className="space-y-1">
                        {Object.values(character.expressions).map((expr: VNCharacterExpression) => (
                            <ExpressionItem
                                key={expr.id} expr={expr}
                                isSelected={selectedExpressionId === expr.id}
                                isRenaming={renamingExprId === expr.id}
                                onSelect={() => setSelectedExpressionId(expr.id)}
                                onStartRename={() => setRenamingExprId(expr.id)}
                                onCommitRename={(name) => handleCommitExprRename(expr.id, name)}
                                onDeleteRequest={() => handleDeleteExprRequest(expr)}
                            />
                        ))}
                    </div>
                    <button onClick={handleAddExpression} className="w-full text-sky-400 hover:text-sky-300 text-sm mt-2 flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Add Expression</button>
                </div>

                {selectedExpression && Object.keys(character.layers).length > 0 && (
                    <>
                        <hr className="border-slate-700" />
                        <div>
                            <h3 className="font-bold text-slate-300 mb-2">Expression Configuration: <span className="text-sky-400">{selectedExpression.name}</span></h3>
                            <div className="space-y-2">
                                {Object.values(character.layers).map((layer: VNCharacterLayer) => (
                                    <FormField key={layer.id} label={layer.name}>
                                        <Select value={selectedExpression.layerConfiguration[layer.id] || ''} onChange={e => handleLayerAssetChange(layer.id, e.target.value || null)}>
                                            <option value="">(None)</option>
                                            {Object.values(layer.assets).map(asset => (
                                                <option key={asset.id} value={asset.id}>{asset.name}</option>
                                            ))}
                                        </Select>
                                    </FormField>
                                ))}
                            </div>
                        </div>
                    </>
                )}

            </div>
            <ConfirmationModal isOpen={!!confirmDeleteExpr} onClose={() => setConfirmDeleteExpr(null)} onConfirm={handleConfirmDeleteExpr} title="Delete Expression">
                Are you sure you want to delete the expression "{confirmDeleteExpr?.name}"?
            </ConfirmationModal>
        </Panel>
    );
};

export default CharacterInspector;
