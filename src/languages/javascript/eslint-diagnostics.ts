import { Linter, Rule } from "eslint";
import { DiagnosticsAdapter } from "../../common/diagnostics-adapter.js";
import { EsLintWorker } from "./worker/eslint-worker.js";

type ExtendedRuleLevel = Linter.RuleLevel | "info" | "hint";
type Fix = {
	description: string;
	textEdit: monaco.languages.TextEdit;
	autoFixAvailable: boolean;
};

const markerSource = "ESLint";

export class EsLintDiagnostics extends DiagnosticsAdapter implements monaco.languages.CodeActionProvider {

	/** Can contain rules with severity "info" or "hint" that aren't directly supported by ESLint. */
	private config: Linter.Config<Linter.RulesRecord> | undefined;
	private worker: monaco.editor.MonacoWebWorker<EsLintWorker> | undefined;
	private clientPromise: Promise<EsLintWorker> | undefined;
	private currentFixes: Map<string, Fix[]> = new Map();
	private ruleToUrlMapping: Map<string, string> | undefined;

	constructor(private configPath: string) {
		super("javascript", markerSource);
	}

	protected async doValidate(resource: monaco.Uri): Promise<void> {
		try {
			if (!monaco.editor.getModel(resource))
				return;

			const markers = await this.getDiagnostics(resource);
			const model = monaco.editor.getModel(resource);
			if (!model) {
				// model was disposed in the meantime
				return;
			}

			monaco.editor.setModelMarkers(model, this.owner, markers);
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
		const client = await this.getEslintWorker();
		const lintDiagnostics = await client.lint(resource.toString());
		if (lintDiagnostics.length === 1 && lintDiagnostics[0].fatal)
			return [this.transformDiagnostic(lintDiagnostics[0])];

		const model = monaco.editor.getModel(resource);
		if (!model) {
			// model was disposed in the meantime
			return [];
		}

		this.currentFixes.clear();
		if (this.ruleToUrlMapping === undefined)
			this.ruleToUrlMapping = await client.getRuleToUrlMapping();
		return lintDiagnostics.map(x => this.createMarkerData(model, x));
	}

	private getEslintWorker(): Promise<EsLintWorker> {
		if (this.clientPromise === undefined)
			this.clientPromise = this.createEslintWorker(); // don't await here, otherwise race conditions can occur!
		// always sync models
		return this.clientPromise.then(() => this.worker!.withSyncedResources(monaco.editor.getModels().filter(m => m.getModeId() === this.languageId).map(m => m.uri)));
	}

	private async createEslintWorker(): Promise<EsLintWorker> {
		this.config = await fetch(this.configPath).then(r => r.json());
		this.worker = monaco.editor.createWebWorker<EsLintWorker>({
			moduleId: "/worker/eslint-worker",
			label: markerSource,
			createData: { config: this.createEsLintCompatibleConfig() }
		});
		this.register(this.worker);
		return this.worker.getProxy();
	}

	private getFixCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, marker: monaco.editor.IMarkerData): monaco.languages.CodeAction[] {
		const ruleId = this.getRuleId(marker);
		if (ruleId === undefined || !this.currentFixes.has(ruleId))
			return [];

		const fixes = this.currentFixes.get(ruleId)!.filter(fix => monaco.Range.areIntersectingOrTouching(range, fix.textEdit.range));
		return fixes.map(fix => {
			return {
				title: fix.description,
				diagnostics: [marker],
				edit: {
					edits: [{
						edit: fix.textEdit,
						resource: model.uri,
					}],
				},
				isPreferred: fix.autoFixAvailable,
				kind: "quickfix",
			};
		});
	}

	private getFixAllCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, marker: monaco.editor.IMarkerData, markers: monaco.editor.IMarkerData[]): monaco.languages.CodeAction[] {
		const ruleId = this.getRuleId(marker);
		if (ruleId === undefined || !this.currentFixes.has(ruleId))
			return [];

		const fixes = this.currentFixes.get(ruleId)!.filter(fix => fix.autoFixAvailable);
		if (fixes.length === 0)
			return [];

		return [{
			title: `Fix all '${marker.message}'`,
			diagnostics: markers.filter(x => x.code === ruleId),
			edit: {
				edits: fixes.map(fix => {
					return {
						edit: fix.textEdit,
						resource: model.uri
					};
				}),
			},
			isPreferred: true,
			kind: "quickfix",
		}];
	}

	private getDisableRuleCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, marker: monaco.editor.IMarkerData): monaco.languages.CodeAction[] {
		const ruleId = this.getRuleId(marker);
		if (!ruleId)
			return [];

		return [
			{
				title: `Disable rule '${ruleId}'`,
				diagnostics: [marker],
				edit: {
					edits: [{
						edit: { range: new monaco.Range(1, 1, 1, 1), text: `/* eslint-disable ${ruleId} */${model.getEOL()}` },
						resource: model.uri,
					}],
				},
				isPreferred: false,
				kind: "quickfix",
			}
		];
	}

	private getRuleId(marker: monaco.editor.IMarkerData): string | undefined {
		if (marker.source !== markerSource)
			return undefined;
		return typeof marker.code === "string" ? marker.code : marker.code?.value;
	}

	/**
	 * Creates a new config where all "info" and "hint" level severities are replaced by "warn".
	 */
	private createEsLintCompatibleConfig(): Linter.Config<Linter.RulesRecord> {
		const compatConfig = (JSON.parse(JSON.stringify(this.config)) ?? {}) as Linter.Config<Linter.RulesRecord>;
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
			this.registerFixOrSuggestion(model, diagnostic.fix, marker);
		for (const suggestion of diagnostic.suggestions ?? [])
			this.registerFixOrSuggestion(model, suggestion, marker);
		return marker;
	}

	private transformDiagnostic(diagnostic: Linter.LintMessage): monaco.editor.IMarkerData {
		return {
			message: diagnostic.message,
			startLineNumber: diagnostic.line,
			startColumn: diagnostic.column,
			endLineNumber: diagnostic.endLine ?? diagnostic.line,
			endColumn: diagnostic.endColumn ?? diagnostic.column,
			source: markerSource,
			severity: this.transformSeverity(diagnostic),
			code: this.transformCode(diagnostic),
			tags: diagnostic.ruleId === "no-unused-vars" ? [monaco.MarkerTag.Unnecessary] : []
		};
	}

	private transformCode(diagnostic: Linter.LintMessage): string | { value: string; target: monaco.Uri; } {
		if (!diagnostic.ruleId)
			return "";
		const url = this.ruleToUrlMapping?.get(diagnostic.ruleId);
		if (!url)
			return diagnostic.ruleId;
		return {
			value: diagnostic.ruleId,
			target: monaco.Uri.parse(url)
		};
	}

	private transformSeverity(diagnostic: Linter.LintMessage): monaco.MarkerSeverity {
		if (diagnostic.severity === 2)
			return monaco.MarkerSeverity.Error;
		if (diagnostic.severity === 1 && this.isInfoOrHint(diagnostic, "info"))
			return monaco.MarkerSeverity.Info;
		if (diagnostic.severity === 1 && this.isInfoOrHint(diagnostic, "hint"))
			return monaco.MarkerSeverity.Hint;
		return monaco.MarkerSeverity.Warning;
	}

	/**
	 * Checks if a normally "warn" level diagnostic is really an "info" or "hint" level diagnostic.
	 */
	private isInfoOrHint(diagnostic: Linter.LintMessage, severity: "info" | "hint"): boolean {
		if (diagnostic.severity !== 1 || diagnostic.ruleId === null)
			return false;
		const rule = this.config?.rules?.[diagnostic.ruleId];
		if (rule === undefined)
			return false;
		if (Array.isArray(rule))
			return (rule[0] as ExtendedRuleLevel) === severity;
		return (rule as ExtendedRuleLevel) === severity;
	}

	private registerFixOrSuggestion(model: monaco.editor.ITextModel, fixOrSuggestion: Rule.Fix | Linter.LintSuggestion, marker: monaco.editor.IMarkerData): void {
		const ruleId = this.getRuleId(marker);
		if (ruleId === undefined)
			return;

		if (!this.currentFixes.has(ruleId))
			this.currentFixes.set(ruleId, []);
		this.currentFixes.get(ruleId)!.push(this.toFix(model, fixOrSuggestion, marker, ruleId));
	}

	private toFix(model: monaco.editor.ITextModel, fixOrSuggestion: Rule.Fix | Linter.LintSuggestion, marker: monaco.editor.IMarkerData, ruleId: string): Fix {
		// const isSuggestion = "desc" in fixOrSuggestion; // TODO use this when TS 4.4 is released
		if ("desc" in fixOrSuggestion) {
			return {
				description: fixOrSuggestion.desc,
				textEdit: this.toTextEdit(model, fixOrSuggestion.fix),
				autoFixAvailable: false,
			};
		} else {
			return {
				description: `Fix '${marker.message}'`,
				textEdit: this.toTextEdit(model, fixOrSuggestion),
				autoFixAvailable: true,
			};
		}
	}

	private toTextEdit(model: monaco.editor.ITextModel, fix: Rule.Fix): monaco.languages.TextEdit {
		const [startOffset, endOffset] = fix.range;
		const start = model.getPositionAt(startOffset);
		const end = model.getPositionAt(endOffset);
		return {
			range: monaco.Range.fromPositions(start, end),
			text: fix.text
		};
	}
}