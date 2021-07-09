import { Linter, Rule } from "eslint";
import { DiagnosticsAdapter } from "../../common/diagnostics-adapter.js";
import { EsLintWorker } from "./worker/eslint-worker.js";

type ExtendedRuleLevel = Linter.RuleLevel | "info" | "hint";
type Fix = {
	description: string;
	textEdit: monaco.languages.TextEdit;
	autoFixAvailable: boolean;
};

class DiagnosticContainer {
	private diagnostics: Map<string, Linter.LintMessage[]> = new Map();

	get(resource: monaco.Uri): Linter.LintMessage[] {
		return this.diagnostics.get(resource.toString()) ?? [];
	}

	set(resource: monaco.Uri, diagnostics: Linter.LintMessage[]): void {
		this.diagnostics.set(resource.toString(), diagnostics);
	}
}

export class EsLintDiagnostics extends DiagnosticsAdapter implements monaco.languages.CodeActionProvider {

	/** Can contain rules with severity "info" or "hint" that aren't directly supported by ESLint. */
	private config: Linter.Config<Linter.RulesRecord> | undefined;
	private worker: monaco.editor.MonacoWebWorker<EsLintWorker> | undefined;
	private clientPromise: Promise<EsLintWorker> | undefined;
	private ruleToUrlMapping: Map<string, string> | undefined;
	private currentDiagnostics = new DiagnosticContainer();

	constructor(private configPath: string) {
		super("javascript", "eslint");
	}

	protected async doValidate(resource: monaco.Uri): Promise<void> {
		try {
			if (!monaco.editor.getModel(resource))
				return;

			await this.computeDiagnostics(resource);
			const model = monaco.editor.getModel(resource);
			if (!model) {
				// model was disposed in the meantime
				return;
			}

			monaco.editor.setModelMarkers(model, this.owner, this.currentDiagnostics.get(resource).map(d => this.toMarkerData(d)));
		} catch (e) {
			console.error(e);
		}
	}

	provideCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, context: monaco.languages.CodeActionContext, token: monaco.CancellationToken): monaco.languages.CodeActionList {
		const currentFixes = this.computeCurrentFixes(model);
		const codeActions: monaco.languages.CodeAction[] = [];
		for (const marker of context.markers) {
			const ruleId = this.getRuleId(marker);
			if (ruleId === undefined)
				continue;
			codeActions.push(...this.getFixCodeActions(model, range, ruleId, marker, currentFixes));
			codeActions.push(...this.getFixAllCodeActions(model, range, ruleId, marker, context.markers, currentFixes));
			codeActions.push(...this.getDisableRuleCodeActions(model, range, ruleId, marker));
		}
		return { actions: codeActions, dispose: () => { } };
	}

	private async computeDiagnostics(resource: monaco.Uri): Promise<void> {
		const client = await this.getEslintWorker();
		if (this.ruleToUrlMapping === undefined)
			this.ruleToUrlMapping = await client.getRuleToUrlMapping();
		this.currentDiagnostics.set(resource, await client.lint(resource.toString()));
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
			label: this.owner,
			createData: { config: this.createEsLintCompatibleConfig() }
		});
		this.register(this.worker);
		return this.worker.getProxy();
	}

	private getFixCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, ruleId: string, marker: monaco.editor.IMarkerData, currentFixes: Map<string, Fix[]>): monaco.languages.CodeAction[] {
		const fixes = currentFixes.get(ruleId)?.filter(fix => monaco.Range.areIntersectingOrTouching(range, fix.textEdit.range)) ?? [];
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

	private getFixAllCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, ruleId: string, marker: monaco.editor.IMarkerData, markers: monaco.editor.IMarkerData[], currentFixes: Map<string, Fix[]>): monaco.languages.CodeAction[] {
		const fixes = currentFixes.get(ruleId)?.filter(fix => fix.autoFixAvailable) ?? [];
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

	private getDisableRuleCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, ruleId: string, marker: monaco.editor.IMarkerData): monaco.languages.CodeAction[] {
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
		if (marker.source !== this.owner)
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

	private toMarkerData(diagnostic: Linter.LintMessage): monaco.editor.IMarkerData {
		return {
			message: diagnostic.message,
			startLineNumber: diagnostic.line,
			startColumn: diagnostic.column,
			endLineNumber: diagnostic.endLine ?? diagnostic.line,
			endColumn: diagnostic.endColumn ?? diagnostic.column,
			source: this.owner,
			severity: this.toSeverity(diagnostic),
			code: this.toCode(diagnostic),
			tags: diagnostic.ruleId === "no-unused-vars" ? [monaco.MarkerTag.Unnecessary] : []
		};
	}

	private toCode(diagnostic: Linter.LintMessage): string | { value: string; target: monaco.Uri; } {
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

	private toSeverity(diagnostic: Linter.LintMessage): monaco.MarkerSeverity {
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

	private computeCurrentFixes(model: monaco.editor.ITextModel): Map<string, Fix[]> {
		const currentFixes: Map<string, Fix[]> = new Map();
		for (const diagnostic of this.currentDiagnostics.get(model.uri)) {
			if (!diagnostic.ruleId)
				continue;

			let fixes = currentFixes.get(diagnostic.ruleId);
			if (fixes === undefined) {
				fixes = [];
				currentFixes.set(diagnostic.ruleId, fixes);
			}

			if (diagnostic.fix) {
				fixes.push({
					description: `Fix '${diagnostic.message}'`,
					textEdit: this.toTextEdit(model, diagnostic.fix),
					autoFixAvailable: true,
				});
			}
			if (diagnostic.suggestions) {
				for (const suggestion of diagnostic.suggestions) {
					fixes.push({
						description: suggestion.desc,
						textEdit: this.toTextEdit(model, suggestion.fix),
						autoFixAvailable: false,
					});
				}
			}
		}
		return currentFixes;
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