import { Linter, Rule } from "eslint";
import { DiagnosticsAdapter } from "../../common/diagnostics-adapter.js";

export type EsLintConfig = Linter.Config<Linter.RulesRecord> & {
	/**
	 * Optional paths to additional rule files, either absolute webserver paths, or relative to the worker directory.
	 * - The filename without the extension is the rule ID
	 * - The rule must be compiled as a standalone AMD module
	 * - The rule object must be the default export of the module
	 */
	ruleFiles?: string[];
};

type ExtendedRuleLevel = Linter.RuleLevel | "info" | "hint";
type Fix = {
	description: string;
	textEdit: monaco.languages.TextEdit;
	autoFixAvailable: boolean;
	range: monaco.IRange;
	severity: monaco.MarkerSeverity;
};

export interface IEsLintWorker {
	getRuleToUrlMapping(): Promise<Map<string, string>>;
	lint(fileName: string): Promise<Linter.LintMessage[]>;
}

export interface IWorkerCreateData {
	config: EsLintConfig;
}

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
		if (diagnostics.length > 0)
			this.diagnostics.set(resource.toString(), diagnostics);
		this.fixes.get(resource.toString())?.clear();
	}
}

export class EsLintDiagnostics extends DiagnosticsAdapter implements monaco.languages.CodeActionProvider {

	/** Can contain rules with severity "info" or "hint" that aren't directly supported by ESLint. */
	private config: EsLintConfig | undefined;
	private webWorker: monaco.editor.MonacoWebWorker<IEsLintWorker> | undefined;
	private readonly eslintWorker: Promise<IEsLintWorker>;
	private ruleToUrlMapping: Map<string, string> | undefined;
	private readonly diagnostics: DiagnosticContainer;

	constructor(configPath: string) {
		super("javascript", "eslint");
		this.diagnostics = new DiagnosticContainer();
		this.eslintWorker = this.createEslintWorker(configPath);
		this.startValidation();
	}

	protected async doValidate(resource: monaco.Uri): Promise<void> {
		try {
			const model = monaco.editor.getModel(resource);
			if (!model)
				return;

			await this.computeDiagnostics(resource);
			if (!model.isDisposed())
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
			codeActions.push(...this.getFixCodeActions(model, marker, ruleFixes));
			codeActions.push(...this.getFixAllCodeAction(model, marker, ruleId, ruleFixes));
			codeActions.push(...this.getDisableRuleCodeActions(model, marker, ruleId));
		}
		codeActions.push(...this.getFixAllAutoFixableCodeActions(model, [...fixes.values()].flat()));
		return { actions: codeActions, dispose: () => { } };
	}

	private async createEslintWorker(configPath: string): Promise<IEsLintWorker> {
		this.config = await fetch(configPath).then(r => r.json());
		this.webWorker = monaco.editor.createWebWorker<IEsLintWorker>({
			moduleId: "/worker/eslint-worker",
			label: this.owner,
			createData: { config: this.createEsLintCompatibleConfig() } as IWorkerCreateData
		});
		this.register(this.webWorker);

		const eslintWorker = await this.webWorker.getProxy();
		this.ruleToUrlMapping = await eslintWorker.getRuleToUrlMapping();
		return eslintWorker;
	}

	private async computeDiagnostics(resource: monaco.Uri): Promise<void> {
		const eslintWorker = await this.eslintWorker;
		await this.webWorker?.withSyncedResources([resource]);
		this.diagnostics.set(resource, await eslintWorker.lint(resource.toString()));
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

			const range = this.toRange(diagnostic);
			const severity = this.toSeverity(diagnostic);
			if (diagnostic.fix) {
				ruleFixes.push({
					description: `Fix this '${diagnostic.message}' problem`,
					textEdit: this.toTextEdit(model, diagnostic.fix),
					autoFixAvailable: true,
					range,
					severity,
				});
			}
			if (diagnostic.suggestions) {
				for (const suggestion of diagnostic.suggestions) {
					ruleFixes.push({
						description: suggestion.desc,
						textEdit: this.toTextEdit(model, suggestion.fix),
						autoFixAvailable: false,
						range,
						severity,
					});
				}
			}
		}
		return fixes;
	}

	private getFixCodeActions(model: monaco.editor.ITextModel, marker: monaco.editor.IMarkerData, fixes: Fix[]): monaco.languages.CodeAction[] {
		return fixes.filter(fix => monaco.Range.equalsRange(marker, fix.range)).map(fix => {
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

	private getFixAllCodeAction(model: monaco.editor.ITextModel, marker: monaco.editor.IMarkerData, ruleId: string, fixes: Fix[]): monaco.languages.CodeAction[] {
		const applicableFixes = fixes.filter(fix => fix.autoFixAvailable);
		if (applicableFixes.length === 0)
			return [];

		return [{
			title: `Fix all '${ruleId}' problems`,
			diagnostics: [marker],
			edit: {
				edits: applicableFixes.map(fix => {
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

	private getDisableRuleCodeActions(model: monaco.editor.ITextModel, marker: monaco.editor.IMarkerData, ruleId: string): monaco.languages.CodeAction[] {
		const line = Math.max(1, marker.startLineNumber);
		const lineText = model.getLineContent(line);
		const indentation = /^(?<whitespace>[ \t]*)/.exec(lineText)?.groups?.["whitespace"] ?? "";
		return [
			{
				title: `Disable rule '${ruleId}' on this line`,
				diagnostics: [marker],
				edit: {
					edits: [{
						edit: { range: new monaco.Range(line, 1, line, 1), text: `${indentation}// eslint-disable-next-line ${ruleId} -- <reason>${model.getEOL()}` },
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
						edit: { range: new monaco.Range(1, 1, 1, 1), text: `// eslint-disable ${ruleId} -- <reason>${model.getEOL()}` },
						resource: model.uri,
					}],
				},
				kind: "quickfix",
			}
		];
	}

	private getFixAllAutoFixableCodeActions(model: monaco.editor.ITextModel, fixes: Fix[]): monaco.languages.CodeAction[] {
		const edits: monaco.languages.WorkspaceTextEdit[] = [];
		for (const fix of fixes.filter(fix => fix.autoFixAvailable)) {
			if (fix.severity === monaco.MarkerSeverity.Hint)
				continue; // do not auto-fix "hint" level diagnostics in the global auto-fix
			if (edits.some(x => monaco.Range.areIntersecting(x.edit.range, fix.textEdit.range)))
				continue; // overlapping edits are not allowed
			edits.push({
				edit: fix.textEdit,
				resource: model.uri
			});
		}

		if (edits.length === 0)
			return [];

		return [
			{
				title: "Fix all auto-fixable problems",
				kind: "quickfix",
				edit: { edits }
			},
			{
				title: "Fix all ESLint auto-fixable problems",
				kind: "source.fixAll.eslint",
				edit: { edits }
			}
		];
	}

	/**
	 * Creates a new config where all "info" and "hint" level severities are replaced by "warn".
	 */
	private createEsLintCompatibleConfig(): EsLintConfig {
		const compatConfig = (JSON.parse(JSON.stringify(this.config)) ?? {}) as EsLintConfig;
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
			...this.toRange(diagnostic),
			source: this.owner,
			severity: this.toSeverity(diagnostic),
			code: this.toCode(diagnostic),
			tags: diagnostic.ruleId === "no-unused-vars" ? [monaco.MarkerTag.Unnecessary] : []
		};
	}

	private toRange(diagnostic: Linter.LintMessage): monaco.IRange {
		return {
			startLineNumber: diagnostic.line,
			startColumn: diagnostic.column,
			endLineNumber: diagnostic.endLine ?? diagnostic.line,
			endColumn: diagnostic.endColumn ?? diagnostic.column,
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