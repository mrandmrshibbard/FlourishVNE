import { VNID } from '../../../types';
import { VNProject } from '../../../types/project';
import { VNBackground, VNImage, VNAudio, VNVideo } from '../types';
import { VNCharacter } from '../../character/types';
import { VNCommand, CommandType, ShowImageCommand } from '../../scene/types';

export type AssetType = 'characters' | 'backgrounds' | 'images' | 'audio' | 'videos';

export type AssetAction =
    | { type: 'ADD_ASSET'; payload: { assetType: AssetType; asset: VNCharacter | VNBackground | VNAudio | VNVideo | VNImage } }
    | { type: 'UPDATE_ASSET', payload: { assetType: AssetType, assetId: VNID, updates: Partial<VNBackground | VNImage | VNAudio | VNVideo> } }
    | { type: 'DELETE_ASSET'; payload: { assetType: AssetType; assetId: VNID } };

export const assetReducer = (state: VNProject, action: AssetAction): VNProject => {
  switch (action.type) {
    case 'ADD_ASSET': {
        const { assetType, asset } = action.payload;
        console.log('[assetReducer] ADD_ASSET:', { assetType, assetId: asset.id, assetName: asset.name });
        console.log('[assetReducer] Current state[assetType]:', state[assetType]);
        const newState = {
            ...state,
            [assetType]: {
                ...state[assetType],
                [asset.id]: asset,
            },
        };
        console.log('[assetReducer] New state[assetType]:', newState[assetType]);
        return newState;
    }

    case 'UPDATE_ASSET': {
        const { assetType, assetId, updates } = action.payload;
        const asset = state[assetType][assetId];
        if (!asset) return state;

        return {
            ...state,
            [assetType]: {
                ...state[assetType],
                [assetId]: { ...asset, ...updates }
            }
        };
    }

    case 'DELETE_ASSET': {
        const { assetType, assetId } = action.payload;
        const { [assetId]: _, ...remainingAssets } = state[assetType];
        const fallbackId = Object.keys(remainingAssets)[0]; // This will be undefined if no assets are left

        let newState = { ...state, [assetType]: remainingAssets };

        // Only update commands if there's a valid fallback
        if (fallbackId) {
            const newScenes = JSON.parse(JSON.stringify(state.scenes));
            for (const sceneId in newScenes) {
                newScenes[sceneId].commands = newScenes[sceneId].commands.map((cmd: VNCommand) => {
                    // Backgrounds can be used in SetBackground commands
                    if (assetType === 'backgrounds' && cmd.type === CommandType.SetBackground && cmd.backgroundId === assetId) {
                        return { ...cmd, backgroundId: fallbackId };
                    }
                    // Images can be used in both ShowImage and SetBackground commands
                    if (assetType === 'images' && cmd.type === CommandType.ShowImage && (cmd as ShowImageCommand).imageId === assetId) {
                        return { ...cmd, imageId: fallbackId };
                    }
                    if (assetType === 'images' && cmd.type === CommandType.SetBackground && cmd.backgroundId === assetId) {
                        return { ...cmd, backgroundId: fallbackId };
                    }
                    if (assetType === 'audio' && (cmd.type === CommandType.PlayMusic || cmd.type === CommandType.PlaySoundEffect) && cmd.audioId === assetId) {
                        return { ...cmd, audioId: fallbackId };
                    }
                    if (assetType === 'videos' && cmd.type === CommandType.PlayMovie && cmd.videoId === assetId) {
                        return { ...cmd, videoId: fallbackId };
                    }
                    return cmd;
                });
            }
            newState.scenes = newScenes;
        }
        // If there's no fallback, we just remove the asset and leave commands with dangling IDs.
        // The UI should handle this broken reference.
        return newState;
    }
    
    default:
      return state;
  }
};
