import { Linter } from "eslint"; // only types
// @ts-ignore import lib itself
import * as eslint from "/lib/eslint/eslint.js";
import { NoIdToStringInQuery } from "./no-id-tostring-in-query.js";

class EsLintWorker {
	private linter: Linter;

	constructor(private context: monaco.worker.IWorkerContext, private config: Linter.Config<Linter.RulesRecord>) {
		this.linter = new eslint.Linter();
		NoIdToStringInQuery.register(this.linter);
	}

	lint(fileName: string): Linter.LintMessage[] {
		const model = this.context.getMirrorModels().find(m => m.uri.toString() === fileName);
		if (!model)
			return [];
		return this.linter.verify(model.getValue(), this.config);
	}
}

interface ICreateData {
	config: Linter.Config<Linter.RulesRecord>;
}

export function create(context: monaco.worker.IWorkerContext, createData: ICreateData) {
	return new EsLintWorker(context, createData.config);
}