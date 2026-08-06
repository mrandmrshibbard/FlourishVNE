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
import type { VNValueCalc, VNCalcOperand, VNCalcOp } from '../types/shared';

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
    valueSource?: 'variable' | 'calc';
    valueVariableId?: string;
    calc?: VNValueCalc;
}

/** One calc operand in the author's words: "Luck" or "2". */
function operandLabel(project: VNProject, operand: VNCalcOperand | undefined, t: Translate): string {
    if (!operand) return '0';
    if (operand.source === 'variable') {
        const v = operand.variableId ? project.variables[operand.variableId] : undefined;
        return v ? variableLabel(v) : t('vars.preview.missingShort', 'a missing variable');
    }
    return String(operand.value ?? 0);
}

const CALC_OP_WORDS: Record<VNCalcOp, [string, string]> = {
    add: ['vars.preview.opPlus', 'plus'],
    subtract: ['vars.preview.opMinus', 'minus'],
    multiply: ['vars.preview.opTimes', 'times'],
    divide: ['vars.preview.opDividedBy', 'divided by'],
    percentOf: ['vars.preview.opPercentOf', '% of it:'],
};

/**
 * The calc chain in words — "Gold plus Luck times 2". Percent-of steps read
 * "…then take 20% of it" so the order of operations stays a sentence, not algebra.
 */
export function describeCalc(project: VNProject, calc: VNValueCalc, t: Translate = englishT): string {
    const parts: string[] = [operandLabel(project, calc.first, t)];
    for (const step of calc.steps ?? []) {
        if (step.op === 'percentOf') {
            parts.push(t('vars.preview.percentOfStep', 'then take {{value}}% of it', { value: operandLabel(project, step, t) }));
        } else {
            const [key, word] = CALC_OP_WORDS[step.op] ?? CALC_OP_WORDS.add;
            parts.push(`${t(key, word)} ${operandLabel(project, step, t)}`);
        }
    }
    const chain = parts.join(' ');
    const roundWord =
        calc.round === 'none' ? t('vars.preview.roundNone', 'keeping the decimals')
        : calc.round === 'down' ? t('vars.preview.roundDown', 'rounded down')
        : calc.round === 'up' ? t('vars.preview.roundUp', 'rounded up')
        : t('vars.preview.roundNearest', 'rounded to a whole number');
    const tail = (calc.steps?.length ?? 0) > 1
        ? t('vars.preview.calcOrder', ' — worked out top to bottom')
        : '';
    return `${chain}, ${roundWord}${tail}`;
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
        // Value from another variable / a calculation (never used with the random operators —
        // they ignore `value`, so keep their own phrasing even if a stray field is present).
        const isRandomOp = cmd.operator === 'random' || cmd.operator === 'addRandom' || cmd.operator === 'subtractRandom';
        const dynamicValue = isRandomOp ? null
            : cmd.valueSource === 'variable' ? variableLabel(project.variables[cmd.valueVariableId ?? ''], t('vars.preview.missingShort', 'a missing variable'))
            : cmd.valueSource === 'calc' && cmd.calc ? describeCalc(project, cmd.calc, t)
            : null;
        if (dynamicValue !== null) {
            const isCalc = cmd.valueSource === 'calc';
            switch (cmd.operator) {
                case 'add':
                    return isCalc
                        ? t('vars.preview.addCalc', 'Increase {{name}} by: {{calc}}', { name, calc: dynamicValue })
                        : t('vars.preview.addFromVar', "Increase {{name}} by {{other}}'s value", { name, other: dynamicValue });
                case 'subtract':
                    return isCalc
                        ? t('vars.preview.subtractCalc', 'Decrease {{name}} by: {{calc}}', { name, calc: dynamicValue })
                        : t('vars.preview.subtractFromVar', "Decrease {{name}} by {{other}}'s value", { name, other: dynamicValue });
                default:
                    return isCalc
                        ? t('vars.preview.setCalc', 'Set {{name}} to: {{calc}}', { name, calc: dynamicValue })
                        : t('vars.preview.setFromVar', 'Set {{name}} to whatever {{other}} is right now', { name, other: dynamicValue });
            }
        }
        switch (cmd.operator) {
            case 'add':
                return t('vars.preview.add', 'Increase {{name}} by {{value}}', { name, value: String(cmd.value ?? 0) });
            case 'subtract':
                return t('vars.preview.subtract', 'Decrease {{name}} by {{value}}', { name, value: String(cmd.value ?? 0) });
            case 'random':
                return t('vars.preview.random', 'Set {{name}} to a random number from {{min}} to {{max}}',
                    { name, min: String(cmd.randomMin ?? 0), max: String(cmd.randomMax ?? 100) });
            case 'addRandom':
                return t('vars.preview.addRandom', 'Increase {{name}} by a random amount from {{min}} to {{max}}',
                    { name, min: String(cmd.randomMin ?? 0), max: String(cmd.randomMax ?? 100) });
            case 'subtractRandom':
                return t('vars.preview.subtractRandom', 'Decrease {{name}} by a random amount from {{min}} to {{max}}',
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
        const isRandomOp = cmd.operator === 'random' || cmd.operator === 'addRandom' || cmd.operator === 'subtractRandom';
        if (!isRandomOp && cmd.valueSource === 'variable') {
            const other = variableLabel(project.variables[cmd.valueVariableId ?? ''], '?');
            switch (cmd.operator) {
                case 'add': return `${name} + ${other}`;
                case 'subtract': return `${name} − ${other}`;
                default: return `${name} = ${other}`;
            }
        }
        if (!isRandomOp && cmd.valueSource === 'calc' && cmd.calc) {
            // Still words, never operator tokens — truncated to the first term.
            const start = operandLabel(project, cmd.calc.first, englishT);
            const stepCount = cmd.calc.steps?.length ?? 0;
            const chain = stepCount > 0 ? `${start}… (${stepCount} ${stepCount === 1 ? 'step' : 'steps'})` : start;
            switch (cmd.operator) {
                case 'add': return `${name} + ${chain}`;
                case 'subtract': return `${name} − ${chain}`;
                default: return `${name} = ${chain}`;
            }
        }
        switch (cmd.operator) {
            // A true minus sign, not a hyphen — this is read, not parsed.
            case 'add': return `${name} +${cmd.value ?? 0}`;
            case 'subtract': return `${name} −${cmd.value ?? 0}`;
            case 'random': return `${name} = ${cmd.randomMin ?? 0}–${cmd.randomMax ?? 100} (random)`;
            case 'addRandom': return `${name} +${cmd.randomMin ?? 0}–${cmd.randomMax ?? 100} (random)`;
            case 'subtractRandom': return `${name} −${cmd.randomMin ?? 0}–${cmd.randomMax ?? 100} (random)`;
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
