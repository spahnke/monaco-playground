import { AsyncWorker } from "../../async-worker.js";
import { DiagnosticsAdapter } from "../diagnostics-adapter.js";

export class EsLintDiagnostics extends DiagnosticsAdapter implements monaco.languages.CodeActionProvider {

	private configPath: string;
	private config: { [key: string]: any } | undefined;
	private worker: AsyncWorker;
	private currentFixes: Map<string, monaco.languages.TextEdit> = new Map();

	constructor(configPath: string) {
		super("javascript", "ESLint");
		this.configPath = configPath;
		this.worker = new AsyncWorker("worker/eslint-worker.js");
		this.disposables.push(this.worker);
	}

	protected async doValidate(resource: monaco.Uri): Promise<void> {
		try {
			const model = monaco.editor.getModel(resource);
			if (!this.worker || !model) {
				return;
			}
			monaco.editor.setModelMarkers(model, this.owner, await this.getDiagnostics(model));
		} catch (e) {
			console.error(e);
		}
	}

	provideCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, context: monaco.languages.CodeActionContext, token: monaco.CancellationToken): monaco.languages.CodeAction[] {
		// TODO undo/redo not working after applying a code action -> do we need to use a command? If yes, how?
		const codeActions: monaco.languages.CodeAction[] = [];
		for (const marker of context.markers) {
			const code = this.computeCode(marker);
			if (!this.currentFixes.has(code))
				continue;
			const fix = this.currentFixes.get(code)!;
			codeActions.push({
				title: `Fix: ${marker.message}`,
				diagnostics: [marker],
				edit: {
					edits: [{
						edits: [fix],
						resource: model.uri,
					}],
				},
				kind: "quickfix"
			});
		}
		return codeActions;
	}

	private async getDiagnostics(model: monaco.editor.ITextModel): Promise<monaco.editor.IMarkerData[]> {
		if (this.config === undefined) {
			this.config = await fetch(this.configPath).then(r => r.json());
		}

		const result = await this.worker.process({ code: model.getValue(), config: this.config });
		if (!result.success)
			return [];

		const lintDiagnostics: EsLintDiagnostic[] = result.data;
		if (lintDiagnostics.length === 1 && lintDiagnostics[0].fatal)
			return [];

		this.currentFixes.clear();
		return lintDiagnostics.map(x => this.createMarkerData(model, x));
	}

	private createMarkerData(model: monaco.editor.ITextModel, diagnostic: EsLintDiagnostic): monaco.editor.IMarkerData {
		const marker: monaco.editor.IMarkerData = {
			message: diagnostic.message,
			startLineNumber: diagnostic.line,
			startColumn: diagnostic.column,
			endLineNumber: diagnostic.endLine || diagnostic.line,
			endColumn: diagnostic.endColumn || diagnostic.column,
			source: "ESLint",
			severity: this.transformSeverity(diagnostic),
		};
		if (diagnostic.fix)
			this.registerFix(model, diagnostic.fix, marker);
		return marker;
	}

	private transformSeverity(diagnostic: EsLintDiagnostic): monaco.MarkerSeverity {
		// TODO handle special cases that should be Information/Hints?
		if (diagnostic.severity === 2)
			return monaco.MarkerSeverity.Error;
		if (diagnostic.severity === 1)
			return monaco.MarkerSeverity.Warning;
		return monaco.MarkerSeverity.Info;
	}

	private registerFix(model: monaco.editor.ITextModel, fix: EsLintFix, marker: monaco.editor.IMarkerData): void {
		const start = model.getPositionAt(fix.range[0]);
		const end = model.getPositionAt(fix.range[1]);
		const textEdit: monaco.languages.TextEdit = {
			range: monaco.Range.fromPositions(start, end),
			text: fix.text
		};
		this.currentFixes.set(this.computeCode(marker), textEdit);
	}

	private computeCode(marker: monaco.editor.IMarkerData): string {
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
