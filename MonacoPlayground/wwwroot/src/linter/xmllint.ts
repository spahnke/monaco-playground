import { AsyncWorker } from "../async-worker.js";
import { Linter, LintDiagnostic } from "./linter.js";

export class XmlLint extends AsyncWorker implements Linter {
	private schema: string;
	private editor: monaco.editor.IStandaloneCodeEditor;

	constructor(schema: string, editor: monaco.editor.IStandaloneCodeEditor) {
		super("worker/xmllint-worker.js");
		this.schema = schema;
		this.editor = editor;
	}

	async lint(code: string): Promise<LintDiagnostic[] | null> {
		const result = await this.process({ code, schema: this.schema });
		if (!result.success)
			return null;

		const diagnostics: string[] = result.data.errors;
		console.log(diagnostics);

		return diagnostics.filter(this.isDiagnostic).map(x => this.transformDiagnostic(x));
	}

	getLanguage(): string {
		return "xml";
	}

	providesCodeFixes(): boolean {
		return false;
	}

	provideCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, context: monaco.languages.CodeActionContext, token: monaco.CancellationToken): monaco.languages.CodeAction[] {
		throw new Error("No code fixes available");
	}

	private isDiagnostic(diagnostic: string): boolean {
		return diagnostic.startsWith("file_");
	}

	private transformDiagnostic(diagnostic: string): LintDiagnostic {

		return {
			marker: this.createMarkerData(diagnostic)
		};
	}

	private createMarkerData(diagnostic: string): monaco.editor.IMarkerData {
		const regex = /.*?:(\d+):\s+(.*)$/;
		const match = regex.exec(diagnostic);
		if (match === null)
			throw new Error("Not supported diagnostic");
		const message = match[2];
		const line = Number(match[1]);
		const model = this.editor.getModel();
		if (model === null)
			throw new Error("Model must not be null.");
		const column = model.getLineMinColumn(line);
		const endColumn = model.getLineMaxColumn(line);

		return {
			message: message,
			startLineNumber: line,
			startColumn: column,
			endLineNumber: line,
			endColumn: endColumn,
			source: "XmlLint",
			severity: monaco.MarkerSeverity.Error,
		};
	}
}
