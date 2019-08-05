import { AsyncWorker } from "../../async-worker.js";

export class EslintAsyncWorker extends AsyncWorker {

	constructor() {
		super("worker/eslint-worker.js");
	}
}