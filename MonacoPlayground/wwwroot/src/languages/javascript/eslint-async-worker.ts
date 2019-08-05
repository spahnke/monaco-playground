import { AsyncWorker } from "../../async-worker.js";

export class EslintAsyncWorker extends AsyncWorker {

	constructor(config: any) {
		super("worker/eslint-worker.js");
	}
}