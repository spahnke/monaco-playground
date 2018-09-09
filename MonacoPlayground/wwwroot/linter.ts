export interface Linter {
	lint(code: string): Promise<LintDiagnostic[]>;
}

export interface LintDiagnostic {
	marker: monaco.editor.IMarkerData;
	fix?: LintFix;
}

export interface LintFix {
	range: monaco.IRange;
	text: string;
}