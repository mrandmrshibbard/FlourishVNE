import { VNID } from '../../../types';
import { VNProject } from '../../../types/project';
import { VNCommand, CommandType } from '../../scene/types';
import { VNCharacter, VNCharacterExpression, VNCharacterLayer, VNLayerAsset } from '../types';

const generateId = () => Math.random().toString(36).substring(2, 9);

export type CharacterAction =
    | { type: 'ADD_CHARACTER'; payload: { name: string; color: string } }
    | { type: 'DELETE_CHARACTER'; payload: { characterId: VNID } }
    | { type: 'UPDATE_CHARACTER'; payload: { characterId: VNID; updates: Partial<VNCharacter> } }
    | { type: 'ADD_CHARACTER_LAYER', payload: { characterId: VNID, name: string } }
    | { type: 'UPDATE_CHARACTER_LAYER', payload: { characterId: VNID, layerId: VNID, name: string } }
    | { type: 'DELETE_CHARACTER_LAYER', payload: { characterId: VNID, layerId: VNID } }
    | { type: 'ADD_LAYER_ASSET', payload: { characterId: VNID, layerId: VNID, name: string } & Partial<VNLayerAsset> }
    | { type: 'DELETE_LAYER_ASSET', payload: { characterId: VNID, layerId: VNID, assetId: VNID } }
    | { type: 'ADD_EXPRESSION', payload: { characterId: VNID, name: string } }
    | { type: 'UPDATE_EXPRESSION', payload: { characterId: VNID, expressionId: VNID, updates: Partial<VNCharacterExpression> } }
    | { type: 'DELETE_EXPRESSION', payload: { characterId: VNID, expressionId: VNID } };

export const characterReducer = (state: VNProject, action: CharacterAction): VNProject => {
  switch (action.type) {
    case 'ADD_CHARACTER': {
        const { name, color } = action.payload;
        const newId = `char-${generateId()}`;
        const newExprId = `expr-${generateId()}`;
        const newExpression: VNCharacterExpression = { id: newExprId, name: 'Default', layerConfiguration: {} };
        const newCharacter: VNCharacter = { 
            id: newId, 
            name, 
            color, 
            baseImageUrl: null, 
            layers: {}, 
            expressions: { [newExprId]: newExpression } 
        };
        return {
            ...state,
            characters: {
                ...state.characters,
                [newId]: newCharacter
            }
        };
    }

    case 'DELETE_CHARACTER': {
        const { characterId } = action.payload;
        const { [characterId]: _, ...remaining } = state.characters;
        const fallbackId = Object.keys(remaining)[0]; // undefined if empty
        
        const newScenes = JSON.parse(JSON.stringify(state.scenes));
        for (const sceneId in newScenes) {
            newScenes[sceneId].commands = newScenes[sceneId].commands.map((cmd: VNCommand) => {
                if (cmd.type === CommandType.Dialogue && cmd.characterId === characterId) {
                    return { ...cmd, characterId: null };
                }
                if ((cmd.type === CommandType.ShowCharacter || cmd.type === CommandType.HideCharacter) && cmd.characterId === characterId) {
                    if (fallbackId) {
                        return { ...cmd, characterId: fallbackId };
                    }
                }
                return cmd;
            }).filter(Boolean);
        }
        
        return {
            ...state,
            characters: remaining,
            scenes: newScenes,
        };
    }
    
    case 'UPDATE_CHARACTER': {
        const { characterId, updates } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const updatedCharacter = { ...character, ...updates };
        return {
            ...state,
            characters: {
                ...state.characters,
                [characterId]: updatedCharacter
            }
        };
    }

    case 'ADD_CHARACTER_LAYER': {
        const { characterId, name } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const newLayerId = `layer-${generateId()}`;
        const newLayer: VNCharacterLayer = { id: newLayerId, name, assets: {} };
        const newLayers = { ...character.layers, [newLayerId]: newLayer };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: newLayers } } };
    }

    case 'UPDATE_CHARACTER_LAYER': {
        const { characterId, layerId, name } = action.payload;
        const character = state.characters[characterId];
        if (!character?.layers[layerId]) return state;
        const updatedLayer = { ...character.layers[layerId], name };
        const newLayers = { ...character.layers, [layerId]: updatedLayer };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: newLayers } } };
    }

    case 'DELETE_CHARACTER_LAYER': {
        const { characterId, layerId } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const { [layerId]: _, ...remainingLayers } = character.layers;
        // Also remove this layer from all expressions
        const newExpressions = { ...character.expressions };
        for (const exprId in newExpressions) {
            delete newExpressions[exprId].layerConfiguration[layerId];
        }
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: remainingLayers, expressions: newExpressions } } };
    }

    case 'ADD_LAYER_ASSET': {
        const { characterId, layerId, name, imageUrl, videoUrl, isVideo, loop, autoplay } = action.payload;
        const character = state.characters[characterId];
        if (!character?.layers[layerId]) return state;
        const newAssetId = `asset-${generateId()}`;
        const newAsset: VNLayerAsset = { 
            id: newAssetId, 
            name, 
            imageUrl, 
            videoUrl, 
            isVideo, 
            loop, 
            autoplay 
        };
        const newAssets = { ...character.layers[layerId].assets, [newAssetId]: newAsset };
        const newLayers = { ...character.layers, [layerId]: { ...character.layers[layerId], assets: newAssets } };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: newLayers } } };
    }

    case 'DELETE_LAYER_ASSET': {
        const { characterId, layerId, assetId } = action.payload;
        const character = state.characters[characterId];
        if (!character?.layers[layerId]?.assets[assetId]) return state;
        const { [assetId]: _, ...remainingAssets } = character.layers[layerId].assets;
        const newLayers = { ...character.layers, [layerId]: { ...character.layers[layerId], assets: remainingAssets } };
        // Also remove this asset from any expressions using it
        const newExpressions = { ...character.expressions };
        for (const exprId in newExpressions) {
            if (newExpressions[exprId].layerConfiguration[layerId] === assetId) {
                newExpressions[exprId].layerConfiguration[layerId] = null;
            }
        }
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: newLayers, expressions: newExpressions } } };
    }

    case 'ADD_EXPRESSION': {
        const { characterId, name } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const newExprId = `expr-${generateId()}`;
        const newExpression: VNCharacterExpression = { id: newExprId, name, layerConfiguration: {} };
        // Initialize with null for all layers
        Object.keys(character.layers).forEach(layerId => {
            newExpression.layerConfiguration[layerId] = null;
        });
        const newExpressions = { ...character.expressions, [newExprId]: newExpression };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, expressions: newExpressions } } };
    }

    case 'UPDATE_EXPRESSION': {
        const { characterId, expressionId, updates } = action.payload;
        const character = state.characters[characterId];
        if (!character?.expressions[expressionId]) return state;
        const newExpression = { ...character.expressions[expressionId], ...updates };
        const newExpressions = { ...character.expressions, [expressionId]: newExpression };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, expressions: newExpressions } } };
    }

    case 'DELETE_EXPRESSION': {
        const { characterId, expressionId } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const { [expressionId]: _, ...remainingExpressions } = character.expressions;
        // Also update any commands that were using this expression
        const newScenes = JSON.parse(JSON.stringify(state.scenes));
        const firstExprId = Object.keys(remainingExpressions)[0];
        for (const sceneId in newScenes) {
            newScenes[sceneId].commands.forEach((cmd: VNCommand) => {
                if (cmd.type === CommandType.ShowCharacter && cmd.expressionId === expressionId) {
                    cmd.expressionId = firstExprId || '';
                }
            });
        }
        return { ...state, scenes: newScenes, characters: { ...state.characters, [characterId]: { ...character, expressions: remainingExpressions } } };
    }

    default:
      return state;
  }
};
