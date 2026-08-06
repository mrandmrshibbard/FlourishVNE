import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNVariable } from '../features/variables/types';
import type { VNCharacter } from '../features/character/types';
import { resolveBoolLabels } from '../features/variables/booleanLabels';
import { formatBandedValue } from '../features/variables/bands';

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
/**
 * Formats a single variable value for display: boolean variables use their per-variable
 * labels (falling back to the global "Yes"/"No"); asset-id values resolve to the asset name.
 */
const formatValue = (
    variable: VNVariable,
    value: string | number | boolean,
    project: VNProject
): string => {
    if (variable.type === 'boolean') {
        const truthy = value === true || String(value).toLowerCase() === 'true';
        const { yes, no } = resolveBoolLabels(variable, 'Yes', 'No');
        return truthy ? yes : no;
    }
    // A number with named bands can print the WORD the author gave it ("Friend") instead of the
    // number — but only if they asked for it. `showAs` is unset on every existing variable, so this
    // changes nothing until someone opts in.
    if (variable.type === 'number' && variable.showAs && variable.showAs !== 'number') {
        return formatBandedValue(variable, value);
    }
    const stringValue = String(value);
    // If the value looks like an asset ID, try to get the asset name
    if (stringValue.startsWith('asset-')) {
        const assetName = getAssetNameFromId(stringValue, project);
        return assetName || stringValue;
    }
    return stringValue;
};

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
            return value !== undefined ? formatValue(variableByName, value, project) : match;
        }

        // Then try to find by variable ID
        const variableById = project.variables[trimmedPlaceholder];
        if (variableById) {
            const value = variables[variableById.id];
            return value !== undefined ? formatValue(variableById, value, project) : match;
        }

        // If not found, return the original placeholder
        return match;
    });

    return result;
};

/**
 * A character's name as the PLAYER should see it right now. Names can contain {Variable}
 * tokens ("{Nickname}", "Sir {Title}") — the name box shows whatever the variable currently
 * says, so a "???" stranger can become "Yuki" with a plain Set Variable.
 *
 * Names WITHOUT braces return the exact same string as before this feature existed — the
 * fast path below is the byte-identity guarantee for every existing project.
 */
export const resolveCharacterDisplayName = (
    rawName: string | null | undefined,
    variables: Record<VNID, string | number | boolean>,
    project: VNProject
): string => {
    if (!rawName) return '';
    if (!rawName.includes('{')) return rawName;
    return interpolateVariables(rawName, variables, project).trim();
};

/**
 * Build a `(raw, fallback)` resolver bound to one variables view — for surfaces (the phone)
 * with many name sites, so the precedence chains like `displayName || character.name` stay
 * exactly as written and only the resolution lives in one place.
 */
export const makeDisplayNameResolver = (
    variables: Record<VNID, string | number | boolean>,
    project: VNProject
) => (raw: string | null | undefined, fallback: string): string =>
    resolveCharacterDisplayName(raw, variables, project) || fallback;

/**
 * Find a character by the name a SCRIPT calls them — forgiving on purpose: matches the raw
 * stored name first ("{YukiName}" addressed literally), then the currently-RESOLVED name
 * ("Yuki" finds the character whose {YukiName} resolves to Yuki right now). Case-insensitive,
 * raw match wins on collision (a script that worked yesterday keeps working today).
 */
export const findCharacterBySpokenName = (
    spokenName: string,
    project: VNProject,
    variables: Record<VNID, string | number | boolean>
): VNCharacter | undefined => {
    const lower = String(spokenName ?? '').toLowerCase();
    const all = Object.values(project.characters ?? {}) as VNCharacter[];
    return all.find(c => c?.name?.toLowerCase() === lower)
        ?? all.find(c => resolveCharacterDisplayName(c?.name, variables, project).toLowerCase() === lower);
};

/**
 * The single letter shown on editor avatars. A tokened name like "{Nickname}" would show "{"
 * — strip the tokens and use the first real character instead; 👤 when nothing is left.
 */
export const characterNameInitial = (rawName: string | null | undefined): string => {
    const stripped = String(rawName ?? '').replace(/\{[^}]*\}/g, '').trim();
    return stripped.charAt(0) || '👤';
};