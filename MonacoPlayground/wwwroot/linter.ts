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
	fix?: LintFix;
}

export enum LintSeverity {
	info,
	warning,
	error
}

export interface LintFix {
	range: Range;
	text: string;
}

export interface Range {
	start: number;
	end: number;
}