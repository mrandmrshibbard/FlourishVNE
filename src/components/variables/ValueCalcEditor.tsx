/**
 * The ONE calculation editor for Set Variable's "A calculation" value mode — used by the
 * command inspector (form) and the compact action editor alike, so there is no second layout
 * to drift.
 *
 * A calculation is: "Start with …" then plain-word steps (plus / minus / times / divided by /
 * percent of it), each operand a typed number or another NUMBER variable. Steps run strictly
 * top to bottom — no operator precedence — and the hint says so (the same promise the
 * conditions list makes). A rounding choice applies once at the end (absent = nearest whole
 * number, the right default for gold/hearts/points).
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { PlusIcon, XMarkIcon } from '../icons';
import { VNValueCalc, VNCalcStep, VNCalcOperand, VNCalcOp } from '../../types/shared';
import { VNProject } from '../../types/project';
import { VNVariable } from '../../features/variables/types';
import VariablePicker from './VariablePicker';

const OP_KEYS: Array<{ op: VNCalcOp; key: string; fallback: string }> = [
    { op: 'add', key: 'calc.opPlus', fallback: 'plus' },
    { op: 'subtract', key: 'calc.opMinus', fallback: 'minus' },
    { op: 'multiply', key: 'calc.opTimes', fallback: 'times' },
    { op: 'divide', key: 'calc.opDividedBy', fallback: 'divided by' },
    { op: 'percentOf', key: 'calc.opPercentOf', fallback: 'percent of it' },
];

export const DEFAULT_CALC: VNValueCalc = { first: { source: 'number', value: 0 }, steps: [] };

const inputCls = 'bg-[var(--bg-primary)] text-white p-1 rounded-md border border-[var(--border-default)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)] min-w-0';
const selectCls = `${inputCls} flex-shrink-0`;

/** The number-or-variable source select — one compact control for a row's top line. */
const OperandSourceSelect: React.FC<{
    operand: VNCalcOperand;
    onChange: (next: VNCalcOperand) => void;
    t: (key: string, fallback: string) => string;
}> = ({ operand, onChange, t }) => (
    <select
        value={operand.source}
        onChange={e => {
            const source = e.target.value as 'number' | 'variable';
            // Crossing number↔variable resets the other side's field so stale data never lingers.
            onChange(source === 'number' ? { source, value: 0 } : { source });
        }}
        className={selectCls}
    >
        <option value="number">{t('calc.aNumber', 'a number')}</option>
        <option value="variable">{t('calc.aVariable', 'a variable')}</option>
    </select>
);

/** The operand's VALUE control — gets a FULL-WIDTH line of its own, so a picked variable's
 *  name is always readable (sharing a line with the selects crushed it to nothing). */
const OperandValue: React.FC<{
    operand: VNCalcOperand;
    onChange: (next: VNCalcOperand) => void;
}> = ({ operand, onChange }) =>
    operand.source === 'number' ? (
        <input
            type="number"
            value={operand.value ?? 0}
            onChange={e => onChange({ ...operand, value: Number(e.target.value) })}
            className={`${inputCls} w-full`}
        />
    ) : (
        <VariablePicker
            value={(operand.variableId as any) ?? ''}
            onChange={id => onChange({ ...operand, variableId: id })}
            allowedTypes={['number']}
            allowCreate={false}
        />
    );

export const ValueCalcEditor: React.FC<{
    calc: VNValueCalc | undefined;
    onChange: (next: VNValueCalc) => void;
    project: VNProject;
}> = ({ calc: rawCalc, onChange, project }) => {
    const { t } = useTranslation('ui');
    const tr = (key: string, fallback: string) => t(key, fallback) as string;
    const calc = rawCalc ?? DEFAULT_CALC;

    const setFirst = (first: VNCalcOperand) => onChange({ ...calc, first });
    const setStep = (i: number, step: VNCalcStep) => onChange({ ...calc, steps: calc.steps.map((s, j) => (j === i ? step : s)) });
    const addStep = () => onChange({ ...calc, steps: [...calc.steps, { op: 'add', source: 'number', value: 1 }] });
    const removeStep = (i: number) => onChange({ ...calc, steps: calc.steps.filter((_, j) => j !== i) });

    const danglingVar = (o: VNCalcOperand): boolean =>
        o.source === 'variable' && (!o.variableId || !(project.variables as Record<string, VNVariable>)[o.variableId]);
    const warnings: string[] = [];
    if (calc.steps.some(s => s.op === 'divide' && s.source === 'number' && (s.value ?? 0) === 0)) {
        warnings.push(tr('calc.divZeroWarn', "Dividing by zero isn't possible — that step will be skipped."));
    }
    if (danglingVar(calc.first) || calc.steps.some(danglingVar)) {
        warnings.push(tr('calc.danglingWarn', "A step points at a variable that doesn't exist any more — it will be skipped."));
    }

    return (
        <div className="space-y-1.5">
            {/* Two-line rows: selects on top, the operand's value control full-width below —
                one line crushed the variable picker so far the picked name was unreadable and
                the remove button overlapped it. */}
            <div className="p-1.5 rounded-md border border-[var(--border-subtle)] space-y-1">
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">{tr('calc.startWith', 'Start with')}</span>
                    <OperandSourceSelect operand={calc.first} onChange={setFirst} t={tr} />
                </div>
                <OperandValue operand={calc.first} onChange={setFirst} />
            </div>

            {calc.steps.map((step, i) => (
                <div key={i} className="p-1.5 rounded-md border border-[var(--border-subtle)] space-y-1">
                    <div className="flex items-center gap-1.5">
                        <select
                            value={step.op}
                            onChange={e => setStep(i, { ...step, op: e.target.value as VNCalcOp })}
                            className={selectCls}
                        >
                            {OP_KEYS.map(o => <option key={o.op} value={o.op}>{tr(o.key, o.fallback)}</option>)}
                        </select>
                        {/* Replace the operand outright (keep only the op) so crossing
                            number↔variable never leaves a stale value/variableId behind. */}
                        <OperandSourceSelect operand={step} onChange={next => setStep(i, { op: step.op, ...next })} t={tr} />
                        <button onClick={() => removeStep(i)} className="ml-auto p-0.5 text-red-500 hover:text-red-400 flex-shrink-0"
                            title={tr('calc.removeStep', 'Remove this step')}>
                            <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <OperandValue operand={step} onChange={next => setStep(i, { ...step, ...next })} />
                </div>
            ))}

            <button onClick={addStep} className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-1">
                <PlusIcon className="w-4 h-4" />{tr('calc.addStep', 'Add a step')}
            </button>

            {calc.steps.length >= 1 && (
                <p className="text-[10px] text-[var(--text-muted)] italic">
                    {tr('calc.orderHint', "Worked out from top to bottom — times and divided by don't jump the queue.")}
                </p>
            )}

            <label className="block space-y-1 text-[10px] text-[var(--text-muted)]">
                <span>{tr('calc.round', 'Then round the answer')}</span>
                <select
                    value={calc.round ?? 'nearest'}
                    onChange={e => {
                        const round = e.target.value as NonNullable<VNValueCalc['round']>;
                        // 'nearest' is the default — leave the field off so the saved data stays lean.
                        const next = { ...calc };
                        if (round === 'nearest') delete (next as any).round; else next.round = round;
                        onChange(next);
                    }}
                    className={`${inputCls} w-full`}
                >
                    <option value="nearest">{tr('calc.roundNearest', 'To the nearest whole number')}</option>
                    <option value="none">{tr('calc.roundNone', 'Keep the decimals')}</option>
                    <option value="down">{tr('calc.roundDown', 'Always round down')}</option>
                    <option value="up">{tr('calc.roundUp', 'Always round up')}</option>
                </select>
            </label>

            {warnings.length > 0 && (
                <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/40 space-y-0.5">
                    {warnings.map((w, i) => <p key={i} className="text-[11px] text-amber-300">⚠ {w}</p>)}
                </div>
            )}
        </div>
    );
};

export default ValueCalcEditor;
