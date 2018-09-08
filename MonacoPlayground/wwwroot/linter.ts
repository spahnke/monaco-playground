import { AsyncWorker } from "./async-worker";

export class Linter extends AsyncWorker {

	constructor() {
		super("worker/linter.js");
	}

	lint(code: string, config: any): Promise<any> {
		return this.process({ code, config });
	}
}