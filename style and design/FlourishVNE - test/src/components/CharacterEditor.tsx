import React, { useEffect, useRef, useState } from 'react';
import Panel from './ui/Panel';
import { useProject } from '../contexts/ProjectContext';
import { VNID } from '../types';
import { VNCharacter, VNCharacterLayer, VNLayerAsset } from '../features/character/types';
import { fileToBase64 } from '../utils/file';
import { PlusIcon, TrashIcon, UploadIcon, PencilIcon } from './icons';

const LayerAsset: React.FC<{
    characterId: VNID;
    layerId: VNID;
    asset: VNLayerAsset;
}> = ({ characterId, layerId, asset }) => {
    const { dispatch } = useProject();
    
    const handleDelete = () => {
        if (confirm(`Are you sure you want to delete the asset "${asset.name}"?`)) {
            dispatch({ type: 'DELETE_LAYER_ASSET', payload: { characterId, layerId, assetId: asset.id }});
        }
    };

    return (
        <div className="group flex items-center gap-2 p-1.5 rounded-md hover:bg-[var(--bg-tertiary)]">
            <img src={asset.imageUrl} alt={asset.name} className="w-10 h-10 object-contain rounded-md bg-slate-700 flex-shrink-0" />
            <span className="flex-grow truncate">{asset.name}</span>
            <button onClick={handleDelete} className="text-slate-500 hover:text-[var(--accent-pink)] p-1 opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon className="w-4 h-4" /></button>
        </div>
    );
};


const CharacterLayer: React.FC<{
    characterId: VNID;
    layer: VNCharacterLayer;
}> = ({ characterId, layer }) => {
    const { dispatch } = useProject();
    const [isRenaming, setIsRenaming] = useState(false);
    const [name, setName] = useState(layer.name);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isRenaming) {
            setName(layer.name);
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            });
        }
    }, [isRenaming, layer.name]);

    const handleRenameCommit = () => {
        const trimmed = name.trim();
        if (trimmed && trimmed !== layer.name) {
            dispatch({ type: 'UPDATE_CHARACTER_LAYER', payload: { characterId, layerId: layer.id, name: trimmed }});
        }
        setIsRenaming(false);
    };

    const handleRenameCancel = () => {
        setIsRenaming(false);
        setName(layer.name);
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const dataUrl = await fileToBase64(file);
            const isVideo = file.type.startsWith('video/');
            
            dispatch({ 
                type: 'ADD_LAYER_ASSET', 
                payload: { 
                    characterId, 
                    layerId: layer.id, 
                    name: file.name.split('.')[0], 
                    ...(isVideo ? { videoUrl: dataUrl, isVideo: true, loop: true } : { imageUrl: dataUrl })
                } 
            });
        }
    };

    const handleDeleteLayer = () => {
        if (confirm(`Are you sure you want to delete the layer "${layer.name}"? This will remove it from all expressions.`)) {
            dispatch({ type: 'DELETE_CHARACTER_LAYER', payload: { characterId, layerId: layer.id }});
        }
    };
    
    return (
        <div className="bg-[var(--bg-primary)] p-3 rounded-lg">
            <div className="flex items-center justify-between mb-2">
                {isRenaming ? (
                    <input 
                        ref={inputRef}
                        type="text" 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        onBlur={handleRenameCommit}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                handleRenameCommit();
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                handleRenameCancel();
                            }
                        }}
                        className="bg-slate-900 text-white p-1 rounded-md outline-none ring-2 ring-sky-500"
                    />
                ) : (
                    <h4 className="font-bold">{layer.name}</h4>
                )}
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsRenaming(true)} className="text-slate-400 hover:text-sky-400 p-1"><PencilIcon className="w-4 h-4"/></button>
                    <button onClick={handleDeleteLayer} className="text-slate-400 hover:text-red-400 p-1"><TrashIcon className="w-4 h-4"/></button>
                </div>
            </div>
             <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {Object.values(layer.assets).map((asset: VNLayerAsset) => (
                    <LayerAsset key={asset.id} characterId={characterId} layerId={layer.id} asset={asset}/>
                ))}
            </div>
            <button onClick={() => fileInputRef.current?.click()} className="w-full mt-3 btn btn-secondary text-sm p-2 flex items-center justify-center gap-2"><UploadIcon /> Upload Asset</button>
            <input type="file" ref={fileInputRef} onChange={handleUpload} accept="image/*,video/*" className="hidden"/>
        </div>
    );
};

const CharacterEditor: React.FC<{
    activeCharacterId: VNID;
    selectedExpressionId: VNID | null;
}> = ({ activeCharacterId, selectedExpressionId }) => {
    const { project } = useProject();
    const { dispatch } = useProject();
    const character = project.characters[activeCharacterId];
    
    if (!character) return <Panel title="Character Editor"><p>Select a character to begin.</p></Panel>;

    const selectedExpression = selectedExpressionId ? character.expressions[selectedExpressionId] : null;

    const handleAddLayer = () => {
        const name = `New Layer ${Object.keys(character.layers).length + 1}`;
        dispatch({ type: 'ADD_CHARACTER_LAYER', payload: { characterId: activeCharacterId, name }});
    };

    return (
        <div className="flex-grow flex gap-4 min-h-0">
            <Panel title={`Character Preview: ${character.name} (${selectedExpression?.name || '...'})`} className="w-1/2">
                <div className="w-full h-full bg-slate-900/50 rounded-md relative overflow-hidden aspect-video">
                    {character.baseVideoUrl ? (
                        <video src={character.baseVideoUrl} autoPlay muted loop={character.baseVideoLoop} playsInline className="absolute inset-0 w-full h-full object-contain" />
                    ) : character.baseImageUrl ? (
                        <img src={character.baseImageUrl} alt="Base" className="absolute inset-0 w-full h-full object-contain" />
                    ) : null}
                    {selectedExpression && Object.values(character.layers).map((layer: VNCharacterLayer) => {
                        const assetId = selectedExpression.layerConfiguration[layer.id];
                        if (assetId) {
                            const asset = layer.assets[assetId];
                            if (asset?.videoUrl) {
                                return <video key={layer.id} src={asset.videoUrl} autoPlay muted loop={asset.loop} playsInline className="absolute inset-0 w-full h-full object-contain" />;
                            } else if (asset?.imageUrl) {
                                return <img key={layer.id} src={asset.imageUrl} alt={asset.name} className="absolute inset-0 w-full h-full object-contain" />;
                            }
                        }
                        return null;
                    })}
                </div>
            </Panel>
            <Panel title="Layers & Assets" className="w-1/2">
                 <div className="flex-grow overflow-y-auto space-y-3 pr-1">
                    {Object.values(character.layers).map((layer: VNCharacterLayer) => (
                        <CharacterLayer key={layer.id} characterId={character.id} layer={layer}/>
                    ))}
                </div>
                <div className="pt-4 mt-auto">
                    <button onClick={handleAddLayer} className="btn-primary-gradient w-full text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2">
                        <PlusIcon /> Add Layer
                    </button>
                </div>
            </Panel>
        </div>
    );
};

export default CharacterEditor;
