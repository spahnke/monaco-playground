export interface Linter {
	lint(code: string): Promise<LintDiagnostic[]>;
}

export interface LintDiagnostic {
	message: string;
	line: number;
	lineEnd?: number;
	column: number;
	columnEnd?: number;
	severity: LintSeverity;
}

export enum LintSeverity {
	info,
	warning,
	error
}