import { AsyncWorker } from "../async-worker.js";
import { Linter, LintDiagnostic, LintFix } from "./linter.js";

export class EsLint extends AsyncWorker implements Linter {
	private config: any;
	private editor: monaco.editor.ICodeEditor | null = null;

	constructor(config: any) {
		super("worker/eslint-worker.js");
		this.config = config;
	}

	setEditor(editor: monaco.editor.ICodeEditor) {
		this.editor = editor;
	}

	async lint(code: string): Promise<LintDiagnostic[] | null> {
		if (!this.editor)
			throw new Error("No editor set.");
		
		const result = await this.process({ code, config: this.config });
		if (!result.success)
			return null;
		return result.data.map((x: EsLintDiagnostic) => this.transformDiagnostic(x));
	}

	getLanguage(): string {
		return "javascript";
	}

	providesCodeFixes(): boolean {
		return true;
	}

	private transformDiagnostic(diagnostic: EsLintDiagnostic): LintDiagnostic {
		return {
			marker: this.createMarkerData(diagnostic),
			fix: diagnostic.fix ? this.transformFix(diagnostic.fix) : undefined
		};
	}

	private createMarkerData(diagnostic: EsLintDiagnostic): monaco.editor.IMarkerData {
		return {
			message: diagnostic.message,
			startLineNumber: diagnostic.line,
			startColumn: diagnostic.column,
			endLineNumber: diagnostic.endLine || diagnostic.line,
			endColumn: diagnostic.endColumn || diagnostic.column,
			source: "ESLint",
			severity: this.transformSeverity(diagnostic),
		};
	}

	private transformSeverity(diagnostic: EsLintDiagnostic): monaco.MarkerSeverity {
		// TODO handle special cases that should be Information/Hints?
		if (diagnostic.severity === 2)
			return monaco.MarkerSeverity.Error;
		if (diagnostic.severity === 1)
			return monaco.MarkerSeverity.Warning;
		return monaco.MarkerSeverity.Info;
	}

	private transformFix(fix: EsLintFix): LintFix {
		const start = this.editor!.getModel().getPositionAt(fix.range[0]);
		const end = this.editor!.getModel().getPositionAt(fix.range[1]);
		return {
			range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
			text: fix.text
		};
	}
}

interface EsLintDiagnostic {
	column: number;
	endColumn?: number;
	endLine?: number;
	line: number;
	message: string;
	nodeType: string;
	ruleId: string;
	severity: number;
	fix?: EsLintFix;
}

interface EsLintFix {
	range: [number, number];
	text: string;
}