import { AsyncWorker } from "../async-worker.js";
import { Linter, LintDiagnostic, LintFix } from "./linter.js";

export class EsLint extends AsyncWorker implements Linter {
	private config: any;
	private editor: monaco.editor.IStandaloneCodeEditor | null = null;
	private currentFixes: Map<string, LintFix> = new Map();

	constructor(config: any) {
		super("worker/eslint-worker.js");
		this.config = config;
	}

	setEditor(editor: monaco.editor.IStandaloneCodeEditor) {
		this.editor = editor;
	}

	async lint(code: string): Promise<LintDiagnostic[] | null> {
		if (!this.editor)
			throw new Error("No editor set.");
		
		const result = await this.process({ code, config: this.config });
		if (!result.success)
			return null;
		
		const diagnostics: EsLintDiagnostic[] = result.data;
		if (diagnostics.length === 1 && diagnostics[0].fatal)
			return null;

		const lintDiagnostics = diagnostics.map(x => this.transformDiagnostic(x));
		this.saveCurrentFixes(lintDiagnostics);
		return lintDiagnostics;
	}

	getLanguage(): string {
		return "javascript";
	}

	providesCodeFixes(): boolean {
		return true;
	}

	provideCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, context: monaco.languages.CodeActionContext, token: monaco.CancellationToken): monaco.languages.CodeAction[] {
		// TODO undo/redo not working after applying a code action -> do we need to use a command? If yes, how?

		// const commandId = this.editor!.addCommand(0, (fix: LintFix) => {
		// 	console.log(fix);
		// 	model.applyEdits([{range}]);
		// }, "");
		const codeActions: monaco.languages.CodeAction[] = [];
		for (const marker of context.markers) {
			const key = this.computeKey(marker);
			if (!this.currentFixes.has(key))
				continue;
			const fix = this.currentFixes.get(key)!;
			codeActions.push({
				title: `Fix: ${marker.message}`,
				diagnostics: [marker],
				// command: {id: commandId, arguments: [d.fix], title: "Apply Fix"},
				edit: {
					edits: [{
						edits: [fix],
						resource: model.uri
					}],
				}
			});
		}
		return codeActions;
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

	private saveCurrentFixes(lintDiagnostics: LintDiagnostic[]) {
		this.currentFixes.clear();
		for (const diagnostic of lintDiagnostics)
			if (diagnostic.fix)
				this.currentFixes.set(this.computeKey(diagnostic.marker), diagnostic.fix);
	}

	private computeKey(marker: monaco.editor.IMarkerData): string {
		return `${marker.startLineNumber},${marker.startColumn},${marker.endLineNumber},${marker.endColumn},${marker.message}`;
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
	fatal?: boolean;
	fix?: EsLintFix;
}

interface EsLintFix {
	range: [number, number];
	text: string;
}