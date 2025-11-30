import { Linter, Rule } from "eslint";
import { EsLintConfig, IEsLintWorker, IWorkerCreateData } from "../../languages/javascript/eslint-diagnostics.js";

// ================== Workaround for deprecated AMD builds
// See files src/language/typescript/ts.worker.ts and src/common/initialize.ts in https://github.com/microsoft/monaco-editor/pull/4950
import { start } from "../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.start.js";

self.onmessage = (e) => {
	// ignore the first message
	initialize((ctx: monaco.worker.IWorkerContext, createData: IWorkerCreateData) => {
		return create(ctx, createData);
	});
};

let initialized = false;

export function isWorkerInitialized(): boolean {
	return initialized;
}

export function initialize(callback: (ctx: any, createData: any) => any): void {
	initialized = true;
	self.onmessage = (m) => {
		start((ctx: any) => {
			return callback(ctx, m.data);
		});
	};
}

// If we don't have AMD modules anymore that load ESLint itself, it will inject itself into the global namespace.
declare const eslint: {
	Linter: typeof import("eslint").Linter;
};
// ==================

class EsLintWorker implements IEsLintWorker {
	private linter: Promise<Linter>;

	constructor(private context: monaco.worker.IWorkerContext, private config: EsLintConfig) {
		this.linter = this.createLinter();
	}

	async lint(fileName: string): Promise<Linter.LintMessage[]> {
		const linter = await this.linter;
		const model = this.context.getMirrorModels().find(m => m.uri.toString() === fileName);
		if (model === undefined)
			return [];
		return linter.verify(model.getValue(), [this.config]);
	}

	async getVersion(): Promise<string> {
		const linter = await this.linter;
		return linter.version;
	}

	private async createLinter(): Promise<Linter> {
		// NOTE Using a variable a) avoid TS errors because this module only exists at runtime and b) to prevent any
		// bundler from trying to inline import the file here.
		const eslintScript = "./eslint.js";
		await import(eslintScript);
		const linter = new eslint.Linter();
		await this.loadRules();
		return linter;
	}

	private async loadRules() {
		if (this.config.ruleFiles === undefined)
			return;
		if (!Array.isArray(this.config.ruleFiles)) {
			console.warn(`[ESLint] Config element 'ruleFiles' is not an array. No additional rules loaded.`);
			delete this.config.ruleFiles; // delete to pass validation
			return;
		}

		if (this.config.ruleFiles.length > 0) {
			this.config.plugins ??= {};
			this.config.plugins.local ??= {};
			this.config.plugins.local.rules ??= {};
		}

		for (const ruleFile of this.config.ruleFiles) {
			try {
				const id = /(?<id>[a-z0-9\-_]+)\.js$/i.exec(ruleFile)?.groups?.["id"];
				if (id === undefined)
					throw new Error("Could not extract rule ID from file name.");

				const rule: Rule.RuleModule = (await import(ruleFile)).default;
				if (typeof rule.create !== "function")
					throw new Error(`The rule '${id}' does not define a 'create' method.`);

				this.config.plugins!.local.rules![id] = rule;
			} catch (e: any) {
				console.warn(`[ESLint] Could not load additional rule module '${ruleFile}': ${e.message}`);
			}
		}
		delete this.config.ruleFiles; // delete to pass validation
	}
}

export function create(context: monaco.worker.IWorkerContext, createData: IWorkerCreateData): EsLintWorker {
	return new EsLintWorker(context, createData.config);
}