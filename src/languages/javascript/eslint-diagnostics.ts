import { Linter, Rule } from "eslint";
import { DiagnosticsAdapter } from "../../common/diagnostics-adapter.js";
import { EslintConfig, EsLintWorker } from "../../worker/eslint/eslint-worker.js";

type ExtendedRuleLevel = Linter.RuleLevel | "info" | "hint";
type Fix = {
	description: string;
	textEdit: monaco.languages.TextEdit;
	autoFixAvailable: boolean;
};

class DiagnosticContainer {
	private diagnostics: Map<string, Linter.LintMessage[]> = new Map();
	private fixes: Map<string, Map<string, Fix[]>> = new Map();

	/** Returns the diagnostic messages for the model specified by `resource`. */
	get(resource: monaco.Uri): Linter.LintMessage[] {
		return this.diagnostics.get(resource.toString()) ?? [];
	}

	/** Returns a mapping of ruleId -> fixes for the model specified by `resource`. */
	getFixes(resource: monaco.Uri): Map<string, Fix[]> {
		let fixes = this.fixes.get(resource.toString());
		if (fixes === undefined) {
			fixes = new Map();
			this.fixes.set(resource.toString(), fixes);
		}
		return fixes;
	}

	/** Sets the diagnostics and clears previous fixes for the model specified by `resource`. */
	set(resource: monaco.Uri, diagnostics: Linter.LintMessage[]): void {
		this.diagnostics.set(resource.toString(), diagnostics);
		this.fixes.get(resource.toString())?.clear();
	}
}

export class EsLintDiagnostics extends DiagnosticsAdapter implements monaco.languages.CodeActionProvider {

	/** Can contain rules with severity "info" or "hint" that aren't directly supported by ESLint. */
	private config: EslintConfig | undefined;
	private webWorker: monaco.editor.MonacoWebWorker<EsLintWorker> | undefined;
	private eslintWorker: Promise<EsLintWorker> | undefined;
	private ruleToUrlMapping: Map<string, string> | undefined;
	private diagnostics = new DiagnosticContainer();

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

			monaco.editor.setModelMarkers(model, this.owner, this.diagnostics.get(resource).map(d => this.toMarkerData(d)));
		} catch (e) {
			console.error(e);
		}
	}

	provideCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, context: monaco.languages.CodeActionContext, token: monaco.CancellationToken): monaco.languages.CodeActionList {
		const codeActions: monaco.languages.CodeAction[] = [];
		const fixes = this.computeFixes(model, token);
		for (const marker of context.markers) {
			if (token.isCancellationRequested)
				break;

			const ruleId = this.getRuleId(marker);
			if (ruleId === undefined)
				continue;

			const ruleFixes = fixes.get(ruleId) ?? [];
			codeActions.push(...this.getFixCodeActions(model, range, marker, ruleFixes));
			codeActions.push(...this.getFixAllCodeActions(model, range, marker, context.markers.filter(m => this.getRuleId(m) === ruleId), ruleFixes.filter(fix => fix.autoFixAvailable)));
			codeActions.push(...this.getDisableRuleCodeActions(model, range, marker, ruleId));
		}
		const allAutoFixes = [...fixes.values()].flat().filter(fix => fix.autoFixAvailable);
		codeActions.push(...this.getFixAllAutoFixableCodeActions(model, allAutoFixes));
		return { actions: codeActions, dispose: () => { } };
	}

	private async computeDiagnostics(resource: monaco.Uri): Promise<void> {
		const eslint = await this.getEslintWorker();
		if (this.ruleToUrlMapping === undefined)
			this.ruleToUrlMapping = await eslint.getRuleToUrlMapping();
		this.diagnostics.set(resource, await eslint.lint(resource.toString()));
	}

	private computeFixes(model: monaco.editor.ITextModel, token: monaco.CancellationToken): Map<string, Fix[]> {
		const fixes = this.diagnostics.getFixes(model.uri);
		if (fixes.size > 0)
			return fixes;

		for (const diagnostic of this.diagnostics.get(model.uri)) {
			if (token.isCancellationRequested)
				break;

			if (!diagnostic.ruleId)
				continue;

			let ruleFixes = fixes.get(diagnostic.ruleId);
			if (ruleFixes === undefined) {
				ruleFixes = [];
				fixes.set(diagnostic.ruleId, ruleFixes);
			}

			if (diagnostic.fix) {
				ruleFixes.push({
					description: `Fix this '${diagnostic.message}' problem`,
					textEdit: this.toTextEdit(model, diagnostic.fix),
					autoFixAvailable: true,
				});
			}
			if (diagnostic.suggestions) {
				for (const suggestion of diagnostic.suggestions) {
					ruleFixes.push({
						description: suggestion.desc,
						textEdit: this.toTextEdit(model, suggestion.fix),
						autoFixAvailable: false,
					});
				}
			}
		}
		return fixes;
	}

	private getFixCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, marker: monaco.editor.IMarkerData, fixes: Fix[]): monaco.languages.CodeAction[] {
		return fixes.filter(fix => monaco.Range.areIntersectingOrTouching(range, fix.textEdit.range)).map(fix => {
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

	private getFixAllCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, marker: monaco.editor.IMarkerData, markers: monaco.editor.IMarkerData[], fixes: Fix[]): monaco.languages.CodeAction[] {
		if (fixes.length === 0)
			return [];

		return [{
			title: `Fix all '${marker.message}' problems`,
			diagnostics: markers,
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

	private getDisableRuleCodeActions(model: monaco.editor.ITextModel, range: monaco.Range, marker: monaco.editor.IMarkerData, ruleId: string): monaco.languages.CodeAction[] {
		const line = Math.max(1, range.startLineNumber);
		const lineText = model.getLineContent(line);
		const indentation = /^(?<whitespace>[ \t]*)/.exec(lineText)?.groups?.["whitespace"] ?? "";
		return [
			{
				title: `Disable rule '${ruleId}' on this line`,
				diagnostics: [marker],
				edit: {
					edits: [{
						edit: { range: new monaco.Range(line, 1, line, 1), text: `${indentation}/* eslint-disable-next-line ${ruleId} */${model.getEOL()}` },
						resource: model.uri,
					}],
				},
				kind: "quickfix",
			},
			{
				title: `Disable rule '${ruleId}'`,
				diagnostics: [marker],
				edit: {
					edits: [{
						edit: { range: new monaco.Range(1, 1, 1, 1), text: `/* eslint-disable ${ruleId} */${model.getEOL()}` },
						resource: model.uri,
					}],
				},
				kind: "quickfix",
			}
		];
	}

	private getFixAllAutoFixableCodeActions(model: monaco.editor.ITextModel, fixes: Fix[]): monaco.languages.CodeAction[] {
		if (fixes.length === 0)
			return [];

		const edit: monaco.languages.WorkspaceEdit = {
			edits: fixes.map(fix => {
				return {
					edit: fix.textEdit,
					resource: model.uri
				};
			})
		};

		return [
			{
				title: "Fix all auto-fixable problems",
				kind: "quickfix",
				edit
			},
			{
				title: "Fix all ESLint auto-fixable problems",
				kind: "source.fixAll.eslint",
				edit
			}
		];
	}

	private async createEslintWorker(): Promise<EsLintWorker> {
		this.config = await fetch(this.configPath).then(r => r.json());
		this.webWorker = monaco.editor.createWebWorker<EsLintWorker>({
			moduleId: "/worker/eslint-worker",
			label: this.owner,
			createData: { config: this.createEsLintCompatibleConfig() }
		});
		this.register(this.webWorker);
		return this.webWorker.getProxy();
	}

	private getEslintWorker(): Promise<EsLintWorker> {
		if (this.eslintWorker === undefined)
			this.eslintWorker = this.createEslintWorker(); // don't await here, otherwise race conditions can occur!
		// always sync models
		return this.eslintWorker.then(() => this.webWorker!.withSyncedResources(monaco.editor.getModels().filter(m => m.getModeId() === this.languageId).map(m => m.uri)));
	}

	/**
	 * Creates a new config where all "info" and "hint" level severities are replaced by "warn".
	 */
	private createEsLintCompatibleConfig(): EslintConfig {
		const compatConfig = (JSON.parse(JSON.stringify(this.config)) ?? {}) as EslintConfig;
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

	private getRuleId(marker: monaco.editor.IMarkerData): string | undefined {
		if (marker.source !== this.owner)
			return undefined;
		return typeof marker.code === "string" ? marker.code : marker.code?.value;
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

	private toSeverity(diagnostic: Linter.LintMessage): monaco.MarkerSeverity {
		if (diagnostic.severity === 2)
			return monaco.MarkerSeverity.Error;
		if (diagnostic.severity === 1 && this.isInfoOrHint(diagnostic, "info"))
			return monaco.MarkerSeverity.Info;
		if (diagnostic.severity === 1 && this.isInfoOrHint(diagnostic, "hint"))
			return monaco.MarkerSeverity.Hint;
		return monaco.MarkerSeverity.Warning;
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