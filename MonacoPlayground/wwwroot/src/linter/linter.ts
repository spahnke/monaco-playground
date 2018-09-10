export interface Linter extends monaco.languages.CodeActionProvider {
	lint(code: string): Promise<LintDiagnostic[] | null>;
	getLanguage(): string;
	providesCodeFixes(): boolean;
}

export interface LintDiagnostic {
	marker: monaco.editor.IMarkerData;
	fix?: LintFix;
}

export interface LintFix {
	range: monaco.IRange;
	text: string;
}