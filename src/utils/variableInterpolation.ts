import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNVariable } from '../features/variables/types';

/**
 * Variable Interpolation System
 *
 * Allows variables to be referenced in text throughout the visual novel engine.
 * Use curly braces {} to reference variables by name or ID.
 *
 * Examples:
 * - {variableName} - References a variable by its display name
 * - {var-123} - References a variable by its ID
 *
 * Supported in:
 * - Dialogue text
 * - Choice options
 * - Text input prompts
 * - UI text elements
 * - Button text
 *
 * Variables that don't exist or have undefined values will display as-is (with braces).
 */

/**
 * Finds an asset name from an asset ID by searching through all asset types
 */
const getAssetNameFromId = (assetId: string, project: VNProject): string | null => {
    // Search through all asset types to find the asset name
    
    // Check backgrounds
    const background = project.backgrounds[assetId];
    if (background) return background.name;
    
    // Check images  
    const image = project.images[assetId];
    if (image) return image.name;
    
    // Check videos
    const video = project.videos[assetId];
    if (video) return video.name;
    
    // Check audio
    const audio = project.audio[assetId];
    if (audio) return audio.name;
    
    // Check character layers
    for (const character of Object.values(project.characters)) {
        for (const layer of Object.values(character.layers)) {
            const asset = layer.assets[assetId];
            if (asset) return asset.name;
        }
    }
    
    return null;
};

/**
 * Interpolates variables in text using placeholders like {variableName} or {var:variableId}
 * @param text The text containing variable placeholders
 * @param variables The current variable values
 * @param project The project containing variable definitions
 * @returns The text with variables interpolated
 */
export const interpolateVariables = (
    text: string,
    variables: Record<VNID, string | number | boolean>,
    project: VNProject
): string => {
    if (!text) return text;

    // Replace {variableName} placeholders
    let result = text.replace(/\{([^}]+)\}/g, (match, placeholder) => {
        const trimmedPlaceholder = placeholder.trim();

        // First try to find by variable name
        const variableByName = (Object.values(project.variables) as VNVariable[]).find(v => v.name === trimmedPlaceholder);
        if (variableByName) {
            const value = variables[variableByName.id];
            if (value !== undefined) {
                const stringValue = String(value);
                // If the value looks like an asset ID, try to get the asset name
                if (stringValue.startsWith('asset-')) {
                    const assetName = getAssetNameFromId(stringValue, project);
                    return assetName || stringValue;
                }
                return stringValue;
            }
            return match;
        }

        // Then try to find by variable ID
        const variableById = project.variables[trimmedPlaceholder];
        if (variableById) {
            const value = variables[variableById.id];
            if (value !== undefined) {
                const stringValue = String(value);
                // If the value looks like an asset ID, try to get the asset name
                if (stringValue.startsWith('asset-')) {
                    const assetName = getAssetNameFromId(stringValue, project);
                    return assetName || stringValue;
                }
                return stringValue;
            }
            return match;
        }

        // If not found, return the original placeholder
        return match;
    });

    return result;
};