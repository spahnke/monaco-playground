import { AsyncWorker } from "../../async-worker.js";
import { DiagnosticsAdapter } from "../diagnostics-adapter.js";

export class EsLintDiagnostics extends DiagnosticsAdapter implements monaco.languages.CodeActionProvider {

	private configPath: string;
	/** Can contain rules with severity "info" that isn't directly supported by ESLint. */
	private config: { [key: string]: any } | undefined;
	/** Config where all rules with severity "info" are replaced by "warn". */
	private eslintCompatibleConfig: { [key: string]: any } | undefined;
	private worker: AsyncWorker;
	private currentFixes: Map<string, monaco.languages.TextEdit[]> = new Map();

	constructor(configPath: string) {
		super("javascript", "ESLint");
		this.configPath = configPath;
		this.worker = new AsyncWorker("worker/eslint-worker.js");
		this.disposables.push(this.worker);
	}

	protected async doValidate(resource: monaco.Uri): Promise<void> {
		try {
			if (!this.worker || !monaco.editor.getModel(resource)) {
				return;
			}

			const markers = await this.getDiagnostics(resource);
			if (!monaco.editor.getModel(resource)) {
				// model was disposed in the meantime
				return;
			}

			monaco.editor.setModelMarkers(monaco.editor.getModel(resource)!, this.owner, markers);
		} catch (e) {
			console.error(e);
		}
	}

	provideCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, context: monaco.languages.CodeActionContext, token: monaco.CancellationToken): monaco.languages.CodeActionList {
		const codeActions: monaco.languages.CodeAction[] = [];
		for (const marker of context.markers) {
			codeActions.push(...this.getFixCodeActions(model, range, marker));
			codeActions.push(...this.getFixAllCodeActions(model, range, marker, context.markers));
			codeActions.push(...this.getDisableRuleCodeActions(model, range, marker));
		}
		return { actions: codeActions, dispose: () => { } };
	}

	private async getDiagnostics(resource: monaco.Uri): Promise<monaco.editor.IMarkerData[]> {
		if (this.config === undefined) {
			this.config = await fetch(this.configPath).then(r => r.json());
			this.createEsLintCompatibleConfig();
		}
		if (!monaco.editor.getModel(resource)) {
			// model was disposed in the meantime
			return [];
		}

		const result = await this.worker.process({ code: monaco.editor.getModel(resource)!.getValue(), config: this.eslintCompatibleConfig });
		if (!result.success)
			return [];

		const lintDiagnostics: EsLintDiagnostic[] = result.data;
		if (lintDiagnostics.length === 1 && lintDiagnostics[0].fatal)
			return [this.transformDiagnostic(lintDiagnostics[0])];

		if (!monaco.editor.getModel(resource)) {
			// model was disposed in the meantime
			return [];
		}

		this.currentFixes.clear();
		return lintDiagnostics.map(x => this.createMarkerData(monaco.editor.getModel(resource)!, x));
	}

	private getFixCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, marker: monaco.editor.IMarkerData): monaco.languages.CodeAction[] {
		if (marker.code === undefined || !this.currentFixes.has(marker.code))
			return [];

		const edits = this.currentFixes.get(marker.code)!.filter(edit => monaco.Range.areIntersectingOrTouching(range, edit.range));
		return edits.map(edit => {
			return {
				title: `Fix '${marker.message}'`,
				diagnostics: [marker],
				edit: {
					edits: [{
						edits: [edit],
						resource: model.uri,
					}],
				},
				isPreferred: true,
				kind: "quickfix",
			}
		});
	}

	private getFixAllCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, marker: monaco.editor.IMarkerData, markers: monaco.editor.IMarkerData[]): monaco.languages.CodeAction[] {
		if (marker.code === undefined || !this.currentFixes.has(marker.code))
			return [];

		return [
			{
				title: `Fix all '${marker.message}'`,
				diagnostics: markers.filter(x => x.code === marker.code),
				edit: {
					edits: [{
						edits: this.currentFixes.get(marker.code)!,
						resource: model.uri,
					}],
				},
				isPreferred: false,
				kind: "quickfix",
			}
		];
	}

	private getDisableRuleCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, marker: monaco.editor.IMarkerData): monaco.languages.CodeAction[] {
		const ruleId = marker.code;
		if (!ruleId)
			return [];

		return [
			{
				title: `Disable rule '${ruleId}'`,
				diagnostics: [marker],
				edit: {
					edits: [{
						edits: [{ range: new monaco.Range(1, 1, 1, 1), text: `/* eslint-disable ${ruleId} */${model.getEOL()}` }],
						resource: model.uri,
					}],
				},
				isPreferred: false,
				kind: "quickfix",
			}
		];
	}

	/**
	 * Creates a new config where all "info" level severities are replaced by "warn".
	 */
	private createEsLintCompatibleConfig() {
		this.eslintCompatibleConfig = JSON.parse(JSON.stringify(this.config));
		if (this.eslintCompatibleConfig === undefined)
			this.eslintCompatibleConfig = {};
		for (const ruleId in this.eslintCompatibleConfig.rules) {
			const rule: string | any[] | undefined = this.eslintCompatibleConfig.rules[ruleId];
			if (rule === undefined)
				continue;
			if (Array.isArray(rule) && rule[0] === "info")
				this.eslintCompatibleConfig.rules[ruleId][0] = "warn";
			if (rule === "info")
				this.eslintCompatibleConfig.rules[ruleId] = "warn";
		}
	}

	private createMarkerData(model: monaco.editor.ITextModel, diagnostic: EsLintDiagnostic): monaco.editor.IMarkerData {
		const marker = this.transformDiagnostic(diagnostic);
		if (diagnostic.fix)
			this.registerFix(model, diagnostic.fix, marker);
		return marker;
	}

	private transformDiagnostic(diagnostic: EsLintDiagnostic): monaco.editor.IMarkerData {
		return {
			message: diagnostic.message,
			startLineNumber: diagnostic.line,
			startColumn: diagnostic.column,
			endLineNumber: diagnostic.endLine || diagnostic.line,
			endColumn: diagnostic.endColumn || diagnostic.column,
			source: "ESLint",
			severity: this.transformSeverity(diagnostic),
			code: diagnostic.ruleId,
		};
	}

	private transformSeverity(diagnostic: EsLintDiagnostic): monaco.MarkerSeverity {
		if (diagnostic.severity === 2)
			return monaco.MarkerSeverity.Error;
		if (diagnostic.severity === 1)
			return this.isInfoSeverity(diagnostic) ? monaco.MarkerSeverity.Info : monaco.MarkerSeverity.Warning;
		return monaco.MarkerSeverity.Info;
	}

	/**
	 * Checks if a normally "warn" level diagnostic is really an "info" level diagnostic.
	 */
	private isInfoSeverity(diagnostic: EsLintDiagnostic): boolean {
		if (this.config === undefined)
			return false;
		if (diagnostic.severity !== 1)
			return false;
		return this.config.rules[diagnostic.ruleId]
			&& (this.config.rules[diagnostic.ruleId] === "info" || this.config.rules[diagnostic.ruleId][0] === "info");
	}

	private registerFix(model: monaco.editor.ITextModel, fix: EsLintFix, marker: monaco.editor.IMarkerData): void {
		if (marker.code === undefined)
			return;

		const start = model.getPositionAt(fix.range[0]);
		const end = model.getPositionAt(fix.range[1]);
		const textEdit: monaco.languages.TextEdit = {
			range: monaco.Range.fromPositions(start, end),
			text: fix.text
		};
		if (!this.currentFixes.has(marker.code))
			this.currentFixes.set(marker.code, [textEdit]);
		else
			this.currentFixes.get(marker.code)!.push(textEdit);
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
