import { Linter } from "eslint"; // only types
// @ts-ignore Import lib itself
import * as eslint from "/lib/eslint/eslint.js";
import { NoIdToStringInQuery } from "./no-id-tostring-in-query.js";

type ExtendedRuleLevel = Linter.RuleLevel | "info" | "hint";

class EslintWorker {
	private linter: Linter;
	private eslintCompatibleConfig: Linter.Config<Linter.RulesRecord>;

	constructor(private config: Linter.Config<Linter.RulesRecord>) {
		this.eslintCompatibleConfig = this.createEsLintCompatibleConfig();
		this.linter = new eslint.Linter();
		NoIdToStringInQuery.register(this.linter);
	}

	lint(code: string): Linter.LintMessage[] {
		return this.linter.verify(code, this.eslintCompatibleConfig);
	}

	private createEsLintCompatibleConfig(): Linter.Config<Linter.RulesRecord> {
		let compatConfig = JSON.parse(JSON.stringify(this.config)) as Linter.Config<Linter.RulesRecord> | undefined;
		if (compatConfig === undefined)
			compatConfig = {};
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
}

interface ICreateData {
	config: Linter.Config<Linter.RulesRecord>;
}

export function create(context: monaco.worker.IWorkerContext, createData: ICreateData) {
	console.log(`Creating worker...`, context, createData);
	return new EslintWorker(createData.config);
}