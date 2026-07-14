/**
 * ONE VOICE for variables. The single place that turns a Set Variable into a sentence.
 *
 * We had a lovely plain-English preview — "Increase Affection by 1" — and it appeared in exactly one
 * panel. Everywhere an author actually SCANS, it degraded back into code:
 *
 *   the command list        →  "Set Affection add 1"
 *   a collapsed group badge →  "Affection add 1"
 *   a stacked command chip  →  "Set Affection"          (no operator, no value at all)
 *   an action card          →  "Affection"              (likewise)
 *
 * So the friendly wording read as decoration: the app taught the vocabulary in one place and spoke
 * code in the other four. This module is the fix — every one of those surfaces now calls in here, so
 * there is no second phrasing to drift.
 *
 * i18n: pass react-i18next's `t` and you get translated copy; omit it and you get the same sentence in
 * English. That matters because two of the callers (the command list, the collapsed-badge helper) are
 * plain functions with no hook to reach a translator from.
 *
 * Band-aware and boolean-label-aware throughout: "Set Front Door to Locked", "Set Affection to 45
 * (Friend)". See features/variables/bands.ts and booleanLabels.ts.
 */
import { VNProject } from '../types/project';
import { VNVariable, VNSetVariableOperator } from '../features/variables/types';
import { resolveBoolLabels } from '../features/variables/booleanLabels';
import { resolveBand, hasBands } from '../features/variables/bands';

/** react-i18next's `t(key, defaultValue, options)` — or our English stand-in below. */
export type Translate = (key: string, defaultValue: string, opts?: Record<string, unknown>) => string;

/** The fallback translator: fills {{placeholders}} in the English default. */
export const englishT: Translate = (_key, defaultValue, opts) =>
    defaultValue.replace(/\{\{(\w+)\}\}/g, (m, k) => (opts && k in opts ? String(opts[k]) : m));

/** What the author calls this variable, with their emoji if they gave it one. */
export function variableLabel(variable: VNVariable | undefined, fallback = 'a variable'): string {
    if (!variable) return fallback;
    return variable.icon ? `${variable.icon} ${variable.name}` : variable.name;
}

/**
 * How a stored VALUE reads. Booleans use the author's own labels ("Locked"), and a banded number
 * says which step it lands on — because "45" alone never told anyone anything.
 */
export function valueLabel(variable: VNVariable | undefined, value: unknown, t: Translate = englishT): string {
    if (!variable) return String(value ?? '');
    if (variable.type === 'boolean') {
        const on = value === true || String(value).toLowerCase() === 'true';
        const { yes, no } = resolveBoolLabels(variable, t('vars.true', 'Yes'), t('vars.false', 'No'));
        return on ? yes : no;
    }
    if (variable.type === 'number' && hasBands(variable)) {
        const band = resolveBand(variable, value);
        if (band) return `${value} (${band.name})`;
    }
    return String(value ?? '');
}

interface SetVariableLike {
    variableId: string;
    operator: VNSetVariableOperator;
    value?: string | number | boolean;
    randomMin?: number;
    randomMax?: number;
}

/**
 * The full sentence — "Increase ❤️ Affection by 1". This is what a non-coder reads to understand what
 * a command DOES, so it is a sentence, not an expression.
 */
export function describeSetVariable(project: VNProject, cmd: SetVariableLike, t: Translate = englishT): string {
    const variable = project.variables[cmd.variableId];
    if (!variable) return t('vars.preview.missing', 'Set a variable that no longer exists');
    const name = variableLabel(variable);

    if (variable.type === 'boolean') {
        return t('vars.preview.boolOn', 'Set {{name}} to {{value}}', { name, value: valueLabel(variable, cmd.value, t) });
    }
    if (variable.type === 'number') {
        switch (cmd.operator) {
            case 'add':
                return t('vars.preview.add', 'Increase {{name}} by {{value}}', { name, value: String(cmd.value ?? 0) });
            case 'subtract':
                return t('vars.preview.subtract', 'Decrease {{name}} by {{value}}', { name, value: String(cmd.value ?? 0) });
            case 'random':
                return t('vars.preview.random', 'Set {{name}} to a random number from {{min}} to {{max}}',
                    { name, min: String(cmd.randomMin ?? 0), max: String(cmd.randomMax ?? 100) });
            default:
                return t('vars.preview.setNum', 'Set {{name}} to {{value}}', { name, value: valueLabel(variable, cmd.value, t) });
        }
    }
    return t('vars.preview.setStr', 'Set {{name}} to “{{value}}”', { name, value: String(cmd.value ?? '') });
}

/**
 * The compact form for places with no room for a sentence — a collapsed group's badge, a stacked
 * command chip. Still the author's words, never an operator token: "Affection +1", not "Affection add 1".
 */
export function summarizeSetVariable(project: VNProject, cmd: SetVariableLike): string {
    const variable = project.variables[cmd.variableId];
    if (!variable) return '—';
    const name = variableLabel(variable, '?');

    if (variable.type === 'boolean') return `${name} → ${valueLabel(variable, cmd.value)}`;
    if (variable.type === 'number') {
        switch (cmd.operator) {
            // A true minus sign, not a hyphen — this is read, not parsed.
            case 'add': return `${name} +${cmd.value ?? 0}`;
            case 'subtract': return `${name} −${cmd.value ?? 0}`;
            case 'random': return `${name} = ${cmd.randomMin ?? 0}–${cmd.randomMax ?? 100} (random)`;
            default: return `${name} = ${valueLabel(variable, cmd.value)}`;
        }
    }
    return `${name} = ${cmd.value ?? ''}`;
}

/** "Put what the player types into ✍️ Player Name" */
export function describeTextInput(project: VNProject, cmd: { variableId: string; prompt?: string }, t: Translate = englishT): string {
    const variable = project.variables[cmd.variableId];
    const name = variableLabel(variable, t('vars.preview.missingShort', 'a missing variable'));
    return cmd.prompt
        ? t('vars.preview.textInputPrompt', 'Ask “{{prompt}}” and put the answer in {{name}}', { prompt: cmd.prompt, name })
        : t('vars.preview.textInput', 'Put what the player types into {{name}}', { name });
}

/** "Put ❤️ Affection back to how it started" */
export function describeResetVariable(project: VNProject, variableId: string | undefined, t: Translate = englishT): string {
    if (!variableId) return t('vars.preview.resetAll', 'Put every variable back to how it started');
    const variable = project.variables[variableId];
    if (!variable) return t('vars.preview.missing', 'Set a variable that no longer exists');
    return t('vars.preview.reset', 'Put {{name}} back to how it started', { name: variableLabel(variable) });
}
