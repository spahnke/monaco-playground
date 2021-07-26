import { Linter, Rule } from "eslint";
import { EslintConfig, IEsLintWorker, IWorkerCreateData } from "../../languages/javascript/eslint-diagnostics.js";
import "./eslint.js";

declare namespace eslint {
	export const Linter: typeof import("eslint").Linter;
}

class EsLintWorker implements IEsLintWorker {
	private linter: Linter;
	private rulesLoaded: Promise<void>;

	constructor(private context: monaco.worker.IWorkerContext, private config: EslintConfig) {
		this.linter = new eslint.Linter();
		this.rulesLoaded = this.loadRules();
	}

	async getRuleToUrlMapping(): Promise<Map<string, string>> {
		await this.rulesLoaded;
		const ruleToUrlMapping = new Map<string, string>();
		for (const [ruleId, ruleData] of this.linter.getRules()) {
			const url = ruleData.meta?.docs?.url;
			if (url)
				ruleToUrlMapping.set(ruleId, url);
		}
		return ruleToUrlMapping;
	}

	async lint(fileName: string): Promise<Linter.LintMessage[]> {
		await this.rulesLoaded;
		const model = this.context.getMirrorModels().find(m => m.uri.toString() === fileName);
		if (model === undefined)
			return [];
		return this.linter.verify(model.getValue(), this.config);
	}

	private async loadRules() {
		if (this.config.ruleFiles === undefined)
			return;
		if (!Array.isArray(this.config.ruleFiles)) {
			console.warn(`[ESLint] Config element 'ruleFiles' is not an array. No additional rules loaded.`);
			return;
		}

		for (const ruleFile of this.config.ruleFiles) {
			try {
				const id = /(?<id>[a-z0-9\-_]+)\.js$/i.exec(ruleFile)?.groups?.["id"];
				if (id === undefined)
					throw new Error("Could not extract rule ID from file name.");

				const rule: Rule.RuleModule = (await import(ruleFile)).default;
				if (!rule.create)
					throw new Error(`The rule '${id}' does not define a 'create' method.`);

				this.linter.defineRule(id, rule);
			} catch (e: any) {
				console.warn(`[ESLint] Could not load additional rule module '${ruleFile}': ${e.message}`);
			}
		}
	}
}

export function create(context: monaco.worker.IWorkerContext, createData: IWorkerCreateData): EsLintWorker {
	return new EsLintWorker(context, createData.config);
}