import { AsyncWorker } from "./async-worker.js";

export class Linter extends AsyncWorker {
	private config: any;

	constructor(config: any) {
		super("worker/linter.js");
		this.config = config;
	}

	lint(code: string): Promise<any> {
		return this.process({ code, config: this.config });
	}
}