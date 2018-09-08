import { AsyncWorker } from "./async-worker.js";

export class EsLint extends AsyncWorker {
	private config: any;

	constructor(config: any) {
		super("worker/eslint.js");
		this.config = config;
	}

	lint(code: string): Promise<any> {
		return this.process({ code, config: this.config });
	}
}