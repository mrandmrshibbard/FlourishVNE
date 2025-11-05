import type { ValidationRunnerResult, ValidationReport } from '../src/features/validation/types';
import type { ValidationProfile, ValidationProfileSceneScope } from '../src/types/validation';
import type { VNProject } from '../src/types/project';

export interface BuildValidationReportMeta {
    reportId?: string;
    runTimestamp?: string;
    durationMs?: number;
    projectId?: string | null;
    projectName?: string | null;
    profileId?: string | null;
    profileName?: string | null;
    profileScope?: ValidationProfileSceneScope | null;
}

export interface BuildValidationReportParams {
    project: VNProject | null | undefined;
    result: ValidationRunnerResult;
    profile?: ValidationProfile | null;
    meta?: BuildValidationReportMeta | null;
}

export declare function buildValidationReport(params: BuildValidationReportParams): ValidationReport;
export declare function createReportFileName(input?: { projectId?: string | null; runTimestamp?: string }): string;
export declare function deriveIssueCategory(code: string | null | undefined): string;
export declare function resolveRemediationTip(code: string | null | undefined): string;
