import { VNID } from '../../types';

export type VNVariableType = 'string' | 'number' | 'boolean';
export type VNSetVariableOperator = 'set' | 'add' | 'subtract' | 'random';
export interface VNVariable {
    id: VNID;
    name: string;
    type: VNVariableType;
    defaultValue: string | number | boolean;
}
