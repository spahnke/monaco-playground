import { Linter, Rule } from "eslint";
import { EsLintConfig, IEsLintWorker, IWorkerCreateData } from "../../languages/javascript/eslint-diagnostics.js";

class EsLintWorker implements IEsLintWorker {
	private linter: Promise<Linter>;

	constructor(private context: monaco.worker.IWorkerContext, private config: EsLintConfig) {
		this.linter = this.createLinter();
	}

	async getRuleToUrlMapping(): Promise<Map<string, string>> {
		const linter = await this.linter;
		const ruleToUrlMapping = new Map<string, string>();
		for (const [ruleId, ruleData] of linter.getRules()) {
			const url = ruleData.meta?.docs?.url;
			if (url)
				ruleToUrlMapping.set(ruleId, url);
		}
		return ruleToUrlMapping;
	}

	async lint(fileName: string): Promise<Linter.LintMessage[]> {
		const linter = await this.linter;
		const model = this.context.getMirrorModels().find(m => m.uri.toString() === fileName);
		if (model === undefined)
			return [];
		return linter.verify(model.getValue(), this.config);
	}

	private async createLinter(): Promise<Linter> {
		const eslint = await import("./eslint.js");
		const linter = new eslint.Linter();
		await this.loadRules(linter);
		return linter;
	}

	private async loadRules(linter: Linter) {
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
				if (typeof rule.create !== "function")
					throw new Error(`The rule '${id}' does not define a 'create' method.`);

				linter.defineRule(id, rule);
			} catch (e: any) {
				console.warn(`[ESLint] Could not load additional rule module '${ruleFile}': ${e.message}`);
			}
		}
	}
}

export function create(context: monaco.worker.IWorkerContext, createData: IWorkerCreateData): EsLintWorker {
	return new EsLintWorker(context, createData.config);
}