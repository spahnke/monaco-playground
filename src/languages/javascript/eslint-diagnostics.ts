import { Linter, Rule } from "eslint"; // only types
import { DiagnosticsAdapter } from "../diagnostics-adapter.js";

interface IEsLintClient {
	lint(fileName: string): Promise<Linter.LintMessage[]>;
}

type ExtendedRuleLevel = Linter.RuleLevel | "info" | "hint";

const autoFixBlacklist = ["no-id-tostring-in-query"];

export class EsLintDiagnostics extends DiagnosticsAdapter implements monaco.languages.CodeActionProvider {

	/** Can contain rules with severity "info" that isn't directly supported by ESLint. */
	private config: Linter.Config<Linter.RulesRecord> | undefined;
	/** Config where all rules with severity "info" are replaced by "warn". */
	private worker: monaco.editor.MonacoWebWorker<IEsLintClient> | undefined;
	private client: IEsLintClient | undefined;
	private currentFixes: Map<string, monaco.languages.TextEdit[]> = new Map();

	constructor(private configPath: string) {
		super("javascript", "ESLint");
	}

	protected async doValidate(resource: monaco.Uri): Promise<void> {
		try {
			if (!monaco.editor.getModel(resource)) {
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
		const client = await this.createEslintClient();
		const lintDiagnostics = await client.lint(resource.toString());
		if (lintDiagnostics.length === 1 && lintDiagnostics[0].fatal)
			return [this.transformDiagnostic(lintDiagnostics[0])];

		if (!monaco.editor.getModel(resource)) {
			// model was disposed in the meantime
			return [];
		}

		this.currentFixes.clear();
		return lintDiagnostics.map(x => this.createMarkerData(monaco.editor.getModel(resource)!, x));
	}

	private async createEslintClient(): Promise<IEsLintClient> {
		if (this.client !== undefined)
			return this.client;

		this.config = await fetch(this.configPath).then(r => r.json());
		this.worker = monaco.editor.createWebWorker<IEsLintClient>({
			moduleId: "/worker/eslint-worker",
			label: "ESLint",
			createData: { config: this.createEsLintCompatibleConfig() }
		});
		this.disposables.push(this.worker);

		this.client = await this.worker.withSyncedResources(monaco.editor.getModels().filter(m => m.getModeId() === this.languageId).map(m => m.uri));
		return this.client;
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
				isPreferred: !autoFixBlacklist.includes(marker.code!),
				kind: "quickfix",
			}
		});
	}

	private getFixAllCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, marker: monaco.editor.IMarkerData, markers: monaco.editor.IMarkerData[]): monaco.languages.CodeAction[] {
		if (marker.code === undefined || !this.currentFixes.has(marker.code) || autoFixBlacklist.includes(marker.code))
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
	 * Creates a new config where all "info" and "hint" level severities are replaced by "warn".
	 */
	private createEsLintCompatibleConfig(): Linter.Config<Linter.RulesRecord> {
		const compatConfig = JSON.parse(JSON.stringify(this.config)) ?? {};
		for (const ruleId in compatConfig.rules) {
			const rule = compatConfig.rules[ruleId];
			if (rule === undefined)
				continue;
			if (Array.isArray(rule) && ((rule[0] as ExtendedRuleLevel) === "info" || (rule[0] as ExtendedRuleLevel) === "hint"))
				rule[0] = "warn";
			if ((rule as ExtendedRuleLevel) === "info" || (rule as ExtendedRuleLevel) === "hint")
				compatConfig.rules[ruleId] = "warn";
		}
		return compatConfig;
	}

	private createMarkerData(model: monaco.editor.ITextModel, diagnostic: Linter.LintMessage): monaco.editor.IMarkerData {
		const marker = this.transformDiagnostic(diagnostic);
		if (diagnostic.fix)
			this.registerFix(model, diagnostic.fix, marker);
		return marker;
	}

	private transformDiagnostic(diagnostic: Linter.LintMessage): monaco.editor.IMarkerData {
		return {
			message: diagnostic.message,
			startLineNumber: diagnostic.line,
			startColumn: diagnostic.column,
			endLineNumber: diagnostic.endLine ?? diagnostic.line,
			endColumn: diagnostic.endColumn ?? diagnostic.column,
			source: "ESLint",
			severity: this.transformSeverity(diagnostic),
			code: diagnostic.ruleId ?? undefined,
		};
	}

	private transformSeverity(diagnostic: Linter.LintMessage): monaco.MarkerSeverity {
		if (diagnostic.severity === 2)
			return monaco.MarkerSeverity.Error;
		if (diagnostic.severity === 1 && this.isInfoOrHint(diagnostic, "info"))
			return monaco.MarkerSeverity.Info;
		if (diagnostic.severity === 1 && this.isInfoOrHint(diagnostic, "hint"))
			return monaco.MarkerSeverity.Hint;
		if (diagnostic.severity === 1)
			return monaco.MarkerSeverity.Warning;
		return monaco.MarkerSeverity.Hint;
	}

	/**
	 * Checks if a normally "warn" level diagnostic is really an "info" or "hint" level diagnostic.
	 */
	private isInfoOrHint(diagnostic: Linter.LintMessage, severity: "info" | "hint"): boolean {
		if (this.config === undefined)
			return false;
		if (diagnostic.severity !== 1)
			return false;
		if (this.config.rules === undefined)
			return false;
		if (diagnostic.ruleId === null)
			return false;

		const rule = this.config.rules[diagnostic.ruleId]
		if (rule === undefined)
			return false;
		if (Array.isArray(rule))
			return (rule[0] as ExtendedRuleLevel) === severity
		return (rule as ExtendedRuleLevel) === severity;
	}

	private registerFix(model: monaco.editor.ITextModel, fix: Rule.Fix, marker: monaco.editor.IMarkerData): void {
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