import { Linter } from "eslint";
import "./eslint.js";
import { NoIdToStringInQuery } from "./no-id-tostring-in-query.js";

declare namespace eslint {
	interface LinterConstructor {
		new(): Linter;
	}

	export const Linter: LinterConstructor;
}

export class EsLintWorker {
	private linter: Linter;

	constructor(private context: monaco.worker.IWorkerContext, private config: Linter.Config<Linter.RulesRecord>) {
		this.linter = new eslint.Linter();
		NoIdToStringInQuery.register(this.linter);
	}

	async getRuleToUrlMapping(): Promise<Map<string, string>> {
		const ruleToUrlMapping = new Map<string, string>();
		for (const [ruleId, ruleData] of this.linter.getRules()) {
			const url = ruleData.meta?.docs?.url;
			if (url)
				ruleToUrlMapping.set(ruleId, url);
		}
		return ruleToUrlMapping;
	}

	async lint(fileName: string): Promise<Linter.LintMessage[]> {
		const model = this.context.getMirrorModels().find(m => m.uri.toString() === fileName);
		if (model === undefined)
			return [];
		return this.linter.verify(model.getValue(), this.config);
	}
}

interface ICreateData {
	config: Linter.Config<Linter.RulesRecord>;
}

export function create(context: monaco.worker.IWorkerContext, createData: ICreateData): EsLintWorker {
	return new EsLintWorker(context, createData.config);
}