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
            return value !== undefined ? String(value) : match;
        }

        // Then try to find by variable ID
        const variableById = project.variables[trimmedPlaceholder];
        if (variableById) {
            const value = variables[variableById.id];
            return value !== undefined ? String(value) : match;
        }

        // If not found, return the original placeholder
        return match;
    });

    return result;
};